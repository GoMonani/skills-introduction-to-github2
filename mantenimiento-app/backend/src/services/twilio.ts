import Twilio from 'twilio';
import { config } from '../config';
import { NotificationResult } from '../types';

interface QueuedMessage {
  id: string;
  to: string;
  message: string;
  channel: 'whatsapp' | 'sms';
  attempts: number;
  lastAttempt?: Date;
  createdAt: Date;
}

class TwilioService {
  private client: Twilio.Twilio | null = null;
  private messageQueue: QueuedMessage[] = [];
  private isProcessingQueue = false;
  private maxRetries = 3;

  private getClient(): Twilio.Twilio {
    if (!this.client) {
      this.client = Twilio(config.twilio.accountSid, config.twilio.authToken);
    }
    return this.client;
  }

  async sendWhatsApp(to: string, message: string): Promise<NotificationResult> {
    try {
      const client = this.getClient();

      // Normalize phone number
      const normalizedTo = this.normalizePhoneNumber(to);
      const whatsappTo = normalizedTo.startsWith('whatsapp:')
        ? normalizedTo
        : `whatsapp:${normalizedTo}`;

      const result = await client.messages.create({
        body: message,
        from: config.twilio.whatsappNumber,
        to: whatsappTo,
      });

      return {
        success: true,
        channel: 'whatsapp',
        messageId: result.sid,
      };
    } catch (error) {
      console.error('WhatsApp send error:', error);

      // Queue for retry
      this.queueMessage({
        id: `whatsapp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        to,
        message,
        channel: 'whatsapp',
        attempts: 1,
        lastAttempt: new Date(),
        createdAt: new Date(),
      });

      return {
        success: false,
        channel: 'whatsapp',
        error: 'No se pudo enviar. Se reintentará automáticamente.',
        queued: true,
      };
    }
  }

  async sendSMS(to: string, message: string): Promise<NotificationResult> {
    try {
      const client = this.getClient();

      // Normalize phone number
      const normalizedTo = this.normalizePhoneNumber(to);

      const result = await client.messages.create({
        body: message,
        from: config.twilio.phoneNumber,
        to: normalizedTo,
      });

      return {
        success: true,
        channel: 'sms',
        messageId: result.sid,
      };
    } catch (error) {
      console.error('SMS send error:', error);

      // Queue for retry
      this.queueMessage({
        id: `sms-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        to,
        message,
        channel: 'sms',
        attempts: 1,
        lastAttempt: new Date(),
        createdAt: new Date(),
      });

      return {
        success: false,
        channel: 'sms',
        error: 'No se pudo enviar. Se reintentará automáticamente.',
        queued: true,
      };
    }
  }

  async sendInvitation(
    to: string,
    channel: 'whatsapp' | 'sms',
    ticketCode: string,
    ticketTitle: string,
    inviterName: string
  ): Promise<NotificationResult> {
    const message = `Hola! ${inviterName} te ha agregado al trabajo de mantenimiento ${ticketCode}: "${ticketTitle}". Entra a la app para ver los detalles y colaborar.`;

    if (channel === 'whatsapp') {
      return this.sendWhatsApp(to, message);
    } else {
      return this.sendSMS(to, message);
    }
  }

  async sendReminder(
    to: string,
    channel: 'whatsapp' | 'sms',
    userName: string,
    commitment: string,
    dueDate: string
  ): Promise<NotificationResult> {
    const message = `Hola ${userName}! Recordatorio amigable: Tienes un compromiso pendiente: "${commitment}" con fecha límite ${dueDate}. ¿Cómo va el avance?`;

    if (channel === 'whatsapp') {
      return this.sendWhatsApp(to, message);
    } else {
      return this.sendSMS(to, message);
    }
  }

  async sendProgressUpdate(
    to: string,
    channel: 'whatsapp' | 'sms',
    ticketCode: string,
    progress: number,
    updatedBy: string
  ): Promise<NotificationResult> {
    const message = `Actualización del trabajo ${ticketCode}: ${updatedBy} reportó avance del ${progress}%. Entra a la app para más detalles.`;

    if (channel === 'whatsapp') {
      return this.sendWhatsApp(to, message);
    } else {
      return this.sendSMS(to, message);
    }
  }

  private queueMessage(message: QueuedMessage): void {
    this.messageQueue.push(message);
    this.scheduleQueueProcessing();
  }

  private scheduleQueueProcessing(): void {
    if (this.isProcessingQueue) return;

    setTimeout(() => this.processQueue(), 30000); // Process every 30 seconds
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) return;

    this.isProcessingQueue = true;

    const messagesToProcess = [...this.messageQueue];
    this.messageQueue = [];

    for (const msg of messagesToProcess) {
      if (msg.attempts >= this.maxRetries) {
        console.log(`Message ${msg.id} exceeded max retries, dropping`);
        continue;
      }

      try {
        let result: NotificationResult;

        if (msg.channel === 'whatsapp') {
          result = await this.sendWhatsAppDirect(msg.to, msg.message);
        } else {
          result = await this.sendSMSDirect(msg.to, msg.message);
        }

        if (!result.success) {
          // Re-queue with incremented attempts
          this.messageQueue.push({
            ...msg,
            attempts: msg.attempts + 1,
            lastAttempt: new Date(),
          });
        }
      } catch {
        // Re-queue with incremented attempts
        this.messageQueue.push({
          ...msg,
          attempts: msg.attempts + 1,
          lastAttempt: new Date(),
        });
      }
    }

    this.isProcessingQueue = false;

    if (this.messageQueue.length > 0) {
      this.scheduleQueueProcessing();
    }
  }

  private async sendWhatsAppDirect(to: string, message: string): Promise<NotificationResult> {
    const client = this.getClient();
    const normalizedTo = this.normalizePhoneNumber(to);
    const whatsappTo = normalizedTo.startsWith('whatsapp:')
      ? normalizedTo
      : `whatsapp:${normalizedTo}`;

    const result = await client.messages.create({
      body: message,
      from: config.twilio.whatsappNumber,
      to: whatsappTo,
    });

    return {
      success: true,
      channel: 'whatsapp',
      messageId: result.sid,
    };
  }

  private async sendSMSDirect(to: string, message: string): Promise<NotificationResult> {
    const client = this.getClient();
    const normalizedTo = this.normalizePhoneNumber(to);

    const result = await client.messages.create({
      body: message,
      from: config.twilio.phoneNumber,
      to: normalizedTo,
    });

    return {
      success: true,
      channel: 'sms',
      messageId: result.sid,
    };
  }

  private normalizePhoneNumber(phone: string): string {
    // Remove any whatsapp: prefix temporarily
    let cleaned = phone.replace(/^whatsapp:/, '');

    // Remove all non-digit characters except +
    cleaned = cleaned.replace(/[^\d+]/g, '');

    // Ensure it starts with +
    if (!cleaned.startsWith('+')) {
      // Assume Venezuela country code if not present
      if (cleaned.startsWith('0')) {
        cleaned = '+58' + cleaned.substring(1);
      } else if (!cleaned.startsWith('58')) {
        cleaned = '+58' + cleaned;
      } else {
        cleaned = '+' + cleaned;
      }
    }

    return cleaned;
  }

  getQueueStatus(): { pending: number; messages: QueuedMessage[] } {
    return {
      pending: this.messageQueue.length,
      messages: [...this.messageQueue],
    };
  }

  clearQueue(): void {
    this.messageQueue = [];
  }
}

export const twilioService = new TwilioService();

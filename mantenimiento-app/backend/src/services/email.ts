import nodemailer from 'nodemailer';
import { config } from '../config';
import { NotificationResult } from '../types';

interface QueuedEmail {
  id: string;
  to: string;
  subject: string;
  html: string;
  attempts: number;
  lastAttempt?: Date;
  createdAt: Date;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private emailQueue: QueuedEmail[] = [];
  private isProcessingQueue = false;
  private maxRetries = 3;

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass,
        },
      });
    }
    return this.transporter;
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string
  ): Promise<NotificationResult> {
    try {
      const transporter = this.getTransporter();

      await transporter.sendMail({
        from: config.smtp.from,
        to,
        subject,
        html,
      });

      return {
        success: true,
        channel: 'email',
      };
    } catch (error) {
      console.error('Email send error:', error);

      // Queue for retry
      this.queueEmail({
        id: `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        to,
        subject,
        html,
        attempts: 1,
        lastAttempt: new Date(),
        createdAt: new Date(),
      });

      return {
        success: false,
        channel: 'email',
        error: 'No se pudo enviar. Se reintentará automáticamente.',
        queued: true,
      };
    }
  }

  async sendInvitation(
    to: string,
    ticketCode: string,
    ticketTitle: string,
    inviterName: string
  ): Promise<NotificationResult> {
    const subject = `Te han agregado al trabajo ${ticketCode}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
          .footer { background: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }
          .ticket-code { background: #dbeafe; color: #1e40af; padding: 10px 20px; border-radius: 4px; display: inline-block; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Mantenimiento App</h1>
          </div>
          <div class="content">
            <h2>¡Hola!</h2>
            <p><strong>${inviterName}</strong> te ha agregado a un trabajo de mantenimiento:</p>
            <p class="ticket-code">${ticketCode}</p>
            <h3>${ticketTitle}</h3>
            <p>Entra a la aplicación para ver los detalles del trabajo y colaborar con el equipo.</p>
            <p>Si tienes preguntas, puedes responder a este correo o escribir en el chat del trabajo.</p>
          </div>
          <div class="footer">
            <p>Este es un mensaje automático de Mantenimiento App</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(to, subject, html);
  }

  async sendReminder(
    to: string,
    userName: string,
    commitment: string,
    dueDate: string,
    ticketCode: string
  ): Promise<NotificationResult> {
    const subject = `Recordatorio: Compromiso pendiente - ${ticketCode}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fffbeb; padding: 20px; border: 1px solid #fde68a; }
          .footer { background: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }
          .commitment-box { background: white; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; }
          .due-date { color: #d97706; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Recordatorio Amigable</h1>
          </div>
          <div class="content">
            <h2>Hola ${userName}!</h2>
            <p>Te escribimos para recordarte sobre un compromiso pendiente:</p>
            <div class="commitment-box">
              <p><strong>Compromiso:</strong> ${commitment}</p>
              <p class="due-date">Fecha límite: ${dueDate}</p>
              <p><strong>Trabajo:</strong> ${ticketCode}</p>
            </div>
            <p>¿Cómo va el avance? Entra a la aplicación para actualizar el progreso.</p>
          </div>
          <div class="footer">
            <p>Este es un mensaje automático de Mantenimiento App</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(to, subject, html);
  }

  async sendTicketUpdate(
    to: string,
    ticketCode: string,
    ticketTitle: string,
    updateType: 'progress' | 'message' | 'completed',
    updateDetails: string
  ): Promise<NotificationResult> {
    const typeLabels = {
      progress: 'Actualización de Progreso',
      message: 'Nuevo Mensaje',
      completed: 'Trabajo Completado',
    };

    const typeColors = {
      progress: '#3b82f6',
      message: '#8b5cf6',
      completed: '#22c55e',
    };

    const subject = `${typeLabels[updateType]} - ${ticketCode}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${typeColors[updateType]}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
          .footer { background: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }
          .update-box { background: white; border: 1px solid #e2e8f0; padding: 15px; margin: 15px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${typeLabels[updateType]}</h1>
          </div>
          <div class="content">
            <h2>${ticketCode}: ${ticketTitle}</h2>
            <div class="update-box">
              <p>${updateDetails}</p>
            </div>
            <p>Entra a la aplicación para ver todos los detalles.</p>
          </div>
          <div class="footer">
            <p>Este es un mensaje automático de Mantenimiento App</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(to, subject, html);
  }

  private queueEmail(email: QueuedEmail): void {
    this.emailQueue.push(email);
    this.scheduleQueueProcessing();
  }

  private scheduleQueueProcessing(): void {
    if (this.isProcessingQueue) return;

    setTimeout(() => this.processQueue(), 30000);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.emailQueue.length === 0) return;

    this.isProcessingQueue = true;

    const emailsToProcess = [...this.emailQueue];
    this.emailQueue = [];

    for (const email of emailsToProcess) {
      if (email.attempts >= this.maxRetries) {
        console.log(`Email ${email.id} exceeded max retries, dropping`);
        continue;
      }

      try {
        const transporter = this.getTransporter();

        await transporter.sendMail({
          from: config.smtp.from,
          to: email.to,
          subject: email.subject,
          html: email.html,
        });
      } catch {
        // Re-queue with incremented attempts
        this.emailQueue.push({
          ...email,
          attempts: email.attempts + 1,
          lastAttempt: new Date(),
        });
      }
    }

    this.isProcessingQueue = false;

    if (this.emailQueue.length > 0) {
      this.scheduleQueueProcessing();
    }
  }

  getQueueStatus(): { pending: number; emails: QueuedEmail[] } {
    return {
      pending: this.emailQueue.length,
      emails: [...this.emailQueue],
    };
  }

  clearQueue(): void {
    this.emailQueue = [];
  }
}

export const emailService = new EmailService();

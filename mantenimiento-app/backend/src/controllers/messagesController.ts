import { Request, Response } from 'express';
import { googleSheetsService } from '../services/googleSheets';
import { geminiAIService } from '../services/geminiAI';
import { twilioService } from '../services/twilio';
import { emailService } from '../services/email';
import { MessageCreateInput } from '../types';

export async function createMessage(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const input: MessageCreateInput = req.body;

    // Validate ticket exists and user has access
    const ticket = await googleSheetsService.getTicketById(input.ticketId);
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Trabajo no encontrado' });
      return;
    }

    const hasAccess =
      ticket.createdById === req.user.userId ||
      ticket.assignedToIds.includes(req.user.userId);

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: 'No tienes acceso a este trabajo',
      });
      return;
    }

    // Get sender info
    const sender = await googleSheetsService.getUserById(req.user.userId);
    if (!sender) {
      res.status(404).json({ success: false, error: 'Usuario no encontrado' });
      return;
    }

    // Create message (idempotent)
    const message = await googleSheetsService.createMessage(
      input,
      req.user.userId,
      sender.fullName
    );

    // Handle mentions
    if (input.mentionedUserIds && input.mentionedUserIds.length > 0) {
      for (const userId of input.mentionedUserIds) {
        if (userId === req.user.userId) continue;

        const mentionedUser = await googleSheetsService.getUserById(userId);
        if (mentionedUser) {
          const notificationMessage = `${sender.fullName} te mencionó en ${ticket.code}: "${input.content.substring(0, 100)}${input.content.length > 100 ? '...' : ''}"`;

          twilioService.sendWhatsApp(mentionedUser.phone, notificationMessage);
        }
      }
    }

    // Notify other participants (excluding sender and mentioned users)
    const notifiedIds = new Set([req.user.userId, ...(input.mentionedUserIds || [])]);
    const participantIds = [ticket.createdById, ...ticket.assignedToIds]
      .filter(id => !notifiedIds.has(id));

    for (const userId of participantIds) {
      const user = await googleSheetsService.getUserById(userId);
      if (user) {
        emailService.sendTicketUpdate(
          user.email,
          ticket.code,
          ticket.title,
          'message',
          `${sender.fullName}: ${input.content.substring(0, 200)}${input.content.length > 200 ? '...' : ''}`
        );
      }
    }

    // Update message status
    await googleSheetsService.updateMessageStatus(
      message.id,
      'sent',
      new Date().toISOString()
    );

    res.status(201).json({
      success: true,
      data: { ...message, status: 'sent' },
    });
  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo enviar el mensaje. Se guardó localmente.',
    });
  }
}

export async function getMessages(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { ticketId } = req.params;

    // Validate ticket exists and user has access
    const ticket = await googleSheetsService.getTicketById(ticketId);
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Trabajo no encontrado' });
      return;
    }

    const hasAccess =
      ticket.createdById === req.user.userId ||
      ticket.assignedToIds.includes(req.user.userId);

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: 'No tienes acceso a este trabajo',
      });
      return;
    }

    const messages = await googleSheetsService.getMessagesByTicketId(ticketId);

    // Sort by createdAt ascending
    messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudieron obtener los mensajes',
    });
  }
}

export async function rewriteWithTone(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { message, tone, recipientName } = req.body;

    if (!message || !tone) {
      res.status(400).json({
        success: false,
        error: 'Se requiere mensaje y tono',
      });
      return;
    }

    const rewritten = await geminiAIService.rewriteMessageWithTone(
      message,
      tone,
      recipientName
    );

    res.json({
      success: true,
      data: { original: message, rewritten },
    });
  } catch (error) {
    console.error('Rewrite message error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo reescribir el mensaje',
    });
  }
}

export async function transcribeVoice(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { audioBase64 } = req.body;

    if (!audioBase64) {
      res.status(400).json({
        success: false,
        error: 'Se requiere audio en base64',
      });
      return;
    }

    const transcription = await geminiAIService.transcribeVoiceToText(audioBase64);

    res.json({
      success: true,
      data: { transcription },
    });
  } catch (error) {
    console.error('Transcribe voice error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo transcribir el audio',
    });
  }
}

import { Request, Response } from 'express';
import { googleSheetsService } from '../services/googleSheets';
import { twilioService } from '../services/twilio';
import { emailService } from '../services/email';
import { CommitmentCreateInput } from '../types';

export async function createCommitment(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { ticketId } = req.params;
    const input: CommitmentCreateInput = {
      ...req.body,
      ticketId,
    };

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

    // Validate assignee exists and has access to ticket
    const assignee = await googleSheetsService.getUserById(input.assignedToId);
    if (!assignee) {
      res.status(404).json({
        success: false,
        error: 'Usuario asignado no encontrado',
      });
      return;
    }

    const assigneeHasAccess =
      ticket.createdById === input.assignedToId ||
      ticket.assignedToIds.includes(input.assignedToId);

    if (!assigneeHasAccess) {
      res.status(400).json({
        success: false,
        error: 'El usuario asignado no es parte de este trabajo',
      });
      return;
    }

    // Create commitment
    const commitment = await googleSheetsService.createCommitment(
      input,
      req.user.userId
    );

    // Notify assignee
    const creator = await googleSheetsService.getUserById(req.user.userId);
    if (creator && assignee.id !== creator.id) {
      const dueDate = new Date(input.dueDate).toLocaleDateString('es-VE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const message = `${creator.fullName} te asignó un compromiso en ${ticket.code}: "${input.description}". Fecha límite: ${dueDate}`;

      twilioService.sendWhatsApp(assignee.phone, message);
    }

    res.status(201).json({
      success: true,
      data: commitment,
      message: 'Compromiso creado exitosamente',
    });
  } catch (error) {
    console.error('Create commitment error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo crear el compromiso',
    });
  }
}

export async function getCommitments(req: Request, res: Response): Promise<void> {
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

    const commitments = await googleSheetsService.getCommitmentsByTicketId(ticketId);

    // Sort by dueDate ascending
    commitments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    res.json({
      success: true,
      data: commitments,
    });
  } catch (error) {
    console.error('Get commitments error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudieron obtener los compromisos',
    });
  }
}

export async function updateCommitment(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { commitmentId } = req.params;
    const updates = req.body;

    // Get all commitments to find this one
    const allCommitments = await googleSheetsService.getPendingCommitments();
    const commitment = allCommitments.find(c => c.id === commitmentId);

    if (!commitment) {
      res.status(404).json({
        success: false,
        error: 'Compromiso no encontrado',
      });
      return;
    }

    // Validate user is the assignee or creator
    if (
      commitment.assignedToId !== req.user.userId &&
      commitment.createdById !== req.user.userId
    ) {
      res.status(403).json({
        success: false,
        error: 'No tienes permiso para modificar este compromiso',
      });
      return;
    }

    // Update commitment
    const updatedCommitment = await googleSheetsService.updateCommitment(
      commitmentId,
      {
        ...updates,
        completedAt: updates.status === 'cumplido' ? new Date().toISOString() : undefined,
      }
    );

    // Notify if status changed to completed
    if (updates.status === 'cumplido' && commitment.status !== 'cumplido') {
      const ticket = await googleSheetsService.getTicketById(commitment.ticketId);
      const completer = await googleSheetsService.getUserById(req.user.userId);

      if (ticket && completer) {
        // Notify creator if different from completer
        if (commitment.createdById !== req.user.userId) {
          const creator = await googleSheetsService.getUserById(commitment.createdById);
          if (creator) {
            const message = `${completer.fullName} completó el compromiso: "${commitment.description}" en ${ticket.code}`;
            twilioService.sendWhatsApp(creator.phone, message);
          }
        }
      }
    }

    res.json({
      success: true,
      data: updatedCommitment,
      message: 'Compromiso actualizado',
    });
  } catch (error) {
    console.error('Update commitment error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo actualizar el compromiso',
    });
  }
}

export async function sendReminders(req: Request, res: Response): Promise<void> {
  try {
    // This would typically be called by a cron job
    const pendingCommitments = await googleSheetsService.getPendingCommitments();
    const now = new Date();
    const remindersSent: string[] = [];

    for (const commitment of pendingCommitments) {
      // Skip if reminder already sent
      if (commitment.reminderSent) continue;

      const dueDate = new Date(commitment.dueDate);
      const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Send reminder 24 hours before due date
      if (hoursUntilDue <= 24 && hoursUntilDue > 0) {
        const assignee = await googleSheetsService.getUserById(commitment.assignedToId);
        const ticket = await googleSheetsService.getTicketById(commitment.ticketId);

        if (assignee && ticket) {
          const dueDateFormatted = dueDate.toLocaleDateString('es-VE', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });

          // Send via WhatsApp
          await twilioService.sendReminder(
            assignee.phone,
            'whatsapp',
            assignee.fullName.split(' ')[0],
            commitment.description,
            dueDateFormatted
          );

          // Send via email
          await emailService.sendReminder(
            assignee.email,
            assignee.fullName.split(' ')[0],
            commitment.description,
            dueDateFormatted,
            ticket.code
          );

          // Mark as reminder sent
          await googleSheetsService.updateCommitment(commitment.id, {
            reminderSent: true,
          });

          remindersSent.push(commitment.id);
        }
      }

      // Mark overdue commitments
      if (hoursUntilDue < 0 && commitment.status === 'pendiente') {
        await googleSheetsService.updateCommitment(commitment.id, {
          status: 'vencido',
        });
      }
    }

    res.json({
      success: true,
      data: {
        remindersSent: remindersSent.length,
        commitmentIds: remindersSent,
      },
    });
  } catch (error) {
    console.error('Send reminders error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al enviar recordatorios',
    });
  }
}

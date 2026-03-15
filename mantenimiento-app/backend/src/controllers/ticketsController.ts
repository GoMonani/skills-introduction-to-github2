import { Request, Response } from 'express';
import { googleSheetsService } from '../services/googleSheets';
import { googleDriveService } from '../services/googleDrive';
import { geminiAIService } from '../services/geminiAI';
import { twilioService } from '../services/twilio';
import { emailService } from '../services/email';
import { TicketCreateInput, Ticket } from '../types';

export async function createTicket(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const input: TicketCreateInput = req.body;

    // Get creator info
    const creator = await googleSheetsService.getUserById(req.user.userId);
    if (!creator) {
      res.status(404).json({ success: false, error: 'Usuario no encontrado' });
      return;
    }

    // Create ticket
    const ticket = await googleSheetsService.createTicket(input, req.user.userId);

    // Create Drive folder
    try {
      const folderId = await googleDriveService.createTicketFolder(ticket.code, ticket.title);
      await googleSheetsService.updateTicket(ticket.id, { driveFolderId: folderId });
      ticket.driveFolderId = folderId;
    } catch (error) {
      console.error('Error creating Drive folder:', error);
      // Continue without Drive folder - will create later
    }

    // Generate AI analysis
    try {
      const analysis = await geminiAIService.analyzeMaintenanceRequest(
        ticket.description,
        ticket.area,
        ticket.equipment,
        creator.fullName
      );

      await googleSheetsService.updateTicket(ticket.id, {
        aiSummary: analysis.summary,
        aiPossibleCause: analysis.possibleCause,
        aiRisk: analysis.risk,
        aiSteps: analysis.steps,
        aiTimeEstimate: analysis.timeEstimate,
        aiParts: analysis.parts,
      });

      Object.assign(ticket, {
        aiSummary: analysis.summary,
        aiPossibleCause: analysis.possibleCause,
        aiRisk: analysis.risk,
        aiSteps: analysis.steps,
        aiTimeEstimate: analysis.timeEstimate,
        aiParts: analysis.parts,
      });
    } catch (error) {
      console.error('Error generating AI analysis:', error);
      // Continue without AI analysis
    }

    // Notify assigned users
    if (input.assignedToIds && input.assignedToIds.length > 0) {
      for (const userId of input.assignedToIds) {
        const user = await googleSheetsService.getUserById(userId);
        if (user) {
          // Send via all channels
          twilioService.sendInvitation(
            user.phone,
            'whatsapp',
            ticket.code,
            ticket.title,
            creator.fullName
          );
          emailService.sendInvitation(
            user.email,
            ticket.code,
            ticket.title,
            creator.fullName
          );
        }
      }
    }

    res.status(201).json({
      success: true,
      data: ticket,
      message: `Trabajo ${ticket.code} creado exitosamente`,
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo crear el trabajo. Por favor intenta de nuevo.',
    });
  }
}

export async function getTickets(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const tickets = await googleSheetsService.getTicketsForUser(req.user.userId);

    // Sort by updatedAt descending
    tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    res.json({
      success: true,
      data: tickets,
    });
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudieron obtener los trabajos',
    });
  }
}

export async function getTicketById(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { id } = req.params;
    const ticket = await googleSheetsService.getTicketById(id);

    if (!ticket) {
      res.status(404).json({
        success: false,
        error: 'Trabajo no encontrado',
      });
      return;
    }

    // Check if user has access
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

    // Get messages and commitments
    const [messages, commitments] = await Promise.all([
      googleSheetsService.getMessagesByTicketId(ticket.id),
      googleSheetsService.getCommitmentsByTicketId(ticket.id),
    ]);

    res.json({
      success: true,
      data: {
        ticket,
        messages,
        commitments,
      },
    });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo obtener el trabajo',
    });
  }
}

export async function updateTicket(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { id } = req.params;
    const updates: Partial<Ticket> = req.body;

    const ticket = await googleSheetsService.getTicketById(id);

    if (!ticket) {
      res.status(404).json({
        success: false,
        error: 'Trabajo no encontrado',
      });
      return;
    }

    // Check if user has access
    const hasAccess =
      ticket.createdById === req.user.userId ||
      ticket.assignedToIds.includes(req.user.userId);

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: 'No tienes permiso para modificar este trabajo',
      });
      return;
    }

    // Prevent status changes on completed tickets (but allow other field updates)
    if (ticket.status === 'completado' && updates.status && updates.status !== 'completado') {
      res.status(400).json({
        success: false,
        error: 'No se puede cambiar el estado de un trabajo completado',
      });
      return;
    }

    const updatedTicket = await googleSheetsService.updateTicket(id, updates);

    // Notify about progress updates
    if (updates.progress !== undefined && updates.progress !== ticket.progress) {
      const updater = await googleSheetsService.getUserById(req.user.userId);
      if (updater) {
        const usersToNotify = [ticket.createdById, ...ticket.assignedToIds]
          .filter(uid => uid !== req.user!.userId);

        for (const userId of usersToNotify) {
          const user = await googleSheetsService.getUserById(userId);
          if (user) {
            twilioService.sendProgressUpdate(
              user.phone,
              'whatsapp',
              ticket.code,
              updates.progress,
              updater.fullName
            );
          }
        }
      }
    }

    res.json({
      success: true,
      data: updatedTicket,
      message: 'Trabajo actualizado',
    });
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo actualizar el trabajo',
    });
  }
}

export async function completeTicket(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { id } = req.params;
    const { finalEvidence, closingNotes } = req.body;

    if (!finalEvidence || !closingNotes) {
      res.status(400).json({
        success: false,
        error: 'Se requiere evidencia final y notas de cierre',
      });
      return;
    }

    const ticket = await googleSheetsService.getTicketById(id);

    if (!ticket) {
      res.status(404).json({
        success: false,
        error: 'Trabajo no encontrado',
      });
      return;
    }

    // Check if user has access
    const hasAccess =
      ticket.createdById === req.user.userId ||
      ticket.assignedToIds.includes(req.user.userId);

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: 'No tienes permiso para completar este trabajo',
      });
      return;
    }

    // Generate closing summary
    let closingSummary = closingNotes;
    try {
      closingSummary = await geminiAIService.generateClosingSummary(
        ticket.title,
        ticket.description,
        finalEvidence,
        closingNotes
      );
    } catch (error) {
      console.error('Error generating closing summary:', error);
    }

    const updatedTicket = await googleSheetsService.updateTicket(id, {
      status: 'completado',
      progress: 100,
      finalEvidence,
      closingNotes: closingSummary,
      completedAt: new Date().toISOString(),
    });

    // Notify all participants
    const usersToNotify = [ticket.createdById, ...ticket.assignedToIds];
    for (const userId of usersToNotify) {
      const user = await googleSheetsService.getUserById(userId);
      if (user) {
        emailService.sendTicketUpdate(
          user.email,
          ticket.code,
          ticket.title,
          'completed',
          closingSummary
        );
      }
    }

    res.json({
      success: true,
      data: updatedTicket,
      message: `Trabajo ${ticket.code} completado exitosamente`,
    });
  } catch (error) {
    console.error('Complete ticket error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo completar el trabajo',
    });
  }
}

export async function addAssignee(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { id } = req.params;
    const { userId, notifyVia } = req.body;

    const ticket = await googleSheetsService.getTicketById(id);

    if (!ticket) {
      res.status(404).json({
        success: false,
        error: 'Trabajo no encontrado',
      });
      return;
    }

    if (ticket.createdById !== req.user.userId) {
      res.status(403).json({
        success: false,
        error: 'Solo el creador puede agregar personas',
      });
      return;
    }

    if (ticket.assignedToIds.includes(userId)) {
      res.status(400).json({
        success: false,
        error: 'Esta persona ya está asignada',
      });
      return;
    }

    const newAssignedToIds = [...ticket.assignedToIds, userId];
    await googleSheetsService.updateTicket(id, { assignedToIds: newAssignedToIds });

    // Notify the new assignee
    const newAssignee = await googleSheetsService.getUserById(userId);
    const inviter = await googleSheetsService.getUserById(req.user.userId);

    if (newAssignee && inviter) {
      if (notifyVia === 'whatsapp' || notifyVia === 'all') {
        twilioService.sendInvitation(
          newAssignee.phone,
          'whatsapp',
          ticket.code,
          ticket.title,
          inviter.fullName
        );
      }
      if (notifyVia === 'sms' || notifyVia === 'all') {
        twilioService.sendInvitation(
          newAssignee.phone,
          'sms',
          ticket.code,
          ticket.title,
          inviter.fullName
        );
      }
      if (notifyVia === 'email' || notifyVia === 'all') {
        emailService.sendInvitation(
          newAssignee.email,
          ticket.code,
          ticket.title,
          inviter.fullName
        );
      }
    }

    res.json({
      success: true,
      message: 'Persona agregada exitosamente',
    });
  } catch (error) {
    console.error('Add assignee error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo agregar a la persona',
    });
  }
}

export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const tickets = await googleSheetsService.getTicketsForUser(req.user.userId);

    const stats = {
      total: tickets.length,
      byStatus: {
        pendiente: tickets.filter(t => t.status === 'pendiente').length,
        en_progreso: tickets.filter(t => t.status === 'en_progreso').length,
        esperando_respuesta: tickets.filter(t => t.status === 'esperando_respuesta').length,
        completado: tickets.filter(t => t.status === 'completado').length,
        cancelado: tickets.filter(t => t.status === 'cancelado').length,
      },
      byPriority: {
        baja: tickets.filter(t => t.priority === 'baja').length,
        media: tickets.filter(t => t.priority === 'media').length,
        alta: tickets.filter(t => t.priority === 'alta').length,
        urgente: tickets.filter(t => t.priority === 'urgente').length,
      },
      averageProgress: tickets.length > 0
        ? Math.round(tickets.reduce((sum, t) => sum + t.progress, 0) / tickets.length)
        : 0,
      completedThisMonth: tickets.filter(t => {
        if (t.status !== 'completado' || !t.completedAt) return false;
        const completed = new Date(t.completedAt);
        const now = new Date();
        return completed.getMonth() === now.getMonth() &&
          completed.getFullYear() === now.getFullYear();
      }).length,
      avgCompletionTime: calculateAverageCompletionTime(tickets),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudieron obtener las estadísticas',
    });
  }
}

function calculateAverageCompletionTime(tickets: Ticket[]): string {
  const completedTickets = tickets.filter(t => t.status === 'completado' && t.completedAt);

  if (completedTickets.length === 0) return 'N/A';

  const totalHours = completedTickets.reduce((sum, t) => {
    const start = new Date(t.createdAt).getTime();
    const end = new Date(t.completedAt!).getTime();
    return sum + (end - start) / (1000 * 60 * 60);
  }, 0);

  const avgHours = totalHours / completedTickets.length;

  if (avgHours < 24) {
    return `${Math.round(avgHours)} horas`;
  } else {
    return `${Math.round(avgHours / 24)} días`;
  }
}

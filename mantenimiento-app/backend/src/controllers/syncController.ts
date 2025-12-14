import { Request, Response } from 'express';
import { googleSheetsService } from '../services/googleSheets';
import { SyncItem, SyncStatus } from '../types';

interface SyncRequest {
  items: SyncItem[];
}

interface SyncResult {
  id: string;
  entityId: string;
  status: SyncStatus;
  error?: string;
  serverEntityId?: string;
}

export async function processSyncQueue(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { items } = req.body as SyncRequest;

    if (!items || !Array.isArray(items)) {
      res.status(400).json({
        success: false,
        error: 'Se requiere un array de items para sincronizar',
      });
      return;
    }

    const results: SyncResult[] = [];

    for (const item of items) {
      try {
        const result = await processItem(item, req.user.userId);
        results.push(result);
      } catch (error) {
        results.push({
          id: item.id,
          entityId: item.entityId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }

    const successful = results.filter(r => r.status === 'completed').length;
    const failed = results.filter(r => r.status === 'failed').length;

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: items.length,
          successful,
          failed,
        },
      },
      message: failed > 0
        ? `Sincronización parcial: ${successful} exitosos, ${failed} fallidos`
        : `${successful} elementos sincronizados correctamente`,
    });
  } catch (error) {
    console.error('Sync queue error:', error);
    res.status(500).json({
      success: false,
      error: 'Error procesando la cola de sincronización',
    });
  }
}

async function processItem(item: SyncItem, userId: string): Promise<SyncResult> {
  const { entity, operation, data, idempotencyKey } = item;

  switch (entity) {
    case 'ticket':
      return processTicketOperation(item, userId);
    case 'message':
      return processMessageOperation(item, userId);
    case 'commitment':
      return processCommitmentOperation(item, userId);
    default:
      return {
        id: item.id,
        entityId: item.entityId,
        status: 'failed',
        error: `Entidad desconocida: ${entity}`,
      };
  }
}

async function processTicketOperation(item: SyncItem, userId: string): Promise<SyncResult> {
  const { operation, entityId, data } = item;

  switch (operation) {
    case 'create': {
      const ticket = await googleSheetsService.createTicket(
        data as any,
        userId
      );
      return {
        id: item.id,
        entityId: item.entityId,
        status: 'completed',
        serverEntityId: ticket.id,
      };
    }
    case 'update': {
      const ticket = await googleSheetsService.updateTicket(entityId, data as any);
      if (!ticket) {
        return {
          id: item.id,
          entityId,
          status: 'failed',
          error: 'Trabajo no encontrado',
        };
      }
      return {
        id: item.id,
        entityId,
        status: 'completed',
      };
    }
    default:
      return {
        id: item.id,
        entityId,
        status: 'failed',
        error: `Operación no soportada: ${operation}`,
      };
  }
}

async function processMessageOperation(item: SyncItem, userId: string): Promise<SyncResult> {
  const { operation, entityId, data } = item;

  switch (operation) {
    case 'create': {
      const sender = await googleSheetsService.getUserById(userId);
      if (!sender) {
        return {
          id: item.id,
          entityId: item.entityId,
          status: 'failed',
          error: 'Usuario no encontrado',
        };
      }

      const message = await googleSheetsService.createMessage(
        {
          ...(data as any),
          idempotencyKey: item.idempotencyKey,
        },
        userId,
        sender.fullName
      );

      return {
        id: item.id,
        entityId: item.entityId,
        status: 'completed',
        serverEntityId: message.id,
      };
    }
    default:
      return {
        id: item.id,
        entityId,
        status: 'failed',
        error: `Operación no soportada: ${operation}`,
      };
  }
}

async function processCommitmentOperation(item: SyncItem, userId: string): Promise<SyncResult> {
  const { operation, entityId, data } = item;

  switch (operation) {
    case 'create': {
      const commitment = await googleSheetsService.createCommitment(
        data as any,
        userId
      );
      return {
        id: item.id,
        entityId: item.entityId,
        status: 'completed',
        serverEntityId: commitment.id,
      };
    }
    case 'update': {
      const commitment = await googleSheetsService.updateCommitment(
        entityId,
        data as any
      );
      if (!commitment) {
        return {
          id: item.id,
          entityId,
          status: 'failed',
          error: 'Compromiso no encontrado',
        };
      }
      return {
        id: item.id,
        entityId,
        status: 'completed',
      };
    }
    default:
      return {
        id: item.id,
        entityId,
        status: 'failed',
        error: `Operación no soportada: ${operation}`,
      };
  }
}

export async function getSyncStatus(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    // Return last sync info and any pending server updates
    const tickets = await googleSheetsService.getTicketsForUser(req.user.userId);

    res.json({
      success: true,
      data: {
        serverTime: new Date().toISOString(),
        ticketsCount: tickets.length,
        lastTicketUpdate: tickets.length > 0
          ? Math.max(...tickets.map(t => new Date(t.updatedAt).getTime()))
          : null,
      },
    });
  } catch (error) {
    console.error('Get sync status error:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo estado de sincronización',
    });
  }
}

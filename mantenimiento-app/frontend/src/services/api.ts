import { storageService } from './storage';
import {
  User,
  Ticket,
  TicketCreateInput,
  Message,
  Commitment,
  ApiResponse,
  DashboardStats,
  AIAnalysis,
  SyncQueueItem,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

const API_BASE = '/api';
const MAX_SYNC_RETRIES = 5;

class ApiService {
  private token: string | null = null;

  setToken(token: string | null): void {
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Error en la solicitud',
        };
      }

      return data;
    } catch (error) {
      console.error('API request error:', error);
      return {
        success: false,
        error: 'Sin conexión. Los cambios se guardarán localmente.',
      };
    }
  }

  private async requestWithFile<T>(
    endpoint: string,
    formData: FormData
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {};

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Error subiendo archivos',
        };
      }

      return data;
    } catch (error) {
      console.error('File upload error:', error);
      return {
        success: false,
        error: 'Sin conexión. Los archivos se subirán cuando vuelva la conexión.',
      };
    }
  }

  // ============ AUTH ============

  async register(fullName: string, email: string, phone: string): Promise<ApiResponse<{ token: string; user: User }>> {
    const response = await this.request<{ token: string; user: User; isNewUser: boolean }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, email, phone }),
    });

    if (response.success && response.data) {
      this.token = response.data.token;
      await storageService.saveAuth(response.data.token, response.data.user);
    }

    return response;
  }

  async validateToken(): Promise<ApiResponse<User>> {
    return this.request<User>('/auth/validate');
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    return this.request<User>('/auth/me');
  }

  // ============ TICKETS ============

  async createTicket(input: TicketCreateInput): Promise<ApiResponse<Ticket>> {
    const response = await this.request<Ticket>('/tickets', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (response.success && response.data) {
      await storageService.saveTicket(response.data);
    } else if (!navigator.onLine) {
      // Save locally and queue for sync
      const localTicket: Ticket = {
        id: uuidv4(),
        code: 'LOCAL_' + Date.now(),
        ...input,
        status: 'pendiente',
        progress: 0,
        createdById: '', // Will be set on sync
        assignedToIds: input.assignedToIds || [],
        photoUrls: [],
        videoUrls: [],
        docUrls: [],
        voiceUrls: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await storageService.saveTicket(localTicket);

      const syncItem: SyncQueueItem = {
        id: uuidv4(),
        operation: 'create',
        entity: 'ticket',
        entityId: localTicket.id,
        data: input as unknown as Record<string, unknown>,
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString(),
        idempotencyKey: uuidv4(),
      };

      await storageService.addToSyncQueue(syncItem);

      return {
        success: true,
        data: localTicket,
        message: 'Guardado localmente. Se sincronizará cuando haya conexión.',
      };
    }

    return response;
  }

  async getTickets(): Promise<ApiResponse<Ticket[]>> {
    const response = await this.request<Ticket[]>('/tickets');

    if (response.success && response.data) {
      await storageService.saveTickets(response.data);
      return response;
    }

    // Return cached data if offline
    const cached = await storageService.getAllTickets();
    return {
      success: true,
      data: cached,
      message: cached.length > 0 ? 'Datos guardados localmente' : undefined,
    };
  }

  async getTicket(id: string): Promise<ApiResponse<{ ticket: Ticket; messages: Message[]; commitments: Commitment[] }>> {
    const response = await this.request<{ ticket: Ticket; messages: Message[]; commitments: Commitment[] }>(`/tickets/${id}`);

    if (response.success && response.data) {
      await storageService.saveTicket(response.data.ticket);
      await storageService.saveMessages(response.data.messages);
      await storageService.saveCommitments(response.data.commitments);
      return response;
    }

    // Return cached data if offline
    const ticket = await storageService.getTicket(id);
    if (ticket) {
      const messages = await storageService.getMessagesByTicketId(id);
      const commitments = await storageService.getCommitmentsByTicketId(id);
      return {
        success: true,
        data: { ticket, messages, commitments },
        message: 'Datos guardados localmente',
      };
    }

    return {
      success: false,
      error: 'No se encontró el trabajo',
    };
  }

  async updateTicket(id: string, updates: Partial<Ticket>): Promise<ApiResponse<Ticket>> {
    // Optimistic update
    const current = await storageService.getTicket(id);
    if (current) {
      const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
      await storageService.saveTicket(updated);
    }

    const response = await this.request<Ticket>(`/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });

    if (response.success && response.data) {
      await storageService.saveTicket(response.data);
    } else if (!navigator.onLine && current) {
      // Queue for sync
      const syncItem: SyncQueueItem = {
        id: uuidv4(),
        operation: 'update',
        entity: 'ticket',
        entityId: id,
        data: updates as Record<string, unknown>,
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString(),
        idempotencyKey: uuidv4(),
      };

      await storageService.addToSyncQueue(syncItem);

      return {
        success: true,
        data: { ...current, ...updates } as Ticket,
        message: 'Cambios guardados localmente',
      };
    }

    return response;
  }

  async completeTicket(id: string, finalEvidence: string, closingNotes: string): Promise<ApiResponse<Ticket>> {
    return this.request<Ticket>(`/tickets/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ finalEvidence, closingNotes }),
    });
  }

  async addAssignee(ticketId: string, userId: string, notifyVia: 'whatsapp' | 'sms' | 'email' | 'all'): Promise<ApiResponse<void>> {
    return this.request<void>(`/tickets/${ticketId}/assignees`, {
      method: 'POST',
      body: JSON.stringify({ userId, notifyVia }),
    });
  }

  // ============ MESSAGES ============

  async sendMessage(ticketId: string, content: string, type: string = 'text', mentionedUserIds: string[] = []): Promise<ApiResponse<Message>> {
    const idempotencyKey = uuidv4();

    const response = await this.request<Message>('/messages', {
      method: 'POST',
      body: JSON.stringify({
        ticketId,
        content,
        type,
        mentionedUserIds,
        idempotencyKey,
      }),
    });

    if (response.success && response.data) {
      await storageService.saveMessage(response.data);
    } else if (!navigator.onLine) {
      // Save locally
      const localMessage: Message = {
        id: uuidv4(),
        ticketId,
        senderId: '',
        senderName: '',
        content,
        type: type as Message['type'],
        channel: 'app',
        status: 'pending',
        mentionedUserIds,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        idempotencyKey,
      };

      await storageService.saveMessage(localMessage);

      const syncItem: SyncQueueItem = {
        id: uuidv4(),
        operation: 'create',
        entity: 'message',
        entityId: localMessage.id,
        data: { ticketId, content, type, mentionedUserIds, idempotencyKey },
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString(),
        idempotencyKey,
      };

      await storageService.addToSyncQueue(syncItem);

      return {
        success: true,
        data: localMessage,
        message: 'Mensaje guardado. Se enviará cuando haya conexión.',
      };
    }

    return response;
  }

  async getMessages(ticketId: string): Promise<ApiResponse<Message[]>> {
    const response = await this.request<Message[]>(`/tickets/${ticketId}/messages`);

    if (response.success && response.data) {
      await storageService.saveMessages(response.data);
      return response;
    }

    const cached = await storageService.getMessagesByTicketId(ticketId);
    return {
      success: true,
      data: cached,
    };
  }

  // ============ COMMITMENTS ============

  async createCommitment(ticketId: string, assignedToId: string, description: string, dueDate: string): Promise<ApiResponse<Commitment>> {
    const response = await this.request<Commitment>(`/tickets/${ticketId}/commitments`, {
      method: 'POST',
      body: JSON.stringify({ assignedToId, description, dueDate }),
    });

    if (response.success && response.data) {
      await storageService.saveCommitment(response.data);
    }

    return response;
  }

  async updateCommitment(ticketId: string, commitmentId: string, updates: Partial<Commitment>): Promise<ApiResponse<Commitment>> {
    return this.request<Commitment>(`/tickets/${ticketId}/commitments/${commitmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  // ============ FILES ============

  async uploadFiles(ticketId: string, files: File[]): Promise<ApiResponse<{ url: string; name: string; type: string }[]>> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    const response = await this.requestWithFile<{ url: string; name: string; type: string }[]>(`/tickets/${ticketId}/files`, formData);

    if (!response.success && !navigator.onLine) {
      // Cache files locally
      for (const file of files) {
        const id = uuidv4();
        await storageService.cacheFile(id, file, ticketId, file.type.startsWith('image/') ? 'photo' : 'file');
      }

      return {
        success: true,
        data: files.map(f => ({ url: '', name: f.name, type: f.type })),
        message: 'Archivos guardados. Se subirán cuando haya conexión.',
      };
    }

    return response;
  }

  // ============ AI ============

  async confirmUnderstanding(description: string): Promise<ApiResponse<{ confirmation: string }>> {
    return this.request<{ confirmation: string }>('/ai/confirm', {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
  }

  async analyzeRequest(description: string, area: string, equipment?: string): Promise<ApiResponse<AIAnalysis>> {
    return this.request<AIAnalysis>('/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ description, area, equipment }),
    });
  }

  async rewriteMessage(message: string, tone: string, recipientName?: string): Promise<ApiResponse<{ original: string; rewritten: string }>> {
    return this.request<{ original: string; rewritten: string }>('/ai/rewrite', {
      method: 'POST',
      body: JSON.stringify({ message, tone, recipientName }),
    });
  }

  async transcribeAudio(audioBase64: string): Promise<ApiResponse<{ transcription: string }>> {
    return this.request<{ transcription: string }>('/ai/transcribe', {
      method: 'POST',
      body: JSON.stringify({ audioBase64 }),
    });
  }

  // ============ DASHBOARD ============

  async getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
    return this.request<DashboardStats>('/dashboard/stats');
  }

  // ============ USERS ============

  async getUsers(): Promise<ApiResponse<User[]>> {
    const response = await this.request<User[]>('/users');

    if (response.success && response.data) {
      await storageService.saveUsers(response.data);
    } else {
      const cached = await storageService.getAllUsers();
      return { success: true, data: cached };
    }

    return response;
  }

  // ============ SYNC ============

  async syncQueue(): Promise<ApiResponse<{ successful: number; failed: number }>> {
    const pending = await storageService.getPendingSyncItems();

    if (pending.length === 0) {
      return { success: true, data: { successful: 0, failed: 0 } };
    }

    const response = await this.request<{
      results: { id: string; status: string; serverEntityId?: string }[];
      summary: { successful: number; failed: number };
    }>('/sync', {
      method: 'POST',
      body: JSON.stringify({ items: pending }),
    });

    if (response.success && response.data) {
      // Update local sync items
      for (const result of response.data.results) {
        if (result.status === 'completed') {
          await storageService.removeSyncItem(result.id);
        } else {
          const item = pending.find(p => p.id === result.id);
          const attempts = (item?.attempts || 0) + 1;

          if (attempts >= MAX_SYNC_RETRIES) {
            // Max retries exceeded, remove the sync item and clean up local entity
            console.warn(`Sync item ${result.id} exceeded max retries (${MAX_SYNC_RETRIES}), removing`);
            if (item && item.operation === 'create') {
              // Remove the locally-created entity that was never accepted by server
              if (item.entity === 'ticket') {
                await storageService.deleteTicket(item.entityId);
              } else if (item.entity === 'message') {
                await storageService.deleteMessage(item.entityId);
              }
            }
            await storageService.removeSyncItem(result.id);
          } else {
            // Mark as pending so it will be retried
            await storageService.updateSyncItem(result.id, {
              status: 'pending',
              attempts,
              lastAttemptAt: new Date().toISOString(),
            });
          }
        }
      }

      return {
        success: true,
        data: response.data.summary,
      };
    }

    return {
      success: false,
      error: 'Error sincronizando',
    };
  }
}

export const apiService = new ApiService();

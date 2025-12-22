import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { User, Ticket, Message, Commitment, SyncQueueItem, AppState } from '../types';

interface MantenimientoDB extends DBSchema {
  users: {
    key: string;
    value: User;
    indexes: { 'by-email': string };
  };
  tickets: {
    key: string;
    value: Ticket;
    indexes: { 'by-status': string; 'by-createdAt': string };
  };
  messages: {
    key: string;
    value: Message;
    indexes: { 'by-ticketId': string; 'by-createdAt': string };
  };
  commitments: {
    key: string;
    value: Commitment;
    indexes: { 'by-ticketId': string; 'by-dueDate': string };
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: { 'by-status': string; 'by-createdAt': string };
  };
  appState: {
    key: string;
    value: AppState;
  };
  auth: {
    key: string;
    value: { key: string; token: string; user: User };
  };
  fileCache: {
    key: string;
    value: { id: string; blob: Blob; ticketId: string; type: string };
    indexes: { 'by-ticketId': string };
  };
}

const DB_NAME = 'mantenimiento-db';
const DB_VERSION = 1;

class StorageService {
  private db: IDBPDatabase<MantenimientoDB> | null = null;

  async init(): Promise<void> {
    this.db = await openDB<MantenimientoDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Users store
        if (!db.objectStoreNames.contains('users')) {
          const usersStore = db.createObjectStore('users', { keyPath: 'id' });
          usersStore.createIndex('by-email', 'email');
        }

        // Tickets store
        if (!db.objectStoreNames.contains('tickets')) {
          const ticketsStore = db.createObjectStore('tickets', { keyPath: 'id' });
          ticketsStore.createIndex('by-status', 'status');
          ticketsStore.createIndex('by-createdAt', 'createdAt');
        }

        // Messages store
        if (!db.objectStoreNames.contains('messages')) {
          const messagesStore = db.createObjectStore('messages', { keyPath: 'id' });
          messagesStore.createIndex('by-ticketId', 'ticketId');
          messagesStore.createIndex('by-createdAt', 'createdAt');
        }

        // Commitments store
        if (!db.objectStoreNames.contains('commitments')) {
          const commitmentsStore = db.createObjectStore('commitments', { keyPath: 'id' });
          commitmentsStore.createIndex('by-ticketId', 'ticketId');
          commitmentsStore.createIndex('by-dueDate', 'dueDate');
        }

        // Sync queue store
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
          syncStore.createIndex('by-status', 'status');
          syncStore.createIndex('by-createdAt', 'createdAt');
        }

        // App state store
        if (!db.objectStoreNames.contains('appState')) {
          db.createObjectStore('appState', { keyPath: 'key' });
        }

        // Auth store
        if (!db.objectStoreNames.contains('auth')) {
          db.createObjectStore('auth', { keyPath: 'key' });
        }

        // File cache store
        if (!db.objectStoreNames.contains('fileCache')) {
          const fileCacheStore = db.createObjectStore('fileCache', { keyPath: 'id' });
          fileCacheStore.createIndex('by-ticketId', 'ticketId');
        }
      },
    });
  }

  private getDb(): IDBPDatabase<MantenimientoDB> {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  // ============ AUTH ============

  async saveAuth(token: string, user: User): Promise<void> {
    const db = this.getDb();
    await db.put('auth', { key: 'current', token, user });
  }

  async getAuth(): Promise<{ token: string; user: User } | null> {
    const db = this.getDb();
    const auth = await db.get('auth', 'current');
    return auth || null;
  }

  async clearAuth(): Promise<void> {
    const db = this.getDb();
    await db.delete('auth', 'current');
  }

  // ============ USERS ============

  async saveUser(user: User): Promise<void> {
    const db = this.getDb();
    await db.put('users', user);
  }

  async getUser(id: string): Promise<User | undefined> {
    const db = this.getDb();
    return db.get('users', id);
  }

  async getAllUsers(): Promise<User[]> {
    const db = this.getDb();
    return db.getAll('users');
  }

  async saveUsers(users: User[]): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction('users', 'readwrite');
    await Promise.all([...users.map(u => tx.store.put(u)), tx.done]);
  }

  // ============ TICKETS ============

  async saveTicket(ticket: Ticket): Promise<void> {
    const db = this.getDb();
    await db.put('tickets', ticket);
  }

  async getTicket(id: string): Promise<Ticket | undefined> {
    const db = this.getDb();
    return db.get('tickets', id);
  }

  async getAllTickets(): Promise<Ticket[]> {
    const db = this.getDb();
    const tickets = await db.getAll('tickets');
    return tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async saveTickets(tickets: Ticket[]): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction('tickets', 'readwrite');
    await Promise.all([...tickets.map(t => tx.store.put(t)), tx.done]);
  }

  async deleteTicket(id: string): Promise<void> {
    const db = this.getDb();
    await db.delete('tickets', id);
  }

  // ============ MESSAGES ============

  async saveMessage(message: Message): Promise<void> {
    const db = this.getDb();
    await db.put('messages', message);
  }

  async getMessagesByTicketId(ticketId: string): Promise<Message[]> {
    const db = this.getDb();
    const messages = await db.getAllFromIndex('messages', 'by-ticketId', ticketId);
    return messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async saveMessages(messages: Message[]): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction('messages', 'readwrite');
    await Promise.all([...messages.map(m => tx.store.put(m)), tx.done]);
  }

  // ============ COMMITMENTS ============

  async saveCommitment(commitment: Commitment): Promise<void> {
    const db = this.getDb();
    await db.put('commitments', commitment);
  }

  async getCommitmentsByTicketId(ticketId: string): Promise<Commitment[]> {
    const db = this.getDb();
    const commitments = await db.getAllFromIndex('commitments', 'by-ticketId', ticketId);
    return commitments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }

  async saveCommitments(commitments: Commitment[]): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction('commitments', 'readwrite');
    await Promise.all([...commitments.map(c => tx.store.put(c)), tx.done]);
  }

  // ============ SYNC QUEUE ============

  async addToSyncQueue(item: SyncQueueItem): Promise<void> {
    const db = this.getDb();
    await db.put('syncQueue', item);
  }

  async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    const db = this.getDb();
    const items = await db.getAllFromIndex('syncQueue', 'by-status', 'pending');
    return items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async updateSyncItem(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
    const db = this.getDb();
    const item = await db.get('syncQueue', id);
    if (item) {
      await db.put('syncQueue', { ...item, ...updates });
    }
  }

  async removeSyncItem(id: string): Promise<void> {
    const db = this.getDb();
    await db.delete('syncQueue', id);
  }

  async clearCompletedSyncItems(): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction('syncQueue', 'readwrite');
    const index = tx.store.index('by-status');
    let cursor = await index.openCursor('completed');
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  async getSyncQueueCount(): Promise<number> {
    const db = this.getDb();
    return db.countFromIndex('syncQueue', 'by-status', 'pending');
  }

  // ============ APP STATE ============

  async saveAppState(state: Partial<AppState>): Promise<void> {
    const db = this.getDb();
    const current = await this.getAppState();
    await db.put('appState', { ...current, ...state, key: 'current' } as AppState & { key: string });
  }

  async getAppState(): Promise<AppState> {
    const db = this.getDb();
    const state = await db.get('appState', 'current');
    return state || {
      isOnline: navigator.onLine,
      isSyncing: false,
      pendingSyncCount: 0,
    };
  }

  async saveLastKnownGoodState(tickets: Ticket[], messages: Message[], commitments: Commitment[]): Promise<void> {
    await this.saveAppState({
      lastKnownGoodState: {
        tickets: tickets.map(t => t.id),
        messages: messages.map(m => m.id),
        commitments: commitments.map(c => c.id),
        savedAt: new Date().toISOString(),
      },
    });
  }

  // ============ FILE CACHE ============

  async cacheFile(id: string, blob: Blob, ticketId: string, type: string): Promise<void> {
    const db = this.getDb();
    await db.put('fileCache', { id, blob, ticketId, type });
  }

  async getCachedFile(id: string): Promise<Blob | undefined> {
    const db = this.getDb();
    const file = await db.get('fileCache', id);
    return file?.blob;
  }

  async getCachedFilesByTicketId(ticketId: string): Promise<{ id: string; blob: Blob; type: string }[]> {
    const db = this.getDb();
    return db.getAllFromIndex('fileCache', 'by-ticketId', ticketId);
  }

  async removeCachedFile(id: string): Promise<void> {
    const db = this.getDb();
    await db.delete('fileCache', id);
  }

  // ============ CLEAR ALL ============

  async clearAll(): Promise<void> {
    const db = this.getDb();
    const stores = ['users', 'tickets', 'messages', 'commitments', 'syncQueue', 'appState', 'auth', 'fileCache'] as const;
    for (const store of stores) {
      await db.clear(store);
    }
  }
}

export const storageService = new StorageService();

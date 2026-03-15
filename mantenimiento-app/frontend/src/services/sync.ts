import { storageService } from './storage';
import { apiService } from './api';
import { AppState } from '../types';

type SyncCallback = (state: AppState) => void;

const MAX_SYNC_RETRIES = 5;

class SyncService {
  private isRunning = false;
  private syncInterval: number | null = null;
  private callbacks: SyncCallback[] = [];
  private retryTimeout: number | null = null;
  private boundHandleOnline: () => void;
  private boundHandleOffline: () => void;

  constructor() {
    this.boundHandleOnline = () => this.handleOnline();
    this.boundHandleOffline = () => this.handleOffline();
  }

  async init(): Promise<void> {
    // Listen for online/offline events
    window.addEventListener('online', this.boundHandleOnline);
    window.addEventListener('offline', this.boundHandleOffline);

    // Initialize state
    await storageService.saveAppState({
      isOnline: navigator.onLine,
      isSyncing: false,
    });

    // Reset any stuck "processing" sync items back to pending
    const pending = await storageService.getPendingSyncItems();
    for (const item of pending) {
      if (item.status === 'processing') {
        await storageService.updateSyncItem(item.id, { status: 'pending' });
      }
    }

    // Start periodic sync check
    this.startPeriodicSync();
  }

  subscribe(callback: SyncCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  private async notifySubscribers(): Promise<void> {
    const state = await storageService.getAppState();
    this.callbacks.forEach(cb => cb(state));
  }

  private async handleOnline(): Promise<void> {
    console.log('Conexión restaurada');
    await storageService.saveAppState({ isOnline: true });
    await this.notifySubscribers();
    await this.runSync();
  }

  private async handleOffline(): Promise<void> {
    console.log('Sin conexión');
    await storageService.saveAppState({ isOnline: false, isSyncing: false });
    await this.notifySubscribers();
  }

  private startPeriodicSync(): void {
    // Check for pending sync items every 30 seconds
    this.syncInterval = window.setInterval(async () => {
      if (navigator.onLine && !this.isRunning) {
        const pendingCount = await storageService.getSyncQueueCount();
        if (pendingCount > 0) {
          await this.runSync();
        }
      }
    }, 30000);
  }

  async runSync(): Promise<boolean> {
    // Guard against concurrent runs
    if (this.isRunning || !navigator.onLine) {
      return false;
    }

    this.isRunning = true;

    try {
      await storageService.saveAppState({ isSyncing: true });
      await this.notifySubscribers();

      // Sync pending items
      const pendingCount = await storageService.getSyncQueueCount();

      if (pendingCount > 0) {
        const result = await apiService.syncQueue();

        if (result.success && result.data) {
          console.log(`Sincronización: ${result.data.successful} exitosos, ${result.data.failed} fallidos`);
        }
      }

      // Refresh data from server
      await this.refreshData();

      // Update state
      const remainingCount = await storageService.getSyncQueueCount();
      await storageService.saveAppState({
        isSyncing: false,
        lastSyncAt: new Date().toISOString(),
        pendingSyncCount: remainingCount,
        lastError: undefined,
      });

      await this.notifySubscribers();
      return true;
    } catch (error) {
      console.error('Error en sincronización:', error);

      await storageService.saveAppState({
        isSyncing: false,
        lastError: 'Error sincronizando. Se reintentará automáticamente.',
      });

      await this.notifySubscribers();

      // Retry with exponential backoff
      this.scheduleRetry();
      return false;
    } finally {
      this.isRunning = false;
    }
  }

  private async refreshData(): Promise<void> {
    // Refresh tickets
    await apiService.getTickets();

    // Refresh users
    await apiService.getUsers();
  }

  private scheduleRetry(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }

    // Retry in 10 seconds
    this.retryTimeout = window.setTimeout(() => {
      if (navigator.onLine) {
        this.runSync();
      }
    }, 10000);
  }

  async forceSync(): Promise<void> {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    await this.runSync();
  }

  async getPendingCount(): Promise<number> {
    return storageService.getSyncQueueCount();
  }

  async getState(): Promise<AppState> {
    return storageService.getAppState();
  }

  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
    window.removeEventListener('online', this.boundHandleOnline);
    window.removeEventListener('offline', this.boundHandleOffline);
  }
}

export const syncService = new SyncService();

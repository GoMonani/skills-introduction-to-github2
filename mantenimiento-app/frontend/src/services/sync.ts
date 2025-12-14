import { storageService } from './storage';
import { apiService } from './api';
import { AppState } from '../types';

type SyncCallback = (state: AppState) => void;

class SyncService {
  private isRunning = false;
  private syncInterval: number | null = null;
  private callbacks: SyncCallback[] = [];
  private retryTimeout: number | null = null;

  async init(): Promise<void> {
    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Initialize state
    await storageService.saveAppState({
      isOnline: navigator.onLine,
      isSyncing: false,
    });

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
    if (this.isRunning || !navigator.onLine) {
      return false;
    }

    this.isRunning = true;
    await storageService.saveAppState({ isSyncing: true });
    await this.notifySubscribers();

    try {
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
      await storageService.saveAppState({
        isSyncing: false,
        lastSyncAt: new Date().toISOString(),
        pendingSyncCount: await storageService.getSyncQueueCount(),
        lastError: undefined,
      });

      await this.notifySubscribers();
      this.isRunning = false;
      return true;
    } catch (error) {
      console.error('Error en sincronización:', error);

      await storageService.saveAppState({
        isSyncing: false,
        lastError: 'Error sincronizando. Se reintentará automáticamente.',
      });

      await this.notifySubscribers();
      this.isRunning = false;

      // Retry with exponential backoff
      this.scheduleRetry();
      return false;
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

  async forcSync(): Promise<void> {
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
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }
}

export const syncService = new SyncService();

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { storageService } from '../services/storage';
import { apiService } from '../services/api';
import { syncService } from '../services/sync';
import { User, Ticket, AppState } from '../types';

interface AppContextType {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (fullName: string, email: string, phone: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;

  // App State
  appState: AppState;
  isOnline: boolean;
  isSyncing: boolean;
  pendingSyncCount: number;

  // Tickets
  tickets: Ticket[];
  refreshTickets: () => Promise<void>;

  // Users
  users: User[];
  refreshUsers: () => Promise<void>;

  // Sync
  forceSync: () => Promise<void>;

  // Self-healing
  lastError: string | null;
  clearError: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [appState, setAppState] = useState<AppState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingSyncCount: 0,
  });
  const [lastError, setLastError] = useState<string | null>(null);

  // Initialize
  useEffect(() => {
    const init = async () => {
      try {
        // Initialize storage
        await storageService.init();

        // Initialize sync service
        await syncService.init();

        // Subscribe to sync state changes
        syncService.subscribe((state) => {
          setAppState(state);
          if (state.lastError) {
            setLastError(state.lastError);
          }
        });

        // Check for existing auth
        const auth = await storageService.getAuth();
        if (auth) {
          apiService.setToken(auth.token);
          setUser(auth.user);

          // Validate token with server if online
          if (navigator.onLine) {
            const result = await apiService.validateToken();
            if (!result.success) {
              // Token invalid, clear auth
              await storageService.clearAuth();
              apiService.setToken(null);
              setUser(null);
            } else if (result.data) {
              setUser(result.data);
            }
          }
        }

        // Load cached data
        const cachedTickets = await storageService.getAllTickets();
        setTickets(cachedTickets);

        const cachedUsers = await storageService.getAllUsers();
        setUsers(cachedUsers);

        // Get initial app state
        const state = await storageService.getAppState();
        setAppState(state);
      } catch (error) {
        console.error('Initialization error:', error);
        setLastError('Error inicializando la aplicación');
      } finally {
        setIsLoading(false);
      }
    };

    init();

    return () => {
      syncService.destroy();
    };
  }, []);

  const login = useCallback(async (fullName: string, email: string, phone: string) => {
    try {
      const result = await apiService.register(fullName, email, phone);

      if (result.success && result.data) {
        setUser(result.data.user);

        // Sync data after login
        await refreshTickets();
        await refreshUsers();

        return { success: true };
      }

      return { success: false, error: result.error || 'Error al iniciar sesión' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Error al iniciar sesión' };
    }
  }, []);

  const logout = useCallback(async () => {
    await storageService.clearAuth();
    apiService.setToken(null);
    setUser(null);
    setTickets([]);
  }, []);

  const refreshTickets = useCallback(async () => {
    const result = await apiService.getTickets();
    if (result.success && result.data) {
      setTickets(result.data);
    }
  }, []);

  const refreshUsers = useCallback(async () => {
    const result = await apiService.getUsers();
    if (result.success && result.data) {
      setUsers(result.data);
    }
  }, []);

  const forceSync = useCallback(async () => {
    await syncService.forcSync();
    await refreshTickets();
  }, [refreshTickets]);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  const value: AppContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    appState,
    isOnline: appState.isOnline,
    isSyncing: appState.isSyncing,
    pendingSyncCount: appState.pendingSyncCount,
    tickets,
    refreshTickets,
    users,
    refreshUsers,
    forceSync,
    lastError,
    clearError,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}

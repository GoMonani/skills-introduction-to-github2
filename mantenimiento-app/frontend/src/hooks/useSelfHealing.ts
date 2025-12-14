import { useState, useCallback, useRef } from 'react';
import { storageService } from '../services/storage';

interface SelfHealingState<T> {
  data: T | null;
  lastKnownGood: T | null;
  error: string | null;
  isRecovering: boolean;
}

interface UseSelfHealingReturn<T> {
  state: SelfHealingState<T>;
  execute: (operation: () => Promise<T>) => Promise<T | null>;
  rollback: () => void;
  clearError: () => void;
}

export function useSelfHealing<T>(initialData: T | null = null): UseSelfHealingReturn<T> {
  const [state, setState] = useState<SelfHealingState<T>>({
    data: initialData,
    lastKnownGood: initialData,
    error: null,
    isRecovering: false,
  });

  const operationCount = useRef(0);

  const execute = useCallback(async (operation: () => Promise<T>): Promise<T | null> => {
    const currentOperation = ++operationCount.current;

    try {
      // Save current state as last known good
      if (state.data !== null) {
        setState(prev => ({
          ...prev,
          lastKnownGood: prev.data,
          error: null,
        }));
      }

      const result = await operation();

      // Only update if this is still the latest operation
      if (currentOperation === operationCount.current) {
        setState(prev => ({
          ...prev,
          data: result,
          lastKnownGood: result,
          error: null,
          isRecovering: false,
        }));
      }

      return result;
    } catch (error) {
      console.error('Operation failed:', error);

      // Only handle error if this is still the latest operation
      if (currentOperation === operationCount.current) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Error en la operación',
          isRecovering: true,
        }));

        // Auto-rollback after short delay
        setTimeout(() => {
          if (currentOperation === operationCount.current) {
            setState(prev => {
              if (prev.isRecovering && prev.lastKnownGood !== null) {
                return {
                  ...prev,
                  data: prev.lastKnownGood,
                  isRecovering: false,
                };
              }
              return prev;
            });
          }
        }, 100);
      }

      return null;
    }
  }, [state.data]);

  const rollback = useCallback(() => {
    setState(prev => ({
      ...prev,
      data: prev.lastKnownGood,
      error: null,
      isRecovering: false,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  return { state, execute, rollback, clearError };
}

// Hook for optimistic updates with automatic rollback
interface OptimisticUpdateOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  rollbackDelay?: number;
}

export function useOptimisticUpdate<T, U>(
  currentValue: T,
  updateFn: (optimistic: T) => Promise<U>,
  options: OptimisticUpdateOptions<U> = {}
) {
  const [state, setState] = useState({
    value: currentValue,
    optimisticValue: currentValue,
    isPending: false,
    error: null as string | null,
  });

  const lastValue = useRef(currentValue);

  const update = useCallback(async (optimisticValue: T) => {
    lastValue.current = state.value;

    setState(prev => ({
      ...prev,
      optimisticValue,
      isPending: true,
      error: null,
    }));

    try {
      const result = await updateFn(optimisticValue);

      setState(prev => ({
        ...prev,
        value: optimisticValue,
        isPending: false,
      }));

      options.onSuccess?.(result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error';

      // Rollback
      setState(prev => ({
        ...prev,
        optimisticValue: lastValue.current,
        isPending: false,
        error: errorMessage,
      }));

      options.onError?.(error instanceof Error ? error : new Error(errorMessage));

      // Clear error after delay
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          error: null,
        }));
      }, options.rollbackDelay || 3000);

      return null;
    }
  }, [state.value, updateFn, options]);

  return {
    value: state.isPending ? state.optimisticValue : state.value,
    isPending: state.isPending,
    error: state.error,
    update,
  };
}

// Hook for handling form state with recovery
export function useFormWithRecovery<T extends Record<string, unknown>>(initialState: T) {
  const [formState, setFormState] = useState<T>(initialState);
  const [savedState, setSavedState] = useState<T>(initialState);
  const [isDirty, setIsDirty] = useState(false);

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setFormState(prev => {
      const newState = { ...prev, [field]: value };
      setIsDirty(JSON.stringify(newState) !== JSON.stringify(savedState));
      return newState;
    });
  }, [savedState]);

  const save = useCallback(() => {
    setSavedState(formState);
    setIsDirty(false);
  }, [formState]);

  const reset = useCallback(() => {
    setFormState(savedState);
    setIsDirty(false);
  }, [savedState]);

  const clear = useCallback(() => {
    setFormState(initialState);
    setSavedState(initialState);
    setIsDirty(false);
  }, [initialState]);

  return {
    formState,
    updateField,
    save,
    reset,
    clear,
    isDirty,
  };
}

// Auto-save to IndexedDB
export function useAutoSave<T>(
  key: string,
  data: T,
  debounceMs: number = 1000
) {
  const timeoutRef = useRef<number | null>(null);

  const saveToStorage = useCallback(async (dataToSave: T) => {
    try {
      await storageService.saveAppState({
        lastKnownGoodState: {
          [key]: dataToSave,
          savedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }, [key]);

  // Debounced save
  const debouncedSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      saveToStorage(data);
    }, debounceMs);
  }, [data, debounceMs, saveToStorage]);

  return { saveNow: () => saveToStorage(data), debouncedSave };
}

import { useApp } from '../contexts/AppContext';

export function StatusBar() {
  const { isOnline, isSyncing, pendingSyncCount } = useApp();

  if (isOnline && !isSyncing && pendingSyncCount === 0) {
    return null;
  }

  const getStatusMessage = () => {
    if (!isOnline) {
      return 'Sin conexión. Todo queda guardado localmente.';
    }
    if (isSyncing) {
      return 'Sincronizando...';
    }
    if (pendingSyncCount > 0) {
      return `${pendingSyncCount} cambio(s) pendiente(s)`;
    }
    return '';
  };

  const getStatusClass = () => {
    if (!isOnline) return 'offline';
    if (isSyncing) return 'syncing';
    return '';
  };

  return (
    <div className={`status-bar ${getStatusClass()}`}>
      <span className={`status-dot ${getStatusClass()}`}></span>
      <span>{getStatusMessage()}</span>
    </div>
  );
}

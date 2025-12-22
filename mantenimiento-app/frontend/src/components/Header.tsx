import { useApp } from '../contexts/AppContext';

export function Header() {
  const { user, logout } = useApp();

  const firstName = user?.fullName.split(' ')[0] || '';

  return (
    <header className="app-header">
      <div className="header-content">
        <h1>Mantenimiento</h1>
        {user && (
          <div className="header-user">
            <span>Hola, {firstName}</span>
            <button
              onClick={logout}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                marginLeft: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              Salir
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

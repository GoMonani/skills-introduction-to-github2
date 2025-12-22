import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { Ticket } from '../types';

function TicketCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    if (diffHours < 1) return 'Hace un momento';
    if (diffHours < 24) return `Hace ${Math.floor(diffHours)} hora(s)`;
    if (diffDays < 7) return `Hace ${Math.floor(diffDays)} día(s)`;
    return date.toLocaleDateString('es-VE');
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pendiente: 'Pendiente',
      en_progreso: 'En Progreso',
      esperando_respuesta: 'Esperando',
      completado: 'Completado',
      cancelado: 'Cancelado',
    };
    return labels[status] || status;
  };

  return (
    <div className="ticket-card" onClick={onClick}>
      <div className="ticket-header">
        <span className="ticket-code">{ticket.code}</span>
        <span className={`status-badge ${ticket.status}`}>
          {getStatusLabel(ticket.status)}
        </span>
      </div>
      <h3 className="ticket-title">{ticket.title}</h3>
      <p className="ticket-description">{ticket.description}</p>
      <div style={{ marginBottom: '0.5rem' }}>
        <div className="progress-bar">
          <div
            className={`progress-bar-fill ${ticket.progress === 100 ? 'complete' : ''}`}
            style={{ width: `${ticket.progress}%` }}
          />
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {ticket.progress}% completado
        </span>
      </div>
      <div className="ticket-meta">
        <span className={`priority-badge ${ticket.priority}`}>
          {ticket.priority}
        </span>
        <span>{formatDate(ticket.updatedAt)}</span>
      </div>
    </div>
  );
}

export function HomePage() {
  const { user, tickets, refreshTickets } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    refreshTickets();
  }, [refreshTickets]);

  const firstName = user?.fullName.split(' ')[0] || '';

  const activeTickets = tickets.filter(t => t.status !== 'completado' && t.status !== 'cancelado');
  const completedTickets = tickets.filter(t => t.status === 'completado');

  return (
    <div className="main-content">
      <div className="mb-4">
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>
          Hola, {firstName}
        </h2>
        <p className="text-secondary">
          {activeTickets.length === 0
            ? '¿Todo tranquilo? Puedes crear un nuevo trabajo.'
            : `Tienes ${activeTickets.length} trabajo(s) activo(s)`}
        </p>
      </div>

      <button
        className="btn btn-primary btn-block btn-lg mb-4"
        onClick={() => navigate('/nuevo')}
      >
        + Crear trabajo de Mantenimiento
      </button>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <button
          className="btn btn-outline btn-block"
          onClick={() => navigate('/dashboard')}
        >
          Ver Dashboard
        </button>
      </div>

      {activeTickets.length > 0 && (
        <div className="mb-4">
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            Trabajos Activos
          </h3>
          {activeTickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onClick={() => navigate(`/ticket/${ticket.id}`)}
            />
          ))}
        </div>
      )}

      {completedTickets.length > 0 && (
        <div>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            Trabajos Completados
          </h3>
          {completedTickets.slice(0, 5).map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onClick={() => navigate(`/ticket/${ticket.id}`)}
            />
          ))}
        </div>
      )}

      {tickets.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <p className="empty-state-title">No hay trabajos aún</p>
          <p>Crea tu primer trabajo de mantenimiento</p>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { apiService } from '../services/api';
import { Ticket, Message, Commitment, TicketStatus } from '../types';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, users, refreshTickets } = useApp();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'info' | 'compromisos'>('chat');

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [finalEvidence, setFinalEvidence] = useState('');
  const [closingNotes, setClosingNotes] = useState('');

  const loadTicket = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    const result = await apiService.getTicket(id);

    if (result.success && result.data) {
      setTicket(result.data.ticket);
      setMessages(result.data.messages);
      setCommitments(result.data.commitments);
    } else {
      setError(result.error || 'No se pudo cargar el trabajo');
    }

    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !ticket) return;

    setIsSending(true);
    const result = await apiService.sendMessage(ticket.id, newMessage.trim());

    if (result.success && result.data) {
      setMessages(prev => [...prev, result.data!]);
      setNewMessage('');
    }

    setIsSending(false);
  };

  const handleUpdateProgress = async (newProgress: number) => {
    if (!ticket) return;

    const result = await apiService.updateTicket(ticket.id, { progress: newProgress });

    if (result.success && result.data) {
      setTicket(result.data);
      await refreshTickets();
    }
  };

  const handleUpdateStatus = async (newStatus: TicketStatus) => {
    if (!ticket) return;

    if (newStatus === 'completado') {
      setShowCompleteModal(true);
      return;
    }

    const result = await apiService.updateTicket(ticket.id, { status: newStatus });

    if (result.success && result.data) {
      setTicket(result.data);
      await refreshTickets();
    }
  };

  const handleComplete = async () => {
    if (!ticket || !finalEvidence.trim() || !closingNotes.trim()) return;

    const result = await apiService.completeTicket(ticket.id, finalEvidence, closingNotes);

    if (result.success && result.data) {
      setTicket(result.data);
      setShowCompleteModal(false);
      await refreshTickets();
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-VE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pendiente: 'Pendiente',
      en_progreso: 'En Progreso',
      esperando_respuesta: 'Esperando Respuesta',
      completado: 'Completado',
      cancelado: 'Cancelado',
    };
    return labels[status] || status;
  };

  if (isLoading) {
    return (
      <div className="main-content loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <p className="empty-state-title">{error || 'Trabajo no encontrado'}</p>
          <button className="btn btn-primary mt-4" onClick={() => navigate('/')}>
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  const isCompleted = ticket.status === 'completado';

  return (
    <div className="main-content" style={{ paddingBottom: 120 }}>
      {/* Header */}
      <div className="mb-4">
        <button
          className="btn btn-outline btn-sm mb-2"
          onClick={() => navigate('/')}
        >
          ← Volver
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span className="ticket-code">{ticket.code}</span>
            <h1 style={{ fontSize: '1.25rem', marginTop: '0.5rem' }}>{ticket.title}</h1>
          </div>
          <span className={`status-badge ${ticket.status}`}>
            {getStatusLabel(ticket.status)}
          </span>
        </div>

        {/* Progress */}
        {!isCompleted && (
          <div className="mt-3">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span className="text-secondary" style={{ fontSize: '0.875rem' }}>Progreso</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{ticket.progress}%</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${ticket.progress}%` }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {[0, 25, 50, 75, 100].map(p => (
                <button
                  key={p}
                  className={`btn btn-sm ${ticket.progress === p ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => handleUpdateProgress(p)}
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: '1rem' }}>
        {['chat', 'info', 'compromisos'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            style={{
              flex: 1,
              padding: '0.75rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: '-2px',
            }}
          >
            {tab === 'chat' && 'Mensajes'}
            {tab === 'info' && 'Información'}
            {tab === 'compromisos' && 'Compromisos'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'chat' && (
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="empty-state">
              <p>No hay mensajes aún</p>
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={`message ${msg.senderId === user?.id ? 'sent' : 'received'}`}
              >
                {msg.senderId !== user?.id && (
                  <div className="message-sender">{msg.senderName}</div>
                )}
                <div className="message-content">{msg.content}</div>
                <div className="message-time">
                  {formatDate(msg.createdAt)}
                  {msg.senderId === user?.id && (
                    <span className="message-status">
                      {msg.status === 'pending' ? '⏳' : msg.status === 'sent' ? '✓' : '✓✓'}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'info' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <div className="card-header"><strong>Descripción</strong></div>
            <div className="card-body">{ticket.description}</div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="card" style={{ flex: 1 }}>
              <div className="card-header"><strong>Área</strong></div>
              <div className="card-body">{ticket.area}</div>
            </div>
            <div className="card" style={{ flex: 1 }}>
              <div className="card-header"><strong>Prioridad</strong></div>
              <div className="card-body">
                <span className={`priority-badge ${ticket.priority}`}>{ticket.priority}</span>
              </div>
            </div>
          </div>

          {ticket.equipment && (
            <div className="card">
              <div className="card-header"><strong>Equipo</strong></div>
              <div className="card-body">{ticket.equipment}</div>
            </div>
          )}

          {ticket.aiSummary && (
            <>
              <div className="card">
                <div className="card-header"><strong>Análisis IA - Resumen</strong></div>
                <div className="card-body">{ticket.aiSummary}</div>
              </div>

              {ticket.aiPossibleCause && (
                <div className="card">
                  <div className="card-header"><strong>Posible Causa</strong></div>
                  <div className="card-body">{ticket.aiPossibleCause}</div>
                </div>
              )}

              {ticket.aiSteps && (
                <div className="card">
                  <div className="card-header"><strong>Pasos Sugeridos</strong></div>
                  <div className="card-body" style={{ whiteSpace: 'pre-line' }}>{ticket.aiSteps}</div>
                </div>
              )}
            </>
          )}

          {ticket.photoUrls.length > 0 && (
            <div className="card">
              <div className="card-header"><strong>Fotos</strong></div>
              <div className="card-body">
                <div className="file-preview">
                  {ticket.photoUrls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="file-preview-item"
                    >
                      <img src={url} alt={`Foto ${i + 1}`} />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isCompleted && (
            <div className="card">
              <div className="card-header"><strong>Cambiar Estado</strong></div>
              <div className="card-body">
                <select
                  className="form-select"
                  value={ticket.status}
                  onChange={(e) => handleUpdateStatus(e.target.value as TicketStatus)}
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="en_progreso">En Progreso</option>
                  <option value="esperando_respuesta">Esperando Respuesta</option>
                  <option value="completado">Completado</option>
                </select>
              </div>
            </div>
          )}

          {isCompleted && ticket.closingNotes && (
            <div className="card" style={{ background: '#dcfce7' }}>
              <div className="card-header"><strong>Notas de Cierre</strong></div>
              <div className="card-body">{ticket.closingNotes}</div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'compromisos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {commitments.length === 0 ? (
            <div className="empty-state">
              <p>No hay compromisos registrados</p>
            </div>
          ) : (
            commitments.map(c => (
              <div key={c.id} className="card">
                <div className="card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{c.description}</strong>
                    <span className={`status-badge ${c.status}`}>{c.status}</span>
                  </div>
                  <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
                    Asignado a: {users.find(u => u.id === c.assignedToId)?.fullName || 'Usuario'}
                  </p>
                  <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
                    Fecha límite: {new Date(c.dueDate).toLocaleDateString('es-VE')}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Message Input - Fixed at bottom */}
      {activeTab === 'chat' && !isCompleted && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
            padding: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', maxWidth: 800, margin: '0 auto' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Escribe un mensaje..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={isSending}
            />
            <button
              className="btn btn-primary"
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || isSending}
            >
              {isSending ? '...' : 'Enviar'}
            </button>
          </div>
        </div>
      )}

      {/* Complete Modal */}
      {showCompleteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Completar Trabajo</h3>
              <button className="modal-close" onClick={() => setShowCompleteModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="mb-3">
                Para completar el trabajo necesitamos evidencia final y una breve explicación.
              </p>

              <div className="form-group">
                <label className="form-label">Evidencia final</label>
                <textarea
                  className="form-textarea"
                  placeholder="Describe qué se hizo y cómo quedó..."
                  value={finalEvidence}
                  onChange={(e) => setFinalEvidence(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirmación</label>
                <textarea
                  className="form-textarea"
                  placeholder="Confirma que el sistema está funcionando correctamente..."
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowCompleteModal(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-success"
                onClick={handleComplete}
                disabled={!finalEvidence.trim() || !closingNotes.trim()}
              >
                Completar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

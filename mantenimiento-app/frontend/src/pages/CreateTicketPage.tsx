import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { apiService } from '../services/api';
import { WizardStep, WizardState, TicketCreateInput, TicketTone, TicketPriority, AIAnalysis } from '../types';

const STEPS: WizardStep[] = ['description', 'confirmation', 'tone', 'area', 'photos', 'analysis', 'people', 'review'];

const AREAS = [
  'Producción',
  'Mantenimiento',
  'Almacén',
  'Oficinas',
  'Exteriores',
  'Servicios Generales',
  'Otro',
];

export function CreateTicketPage() {
  const navigate = useNavigate();
  const { user, users, refreshTickets } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<WizardState>({
    currentStep: 'description',
    data: {
      priority: 'media',
      tone: 'formal',
    },
    photos: [],
    isProcessing: false,
  });

  const [description, setDescription] = useState('');
  const [aiConfirmation, setAiConfirmation] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [customArea, setCustomArea] = useState('');

  const currentStepIndex = STEPS.indexOf(state.currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const updateData = useCallback((updates: Partial<TicketCreateInput>) => {
    setState(prev => ({
      ...prev,
      data: { ...prev.data, ...updates },
    }));
  }, []);

  const goNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setState(prev => ({ ...prev, currentStep: STEPS[nextIndex] }));
    }
  }, [currentStepIndex]);

  const goBack = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setState(prev => ({ ...prev, currentStep: STEPS[prevIndex] }));
    } else {
      navigate(-1);
    }
  }, [currentStepIndex, navigate]);

  const handleDescriptionNext = async () => {
    if (!description.trim()) {
      setState(prev => ({ ...prev, error: 'Por favor describe el problema' }));
      return;
    }

    updateData({ description: description.trim() });
    setState(prev => ({ ...prev, isProcessing: true, error: undefined }));

    try {
      const result = await apiService.confirmUnderstanding(description);
      if (result.success && result.data) {
        setAiConfirmation(result.data.confirmation);
      } else {
        setAiConfirmation(`Entendido. Tienes un problema con: "${description.substring(0, 100)}...". ¿Es correcto?`);
      }
    } catch {
      setAiConfirmation(`Entendido. Tienes un problema con: "${description.substring(0, 100)}...". ¿Es correcto?`);
    }

    setState(prev => ({ ...prev, isProcessing: false }));
    goNext();
  };

  const handlePhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setState(prev => ({
      ...prev,
      photos: [...prev.photos, ...files],
    }));
  };

  const removePhoto = (index: number) => {
    setState(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index),
    }));
  };

  const handleAnalyze = async () => {
    setState(prev => ({ ...prev, isProcessing: true, error: undefined }));

    try {
      const result = await apiService.analyzeRequest(
        state.data.description || '',
        state.data.area || '',
        state.data.equipment
      );

      if (result.success && result.data) {
        setAiAnalysis(result.data);
        updateData({
          title: result.data.summary.substring(0, 100),
        });
      }
    } catch {
      setState(prev => ({ ...prev, error: 'No se pudo analizar. Continúa de todos modos.' }));
    }

    setState(prev => ({ ...prev, isProcessing: false }));
    goNext();
  };

  const handleSubmit = async () => {
    setState(prev => ({ ...prev, isProcessing: true, error: undefined }));

    try {
      const input: TicketCreateInput = {
        title: state.data.title || state.data.description?.substring(0, 100) || 'Nuevo trabajo',
        description: state.data.description || '',
        area: state.data.area === 'Otro' ? customArea : (state.data.area || ''),
        equipment: state.data.equipment,
        priority: state.data.priority || 'media',
        tone: state.data.tone || 'formal',
        assignedToIds: selectedUsers,
      };

      const result = await apiService.createTicket(input);

      if (result.success && result.data) {
        // Upload photos if any
        if (state.photos.length > 0) {
          await apiService.uploadFiles(result.data.id, state.photos);
        }

        await refreshTickets();
        navigate(`/ticket/${result.data.id}`);
      } else {
        setState(prev => ({ ...prev, error: result.error || 'Error al crear el trabajo' }));
      }
    } catch {
      setState(prev => ({ ...prev, error: 'Error al crear el trabajo' }));
    }

    setState(prev => ({ ...prev, isProcessing: false }));
  };

  const renderStep = () => {
    switch (state.currentStep) {
      case 'description':
        return (
          <>
            <h2 className="wizard-title">¿Qué pasó?</h2>
            <p className="wizard-subtitle">
              Cuéntame con tus palabras qué problema estás viendo. Entre más detalles, mejor puedo ayudarte.
            </p>
            <div className="form-group mt-4">
              <textarea
                className="form-textarea"
                placeholder="Ej: El aire acondicionado de la oficina principal no está enfriando bien. Hace un ruido raro desde ayer..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ minHeight: 150 }}
                autoFocus
              />
            </div>
          </>
        );

      case 'confirmation':
        return (
          <>
            <h2 className="wizard-title">¿Entendí bien?</h2>
            <div className="card mt-4" style={{ background: 'var(--primary-light)' }}>
              <div className="card-body">
                <p>{aiConfirmation}</p>
              </div>
            </div>
            <p className="text-secondary mt-4" style={{ fontSize: '0.875rem' }}>
              Si no es correcto, puedes volver y ajustar la descripción.
            </p>
          </>
        );

      case 'tone':
        return (
          <>
            <h2 className="wizard-title">¿Qué tan urgente es?</h2>
            <p className="wizard-subtitle">
              Esto nos ayuda a priorizar y comunicarnos adecuadamente.
            </p>

            <div className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { value: 'baja', label: 'Puede esperar', desc: 'No hay apuro' },
                { value: 'media', label: 'Normal', desc: 'Atender cuando se pueda' },
                { value: 'alta', label: 'Importante', desc: 'Atender pronto' },
                { value: 'urgente', label: 'Urgente', desc: 'Necesita atención inmediata' },
              ].map((option) => (
                <label
                  key={option.value}
                  className="card"
                  style={{
                    cursor: 'pointer',
                    border: state.data.priority === option.value ? '2px solid var(--primary)' : '2px solid transparent',
                  }}
                >
                  <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <input
                      type="radio"
                      name="priority"
                      value={option.value}
                      checked={state.data.priority === option.value}
                      onChange={(e) => updateData({ priority: e.target.value as TicketPriority })}
                    />
                    <div>
                      <strong>{option.label}</strong>
                      <p className="text-secondary" style={{ fontSize: '0.875rem', margin: 0 }}>
                        {option.desc}
                      </p>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div className="mt-4">
              <label className="form-label">Tono de comunicación</label>
              <select
                className="form-select"
                value={state.data.tone}
                onChange={(e) => updateData({ tone: e.target.value as TicketTone })}
              >
                <option value="formal">Formal y profesional</option>
                <option value="amigable">Amigable y cercano</option>
                <option value="urgente">Directo y urgente</option>
              </select>
            </div>
          </>
        );

      case 'area':
        return (
          <>
            <h2 className="wizard-title">¿Dónde está el problema?</h2>
            <p className="wizard-subtitle">
              Selecciona el área y si aplica, el equipo afectado.
            </p>

            <div className="form-group mt-4">
              <label className="form-label">Área</label>
              <select
                className="form-select"
                value={state.data.area || ''}
                onChange={(e) => updateData({ area: e.target.value })}
              >
                <option value="">Selecciona un área</option>
                {AREAS.map((area) => (
                  <option key={area} value={area}>{area}</option>
                ))}
              </select>
            </div>

            {state.data.area === 'Otro' && (
              <div className="form-group">
                <label className="form-label">Especifica el área</label>
                <input
                  type="text"
                  className="form-input"
                  value={customArea}
                  onChange={(e) => setCustomArea(e.target.value)}
                  placeholder="Nombre del área"
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Equipo afectado (opcional)</label>
              <input
                type="text"
                className="form-input"
                value={state.data.equipment || ''}
                onChange={(e) => updateData({ equipment: e.target.value })}
                placeholder="Ej: Aire acondicionado marca LG"
              />
              <p className="form-helper">
                Si hay un equipo específico, indícalo para tener mejor registro
              </p>
            </div>
          </>
        );

      case 'photos':
        return (
          <>
            <h2 className="wizard-title">Fotos del problema</h2>
            <p className="wizard-subtitle">
              Las fotos son muy importantes. Nos ayudan a entender mejor la situación y sirven como evidencia.
            </p>

            <div
              className="file-upload mt-4"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotosChange}
              />
              <div>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📷</div>
                <p><strong>Toca para agregar fotos</strong></p>
                <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
                  Mínimo 1 foto recomendada
                </p>
              </div>
            </div>

            {state.photos.length > 0 && (
              <div className="file-preview">
                {state.photos.map((photo, index) => (
                  <div key={index} className="file-preview-item">
                    <img src={URL.createObjectURL(photo)} alt={`Foto ${index + 1}`} />
                    <button
                      className="file-preview-remove"
                      onClick={() => removePhoto(index)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="card mt-4" style={{ background: '#fef3c7' }}>
              <div className="card-body" style={{ fontSize: '0.875rem' }}>
                <strong>Tip:</strong> Si es un equipo, toma foto de la placa con el modelo y serie. Esto ayuda a conseguir repuestos.
              </div>
            </div>
          </>
        );

      case 'analysis':
        return (
          <>
            <h2 className="wizard-title">Análisis del problema</h2>

            {state.isProcessing ? (
              <div className="loading mt-4">
                <div className="spinner"></div>
                <p className="mt-2">Analizando la situación...</p>
              </div>
            ) : aiAnalysis ? (
              <div className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="card">
                  <div className="card-header"><strong>Resumen</strong></div>
                  <div className="card-body">{aiAnalysis.summary}</div>
                </div>

                <div className="card">
                  <div className="card-header"><strong>Posible causa</strong></div>
                  <div className="card-body">{aiAnalysis.possibleCause}</div>
                </div>

                <div className="card">
                  <div className="card-header"><strong>Riesgo si no se atiende</strong></div>
                  <div className="card-body">{aiAnalysis.risk}</div>
                </div>

                <div className="card">
                  <div className="card-header"><strong>Pasos sugeridos</strong></div>
                  <div className="card-body" style={{ whiteSpace: 'pre-line' }}>{aiAnalysis.steps}</div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><strong>Tiempo estimado</strong></div>
                    <div className="card-body">{aiAnalysis.timeEstimate}</div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><strong>Posibles repuestos</strong></div>
                    <div className="card-body">{aiAnalysis.parts}</div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-secondary mt-4">
                No se pudo generar el análisis. Puedes continuar de todos modos.
              </p>
            )}
          </>
        );

      case 'people':
        return (
          <>
            <h2 className="wizard-title">¿Quién más debe ver esto?</h2>
            <p className="wizard-subtitle">
              Agrega a las personas que deben participar en este trabajo. Les enviaremos una invitación.
            </p>

            <div className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {users
                .filter(u => u.id !== user?.id)
                .map((u) => (
                  <label
                    key={u.id}
                    className="card"
                    style={{
                      cursor: 'pointer',
                      border: selectedUsers.includes(u.id) ? '2px solid var(--primary)' : '2px solid transparent',
                    }}
                  >
                    <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(u.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUsers(prev => [...prev, u.id]);
                          } else {
                            setSelectedUsers(prev => prev.filter(id => id !== u.id));
                          }
                        }}
                      />
                      <div>
                        <strong>{u.fullName}</strong>
                        <p className="text-secondary" style={{ fontSize: '0.875rem', margin: 0 }}>
                          {u.email}
                        </p>
                      </div>
                    </div>
                  </label>
                ))}
            </div>

            {users.filter(u => u.id !== user?.id).length === 0 && (
              <p className="text-secondary mt-4">
                No hay otros usuarios registrados aún. Puedes agregarlos después.
              </p>
            )}
          </>
        );

      case 'review':
        return (
          <>
            <h2 className="wizard-title">Revisa y confirma</h2>
            <p className="wizard-subtitle">
              Verifica que todo esté correcto antes de crear el trabajo.
            </p>

            <div className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="card">
                <div className="card-header"><strong>Descripción</strong></div>
                <div className="card-body">{state.data.description}</div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="card" style={{ flex: 1 }}>
                  <div className="card-header"><strong>Área</strong></div>
                  <div className="card-body">
                    {state.data.area === 'Otro' ? customArea : state.data.area}
                  </div>
                </div>
                <div className="card" style={{ flex: 1 }}>
                  <div className="card-header"><strong>Prioridad</strong></div>
                  <div className="card-body">
                    <span className={`priority-badge ${state.data.priority}`}>
                      {state.data.priority}
                    </span>
                  </div>
                </div>
              </div>

              {state.data.equipment && (
                <div className="card">
                  <div className="card-header"><strong>Equipo</strong></div>
                  <div className="card-body">{state.data.equipment}</div>
                </div>
              )}

              {state.photos.length > 0 && (
                <div className="card">
                  <div className="card-header"><strong>Fotos ({state.photos.length})</strong></div>
                  <div className="card-body">
                    <div className="file-preview">
                      {state.photos.slice(0, 4).map((photo, index) => (
                        <div key={index} className="file-preview-item">
                          <img src={URL.createObjectURL(photo)} alt={`Foto ${index + 1}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedUsers.length > 0 && (
                <div className="card">
                  <div className="card-header"><strong>Personas asignadas</strong></div>
                  <div className="card-body">
                    {selectedUsers.map(id => users.find(u => u.id === id)?.fullName).join(', ')}
                  </div>
                </div>
              )}
            </div>
          </>
        );
    }
  };

  const canProceed = () => {
    switch (state.currentStep) {
      case 'description':
        return description.trim().length > 10;
      case 'area':
        return state.data.area && (state.data.area !== 'Otro' || customArea);
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (state.currentStep === 'description') {
      await handleDescriptionNext();
    } else if (state.currentStep === 'photos') {
      await handleAnalyze();
    } else if (state.currentStep === 'review') {
      await handleSubmit();
    } else {
      goNext();
    }
  };

  return (
    <div className="wizard-container main-content">
      <div className="wizard-header">
        <div className="wizard-progress">
          {STEPS.map((step, index) => (
            <div
              key={step}
              className={`wizard-step ${index < currentStepIndex ? 'completed' : ''} ${index === currentStepIndex ? 'active' : ''}`}
            />
          ))}
        </div>
        <p className="text-secondary" style={{ fontSize: '0.75rem' }}>
          Paso {currentStepIndex + 1} de {STEPS.length}
        </p>
      </div>

      <div className="wizard-content">
        {renderStep()}
        {state.error && <p className="form-error mt-2">{state.error}</p>}
      </div>

      <div className="wizard-footer">
        <button className="btn btn-outline" onClick={goBack} disabled={state.isProcessing}>
          {isFirstStep ? 'Cancelar' : 'Atrás'}
        </button>
        <button
          className="btn btn-primary btn-block"
          onClick={handleNext}
          disabled={!canProceed() || state.isProcessing}
        >
          {state.isProcessing ? 'Procesando...' : isLastStep ? 'Crear Trabajo' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}

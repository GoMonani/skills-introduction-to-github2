import { useState } from 'react';
import { useApp } from '../contexts/AppContext';

export function LoginPage() {
  const { login } = useApp();
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validateFullName = (name: string): string | null => {
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) {
      return 'Incluye tu nombre y la inicial de tu apellido (ej: "Juan P.")';
    }
    const lastName = parts[parts.length - 1];
    if (!lastName.endsWith('.')) {
      return 'La inicial del apellido debe terminar con punto (ej: "Juan P.")';
    }
    if (lastName.length !== 2) {
      return 'Solo incluye la inicial del apellido (ej: "Juan P.")';
    }
    return null;
  };

  const handleNext = () => {
    setError('');

    if (step === 1) {
      const nameError = validateFullName(fullName);
      if (nameError) {
        setError(nameError);
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!email || !email.includes('@')) {
        setError('Por favor ingresa un correo válido');
        return;
      }
      setStep(3);
    }
  };

  const handleSubmit = async () => {
    setError('');

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      setError('Por favor ingresa un número de teléfono válido');
      return;
    }

    setIsLoading(true);

    const result = await login(fullName.trim(), email.trim(), phone.trim());

    if (!result.success) {
      setError(result.error || 'Error al registrarse');
      setIsLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            <h2 className="wizard-title">¿Cómo te llamas?</h2>
            <p className="wizard-subtitle">
              Escribe tu nombre completo y la inicial de tu apellido con punto.
            </p>
            <div className="form-group mt-4">
              <input
                type="text"
                className="form-input"
                placeholder='Ej: "Giancarlos P."'
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoFocus
              />
              <p className="form-helper">
                Usamos tu nombre para que el equipo te reconozca
              </p>
            </div>
          </>
        );

      case 2:
        return (
          <>
            <h2 className="wizard-title">¿Cuál es tu correo?</h2>
            <p className="wizard-subtitle">
              Te enviaremos notificaciones importantes aquí.
            </p>
            <div className="form-group mt-4">
              <input
                type="email"
                className="form-input"
                placeholder="tucorreo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
          </>
        );

      case 3:
        return (
          <>
            <h2 className="wizard-title">¿Tu número de teléfono?</h2>
            <p className="wizard-subtitle">
              Para enviarte mensajes de WhatsApp y SMS sobre los trabajos.
            </p>
            <div className="form-group mt-4">
              <input
                type="tel"
                className="form-input"
                placeholder="0412-1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
              <p className="form-helper">
                Incluye el código de área
              </p>
            </div>
          </>
        );
    }
  };

  return (
    <div className="main-content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ maxWidth: 400, margin: '0 auto', width: '100%' }}>
        <div className="card-header text-center">
          <h1 style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>Mantenimiento</h1>
          <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
            Gestión de trabajos de mantenimiento
          </p>
        </div>

        <div className="card-body">
          <div className="wizard-progress mb-4">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`wizard-step ${s < step ? 'completed' : ''} ${s === step ? 'active' : ''}`}
              />
            ))}
          </div>

          {renderStep()}

          {error && (
            <p className="form-error mt-2">{error}</p>
          )}
        </div>

        <div className="card-footer">
          <div style={{ display: 'flex', gap: '1rem' }}>
            {step > 1 && (
              <button
                className="btn btn-outline"
                onClick={() => setStep(step - 1)}
                disabled={isLoading}
              >
                Atrás
              </button>
            )}
            {step < 3 ? (
              <button
                className="btn btn-primary btn-block"
                onClick={handleNext}
              >
                Continuar
              </button>
            ) : (
              <button
                className="btn btn-primary btn-block"
                onClick={handleSubmit}
                disabled={isLoading}
              >
                {isLoading ? 'Entrando...' : 'Entrar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

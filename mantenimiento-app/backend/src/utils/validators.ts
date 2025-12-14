import { body, param, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

// Validate full name format: "Giancarlos P." (two words, second ends with .)
export const validateFullName = body('fullName')
  .trim()
  .notEmpty()
  .withMessage('El nombre es requerido')
  .custom((value: string) => {
    const parts = value.trim().split(/\s+/);
    if (parts.length < 2) {
      throw new Error('Debes incluir tu nombre y la inicial de tu apellido (ej: "Juan P.")');
    }
    const lastName = parts[parts.length - 1];
    if (!lastName.endsWith('.')) {
      throw new Error('La inicial del apellido debe terminar con punto (ej: "Juan P.")');
    }
    if (lastName.length !== 2) {
      throw new Error('Solo incluye la inicial del apellido con punto (ej: "Juan P.")');
    }
    return true;
  });

export const validateEmail = body('email')
  .trim()
  .notEmpty()
  .withMessage('El correo es requerido')
  .isEmail()
  .withMessage('Por favor ingresa un correo válido')
  .normalizeEmail();

export const validatePhone = body('phone')
  .trim()
  .notEmpty()
  .withMessage('El teléfono es requerido')
  .custom((value: string) => {
    const cleaned = value.replace(/[^\d+]/g, '');
    if (cleaned.length < 10) {
      throw new Error('El número de teléfono es muy corto');
    }
    if (cleaned.length > 15) {
      throw new Error('El número de teléfono es muy largo');
    }
    return true;
  });

export const validateTicketTitle = body('title')
  .trim()
  .notEmpty()
  .withMessage('El título es requerido')
  .isLength({ min: 5, max: 200 })
  .withMessage('El título debe tener entre 5 y 200 caracteres');

export const validateTicketDescription = body('description')
  .trim()
  .notEmpty()
  .withMessage('La descripción es requerida')
  .isLength({ min: 10 })
  .withMessage('La descripción debe tener al menos 10 caracteres');

export const validateTicketArea = body('area')
  .trim()
  .notEmpty()
  .withMessage('El área es requerida');

export const validateTicketPriority = body('priority')
  .isIn(['baja', 'media', 'alta', 'urgente'])
  .withMessage('Prioridad inválida');

export const validateTicketTone = body('tone')
  .isIn(['formal', 'amigable', 'urgente'])
  .withMessage('Tono inválido');

export const validateIdParam = param('id')
  .notEmpty()
  .withMessage('ID es requerido')
  .isUUID()
  .withMessage('ID inválido');

export const validateMessageContent = body('content')
  .trim()
  .notEmpty()
  .withMessage('El mensaje no puede estar vacío');

export const validateMessageType = body('type')
  .isIn(['text', 'voice', 'photo', 'video', 'document', 'system'])
  .withMessage('Tipo de mensaje inválido');

export const validateIdempotencyKey = body('idempotencyKey')
  .trim()
  .notEmpty()
  .withMessage('Se requiere una clave de idempotencia');

export const validateCommitmentDescription = body('description')
  .trim()
  .notEmpty()
  .withMessage('La descripción del compromiso es requerida');

export const validateCommitmentDueDate = body('dueDate')
  .notEmpty()
  .withMessage('La fecha límite es requerida')
  .isISO8601()
  .withMessage('Formato de fecha inválido');

// Validation error handler
export function handleValidationErrors(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const messages = errors.array().map(err => err.msg);
    res.status(400).json({
      success: false,
      error: messages[0], // Return first error for simplicity
      errors: messages,
    });
    return;
  }

  next();
}

// User registration validators
export const userRegistrationValidators = [
  validateFullName,
  validateEmail,
  validatePhone,
  handleValidationErrors,
];

// Ticket creation validators
export const ticketCreationValidators = [
  validateTicketTitle,
  validateTicketDescription,
  validateTicketArea,
  validateTicketPriority,
  validateTicketTone,
  handleValidationErrors,
];

// Message creation validators
export const messageCreationValidators = [
  validateMessageContent,
  validateMessageType,
  validateIdempotencyKey,
  handleValidationErrors,
];

// Commitment creation validators
export const commitmentCreationValidators = [
  validateCommitmentDescription,
  validateCommitmentDueDate,
  handleValidationErrors,
];

// User Types
export interface User {
  id: string;
  fullName: string; // "Giancarlos P." format
  email: string;
  phone: string;
  createdAt: string;
  lastLoginAt: string;
  status: 'active' | 'inactive';
}

export interface UserCreateInput {
  fullName: string;
  email: string;
  phone: string;
}

// Ticket (Maintenance Job) Types
export type TicketStatus =
  | 'pendiente'
  | 'en_progreso'
  | 'esperando_respuesta'
  | 'completado'
  | 'cancelado';

export type TicketPriority = 'baja' | 'media' | 'alta' | 'urgente';

export type TicketTone = 'formal' | 'amigable' | 'urgente';

export interface Ticket {
  id: string;
  code: string; // TCK_001, TCK_002, etc.
  title: string;
  description: string;
  voiceTranscription?: string;
  area: string;
  equipment?: string;
  priority: TicketPriority;
  tone: TicketTone;
  status: TicketStatus;
  progress: number; // 0-100
  createdById: string;
  assignedToIds: string[];
  aiSummary?: string;
  aiPossibleCause?: string;
  aiRisk?: string;
  aiSteps?: string;
  aiTimeEstimate?: string;
  aiParts?: string;
  driveFolderId?: string;
  photoUrls: string[];
  videoUrls: string[];
  docUrls: string[];
  voiceUrls: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  finalEvidence?: string;
  closingNotes?: string;
}

export interface TicketCreateInput {
  title: string;
  description: string;
  voiceTranscription?: string;
  area: string;
  equipment?: string;
  priority: TicketPriority;
  tone: TicketTone;
  assignedToIds?: string[];
}

// Message Types
export type MessageType = 'text' | 'voice' | 'photo' | 'video' | 'document' | 'system';
export type MessageChannel = 'app' | 'whatsapp' | 'sms' | 'email';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'queued';

export interface Message {
  id: string;
  ticketId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: MessageType;
  channel: MessageChannel;
  status: MessageStatus;
  fileUrl?: string;
  mentionedUserIds: string[];
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  retryCount: number;
  idempotencyKey: string;
}

export interface MessageCreateInput {
  ticketId: string;
  content: string;
  type: MessageType;
  channel?: MessageChannel;
  mentionedUserIds?: string[];
  fileUrl?: string;
  idempotencyKey: string;
}

// Commitment Types
export type CommitmentStatus = 'pendiente' | 'cumplido' | 'vencido' | 'cancelado';

export interface Commitment {
  id: string;
  ticketId: string;
  createdById: string;
  assignedToId: string;
  description: string;
  dueDate: string;
  status: CommitmentStatus;
  completedAt?: string;
  reminderSent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommitmentCreateInput {
  ticketId: string;
  assignedToId: string;
  description: string;
  dueDate: string;
}

// Sync Queue Types
export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncEntity = 'ticket' | 'message' | 'commitment' | 'user';
export type SyncStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface SyncItem {
  id: string;
  operation: SyncOperation;
  entity: SyncEntity;
  entityId: string;
  data: Record<string, unknown>;
  status: SyncStatus;
  attempts: number;
  lastAttemptAt?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  idempotencyKey: string;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Auth Types
export interface AuthPayload {
  userId: string;
  email: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// AI Analysis Types
export interface AIAnalysis {
  summary: string;
  possibleCause: string;
  risk: string;
  steps: string;
  timeEstimate: string;
  parts: string;
}

// File Upload Types
export interface FileUpload {
  filename: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface DriveFile {
  id: string;
  name: string;
  webViewLink: string;
  webContentLink: string;
}

// Notification Types
export type NotificationChannel = 'whatsapp' | 'sms' | 'email';

export interface NotificationRequest {
  to: string;
  channel: NotificationChannel;
  subject?: string;
  message: string;
  ticketId?: string;
}

export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  messageId?: string;
  error?: string;
  queued?: boolean;
}

// Express Request Extension
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// User Types
export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  createdAt: string;
  lastLoginAt: string;
  status: 'active' | 'inactive';
}

// Ticket Types
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
  code: string;
  title: string;
  description: string;
  voiceTranscription?: string;
  area: string;
  equipment?: string;
  priority: TicketPriority;
  tone: TicketTone;
  status: TicketStatus;
  progress: number;
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

// Sync Types
export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncEntity = 'ticket' | 'message' | 'commitment';
export type SyncStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface SyncQueueItem {
  id: string;
  operation: SyncOperation;
  entity: SyncEntity;
  entityId: string;
  data: Record<string, unknown>;
  status: SyncStatus;
  attempts: number;
  lastAttemptAt?: string;
  createdAt: string;
  idempotencyKey: string;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Dashboard Stats
export interface DashboardStats {
  total: number;
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<TicketPriority, number>;
  averageProgress: number;
  completedThisMonth: number;
  avgCompletionTime: string;
}

// AI Analysis
export interface AIAnalysis {
  summary: string;
  possibleCause: string;
  risk: string;
  steps: string;
  timeEstimate: string;
  parts: string;
}

// App State
export interface AppState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt?: string;
  pendingSyncCount: number;
  lastError?: string;
  lastKnownGoodState?: Record<string, unknown>;
}

// Wizard Steps
export type WizardStep =
  | 'description'
  | 'confirmation'
  | 'tone'
  | 'area'
  | 'photos'
  | 'analysis'
  | 'people'
  | 'review';

export interface WizardState {
  currentStep: WizardStep;
  data: Partial<TicketCreateInput>;
  photos: File[];
  aiConfirmation?: string;
  aiAnalysis?: AIAnalysis;
  isProcessing: boolean;
  error?: string;
}

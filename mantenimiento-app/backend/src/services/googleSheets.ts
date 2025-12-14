import { google, sheets_v4 } from 'googleapis';
import { config } from '../config';
import {
  User,
  Ticket,
  Message,
  Commitment,
  UserCreateInput,
  TicketCreateInput,
  MessageCreateInput,
  CommitmentCreateInput,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

class GoogleSheetsService {
  private sheets: sheets_v4.Sheets | null = null;
  private initialized = false;

  private async getClient(): Promise<sheets_v4.Sheets> {
    if (this.sheets) return this.sheets;

    const auth = new google.auth.JWT({
      email: config.google.serviceAccountEmail,
      key: config.google.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    return this.sheets;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const sheets = await this.getClient();
    const spreadsheetId = config.google.spreadsheetId;

    // Check if spreadsheet exists and get current sheets
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = spreadsheet.data.sheets?.map(s => s.properties?.title) || [];

    // Create missing sheets with headers
    const requiredSheets = [
      {
        name: config.sheets.users,
        headers: ['id', 'fullName', 'email', 'phone', 'createdAt', 'lastLoginAt', 'status'],
      },
      {
        name: config.sheets.tickets,
        headers: [
          'id', 'code', 'title', 'description', 'voiceTranscription', 'area', 'equipment',
          'priority', 'tone', 'status', 'progress', 'createdById', 'assignedToIds',
          'aiSummary', 'aiPossibleCause', 'aiRisk', 'aiSteps', 'aiTimeEstimate', 'aiParts',
          'driveFolderId', 'photoUrls', 'videoUrls', 'docUrls', 'voiceUrls',
          'createdAt', 'updatedAt', 'completedAt', 'finalEvidence', 'closingNotes'
        ],
      },
      {
        name: config.sheets.messages,
        headers: [
          'id', 'ticketId', 'senderId', 'senderName', 'content', 'type', 'channel',
          'status', 'fileUrl', 'mentionedUserIds', 'createdAt', 'sentAt', 'deliveredAt',
          'retryCount', 'idempotencyKey'
        ],
      },
      {
        name: config.sheets.commitments,
        headers: [
          'id', 'ticketId', 'createdById', 'assignedToId', 'description', 'dueDate',
          'status', 'completedAt', 'reminderSent', 'createdAt', 'updatedAt'
        ],
      },
    ];

    for (const sheet of requiredSheets) {
      if (!existingSheets.includes(sheet.name)) {
        // Add new sheet
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: { title: sheet.name },
                },
              },
            ],
          },
        });

        // Add headers
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheet.name}!A1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [sheet.headers],
          },
        });
      }
    }

    this.initialized = true;
    console.log('✅ Google Sheets initialized');
  }

  // ============ USERS ============

  async createUser(input: UserCreateInput): Promise<User> {
    const sheets = await this.getClient();
    const now = new Date().toISOString();

    const user: User = {
      id: uuidv4(),
      fullName: input.fullName,
      email: input.email.toLowerCase(),
      phone: input.phone,
      createdAt: now,
      lastLoginAt: now,
      status: 'active',
    };

    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.users}!A:G`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          user.id,
          user.fullName,
          user.email,
          user.phone,
          user.createdAt,
          user.lastLoginAt,
          user.status,
        ]],
      },
    });

    return user;
  }

  async getUserById(id: string): Promise<User | null> {
    const users = await this.getAllUsers();
    return users.find(u => u.id === id) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const users = await this.getAllUsers();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async getUserByPhone(phone: string): Promise<User | null> {
    const users = await this.getAllUsers();
    return users.find(u => u.phone === phone) || null;
  }

  async getAllUsers(): Promise<User[]> {
    const sheets = await this.getClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.users}!A2:G`,
    });

    const rows = response.data.values || [];
    return rows.map(row => ({
      id: row[0] || '',
      fullName: row[1] || '',
      email: row[2] || '',
      phone: row[3] || '',
      createdAt: row[4] || '',
      lastLoginAt: row[5] || '',
      status: (row[6] as User['status']) || 'active',
    }));
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    const sheets = await this.getClient();
    const users = await this.getAllUsers();
    const rowIndex = users.findIndex(u => u.id === userId);

    if (rowIndex === -1) return;

    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.users}!F${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[new Date().toISOString()]],
      },
    });
  }

  // ============ TICKETS ============

  async createTicket(input: TicketCreateInput, createdById: string): Promise<Ticket> {
    const sheets = await this.getClient();
    const now = new Date().toISOString();

    // Generate ticket code
    const tickets = await this.getAllTickets();
    const nextNumber = tickets.length + 1;
    const code = `TCK_${String(nextNumber).padStart(3, '0')}`;

    const ticket: Ticket = {
      id: uuidv4(),
      code,
      title: input.title,
      description: input.description,
      voiceTranscription: input.voiceTranscription,
      area: input.area,
      equipment: input.equipment,
      priority: input.priority,
      tone: input.tone,
      status: 'pendiente',
      progress: 0,
      createdById,
      assignedToIds: input.assignedToIds || [],
      photoUrls: [],
      videoUrls: [],
      docUrls: [],
      voiceUrls: [],
      createdAt: now,
      updatedAt: now,
    };

    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.tickets}!A:AD`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          ticket.id,
          ticket.code,
          ticket.title,
          ticket.description,
          ticket.voiceTranscription || '',
          ticket.area,
          ticket.equipment || '',
          ticket.priority,
          ticket.tone,
          ticket.status,
          ticket.progress,
          ticket.createdById,
          JSON.stringify(ticket.assignedToIds),
          ticket.aiSummary || '',
          ticket.aiPossibleCause || '',
          ticket.aiRisk || '',
          ticket.aiSteps || '',
          ticket.aiTimeEstimate || '',
          ticket.aiParts || '',
          ticket.driveFolderId || '',
          JSON.stringify(ticket.photoUrls),
          JSON.stringify(ticket.videoUrls),
          JSON.stringify(ticket.docUrls),
          JSON.stringify(ticket.voiceUrls),
          ticket.createdAt,
          ticket.updatedAt,
          ticket.completedAt || '',
          ticket.finalEvidence || '',
          ticket.closingNotes || '',
        ]],
      },
    });

    return ticket;
  }

  async getTicketById(id: string): Promise<Ticket | null> {
    const tickets = await this.getAllTickets();
    return tickets.find(t => t.id === id) || null;
  }

  async getTicketByCode(code: string): Promise<Ticket | null> {
    const tickets = await this.getAllTickets();
    return tickets.find(t => t.code === code) || null;
  }

  async getAllTickets(): Promise<Ticket[]> {
    const sheets = await this.getClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.tickets}!A2:AD`,
    });

    const rows = response.data.values || [];
    return rows.map(row => ({
      id: row[0] || '',
      code: row[1] || '',
      title: row[2] || '',
      description: row[3] || '',
      voiceTranscription: row[4] || undefined,
      area: row[5] || '',
      equipment: row[6] || undefined,
      priority: (row[7] as Ticket['priority']) || 'media',
      tone: (row[8] as Ticket['tone']) || 'formal',
      status: (row[9] as Ticket['status']) || 'pendiente',
      progress: parseInt(row[10] || '0', 10),
      createdById: row[11] || '',
      assignedToIds: this.parseJsonArray(row[12]),
      aiSummary: row[13] || undefined,
      aiPossibleCause: row[14] || undefined,
      aiRisk: row[15] || undefined,
      aiSteps: row[16] || undefined,
      aiTimeEstimate: row[17] || undefined,
      aiParts: row[18] || undefined,
      driveFolderId: row[19] || undefined,
      photoUrls: this.parseJsonArray(row[20]),
      videoUrls: this.parseJsonArray(row[21]),
      docUrls: this.parseJsonArray(row[22]),
      voiceUrls: this.parseJsonArray(row[23]),
      createdAt: row[24] || '',
      updatedAt: row[25] || '',
      completedAt: row[26] || undefined,
      finalEvidence: row[27] || undefined,
      closingNotes: row[28] || undefined,
    }));
  }

  async getTicketsForUser(userId: string): Promise<Ticket[]> {
    const tickets = await this.getAllTickets();
    return tickets.filter(t =>
      t.createdById === userId || t.assignedToIds.includes(userId)
    );
  }

  async updateTicket(id: string, updates: Partial<Ticket>): Promise<Ticket | null> {
    const sheets = await this.getClient();
    const tickets = await this.getAllTickets();
    const rowIndex = tickets.findIndex(t => t.id === id);

    if (rowIndex === -1) return null;

    const ticket = { ...tickets[rowIndex], ...updates, updatedAt: new Date().toISOString() };

    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.tickets}!A${rowIndex + 2}:AD${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          ticket.id,
          ticket.code,
          ticket.title,
          ticket.description,
          ticket.voiceTranscription || '',
          ticket.area,
          ticket.equipment || '',
          ticket.priority,
          ticket.tone,
          ticket.status,
          ticket.progress,
          ticket.createdById,
          JSON.stringify(ticket.assignedToIds),
          ticket.aiSummary || '',
          ticket.aiPossibleCause || '',
          ticket.aiRisk || '',
          ticket.aiSteps || '',
          ticket.aiTimeEstimate || '',
          ticket.aiParts || '',
          ticket.driveFolderId || '',
          JSON.stringify(ticket.photoUrls),
          JSON.stringify(ticket.videoUrls),
          JSON.stringify(ticket.docUrls),
          JSON.stringify(ticket.voiceUrls),
          ticket.createdAt,
          ticket.updatedAt,
          ticket.completedAt || '',
          ticket.finalEvidence || '',
          ticket.closingNotes || '',
        ]],
      },
    });

    return ticket;
  }

  // ============ MESSAGES ============

  async createMessage(input: MessageCreateInput, senderId: string, senderName: string): Promise<Message> {
    const sheets = await this.getClient();

    // Check for idempotency
    const existing = await this.getMessageByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;

    const now = new Date().toISOString();

    const message: Message = {
      id: uuidv4(),
      ticketId: input.ticketId,
      senderId,
      senderName,
      content: input.content,
      type: input.type,
      channel: input.channel || 'app',
      status: 'pending',
      fileUrl: input.fileUrl,
      mentionedUserIds: input.mentionedUserIds || [],
      createdAt: now,
      retryCount: 0,
      idempotencyKey: input.idempotencyKey,
    };

    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.messages}!A:O`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          message.id,
          message.ticketId,
          message.senderId,
          message.senderName,
          message.content,
          message.type,
          message.channel,
          message.status,
          message.fileUrl || '',
          JSON.stringify(message.mentionedUserIds),
          message.createdAt,
          message.sentAt || '',
          message.deliveredAt || '',
          message.retryCount,
          message.idempotencyKey,
        ]],
      },
    });

    return message;
  }

  async getMessageByIdempotencyKey(key: string): Promise<Message | null> {
    const messages = await this.getMessagesByTicketId('');
    return messages.find(m => m.idempotencyKey === key) || null;
  }

  async getMessagesByTicketId(ticketId: string): Promise<Message[]> {
    const sheets = await this.getClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.messages}!A2:O`,
    });

    const rows = response.data.values || [];
    const messages = rows.map(row => ({
      id: row[0] || '',
      ticketId: row[1] || '',
      senderId: row[2] || '',
      senderName: row[3] || '',
      content: row[4] || '',
      type: (row[5] as Message['type']) || 'text',
      channel: (row[6] as Message['channel']) || 'app',
      status: (row[7] as Message['status']) || 'pending',
      fileUrl: row[8] || undefined,
      mentionedUserIds: this.parseJsonArray(row[9]),
      createdAt: row[10] || '',
      sentAt: row[11] || undefined,
      deliveredAt: row[12] || undefined,
      retryCount: parseInt(row[13] || '0', 10),
      idempotencyKey: row[14] || '',
    }));

    if (ticketId) {
      return messages.filter(m => m.ticketId === ticketId);
    }
    return messages;
  }

  async updateMessageStatus(id: string, status: Message['status'], sentAt?: string): Promise<void> {
    const sheets = await this.getClient();
    const messages = await this.getMessagesByTicketId('');
    const rowIndex = messages.findIndex(m => m.id === id);

    if (rowIndex === -1) return;

    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.messages}!H${rowIndex + 2}:L${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          status,
          messages[rowIndex].fileUrl || '',
          JSON.stringify(messages[rowIndex].mentionedUserIds),
          messages[rowIndex].createdAt,
          sentAt || messages[rowIndex].sentAt || '',
        ]],
      },
    });
  }

  // ============ COMMITMENTS ============

  async createCommitment(input: CommitmentCreateInput, createdById: string): Promise<Commitment> {
    const sheets = await this.getClient();
    const now = new Date().toISOString();

    const commitment: Commitment = {
      id: uuidv4(),
      ticketId: input.ticketId,
      createdById,
      assignedToId: input.assignedToId,
      description: input.description,
      dueDate: input.dueDate,
      status: 'pendiente',
      reminderSent: false,
      createdAt: now,
      updatedAt: now,
    };

    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.commitments}!A:K`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          commitment.id,
          commitment.ticketId,
          commitment.createdById,
          commitment.assignedToId,
          commitment.description,
          commitment.dueDate,
          commitment.status,
          commitment.completedAt || '',
          commitment.reminderSent,
          commitment.createdAt,
          commitment.updatedAt,
        ]],
      },
    });

    return commitment;
  }

  async getCommitmentsByTicketId(ticketId: string): Promise<Commitment[]> {
    const sheets = await this.getClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.commitments}!A2:K`,
    });

    const rows = response.data.values || [];
    return rows
      .map(row => ({
        id: row[0] || '',
        ticketId: row[1] || '',
        createdById: row[2] || '',
        assignedToId: row[3] || '',
        description: row[4] || '',
        dueDate: row[5] || '',
        status: (row[6] as Commitment['status']) || 'pendiente',
        completedAt: row[7] || undefined,
        reminderSent: row[8] === 'true',
        createdAt: row[9] || '',
        updatedAt: row[10] || '',
      }))
      .filter(c => c.ticketId === ticketId);
  }

  async updateCommitment(id: string, updates: Partial<Commitment>): Promise<Commitment | null> {
    const sheets = await this.getClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.commitments}!A2:K`,
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === id);

    if (rowIndex === -1) return null;

    const commitment: Commitment = {
      id: rows[rowIndex][0],
      ticketId: rows[rowIndex][1],
      createdById: rows[rowIndex][2],
      assignedToId: rows[rowIndex][3],
      description: rows[rowIndex][4],
      dueDate: rows[rowIndex][5],
      status: rows[rowIndex][6] as Commitment['status'],
      completedAt: rows[rowIndex][7] || undefined,
      reminderSent: rows[rowIndex][8] === 'true',
      createdAt: rows[rowIndex][9],
      updatedAt: rows[rowIndex][10],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.commitments}!A${rowIndex + 2}:K${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          commitment.id,
          commitment.ticketId,
          commitment.createdById,
          commitment.assignedToId,
          commitment.description,
          commitment.dueDate,
          commitment.status,
          commitment.completedAt || '',
          commitment.reminderSent,
          commitment.createdAt,
          commitment.updatedAt,
        ]],
      },
    });

    return commitment;
  }

  async getPendingCommitments(): Promise<Commitment[]> {
    const sheets = await this.getClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.sheets.commitments}!A2:K`,
    });

    const rows = response.data.values || [];
    return rows
      .map(row => ({
        id: row[0] || '',
        ticketId: row[1] || '',
        createdById: row[2] || '',
        assignedToId: row[3] || '',
        description: row[4] || '',
        dueDate: row[5] || '',
        status: (row[6] as Commitment['status']) || 'pendiente',
        completedAt: row[7] || undefined,
        reminderSent: row[8] === 'true',
        createdAt: row[9] || '',
        updatedAt: row[10] || '',
      }))
      .filter(c => c.status === 'pendiente');
  }

  // ============ HELPERS ============

  private parseJsonArray(value: string | undefined): string[] {
    if (!value) return [];
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '365d',
  },

  // Google
  google: {
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
  },

  // Gemini AI
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },

  // Twilio
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || '',
  },

  // SMTP
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },

  // Sheets tab names
  sheets: {
    users: 'Users',
    tickets: 'Tickets',
    messages: 'Messages',
    commitments: 'Commitments',
  },

  // Drive folder structure
  drive: {
    rootFolder: 'PM_FAPARCA',
    ticketsFolder: '01_Tickets',
    reportsFolder: '02_Reportes_PDF',
    configFolder: '03_Config',
    subfolders: ['Fotos', 'Videos', 'Docs', 'Voz'],
  },
};

// Validate required config
export function validateConfig(): void {
  const required = [
    'google.serviceAccountEmail',
    'google.privateKey',
    'google.spreadsheetId',
    'jwt.secret',
  ];

  const missing: string[] = [];

  for (const key of required) {
    const parts = key.split('.');
    let value: unknown = config;
    for (const part of parts) {
      value = (value as Record<string, unknown>)?.[part];
    }
    if (!value) {
      missing.push(key);
    }
  }

  if (missing.length > 0 && config.nodeEnv === 'production') {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }

  if (missing.length > 0) {
    console.warn(`⚠️  Missing configuration (optional in dev): ${missing.join(', ')}`);
  }
}

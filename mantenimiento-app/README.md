# Mantenimiento App

Sistema de gestión de trabajos de mantenimiento con arquitectura offline-first, auto-recuperación y comunicación multi-canal.

## Características Principales

### Offline-First
- Funciona sin conexión a internet
- Todos los datos se guardan localmente (IndexedDB)
- Sincronización automática cuando vuelve la conexión
- Cola de operaciones pendientes
- Nunca pierdes datos

### Auto-Recuperación (Self-Healing)
- Detección automática de errores
- Rollback a último estado conocido
- Sin pantallas congeladas
- Logs silenciosos de errores
- Mensajes amigables al usuario

### Comunicación Multi-Canal
- WhatsApp (via Twilio)
- SMS (via Twilio)
- Email (via SMTP)
- Cola de reintentos automáticos
- Recuperación de mensajes fallidos

### IA Integrada (Gemini)
- Análisis de problemas de mantenimiento
- Resúmenes automáticos
- Estimaciones de tiempo y repuestos
- Reescritura de mensajes por tono
- Transcripción de voz

## Requisitos Previos

- Node.js 18+
- NPM o Yarn
- Cuenta de Google Cloud (para Sheets, Drive, Gemini)
- Cuenta de Twilio (para WhatsApp/SMS)
- Cuenta SMTP (para Email)

## Configuración

### 1. Clonar y preparar

```bash
cd mantenimiento-app
```

### 2. Configurar Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edita `.env` con tus credenciales:

```env
# Server
PORT=3001
NODE_ENV=development

# JWT - Cambia esto en producción
JWT_SECRET=tu-clave-secreta-muy-larga-y-segura
JWT_EXPIRES_IN=365d

# Google Service Account
# Crea una cuenta de servicio en Google Cloud Console
# Habilita las APIs de Sheets y Drive
GOOGLE_SERVICE_ACCOUNT_EMAIL=tu-cuenta@proyecto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Google Sheets
# Crea un spreadsheet y compártelo con la cuenta de servicio
GOOGLE_SPREADSHEET_ID=tu-spreadsheet-id

# Google Drive
# Crea una carpeta y compártela con la cuenta de servicio (opcional)
GOOGLE_DRIVE_FOLDER_ID=tu-folder-id

# Gemini AI
# Obtén una API key en Google AI Studio
GEMINI_API_KEY=tu-gemini-api-key

# Twilio
# Registra una cuenta en Twilio
TWILIO_ACCOUNT_SID=tu-account-sid
TWILIO_AUTH_TOKEN=tu-auth-token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@dominio.com
SMTP_PASS=tu-app-password
SMTP_FROM=Mantenimiento <tu-email@dominio.com>
```

### 3. Inicializar Google Sheets y Drive

```bash
npm run setup
```

Esto creará:
- Hojas en el spreadsheet: Users, Tickets, Messages, Commitments
- Estructura de carpetas en Drive: PM_FAPARCA/01_Tickets, 02_Reportes_PDF, 03_Config

### 4. Configurar Frontend

```bash
cd ../frontend
npm install
```

### 5. Ejecutar en Desarrollo

Terminal 1 - Backend:
```bash
cd backend
npm run dev
```

Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

Abre http://localhost:3000

## Estructura del Proyecto

```
mantenimiento-app/
├── backend/
│   ├── src/
│   │   ├── config/         # Configuración
│   │   ├── controllers/    # Controladores API
│   │   ├── middleware/     # Auth middleware
│   │   ├── routes/         # Rutas Express
│   │   ├── services/       # Servicios externos
│   │   │   ├── googleSheets.ts   # Base de datos
│   │   │   ├── googleDrive.ts    # Almacenamiento
│   │   │   ├── geminiAI.ts       # IA
│   │   │   ├── twilio.ts         # WhatsApp/SMS
│   │   │   └── email.ts          # SMTP
│   │   ├── types/          # TypeScript types
│   │   ├── utils/          # Validadores
│   │   └── index.ts        # Entry point
│   └── scripts/
│       └── setup.ts        # Script de configuración
│
└── frontend/
    ├── src/
    │   ├── components/     # Componentes React
    │   ├── contexts/       # React Context
    │   ├── hooks/          # Custom hooks
    │   ├── pages/          # Páginas
    │   ├── services/       # API y storage
    │   │   ├── api.ts      # Cliente API
    │   │   ├── storage.ts  # IndexedDB
    │   │   └── sync.ts     # Sincronización
    │   ├── types/          # TypeScript types
    │   ├── App.tsx         # Componente principal
    │   └── main.tsx        # Entry point
    └── public/
        └── favicon.svg
```

## Variables de Entorno

### Backend (.env)

| Variable | Descripción | Requerido |
|----------|-------------|-----------|
| `PORT` | Puerto del servidor | No (default: 3001) |
| `JWT_SECRET` | Clave secreta para JWT | Sí |
| `JWT_EXPIRES_IN` | Tiempo de expiración JWT | No (default: 365d) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email de cuenta de servicio | Sí |
| `GOOGLE_PRIVATE_KEY` | Clave privada de cuenta de servicio | Sí |
| `GOOGLE_SPREADSHEET_ID` | ID del spreadsheet | Sí |
| `GOOGLE_DRIVE_FOLDER_ID` | ID de carpeta raíz en Drive | No |
| `GEMINI_API_KEY` | API key de Gemini | No* |
| `TWILIO_ACCOUNT_SID` | Account SID de Twilio | No* |
| `TWILIO_AUTH_TOKEN` | Auth token de Twilio | No* |
| `TWILIO_PHONE_NUMBER` | Número para SMS | No* |
| `TWILIO_WHATSAPP_NUMBER` | Número para WhatsApp | No* |
| `SMTP_HOST` | Host SMTP | No* |
| `SMTP_PORT` | Puerto SMTP | No* |
| `SMTP_USER` | Usuario SMTP | No* |
| `SMTP_PASS` | Password SMTP | No* |
| `SMTP_FROM` | Email remitente | No* |

*No requerido para desarrollo, pero necesario para funcionalidad completa

## Flujo de Usuario

### Registro (Primera vez)
1. Nombre completo + inicial apellido (ej: "Juan P.")
2. Email
3. Teléfono
4. Auto-login permanente con JWT

### Crear Trabajo de Mantenimiento
1. **Descripción**: ¿Qué pasó? (texto o voz)
2. **Confirmación IA**: La IA confirma que entendió
3. **Urgencia y Tono**: Prioridad y estilo de comunicación
4. **Ubicación**: Área y equipo afectado
5. **Fotos**: Evidencia visual (mínimo 1 recomendada)
6. **Análisis IA**: Resumen, causa, riesgo, pasos, tiempo, repuestos
7. **Equipo**: Agregar personas involucradas
8. **Confirmación**: Revisar y crear

### Durante el Trabajo
- Chat en tiempo real
- Menciones @usuario
- Actualización de progreso %
- Registro de compromisos
- Recordatorios automáticos

### Cerrar Trabajo
- Evidencia final obligatoria
- Confirmación de funcionamiento
- Historial bloqueado (sin eliminación)

## API Endpoints

### Auth
- `POST /api/auth/register` - Registro/Login
- `GET /api/auth/me` - Usuario actual
- `GET /api/auth/validate` - Validar token

### Tickets
- `POST /api/tickets` - Crear ticket
- `GET /api/tickets` - Listar tickets
- `GET /api/tickets/:id` - Detalle de ticket
- `PATCH /api/tickets/:id` - Actualizar ticket
- `POST /api/tickets/:id/complete` - Completar ticket
- `POST /api/tickets/:id/assignees` - Agregar persona

### Messages
- `POST /api/messages` - Enviar mensaje
- `GET /api/tickets/:ticketId/messages` - Mensajes de ticket

### Commitments
- `POST /api/tickets/:ticketId/commitments` - Crear compromiso
- `GET /api/tickets/:ticketId/commitments` - Listar compromisos
- `PATCH /api/commitments/:id` - Actualizar compromiso

### Files
- `POST /api/tickets/:ticketId/files` - Subir archivos
- `GET /api/tickets/:ticketId/files` - Listar archivos

### AI
- `POST /api/ai/confirm` - Confirmar entendimiento
- `POST /api/ai/analyze` - Analizar problema
- `POST /api/ai/rewrite` - Reescribir mensaje
- `POST /api/ai/transcribe` - Transcribir audio

### Sync
- `POST /api/sync` - Procesar cola de sincronización
- `GET /api/sync/status` - Estado de sincronización

### Dashboard
- `GET /api/dashboard/stats` - Estadísticas

## Producción

### Backend

```bash
cd backend
npm run build
npm start
```

### Frontend

```bash
cd frontend
npm run build
# Servir carpeta dist/ con cualquier servidor estático
```

### Variables de entorno para producción

- Cambiar `JWT_SECRET` a una clave segura
- Configurar `NODE_ENV=production`
- Usar HTTPS
- Configurar CORS apropiadamente

## Solución de Problemas

### Error de conexión con Google Sheets
- Verifica que la cuenta de servicio tenga acceso al spreadsheet
- Revisa que la clave privada esté correctamente escapada en `.env`

### Error de autenticación
- Verifica `JWT_SECRET`
- Limpia el almacenamiento local del navegador

### Mensajes no se envían
- Verifica credenciales de Twilio/SMTP
- Revisa la cola de mensajes en la consola del backend

### La app no funciona offline
- Asegúrate de haber cargado la app al menos una vez online
- Verifica que IndexedDB esté habilitado en el navegador

## Licencia

MIT

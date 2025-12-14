import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config';
import routes from './routes';
import { googleSheetsService } from './services/googleSheets';
import { googleDriveService } from './services/googleDrive';

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// API Routes
app.use('/api', routes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);

  // Handle multer errors
  if (err.name === 'MulterError') {
    res.status(400).json({
      success: false,
      error: 'Error con el archivo. Asegúrate de que no sea muy grande (máximo 50MB).',
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'Algo salió mal. Por favor intenta de nuevo.',
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Ruta no encontrada',
  });
});

// Initialize services and start server
async function startServer(): Promise<void> {
  try {
    console.log('🚀 Iniciando servidor...');

    // Validate config
    validateConfig();

    // Initialize Google Sheets
    console.log('📊 Conectando con Google Sheets...');
    await googleSheetsService.initialize();

    // Initialize Google Drive
    console.log('📁 Conectando con Google Drive...');
    await googleDriveService.initialize();

    // Start server
    app.listen(config.port, () => {
      console.log(`✅ Servidor corriendo en puerto ${config.port}`);
      console.log(`📍 API disponible en http://localhost:${config.port}/api`);
      console.log(`🏥 Health check: http://localhost:${config.port}/api/health`);
    });
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
}

startServer();

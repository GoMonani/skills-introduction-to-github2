import { Request, Response } from 'express';
import multer from 'multer';
import { googleSheetsService } from '../services/googleSheets';
import { googleDriveService } from '../services/googleDrive';
import { FileUpload } from '../types';

// Multer configuration for memory storage
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow images, videos, documents, and audio
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'audio/webm',
      'audio/mp3',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    }
  },
});

function getFileType(mimetype: string): 'Fotos' | 'Videos' | 'Docs' | 'Voz' {
  if (mimetype.startsWith('image/')) return 'Fotos';
  if (mimetype.startsWith('video/')) return 'Videos';
  if (mimetype.startsWith('audio/')) return 'Voz';
  return 'Docs';
}

export async function uploadFiles(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { ticketId } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No se proporcionaron archivos',
      });
      return;
    }

    // Validate ticket exists and user has access
    const ticket = await googleSheetsService.getTicketById(ticketId);
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Trabajo no encontrado' });
      return;
    }

    const hasAccess =
      ticket.createdById === req.user.userId ||
      ticket.assignedToIds.includes(req.user.userId);

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: 'No tienes acceso a este trabajo',
      });
      return;
    }

    // Ensure ticket has a Drive folder
    let driveFolderId = ticket.driveFolderId;
    if (!driveFolderId) {
      driveFolderId = await googleDriveService.createTicketFolder(
        ticket.code,
        ticket.title
      );
      await googleSheetsService.updateTicket(ticketId, { driveFolderId });
    }

    const uploadedFiles: { url: string; name: string; type: string }[] = [];

    // Group files by type
    const filesByType: Record<string, FileUpload[]> = {
      Fotos: [],
      Videos: [],
      Docs: [],
      Voz: [],
    };

    for (const file of files) {
      const type = getFileType(file.mimetype);
      const fileUpload: FileUpload = {
        filename: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer,
        size: file.size,
      };
      filesByType[type].push(fileUpload);
    }

    // Upload each group
    for (const [type, typeFiles] of Object.entries(filesByType)) {
      if (typeFiles.length === 0) continue;

      const driveFiles = await googleDriveService.uploadMultipleFiles(
        typeFiles,
        driveFolderId,
        type as 'Fotos' | 'Videos' | 'Docs' | 'Voz'
      );

      for (const driveFile of driveFiles) {
        uploadedFiles.push({
          url: driveFile.webViewLink,
          name: driveFile.name,
          type,
        });
      }
    }

    // Update ticket with new file URLs
    const photoUrls = [
      ...ticket.photoUrls,
      ...uploadedFiles.filter(f => f.type === 'Fotos').map(f => f.url),
    ];
    const videoUrls = [
      ...ticket.videoUrls,
      ...uploadedFiles.filter(f => f.type === 'Videos').map(f => f.url),
    ];
    const docUrls = [
      ...ticket.docUrls,
      ...uploadedFiles.filter(f => f.type === 'Docs').map(f => f.url),
    ];
    const voiceUrls = [
      ...ticket.voiceUrls,
      ...uploadedFiles.filter(f => f.type === 'Voz').map(f => f.url),
    ];

    await googleSheetsService.updateTicket(ticketId, {
      photoUrls,
      videoUrls,
      docUrls,
      voiceUrls,
    });

    res.json({
      success: true,
      data: uploadedFiles,
      message: `${uploadedFiles.length} archivo(s) subido(s) exitosamente`,
    });
  } catch (error) {
    console.error('Upload files error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudieron subir los archivos',
    });
  }
}

export async function getTicketFiles(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { ticketId } = req.params;

    // Validate ticket exists and user has access
    const ticket = await googleSheetsService.getTicketById(ticketId);
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Trabajo no encontrado' });
      return;
    }

    const hasAccess =
      ticket.createdById === req.user.userId ||
      ticket.assignedToIds.includes(req.user.userId);

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: 'No tienes acceso a este trabajo',
      });
      return;
    }

    // Return URLs from ticket record
    res.json({
      success: true,
      data: {
        photos: ticket.photoUrls,
        videos: ticket.videoUrls,
        docs: ticket.docUrls,
        voice: ticket.voiceUrls,
      },
    });
  } catch (error) {
    console.error('Get ticket files error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudieron obtener los archivos',
    });
  }
}

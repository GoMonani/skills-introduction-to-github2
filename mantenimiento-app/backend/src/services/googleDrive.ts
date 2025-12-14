import { google, drive_v3 } from 'googleapis';
import { config } from '../config';
import { DriveFile, FileUpload } from '../types';
import { Readable } from 'stream';

class GoogleDriveService {
  private drive: drive_v3.Drive | null = null;
  private rootFolderId: string | null = null;
  private folderCache: Map<string, string> = new Map();

  private async getClient(): Promise<drive_v3.Drive> {
    if (this.drive) return this.drive;

    const auth = new google.auth.JWT({
      email: config.google.serviceAccountEmail,
      key: config.google.privateKey,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    this.drive = google.drive({ version: 'v3', auth });
    return this.drive;
  }

  async initialize(): Promise<void> {
    const drive = await this.getClient();

    // Find or create root folder PM_FAPARCA
    this.rootFolderId = await this.findOrCreateFolder(
      config.drive.rootFolder,
      config.google.driveFolderId || 'root'
    );

    // Create main subfolders
    const ticketsFolder = await this.findOrCreateFolder(
      config.drive.ticketsFolder,
      this.rootFolderId
    );
    const reportsFolder = await this.findOrCreateFolder(
      config.drive.reportsFolder,
      this.rootFolderId
    );
    const configFolder = await this.findOrCreateFolder(
      config.drive.configFolder,
      this.rootFolderId
    );

    this.folderCache.set(config.drive.ticketsFolder, ticketsFolder);
    this.folderCache.set(config.drive.reportsFolder, reportsFolder);
    this.folderCache.set(config.drive.configFolder, configFolder);

    console.log('✅ Google Drive initialized');
  }

  private async findOrCreateFolder(name: string, parentId: string): Promise<string> {
    const drive = await this.getClient();

    // Search for existing folder
    const response = await drive.files.list({
      q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id!;
    }

    // Create new folder
    const folderMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    };

    const folder = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id',
    });

    return folder.data.id!;
  }

  async createTicketFolder(ticketCode: string, ticketTitle: string): Promise<string> {
    const ticketsFolderId = this.folderCache.get(config.drive.ticketsFolder);
    if (!ticketsFolderId) {
      throw new Error('Tickets folder not initialized');
    }

    // Create main ticket folder
    const folderName = `${ticketCode} - ${ticketTitle.substring(0, 50)}`;
    const ticketFolderId = await this.findOrCreateFolder(folderName, ticketsFolderId);

    // Create subfolders
    for (const subfolder of config.drive.subfolders) {
      await this.findOrCreateFolder(subfolder, ticketFolderId);
    }

    return ticketFolderId;
  }

  async getTicketSubfolder(ticketFolderId: string, type: 'Fotos' | 'Videos' | 'Docs' | 'Voz'): Promise<string> {
    const drive = await this.getClient();

    const response = await drive.files.list({
      q: `name='${type}' and '${ticketFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id!;
    }

    // Create if doesn't exist
    return this.findOrCreateFolder(type, ticketFolderId);
  }

  async uploadFile(
    file: FileUpload,
    ticketFolderId: string,
    type: 'Fotos' | 'Videos' | 'Docs' | 'Voz'
  ): Promise<DriveFile> {
    const drive = await this.getClient();
    const subfolderId = await this.getTicketSubfolder(ticketFolderId, type);

    // Create readable stream from buffer
    const stream = new Readable();
    stream.push(file.buffer);
    stream.push(null);

    const response = await drive.files.create({
      requestBody: {
        name: file.filename,
        parents: [subfolderId],
      },
      media: {
        mimeType: file.mimetype,
        body: stream,
      },
      fields: 'id, name, webViewLink, webContentLink',
    });

    // Make file publicly accessible (view only)
    await drive.permissions.create({
      fileId: response.data.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    return {
      id: response.data.id!,
      name: response.data.name!,
      webViewLink: response.data.webViewLink!,
      webContentLink: response.data.webContentLink || response.data.webViewLink!,
    };
  }

  async uploadMultipleFiles(
    files: FileUpload[],
    ticketFolderId: string,
    type: 'Fotos' | 'Videos' | 'Docs' | 'Voz'
  ): Promise<DriveFile[]> {
    const results: DriveFile[] = [];

    for (const file of files) {
      const driveFile = await this.uploadFile(file, ticketFolderId, type);
      results.push(driveFile);
    }

    return results;
  }

  async getFilesInFolder(folderId: string): Promise<DriveFile[]> {
    const drive = await this.getClient();

    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, webViewLink, webContentLink)',
      spaces: 'drive',
    });

    return (response.data.files || []).map(file => ({
      id: file.id!,
      name: file.name!,
      webViewLink: file.webViewLink!,
      webContentLink: file.webContentLink || file.webViewLink!,
    }));
  }

  async getTicketFiles(ticketFolderId: string): Promise<{
    photos: DriveFile[];
    videos: DriveFile[];
    docs: DriveFile[];
    voice: DriveFile[];
  }> {
    const [photos, videos, docs, voice] = await Promise.all([
      this.getFilesInSubfolder(ticketFolderId, 'Fotos'),
      this.getFilesInSubfolder(ticketFolderId, 'Videos'),
      this.getFilesInSubfolder(ticketFolderId, 'Docs'),
      this.getFilesInSubfolder(ticketFolderId, 'Voz'),
    ]);

    return { photos, videos, docs, voice };
  }

  private async getFilesInSubfolder(
    ticketFolderId: string,
    subfolder: 'Fotos' | 'Videos' | 'Docs' | 'Voz'
  ): Promise<DriveFile[]> {
    try {
      const subfolderId = await this.getTicketSubfolder(ticketFolderId, subfolder);
      return this.getFilesInFolder(subfolderId);
    } catch {
      return [];
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    // We don't actually delete, just move to trash (can be recovered)
    const drive = await this.getClient();
    await drive.files.update({
      fileId,
      requestBody: {
        trashed: true,
      },
    });
  }

  getRootFolderId(): string | null {
    return this.rootFolderId;
  }
}

export const googleDriveService = new GoogleDriveService();

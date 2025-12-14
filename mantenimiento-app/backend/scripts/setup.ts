import { config, validateConfig } from '../src/config';
import { googleSheetsService } from '../src/services/googleSheets';
import { googleDriveService } from '../src/services/googleDrive';

async function setup(): Promise<void> {
  console.log('🔧 Configurando Mantenimiento App...\n');

  try {
    // Validate configuration
    console.log('1️⃣  Validando configuración...');
    validateConfig();
    console.log('   ✅ Configuración válida\n');

    // Initialize Google Sheets
    console.log('2️⃣  Inicializando Google Sheets...');
    console.log(`   📊 Spreadsheet ID: ${config.google.spreadsheetId}`);
    await googleSheetsService.initialize();
    console.log('   ✅ Hojas creadas: Users, Tickets, Messages, Commitments\n');

    // Initialize Google Drive
    console.log('3️⃣  Inicializando Google Drive...');
    console.log(`   📁 Folder ID: ${config.google.driveFolderId || 'root'}`);
    await googleDriveService.initialize();
    console.log('   ✅ Estructura de carpetas creada:');
    console.log('      PM_FAPARCA/');
    console.log('      ├── 01_Tickets/');
    console.log('      ├── 02_Reportes_PDF/');
    console.log('      └── 03_Config/\n');

    console.log('🎉 ¡Configuración completada exitosamente!\n');
    console.log('Próximos pasos:');
    console.log('1. Ejecuta el backend: npm run dev');
    console.log('2. Ejecuta el frontend: cd ../frontend && npm run dev');
    console.log('3. Abre http://localhost:3000 en tu navegador\n');

  } catch (error) {
    console.error('\n❌ Error durante la configuración:', error);
    console.log('\nVerifica que:');
    console.log('1. El archivo .env existe y tiene las credenciales correctas');
    console.log('2. La cuenta de servicio tiene acceso al Spreadsheet y Drive');
    console.log('3. Las APIs de Google Sheets y Drive están habilitadas');
    process.exit(1);
  }
}

setup();

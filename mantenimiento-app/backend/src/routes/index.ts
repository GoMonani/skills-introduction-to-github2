import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  userRegistrationValidators,
  ticketCreationValidators,
  messageCreationValidators,
  commitmentCreationValidators,
} from '../utils/validators';

// Controllers
import * as authController from '../controllers/authController';
import * as ticketsController from '../controllers/ticketsController';
import * as messagesController from '../controllers/messagesController';
import * as commitmentsController from '../controllers/commitmentsController';
import * as filesController from '../controllers/filesController';
import * as syncController from '../controllers/syncController';
import * as aiController from '../controllers/aiController';

const router = Router();

// ============ Health Check ============
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'API funcionando correctamente',
    timestamp: new Date().toISOString(),
  });
});

// ============ Auth Routes ============
router.post('/auth/register', userRegistrationValidators, authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/me', authMiddleware, authController.getCurrentUser);
router.get('/auth/validate', authMiddleware, authController.validateToken);

// ============ Tickets Routes ============
router.post('/tickets', authMiddleware, ticketCreationValidators, ticketsController.createTicket);
router.get('/tickets', authMiddleware, ticketsController.getTickets);
router.get('/tickets/:id', authMiddleware, ticketsController.getTicketById);
router.patch('/tickets/:id', authMiddleware, ticketsController.updateTicket);
router.post('/tickets/:id/complete', authMiddleware, ticketsController.completeTicket);
router.post('/tickets/:id/assignees', authMiddleware, ticketsController.addAssignee);
router.get('/dashboard/stats', authMiddleware, ticketsController.getDashboardStats);

// ============ Messages Routes ============
router.post('/messages', authMiddleware, messageCreationValidators, messagesController.createMessage);
router.get('/tickets/:ticketId/messages', authMiddleware, messagesController.getMessages);
router.post('/messages/rewrite', authMiddleware, messagesController.rewriteWithTone);
router.post('/messages/transcribe', authMiddleware, messagesController.transcribeVoice);

// ============ Commitments Routes ============
router.post(
  '/tickets/:ticketId/commitments',
  authMiddleware,
  commitmentCreationValidators,
  commitmentsController.createCommitment
);
router.get('/tickets/:ticketId/commitments', authMiddleware, commitmentsController.getCommitments);
router.patch('/commitments/:commitmentId', authMiddleware, commitmentsController.updateCommitment);
router.post('/commitments/send-reminders', commitmentsController.sendReminders);

// ============ Files Routes ============
router.post(
  '/tickets/:ticketId/files',
  authMiddleware,
  filesController.upload.array('files', 10),
  filesController.uploadFiles
);
router.get('/tickets/:ticketId/files', authMiddleware, filesController.getTicketFiles);

// ============ Sync Routes ============
router.post('/sync', authMiddleware, syncController.processSyncQueue);
router.get('/sync/status', authMiddleware, syncController.getSyncStatus);

// ============ AI Routes ============
router.post('/ai/confirm', authMiddleware, aiController.confirmUnderstanding);
router.post('/ai/analyze', authMiddleware, aiController.analyzeRequest);
router.post('/ai/clarify', authMiddleware, aiController.askClarification);
router.post('/ai/rewrite', authMiddleware, aiController.rewriteMessage);
router.post('/ai/transcribe', authMiddleware, aiController.transcribeAudio);

// ============ Users Routes (for getting other users) ============
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const { googleSheetsService } = await import('../services/googleSheets');
    const users = await googleSheetsService.getAllUsers();
    res.json({
      success: true,
      data: users.filter(u => u.status === 'active'),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error obteniendo usuarios',
    });
  }
});

export default router;

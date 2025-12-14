import { Request, Response } from 'express';
import { googleSheetsService } from '../services/googleSheets';
import { geminiAIService } from '../services/geminiAI';

export async function confirmUnderstanding(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { description } = req.body;

    if (!description) {
      res.status(400).json({
        success: false,
        error: 'Se requiere una descripción',
      });
      return;
    }

    const user = await googleSheetsService.getUserById(req.user.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'Usuario no encontrado' });
      return;
    }

    const confirmation = await geminiAIService.confirmUnderstanding(
      description,
      user.fullName.split(' ')[0]
    );

    res.json({
      success: true,
      data: { confirmation },
    });
  } catch (error) {
    console.error('Confirm understanding error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo procesar la solicitud',
    });
  }
}

export async function analyzeRequest(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { description, area, equipment } = req.body;

    if (!description || !area) {
      res.status(400).json({
        success: false,
        error: 'Se requiere descripción y área',
      });
      return;
    }

    const user = await googleSheetsService.getUserById(req.user.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'Usuario no encontrado' });
      return;
    }

    const analysis = await geminiAIService.analyzeMaintenanceRequest(
      description,
      area,
      equipment,
      user.fullName
    );

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error('Analyze request error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo analizar la solicitud',
    });
  }
}

export async function askClarification(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { description, context } = req.body;

    if (!description) {
      res.status(400).json({
        success: false,
        error: 'Se requiere una descripción',
      });
      return;
    }

    const question = await geminiAIService.askClarifyingQuestion(
      description,
      context || ''
    );

    res.json({
      success: true,
      data: { question },
    });
  } catch (error) {
    console.error('Ask clarification error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo generar la pregunta',
    });
  }
}

export async function rewriteMessage(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { message, tone, recipientName } = req.body;

    if (!message || !tone) {
      res.status(400).json({
        success: false,
        error: 'Se requiere mensaje y tono',
      });
      return;
    }

    if (!['formal', 'amigable', 'urgente'].includes(tone)) {
      res.status(400).json({
        success: false,
        error: 'Tono inválido. Usa: formal, amigable, o urgente',
      });
      return;
    }

    const rewritten = await geminiAIService.rewriteMessageWithTone(
      message,
      tone,
      recipientName
    );

    res.json({
      success: true,
      data: {
        original: message,
        rewritten,
        tone,
      },
    });
  } catch (error) {
    console.error('Rewrite message error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo reescribir el mensaje',
    });
  }
}

export async function transcribeAudio(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    const { audioBase64 } = req.body;

    if (!audioBase64) {
      res.status(400).json({
        success: false,
        error: 'Se requiere audio en base64',
      });
      return;
    }

    const transcription = await geminiAIService.transcribeVoiceToText(audioBase64);

    res.json({
      success: true,
      data: { transcription },
    });
  } catch (error) {
    console.error('Transcribe audio error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo transcribir el audio',
    });
  }
}

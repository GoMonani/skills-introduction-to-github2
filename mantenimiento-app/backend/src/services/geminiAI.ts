import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { AIAnalysis } from '../types';

class GeminiAIService {
  private genAI: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    if (!this.genAI) {
      this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    }
    return this.genAI;
  }

  async analyzeMaintenanceRequest(
    description: string,
    area: string,
    equipment?: string,
    userName?: string
  ): Promise<AIAnalysis> {
    const genAI = this.getClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `Eres un experto en mantenimiento industrial. Analiza la siguiente solicitud de mantenimiento y proporciona un análisis completo en español venezolano simple y amigable.

INFORMACIÓN DE LA SOLICITUD:
- Descripción del problema: ${description}
- Área: ${area}
${equipment ? `- Equipo: ${equipment}` : ''}
${userName ? `- Reportado por: ${userName}` : ''}

Por favor proporciona tu análisis en el siguiente formato JSON exacto (sin markdown, solo JSON puro):
{
  "summary": "Un resumen claro y conciso del problema en 2-3 oraciones",
  "possibleCause": "Las posibles causas del problema, explicadas de forma simple",
  "risk": "Los riesgos si no se atiende el problema, en términos simples",
  "steps": "Los pasos recomendados para resolver el problema, numerados",
  "timeEstimate": "Estimación de tiempo para resolver (ej: 2-4 horas, 1-2 días)",
  "parts": "Lista de posibles repuestos o materiales que podrían necesitarse"
}

IMPORTANTE:
- Usa lenguaje simple que un chamo de 15 años pueda entender
- Sé práctico y directo
- No inventes especificaciones técnicas que no conoces
- Si no tienes suficiente información para algún campo, di "Se necesita inspección para determinar"
- Responde SOLO con el JSON, sin explicaciones adicionales`;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response.text();

      // Clean the response and parse JSON
      const cleanedResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const analysis = JSON.parse(cleanedResponse);

      return {
        summary: analysis.summary || 'Problema reportado pendiente de análisis detallado.',
        possibleCause: analysis.possibleCause || 'Se necesita inspección para determinar.',
        risk: analysis.risk || 'Riesgo por determinar tras inspección.',
        steps: analysis.steps || '1. Inspección inicial\n2. Diagnóstico\n3. Reparación',
        timeEstimate: analysis.timeEstimate || 'Por determinar',
        parts: analysis.parts || 'Por determinar tras inspección',
      };
    } catch (error) {
      console.error('Error analyzing maintenance request:', error);
      return {
        summary: description.substring(0, 200),
        possibleCause: 'Se necesita inspección para determinar la causa.',
        risk: 'Pendiente de evaluación de riesgos.',
        steps: '1. Inspección inicial del área\n2. Diagnóstico del problema\n3. Planificación de la reparación\n4. Ejecución del trabajo',
        timeEstimate: 'Por determinar tras inspección',
        parts: 'Por determinar tras inspección',
      };
    }
  }

  async rewriteMessageWithTone(
    message: string,
    tone: 'formal' | 'amigable' | 'urgente',
    userName?: string
  ): Promise<string> {
    const genAI = this.getClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const toneInstructions = {
      formal: 'profesional y respetuoso, usando "usted" y lenguaje técnico apropiado',
      amigable: 'cálido y cercano, usando "tú" y un tono conversacional venezolano',
      urgente: 'directo y con sentido de urgencia, resaltando la importancia de actuar rápido',
    };

    const prompt = `Reescribe el siguiente mensaje de mantenimiento con un tono ${toneInstructions[tone]}. Mantén toda la información importante pero ajusta el estilo.

Mensaje original:
${message}

${userName ? `El mensaje es para: ${userName}` : ''}

REGLAS:
- Mantén el español venezolano
- No agregues información que no esté en el original
- No uses emojis
- Devuelve SOLO el mensaje reescrito, sin explicaciones

Mensaje reescrito:`;

    try {
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      console.error('Error rewriting message:', error);
      return message; // Return original if fails
    }
  }

  async transcribeVoiceToText(audioBase64: string): Promise<string> {
    const genAI = this.getClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    try {
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'audio/webm',
            data: audioBase64,
          },
        },
        'Transcribe este audio a texto en español. Devuelve SOLO la transcripción, sin explicaciones adicionales.',
      ]);

      return result.response.text().trim();
    } catch (error) {
      console.error('Error transcribing voice:', error);
      throw new Error('No se pudo transcribir el audio. Por favor intenta de nuevo.');
    }
  }

  async confirmUnderstanding(
    description: string,
    userName: string
  ): Promise<string> {
    const genAI = this.getClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `Eres un asistente amigable de mantenimiento. Un usuario llamado ${userName} ha reportado el siguiente problema:

"${description}"

Genera una respuesta breve (2-3 oraciones máximo) que:
1. Confirme que entendiste el problema
2. Resuma brevemente lo que entendiste
3. Pregunte si la descripción es correcta

Usa español venezolano simple y amigable. No uses emojis. Dirígete al usuario por su nombre.

Respuesta:`;

    try {
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      console.error('Error confirming understanding:', error);
      return `Entendido, ${userName}. Veo que hay un problema con lo que describes. ¿Es correcta esta información?`;
    }
  }

  async generateClosingSummary(
    ticketTitle: string,
    ticketDescription: string,
    finalEvidence: string,
    closingNotes: string
  ): Promise<string> {
    const genAI = this.getClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `Genera un resumen de cierre para el siguiente trabajo de mantenimiento:

Título: ${ticketTitle}
Problema original: ${ticketDescription}
Evidencia final: ${finalEvidence}
Notas de cierre: ${closingNotes}

El resumen debe:
1. Confirmar que el trabajo fue completado
2. Resumir qué se hizo
3. Confirmar que el sistema está funcionando correctamente
4. Ser breve (máximo 3-4 oraciones)

Usa español venezolano simple. No uses emojis.

Resumen:`;

    try {
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      console.error('Error generating closing summary:', error);
      return `Trabajo completado. ${closingNotes}`;
    }
  }

  async askClarifyingQuestion(
    description: string,
    context: string
  ): Promise<string> {
    const genAI = this.getClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `Eres un técnico de mantenimiento amigable. Basándote en la siguiente descripción del problema, genera UNA pregunta clarificadora que ayude a entender mejor la situación.

Descripción: ${description}
${context ? `Contexto adicional: ${context}` : ''}

La pregunta debe ser:
- Simple y directa
- Relevante para el diagnóstico
- En español venezolano amigable
- Sin emojis

Pregunta:`;

    try {
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      console.error('Error generating clarifying question:', error);
      return '¿Podrías darme más detalles sobre cuándo comenzó este problema?';
    }
  }
}

export const geminiAIService = new GeminiAIService();

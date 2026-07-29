import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

/**
 * The system prompt is the main safety mechanism against hallucination in
 * this pipeline. It is kept in one place, separate from the per-request
 * question and context, so it cannot accidentally be diluted or
 * overridden by whatever a user types in the chat box.
 */
const SYSTEM_PROMPT = `You are a knowledge base assistant for an internal enterprise document library.

Rules you must always follow:
- Answer ONLY using the information provided in the "Context" section of the user's message.
- Do not use outside knowledge, prior training data, or assumptions, even if you are confident it is correct.
- If the context does not contain enough information to answer the question, reply with exactly this sentence and nothing else: "I couldn't find this information in the uploaded knowledge base."
- Never invent facts, names, numbers, or sources that are not present in the context.
- Keep answers concise and directly grounded in the retrieved text.`;

/**
 * Wraps Gemini's chat model (gemini-2.5-flash) for the final
 * answer-generation step of the RAG pipeline. This service only knows how
 * to call Gemini with a system prompt, a question, and a context string -
 * it has no idea where the context came from, which keeps it decoupled
 * from ChromaDB and the retrieval logic in RagService.
 */
@Injectable()
export class GeminiGenerationService {
  private readonly logger = new Logger(GeminiGenerationService.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('gemini.apiKey');
    this.model = this.configService.get<string>('gemini.chatModel') ?? 'gemini-2.5-flash';

    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY is not set. Chat requests will fail until it is configured in .env',
      );
    }

    this.client = new GoogleGenAI({ apiKey: apiKey ?? '' });
  }

  async generateAnswer(question: string, context: string): Promise<string> {
    const userPrompt = `Context:
"""
${context}
"""

Question: ${question}`;

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
        },
      });

      const answer = response.text;

      if (!answer) {
        throw new Error('Gemini returned an empty response.');
      }

      return answer.trim();
    } catch (error) {
      this.logger.error(`Chat generation failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        'Failed to generate an answer. Please verify your GEMINI_API_KEY and try again.',
      );
    }
  }
}

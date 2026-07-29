import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

/**
 * Wraps Gemini's embedding model (gemini-embedding-001).
 *
 * Every other service talks to embeddings only through this class's
 * `embedText` method - nothing else in the app knows this is Gemini
 * specifically. That is deliberate: swapping to a different embedding
 * provider later (OpenAI, a local model, etc.) only means changing this
 * one file.
 */
@Injectable()
export class GeminiEmbeddingService {
  private readonly logger = new Logger(GeminiEmbeddingService.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly dimensions: number;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('gemini.apiKey');
    this.model = this.configService.get<string>('gemini.embeddingModel') ?? 'gemini-embedding-001';
    this.dimensions = this.configService.get<number>('gemini.embeddingDimensions') ?? 768;

    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY is not set. Embedding requests will fail until it is configured in .env',
      );
    }

    this.client = new GoogleGenAI({ apiKey: apiKey ?? '' });
  }

  /**
   * Converts a piece of text into an embedding vector: a fixed-length list
   * of numbers that captures the meaning of the text, positioned so that
   * texts with similar meaning end up with similar (nearby) vectors. This
   * is what makes similarity search in ChromaDB possible.
   */
  async embedText(text: string): Promise<number[]> {
    try {
      const response = await this.client.models.embedContent({
        model: this.model,
        contents: text,
        config: {
          outputDimensionality: this.dimensions,
        },
      });

      const embedding = response.embeddings?.[0]?.values;

      if (!embedding || embedding.length === 0) {
        throw new Error('Gemini returned an empty embedding.');
      }

      return embedding;
    } catch (error) {
      this.logger.error(`Embedding request failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        'Failed to generate an embedding. Please verify your GEMINI_API_KEY and try again.',
      );
    }
  }
}

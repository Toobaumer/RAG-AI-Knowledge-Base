import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { createHash } from 'crypto';
import { describeGeminiError } from '../common/gemini/gemini-error.util';

export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/**
 * Wraps Gemini's embedding model (gemini-embedding-001).
 *
 * Every other service talks to embeddings only through this class's
 * `embedText` method - nothing else in the app knows this is Gemini
 * specifically. That is deliberate: swapping to a different embedding
 * provider later (OpenAI, a local model, etc.) only means changing this
 * one file.
 *
 * Two correctness details this class handles, found while debugging poor
 * retrieval quality on a real document:
 *
 *  1. Task type: Gemini's embedding model produces meaningfully better
 *     retrieval results when told whether a piece of text is a document
 *     being indexed (RETRIEVAL_DOCUMENT) or a question being asked
 *     (RETRIEVAL_QUERY). Using the same undifferentiated call for both
 *     sides is a documented cause of poor retrieval quality.
 *  2. Normalization: gemini-embedding-001 only returns a pre-normalized
 *     vector at its full 3072-dimension size. Any other output
 *     dimensionality (768 here) comes back unnormalized, which distorts
 *     cosine/distance similarity search unless normalized manually.
 *
 * Performance: an in-memory cache avoids re-embedding the exact same text
 * twice in one running process (for example, a user re-asking the same
 * question, or re-uploading a document that shares chunks with one
 * already indexed). This is intentionally simple - a plain Map, no
 * eviction policy, cleared on restart - which is appropriate for a
 * portfolio-scale app. A production system with high query volume would
 * want an LRU cache with a size limit, or a shared cache (Redis) across
 * multiple app instances.
 */
@Injectable()
export class GeminiEmbeddingService {
  private readonly logger = new Logger(GeminiEmbeddingService.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly dimensions: number;

  /** text+taskType hash -> embedding vector, for this process's lifetime. */
  private readonly cache = new Map<string, number[]>();

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

  async embedText(text: string, taskType: EmbeddingTaskType): Promise<number[]> {
    const cacheKey = this.buildCacheKey(text, taskType);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.client.models.embedContent({
        model: this.model,
        contents: text,
        config: {
          outputDimensionality: this.dimensions,
          taskType,
        },
      });

      const embedding = response.embeddings?.[0]?.values;

      if (!embedding || embedding.length === 0) {
        throw new Error('Gemini returned an empty embedding.');
      }

      const normalized = this.normalize(embedding);
      this.cache.set(cacheKey, normalized);
      return normalized;
    } catch (error) {
      this.logger.error(`Embedding request failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(describeGeminiError(error));
    }
  }

  /**
   * L2-normalizes a vector to unit length. Required for gemini-embedding-001
   * whenever outputDimensionality is anything other than the model's
   * native 3072 (the API does not do this for you at reduced dimensions).
   */
  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (magnitude === 0) return vector;
    return vector.map((value) => value / magnitude);
  }

  /** Short, fixed-length cache key so very long texts don't bloat Map key storage. */
  private buildCacheKey(text: string, taskType: EmbeddingTaskType): string {
    const hash = createHash('sha256').update(text).digest('hex');
    return `${taskType}:${hash}`;
  }
}

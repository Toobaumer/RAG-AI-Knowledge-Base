/**
 * Centralized, typed configuration.
 *
 * NestJS's ConfigModule loads process.env, and this factory function shapes
 * those raw string values into a strongly-typed object that the rest of the
 * app can safely inject via ConfigService.get<T>('key'). Every tunable
 * number in the RAG pipeline (chunk size, overlap, top-K, embedding
 * dimensions) lives here, so future lessons (Ragas evaluation, Redis
 * memory, hybrid search) can tune behavior through environment variables
 * instead of editing service code.
 */
export interface AppConfig {
  port: number;
  gemini: {
    apiKey: string;
    chatModel: string;
    embeddingModel: string;
    embeddingDimensions: number;
  };
  chroma: {
    url: string;
    collectionName: string;
  };
  upload: {
    maxFileSizeBytes: number;
  };
  chunking: {
    chunkSize: number;
    chunkOverlap: number;
  };
  retrieval: {
    topK: number;
    candidatePoolSize: number;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    chatModel: process.env.GEMINI_CHAT_MODEL ?? 'gemini-2.5-flash',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001',
    embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS ?? '768', 10),
  },
  chroma: {
    url: process.env.CHROMA_URL ?? 'http://localhost:8000',
    collectionName: process.env.CHROMA_COLLECTION_NAME ?? 'knowledge_base',
  },
  upload: {
    maxFileSizeBytes: parseInt(
      process.env.MAX_FILE_SIZE_BYTES ?? `${10 * 1024 * 1024}`,
      10,
    ),
  },
  chunking: {
    chunkSize: parseInt(process.env.CHUNK_SIZE ?? '800', 10),
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP ?? '150', 10),
  },
  retrieval: {
    topK: parseInt(process.env.RETRIEVAL_TOP_K ?? '5', 10),
    candidatePoolSize: parseInt(process.env.RETRIEVAL_CANDIDATE_POOL_SIZE ?? '10', 10),
  },
});

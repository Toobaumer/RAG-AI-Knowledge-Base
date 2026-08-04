import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChromaClient, Collection } from 'chromadb';
import { IndexedDocument, VectorEntry, VectorMatch, VectorStorePort } from './vector-store.port';

/**
 * ChromaDB implementation of the VectorStorePort.
 *
 * This is the only file in the app that imports the `chromadb` package.
 * Everything else talks to VectorStorePort, so this class could be
 * replaced by a Pinecone/Weaviate/pgvector adapter later without touching
 * KnowledgeService or ChatService.
 */
@Injectable()
export class ChromaVectorStoreService implements VectorStorePort, OnModuleInit {
  private readonly logger = new Logger(ChromaVectorStoreService.name);
  private client: ChromaClient;
  private collection: Collection;
  private readonly collectionName: string;

  constructor(private readonly configService: ConfigService) {
    this.collectionName =
      this.configService.get<string>('chroma.collectionName') ?? 'knowledge_base';

    const chromaUrl = this.configService.get<string>('chroma.url') ?? 'http://localhost:8000';
    const url = new URL(chromaUrl);

    this.client = new ChromaClient({
      ssl: url.protocol === 'https:',
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 8000,
    });
  }

  /**
   * Runs once when the app starts. Gets (or creates, on first run) the
   * Chroma collection this app stores everything in.
   */
  async onModuleInit(): Promise<void> {
    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
      });
      this.logger.log(`Connected to ChromaDB collection "${this.collectionName}"`);
    } catch (error) {
      this.logger.error(
        `Could not connect to ChromaDB. Is the server running? ${error.message}`,
      );
      // Deliberately not re-thrown here: the app should still start (so the
      // dashboard loads and gives a clear error later) even if ChromaDB is
      // temporarily unreachable at boot time.
    }
  }

  async upsert(entries: VectorEntry[]): Promise<void> {
    if (entries.length === 0) return;

    try {
      await this.collection.upsert({
        ids: entries.map((entry) => entry.id),
        embeddings: entries.map((entry) => entry.embedding),
        documents: entries.map((entry) => entry.content),
        metadatas: entries.map((entry) => entry.metadata),
      });
    } catch (error) {
      this.logger.error(`ChromaDB upsert failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        'Failed to save the document to the knowledge base. Please make sure ChromaDB is running.',
      );
    }
  }

  async query(embedding: number[], topK: number): Promise<VectorMatch[]> {
    try {
      const results = await this.collection.query({
        queryEmbeddings: [embedding],
        nResults: topK,
      });

      const ids = results.ids?.[0] ?? [];
      const documents = results.documents?.[0] ?? [];
      const metadatas = results.metadatas?.[0] ?? [];
      const distances = results.distances?.[0] ?? [];

      return ids.map((id, index) => ({
        id,
        content: documents[index] ?? '',
        metadata: (metadatas[index] ?? {}) as Record<string, string | number>,
        distance: distances[index] ?? 0,
      }));
    } catch (error) {
      this.logger.error(`ChromaDB query failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        'Failed to search the knowledge base. Please make sure ChromaDB is running.',
      );
    }
  }

  async getAllDocuments(): Promise<IndexedDocument[]> {
    try {
      const results = await this.collection.get({
        include: ['documents', 'metadatas'] as any,
      });

      const ids = results.ids ?? [];
      const documents = results.documents ?? [];
      const metadatas = results.metadatas ?? [];

      return ids.map((id, index) => ({
        id,
        content: documents[index] ?? '',
        metadata: (metadatas[index] ?? {}) as Record<string, string | number>,
      }));
    } catch (error) {
      this.logger.error(`ChromaDB getAllDocuments failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        'Failed to load the knowledge base. Please make sure ChromaDB is running.',
      );
    }
  }
}

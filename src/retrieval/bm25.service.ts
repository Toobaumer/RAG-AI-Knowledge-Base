import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { VECTOR_STORE, VectorStorePort } from '../vector-store/vector-store.port';

export interface Bm25Match {
  id: string;
  content: string;
  metadata: Record<string, string | number>;
  score: number;
}

interface IndexedDoc {
  id: string;
  content: string;
  metadata: Record<string, string | number>;
  tokens: string[];
  termCounts: Map<string, number>;
}

/**
 * BM25 keyword search, implemented in memory rather than via an external
 * search engine (Elasticsearch, etc.), since this project deliberately
 * avoids adding infrastructure (no Redis, no Docker) beyond ChromaDB.
 *
 * BM25 is the classic keyword-ranking algorithm behind most "lexical
 * search" systems. Unlike embeddings, it scores documents by how often
 * and how distinctively a query's exact terms appear, which is precisely
 * the retrieval mode that dense/semantic search alone can miss - for
 * example, a document containing the literal phrase "program overview"
 * scores very highly against the query "program overview" here,
 * regardless of how that phrase's meaning happens to embed.
 *
 * Persistence note: the index rebuilds itself from ChromaDB at startup
 * (see onModuleInit), so restarting the app does not lose keyword search
 * coverage over previously uploaded documents. During a running session,
 * indexDocuments() is called right after every new upload to keep this
 * index in sync with what KnowledgeService just stored in ChromaDB.
 */
@Injectable()
export class Bm25Service implements OnModuleInit {
  private readonly logger = new Logger(Bm25Service.name);

  private readonly documents = new Map<string, IndexedDoc>();
  private documentFrequency = new Map<string, number>();
  private averageDocumentLength = 0;

  // Standard BM25 tuning constants. k1 controls how quickly term
  // frequency saturates (higher = repeated terms keep adding more score
  // for longer); b controls how much document length is penalized
  // (0 = no length penalty, 1 = full penalty). These are the widely used
  // textbook defaults, not tuned specifically for this project.
  private readonly k1 = 1.5;
  private readonly b = 0.75;

  constructor(@Inject(VECTOR_STORE) private readonly vectorStore: VectorStorePort) {}

  async onModuleInit(): Promise<void> {
    try {
      const existing = await this.vectorStore.getAllDocuments();
      if (existing.length > 0) {
        // Match the same heading+content composite used at upload time
        // (see KnowledgeService.ingestPdf) - metadata.heading is stored
        // in ChromaDB, so it is available here too, keeping the BM25
        // index consistent whether it was built live or rehydrated after
        // a restart.
        const withHeadings = existing.map((doc) => ({
          id: doc.id,
          content: `${doc.metadata.heading ?? ''}\n${doc.content}`,
          metadata: doc.metadata,
        }));
        this.indexDocuments(withHeadings);
        this.logger.log(`BM25 index hydrated with ${existing.length} existing chunks.`);
      }
    } catch (error) {
      this.logger.warn(
        `Could not hydrate BM25 index from the vector store at startup: ${error.message}`,
      );
    }
  }

  /** Adds (or re-indexes) a batch of chunks into the in-memory BM25 index. */
  indexDocuments(
    entries: { id: string; content: string; metadata: Record<string, string | number> }[],
  ): void {
    for (const entry of entries) {
      const tokens = this.tokenize(entry.content);
      const termCounts = new Map<string, number>();
      for (const token of tokens) {
        termCounts.set(token, (termCounts.get(token) ?? 0) + 1);
      }

      this.documents.set(entry.id, {
        id: entry.id,
        content: entry.content,
        metadata: entry.metadata,
        tokens,
        termCounts,
      });
    }

    this.recomputeStatistics();
  }

  /** Returns the topK documents with the highest BM25 score for the query. */
  search(query: string, topK: number): Bm25Match[] {
    if (this.documents.size === 0) return [];

    const queryTerms = Array.from(new Set(this.tokenize(query)));
    if (queryTerms.length === 0) return [];

    const scored: Bm25Match[] = [];

    for (const doc of this.documents.values()) {
      const score = this.scoreDocument(doc, queryTerms);
      if (score > 0) {
        scored.push({ id: doc.id, content: doc.content, metadata: doc.metadata, score });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  private scoreDocument(doc: IndexedDoc, queryTerms: string[]): number {
    const totalDocs = this.documents.size;
    let score = 0;

    for (const term of queryTerms) {
      const termFrequency = doc.termCounts.get(term) ?? 0;
      if (termFrequency === 0) continue;

      const docsContainingTerm = this.documentFrequency.get(term) ?? 0;
      const idf = Math.log(
        (totalDocs - docsContainingTerm + 0.5) / (docsContainingTerm + 0.5) + 1,
      );

      const lengthNorm = 1 - this.b + this.b * (doc.tokens.length / (this.averageDocumentLength || 1));
      const numerator = termFrequency * (this.k1 + 1);
      const denominator = termFrequency + this.k1 * lengthNorm;

      score += idf * (numerator / denominator);
    }

    return score;
  }

  private recomputeStatistics(): void {
    this.documentFrequency = new Map<string, number>();
    let totalLength = 0;

    for (const doc of this.documents.values()) {
      totalLength += doc.tokens.length;
      for (const term of doc.termCounts.keys()) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
      }
    }

    this.averageDocumentLength = this.documents.size > 0 ? totalLength / this.documents.size : 0;
  }

  /**
   * Lowercases, strips punctuation, and splits on whitespace. No stopword
   * removal or stemming - a deliberate simplification for a portfolio
   * project. A production system would typically strip very common words
   * ("the", "is", "and") and stem terms ("running" -> "run") for better
   * matching.
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 0);
  }
}

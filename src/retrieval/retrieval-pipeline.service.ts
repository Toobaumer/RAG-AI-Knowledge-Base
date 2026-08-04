import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiEmbeddingService } from '../gemini/gemini-embedding.service';
import { VectorSearchService } from './vector-search.service';
import { Bm25Service } from './bm25.service';
import { HybridSearchService } from './hybrid-search.service';
import { RERANK_PROVIDER, RankedChunk, RerankProvider } from './rerank.port';

/**
 * Orchestrates the full hybrid retrieval pipeline:
 *
 *   question -> embed -> vector search + BM25 search (in parallel)
 *   -> merge and deduplicate -> rerank -> top K chunks
 *
 * This is the one place that knows the pipeline has these particular
 * stages, in this order. ChatService depends only on this service's
 * `retrieve()` method, not on any of the individual search or ranking
 * services - so the pipeline's internals (which search strategies run,
 * how they are combined, which reranker is active) can keep evolving
 * without ChatService or the /chat API contract ever changing.
 */
@Injectable()
export class RetrievalPipelineService {
  private readonly logger = new Logger(RetrievalPipelineService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly embeddingService: GeminiEmbeddingService,
    private readonly vectorSearchService: VectorSearchService,
    private readonly bm25Service: Bm25Service,
    private readonly hybridSearchService: HybridSearchService,
    @Inject(RERANK_PROVIDER) private readonly rerankProvider: RerankProvider,
  ) {}

  async retrieve(question: string): Promise<RankedChunk[]> {
    const candidatePoolSize = this.configService.get<number>('retrieval.candidatePoolSize') ?? 10;
    const finalTopK = this.configService.get<number>('retrieval.topK') ?? 5;

    this.logger.log(`Question received: "${question}"`);

    this.logger.log('Generating embedding...');
    const questionEmbedding = await this.embeddingService.embedText(question, 'RETRIEVAL_QUERY');

    this.logger.log('Running vector search...');
    const vectorMatches = await this.vectorSearchService.search(questionEmbedding, candidatePoolSize);

    this.logger.log('Running BM25 search...');
    const bm25Matches = this.bm25Service.search(question, candidatePoolSize);

    this.logger.log('Merging results...');
    const merged = this.hybridSearchService.merge(vectorMatches, bm25Matches);

    this.logger.log(`Removing duplicates... (${merged.length} unique candidates)`);
    // Deduplication already happened inside HybridSearchService.merge
    // (it is keyed by chunk id), this log line marks that stage explicitly
    // per the pipeline's documented workflow.

    this.logger.log('Re-ranking...');
    const ranked = await this.rerankProvider.rerank(question, merged, finalTopK);

    // Debug-level logging of each finalist's score breakdown. Visible by
    // default in development (Nest's default logger shows debug level),
    // and genuinely useful beyond initial debugging: if retrieval quality
    // ever looks off again, these lines show exactly which chunk won and
    // why, instead of guessing from the outside.
    ranked.forEach((chunk, index) => {
      this.logger.debug(
        `#${index + 1} [${chunk.id}] heading="${chunk.metadata.heading}" ` +
          `final=${chunk.finalScore.toFixed(3)} semantic=${chunk.semanticScore.toFixed(3)} ` +
          `keyword=${chunk.keywordScore.toFixed(3)} metadata=${chunk.metadataScore.toFixed(3)}`,
      );
    });

    this.logger.log(`Selecting top ${finalTopK} chunks.`);

    return ranked;
  }
}

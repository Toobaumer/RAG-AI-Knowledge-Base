import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';
import { VectorSearchService } from './vector-search.service';
import { Bm25Service } from './bm25.service';
import { HybridSearchService } from './hybrid-search.service';
import { RerankService } from './rerank.service';
import { RERANK_PROVIDER } from './rerank.port';
import { RetrievalPipelineService } from './retrieval-pipeline.service';

/**
 * Groups everything involved in turning a question into a ranked list of
 * chunks: vector search, BM25 keyword search, merging, and reranking.
 *
 * Both KnowledgeModule (which needs Bm25Service to keep the keyword index
 * in sync on every upload) and ChatModule (which needs
 * RetrievalPipelineService to answer questions) import this module.
 * NestJS's dependency injection container treats providers as
 * application-wide singletons by default, so both modules share the
 * exact same Bm25Service instance - a chunk indexed via KnowledgeModule
 * is immediately searchable via ChatModule's pipeline, with no separate
 * synchronization step needed.
 *
 * To swap the default heuristic reranker for a future Cohere-backed one
 * (see cohere-rerank.provider.ts), change the `useClass` line below -
 * nothing else in the app needs to change.
 */
@Module({
  imports: [GeminiModule, VectorStoreModule],
  providers: [
    VectorSearchService,
    Bm25Service,
    HybridSearchService,
    {
      provide: RERANK_PROVIDER,
      useClass: RerankService,
    },
    RetrievalPipelineService,
  ],
  exports: [Bm25Service, RetrievalPipelineService],
})
export class RetrievalModule {}

import { Inject, Injectable } from '@nestjs/common';
import { VECTOR_STORE, VectorMatch, VectorStorePort } from '../vector-store/vector-store.port';

/**
 * A thin wrapper around VectorStorePort's semantic search. This exists as
 * its own service (rather than injecting VECTOR_STORE directly into
 * HybridSearchService) so that vector search and keyword search
 * (Bm25Service) are symmetric, equally visible collaborators in
 * RetrievalPipelineService - matching the architecture the project brief
 * asks for (separate VectorSearchService and BM25Service).
 */
@Injectable()
export class VectorSearchService {
  constructor(@Inject(VECTOR_STORE) private readonly vectorStore: VectorStorePort) {}

  async search(embedding: number[], topK: number): Promise<VectorMatch[]> {
    return this.vectorStore.query(embedding, topK);
  }
}

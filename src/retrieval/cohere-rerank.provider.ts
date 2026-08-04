import { Injectable, Logger } from '@nestjs/common';
import { CandidateChunk } from './hybrid-search.service';
import { RankedChunk, RerankProvider } from './rerank.port';

/**
 * A future, Cohere-backed implementation of RerankProvider.
 *
 * This class is NOT registered as the active reranker anywhere in this
 * project (see RetrievalModule) and does NOT require a COHERE_API_KEY to
 * exist. It exists purely to document the exact seam where a real Cohere
 * integration would plug in later, following the same dependency
 * inversion pattern as VectorStorePort: RetrievalPipelineService depends
 * on RerankProvider (the interface), never on RerankService or this class
 * directly, so switching providers is a one-line change in RetrievalModule.
 *
 * To make this real in a future lesson:
 *
 *   1. Add COHERE_API_KEY to configuration.ts and .env.example.
 *   2. Install the Cohere SDK (`npm install cohere-ai`).
 *   3. Implement `rerank()` below: call Cohere's rerank endpoint with the
 *      query and each candidate's `content`, which returns a relevance
 *      score per document. Map those scores onto RankedChunk the same
 *      way RerankService does, then sort and slice to topK.
 *   4. In RetrievalModule, change the RERANK_PROVIDER binding from
 *      `useClass: RerankService` to `useClass: CohereRerankProvider`.
 *
 * Nothing in RetrievalPipelineService, ChatService, or the frontend would
 * need to change for that swap.
 */
@Injectable()
export class CohereRerankProvider implements RerankProvider {
  private readonly logger = new Logger(CohereRerankProvider.name);

  async rerank(
    _query: string,
    _candidates: CandidateChunk[],
    _topK: number,
  ): Promise<RankedChunk[]> {
    throw new Error(
      'CohereRerankProvider is a placeholder for a future integration and is not wired in. ' +
        'RetrievalModule currently binds RERANK_PROVIDER to RerankService (the heuristic reranker). ' +
        'See the class-level comment in cohere-rerank.provider.ts for how to complete this integration.',
    );
  }
}

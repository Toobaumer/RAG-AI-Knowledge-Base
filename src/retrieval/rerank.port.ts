import { CandidateChunk } from './hybrid-search.service';

/**
 * A chunk after reranking, carrying its final combined score and the
 * individual signal scores that produced it (useful for debugging and for
 * the frontend's confidence indicator). `distance` is included so this
 * shape stays compatible with VectorMatch, which is what
 * PromptBuilderService already expects - it is not a meaningful distance
 * metric on its own, just 1 minus the normalized semantic score.
 */
export interface RankedChunk {
  id: string;
  content: string;
  metadata: Record<string, string | number>;
  distance: number;
  semanticScore: number;
  keywordScore: number;
  metadataScore: number;
  finalScore: number;
}

/**
 * The "port" the rest of the app depends on for reranking, following the
 * same ports-and-adapters pattern as VectorStorePort. RerankService (the
 * default, heuristic implementation) and CohereRerankProvider (a future,
 * API-backed implementation) both implement this interface.
 *
 * RetrievalPipelineService depends only on this interface via the
 * RERANK_PROVIDER token, never on RerankService directly - so switching
 * from the heuristic reranker to Cohere's rerank API later means writing
 * one new class and changing one line in RetrievalModule, with zero
 * changes to RetrievalPipelineService, ChatService, or anything upstream.
 */
export const RERANK_PROVIDER = 'RERANK_PROVIDER';

export interface RerankProvider {
  rerank(query: string, candidates: CandidateChunk[], topK: number): Promise<RankedChunk[]>;
}

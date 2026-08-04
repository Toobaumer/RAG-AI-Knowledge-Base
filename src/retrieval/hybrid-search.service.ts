import { Injectable } from '@nestjs/common';
import { VectorMatch } from '../vector-store/vector-store.port';
import { Bm25Match } from './bm25.service';

/**
 * A chunk that survived the merge step, carrying whichever scores it
 * earned from each search method. A chunk found by both vector and BM25
 * search carries both; a chunk found by only one carries just that one,
 * left undefined rather than defaulted here - RerankService is
 * responsible for deciding how to treat a missing score, since that is a
 * scoring policy decision, not a merging one.
 */
export interface CandidateChunk {
  id: string;
  content: string;
  metadata: Record<string, string | number>;
  vectorDistance?: number;
  bm25Score?: number;
}

/**
 * Combines the two independent candidate pools (semantic vector search,
 * BM25 keyword search) into one deduplicated list, keyed by chunk id.
 * This is a pure merge step - no ranking or scoring happens here, that is
 * RerankService's job. Keeping merge and rank as separate services means
 * either one can change independently (for example, swapping in a
 * different merge strategy later, or replacing RerankService with a
 * Cohere-backed reranker) without touching the other.
 */
@Injectable()
export class HybridSearchService {
  merge(vectorMatches: VectorMatch[], bm25Matches: Bm25Match[]): CandidateChunk[] {
    const candidates = new Map<string, CandidateChunk>();

    for (const match of vectorMatches) {
      candidates.set(match.id, {
        id: match.id,
        content: match.content,
        metadata: match.metadata,
        vectorDistance: match.distance,
      });
    }

    for (const match of bm25Matches) {
      const existing = candidates.get(match.id);
      if (existing) {
        existing.bm25Score = match.score;
      } else {
        candidates.set(match.id, {
          id: match.id,
          content: match.content,
          metadata: match.metadata,
          bm25Score: match.score,
        });
      }
    }

    return Array.from(candidates.values());
  }
}

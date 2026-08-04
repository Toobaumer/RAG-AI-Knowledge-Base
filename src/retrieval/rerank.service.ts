import { Injectable, Logger } from '@nestjs/common';
import { CandidateChunk } from './hybrid-search.service';
import { RankedChunk, RerankProvider } from './rerank.port';

/**
 * The default RerankProvider: a heuristic (not model-based) scorer that
 * combines three signals into one final score per candidate chunk:
 *
 *  1. Semantic score - derived from the vector search distance, when the
 *     chunk was found by vector search. Chunks found only by BM25 (not
 *     vector search) get a modest fixed semantic score rather than zero,
 *     since a chunk with no vector match at all is still a real keyword
 *     hit worth considering, not an irrelevant one.
 *  2. Keyword score - derived from the chunk's BM25 score when available,
 *     normalized against the strongest BM25 score in this candidate set.
 *     Chunks found only by vector search (not BM25) fall back to a simple
 *     query-term overlap ratio, so they are not unfairly zeroed out.
 *  3. Metadata score - a small heuristic bonus for chunks with a specific
 *     (non-default) heading and a "healthy" content length, as a mild
 *     signal that this chunk is a well-formed, self-contained unit rather
 *     than a stray fragment.
 *
 * Weights (0.5 / 0.35 / 0.15) were chosen deliberately, not tuned via
 * evaluation data: semantic similarity is kept as the primary signal
 * since it generalizes best across paraphrased questions, but keyword
 * score is weighted heavily enough to fix the specific failure mode this
 * project hit in practice (a query using a document's exact heading
 * phrase failing to retrieve that chunk via embeddings alone). Metadata
 * quality is intentionally a minor tie-breaker, not a primary driver.
 * These weights are exactly the kind of thing Ragas evaluation (a planned
 * future addition) would let you tune against real measured accuracy
 * instead of judgment calls.
 */
@Injectable()
export class RerankService implements RerankProvider {
  private readonly logger = new Logger(RerankService.name);

  async rerank(
    query: string,
    candidates: CandidateChunk[],
    topK: number,
  ): Promise<RankedChunk[]> {
    if (candidates.length === 0) return [];

    const queryTerms = this.tokenize(query);
    const maxBm25Score = Math.max(...candidates.map((c) => c.bm25Score ?? 0), 1e-9);

    const ranked: RankedChunk[] = candidates.map((candidate) => {
      const semanticScore = this.computeSemanticScore(candidate);
      const keywordScore = this.computeKeywordScore(candidate, queryTerms, maxBm25Score);
      const metadataScore = this.computeMetadataScore(candidate);

      const finalScore = 0.5 * semanticScore + 0.35 * keywordScore + 0.15 * metadataScore;

      return {
        id: candidate.id,
        content: candidate.content,
        metadata: candidate.metadata,
        distance: 1 - semanticScore,
        semanticScore,
        keywordScore,
        metadataScore,
        finalScore,
      };
    });

    ranked.sort((a, b) => b.finalScore - a.finalScore);
    return ranked.slice(0, topK);
  }

  /** Converts a vector distance into a 0-1 similarity score. Falls back to a
   * modest fixed value for chunks that only came from BM25 search. */
  private computeSemanticScore(candidate: CandidateChunk): number {
    if (candidate.vectorDistance === undefined) {
      return 0.3;
    }
    // ChromaDB's default distance metric is roughly in [0, 2] for
    // normalized vectors; 1 / (1 + distance) maps smaller distances
    // (more similar) to scores closer to 1, without needing to know the
    // exact metric's bounds.
    return 1 / (1 + candidate.vectorDistance);
  }

  /** Normalized BM25 score, or a simple term-overlap fallback for
   * vector-only candidates. */
  private computeKeywordScore(
    candidate: CandidateChunk,
    queryTerms: string[],
    maxBm25Score: number,
  ): number {
    if (candidate.bm25Score !== undefined) {
      return candidate.bm25Score / maxBm25Score;
    }

    if (queryTerms.length === 0) return 0;

    const contentTerms = new Set(this.tokenize(candidate.content));
    const overlap = queryTerms.filter((term) => contentTerms.has(term)).length;
    return overlap / queryTerms.length;
  }

  private computeMetadataScore(candidate: CandidateChunk): number {
    let score = 0;

    const heading = String(candidate.metadata.heading ?? '');
    if (heading.length > 0 && heading !== 'Introduction') {
      score += 0.5;
    }

    const length = candidate.content.length;
    if (length >= 100 && length <= 1200) {
      score += 0.5;
    }

    return score;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 0);
  }
}

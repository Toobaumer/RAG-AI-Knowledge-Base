import { Injectable } from '@nestjs/common';
import { VectorMatch } from '../vector-store/vector-store.port';

/**
 * Turns a list of retrieved chunks into the single context string that
 * gets handed to Gemini. Kept as its own service (rather than inlined in
 * ChatService) so the context format can evolve independently - for
 * example, a future lesson on hybrid search or reranking could change how
 * chunks are ordered or labeled here without touching the retrieval or
 * generation logic.
 */
@Injectable()
export class PromptBuilderService {
  buildContext(matches: VectorMatch[]): string {
    if (matches.length === 0) {
      return '(No relevant content was found in the knowledge base.)';
    }

    return matches
      .map((match, index) => {
        const fileName = match.metadata.fileName ?? 'unknown source';
        const heading = match.metadata.heading ?? 'unknown section';
        return `[Source ${index + 1}: ${fileName}, section "${heading}"]\n${match.content}`;
      })
      .join('\n\n');
  }

  /** Deduplicated, human-readable list of source file names for the response. */
  extractSourceFileNames(matches: VectorMatch[]): string[] {
    const fileNames = matches.map((match) => String(match.metadata.fileName ?? 'unknown source'));
    return Array.from(new Set(fileNames));
  }
}

import { Injectable } from '@nestjs/common';
import { VectorMatch } from '../vector-store/vector-store.port';

/**
 * Turns a list of retrieved chunks into the single context string that
 * gets handed to Gemini. Kept as its own service (rather than inlined in
 * ChatService) so the context format can evolve independently - for
 * example, hybrid search and reranking changed how chunks are found and
 * scored, but never needed to touch this file.
 *
 * Each chunk is wrapped with an explicit "BEGIN/END EXCERPT" delimiter.
 * This is a second, defense-in-depth layer against prompt injection
 * alongside the system prompt's explicit instruction (see
 * GeminiGenerationService): clearly bounding where document text starts
 * and ends makes it harder for text inside a chunk to be mistaken for
 * part of the surrounding instructions.
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
        return `[Source ${index + 1}: ${fileName}, section "${heading}"]\n--- BEGIN EXCERPT ---\n${match.content}\n--- END EXCERPT ---`;
      })
      .join('\n\n');
  }

  /** Deduplicated, human-readable list of source file names for the response. */
  extractSourceFileNames(matches: VectorMatch[]): string[] {
    const fileNames = matches.map((match) => String(match.metadata.fileName ?? 'unknown source'));
    return Array.from(new Set(fileNames));
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Recursive chunking for retrieval.
 *
 * This is deliberately different from a plain fixed-size splitter:
 *
 *  1. The document is first split by heading ("## ..."), so a chunk never
 *     silently blends two unrelated topics together. Each chunk records
 *     which heading it belongs to, which becomes useful, human-readable
 *     source metadata later ("this answer came from the Pricing section").
 *  2. Within each heading section, text is split into sentences (never
 *     mid-sentence), and sentences are packed greedily into a chunk until
 *     it reaches the configured chunk size.
 *  3. When a chunk is finalized, the next chunk starts by repeating the
 *     trailing sentences of the previous chunk, up to the configured
 *     overlap size. This overlap means a fact that happens to sit right at
 *     a chunk boundary is not the only place it appears in the index -
 *     it is still likely to be captured whole in at least one chunk,
 *     which is the whole point of overlap in a RAG pipeline.
 *
 * Known simplification: overlap is measured in characters of trailing
 * sentences, not tokens, and very long single sentences that exceed the
 * chunk size on their own are kept whole rather than being cut mid
 * sentence. Both are reasonable trade-offs for a portfolio-scale project,
 * and worth calling out explicitly if asked in an interview.
 */

export interface RagChunk {
  id: string;
  content: string;
  heading: string;
  order: number;
  charCount: number;
}

interface RawSection {
  heading: string;
  content: string;
}

@Injectable()
export class ChunkingService {
  constructor(private readonly configService: ConfigService) {}

  chunkForRag(markdown: string): RagChunk[] {
    const chunkSize = this.configService.get<number>('chunking.chunkSize') ?? 800;
    const chunkOverlap = this.configService.get<number>('chunking.chunkOverlap') ?? 150;

    const sections = this.splitByHeadings(markdown);
    const chunks: RagChunk[] = [];
    let order = 0;

    for (const section of sections) {
      const sectionChunks = this.chunkSection(section, chunkSize, chunkOverlap);
      for (const content of sectionChunks) {
        chunks.push({
          id: `chunk-${order + 1}`,
          content,
          heading: section.heading,
          order,
          charCount: content.length,
        });
        order += 1;
      }
    }

    return chunks;
  }

  /** Splits Markdown into sections by "## " heading lines. */
  private splitByHeadings(markdown: string): RawSection[] {
    const lines = markdown.split('\n');
    const sections: RawSection[] = [];

    let currentHeading = 'Introduction';
    let currentLines: string[] = [];

    const flush = () => {
      const content = currentLines.join('\n').trim();
      if (content.length > 0) {
        sections.push({ heading: currentHeading, content });
      }
      currentLines = [];
    };

    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.*)$/);
      if (headingMatch) {
        flush();
        currentHeading = headingMatch[1].trim();
        continue;
      }
      currentLines.push(line);
    }
    flush();

    return sections;
  }

  /** Splits a single section's text into sentences. */
  private splitIntoSentences(text: string): string[] {
    // Split after a sentence-ending punctuation mark followed by whitespace,
    // without consuming the punctuation itself.
    return text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);
  }

  /**
   * Packs a section's sentences into chunks of roughly `chunkSize`
   * characters, repeating up to `chunkOverlap` characters of trailing
   * sentences at the start of the next chunk.
   */
  private chunkSection(
    section: RawSection,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const sentences = this.splitIntoSentences(section.content);
    if (sentences.length === 0) return [];

    const chunks: string[] = [];
    let current: string[] = [];
    let currentLength = 0;

    const finalizeChunk = () => {
      if (current.length === 0) return;
      chunks.push(current.join(' '));
    };

    /** Builds the overlap seed for the next chunk from the tail of `current`. */
    const buildOverlapSeed = (): string[] => {
      const seed: string[] = [];
      let seedLength = 0;

      for (let i = current.length - 1; i >= 0; i -= 1) {
        const sentence = current[i];
        if (seedLength + sentence.length > chunkOverlap && seed.length > 0) break;
        seed.unshift(sentence);
        seedLength += sentence.length + 1;
      }

      return seed;
    };

    for (const sentence of sentences) {
      const additionalLength = sentence.length + (current.length > 0 ? 1 : 0);

      if (currentLength + additionalLength > chunkSize && current.length > 0) {
        finalizeChunk();

        const overlapSeed = buildOverlapSeed();
        current = [...overlapSeed];
        currentLength = current.reduce((sum, s) => sum + s.length + 1, 0);
      }

      current.push(sentence);
      currentLength += additionalLength;
    }

    finalizeChunk();

    return chunks;
  }
}

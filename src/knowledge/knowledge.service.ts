import { Inject, Injectable, Logger } from '@nestjs/common';
import { parsePdfBuffer } from '../common/pdf/pdf-parser.util';
import { cleanExtractedText } from '../common/text/text-cleaner.util';
import { convertTextToMarkdown } from '../common/markdown/markdown-converter.util';
import { ChunkingService } from '../common/chunking/chunking.service';
import { GeminiEmbeddingService } from '../gemini/gemini-embedding.service';
import { VECTOR_STORE, VectorStorePort, VectorEntry } from '../vector-store/vector-store.port';
import { UploadResponseDto } from './dto/upload-response.dto';

/**
 * Orchestrates the "ingest a PDF into the knowledge base" pipeline:
 *
 *   PDF buffer -> parse -> clean -> markdown -> chunk -> embed each chunk
 *   -> store in the vector database
 *
 * Like the ingestion pipeline this project builds on, this service
 * contains no PDF-parsing, chunking, or embedding logic itself - it wires
 * together single-responsibility collaborators, which keeps each part
 * independently testable and replaceable.
 */
@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly chunkingService: ChunkingService,
    private readonly embeddingService: GeminiEmbeddingService,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStorePort,
  ) {}

  async ingestPdf(file: Express.Multer.File): Promise<UploadResponseDto> {
    this.logger.log(`Ingesting upload: ${file.originalname} (${file.size} bytes)`);

    // Step 1-2: Parse the PDF buffer and extract raw text + page count
    const parsed = await parsePdfBuffer(file.buffer);

    // Step 3: Clean the raw extracted text
    const cleanedText = cleanExtractedText(parsed.rawText);

    // Step 4: Convert to Markdown (headings become chunk/section boundaries)
    const markdown = convertTextToMarkdown(cleanedText);

    // Step 5: Recursive, sentence-safe, overlapping chunking
    const chunks = this.chunkingService.chunkForRag(markdown);

    const uploadedAt = new Date().toISOString();

    // Step 6: Embed every chunk, then store it in the vector database with
    // metadata that lets the chat endpoint show where an answer came from.
    const entries: VectorEntry[] = [];
    for (const chunk of chunks) {
      const embedding = await this.embeddingService.embedText(chunk.content);

      entries.push({
        id: `${file.originalname}::${chunk.id}`,
        content: chunk.content,
        embedding,
        metadata: {
          fileName: file.originalname,
          pageCount: parsed.numPages,
          uploadedAt,
          chunkId: chunk.id,
          heading: chunk.heading,
        },
      });
    }

    await this.vectorStore.upsert(entries);

    return {
      message: 'Document processed and added to the knowledge base.',
      fileName: file.originalname,
      pageCount: parsed.numPages,
      chunkCount: chunks.length,
      uploadedAt,
    };
  }
}

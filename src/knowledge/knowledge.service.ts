import { Inject, Injectable, Logger } from '@nestjs/common';
import { parsePdfBuffer } from '../common/pdf/pdf-parser.util';
import { cleanExtractedText } from '../common/text/text-cleaner.util';
import { convertTextToMarkdown } from '../common/markdown/markdown-converter.util';
import { ChunkingService } from '../common/chunking/chunking.service';
import { GeminiEmbeddingService } from '../gemini/gemini-embedding.service';
import { VECTOR_STORE, VectorStorePort, VectorEntry } from '../vector-store/vector-store.port';
import { Bm25Service } from '../retrieval/bm25.service';
import { UploadResponseDto } from './dto/upload-response.dto';

/**
 * Orchestrates the "ingest a PDF into the knowledge base" pipeline:
 *
 *   PDF buffer -> parse -> clean -> markdown -> chunk -> embed each chunk
 *   -> store in the vector database -> index into the BM25 keyword index
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
    private readonly bm25Service: Bm25Service,
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
      const embedding = await this.embeddingService.embedText(chunk.content, 'RETRIEVAL_DOCUMENT');

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

    // Keep the in-memory BM25 keyword index in sync with what was just
    // stored, so hybrid search can find these chunks by keyword
    // immediately, without waiting for an app restart.
    //
    // BM25 indexes heading + content together, unlike the embeddings
    // above. ChunkingService strips a chunk's heading (e.g. "Program
    // Overview") out of its body text, keeping it only as metadata -
    // without this, a query using that exact heading phrase has no
    // searchable text anywhere to match against, in either vector or
    // keyword search. This is safe specifically for BM25 (unlike the
    // earlier embedding-prefix experiment, which was tested and reverted):
    // BM25 scores terms additively, so adding heading terms earns real,
    // deserved score without diluting or blending anything the way a
    // single dense embedding vector would.
    const bm25Entries = entries.map((entry, index) => ({
      id: entry.id,
      content: `${chunks[index].heading}\n${entry.content}`,
      metadata: entry.metadata,
    }));
    this.bm25Service.indexDocuments(bm25Entries);

    return {
      message: 'Document processed and added to the knowledge base.',
      fileName: file.originalname,
      pageCount: parsed.numPages,
      chunkCount: chunks.length,
      uploadedAt,
    };
  }
}

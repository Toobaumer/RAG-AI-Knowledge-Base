import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiEmbeddingService } from '../gemini/gemini-embedding.service';
import { GeminiGenerationService } from '../gemini/gemini-generation.service';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { VECTOR_STORE, VectorStorePort } from '../vector-store/vector-store.port';
import { ChatResponseDto } from './dto/chat-response.dto';

/**
 * The retrieval-augmented generation orchestrator. This is the "RAG
 * Service" the project brief asks for - the workflow is:
 *
 *   question -> embed -> search ChromaDB -> assemble context
 *   -> Gemini generation -> { answer, sources }
 *
 * Note this class has no idea chunks were created by recursive chunking,
 * or that embeddings come from Gemini specifically - it only depends on
 * VectorStorePort and the two Gemini services' public methods. That
 * separation is what future lessons (Redis conversation memory, Ragas
 * evaluation, reranking, hybrid search) can build on without needing to
 * touch this file's core flow.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly embeddingService: GeminiEmbeddingService,
    private readonly generationService: GeminiGenerationService,
    private readonly promptBuilder: PromptBuilderService,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStorePort,
  ) {}

  async answerQuestion(question: string): Promise<ChatResponseDto> {
    const topK = this.configService.get<number>('retrieval.topK') ?? 5;

    this.logger.log(`Answering question: "${question}"`);

    // Step 1: Embed the question using the same embedding model used to
    // index the documents, so both live in the same vector space.
    const questionEmbedding = await this.embeddingService.embedText(question);

    // Step 2: Search ChromaDB for the most similar chunks.
    const matches = await this.vectorStore.query(questionEmbedding, topK);

    // Step 3: Assemble the retrieved chunks into one context string.
    const context = this.promptBuilder.buildContext(matches);

    // Step 4: Generate the final answer, grounded only in that context.
    const answer = await this.generationService.generateAnswer(question, context);

    return {
      answer,
      sources: this.promptBuilder.extractSourceFileNames(matches),
    };
  }
}

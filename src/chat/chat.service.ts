import { Injectable, Logger } from '@nestjs/common';
import { GeminiGenerationService, NOT_FOUND_MESSAGE } from '../gemini/gemini-generation.service';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { RetrievalPipelineService } from '../retrieval/retrieval-pipeline.service';
import { RankedChunk } from '../retrieval/rerank.port';
import { sanitizeUserInput } from '../common/security/input-sanitizer.util';
import { ChatResponseDto, ConfidenceLevel } from './dto/chat-response.dto';

/**
 * The retrieval-augmented generation orchestrator. The workflow is:
 *
 *   question -> sanitize -> hybrid retrieval (vector + BM25 + rerank)
 *   -> assemble context -> Gemini generation -> { answer, sources, confidence }
 *
 * This class has no idea whether a chunk was found via semantic vector
 * search, BM25 keyword search, or both, and no idea how reranking scored
 * it - all of that is RetrievalPipelineService's responsibility. That
 * separation is exactly what made it possible to add hybrid search and
 * reranking without changing this file's public method signature or the
 * /chat API contract at all.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly retrievalPipeline: RetrievalPipelineService,
    private readonly generationService: GeminiGenerationService,
    private readonly promptBuilder: PromptBuilderService,
  ) {}

  async answerQuestion(rawQuestion: string): Promise<ChatResponseDto> {
    const question = sanitizeUserInput(rawQuestion);

    // Steps 1-5 (embed, vector search, BM25 search, merge, rerank) all
    // happen inside the pipeline, with their own stage-by-stage logging.
    const rankedChunks = await this.retrievalPipeline.retrieve(question);

    const context = this.promptBuilder.buildContext(rankedChunks);

    this.logger.log('Sending context to Gemini...');
    const answer = await this.generationService.generateAnswer(question, context);
    this.logger.log('Generating final response...');

    const response: ChatResponseDto = {
      answer,
      sources: this.promptBuilder.extractSourceFileNames(rankedChunks),
      confidence: this.computeConfidence(rankedChunks, answer),
    };

    this.logger.log('Completed.');
    return response;
  }

  /**
   * Buckets the top reranked chunk's finalScore into a simple, frontend
   * -friendly label. The 0.65 / 0.4 thresholds are tuned by judgment, not
   * measured against labeled data - exactly the kind of number a future
   * Ragas evaluation pass would let you set with real evidence instead.
   *
   * Confidence is forced to "low" whenever the model actually replied
   * with the "not found" fallback, regardless of how good retrieval
   * looked beforehand. Found as a real bug during testing: a chunk can
   * score well in retrieval but still lead Gemini to conclude it doesn't
   * answer the question, and the confidence label must reflect the
   * answer that was actually given, not just how retrieval scored it.
   */
  private computeConfidence(rankedChunks: RankedChunk[], answer: string): ConfidenceLevel {
    if (answer.trim() === NOT_FOUND_MESSAGE) {
      return 'low';
    }

    if (rankedChunks.length === 0) return 'low';

    const topScore = rankedChunks[0].finalScore;
    if (topScore >= 0.65) return 'high';
    if (topScore >= 0.4) return 'medium';
    return 'low';
  }
}

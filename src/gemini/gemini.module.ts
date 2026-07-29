import { Module } from '@nestjs/common';
import { GeminiEmbeddingService } from './gemini-embedding.service';
import { GeminiGenerationService } from './gemini-generation.service';

/**
 * Groups everything that talks to the Gemini API in one module. Both the
 * Knowledge module (embeddings, during upload) and the Chat module
 * (embeddings for the question, then generation for the answer) import
 * this module rather than reaching into Google's SDK directly.
 */
@Module({
  providers: [GeminiEmbeddingService, GeminiGenerationService],
  exports: [GeminiEmbeddingService, GeminiGenerationService],
})
export class GeminiModule {}

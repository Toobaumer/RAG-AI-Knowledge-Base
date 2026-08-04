import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { ChunkingService } from '../common/chunking/chunking.service';
import { GeminiModule } from '../gemini/gemini.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';
import { RetrievalModule } from '../retrieval/retrieval.module';

@Module({
  imports: [
    // Store uploads in memory (file.buffer) rather than on disk - this
    // project intentionally avoids any persistence layer for raw files.
    MulterModule.register({
      storage: memoryStorage(),
    }),
    GeminiModule,
    VectorStoreModule,
    RetrievalModule,
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, ChunkingService],
})
export class KnowledgeModule {}

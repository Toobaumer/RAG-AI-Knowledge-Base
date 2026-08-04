import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { GeminiModule } from '../gemini/gemini.module';
import { RetrievalModule } from '../retrieval/retrieval.module';

@Module({
  imports: [GeminiModule, RetrievalModule],
  controllers: [ChatController],
  providers: [ChatService, PromptBuilderService],
})
export class ChatModule {}

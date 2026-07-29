import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import configuration from './config/configuration';
import { GeminiModule } from './gemini/gemini.module';
import { VectorStoreModule } from './vector-store/vector-store.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    // Loads .env into process.env and exposes typed config via ConfigService
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Serves the Tailwind/vanilla-JS dashboard directly from NestJS, so the
    // browser is the only tool needed to use the app.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),

    // Shared infrastructure modules. Both KnowledgeModule and ChatModule
    // depend on these, but neither depends on the other - upload and chat
    // are independent features that only share the embedding + vector
    // store layer.
    GeminiModule,
    VectorStoreModule,

    // Feature modules
    KnowledgeModule,
    ChatModule,
  ],
})
export class AppModule {}

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3000;

  // Allow the vanilla-JS frontend (served from the same origin, but this
  // also makes local testing from other origins/tools painless).
  app.enableCors();

  // Strips unknown properties and validates incoming DTOs automatically -
  // this is what actually enforces "reject empty prompts" and
  // "allow PDF uploads only" at the request boundary.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`AI RAG Knowledge Base running on http://localhost:${port}`);
  logger.log(`Open the browser dashboard at http://localhost:${port}`);
}

bootstrap();

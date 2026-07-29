import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Validated at the request boundary by NestJS's global ValidationPipe
 * (see main.ts). @IsNotEmpty rejects empty prompts, and @MaxLength keeps a
 * single request from sending an unreasonably long question.
 */
export class ChatRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'question must not be empty.' })
  @MaxLength(2000, { message: 'question must be 2000 characters or fewer.' })
  question: string;
}

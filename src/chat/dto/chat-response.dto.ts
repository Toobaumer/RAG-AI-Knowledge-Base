export type ConfidenceLevel = 'high' | 'medium' | 'low';

export class ChatResponseDto {
  answer: string;
  sources: string[];
  confidence: ConfidenceLevel;
}

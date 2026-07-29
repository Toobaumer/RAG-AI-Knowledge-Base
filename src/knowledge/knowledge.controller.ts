import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { KnowledgeService } from './knowledge.service';
import { UploadResponseDto } from './dto/upload-response.dto';

@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly configService: ConfigService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPdf(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResponseDto> {
    // The uploaded file arrives via multipart/form-data as a Buffer, not a
    // plain object class-validator can inspect, so it is validated
    // explicitly here rather than through a DTO pipe.

    if (!file) {
      throw new BadRequestException(
        'No file was uploaded. Please attach a PDF using the "file" field.',
      );
    }

    if (file.size === 0) {
      throw new BadRequestException('The uploaded file is empty.');
    }

    const maxSize =
      this.configService.get<number>('upload.maxFileSizeBytes') ?? 10 * 1024 * 1024;

    if (file.size > maxSize) {
      throw new BadRequestException(
        `The uploaded file is too large. Maximum allowed size is ${(
          maxSize /
          (1024 * 1024)
        ).toFixed(0)}MB.`,
      );
    }

    const isPdfMimeType = file.mimetype === 'application/pdf';
    const isPdfExtension = file.originalname?.toLowerCase().endsWith('.pdf');

    if (!isPdfMimeType || !isPdfExtension) {
      throw new BadRequestException(
        'Unsupported file type. Only PDF files are accepted.',
      );
    }

    return this.knowledgeService.ingestPdf(file);
  }
}

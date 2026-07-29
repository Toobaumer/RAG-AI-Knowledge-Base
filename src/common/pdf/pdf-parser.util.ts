import { BadRequestException, Logger } from '@nestjs/common';
// pdf-parse doesn't ship great types; requiring it directly avoids
// running its bundled debug/test script that fires on `import` in some setups.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

const logger = new Logger('PdfParserUtil');

export interface ParsedPdf {
  /** Raw extracted text, exactly as pdf-parse returns it */
  rawText: string;
  /** Number of pages in the PDF */
  numPages: number;
}

/**
 * Parses a PDF file buffer into raw text + page count.
 *
 * Throws a BadRequestException (not a generic 500) when the buffer is not
 * a valid/parsable PDF, so the controller can return a clean 400 response
 * instead of crashing the request.
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedPdf> {
  try {
    const result = await pdfParse(buffer);

    if (!result.text || result.text.trim().length === 0) {
      throw new BadRequestException(
        'The PDF was parsed but contains no extractable text. It may be a scanned/image-only PDF.',
      );
    }

    return {
      rawText: result.text,
      numPages: result.numpages ?? 0,
    };
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    logger.error(`Failed to parse PDF: ${error.message}`, error.stack);
    throw new BadRequestException(
      'The uploaded file could not be parsed as a PDF. Please make sure it is a valid, non-corrupted PDF document.',
    );
  }
}

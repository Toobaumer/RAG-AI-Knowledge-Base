/**
 * Cleans raw PDF-extracted text so it is ready to be chunked and embedded:
 *  - normalizes Windows/Mac line breaks to \n
 *  - converts stray tab characters (a common PDF-extraction artifact) to
 *    single spaces
 *  - collapses duplicate spaces and blank lines
 *  - strips control/unwanted special characters that PDFs sometimes leak
 *
 * This runs BEFORE markdown conversion and chunking, since it is much
 * easier to reason about whitespace/noise on plain text than after
 * Markdown syntax or chunk boundaries are introduced.
 */
export function cleanExtractedText(rawText: string): string {
  let text = rawText;

  // 1. Normalize all line break styles to a single \n
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Remove non-printable / control characters (keep \n and \t)
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 3. Remove common PDF artifacts: form-feed page breaks
  text = text.replace(/\f/g, '\n');

  // 4. Convert every tab to a single space. Some PDF text extractors emit
  // a lone tab between individual words when reconstructing horizontal
  // spacing from character positions, so this must run before the
  // duplicate-whitespace collapse below.
  text = text.replace(/\t/g, ' ');

  // 5. Collapse duplicate spaces (but not newlines) into a single space
  text = text.replace(/ {2,}/g, ' ');

  // 6. Trim trailing whitespace on every line
  text = text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  // 7. Collapse 3+ consecutive blank lines down to a single blank line
  text = text.replace(/\n{3,}/g, '\n\n');

  // 8. Remove leading/trailing whitespace from the whole document
  text = text.trim();

  return text;
}

/**
 * Converts cleaned plain text (extracted from a PDF) into simple, readable
 * Markdown, using lightweight heuristics rather than trying to perfectly
 * reconstruct the original layout:
 *
 *  - Short, standalone, title-like lines (no ending punctuation, not too
 *    long) are promoted to Markdown headings ("## Heading"). These
 *    headings are what the chunking step later uses to keep related
 *    content together and to avoid splitting across topic boundaries.
 *  - Lines that look like bullet markers (-, *, bullet glyph, digits
 *    followed by ".") are normalized into proper Markdown list syntax.
 *  - Everything else is kept as normal paragraph text.
 */
export function convertTextToMarkdown(cleanedText: string): string {
  const lines = cleanedText.split('\n');
  const markdownLines: string[] = [];

  const bulletPattern = /^\s*([-*\u2022]|\d+[.)])\s+(.*)$/;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0) {
      markdownLines.push('');
      continue;
    }

    const bulletMatch = line.match(bulletPattern);
    if (bulletMatch) {
      markdownLines.push(`- ${bulletMatch[2]}`);
      continue;
    }

    if (looksLikeHeading(line)) {
      markdownLines.push(`## ${line}`);
      continue;
    }

    markdownLines.push(line);
  }

  return markdownLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeHeading(line: string): boolean {
  // A "Label: value" line  is a fact, not a heading, even though it's
  // short and doesn't end in sentence punctuation. Found as a real bug:
  // when a source PDF's bullet points lose their bullet glyph during
  // text extraction, lines like this were being misclassified as
  // headings, fragmenting a real section (e.g. "Program Overview") into
  // several disconnected one-line pseudo-sections instead of one
  // coherent, searchable chunk.
  const isLabelValueLine = /^[A-Za-z][A-Za-z\s]{0,30}:\s+\S/.test(line);
  if (isLabelValueLine) return false;

  const wordCount = line.split(/\s+/).length;
  const endsLikeSentence = /[.,;:]$/.test(line);
  const isAllCapsOrTitle = line === line.toUpperCase() || /^[A-Z0-9][^a-z]*$/.test(line);

  return wordCount <= 8 && !endsLikeSentence && (isAllCapsOrTitle || wordCount <= 5);
}


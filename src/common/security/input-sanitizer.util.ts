/**
 * Sanitizes user-supplied text (a chat question) before it is embedded or
 * sent to any model.
 *
 * This handles the "garbage input" class of problems: stray control
 * characters, null bytes, and excessive whitespace that can come from
 * copy-pasted text, malformed clients, or deliberately malformed input.
 * It does not attempt to detect or block "prompt injection" phrasing
 * (like "ignore previous instructions") - that is handled separately, by
 * the system prompt's explicit instruction to treat all retrieved context
 * as reference material rather than commands (see
 * GeminiGenerationService), since trying to pattern-match and strip
 * "instruction-like" phrases from legitimate user questions would cause
 * more false positives than it prevents.
 */
export function sanitizeUserInput(text: string): string {
  let sanitized = text;

  // Remove null bytes and non-printable control characters (keep \n).
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Collapse excessive whitespace.
  sanitized = sanitized.replace(/[ \t]{2,}/g, ' ');
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

  return sanitized.trim();
}

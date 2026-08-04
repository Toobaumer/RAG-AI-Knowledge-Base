/**
 * Turns a raw Gemini SDK error into an accurate, safe, user-facing
 * message. The @google/genai SDK throws errors whose `.message` embeds
 * the HTTP status and, for quota errors, the specific quota that was
 * exceeded - this distinguishes a genuine short-term rate limit from a
 * free-tier daily request cap, which behave very differently from a
 * user's perspective (retry in seconds vs. retry tomorrow, or enable
 * billing for a much higher limit).
 *
 * Found while debugging a real incident: every Gemini failure (invalid
 * key, exhausted quota, malformed request) was originally collapsed into
 * one generic "verify your GEMINI_API_KEY" message, which pointed at the
 * wrong cause for a 429 daily-quota error and cost real debugging time.
 */
export function describeGeminiError(error: any): string {
  const message = String(error?.message ?? '');
  const statusMatch = message.match(/status:\s*(\d+)/i);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : undefined;

  if (status === 429) {
    if (/PerDay/i.test(message)) {
      return 'The Gemini API free-tier daily request limit has been reached for this model. It resets at midnight Pacific Time, or you can enable billing on your Google Cloud project for a much higher limit.';
    }
    return 'The Gemini API rate limit was exceeded. Please wait about a minute before trying again.';
  }
  if (status === 401 || status === 403) {
    return 'The Gemini API key was rejected. Please verify GEMINI_API_KEY is correct and has access to this model.';
  }
  if (status === 400) {
    return 'Gemini rejected the request as malformed. This is usually a configuration issue, not something to retry.';
  }

  return 'Failed to reach the Gemini API. Please try again in a moment.';
}

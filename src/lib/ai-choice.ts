// src/lib/ai-choice.ts — hard-pin selection to gemini-2.5-flash
/**
 * Centralized model selection: hard-coded to Gemini 2.5 Flash for all cases,
 * including vision. Ignores cookies, headers, and environment overrides.
 */
export function getSelectedModelFromRequest(_reqOrHeaders?: unknown, _opts?: { forVision?: boolean }): string {
  return 'gemini-2.5-flash';
}

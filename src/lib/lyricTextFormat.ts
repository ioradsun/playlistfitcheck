/**
 * Text formatting utilities for lyric display in the video rendering pipeline
 * (canvas engine, exit effects, DOM text layer).
 *
 * These helpers produce the "clean" display form of lyric text:
 *   - leading and trailing punctuation stripped
 *   - internal apostrophes preserved (both straight ' and curly ')
 *   - internal alphanumerics preserved
 *
 * Do NOT use these for non-video contexts (comments, captions, moment lists,
 * source lyric displays). Those should render raw text.
 */

/**
 * Strip leading and trailing punctuation from a word, preserving internal
 * apostrophes. Keeps contractions ("don't", "we're") intact while removing
 * surrounding commas, periods, brackets, quotes, etc.
 *
 * Example:
 *   "fire,"      -> "fire"
 *   "(baby!)"    -> "baby"
 *   "don't"      -> "don't"
 *   "'cause"     -> "cause"   (leading apostrophe is leading punctuation)
 *   "—heart—"    -> "heart"
 */
export function stripDisplayPunctuation(text: string): string {
  return text
    .replace(/^[^a-zA-Z0-9'’]+/, '')
    .replace(/[^a-zA-Z0-9'’]+$/, '');
}

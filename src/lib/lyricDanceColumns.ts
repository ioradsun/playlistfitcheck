/* cache-bust: 2026-03-04-V4 */
/**
 * Canonical column list for `shareable_lyric_dances` queries.
 *
 * Import this in every file that reads from the table — never hardcode the
 * string. Missing columns cause silent visual regressions:
 *
 *   beat_grid     → BeatConductor → beat visualizer + timing budgets
 *   auto_palettes → hero word accent colors + section background tints
 *   palette       → base gradient fallback
 *   physics_spec  → motion profile (weighted/fluid/elastic/drift/glitch)
 *   system_type / seed → deterministic particle system selection
 */
export const LYRIC_DANCE_COLUMNS =
  "id,user_id,artist_slug,song_slug,artist_name,song_name,audio_url," +
  "lyrics,words,section_images,cinematic_direction," +
  "auto_palettes,beat_grid,palette,system_type,seed,artist_dna,physics_spec";

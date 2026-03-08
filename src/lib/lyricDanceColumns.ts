/**
 * Canonical column lists for `shareable_lyric_dances` queries.
 *
 * LYRIC_DANCE_COLUMNS includes authoring/runtime heavy fields needed to fully
 * instantiate a player.
 *
 * LYRIC_DANCE_FEED_COLUMNS is intentionally lightweight for feed-card previews.
 */

export const LYRIC_DANCE_COLUMNS =
  "id,user_id,artist_slug,song_slug,artist_name,song_name,audio_url,lyrics,words," +
  "cinematic_direction,section_images,scene_context,scene_manifest," +
  "auto_palettes,beat_grid,palette,system_type,seed,artist_dna,physics_spec";

export const LYRIC_DANCE_FEED_COLUMNS =
  "id,artist_slug,song_slug,artist_name,song_name,audio_url," +
  "auto_palettes,palette,section_images";

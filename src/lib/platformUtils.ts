/**
 * Platform detection & URL utilities for Spotify and SoundCloud
 */

export type MusicPlatform = "spotify" | "soundcloud" | "unknown";

/** Detect which platform a URL belongs to */
export function detectPlatform(url: string): MusicPlatform {
  if (!url) return "unknown";
  const lower = url.trim().toLowerCase();
  if (lower.includes("spotify.com") || lower.includes("spotify:")) return "spotify";
  if (lower.includes("soundcloud.com") || lower.includes("snd.sc")) return "soundcloud";
  return "unknown";
}

/** Check if a URL is a Spotify URL */
export function isSpotifyUrl(url: string): boolean {
  return detectPlatform(url) === "spotify";
}

/** Check if a URL is a SoundCloud URL */
export function isSoundCloudUrl(url: string): boolean {
  return detectPlatform(url) === "soundcloud";
}

/** Check if a URL is a recognized music platform URL */
export function isMusicUrl(url: string): boolean {
  return detectPlatform(url) !== "unknown";
}

/** Extract Spotify resource type and ID from a URL */
export function parseSpotifyUrl(url: string): { type: string; id: string } | null {
  const match = url.match(/spotify\.com\/(track|playlist|artist|album|episode)\/([a-zA-Z0-9]+)/);
  if (match) return { type: match[1], id: match[2] };
  // Handle spotify: URIs
  const uriMatch = url.match(/spotify:(track|playlist|artist|album|episode):([a-zA-Z0-9]+)/);
  if (uriMatch) return { type: uriMatch[1], id: uriMatch[2] };
  return null;
}

/** Parse a SoundCloud URL to get the path (user/track or user/sets/playlist) */
export function parseSoundCloudUrl(url: string): { path: string; isPlaylist: boolean; isUser: boolean } | null {
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    if (!u.hostname.includes("soundcloud.com") && !u.hostname.includes("snd.sc")) return null;
    const path = u.pathname.replace(/^\//, "").replace(/\/$/, "");
    if (!path) return null;
    const parts = path.split("/");
    const isPlaylist = parts.includes("sets");
    const isUser = parts.length === 1;
    return { path, isPlaylist, isUser };
  } catch {
    return null;
  }
}

/** Convert a Spotify URL to its embed form */
export function toSpotifyEmbedUrl(url: string): string {
  return url.replace("open.spotify.com/", "open.spotify.com/embed/");
}

/** Build a SoundCloud embed URL using the widget API */
export function toSoundCloudEmbedUrl(url: string): string {
  const cleanUrl = url.split("?")[0].trim();
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(cleanUrl)}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true`;
}

/** Convert any supported music URL to its embed form */
export function toEmbedUrl(url: string): string | null {
  const platform = detectPlatform(url);
  if (platform === "spotify") return toSpotifyEmbedUrl(url);
  if (platform === "soundcloud") return toSoundCloudEmbedUrl(url);
  return null;
}

/** Get a user-friendly platform label */
export function getPlatformLabel(url: string): string {
  const platform = detectPlatform(url);
  if (platform === "spotify") return "Spotify";
  if (platform === "soundcloud") return "SoundCloud";
  return "Music";
}

/** Get platform icon color (hex) */
export function getPlatformColor(platform: MusicPlatform): string {
  if (platform === "spotify") return "#1DB954";
  if (platform === "soundcloud") return "#FF5500";
  return "#888888";
}

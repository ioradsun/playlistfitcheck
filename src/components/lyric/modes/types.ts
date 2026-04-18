import type { ComponentType, Dispatch, SetStateAction, RefObject, ReactNode } from "react";
import type { Moment } from "@/lib/buildMoments";
import type { LyricDancePlayer, LyricDanceData } from "@/engine/LyricDancePlayer";

/**
 * CardMode is derived from the registry (see registry.ts).
 * Don't declare it here directly — add modes by editing registry.ts.
 */
export type CardMode = "listen" | "moments" | "results" | "empowerment";

export interface Comment {
  id: string;
  text: string;
  line_index: number | null;
  submitted_at: string;
  user_id: string | null;
}

/**
 * Everything a mode might need to render or dispatch actions.
 *
 * Design note: this is intentionally a single bundled shape rather than
 * per-mode prop interfaces. Trade-off:
 *   - Pro: Adding a new prop to any mode is a one-file edit. No re-plumbing
 *     through LyricDanceEmbed's dispatch site.
 *   - Con: Modes can read fields they don't strictly need.
 * Mitigation: each mode destructures only what it uses; code review enforces.
 *
 * The context is built once per render in LyricDanceEmbed and passed to
 * ModeDispatcher. Modes receive it via { ctx } prop.
 */
export interface ModeContext {
  // — Core state —
  cardMode: CardMode;
  live: boolean;
  playerReady: boolean;
  player: LyricDancePlayer | null;
  data: LyricDanceData | null;

  // — IDs / URLs —
  danceId: string | null;
  postId: string | null;
  lyricDanceUrl: string | null;
  spotifyTrackId: string | null;
  userId: string | null;

  // — Canvas refs (owned by LyricDanceEmbed, attached by ListenMode) —
  canvasRef: RefObject<HTMLCanvasElement | null>;
  textCanvasRef: RefObject<HTMLCanvasElement | null>;

  // — Derived data —
  moments: Moment[];
  fireHeat: Record<string, { line: Record<number, number>; total: number }>;
  fireUserMap: Record<number, string[]>;
  fireAnonCount: Record<number, number>;
  profileMap: Record<string, { avatarUrl: string | null; displayName: string | null }>;
  comments: Comment[];
  currentTimeSec: number;
  effectiveMuted: boolean;
  showMuteIndicator: boolean;

  // — State setters —
  setCardMode: (mode: CardMode) => void;
  setComments: Dispatch<SetStateAction<Comment[]>>;

  // — Action callbacks (closed over state + setters in LyricDanceEmbed) —
  handleCanvasTap: () => void;
  seekOnly: (t: number) => void;
  onFireMoment: (lineIndex: number, timeSec: number, holdMs: number) => void;
  onPlayLine: (startSec: number, endSec: number) => void;
  onCommentAdded: (comment: Comment) => void;
}

/**
 * A mode registry entry. Adding a mode = adding one of these to CARD_MODES.
 */
export interface ModeConfig {
  /** Unique mode identifier. */
  id: CardMode;
  /** Human-readable label (for screen readers, future tooltips). */
  label: string;
  /** Icon rendered in PlayerHeader mode-switcher. */
  icon: ReactNode;
  /** Component rendering the mode. Receives ctx as single prop. */
  component: ComponentType<{ ctx: ModeContext }>;
  /**
   * Whether the mode should be selectable in the PlayerHeader switcher
   * based on current context. Disabled modes render dimmed and can't be tapped.
   * Return false = enabled.
   */
  disabled: (ctx: ModeContext) => boolean;
}

import { CARD_MODES } from "./registry";
import type { ModeContext } from "./types";

/**
 * Renders the currently-active mode based on ctx.cardMode.
 *
 * Returns null when:
 *   - ctx.live is false (non-primary cards don't render any mode)
 *   - No registry entry matches ctx.cardMode (defensive; shouldn't happen
 *     because CardMode type is constrained to registry ids)
 *
 * No wrapper element. Each mode is responsible for its own visual frame
 * (ModePanel for overlays, fragment for ListenMode).
 */
export function ModeDispatcher({ ctx }: { ctx: ModeContext }) {
  if (!ctx.live) return null;

  const config = CARD_MODES.find((m) => m.id === ctx.cardMode);
  if (!config) return null;

  const ModeComponent = config.component;
  return <ModeComponent ctx={ctx} />;
}

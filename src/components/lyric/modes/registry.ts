import { createElement } from "react";
import { Waves, LayoutList, BarChart2, Sparkles } from "lucide-react";
import { ListenMode } from "./ListenMode";
import { MomentsMode } from "./MomentsMode";
import { ResultsMode } from "./ResultsMode";
import { EmpowermentMode } from "./EmpowermentMode";
import type { ModeConfig } from "./types";

function hasEmpowermentPromise(data: unknown): boolean {
  return Boolean(
    data &&
    typeof data === "object" &&
    "empowerment_promise" in data &&
    (data as { empowerment_promise?: unknown }).empowerment_promise,
  );
}

/**
 * Single source of truth for cardMode rendering.
 *
 * Adding a mode:
 *   1. Create `<ModeName>Mode.tsx` in this directory.
 *   2. Add its `id` as a literal in CardMode type (in ./types.ts).
 *   3. Add a ModeConfig entry below.
 *   Nothing else needs to change. LyricDanceEmbed, PlayerHeader, ModeDispatcher
 *   all read from this array.
 *
 * Ordering: the order here determines the order in PlayerHeader's mode switcher.
 */
export const CARD_MODES: readonly ModeConfig[] = [
  {
    id: "listen",
    label: "Listen",
    icon: createElement(Waves, { size: 14 }),
    component: ListenMode,
    disabled: () => false,
  },
  {
    id: "moments",
    label: "Moments",
    icon: createElement(LayoutList, { size: 14 }),
    component: MomentsMode,
    disabled: (ctx) => ctx.moments.length === 0,
  },
  {
    id: "results",
    label: "Results",
    icon: createElement(BarChart2, { size: 14 }),
    component: ResultsMode,
    disabled: (ctx) => ctx.moments.length === 0,
  },
  {
    id: "empowerment",
    label: "Empowerment",
    icon: createElement(Sparkles, { size: 14 }),
    component: EmpowermentMode,
    disabled: (ctx) => !hasEmpowermentPromise(ctx.data),
  },
];

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const EMOJI_SYMBOLS: Record<string, string> = {
  fire: "🔥",
  dead: "💀",
  mind_blown: "🤯",
  emotional: "😭",
  respect: "🙏",
  accurate: "🎯",
};

export interface TopReaction {
  symbol: string;
  count: number;
}

export function useTopPostReaction(_postId: string, _enabled = true): TopReaction | null {
  // Table songfit_post_reactions does not exist yet — return null to avoid 404 spam.
  return null;
}

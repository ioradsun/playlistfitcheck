/**
 * useGlobalAudio — Feed-level singleton that ensures only one audio
 * source plays at a time across all HookFit battle cards.
 *
 * The feed holds the state; each card reads whether it owns audio.
 */

import { createContext, useContext } from "react";

export interface GlobalAudioState {
  /** Currently playing: "battleId:side" or null */
  activeKey: string | null;
  /** Request audio ownership. Pass null to release. */
  claim: (key: string | null) => void;
}

export const GlobalAudioContext = createContext<GlobalAudioState>({
  activeKey: null,
  claim: () => {},
});

export function useGlobalAudio() {
  return useContext(GlobalAudioContext);
}

/** Build the key each card uses */
export function audioKey(battleId: string, side: "a" | "b") {
  return `${battleId}:${side}`;
}

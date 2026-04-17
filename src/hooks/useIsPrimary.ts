import { useSyncExternalStore } from "react";
import { audioController } from "@/lib/audioController";

/**
 * Per-card subscription to the AudioController. Returns true only when this
 * specific postId is the effective primary. Because the snapshot is a boolean
 * compared by Object.is, React's useSyncExternalStore bails out automatically
 * on cards whose value didn't change during a primary handoff — so one card
 * handing off to another causes exactly two re-renders (old + new), not N.
 */
export function useIsPrimary(postId: string | null | undefined): boolean {
  const getSnapshot = () =>
    !!postId && audioController.getSnapshot().effectivePrimaryId === postId;
  return useSyncExternalStore(audioController.subscribe, getSnapshot, getSnapshot);
}

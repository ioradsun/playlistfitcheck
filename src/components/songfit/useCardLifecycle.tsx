/* cache-bust: 2026-03-08-v1 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export type CardState = "cold" | "warm" | "active";

type LifecycleStore = {
  cardStates: Record<string, CardState>;
  activeCardId: string | null;
};

type CardLifecycleContextValue = {
  getCardState: (postId: string) => CardState;
  setCardState: (postId: string, state: CardState) => void;
  activeCardId: string | null;
};

export const CardLifecycleContext = createContext<CardLifecycleContextValue | null>(null);

export function CardLifecycleProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<LifecycleStore>({ cardStates: {}, activeCardId: null });

  const previousActiveRef = useRef<string | null>(null);

  useEffect(() => {
    const previousActiveCardId = previousActiveRef.current;
    if (previousActiveCardId && previousActiveCardId !== store.activeCardId) {
      window.dispatchEvent(new CustomEvent("crowdfit:media-deactivate", { detail: { cardId: previousActiveCardId } }));
    }
    previousActiveRef.current = store.activeCardId;
  }, [store.activeCardId]);

  const getCardState = useCallback(
    (postId: string): CardState => store.cardStates[postId] ?? "cold",
    [store.cardStates],
  );

  const setCardState = useCallback((postId: string, state: CardState) => {
    setStore((prev) => {
      const nextStates = { ...prev.cardStates };
      let nextActive = prev.activeCardId;

      if (state === "active") {
        if (prev.activeCardId && prev.activeCardId !== postId) {
          nextStates[prev.activeCardId] = "warm";
        }
        nextStates[postId] = "active";
        nextActive = postId;
      } else if (state === "warm") {
        nextStates[postId] = "warm";
        if (prev.activeCardId === postId) {
          nextActive = null;
        }
      } else {
        // Explicit cold transition.
        delete nextStates[postId];
        if (prev.activeCardId === postId) {
          nextActive = null;
        }
      }

      return {
        cardStates: nextStates,
        activeCardId: nextActive,
      };
    });
  }, []);

  const value = useMemo(
    () => ({ getCardState, setCardState, activeCardId: store.activeCardId }),
    [getCardState, setCardState, store.activeCardId],
  );

  return <CardLifecycleContext.Provider value={value}>{children}</CardLifecycleContext.Provider>;
}

export function useCardState(postId: string): { state: CardState; activate: () => void; deactivate: () => void } {
  const context = useContext(CardLifecycleContext);

  if (!context) {
    throw new Error("useCardState must be used within CardLifecycleProvider");
  }

  const state = context.getCardState(postId);

  const activate = useCallback(() => context.setCardState(postId, "active"), [context, postId]);
  const deactivate = useCallback(() => context.setCardState(postId, "warm"), [context, postId]);

  return { state, activate, deactivate };
}

/* cache-bust: 2026-03-08-v1 */
import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

export type CardState = "cold" | "warm" | "active";

type Listener = () => void;

class CardLifecycleStore {
  private states = new Map<string, CardState>();
  private listeners = new Map<string, Set<Listener>>();
  activeCardId: string | null = null;
  private globalListeners = new Set<Listener>();

  getState(postId: string): CardState {
    return this.states.get(postId) ?? "cold";
  }

  setState(postId: string, state: CardState) {
    const prev = this.states.get(postId) ?? "cold";
    if (prev === state) return;

    let activeChanged = false;

    if (state === "active") {
      if (this.activeCardId && this.activeCardId !== postId) {
        this.states.set(this.activeCardId, "warm");
        this.notify(this.activeCardId);
        window.dispatchEvent(
          new CustomEvent("crowdfit:media-deactivate", {
            detail: { cardId: this.activeCardId },
          }),
        );
      }
      this.states.set(postId, "active");
      this.activeCardId = postId;
      activeChanged = true;
      window.dispatchEvent(
        new CustomEvent("crowdfit:audio-solo", {
          detail: { activeCardId: postId },
        }),
      );
    } else if (state === "warm") {
      this.states.set(postId, "warm");
      if (this.activeCardId === postId) {
        this.activeCardId = null;
        activeChanged = true;
      }
    } else {
      this.states.delete(postId);
      if (this.activeCardId === postId) {
        this.activeCardId = null;
        activeChanged = true;
      }
    }

    this.notify(postId);
    if (activeChanged) this.notifyGlobal();
  }

  subscribe(postId: string, listener: Listener): () => void {
    if (!this.listeners.has(postId)) this.listeners.set(postId, new Set());
    this.listeners.get(postId)?.add(listener);
    return () => this.listeners.get(postId)?.delete(listener);
  }

  subscribeGlobal(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  private notify(postId: string) {
    this.listeners.get(postId)?.forEach((l) => l());
  }

  private notifyGlobal() {
    this.globalListeners.forEach((l) => l());
  }
}

export const CardLifecycleContext = createContext<CardLifecycleStore | null>(null);

export function CardLifecycleProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<CardLifecycleStore | null>(null);
  if (!storeRef.current) storeRef.current = new CardLifecycleStore();
  return (
    <CardLifecycleContext.Provider value={storeRef.current}>
      {children}
    </CardLifecycleContext.Provider>
  );
}

export function useCardState(postId: string) {
  const store = useContext(CardLifecycleContext);

  const state = useSyncExternalStore(
    useCallback(
      (cb: Listener) => (store ? store.subscribe(postId, cb) : () => {}),
      [store, postId],
    ),
    useCallback(() => store?.getState(postId) ?? "cold", [store, postId]),
    () => "cold" as CardState,
  );

  const activate = useCallback(() => store?.setState(postId, "active"), [store, postId]);
  const deactivate = useCallback(() => store?.setState(postId, "warm"), [store, postId]);

  return { state, activate, deactivate };
}

export function useCardLifecycleStore() {
  return useContext(CardLifecycleContext);
}

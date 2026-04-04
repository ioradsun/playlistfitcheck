import { isGlobalMuted, setGlobalMuted } from "./globalMute";
import { isAudioUnlocked } from "./reelsAudioUnlock";
import type { LyricDancePlayer } from "@/engine/LyricDancePlayer";

export type AudioSnapshot = {
  effectivePrimaryId: string | null;
  muted: boolean;
};

type Listener = () => void;

class AudioController {
  private _registry = new Map<string, LyricDancePlayer>();
  private _autoPrimaryId: string | null = null;
  private _explicitPrimaryId: string | null = null;
  private _effectivePrimaryId: string | null = null;
  private _listeners = new Set<Listener>();
  private _snapshot: AudioSnapshot = { effectivePrimaryId: null, muted: true };

  register(postId: string, player: LyricDancePlayer): void {
    this._registry.set(postId, player);
    this._reconcile();
  }

  unregister(postId: string): void {
    // Stop audio BEFORE removing from registry
    if (this._effectivePrimaryId === postId) {
      const player = this._registry.get(postId);
      if (player) {
        if (!player.audio.paused) player.audio.pause();
        player.setMuted(true);
      }
      this._effectivePrimaryId = null;
    }
    this._registry.delete(postId);
    if (this._explicitPrimaryId === postId) this._explicitPrimaryId = null;
    if (this._autoPrimaryId === postId) this._autoPrimaryId = null;
    this._reconcile();
  }

  setAutoPrimary(postId: string | null): void {
    if (this._autoPrimaryId === postId) return;
    this._autoPrimaryId = postId;
    this._reconcile();
  }

  setExplicitPrimary(postId: string | null): void {
    this._explicitPrimaryId = postId;
    this._reconcile();
  }

  clearExplicitIf(postId: string): void {
    if (this._explicitPrimaryId === postId) {
      this._explicitPrimaryId = null;
      this._reconcile();
    }
  }

  toggleMute(): void {
    const next = !isGlobalMuted();
    setGlobalMuted(next);
    if (!next && this._effectivePrimaryId) {
      const p = this._registry.get(this._effectivePrimaryId);
      if (p && p.audio.paused) p.play(true);
    }
    this._reconcile();
  }

  subscribe = (listener: Listener): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  getSnapshot = (): AudioSnapshot => this._snapshot;

  private _reconcile(): void {
    const nextId = this._resolveEffective();
    if (nextId !== this._effectivePrimaryId) {
      if (this._effectivePrimaryId) {
        const old = this._registry.get(this._effectivePrimaryId);
        if (old) {
          if (!old.audio.paused) old.audio.pause();
          old.setMuted(true);
          old.play(false);
        }
      }
      this._effectivePrimaryId = nextId;
      if (nextId) {
        const p = this._registry.get(nextId);
        if (p) {
          p.play(true);
          p.setMuted(!isAudioUnlocked() || isGlobalMuted());
        }
      }
    } else if (nextId) {
      const p = this._registry.get(nextId);
      if (p) p.setMuted(!isAudioUnlocked() || isGlobalMuted());
    }
    this._emit();
  }

  private _resolveEffective(): string | null {
    const candidate = this._explicitPrimaryId ?? this._autoPrimaryId;
    return candidate && this._registry.has(candidate) ? candidate : null;
  }

  private _emit(): void {
    const next: AudioSnapshot = {
      effectivePrimaryId: this._effectivePrimaryId,
      muted: isGlobalMuted(),
    };
    if (next.effectivePrimaryId !== this._snapshot.effectivePrimaryId || next.muted !== this._snapshot.muted) {
      this._snapshot = next;
      this._listeners.forEach((l) => l());
    }
  }
}

export const audioController = new AudioController();

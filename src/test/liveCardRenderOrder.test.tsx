import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: async () => ({ data: [] }),
        maybeSingle: async () => ({ data: null }),
        then: (resolve: any) => resolve({ data: [] }),
      };
      return chain;
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

vi.mock("@/hooks/useLyricSections", () => ({ useLyricSections: () => ({ sections: [], allLines: [], isReady: true }) }));
vi.mock("@/components/lyric/LyricInteractionLayer", () => ({ LyricInteractionLayer: () => null }));
vi.mock("@/components/lyric/PlayerHeader", () => ({
  PlayerHeader: ({ onModeChange }: any) => (
    <div>
      <button onClick={() => onModeChange?.("moments")}>moments</button>
      <button onClick={() => onModeChange?.("listen")}>listen</button>
    </div>
  ),
}));
vi.mock("@/components/lyric/modes/ModeDispatcher", () => ({
  ModeDispatcher: () => <div data-testid="mode-dispatcher" />,
}));
vi.mock("@/components/lyric/modes/registry", () => ({ CARD_MODES: [] }));
vi.mock("@/components/lyric/ViralClipModal", () => ({ ViralClipModal: () => null }));
vi.mock("@/lib/fire", () => ({ emitFire: vi.fn(), fetchFireData: vi.fn(async () => ({})), upsertPlay: vi.fn() }));
vi.mock("@/lib/reelsAudioUnlock", () => ({ unlockAudio: vi.fn() }));
vi.mock("@/lib/sharedAudio", () => ({ getSharedAudio: () => document.createElement("audio") }));

vi.mock("@/engine/LyricDancePlayer", () => ({
  LyricDancePlayer: class MockPlayer {
    audio = document.createElement("audio");
    playing = false;
    constructor() {
      return new Proxy(this, {
        get(target, prop, receiver) {
          if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
          return () => {};
        },
      });
    }
    async init() {}
    destroy() {}
    onFirstFrame() { return () => {}; }
    getCurrentTime() { return 0; }
    getBootMetrics() { return { ttffMs: 10, startLatencyMs: 10, fullModeMs: 10 }; }
  },
}));

import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";

const prefetchedData: any = {
  id: "dance-1",
  audio_url: "https://example.com/a.mp3",
  lines: [{ start: 0, end: 10, text: "hello world" }],
  words: [],
  cinematic_direction: { phrases: [{ start: 0, end: 10, text: "hello world" }] },
};

describe("live card render order", () => {
  beforeEach(() => {
    (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
  });

  it("keeps canvases mounted and contains no img layer in live mode", () => {
    const { container, rerender } = render(
      <LyricDanceEmbed lyricDanceId="dance-1" songTitle="Song" prefetchedData={prefetchedData} live />,
    );

    const firstCanvas = container.querySelector("canvas");
    expect(firstCanvas).toBeTruthy();
    expect(container.querySelectorAll("canvas")).toHaveLength(2);
    expect(container.querySelectorAll("img")).toHaveLength(0);

    const containerEl = container.querySelector(".relative.flex-1.min-h-0.overflow-hidden") as HTMLElement;
    expect(containerEl?.firstElementChild?.tagName.toLowerCase()).toBe("canvas");

    fireEvent.click(container.querySelector("button") as HTMLButtonElement);
    fireEvent.click(container.querySelectorAll("button")[1] as HTMLButtonElement);

    rerender(<LyricDanceEmbed lyricDanceId="dance-1" songTitle="Song" prefetchedData={prefetchedData} live />);

    const canvasAfter = container.querySelector("canvas");
    expect(canvasAfter).toBe(firstCanvas);
    expect(firstCanvas?.isConnected).toBe(true);
  });
});

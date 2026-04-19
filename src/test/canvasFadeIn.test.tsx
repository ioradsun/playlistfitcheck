import { render, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  firstFrameListeners: [] as Array<() => void>,
  initCalls: 0,
}));

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

vi.mock("@/hooks/useLyricSections", () => ({ useLyricSections: () => ({ sections: [], allLines: [] }) }));
vi.mock("@/components/lyric/LyricInteractionLayer", () => ({ LyricInteractionLayer: () => null }));
vi.mock("@/components/lyric/PlayerHeader", () => ({ PlayerHeader: () => null }));
vi.mock("@/components/lyric/modes/ModeDispatcher", () => ({
  ModeDispatcher: ({ ctx }: any) => (
    <>
      <canvas ref={ctx.canvasRef} />
      <canvas ref={ctx.textCanvasRef} />
    </>
  ),
}));
vi.mock("@/components/lyric/modes/registry", () => ({ CARD_MODES: [] }));
vi.mock("@/components/lyric/ViralClipModal", () => ({ ViralClipModal: () => null }));
vi.mock("@/lib/fire", () => ({ emitFire: vi.fn(), fetchFireData: vi.fn(async () => ({})), upsertPlay: vi.fn() }));
vi.mock("@/lib/reelsAudioUnlock", () => ({ unlockAudio: vi.fn() }));
vi.mock("@/lib/sharedAudio", () => ({ getSharedAudio: () => document.createElement("audio") }));
vi.mock("@/lib/imagePreloadCache", () => ({ getPreloadedImage: () => null }));

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
    async init() { h.initCalls += 1; }
    destroy() {}
    onFirstFrame(cb: () => void) {
      h.firstFrameListeners.push(cb);
      return () => {
        h.firstFrameListeners = h.firstFrameListeners.filter((fn) => fn !== cb);
      };
    }
    getBootMetrics() { return { ttffMs: 10, startLatencyMs: 10, fullModeMs: 10 }; }
    getCurrentTime() { return 0; }
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

describe("canvas fade in", () => {
  beforeEach(() => {
    (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
    h.firstFrameListeners = [];
    h.initCalls = 0;
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      return window.setTimeout(() => cb(performance.now()), 0);
    });
  });

  it("keeps canvas hidden until first frame then fades to opacity 1", async () => {
    const { container, rerender } = render(
      <LyricDanceEmbed lyricDanceId="dance-1" songTitle="Song" prefetchedData={prefetchedData} live />,
    );

    const canvasLayer = container.querySelector('div[style*="z-index: 1"][style*="opacity: 0"]') as HTMLDivElement;
    expect(canvasLayer).toBeTruthy();
    expect(canvasLayer.style.opacity).toBe("0");

    expect(h.firstFrameListeners).toHaveLength(1);
    act(() => {
      h.firstFrameListeners[0]();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(canvasLayer.style.opacity).toBe("1");

    rerender(<LyricDanceEmbed lyricDanceId="dance-1" songTitle="Song" prefetchedData={prefetchedData} live={false} />);
    expect(canvasLayer.style.opacity).toBe("0");
  });
});

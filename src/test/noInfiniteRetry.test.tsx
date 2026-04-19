import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ initCalls: 0 }));

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
vi.mock("@/hooks/useResolvedTypography", () => ({ useResolvedTypography: () => null }));
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
vi.mock("@/components/lyric/LyricTextLayer", () => ({ LyricTextLayer: () => <div>text</div> }));
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
    async init() { h.initCalls += 1; throw new Error("compile failed"); }
    destroy() {}
    onFirstFrame() { return () => {}; }
    getCurrentTime() { return 0; }
  },
}));

import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";

const prefetchedData: any = {
  id: "dance-2",
  audio_url: "https://example.com/a.mp3",
  lines: [{ start: 0, end: 10, text: "hello world" }],
  words: [],
  cinematic_direction: { phrases: [{ start: 0, end: 10, text: "hello world" }] },
};

describe("retry behavior", () => {
  beforeEach(() => {
    (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
    h.initCalls = 0;
  });

  it("attempts init only twice when init keeps failing", async () => {
    render(<LyricDanceEmbed lyricDanceId="dance-2" songTitle="Song" prefetchedData={prefetchedData} live />);

    await waitFor(() => {
      expect(h.initCalls).toBe(2);
    });
  });
});

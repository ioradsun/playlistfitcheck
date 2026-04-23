import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  getPreloadedImage: vi.fn(),
}));

vi.mock("@/lib/imagePreloadCache", async () => {
  const actual = await vi.importActual<any>("@/lib/imagePreloadCache");
  return {
    ...actual,
    getPreloadedImage: h.getPreloadedImage,
  };
});

import { LyricDancePlayer } from "@/engine/LyricDancePlayer";

describe("LyricDancePlayer.paintIdentityFrame", () => {
  beforeEach(() => {
    h.getPreloadedImage.mockReset();
  });

  it("constructor calls paintIdentityFrame synchronously and paints to 2d context", () => {
    const fillRect = vi.fn();
    const drawImage = vi.fn();
    const createLinearGradient = vi.fn(() => ({ addColorStop: vi.fn() }));

    const ctx = {
      setTransform: vi.fn(),
      createLinearGradient,
      fillStyle: "",
      fillRect,
      drawImage,
      clearRect: vi.fn(),
      save: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      restore: vi.fn(),
    } as any;

    const bgCanvas = document.createElement("canvas");
    vi.spyOn(bgCanvas, "getContext").mockReturnValue(ctx);

    const container = document.createElement("div");
    Object.defineProperty(container, "offsetWidth", { value: 320, configurable: true });
    Object.defineProperty(container, "offsetHeight", { value: 568, configurable: true });

    const cachedImage = {
      complete: true,
      naturalWidth: 1000,
      naturalHeight: 1000,
    } as any;
    h.getPreloadedImage.mockReturnValue(cachedImage);

    const paintSpy = vi.spyOn(LyricDancePlayer.prototype, "paintIdentityFrame");

    const player = new LyricDancePlayer({
      id: "dance-id",
      audio_url: "https://example.com/audio.mp3",
      palette: ["#111111", "#222222"],
      section_images: ["https://example.com/section.png"],
      lyrics: [{ text: "line", start: 0, end: 1 }],
      lines: [{ text: "line", start: 0, end: 1 }],
      words: [],
      beat_grid: { bpm: 120, beats: [0, 0.5], confidence: 1 },
      cinematic_direction: { sections: [] },
    } as any, bgCanvas, container, { externalAudio: document.createElement("audio") });

    expect(paintSpy).toHaveBeenCalledTimes(1);
    expect(createLinearGradient).toHaveBeenCalled();
    expect(fillRect).toHaveBeenCalled();
    expect(ctx.scale).toHaveBeenCalledWith(1.08, 1.08);
    expect(drawImage).toHaveBeenCalled();

    player.destroy();
    paintSpy.mockRestore();
  });
});

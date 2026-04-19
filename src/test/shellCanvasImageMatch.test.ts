import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readRepoFile(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

describe("shell/canvas image match invariants", () => {
  it("FeedCard prioritizes section_images[0] over album_art_url for previewImageUrl", () => {
    const source = readRepoFile("src/components/fmly/feed/FeedCard.tsx");
    expect(source).toMatch(/previewImageUrl:\s*lp\?\.section_images\?\.\[0\]\s*\?\?\s*lp\?\.album_art_url\s*\?\?\s*null/);
  });

  it("LyricDanceShell uses live CDN preset for poster source", () => {
    const source = readRepoFile("src/components/lyric/LyricDanceShell.tsx");
    expect(source).toMatch(/const\s+posterSrc\s*=\s*posterUrl\s*\?\s*cdnImage\(posterUrl,\s*"live"\)\s*:\s*TRANSPARENT_PIXEL/);
  });

  it("LyricDanceShell applies initial engine-equivalent zoom transform", () => {
    const source = readRepoFile("src/components/lyric/LyricDanceShell.tsx");
    expect(source).toMatch(/transform:\s*"scale\(1\.296\)"/);
  });
});

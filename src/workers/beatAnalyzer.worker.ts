interface LyricLine {
  start: number;
  end: number;
}

interface LineBeatMap {
  lineIndex: number;
  beats: number[];
  strongBeats: number[];
  beatCount: number;
  beatsPerSecond: number;
  firstBeat: number;
  lastBeat: number;
}

function buildLineBeatMap(lines: LyricLine[], beats: number[]): LineBeatMap[] {
  return lines.map((line, i) => {
    const lineBeats = beats.filter((beat) => beat >= line.start && beat <= line.end);
    return {
      lineIndex: i,
      beats: lineBeats,
      strongBeats: lineBeats.filter((_, beatIdx) => beatIdx % 2 === 0),
      beatCount: lineBeats.length,
      beatsPerSecond: lineBeats.length / Math.max(0.001, line.end - line.start),
      firstBeat: lineBeats[0] ?? line.start,
      lastBeat: lineBeats[lineBeats.length - 1] ?? line.end,
    };
  });
}

self.onmessage = (e: MessageEvent<{ lines: LyricLine[]; beats: number[] }>) => {
  const { lines, beats } = e.data;
  const lineBeatMap = buildLineBeatMap(lines ?? [], beats ?? []);
  self.postMessage({ lineBeatMap });
};

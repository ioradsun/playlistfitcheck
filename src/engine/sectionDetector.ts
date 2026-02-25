import type { SongSignature } from "@/lib/songSignatureAnalyzer";

export interface TimestampedLine {
  text: string;
  startSec: number;
  endSec: number;
  lineIndex: number;
}

export type SectionRole =
  | "intro"
  | "verse"
  | "prechorus"
  | "chorus"
  | "bridge"
  | "drop"
  | "breakdown"
  | "outro";

export interface AudioSection {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  avgEnergy: number;
  peakEnergy: number;
  energyDelta: number;
  spectralCharacter: "warm" | "bright" | "full" | "thin";
  beatDensity: number;
  role: SectionRole;
  lyrics: TimestampedLine[];
  hasLyricRepetition: boolean;
}

const ENERGY_WINDOW_SEC = 0.5;
const ENERGY_BOUNDARY_THRESHOLD = 0.2;
const BEAT_DENSITY_WINDOW_SEC = 4;
const BEAT_DENSITY_STEP_SEC = 1;
const BEAT_DENSITY_DELTA_THRESHOLD = 0.3;
const LYRIC_GAP_THRESHOLD_SEC = 3;
const SNAP_WINDOW_SEC = 2;
const MIN_SECTION_LENGTH_SEC = 3;
const MAX_SECTIONS = 8;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function normalizeBoundaries(candidates: number[], durationSec: number): number[] {
  const sorted = [...candidates, 0, durationSec]
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.max(0, Math.min(durationSec, n)))
    .sort((a, b) => a - b);

  const snapped: number[] = [];
  for (const boundary of sorted) {
    const prev = snapped[snapped.length - 1];
    if (prev == null || Math.abs(boundary - prev) > SNAP_WINDOW_SEC) {
      snapped.push(boundary);
      continue;
    }
    snapped[snapped.length - 1] = (prev + boundary) / 2;
  }

  if (snapped[0] !== 0) snapped.unshift(0);
  if (snapped[snapped.length - 1] !== durationSec) snapped.push(durationSec);

  const filtered: number[] = [snapped[0]];
  for (let i = 1; i < snapped.length - 1; i += 1) {
    if (snapped[i] - filtered[filtered.length - 1] >= MIN_SECTION_LENGTH_SEC) {
      filtered.push(snapped[i]);
    }
  }
  filtered.push(durationSec);
  return filtered;
}

function detectEnergyBoundaries(energyCurve: Float32Array, durationSec: number): number[] {
  if (!energyCurve.length) return [];
  const boundaries: number[] = [];
  for (let i = 1; i < energyCurve.length; i += 1) {
    const delta = Math.abs(energyCurve[i] - energyCurve[i - 1]);
    if (delta >= ENERGY_BOUNDARY_THRESHOLD) {
      boundaries.push(Math.min(durationSec, i * ENERGY_WINDOW_SEC));
    }
  }
  return boundaries;
}

function beatDensity(beats: number[], startSec: number, endSec: number): number {
  if (endSec <= startSec) return 0;
  let count = 0;
  for (const beat of beats) {
    if (beat >= startSec && beat < endSec) count += 1;
  }
  return count / (endSec - startSec);
}

function detectBeatDensityBoundaries(beats: number[], durationSec: number): number[] {
  const boundaries: number[] = [];
  let prevDensity: number | null = null;
  for (let start = 0; start + BEAT_DENSITY_WINDOW_SEC <= durationSec; start += BEAT_DENSITY_STEP_SEC) {
    const end = start + BEAT_DENSITY_WINDOW_SEC;
    const density = beatDensity(beats, start, end);
    if (prevDensity != null && prevDensity > 0) {
      const deltaRatio = Math.abs(density - prevDensity) / prevDensity;
      if (deltaRatio >= BEAT_DENSITY_DELTA_THRESHOLD) {
        boundaries.push(start);
      }
    }
    prevDensity = density;
  }
  return boundaries;
}

function detectLyricGapBoundaries(lines: TimestampedLine[]): number[] {
  const boundaries: number[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const gap = lines[i].startSec - lines[i - 1].endSec;
    if (gap > LYRIC_GAP_THRESHOLD_SEC) {
      boundaries.push(lines[i].startSec);
    }
  }
  return boundaries;
}

function sectionEnergy(energyCurve: Float32Array, startSec: number, endSec: number): { avg: number; peak: number } {
  if (!energyCurve.length || endSec <= startSec) return { avg: 0, peak: 0 };
  const startIdx = Math.max(0, Math.floor(startSec / ENERGY_WINDOW_SEC));
  const endIdx = Math.min(energyCurve.length, Math.ceil(endSec / ENERGY_WINDOW_SEC));
  if (endIdx <= startIdx) return { avg: 0, peak: 0 };

  let sum = 0;
  let peak = 0;
  let count = 0;
  for (let i = startIdx; i < endIdx; i += 1) {
    const value = clamp01(energyCurve[i]);
    sum += value;
    peak = Math.max(peak, value);
    count += 1;
  }

  return { avg: count > 0 ? sum / count : 0, peak };
}

function hasLyricRepetition(lines: TimestampedLine[]): boolean {
  const seen = new Set<string>();
  for (const line of lines) {
    const key = line.text.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function deriveSpectralCharacter(spectralCentroidHz: number, avgEnergy: number): "warm" | "bright" | "full" | "thin" {
  if (avgEnergy < 0.2) return "thin";
  if (spectralCentroidHz < 1800) return "warm";
  if (spectralCentroidHz > 3000) return "bright";
  return "full";
}

function classifyRoles(sections: AudioSection[], durationSec: number): AudioSection[] {
  if (!sections.length) return sections;
  const energies = sections.map((s) => s.avgEnergy).sort((a, b) => a - b);
  const medianEnergy = energies[Math.floor(energies.length / 2)] ?? 0;
  const highEnergy = Math.min(1, medianEnergy * 1.2 + 0.08);

  return sections.map((section, index) => {
    const mid = (section.startSec + section.endSec) / 2;
    const pos = durationSec > 0 ? mid / durationSec : 0;
    const next = sections[index + 1];
    const energyRising = section.energyDelta > 0.08;
    const highDensity = section.beatDensity >= 2.2;
    const hasLyrics = section.lyrics.length > 0;

    let role: SectionRole = "verse";
    if (pos <= 0.1 && section.avgEnergy <= medianEnergy && section.lyrics.length <= 1) role = "intro";
    else if (pos >= 0.9 && (section.avgEnergy <= medianEnergy || section.energyDelta < -0.08)) role = "outro";
    else if (section.avgEnergy >= highEnergy && highDensity && section.hasLyricRepetition) role = "chorus";
    else if (section.avgEnergy >= highEnergy && highDensity && !hasLyrics) role = "drop";
    else if (energyRising && next && next.avgEnergy >= highEnergy) role = "prechorus";
    else if (!hasLyrics && section.avgEnergy < medianEnergy * 0.9 && section.beatDensity < 1.6 && pos > 0.15 && pos < 0.85) role = "breakdown";
    else if (pos > 0.2 && pos < 0.8 && index > 0 && section.avgEnergy < medianEnergy && section.spectralCharacter !== sections[index - 1].spectralCharacter) role = "bridge";

    return { ...section, role };
  });
}

function mergeMostSimilar(sections: AudioSection[]): AudioSection[] {
  if (sections.length <= 1) return sections;
  let bestIdx = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i < sections.length - 1; i += 1) {
    const a = sections[i];
    const b = sections[i + 1];
    const rolePenalty = a.role === b.role ? 0 : 0.35;
    const energyPenalty = Math.abs(a.avgEnergy - b.avgEnergy);
    const densityPenalty = Math.abs(a.beatDensity - b.beatDensity) * 0.2;
    const score = rolePenalty + energyPenalty + densityPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const left = sections[bestIdx];
  const right = sections[bestIdx + 1];
  const merged: AudioSection = {
    ...left,
    endSec: right.endSec,
    durationSec: right.endSec - left.startSec,
    avgEnergy: (left.avgEnergy * left.durationSec + right.avgEnergy * right.durationSec) / Math.max(0.001, left.durationSec + right.durationSec),
    peakEnergy: Math.max(left.peakEnergy, right.peakEnergy),
    beatDensity: (left.beatDensity * left.durationSec + right.beatDensity * right.durationSec) / Math.max(0.001, left.durationSec + right.durationSec),
    spectralCharacter: left.avgEnergy >= right.avgEnergy ? left.spectralCharacter : right.spectralCharacter,
    role: left.role === right.role ? left.role : "verse",
    lyrics: [...left.lyrics, ...right.lyrics],
    hasLyricRepetition: hasLyricRepetition([...left.lyrics, ...right.lyrics]),
    energyDelta: left.energyDelta,
  };

  const next = [...sections.slice(0, bestIdx), merged, ...sections.slice(bestIdx + 2)];
  return next.map((s, index) => ({
    ...s,
    index,
    energyDelta: index === 0 ? 0 : s.avgEnergy - (next[index - 1]?.avgEnergy ?? s.avgEnergy),
  }));
}

export function detectSections(
  songSignature: SongSignature,
  beatGrid: { bpm: number; beats: number[]; confidence: number },
  lines: TimestampedLine[],
  durationSec: number,
): AudioSection[] {
  const boundedDuration = Math.max(0, durationSec || songSignature.durationSec || 0);
  if (boundedDuration <= 0) return [];

  const energyBoundaries = detectEnergyBoundaries(songSignature.energyCurve, boundedDuration);
  const densityBoundaries = detectBeatDensityBoundaries(beatGrid.beats ?? [], boundedDuration);
  const lyricBoundaries = detectLyricGapBoundaries(lines);

  const boundaries = normalizeBoundaries(
    [...energyBoundaries, ...densityBoundaries, ...lyricBoundaries],
    boundedDuration,
  );

  const sections: AudioSection[] = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const startSec = boundaries[i];
    const endSec = boundaries[i + 1];
    if (endSec - startSec < MIN_SECTION_LENGTH_SEC && i !== boundaries.length - 2) continue;

    const lyrics = lines.filter((line) => line.endSec > startSec && line.startSec < endSec);
    const energy = sectionEnergy(songSignature.energyCurve, startSec, endSec);
    sections.push({
      index: sections.length,
      startSec,
      endSec,
      durationSec: endSec - startSec,
      avgEnergy: energy.avg,
      peakEnergy: energy.peak,
      energyDelta: 0,
      spectralCharacter: deriveSpectralCharacter(songSignature.spectralCentroidHz, energy.avg),
      beatDensity: beatDensity(beatGrid.beats ?? [], startSec, endSec),
      role: "verse",
      lyrics,
      hasLyricRepetition: hasLyricRepetition(lyrics),
    });
  }

  let normalized = sections.map((section, index) => ({
    ...section,
    index,
    energyDelta: index === 0 ? 0 : section.avgEnergy - sections[index - 1].avgEnergy,
  }));

  normalized = classifyRoles(normalized, boundedDuration);

  while (normalized.length > MAX_SECTIONS) {
    normalized = mergeMostSimilar(normalized);
  }

  return classifyRoles(normalized, boundedDuration).map((section, index, arr) => ({
    ...section,
    index,
    energyDelta: index === 0 ? 0 : section.avgEnergy - (arr[index - 1]?.avgEnergy ?? section.avgEnergy),
    lyrics: section.lyrics.slice(0, 3),
  }));
}

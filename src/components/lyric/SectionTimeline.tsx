import { useEffect, useMemo, useRef, useState } from "react";

import type { SectionRole } from "@/engine/sectionDetector";
import type { LyricLine } from "./LyricDisplay";
import type { LyricSection } from "@/hooks/useLyricSections";
import type { SectionOverride, SectionOverrides } from "@/lib/mergeSectionOverrides";
import type { CinematicSection } from "@/types/CinematicDirection";

interface SectionTimelineProps {
  sections: LyricSection[];
  lyrics: LyricLine[];
  words: Array<{ word: string; start: number; end: number }> | null;
  waveformPeaks: number[];
  durationSec: number;
  currentTimeSec: number;
  isPlaying: boolean;
  onSeek: (timeSec: number) => void;
  onTogglePlay: () => void;
  sectionOverrides: SectionOverrides | null;
  onSectionOverridesChange: (overrides: SectionOverrides) => void;
  palette: string[];
  cinematicSections?: CinematicSection[];
  onAddSection?: (role: SectionRole, startSec: number, endSec: number) => void;
  onRemoveSection?: (sectionIndex: number) => void;
}

const SECTION_COLORS: Record<SectionRole, string> = {
  intro: "#6B7280",
  verse: "#3B82F6",
  prechorus: "#F59E0B",
  chorus: "#EF4444",
  bridge: "#8B5CF6",
  drop: "#EC4899",
  breakdown: "#14B8A6",
  outro: "#6B7280",
};

const LABEL_MAP: Record<SectionRole, string> = {
  intro: "Intro",
  verse: "Verse",
  prechorus: "Pre-Chorus",
  chorus: "Chorus",
  bridge: "Bridge",
  drop: "Drop",
  breakdown: "Breakdown",
  outro: "Outro",
};

const ROLES = Object.keys(SECTION_COLORS) as SectionRole[];
const MIN_SECTION_DURATION_SEC = 2;

function formatTime(sec: number): string {
  const safe = Math.max(0, sec);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function sectionUid(section: LyricSection): string {
  return String(section.sectionIndex);
}

function instanceLabel(section: LyricSection, allSections: LyricSection[]): string {
  const same = allSections.filter((s) => s.role === section.role).sort((a, b) => a.startSec - b.startSec);
  if (same.length <= 1) return LABEL_MAP[section.role];
  return `${LABEL_MAP[section.role]} ${same.findIndex((s) => s.sectionIndex === section.sectionIndex) + 1}`;
}

function firstLineForSection(section: LyricSection, lyrics: LyricLine[]): LyricLine | null {
  return lyrics.find((line) => line.start < section.endSec && line.end >= section.startSec) ?? null;
}

function autoAdjust(sections: LyricSection[], movedIndex: number): LyricSection[] {
  const next = sections.map((section) => ({ ...section }));
  const moved = next[movedIndex];
  if (!moved) return next;

  if (movedIndex > 0) {
    next[movedIndex - 1].endSec = moved.startSec;
  }
  if (movedIndex < next.length - 1) {
    next[movedIndex + 1].startSec = moved.endSec;
  }

  return next.filter((section) => section.endSec - section.startSec >= MIN_SECTION_DURATION_SEC);
}

function buildOverrides(sections: LyricSection[], previous: SectionOverrides | null): SectionOverrides {
  const prev = previous ?? [];
  return sections.map<SectionOverride>((section) => {
    const old = prev.find((o) => o.sectionIndex === section.sectionIndex);
    return {
      sectionIndex: section.sectionIndex,
      role: section.role,
      startSec: section.startSec,
      endSec: section.endSec,
      isNew: old?.isNew,
    };
  });
}

export function SectionTimeline({
  sections,
  lyrics,
  waveformPeaks,
  durationSec,
  currentTimeSec,
  isPlaying,
  onSeek,
  onTogglePlay,
  sectionOverrides,
  onSectionOverridesChange,
  onAddSection,
  onRemoveSection,
}: SectionTimelineProps) {
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ uid: string; edge: "start" | "end" } | null>(null);
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const activeSection = useMemo(() => {
    if (!sections.length) return null;
    if (activeUid) {
      return sections.find((section) => sectionUid(section) === activeUid) ?? null;
    }
    return sections.find((section) => currentTimeSec >= section.startSec && currentTimeSec < section.endSec) ?? sections[0];
  }, [sections, activeUid, currentTimeSec]);

  useEffect(() => {
    if (!sections.length) {
      setActiveUid(null);
      return;
    }
    if (!activeSection) {
      setActiveUid(sectionUid(sections[0]));
    }
  }, [sections, activeSection]);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const t = ratio * durationSec;
      const movedIndex = sections.findIndex((section) => sectionUid(section) === drag.uid);
      if (movedIndex === -1) return;

      const moved = { ...sections[movedIndex] };
      if (drag.edge === "start") {
        moved.startSec = Math.max(0, Math.min(moved.endSec - MIN_SECTION_DURATION_SEC, t));
      } else {
        moved.endSec = Math.min(durationSec, Math.max(moved.startSec + MIN_SECTION_DURATION_SEC, t));
      }

      const next = sections.map((section, idx) => (idx === movedIndex ? moved : { ...section }));
      const adjusted = autoAdjust(next, movedIndex);
      onSectionOverridesChange(buildOverrides(adjusted, sectionOverrides));
    };

    const onUp = () => setDrag(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, durationSec, sections, onSectionOverridesChange, sectionOverrides]);

  const roleCounts = useMemo(() => {
    const counts = new Map<SectionRole, number>();
    sections.forEach((section) => {
      counts.set(section.role, (counts.get(section.role) ?? 0) + 1);
    });
    return counts;
  }, [sections]);

  return (
    <div className="glass-card rounded-xl border border-border/40 overflow-hidden">
      <div className="p-3 border-b border-border/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Section Editor</span>
          <button onClick={onTogglePlay} className="text-[10px] font-mono text-primary hover:text-primary/80 transition-colors">
            {isPlaying ? "Pause" : "Play"}
          </button>
        </div>
        <div
          ref={timelineRef}
          className="relative h-[72px] rounded-lg bg-white/[0.03] overflow-hidden cursor-pointer"
          onClick={(e) => {
            if (!timelineRef.current) return;
            const rect = timelineRef.current.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            onSeek(ratio * durationSec);
          }}
        >
          {sections.map((section) => {
            const isActive = activeSection?.sectionIndex === section.sectionIndex;
            return (
              <button
                key={`band-${section.sectionIndex}`}
                className="absolute top-0 bottom-0 transition-all duration-200"
                style={{
                  left: `${(section.startSec / Math.max(durationSec, 0.001)) * 100}%`,
                  width: `${((section.endSec - section.startSec) / Math.max(durationSec, 0.001)) * 100}%`,
                  background: `linear-gradient(180deg, ${SECTION_COLORS[section.role]}${isActive ? "99" : "3d"}, transparent)`,
                  opacity: isActive ? 1 : 0.45,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveUid(sectionUid(section));
                }}
              />
            );
          })}

          <div className="absolute inset-0 flex items-end gap-px px-1 pointer-events-none">
            {(waveformPeaks.length ? waveformPeaks : new Array(120).fill(0.25)).map((peak, i, arr) => {
              const t = (i / Math.max(arr.length - 1, 1)) * durationSec;
              const sec = sections.find((s) => t >= s.startSec && t < s.endSec);
              const active = sec && activeSection?.sectionIndex === sec.sectionIndex;
              return (
                <div
                  key={i}
                  className="w-full transition-all duration-200"
                  style={{
                    height: `${Math.max(10, peak * 100)}%`,
                    backgroundColor: sec ? SECTION_COLORS[sec.role] : "#64748B",
                    opacity: active ? 0.95 : 0.55,
                  }}
                />
              );
            })}
          </div>

          {activeSection && (
            <>
              <button
                className="absolute top-0 bottom-0 w-1.5 -ml-[3px] cursor-ew-resize"
                style={{
                  left: `${(activeSection.startSec / Math.max(durationSec, 0.001)) * 100}%`,
                  backgroundColor: SECTION_COLORS[activeSection.role],
                  boxShadow: `0 0 10px ${SECTION_COLORS[activeSection.role]}`,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDrag({ uid: sectionUid(activeSection), edge: "start" });
                }}
              />
              <button
                className="absolute top-0 bottom-0 w-1.5 -ml-[3px] cursor-ew-resize"
                style={{
                  left: `${(activeSection.endSec / Math.max(durationSec, 0.001)) * 100}%`,
                  backgroundColor: SECTION_COLORS[activeSection.role],
                  boxShadow: `0 0 10px ${SECTION_COLORS[activeSection.role]}`,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDrag({ uid: sectionUid(activeSection), edge: "end" });
                }}
              />
            </>
          )}

          <div className="absolute top-0 bottom-0 w-px bg-white" style={{ left: `${(currentTimeSec / Math.max(durationSec, 0.001)) * 100}%` }} />
          <div className="absolute top-0 -ml-1.5 mt-1 h-3 w-3 rounded-full bg-white" style={{ left: `${(currentTimeSec / Math.max(durationSec, 0.001)) * 100}%` }} />
        </div>
      </div>

      <div>
        {sections.map((section, idx) => {
          const isActive = activeSection?.sectionIndex === section.sectionIndex;
          const preview = firstLineForSection(section, lyrics);
          const rowLyrics = lyrics.filter((line) => line.start < section.endSec && line.end >= section.startSec);
          return (
            <div
              key={section.sectionIndex}
              className="transition-all duration-200 border-b border-border/30"
              style={{
                backgroundColor: isActive ? `${SECTION_COLORS[section.role]}12` : "transparent",
                borderLeft: isActive ? `2px solid ${SECTION_COLORS[section.role]}` : "2px solid transparent",
              }}
            >
              <div
                className={`w-full px-3 py-2 text-left cursor-pointer ${isActive ? "" : "hover:bg-white/[0.015]"}`}
                onClick={() => setActiveUid(sectionUid(section))}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setActiveUid(sectionUid(section)); }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SECTION_COLORS[section.role] }} />
                    <span className="text-sm text-foreground">{instanceLabel(section, sections)}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{formatTime(section.startSec)}–{formatTime(section.endSec)}</span>
                  </div>
                  {isActive && onRemoveSection ? (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSection(section.sectionIndex);
                        setActiveUid(null);
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-1">{preview?.text || "No lyric preview"}</p>
              </div>

              {isActive && (
                <div className="px-3 pb-2 space-y-1">
                  {rowLyrics.map((line, li) => {
                    const isCurrent = currentTimeSec >= line.start && currentTimeSec < line.end;
                    return (
                      <button
                        key={`${idx}-${li}-${line.start}`}
                        onClick={() => onSeek(line.start)}
                        className={`w-full text-left rounded px-2 py-1 text-xs transition-all duration-200 ${isCurrent ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/[0.03]"}`}
                      >
                        <span className="text-[10px] font-mono mr-2">{formatTime(line.start)}</span>
                        {line.text}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="px-3 py-2">
          <button className="text-xs text-primary hover:text-primary/80 transition-colors" onClick={() => setAddDropdownOpen((v) => !v)}>
            + Add section
          </button>
          {addDropdownOpen && (
            <div className="mt-2 rounded-md border border-border/40 bg-background/80 p-2 grid grid-cols-2 gap-1">
              {ROLES.map((role) => (
                <button
                  key={role}
                  className="text-xs text-left rounded px-2 py-1 hover:bg-white/[0.05]"
                  onClick={() => {
                    const start = Math.min(currentTimeSec, Math.max(durationSec - MIN_SECTION_DURATION_SEC, 0));
                    const end = Math.min(durationSec, start + 20);
                    onAddSection?.(role, start, end);
                    setAddDropdownOpen(false);
                  }}
                >
                  <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: SECTION_COLORS[role] }} />
                  {LABEL_MAP[role]} ({roleCounts.get(role) ?? 0})
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

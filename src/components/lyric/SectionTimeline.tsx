import { useEffect, useMemo, useRef, useState } from "react";

import type { SectionRole } from "@/engine/sectionDetector";
import type { LyricLine } from "./LyricDisplay";
import type { LyricSection } from "@/hooks/useLyricSections";
import type { SectionOverrides } from "@/lib/mergeSectionOverrides";

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

export function SectionTimeline({
  sections,
  lyrics,
  waveformPeaks,
  durationSec,
  currentTimeSec,
  onSeek,
  onTogglePlay,
  sectionOverrides,
  onSectionOverridesChange,
}: SectionTimelineProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [draggingBoundary, setDraggingBoundary] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setRolePickerOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  const activeSection = useMemo(
    () => sections.find((s) => currentTimeSec >= s.startSec && currentTimeSec < s.endSec) ?? sections[0] ?? null,
    [sections, currentTimeSec],
  );

  useEffect(() => {
    if (selectedIndex === null && activeSection) setSelectedIndex(activeSection.sectionIndex);
  }, [activeSection, selectedIndex]);

  const selected = useMemo(
    () => sections.find((s) => s.sectionIndex === selectedIndex) ?? null,
    [sections, selectedIndex],
  );

  const upsertOverride = (patch: { sectionIndex: number; role?: SectionRole; startSec?: number; endSec?: number }) => {
    const current = sectionOverrides ?? [];
    const existing = current.find((o) => o.sectionIndex === patch.sectionIndex);
    const next = existing
      ? current.map((o) => (o.sectionIndex === patch.sectionIndex ? { ...o, ...patch } : o))
      : [...current, patch];
    onSectionOverridesChange(next);
  };

  useEffect(() => {
    if (draggingBoundary === null) return;

    const onMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const t = ratio * durationSec;
      const left = sections[draggingBoundary];
      const right = sections[draggingBoundary + 1];
      if (!left || !right) return;
      const min = left.startSec + MIN_SECTION_DURATION_SEC;
      const max = right.endSec - MIN_SECTION_DURATION_SEC;
      const clamped = Math.max(min, Math.min(max, t));
      upsertOverride({ sectionIndex: left.sectionIndex, endSec: clamped });
      upsertOverride({ sectionIndex: right.sectionIndex, startSec: clamped });
    };

    const onUp = () => setDraggingBoundary(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingBoundary, durationSec, sectionOverrides, sections]);

  return (
    <div className="glass-card rounded-xl p-3 space-y-3 border border-border/40">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Section Editor</span>
        <button onClick={onTogglePlay} className="text-[10px] font-mono text-primary hover:text-primary/80 transition-all duration-200">
          {"Toggle Play"}
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
        <div className="absolute inset-0 flex items-end gap-px px-1">
          {(waveformPeaks.length ? waveformPeaks : new Array(120).fill(0.25)).map((peak, i, arr) => {
            const t = (i / Math.max(arr.length - 1, 1)) * durationSec;
            const sec = sections.find((s) => t >= s.startSec && t < s.endSec);
            return (
              <div key={i} className="w-full" style={{ height: `${Math.max(10, peak * 100)}%`, backgroundColor: sec ? SECTION_COLORS[sec.role] : "#64748B", opacity: 0.7 }} />
            );
          })}
        </div>

        {sections.map((section, i) => (
          <div key={section.sectionIndex}>
            <div
              className="absolute top-1 text-[9px] uppercase font-mono tracking-wide"
              style={{ left: `${(section.startSec / durationSec) * 100}%`, color: SECTION_COLORS[section.role] }}
            >
              {section.role}
            </div>
            {i < sections.length - 1 && (
              <button
                className="absolute top-0 bottom-0 w-2 -ml-1 cursor-ew-resize bg-white/30 hover:bg-white/60"
                style={{ left: `${(section.endSec / durationSec) * 100}%` }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDraggingBoundary(i);
                }}
              />
            )}
          </div>
        ))}

        <div className="absolute top-0 bottom-0 w-px bg-white" style={{ left: `${(currentTimeSec / Math.max(durationSec, 0.001)) * 100}%` }} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {sections.map((section) => {
          const active = activeSection?.sectionIndex === section.sectionIndex;
          return (
            <button
              key={section.sectionIndex}
              onClick={() => setSelectedIndex(section.sectionIndex)}
              className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-mono transition-all duration-200 ${
                active ? "border-primary text-foreground" : "border-border/40 text-muted-foreground"
              }`}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: SECTION_COLORS[section.role] }} />
              {section.label}
              {section.confidence < 0.55 ? <span className="ml-1 text-amber-300">?</span> : null}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="rounded-lg border border-border/40 bg-white/[0.02] p-3 space-y-2" ref={pickerRef}>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setRolePickerOpen((v) => !v)}
              className="text-sm font-medium text-foreground flex items-center gap-2"
            >
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: SECTION_COLORS[selected.role] }} />
              {selected.label}
            </button>
            <span className="text-[10px] font-mono text-muted-foreground">{formatTime(selected.startSec)}–{formatTime(selected.endSec)}</span>
          </div>
          {rolePickerOpen && (
            <div className="grid grid-cols-2 gap-1 rounded-md border border-border/40 p-2 bg-background/90">
              {ROLES.map((role) => (
                <button
                  key={role}
                  onClick={() => {
                    upsertOverride({ sectionIndex: selected.sectionIndex, role });
                    setRolePickerOpen(false);
                  }}
                  className="text-xs text-left px-2 py-1 rounded hover:bg-white/[0.05]"
                >
                  <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: SECTION_COLORS[role] }} />
                  {role}
                  {selected.role === role ? " ✓" : ""}
                </button>
              ))}
            </div>
          )}

          {selected.confidence < 0.55 && selected.labelSource !== "user" && (
            <div className="text-[10px] text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
              Low confidence detection. Tap the section name to correct it.
            </div>
          )}

          <div className="text-[10px] font-mono text-muted-foreground">
            Source: {selected.labelSource === "user" ? "YOU" : selected.labelSource === "ai" ? "AI" : "AUTO"} · Confidence {(selected.confidence * 100).toFixed(0)}%
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1">
            {lyrics
              .filter((line) => line.start < selected.endSec && line.end >= selected.startSec)
              .map((line, idx) => {
                const isCurrent = currentTimeSec >= line.start && currentTimeSec < line.end;
                return (
                  <button
                    key={`${line.start}-${idx}`}
                    onClick={() => onSeek(line.start)}
                    className={`block w-full text-left text-xs rounded px-2 py-1 transition-all duration-200 ${isCurrent ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-white/[0.03]"}`}
                  >
                    <span className="font-mono text-[10px] mr-2">{formatTime(line.start)}</span>
                    {line.text}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

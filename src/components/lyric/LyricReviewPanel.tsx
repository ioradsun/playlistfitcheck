import { useEffect, useMemo, useRef } from "react";

import type { LyricSection, LyricSectionLine } from "@/hooks/useLyricSections";

interface LyricReviewPanelProps {
  sections: LyricSection[];
  allLines: LyricSectionLine[];
  currentTimeSec: number;
  onSeekTo: (sec: number) => void;
  palette: string[];
  isReady: boolean;
}

function LyricReviewPanel({ sections, allLines, currentTimeSec, onSeekTo, palette, isReady }: LyricReviewPanelProps) {
  const activeLineIndex = useMemo(() => {
    for (let i = 0; i < allLines.length; i++) {
      const l = allLines[i];
      if (currentTimeSec >= l.startSec && currentTimeSec < l.endSec + 0.1) {
        return l.lineIndex;
      }
    }
    return -1;
  }, [allLines, currentTimeSec]);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const isHoveringRef = useRef(false);

  useEffect(() => {
    if (activeLineIndex === -1) return;
    if (isHoveringRef.current) return;
    if (!activeLineRef.current) return;
    activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeLineIndex]);

  const handleLineCick = (line: LyricSectionLine) => {
    onSeekTo(Math.max(0, line.startSec - 0.25));
  };

  const handleSectionClick = (section: LyricSection) => {
    onSeekTo(section.startSec);
  };

  if (!isReady) {
    const skeletonWidths = ["w-4/5", "w-3/5", "w-11/12", "w-2/3"];

    return (
      <div className="h-full overflow-y-auto" style={{ padding: "12px 12px 60px 12px" }}>
        {Array.from({ length: 3 }).map((_, blockIndex) => (
          <div key={blockIndex} className="mb-6">
            <div className="h-2 w-16 rounded bg-white/10 animate-pulse mb-3" />
            {Array.from({ length: 4 }).map((__, i) => (
              <div
                key={i}
                className={`h-2 rounded bg-white/[0.06] animate-pulse mb-2 ${skeletonWidths[i % skeletonWidths.length]}`}
                style={{ animationDelay: `${i * 75}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => {
        isHoveringRef.current = true;
      }}
      onMouseLeave={() => {
        isHoveringRef.current = false;
      }}
      className="lyric-review-panel h-full overflow-y-auto"
      style={{
        padding: "0 12px 60px 12px",
        scrollbarWidth: "none",
      }}
    >
      <style>{`
        .lyric-review-panel::-webkit-scrollbar { display: none; }
      `}</style>

      {sections.map((section, si) => (
        <div key={section.sectionIndex} className={si === 0 ? "" : "mt-5"}>
          <button
            onClick={() => handleSectionClick(section)}
            className="flex items-center gap-1.5 mb-1 group"
            style={{ paddingLeft: 10 }}
          >
            <span
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: palette[0] ?? "#ffffff",
                opacity: 0.55,
                transition: "opacity 120ms",
              }}
              className="group-hover:opacity-90"
            >
              {section.label}
            </span>
            {section.confidence < 0.6 && (
              <span style={{ fontSize: 8, color: palette[0] ?? "#ffffff", opacity: 0.35 }}>·</span>
            )}
          </button>

          {section.lines.map((line) => {
            const isActive = line.lineIndex === activeLineIndex;
            return (
              <div
                key={line.lineIndex}
                ref={isActive ? activeLineRef : undefined}
                onClick={() => handleLineCick(line)}
                style={{
                  fontSize: 14,
                  fontFamily: "monospace",
                  lineHeight: 1.55,
                  padding: "3px 8px 3px 10px",
                  borderLeft: isActive
                    ? `2px solid ${palette[1] ?? "#ffffff"}`
                    : "2px solid transparent",
                  color: isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.50)",
                  fontWeight: isActive ? 600 : 400,
                  cursor: "pointer",
                  transition: "color 120ms ease, font-weight 120ms ease, border-color 120ms ease",
                  userSelect: "none",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = "rgba(255,255,255,0.80)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = "rgba(255,255,255,0.50)";
                }}
              >
                {line.text}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export { LyricReviewPanel };
export default LyricReviewPanel;

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
      <div className="h-full overflow-y-auto" style={{ padding: "20px 0 80px 0" }}>
        {Array.from({ length: 3 }).map((_, blockIndex) => (
          <div key={blockIndex} className="mb-6">
            <div className="h-2 w-16 rounded bg-white/10 animate-pulse mb-3 ml-4" />
            {Array.from({ length: 4 }).map((__, i) => (
              <div
                key={i}
                className={`h-2 rounded bg-white/[0.06] animate-pulse mb-2 mx-4 ${skeletonWidths[i % skeletonWidths.length]}`}
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
        padding: "20px 0px 80px 0px",
        scrollbarWidth: "none",
      }}
    >
      <style>{`
        .lyric-review-panel::-webkit-scrollbar { display: none; }
      `}</style>

      {sections.map((section, si) => (
        <div key={section.sectionIndex} className={si === 0 ? "mb-6" : "mt-8 mb-6"}>
          <button
            onClick={() => handleSectionClick(section)}
            className="flex items-center gap-2 mb-3 w-full group"
            style={{ padding: "0 16px" }}
          >
            <span
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: palette[0] ?? "#ffffff",
                opacity: 0.35,
                transition: "opacity 150ms",
              }}
              className="group-hover:opacity-90"
            >
              {section.label}
            </span>
            {section.confidence < 0.6 && (
              <span style={{ fontSize: 8, color: palette[0] ?? "#ffffff", opacity: 0.35 }}>·</span>
            )}
            <div
              style={{
                flex: 1,
                height: 1,
                background: "rgba(255,255,255,0.04)",
                marginLeft: 8,
              }}
            />
          </button>

          {section.lines.map((line) => {
            const isActive = line.lineIndex === activeLineIndex;
            return (
              <div
                key={line.lineIndex}
                ref={isActive ? activeLineRef : undefined}
                onClick={() => handleLineCick(line)}
                style={{
                  fontSize: 13,
                  fontFamily: "'Inter', sans-serif",
                  lineHeight: 1.65,
                  padding: "5px 16px 5px 14px",
                  borderLeft: isActive
                    ? `2px solid ${palette[1] ?? "#ffffff"}`
                    : "2px solid transparent",
                  color: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.45)",
                  fontWeight: isActive ? 500 : 400,
                  cursor: "pointer",
                  transition: "color 120ms ease, border-color 120ms ease",
                  userSelect: "none",
                  letterSpacing: "0.01em",
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

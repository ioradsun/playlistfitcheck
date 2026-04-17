import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { deriveMomentFireCounts } from "@/lib/momentUtils";
import type { Moment } from "@/lib/buildMoments";
import type { LyricDancePlayer } from "@/engine/LyricDancePlayer";
import { canExportVideo, exportVideoAsMP4 } from "@/engine/exportVideo";
import { SelectorCard } from "./SelectorCard";

interface ExportStudioProps {
  isOpen: boolean;
  onClose: () => void;
  getPlayer: () => LyricDancePlayer | null;
  moments: Moment[];
  fireHeat: Record<string, { line: Record<number, number>; total: number }>;
  comments: Array<{ text: string; line_index: number | null }>;
  songTitle: string;
  artistName: string;
  avatarUrl: string | null;
  audioUrl: string;
  durationSec: number;
  empowermentHooks?: string[];
  hookVoteCounts?: number[];
}

const PLATFORMS = [
  { label: "TikTok / Reels / Shorts", ratio: "9:16 portrait", w: 1080, h: 1920 },
  { label: "Instagram square", ratio: "1:1 square", w: 1080, h: 1080 },
  { label: "YouTube / Twitter", ratio: "16:9 landscape", w: 1920, h: 1080 },
] as const;

function safeName(input: string): string {
  return (input || "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "clip";
}

const PREVIEW_BUFFERS = [
  { w: 360, h: 640 }, // 9:16
  { w: 400, h: 400 }, // 1:1
  { w: 640, h: 360 }, // 16:9
] as const;

type SortedMoment = {
  moment: Moment;
  index: number;
  fires: number;
  isFull?: boolean;
};

const STYLE = {
  mono9: {
    fontFamily: '"SF Mono", monospace',
    fontSize: 9,
  } as CSSProperties,
  dropdownRow: {
    width: "100%",
    border: "none",
    borderBottom: "0.5px solid rgba(255,255,255,0.04)",
    color: "inherit",
    padding: "9px 14px",
    textAlign: "left" as const,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
  } as CSSProperties,
  activeRow: {
    background: "rgba(68,210,126,0.06)",
  } as CSSProperties,
  inactiveRow: {
    background: "transparent",
  } as CSSProperties,
  dot: (active: boolean): CSSProperties => ({
    width: 6,
    height: 6,
    borderRadius: 999,
    background: active ? "#44d27e" : "rgba(255,255,255,0.2)",
    boxShadow: active ? "0 0 8px rgba(68,210,126,0.7)" : "none",
  }),
  greenButton: {
    borderRadius: 12,
    border: "none",
    background: "#44d27e",
    color: "#06170e",
    fontWeight: 800,
    cursor: "pointer",
  } as CSSProperties,
} as const;

export function ExportStudio({
  isOpen,
  onClose,
  getPlayer,
  moments,
  fireHeat,
  comments,
  songTitle,
  artistName,
  avatarUrl,
  audioUrl,
  durationSec,
  empowermentHooks,
  hookVoteCounts,
}: ExportStudioProps) {
  const [selectedMomentIdx, setSelectedMomentIdx] = useState(1);
  const [captionMode, setCaptionMode] = useState<"hook" | "custom">("hook");
  const [selectedHookIdx, setSelectedHookIdx] = useState(0);
  const [customCaption, setCustomCaption] = useState("");
  const [captionStyle, setCaptionStyle] = useState<"stroke" | "bar" | "pill" | "none">("bar");
  const [captionPos, setCaptionPos] = useState<"top" | "bottom">("bottom");
  const [platformIdx, setPlatformIdx] = useState(0);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [includeCredit, setIncludeCredit] = useState(true);
  const [includeBeatVis, setIncludeBeatVis] = useState(false);
  const [includeWickBar, setIncludeWickBar] = useState(true);
  const [includeFireReaction, setIncludeFireReaction] = useState(true);
  const [exportStage, setExportStage] = useState<"ready" | "rendering" | "done" | "error">("ready");
  const [exportProgress, setExportProgress] = useState(0);
  const [openPanel, setOpenPanel] = useState<"moment" | "caption" | "platform" | "options" | null>(null);
  const [downloadBlob, setDownloadBlob] = useState<Blob | null>(null);
  const [browserSupported, setBrowserSupported] = useState(true);
  const [mobileTab, setMobileTab] = useState<"config" | "preview">("config");
  const [isMobile, setIsMobile] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captionInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevSizeRef = useRef<{ w: number; h: number } | null>(null);
  const avatarImgRef = useRef<HTMLImageElement | null>(null);

  const hooks = empowermentHooks ?? [];

  const sortedMoments = useMemo((): SortedMoment[] => {
    const fireCounts = deriveMomentFireCounts(fireHeat, moments);
    const ranked: SortedMoment[] = moments
      .map((moment, index) => ({ moment, index, fires: fireCounts[index] ?? 0 }))
      .sort((a, b) => b.fires - a.fires);
    const fullVideo: SortedMoment = {
      moment: { startSec: 0, endSec: durationSec, lines: [], index: -1, label: null, phraseIndices: [], energy: 0.5, sectionIndex: 0, sectionProgress: 0 },
      index: -1,
      fires: 0,
      isFull: true,
    };
    return [fullVideo, ...ranked];
  }, [fireHeat, moments, durationSec]);

  const activeSelection = sortedMoments[Math.min(selectedMomentIdx, sortedMoments.length - 1)] ?? sortedMoments[0];
  const activeCaption = captionMode === "custom"
    ? customCaption
    : (empowermentHooks?.[selectedHookIdx] ?? "");

  const totalVotes = (hookVoteCounts ?? []).reduce((sum, n) => sum + n, 0);

  const captionCss = useMemo<CSSProperties>(() => {
    if (captionStyle === "none" || !activeCaption) return { display: "none" };

    const isPortrait = platformIdx === 0;
    const isLandscape = platformIdx === 2;

    const posStyles: CSSProperties = captionPos === "top"
      ? {
        top: isPortrait ? "12%" : "8%",
        bottom: "auto",
        left: isPortrait ? "6%" : "8%",
        right: isPortrait ? "6%" : "8%",
      }
      : {
        top: "auto",
        bottom: isPortrait ? "22%" : "16%",
        left: isPortrait ? "6%" : "10%",
        right: isPortrait ? "18%" : "10%",
      };

    const base: CSSProperties = {
      position: "absolute",
      ...posStyles,
      fontSize: isLandscape ? 10 : 12,
      fontWeight: 800,
      fontFamily: '"SF Pro Display", -apple-system, sans-serif',
      zIndex: 2,
      lineHeight: 1.4,
      wordBreak: "break-word",
      pointerEvents: "none",
      textAlign: "center",
      maxWidth: isPortrait ? "88%" : "70%",
      marginLeft: "auto",
      marginRight: "auto",
      left: 0,
      right: 0,
    };

    if (captionPos === "bottom" && isPortrait) {
      base.textAlign = "left";
      base.left = "6%";
      base.right = "18%";
      base.maxWidth = "76%";
      base.marginLeft = undefined;
      base.marginRight = undefined;
    }

    switch (captionStyle) {
      case "stroke":
        return {
          ...base,
          color: "#ffffff",
          WebkitTextStroke: "0.5px rgba(0,0,0,0.8)",
          textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.5)",
          paintOrder: "stroke fill",
        };
      case "bar":
        return {
          ...base,
          maxWidth: isPortrait ? "76%" : "65%",
          color: "#ffffff",
          background: "rgba(0,0,0,0.7)",
          borderRadius: 6,
          padding: "6px 12px",
          textShadow: "none",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        };
      case "pill":
        return {
          ...base,
          color: "#ffffff",
          background: "#000000",
          borderRadius: 999,
          padding: "5px 14px",
          textShadow: "none",
          display: "inline-block",
        };
      default:
        return { display: "none" };
    }
  }, [captionStyle, captionPos, activeCaption, platformIdx]);

  useEffect(() => {
    if (!isOpen) return;
    setBrowserSupported(canExportVideo());
    setExportStage("ready");
    setExportProgress(0);
    setOpenPanel(null);
    setDownloadBlob(null);
    setIncludeBeatVis(false);
    setIncludeCredit(true);
    setIncludeWickBar(true);
    setIncludeFireReaction(true);
    setCaptionStyle("bar");
    setCaptionPos("bottom");
    setSelectedMomentIdx(1);
    setMobileTab("config");
  }, [isOpen]);

  useEffect(() => {
    if (!avatarUrl) {
      avatarImgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      avatarImgRef.current = img;
    };
    img.onerror = () => {
      avatarImgRef.current = null;
    };
    img.src = avatarUrl;
  }, [avatarUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (exportStage === "rendering") return;
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, exportStage]);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 680px)");
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    onChange(mql);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !openPanel) return;
    const handleDocumentClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      const target = e.target as Node;
      if (!rootRef.current.contains(target)) return;
      const inSelector = (target as HTMLElement).closest("[data-selector-card='true']");
      if (!inSelector) setOpenPanel(null);
    };
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [isOpen, openPanel]);

  useEffect(() => {
    if (openPanel === "caption") {
      captionInputRef.current?.focus();
    }
  }, [openPanel]);

  // Preview canvas buffer — match export aspect ratio at preview resolution.
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const buf = PREVIEW_BUFFERS[platformIdx];
    canvas.width = Math.round(buf.w * dpr);
    canvas.height = Math.round(buf.h * dpr);
  }, [platformIdx]);

  useEffect(() => {
    if (!isOpen || exportStage === "rendering") return;
    if (isMobile && mobileTab !== "preview") return;
    const player = getPlayer();
    const canvas = previewCanvasRef.current;
    if (!player || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let stopped = false;
    let rafId = 0;
    let lastDrawTime = 0;
    const FRAME_INTERVAL = 1000 / 30;
    const draw = (now: number) => {
      if (stopped) return;
      if (now - lastDrawTime >= FRAME_INTERVAL) {
        lastDrawTime = now;
        const source = player.getExportCanvas();
        if (source && source.width > 0 && source.height > 0) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        }
      }
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    };
  }, [isOpen, exportStage, getPlayer, isMobile, mobileTab]);

  // Resize player to PREVIEW buffer dimensions — NOT export resolution.
  // compileScene() uses this.width/this.height for all text layout (font sizes,
  // line positions, word wrapping). Without resize, the player stays at its
  // FitTab embed size (~360×480, 3:4 ratio) but the preview shows 9:16.
  // Text is compiled for the wrong aspect ratio → oversized, overlapping lyrics.
  //
  // PREVIEW_BUFFERS (360×640 for 9:16) gives the correct aspect ratio for text
  // layout while being 9× cheaper than full export resolution (1080×1920).
  // The export pipeline handles full-res resize via setupExportResolution().
  useEffect(() => {
    if (!isOpen) return;
    const player = getPlayer();
    if (!player) return;
    if (!prevSizeRef.current) {
      prevSizeRef.current = { w: (player as any).currentWidth ?? 960, h: (player as any).currentHeight ?? 540 };
    }
    const buf = PREVIEW_BUFFERS[platformIdx];
    player.resize(buf.w, buf.h);
  }, [platformIdx, getPlayer, isOpen]);

  useEffect(() => {
    if (!isOpen || exportStage === "rendering") return;
    const player = getPlayer();
    if (!player || !activeSelection) return;
    if (activeSelection?.isFull) {
      player.setRegion(undefined, undefined);
      player.seek(0);
    } else {
      player.setRegion(activeSelection.moment.startSec, activeSelection.moment.endSec);
      player.seek(activeSelection.moment.startSec);
    }
    player.setMuted(!includeAudio);
    player.play(true);
  }, [selectedMomentIdx, includeAudio, getPlayer, isOpen, activeSelection, exportStage]);

  // Sync visual flags with player during preview.
  useEffect(() => {
    const player = getPlayer();
    if (!player || !isOpen) return;
    player.wickBarEnabled = includeWickBar;
    player.applyOptions({ beatVisualizer: includeBeatVis });
    player.setEmojiStreamEnabled(includeFireReaction);
  }, [includeWickBar, includeBeatVis, includeFireReaction, getPlayer, isOpen]);

  useEffect(() => {
    if (isOpen) return;
    abortRef.current?.abort();
    const player = getPlayer();
    if (player) {
      player.pause();
      player.setRegion(undefined, undefined);
      player.wickBarEnabled = false;
      player.applyOptions({ beatVisualizer: false });
      player.setEmojiStreamEnabled(false);
      const prev = prevSizeRef.current;
      if (prev) {
        player.resize(prev.w, prev.h);
      }
    }
    prevSizeRef.current = null;
  }, [isOpen, getPlayer]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const triggerDownload = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName(artistName)}-${safeName(songTitle)}-moment${selectedMomentIdx}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleDownload = async () => {
    if (!browserSupported || !activeSelection) return;
    const player = getPlayer();
    if (!player) {
      setExportStage("error");
      return;
    }

    const { w, h } = PLATFORMS[platformIdx];
    const startSec = activeSelection?.isFull ? 0 : activeSelection.moment.startSec;
    const endSec = activeSelection?.isFull ? durationSec : activeSelection.moment.endSec;

    const abort = new AbortController();
    abortRef.current = abort;
    setExportProgress(0);
    setExportStage("rendering");

    try {
      // Set export visual flags.
      player.wickBarEnabled = includeWickBar;
      player.applyOptions({ beatVisualizer: includeBeatVis });
      player.setEmojiStreamEnabled(includeFireReaction);
      const blob = await exportVideoAsMP4({
        player,
        width: w,
        height: h,
        fps: 30,
        songDuration: Math.max(0, endSec - startSec),
        startOffset: startSec,
        captionText: activeCaption.trim() || undefined,
        captionOptions: activeCaption.trim()
          ? {
            style: captionStyle,
            position: captionPos,
          }
          : undefined,
        credit: includeCredit
          ? {
            artistName,
            songTitle,
            avatarImg: avatarImgRef.current,
          }
          : undefined,
        audioSlice: includeAudio && audioUrl
          ? {
            audioUrl,
            startSec,
            endSec,
          }
          : undefined,
        onProgress: setExportProgress,
        signal: abort.signal,
      });
      setDownloadBlob(blob);
      setExportStage("done");
      triggerDownload(blob);
    } catch (error: any) {
      if (error?.name === "AbortError") {
        setExportStage("ready");
      } else {
        console.error("[ExportStudio] export failed", error);
        setExportStage("error");
      }
    } finally {
      abortRef.current = null;
      // Restore preview visual flags.
      player.wickBarEnabled = false;
      player.applyOptions({ beatVisualizer: false });
      player.setEmojiStreamEnabled(false);
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  const aspectRatios = ["9 / 16", "1 / 1", "16 / 9"] as const;
  const maxPreviewHeights = isMobile
    ? ["min(65vh, 520px)", "min(55vh, 400px)", "min(45vh, 320px)"] as const
    : ["min(480px, 70vh)", "min(360px, 50vh)", "min(280px, 40vh)"] as const;
  const momentTag = selectedMomentIdx === 0 ? "full" : `#${selectedMomentIdx} hottest`;
  const captionTag = captionMode === "custom"
    ? "custom"
    : selectedHookIdx >= hooks.length
      ? "none"
      : `fmly hook #${selectedHookIdx + 1}`;
  const optionsList = [
    { label: "Audio", value: includeAudio },
    { label: "Credit", value: includeCredit },
    { label: "Progress wick", value: includeWickBar },
    { label: "Beat bars", value: includeBeatVis },
    { label: "Fire reaction", value: includeFireReaction },
  ];
  const enabledOptions = optionsList.filter((o) => o.value);
  const optionsTag = `${enabledOptions.length} of ${optionsList.length} on`;
  const optionsSummary = enabledOptions.length === 0
    ? "All off"
    : enabledOptions.length === optionsList.length
      ? "All on"
      : enabledOptions.map((o) => o.label).join(" · ");

  return createPortal(
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0a0a0a",
        fontFamily: '"SF Pro Display", -apple-system, sans-serif',
        color: "rgba(255,255,255,0.9)",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
      }}
    >
      {!isMobile && (
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 10,
            width: 32,
            height: 32,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.02)",
            color: "rgba(255,255,255,0.78)",
            fontSize: 18,
            lineHeight: "30px",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      )}
      {isMobile && (
        <div
          style={{
            display: "flex",
            borderBottom: "0.5px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
            paddingTop: "env(safe-area-inset-top, 0px)",
            position: "relative",
          }}
        >
          <button
            type="button"
            onClick={() => setMobileTab("preview")}
            style={{
              flex: 1,
              height: 44,
              border: "none",
              background: "transparent",
              color: mobileTab === "preview" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
              fontFamily: '"SF Mono", monospace',
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
              borderBottom: mobileTab === "preview" ? "2px solid #44d27e" : "2px solid transparent",
              transition: "all 0.15s",
            }}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("config")}
            style={{
              flex: 1,
              height: 44,
              border: "none",
              background: "transparent",
              color: mobileTab === "config" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
              fontFamily: '"SF Mono", monospace',
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
              borderBottom: mobileTab === "config" ? "2px solid #44d27e" : "2px solid transparent",
              transition: "all 0.15s",
            }}
          >
            Config
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              marginTop: "calc(env(safe-area-inset-top, 0px) / 2)",
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.02)",
              color: "rgba(255,255,255,0.78)",
              fontSize: 16,
              lineHeight: "26px",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      )}

      <div
        style={{
          ...(isMobile
            ? {
              width: "100%",
              maxWidth: "none",
              borderRight: "none",
              flex: 1,
              display: mobileTab === "config" ? "flex" : "none",
            }
            : {
              width: 320,
              maxWidth: "45vw",
              flexShrink: 0,
              borderRight: "0.5px solid rgba(255,255,255,0.06)",
              display: "flex",
            }),
          overflowX: "hidden",
          overflowY: "auto",
          flexDirection: "column",
          padding: "16px 0",
          gap: 12,
        }}
      >
        <SelectorCard
          label="Moment"
          tag={momentTag}
          mainText={selectedMomentIdx === 0 ? "Full video" : (activeSelection?.moment?.lines?.[0]?.text ?? `Moment #${selectedMomentIdx}`)}
          subTexts={[
            `${Math.round(((activeSelection?.moment.endSec ?? 0) - (activeSelection?.moment.startSec ?? 0)) || durationSec)}s`,
            `${Math.round(activeSelection?.fires ?? 0)} fire`,
          ]}
          isOpen={openPanel === "moment"}
          onToggle={() => setOpenPanel((curr) => (curr === "moment" ? null : "moment"))}
        >
          {sortedMoments.map((entry, idx) => {
            const isActive = idx === selectedMomentIdx;
            const duration = Math.max(0, entry.moment.endSec - entry.moment.startSec);
            const firePct = Math.min(1, (entry.fires ?? 0) / Math.max(1, sortedMoments[1]?.fires ?? 1));
            return (
              <button
                key={`${entry.index}-${idx}`}
                type="button"
                onClick={() => {
                  setSelectedMomentIdx(idx);
                  setOpenPanel(null);
                  if (isMobile) setMobileTab("preview");
                }}
                style={{
                  ...STYLE.dropdownRow,
                  ...(isActive ? STYLE.activeRow : STYLE.inactiveRow),
                  padding: "9px 12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                  <div style={STYLE.dot(isActive)} />
                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.83)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {idx === 0 ? "Full video" : (entry.moment?.lines?.[0]?.text ?? `Moment #${idx}`)}
                    </div>
                    <div style={{ ...STYLE.mono9, color: "rgba(255,255,255,0.3)" }}>
                      {duration.toFixed(1)}s · {entry.moment.lines?.length ?? 0} lines
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {idx === 0 ? (
                    <span style={{ ...STYLE.mono9, color: "rgba(255,255,255,0.42)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 999, padding: "2px 6px" }}>full</span>
                  ) : (
                    <>
                      <div style={{ width: 36, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.round(firePct * 100)}%`, height: "100%", background: "#44d27e" }} />
                      </div>
                      <span style={{ ...STYLE.mono9, color: "rgba(255,255,255,0.55)" }}>{Math.round(entry.fires)}</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
          {sortedMoments.length <= 1 && (
            <div style={{ padding: "12px 14px", fontSize: 11, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>
              Publish your song to generate clip moments from listener fire data.
            </div>
          )}
        </SelectorCard>

        {(activeCaption && captionMode !== "hook") || (captionMode === "hook" && selectedHookIdx < hooks.length) ? (
          <div style={{ padding: "0 16px" }}>
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.2)",
                fontFamily: '"SF Mono", monospace',
                marginBottom: 6,
              }}
            >
              Style
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["stroke", "bar", "pill", "none"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setCaptionStyle(s)}
                  style={{
                    flex: 1,
                    height: 32,
                    borderRadius: 8,
                    border: captionStyle === s
                      ? "1px solid rgba(68,210,126,0.5)"
                      : "1px solid rgba(255,255,255,0.08)",
                    background: captionStyle === s
                      ? "rgba(68,210,126,0.08)"
                      : "transparent",
                    color: captionStyle === s
                      ? "#44d27e"
                      : "rgba(255,255,255,0.4)",
                    fontFamily: '"SF Mono", monospace',
                    fontSize: 9,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {captionStyle !== "none" && (
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                {(["top", "bottom"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCaptionPos(p)}
                    style={{
                      flex: 1,
                      height: 28,
                      borderRadius: 6,
                      border: captionPos === p
                        ? "1px solid rgba(68,210,126,0.4)"
                        : "1px solid rgba(255,255,255,0.06)",
                      background: captionPos === p
                        ? "rgba(68,210,126,0.06)"
                        : "transparent",
                      color: captionPos === p
                        ? "#44d27e"
                        : "rgba(255,255,255,0.3)",
                      fontFamily: '"SF Mono", monospace',
                      fontSize: 9,
                      textTransform: "uppercase",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <SelectorCard
          label="Caption"
          tag={captionTag}
          mainText={activeCaption || "(no caption)"}
          subTexts={[`${hooks.length} hooks`, `${totalVotes} votes`, `${comments.length} comments`]}
          isOpen={openPanel === "caption"}
          onToggle={() => setOpenPanel((curr) => (curr === "caption" ? null : "caption"))}
        >
          <input
            ref={captionInputRef}
            value={customCaption}
            placeholder="Type a custom caption..."
            onInput={(e) => {
              setCustomCaption((e.target as HTMLInputElement).value);
              setCaptionMode("custom");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setOpenPanel(null);
                if (isMobile) setMobileTab("preview");
              }
            }}
            maxLength={120}
            style={{
              width: "100%",
              border: "none",
              borderBottom: "0.5px solid rgba(255,255,255,0.06)",
              background: "transparent",
              color: "rgba(255,255,255,0.85)",
              fontSize: 12,
              padding: "8px 14px",
              outline: "none",
            }}
          />
          {customCaption.trim() && captionMode === "custom" && (
            <button
              type="button"
              onClick={() => {
                setCaptionMode("custom");
                setOpenPanel(null);
                if (isMobile) setMobileTab("preview");
              }}
              style={{
                width: "100%",
                border: "none",
                borderBottom: "0.5px solid rgba(255,255,255,0.04)",
                background: "rgba(68,210,126,0.06)",
                color: "rgba(255,255,255,0.9)",
                fontStyle: "italic",
                padding: "8px 14px",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {customCaption}
            </button>
          )}
          {hooks.map((hook, idx) => {
            const votes = hookVoteCounts?.[idx] ?? 0;
            const pct = totalVotes > 0 ? `${Math.round((votes / totalVotes) * 100)}%` : "0%";
            const active = captionMode === "hook" && selectedHookIdx === idx;
            return (
              <button
                key={`${hook}-${idx}`}
                type="button"
                onClick={() => {
                  setCaptionMode("hook");
                  setSelectedHookIdx(idx);
                  setOpenPanel(null);
                  if (isMobile) setMobileTab("preview");
                }}
                style={{
                  ...STYLE.dropdownRow,
                  ...(active ? STYLE.activeRow : STYLE.inactiveRow),
                  color: "rgba(255,255,255,0.82)",
                  padding: "8px 14px",
                  gap: 8,
                }}
              >
                <span style={{ fontStyle: "italic", fontSize: 12, textAlign: "left" }}>{hook}</span>
                <span style={{ ...STYLE.mono9, color: "rgba(255,255,255,0.45)" }}>{pct}</span>
              </button>
            );
          })}
          {hooks.length === 0 && (
            <div style={{ padding: "8px 14px", fontSize: 11, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
              FMLY hooks will appear here once generated.
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setCaptionMode("hook");
              setSelectedHookIdx(hooks.length);
              setOpenPanel(null);
              if (isMobile) setMobileTab("preview");
            }}
            style={{
              width: "100%",
              border: "none",
              background: captionMode === "hook" && selectedHookIdx >= hooks.length ? "rgba(68,210,126,0.06)" : "transparent",
              color: "rgba(255,255,255,0.56)",
              padding: "8px 14px",
              textAlign: "left",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            (no caption)
          </button>
        </SelectorCard>

        <SelectorCard
          label="Platform"
          tag={PLATFORMS[platformIdx].ratio}
          mainText={PLATFORMS[platformIdx].label}
          subTexts={[`${PLATFORMS[platformIdx].w}×${PLATFORMS[platformIdx].h}`]}
          isOpen={openPanel === "platform"}
          onToggle={() => setOpenPanel((curr) => (curr === "platform" ? null : "platform"))}
        >
          {PLATFORMS.map((platform, idx) => {
            const active = idx === platformIdx;
            return (
              <button
                key={platform.label}
                type="button"
                onClick={() => {
                  setPlatformIdx(idx);
                  setOpenPanel(null);
                  if (isMobile) setMobileTab("preview");
                }}
                style={{
                  ...STYLE.dropdownRow,
                  ...(active ? STYLE.activeRow : STYLE.inactiveRow),
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: active ? "#44d27e" : "rgba(255,255,255,0.25)" }} />
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.83)" }}>{platform.label}</span>
                </span>
                <span style={{ ...STYLE.mono9, color: "rgba(255,255,255,0.45)" }}>{platform.w}×{platform.h}</span>
              </button>
            );
          })}
        </SelectorCard>

        <SelectorCard
          label="Options"
          tag={optionsTag}
          mainText={optionsSummary}
          subTexts={[]}
          isOpen={openPanel === "options"}
          onToggle={() => setOpenPanel((curr) => (curr === "options" ? null : "options"))}
        >
          {([
            { label: "Audio", value: includeAudio, setter: setIncludeAudio },
            { label: "Credit", value: includeCredit, setter: setIncludeCredit },
            { label: "Progress wick", value: includeWickBar, setter: setIncludeWickBar },
            { label: "Beat bars", value: includeBeatVis, setter: setIncludeBeatVis },
            { label: "Fire reaction", value: includeFireReaction, setter: setIncludeFireReaction },
          ] as const).map(({ label, value, setter }, i, arr) => (
            <button
              key={label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                (setter as any)((v: boolean) => !v);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                border: "none",
                borderBottom: i < arr.length - 1 ? "0.5px solid rgba(255,255,255,0.04)" : "none",
                background: "transparent",
                cursor: "pointer",
                color: "inherit",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: value ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
                  transition: "color 0.15s",
                }}
              >
                {label}
              </span>
              <div
                style={{
                  width: 32,
                  height: 18,
                  borderRadius: 9,
                  background: value ? "#44d27e" : "rgba(255,255,255,0.08)",
                  transition: "background 0.2s",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    background: value ? "#fff" : "rgba(255,255,255,0.3)",
                    position: "absolute",
                    top: 2,
                    left: value ? 16 : 2,
                    transition: "left 0.2s, background 0.2s",
                  }}
                />
              </div>
            </button>
          ))}
        </SelectorCard>

        <div style={{ marginTop: "auto", padding: "0 16px", display: isMobile ? "none" : "flex", flexDirection: "column", gap: 10 }}>
          {exportStage === "ready" && (
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={!browserSupported}
              style={{
                width: "100%",
                height: 42,
                ...STYLE.greenButton,
                cursor: browserSupported ? "pointer" : "not-allowed",
                opacity: browserSupported ? 1 : 0.5,
              }}
            >
              Download for {PLATFORMS[platformIdx].label.split(" / ")[0]}
            </button>
          )}
          {exportStage === "ready" && (
            <div style={{ ...STYLE.mono9, color: "rgba(255,255,255,0.18)", textAlign: "center", marginTop: -6 }}>
              {PLATFORMS[platformIdx].w}×{PLATFORMS[platformIdx].h} · {Math.round(((activeSelection?.moment.endSec ?? 0) - (activeSelection?.moment.startSec ?? 0)) || durationSec)}s
            </div>
          )}

          {exportStage === "rendering" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>Rendering {Math.round(exportProgress)}%</div>
              <div style={{ width: "100%", height: 6, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                <div style={{ width: `${Math.round(exportProgress)}%`, height: "100%", background: "#44d27e" }} />
              </div>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                style={{ border: "1px solid rgba(255,255,255,0.16)", background: "transparent", color: "rgba(255,255,255,0.72)", borderRadius: 10, height: 34, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          )}

          {exportStage === "done" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" onClick={() => downloadBlob && triggerDownload(downloadBlob)} style={{ width: "100%", height: 40, borderRadius: 12, border: "none", background: "#44d27e", color: "#06170e", fontWeight: 800, cursor: "pointer" }}>
                Download again
              </button>
              <button type="button" onClick={onClose} style={{ width: "100%", height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "rgba(255,255,255,0.82)", cursor: "pointer" }}>
                Close
              </button>
            </div>
          )}

          {exportStage === "error" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ color: "#ffadad", fontSize: 12 }}>Export failed. Retry.</div>
              <button type="button" onClick={() => void handleDownload()} style={{ width: "100%", height: 40, borderRadius: 12, border: "none", background: "#44d27e", color: "#06170e", fontWeight: 800, cursor: "pointer" }}>
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          background: "#060608",
          display: isMobile && mobileTab !== "preview" ? "none" : "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? 16 : 24,
          minWidth: 0,
        }}
      >
        <div
          style={{
            aspectRatio: aspectRatios[platformIdx],
            maxHeight: maxPreviewHeights[platformIdx],
            width: "auto",
            height: "100%",
            maxWidth: "100%",
            borderRadius: 12,
            overflow: "hidden",
            position: "relative",
            transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
            willChange: "width, height",
            background: "#000",
          }}
        >
          <canvas ref={previewCanvasRef} style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }} />
          {includeCredit && artistName && (
            <div
              style={{
                position: "absolute",
                top: platformIdx === 0 ? "8%" : "6%",
                left: platformIdx === 0 ? "5%" : "8%",
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                borderRadius: 999,
                padding: "4px 10px 4px 4px",
                zIndex: 2,
                pointerEvents: "none",
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.15)",
                  }}
                />
              )}
              <span
                style={{
                  fontSize: 9,
                  fontFamily: '"SF Mono", monospace',
                  color: "rgba(255,255,255,0.8)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 160,
                }}
              >
                {artistName} · {songTitle}
              </span>
            </div>
          )}
          {activeCaption && captionStyle !== "none" && (
            captionStyle === "pill" ? (
              <div
                style={{
                  position: "absolute",
                  ...(captionCss.top !== undefined ? { top: captionCss.top } : {}),
                  ...(captionCss.bottom !== undefined ? { bottom: captionCss.bottom } : {}),
                  left: captionCss.left ?? 0,
                  right: captionCss.right ?? 0,
                  display: "flex",
                  justifyContent: captionCss.textAlign === "left" ? "flex-start" : "center",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              >
                <span
                  style={{
                    ...captionCss,
                    position: "relative",
                    top: "auto",
                    bottom: "auto",
                    left: "auto",
                    right: "auto",
                  }}
                >
                  {activeCaption}
                </span>
              </div>
            ) : (
              <div style={captionCss}>{activeCaption}</div>
            )
          )}
        </div>
      </div>
      {isMobile && exportStage === "ready" && (
        <div
          style={{
            flexShrink: 0,
            padding: "10px 16px",
            paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
            borderTop: "0.5px solid rgba(255,255,255,0.06)",
            display: "flex",
            gap: 8,
            alignItems: "stretch",
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={!browserSupported}
              style={{
                width: "100%",
                height: 40,
                ...STYLE.greenButton,
                fontSize: 13,
                cursor: browserSupported ? "pointer" : "not-allowed",
                opacity: browserSupported ? 1 : 0.5,
              }}
            >
              Download for {PLATFORMS[platformIdx].label.split(" / ")[0]}
            </button>
            <div style={{ ...STYLE.mono9, color: "rgba(255,255,255,0.18)", textAlign: "center", marginTop: 4 }}>
              {PLATFORMS[platformIdx].w}×{PLATFORMS[platformIdx].h} · {Math.round(((activeSelection?.moment.endSec ?? 0) - (activeSelection?.moment.startSec ?? 0)) || durationSec)}s
            </div>
          </div>
        </div>
      )}
      {isMobile && exportStage !== "ready" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 30,
            background: "rgba(10,10,10,0.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 32,
          }}
        >
          {exportStage === "rendering" && (
            <>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Rendering {Math.round(exportProgress)}%</div>
              <div style={{ width: "60%", height: 6, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                <div style={{ width: `${Math.round(exportProgress)}%`, height: "100%", background: "#44d27e", transition: "width 0.3s" }} />
              </div>
              <button type="button" onClick={() => abortRef.current?.abort()} style={{ border: "1px solid rgba(255,255,255,0.16)", background: "transparent", color: "rgba(255,255,255,0.72)", borderRadius: 10, height: 36, padding: "0 20px", cursor: "pointer" }}>
                Cancel
              </button>
            </>
          )}
          {exportStage === "done" && (
            <>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Done</div>
              <button type="button" onClick={() => downloadBlob && triggerDownload(downloadBlob)} style={{ height: 40, borderRadius: 12, border: "none", background: "#44d27e", color: "#06170e", fontWeight: 800, padding: "0 28px", cursor: "pointer" }}>
                Download again
              </button>
              <button type="button" onClick={onClose} style={{ height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "rgba(255,255,255,0.82)", padding: "0 28px", cursor: "pointer" }}>
                Close
              </button>
            </>
          )}
          {exportStage === "error" && (
            <>
              <div style={{ color: "#ffadad", fontSize: 13 }}>Export failed</div>
              <button type="button" onClick={() => void handleDownload()} style={{ height: 40, borderRadius: 12, border: "none", background: "#44d27e", color: "#06170e", fontWeight: 800, padding: "0 28px", cursor: "pointer" }}>
                Retry
              </button>
            </>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

export type { ExportStudioProps };

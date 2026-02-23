import { useMemo, useState, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export interface SceneManifest {
  palette: string[];
  contrastMode: "brutal" | "soft" | "neon" | "ghost" | "raw";
  backgroundIntensity: number;
  lightSource: string;
}

export const COMPOSITING_DECISION_TABLE: Record<SceneManifest["contrastMode"], { maskOpacity: number; bloomIntensity: number; vignetteStrength: number }> = {
  brutal: { maskOpacity: 0.0, bloomIntensity: 0.05, vignetteStrength: 0.5 },
  soft: { maskOpacity: 0.55, bloomIntensity: 0.15, vignetteStrength: 0.35 },
  neon: { maskOpacity: 0.35, bloomIntensity: 0.25, vignetteStrength: 0.45 },
  ghost: { maskOpacity: 0.65, bloomIntensity: 0.08, vignetteStrength: 0.6 },
  raw: { maskOpacity: 0.15, bloomIntensity: 0.06, vignetteStrength: 0.4 },
};

interface LyricStageProps {
  manifest: SceneManifest;
  backgroundImageUrl: string | null;
  isPlaying: boolean;
  beatIntensity: number;
  currentLyricZone: "upper" | "middle" | "lower";
  children: ReactNode;
}

function BackgroundPlaceholder({ manifest }: { manifest: SceneManifest }) {
  const sourceAnchor = manifest.lightSource.includes("left")
    ? "20% 40%"
    : manifest.lightSource.includes("right")
      ? "80% 40%"
      : manifest.lightSource.includes("below")
        ? "50% 100%"
        : "50% 0%";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(ellipse 120% 80% at ${sourceAnchor}, ${manifest.palette[1] ?? "#6b7280"}80, ${manifest.palette[0] ?? "#111827"} 70%)`,
        animation: "palettePulse 3s ease-in-out infinite",
      }}
    />
  );
}

export function LyricStage({ manifest, backgroundImageUrl, isPlaying, beatIntensity, currentLyricZone, children }: LyricStageProps) {
  const isMobile = useIsMobile();
  const [imageLoaded, setImageLoaded] = useState(false);

  const directionKeyframes = useMemo(() => {
    if (manifest.lightSource.includes("flickering left")) return "kenBurnsRight";
    if (manifest.lightSource.includes("golden hour")) return "kenBurnsLeft";
    return "kenBurns";
  }, [manifest.lightSource]);

  const contrast = COMPOSITING_DECISION_TABLE[manifest.contrastMode] ?? COMPOSITING_DECISION_TABLE.raw;
  const maskOpacity = Math.min(0.3, contrast.maskOpacity + (isMobile ? 0.15 : 0));
  const bloomScale = (isMobile ? 0.75 : 1) * (1 + beatIntensity * 0.15);
  const bloomOpacity = contrast.bloomIntensity + beatIntensity * 0.12;
  const vignetteInner = isMobile ? 60 : 75;

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 90 }}>
      <style>{`
        @keyframes kenBurns { from { transform: scale(1) translate(0,0); } to { transform: scale(1.08) translate(-1%, -1%); } }
        @keyframes kenBurnsLeft { from { transform: scale(1) translate(0,0); } to { transform: scale(1.08) translate(2%, -1%); } }
        @keyframes kenBurnsRight { from { transform: scale(1) translate(0,0); } to { transform: scale(1.08) translate(-2%, -1%); } }
        @keyframes palettePulse { 0%,100% { opacity: 0.8; } 50% { opacity: 1; } }
      `}</style>

      <BackgroundPlaceholder manifest={manifest} />

      {backgroundImageUrl && (
        <div
          className="lyric-stage__background"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            animation: isPlaying ? `${directionKeyframes} var(--song-duration, 120s) linear forwards` : "none",
            opacity: imageLoaded ? 1 : 0,
            transition: "opacity 1.5s ease",
          }}
        >
          <img
            src={backgroundImageUrl}
            onLoad={() => setImageLoaded(true)}
            alt="Lyric scene"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 70%",
              filter: `brightness(${0.6 + manifest.backgroundIntensity * 0.25})`,
            }}
          />
        </div>
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 80% 45% at 50% ${currentLyricZone === "upper" ? "25%" : currentLyricZone === "middle" ? "50%" : "72%"}, rgba(0,0,0,${maskOpacity * 0.75}), rgba(0,0,0,${maskOpacity * 0.3}) 65%, transparent 100%)`,
          transition: "background 0.8s ease",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse ${60 * bloomScale}% ${35 * bloomScale}% at 50% 50%, ${(manifest.palette[2] ?? "#ffffff")}${Math.round(Math.min(0.9, bloomOpacity) * 255).toString(16).padStart(2, "0")}, transparent 70%)`,
          opacity: 0.4,
          transition: "all 0.1s ease",
          pointerEvents: "none",
        }}
      />

      <div
        className="lyric-stage__canvas-layer"
        style={{ position: "absolute", inset: 0, isolation: "isolate" }}
      >
        {children}
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse ${vignetteInner}% ${vignetteInner}% at 50% 50%, transparent 50%, rgba(0,0,0,${contrast.vignetteStrength}) 80%, rgba(0,0,0,0.75) 100%)`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

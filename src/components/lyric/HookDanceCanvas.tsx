import { useState, useRef, useEffect, useCallback, useMemo, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X, Play, Pause, Download, Settings2, Sparkles } from "lucide-react";
import type { PhysicsSpec, PhysicsState } from "@/engine/PhysicsIntegrator";
import { HookDanceEngine } from "@/engine/HookDanceEngine";
import { classifyWord } from "@/engine/WordClassifier";
import { DirectionInterpreter } from "@/engine/DirectionInterpreter";
import type { CinematicDirection, CinematicSection, WordDirective } from "@/types/CinematicDirection";
import type { LyricLine } from "./LyricDisplay";
import { HookDanceControls, type HookDanceOverrides } from "./HookDanceControls";
import { ArtistFingerprintButton } from "./ArtistFingerprintButton";
import { FingerprintOnboarding } from "./FingerprintOnboarding";
import { FingerprintConfirmation } from "./FingerprintConfirmation";
import { FingerprintSummary } from "./FingerprintSummary";
import type { ArtistDNA, FingerprintSongContext } from "./ArtistFingerprintTypes";

interface Props {
  physicsState: PhysicsState | null;
  spec: PhysicsSpec;
  lines: LyricLine[];
  hookStart: number;
  hookEnd: number;
  currentTime: number;
  beatCount: number;
  prng: () => number;
  onClose: () => void;
  onExport?: () => void;
  onOverrides?: (overrides: HookDanceOverrides) => void;
  fingerprint?: ArtistDNA | null;
  onFingerprintChange?: (dna: ArtistDNA | null) => void;
  songContext?: FingerprintSongContext;
  hookDirection?: {
    thesis: string;
    sections?: CinematicSection[];
    wordDirectives?: WordDirective[] | Record<string, WordDirective>;
    emotionalArc?: string;
  } | null;
}

export const HookDanceCanvas = forwardRef<HTMLDivElement, Props>(function HookDanceCanvas({
  physicsState,
  spec,
  lines,
  hookStart,
  hookEnd,
  currentTime,
  beatCount,
  prng,
  onClose,
  onExport,
  onOverrides,
  fingerprint,
  onFingerprintChange,
  songContext,
  hookDirection,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [showFingerprintOnboarding, setShowFingerprintOnboarding] = useState(false);
  const [showFingerprintConfirmation, setShowFingerprintConfirmation] = useState(false);
  const [pendingFingerprint, setPendingFingerprint] = useState<ArtistDNA | null>(null);
  const [showFingerprintSummary, setShowFingerprintSummary] = useState(false);

  const [activePalette, setActivePalette] = useState(spec.palette);
  const [activeSystem, setActiveSystem] = useState(spec.system);
  const [editorBeatIntensity, setEditorBeatIntensity] = useState(0);
  const currentTimeRef = useRef(currentTime);
  const linesRef = useRef(lines);
  const physicsStateRef = useRef(physicsState);
  const specRef = useRef(spec);
  const hookStartRef = useRef(hookStart);
  const hookEndRef = useRef(hookEnd);
  const prngRef = useRef(prng);
  const directionInterpreterRef = useRef<DirectionInterpreter | null>(null);
  const hookDirectionRef = useRef(hookDirection);
  const editorBeatIntensityRef = useRef(editorBeatIntensity);

  const activePaletteRef = useRef(activePalette);
  const activeSystemRef = useRef(activeSystem);
  activePaletteRef.current = activePalette;
  activeSystemRef.current = activeSystem;
  currentTimeRef.current = currentTime;
  linesRef.current = lines;
  physicsStateRef.current = physicsState;
  specRef.current = spec;
  hookStartRef.current = hookStart;
  hookEndRef.current = hookEnd;
  prngRef.current = prng;
  hookDirectionRef.current = hookDirection;
  editorBeatIntensityRef.current = editorBeatIntensity;

  const directionInterpreter = useMemo(() => {
    if (!hookDirection) return null;

    const sections: CinematicSection[] = hookDirection.sections?.length
      ? hookDirection.sections
      : [{ sectionIndex: 0, description: "Hook", startRatio: 0, endRatio: 1 }];

    const wordDirectivesArray: WordDirective[] = Array.isArray(hookDirection.wordDirectives)
      ? hookDirection.wordDirectives
      : Object.values(hookDirection.wordDirectives || {});

    return new DirectionInterpreter({
      sceneTone: "dark",
      atmosphere: "cinematic",
      motion: "fluid",
      typography: "clean-modern",
      texture: "dust",
      emotionalArc: hookDirection.emotionalArc ?? "slow-burn",
      sections,
      wordDirectives: wordDirectivesArray,
      storyboard: [],
      thesis: hookDirection.thesis,
    } as CinematicDirection, Math.max(0.001, hookEnd - hookStart));
  }, [hookDirection, hookEnd, hookStart]);
  directionInterpreterRef.current = directionInterpreter;

  // Resize canvas to fill container
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const debugRef = useRef<any>({});

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;

    let raf = 0;
    const render = () => {
      if (document.hidden) {
        raf = requestAnimationFrame(render);
        return;
      }

      const currentPhysicsState = physicsStateRef.current;
      const currentSpec = specRef.current;
      const localCurrentTime = currentTimeRef.current;
      const currentLines = linesRef.current;
      const currentHookStart = hookStartRef.current;
      const currentHookEnd = hookEndRef.current;
      const currentPrng = prngRef.current;
      const currentDirectionInterpreter = directionInterpreterRef.current;
      const currentHookDirection = hookDirectionRef.current;

      const ps = currentPhysicsState || {
        offsetX: 0, offsetY: 0, rotation: 0, scale: 1,
        velocity: 0, position: 0, blur: 0,
        shake: 0, glow: 0, heat: 0, safeOffset: 0, shatter: 0,
        isFractured: false, wordOffsets: [],
      };

      const sp = { ...currentSpec, palette: activePaletteRef.current, system: activeSystemRef.current };
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);

        ctx.clearRect(0, 0, width, height);

        // Background
        const palette = sp.palette || ["#000", "#fff", "#888"];
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, palette[0]);
        gradient.addColorStop(1, palette[4] || palette[0]);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Words
        ctx.save();
        ctx.translate(width / 2, height / 2);

        const scale = ps.scale;
        ctx.scale(scale, scale);
        ctx.rotate(ps.rotation);
        ctx.translate(ps.offsetX, ps.offsetY);

        const activeLineIndex = currentLines.findIndex(l => localCurrentTime >= l.start && localCurrentTime < l.end);
        const activeLine = currentLines[activeLineIndex];

        const effectKey = "STATIC_RESOLVE";
        const drawFn = (c: CanvasRenderingContext2D, s: any) => {
          c.fillStyle = palette[2];
          c.font = "bold 48px Inter";
          c.textAlign = "center";
          c.fillText(s.text, 0, 0);
        };

        const wordColors = activeLine?.text.split(" ").map(w => {
          const cls = classifyWord(w);
          if (cls === "IMPACT") return palette[1];
          if (cls === "TENDER") return palette[3] || palette[2];
          return palette[2];
        }) || [];

        const effectState = {
          text: activeLine?.text || "",
          physState: ps,
          w: width,
          h: height,
          fs: 48,
          age: activeLine ? localCurrentTime - activeLine.start : 0,
          progress: activeLine ? (localCurrentTime - activeLine.start) / (activeLine.end - activeLine.start) : 0,
          rng: currentPrng,
          palette,
          system: sp.system,
          alphaMultiplier: 1,
          wordColors,
        };

        drawFn(ctx, effectState);
        ctx.restore();

        // Debug state
        const di = currentDirectionInterpreter;
        const songProg01 = Math.max(0, Math.min(1, (localCurrentTime - currentHookStart) / Math.max(0.001, currentHookEnd - currentHookStart)));
        const currentSection = di?.getCurrentSection(songProg01);
        const sectionProgress = currentSection
          ? (songProg01 - (currentSection.startRatio ?? 0)) / Math.max(0.001, (currentSection.endRatio ?? 1) - (currentSection.startRatio ?? 0))
          : 0;
        const lineDir = di?.getLineDirection(activeLineIndex);
        const wordsInLine = (activeLine?.text || "").split(/\s+/);
        const heroWordText = lineDir?.heroWord ?? wordsInLine.find(w => classifyWord(w) !== "FILLER" && classifyWord(w) !== "NEUTRAL") ?? wordsInLine[0] ?? "—";

        debugRef.current = {
          beatIntensity: editorBeatIntensityRef.current,
          physGlow: ps.heat * 0.6,
          heat: sp.params?.heat ?? 0,
          offsetX: ps.offsetX,
          offsetY: ps.offsetY,
          rotation: ps.rotation,
          scale: ps.scale,
          shake: ps.shake,
          effectKey,
          dirThesis: currentHookDirection?.thesis ?? "—",
          dirChapter: currentSection?.description ?? "—",
          dirChapterProgress: sectionProgress,
          dirIntensity: currentSection ? di?.getIntensity(songProg01) : 0,
          wordDirectiveWord: heroWordText,
          wordDirectiveBehavior: di?.getWordDirective(heroWordText)?.behavior ?? "—",
          wordDirectiveEntry: di?.getWordDirective(heroWordText)?.entry ?? "—",
          wordDirectiveEmphasis: di?.getWordDirective(heroWordText)?.emphasisLevel ?? 0,
          wordDirectiveExit: di?.getWordDirective(heroWordText)?.exit ?? "—",
          wordDirectiveGhostTrail: di?.getWordDirective(heroWordText)?.ghostTrail ?? false,
          wordDirectiveGhostDir: di?.getWordDirective(heroWordText)?.ghostDirection ?? "—",
        };
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [isPlaying]);

  const handleOverrides = useCallback((overrides: HookDanceOverrides) => {
    if (overrides.palette) setActivePalette(overrides.palette);
    if (overrides.system) setActiveSystem(overrides.system);
    if (onOverrides) onOverrides(overrides);
  }, [onOverrides]);

  return (
    <div ref={ref} className="relative w-full h-full bg-black overflow-hidden rounded-xl shadow-2xl border border-white/10 group">
      <div ref={containerRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* Play/Pause overlay */}
      <div
        className="absolute inset-0 flex items-center justify-center cursor-pointer"
        onClick={() => setIsPlaying(!isPlaying)}
      >
        {!isPlaying && (
          <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg animate-in fade-in zoom-in duration-200">
            <Play className="w-10 h-10 text-white fill-current ml-1" />
          </div>
        )}
      </div>

      {/* Controls Toggle */}
      <div className="absolute bottom-6 right-6 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {onExport && (
          <Button
            size="icon"
            variant="secondary"
            className="w-10 h-10 rounded-full bg-black/60 backdrop-blur border border-white/10 hover:bg-white/20"
            onClick={onExport}
          >
            <Download className="w-4 h-4 text-white" />
          </Button>
        )}
        <Button
          size="icon"
          variant="secondary"
          className={`w-10 h-10 rounded-full backdrop-blur border border-white/10 transition-all ${
            showControls ? "bg-primary text-primary-foreground" : "bg-black/60 text-white hover:bg-white/20"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setShowControls(!showControls);
          }}
        >
          <Settings2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Artist Fingerprint Badge */}
      <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <ArtistFingerprintButton
          elapsedSeconds={currentTime - hookStart}
          fingerprint={fingerprint ?? null}
          onStartOnboarding={() => setShowFingerprintOnboarding(true)}
          onViewSummary={() => setShowFingerprintSummary(true)}
        />
      </div>

      {/* Controls Panel */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute top-0 right-0 bottom-0 w-80 bg-black/90 backdrop-blur-xl border-l border-white/10 p-6 shadow-2xl z-20 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Vibe Controls
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/50 hover:text-white"
                onClick={() => setShowControls(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <HookDanceControls
              currentSystem={activeSystem}
              currentPalette={activePalette}
              overrides={{
                palette: activePalette,
                system: activeSystem,
              }}
              onChange={handleOverrides}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fingerprint Onboarding */}
      {showFingerprintOnboarding && songContext && (
        <FingerprintOnboarding
          songContext={songContext}
          onGenerated={(dna) => {
            setPendingFingerprint(dna);
            setShowFingerprintOnboarding(false);
            setShowFingerprintConfirmation(true);
          }}
          onClose={() => setShowFingerprintOnboarding(false)}
        />
      )}

      {/* Fingerprint Confirmation */}
      {showFingerprintConfirmation && pendingFingerprint && (
        <FingerprintConfirmation
          dna={pendingFingerprint}
          onLockIn={() => {
            if (onFingerprintChange && pendingFingerprint) {
              onFingerprintChange(pendingFingerprint);
            }
            setShowFingerprintConfirmation(false);
            setPendingFingerprint(null);
          }}
          onStartOver={() => {
            setShowFingerprintConfirmation(false);
            setShowFingerprintOnboarding(true);
          }}
        />
      )}

      {/* Fingerprint Summary */}
      {showFingerprintSummary && fingerprint && (
        <FingerprintSummary
          dna={fingerprint}
          onClose={() => setShowFingerprintSummary(false)}
          onReset={() => {
            setShowFingerprintSummary(false);
            if (onFingerprintChange) onFingerprintChange(null);
          }}
        />
      )}
    </div>
  );
});

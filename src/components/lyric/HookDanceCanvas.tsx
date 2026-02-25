import { useState, useRef, useEffect, useCallback, useMemo, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X, Play, Pause, Download, Settings2, Sparkles, RefreshCcw, Wand2, Music2, Type, Layout, Fingerprint } from "lucide-react";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import { PhysicsIntegrator } from "@/engine/PhysicsIntegrator";
import { HookDanceEngine, type PhysicsState } from "@/engine/HookDanceEngine";
import { classifyWord, getElementalClass } from "@/engine/WordClassifier";
import { DirectionInterpreter } from "@/engine/DirectionInterpreter";
import type { CinematicDirection, Chapter, ClimaxDirective, VisualWorld, WordDirective, CinematicSection } from "@/types/CinematicDirection";
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
  lines: LyricLine[];       // hook-region lines
  hookStart: number;
  hookEnd: number;
  currentTime: number;
  beatCount: number;
  prng: () => number;
  onClose: () => void;
  onExport?: () => void;
  onOverrides?: (overrides: HookDanceOverrides) => void;
  /** Artist fingerprint for visual identity */
  fingerprint?: ArtistDNA | null;
  /** Called when fingerprint is created/reset */
  onFingerprintChange?: (dna: ArtistDNA | null) => void;
  /** Song context for fingerprint generation */
  songContext?: FingerprintSongContext;
  /** Optional cinematic direction subset for hook timeframe */
  hookDirection?: {
    thesis: string;
    visualWorld: VisualWorld;
    wordDirectives: Record<string, WordDirective>;
    climax: ClimaxDirective;
    activeChapter?: Chapter;
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
  const engineRef = useRef<HookDanceEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [showFingerprintOnboarding, setShowFingerprintOnboarding] = useState(false);
  const [showFingerprintConfirmation, setShowFingerprintConfirmation] = useState(false);
  const [pendingFingerprint, setPendingFingerprint] = useState<ArtistDNA | null>(null);
  const [showFingerprintSummary, setShowFingerprintSummary] = useState(false);

  // Active overrides from controls
  const [activePalette, setActivePalette] = useState(spec.palette);
  const [activeSystem, setActiveSystem] = useState(spec.system);
  const [editorBeatIntensity, setEditorBeatIntensity] = useState(0);

  // Keep palette/system in refs too
  const activePaletteRef = useRef(activePalette);
  const activeSystemRef = useRef(activeSystem);
  activePaletteRef.current = activePalette;
  activeSystemRef.current = activeSystem;

  const directionInterpreter = useMemo(() => {
    if (!hookDirection || !hookDirection.activeChapter) return null;
    // Map activeChapter (old format) to new format sections array
    // This is a minimal bridge to satisfy the new DirectionInterpreter
    const section: CinematicSection = {
      sectionIndex: 0,
      description: hookDirection.activeChapter.title,
      startRatio: hookDirection.activeChapter.startRatio ?? 0,
      endRatio: hookDirection.activeChapter.endRatio ?? 1,
      // Map old fields to new fields
      motion: "fluid", // Default, will be derived from physics in resolver
      typography: "clean-modern",
      atmosphere: "cinematic",
      texture: "dust"
    };

    // Convert Record<string, WordDirective> back to array for new interpreter
    const wordDirectivesArray: WordDirective[] = Object.values(hookDirection.wordDirectives || {});

    return new DirectionInterpreter({
      // New schema fields
      sceneTone: "dark",
      atmosphere: "cinematic",
      motion: "fluid",
      typography: "clean-modern",
      texture: "dust",
      emotionalArc: "slow-burn",
      sections: [section],
      wordDirectives: wordDirectivesArray,
      storyboard: [],
      // Kept for type compat if needed
      thesis: hookDirection.thesis,
      climax: hookDirection.climax,
    } as CinematicDirection, Math.max(0.001, hookEnd - hookStart));
  }, [hookDirection, hookEnd, hookStart]);

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

  // Initialize engine
  useEffect(() => {
    if (!canvasRef.current) return;
    engineRef.current = new HookDanceEngine(canvasRef.current, spec);
    return () => {
      engineRef.current?.dispose();
    };
  }, [spec]);

  const debugRef = useRef<any>({});

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;

    let raf: number;
    const render = () => {
      if (!isPlaying) {
        raf = requestAnimationFrame(render);
        return;
      }

      const ps = physicsState || {
        offsetX: 0, offsetY: 0, rotation: 0, scale: 1,
        velocity: { x: 0, y: 0, rotation: 0, scale: 0 },
        shake: 0, glow: 0, heat: 0
      };

      // Apply override palette
      const sp = { ...spec, palette: activePaletteRef.current, system: activeSystemRef.current };

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

        // System background
        engine.drawBackground(width, height, currentTime, beatCount, sp);

        // Words
        ctx.save();
        ctx.translate(width / 2, height / 2);

        // Apply physics transform
        const scale = ps.scale;
        ctx.scale(scale, scale);
        ctx.rotate(ps.rotation);
        ctx.translate(ps.offsetX, ps.offsetY);

        // Determine active line
        const activeLineIndex = lines.findIndex(l => currentTime >= l.start && currentTime < l.end);
        const activeLine = lines[activeLineIndex];

        // Animate line text
        const lineAnim = {
          entryProgress: activeLine ? Math.min(1, (currentTime - activeLine.start) / 0.3) : 0,
          exitProgress: activeLine ? Math.max(0, (currentTime - (activeLine.end - 0.3)) / 0.3) : 0,
          beatMultiplier: 1 + ps.shake * 0.5,
          activeMod: null,
          isHookLine: true,
          fontScale: 1,
          scale: 1,
          lineColor: palette[2]
        };

        const effectKey = "STATIC_RESOLVE"; // Placeholder
        const drawFn = (c: CanvasRenderingContext2D, s: any) => {
          // Placeholder for real draw function
          c.fillStyle = palette[2];
          c.font = "bold 48px Inter";
          c.textAlign = "center";
          c.fillText(s.text, 0, 0);
        };

        const activeWordIndex = 0; // Simplified
        const compositeAlpha = 1; // Simplified

        // Word coloring
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
          age: activeLine ? currentTime - activeLine.start : 0,
          progress: activeLine ? (currentTime - activeLine.start) / (activeLine.end - activeLine.start) : 0,
          rng: prng,
          palette,
          system: sp.system,
          alphaMultiplier: compositeAlpha,
          wordColors,
        };

        drawFn(ctx, effectState);
        ctx.restore();

        // Write debug state for HUD
        const di = directionInterpreter;
        const songProg01 = Math.max(0, Math.min(1, (currentTime - hookStart) / Math.max(0.001, hookEnd - hookStart)));
        
        // Use getCurrentSection instead of getCurrentChapter
        const currentSection = di?.getCurrentSection(songProg01);
        const sectionProgress = currentSection
          ? (songProg01 - (currentSection.startRatio ?? 0)) / Math.max(0.001, (currentSection.endRatio ?? 1) - (currentSection.startRatio ?? 0))
          : 0;
          
        const lineDir = di?.getLineDirection(activeLineIndex);
        const wordsInLine = (activeLine?.text || "").split(/\s+/);
        const heroWordText = lineDir?.heroWord ?? wordsInLine.find(w => classifyWord(w) !== "FILLER" && classifyWord(w) !== "NEUTRAL") ?? wordsInLine[0] ?? "—";
        
        debugRef.current = {
          beatIntensity: editorBeatIntensity,
          physGlow: ps.heat * 0.6,
          heat: sp.params?.heat ?? 0,
          offsetX: ps.offsetX,
          offsetY: ps.offsetY,
          rotation: ps.rotation,
          scale: ps.scale,
          shake: ps.shake,
          effectKey,
          entryProgress: lineAnim.entryProgress,
          exitProgress: lineAnim.exitProgress,
          activeMod: null,
          fontScale: 1,
          lineColor: palette[2],
          isHookLine: true,
          repIndex: 0,
          repTotal: 1,
          wordCount: lines.length,
          // Direction debug
          dirThesis: hookDirection?.thesis ?? "—",
          dirChapter: currentSection?.description ?? "—",
          dirChapterProgress: sectionProgress,
          dirIntensity: currentSection ? di?.getIntensity(songProg01) : 0,
          wordDirectiveWord: heroWordText,
          wordDirectiveKinetic: di?.getWordDirective(heroWordText)?.kineticClass ?? "—",
          wordDirectiveElemental: di?.getWordDirective(heroWordText)?.elementalClass ?? "—",
          wordDirectiveEmphasis: di?.getWordDirective(heroWordText)?.emphasisLevel ?? 0,
        };
      }

      raf = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, lines, hookStart, hookEnd, beatCount, physicsState, spec, currentTime, prng, directionInterpreter, hookDirection, editorBeatIntensity]);

  // Handle overrides
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
          dna={fingerprint}
          onClick={() => {
            if (fingerprint) {
              setShowFingerprintSummary(true);
            } else {
              setShowFingerprintOnboarding(true);
            }
          }}
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
              overrides={{
                palette: activePalette,
                system: activeSystem,
              }}
              onChange={handleOverrides}
              onBeatIntensityChange={setEditorBeatIntensity}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fingerprint Onboarding Modal */}
      <FingerprintOnboarding 
        open={showFingerprintOnboarding} 
        onOpenChange={setShowFingerprintOnboarding}
        songContext={songContext}
        onComplete={(dna) => {
          setPendingFingerprint(dna);
          setShowFingerprintOnboarding(false);
          setShowFingerprintConfirmation(true);
        }}
      />

      {/* Fingerprint Confirmation Modal */}
      <FingerprintConfirmation
        open={showFingerprintConfirmation}
        onOpenChange={setShowFingerprintConfirmation}
        dna={pendingFingerprint}
        onConfirm={() => {
          if (onFingerprintChange && pendingFingerprint) {
            onFingerprintChange(pendingFingerprint);
          }
          setShowFingerprintConfirmation(false);
          setPendingFingerprint(null);
        }}
        onRetake={() => {
          setShowFingerprintConfirmation(false);
          setShowFingerprintOnboarding(true);
        }}
      />

      {/* Fingerprint Summary Modal */}
      <FingerprintSummary
        open={showFingerprintSummary}
        onOpenChange={setShowFingerprintSummary}
        dna={fingerprint}
        onRetake={() => {
          setShowFingerprintSummary(false);
          setShowFingerprintOnboarding(true);
        }}
      />
    </div>
  );
});

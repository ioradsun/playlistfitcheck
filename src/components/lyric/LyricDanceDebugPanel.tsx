import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bug, ChevronDown, ChevronRight, Copy, X } from "lucide-react";
import { toast } from "sonner";

import type { SceneManifest } from "@/engine/SceneManifest";
import type { CinematicDirection } from "@/types/CinematicDirection";
import type { LyricLine } from "./LyricDisplay";

interface DebugData {
  songDna: {
    mood?: string;
    description?: string;
    meaning?: { theme?: string; summary?: string; imagery?: string[] };
    hook?: { start: number; end: number; previewText?: string } | null;
    secondHook?: { start: number; end: number; previewText?: string } | null;
    hookLabel?: string;
    secondHookLabel?: string;
    hookJustification?: string;
    secondHookJustification?: string;
    physicsSpec?: Record<string, unknown> | null;
    scene_manifest?: SceneManifest | null;
    cinematic_direction?: CinematicDirection | null;
  } | null;
  beatGrid: { bpm: number; beats: number[]; confidence: number } | null;
  lines: LyricLine[];
  title: string;
  artist: string;
  overrides: Record<string, unknown>;
  fingerprint: unknown;
}

interface Props {
  data: DebugData;
}

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/20 last:border-b-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-1.5 py-2 text-left text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {open && <div className="pb-3 pl-4">{children}</div>}
    </div>
  );
}

function JsonBlock({ value, label }: { value: unknown; label?: string }) {
  const json = JSON.stringify(value, null, 2);
  return (
    <div className="relative group">
      {label && <p className="text-[10px] font-mono text-muted-foreground/60 mb-1">{label}</p>}
      <pre className="text-[10px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-all bg-background/50 rounded p-2 max-h-[300px] overflow-auto">
        {json}
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(json); toast.success("Copied to clipboard"); }}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-background/80 text-muted-foreground hover:text-foreground"
      >
        <Copy size={10} />
      </button>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value == null) return null;
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span className="font-mono text-muted-foreground/60 shrink-0">{label}:</span>
      <span className="font-mono text-foreground break-all">{String(value)}</span>
    </div>
  );
}

export function LyricDanceDebugPanel({ data }: Props) {
  const [open, setOpen] = useState(false);
  const { songDna, beatGrid, lines, title, artist, overrides, fingerprint } = data;
  const spec = songDna?.physicsSpec;
  const manifest = songDna?.scene_manifest;
  const direction = songDna?.cinematic_direction;

  const copyAll = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast.success("Full debug data copied");
  };

  return (
    <>
      {/* Toggle button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 left-[calc(var(--sidebar-width,240px)+16px)] z-[90] flex items-center gap-1.5 rounded-full bg-background/90 backdrop-blur border border-border/40 px-3 py-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground shadow-lg transition-colors"
          title="Open debug panel"
        >
          <Bug size={12} />
          Debug
        </button>
      )}

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-0 left-0 bottom-0 z-[95] w-[380px] max-w-[90vw] bg-background/95 backdrop-blur-md border-r border-border/50 shadow-2xl overflow-y-auto"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-background/95 backdrop-blur p-3">
              <div className="flex items-center gap-2">
                <Bug size={14} className="text-primary" />
                <span className="text-xs font-mono font-semibold uppercase tracking-wider">Debug Panel</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={copyAll} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors" title="Copy all">
                  <Copy size={14} />
                </button>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors">
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-0">
              {/* Overview */}
              <CollapsibleSection title="Overview" defaultOpen>
                <div className="space-y-1">
                  <KV label="Title" value={title} />
                  <KV label="Artist" value={artist} />
                  <KV label="Lines" value={lines.length} />
                  <KV label="Non-adlib" value={lines.filter(l => l.tag !== "adlib").length} />
                  <KV label="Duration" value={lines.length > 0 ? `${lines[lines.length - 1].end.toFixed(1)}s` : "—"} />
                </div>
              </CollapsibleSection>

              {/* Song DNA — Mood & Meaning */}
              <CollapsibleSection title="Mood & Meaning">
                <div className="space-y-1">
                  <KV label="Mood" value={songDna?.mood} />
                  <KV label="Description" value={songDna?.description} />
                  <KV label="Theme" value={songDna?.meaning?.theme} />
                  <KV label="Summary" value={songDna?.meaning?.summary} />
                  {songDna?.meaning?.imagery && songDna.meaning.imagery.length > 0 && (
                    <div className="text-[11px]">
                      <span className="font-mono text-muted-foreground/60">Imagery:</span>
                      <ul className="ml-3 mt-0.5 space-y-0.5">
                        {songDna.meaning.imagery.map((img, i) => (
                          <li key={i} className="font-mono text-foreground/80 text-[10px]">• {img}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              {/* Hooks */}
              <CollapsibleSection title="Hooks">
                <div className="space-y-2">
                  {songDna?.hook ? (
                    <div className="space-y-1 rounded bg-background/50 p-2">
                      <p className="text-[10px] font-mono font-semibold text-primary">Primary Hook</p>
                      <KV label="Label" value={songDna.hookLabel} />
                      <KV label="Preview" value={songDna.hook.previewText} />
                      <KV label="Range" value={`${songDna.hook.start.toFixed(2)}s → ${songDna.hook.end.toFixed(2)}s`} />
                      <KV label="Duration" value={`${(songDna.hook.end - songDna.hook.start).toFixed(2)}s`} />
                      {songDna.hookJustification && <KV label="Why" value={songDna.hookJustification} />}
                    </div>
                  ) : <p className="text-[10px] text-muted-foreground">No hook detected</p>}
                  {songDna?.secondHook && (
                    <div className="space-y-1 rounded bg-background/50 p-2">
                      <p className="text-[10px] font-mono font-semibold text-primary/70">Secondary Hook</p>
                      <KV label="Label" value={songDna.secondHookLabel} />
                      <KV label="Preview" value={songDna.secondHook.previewText} />
                      <KV label="Range" value={`${songDna.secondHook.start.toFixed(2)}s → ${songDna.secondHook.end.toFixed(2)}s`} />
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              {/* Beat Grid */}
              <CollapsibleSection title="Beat Grid">
                {beatGrid ? (
                  <div className="space-y-1">
                    <KV label="BPM" value={beatGrid.bpm.toFixed(1)} />
                    <KV label="Total beats" value={beatGrid.beats.length} />
                    <KV label="Confidence" value={`${(beatGrid.confidence * 100).toFixed(0)}%`} />
                    <KV label="First beat" value={`${beatGrid.beats[0]?.toFixed(3)}s`} />
                    <KV label="Last beat" value={`${beatGrid.beats[beatGrid.beats.length - 1]?.toFixed(3)}s`} />
                  </div>
                ) : <p className="text-[10px] text-muted-foreground">No beat grid</p>}
              </CollapsibleSection>

              {/* Physics Spec */}
              <CollapsibleSection title="Physics Spec">
                {spec ? (
                  <JsonBlock value={spec} />
                ) : <p className="text-[10px] text-muted-foreground">No physics spec</p>}
              </CollapsibleSection>

              {/* Scene Manifest */}
              <CollapsibleSection title="Scene Manifest">
                {manifest ? (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <KV label="World" value={manifest.world} />
                      <KV label="Emotion" value={manifest.coreEmotion} />
                      <KV label="Gravity" value={manifest.gravity} />
                      <KV label="Tension" value={manifest.tension} />
                      <KV label="Decay" value={manifest.decay} />
                      <KV label="Light" value={manifest.lightSource} />
                      <KV label="Palette" value={manifest.palette?.join(", ")} />
                      <KV label="Contrast" value={manifest.contrastMode} />
                      <KV label="Letter" value={manifest.letterPersonality} />
                      <KV label="Stack" value={manifest.stackBehavior} />
                      <KV label="Beat" value={manifest.beatResponse} />
                      <KV label="Entrance" value={manifest.lyricEntrance} />
                      <KV label="Exit" value={manifest.lyricExit} />
                      <KV label="BG System" value={manifest.backgroundSystem} />
                      <KV label="BG Intensity" value={manifest.backgroundIntensity} />
                    </div>
                    {manifest.typographyProfile && <JsonBlock value={manifest.typographyProfile} label="Typography Profile" />}
                    {manifest.particleConfig && <JsonBlock value={manifest.particleConfig} label="Particle Config" />}
                  </div>
                ) : <p className="text-[10px] text-muted-foreground">No scene manifest</p>}
              </CollapsibleSection>

              {/* Cinematic Direction */}
              <CollapsibleSection title="Cinematic Direction">
                {direction ? (
                  <div className="space-y-2">
                    <KV label="Thesis" value={direction.thesis} />
                    <div className="space-y-1">
                      <p className="text-[10px] font-mono font-semibold text-muted-foreground/60">Visual World</p>
                      <KV label="BG System" value={direction.visualWorld?.backgroundSystem} />
                      <KV label="Light" value={direction.visualWorld?.lightSource} />
                      <KV label="Particles" value={direction.visualWorld?.particleSystem} />
                      <KV label="Palette" value={direction.visualWorld?.palette?.join(", ")} />
                      {direction.visualWorld?.typographyProfile && (
                        <KV label="Font" value={`${direction.visualWorld.typographyProfile.fontFamily} ${direction.visualWorld.typographyProfile.fontWeight} (${direction.visualWorld.typographyProfile.personality})`} />
                      )}
                      {direction.visualWorld?.physicsProfile && (
                        <div className="space-y-0.5">
                          <KV label="Weight" value={direction.visualWorld.physicsProfile.weight} />
                          <KV label="Chaos" value={direction.visualWorld.physicsProfile.chaos} />
                          <KV label="Heat" value={direction.visualWorld.physicsProfile.heat} />
                          <KV label="Beat" value={direction.visualWorld.physicsProfile.beatResponse} />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-mono font-semibold text-muted-foreground/60">Climax</p>
                      <KV label="Time" value={`${((direction.climax?.timeRatio ?? 0) * 100).toFixed(0)}%`} />
                      <KV label="Trigger" value={direction.climax?.triggerLine} />
                      <KV label="Transform" value={direction.climax?.worldTransformation} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-mono font-semibold text-muted-foreground/60">Ending</p>
                      <KV label="Style" value={direction.ending?.style} />
                      <KV label="Aftertaste" value={direction.ending?.emotionalAftertaste} />
                    </div>
                  </div>
                ) : <p className="text-[10px] text-muted-foreground">No cinematic direction</p>}
              </CollapsibleSection>

              {/* Chapters */}
              <CollapsibleSection title={`Chapters (${direction?.chapters?.length ?? 0})`}>
                {direction?.chapters && direction.chapters.length > 0 ? (
                  <div className="space-y-2">
                    {direction.chapters.map((ch, i) => (
                      <div key={i} className="rounded bg-background/50 p-2 space-y-0.5">
                        <p className="text-[10px] font-mono font-semibold text-primary">{ch.title}</p>
                        <KV label="Range" value={`${(ch.startRatio * 100).toFixed(0)}% → ${(ch.endRatio * 100).toFixed(0)}%`} />
                        <KV label="Arc" value={ch.emotionalArc} />
                        <KV label="Intensity" value={ch.emotionalIntensity} />
                        <KV label="Color" value={ch.dominantColor} />
                        <KV label="Light" value={ch.lightBehavior} />
                        <KV label="Particles" value={ch.particleDirective} />
                        <KV label="Background" value={ch.backgroundDirective} />
                        <KV label="Typography" value={ch.typographyShift} />
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[10px] text-muted-foreground">No chapters</p>}
              </CollapsibleSection>

              {/* Word Directives */}
              <CollapsibleSection title={`Word Directives (${Object.keys(direction?.wordDirectives ?? {}).length})`}>
                {direction?.wordDirectives && Object.keys(direction.wordDirectives).length > 0 ? (
                  <div className="max-h-[400px] overflow-auto space-y-1">
                    {Object.entries(direction.wordDirectives).map(([key, wd]) => (
                      <div key={key} className="flex flex-wrap gap-x-2 text-[10px] font-mono border-b border-border/10 pb-1">
                        <span className="text-primary font-semibold">{wd.word}</span>
                        {wd.kineticClass && <span className="text-foreground/70">K:{wd.kineticClass}</span>}
                        {wd.elementalClass && <span className="text-foreground/70">E:{wd.elementalClass}</span>}
                        <span className="text-muted-foreground/60">emp:{wd.emphasisLevel}</span>
                        {wd.colorOverride && <span className="text-muted-foreground/60">clr:{wd.colorOverride}</span>}
                        {wd.specialEffect && <span className="text-muted-foreground/60">fx:{wd.specialEffect}</span>}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[10px] text-muted-foreground">No word directives</p>}
              </CollapsibleSection>

              {/* Storyboard (Line Directions) */}
              <CollapsibleSection title={`Storyboard (${direction?.storyboard?.length ?? 0})`}>
                {direction?.storyboard && direction.storyboard.length > 0 ? (
                  <div className="max-h-[400px] overflow-auto space-y-1.5">
                    {direction.storyboard.map((ld, i) => (
                      <div key={i} className="rounded bg-background/50 p-1.5 space-y-0.5 text-[10px] font-mono">
                        <div className="flex gap-2">
                          <span className="text-muted-foreground/50 shrink-0">L{ld.lineIndex}</span>
                          <span className="text-foreground/80 truncate">{ld.text}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-2 text-muted-foreground/60">
                          <span>hero:{ld.heroWord}</span>
                          <span>in:{ld.entryStyle}</span>
                          <span>out:{ld.exitStyle}</span>
                          <span>intent:{ld.emotionalIntent}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[10px] text-muted-foreground">No storyboard</p>}
              </CollapsibleSection>

              {/* Active Overrides */}
              <CollapsibleSection title="Active Overrides">
                {Object.keys(overrides).length > 0 ? (
                  <JsonBlock value={overrides} />
                ) : <p className="text-[10px] text-muted-foreground">No overrides active</p>}
              </CollapsibleSection>

              {/* Artist Fingerprint */}
              <CollapsibleSection title="Artist Fingerprint">
                {fingerprint ? (
                  <JsonBlock value={fingerprint} />
                ) : <p className="text-[10px] text-muted-foreground">No fingerprint</p>}
              </CollapsibleSection>

              {/* Lines (condensed) */}
              <CollapsibleSection title={`Lines (${lines.length})`}>
                <div className="max-h-[400px] overflow-auto space-y-0.5">
                  {lines.filter(l => l.tag !== "adlib").map((l, i) => (
                    <div key={i} className="flex gap-2 text-[10px] font-mono">
                      <span className="text-muted-foreground/50 shrink-0 w-[60px] text-right">{l.start.toFixed(2)}-{l.end.toFixed(2)}</span>
                      <span className="text-foreground/80">{l.text}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              {/* Raw Cinematic Direction */}
              <CollapsibleSection title="Raw Cinematic Direction">
                {direction ? (
                  <JsonBlock value={direction} />
                ) : <p className="text-[10px] text-muted-foreground">No cinematic direction data</p>}
              </CollapsibleSection>

              {/* Raw JSON dump */}
              <CollapsibleSection title="Raw Song DNA">
                <JsonBlock value={songDna} />
              </CollapsibleSection>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

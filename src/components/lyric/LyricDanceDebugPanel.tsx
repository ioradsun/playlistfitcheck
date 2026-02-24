import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bug, ChevronDown, ChevronRight, Copy, X, RefreshCw, Sparkles, Clapperboard } from "lucide-react";
import { toast } from "sonner";

import type { SceneManifest } from "@/engine/SceneManifest";
import type { CinematicDirection } from "@/types/CinematicDirection";
import type { LyricLine } from "./LyricDisplay";
import type { LyricDancePlayer, LiveDebugState } from "@/engine/LyricDancePlayer";
import { DEFAULT_DEBUG_STATE } from "@/engine/LyricDancePlayer";

// ─── Shared helpers ─────────────────────────────────────────────────

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

// ─── HUD Tab (live engine state) ────────────────────────────────────

function HudTab({ player }: { player: LyricDancePlayer | null }) {
  const [snap, setSnap] = useState<LiveDebugState>(DEFAULT_DEBUG_STATE);

  useEffect(() => {
    if (!player) return;
    const id = setInterval(() => setSnap({ ...player.debugState }), 100);
    return () => clearInterval(id);
  }, [player]);

  if (!player) return <p className="text-[10px] text-muted-foreground p-3">No player instance</p>;

  const f = (v: number, d = 2) => v.toFixed(d);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <CollapsibleSection title={title} defaultOpen>{children}</CollapsibleSection>
  );

  return (
    <div className="space-y-0">
      <Section title="Beat">
        <div className="space-y-0.5">
          <KV label="Intensity" value={f(snap.beatIntensity)} />
          <KV label="Phys Glow" value={f(snap.physGlow)} />
          <KV label="Last Beat Force" value={f(snap.lastBeatForce)} />
        </div>
      </Section>
      <Section title="Physics">
        <div className="space-y-0.5">
          <KV label="Active" value={snap.physicsActive ? "yes" : "no"} />
          <KV label="Heat" value={f(snap.heat)} />
          <KV label="Velocity" value={f(snap.velocity)} />
          <KV label="Rotation" value={f(snap.rotation)} />
          <KV label="Words" value={snap.wordCount} />
        </div>
      </Section>
      <Section title="Animation">
        <div className="space-y-0.5">
          <KV label="Effect" value={snap.effectKey} />
          <KV label="Entry" value={f(snap.entryProgress)} />
          <KV label="Exit" value={f(snap.exitProgress)} />
          <KV label="Mod" value={snap.activeMod ?? "none"} />
          <KV label="Font Scale" value={f(snap.fontScale)} />
          <KV label="Scale" value={f(snap.scale)} />
          <KV label="Color" value={snap.lineColor} />
          <KV label="Hook" value={snap.isHookLine ? "yes" : "no"} />
        </div>
      </Section>
      <Section title="Particles">
        <div className="space-y-0.5">
          <KV label="System" value={snap.particleSystem} />
          <KV label="Count" value={snap.particleCount} />
          <KV label="Density" value={f(snap.particleDensity)} />
          <KV label="Speed" value={f(snap.particleSpeed)} />
        </div>
      </Section>
      <Section title="Position">
        <div className="space-y-0.5">
          <KV label="X Offset" value={f(snap.xOffset)} />
          <KV label="Y Base" value={f(snap.yBase)} />
          <KV label="X Nudge" value={f(snap.xNudge)} />
          <KV label="Shake" value={f(snap.shake)} />
          <KV label="Zoom" value={f(snap.zoom)} />
        </div>
      </Section>
      <Section title="Direction">
        <div className="space-y-0.5">
          <KV label="Thesis" value={snap.dirThesis} />
          <KV label="Chapter" value={snap.dirChapter} />
          <KV label="Chapter %" value={f(snap.dirChapterProgress * 100, 0) + "%"} />
          <KV label="Intensity" value={f(snap.dirIntensity)} />
          <KV label="BG Directive" value={snap.dirBgDirective} />
          <KV label="Light" value={snap.dirLightBehavior} />
        </div>
      </Section>
      <Section title="Camera & Tension">
        <div className="space-y-0.5">
          <KV label="Distance" value={snap.cameraDistance} />
          <KV label="Movement" value={snap.cameraMovement} />
          <KV label="Tension" value={snap.tensionStage} />
          <KV label="Motion" value={f(snap.tensionMotion)} />
          <KV label="Particles" value={f(snap.tensionParticles)} />
          <KV label="Typo" value={f(snap.tensionTypo)} />
        </div>
      </Section>
      <Section title="Symbols">
        <div className="space-y-0.5">
          <KV label="Primary" value={snap.symbolPrimary} />
          <KV label="Secondary" value={snap.symbolSecondary} />
          <KV label="State" value={snap.symbolState} />
        </div>
      </Section>
      <Section title="Word Directive">
        <div className="space-y-0.5">
          <KV label="Word" value={snap.wordDirectiveWord} />
          <KV label="Kinetic" value={snap.wordDirectiveKinetic} />
          <KV label="Elemental" value={snap.wordDirectiveElemental} />
          <KV label="Emphasis" value={f(snap.wordDirectiveEmphasis)} />
          <KV label="Evolution" value={snap.wordDirectiveEvolution} />
        </div>
      </Section>
      <Section title="Line">
        <div className="space-y-0.5">
          <KV label="Hero" value={snap.lineHeroWord} />
          <KV label="Entry" value={snap.lineEntry} />
          <KV label="Exit" value={snap.lineExit} />
          <KV label="Intent" value={snap.lineIntent} />
          <KV label="Shot" value={snap.shotType} />
        </div>
      </Section>
      <Section title="Performance">
        <div className="space-y-0.5">
          <KV label="FPS" value={Math.round(snap.fps)} />
          <KV label="Total" value={f(snap.perfTotal) + "ms"} />
          <KV label="BG" value={f(snap.perfBg) + "ms"} />
          <KV label="Symbol" value={f(snap.perfSymbol) + "ms"} />
          <KV label="Text" value={f(snap.perfText) + "ms"} />
          <KV label="Overlays" value={f(snap.perfOverlays) + "ms"} />
          <KV label="Near" value={f(snap.perfNear) + "ms"} />
          <KV label="Draws" value={snap.drawCalls} />
        </div>
      </Section>
      <div className="text-center text-[9px] font-mono text-muted-foreground/40 pt-2">{f(snap.time, 2)}s</div>
    </div>
  );
}

// ─── DATA Tab (received data with copy) ─────────────────────────────

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
  // Extended fields for shareable dance debug
  scene_context?: { sourceDescription?: string; baseLuminance?: number; colorTemperature?: number; timeOfDay?: string; textStyle?: string; moodSummary?: string } | null;
  chapter_images?: string[];
  words?: Array<{ word: string; start: number; end: number }>;
}

function DataTab({ data }: { data: DebugData }) {
  const { songDna, beatGrid, lines, title, artist, overrides, fingerprint } = data;
  const spec = songDna?.physicsSpec;
  const manifest = songDna?.scene_manifest;
  const direction = songDna?.cinematic_direction;

  return (
    <div className="space-y-0">
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

      {/* Mood & Meaning */}
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
        {spec ? <JsonBlock value={spec} /> : <p className="text-[10px] text-muted-foreground">No physics spec</p>}
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

      {/* Storyboard */}
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
        {Object.keys(overrides).length > 0 ? <JsonBlock value={overrides} /> : <p className="text-[10px] text-muted-foreground">No overrides active</p>}
      </CollapsibleSection>

      {/* Artist Fingerprint */}
      <CollapsibleSection title="Artist Fingerprint">
        {fingerprint ? <JsonBlock value={fingerprint} /> : <p className="text-[10px] text-muted-foreground">No fingerprint</p>}
      </CollapsibleSection>

      {/* Lines */}
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

      {/* Scene Context */}
      <CollapsibleSection title="Scene Context">
        {data.scene_context ? (
          <div className="space-y-0.5">
            <KV label="Source" value={`"${data.scene_context.sourceDescription}"`} />
            <KV label="Luminance" value={data.scene_context.baseLuminance} />
            <KV label="Temp" value={data.scene_context.colorTemperature} />
            <KV label="Time" value={data.scene_context.timeOfDay} />
            <KV label="Text" value={data.scene_context.textStyle} />
            <KV label="Mood" value={data.scene_context.moodSummary} />
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">not set — AI default</p>
        )}
      </CollapsibleSection>

      {/* Chapter Images */}
      <CollapsibleSection title="Chapter Images">
        <div className="space-y-0.5">
          <KV label="Loaded" value={`${data.chapter_images?.length ?? 0}/3`} />
          {data.chapter_images?.map((url: string, i: number) => (
            <p key={i} className="font-mono text-[10px] text-muted-foreground/60 truncate">
              ch{i + 1}: {url ? '✓ ' + url.split('/').pop() : '✗ missing'}
            </p>
          ))}
        </div>
      </CollapsibleSection>

      {/* Cinematic Direction Summary */}
      <CollapsibleSection title="Cinematic Direction Summary">
        {direction ? (
          <div className="space-y-0.5">
            <KV label="Thesis" value={direction.thesis} />
            <KV label="Acts" value={direction.chapters?.length ?? 0} />
            {direction.chapters?.map((ch: any, i: number) => (
              <p key={i} className="font-mono text-[10px] text-muted-foreground/60">
                act{i + 1}: {ch.title} — {ch.dominantColor}{' '}
                [{Math.round((ch.startRatio ?? 0) * 100)}%→{Math.round((ch.endRatio ?? 1) * 100)}%]
                {ch.transitionStyle ? ` | ${ch.transitionStyle}` : ''}
              </p>
            ))}
            <KV label="Climax" value={`${((direction.climax?.timeRatio ?? 0) * 100).toFixed(0)}% — "${direction.climax?.triggerLine ?? ''}"`} />
            <KV label="Word Directives" value={`${Object.keys(direction.wordDirectives ?? {}).length} words`} />
            <KV label="Metaphors" value={`${Object.values(direction.wordDirectives ?? {}).filter((w: any) => w.visualMetaphor).length} assigned`} />
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">not generated</p>
        )}
      </CollapsibleSection>

      {/* Storyboard Icons */}
      <CollapsibleSection title="Line Art Icons">
        {direction?.storyboard ? (
          <div className="space-y-0.5">
            <KV label="Icons" value={`${direction.storyboard.filter((s: any) => s.iconGlyph).length} assigned / ${direction.storyboard.length} lines`} />
            {direction.storyboard
              .filter((s: any) => s.iconGlyph)
              .slice(0, 8)
              .map((s: any, i: number) => (
                <p key={i} className="font-mono text-[10px] text-muted-foreground/60">
                  line {s.lineIndex}: {s.iconGlyph} ({s.iconPosition}) ×{s.iconScale}
                </p>
              ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">no storyboard</p>
        )}
      </CollapsibleSection>

      {/* Visual Metaphors */}
      <CollapsibleSection title="Visual Metaphors">
        {direction?.wordDirectives ? (
          <div className="space-y-0.5">
            {Object.entries(direction.wordDirectives)
              .filter(([_, v]: any) => v.visualMetaphor)
              .slice(0, 8)
              .map(([word, v]: any) => (
                <p key={word} className="font-mono text-[10px] text-muted-foreground/60">
                  "{word}": {v.visualMetaphor} (emp:{v.emphasisLevel})
                </p>
              ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">none</p>
        )}
      </CollapsibleSection>

      {/* Word Count & Phrases */}
      <CollapsibleSection title="Words & Phrases">
        <div className="space-y-0.5">
          <KV label="Words" value={data.words?.length ?? 0} />
          <p className="font-mono text-[10px] text-muted-foreground/60">chunks registered: shown in health log</p>
        </div>
      </CollapsibleSection>

      {/* Raw dumps */}
      <CollapsibleSection title="Raw Cinematic Direction">
        {direction ? <JsonBlock value={direction} /> : <p className="text-[10px] text-muted-foreground">No cinematic direction data</p>}
      </CollapsibleSection>
      <CollapsibleSection title="Raw Song DNA">
        <JsonBlock value={songDna} />
      </CollapsibleSection>
    </div>
  );
}

// ─── PROMPT Tab (shows the exact prompt sent to AI) ─────────────────

function PromptTab({ data }: { data: DebugData }) {
  const { lines, title, artist } = data;
  const direction = data.songDna?.cinematic_direction;

  const sceneCtx = data.scene_context;
  const scenePrefix = sceneCtx
    ? `SCENE CONTEXT — foundational visual world. All chapters must honor this.
Scene: ${sceneCtx.sourceDescription ?? "unknown"}
Time of day: ${sceneCtx.timeOfDay ?? "unknown"}
Luminance: ${sceneCtx.baseLuminance ?? "unknown"}
Color temperature: ${sceneCtx.colorTemperature ?? "unknown"}
Text style: ${sceneCtx.textStyle ?? "light"}`
    : "SCENE CONTEXT — not specified. Default to dark cinematic.";

  const systemPrompt = scenePrefix + "\n\n" + CINEMATIC_PROMPT_PREVIEW;

  const userPrompt = `Song: ${artist} — ${title}
Lyrics (${lines.length} lines):
${lines.filter(l => l.tag !== "adlib").map(l => l.text).join("\n")}

Create the cinematic_direction. 3 acts. Be decisive. JSON only.

REMINDER: You MUST assign iconGlyph to at least 10 storyboard entries spread across all 3 chapters. Each chapter needs at least 3 icons. Use position "behind"/"above"/"beside"/"replace" and style "ghost"/"outline"/"filled". This is mandatory.`;

  const iconCount = direction?.storyboard?.filter((s: any) => s.iconGlyph).length ?? 0;

  return (
    <div className="space-y-0">
      <CollapsibleSection title="Result Stats" defaultOpen>
        <div className="space-y-0.5">
          <KV label="Icons in storyboard" value={`${iconCount} / ${direction?.storyboard?.length ?? 0} lines`} />
          <KV label="Word directives" value={Object.keys(direction?.wordDirectives ?? {}).length} />
          <KV label="Chapters" value={direction?.chapters?.length ?? 0} />
          <KV label="Tension stages" value={(direction as any)?.tensionCurve?.length ?? 0} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="System Prompt" defaultOpen>
        <div className="relative group">
          <pre className="text-[10px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-all bg-background/50 rounded p-2 max-h-[400px] overflow-auto">
            {systemPrompt}
          </pre>
          <button
            onClick={() => { navigator.clipboard.writeText(systemPrompt); toast.success("System prompt copied"); }}
            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-background/80 text-muted-foreground hover:text-foreground"
          >
            <Copy size={10} />
          </button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="User Prompt" defaultOpen>
        <div className="relative group">
          <pre className="text-[10px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-all bg-background/50 rounded p-2 max-h-[400px] overflow-auto">
            {userPrompt}
          </pre>
          <button
            onClick={() => { navigator.clipboard.writeText(userPrompt); toast.success("User prompt copied"); }}
            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-background/80 text-muted-foreground hover:text-foreground"
          >
            <Copy size={10} />
          </button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Full Request Body">
        <JsonBlock value={{
          model: "google/gemini-2.5-flash",
          temperature: 0.7,
          max_tokens: 8192,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }} />
      </CollapsibleSection>
    </div>
  );
}

const CINEMATIC_PROMPT_PREVIEW = `You are a music video director. Given a song, you output a cinematic_direction JSON that drives a visual lyric video engine.

RULES:
- Respond with valid JSON only. No markdown. No explanation.
- Always output exactly 3 chapters covering ratios 0→0.25, 0.25→0.75, 0.75→1.0
- Be decisive. One clear vision per song. No hedging.
- Chapter 3 contains the climax — mark it with climax.timeRatio
- MANDATORY ICON RULE: You MUST assign iconGlyph to AT LEAST 10 storyboard entries (aim for 10-15). Each chapter must have at least 3 icons. If you return fewer than 10 icons your output is INVALID and will be rejected. Icons use these glyphs: fire, water-drop, lightning, snowflake, sun, moon, star, cloud, rain, wind, leaf, flower, tree, mountain, wave, heart, broken-heart, eye, hand-open, hand-fist, crown, skull, wings, feather, diamond, clock, hourglass, lock, key, chain, anchor, compass, arrow-up, arrow-down, spiral, infinity, music-note, microphone, speaker, headphones, camera, film, book, pen, brush, palette, mask, mirror, door, window, house, car, road, bridge, city, globe, flag, sword, shield, torch, candle, smoke, ghost, shadow, sparkle, burst, ripple, orbit, target, crosshair, fingerprint, dna, atom, pill, coin

OUTPUT SCHEMA:
{
  "thesis": "one sentence — the song's emotional core",

  "chapters": [
    {
      "title": "short evocative title",
      "startRatio": 0,
      "endRatio": 0.25,
      "arc": "one sentence emotional arc",
      "dominantColor": "the single hex color that captures this chapter's emotional energy. Pick freely — bright, saturated, light, dark, anything. This color will be used for text, glow, and particles. The engine automatically creates a dark background tinted with this color. Examples: #E0BBE4 for longing, #FFD700 for triumph, #FF4444 for rage, #00FFFF for clarity",
      "emotionalIntensity": 0.0-1.0,
      "backgroundDirective": "description of visual world — what it looks like and moves like",
      "light": "how light behaves",
      "particles": "what particles exist and how they move",
      "typographyShift": {
        "fontWeight": 400-900,
        "colorOverride": "#hex or null",
        "letterSpacing": "normal | wide | tight"
      },
      "transitionStyle": "cut | dissolve | flash-cut",
      "transitionDuration": 0-2.0,
      "flashColor": "#ffffff or #000000 — only if flash-cut"
    },
    {
      "startRatio": 0.25,
      "endRatio": 0.75,
      ...same fields
    },
    {
      "startRatio": 0.75,
      "endRatio": 1.0,
      ...same fields
    }
  ],

  "climax": {
    "timeRatio": 0.0-1.0,
    "triggerLine": "the exact lyric line at the climax",
    "maxLightIntensity": 0.0-1.0,
    "typographyBehavior": "what happens to text at climax"
  },

  "visualWorld": {
    "palette": ["#hex1", "#hex2", "#hex3"],
    "backgroundSystem": "storm | fire | ocean | space | urban | intimate | void | aurora",
    "particleSystem": "sparks | embers | rain | snow | dust | none",
    "typographyProfile": {
      "fontFamily": "Montserrat",
      "fontWeight": 400-900,
      "textTransform": "uppercase | none",
      "letterSpacing": "normal | wide | tight"
    },
    "physicsProfile": {
      "heat": 0.0-1.0,
      "chaos": "stable | building | glitch",
      "weight": "light | medium | heavy",
      "beatResponse": "pulse | slam | none"
    }
  },

  "storyboard": [
    {
      "lineIndex": 0,
      "entryStyle": "rises | slams-in | fractures-in | materializes | cuts | whisper | bloom | drop | plant | snap-in",
      "exitStyle": "dissolves-upward | burns-out | shatters | lingers | fades | drift-up | sink | evaporate",
      "heroWord": "most important word in this line or null",
      "iconGlyph": "optional string — one of the available glyphs",
      "iconStyle": "outline | filled | ghost — optional",
      "iconPosition": "behind | above | beside | replace — optional",
      "iconScale": "number 1.0-3.0, optional, default 2.0"
    }
  ],

  "wordDirectives": {
    "word": {
      "kineticClass": "RISING | FALLING | IMPACT | SPINNING | FLOATING",
      "emphasisLevel": 1-5,
      "colorOverride": "#hex or null",
      "visualMetaphor": one of: "ember-burst", "frost-form", "lens-focus", "gravity-drop", "ascent", "fracture", "heartbeat", "pain-weight", "isolation", "convergence", "shockwave", "void-absorb", "radiance", "gold-rain", "speed-blur", "slow-drift", "power-surge", "dream-float", "truth-snap", "motion-streak"
    }
  },

  "tensionCurve": [
    {
      "stage": "name",
      "startRatio": 0.0,
      "endRatio": 0.25,
      "motionIntensity": 0.0-1.0,
      "particleDensity": 0.0-1.0
    }
  ],

  "ending": {
    "style": "snap | dissolve | fade",
    "emotionalAftertaste": "one word"
  }
}

ICON VISUAL METAPHORS — MANDATORY:

Icons are visual metaphors that tell the story alongside the lyrics. They are NOT decoration — they are the emotional vocabulary of the video.

CRITICAL REQUIREMENT: The storyboard array MUST include iconGlyph on at least 10 entries. If fewer than 10 storyboard entries have iconGlyph, your output is INVALID. Aim for 10-15 icons (roughly 15-25% of lines).

ASSIGNMENT RULES:
- Every chapter MUST have at least 3 icons
- Choose the anchor/hero word lines where a visual symbol amplifies the emotional meaning
- Spread icons across the full emotional arc — do not cluster them

AVAILABLE GLYPHS:
fire, water-drop, lightning, snowflake, sun, moon, star, cloud, rain, wind, leaf, flower, tree, mountain, wave, heart, broken-heart, eye, hand-open, hand-fist, crown, skull, wings, feather, diamond, clock, hourglass, lock, key, chain, anchor, compass, arrow-up, arrow-down, spiral, infinity, music-note, microphone, speaker, headphones, camera, film, book, pen, brush, palette, mask, mirror, door, window, house, car, road, bridge, city, globe, flag, sword, shield, torch, candle, smoke, ghost, shadow, sparkle, burst, ripple, orbit, target, crosshair, fingerprint, dna, atom, pill, coin

ICON POSITION — choose based on emotional function:
- "behind" — atmospheric mood. Large icon behind the word at medium opacity. Use for mood/setting words. ~40-50% of icons.
- "above" — thought/annotation. Small icon floating above the word. Use for descriptive words. ~25-30% of icons.
- "beside" — action companion. Icon sits next to the word. Use for action words. ~15-20% of icons.
- "replace" — climactic substitution. Icon REPLACES the text entirely. Use only 1-2 times per song at the absolute peak emotional moment.

ICON STYLE:
- "ghost" — faded ethereal, best for "behind" position
- "outline" — clean line art, best for "above" and "beside"
- "filled" — solid shape, best for "replace"

ICON SCALE:
- Default 2.0. Use 2.5-3.0 for dramatic behind moments. Use 1.5 for subtle accent.

CONSTRAINTS:
- storyboard must cover every lyric line.
- storyboard MUST have iconGlyph on at least 10 entries — this is mandatory.
- wordDirectives: only emotionally significant words, 10-25 max.
- tensionCurve must contain exactly 3 entries aligned to chapter ranges.`;

// ─── Main Panel ─────────────────────────────────────────────────────

interface Props {
  data: DebugData;
  player?: LyricDancePlayer | null;
  onRegenerateSong?: () => void;
  onRegenerateDance?: () => void;
  onRegenerateDirector?: () => void;
}

export function LyricDanceDebugPanel({ data, player = null, onRegenerateSong, onRegenerateDance, onRegenerateDirector }: Props) {
  const [open, setOpen] = useState(false);
  const hasPlayer = player != null;
  const [tab, setTab] = useState<"hud" | "data" | "prompt">(hasPlayer ? "hud" : "data");

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
          style={{ position: "fixed", bottom: 16, right: 16, zIndex: 9999 }}
          className="flex items-center gap-1.5 rounded-full bg-red-600 text-white px-4 py-2 text-xs font-mono font-bold shadow-xl hover:bg-red-500 transition-colors"
          title="Open debug panel"
        >
          <Bug size={14} />
          DEBUG
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
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-border/50 bg-background/95 backdrop-blur">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <Bug size={14} className="text-primary" />
                  <span className="text-xs font-mono font-semibold uppercase tracking-wider">Debug Panel</span>
                </div>
                <div className="flex items-center gap-1">
                  {onRegenerateSong && (
                    <button onClick={onRegenerateSong} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold text-orange-400 hover:bg-orange-400/10 transition-colors" title="Re-run song analysis pipeline">
                      <RefreshCw size={12} /> Song
                    </button>
                  )}
                  {onRegenerateDance && (
                    <button onClick={onRegenerateDance} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold text-emerald-400 hover:bg-emerald-400/10 transition-colors" title="Republish dance">
                      <Sparkles size={12} /> Dance
                    </button>
                  )}
                  {onRegenerateDirector && (
                    <button onClick={onRegenerateDirector} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold text-purple-400 hover:bg-purple-400/10 transition-colors" title="Re-run scene manifest (Director)">
                      <Clapperboard size={12} /> Director
                    </button>
                  )}
                  <button onClick={copyAll} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors" title="Copy all data">
                    <Copy size={14} />
                  </button>
                  <button onClick={() => setOpen(false)} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors">
                    <X size={14} />
                  </button>
                </div>
              </div>
              {/* Tabs */}
              <div className="flex border-t border-border/30">
                {hasPlayer && (
                  <button
                    onClick={() => setTab("hud")}
                    className={`flex-1 py-2 text-[10px] font-mono font-bold uppercase tracking-widest transition-colors ${
                      tab === "hud" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    HUD · Live State
                  </button>
                )}
                <button
                  onClick={() => setTab("data")}
                  className={`flex-1 py-2 text-[10px] font-mono font-bold uppercase tracking-widest transition-colors ${
                    tab === "data" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  DATA · Received
                </button>
                <button
                  onClick={() => setTab("prompt")}
                  className={`flex-1 py-2 text-[10px] font-mono font-bold uppercase tracking-widest transition-colors ${
                    tab === "prompt" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  PROMPT
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-3">
              {tab === "hud" ? <HudTab player={player} /> : tab === "prompt" ? <PromptTab data={data} /> : <DataTab data={data} />}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

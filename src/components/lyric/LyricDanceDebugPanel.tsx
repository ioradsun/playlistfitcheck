import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bug, ChevronDown, ChevronRight, Copy, X, RefreshCw, Sparkles, Clapperboard, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import type { FrameRenderState } from "@/engine/FrameRenderState";
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
  renderData: {
    mood?: string;
    description?: string;
    meaning?: { theme?: string; summary?: string; imagery?: string[] };
    hook?: { start: number; end: number; previewText?: string } | null;
    secondHook?: { start: number; end: number; previewText?: string } | null;
    hookLabel?: string;
    secondHookLabel?: string;
    hookJustification?: string;
    secondHookJustification?: string;
    motionProfileSpec?: Record<string, unknown> | null;
    frame_state?: FrameRenderState | null;
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
  section_images?: string[];
  words?: Array<{ word: string; start: number; end: number }>;
}

function DataTab({ data }: { data: DebugData }) {
  const { renderData, beatGrid, lines, title, artist, overrides, fingerprint } = data;
  const spec = renderData?.motionProfileSpec;
  const manifest = renderData?.frame_state;
  const direction = renderData?.cinematic_direction;

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
          <KV label="Mood" value={renderData?.mood} />
          <KV label="Description" value={renderData?.description} />
          <KV label="Theme" value={renderData?.meaning?.theme} />
          <KV label="Summary" value={renderData?.meaning?.summary} />
          {renderData?.meaning?.imagery && renderData.meaning.imagery.length > 0 && (
            <div className="text-[11px]">
              <span className="font-mono text-muted-foreground/60">Imagery:</span>
              <ul className="ml-3 mt-0.5 space-y-0.5">
                {renderData.meaning.imagery.map((img, i) => (
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
          {renderData?.hook ? (
            <div className="space-y-1 rounded bg-background/50 p-2">
              <p className="text-[10px] font-mono font-semibold text-primary">Primary Hook</p>
              <KV label="Label" value={renderData.hookLabel} />
              <KV label="Preview" value={renderData.hook.previewText} />
              <KV label="Range" value={`${renderData.hook.start.toFixed(2)}s → ${renderData.hook.end.toFixed(2)}s`} />
              <KV label="Duration" value={`${(renderData.hook.end - renderData.hook.start).toFixed(2)}s`} />
              {renderData.hookJustification && <KV label="Why" value={renderData.hookJustification} />}
            </div>
          ) : <p className="text-[10px] text-muted-foreground">No hook detected</p>}
          {renderData?.secondHook && (
            <div className="space-y-1 rounded bg-background/50 p-2">
              <p className="text-[10px] font-mono font-semibold text-primary/70">Secondary Hook</p>
              <KV label="Label" value={renderData.secondHookLabel} />
              <KV label="Preview" value={renderData.secondHook.previewText} />
              <KV label="Range" value={`${renderData.secondHook.start.toFixed(2)}s → ${renderData.secondHook.end.toFixed(2)}s`} />
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
          <KV label="Loaded" value={`${data.section_images?.length ?? 0}`} />
          {data.section_images?.map((url: string, i: number) => (
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
        <JsonBlock value={renderData} />
      </CollapsibleSection>
    </div>
  );
}

// ─── PROMPT Tab (shows the exact prompt sent to AI) ─────────────────

function PromptTab({ data, onRunCustomPrompt, isRunning }: { data: DebugData; onRunCustomPrompt?: (systemPrompt: string) => void; isRunning?: boolean }) {
  const { lines, title, artist } = data;
  const direction = data.renderData?.cinematic_direction;

  const sceneCtx = data.scene_context;
  const scenePrefix = sceneCtx
    ? `SCENE CONTEXT — foundational visual world. All chapters must honor this.
Scene: ${sceneCtx.sourceDescription ?? "unknown"}
Time of day: ${sceneCtx.timeOfDay ?? "unknown"}
Luminance: ${sceneCtx.baseLuminance ?? "unknown"}
Color temperature: ${sceneCtx.colorTemperature ?? "unknown"}
Text style: ${sceneCtx.textStyle ?? "light"}`
    : "SCENE CONTEXT — not specified. Default to dark cinematic.";

  const [editedPrompt, setEditedPrompt] = useState(CINEMATIC_PROMPT_PREVIEW);
  const [isEdited, setIsEdited] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleReset = () => {
    setEditedPrompt(CINEMATIC_PROMPT_PREVIEW);
    setIsEdited(false);
  };

  const handleChange = (val: string) => {
    setEditedPrompt(val);
    setIsEdited(val !== CINEMATIC_PROMPT_PREVIEW);
  };

  const fullSystemPrompt = scenePrefix + "\n\n" + editedPrompt;

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
        <div className="space-y-2">
          {/* Action bar */}
          <div className="flex items-center gap-1.5">
            {onRunCustomPrompt && (
              <button
                onClick={() => onRunCustomPrompt(editedPrompt)}
                disabled={isRunning}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold text-emerald-400 hover:bg-emerald-400/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Run cinematic-direction with this prompt (not saved)"
              >
                {isRunning ? <RefreshCw size={10} className="animate-spin" /> : <Play size={10} />}
                {isRunning ? "Running…" : "Run"}
              </button>
            )}
            {isEdited && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold text-orange-400 hover:bg-orange-400/10 transition-colors"
                title="Reset to production prompt"
              >
                <RotateCcw size={10} />
                Reset
              </button>
            )}
            <button
              onClick={() => { navigator.clipboard.writeText(fullSystemPrompt); toast.success("System prompt copied"); }}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              <Copy size={10} />
            </button>
            {isEdited && (
              <span className="text-[9px] font-mono text-orange-400">MODIFIED</span>
            )}
          </div>
          {/* Editable prompt */}
          <textarea
            ref={textareaRef}
            value={editedPrompt}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full text-[10px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-all bg-background/50 rounded p-2 min-h-[300px] max-h-[500px] overflow-auto border border-border/30 focus:border-primary/50 focus:outline-none resize-y"
            spellCheck={false}
          />
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
            { role: "system", content: fullSystemPrompt },
            { role: "user", content: userPrompt },
          ],
        }} />
      </CollapsibleSection>
    </div>
  );
}

const CINEMATIC_PROMPT_PREVIEW = `You are a film director designing a cinematic lyric video.

You will receive song lyrics and audio analysis data. Your job is to SELECT visual presets from constrained menus, identify hero moments in the lyrics, and choose semantic animations for important words.

You may NOT invent colors, styles, effects, or any values not listed below.

Return ONLY valid JSON. No markdown. No explanation. No preamble.

═══════════════════════════════════════
SECTION 1 — WORLD DEFAULTS (7 picks)
═══════════════════════════════════════

Pick exactly one value for each of these 7 dimensions.

These are the SONG-WIDE DEFAULTS. Chapters can override 4 of them.

SCENE TONE — controls light/dark foundation:
  "dark"         — moody, cinematic, dark backgrounds
  "light"        — bright, airy, daylit
  "mixed-dawn"   — dark → dark → light (sunrise arc, hope ending)
  "mixed-dusk"   — light → light → dark (descent arc, heavy ending)
  "mixed-pulse"  — dark → light → dark (brief hope, return to weight)

ATMOSPHERE — controls background image treatment:
  "void"       — near-black/white, text floats in space
  "cinematic"  — standard filmic crush + vignette
  "haze"       — dreamy soft focus, blurred background
  "split"      — image on one half, solid color on other
  "grain"      — film grain overlay, analog texture
  "wash"       — heavy color tint toward palette color
  "glass"      — frosted glass effect, modern
  "clean"      — minimal overlay, image-forward

PALETTE — locked color set (MUST match tone):
  Dark palettes:  "cold-gold", "warm-ember", "ice-blue", "midnight-rose", "neon-green", "storm-grey", "blood-red", "lavender-dream", "earth-brown"
  Light palettes: "pure-white", "soft-cream", "sky-blue", "sunset-pink", "spring-green"

MOTION — text animation cadence:
  "weighted"  — heavy, impactful, hip-hop/trap
  "fluid"     — smooth, flowing, R&B/soul
  "elastic"   — bouncy, energetic, pop
  "drift"     — slow, contemplative, ambient/lo-fi
  "glitch"    — choppy, digital, electronic

TYPOGRAPHY — font and style:
  "bold-impact"      — Oswald, uppercase, power
  "clean-modern"     — Montserrat, neutral, pop
  "elegant-serif"    — Playfair Display, soulful, ballad
  "raw-condensed"    — Barlow Condensed, gritty, indie
  "whisper-soft"     — Nunito, gentle, dreamy
  "tech-mono"        — JetBrains Mono, futuristic, electronic
  "display-heavy"    — Bebas Neue, statement, anthem
  "editorial-light"  — Cormorant Garamond, poetic, intimate

TEXTURE — dominant particle/sim layer:
  "fire", "rain", "snow", "aurora", "smoke", "storm", "dust", "void", "stars", "petals"

EMOTIONAL ARC — how intensity evolves over the song:
  "slow-burn"  — gradual build, restrained → tension → peak
  "surge"      — high energy early, bigger climax
  "collapse"   — starts intense, ends minimal
  "dawn"       — dark to light transition, hope ending
  "flatline"   — intentionally monotone, ambient, meditative
  "eruption"   — quiet start, explodes Act 2, Act 3 rides energy

COMPATIBILITY RULES:
- If sceneTone is "dark", palette MUST be from the Dark list
- If sceneTone is "light", palette MUST be from the Light list
- If sceneTone is "light", texture should NOT be "fire" or "storm"
- "mixed-*" tones can use any palette

═══════════════════════════════════════
SECTION 2 — CHAPTERS (exactly 3)
═══════════════════════════════════════

Provide exactly 3 chapters. These drive the AI background image generation
AND control how animation physics change across the song.

Each chapter has:
- "act": 1, 2, or 3
- "startRatio": float (Act 1: 0.0, Act 2: 0.25, Act 3: 0.75)
- "endRatio": float (Act 1: 0.25, Act 2: 0.75, Act 3: 1.0)
- "description": a vivid 1-sentence scene for the background image
- "mood": 2-3 emotional keywords

OPTIONAL per chapter — override the song defaults for THIS act:
- "motion": override motion for this chapter (same values as Section 1)
- "texture": override texture for this chapter (same values as Section 1)
- "typography": override typography for this chapter (same values as Section 1)
- "atmosphere": override atmosphere for this chapter (same values as Section 1)

Use chapter overrides to CREATE A JOURNEY. Don't repeat the same values
as the song defaults unless you mean it. Think like a film director —
each act should feel different.

Chapter descriptions should paint a SCENE, not describe effects.
  GOOD: "Empty highway at 3am, headlights cutting through fog"
  BAD:  "Dark moody atmosphere with particles"
  GOOD: "Golden sunlight pouring through a cracked church window"
  BAD:  "Warm tones with spiritual energy"

CHAPTER OVERRIDE EXAMPLES:
  Song about loss with hope ending:
    Act 1: motion "drift", texture "rain", atmosphere "haze"
    Act 2: motion "weighted", texture "storm" (pain escalates)
    Act 3: motion "fluid", texture "aurora", atmosphere "clean" (release)

  Trap banger with quiet bridge:
    Act 1: (uses song defaults — "weighted", "fire")
    Act 2: motion "drift", texture "smoke", typography "whisper-soft"
    Act 3: motion "glitch", texture "storm" (biggest energy)

  Don't override every chapter. Only override when the emotional shift
  demands a different feel. If Act 1 matches the song defaults, omit
  the override fields entirely.

═══════════════════════════════════════
SECTION 3 — STORYBOARD (sparse)
═══════════════════════════════════════

The storyboard is SPARSE. Only include entries for lines that have a strong emotional or visual moment. Do NOT include an entry for every lyric line.

Target: 15-25 storyboard entries out of all lyric lines.

Each storyboard entry has:
- "lineIndex": integer (0-based index into the lyrics array)
- "heroWord": the most emotionally significant word on that line (UPPERCASE)
- "entryStyle": pick from entries list below
- "exitStyle": pick from exits list below

ENTRY STYLES:
  slam-down, punch-in, explode-in, snap-in, rise, materialize,
  breathe-in, drift-in, drop, plant, stomp, cut-in, whisper, bloom,
  focus-in, spin-in, tumble-in

EXIT STYLES:
  shatter, snap-out, burn-out, dissolve, drift-up, sink, cut-out,
  vanish, linger, evaporate, blur-out, spin-out,
  scatter-letters, peel-off, peel-reverse, cascade-down, cascade-up,
  gravity-fall, soar, launch, scatter-fly, melt, freeze-crack

═══════════════════════════════════════
SECTION 4 — WORD DIRECTIVES (semantic animation)
═══════════════════════════════════════

For 15-25 emotionally or visually significant words across the song,
choose animations that make the word's LITERAL MEANING visible.

If the word means upward motion → it should move up.
If the word means destruction → it should break apart.
If the word means cold → it should trail frost.
If the word means clarity → it should sharpen from blur.
If the word means spinning → it should rotate.
If the word means echo → it should leave ghost copies.
If the word means frozen → it should stop dead.

Let the word tell you what it needs.

EXIT SELECTION RULES — match the exit to what the word DOES:
  rain, fall, drop, tears, gravity    → gravity-fall + letterSequence
  bird, fly, wings, free, soaring     → soar
  rise, escape, blast, rocket, launch → launch
  break, apart, scatter, flock        → scatter-fly + letterSequence
  melt, drip, candle, wax, dissolving → melt
  freeze, ice, stuck, numb, trapped   → freeze-crack
  crash, shatter, break, smash        → shatter or scatter-letters + letterSequence
  float, breath, smoke, whisper       → drift-up or evaporate (gentle)
  sink, drown, fall, weight, heavy    → sink or cascade-down

  DO NOT use drift-up for words with strong upward energy.
  drift-up is for gentle fading (smoke, breath, whisper).
  Use soar or launch for words that mean flight or escape.

  DO NOT use dissolve as a default. Match the exit to meaning.
  If the word is violent → shatter, scatter-letters, scatter-fly
  If the word is cold → freeze-crack, melt
  If the word is upward → soar, launch, cascade-up
  If the word is downward → gravity-fall, sink, cascade-down

Each word directive has:
- "word": the word (lowercase)
- "emphasisLevel": 1-5 (1=subtle, 5=showstopper)
- "entry": pick from entry styles list above
- "behavior": pick from behaviors list below
- "exit": pick from exit styles list above

OPTIONAL per word:
- "trail": particle trail effect (see list below)
- "ghostTrail": true — leaves fading echo copies (2-4 per song)
- "ghostDirection": "up" | "down" | "left" | "right" | "radial"
- "letterSequence": true — letters animate individually (3-5 per song)
  PAIR letterSequence with semantic exits for maximum impact:
    "rain" + gravity-fall + letterSequence = each letter falls like a raindrop
    "breaking" + scatter-fly + letterSequence = letters fly apart like shrapnel
    "change" + scatter-letters + letterSequence = letters rearrange/scatter
  letterSequence without a semantic exit wastes the effect.
- "visualMetaphor": freeform string describing the intended visual

BEHAVIORS:
  pulse, vibrate, float, grow, contract, flicker, orbit, lean, none,
  freeze, tilt, pendulum, pulse-focus

TRAILS:
  ember, frost, spark-burst, dust-impact, light-rays, gold-coins,
  dark-absorb, motion-trail, memory-orbs, none

MODIFIER RULES:
- ghostTrail: for echo, repeat, reverb, haunt, voices, forever, again (2-4 per song)
- letterSequence: for break, shatter, split, count, crumble, apart, scatter (3-5 per song)
- freeze behavior: for freeze, stop, still, stuck, trapped, numb (1-2 per song)
- Choose animations by what the word MEANS, not how loud it is
- Abstract emotional words (love, truth, hope) → use emphasisLevel + visualMetaphor
- Concrete action words (fly, crash, burn, freeze) → use semantic entry/exit/trail
- Not every word needs a trail. Most need "none" or omit the field.

═══════════════════════════════════════
SECTION 5 — OUTPUT SCHEMA
═══════════════════════════════════════

Return this exact JSON structure. All top-level keys are required.

{
  "sceneTone": "mixed-dawn",
  "atmosphere": "haze",
  "palette": "storm-grey",
  "motion": "drift",
  "typography": "raw-condensed",
  "texture": "rain",
  "emotionalArc": "slow-burn",

  "chapters": [
    {
      "act": 1,
      "startRatio": 0.0,
      "endRatio": 0.25,
      "description": "Empty rain-soaked street, single streetlight, puddles reflecting amber",
      "mood": "isolated, heavy, still"
    },
    {
      "act": 2,
      "startRatio": 0.25,
      "endRatio": 0.75,
      "description": "Inside a moving car, rain on windshield, blurred city lights passing",
      "mood": "restless, searching, momentum",
      "motion": "weighted",
      "texture": "storm",
      "atmosphere": "cinematic"
    },
    {
      "act": 3,
      "startRatio": 0.75,
      "endRatio": 1.0,
      "description": "Standing on a rooftop at dawn, rain stopping, first light breaking through clouds",
      "mood": "release, clarity, resolve",
      "motion": "fluid",
      "texture": "aurora",
      "typography": "elegant-serif",
      "atmosphere": "clean"
    }
  ],

  "storyboard": [
    {
      "lineIndex": 0,
      "heroWord": "RAIN",
      "entryStyle": "rise",
      "exitStyle": "dissolve"
    },
    {
      "lineIndex": 5,
      "heroWord": "ROAD",
      "entryStyle": "drift-in",
      "exitStyle": "evaporate"
    },
    {
      "lineIndex": 12,
      "heroWord": "HEART",
      "entryStyle": "materialize",
      "exitStyle": "shatter"
    }
  ],

  "wordDirectives": {
    "rain": {
      "word": "rain",
      "emphasisLevel": 4,
      "entry": "rise",
      "behavior": "float",
      "exit": "dissolve",
      "trail": "frost",
      "visualMetaphor": "gravity-drop"
    },
    "shatter": {
      "word": "shatter",
      "emphasisLevel": 5,
      "entry": "explode-in",
      "behavior": "vibrate",
      "exit": "scatter-letters",
      "trail": "spark-burst",
      "letterSequence": true
    },
    "echo": {
      "word": "echo",
      "emphasisLevel": 3,
      "entry": "materialize",
      "behavior": "float",
      "exit": "evaporate",
      "trail": "none",
      "ghostTrail": true,
      "ghostDirection": "radial"
    }
  }
}

VALIDATION:
- sceneTone, atmosphere, palette, motion, typography, texture, emotionalArc are ALL required top-level strings
- chapters array MUST have exactly 3 entries
- Chapter override fields (motion, texture, typography, atmosphere) are OPTIONAL — only include when overriding
- storyboard array MUST have 15-25 entries
- wordDirectives MUST have 15-25 entries
- All enum values MUST be from the lists above — do NOT invent values
- Do NOT include fields named: beatAlignment, emotionalIntent, visualTreatment, particleBehavior, transitionToNext, dominantColor, colorHex, physicsProfile, cameraLanguage, tensionCurve, iconGlyph, iconStyle, iconPosition, iconScale, visualWorld
- If you include ANY of those forbidden fields, the output is INVALID

Return JSON only. No markdown fences. No explanation.`;

// ─── Main Panel ─────────────────────────────────────────────────────

interface Props {
  data: DebugData;
  player?: LyricDancePlayer | null;
  onRegenerateSong?: () => void;
  onRegenerateDance?: () => void;
  onRegenerateDirector?: () => void;
  onRunCustomPrompt?: (systemPrompt: string) => Promise<void>;
}

export function LyricDanceDebugPanel({ data, player = null, onRegenerateSong, onRegenerateDance, onRegenerateDirector, onRunCustomPrompt }: Props) {
  const [open, setOpen] = useState(false);
  const [customPromptRunning, setCustomPromptRunning] = useState(false);
  const hasPlayer = player != null;
  const [tab, setTab] = useState<"hud" | "data" | "prompt">(hasPlayer ? "hud" : "data");

  const handleRunCustomPrompt = async (systemPrompt: string) => {
    if (!onRunCustomPrompt || customPromptRunning) return;
    setCustomPromptRunning(true);
    try {
      await onRunCustomPrompt(systemPrompt);
    } finally {
      setCustomPromptRunning(false);
    }
  };

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
              {tab === "hud" ? <HudTab player={player} /> : tab === "prompt" ? <PromptTab data={data} onRunCustomPrompt={onRunCustomPrompt ? handleRunCustomPrompt : undefined} isRunning={customPromptRunning} /> : <DataTab data={data} />}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

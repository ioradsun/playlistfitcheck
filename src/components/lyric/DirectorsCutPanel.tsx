import { useMemo, useState } from "react";
import { Loader2, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import type { SceneManifest } from "@/engine/SceneManifest";
import { PaletteEditor } from "./PaletteEditor";

const PARTICLE_SYSTEMS = [
  "none",
  "rain",
  "snow",
  "smoke",
  "dust",
  "sparks",
  "petals",
  "ash",
  "light_beams",
] as const;

const TYPOGRAPHY_PERSONAS: SceneManifest["typographyProfile"]["personality"][] = [
  "MONUMENTAL",
  "ELEGANT DECAY",
  "RAW TRANSCRIPT",
  "HANDWRITTEN MEMORY",
  "SHATTERED DISPLAY",
  "INVISIBLE INK",
];

export interface DirectorsCutPanelProps {
  manifest: SceneManifest;
  isOpen: boolean;
  isRegenerating: boolean;
  onClose: () => void;
  onRegenerateWithDirection: (direction: string) => Promise<void>;
  onFieldOverride: (field: keyof SceneManifest | string, value: unknown) => void;
  onApply: () => void;
  diff?: Array<{ field: string; from: string; to: string }>;
}

function labelFor(field: string): string {
  const map: Record<string, string> = {
    world: "Scene",
    backgroundSystem: "Background",
    tension: "Tension",
    beatResponse: "Beat response",
    contrastMode: "Contrast",
    backgroundIntensity: "Background intensity",
    letterPersonality: "Letter personality",
    palette: "Palette",
    particles: "Particles",
  };
  return map[field] ?? field;
}

export function DirectorsCutPanel({
  manifest,
  isOpen,
  isRegenerating,
  onClose,
  onRegenerateWithDirection,
  onFieldOverride,
  onApply,
  diff = [],
}: DirectorsCutPanelProps) {
  const [direction, setDirection] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const panelClasses = useMemo(
    () =>
      `fixed z-[95] bg-background/95 backdrop-blur-md border-border/50 shadow-2xl transition-transform duration-300 ease-out
       bottom-0 left-0 right-0 h-[85vh] border-t rounded-t-2xl
       md:top-0 md:right-0 md:left-auto md:bottom-0 md:h-full md:w-[440px] md:border-l md:rounded-none md:border-t-0
       ${isOpen
         ? "translate-y-0 md:translate-y-0 md:translate-x-0"
         : "translate-y-full md:translate-y-0 md:translate-x-full pointer-events-none"
       }`,
    [isOpen],
  );

  return (
    <aside className={panelClasses}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border/50 p-4">
          <div>
            <p className="text-sm font-semibold">Director&apos;s Cut</p>
            <p className="text-xs text-muted-foreground">Guide or override this world in real time.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 p-4">
          <section className="space-y-2">
            <label className="text-xs font-medium">Describe the world this song lives in</label>
            <Textarea
              placeholder="a rain-soaked street at 3am, one flickering streetlight, no one else around..."
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              className="min-h-[96px]"
            />
            <p className="text-[11px] text-muted-foreground">
              Describe a place, not a mood. Where are you standing? What does the light look like? What&apos;s moving in the air?
            </p>
            <Button
              className="w-full"
              disabled={isRegenerating || !direction.trim()}
              onClick={() => onRegenerateWithDirection(direction.trim())}
            >
              {isRegenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
              Regenerate with Direction
            </Button>
          </section>

          <section className="rounded-lg border border-border/50 p-3">
            <button
              className="w-full text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              Field Overrides (advanced)
            </button>

            {advancedOpen && (
              <div className="mt-3 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs">Scene</label>
                  <Textarea value={manifest.world} onChange={(e) => onFieldOverride("world", e.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-xs">Emotional core</label>
                  <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={manifest.coreEmotion} onChange={(e) => onFieldOverride("coreEmotion", e.target.value)} />
                </div>

                <details open className="space-y-2">
                  <summary className="cursor-pointer text-xs font-semibold">Environment</summary>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={manifest.backgroundSystem} onChange={(e) => onFieldOverride("backgroundSystem", e.target.value)}>
                    {(["fracture", "pressure", "breath", "static", "burn", "void"] as const).map((opt) => <option key={opt}>{opt}</option>)}
                  </select>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" defaultValue="none" onChange={(e) => onFieldOverride("particleConfig.system", e.target.value)}>
                    {PARTICLE_SYSTEMS.map((sys) => <option key={sys}>{sys}</option>)}
                  </select>
                  <div className="space-y-1">
                    <p className="text-xs">Particle density</p>
                    <Slider defaultValue={[0.4]} max={1} min={0} step={0.05} onValueChange={(v) => onFieldOverride("particleConfig.density", v[0])} />
                  </div>
                </details>

                <details open className="space-y-2">
                  <summary className="cursor-pointer text-xs font-semibold">Color &amp; Light</summary>
                  <PaletteEditor palette={manifest.palette} onChange={(palette) => onFieldOverride("palette", palette)} />
                  <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={manifest.lightSource} onChange={(e) => onFieldOverride("lightSource", e.target.value)} />
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={manifest.contrastMode} onChange={(e) => onFieldOverride("contrastMode", e.target.value)}>
                    {(["brutal", "soft", "neon", "ghost", "raw"] as const).map((opt) => <option key={opt}>{opt}</option>)}
                  </select>
                </details>

                <details open className="space-y-2">
                  <summary className="cursor-pointer text-xs font-semibold">Physics</summary>
                  <Slider value={[manifest.tension]} max={1} min={0} step={0.05} onValueChange={(v) => onFieldOverride("tension", v[0])} />
                  <p className="text-[11px] text-muted-foreground">
                    {manifest.tension < 0.3 ? "calm" : manifest.tension < 0.6 ? "present" : manifest.tension < 0.8 ? "intense" : "maximum"}
                  </p>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={manifest.beatResponse} onChange={(e) => onFieldOverride("beatResponse", e.target.value)}>
                    {(["seismic", "breath", "pulse", "ripple", "slam"] as const).map((opt) => <option key={opt}>{opt}</option>)}
                  </select>
                </details>

                <details open className="space-y-2">
                  <summary className="cursor-pointer text-xs font-semibold">Type</summary>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={manifest.typographyProfile.personality} onChange={(e) => onFieldOverride("typographyProfile.personality", e.target.value)}>
                    {TYPOGRAPHY_PERSONAS.map((opt) => <option key={opt}>{opt}</option>)}
                  </select>
                </details>

                <Button variant="secondary" className="w-full" onClick={onApply}>Apply Overrides</Button>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border/50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Manifest Diff</p>
            {diff.length === 0 ? (
              <p className="text-xs text-muted-foreground">The AI kept the same world — try a more specific scene description.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {diff.map((change) => (
                  <li key={`${change.field}-${change.from}-${change.to}`}>
                    <span className="font-medium">{labelFor(change.field)}:</span> {change.from} → {change.to}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </aside>
  );
}

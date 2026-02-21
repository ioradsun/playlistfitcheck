import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { ArtistData, Blueprint, PlanVariantType } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";

interface ProFitReportProps {
  artist: ArtistData;
  blueprint: Blueprint;
  reportId: string;
  shareToken: string;
  onBack: () => void;
  onOpenChat: () => void;
  onHeaderProject?: (project: { title: string; onBack: () => void } | null) => void;
}

const FOCUS_PLAN_OPTIONS: { type: PlanVariantType; label: string }[] = [
  { type: "7day", label: "7-Day Sprint" },
  { type: "30day", label: "30-Day Plan" },
  { type: "streams", label: "Streaming Focus" },
  { type: "live", label: "Live Strategy" },
  { type: "services", label: "Services" },
  { type: "digital", label: "Digital" },
];

const tierColors: Record<string, string> = {
  "Emerging": "bg-muted text-foreground",
  "Rising": "bg-primary/10 text-primary",
  "Established": "bg-primary/20 text-primary",
  "Major": "bg-foreground text-background",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground/50 mb-3">
      {children}
    </p>
  );
}

export const ProFitReport = ({ artist, blueprint: bp, reportId, shareToken, onBack, onOpenChat, onHeaderProject }: ProFitReportProps) => {
  const [signalsOpen, setSignalsOpen] = useState(false);
  const [focusPlan, setFocusPlan] = useState<any>(null);
  const [focusLoading, setFocusLoading] = useState<PlanVariantType | null>(null);

  const copyBlueprint = useCallback(() => {
    const text = JSON.stringify(bp, null, 2);
    navigator.clipboard.writeText(text);
    toast.success("Blueprint copied");
  }, [bp]);

  const generateFocusPlan = useCallback(async (type: PlanVariantType) => {
    setFocusLoading(type);
    try {
      const { data, error } = await supabase.functions.invoke("profit-focus-plan", {
        body: { reportId, variantType: type },
      });
      if (error) throw error;
      setFocusPlan(data);
    } catch {
      toast.error("Failed to generate plan");
    } finally {
      setFocusLoading(null);
    }
  }, [bp, artist]);

  useEffect(() => {
    onHeaderProject?.({ title: artist.name, onBack });
    return () => onHeaderProject?.(null);
  }, [artist.name, onBack, onHeaderProject]);

  return (
    <div className="w-full max-w-4xl mx-auto pb-12 space-y-10">

      {/* Top bar */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={copyBlueprint}>Copy Blueprint</Button>
        <Button variant="outline" size="sm" onClick={onOpenChat}>Refine Strategy</Button>
      </div>

      {/* Artist Header */}
      <div className="flex gap-6 items-start flex-wrap sm:flex-nowrap">
        {artist.image_url && (
          <img src={artist.image_url} alt={artist.name} className="w-20 h-20 rounded-sm object-cover flex-shrink-0 border border-border/20" />
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-[24px] font-bold tracking-tight">{artist.name}</h1>
            <span className={`text-[11px] font-medium tracking-wide uppercase border border-border/40 px-2 py-0.5 rounded-sm ${tierColors[bp.tier.name] || "bg-muted text-foreground"}`}>
              {bp.tier.name}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{bp.tier.reason}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {artist.genres.slice(0, 5).map(g => (
              <span key={g} className="text-xs border border-border/40 px-2 py-0.5 rounded-sm text-muted-foreground">{g}</span>
            ))}
          </div>
          <div className="flex gap-4 pt-1">
            <p className="text-xs text-muted-foreground">{artist.followers_total.toLocaleString()} followers</p>
            <p className="text-xs text-muted-foreground">Popularity: {artist.popularity}/100</p>
          </div>
        </div>
      </div>

      {/* Artist Snapshot */}
      <div>
        <Label>Artist Snapshot</Label>
        <p className="text-sm text-foreground/80 leading-relaxed mb-4">{bp.artistSnapshot.positioning}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-muted-foreground/50 mb-0.5">Bottleneck</p>
            <p className="text-sm text-foreground/80">{bp.artistSnapshot.bottleneck}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground/50 mb-0.5">Best Lane</p>
            <p className="text-sm text-foreground/80">{bp.artistSnapshot.bestLane}</p>
          </div>
        </div>
      </div>

      {/* Signals (collapsible) */}
      <Collapsible open={signalsOpen} onOpenChange={setSignalsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between py-3 text-left">
            <span className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground/50">Signals Used</span>
            <ChevronDown size={14} strokeWidth={1.5} className={`text-muted-foreground/40 transition-transform ${signalsOpen ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pb-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {bp.signalsUsed.map((s, i) => (
              <div key={i} className="space-y-0.5">
                <p className="text-xs text-muted-foreground/50">{s.label}</p>
                <p className="text-sm text-foreground/80 font-medium">{s.value}</p>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Revenue Scorecard */}
      <div>
        <Label>Revenue Leverage Scorecard</Label>
        <div className="space-y-4">
          {bp.scorecard.map((s) => (
            <div key={s.pillar} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/80">{s.pillar}</span>
                <span className="font-mono text-sm font-semibold">{s.score}/10</span>
              </div>
              <div className="h-px bg-border/20 w-full relative">
                <div className="absolute inset-y-0 left-0 bg-foreground/20" style={{ width: `${s.score * 10}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{s.why}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top 3 Moves */}
      <div>
        <Label>Top 3 Money Moves · Next 30 Days</Label>
        <div className="space-y-6">
          {bp.topMoves.map((move) => (
            <div key={move.rank} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="font-mono text-xs text-muted-foreground/40 w-5 shrink-0 pt-0.5">0{move.rank}</span>
                  <h3 className="text-sm font-medium text-foreground">{move.title}</h3>
                </div>
                <span className="text-xs text-muted-foreground/50 shrink-0">{move.timeCost}</span>
              </div>
              <div className="pl-8 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground/50 mb-1">Why this fits</p>
                  <ul className="space-y-1">
                    {move.whyFits.map((w, i) => <li key={i} className="text-sm text-foreground/70">— {w}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground/50 mb-1">Steps</p>
                  <ol className="space-y-1 list-decimal list-inside">
                    {move.steps.map((s, i) => <li key={i} className="text-sm text-foreground/70">{s}</li>)}
                  </ol>
                </div>
                <p className="text-sm text-muted-foreground">{move.outcome}</p>
                {move.measurement.length > 0 && (
                  <p className="text-xs text-muted-foreground/40">Measure: {move.measurement.join(" · ")}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What to Ignore */}
      <div>
        <Label>What to Ignore Right Now</Label>
        <ul className="space-y-1.5">
          {bp.ignoreNow.map((item, i) => (
            <li key={i} className="text-sm text-foreground/70 flex items-start gap-2">
              <span className="text-score-bad shrink-0 text-xs mt-0.5">✕</span> {item}
            </li>
          ))}
        </ul>
      </div>

      {/* 90-Day Roadmap */}
      <div>
        <Label>90-Day Monetization Roadmap</Label>
        <div className="grid gap-6 sm:grid-cols-3">
          {(["month1", "month2", "month3"] as const).map((month, idx) => (
            <div key={month} className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground/50">Month {idx + 1}</p>
                <p className="text-sm font-medium text-foreground/80">
                  {idx === 0 ? "Cash Injection" : idx === 1 ? "Audience Density" : "Asset Building"}
                </p>
              </div>
              <ul className="space-y-1">
                {bp.roadmap90[month].map((item, i) => (
                  <li key={i} className="text-sm text-foreground/70 flex items-start gap-2">
                    <span className="text-muted-foreground/40 shrink-0">→</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Checklist */}
      <div>
        <Label>Weekly Execution Checklist</Label>
        <div className="grid gap-6 sm:grid-cols-2">
          {(["week1", "week2"] as const).map((week, idx) => (
            <div key={week} className="space-y-2">
              <p className="text-xs text-muted-foreground/50">Week {idx + 1}</p>
              <ul className="space-y-1.5">
                {bp.weeklyChecklist[week].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/70">
                    <input type="checkbox" className="mt-0.5 accent-foreground" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Single ROI Focus */}
      <div>
        <Label>If You Only Do One Thing</Label>
        <h2 className="text-[18px] font-semibold tracking-tight">{bp.singleROIFocus.focus}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mt-1 max-w-xl">{bp.singleROIFocus.why}</p>
      </div>

      {/* Generate Focus Plan */}
      <div>
        <Label>Generate a Focus Plan</Label>
        <div className="flex flex-wrap gap-2">
          {FOCUS_PLAN_OPTIONS.map(({ type, label }) => (
            <Button
              key={type}
              variant="outline"
              size="sm"
              onClick={() => generateFocusPlan(type)}
              disabled={focusLoading !== null}
            >
              {focusLoading === type ? "Loading…" : label}
            </Button>
          ))}
        </div>
      </div>

      {/* Focus Plan Result */}
      {focusPlan && (
        <div className="space-y-4">
          <Label>{focusPlan.title}</Label>
          <p className="text-sm text-muted-foreground">{focusPlan.summary}</p>
          <div className="space-y-2">
            {(focusPlan.tasks || []).map((t: any, i: number) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-border/10">
                <span className="text-xs text-muted-foreground/40 w-16 shrink-0 pt-0.5">{t.day}</span>
                <span className="flex-1 text-sm text-foreground/70">{t.task}</span>
                <span className={`text-xs uppercase shrink-0 ${t.priority === "high" ? "text-score-bad" : "text-muted-foreground/40"}`}>{t.priority}</span>
              </div>
            ))}
          </div>
          {focusPlan.expectedOutcome && (
            <div>
              <p className="text-xs text-muted-foreground/50 mb-0.5">Outcome</p>
              <p className="text-sm text-foreground/80">{focusPlan.expectedOutcome}</p>
            </div>
          )}
        </div>
      )}

      {/* Bottom CTA */}
      <div className="flex justify-start">
        <Button onClick={onOpenChat}>Refine This Strategy</Button>
      </div>

      <SignUpToSaveBanner />
    </div>
  );
};

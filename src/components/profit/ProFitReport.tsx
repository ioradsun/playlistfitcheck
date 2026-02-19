import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Copy, ChevronDown, ChevronUp } from "lucide-react";
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

export const ProFitReport = ({ artist, blueprint: bp, reportId, shareToken, onBack, onOpenChat }: ProFitReportProps) => {
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

  return (
    <div className="w-full max-w-4xl mx-auto pb-12 divide-y divide-border/30">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 pb-6 flex-wrap">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft size={18} strokeWidth={1.5} />
        </Button>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={copyBlueprint}>Copy Blueprint</Button>
          <Button variant="outline" size="sm" onClick={onOpenChat}>Refine Strategy</Button>
        </div>
      </div>

      {/* Artist Header */}
      <div className="py-8 flex gap-6 items-start flex-wrap sm:flex-nowrap">
        {artist.image_url && (
          <img src={artist.image_url} alt={artist.name} className="w-20 h-20 rounded-sm object-cover flex-shrink-0 border border-border/20" />
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-[24px] font-bold tracking-tight truncate">{artist.name}</h1>
            <span className={`font-mono text-[9px] tracking-widest uppercase border border-border/40 px-2 py-0.5 rounded-sm ${tierColors[bp.tier.name] || "bg-muted text-foreground"}`}>
              {bp.tier.name}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{bp.tier.reason}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {artist.genres.slice(0, 5).map(g => (
              <span key={g} className="font-mono text-[9px] tracking-widest border border-border/40 px-2 py-0.5 rounded-sm text-muted-foreground">{g}</span>
            ))}
          </div>
          <div className="flex gap-4 pt-1">
            <p className="font-mono text-[11px] text-muted-foreground">{artist.followers_total.toLocaleString()} followers</p>
            <p className="font-mono text-[11px] text-muted-foreground">Popularity: {artist.popularity}/100</p>
          </div>
        </div>
      </div>

      {/* Artist Snapshot */}
      <div className="py-8 space-y-4">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Artist Snapshot</p>
        <p className="text-sm text-foreground leading-relaxed">{bp.artistSnapshot.positioning}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-border/20">
          <div className="space-y-1">
            <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Bottleneck</p>
            <p className="text-sm text-foreground">{bp.artistSnapshot.bottleneck}</p>
          </div>
          <div className="space-y-1">
            <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Best Lane</p>
            <p className="text-sm text-foreground">{bp.artistSnapshot.bestLane}</p>
          </div>
        </div>
      </div>

      {/* Signals (collapsible) */}
      <Collapsible open={signalsOpen} onOpenChange={setSignalsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between py-5 text-left">
            <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Signals Used</p>
            {signalsOpen ? <ChevronUp size={14} strokeWidth={1.5} className="text-muted-foreground" /> : <ChevronDown size={14} strokeWidth={1.5} className="text-muted-foreground" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pb-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {bp.signalsUsed.map((s, i) => (
              <div key={i} className="space-y-0.5 border-b border-border/20 pb-2">
                <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">{s.label}</p>
                <p className="text-[11px] text-foreground font-medium">{s.value}</p>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Revenue Scorecard */}
      <div className="py-8 space-y-5">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Revenue Leverage Scorecard</p>
        {bp.scorecard.map((s) => (
          <div key={s.pillar} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{s.pillar}</span>
              <span className="font-mono text-sm font-semibold">{s.score}/10</span>
            </div>
            <div className="h-[1px] bg-border/30 w-full relative">
              <div className="absolute top-0 left-0 h-full bg-foreground/25" style={{ width: `${s.score * 10}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground">{s.why}</p>
          </div>
        ))}
      </div>

      {/* Top 3 Moves */}
      <div className="py-8 space-y-6">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Top 3 Money Moves · Next 30 Days</p>
        {bp.topMoves.map((move) => (
          <div key={move.rank} className="space-y-4 border-b border-border/20 pb-6 last:border-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="font-mono text-[11px] text-muted-foreground/60 w-5 shrink-0 pt-0.5">0{move.rank}</span>
                <h3 className="text-sm font-semibold text-foreground">{move.title}</h3>
              </div>
              <span className="font-mono text-[9px] tracking-widest text-muted-foreground/60 border border-border/30 px-2 py-0.5 rounded-sm shrink-0">{move.timeCost}</span>
            </div>
            <div className="pl-8 space-y-3">
              <div>
                <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase mb-1.5">Why this fits</p>
                <ul className="space-y-1">
                  {move.whyFits.map((w, i) => <li key={i} className="text-[11px] text-foreground">— {w}</li>)}
                </ul>
              </div>
              <div>
                <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase mb-1.5">Steps</p>
                <ol className="space-y-1 list-decimal list-inside">
                  {move.steps.map((s, i) => <li key={i} className="text-[11px] text-foreground">{s}</li>)}
                </ol>
              </div>
              <p className="text-[11px] text-muted-foreground">{move.outcome}</p>
              {move.measurement.length > 0 && (
                <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60">Measure: {move.measurement.join(" · ")}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* What to Ignore */}
      <div className="py-8 space-y-3">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">What to Ignore Right Now</p>
        <ul className="space-y-2">
          {bp.ignoreNow.map((item, i) => (
            <li key={i} className="text-sm text-foreground flex items-start gap-2.5">
              <span className="font-mono text-score-bad shrink-0 mt-0.5">✕</span> {item}
            </li>
          ))}
        </ul>
      </div>

      {/* 90-Day Roadmap */}
      <div className="py-8 space-y-4">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">90-Day Monetization Roadmap</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {(["month1", "month2", "month3"] as const).map((month, idx) => (
            <div key={month} className="space-y-3 border-t border-border/30 pt-4">
              <div>
                <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Month {idx + 1}</p>
                <p className="text-[11px] font-semibold text-foreground mt-0.5">
                  {idx === 0 ? "Cash Injection" : idx === 1 ? "Audience Density" : "Asset Building"}
                </p>
              </div>
              <ul className="space-y-1.5">
                {bp.roadmap90[month].map((item, i) => (
                  <li key={i} className="text-[11px] text-foreground flex items-start gap-2">
                    <span className="text-muted-foreground shrink-0">→</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Checklist */}
      <div className="py-8 space-y-4">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Weekly Execution Checklist</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["week1", "week2"] as const).map((week, idx) => (
            <div key={week} className="space-y-3 border-t border-border/30 pt-4">
              <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Week {idx + 1}</p>
              <ul className="space-y-1.5">
                {bp.weeklyChecklist[week].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-foreground">
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
      <div className="py-8 space-y-2">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">If You Only Do One Thing</p>
        <h2 className="text-[18px] font-semibold tracking-tight">{bp.singleROIFocus.focus}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">{bp.singleROIFocus.why}</p>
      </div>

      {/* Generate Focus Plan */}
      <div className="py-8 space-y-4">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Generate a Focus Plan</p>
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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="py-8 space-y-4">
          <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">{focusPlan.title}</p>
          <p className="text-sm text-muted-foreground">{focusPlan.summary}</p>
          <div className="space-y-2">
            {(focusPlan.tasks || []).map((t: any, i: number) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-border/20">
                <span className="font-mono text-[9px] tracking-widest text-muted-foreground/60 w-16 shrink-0 pt-0.5">{t.day}</span>
                <span className="flex-1 text-[11px] text-foreground">{t.task}</span>
                <span className={`font-mono text-[9px] tracking-widest uppercase shrink-0 ${t.priority === "high" ? "text-score-bad" : "text-muted-foreground/60"}`}>{t.priority}</span>
              </div>
            ))}
          </div>
          {focusPlan.expectedOutcome && (
            <p className="text-[11px] text-foreground"><span className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase mr-2">Outcome:</span>{focusPlan.expectedOutcome}</p>
          )}
        </motion.div>
      )}

      {/* Bottom CTA */}
      <div className="py-8 flex justify-start">
        <Button onClick={onOpenChat}>Refine This Strategy</Button>
      </div>

      <SignUpToSaveBanner />
    </div>
  );
};

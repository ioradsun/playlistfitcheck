import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ArrowLeft, Copy, Download, MessageSquare, ChevronDown, ChevronUp,
  Star, AlertTriangle, CheckSquare, Target, Zap, TrendingUp, Music,
  Calendar, Clock
} from "lucide-react";
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

const pillarIcons: Record<string, any> = {
  Streaming: Music,
  Live: Zap,
  Services: Target,
  Digital: Download,
  BrandLicensing: Star,
};

const tierColors: Record<string, string> = {
  Foundation: "bg-muted text-muted-foreground",
  Growth: "bg-blue-500/10 text-blue-400",
  Expansion: "bg-primary/10 text-primary",
  Leverage: "bg-yellow-500/10 text-yellow-400",
};

const FOCUS_PLAN_OPTIONS: { type: PlanVariantType; label: string; icon: any }[] = [
  { type: "7day", label: "7-Day Plan", icon: Calendar },
  { type: "30day", label: "30-Day Plan", icon: Calendar },
  { type: "streams", label: "Focus: Streams", icon: Music },
  { type: "live", label: "Focus: Live", icon: Zap },
  { type: "services", label: "Focus: Services", icon: Target },
  { type: "digital", label: "Focus: Digital", icon: Download },
  { type: "aggressive", label: "Aggressive Growth", icon: TrendingUp },
  { type: "lowrisk", label: "Low-Risk Stable", icon: CheckSquare },
];

export const ProFitReport = ({ artist, blueprint, reportId, shareToken, onBack, onOpenChat }: ProFitReportProps) => {
  const [signalsOpen, setSignalsOpen] = useState(false);
  const [focusPlan, setFocusPlan] = useState<any>(null);
  const [focusLoading, setFocusLoading] = useState<string | null>(null);

  const bp = blueprint;

  const copyBlueprint = useCallback(() => {
    const text = `ProFit Blueprint: ${artist.name}
Tier: ${bp.tier.name} — ${bp.tier.reason}

${bp.artistSnapshot.positioning}
Bottleneck: ${bp.artistSnapshot.bottleneck}
Best Lane: ${bp.artistSnapshot.bestLane}

Revenue Scorecard:
${bp.scorecard.map(s => `  ${s.pillar}: ${s.score}/10 — ${s.why}`).join("\n")}

Top 3 Money Moves:
${bp.topMoves.map(m => `  #${m.rank}: ${m.title}\n    Steps: ${m.steps.join(", ")}`).join("\n\n")}

What to Ignore:
${bp.ignoreNow.map(i => `  - ${i}`).join("\n")}

90-Day Roadmap:
  Month 1: ${bp.roadmap90.month1.join("; ")}
  Month 2: ${bp.roadmap90.month2.join("; ")}
  Month 3: ${bp.roadmap90.month3.join("; ")}

#1 Focus: ${bp.singleROIFocus.focus}
${bp.singleROIFocus.why}`;
    navigator.clipboard.writeText(text);
    toast.success("Blueprint copied to clipboard");
  }, [artist, bp]);

  const generateFocusPlan = useCallback(async (variantType: PlanVariantType) => {
    setFocusLoading(variantType);
    try {
      const { data, error } = await supabase.functions.invoke("profit-focus-plan", {
        body: { variantType, blueprint: bp, artistData: artist },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setFocusPlan({ type: variantType, ...data });
    } catch (e: any) {
      toast.error(e.message || "Failed to generate plan");
    } finally {
      setFocusLoading(null);
    }
  }, [bp, artist]);

  return (
    <motion.div
      className="w-full max-w-4xl mx-auto space-y-6 pb-12"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={copyBlueprint}>Copy</Button>
          <Button variant="outline" size="sm" onClick={onOpenChat}>Refine Strategy</Button>
        </div>
      </div>

      {/* Artist Header */}
      <Card className="overflow-hidden border-border/20">
        <CardContent className="p-5 flex gap-5 items-start flex-wrap sm:flex-nowrap">
          {artist.image_url && (
            <img src={artist.image_url} alt={artist.name} className="w-24 h-24 rounded-lg object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold truncate">{artist.name}</h2>
              <Badge className={tierColors[bp.tier.name] || "bg-muted"}>
                Tier: {bp.tier.name}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{bp.tier.reason}</p>
            <div className="flex flex-wrap gap-1.5">
              {artist.genres.slice(0, 5).map(g => (
                <Badge key={g} variant="outline" className="text-[10px]">{g}</Badge>
              ))}
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground pt-1">
              <span>{artist.followers_total.toLocaleString()} followers</span>
              <span>Popularity: {artist.popularity}/100</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Snapshot */}
      <Card className="border-border/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Target size={16} /> Artist Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{bp.artistSnapshot.positioning}</p>
          <p className="text-muted-foreground"><strong>Bottleneck:</strong> {bp.artistSnapshot.bottleneck}</p>
          <p className="text-primary"><strong>Best Lane:</strong> {bp.artistSnapshot.bestLane}</p>
        </CardContent>
      </Card>

      {/* Signals */}
      <Collapsible open={signalsOpen} onOpenChange={setSignalsOpen}>
          <Card className="border-border/20">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2"><TrendingUp size={16} /> Signals Used</span>
                {signalsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-0">
              {bp.signalsUsed.map((s, i) => (
                <div key={i} className="p-2 rounded-md bg-muted/50">
                  <div className="text-muted-foreground">{s.label}</div>
                  <div className="font-medium">{s.value}</div>
                </div>
              ))}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Scorecard */}
      <Card className="border-border/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Revenue Leverage Scorecard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {bp.scorecard.map((s) => {
            const Icon = pillarIcons[s.pillar] || Star;
            return (
              <div key={s.pillar} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <Icon size={14} /> {s.pillar}
                  </span>
                  <span className="text-primary font-bold">{s.score}/10</span>
                </div>
                <Progress value={s.score * 10} className="h-2" />
                <p className="text-xs text-muted-foreground">{s.why}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Top 3 Moves */}
      <Card className="border-border/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Zap size={16} /> Top 3 Money Moves (Next 30 Days)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {bp.topMoves.map((move) => (
            <div key={move.rank} className="space-y-3 p-4 rounded-lg border border-border/50 bg-card">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {move.rank}
                  </span>
                  {move.title}
                </h4>
                <Badge variant="outline" className="text-[10px] flex-shrink-0">
                  <Clock size={10} className="mr-1" /> {move.timeCost}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Why this fits:</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {move.whyFits.map((w, i) => <li key={i}>• {w}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Steps:</p>
                <ol className="text-xs space-y-0.5 list-decimal list-inside">
                  {move.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
              <div className="flex gap-4 text-xs">
                <div><span className="text-muted-foreground">Outcome:</span> {move.outcome}</div>
              </div>
              {move.measurement.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Measure: {move.measurement.join(" · ")}</p>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Ignore Now */}
      <Card className="border-border/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle size={16} /> What to Ignore Right Now</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm">
            {bp.ignoreNow.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-muted-foreground">
                <span className="text-destructive mt-0.5">✕</span> {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* 90-Day Roadmap */}
      <Card className="border-border/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Calendar size={16} /> 90-Day Monetization Roadmap</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {(["month1", "month2", "month3"] as const).map((month, idx) => (
            <div key={month} className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/30">
              <h5 className="text-xs font-semibold text-primary">
                Month {idx + 1}: {idx === 0 ? "Cash Injection" : idx === 1 ? "Audience Density" : "Asset Building"}
              </h5>
              <ul className="text-xs space-y-1">
                {bp.roadmap90[month].map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">→</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Weekly Checklist */}
      <Card className="border-border/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><CheckSquare size={16} /> Weekly Execution Checklist</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {(["week1", "week2"] as const).map((week, idx) => (
            <div key={week} className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/30">
              <h5 className="text-xs font-semibold">Week {idx + 1}</h5>
              <ul className="text-xs space-y-1">
                {bp.weeklyChecklist[week].map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <input type="checkbox" className="mt-0.5 accent-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Single ROI Focus */}
      <Card className="border-primary/15 bg-primary/5">
        <CardContent className="p-5 text-center space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">🎯 If you only do one thing</p>
          <h3 className="text-lg font-bold text-primary">{bp.singleROIFocus.focus}</h3>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">{bp.singleROIFocus.why}</p>
        </CardContent>
      </Card>

      {/* Focus Plan Generators */}
      <Card className="border-border/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Generate a Focus Plan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {FOCUS_PLAN_OPTIONS.map(({ type, label, icon: Icon }) => (
            <Button
              key={type}
              variant="outline"
              size="sm"
              onClick={() => generateFocusPlan(type)}
              disabled={focusLoading !== null}
              className="text-xs"
            >
              {focusLoading === type ? "Loading…" : label}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Focus Plan Result */}
      {focusPlan && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{focusPlan.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{focusPlan.summary}</p>
              <div className="space-y-1.5">
                {(focusPlan.tasks || []).map((t: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-muted/30">
                    <Badge variant="outline" className="text-[9px] flex-shrink-0">{t.day}</Badge>
                    <span className="flex-1">{t.task}</span>
                    <Badge variant={t.priority === "high" ? "destructive" : "secondary"} className="text-[9px]">
                      {t.priority}
                    </Badge>
                  </div>
                ))}
              </div>
              {focusPlan.expectedOutcome && (
                <p className="text-xs text-primary"><strong>Expected Outcome:</strong> {focusPlan.expectedOutcome}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Bottom CTAs */}
      <div className="flex justify-center gap-3 pt-4">
        <Button onClick={onOpenChat} className="gap-2">
          <MessageSquare size={16} /> Refine This Strategy
        </Button>
      </div>
      <SignUpToSaveBanner />
    </motion.div>
  );
};

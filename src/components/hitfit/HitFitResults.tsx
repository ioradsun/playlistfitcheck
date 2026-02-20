import { motion } from "framer-motion";
import { ArrowLeft, Trophy, Target, AlertTriangle, CheckCircle2, ChevronDown, Flame, Zap, TrendingUp, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";

interface Dimension {
  name: string;
  score: number;
  label: string;
  feedback: string;
}

interface PerformanceInsight {
  type: string;
  title: string;
  description: string;
}

interface MasterAnalysis {
  filename: string;
  overallScore: number;
  overallLabel: string;
  summary: string;
  dimensions: Dimension[];
  performanceInsights?: PerformanceInsight[];
  topStrength: string;
  mainWeakness: string;
  actionableNote: string;
}

export interface HitFitAnalysis {
  overallVerdict: string;
  hitPotential?: { score: number; label: string; summary: string };
  shortFormPotential?: { score: number; label: string; summary: string };
  referenceProfile: { description: string; strengths: string[]; gaps: string[] };
  masters: MasterAnalysis[];
  headToHead: { winner: string | null; reason: string };
}

const dimensionLabels: Record<string, string> = {
  hookStrength: "Hook Strength",
  productionQuality: "Production Quality",
  vocalPerformance: "Vocal Performance",
  genreAlignment: "Genre Alignment",
  dynamicRange: "Dynamic Range",
  commercialViability: "Commercial Viability",
  structureClarity: "Structure Clarity",
  emotionalImpact: "Emotional Impact",
};

const performanceLabels: Record<string, { label: string }> = {
  streaming: { label: "Streaming" },
  sync: { label: "Sync Licensing" },
  radio: { label: "Radio" },
  live: { label: "Live" },
  social: { label: "Social / Short-Form" },
};

function getScoreColor(score: number): string {
  if (score >= 80) return "text-score-excellent";
  if (score >= 65) return "text-score-strong";
  if (score >= 50) return "text-score-ok";
  if (score >= 35) return "text-score-weak";
  return "text-score-bad";
}

function ScorePill({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-mono text-2xl font-semibold ${getScoreColor(score)}`}>{score}</span>
      <span className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">{label}</span>
    </div>
  );
}

function MasterCard({ master, index }: { master: MasterAnalysis; index: number }) {
  const [open, setOpen] = useState(index === 0);

  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        className="w-full flex items-center justify-between py-5 text-left gap-3"
        onClick={() => setOpen(!open)}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Master {index + 1}</p>
          <p className="text-sm font-semibold truncate">{master.filename}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className={`font-mono text-xl font-semibold ${getScoreColor(master.overallScore)}`}>{master.overallScore}</p>
            <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">{master.overallLabel}</p>
          </div>
          <ChevronDown size={14} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.5} />
        </div>
      </button>

      {open && (
        <div className="pb-6 space-y-6">
          <p className="text-sm text-foreground leading-relaxed">{master.summary}</p>

          {/* Dimensions */}
          <div className="space-y-3">
            <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Dimensions</p>
            {master.dimensions.map((dim) => (
              <div key={dim.name} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground">{dimensionLabels[dim.name] || dim.name}</span>
                  <span className={`font-mono text-xs font-semibold ${getScoreColor(dim.score)}`}>{dim.score}</span>
                </div>
                <div className="h-[1px] bg-border/30 w-full relative">
                  <div
                    className="absolute top-0 left-0 h-full bg-foreground/20"
                    style={{ width: `${dim.score}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">{dim.feedback}</p>
              </div>
            ))}
          </div>

          {/* Performance Insights */}
          {master.performanceInsights && master.performanceInsights.length > 0 && (
            <div className="space-y-3">
              <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Platform Fit</p>
              <div className="space-y-2">
                {master.performanceInsights.map((insight) => (
                  <div key={insight.type} className="flex items-start gap-3">
                    <span className="font-mono text-[11px] text-muted-foreground/60 w-24 shrink-0 pt-0.5">
                      {performanceLabels[insight.type]?.label || insight.type}
                    </span>
                    <p className="text-[11px] text-foreground leading-snug">{insight.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strength / Weakness / Note */}
          <div className="grid grid-cols-1 gap-4 border-t border-border/20 pt-4">
            <div className="space-y-1">
              <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Top Strength</p>
              <p className="text-[11px] text-foreground">{master.topStrength}</p>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Main Gap</p>
              <p className="text-[11px] text-foreground">{master.mainWeakness}</p>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Action</p>
              <p className="text-[11px] text-foreground">{master.actionableNote}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  analysis: HitFitAnalysis;
  onBack: () => void;
}

export function HitFitResults({ analysis, onBack }: Props) {
  return (
    <div className="w-full max-w-2xl mx-auto pb-24 divide-y divide-border/30">

      {/* Header */}
      <div className="flex items-center gap-3 pb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft size={18} strokeWidth={1.5} />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-semibold tracking-tight">Hit Potential Analysis</h1>
          <p className="font-mono text-[11px] text-muted-foreground mt-0.5 leading-snug">{analysis.overallVerdict}</p>
        </div>
      </div>

      {/* Hit + Short-Form Potential */}
      {(analysis.hitPotential || analysis.shortFormPotential) && (
        <div className="py-8 grid grid-cols-1 sm:grid-cols-2 gap-8">
          {analysis.hitPotential && (
            <div className="space-y-2">
              <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Hit Potential</p>
              <ScorePill score={analysis.hitPotential.score} label={analysis.hitPotential.label} />
              <p className="text-[11px] text-muted-foreground leading-snug">{analysis.hitPotential.summary}</p>
            </div>
          )}
          {analysis.shortFormPotential && (
            <div className="space-y-2">
              <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Short-Form Potential</p>
              <ScorePill score={analysis.shortFormPotential.score} label={analysis.shortFormPotential.label} />
              <p className="text-[11px] text-muted-foreground leading-snug">{analysis.shortFormPotential.summary}</p>
            </div>
          )}
        </div>
      )}

      {/* Reference Profile */}
      <div className="py-8 space-y-4">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Reference Profile</p>
        <p className="text-sm text-foreground leading-relaxed">{analysis.referenceProfile.description}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {analysis.referenceProfile.strengths.length > 0 && (
            <div className="space-y-2">
              <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Strengths</p>
              <ul className="space-y-1">
                {analysis.referenceProfile.strengths.map((s, i) => (
                  <li key={i} className="text-[11px] text-foreground flex items-start gap-2">
                    <span className="text-score-excellent shrink-0">✓</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {analysis.referenceProfile.gaps.length > 0 && (
            <div className="space-y-2">
              <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Gaps</p>
              <ul className="space-y-1">
                {analysis.referenceProfile.gaps.map((g, i) => (
                  <li key={i} className="text-[11px] text-foreground flex items-start gap-2">
                    <span className="text-score-ok shrink-0">—</span> {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Master Cards */}
      <div className="py-8 space-y-0">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase mb-2">Masters</p>
        {analysis.masters.map((master, i) => (
          <MasterCard key={i} master={master} index={i} />
        ))}
      </div>

      {/* Head to Head */}
      {analysis.masters.length > 1 && analysis.headToHead.winner && (
        <div className="py-8 space-y-3">
          <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Head to Head</p>
          <p className="text-sm text-foreground">
            <span className="font-semibold">{analysis.headToHead.winner}</span>
            <span className="text-muted-foreground"> — {analysis.headToHead.reason}</span>
          </p>
        </div>
      )}

      <div className="pt-8">
        <SignUpToSaveBanner />
      </div>
    </div>
  );
}

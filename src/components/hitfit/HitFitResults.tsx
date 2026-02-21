import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";

/* ── Types ── */

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

/* ── Helpers ── */

const DIMENSION_NAMES: Record<string, string> = {
  hookStrength: "Hook Strength",
  productionQuality: "Production Quality",
  vocalPerformance: "Vocal Performance",
  genreAlignment: "Genre Alignment",
  dynamicRange: "Dynamic Range",
  commercialViability: "Commercial Viability",
  structureClarity: "Structure Clarity",
  emotionalImpact: "Emotional Impact",
};

const PLATFORM_NAMES: Record<string, string> = {
  streaming: "Streaming",
  sync: "Sync Licensing",
  radio: "Radio",
  live: "Live",
  social: "Social / Short-Form",
};

function scoreColor(n: number) {
  if (n >= 80) return "text-score-excellent";
  if (n >= 65) return "text-score-strong";
  if (n >= 50) return "text-score-ok";
  if (n >= 35) return "text-score-weak";
  return "text-score-bad";
}

function barColor(n: number) {
  if (n >= 80) return "bg-score-excellent";
  if (n >= 65) return "bg-score-strong";
  if (n >= 50) return "bg-score-ok";
  if (n >= 35) return "bg-score-weak";
  return "bg-score-bad";
}

function normalizeMaster(raw: any): MasterAnalysis {
  let dims: Dimension[] = [];
  if (Array.isArray(raw.dimensions)) {
    dims = raw.dimensions;
  } else if (raw.dimensions && typeof raw.dimensions === "object") {
    dims = Object.entries(raw.dimensions).map(([key, val]: [string, any]) => ({
      name: key,
      score: val?.score ?? 0,
      label: "",
      feedback: val?.note ?? "",
    }));
  }
  return {
    filename: raw.name || raw.filename || "Master",
    overallScore: raw.score ?? raw.overallScore ?? 0,
    overallLabel: raw.label ?? raw.overallLabel ?? "",
    summary: raw.summary ?? "",
    dimensions: dims,
    performanceInsights: raw.performanceInsights,
    topStrength: raw.topStrength ?? "",
    mainWeakness: raw.mainWeakness ?? "",
    actionableNote: raw.actionableNote ?? (raw.actionItems ? raw.actionItems.join(" ") : ""),
  };
}

/* ── Section label ── */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground/50 mb-3">
      {children}
    </p>
  );
}

/* ── Score block (quiet, inline) ── */

function ScoreBlock({ score, label, summary }: { score: number; label: string; summary: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className={`font-mono text-lg font-semibold ${scoreColor(score)}`}>{score}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
    </div>
  );
}

/* ── Master accordion ── */

function MasterCard({ master, index, defaultOpen }: { master: MasterAnalysis; index: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        className="w-full flex items-center justify-between py-4 text-left gap-3"
        onClick={() => setOpen(!open)}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{master.filename}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`font-mono text-base font-semibold ${scoreColor(master.overallScore)}`}>
            {master.overallScore}
          </span>
          <ChevronDown
            size={14}
            className={`text-muted-foreground/40 transition-transform ${open ? "rotate-180" : ""}`}
            strokeWidth={1.5}
          />
        </div>
      </button>

      {open && (
        <div className="pb-8 space-y-6">
          {/* Summary */}
          <p className="text-sm text-foreground/80 leading-relaxed">{master.summary}</p>

          {/* Dimensions */}
          <div className="space-y-2.5">
            {master.dimensions.map((dim) => (
              <div key={dim.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground/70">{DIMENSION_NAMES[dim.name] || dim.name}</span>
                  <span className={`font-mono text-xs ${scoreColor(dim.score)}`}>{dim.score}</span>
                </div>
                <div className="h-px bg-border/20 w-full relative">
                  <div className={`absolute inset-y-0 left-0 ${barColor(dim.score)} opacity-40`} style={{ width: `${dim.score}%` }} />
                </div>
                {dim.feedback && (
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">{dim.feedback}</p>
                )}
              </div>
            ))}
          </div>

          {/* Platform fit */}
          {master.performanceInsights && master.performanceInsights.length > 0 && (
            <div>
              <Label>Platform Fit</Label>
              <div className="space-y-2">
                {master.performanceInsights.map((insight) => (
                  <div key={insight.type} className="flex gap-3">
                    <span className="text-xs text-muted-foreground/50 w-20 shrink-0">
                      {PLATFORM_NAMES[insight.type] || insight.type}
                    </span>
                    <p className="text-xs text-foreground/70 leading-snug">{insight.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Takeaways */}
          <div className="space-y-3 pt-2">
            {master.topStrength && (
              <div>
                <p className="text-xs text-muted-foreground/50 mb-0.5">Strength</p>
                <p className="text-sm text-foreground/80">{master.topStrength}</p>
              </div>
            )}
            {master.mainWeakness && (
              <div>
                <p className="text-xs text-muted-foreground/50 mb-0.5">Gap</p>
                <p className="text-sm text-foreground/80">{master.mainWeakness}</p>
              </div>
            )}
            {master.actionableNote && (
              <div>
                <p className="text-xs text-muted-foreground/50 mb-0.5">Next step</p>
                <p className="text-sm text-foreground/80">{master.actionableNote}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main component ── */

interface Props {
  analysis: HitFitAnalysis;
  onBack: () => void;
  onHeaderProject?: (project: { title: string; onBack: () => void } | null) => void;
}

export function HitFitResults({ analysis, onBack, onHeaderProject }: Props) {
  const masters = (analysis.masters ?? []).map(normalizeMaster);
  const headerTitle = masters[0]?.filename || "Hit Potential Analysis";

  useEffect(() => {
    onHeaderProject?.({ title: headerTitle, onBack });
    return () => onHeaderProject?.(null);
  }, [headerTitle, onBack, onHeaderProject]);

  const strengths = analysis.referenceProfile?.strengths ?? [];
  const gaps = analysis.referenceProfile?.gaps ?? [];

  return (
    <div className="w-full max-w-2xl mx-auto pb-24 space-y-10">

      {/* Verdict */}
      <p className="text-sm text-muted-foreground leading-relaxed">{analysis.overallVerdict}</p>

      {/* Potentials */}
      {(analysis.hitPotential || analysis.shortFormPotential) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {analysis.hitPotential && (
            <div>
              <Label>Hit Potential</Label>
              <ScoreBlock {...analysis.hitPotential} />
            </div>
          )}
          {analysis.shortFormPotential && (
            <div>
              <Label>Short-Form Potential</Label>
              <ScoreBlock {...analysis.shortFormPotential} />
            </div>
          )}
        </div>
      )}

      {/* Reference profile */}
      <div>
        <Label>Reference Profile</Label>
        <p className="text-sm text-foreground/80 leading-relaxed mb-4">{analysis.referenceProfile?.description}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {strengths.length > 0 && (
            <ul className="space-y-1">
              {strengths.map((s, i) => (
                <li key={i} className="text-sm text-foreground/70 flex items-start gap-2">
                  <span className="text-score-excellent shrink-0 text-xs mt-0.5">✓</span> {s}
                </li>
              ))}
            </ul>
          )}
          {gaps.length > 0 && (
            <ul className="space-y-1">
              {gaps.map((g, i) => (
                <li key={i} className="text-sm text-foreground/70 flex items-start gap-2">
                  <span className="text-muted-foreground/40 shrink-0 text-xs mt-0.5">—</span> {g}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Masters */}
      <div>
        <Label>Masters</Label>
        <div className="divide-y divide-border/20">
          {masters.map((master, i) => (
            <MasterCard key={i} master={master} index={i} defaultOpen={i === 0} />
          ))}
        </div>
      </div>

      {/* Head to head */}
      {masters.length > 1 && analysis.headToHead?.winner && (
        <div>
          <Label>Head to Head</Label>
          <p className="text-sm text-foreground/80">
            <span className="font-medium">{analysis.headToHead.winner}</span>
            {" — "}
            <span className="text-muted-foreground">{analysis.headToHead.reason}</span>
          </p>
        </div>
      )}

      <SignUpToSaveBanner />
    </div>
  );
}

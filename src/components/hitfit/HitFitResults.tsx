import { motion } from "framer-motion";
import { ArrowLeft, Trophy, Target, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";

interface Dimension {
  score: number;
  note: string;
}

interface MasterAnalysis {
  name: string;
  score: number;
  label: string;
  summary: string;
  dimensions: {
    lowEnd: Dimension;
    midClarity: Dimension;
    highEnd: Dimension;
    dynamics: Dimension;
    stereoWidth: Dimension;
    loudness: Dimension;
    overallBalance: Dimension;
  };
  actionItems: string[];
}

export interface HitFitAnalysis {
  overallVerdict: string;
  referenceProfile: {
    description: string;
    strengths: string[];
  };
  masters: MasterAnalysis[];
  headToHead: {
    winner: string | null;
    reason: string;
  };
}

interface Props {
  analysis: HitFitAnalysis;
  onBack: () => void;
}

const dimensionLabels: Record<string, string> = {
  lowEnd: "Low End",
  midClarity: "Mid Clarity",
  highEnd: "High End",
  dynamics: "Dynamics",
  stereoWidth: "Stereo Width",
  loudness: "Loudness",
  overallBalance: "Overall Balance",
};

function getScoreColor(score: number) {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

function getScoreBg(score: number) {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

function getLabelIcon(label: string) {
  switch (label) {
    case "Nailed It": return <CheckCircle2 size={16} className="text-green-500" />;
    case "Close": return <Target size={16} className="text-yellow-500" />;
    case "Getting There": return <AlertTriangle size={16} className="text-orange-500" />;
    default: return <AlertTriangle size={16} className="text-red-500" />;
  }
}

function MasterCard({ master, index }: { master: MasterAnalysis; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const dims = Object.entries(master.dimensions) as [string, Dimension][];

  return (
    <motion.div
      className="glass-card rounded-xl overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 * (index + 1) }}
    >
      {/* Header */}
      <button
        className="w-full p-4 flex items-center gap-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
          <span className={`text-lg font-mono font-bold ${getScoreColor(master.score)}`}>{master.score}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {getLabelIcon(master.label)}
            <p className="text-sm font-semibold truncate">{master.name}</p>
          </div>
          <p className="text-xs text-muted-foreground">{master.label} · {master.summary}</p>
        </div>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Dimension bars */}
          <div className="space-y-2">
            {dims.map(([key, dim]) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{dimensionLabels[key] || key}</span>
                  <span className={`text-xs font-mono font-semibold ${getScoreColor(dim.score)}`}>{dim.score}</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${getScoreBg(dim.score)} transition-all`} style={{ width: `${dim.score}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground">{dim.note}</p>
              </div>
            ))}
          </div>

          {/* Action items */}
          {master.actionItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-primary">Action Items</p>
              <ul className="space-y-1.5">
                {master.actionItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-primary mt-0.5 shrink-0">→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export function HitFitResults({ analysis, onBack }: Props) {
  return (
    <motion.div
      className="w-full max-w-2xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">HitFit Analysis</h2>
          <p className="text-sm text-muted-foreground">{analysis.overallVerdict}</p>
        </div>
      </div>

      {/* Reference Profile */}
      <div className="glass-card rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Trophy size={14} className="text-primary" />
          <p className="text-xs font-semibold">Reference Profile</p>
        </div>
        <p className="text-sm text-muted-foreground">{analysis.referenceProfile.description}</p>
        <div className="flex flex-wrap gap-1.5">
          {analysis.referenceProfile.strengths.map((s, i) => (
            <span key={i} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{s}</span>
          ))}
        </div>
      </div>

      {/* Master Cards */}
      {analysis.masters.map((master, i) => (
        <MasterCard key={i} master={master} index={i} />
      ))}

      {/* Head to Head */}
      {analysis.masters.length > 1 && analysis.headToHead.winner && (
        <div className="glass-card rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-yellow-500" />
            <p className="text-xs font-semibold">Head to Head</p>
          </div>
          <p className="text-sm">
            <span className="font-semibold text-primary">{analysis.headToHead.winner}</span>{" "}
            <span className="text-muted-foreground">— {analysis.headToHead.reason}</span>
          </p>
        </div>
      )}
      <SignUpToSaveBanner />
    </motion.div>
  );
}

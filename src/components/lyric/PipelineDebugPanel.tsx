/**
 * PipelineDebugPanel — Inline debug panel showing the full pipeline waterfall.
 *
 * Unified view: each pipeline stage shows status, timing, and nested edge-function
 * calls with expandable request/response bodies.
 *
 * Intercepts both `supabase.functions.invoke` AND raw `fetch` to edge functions.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { GenerationStatus, PipelineStages, PipelineStageTimes } from "./LyricFitTab";

/* ─── Types ───────────────────────────────────────────────────────────── */

export interface PipelineLogEntry {
  id: string;
  timestamp: number;
  type: "edge-fn" | "fetch" | "local";
  label: string;
  status: "pending" | "success" | "error";
  durationMs?: number;
  requestBody?: any;
  responseBody?: any;
  error?: string;
  /** Which pipeline stage this call belongs to (auto-mapped) */
  stage?: string;
}

interface Props {
  generationStatus: GenerationStatus;
  pipelineStages: PipelineStages;
  pipelineStageTimes?: PipelineStageTimes;
  onRetry: () => void;
}

/* ─── Global interceptors ─────────────────────────────────────────────── */

let globalLogPush: ((entry: PipelineLogEntry) => void) | null = null;
let patchedInvoke = false;
let patchedFetch = false;

/** Map edge-function name → pipeline stage */
function mapFunctionToStage(fnName: string, body?: any): string {
  if (fnName === "lyric-transcribe") return "transcript";
  if (fnName === "detect-hooks") return "hooks";
  if (fnName === "resolve-scene-context") return "scene";
  if (fnName === "cinematic-direction") {
    const mode = body?.mode;
    if (mode === "words") return "cinematic-words";
    return "cinematic-scene";
  }
  if (fnName === "generate-section-images") return "images";
  return fnName;
}

function patchSupabaseFunctions() {
  if (patchedInvoke) return;
  patchedInvoke = true;

  const originalInvoke = supabase.functions.invoke.bind(supabase.functions);

  (supabase.functions as any).invoke = async (functionName: string, options?: any) => {
    const id = `invoke-${functionName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const t0 = performance.now();
    const body = options?.body ?? null;

    const entry: PipelineLogEntry = {
      id,
      timestamp: Date.now(),
      type: "edge-fn",
      label: functionName,
      status: "pending",
      requestBody: body,
      stage: mapFunctionToStage(functionName, body),
    };

    globalLogPush?.(entry);

    try {
      const result = await originalInvoke(functionName, options);
      const durationMs = Math.round(performance.now() - t0);

      globalLogPush?.({
        ...entry,
        status: result.error ? "error" : "success",
        durationMs,
        responseBody: result.data ?? null,
        error: result.error?.message ?? undefined,
      });

      return result;
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - t0);
      globalLogPush?.({
        ...entry,
        status: "error",
        durationMs,
        error: err?.message ?? String(err),
      });
      throw err;
    }
  };
}

function patchGlobalFetch() {
  if (patchedFetch) return;
  patchedFetch = true;

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

    // Only intercept edge function calls
    const edgeFnMatch = url.match(/\/functions\/v1\/([^?#/]+)/);
    if (!edgeFnMatch) return originalFetch(input, init);

    const fnName = edgeFnMatch[1];
    const id = `fetch-${fnName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const t0 = performance.now();

    let parsedBody: any = null;
    if (init?.body) {
      if (typeof init.body === "string") {
        try { parsedBody = JSON.parse(init.body); } catch { parsedBody = "(string body)"; }
      } else if (init.body instanceof FormData) {
        parsedBody = "(FormData — multipart upload)";
      }
    }

    const entry: PipelineLogEntry = {
      id,
      timestamp: Date.now(),
      type: "fetch",
      label: fnName,
      status: "pending",
      requestBody: parsedBody,
      stage: mapFunctionToStage(fnName, parsedBody),
    };

    globalLogPush?.(entry);

    try {
      const response = await originalFetch(input, init);
      const durationMs = Math.round(performance.now() - t0);

      // Clone so we can read body without consuming it
      const clone = response.clone();
      let responseBody: any = null;
      try {
        responseBody = await clone.json();
      } catch {
        responseBody = `(status ${response.status})`;
      }

      globalLogPush?.({
        ...entry,
        status: response.ok ? "success" : "error",
        durationMs,
        responseBody,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      });

      return response;
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - t0);
      globalLogPush?.({
        ...entry,
        status: "error",
        durationMs,
        error: err?.message ?? String(err),
      });
      throw err;
    }
  };
}

/* ─── Sub-components ──────────────────────────────────────────────────── */

function JsonBlock({ data, label }: { data: any; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [data]);

  if (!data) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
        <button
          onClick={(e) => { e.stopPropagation(); copy(); }}
          className="ml-1 hover:text-primary"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
        </button>
      </button>
      {expanded && (
        <pre className="mt-1 p-2 bg-background/80 rounded text-[10px] leading-relaxed overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">
          {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function LogEntryCard({ entry }: { entry: PipelineLogEntry }) {
  const statusColor =
    entry.status === "success"
      ? "text-green-400"
      : entry.status === "error"
        ? "text-red-400"
        : "text-yellow-400 animate-pulse";

  return (
    <div className="border border-border/30 rounded p-2 space-y-1 text-xs font-mono bg-muted/10 ml-4">
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("text-[10px] font-bold", statusColor)}>
            {entry.status === "pending" ? "⏳" : entry.status === "success" ? "✓" : "✗"}
          </span>
          <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">
            {entry.type}
          </Badge>
          <span className="font-semibold text-foreground truncate">{entry.label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
          {entry.durationMs != null && (
            <span className="text-[10px] font-bold">{(entry.durationMs / 1000).toFixed(1)}s</span>
          )}
          <span className="text-[9px]">{new Date(entry.timestamp).toLocaleTimeString()}</span>
        </div>
      </div>

      {entry.error && (
        <div className="text-red-400 text-[11px] bg-red-500/10 rounded px-2 py-1">{entry.error}</div>
      )}

      <JsonBlock data={entry.requestBody} label="Request" />
      <JsonBlock data={entry.responseBody} label="Response" />
    </div>
  );
}

/* ─── Unified stage config ────────────────────────────────────────────── */

interface StageConfig {
  key: string;
  label: string;
  description: string;
  pipelineKey?: keyof PipelineStages;
  genKey?: keyof GenerationStatus;
}

const STAGES: StageConfig[] = [
  { key: "transcript", label: "Transcription", description: "ElevenLabs Scribe → word-level timestamps", pipelineKey: "transcript" },
  { key: "rhythm", label: "Beat Grid", description: "Essentia.js WASM → BPM + beat timestamps", pipelineKey: "rhythm", genKey: "beatGrid" },
  { key: "sections", label: "Section Detection", description: "Song signature + energy curve → sections", pipelineKey: "sections" },
  { key: "hooks", label: "Hook Detection", description: "AI detects catchiest phrases" },
  { key: "scene", label: "Scene Resolution", description: "User scene → mood/vibe context" },
  { key: "cinematic-scene", label: "Cinematic Direction (Scene)", description: "AI scene-level visual design", pipelineKey: "cinematic", genKey: "cinematicDirection" },
  { key: "cinematic-words", label: "Cinematic Direction (Words)", description: "AI word-level choreography" },
  { key: "images", label: "Section Images", description: "AI-generated backgrounds per section", genKey: "sectionImages" },
];

function getStageStatus(
  stage: StageConfig,
  pipelineStages: PipelineStages,
  generationStatus: GenerationStatus,
  logs: PipelineLogEntry[],
): "idle" | "running" | "done" | "error" {
  // Check if any logs for this stage are pending
  const stageLogs = logs.filter((l) => l.stage === stage.key);
  if (stageLogs.some((l) => l.status === "pending")) return "running";
  if (stageLogs.some((l) => l.status === "error")) return "error";
  if (stageLogs.some((l) => l.status === "success")) return "done";

  // Fall back to pipeline/generation status
  if (stage.pipelineKey) {
    const ps = pipelineStages[stage.pipelineKey];
    if (ps === "running") return "running";
    if (ps === "done") return "done";
  }
  if (stage.genKey) {
    const gs = generationStatus[stage.genKey];
    if (gs === "running") return "running";
    if (gs === "done") return "done";
    if (gs === "error") return "error";
  }

  return "idle";
}

function StageRow({
  stage,
  status,
  timing,
  logs,
}: {
  stage: StageConfig;
  status: "idle" | "running" | "done" | "error";
  timing?: { startedAt?: number; durationMs?: number };
  logs: PipelineLogEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasLogs = logs.length > 0;

  // Auto-expand when a stage starts running
  useEffect(() => {
    if (status === "running" && hasLogs) setExpanded(true);
  }, [status, hasLogs]);

  const durationLabel =
    timing?.durationMs != null
      ? `${(timing.durationMs / 1000).toFixed(1)}s`
      : logs.length > 0 && logs[logs.length - 1].durationMs != null
        ? `${(logs[logs.length - 1].durationMs! / 1000).toFixed(1)}s`
        : status === "running"
          ? "…"
          : null;

  const dotColor =
    status === "done"
      ? "bg-green-400"
      : status === "running"
        ? "bg-yellow-400 animate-pulse"
        : status === "error"
          ? "bg-red-400"
          : "bg-muted-foreground/30";

  return (
    <div className="space-y-1">
      <button
        onClick={() => hasLogs && setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/30 transition-colors text-left",
          hasLogs && "cursor-pointer",
          !hasLogs && "cursor-default"
        )}
      >
        <span className={cn("w-2 h-2 rounded-full shrink-0", dotColor)} />
        {hasLogs && (expanded ? <ChevronDown size={10} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={10} className="shrink-0 text-muted-foreground" />)}
        {!hasLogs && <span className="w-[10px] shrink-0" />}
        <div className="flex-1 min-w-0">
          <span className={cn("text-xs font-mono font-semibold", status === "done" ? "text-foreground" : status === "error" ? "text-red-400" : "text-muted-foreground")}>
            {stage.label}
          </span>
          <span className="text-[9px] text-muted-foreground/60 ml-2">{stage.description}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status === "running" && <Loader2 size={10} className="animate-spin text-primary" />}
          {durationLabel && (
            <span className="text-[10px] font-mono font-bold text-muted-foreground">{durationLabel}</span>
          )}
          {hasLogs && (
            <Badge variant="outline" className="text-[8px] px-1 py-0">
              {logs.length} call{logs.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </button>

      {expanded && logs.length > 0 && (
        <div className="space-y-1.5 pb-1">
          {logs.map((entry) => (
            <LogEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────── */

export function PipelineDebugPanel({ generationStatus, pipelineStages, pipelineStageTimes, onRetry }: Props) {
  const [logs, setLogs] = useState<PipelineLogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    patchSupabaseFunctions();
    patchGlobalFetch();

    globalLogPush = (entry) => {
      setLogs((prev) => {
        const idx = prev.findIndex((e) => e.id === entry.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = entry;
          return next;
        }
        return [...prev, entry];
      });
    };

    return () => { globalLogPush = null; };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  const clearLogs = useCallback(() => setLogs([]), []);

  const handleRetry = useCallback(() => {
    setLogs([]);
    onRetry();
  }, [onRetry]);

  const totalCalls = logs.length;
  const errorCount = logs.filter((l) => l.status === "error").length;
  const pendingCount = logs.filter((l) => l.status === "pending").length;

  return (
    <div className="flex-1 flex flex-col px-4 py-4 max-w-2xl mx-auto w-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-mono tracking-wider text-foreground font-semibold">Pipeline Debug</h2>
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {totalCalls} call{totalCalls !== 1 ? "s" : ""} · {errorCount} error{errorCount !== 1 ? "s" : ""} · {pendingCount} pending
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={clearLogs} className="h-7 w-7" title="Clear logs">
            <Trash2 size={12} />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleRetry();
            }}
            className="h-7 text-[10px] gap-1"
          >
            <RefreshCw size={10} />
            Full Reset & Re-run
          </Button>
        </div>
      </div>

      {/* Pipeline waterfall */}
      <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
        <div className="space-y-0.5 pb-4">
          {STAGES.map((stage) => {
            const stageLogs = logs.filter((l) => l.stage === stage.key);
            const status = getStageStatus(stage, pipelineStages, generationStatus, logs);
            const timing = stage.pipelineKey ? pipelineStageTimes?.[stage.pipelineKey] : undefined;

            return (
              <StageRow
                key={stage.key}
                stage={stage}
                status={status}
                timing={timing}
                logs={stageLogs}
              />
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
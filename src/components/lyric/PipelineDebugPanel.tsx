/**
 * PipelineDebugPanel — Exhaustive first-principles debug panel.
 *
 * Shows every pipeline stage with:
 * - Live elapsed timer while running
 * - Final duration when done
 * - Per-stage restart button
 * - Nested edge-function calls with expandable request/response JSON
 * - Full reset button that restarts from transcription
 *
 * Intercepts both `supabase.functions.invoke` AND raw `fetch` to edge functions.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  RotateCcw,
  Clock,
  Zap,
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
  stage?: string;
}

export interface StageRestarters {
  fullReset: () => void;
  restartBeatGrid?: () => void;
  restartSections?: () => void;
  restartCinematic?: () => void;
  restartTranscription?: () => void;
  restartHooks?: () => void;
  restartImages?: () => void;
}

interface Props {
  generationStatus: GenerationStatus;
  pipelineStages: PipelineStages;
  pipelineStageTimes?: PipelineStageTimes;
  stageRestarters: StageRestarters;
}

/* ─── Global interceptors ─────────────────────────────────────────────── */

let globalLogPush: ((entry: PipelineLogEntry) => void) | null = null;
let patchedInvoke = false;
let patchedFetch = false;

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
      id, timestamp: Date.now(), type: "edge-fn", label: functionName,
      status: "pending", requestBody: body, stage: mapFunctionToStage(functionName, body),
    };
    globalLogPush?.(entry);

    try {
      const result = await originalInvoke(functionName, options);
      const durationMs = Math.round(performance.now() - t0);
      globalLogPush?.({
        ...entry, status: result.error ? "error" : "success", durationMs,
        responseBody: result.data ?? null, error: result.error?.message ?? undefined,
      });
      return result;
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - t0);
      globalLogPush?.({ ...entry, status: "error", durationMs, error: err?.message ?? String(err) });
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
      id, timestamp: Date.now(), type: "fetch", label: fnName,
      status: "pending", requestBody: parsedBody, stage: mapFunctionToStage(fnName, parsedBody),
    };
    globalLogPush?.(entry);

    try {
      const response = await originalFetch(input, init);
      const durationMs = Math.round(performance.now() - t0);
      const clone = response.clone();
      let responseBody: any = null;
      try { responseBody = await clone.json(); } catch { responseBody = `(status ${response.status})`; }

      globalLogPush?.({
        ...entry, status: response.ok ? "success" : "error", durationMs,
        responseBody, error: response.ok ? undefined : `HTTP ${response.status}`,
      });
      return response;
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - t0);
      globalLogPush?.({ ...entry, status: "error", durationMs, error: err?.message ?? String(err) });
      throw err;
    }
  };
}

/* ─── Live Timer Hook ─────────────────────────────────────────────────── */

function useLiveTimer(isRunning: boolean, startedAt?: number) {
  const [elapsed, setElapsed] = useState<number | null>(null);
  const rafRef = useRef<number>();
  const t0 = useRef(startedAt ?? performance.now());

  useEffect(() => {
    if (!isRunning) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    t0.current = startedAt ?? performance.now();
    const tick = () => {
      setElapsed(Math.round(performance.now() - t0.current));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isRunning, startedAt]);

  return isRunning ? elapsed : null;
}

/* ─── JSON Inspector ──────────────────────────────────────────────────── */

function JsonBlock({ data, label }: { data: any; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    if (!data) return "";
    return typeof data === "string" ? data : JSON.stringify(data, null, 2);
  }, [data]);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  if (!data) return null;

  const preview = text.length > 120 ? text.slice(0, 120) + "…" : text;

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors group"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
        <span className="text-[9px] text-muted-foreground/50 truncate max-w-[200px]">
          {!expanded && preview}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); copy(); }}
          className="ml-1 opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity"
        >
          {copied ? <Check size={10} className="text-primary" /> : <Copy size={10} />}
        </button>
      </button>
      {expanded && (
        <pre className="mt-1 p-2 bg-background/80 border border-border/20 rounded text-[10px] leading-relaxed overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap break-all font-mono text-foreground/80">
          {text}
        </pre>
      )}
    </div>
  );
}

/* ─── Log Entry Card ──────────────────────────────────────────────────── */

function LogEntryCard({ entry }: { entry: PipelineLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const liveMs = useLiveTimer(entry.status === "pending");
  const duration = entry.durationMs ?? liveMs;

  const statusIcon =
    entry.status === "success" ? "✓" : entry.status === "error" ? "✗" : "⏳";
  const statusColor =
    entry.status === "success"
      ? "text-green-400"
      : entry.status === "error"
        ? "text-red-400"
        : "text-yellow-400";

  return (
    <div className={cn(
      "border rounded p-2 text-xs font-mono ml-4 transition-colors",
      entry.status === "error" ? "border-red-500/30 bg-red-500/5" : "border-border/30 bg-muted/10"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 justify-between text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {entry.status === "pending" ? (
            <Loader2 size={10} className="animate-spin text-yellow-400 shrink-0" />
          ) : (
            <span className={cn("text-[10px] font-bold shrink-0", statusColor)}>{statusIcon}</span>
          )}
          <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">{entry.type}</Badge>
          <span className="font-semibold text-foreground truncate">{entry.label}</span>
          {expanded ? <ChevronDown size={10} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={10} className="shrink-0 text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
          {duration != null && (
            <span className={cn(
              "text-[10px] font-bold tabular-nums",
              entry.status === "pending" && "text-yellow-400 animate-pulse"
            )}>
              {(duration / 1000).toFixed(1)}s
            </span>
          )}
          <span className="text-[9px] tabular-nums">{new Date(entry.timestamp).toLocaleTimeString()}</span>
        </div>
      </button>

      {entry.error && (
        <div className="text-red-400 text-[11px] bg-red-500/10 rounded px-2 py-1 mt-1">{entry.error}</div>
      )}

      {expanded && (
        <div className="mt-1.5 space-y-1">
          <JsonBlock data={entry.requestBody} label="Request Body" />
          <JsonBlock data={entry.responseBody} label="Response Body" />
        </div>
      )}
    </div>
  );
}

/* ─── Stage Config ────────────────────────────────────────────────────── */

interface StageConfig {
  key: string;
  label: string;
  description: string;
  pipelineKey?: keyof PipelineStages;
  genKey?: keyof GenerationStatus;
  restartKey?: keyof StageRestarters;
}

const STAGES: StageConfig[] = [
  { key: "transcript", label: "1. Transcription", description: "ElevenLabs Scribe → word-level timestamps", pipelineKey: "transcript", restartKey: "restartTranscription" },
  { key: "rhythm", label: "2. Beat Grid", description: "Essentia.js WASM → BPM + beat timestamps", pipelineKey: "rhythm", genKey: "beatGrid", restartKey: "restartBeatGrid" },
  { key: "sections", label: "3. Section Detection", description: "Song signature + energy curve → sections", pipelineKey: "sections", restartKey: "restartSections" },
  { key: "hooks", label: "4. Hook Detection", description: "AI detects catchiest phrases", restartKey: "restartHooks" },
  { key: "scene", label: "5. Scene Resolution", description: "User scene → mood/vibe context" },
  { key: "cinematic-scene", label: "6. Cinematic (Scene)", description: "AI scene-level visual design", pipelineKey: "cinematic", genKey: "cinematicDirection", restartKey: "restartCinematic" },
  { key: "cinematic-words", label: "7. Cinematic (Words)", description: "AI word-level choreography" },
  { key: "images", label: "8. Section Images", description: "AI-generated backgrounds per section", genKey: "sectionImages", restartKey: "restartImages" },
];

function getStageStatus(
  stage: StageConfig,
  pipelineStages: PipelineStages,
  generationStatus: GenerationStatus,
  logs: PipelineLogEntry[],
): "idle" | "running" | "done" | "error" {
  const stageLogs = logs.filter((l) => l.stage === stage.key);
  if (stageLogs.some((l) => l.status === "pending")) return "running";
  if (stageLogs.some((l) => l.status === "error")) return "error";
  if (stageLogs.some((l) => l.status === "success")) return "done";

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

/* ─── Stage Row ───────────────────────────────────────────────────────── */

function StageRow({
  stage,
  status,
  timing,
  logs,
  restarter,
}: {
  stage: StageConfig;
  status: "idle" | "running" | "done" | "error";
  timing?: { startedAt?: number; durationMs?: number };
  logs: PipelineLogEntry[];
  restarter?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasLogs = logs.length > 0;
  const liveMs = useLiveTimer(status === "running", timing?.startedAt);

  // Auto-expand when running
  useEffect(() => {
    if (status === "running" && hasLogs) setExpanded(true);
  }, [status, hasLogs]);

  // Compute total duration from logs or timing
  const totalDuration =
    timing?.durationMs ??
    (logs.length > 0 && logs.every(l => l.status !== "pending")
      ? logs.reduce((sum, l) => sum + (l.durationMs ?? 0), 0)
      : null);

  const durationLabel =
    totalDuration != null
      ? `${(totalDuration / 1000).toFixed(1)}s`
      : liveMs != null
        ? `${(liveMs / 1000).toFixed(1)}s`
        : null;

  const dotColor =
    status === "done" ? "bg-green-400" :
    status === "running" ? "bg-yellow-400 animate-pulse" :
    status === "error" ? "bg-red-400" :
    "bg-muted-foreground/30";

  const textColor =
    status === "done" ? "text-foreground" :
    status === "error" ? "text-red-400" :
    status === "running" ? "text-yellow-400" :
    "text-muted-foreground/60";

  return (
    <div className="space-y-1">
      <div className={cn(
        "flex items-center gap-2 py-2 px-2 rounded transition-colors",
        hasLogs ? "hover:bg-muted/30 cursor-pointer" : "cursor-default"
      )}>
        <button
          onClick={() => hasLogs && setExpanded(!expanded)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <span className={cn("w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-inset ring-black/10", dotColor)} />
          {hasLogs && (expanded ? <ChevronDown size={11} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={11} className="shrink-0 text-muted-foreground" />)}
          {!hasLogs && <span className="w-[11px] shrink-0" />}
          <div className="min-w-0">
            <span className={cn("text-xs font-mono font-semibold", textColor)}>
              {stage.label}
            </span>
            <span className="text-[9px] text-muted-foreground/50 ml-2 hidden sm:inline">{stage.description}</span>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {status === "running" && (
            <Loader2 size={11} className="animate-spin text-primary" />
          )}
          {durationLabel && (
            <div className="flex items-center gap-0.5">
              <Clock size={9} className="text-muted-foreground/50" />
              <span className={cn(
                "text-[10px] font-mono font-bold tabular-nums",
                status === "running" ? "text-yellow-400" : "text-muted-foreground"
              )}>
                {durationLabel}
              </span>
            </div>
          )}
          {hasLogs && (
            <Badge variant="outline" className="text-[8px] px-1 py-0">
              {logs.length}
            </Badge>
          )}
          {restarter && status !== "running" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); restarter(); }}
              className="h-5 w-5 text-muted-foreground hover:text-primary"
              title={`Restart ${stage.label}`}
            >
              <RotateCcw size={9} />
            </Button>
          )}
        </div>
      </div>

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

export function PipelineDebugPanel({ generationStatus, pipelineStages, pipelineStageTimes, stageRestarters }: Props) {
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

  const handleFullReset = useCallback(() => {
    setLogs([]);
    stageRestarters.fullReset();
  }, [stageRestarters]);

  const totalCalls = logs.length;
  const errorCount = logs.filter((l) => l.status === "error").length;
  const pendingCount = logs.filter((l) => l.status === "pending").length;
  const successCount = logs.filter((l) => l.status === "success").length;

  const totalDuration = useMemo(() => {
    const durations = logs.filter(l => l.durationMs != null).map(l => l.durationMs!);
    return durations.length > 0 ? durations.reduce((a, b) => a + b, 0) : null;
  }, [logs]);

  return (
    <div className="flex-1 flex flex-col px-4 py-4 max-w-2xl mx-auto w-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-mono tracking-wider text-foreground font-semibold flex items-center gap-2">
            <Zap size={14} className="text-primary" />
            Pipeline Debug
          </h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] font-mono text-muted-foreground">
              {totalCalls} call{totalCalls !== 1 ? "s" : ""}
            </span>
            {successCount > 0 && (
              <span className="text-[10px] font-mono text-green-400">
                {successCount} ✓
              </span>
            )}
            {errorCount > 0 && (
              <span className="text-[10px] font-mono text-red-400">
                {errorCount} ✗
              </span>
            )}
            {pendingCount > 0 && (
              <span className="text-[10px] font-mono text-yellow-400 animate-pulse">
                {pendingCount} pending
              </span>
            )}
            {totalDuration != null && (
              <span className="text-[10px] font-mono text-muted-foreground">
                Σ {(totalDuration / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clearLogs}
            className="h-7 w-7"
            title="Clear logs"
          >
            <Trash2 size={12} />
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleFullReset();
            }}
            className="h-7 text-[10px] gap-1"
          >
            <RefreshCw size={10} />
            Full Reset
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
            const restartFn = stage.restartKey ? stageRestarters[stage.restartKey] as (() => void) | undefined : undefined;

            return (
              <StageRow
                key={stage.key}
                stage={stage}
                status={status}
                timing={timing}
                logs={stageLogs}
                restarter={restartFn}
              />
            );
          })}
        </div>

        {/* Summary when all done */}
        {Object.values(generationStatus).every(v => v === "done") && totalDuration != null && (
          <div className="border border-primary/20 rounded-lg p-3 bg-primary/5 text-center mt-2">
            <p className="text-xs font-mono text-primary font-semibold">
              ✓ Pipeline complete — {(totalDuration / 1000).toFixed(1)}s total across {totalCalls} calls
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/**
 * PipelineDebugPanel — Admin HUD that shows all pipeline calls, prompts, responses.
 * Uses a monkey-patched supabase.functions.invoke to intercept edge function traffic.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Copy, Check, Trash2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { GenerationStatus, PipelineStages, PipelineStageTimes } from "./LyricFitTab";

export interface PipelineLogEntry {
  id: string;
  timestamp: number;
  type: "edge-fn" | "db-read" | "db-write" | "local";
  label: string;
  status: "pending" | "success" | "error";
  durationMs?: number;
  requestBody?: any;
  responseBody?: any;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generationStatus: GenerationStatus;
  pipelineStages: PipelineStages;
  pipelineStageTimes?: PipelineStageTimes;
  onRetry: () => void;
}

// Global log store so the monkey-patch can write to it
let globalLogPush: ((entry: PipelineLogEntry) => void) | null = null;
let patched = false;

function patchSupabaseFunctions() {
  if (patched) return;
  patched = true;

  const originalInvoke = supabase.functions.invoke.bind(supabase.functions);

  (supabase.functions as any).invoke = async (functionName: string, options?: any) => {
    const id = `${functionName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const t0 = performance.now();

    const entry: PipelineLogEntry = {
      id,
      timestamp: Date.now(),
      type: "edge-fn",
      label: functionName,
      status: "pending",
      requestBody: options?.body ?? null,
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

function LogEntryCard({ entry }: { entry: PipelineLogEntry }) {
  const [expandRequest, setExpandRequest] = useState(false);
  const [expandResponse, setExpandResponse] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyJson = useCallback((data: any, key: string) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const statusColor = entry.status === "success"
    ? "text-green-400"
    : entry.status === "error"
      ? "text-red-400"
      : "text-yellow-400 animate-pulse";

  const truncateBody = (body: any) => {
    if (!body) return "null";
    const str = JSON.stringify(body, null, 2);
    return str;
  };

  return (
    <div className="border border-border/40 rounded-md p-2.5 space-y-1.5 text-xs font-mono bg-muted/20">
      {/* Header row */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("text-[10px] font-bold uppercase", statusColor)}>
            {entry.status === "pending" ? "⏳" : entry.status === "success" ? "✓" : "✗"}
          </span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">
            {entry.type}
          </Badge>
          <span className="font-semibold text-foreground truncate">{entry.label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
          {entry.durationMs != null && (
            <span className="text-[10px]">{entry.durationMs}ms</span>
          )}
          <span className="text-[10px]">
            {new Date(entry.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Error */}
      {entry.error && (
        <div className="text-red-400 text-[11px] bg-red-500/10 rounded px-2 py-1">
          {entry.error}
        </div>
      )}

      {/* Request body */}
      {entry.requestBody && (
        <div>
          <button
            onClick={() => setExpandRequest(!expandRequest)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            {expandRequest ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <span className="text-[10px] uppercase tracking-wider">Request Body</span>
            <button
              onClick={(e) => { e.stopPropagation(); copyJson(entry.requestBody, "req"); }}
              className="ml-1 hover:text-primary"
            >
              {copied === "req" ? <Check size={10} /> : <Copy size={10} />}
            </button>
          </button>
          {expandRequest && (
            <pre className="mt-1 p-2 bg-background/80 rounded text-[10px] leading-relaxed overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">
              {truncateBody(entry.requestBody)}
            </pre>
          )}
        </div>
      )}

      {/* Response body */}
      {entry.responseBody && (
        <div>
          <button
            onClick={() => setExpandResponse(!expandResponse)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            {expandResponse ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <span className="text-[10px] uppercase tracking-wider">Response Body</span>
            <button
              onClick={(e) => { e.stopPropagation(); copyJson(entry.responseBody, "res"); }}
              className="ml-1 hover:text-primary"
            >
              {copied === "res" ? <Check size={10} /> : <Copy size={10} />}
            </button>
          </button>
          {expandResponse && (
            <pre className="mt-1 p-2 bg-background/80 rounded text-[10px] leading-relaxed overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">
              {truncateBody(entry.responseBody)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const STAGE_LABELS: Record<keyof PipelineStages, string> = {
  rhythm: "Beat Grid (Essentia.js)",
  sections: "Section Detection",
  cinematic: "Cinematic Direction",
  transcript: "Transcript Sync",
};

const GEN_LABELS: Record<keyof GenerationStatus, string> = {
  beatGrid: "Beat Grid",
  renderData: "Render Data",
  cinematicDirection: "Cinematic Direction",
  sectionImages: "Section Images",
};

export function PipelineDebugPanel({ open, onOpenChange, generationStatus, pipelineStages, pipelineStageTimes, onRetry }: Props) {
  const [logs, setLogs] = useState<PipelineLogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Register the global log push
  useEffect(() => {
    patchSupabaseFunctions();

    globalLogPush = (entry) => {
      setLogs((prev) => {
        // Update existing entry (same id) or append
        const idx = prev.findIndex((e) => e.id === entry.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = entry;
          return next;
        }
        return [...prev, entry];
      });
    };

    return () => {
      globalLogPush = null;
    };
  }, []);

  // Auto-scroll to bottom on new entries
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/40">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm font-mono tracking-wider">Pipeline Debug</SheetTitle>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" onClick={clearLogs} className="h-7 w-7">
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
                className="h-7 text-[10px]"
              >
                <RefreshCw size={10} />
                Re-run
              </Button>
            </div>
          </div>
        </SheetHeader>

        {/* Pipeline stages */}
        <div className="px-4 py-2.5 border-b border-border/40 space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Pipeline Stages</p>
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(STAGE_LABELS) as (keyof PipelineStages)[]).map((key) => {
              const status = pipelineStages[key];
              const timing = pipelineStageTimes?.[key];
              const durationLabel = timing?.durationMs != null
                ? `${(timing.durationMs / 1000).toFixed(1)}s`
                : status === "running" && timing?.startedAt
                  ? "…"
                  : null;
              return (
                <div key={key} className="flex items-center gap-1.5 text-[11px]">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    status === "done" ? "bg-green-400" : status === "running" ? "bg-yellow-400 animate-pulse" : "bg-muted-foreground/30"
                  )} />
                  <span className={cn("font-mono", status === "done" ? "text-foreground" : "text-muted-foreground")}>
                    {STAGE_LABELS[key]}
                  </span>
                  {durationLabel && (
                    <span className="text-[9px] font-mono text-muted-foreground/70 ml-auto">
                      {durationLabel}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Generation status */}
        <div className="px-4 py-2.5 border-b border-border/40 space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Generation Jobs</p>
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(GEN_LABELS) as (keyof GenerationStatus)[]).map((key) => {
              const status = generationStatus[key];
              return (
                <div key={key} className="flex items-center gap-1.5 text-[11px]">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    status === "done" ? "bg-green-400" : status === "running" ? "bg-yellow-400 animate-pulse" : status === "error" ? "bg-red-400" : "bg-muted-foreground/30"
                  )} />
                  <span className={cn("font-mono", status === "done" ? "text-foreground" : status === "error" ? "text-red-400" : "text-muted-foreground")}>
                    {GEN_LABELS[key]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Log entries */}
        <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
          <div className="p-3 space-y-2">
            {logs.length === 0 ? (
              <p className="text-muted-foreground text-xs text-center py-8 font-mono">
                No calls logged yet. Click "Re-run" to regenerate and watch the pipeline.
              </p>
            ) : (
              logs.map((entry) => <LogEntryCard key={entry.id} entry={entry} />)
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border/40 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-mono">
            {logs.length} call{logs.length !== 1 ? "s" : ""} logged
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {logs.filter(l => l.status === "error").length} errors
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}

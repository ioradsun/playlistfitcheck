/* cache-bust: 2026-03-08-V1 */
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { MixProjectForm } from "@/components/mix/MixProjectForm";
import { MixCard } from "@/components/mix/MixCard";
import { GlobalTimeline } from "@/components/mix/GlobalTimeline";

import { useAudioEngine, type AudioMix } from "@/hooks/useAudioEngine";
import { useAuth } from "@/hooks/useAuth";
import { useUsageQuota } from "@/hooks/useUsageQuota";
import { useMixProjectStorage, type MixProjectData } from "@/hooks/useMixProjectStorage";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";
import type { RecentItem } from "@/components/AppSidebar";
import { sessionAudio } from "@/lib/sessionAudioCache";

const MAX_MIXES = 6;

interface MixFitCheckProps {
  initialProject?: MixProjectData | null;
  onProjectSaved?: () => void;
  onNewProject?: () => void;
  onHeaderProject?: (project: { title: string; onBack: () => void; rightContent?: React.ReactNode } | null) => void;
  onSavedId?: (id: string, projectData?: MixProjectData) => void;
  onOptimisticItem?: (item: RecentItem) => void;
}

export default function MixFitCheck({ initialProject, onProjectSaved, onNewProject, onHeaderProject, onSavedId, onOptimisticItem }: MixFitCheckProps = {}) {
  const { user } = useAuth();
  const mixQuota = useUsageQuota("mix");
  const { decodeFile, play, stop, playingId, getPlayheadPosition } = useAudioEngine();
  const { list, save, remove } = useMixProjectStorage();

  const [projectId, setProjectId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [mixes, setMixes] = useState<AudioMix[]>([]);
  const [markerStart, setMarkerStart] = useState(0);
  const [markerEnd, setMarkerEnd] = useState(10);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  // Track which mixes need re-upload (loaded from saved project without audio)
  const [needsReupload, setNeedsReupload] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const rafRef = useRef<number | null>(null);
  const loadSessionRef = useRef(0);
  const markerStartRef = useRef(markerStart);
  const markerEndRef = useRef(markerEnd);
  markerStartRef.current = markerStart;
  markerEndRef.current = markerEnd;
  const firstMix = mixes.find((m) => m.buffer);
  const firstWaveform = firstMix?.waveform || null;
  const referenceDuration = firstWaveform?.duration || 1;
  // Beat detection disabled in MixFit — Essentia WASM is heavyweight and not needed here.
  // GlobalTimeline renders fine without beats (markers/playback still fully functional).
  const beatGrid = null;
  const beatGridLoading = false;
  // Upload/decode progress
  const [isCreating, setIsCreating] = useState(false);
  const [processingFile, setProcessingFile] = useState<{ name: string; index: number; total: number } | null>(null);
  // Restoring audio from saved project URLs
  const [restoringAudio, setRestoringAudio] = useState(false);

  // Animate playhead
  useEffect(() => {
    if (!playingId) {
      setPlayheadTime(0);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      const pos = getPlayheadPosition();
      if (pos !== null) {
        setPlayheadTime(pos);
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPlayheadTime(0);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playingId, getPlayheadPosition]);

  // (initialProject effect is below handleLoadProject)

  const resetProject = useCallback(() => {
    // Invalidate any in-flight async project hydration before resetting
    loadSessionRef.current += 1;
    stop();
    setProjectId(null);
    setTitle("");
    setNotes("");
    setMixes([]);
    setMarkerStart(0);
    setMarkerEnd(10);
    setNeedsReupload(false);
    onNewProject?.();
  }, [stop, onNewProject]);

  const handleCreate = useCallback(async (t: string, n: string, files: File[]) => {
    if (!mixQuota.canUse) {
      toast.error(mixQuota.tier === "anonymous" ? "Sign up for more uses" : "Invite an artist to unlock unlimited");
      return;
    }
    // Cancel any stale async load before creating fresh project state
    loadSessionRef.current += 1;
    const newId = crypto.randomUUID();

    // Show progress in the form while decoding/uploading — don't commit projectId yet
    setIsCreating(true);
    setProcessingFile({ name: files[0]?.name ?? "", index: 1, total: files.length });

    // Optimistically add to sidebar immediately so it appears without waiting for save
    onOptimisticItem?.({
      id: newId,
      label: t || "Mix Project",
      meta: "just now",
      type: "mix",
      rawData: { id: newId, title: t, notes: n, mixes: [] },
    });

    const decodedMixes: (AudioMix & { audio_url?: string })[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProcessingFile({ name: file.name, index: i + 1, total: files.length });
      try {
        const { buffer, waveform } = await decodeFile(file);
        const mixName = file.name.replace(/\.(mp3|wav|m4a)$/i, "");
        const mixId = crypto.randomUUID();
        let audioUrl: string | undefined;

        if (user) {
          try {
            const ext = file.name.split(".").pop() || "mp3";
            const storagePath = `${user.id}/mix/${newId}/${mixId}.${ext}`;
            const { error: uploadError } = await supabase.storage
              .from("audio-clips")
              .upload(storagePath, file, { upsert: true, contentType: file.type || undefined });
            if (!uploadError) {
              const { data: urlData } = supabase.storage.from("audio-clips").getPublicUrl(storagePath);
              audioUrl = urlData.publicUrl;
            }
          } catch (e) {
            console.error("Failed to upload mix audio:", e);
          }
        }

        decodedMixes.push({
          id: mixId,
          name: mixName,
          buffer,
          waveform,
          rank: null,
          comments: "",
          audio_url: audioUrl,
        });
        sessionAudio.set("mix", `${newId}::${mixName}`, file, { ttlMs: 30 * 60 * 1000 });
      } catch {
        toast.error(`Failed to decode ${file.name}`);
      }
    }

    // All files processed — now commit state and switch to project view
    setIsCreating(false);
    setProcessingFile(null);
    setProjectId(newId);
    setTitle(t);
    setNotes(n);
    setMixes(decodedMixes);
    if (decodedMixes[0]?.waveform) setMarkerEnd(decodedMixes[0].waveform.duration);

    const projectData: MixProjectData = {
        id: newId,
        title: t,
        notes: n,
        mixes: decodedMixes.map((m) => ({ name: m.name, rank: m.rank, comments: m.comments, audio_url: m.audio_url })),
        markerStart: 0,
        markerEnd: decodedMixes[0]?.waveform?.duration ?? 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    try {
      await save(projectData);
      onProjectSaved?.();
      onSavedId?.(newId, projectData);
    } catch (e) {
      console.error("Failed initial save for MixFit project:", e);
    }
    await mixQuota.increment();
  }, [decodeFile, mixQuota, save, onProjectSaved, onSavedId, onOptimisticItem, user]);

  const handleLoadProject = useCallback(async (project: MixProjectData) => {
    const loadSession = ++loadSessionRef.current;
    const isStale = () => loadSessionRef.current !== loadSession;

    stop();
    if (isStale()) return;

    setProjectId(project.id);
    setTitle(project.title);
    setNotes(project.notes);
    setMarkerStart(project.markerStart);
    setMarkerEnd(project.markerEnd);
    setRestoringAudio(true);

    // Try to restore audio from session cache, then from stored URLs
    const restoredMixes: (AudioMix & { audio_url?: string })[] = [];
    let anyMissing = false;
    for (const m of project.mixes) {
      if (isStale()) return;

      // 1. Try session cache first
      const cached = sessionAudio.get("mix", `${project.id}::${m.name}`);
      if (cached) {
        try {
          const { buffer, waveform } = await decodeFile(cached);
          if (isStale()) return;
          restoredMixes.push({
            id: crypto.randomUUID(),
            name: m.name,
            buffer,
            waveform,
            rank: m.rank,
            comments: m.comments,
            audio_url: m.audio_url,
          });
          continue;
        } catch {
          // fall through
        }
      }

      // 2. Try fetching from stored audio URL
      if (m.audio_url) {
        try {
          const response = await fetch(m.audio_url);
          if (isStale()) return;
          if (response.ok) {
            const blob = await response.blob();
            if (isStale()) return;
            const file = new File([blob], `${m.name}.mp3`, { type: blob.type || "audio/mpeg" });
            const { buffer, waveform } = await decodeFile(file);
            if (isStale()) return;
            // Cache for session so subsequent navigations are instant
            sessionAudio.set("mix", `${project.id}::${m.name}`, file, { ttlMs: 30 * 60 * 1000 });
            restoredMixes.push({
              id: crypto.randomUUID(),
              name: m.name,
              buffer,
              waveform,
              rank: m.rank,
              comments: m.comments,
              audio_url: m.audio_url,
            });
            continue;
          }
        } catch {
          // fall through to placeholder
        }
      }

      // 3. Placeholder — audio not available
      anyMissing = true;
      restoredMixes.push({
        id: crypto.randomUUID(),
        name: m.name,
        buffer: null as any,
        waveform: { peaks: [], duration: 0 },
        rank: m.rank,
        comments: m.comments,
        audio_url: m.audio_url,
      });
    }

    if (isStale()) return;
    setMixes(restoredMixes);
    setRestoringAudio(false);
    setNeedsReupload(anyMissing && project.mixes.length > 0);

    // Update marker end from first decoded mix
    const firstDecoded = restoredMixes.find((m) => m.buffer);
    if (firstDecoded) {
      setMarkerEnd(firstDecoded.waveform.duration);
    }

    if (anyMissing && project.mixes.length > 0) {
      toast.info("Some audio files couldn't be restored — re-upload to resume playback.");
    }
  }, [stop, decodeFile]);

  // Index uses key={loadedMixProject?.id ?? "new"} so this component remounts fresh for each project.
  // Load initialProject once on mount — no ref tracking needed.
  useEffect(() => {
    if (initialProject) {
      handleLoadProject(initialProject);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      const remaining = MAX_MIXES - mixes.filter((m) => m.buffer).length;
      const toProcess = Array.from(files).slice(0, remaining);

      for (const file of toProcess) {
      try {
          const { buffer, waveform } = await decodeFile(file);
          const mixName = file.name.replace(/\.(mp3|wav|m4a)$/i, "");
          const mixId = crypto.randomUUID();
          let audioUrl: string | undefined;

          // Upload audio to storage for logged-in users
          if (user && projectId) {
            try {
              const ext = file.name.split(".").pop() || "mp3";
              const storagePath = `${user.id}/mix/${projectId}/${mixId}.${ext}`;
              const { error: uploadError } = await supabase.storage
                .from("audio-clips")
                .upload(storagePath, file, { upsert: true, contentType: file.type || undefined });
              if (!uploadError) {
                const { data: urlData } = supabase.storage.from("audio-clips").getPublicUrl(storagePath);
                audioUrl = urlData.publicUrl;
              }
            } catch (err) {
              console.error("Failed to upload mix audio:", err);
            }
          }

          const newMix: AudioMix & { audio_url?: string } = {
            id: mixId,
            name: mixName,
            buffer,
            waveform,
            rank: null,
            comments: "",
            audio_url: audioUrl,
          };
          // Cache file for session persistence
          if (projectId) sessionAudio.set("mix", `${projectId}::${mixName}`, file, { ttlMs: 30 * 60 * 1000 });
          setMixes((prev) => {
            const updated = [...prev, newMix];
            // Set marker end to duration of first mix if this is the first
            if (updated.filter((m) => m.buffer).length === 1) {
              setMarkerEnd(waveform.duration);
            }
            return updated;
          });
        } catch {
          toast.error(`Failed to decode ${file.name}`);
        }
      }
      if (fileRef.current) fileRef.current.value = "";
      setNeedsReupload(false);
    },
    [decodeFile, mixes, user, projectId]
  );

  const saveProject = useCallback(async (showToast = false) => {
    if (!projectId) return;
    setSaving(true);
    try {
      await save({
        id: projectId,
        title,
        notes,
        mixes: mixes.map((m: any) => ({ name: m.name, rank: m.rank, comments: m.comments, audio_url: m.audio_url })),
        markerStart,
        markerEnd,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setRefreshKey((k) => k + 1);
      onProjectSaved?.();
      if (showToast) {
        toast.success("Project saved.");
      }
    } catch {
      if (showToast) toast.error("Failed to save");
    }
    setSaving(false);
  }, [projectId, title, notes, mixes, markerStart, markerEnd, save]);

  // Debounced autosave
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveData = useMemo(() => 
    projectId ? JSON.stringify({ title, notes, mixes: mixes.map(m => ({ name: m.name, rank: m.rank, comments: m.comments })), markerStart, markerEnd }) : null
  , [projectId, title, notes, mixes, markerStart, markerEnd]);

  useEffect(() => {
    if (!autosaveData || !projectId || !user || restoringAudio || mixes.length === 0) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveProject(false);
    }, 2000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [autosaveData, projectId, saveProject, user, restoringAudio, mixes.length]);

  const updateMix = useCallback((id: string, updates: Partial<AudioMix>) => {
    setMixes((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }, []);

  const removeMix = useCallback(
    (id: string) => {
      if (playingId === id) stop();
      setMixes((prev) => prev.filter((m) => m.id !== id));
    },
    [playingId, stop]
  );

  const usedRanks = mixes.map((m) => m.rank).filter((r): r is number => r !== null);
  const activeMixes = mixes.filter((m) => m.buffer);

  // Report project to header with save indicator
  useEffect(() => {
    if (projectId) {
      const rightContent = user && lastSavedAt ? (
        <span className="text-[10px] text-muted-foreground shrink-0">✓ Saved {lastSavedAt}</span>
      ) : undefined;
      onHeaderProject?.({ title, onBack: resetProject, rightContent, onTitleChange: (newTitle) => {
        setTitle(newTitle);
        if (projectId) {
          supabase.from("mix_projects").update({ title: newTitle, updated_at: new Date().toISOString() }).eq("id", projectId).then(() => {});
        }
      } });
      return () => onHeaderProject?.(null);
    }
  }, [projectId, title, resetProject, onHeaderProject, user, lastSavedAt]);

  // If no project created yet, show form (with progress overlay while decoding)
  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-8 overflow-hidden">
        {isCreating && processingFile ? (
          <div className="w-full max-w-2xl mx-auto space-y-4 text-center">
            <div className="glass-card rounded-xl p-8 space-y-4">
              <div className="flex items-center justify-center gap-3">
                <svg className="animate-spin h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                <span className="text-sm font-medium">
                  Processing {processingFile.index} of {processingFile.total}
                </span>
              </div>
              <p className="text-xs font-mono text-muted-foreground truncate max-w-xs mx-auto">{processingFile.name}</p>
              <div className="w-full bg-muted/30 rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(processingFile.index / processingFile.total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <MixProjectForm onSubmit={handleCreate} />
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto py-6 px-4 space-y-5">
      {/* Notes */}
      {notes && (
        <p className="text-[10px] text-muted-foreground">{notes}</p>
      )}

      

      {/* Global Timeline */}
      <GlobalTimeline
        waveform={firstWaveform}
        markerStart={markerStart}
        markerEnd={markerEnd}
        referenceName={activeMixes[0]?.name}
        isPlaying={!!playingId}
        playheadPct={playingId ? (playheadTime / (firstWaveform?.duration || 1)) * 100 : 0}
        onMarkersChange={(s, e) => { setMarkerStart(s); setMarkerEnd(e); }}
        onMarkersChangeEnd={(s, e) => {
          if (!playingId) return;
          const playingMix = activeMixes.find((m) => m.id === playingId) || activeMixes[0];
          if (playingMix) play(playingMix.id, playingMix.buffer, s, e);
        }}
        onPlay={() => {
          const first = activeMixes[0];
          if (first) play(first.id, first.buffer, markerStartRef.current, markerEndRef.current);
        }}
        onStop={stop}
        beats={beatGrid?.beats ?? null}
        beatGridLoading={beatGridLoading}
      />

      {/* Upload area */}
      {activeMixes.length < MAX_MIXES && (
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          <button
            className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors border border-border/30 rounded px-2 py-1"
            onClick={() => fileRef.current?.click()}
          >
            {needsReupload
              ? `Reupload Mixes (${activeMixes.length}/${MAX_MIXES})`
              : `+ Add Mix (${activeMixes.length}/${MAX_MIXES})`}
          </button>
          {user ? (
            <span className="text-[10px] text-muted-foreground/60 font-mono">Audio saved to your account.</span>
          ) : (
            <span className="text-[10px] text-muted-foreground/60 font-mono">Sign in to save audio between sessions.</span>
          )}
        </div>
      )}

      {/* Mix Cards Grid */}
      {activeMixes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeMixes.map((mix) => (
            <MixCard
              key={mix.id}
              id={mix.id}
              name={mix.name}
              waveform={mix.waveform}
              rank={mix.rank}
              comments={mix.comments}
              isPlaying={playingId === mix.id}
              usedRanks={usedRanks}
              totalMixes={activeMixes.length}
              markerStartPct={(markerStart / referenceDuration) * 100}
              markerEndPct={(markerEnd / referenceDuration) * 100}
              playheadPct={playingId === mix.id ? (playheadTime / referenceDuration) * 100 : 0}
              onPlay={() => play(mix.id, mix.buffer, markerStartRef.current, markerEndRef.current)}
              onStop={stop}
              onNameChange={(name) => updateMix(mix.id, { name })}
              onRankChange={(rank) => updateMix(mix.id, { rank })}
              onCommentsChange={(comments) => updateMix(mix.id, { comments })}
              onRemove={() => removeMix(mix.id)}
            />
          ))}
        </div>
      )}

      {/* Results Summary */}
      {mixes.length > 0 && (
        <div className="glass-card rounded-xl p-4">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Results</p>
          {[...mixes]
            .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
            .map((m, idx) => (
              <div key={m.id} className={`flex items-center gap-4 py-2 ${idx > 0 ? "border-t border-border/30" : ""}`}>
                <span className="font-mono text-xs text-muted-foreground w-6 shrink-0">
                  {m.rank != null ? `#${m.rank}` : "—"}
                </span>
                <span className="text-xs text-foreground flex-1 truncate">{m.name}</span>
                <span className="text-[10px] text-muted-foreground truncate max-w-[180px] italic">{m.comments || ""}</span>
              </div>
            ))}
        </div>
      )}

      {activeMixes.length === 0 && !needsReupload && mixes.length === 0 && (
        restoringAudio ? (
          <div className="flex items-center justify-center gap-3 py-12">
            <svg className="animate-spin h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span className="text-[11px] font-mono text-muted-foreground">Restoring audio…</span>
          </div>
        ) : (
          <p className="text-center py-12 text-[11px] font-mono text-muted-foreground">Upload your first mix to get started</p>
        )
      )}

      <SignUpToSaveBanner />
    </div>
  );
}

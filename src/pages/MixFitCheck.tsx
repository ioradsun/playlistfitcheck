import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { MixProjectForm } from "@/components/mix/MixProjectForm";
import { MixCard } from "@/components/mix/MixCard";
import { GlobalTimeline } from "@/components/mix/GlobalTimeline";

import { useAudioEngine, type AudioMix } from "@/hooks/useAudioEngine";
import { useAuth } from "@/hooks/useAuth";
import { useUsageQuota } from "@/hooks/useUsageQuota";
import { useMixProjectStorage, type MixProjectData } from "@/hooks/useMixProjectStorage";

import { toast } from "sonner";
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";

const MAX_MIXES = 6;

interface MixFitCheckProps {
  initialProject?: MixProjectData | null;
  onProjectSaved?: () => void;
  onNewProject?: () => void;
  onHeaderProject?: (project: { title: string; onBack: () => void } | null) => void;
}

export default function MixFitCheck({ initialProject, onProjectSaved, onNewProject, onHeaderProject }: MixFitCheckProps = {}) {
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
  const markerStartRef = useRef(markerStart);
  const markerEndRef = useRef(markerEnd);
  markerStartRef.current = markerStart;
  markerEndRef.current = markerEnd;
  const firstWaveform = mixes.find((m) => m.buffer)?.waveform || null;
  const referenceDuration = firstWaveform?.duration || 1;

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
    setProjectId(crypto.randomUUID());
    setTitle(t);
    setNotes(n);
    // Decode uploaded files
    for (const file of files) {
      try {
        const { buffer, waveform } = await decodeFile(file);
        const newMix: AudioMix = {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.(mp3|wav|m4a)$/i, ""),
          buffer,
          waveform,
          rank: null,
          comments: "",
        };
        setMixes((prev) => {
          const updated = [...prev, newMix];
          if (updated.filter((m) => m.buffer).length === 1) {
            setMarkerEnd(waveform.duration);
          }
          return updated;
        });
      } catch {
        toast.error(`Failed to decode ${file.name}`);
      }
    }
    await mixQuota.increment();
  }, [decodeFile, mixQuota]);

  const handleLoadProject = useCallback((project: MixProjectData) => {
    stop();
    setProjectId(project.id);
    setTitle(project.title);
    setNotes(project.notes);
    setMarkerStart(project.markerStart);
    setMarkerEnd(project.markerEnd);
    // Restore mix metadata without audio buffers
    setMixes(
      project.mixes.map((m, i) => ({
        id: crypto.randomUUID(),
        name: m.name,
        buffer: null as any,
        waveform: { peaks: [], duration: 0 },
        rank: m.rank,
        comments: m.comments,
      }))
    );
    setNeedsReupload(project.mixes.length > 0);
    toast.info("Project loaded — re-upload audio files to resume playback.");
  }, [stop]);

  // Load initial project from dashboard navigation
  useEffect(() => {
    if (initialProject && !projectId) {
      handleLoadProject(initialProject);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProject]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      const remaining = MAX_MIXES - mixes.filter((m) => m.buffer).length;
      const toProcess = Array.from(files).slice(0, remaining);

      for (const file of toProcess) {
        try {
          const { buffer, waveform } = await decodeFile(file);
          const newMix: AudioMix = {
            id: crypto.randomUUID(),
            name: file.name.replace(/\.(mp3|wav)$/i, ""),
            buffer,
            waveform,
            rank: null,
            comments: "",
          };
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
    [decodeFile, mixes]
  );

  const saveProject = useCallback(async (showToast = false) => {
    if (!projectId) return;
    setSaving(true);
    try {
      await save({
        id: projectId,
        title,
        notes,
        mixes: mixes.map((m) => ({ name: m.name, rank: m.rank, comments: m.comments })),
        markerStart,
        markerEnd,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setRefreshKey((k) => k + 1);
      onProjectSaved?.();
      if (showToast) {
        toast.success("Project saved — audio files are not stored, only filenames, rankings & notes.");
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
    if (!autosaveData || !projectId || !user) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveProject(false);
    }, 2000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [autosaveData, projectId, saveProject, user]);

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

  // If no project created yet, show form + saved projects
  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-8 overflow-hidden">
        <MixProjectForm onSubmit={handleCreate} />
      </div>
    );
  }

  // Report project to header
  useEffect(() => {
    if (projectId) {
      onHeaderProject?.({ title, onBack: resetProject });
      return () => onHeaderProject?.(null);
    }
  }, [projectId, title, resetProject, onHeaderProject]);

  return (
    <div className="w-full max-w-5xl mx-auto py-6 px-4 space-y-5">
      {/* Notes */}
      {notes && (
        <p className="text-[10px] text-muted-foreground">{notes}</p>
      )}
      {user && lastSavedAt && (
        <div className="flex justify-end">
          <span className="text-[10px] text-muted-foreground shrink-0">✓ Saved {lastSavedAt}</span>
        </div>
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
          <span className="text-[10px] text-muted-foreground/60 font-mono">Audio files aren't saved or stored.</span>
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
        <p className="text-center py-12 text-[11px] font-mono text-muted-foreground">Upload your first mix to get started</p>
      )}

      <SignUpToSaveBanner />
    </div>
  );
}

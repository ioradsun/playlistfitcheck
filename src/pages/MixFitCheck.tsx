import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { MixProjectForm } from "@/components/mix/MixProjectForm";
import { MixCard } from "@/components/mix/MixCard";
import { GlobalTimeline } from "@/components/mix/GlobalTimeline";

import { useAudioEngine, type AudioMix } from "@/hooks/useAudioEngine";
import { useMixProjectStorage, type MixProjectData } from "@/hooks/useMixProjectStorage";
import { Upload, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";

const MAX_MIXES = 6;

interface MixFitCheckProps {
  initialProject?: MixProjectData | null;
  onProjectSaved?: () => void;
}

export default function MixFitCheck({ initialProject, onProjectSaved }: MixFitCheckProps = {}) {
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
  }, [stop]);

  const handleCreate = useCallback((t: string, n: string) => {
    setProjectId(crypto.randomUUID());
    setTitle(t);
    setNotes(n);
  }, []);

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
    if (!autosaveData || !projectId) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveProject(false);
    }, 2000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [autosaveData, projectId, saveProject]);

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
      <div className="w-full max-w-2xl mx-auto space-y-4">
        <MixProjectForm onSubmit={handleCreate} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetProject}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            {notes && <p className="text-xs text-muted-foreground">{notes}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastSavedAt && (
            <span className="text-xs text-muted-foreground">Saved {lastSavedAt}</span>
          )}
        </div>
      </div>

      {/* Re-upload prompt */}
      {needsReupload && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm text-center space-y-2">
          <p>Re-upload your audio files to resume playback.</p>
          <p className="text-xs text-muted-foreground">
            Filenames, rankings, and notes have been restored.
          </p>
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
        onMarkersChange={(s, e) => {
          setMarkerStart(s);
          setMarkerEnd(e);
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
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload size={14} className="mr-1" />
            Upload Mix{activeMixes.length > 0 ? "" : "es"} ({activeMixes.length}/{MAX_MIXES})
          </Button>
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
              onPlay={() => play(mix.id, mix.buffer, 0, mix.waveform.duration)}
              onStop={stop}
              onNameChange={(name) => updateMix(mix.id, { name })}
              onRankChange={(rank) => updateMix(mix.id, { rank })}
              onCommentsChange={(comments) => updateMix(mix.id, { comments })}
              onRemove={() => removeMix(mix.id)}
            />
          ))}
        </div>
      )}

      {/* Results Summary Table */}
      {activeMixes.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Results</h3>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Rank</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Filename</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Notes</th>
                </tr>
              </thead>
              <tbody>
                {[...activeMixes]
                  .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
                  .map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        {m.rank != null ? (
                          <span className={`font-mono font-bold ${m.rank === 1 ? "text-primary" : "text-foreground/70"}`}>
                            #{m.rank}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-foreground truncate max-w-[200px]">{m.name}</td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px] italic">
                        {m.comments || "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeMixes.length === 0 && !needsReupload && mixes.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Upload your first mix to get started
        </div>
      )}

      <SignUpToSaveBanner />
    </div>
  );
}

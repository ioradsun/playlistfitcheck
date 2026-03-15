import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type LyricVideo = {
  spotify_track_id: string;
  track_title: string;
  artist_name: string;
  synced_lyrics_lrc: string | null;
  lyrics_source: string | null;
};

function parseLRC(lrc: string): { time: number; text: string }[] {
  return lrc
    .split("\n")
    .flatMap((line) => {
      const matches = [...line.matchAll(/\[(\d{2}):(\d{2}\.\d{2,3})\]/g)];
      const text = line.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, "").trim();
      if (!text || !matches.length) return [];
      return matches.map((m) => ({
        time: parseInt(m[1]) * 60 + parseFloat(m[2]),
        text,
      }));
    })
    .sort((a, b) => a.time - b.time);
}

export default function LyricVideoSection({ userId, accentRgb }: { userId: string; accentRgb: string }) {
  const [video, setVideo] = useState<LyricVideo | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data } = await (supabase as any)
        .from("artist_lyric_videos")
        .select("spotify_track_id, track_title, artist_name, synced_lyrics_lrc, lyrics_source")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (isMounted) setVideo(data ?? null);
    })();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const lines = useMemo(() => {
    if (!video?.synced_lyrics_lrc) return [];
    return parseLRC(video.synced_lyrics_lrc);
  }, [video?.synced_lyrics_lrc]);

  const tick = useCallback(() => {
    if (!isPlaying || startTime === null) return;
    const e = (performance.now() - startTime) / 1000;
    setElapsed(e);
    rafRef.current = requestAnimationFrame(tick);
  }, [isPlaying, startTime]);

  useEffect(() => {
    if (!isPlaying || startTime === null) return;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, startTime, tick]);

  const activeIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (elapsed >= lines[i].time) idx = i;
      else break;
    }
    return idx;
  }, [elapsed, lines]);

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeIdx]);

  if (!video) return null;

  const hasLyrics = !!video.synced_lyrics_lrc && video.lyrics_source !== "none";

  return (
    <div className="space-y-4">
      <iframe
        src={`https://open.spotify.com/embed/track/${video.spotify_track_id}?utm_source=generator&theme=0`}
        width="100%"
        height="80"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        className="rounded-xl border border-white/10"
      />

      {!hasLyrics ? (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-5 text-center text-white/50 text-sm">
          Lyrics not available for this track yet.
        </div>
      ) : (
        <>
          <div className="bg-black/40 border border-white/10 rounded-2xl min-h-[180px] overflow-hidden flex items-center justify-center">
            <div className="w-full h-[180px] overflow-y-auto px-4 py-6 text-center">
              {lines.map((line, i) => {
                if (Math.abs(i - activeIdx) > 2) return null;
                const dist = Math.abs(i - activeIdx);
                const isActive = dist === 0;
                const style = isActive
                  ? {
                      fontSize: "clamp(20px,4vw,26px)",
                      color: "white",
                      fontStyle: "italic" as const,
                      textShadow: `0 0 30px rgba(${accentRgb}, 0.5)`,
                    }
                  : dist === 1
                    ? { fontSize: "15px", color: "rgba(255,255,255,0.45)" }
                    : { fontSize: "13px", color: "rgba(255,255,255,0.2)" };

                return (
                  <div
                    key={`${line.time}-${line.text}-${i}`}
                    ref={isActive ? activeLineRef : null}
                    className="transition-all duration-300 leading-relaxed"
                    style={style}
                  >
                    {line.text}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm">
            <button
              className="px-3 py-2 rounded-lg bg-white/10 text-white"
              onClick={() => {
                const base = performance.now() - elapsed * 1000;
                setStartTime(base);
                setIsPlaying(true);
              }}
            >
              ▶ Sync
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-white/10 text-white"
              onClick={() => setIsPlaying(false)}
            >
              ⏸ Pause
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-white/10 text-white"
              onClick={() => {
                setElapsed(0);
                setIsPlaying(false);
                setStartTime(null);
              }}
            >
              ↺ Reset
            </button>
          </div>
          <p className="text-white/25 text-xs text-center">▸ Start Spotify above · then press Sync</p>
        </>
      )}
    </div>
  );
}

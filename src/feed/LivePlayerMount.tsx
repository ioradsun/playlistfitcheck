import { useEffect } from "react";
import { LyricDancePlayer, type LyricDanceData } from "@/engine/LyricDancePlayer";
import { primaryAudio } from "@/audio/primaryAudio";
import { isGlobalMuted } from "@/lib/globalMute";

interface Props {
  data: LyricDanceData | null;
  slotRef: React.MutableRefObject<HTMLDivElement | null>;
  onTimeUpdate: (timeSec: number) => void;
}

export function LivePlayerMount({ data, slotRef, onTimeUpdate }: Props) {
  useEffect(() => {
    if (!data || !slotRef.current) return;

    const host = slotRef.current;
    const bg = document.createElement("canvas");
    const text = document.createElement("canvas");
    bg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;transition:opacity 200ms ease-out;";
    text.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;transition:opacity 200ms ease-out;";

    host.appendChild(bg);
    host.appendChild(text);

    const audio = primaryAudio.acquire(data.audio_url);
    const player = new LyricDancePlayer(data, bg, text, host, {
      bootMode: "minimal",
      externalAudio: audio,
    });

    const resize = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        player.resize(rect.width, rect.height);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const isInstrumental = !!(data as any)?.cinematic_direction?._instrumental || !((data as any)?.lines?.length);
    player.beatVisEnabled = isInstrumental;
    player.renderMode = isInstrumental ? "beat" : "lyric";
    player.textRenderMode = "dom";

    let cancelled = false;
    void player.init().then(() => {
      if (cancelled) return;
      player.scheduleFullModeUpgrade();
      player.primeAudio();
      player.audio.muted = isGlobalMuted();
      player.play(false);
      requestAnimationFrame(() => {
        if (cancelled) return;
        bg.style.opacity = "1";
        text.style.opacity = "1";
      });
    });

    let raf = 0;
    const tick = () => {
      onTimeUpdate(player.audio.currentTime || 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      player.destroy();
      primaryAudio.release();
      if (host.contains(bg)) host.removeChild(bg);
      if (host.contains(text)) host.removeChild(text);
    };
  }, [data, onTimeUpdate, slotRef]);

  return null;
}

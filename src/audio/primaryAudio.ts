let audio: HTMLAudioElement | null = null;

export const primaryAudio = {
  acquire(url: string): HTMLAudioElement {
    if (!audio) {
      audio = new Audio();
      audio.preload = "auto";
    }

    const absolute = new URL(url, window.location.origin).toString();
    if (audio.src !== absolute) {
      audio.src = absolute;
      audio.load();
    }
    return audio;
  },

  release(): void {
    if (!audio) return;
    audio.pause();
    audio.muted = true;
  },

  reset(): void {
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  },
};

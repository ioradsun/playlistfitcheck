const audioBufferCache = new WeakMap<File, Promise<AudioBuffer>>();

export function getCachedAudioBuffer(file: File): Promise<AudioBuffer> {
  const cached = audioBufferCache.get(file);
  if (cached) return cached;

  const decodePromise = (() => {
    const ctx = new AudioContext();
    return file
      .arrayBuffer()
      .then((ab) => ctx.decodeAudioData(ab))
      .finally(() => {
        void ctx.close();
      });
  })();

  audioBufferCache.set(file, decodePromise);
  return decodePromise;
}

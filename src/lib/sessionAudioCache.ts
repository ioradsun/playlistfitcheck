/**
 * SessionAudioCache — Module-level cache for in-memory audio File objects.
 *
 * Survives React component remounts (key changes, navigation) but is
 * lost on full page reload or tab close — which is exactly the desired
 * lifetime for ephemeral audio data that isn't persisted to a server.
 *
 * Usage:
 *   sessionAudio.set("lyric", projectId, file)
 *   sessionAudio.get("lyric", projectId)  // File | undefined
 *   sessionAudio.clearTool("lyric")       // clear all for a tool
 *   sessionAudio.clearAll()               // logout
 */

const cache = new Map<string, File>();

function makeKey(tool: string, id: string): string {
  return `${tool}::${id}`;
}

export const sessionAudio = {
  set(tool: string, id: string, file: File): void {
    cache.set(makeKey(tool, id), file);
  },

  get(tool: string, id: string): File | undefined {
    return cache.get(makeKey(tool, id));
  },

  has(tool: string, id: string): boolean {
    return cache.has(makeKey(tool, id));
  },

  remove(tool: string, id: string): void {
    cache.delete(makeKey(tool, id));
  },

  clearTool(tool: string): void {
    for (const key of [...cache.keys()]) {
      if (key.startsWith(`${tool}::`)) cache.delete(key);
    }
  },

  clearAll(): void {
    cache.clear();
  },
};

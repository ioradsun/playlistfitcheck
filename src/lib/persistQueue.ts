import { supabase } from "@/integrations/supabase/client";

export interface PersistJob {
  table: "lyric_projects";
  id: string;
  payload: Record<string, unknown>;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class PersistQueue {
  private readonly queue: PersistJob[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private readonly debounceMs = 1500;

  enqueue(job: PersistJob): void {
    this.queue.push(job);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      void this.flush();
    }, this.debounceMs);
  }

  async flushNow(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;

    const jobs = this.queue.splice(0, this.queue.length);
    const merged = new Map<string, PersistJob>();
    for (const job of jobs) {
      const key = `${job.table}:${job.id}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...job, payload: { ...job.payload } });
      } else {
        merged.set(key, {
          table: existing.table,
          id: existing.id,
          payload: { ...existing.payload, ...job.payload },
        });
      }
    }

    for (const job of merged.values()) {
      let attempt = 0;
      while (attempt < MAX_RETRIES) {
        attempt += 1;
        const { error } = await supabase
          .from(job.table as any)
          .update({ ...job.payload, updated_at: new Date().toISOString() } as any)
          .eq("id", job.id);

        if (!error) {
          // Invalidate localStorage cache for lyric rows so next load is fresh.
          if (job.table === "lyric_projects") {
            try {
              localStorage.removeItem(`tfm:lyric:${job.id}`);
            } catch {}
          }
          break;
        }

        console.error(
          `[Persist] update failed (${job.table}:${job.id}) attempt ${attempt}/${MAX_RETRIES}`,
          error,
        );
        if (attempt >= MAX_RETRIES) break;
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }

    this.flushing = false;
    if (this.queue.length > 0) {
      await this.flush();
    }
  }
}

export const persistQueue = new PersistQueue();

// Flush pending writes when the page is being left or hidden.
// visibilitychange→hidden is more reliable than beforeunload on mobile Safari.
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void persistQueue.flushNow();
    }
  });
  window.addEventListener("pagehide", () => {
    void persistQueue.flushNow();
  });
}

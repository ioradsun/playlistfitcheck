import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/sessionId';

export async function emitFire(
  danceId: string,
  lineIndex: number,
  timeSec: number,
  holdMs: number,
  source?: "feed" | "shareable" | "embed",
  userId?: string | null,
): Promise<void> {
  supabase.from('lyric_dance_fires' as any).insert({
    dance_id: danceId,
    session_id: getSessionId(),
    line_index: lineIndex,
    time_sec: timeSec,
    hold_ms: holdMs,
    ...(source ? { source } : {}),
    ...(userId ? { user_id: userId } : {}),
  }).then();
}

export async function emitExposure(
  danceId: string,
  lineIndex: number,
  source?: "feed" | "shareable" | "embed",
): Promise<void> {
  supabase.from('lyric_dance_exposures' as any)
    .upsert({
      dance_id: danceId,
      session_id: getSessionId(),
      line_index: lineIndex,
      ...(source ? { source } : {}),
    }, { onConflict: 'dance_id,session_id,line_index', ignoreDuplicates: true })
    .then();
}

export async function emitClosingPick(
  danceId: string,
  hookIndex: number | null,
  freeText: string | null,
  source?: "feed" | "shareable" | "embed",
): Promise<void> {
  supabase.from('lyric_dance_closing_picks' as any)
    .upsert({
      dance_id: danceId,
      session_id: getSessionId(),
      hook_index: hookIndex,
      free_text: freeText?.trim() || null,
      ...(source ? { source } : {}),
    }, { onConflict: 'dance_id,session_id' })
    .then();
}

export async function upsertPlay(
  danceId: string,
  opts: {
    progressPct: number;
    wasMuted: boolean;
    durationSec: number;
    playCount?: number;
    userId?: string | null;
  },
): Promise<void> {
  const sessionId = getSessionId();
  supabase
    .from('lyric_dance_plays' as any)
    .upsert(
      {
        dance_id: danceId,
        session_id: sessionId,
        user_id: opts.userId ?? null,
        was_muted: opts.wasMuted,
        max_progress_pct: Math.round(Math.max(0, Math.min(100, opts.progressPct))),
        play_count: opts.playCount ?? 1,
        duration_sec: Math.round(opts.durationSec),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'dance_id,session_id' },
    )
    .then();
}

export async function fetchFireData(danceId: string): Promise<Array<{
  line_index: number;
  time_sec: number;
  hold_ms: number;
  created_at: string;
}>> {
  try {
    const { data, error } = await supabase
      .from('lyric_dance_fires' as any)
      .select('line_index, time_sec, hold_ms, created_at')
      .eq('dance_id', danceId)
      .order('time_sec', { ascending: true });
    if (error) return [];
    return (data as any[]) ?? [];
  } catch {
    return [];
  }
}

export async function fetchFireStrength(danceId: string): Promise<Array<{
  line_index: number;
  fire_strength: number;
  fire_count: number;
  avg_hold_ms: number;
}>> {
  const { data } = await supabase
    .from('v_fire_strength' as any)
    .select('line_index, fire_strength, fire_count, avg_hold_ms')
    .eq('dance_id', danceId)
    .order('fire_strength', { ascending: false });
  return (data as any[]) ?? [];
}


export async function fetchSessionFires(
  danceId: string,
  sessionId: string,
): Promise<Array<{ line_index: number; hold_ms: number }>> {
  try {
    const { data, error } = await supabase
      .from('lyric_dance_fires' as any)
      .select('line_index, hold_ms')
      .eq('dance_id', danceId)
      .eq('session_id', sessionId);
    if (error) return [];
    return (data as any[]) ?? [];
  } catch {
    return [];
  }
}

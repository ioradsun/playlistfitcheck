import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/sessionId';

let fireTableAvailable = true;
let playTableAvailable = true;

function isMissingTableError(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === 'PGRST205';
}

export async function emitFire(
  danceId: string,
  lineIndex: number,
  timeSec: number,
  holdMs: number,
  source?: "feed" | "shareable" | "embed",
  userId?: string | null,
): Promise<void> {
  if (!fireTableAvailable) return;

  const { error } = await supabase.from('project_fires' as any).insert({
    project_id: danceId,
    session_id: getSessionId(),
    line_index: lineIndex,
    time_sec: timeSec,
    hold_ms: holdMs,
    ...(source ? { source } : {}),
    ...(userId ? { user_id: userId } : {}),
  });

  if (isMissingTableError(error)) fireTableAvailable = false;
}

export async function emitExposure(
  danceId: string,
  lineIndex: number,
  source?: "feed" | "shareable" | "embed",
): Promise<void> {
  supabase.from('project_exposures' as any)
    .upsert({
      project_id: danceId,
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
  supabase.from('project_closing_picks' as any)
    .upsert({
      project_id: danceId,
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
  if (!playTableAvailable) return;

  const sessionId = getSessionId();
  const { error } = await supabase
    .from('project_plays' as any)
    .upsert(
      {
        project_id: danceId,
        session_id: sessionId,
        user_id: opts.userId ?? null,
        was_muted: opts.wasMuted,
        max_progress_pct: Math.round(Math.max(0, Math.min(100, opts.progressPct))),
        play_count: opts.playCount ?? 1,
        duration_sec: Math.round(opts.durationSec),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'dance_id,session_id' },
    );

  if (isMissingTableError(error)) playTableAvailable = false;
}

export async function fetchFireData(danceId: string): Promise<Array<{
  line_index: number;
  time_sec: number;
  hold_ms: number;
  created_at: string;
}>> {
  if (!fireTableAvailable) return [];

  try {
    const { data, error } = await supabase
      .from('project_fires' as any)
      .select('line_index, time_sec, hold_ms, created_at')
      .eq('project_id', danceId)
      .order('time_sec', { ascending: true });

    if (isMissingTableError(error)) fireTableAvailable = false;
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
    .eq('project_id', danceId)
    .order('fire_strength', { ascending: false });
  return (data as any[]) ?? [];
}

export async function fetchSessionFires(
  danceId: string,
  sessionId: string,
): Promise<Array<{ line_index: number; hold_ms: number }>> {
  if (!fireTableAvailable) return [];

  try {
    const { data, error } = await supabase
      .from('project_fires' as any)
      .select('line_index, hold_ms')
      .eq('project_id', danceId)
      .eq('session_id', sessionId);

    if (isMissingTableError(error)) fireTableAvailable = false;
    if (error) return [];
    return (data as any[]) ?? [];
  } catch {
    return [];
  }
}

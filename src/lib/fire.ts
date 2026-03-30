import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/sessionId';

export async function emitFire(
  danceId: string,
  lineIndex: number,
  timeSec: number,
  holdMs: number,
): Promise<void> {
  supabase.from('lyric_dance_fires' as any).insert({
    dance_id: danceId,
    session_id: getSessionId(),
    line_index: lineIndex,
    time_sec: timeSec,
    hold_ms: holdMs,
  }).then();
}

export async function emitExposure(
  danceId: string,
  lineIndex: number,
): Promise<void> {
  supabase.from('lyric_dance_exposures' as any)
    .upsert({
      dance_id: danceId,
      session_id: getSessionId(),
      line_index: lineIndex,
    }, { onConflict: 'dance_id,session_id,line_index', ignoreDuplicates: true })
    .then();
}

export async function emitClosingPick(
  danceId: string,
  hookIndex: number | null,
  freeText: string | null,
): Promise<void> {
  supabase.from('lyric_dance_closing_picks' as any)
    .upsert({
      dance_id: danceId,
      session_id: getSessionId(),
      hook_index: hookIndex,
      free_text: freeText?.trim() || null,
    }, { onConflict: 'dance_id,session_id' })
    .then();
}

export async function fetchFireData(danceId: string): Promise<Array<{
  line_index: number;
  time_sec: number;
  hold_ms: number;
  created_at: string;
}>> {
  const { data } = await supabase
    .from('lyric_dance_fires' as any)
    .select('line_index, time_sec, hold_ms, created_at')
    .eq('dance_id', danceId)
    .order('time_sec', { ascending: true });
  return (data as any[]) ?? [];
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

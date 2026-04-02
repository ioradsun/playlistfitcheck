import { supabase } from "@/integrations/supabase/client";

export function invokeWithTimeout<T = any>(
  fnName: string,
  body: Record<string, unknown>,
  timeoutMs = 120_000,
): Promise<{ data: T | null; error: any }> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            `Edge function "${fnName}" timed out after ${timeoutMs / 1000}s`,
          ),
        ),
      timeoutMs,
    ),
  );
  return Promise.race([
    supabase.functions.invoke(fnName, { body }) as Promise<{
      data: T | null;
      error: any;
    }>,
    timeout,
  ]);
}

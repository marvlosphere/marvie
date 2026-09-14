import { createSupabaseClient } from "@/lib/supabase";

/** Logs an unexpected error both to Vercel's function logs (console.error)
 * and to Supabase, so failures are visible somewhere other than "a user
 * eventually complains." Never throws itself. */
export async function logError(source: string, err: unknown, detail?: Record<string, unknown>) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${source}]`, message, detail ?? "");
  try {
    const supabase = createSupabaseClient();
    await supabase.from("error_log").insert({ source, message, detail: detail ?? null });
  } catch {
    // logging must never itself crash the request
  }
}

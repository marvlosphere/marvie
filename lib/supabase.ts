import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let client: SupabaseClient | null = null;

// A single shared client per tab/process means every Realtime channel this
// app opens (chat, polls, whiteboard, breakout listener, join requests)
// multiplexes over ONE websocket instead of each caller opening its own.
// Previously every createSupabaseClient() call made a brand-new client —
// harmless for one-off queries, but each one also opens its own independent
// Realtime socket the moment .channel().subscribe() is called on it. A
// single participant with chat + polls + whiteboard touched during a call
// was quietly holding 3+ separate connections instead of 1. Against
// Supabase free tier's 200-concurrent-connection cap (project-wide, not
// per-room), that's the difference between a 100-person call costing ~100
// connections vs. 300+.
export function createSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(url, anonKey);
  }
  return client;
}

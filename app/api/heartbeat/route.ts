import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { logError } from "@/lib/logError";

export async function POST(req: NextRequest) {
  const { room } = (await req.json()) as { room?: string };
  if (!room) {
    return NextResponse.json({ error: "room is required" }, { status: 400 });
  }
  try {
    const supabase = createSupabaseClient();
    await supabase.from("rooms").update({ last_active_at: new Date().toISOString() }).eq("name", room);
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logError("api/heartbeat", err, { room });
    return NextResponse.json({ error: "heartbeat failed" }, { status: 500 });
  }
}

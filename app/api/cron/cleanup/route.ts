import { NextRequest, NextResponse } from "next/server";
import { cleanupStaleRooms } from "@/lib/cleanupStaleRooms";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const removed = await cleanupStaleRooms();
  return NextResponse.json({ ok: true, removed });
}

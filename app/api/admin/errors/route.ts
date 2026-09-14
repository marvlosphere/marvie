import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

/** Minimal ops visibility: GET /api/admin/errors?secret=<CRON_SECRET> to see
 * the last 50 logged errors. No dashboard, just a JSON dump — enough to
 * notice something's wrong without wiring up an external monitoring
 * service. */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("error_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ errors: data });
}

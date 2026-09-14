import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { createSupabaseClient } from "@/lib/supabase";
import { logError } from "@/lib/logError";

// Excludes visually ambiguous characters (0/O, 1/l/I) so codes are easy to
// read aloud or copy correctly.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const CODE_LENGTH = 8;

function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// Rooms are now only ever created here, never implicitly by visiting a URL —
// this is what makes room codes actually unique and lets /api/token safely
// reject codes nobody generated.
export async function POST() {
  try {
    const supabase = createSupabaseClient();
    const hostSecret = randomUUID();

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { data, error } = await supabase
        .from("rooms")
        .insert({ name: code, host_secret: hostSecret })
        .select();

      if (!error && data && data.length > 0) {
        return NextResponse.json({ room: code, hostSecret });
      }
      // Collision on the name primary key (astronomically unlikely at this
      // alphabet/length) — just try another code.
    }

    return NextResponse.json({ error: "Could not allocate a room code. Please try again." }, { status: 500 });
  } catch (err) {
    await logError("api/rooms/create", err);
    return NextResponse.json({ error: "Something went wrong creating the room." }, { status: 500 });
  }
}

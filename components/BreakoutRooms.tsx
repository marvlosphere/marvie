"use client";

import { useEffect, useState } from "react";
import { useParticipants, useLocalParticipant } from "@livekit/components-react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase";
import { breakoutRoomName, parentRoomOf } from "@/lib/breakoutRooms";

export { breakoutRoomName, parentRoomOf };

export default function BreakoutRooms({
  roomName,
  isHost,
  displayName,
}: {
  roomName: string;
  isHost: boolean;
  displayName: string;
}) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);

  async function startBreakouts() {
    setBusy(true);
    try {
      const supabase = createSupabaseClient();
      const channel = supabase.channel(`breakout:${roomName}`);
      await channel.subscribe();
      // The host stays in the main room as "control tower" so there's always
      // someone able to bring people back — otherwise the host would get
      // shuffled into a breakout room with no way to recall everyone.
      const attendees = participants.filter((p) => p.identity !== localParticipant?.identity);
      attendees.forEach((p, i) => {
        const group = i % count;
        channel.send({
          type: "broadcast",
          event: "assign",
          payload: { identity: p.identity, room: breakoutRoomName(roomName, group + 1) },
        });
      });
      await supabase.removeChannel(channel);
    } finally {
      setBusy(false);
    }
  }

  async function endBreakouts() {
    setBusy(true);
    try {
      const supabase = createSupabaseClient();
      const channel = supabase.channel(`breakout:${roomName}`);
      await channel.subscribe();
      channel.send({ type: "broadcast", event: "recall", payload: { room: roomName } });
      await supabase.removeChannel(channel);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="glass-card marvie-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        ["--panel-width" as string]: "280px",
        margin: "0 0.75rem 0.75rem 0",
        borderRadius: 16,
        overflow: "hidden",
        padding: "1rem",
        gap: "0.75rem",
      }}
    >
      <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Breakout rooms</span>
      {isHost ? (
        <>
          <label style={{ fontSize: "0.8rem", color: "var(--text-1)", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            Number of rooms
            <input
              className="glass-input"
              type="number"
              min={2}
              max={8}
              value={count}
              onChange={(e) => setCount(Math.max(2, Math.min(8, Number(e.target.value) || 2)))}
              style={{ padding: "0.4rem 0.6rem", fontSize: "0.85rem", width: 80 }}
            />
          </label>
          <button className="btn-primary" style={{ padding: "0.5rem", fontSize: "0.85rem" }} disabled={busy} onClick={startBreakouts}>
            Split {Math.max(0, participants.length - 1)} people into {count} rooms
          </button>
          <button className="btn-ghost" style={{ padding: "0.5rem", fontSize: "0.85rem" }} disabled={busy} onClick={endBreakouts}>
            Bring everyone back
          </button>
          <p style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>You&apos;ll stay in the main room so you can always recall everyone.</p>
        </>
      ) : (
        <p style={{ fontSize: "0.8rem", color: "var(--text-1)" }}>Only the host can start breakout rooms.</p>
      )}
      <p style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>
        {displayName} · {localParticipant?.identity}
      </p>
    </div>
  );
}

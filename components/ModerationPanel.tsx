"use client";

import { useState } from "react";
import { useParticipants, useLocalParticipant } from "@livekit/components-react";
import type { JoinRequest } from "@/hooks/usePendingJoinRequests";
import PanelCloseButton from "@/components/PanelCloseButton";

export default function ModerationPanel({
  roomName,
  isHost,
  hostSecret,
  raisedHands,
  requests,
  onClose,
}: {
  roomName: string;
  isHost: boolean;
  hostSecret: string | null;
  raisedHands: Set<string>;
  requests: JoinRequest[];
  onClose: () => void;
}) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [busy, setBusy] = useState<string | null>(null);

  async function respond(identity: string, action: "admit" | "deny") {
    if (!hostSecret) return;
    setBusy(identity + action);
    try {
      await fetch("/api/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomName, hostSecret, action, targetIdentity: identity }),
      });
    } finally {
      setBusy(null);
    }
  }

  async function moderate(action: "mute" | "remove", targetIdentity: string) {
    if (!hostSecret) return;
    setBusy(targetIdentity + action);
    try {
      await fetch("/api/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomName, hostSecret, action, targetIdentity }),
      });
    } finally {
      setBusy(null);
    }
  }

  async function muteAll() {
    if (!hostSecret) return;
    setBusy("__all__");
    try {
      await fetch("/api/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomName, hostSecret, action: "muteAll" }),
      });
    } finally {
      setBusy(null);
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
      }}
    >
      {isHost && requests.length > 0 && (
        <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--glass-border)" }}>
          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem" }}>
            Waiting to join ({requests.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {requests.map((r) => (
              <div key={r.identity} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.85rem" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.display_name}</span>
                <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
                  <button
                    className="btn-ghost"
                    style={{ padding: "0.3rem 0.5rem", fontSize: "0.75rem" }}
                    disabled={busy === r.identity + "admit"}
                    onClick={() => respond(r.identity, "admit")}
                  >
                    Admit
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ padding: "0.3rem 0.5rem", fontSize: "0.75rem" }}
                    disabled={busy === r.identity + "deny"}
                    onClick={() => respond(r.identity, "deny")}
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--glass-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>People ({participants.length})</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          {isHost && (
            <button className="btn-ghost" style={{ padding: "0.3rem 0.5rem", fontSize: "0.75rem" }} disabled={busy === "__all__"} onClick={muteAll}>
              Mute all
            </button>
          )}
          <PanelCloseButton onClose={onClose} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {participants.map((p) => {
          const isSelf = p.identity === localParticipant?.identity;
          const handUp = raisedHands.has(p.identity);
          return (
            <div
              key={p.identity}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.5rem 0.6rem",
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                fontSize: "0.85rem",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                {handUp && <span title="Hand raised">✋</span>}
                {p.identity}
                {isSelf ? " (you)" : ""}
              </span>
              {isHost && !isSelf && (
                <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
                  <button
                    className="btn-ghost"
                    style={{ padding: "0.3rem 0.5rem", fontSize: "0.75rem" }}
                    disabled={busy === p.identity + "mute"}
                    onClick={() => moderate("mute", p.identity)}
                  >
                    Mute
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ padding: "0.3rem 0.5rem", fontSize: "0.75rem" }}
                    disabled={busy === p.identity + "remove"}
                    onClick={() => moderate("remove", p.identity)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

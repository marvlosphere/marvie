"use client";

import { useState } from "react";
import type { JoinRequest } from "@/hooks/usePendingJoinRequests";

const MAX_VISIBLE = 3;

export default function JoinRequestToast({
  requests,
  roomName,
  hostSecret,
}: {
  requests: JoinRequest[];
  roomName: string;
  hostSecret: string | null;
}) {
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

  async function admitAll() {
    if (!hostSecret) return;
    setBusy("__all__");
    try {
      await fetch("/api/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomName, hostSecret, action: "admitAll" }),
      });
    } finally {
      setBusy(null);
    }
  }

  if (requests.length === 0) return null;

  const visible = requests.slice(0, MAX_VISIBLE);
  const overflow = requests.length - visible.length;

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        width: "min(92vw, 340px)",
      }}
    >
      {visible.map((r) => (
        <div
          key={r.identity}
          className="glass-card"
          style={{
            padding: "0.85rem 1rem",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            boxShadow: "0 8px 30px rgba(124, 92, 255, 0.35)",
          }}
        >
          <span style={{ fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <strong>{r.display_name}</strong> wants to join
          </span>
          <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
            <button
              className="btn-primary"
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
              disabled={busy === r.identity + "admit"}
              onClick={() => respond(r.identity, "admit")}
            >
              Admit
            </button>
            <button
              className="btn-ghost"
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
              disabled={busy === r.identity + "deny"}
              onClick={() => respond(r.identity, "deny")}
            >
              Deny
            </button>
          </div>
        </div>
      ))}
      {(overflow > 0 || requests.length > 1) && (
        <div
          className="glass-card"
          style={{
            padding: "0.7rem 1rem",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <span style={{ fontSize: "0.82rem", color: "var(--text-1)" }}>
            {overflow > 0 ? `+${overflow} more waiting` : "Multiple people waiting"}
          </span>
          <button
            className="btn-primary"
            style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
            disabled={busy === "__all__"}
            onClick={admitAll}
          >
            Admit all ({requests.length})
          </button>
        </div>
      )}
    </div>
  );
}

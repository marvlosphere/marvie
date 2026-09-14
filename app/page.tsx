"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSavedName, saveName } from "@/lib/savedName";
import { hostSecretStorageKey } from "@/lib/hostSecret";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = getSavedName();
    if (saved) setName(saved);
  }, []);

  async function startNewCall(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    saveName(trimmed);
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/rooms/create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create a room. Please try again.");
        return;
      }
      window.localStorage.setItem(hostSecretStorageKey(data.room), data.hostSecret);
      router.push(`/room/${encodeURIComponent(data.room)}/share?name=${encodeURIComponent(trimmed)}`);
    } catch {
      setError("Could not create a room. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  function joinWithCode(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedRoom = room.trim();
    if (!trimmedName || !trimmedRoom) return;
    saveName(trimmedName);
    router.push(`/room/${encodeURIComponent(trimmedRoom)}?name=${encodeURIComponent(trimmedName)}`);
  }

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "1.5rem",
      }}
    >
      <div
        className="glass-card"
        style={{
          width: "100%",
          maxWidth: 400,
          padding: "2.5rem 2rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.75rem",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.6rem" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 20px rgba(124, 92, 255, 0.4)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3.5l4 3V7.5l-4 3Z"
                stroke="white"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Marvie
          </h1>
          <p
            style={{
              color: "var(--text-1)",
              fontSize: "0.9rem",
              textAlign: "center",
              lineHeight: 1.5,
              maxWidth: 300,
            }}
          >
            Text, audio, and video calls.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", width: "100%" }}>
          <input
            className="glass-input"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <button
            type="button"
            className="btn-primary"
            style={{ width: "100%" }}
            disabled={!name.trim() || creating}
            onClick={startNewCall}
          >
            {creating ? "Creating…" : "Start a new call"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--text-2)", fontSize: "0.75rem" }}>
            <span style={{ flex: 1, height: 1, background: "var(--glass-border)" }} />
            or
            <span style={{ flex: 1, height: 1, background: "var(--glass-border)" }} />
          </div>

          <form onSubmit={joinWithCode} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <input
              className="glass-input"
              placeholder="Room code"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            />
            <button type="submit" className="btn-ghost" style={{ width: "100%" }} disabled={!name.trim() || !room.trim()}>
              Join with a code
            </button>
          </form>

          {error && (
            <p style={{ color: "#ff6b81", fontSize: "0.8rem", textAlign: "center" }}>{error}</p>
          )}
        </div>
      </div>
    </main>
  );
}

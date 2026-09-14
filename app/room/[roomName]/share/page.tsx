"use client";

import { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { hostSecretStorageKey } from "@/lib/hostSecret";

// The room already exists at this point (created via /api/rooms/create) but
// nobody has connected yet, so no call has started and no recording has
// started — this screen exists purely so a host can grab the invite link
// before anyone joins, e.g. when scheduling a call ahead of time.
export default function SharePage({ params }: { params: Promise<{ roomName: string }> }) {
  const { roomName } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const name = searchParams.get("name") ?? "";
  const [copied, setCopied] = useState(false);
  const [inviteLink, setInviteLink] = useState("");

  useEffect(() => {
    // Only the browser that actually created this room has its host secret
    // stashed locally. Anyone else landing here (e.g. a stray bookmark) has
    // nothing to "start", so send them straight into the join flow instead.
    const storageKey = hostSecretStorageKey(roomName);
    if (!window.localStorage.getItem(storageKey)) {
      router.replace(`/room/${encodeURIComponent(roomName)}${name ? `?name=${encodeURIComponent(name)}` : ""}`);
      return;
    }
    setInviteLink(`${window.location.origin}/room/${encodeURIComponent(roomName)}`);
  }, [roomName, name, router]);

  function copyLink() {
    navigator.clipboard.writeText(inviteLink).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function startCall() {
    router.push(`/room/${encodeURIComponent(roomName)}?name=${encodeURIComponent(name)}`);
  }

  if (!inviteLink) return null;

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
          maxWidth: 420,
          padding: "2.5rem 2rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.5rem",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Your call is ready</h1>
          <p style={{ color: "var(--text-1)", fontSize: "0.85rem", textAlign: "center" }}>
            Share this link with the people you&apos;re calling. The call only starts once someone joins.
          </p>
        </div>

        <div
          style={{
            width: "100%",
            padding: "0.85rem 1rem",
            borderRadius: 12,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid var(--glass-border)",
            fontSize: "0.82rem",
            wordBreak: "break-all",
            color: "var(--text-0)",
          }}
        >
          {inviteLink}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
          <button type="button" className="btn-ghost" style={{ width: "100%" }} onClick={copyLink}>
            {copied ? "Copied!" : "Copy invite link"}
          </button>
          <button type="button" className="btn-primary" style={{ width: "100%" }} onClick={startCall}>
            Start call now
          </button>
        </div>
      </div>
    </main>
  );
}

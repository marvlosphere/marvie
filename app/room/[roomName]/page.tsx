"use client";

import "@livekit/components-styles";
import { useEffect, useMemo, useRef, useState, use, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import { ExternalE2EEKeyProvider, isE2EESupported } from "livekit-client";
import RoomChat from "@/components/RoomChat";
import ModerationPanel from "@/components/ModerationPanel";
import Reactions from "@/components/Reactions";
import ExtraControls from "@/components/ExtraControls";
import AutoHideControls from "@/components/AutoHideControls";
import EffectsPanel from "@/components/EffectsPanel";
import Polls from "@/components/Polls";
import Whiteboard from "@/components/Whiteboard";
import BreakoutRooms, { parentRoomOf } from "@/components/BreakoutRooms";
import BreakoutListener from "@/components/BreakoutListener";
import RoomHeartbeat from "@/components/RoomHeartbeat";
import { createSupabaseClient } from "@/lib/supabase";
import { getSavedName, saveName } from "@/lib/savedName";
import { hostSecretStorageKey } from "@/lib/hostSecret";
import { usePendingJoinRequests } from "@/hooks/usePendingJoinRequests";
import JoinRequestToast from "@/components/JoinRequestToast";

type Panel = "chat" | "people" | "polls" | "whiteboard" | "breakout" | "effects" | null;

const HEADER_OVERLAY_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 21,
};

function MoreMenuItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "0.55rem 0.75rem",
        borderRadius: 10,
        border: "none",
        background: active ? "rgba(124, 92, 255, 0.28)" : "transparent",
        color: "var(--text-0)",
        fontSize: "0.85rem",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.08)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {label}
    </button>
  );
}

function MoreMenu({
  isHost,
  role,
  parent,
  locked,
  panel,
  pendingCount,
  onTogglePanel,
  onToggleLock,
  onInviteCohost,
}: {
  isHost: boolean;
  role: "host" | "cohost" | null;
  parent: string | null;
  locked: boolean;
  panel: Panel;
  pendingCount: number;
  onTogglePanel: (p: Exclude<Panel, null>) => void;
  onToggleLock: () => void;
  onInviteCohost: () => void;
}) {
  const [open, setOpen] = useState(false);

  function pick(p: Exclude<Panel, null>) {
    onTogglePanel(p);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn-ghost"
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={open ? { background: "rgba(255,255,255,0.18)" } : undefined}
      >
        More {open ? "▲" : "▼"}
        {pendingCount > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 18,
              height: 18,
              padding: "0 4px",
              borderRadius: 9,
              background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
              color: "#fff",
              fontSize: "0.68rem",
              fontWeight: 700,
              marginLeft: "0.15rem",
            }}
          >
            {pendingCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 39 }}
          />
          <div
            className="glass-card"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              minWidth: 220,
              padding: "0.4rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.15rem",
              zIndex: 40,
              borderRadius: 14,
            }}
          >
            <MoreMenuItem
              label={pendingCount > 0 ? `People (${pendingCount} waiting)` : "People"}
              active={panel === "people"}
              onClick={() => pick("people")}
            />
            <MoreMenuItem label="Polls" active={panel === "polls"} onClick={() => pick("polls")} />
            <MoreMenuItem label="Whiteboard" active={panel === "whiteboard"} onClick={() => pick("whiteboard")} />
            {!parent && (
              <MoreMenuItem label="Breakout rooms" active={panel === "breakout"} onClick={() => pick("breakout")} />
            )}
            <MoreMenuItem label="Background" active={panel === "effects"} onClick={() => pick("effects")} />
            {isHost && !parent && (
              <MoreMenuItem
                label={locked ? "Turn off waiting room" : "Turn on waiting room"}
                onClick={() => {
                  onToggleLock();
                  setOpen(false);
                }}
              />
            )}
            {role === "host" && !parent && (
              <MoreMenuItem
                label="Invite co-host"
                onClick={() => {
                  onInviteCohost();
                  setOpen(false);
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RoomHeader({
  roomName,
  isHost,
  role,
  locked,
  encrypted,
  panel,
  pendingCount,
  onTogglePanel,
  onToggleLock,
  onInviteCohost,
  onReturnToMain,
}: {
  roomName: string;
  isHost: boolean;
  role: "host" | "cohost" | null;
  locked: boolean;
  encrypted: boolean;
  panel: Panel;
  pendingCount: number;
  onTogglePanel: (p: Exclude<Panel, null>) => void;
  onToggleLock: () => void;
  onReturnToMain: () => void;
  onInviteCohost: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const parent = parentRoomOf(roomName);

  const copyLink = useCallback(() => {
    const url = `${window.location.origin}/room/${encodeURIComponent(roomName)}${window.location.hash}`;

    navigator.clipboard.writeText(url).catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        // clipboard unavailable; the link is still visible in the address bar / room header
      }
      document.body.removeChild(textarea);
    });

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [roomName]);

  return (
    <header
      className="glass-card"
      style={{
        position: "relative",
        zIndex: 50,
        margin: "0.75rem",
        marginBottom: 0,
        padding: "0.75rem 1.1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        borderRadius: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: "0.9rem", color: "var(--text-1)", flexShrink: 0 }}>
          {parent ? "Breakout of" : "Room"}
        </span>
        <span
          style={{
            fontSize: "0.95rem",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {parent ?? roomName}
        </span>
        {encrypted && (
          <span style={{ fontSize: "0.7rem", color: "var(--accent-2)", flexShrink: 0 }} title="End-to-end encrypted">
            🔒 Encrypted
          </span>
        )}
        {locked && (
          <span style={{ fontSize: "0.7rem", color: "var(--text-2)", flexShrink: 0 }}>Waiting room on</span>
        )}
        {role === "cohost" && (
          <span style={{ fontSize: "0.7rem", color: "var(--text-2)", flexShrink: 0 }}>Co-host</span>
        )}
      </div>
      <div className="marvie-header-actions" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {parent && (
          <button className="btn-primary" onClick={onReturnToMain} type="button" style={{ padding: "0.6rem 0.95rem" }}>
            Return to main room
          </button>
        )}
        <MoreMenu
          isHost={isHost}
          role={role}
          parent={parent}
          locked={locked}
          panel={panel}
          pendingCount={pendingCount}
          onTogglePanel={onTogglePanel}
          onToggleLock={onToggleLock}
          onInviteCohost={onInviteCohost}
        />
        <button
          className="btn-ghost"
          type="button"
          onClick={() => onTogglePanel("chat")}
          style={panel === "chat" ? { background: "rgba(255,255,255,0.18)" } : undefined}
        >
          Chat
        </button>
        <button className="btn-ghost" onClick={copyLink} type="button">
          {copied ? "Copied" : "Copy invite link"}
        </button>
      </div>
    </header>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div className="glass-card" style={{ padding: "2rem", color: "var(--text-1)" }}>
        {children}
      </div>
    </main>
  );
}

function JoinNamePrompt({ roomName }: { roomName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");

  useEffect(() => {
    const saved = getSavedName();
    if (saved) setName(saved);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    saveName(trimmed);
    const cohost = searchParams.get("cohost");
    const cohostParam = cohost ? `&cohost=${encodeURIComponent(cohost)}` : "";
    router.replace(
      `/room/${encodeURIComponent(roomName)}?name=${encodeURIComponent(trimmed)}${cohostParam}${window.location.hash}`
    );
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
          maxWidth: 360,
          padding: "2.5rem 2rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.5rem",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Join room</h1>
          <p style={{ color: "var(--text-1)", fontSize: "0.85rem", textAlign: "center" }}>
            You&apos;ve been invited to <strong>{roomName}</strong>. Enter your name to join.
          </p>
        </div>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem", width: "100%" }}>
          <input
            className="glass-input"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <button type="submit" className="btn-primary" style={{ width: "100%" }}>
            Join call
          </button>
        </form>
      </div>
    </main>
  );
}

export default function RoomPage({
  params,
}: {
  params: Promise<{ roomName: string }>;
}) {
  const { roomName } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const name = searchParams.get("name") ?? "";

  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [role, setRole] = useState<"host" | "cohost" | null>(null);
  const [hostSecret, setHostSecret] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [keyReady, setKeyReady] = useState(false);
  const [mirrored, setMirrored] = useState(false);
  const [overlayControlsVisible, setOverlayControlsVisible] = useState(true);
  const overlayHideTimerRef = useRef<number | null>(null);

  const revealOverlayControls = useCallback(() => {
    setOverlayControlsVisible(true);
    if (overlayHideTimerRef.current) window.clearTimeout(overlayHideTimerRef.current);
    overlayHideTimerRef.current = window.setTimeout(() => setOverlayControlsVisible(false), 2800);
  }, []);

  useEffect(() => {
    revealOverlayControls();
    return () => {
      if (overlayHideTimerRef.current) window.clearTimeout(overlayHideTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [cohostLink, setCohostLink] = useState<string | null>(null);

  const pendingRequests = usePendingJoinRequests(roomName, isHost);

  const identityRef = useRef<string | null>(null);
  if (!identityRef.current && name) {
    identityRef.current = `${name}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // On mobile, the natural instinct when a panel (chat/people/etc.) is open
  // is to hit the phone's back button — without this, that navigates the
  // browser away from the room entirely and disconnects the call. We push a
  // history entry when a panel opens, so back just closes the panel.
  const panelHistoryPushedRef = useRef(false);

  useEffect(() => {
    function onPopState() {
      if (panelHistoryPushedRef.current) {
        panelHistoryPushedRef.current = false;
        setPanel(null);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const togglePanel = useCallback((p: Exclude<Panel, null>) => {
    setPanel((cur) => {
      if (cur === p) {
        if (panelHistoryPushedRef.current) {
          panelHistoryPushedRef.current = false;
          window.history.back();
        }
        return null;
      }
      if (cur === null) {
        window.history.pushState({ marviePanel: true }, "", window.location.href);
        panelHistoryPushedRef.current = true;
      }
      return p;
    });
  }, []);

  const e2eeSupported = useMemo(() => typeof window !== "undefined" && isE2EESupported(), []);

  const keyProvider = useMemo(() => (e2eeSupported ? new ExternalE2EEKeyProvider() : null), [e2eeSupported]);
  const worker = useMemo(() => (e2eeSupported ? new Worker("/e2ee-worker.js") : null), [e2eeSupported]);

  // Set up the shared E2EE passphrase from the URL fragment (never sent to the server).
  useEffect(() => {
    if (!e2eeSupported || !keyProvider) {
      setKeyReady(true);
      return;
    }
    let passphrase = window.location.hash.startsWith("#key=")
      ? decodeURIComponent(window.location.hash.slice(5))
      : "";
    if (!passphrase) {
      passphrase = crypto.randomUUID();
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#key=${encodeURIComponent(passphrase)}`);
    }
    keyProvider.setKey(passphrase).then(() => setKeyReady(true));
  }, [e2eeSupported, keyProvider]);

  const requestSeqRef = useRef(0);

  const requestToken = useCallback(() => {
    if (!name || !identityRef.current) return;
    const identity = identityRef.current;
    const storageKey = hostSecretStorageKey(roomName);
    const cohostFromLink = new URLSearchParams(window.location.search).get("cohost");
    if (cohostFromLink && !window.localStorage.getItem(storageKey)) {
      window.localStorage.setItem(storageKey, cohostFromLink);
    }
    const storedHostSecret = window.localStorage.getItem(storageKey);
    const url = new URL("/api/token", window.location.origin);
    url.searchParams.set("room", roomName);
    url.searchParams.set("identity", identity);
    url.searchParams.set("name", name);
    if (storedHostSecret) url.searchParams.set("hostSecret", storedHostSecret);

    const seq = ++requestSeqRef.current;

    fetch(url.toString())
      .then(async (res) => {
        const data = await res.json();
        // A newer request has already been kicked off (e.g. the waiting-room
        // retry); ignore this stale response so it can't clobber fresher state.
        if (seq !== requestSeqRef.current) return;
        if (!res.ok) {
          setError(data.error ?? "Failed to join room");
          return;
        }
        if (data.waiting) {
          setWaiting(true);
          return;
        }
        setWaiting(false);
        setToken(data.token);
        setIsHost(!!data.isHost);
        setRole(data.role ?? null);
        setLocked(!!data.locked);
        if (data.hostSecret) {
          setHostSecret(data.hostSecret);
          window.localStorage.setItem(storageKey, data.hostSecret);
        }
      })
      .catch((err) => setError(String(err)));
    // Intentionally excludes `searchParams`: Next.js can hand back a new
    // searchParams reference on incidental history changes (e.g. our own
    // history.replaceState for the E2EE key), which would recreate this
    // callback and re-trigger the mount effect below, firing a second
    // /api/token request. That second request could race the first one's
    // localStorage write and come back without hostSecret, downgrading a
    // real host back to a guest. Reading window.location.search directly
    // (above) keeps this callback's identity tied only to roomName/name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, name]);

  useEffect(() => {
    requestToken();
  }, [requestToken]);

  // While waiting, listen for the host admitting/denying us and retry automatically.
  useEffect(() => {
    if (!waiting || !identityRef.current) return;
    const supabase = createSupabaseClient();
    const channel = supabase
      .channel(`join_requests:self:${roomName}:${identityRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "join_requests",
          filter: `identity=eq.${identityRef.current}`,
        },
        () => {
          requestToken();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [waiting, roomName, requestToken]);

  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  const toggleLock = useCallback(async () => {
    if (!hostSecret) return;
    const next = !locked;
    setLocked(next);
    await fetch("/api/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: roomName, hostSecret, action: next ? "lock" : "unlock" }),
    });
  }, [hostSecret, locked, roomName]);

  const inviteCohost = useCallback(async () => {
    if (!hostSecret) return;
    const res = await fetch("/api/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: roomName, hostSecret, action: "addCohost" }),
    });
    const data = await res.json();
    if (data.cohostSecret) {
      const url = `${window.location.origin}/room/${encodeURIComponent(roomName)}?cohost=${encodeURIComponent(data.cohostSecret)}${window.location.hash}`;
      setCohostLink(url);
      navigator.clipboard.writeText(url).catch(() => {});
    }
  }, [hostSecret, roomName]);

  const returnToMain = useCallback(() => {
    const parent = parentRoomOf(roomName);
    if (!parent) return;
    router.push(`/room/${encodeURIComponent(parent)}?name=${encodeURIComponent(name)}${window.location.hash}`);
  }, [roomName, name, router]);

  if (!name) {
    return <JoinNamePrompt roomName={roomName} />;
  }

  if (error) {
    return (
      <CenteredMessage>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center", textAlign: "center" }}>
          <span>{error}</span>
          <button className="btn-primary" type="button" onClick={() => router.push("/")}>
            Go home
          </button>
        </div>
      </CenteredMessage>
    );
  }

  if (waiting) {
    return <CenteredMessage>Waiting for the host to let you in…</CenteredMessage>;
  }

  if (!token || !serverUrl || !keyReady) {
    return <CenteredMessage>Connecting…</CenteredMessage>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <RoomHeader
        roomName={roomName}
        isHost={isHost}
        role={role}
        locked={locked}
        encrypted={e2eeSupported}
        panel={panel}
        pendingCount={pendingRequests.length}
        onTogglePanel={togglePanel}
        onToggleLock={toggleLock}
        onInviteCohost={inviteCohost}
        onReturnToMain={returnToMain}
      />
      {cohostLink && (
        <div
          className="glass-card"
          style={{ margin: "0 0.75rem", padding: "0.6rem 1rem", fontSize: "0.8rem", display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Co-host link copied: {cohostLink}
          </span>
          <button className="btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.72rem" }} onClick={() => setCohostLink(null)}>
            Dismiss
          </button>
        </div>
      )}
      <LiveKitRoom
        video
        audio
        token={token}
        serverUrl={serverUrl}
        data-lk-theme="default"
        options={e2eeSupported && keyProvider && worker ? { e2ee: { keyProvider, worker } } : {}}
        className={mirrored ? undefined : "marvie-no-mirror"}
        style={{ flex: 1, minHeight: 0, background: "transparent", display: "flex", overflow: "hidden", position: "relative" }}
        onDisconnected={() => router.push("/")}
      >
        <BreakoutListener roomName={roomName} name={name} />
        <RoomHeartbeat roomName={roomName} />
        <div
          style={{ flex: 1, minWidth: 0, position: "relative" }}
          onClickCapture={revealOverlayControls}
          onMouseMoveCapture={revealOverlayControls}
          onTouchStartCapture={revealOverlayControls}
        >
          <VideoConference />
          <Reactions senderName={name} raisedHands={raisedHands} setRaisedHands={setRaisedHands} />
          <div className="marvie-extra-controls" style={HEADER_OVERLAY_STYLE}>
            <AutoHideControls visible={overlayControlsVisible}>
              <ExtraControls mirrored={mirrored} onToggleMirror={() => setMirrored((m) => !m)} />
            </AutoHideControls>
          </div>
          <JoinRequestToast requests={pendingRequests} roomName={roomName} hostSecret={hostSecret} />
        </div>
        {panel === "chat" && <RoomChat roomName={roomName} senderName={name} />}
        {panel === "people" && (
          <ModerationPanel
            roomName={roomName}
            isHost={isHost}
            hostSecret={hostSecret}
            raisedHands={raisedHands}
            requests={pendingRequests}
          />
        )}
        {panel === "polls" && (
          <Polls roomName={parentRoomOf(roomName) ?? roomName} identity={identityRef.current ?? name} isHost={isHost} hostSecret={hostSecret} />
        )}
        {panel === "whiteboard" && <Whiteboard roomName={parentRoomOf(roomName) ?? roomName} />}
        {panel === "breakout" && <BreakoutRooms roomName={roomName} isHost={isHost} displayName={name} />}
        {panel === "effects" && <EffectsPanel />}
      </LiveKitRoom>
    </div>
  );
}

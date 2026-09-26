"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDataChannel, useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import type { RemoteParticipant, RemoteTrackPublication } from "livekit-client";
import { isNativeAndroid, startNativeScreenShare, stopNativeScreenShare } from "@/lib/nativeScreenShare";
import ReactionBurst, { type FloatingEmoji } from "@/components/ReactionBurst";

type ReactionPayload =
  | { type: "emoji"; emoji: string; from: string }
  | { type: "hand"; raised: boolean; from: string; identity: string };

const EMOJIS = ["👍", "❤️", "😂", "🎉", "👏"];

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/** Finds (or creates once) a container appended into LiveKit's own
 * `.lk-control-bar`, inserted right before the leave button so our buttons
 * land in the same visual row as mic/camera/chat instead of a separate
 * floating pill — this is the "one Google-Meet-style bar" instead of extra
 * controls stacked on top of the video. `.lk-control-bar` is rendered by
 * LiveKit's own components after this component mounts, and stays mounted
 * for the lifetime of the call, so a MutationObserver is needed to catch it
 * appearing (and to survive LiveKit re-rendering the bar internally). */
function useControlBarPortalNode(): HTMLDivElement | null {
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let container: HTMLDivElement | null = null;
    let parent: HTMLElement | null = null;

    // Re-verifies (and fixes) position on every mutation rather than
    // attaching once — LiveKit's mic/camera/screenshare buttons only exist
    // once permissions resolve, appearing after the bar itself and after
    // the leave button. Each of those insertions targets only LiveKit's own
    // React-tracked elements as its reference point, never our foreign
    // node, so a one-time "insert before leave" left our container stranded
    // at the very front once those later buttons got inserted between it
    // and the leave button. Idempotent re-positioning converges correctly
    // regardless of how many times or in what order LiveKit's own buttons
    // mount.
    function positionContainer() {
      const bar = document.querySelector(".lk-control-bar") as HTMLElement | null;
      if (!bar) return;

      if (!container) {
        container = document.createElement("div");
        container.style.display = "contents";
      }

      const leaveButton = bar.querySelector(".lk-disconnect-button");
      if (leaveButton) {
        if (container.nextSibling !== leaveButton || container.parentElement !== bar) {
          bar.insertBefore(container, leaveButton);
        }
      } else if (container.parentElement !== bar) {
        bar.appendChild(container);
      }

      parent = bar;
      setNode((current) => (current === container ? current : container));
    }

    positionContainer();
    const observer = new MutationObserver(positionContainer);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (container && parent && container.parentElement === parent) {
        parent.removeChild(container);
      }
    };
  }, []);

  return node;
}

export default function MergedControlBar({
  senderName,
  raisedHands,
  setRaisedHands,
  mirrored,
  onToggleMirror,
}: {
  senderName: string;
  raisedHands: Set<string>;
  setRaisedHands: React.Dispatch<React.SetStateAction<Set<string>>>;
  mirrored: boolean;
  onToggleMirror: () => void;
}) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const portalNode = useControlBarPortalNode();

  // One shared "which popover is open" state instead of independent booleans
  // per button: opening one now closes any other automatically, and a
  // single full-screen backdrop closes whichever is open on outside click
  // instead of requiring the same trigger button to be pressed again.
  const [openPopover, setOpenPopover] = useState<"screenShare" | "reactions" | "more" | null>(null);
  const togglePopover = (name: "screenShare" | "reactions" | "more") =>
    setOpenPopover((cur) => (cur === name ? null : name));

  // --- Reactions (emoji burst + raise hand) ---
  const [floating, setFloating] = useState<FloatingEmoji[]>([]);
  const [handRaised, setHandRaised] = useState(false);
  const nextId = useRef(0);

  const { send } = useDataChannel("reactions", (msg) => {
    try {
      const text = new TextDecoder().decode(msg.payload);
      const payload = JSON.parse(text) as ReactionPayload;
      if (payload.type === "emoji") {
        const id = nextId.current++;
        setFloating((prev) => [...prev, { id, emoji: payload.emoji }]);
        window.setTimeout(() => {
          setFloating((prev) => prev.filter((f) => f.id !== id));
        }, 2200);
      } else if (payload.type === "hand") {
        setRaisedHands((prev) => {
          const next = new Set(prev);
          if (payload.raised) next.add(payload.identity);
          else next.delete(payload.identity);
          return next;
        });
      }
    } catch {
      // ignore malformed reaction payloads
    }
  });

  const sendEmoji = useCallback(
    (emoji: string) => {
      const id = nextId.current++;
      setFloating((prev) => [...prev, { id, emoji }]);
      window.setTimeout(() => {
        setFloating((prev) => prev.filter((f) => f.id !== id));
      }, 2200);
      const payload: ReactionPayload = { type: "emoji", emoji, from: senderName };
      send(new TextEncoder().encode(JSON.stringify(payload)), { reliable: true });
      // Deliberately doesn't close the tray — sending one reaction shouldn't
      // force you to reopen it to send another. The outside-click backdrop
      // still closes it once you're done.
    },
    [send, senderName]
  );

  const toggleHand = useCallback(() => {
    const next = !handRaised;
    setHandRaised(next);
    const identity = localParticipant?.identity ?? senderName;
    setRaisedHands((prev) => {
      const s = new Set(prev);
      if (next) s.add(identity);
      else s.delete(identity);
      return s;
    });
    const payload: ReactionPayload = { type: "hand", raised: next, from: senderName, identity };
    send(new TextEncoder().encode(JSON.stringify(payload)), { reliable: true });
  }, [handRaised, localParticipant, send, senderName, setRaisedHands]);

  useEffect(() => {
    return () => {
      if (handRaised) {
        const identity = localParticipant?.identity ?? senderName;
        const payload: ReactionPayload = { type: "hand", raised: false, from: senderName, identity };
        send(new TextEncoder().encode(JSON.stringify(payload)), { reliable: true }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Screen share (browser fallback notice + native Android bridge) ---
  const canScreenShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const nativeAndroid = isNativeAndroid();
  const [nativeSharing, setNativeSharing] = useState(false);
  const [nativeShareBusy, setNativeShareBusy] = useState(false);

  const toggleNativeScreenShare = useCallback(async () => {
    if (nativeShareBusy) return;
    setNativeShareBusy(true);
    try {
      if (nativeSharing) {
        await stopNativeScreenShare();
        setNativeSharing(false);
      } else {
        await startNativeScreenShare(room.name, localParticipant.identity);
        setNativeSharing(true);
      }
    } catch {
      setNativeSharing(false);
    } finally {
      setNativeShareBusy(false);
    }
  }, [nativeSharing, nativeShareBusy, room.name, localParticipant.identity]);

  // Only one screen share at a time in a room, like Google Meet — if anyone
  // else starts sharing while this browser is, stop this one. The native
  // Android plugin enforces the same rule independently on its own LiveKit
  // connection (see ScreenSharePlugin.kt), since that's a second, separate
  // participant this page's `room` doesn't control.
  useEffect(() => {
    function stopIfSomeoneElseIsNowSharing(publication: RemoteTrackPublication, participant: RemoteParticipant) {
      if (
        publication.source === Track.Source.ScreenShare &&
        participant.identity !== localParticipant.identity &&
        localParticipant.isScreenShareEnabled
      ) {
        localParticipant.setScreenShareEnabled(false);
      }
    }
    room.on(RoomEvent.TrackPublished, stopIfSomeoneElseIsNowSharing);
    return () => {
      room.off(RoomEvent.TrackPublished, stopIfSomeoneElseIsNowSharing);
    };
  }, [room, localParticipant]);

  // --- PiP / local tab recording / fullscreen ---
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const togglePip = useCallback(async () => {
    const videos = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
    const remote = videos.find((v) => !v.closest("[data-lk-local-participant]") && v.readyState >= 2);
    const target = remote ?? videos.find((v) => v.readyState >= 2);
    if (!target) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await target.requestPictureInPicture();
      }
    } catch {
      // PiP unsupported or blocked; silently ignore
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        // @ts-expect-error non-standard but supported in Chromium
        preferCurrentTab: true,
      });

      // Tab-audio capture alone only picks up what plays back through this
      // page — everyone else's voice (their <audio>/<video> elements), but
      // NOT the local microphone, since your own mic is never looped back
      // into the page's own audio output (that would cause echo). Mixing in
      // a direct mic capture is the only way to get "both mine and other
      // speakers" into one recording.
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // Mic unavailable/denied — fall back to tab-audio-only rather than
        // failing the whole recording.
      }

      let mixedAudioTrack: MediaStreamTrack | null = null;
      let audioContext: AudioContext | null = null;
      if (micStream && displayStream.getAudioTracks().length > 0) {
        audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        audioContext.createMediaStreamSource(displayStream).connect(destination);
        audioContext.createMediaStreamSource(micStream).connect(destination);
        mixedAudioTrack = destination.stream.getAudioTracks()[0];
      } else if (micStream) {
        mixedAudioTrack = micStream.getAudioTracks()[0];
      }

      const recordedStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...(mixedAudioTrack ? [mixedAudioTrack] : displayStream.getAudioTracks()),
      ]);

      chunksRef.current = [];
      const recorder = new MediaRecorder(recordedStream, { mimeType: "video/webm" });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      const cleanup = () => {
        displayStream.getTracks().forEach((t) => t.stop());
        micStream?.getTracks().forEach((t) => t.stop());
        audioContext?.close().catch(() => {});
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `marvie-call-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        cleanup();
        setRecording(false);
      };
      displayStream.getVideoTracks()[0].addEventListener("ended", () => recorder.stop());
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      // user cancelled the share picker; not an error worth surfacing
    }
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  // Auto-hide the control bar in full screen after a few seconds of no
  // mouse/touch/keyboard activity, like Google Meet/YouTube — otherwise it
  // permanently occupies part of the "true 100% full screen" the header/
  // carousel hiding above was meant to achieve. Any activity brings it back
  // immediately; it's also forced visible whenever a popover from this bar
  // is open, so you're never fighting the timer mid-interaction.
  const [controlsHidden, setControlsHidden] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isFullscreen) {
      setControlsHidden(false);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      return;
    }
    function scheduleHide() {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setControlsHidden(true), 3000);
    }
    function showControls() {
      setControlsHidden(false);
      scheduleHide();
    }
    showControls();
    window.addEventListener("mousemove", showControls);
    window.addEventListener("touchstart", showControls);
    window.addEventListener("keydown", showControls);
    return () => {
      window.removeEventListener("mousemove", showControls);
      window.removeEventListener("touchstart", showControls);
      window.removeEventListener("keydown", showControls);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [isFullscreen]);

  useEffect(() => {
    document.body.classList.toggle(
      "marvie-controls-hidden",
      isFullscreen && controlsHidden && !openPopover
    );
    return () => {
      document.body.classList.remove("marvie-controls-hidden");
    };
  }, [isFullscreen, controlsHidden, openPopover]);

  useEffect(() => {
    function onFullscreenChange() {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      // Browser fullscreen alone still leaves the header and other-
      // participants strip on screen (just without browser chrome) — this
      // hides them too via CSS, for an actual edge-to-edge single-video
      // view. Toggling a body class (rather than threading state through
      // page.tsx) keeps this self-contained; it's undone automatically
      // whenever fullscreen ends, by any of the usual routes (Esc, the F
      // key, or "Exit full screen" in this same bar's More menu, which
      // stays visible throughout since it isn't part of what gets hidden).
      document.body.classList.toggle("marvie-focus-mode", active);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.body.classList.remove("marvie-focus-mode");
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "m" || e.key === "M") {
        localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      } else if (e.key === "v" || e.key === "V") {
        localParticipant.setCameraEnabled(!isCameraEnabled);
      } else if (e.key === "s" || e.key === "S") {
        localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
      } else if (e.key === "p" || e.key === "P") {
        togglePip();
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      } else if (e.key === "l" || e.key === "L") {
        room.disconnect();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled, togglePip, toggleFullscreen, room]);

  const iconButtonStyle: React.CSSProperties = { fontSize: "1.15rem", lineHeight: 1 };

  const bar = (
    <>
      {nativeAndroid ? (
        <button
          className="lk-button"
          type="button"
          onClick={toggleNativeScreenShare}
          disabled={nativeShareBusy}
          title="Share your screen"
          data-lk-enabled={nativeSharing}
        >
          <span style={iconButtonStyle}>🖥️</span>
        </button>
      ) : !canScreenShare ? (
        <div style={{ position: "relative" }}>
          <button
            className="lk-button"
            type="button"
            onClick={() => togglePopover("screenShare")}
            title="Screen share unavailable on this browser"
          >
            <span style={iconButtonStyle}>🖥️</span>
          </button>
          {openPopover === "screenShare" && (
            <div
              className="glass-card"
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: "50%",
                transform: "translateX(-50%)",
                width: "min(84vw, 260px)",
                padding: "0.75rem 0.9rem",
                borderRadius: 12,
                fontSize: "0.8rem",
                lineHeight: 1.4,
                zIndex: 60,
              }}
            >
              Screen sharing isn&apos;t supported by this browser. Try Chrome, Edge, or Firefox on a
              desktop/laptop to share your screen.
              <button
                className="btn-ghost"
                type="button"
                onClick={() => setOpenPopover(null)}
                style={{ display: "block", marginTop: "0.5rem", padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
              >
                Got it
              </button>
            </div>
          )}
        </div>
      ) : null}

      <div style={{ position: "relative" }}>
        <button
          className="lk-button"
          type="button"
          onClick={() => togglePopover("reactions")}
          title="Send a reaction"
        >
          <span style={iconButtonStyle}>😊</span>
        </button>
        {openPopover === "reactions" && (
          <div
            className="glass-card"
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: "0.3rem",
              padding: "0.4rem",
              borderRadius: 999,
              zIndex: 60,
              whiteSpace: "nowrap",
            }}
          >
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendEmoji(emoji)}
                type="button"
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.3rem",
                  cursor: "pointer",
                  padding: "0.2rem 0.35rem",
                  borderRadius: 8,
                  lineHeight: 1,
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        className="lk-button"
        type="button"
        onClick={toggleHand}
        title="Raise hand"
        data-lk-enabled={handRaised}
      >
        <span style={iconButtonStyle}>✋</span>
      </button>

      <div style={{ position: "relative" }}>
        <button className="lk-button" type="button" onClick={() => togglePopover("more")} title="More options">
          <span style={iconButtonStyle}>⋮</span>
        </button>
        {openPopover === "more" && (
          <div
              className="glass-card"
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                right: 0,
                minWidth: 200,
                padding: "0.4rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.15rem",
                zIndex: 60,
                borderRadius: 14,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  toggleFullscreen();
                  setOpenPopover(null);
                }}
                className="marvie-more-menu-item"
              >
                {isFullscreen ? "Exit full screen" : "Full screen"} <span style={{ opacity: 0.6 }}>(F)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  togglePip();
                  setOpenPopover(null);
                }}
                className="marvie-more-menu-item"
              >
                Picture-in-picture <span style={{ opacity: 0.6 }}>(P)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleMirror();
                  setOpenPopover(null);
                }}
                className="marvie-more-menu-item"
              >
                {mirrored ? "Turn off mirroring" : "Mirror my preview"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (recording) stopRecording();
                  else startRecording();
                  setOpenPopover(null);
                }}
                className="marvie-more-menu-item"
              >
                {recording ? "Stop recording" : "Record this tab"}
              </button>
            </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {portalNode ? createPortal(bar, portalNode) : null}
      {/* Rendered here rather than inside the portaled `bar` — .lk-control-bar
          has backdrop-filter applied, which creates a new CSS containing
          block for fixed-position descendants, so a backdrop nested inside
          it would only cover the control bar's own bounding box instead of
          the true viewport. Living outside the portal keeps it relative to
          the real viewport, so clicking anywhere on screen closes whichever
          popover is open. */}
      {openPopover && (
        <div onClick={() => setOpenPopover(null)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
      )}
      <ReactionBurst floating={floating} />
    </>
  );
}

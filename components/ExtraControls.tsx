"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import type { RemoteParticipant, RemoteTrackPublication } from "livekit-client";
import { isNativeAndroid, startNativeScreenShare, stopNativeScreenShare } from "@/lib/nativeScreenShare";

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export default function ExtraControls({
  mirrored,
  onToggleMirror,
}: {
  mirrored: boolean;
  onToggleMirror: () => void;
}) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Most mobile browsers (Android Chrome, iOS Safari) don't implement the
  // Screen Capture API at all, so LiveKit's own control bar silently omits
  // the button there. On Android inside the native Marvie app, a plugin
  // bridges in real screen share via LiveKit's Android SDK instead (see
  // ScreenSharePlugin.kt) — everywhere else, surface an explanation rather
  // than letting the feature just look missing.
  const canScreenShare =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const [screenShareNotice, setScreenShareNotice] = useState(false);
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
      // Most likely the user declined the screen-capture consent dialog;
      // not worth surfacing as a hard error.
      setNativeSharing(false);
    } finally {
      setNativeShareBusy(false);
    }
  }, [nativeSharing, nativeShareBusy, room.name, localParticipant.identity]);

  // Only one screen share at a time in a room, like Google Meet — if anyone
  // else starts sharing while this browser is, stop this one rather than
  // leaving two simultaneous shares. The native Android plugin enforces the
  // same rule independently on its own LiveKit connection (see
  // ScreenSharePlugin.kt), since that's a second, separate participant this
  // page's `room` doesn't control.
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
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        // @ts-expect-error non-standard but supported in Chromium
        preferCurrentTab: true,
      });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `marvie-call-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      stream.getVideoTracks()[0].addEventListener("ended", () => recorder.stop());
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
      } else if (e.key === "l" || e.key === "L") {
        room.disconnect();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled, togglePip, room]);

  return (
    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
      {nativeAndroid ? (
        <button
          className="btn-ghost"
          type="button"
          onClick={toggleNativeScreenShare}
          disabled={nativeShareBusy}
          title="Share your screen"
          style={nativeSharing ? { background: "rgba(124, 92, 255, 0.35)" } : undefined}
        >
          {nativeSharing ? "Stop sharing" : "Share screen"}
        </button>
      ) : !canScreenShare ? (
        <div style={{ position: "relative" }}>
          <button
            className="btn-ghost"
            type="button"
            onClick={() => setScreenShareNotice((v) => !v)}
            title="Screen share unavailable on this browser"
          >
            Screen share
          </button>
          {screenShareNotice && (
            <div
              className="glass-card"
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
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
                onClick={() => setScreenShareNotice(false)}
                style={{ display: "block", marginTop: "0.5rem", padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
              >
                Got it
              </button>
            </div>
          )}
        </div>
      ) : null}
      <button className="btn-ghost" type="button" onClick={togglePip} title="Picture-in-picture (P)">
        PiP
      </button>
      <button
        className="btn-ghost"
        type="button"
        onClick={onToggleMirror}
        title="Mirror my camera preview"
        style={mirrored ? undefined : { background: "rgba(255,255,255,0.18)" }}
      >
        {mirrored ? "Mirrored" : "Not mirrored"}
      </button>
      <button
        className="btn-ghost"
        type="button"
        onClick={recording ? stopRecording : startRecording}
        title="Record this tab locally"
        style={recording ? { background: "rgba(239,68,68,0.35)" } : undefined}
      >
        {recording ? "Stop recording" : "Record"}
      </button>
    </div>
  );
}

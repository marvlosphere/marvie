"use client";

/** Presentational fade wrapper for overlay controls (PiP/mirror/record)
 * that sit directly on top of the video. Visibility is driven by the
 * parent (via `visible`), which listens for interaction on the video area
 * itself — see RoomPage's onPointerDown/onPointerMove handlers. */
export default function AutoHideControls({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.35s ease",
      }}
    >
      {children}
    </div>
  );
}

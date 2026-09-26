"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import PanelCloseButton from "@/components/PanelCloseButton";

type StrokePoint = { x: number; y: number };
type StrokeEvent = { type: "start" | "draw" | "end"; point?: StrokePoint; color: string; strokeId: string };
type ClearEvent = { type: "clear" };

const COLORS = ["#f5f6fb", "#7c5cff", "#38bdf8", "#ef4444", "#22c55e", "#f59e0b"];

export default function Whiteboard({ roomName, onClose }: { roomName: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const drawing = useRef(false);
  const strokeId = useRef<string>("");
  const [color, setColor] = useState(COLORS[0]);
  const colorRef = useRef(color);
  colorRef.current = color;

  useEffect(() => {
    const supabase = createSupabaseClient();
    const channel = supabase.channel(`whiteboard:${roomName}`, { config: { broadcast: { self: false } } });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "stroke" }, ({ payload }) => {
        drawRemote(payload as StrokeEvent);
      })
      .on("broadcast", { event: "clear" }, () => {
        clearCanvas();
      })
      .subscribe();

    function resize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const ctx = canvas.getContext("2d");
      const imageData = ctx && canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      if (ctx && imageData) ctx.putImageData(imageData, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      supabase.removeChannel(channel);
    };
  }, [roomName]);

  function getCtx() {
    return canvasRef.current?.getContext("2d") ?? null;
  }

  function drawRemote(evt: StrokeEvent) {
    const ctx = getCtx();
    if (!ctx || !evt.point) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = evt.color;
    ctx.lineWidth = 3;
    if (evt.type === "start") {
      ctx.beginPath();
      ctx.moveTo(evt.point.x, evt.point.y);
    } else if (evt.type === "draw") {
      ctx.lineTo(evt.point.x, evt.point.y);
      ctx.stroke();
    }
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): StrokePoint {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    strokeId.current = Math.random().toString(36).slice(2);
    const point = pointFromEvent(e);
    const ctx = getCtx();
    if (ctx) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = colorRef.current;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    }
    channelRef.current?.send({
      type: "broadcast",
      event: "stroke",
      payload: { type: "start", point, color: colorRef.current, strokeId: strokeId.current },
    });
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const point = pointFromEvent(e);
    const ctx = getCtx();
    if (ctx) {
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    channelRef.current?.send({
      type: "broadcast",
      event: "stroke",
      payload: { type: "draw", point, color: colorRef.current, strokeId: strokeId.current },
    });
  }

  function onPointerUp() {
    drawing.current = false;
  }

  function handleClear() {
    clearCanvas();
    channelRef.current?.send({ type: "broadcast", event: "clear", payload: {} as ClearEvent });
  }

  return (
    <div
      className="glass-card marvie-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        ["--panel-width" as string]: "420px",
        margin: "0 0.75rem 0.75rem 0",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "0.6rem 1rem", borderBottom: "1px solid var(--glass-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Whiteboard</span>
        <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: c,
                border: color === c ? "2px solid white" : "1px solid rgba(255,255,255,0.3)",
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
          <button className="btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.72rem", marginLeft: "0.4rem" }} onClick={handleClear}>
            Clear
          </button>
          <PanelCloseButton onClose={onClose} />
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 320, background: "#0d1020" }}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{ width: "100%", height: "100%", touchAction: "none", cursor: "crosshair" }}
        />
      </div>
    </div>
  );
}

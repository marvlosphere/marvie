import { registerPlugin, Capacitor } from "@capacitor/core";

interface ScreenSharePluginInterface {
  start(options: { serverUrl: string; token: string }): Promise<{ started: boolean }>;
  stop(): Promise<void>;
}

const ScreenShare = registerPlugin<ScreenSharePluginInterface>("ScreenShare");

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

// The native plugin joins the room as a second, screen-share-only
// participant (see ScreenSharePlugin.kt) rather than publishing through the
// WebView's own LiveKit connection, so it needs its own token/identity.
export async function startNativeScreenShare(roomName: string, baseIdentity: string): Promise<void> {
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!serverUrl) throw new Error("LiveKit server URL is not configured");

  const identity = `${baseIdentity}-screen`;
  const url = new URL("/api/token", window.location.origin);
  url.searchParams.set("room", roomName);
  url.searchParams.set("identity", identity);
  url.searchParams.set("name", `${baseIdentity} (screen)`);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to get a screen-share token");

  await ScreenShare.start({ serverUrl, token: data.token });
}

export async function stopNativeScreenShare(): Promise<void> {
  await ScreenShare.stop();
}

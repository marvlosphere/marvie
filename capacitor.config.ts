import type { CapacitorConfig } from "@capacitor/cli";

// The native shell just loads the real, already-deployed web app in a
// WebView — Marvie's Next.js API routes need to stay server-side, so this
// intentionally does NOT use a static webDir export. Native plugins (like
// screen share) bridge in capabilities the mobile browser can't provide,
// without duplicating any of the actual app UI/logic natively.
const config: CapacitorConfig = {
  appId: "xyz.marvlosphere.marvie",
  appName: "Marvie",
  webDir: "public",
  server: {
    url: "https://marviecall.vercel.app",
    cleartext: false,
  },
};

export default config;

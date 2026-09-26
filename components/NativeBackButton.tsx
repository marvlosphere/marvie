"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

// Capacitor's default hardware back-button behavior on Android exits the
// whole app immediately rather than navigating within the SPA's own history
// — that's what made the phone's back button close Marvie entirely instead
// of, say, closing an open panel or leaving a call. Registering our own
// listener and delegating to the browser history stack (which Next.js's
// router and the room page's existing popstate-based panel-close logic
// already handle correctly) fixes this with no page-specific code needed:
// only exit the app once there's truly nothing left to go back to.
export default function NativeBackButton() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });

    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  return null;
}

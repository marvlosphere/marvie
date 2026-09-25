# Marvie

Text, audio, and video calls for small groups (~20 users).

Live at: https://marviecall.vercel.app

## Features

- Text, audio, video calls (LiveKit Cloud)
- End-to-end encrypted media (E2EE via a shared key in the invite link's URL fragment — never sent to the server; Chromium browsers only, see Limitations)
- Persistent, realtime room chat (Supabase Postgres + Realtime) 
- Installable as a mobile/desktop app (PWA — manifest + service worker)
- Waiting room: host can require approval to join; pending requests show live with Admit/Deny
- Host + co-host roles: host can mint a co-host invite link (`?cohost=...`) that grants the same moderation powers
- Moderation: mute one / mute all, remove, lock (waiting room), all enforced server-side
- Reactions (floating emoji) + raise hand, broadcast over LiveKit's data channel
- Picture-in-picture, mirrored self-view (toggleable), local (client-side) recording of the tab
- Keyboard shortcuts: `M` mic, `V` camera, `S` screen share, `P` picture-in-picture, `L` leave
- Polls with live results (Supabase-backed, one vote per participant)
- Realtime shared whiteboard (canvas, broadcast-only — not persisted after everyone leaves)
- Breakout rooms: host splits participants into N sub-rooms (host stays in the main room as control tower); "bring everyone back" recalls everyone, and anyone can self-serve "Return to main room" too
- Background blur / virtual backgrounds (`@livekit/track-processors`, runs on-device) — real photo backgrounds (living room, library, forest, beach) sourced from Wikimedia Commons, see `public/backgrounds/CREDITS.json` for attribution, plus two generated gradients
- Rooms auto-delete after 2 hours of inactivity (cascades to chat/polls/join-requests), so the database doesn't grow unbounded — see "Room cleanup" below
- Mobile-responsive: side panels (chat/people/polls/etc.) become a full-screen overlay instead of squeezing the video on small screens

## Structure

- `web/` — Next.js app. Deployed on Vercel.
  - `/api/token` — mints LiveKit join tokens; creates/looks up the room in Supabase, decides host/co-host status, gates on the waiting room
  - `/api/moderate` — host/co-host actions (mute, mute all, remove, lock/unlock, admit/deny, invite co-host), verified against `host_secret` / `cohost_secrets`
  - `components/RoomChat.tsx` — persisted + realtime chat via Supabase
  - `components/ModerationPanel.tsx` — participant list, mute/remove, pending join requests
  - `components/Reactions.tsx`, `ExtraControls.tsx` — reactions/raise-hand, PiP/mirror/recording/shortcuts
  - `components/Polls.tsx`, `Whiteboard.tsx`, `BreakoutRooms.tsx`, `BreakoutListener.tsx`
  - `components/BackgroundEffects.tsx` — camera track processor (background blur/replace)
  - `components/RoomHeartbeat.tsx` — pings `/api/heartbeat` every 20 min while connected, see "Room cleanup"
- `livekit-server/` — a local LiveKit SFU binary (Windows), kept around for offline/local testing only. Production uses LiveKit Cloud instead.
- `scripts/migrate.js` … `migrate5.js` — DB migrations, run in order against Supabase (rooms/messages → join_requests → cohost_secrets/polls → poll_votes update policy → last_active_at)
- `scripts/copy-e2ee-worker.js` — copies LiveKit's E2EE worker script into `public/` before every build/dev run (Next.js/Turbopack can't bundle it as a dynamic worker reliably, so it's shipped as a static asset instead)

## Running locally

```bash
cd web
npm run dev
```

`web/.env.local` points at the same LiveKit Cloud and Supabase projects used in production.

## Deploying

```bash
cd web
npx vercel --prod
```

After deploying, the `marviecall.vercel.app` alias needs to be re-pointed at the new deployment (it's a manual CLI alias, not a git-connected auto-following domain):

```bash
npx vercel alias set <new-deployment-url> marviecall.vercel.app
```

Requires `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` set as Vercel project environment variables (already configured).

## Room cleanup

Rooms delete themselves (cascading to chat/polls/join-requests) after 2 hours with no activity:

- `rooms.last_active_at` is bumped on every join attempt (`/api/token`) and every 20 minutes by anyone actively connected (`RoomHeartbeat` → `/api/heartbeat`), so a long call without new joiners doesn't go stale mid-call.
- Cleanup itself runs two ways: opportunistically on ~20% of `/api/token` requests (piggybacking on real traffic, no cron precision needed), and as a daily backup via Vercel Cron hitting `/api/cron/cleanup` (Hobby plan only allows daily cron, hence the two-layer approach — the opportunistic sweep is what actually keeps things tidy at 2-hour granularity).
- `/api/cron/cleanup` is protected by the `CRON_SECRET` env var, which Vercel automatically sends as a bearer token for cron-triggered requests.

## A hard-won lesson for future changes

Any component that calls a LiveKit hook (`useRoomContext`, `useLocalParticipant`, `useParticipants`, `useDataChannel`, etc.) **must** be rendered as a descendant of `<LiveKitRoom>`. Rendering one in `RoomHeader` (which sits above `<LiveKitRoom>` in the tree) caused a hard, silent crash in production with zero console output. If a new header/toolbar-ish feature needs LiveKit state, render it inside `<LiveKitRoom>` and position it with CSS instead.

## Limitations

- No accounts — anyone with the room link + a name can join. Host/co-host status is a bearer secret stored in the browser (`localStorage`), not tied to a real identity.
- E2EE only works in Chromium-based browsers (Chrome, Edge) — Firefox/Safari lack the required Insertable Streams / Encoded Transform APIs, so those users join without encryption automatically (no hard failure, just silently unencrypted for them).
- The whiteboard is ephemeral (broadcast-only) — nothing is saved once everyone leaves the room.
- Breakout rooms are plain Marvie rooms under the hood (`<room>--breakout-<n>`), so they get their own E2EE key by default unless the same URL fragment is carried over (the auto-navigation does this already).
- Free tier ceilings apply: LiveKit Cloud (bandwidth/minutes), Supabase (500MB DB, realtime connections), Vercel (serverless execution).

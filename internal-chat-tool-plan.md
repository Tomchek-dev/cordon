# Internal Chat Tool — Project Plan

A Discord/Teams-style internal communication tool: text channels, DMs, bot integrations
(reminders/notifications), automated daily reports, push-to-talk voice, and eventually
web/mobile/desktop clients. Starting scope: self-hosted on a local network (LAN),
built with Claude Code.

---

## 0. Environment Setup (fresh Pop!_OS install)

This is a brand new Pop!_OS install, so check for and install these before starting Phase 1.
Ask Claude Code to verify each with `--version` first — don't assume anything is present.

- **Node.js** (LTS) + npm — via `nvm` (you've used nvm before, install it fresh here)
- **Git** — usually preinstalled on Pop!_OS, verify with `git --version`
- **Docker** + **Docker Compose** — needed for Postgres/Redis/LiveKit containers
- **VS Code** — if not already installed, via the `.deb` or Pop!_Shop
- **PostgreSQL client tools** (`psql`) — optional, handy for debugging, DB itself runs in Docker
- **mkcert** — for local HTTPS certs (needed once we reach voice/PWA phases)
- **Rust + Cargo** — only needed later, for Phase 10 (Tauri desktop app)
- Recommended VS Code extensions: ESLint, Prettier, Docker, Prisma (if using Prisma as ORM),
  Tailwind CSS IntelliSense

Suggested first Claude Code prompt: *"Check which of these tools are installed and help me
install whatever's missing before we scaffold the project."*

---

## 1. Architecture Overview

- **Backend:** NestJS (REST + WebSocket gateway for real-time chat)
- **Frontend:** Next.js + Tailwind, socket.io client
- **Database:** PostgreSQL (users, channels, messages, bots) + Redis (presence, pub/sub)
- **Auth:** JWT-based, local accounts only (LAN-only, no need for external OAuth)
- **Bots:** Webhook/token-based bot API, Discord-style
- **Voice:** LiveKit (self-hosted SFU) for group push-to-talk channels; plain WebRTC P2P for DMs
- **Deployment:** Docker Compose (app + Postgres + Redis + LiveKit), always-on LAN machine
- **HTTPS:** mkcert-issued LAN cert + Caddy reverse proxy (required early — voice and push both depend on it)

### Core data model
- `users` (id, username, display_name, password_hash, avatar, status)
- `channels` (id, name, type: text/voice/dm, is_private)
- `channel_members` (channel_id, user_id, role)
- `messages` (id, channel_id, author_id or bot_id, content, created_at, edited_at)
- `bots` (id, name, token_hash, owner_id, webhook_url, permissions)
- `bot_events` (id, bot_id, type: reminder/notification/report, payload, scheduled_for, sent_at)
- `daily_reports` (id, date, channel_id, content, generated_at)

---

## 2. Phased Build Plan

### Phase 1 — Core chat (MVP)
- User accounts, login, JWT auth
- Public text channels only (no DMs yet)
- Real-time messaging via WebSocket gateway
- Basic Next.js UI: channel sidebar, message list, message input
- Set up HTTPS from day one (mkcert + Caddy) — avoids retrofitting auth/WebSocket URLs later
- Dockerize for LAN deployment

### Phase 2 — Users & presence
- Online/offline/away presence via Redis
- DMs (1:1 channels)
- User profiles, avatars
- Message editing/deletion, unread indicators

### Phase 3 — Bot framework
- Bot registration (bot token tied to a "bot user")
- Bot API: `POST /api/bots/:token/messages` to post into a channel
- Incoming webhook support / bot WebSocket connection for receiving events (new message, mention)
- Slash-command triggers (e.g. `/remind me in 10m to check the oven`) parsed server-side

### Phase 4 — Reminders & notifications
- Built-in Reminder Bot: scheduled jobs (`@nestjs/schedule` or BullMQ + Redis for reliability across restarts)
- In-app notification delivery via WebSocket push
- Per-user notification preferences (mute channel, DM-only, etc.)

### Phase 5 — Daily report generation
- Scheduled job (e.g. cron at 11:59 PM) that:
  - Pulls the day's message activity per channel (counts, top contributors, unresolved reminders)
  - Optionally summarizes via an LLM call (Anthropic API) for a readable digest
  - Posts the report into a `#daily-report` channel as a bot message, stores in `daily_reports`
- Report history page in the frontend

### Phase 6 — Polish
- Search across messages
- File/image attachments (local disk storage — no need for cloud storage on a LAN app)
- Role permissions (admin/mod)
- Mobile-friendly responsive UI (groundwork for Phase 8)

### Phase 7 — Voice (push-to-talk)
- Stand up LiveKit server (Docker container, joins the Compose stack)
- Voice-channel type alongside text channels; joining a voice channel = joining a LiveKit room
- PTT UI: hold-to-talk button, "who's talking" indicator, mic permission handling
- DM voice: P2P WebRTC, or route through a 2-person LiveKit room
- Optional: chime/notification when someone starts a PTT transmission in a channel you're in
- Decide: software PTT button only, or also a physical hardware button per workstation
  (ESP32/USB-HID client, given prior hardware work) — affects scope of this phase

### Phase 8 — PWA / Mobile (browser-based, no native app)
- `manifest.json` + service worker + icons, `display: standalone`
- Mobile-responsive layout pass on existing chat views
- Web Push integration for notifications/reminders (self-generated VAPID keys, no per-message cost)
- **Known limitation:** backgrounded/locked-screen audio is unreliable on mobile browsers
  (especially iOS Safari) — keep PTT sessions foreground-only for now, with fast automatic
  reconnect when the tab regains focus

### Phase 9 — Native mobile apps + multi-tenant packaging (product-pivot scope)
Only relevant if this becomes a sellable product rather than staying ERA-internal.
- React Native app (shares logic/types with the Next.js client) for iOS + Android
- "Bring your own server" model: app asks for a server address on first launch
  - Manual entry (hostname/domain) or QR-code enrollment (admin dashboard shows a QR
    with server URL + short-lived setup token)
  - Each company's server is fully separate — no shared backend, no cross-tenant data path
- Package the server side as a self-contained deployable (Docker Compose bundle + setup wizard)
  so a company's IT person can stand it up independently
- Central license-validation service — the *only* centrally-hosted piece, and it never sees
  chat data, just "is license XYZ active"
- `react-native-webrtc` for background-capable PTT voice (solves the Phase 8 background-audio limitation)
- Note: App Store / Play Store external-payment and licensing policy has been shifting —
  worth a fresh policy check before locking in a pricing mechanism, closer to launch

### Phase 10 — Desktop clients
- **Tauri** (preferred over Electron: native OS webview, ~3-10MB vs 100MB+, much lower RAM)
- Reuses the existing Next.js/React frontend as the webview content
- OS-native notifications (Windows Notification Center / macOS Notification Center / libnotify
  on Linux) — respects OS-level Do Not Disturb, not a browser permission prompt
- Native notification sounds via OS settings (no custom audio handling needed)
- System tray icon with unread badge; app can keep running when window is closed
- Background-capable PTT voice (same win as React Native — real background process)
- Auto-launch on system startup
- Same server-address onboarding as Phase 9, for the sellable-product path

**Cross-cutting architecture note:** keep WebSocket client, LiveKit client, and auth logic in a
shared TypeScript package separate from UI, so web (Next.js), mobile (React Native), and
desktop (Tauri) all import the same client library instead of duplicating logic three times.

---

## 3. Budget Notes (LAN-only, ~60 concurrent users)

| Item | Cost |
|---|---|
| LiveKit/mediasoup (voice SFU) | $0 — open source, self-hosted |
| Server hardware | $0 if repurposing existing spare hardware; a mid-range 4-8 core / 8-16GB RAM box is plenty |
| LAN bandwidth | $0 — internal network, no billing |
| TURN server | Usually unnecessary on a single LAN/subnet |
| mkcert + Caddy (HTTPS) | $0 |
| Web Push (VAPID) | $0 — self-generated keys, no per-message cost |
| Optional ESP32 PTT hardware buttons | ~$5-10/unit in parts |
| Ongoing cost | ~$0 as long as it stays LAN-only |

Audio-only PTT is cheap even at 60 users: usually only one person transmits at a time, Opus
audio is ~20-40kbps/stream, and there's no bandwidth cost on a LAN.

---

## 4. Suggested First Claude Code Session

1. Verify/install missing tools from Section 0.
2. Scaffold a monorepo: NestJS backend + Next.js frontend + Docker Compose (Postgres, Redis).
3. Set up mkcert + Caddy for local HTTPS.
4. Build one working text channel with live WebSocket messaging end-to-end.
5. Confirm it runs and is reachable from another device on the LAN before moving to Phase 2.

Everything past Phase 6 (voice, PWA, native apps, desktop clients) should be treated as
separate follow-on efforts once the core chat tool is solid — don't try to build all ten
phases in one continuous session.

# Cordon — Current State

Snapshot of what's actually built and running, as of 2026-08-04. Supersedes
`cordon-plan-v2.md` for anything the two disagree on — that file described a
different deployment topology (nginx + Caddy on a shared server) than what's
actually running now (Caddy directly on 80/443, dedicated LAN box). Kept
`cordon-plan-v2.md` around for its debugging-lessons section (still accurate)
and historical context; use this file as the base for planning new work.

---

## 1. Architecture

- **Backend:** NestJS (REST + Socket.IO gateway), `apps/backend`
- **Frontend:** Next.js (Turbopack) + Tailwind, socket.io-client, `apps/frontend`
- **Desktop:** Tauri shell around the web frontend, `apps/desktop` — cross-platform
  builds via `.github/workflows/desktop-build.yml`
- **Database:** PostgreSQL 16 (Prisma 7, driver adapters, `@prisma/adapter-pg`)
- **Cache/pubsub:** Redis 7 (presence, pub/sub for cross-instance events)
- **Auth:** JWT, local accounts, bcrypt password hashing; first registered user
  auto-becomes ADMIN
- **Reverse proxy:** Caddy only, bound directly to `0.0.0.0:80`/`443`, no nginx
  in front. TLS via a LAN root CA (`lan.pem`/`lan-key.pem`), served for client
  trust at `/rootCA.pem`. Matches `pop-os.local`, `pop-os`, `192.168.1.85`,
  `localhost`.
- **Voice:** LiveKit (self-hosted SFU), port 7880 (signaling) / 7881 (TCP
  fallback) / 50000–51000 UDP (RTC media), proxied at `/livekit/*`
- **AI:** Anthropic SDK (`@anthropic-ai/sdk`), model `claude-opus-5` — used by
  the daily report generator to summarize channel activity
- **File storage:** local disk (`apps/backend/uploads/`), AES-256-GCM
  encryption at rest for attachments, avatars, and generated labels
- **Deployment:** Docker Compose. `docker-compose.yml` for dev (bind-mounted
  Caddyfile, backend/frontend run natively via `npm run dev:backend`/`dev:frontend`
  outside Docker), `docker-compose.prod.yml` for production (everything
  containerized, env-driven secrets)

### Core data model (Prisma models)
`User`, `Channel`, `ChannelMember`, `Message`, `MessageReaction`, `Bot`,
`BotEvent`, `DailyReport`, `PushSubscription`, `AuditLog`, `CalendarEvent`,
`PickupRotation`, `Pickup`, `DockLog`

Enums: `ChannelType`, `ChannelRole`, `UserStatus`, `UserRole`, `BotEventType`,
`CalendarVisibility`, `DockDirection`, `DockUnitType`

---

## 2. Backend modules (`apps/backend/src/*`)

| Module | Routes / responsibility |
|---|---|
| `auth` | `POST /auth/register`, `POST /auth/login` — JWT issuance |
| `users` | `GET /users`, `GET /users/me`, avatar upload, role changes (`PATCH /users/:id/role`, ADMIN-gated), notification preferences |
| `channels` | `GET/POST /channels`, membership, DMs, LiveKit voice tokens, mute, attachments upload, read receipts, pinned messages |
| `chat` | Socket.IO gateway — all real-time events (see §3); slash-command (`/`) and bang-command (`!`) dispatch registries |
| `presence` | Redis-backed online/away/busy/offline status, pub/sub fan-out across instances |
| `bots` | Bot registration/token management (`/bots`), external webhook ingest (`POST /api/bots/:token/messages`) |
| `reminders` | Reminder Bot; `/remind me in <duration> to <task>` slash command; also backs the calendar scheduler |
| `reports` | Daily report generation (Claude-summarized channel activity, posted to `#daily-report`), `GET /reports`, `GET /reports/metrics?period=` (weekly/monthly/yearly per-user message-activity aggregation via `date_trunc`) |
| `calendar` | Personal (private) and general (team, channel-posted) calendar events; 30s-interval scheduler fires due reminders |
| `pickups` | Warehouse pickup rotation bot; `!me` fairly assigns the next pickup in a channel's rotation and generates a printable PNG label |
| `dock` | Incoming/outgoing bin/pallet logging bot; `!in <qty> bins\|pallets`, `!out <qty> bins\|pallets [to <destination>]`; `GET /dock/metrics?period=` (ADMIN/MOD) |
| `search` | Full-text-ish message search (`GET /search/messages`) |
| `push` | Web Push (VAPID) subscribe/unsubscribe, public key endpoint |
| `uploads` | Multer config (5MB avatars / 25MB attachments), AES-256-GCM encrypt/decrypt, serving |
| `audit-log` | Central audit trail (`GET /audit-log`, ADMIN); every privileged action (role changes, channel creation, dock/pickup activity, etc.) logs here |
| `notifications` | `NOTIFICATION_EVENT` fan-out — push notifications + in-app toasts, respects per-user/per-channel mute preferences |
| `redis` / `prisma` | Infra wiring |

### Command dispatch pattern
- **`/` slash commands** (`SlashCommandsService`) — always intercept (unknown
  command → "Unknown command" reply); replies never carry attachments; replies
  don't trigger the normal notification fan-out. Currently only `/remind`.
- **`!` bang commands** (`BangCommandsService`) — only intercept if the command
  name is actually registered (so ordinary messages starting with `!` aren't
  swallowed); replies can carry attachments (used for pickup labels); replies
  DO go through the full `MESSAGE_CREATED_EVENT` fan-out, since warehouse-floor
  bot activity is operationally relevant to the whole channel. Currently `!me`,
  `!in`, `!out`.

---

## 3. Real-time (Socket.IO) events
`setStatus` (supports optional `reason` for desk-leaving notifications, broadcasts
a global `statusReason` event), `joinChannel`, `sendMessage`, `editMessage`,
`deleteMessage`, `markRead`, `typing`, `addReaction`, `removeReaction`,
`togglePin`.

---

## 4. Frontend (`apps/frontend/src`)

Single-page app (`app/page.tsx`) with a sidebar and modal-style panels:
`CalendarPanel`, `MetricsPanel` (report metrics, custom SVG chart), `DockMetricsPanel`
(plain table), `ReportsPanel`, `AuditLogPanel`, `BotsPanel`, `SearchPanel`,
`VoiceCallBar`, `PushNotificationToggle`, plus `Avatar`, `MessageContent`,
`Toast`, `ServiceWorkerRegister`. Separate `login/page.tsx`. PWA manifest present
(`app/manifest.ts`).

Panel visibility: Calendar is open to everyone; Metrics, Dock Activity, and
Audit Log are ADMIN/MOD-gated (`canCreateChannels`); channel creation is
similarly gated.

---

## 5. Feature inventory (what a user can actually do today)

- Register/login, JWT sessions, roles (ADMIN/MOD/MEMBER)
- Public + private text channels, DMs, channel membership management
- Real-time messaging: typing indicators, reactions, pins, replies, read receipts,
  edit/delete
- File/image attachments (encrypted at rest) and avatars
- Presence (online/away/busy/offline) with optional away-reason broadcast
  ("stepped away for lunch" style desk-leaving notifications)
- Push-to-talk voice via LiveKit (group channels), in-app voice call bar
- Web Push notifications + in-app toasts, per-user/per-channel mute preferences
- Bot framework: token-based bots, webhook ingest endpoint, slash (`/`) and
  bang (`!`) command registries
- `/remind` — personal reminders via the Reminder Bot
- Calendar: personal (private) and general (team, channel-broadcast) events,
  30s scheduler
- Daily reports: Claude-generated end-of-day channel summaries, posted
  automatically, viewable history
- Report metrics: weekly/monthly/yearly per-user message-activity charts
- Shipping pickup bot (`!me`): fair round-robin rotation per channel,
  auto-enrolls on first use, generates a printable PNG label (encrypted at rest)
- Dock bot (`!in`/`!out`): incoming/outgoing bin/pallet logging with
  weekly/monthly/yearly metrics table
- Full-text message search
- Audit log of privileged actions
- Admin/mod capabilities: role management, channel management, message
  moderation — surfaced via existing panels rather than one consolidated
  "admin dashboard" page
- Desktop app (Tauri) with cross-platform CI builds
- LAN-only HTTPS via a self-issued root CA, distributed at `/rootCA.pem`

### Explicitly deferred / not built
- **Email notification bot** — deferred indefinitely, no email provider/credentials
  set up yet
- **eBay price-checker bot** — deferred until a real eBay Developer API key is
  obtained (developer.ebay.com)
- **Native mobile apps** (React Native) — product-pivot scope, not started
- **Multi-tenant "bring your own server" packaging** — product-pivot scope,
  not started

---

## 6. Known-good deployment facts (avoid re-debugging these)

- Container-internal port in Caddyfile/LiveKit config must match Docker
  Compose's container-side port number, not the host-side one.
- Caddy site blocks must match by port (`:443`) as well as hostname, since
  bare-IP/no-SNI clients won't match a hostname-only block.
- LiveKit's listening port, the backend's `LIVEKIT_HOST`, and the Caddyfile's
  `/livekit/*` proxy target must all agree — currently all `7880`, verified
  working.
- If a server NIC uses jumbo frames (MTU 9000) but clients don't uniformly
  support them, TLS handshakes silently fail — force `mtu 1500` via a separate
  netplan file that survives cloud-init overwrites.
- The Caddyfile's `@backend` path matcher must be kept in sync with every new
  backend route prefix — it was previously missing `/calendar`, `/dock`, and
  `/audit-log`, which caused those requests to silently fall through to the
  frontend. **When adding a new backend module with its own route prefix,
  add it to the `@backend` matcher in `infra/caddy/Caddyfile` (and
  `Caddyfile.prod`) in the same change.**
- `PresenceService.setStatus` used to crash the whole backend process if it
  tried to update a user record that no longer exists (e.g. disconnect after
  account deletion) — now caught gracefully (P2025 handling).

---

## 7. What's not yet true of this doc

This is a snapshot, not a living doc — re-verify against `git log` / the code
before trusting specifics that "cost significant debugging time" claims don't
carry forward (those live in `cordon-plan-v2.md` §3). Update this file (or ask
me to) whenever a new feature phase lands.

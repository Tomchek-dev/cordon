# Cordon — Project Plan (v2)

Internal Discord/Teams-style chat tool: text channels, DMs, bot integrations
(reminders/notifications), automated daily reports, push-to-talk voice, and
eventually web/mobile/desktop clients. This version incorporates lessons from
the first production deployment on Ubuntu.

---

## 0. Environment Setup (fresh Pop!_OS / Ubuntu install)

Check for and install before scaffolding anything:

- **Node.js** (LTS) via `nvm`
- **Git**
- **Docker** + **Docker Compose**
- **VS Code** (+ Remote-SSH extension if managing a remote server)
- **mkcert** — for local HTTPS certs
- **Rust + Cargo** — only needed later, for the Tauri desktop client
- Recommended VS Code extensions: ESLint, Prettier, Docker, Prisma, Tailwind CSS IntelliSense

---

## 1. Architecture Overview

- **Backend:** NestJS (REST + WebSocket gateway)
- **Frontend:** Next.js + Tailwind, socket.io client
- **Database:** PostgreSQL + Redis
- **Auth:** JWT-based, local accounts
- **Bots:** Webhook/token-based bot API
- **Voice:** LiveKit (self-hosted SFU) for group push-to-talk; plain WebRTC P2P for DMs
- **Reverse proxy chain:** Caddy (TLS termination, internal routing) sitting behind
  nginx (public-facing, since the deployment box already runs other sites) — see
  Section 3 for why this two-layer setup exists and how it's wired
- **Deployment:** Docker Compose, always-on Ubuntu server

### Core data model
- `users`, `channels`, `channel_members`, `messages`, `bots`, `bot_events`, `daily_reports`

---

## 2. Phased Build Plan

### Phase 1 — Core chat (MVP)
User accounts, JWT auth, public text channels, real-time WebSocket messaging,
basic Next.js UI, HTTPS from day one, Dockerized.

### Phase 2 — Users & presence
Presence via Redis, DMs, profiles, message edit/delete, unread indicators.

### Phase 3 — Bot framework
Bot registration/tokens, `POST /api/bots/:token/messages`, incoming webhooks,
slash-command triggers.

### Phase 4 — Reminders & notifications
Built-in Reminder Bot (`@nestjs/schedule` or BullMQ), in-app WebSocket push,
per-user notification preferences.

### Phase 5 — Daily report generation
Scheduled end-of-day job summarizing channel activity, posted to `#daily-report`,
report history page.

### Phase 6 — Polish
Search, file/image attachments, role permissions, mobile-responsive UI.

### Phase 7 — Voice (push-to-talk)
LiveKit server, voice channels, PTT UI, DM voice, decide software-only vs.
physical hardware PTT button.

### Phase 8 — PWA / Mobile (browser-based)
Manifest + service worker, Web Push, mobile-responsive layout. Known limitation:
backgrounded/locked-screen audio is unreliable on mobile browsers — keep PTT
foreground-only for now.

### Phase 9 — Native mobile apps + multi-tenant packaging (product-pivot scope)
React Native app, "bring your own server" onboarding (manual entry or QR code),
self-contained deployable server package, central license-validation service,
`react-native-webrtc` for background-capable PTT.

### Phase 10 — Desktop clients
Tauri shell around the existing web frontend, OS-native notifications, system
tray, background-capable PTT, auto-launch on login.

### Phase 11 — Admin dashboard (NEW)
Discovered as a gap during first deployment: the first registered user
auto-becomes admin (reasonable bootstrap pattern), but there's no dashboard yet
to actually use that role. Needed before onboarding real users at scale.
- User management: list, promote/demote admin, deactivate/remove accounts
- Channel management: create/archive/rename, manage membership
- Basic moderation: delete any message, review/manage flagged uploads
- Server-wide settings: rate limits, upload size caps (ties into Phase 12)

### Phase 12 — File upload fixes (NEW)
Large attachments currently fail. Checklist to work through, in likely-cause order:
- Raise nginx's `client_max_body_size` (defaults to 1MB — the most likely culprit)
- Confirm Caddy has no implicit body-size restriction
- Check the backend's multipart handler (e.g. multer) `fileSize` limit
- Confirm server disk space isn't the actual constraint (`df -h`)

### Phase 13 — Voice/call fix follow-through (NEW, in progress)
Root cause identified during first deployment: LiveKit's internal listening
port didn't match what the backend (`LIVEKIT_HOST`) and Caddy
(`/livekit/*` reverse_proxy target) were configured to reach — same class of
bug as the Caddy TLS issue in Section 3. Fix: ensure all three of the following
agree on the same internal port:
1. `infra/livekit/livekit.prod.yaml`'s actual listening port
2. Backend's `LIVEKIT_HOST` env var
3. Caddyfile's `handle_path /livekit/* { reverse_proxy livekit:<port> }`

---

## 3. Deployment Lessons from the First Production Rollout

These are documented here because they cost significant debugging time and are
easy to reintroduce on a fresh deploy or a second server.

### 3.1 Container-internal port must match the Docker Compose port mapping
Docker's `"host:container"` port syntax means the **container-side** number is
what the app inside must actually listen on. If `docker-compose.yml` maps
`"127.0.0.1:9443:443"`, Caddy's Caddyfile site block must be `:443`, not
`:9443` — using the host-side number inside the container config causes TLS
connections to be accepted at the TCP level and then reset mid-handshake
(symptoms: "unexpected eof", "decode error", inconsistent behavior across
tools). This exact bug consumed most of a debugging session — `setup.sh` now
derives both from a single source of truth (see 3.4) to prevent recurrence.

### 3.2 Caddy site blocks matched by hostname don't work for bare-IP or no-SNI clients
TLS's SNI extension is not sent for connections to a raw IP address per spec
(RFC 6066) — many clients (including curl on IP targets) send no SNI at all.
Hostname-matched Caddy blocks (`https://myhost.local, https://1.2.3.4 { ... }`)
silently fail to find a matching certificate in that case. Fix: match by port
instead (`:443 { tls ... }`), which works regardless of SNI presence.

### 3.3 Two reverse proxies (nginx + Caddy) — why and how
If the deployment server already runs other sites under nginx, don't fight it —
run Caddy bound to `127.0.0.1:<port>` only (never `0.0.0.0`), and add a
dedicated nginx `server` block that reverse-proxies to Caddy's loopback
address. This avoids port 80/443 collisions with existing sites entirely.
`proxy_ssl_verify off` is required in the nginx block since Caddy's cert
(mkcert-issued) isn't from a public CA.

### 3.4 Jumbo frames (MTU 9000) break TLS handshakes on mixed LAN traffic
If the server's NIC is configured with `mtu 9000` but client devices/network
gear don't uniformly support jumbo frames, large packets (like a TLS
ClientHello's certificate chain) get dropped — small plaintext HTTP works fine
while HTTPS mysteriously fails. Diagnostic: `ping -f -l 1472 <server-ip>` from
a client (Windows) or `ping -M do -s 1472 <target>` (Linux) — "needs to be
fragmented" confirms it. Fix: set the server NIC to standard `mtu 1500` via a
**separate** netplan file (e.g. `/etc/netplan/99-custom-mtu.yaml`), since
cloud-init-managed netplan files get overwritten on reboot.

### 3.5 rootCA distribution for self-signed LAN certs
Since mkcert's CA isn't publicly trusted, every client device needs the CA
cert imported once (`https://<host>/rootCA.pem`, served directly by Caddy).
Per-OS steps documented in the team onboarding doc (Windows/macOS/Linux/
Android/iOS each differ meaningfully here — iOS in particular needs a second
"Certificate Trust Settings" toggle after installing the profile).

### 3.6 Diagnostic toolchain note
Local CLI tools (curl, openssl, wget) on an older Ubuntu install may have an
outdated system OpenSSL that behaves inconsistently with modern TLS 1.3
extensions — when in doubt, verify with an actual browser on a separate,
regularly-updated device before concluding the server is broken.

---

## 4. Naming

App name: **Cordon**. Chosen after ruling out several name candidates that
collided with existing products (see naming history if needed) — Cordon came
back clean in availability checks. Domain/npm/trademark registration still
outstanding.

---

## 5. Budget Notes (LAN-only, ~60 concurrent users)

| Item | Cost |
|---|---|
| LiveKit (voice SFU) | $0 — open source, self-hosted |
| Server hardware | $0 if repurposing existing spare hardware |
| LAN bandwidth | $0 |
| mkcert + Caddy + nginx | $0 |
| Web Push (VAPID) | $0 |
| Ongoing cost | ~$0 as long as it stays LAN-only |

---

## 6. Next Session Priorities

1. Finish Phase 13 (voice/call port fix) — one config value away as of last session
2. Phase 12 (file upload limits) — quick, isolated fix
3. Phase 11 (admin dashboard) — treat as its own focused session, not a bolt-on
4. Revisit whether `cordon.test` should go through real internal DNS instead of
   per-device hosts-file edits, now that the admin-rights limitation on some
   client machines is known

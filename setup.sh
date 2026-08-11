#!/usr/bin/env bash
# One-command production setup for the internal chat tool.
# Brings up the full stack (Postgres, Redis, Caddy, LiveKit, backend, frontend)
# via Docker Compose, generating fresh secrets and a LAN HTTPS cert on first run.
#
# Re-running this script is safe: it reuses .env / infra files already on disk
# and only regenerates what's missing.
#
# Pass --behind-nginx if this server already runs other sites behind nginx:
# Caddy binds to loopback-only alternate ports instead of 80/443, and this
# script generates an nginx server block (infra/nginx/cordon.conf) for you to
# review and install - see cordon-plan-v2.md section 3.3 for why.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

BEHIND_NGINX=0
for arg in "$@"; do
  case "$arg" in
    --behind-nginx) BEHIND_NGINX=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

echo "==> Checking for Docker..."
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed."
  echo "Install it first: https://docs.docker.com/engine/install/"
  echo "(On Debian/Ubuntu: curl -fsSL https://get.docker.com | sudo sh)"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but not usable by this user/session."
  echo "Make sure the Docker daemon is running and your user is in the 'docker' group"
  echo "(sudo usermod -aG docker \$USER, then log out and back in)."
  exit 1
fi

echo "==> Checking for mkcert..."
if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert is not installed. It's needed to issue a trusted LAN HTTPS cert."
  echo "Install it first: https://github.com/FiloSottile/mkcert#installation"
  exit 1
fi

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ -z "$LAN_IP" ]; then
  echo "Could not auto-detect a LAN IP (hostname -I returned nothing)."
  read -rp "Enter this machine's LAN IP address: " LAN_IP
fi
LAN_HOSTNAME="$(hostname).local"
echo "==> Detected LAN address: $LAN_IP (hostname: $LAN_HOSTNAME)"

if [ "$BEHIND_NGINX" -eq 0 ] && [ -t 0 ] && [ ! -f .env ]; then
  read -rp "Is this server already running other sites behind nginx? [y/N] " ans
  case "$ans" in
    [Yy]*) BEHIND_NGINX=1 ;;
  esac
fi

rand_hex() {
  docker run --rm node:22-bookworm-slim node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

if [ -f .env ]; then
  echo "==> .env already exists, reusing it (delete it first to regenerate secrets)."
  # shellcheck disable=SC1091
  source .env
else
  echo "==> Generating fresh secrets..."
  JWT_SECRET="$(rand_hex)"
  LIVEKIT_API_KEY="chatlan"
  LIVEKIT_API_SECRET="$(rand_hex)"
  POSTGRES_PASSWORD="$(rand_hex)"

  VAPID_OUTPUT="$(docker run --rm node:22-bookworm-slim npx --yes web-push@3 generate-vapid-keys 2>/dev/null)"
  VAPID_PUBLIC_KEY="$(echo "$VAPID_OUTPUT" | grep -A1 "Public Key" | tail -1 | tr -d '[:space:]')"
  VAPID_PRIVATE_KEY="$(echo "$VAPID_OUTPUT" | grep -A1 "Private Key" | tail -1 | tr -d '[:space:]')"
  VAPID_SUBJECT="mailto:admin@${LAN_HOSTNAME}"
  UPLOADS_ENCRYPTION_KEY="$(rand_hex)"

  if [ "$BEHIND_NGINX" -eq 1 ]; then
    read -rp "Loopback port for Caddy's HTTPS listener [8443]: " CADDY_HTTPS_PORT
    CADDY_HTTPS_PORT="${CADDY_HTTPS_PORT:-8443}"
    read -rp "Loopback port for Caddy's HTTP listener [8080]: " CADDY_HTTP_PORT
    CADDY_HTTP_PORT="${CADDY_HTTP_PORT:-8080}"
    CADDY_HTTP_BIND="127.0.0.1"
    CADDY_HTTPS_BIND="127.0.0.1"
    TRUST_PROXY_HOPS=2
  else
    CADDY_HTTP_BIND="0.0.0.0"
    CADDY_HTTPS_BIND="0.0.0.0"
    CADDY_HTTP_PORT=80
    CADDY_HTTPS_PORT=443
    TRUST_PROXY_HOPS=1
  fi

  cat > .env <<EOF
LAN_IP=${LAN_IP}
LAN_HOSTNAME=${LAN_HOSTNAME}
JWT_SECRET=${JWT_SECRET}
LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
VAPID_SUBJECT=${VAPID_SUBJECT}
UPLOADS_ENCRYPTION_KEY=${UPLOADS_ENCRYPTION_KEY}
CADDY_HTTP_BIND=${CADDY_HTTP_BIND}
CADDY_HTTPS_BIND=${CADDY_HTTPS_BIND}
CADDY_HTTP_PORT=${CADDY_HTTP_PORT}
CADDY_HTTPS_PORT=${CADDY_HTTPS_PORT}
TRUST_PROXY_HOPS=${TRUST_PROXY_HOPS}

# Optional integrations - uncomment and fill in anytime (no need to re-run
# this script; just restart the stack: docker compose -f docker-compose.prod.yml up -d).
# GIF picker (Tenor): https://developers.google.com/tenor/guides/quickstart
# TENOR_API_KEY=
# Claude-powered @mention assistant bot: platform.claude.com
# ANTHROPIC_API_KEY=
# eBay price-checker bot (!ebay command + DM chat): developer.ebay.com
# EBAY_ENV=sandbox
# EBAY_APP_ID=
# EBAY_DEV_ID=
# EBAY_CERT_ID=
EOF
  chmod 600 .env
  echo "==> Wrote .env (permissions set to 600)"
fi

echo "==> Generating infra/livekit/livekit.prod.yaml..."
sed -e "s|\${LAN_IP}|${LAN_IP}|g" \
    -e "s|\${LIVEKIT_API_KEY}|${LIVEKIT_API_KEY}|g" \
    -e "s|\${LIVEKIT_API_SECRET}|${LIVEKIT_API_SECRET}|g" \
    infra/livekit/livekit.yaml.template > infra/livekit/livekit.prod.yaml

echo "==> Generating infra/caddy/Caddyfile.prod..."
sed -e "s|\${LAN_IP}|${LAN_IP}|g" \
    -e "s|\${LAN_HOSTNAME}|${LAN_HOSTNAME}|g" \
    infra/caddy/Caddyfile.prod.template > infra/caddy/Caddyfile.prod

# Derived from .env (freshly written above, or sourced from a prior run) -
# this is the reliable way to know which mode we're in either way.
if [ "${CADDY_HTTPS_BIND:-0.0.0.0}" = "127.0.0.1" ]; then
  echo "==> Generating infra/nginx/cordon.conf (review and install manually - see the file's header)..."
  mkdir -p infra/nginx
  sed -e "s|\${LAN_IP}|${LAN_IP}|g" \
      -e "s|\${LAN_HOSTNAME}|${LAN_HOSTNAME}|g" \
      -e "s|\${CADDY_HTTPS_PORT}|${CADDY_HTTPS_PORT:-8443}|g" \
      infra/nginx/cordon.conf.template > infra/nginx/cordon.conf
fi

echo "==> Issuing LAN HTTPS certificate (mkcert)..."
mkdir -p infra/caddy/certs
mkcert -install
mkcert -cert-file infra/caddy/certs/lan.pem -key-file infra/caddy/certs/lan-key.pem \
  "${LAN_HOSTNAME}" "$(hostname)" "${LAN_IP}" localhost 127.0.0.1 ::1
# Public CA cert only (never the private key) - Caddy serves this at
# /rootCA.pem so other LAN devices can grab and trust it in one step.
cp "$(mkcert -CAROOT)/rootCA.pem" infra/caddy/certs/rootCA.pem

echo "==> Building images and starting dependencies (Postgres/Redis/LiveKit)..."
docker compose -f docker-compose.prod.yml build backend frontend
docker compose -f docker-compose.prod.yml up -d postgres redis livekit

echo "==> Waiting for Postgres to accept connections..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U chat >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Applying database migrations..."
docker compose -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy --schema=prisma/schema.prisma

echo "==> Starting backend, frontend, and Caddy..."
docker compose -f docker-compose.prod.yml up -d

if [ "${CADDY_HTTPS_BIND:-0.0.0.0}" = "127.0.0.1" ]; then
  cat <<EOF

==> Done! (Caddy is running on 127.0.0.1:${CADDY_HTTPS_PORT:-8443}, not yet public)

One more step: install the generated nginx config so this site is actually
reachable -
  1. Review infra/nginx/cordon.conf - fill in ssl_certificate(_key) for a
     cert this host presents to clients (your own, or the mkcert one at
     infra/caddy/certs/lan.pem / lan-key.pem for LAN-only setups)
  2. sudo cp infra/nginx/cordon.conf /etc/nginx/sites-available/cordon.conf
  3. sudo ln -s /etc/nginx/sites-available/cordon.conf /etc/nginx/sites-enabled/
  4. sudo nginx -t && sudo systemctl reload nginx

Once that's done, it'll be reachable at:
  https://${LAN_HOSTNAME}
  https://${LAN_IP}

Other machines on the LAN will see a certificate warning until they also
trust the cert nginx presents. If you used the mkcert cert in step 1, that's
this machine's root CA - download it from:
  https://${LAN_HOSTNAME}/rootCA.pem
(click through the one-time warning to fetch it) and import it into each
client's system trust store or browser.
EOF
else
  cat <<EOF

==> Done!

Your internal chat tool is running at:
  https://${LAN_HOSTNAME}
  https://${LAN_IP}

Other machines on the LAN will see a certificate warning until they also
trust this machine's root CA. Download it from:
  https://${LAN_HOSTNAME}/rootCA.pem
(click through the one-time warning to fetch it) and import it into each
client's system trust store or browser.
EOF
fi

#!/usr/bin/env bash
# One-command production setup for the internal chat tool.
# Brings up the full stack (Postgres, Redis, Caddy, LiveKit, backend, frontend)
# via Docker Compose, generating fresh secrets and a LAN HTTPS cert on first run.
#
# Re-running this script is safe: it reuses .env / infra files already on disk
# and only regenerates what's missing.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

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

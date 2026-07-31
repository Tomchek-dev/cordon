#!/usr/bin/env bash
# Back up the Postgres database (and uploaded files) to ./backups/.
# Safe to run from cron - no prompts, exits non-zero on failure.
#
# Usage:
#   ./scripts/backup.sh          # auto-detects dev or prod stack
#   ./scripts/backup.sh --prod   # force the production container
#   ./scripts/backup.sh --dev    # force the dev container
#
# Retention: keeps the most recent 14 database backups, deletes older ones.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

MODE="${1:-auto}"
case "$MODE" in
  --prod) CONTAINER="atlantis-prod-postgres-1"; UPLOADS_CONTAINER="atlantis-prod-backend-1" ;;
  --dev) CONTAINER="atlantis-postgres-1"; UPLOADS_CONTAINER="" ;;
  auto)
    if docker ps --format '{{.Names}}' | grep -qx "atlantis-prod-postgres-1"; then
      CONTAINER="atlantis-prod-postgres-1"; UPLOADS_CONTAINER="atlantis-prod-backend-1"
    elif docker ps --format '{{.Names}}' | grep -qx "atlantis-postgres-1"; then
      CONTAINER="atlantis-postgres-1"; UPLOADS_CONTAINER=""
    else
      echo "No running atlantis postgres container found (checked atlantis-prod-postgres-1 and atlantis-postgres-1)." >&2
      exit 1
    fi
    ;;
  *) echo "Unknown argument: $MODE (use --prod or --dev)" >&2; exit 1 ;;
esac

mkdir -p backups
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DB_BACKUP="backups/chat-${TIMESTAMP}.sql.gz"

echo "==> Dumping database from ${CONTAINER}..."
docker exec "$CONTAINER" pg_dump -U chat chat | gzip > "$DB_BACKUP"
echo "==> Wrote $DB_BACKUP ($(du -h "$DB_BACKUP" | cut -f1))"

# Uploaded files (avatars/attachments) live in a named volume, not the
# postgres container - back them up separately if we found a backend container.
if [ -n "$UPLOADS_CONTAINER" ] && docker ps --format '{{.Names}}' | grep -qx "$UPLOADS_CONTAINER"; then
  UPLOADS_BACKUP="backups/uploads-${TIMESTAMP}.tar.gz"
  echo "==> Archiving uploaded files from ${UPLOADS_CONTAINER}..."
  docker exec "$UPLOADS_CONTAINER" tar -czf - -C /app uploads > "$UPLOADS_BACKUP" 2>/dev/null || true
  if [ -s "$UPLOADS_BACKUP" ]; then
    echo "==> Wrote $UPLOADS_BACKUP ($(du -h "$UPLOADS_BACKUP" | cut -f1))"
  else
    rm -f "$UPLOADS_BACKUP"
  fi
fi

echo "==> Pruning old backups (keeping the 14 most recent of each)..."
ls -1t backups/chat-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f || true
ls -1t backups/uploads-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f || true

echo "==> Done."

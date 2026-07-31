#!/usr/bin/env bash
# Restore a database backup created by backup.sh. DESTRUCTIVE - overwrites
# all current data in the target database. Requires interactive confirmation,
# unlike backup.sh which is meant to run unattended from cron.
#
# Usage:
#   ./scripts/restore.sh backups/chat-20260101-120000.sql.gz [--prod|--dev]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

BACKUP_FILE="${1:-}"
MODE="${2:-auto}"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: $0 <path-to-backup.sql.gz> [--prod|--dev]" >&2
  exit 1
fi

case "$MODE" in
  --prod) CONTAINER="atlantis-prod-postgres-1" ;;
  --dev) CONTAINER="atlantis-postgres-1" ;;
  auto)
    if docker ps --format '{{.Names}}' | grep -qx "atlantis-prod-postgres-1"; then
      CONTAINER="atlantis-prod-postgres-1"
    elif docker ps --format '{{.Names}}' | grep -qx "atlantis-postgres-1"; then
      CONTAINER="atlantis-postgres-1"
    else
      echo "No running atlantis postgres container found." >&2
      exit 1
    fi
    ;;
  *) echo "Unknown argument: $MODE (use --prod or --dev)" >&2; exit 1 ;;
esac

echo "This will PERMANENTLY OVERWRITE all data in the '${CONTAINER}' database"
echo "with the contents of: ${BACKUP_FILE}"
read -rp "Type the container name (${CONTAINER}) to confirm: " CONFIRM
if [ "$CONFIRM" != "$CONTAINER" ]; then
  echo "Confirmation did not match, aborting."
  exit 1
fi

echo "==> Restoring..."
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql -U chat -d chat
echo "==> Restore complete."

#!/usr/bin/env bash
# Nightly Stalwart backup. RocksDB files are only consistent while the server is stopped,
# so the service pauses for a few seconds; sending servers retry delivery on their own.

set -Eeuo pipefail

MAIL_BACKUP_DIR=${MAIL_BACKUP_DIR:-/root/mail-backups}
MAIL_BACKUP_RETENTION=${MAIL_BACKUP_RETENTION:-1}

stamp=$(date +%Y%m%d-%H%M%S)
archive="${MAIL_BACKUP_DIR}/stalwart-${stamp}.tar.gz"
install -d -m 700 "$MAIL_BACKUP_DIR"

systemctl stop stalwart.service
trap 'systemctl start stalwart.service' EXIT
tar -C / -czf "$archive" etc/stalwart var/lib/stalwart
chmod 600 "$archive"

find "$MAIL_BACKUP_DIR" -maxdepth 1 -type f -name 'stalwart-*.tar.gz' | sort -r \
  | tail -n "+$((MAIL_BACKUP_RETENTION + 1))" | xargs -r rm -f

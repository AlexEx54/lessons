#!/usr/bin/env bash

set -Eeuo pipefail

MAIL_DOMAIN=${MAIL_DOMAIN:-mail.easyclass-edu.ru}
CADDY_DATA_DIR=${CADDY_DATA_DIR:-/var/lib/caddy/.local/share/caddy}
MAIL_CERT_DIR=${MAIL_CERT_DIR:-/etc/stalwart/certs}
SOURCE_DIR="${CADDY_DATA_DIR}/certificates/acme-v02.api.letsencrypt.org-directory/${MAIL_DOMAIN}"
SOURCE_CERT="${SOURCE_DIR}/${MAIL_DOMAIN}.crt"
SOURCE_KEY="${SOURCE_DIR}/${MAIL_DOMAIN}.key"
TARGET_CERT="${MAIL_CERT_DIR}/${MAIL_DOMAIN}.crt"
TARGET_KEY="${MAIL_CERT_DIR}/${MAIL_DOMAIN}.key"

test -s "$SOURCE_CERT"
test -s "$SOURCE_KEY"
install -d -o root -g stalwart -m 0750 "$MAIL_CERT_DIR"

changed=0
if ! cmp -s "$SOURCE_CERT" "$TARGET_CERT"; then
  install -o root -g stalwart -m 0640 "$SOURCE_CERT" "$TARGET_CERT"
  changed=1
fi
if ! cmp -s "$SOURCE_KEY" "$TARGET_KEY"; then
  install -o root -g stalwart -m 0640 "$SOURCE_KEY" "$TARGET_KEY"
  changed=1
fi

# Stalwart reads certificate files only on start or on an explicit reload.
if [[ "$changed" == "1" ]] && systemctl is-active --quiet stalwart.service; then
  systemctl try-restart stalwart.service
fi

#!/usr/bin/env bash

set -Eeuo pipefail

TURN_DOMAIN=${TURN_DOMAIN:-grekko.duckdns.org}
CADDY_DATA_DIR=${CADDY_DATA_DIR:-/var/lib/docker/volumes/repetitor2_repetitor-prod-caddy-data/_data}
TURN_CERT_DIR=${TURN_CERT_DIR:-/etc/turnserver-certs}
SOURCE_DIR="${CADDY_DATA_DIR}/caddy/certificates/acme-v02.api.letsencrypt.org-directory/${TURN_DOMAIN}"
SOURCE_CERT="${SOURCE_DIR}/${TURN_DOMAIN}.crt"
SOURCE_KEY="${SOURCE_DIR}/${TURN_DOMAIN}.key"
TARGET_CERT="${TURN_CERT_DIR}/${TURN_DOMAIN}.crt"
TARGET_KEY="${TURN_CERT_DIR}/${TURN_DOMAIN}.key"

test -s "$SOURCE_CERT"
test -s "$SOURCE_KEY"
install -d -o root -g turnserver -m 0750 "$TURN_CERT_DIR"

changed=0
if ! cmp -s "$SOURCE_CERT" "$TARGET_CERT"; then
  install -o root -g turnserver -m 0640 "$SOURCE_CERT" "$TARGET_CERT"
  changed=1
fi
if ! cmp -s "$SOURCE_KEY" "$TARGET_KEY"; then
  install -o root -g turnserver -m 0640 "$SOURCE_KEY" "$TARGET_KEY"
  changed=1
fi

if [[ "$changed" == "1" ]] && systemctl is-active --quiet coturn.service; then
  systemctl try-restart coturn.service
fi

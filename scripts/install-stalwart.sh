#!/usr/bin/env bash
# Installs or upgrades the Stalwart mail server on the VPS. Run as root from /opt/teach_platform.
# To upgrade, bump STALWART_VERSION and STALWART_SHA256 (the "digest" of the
# stalwart-x86_64-unknown-linux-gnu.tar.gz asset on the GitHub release page) and run it again.

set -Eeuo pipefail

STALWART_VERSION=0.16.25
STALWART_SHA256=8ba9cc0ea2795121df5c1264af41e82353c5a3d6860161c4ab70817906d912d3
STALWART_ASSET=stalwart-x86_64-unknown-linux-gnu.tar.gz
STALWART_URL="https://github.com/stalwartlabs/stalwart/releases/download/v${STALWART_VERSION}/${STALWART_ASSET}"

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
UNITS=(
  stalwart.service
  teach-platform-mail-cert-sync.service
  teach-platform-mail-cert-sync.timer
  teach-platform-mail-backup.service
  teach-platform-mail-backup.timer
)

if ! id -u stalwart >/dev/null 2>&1; then
  useradd stalwart --system --user-group --no-create-home --shell /usr/sbin/nologin
fi
install -d -o stalwart -g stalwart -m 0750 /etc/stalwart /var/lib/stalwart /var/log/stalwart
install -d -o root -g stalwart -m 0750 /etc/stalwart/certs
if [[ ! -e /etc/stalwart/stalwart.env ]]; then
  install -o root -g stalwart -m 0640 /dev/null /etc/stalwart/stalwart.env
fi

download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT
curl -fsSL --retry 3 -o "${download_dir}/${STALWART_ASSET}" "$STALWART_URL"
echo "${STALWART_SHA256}  ${download_dir}/${STALWART_ASSET}" | sha256sum --check --quiet
tar -xzf "${download_dir}/${STALWART_ASSET}" -C "$download_dir"
install -o root -g root -m 0755 "${download_dir}/stalwart" /usr/local/bin/stalwart

for unit in "${UNITS[@]}"; do
  install -o root -g root -m 0644 "${ROOT_DIR}/deploy/systemd/${unit}" "/etc/systemd/system/${unit}"
done
systemctl daemon-reload
systemctl enable --now teach-platform-mail-cert-sync.timer teach-platform-mail-backup.timer
systemctl enable stalwart.service
systemctl restart stalwart.service

ufw allow 25/tcp comment 'SMTP'
ufw allow 465/tcp comment 'SMTP submission (TLS)'
ufw allow 993/tcp comment 'IMAP (TLS)'

echo "Stalwart ${STALWART_VERSION} установлен и запущен."

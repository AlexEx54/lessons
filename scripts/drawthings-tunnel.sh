#!/usr/bin/env bash

set -Eeuo pipefail

show_help() {
  cat <<'HELP'
Usage: npm run drawthings:tunnel
       bash scripts/drawthings-tunnel.sh

Opens a reverse SSH tunnel from the VPS to the Draw Things gRPC server on this Mac:

  VPS 127.0.0.1:17859 -> Mac 127.0.0.1:7859

The command stays in the foreground. Press Ctrl+C to close the tunnel.

Environment variables:
  DRAWTHINGS_VPS_HOST           VPS hostname or IP (default: 144.31.76.176)
  DRAWTHINGS_VPS_SSH_PORT       VPS SSH port (default: 4537)
  DRAWTHINGS_VPS_USER           VPS SSH user (default: root)
  DRAWTHINGS_SSH_IDENTITY_FILE  SSH private key path
  DRAWTHINGS_REMOTE_HOST        Bind address on VPS (default: 127.0.0.1)
  DRAWTHINGS_REMOTE_PORT        gRPC tunnel port on VPS (default: 17859)
  DRAWTHINGS_LOCAL_HOST         Draw Things bind address on Mac (default: 127.0.0.1)
  DRAWTHINGS_LOCAL_PORT         Draw Things gRPC port on Mac (default: 7859)

Example with overrides:
  DRAWTHINGS_REMOTE_PORT=27859 npm run drawthings:tunnel

The VPS application should connect to DRAWTHINGS_REMOTE_HOST:DRAWTHINGS_REMOTE_PORT.
The default binding is localhost-only and does not expose the port to the Internet.
HELP
}

case "${1:-}" in
  -h|--help)
    show_help
    exit 0
    ;;
  "")
    ;;
  *)
    echo "Unknown argument: $1" >&2
    echo "Run with --help for usage." >&2
    exit 2
    ;;
esac

VPS_HOST=${DRAWTHINGS_VPS_HOST:-144.31.76.176}
VPS_SSH_PORT=${DRAWTHINGS_VPS_SSH_PORT:-4537}
VPS_USER=${DRAWTHINGS_VPS_USER:-root}
SSH_IDENTITY_FILE=${DRAWTHINGS_SSH_IDENTITY_FILE:-$HOME/.ssh/repetitor2_prod_ed25519}

REMOTE_HOST=${DRAWTHINGS_REMOTE_HOST:-127.0.0.1}
REMOTE_PORT=${DRAWTHINGS_REMOTE_PORT:-17859}
LOCAL_HOST=${DRAWTHINGS_LOCAL_HOST:-127.0.0.1}
LOCAL_PORT=${DRAWTHINGS_LOCAL_PORT:-7859}

command -v ssh >/dev/null 2>&1 || {
  echo "ssh is required but was not found." >&2
  exit 1
}

if command -v nc >/dev/null 2>&1 && ! nc -z "$LOCAL_HOST" "$LOCAL_PORT"; then
  echo "Draw Things is not listening on ${LOCAL_HOST}:${LOCAL_PORT}." >&2
  echo "Enable Settings -> Advanced -> API Server -> gRPC and try again." >&2
  exit 1
fi

ssh_options=(
  -N
  -T
  -p "$VPS_SSH_PORT"
  -o BatchMode=yes
  -o ExitOnForwardFailure=yes
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=3
  -o StrictHostKeyChecking=accept-new
  -R "${REMOTE_HOST}:${REMOTE_PORT}:${LOCAL_HOST}:${LOCAL_PORT}"
)

if [[ -f "$SSH_IDENTITY_FILE" ]]; then
  ssh_options+=(
    -o IdentitiesOnly=yes
    -i "$SSH_IDENTITY_FILE"
  )
fi

echo "Opening Draw Things gRPC tunnel:"
echo "  VPS ${REMOTE_HOST}:${REMOTE_PORT} -> Mac ${LOCAL_HOST}:${LOCAL_PORT}"
echo "  SSH ${VPS_USER}@${VPS_HOST}:${VPS_SSH_PORT}"
echo "Press Ctrl+C to stop."

exec ssh "${ssh_options[@]}" "${VPS_USER}@${VPS_HOST}"

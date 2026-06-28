#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_HOST="www.playerok.com"
TARGET_PORT="443"
SERVER_NAME=""
LISTEN_PORT="443"
XHTTP_PATH="/assets"
FINGERPRINT="chrome"
SPIDER_X="/"
PROFILE_NAME="Xray-XHTTP"
PUBLIC_IP=""
SKIP_TLS_PING="0"

CONFIG_DIR="/usr/local/etc/xray"
CONFIG_PATH="${CONFIG_DIR}/config.json"
STATE_DIR="/root/xray-bootstrap"

usage() {
  cat <<'EOF'
Usage:
  bash xray_bootstrap.sh [options]

Options:
  --target-host HOST     REALITY target host. Default: www.googletagmanager.com
  --target-port PORT     REALITY target port. Default: 443
  --server-name HOST     SNI/serverName for client+server. Default: target host
  --listen-port PORT     Xray listen port. Default: 443
  --path PATH            XHTTP path. Default: /assets
  --fingerprint FP       Client fingerprint. Default: chrome
  --spider-x PATH        Client SpiderX. Default: /
  --profile-name NAME    Connection name in the URI. Default: Xray-XHTTP
  --public-ip IP         Override detected VPS public IP
  --skip-tls-ping        Skip xray tls ping validation
  -h, --help             Show this help

Example:
  bash xray_bootstrap.sh \
    --target-host www.googletagmanager.com \
    --server-name www.googletagmanager.com \
    --listen-port 443 \
    --path /assets
EOF
}

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

urlencode() {
  local input="$1"
  local output=""
  local i char hex

  for ((i = 0; i < ${#input}; i++)); do
    char="${input:i:1}"
    case "$char" in
      [a-zA-Z0-9.~_-])
        output+="$char"
        ;;
      *)
        printf -v hex '%%%02X' "'$char"
        output+="$hex"
        ;;
    esac
  done

  printf '%s' "$output"
}

require_root() {
  [[ ${EUID:-$(id -u)} -eq 0 ]] || die "run this script as root"
}

restore_backup() {
  if [[ -n "${BACKUP_PATH:-}" && -f "${BACKUP_PATH}" ]]; then
    log "Restoring previous Xray config from ${BACKUP_PATH}"
    cp "${BACKUP_PATH}" "${CONFIG_PATH}"
    systemctl restart xray || true
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --target-host)
        TARGET_HOST="$2"
        shift 2
        ;;
      --target-port)
        TARGET_PORT="$2"
        shift 2
        ;;
      --server-name)
        SERVER_NAME="$2"
        shift 2
        ;;
      --listen-port)
        LISTEN_PORT="$2"
        shift 2
        ;;
      --path)
        XHTTP_PATH="$2"
        shift 2
        ;;
      --fingerprint)
        FINGERPRINT="$2"
        shift 2
        ;;
      --spider-x)
        SPIDER_X="$2"
        shift 2
        ;;
      --profile-name)
        PROFILE_NAME="$2"
        shift 2
        ;;
      --public-ip)
        PUBLIC_IP="$2"
        shift 2
        ;;
      --skip-tls-ping)
        SKIP_TLS_PING="1"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "unknown argument: $1"
        ;;
    esac
  done
}

validate_args() {
  [[ -n "${TARGET_HOST}" ]] || die "--target-host cannot be empty"
  [[ -n "${TARGET_PORT}" ]] || die "--target-port cannot be empty"
  [[ -n "${LISTEN_PORT}" ]] || die "--listen-port cannot be empty"
  [[ "${TARGET_PORT}" =~ ^[0-9]+$ ]] || die "--target-port must be numeric"
  [[ "${LISTEN_PORT}" =~ ^[0-9]+$ ]] || die "--listen-port must be numeric"
  [[ "${LISTEN_PORT}" -ge 1 && "${LISTEN_PORT}" -le 65535 ]] || die "--listen-port out of range"
  [[ "${TARGET_PORT}" -ge 1 && "${TARGET_PORT}" -le 65535 ]] || die "--target-port out of range"
  [[ "${XHTTP_PATH}" == /* ]] || die "--path must start with /"

  if [[ -z "${SERVER_NAME}" ]]; then
    SERVER_NAME="${TARGET_HOST}"
  fi
}

install_dependencies() {
  log "Installing required packages"
  apt update
  apt install -y curl wget unzip tar openssl ca-certificates
}

install_xray() {
  log "Installing/upgrading Xray via official XTLS/Xray-install"
  bash -c "$(curl -fsSL https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
  systemctl enable xray >/dev/null
}

validate_target() {
  TLS_PING_LOG="${STATE_DIR}/tls-ping.txt"
  if [[ "${SKIP_TLS_PING}" == "1" ]]; then
    log "Skipping xray tls ping validation"
    return
  fi

  log "Validating REALITY target with xray tls ping"
  mkdir -p "${STATE_DIR}"
  if ! xray tls ping "${TARGET_HOST}" | tee "${TLS_PING_LOG}"; then
    die "xray tls ping failed for ${TARGET_HOST}"
  fi

  if ! grep -q "Handshake succeeded" "${TLS_PING_LOG}"; then
    die "xray tls ping did not report a successful handshake for ${TARGET_HOST}"
  fi

  if ! grep -Fq "${SERVER_NAME}" "${TLS_PING_LOG}"; then
    die "server name ${SERVER_NAME} was not found in xray tls ping output for ${TARGET_HOST}"
  fi
}

generate_secrets() {
  log "Generating UUID, REALITY keys and shortId"

  UUID="$(xray uuid)"
  X25519_OUTPUT="$(xray x25519)"

  PRIVATE_KEY="$(printf '%s\n' "${X25519_OUTPUT}" | awk -F': ' '/^PrivateKey:/ {print $2}')"
  CLIENT_KEY="$(printf '%s\n' "${X25519_OUTPUT}" | awk -F': ' '/^(PublicKey|Password):/ {print $2; exit}')"
  SHORT_ID="$(openssl rand -hex 8)"

  [[ -n "${UUID}" ]] || die "failed to generate UUID"
  [[ -n "${PRIVATE_KEY}" ]] || die "failed to parse PrivateKey from xray x25519 output"
  [[ -n "${CLIENT_KEY}" ]] || die "failed to parse client key from xray x25519 output"
  [[ -n "${SHORT_ID}" ]] || die "failed to generate shortId"
}

detect_public_ip() {
  if [[ -n "${PUBLIC_IP}" ]]; then
    return
  fi

  log "Detecting VPS public IPv4"
  PUBLIC_IP="$(curl -fsS4 ifconfig.me || true)"
  if [[ -z "${PUBLIC_IP}" ]]; then
    PUBLIC_IP="$(curl -fsS4 https://api.ipify.org || true)"
  fi
  [[ -n "${PUBLIC_IP}" ]] || die "failed to detect public IPv4, pass it manually via --public-ip"
}

backup_config() {
  mkdir -p "${STATE_DIR}"
  if [[ -f "${CONFIG_PATH}" ]]; then
    BACKUP_PATH="${STATE_DIR}/config.json.bak.$(date +%F-%H%M%S)"
    cp "${CONFIG_PATH}" "${BACKUP_PATH}"
    log "Existing config backed up to ${BACKUP_PATH}"
  else
    BACKUP_PATH=""
  fi
}

write_config() {
  log "Writing Xray config to ${CONFIG_PATH}"
  mkdir -p "${CONFIG_DIR}"

  cat > "${CONFIG_PATH}" <<EOF
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": ${LISTEN_PORT},
      "protocol": "vless",
      "settings": {
        "clients": [
          {
            "id": "${UUID}"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "xhttp",
        "security": "reality",
        "xhttpSettings": {
          "path": "${XHTTP_PATH}"
        },
        "realitySettings": {
          "show": false,
          "target": "${TARGET_HOST}:${TARGET_PORT}",
          "serverNames": [
            "${SERVER_NAME}"
          ],
          "privateKey": "${PRIVATE_KEY}",
          "shortIds": [
            "${SHORT_ID}"
          ]
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": [
          "http",
          "tls",
          "quic"
        ]
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "tag": "direct"
    },
    {
      "protocol": "blackhole",
      "tag": "block"
    }
  ]
}
EOF
}

test_and_restart() {
  log "Validating Xray config"
  if ! xray run -test -config "${CONFIG_PATH}"; then
    restore_backup
    die "xray config test failed"
  fi

  log "Restarting Xray"
  if ! systemctl restart xray; then
    restore_backup
    die "failed to restart xray"
  fi

  if ! systemctl is-active --quiet xray; then
    restore_backup
    die "xray service is not active after restart"
  fi
}

open_firewall_if_needed() {
  if command -v ufw >/dev/null 2>&1; then
    if ufw status 2>/dev/null | grep -q "^Status: active"; then
      log "Opening ${LISTEN_PORT}/tcp in ufw"
      ufw allow "${LISTEN_PORT}/tcp" >/dev/null
    fi
  fi
}

save_outputs() {
  mkdir -p "${STATE_DIR}"

  local encoded_sni encoded_fp encoded_spx encoded_path encoded_name encoded_pbk
  encoded_sni="$(urlencode "${SERVER_NAME}")"
  encoded_fp="$(urlencode "${FINGERPRINT}")"
  encoded_spx="$(urlencode "${SPIDER_X}")"
  encoded_path="$(urlencode "${XHTTP_PATH}")"
  encoded_name="$(urlencode "${PROFILE_NAME}")"
  encoded_pbk="$(urlencode "${CLIENT_KEY}")"

  VLESS_URL="vless://${UUID}@${PUBLIC_IP}:${LISTEN_PORT}?encryption=none&security=reality&sni=${encoded_sni}&fp=${encoded_fp}&pbk=${encoded_pbk}&sid=${SHORT_ID}&spx=${encoded_spx}&type=xhttp&path=${encoded_path}#${encoded_name}"

  cat > "${STATE_DIR}/client-info.txt" <<EOF
Server IP: ${PUBLIC_IP}
Listen port: ${LISTEN_PORT}
Protocol: VLESS
Network: xhttp
Path: ${XHTTP_PATH}
Security: reality
Server Name / SNI: ${SERVER_NAME}
Fingerprint: ${FINGERPRINT}
UUID: ${UUID}
Private Key (server only): ${PRIVATE_KEY}
Client key (pbk / "Public Key" in many clients): ${CLIENT_KEY}
Short ID: ${SHORT_ID}
SpiderX: ${SPIDER_X}
Profile name: ${PROFILE_NAME}

VLESS URL:
${VLESS_URL}
EOF
}

print_summary() {
  cat <<EOF

Bootstrap complete.

Saved files:
  Config:       ${CONFIG_PATH}
  Client info:  ${STATE_DIR}/client-info.txt
  TLS ping log: ${STATE_DIR}/tls-ping.txt

Server settings:
  Target:       ${TARGET_HOST}:${TARGET_PORT}
  Server name:  ${SERVER_NAME}
  Listen port:  ${LISTEN_PORT}
  XHTTP path:   ${XHTTP_PATH}

Client values:
  Address:      ${PUBLIC_IP}
  Port:         ${LISTEN_PORT}
  UUID:         ${UUID}
  Security:     reality
  Network:      xhttp
  Path:         ${XHTTP_PATH}
  SNI:          ${SERVER_NAME}
  Fingerprint:  ${FINGERPRINT}
  Public Key:   ${CLIENT_KEY}
  Short ID:     ${SHORT_ID}
  SpiderX:      ${SPIDER_X}

VLESS URL:
${VLESS_URL}
EOF
}

main() {
  require_root
  parse_args "$@"
  validate_args
  install_dependencies
  install_xray
  validate_target
  generate_secrets
  detect_public_ip
  backup_config
  write_config
  test_and_restart
  open_firewall_if_needed
  save_outputs
  print_summary
}

main "$@"

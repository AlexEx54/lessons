#!/usr/bin/env bash
# Записывает ключи приложения Яндекс ID в .env.
#   npm run yandex:setup           — локальный .env (redirect на http://127.0.0.1:8787)
#   npm run yandex:setup -- prod   — .env на VPS (redirect на боевой домен)

set -Eeuo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

SERVER_HOST=${SERVER_HOST:-179.254.163.97}
SERVER_PORT=${SERVER_PORT:-22}
SERVER_USER=${SERVER_USER:-root}
APP_DIR=${APP_DIR:-/opt/teach_platform}
PUBLIC_URL=${PUBLIC_URL:-https://www.easyclass-edu.ru}
LOCAL_URL=${LOCAL_URL:-http://127.0.0.1:8787}
CALLBACK_PATH=/api/auth/yandex/callback
TARGET=${1:-local}

fail() {
  printf '\nОшибка: %s\n' "$*" >&2
  exit 1
}

# Replaces KEY=... in the file or appends it. `cat >` keeps the file's owner and mode.
upsert_env() {
  local file=$1 key=$2 value=$3 temporary
  temporary=$(mktemp "${file}.XXXXXX")
  grep -v "^${key}=" "$file" > "$temporary" || true
  printf '%s=%s\n' "$key" "$value" >> "$temporary"
  cat "$temporary" > "$file"
  rm -f "$temporary"
}

case "$TARGET" in
  local) REDIRECT_URI="${LOCAL_URL}${CALLBACK_PATH}" ;;
  prod) REDIRECT_URI="${PUBLIC_URL}${CALLBACK_PATH}" ;;
  *) fail "неизвестная цель «${TARGET}». Используйте local или prod" ;;
esac

printf 'Ключи Яндекс ID → %s\nRedirect URI: %s\n\n' "$TARGET" "$REDIRECT_URI"
read -rp 'ClientID: ' CLIENT_ID
read -rsp 'Client secret (ввод скрыт): ' CLIENT_SECRET
printf '\n'

[[ "$CLIENT_ID" =~ ^[A-Za-z0-9]+$ ]] || fail 'ClientID должен состоять из латинских букв и цифр'
[[ "$CLIENT_SECRET" =~ ^[A-Za-z0-9]+$ ]] || fail 'Client secret должен состоять из латинских букв и цифр'

if [[ "$TARGET" == local ]]; then
  ENV_FILE="$ROOT_DIR/.env"
  touch "$ENV_FILE"
  upsert_env "$ENV_FILE" YANDEX_CLIENT_ID "$CLIENT_ID"
  upsert_env "$ENV_FILE" YANDEX_CLIENT_SECRET "$CLIENT_SECRET"
  upsert_env "$ENV_FILE" YANDEX_REDIRECT_URI "$REDIRECT_URI"
  printf '\nГотово: %s обновлён.\n' "$ENV_FILE"
  printf 'Перезапустите npm run dev и открывайте %s (не localhost: иначе cookie не совпадёт с адресом возврата).\n' "$LOCAL_URL"
  exit 0
fi

# The secret goes over SSH stdin, so it never appears in a process list or shell history.
ENV_FILE="$APP_DIR/.env"
ssh -p "$SERVER_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
  "${SERVER_USER}@${SERVER_HOST}" bash -s <<REMOTE_SCRIPT
set -Eeuo pipefail
$(declare -f upsert_env)
[[ -f $(printf '%q' "$ENV_FILE") ]] || { echo 'Не найден $ENV_FILE на сервере' >&2; exit 1; }
upsert_env $(printf '%q' "$ENV_FILE") YANDEX_CLIENT_ID $(printf '%q' "$CLIENT_ID")
upsert_env $(printf '%q' "$ENV_FILE") YANDEX_CLIENT_SECRET $(printf '%q' "$CLIENT_SECRET")
upsert_env $(printf '%q' "$ENV_FILE") YANDEX_REDIRECT_URI $(printf '%q' "$REDIRECT_URI")
REMOTE_SCRIPT

printf '\nГотово: %s на %s обновлён.\n' "$ENV_FILE" "$SERVER_HOST"
printf 'Ключи подхватятся при следующем npm run deploy (он перезапускает сервис).\n'

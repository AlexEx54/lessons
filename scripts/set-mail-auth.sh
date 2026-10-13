#!/usr/bin/env bash
# Записывает SMTP-доступ ящика, с которого платформа шлёт коды регистрации, в .env и проверяет вход.
#   npm run mail:setup           — локальный .env
#   npm run mail:setup -- prod   — .env на VPS

set -Eeuo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

SERVER_HOST=${SERVER_HOST:-179.254.163.97}
SERVER_PORT=${SERVER_PORT:-22}
SERVER_USER=${SERVER_USER:-root}
APP_DIR=${APP_DIR:-/opt/teach_platform}
SMTP_HOST=${SMTP_HOST:-mail.easyclass-edu.ru}
SMTP_PORT=${SMTP_PORT:-465}
DEFAULT_SMTP_USER=noreply@easyclass-edu.ru
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

[[ "$TARGET" == local || "$TARGET" == prod ]] || fail "неизвестная цель «${TARGET}». Используйте local или prod"

printf 'SMTP для кодов регистрации → %s (%s:%s)\n\n' "$TARGET" "$SMTP_HOST" "$SMTP_PORT"
read -rp "Логин [${DEFAULT_SMTP_USER}]: " SMTP_USER
SMTP_USER=${SMTP_USER:-$DEFAULT_SMTP_USER}
IFS= read -rsp 'Пароль ящика (ввод скрыт): ' SMTP_PASSWORD
printf '\n'
IFS= read -rsp 'Повторите пароль: ' SMTP_PASSWORD_CONFIRM
printf '\n'

[[ "$SMTP_USER" =~ ^[A-Za-z0-9._@-]+$ ]] || fail 'логин может содержать только латиницу, цифры и символы . _ @ -'
[[ -n "$SMTP_PASSWORD" ]] || fail 'пароль пустой'
[[ "$SMTP_PASSWORD" == "$SMTP_PASSWORD_CONFIRM" ]] || fail 'пароли не совпадают'

# lib/env.js trims the line and strips one pair of outer quotes, so quoting keeps
# spaces and any symbols of the password intact.
QUOTED_PASSWORD="\"${SMTP_PASSWORD}\""
LOGIN_HINT="Если вход не прошёл, проверьте пароль или повторите с логином ${SMTP_USER%%@*} вместо ${SMTP_USER}."

if [[ "$TARGET" == local ]]; then
  ENV_FILE="$ROOT_DIR/.env"
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  upsert_env "$ENV_FILE" SMTP_HOST "$SMTP_HOST"
  upsert_env "$ENV_FILE" SMTP_PORT "$SMTP_PORT"
  upsert_env "$ENV_FILE" SMTP_USER "$SMTP_USER"
  upsert_env "$ENV_FILE" SMTP_PASSWORD "$QUOTED_PASSWORD"
  printf '\n%s обновлён. Проверяю вход…\n' "$ENV_FILE"
  node "$ROOT_DIR/scripts/check-smtp.js" || fail "$LOGIN_HINT"
  printf 'Локальный сервер теперь шлёт настоящие письма; перезапустите npm run dev.\n'
  exit 0
fi

# The password goes over SSH stdin, so it never appears in a process list or shell history.
ENV_FILE="$APP_DIR/.env"
ssh -p "$SERVER_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
  "${SERVER_USER}@${SERVER_HOST}" bash -s <<REMOTE_SCRIPT || fail "$LOGIN_HINT"
set -Eeuo pipefail
$(declare -f upsert_env)
[[ -f $(printf '%q' "$ENV_FILE") ]] || { echo 'Не найден $ENV_FILE на сервере' >&2; exit 1; }
upsert_env $(printf '%q' "$ENV_FILE") SMTP_HOST $(printf '%q' "$SMTP_HOST")
upsert_env $(printf '%q' "$ENV_FILE") SMTP_PORT $(printf '%q' "$SMTP_PORT")
upsert_env $(printf '%q' "$ENV_FILE") SMTP_USER $(printf '%q' "$SMTP_USER")
upsert_env $(printf '%q' "$ENV_FILE") SMTP_PASSWORD $(printf '%q' "$QUOTED_PASSWORD")
echo '$ENV_FILE обновлён.'
if [[ -f $(printf '%q' "$APP_DIR/scripts/check-smtp.js") ]]; then
  echo 'Проверяю вход…'
  /usr/bin/node $(printf '%q' "$APP_DIR/scripts/check-smtp.js")
else
  echo 'На сервере ещё старая версия: вход проверится после npm run deploy командой'
  echo '  ssh root@$SERVER_HOST "node $APP_DIR/scripts/check-smtp.js"'
fi
REMOTE_SCRIPT

printf 'Настройки подхватятся при следующем npm run deploy (он перезапускает сервис).\n'

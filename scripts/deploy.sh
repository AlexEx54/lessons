#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

SERVER_HOST=${SERVER_HOST:-144.31.76.176}
SERVER_PORT=${SERVER_PORT:-4537}
SERVER_USER=${SERVER_USER:-root}
APP_DIR=${APP_DIR:-/opt/teach_platform}
STAGING_DIR=${STAGING_DIR:-/opt/teach_platform.next}
LESSONS_DIR=${LESSONS_DIR:-/var/lib/teach_platform/lessons}
SERVICE_NAME=${SERVICE_NAME:-teach-platform.service}
PUBLIC_URL=${PUBLIC_URL:-https://grekko.duckdns.org:8444}
ALLOW_DIRTY=${ALLOW_DIRTY:-0}
BACKUP_RETENTION=${BACKUP_RETENTION:-5}

SSH_TARGET="${SERVER_USER}@${SERVER_HOST}"
SSH_OPTIONS=(-p "$SERVER_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf '\nОшибка: %s\n' "$*" >&2
  exit 1
}

for command_name in git npm rsync ssh curl; do
  command -v "$command_name" >/dev/null 2>&1 || fail "не найдена команда $command_name"
done

if [[ ! "$BACKUP_RETENTION" =~ ^[1-9][0-9]*$ ]]; then
  fail "BACKUP_RETENTION должен быть положительным целым числом"
fi

if [[ "$ALLOW_DIRTY" != "1" ]] && [[ -n "$(git status --porcelain)" ]]; then
  fail "есть незакоммиченные изменения. Сначала закоммитьте их или запустите ALLOW_DIRTY=1 npm run deploy"
fi

log "Локальные проверки"
npm run check

log "Загрузка во временный каталог ${SSH_TARGET}:${STAGING_DIR}"
rsync -az --delete \
  -e "ssh -p ${SERVER_PORT} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10" \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='data/' \
  --exclude='tmp/' \
  --exclude='.DS_Store' \
  ./ "${SSH_TARGET}:${STAGING_DIR}/"

log "Серверные проверки и переключение версии"
ssh "${SSH_OPTIONS[@]}" "$SSH_TARGET" bash -s -- \
  "$APP_DIR" "$STAGING_DIR" "$LESSONS_DIR" "$SERVICE_NAME" "$BACKUP_RETENTION" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

APP_DIR=$1
STAGING_DIR=$2
LESSONS_DIR=$3
SERVICE_NAME=$4
BACKUP_RETENTION=$5
NODE=/usr/bin/node
BACKUP_DIR=/root/deploy-backups

if [[ ! -x "$NODE" ]]; then
  echo "Node.js не найден: $NODE" >&2
  exit 1
fi

node_major=$($NODE -p 'Number(process.versions.node.split(".")[0])')
node_minor=$($NODE -p 'Number(process.versions.node.split(".")[1])')
if (( node_major < 24 || (node_major == 24 && node_minor < 15) )); then
  echo "Требуется Node.js 24.15 или новее, установлена: $($NODE --version)" >&2
  exit 1
fi

chown -R teachplatform:teachplatform "$STAGING_DIR"
cd "$STAGING_DIR"

check_files=(
  server.js
  assets/login.js
  assets/app-shell.js
  assets/home.js
  assets/library.js
  assets/lesson-editor.js
  assets/components/this-or-that.js
  assets/components/audio-player.js
  lib/app-shell.js
  lib/auth.js
  lib/db.js
  lib/password.js
  lib/session-store.js
  lib/user-store.js
  lib/lesson-draft-store.js
  lib/synthetic-lesson.js
  scripts/create-user.js
  generate-lesson.js
  lib/lesson-build.js
  lib/lesson-store.js
  lib/openrouter-lesson.js
  lib/lesson-validate.js
)

for file in "${check_files[@]}"; do
  "$NODE" --check "$file"
done
"$NODE" --test test/app-shell.test.js

env HOST=127.0.0.1 PORT=8788 LESSONS_DIR="$LESSONS_DIR" \
  "$NODE" server.js >/tmp/teach-platform-next.log 2>&1 &
stage_pid=$!

stop_stage() {
  kill "$stage_pid" 2>/dev/null || true
  wait "$stage_pid" 2>/dev/null || true
}
trap stop_stage EXIT

stage_ready=0
for _ in {1..15}; do
  if curl -fsS --max-time 2 http://127.0.0.1:8788/ >/tmp/teach-platform-next-home.html; then
    stage_ready=1
    break
  fi
  sleep 1
done

if [[ "$stage_ready" != "1" ]]; then
  cat /tmp/teach-platform-next.log >&2
  echo "Временная версия не запустилась" >&2
  exit 1
fi

curl -fsS --max-time 5 http://127.0.0.1:8788/health >/dev/null
curl -fsS --max-time 5 http://127.0.0.1:8788/library.html >/dev/null
curl -fsS --max-time 5 http://127.0.0.1:8788/api/lessons >/dev/null
stop_stage
trap - EXIT

stamp=$(date +%Y%m%d-%H%M%S)
install -d -m 700 "$BACKUP_DIR"
tar -C "$(dirname "$APP_DIR")" -czf "$BACKUP_DIR/teach_platform-app-$stamp.tar.gz" "$(basename "$APP_DIR")"
tar -C "$(dirname "$(dirname "$LESSONS_DIR")")" -czf "$BACKUP_DIR/teach_platform-data-$stamp.tar.gz" "$(basename "$(dirname "$LESSONS_DIR")")"
chmod 600 "$BACKUP_DIR/teach_platform-app-$stamp.tar.gz" "$BACKUP_DIR/teach_platform-data-$stamp.tar.gz"

PREVIOUS_DIR="${APP_DIR}.previous"
rm -rf "$PREVIOUS_DIR"
cp -a "$APP_DIR" "$PREVIOUS_DIR"

rsync -a --delete --exclude=.env --exclude=data/ "$STAGING_DIR/" "$APP_DIR/"
chown -R teachplatform:teachplatform "$APP_DIR"
chmod 600 "$APP_DIR/.env"

rollback() {
  echo "Проверка новой версии не прошла, выполняется откат" >&2
  systemctl stop "$SERVICE_NAME" || true
  rm -rf "$APP_DIR"
  mv "$PREVIOUS_DIR" "$APP_DIR"
  systemctl start "$SERVICE_NAME"
}

systemctl restart "$SERVICE_NAME"

live_ready=0
for _ in {1..15}; do
  if curl -fsS --max-time 2 http://127.0.0.1:8787/health >/dev/null; then
    live_ready=1
    break
  fi
  sleep 1
done

if [[ "$live_ready" != "1" ]]; then
  rollback
  exit 1
fi

if ! curl -fsS --max-time 5 http://127.0.0.1:8787/ >/dev/null \
  || ! curl -fsS --max-time 5 http://127.0.0.1:8787/library.html >/dev/null \
  || ! curl -fsS --max-time 5 http://127.0.0.1:8787/api/lessons >/dev/null; then
  rollback
  exit 1
fi

systemctl is-active --quiet "$SERVICE_NAME"

backup_number=0
while IFS= read -r app_backup; do
  backup_number=$((backup_number + 1))
  if (( backup_number > BACKUP_RETENTION )); then
    backup_stamp=${app_backup##*/teach_platform-app-}
    backup_stamp=${backup_stamp%.tar.gz}
    rm -f "$app_backup" "$BACKUP_DIR/teach_platform-data-$backup_stamp.tar.gz"
  fi
done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'teach_platform-app-*.tar.gz' | sort -r)

echo "Сервис активен. Резервная копия: $stamp"
REMOTE_SCRIPT

log "Внешняя проверка ${PUBLIC_URL}"
curl -fsS --max-time 10 "${PUBLIC_URL}/health" >/dev/null
curl -fsS --max-time 10 "${PUBLIC_URL}/" >/dev/null
curl -fsS --max-time 10 "${PUBLIC_URL}/library.html" >/dev/null

commit=$(git rev-parse --short HEAD)
log "Готово: версия ${commit} опубликована на ${PUBLIC_URL}"

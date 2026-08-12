# Deploy

## VPS

The production VPS uses SSH key authentication. To deploy the current committed version:

```bash
npm run deploy
```

The script runs local and remote checks, tests a staging copy on port `8788`, creates
application and lesson-data backups in `/root/deploy-backups`, restarts the systemd
service, and rolls back automatically if the new version fails its health checks.
The five most recent backup pairs are retained by default; older pairs are removed only
after a successful deployment. Override this with `BACKUP_RETENTION`, for example:

```bash
BACKUP_RETENTION=10 npm run deploy
```

Deploying a dirty working tree is blocked by default. To deploy it intentionally:

```bash
ALLOW_DIRTY=1 npm run deploy
```

Connection and path settings can be overridden when needed:

```bash
SERVER_HOST=144.31.76.176 SERVER_PORT=4537 PUBLIC_URL=https://grekko.duckdns.org:8444 npm run deploy
```

The script never uploads the local `.env` or `data/` directory. Production secrets and
generated lessons remain on the server.

## Environment

Set these environment variables in the production `.env` on the VPS:

- `OPENROUTER_API_KEY`: your OpenRouter API key.
- `APP_DB_PATH`: SQLite database path. Use `/var/lib/teach_platform/app.sqlite` in production.
- `LESSONS_DIR`: optional. Defaults to `./data/lessons`.
- `DRAFT_ASSETS_DIR`: optional. Каталог изображений черновиков; в production используйте `/var/lib/teach_platform/draft-assets`.
- `USD_RUB_RATE`: optional. Defaults to `83`.
- `OPENROUTER_MODEL`: optional. Defaults to `deepseek/deepseek-v4-flash`.
- `OPENROUTER_REASONING_EFFORT`: optional. Defaults to `xhigh` (max reasoning for DeepSeek V4 Flash).

Open `/` for the public landing. Authenticated teachers use `/app` for the dashboard
and the deprecated `/generator` reference page. The legacy generator remains functional for internal comparison, but must not be linked from new product flows; see `docs/legacy-generator.md`.

The server requires Node.js 24.15 or newer. After the first deploy, create a teacher:

```bash
cd /opt/teach_platform
npm run user:create -- --email teacher@example.com --name "Teacher name"
```

Open `/login` to sign in. The public landing remains at `/`, and the authenticated
teacher dashboard is available at `/app`.

Authentication cookies require HTTPS in production. Put the Node.js service behind
an HTTPS reverse proxy before creating real teacher accounts.

For local development, copy `.env.example` to `.env` and replace `OPENROUTER_API_KEY`
with your OpenRouter key. The server loads `.env` automatically on start.

## Teacher and student links

- Teacher link:
  - `https://YOUR-DOMAIN/lesson/LESSON_ID?role=teacher&room=a2-lesson`
- Student link (auto-connect):
  - `https://YOUR-DOMAIN/lesson/LESSON_ID?role=student&room=a2-lesson&autoconnect=1`

Room value can be any code (for example, `maria-friday`).

The deprecated generator dashboard still creates teacher/student links automatically for legacy reference and regression checks.

## How to run lesson

1. Open teacher link on your device.
2. Open student link on student device.
3. In both tabs, if needed, click **Connect**.
4. Use **Teacher Dashboard**:
   - send student to section (`Warm-Up`, `Grammar`, etc.)
   - highlight by CSS selector (example: `#exercise-2`)
   - spotlight target vocabulary words.
   - student sees teacher cursor in real time.
   - teacher still sees student cursor in real time.

## In Miro

1. On Miro board choose embed website option.
2. Paste teacher or student link.
3. Use different room codes for parallel students.

## Notes

- Realtime sync is in-memory (single app instance). Keep one running web instance for one class room namespace.
- Generated lesson storage is file-based; production lessons remain on the VPS.

# Deploy

Draw Things image generation from the VPS uses a localhost-only reverse SSH tunnel.
Setup, usage, and troubleshooting are documented in
[`docs/drawthings-grpc-tunnel.md`](docs/drawthings-grpc-tunnel.md).

## VPS

The production VPS uses SSH key authentication. To deploy the current committed version:

```bash
npm run deploy
```

The script runs local checks, tests a staging copy on port `8788`, creates application
and persistent-data backups in `/root/deploy-backups`, restarts the systemd service,
and rolls back automatically if the new version fails its health checks. The five most
recent backup pairs are retained by default. Override this with `BACKUP_RETENTION`:

```bash
BACKUP_RETENTION=10 npm run deploy
```

Deploying a dirty working tree is blocked by default. To deploy it intentionally:

```bash
ALLOW_DIRTY=1 npm run deploy
```

Connection, path, and public URL settings can be overridden when needed:

```bash
SERVER_HOST=144.31.76.176 SERVER_PORT=4537 APP_DATA_DIR=/var/lib/teach_platform PUBLIC_URL=https://grekko.duckdns.org:8444 npm run deploy
```

`APP_DATA_DIR` defaults to `/var/lib/teach_platform` and identifies the persistent
directory included in deployment backups. The script never uploads the local `.env`,
`data/`, or `tmp/` directories.

## Environment

Set these environment variables in the production `.env` on the VPS:

- `APP_DB_PATH`: SQLite database path. Use `/var/lib/teach_platform/app.sqlite` in production.
- `DRAFT_ASSETS_DIR`: images and audio uploaded to lesson drafts. Use `/var/lib/teach_platform/draft-assets` in production.
- `OPENROUTER_API_KEY`: server-side OpenRouter key used for AI lesson generation.
- `OPENROUTER_BASE_URL`: optional API base URL; defaults to `https://openrouter.ai/api/v1`.
- `OPENROUTER_SITE_URL` and `OPENROUTER_APP_NAME`: optional attribution headers sent to OpenRouter.
- `DRAWTHINGS_GRPC_ADDRESS`: Draw Things gRPC endpoint; production tunnel default is `127.0.0.1:17859`.
- `DRAWTHINGS_CONNECT_TIMEOUT_MS`: fast availability-check deadline; defaults to 2000 ms.
- `DRAWTHINGS_MODEL`, `DRAWTHINGS_LORA`, and `DRAWTHINGS_LORA_WEIGHT`: exact installed Qwen Image 2512/Lightning filenames and weight.
- `DRAWTHINGS_CONFIG_JSON`: optional generation-config overrides. Output size and batch size are always forced to one `512×512` PNG.
- `DRAWTHINGS_NEGATIVE_PROMPT`: optional negative prompt override.
- `WEBRTC_STUN_URLS`: comma-separated STUN URLs; defaults to Google's public STUN endpoint.
- `WEBRTC_TURN_URLS`: comma-separated coturn URLs, normally UDP and TCP variants.
- `WEBRTC_TURN_SHARED_SECRET`: the coturn `static-auth-secret` used to create temporary credentials.
- `WEBRTC_TURN_CREDENTIAL_TTL_SECONDS`: temporary TURN credential lifetime; defaults to one hour.
- `YANDEX_CLIENT_ID` and `YANDEX_CLIENT_SECRET`: Yandex ID app credentials from oauth.yandex.ru (scopes `login:email`, `login:info`).
- `YANDEX_REDIRECT_URI`: must exactly match a Redirect URI of that app; production is `https://www.easyclass-edu.ru/api/auth/yandex/callback`. Without these three variables the «Войти с Яндекс ID» button returns to `/login` with an error.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`: mailbox that sends registration codes; production is `mail.easyclass-edu.ru`, `465`, `noreply@easyclass-edu.ru` and that mailbox's password (see «Mail»). Without them registration answers «Не удалось отправить письмо с кодом».
- `MAIL_FROM`: optional sender header; defaults to `EasyClass <SMTP_USER>`.

## Caddy

[`deploy/caddy/Caddyfile`](deploy/caddy/Caddyfile) is the source of truth for
`/etc/caddy/Caddyfile`; `npm run deploy` does not install it. The canonical host is
`www.easyclass-edu.ru`: the session cookie is host-only, so the bare domain only
redirects there. Before applying a change, make sure no lesson or call is live,
because a reload drops open WebSockets:

```bash
scp deploy/caddy/Caddyfile root@179.254.163.97:/etc/caddy/Caddyfile
ssh root@179.254.163.97 'caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy'
```

## Video calls

The application handles WebRTC signaling at `/ws/video-calls/:id` and live lesson
synchronization at `/ws/sessions/:id`. Both currently require a single application
process (participant connections are held in memory). The HTTPS reverse
proxy must forward WebSocket upgrades and keep these connections open. A typical nginx
location uses HTTP/1.1 together with `Upgrade` and `Connection` proxy headers.

Production calls require a coturn instance reachable from browsers. Configure coturn
with `use-auth-secret`, set `static-auth-secret` to the same random value as
`WEBRTC_TURN_SHARED_SECRET`, and expose port 3478 over UDP and TCP plus the configured
relay port range. For restrictive mobile networks, also configure a valid certificate,
expose TLS port 5349/TCP, and add `turns:turn.example.com:5349?transport=tcp` to
`WEBRTC_TURN_URLS`. Without TURN, calls remain available for local development but may
fail behind strict NAT or firewalls.

The production timer in `deploy/systemd/teach-platform-turn-cert-sync.timer` copies the
renewed Caddy certificate into `/etc/turnserver-certs` every 12 hours and restarts
coturn only when the certificate changed. Its defaults target the current production
Caddy volume and can be overridden with `TURN_DOMAIN`, `CADDY_DATA_DIR`, and
`TURN_CERT_DIR` in the service environment.

The Draw Things client is pinned to a reviewed GitHub commit because its documented
`dt-grpc-ts` npm package is not currently published. Deployment installs the lockfile
with `npm ci`; keep `package-lock.json` in sync whenever the pinned commit changes.

The server requires Node.js 24.15 or newer. Open `/` for the public landing and `/app`
for the authenticated teacher dashboard.

After the first deploy, create a teacher:

```bash
cd /opt/teach_platform
npm run user:create -- --email teacher@example.com --name "Teacher name"
```

Authentication cookies require HTTPS in production. Put the Node.js service behind
an HTTPS reverse proxy before creating real teacher accounts.

For local development, copy `.env.example` to `.env`. The server loads it automatically
on start.

### Video call chat storage

Chat tables are installed by migration `014-video-call-chat.sql`. Attachments default
to `video-call-files/` next to `APP_DB_PATH` (inside the persistent data directory).
`VIDEO_CALL_FILES_DIR` can override this location; include that directory in backups
if it is outside `APP_DATA_DIR`. Keep it outside any public static directory.
The reverse proxy must allow request bodies of at least 25 MiB (for nginx,
`client_max_body_size 26m;`). Uploads stream to disk; limits are 25 MiB per file,
5 attachments per message and 250 MiB per call, including pending uploads.
Unsent uploads expire after 24 hours and are cleaned hourly and on server startup.
Clearing call history removes messages and attachment directories; startup/hourly
cleanup retries removal of directories whose calls no longer exist.

The current guest invite remains a read-only archive link after a call ends or
expires, until its owner clears the history. Rotating an active invite still
revokes the previous link. Archive requests do not provide ICE credentials or
permit WebSocket/video access. Anyone holding the current link can read the chat
and download its attachments.

### Watch & interact videos

Install `ffprobe` (provided by the `ffmpeg` package) on the server, or set
`FFPROBE_PATH` to its executable. Upload validation accepts MP4 with H.264 video
and optional AAC audio, up to 300 MiB. No transcoding is performed.
The reverse proxy must permit 300 MiB request bodies (nginx:
`client_max_body_size 300m;`) and allow sufficient upload time.

Video uploads stream into `DRAFT_ASSETS_DIR`. Published immutable copies live in
`DRAFT_ASSETS_DIR/_videos`; MP4 rows in `library_assets` and `class_assets` contain
small JSON file references instead of video bytes. Class sessions share the published
file. Back up this directory together with SQLite. Do not delete published files
when replacing draft videos: existing class sessions still reference them. Automatic
collection of unreferenced published videos is not implemented.

Class media signals use the existing authenticated class WebSocket. Play/pause
contains no position; seeking stays local. Only the teacher can align the student
to the teacher's position. Student status is transient; playback is paused on
stage changes and disconnection and is not restored as playing after reconnect.

## Mail

Stalwart runs on the same VPS and receives mail for `easyclass-edu.ru`
(`support@`, `noreply@`). Caddy keeps ports 80/443, obtains the certificate for
`mail.easyclass-edu.ru`, and `teach-platform-mail-cert-sync.timer` copies it to
`/etc/stalwart/certs` every 12 hours, restarting Stalwart when it changes.
Public ports: 25 (SMTP), 465 (submission over TLS), 993 (IMAP over TLS). The admin
UI listens on `127.0.0.1:8080` only. The platform sends through
`mail.easyclass-edu.ru:465` like any other client.

Paths: binary `/usr/local/bin/stalwart`, bootstrap config `/etc/stalwart/config.json`,
environment `/etc/stalwart/stalwart.env`, data `/var/lib/stalwart`. Domains, accounts,
listeners, DKIM keys and certificates live in Stalwart's own database and are managed
in its admin UI.

### First installation

1. DNS at Beget: `A mail.easyclass-edu.ru → 179.254.163.97`. In the u1host panel set
   the PTR of `179.254.163.97` to `mail.easyclass-edu.ru`.
2. Make sure the `mail.easyclass-edu.ru` site from
   [`deploy/caddy/Caddyfile`](deploy/caddy/Caddyfile) is applied, so Caddy issues
   the certificate (see [Caddy](#caddy)).

3. Deploy the repository, then on the server run
   `/opt/teach_platform/scripts/install-stalwart.sh` and
   `systemctl start teach-platform-mail-cert-sync.service`.
4. Open the admin UI through an SSH tunnel:
   `ssh -L 8080:127.0.0.1:8080 root@179.254.163.97`, then `http://127.0.0.1:8080/admin`.
   Sign in as `admin` with the temporary password from
   `journalctl -u stalwart --no-pager | grep -m1 'password:'`.
5. In the setup wizard use hostname `mail.easyclass-edu.ru`, default domain
   `easyclass-edu.ru`, RocksDB storage (32 MB write buffer, 64 MB block cache), the
   internal directory and manual DNS management. Turn off the automatic TLS
   certificate (port 443 belongs to Caddy) and keep DKIM key generation on. The wizard
   shows the permanent `admin@easyclass-edu.ru` password once; save it, then
   `systemctl restart stalwart`.
6. After setup, in Settings: add a TLS certificate read from the files
   `/etc/stalwart/certs/mail.easyclass-edu.ru.crt` and `.key` and make it the default
   certificate (Network → General); delete the `https`, `pop3s` and `sieve` listeners;
   bind the `http` listener to `127.0.0.1:8080`. Restart Stalwart.
7. In Directory → Accounts create `support` (aliases `dmarc`, `postmaster`, `abuse`)
   and `noreply`, and set their passwords. Domains → ⋯ → View Zone File lists the DKIM
   records to publish. In Domains → DKIM Signatures set the Ed25519 key to "scheduled
   for DNS publication and not yet active": Yandex reports `dkim=neutral` for messages
   that carry an Ed25519 signature, so only the RSA key signs.

### DNS records

Switch MX only after mail flows end to end:

| Name | Type | Value |
| --- | --- | --- |
| `mail` | A | `179.254.163.97` |
| `@` | MX | `10 mail.easyclass-edu.ru` (replaces Beget MX) |
| `@` | TXT | `v=spf1 mx -all` (replaces `redirect=beget.com`) |
| `mail` | TXT | `v=spf1 a -all` (SPF for the HELO name) |
| `<selector>._domainkey` | TXT | DKIM keys from the Stalwart zone file (RSA signs, Ed25519 is published but inactive) |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@easyclass-edu.ru` |

Tighten DMARC to `p=quarantine` after a few weeks without delivery problems.

### Backups and upgrades

`teach-platform-mail-backup.timer` stops Stalwart for a few seconds at 04:30 server
time and archives `/etc/stalwart` and `/var/lib/stalwart` into `/root/mail-backups`,
keeping only the latest one (`MAIL_BACKUP_RETENTION`). To restore: stop `stalwart.service`,
extract the archive with `tar -C / -xzf`, start the service.

To upgrade, read the Stalwart release notes, update `STALWART_VERSION` and
`STALWART_SHA256` (the asset digest on the GitHub release page) in
`scripts/install-stalwart.sh`, deploy, and run the script again.

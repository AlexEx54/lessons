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

## Video calls

The application handles WebRTC signaling at `/ws/video-calls/:id`. The HTTPS reverse
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

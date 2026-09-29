# EasyClass: preparation of vm1302609 (2026-09-29)

## State and access

This is a **preview copy, not the production cutover**. The old EasyClass process remains active. Do not accept real edits on both databases: SQLite copies cannot be merged by copying files later.

- New host: `179.254.163.97`, Ubuntu 24.04, SSH port 22.
- SSH: `ssh -i ~/.ssh/repetitor2_prod_ed25519 root@179.254.163.97`.
- SSH key login was verified; password authentication is disabled in `/etc/ssh/sshd_config.d/00-easyclass-keys.conf`.
- Old host: `144.31.76.176`, SSH port 4537, same key.
- New runtime: Node.js 24.19.0 (same as old host), Caddy, coturn, ffmpeg/ffprobe, systemd.
- Application copied from the running old deployment, not from possibly newer local code.
- Service: `teach-platform.service`, user `teachplatform`, listens only on `127.0.0.1:8787`.
- App directory: `/opt/teach_platform`; environment: `/opt/teach_platform/.env`.
- Persistent data: `/var/lib/teach_platform` (SQLite, lessons, draft assets, video-call files).
- Old draft assets were in `/opt/teach_platform/data/draft-assets`; the new environment points to `/var/lib/teach_platform/draft-assets`.
- Firewall permits SSH, HTTP/HTTPS, TURN 3478 UDP/TCP, TURN TLS 5349 TCP, relay ports 49152–49200 UDP.

## Preview and DNS dependency

Caddy configuration is `/etc/caddy/Caddyfile` and protects both domain names with HTTP Basic authentication. Preview username: `preview`. The password is stored in `/root/migration-20260929/preview-password` on the new server and `tmp/migration-20260929/preview-password` on this Mac. Do not commit these files.

At the start of preparation, authoritative DNS returned `5.101.152.161` for `www.easyclass-edu.ru` and both `5.101.152.161` and `179.254.163.97` for `easyclass-edu.ru`. This unrelated address is not the old EasyClass VPS. Correct DNS before public HTTPS validation:

| Name | Type | Value |
| --- | --- | --- |
| @ | A | 179.254.163.97 |
| www | A | 179.254.163.97 |

A `www` CNAME pointing to `easyclass-edu.ru` can replace the second A record. Remove conflicting A/AAAA records for these names; preserve mail and verification records. Check authoritative DNS and public resolvers after editing.

DNS was corrected on 2026-09-29: authoritative Beget DNS and public resolvers 1.1.1.1 and 8.8.8.8 return only 179.254.163.97 for both names; the authoritative check returned no AAAA records. Caddy obtained production Let’s Encrypt certificates for both names at 10:56 UTC. HTTPS certificate trust and hostname validation passed from the Mac for both domains. The apex certificate expires on 2026-12-28; Caddy manages automatic renewal. TURN UDP/TCP/TLS is active; `/usr/local/sbin/easyclass-turn-cert-sync` installed the certificate and removed the temporary `no-tls` directive. That script copies the certificate into `/etc/turnserver-certs`, adjusts coturn and restarts it when necessary. The systemd timer is `easyclass-turn-cert-sync.timer`.

DNS/certificate validation completed (2026-09-29):

1. Verify A/AAAA records for both names from authoritative and public resolvers.
2. Inspect `journalctl -u caddy`; allow certificate issuance, then run `systemctl start easyclass-turn-cert-sync.service` and start its timer.
3. Check valid public HTTPS, the preview password gate, authenticated application pages and WebSocket upgrade through Caddy.
4. Check TURN TLS port 5349 with certificate verification and an authenticated allocation; test a two-browser call across different networks before production cutover.

## Draw Things

A separate reverse SSH tunnel connects new VPS `127.0.0.1:17859` to Mac `127.0.0.1:7859`. The existing old-server tunnel was left alone.

At the user’s request, the new macOS LaunchAgent was unloaded and its plist removed on 2026-09-29. The new-server tunnel is now a manually started background SSH process, with no automatic restart or login startup. The Mac must be awake and Draw Things gRPC running. After a disconnect or reboot, restart the tunnel manually. Earlier gRPC/TLS echo through the new VPS passed; no paid AI generation was triggered.

Manual tunnel command:

```sh
ssh -fNT -i ~/.ssh/repetitor2_prod_ed25519 -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -R 127.0.0.1:17859:127.0.0.1:7859 root@179.254.163.97
```

## Backups and verification

Local preparation snapshot: `tmp/migration-20260929/` (git-ignored, mode 700). Includes source deployment files, the old environment, persistent files and `database.sql.gz`. The SQL dump was streamed from an explicit SQLite read transaction; no large backup was written to the nearly-full old disk. Media was copied while the old service remained live, so this is a preview snapshot, not the final offline cutover backup.

A second copy of the SQL dump is `/root/migration-20260929/database.sql.gz` on the new server. The dump was restored and SQLite integrity and foreign-key checks passed. Media contents were compared with checksums against the local copied files.

Verification completed:

- 403/403 tests passed in `/root/migration-20260929/validation`, isolated from the production `.env`. An initial run alongside the configured `.env` failed because a test expects no TURN configuration; the isolated rerun passed.
- `/health`, login, authenticated dashboard, library and classes API passed.
- Temporary test-account call creation and teacher WebSocket connection passed; the temporary account/session/call were removed.
- Authenticated TURN allocations from the Mac succeeded over UDP and TCP.
- Draw Things gRPC/TLS echo passed through the managed tunnel.
- The copied database contained 2 users, 18 classes, 15 lesson drafts and 21 library lessons at verification time.

Additional checks after DNS correction: both HTTPS domains retain the preview gate (401 without credentials); login, authenticated pages, classes API, call creation and WSS passed through public HTTPS with a temporary account that was removed afterward. Authenticated TURN allocations from the Mac passed over UDP, TCP and TLS, with trusted certificate and hostname validation for TLS. The certificate-sync service succeeded and its timer is active. These checks do not substitute for an end-to-end browser call or a full AI generation check.

## Final cutover (NOT performed)

1. Finish the DNS/HTTPS/TURN TLS checks and preview review. Pick a quiet moment with no lessons or generation jobs running.
2. Stop **only** the old `teach-platform.service` to stop all writes. Leave the new preview password gate enabled.
3. Stop the new `teach-platform.service` before replacing its preview data.
4. With the old service stopped, run SQLite `PRAGMA wal_checkpoint(TRUNCATE)` and copy its database plus all permanent data to a **fresh local backup directory**, including `/opt/teach_platform/data/draft-assets`. Verify the copy before touching the new preview data. Never copy only a live `.sqlite` file while ignoring its WAL.
5. Preserve the new preview directory as a rollback artifact, restore the final data into `/var/lib/teach_platform`, and retain the new `.env` (new paths, TURN credentials and domain). Do not overwrite it with the old environment. Copy database files only while the destination service is stopped; do not leave old preview WAL/SHM files next to the replacement database.
6. Restore `teachplatform` ownership, check SQLite integrity, start the new application and repeat authenticated smoke checks.
7. Remove the preview Basic-auth gate only after the final data is installed and verified. Use `www.easyclass-edu.ru` as the main user-facing address; decide whether the apex should redirect before implementing it.
8. Old invite links currently use the old hostname. If these must keep working, configure its existing reverse proxy to send them to the new host; inspect the shared Caddy configuration first. Do not stop shared Caddy or change other projects inadvertently.
9. Keep the final offline backup outside both VPSes. After new users make changes, rollback must preserve those changes; restarting the old stale database is not a lossless rollback.

The old VPS also runs another application/PostgreSQL and VPN services. Powering off the entire VPS would stop those too. Stop EasyClass separately unless full VPS shutdown is explicitly intended.

## Subsequent code deploys

Keep the existing default deployment target unchanged until cutover. To explicitly deploy later to the new host:

```sh
SERVER_HOST=179.254.163.97 SERVER_PORT=22 PUBLIC_URL=https://www.easyclass-edu.ru npm run deploy
```

The existing deploy script's public checks do not supply preview Basic authentication, so this command is for after the preview gate is removed. Run tests in an environment without production `.env` if testing the server checkout.

## Reboot verification

The new VPS was rebooted after provisioning. `teach-platform`, Caddy and coturn came back active and `/health` returned `{"ok":true}`. The old service was separately checked and remained active. SQL dump SHA-256 on both Mac and new VPS: `f8e25d9f43ad1c433a353da4b1a061eb1a8f80033f8f8157255c14291c96f487`.

The then-managed Draw Things tunnel also recovered after the reboot; its automatic recovery was subsequently removed at the user’s request. OpenRouter's authenticated key-validation endpoint returned HTTP 200 (no generation charge incurred).

## Old-server disk pressure

The old root filesystem fell to approximately 1 MB free during preparation. APT cache was effectively empty. Archived system journals were streamed to `tmp/migration-20260929/old-server-journal.tar.gz` on the Mac; SHA-256 checks verified all 8 archived journal files against the source. Then `journalctl --vacuum-size=100M` removed about 413 MB of archived journals. Approximately 398 MB became available, and the old EasyClass service and health endpoint remained healthy. The active journal changed during archival; only immutable archived journals were checksum-verified and pruned. Application data and other services were not removed.

# Workshop Link Sync 0.2.0

Steam-authenticated companion sharing. Deployed on Railway at https://workshop-sync-production.up.railway.app with a 500 MB persistent volume mounted at `/data`. The Railway project is private; the HTTPS API verifies Steam identities and per-game friend access.

`worker/index.mjs` contains the runtime-neutral HTTP handler. `sqlite-adapter.mjs` supplies an atomic SQLite adapter. `schema.ts` and `drizzle/` contain the schema and migrations. `build-railway.mjs` embeds the handler, adapter and migrations into `railway-function.ts` for Railway’s Bun runtime. The volume stores `workshop-link.sqlite`; startup applies migrations once. The service refuses readiness without persistent storage and its configured public origin.

## Validate and build

```sh
npm ci
npm test
node build-railway.mjs
```

Tests use SQLite in memory with synthetic accounts and a mocked Steam OpenID verification response. They exercise the same adapter and handler used in production. No development bypass tokens or test login endpoints exist in the deployed service.

## Deploy or update

Use a Railway Function with the complete generated `railway-function.ts`. Attach a persistent volume at `/data`, set `PORT=3000`, set `PUBLIC_ORIGIN` to its HTTPS service domain, and route that domain to port 3000. Run one replica because this deployment uses a single SQLite volume. Configure your own deployment through the hosting platform. Production deployment IDs and credentials are excluded from this public repository; see ../docs/HOSTING.md.

The service stores hashes of session tokens, not raw bearer tokens. The desktop supplies a token hash during the device-link flow. A first-time browser flow can omit a preselected Steam ID; the server derives identity only from Steam’s verified OpenID assertion. Returning-account flows include an expected ID, which must match. Steam OpenID approval authorizes that hash for the verified account. The callback validates state, return URL, nonce, signed fields, expected account and Steam’s server-side verification response.

Friend access uses mutually reported Steam friend allowlists from authenticated companions. An owner chooses subscriptions, a curated list, or both for each game. Games not explicitly enabled are rejected from uploads. Friend removal applies after a profile refresh. Profiles older than seven days cannot access or expose shared lists. The API offers an authenticated deletion endpoint that removes the owner’s profiles, lists and sessions.

## HTTP endpoints

- `GET /v1/health`: public service readiness.
- `POST /v1/device`: start a bounded, expiring Steam identity-link request.
- `GET /auth/steam`, `GET /auth/return`: Steam OpenID approval and callback.
- `POST /v1/device/status`: check identity linking with possession of the device token.
- `GET /v1/me`: authenticated Steam identity.
- `PUT /v1/profile`: replace the caller’s friend allowlist and explicitly shared game snapshots.
- `GET /v1/friends`: authenticated, mutually allowed companion summaries.
- `GET /v1/games/:appid/friends?after=:steamid`: per-game subscription snapshots for mutual friends, 50 owners per page, with the same opt-outs and seven-day expiry.
- `GET /v1/friends/:steamid/:appid`: a shared game snapshot after mutual access checks.
- `DELETE /v1/profile`: revoke the caller’s hosted data and companion sessions.
- `GET /v1/releases/latest`: public Ed25519-signed Windows release catalog (204 before the first release).
- `GET /download`: permanent redirect to the latest Windows installer.
- `GET /updates/:version/latest.yml`, `GET /updates/:version/:installer`: immutable-version feed and installer, with byte-range downloads.
- `GET /v1/releases/publisher`: authenticated publisher-role check.
- `POST /v1/releases/publish`: publisher-only streaming installer upload with signed metadata in `X-Workshop-Release`.

Requests use HTTPS and `Authorization: Bearer <device token>` after Steam approval. Browser CORS access is not enabled; the desktop main process makes API requests. No Steam passwords, publisher key or Steam web-session cookies are accepted by the service.

## Windows app releases

Set `UPDATE_PUBLIC_KEY` to the base64 Ed25519 SPKI public key pinned in the companion's `src/update-config.json`, and `RELEASE_PUBLISHER_STEAM_ID` to the Steam-verified publisher account. The private key remains encrypted on the publisher's Windows PC. The service accepts only a newer version, a trusted signature, and an installer with matching signed size and SHA-256/SHA-512 hashes. Publishing uses the normal companion session; there is no separate public upload password or development bypass.

`release-store.mjs` streams uploads to `/data/releases`, atomically changes the latest pointer after verification, and retains the current and previous installer. Each installer is limited to 200 MiB. Older versions are pruned before the next upload to fit the 500 MB volume. Keep one replica. The generated Bun server allows 201 MiB request bodies. The companion independently verifies the catalog signature and installer hashes before allowing installation.

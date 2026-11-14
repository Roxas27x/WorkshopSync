# Hosting a WorkshopSync service or fork

The official client points to `https://workshop-sync-production.up.railway.app` and the official website is `https://workshopsync.pages.dev/`. These are public addresses. This repository contains no access token, deployment credential, user database, Steam cookie, or private update-signing key for those services.

## Sync service

The service source is in `workshop-sync-service/`. It authenticates Steam OpenID requests, stores SQLite data on a persistent volume, checks mutual friend access and sharing audiences, and serves signed release catalogs and installers.

```powershell
cd workshop-sync-service
npm ci
npm test
node build-railway.mjs
```

Deploy the generated `railway-function.ts` as a Railway Function using its Bun runtime. Attach a persistent volume at `/data`, route the service domain to port 3000, and keep one replica for the single SQLite volume. Set the environment variables described in `.env.example` through the hosting platform. The service applies its SQL migrations at startup.

`npm run build` creates the portable worker modules under `dist/server/`; that output still needs a suitable database adapter and runtime bindings. `build-railway.mjs` creates the complete Bun/SQLite deployment used by the hosted service.

## Website

`workshopsync-site/dist/` contains the static site and an advanced-mode Pages Worker. The Worker forwards downloads and catalog reads to the configured sync service and checks release signatures.

To run a fork, update `ORIGIN` and `PUBLIC_KEY` in `workshopsync-site/dist/_worker.js`, the corresponding public key/catalog settings in `dist/app.js`, the public links, and the Pages project name in `wrangler.jsonc`.

```powershell
cd workshopsync-site
node --test site.test.mjs
npm run preview
npx wrangler pages deploy dist --project-name your-project --branch main
```

Static assets are hosted by Pages. Large installers remain in the separate release store and are streamed by the Worker. Hosting providers have their own quotas and billing.

## Desktop fork configuration

A fork uses its own `build.appId`, app/profile name, installer branding, service URLs, and update key pair. Change the Windows application and protected-storage identity before using the release-key initializer, so a fork has a separate profile and signing-key location from the official application.

Configure `workshop-link/src/service-config.json`, `src/update-config.json`, and `src/brand-config.json`, plus the update publishing URL in `package.json`. Configure the server's `UPDATE_PUBLIC_KEY` and `RELEASE_PUBLISHER_STEAM_ID` for the fork. The public key can be committed; the private key and authenticated sessions stay outside the repository.

Code running behind the official service is not changed by publishing this repository or by building a fork. The GPL license covers source reuse; it does not grant access to the official service's publisher account or signing key.

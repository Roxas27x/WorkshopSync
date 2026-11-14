# Releases

The first open-source release is v0.10.1. Its application runtime is unchanged from v0.10.0; it adds GPL and dependency license packaging. `runtime-source-v0.10.0.json` records SHA-256 hashes of its 51 runtime files. The first public-source commit adds license notices, documentation, repository metadata, and license packaging without changing those runtime files.

## Build

Run the test suite and Windows UI test, increase the desktop package version for a new app release, and build the installer:

```powershell
npm test
npm run test:ui
npm --prefix workshop-link run installer
```

Installer builds include the root GPL license, third-party notices, the production npm dependency license collection, and Electron/Chromium notices. The internal artifact prefix remains `Workshop-Link-Setup-` so existing installations can use the same updater identity. A public release can offer a friendly filename such as `WorkshopSync-Setup-0.10.1.exe` containing identical bytes.

## Publish an official app update

Publishing official updates requires the authorized publisher Steam account and the protected private signing key on its Windows PC. Those credentials are not in this repository. Builds or forks cannot publish merely by knowing the public update key.

From `workshop-link/`, run the existing source publishing tools with the matching prepared release manifest. The service checks the publisher role, signature, version, and installer hashes before accepting it. Installed companions discover a newer release on startup, hourly checks, or a manual update check. Players choose when to download and restart.

## GitHub releases

Tag the matching source commit, provide the installer and checksums as release assets, and link the corresponding source archive and GPL license. Large installers belong in GitHub Releases rather than the Git source tree. Keep private signing keys, session files, personal app data, and production database snapshots out of releases.

The updater catalog is signed. The current beta installer does not have a Windows Authenticode certificate. A checksum verifies file integrity; it is distinct from a Windows publisher certificate.

A GitHub mirror does not change the official in-app update service or the permanent download URL.

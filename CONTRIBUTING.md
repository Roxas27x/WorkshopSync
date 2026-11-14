# Contributing to WorkshopSync

Use Node.js 24 and install the desktop and server dependencies as described in the root README. Windows x64 is required to run the desktop UI and build the installer.

Run `npm test` and `npm run check:public` before proposing changes. Run `npm run test:ui` for renderer changes. Include a short explanation of the behavior changed and relevant validation in your pull request.

Keep automatic downloads opt-in, respect per-game and per-list audiences, preserve private item exclusions, and bind Steam mutations to the selected account. Deletion must require an explicit preview and confirmation and remain restricted to selected Workshop cache paths. Do not exercise Steam subscription mutations or mod deletion against a personal profile during automated tests.

Use synthetic accounts and fixtures for tests. Keep tokens, cookies, private signing keys, personal mod lists, database snapshots, logs, and hosting credentials out of commits and screenshots. Public service URLs and public update-verification keys are expected configuration, not secrets.

Contributions to original project code are provided under GPL-3.0-only. Preserve third-party attribution and the license file. See `THIRD_PARTY_NOTICES.md` for artwork and dependency distinctions.

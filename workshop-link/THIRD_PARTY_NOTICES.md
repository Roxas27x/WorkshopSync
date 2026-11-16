# Third-party notices

The GPL-3.0-only license in this repository applies to original WorkshopSync code and original WorkshopSync artwork. It does not relicense third-party dependencies, trademarks, game artwork, Workshop submissions, or material displayed in screenshots.

## Runtime and build dependencies

Dependency versions are recorded in the component `package-lock.json` files. Each dependency remains under its own license. Principal dependencies include:

| Component | License | Source |
| --- | --- | --- |
| Electron | MIT, with additional Chromium/runtime notices | https://github.com/electron/electron |
| Cheerio | MIT | https://github.com/cheeriojs/cheerio |
| electron-updater and electron-builder | MIT | https://github.com/electron-userland/electron-builder |
| steam-session | MIT | https://github.com/DoctorMcKay/node-steam-session |
| qrcode-generator | MIT | https://github.com/kazuhikoarase/qrcode-generator |
| Drizzle ORM | Apache-2.0 | https://github.com/drizzle-team/drizzle-orm |
| Drizzle Kit | MIT | https://github.com/drizzle-team/drizzle-orm |

Electron distributions include `LICENSE.electron.txt` and `LICENSES.chromium.html`. The installer packaging hook in `workshop-link/scripts/include-dependency-licenses.cjs` collects the installed production npm packages' license and notice files for future builds. Dependencies are installed from npm and are not vendored in this source repository.

## Steam, games, and Workshop content

Steam and the Steam logo are trademarks of Valve Corporation. Game names, game icons, Workshop item names, preview images, and author descriptions belong to their respective owners.

The desktop loads public game icons, item previews, and descriptions from Steam. `workshop-link/tests/fixtures/icons.json` contains small game-icon fixtures for UI verification. The website's `dist/screens/` images show the application using a synthetic sample library and fictional friend names; game/mod artwork visible within those screenshots retains its original ownership. These third-party assets are not offered under WorkshopSync's GPL license.

The original Mod Stack WorkshopSync icon and original application/website code are part of this project's GPL-3.0-only material. The name and branding do not imply endorsement by Valve or game developers.

## Notices omitted from published npm tarballs

`boolbase@1.0.0` uses the ISC notice retained from its upstream repository: https://github.com/fb55/boolbase/blob/master/LICENSE (Git blob `a689aae96e8957e4ab7a3a7449fe5271a6516e4b`). `lazy-val@1.0.5` declares MIT and its author in package metadata but has no upstream license-text file; the bundled notice identifies that provenance and supplies the standard MIT wording with the declared author attribution. These version-specific notices are retained under `workshop-link/scripts/licenses/`.

The npm archives for `qrcode-generator@2.0.4`, `socks-proxy-agent@7.0.0`, and `agent-base@6.0.2` also omit their root license files. Their upstream MIT license texts are retained in the same directory, from https://github.com/kazuhikoarase/qrcode-generator and the respective package directories in https://github.com/TooTallNate/proxy-agents. `@doctormckay/stdlib@2.10.0` declares MIT and Alex Corn as author but has no license-text file in its npm archive or upstream repository; its packaging notice identifies that provenance and supplies standard MIT wording with the declared author attribution.

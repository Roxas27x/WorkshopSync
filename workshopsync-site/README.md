# WorkshopSync download site

Deploy the contents of dist to a Cloudflare Pages project named workshopsync. The advanced-mode Worker serves static assets and streams the current verified installer from the existing release store. Installers stay outside the Pages static-asset size limit. The public release signing key is pinned in the Worker and browser script. No credentials, app sessions, or private signing keys are deployed.

The 0.7.0 design uses the approved Mod Stack icon and actual Electron renderer captures under `dist/screens`. The screenshots use a separate sample library and fictional friends, never the installed app's profile. Public mod titles and thumbnails are loaded from Steam. The gallery covers named lists, custom friend groups, list audiences, and the Sand light theme. The blue colors and subtle blueprint grid match the app's Ocean palette.

Run `npm run preview` for the local preview on port 8788. Run `node --test site.test.mjs` to verify the download worker, release signatures and redirect handling. Deploy with `wrangler pages deploy dist --project-name workshopsync --branch main`. The stable download URL is `/download`; release metadata and notes come from the signed catalog at `/api/release`.

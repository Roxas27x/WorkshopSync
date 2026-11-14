# WorkshopSync 0.10.1 — Windows beta

A Steam companion with its own shared mod lists and friend subscription snapshots. Steam Collections and favorites are not required.

## Start or update

Run **WorkshopSync-Setup-0.10.1.exe** once. It installs for your Windows user without administrator rights. Friends can use the permanent [Windows installer link](https://workshopsync.pages.dev/), which always points to the latest published release. This beta has no Windows Authenticode certificate, so Windows may identify the initial installer as an unknown publisher.

Earlier portable ZIP versions need this one-time installer to gain in-app updates. Close the old portable copy, then launch WorkshopSync from its installed shortcut. Existing Steam sign-in, chosen lists, sharing preferences and download opt-ins are kept in the same application-data directory.

The companion checks for updates on startup and hourly while open. **Settings → Updates & about → Check for updates** checks immediately. An available release appears in a banner: choose **Download update**, then **Restart & update** when ready. Closing the app does not silently install a downloaded update. Each downloaded installer is verified against a signed release catalog before it can run.

Your previous Steam browser sign-in is reused. A missing temporary browser token no longer makes a persistent Steam login appear signed out when reading local subscriptions. The first start of version 0.2 creates `lists.json.v1-backup` before migrating saved data. Chosen items and game icons are preserved. Collection links are retired. Connecting friend sharing enables subscription sharing for every Workshop game by default; named lists use the audiences you choose. Download synchronization still starts off.

Use **Share app → Copy installer link** in the sidebar to invite another player. The same link is available from Settings. It works before Steam sign-in and always points to the latest installer. The app already has its update feed configured; players do not need to paste a URL to receive updates.

## Delete mods, storage sizes, and the auto-sync blacklist

The Downloaded tab has been removed. Subscribed shows a **Size** column immediately after Status. Local sizes come from Steam installation manifests or Left 4 Dead 2’s legacy Workshop VPK files. Otherwise the published Steam size is shown. Unknown sizes display a dash. Choose **Size: largest first**, **Size: smallest first**, or click the Size heading to sort.

Select owned mods and choose the red **Delete** button next to **Add to list**. The preview shows the selected titles and the local space estimate. Confirming unsubscribes your Steam account and permanently removes only those mods’ folders in the detected Steam Workshop libraries, plus their matching Left 4 Dead 2 Workshop VPK/thumbnail cache files on this PC. Named lists are retained. A failed unsubscribe leaves that mod's files untouched. If a game locks files, close it and retry the reported cleanup.

**Block these mods from auto-sync** starts checked in the deletion preview. You can also select mods and choose **Block auto-sync** without deleting them. Open **Blacklist** in Subscribed to inspect or allow them again. The blacklist is per game and account, saved across restarts, and excluded from shared snapshots. Explicitly installing a mod through the app clears its blacklist entry after success. Steam resubscriptions are detected through new subscription timestamps or refreshed subscription snapshots; stale post-deletion cache entries cannot re-enable a deleted mod.

List backups include blacklist choices. Importing a blacklist blocks future automatic requests and does not delete or unsubscribe anything. Version 0.10.0 saves state format 5 and keeps a one-time v4 backup before migration; older apps cannot open the newer local state.

## App icon

WorkshopSync uses the selected Mod Stack blueprint icon in the app header, Windows taskbar, app shortcuts, and installer. Restart after updating to load the new Windows icon.

## Compatibility notes and linked mods

Before new manual subscription requests, an install review appears when it finds substantive author notes, suggested items, or incomplete checks. Empty headings do not trigger a review. Decorated recommendation sections and Workshop URLs on separate lines are recognized, with labels retained for their items. The review shows the author’s requirement and compatibility notes. Items explicitly required on Steam are offered checked; optional recommendations, patches, and other author-linked suggestions remain unchecked. Review the excerpts and choose what to include. Selected additions have their own requirements checked before installation, with duplicate and circular links kept together.

The app reads author-provided information. It does not determine whether every mod, game version, or load order works together. If Steam cannot provide a full required-items list, the review says which checks are incomplete. Large batches read every available description and limit extra page requests; individual Details views can provide additional information.

Automatic sync holds new additions with relevant notes, missing requirements, or incomplete checks. Choose **Review mods** in the notice to approve them. The game’s Auto-sync setting stays as you chose, and items already subscribed are not requested again.

Workshop links inside descriptions open another in-app details popup. An **Install…** button next to the link opens that mod’s information and install options. Back, X, Escape, or an outside click closes only the foreground popup and restores the previous popup’s scroll position, selected preview, and review choices. Other website links still open in the browser.

The install review preserves the sharing choice: private installations keep selected dependencies private too, and shared installations use the game’s current audience. Viewing a linked mod or cancelling a review does not install it.

## Read about a mod

Click a mod's **name**, **thumbnail**, or **View** button to open its details inside WorkshopSync. This works in Subscribed, My lists, Friends, Workshop search, and Activity. The popup shows Steam's full description with formatting and images, a preview gallery, creators, published and updated dates, size, subscribers, favorites, tags, and any required Workshop items listed on the page.

Choose a required item to read its details. **Open Steam page** opens the exact item in your existing browser for comments, discussions, and change notes. Author links also open in the browser. Closing the popup by clicking outside or pressing Escape keeps your mod selection unchanged. Click the rest of a mod row or its checkbox to select it.

Descriptions are read from Steam when needed and briefly cached on this PC. If the web page is unavailable, the popup uses the full description from Steam's item API. Private or removed items may require opening the Steam page instead.

## Search Steam Workshop in the app

Opening a game’s Workshop tab automatically loads its most subscribed items. Switching games while browsing Workshop loads the selected game’s results. Each game retains its search, sort choice, type filter, and page while the app stays open. **All types** uses the categories declared by the selected game’s Steam Workshop, such as maps, mods, skins, campaigns, models, or textures. Selecting a type starts a new search and keeps that type across pages.

Open a game and choose **Workshop**. Search by name, or leave the name empty to browse. Sort by relevance, most subscribed, newest, or recently updated, and use Previous/Next for more results. Search reads Steam's public Workshop and does not require a new sign-in or an API key.

- **Subscribe privately** requests the subscription and excludes that item from all WorkshopSync subscription inventories and shared named lists. This choice survives scans, refreshes and restarts. Steam profile visibility remains separate.
- **Subscribe & share** uses the game's existing subscription-sharing audience. The confirmation shows that audience. If subscription sharing is off, open Game sharing and choose the audience first. It never enables sharing for another game or automatic installs.
- **Add to list…** saves a result to an existing named list or a new private list. Existing lists retain their own audience and auto-sync choices. Adding an item does not remove an existing private choice.

Select entire result tiles to apply these actions to several items. An existing subscription can be made private, or explicitly shared again, from its search result. The local profile uses version 4 so older installations cannot ignore private item choices. A one-time v3 backup is created before migration. Older clients on the same Steam account cannot overwrite the upgraded sharing profile.

## Select mods and organize named lists

Click anywhere in a mod row to select it. Checkboxes still work, and Install, View, and History buttons keep their own actions. Selection actions appear above the table and stay available while scrolling.

Open **My lists → New list** to create separate mod groups for a game. Existing chosen items carry over into **My mods**. Lists can be renamed or deleted without unsubscribing or removing downloaded files. **Add to list…** offers a destination list or creates a new one from your selection.

New lists start **Only me** and are excluded from automatic installs. Use **Share list** to choose all connected friends or several specific friends. The game’s **Sharing** audience also applies. Full subscription sharing has its own checkbox in that menu; a private list does not hide mods you already share through your full subscription inventory.

Use **Include in auto-sync** for lists you want installed automatically, together with the game’s **Auto-sync** switch. **Install this list** is a one-time action and does not enable automatic installs.

In **Friends**, **Choose friends…** creates a custom browsing/install group. **Install all available** uses that group. Select **Named mod lists** and the **Shared list** picker to browse one specific friend’s list. **Choose friends to sync** follows several selected friends; select a specific shared list first to follow just that list. Following never enables the game’s Auto-sync switch.

Both players should update to 0.9.0 for named-list controls. Older friends can still read only the items shared with them. Older installations on the same account cannot overwrite the new audience settings. The app makes a one-time local v2 backup before migrating its saved data, and older app versions refuse the new local format.

## Utility layout and appearance

The compact Utility layout places games, per-game synchronization switches, and connected friends together in the left sidebar. Mod tables show source, local activity date, status, and install/view actions. Recent activity appears below the current list when recorded.

Open **Settings → Appearance** to select Graphite, Forest, Ocean, Plum, or Sand. Choose Dark, Light, or System mode. Appearance applies immediately across lists, dialogs, and activity, and is saved on this PC across restarts. Color choices do not change game sharing or synchronization.

## Settings for players

Settings has four sections: **Appearance**, **Steam & friends**, **Library & backups**, and **Updates & about**. Steam connection status, Workshop install permissions, library discovery, list backups, and update controls use player-facing labels. Scan details and manual game discovery are inside the library troubleshooting section. Disconnecting or signing out explains its effect before you continue.

## Connected friends sidebar

The Friends sidebar shows only Steam friends who have connected to WorkshopSync. Click a friend to choose a shared game and browse their mods. Friends who have not connected are hidden. The label describes app registration, not live online presence. Use **Friends** in the header to open or close the sidebar.

## Toggle game synchronization from the sidebar

The wider games list has an **Auto-sync** switch on every row. Toggle any game without leaving the game or tab you are viewing. These switches control automatic subscription requests; sharing preferences remain separate. The app still requests Steam authorization before enabling downloads when needed.

## Sort your Workshop games

The sidebar defaults to **Latest played**, using the connected Steam account’s local play history. Games without a recorded date appear last. **Sort games → Most shared items** ranks by unique Workshop IDs shared by compatible friends across subscriptions and chosen lists, counting duplicate IDs only once per game. Counts refresh with friend sharing, without opening every friend list. **Name: A → Z** is also available. Your sort choice is saved, and sorting keeps your current game selected.

## See your subscribed maps and mods

1. Click **Connect Steam & friends → Continue in my browser**. Approve Steam’s confirmation in your existing browser. The app then connects friend sharing automatically. A browser session that has expired may require Steam sign-in.
2. Steam identity is verified by the sync service before the app selects your local subscription cache. Existing installations keep their Community authorization. New installations can browse local subscriptions and public friends without a separate embedded login.
3. **Authorize Steam downloads** is a separate, optional permission for subscribing to items, reading private subscription pages, or private friend lists. Steam OpenID confirms identity; it does not grant those Community permissions. The app prompts for this authorization when needed.
Unavailable and unresolved items are hidden by default in the mod lists. Turn on **Show unavailable** to inspect them; this changes visibility without deleting subscriptions, chosen items or local files.

4. The **Subscribed** tab is the default view. It reads the current Steam account’s subscription cache, including games that are not installed and subscribed items that have not downloaded.
5. **Refresh library** scans the local cache and downloaded files, reloads your signed-in Steam Community subscriptions with pagination, and refreshes Steam item metadata in one action. It preserves your previous list if sign-in fails, the format is not recognized, or the refresh is incomplete.
6. **Subscribed** shows download status beside each mod. An old folder may remain after unsubscribing, and a subscription may still be waiting for local files.

Names and thumbnails load from Steam’s public metadata. An unavailable item does not hide the rest of your inventory. Only games with verified Workshop support are shown, with their actual Steam icons. Steam controller configurations are excluded from the game library.

### If scanning misses files

Open **Settings → Library & backups → Having trouble finding mods? → View scan details** to see detected library roots, subscription totals, downloaded totals and actual file-reading errors.

Use **Choose Steam folder** if Steam lives on another drive. You can select the Steam installation, `steamapps`, `common`, a game folder, or a Workshop content folder; the app walks up to find the library root. It reads library manifests and follows additional Steam libraries. No administrator rights are requested. Access-denied errors are reported instead of silently becoming an empty list.

Subscriptions are read only from `userdata/<signed-in account>/ugc/*_subscriptions.vdf`. Other Steam accounts on the PC are not scanned for subscriptions. Downloaded folders can contain files used by other accounts and are labeled separately.

## See a Steam friend’s subscriptions

Both players must use this version of the companion and its shared sync service. Public friends can be read after browser confirmation. If Steam hides the friend list, the app offers Community authorization and revokes stale friend access until it can refresh the list.

1. Click **Connect Steam & friends**, then **Continue in my browser**. Approve Steam’s confirmation. Friend sharing connects automatically afterward. This verifies your Steam identity for the sync service; the service does not receive your Steam browser cookies or password.
2. Connecting automatically enables subscribed-item sharing for every Workshop game. Named lists use their individual audiences. Games discovered later inherit this default. Use **Sharing** to turn sharing off for individual games; those choices survive normal restarts and refreshes.
3. Open **Friends**. **All compatible friends** and **Subscribed items** are selected by default. The app loads every sharing friend’s subscriptions for this game, merges duplicate mods, and shows all subscribing friends beside each mod. Collections are not required.
4. Sort mods by **Not subscribed first**, name, friend name, number of subscribing friends, or published update date. Search by mod name, Workshop ID, or friend name. The friend selector can show one person, with its own name/item-count ordering.
5. Click **Install** beside a single mod, or select several and choose **Install selected**. **Install all available** installs the entire selected friend filter in one batch, including **All compatible friends**. It ignores search text, deduplicates shared mods, skips existing subscriptions and unavailable entries, and does not enable following or automatic sync. Use **Stop this batch** to halt remaining subscription requests; Steam continues managing downloads already queued. Explicit selections work with automatic game synchronization off and never enable following. Steam Community authorization is still required to subscribe. **Add to list…** remains a separate choice.
6. To follow future additions automatically, select one friend and enable **Follow changes**, then separately enable synchronization for the game. The combined view does not follow everyone automatically. While the Friends tab is open, its shared snapshots refresh every minute; **Refresh items** checks immediately.

Compatible friends means Steam friends connected to this companion and sharing Workshop items for the selected game. It does not guarantee that two mods work together, match your game version, or have their dependencies installed. Private, revoked and expired snapshots are excluded. Large friend rosters are fetched in pages; an incomplete refresh reports an error and keeps previous data. Missing Steam names can appear as Workshop IDs until metadata is available.

Steam friends who have not connected the companion, or have not shared the selected game, are identified as such. The app does not expose a non-user’s private subscription inventory. Workshop games shared by friends can be discovered even if they are not installed locally.

The preconfigured service is [WorkshopSync Sync](https://workshop-sync-production.up.railway.app). Every player must use the same service URL. The connection is preconfigured in the installed app.

## Synchronize selected lists

1. Add selected items to the named list you choose, or create a new list from that selection.
2. Use **Share list** to select its audience. Friends browse your permitted lists under **Named mod lists**.
3. Select a specific shared list before **Choose friends to sync** to follow that list, or follow the selected friends’ subscribed items.
4. Enable **Include in auto-sync** for your own lists and the game’s **Auto-sync** switch when you want automatic requests. **Install this list** and **Install selected** remain one-time actions.

While open, the companion refreshes its local cache and shared snapshots every minute. Steam friend lists are refreshed on connection, manually through Refresh friends, and periodically while connected. A friend can follow your entire shared subscription snapshot or your chosen list.

Automatic synchronization is additive: removing an item from a shared list does not unsubscribe or delete your personal mods. The explicit Delete action is available when you choose to remove them. Your chosen list and your subscription list are separate. A successful subscription is recorded immediately; the **Downloaded** status requires finding actual local files.

## Download dates and who added a mod

The Subscribed and My lists tables show **Added by** and **Added / downloaded** columns. Click the source beside a tracked item to see its history; this remains available when the date column is hidden in a narrow window. Sort by **Newest downloads** or **Newest additions**. Mod publication/update dates remain a separate sort option.

The companion records the friend and shared list responsible for a successful app-triggered subscription request. A request is not reported as a completed download: history records when local files are subsequently detected. A mod found in several followed lists keeps all its sources. Manually selected friend items are labeled as selected by you in the activity log.

**While away** in the sidebar shows automatic additions from followed friends across all games. Choose the current game or all games, and use **Mark reviewed** to clear the badge. Pending requests remain distinguishable from detected files. Review status and per-item attribution survive restarts. The Activity tab also offers all mod activity and app messages.

The first scan establishes a baseline. Older downloads get a local file or folder creation date, labeled **estimate**, with an unknown source. Folder dates can change after copying or restoring files. Steam mod-version timestamps are not treated as download dates. Newly observed files record detection time, which can be later than Steam’s actual completion time. Downloads performed outside the companion have an unknown source; the app does not guess a player from overlapping subscriptions.

The companion must be running to request new downloads from followed lists. Steam can finish already-queued downloads while it is closed; the next scan detects the files. Recent activity keeps up to 3,000 events, while per-item history and unreviewed additions remain stored separately. Download dates and attribution stay on this PC and are excluded from shared snapshots and chosen-list backups. Switching accounts clears account-specific history.

## Filter recent activity

Open **Activity → App messages**. Repeated messages are grouped with a count and their first/last dates. **Hide routine checks** starts on, so unchanged scans, already-subscribed checks and expected game-verification diagnostics stay out of the default view. These routine checks are not treated as download failures.

Choose a message severity or source, or enable **Hide recurring messages** to exclude repeating groups entirely. Actual network and install failures remain visible by default. Old saved messages use the same filters, and grouping prevents recurring maintenance from filling the history with identical rows. New scans compare item IDs, so a real change is still recorded even when the total counts stay the same.

## Sharing and identity

- Steam OpenID verifies each companion account’s Steam ID on the server. Tokens are stored as hashes on the server and encrypted using Windows storage on the device where available. If encryption is unavailable, the app keeps the token in memory for the current session.
- The service stores Steam friend IDs, enabled game names, and the Workshop IDs shared by the companion. It does not upload mod files, local paths, Steam browser cookies, or passwords.
- Access requires both Steam-identified companion profiles to report the other as a friend, and sharing to be enabled for that game. These are the companions’ last reported Steam friend lists, rather than a live publisher-only Steam friendship API. A modified client controls its own allowlist; it cannot impersonate another Steam identity or make the other person list it as a friend.
- Friendship removal and sharing changes apply when the service receives a refresh. Snapshots become inaccessible after seven days without profile refresh. Steam identity sessions expire after 30 days.
- **Disconnect & remove hosted data** deletes your shared snapshots, friend profile and companion sessions from the service. Steam sign-out also requests hosted revocation. A failed network request is reported; the app does not claim that server-side deletion succeeded when it did not.
- Switching Steam accounts clears local subscription snapshots, cached friends, follows and sharing/download settings. Local chosen lists remain available. Sharing starts again only after connecting the new account to friends; downloads remain opt-in.

## Limits and validation

- Local Steam cache entries may be stale if Steam has not refreshed them. Use Refresh library for a direct refresh. That page reader uses Steam Community markup and can need updates if Steam changes it.
- Subscribing uses Steam’s signed-in Community endpoint. It is undocumented and can change. Unavailable Workshop items are skipped; the remaining items are checked against the selected game before any subscription request. Requests are spaced one second apart.
- The beta supports up to 5,000 subscriptions per account and up to 100 shared games. Large subscription batches take time; leave Steam and the companion open. Turning the game’s synchronization off stops further automatic requests after the current request. Explicit manual installs apply only to the items you selected.
- Game ownership, Steam availability and game settings determine whether Steam downloads an accepted subscription. This app does not resolve dependencies, load order, incompatible mods or game-version differences.
- Automated tests cover account-specific cache reading, pagination, failure handling, library paths, migration, opt-ins, payload filtering, authenticated friend access and revocation. The interface is tested with fixtures. The service’s live health, pending sign-in flow and rejection of anonymous friend-list access are verified. Live friend exchange still requires both people to approve Steam sign-in and enable a shared game; actual Workshop subscription changes are not exercised during development verification.

## Storage and backups

Preferences: `%APPDATA%/Workshop Link/lists.json`. The isolated Steam browser session and encrypted companion session are stored beside it. Do not share that application-data directory.

**Save list backup** exports named lists, Workshop IDs, game IDs and names. Steam cookies, friend graphs and account tokens are excluded. Old single-list backups can also be imported. New imported lists start private and are excluded from automatic installs.

## Develop

Use Windows x64 and Node.js 24 LTS. The full repository is licensed GPL-3.0-only; see ../LICENSE and ../THIRD_PARTY_NOTICES.md.

```powershell
npm ci
node node_modules/electron/install.js
npm test
npm start
npm run installer
npm run release:prepare -- "Describe what changed in this version."
```

The separate sync-service source includes the tested HTTP handler, signed update feed, persistent installer storage, SQLite schema/migrations and the generator for the single-file Railway deployment. `npm run package` still produces a portable folder, but the NSIS installer is required for in-app installation of future updates.

## Publish an app update

Publishing is available only from the source tools, using the configured publisher’s Steam account and the protected signing key on that PC. The player app includes update checks, downloads, and restart controls; publishing tools are excluded from the installer.

1. Make the app changes and increase `package.json` to a newer numeric version, for example `0.3.2`. Update the lockfile with `npm install --package-lock-only --ignore-scripts`.
2. Run the tests, `npm run installer`, then `npm run release:prepare -- "What changed"`. This creates the installer and its matching `.release.json` file in `installer/`.
3. From the source folder, run `npm run release:publish -- "C:\path\Workshop-Link-0.10.1.release.json"`. Keep the matching installer beside the manifest. Review the release notes in the manifest before publishing.
4. Friends' installed companions discover the release on their next startup or hourly check. They can check immediately in Settings. They choose when to download and restart; you do not need to send another ZIP.

The source publishing command uses your verified account and protected key. The app must have an active companion sign-in on this PC. The service rejects duplicate or older versions. To correct a release, publish a higher version.

The Ed25519 private signing key is encrypted by Windows in `%APPDATA%/Workshop Link/release-signing-key.json`. It is never included in installers, backups or source archives. Keep that file and your Windows account intact; friends' companions pin its public key. The update service stores the current and previous installers on the existing Railway volume. Railway storage and download traffic are subject to your hosting plan.

Independent project; not affiliated with Valve or Steam.

The rebrand preserves the existing Windows app identity and data folder. Update artifacts retain their legacy filename internally so older installations can verify and install the rebrand through their existing trusted feed.

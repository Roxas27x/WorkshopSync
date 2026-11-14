# Security reports

Report vulnerabilities privately through this repository's GitHub **Security → Report a vulnerability** feature when available. Do not put credentials, Steam cookies, companion session files, private signing keys, personal mod inventories, or unredacted database/log dumps in a public issue.

The current maintained desktop release is v0.10.1. Fixes will be supplied in a newer release; official updater catalogs are verified against the public Ed25519 key shipped with the app.

The public update-verification key and public service addresses in this repository are intentional. An update still requires a matching signature from the protected private key, a matching installer hash, and authorization from the configured publisher account.

The service uses Steam-verified identity and authenticated friend access. It does not receive Steam passwords or Steam Community cookies. Account-specific history and blacklist choices stay in the local profile; only permitted lists and subscription snapshots are shared.

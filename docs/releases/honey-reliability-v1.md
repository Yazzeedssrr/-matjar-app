# Honey reliability v1 — 2026-09-30

This is a bounded reliability update, not a live-sale launch.

## Verified baseline

Connected existing project fskfwngswatbetgxkmei is ACTIVE_HEALTHY. Operations migration already applied as 20260930041817; it was not reapplied. Counts: 5 products, 8 image rows, 1 order, 1 profile, 0 support messages. Checkout remains disabled; test mode remains enabled. No business records, financial secrets, accounts or image files were altered.

## Changes

- Customer support translation is explicit; opening a thread or changing its translation language does not send text to a provider. Changing the translation language preserves an unsent reply. Original and translated message bodies are excluded from interface text translation and use automatic text direction.
- Ticket/reply buttons lock during an in-flight request. This prevents rapid repeated clicks, not server-side retry idempotency after a lost response.
- A Stripe success return URL is not treated as payment proof. The owned order must be paid in the database before showing confirmation; the current pending order must also match before clearing the local cart. Pending verification retains the cart and warns against repeating payment. Webhook remains the financial authority.
- Added authenticated password-recovery form and matching-password validation. Supabase calls from auth state callbacks are deferred to avoid auth-lock reentrancy.
- Public build clears generated dist output before applying its allowlist, preventing private stale files from surviving a rebuild. No user storage is cleared.
- CI includes executable regression tests with controlled Supabase and DOM doubles.

## Tests and limits

Six Node regression tests exercise translation consent, unsent reply retention, escaped text, rapid repeated reply clicks, unpaid versus paid return handling, recovery password matching, and stale build-file exclusion. Syntax and frontend build checked. These are controlled unit tests, not signed-in Safari or a real customer conversation.

Local Chromium was unavailable. No iPhone, live checkout, supplier fulfillment, live refund, full database/image backup or isolated restore is claimed.

## Remaining launch blockers

Render and Stripe plugins are discoverable but not connected here. Existing Edge Functions still have GitHub-origin CORS and hardcoded Stripe return paths; configure and test them once the commercial hostname is known. Translation currently uses an undocumented Google web endpoint with message text in a query string, lacks a timeout, and does not reliably report cache-write failures. It has not been production-approved. Replace with a documented provider after owner approval of terms/privacy/cost; do not silently incur fees.

Anonymous learning-event SECURITY DEFINER RPC remains callable and needs remediation after checking legacy telemetry dependencies. Leaked password protection remains disabled. Authenticated SECURITY DEFINER findings require individual authorization review, not blanket privilege removal; reviewed cancellation and support-creation functions check ownership.

Full encrypted offsite database + image backup, isolated restoration, signed-in two-account support test, real supplier terms/sample, support contact, business/food/tax review, policies, commercial hosting and approved live financial tests remain mandatory. Owner selected diverse honey types as research direction; no supplier is approved and no stock was invented.

## Backup tooling follow-up

Added read-only `scripts/create-backup.py` for a PostgreSQL custom dump and every Storage object, using credentials supplied only through a trusted environment. It checks pg_restore listing, repeats object inventory, writes per-file SHA-256/size and bucket/name mapping, and refuses to overwrite an existing backup. It does not back up Stripe, provider settings outside PostgreSQL or browser drafts. Cross-system consistency requires a quiet window. Archive contains sensitive accounts/data and must be encrypted for offsite transfer.

Added `scripts/verify-backup.py` with manifest, checksum, size, duplicate-entry, unsafe-path and symlink checks. File restoration writes only into a new local directory and refuses overwrite. Three fixture tests passed for byte-preserving extraction, overwrite refusal, corruption and traversal rejection. This is not an actual database restoration test. Live backup creation has NOT run: secure PostgreSQL/Storage credentials are not configured in this workspace. No secrets were requested in chat.

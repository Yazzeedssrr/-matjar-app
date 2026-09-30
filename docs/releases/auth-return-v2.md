# Auth return diagnostics — 2026-09-30

Read-only investigation of 22:46–22:49 UTC Google callbacks confirmed `invalid_client`: the configured client secret is invalid. No Google identity or session was created. Redirect now reaches the storefront, but credentials require correction in the provider dashboard; enabling a provider is not proof of a completed login.

Frontend changes: capture callback failure before SDK initialization, show a safe Arabic notice, remove callback error parameters without logging raw descriptions, preserve successful session/recovery fragments, and use the session returned by email login immediately. Auth event rendering no longer waits for profile/favorites reads. Cart and drafts are untouched; no credentials or database configuration were changed.

Verification: automated callback/error, token preservation, and email session/network failure tests plus existing reliability tests. Real Google sign-in remains blocked until a valid secret from the same OAuth client is saved in Supabase and tested on the user's device. Apple/GitHub remain unconfigured. Email delivery, recovery delivery, and every post-login data view are not certified by these unit tests.

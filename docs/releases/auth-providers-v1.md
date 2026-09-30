# Auth providers preparation — 2026-09-30

- Existing email/password registration, login and recovery retained. Confirmation redirects to the current storefront path; signup confirmation wording does not disclose whether an account already exists.
- Google, Apple and GitHub OAuth handlers added to the current storefront. Public Supabase Auth settings are checked with an eight-second timeout; only enabled providers become usable. Disabled or unreachable providers are not represented as working.
- Current project inspection: email enabled; Google, Apple and GitHub disabled. External provider setup remains required; no secrets added to the repository and no provider enabled without its credentials.
- Google needs OAuth client configuration and the Supabase callback URL. Apple web OAuth needs developer configuration, Services ID and signing credentials with recurring secret rotation. No paid enrollment purchased.
- Payment settings inspected: checkout disabled, test mode enabled. Live payment is not approved or verified.
- Eight controlled Node tests and syntax/build checks pass. No end-to-end provider login, confirmation email delivery or iPhone test claimed.
- Existing accounts, products, images, orders, browser drafts and database schema unchanged.

# MAKHRAJ HONEY — honey-ops-v1

Release date: 2026-09-30. This is a preparation and operations release, NOT a declaration that the business is ready for live sales.

## Owner-visible additions

The existing seller.html now links to operations.html (مركز تشغيل العسل). The existing safe editor, product drafts, accounts and store entry point are retained. The operations center is in Arabic for the owner and has eight sections:

1. Launch checklist. It distinguishes recorded preparation from independently verified live payments and end-to-end fulfillment. It never activates Stripe or checkout.
2. Merchant identity and support contacts. Private licensing/tax/funding notes are separated from a whitelisted public contact snapshot.
3. Supplier records. Record an inquiry, warehouse, stock-check method, written payment/dispatch/damage terms and agreement status. The inquiry-letter helper only displays/copies a draft; it does not send email or place an order.
4. Honey supply cards linked to existing honey products. Store origin, net weight, ingredients, packer, storage, allergen label information, dispatch window, evidence and private costs. Supplier quantities are reference data, not automatic live stock synchronization.
5. Six editable policy pages: about, shipping, returns/damage, privacy, terms and contact. Arabic/English starter drafts explicitly contain completion markers. Each policy has five language fields. Saving a draft does not publish it or replace the last approved public snapshot. Publication requires explicit owner approval, meaningful Arabic and English content, and removal of completion markers. These are business drafting aids, not legal advice or legal review.
6. A margin/working-capital calculator including customer shipping, supplier product/shipping/other costs, payment percentage/fixed fees, advertising and a damage/refund reserve. All inputs must be supplied; an unknown cost is not silently zero. Its result is not accounting net profit or a profit guarantee.
7. Manual supplier fulfillment records for recent orders. Marking an order as ordered/dispatched requires a paid online order with a recorded live Stripe event and no test event, a confirmed supplier and supplier reference; dispatch additionally requires carrier and tracking. Recording a phase does not purchase goods, send a customer notification, change the financial payment or perform a refund.
8. Private operational JSON export and a hosting/launch checklist. The export is not a full database or photo backup and has no one-click restore tool. It includes private supplier information and costs; do not publish it.

## Customer-visible additions

The storefront footer links to information.html. Product cards can link to information.html?product=<product-id> for reviewed package data.

The public information interface and FAQ are available in Arabic, English, Spanish, French and Turkish with correct reading direction. This is not a claim of complete localization of every legacy screen. Only approved policy/contact/package snapshots are displayed. Missing content is explicitly described as pending, not replaced with invented delivery, refund, supplier or certification promises. When an approved policy is absent in the selected language, the available original is labelled; no automatic legal translation is claimed.

Published content is rendered as text, not executable HTML. Package facts for draft products are not publicly readable. Supplier cost, supplier contact, internal evidence and other private fields are never copied into public snapshots.

## Database and authorization

The additive migration creates store_ops_records, store_ops_history, and store_public_content, plus three admin-gated RPCs. Existing products, variants, orders, payments, images and profiles are not rebuilt or migrated.

Private tables have RLS and admin-only reads; browser-role direct writes are denied. The save RPC checks admin authorization, validates fields, serializes a record update, compares revisions and appends history. Unchanged retries do not duplicate a record. Stale edits are rejected rather than overwriting a newer revision. Publishing is an explicit separate operation that whitelists public fields. Unpublishing removes only a public snapshot, not the private draft/history.

Operational forms warn before leaving unsaved edits. Cancelling a product/policy selection change retains the unsaved form and restores the selection. Controls are locked during an in-progress save. Unlike the existing product editor's local draft feature, these new operational forms do NOT implement offline auto-recovery: save before reloading.

## Data preservation actually checked

Before/after digests matched for all existing product rows, variants, image rows, orders, profiles and support messages. Counts remained: five products, eight images, one order, one profile and zero support messages. Four car-parts products remain stored as drafts. There are no honey products yet. No supplier contract, public policy, availability or sale was invented. The new private and public operational record tables were empty after rollback-only testing.

Settings remained unchanged: checkout_enabled=false, test_mode=true, stripe_online_enabled=true. Stripe secrets and bank data were not changed or read. No paid plan, supplier purchase or domain was purchased.

## Verification actually performed

- Connected PostgreSQL assertions ran inside a fully rolled-back transaction. Passed authorization, unchanged-retry behavior, revision conflicts, supplier terms validation, approval gating, public whitelists, private-cost isolation, integer stock validation, rejection of sandbox fulfillment, grants, draft-product facts RLS, and public policy readability.
- 69 isolated Chromium DOM assertions passed using controlled Supabase, storage and location doubles. They covered the admin sections, role gate, draft saving, approval reset, unfinished policy rejection, calculations, empty honey catalog, cancelled unsaved-navigation behavior, inert policy text, public read boundaries, five languages, mobile/desktop layout, and runtime errors.
- Tested operations JS blob: c05aebef61378f63817b26bc85344a320fb8a172. Tested information JS blob: 172ed089c495bf90c39b406da0f343d8e9aba169. Tested navigation bridge blob: d9e093b371f605635b0b8b98180b8a312bb0c676.
- GitHub Actions run 36670469315 at commit 9cde3a3aeb94a74ac439c4f1e0e214692bdb5881 passed JavaScript syntax, actual storefront packaging, local resource references, unique HTML IDs, public-package exclusions and stable manifest identity. The workflow has read-only repository permissions and no deployment/payment secrets.

These checks are NOT a signed-in iPhone/Safari end-to-end test, a supplier stock/order integration test, a live checkout/refund test, or a full independent security audit. Browser navigation was blocked in the local environment; local UI tests used set_content. Actual hosting build was separately checked in GitHub Actions.

## Security-advisor review and remaining issues

Supabase security advisors were read after the migration. New SECURITY DEFINER RPCs are callable by authenticated users by design but check admin authorization internally; those checks were exercised in rolled-back SQL tests. The older anonymous learning-event RPC and compromised-password-protection setting still require review before production. The private catalog receipt table has RLS with no policies intentionally because it is not a browser-facing table. No claim that all security findings are eliminated is made.

References:
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Commercial hosting preparation

render.yaml and scripts/build-store.mjs were added. The build uses a frontend-only allowlist, does not copy SQL, tests, docs, or private exports, and uses the honey app for the built site's root index. Security headers and an uncached service worker are configured. The web-app manifest retains its identity, scope and start URL while adopting honey branding. The service worker remains app-scoped and never clears localStorage or IndexedDB.

No Render service has been provisioned or deployed in this release. Render and Stripe connection options were presented to the owner; they are not assumed completed. On a commercial host, verify assigned domain, HTTPS, Supabase auth redirects and existing edge-function CORS/Stripe return URLs before any real checkout. GitHub Pages remains a preparation preview; its published limits do not permit running an e-commerce business on its free hosting.

## Still required before accepting customer money

A selected supplier with written terms and a tested sample; real honey products and accurate labels/photos/prices; confirmed shipping and damage/refund procedures; seller identity and contact information; applicable food-business/licensing and tax review; approved policies in the customer's language; working capital or supplier credit terms; commercial hosting; verified Stripe Live configuration; full account, payment, webhook, stock, supplier-dispatch, delivery, delay/cancellation and refund testing; provider review and a real two-account messaging-translation test; and a full database plus image-file backup with a tested restore process.

Supplier ordering, stock synchronization, courier label purchasing, full automatic refunds, marketing campaigns and custom native App Store distribution were not implemented or represented as working by this release. Existing legacy product/account/support code still needs a complete production regression pass. No money, sales or revenue outcome is guaranteed.

Official source material reviewed for the preparation checklist:
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- https://render.com/docs/static-sites
- https://render.com/docs/blueprint-spec
- https://www.michigan.gov/mdard/licensing/food/food-establishment-license
- https://www.michigan.gov/taxes/business-taxes/sales-use-tax
- https://www.fda.gov/regulatory-information/search-fda-guidance-documents/guidance-industry-proper-labeling-honey-and-honey-products
- https://www.cdc.gov/infant-toddler-nutrition/foods-and-drinks/foods-and-drinks-to-avoid-or-limit.html
- https://www.ftc.gov/business-guidance/resources/business-guide-ftcs-mail-internet-or-telephone-order-merchandise-rule

## Safe rollback

Restore app.html and seller.html from the parent commits to remove the new navigation while keeping all database rows. New tables/RPCs are additive and need not be deleted. Preserve operational records and product drafts before any future destructive change. Use revision history as an audit trail; it is not a substitute for tested offsite backups.

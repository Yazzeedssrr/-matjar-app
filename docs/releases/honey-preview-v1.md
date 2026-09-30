# Honey-only storefront preview — honey-preview-v1

## Requested scope

The owner requested a honey-only store for now and car parts later, with dropshipping as the intended fulfillment model.

## Implemented

- The existing app.html entry point now presents MAKHRAJ HONEY with a warm honey-colored hero, honey buying guide, source-linked infant safety warning, and an explicit prelaunch notice.
- New honey-specific copy is provided in Arabic, English, Spanish, French and Turkish. Existing localization and messaging controllers are retained; this is not a claim that all legacy interface strings are translated.
- Added and activated the honey category. Existing other categories were deactivated, not deleted.
- The four existing published auto-parts records were moved to draft. Their eight image records, variants, stock quantities and product contents remain stored. They can be reviewed and republished with their category later.
- Store display name changed to MAKHRAJ HONEY in Arabic. Checkout was disabled for the existing test-mode store pending supplier and launch readiness. Stripe keys and test-mode configuration were not changed.
- No honey products, supplier stock quantities, supplier contracts or real orders were invented.
- No automatic supplier fulfillment integration was added. A supplier still needs to be selected and approved, and its ordering/stock/tracking method verified.
- The existing seller.html, safe product editor, accounts and support-message records were not replaced.
- The service worker cache version changed within the existing app-specific cache prefix; localStorage and IndexedDB were not cleared.

## Verification actually performed

- Before/after database digests matched for product contents excluding the intentional status/timestamp changes, product variants, product image records, orders, profiles, and variant costs.
- JavaScript syntax check passed for the new honey module.
- HTML checks confirmed unique IDs and preservation of 25 expected legacy controller hooks.
- Isolated Chromium tests covered six language/viewport combinations, preservation of a typed input during language changes, hidden compatibility hooks, guide navigation, and no horizontal overflow with a controlled base shell.
- These are NOT signed-in end-to-end checkout tests, actual Safari tests, or certification of the legacy translation provider.

## Before taking money

A verified supplier, real labeled products, shipping/damage/refund terms, stock handling, applicable food-business requirements, and verified live payment configuration are still required. The supplier may charge before payment-processor payouts arrive; do not describe dropshipping as automatically requiring no working capital.

Review production hosting before launch. GitHub Pages is being used as a preparation preview, not as the intended live commercial checkout host. Its published usage limits disallow using Pages as free hosting to run an e-commerce business.

## Rollback

Use Git history to restore the prior app.html and service worker if needed; keep the database. Review category activation and product publication explicitly before restoring public listings. Do not delete product, order, account, image or message records.

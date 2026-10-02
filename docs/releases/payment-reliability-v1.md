# Payment reliability — 2026-10-02

## Deployed

- Added a fail-closed checkout_enabled guard to create_online_order_for_user.
- Replaced multiple webhook REST mutations with one service-role-only, security-invoker RPC.
- Ledger row locking serializes duplicate events; only processed events are acknowledged as duplicates.
- Ledger, payment, order and inventory release now commit together. Failed transactions remain retryable.
- Paid events must match the registered Checkout session, order, amount and currency.
- Expiration/failure events cannot downgrade already-paid orders.
- Malformed or stale signature timestamps are rejected.

## Verified without charging

- Five mocked Edge Function tests: signature, timestamp, RPC delegation, duplicate and retryable failure.
- Rolled-back database tests: retry of an existing failed ledger entry, duplicate acknowledgement, amount rejection, failure rollback, checkout gate and RPC permissions.
- Re-ran database assertions after migration deployment.
- Existing order/payment/event counts stayed at one each. No customer records, inventory or carts were changed by the tests.
- Checkout remains disabled; test_mode remains true.

## Limits

No new Stripe Checkout purchase or live charge was performed. Existing historical sandbox payment is not a substitute for a new end-to-end checkout test. Full live-payment readiness is not certified.

The security advisor reports existing privileged RPC warnings and disabled leaked-password protection, outside these two fixes. New webhook RPC is not executable by anon or authenticated roles.

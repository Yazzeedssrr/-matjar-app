# Account completion and unified administration

- Incomplete profiles now receive an account completion prompt after storefront sign-in, including Google and email sessions.
- Name, unique username and phone are stored in the existing profile. Existing names, roles and accounts are preserved.
- Address is optional after profile save; payment details remain in the checkout flow.
- Completed profiles do not prompt again. Skipping postpones completion; it does not falsely mark the profile complete.
- Server constraints enforce username format/uniqueness and required completion fields.
- Old admin.html redirects to seller.html, retaining sessions.
- Genuine and sandbox paid totals are shown separately. The prior $7 sandbox payment is not genuine revenue; the newer $0 total was correct.

Validation: frontend regression tests; rolled-back authenticated database updates verifying self-edit, validation, role protection and ownership. No payment settings enabled, accounts merged or customer records replaced.

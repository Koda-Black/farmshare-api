# Integration & Testing Guide

## Frontend Integration
- Frontend repo: `git@github.com:Koda-Black/farmshare-marketplace.git`
- Set `FRONTEND_URL` in backend `.env` to the deployed frontend domain.
- CORS and CSP restrict origins to `FRONTEND_URL`.

## End-to-End Flow
1. Signup (role buyer/vendor) → JWT issued.
2. Verification for vendors → start, submit docs, await approval.
3. Create pool (vendor) with curated product.
4. Buyer joins pool → payment intent (Stripe/Paystack).
5. Provider webhook → pending finalized → subscription created.
6. Pool filled → delivery deadline set; after +24h, escrow release.

## Testing
- Unit: `yarn test`.
- E2E: add Playwright/Cypress in frontend; mock Paystack/Stripe webhooks.
- Webhook signature verification required: Stripe (`stripe-signature`), Paystack (`x-paystack-signature`).

## Deployment
- Configure env per `Env_Setup.md`.
- Ensure HTTPS, reverse proxy preserves raw body for webhook routes.

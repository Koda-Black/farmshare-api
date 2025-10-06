# Payments (Stripe and Paystack)

## Overview

Payments are unified behind a single flow:

- Initiate: `POST /payments/pay` with `InitPaymentDto`.
- Pending intent saved in `PendingSubscription` with `gateway` and provider IDs.
- Success:
  - Stripe: `POST /payments/stripe/webhook` (raw body + signature).
  - Paystack: `POST /payments/paystack/verify?reference=...`.
- Finalize: atomic transaction decrements slots, creates `Subscription`, updates `PendingSubscription` to `SUCCESS`, optionally auto-clones pool.

## DTO

Fields: `poolId` (UUID), `method` (STRIPE|PAYSTACK), `slots` (>=1), `waybillWithin` or `waybillOutside` (one must be true).

## Prisma

- `Subscription.paymentMethod` uses `PaymentGateway` enum.
- `PendingSubscription.gateway` indicates provider; `stripeSessionId` or `paystackRef` stores provider reference.

## Stripe

- Requires `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
- Webhook route uses raw JSON body; signature validated in `StripeService.constructEvent`.

## Paystack

- Requires `PAYSTACK_SECRET_KEY` and `PAYSTACK_CALLBACK_URL`.
- Amount is sent in kobo; includes metadata with `pendingId`.

## Environment

Required vars:

- DATABASE_URL
- FRONTEND_URL
- PAYSTACK_SECRET_KEY
- PAYSTACK_CALLBACK_URL
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET

## Testing

Run unit tests:

```
yarn test
```

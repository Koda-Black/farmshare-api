# Changelog

## Unreleased

- Harmonized Stripe and Paystack payment flows under `PaymentsService.init`.
- Prisma: `Subscription.paymentMethod` changed from `string` to `PaymentGateway` enum.
- Stripe: fixed SDK usage and webhook signature verification.
- Added unit tests for `PaymentsService` and `UserService`.
- Documentation: `docs/payments.md` and updated `README.md` with setup/testing.

## Notes on Breaking Changes

- Database migration required due to `paymentMethod` enum change.

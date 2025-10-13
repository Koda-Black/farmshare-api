# API Endpoints

## Auth & Users

- POST /auth/signup
- POST /auth/login
- GET /users/me
- PUT /users/me/settings

## Verification

- POST /verification/start
- POST /verification/submit
- GET /verification/status
- POST /admin/verification/override

## Catalog

- GET /catalog
- POST /admin/catalog/create

## Pools

- POST /pools/create
- GET /pools
- POST /pools/:poolId/join (initiate payment)

## Payments & Escrow

- POST /payments/pay
- POST /payments/paystack/verify
- POST /payments/paystack/webhook
- POST /payments/stripe/webhook
- GET /payments/escrow/:poolId
- POST /payments/release
- POST /payments/partial_release

## Disputes

- POST /disputes/create
- GET /disputes/:id
- POST /admin/disputes/resolve

## Notifications

- POST /notifications/send
- GET /notifications/me

## Admin

- GET /admin/vendors
- POST /admin/vendors/verify
- POST /admin/catalog/approve_item_request
- POST /admin/payments/manual_release
- POST /admin/payments/manual_refund
- GET /admin/audit_logs
- POST /admin/override_deadline
- POST /admin/force_cancel_pool

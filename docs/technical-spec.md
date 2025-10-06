# FarmShare Backend Technical Specification

## 1. System Overview & Components

- Auth & RBAC, Users & Verification, Pools & Marketplace, Payments & Escrow, Disputes & Resolution, Notifications, Admin, Webhooks, Audit & Logging, Background Workers.
- Event flow: signup → verification → create pool → buyer join + escrow hold → pool filled → delivery deadline → 24h grace → auto-release or dispute.

## 2. Database Schema (PostgreSQL via Prisma)

- Users (role buyer/vendor/admin, verification fields, bank, MFA, settings)
- ProductCatalog (curated list)
- Pools (vendor, product, price_total, slots_count, price_per_slot, commission_rate, deadlines, status)
- PoolSlot (buyer reservations, amount, payment link)
- Transactions (escrow_hold/release/refund)
- EscrowEntry (held/released/withheld computations)
- Dispute (status, evidence, distribution)
- Notification (type, medium, payload)
- AdminAuditLog (actions)
- See `prisma/schema.prisma` for fields, constraints, indexes.

## 3. API Endpoints

- Auth, Users, Verification, Catalog, Pools, Payments & Escrow, Disputes, Notifications, Admin, Webhooks
- DTO validation using class-validator; RBAC via guards.
- Refer to README and route decorators; expand as controllers are implemented.

## 4. Business & Validation Rules

- Vendor verification required; lock pool after first join.
- Slot transitions: pending_payment → paid → confirmed.
- Escrow calc: commission = total_collected \* 0.05; net_for_vendor = total - commission - fees.
- Home delivery cost included in escrow.
- Dispute thresholds: 25% partial hold, 60% full hold.

## 5. Background Workers & Queues

- BullMQ queues for verification, webhooks, scheduled releases, notifications, audit logging.

## 6. Security & Auth

- JWT with scopes, rate limiting, S3 presigned uploads, audit trails, PII retention.

## 7. Admin Console Functions

- Vendor verification dashboard, catalog management, escrow monitoring, disputes handling, audit logs.

## 8. Edge Cases & Error Handling

- Bank changes, payment failures, expired verification, partial pools, seasonal pauses.

## 9. Observability & Monitoring

- Structured logs, metrics, alerts.

## 10. Tech Stack

- Node.js/NestJS, PostgreSQL/Prisma, Redis/BullMQ, Paystack, S3, FCM/SendGrid/Twilio, Jest.

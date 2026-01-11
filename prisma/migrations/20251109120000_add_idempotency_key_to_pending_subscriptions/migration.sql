-- Add idempotency key column to PendingSubscription table
ALTER TABLE "PendingSubscription" ADD COLUMN "idempotencyKey" TEXT;

-- Add unique constraint for idempotency key
CREATE UNIQUE INDEX "PendingSubscription_idempotencyKey_key" ON "PendingSubscription"("idempotencyKey");

-- Add index for idempotency key queries
CREATE INDEX "PendingSubscription_idempotencyKey_idx" ON "PendingSubscription"("idempotencyKey");
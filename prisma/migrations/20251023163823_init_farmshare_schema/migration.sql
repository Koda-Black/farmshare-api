-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BUYER', 'VENDOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('OPEN', 'FILLED', 'IN_DELIVERY', 'COMPLETED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('STRIPE', 'PAYSTACK');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GovtIdType" AS ENUM ('NIN', 'VOTER', 'DL', 'PASSPORT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('INITIATED', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('ESCROW_HOLD', 'ESCROW_RELEASE', 'REFUND', 'FEE');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('VERIFICATION', 'PAYMENT', 'POOL_UPDATE', 'DISPUTE', 'ADMIN');

-- CreateEnum
CREATE TYPE "NotificationMedium" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "PoolCategory" AS ENUM ('COW', 'GOAT_MEAT', 'FISH', 'STOCKFISH', 'MILK', 'YAM', 'HONEY_BEANS', 'CRAYFISH', 'IRISH_POTATOES', 'ONIONS', 'SWEET_POTATOES', 'PALM_OIL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "probationStatus" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "googleId" TEXT,
    "role" "Role" NOT NULL DEFAULT 'BUYER',
    "refreshToken" TEXT,
    "avatarUrl" TEXT,
    "otp" TEXT,
    "otpExpiry" TIMESTAMP(3),
    "resetToken" TEXT,
    "govtIdType" "GovtIdType",
    "govtIdNumber" TEXT,
    "govtIdFiles" TEXT[],
    "ninVerified" BOOLEAN NOT NULL DEFAULT false,
    "businessRegistrationNumber" TEXT,
    "taxId" TEXT,
    "bankAccountId" TEXT,
    "bankVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'NONE',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "settings" JSONB,
    "lastActive" TIMESTAMP(3),
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "otp" TEXT NOT NULL,
    "otpExpiry" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pool" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceTotal" DECIMAL(18,2) NOT NULL,
    "slotsCount" INTEGER NOT NULL,
    "pricePerSlot" DECIMAL(18,2) NOT NULL,
    "commissionRate" DECIMAL(5,4) NOT NULL DEFAULT 0.05,
    "allowHomeDelivery" BOOLEAN NOT NULL DEFAULT false,
    "homeDeliveryCost" DECIMAL(18,2),
    "lockAfterFirstJoin" BOOLEAN NOT NULL DEFAULT true,
    "maxSlots" INTEGER,
    "minUnitsConstraint" INTEGER DEFAULT 1,
    "timezone" TEXT,
    "deliveryDeadlineUtc" TIMESTAMP(3),
    "filledAt" TIMESTAMP(3),
    "status" "PoolStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "slots" INTEGER NOT NULL,
    "amountPaid" DECIMAL(18,2) NOT NULL,
    "paymentMethod" "PaymentGateway" NOT NULL,
    "paymentRef" TEXT NOT NULL,
    "deliveryFee" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "slots" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gateway" "PaymentGateway" NOT NULL,
    "stripeSessionId" TEXT,
    "paystackRef" TEXT,
    "deliveryFee" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "details" JSONB,
    "externalReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "allowedUnits" JSONB,
    "seasonalFlag" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "adminManaged" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolSlot" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "slotsReserved" INTEGER NOT NULL,
    "unitCount" INTEGER NOT NULL,
    "amountPaid" DECIMAL(18,2) NOT NULL,
    "paymentId" TEXT,
    "status" "SlotStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "PoolSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "externalTxnId" TEXT,
    "userId" TEXT NOT NULL,
    "poolId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "fees" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
    "status" "TransactionStatus" NOT NULL DEFAULT 'INITIATED',
    "type" "TransactionType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscrowEntry" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "totalHeld" DECIMAL(18,2) NOT NULL,
    "releasedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
    "withheldAmount" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
    "withheldReason" TEXT,
    "computations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscrowEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "raisedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceFiles" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'open',
    "complainantCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "distribution" JSONB,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "medium" "NotificationMedium" NOT NULL,
    "payload" JSONB NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_email_verificationStatus_idx" ON "User"("email", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PendingSignup_email_key" ON "PendingSignup"("email");

-- CreateIndex
CREATE INDEX "Pool_status_filledAt_idx" ON "Pool"("status", "filledAt");

-- CreateIndex
CREATE INDEX "Subscription_userId_poolId_idx" ON "Subscription"("userId", "poolId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingSubscription_stripeSessionId_key" ON "PendingSubscription"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingSubscription_paystackRef_key" ON "PendingSubscription"("paystackRef");

-- CreateIndex
CREATE INDEX "PendingSubscription_status_createdAt_idx" ON "PendingSubscription"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Verification_userId_status_idx" ON "Verification"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCatalog_sku_key" ON "ProductCatalog"("sku");

-- CreateIndex
CREATE INDEX "ProductCatalog_active_seasonalFlag_idx" ON "ProductCatalog"("active", "seasonalFlag");

-- CreateIndex
CREATE UNIQUE INDEX "PoolSlot_paymentId_key" ON "PoolSlot"("paymentId");

-- CreateIndex
CREATE INDEX "PoolSlot_poolId_status_idx" ON "PoolSlot"("poolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_externalTxnId_key" ON "Transaction"("externalTxnId");

-- CreateIndex
CREATE INDEX "Dispute_poolId_status_idx" ON "Dispute"("poolId", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_type_createdAt_idx" ON "Notification"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminId_createdAt_idx" ON "AdminAuditLog"("adminId", "createdAt");

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingSubscription" ADD CONSTRAINT "PendingSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingSubscription" ADD CONSTRAINT "PendingSubscription_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolSlot" ADD CONSTRAINT "PoolSlot_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolSlot" ADD CONSTRAINT "PoolSlot_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolSlot" ADD CONSTRAINT "PoolSlot_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowEntry" ADD CONSTRAINT "EscrowEntry_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

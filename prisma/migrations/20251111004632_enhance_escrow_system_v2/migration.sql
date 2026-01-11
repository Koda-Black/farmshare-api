-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('HELD', 'RELEASABLE', 'RELEASED', 'DISPUTED');

-- AlterTable
ALTER TABLE "EscrowEntry" ADD COLUMN     "deliveryConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "paymentSource" TEXT,
ADD COLUMN     "releaseAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'HELD',
ADD COLUMN     "transferRecipientCode" TEXT,
ADD COLUMN     "transferReference" TEXT,
ADD COLUMN     "vendorId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "escrowEntryId" TEXT;

-- CreateIndex
CREATE INDEX "EscrowEntry_poolId_status_idx" ON "EscrowEntry"("poolId", "status");

-- CreateIndex
CREATE INDEX "EscrowEntry_vendorId_status_idx" ON "EscrowEntry"("vendorId", "status");

-- CreateIndex
CREATE INDEX "EscrowEntry_releaseAt_idx" ON "EscrowEntry"("releaseAt");

-- CreateIndex
CREATE INDEX "EscrowEntry_paymentReference_idx" ON "EscrowEntry"("paymentReference");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_escrowEntryId_fkey" FOREIGN KEY ("escrowEntryId") REFERENCES "EscrowEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowEntry" ADD CONSTRAINT "EscrowEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

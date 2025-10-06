/*
  Warnings:

  - The `status` column on the `PendingSubscription` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[paystackRef]` on the table `PendingSubscription` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `gateway` to the `PendingSubscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category` to the `Pool` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slotsLeft` to the `Pool` table without a default value. This is not possible if the table is not empty.
  - Added the required column `amountPaid` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paymentMethod` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paymentRef` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('STRIPE', 'PAYSTACK');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "PoolCategory" AS ENUM ('COW', 'GOAT_MEAT', 'FISH', 'STOCKFISH', 'MILK', 'YAM', 'HONEY_BEANS', 'CRAYFISH', 'IRISH_POTATOES', 'ONIONS', 'SWEET_POTATOES', 'PALM_OIL');

-- AlterTable
ALTER TABLE "PendingSubscription" ADD COLUMN     "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "gateway" "PaymentGateway" NOT NULL,
ADD COLUMN     "paystackRef" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Pool" ADD COLUMN     "category" "PoolCategory" NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "slotsLeft" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "amountPaid" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "paymentMethod" TEXT NOT NULL,
ADD COLUMN     "paymentRef" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PendingSubscription_paystackRef_key" ON "PendingSubscription"("paystackRef");

-- CreateIndex
CREATE INDEX "PendingSubscription_status_createdAt_idx" ON "PendingSubscription"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Pool_status_category_idx" ON "Pool"("status", "category");

-- CreateIndex
CREATE INDEX "Subscription_userId_poolId_idx" ON "Subscription"("userId", "poolId");

-- CreateIndex
CREATE INDEX "User_email_isVerified_idx" ON "User"("email", "isVerified");

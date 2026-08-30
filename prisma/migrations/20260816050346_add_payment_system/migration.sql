-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('BY_COMPANY', 'BY_AGENT');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "paymentMode" "PaymentMode" NOT NULL DEFAULT 'BY_AGENT';

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "agentId" INTEGER,
    "scope" "PaymentMode" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "periodMonth" TEXT NOT NULL,
    "note" TEXT,
    "recordedById" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_companyId_periodMonth_idx" ON "Payment"("companyId", "periodMonth");

-- CreateIndex
CREATE INDEX "Payment_companyId_scope_idx" ON "Payment"("companyId", "scope");

-- CreateIndex
CREATE INDEX "Payment_recordedById_idx" ON "Payment"("recordedById");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_agentId_periodMonth_key" ON "Payment"("agentId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_companyId_periodMonth_partial_key" ON "Payment"("companyId", "periodMonth") WHERE "agentId" IS NULL;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

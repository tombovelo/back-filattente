/*
  Warnings:

  - You are about to drop the column `calledByAgentId` on the `QueueTicket` table. All the data in the column will be lost.
  - You are about to drop the `Agent` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'COMPANY_ADMIN', 'AGENT');

-- DropForeignKey
ALTER TABLE "Agent" DROP CONSTRAINT "Agent_assignedCounterId_fkey";

-- DropForeignKey
ALTER TABLE "Agent" DROP CONSTRAINT "Agent_companyId_fkey";

-- DropForeignKey
ALTER TABLE "QueueTicket" DROP CONSTRAINT "QueueTicket_calledByAgentId_fkey";

-- AlterTable
ALTER TABLE "QueueTicket" DROP COLUMN "calledByAgentId",
ADD COLUMN     "calledByUserId" INTEGER;

-- DropTable
DROP TABLE "Agent";

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'AGENT',
    "companyId" INTEGER,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "assignedCounterId" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_username_key" ON "User"("companyId", "username");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_assignedCounterId_fkey" FOREIGN KEY ("assignedCounterId") REFERENCES "ServiceCounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_calledByUserId_fkey" FOREIGN KEY ("calledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

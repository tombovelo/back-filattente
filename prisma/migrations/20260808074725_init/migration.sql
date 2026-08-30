-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('WAITING', 'CALLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "facebookPageAccessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCounter" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'A',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ticketCounter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "assignedCounterId" INTEGER,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueTicket" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "counterId" INTEGER NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "messengerPsid" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "calledByAgentId" INTEGER,

    CONSTRAINT "QueueTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE INDEX "ServiceCounter_companyId_isActive_idx" ON "ServiceCounter"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCounter_companyId_name_key" ON "ServiceCounter"("companyId", "name");

-- CreateIndex
CREATE INDEX "Agent_companyId_idx" ON "Agent"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_companyId_username_key" ON "Agent"("companyId", "username");

-- CreateIndex
CREATE INDEX "QueueTicket_companyId_status_idx" ON "QueueTicket"("companyId", "status");

-- CreateIndex
CREATE INDEX "QueueTicket_companyId_status_createdAt_idx" ON "QueueTicket"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "QueueTicket_counterId_status_createdAt_idx" ON "QueueTicket"("counterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "QueueTicket_messengerPsid_status_idx" ON "QueueTicket"("messengerPsid", "status");

-- CreateIndex
CREATE INDEX "QueueTicket_messengerPsid_createdAt_idx" ON "QueueTicket"("messengerPsid", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QueueTicket_counterId_ticketNumber_key" ON "QueueTicket"("counterId", "ticketNumber");

-- AddForeignKey
ALTER TABLE "ServiceCounter" ADD CONSTRAINT "ServiceCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_assignedCounterId_fkey" FOREIGN KEY ("assignedCounterId") REFERENCES "ServiceCounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "ServiceCounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_calledByAgentId_fkey" FOREIGN KEY ("calledByAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

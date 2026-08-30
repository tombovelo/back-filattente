-- AlterTable
ALTER TABLE "QueueTicket" ADD COLUMN     "patientDeviceId" INTEGER,
ALTER COLUMN "messengerPsid" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PatientDevice" (
    "id" SERIAL NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'expo',
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientDevice_deviceToken_key" ON "PatientDevice"("deviceToken");

-- CreateIndex
CREATE INDEX "QueueTicket_patientDeviceId_status_idx" ON "QueueTicket"("patientDeviceId", "status");

-- CreateIndex
CREATE INDEX "QueueTicket_patientDeviceId_createdAt_idx" ON "QueueTicket"("patientDeviceId", "createdAt");

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_patientDeviceId_fkey" FOREIGN KEY ("patientDeviceId") REFERENCES "PatientDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

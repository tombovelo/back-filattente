-- DropIndex
DROP INDEX IF EXISTS "QueueTicket_messengerPsid_status_idx";
DROP INDEX IF EXISTS "QueueTicket_messengerPsid_createdAt_idx";

-- AlterTable
ALTER TABLE "Company" DROP COLUMN IF EXISTS "facebookPageAccessToken";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "facebookPageId";
ALTER TABLE "QueueTicket" DROP COLUMN IF EXISTS "messengerPsid";

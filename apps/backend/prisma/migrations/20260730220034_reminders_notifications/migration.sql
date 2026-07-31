-- DropForeignKey
ALTER TABLE "bots" DROP CONSTRAINT "bots_ownerId_fkey";

-- AlterTable
ALTER TABLE "bots" ALTER COLUMN "ownerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "channel_members" ADD COLUMN     "muted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notifyDmOnly" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "bots" ADD CONSTRAINT "bots_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

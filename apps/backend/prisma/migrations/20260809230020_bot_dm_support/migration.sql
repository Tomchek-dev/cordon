-- AlterTable
ALTER TABLE "bots" ADD COLUMN     "dmEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "botId" TEXT;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

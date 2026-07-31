-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MOD', 'MEMBER');

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'BUSY';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "attachmentMimeType" TEXT,
ADD COLUMN     "attachmentName" TEXT,
ADD COLUMN     "attachmentSize" INTEGER,
ADD COLUMN     "attachmentUrl" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'MEMBER';

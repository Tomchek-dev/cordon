-- CreateEnum
CREATE TYPE "CalendarVisibility" AS ENUM ('PERSONAL', 'GENERAL');

-- CreateEnum
CREATE TYPE "DockDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "DockUnitType" AS ENUM ('BIN', 'PALLET');

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "visibility" "CalendarVisibility" NOT NULL DEFAULT 'PERSONAL',
    "createdById" TEXT NOT NULL,
    "channelId" TEXT,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_rotations" (
    "channelId" TEXT NOT NULL,
    "memberOrder" TEXT[],
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_rotations_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "pickups" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "labelUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dock_logs" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "direction" "DockDirection" NOT NULL,
    "unitType" "DockUnitType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "destination" TEXT,
    "loggedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dock_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_rotations" ADD CONSTRAINT "pickup_rotations_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dock_logs" ADD CONSTRAINT "dock_logs_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dock_logs" ADD CONSTRAINT "dock_logs_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

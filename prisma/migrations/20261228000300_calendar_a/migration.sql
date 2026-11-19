-- CAL1.1 calendar_a — ปฏิทินส่วนตัวของเลขา AI (docs/modules/32-secretary-calendar.md §2) · additive ล้วน · SQL จาก prisma migrate diff
-- CreateEnum
CREATE TYPE "CalItemKind" AS ENUM ('REMINDER', 'EVENT');

-- CreateEnum
CREATE TYPE "CalRepeat" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "CalItemStatus" AS ENUM ('DRAFT', 'OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalItemSource" AS ENUM ('APP', 'CHAT', 'SUGGEST');

-- CreateEnum
CREATE TYPE "CalLinkType" AS ENUM ('CRM_CONTACT', 'CRM_DEAL', 'ACCOUNT_DOC', 'KANBAN_CARD');

-- CreateEnum
CREATE TYPE "CalProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "CalLinkStatus" AS ENUM ('ACTIVE', 'NEEDS_RECONNECT');

-- CreateTable
CREATE TABLE "CalItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "CalItemKind" NOT NULL DEFAULT 'REMINDER',
    "title" TEXT NOT NULL,
    "note" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "repeat" "CalRepeat" NOT NULL DEFAULT 'NONE',
    "repeatDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "leadMinutes" INTEGER NOT NULL DEFAULT 0,
    "linkType" "CalLinkType",
    "linkId" TEXT,
    "linkSystemId" TEXT,
    "status" "CalItemStatus" NOT NULL DEFAULT 'OPEN',
    "doneAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "occursAt" TIMESTAMP(3) NOT NULL,
    "nextFireAt" TIMESTAMP(3),
    "firedOccAt" TIMESTAMP(3),
    "lastFiredAt" TIMESTAMP(3),
    "snoozeUntil" TIMESTAMP(3),
    "nagAt" TIMESTAMP(3),
    "fireAttempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "source" "CalItemSource" NOT NULL DEFAULT 'APP',
    "roomId" TEXT,
    "externalId" TEXT,
    "externalEtag" TEXT,
    "syncDirty" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalPref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "morningOn" BOOLEAN NOT NULL DEFAULT true,
    "morningMinute" INTEGER NOT NULL DEFAULT 480,
    "eveningOn" BOOLEAN NOT NULL DEFAULT false,
    "eveningMinute" INTEGER NOT NULL DEFAULT 1140,
    "sources" JSONB NOT NULL DEFAULT '{}',
    "travelMinutes" INTEGER NOT NULL DEFAULT 0,
    "lastMorningDay" TEXT,
    "lastEveningDay" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalPref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CalProvider" NOT NULL DEFAULT 'GOOGLE',
    "email" TEXT NOT NULL,
    "tokenBox" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "calendars" JSONB NOT NULL DEFAULT '[]',
    "exportCalendarId" TEXT,
    "exportKinds" TEXT[] DEFAULT ARRAY['EVENT']::TEXT[],
    "status" "CalLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalExternalEvent" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "etag" TEXT NOT NULL,
    "sharkRef" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalExternalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalItem_userId_tenantId_status_occursAt_idx" ON "CalItem"("userId", "tenantId", "status", "occursAt");

-- CreateIndex
CREATE INDEX "CalItem_status_nextFireAt_idx" ON "CalItem"("status", "nextFireAt");

-- CreateIndex
CREATE INDEX "CalItem_userId_roomId_idx" ON "CalItem"("userId", "roomId");

-- CreateIndex
CREATE INDEX "CalItem_userId_syncDirty_idx" ON "CalItem"("userId", "syncDirty");

-- CreateIndex
CREATE INDEX "CalItem_tenantId_idx" ON "CalItem"("tenantId");

-- CreateIndex
CREATE INDEX "CalPref_tenantId_idx" ON "CalPref"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CalPref_userId_tenantId_key" ON "CalPref"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "CalLink_status_lastSyncAt_idx" ON "CalLink"("status", "lastSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalLink_userId_provider_key" ON "CalLink"("userId", "provider");

-- CreateIndex
CREATE INDEX "CalExternalEvent_userId_startAt_idx" ON "CalExternalEvent"("userId", "startAt");

-- CreateIndex
CREATE INDEX "CalExternalEvent_linkId_sharkRef_idx" ON "CalExternalEvent"("linkId", "sharkRef");

-- CreateIndex
CREATE UNIQUE INDEX "CalExternalEvent_linkId_calendarId_externalId_key" ON "CalExternalEvent"("linkId", "calendarId", "externalId");

-- AddForeignKey
ALTER TABLE "CalExternalEvent" ADD CONSTRAINT "CalExternalEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "CalLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "PlatformAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdByPlatformUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementDismiss" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementDismiss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformAnnouncement_publishedAt_idx" ON "PlatformAnnouncement"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementDismiss_tenantId_announcementId_key" ON "AnnouncementDismiss"("tenantId", "announcementId");

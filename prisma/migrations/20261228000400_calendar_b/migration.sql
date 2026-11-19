-- calendar_b (review b B1/M3/m7) — additive ล้วน
ALTER TABLE "CalItem" ADD COLUMN "externalCalendarId" TEXT;
ALTER TABLE "CalItem" ADD COLUMN "userEditedAt" TIMESTAMP(3);

CREATE TABLE "CalRoomCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'AGENDA',
    "fromDay" TEXT NOT NULL,
    "toDay" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalRoomCard_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CalRoomCard_userId_roomId_idx" ON "CalRoomCard"("userId", "roomId");
CREATE INDEX "CalRoomCard_tenantId_idx" ON "CalRoomCard"("tenantId");

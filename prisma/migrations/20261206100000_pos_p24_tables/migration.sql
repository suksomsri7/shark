-- POS P2.4 — โหมดโต๊ะใน POS: รอบร่างของโต๊ะ (PosHeldCart.tableSessionId · มติ CD6) + "ต้องเก็บโต๊ะ" (RestaurantTable.dirtySince) +
--   โต๊ะจองแบบย่อ (RestaurantReservation · มติ Q2) · เพิ่มล้วน · เขียนมือ (มติผู้คุม ruling 15: ชื่อ/คำสั่งตามตารางชื่อแถว 6 ของ wo-notes/pos-P2.4-oracle.md)
-- 🔴 ไม่มี DROP/RENAME/UPDATE/DELETE/INSERT/ALTER COLUMN/ADD VALUE · ไม่มี backfill (dirtySince null = สะอาด ⇒ ผังเดิมไม่เปลี่ยนตอน deploy)
-- 🔴 ไม่สร้าง one_open_session_per_table ที่นี่ (มติ Q9 → runbook P6.1: CREATE UNIQUE INDEX CONCURRENTLY หลังนับแถวซ้ำแบบอ่านอย่างเดียว ·
--    ระหว่างนี้ openSession ถือ pg_advisory_xact_lock ต่อโต๊ะ)
-- เขียนมือ (prisma ประกาศ partial ไม่ได้ — 🔴 ห้ามลบ): partial unique "PosHeldCart_tableSessionId_held_key" = รอบร่าง HELD ได้ 1 แถวต่อ session
-- ADD COLUMN ที่ nullable ไม่มี default = metadata-only (ไม่ rewrite ตาราง) · ตารางใหม่ว่าง ⇒ index สร้างทันที
SET lock_timeout = '3s';

-- AlterTable: รอบร่างของโต๊ะ (null = บิลพักปกติ)
ALTER TABLE "PosHeldCart" ADD COLUMN IF NOT EXISTS "tableSessionId" TEXT;

-- CreateIndex (partial · เขียนมือ): HELD ≤ 1 แถวต่อ session
CREATE UNIQUE INDEX IF NOT EXISTS "PosHeldCart_tableSessionId_held_key" ON "PosHeldCart"("tableSessionId") WHERE "status" = 'HELD' AND "tableSessionId" IS NOT NULL;

-- AlterTable: ต้องเก็บโต๊ะ (null = สะอาด)
ALTER TABLE "RestaurantTable" ADD COLUMN IF NOT EXISTS "dirtySince" TIMESTAMP(3);

-- CreateEnum (รันซ้ำได้)
DO $$ BEGIN CREATE TYPE "RestReservationStatus" AS ENUM ('BOOKED', 'SEATED', 'CANCELLED', 'NO_SHOW'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RestaurantReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "tableId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "partySize" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "holdFromMinutes" INTEGER NOT NULL DEFAULT 15,
    "status" "RestReservationStatus" NOT NULL DEFAULT 'BOOKED',
    "sessionId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RestaurantReservation_tenantId_idx" ON "RestaurantReservation"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RestaurantReservation_unitId_at_idx" ON "RestaurantReservation"("unitId", "at");

RESET lock_timeout;

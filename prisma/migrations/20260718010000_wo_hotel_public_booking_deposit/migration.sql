-- WO Hotel public booking — ลูกค้าจองห้องเอง (public/no-auth) + จ่ายมัดจำ PromptPay
-- additive ปลอดภัย (mirror booking Wave3-A deposit + queue publicToken)
-- HotelRoomType.depositSatang = มัดจำต่อการจอง (0 = ไม่ต้องมัดจำ) — ร้านตั้งเอง
-- HotelReservation: publicToken (ลิงก์สถานะลูกค้า) + snapshot มัดจำ + เวลารับ + บิล POS ของมัดจำ
-- publicToken เป็น NULLable (แถวเดิมได้ NULL — Postgres ยอมให้ NULL ซ้ำใน unique index) · แถวใหม่ Prisma ปั๊ม cuid()

-- AlterTable
ALTER TABLE "HotelRoomType" ADD COLUMN     "depositSatang" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "HotelReservation" ADD COLUMN     "publicToken" TEXT,
ADD COLUMN     "depositSatang" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "depositPaidAt" TIMESTAMP(3),
ADD COLUMN     "depositSaleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "HotelReservation_publicToken_key" ON "HotelReservation"("publicToken");

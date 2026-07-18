-- WO Rental public storefront — ลูกค้าจองเช่าเอง (public/no-auth) + จ่ายมัดจำ PromptPay
-- additive ปลอดภัย (mirror HotelReservation public booking + deposit)
-- RentalBooking: publicToken (ลิงก์สถานะลูกค้า) + snapshot มัดจำ + เวลารับมัดจำ + บิล POS DEPOSIT
-- publicToken เป็น NULLable (แถวเดิมได้ NULL — Postgres ยอมให้ NULL ซ้ำใน unique index) · แถวใหม่ Prisma ปั๊ม cuid()
-- RentalAsset.depositSatang มีอยู่แล้ว (WO-0050) — ไม่ต้องเพิ่ม

-- AlterTable
ALTER TABLE "RentalBooking" ADD COLUMN     "publicToken" TEXT,
ADD COLUMN     "depositSatang" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "depositPaidAt" TIMESTAMP(3),
ADD COLUMN     "depositSaleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RentalBooking_publicToken_key" ON "RentalBooking"("publicToken");

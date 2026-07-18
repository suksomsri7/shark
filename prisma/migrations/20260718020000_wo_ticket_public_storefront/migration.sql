-- WO Ticket public storefront — ลูกค้าซื้อตั๋วเอง (public/no-auth) → จ่าย PromptPay → ตั๋ว QR → เช็คอิน
-- additive ปลอดภัย (mirror hotel/queue publicToken)
-- TicketOrder.publicToken = ลิงก์สถานะ/ตั๋วของลูกค้า (สุ่มกันเดา) — แถวเดิมได้ NULL
-- publicToken เป็น NULLable (แถวเดิม NULL — Postgres ยอมให้ NULL ซ้ำใน unique index) · แถวใหม่ Prisma ปั๊ม cuid()

-- AlterTable
ALTER TABLE "TicketOrder" ADD COLUMN     "publicToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TicketOrder_publicToken_key" ON "TicketOrder"("publicToken");

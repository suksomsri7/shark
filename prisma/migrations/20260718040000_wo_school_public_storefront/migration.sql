-- WO School public storefront — ผู้ปกครองสมัครเรียน+จ่ายค่าเรียนเอง (public/no-auth) → จ่าย PromptPay → ร้านยืนยัน
-- additive ปลอดภัย (mirror ticket/rental publicToken)
-- SchoolEnrollment.publicToken = ลิงก์สถานะ/ชำระค่าเรียนของผู้ปกครอง (สุ่มกันเดา) — แถวเดิมได้ NULL
-- publicToken เป็น NULLable (แถวเดิม NULL — Postgres ยอมให้ NULL ซ้ำใน unique index) · แถวใหม่ Prisma ปั๊ม cuid()
-- จ่ายเต็มค่าเรียน (ไม่มีมัดจำ) — รับชำระใช้ markPaid เดิม (school-<enrollmentId> → posSale)

-- AlterTable
ALTER TABLE "SchoolEnrollment" ADD COLUMN     "publicToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SchoolEnrollment_publicToken_key" ON "SchoolEnrollment"("publicToken");

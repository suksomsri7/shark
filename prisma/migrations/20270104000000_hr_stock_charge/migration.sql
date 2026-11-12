-- HR H4.6 ▸ เบิกของ/ค่าเสียหายของพนักงาน → รายการหักเงินเดือนที่รออนุมัติ (additive ล้วน: enum ใหม่ + ตารางใหม่ · ไม่แตะตาราง/enum เดิม)
--   INVENTORY_ISSUE มีใน "HrPaySource" แล้ว (H1.3) ⇒ ไม่มี ALTER TYPE · runbook: migrate ก่อน แล้วจึง deploy โค้ด ·
--   ย้อนกลับ = ตารางใหม่ว่าง/ไม่มีผู้อ่าน (โค้ดเดิมไม่รู้จัก) · คืนเงิน (มติผู้คุม Q8 ทาง 2): ไม่มีแถวเงินได้ — ยอดค้างคืนอยู่บนแถวนี้ (refundOwedSatang)

-- CreateEnum
CREATE TYPE "HrStockChargeKind" AS ENUM ('ISSUE', 'DAMAGE');

-- CreateTable
CREATE TABLE "HrStockCharge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "HrStockChargeKind" NOT NULL,
    "requestKey" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "inventorySystemId" TEXT,
    "itemId" TEXT,
    "itemName" TEXT,
    "description" TEXT,
    "qty" INTEGER,
    "unitCostSatang" INTEGER,
    "amountSatang" INTEGER NOT NULL,
    "movementId" TEXT,
    "consentRef" TEXT NOT NULL,
    "consentAt" DATE NOT NULL,
    "consentRecordedById" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnById" TEXT,
    "withdrawOutcome" TEXT,
    "refundOwedSatang" INTEGER,
    "refundReason" TEXT,
    "repaidAt" TIMESTAMP(3),
    "repaidById" TEXT,
    "repaidRef" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrStockCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrStockCharge_systemId_employeeId_idx" ON "HrStockCharge"("systemId", "employeeId");

-- CreateIndex
CREATE INDEX "HrStockCharge_tenantId_idx" ON "HrStockCharge"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HrStockCharge_tenantId_requestKey_key" ON "HrStockCharge"("tenantId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "HrStockCharge_adjustmentId_key" ON "HrStockCharge"("adjustmentId");

-- AddForeignKey
ALTER TABLE "HrStockCharge" ADD CONSTRAINT "HrStockCharge_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique (SQL ดิบ — Prisma ประกาศ WHERE ไม่ได้): 1 movement ของคลัง = 1 รายการหักเท่านั้น
CREATE UNIQUE INDEX "HrStockCharge_tenantId_movementId_key" ON "HrStockCharge"("tenantId", "movementId") WHERE ("movementId" IS NOT NULL);

-- CHECK (ด่านสุดท้ายในฐาน — แอปตรวจก่อนด้วยข้อความไทย) · เงิน = สตางค์จำนวนเต็ม
ALTER TABLE "HrStockCharge" ADD CONSTRAINT "HrStockCharge_amount_check" CHECK ("amountSatang" BETWEEN 1 AND 5000000);
ALTER TABLE "HrStockCharge" ADD CONSTRAINT "HrStockCharge_qty_check" CHECK ("qty" IS NULL OR "qty" BETWEEN 1 AND 999);
ALTER TABLE "HrStockCharge" ADD CONSTRAINT "HrStockCharge_consentRef_check" CHECK (char_length("consentRef") BETWEEN 1 AND 80);
ALTER TABLE "HrStockCharge" ADD CONSTRAINT "HrStockCharge_description_check" CHECK ("description" IS NULL OR char_length("description") <= 120);
ALTER TABLE "HrStockCharge" ADD CONSTRAINT "HrStockCharge_unitCost_check" CHECK ("unitCostSatang" IS NULL OR "unitCostSatang" >= 0);
ALTER TABLE "HrStockCharge" ADD CONSTRAINT "HrStockCharge_outcome_check" CHECK ("withdrawOutcome" IS NULL OR "withdrawOutcome" IN ('REJECTED', 'CANCELLING', 'CANCELLED', 'REFUND_OWED', 'NOOP'));
ALTER TABLE "HrStockCharge" ADD CONSTRAINT "HrStockCharge_refund_check" CHECK ("refundOwedSatang" IS NULL OR ("refundOwedSatang" = "amountSatang" AND "withdrawOutcome" = 'REFUND_OWED'));
ALTER TABLE "HrStockCharge" ADD CONSTRAINT "HrStockCharge_refundReason_check" CHECK ("refundReason" IS NULL OR char_length("refundReason") <= 120);
ALTER TABLE "HrStockCharge" ADD CONSTRAINT "HrStockCharge_repaid_check" CHECK ("repaidAt" IS NULL OR ("refundOwedSatang" IS NOT NULL AND "repaidById" IS NOT NULL AND char_length("repaidRef") BETWEEN 1 AND 80));

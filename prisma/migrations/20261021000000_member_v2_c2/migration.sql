-- M2.2 — ระบบสมาชิก v2 ชุด C2 (`member_v2_c2`) · พิมพ์เขียว docs/modules/06-member-v2.md §5.5 §6.2 §11.4
--
-- 🔴 additive ล้วน — ADD VALUE ของ enum เดิม (ไม่ตัดค่าเก่า) + CREATE TABLE ใหม่เท่านั้น
--    ไม่มี DROP/ALTER COLUMN … TYPE ⇒ โค้ดรุ่นก่อนหน้ายังทำงานได้เหมือนเดิม
--
-- ทำไมต้องมี (ตัดสินใจนอกแผนเดิม — common.md เตรียมชื่อ `member_v2_c2` ไว้ล่วงหน้าสำหรับกรณีนี้)
--   • `PointTxType.TRANSFER` — โอนแต้มระหว่างสมาชิก (M2.2) ต้องแยกจาก EARN/BURN เพราะ EARN ถูกนับใน
--     เพดานแต้ม/วันของ computeEarn (§11.4 "เพดานวัน: นับ EARN จากขาย") — ถ้าใช้ EARN ซ้ำ ยอดโอนเข้าจะไป
--     กินโควตาเพดานรายวันของผู้รับอย่างผิดที่ผิดทาง
--   • `PointAdjustRequest` — "ปรับแต้มมือเกินเพดาน" ต้องพักข้อมูล (customerId/delta/reason/expiresAt)
--     ไว้รอสายอนุมัติกลาง `ApprovalRequest` ตัดสิน แต่ตาราง `ApprovalRequest` ไม่มีช่องเก็บ payload อิสระ
--     (มีแต่ entityType/entityId/amountSatang) ⇒ ต้องมีตารางเฉพาะให้ `approval-effects.ts` หยิบไปใช้ตอนอนุมัติผ่าน
--     (แบบเดียวกับที่ M1.9 พักคำขอ "ตั้งระดับมือ" ไว้ใน MemberTierHistory.evidence.pending — แต่ที่นี่ไม่มีตาราง
--     ประวัติกลางให้อาศัยแบบนั้น จึงตั้งตารางเฉพาะ)

-- AlterEnum
ALTER TYPE "PointTxType" ADD VALUE 'TRANSFER';

-- CreateTable
CREATE TABLE "PointAdjustRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointAdjustRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PointAdjustRequest_tenantId_idempotencyKey_key" ON "PointAdjustRequest"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PointAdjustRequest_tenantId_approvalRequestId_idx" ON "PointAdjustRequest"("tenantId", "approvalRequestId");

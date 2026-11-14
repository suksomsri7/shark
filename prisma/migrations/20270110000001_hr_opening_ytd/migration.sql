-- HR H3.4-YTD ▸ ยอดยกมาต้นปี (ก่อนใช้ระบบ) ต่อพนักงานต่อปีภาษี (brief hr-brief-H3.4-YTD R1) — additive ล้วน: 1 ตารางใหม่ · unique · partial unique · CHECK · FK ไป HrEmployee (RESTRICT)
--   ไม่ ALTER ตาราง/enum เดิม · append-only: แก้ = ปิดแถวเดิม (supersededAt) + แทรก rev ถัดไป · ล้าง = ปิดแถวเดิม · ไม่มีแถว ⇒ พฤติกรรมเดิมทุกอย่าง
--   runbook: migrate ก่อน แล้วจึง deploy โค้ด · ไม่มี backfill · ถอยกลับ = ปิดโค้ด (ตารางว่างเฉย ๆ · โค้ดเดิมไม่รู้จัก)
--   ตรวจก่อน (นอกไฟล์นี้): SELECT to_regclass('"HrPayrollOpeningYtd"');  -- ต้องได้ NULL

-- CreateTable
CREATE TABLE "HrPayrollOpeningYtd" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "asOfDay" DATE NOT NULL,
    "months" INTEGER NOT NULL,
    "incomeSatang" INTEGER NOT NULL,
    "whtSatang" INTEGER NOT NULL,
    "ssoSatang" INTEGER NOT NULL,
    "rev" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "supersededById" TEXT,

    CONSTRAINT "HrPayrollOpeningYtd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrPayrollOpeningYtd_systemId_taxYear_idx" ON "HrPayrollOpeningYtd"("systemId", "taxYear");

-- CreateIndex
CREATE INDEX "HrPayrollOpeningYtd_employeeId_idx" ON "HrPayrollOpeningYtd"("employeeId");

-- CreateIndex
CREATE INDEX "HrPayrollOpeningYtd_tenantId_idx" ON "HrPayrollOpeningYtd"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HrPayrollOpeningYtd_systemId_employeeId_taxYear_rev_key" ON "HrPayrollOpeningYtd"("systemId", "employeeId", "taxYear", "rev");

-- AddForeignKey
ALTER TABLE "HrPayrollOpeningYtd" ADD CONSTRAINT "HrPayrollOpeningYtd_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK (เงิน = สตางค์จำนวนเต็ม ≥ 0 · ภาษีหักไม่เกินเงินได้ · ปีของวันที่ยอดถึง = ปีภาษี · เดือน 0–12 · rev เริ่ม 1)
ALTER TABLE "HrPayrollOpeningYtd" ADD CONSTRAINT "HrPayrollOpeningYtd_year_chk" CHECK ("taxYear" BETWEEN 2000 AND 2400);
ALTER TABLE "HrPayrollOpeningYtd" ADD CONSTRAINT "HrPayrollOpeningYtd_asof_chk" CHECK (EXTRACT(YEAR FROM "asOfDay") = "taxYear");
ALTER TABLE "HrPayrollOpeningYtd" ADD CONSTRAINT "HrPayrollOpeningYtd_months_chk" CHECK ("months" BETWEEN 0 AND 12);
ALTER TABLE "HrPayrollOpeningYtd" ADD CONSTRAINT "HrPayrollOpeningYtd_amount_chk" CHECK ("incomeSatang" >= 0 AND "whtSatang" >= 0 AND "ssoSatang" >= 0);
ALTER TABLE "HrPayrollOpeningYtd" ADD CONSTRAINT "HrPayrollOpeningYtd_wht_chk" CHECK ("whtSatang" <= "incomeSatang");
ALTER TABLE "HrPayrollOpeningYtd" ADD CONSTRAINT "HrPayrollOpeningYtd_rev_chk" CHECK ("rev" >= 1);
ALTER TABLE "HrPayrollOpeningYtd" ADD CONSTRAINT "HrPayrollOpeningYtd_superseded_chk" CHECK (("supersededAt" IS NULL AND "supersededById" IS NULL) OR "supersededAt" IS NOT NULL);

-- 1 แถวที่ยังมีผลต่อ (ระบบ, พนักงาน, ปีภาษี) — แถวที่ถูกแทนแล้วเก็บไว้เป็นประวัติ (ยอดเงินอยู่ที่แถว ไม่อยู่ในประวัติการใช้งาน)
CREATE UNIQUE INDEX "HrPayrollOpeningYtd_live_key" ON "HrPayrollOpeningYtd"("systemId", "employeeId", "taxYear") WHERE "supersededAt" IS NULL;

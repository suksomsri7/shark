-- HR H1.1 ▸ แกนสาขา + สถานะการจ้าง + รูปแบบค่าจ้าง (additive ล้วน · ไม่มีการลบ/เปลี่ยนชนิด/เปลี่ยนชื่อคอลัมน์)
--   HrEmployee: unitId (สาขาประจำ · ไม่มี FK ไป BusinessUnit) · employmentStatus · probationEndAt · contractEndAt + 2 index
--   HrEmployeeUnit (ยืมตัว): FK → HrEmployee ON DELETE CASCADE · 2 index · partial unique (employeeId, unitId) WHERE toDate IS NULL (SQL ดิบ — Prisma ประกาศ WHERE ไม่ได้)
--   HrSalaryProfile: payType NOT NULL DEFAULT 'MONTHLY' (แถวเดิมทุกแถว = MONTHLY = พฤติกรรมเดิม) · dailyRateSatang / hourlyRateSatang
--   ทั้งไฟล์รันในธุรกรรมเดียวของ migrate deploy · ข้อมูลเดิมไม่ถูกแก้ (สาขา/สถานะเติมด้วย scripts/hr-backfill-units.mts หลัง deploy)
-- pre-check (ก่อน deploy — ต้องได้ 0 แถวทุกคำสั่ง):
--   SELECT typname FROM pg_type WHERE typname IN ('HrEmploymentStatus','HrPayType');
--   SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()
--     AND ((table_name = 'HrEmployee' AND column_name IN ('unitId','employmentStatus','probationEndAt','contractEndAt'))
--       OR (table_name = 'HrSalaryProfile' AND column_name IN ('payType','dailyRateSatang','hourlyRateSatang')));
--   SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'HrEmployeeUnit';
-- ตรวจหลัง deploy: SELECT count(*) FROM "HrSalaryProfile" WHERE "payType" <> 'MONTHLY';  -- = 0

-- CreateEnum
CREATE TYPE "HrEmploymentStatus" AS ENUM ('PROBATION', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "HrPayType" AS ENUM ('MONTHLY', 'DAILY', 'HOURLY');

-- AlterTable
ALTER TABLE "HrEmployee" ADD COLUMN     "contractEndAt" DATE,
ADD COLUMN     "employmentStatus" "HrEmploymentStatus",
ADD COLUMN     "probationEndAt" DATE,
ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "HrSalaryProfile" ADD COLUMN     "dailyRateSatang" INTEGER,
ADD COLUMN     "hourlyRateSatang" INTEGER,
ADD COLUMN     "payType" "HrPayType" NOT NULL DEFAULT 'MONTHLY';

-- CreateTable
CREATE TABLE "HrEmployeeUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrEmployeeUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrEmployeeUnit_systemId_employeeId_idx" ON "HrEmployeeUnit"("systemId", "employeeId");

-- CreateIndex
CREATE INDEX "HrEmployeeUnit_systemId_unitId_idx" ON "HrEmployeeUnit"("systemId", "unitId");

-- CreateIndex
CREATE INDEX "HrEmployee_systemId_unitId_idx" ON "HrEmployee"("systemId", "unitId");

-- CreateIndex
CREATE INDEX "HrEmployee_systemId_employmentStatus_idx" ON "HrEmployee"("systemId", "employmentStatus");

-- AddForeignKey
ALTER TABLE "HrEmployeeUnit" ADD CONSTRAINT "HrEmployeeUnit_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- HR H1.1 ▸ ยืมตัวที่ยังเปิดอยู่ของพนักงานคนเดียวไปสาขาเดียวกัน ได้ไม่เกิน 1 แถว (SQL ดิบ)
CREATE UNIQUE INDEX "HrEmployeeUnit_employeeId_unitId_open_key" ON "HrEmployeeUnit"("employeeId", "unitId") WHERE "toDate" IS NULL;

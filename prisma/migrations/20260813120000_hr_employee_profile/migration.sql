-- ทะเบียนพนักงานเต็มรูปแบบ (เจ้าของสั่งข้อ 8) — additive ล้วน ทุกคอลัมน์ nullable
-- ร้านที่กรอกแค่ชื่อยังใช้งานได้เหมือนเดิม
CREATE TYPE "HrGender" AS ENUM ('MALE', 'FEMALE', 'OTHER');
CREATE TYPE "HrMaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER');
CREATE TYPE "HrEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'DAILY', 'PROBATION');
CREATE TYPE "HrDocKind" AS ENUM ('ID_CARD', 'HOUSE_REG', 'CONTRACT', 'CERTIFICATE', 'SSO_FORM', 'BANK_BOOK', 'OTHER');

ALTER TABLE "HrEmployee"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "nickname" TEXT,
  ADD COLUMN "gender" "HrGender",
  ADD COLUMN "birthDate" DATE,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "department" TEXT,
  ADD COLUMN "employmentType" "HrEmploymentType",
  ADD COLUMN "startDate" DATE,
  ADD COLUMN "endDate" DATE,
  ADD COLUMN "maritalStatus" "HrMaritalStatus",
  ADD COLUMN "addressLine" TEXT,
  ADD COLUMN "subdistrict" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "province" TEXT,
  ADD COLUMN "postcode" TEXT,
  ADD COLUMN "nationalId" TEXT,
  ADD COLUMN "ssoNumber" TEXT,
  ADD COLUMN "houseRegAddress" TEXT,
  ADD COLUMN "bankName" TEXT,
  ADD COLUMN "bankAccountNo" TEXT,
  ADD COLUMN "bankAccountName" TEXT,
  ADD COLUMN "emergencyName" TEXT,
  ADD COLUMN "emergencyPhone" TEXT,
  ADD COLUMN "emergencyRelation" TEXT,
  ADD COLUMN "note" TEXT;

-- เอกสารแนบ (สำเนาบัตร/ทะเบียนบ้าน/สัญญาจ้าง) — 🔒 อ่อนไหวทั้งตาราง
CREATE TABLE "HrEmployeeDoc" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "kind" "HrDocKind" NOT NULL DEFAULT 'OTHER',
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrEmployeeDoc_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HrEmployeeDoc_systemId_employeeId_idx" ON "HrEmployeeDoc"("systemId", "employeeId");
CREATE INDEX "HrEmployeeDoc_tenantId_idx" ON "HrEmployeeDoc"("tenantId");
ALTER TABLE "HrEmployeeDoc" ADD CONSTRAINT "HrEmployeeDoc_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

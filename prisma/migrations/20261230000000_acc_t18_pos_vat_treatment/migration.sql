-- ACC T1.8 — ชนิด VAT ต่อบรรทัดบิล POS + ยอดตามกลุ่ม + ธงเก็บแทนของสินค้า (additive · ค่าปริยาย = บิล/สินค้าเดิมอ่านเหมือนเดิม)
-- CreateEnum
CREATE TYPE "PosVatTreatment" AS ENUM ('STANDARD', 'ZERO_RATED', 'EXEMPT', 'ON_BEHALF');

-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN "zeroRatedSatang" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "exemptSatang" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "onBehalfSatang" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PosSaleLine" ADD COLUMN "vatTreatment" "PosVatTreatment";

-- AlterTable
ALTER TABLE "PosProduct" ADD COLUMN "collectedOnBehalf" BOOLEAN NOT NULL DEFAULT false;

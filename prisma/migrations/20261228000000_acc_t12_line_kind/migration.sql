-- ACC T1.2 — ชนิดบรรทัด สินค้า/บริการ (additive · nullable)
-- CreateEnum
CREATE TYPE "AccountLineKind" AS ENUM ('GOODS', 'SERVICE');

-- AlterTable
ALTER TABLE "AccountDocumentLine" ADD COLUMN "lineKind" "AccountLineKind";

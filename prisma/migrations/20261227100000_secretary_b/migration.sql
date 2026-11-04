-- S1.22 เลขา AI — migration `secretary_b` (additive ล้วน · AiSettings 3 คอลัมน์ · SECRETARY RUN 5 พ.ย. 2026)
-- ที่มา: `prisma migrate diff --from-schema <prisma/schema @4d6cdd35> --to-schema prisma/schema --script` (schema→schema · ไม่แตะฐาน)
-- AlterTable
ALTER TABLE "AiSettings" ADD COLUMN     "afterHoursHandoff" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "afterHoursReply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiDisclosure" TEXT;

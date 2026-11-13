-- ACC T1.7: ยกเลิกเครื่องหมายยื่น (ภ.พ.30 / ภ.ง.ด.) = เก็บแถวไว้ ไม่ลบ (additive)
ALTER TABLE "AccountVatFiling" ADD COLUMN "unmarkedAt" TIMESTAMP(3);
ALTER TABLE "AccountVatFiling" ADD COLUMN "unmarkedById" TEXT;
ALTER TABLE "AccountVatFiling" ADD COLUMN "unmarkReason" TEXT;
ALTER TABLE "AccountWhtFiling" ADD COLUMN "unmarkedAt" TIMESTAMP(3);
ALTER TABLE "AccountWhtFiling" ADD COLUMN "unmarkedById" TEXT;
ALTER TABLE "AccountWhtFiling" ADD COLUMN "unmarkReason" TEXT;

-- ACC T4.5 (K2): log การลบร้าน — ตารางใหม่ไม่มี FK กับ Tenant (อยู่ต่อหลังร้านถูกลบ) · additive
CREATE TABLE "TenantDeletionLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actorUserId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantDeletionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantDeletionLog_tenantId_createdAt_idx" ON "TenantDeletionLog"("tenantId", "createdAt");

-- append-only: แก้/ลบไม่ได้ (ยกเว้นฐานทดสอบโหมด qc — ฟังก์ชันจาก migration acc_t44_ledger_guard)
CREATE OR REPLACE FUNCTION public.tenant_deletion_log_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF public.account_ledger_bypass(NULL) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'LEDGER_GUARD: แก้/ลบ log การลบร้านไม่ได้ (%)', OLD.id USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER tenant_deletion_log_guard BEFORE UPDATE OR DELETE ON "TenantDeletionLog"
  FOR EACH ROW EXECUTE FUNCTION public.tenant_deletion_log_guard();

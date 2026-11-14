-- ACC T4.4 (E12 G2 G7): กันแก้/ลบระดับฐานข้อมูล — สมุดรายวัน (AccountJournalEntry / AccountJournalLine) + AuditLog ของงานบัญชี
-- additive ล้วน: ฟังก์ชัน + trigger (ไม่แตะคอลัมน์/ข้อมูลเดิม) · design note ledger/wo-notes/T4.4.md
--
-- ทางที่ระบบยอม (นอกนั้นปฏิเสธด้วย SQLSTATE 'P0001' ข้อความขึ้นต้น "LEDGER_GUARD:")
--   รายการบัญชี (entry):  แก้ได้เฉพาะ status POSTED→REVERSED (กลับรายการ) · needsReview/flagNote (ธงตรวจ) · updatedAt ·
--                          refType/refId/idempotencyKey เมื่อยังว่าง (ผูกที่มาครั้งเดียว) · ช่องอื่นห้ามเปลี่ยน · ลบห้าม
--   บรรทัด (line):        แก้ได้เฉพาะ contactId (รวมผู้ติดต่อ) · reconciledAt/reconciledStatementLineId (กระทบยอด) · เงิน/บัญชี/ใบห้ามเปลี่ยน · ลบห้าม
--   AuditLog (action account.* · legal.* · auth.* · tenant.delete*): ห้ามแก้ (ยกเว้น tenantId → NULL ของ FK ตอนลบร้าน) · ลบห้าม
--   ยกเว้นทั้งหมด: (1) การลบร้านของระบบ — ธุรกรรมตั้ง `shark.ledger_purge` = tenantId ของแถว (pdpa.ts purgeTenantRows)
--                (2) ฐานทดสอบที่สลับโหมดเป็น 'qc' (account_ledger_guard_mode) — ล้างฟิกซ์เจอร์ของชุดทดสอบ · ทดสอบโหมดเข้มได้ด้วย SET LOCAL shark.ledger_guard = 'strict'

-- โหมดของฐาน: 'strict' (ค่าเริ่ม · production) | 'qc' (ฐานทดสอบ — สลับด้วย scripts/acc-ledger-guard-mode.mts) · ไม่อยู่ในสคีมา Prisma ⇒ ไม่เป็น drift
CREATE OR REPLACE FUNCTION public.account_ledger_guard_mode() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT 'strict'::text $$;

CREATE OR REPLACE FUNCTION public.account_ledger_bypass(p_tenant text) RETURNS boolean
  LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF p_tenant IS NOT NULL AND coalesce(current_setting('shark.ledger_purge', true), '') = p_tenant THEN
    RETURN true;
  END IF;
  IF public.account_ledger_guard_mode() = 'qc' AND coalesce(current_setting('shark.ledger_guard', true), '') <> 'strict' THEN
    RETURN true;
  END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.account_journal_entry_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF public.account_ledger_bypass(OLD."tenantId") THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LEDGER_GUARD: ลบรายการในสมุดรายวันไม่ได้ (% %) — แก้ด้วยการกลับรายการ', OLD."docNo", OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."systemId" IS DISTINCT FROM OLD."systemId"
     OR NEW."docNo" IS DISTINCT FROM OLD."docNo" OR NEW.book IS DISTINCT FROM OLD.book OR NEW.journal IS DISTINCT FROM OLD.journal
     OR NEW.date IS DISTINCT FROM OLD.date OR NEW."periodKey" IS DISTINCT FROM OLD."periodKey" OR NEW.memo IS DISTINCT FROM OLD.memo
     OR NEW.source IS DISTINCT FROM OLD.source OR NEW."postedById" IS DISTINCT FROM OLD."postedById" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId" THEN
    RAISE EXCEPTION 'LEDGER_GUARD: แก้รายการในสมุดรายวันที่ลงแล้วไม่ได้ (%) — แก้ด้วยการกลับรายการ', OLD."docNo" USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'POSTED' AND NEW.status = 'REVERSED') THEN
    RAISE EXCEPTION 'LEDGER_GUARD: เปลี่ยนสถานะรายการ % จาก % เป็น % ไม่ได้', OLD."docNo", OLD.status, NEW.status USING ERRCODE = 'P0001';
  END IF;
  IF (NEW."refType" IS DISTINCT FROM OLD."refType" OR NEW."refId" IS DISTINCT FROM OLD."refId" OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey")
     AND OLD."idempotencyKey" IS NOT NULL THEN
    RAISE EXCEPTION 'LEDGER_GUARD: เปลี่ยนที่มาของรายการ % ที่ผูกแล้วไม่ได้', OLD."docNo" USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.account_journal_line_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF public.account_ledger_bypass(OLD."tenantId") THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LEDGER_GUARD: ลบบรรทัดสมุดรายวันไม่ได้ (%)', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."systemId" IS DISTINCT FROM OLD."systemId"
     OR NEW."entryId" IS DISTINCT FROM OLD."entryId" OR NEW."accountId" IS DISTINCT FROM OLD."accountId"
     OR NEW.debit IS DISTINCT FROM OLD.debit OR NEW.credit IS DISTINCT FROM OLD.credit OR NEW.note IS DISTINCT FROM OLD.note THEN
    RAISE EXCEPTION 'LEDGER_GUARD: แก้จำนวนเงิน/บัญชีของบรรทัดสมุดรายวันที่ลงแล้วไม่ได้ (%)', OLD.id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.account_audit_protected(p_action text) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$
  SELECT p_action LIKE 'account.%' OR p_action LIKE 'legal.%' OR p_action LIKE 'auth.%' OR p_action LIKE 'tenant.delete%'
$$;

CREATE OR REPLACE FUNCTION public.account_audit_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.account_audit_protected(OLD.action) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF public.account_ledger_bypass(OLD."tenantId") THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LEDGER_GUARD: ลบบันทึกการแก้ไขของบัญชีไม่ได้ (% %)', OLD.action, OLD.id USING ERRCODE = 'P0001';
  END IF;
  -- FK ON DELETE SET NULL ของ Tenant: ยอมเฉพาะ tenantId → NULL โดยช่องอื่นไม่เปลี่ยน
  IF NEW."tenantId" IS NULL AND OLD."tenantId" IS NOT NULL
     AND NEW.id = OLD.id AND NEW.action = OLD.action AND NEW."actorType" = OLD."actorType"
     AND NEW."actorId" IS NOT DISTINCT FROM OLD."actorId" AND NEW."onBehalfOf" IS NOT DISTINCT FROM OLD."onBehalfOf"
     AND NEW."unitId" IS NOT DISTINCT FROM OLD."unitId" AND NEW."targetType" IS NOT DISTINCT FROM OLD."targetType"
     AND NEW."targetId" IS NOT DISTINCT FROM OLD."targetId" AND NEW.before::text IS NOT DISTINCT FROM OLD.before::text
     AND NEW.after::text IS NOT DISTINCT FROM OLD.after::text AND NEW.ip IS NOT DISTINCT FROM OLD.ip AND NEW."createdAt" = OLD."createdAt" THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'LEDGER_GUARD: แก้บันทึกการแก้ไขของบัญชีไม่ได้ (% %)', OLD.action, OLD.id USING ERRCODE = 'P0001';
END $$;

DROP TRIGGER IF EXISTS account_journal_entry_guard ON "AccountJournalEntry";
CREATE TRIGGER account_journal_entry_guard BEFORE UPDATE OR DELETE ON "AccountJournalEntry"
  FOR EACH ROW EXECUTE FUNCTION public.account_journal_entry_guard();

DROP TRIGGER IF EXISTS account_journal_line_guard ON "AccountJournalLine";
CREATE TRIGGER account_journal_line_guard BEFORE UPDATE OR DELETE ON "AccountJournalLine"
  FOR EACH ROW EXECUTE FUNCTION public.account_journal_line_guard();

DROP TRIGGER IF EXISTS account_audit_guard ON "AuditLog";
CREATE TRIGGER account_audit_guard BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION public.account_audit_guard();

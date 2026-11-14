-- ACC T5-A (พิสูจน์ด่าน T4.4 ในโหมดเข้ม): additive ล้วน — ฟังก์ชัน + trigger (ไม่แตะคอลัมน์/ข้อมูลเดิม) · design note ledger/wo-notes/T4.4-strict-proof.md
--
-- 1) ปิดช่อง INSERT: เพิ่มบรรทัดเข้า "รายการที่ลงแล้ว" ด้วย SQL ตรงไม่ได้อีก
--    ทางของแอป: บรรทัดถูกสร้างพร้อมหัวใบเสมอ (gl.commitEntry · nested create ในธุรกรรมเดียวกัน)
--    กลไก: AFTER INSERT ของหัวใบจดรหัสลงค่าตั้งของธุรกรรม `shark.ledger_new_entries` (set_config …, true = เฉพาะธุรกรรมนี้ ·
--          savepoint ที่ rollback คืนค่าเดิมเอง) เก็บ 64 ใบล่าสุด · BEFORE INSERT ของบรรทัดยอมเฉพาะ entryId ที่อยู่ในรายการนั้น
--    ⇒ หัวใบที่ commit ไปแล้ว (หรือถูกแก้ธง/กลับรายการในธุรกรรมนี้ — ไม่ใช่การสร้าง) เพิ่มบรรทัดไม่ได้
-- 2) โหมด 'shadow' (ฐานทดสอบเท่านั้น): ไม่ปฏิเสธ แต่ทุกคำสั่งที่โหมดเข้ม "จะปฏิเสธ" ถูกจดลงตาราง qc_ledger_guard_shadow
--    ตารางนั้นสร้างโดย scripts/acc-ledger-guard-mode.mts shadow เท่านั้น (ผ่าน loadQcEnv — ด่าน prod) — ไม่มีใน migration
--    ไม่มีตาราง (เช่น production) ⇒ ปฏิเสธเหมือนโหมดเข้ม (fail closed) แม้มีคนตั้งโหมดเป็น shadow
-- 3) ด่านทุกตัวส่งการปฏิเสธผ่าน account_ledger_reject() ที่เดียว · ทางที่ยอมเท่าเดิมทุกข้อ (T4.4 §1)

-- ผ่านเลย (ไม่ประเมิน): การลบร้านของระบบ หรือ ฐานโหมด qc ที่ session ไม่ได้ขอโหมดเข้ม
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

-- ปฏิเสธ (โหมดเข้ม) หรือ จดลง log เงา (โหมด shadow + มีตาราง + session ไม่ได้ขอโหมดเข้ม) แล้วปล่อยผ่าน
CREATE OR REPLACE FUNCTION public.account_ledger_reject(p_msg text, p_table text, p_op text, p_row text, p_cols text[]) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  IF public.account_ledger_guard_mode() = 'shadow'
     AND coalesce(current_setting('shark.ledger_guard', true), '') <> 'strict'
     AND to_regclass('public.qc_ledger_guard_shadow') IS NOT NULL THEN
    EXECUTE 'INSERT INTO public.qc_ledger_guard_shadow (op, tbl, row_id, cols, msg, app, fixture, query, xact) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)'
      USING p_op, p_table, p_row, p_cols, p_msg, current_setting('application_name', true),
            nullif(current_setting('shark.qc_fixture', true), ''), left(current_query(), 2000), pg_current_xact_id()::text;
    RETURN;
  END IF;
  RAISE EXCEPTION '%', p_msg USING ERRCODE = 'P0001';
END $$;

-- คอลัมน์ที่เปลี่ยน (สำหรับข้อความ log เงา)
CREATE OR REPLACE FUNCTION public.account_ledger_changed_cols(p_old jsonb, p_new jsonb) RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg(n.key ORDER BY n.key), '{}') FROM jsonb_each(p_new) n WHERE n.value IS DISTINCT FROM p_old -> n.key
$$;

CREATE OR REPLACE FUNCTION public.account_journal_entry_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  cols text[];
BEGIN
  IF public.account_ledger_bypass(OLD."tenantId") THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.account_ledger_reject(format('LEDGER_GUARD: ลบรายการในสมุดรายวันไม่ได้ (%s %s) — แก้ด้วยการกลับรายการ', OLD."docNo", OLD.id), TG_TABLE_NAME, TG_OP, OLD.id, NULL);
    RETURN OLD;
  END IF;
  cols := public.account_ledger_changed_cols(to_jsonb(OLD), to_jsonb(NEW));
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."systemId" IS DISTINCT FROM OLD."systemId"
     OR NEW."docNo" IS DISTINCT FROM OLD."docNo" OR NEW.book IS DISTINCT FROM OLD.book OR NEW.journal IS DISTINCT FROM OLD.journal
     OR NEW.date IS DISTINCT FROM OLD.date OR NEW."periodKey" IS DISTINCT FROM OLD."periodKey" OR NEW.memo IS DISTINCT FROM OLD.memo
     OR NEW.source IS DISTINCT FROM OLD.source OR NEW."postedById" IS DISTINCT FROM OLD."postedById" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId" THEN
    PERFORM public.account_ledger_reject(format('LEDGER_GUARD: แก้รายการในสมุดรายวันที่ลงแล้วไม่ได้ (%s) — แก้ด้วยการกลับรายการ', OLD."docNo"), TG_TABLE_NAME, TG_OP, OLD.id, cols);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'POSTED' AND NEW.status = 'REVERSED') THEN
    PERFORM public.account_ledger_reject(format('LEDGER_GUARD: เปลี่ยนสถานะรายการ %s จาก %s เป็น %s ไม่ได้', OLD."docNo", OLD.status, NEW.status), TG_TABLE_NAME, TG_OP, OLD.id, cols);
    RETURN NEW;
  END IF;
  IF (NEW."refType" IS DISTINCT FROM OLD."refType" OR NEW."refId" IS DISTINCT FROM OLD."refId" OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey")
     AND OLD."idempotencyKey" IS NOT NULL THEN
    PERFORM public.account_ledger_reject(format('LEDGER_GUARD: เปลี่ยนที่มาของรายการ %s ที่ผูกแล้วไม่ได้', OLD."docNo"), TG_TABLE_NAME, TG_OP, OLD.id, cols);
    RETURN NEW;
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
    PERFORM public.account_ledger_reject(format('LEDGER_GUARD: ลบบรรทัดสมุดรายวันไม่ได้ (%s)', OLD.id), TG_TABLE_NAME, TG_OP, OLD.id, NULL);
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."systemId" IS DISTINCT FROM OLD."systemId"
     OR NEW."entryId" IS DISTINCT FROM OLD."entryId" OR NEW."accountId" IS DISTINCT FROM OLD."accountId"
     OR NEW.debit IS DISTINCT FROM OLD.debit OR NEW.credit IS DISTINCT FROM OLD.credit OR NEW.note IS DISTINCT FROM OLD.note THEN
    PERFORM public.account_ledger_reject(format('LEDGER_GUARD: แก้จำนวนเงิน/บัญชีของบรรทัดสมุดรายวันที่ลงแล้วไม่ได้ (%s)', OLD.id), TG_TABLE_NAME, TG_OP, OLD.id,
      public.account_ledger_changed_cols(to_jsonb(OLD), to_jsonb(NEW)));
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

-- จดหัวใบที่ "สร้าง" ในธุรกรรมนี้ (64 ใบล่าสุด · ค่าเฉพาะธุรกรรม)
CREATE OR REPLACE FUNCTION public.account_journal_entry_track_new() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  cur text[] := string_to_array(nullif(current_setting('shark.ledger_new_entries', true), ''), ',');
BEGIN
  cur := coalesce(cur, '{}') || NEW.id;
  IF array_length(cur, 1) > 64 THEN
    cur := cur[array_length(cur, 1) - 63 : array_length(cur, 1)];
  END IF;
  PERFORM set_config('shark.ledger_new_entries', array_to_string(cur, ','), true);
  RETURN NULL;
END $$;

-- บรรทัดใหม่ต้องเป็นของหัวใบที่สร้างในธุรกรรมเดียวกัน
CREATE OR REPLACE FUNCTION public.account_journal_line_insert_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF public.account_ledger_bypass(NEW."tenantId") THEN
    RETURN NEW;
  END IF;
  IF NEW."entryId" = ANY (string_to_array(coalesce(current_setting('shark.ledger_new_entries', true), ''), ',')) THEN
    RETURN NEW;
  END IF;
  PERFORM public.account_ledger_reject(format('LEDGER_GUARD: เพิ่มบรรทัดเข้ารายการที่ลงแล้วไม่ได้ (%s) — ลงรายการปรับปรุงใบใหม่', NEW."entryId"), TG_TABLE_NAME, TG_OP, NEW."entryId", NULL);
  RETURN NEW;
END $$;

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
    PERFORM public.account_ledger_reject(format('LEDGER_GUARD: ลบบันทึกการแก้ไขของบัญชีไม่ได้ (%s %s)', OLD.action, OLD.id), TG_TABLE_NAME, TG_OP, OLD.id, NULL);
    RETURN OLD;
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
  PERFORM public.account_ledger_reject(format('LEDGER_GUARD: แก้บันทึกการแก้ไขของบัญชีไม่ได้ (%s %s)', OLD.action, OLD.id), TG_TABLE_NAME, TG_OP, OLD.id,
    public.account_ledger_changed_cols(to_jsonb(OLD), to_jsonb(NEW)));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tenant_deletion_log_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF public.account_ledger_bypass(NULL) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  PERFORM public.account_ledger_reject(format('LEDGER_GUARD: แก้/ลบ log การลบร้านไม่ได้ (%s)', OLD.id), TG_TABLE_NAME, TG_OP, OLD.id, NULL);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS account_journal_entry_track_new ON "AccountJournalEntry";
CREATE TRIGGER account_journal_entry_track_new AFTER INSERT ON "AccountJournalEntry"
  FOR EACH ROW EXECUTE FUNCTION public.account_journal_entry_track_new();

DROP TRIGGER IF EXISTS account_journal_line_insert_guard ON "AccountJournalLine";
CREATE TRIGGER account_journal_line_insert_guard BEFORE INSERT ON "AccountJournalLine"
  FOR EACH ROW EXECUTE FUNCTION public.account_journal_line_insert_guard();

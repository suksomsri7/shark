-- merge T4+T5 (ACC T4.4 ด่านสมุดรายวัน × ACC T4.1 ผู้อนุมัติ JV มือ): additive ล้วน — แทนที่ฟังก์ชันด่านหัวใบ (ไม่แตะคอลัมน์/ข้อมูล/trigger)
--   เดิม: คอลัมน์ approvedById/approvedAt (เลน 2 · migration 20270102000100) ไม่อยู่ในรายการคอลัมน์ที่กัน ⇒ แก้/ล้างผู้อนุมัติได้เสมอ
--   ใหม่: ยอมเฉพาะการอนุมัติครั้งแรก (ว่าง → มีค่า ทั้งสองช่อง) ของใบ MANUAL ที่ยัง POSTED · อื่นทั้งหมด = ปฏิเสธ (ผ่าน account_ledger_reject → โหมด shadow จดได้)
--   ธงร่าง (needsReview/flagNote) ปลดพร้อมอนุมัติได้เหมือนเดิม · ทางอื่นทุกข้อเท่าเดิม (ledger/wo-notes/T4.4-strict-proof.md)

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
  -- merge T4+T5 ▸ ผู้อนุมัติ JV มือ (ACC T4.1 · ประกาศกรมทะเบียนการค้า 2544 ข้อ 11): ตั้งได้ครั้งเดียว ว่าง → มีค่า (ทั้งคู่)
  --   เฉพาะใบ source MANUAL ที่ยัง POSTED และไม่เปลี่ยนสถานะในคำสั่งเดียวกัน · เปลี่ยนผู้อนุมัติ/ล้างการอนุมัติ/ตั้งครึ่งเดียว = ปฏิเสธ
  IF (NEW."approvedById" IS DISTINCT FROM OLD."approvedById" OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt")
     AND NOT (OLD."approvedById" IS NULL AND OLD."approvedAt" IS NULL AND NEW."approvedById" IS NOT NULL AND NEW."approvedAt" IS NOT NULL
              AND OLD.source = 'MANUAL' AND OLD.status = 'POSTED' AND NEW.status = 'POSTED') THEN
    PERFORM public.account_ledger_reject(format('LEDGER_GUARD: ผู้อนุมัติของรายการ %s ตั้งได้ครั้งเดียว (เฉพาะรายการบันทึกด้วยมือที่ยังไม่ถูกกลับรายการ)', OLD."docNo"), TG_TABLE_NAME, TG_OP, OLD.id, cols);
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

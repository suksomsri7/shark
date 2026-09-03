-- WO 1.3 — DocEditorV2: หัก ณ ที่จ่าย "ต่อบรรทัด" (DESIGN-SPEC-V2 §5.2 ส่วน C)
--
-- 🔴 additive ล้วน: ADD COLUMN ที่เป็น NULL ได้ทั้งคู่ · ไม่มี DROP/RENAME/UPDATE
--    เหตุผลเดียวกับ 20260902160000_account_v2_phase0 (scripts/vercel-build.sh รัน migrate deploy
--    ก่อน build เสร็จ ⇒ ระหว่างนั้นโค้ดเก่ายังเสิร์ฟอยู่ อะไรที่ไม่ additive = พังทันที)
--    แถวเดิมทุกแถวได้ NULL = "ไม่หัก ณ ที่จ่าย" = พฤติกรรมเดิมเป๊ะ
--
-- ทำไมต้องมีคอลัมน์ (ไม่ใช่เก็บใน note/JSON): ฟอร์ม V2 ให้เลือก WHT ต่อบรรทัดตามสเปค
-- ถ้าไม่เก็บ ผู้ใช้กด "บันทึกร่าง" แล้วเปิดกลับมาแก้ ค่าที่เลือกจะหายเงียบ ๆ (ยอดที่ต้องชำระเพี้ยน)
-- ⚠️ คอลัมน์นี้เป็น "สิ่งที่ผู้ใช้เลือกไว้" เท่านั้น — การออกหนังสือรับรอง 50 ทวิ + ลง JV จริง
--    ยังเป็นงาน WO 1.4 (§5.2 F) ซึ่งจะมาอ่านคอลัมน์นี้ต่อ
ALTER TABLE "AccountDocumentLine" ADD COLUMN     "whtIncomeType" "AccountWhtIncomeType",
ADD COLUMN     "whtRateBp" INTEGER;

-- §5.2 B: ช่อง "อ้างอิง" + toggle "ออกใบกำกับภาษีพร้อมกัน" (ต่อใบ) — เดิมไม่มีที่เก็บ
-- null = ตามตั้งค่ากิจการ (docConfig.docTypes[dt].autoTaxInvoice) ⇒ แถวเดิมพฤติกรรมไม่เปลี่ยน
ALTER TABLE "AccountDocument" ADD COLUMN     "autoTaxInvoice" BOOLEAN,
ADD COLUMN     "reference" TEXT;

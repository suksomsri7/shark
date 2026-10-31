# WO D.10 — ตรวจสลิป/รับเงินหอ · บันทึกของ builder (รอบแก้ 1)

## ข้อยกเว้น R2 ที่ผู้คุมรับ (Z7 · มติ 30 ต.ค.)
- `src/lib/modules/account/service.ts` · `dormFromError` เพิ่ม **1 บรรทัด** ต้นฟังก์ชัน: `dormIsBusyError(e)` (40P01 · P2034 · P2028 · P2024 · ข้อความ "deadlock detected") ⇒ `BUSY`
  - เป็นการแก้ฟังก์ชันเดิม (ไม่ใช่ facade ใหม่) — ผลกระทบ: ทุกทางเงินหอ (ใบแจ้งหนี้/ใบลด/เพิ่มหนี้/รับชำระ/ประกัน/ใบเสร็จ) ที่เดิมตอบ `ACCOUNT_REJECTED` เมื่อ deadlock/รอคิวเกินเวลา ตอนนี้ตอบ `BUSY` (ลองใหม่ด้วยคีย์เดิมได้ · ยังไม่มีอะไรถูกบันทึกเพราะธุรกรรมถูกยกเลิกทั้งก้อน)
  - ผู้เรียกใน D.10 ลองซ้ำ 1 ครั้งแล้วคืน `BUSY` (ทางมือ) / throw ให้คิวลองใหม่ (consumer)

## งานตามเวลาใหม่ (Z6)
- `src/lib/platform/minute-jobs.ts` + `dorm.chatSlipSweep` (ทุก 60 นาที) → `sweepExpiredChatSlips` ใน `dorm-pay.ts` — ไฟล์นอกรายการ §1 ของใบ ⇒ ORACLE-EDIT S-1 (เพิ่ม minute-jobs.ts ใน OWN_FIXED)

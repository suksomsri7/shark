-- HR H3.4 ▸ เครื่องคิดเงินเดือนรุ่น 2: ค่าใหม่ของ enum เดิมเท่านั้น (แยกไฟล์ — ค่า enum ใหม่ใช้ใน migration เดียวกันไม่ได้)
--   REFUND = คืนเงินรายการหัก (ไม่ใช่เงินได้ 40(1) · ไม่ใช่ค่าจ้าง ปสส.) · CARRY_FORWARD = ยอดหักที่ยกไปงวดถัดไป
--   runbook: migrate ก่อน แล้วจึง deploy · ย้อนกลับ = ไม่มีแถวใช้ค่าใหม่จนกว่าร้านเปิดรุ่น 2 (ต้องมีแถวกฎหมาย ACTIVE)

ALTER TYPE "HrPayItemKind" ADD VALUE 'REFUND';
ALTER TYPE "HrPaySource" ADD VALUE 'CARRY_FORWARD';

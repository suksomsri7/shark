// hr-qc-hosts.mjs — ฐาน QC ที่ข้อสอบ HR เขียนได้ (RUN HR V2 · 11 พ.ย. 2569 · เจ้าของอนุญาตฐานต่อเลน)
//   ฐานหลัก = QC4 `wo-pos-qc4` (ep-frosty-lab) — ด่านรวมของผู้คุม + รันซ้ำหลัง merge ต้องรันที่นี่เสมอ
//   ฐานต่อเลน = Neon branch ลูกของ QC4 (ลบเมื่อ RUN จบ) — builder/oracle writer ของเลนนั้นใช้ผ่าน scripts/qc-hr.sh
//   🔴 allowlist ตรงตัว: ชื่ออื่น (รวม production ep-royal-night) ไม่มีวันผ่าน · HR_QC_HOST_MARK ตั้งโดย qc-hr.sh เท่านั้น
export const HR_QC_MAIN = "ep-frosty-lab";
export const HR_QC_LANES = { l1: "ep-nameless-sea-aokjm6d2", l2: "ep-orange-dust-aotwbyc7", l3: "ep-ancient-truth-ao56olit" };
export const HR_QC_ALLOWED = [HR_QC_MAIN, ...Object.values(HR_QC_LANES)];
/** เครื่องหมายโฮสต์ที่ข้อสอบต้องเห็นใน DATABASE_URL/DIRECT_URL — ค่าเริ่ม = QC4 · ฐานเลนเฉพาะเมื่ออยู่ใน allowlist */
export function hrQcHostMark() {
  const m = process.env.HR_QC_HOST_MARK;
  return m && HR_QC_ALLOWED.includes(m) ? m : HR_QC_MAIN;
}

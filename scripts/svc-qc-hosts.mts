// svc-qc-hosts.mts — ฐาน QC ของ RUN SVC (ตรงตัว · ไม่มีการปลด) — ผู้คุม 31 ต.ค. 2569
//   ep-mute-scene = wo-svc-qc (ฐานหลัก · ด่านรวม/ด่านเต็มรันที่นี่เท่านั้น)
//   ฐานต่อเลน (แตกจาก wo-svc-qc · ข้อสอบเลนรันขนานได้): l1 ep-royal-lake · l2 ep-weathered-mode · l3 ep-royal-bar
//   ตัวเลือกมาจาก env SVC_QC_HOST ที่ scripts/qc-svc.sh ตั้งหลังตรวจ host จริงแล้ว · ไม่มี/ไม่ตรงรายการ ⇒ ep-mute-scene (ค่าเดิม)
// 🔴 ไม่ import อะไรเลย (ใช้ได้จาก fitness/ไม่มี env) · production/QC ของ RUN อื่นถูกปฏิเสธในด่านเดิมของแต่ละสคริปต์ก่อนเสมอ
export const SVC_QC_HOSTS = ["ep-mute-scene", "ep-royal-lake-aonedfp0", "ep-weathered-mode-ao3zx4hs", "ep-royal-bar-aoyw8uh0"] as const;
export function svcQcHostMark(): string {
  const h = process.env.SVC_QC_HOST ?? "";
  return (SVC_QC_HOSTS as readonly string[]).includes(h) ? h : "ep-mute-scene";
}

// trips-qc-hosts.mts — ฐาน QC ของ RUN TRIPS (ตรงตัว · ไม่มีการปลด) — ผู้คุม 12 พ.ย. 2569 (ใบ P0.1)
//   ep-wandering-butterfly-aogzkfrd = wo-trips-qc (ฐานหลัก · ด่านรวม/ด่านเต็ม/รับใบหลัง merge รันที่นี่เท่านั้น · แม่ = wo-svc-qc-l1)
//   ฐานต่อเลน (ลูกของ wo-trips-qc · ข้อสอบเลนรันขนานได้): l1 ep-green-sound-aokclp5k · l2 ep-calm-sun-ao0wyfu5
//   ตัวเลือกมาจาก env TRIPS_QC_HOST ที่ scripts/qc-trips.sh ตั้งหลังตรวจ host จริงแล้ว · ไม่มี/ไม่ตรงรายการ ⇒ ฐานหลัก
// 🔴 ไม่ import อะไรเลย (ใช้ได้จาก fitness/ไม่มี env) · migration ใหม่ต้องลงทุกฐานที่เลนใช้ · จบ RUN ลบทั้ง 3 branch
export const TRIPS_QC_MAIN_HOST = "ep-wandering-butterfly-aogzkfrd";
export const TRIPS_QC_HOSTS = [TRIPS_QC_MAIN_HOST, "ep-green-sound-aokclp5k", "ep-calm-sun-ao0wyfu5", "ep-red-cake-aozcx44y"] as const; // l3 = ep-red-cake-aozcx44y (wo-trips-qc-l3 · 13 พ.ย. · เจ้าของสั่งเพิ่มเลน)
export function tripsQcHostMark(): string {
  const h = process.env.TRIPS_QC_HOST ?? "";
  return (TRIPS_QC_HOSTS as readonly string[]).includes(h) ? h : TRIPS_QC_MAIN_HOST;
}

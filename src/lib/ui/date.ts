// วันเวลาไทย — helper กลางตาม UI_STANDARD §3.4
//
// ทำไมต้องมีที่เดียว: ก่อนหน้านี้หน้าจอ format วันเอง 6 แบบ และ **ส่วนใหญ่ไม่ใส่ timeZone**
// → บน Vercel (เครื่อง UTC) วันไทยหลัง 17:00 UTC เพี้ยนไป 1 วัน (เดียวกับ QC7 MINOR ที่ CSV ภงด.)
// กติกา: ทุกที่ที่โชว์วันให้ผู้ใช้ ต้องผ่านไฟล์นี้ — ห้ามเรียก toLocaleDateString ตรง
//
// th-TH ให้ พ.ศ. อัตโนมัติ: year "numeric" → 2569 · "2-digit" → 69

const TZ = "Asia/Bangkok";

/** วันที่แบบสั้น "5 ก.พ. 69" — ใช้ในรายการ/ตาราง */
export const formatThaiDate = (d: Date | string, opts?: { long?: boolean }) =>
  new Date(d).toLocaleDateString("th-TH", {
    day: "numeric",
    month: opts?.long ? "long" : "short",
    year: opts?.long ? "numeric" : "2-digit",
    timeZone: TZ,
  });

/** วันที่เต็ม "5 กุมภาพันธ์ 2569" — ใช้ในเอกสาร (ใบกำกับ/ใบเสร็จ) */
export const formatThaiDateLong = (d: Date | string) => formatThaiDate(d, { long: true });

/** วันที่+เวลา "5 ก.พ. 69 14:30" */
export const formatThaiDateTime = (d: Date | string, opts?: { long?: boolean }) =>
  `${formatThaiDate(d, opts)} ${formatThaiTime(d)}`;

/** เวลาอย่างเดียว "14:30" (24 ชม. — คนไทยอ่านง่ายกว่า AM/PM) */
export const formatThaiTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  });

/**
 * วันที่แบบ ISO ตามโซนไทย "2026-07-15" — สำหรับ key/ค่าใน <input type="date">/CSV
 * ห้ามใช้ `toISOString().slice(0,10)` (นั่นคือ UTC → เพี้ยนวัน)
 * ใช้วิธีเดียวกับ gl.ts:35 (Intl "en-CA" ให้รูป YYYY-MM-DD ตรง ๆ)
 */
export const thaiDateKey = (d: Date | string = new Date()) =>
  new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });

/** งวดบัญชี "2026-07" ตามโซนไทย */
export const thaiPeriodKey = (d: Date | string = new Date()) => thaiDateKey(d).slice(0, 7);

// ─────────────────── ปี ค.ศ. (โมดูลบัญชี V2) ───────────────────
// account-v2 ใช้ปี "คริสต์ศักราช" ไม่ใช่ พ.ศ. (ต่างจาก formatThaiDate ด้านบนที่ th-TH ให้ พ.ศ. อัตโนมัติ)
// ตามมติเจ้าของ (DESIGN-SPEC-V2/BLUEPRINT-ACCOUNT-V2 §1 "Christian-era dates") — ห้ามใช้ toLocaleDateString("th-TH")
// ตรงนี้เพราะจะได้ปี พ.ศ. ผิดกติกาโมดูล

const THAI_MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/**
 * วันที่ ค.ศ. แบบไทย — "24 ก.ย. 2026" (withYear ค่าเริ่มต้น true) หรือ "24 ก.ย." (withYear: false)
 * ใช้ในโมดูลบัญชี V2 เท่านั้น (โมดูลอื่นยังใช้ formatThaiDate พ.ศ. ตามเดิม)
 */
export function formatDateTh(d: Date | string, opts?: { withYear?: boolean }): string {
  const withYear = opts?.withYear ?? true;
  const iso = thaiDateKey(d); // "YYYY-MM-DD" ตามโซนไทย กันเพี้ยนวันข้าม UTC
  const [y, m, day] = iso.split("-").map(Number);
  const dayNum = String(day);
  const month = THAI_MONTH_SHORT[m - 1] ?? "";
  return withYear ? `${dayNum} ${month} ${y}` : `${dayNum} ${month}`;
}

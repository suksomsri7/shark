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

// CRM C5.5-fix7 ▸ RV-3: ค่าฟิลด์ DATETIME ของ CRM (ขณะจริง เก็บเป็น UTC) — ตัวเดียวที่หน้าระเบียนของพนักงาน (components/crm/objects/types.ts) ·
//   หน้าผู้ติดต่อ 360 + ไฟล์ส่งออก (crm/contacts.ts) · พอร์ทัล (crm/portal.ts) ใช้ร่วมกัน · อยู่ที่นี่เพราะทั้งคอมโพเนนต์และโมดูล import ได้
//   (คอมโพเนนต์ import ไฟล์ลึกของ crm ไม่ได้ — fitness F2.3) · ค่าที่อ่านไม่ได้ = คืนค่าเดิม (ไม่ขึ้น "Invalid Date") ◂
/** วันที่+เวลา ปี พ.ศ. เต็ม "9 ต.ค. 2569 00:30" — ค่าฟิลด์ DATETIME ของ CRM */
export function formatThaiDateTimeFull(d: Date | string): string {
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return String(d);
  return new Date(t).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
/**
 * ISO วันเวลาตามโซนไทยที่บอกเขตเวลาเอง "2026-10-09T00:30:00+07:00" — สำหรับ CSV/ไฟล์ส่งออก (อ่านด้วยเครื่องได้ ไม่กำกวม ·
 * ตัวตรวจ DATETIME ของ engine ฟิลด์รับค่านี้ตรงตัว ⇒ นำเข้ากลับได้ขณะเดิมแม้เครื่องตั้งเวลาไทย) · ไทยไม่มีเวลาออมแสง ⇒ +07:00 คงที่
 * CRM C5.5-fix10 ▸ FX7-3: engine เก็บมิลลิวินาทีที่มากับ API/ไฟล์นำเข้า (ISO_RE รับ .sss) ⇒ ค่าที่มีมิลลิวินาที = ใส่ ".sss" ด้วย
 *   (ส่งออก → นำเข้า ได้ขณะเดิมตรงตัว) · ค่าที่ลงตัววินาที (ทุกค่าที่กรอกจากหน้าจอ) = รูปเดิมไบต์ต่อไบต์ ◂
 */
export function thaiIsoDateTime(d: Date | string): string {
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return String(d);
  const iso = new Date(t + 7 * 60 * 60 * 1000).toISOString();
  return `${iso.slice(0, 19)}${t % 1000 === 0 ? "" : iso.slice(19, 23)}+07:00`;
}
/**
 * CRM C5.5-fix10 ▸ (คำถามเจ้าของข้อ 5) ค่าฟิลด์ DATE ของ CRM ("YYYY-MM-DD" = วันในปฏิทิน ไม่มีเวลา) → "9 ต.ค. 2569" ·
 *   ตัวเดียวที่หน้าระเบียนของพนักงาน (components/crm/objects/types.ts) และหน้าผู้ติดต่อ 360 ใช้ · ตีความเป็นวัน UTC (ไม่เลื่อนวันตามเขตเวลา) ·
 *   รูปแบบอื่น = คืนค่าเดิม · ใช้แสดงผลเท่านั้น (ไฟล์ส่งออกยังเป็น "YYYY-MM-DD") ◂
 */
export function formatThaiDateFull(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(ymd)) return ymd;
  const t = Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return ymd;
  return new Date(t).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// ─────────────────── ปี ค.ศ. (โมดูลบัญชี V2) ───────────────────
// account-v2 ใช้ปี "คริสต์ศักราช" ไม่ใช่ พ.ศ. (ต่างจาก formatThaiDate ด้านบนที่ th-TH ให้ พ.ศ. อัตโนมัติ)
// ตามมติเจ้าของ (DESIGN-SPEC-V2/BLUEPRINT-ACCOUNT-V2 §1 "Christian-era dates") — ห้ามใช้ toLocaleDateString("th-TH")
// ตรงนี้เพราะจะได้ปี พ.ศ. ผิดกติกาโมดูล

export const THAI_MONTH_SHORT = [
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

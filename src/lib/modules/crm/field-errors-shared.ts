// field-errors-shared.ts — รูปผลปฏิเสธ "รายช่อง" ของ server action ฝั่ง CRM (C4.3-fix part 2 · มติ D-b1)
//   `{ ok:false, error, code?, fieldErrors? }` — `error` ยังอยู่เสมอ (ผู้เรียกที่มีแค่กล่องเดียว/REST ใช้ได้เหมือนเดิม) ·
//   `fieldErrors` = ช่องไหนผิด → ข้อความไทยของบริการ (ฟอร์มเอาไปแสดงใต้ช่องนั้น + โฟกัส)
//   🔴 บริการเป็นตัวตัดสินเสมอ (REST เดินทางเดียวกัน) — ที่นี่แค่ "ชี้" ว่าข้อความปฏิเสธเป็นของช่องไหน ด้วยตัวตรวจแบบเดียวกับฝั่งจอ
//   🔴 pure: ไม่มี env/prisma — ใช้ได้ทั้งใน "use server" และ client

export type CrmFieldErrors = Record<string, string>;

/** โค้ดของ error ที่แปลว่า "ค่าที่กรอกไม่ผ่าน" (โมดูลต่าง ๆ ตั้งชื่อไม่เหมือนกัน) — อย่างอื่น (สิทธิ์/ไม่พบ/เพดาน) ไม่ผูกกับช่อง */
const VALIDATION_CODES = new Set(["VALIDATION", "INVALID", "INVALID_INPUT", "BAD_INPUT", "CONFIRM_REQUIRED", "REASON_REQUIRED", "REQUIRED"]);

/**
 * ผูกข้อความปฏิเสธเข้ากับช่อง: ช่องแรก (ตามลำดับที่ส่งมา) ที่ `bad[k] === true` ได้ข้อความของบริการ
 * — ใช้เฉพาะเมื่อ code เป็นชนิด "ค่าไม่ผ่าน" (หรือไม่มี code แต่ผู้เรียกบอกว่าเป็น validation ผ่าน `force`)
 */
export function withFieldError<F extends { ok: false; error: string; code?: string }>(
  fail: F,
  bad: Record<string, boolean>,
  opts: { force?: boolean } = {},
): F & { fieldErrors?: CrmFieldErrors } {
  if (!opts.force && !(fail.code && VALIDATION_CODES.has(fail.code))) return fail;
  const k = Object.keys(bad).find((x) => bad[x]);
  return k ? { ...fail, fieldErrors: { [k]: fail.error } } : fail;
}

/** ข้อความว่าง/ช่องว่างล้วน */
export const blank = (v: unknown): boolean => typeof v !== "string" || !v.trim();

// ───────── ฟิลด์กำหนดเองที่ "ต้องกรอก" ของผู้ติดต่อ/บริษัท (C4.3-fix part 2 · round 2 · controller: บริการต้องบังคับเอง) ─────────
/** ชนิดฟิลด์ที่ฟอร์มสร้างผู้ติดต่อ/บริษัทแสดงให้กรอก (= customFieldLayout ใน contacts.ts) — บังคับเฉพาะที่ผู้ใช้กรอกได้จริง */
export const CREATE_FORM_CUSTOM_TYPES: readonly string[] = ["TEXT", "LONG_TEXT", "NUMBER", "SELECT", "DATE", "BOOLEAN"];
/** key ใน fieldErrors ของฟิลด์กำหนดเอง (ไม่ชนชื่อช่องมาตรฐานของฟอร์ม) */
export const customFieldErrorKey = (key: string): string => `cf:${key}`;
/** ข้อความเดียวกับฟอร์ม (NewCompanyForm / NewContactForm) */
export const requiredCustomMessage = (label: string): string => `ช่อง "${label}" เป็นข้อมูลที่ต้องกรอก`;
type LayoutLike = {
  sections: { sensitive?: boolean; fields: { key: string; label: string; type: string; required: boolean; isSystem?: boolean; sensitive?: boolean; defaultValue?: unknown }[] }[];
};
const blankValue = (v: unknown): boolean => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
/**
 * ฟิลด์กำหนดเองตัวแรก (ตามลำดับบนฟอร์ม) ที่ต้องกรอกแต่ไม่มีค่า — ใช้ตอน "สร้าง" (engine ตรวจเฉพาะ key ที่ส่งมา การไม่ส่งเลยต้องตรวจที่นี่ ·
 * กติกาเดียวกับ objects.ts records.create) · ฟิลด์ที่มีค่าเริ่มต้นไม่นับว่าขาด · ฟิลด์ระบบ/อ่อนไหว/ชนิดที่ฟอร์มไม่แสดง = ไม่บังคับที่นี่
 */
export function missingRequiredCustom(layout: LayoutLike, values: Record<string, unknown>): { key: string; label: string } | null {
  for (const s of layout.sections) {
    if (s.sensitive) continue;
    for (const f of s.fields) {
      if (!f.required || f.isSystem || f.sensitive || !CREATE_FORM_CUSTOM_TYPES.includes(f.type)) continue;
      if (f.defaultValue !== null && f.defaultValue !== undefined) continue;
      if (blankValue(values[f.key])) return { key: f.key, label: f.label };
    }
  }
  return null;
}

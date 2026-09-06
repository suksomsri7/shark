// form.ts — parser ของฟอร์ม "ตราสินค้าและธีมกิจการ" (pure ล้วน · ไม่แตะ DB/env/เครือข่าย)
// สัญญา: ledger/BRANDING-RUN.md §สัญญา B2 · ใช้โดย src/app/app/settings/branding/actions.ts
// และทดสอบตรงโดย scripts/qc-branding-b2.mts (S2.1–S2.3)
//
// 🔴 หลักการ: รับ FormData ดิบจากฝั่ง client มาตรวจ/แปลงที่เดียว — หน้าจอ/ปุ่มไหนจะยิงบันทึก
//    ก็ต้องผ่านฟังก์ชันนี้ก่อนเสมอ ห้ามแตะ field ของ FormData ตรง ๆ ใน action

/** โทนแถบเมนู — ชุดเดียวกับ enum `NavTone` ของ Prisma (พิมพ์ซ้ำเป็น string union เพื่อไม่ให้ไฟล์นี้ลาก @prisma/client) */
export type NavToneValue = "LIGHT" | "BRAND" | "DARK";
const NAV_TONES: readonly NavToneValue[] = ["LIGHT", "BRAND", "DARK"];

export type BrandingFormInput = {
  /** ว่าง = null (ใช้ชื่อกิจการปริยาย) */
  displayName: string | null;
  /** ว่าง = null (ใช้สีปริยายของแพลตฟอร์ม) */
  brandColor: string | null;
  navTone: NavToneValue;
  applyStorefront: boolean;
  applyMobile: boolean;
  /** จำสถานะย่อ/ขยายแถบเมนูของแต่ละคน — ยังไม่มีคอลัมน์เก็บ (ของ B3/UserPreference) ฟอร์มนี้แค่ parse ไว้ก่อน */
  rememberCollapse: boolean;
};

export type ParseBrandingFormResult =
  | { ok: true; input: BrandingFormInput }
  | { ok: false; errors: Record<string, string> };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_DISPLAY_NAME = 80;

function fieldStr(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

/** ทะเบียน checkbox/toggle ของทั้งฟอร์ม: ค่า `"on"` = true · อะไรอื่น (รวมไม่มี field เลย) = false */
function fieldBool(fd: FormData, key: string): boolean {
  return fieldStr(fd, key) === "on";
}

/**
 * แปลง+ตรวจฟอร์มตั้งค่าธีม — ไม่ throw เด็ดขาด คืนผลเป็น union เสมอ
 * ค่าว่าง (ชื่อ/สี) = ล้างค่า ไม่ใช่ error · ค่าที่ผิดรูปแบบ (ยาวเกิน/hex ผิด/โทนไม่รู้จัก) = error ไทยต่อฟิลด์
 */
export function parseBrandingForm(fd: FormData): ParseBrandingFormResult {
  const errors: Record<string, string> = {};

  const rawName = fieldStr(fd, "displayName").trim();
  const displayName: string | null = rawName || null;
  if (rawName.length > MAX_DISPLAY_NAME) {
    errors.displayName = `ชื่อที่แสดงยาวเกินไป — ต้องไม่เกิน ${MAX_DISPLAY_NAME} ตัวอักษร (ตอนนี้ ${rawName.length} ตัวอักษร)`;
  }

  const rawColor = fieldStr(fd, "brandColor").trim();
  const brandColor: string | null = rawColor || null;
  if (rawColor !== "" && !HEX_RE.test(rawColor)) {
    errors.brandColor = "รหัสสีไม่ถูกต้อง — ต้องเป็นรูปแบบ #RRGGBB เช่น #1A2B3C";
  }

  const rawTone = fieldStr(fd, "navTone").trim().toUpperCase();
  let navTone: NavToneValue = "LIGHT";
  if (rawTone !== "") {
    if ((NAV_TONES as readonly string[]).includes(rawTone)) {
      navTone = rawTone as NavToneValue;
    } else {
      errors.navTone = "โทนแถบเมนูไม่ถูกต้อง — เลือกได้เฉพาะ สว่าง / สีหลักของกิจการ / เข้ม";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    input: {
      displayName,
      brandColor,
      navTone,
      applyStorefront: fieldBool(fd, "applyStorefront"),
      applyMobile: fieldBool(fd, "applyMobile"),
      rememberCollapse: fieldBool(fd, "rememberCollapse"),
    },
  };
}

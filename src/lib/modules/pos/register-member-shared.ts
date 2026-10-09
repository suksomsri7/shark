// register-member-shared.ts — ตัวช่วยบริสุทธิ์ของฝั่งสมาชิกบนหน้าขาย (POS P1.12U · ภาพ 01 การ์ดสมาชิก · 14A แผงสมาชิก · 02 แต้ม)
//
// 🔴 client component import ได้ — ไม่ import อะไรเลย (ไม่แตะ prisma / register-member.ts / register.ts)
// 🔴 ข้อความที่แสดงบนจอมาจากคีย์ pos.member.* เท่านั้น — ไฟล์นี้คืน "คีย์ + ค่า" ให้จอแปลเอง (ไทย/อังกฤษ)

/** ซื้อล่าสุดเมื่อไร → คีย์ใต้ pos.member.panel.ago.* + จำนวน (วันนี้ · N วันก่อน · N สัปดาห์ก่อน · N เดือนก่อน · N ปีก่อน) */
export type MemberAgo = { key: "today" | "days" | "weeks" | "months" | "years"; count: number };

const DAY_MS = 86_400_000;

/**
 * ระยะห่างแบบคนอ่าน (มติ 4: "3 วันก่อน" / "2 สัปดาห์ก่อน" / "4 เดือนก่อน") — นับเป็นวันตามเวลาไทย (UTC+7) ไม่ใช่ 24 ชม.
 *   < 1 วัน = วันนี้ · < 14 วัน = วัน · < 60 วัน = สัปดาห์ · < 365 วัน = เดือน (30 วัน) · อื่น ๆ = ปี · ค่าเพี้ยน/อนาคต = วันนี้
 */
export function memberAgo(iso: string, now: Date = new Date()): MemberAgo {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return { key: "today", count: 0 };
  const bkkDay = (ms: number) => Math.floor((ms + 7 * 3_600_000) / DAY_MS);
  const days = bkkDay(now.getTime()) - bkkDay(t);
  if (days < 1) return { key: "today", count: 0 };
  if (days < 14) return { key: "days", count: days };
  if (days < 60) return { key: "weeks", count: Math.floor(days / 7) };
  if (days < 365) return { key: "months", count: Math.max(1, Math.floor(days / 30)) };
  return { key: "years", count: Math.floor(days / 365) };
}

/** ชื่อสั้นสำหรับประโยค ("สมชาย มี 1,240 แต้ม") — ตัดคำนำหน้า "คุณ" แล้วเอาคำแรก · ว่าง = ชื่อเดิม */
export function memberShortName(name: string): string {
  const s = name.trim().replace(/^คุณ\s*/, "");
  return (s.split(/\s+/)[0] || name).trim();
}

/** อักษรตัวแรกของวงกลมรูปแทน (ภาพ 01/14A: "คุณสมชาย" → "ส") — ข้ามคำนำหน้า "คุณ" · ตัวอักษรตัวแรกตามกราฟีม */
export function memberInitial(name: string): string {
  const s = name.trim().replace(/^คุณ\s*/, "") || name.trim();
  const first = Array.from(s)[0] ?? "?";
  return first.toUpperCase();
}

/** ตัวเลขล้วน (ตัด ช่องว่าง/ขีด) — ใช้เติมเบอร์ในฟอร์มสมัครจากคำค้นที่เป็นตัวเลข · ไม่ใช่ตัวเลขล้วน = null */
export function digitsOnlyQuery(q: string): string | null {
  const s = q.trim();
  if (!s || !/^[\d\s-]+$/.test(s)) return null;
  const d = s.replace(/[\s-]/g, "");
  return d ? d.slice(0, 10) : null;
}

/** เบอร์ที่ส่งสมัครได้ (มติ 4: ปุ่มสมัครเปิดเมื่อ 9–10 หลัก) — เซิร์ฟเวอร์ตรวจซ้ำเอง (PHONE_INVALID) */
export function quickPhoneReady(phone: string): boolean {
  const d = phone.replace(/[\s-]/g, "");
  return /^\d{9,10}$/.test(d);
}

/** ช่องวันเกิดแบบพิมพ์ "วว / ดด / ปปปป" — รับตัวเลขอย่างเดียวแล้วจัดรูปให้ (สูงสุด 8 หลัก) */
export function maskBirthDateInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)} / ${d.slice(2)}`;
  return `${d.slice(0, 2)} / ${d.slice(2, 4)} / ${d.slice(4)}`;
}

/**
 * วันเกิดที่พิมพ์ → YYYY-MM-DD (ส่งเซิร์ฟเวอร์) · ว่าง = { ok: true, ymd: null } · ปีพุทธศักราช (≥ 2400) แปลงเป็น ค.ศ. (−543) ·
 * วันที่ไม่มีจริง / อนาคต / ก่อน 1900 / ไม่ครบ 8 หลัก = { ok: false } (จอแสดง "วันเกิดไม่ถูกต้อง" และไม่ส่ง)
 */
export function parseBirthDateInput(text: string, now: Date = new Date()): { ok: true; ymd: string | null } | { ok: false } {
  const d = text.replace(/\D/g, "");
  if (!d) return { ok: true, ymd: null };
  if (d.length !== 8) return { ok: false };
  const day = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  let year = Number(d.slice(4));
  if (year >= 2400) year -= 543;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return { ok: false };
  if (year < 1900 || dt.getTime() > now.getTime()) return { ok: false };
  return { ok: true, ymd: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}

/**
 * อัตราแลกแต้ม (มติ 6): 100 หารลงตัวด้วย burnRateSatang ⇒ "{N} แต้ม = ฿1" · ไม่ลงตัว ⇒ "1 แต้ม = ฿{burnRateSatang/100}"
 *   คืน { points, baht } ให้คีย์ pos.member.pay.rate · burnRate ≤ 0 = null (ไม่แสดง)
 */
export function pointsRate(burnRateSatang: number): { points: number; baht: string } | null {
  if (!Number.isFinite(burnRateSatang) || burnRateSatang <= 0) return null;
  if (100 % burnRateSatang === 0) return { points: 100 / burnRateSatang, baht: "1" };
  return { points: 1, baht: String(Number((burnRateSatang / 100).toFixed(2))) };
}

/** โค้ดคูปองที่จะส่ง (มติ 8): ตัดช่องว่างหัวท้าย + ตัวพิมพ์ใหญ่ · ว่าง = null */
export function normalizeCouponCode(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  return s ? s.slice(0, 64) : null;
}

/** ช่องแต้ม: ตัวเลขล้วน ≤ 7 หลัก · ว่าง = 0 */
export function parsePointsInput(raw: string): number {
  const d = raw.replace(/\D/g, "").slice(0, 7);
  return d ? Number(d) : 0;
}

/** รหัสบัตรสมาชิก (QR บนบัตร/แอป) ที่สแกนเข้ามา — ไปทางค้นสมาชิก ไม่ใช่ค้นสินค้า */
export const MEMBER_CARD_PREFIX = "SHARK-MC:";
export function isMemberCardCode(code: string): boolean {
  return code.trim().toUpperCase().startsWith(MEMBER_CARD_PREFIX);
}

/**
 * POS P1.12U fix รอบ 1 (F7): สีป้ายระดับจาก tier.color — รับเฉพาะ hex (#rgb · #rgba · #rrggbb · #rrggbbaa) · อื่น ๆ (ว่าง · ชื่อสี · ค่าแปลก) = null
 * ⇒ จอใช้ป้ายเทาแบบ "ทั่วไป" (อ่านออกเสมอ)
 */
export function tierBadgeColor(color: string | null | undefined): string | null {
  return typeof color === "string" && /^#[0-9a-f]{3,8}$/i.test(color) ? color : null;
}

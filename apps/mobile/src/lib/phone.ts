// เบอร์มือถือไทยฝั่งแอป (ใบ S2.12) — normalizer สำเนา regex เดียวกับ server (src/lib/core/phone-auth.ts · R-S1.19d)
// แอป normalize ก่อนส่งเสมอ · server ตรวจซ้ำอีกชั้น (ห้ามเชื่อฝั่งแอปอย่างเดียว)

/** "081-234-5678" | "+66 81 234 5678" | "66812345678" → "+66812345678" · ไม่ใช่มือถือไทย ⇒ null */
export function normalizeThaiMobile(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").replace(/[\s\-().]/g, "");
  const m = /^(?:(?:\+?66)0?|0)([689]\d{8})$/.exec(s);
  return m ? `+66${m[1]}` : null;
}

/** "+66812345678" → "0812345678" (null ถ้าไม่ใช่มือถือไทย) */
export function localThaiMobile(raw: string | null | undefined): string | null {
  const e = normalizeThaiMobile(raw);
  return e ? `0${e.slice(3)}` : null;
}

/** จัดรูปตอนพิมพ์: ตัวเลขล้วน ≤ 10 หลัก → "081-234-5678" · ขึ้นต้น + (รหัสประเทศ) = คงไว้ตามที่พิมพ์ */
export function formatThaiMobileInput(raw: string): string {
  if (raw.trim().startsWith("+")) return "+" + raw.replace(/[^\d ]/g, "").slice(0, 16);
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

/** แสดงเบอร์แบบปิดเลขกลาง "081-•••-5678" · เบอร์ใช้ไม่ได้ ⇒ "" */
export function maskPhone(raw: string | null | undefined): string {
  const l = localThaiMobile(raw);
  return l ? `${l.slice(0, 3)}-•••-${l.slice(6)}` : "";
}

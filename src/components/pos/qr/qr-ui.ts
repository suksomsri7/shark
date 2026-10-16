// qr-ui.ts — ตัวช่วยบริสุทธิ์ของหน้าสาธารณะ QR (/q/** · POS P2.7U) — client-safe · ไม่มีข้อความไทย (ST7) · ไม่แตะ DB/เซิร์ฟเวอร์
//   🔴 ยอดเงินทุกตัวมาจากเซิร์ฟเวอร์ (เมนู · quote · บิล · สถานะ) — ที่นี่จัดรูปอย่างเดียว · เวลา = ISO ของเซิร์ฟเวอร์ จัดรูปฝั่งเครื่องหลัง mount (HF-418)
//   🔴 โทเคนแขก (guestToken) เก็บต่อเครื่องใน localStorage — อ่าน/เขียนพังได้ (private mode) ⇒ ใช้โทเคนของรอบหน้าแทน

import type { QrMenuItem } from "@/lib/modules/pos/qr-order-shared";

export type QrLocale = "th" | "en";

/** สตางค์ → "฿1,234" / "฿40.50" (สกุลเดียวทั้งสองภาษา แบบใบเสร็จออนไลน์) */
export function qrBaht(satang: number): string {
  const n = Number.isFinite(satang) ? Math.trunc(satang) : 0;
  const a = Math.abs(n);
  const whole = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = a % 100;
  return `${n < 0 ? "-" : ""}\u0E3F${whole}${frac ? `.${String(frac).padStart(2, "0")}` : ""}`;
}

/** ISO → "HH:MM" เวลาไทย (ว่าง = อ่านไม่ได้) */
export function bkkHm(iso: string | null | undefined): string {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return "";
  const d = new Date(at + 7 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** วินาทีที่เหลือถึง iso (0 = หมดแล้ว · null = ไม่มีเวลา) */
export function secondsLeft(iso: string | null | undefined, nowMs: number): number | null {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at - nowMs) / 1000));
}

/** วินาที → "m:ss" */
export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** ชื่อตามภาษา (en ไม่มี = ชื่อไทย) */
export const nameOf = (x: { name: string; nameEn: string | null }, locale: QrLocale): string => (locale === "en" && x.nameEn ? x.nameEn : x.name);

/** หมวดของเมนูตามลำดับที่เซิร์ฟเวอร์เรียงมา (ไม่มีหมวด = กลุ่มท้าย key "_") */
export function menuCategories(menu: readonly QrMenuItem[]): { key: string; name: string | null; items: QrMenuItem[] }[] {
  const out: { key: string; name: string | null; items: QrMenuItem[] }[] = [];
  const at = new Map<string, number>();
  for (const m of menu) {
    const key = m.categoryId ?? "_";
    let i = at.get(key);
    if (i === undefined) {
      i = out.length;
      at.set(key, i);
      out.push({ key, name: m.categoryName, items: [] });
    }
    out[i]!.items.push(m);
  }
  return out;
}

// ═══════════ ตะกร้าของแขก ═══════════
/** บรรทัดในตะกร้า (ชื่อ/ตัวเลือกไว้แสดง · ราคาของบรรทัด = quote ของเซิร์ฟเวอร์เท่านั้น) */
export type QrCartItem = { key: string; productId: string; qty: number; choiceIds: string[]; note: string; name: string; options: string[] };
/** บรรทัดเดียวกัน = สินค้า + ตัวเลือกชุดเดียวกัน + โน้ตเดียวกัน (กดเพิ่มซ้ำ = จำนวนเพิ่ม) */
export const cartKeyOf = (productId: string, choiceIds: readonly string[], note: string) => `${productId}|${[...choiceIds].sort().join(",")}|${note.trim()}`;
export function cartAdd(cart: readonly QrCartItem[], item: Omit<QrCartItem, "key">, maxQty: number): QrCartItem[] {
  const key = cartKeyOf(item.productId, item.choiceIds, item.note);
  const hit = cart.find((c) => c.key === key);
  if (hit) return cart.map((c) => (c.key === key ? { ...c, qty: Math.min(maxQty, c.qty + item.qty) } : c));
  return [...cart, { ...item, key, note: item.note.trim() }];
}
export const cartSetQty = (cart: readonly QrCartItem[], key: string, qty: number, maxQty: number): QrCartItem[] =>
  qty <= 0 ? cart.filter((c) => c.key !== key) : cart.map((c) => (c.key === key ? { ...c, qty: Math.min(maxQty, qty) } : c));
/** ตะกร้า → บรรทัดที่ส่งเซิร์ฟเวอร์ (QrCartLine) */
export const cartLines = (cart: readonly QrCartItem[]) => cart.map((c) => ({ productId: c.productId, qty: c.qty, ...(c.choiceIds.length ? { choiceIds: c.choiceIds } : {}), ...(c.note ? { note: c.note } : {}) }));
export const cartCount = (cart: readonly QrCartItem[]) => cart.reduce((s, c) => s + c.qty, 0);

/** สุ่มรหัส (crypto ก่อน · ไม่มี = เวลา + Math.random — ใช้เป็นคีย์กันซ้ำเท่านั้น ไม่ใช่ความลับ) */
function randomHex(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(0, 32).padEnd(16, "0");
  }
}
const GUEST_KEY = "shark.pos.qr.guest";
/** โทเคนแขกต่อเครื่อง (กันส่งรอบซ้ำ · CD-O7) — รูป QR_GUEST_TOKEN_RE */
export function guestTokenOfDevice(): string {
  try {
    const v = window.localStorage.getItem(GUEST_KEY);
    if (v && /^[A-Za-z0-9_-]{8,64}$/.test(v)) return v;
    const n = `g${randomHex()}`.slice(0, 40);
    window.localStorage.setItem(GUEST_KEY, n);
    return n;
  } catch {
    return `g${randomHex()}`.slice(0, 40);
  }
}
/** คีย์ของคำขอสั่งล่วงหน้า (1 ต่อตะกร้าที่ยืนยัน · ส่งซ้ำ = ออเดอร์เดิม) — รูป QR_IDEMPOTENCY_KEY_RE */
export const newPreorderKey = (): string => `qrp-${randomHex()}`.slice(0, 60);

/** ลิงก์สลับภาษาของหน้าเดิม (คง path · แทน ?lang) */
export const langHref = (lang: QrLocale): string => `?lang=${lang}`;

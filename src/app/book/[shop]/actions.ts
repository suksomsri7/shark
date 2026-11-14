"use server";
// /book/[shop] — ฟอร์มของเส้นจองสาธารณะ (ถือที่ · ยืนยันการจอง) · RUN TRIPS W1.2a (ใบสั่ง ledger/trips-briefs/W1.2.md §2 §4 §6)
// ไม่มี session (ลูกค้าไม่ล็อกอิน) — ด่านคือด่านอัตรา + ลายเซ็นของ nonce/token/sel ใน platform/trips-book · ไฟล์นี้ไม่ตัดสินอะไรเอง
// FormData → platform → redirect จากผลของ platform เท่านั้น (slug ร้านตัวจริง · token ที่ platform คืน · มติ R14) · ผิด ⇒ e/f เท่านั้น ไม่มีค่าที่กรอก (มติ R11)
// อาร์กิวเมนต์ที่ผูกด้วย bind (ร้าน/สินค้า/ตะกร้า/sel ของหน้า) เข้ารหัสโดย framework · ค่าทุกตัวถูกตรวจซ้ำใน platform
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { confirmBookHold, startBookHold } from "@/lib/platform/trips-book";
import { bookCheckoutHref, bookReservationHref, bookSelectHref } from "@/lib/platform/trips-book-core";
import { bookRequestFromHeaders } from "@/lib/platform/trips-public";

/** ค่าสตริงของฟอร์ม (ตัวแรกของแต่ละชื่อ · ไม่เกิน 200 ช่อง) — ไฟล์/ค่าอื่นทิ้ง */
function formOf(data: unknown): Record<string, string> {
  const out = new Map<string, string>();
  if (!(data instanceof FormData)) return {};
  let n = 0;
  for (const [k, v] of data.entries()) {
    if (++n > 200) break;
    if (typeof v === "string" && !out.has(k)) out.set(k, v);
  }
  return Object.fromEntries(out);
}

/** หน้าสินค้า → ถือที่ → หน้ายืนยัน (ไม่สำเร็จ ⇒ กลับหน้าสินค้าพร้อมการเลือกเดิมและรหัสผิดพลาด) */
export async function startBookHoldAction(shop: unknown, productSlug: unknown, data: unknown): Promise<void> {
  const h = await headers();
  const req = bookRequestFromHeaders((name) => h.get(name), "POST");
  const r = await startBookHold({ shop, productSlug, form: formOf(data), acceptLanguage: req.acceptLanguage, clientKey: req.clientKey });
  if (r.ok) redirect(bookCheckoutHref(r.shopSlug, r.basketToken, r.sel));
  if (r.shopSlug && r.back) redirect(bookSelectHref(r.shopSlug, r.back, r.code));
  notFound();
}

/** หน้ายืนยัน → ยืนยันการจอง → หน้าการจอง (ทำไปแล้ว ⇒ หน้าการจองเดิม · ไม่สำเร็จ ⇒ หน้ายืนยันพร้อมรหัส/ช่อง) */
export async function confirmBookHoldAction(shop: unknown, basketToken: unknown, sel: unknown, data: unknown): Promise<void> {
  const h = await headers();
  const req = bookRequestFromHeaders((name) => h.get(name), "POST");
  const r = await confirmBookHold({ shop, basketToken, sel, form: formOf(data), clientKey: req.clientKey });
  if (r.ok) redirect(bookReservationHref(r.shopSlug, r.token));
  if (r.code === "DONE" && r.shopSlug && r.token) redirect(bookReservationHref(r.shopSlug, r.token));
  if (r.shopSlug && typeof basketToken === "string" && typeof sel === "string") redirect(bookCheckoutHref(r.shopSlug, basketToken, sel, { e: r.code, f: r.fields }));
  notFound();
}

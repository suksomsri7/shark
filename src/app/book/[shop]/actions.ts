"use server";
// /book/[shop] — ฟอร์มของเส้นจองสาธารณะ (ถือที่ · ยืนยันการจอง · ถือใหม่) · RUN TRIPS W1.2a (ใบสั่ง ledger/trips-briefs/W1.2.md §2 §4 §6 · มติ W2 W5)
// ไม่มี session (ลูกค้าไม่ล็อกอิน) — ด่านคือด่านอัตรา + ลายเซ็นของ nonce/token/sel ใน platform/trips-book · ไฟล์นี้ไม่ตัดสินอะไรเอง
// FormData → platform → redirect จากผลของ platform (slug ร้านตัวจริง · token/sel ที่ platform คืน · ภาษาที่ platform ตรวจแล้ว · มติ R14 W5)
// ผิด ⇒ e/f เท่านั้น ไม่มีค่าที่กรอก (มติ R11) · ค่าทุกตัวที่ใส่ใน Location ผ่าน bookRedirectOk (รูป + ความยาว · มติ W5)
// อาร์กิวเมนต์ที่ผูกด้วย bind (ร้าน/สินค้า/ตะกร้า/sel ของหน้า) มาจาก URL ของหน้า — ผู้ใช้แก้ได้ · platform ตรวจลายเซ็นซ้ำทุกตัว
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { confirmBookHold, releaseBookHold, startBookHold } from "@/lib/platform/trips-book";
import { BOOK_HOLD_LIMITED, bookCheckoutHref, bookRedirectOk, bookReservationHref, bookSelectHref } from "@/lib/platform/trips-book-core";
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

/**
 * หน้าสินค้า → ถือที่ → หน้ายืนยัน (ไม่สำเร็จ ⇒ กลับหน้าสินค้าพร้อมการเลือกเดิมและรหัสผิดพลาด)
 * ถังถือ/ถังต่อรอบของเครื่องเต็มจริง ⇒ `e=HOLD_LIMITED` · ถังอ่านเต็ม/ด่านล่ม ⇒ `e=RATE_LIMITED` (ข้อความกลาง · มติ Y5)
 */
export async function startBookHoldAction(shop: unknown, productSlug: unknown, data: unknown): Promise<void> {
  const h = await headers();
  const req = bookRequestFromHeaders((name) => h.get(name), "POST");
  const r = await startBookHold({ shop, productSlug, form: formOf(data), acceptLanguage: req.acceptLanguage, clientKey: req.clientKey });
  if (r.ok && bookRedirectOk({ shopSlug: r.shopSlug, basketToken: r.basketToken, sel: r.sel })) redirect(bookCheckoutHref(r.shopSlug, r.basketToken, r.sel, null, r.lang));
  if (!r.ok && r.back && bookRedirectOk({ shopSlug: r.shopSlug })) redirect(bookSelectHref(r.shopSlug ?? "", r.back, r.holdLimited ? BOOK_HOLD_LIMITED : r.code));
  notFound();
}

/** หน้ายืนยัน → ยืนยันการจอง → หน้าการจอง (ทำไปแล้ว ⇒ หน้าการจองเดิม · ไม่สำเร็จ ⇒ หน้ายืนยันพร้อมรหัส/ช่อง) */
export async function confirmBookHoldAction(shop: unknown, basketToken: unknown, sel: unknown, data: unknown): Promise<void> {
  const h = await headers();
  const req = bookRequestFromHeaders((name) => h.get(name), "POST");
  const r = await confirmBookHold({ shop, basketToken, sel, form: formOf(data), clientKey: req.clientKey });
  if (r.ok && bookRedirectOk({ shopSlug: r.shopSlug, token: r.token })) redirect(bookReservationHref(r.shopSlug, r.token, r.lang));
  if (!r.ok) {
    if (r.code === "DONE" && bookRedirectOk({ shopSlug: r.shopSlug, token: r.token })) redirect(bookReservationHref(r.shopSlug ?? "", r.token ?? "", r.lang));
    if (bookRedirectOk({ shopSlug: r.shopSlug, basketToken, sel })) redirect(bookCheckoutHref(r.shopSlug ?? "", String(basketToken), String(sel), { e: r.code, f: r.fields }, r.lang));
  }
  notFound();
}

/** หน้ายืนยัน "ถือใหม่" (ราคาเปลี่ยน/หมดเวลา) → ปล่อยที่ถือของตะกร้าเดิม → หน้าสินค้าพร้อมการเลือกเดิม (มติ W2) */
export async function reholdBookAction(shop: unknown, basketToken: unknown, sel: unknown, data: unknown): Promise<void> {
  const h = await headers();
  const req = bookRequestFromHeaders((name) => h.get(name), "POST");
  const r = await releaseBookHold({ shop, basketToken, sel, lang: formOf(data).lang, clientKey: req.clientKey });
  if (r.ok && bookRedirectOk({ shopSlug: r.shopSlug })) redirect(bookSelectHref(r.shopSlug, r.back));
  if (!r.ok) {
    if (r.code === "DONE" && bookRedirectOk({ shopSlug: r.shopSlug, token: r.token })) redirect(bookReservationHref(r.shopSlug ?? "", r.token ?? "", r.lang));
    if (bookRedirectOk({ shopSlug: r.shopSlug, basketToken, sel })) redirect(bookCheckoutHref(r.shopSlug ?? "", String(basketToken), String(sel), { e: r.code }, r.lang));
  }
  notFound();
}

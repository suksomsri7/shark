"use server";
// /book/[shop]/my — ฟอร์มของ "การจองของฉัน" (ยืนยันเบอร์ผู้จอง · ยกเลิก/ยื่นคำขอคืนเงิน) · RUN TRIPS W1.3a (ใบสั่ง ledger/trips-briefs/W1.3.md §3.2 §7 · มติ K7)
// ไม่มี session (ลูกค้าไม่ล็อกอิน) — ด่านคือด่านอัตรา + ลายเซ็นของ nonce/grant ใน platform/trips-self · ไฟล์นี้ไม่ตัดสินอะไรเอง
// FormData → platform → redirect จากผลของ platform (slug ร้านตัวจริง) · token/grant ที่ใส่ใน Location ผ่านการตรวจรูปก่อน (bookRedirectOk · SELF_GRANT_RE)
// ผิด ⇒ รหัส `e` ในรายการเท่านั้น ไม่มีค่าที่กรอก (ไม่มีเบอร์ใน URL) · สำเร็จแล้ว redirect ไม่มี `g` · ไม่มีคุกกี้ (grant อยู่ใน query `g` · K7)
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { bookRedirectOk } from "@/lib/platform/trips-book-core";
import { bookRequestFromHeaders } from "@/lib/platform/trips-public";
import { cancelBookSelf, verifyBookSelf } from "@/lib/platform/trips-self";
import { SELF_GRANT_RE, selfPageErrorOf, selfReservationHref, selfShowsManage } from "@/lib/platform/trips-self-core";

/** ค่าสตริงของฟอร์ม (ตัวแรกของแต่ละชื่อ · ไม่เกิน 50 ช่อง) — ไฟล์/ค่าอื่นทิ้ง */
function formOf(data: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!(data instanceof FormData)) return out;
  let n = 0;
  for (const [k, v] of data.entries()) {
    if (++n > 50) break;
    if (typeof v === "string" && !out.has(k)) out.set(k, v);
  }
  return out;
}
const langOf = (f: Map<string, string>): "th" | "en" | null => {
  const l = f.get("lang");
  return l === "th" || l === "en" ? l : null;
};

/** หน้าการจอง (ฟอร์มยืนยันเบอร์) → grant 15 นาที → หน้ายกเลิก (`?do=cancel&g=…`) · ผิด ⇒ ฟอร์มยืนยันพร้อมรหัส */
export async function verifySelfAction(shop: unknown, token: unknown, data: unknown): Promise<void> {
  const h = await headers();
  const req = bookRequestFromHeaders((name) => h.get(name), "POST");
  const f = formOf(data);
  const lang = langOf(f);
  const r = await verifyBookSelf({ shop, token, form: { phone: f.get("phone") ?? "", nonce: f.get("nonce") ?? "" }, clientKey: req.clientKey });
  if (r.ok && bookRedirectOk({ shopSlug: r.shopSlug, token }) && SELF_GRANT_RE.test(r.grant)) redirect(selfReservationHref(r.shopSlug, String(token), lang, { act: "cancel", grant: r.grant }));
  if (!r.ok && r.code !== "NOT_FOUND" && bookRedirectOk({ shopSlug: r.shopSlug, token })) {
    const slug = r.shopSlug ?? "";
    // ปุ่มปิดแล้ว (เอเจนซี่/จบแล้ว/คำขอเปิด) ⇒ หน้าการจอง (ก้อนจัดการบอกเหตุเอง)
    if (selfShowsManage(r.code)) redirect(selfReservationHref(slug, String(token), lang));
    redirect(selfReservationHref(slug, String(token), lang, { act: "cancel", error: selfPageErrorOf(r) }));
  }
  notFound();
}

/** หน้ายกเลิก → ยกเลิกทันที (ยังไม่จ่าย) / ยื่นคำขอ (ขายแล้ว) → หน้าการจอง (`?done=…` ไม่มี g) · ผิด ⇒ หน้ายกเลิกพร้อมรหัส */
export async function cancelSelfAction(shop: unknown, token: unknown, grant: unknown, data: unknown): Promise<void> {
  const h = await headers();
  const req = bookRequestFromHeaders((name) => h.get(name), "POST");
  const f = formOf(data);
  const lang = langOf(f);
  const r = await cancelBookSelf({ shop, token, grant, form: { seen: f.get("seen") ?? "", accept: f.get("accept") ?? "", nonce: f.get("nonce") ?? "" }, clientKey: req.clientKey });
  if (r.ok && bookRedirectOk({ shopSlug: r.shopSlug, token })) redirect(selfReservationHref(r.shopSlug, String(token), lang, { done: r.result }));
  if (!r.ok && r.code !== "NOT_FOUND" && bookRedirectOk({ shopSlug: r.shopSlug, token })) {
    const slug = r.shopSlug ?? "";
    if (selfShowsManage(r.code)) redirect(selfReservationHref(slug, String(token), lang));
    const g = r.code !== "VERIFY_REQUIRED" && typeof grant === "string" && SELF_GRANT_RE.test(grant) ? grant : null;
    redirect(selfReservationHref(slug, String(token), lang, { act: "cancel", grant: g, error: selfPageErrorOf(r) }));
  }
  notFound();
}

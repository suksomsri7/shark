"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hotelWebClientKey, publicAttachSlip, publicCancel, publicCreateHold, publicLookup } from "@/lib/platform/hotel-web";

// SVC H.8 ▸ server actions ของหน้าจองโรงแรมสาธารณะ (ใบสั่ง h.8 §3) — ทุกตัวผ่าน platform/hotel-web เท่านั้น
//   (rate limit ต่อ IP+หน่วยบนฐาน · กันสแปม honeypot + ตั๋วเริ่มฟอร์ม · ยอดเงินคิดฝั่งเซิร์ฟเวอร์) · clientKey = IP จาก headers (x-real-ip → x-forwarded-for)
//   ผลทุกแบบ = redirect พร้อม "รหัส" (หน้าเป็นคนแปล TH/EN) — ไม่ส่งข้อความ/ข้อมูลส่วนตัวผ่าน URL (มีแค่ publicToken ของการจองเอง)
//   ทางเดิม P1 (createPublicReservationAction) ถูกแทนด้วย publicCreateHoldAction — URL หน้าเดิมคงอยู่

function s(fd: FormData, k: string, max = 200): string {
  return String(fd.get(k) ?? "").trim().slice(0, max);
}
function baseOf(fd: FormData): { tenantSlug: string; unitSlug: string; base: string; lang: string } {
  const tenantSlug = s(fd, "tenantSlug", 100);
  const unitSlug = s(fd, "unitSlug", 100);
  const l = s(fd, "lang", 4);
  return { tenantSlug, unitSlug, base: `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/hotel`, lang: l === "en" || l === "th" ? l : "" };
}
const withLang = (href: string, lang: string) => (lang ? `${href}${href.includes("?") ? "&" : "?"}lang=${lang}` : href);

/** S3 → HOLD (หรือ CONFIRMED ตามโหมด) → หน้าจ่ายมัดจำ / หน้าสถานะ */
export async function publicCreateHoldAction(formData: FormData) {
  const b = baseOf(formData);
  const clientKey = hotelWebClientKey(await headers());
  const checkIn = s(formData, "checkIn", 10);
  const checkOut = s(formData, "checkOut", 10);
  const roomTypeId = s(formData, "roomTypeId", 64);
  const ratePlanId = s(formData, "ratePlanId", 64);
  const adults = Number(s(formData, "adults", 3)) || 2;
  const rooms = Number(s(formData, "rooms", 3)) || 1;
  const r = await publicCreateHold(
    {
      tenantSlug: b.tenantSlug,
      unitSlug: b.unitSlug,
      checkIn,
      checkOut,
      adults,
      children: 0,
      rooms: [{ roomTypeId, qty: rooms, ...(ratePlanId ? { ratePlanId } : {}), adults }],
      guest: { name: s(formData, "guestName", 120), phone: s(formData, "guestPhone", 32) || null, email: s(formData, "guestEmail", 120) || null },
      couponCode: s(formData, "couponCode", 40) || null,
      locale: s(formData, "locale", 4) === "en" ? "en" : "th",
      spam: { hp: s(formData, "_sd_hp", 500), st: s(formData, "_sd_st", 300) },
      idempotencyKey: s(formData, "idempotencyKey", 128),
    },
    { clientKey },
  );
  if (!r.ok || !r.publicToken) {
    const code = !r.ok ? String(r.code) : "FAILED";
    redirect(withLang(`${b.base}/book?checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}&rooms=${rooms}&roomTypeId=${encodeURIComponent(roomTypeId)}&ratePlanId=${encodeURIComponent(ratePlanId)}&err=${encodeURIComponent(code)}`, b.lang));
  }
  const token = r.ok ? (r.publicToken ?? "") : "";
  redirect(withLang(r.ok && r.status === "HOLD" && r.intent ? `${b.base}/pay/${token}` : `${b.base}/r/${token}`, b.lang));
}

/** แนบสลิปจากฟอร์ม (ทางสำรองของ route สลิป) */
export async function publicAttachSlipAction(formData: FormData) {
  const b = baseOf(formData);
  const clientKey = hotelWebClientKey(await headers());
  const token = s(formData, "publicToken", 64);
  const f = formData.get("file");
  let state = "bad";
  if (f && typeof f !== "string") {
    const data = new Uint8Array(await f.arrayBuffer());
    const r = await publicAttachSlip({ tenantSlug: b.tenantSlug, unitSlug: b.unitSlug, publicToken: token, file: { data, contentType: f.type }, idempotencyKey: s(formData, "idempotencyKey", 128) }, { clientKey });
    state = r.ok ? "ok" : r.code === "RATE_LIMITED" ? "rate" : "bad";
  }
  redirect(withLang(`${b.base}/pay/${encodeURIComponent(token)}?slip=${state}`, b.lang));
}

/** ยกเลิกเองจากหน้าสถานะ — ยอดคืนต้องตรงที่แสดง */
export async function publicCancelAction(formData: FormData) {
  const b = baseOf(formData);
  const clientKey = hotelWebClientKey(await headers());
  const token = s(formData, "publicToken", 64);
  const r = await publicCancel(
    { tenantSlug: b.tenantSlug, unitSlug: b.unitSlug, publicToken: token, email: s(formData, "email", 200), confirmRefundSatang: Number(s(formData, "confirmRefundSatang", 12)) || 0 },
    { clientKey },
  );
  redirect(withLang(`${b.base}/r/${encodeURIComponent(token)}?cancel=${r.ok ? "ok" : encodeURIComponent(String(r.code))}`, b.lang));
}

/** หาการจองของฉัน (รหัส + อีเมล) — ไม่พบ = ข้อความเดียว */
export async function publicLookupAction(formData: FormData) {
  const b = baseOf(formData);
  const clientKey = hotelWebClientKey(await headers());
  const r = await publicLookup({ tenantSlug: b.tenantSlug, unitSlug: b.unitSlug, code: s(formData, "code", 40), email: s(formData, "email", 200) }, { clientKey });
  if (r.ok) redirect(withLang(`${b.base}/r/${r.publicToken}`, b.lang));
  redirect(withLang(`${b.base}/my?err=${!r.ok && r.code === "RATE_LIMITED" ? "rate" : "nf"}`, b.lang));
}

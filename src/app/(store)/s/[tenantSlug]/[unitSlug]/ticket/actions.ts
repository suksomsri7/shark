"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { resolveUnit, getPublicEvent, createOrder } from "@/lib/modules/ticket/service";

// ลูกค้าซื้อตั๋วออนไลน์ (public · ไม่ต้องล็อกอิน) — กรอกจากมือถือ
// resolve unit จาก slug → กันถล่มต่อ IP → ตรวจงานเปิดขาย (PUBLISHED) → createOrder(ONLINE, PENDING)
//   → publicToken (Prisma ปั๊ม cuid สุ่มกันเดา) → เด้งไปหน้าจ่ายเงิน/ตั๋ว
// createOrder มี capacity guard อะตอมมิก (updateMany sold<=quota-qty) → กันตั๋วเกินในตัว
// error ทุกกรณี = เด้งกลับหน้าซื้อพร้อม ?err (inline) — คง event ที่เลือกไว้
export async function createPublicTicketOrderAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const unitSlug = String(formData.get("unitSlug") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const buyerPhoneRaw = String(formData.get("buyerPhone") ?? "").trim();

  const base = `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/ticket`;
  const backErr = (msg: string): never =>
    redirect(`${base}?err=${encodeURIComponent(msg)}&event=${encodeURIComponent(eventId)}`);

  // กันยิงถล่ม — 5 ครั้ง/นาที/IP ต่อ unit (in-memory ต่อ instance ตามสัญญา core)
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = checkRateLimit(`ticket-buy:${tenantSlug}:${unitSlug}:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) backErr("ซื้อตั๋วถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");

  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) backErr("ไม่พบร้านนี้ หรือร้านปิดขายตั๋วออนไลน์");
  const ctx = { tenantId: resolved!.tenant.id, unitId: resolved!.unit.id };

  if (!eventId) backErr("กรุณาเลือกงาน");
  // งานต้องเปิดขาย (PUBLISHED) เท่านั้น — public ห้ามซื้อ DRAFT/ENDED/CANCELLED
  const event = await getPublicEvent(ctx.tenantId, ctx.unitId, eventId);
  if (!event) backErr("งานนี้ปิดขายแล้ว หรือไม่พบงาน");

  if (buyerName.length < 1) backErr("กรุณากรอกชื่อผู้ซื้อ");
  const phoneDigits = buyerPhoneRaw.replace(/\D/g, "");
  if (phoneDigits.length < 9 || phoneDigits.length > 15) backErr("กรุณากรอกเบอร์โทรให้ถูกต้อง");

  // อ่านจำนวนตั๋วจาก field ชื่อ "qty:<ticketTypeId>" (เลือกได้หลายประเภทในงานเดียว)
  const lines: { ticketTypeId: string; qty: number }[] = [];
  for (const [key, val] of formData.entries()) {
    if (key.startsWith("qty:")) {
      const qty = parseInt(String(val), 10);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      // conservative: จำกัด 50 ใบ/ประเภท/ออเดอร์ (กัน 1 คนกวาดทั้งงาน · capacity guard ยังคุมเพดานจริงอีกชั้น)
      if (qty > 50) backErr("ซื้อได้สูงสุด 50 ใบต่อประเภทต่อครั้ง");
      lines.push({ ticketTypeId: key.slice(4), qty });
    }
  }
  if (lines.length === 0) backErr("กรุณาเลือกจำนวนตั๋วอย่างน้อย 1 ใบ");

  const res = await createOrder(ctx, {
    eventId,
    buyerName,
    buyerPhone: buyerPhoneRaw,
    lines,
    channel: "ONLINE",
  });
  if (!res.ok) backErr(res.reason);

  // สำเร็จ → หน้าจ่ายเงิน/ตั๋ว (publicToken)
  redirect(`${base}/o/${res.ok ? res.publicToken ?? "" : ""}`);
}

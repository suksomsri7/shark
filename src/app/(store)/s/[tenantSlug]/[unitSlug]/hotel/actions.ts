"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { resolveHotelUnit, createReservation } from "@/lib/modules/hotel/service";

// ลูกค้าจองห้องออนไลน์ (public · ไม่ต้องล็อกอิน) — กรอกจากมือถือ
// resolve unit จาก slug → กันถล่มต่อ IP → createReservation (availability guard อะตอมมิกในตัว)
//   → gen publicToken → เด้งไปหน้าสถานะ/จ่ายมัดจำ
// error ทุกกรณี = เด้งกลับหน้าจองพร้อม ?err (inline) — คงช่วงวันที่ + ประเภทห้องที่เลือกไว้
export async function createPublicReservationAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const unitSlug = String(formData.get("unitSlug") ?? "").trim();
  const roomTypeId = String(formData.get("roomTypeId") ?? "").trim();
  const from = String(formData.get("from") ?? "").trim();
  const to = String(formData.get("to") ?? "").trim();
  const guestName = String(formData.get("guestName") ?? "").trim();
  const guestPhoneRaw = String(formData.get("guestPhone") ?? "").trim();

  const base = `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/hotel`;
  const keep = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const backErr = (msg: string): never =>
    redirect(`${base}?err=${encodeURIComponent(msg)}&${keep}`);

  // กันยิงถล่ม — 5 ครั้ง/นาที/IP ต่อ unit (in-memory ต่อ instance ตามสัญญา core)
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = checkRateLimit(`hotel-book:${tenantSlug}:${unitSlug}:${ip}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) backErr("จองถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");

  const resolved = await resolveHotelUnit(tenantSlug, unitSlug);
  if (!resolved) backErr("ไม่พบร้านนี้ หรือร้านปิดรับจองออนไลน์");
  const ctx = { tenantId: resolved!.tenant.id, unitId: resolved!.unit.id };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    backErr("กรุณาเลือกวันเข้าพักและวันออกให้ถูกต้อง");
  if (!roomTypeId) backErr("กรุณาเลือกประเภทห้อง");
  if (guestName.length < 1) backErr("กรุณากรอกชื่อผู้เข้าพัก");
  const phoneDigits = guestPhoneRaw.replace(/\D/g, "");
  if (phoneDigits.length < 9 || phoneDigits.length > 15)
    backErr("กรุณากรอกเบอร์โทรให้ถูกต้อง");

  const res = await createReservation({
    ...ctx,
    roomTypeId,
    checkInDate: from,
    checkOutDate: to,
    guestName,
    guestPhone: guestPhoneRaw,
  });
  if (!res.ok) backErr(res.reason);

  // สำเร็จ → หน้าสถานะ/จ่ายมัดจำ (publicToken)
  redirect(`${base}/r/${res.ok ? res.publicToken ?? "" : ""}`);
}

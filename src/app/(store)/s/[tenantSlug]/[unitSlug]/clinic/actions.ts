"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { resolveClinicUnit, requestAppointment } from "@/lib/modules/clinic/service";

// datetime-local (เวลาผนัง BKK) เช่น "2026-07-20T14:30" → Date (instant UTC ถูกต้อง โดยตีความเป็น +07:00)
const RE_DTLOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// ผู้ป่วยขอนัดคลินิกออนไลน์ (public · ไม่ต้องล็อกอิน · ไม่เก็บเงิน) — กรอกจากมือถือ
// resolve unit จาก slug → กันถล่มต่อ IP → requestAppointment (PENDING) → publicToken → หน้าสถานะนัด
// error ทุกกรณี = เด้งกลับหน้าขอนัดพร้อม ?err (inline)
export async function createPublicAppointmentAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const unitSlug = String(formData.get("unitSlug") ?? "").trim();
  const patientName = String(formData.get("patientName") ?? "").trim();
  const patientPhoneRaw = String(formData.get("patientPhone") ?? "").trim();
  const preferredRaw = String(formData.get("preferredAt") ?? "").trim();
  const symptom = String(formData.get("symptom") ?? "").trim();

  const base = `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/clinic`;
  const backErr = (msg: string): never => redirect(`${base}?err=${encodeURIComponent(msg)}`);

  // กันยิงถล่ม — 5 ครั้ง/นาที/IP ต่อ unit (in-memory ต่อ instance ตามสัญญา core)
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = checkRateLimit(`clinic-appt:${tenantSlug}:${unitSlug}:${ip}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) backErr("ขอนัดถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");

  const resolved = await resolveClinicUnit(tenantSlug, unitSlug);
  if (!resolved) backErr("ไม่พบคลินิกนี้ หรือปิดรับนัดออนไลน์");
  const ctx = { tenantId: resolved!.tenant.id, unitId: resolved!.unit.id };

  if (patientName.length < 1) backErr("กรุณากรอกชื่อผู้ป่วย");
  const phoneDigits = patientPhoneRaw.replace(/\D/g, "");
  if (phoneDigits.length < 9 || phoneDigits.length > 15) backErr("กรุณากรอกเบอร์โทรให้ถูกต้อง");
  if (!RE_DTLOCAL.test(preferredRaw)) backErr("กรุณาเลือกวันเวลาที่สะดวก");
  const preferredAt = new Date(`${preferredRaw}:00+07:00`);
  if (Number.isNaN(preferredAt.getTime())) backErr("กรุณาเลือกวันเวลาที่สะดวก");
  if (preferredAt.getTime() < Date.now() - 60_000) backErr("เลือกวันเวลาในอดีตไม่ได้");

  let publicToken: string | null = null;
  try {
    const res = await requestAppointment(ctx, {
      patientName,
      patientPhone: patientPhoneRaw,
      preferredAt,
      symptom: symptom || null,
    });
    publicToken = res.publicToken;
  } catch (e) {
    backErr(e instanceof Error ? e.message : "ขอนัดไม่สำเร็จ กรุณาลองใหม่");
  }

  // สำเร็จ → หน้าสถานะนัด (publicToken)
  redirect(`${base}/a/${publicToken ?? ""}`);
}

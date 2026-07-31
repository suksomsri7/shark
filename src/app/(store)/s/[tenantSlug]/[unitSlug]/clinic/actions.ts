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
  // ส่ง "รหัส" ไม่ใช่ข้อความไทย — หน้าขอนัดรองรับ 2 ภาษา (แปลผ่าน dict clinic.err.*)
  const backErr = (code: "rate" | "shop" | "name" | "phone" | "when" | "past" | "failed"): never =>
    redirect(`${base}?err=${code}`);

  // กันยิงถล่ม — 5 ครั้ง/นาที/IP ต่อ unit (in-memory ต่อ instance ตามสัญญา core)
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = checkRateLimit(`clinic-appt:${tenantSlug}:${unitSlug}:${ip}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) backErr("rate");

  const resolved = await resolveClinicUnit(tenantSlug, unitSlug);
  if (!resolved) backErr("shop");
  const ctx = { tenantId: resolved!.tenant.id, unitId: resolved!.unit.id };

  if (patientName.length < 1) backErr("name");
  const phoneDigits = patientPhoneRaw.replace(/\D/g, "");
  if (phoneDigits.length < 9 || phoneDigits.length > 15) backErr("phone");
  if (!RE_DTLOCAL.test(preferredRaw)) backErr("when");
  const preferredAt = new Date(`${preferredRaw}:00+07:00`);
  if (Number.isNaN(preferredAt.getTime())) backErr("when");
  if (preferredAt.getTime() < Date.now() - 60_000) backErr("past");

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
    backErr("failed"); // เหตุผลจริงอยู่ใน service/exception — ผู้ใช้เห็นข้อความเดียวที่แปลได้
  }

  // สำเร็จ → หน้าสถานะนัด (publicToken)
  redirect(`${base}/a/${publicToken ?? ""}`);
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { resolveSchoolUnit, enroll } from "@/lib/modules/school/service";

// ผู้ปกครองสมัครเรียนออนไลน์ (public · ไม่ต้องล็อกอิน) — กรอกจากมือถือ
// resolve unit จาก slug → กันถล่มต่อ IP → enroll (FOR UPDATE lock กันสมัครเกิน capacity ในตัว)
//   → publicToken → เด้งไปหน้าจ่ายค่าเรียน/สถานะ
// error ทุกกรณี = เด้งกลับหน้าสมัครพร้อม ?err (inline)
export async function createPublicEnrollmentAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const unitSlug = String(formData.get("unitSlug") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  const studentName = String(formData.get("studentName") ?? "").trim();
  const parentPhoneRaw = String(formData.get("parentPhone") ?? "").trim();

  const base = `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/school`;
  const backErr = (msg: string): never =>
    redirect(`${base}?err=${encodeURIComponent(msg)}&class=${encodeURIComponent(classId)}`);

  // กันยิงถล่ม — 5 ครั้ง/นาที/IP ต่อ unit (in-memory ต่อ instance ตามสัญญา core)
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = checkRateLimit(`school-enroll:${tenantSlug}:${unitSlug}:${ip}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) backErr("สมัครถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");

  const resolved = await resolveSchoolUnit(tenantSlug, unitSlug);
  if (!resolved) backErr("ไม่พบสถาบันนี้ หรือปิดรับสมัครออนไลน์");
  const ctx = { tenantId: resolved!.tenant.id, unitId: resolved!.unit.id };

  if (!classId) backErr("กรุณาเลือกรอบเรียน");
  if (studentName.length < 1) backErr("กรุณากรอกชื่อผู้เรียน");
  const phoneDigits = parentPhoneRaw.replace(/\D/g, "");
  if (phoneDigits.length < 9 || phoneDigits.length > 15) backErr("กรุณากรอกเบอร์โทรให้ถูกต้อง");

  let publicToken: string | null = null;
  try {
    const res = await enroll(ctx, {
      classId,
      studentName,
      studentPhone: parentPhoneRaw,
    });
    publicToken = res.publicToken;
  } catch (e) {
    backErr(e instanceof Error ? e.message : "สมัครไม่สำเร็จ กรุณาลองใหม่");
  }

  // สำเร็จ → หน้าจ่ายค่าเรียน/สถานะ (publicToken)
  redirect(`${base}/e/${publicToken ?? ""}`);
}

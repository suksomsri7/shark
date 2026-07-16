"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { getPublicForm, submitPublicForm } from "@/lib/modules/forms/service";

// ส่งข้อมูลฟอร์มสาธารณะ — กันถล่ม 10 ครั้ง/นาที/ip (in-memory ต่อ instance ตามสัญญา core)
export async function submitFormAction(formData: FormData) {
  const token = String(formData.get("__token") ?? "");
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const rl = checkRateLimit(`form-submit:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) redirect(`/f/${encodeURIComponent(token)}?err=${encodeURIComponent("ส่งถี่เกินไป กรุณารอสักครู่")}`);

  const pub = await getPublicForm(token);
  if (!pub) redirect(`/f/${encodeURIComponent(token)}?err=${encodeURIComponent("ฟอร์มนี้ปิดรับข้อมูลแล้ว")}`);

  const answers: Record<string, unknown> = {};
  for (const fld of pub.form.fields) answers[fld.key] = String(formData.get(fld.key) ?? "");

  let ok = false;
  try {
    await submitPublicForm(token, answers, { ip });
    ok = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
    redirect(`/f/${encodeURIComponent(token)}?err=${encodeURIComponent(msg)}`);
  }
  if (ok) redirect(`/f/${encodeURIComponent(token)}?ok=1`);
}

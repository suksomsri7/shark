"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { resolveMemberUnit, findOrCreate } from "@/lib/modules/member/service";

// ลูกค้าสมัครสมาชิกเอง (public · ไม่ต้องล็อกอิน) — กรอกจากมือถือ
// resolve unit จาก slug → หาระบบสมาชิกที่ผูก → กันถล่มต่อ IP → findOrCreate (dedup เบอร์→อีเมล, source SELF)
//   → เด้งกลับหน้าเดิมพร้อม ?code=<memberCode> (หน้า "สมัครสำเร็จ")
// error ทุกกรณี = เด้งกลับพร้อม ?err (inline) — คงชื่อ/เบอร์/อีเมลที่กรอกไว้
export async function registerMemberAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const unitSlug = String(formData.get("unitSlug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const consent = formData.get("marketingConsent") != null;

  const base = `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/member`;
  const keep = `name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phoneRaw)}&email=${encodeURIComponent(email)}`;
  const backErr = (msg: string): never =>
    redirect(`${base}?err=${encodeURIComponent(msg)}&${keep}`);

  // กันยิงถล่ม — 5 ครั้ง/นาที/IP ต่อ unit (in-memory ต่อ instance ตามสัญญา core)
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = checkRateLimit(`member-signup:${tenantSlug}:${unitSlug}:${ip}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) backErr("สมัครถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");

  const resolved = await resolveMemberUnit(tenantSlug, unitSlug);
  if (!resolved) backErr("ไม่พบร้านนี้ หรือร้านยังไม่เปิดรับสมัครสมาชิก");

  // validate: ต้องมีชื่อหรือเบอร์อย่างน้อย 1 อย่าง
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  if (!name && !phoneRaw) backErr("กรุณากรอกชื่อหรือเบอร์โทรอย่างน้อย 1 อย่าง");
  if (phoneRaw && (phoneDigits.length < 9 || phoneDigits.length > 15))
    backErr("กรุณากรอกเบอร์โทรให้ถูกต้อง");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    backErr("กรุณากรอกอีเมลให้ถูกต้อง หรือเว้นว่างไว้");

  let memberCode: string | null = null;
  try {
    const customer = await findOrCreate({
      tenantId: resolved!.tenant.id,
      memberSystemId: resolved!.memberSystemId,
      name: name || undefined,
      phone: phoneRaw || undefined,
      email: email || undefined,
      source: "SELF",
      consents: consent ? ["marketing"] : [],
    });
    memberCode = customer.memberCode;
  } catch {
    backErr("สมัครไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  // สำเร็จ → หน้า "สมัครสำเร็จ" แสดง memberCode
  redirect(`${base}?code=${encodeURIComponent(memberCode ?? "")}`);
}

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
  // ส่ง "รหัส" ไม่ใช่ข้อความไทย — หน้าสมัครรองรับ 2 ภาษา (แปลผ่าน dict member.err.*)
  const backErr = (code: "rate" | "shop" | "identity" | "phone" | "email" | "failed"): never =>
    redirect(`${base}?err=${code}&${keep}`);

  // กันยิงถล่ม — 5 ครั้ง/นาที/IP ต่อ unit (in-memory ต่อ instance ตามสัญญา core)
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = checkRateLimit(`member-signup:${tenantSlug}:${unitSlug}:${ip}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) backErr("rate");

  const resolved = await resolveMemberUnit(tenantSlug, unitSlug);
  if (!resolved) backErr("shop");

  // validate: ต้องมีชื่อหรือเบอร์อย่างน้อย 1 อย่าง
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  if (!name && !phoneRaw) backErr("identity");
  if (phoneRaw && (phoneDigits.length < 9 || phoneDigits.length > 15))
    backErr("phone");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    backErr("email");

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
    backErr("failed");
  }

  // สำเร็จ → หน้า "สมัครสำเร็จ" แสดง memberCode
  redirect(`${base}?code=${encodeURIComponent(memberCode ?? "")}`);
}

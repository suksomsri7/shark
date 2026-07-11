"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requestLogin, verifyOtp, consumeMagicLink } from "@/lib/core/auth";
import { createSession, destroySession } from "@/lib/core/session";
import { prisma } from "@/lib/core/db";

const emailSchema = z.string().email();

export type AuthFormState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

async function clientMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    userAgent: h.get("user-agent") || undefined,
  };
}

// ขั้น 1: ขอ OTP + magic link
export async function requestLoginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { status: "error", message: "กรุณากรอกอีเมลให้ถูกต้อง" };
  const { ip } = await clientMeta();
  await requestLogin(parsed.data, ip);
  return { status: "sent", email: parsed.data };
}

// ขั้น 2: ยืนยัน OTP → สร้าง session → ไป onboarding/app
export async function verifyOtpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { status: "error", message: "รหัส OTP ต้องเป็นตัวเลข 6 หลัก" };

  const res = await verifyOtp(email, code);
  if (!res.ok) {
    const map: Record<string, string> = {
      invalid: "รหัสไม่ถูกต้อง",
      expired: "รหัสหมดอายุ กรุณาขอใหม่",
      locked: "ใส่รหัสผิดเกินกำหนด กรุณาขอรหัสใหม่",
      not_found: "ไม่พบคำขอ กรุณาขอรหัสใหม่",
    };
    return { status: "error", message: map[res.reason] };
  }
  const meta = await clientMeta();
  await createSession(res.user.id, meta);
  redirect(await landingPath(res.user.id));
}

// interstitial POST ของ magic link (กัน email scanner consume ผ่าน GET)
export async function confirmMagicLinkAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const user = await consumeMagicLink(token);
  if (!user) redirect("/login?e=link");
  const meta = await clientMeta();
  await createSession(user.id, meta);
  redirect(await landingPath(user.id));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

async function landingPath(userId: string): Promise<string> {
  const count = await prisma.membership.count({
    where: { userId, acceptedAt: { not: null } },
  });
  return count > 0 ? "/app" : "/onboarding";
}

"use server";

// Backoffice server actions (Phase 0) — cookie bo_session (httpOnly + secure + sameSite lax, 7 วัน)
// แยก namespace จาก session ร้าน (__Host-shark_session) โดยสิ้นเชิง

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PlatformUser, PlatformRole } from "@prisma/client";
import {
  requestPlatformOtp,
  verifyPlatformOtp,
  getPlatformUserByToken,
  requirePlatformRole,
  revokePlatformSession,
} from "./auth";
import { secureCookies } from "@/lib/env";

const COOKIE = "bo_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 วัน
const emailSchema = z.string().email();

export type BackofficeFormState =
  | { status: "idle" }
  | { status: "sent"; email: string; preview?: { otp: string } }
  | { status: "error"; message: string };

// ขั้น 1: ขอ OTP (generic เสมอเพื่อกัน enumeration — ไม่บอกว่าอีเมลมีจริงไหม)
export async function loginRequestAction(
  _prev: BackofficeFormState,
  formData: FormData,
): Promise<BackofficeFormState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { status: "error", message: "กรุณากรอกอีเมลให้ถูกต้อง" };
  const res = await requestPlatformOtp(parsed.data);
  return { status: "sent", email: parsed.data, preview: res.preview };
}

// ขั้น 2: ยืนยัน OTP → set cookie bo_session → เข้า dashboard
export async function loginVerifyAction(
  _prev: BackofficeFormState,
  formData: FormData,
): Promise<BackofficeFormState> {
  const email = String(formData.get("email") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { status: "error", message: "รหัส OTP ต้องเป็นตัวเลข 6 หลัก" };

  const token = await verifyPlatformOtp(email, code);
  if (!token) return { status: "error", message: "รหัสไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่" };

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + SESSION_TTL_MS),
  });
  redirect("/backoffice");
}

// ออกจากระบบ — revoke session ใน DB + ลบ cookie
export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await revokePlatformSession(token);
  jar.delete(COOKIE);
  redirect("/backoffice/login");
}

// guard สำหรับ page — อ่าน cookie → resolve user → ไม่ผ่าน redirect ไป login
// roles (option): จำกัดเฉพาะบาง role · Phase 0 หน้าอ่านทั่วไปไม่ส่ง roles = ทุก platform user
export async function requireBackoffice(roles?: PlatformRole[]): Promise<PlatformUser> {
  const token = (await cookies()).get(COOKIE)?.value;
  const user = token ? await getPlatformUserByToken(token) : null;
  if (!user) redirect("/backoffice/login");
  if (roles && roles.length > 0) {
    try {
      requirePlatformRole(user, roles);
    } catch {
      redirect("/backoffice/login");
    }
  }
  return user;
}

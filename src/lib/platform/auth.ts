// Backoffice auth (Phase 0 — docs/BACKOFFICE.md) — แยกจากฝั่งร้านโดยสิ้นเชิง
// PlatformUser คนละตาราง · session คนละ cookie (bo_session) · ห้ามปน RBAC ร้าน
// OTP hash แบบเดียวกับ auth ร้าน (sha256(`${email}:${code}`)) แต่คนละตาราง (PlatformAuthToken)

import type { PlatformUser, PlatformRole } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { sha256, randomToken, otpCode, safeEqualHex } from "@/lib/core/hash";

// ส่งอีเมลแบบ best-effort — lazy import (core/email ผูก env.ts) และไม่ให้พลาดการส่ง
// ไปล้มการสร้าง token (token คือ critical path · เมลเป็น resilient เหมือน core/email เดิม)
async function sendOtpEmail(to: string, subject: string, text: string): Promise<void> {
  try {
    const { sendEmail } = await import("@/lib/core/email");
    await sendEmail(to, subject, text);
  } catch (e) {
    console.warn("[backoffice] ส่ง OTP อีเมลไม่สำเร็จ:", e);
  }
}

const OTP_TTL_MS = 1000 * 60 * 10; // 10 นาที (SECURITY §3)
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 วัน (SECURITY §5)

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// โชว์ OTP บนจอเฉพาะโหมดเทส (env AUTH_PREVIEW_OTP=1) — pattern เดียวกับ auth ร้าน
// ก่อนต่ออีเมลจริง/ในข้อสอบ เพื่อให้ทดสอบ flow ได้ · production ปิด
function previewEnabled(): boolean {
  return process.env.AUTH_PREVIEW_OTP === "1";
}

// ── ขอ OTP ────────────────────────────────────────────────────
// มี PlatformUser → สร้าง token (hash) + ส่งเมล
// ไม่มี PlatformUser → คืน {} เฉย ๆ (generic — กัน enumeration) ไม่สร้าง token ไม่ส่งเมล (SECURITY §4)
export async function requestPlatformOtp(rawEmail: string): Promise<{ preview?: { otp: string } }> {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.platformUser.findUnique({ where: { email } });
  if (!user) return {};

  const code = otpCode();
  await prisma.platformAuthToken.create({
    data: {
      email,
      tokenHash: sha256(`${email}:${code}`),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  await sendOtpEmail(
    email,
    "เข้าสู่ระบบหลังบ้าน SHARK",
    `รหัสเข้าสู่ระบบหลังบ้าน (OTP): ${code}\n\nรหัสนี้หมดอายุใน 10 นาที หากคุณไม่ได้ร้องขอ กรุณาเพิกเฉย`,
  );
  return previewEnabled() ? { preview: { otp: code } } : {};
}

// ── ยืนยัน OTP ────────────────────────────────────────────────
// ถูก + ยังไม่หมดอายุ + ยังไม่ใช้ → ตั้ง usedAt + สร้าง PlatformSession (7 วัน) + คืน token ดิบ
// ผิด/หมดอายุ/ใช้ซ้ำ/ไม่รู้จัก → null
export async function verifyPlatformOtp(rawEmail: string, code: string): Promise<string | null> {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.platformUser.findUnique({ where: { email } });
  if (!user) return null;

  const tok = await prisma.platformAuthToken.findFirst({
    where: { email, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!tok) return null; // ไม่มีคำขอ หรือ ใช้ไปแล้ว (usedAt)
  if (tok.expiresAt < new Date()) return null; // หมดอายุ
  if (!safeEqualHex(tok.tokenHash, sha256(`${email}:${code}`))) return null; // ผิด

  await prisma.platformAuthToken.update({ where: { id: tok.id }, data: { usedAt: new Date() } });
  const token = randomToken();
  await prisma.platformSession.create({
    data: {
      platformUserId: user.id,
      tokenHash: sha256(token), // เก็บ hash เท่านั้น — token ดิบอยู่ใน cookie bo_session
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

// ── resolve session → PlatformUser ────────────────────────────
// token มั่ว/หมดอายุ → null
export async function getPlatformUserByToken(token: string): Promise<PlatformUser | null> {
  const s = await prisma.platformSession.findUnique({ where: { tokenHash: sha256(token) } });
  if (!s || s.expiresAt < new Date()) return null;
  return prisma.platformUser.findUnique({ where: { id: s.platformUserId } });
}

// ── revoke session (logout) ───────────────────────────────────
export async function revokePlatformSession(token: string): Promise<void> {
  await prisma.platformSession.deleteMany({ where: { tokenHash: sha256(token) } });
}

// ── role guard ────────────────────────────────────────────────
// ไม่มี user หรือ role ไม่อยู่ในรายการ → throw
export function requirePlatformRole(user: PlatformUser | null, roles: PlatformRole[]): PlatformUser {
  if (!user || !roles.includes(user.role)) {
    throw new Error("ไม่มีสิทธิ์เข้าถึงหลังบ้านแพลตฟอร์ม");
  }
  return user;
}

import type { User } from "@prisma/client";
import { prisma } from "./db";
import { sha256, randomToken, otpCode, safeEqualHex } from "./hash";
import { sendEmail } from "./email";
import { env } from "@/lib/env";

const TTL_MS = 1000 * 60 * 10; // 10 นาที
const MAX_ATTEMPTS = 5;

// ── request: ส่ง OTP + magic link ทางอีเมล ────────────────────
export async function requestLogin(rawEmail: string, ip?: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const code = otpCode();
  const linkToken = randomToken();
  const expiresAt = new Date(Date.now() + TTL_MS);

  await prisma.authToken.createMany({
    data: [
      { email, purpose: "OTP", tokenHash: sha256(`${email}:${code}`), expiresAt, ip },
      { email, purpose: "MAGIC_LINK", tokenHash: sha256(linkToken), expiresAt, ip },
    ],
  });

  const link = `${env.APP_URL}/auth/verify?token=${linkToken}`;
  await sendEmail(
    email,
    "เข้าสู่ระบบ SHARK",
    `รหัสเข้าสู่ระบบ (OTP): ${code}\n\nหรือคลิกลิงก์นี้เพื่อเข้าสู่ระบบ:\n${link}\n\nรหัส/ลิงก์นี้หมดอายุใน 10 นาที หากคุณไม่ได้ร้องขอ กรุณาเพิกเฉย`,
  );
}

type VerifyResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid" | "expired" | "locked" | "not_found" };

// ── verify OTP ────────────────────────────────────────────────
export async function verifyOtp(rawEmail: string, code: string): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  const tok = await prisma.authToken.findFirst({
    where: { email, purpose: "OTP", consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!tok) return { ok: false, reason: "not_found" };
  if (tok.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (tok.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" };
  if (!safeEqualHex(tok.tokenHash, sha256(`${email}:${code}`))) {
    await prisma.authToken.update({
      where: { id: tok.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "invalid" };
  }
  await prisma.authToken.update({ where: { id: tok.id }, data: { consumedAt: new Date() } });
  return { ok: true, user: await upsertUser(email) };
}

// ── consume magic link (เรียกจาก interstitial POST เท่านั้น) ───
export async function consumeMagicLink(token: string): Promise<User | null> {
  const tok = await prisma.authToken.findFirst({
    where: { purpose: "MAGIC_LINK", tokenHash: sha256(token), consumedAt: null },
  });
  if (!tok || tok.expiresAt < new Date()) return null;
  await prisma.authToken.update({ where: { id: tok.id }, data: { consumedAt: new Date() } });
  return upsertUser(tok.email);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// passwordless: สมัคร = เข้าสู่ระบบ (upsert)
async function upsertUser(email: string): Promise<User> {
  return prisma.user.upsert({ where: { email }, update: {}, create: { email } });
}

import type { User } from "@prisma/client";
import { prisma } from "./db";
import { sha256, randomToken, otpCode, safeEqualHex } from "./hash";
import { sendEmail } from "./email";
import { env, previewOtp } from "@/lib/env";

const TTL_MS = 1000 * 60 * 10; // 10 นาที
const MAX_ATTEMPTS = 5;

// กันถล่ม OTP (WO-0043) — นับ AuthToken purpose OTP ในหน้าต่าง 10 นาที (ทนข้าม instance)
const RL_WINDOW_MS = 1000 * 60 * 10;
const RL_MAX_PER_EMAIL = 5; // อีเมลเดิม ≥5 ใน 10 นาที → บล็อก
const RL_MAX_PER_IP = 20; // ip เดิม ≥20 ใน 10 นาที → บล็อก
const RL_MESSAGE = "ขอรหัสถี่เกินไป กรุณารอสักครู่แล้วลองใหม่";

export type PreviewCreds = { otp: string; link: string };

// ── request: ส่ง OTP + magic link ทางอีเมล ────────────────────
// preview (ยังไม่มี Resend): คืน otp/link เพื่อโชว์บนจอ (ห้ามใน production)
export async function requestLogin(
  rawEmail: string,
  ip?: string,
): Promise<PreviewCreds | null> {
  const email = normalizeEmail(rawEmail);

  // นับ "ก่อน" สร้างแถวใหม่ — กันถล่มขอรหัสถี่ ๆ ต่ออีเมล/ต่อ ip
  const since = new Date(Date.now() - RL_WINDOW_MS);
  const emailCount = await prisma.authToken.count({
    where: { email, purpose: "OTP", createdAt: { gte: since } },
  });
  if (emailCount >= RL_MAX_PER_EMAIL) throw new Error(RL_MESSAGE);
  if (ip) {
    const ipCount = await prisma.authToken.count({
      where: { ip, purpose: "OTP", createdAt: { gte: since } },
    });
    if (ipCount >= RL_MAX_PER_IP) throw new Error(RL_MESSAGE);
  }

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
  // อีเมลใส่ OTP อย่างเดียว (คำสั่งเจ้าของ 23 ก.ค. — ลิงก์ทำให้สับสนโดยเฉพาะบนมือถือ) · magic link ยังอยู่ใน preview/dev
  await sendEmail(
    email,
    "เข้าสู่ระบบ SHARK",
    `รหัสเข้าสู่ระบบ (OTP): ${code}\n\nรหัสนี้หมดอายุใน 10 นาที หากคุณไม่ได้ร้องขอ กรุณาเพิกเฉย`,
  );
  return previewOtp ? { otp: code, link } : null;
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

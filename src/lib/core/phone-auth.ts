// phone-auth.ts — เข้าใช้ด้วยเบอร์โทร (SMS OTP) · เบอร์ = ตัวตน (S1.19 · RESOLUTIONS R-K9/K10 · แบบ S1/S2 + R8)
//
// กติกาเดียวกับ OTP อีเมลใน core/auth.ts (requestLogin/verifyOtp) แต่เก็บในตาราง PhoneOtp/UserPhone (global axis)
//   · รหัส 6 หลัก · เก็บแค่ sha256(`${phone}:${code}`) · หมดอายุ 10 นาที · ผิด 5 ครั้ง = ล็อก
//   · กันถล่ม: นับแถว PhoneOtp ใน 10 นาที — ต่อเบอร์ ≥5 / ต่อ ip ≥20 ⇒ ปฏิเสธ (ทนข้าม instance เพราะนับจากฐาน)
//   · verify ที่ตรง **ไม่ consume** — ผู้เรียกที่ออก session เป็นคน consume (consumePhoneOtp) เพื่อให้
//     "ยังไม่มีบัญชี → ขอชื่อ/อีเมล → ยิงซ้ำด้วยรหัสเดิม" ทำได้ในรหัสเดียว
//   · ห้ามคืนรหัสออกจากไฟล์นี้ทุกทาง (ผลลัพธ์/ข้อความ error/log)
//
// 🔴 ไม่ import โมดูล env กลางของแอป (แบบเดียวกับ sms.ts: อ่านได้ในสคริปต์ที่ env ไม่ครบ) — ไม่แตะตารางโทเคนอีเมล / core/auth.ts
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { sha256, otpCode, safeEqualHex } from "./hash";
import { sendSms, toE164Thai } from "./sms";

export const PHONE_OTP_TTL_MS = 600_000;
export const PHONE_OTP_MAX_ATTEMPTS = 5;
export const PHONE_RL_PER_PHONE = 5;
export const PHONE_RL_PER_IP = 20;
export const PHONE_RL_WINDOW_MS = 600_000;
export const PHONE_RESEND_SEC = 60;

const NAME_MAX = 60;
const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MSG = {
  badPhone: "เบอร์โทรไม่ถูกต้อง กรุณาตรวจแล้วลองใหม่",
  // ข้อความเดียวกันทั้งต่อเบอร์และต่อ ip — ไม่บอกว่าติดเพราะอะไร
  rateLimited: "ขอรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  smsFailed: "ส่งรหัสทาง SMS ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  badName: `กรุณากรอกชื่อ (1–${NAME_MAX} ตัวอักษร)`,
  badEmail: "กรุณากรอกอีเมลให้ถูกต้อง",
  emailTaken: "อีเมลนี้มีบัญชีอยู่แล้ว — เข้าด้วยอีเมลแล้วผูกเบอร์ในหน้าบัญชี",
  phoneTaken: "เบอร์นี้ผูกกับบัญชีอื่นอยู่แล้ว",
} as const;

export type SendFn = (msg: { to: string; text: string }) => Promise<{ ok: boolean; error?: string }>;

export type RequestPhoneOtpResult =
  | { ok: true; phone: string; resendAfterSec: number }
  | { ok: false; reason: "bad_phone" | "rate_limited" | "sms_failed"; message: string };

export type VerifyPhoneOtpResult =
  | { ok: true; phone: string; otpId: string; userId: string | null }
  | { ok: false; reason: "bad_phone" | "not_found" | "expired" | "locked" | "invalid" };

export type SignupWithPhoneResult =
  | { ok: true; user: User }
  | { ok: false; reason: "bad_input" | "email_taken" | "phone_taken"; message: string };

export type LinkPhoneResult =
  | { ok: true }
  | { ok: false; reason: "phone_taken" | "bad_phone"; message: string };

function hashCode(phone: string, code: string): string {
  return sha256(`${phone}:${code}`);
}

/** Prisma unique violation → ชื่อคอลัมน์ที่ชน (ไว้แยก email/phone ตอนแข่งกันสมัคร) */
function uniqueTarget(e: unknown): string | null {
  const err = e as { code?: string; meta?: { target?: unknown } };
  if (err?.code !== "P2002") return null;
  const t = err.meta?.target;
  return Array.isArray(t) ? t.join(",") : String(t ?? "");
}

// ── ขอรหัส ────────────────────────────────────────────────────
export async function requestPhoneOtp(
  rawPhone: string,
  opts: { ip?: string; send?: SendFn; now?: Date } = {},
): Promise<RequestPhoneOtpResult> {
  const phone = toE164Thai(rawPhone);
  if (!phone) return { ok: false, reason: "bad_phone", message: MSG.badPhone };
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - PHONE_RL_WINDOW_MS);

  // นับ "ก่อน" สร้างแถวใหม่ (กติกาเดียวกับ requestLogin)
  const perPhone = await prisma.phoneOtp.count({ where: { phone, createdAt: { gte: since } } });
  if (perPhone >= PHONE_RL_PER_PHONE) return { ok: false, reason: "rate_limited", message: MSG.rateLimited };
  if (opts.ip) {
    const perIp = await prisma.phoneOtp.count({ where: { ip: opts.ip, createdAt: { gte: since } } });
    if (perIp >= PHONE_RL_PER_IP) return { ok: false, reason: "rate_limited", message: MSG.rateLimited };
  }

  const code = otpCode();
  const row = await prisma.phoneOtp.create({
    data: {
      phone,
      codeHash: hashCode(phone, code),
      expiresAt: new Date(now.getTime() + PHONE_OTP_TTL_MS),
      ip: opts.ip ?? null,
      createdAt: now,
    },
    select: { id: true },
  });

  const send: SendFn = opts.send ?? sendSms;
  let sent: { ok: boolean; error?: string };
  try {
    sent = await send({ to: phone, text: `รหัสเข้าใช้ SHARK: ${code} (หมดอายุใน 10 นาที)` });
  } catch (e) {
    sent = { ok: false, error: String(e).slice(0, 160) };
  }
  if (!sent.ok) {
    // ส่งไม่ถึง = ไม่มีรหัสที่ใช้ได้ ⇒ ลบแถวทิ้ง (ไม่กินโควตาของเบอร์นั้น และไม่ค้างแถวที่ไม่มีใครรู้รหัส)
    await prisma.phoneOtp.deleteMany({ where: { id: row.id } });
    return { ok: false, reason: "sms_failed", message: MSG.smsFailed };
  }
  return { ok: true, phone, resendAfterSec: PHONE_RESEND_SEC };
}

// ── ตรวจรหัส (ไม่ consume · ไม่สร้างบัญชี) ─────────────────────
export async function verifyPhoneOtp(
  rawPhone: string,
  code: string,
  opts: { now?: Date } = {},
): Promise<VerifyPhoneOtpResult> {
  const phone = toE164Thai(rawPhone);
  if (!phone) return { ok: false, reason: "bad_phone" };
  const now = opts.now ?? new Date();
  const row = await prisma.phoneOtp.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.expiresAt < now) return { ok: false, reason: "expired" };
  if (row.attempts >= PHONE_OTP_MAX_ATTEMPTS) return { ok: false, reason: "locked" };
  if (!safeEqualHex(row.codeHash, hashCode(phone, String(code ?? "")))) {
    // เพิ่ม attempts คำสั่งเดียวแบบมีเงื่อนไข — ยิงพร้อมกันหลายทางก็ไม่ทะลุเพดาน
    const bumped = await prisma.phoneOtp.updateMany({
      where: { id: row.id, attempts: { lt: PHONE_OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: bumped.count === 1 ? "invalid" : "locked" };
  }
  const owner = await prisma.userPhone.findUnique({ where: { phone }, select: { userId: true } });
  return { ok: true, phone, otpId: row.id, userId: owner?.userId ?? null };
}

/** ใช้รหัสครั้งเดียว — true เมื่อ "เรา" เป็นคน consume (ยิงซ้ำ/พร้อมกัน = false) */
export async function consumePhoneOtp(otpId: string): Promise<boolean> {
  const now = new Date();
  const r = await prisma.phoneOtp.updateMany({
    where: { id: otpId, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  return r.count === 1;
}

// ── สมัครใหม่ด้วยเบอร์ (เบอร์ผ่าน verify แล้ว — ผู้เรียกรับผิดชอบ) ───
export async function signupWithPhone(input: {
  phone: string;
  email: string;
  name: string;
}): Promise<SignupWithPhoneResult> {
  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const phone = toE164Thai(input.phone);
  if (!phone) return { ok: false, reason: "bad_input", message: MSG.badPhone };
  if (name.length < 1 || name.length > NAME_MAX) return { ok: false, reason: "bad_input", message: MSG.badName };
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return { ok: false, reason: "bad_input", message: MSG.badEmail };

  // R8: อีเมลมีบัญชีแล้ว ⇒ ไม่สร้างซ้ำ/ไม่ผูกให้เอง — ให้เข้าด้วยอีเมลแล้วผูกเบอร์ (พิสูจน์ว่าเป็นเจ้าของอีเมลก่อน)
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } }))
    return { ok: false, reason: "email_taken", message: MSG.emailTaken };
  if (await prisma.userPhone.findUnique({ where: { phone }, select: { id: true } }))
    return { ok: false, reason: "phone_taken", message: MSG.phoneTaken };

  try {
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email, name } });
      await tx.userPhone.create({ data: { userId: u.id, phone, verifiedAt: new Date() } });
      return u;
    });
    return { ok: true, user };
  } catch (e) {
    // แข่งกันสมัคร — unique ของฐานเป็นตัวตัดสินสุดท้าย
    const t = uniqueTarget(e);
    if (t === null) throw e;
    if (t.includes("email")) return { ok: false, reason: "email_taken", message: MSG.emailTaken };
    return { ok: false, reason: "phone_taken", message: MSG.phoneTaken };
  }
}

// ── ผูกเบอร์กับบัญชีเดิม (R8 · เบอร์ผ่าน verify แล้ว) ───────────────
// เบอร์เดิมของ user เอง = ok (อัปเดต verifiedAt) · user มีเบอร์อื่นอยู่ = เปลี่ยนเป็นเบอร์ใหม่ · เบอร์ของคนอื่น = phone_taken
export async function linkPhoneToUser(userId: string, rawPhone: string): Promise<LinkPhoneResult> {
  const phone = toE164Thai(rawPhone);
  if (!phone) return { ok: false, reason: "bad_phone", message: MSG.badPhone };
  const holder = await prisma.userPhone.findUnique({ where: { phone }, select: { userId: true } });
  if (holder && holder.userId !== userId) return { ok: false, reason: "phone_taken", message: MSG.phoneTaken };
  const verifiedAt = new Date();
  try {
    await prisma.userPhone.upsert({
      where: { userId },
      update: { phone, verifiedAt },
      create: { userId, phone, verifiedAt },
    });
  } catch (e) {
    if (uniqueTarget(e) === null) throw e;
    return { ok: false, reason: "phone_taken", message: MSG.phoneTaken };
  }
  return { ok: true };
}

/** เบอร์ (E.164) ที่ผูกกับ user — ไม่มี = null (แอปบังคับผูกเบอร์ · R8) */
export async function phoneOfUser(userId: string): Promise<string | null> {
  const row = await prisma.userPhone.findUnique({ where: { userId }, select: { phone: true } });
  return row?.phone ?? null;
}

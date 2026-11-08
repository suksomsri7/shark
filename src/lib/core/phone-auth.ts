// phone-auth.ts — เข้าใช้ด้วยเบอร์โทร (SMS OTP) · เบอร์ = ตัวตน (S1.19 · RESOLUTIONS R-K9/K10 + §H R-S1.19a–h · แบบ S1/S2 + R8)
//
// กติกาเดียวกับ OTP อีเมลใน core/auth.ts (requestLogin/verifyOtp) แต่เก็บในตาราง PhoneOtp/UserPhone (global axis)
//   · รหัส 6 หลัก · เก็บแค่ HMAC-SHA256(SESSION_SECRET, `${phone}:${code}`) (SEC S3a.1-S2 R-Z27 · เดิม sha256 — ตรวจแบบเดิมได้ชั่วคราว
//     ช่วงเปลี่ยนผ่าน = รหัสที่ขอก่อน deploy ยังใช้ได้จนหมดอายุ 10 นาที) · หมดอายุ 10 นาที · ผิด 5 ครั้ง = ล็อก
//   · SEC S3a.1-S2 R-Z18: ตรวจรหัสมีเพดาน `sms-verify:<ip>` 30/10 นาที + `sms-verify:<เบอร์ hash>` 10/10 นาที (`verifyRateLimit`)
//   · เบอร์ทุกจุดผ่าน `normalizeThaiMobile` (มือถือไทยเท่านั้น · R-S1.19d) — `toE164Thai` เดิมคงไว้ให้แคมเปญ
//   · ขอซ้ำใน 60 วิ = ok ไม่ส่งใหม่ · กันถล่ม (นับแถว PhoneOtp): ต่อเบอร์ 5/10 นาที + 20/วัน · ต่อ ip 20/10 นาที
//   · ส่งล้ม = เก็บแถวไว้แบบ consumed (นับใน rate-limit · ใช้ไม่ได้) — R-S1.19f
//   · verify: จอง attempt ก่อนเทียบ (ยิงขนานไม่ทะลุ 5) · รหัสถูก = คืน attempt · **ไม่ consume** (ผู้เรียกที่ออก
//     session/สร้างบัญชี/ผูกเบอร์เป็นคน consume — ใน $transaction เดียวกับการเขียน · R-S1.19b/h)
//   · สมัครด้วยเบอร์: อีเมลที่พิมพ์ = **ยังไม่ยืนยัน** ⇒ User.email = placeholder `<เบอร์ไม่มี +>@phone.shark.in.th`
//     + `User.prefs.pendingEmail` (กันยึดบัญชีผ่านทางเข้าที่หา user ด้วยอีเมล · R-S1.19a) · ยืนยันอีเมล = ใบ S1.19b
//   · ห้ามคืนรหัสออกจากไฟล์นี้ทุกทาง (ผลลัพธ์/ข้อความ error/log)
//
// 🔴 ไม่ import โมดูล env กลางของแอป (แบบเดียวกับ sms.ts: อ่านได้ในสคริปต์ที่ env ไม่ครบ) — ไม่แตะตารางโทเคนอีเมล / core/auth.ts
import type { Prisma, User } from "@prisma/client";
import { prisma } from "./db";
import { createHmac } from "node:crypto";
import { sha256, otpCode, safeEqualHex } from "./hash";
import { checkRateLimitDbMany } from "./rate-limit-db";
import { sendSms } from "./sms";

export const PHONE_OTP_TTL_MS = 600_000;
export const PHONE_OTP_MAX_ATTEMPTS = 5;
export const PHONE_RL_PER_PHONE = 5;
export const PHONE_RL_PER_IP = 20;
export const PHONE_RL_WINDOW_MS = 600_000;
export const PHONE_RESEND_SEC = 60;
export const PHONE_RL_PER_PHONE_DAY = 20;
const DAY_MS = 86_400_000;

/** โดเมนของอีเมล placeholder (ไม่มีกล่องจริง · sendEmail ข้าม) */
export const PHONE_PLACEHOLDER_DOMAIN = "phone.shark.in.th";

const NAME_MAX = 60;
const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MSG = {
  badPhone: "เบอร์มือถือไม่ถูกต้อง กรุณาตรวจแล้วลองใหม่",
  // ข้อความเดียวกันทั้งต่อเบอร์/ต่อวัน/ต่อ ip — ไม่บอกว่าติดเพราะอะไร
  rateLimited: "ขอรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  smsFailed: "ส่งรหัสทาง SMS ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  badName: `กรุณากรอกชื่อ (1–${NAME_MAX} ตัวอักษร)`,
  badEmail: "กรุณากรอกอีเมลให้ถูกต้อง",
  emailTaken: "อีเมลนี้มีบัญชีอยู่แล้ว — เข้าด้วยอีเมลแล้วผูกเบอร์ในหน้าบัญชี",
  phoneTaken: "เบอร์นี้ผูกกับบัญชีอื่นอยู่แล้ว",
  phoneChangeLocked: "บัญชีนี้ผูกเบอร์อื่นไว้แล้ว — เปลี่ยนเบอร์ต้องติดต่อทีมงาน",
  otpUsed: "รหัสนี้ถูกใช้ไปแล้ว กรุณาขอรหัสใหม่",
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
  | { ok: false; reason: "bad_input" | "email_taken" | "phone_taken" | "otp_used"; message: string };

export type LinkPhoneResult =
  | { ok: true }
  | { ok: false; reason: "phone_taken" | "bad_phone" | "phone_change_locked" | "otp_used"; message: string };

/**
 * มือถือไทย → `+66[689]xxxxxxxx` · อย่างอื่น null (R-S1.19d)
 * รับ 0xxxxxxxxx · 66xxxxxxxxx · +66xxxxxxxxx · พับ +660/660 → +66 · ตัดช่องว่าง/ขีด/วงเล็บ/จุด · ปฏิเสธรหัสประเทศอื่นและเบอร์บ้าน
 */
export function normalizeThaiMobile(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").replace(/[\s\-().]/g, "");
  const m = /^(?:(?:\+?66)0?|0)([689]\d{8})$/.exec(s);
  return m ? `+66${m[1]}` : null;
}

/**
 * เบอร์ทดสอบ (8 พ.ย. 2026 · เจ้าของสั่ง — ช่วงยังไม่มีเกตเวย์ SMS · บัญชีรีวิวของ Apple)
 * env `SMS_TEST_LOGINS="0812345678:123456,0898765432:654321"` — **เฉพาะเบอร์ในรายชื่อ** ใช้รหัสประจำได้โดยไม่ส่ง SMS
 * เบอร์อื่นทั้งหมดเป็นไปตามปกติ (ไม่มีเกตเวย์ = 503 sms_unavailable) · รหัสต้อง 6 หลัก · รายการผิดรูป = ข้าม · สูงสุด 5 เบอร์
 * ด่านเดิมครบ: กันถล่มต่อเบอร์/ip · ผิด 5 ครั้ง = ล็อก · หมดอายุ 10 นาที · consume ครั้งเดียว (รหัสเก็บเป็น HMAC เหมือนรหัสจริง)
 */
export function phoneTestCode(rawPhone: string | null | undefined): string | null {
  const phone = normalizeThaiMobile(rawPhone);
  if (!phone) return null;
  const entries = String(process.env.SMS_TEST_LOGINS ?? "").split(",").slice(0, 5);
  for (const e of entries) {
    const [p, c] = e.split(":").map((x) => x.trim());
    if (c && /^\d{6}$/.test(c) && normalizeThaiMobile(p) === phone) return c;
  }
  return null;
}

/** อีเมล placeholder ของบัญชีที่สมัครด้วยเบอร์ (E.164 ไม่มี +) */
export function phonePlaceholderEmail(phone: string): string {
  return `${phone.replace(/^\+/, "")}@${PHONE_PLACEHOLDER_DOMAIN}`;
}

export function isPhonePlaceholderEmail(email: string | null | undefined): boolean {
  return String(email ?? "").trim().toLowerCase().endsWith(`@${PHONE_PLACEHOLDER_DOMAIN}`);
}

/** อีเมลที่แอปเห็น: placeholder ⇒ null · pendingEmail = อีเมลที่พิมพ์ตอนสมัคร (ยังไม่ยืนยัน) */
export function publicEmailOf(user: Pick<User, "email" | "prefs">): { email: string | null; pendingEmail: string | null } {
  const prefs = user.prefs && typeof user.prefs === "object" && !Array.isArray(user.prefs) ? (user.prefs as Record<string, unknown>) : {};
  const pending = typeof prefs.pendingEmail === "string" ? prefs.pendingEmail : null;
  return { email: isPhonePlaceholderEmail(user.email) ? null : user.email, pendingEmail: pending };
}

/**
 * SEC S3a.1-S2 ▸ R-Z26/R-Z34: ชื่อที่แสดงของผู้ใช้ — ชื่อ → ส่วนหน้าอีเมล (ยกเว้นอีเมล placeholder ของบัญชีเบอร์โทร = เบอร์) → `fallback`
 */
export function publicNameOf(u: { name?: string | null; email?: string | null } | null | undefined, fallback = "สมาชิก"): string {
  const name = u?.name?.trim();
  if (name) return name;
  const email = String(u?.email ?? "");
  if (!email || isPhonePlaceholderEmail(email)) return fallback;
  return email.split("@")[0] || fallback;
}

/**
 * SEC S3a.1-S2 ▸ R-Z27 (L6): hash ของรหัส = HMAC-SHA256 ด้วยคีย์เซิร์ฟเวอร์ (SESSION_SECRET — อ่าน env ตรง ไม่ import env กลาง)
 *   ฐานรั่วอย่างเดียวไล่เดารหัส 6 หลักไม่ได้ (sha256 ล้วนเดาได้ 10⁶ ครั้ง) · ไม่มีคีย์ (สคริปต์ที่ env ไม่ครบ) = sha256 แบบเดิม ◂
 */
function otpKey(): string {
  return String(process.env.SESSION_SECRET ?? "");
}
function hashCode(phone: string, code: string): string {
  const key = otpKey();
  return key ? createHmac("sha256", key).update(`${phone}:${code}`).digest("hex") : sha256(`${phone}:${code}`);
}
/** ช่วงเปลี่ยนผ่าน (dual-verify): รหัสที่ขอก่อน deploy เก็บแบบ sha256 — ลบได้เมื่อ deploy ผ่านไปเกิน PHONE_OTP_TTL_MS */
function codeMatches(stored: string, phone: string, code: string): boolean {
  if (safeEqualHex(stored, hashCode(phone, code))) return true;
  return otpKey() !== "" && safeEqualHex(stored, sha256(`${phone}:${code}`));
}

// ── SEC S3a.1-S2 ▸ R-Z18 (L4 MAJOR-1): เพดานการตรวจรหัส (verify · ผูกเบอร์) — กันเดารหัสข้ามเบอร์/ข้ามรอบขอรหัส ◂
export const PHONE_VERIFY_PER_IP = 30;
export const PHONE_VERIFY_PER_PHONE = 10;
export const PHONE_VERIFY_WINDOW_MS = 600_000;

/** นับการตรวจรหัส 1 ครั้ง (ต่อ ip + ต่อเบอร์ · คำสั่งเดียว) — เกินเพดาน ⇒ วินาทีที่ต้องรอ · ผ่าน ⇒ null · เบอร์เก็บเป็น hash ในชื่อถัง */
export async function verifyRateLimit(ip: string | null | undefined, rawPhone: string, now = Date.now()): Promise<number | null> {
  const phone = normalizeThaiMobile(rawPhone) ?? String(rawPhone ?? "").slice(0, 40);
  const entries = [
    { key: `sms-verify:ip:${String(ip ?? "").trim().slice(0, 64) || "unknown"}`, limit: PHONE_VERIFY_PER_IP, windowMs: PHONE_VERIFY_WINDOW_MS },
    { key: `sms-verify:ph:${sha256(`sms-verify:${phone}`).slice(0, 24)}`, limit: PHONE_VERIFY_PER_PHONE, windowMs: PHONE_VERIFY_WINDOW_MS },
  ];
  const out = await checkRateLimitDbMany(entries, { now });
  const bad = out.filter((r) => !r.ok);
  if (bad.length === 0) return null;
  return Math.max(1, ...bad.map((r) => r.retryAfterSec ?? Math.ceil(PHONE_VERIFY_WINDOW_MS / 1000)));
}


/** Prisma unique violation → ชื่อคอลัมน์ที่ชน (ไว้แยก email/phone ตอนแข่งกันสมัคร) */
function uniqueTarget(e: unknown): string | null {
  const err = e as { code?: string; meta?: { target?: unknown } };
  if (err?.code !== "P2002") return null;
  const t = err.meta?.target;
  return Array.isArray(t) ? t.join(",") : String(t ?? "");
}

/** ใช้ไม่ได้แล้ว (consume แข่งกัน/หมดอายุ) — โยนใน $transaction เพื่อย้อนทุกอย่าง */
class OtpUsedError extends Error {}

/** จอง attempt 1 ครั้งแบบคำสั่งเดียว — false = ครบเพดานแล้ว (ล็อก) */
async function reserveAttempt(otpId: string): Promise<boolean> {
  const r = await prisma.phoneOtp.updateMany({
    where: { id: otpId, consumedAt: null, attempts: { lt: PHONE_OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  return r.count === 1;
}

// SEC S1.25 ▸ hook คำเชิญพนักงาน (R-K11 · R-S1.25b): **เฉพาะคนสมัครใหม่** (signupWithPhone) ⇒ รับคำเชิญของเบอร์นี้อัตโนมัติ ·
//   ผู้ใช้เดิม (ล็อกอิน OTP / ผูกเบอร์) ไม่สร้าง Membership — เห็นใบผ่าน pendingInvitesForUser แล้วกดรับเอง · best-effort (ล้ม = logOps ไม่เปลี่ยนผลเดิม)
//   lazy import — ไฟล์นี้ไม่ลากชั้นสิทธิ์/แจ้งเตือนเข้ากราฟ · log ไม่มีเบอร์ (R-S1.8e) ◂
async function claimStaffInvites(userId: string, phone: string): Promise<void> {
  try {
    const { claimInvitesForPhone } = await import("@/lib/staff/invite");
    await claimInvitesForPhone(userId, phone);
  } catch (e) {
    try {
      const { logOps } = await import("./ops");
      await logOps("WARN", "staff-invite", "claim ล้ม", { detail: JSON.stringify({ userId, err: e instanceof Error ? e.message.slice(0, 160) : "error" }) });
    } catch {
      /* logger ห้ามพางานหลัก */
    }
  }
}

// ── ขอรหัส ────────────────────────────────────────────────────
export async function requestPhoneOtp(
  rawPhone: string,
  opts: { ip?: string; send?: SendFn; now?: Date } = {},
): Promise<RequestPhoneOtpResult> {
  const phone = normalizeThaiMobile(rawPhone);
  if (!phone) return { ok: false, reason: "bad_phone", message: MSG.badPhone };
  const now = opts.now ?? new Date();

  // ขอซ้ำใน 60 วิ (ยังมีรหัสที่ใช้ได้) ⇒ ไม่ส่งใหม่ · บอกวินาทีที่เหลือ
  const recent = await prisma.phoneOtp.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: now }, createdAt: { gt: new Date(now.getTime() - PHONE_RESEND_SEC * 1000) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent) {
    const left = Math.ceil((recent.createdAt.getTime() + PHONE_RESEND_SEC * 1000 - now.getTime()) / 1000);
    return { ok: true, phone, resendAfterSec: Math.min(PHONE_RESEND_SEC, Math.max(1, left)) };
  }

  // นับ "ก่อน" สร้างแถวใหม่ (กติกาเดียวกับ requestLogin) · แถวที่ส่งล้ม/ใช้แล้วก็นับ
  const [perPhone, perDay] = await Promise.all([
    prisma.phoneOtp.count({ where: { phone, createdAt: { gte: new Date(now.getTime() - PHONE_RL_WINDOW_MS) } } }),
    prisma.phoneOtp.count({ where: { phone, createdAt: { gte: new Date(now.getTime() - DAY_MS) } } }),
  ]);
  if (perPhone >= PHONE_RL_PER_PHONE || perDay >= PHONE_RL_PER_PHONE_DAY)
    return { ok: false, reason: "rate_limited", message: MSG.rateLimited };
  if (opts.ip) {
    const perIp = await prisma.phoneOtp.count({
      where: { ip: opts.ip, createdAt: { gte: new Date(now.getTime() - PHONE_RL_WINDOW_MS) } },
    });
    if (perIp >= PHONE_RL_PER_IP) return { ok: false, reason: "rate_limited", message: MSG.rateLimited };
  }

  const testCode = phoneTestCode(phone); // เบอร์ทดสอบ ⇒ รหัสประจำ · ไม่ส่ง SMS
  const code = testCode ?? otpCode();
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

  const send: SendFn = testCode ? async () => ({ ok: true }) : (opts.send ?? sendSms);
  let sent: { ok: boolean; error?: string };
  try {
    // R-Z27: คำเตือน "อย่าบอก" + บรรทัดผูกโดเมน (iOS/Android autofill เฉพาะ shark.in.th · กันหน้าเว็บปลอมขอรหัส)
    sent = await send({ to: phone, text: `รหัสเข้าใช้ SHARK: ${code} (หมดอายุใน 10 นาที) อย่าบอกรหัสนี้กับใคร ทีมงาน SHARK ไม่ขอรหัสนี้\n\n@shark.in.th #${code}` });
  } catch (e) {
    sent = { ok: false, error: String(e).slice(0, 160) };
  }
  if (!sent.ok) {
    // ส่งไม่ถึง ⇒ ปิดแถว (consumed) แต่เก็บไว้ให้นับใน rate-limit — กันยิงเกตเวย์ที่ล้มซ้ำไม่จำกัด
    await prisma.phoneOtp.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
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
  const phone = normalizeThaiMobile(rawPhone);
  if (!phone) return { ok: false, reason: "bad_phone" };
  const now = opts.now ?? new Date();
  const digits = String(code ?? "").replace(/\D/g, ""); // R-S1.19h: "123 456" / "123-456" ใช้ได้
  const row = await prisma.phoneOtp.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.expiresAt < now) return { ok: false, reason: "expired" };
  // จองก่อนเทียบ (R-S1.19b) — ยิงขนานกี่ทางก็เทียบได้ไม่เกิน 5 ครั้งต่อรหัส
  if (!(await reserveAttempt(row.id))) return { ok: false, reason: "locked" };
  if (digits.length !== 6 || !codeMatches(row.codeHash, phone, digits)) return { ok: false, reason: "invalid" };
  // รหัสถูก ⇒ คืน attempt ที่จองไว้ (ตรวจซ้ำก่อนสมัคร/ผูกเบอร์ไม่กินโควตาเดา)
  await prisma.phoneOtp.updateMany({ where: { id: row.id, attempts: { gt: 0 } }, data: { attempts: { decrement: 1 } } });
  const owner = await prisma.userPhone.findUnique({ where: { phone }, select: { userId: true } });
  return { ok: true, phone, otpId: row.id, userId: owner?.userId ?? null };
}

/** ใช้รหัสครั้งเดียว — true เมื่อ "เรา" เป็นคน consume (ยิงซ้ำ/พร้อมกัน/หมดอายุ = false) */
export async function consumePhoneOtp(otpId: string): Promise<boolean> {
  const now = new Date();
  const r = await prisma.phoneOtp.updateMany({
    where: { id: otpId, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  return r.count === 1;
}

type Tx = Prisma.TransactionClient;
async function consumeInTx(tx: Tx, otpId: string): Promise<void> {
  const now = new Date();
  const r = await tx.phoneOtp.updateMany({
    where: { id: otpId, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (r.count !== 1) throw new OtpUsedError();
}

// ── สมัครใหม่ด้วยเบอร์ (เบอร์ผ่าน verify แล้ว) ───────────────────
// opts.otpId (route) ⇒ consume รหัสใน $transaction เดียวกับการสร้างบัญชี · email_taken นับเป็น attempt ของรหัสนั้น
export async function signupWithPhone(
  input: { phone: string; email: string; name: string },
  opts: { otpId?: string } = {},
): Promise<SignupWithPhoneResult> {
  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const phone = normalizeThaiMobile(input.phone);
  if (!phone) return { ok: false, reason: "bad_input", message: MSG.badPhone };
  if (name.length < 1 || name.length > NAME_MAX) return { ok: false, reason: "bad_input", message: MSG.badName };
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email) || isPhonePlaceholderEmail(email))
    return { ok: false, reason: "bad_input", message: MSG.badEmail };

  // R8: อีเมลมีบัญชีแล้ว ⇒ ให้เข้าด้วยอีเมลแล้วผูกเบอร์ · นับเป็น attempt (กันใช้รหัสเดียวไล่เช็คอีเมลไม่จำกัด)
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    if (opts.otpId) await reserveAttempt(opts.otpId);
    return { ok: false, reason: "email_taken", message: MSG.emailTaken };
  }
  if (await prisma.userPhone.findUnique({ where: { phone }, select: { id: true } }))
    return { ok: false, reason: "phone_taken", message: MSG.phoneTaken };

  try {
    const user = await prisma.$transaction(async (tx) => {
      if (opts.otpId) await consumeInTx(tx, opts.otpId);
      // R-S1.19a: User.email = placeholder (ไม่มีใครเป็นเจ้าของ) · อีเมลที่พิมพ์ = pendingEmail (ยังไม่ยืนยัน)
      const u = await tx.user.create({ data: { email: phonePlaceholderEmail(phone), name, prefs: { pendingEmail: email } } });
      await tx.userPhone.create({ data: { userId: u.id, phone, verifiedAt: new Date() } });
      return u;
    });
    await claimStaffInvites(user.id, phone); // SEC S1.25 ▸ สมัครด้วยเบอร์ ◂
    return { ok: true, user };
  } catch (e) {
    if (e instanceof OtpUsedError) return { ok: false, reason: "otp_used", message: MSG.otpUsed };
    // แข่งกันสมัคร — unique ของฐานเป็นตัวตัดสินสุดท้าย (placeholder ชน = เบอร์เดียวกัน)
    if (uniqueTarget(e) === null) throw e;
    return { ok: false, reason: "phone_taken", message: MSG.phoneTaken };
  }
}

// ── ผูกเบอร์กับบัญชีเดิม (R8 · เบอร์ผ่าน verify แล้ว) ───────────────
// บัญชียังไม่มีเบอร์ ⇒ ผูก · เบอร์เดิมของตัวเอง ⇒ ok (อัปเดต verifiedAt) · มีเบอร์อื่นอยู่ ⇒ phone_change_locked (R-S1.19e)
// เบอร์ของคนอื่น ⇒ phone_taken · opts.otpId ⇒ consume ใน $transaction เดียวกับการเขียน (ตรวจทุกข้อก่อน consume)
export async function linkPhoneToUser(
  userId: string,
  rawPhone: string,
  opts: { otpId?: string } = {},
): Promise<LinkPhoneResult> {
  const phone = normalizeThaiMobile(rawPhone);
  if (!phone) return { ok: false, reason: "bad_phone", message: MSG.badPhone };
  try {
    return await prisma.$transaction(async (tx): Promise<LinkPhoneResult> => {
      const holder = await tx.userPhone.findUnique({ where: { phone }, select: { userId: true } });
      if (holder && holder.userId !== userId) return { ok: false, reason: "phone_taken", message: MSG.phoneTaken };
      const mine = await tx.userPhone.findUnique({ where: { userId }, select: { id: true, phone: true } });
      if (mine && mine.phone !== phone)
        return { ok: false, reason: "phone_change_locked", message: MSG.phoneChangeLocked };
      if (opts.otpId) await consumeInTx(tx, opts.otpId);
      const verifiedAt = new Date();
      if (mine) await tx.userPhone.update({ where: { id: mine.id }, data: { verifiedAt } });
      else await tx.userPhone.create({ data: { userId, phone, verifiedAt } });
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof OtpUsedError) return { ok: false, reason: "otp_used", message: MSG.otpUsed };
    if (uniqueTarget(e) === null) throw e;
    return { ok: false, reason: "phone_taken", message: MSG.phoneTaken };
  }
}

/** เบอร์ (E.164) ที่ผูกกับ user — ไม่มี = null (แอปบังคับผูกเบอร์ · R8) */
export async function phoneOfUser(userId: string): Promise<string | null> {
  const row = await prisma.userPhone.findUnique({ where: { userId }, select: { phone: true } });
  return row?.phone ?? null;
}

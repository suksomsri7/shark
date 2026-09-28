// customer-session.ts — ตัวตนของ "ลูกค้า" ที่หน้า `/m/<slug>/*` (M2.9 · พิมพ์เขียว §3.10 §6.3 · D4)
//
// 🔴 แยกจาก session พนักงานโดยสิ้นเชิง: คนละตาราง (`CustomerSession` — ไม่ใช่ตาราง session ของหลังร้าน)
//    คนละ cookie (`shark_customer` ไม่ใช่ `shark_session`) คนละอายุ (30 วัน) และ **ไม่มีสิทธิ์ใด ๆ ในร้าน**
//    ลูกค้าที่ล็อกอินที่นี่ทำได้อย่างเดียวคือ "อ่าน/แก้ข้อมูลของตัวเอง" (ด่านอยู่ที่ `me.ts` ทุก op)
//    ⇒ ต่อให้ cookie พนักงานติดมาในเบราว์เซอร์เดียวกัน หน้า `/m/*` ก็ไม่สนใจมันเลย (และกลับกัน)
// 🔴 ทางเข้า 2 ทาง: OTP (เบอร์/อีเมล) และ LINE login (LIFF id_token — route `/m/<slug>/auth/line` เป็นคนตรวจ)
// 🔴 หน้า login ห้ามกลายเป็นเครื่องมือ "เดาว่าใครเป็นสมาชิกร้านนี้": ขอ OTP ด้วยเบอร์ที่ไม่มีในร้าน
//    ก็ตอบสำเร็จเหมือนกันทุกประการ (แต่รหัสนั้นยืนยันไม่ผ่านตลอดกาล)
// 🔴 ห้าม log รหัส OTP ดิบลง console/ops ไม่ว่ากรณีใด — `devOtp` คืนเป็นค่าในผลลัพธ์เฉพาะนอก production

import { createHmac } from "node:crypto";
import { otpCode, randomToken, sha256 } from "@/lib/core/hash";
import { checkRateLimitDb, resetRateLimitDb } from "@/lib/core/rate-limit-db";
import { prisma } from "./db";
import type { MemberActor } from "./access";
import { appRequiresSecureCookies } from "./customer-cookie";
import type { MemberCtx } from "./profile";

// ───────────────────────── ค่าคงที่ของสัญญา ─────────────────────────

const OTP_TTL_MS = 5 * 60_000; // อายุรหัส 5 นาที
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000; // อายุ session ลูกค้า 30 วัน
const MAX_OTP_ATTEMPTS = 5; // กรอกผิดครบ 5 ครั้ง = ใบนั้นตาย (แม้รหัสถูกก็ใช้ไม่ได้)
const RL_WINDOW_MS = 10 * 60_000;
const RL_PER_TARGET = 3; // ต่อเบอร์/อีเมล 3 ครั้ง / 10 นาที
const RL_PER_IP = 10; // ต่อ ip 10 ครั้ง / 10 นาที
// 🔴 AUDIT H4: ถัง "กรอกรหัสผิด" ตอนยืนยัน — คนละถังกับ "ขอรหัส" (เพดานต่อใบ 5 ครั้งเดิมยังอยู่
//    แต่ผู้โจมตีขอใบใหม่ได้เรื่อย ๆ ⇒ ต้องมีเพดานรวมต่อเบอร์/ต่อ IP ด้วย) · สำเร็จแล้วล้างถัง
const RL_VERIFY_WINDOW_MS = 15 * 60_000;
const RL_VERIFY_PER_TARGET = 10; // ยืนยันผิดต่อเบอร์/อีเมล 10 ครั้ง / 15 นาที
const RL_VERIFY_PER_IP = 10; // ยืนยันผิดต่อ ip 10 ครั้ง / 15 นาที

/**
 * คำนำหน้าของ token session ลูกค้า (M2.10)
 * 🔴 มีไว้ให้ REST แยก "ลูกค้า" ออกจาก "คีย์ API ของร้าน" (`shark_…`) ได้ตั้งแต่ก่อนแตะฐานข้อมูล
 *    — token ยังเก็บเป็น hash เหมือนเดิม (คำนำหน้าเป็นส่วนหนึ่งของค่าที่ hash) ⇒ ของเดิมที่ออกไปแล้ว
 *    ยังใช้ได้ ไม่ต้อง migrate อะไร
 */
export const CUSTOMER_TOKEN_PREFIX = "cs_";

/** token นี้หน้าตาเป็น session ลูกค้าไหม (ยังไม่ได้แปลว่าใช้ได้จริง — ต้อง `getCustomerSession` ต่อ) */
export function isCustomerToken(raw: string): boolean {
  return typeof raw === "string" && raw.startsWith(CUSTOMER_TOKEN_PREFIX);
}

/** ชื่อ cookie ของลูกค้า — HTTPS ใช้ `__Host-` (Secure + Path=/ + ไม่มี Domain) */
export function customerCookieName(): string {
  return appRequiresSecureCookies() ? "__Host-shark_customer" : "shark_customer";
}

/**
 * โชว์รหัสบนจอได้ไหม (dev/preview/QC) — production ไม่มีวันคืนรหัสกลับไปให้ผู้เรียก
 *
 * 🔴 AUDIT M3: `QC_OTP_PREVIEW` ถูกเช็คก่อน ⇒ env ตัวนี้หลุดไป prod ครั้งเดียว = OTP ของลูกค้าทุกคน
 *    โผล่ในผลลัพธ์ของ API สาธารณะ · ตอนนี้ **prod จริงตัดจบเป็นเงื่อนไขแรก** ไม่ว่าจะตั้ง env อะไรมา
 * 🔴 ตัวแยก "prod จริง" ต้องใช้สองตัวคู่กัน: `NODE_ENV=production` อย่างเดียวไม่พอ เพราะ `next start`
 *    ของเซิร์ฟเวอร์ QC (scripts/acc-v2-serve.sh) ก็เป็น production เหมือนกัน — ตัวที่ต่างคือ `APP_ENV`
 *    (.env.qc ตั้ง `APP_ENV=development` · prod จริงตั้ง `APP_ENV=production`) ซึ่งเป็นตัวเดียวกับที่
 *    ใช้ตัดสินชื่อ/Secure ของ cookie อยู่แล้ว ⇒ ไม่มีตัวแปรลับตัวที่สองให้ลืมตั้ง
 */
function otpPreviewOn(): boolean {
  if (process.env.NODE_ENV === "production" && (process.env.APP_ENV ?? "development") === "production") return false;
  if (process.env.QC_OTP_PREVIEW === "1") return true;
  return process.env.NODE_ENV !== "production";
}

// ───────────────────────── ข้อผิดพลาด ─────────────────────────

/** ขอรหัสถี่เกินกติกา — ผู้เรียกอ่าน `code` ได้ตรง ๆ (REST ตอบ 429) */
export class CustomerRateLimitError extends Error {
  readonly status = 429;
  readonly code = "RATE_LIMITED";
  constructor(message: string) {
    super(message);
    this.name = "CustomerRateLimitError";
  }
}

/** ข้อมูลที่ส่งมาใช้ไม่ได้ (เบอร์/อีเมล/ร้าน) */
export class CustomerAuthError extends Error {
  readonly status = 400;
  readonly code = "CUSTOMER_AUTH";
  constructor(message: string) {
    super(message);
    this.name = "CustomerAuthError";
  }
}

// 🔴 ข้อความเดียวสำหรับทุกกรณีที่ยืนยันไม่ผ่าน (รหัสผิด · หมดอายุ · ใบไม่มีจริง · ไม่มีสมาชิกคนนี้)
//    ถ้าแยกข้อความ = บอกคนนอกว่าเบอร์ไหนเป็นสมาชิกของร้านนี้
const VERIFY_FAIL = "รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว — กดขอรหัสใหม่แล้วลองอีกครั้ง";

// ───────────────────────── ตัวช่วย ─────────────────────────

function trimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** เบอร์ไทยแบบเก็บในฐาน (ตัวเลขล้วน) */
function normPhone(v: string): string {
  return v.replace(/[^\d+]/g, "");
}

/** ปิดบังปลายทางก่อนส่งกลับหน้าจอ — ต้องมี `*` เสมอ (คนที่ยืมมือถือคนอื่นดูต้องเดาไม่ออก) */
function maskTarget(target: string, channel: "PHONE" | "EMAIL"): string {
  if (channel === "EMAIL") {
    const [name = "", domain = ""] = target.split("@");
    const head = name.slice(0, 2);
    return `${head}${"*".repeat(Math.max(3, name.length - 2))}@${domain}`;
  }
  if (target.length <= 4) return `${"*".repeat(Math.max(1, target.length))}`;
  return `${target.slice(0, 3)}${"*".repeat(Math.max(1, target.length - 5))}${target.slice(-2)}`;
}

const rateKeys = new Set<string>();

/**
 * นับ 1 ครั้งในถังบนฐานข้อมูล
 * 🔴 AUDIT H4: เดิมใช้ `core/rate-limit.ts` (Map ใน process เดียว) ⇒ บนหลาย instance เพดานจริง =
 *    ที่ตั้งไว้ × จำนวน instance แทบไม่กันอะไรเลย · ย้ายมา `checkRateLimitDb` ถังเดียวกับที่เลนสมัคร
 *    สมาชิก (`public-lane`/`join-actions.gate`) ใช้อยู่ ⇒ ทุก instance เห็นตัวเลขเดียวกัน
 *    (ตัวเลขเพดานคงเดิมทุกตัว — ย้ายที่นับอย่างเดียว ไม่ได้บีบผู้ใช้จริงเพิ่ม)
 */
async function hit(key: string, limit: number, windowMs: number, message: (mins: number) => string): Promise<void> {
  rateKeys.add(key);
  const r = await checkRateLimitDb(key, { limit, windowMs });
  if (!r.ok) {
    const mins = Math.max(1, Math.ceil((r.retryAfterSec ?? 60) / 60));
    throw new CustomerRateLimitError(message(mins));
  }
}

const askTooOften = (mins: number) => `ขอรหัสยืนยันบ่อยเกินไป — รออีกประมาณ ${mins} นาทีแล้วลองใหม่อีกครั้ง`;
const verifyTooOften = (mins: number) => `ใส่รหัสยืนยันผิดหลายครั้งเกินไป — รออีกประมาณ ${mins} นาทีแล้วลองใหม่อีกครั้ง`;

/** คีย์ถัง "ยืนยันรหัสผิด" (AUDIT H4) — ต่อปลายทาง และต่อ IP */
function verifyKeys(tenantId: string | null, target: string | null, ip: string): string[] {
  const out: string[] = [];
  if (tenantId && target) out.push(`customer-otp:verify:${tenantId}:${target}`);
  if (ip) out.push(`customer-otp:verify:ip:${ip}`);
  return out;
}

/** ล้างตัวนับของ QC เท่านั้น (ล้างเฉพาะถังของไฟล์นี้ ไม่แตะถังของโมดูลอื่น) */
export async function __resetCustomerOtpLimit(): Promise<void> {
  for (const k of rateKeys) await resetRateLimitDb(k);
  rateKeys.clear();
}

async function tenantBySlug(slug: string): Promise<{ id: string; name: string }> {
  const s = trimmed(slug);
  const row = s ? await prisma.tenant.findUnique({ where: { slug: s }, select: { id: true, name: true } }) : null;
  if (!row) throw new CustomerAuthError("ไม่พบร้านนี้ — ตรวจลิงก์ที่ร้านส่งให้อีกครั้ง");
  return row;
}

// ───────────────────────── (ก) OTP ─────────────────────────

export type RequestOtpInput = { phone?: string | null; email?: string | null };

export type RequestOtpResult = {
  otpId: string;
  expiresAt: Date;
  /** ปลายทางแบบปิดบัง — เอาไว้โชว์ว่า "ส่งไปที่ 081****01 แล้ว" */
  maskedTo: string;
  /** เฉพาะ dev/preview/QC — production ไม่มีค่านี้ */
  devOtp?: string;
};

/**
 * ขอรหัส OTP ไปที่เบอร์หรืออีเมลของลูกค้า
 *
 * 🔴 ไม่เผยว่ามีสมาชิกคนนี้ในร้านหรือไม่ — ไม่พบก็ออกใบให้เหมือนกัน (ใบนั้นยืนยันไม่ผ่านตลอดกาล)
 * 🔴 กันยิงถล่ม 2 ชั้นผ่าน `checkRateLimit` กลาง: ต่อปลายทาง 3 ครั้ง/10 นาที · ต่อ ip 10 ครั้ง/10 นาที
 */
export async function requestOtp(
  tenantSlug: string,
  input: RequestOtpInput,
  /**
   * `forJoin` (M3.11) — ขอรหัสเพื่อ **สมัคร** (`join.startJoin`): คนที่ยังไม่เป็นสมาชิกต้องได้รหัสจริงด้วย
   * (หน้าเข้าสู่ระบบส่งเฉพาะปลายทางที่รู้จัก เพราะรหัสของคนแปลกหน้ายืนยันไม่ผ่านอยู่แล้ว — แต่หน้าสมัคร
   *  ยืนยันผ่านได้ ถ้าไม่ส่ง = สมัครไม่ได้เลย) · ส่งทั้งคนใหม่และคนเดิมเหมือนกัน ⇒ ยังไม่เผยว่าใครเป็นสมาชิก
   */
  opts: { ip?: string | null; forJoin?: boolean } = {},
): Promise<RequestOtpResult> {
  const tenant = await tenantBySlug(tenantSlug);
  const { channel, target } = otpTargetOf(input);

  // 🔴 AUDIT H4: เพดานทั้งสองชั้นนับบนฐานข้อมูล (ทนข้าม instance) — เลนสมัครสมาชิกเรียกผ่านทางนี้
  //    เหมือนกันทุกประการ จึงได้เพดานชุดเดียวกัน ไม่ใช่เพดานคนละใบให้ยิงสลับกันได้สองเท่า
  // CRM C3.5 ▸ พอร์ทัลลูกค้าองค์กรนับถังเดียวกันนี้ผ่าน `hitOtpAskBuckets` (R-C.5 · "ไม่มี limiter ตัวที่สอง") ◂
  const ip = await hitOtpAskBuckets(tenant.id, channel, target, opts?.ip);

  const customer = await prisma.customer.findFirst({
    where: {
      tenantId: tenant.id,
      status: { in: ["ACTIVE", "SUSPENDED"] },
      ...(channel === "PHONE" ? { phone: target } : { email: target }),
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const otpId = randomToken(18);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const code = await createOtpRow({ id: otpId, tenantId: tenant.id, channel, target, customerId: customer?.id ?? null, ip, expiresAt });

  // ส่งจริงเฉพาะเมื่อรู้จักปลายทาง — ส่งไม่ออกห้ามทำให้คำขอล้ม (ผู้ใช้จะเห็นแค่ "ส่งแล้ว" เหมือนกันหมด)
  //
  // 🔴 AUDIT L1: เดิม `await sendEmail(...)` อยู่ในเส้นทางคำขอ ⇒ อีเมลที่เป็นสมาชิกตอบช้ากว่าอีเมล
  //    คนแปลกหน้าเท่ากับเวลาที่ผู้ให้บริการอีเมลใช้ (หลักร้อย ms ขึ้นไป) = จับเวลาแล้วรู้ว่าใครเป็นสมาชิก
  //    ⇒ ย้ายการส่งออกนอกเส้นทางคำขอ: มี request scope ใช้ `after()` ของ Next · ไม่มี (ถูกเรียกเป็น
  //    ไลบรารีจากคิว/ข้อสอบ) ก็ยิงทิ้งพร้อม `.catch` — ทั้งสองทางคืนค่าให้ผู้เรียกทันทีเท่ากันหมด
  if ((customer || opts?.forJoin === true) && channel === "EMAIL") {
    const subject = opts?.forJoin === true ? `รหัสยืนยันสมัครสมาชิก ${tenant.name}` : `รหัสเข้าสู่ระบบสมาชิก ${tenant.name}`;
    await sendOtpMailOffPath(target, subject, `รหัสยืนยันของคุณคือ ${code} (ใช้ได้ 5 นาที)`);
  }
  // หนี้: ยังไม่มีผู้ให้บริการ SMS ในระบบ ⇒ ช่องทางเบอร์ส่งจริงไม่ได้จนกว่าจะต่อ gateway (M3.2)

  return {
    otpId,
    expiresAt,
    maskedTo: maskTarget(target, channel),
    ...(otpPreviewOn() ? { devOtp: code } : {}),
  };
}

// ── ตัวช่วยของเส้นทาง OTP ที่ใช้ร่วมกันทั้ง "สมาชิก" และ "พอร์ทัลลูกค้าองค์กร" (CRM C3.5 · R-C.5) ──
//    ย้ายออกมาจากตัวของ requestOtp/verifyOtp เดิม **โดยไม่เปลี่ยนพฤติกรรม** (ลำดับด่าน · ถัง · ข้อความ · การนับครั้งผิด)
//    ⇒ พอร์ทัลไม่มีตัวออกรหัส/ตัวนับ/ตาราง OTP ของตัวเอง (ข้อสอบ C3.5-S0.4 · MASTER-PLAN §2.8)

/** ปลายทางของรหัส (เบอร์ก่อน · ไม่มีเบอร์ใช้อีเมลตัวเล็ก) — ไม่มีทั้งคู่ = CustomerAuthError */
function otpTargetOf(input: RequestOtpInput | null | undefined): { channel: "PHONE" | "EMAIL"; target: string } {
  const phone = normPhone(trimmed(input?.phone));
  const email = trimmed(input?.email).toLowerCase();
  if (!phone && !email) throw new CustomerAuthError("กรอกเบอร์โทรหรืออีเมลที่ให้ไว้กับร้านก่อน จึงจะขอรหัสได้");
  return phone ? { channel: "PHONE", target: phone } : { channel: "EMAIL", target: email };
}

/** นับถัง "ขอรหัส" ต่อปลายทาง + ต่อ IP (คืน IP ที่ตัดช่องว่างแล้ว) — เกินเพดาน = CustomerRateLimitError */
async function hitOtpAskBuckets(tenantId: string, channel: "PHONE" | "EMAIL", target: string, rawIp: string | null | undefined): Promise<string> {
  await hit(`customer-otp:target:${tenantId}:${channel}:${target}`, RL_PER_TARGET, RL_WINDOW_MS, askTooOften);
  const ip = trimmed(rawIp);
  if (ip) await hit(`customer-otp:ip:${ip}`, RL_PER_IP, RL_WINDOW_MS, askTooOften);
  return ip;
}

/** ออกใบ OTP หนึ่งใบบนตาราง `CustomerOtp` (hash ของ id+รหัส) — คืนรหัสดิบให้ผู้เรียกส่งต่อ (ห้าม log) */
async function createOtpRow(input: { id: string; tenantId: string; channel: "PHONE" | "EMAIL"; target: string; customerId: string | null; ip: string; expiresAt: Date }): Promise<string> {
  const code = otpCode();
  await prisma.customerOtp.create({
    data: {
      id: input.id,
      tenantId: input.tenantId,
      target: input.target,
      channel: input.channel,
      codeHash: sha256(`${input.id}:${code}`),
      expiresAt: input.expiresAt,
      customerId: input.customerId,
      ip: input.ip || null,
    },
  });
  return code;
}

/** ส่งอีเมลนอกเส้นทางคำขอ (AUDIT L1) — `after()` ในคำขอของ Next · นอกคำขอ = ยิงทิ้งพร้อม catch · ไม่เคยโยน */
async function sendOtpMailOffPath(to: string, subject: string, body: string): Promise<void> {
  const deliver = async (): Promise<void> => {
    try {
      const { sendEmail } = await import("@/lib/core/email");
      await sendEmail(to, subject, body);
    } catch {
      // ส่งอีเมลไม่ออก = ผู้ใช้กดขอใหม่ได้ — ห้ามโยนต่อ (และห้าม log รหัส)
    }
  };
  let scheduled = false;
  try {
    const { after } = await import("next/server");
    after(deliver);
    scheduled = true;
  } catch {
    // นอกขอบเขตคำขอ (คิว/ข้อสอบ/สคริปต์) — `after()` โยนทิ้ง ยังไม่ได้เรียก deliver จึงไม่ส่งซ้ำ
  }
  if (!scheduled) void deliver();
}

type OtpRow = NonNullable<Awaited<ReturnType<typeof prisma.customerOtp.findUnique>>>;

/**
 * เปิดใบ OTP เพื่อยืนยัน: นับถัง "ยืนยัน" (AUDIT H4) → ใบต้องยังใช้ได้ → เทียบรหัส
 * ใบไม่มีจริง/ใช้แล้ว/หมดอายุ/ผิดครบ 5 ครั้ง = VERIFY_FAIL · รหัสผิดยังไม่ถูกนับที่นี่ (ผู้เรียกตัดสินผ่าน `failOtp`)
 */
async function openOtp(
  input: { otpId: string; code: string },
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<{ row: OtpRow; ok: boolean; keys: string[]; now: Date }> {
  const otpId = trimmed(input?.otpId);
  const code = trimmed(input?.code);
  if (!otpId || !code) throw new CustomerAuthError(VERIFY_FAIL);

  const row = await prisma.customerOtp.findUnique({ where: { id: otpId } });
  const now = new Date();

  // 🔴 AUDIT H4: เพดานเดิมนับ "ผิดต่อใบ" (5 ครั้ง) อย่างเดียว — ขอใบใหม่แล้วเดาต่อได้ไม่จำกัด
  //    ⇒ นับรวมต่อเบอร์/อีเมล และต่อ IP บนฐานข้อมูลด้วย (ยิงขนานจากหลาย instance ก็โดนถังเดียวกัน)
  //    ยืนยันสำเร็จ = ล้างถัง (คนกดผิดเพราะพิมพ์พลาดไม่ถูกลงโทษข้ามรอบ)
  const ip = trimmed(meta?.ip) || trimmed(row?.ip);
  const keys = verifyKeys(row?.tenantId ?? null, row?.target ?? null, ip);
  const limitOf = (k: string) => (k.startsWith("customer-otp:verify:ip:") ? RL_VERIFY_PER_IP : RL_VERIFY_PER_TARGET);
  for (const k of keys) await hit(k, limitOf(k), RL_VERIFY_WINDOW_MS, verifyTooOften);

  if (!row || row.usedAt || row.expiresAt < now || row.attempts >= MAX_OTP_ATTEMPTS) {
    throw new CustomerAuthError(VERIFY_FAIL);
  }
  return { row, ok: row.codeHash === sha256(`${otpId}:${code}`), keys, now };
}

/** นับ "กรอกผิด" 1 ครั้งบนใบนั้นแล้วตอบข้อความกลาง */
async function failOtp(rowId: string): Promise<never> {
  await prisma.customerOtp.update({ where: { id: rowId }, data: { attempts: { increment: 1 } } });
  throw new CustomerAuthError(VERIFY_FAIL);
}

export type CustomerSessionToken = {
  token: string;
  cookieName: string;
  customerId: string;
  tenantId: string;
  expiresAt: Date;
};

async function createSessionRow(
  customer: { id: string; tenantId: string },
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<CustomerSessionToken> {
  const token = `${CUSTOMER_TOKEN_PREFIX}${randomToken(32)}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.customerSession.create({
    data: {
      tenantId: customer.tenantId,
      customerId: customer.id,
      tokenHash: sha256(token),
      userAgent: trimmed(meta?.userAgent) || null,
      ip: trimmed(meta?.ip) || null,
      expiresAt,
    },
  });
  return { token, cookieName: customerCookieName(), customerId: customer.id, tenantId: customer.tenantId, expiresAt };
}

/**
 * ยืนยันรหัส OTP → ออก session ลูกค้า
 * ผิดครบ 5 ครั้ง = ใบนั้นตายถาวร (กรอกถูกทีหลังก็ไม่ผ่าน) · ใบที่ใช้แล้วใช้ซ้ำไม่ได้
 */
export async function verifyOtp(
  input: { otpId: string; code: string },
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<CustomerSessionToken> {
  const { row, ok, keys, now } = await openOtp(input, meta);
  if (!ok || !row.customerId) return failOtp(row.id);
  // 🔴 AUDIT M6: บัญชีที่ถูกระงับเข้าระบบไม่ได้ (เดิมรับ SUSPENDED ด้วย) — พิมพ์เขียว §3.10/§6.2 ไม่มี
  //    ข้อยกเว้นให้คนถูกระงับล็อกอิน · ข้อความยังเป็นใบเดียวกับ "รหัสผิด" (ไม่บอกใบ้สถานะบัญชีคนอื่น)
  const customer = await prisma.customer.findFirst({
    where: { id: row.customerId, tenantId: row.tenantId, status: "ACTIVE" },
    select: { id: true, tenantId: true },
  });
  if (!customer) throw new CustomerAuthError(VERIFY_FAIL);

  await prisma.customerOtp.update({ where: { id: row.id }, data: { usedAt: now } });
  for (const k of keys) await resetRateLimitDb(k);
  return createSessionRow(customer, meta);
}

// ───────────────────────── (ข) LINE login (LIFF) ─────────────────────────

export type LineLoginResult = CustomerSessionToken | { needsJoin: true; joinUrl: string };

/**
 * เข้าสู่ระบบด้วย LINE — ผู้เรียก (`/m/<slug>/auth/line`) **ต้องตรวจ id_token กับ LINE มาก่อน**
 * แล้วส่ง `lineUserId` (`sub`) ที่ตรวจแล้วเข้ามา — ฟังก์ชันนี้ไม่เชื่อ id ที่ยังไม่ผ่านการตรวจ
 *
 * ยังไม่เคยผูก LINE กับสมาชิกคนไหน → ไม่ออก session แต่ชี้ไปหน้าสมัคร/ผูกบัญชี (M3.11 `join`)
 */
export async function loginWithLine(
  tenantSlug: string,
  input: { lineUserId: string; displayName?: string | null },
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<LineLoginResult> {
  const tenant = await tenantBySlug(tenantSlug);
  const lineUserId = trimmed(input?.lineUserId);
  const slug = trimmed(tenantSlug);
  const joinUrl = `/m/${encodeURIComponent(slug)}/join?line=${encodeURIComponent(lineUserId)}`;
  if (!lineUserId) return { needsJoin: true, joinUrl };

  const identity = await prisma.memberChannelIdentity.findFirst({
    where: { tenantId: tenant.id, channel: "LINE", externalId: lineUserId },
    select: { customerId: true },
  });
  if (!identity) return { needsJoin: true, joinUrl };
  // 🔴 AUDIT M6: ระงับบัญชีแล้วเข้าด้วย LINE ไม่ได้ (เดิมรับ SUSPENDED) — ผลเหมือน "ยังไม่เคยผูก"
  //    คือ needsJoin ไม่ออก session (ไม่บอกใบ้ว่าบัญชีนี้ถูกระงับ)
  const customer = await prisma.customer.findFirst({
    where: { id: identity.customerId, tenantId: tenant.id, status: "ACTIVE" },
    select: { id: true, tenantId: true },
  });
  if (!customer) return { needsJoin: true, joinUrl };
  return createSessionRow(customer, meta);
}

// ───────────────────────── (ค) session ─────────────────────────

/** ออก session ให้ลูกค้าโดยตรง (ใช้หลังสมัครสมาชิกจบ · harness ของ QC · เครื่องมือดูแลระบบ) */
export async function mintCustomerSession(
  customerId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<CustomerSessionToken> {
  // 🔴 AUDIT M6: ออก session ให้ได้เฉพาะบัญชีที่ยังใช้งานอยู่ (ระงับ/ปิด/ถูกรวม = ออกไม่ได้)
  const customer = await prisma.customer.findFirst({
    where: { id: trimmed(customerId), status: "ACTIVE" },
    select: { id: true, tenantId: true },
  });
  if (!customer) throw new CustomerAuthError("ไม่พบสมาชิกคนนี้ — ลิงก์อาจเก่าเกินไป ลองเข้าจากหน้าร้านอีกครั้ง");
  return createSessionRow(customer, meta);
}

export type CustomerSessionInfo = {
  customerId: string;
  tenantId: string;
  memberSystemId: string;
  expiresAt: Date;
};

/** อ่าน session จาก token (หมดอายุ/ถูกเพิกถอน/ไม่มีจริง = null เงียบ ๆ) */
export async function getCustomerSession(token: string): Promise<CustomerSessionInfo | null> {
  const t = trimmed(token);
  if (!t) return null;
  const row = await prisma.customerSession.findUnique({ where: { tokenHash: sha256(t) } });
  if (!row || row.revokedAt || row.expiresAt < new Date()) return null;
  // 🔴 AUDIT M6: สถานะ SUSPENDED = ใช้ session ต่อไม่ได้ทันที (ไม่ต้องรอ cookie หมดอายุ)
  //    คู่กับการเพิกถอน session ตอนกดระงับใน `profile.setStatus` — ปลดระงับแล้วล็อกอินใหม่ได้ตามปกติ
  const customer = await prisma.customer.findFirst({
    where: { id: row.customerId, tenantId: row.tenantId, status: "ACTIVE" },
    select: { id: true, tenantId: true, memberSystemId: true },
  });
  if (!customer) return null;
  return {
    customerId: customer.id,
    tenantId: customer.tenantId,
    memberSystemId: customer.memberSystemId,
    expiresAt: row.expiresAt,
  };
}

/** ออกจากระบบ (ใบเดียว) — เรียกซ้ำได้ */
export async function revokeCustomerSession(token: string): Promise<{ ok: true }> {
  const t = trimmed(token);
  if (t) {
    await prisma.customerSession.updateMany({
      where: { tokenHash: sha256(t), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  return { ok: true };
}

/** เพิกถอนทุก session ของสมาชิกคนหนึ่ง (ลบข้อมูลตาม PDPA / ร้านระงับบัญชี) */
export async function revokeAllCustomerSessions(customerId: string): Promise<number> {
  const r = await prisma.customerSession.updateMany({
    where: { customerId: trimmed(customerId), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return r.count;
}

// ───────────────────────── (ง) ด่านของหน้า `/m/<slug>/*` ─────────────────────────

export type CustomerPageContext = {
  slug: string;
  tenantId: string;
  tenantName: string;
  systemId: string;
  customerId: string;
  ctx: MemberCtx;
  actor: MemberActor;
};

/** actor ของ "ตัวลูกค้าเอง" — ไม่มีคีย์สิทธิ์ของพนักงานแม้แต่ตัวเดียว */
export function customerActor(customerId: string): MemberActor {
  return { userId: "", role: "CUSTOMER", unitAccess: [], permissions: {}, customerId };
}

async function toLogin(slug: string): Promise<never> {
  const { redirect } = await import("next/navigation");
  // `redirect()` โยน error พิเศษของ Next เสมอ — บรรทัด throw ข้างล่างจึงไม่ถูกใช้จริง
  // (มีไว้ให้ TypeScript เห็นว่าฟังก์ชันนี้ไม่มีทางเดินจนจบ)
  redirect(`/m/${encodeURIComponent(slug)}/login`);
  throw new CustomerAuthError("ต้องเข้าสู่ระบบก่อนจึงจะเปิดหน้านี้ได้");
}

/**
 * ด่านของทุกหน้า `/m/<slug>/*` (server component) — ไม่มี session ลูกค้า = พาไปหน้าเข้าสู่ระบบ
 * 🔴 ไม่แตะ cookie ของพนักงาน (`shark_session`) เลย: พนักงานที่ล็อกอินหลังร้านอยู่แล้ว เปิดหน้านี้
 *    ก็ยังต้องเข้าสู่ระบบในฐานะลูกค้า — ไม่มีทางลัดให้ดูบัตรของคนอื่น
 */
export async function requireCustomer(slug: string): Promise<CustomerPageContext> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const token = jar.get(customerCookieName())?.value ?? "";
  const session = token ? await getCustomerSession(token) : null;
  if (!session) return toLogin(slug);

  const tenant = await prisma.tenant.findUnique({ where: { slug: trimmed(slug) }, select: { id: true, name: true } });
  // session ของร้านอื่น = เหมือนไม่มี session (ลิงก์ข้ามร้านต้องไม่พาข้อมูลข้ามไปด้วย)
  if (!tenant || tenant.id !== session.tenantId) return toLogin(slug);

  return {
    slug: trimmed(slug),
    tenantId: session.tenantId,
    tenantName: tenant.name,
    systemId: session.memberSystemId,
    customerId: session.customerId,
    ctx: { tenantId: session.tenantId, systemId: session.memberSystemId, actorUserId: null },
    actor: customerActor(session.customerId),
  };
}

// ───────────────────────── (จ) งานกวาดของหมดอายุ (cron รายวัน) ─────────────────────────

/**
 * ลบ OTP ที่หมดอายุแล้ว + session ที่หมดอายุ/ถูกเพิกถอนมานาน (ทุกร้าน)
 * เก็บของหมดอายุไว้ 7 วันเผื่อสอบสวนย้อนหลัง แล้วค่อยลบ — แถวพวกนี้ไม่มีค่าทางบัญชี
 */
export async function sweepCustomerAuth(now: Date = new Date()): Promise<number> {
  const otpCut = new Date(now.getTime() - 24 * 60 * 60_000);
  const sessCut = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const [otps, sessions] = await Promise.all([
    prisma.customerOtp.deleteMany({ where: { expiresAt: { lt: otpCut } } }),
    prisma.customerSession.deleteMany({
      where: { OR: [{ expiresAt: { lt: sessCut } }, { revokedAt: { lt: sessCut } }] },
    }),
  ]);
  return otps.count + sessions.count;
}

// CRM C3.5 ▸ พอร์ทัลลูกค้าองค์กร `/b/<slug>/*` — subject ที่สองบนตรรกะชุดเดียวกัน (RESOLUTIONS R-C.5 · มติผู้คุมงาน C3.5 ข้อ 3–5)
//   ผู้ถือ session = "ผู้ติดต่อของบริษัทลูกค้า 1 คน ในบริษัท 1 แห่ง" (`CrmPortalAccess`) · ตารางพี่น้อง `PortalSession`
//   (ของ `CustomerSession` บังคับ customerId NOT NULL) · token `cp_…` เก็บเป็น sha256 เหมือน `cs_` · คุกกี้ `shark_portal`
//   ใช้ตัวเลือกชุดเดียวกับลูกค้า (`customerCookieOptions`) · OTP/ถังเพดาน/ตาราง `CustomerOtp` ชุดเดิมทุกตัว (ไม่มีตัวที่สอง)
// 🔴 ไฟล์นี้อยู่ในโมดูลสมาชิก ⇒ **ห้าม import โมดูล CRM** (ไม่มีเส้น member→crm ใน allowlist) — กติกา "ใครเข้าได้" อ่านจากตาราง
//    ของ CRM ตรง ๆ ด้วยเงื่อนไขชุดเดียว (`portalAccessUsable`) ที่ทั้งตัวออก session และตัวอ่าน session ใช้ร่วมกัน
// AUDIT-CLASS X1: session ผูก (tenant · ระบบ CRM · access · บริษัท · ผู้ติดต่อ) ครบทุกช่อง — อ่านกลับต้องตรงทุกช่อง
// AUDIT-CLASS X8: `ipHash` = HMAC ที่มีเกลือ (ไม่ใช่ IP ดิบ ไม่ใช่ sha256 เปล่าของ IP) · ไม่มี token ดิบในแถว/บันทึกใด ๆ
// AUDIT-CLASS X10: token มีคำนำหน้าของตัวเอง (`cp_` ≠ `cs_`) ⇒ เลนสมาชิกไม่รับ และเลนพอร์ทัลไม่รับ token สมาชิก

/** คำนำหน้า token ของ session พอร์ทัลลูกค้าองค์กร (≠ `cs_` ของสมาชิก) */
export const PORTAL_TOKEN_PREFIX = "cp_";
/** คำนำหน้า id ของใบ OTP ที่ออกให้พอร์ทัล — ใบของสมาชิกยืนยันเป็น session พอร์ทัลไม่ได้ และกลับกัน */
const PORTAL_OTP_PREFIX = "po_";
/** อายุ session พอร์ทัล = อายุคุกกี้ของ `customerCookieOptions` (30 วัน) */
const PORTAL_SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
/** ข้อความกลางเมื่อสิทธิ์ใช้ไม่ได้ (ถูกถอน · ผู้ติดต่อถูกเก็บ · บัญชีสมาชิกถูกระงับ · ร้านปิดพอร์ทัล) — ไม่บอกว่าเพราะข้อไหน */
const PORTAL_ACCESS_FAIL = "สิทธิ์เข้าพอร์ทัลนี้ใช้ไม่ได้แล้ว — ติดต่อร้านเพื่อขอเปิดสิทธิ์ใหม่อีกครั้ง";

/** token นี้หน้าตาเป็น session พอร์ทัลไหม (ยังไม่ได้แปลว่าใช้ได้จริง — ต้อง `getPortalSession` ต่อ) */
export function isPortalToken(raw: string): boolean {
  return typeof raw === "string" && raw.startsWith(PORTAL_TOKEN_PREFIX);
}

/** ชื่อคุกกี้ของพอร์ทัล — กติกา APP_ENV เดียวกับ `customerCookieName` (`__Host-` คู่กับ Secure เสมอ) */
export function portalCookieName(): string {
  return appRequiresSecureCookies() ? "__Host-shark_portal" : "shark_portal";
}

/**
 * กุญแจของพอร์ทัลพร้อมไหม — `SESSION_SECRET` ≥ 32 ตัวอักษร (มติผู้คุมงาน C3.5 · ไม่พร้อม = พอร์ทัลไม่เปิดเลย ไม่ใช่เปิดแบบไม่มีเกลือ)
 * อ่านตอนเรียก (ไม่ใช่ตอน import — ด่าน fitness โหมดไร้ env)
 */
export function portalSecretReady(): boolean {
  const s = process.env.SESSION_SECRET;
  return typeof s === "string" && s.length >= 32;
}

/**
 * ตัวแทนของ IP ตัวเดียวของพอร์ทัล (ทั้ง `PortalSession.ipHash` และหลักฐานผู้ลงนามใบเสนอราคา) — HMAC-SHA256 ด้วยเกลือคงที่
 * `portal-ip:v1:<SESSION_SECRET>` (ไม่ใช่ IP ดิบ ไม่ใช่ sha256 เปล่า · ไม่มีเกลือรายเดือน ⇒ ค่าเดียวกันเทียบข้ามเวลาได้) · ไม่มี IP = null
 */
export function portalIpHash(ip: string | null | undefined): string | null {
  const raw = trimmed(ip);
  if (!raw || !portalSecretReady()) return null;
  return createHmac("sha256", `portal-ip:v1:${process.env.SESSION_SECRET}`).update(raw).digest("hex");
}

const PORTAL_NOT_READY = "พอร์ทัลลูกค้ายังไม่พร้อมใช้งาน (ระบบยังตั้งค่ากุญแจไม่ครบ) — ขออภัย ร้านได้รับแจ้งแล้ว ลองใหม่ภายหลัง";

export type PortalSessionToken = {
  token: string;
  cookieName: string;
  sessionId: string;
  portalAccessId: string;
  companyId: string;
  crmContactId: string;
  crmSystemId: string;
  tenantId: string;
  expiresAt: Date;
};

export type PortalSessionInfo = {
  sessionId: string;
  tenantId: string;
  crmSystemId: string;
  portalAccessId: string;
  companyId: string;
  crmContactId: string;
  role: string;
  expiresAt: Date;
};

type UsableAccess = { id: string; tenantId: string; systemId: string; companyId: string; contactId: string; role: string; /** C5.4-B H1 */ linkStartedAt: Date | null };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * กติกาเดียวของ "สิทธิ์นี้ยังเข้าได้ไหม" — ทั้งตอนออก session และ **ทุกครั้งที่อ่าน session** (revoke มีผลทันที · S6.2 · X8.4)
 *   access ไม่ถูกถอน · ผู้ติดต่อไม่ถูกเก็บ/ไม่ถูกรวม · ยังผูกกับบริษัทนั้นอยู่ · บริษัทไม่ถูกเก็บ/ไม่ถูกรวม ·
 *   ถ้าผูกสมาชิก ⇒ บัญชีสมาชิกต้อง ACTIVE · ระบบ CRM ต้องเป็น uiVersion 2 และเปิด `portal.enabled` (R-E.14)
 */
async function portalAccessUsable(accessId: string): Promise<UsableAccess | null> {
  const id = trimmed(accessId);
  if (!id) return null;
  const a = await prisma.crmPortalAccess.findUnique({
    where: { id },
    select: {
      id: true, tenantId: true, systemId: true, companyId: true, contactId: true, role: true, revokedAt: true, acceptedAt: true, invitedAt: true, inviteExpiresAt: true,
      contact: { select: { tenantId: true, systemId: true, archivedAt: true, mergedIntoId: true, memberCustomerId: true } },
      company: { select: { tenantId: true, systemId: true, archivedAt: true, mergedIntoId: true } },
    },
  });
  if (!a || a.revokedAt) return null;
  // มติผู้คุมงาน C3.5 รอบ 4 (SF1): ใช้ได้เมื่อ "รับคำเชิญแล้ว" หรือ "คำเชิญยังไม่หมดอายุ" — ทุกทาง (mint · อ่าน session · สลับบริษัท · REST)
  //   จึงตามกติกาเดียวกัน (สิทธิ์ที่ถูกล้างเพราะตัวตนเปลี่ยน/คำเชิญหมด = ใช้ไม่ได้จนกว่าจะเชิญใหม่)
  if (!a.acceptedAt && !(a.inviteExpiresAt && a.inviteExpiresAt.getTime() > Date.now())) return null;
  const c = a.contact;
  const co = a.company;
  if (!c || c.tenantId !== a.tenantId || c.systemId !== a.systemId || c.archivedAt || c.mergedIntoId) return null;
  if (!co || co.tenantId !== a.tenantId || co.systemId !== a.systemId || co.archivedAt || co.mergedIntoId) return null;
  const [link, sys, member] = await Promise.all([
    // CRM C5.4-B ▸ L1-M2: ลิงก์บริษัทที่จบแล้ว (endedAt = ออกจากบริษัท) = ใช้พอร์ทัลของบริษัทนั้นไม่ได้
    prisma.crmCompanyContact.findFirst({ where: { tenantId: a.tenantId, companyId: a.companyId, contactId: a.contactId, endedAt: null }, select: { id: true, startedAt: true } }),
    prisma.appSystem.findFirst({ where: { id: a.systemId, tenantId: a.tenantId, type: "CRM" }, select: { settings: true } }),
    c.memberCustomerId
      ? prisma.customer.findFirst({ where: { id: c.memberCustomerId, tenantId: a.tenantId, status: "ACTIVE" }, select: { id: true } })
      : Promise.resolve({ id: "" }),
  ]);
  if (!link || !sys || !member) return null;
  // CRM C5.4-B ▸ hunter H1: สิทธิ์ที่เกิดก่อนลิงก์บริษัทรอบปัจจุบัน (ออกแล้วถูกเพิ่มกลับ) = สิทธิ์ของ "งานเก่า" — ต้องเชิญใหม่
  //   (เวลาอ้างอิง = ล่าสุดของ รับคำเชิญ/เชิญ · เชิญใหม่หลังเพิ่มกลับ = ใช้ได้) · session ที่ออกก่อน startedAt ถูกปฏิเสธที่ getPortalSession
  const since = link.startedAt ? link.startedAt.getTime() : 0;
  const grantedAt = Math.max(a.acceptedAt ? a.acceptedAt.getTime() : 0, a.invitedAt ? a.invitedAt.getTime() : 0);
  if (since && grantedAt < since) return null;
  const crm = isObj(sys.settings) && isObj(sys.settings.crm) ? sys.settings.crm : {};
  const portal = isObj(crm.portal) ? crm.portal : {};
  if (crm.uiVersion !== 2 || portal.enabled !== true) return null;
  return { id: a.id, tenantId: a.tenantId, systemId: a.systemId, companyId: a.companyId, contactId: a.contactId, role: String(a.role), linkStartedAt: link.startedAt ?? null };
}

/**
 * ออก session พอร์ทัลให้ access หนึ่ง (หลังรับคำเชิญ · หลัง OTP/LINE · สลับบริษัท · harness ของ QC)
 * สิทธิ์ใช้ไม่ได้ = CustomerAuthError ข้อความกลาง (ไม่มีแถว session) · ขยับ `lastLoginAt` ของ access
 */
export async function mintPortalSession(
  portalAccessId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<PortalSessionToken> {
  if (!portalSecretReady()) throw new CustomerAuthError(PORTAL_NOT_READY);
  const a = await portalAccessUsable(portalAccessId);
  if (!a) throw new CustomerAuthError(PORTAL_ACCESS_FAIL);
  const token = `${PORTAL_TOKEN_PREFIX}${randomToken(32)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PORTAL_SESSION_TTL_MS);
  const ipHash = portalIpHash(meta?.ip);
  const row = await prisma.$transaction(async (tx) => {
    const s = await tx.portalSession.create({
      data: {
        tenantId: a.tenantId,
        portalAccessId: a.id,
        crmContactId: a.contactId,
        crmSystemId: a.systemId,
        tokenHash: sha256(token),
        userAgent: trimmed(meta?.userAgent).slice(0, 300) || null,
        ipHash,
        expiresAt,
      },
      select: { id: true },
    });
    await tx.crmPortalAccess.update({ where: { id: a.id }, data: { lastLoginAt: now } });
    return s;
  });
  return {
    token,
    cookieName: portalCookieName(),
    sessionId: row.id,
    portalAccessId: a.id,
    companyId: a.companyId,
    crmContactId: a.contactId,
    crmSystemId: a.systemId,
    tenantId: a.tenantId,
    expiresAt,
  };
}

/** อ่าน session พอร์ทัลจาก token — หมดอายุ/ถูกเพิกถอน/สิทธิ์ใช้ไม่ได้/ไม่ใช่ token พอร์ทัล = null เงียบ ๆ */
export async function getPortalSession(token: string): Promise<PortalSessionInfo | null> {
  const t = trimmed(token);
  if (!isPortalToken(t)) return null;
  const row = await prisma.portalSession.findUnique({ where: { tokenHash: sha256(t) } });
  if (!row || row.revokedAt || row.expiresAt < new Date()) return null;
  const a = await portalAccessUsable(row.portalAccessId);
  if (!a || a.tenantId !== row.tenantId || a.systemId !== row.crmSystemId || a.contactId !== row.crmContactId) return null;
  // CRM C5.4-B ▸ hunter H1: session ที่ออกก่อนลิงก์บริษัทรอบปัจจุบันเริ่ม = ของรอบเก่า (ออก→เพิ่มกลับ) ⇒ ใช้ไม่ได้
  //   (เผื่อ 2 วิ: createdAt มาจากนาฬิกาฐาน · startedAt จากนาฬิกาแอป — session เก่าจริงเก่ากว่านี้มาก และทางเพิ่มกลับเพิกถอนให้อยู่แล้ว)
  if (a.linkStartedAt && row.createdAt.getTime() < a.linkStartedAt.getTime() - 2_000) return null;
  return {
    sessionId: row.id,
    tenantId: row.tenantId,
    crmSystemId: row.crmSystemId,
    portalAccessId: a.id,
    companyId: a.companyId,
    crmContactId: a.contactId,
    role: a.role,
    expiresAt: row.expiresAt,
  };
}

/** ออกจากระบบพอร์ทัล (ใบเดียว) — เรียกซ้ำได้ */
export async function revokePortalSession(token: string): Promise<{ ok: true }> {
  const t = trimmed(token);
  if (isPortalToken(t)) {
    await prisma.portalSession.updateMany({ where: { tokenHash: sha256(t), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  return { ok: true };
}

/** เพิกถอนทุก session ของ access หนึ่ง (พนักงานถอนสิทธิ์ · PDPA) — คืนจำนวนใบที่ถูกเพิกถอน */
export async function revokeAllPortalSessions(accessId: string): Promise<number> {
  const r = await prisma.portalSession.updateMany({ where: { portalAccessId: trimmed(accessId), revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count;
}

/**
 * ขอรหัส OTP สำหรับพอร์ทัล — **ถังเดียวกับสมาชิกทุกใบ** (`customer-otp:target:<tenant>:<CH>:<target>` · `customer-otp:ip:<ip>`)
 * `isKnown` (ฝั่ง CRM ตัดสิน) = ปลายทางนี้มีสิทธิ์พอร์ทัลที่ใช้ได้ไหม — รู้จัก = ส่งอีเมลนอกเส้นทางคำขอ · ไม่รู้จัก = ออกใบเหมือนกัน
 * (ใบนั้นยืนยันไม่ผ่านตลอดกาล) ⇒ คำตอบรูปเดียว เวลาใกล้กัน (X7.2)
 */
export async function requestPortalOtp(
  tenant: { id: string; name: string },
  input: RequestOtpInput,
  opts: { ip?: string | null; isKnown: (channel: "PHONE" | "EMAIL", target: string) => Promise<boolean> },
): Promise<RequestOtpResult> {
  const { channel, target } = otpTargetOf(input);
  const ip = await hitOtpAskBuckets(tenant.id, channel, target, opts?.ip);
  const known = await opts.isKnown(channel, target).catch(() => false);
  const otpId = `${PORTAL_OTP_PREFIX}${randomToken(18)}`;
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const code = await createOtpRow({ id: otpId, tenantId: tenant.id, channel, target, customerId: null, ip, expiresAt });
  if (known && channel === "EMAIL") {
    await sendOtpMailOffPath(target, `รหัสเข้าพอร์ทัลลูกค้า ${tenant.name}`, `รหัสยืนยันสำหรับเข้าพอร์ทัลลูกค้าของ ${tenant.name} คือ ${code} (ใช้ได้ 5 นาที)`);
  }
  return { otpId, expiresAt, maskedTo: maskTarget(target, channel), ...(otpPreviewOn() ? { devOtp: code } : {}) };
}

/**
 * ยืนยัน OTP ของพอร์ทัล → session พอร์ทัล (ถังยืนยัน/นับครั้งผิด/ใบใช้ครั้งเดียว = ของสมาชิกชุดเดิม)
 * `resolveAccess` (ฝั่ง CRM) = access ที่ปลายทางนี้เข้าได้ในร้านของใบ OTP · ไม่มี/ใช้ไม่ได้ = ข้อความเดียวกับรหัสผิด (X8.4)
 * 🔴 ใบถูกใช้แบบมีเงื่อนไข (`usedAt IS NULL`) ⇒ ยิงรหัสเดียวกันพร้อมกันได้ session ใบเดียว
 */
export async function verifyPortalOtp(
  input: { otpId: string; code: string },
  meta: { userAgent?: string | null; ip?: string | null },
  resolveAccess: (otp: { tenantId: string; channel: "PHONE" | "EMAIL"; target: string }) => Promise<string | null>,
): Promise<PortalSessionToken> {
  const { row, ok, keys, now } = await openOtp(input, meta);
  if (!ok || !row.id.startsWith(PORTAL_OTP_PREFIX) || row.customerId) return failOtp(row.id);
  const accessId = await resolveAccess({ tenantId: row.tenantId, channel: row.channel === "PHONE" ? "PHONE" : "EMAIL", target: row.target });
  if (!accessId || !(await portalAccessUsable(accessId))) throw new CustomerAuthError(VERIFY_FAIL);
  const spent = await prisma.customerOtp.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  if (spent.count !== 1) throw new CustomerAuthError(VERIFY_FAIL);
  for (const k of keys) await resetRateLimitDb(k);
  try {
    return await mintPortalSession(accessId, meta);
  } catch {
    throw new CustomerAuthError(VERIFY_FAIL);
  }
}

/**
 * ด่านของการรับคำเชิญ (X7.4 · มติผู้คุมงานรอบ 3): ถังของตัวเอง `portal-invite:<tenant>:<ip>` 10 ครั้ง/15 นาที บน `checkRateLimitDb`
 * นับ **ทุกครั้ง** ที่มีคนยื่น token (ไม่ใช่เฉพาะครั้งที่ผิด) ⇒ เดา token ต่อเนื่องจาก IP เดียวได้ไม่เกินเพดาน · แยกจากถังยืนยัน OTP
 * (คนที่พิมพ์รหัส OTP ผิดไม่ควรเสียโควตารับคำเชิญ และกลับกัน)
 */
export async function hitPortalInviteLimit(tenantId: string, ip: string | null | undefined): Promise<void> {
  // CRM C3.9 ▸ AUDIT-CLASS X8: กุญแจถังเก็บ **ค่าแฮชของ IP** ไม่ใช่ IP ดิบ (มติผู้คุมงาน C3.8+C3.9 — finding ของข้อสอบ S5.3) ·
  //   ผูกกับชื่อถังในแฮช ⇒ ค่าเดียวกันเทียบข้ามถังไม่ได้ · เพดาน/หน้าต่างเดิม (ถังเดิมของ IP ดิบหมดอายุเองใน 15 นาที) ◂
  //   NOTE รีวิว C3.9: ใช้ HMAC ชุดกุญแจเดียวกับพอร์ทัล (`portalIpHash` · `portal-ip:v1:<SESSION_SECRET>`) — sha256 เปล่าของ IP เดาย้อนได้
  //   (พื้นที่ IPv4 เล็ก) · ไม่มีกุญแจ (พอร์ทัลไม่เปิดอยู่แล้ว) = ถอยไป sha256 เพื่อไม่ให้ IP ดิบลงคีย์ ◂
  const raw = trimmed(ip);
  const k = raw ? (portalIpHash(raw) ?? sha256(`portal-invite:ip:${raw}`)).slice(0, 32) : "";
  await hit(`portal-invite:${trimmed(tenantId) || "-"}:${k || "unknown"}`, RL_VERIFY_PER_IP, RL_VERIFY_WINDOW_MS, (mins) => `ลองเปิดลิงก์เชิญบ่อยเกินไป — รออีกประมาณ ${mins} นาทีแล้วลองใหม่อีกครั้ง`);
}

export type PortalPageSession = { slug: string; tenantId: string; tenantName: string; token: string; session: PortalSessionInfo };

/**
 * ด่านของทุกหน้า `/b/<slug>/*` ที่ต้องล็อกอิน — ไม่มี session พอร์ทัล (หรือเป็นของร้านอื่น) = พาไป `loginPath`
 * 🔴 ไม่แตะคุกกี้พนักงานหรือคุกกี้สมาชิกเลย · `loginPath` มาจากผู้เรียก (ค่าคงที่ PORTAL_BASE_PATH ของ CRM มีที่เดียว)
 */
export async function requirePortalSession(slug: string, loginPath: string): Promise<PortalPageSession> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const token = jar.get(portalCookieName())?.value ?? "";
  const session = token ? await getPortalSession(token) : null;
  const go = async (): Promise<never> => {
    const { redirect } = await import("next/navigation");
    redirect(loginPath);
    throw new CustomerAuthError("ต้องเข้าสู่ระบบพอร์ทัลก่อนจึงจะเปิดหน้านี้ได้");
  };
  if (!session) return go();
  const tenant = await prisma.tenant.findUnique({ where: { slug: trimmed(slug) }, select: { id: true, name: true } });
  if (!tenant || tenant.id !== session.tenantId) return go();
  return { slug: trimmed(slug), tenantId: tenant.id, tenantName: tenant.name, token, session };
}

/** อายุเก็บแถว PortalSession ที่หมดอายุ/ถูกเพิกถอนแล้ว ก่อนงานกวาดลบทิ้ง (30 วัน — เผื่อสอบสวนย้อนหลัง) */
export const PORTAL_SESSION_RETAIN_DAYS = 30;

/**
 * งานกวาด `crm.portal.sessions.sweep` (รายวัน · ช่อง 03:00 ไทย · ทะเบียน C0.5): ลบแถว PortalSession ที่ **หมดอายุ** หรือ
 * **ถูกเพิกถอน** มาแล้วเกิน 30 วัน (นับจาก `now`) · session ที่ยังใช้ได้ไม่ถูกแตะ
 * AUDIT-CLASS X5: คำสั่ง `DELETE … WHERE` คำสั่งเดียว (ไม่อ่านแล้วค่อยลบ) ⇒ สองรอบซ้อนกันได้ผลเดียวกัน (รอบหลังลบ 0 แถว) ·
 * เริ่มใหม่ได้ทุกเมื่อ · `tenantId` = จำกัดร้าน (ข้อสอบ/เครื่องมือ) · ไม่ส่ง = ทุกร้าน
 */
export async function sweepPortalSessions(now: Date = new Date(), opts: { tenantId?: string | null } = {}): Promise<number> {
  const cut = new Date(now.getTime() - PORTAL_SESSION_RETAIN_DAYS * 24 * 60 * 60_000);
  const r = await prisma.portalSession.deleteMany({
    where: { ...(opts.tenantId ? { tenantId: opts.tenantId } : {}), OR: [{ expiresAt: { lt: cut } }, { revokedAt: { lt: cut } }] },
  });
  return r.count;
}

/** token พอร์ทัลจากคุกกี้ของคำขอนี้ (route `/api/files` · หน้า) — ไม่มี = "" */
export async function portalTokenFromCookies(): Promise<string> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get(portalCookieName())?.value ?? "";
  } catch {
    return "";
  }
}
// ◂ CRM C3.5

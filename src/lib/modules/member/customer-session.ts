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

import { otpCode, randomToken, sha256 } from "@/lib/core/hash";
import { checkRateLimit, resetRateLimit } from "@/lib/core/rate-limit";
import { prisma } from "./db";
import type { MemberActor } from "./access";
import type { MemberCtx } from "./profile";

// ───────────────────────── ค่าคงที่ของสัญญา ─────────────────────────

const OTP_TTL_MS = 5 * 60_000; // อายุรหัส 5 นาที
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000; // อายุ session ลูกค้า 30 วัน
const MAX_OTP_ATTEMPTS = 5; // กรอกผิดครบ 5 ครั้ง = ใบนั้นตาย (แม้รหัสถูกก็ใช้ไม่ได้)
const RL_WINDOW_MS = 10 * 60_000;
const RL_PER_TARGET = 3; // ต่อเบอร์/อีเมล 3 ครั้ง / 10 นาที
const RL_PER_IP = 10; // ต่อ ip 10 ครั้ง / 10 นาที

/** ชื่อ cookie ของลูกค้า — HTTPS ใช้ `__Host-` (Secure + Path=/ + ไม่มี Domain) */
export function customerCookieName(): string {
  return (process.env.APP_ENV ?? "development") !== "development" ? "__Host-shark_customer" : "shark_customer";
}

/** โชว์รหัสบนจอได้ไหม (dev/preview/QC) — production ไม่มีวันคืนรหัสกลับไปให้ผู้เรียก */
function otpPreviewOn(): boolean {
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

function hit(key: string, limit: number): void {
  rateKeys.add(key);
  const r = checkRateLimit(key, { limit, windowMs: RL_WINDOW_MS });
  if (!r.ok) {
    const mins = Math.max(1, Math.ceil((r.retryAfterSec ?? 60) / 60));
    throw new CustomerRateLimitError(
      `ขอรหัสยืนยันบ่อยเกินไป — รออีกประมาณ ${mins} นาทีแล้วลองใหม่อีกครั้ง`,
    );
  }
}

/** ล้างตัวนับของ QC เท่านั้น (ล้างเฉพาะถังของไฟล์นี้ ไม่แตะถังของโมดูลอื่น) */
export async function __resetCustomerOtpLimit(): Promise<void> {
  for (const k of rateKeys) resetRateLimit(k);
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
  opts: { ip?: string | null } = {},
): Promise<RequestOtpResult> {
  const tenant = await tenantBySlug(tenantSlug);
  const phone = normPhone(trimmed(input?.phone));
  const email = trimmed(input?.email).toLowerCase();
  if (!phone && !email) throw new CustomerAuthError("กรอกเบอร์โทรหรืออีเมลที่ให้ไว้กับร้านก่อน จึงจะขอรหัสได้");
  const channel: "PHONE" | "EMAIL" = phone ? "PHONE" : "EMAIL";
  const target = phone || email;

  hit(`customer-otp:target:${tenant.id}:${channel}:${target}`, RL_PER_TARGET);
  const ip = trimmed(opts?.ip);
  if (ip) hit(`customer-otp:ip:${ip}`, RL_PER_IP);

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
  const code = otpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.customerOtp.create({
    data: {
      id: otpId,
      tenantId: tenant.id,
      target,
      channel,
      codeHash: sha256(`${otpId}:${code}`),
      expiresAt,
      customerId: customer?.id ?? null,
      ip: ip || null,
    },
  });

  // ส่งจริงเฉพาะเมื่อรู้จักปลายทาง — ส่งไม่ออกห้ามทำให้คำขอล้ม (ผู้ใช้จะเห็นแค่ "ส่งแล้ว" เหมือนกันหมด)
  if (customer && channel === "EMAIL") {
    try {
      const { sendEmail } = await import("@/lib/core/email");
      await sendEmail(target, `รหัสเข้าสู่ระบบสมาชิก ${tenant.name}`, `รหัสยืนยันของคุณคือ ${code} (ใช้ได้ 5 นาที)`);
    } catch {
      // ส่งอีเมลไม่ออก = ผู้ใช้กดขอใหม่ได้ — ห้ามโยนต่อ (และห้าม log รหัส)
    }
  }
  // หนี้: ยังไม่มีผู้ให้บริการ SMS ในระบบ ⇒ ช่องทางเบอร์ส่งจริงไม่ได้จนกว่าจะต่อ gateway (M3.2)

  return {
    otpId,
    expiresAt,
    maskedTo: maskTarget(target, channel),
    ...(otpPreviewOn() ? { devOtp: code } : {}),
  };
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
  const token = randomToken(32);
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
  const otpId = trimmed(input?.otpId);
  const code = trimmed(input?.code);
  if (!otpId || !code) throw new CustomerAuthError(VERIFY_FAIL);

  const row = await prisma.customerOtp.findUnique({ where: { id: otpId } });
  const now = new Date();
  if (!row || row.usedAt || row.expiresAt < now || row.attempts >= MAX_OTP_ATTEMPTS) {
    throw new CustomerAuthError(VERIFY_FAIL);
  }
  const ok = row.codeHash === sha256(`${otpId}:${code}`);
  if (!ok || !row.customerId) {
    await prisma.customerOtp.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new CustomerAuthError(VERIFY_FAIL);
  }
  const customer = await prisma.customer.findFirst({
    where: { id: row.customerId, tenantId: row.tenantId, status: { in: ["ACTIVE", "SUSPENDED"] } },
    select: { id: true, tenantId: true },
  });
  if (!customer) throw new CustomerAuthError(VERIFY_FAIL);

  await prisma.customerOtp.update({ where: { id: row.id }, data: { usedAt: now } });
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
  const customer = await prisma.customer.findFirst({
    where: { id: identity.customerId, tenantId: tenant.id, status: { in: ["ACTIVE", "SUSPENDED"] } },
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
  const customer = await prisma.customer.findUnique({
    where: { id: trimmed(customerId) },
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
  const customer = await prisma.customer.findFirst({
    where: { id: row.customerId, tenantId: row.tenantId, status: { in: ["ACTIVE", "SUSPENDED"] } },
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

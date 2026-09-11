// join.ts — "สมัครสมาชิกด้วยตัวเอง" จากลิงก์ของร้าน (M3.10 · พิมพ์เขียว §3.10 §8 · D4 · D6 · D10)
//
// ทางเข้าเดียวของการสมัครฝั่งลูกค้า — มีผู้เรียก 2 ทาง ที่ต้องได้ผลเหมือนกันทุกประการ:
//   1) REST เลนสาธารณะ `/api/v1/member/join/{tenantSlug}/*` (ops/join.ts · ไม่ต้องมีคีย์ · เพดานต่อ IP)
//   2) หน้า LIFF `/m/[slug]/join` (M3.11 · server action `join-actions.ts`)
// ⇒ ตรรกะทั้งหมดอยู่ที่นี่ ห้ามเขียนซ้ำที่ชั้นหน้า/REST
//
// ขั้นตอน 4 ขั้น (ทุกขั้นรับ `tenantSlug` — ลูกค้าไม่มีทางรู้ id ของร้าน):
//   joinForm   → ฟอร์มที่ร้านตั้ง (ฟิลด์ที่ลูกค้ากรอกเองได้/ที่บังคับ · ช่องทางยินยอม 4 · นโยบายฉบับปัจจุบัน · แต้มต้อนรับ)
//   startJoin  → ขอรหัส OTP ไปที่เบอร์/อีเมล (+ นับคนเปิดลิงก์ `?src=`) — **ไม่เผยว่ามีสมาชิกคนนี้หรือยัง**
//   verifyJoin → ยืนยันรหัส: เป็นสมาชิกอยู่แล้ว = ออก session (`cs_…`) ให้เลย · ยังไม่เป็น = ออก "ตั๋วสมัคร" (`jt_…` · 15 นาที)
//   completeJoin → ใช้ตั๋วสมัคร + ข้อมูลในฟอร์ม → สมาชิกใหม่ (source LIFF) + ยินยอม + นโยบาย + ผู้แนะนำ + แต้มต้อนรับ → session
//
// 🔴 ตั๋วสมัครเก็บเป็นแถว `CustomerOtp` (channel `JOIN_PHONE`/`JOIN_EMAIL` · ใบนี้ห้ามมี migration)
//    เก็บแต่ hash ของตั๋ว · ใช้ได้ครั้งเดียว · **ข้อมูลผิด = ตั๋วยังใช้ได้** (ตรวจทุกอย่างก่อนสร้างสมาชิก
//    และเผาตั๋วหลังสร้างสำเร็จเท่านั้น) ⇒ ลูกค้าที่กรอกวันเกิดผิดรูปแบบไม่ต้องขอ OTP ใหม่
// 🔴 เบอร์/อีเมลของสมาชิกใหม่มาจาก **ตั๋ว** (ที่ยืนยัน OTP แล้ว) เท่านั้น — ไม่รับจากฟอร์ม
//    (ไม่งั้นคนยืนยันเบอร์ตัวเองแล้วสมัครด้วยเบอร์คนอื่นได้)
// 🔴 `lineUserId` จากเนื้อคำขอ **ไม่ถูกเชื่อ**: ผูก LINE กับสมาชิกเฉพาะเมื่อผู้เรียกฝั่ง server ตรวจ id_token
//    ของ LIFF แล้วส่งมาทาง `meta.verifiedLineUserId` (ถ้าเชื่อค่าจากเนื้อคำขอ ใครก็ผูก LINE ของคนอื่น
//    เข้ากับบัญชีตัวเองได้ แล้วเจ้าของ LINE ตัวจริงจะล็อกอินเข้าบัตรของคนนั้น) · ค่าที่ไม่ได้ตรวจเก็บไว้ใน
//    `sourceDetail.lineUserIdUnverified` ให้พนักงานผูกเองภายหลัง
// 🔴 ข้อความผิดพลาดทุกตัวเป็นไทยที่ไม่โทษลูกค้า · ไม่มีข้อมูลส่วนตัวในบันทึก

import { randomToken, sha256 } from "@/lib/core/hash";
import { getChannel } from "@/lib/core/channels";
import * as point from "@/lib/modules/point";
import { prisma } from "./db";
import type { MemberActor } from "./access";
import { CustomerAuthError, mintCustomerSession, requestOtp } from "./customer-session";
import { MemberInputError } from "./errors";
import { listLayout, type FieldDef } from "./fields";
import { acceptPolicy, currentPolicy } from "./privacy";
import { createMember, linkIdentity, type MemberCtx } from "./profile";
import { hit as hitSourceLink } from "./sources";
import { resolveLoyaltySystems } from "./api/loyalty";

// ───────────────────────── ค่าคงที่ของสัญญา ─────────────────────────

/** คำนำหน้าตั๋วสมัคร — แยกออกจาก session (`cs_`) และคีย์ API (`shark_`) ได้ตั้งแต่ตาเห็น */
export const JOIN_TOKEN_PREFIX = "jt_";
/** อายุตั๋วสมัคร 15 นาที (ยืนยันเบอร์แล้วต้องกรอกฟอร์มให้จบในเวลานี้) */
const JOIN_TTL_MS = 15 * 60_000;
/** กรอกรหัสผิดครบ 5 ครั้ง = รหัสใบนั้นใช้ไม่ได้อีก (กติกาเดียวกับหน้าเข้าสู่ระบบ M2.9) */
const MAX_OTP_ATTEMPTS = 5;
/** ช่องทางยินยอมที่ฟอร์มสมัครถาม (ภาพ 29 — 4 สวิตช์) */
export const JOIN_CONSENT_CHANNELS = ["LINE", "EMAIL", "SMS", "PUSH"] as const;

const VERIFY_FAIL = "รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว — กดขอรหัสใหม่แล้วลองอีกครั้ง";
const TICKET_FAIL = "ขั้นยืนยันเบอร์หมดเวลาแล้ว หรือสมัครด้วยลิงก์นี้ไปแล้ว — ขอรหัสยืนยันใหม่อีกครั้ง";

/**
 * ฟิลด์ที่ฟอร์มสมัครไม่ถาม — เบอร์/อีเมลมาจากขั้นยืนยัน OTP · ที่เหลือเป็นงานหลังร้าน
 * (ที่มา · ผู้ดูแล · หมายเหตุ · แท็ก · สาขาหลัก · LINE id · รูป)
 */
const NOT_ASKED_KEYS = new Set([
  "phone", "email", "memberCode", "source", "sourceChannel", "ownerUserId", "note", "tags", "homeUnitId", "lineUserId", "avatar",
]);
/** ฟิลด์ที่ต้องมีเสมอไม่ว่าร้านจะตั้งอะไร — สมาชิกที่ไม่มีชื่อ พนักงานเรียกไม่ถูก */
const ALWAYS_REQUIRED = new Set(["firstName"]);
/** ค่าที่ `createMember` รับเป็นช่องบนสุด (ที่เหลือส่งผ่าน `fields`) */
const TOP_LEVEL_KEYS = ["firstName", "lastName", "nickname", "birthDate", "gender"] as const;

/** ผู้กระทำของการสมัครด้วยตัวเอง — สร้างสมาชิกได้อย่างเดียว (ไม่มีคีย์สิทธิ์อื่น · ไม่มีขอบเขตสาขา) */
const JOIN_ACTOR: MemberActor = {
  userId: "",
  role: "STAFF",
  unitAccess: ["*"],
  permissions: { "member.customer.create": true },
};

// ───────────────────────── ชนิดข้อมูล ─────────────────────────

export type JoinTarget = { tenantId: string; tenantName: string; slug: string; systemId: string };

export type JoinFieldDto = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  description: string | null;
  choices: { value: string; label: string }[];
};

export type JoinConsentDto = { channel: string; label: string };

export type JoinFormDto = {
  shopName: string;
  fields: JoinFieldDto[];
  consents: JoinConsentDto[];
  /** เวอร์ชันนโยบายที่ต้องส่งกลับมาตอนสมัคร (0 = ร้านยังไม่ได้เผยแพร่นโยบาย) */
  policyVersion: number;
  policyHtml: string | null;
  /** แต้มต้อนรับที่จะได้เมื่อสมัครสำเร็จ (0 = ร้านไม่ได้ตั้ง) */
  welcomePoints: number;
  referralEnabled: boolean;
};

export type StartJoinInput = {
  phone?: string | null;
  email?: string | null;
  /** รหัสลิงก์ `?src=` — ตรงกับลิงก์ที่เปิดอยู่ = นับคนเปิด 1 ครั้ง */
  src?: string | null;
  /** โค้ดผู้แนะนำ `?ref=` — ขั้นนี้รับไว้เฉย ๆ (ตรวจจริงตอน complete) */
  referralCode?: string | null;
};

export type StartJoinResult = { otpId: string; expiresAt: Date; maskedTo: string; devOtp?: string };

export type VerifyJoinResult =
  | { existing: false; joinToken: string; expiresAt: Date }
  | { existing: true; token: string; customerId: string; memberCode: string; expiresAt: Date };

export type CompleteJoinInput = {
  joinToken: string;
  fields?: Record<string, unknown>;
  consents?: { channel: string; granted: boolean }[];
  referralCode?: string | null;
  policyVersion?: number | null;
  src?: string | null;
  /** ค่าจากเนื้อคำขอ — ไม่ถูกเชื่อ (ดูหัวไฟล์) */
  lineUserId?: string | null;
  device?: { fingerprint?: string | null } | null;
};

export type JoinMeta = {
  ip?: string | null;
  userAgent?: string | null;
  /** LINE user id ที่ผู้เรียกฝั่ง server ตรวจ id_token แล้ว — มีค่านี้เท่านั้นจึงผูก LINE ให้ */
  verifiedLineUserId?: string | null;
};

export type CompleteJoinResult = {
  customerId: string;
  memberCode: string;
  /** session ของลูกค้า (`cs_…`) — หน้า LIFF ตั้งเป็น cookie · แอป/REST ใช้เป็น Bearer */
  token: string;
  expiresAt: Date;
  /** แต้มต้อนรับที่เข้ากระเป๋าจริง (0 = ร้านไม่ได้ตั้ง หรือเป็นสมาชิกอยู่แล้ว) */
  welcomePoints: number;
  /** false = เบอร์นี้เป็นสมาชิกอยู่แล้ว (ไม่ได้สร้างใหม่ · ได้ session ของคนเดิม) */
  created: boolean;
};

// ───────────────────────── ตัวช่วย ─────────────────────────

function trimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** ร้าน + ระบบสมาชิกที่รับสมัครจาก slug — ไม่มี = โยนข้อความไทย (REST ตอบ 404) */
export async function resolveJoinTarget(tenantSlug: string): Promise<JoinTarget> {
  const slug = trimmed(tenantSlug);
  const tenant = slug ? await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } }) : null;
  if (!tenant) throw new CustomerAuthError("ไม่พบร้านนี้ — ตรวจลิงก์ที่ร้านส่งให้อีกครั้ง");
  const system = await prisma.appSystem.findFirst({
    where: { tenantId: tenant.id, type: "MEMBER", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!system) throw new CustomerAuthError("ร้านนี้ยังไม่ได้เปิดรับสมัครสมาชิกออนไลน์ — สอบถามพนักงานที่ร้านได้เลย");
  return { tenantId: tenant.id, tenantName: tenant.name, slug: tenant.slug ?? slug, systemId: system.id };
}

function ctxOf(t: JoinTarget): MemberCtx {
  return { tenantId: t.tenantId, systemId: t.systemId, actorUserId: null };
}

/** ฟิลด์ที่ฟอร์มสมัครถาม = ไม่อ่อนไหว · ไม่ใช่งานหลังร้าน · (ลูกค้ากรอกเองได้ หรือร้านบังคับ) · ชนิดที่กรอกบนมือถือได้ */
async function joinFields(ctx: MemberCtx): Promise<FieldDef[]> {
  const layout = await listLayout({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null }, {});
  const out: FieldDef[] = [];
  for (const section of layout.sections) {
    if (section.sensitive) continue;
    for (const f of section.fields) {
      if (f.sensitive || NOT_ASKED_KEYS.has(f.key)) continue;
      if (f.type === "FILE" || f.type === "LOOKUP") continue;
      if (!f.customerEditable && !f.required && !ALWAYS_REQUIRED.has(f.key)) continue;
      out.push(f);
    }
  }
  return out;
}

function toFieldDto(f: FieldDef): JoinFieldDto {
  return {
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required || ALWAYS_REQUIRED.has(f.key),
    description: f.description,
    choices: (f.options.choices ?? []).map((c) => ({ value: c.value, label: c.label })),
  };
}

/** ฟิลด์ชื่อที่ต้องมีเสมอ — ร้านที่ลบฟิลด์ระบบทิ้ง/ไม่ได้ backfill ก็ยังถามชื่อได้ */
const NAME_FALLBACK: JoinFieldDto[] = [
  { key: "firstName", label: "ชื่อ", type: "TEXT", required: true, description: null, choices: [] },
  { key: "lastName", label: "นามสกุล", type: "TEXT", required: false, description: null, choices: [] },
];

function withNameFields(list: JoinFieldDto[]): JoinFieldDto[] {
  const keys = new Set(list.map((f) => f.key));
  const missing = NAME_FALLBACK.filter((f) => !keys.has(f.key));
  return [...missing, ...list];
}

/** แต้มต้อนรับตามกฎ "โบนัสเหตุการณ์ SIGNUP" ของระบบแต้มที่ผูกสาขาเดียวกับระบบสมาชิกนี้ */
async function welcomePointsOf(ctx: MemberCtx): Promise<{ points: number; pointSystemId: string | null }> {
  try {
    const sys = await resolveLoyaltySystems(ctx);
    if (!sys.pointSystemId) return { points: 0, pointSystemId: null };
    const settings = await point.getPointSettings(ctx.tenantId);
    if (!settings.active) return { points: 0, pointSystemId: sys.pointSystemId };
    const rules = await point.listRules({ tenantId: ctx.tenantId, systemId: sys.pointSystemId, memberSystemId: ctx.systemId });
    let total = 0;
    for (const r of rules) {
      if (!r.active || r.kind !== "EVENT_BONUS") continue;
      const cfg = r.config as { event?: unknown; points?: unknown };
      if (cfg.event !== "SIGNUP") continue;
      const n = typeof cfg.points === "number" ? cfg.points : Number(cfg.points ?? 0);
      if (Number.isFinite(n) && n > 0) total += Math.round(n);
    }
    return { points: total, pointSystemId: sys.pointSystemId };
  } catch {
    // ระบบแต้มอ่านไม่ได้ = ไม่โฆษณาแต้ม (ดีกว่าบอกว่าได้แล้วไม่ได้จริง)
    return { points: 0, pointSystemId: null };
  }
}

function ticketId(token: string): string {
  return `join_${sha256(token).slice(0, 40)}`;
}

function isEmailTarget(target: string): boolean {
  return target.includes("@");
}

// ───────────────────────── (ก) ฟอร์ม ─────────────────────────

/** ฟอร์มสมัครของร้าน (ไม่ต้องล็อกอิน · ไม่มีข้อมูลของใครเลย) */
export async function joinForm(tenantSlug: string): Promise<JoinFormDto> {
  const target = await resolveJoinTarget(tenantSlug);
  const ctx = ctxOf(target);
  const [fields, policy, welcome, referralEnabled] = await Promise.all([
    joinFields(ctx),
    currentPolicy(ctx),
    welcomePointsOf(ctx),
    referralProgramEnabled(ctx),
  ]);
  return {
    shopName: target.tenantName,
    fields: withNameFields(fields.map(toFieldDto)),
    consents: JOIN_CONSENT_CHANNELS.map((c) => ({ channel: c, label: getChannel(c)?.label ?? c })),
    policyVersion: policy?.version ?? 0,
    policyHtml: policy?.bodyHtml ?? null,
    welcomePoints: welcome.points,
    referralEnabled,
  };
}

/** โปรแกรมแนะนำเพื่อนเปิดอยู่ไหม — dynamic import: referrals → voucher/point facade → … → โมดูลนี้ = วงกลมตอนโหลดไฟล์ */
async function referralProgramEnabled(ctx: MemberCtx): Promise<boolean> {
  try {
    const { getProgram } = await import("./referrals");
    return (await getProgram(ctx)).enabled;
  } catch {
    return false;
  }
}

// ───────────────────────── (ข) ขอรหัส ─────────────────────────

/**
 * ขอรหัส OTP สำหรับสมัคร — ใช้กติกา/เพดานตัวเดียวกับหน้าเข้าสู่ระบบ (`customer-session.requestOtp`)
 * 🔴 ไม่เผยว่ามีสมาชิกคนนี้หรือยัง: ผลของเบอร์ใหม่กับเบอร์ที่เป็นสมาชิกแล้วหน้าตาเหมือนกันทุกช่อง
 */
export async function startJoin(tenantSlug: string, input: StartJoinInput, meta: JoinMeta = {}): Promise<StartJoinResult> {
  const target = await resolveJoinTarget(tenantSlug);
  const src = trimmed(input?.src);
  // นับคนเปิดลิงก์ (ภาพ 29 ขั้นต้อนรับ) — นับไม่ได้ไม่ใช่เหตุให้สมัครไม่ได้
  if (src) await hitSourceLink(target.slug, src).catch(() => null);
  const res = await requestOtp(target.slug, { phone: input?.phone ?? null, email: input?.email ?? null }, { ip: meta.ip ?? null });
  return {
    otpId: res.otpId,
    expiresAt: res.expiresAt,
    maskedTo: res.maskedTo,
    ...(res.devOtp ? { devOtp: res.devOtp } : {}),
  };
}

// ───────────────────────── (ค) ยืนยันรหัส ─────────────────────────

/**
 * ยืนยันรหัส OTP ของการสมัคร
 * - เบอร์/อีเมลนี้เป็นสมาชิกอยู่แล้ว → `{ existing: true, token }` (ออก session ให้เลย ไม่สร้างซ้ำ)
 * - ยังไม่เป็น → `{ existing: false, joinToken }` ใช้ต่อที่ `completeJoin` ภายใน 15 นาที
 * ผิดครบ 5 ครั้ง = รหัสใบนั้นใช้ไม่ได้อีก (ต้องขอใหม่) · ใบที่ใช้แล้วใช้ซ้ำไม่ได้
 */
export async function verifyJoin(
  tenantSlug: string,
  input: { otpId: string; code: string },
  meta: JoinMeta = {},
): Promise<VerifyJoinResult> {
  const target = await resolveJoinTarget(tenantSlug);
  const otpId = trimmed(input?.otpId);
  const code = trimmed(input?.code);
  if (!otpId || !code) throw new CustomerAuthError(VERIFY_FAIL);

  const row = await prisma.customerOtp.findUnique({ where: { id: otpId } });
  const now = new Date();
  if (
    !row ||
    row.tenantId !== target.tenantId ||
    (row.channel !== "PHONE" && row.channel !== "EMAIL") ||
    row.usedAt ||
    row.expiresAt < now ||
    row.attempts >= MAX_OTP_ATTEMPTS
  ) {
    throw new CustomerAuthError(VERIFY_FAIL);
  }
  if (row.codeHash !== sha256(`${otpId}:${code}`)) {
    await prisma.customerOtp.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new CustomerAuthError(VERIFY_FAIL);
  }
  // จองใบนี้แบบอะตอมมิก (กดยืนยันซ้ำสองแท็บพร้อมกัน = ได้ผลแค่ครั้งเดียว)
  const claim = await prisma.customerOtp.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  if (claim.count !== 1) throw new CustomerAuthError(VERIFY_FAIL);

  // เป็นสมาชิกอยู่แล้วไหม — ตอนขอรหัสอาจยังไม่เป็น แต่สมัครจากอีกเครื่องไปแล้วระหว่างนั้น ⇒ ถามใหม่ ณ ตอนนี้
  const existing = await prisma.customer.findFirst({
    where: {
      tenantId: target.tenantId,
      status: { in: ["ACTIVE", "SUSPENDED"] },
      ...(row.customerId ? { id: row.customerId } : row.channel === "PHONE" ? { phone: row.target } : { email: row.target }),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, memberCode: true },
  });
  if (existing) {
    const session = await mintCustomerSession(existing.id, { ip: meta.ip ?? null, userAgent: meta.userAgent ?? null });
    return { existing: true, token: session.token, customerId: existing.id, memberCode: existing.memberCode ?? "", expiresAt: session.expiresAt };
  }

  const joinToken = `${JOIN_TOKEN_PREFIX}${randomToken(32)}`;
  const expiresAt = new Date(now.getTime() + JOIN_TTL_MS);
  await prisma.customerOtp.create({
    data: {
      id: ticketId(joinToken),
      tenantId: target.tenantId,
      target: row.target,
      channel: row.channel === "PHONE" ? "JOIN_PHONE" : "JOIN_EMAIL",
      codeHash: sha256(joinToken),
      expiresAt,
      customerId: null,
      ip: trimmed(meta.ip) || null,
    },
  });
  return { existing: false, joinToken, expiresAt };
}

// ───────────────────────── (ง) สมัคร ─────────────────────────

type Ticket = { id: string; target: string; channel: string };

async function loadTicket(target: JoinTarget, joinToken: string): Promise<Ticket> {
  const token = trimmed(joinToken);
  if (!token.startsWith(JOIN_TOKEN_PREFIX)) throw new CustomerAuthError(TICKET_FAIL);
  const row = await prisma.customerOtp.findUnique({ where: { id: ticketId(token) } });
  if (
    !row ||
    row.tenantId !== target.tenantId ||
    (row.channel !== "JOIN_PHONE" && row.channel !== "JOIN_EMAIL") ||
    row.codeHash !== sha256(token) ||
    row.usedAt ||
    row.expiresAt < new Date()
  ) {
    throw new CustomerAuthError(TICKET_FAIL);
  }
  return { id: row.id, target: row.target, channel: row.channel };
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

/** ตรวจค่าในฟอร์มกับฟิลด์ที่ร้านเปิดให้กรอก — คืนค่าที่แยกช่องบนสุด/ฟิลด์แล้ว (โยนข้อความไทยเมื่อไม่ผ่าน) */
function validateFields(
  allowed: JoinFieldDto[],
  raw: Record<string, unknown> | undefined,
): { top: Partial<Record<(typeof TOP_LEVEL_KEYS)[number], string>>; rest: Record<string, unknown> } {
  const values = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const byKey = new Map(allowed.map((f) => [f.key, f]));
  for (const key of Object.keys(values)) {
    if (!byKey.has(key)) {
      throw new MemberInputError(`ช่อง "${key}" ไม่อยู่ในแบบฟอร์มสมัครของร้านนี้ — โหลดหน้าสมัครใหม่แล้วลองอีกครั้ง`);
    }
  }
  const missing = allowed.filter((f) => f.required && isBlank(values[f.key]));
  if (missing.length > 0) {
    throw new MemberInputError(`กรุณากรอก ${missing.map((f) => `«${f.label}»`).join(" · ")} ให้ครบก่อนกดสมัคร`);
  }
  const top: Partial<Record<(typeof TOP_LEVEL_KEYS)[number], string>> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (isBlank(value)) continue;
    if ((TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      top[key as (typeof TOP_LEVEL_KEYS)[number]] = String(value).trim();
      continue;
    }
    rest[key] = value;
  }
  return { top, rest };
}

function cleanConsents(raw: CompleteJoinInput["consents"]): { channel: string; granted: boolean; source: string }[] {
  const out: { channel: string; granted: boolean; source: string }[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    const channel = String(c?.channel ?? "").trim().toUpperCase();
    if (!(JOIN_CONSENT_CHANNELS as readonly string[]).includes(channel)) {
      throw new MemberInputError(`ช่องทาง "${String(c?.channel ?? "")}" ไม่อยู่ในรายการความยินยอมของฟอร์มสมัคร — เลือกได้ LINE · อีเมล · SMS · แจ้งเตือนในแอป`);
    }
    if (!out.some((x) => x.channel === channel)) out.push({ channel, granted: c?.granted === true, source: "LIFF" });
  }
  return out;
}

/**
 * สมัครสมาชิกให้เสร็จ — ใช้ตั๋วสมัครจาก `verifyJoin`
 * ลำดับตายตัว: ตั๋ว → ฟอร์ม → นโยบาย → สร้างสมาชิก (ผู้แนะนำ/ยินยอม/ที่มา อยู่ใน createMember) → แต้มต้อนรับ
 *              → ยอมรับนโยบาย → ผูก LINE (ถ้าตรวจแล้ว) → เผาตั๋ว → session
 * ข้อมูลผิดทุกกรณีโยนก่อน "สร้างสมาชิก" ⇒ ตั๋วยังใช้ต่อได้
 */
export async function completeJoin(tenantSlug: string, input: CompleteJoinInput, meta: JoinMeta = {}): Promise<CompleteJoinResult> {
  const target = await resolveJoinTarget(tenantSlug);
  const ctx = ctxOf(target);
  const ticket = await loadTicket(target, input?.joinToken ?? "");

  const allowed = withNameFields((await joinFields(ctx)).map(toFieldDto));
  const { top, rest } = validateFields(allowed, input?.fields);

  const policy = await currentPolicy(ctx);
  const currentVersion = policy?.version ?? 0;
  const sentVersion = typeof input?.policyVersion === "number" ? input.policyVersion : Number(input?.policyVersion ?? Number.NaN);
  if (sentVersion !== currentVersion) {
    throw new MemberInputError(
      currentVersion > 0
        ? `นโยบายความเป็นส่วนตัวของร้านมีฉบับใหม่ (ฉบับที่ ${currentVersion}) — อ่านฉบับล่าสุดแล้วกดยอมรับอีกครั้ง`
        : "ร้านนี้ยังไม่ได้ประกาศนโยบายความเป็นส่วนตัว — โหลดหน้าสมัครใหม่แล้วลองอีกครั้ง",
    );
  }
  const consents = cleanConsents(input?.consents);

  const src = trimmed(input?.src);
  const unverifiedLine = trimmed(input?.lineUserId);
  const verifiedLine = trimmed(meta.verifiedLineUserId);
  const sourceDetail: Record<string, unknown> = { via: "join" };
  if (src) sourceDetail.linkCode = src;
  if (unverifiedLine && !verifiedLine) sourceDetail.lineUserIdUnverified = unverifiedLine;

  const byEmail = ticket.channel === "JOIN_EMAIL" || isEmailTarget(ticket.target);
  const created = await createMember(ctx, JOIN_ACTOR, {
    phone: byEmail ? null : ticket.target,
    email: byEmail ? ticket.target : null,
    firstName: top.firstName ?? null,
    lastName: top.lastName ?? null,
    nickname: top.nickname ?? null,
    birthDate: top.birthDate ?? null,
    gender: top.gender ?? null,
    fields: rest,
    consents,
    source: "LIFF",
    sourceDetail,
    sourceChannel: verifiedLine ? "LINE" : null,
    referralCode: trimmed(input?.referralCode) || null,
    device: { fingerprint: trimmed(input?.device?.fingerprint) || null, phone: byEmail ? null : ticket.target },
    idempotencyKey: ticket.id,
  });

  // "คนนี้สมัครด้วยตั๋วใบนี้" — สร้างใหม่รอบนี้ หรือรอบก่อนสร้างไปแล้วแต่ขั้นท้าย ๆ ล้ม (ตั๋วยังไม่ถูกเผา)
  // ⇒ ขั้นหลังสมัครทุกขั้นข้างล่าง idempotent จึงเดินซ้ำได้ · เบอร์ที่เป็นสมาชิกมาก่อน = ไม่แตะอะไรของเขาเลย
  const ours =
    created.created ||
    (await prisma.customer.findFirst({
      where: { id: created.customerId, sourceDetail: { path: ["idempotencyKey"], equals: ticket.id } },
      select: { id: true },
    })) !== null;

  // แต้มต้อนรับ — เฉพาะคนที่สมัครด้วยตั๋วนี้ · คีย์กันซ้ำผูกกับตัวสมาชิก (ยิงซ้ำ = ไม่บวกซ้ำ)
  let welcomePoints = 0;
  if (ours) {
    const welcome = await welcomePointsOf(ctx);
    if (welcome.points > 0 && welcome.pointSystemId) {
      try {
        const pctx = { tenantId: ctx.tenantId, systemId: welcome.pointSystemId, memberSystemId: ctx.systemId, actorUserId: null };
        const quote = await point.computeEarn(pctx, { customerId: created.customerId, event: "SIGNUP" });
        if (quote.points > 0) {
          await point.earnWithLot(pctx, {
            customerId: created.customerId,
            points: quote.points,
            refType: "MemberJoin",
            refId: created.customerId,
            idempotencyKey: `join-welcome:${created.customerId}`,
            breakdown: quote.breakdown,
            reason: "แต้มต้อนรับสมาชิกใหม่",
          });
          welcomePoints = quote.points;
        }
      } catch {
        // สมัครสำเร็จแล้ว — แต้มต้อนรับพลาดต้องไม่ทำให้การสมัครล้ม (หน้า done บอกแต้มตามจริง = 0)
      }
    }
    if (currentVersion > 0) {
      await acceptPolicy(ctx, created.customerId, currentVersion, "LIFF").catch(() => null);
    }
    if (verifiedLine) {
      await linkIdentity(ctx, { channel: "LINE", externalId: verifiedLine, phone: byEmail ? null : ticket.target, verified: true }).catch(() => null);
    }
  }

  await prisma.customerOtp.updateMany({
    where: { id: ticket.id, usedAt: null },
    data: { usedAt: new Date(), customerId: created.customerId },
  });
  const session = await mintCustomerSession(created.customerId, { ip: meta.ip ?? null, userAgent: meta.userAgent ?? null });
  return {
    customerId: created.customerId,
    memberCode: created.memberCode,
    token: session.token,
    expiresAt: session.expiresAt,
    welcomePoints,
    created: created.created,
  };
}

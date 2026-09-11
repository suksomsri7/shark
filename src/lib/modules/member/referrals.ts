// referrals.ts — แนะนำเพื่อน (M3.5 · พิมพ์เขียว docs/modules/06-member-v2.md D6 §4.3 §5.10 §7.1 §11.7 · ภาพ 24 · 08 ขวา)
//
// ── วงจรของ 1 การแนะนำ ─────────────────────────────────────────────────────
//   สมาชิก A แชร์ลิงก์ `/ref/<โค้ด>` → เพื่อน B สมัครด้วยโค้ด (`createMember({referralCode})` / LIFF join)
//   → `attach` บันทึก Referral PENDING (หรือ REJECTED ตามกติกากันโกง §11.7)
//   → `evaluateConversion` ตามเงื่อนไขของร้าน: SIGNUP = ทันที · FIRST_PURCHASE = บิลที่ถึงขั้นต่ำ
//   → `rewardBoth` จ่ายรางวัลสองฝั่ง (แต้ม/voucher ตามโปรแกรม) → REWARDED
//
// ── ใครเรียกอะไร ─────────────────────────────────────────────────────────────
//   • `profile.createMember` เรียก `onMemberJoined` **ทันทีหลังสมัค** (ผู้แนะนำเห็นในไทม์ไลน์ทันที ·
//     SIGNUP ได้รางวัลทันที) · คิว `member.created` เรียกซ้ำเป็นตาข่ายเก็บตก (ทุกขั้น idempotent)
//   • คิว `pos.sale.paid` → `src/lib/member-bridges.ts` → `onSalePaid` (ซื้อครั้งแรกถึงขั้นต่ำ)
//
// ── กติกาที่ห้ามหัก ──────────────────────────────────────────────────────────
// 1) **จ่ายครั้งเดียวต่อเพื่อน 1 คน**: unique(tenantId, refereeCustomerId) + แต้มใช้ idempotencyKey
//    `referral:<id>:referrer|referee` + voucher กันซ้ำด้วย originRef {referralId, side} (voucher.issue)
//    ⇒ เรียกซ้ำกี่รอบ (คิว retry · สองทางเข้าพร้อมกัน) ก็ไม่จ่ายเพิ่ม
// 2) **เพดานรายเดือนของผู้แนะนำ** ตัดสินใต้ advisory lock ต่อผู้แนะนำ แล้ว "จอง" ผลไว้ในแถว
//    (referrerRewardRef) ก่อนจ่าย — สองบิลเข้าพร้อมกันจะไม่ทะลุเพดาน (บทเรียนตัวนับร่วม)
//    เดือน = เดือนไทย (UTC+7) · ชนเพดาน = เพื่อนยังได้ ผู้แนะนำไม่ได้ (`{capped: true}`)
// 3) โมดูลแต้ม/voucher เรียกผ่าน facade `index.ts` เท่านั้น (fitness F2)
// 4) ข้อความ error ภาษาไทย ไม่โทษผู้ใช้ · สิทธิ์ตั้งค่า/ปฏิเสธ = `member.referral.manage`

import type { Prisma } from "@prisma/client";
import { emitOutbox } from "@/lib/core/outbox";
import { writeAudit } from "@/lib/core/audit";
import { randomCode } from "@/lib/core/hash";
import { publicOrigin } from "@/lib/core/origin";
import * as party from "@/lib/modules/party";
import { earnWithLot, getPointSettings, resolvePointSystemIds } from "@/lib/modules/point";
import { issue as issueVoucher, VOUCHER_SYSTEM_ACTOR } from "@/lib/modules/voucher";
import { prisma } from "./db";
import { canReadMember, coversUnit, hasMemberPerm, isUnitScoped, type MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import type { MemberCtx } from "./privacy";
import {
  REFERRAL_DEFAULTS,
  REFERRAL_DEFAULT_VALUE,
  REFERRAL_LIMITS,
  referralPath,
  renderShareText,
  rewardLabel,
  type AttachResult,
  type EvaluateResult,
  type LeaderboardRow,
  type ListReferralsResult,
  type ReferralCodeView,
  type ReferralConvertOn,
  type ReferralMemberView,
  type ReferralProgramDto,
  type ReferralRewardKindValue,
  type ReferralRewardRef,
  type ReferralRewardValue,
  type ReferralRowView,
  type ReferralStats,
  type ReferralStatusValue,
  type ReferralVoucherValue,
  type RewardBothResult,
  type SetReferralProgramInput,
} from "./referrals-shared";

type Tx = Prisma.TransactionClient;

const DAY_MS = 86_400_000;
const BKK_OFFSET_MS = 7 * 3_600_000;
const CODE_ALPHABET = "ACDEFGHJKLMNPQRSTUVWXY3456789"; // ชุดเดียวกับ profile.createMember (ไม่มี 0/O/1/I/B/8 ที่อ่านสับสน)
const NOT_FOUND_MSG = "ไม่พบสมาชิกคนนี้ในระบบสมาชิกที่เปิดอยู่ (อาจอยู่คนละสาขาหรือถูกลบไปแล้ว)";

// ───────────────────────── ตัวช่วยเล็ก ๆ ─────────────────────────

const asJson = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v ?? {})) as Prisma.InputJsonValue;

function objOf(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function refOf(v: unknown): ReferralRewardRef | null {
  const o = objOf(v);
  if (!o) return null;
  const kind = o.kind === "VOUCHER" ? "VOUCHER" : o.kind === "POINTS" ? "POINTS" : null;
  if (!kind && o.capped !== true) return null;
  return {
    kind: kind ?? "POINTS",
    ...(typeof o.ledgerId === "string" ? { ledgerId: o.ledgerId } : {}),
    ...(typeof o.voucherId === "string" ? { voucherId: o.voucherId } : {}),
    ...(typeof o.points === "number" ? { points: o.points } : {}),
    ...(typeof o.valueSatang === "number" ? { valueSatang: o.valueSatang } : {}),
    ...(typeof o.label === "string" ? { label: o.label } : {}),
    ...(o.capped === true ? { capped: true } : {}),
    ...(typeof o.skipped === "string" ? { skipped: o.skipped } : {}),
  };
}

/**
 * ตัวเลขจากค่าที่ส่งมา — **ค่าว่าง/undefined/null = ใช้ค่าปริยาย** (`Number("")` = 0 คือบั๊กจริงของ M3.3)
 * ตัวเลขใช้ไม่ได้ (NaN) = null ให้ผู้เรียกโยนข้อความของตัวเอง
 */
function numOrDefault(v: unknown, def: number | null): number | null {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return def;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

function displayName(c: { name: string | null; firstName: string | null; lastName: string | null; nickname?: string | null }): string {
  return (c.name ?? "").trim() || [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || (c.nickname ?? "").trim() || "สมาชิก";
}

/** วันแรกของเดือนไทยปัจจุบัน (เป็นเวลา UTC จริงของเที่ยงคืนไทยวันที่ 1) */
function thaiMonthStart(now: Date): Date {
  const bkk = new Date(now.getTime() + BKK_OFFSET_MS);
  return new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), 1) - BKK_OFFSET_MS);
}

const baht = (satang: number): string => (Math.round(satang) / 100).toLocaleString("th-TH", { maximumFractionDigits: 0 });

function requireManage(actor: MemberActor): void {
  if (!hasMemberPerm(actor, "member.referral.manage")) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์จัดการโปรแกรมแนะนำเพื่อน — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

function requireRead(actor: MemberActor): void {
  if (!canReadMember(actor)) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ดูข้อมูลสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

/** ตัวกรองขอบเขตสาขา (§6.1) ของรายการแนะนำ — ยึดสาขาหลักของ "ผู้แนะนำ" */
function unitFilter(actor: MemberActor): Prisma.ReferralWhereInput {
  if (actor.role === "CUSTOMER" || !isUnitScoped(actor)) return {};
  return { referrer: { homeUnitId: { in: actor.unitAccess } } };
}

// ───────────────────────── โปรแกรม (D6 · ร้านตั้งค่าได้) ─────────────────────────

function parsePoints(raw: unknown, strict: boolean): ReferralRewardValue | null {
  const o = objOf(raw);
  const n = numOrDefault(o?.points, strict ? null : 300);
  if (n === null || !Number.isInteger(n) || n < 0 || n > REFERRAL_LIMITS.pointsMax) {
    if (strict) throw new MemberInputError(`จำนวนแต้มรางวัลต้องเป็นจำนวนเต็ม 0–${REFERRAL_LIMITS.pointsMax.toLocaleString("th-TH")} — แก้ตัวเลขแล้วบันทึกอีกครั้ง`);
    return null;
  }
  return { points: n };
}

function parseVoucher(raw: unknown, strict: boolean): ReferralRewardValue | null {
  const o = objOf(raw);
  const kind = o?.kind === "PERCENT" ? "PERCENT" : o?.kind === "FIXED" ? "FIXED" : null;
  const value = numOrDefault(o?.value, strict ? null : 100);
  const validDays = numOrDefault(o?.validDays, 30);
  const fail = (msg: string): null => {
    if (strict) throw new MemberInputError(msg);
    return null;
  };
  if (!kind) return fail("ยังไม่ได้เลือกแบบของ voucher รางวัล — เลือกส่วนลดเป็นบาทหรือเปอร์เซ็นต์");
  if (value === null || !Number.isInteger(value) || value <= 0) return fail("มูลค่า voucher รางวัลต้องเป็นจำนวนเต็มมากกว่า 0 — แก้ตัวเลขแล้วบันทึกอีกครั้ง");
  if (kind === "PERCENT" && value > 100) return fail("ส่วนลดเปอร์เซ็นต์ต้องอยู่ระหว่าง 1–100 — แก้ตัวเลขแล้วบันทึกอีกครั้ง");
  if (validDays === null || !Number.isInteger(validDays) || validDays < 1 || validDays > REFERRAL_LIMITS.voucherValidDaysMax) {
    return fail(`อายุ voucher รางวัลต้องเป็น 1–${REFERRAL_LIMITS.voucherValidDaysMax} วัน — แก้ตัวเลขแล้วบันทึกอีกครั้ง`);
  }
  return { kind, value, validDays };
}

function parseReward(kind: ReferralRewardKindValue, raw: unknown, strict: boolean): ReferralRewardValue | null {
  return kind === "POINTS" ? parsePoints(raw, strict) : parseVoucher(raw, strict);
}

function kindOf(v: unknown): ReferralRewardKindValue | null {
  return v === "POINTS" || v === "VOUCHER" ? v : null;
}

type ProgramRow = {
  enabled: boolean;
  referrerRewardKind: ReferralRewardKindValue;
  referrerRewardValue: Prisma.JsonValue;
  refereeRewardKind: ReferralRewardKindValue;
  refereeRewardValue: Prisma.JsonValue;
  convertOn: string;
  minFirstPurchaseSatang: number | null;
  monthlyCap: number | null;
  fraudPhoneDevice: boolean;
  shareText: string;
  updatedAt: Date;
};

function programDto(row: ProgramRow | null): ReferralProgramDto {
  if (!row) {
    return {
      enabled: REFERRAL_DEFAULTS.enabled,
      referrerRewardKind: REFERRAL_DEFAULTS.referrerRewardKind,
      referrerRewardValue: { ...REFERRAL_DEFAULTS.referrerRewardValue },
      refereeRewardKind: REFERRAL_DEFAULTS.refereeRewardKind,
      refereeRewardValue: { ...REFERRAL_DEFAULTS.refereeRewardValue },
      convertOn: REFERRAL_DEFAULTS.convertOn,
      minFirstPurchaseSatang: REFERRAL_DEFAULTS.minFirstPurchaseSatang,
      monthlyCap: REFERRAL_DEFAULTS.monthlyCap,
      fraudPhoneDevice: REFERRAL_DEFAULTS.fraudPhoneDevice,
      shareText: REFERRAL_DEFAULTS.shareText,
      saved: false,
      updatedAt: null,
    };
  }
  // ค่าที่เก็บไว้ผิดรูป (แก้มือใน DB/เวอร์ชันเก่า) → ใช้ค่าปริยายของชนิดนั้น ไม่ให้หน้าจอพัง
  const referrerValue = parseReward(row.referrerRewardKind, row.referrerRewardValue, false) ?? { ...REFERRAL_DEFAULT_VALUE[row.referrerRewardKind] };
  const refereeValue = parseReward(row.refereeRewardKind, row.refereeRewardValue, false) ?? { ...REFERRAL_DEFAULT_VALUE[row.refereeRewardKind] };
  return {
    enabled: row.enabled,
    referrerRewardKind: row.referrerRewardKind,
    referrerRewardValue: referrerValue,
    refereeRewardKind: row.refereeRewardKind,
    refereeRewardValue: refereeValue,
    convertOn: row.convertOn === "SIGNUP" ? "SIGNUP" : "FIRST_PURCHASE",
    minFirstPurchaseSatang: row.minFirstPurchaseSatang,
    monthlyCap: row.monthlyCap,
    fraudPhoneDevice: row.fraudPhoneDevice,
    shareText: row.shareText,
    saved: true,
    updatedAt: row.updatedAt,
  };
}

/** โปรแกรมของระบบสมาชิกนี้ — ยังไม่เคยตั้ง = ค่าปริยาย (ปิดอยู่) */
export async function getProgram(ctx: MemberCtx): Promise<ReferralProgramDto> {
  const row = await prisma.referralProgram.findUnique({ where: { systemId: ctx.systemId } });
  if (row && row.tenantId !== ctx.tenantId) return programDto(null);
  return programDto(row);
}

/** บันทึกโปรแกรม (ส่งเฉพาะช่องที่จะแก้ก็ได้) — ต้องมีสิทธิ์ `member.referral.manage` */
export async function setProgram(ctx: MemberCtx, actor: MemberActor, input: SetReferralProgramInput): Promise<ReferralProgramDto> {
  requireManage(actor);
  const cur = await getProgram(ctx);
  const next: ReferralProgramDto = { ...cur };
  const has = (k: keyof SetReferralProgramInput): boolean => input[k] !== undefined;

  if (has("enabled")) next.enabled = input.enabled === true;

  if (has("convertOn")) {
    const v = String(input.convertOn ?? "");
    if (v !== "SIGNUP" && v !== "FIRST_PURCHASE") {
      throw new MemberInputError("เงื่อนไขการให้รางวัลต้องเป็น “เพื่อนสมัครสมาชิก” หรือ “เพื่อนซื้อครั้งแรก” — เลือกจากตัวเลือกที่มี");
    }
    next.convertOn = v as ReferralConvertOn;
  }

  for (const side of ["referrer", "referee"] as const) {
    const kindKey = side === "referrer" ? "referrerRewardKind" : "refereeRewardKind";
    const valueKey = side === "referrer" ? "referrerRewardValue" : "refereeRewardValue";
    if (has(kindKey)) {
      const k = kindOf(input[kindKey]);
      if (!k) throw new MemberInputError("ชนิดรางวัลต้องเป็นแต้มหรือ voucher — เลือกจากตัวเลือกที่มี");
      if (k !== next[kindKey]) {
        next[kindKey] = k;
        // สลับชนิดแต่ไม่ได้ส่งค่ามา = เริ่มจากค่าปริยายของชนิดใหม่ (ค่าเดิมคนละรูปใช้ต่อไม่ได้)
        if (!has(valueKey)) next[valueKey] = { ...REFERRAL_DEFAULT_VALUE[k] };
      }
    }
    if (has(valueKey)) {
      next[valueKey] = parseReward(next[kindKey], input[valueKey], true) as ReferralRewardValue;
    }
  }

  if (has("minFirstPurchaseSatang")) {
    const raw = input.minFirstPurchaseSatang;
    const n = raw === null ? null : numOrDefault(raw, null);
    if (n !== null && (!Number.isInteger(n) || n < 0)) {
      throw new MemberInputError("ยอดซื้อครั้งแรกขั้นต่ำต้องเป็นจำนวนเงินตั้งแต่ 0 ขึ้นไป — แก้ตัวเลขแล้วบันทึกอีกครั้ง");
    }
    next.minFirstPurchaseSatang = n;
  }

  if (has("monthlyCap")) {
    const raw = input.monthlyCap;
    const n = raw === null ? null : numOrDefault(raw, null);
    if (n !== null && (!Number.isInteger(n) || n < 0)) {
      throw new MemberInputError("จำนวนครั้งต่อเดือนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป (เว้นว่าง = ไม่จำกัด) — แก้ตัวเลขแล้วบันทึกอีกครั้ง");
    }
    next.monthlyCap = n;
  }

  if (has("fraudPhoneDevice")) next.fraudPhoneDevice = input.fraudPhoneDevice === true;

  if (has("shareText")) {
    const t = String(input.shareText ?? "").trim();
    if (!t) throw new MemberInputError("ข้อความแชร์ยังว่างอยู่ — ใส่ข้อความชวนเพื่อนพร้อม {link} แล้วบันทึกอีกครั้ง");
    if (t.length > REFERRAL_LIMITS.shareTextMax) {
      throw new MemberInputError(`ข้อความแชร์ยาวเกิน ${REFERRAL_LIMITS.shareTextMax} ตัวอักษร — ไลน์จะตัดข้อความ ลองย่อให้สั้นลง`);
    }
    if (!t.includes("{link}")) {
      throw new MemberInputError("ข้อความแชร์ต้องมี {link} เพื่อให้ระบบใส่ลิงก์แนะนำของสมาชิกแต่ละคน — เติม {link} แล้วบันทึกอีกครั้ง");
    }
    next.shareText = t;
  }

  const data = {
    enabled: next.enabled,
    referrerRewardKind: next.referrerRewardKind,
    referrerRewardValue: asJson(next.referrerRewardValue),
    refereeRewardKind: next.refereeRewardKind,
    refereeRewardValue: asJson(next.refereeRewardValue),
    convertOn: next.convertOn,
    minFirstPurchaseSatang: next.minFirstPurchaseSatang,
    monthlyCap: next.monthlyCap,
    fraudPhoneDevice: next.fraudPhoneDevice,
    shareText: next.shareText,
  };
  await prisma.referralProgram.upsert({
    where: { systemId: ctx.systemId },
    create: { tenantId: ctx.tenantId, systemId: ctx.systemId, ...data },
    update: data,
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: "member.referral.program.update",
    targetType: "ReferralProgram",
    targetId: ctx.systemId,
    before: cur.saved ? { ...cur, updatedAt: undefined } : null,
    after: data,
  });
  return getProgram(ctx);
}

// ───────────────────────── โค้ด/ลิงก์ของสมาชิก ─────────────────────────

async function uniqueCode(tenantId: string): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = randomCode(8, CODE_ALPHABET);
    const dup = await prisma.customer.findFirst({ where: { tenantId, referralCode: code }, select: { id: true } });
    if (!dup) return code;
  }
  return randomCode(8, CODE_ALPHABET) + randomCode(4, CODE_ALPHABET);
}

/** โค้ดของสมาชิก (สร้างให้ถ้ายังว่าง — สมาชิกเก่าก่อน v2 ไม่มีโค้ด) */
async function ensureCode(ctx: MemberCtx, customerId: string): Promise<string> {
  const c = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
    select: { id: true, referralCode: true },
  });
  if (!c) throw new MemberNotFoundError(NOT_FOUND_MSG);
  if (c.referralCode) return c.referralCode;
  const code = await uniqueCode(ctx.tenantId);
  // เขียนเฉพาะตอนยังว่าง — สองคำขอพร้อมกันได้โค้ดเดียวกันเสมอ (คนมาทีหลังอ่านของคนแรก)
  await prisma.customer.updateMany({ where: { id: c.id, referralCode: null }, data: { referralCode: code } });
  const fresh = await prisma.customer.findFirst({ where: { id: c.id }, select: { referralCode: true } });
  return fresh?.referralCode ?? code;
}

async function shopName(tenantId: string): Promise<string> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return t?.name ?? "ร้านของเรา";
}

/** โค้ด + ลิงก์ `/ref/<code>` + ข้อความแชร์พร้อมใช้ (แทน {link} ด้วย URL เต็มจากโดเมนที่เปิดอยู่) */
export async function codeFor(ctx: MemberCtx, customerId: string): Promise<ReferralCodeView> {
  const [code, program, shop, origin] = await Promise.all([
    ensureCode(ctx, customerId),
    getProgram(ctx),
    shopName(ctx.tenantId),
    publicOrigin(),
  ]);
  const link = referralPath(code);
  const url = `${origin.replace(/\/$/, "")}${link}`;
  const shareText = renderShareText(program.shareText, {
    shop,
    refereeReward: rewardLabel(program.refereeRewardKind, program.refereeRewardValue),
    link: url,
  });
  return { code, link, url, shareText };
}

/** `/ref/<code>` (สาธารณะ ไม่รู้ร้าน) → slug ของร้านเจ้าของโค้ด · ไม่พบ/กำกวม = null */
export async function resolveReferralLanding(rawCode: string): Promise<{ slug: string; code: string } | null> {
  const code = String(rawCode ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,24}$/.test(code)) return null;
  const rows = await prisma.customer.findMany({ where: { referralCode: code, status: { not: "MERGED" } }, select: { tenantId: true }, take: 2 });
  // โค้ดสุ่ม 8 ตัว unique ต่อร้าน — ชนข้ามร้านได้ในทางทฤษฎี · ชนจริง = ไม่เดาร้าน (ไม่พาเพื่อนไปผิดร้าน)
  if (rows.length !== 1) return null;
  const t = await prisma.tenant.findUnique({ where: { id: rows[0]!.tenantId }, select: { slug: true } });
  return t?.slug ? { slug: t.slug, code } : null;
}

// ───────────────────────── attach (ตอนสมัคร) ─────────────────────────

export type AttachInput = {
  refereeCustomerId: string;
  code: string;
  device?: { fingerprint?: string | null; phone?: string | null } | null;
};

const normPhone = (p: string | null | undefined): string => (p ? party.normalizePartyPhone(p) : "");

function maskPhone(p: string): string {
  return p.length >= 4 ? `${"x".repeat(Math.max(0, p.length - 4))}${p.slice(-4)}` : p;
}

/**
 * ผูกเพื่อนเข้ากับผู้แนะนำ (§11.7)
 * - โค้ดไม่มีจริง → โยน (ยังไม่บันทึกอะไร)
 * - เพื่อนถูกแนะนำแล้ว → คืนแถวเดิม (idempotent · 1 คนถูกแนะนำได้ครั้งเดียวต่อร้าน)
 * - แนะนำตัวเอง / ไม่ใช่สมาชิกใหม่ / เบอร์-อุปกรณ์ซ้ำ → บันทึก REJECTED พร้อมเหตุผล
 * - โปรแกรมปิด → ยังบันทึก PENDING (ร้านเปิดใหม่ภายหลังนับต่อได้) แต่ `evaluateConversion` ไม่แปลง
 */
export async function attach(ctx: MemberCtx, input: AttachInput): Promise<AttachResult> {
  const code = String(input?.code ?? "").trim().toUpperCase();
  const referrer = code
    ? await prisma.customer.findFirst({
        where: { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, referralCode: code, status: { not: "MERGED" } },
      })
    : null;
  if (!referrer) {
    throw new MemberInputError(`ไม่พบรหัสแนะนำเพื่อน "${code || "-"}" ในร้านนี้ — ตรวจตัวอักษรอีกครั้ง`);
  }
  const referee = await prisma.customer.findFirst({ where: { id: input.refereeCustomerId, tenantId: ctx.tenantId } });
  if (!referee) throw new MemberNotFoundError(NOT_FOUND_MSG);

  const existing = await prisma.referral.findFirst({ where: { tenantId: ctx.tenantId, refereeCustomerId: referee.id } });
  if (existing) return { referralId: existing.id, status: existing.status, rejectReason: existing.rejectReason };

  const program = await getProgram(ctx);
  const now = new Date();
  const fingerprint = String(input.device?.fingerprint ?? "").trim().slice(0, 200) || null;
  const devicePhone = normPhone(input.device?.phone ?? null);

  let rejectReason: string | null = null;
  if (referee.id === referrer.id) {
    rejectReason = "แนะนำตัวเองไม่ได้ — โค้ดนี้เป็นของสมาชิกคนเดียวกัน";
  } else {
    const oldMember = referee.createdAt.getTime() < now.getTime() - REFERRAL_LIMITS.newMemberHours * 3_600_000;
    const boughtBefore = oldMember
      ? null
      : await prisma.posSale.findFirst({ where: { tenantId: ctx.tenantId, memberId: referee.id, status: "PAID" }, select: { id: true } });
    if (oldMember || boughtBefore) {
      rejectReason = "ไม่ใช่สมาชิกใหม่ — เพื่อนเป็นสมาชิกหรือเคยซื้อกับร้านก่อนใช้โค้ดแนะนำ";
    } else if (program.fraudPhoneDevice) {
      const referrerPhone = normPhone(referrer.phone);
      const refereePhones = [normPhone(referee.phone), devicePhone].filter(Boolean);
      if (referrerPhone && refereePhones.includes(referrerPhone)) {
        rejectReason = "เบอร์/อุปกรณ์ซ้ำ — เบอร์โทรของเพื่อนตรงกับเบอร์ของผู้แนะนำ";
      } else if (fingerprint) {
        const sameDevice = await prisma.referral.findFirst({
          where: {
            tenantId: ctx.tenantId,
            OR: [{ referrerCustomerId: referrer.id }, { refereeCustomerId: referrer.id }],
            refereeContact: { path: ["fingerprint"], equals: fingerprint },
          },
          select: { id: true },
        });
        if (sameDevice) rejectReason = "เบอร์/อุปกรณ์ซ้ำ — อุปกรณ์เดียวกับที่เคยสมัครด้วยโค้ดของผู้แนะนำคนนี้";
      }
    }
  }

  const contact: Record<string, unknown> = {};
  if (fingerprint) contact.fingerprint = fingerprint;
  const phoneForContact = normPhone(referee.phone) || devicePhone;
  if (phoneForContact) contact.phoneMasked = maskPhone(phoneForContact);
  const status: ReferralStatusValue = rejectReason ? "REJECTED" : "PENDING";
  const refereeName = displayName(referee);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.referral.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: referrer.memberSystemId,
          referrerCustomerId: referrer.id,
          refereeCustomerId: referee.id,
          refereeContact: Object.keys(contact).length ? asJson(contact) : undefined,
          code,
          status,
          rejectReason,
        },
      });
      if (status === "PENDING") {
        // ที่มาของเพื่อน (D10): สมัครผ่าน createMember({referralCode}) ตั้งไว้แล้ว · ทางอื่น (LIFF ผูกทีหลัง) ตั้งที่นี่
        if (!referee.referredById) {
          await tx.customer.update({ where: { id: referee.id }, data: { referredById: referrer.id, source: "REFERRAL" } });
        }
        await tx.memberActivity.create({
          data: {
            tenantId: ctx.tenantId,
            customerId: referrer.id,
            module: "referral",
            type: "REFERRAL_JOINED",
            refType: "Referral",
            refId: row.id,
            summary: `แนะนำเพื่อนสมัครสมาชิกแล้ว — ${refereeName}`.slice(0, 500),
            data: asJson({ refereeId: referee.id, code }),
          },
        });
        await emitOutbox(tx, {
          tenantId: ctx.tenantId,
          type: "referral.joined",
          idempotencyKey: `referral.joined#${row.id}`,
          payload: { referrerId: referrer.id, refereeId: referee.id, referralId: row.id, customerId: referrer.id, code },
          systemId: referrer.memberSystemId,
          unitId: referrer.homeUnitId,
        });
      }
      return row;
    });
    return { referralId: created.id, status: created.status, rejectReason: created.rejectReason };
  } catch (e) {
    // สองทางเข้าพร้อมกัน (สมัคร + คิว member.created) ชน unique → คืนแถวของคนที่มาก่อน
    const again = await prisma.referral.findFirst({ where: { tenantId: ctx.tenantId, refereeCustomerId: referee.id } });
    if (again) return { referralId: again.id, status: again.status, rejectReason: again.rejectReason };
    throw e;
  }
}

// ───────────────────────── แปลง + จ่ายรางวัล ─────────────────────────

export type EvaluateInput = {
  refereeCustomerId: string;
  trigger: "SIGNUP" | "PURCHASE";
  saleId?: string | null;
  netSatang?: number | null;
};

/**
 * เพื่อนถึงเงื่อนไขหรือยัง → ถึง = CONVERTED แล้วจ่ายรางวัลสองฝั่งทันที (REWARDED)
 * FIRST_PURCHASE: บิลที่ชำระแล้วของเพื่อนที่ยอด ≥ ขั้นต่ำ (บิลแรกไม่ถึง → บิลถัดไปที่ถึงก็นับ)
 * โปรแกรมปิด: การแนะนำที่เกิด **ก่อนปิด** ยังนับต่อ 30 วัน (§11.7) · ที่เกิดระหว่างปิด = รอร้านเปิดใหม่
 */
export async function evaluateConversion(ctx: MemberCtx, input: EvaluateInput): Promise<EvaluateResult> {
  const r = await prisma.referral.findFirst({ where: { tenantId: ctx.tenantId, refereeCustomerId: input.refereeCustomerId } });
  if (!r) return { converted: false, rewarded: false, reason: "สมาชิกคนนี้ไม่ได้สมัครผ่านการแนะนำเพื่อน" };
  const rctx: MemberCtx = { tenantId: ctx.tenantId, systemId: r.systemId, actorUserId: ctx.actorUserId };

  if (r.status === "REJECTED") return { converted: false, rewarded: false, referralId: r.id, reason: "การแนะนำนี้ถูกปฏิเสธแล้ว — ไม่มีรางวัลให้จ่าย" };
  if (r.status === "REWARDED") return { converted: true, rewarded: false, referralId: r.id, reason: "จ่ายรางวัลของการแนะนำนี้ไปแล้ว" };
  if (r.status === "CONVERTED") {
    // แปลงแล้วแต่จ่ายไม่ครบ (ครั้งก่อนล้มกลางทาง) → จ่ายต่อให้ครบ (ทุกขั้นกันซ้ำ)
    await rewardBoth(rctx, r.id);
    return { converted: true, rewarded: true, referralId: r.id };
  }

  const program = await getProgram(rctx);
  const now = new Date();
  if (!program.enabled) {
    const closedAt = program.updatedAt;
    const inGrace =
      !!closedAt &&
      program.saved &&
      r.createdAt.getTime() <= closedAt.getTime() &&
      now.getTime() - closedAt.getTime() <= REFERRAL_LIMITS.closedGraceDays * DAY_MS;
    if (!inGrace) {
      return { converted: false, rewarded: false, referralId: r.id, reason: "โปรแกรมแนะนำเพื่อนปิดอยู่ — การแนะนำนี้จะนับเมื่อร้านเปิดโปรแกรมอีกครั้ง" };
    }
  }

  let conversionRef: Record<string, unknown> = { trigger: input.trigger };
  if (program.convertOn === "FIRST_PURCHASE") {
    if (input.trigger === "SIGNUP") {
      return { converted: false, rewarded: false, referralId: r.id, reason: "โปรแกรมให้รางวัลเมื่อเพื่อนซื้อครั้งแรก — รอบิลแรกของเพื่อน" };
    }
    let net = typeof input.netSatang === "number" && Number.isFinite(input.netSatang) ? input.netSatang : null;
    const saleId = input.saleId ? String(input.saleId) : null;
    if (saleId) {
      const sale = await prisma.posSale.findFirst({
        where: { id: saleId, tenantId: ctx.tenantId, memberId: input.refereeCustomerId },
        select: { status: true, grandTotalSatang: true },
      });
      if (!sale || sale.status !== "PAID") {
        return { converted: false, rewarded: false, referralId: r.id, reason: "ยังไม่พบบิลที่ชำระแล้วของเพื่อนคนนี้" };
      }
      net = sale.grandTotalSatang; // ยึดยอดจริงบนบิล ไม่เชื่อตัวเลขที่ส่งมา
    }
    if (net === null) return { converted: false, rewarded: false, referralId: r.id, reason: "ยังไม่มียอดบิลให้ตรวจเงื่อนไข" };
    const min = program.minFirstPurchaseSatang ?? 0;
    if (net < min) {
      return {
        converted: false,
        rewarded: false,
        referralId: r.id,
        reason: `ยอดบิล ฿${baht(net)} ยังไม่ถึงขั้นต่ำ ฿${baht(min)} — รางวัลจะให้เมื่อเพื่อนซื้อบิลที่ถึงขั้นต่ำ`,
      };
    }
    conversionRef = { trigger: input.trigger, ...(saleId ? { saleId } : {}), netSatang: net };
  }

  const moved = await prisma.referral.updateMany({
    where: { id: r.id, status: "PENDING" },
    data: { status: "CONVERTED", convertedAt: now, conversionRef: asJson(conversionRef) },
  });
  if (moved.count === 0) {
    // อีกทางเข้าแปลงไปก่อนแล้ว — ปล่อยให้ทางนั้นจ่าย (ถ้าค้างที่ CONVERTED รอบหน้าจะจ่ายต่อ)
    const fresh = await prisma.referral.findFirst({ where: { id: r.id }, select: { status: true } });
    return { converted: fresh?.status === "CONVERTED" || fresh?.status === "REWARDED", rewarded: false, referralId: r.id, reason: "การแนะนำนี้ถูกแปลงไปแล้ว" };
  }
  await rewardBoth(rctx, r.id);
  return { converted: true, rewarded: true, referralId: r.id };
}

type Side = "referrer" | "referee";

async function payReward(
  r: { id: string; tenantId: string; systemId: string },
  side: Side,
  customerId: string,
  kind: ReferralRewardKindValue,
  value: ReferralRewardValue,
): Promise<ReferralRewardRef> {
  const label = rewardLabel(kind, value);
  const reason = side === "referrer" ? "รางวัลผู้แนะนำเพื่อน" : "รางวัลเพื่อนที่ถูกแนะนำ";
  if (kind === "POINTS") {
    const points = "points" in value ? Math.round(value.points) : 0;
    if (points <= 0) return { kind, points: 0, label, skipped: "รางวัลเป็น 0 แต้ม" };
    const [pointSys] = await resolvePointSystemIds(r.tenantId, r.systemId);
    if (!pointSys) return { kind, points: 0, label, skipped: "ร้านยังไม่ได้เปิดระบบแต้มที่สาขาเดียวกับระบบสมาชิกนี้" };
    const led = await earnWithLot(
      { tenantId: r.tenantId, systemId: pointSys, memberSystemId: r.systemId, actorUserId: null },
      { customerId, points, refType: "REFERRAL", refId: r.id, idempotencyKey: `referral:${r.id}:${side}`, reason },
    );
    return { kind, ledgerId: led.ledgerId, points, label };
  }
  const v = value as ReferralVoucherValue;
  // 🔴 โปรแกรมเก็บ FIXED เป็นบาท (ร้านกรอก "฿100") · ใบ voucher เก็บ FIXED เป็นสตางค์ ⇒ คูณ 100 ที่นี่ที่เดียว
  const voucherValue = v.kind === "FIXED" ? v.value * 100 : v.value;
  const res = await issueVoucher(
    { tenantId: r.tenantId, systemId: r.systemId, actorUserId: null },
    VOUCHER_SYSTEM_ACTOR,
    {
      customerIds: [customerId],
      adhoc: { kind: v.kind, value: voucherValue, validDays: v.validDays },
      origin: "REFERRAL",
      originRef: { referralId: r.id, side },
      reason,
    },
  );
  if ("pending" in res && res.pending) return { kind, label, skipped: "voucher เกินเพดาน — รออนุมัติ" };
  let voucherId = "vouchers" in res ? res.vouchers[0]?.id : undefined;
  if (!voucherId) {
    // ออกไปแล้วรอบก่อน (กันซ้ำด้วย originRef) → หาใบเดิม
    const old = await prisma.voucher.findFirst({
      where: { tenantId: r.tenantId, customerId, origin: "REFERRAL", originRef: { path: ["referralId"], equals: r.id } },
      select: { id: true },
    });
    voucherId = old?.id;
  }
  return { kind, ...(voucherId ? { voucherId } : { skipped: "ออก voucher ไม่สำเร็จ" }), valueSatang: v.kind === "FIXED" ? voucherValue : 0, label };
}

/**
 * จ่ายรางวัลสองฝั่งของการแนะนำที่แปลงแล้ว (idempotent — เรียกซ้ำคืนผลเดิม ไม่จ่ายเพิ่ม)
 * เพดานรายเดือน: ผู้แนะนำได้รางวัลในเดือนไทยนี้ครบ `monthlyCap` แล้ว → เพื่อนยังได้ ผู้แนะนำไม่ได้
 */
export async function rewardBoth(ctx: MemberCtx, referralId: string): Promise<RewardBothResult> {
  const r = await prisma.referral.findFirst({ where: { id: referralId, tenantId: ctx.tenantId } });
  if (!r) throw new MemberNotFoundError("ไม่พบการแนะนำนี้ (อาจถูกลบไปแล้ว)");
  if (r.status === "REJECTED") throw new MemberInputError("การแนะนำนี้ถูกปฏิเสธแล้ว — จ่ายรางวัลไม่ได้");
  if (r.status === "PENDING") throw new MemberInputError("เพื่อนยังไม่ถึงเงื่อนไขของโปรแกรม — ยังจ่ายรางวัลไม่ได้");

  if (r.status === "REWARDED") {
    const a = refOf(r.referrerRewardRef) ?? { kind: "POINTS" as const };
    const b = refOf(r.refereeRewardRef) ?? { kind: "POINTS" as const };
    return { referrer: { kind: a.kind, ref: a }, referee: { kind: b.kind, ref: b }, capped: a.capped === true };
  }

  const rctx: MemberCtx = { tenantId: ctx.tenantId, systemId: r.systemId, actorUserId: ctx.actorUserId };
  const program = await getProgram(rctx);
  const now = new Date();

  // ── ขั้น 1: ตัดสินเพดานของผู้แนะนำใต้ล็อกต่อผู้แนะนำ แล้ว "จอง" ผลไว้ในแถว ──
  //    (ตัดสินแล้วไม่เปลี่ยน: รอบ retry ใช้ค่าที่จองไว้ ไม่นับใหม่)
  const decided = await prisma.$transaction(async (tx: Tx) => {
    // $executeRaw ไม่ใช่ $queryRaw — ฟังก์ชันนี้คืนชนิด void ที่ adapter pg อ่านไม่ได้ (แบบเดียวกับ chat/service.ts)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`referral-cap:${r.referrerCustomerId}`}, 0))`;
    const cur = await tx.referral.findFirst({ where: { id: r.id }, select: { referrerRewardRef: true } });
    const already = refOf(cur?.referrerRewardRef);
    if (already) return already;
    let capped = false;
    if (program.monthlyCap !== null) {
      const rows = await tx.referral.findMany({
        where: {
          tenantId: r.tenantId,
          referrerCustomerId: r.referrerCustomerId,
          id: { not: r.id },
          status: { in: ["CONVERTED", "REWARDED"] },
          convertedAt: { gte: thaiMonthStart(now) },
        },
        select: { referrerRewardRef: true },
      });
      const got = rows.filter((x) => {
        const ref = refOf(x.referrerRewardRef);
        return ref && !ref.capped;
      }).length;
      capped = got >= program.monthlyCap;
    }
    const reserve: ReferralRewardRef = capped
      ? { kind: program.referrerRewardKind, capped: true, label: rewardLabel(program.referrerRewardKind, program.referrerRewardValue) }
      : { kind: program.referrerRewardKind, label: rewardLabel(program.referrerRewardKind, program.referrerRewardValue) };
    await tx.referral.update({ where: { id: r.id }, data: { referrerRewardRef: asJson(reserve) } });
    return reserve;
  });

  // ── ขั้น 2: จ่ายจริง (แต่ละโมดูลกันซ้ำด้วยคีย์ของตัวเอง) ──
  const referrerKind = decided.kind;
  const referrerValue = referrerKind === program.referrerRewardKind ? program.referrerRewardValue : REFERRAL_DEFAULT_VALUE[referrerKind];
  const referrerRef: ReferralRewardRef = decided.capped
    ? decided
    : await payReward(r, "referrer", r.referrerCustomerId, referrerKind, referrerValue);
  const refereeRef: ReferralRewardRef = r.refereeCustomerId
    ? await payReward(r, "referee", r.refereeCustomerId, program.refereeRewardKind, program.refereeRewardValue)
    : { kind: program.refereeRewardKind, skipped: "ไม่พบสมาชิกเพื่อน (อาจถูกลบไปแล้ว)" };

  // ── ขั้น 3: ปิดแถวเป็น REWARDED + ไทม์ไลน์ + event (ครั้งเดียว — guard ที่สถานะ CONVERTED) ──
  await prisma.$transaction(async (tx: Tx) => {
    const done = await tx.referral.updateMany({
      where: { id: r.id, status: "CONVERTED" },
      data: { status: "REWARDED", rewardedAt: now, referrerRewardRef: asJson(referrerRef), refereeRewardRef: asJson(refereeRef) },
    });
    if (done.count === 0) return;
    const referee = r.refereeCustomerId
      ? await tx.customer.findFirst({ where: { id: r.refereeCustomerId }, select: { name: true, firstName: true, lastName: true, nickname: true } })
      : null;
    const who = referee ? displayName(referee) : "เพื่อน";
    const got = referrerRef.capped ? "ครบเพดานรางวัลของเดือนนี้แล้ว (เพื่อนยังได้รางวัล)" : `ได้รับ ${referrerRef.label ?? "รางวัล"}`;
    await tx.memberActivity.create({
      data: {
        tenantId: r.tenantId,
        customerId: r.referrerCustomerId,
        module: "referral",
        type: "REFERRAL_CONVERTED",
        refType: "Referral",
        refId: r.id,
        summary: `แนะนำเพื่อนสำเร็จ 1 คน — ${who} · ${got}`.slice(0, 500),
        data: asJson({ refereeId: r.refereeCustomerId, conversionRef: r.conversionRef, referrer: referrerRef, referee: refereeRef }),
      },
    });
    await emitOutbox(tx, {
      tenantId: r.tenantId,
      type: "referral.converted",
      idempotencyKey: `referral.converted#${r.id}`,
      payload: {
        referrerId: r.referrerCustomerId,
        refereeId: r.refereeCustomerId,
        referralId: r.id,
        customerId: r.referrerCustomerId,
        rewards: { referrer: referrerRef, referee: refereeRef },
      },
      systemId: r.systemId,
    });
  });

  return {
    referrer: { kind: referrerRef.kind, ref: referrerRef },
    referee: { kind: refereeRef.kind, ref: refereeRef },
    capped: referrerRef.capped === true,
  };
}

/** ปฏิเสธการแนะนำ (สงสัยโกง) — จ่ายรางวัลแล้วปฏิเสธไม่ได้ · ต้องมีสิทธิ์ `member.referral.manage` */
export async function reject(ctx: MemberCtx, actor: MemberActor, referralId: string, input: { reason?: string | null }): Promise<{ ok: true }> {
  requireManage(actor);
  const r = await prisma.referral.findFirst({
    where: { id: referralId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    include: { referrer: { select: { homeUnitId: true } } },
  });
  if (!r || !coversUnit(actor, r.referrer.homeUnitId)) throw new MemberNotFoundError("ไม่พบการแนะนำนี้ (อาจอยู่คนละสาขาหรือถูกลบไปแล้ว)");
  if (r.status === "REWARDED") throw new MemberInputError("การแนะนำนี้จ่ายรางวัลแล้ว — ปฏิเสธย้อนหลังไม่ได้ (ปรับแต้ม/ยกเลิก voucher ได้ที่หน้าของสิทธิ์นั้น)");
  if (r.status === "REJECTED") return { ok: true };
  const reason = String(input?.reason ?? "").trim().slice(0, 300) || "ร้านปฏิเสธการแนะนำนี้";
  const moved = await prisma.referral.updateMany({
    where: { id: r.id, status: { in: ["PENDING", "CONVERTED"] } },
    data: { status: "REJECTED", rejectReason: reason },
  });
  if (moved.count === 0) throw new MemberInputError("สถานะของการแนะนำนี้เพิ่งเปลี่ยน — รีเฟรชหน้าแล้วลองใหม่");
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: "member.referral.reject",
    targetType: "Referral",
    targetId: r.id,
    before: { status: r.status },
    after: { status: "REJECTED", reason },
  });
  return { ok: true };
}

// ───────────────────────── รายการ / อันดับ / สถิติ ─────────────────────────

type PartyRow = { id: string; name: string | null; firstName: string | null; lastName: string | null; nickname: string | null; memberCode: string | null };
const PARTY_SELECT = { id: true, name: true, firstName: true, lastName: true, nickname: true, memberCode: true } as const;
const partyView = (c: PartyRow) => ({ id: c.id, name: displayName(c), memberCode: c.memberCode ?? "" });

/** ยอดบิลแรก (ชำระแล้ว) ของแต่ละคน — บิลแรกจริง ไม่ใช่บิลที่ทำให้แปลง */
async function firstPurchases(tenantId: string, customerIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (customerIds.length === 0) return out;
  const rows = await prisma.posSale.findMany({
    where: { tenantId, memberId: { in: customerIds }, status: "PAID" },
    orderBy: { createdAt: "asc" },
    distinct: ["memberId"],
    select: { memberId: true, grandTotalSatang: true },
  });
  for (const s of rows) if (s.memberId) out.set(s.memberId, s.grandTotalSatang);
  return out;
}

export type ListReferralsOptions = {
  status?: ReferralStatusValue | null;
  referrerCustomerId?: string | null;
  take?: number | null;
  cursor?: string | null;
};

export async function listReferrals(ctx: MemberCtx, actor: MemberActor, opts: ListReferralsOptions = {}): Promise<ListReferralsResult> {
  requireRead(actor);
  const takeN = numOrDefault(opts.take, 20);
  const take = Math.min(100, Math.max(1, Number.isFinite(takeN ?? Number.NaN) ? Math.round(takeN as number) : 20));
  const status = opts.status && ["PENDING", "CONVERTED", "REWARDED", "REJECTED"].includes(opts.status) ? opts.status : null;
  const where: Prisma.ReferralWhereInput = {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    ...(status ? { status } : {}),
    ...(opts.referrerCustomerId ? { referrerCustomerId: opts.referrerCustomerId } : {}),
    ...unitFilter(actor),
    ...(actor.role === "CUSTOMER" && actor.customerId ? { referrerCustomerId: actor.customerId } : {}),
  };
  const rows = await prisma.referral.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { referrer: { select: PARTY_SELECT }, referee: { select: PARTY_SELECT } },
  });
  const page = rows.slice(0, take);
  const firsts = await firstPurchases(
    ctx.tenantId,
    page.map((r) => r.refereeCustomerId).filter((x): x is string => !!x),
  );
  const items: ReferralRowView[] = page.map((r) => {
    const a = refOf(r.referrerRewardRef);
    const b = refOf(r.refereeRewardRef);
    return {
      id: r.id,
      referrer: partyView(r.referrer),
      referee: r.referee ? partyView(r.referee) : null,
      refereeContact: objOf(r.refereeContact),
      status: r.status,
      createdAt: r.createdAt,
      convertedAt: r.convertedAt,
      rewardedAt: r.rewardedAt,
      conversionRef: objOf(r.conversionRef),
      rejectReason: r.rejectReason,
      firstPurchaseSatang: r.refereeCustomerId ? (firsts.get(r.refereeCustomerId) ?? null) : null,
      rewards: { ...(a && r.status === "REWARDED" ? { referrer: a } : {}), ...(b ? { referee: b } : {}) },
    };
  });
  return { items, nextCursor: rows.length > take ? (page[page.length - 1]?.id ?? null) : null };
}

const sinceDays = (days: unknown, def: number): Date => {
  const n = numOrDefault(days, def);
  const d = n !== null && Number.isFinite(n) && n > 0 ? Math.min(3650, Math.round(n)) : def;
  return new Date(Date.now() - d * DAY_MS);
};

/** ผู้แนะนำสูงสุด (ภาพ 24) — ไม่นับที่ถูกปฏิเสธ · เรียงตามจำนวนที่สำเร็จ */
export async function leaderboard(ctx: MemberCtx, actor: MemberActor, opts: { days?: number | null; take?: number | null } = {}): Promise<LeaderboardRow[]> {
  requireRead(actor);
  const since = sinceDays(opts.days, 90);
  const takeN = numOrDefault(opts.take, 5);
  const take = Math.min(50, Math.max(1, Number.isFinite(takeN ?? Number.NaN) ? Math.round(takeN as number) : 5));
  const rows = await prisma.referral.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, createdAt: { gte: since }, status: { not: "REJECTED" }, ...unitFilter(actor) },
    select: { referrerCustomerId: true, status: true, referrerRewardRef: true },
    take: 20_000,
  });
  const agg = new Map<string, { referred: number; converted: number; pointsEarned: number; vouchersEarned: number }>();
  for (const r of rows) {
    const a = agg.get(r.referrerCustomerId) ?? { referred: 0, converted: 0, pointsEarned: 0, vouchersEarned: 0 };
    a.referred += 1;
    if (r.status === "CONVERTED" || r.status === "REWARDED") a.converted += 1;
    const ref = r.status === "REWARDED" ? refOf(r.referrerRewardRef) : null;
    if (ref && !ref.capped && !ref.skipped) {
      if (ref.kind === "POINTS") a.pointsEarned += ref.points ?? 0;
      else if (ref.voucherId) a.vouchersEarned += 1;
    }
    agg.set(r.referrerCustomerId, a);
  }
  const top = [...agg.entries()]
    .sort((x, y) => y[1].converted - x[1].converted || y[1].referred - x[1].referred || y[1].pointsEarned - x[1].pointsEarned)
    .slice(0, take);
  const people = await prisma.customer.findMany({ where: { tenantId: ctx.tenantId, id: { in: top.map(([id]) => id) } }, select: PARTY_SELECT });
  const byId = new Map(people.map((p) => [p.id, p]));
  return top.map(([id, a]) => {
    const p = byId.get(id);
    return { customerId: id, name: p ? displayName(p) : "สมาชิก", memberCode: p?.memberCode ?? "", ...a };
  });
}

/** ยอดใช้จ่ายเฉลี่ยใน 90 วันแรกหลังสมัคร (สตางค์/คน) ของกลุ่มคนที่ส่งมา */
async function avgFirst90(tenantId: string, people: { id: string; createdAt: Date }[]): Promise<number> {
  if (people.length === 0) return 0;
  const joined = new Map(people.map((p) => [p.id, p.createdAt.getTime()]));
  const sales = await prisma.posSale.findMany({
    where: { tenantId, memberId: { in: people.map((p) => p.id) }, status: "PAID" },
    select: { memberId: true, grandTotalSatang: true, createdAt: true },
    take: 50_000,
  });
  let total = 0;
  for (const s of sales) {
    const at = s.memberId ? joined.get(s.memberId) : undefined;
    if (at !== undefined && s.createdAt.getTime() - at <= 90 * DAY_MS) total += s.grandTotalSatang;
  }
  return Math.round(total / people.length);
}

/** KPI 4 ช่องของภาพ 24 */
export async function stats(ctx: MemberCtx, actor: MemberActor, opts: { days?: number | null } = {}): Promise<ReferralStats> {
  requireRead(actor);
  const since = sinceDays(opts.days, 90);
  const rows = await prisma.referral.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, createdAt: { gte: since }, status: { not: "REJECTED" }, refereeCustomerId: { not: null }, ...unitFilter(actor) },
    select: { status: true, referrerRewardRef: true, refereeRewardRef: true, referee: { select: { id: true, createdAt: true } } },
    take: 5_000,
  });
  const referred = rows.length;
  const convertedRows = rows.filter((r) => r.status === "CONVERTED" || r.status === "REWARDED");
  const settings = await getPointSettings(ctx.tenantId);
  const pointSatang = Math.max(0, settings.burnRateSatang);
  let cost = 0;
  for (const r of convertedRows) {
    for (const raw of [r.referrerRewardRef, r.refereeRewardRef]) {
      const ref = refOf(raw);
      if (!ref || ref.capped || ref.skipped) continue;
      cost += ref.kind === "POINTS" ? (ref.points ?? 0) * pointSatang : (ref.valueSatang ?? 0);
    }
  }
  const referees = rows.map((r) => r.referee).filter((x): x is { id: string; createdAt: Date } => !!x);
  const refAvg = await avgFirst90(ctx.tenantId, referees);
  // ค่าเฉลี่ยของสมาชิกที่ **ไม่ได้** มาจากการแนะนำ ที่สมัครในช่วงเดียวกัน (ตัวเทียบ "สูงกว่าเฉลี่ย n%")
  const others = await prisma.customer.findMany({
    where: {
      tenantId: ctx.tenantId,
      memberSystemId: ctx.systemId,
      createdAt: { gte: new Date(since.getTime() - 90 * DAY_MS) },
      referredById: null,
      status: { not: "MERGED" },
      ...(isUnitScoped(actor) && actor.role !== "CUSTOMER" ? { homeUnitId: { in: actor.unitAccess } } : {}),
    },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 2_000,
  });
  const baseAvg = await avgFirst90(ctx.tenantId, others);
  return {
    referredMembers: referred,
    conversionPct: referred > 0 ? Math.round((convertedRows.length / referred) * 100) : 0,
    costPerMemberSatang: convertedRows.length > 0 ? Math.round(cost / convertedRows.length) : 0,
    first90dSpendSatang: refAvg,
    vsAvgPct: baseAvg > 0 ? Math.round(((refAvg - baseAvg) / baseAvg) * 100) : 0,
  };
}

/** การ์ด "แนะนำเพื่อน" ของสมาชิก 1 คน (ภาพ 08 ขวา) + หน้า LIFF `/m/<slug>/referral` */
export async function referralsForMember(ctx: MemberCtx, actor: MemberActor, customerId: string): Promise<ReferralMemberView> {
  requireRead(actor);
  const c = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
    select: { id: true, homeUnitId: true },
  });
  if (!c) throw new MemberNotFoundError(NOT_FOUND_MSG);
  // ลูกค้าเห็นเฉพาะของตัวเอง · พนักงานจำกัดสาขาเห็นสมาชิกที่สาขาหลักอยู่ในสิทธิ์ตน (นอกนั้น = ไม่พบ §6.4)
  const hidden = actor.role === "CUSTOMER" ? actor.customerId !== c.id : !coversUnit(actor, c.homeUnitId);
  if (hidden) throw new MemberNotFoundError(NOT_FOUND_MSG);
  const [code, rows] = await Promise.all([
    codeFor(ctx, c.id),
    prisma.referral.findMany({
      where: { tenantId: ctx.tenantId, referrerCustomerId: c.id, NOT: { refereeCustomerId: c.id } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { referee: { select: PARTY_SELECT } },
    }),
  ]);
  const firsts = await firstPurchases(ctx.tenantId, rows.map((r) => r.refereeCustomerId).filter((x): x is string => !!x));
  let pointsEarned = 0;
  for (const r of rows) {
    const ref = r.status === "REWARDED" ? refOf(r.referrerRewardRef) : null;
    if (ref && ref.kind === "POINTS" && !ref.capped && !ref.skipped) pointsEarned += ref.points ?? 0;
  }
  const live = rows.filter((r) => r.status !== "REJECTED");
  return {
    ...code,
    referred: live.length,
    converted: live.filter((r) => r.status === "CONVERTED" || r.status === "REWARDED").length,
    pointsEarned,
    tree: rows
      .filter((r) => r.referee)
      .map((r) => ({
        refereeId: r.referee!.id,
        name: displayName(r.referee!),
        status: r.status,
        convertedAt: r.convertedAt,
        firstPurchaseSatang: r.refereeCustomerId ? (firsts.get(r.refereeCustomerId) ?? null) : null,
      })),
  };
}

/** ตัวเลขย่อสำหรับหน้า 360 (`getMember360().referrals`) — 2 คำสั่ง count ไม่โหลดแถว */
export async function referralCounts(tenantId: string, customerId: string): Promise<{ referred: number; converted: number }> {
  const [referred, converted] = await Promise.all([
    prisma.referral.count({ where: { tenantId, referrerCustomerId: customerId, status: { not: "REJECTED" }, NOT: { refereeCustomerId: customerId } } }),
    prisma.referral.count({ where: { tenantId, referrerCustomerId: customerId, status: { in: ["CONVERTED", "REWARDED"] } } }),
  ]);
  return { referred, converted };
}

// ───────────────────────── ทางเข้าจากงานเบื้องหลัง (สมัคร · คิว) ─────────────────────────

/**
 * สมาชิกใหม่สมัครด้วยโค้ด → ผูก + (โปรแกรม SIGNUP) จ่ายรางวัลทันที
 * เรียกจาก `profile.createMember` (ทันที) และคิว `member.created` (ตาข่ายเก็บตก) — idempotent ทั้งคู่
 */
export async function onMemberJoined(
  ctx: MemberCtx,
  input: { refereeCustomerId: string; code: string; device?: AttachInput["device"] },
): Promise<AttachResult> {
  const res = await attach(ctx, input);
  if (res.status === "PENDING" || res.status === "CONVERTED") {
    await evaluateConversion(ctx, { refereeCustomerId: input.refereeCustomerId, trigger: "SIGNUP" });
  }
  return res;
}

/** คิว `member.created` → payload.referrerId (หรือ sourceDetail.referralCode) → ผูก + ประเมิน */
export async function onMemberCreatedEvent(evt: { tenantId: string; systemId: string | null; payload: unknown }): Promise<void> {
  const p = objOf(evt.payload) ?? {};
  const customerId = typeof p.customerId === "string" ? p.customerId : null;
  if (!customerId) return;
  const referee = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: evt.tenantId },
    select: { id: true, memberSystemId: true, sourceDetail: true },
  });
  if (!referee) return; // ถูกลบ/รวมไปก่อนคิวมาถึง
  let code: string | null = null;
  const referrerId = typeof p.referrerId === "string" ? p.referrerId : null;
  if (referrerId) {
    const ref = await prisma.customer.findFirst({ where: { id: referrerId, tenantId: evt.tenantId }, select: { referralCode: true } });
    code = ref?.referralCode ?? null;
  } else {
    const sd = objOf(referee.sourceDetail);
    code = typeof sd?.referralCode === "string" ? sd.referralCode : null;
  }
  if (!code) return;
  const ctx: MemberCtx = { tenantId: evt.tenantId, systemId: referee.memberSystemId, actorUserId: null };
  await onMemberJoined(ctx, { refereeCustomerId: referee.id, code });
}

/** คิว `pos.sale.paid` (ผ่าน `member-bridges.ts`) → บิลของเพื่อนที่ยังรอแปลง */
export async function onSalePaid(ctx: MemberCtx, input: { customerId: string; saleId: string }): Promise<EvaluateResult | null> {
  const waiting = await prisma.referral.findFirst({
    where: { tenantId: ctx.tenantId, refereeCustomerId: input.customerId, status: { in: ["PENDING", "CONVERTED"] } },
    select: { id: true },
  });
  if (!waiting) return null; // สมาชิกส่วนใหญ่ไม่ได้มาจากการแนะนำ — จบใน 1 คำสั่ง
  return evaluateConversion(ctx, { refereeCustomerId: input.customerId, trigger: "PURCHASE", saleId: input.saleId });
}

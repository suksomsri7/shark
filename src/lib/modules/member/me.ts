// me.ts — "ข้อมูลของฉัน" ฝั่งลูกค้า (M2.9 · พิมพ์เขียว §3.10 §6.2 · ภาพ 09)
//
// 🔴 ทุก op ที่นี่ตรวจ 2 ชั้นเสมอ: (1) actor เป็น `CUSTOMER` จริง (ไม่ใช่พนักงานที่เผลอเรียกทางนี้)
//    (2) `actor.customerId` ตรงกับ `customerId` ที่ขอ — ไม่ตรง = โยนทันที
//    ⇒ ต่อให้หน้าไหนส่ง id ผิดมา ก็ไม่มีทางอ่าน/แก้ข้อมูลของสมาชิกคนอื่นได้
// 🔴 ลูกค้าแก้ได้เฉพาะฟิลด์ที่ร้านเปิดสวิตช์ `customerEditable` ให้ (และไม่ใช่ฟิลด์อ่อนไหว/ฟิลด์ยืนยันตัวตน)
//    ด่านอยู่ที่นี่ **และ** ที่ `fields.setFieldValues` (via `CUSTOMER_SELF`) — 2 ชั้นโดยตั้งใจ
// 🔴 บัตรสมาชิกเป็น **token อายุ 24 ชม.** ไม่ใช่รหัสสมาชิก: QR ที่หลุดไปเมื่อวานสแกนไม่ได้แล้ว
//    เก็บเฉพาะ hash ของ token (`Customer.cardTokenHash`) — token ดิบสร้างใหม่จากความลับของเซิร์ฟเวอร์
//    ทุกครั้งที่เปิดหน้าบัตร ⇒ เปิดซ้ำในเครื่องไหนก็ได้ QR เดิม แต่ฐานข้อมูลไม่เคยเก็บของดิบไว้

import { createHmac } from "node:crypto";
import QRCode from "qrcode";
import { getChannel } from "@/lib/core/channels";
import { writeAudit } from "@/lib/core/audit";
import { sha256 } from "@/lib/core/hash";
import { prisma } from "./db";
import type { MemberActor } from "./access";
import { customerActor } from "./customer-session";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import * as fields from "./fields";
import { getConsents, currentPolicy } from "./privacy";
import { briefFor, displayOf, pointsOfMany, resolveLookupNames, type MemberBrief, type MemberCtx } from "./profile";
import { evaluateMember } from "./tiers";

const CARD_TTL_MS = 24 * 60 * 60_000;
/**
 * เปิดหน้าบัตรซ้ำภายในเวลานี้ = ได้ QR ใบเดิม · เกินกว่านี้ = ออกใบใหม่ (ใบเก่าตายทันที)
 * 🔴 ทำไมไม่ "ใช้ใบเดิมจนครบ 24 ชม.": ใบที่ออกไว้เมื่อ 5 ชั่วโมงก่อนจะเหลืออายุแค่ 19 ชั่วโมง
 *    ⇒ เวลาที่โชว์ให้ลูกค้ากับเวลาที่เหลือจริงไม่ตรงกัน และ QR ที่ถูกแคปหน้าจอไว้ยังสแกนได้นานเกินจำเป็น
 *    หน้าต่างสั้น ๆ นี้ครอบ "เปิดบัตรแล้วเดินไปจ่ายเงิน" ซึ่งเป็นกรณีเดียวที่ต้องได้ใบเดิมจริง ๆ
 */
const CARD_REUSE_MS = 15 * 60_000;

/** ฟิลด์ที่เป็นงานของร้าน ไม่ใช่ข้อมูลที่ลูกค้าต้องอ่านในหน้าโปรไฟล์ตัวเอง (ภาพ 09 ค) */
const SHOP_ONLY_KEYS = new Set(["memberCode", "source", "sourceChannel", "ownerUserId", "note", "tags"]);

/**
 * ผลลัพธ์ของ server action ฝั่งลูกค้า — ประกาศไว้ที่นี่เพราะไฟล์ `"use server"` **ห้าม export type**
 * (Next นับทุก export ในไฟล์ server action เป็น action ⇒ export type = พังตอน runtime · บทเรียน M2.2)
 */
export type MeResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** คำนำหน้าของ QR บัตรสมาชิก — จอสแกนของพนักงานแยกออกจาก QR ชนิดอื่นด้วยคำนำหน้านี้ */
export const CARD_QR_PREFIX = "SHARK-MC:";

// ───────────────────────── ด่าน "เป็นตัวเองเท่านั้น" ─────────────────────────

function assertSelf(actor: MemberActor, customerId: string): void {
  if (actor?.role !== "CUSTOMER" || !actor.customerId || actor.customerId !== customerId) {
    throw new MemberForbiddenError(
      "เส้นทางนี้เปิดให้เจ้าของบัญชีดูข้อมูลของตัวเองเท่านั้น — เข้าสู่ระบบด้วยบัญชีสมาชิกของคุณก่อน",
    );
  }
}

type CustomerRow = {
  id: string;
  tenantId: string;
  memberSystemId: string;
  memberCode: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  tierDefId: string | null;
  createdAt: Date;
  privacyVersion: number | null;
  cardTokenHash: string | null;
  cardTokenExpiresAt: Date | null;
};

const CUSTOMER_SELECT = {
  id: true,
  tenantId: true,
  memberSystemId: true,
  memberCode: true,
  name: true,
  firstName: true,
  lastName: true,
  nickname: true,
  tierDefId: true,
  createdAt: true,
  privacyVersion: true,
  cardTokenHash: true,
  cardTokenExpiresAt: true,
} as const;

async function loadSelf(ctx: MemberCtx, actor: MemberActor, customerId: string): Promise<CustomerRow> {
  assertSelf(actor, customerId);
  const row = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
    select: CUSTOMER_SELECT,
  });
  if (!row) throw new MemberNotFoundError("ไม่พบบัญชีสมาชิกของคุณในร้านนี้ — เข้าสู่ระบบใหม่อีกครั้ง");
  return row;
}

function displayNameOf(row: Pick<CustomerRow, "name" | "firstName" | "lastName" | "memberCode">): string {
  return row.name ?? ([row.firstName, row.lastName].filter(Boolean).join(" ") || row.memberCode || "สมาชิก");
}

// ───────────────────────── (ก) โปรไฟล์ของฉัน ─────────────────────────

export type MeFieldDto = {
  key: string;
  label: string;
  type: string;
  value: fields.MemberFieldValueInput;
  /**
   * ค่าที่ "คนอ่านรู้เรื่อง" — ใช้ตัวแปลงตัวเดียวกับหน้า 360 (`profile.displayOf`)
   * 🔴 หน้าจอลูกค้าต้องอ่านจากช่องนี้เสมอ: `value` เป็นค่าดิบของระบบ (id สาขา · รหัสภาษา `th` ·
   *    รหัสประเทศ `TH` · คีย์ตัวเลือก `WALK_IN`) — โชว์ดิบ ๆ ให้ลูกค้าเห็น = อ่านไม่ออกและดูเหมือนระบบพัง
   * ว่าง = ยังไม่มีค่า (หน้าจอวาดขีด "—" เอง)
   */
  display: string;
  /** ตัวเลือกของฟิลด์ชนิด SELECT/MULTI_SELECT — หน้าจอลูกค้าต้องให้ "เลือก" ไม่ใช่ให้พิมพ์เอง */
  choices: { value: string; label: string }[];
  /** แก้เองได้ (ดินสอ) หรือร้านเป็นผู้ยืนยัน (กุญแจ) */
  customerEditable: boolean;
  sensitive: boolean;
};

export type MeSectionDto = { key: string; title: string; fields: MeFieldDto[] };

export type MeConsentDto = { channel: string; label: string; granted: boolean | null; canConsent: boolean };

export type MeDto = {
  member: {
    customerId: string;
    memberCode: string;
    displayName: string;
    tier: { name: string; color: string } | null;
    points: number;
    memberSince: Date;
    /** ระดับถัดไป + ยอดที่ยังขาด (สตางค์) + ความคืบหน้า 0–100 — ไม่มีบันไดต่อ = ไม่มีคีย์นี้ */
    nextTier?: { name: string; shortfallSatang: number; progressPct: number };
  };
  sections: MeSectionDto[];
  /**
   * ฟิลด์ที่ลูกค้า **ดูได้แต่แก้เองไม่ได้** (ภาพ 09 ค — แถวไอคอนกุญแจ "ร้านเป็นผู้ยืนยันให้")
   * = ฟิลด์ของตัวเองที่ไม่อ่อนไหว · ร้านปิดสวิตช์ให้แก้เอง · และมีค่าอยู่จริง (ไม่โชว์ช่องว่างเปล่า)
   * แยกจาก `sections` เพราะ `sections` ผูกกับ `listLayout(audience customer)` ตามสัญญา (ฟอร์มที่แก้ได้)
   */
  lockedFields: MeFieldDto[];
  consents: MeConsentDto[];
  policy: { version: number; acceptedAt: Date | null } | null;
};

/** ระดับถัดไป + ยอดที่ยังขาด — เอนจินระดับล้ม = หน้าบัตรต้องยังเปิดได้ (แค่ไม่บอกระดับถัดไป) */
async function nextTierOf(
  ctx: MemberCtx,
  customerId: string,
): Promise<{ name: string; shortfallSatang: number; progressPct: number } | null> {
  try {
    const ev = await evaluateMember(ctx, customerId, { noCache: true });
    if (!ev.next) return null;
    const p = ev.progressToNext;
    const moneyField = p && (p.field === "spent12m" || p.field === "spent");
    const shortfall = p ? Math.max(0, Math.round(p.target - p.current)) : 0;
    return {
      name: ev.next.name,
      shortfallSatang: moneyField ? shortfall : 0,
      progressPct: Math.max(0, Math.min(100, Math.round(p?.pct ?? 0))),
    };
  } catch {
    return null;
  }
}

async function policyOf(ctx: MemberCtx, row: CustomerRow): Promise<MeDto["policy"]> {
  const pol = await currentPolicy(ctx);
  if (!pol) return null;
  if (row.privacyVersion !== pol.version) return { version: pol.version, acceptedAt: null };
  const accepted = await prisma.memberActivity.findFirst({
    where: { tenantId: ctx.tenantId, customerId: row.id, module: "member", type: "POLICY_ACCEPTED" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return { version: pol.version, acceptedAt: accepted?.createdAt ?? null };
}

/** โปรไฟล์ + ฟิลด์ที่ร้านเปิดให้ลูกค้าเห็น + ความยินยอม + นโยบายที่รับไว้ (หน้า `/m/<slug>/profile`) */
export async function meGet(ctx: MemberCtx, actor: MemberActor, customerId: string): Promise<MeDto> {
  const row = await loadSelf(ctx, actor, customerId);
  const fieldCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };

  const [layout, fullLayout, values, points, tierRow, consentRows, policy, next] = await Promise.all([
    fields.listLayout(fieldCtx, { audience: "customer" }),
    fields.listLayout(fieldCtx, {}),
    fields.getFieldValues(fieldCtx, [row.id]),
    pointsOfMany(ctx, [row.id]),
    row.tierDefId
      ? prisma.memberTierDef.findFirst({ where: { id: row.tierDefId, tenantId: ctx.tenantId }, select: { name: true, color: true } })
      : Promise.resolve(null),
    getConsents(ctx, row.id),
    policyOf(ctx, row),
    nextTierOf(ctx, row.id),
  ]);

  const bag = values[row.id] ?? {};
  // id → ชื่อของฟิลด์ LOOKUP (สาขาหลัก · ผู้ดูแล ฯลฯ) แบบ batch — ตัวเดียวกับที่หน้า 360 ใช้
  const lookupNames = await resolveLookupNames(
    ctx,
    fullLayout.sections
      .flatMap((sec) => sec.fields)
      .filter((f) => f.type === "LOOKUP")
      .map((f) => ({ target: f.options.target, id: typeof bag[f.key] === "string" ? (bag[f.key] as string) : "" })),
  );
  const dtoOf = (f: fields.FieldDef, editable: boolean): MeFieldDto => ({
    key: f.key,
    label: f.label,
    type: f.type,
    value: bag[f.key] ?? null,
    display: displayOf(f, bag[f.key] ?? null, lookupNames),
    choices: (f.options.choices ?? []).map((c) => ({ value: c.value, label: c.label })),
    customerEditable: editable,
    sensitive: f.sensitive,
  });

  // ฟอร์มที่ลูกค้าแก้เองได้ = layout ชุด customer − ฟิลด์ยืนยันตัวตน (เบอร์/อีเมล/รหัสสมาชิก ที่ร้านเป็นคนยืนยัน)
  // − ฟิลด์ไฟล์ (หน้านี้ยังไม่มีตัวอัปโหลด ⇒ ให้ปุ่มดินสอที่กดแล้วบันทึกไม่ได้ = หลอกผู้ใช้)
  const editableSkip = (f: fields.FieldDef): boolean => CUSTOMER_LOCKED_KEYS.has(f.key) || f.type === "FILE";
  const sections: MeSectionDto[] = layout.sections
    .map((s) => ({
      key: s.key,
      title: s.label,
      fields: s.fields.filter((f) => !editableSkip(f)).map((f) => dtoOf(f, true)),
    }))
    .filter((s) => s.fields.length > 0);

  // แถวไอคอนกุญแจ (ภาพ 09 ค) = ข้อมูลของตัวเองที่ร้านเป็นผู้ยืนยันให้
  // 🔴 **ไม่มีค่า = ไม่ต้องแสดง** — แถว "—" ที่ลูกค้าทำอะไรกับมันไม่ได้ คือขยะเต็มหน้าจอ
  // 🔴 และตัดฟิลด์ที่เป็น "งานหลังร้าน" ออก (ที่มาการตลาด · พนักงานผู้ดูแล · รหัสสมาชิกที่โชว์บนหัวอยู่แล้ว)
  const lockedFields: MeFieldDto[] = fullLayout.sections
    .filter((sec) => !sec.sensitive)
    .flatMap((sec) => sec.fields)
    .filter((f) => !SHOP_ONLY_KEYS.has(f.key) && !f.sensitive && (!f.customerEditable || editableSkip(f)))
    .map((f) => dtoOf(f, false))
    .filter((f) => f.display !== "")
    .slice(0, 8);

  return {
    member: {
      customerId: row.id,
      memberCode: row.memberCode ?? "",
      displayName: displayNameOf(row),
      tier: tierRow ? { name: tierRow.name, color: tierRow.color } : null,
      points: points[row.id] ?? 0,
      memberSince: row.createdAt,
      ...(next ? { nextTier: next } : {}),
    },
    sections,
    lockedFields,
    consents: consentRows.map((c) => ({
      channel: c.channel,
      label: c.label,
      granted: c.granted,
      canConsent: getChannel(c.channel)?.canConsent ?? false,
    })),
    policy,
  };
}

// ───────────────────────── (ข) แก้ข้อมูลของฉัน ─────────────────────────

/**
 * ฟิลด์ที่ลูกค้าแก้เองไม่ได้เด็ดขาด แม้ร้านจะเผลอเปิดสวิตช์ `customerEditable` ให้
 * เบอร์/อีเมล = กุญแจเข้าสู่ระบบของหน้านี้ (OTP) · รหัสสมาชิก = ตัวอ้างอิงในบิล/แต้ม
 * ⇒ แก้ผ่านร้านเท่านั้น (ร้านเป็นคนยืนยันตัวตน) ไม่งั้นบัญชีถูกย้ายมือได้จากหน้าจอลูกค้า
 */
const CUSTOMER_LOCKED_KEYS = new Set(["phone", "email", "memberCode"]);

export type MeUpdateInput = { fields?: Record<string, unknown> };

/** ลูกค้าแก้ข้อมูลตัวเอง — คีย์ที่ไม่ได้เปิดให้แก้ → โยนพร้อมบอกชื่อคีย์ตรง ๆ */
export async function meUpdate(
  ctx: MemberCtx,
  actor: MemberActor,
  customerId: string,
  input: MeUpdateInput,
): Promise<{ updated: string[] }> {
  const row = await loadSelf(ctx, actor, customerId);
  const patch = input?.fields ?? {};
  const keys = Object.keys(patch);
  if (keys.length === 0) return { updated: [] };

  const fieldCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  const layout = await fields.listLayout(fieldCtx, {});
  const byKey = new Map(layout.sections.flatMap((s) => s.fields).map((f) => [f.key, f]));

  for (const key of keys) {
    const def = byKey.get(key);
    if (!def) {
      throw new MemberInputError(`ไม่มีช่องข้อมูล "${key}" ในโปรไฟล์ของร้านนี้ — รีเฟรชหน้าแล้วลองใหม่อีกครั้ง`);
    }
    if (CUSTOMER_LOCKED_KEYS.has(key) || def.sensitive || !def.customerEditable) {
      throw new MemberInputError(
        `ช่อง "${def.label}" (${key}) ให้ทางร้านเป็นผู้กรอกให้ — แจ้งพนักงานเพื่อแก้ไขข้อมูลนี้`,
      );
    }
  }

  const { changed } = await fields.setFieldValues(fieldCtx, row.id, patch, { via: "CUSTOMER_SELF", byUserId: null });
  if (changed.length > 0) {
    await writeAudit({
      tenantId: ctx.tenantId,
      // 🔴 ผู้ทำคือ "ลูกค้า" ไม่ใช่ผู้ใช้ของร้าน — `ActorType` ยังไม่มีค่า CUSTOMER (enum ของ core)
      //    ⇒ บันทึกเป็น SYSTEM แล้วบอกตัวจริงใน `after.by` (ห้ามใส่ USER = จะกลายเป็นพนักงานทำ)
      actorType: "SYSTEM",
      actorId: null,
      action: "member.me.update",
      targetType: "Customer",
      targetId: row.id,
      after: { by: "customer", customerId: row.id, keys: changed },
    });
  }
  return { updated: changed };
}

// ───────────────────────── (ค) บัตรสมาชิก QR ─────────────────────────

/**
 * token ของบัตร = HMAC(ความลับเซิร์ฟเวอร์, `${customerId}:${เวลาหมดอายุ}`)
 * ⇒ คำนวณซ้ำได้จากสิ่งที่เก็บใน DB (id + วันหมดอายุ) โดย **ไม่ต้องเก็บ token ดิบ**
 *   (เปิดหน้าบัตรซ้ำ/คนละเครื่อง ได้ QR เดิมจนกว่าจะหมดอายุหรือกดหมุนใหม่)
 */
function cardTokenFor(customerId: string, expiresAtMs: number): string {
  const secret = process.env.SESSION_SECRET ?? "shark-member-card";
  return createHmac("sha256", `member-card:${secret}`).update(`${customerId}:${expiresAtMs}`).digest("base64url");
}

async function issueCardToken(customerId: string, expiresAtMs: number): Promise<{ token: string; expiresAt: Date }> {
  const token = cardTokenFor(customerId, expiresAtMs);
  const expiresAt = new Date(expiresAtMs);
  await prisma.customer.update({
    where: { id: customerId },
    data: { cardTokenHash: sha256(token), cardTokenExpiresAt: expiresAt },
  });
  return { token, expiresAt };
}

export type MeCardDto = {
  memberCode: string;
  displayName: string;
  tierName: string | null;
  tierColor: string | null;
  points: number;
  qr: { content: string; dataUrl: string };
  expiresAt: Date;
};

/** บัตรสมาชิกของฉัน (หน้า `/m/<slug>/card`) — token ยังไม่หมดอายุ = ได้ของเดิม · หมดแล้ว = ออกใหม่เงียบ ๆ */
export async function meCard(ctx: MemberCtx, actor: MemberActor, customerId: string): Promise<MeCardDto> {
  const row = await loadSelf(ctx, actor, customerId);
  const now = Date.now();

  let token = "";
  let expiresAt: Date;
  // ใบที่ยังไม่หมดอายุ **และเพิ่งออกไม่นาน** เท่านั้นที่เอากลับมาใช้ (issuedAt = expiresAt − อายุเต็ม)
  const fresh =
    row.cardTokenExpiresAt &&
    row.cardTokenExpiresAt.getTime() > now &&
    now - (row.cardTokenExpiresAt.getTime() - CARD_TTL_MS) < CARD_REUSE_MS;
  const live = fresh ? row.cardTokenExpiresAt : null;
  const reused = live ? cardTokenFor(row.id, live.getTime()) : "";
  if (live && reused && sha256(reused) === row.cardTokenHash) {
    token = reused;
    expiresAt = live;
  } else {
    const issued = await issueCardToken(row.id, now + CARD_TTL_MS);
    token = issued.token;
    expiresAt = issued.expiresAt;
  }

  const [points, tierRow, dataUrl] = await Promise.all([
    pointsOfMany(ctx, [row.id]),
    row.tierDefId
      ? prisma.memberTierDef.findFirst({ where: { id: row.tierDefId, tenantId: ctx.tenantId }, select: { name: true, color: true } })
      : Promise.resolve(null),
    QRCode.toDataURL(`${CARD_QR_PREFIX}${token}`, { margin: 1, width: 320, errorCorrectionLevel: "M" }),
  ]);

  return {
    memberCode: row.memberCode ?? "",
    displayName: displayNameOf(row),
    tierName: tierRow?.name ?? null,
    tierColor: tierRow?.color ?? null,
    points: points[row.id] ?? 0,
    qr: { content: `${CARD_QR_PREFIX}${token}`, dataUrl },
    expiresAt,
  };
}

/** กดปุ่ม "ออก QR ใหม่" — ของเดิมใช้ไม่ได้ทันที (มือถือหาย/เผลอส่งภาพ QR ให้คนอื่น) */
export async function rotateCardToken(
  ctx: MemberCtx,
  actor: MemberActor,
  customerId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const row = await loadSelf(ctx, actor, customerId);
  let ms = Date.now() + CARD_TTL_MS;
  // กดรัว ๆ ในมิลลิวินาทีเดียวกันต้องไม่ได้ token เดิม (token ผูกกับเวลาหมดอายุ)
  if (row.cardTokenExpiresAt && row.cardTokenExpiresAt.getTime() >= ms) ms = row.cardTokenExpiresAt.getTime() + 1;
  return issueCardToken(row.id, ms);
}

export type CardLookupDto = MemberBrief & { displayName: string };

/**
 * พนักงานสแกน QR บัตรสมาชิก (จอขาย/แอปพนักงาน) — ไม่ต้องมี session ลูกค้า
 * token หมดอายุ · ของร้านอื่น · ถูกหมุนไปแล้ว = `null` เงียบ ๆ (ไม่บอกว่าเคยมีอยู่จริงไหม)
 */
export async function resolveCardToken(tenantId: string, token: string): Promise<CardLookupDto | null> {
  const raw = typeof token === "string" ? token.trim().replace(new RegExp(`^${CARD_QR_PREFIX}`), "") : "";
  if (!tenantId || !raw) return null;
  const row = await prisma.customer.findFirst({
    where: { tenantId, cardTokenHash: sha256(raw), cardTokenExpiresAt: { gt: new Date() } },
    select: { id: true, memberSystemId: true },
  });
  if (!row) return null;
  const ctx: MemberCtx = { tenantId, systemId: row.memberSystemId, actorUserId: null };
  const [brief] = await briefFor(ctx, customerActor(row.id), [row.id]);
  if (!brief) return null;
  return { ...brief, displayName: brief.name };
}

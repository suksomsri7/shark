// sources.ts — "ช่องทางที่มาของสมาชิก" (WO M1.8 · D10 · พิมพ์เขียว docs/modules/06-member-v2.md §4.3 §5.10 §7.2 §9.6)
//
// ไฟล์นี้ตอบคำถามเดียว: **สมาชิกคนนี้มาจากไหน และช่องทางไหนคุ้มค่าที่สุด**
//   1) ลิงก์/QR ที่มา (`AcquisitionLink`) — สร้าง/แก้/เปิดปิด · นับคลิก (hits) · นับสมัคร (signups) · นับซื้อครั้งแรก
//   2) `resolveSource()` — แปล "ทางเข้า" ทุกทางให้เป็น `MemberSource` + ช่องทางจริง (D19) อย่างเดียวกันทั้งระบบ
//   3) `recordTouch()` — first touch เขียนครั้งเดียวไม่ทับ · last touch ทับได้ทุกครั้ง (§7.2)
//   4) `reportBySource()` — สมาชิกใหม่ต่อช่องทาง · first vs last · ผู้ซื้อ/ซื้อซ้ำ/ยอดเฉลี่ย · ต้นทุนต่อสมาชิก
//
// กติกาประจำไฟล์
//   • ctx = { tenantId, systemId (= ระบบสมาชิก), actorUserId } เหมือนไฟล์อื่นของโมดูล
//   • prisma ดิบผ่าน `./db` เท่านั้น (ดู member/db.ts) · ห้าม import โมดูลอื่นตรง (F2)
//   • `hit()` เป็น **สาธารณะ**: ลูกค้าสแกน QR แล้วยังไม่ล็อกอิน ⇒ ไม่มี actor ไม่มี ctx
//     ⇒ ทุกอย่างที่ hit() ทำได้คือ "บวกตัวนับของลิงก์ที่เปิดอยู่" — ไม่คืนข้อมูลร้าน ไม่คืนข้อมูลคน
//   • โดเมนของลิงก์มาจาก `publicOrigin()` (ผู้ใช้เปิดหน้าจากโดเมนไหน ลิงก์ก็เป็นโดเมนนั้น)
//     🔴 ห้ามฮาร์ดโค้ดโดเมน — บทเรียน 31 ส.ค.: `env.APP_URL` บน prod ค้างเป็นโดเมนที่ปิดไปแล้ว
//     ⇒ ลิงก์ที่ระบบให้เจ้าของเอาไปแปะ QR เปิดแล้ว 502 โดยไม่มีอะไรฟ้อง

import type { MemberSource, Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { getChannel } from "@/lib/core/channels";
import { randomCode } from "@/lib/core/hash";
import { publicOrigin } from "@/lib/core/origin";
import { prisma } from "./db";
import { hasMemberPerm, type MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";

type Tx = Prisma.TransactionClient;
const db = (tx?: Tx) => tx ?? prisma;

export type SourceCtx = { tenantId: string; systemId: string; actorUserId?: string | null };

// ───────────────────────── ชนิดข้อมูลสาธารณะ ─────────────────────────

/** ปลายทางของลิงก์ที่มา — ลูกค้ากดแล้วไปไหนต่อ */
export type LinkTarget = "LIFF_JOIN" | "WEB_FORM" | "CHAT";

export type SourceLinkDto = {
  id: string;
  code: string;
  name: string;
  source: MemberSource;
  campaignId: string | null;
  unitId: string | null;
  target: LinkTarget;
  utm: Record<string, string> | null;
  /** ค่าใช้จ่ายของช่องทางนี้ (สตางค์) ที่ร้านกรอกเอง — ตัวหารของ "ต้นทุนต่อสมาชิกใหม่" */
  costSatang: number;
  hits: number;
  signups: number;
  firstPurchases: number;
  active: boolean;
  /** ลิงก์เต็มที่เอาไปแปะได้เลย = `{origin}/m/{tenantSlug}?src={code}` */
  url: string;
  createdAt: Date;
};

export type CreateLinkInput = {
  /** ไม่ส่ง = ระบบสุ่มให้ (A–Z0–9 8 ตัว) · ส่งเอง = ตัวอักษร/ตัวเลข/ขีด 3–32 ตัว */
  code?: string | null;
  name: string;
  source: string;
  campaignId?: string | null;
  unitId?: string | null;
  target: string;
  utm?: Record<string, string> | null;
  costSatang?: number | null;
};

export type UpdateLinkInput = {
  name?: string | null;
  source?: string | null;
  campaignId?: string | null;
  unitId?: string | null;
  target?: string | null;
  utm?: Record<string, string> | null;
  costSatang?: number | null;
};

export type CreateLinkResult = {
  link: SourceLinkDto;
  url: string;
  /** QR ของลิงก์เป็นรูปพร้อมใช้ (data URL) — หน้าจอเอาไปใส่ `<img src>` หรือให้ดาวน์โหลดได้ทันที */
  qrDataUrl: string;
  /**
   * ไฟล์ QR ที่เก็บถาวรในคลังไฟล์ของร้าน
   * 🔴 วันนี้เป็น `null` เสมอ: โมดูลคลังไฟล์ยังไม่มีทางเข้าแบบ "server เขียนไฟล์เองโดยไม่มีคำขอจากเบราว์เซอร์"
   *    (คอลัมน์ `AcquisitionLink.qrFileId` เตรียมไว้แล้วตั้งแต่ M1.1) — QR สร้างสดทุกครั้งจาก url
   *    ซึ่งถูกต้องกว่าไฟล์ค้าง: ร้านเปลี่ยนโดเมนเมื่อไร QR ก็ตามโดเมนใหม่ทันที
   */
  qrFileId: string | null;
};

/** ทางเข้าที่ระบบรู้จัก — เพิ่มค่าใหม่ที่นี่ที่เดียว (fail-closed: ไม่รู้จัก = ปฏิเสธ) */
export const SOURCE_VIA_LIST = [
  "POS", "LIFF", "WEB_FORM", "CHAT", "BOOKING", "IMPORT", "CRM", "API", "REFERRAL", "MARKETPLACE", "APP",
] as const;
export type SourceVia = (typeof SOURCE_VIA_LIST)[number];

export type ResolveSourceInput = {
  via: string;
  /** ค่า `?src=` จากลิงก์/QR ที่มา */
  src?: string | null;
  staffUserId?: string | null;
  unitId?: string | null;
  formId?: string | null;
  /** key ช่องทางแชทจากทะเบียนกลาง (D19) เช่น LINE / WHATSAPP */
  contactChannel?: string | null;
  campaignId?: string | null;
  /** รหัสแนะนำเพื่อนของคนชวน (`Customer.referralCode`) */
  referrerCode?: string | null;
  apiKeyName?: string | null;
  fileName?: string | null;
  dealId?: string | null;
  /** key ตลาดออนไลน์จากทะเบียนกลาง (kind MARKETPLACE) เช่น SHOPEE */
  marketplace?: string | null;
};

export type ResolvedSource = {
  source: MemberSource;
  /** key ช่องทางจริงจากทะเบียนกลาง (D19) — null = ช่องทางนี้ไม่ผูกกับแพลตฟอร์มไหน */
  sourceChannel: string | null;
  sourceDetail: Record<string, string>;
  linkId: string | null;
  campaignId: string | null;
  staffUserId: string | null;
  referrerCustomerId: string | null;
  unitId: string | null;
};

export type TouchInput = {
  source: string;
  sourceChannel?: string | null;
  linkId?: string | null;
  campaignId?: string | null;
  staffUserId?: string | null;
  referrerCustomerId?: string | null;
  unitId?: string | null;
  occurredAt?: Date | null;
};

export type TouchDto = {
  id: string;
  touch: "FIRST" | "LAST";
  source: MemberSource;
  linkId: string | null;
  campaignId: string | null;
  staffUserId: string | null;
  referrerCustomerId: string | null;
  unitId: string | null;
  occurredAt: Date;
};

export type SourceReportRow = {
  source: MemberSource;
  sourceChannel: string | null;
  /** สมาชิกที่ระบบบันทึก first touch ของช่องทางนี้ในช่วงเวลาที่ดู */
  signups: number;
  firstTouch: number;
  lastTouch: number;
  buyers: number;
  repeatBuyers: number;
  avgSpentSatang: number;
  costSatang: number;
  costPerSignupSatang: number;
};

export type SourceReportLinkRow = {
  id: string;
  code: string;
  name: string;
  source: MemberSource;
  hits: number;
  signups: number;
  firstPurchases: number;
  costSatang: number;
  costPerSignupSatang: number;
};

export type SourceReport = {
  rows: SourceReportRow[];
  links: SourceReportLinkRow[];
  /** สมาชิกใหม่รวมทุกช่องทางในช่วงนี้ */
  total: number;
};

// ───────────────────────── ตัวช่วยพื้นฐาน ─────────────────────────

const SOURCES: readonly string[] = [
  "WALK_IN", "POS", "BOOKING", "LINE_OA", "LIFF", "WEB_FORM", "CHAT",
  "REFERRAL", "IMPORT", "CRM", "CAMPAIGN", "API", "MARKETPLACE", "APP", "OTHER",
];
const TARGETS: readonly string[] = ["LIFF_JOIN", "WEB_FORM", "CHAT"];
/** ตัวอักษรของโค้ดที่สุ่มให้ — ตัดตัวสับสน 0/O/1/I ออก (คนอ่านจาก QR/โปสเตอร์แล้วพิมพ์ตามได้) */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;
const MAX_COST_SATANG = 1_000_000_000;

function trimOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalizeSource(raw: unknown, what: string): MemberSource {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!SOURCES.includes(value)) {
    throw new MemberInputError(`ช่องทางที่มา "${String(raw ?? "")}" ไม่อยู่ในรายการของระบบ — เลือกจากช่องทางที่มีใน${what}`);
  }
  return value as MemberSource;
}

function normalizeTarget(raw: unknown): LinkTarget {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!TARGETS.includes(value)) {
    throw new MemberInputError(`ปลายทาง "${String(raw ?? "")}" ไม่อยู่ในรายการของระบบ — เลือก ฟอร์มสมัคร LIFF / ฟอร์มเว็บ / แชท`);
  }
  return value as LinkTarget;
}

function normalizeCost(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_COST_SATANG) {
    throw new MemberInputError("ค่าใช้จ่ายของช่องทางต้องเป็นจำนวนเงินที่ไม่ติดลบ — กรอกเป็นตัวเลขบาทแล้วลองใหม่");
  }
  return n;
}

function normalizeUtm(raw: unknown): Record<string, string> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new MemberInputError("ค่า UTM ต้องเป็นคู่ ชื่อ/ค่า เช่น utm_source = qr");
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = k.trim();
    if (!key) continue;
    if (typeof v !== "string") throw new MemberInputError(`ค่า UTM "${key}" ต้องเป็นข้อความ`);
    out[key] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

function utmOf(value: Prisma.JsonValue | null): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  return Object.keys(out).length ? out : null;
}

function detailOf(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

function requireSettings(actor: MemberActor, what: string): void {
  if (!hasMemberPerm(actor, "member.settings.manage")) {
    throw new MemberForbiddenError(`บัญชีของคุณยังไม่ได้รับสิทธิ์${what} — ขอสิทธิ์ "ตั้งค่าระบบสมาชิก" จากเจ้าของร้านก่อน`);
  }
}

/** โดเมนสาธารณะ + ชื่อร้าน (slug) — ใช้ประกอบลิงก์ที่มาทุกเส้น */
async function linkBase(tenantId: string): Promise<string> {
  const [origin, tenant] = await Promise.all([
    publicOrigin(),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
  ]);
  if (!tenant) throw new MemberNotFoundError("ไม่พบร้านนี้ในระบบ — รีเฟรชหน้าแล้วลองใหม่");
  return `${origin}/m/${tenant.slug}`;
}

type LinkRow = {
  id: string; code: string; name: string; source: MemberSource; campaignId: string | null; unitId: string | null;
  target: string; utm: Prisma.JsonValue | null; costSatang: number; hits: number; signups: number;
  firstPurchases: number; active: boolean; createdAt: Date;
};

function toLinkDto(row: LinkRow, base: string): SourceLinkDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    source: row.source,
    campaignId: row.campaignId,
    unitId: row.unitId,
    target: row.target as LinkTarget,
    utm: utmOf(row.utm),
    costSatang: row.costSatang,
    hits: row.hits,
    signups: row.signups,
    firstPurchases: row.firstPurchases,
    active: row.active,
    url: `${base}?src=${row.code}`,
    createdAt: row.createdAt,
  };
}

/** QR ของลิงก์ (data URL) — สร้างสดจาก url เสมอ ไม่มีไฟล์ค้างให้เน่าเมื่อโดเมนเปลี่ยน */
export async function qrDataUrlFor(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: "M" });
}

// ───────────────────────── ลิงก์/QR ที่มา ─────────────────────────

/** ลิงก์ที่มาทั้งหมดของระบบสมาชิกนี้ (ใหม่สุดขึ้นก่อน) */
export async function listLinks(ctx: SourceCtx): Promise<SourceLinkDto[]> {
  const [base, rows] = await Promise.all([
    linkBase(ctx.tenantId),
    prisma.acquisitionLink.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return rows.map((r) => toLinkDto(r, base));
}

async function uniqueLinkCode(tenantId: string): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = randomCode(8, CODE_ALPHABET);
    const exists = await prisma.acquisitionLink.findFirst({ where: { tenantId, code }, select: { id: true } });
    if (!exists) return code;
  }
  return randomCode(10, CODE_ALPHABET);
}

/**
 * สร้างลิงก์/QR ที่มาใหม่ (สิทธิ์ `member.settings.manage`)
 * โค้ดซ้ำในร้านเดียวกันไม่ได้ (unique [tenantId, code]) — ตรวจก่อนเขียนเพื่อให้ข้อความเป็นภาษาคน
 */
export async function createLink(ctx: SourceCtx, actor: MemberActor, input: CreateLinkInput): Promise<CreateLinkResult> {
  requireSettings(actor, "สร้างลิงก์ที่มา");
  const name = trimOrNull(input.name);
  if (!name) throw new MemberInputError("ตั้งชื่อลิงก์ที่มาก่อน เช่น \"QR หน้าร้านป่าตอง\" — ชื่อนี้ใช้ดูในรายงาน");
  const source = normalizeSource(input.source, "รายการช่องทาง");
  const target = normalizeTarget(input.target);
  const costSatang = normalizeCost(input.costSatang);
  const utm = normalizeUtm(input.utm ?? null);

  const custom = trimOrNull(input.code);
  if (custom && !CODE_RE.test(custom)) {
    throw new MemberInputError(`รหัสลิงก์ "${custom}" ใช้ไม่ได้ — ใช้ตัวอักษรอังกฤษ ตัวเลข ขีด (-) หรือขีดล่าง (_) ความยาว 3–32 ตัว`);
  }
  const code = custom ?? (await uniqueLinkCode(ctx.tenantId));
  const dup = await prisma.acquisitionLink.findFirst({ where: { tenantId: ctx.tenantId, code }, select: { id: true } });
  if (dup) throw new MemberInputError(`รหัสลิงก์ "${code}" ถูกใช้ไปแล้วในร้านนี้ — ตั้งรหัสอื่นหรือปล่อยว่างให้ระบบสุ่มให้`);

  const row = await prisma.acquisitionLink.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      code,
      name,
      source,
      campaignId: trimOrNull(input.campaignId),
      unitId: trimOrNull(input.unitId),
      target,
      ...(utm ? { utm: utm as Prisma.InputJsonValue } : {}),
      costSatang,
      active: true,
    },
  });

  const base = await linkBase(ctx.tenantId);
  const link = toLinkDto(row, base);
  return { link, url: link.url, qrDataUrl: await qrDataUrlFor(link.url), qrFileId: row.qrFileId };
}

/** แก้ไขลิงก์ที่มา — รหัส (`code`) แก้ไม่ได้ เพราะ QR ที่พิมพ์แจกไปแล้วชี้มาที่รหัสนั้น */
export async function updateLink(ctx: SourceCtx, actor: MemberActor, id: string, patch: UpdateLinkInput): Promise<SourceLinkDto> {
  requireSettings(actor, "แก้ไขลิงก์ที่มา");
  const current = await prisma.acquisitionLink.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!current) throw new MemberNotFoundError("ไม่พบลิงก์ที่มานี้ — อาจถูกลบไปแล้ว รีเฟรชหน้าแล้วลองใหม่");

  const data: Prisma.AcquisitionLinkUpdateInput = {};
  if (patch.name !== undefined) {
    const name = trimOrNull(patch.name);
    if (!name) throw new MemberInputError("ชื่อลิงก์ที่มาว่างไม่ได้ — ตั้งชื่อที่ดูแล้วรู้ว่าแปะไว้ที่ไหน");
    data.name = name;
  }
  if (patch.source !== undefined && patch.source !== null) data.source = normalizeSource(patch.source, "รายการช่องทาง");
  if (patch.target !== undefined && patch.target !== null) data.target = normalizeTarget(patch.target);
  if (patch.campaignId !== undefined) data.campaignId = trimOrNull(patch.campaignId);
  if (patch.unitId !== undefined) data.unitId = trimOrNull(patch.unitId);
  if (patch.costSatang !== undefined) data.costSatang = normalizeCost(patch.costSatang);
  // utm: ส่งค่ามาใหม่ = ทับทั้งก้อน · ส่ง null/ไม่ส่ง = คงของเดิม (ล้าง utm ทิ้งยังไม่มีที่ใช้ในหน้าจอ)
  const utm = patch.utm === undefined ? null : normalizeUtm(patch.utm);
  if (utm) data.utm = utm as Prisma.InputJsonValue;

  const row = await prisma.acquisitionLink.update({ where: { id }, data });
  return toLinkDto(row, await linkBase(ctx.tenantId));
}

/** เปิด/ปิดลิงก์ — ปิดแล้วลิงก์เดิมยังเปิดหน้าสมัครได้ แต่ไม่นับ hit และไม่ผูกที่มาให้อีก */
export async function toggleLink(ctx: SourceCtx, actor: MemberActor, id: string, active: boolean): Promise<SourceLinkDto> {
  requireSettings(actor, "เปิด/ปิดลิงก์ที่มา");
  const current = await prisma.acquisitionLink.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true } });
  if (!current) throw new MemberNotFoundError("ไม่พบลิงก์ที่มานี้ — อาจถูกลบไปแล้ว รีเฟรชหน้าแล้วลองใหม่");
  const row = await prisma.acquisitionLink.update({ where: { id }, data: { active: !!active } });
  return toLinkDto(row, await linkBase(ctx.tenantId));
}

/**
 * ลูกค้ากดลิงก์/สแกน QR (สาธารณะ · ไม่มี actor)
 *
 * 🔴 ตัวนับต้องจบใน SQL คำสั่งเดียว (`increment`) — ถ้าอ่านมาบวกแล้วเขียนกลับ QR ที่คนสแกนพร้อมกัน
 *    ตอนเปิดร้านจะนับหาย และ DB จำลองจับไม่ได้ (บทเรียน `atomic_counter_single_statement`)
 * 🔴 ลิงก์ปิด / รหัสไม่มี / ร้านผิด → `{ ok: false }` เงียบ ๆ ไม่บอกว่าอะไรผิด
 *    (ทางเข้าสาธารณะห้ามกลายเป็นเครื่องมือเดารหัสลิงก์ของร้านคนอื่น)
 */
export async function hit(tenantSlug: string, code: string): Promise<{ ok: boolean; linkId?: string; target?: LinkTarget }> {
  const slug = trimOrNull(tenantSlug);
  const c = trimOrNull(code);
  if (!slug || !c) return { ok: false };
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { ok: false };
  const link = await prisma.acquisitionLink.findFirst({
    where: { tenantId: tenant.id, code: c, active: true },
    select: { id: true, target: true },
  });
  if (!link) return { ok: false };
  await prisma.acquisitionLink.update({ where: { id: link.id }, data: { hits: { increment: 1 } } });
  return { ok: true, linkId: link.id, target: link.target as LinkTarget };
}

// ───────────────────────── แปลทางเข้า → ที่มา (resolveSource) ─────────────────────────

/** หาลิงก์ที่ยัง "เปิดอยู่" จากรหัส `?src=` — ปิด/ไม่มี = คืน null (ไม่ throw · ลูกค้าไม่ได้ทำอะไรผิด) */
async function activeLinkByCode(ctx: SourceCtx, code: string, tx?: Tx): Promise<LinkRow | null> {
  return db(tx).acquisitionLink.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, code, active: true },
  });
}

/** ที่มาจากลิงก์ (ใช้ร่วมกันระหว่าง `resolveSource` และทางสมัครสมาชิกใน profile.ts) */
async function applyLink(
  ctx: SourceCtx,
  base: ResolvedSource,
  code: string,
  tx?: Tx,
): Promise<ResolvedSource> {
  base.sourceDetail.linkCode = code; // เก็บไว้เสมอเพื่อสืบย้อน แม้ลิงก์จะถูกปิดไปแล้ว
  const link = await activeLinkByCode(ctx, code, tx);
  if (!link) return base;
  return {
    ...base,
    // ลิงก์เป็นคนบอกว่าตัวเองคือช่องทางอะไร (เช่น QR โปสเตอร์ = CAMPAIGN) ⇒ ทับค่าที่ทางเข้าเดาไว้
    source: link.source,
    linkId: link.id,
    campaignId: link.campaignId ?? base.campaignId,
    unitId: link.unitId ?? base.unitId,
    sourceDetail: { ...base.sourceDetail, linkName: link.name },
  };
}

/**
 * แปล "ทางเข้า" ให้เป็นที่มาแบบเดียวกันทั้งระบบ (§7.2)
 *
 * ทุกทางเข้าสมัครสมาชิก (POS · LIFF · ฟอร์มเว็บ · แชท · จอง · นำเข้า · CRM · API · แนะนำเพื่อน ·
 * ตลาดออนไลน์ · แอป) เรียกตัวนี้ตัวเดียว — ไม่งั้นแต่ละทางเข้าจะตั้งค่า `source` กันเองคนละแบบ
 * แล้วรายงานช่องทางที่มาจะเชื่อไม่ได้ตั้งแต่วันแรก
 */
export async function resolveSource(ctx: SourceCtx, input: ResolveSourceInput, tx?: Tx): Promise<ResolvedSource> {
  const via = String(input.via ?? "").trim().toUpperCase();
  if (!(SOURCE_VIA_LIST as readonly string[]).includes(via)) {
    throw new MemberInputError(`ทางเข้า "${String(input.via ?? "")}" ไม่อยู่ในรายการของระบบ — ตรวจค่าที่ส่งมาอีกครั้ง`);
  }
  const src = trimOrNull(input.src);
  const base: ResolvedSource = {
    source: "OTHER",
    sourceChannel: null,
    sourceDetail: { via },
    linkId: null,
    campaignId: trimOrNull(input.campaignId),
    staffUserId: trimOrNull(input.staffUserId),
    referrerCustomerId: null,
    unitId: trimOrNull(input.unitId),
  };

  switch (via as SourceVia) {
    case "POS":
      base.source = "POS";
      break;
    case "BOOKING":
      base.source = "BOOKING";
      break;
    case "APP":
      base.source = "APP";
      base.sourceChannel = "APP";
      break;
    case "LIFF":
      base.source = "LIFF";
      break;
    case "WEB_FORM": {
      base.source = "WEB_FORM";
      const formId = trimOrNull(input.formId);
      if (formId) base.sourceDetail.formId = formId;
      break;
    }
    case "IMPORT": {
      base.source = "IMPORT";
      const fileName = trimOrNull(input.fileName);
      if (fileName) base.sourceDetail.fileName = fileName;
      break;
    }
    case "CRM": {
      base.source = "CRM";
      const dealId = trimOrNull(input.dealId);
      if (dealId) base.sourceDetail.dealId = dealId;
      break;
    }
    case "API": {
      base.source = "API";
      const apiKeyName = trimOrNull(input.apiKeyName);
      if (apiKeyName) base.sourceDetail.apiKeyName = apiKeyName;
      break;
    }
    case "CHAT": {
      // ช่องทางแชทมาจากทะเบียนกลาง (D19) — ไลน์เป็นช่องเดียวที่มี "ที่มา" ของตัวเองในรายงาน
      const key = trimOrNull(input.contactChannel)?.toUpperCase() ?? null;
      if (key && !getChannel(key)) {
        throw new MemberInputError(`ช่องทาง "${input.contactChannel}" ยังไม่มีในทะเบียนช่องทางของระบบ — เลือกจากรายการที่มี`);
      }
      base.source = key === "LINE" ? "LINE_OA" : "CHAT";
      base.sourceChannel = key;
      break;
    }
    case "MARKETPLACE": {
      const key = trimOrNull(input.marketplace)?.toUpperCase() ?? null;
      const def = key ? getChannel(key) : undefined;
      if (!def || def.kind !== "MARKETPLACE") {
        throw new MemberInputError(`ตลาดออนไลน์ "${input.marketplace ?? ""}" ไม่อยู่ในทะเบียนช่องทางของระบบ — เลือกจากรายการที่มี`);
      }
      base.source = "MARKETPLACE";
      base.sourceChannel = def.key;
      break;
    }
    case "REFERRAL": {
      const code = trimOrNull(input.referrerCode)?.toUpperCase() ?? null;
      if (!code) throw new MemberInputError("ต้องมีรหัสแนะนำเพื่อนของผู้ชวน จึงจะบันทึกที่มาแบบแนะนำเพื่อนได้");
      const referrer = await db(tx).customer.findFirst({
        where: { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, referralCode: code },
        select: { id: true },
      });
      if (!referrer) throw new MemberInputError(`ไม่พบรหัสแนะนำเพื่อน "${code}" ในร้านนี้ — ตรวจตัวอักษรอีกครั้ง`);
      base.source = "REFERRAL";
      base.referrerCustomerId = referrer.id;
      base.sourceDetail.referrerCode = code;
      break;
    }
  }

  return src ? applyLink(ctx, base, src, tx) : base;
}

/**
 * ที่มาของ "การสมัครสมาชิก" (ใช้จาก `profile.createMember` เท่านั้น)
 *
 * ต่างจาก `resolveSource` ตรงที่ทางเข้าที่นี่มาเป็น `MemberSource` อยู่แล้ว (ฟอร์มสมัครเลือกช่องทางเอง)
 * ⇒ หน้าที่ที่เหลือคือ "ถ้ามี `sourceDetail.linkCode` ให้ลิงก์เป็นคนตัดสินช่องทาง" — ตรรกะเดียวกับ
 * `applyLink` ตัวเดียวกับที่ `resolveSource` ใช้ (ไม่ทำสองทาง ไม่งั้นวันหนึ่งมันจะไม่ตรงกัน)
 */
export async function resolveSignupSource(
  ctx: SourceCtx,
  input: { source: MemberSource; linkCode?: string | null; unitId?: string | null; staffUserId?: string | null; campaignId?: string | null; sourceChannel?: string | null },
  tx?: Tx,
): Promise<ResolvedSource> {
  const base: ResolvedSource = {
    source: input.source,
    sourceChannel: trimOrNull(input.sourceChannel),
    sourceDetail: {},
    linkId: null,
    campaignId: trimOrNull(input.campaignId),
    staffUserId: trimOrNull(input.staffUserId),
    referrerCustomerId: null,
    unitId: trimOrNull(input.unitId),
  };
  const code = trimOrNull(input.linkCode);
  return code ? applyLink(ctx, base, code, tx) : base;
}

/** สมัครสำเร็จผ่านลิงก์ = บวกตัวนับ signups (เรียกภายใน transaction ของ createMember) */
export async function countSignup(linkId: string, tx: Tx): Promise<void> {
  await tx.acquisitionLink.update({ where: { id: linkId }, data: { signups: { increment: 1 } } });
}

// ───────────────────────── first touch / last touch ─────────────────────────

function toTouchDto(row: {
  id: string; touch: string; source: MemberSource; linkId: string | null; campaignId: string | null;
  staffUserId: string | null; referrerCustomerId: string | null; unitId: string | null; occurredAt: Date;
}): TouchDto {
  return {
    id: row.id,
    touch: row.touch === "FIRST" ? "FIRST" : "LAST",
    source: row.source,
    linkId: row.linkId,
    campaignId: row.campaignId,
    staffUserId: row.staffUserId,
    referrerCustomerId: row.referrerCustomerId,
    unitId: row.unitId,
    occurredAt: row.occurredAt,
  };
}

/**
 * บันทึก "ครั้งที่รู้ที่มา" ของสมาชิกคนหนึ่ง (§7.2)
 *
 * 🔴 FIRST เขียนครั้งเดียวตลอดชีพ — ครั้งแรกที่ร้านรู้จักคนนี้คือข้อเท็จจริงที่เปลี่ยนไม่ได้
 *    (ถ้าทับได้ รายงาน "ช่องทางไหนหาลูกค้าใหม่เก่งที่สุด" จะกลายเป็น "ช่องทางไหนคุยล่าสุด" เงียบ ๆ)
 * 🔴 LAST ทับทุกครั้ง · ตัวนับ `signups` ของลิงก์ **ไม่** เพิ่มที่นี่ — เพิ่มเฉพาะตอนสมัครจริง
 */
export async function recordTouch(ctx: SourceCtx, customerId: string, input: TouchInput): Promise<{ first: TouchDto; last: TouchDto }> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
    select: { id: true },
  });
  if (!customer) throw new MemberNotFoundError();

  const source = normalizeSource(input.source, "รายการช่องทาง");
  const channel = trimOrNull(input.sourceChannel)?.toUpperCase() ?? null;
  if (channel && !getChannel(channel)) {
    throw new MemberInputError(`ช่องทาง "${input.sourceChannel}" ยังไม่มีในทะเบียนช่องทางของระบบ`);
  }
  const occurredAt = input.occurredAt ?? new Date();
  const data = {
    tenantId: ctx.tenantId,
    customerId,
    source,
    linkId: trimOrNull(input.linkId),
    campaignId: trimOrNull(input.campaignId),
    staffUserId: trimOrNull(input.staffUserId),
    referrerCustomerId: trimOrNull(input.referrerCustomerId),
    unitId: trimOrNull(input.unitId),
    occurredAt,
  };

  const [first, last] = await prisma.$transaction([
    prisma.memberAttribution.upsert({
      where: { customerId_touch: { customerId, touch: "FIRST" } },
      create: { ...data, touch: "FIRST" },
      update: {}, // 🔴 จงใจว่าง — FIRST ห้ามทับ
    }),
    prisma.memberAttribution.upsert({
      where: { customerId_touch: { customerId, touch: "LAST" } },
      create: { ...data, touch: "LAST" },
      update: { ...data, touch: "LAST" },
    }),
  ]);
  if (channel) {
    await prisma.customer.update({ where: { id: customerId }, data: { sourceChannel: channel } });
  }
  return { first: toTouchDto(first), last: toTouchDto(last) };
}

/**
 * "ซื้อครั้งแรก" ของสมาชิก → บวกตัวนับให้ลิงก์ที่พาคนนี้เข้ามา (first touch)
 *
 * ผู้เรียกจริงคือ consumer `pos.sale.paid` (M2.8) — ใบนี้เตรียมสัญญาไว้ให้เรียกได้เลย
 * 🔴 ต้อง idempotent: บิลใบเดิมถูกส่งซ้ำ (retry ของคิว) ห้ามทำให้ตัวเลข "ซื้อครั้งแรก" พองขึ้น
 *    ⇒ ธงอยู่ที่ `Customer.sourceDetail.firstPurchaseSaleId` — มีค่าแล้ว = เคยนับไปแล้ว
 */
export async function recordFirstPurchase(
  ctx: SourceCtx,
  customerId: string,
  saleId: string,
): Promise<{ counted: boolean; linkId: string | null; saleId: string }> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
    select: { id: true, sourceDetail: true },
  });
  if (!customer) throw new MemberNotFoundError();
  const detail = detailOf(customer.sourceDetail);
  const already = typeof detail.firstPurchaseSaleId === "string" ? detail.firstPurchaseSaleId : null;
  const first = await prisma.memberAttribution.findUnique({
    where: { customerId_touch: { customerId, touch: "FIRST" } },
    select: { id: true, linkId: true },
  });
  if (already) return { counted: false, linkId: first?.linkId ?? null, saleId: already };

  await prisma.$transaction(async (tx) => {
    detail.firstPurchaseSaleId = saleId;
    await tx.customer.update({ where: { id: customerId }, data: { sourceDetail: detail as Prisma.InputJsonValue } });
    if (first?.linkId) {
      await tx.acquisitionLink.update({ where: { id: first.linkId }, data: { firstPurchases: { increment: 1 } } });
    }
    if (first?.id) {
      // ผูกบิลใบนี้กลับไปที่ "ที่มา" ที่ได้เครดิต (คอลัมน์ `PosSale.attributionId` เตรียมไว้ตั้งแต่ M1.1)
      // ใช้ updateMany เพราะบิลอาจไม่มีจริง (ผู้เรียกทดสอบ/บิลของร้านอื่น) — ไม่มี = ไม่ทำอะไร
      await tx.posSale.updateMany({ where: { id: saleId, tenantId: ctx.tenantId }, data: { attributionId: first.id } });
    }
  });
  return { counted: true, linkId: first?.linkId ?? null, saleId };
}

// ───────────────────────── รายงานตามช่องทาง ─────────────────────────

/**
 * รายงาน "ช่องทางที่มา" (ภาพ 13 · สิทธิ์ `member.report.view`)
 *
 * 🔴 ฐานเวลาของแต่ละคอลัมน์ (มติ Fable · M1.8):
 *    • `signups`  = **`Customer.createdAt`** ในช่วง — "สมาชิกใหม่ของช่วงนี้" ต้องหมายถึงคนที่สมัครในช่วงนี้จริง
 *      (ห้ามใช้เวลาที่บันทึก touch: สมาชิกเก่าทั้งร้านถูก backfill เขียน attribution วันเดียวกันหมด
 *       ⇒ รายงานจะรายงานว่าร้านได้สมาชิกใหม่หลายพันคนในวันที่รัน backfill ซึ่งเป็นคำโกหก)
 *    • `firstTouch` / `lastTouch` = `MemberAttribution.occurredAt` ในช่วง (เวลาที่ "รู้จักกัน" จริง)
 * 🔴 `unitId` = กรองที่ **สาขาของ first touch** (สมาชิกคนนี้ "เป็นของ" สาขาที่หาเขามาได้)
 */
export async function reportBySource(
  ctx: SourceCtx,
  actor: MemberActor,
  range: { from: Date; to: Date; unitId?: string | null },
): Promise<SourceReport> {
  if (!hasMemberPerm(actor, "member.report.view")) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ดูรายงานระบบสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
  const from = range.from;
  const to = range.to;
  const unitId = trimOrNull(range.unitId);

  const customers = await prisma.customer.findMany({
    where: { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, status: { not: "MERGED" } },
    select: { id: true, sourceChannel: true, createdAt: true },
  });
  const channelOf = new Map(customers.map((c) => [c.id, c.sourceChannel]));
  const signedUpInRange = new Set(customers.filter((c) => c.createdAt >= from && c.createdAt <= to).map((c) => c.id));
  const ids = customers.map((c) => c.id);

  // อ่าน touch ทั้งหมดของสมาชิกกลุ่มนี้ (ไม่กรองวันที่ตรงนี้) — ต้องรู้ "first touch ตลอดชีพ" ของทุกคน
  // เพื่อตัดสินว่าคนที่สมัครในช่วงนี้ควรถูกนับเข้าช่องทางไหน แม้ first touch จะเกิดก่อนช่วงที่ดู
  const touches = ids.length
    ? await prisma.memberAttribution.findMany({
        where: { tenantId: ctx.tenantId, customerId: { in: ids } },
        select: { customerId: true, touch: true, source: true, unitId: true, occurredAt: true },
      })
    : [];

  type Touch = { source: MemberSource; unitId: string | null; inRange: boolean };
  type Pair = { first?: Touch; last?: Touch };
  const byCustomer = new Map<string, Pair>();
  for (const t of touches) {
    const cur = byCustomer.get(t.customerId) ?? {};
    const value: Touch = { source: t.source, unitId: t.unitId, inRange: t.occurredAt >= from && t.occurredAt <= to };
    if (t.touch === "FIRST") cur.first = value;
    else cur.last = value;
    byCustomer.set(t.customerId, cur);
  }
  // ขอบเขตสาขา: ดูเฉพาะคนที่ first touch เกิดที่สาขานี้ (สมาชิก "เป็นของ" สาขาที่หาเขามาได้)
  const scoped = [...byCustomer.entries()].filter(([, p]) => (unitId ? p.first?.unitId === unitId : true));

  const key = (source: MemberSource, channel: string | null) => `${source}|${channel ?? ""}`;
  const rows = new Map<string, SourceReportRow>();
  const membersOf = new Map<string, string[]>();
  const rowFor = (source: MemberSource, channel: string | null): SourceReportRow => {
    const k = key(source, channel);
    let row = rows.get(k);
    if (!row) {
      row = {
        source, sourceChannel: channel, signups: 0, firstTouch: 0, lastTouch: 0,
        buyers: 0, repeatBuyers: 0, avgSpentSatang: 0, costSatang: 0, costPerSignupSatang: 0,
      };
      rows.set(k, row);
      membersOf.set(k, []);
    }
    return row;
  };

  for (const [customerId, pair] of scoped) {
    const channel = channelOf.get(customerId) ?? null;
    if (pair.first) {
      const row = rowFor(pair.first.source, channel);
      if (pair.first.inRange) row.firstTouch += 1;
      // สมาชิกใหม่ของช่วงนี้ = สมัครในช่วงนี้ (ไม่ใช่ "ถูกบันทึกที่มาในช่วงนี้")
      if (signedUpInRange.has(customerId)) {
        row.signups += 1;
        membersOf.get(key(pair.first.source, channel))!.push(customerId);
      }
    }
    if (pair.last?.inRange) rowFor(pair.last.source, channel).lastTouch += 1;
  }

  // ผู้ซื้อ/ซื้อซ้ำ/ยอดเฉลี่ย — บิลที่ปิดแล้วของสมาชิกกลุ่มนี้ (คิวรีเดียวสำหรับทุกช่องทาง)
  const scopedIds = scoped.map(([id]) => id);
  const sales = scopedIds.length
    ? await prisma.posSale.groupBy({
        by: ["memberId"],
        where: { tenantId: ctx.tenantId, status: "PAID", memberId: { in: scopedIds } },
        _count: { _all: true },
        _sum: { grandTotalSatang: true },
      })
    : [];
  const spendOf = new Map(sales.map((s) => [s.memberId ?? "", { bills: s._count._all, spent: s._sum.grandTotalSatang ?? 0 }]));

  for (const [k, ids2] of membersOf) {
    const row = rows.get(k)!;
    let spent = 0;
    for (const id of ids2) {
      const s = spendOf.get(id);
      if (!s) continue;
      row.buyers += 1;
      if (s.bills >= 2) row.repeatBuyers += 1;
      spent += s.spent;
    }
    row.avgSpentSatang = row.buyers ? Math.round(spent / row.buyers) : 0;
  }

  // ต้นทุน: ค่าใช้จ่ายของลิงก์ที่สร้างในช่วงนี้ ผูกเข้ากับแถวของช่องทางเดียวกัน
  const linkRows = await prisma.acquisitionLink.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      createdAt: { gte: from, lte: to },
      ...(unitId ? { unitId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  for (const l of linkRows) {
    if (!l.costSatang) continue;
    const row = rowFor(l.source, null);
    row.costSatang += l.costSatang;
  }
  for (const row of rows.values()) {
    row.costPerSignupSatang = row.signups > 0 ? Math.round(row.costSatang / row.signups) : 0;
  }

  const out = [...rows.values()].sort((a, b) => b.signups - a.signups || b.firstTouch - a.firstTouch);
  return {
    rows: out,
    links: linkRows.map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      source: l.source,
      hits: l.hits,
      signups: l.signups,
      firstPurchases: l.firstPurchases,
      costSatang: l.costSatang,
      costPerSignupSatang: l.signups > 0 ? Math.round(l.costSatang / l.signups) : 0,
    })),
    total: out.reduce((s, r) => s + r.signups, 0),
  };
}

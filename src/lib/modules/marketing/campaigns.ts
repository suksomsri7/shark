// campaigns.ts — แคมเปญ v2 (M3.2 · พิมพ์เขียว §4.1 §4.3 §5.9 §7.1 §11.6)
//
// ── สิ่งที่ไฟล์นี้รับผิดชอบ ──────────────────────────────────────────────────
//   กลุ่มเป้าหมาย (M3.1) → แบ่งกลุ่มเทียบ/ข้อความ A-B แบบ **คงที่** → เลือกช่องทางที่ลูกค้ายินยอม
//   **ณ เวลาส่ง** → แนบ voucher รายคน → ส่ง → นับผล (เปิด/ใช้สิทธิ์/ยอด/ต้นทุน/ROI/uplift)
//
// ── กติกาที่ห้ามหัก ────────────────────────────────────────────────────────
// 1) **ห้ามสุ่มสด**: กลุ่มเทียบและข้อความ A/B ตัดสินด้วย hash ของ (แคมเปญ, สมาชิก)
//    ⇒ รันซ้ำ/ส่งต่อ/ดูย้อนหลังได้ผลเดิมเสมอ · ถ้าสุ่มสด วันหนึ่ง "ผลการทดลอง" จะพิสูจน์อะไรไม่ได้เลย
// 2) **ความยินยอมอ่านตอนส่ง ไม่ใช่ตอนสร้าง**: คนที่ถอนความยินยอมหลังกดตั้งเวลา ต้องไม่ได้รับข้อความ
// 3) **คนเดิมในแคมเปญเดิมได้ข้อความครั้งเดียว**: unique(campaignId, customerId) ที่ฐานข้อมูลเป็นด่านจริง
// 4) **ยกเลิกกลางทาง = หยุดคิว ไม่ถอนของที่ส่งไปแล้ว** (ถอนไม่ได้จริงอยู่แล้วในโลกจริง)
// 5) **ตัวเลขห้ามโกหก**: `sent` นับเฉพาะใบที่ตัวส่งตอบว่าสำเร็จ · ล้ม = FAILED พร้อมเหตุผลไทย
//
// ── ทำไมอ่าน Customer / MemberConsent / Voucher ตรงจากที่นี่ ────────────────
//   คำถามของแคมเปญเป็นคำถาม "ของทั้งชุด" (คน 5,000 คนพร้อมกัน) ซึ่ง facade รายคนตอบไม่ไหว
//   (`getConsents` = 2 คำสั่งต่อคน ⇒ 10,000 คำสั่งต่อแคมเปญ) — precedent เดียวกับ `member/segments.ts`
//   ที่อ่าน Voucher/PointBalance ตรง (wo-notes M3.1 §4 ข้อ 10) · ความหมายของค่าเหมือน `getConsents` เป๊ะ:
//   **ไม่มีแถว = ยังไม่ยินยอม**
//   ส่วน "การตัดสินใจ" ทุกอย่าง (ใครเข้ากลุ่ม · ออก voucher · ส่งไลน์) ยังผ่าน facade เท่านั้น

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { sha256 } from "@/lib/core/hash";
import { getSmsProvider, SMS_COST_SATANG } from "@/lib/core/sms";
import { sendPushToCustomerTokens } from "@/lib/core/push";
import { emitOutboxOutsideTx } from "@/lib/core/outbox";
import {
  MEMBER_LIMITS,
  memberLimitError,
  canReadMember,
  hasMemberPerm,
  evaluateSegment,
  getSegment,
  listTierDefs,
  MemberForbiddenError,
  MemberInputError,
  MemberNotFoundError,
  type MemberActor,
} from "@/lib/modules/member";
import { issue as issueVoucher } from "@/lib/modules/voucher";
import { pushToContact } from "@/lib/modules/chat";
import {
  ATTRIBUTION_DAYS,
  CAMPAIGN_CHANNELS,
  CAMPAIGN_CHANNEL_LABELS,
  CHANNEL_SEND_COST_SATANG,
  DEFAULT_EXPECTED_USE_PCT,
  HOLDOUT_MAX_PCT,
  hasContentFor,
  isCampaignChannel,
  parseContent,
  renderMessage,
  roiOf,
  type CampaignChannel,
  type CampaignContent,
  type CampaignDto,
  type CampaignListRow,
  type CampaignPreview,
  type CampaignRecipientRow,
  type CampaignStatsView,
  type CampaignStatus,
  type CampaignVariant,
  type CampaignVariantStatView,
  type RecipientStatus,
  type SaveCampaignInput,
} from "./campaigns-shared";

// ───────────────────────── ชนิดข้อมูล / ctx ─────────────────────────

export type CampaignCtx = {
  tenantId: string;
  /** ระบบ MARKETING ของร้าน (ที่เก็บตัวแคมเปญ) */
  systemId: string;
  /** ระบบสมาชิกที่แคมเปญนี้เล็ง */
  memberSystemId: string;
  actorUserId?: string | null;
};

/** คำขอส่ง 1 ฉบับที่ตัวส่งของแต่ละช่องทางได้รับ (ฉีดแทนได้ทั้งชุดเพื่อทดสอบ) */
export type SendRequest = {
  campaignId: string;
  recipientId: string;
  customerId: string;
  channel: CampaignChannel;
  variant: CampaignVariant;
  /** ปลายทางจริง: LINE = id ช่องทาง · EMAIL = อีเมล · SMS = เบอร์ · PUSH = token */
  to: string;
  /** ข้อความที่แทนตัวแปรแล้ว (อีเมล = เนื้อความ · push = body) */
  body: string;
  subject?: string;
  title?: string;
  /** ลิงก์รูปจุดเดียว 1×1 สำหรับนับ "เปิดอ่าน" ของอีเมล */
  trackPixelUrl?: string;
};

export type SendResult = { ok: boolean; error?: string };
export type SendFn = (req: SendRequest) => Promise<SendResult>;
export type CampaignDeps = { line?: SendFn; email?: SendFn; sms?: SendFn; push?: SendFn };

export type SendCampaignResult = {
  sent: number;
  failed: number;
  skipped: number;
  holdout: number;
  status: CampaignStatus;
};

// ───────────────────────── ตัวช่วยพื้นฐาน ─────────────────────────

const DAY_MS = 86_400_000;
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** ต้นวันตามปฏิทินไทย — โควตา "ต่อวัน" ต้องตรงกับวันที่เจ้าของร้านดู ไม่ใช่วัน UTC */
function thaiDayStart(now: Date): Date {
  return new Date(Math.floor((now.getTime() + BKK_OFFSET_MS) / DAY_MS) * DAY_MS - BKK_OFFSET_MS);
}

function thaiMonthStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(now);
  return new Date(`${parts}-01T00:00:00+07:00`);
}

/**
 * ตำแหน่งของสมาชิกคนนี้บนเส้น 0–100 ของแคมเปญนี้ (คงที่ตลอดกาล)
 * 4 ไบต์แรกของ sha256("<แคมเปญ>:<สมาชิก>") mod 10000 แล้วหาร 100
 */
function hashPct(campaignId: string, customerId: string): number {
  return (parseInt(sha256(`${campaignId}:${customerId}`).slice(0, 8), 16) % 10000) / 100;
}

/** ข้อความ A หรือ B (คงที่) — ไม่มีข้อความ B = A ทุกคน */
function variantOf(campaignId: string, customerId: string, hasB: boolean): "A" | "B" {
  if (!hasB) return "A";
  return parseInt(sha256(`${campaignId}:v:${customerId}`).slice(0, 2), 16) % 2 === 1 ? "B" : "A";
}

function asJson(v: unknown): Prisma.InputJsonValue {
  return (v ?? {}) as Prisma.InputJsonValue;
}

function num(v: unknown): number {
  return typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : 0;
}

const appUrl = (): string => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** ลายเซ็นของลิงก์นับการเปิดอ่าน — กันคนเดายิงนับให้คนอื่น */
function openSig(tenantId: string, recipientId: string): string {
  return sha256(`${tenantId}:${recipientId}:campaign-open`).slice(0, 16);
}

export function openToken(tenantId: string, recipientId: string): string {
  return `${recipientId}.${openSig(tenantId, recipientId)}`;
}

// ───────────────────────── สิทธิ์ ─────────────────────────

function requireRead(actor: MemberActor): void {
  if (!canReadMember(actor)) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์เข้าโมดูลสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

/**
 * สร้าง/ส่ง/ยกเลิกแคมเปญได้ไหม
 * 🔴 คีย์หลักคือ `member.promo.manage` (§6.1) **หรือ** `marketing.campaign.create` —
 *    เหตุผลเดียวกับกลุ่มลูกค้าของ M3.1: คนที่ร้านมอบหมายให้ทำแคมเปญต้องทำงานของตัวเองจนจบได้
 */
export function canManageCampaigns(actor: MemberActor): boolean {
  return hasMemberPerm(actor, "member.promo.manage") || hasMemberPerm(actor, "marketing.campaign.create");
}

function requireManage(actor: MemberActor): void {
  if (!canManageCampaigns(actor)) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์จัดการแคมเปญ — ขอสิทธิ์ member.promo.manage จากเจ้าของร้านก่อน");
  }
}

// ───────────────────────── อ่าน/เขียนตัวแคมเปญ ─────────────────────────

type CampaignRow = {
  id: string;
  tenantId: string;
  systemId: string;
  name: string;
  status: string;
  channels: string[];
  content: Prisma.JsonValue;
  variantB: Prisma.JsonValue | null;
  holdoutPct: number;
  segmentId: string | null;
  segmentJson: Prisma.JsonValue;
  memberSystemId: string | null;
  attachVoucherTemplateId: string | null;
  couponCode: string | null;
  scheduledAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
};

async function loadRow(ctx: CampaignCtx, id: string): Promise<CampaignRow> {
  const row = await prisma.mktCampaign.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!row) throw new MemberNotFoundError("ไม่พบแคมเปญนี้ — อาจถูกลบไปแล้ว");
  return row as unknown as CampaignRow;
}

/** นิยามกลุ่มเป้าหมายที่ **แช่แข็งไว้ตอนสร้าง** — cron ส่งแทนได้โดยไม่ต้องมีสิทธิ์ของคนกดปุ่ม */
function definitionOf(row: CampaignRow): unknown {
  const seg = (row.segmentJson ?? {}) as Record<string, unknown>;
  return seg.definition ?? { groups: [] };
}

function channelsOf(row: { channels: string[] }): CampaignChannel[] {
  return row.channels.filter(isCampaignChannel);
}

function statusOf(row: { status: string }): CampaignStatus {
  const s = row.status;
  return s === "SCHEDULED" || s === "SENT" || s === "CANCELLED" ? s : "DRAFT";
}

function assertInput(input: SaveCampaignInput): {
  name: string;
  channels: CampaignChannel[];
  content: CampaignContent;
  variantB: CampaignContent | null;
  holdoutPct: number;
  scheduledAt: Date | null;
} {
  const name = String(input?.name ?? "").trim();
  if (!name) throw new MemberInputError("ตั้งชื่อแคมเปญก่อนบันทึก — ชื่อช่วยให้ทีมรู้ว่าแคมเปญนี้ทำอะไร");
  if (name.length > 120) throw new MemberInputError("ชื่อแคมเปญยาวเกินไป — ใช้ได้ไม่เกิน 120 ตัวอักษร");

  const channels = [...new Set((input?.channels ?? []).map((c) => String(c).toUpperCase()))].filter(isCampaignChannel);
  if (channels.length === 0) {
    throw new MemberInputError("เลือกช่องทางอย่างน้อย 1 ช่องก่อน (LINE / อีเมล / SMS / push)");
  }

  const content = parseContent(input?.content);
  const missing = channels.filter((c) => !hasContentFor(content, c));
  if (missing.length === channels.length) {
    throw new MemberInputError("ยังไม่ได้พิมพ์ข้อความของช่องทางที่เลือกไว้เลย — พิมพ์อย่างน้อย 1 ช่องก่อนบันทึก");
  }

  const rawHoldout = Number(input?.holdoutPct ?? 0);
  if (!Number.isFinite(rawHoldout) || rawHoldout < 0) throw new MemberInputError("สัดส่วนกลุ่มเทียบต้องเป็นตัวเลข 0 ขึ้นไป");
  const holdoutPct = Math.round(rawHoldout);
  if (holdoutPct > HOLDOUT_MAX_PCT) {
    throw new MemberInputError(`กันกลุ่มเทียบได้ไม่เกิน ${HOLDOUT_MAX_PCT}% ของกลุ่มเป้าหมาย — มากกว่านี้แคมเปญจะเหลือคนรับน้อยเกินกว่าจะวัดผลได้`);
  }

  const variantBRaw = input?.variantB ? parseContent(input.variantB) : null;
  const variantB = variantBRaw && Object.keys(variantBRaw).length > 0 ? variantBRaw : null;

  const scheduledAt = input?.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new MemberInputError("วันเวลาที่ตั้งส่งไม่ถูกต้อง — เลือกใหม่อีกครั้ง");

  return { name, channels, content, variantB, holdoutPct, scheduledAt };
}

async function segmentSnapshot(
  ctx: CampaignCtx,
  actor: MemberActor,
  input: SaveCampaignInput,
): Promise<{ segmentId: string | null; segmentJson: Prisma.InputJsonValue }> {
  const memberCtx = { tenantId: ctx.tenantId, systemId: ctx.memberSystemId, actorUserId: ctx.actorUserId ?? null };
  if (input?.segmentId) {
    const seg = await getSegment(memberCtx, actor, input.segmentId);
    return { segmentId: seg.id, segmentJson: asJson({ segmentId: seg.id, name: seg.name, definition: seg.definition }) };
  }
  if (input?.definition) {
    return { segmentId: null, segmentJson: asJson({ definition: input.definition }) };
  }
  throw new MemberInputError("ยังไม่ได้เลือกกลุ่มเป้าหมาย — เลือกกลุ่มที่บันทึกไว้ หรือตั้งเงื่อนไขเองก่อน");
}

export async function createCampaignV2(ctx: CampaignCtx, actor: MemberActor, input: SaveCampaignInput): Promise<{ id: string }> {
  requireManage(actor);
  const v = assertInput(input);
  const seg = await segmentSnapshot(ctx, actor, input);

  // §11.9 — เพดาน campaignsPerMonth ต่อระบบ (เดือนไทย) · แพ็กเกจของร้านทับค่าปริยายได้
  const monthCap = await limitOf(ctx.tenantId, "campaignsPerMonth", MEMBER_LIMITS.campaignsPerMonth);
  const usedThisMonth = await prisma.mktCampaign.count({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, createdAt: { gte: thaiMonthStart(new Date()) } },
  });
  if (usedThisMonth >= monthCap) {
    throw memberLimitError(`สร้างแคมเปญได้เดือนละ ${monthCap} ใบ — เดือนนี้ครบแล้ว รอเดือนหน้าหรืออัปแพ็กเกจ`);
  }

  const row = await prisma.mktCampaign.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      memberSystemId: ctx.memberSystemId,
      name: v.name,
      channel: v.channels[0]!,
      channels: v.channels,
      content: asJson(v.content),
      variantB: v.variantB ? asJson(v.variantB) : undefined,
      holdoutPct: v.holdoutPct,
      segmentId: seg.segmentId,
      segmentJson: seg.segmentJson,
      attachVoucherTemplateId: input?.attachVoucherTemplateId?.trim() || null,
      couponCode: input?.couponCode?.trim() || null,
      scheduledAt: v.scheduledAt,
      status: v.scheduledAt ? "SCHEDULED" : "DRAFT",
      scheduledBy: v.scheduledAt ? (ctx.actorUserId ?? null) : null,
      message: v.content.line ?? v.content.sms ?? v.content.email?.body ?? "",
    },
  });
  return { id: row.id };
}

export async function updateCampaignV2(ctx: CampaignCtx, actor: MemberActor, id: string, input: SaveCampaignInput): Promise<{ id: string }> {
  requireManage(actor);
  const row = await loadRow(ctx, id);
  if (row.status === "SENT" || row.status === "CANCELLED") {
    throw new MemberInputError("แคมเปญที่ส่งหรือยกเลิกไปแล้วแก้ไม่ได้ — ทำสำเนาแล้วแก้ใบใหม่แทน");
  }
  const v = assertInput(input);
  const seg = await segmentSnapshot(ctx, actor, input);
  await prisma.mktCampaign.update({
    where: { id: row.id },
    data: {
      name: v.name,
      channel: v.channels[0]!,
      channels: v.channels,
      content: asJson(v.content),
      variantB: v.variantB ? asJson(v.variantB) : Prisma.DbNull,
      holdoutPct: v.holdoutPct,
      segmentId: seg.segmentId,
      segmentJson: seg.segmentJson,
      attachVoucherTemplateId: input?.attachVoucherTemplateId?.trim() || null,
      couponCode: input?.couponCode?.trim() || null,
      scheduledAt: v.scheduledAt,
      status: v.scheduledAt ? "SCHEDULED" : "DRAFT",
      scheduledBy: v.scheduledAt ? (ctx.actorUserId ?? null) : null,
      message: v.content.line ?? v.content.sms ?? v.content.email?.body ?? "",
    },
  });
  return { id: row.id };
}

function toDto(row: CampaignRow): CampaignDto {
  const seg = (row.segmentJson ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    name: row.name,
    status: statusOf(row),
    segmentId: row.segmentId,
    segmentName: typeof seg.name === "string" ? seg.name : null,
    channels: channelsOf(row),
    content: parseContent(row.content),
    variantB: row.variantB ? parseContent(row.variantB) : null,
    holdoutPct: row.holdoutPct,
    attachVoucherTemplateId: row.attachVoucherTemplateId,
    couponCode: row.couponCode,
    scheduledAt: row.scheduledAt,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
  };
}

/**
 * หา (หรือเปิดใช้) "ระบบการตลาด" ของร้าน แล้วประกอบ ctx ให้ผู้เรียก
 *
 * 🔴 แคมเปญเป็นของระบบ MARKETING แต่ผู้ใช้เข้ามาจากหน้าระบบสมาชิก ⇒ ต้องแปลให้ตรงนี้ที่เดียว
 *    (ถ้าปล่อยให้แต่ละหน้าหาเอง วันหนึ่งจะมี 2 ระบบการตลาดในร้านเดียวโดยไม่มีใครตั้งใจ)
 * 🔴 `create` = true ได้เฉพาะคนที่จัดการแคมเปญได้ — คนที่แค่เปิดดูต้องไม่สร้างระบบใหม่ให้ร้าน
 */
export async function resolveCampaignCtx(
  tenantId: string,
  memberSystemId: string,
  actorUserId: string | null,
  opts: { create?: boolean } = {},
): Promise<CampaignCtx> {
  const found = await prisma.appSystem.findFirst({
    where: { tenantId, type: "MARKETING" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (found) return { tenantId, systemId: found.id, memberSystemId, actorUserId };
  if (!opts.create) return { tenantId, systemId: "", memberSystemId, actorUserId };
  const made = await prisma.appSystem.create({ data: { tenantId, type: "MARKETING", name: "แคมเปญการตลาด" } });
  return { tenantId, systemId: made.id, memberSystemId, actorUserId };
}

export async function getCampaign(ctx: CampaignCtx, actor: MemberActor, id: string): Promise<CampaignDto> {
  requireRead(actor);
  return toDto(await loadRow(ctx, id));
}

// ───────────────────────── กลุ่มเป้าหมาย + ที่อยู่ปลายทาง ─────────────────────────

type AudienceMember = {
  id: string;
  name: string;
  memberCode: string;
  email: string | null;
  phone: string | null;
  tierDefId: string | null;
  tier: string;
};

async function audienceOf(ctx: CampaignCtx, row: CampaignRow): Promise<AudienceMember[]> {
  const memberSystemId = row.memberSystemId ?? ctx.memberSystemId;
  const memberCtx = { tenantId: ctx.tenantId, systemId: memberSystemId, actorUserId: ctx.actorUserId ?? null };
  const where = await evaluateSegment(memberCtx, definitionOf(row));
  const rows = await prisma.customer.findMany({
    where: { ...where, tenantId: ctx.tenantId, memberSystemId },
    select: { id: true, name: true, firstName: true, lastName: true, memberCode: true, email: true, phone: true, tierDefId: true, tier: true },
    orderBy: { id: "asc" },
  });
  return rows.map((c) => ({
    id: c.id,
    name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.name || "สมาชิก",
    memberCode: c.memberCode ?? "",
    email: c.email,
    phone: c.phone,
    tierDefId: c.tierDefId,
    tier: c.tier,
  }));
}

type AddressBook = {
  consent: Map<string, Set<string>>;
  line: Map<string, string>;
  push: Map<string, string[]>;
  tierName: Map<string, string>;
  smsOpen: boolean;
};

async function addressBookOf(ctx: CampaignCtx, row: CampaignRow, members: AudienceMember[]): Promise<AddressBook> {
  const ids = members.map((m) => m.id);
  const memberSystemId = row.memberSystemId ?? ctx.memberSystemId;
  const [consents, identities, devices, tiers] = await Promise.all([
    prisma.memberConsent.findMany({
      where: { tenantId: ctx.tenantId, customerId: { in: ids }, granted: true },
      select: { customerId: true, channel: true },
    }),
    prisma.memberChannelIdentity.findMany({
      where: { tenantId: ctx.tenantId, channel: "LINE", customerId: { in: ids } },
      select: { customerId: true, externalId: true },
    }),
    prisma.memberPushDevice.findMany({
      where: { tenantId: ctx.tenantId, customerId: { in: ids } },
      select: { customerId: true, token: true },
    }),
    listTierDefs({ tenantId: ctx.tenantId, systemId: memberSystemId, actorUserId: ctx.actorUserId ?? null }),
  ]);

  const consent = new Map<string, Set<string>>();
  for (const c of consents) {
    const set = consent.get(c.customerId) ?? new Set<string>();
    set.add(c.channel);
    consent.set(c.customerId, set);
  }
  const line = new Map<string, string>();
  for (const i of identities) if (!line.has(i.customerId)) line.set(i.customerId, i.externalId);
  const push = new Map<string, string[]>();
  for (const d of devices) push.set(d.customerId, [...(push.get(d.customerId) ?? []), d.token]);
  const tierName = new Map<string, string>();
  for (const t of tiers) tierName.set(t.id, t.name);

  return { consent, line, push, tierName, smsOpen: getSmsProvider() !== null };
}

type Pick = { channel: CampaignChannel; to: string };

/**
 * ช่องทางแรกใน `channels` ที่ลูกค้า **ยินยอม ณ ตอนนี้** และมีที่อยู่ให้ส่งจริง
 * คืน `null` พร้อมเหตุผลไทยเมื่อไม่มีช่องไหนใช้ได้ (ผู้เรียกบันทึกเป็น SKIPPED)
 */
function pickChannel(
  channels: CampaignChannel[],
  content: CampaignContent,
  m: AudienceMember,
  book: AddressBook,
): { pick: Pick | null; reason: string } {
  const granted = book.consent.get(m.id) ?? new Set<string>();
  const notes: string[] = [];
  for (const ch of channels) {
    if (!hasContentFor(content, ch)) {
      notes.push(`${CAMPAIGN_CHANNEL_LABELS[ch]}: ยังไม่ได้พิมพ์ข้อความ`);
      continue;
    }
    if (!granted.has(ch)) {
      notes.push(`${CAMPAIGN_CHANNEL_LABELS[ch]}: ยังไม่ได้ยินยอมรับข่าวสาร`);
      continue;
    }
    if (ch === "LINE") {
      const id = book.line.get(m.id);
      if (id) return { pick: { channel: "LINE", to: id }, reason: "" };
      notes.push("LINE: ยังไม่ได้ผูกบัญชีไลน์กับสมาชิกคนนี้");
      continue;
    }
    if (ch === "EMAIL") {
      if (m.email?.trim()) return { pick: { channel: "EMAIL", to: m.email.trim() }, reason: "" };
      notes.push("อีเมล: ยังไม่มีอีเมลในโปรไฟล์");
      continue;
    }
    if (ch === "SMS") {
      if (!book.smsOpen) {
        notes.push("SMS: ร้านยังไม่ได้เชื่อมเกตเวย์ SMS");
        continue;
      }
      if (m.phone?.trim()) return { pick: { channel: "SMS", to: m.phone.trim() }, reason: "" };
      notes.push("SMS: ยังไม่มีเบอร์ในโปรไฟล์");
      continue;
    }
    const tokens = book.push.get(m.id) ?? [];
    if (tokens.length > 0) return { pick: { channel: "PUSH", to: tokens.join(",") }, reason: "" };
    notes.push("push: ยังไม่ได้ลงแอปหรือปิดแจ้งเตือนไว้");
  }
  // 🔴 ข้อความนี้ต้องบอกครบทั้งสองเหตุผลเสมอ (ยังไม่ได้ผูกช่องทาง / ยกเลิกรับข่าวสาร)
  //    หน้ารายละเอียดแคมเปญคือที่เดียวที่ทีมจะรู้ว่า "ทำไมคนนี้ไม่ได้รับ" — ต้องตอบให้ตรงจุด
  return {
    pick: null,
    reason: `ยังไม่ได้ส่ง — ไม่มีช่องทางที่ส่งถึงคนนี้ได้ (ยังไม่ได้ผูกช่องทาง หรือยกเลิกรับข่าวสารไว้)${notes.length ? ` · ${notes.join(" · ")}` : ""}`,
  };
}

// ───────────────────────── เพดาน ─────────────────────────

async function limitOf(tenantId: string, key: "messagesPerDay" | "campaignsPerMonth", fallback: number): Promise<number> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { limits: true } });
  const limits = (t?.limits ?? {}) as Record<string, unknown>;
  const member = (limits.member ?? {}) as Record<string, unknown>;
  const v = Number(member[key]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

async function remainingMessagesToday(tenantId: string, now: Date): Promise<{ cap: number; remaining: number }> {
  const cap = await limitOf(tenantId, "messagesPerDay", MEMBER_LIMITS.messagesPerDay);
  const sentToday = await prisma.mktRecipient.count({
    where: { tenantId, status: "SENT", sentAt: { gte: thaiDayStart(now) } },
  });
  return { cap, remaining: Math.max(0, cap - sentToday) };
}

// ───────────────────────── วางแผนส่ง (ใช้ร่วมกันระหว่าง preview กับ send) ─────────────────────────

type Plan =
  | { kind: "HOLDOUT"; member: AudienceMember; existingId: string | null }
  | { kind: "SKIP"; member: AudienceMember; reason: string; existingId: string | null }
  | { kind: "SEND"; member: AudienceMember; pick: Pick; variant: "A" | "B"; existingId: string | null };

type RecipientRow = { id: string; customerId: string | null; status: string; variant: string | null; channel: string | null };

async function buildPlan(
  ctx: CampaignCtx,
  row: CampaignRow,
): Promise<{ plans: Plan[]; audience: AudienceMember[]; book: AddressBook; done: RecipientRow[] }> {
  const audience = await audienceOf(ctx, row);
  const book = await addressBookOf(ctx, row, audience);
  const existing = (await prisma.mktRecipient.findMany({
    where: { tenantId: ctx.tenantId, campaignId: row.id },
    select: { id: true, customerId: true, status: true, variant: true, channel: true },
  })) as RecipientRow[];
  const byCustomer = new Map<string, RecipientRow>();
  for (const r of existing) if (r.customerId) byCustomer.set(r.customerId, r);

  const channels = channelsOf(row);
  const content = parseContent(row.content);
  const hasB = !!row.variantB;
  const plans: Plan[] = [];
  const done: RecipientRow[] = [];

  for (const m of audience) {
    const ex = byCustomer.get(m.id) ?? null;
    // ทำไปแล้ว (ส่งแล้ว/ข้ามแล้ว/กลุ่มเทียบ) — ส่งซ้ำได้เฉพาะ PENDING/FAILED
    if (ex && ex.status !== "PENDING" && ex.status !== "FAILED") {
      done.push(ex);
      continue;
    }

    if (!ex && row.holdoutPct > 0 && hashPct(row.id, m.id) < row.holdoutPct) {
      plans.push({ kind: "HOLDOUT", member: m, existingId: null });
      continue;
    }
    const { pick, reason } = pickChannel(channels, content, m, book);
    if (!pick) {
      plans.push({ kind: "SKIP", member: m, reason, existingId: ex?.id ?? null });
      continue;
    }
    plans.push({ kind: "SEND", member: m, pick, variant: variantOf(row.id, m.id, hasB), existingId: ex?.id ?? null });
  }
  return { plans, audience, book, done };
}

/** มูลค่าต่อใบของ voucher ที่แคมเปญนี้แนบ (0 = ไม่ได้แนบ) */
async function attachedVoucherValue(ctx: CampaignCtx, row: CampaignRow): Promise<number> {
  if (!row.attachVoucherTemplateId) return 0;
  const tpl = await prisma.voucherTemplate.findFirst({
    where: { id: row.attachVoucherTemplateId, tenantId: ctx.tenantId },
    select: { value: true },
  });
  return tpl?.value ?? 0;
}

/** ค่ากลางของ "% ใช้สิทธิ์" จากแคมเปญก่อนหน้าของระบบนี้ (ไม่มีสถิติ = ค่าปริยาย) */
async function expectedUsePct(ctx: CampaignCtx, excludeCampaignId: string): Promise<number> {
  const rows = await prisma.campaignVariantStat.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, sent: { gt: 0 }, campaignId: { not: excludeCampaignId } },
    select: { sent: true, used: true },
  });
  if (rows.length === 0) return DEFAULT_EXPECTED_USE_PCT;
  const pcts = rows.map((r) => (r.used / r.sent) * 100).sort((a, b) => a - b);
  const mid = Math.floor(pcts.length / 2);
  const median = pcts.length % 2 === 1 ? pcts[mid]! : ((pcts[mid - 1]! + pcts[mid]!) / 2);
  return Math.round(median * 10) / 10;
}

export async function previewCampaign(ctx: CampaignCtx, actor: MemberActor, id: string): Promise<CampaignPreview> {
  requireRead(actor);
  const row = await loadRow(ctx, id);
  const { plans, audience, done } = await buildPlan(ctx, row);

  const byChannel = { LINE: 0, EMAIL: 0, SMS: 0, PUSH: 0, none: 0 };
  let willSend = 0;
  let holdout = 0;
  let smsCount = 0;
  for (const p of plans) {
    if (p.kind === "HOLDOUT") holdout += 1;
    else if (p.kind === "SKIP") byChannel.none += 1;
    else {
      willSend += 1;
      byChannel[p.pick.channel] += 1;
      if (p.pick.channel === "SMS") smsCount += 1;
    }
  }
  // คนที่ตัดสินไปแล้วรอบก่อน (ส่ง/ข้าม/กลุ่มเทียบ) ไม่อยู่ใน plans — ยังต้องนับให้ครบกลุ่มเป้าหมาย
  // 🔴 "จะส่งจริง" นับเฉพาะข้อความที่ **ยังไม่ได้ส่ง** (ที่ส่งแล้วไม่ถูกส่งซ้ำ) ⇒ เข้าช่อง none
  for (const d of done) {
    if (d.status === "HOLDOUT") holdout += 1;
    else byChannel.none += 1;
  }

  const voucherValue = await attachedVoucherValue(ctx, row);
  const { remaining } = await remainingMessagesToday(ctx.tenantId, new Date());

  return {
    audience: audience.length,
    willSend,
    holdout,
    byChannel,
    maxCostSatang: willSend * voucherValue + smsCount * SMS_COST_SATANG,
    expectedUsePct: await expectedUsePct(ctx, row.id),
    remainingToday: remaining,
    overCap: willSend > remaining,
  };
}

// ───────────────────────── ตัวส่งจริง (ปริยาย · ฉีดแทนได้) ─────────────────────────

function defaultDeps(tenantId: string, systemId: string | null): Required<CampaignDeps> {
  return {
    line: async (req) => {
      const r = await pushToContact({ tenantId, channel: "LINE", externalUserId: req.to, text: req.body, customerId: req.customerId, systemId });
      return { ok: r.ok, error: r.reason };
    },
    email: async (req) => {
      // 🔴 import แบบ dynamic โดยตั้งใจ: `core/email` ลากถึง `@/lib/env` ซึ่ง **ตรวจ env ตอนโหลดไฟล์**
      //    ไฟล์นี้ถูกดึงเข้ากราฟของ `outbox-consumers.ts` (ทะเบียนคิว) ที่ต้องอ่านได้แม้ไม่มี env
      //    (fitness รัน 2 โหมด · บทเรียน `reference_shark_precommit_fitness_no_env`)
      const { sendEmail } = await import("@/lib/core/email");
      await sendEmail(req.to, req.subject ?? "ข่าวสารจากร้าน", req.body);
      return { ok: true };
    },
    sms: async (req) => {
      const provider = getSmsProvider();
      if (!provider) return { ok: false, error: "ร้านยังไม่ได้เชื่อมเกตเวย์ SMS" };
      const r = await provider.send({ to: req.to, text: req.body });
      return { ok: r.ok, error: r.error };
    },
    push: async (req) => {
      const r = await sendPushToCustomerTokens(tenantId, req.to.split(","), { title: req.title ?? "ข่าวสารจากร้าน", body: req.body });
      return { ok: r.sent > 0, error: r.sent > 0 ? undefined : (r.failures[0] ?? "ส่งแจ้งเตือนไม่ถึงเครื่องของลูกค้า") };
    },
  };
}

function bodyFor(content: CampaignContent, channel: CampaignChannel): { body: string; subject?: string; title?: string } {
  if (channel === "LINE") return { body: content.line ?? "" };
  if (channel === "SMS") return { body: content.sms ?? "" };
  if (channel === "EMAIL") return { body: content.email?.body ?? "", subject: content.email?.subject ?? "" };
  return { body: content.push?.body ?? "", title: content.push?.title ?? "" };
}

// ───────────────────────── ส่ง ─────────────────────────

export type SendOptions = { now?: Date; deps?: CampaignDeps };

export async function sendCampaignV2(
  ctx: CampaignCtx,
  actor: MemberActor,
  id: string,
  opts: SendOptions = {},
): Promise<SendCampaignResult> {
  requireManage(actor);
  const row = await loadRow(ctx, id);
  if (row.status === "CANCELLED") {
    throw new MemberInputError("แคมเปญนี้ถูกยกเลิกไปแล้ว — ทำสำเนาแล้วส่งใบใหม่ได้");
  }
  const now = opts.now ?? new Date();

  // ตั้งเวลาไว้ข้างหน้า → ยังไม่ส่ง (cron รายชั่วโมงมารับช่วงเมื่อถึงเวลา)
  if (row.scheduledAt && row.scheduledAt.getTime() > now.getTime()) {
    await prisma.mktCampaign.update({
      where: { id: row.id },
      data: { status: "SCHEDULED", scheduledBy: ctx.actorUserId ?? null },
    });
    return { sent: 0, failed: 0, skipped: 0, holdout: 0, status: "SCHEDULED" };
  }

  return runSend(ctx, row, actor, now, opts.deps);
}

async function runSend(
  ctx: CampaignCtx,
  row: CampaignRow,
  actor: MemberActor,
  now: Date,
  depsIn?: CampaignDeps,
): Promise<SendCampaignResult> {
  const deps = { ...defaultDeps(ctx.tenantId, null), ...(depsIn ?? {}) };
  const { plans } = await buildPlan(ctx, row);
  const sendPlans = plans.filter((p): p is Extract<Plan, { kind: "SEND" }> => p.kind === "SEND");

  // §11.6 — เพดานข้อความต่อวันของร้าน · ตรวจ **ก่อน** สร้างแถวผู้รับใด ๆ
  const { cap, remaining } = await remainingMessagesToday(ctx.tenantId, now);
  if (sendPlans.length > remaining) {
    throw memberLimitError(
      `ร้านส่งข้อความถึงลูกค้าได้วันละ ${cap.toLocaleString("th-TH")} ข้อความ — วันนี้เหลือ ${remaining.toLocaleString("th-TH")} ข้อความ แต่แคมเปญนี้ต้องส่ง ${sendPlans.length.toLocaleString("th-TH")} ข้อความ (ตั้งเวลาเป็นพรุ่งนี้ หรือแบ่งส่งเป็นรอบได้)`,
    );
  }

  // สร้างแถวที่ยังไม่มี (ครั้งเดียวต่อคน — ฐานข้อมูลกันซ้ำด้วย unique(campaignId, customerId))
  const newRows = plans.filter((p) => !p.existingId);
  if (newRows.length > 0) {
    await prisma.mktRecipient.createMany({
      data: newRows.map((p) => ({
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        campaignId: row.id,
        customerId: p.member.id,
        contact: p.kind === "SEND" ? p.pick.to.slice(0, 190) : (p.member.phone ?? p.member.email ?? ""),
        channel: p.kind === "SEND" ? p.pick.channel : null,
        variant: p.kind === "HOLDOUT" ? "HOLDOUT" : p.kind === "SEND" ? p.variant : variantOf(row.id, p.member.id, !!row.variantB),
        holdout: p.kind === "HOLDOUT",
        status: p.kind === "HOLDOUT" ? "HOLDOUT" : p.kind === "SKIP" ? "SKIPPED" : "PENDING",
        error: p.kind === "SKIP" ? p.reason : null,
      })),
      skipDuplicates: true,
    });
  }
  // รอบส่งซ้ำ: คนที่เคย PENDING/FAILED แล้วตอนนี้ส่งไม่ได้แล้ว → ข้ามพร้อมเหตุผลใหม่
  for (const p of plans) {
    if (p.kind === "SKIP" && p.existingId) {
      await prisma.mktRecipient.update({ where: { id: p.existingId }, data: { status: "SKIPPED", error: p.reason } });
    }
  }

  // id ของแถวที่ต้องส่งจริง
  const ids = new Map<string, string>();
  if (sendPlans.length > 0) {
    const rows = await prisma.mktRecipient.findMany({
      where: { tenantId: ctx.tenantId, campaignId: row.id, customerId: { in: sendPlans.map((p) => p.member.id) } },
      select: { id: true, customerId: true },
    });
    for (const r of rows) if (r.customerId) ids.set(r.customerId, r.id);
  }

  const content = parseContent(row.content);
  const contentB = row.variantB ? parseContent(row.variantB) : content;
  const book = await addressBookOf(ctx, row, sendPlans.map((p) => p.member));
  const voucherByCustomer = await existingCampaignVouchers(ctx, row);

  let sent = 0;
  let failed = 0;
  for (const p of sendPlans) {
    const recipientId = ids.get(p.member.id);
    if (!recipientId) continue;
    const result = await sendOne(ctx, row, actor, p, recipientId, p.variant === "B" ? contentB : content, book, voucherByCustomer, deps, now);
    if (result) sent += 1;
    else failed += 1;
  }

  const counts = await prisma.mktRecipient.groupBy({
    by: ["status"],
    where: { tenantId: ctx.tenantId, campaignId: row.id },
    _count: { _all: true },
  });
  const countOf = (s: RecipientStatus): number => counts.find((c) => c.status === s)?._count._all ?? 0;
  const audienceCount = counts.reduce((n, c) => n + c._count._all, 0);

  await prisma.mktCampaign.update({
    where: { id: row.id },
    data: { status: "SENT", sentAt: row.sentAt ?? now, audienceCount },
  });
  await refreshStats(ctx.tenantId, row.id);

  // §7.1 — event ยิงเฉพาะเมื่อ "มีอะไรถูกส่งจริง" (ส่งซ้ำแล้วไม่มีใครใหม่ = ไม่ใช่เหตุการณ์)
  if (sent > 0) {
    const variants = await prisma.mktRecipient.groupBy({
      by: ["variant"],
      where: { tenantId: ctx.tenantId, campaignId: row.id, status: "SENT" },
      _count: { _all: true },
    });
    await emitOutboxOutsideTx({
      tenantId: ctx.tenantId,
      type: "campaign.sent",
      idempotencyKey: `campaign.sent#${row.id}#${now.getTime()}`,
      systemId: ctx.systemId,
      payload: {
        campaignId: row.id,
        name: row.name,
        sent,
        holdout: countOf("HOLDOUT"),
        variants: Object.fromEntries(variants.map((v) => [v.variant ?? "A", v._count._all])),
      },
    });
  }

  return { sent, failed, skipped: countOf("SKIPPED"), holdout: countOf("HOLDOUT"), status: "SENT" };
}

/** voucher ของแคมเปญนี้ที่เคยออกไปแล้ว (กันออกซ้ำตอนส่งรอบสอง) */
async function existingCampaignVouchers(ctx: CampaignCtx, row: CampaignRow): Promise<Map<string, { id: string; code: string }>> {
  const out = new Map<string, { id: string; code: string }>();
  if (!row.attachVoucherTemplateId) return out;
  const rows = await prisma.voucher.findMany({
    where: { tenantId: ctx.tenantId, origin: "CAMPAIGN", originRef: { path: ["campaignId"], equals: row.id } },
    select: { id: true, code: true, customerId: true },
  });
  for (const v of rows) if (v.customerId) out.set(v.customerId, { id: v.id, code: v.code });
  return out;
}

async function sendOne(
  ctx: CampaignCtx,
  row: CampaignRow,
  actor: MemberActor,
  plan: Extract<Plan, { kind: "SEND" }>,
  recipientId: string,
  content: CampaignContent,
  book: AddressBook,
  voucherByCustomer: Map<string, { id: string; code: string }>,
  deps: Required<CampaignDeps>,
  now: Date,
): Promise<boolean> {
  const m = plan.member;

  // 1) แนบ voucher รายคน (idempotent ต่อ สมาชิก+แคมเปญ) — ต้องมีก่อนเขียนข้อความ เพราะข้อความอ้างรหัสใบ
  let voucher = voucherByCustomer.get(m.id) ?? null;
  if (row.attachVoucherTemplateId && !voucher) {
    try {
      const res = await issueVoucher(
        { tenantId: ctx.tenantId, systemId: row.memberSystemId ?? ctx.memberSystemId, actorUserId: ctx.actorUserId ?? null },
        actor,
        {
          customerIds: [m.id],
          templateId: row.attachVoucherTemplateId,
          origin: "CAMPAIGN",
          originRef: { campaignId: row.id },
          reason: `แคมเปญ ${row.name}`,
        },
      );
      if ("pending" in res && res.pending) {
        await prisma.mktRecipient.update({
          where: { id: recipientId },
          data: { status: "FAILED", error: "voucher ของแคมเปญนี้เกินเพดานที่ออกได้เอง — รออนุมัติก่อนแล้วส่งอีกครั้ง" },
        });
        return false;
      }
      const issued = res.vouchers[0];
      if (issued) {
        voucher = { id: issued.id, code: issued.code };
        voucherByCustomer.set(m.id, voucher);
      }
    } catch (e) {
      await prisma.mktRecipient.update({
        where: { id: recipientId },
        data: { status: "FAILED", error: `ออก voucher ให้คนนี้ไม่สำเร็จ: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}` },
      });
      return false;
    }
  }

  // 2) ข้อความที่แทนตัวแปรแล้ว
  const vars = {
    ชื่อ: m.name,
    ระดับ: (m.tierDefId ? book.tierName.get(m.tierDefId) : null) ?? m.tier,
    voucher: voucher?.code ?? row.couponCode ?? "",
    รหัสสมาชิก: m.memberCode,
  };
  const raw = bodyFor(content, plan.pick.channel);
  const req: SendRequest = {
    campaignId: row.id,
    recipientId,
    customerId: m.id,
    channel: plan.pick.channel,
    variant: plan.variant,
    to: plan.pick.to,
    body: renderMessage(raw.body, vars),
    ...(raw.subject !== undefined ? { subject: renderMessage(raw.subject, vars) } : {}),
    ...(raw.title !== undefined ? { title: renderMessage(raw.title, vars) } : {}),
    ...(plan.pick.channel === "EMAIL"
      ? { trackPixelUrl: `${appUrl()}/api/m/track/o/${openToken(ctx.tenantId, recipientId)}.gif` }
      : {}),
  };

  // 3) ส่ง — ตัวส่งล้ม (คืน ok:false หรือโยน) = FAILED ของคนนี้เท่านั้น ห้ามล้มทั้งแคมเปญ
  let result: SendResult;
  try {
    result = await deps[plan.pick.channel.toLowerCase() as "line" | "email" | "sms" | "push"](req);
  } catch (e) {
    result = { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }

  await prisma.mktRecipient.update({
    where: { id: recipientId },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      channel: plan.pick.channel,
      variant: plan.variant,
      contact: plan.pick.to.slice(0, 190),
      sentAt: result.ok ? now : null,
      error: result.ok ? null : (result.error ?? "ส่งไม่สำเร็จ"),
      voucherId: voucher?.id ?? null,
    },
  });
  return result.ok;
}

// ───────────────────────── ตั้งเวลา / ยกเลิก ─────────────────────────

/**
 * cron รายชั่วโมง — แคมเปญที่ตั้งเวลาไว้และถึงเวลาแล้ว (ทุกร้าน)
 * 🔴 ข้ามใบที่ถูกยกเลิก/ส่งแล้วเสมอ · ร้านเดียวพังต้องไม่ล้มทั้งรอบ
 */
export async function sendDueCampaigns(opts: { now?: Date; limit?: number } = {}): Promise<{ campaigns: number; sent: number }> {
  const now = opts.now ?? new Date();
  const due = await prisma.mktCampaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { not: null, lte: now } },
    select: { id: true, tenantId: true, systemId: true, memberSystemId: true, scheduledBy: true },
    orderBy: { scheduledAt: "asc" },
    take: opts.limit ?? 50,
  });
  let campaigns = 0;
  let sent = 0;
  for (const c of due) {
    if (!c.memberSystemId) continue;
    try {
      const ctx: CampaignCtx = {
        tenantId: c.tenantId,
        systemId: c.systemId,
        memberSystemId: c.memberSystemId,
        actorUserId: c.scheduledBy,
      };
      const row = await loadRow(ctx, c.id);
      // cron ทำงานแทนคนที่กดตั้งเวลาไว้ — สิทธิ์ถูกตรวจไปแล้วตอนกด (ที่นี่ไม่มีคนกดปุ่ม)
      const actor: MemberActor = { userId: c.scheduledBy ?? "system", role: "OWNER", unitAccess: ["*"], permissions: {} };
      const r = await runSend(ctx, row, actor, now);
      campaigns += 1;
      sent += r.sent;
    } catch {
      // ร้านนี้ส่งไม่ได้ (เพดานเต็ม/ข้อมูลไม่ครบ) → ไปต่อร้านถัดไป
    }
  }
  return { campaigns, sent };
}

export async function cancelCampaign(ctx: CampaignCtx, actor: MemberActor, id: string): Promise<{ status: CampaignStatus; stopped: number }> {
  requireManage(actor);
  const row = await loadRow(ctx, id);
  // ที่ส่งไปแล้วถอนไม่ได้ (โลกจริงก็ถอนไม่ได้) — หยุดเฉพาะคิวที่ยังไม่ถึง
  const stopped = await prisma.mktRecipient.updateMany({
    where: { tenantId: ctx.tenantId, campaignId: row.id, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "SKIPPED", error: "ยกเลิกแคมเปญก่อนถึงคิวของคนนี้" },
  });
  await prisma.mktCampaign.update({ where: { id: row.id }, data: { status: "CANCELLED" } });
  await refreshStats(ctx.tenantId, row.id);
  return { status: "CANCELLED", stopped: stopped.count };
}

// ───────────────────────── นับผล: เปิดอ่าน / ใช้สิทธิ์ ─────────────────────────

/** นับ "เปิดอ่าน" ครั้งแรกเท่านั้น — เปิดซ้ำไม่ทำให้ตัวเลขบวมและไม่เปลี่ยนเวลาที่บันทึกไว้ */
export async function trackOpen(tenantId: string, ref: string): Promise<{ opened: boolean; recipientId: string | null }> {
  const clean = String(ref ?? "").trim().replace(/\.gif$/i, "");
  if (!clean) return { opened: false, recipientId: null };
  const [id, sig] = clean.includes(".") ? clean.split(".") : [clean, null];
  if (!id) return { opened: false, recipientId: null };
  if (sig !== null && sig !== openSig(tenantId, id)) return { opened: false, recipientId: null };

  const res = await prisma.mktRecipient.updateMany({
    where: { id, tenantId, openedAt: null },
    data: { openedAt: new Date() },
  });
  return { opened: res.count > 0, recipientId: id };
}

/** ลูกค้าใช้ voucher ที่แคมเปญแนบไป → ยกความดีให้แคมเปญนั้น */
export async function trackUseFromVoucher(evt: { tenantId: string; payload: unknown }): Promise<void> {
  const p = (evt.payload ?? {}) as { voucherId?: unknown; customerId?: unknown; saleId?: unknown };
  const voucherId = typeof p.voucherId === "string" ? p.voucherId : null;
  if (!voucherId) return;

  let rec = await prisma.mktRecipient.findFirst({
    where: { tenantId: evt.tenantId, voucherId, usedAt: null },
    select: { id: true, campaignId: true },
  });
  if (!rec) {
    const v = await prisma.voucher.findFirst({
      where: { id: voucherId, tenantId: evt.tenantId, origin: "CAMPAIGN" },
      select: { originRef: true, customerId: true },
    });
    const ref = (v?.originRef ?? {}) as Record<string, unknown>;
    const campaignId = typeof ref.campaignId === "string" ? ref.campaignId : null;
    if (!campaignId || !v?.customerId) return;
    rec = await prisma.mktRecipient.findFirst({
      where: { tenantId: evt.tenantId, campaignId, customerId: v.customerId, usedAt: null },
      select: { id: true, campaignId: true },
    });
  }
  if (!rec) return;

  const saleId = typeof p.saleId === "string" ? p.saleId : null;
  const sale = saleId
    ? await prisma.posSale.findFirst({ where: { id: saleId, tenantId: evt.tenantId }, select: { grandTotalSatang: true } })
    : null;
  await prisma.mktRecipient.update({
    where: { id: rec.id },
    data: { usedAt: new Date(), saleId, ...(sale ? { saleSatang: BigInt(sale.grandTotalSatang) } : {}) },
  });
  await refreshStats(evt.tenantId, rec.campaignId);
}

/**
 * ลูกค้าซื้อของหลังได้รับแคมเปญ (≤ 30 วัน) → ยกยอดบิล **ใบแรก** ให้แคมเปญนั้น
 * 🔴 ไม่ใช่ "แคมเปญทำให้เขาซื้อ" แบบพิสูจน์ได้ — เป็นการยกความดีตามหน้าต่างเวลา (industry standard)
 *    ค่าที่เทียบได้จริงคือ **uplift** เทียบกับกลุ่มเทียบ ซึ่งคิดจากตัวเลขชุดเดียวกันนี้
 */
export async function trackUseFromSale(tenantId: string, saleId: string): Promise<void> {
  const sale = await prisma.posSale.findFirst({
    where: { id: saleId, tenantId },
    select: { memberId: true, grandTotalSatang: true, paidAt: true, createdAt: true },
  });
  if (!sale?.memberId) return;
  const at = sale.paidAt ?? sale.createdAt ?? new Date();
  const since = new Date(at.getTime() - ATTRIBUTION_DAYS * DAY_MS);

  const recs = await prisma.mktRecipient.findMany({
    where: { tenantId, customerId: sale.memberId, status: "SENT", usedAt: null, sentAt: { gte: since, lte: at } },
    select: { id: true, campaignId: true },
  });
  if (recs.length === 0) return;
  await prisma.mktRecipient.updateMany({
    where: { id: { in: recs.map((r) => r.id) } },
    data: { usedAt: at, saleId, saleSatang: BigInt(sale.grandTotalSatang) },
  });
  for (const campaignId of new Set(recs.map((r) => r.campaignId))) await refreshStats(tenantId, campaignId);
}

// ───────────────────────── สถิติ ─────────────────────────

type StatBucket = { sent: number; opened: number; used: number; saleSatang: number; costSatang: number; reach: number };

async function collectStats(tenantId: string, campaignIds: string[]): Promise<Map<string, Map<CampaignVariant, StatBucket>>> {
  const out = new Map<string, Map<CampaignVariant, StatBucket>>();
  if (campaignIds.length === 0) return out;

  const recs = await prisma.mktRecipient.findMany({
    where: { tenantId, campaignId: { in: campaignIds } },
    select: { campaignId: true, variant: true, status: true, channel: true, openedAt: true, usedAt: true, saleSatang: true, voucherId: true },
  });
  const voucherIds = recs.map((r) => r.voucherId).filter((v): v is string => !!v);
  const usedVouchers = new Map<string, number>();
  if (voucherIds.length > 0) {
    const vs = await prisma.voucher.findMany({
      where: { tenantId, id: { in: voucherIds }, status: "USED" },
      select: { id: true, value: true },
    });
    for (const v of vs) usedVouchers.set(v.id, v.value);
  }

  for (const r of recs) {
    const variant = (r.variant === "B" ? "B" : r.variant === "HOLDOUT" ? "HOLDOUT" : "A") as CampaignVariant;
    const perCampaign = out.get(r.campaignId) ?? new Map<CampaignVariant, StatBucket>();
    const b = perCampaign.get(variant) ?? { sent: 0, opened: 0, used: 0, saleSatang: 0, costSatang: 0, reach: 0 };
    b.reach += 1;
    if (r.status === "SENT") {
      b.sent += 1;
      const ch = r.channel;
      if (ch && isCampaignChannel(ch)) b.costSatang += CHANNEL_SEND_COST_SATANG[ch];
    }
    if (r.openedAt) b.opened += 1;
    if (r.usedAt) b.used += 1;
    b.saleSatang += num(r.saleSatang);
    if (r.voucherId && usedVouchers.has(r.voucherId)) b.costSatang += usedVouchers.get(r.voucherId)!;
    perCampaign.set(variant, b);
    out.set(r.campaignId, perCampaign);
  }
  return out;
}

function viewOf(variant: CampaignVariant, b: StatBucket): CampaignVariantStatView {
  // 🔴 ฐานของ "% ใช้สิทธิ์" ต่างกันตามธรรมชาติของกลุ่ม: กลุ่มที่ได้ข้อความใช้ "คนที่ได้รับจริง"
  //    ส่วนกลุ่มเทียบไม่มีใครได้รับเลย ⇒ ใช้ "คนในกลุ่ม" — ไม่งั้น uplift จะหารด้วยศูนย์เสมอ
  const base = variant === "HOLDOUT" ? b.reach : b.sent;
  return {
    variant,
    sent: b.sent,
    opened: b.opened,
    used: b.used,
    usePct: base > 0 ? (b.used / base) * 100 : 0,
    saleSatang: b.saleSatang,
    costSatang: b.costSatang,
    roi: roiOf(b.saleSatang, b.costSatang),
  };
}

const VARIANT_ORDER: CampaignVariant[] = ["A", "B", "HOLDOUT"];

/** คำนวณใหม่จากผู้รับแล้วเขียนลง CampaignVariantStat + สรุปที่ตัวแคมเปญ (เรียกซ้ำได้เสมอ) */
async function refreshStats(tenantId: string, campaignId: string): Promise<CampaignStatsView | null> {
  const camp = await prisma.mktCampaign.findFirst({ where: { id: campaignId, tenantId }, select: { id: true, systemId: true } });
  if (!camp) return null;
  const buckets = (await collectStats(tenantId, [campaignId])).get(campaignId) ?? new Map<CampaignVariant, StatBucket>();

  const variants: CampaignVariantStatView[] = [];
  for (const v of VARIANT_ORDER) {
    const b = buckets.get(v);
    if (!b) continue;
    const view = viewOf(v, b);
    variants.push(view);
    await prisma.campaignVariantStat.upsert({
      where: { campaignId_variant: { campaignId, variant: v } },
      create: {
        tenantId,
        systemId: camp.systemId,
        campaignId,
        variant: v,
        sent: view.sent,
        opened: view.opened,
        used: view.used,
        saleSatang: Math.round(view.saleSatang),
        costSatang: Math.round(view.costSatang),
      },
      update: {
        sent: view.sent,
        opened: view.opened,
        used: view.used,
        saleSatang: Math.round(view.saleSatang),
        costSatang: Math.round(view.costSatang),
      },
    });
  }

  const reached = variants.filter((v) => v.variant !== "HOLDOUT");
  const hold = variants.find((v) => v.variant === "HOLDOUT") ?? null;
  const sum = (pick: (v: CampaignVariantStatView) => number, list: CampaignVariantStatView[]): number => list.reduce((n, v) => n + pick(v), 0);

  const sentAll = sum((v) => v.sent, reached);
  const usedAll = sum((v) => v.used, reached);
  const saleAll = sum((v) => v.saleSatang, reached);
  const costAll = sum((v) => v.costSatang, variants);
  const usePctAll = sentAll > 0 ? (usedAll / sentAll) * 100 : 0;
  const holdReach = hold ? buckets.get("HOLDOUT")?.reach ?? 0 : 0;

  const total = {
    audience: [...buckets.values()].reduce((n, b) => n + b.reach, 0),
    sent: sentAll,
    opened: sum((v) => v.opened, variants),
    used: sum((v) => v.used, variants),
    saleSatang: sum((v) => v.saleSatang, variants),
    costSatang: costAll,
    roi: roiOf(sum((v) => v.saleSatang, variants), costAll),
  };

  const view: CampaignStatsView = {
    variants,
    uplift: {
      usePct: usePctAll - (hold?.usePct ?? 0),
      saleSatangPerHead: (sentAll > 0 ? saleAll / sentAll : 0) - (holdReach > 0 ? (hold?.saleSatang ?? 0) / holdReach : 0),
    },
    total,
  };

  await prisma.mktCampaign.update({
    where: { id: campaignId },
    data: {
      stats: asJson({
        sent: total.sent,
        opened: total.opened,
        used: total.used,
        saleSatang: total.saleSatang,
        costSatang: total.costSatang,
        roi: total.roi,
      }),
    },
  });
  return view;
}

export async function campaignStats(ctx: CampaignCtx, actor: MemberActor, id: string): Promise<CampaignStatsView> {
  requireRead(actor);
  const row = await loadRow(ctx, id);
  const view = await refreshStats(ctx.tenantId, row.id);
  return (
    view ?? {
      variants: [],
      uplift: { usePct: 0, saleSatangPerHead: 0 },
      total: { audience: 0, sent: 0, opened: 0, used: 0, saleSatang: 0, costSatang: 0, roi: 0 },
    }
  );
}

export async function listCampaignsV2(ctx: CampaignCtx, actor: MemberActor): Promise<CampaignListRow[]> {
  requireRead(actor);
  const rows = (await prisma.mktCampaign.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: { createdAt: "desc" },
    take: 200,
  })) as unknown as CampaignRow[];
  const stats = await collectStats(ctx.tenantId, rows.map((r) => r.id));

  return rows.map((r) => {
    const buckets = stats.get(r.id) ?? new Map<CampaignVariant, StatBucket>();
    const all = [...buckets.values()];
    const seg = (r.segmentJson ?? {}) as Record<string, unknown>;
    const saleSatang = all.reduce((n, b) => n + b.saleSatang, 0);
    const costSatang = all.reduce((n, b) => n + b.costSatang, 0);
    return {
      id: r.id,
      name: r.name,
      status: statusOf(r),
      segmentId: r.segmentId,
      segmentName: typeof seg.name === "string" ? seg.name : null,
      channels: channelsOf(r),
      audience: all.reduce((n, b) => n + b.reach, 0),
      sent: all.reduce((n, b) => n + b.sent, 0),
      opened: all.reduce((n, b) => n + b.opened, 0),
      used: all.reduce((n, b) => n + b.used, 0),
      saleSatang,
      costSatang,
      roi: roiOf(saleSatang, costSatang),
      scheduledAt: r.scheduledAt,
      sentAt: r.sentAt,
      createdAt: r.createdAt,
    };
  });
}

/** ผู้รับของแคมเปญ 1 ใบ (หน้ารายละเอียด) */
export async function listRecipients(ctx: CampaignCtx, actor: MemberActor, id: string, take = 200): Promise<CampaignRecipientRow[]> {
  requireRead(actor);
  const row = await loadRow(ctx, id);
  const recs = await prisma.mktRecipient.findMany({
    where: { tenantId: ctx.tenantId, campaignId: row.id },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take,
  });
  const ids = recs.map((r) => r.customerId).filter((v): v is string => !!v);
  const customers = await prisma.customer.findMany({
    where: { tenantId: ctx.tenantId, id: { in: ids } },
    select: { id: true, name: true, firstName: true, lastName: true },
  });
  const nameOf = new Map(customers.map((c) => [c.id, [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.name || "สมาชิก"]));

  return recs.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    name: (r.customerId ? nameOf.get(r.customerId) : null) ?? "สมาชิก",
    variant: (r.variant === "B" ? "B" : r.variant === "HOLDOUT" ? "HOLDOUT" : "A") as CampaignVariant,
    status: (["PENDING", "SENT", "FAILED", "SKIPPED", "HOLDOUT"].includes(r.status) ? r.status : "PENDING") as RecipientStatus,
    channel: isCampaignChannel(r.channel ?? "") ? (r.channel as CampaignChannel) : null,
    error: r.error,
    sentAt: r.sentAt,
    openedAt: r.openedAt,
    usedAt: r.usedAt,
    saleSatang: num(r.saleSatang),
  }));
}

export { CAMPAIGN_CHANNELS };

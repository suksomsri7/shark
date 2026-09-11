// reviews.ts — รีวิวลูกค้า (M3.4 · พิมพ์เขียว §4.2 §4.3 §5.10 §7.1 §8 §11.7 · D5 · ภาพ 23 · 08 ขวา)
//
// วงจรของรีวิว 1 ใบ:
//   requestReview (journey/พนักงาน · ออกลิงก์ LIFF + ส่ง LINE) → REQUESTED (rating 0)
//   → submitReview (ลูกค้ากดลิงก์ · ไม่ต้องล็อกอิน: token = capability) → NEW + แต้มรีวิว
//   → ≤ escalateBelow ดาว: escalate → การ์ดบอร์ดงาน (sourceType REVIEW) + มอบหมายตามบทบาท → ESCALATED
//   → reply (ร้านตอบ + ส่งคำตอบให้ลูกค้าทาง LINE) → REPLIED · hide/unhide (ซ่อนได้ ไม่ลบ §11.7)
//
// 🔴 1 รีวิวต่อรายการอ้างอิง: unique(tenantId, refType, refId) ในระดับ DB — ขอซ้ำ = คืนใบเดิม ไม่ส่งซ้ำ
// 🔴 token เก็บเฉพาะ sha256 · ส่งแล้วล้าง hash ทิ้ง (ใช้ครั้งเดียว) · รูป token = `<reviewId>.<สุ่ม>`
//    ⇒ เปิดลิงก์ที่ใช้แล้วซ้ำ บอกได้ว่า "รีวิวไปแล้ว" โดยไม่ต้องเก็บ token ดิบ (บอกแค่สถานะ ไม่คืนเนื้อหา)
// 🔴 คะแนนรวม/สถิติ นับเฉพาะ NEW/REPLIED/ESCALATED — REQUESTED = ยังไม่ส่ง · HIDDEN = ซ่อน
// 🔴 ส่งข้อความหาลูกค้า (ลิงก์ขอรีวิว/คำตอบร้าน) ต้องมี LINE identity + ยินยอม GRANTED (§7.1 เงียบ ≠ ยินยอม)
//    ตัวส่งจริงถูกฉีดผ่าน `deps.line` จาก composition root (`src/lib/member-journey-senders.ts`) —
//    โมดูลสมาชิกไม่รู้จักแชท (F2) · ไม่มีตัวส่ง = ไม่ส่ง (sent false) ไม่ใช่ล้ม
// 🔴 เส้น member→kanban: เปิดการ์ดผ่านประตูเดียว `@/lib/modules/kanban/links` (createCardFromExternal)
//    โหลดแบบ dynamic import — (1) ตัดวงจร import: kanban → outbox-consumers → member facade → ไฟล์นี้
//    (2) fitness F2 ยังไม่มีเส้น member→kanban ใน allowlist (ดู wo-notes M3.4 §ข้อแย้ง — ขอผู้คุมงานเพิ่มเส้นนี้)
// 🔴 AI (สรุป/ร่างคำตอบ): prompt ภาษาอังกฤษ · ส่งเฉพาะคะแนน/ข้อความรีวิว/ชื่อบริการ (ตัดตัวเลขยาวที่อาจเป็นเบอร์)
//    ไม่ส่งชื่อ/เบอร์/อีเมลลูกค้าเลย · SHARK_AI_MOCK=1 = MockProvider · ไม่มีผู้ให้บริการ = สรุปจากข้อมูลตรง ๆ

import { Prisma, type ReviewStatus } from "@prisma/client";
import { z } from "zod";
import { randomToken, sha256 } from "@/lib/core/hash";
import { emitOutbox } from "@/lib/core/outbox";
import { canSpend, chargeUsageSafe } from "@/lib/ai/credit";
import { resolveProvider } from "@/lib/ai/provider";
import { earnWithLot, resolvePointSystemIds } from "@/lib/modules/point";
import { prisma } from "./db";
import { canReadMember, hasMemberPerm, isUnitScoped, canManageSettings, type MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import type { MemberCtx } from "./profile";
import {
  REVIEW_ASSIGNEE_ROLES,
  REVIEW_BODY_MAX,
  REVIEW_MAX_PHOTOS,
  REVIEW_REF_TYPES,
  REVIEW_REPLY_MAX,
  REVIEW_SETTINGS_DEFAULT,
  emptyDistribution,
  thaiDayKey,
  thaiMonthKey,
  thaiShortDate,
  type ReviewCardRequest,
  type ReviewCardResult,
  type ReviewConsent,
  type ReviewDeps,
  type ReviewDistribution,
  type ReviewFilterOptions,
  type ReviewFilters,
  type ReviewListResult,
  type ReviewLiffView,
  type ReviewRefType,
  type ReviewRow,
  type ReviewSettings,
  type ReviewStats,
  type ReviewStatusKey,
  type ReviewSubmitResult,
  type ReviewSummary,
  type ShopReviewSummary,
} from "./reviews-shared";

export type { ReviewDeps } from "./reviews-shared";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const BKK_MS = 7 * HOUR_MS;
/** สถานะที่นับเป็น "รีวิวที่ส่งแล้วและมองเห็น" */
const VISIBLE: ReviewStatus[] = ["NEW", "REPLIED", "ESCALATED"];
const TAKE_MAX = 100;

// ───────────────────────── ตัวช่วยภายใน ─────────────────────────

const errText = (e: unknown, fallback: string): string => (e instanceof Error ? e.message.slice(0, 200) : fallback);

/** ตัวเลขจากค่าที่อาจว่าง — ว่าง/undefined/ไม่ใช่ตัวเลข = ค่าปริยาย (กับดัก `Number("")` = 0 ของ M3.3) */
function numOr(v: unknown, fallback: number): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function displayNameOf(c: { name: string | null; firstName: string | null; lastName: string | null; nickname?: string | null; memberCode: string | null }): string {
  return c.name ?? ([c.firstName, c.lastName].filter(Boolean).join(" ") || c.nickname || c.memberCode || "ลูกค้า");
}

/** ตัดตัวเลขยาว (เบอร์/เลขบัตร) ออกจากข้อความก่อนส่งให้ AI */
function scrubDigits(s: string): string {
  return s.replace(/\+?\d[\d\s-]{6,}\d/g, "[number]").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]");
}

function unitScopeWhere(actor: MemberActor): Prisma.MemberReviewWhereInput | null {
  if (!isUnitScoped(actor)) return null;
  return { OR: [{ unitId: null }, { unitId: { in: actor.unitAccess } }] };
}

function requireRead(actor: MemberActor): void {
  if (!canReadMember(actor)) throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ดูรีวิวลูกค้า — ขอสิทธิ์จากเจ้าของร้านก่อน");
}

function requireReply(actor: MemberActor): void {
  if (!hasMemberPerm(actor, "member.review.reply")) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ตอบรีวิว — ขอสิทธิ์ member.review.reply จากเจ้าของร้านก่อน");
  }
}

/** รีวิวที่ actor มองเห็นได้ (ร้าน/ระบบเดียวกัน + ขอบเขตสาขา) — ไม่เห็น = "ไม่พบ" เสมอ (§6.4) */
async function findVisible(ctx: MemberCtx, actor: MemberActor, reviewId: string) {
  const scope = unitScopeWhere(actor);
  const row = await prisma.memberReview.findFirst({
    where: { id: String(reviewId ?? ""), tenantId: ctx.tenantId, systemId: ctx.systemId, ...(scope ? { AND: [scope] } : {}) },
  });
  if (!row) throw new MemberNotFoundError("ไม่พบรีวิวนี้ในระบบสมาชิกที่เปิดอยู่ — อาจถูกลบไปแล้วหรืออยู่นอกสาขาที่คุณดูแล");
  return row;
}

async function consentOf(customerId: string, channel: string): Promise<ReviewConsent> {
  const c = await prisma.memberConsent.findUnique({ where: { customerId_channel: { customerId, channel } }, select: { granted: true } });
  if (!c) return "NONE";
  return c.granted ? "GRANTED" : "REVOKED";
}

async function lineIdOf(customerId: string): Promise<string> {
  const idn = await prisma.memberChannelIdentity.findFirst({
    where: { customerId, channel: "LINE" },
    orderBy: [{ verified: "desc" }, { linkedAt: "desc" }],
    select: { externalId: true },
  });
  return idn?.externalId ?? "";
}

/** คะแนนเฉลี่ยต่อคน (cache `Customer.reviewAvg` ของหน้า 360) — คำสั่งเดียวจบใน SQL */
async function refreshCustomerAvg(customerId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Customer" SET "reviewAvg" = (
      SELECT round(avg("rating")::numeric, 2) FROM "MemberReview"
      WHERE "customerId" = ${customerId} AND "status"::text IN ('NEW', 'REPLIED', 'ESCALATED') AND "rating" >= 1
    )
    WHERE "id" = ${customerId}`;
}

/** เขียน `AppSystem.settings.member.<key>` แบบคำสั่งเดียว (ไม่ทับคีย์อื่นของ member ที่ใบอื่นเป็นเจ้าของ) */
async function writeMemberSettingsKey(ctx: MemberCtx, key: "review", value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  await prisma.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{member}',
      (CASE WHEN jsonb_typeof("settings"->'member') = 'object' THEN "settings"->'member' ELSE '{}'::jsonb END)
        || jsonb_build_object(${key}::text, ${json}::jsonb),
      true)
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId}`;
}

/** แคชสรุป AI รายเดือน: `settings.member.reviewSummary[<YYYY-MM>]` */
async function writeSummaryCache(ctx: MemberCtx, month: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  await prisma.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{member}',
      (CASE WHEN jsonb_typeof("settings"->'member') = 'object' THEN "settings"->'member' ELSE '{}'::jsonb END)
        || jsonb_build_object('reviewSummary',
             (CASE WHEN jsonb_typeof("settings"->'member'->'reviewSummary') = 'object' THEN "settings"->'member'->'reviewSummary' ELSE '{}'::jsonb END)
             || jsonb_build_object(${month}::text, ${json}::jsonb)),
      true)
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId}`;
}

async function memberSettingsOf(ctx: MemberCtx): Promise<Record<string, unknown>> {
  const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "MEMBER" }, select: { settings: true } });
  if (!sys) throw new MemberNotFoundError("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");
  const s = (sys.settings ?? {}) as Record<string, unknown>;
  const m = s.member;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

function normalizeSettings(raw: unknown): ReviewSettings {
  const d = REVIEW_SETTINGS_DEFAULT;
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const int = (v: unknown, def: number, min: number, max: number): number => {
    const n = numOr(v, def);
    return Number.isInteger(n) && n >= min && n <= max ? n : def;
  };
  const role = typeof r.escalateAssigneeRole === "string" && (REVIEW_ASSIGNEE_ROLES as readonly string[]).includes(r.escalateAssigneeRole)
    ? (r.escalateAssigneeRole as ReviewSettings["escalateAssigneeRole"])
    : d.escalateAssigneeRole;
  return {
    askAfterHours: int(r.askAfterHours, d.askAfterHours, 1, 168),
    channel: "LINE",
    rewardPoints: int(r.rewardPoints, d.rewardPoints, 0, 100_000),
    escalateBelow: int(r.escalateBelow, d.escalateBelow, 1, 5),
    escalateBoardId: typeof r.escalateBoardId === "string" && r.escalateBoardId ? r.escalateBoardId : null,
    escalateAssigneeRole: role,
    replyTemplate: typeof r.replyTemplate === "string" && r.replyTemplate.trim() ? r.replyTemplate.slice(0, 500) : d.replyTemplate,
    // D5 — ปิดเสมอในรอบนี้ (เจ้าของเลือกเก็บรีวิวในระบบอย่างเดียว)
    googleReviewUrl: null,
  };
}

// ───────────────────────── ตั้งค่า ─────────────────────────

/** อ่านตั้งค่ารีวิว — ยังไม่เคยตั้ง = ค่าปริยาย (§4.3) */
export async function getReviewSettings(ctx: MemberCtx): Promise<ReviewSettings> {
  const m = await memberSettingsOf(ctx);
  return normalizeSettings(m.review);
}

const settingsPatchSchema = z
  .object({
    askAfterHours: z.number().int().min(1).max(168),
    channel: z.literal("LINE"),
    rewardPoints: z.number().int().min(0).max(100_000),
    escalateBelow: z.number().int().min(1).max(5),
    escalateBoardId: z.string().max(64).nullable(),
    escalateAssigneeRole: z.enum(REVIEW_ASSIGNEE_ROLES),
    replyTemplate: z.string().trim().min(1).max(500),
    googleReviewUrl: z.null(),
  })
  .partial();

const SETTINGS_FIELD_TH: Record<string, string> = {
  askAfterHours: "ขอรีวิวหลังกี่ชั่วโมง (1–168)",
  channel: "ช่องทางส่งลิงก์รีวิว (รองรับ LINE)",
  rewardPoints: "แต้มที่ให้เมื่อรีวิว (จำนวนเต็ม 0 ขึ้นไป)",
  escalateBelow: "คะแนนที่ต้องเปิดการ์ด (1–5 ดาว)",
  escalateBoardId: "บอร์ดงานปลายทาง",
  escalateAssigneeRole: "บทบาทที่รับการ์ด",
  replyTemplate: "ข้อความตอบกลับตั้งต้น (1–500 ตัวอักษร)",
  googleReviewUrl: "การเชิญรีวิว Google (ปิดอยู่ — เจ้าของเลือกเก็บรีวิวในระบบ)",
};

/** แก้ตั้งค่ารีวิวบางช่อง — ต้องมีคีย์ `member.settings.manage` (§6.1: MANAGER ไม่ได้โดยปริยาย) */
export async function setReviewSettings(ctx: MemberCtx, actor: MemberActor, patch: Partial<ReviewSettings>): Promise<ReviewSettings> {
  if (!canManageSettings(actor)) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ตั้งค่าระบบสมาชิก — ขอสิทธิ์ member.settings.manage จากเจ้าของร้านก่อน");
  }
  const parsed = settingsPatchSchema.safeParse(patch ?? {});
  if (!parsed.success) {
    const key = String(parsed.error.issues[0]?.path[0] ?? "");
    throw new MemberInputError(`ตั้งค่ารีวิวยังไม่ถูกต้อง: ${SETTINGS_FIELD_TH[key] ?? "ค่าที่ส่งมา"} — ตรวจแล้วบันทึกอีกครั้ง`);
  }
  const p = parsed.data;
  if (p.escalateBoardId) {
    const board = await prisma.kanbanBoard.findFirst({ where: { id: p.escalateBoardId, tenantId: ctx.tenantId, status: "ACTIVE" }, select: { id: true } });
    if (!board) throw new MemberInputError("ไม่พบบอร์ดงานที่เลือกในร้านนี้ (อาจถูกเก็บเข้าคลังแล้ว) — เลือกบอร์ดใหม่อีกครั้ง");
  }
  const current = await getReviewSettings(ctx);
  const next = normalizeSettings({ ...current, ...p });
  await writeMemberSettingsKey(ctx, "review", next);
  return next;
}

// ───────────────────────── ขอรีวิว ─────────────────────────

export type RequestReviewInput = {
  customerId: string;
  refType: ReviewRefType | string;
  refId: string;
  unitId?: string | null;
  serviceId?: string | null;
  staffEmployeeId?: string | null;
  channel?: "LINE";
};

export type RequestReviewResult = {
  reviewId: string;
  /** token ดิบ (ครั้งแรกเท่านั้น — ขอซ้ำได้ null เพราะไม่เก็บ token ดิบ) */
  token: string | null;
  /** `/m/<slug>/review/<token>` (ขอซ้ำ = null) */
  url: string | null;
  sent: boolean;
  alreadyRequested: boolean;
  /** เหตุที่ไม่ได้ส่ง LINE (ถ้าไม่ได้ส่ง) — พนักงานส่งลิงก์เองได้ */
  note?: string;
};

type RefInfo = { unitId: string | null; serviceId: string | null; staffEmployeeId: string | null; serviceName: string | null };

async function resolveRef(tenantId: string, refType: ReviewRefType, refId: string): Promise<RefInfo> {
  if (refType === "PosSale") {
    const sale = await prisma.posSale.findFirst({
      where: { id: refId, tenantId },
      select: { unitId: true, lines: { select: { name: true, serviceId: true }, orderBy: { id: "asc" }, take: 5 } },
    });
    if (!sale) throw new MemberNotFoundError("ไม่พบบิลที่อ้างถึงในร้านนี้ — ตรวจเลขบิลแล้วลองใหม่");
    const svc = sale.lines.find((l) => l.serviceId);
    return { unitId: sale.unitId, serviceId: svc?.serviceId ?? null, staffEmployeeId: null, serviceName: svc?.name ?? sale.lines[0]?.name ?? null };
  }
  const appt = await prisma.appointment.findFirst({
    where: { id: refId, tenantId },
    select: { unitId: true, serviceId: true, service: { select: { name: true } }, staff: { select: { employeeId: true } } },
  });
  if (!appt) throw new MemberNotFoundError("ไม่พบนัดหมายที่อ้างถึงในร้านนี้ — ตรวจรายการแล้วลองใหม่");
  return { unitId: appt.unitId, serviceId: appt.serviceId, staffEmployeeId: appt.staff?.employeeId ?? null, serviceName: appt.service?.name ?? null };
}

async function shopOf(tenantId: string): Promise<{ slug: string; name: string }> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, name: true } });
  return { slug: t?.slug ?? "", name: t?.name ?? "ร้าน" };
}

async function absoluteUrl(path: string): Promise<string> {
  try {
    const { publicOrigin } = await import("@/lib/core/origin");
    return `${(await publicOrigin()).replace(/\/+$/, "")}${path}`;
  } catch {
    return path;
  }
}

/**
 * ขอรีวิว 1 รายการอ้างอิง (บิล/นัด) — journey "ขอรีวิว" (M3.3) · พนักงาน · REST (M3.10) เรียกที่นี่
 * ขอซ้ำ ref เดิม = คืนใบเดิม (`alreadyRequested`) ไม่ส่ง LINE ซ้ำ · ลูกค้าไม่มี LINE/ไม่ยินยอม = ได้ลิงก์แต่ไม่ส่ง
 */
export async function requestReview(
  ctx: MemberCtx,
  input: RequestReviewInput,
  opts: { deps?: ReviewDeps; now?: Date } = {},
): Promise<RequestReviewResult> {
  const refType = String(input?.refType ?? "") as ReviewRefType;
  if (!(REVIEW_REF_TYPES as readonly string[]).includes(refType)) {
    throw new MemberInputError("ขอรีวิวได้เฉพาะบิลขาย (PosSale) หรือนัดหมาย (Appointment)");
  }
  const refId = String(input?.refId ?? "").trim();
  if (!refId) throw new MemberInputError("ต้องระบุรายการที่ขอรีวิว (บิลหรือนัด)");
  const now = opts.now ?? new Date();

  const customer = await prisma.customer.findFirst({
    where: { id: String(input.customerId ?? ""), tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
    select: { id: true, name: true, firstName: true, lastName: true, nickname: true, memberCode: true },
  });
  if (!customer) throw new MemberNotFoundError();

  const existing = await prisma.memberReview.findUnique({
    where: { tenantId_refType_refId: { tenantId: ctx.tenantId, refType, refId } },
    select: { id: true },
  });
  if (existing) return { reviewId: existing.id, token: null, url: null, sent: false, alreadyRequested: true };

  const ref = await resolveRef(ctx.tenantId, refType, refId);
  let reviewId: string;
  try {
    const row = await prisma.memberReview.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        customerId: customer.id,
        unitId: input.unitId ?? ref.unitId,
        refType,
        refId,
        serviceId: input.serviceId ?? ref.serviceId,
        staffEmployeeId: input.staffEmployeeId ?? ref.staffEmployeeId,
        rating: 0,
        status: "REQUESTED",
        source: "LIFF",
        requestSentAt: now,
      },
      select: { id: true },
    });
    reviewId = row.id;
  } catch (e) {
    // ยิงพร้อมกัน 2 ทาง (journey + พนักงาน) ชน unique(tenantId, refType, refId) → คืนใบที่ชนะ
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await prisma.memberReview.findUnique({ where: { tenantId_refType_refId: { tenantId: ctx.tenantId, refType, refId } }, select: { id: true } });
      if (again) return { reviewId: again.id, token: null, url: null, sent: false, alreadyRequested: true };
    }
    throw e;
  }

  const token = `${reviewId}.${randomToken(32)}`;
  await prisma.memberReview.update({ where: { id: reviewId }, data: { requestTokenHash: sha256(token) } });
  const shop = await shopOf(ctx.tenantId);
  const url = `/m/${shop.slug}/review/${token}`;

  // ── ส่งลิงก์ทาง LINE (มี identity + ยินยอม + มีตัวส่ง) ──
  let sent = false;
  let note: string | undefined;
  const [to, consent] = await Promise.all([lineIdOf(customer.id), consentOf(customer.id, "LINE")]);
  if (!to) note = "ลูกค้ายังไม่ได้ผูกบัญชีไลน์ — ส่งลิงก์ให้ลูกค้าเองได้";
  else if (consent !== "GRANTED") note = "ลูกค้ายังไม่ได้ยินยอมรับข้อความทางไลน์ — ส่งลิงก์ให้ลูกค้าเองได้";
  else if (!opts.deps?.line) note = "ยังไม่ได้เชื่อมตัวส่ง LINE ของร้าน — ส่งลิงก์ให้ลูกค้าเองได้";
  else {
    const settings = await getReviewSettings(ctx);
    const link = await absoluteUrl(url);
    const svc = ref.serviceName ? ` ${ref.serviceName}` : "";
    const pts = settings.rewardPoints > 0 ? ` — รีวิวแล้วรับ ${settings.rewardPoints.toLocaleString("th-TH")} แต้ม` : "";
    // แม่แบบ REVIEW_REQUEST: {บริการ} {ลิงก์รีวิว} {แต้มที่จะได้} (§7.x)
    const body = `ขอบคุณที่ใช้บริการ${svc} กับ ${shop.name} ค่ะ ช่วยให้คะแนนรีวิวสั้น ๆ ได้ที่ ${link}${pts}`;
    try {
      const r = await opts.deps.line({ tenantId: ctx.tenantId, memberSystemId: ctx.systemId, customerId: customer.id, reviewId, channel: "LINE", kind: "REVIEW_REQUEST", to, consent, body });
      sent = r.ok === true;
      if (!sent) note = r.error ?? "ส่งลิงก์ทาง LINE ไม่สำเร็จ — ส่งลิงก์ให้ลูกค้าเองได้";
    } catch (e) {
      note = errText(e, "ส่งลิงก์ทาง LINE ไม่สำเร็จ — ส่งลิงก์ให้ลูกค้าเองได้");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.memberActivity.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: customer.id,
        unitId: input.unitId ?? ref.unitId,
        module: "review",
        type: "REVIEW_REQUESTED",
        refType: "MemberReview",
        refId: reviewId,
        summary: `ขอรีวิว${ref.serviceName ? ` ${ref.serviceName}` : ""}${sent ? " (ส่งลิงก์ทาง LINE แล้ว)" : ""}`.slice(0, 500),
        data: { refType, refId, sent },
        actorUserId: ctx.actorUserId ?? null,
      },
    });
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "review.requested",
      idempotencyKey: `review.requested:${reviewId}`,
      systemId: ctx.systemId,
      unitId: input.unitId ?? ref.unitId,
      payload: { customerId: customer.id, reviewId, refType, refId, sent },
    });
  });

  return { reviewId, token, url, sent, alreadyRequested: false, ...(note ? { note } : {}) };
}

// ───────────────────────── ลูกค้าส่งรีวิว (LIFF · ไม่ต้อง session) ─────────────────────────

const submitSchema = z.object({
  token: z.string().trim().min(10).max(200),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(REVIEW_BODY_MAX).optional().nullable(),
  photoFileIds: z.array(z.string().min(1).max(64)).max(REVIEW_MAX_PHOTOS).optional(),
});

/** แถว REQUESTED ที่ token นี้เปิดได้ (ไม่มี = null) */
async function openRowOf(token: string) {
  const t = String(token ?? "").trim();
  if (t.length < 10) return null;
  return prisma.memberReview.findFirst({ where: { requestTokenHash: sha256(t), status: "REQUESTED" } });
}

/**
 * ลูกค้าส่งรีวิวผ่านลิงก์ (token = สิทธิ์ · ใช้ได้ครั้งเดียว) → NEW + แต้มตามตั้งค่า + ≤ N ดาว ส่งต่อผู้จัดการ
 * ผิดพลาดทุกกรณีเป็นข้อความไทยที่ไม่โทษลูกค้า
 */
export async function submitReview(
  input: { token: string; rating: number; body?: string | null; photoFileIds?: string[] },
  opts: { now?: Date; deps?: ReviewDeps } = {},
): Promise<ReviewSubmitResult> {
  const rating = Number(input?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new MemberInputError("ให้คะแนนได้ 1–5 ดาว — แตะดาวที่ต้องการอีกครั้ง");
  if ((input?.photoFileIds?.length ?? 0) > REVIEW_MAX_PHOTOS) throw new MemberInputError(`แนบรูปได้สูงสุด ${REVIEW_MAX_PHOTOS} รูปต่อรีวิว — เลือกรูปใหม่อีกครั้ง`);
  const parsed = submitSchema.safeParse({ ...input, rating });
  if (!parsed.success) {
    const key = String(parsed.error.issues[0]?.path[0] ?? "");
    throw new MemberInputError(key === "body" ? `ข้อความรีวิวยาวได้ไม่เกิน ${REVIEW_BODY_MAX.toLocaleString("th-TH")} ตัวอักษร` : key === "token" ? "ลิงก์รีวิวนี้ใช้ไม่ได้แล้ว หรือรีวิวเรียบร้อยแล้ว — ขอบคุณค่ะ" : "ข้อมูลรีวิวยังไม่ครบ — ลองส่งอีกครั้ง");
  }
  const { token, body, photoFileIds } = parsed.data;
  const now = opts.now ?? new Date();

  const row = await openRowOf(token);
  if (!row) throw new MemberInputError("ลิงก์รีวิวนี้ใช้ไม่ได้แล้ว หรือรีวิวเรียบร้อยแล้ว — ขอบคุณค่ะ");

  const text = (body ?? "").trim() || null;
  // ใช้ token ครั้งเดียว: เปลี่ยนสถานะ + ล้าง hash ในคำสั่งเดียว (กดส่งซ้ำ/สองแท็บ = ใบแรกชนะ)
  const upd = await prisma.memberReview.updateMany({
    where: { id: row.id, status: "REQUESTED", requestTokenHash: row.requestTokenHash },
    data: { status: "NEW", rating, body: text, photoFileIds: photoFileIds ?? [], submittedAt: now, requestTokenHash: null, source: "LIFF" },
  });
  if (upd.count === 0) throw new MemberInputError("ลิงก์รีวิวนี้ใช้ไม่ได้แล้ว หรือรีวิวเรียบร้อยแล้ว — ขอบคุณค่ะ");

  const ctx: MemberCtx = { tenantId: row.tenantId, systemId: row.systemId, actorUserId: null };
  const settings = await getReviewSettings(ctx);

  // ── แต้มรีวิว (idempotent ต่อรีวิว) ──
  let pointsEarned = 0;
  if (settings.rewardPoints > 0) {
    try {
      const [pointSys] = await resolvePointSystemIds(row.tenantId, row.systemId);
      if (pointSys) {
        await earnWithLot(
          { tenantId: row.tenantId, systemId: pointSys, memberSystemId: row.systemId },
          {
            customerId: row.customerId,
            points: settings.rewardPoints,
            refType: "REVIEW",
            refId: row.id,
            idempotencyKey: `review:${row.id}`,
            unitId: row.unitId,
            reason: `รีวิว ${rating} ดาว`,
          },
        );
        pointsEarned = settings.rewardPoints;
      }
    } catch (e) {
      // แต้มพลาดต้องไม่ทำให้รีวิวหาย — บันทึกไว้ให้ร้านเห็น (ไม่โยนใส่ลูกค้า)
      const { logOps } = await import("@/lib/core/ops");
      await logOps("WARN", "member.review", "ให้แต้มรีวิวไม่สำเร็จ", { tenantId: row.tenantId, detail: errText(e, "earn failed") });
    }
  }

  await refreshCustomerAvg(row.customerId);
  const escalated = rating <= settings.escalateBelow;

  await prisma.$transaction(async (tx) => {
    await tx.memberActivity.create({
      data: {
        tenantId: row.tenantId,
        customerId: row.customerId,
        unitId: row.unitId,
        module: "review",
        type: "REVIEW_RECEIVED",
        refType: "MemberReview",
        refId: row.id,
        summary: `รีวิว ${rating} ดาว${text ? `: ${text}` : ""}`.slice(0, 500),
        data: { rating, points: pointsEarned, photos: (photoFileIds ?? []).length },
      },
    });
    await emitOutbox(tx, {
      tenantId: row.tenantId,
      type: "review.received",
      idempotencyKey: `review.received:${row.id}`,
      systemId: row.systemId,
      unitId: row.unitId,
      payload: { customerId: row.customerId, reviewId: row.id, rating, refType: row.refType, refId: row.refId, escalated },
    });
  });

  if (escalated) {
    // ส่งต่อพลาด = ร้านยังเห็นรีวิวในกล่อง (ESCALATED + แจ้งผู้จัดการ) · ลูกค้าต้องไม่เห็นหน้าพัง
    await escalate(ctx, row.id, { deps: opts.deps, settings }).catch(async (e) => {
      const { logOps } = await import("@/lib/core/ops");
      await logOps("WARN", "member.review", "ส่งต่อรีวิวคะแนนต่ำไม่สำเร็จ", { tenantId: row.tenantId, detail: errText(e, "escalate failed") });
    });
  }
  return { reviewId: row.id, pointsEarned, escalated };
}

// ───────────────────────── ส่งต่อ (≤ N ดาว → การ์ดบอร์ดงาน) ─────────────────────────

export type EscalateResult = { cardId: string | null; created: boolean; cardNo: number | null; boardId: string | null; notified: number };

/** ตัวเปิดการ์ดปริยาย — ประตูเดียวของบอร์ดงาน (`kanban/links.createCardFromExternal`) · กันซ้ำด้วย sourceKey */
async function defaultOpenCard(req: ReviewCardRequest): Promise<ReviewCardResult> {
  const board = await prisma.kanbanBoard.findFirst({ where: { id: req.boardId, tenantId: req.tenantId }, select: { systemId: true } });
  if (!board) throw new Error("ไม่พบบอร์ดปลายทางของการ์ดรีวิว — เลือกบอร์ดใหม่ในตั้งค่ารีวิว");
  const { createCardFromExternal } = await import("@/lib/modules/kanban/links");
  const r = await createCardFromExternal(
    { tenantId: req.tenantId, systemId: board.systemId, actorUserId: null },
    {
      boardId: req.boardId,
      title: req.title,
      description: req.description,
      sourceType: "REVIEW",
      sourceKey: req.sourceKey,
      assigneeUserIds: req.assigneeUserIds,
      party: req.party,
    },
  );
  return { cardId: r.cardId, created: r.created, cardNo: r.cardNo };
}

/** ผู้รับการ์ด/แจ้งเตือน = บทบาทที่ตั้งไว้ ที่ดูแลสาขาของรีวิว (ไม่มีใครคุมสาขานั้น = ทุกคนในบทบาทนั้น) */
async function assigneesOf(tenantId: string, role: ReviewSettings["escalateAssigneeRole"], unitId: string | null): Promise<string[]> {
  const ms = await prisma.membership.findMany({ where: { tenantId, role }, select: { userId: true, unitAccess: true } });
  const covers = (ua: unknown): boolean => {
    const arr = Array.isArray(ua) ? (ua as string[]) : [];
    return arr.length === 0 || arr.includes("*") || (!!unitId && arr.includes(unitId));
  };
  const inUnit = ms.filter((m) => covers(m.unitAccess)).map((m) => m.userId);
  return [...new Set(inUnit.length > 0 ? inUnit : ms.map((m) => m.userId))];
}

/**
 * ส่งต่อรีวิวคะแนนต่ำให้ผู้จัดการ: การ์ดในบอร์ด (ตั้งค่า ?? บอร์ดแรกของร้าน) + มอบหมายตามบทบาท → ESCALATED
 * ไม่มีบอร์ดใช้ได้ = ESCALATED (ไม่มีการ์ด) + แจ้งเตือนในแอปถึงผู้รับเรื่อง · เรียกซ้ำ = การ์ดเดิม (sourceKey)
 */
export async function escalate(
  ctx: MemberCtx,
  reviewId: string,
  opts: { deps?: ReviewDeps; settings?: ReviewSettings } = {},
): Promise<EscalateResult> {
  const row = await prisma.memberReview.findFirst({
    where: { id: String(reviewId ?? ""), tenantId: ctx.tenantId, systemId: ctx.systemId },
    include: { customer: { select: { name: true, firstName: true, lastName: true, nickname: true, memberCode: true, phone: true } } },
  });
  if (!row) throw new MemberNotFoundError("ไม่พบรีวิวนี้ในระบบสมาชิกที่เปิดอยู่");
  if (row.status === "REQUESTED") throw new MemberInputError("รีวิวนี้ลูกค้ายังไม่ได้ส่ง — ส่งต่อได้หลังลูกค้ารีวิวแล้ว");
  const settings = opts.settings ?? (await getReviewSettings(ctx));
  const name = displayNameOf(row.customer);
  const firstTime = row.escalatedAt === null;

  // บอร์ดปลายทาง: ที่ตั้งไว้ (ต้องยังเปิดอยู่) → ไม่งั้นบอร์ดแรกของร้านที่ยังเปิดอยู่
  const board =
    (settings.escalateBoardId
      ? await prisma.kanbanBoard.findFirst({ where: { id: settings.escalateBoardId, tenantId: ctx.tenantId, status: "ACTIVE" }, select: { id: true, name: true } })
      : null) ??
    (await prisma.kanbanBoard.findFirst({ where: { tenantId: ctx.tenantId, status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }));

  const assignees = await assigneesOf(ctx.tenantId, settings.escalateAssigneeRole, row.unitId);
  let card: ReviewCardResult | null = null;
  let failure: string | null = null;
  if (board) {
    const [svc, unit] = await Promise.all([
      row.serviceId ? prisma.bookingService.findFirst({ where: { id: row.serviceId, tenantId: ctx.tenantId }, select: { name: true } }) : null,
      row.unitId ? prisma.businessUnit.findFirst({ where: { id: row.unitId, tenantId: ctx.tenantId }, select: { name: true } }) : null,
    ]);
    const meta = [svc?.name, unit ? (unit.name.startsWith("สาขา") ? unit.name : `สาขา${unit.name}`) : null, row.submittedAt ? `รีวิวเมื่อ ${thaiShortDate(row.submittedAt.toISOString())}` : null].filter(Boolean).join(" · ");
    const req: ReviewCardRequest = {
      tenantId: ctx.tenantId,
      boardId: board.id,
      title: `รีวิว ${row.rating} ดาว — ${name}`,
      description: [row.body ?? "(ลูกค้าไม่ได้เขียนข้อความ)", meta].filter(Boolean).join("\n\n"),
      sourceKey: `review:${row.id}`,
      assigneeUserIds: assignees,
      party: { name, phone: row.customer.phone ?? null },
    };
    try {
      card = await (opts.deps?.kanban ?? defaultOpenCard)(req);
    } catch (e) {
      failure = errText(e, "เปิดการ์ดไม่สำเร็จ");
    }
  }

  await prisma.memberReview.update({
    where: { id: row.id },
    data: {
      ...(card ? { kanbanCardId: card.cardId } : {}),
      ...(row.status === "NEW" || row.status === "ESCALATED" ? { status: "ESCALATED" } : {}),
      ...(firstTime ? { escalatedAt: new Date() } : {}),
    },
  });

  // ไม่มีการ์ด (ไม่มีบอร์ด/เปิดไม่สำเร็จ) → แจ้งผู้รับเรื่องในแอปแทน (ครั้งแรกที่ส่งต่อเท่านั้น — ไม่แจ้งซ้ำ)
  let notified = 0;
  if (!card && firstTime) {
    const title = `รีวิว ${row.rating} ดาว — ต้องติดตาม`;
    const why = board ? `เปิดการ์ดในบอร์ดงานไม่สำเร็จ (${failure ?? "ไม่ทราบสาเหตุ"})` : "ร้านยังไม่มีบอร์ดงานสำหรับรับเรื่องรีวิว";
    const body = `${name} ให้ ${row.rating} ดาว — ${why} · เปิดดูที่ ระบบสมาชิก › รีวิวลูกค้า`.slice(0, 500);
    if (assignees.length > 0) {
      const r = await prisma.appNotification.createMany({ data: assignees.map((u) => ({ tenantId: ctx.tenantId, recipientUserId: u, title, body })) });
      notified = r.count;
    } else {
      await prisma.appNotification.create({ data: { tenantId: ctx.tenantId, title, body } });
      notified = 1;
    }
  }
  return { cardId: card?.cardId ?? row.kanbanCardId ?? null, created: card?.created ?? false, cardNo: card?.cardNo ?? null, boardId: board?.id ?? null, notified };
}

// ───────────────────────── ตอบ / ซ่อน ─────────────────────────

/**
 * ร้านตอบรีวิว (member.review.reply) → REPLIED + ส่งคำตอบให้ลูกค้าทาง LINE (deps.line)
 * ตอบซ้ำข้อความเดิม = ไม่ทำอะไร (ไม่ยิง event/ไม่ส่งซ้ำ) · ข้อความใหม่ = แก้คำตอบ
 */
export async function reply(
  ctx: MemberCtx,
  actor: MemberActor,
  reviewId: string,
  input: { body: string },
  opts: { deps?: ReviewDeps; now?: Date } = {},
): Promise<{ ok: true; changed: boolean; sent: boolean }> {
  requireReply(actor);
  const text = String(input?.body ?? "").trim();
  if (!text) throw new MemberInputError("พิมพ์คำตอบก่อนกดส่ง — คำตอบว่างส่งให้ลูกค้าไม่ได้");
  if (text.length > REVIEW_REPLY_MAX) throw new MemberInputError(`คำตอบยาวได้ไม่เกิน ${REVIEW_REPLY_MAX.toLocaleString("th-TH")} ตัวอักษร`);
  const row = await findVisible(ctx, actor, reviewId);
  if (row.status === "REQUESTED") throw new MemberInputError("ลูกค้ายังไม่ได้ส่งรีวิวนี้ — ตอบได้หลังลูกค้ารีวิวแล้ว");
  if (row.status === "HIDDEN") throw new MemberInputError("รีวิวนี้ถูกซ่อนอยู่ — เลิกซ่อนก่อนแล้วค่อยตอบ");
  if (row.replyBody === text) return { ok: true, changed: false, sent: false };

  const now = opts.now ?? new Date();
  await prisma.$transaction(async (tx) => {
    await tx.memberReview.update({ where: { id: row.id }, data: { status: "REPLIED", replyBody: text, repliedById: actor.userId, repliedAt: now } });
    await tx.memberActivity.create({
      data: {
        tenantId: row.tenantId,
        customerId: row.customerId,
        unitId: row.unitId,
        module: "review",
        type: "REVIEW_REPLIED",
        refType: "MemberReview",
        refId: row.id,
        summary: `ร้านตอบรีวิว: ${text}`.slice(0, 500),
        data: { rating: row.rating, edited: !!row.replyBody },
        actorUserId: actor.userId,
      },
    });
    await emitOutbox(tx, {
      tenantId: row.tenantId,
      type: "review.replied",
      idempotencyKey: `review.replied:${row.id}:${sha256(text).slice(0, 16)}`,
      systemId: row.systemId,
      unitId: row.unitId,
      payload: { customerId: row.customerId, reviewId: row.id, rating: row.rating, edited: !!row.replyBody },
    });
  });

  // ส่งคำตอบให้ลูกค้า (ไม่สำเร็จ = คำตอบยังบันทึกอยู่ในระบบ)
  let sent = false;
  if (opts.deps?.line) {
    const [to, consent] = await Promise.all([lineIdOf(row.customerId), consentOf(row.customerId, "LINE")]);
    if (to && consent === "GRANTED") {
      const shop = await shopOf(row.tenantId);
      try {
        const r = await opts.deps.line({
          tenantId: row.tenantId,
          memberSystemId: row.systemId,
          customerId: row.customerId,
          reviewId: row.id,
          channel: "LINE",
          kind: "REVIEW_REPLY",
          to,
          consent,
          body: `${shop.name} ตอบรีวิวของคุณ: ${text}`,
        });
        sent = r.ok === true;
      } catch {
        sent = false;
      }
    }
  }
  return { ok: true, changed: true, sent };
}

/** ซ่อนรีวิว (ไม่ลบ §11.7) — ไม่นับในคะแนนรวม · ต้องมีเหตุผล */
export async function hide(ctx: MemberCtx, actor: MemberActor, reviewId: string, input: { reason: string }): Promise<{ ok: true }> {
  requireReply(actor);
  const reason = String(input?.reason ?? "").trim();
  if (!reason) throw new MemberInputError("ระบุเหตุผลที่ซ่อนรีวิวก่อน (เช่น สแปม · ข้อความไม่เหมาะสม)");
  const row = await findVisible(ctx, actor, reviewId);
  if (row.status === "REQUESTED") throw new MemberInputError("ลูกค้ายังไม่ได้ส่งรีวิวนี้ — ยังไม่มีอะไรให้ซ่อน");
  await prisma.memberReview.update({ where: { id: row.id }, data: { status: "HIDDEN", hiddenReason: reason.slice(0, 200) } });
  await refreshCustomerAvg(row.customerId);
  return { ok: true };
}

/** เลิกซ่อน → กลับสถานะเดิม (มีคำตอบ = REPLIED · เคยส่งต่อ = ESCALATED · อื่น ๆ = NEW) */
export async function unhide(ctx: MemberCtx, actor: MemberActor, reviewId: string): Promise<{ ok: true; status: ReviewStatusKey }> {
  requireReply(actor);
  const row = await findVisible(ctx, actor, reviewId);
  if (row.status !== "HIDDEN") return { ok: true, status: row.status };
  const status: ReviewStatus = row.replyBody ? "REPLIED" : row.escalatedAt ? "ESCALATED" : "NEW";
  await prisma.memberReview.update({ where: { id: row.id }, data: { status, hiddenReason: null } });
  await refreshCustomerAvg(row.customerId);
  return { ok: true, status };
}

// ───────────────────────── อ่าน ─────────────────────────

type RowWithCustomer = Prisma.MemberReviewGetPayload<{
  include: { customer: { select: { id: true; name: true; firstName: true; lastName: true; nickname: true; memberCode: true; tierDefId: true } } };
}>;

const CUSTOMER_SELECT = { id: true, name: true, firstName: true, lastName: true, nickname: true, memberCode: true, tierDefId: true } as const;

/** แปลงแถวเป็น DTO ของหน้าจอ (resolve ชื่อบริการ/พนักงาน/สาขา/ระดับ/การ์ด/รูป เป็นชุดเดียว) */
async function toRows(tenantId: string, rows: RowWithCustomer[]): Promise<ReviewRow[]> {
  if (rows.length === 0) return [];
  const ids = <T,>(xs: (T | null | undefined)[]): T[] => [...new Set(xs.filter((x): x is T => x !== null && x !== undefined))];
  const serviceIds = ids(rows.map((r) => r.serviceId));
  const staffIds = ids(rows.map((r) => r.staffEmployeeId));
  const unitIds = ids(rows.map((r) => r.unitId));
  const tierIds = ids(rows.map((r) => r.customer.tierDefId));
  const cardIds = ids(rows.map((r) => r.kanbanCardId));
  const photoIds = ids(rows.flatMap((r) => r.photoFileIds));
  const userIds = ids(rows.map((r) => r.repliedById));
  const saleIds = ids(rows.filter((r) => r.refType === "PosSale" && !r.serviceId).map((r) => r.refId));

  const [services, staff, units, tiers, cards, files, users, lines] = await Promise.all([
    serviceIds.length ? prisma.bookingService.findMany({ where: { id: { in: serviceIds }, tenantId }, select: { id: true, name: true } }) : [],
    staffIds.length ? prisma.hrEmployee.findMany({ where: { id: { in: staffIds }, tenantId }, select: { id: true, name: true } }) : [],
    unitIds.length ? prisma.businessUnit.findMany({ where: { id: { in: unitIds }, tenantId }, select: { id: true, name: true } }) : [],
    tierIds.length ? prisma.memberTierDef.findMany({ where: { id: { in: tierIds }, tenantId }, select: { id: true, name: true } }) : [],
    cardIds.length ? prisma.kanbanCard.findMany({ where: { id: { in: cardIds }, tenantId }, select: { id: true, cardNo: true, board: { select: { name: true } } } }) : [],
    photoIds.length ? prisma.fileAsset.findMany({ where: { id: { in: photoIds }, tenantId }, select: { id: true, cdnUrl: true } }) : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [],
    saleIds.length ? prisma.posSaleLine.findMany({ where: { saleId: { in: saleIds }, tenantId }, select: { saleId: true, name: true }, orderBy: { id: "asc" } }) : [],
  ]);
  const svcName = new Map(services.map((s) => [s.id, s.name]));
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const tierName = new Map(tiers.map((t) => [t.id, t.name]));
  const cardOf = new Map(cards.map((c) => [c.id, c]));
  const fileUrl = new Map(files.map((f) => [f.id, f.cdnUrl]));
  const userName = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  const saleLine = new Map<string, string>();
  for (const l of lines) if (!saleLine.has(l.saleId)) saleLine.set(l.saleId, l.name);

  return rows.map((r) => {
    const serviceName = r.serviceId ? svcName.get(r.serviceId) ?? null : r.refType === "PosSale" && r.refId ? saleLine.get(r.refId) ?? null : null;
    const card = r.kanbanCardId ? cardOf.get(r.kanbanCardId) : undefined;
    return {
      id: r.id,
      rating: r.rating,
      body: r.body,
      photoFileIds: r.photoFileIds,
      photoUrls: r.photoFileIds.map((id) => fileUrl.get(id)).filter((u): u is string => !!u),
      customer: { id: r.customer.id, name: displayNameOf(r.customer), memberCode: r.customer.memberCode ?? "", tier: r.customer.tierDefId ? tierName.get(r.customer.tierDefId) ?? null : null },
      service: serviceName ? { id: r.serviceId, name: serviceName } : null,
      staff: r.staffEmployeeId && staffName.get(r.staffEmployeeId) ? { id: r.staffEmployeeId, name: staffName.get(r.staffEmployeeId) as string } : null,
      unit: r.unitId && unitName.get(r.unitId) ? { id: r.unitId, name: unitName.get(r.unitId) as string } : null,
      refType: r.refType,
      refId: r.refId,
      createdAt: r.createdAt.toISOString(),
      submittedAt: r.submittedAt?.toISOString() ?? null,
      status: r.status,
      replyBody: r.replyBody,
      repliedAt: r.repliedAt?.toISOString() ?? null,
      repliedByName: r.repliedById ? userName.get(r.repliedById) ?? null : null,
      kanbanCardId: r.kanbanCardId,
      kanbanCardNo: card?.cardNo ?? null,
      kanbanBoardName: card?.board?.name ?? null,
      hiddenReason: r.hiddenReason,
    };
  });
}

export type ListReviewsOptions = ReviewFilters & { take?: number; cursor?: string | null };

/** กล่องรีวิว (ภาพ 23) — ไม่รวม REQUESTED · HIDDEN เฉพาะเมื่อขอ · STAFF เห็นเฉพาะสาขาตน/ไม่ระบุสาขา */
export async function listReviews(ctx: MemberCtx, actor: MemberActor, opts: ListReviewsOptions = {}): Promise<ReviewListResult> {
  requireRead(actor);
  const take = Math.min(TAKE_MAX, Math.max(1, Math.floor(numOr(opts.take, 20))));
  const scope = unitScopeWhere(actor);
  const rating = numOr(opts.rating, 0);
  const statuses: ReviewStatus[] = opts.unreplied ? ["NEW", "ESCALATED"] : opts.includeHidden ? [...VISIBLE, "HIDDEN"] : VISIBLE;
  const where: Prisma.MemberReviewWhereInput = {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    status: { in: statuses },
    ...(rating >= 1 && rating <= 5 ? { rating } : {}),
    ...(opts.serviceId ? { serviceId: opts.serviceId } : {}),
    ...(opts.staffEmployeeId ? { staffEmployeeId: opts.staffEmployeeId } : {}),
    ...(opts.unitId ? { unitId: opts.unitId } : {}),
    ...(opts.unreplied ? { replyBody: null } : {}),
    ...(scope ? { AND: [scope] } : {}),
  };
  const rows = await prisma.memberReview.findMany({
    where,
    include: { customer: { select: CUSTOMER_SELECT } },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, take);
  return { items: await toRows(ctx.tenantId, page), nextCursor: rows.length > take ? page[page.length - 1]?.id ?? null : null };
}

/** สถิติกล่องรีวิว (KPI 4 ช่อง ภาพ 23) — ช่วง `days` วันล่าสุด · ไม่นับ HIDDEN/REQUESTED */
export async function reviewStats(ctx: MemberCtx, actor: MemberActor, opts: { days?: number; now?: Date } = {}): Promise<ReviewStats> {
  requireRead(actor);
  const days = Math.min(365, Math.max(1, Math.floor(numOr(opts.days, 30))));
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - days * DAY_MS);
  const trendFrom = new Date(now.getTime() - 8 * 7 * DAY_MS);
  const scope = unitScopeWhere(actor);
  const base: Prisma.MemberReviewWhereInput = { tenantId: ctx.tenantId, systemId: ctx.systemId, status: { in: VISIBLE }, rating: { gte: 1 }, ...(scope ? { AND: [scope] } : {}) };
  const [settings, rows, unreplied] = await Promise.all([
    getReviewSettings(ctx),
    prisma.memberReview.findMany({
      where: { ...base, submittedAt: { gte: since < trendFrom ? since : trendFrom } },
      select: { rating: true, status: true, replyBody: true, kanbanCardId: true, submittedAt: true },
    }),
    prisma.memberReview.count({ where: { ...base, status: { in: ["NEW", "ESCALATED"] }, replyBody: null } }),
  ]);
  const inWin = rows.filter((r) => r.submittedAt && r.submittedAt >= since);
  const distribution: ReviewDistribution = emptyDistribution();
  for (const r of inWin) distribution[r.rating as 1 | 2 | 3 | 4 | 5] += 1;
  const count = inWin.length;
  const sum = inWin.reduce((a, r) => a + r.rating, 0);
  const replied = inWin.filter((r) => r.status === "REPLIED" || !!r.replyBody).length;
  const low = inWin.filter((r) => r.rating <= settings.escalateBelow);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const trend: { week: string; avg: number | null }[] = [];
  for (let i = 7; i >= 0; i--) {
    const from = new Date(now.getTime() - (i + 1) * 7 * DAY_MS);
    const to = new Date(now.getTime() - i * 7 * DAY_MS);
    const wk = rows.filter((r) => r.submittedAt && r.submittedAt >= from && r.submittedAt < to);
    trend.push({ week: thaiShortDate(from.toISOString()), avg: wk.length ? Math.round((wk.reduce((a, r) => a + r.rating, 0) / wk.length) * 100) / 100 : null });
  }
  return {
    avg: count ? Math.round((sum / count) * 100) / 100 : null,
    count,
    repliedPct: count ? Math.round((replied / count) * 100) : 0,
    replied,
    lowCount: low.length,
    lowCards: low.filter((r) => !!r.kanbanCardId).length,
    distribution,
    weekDelta: inWin.filter((r) => r.submittedAt && r.submittedAt >= weekAgo).length,
    unreplied,
    trend,
    days,
    escalateBelow: settings.escalateBelow,
  };
}

/** รีวิวของลูกค้า 1 คน (แท็บ "รีวิว" ในหน้า 360) — ไม่รวมใบที่ยังไม่ส่ง */
export async function reviewsForMember(ctx: MemberCtx, actor: MemberActor, customerId: string): Promise<ReviewRow[]> {
  requireRead(actor);
  const scope = unitScopeWhere(actor);
  const rows = await prisma.memberReview.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, customerId: String(customerId ?? ""), status: { not: "REQUESTED" }, ...(scope ? { AND: [scope] } : {}) },
    include: { customer: { select: CUSTOMER_SELECT } },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: 50,
  });
  return toRows(ctx.tenantId, rows);
}

/**
 * รีวิว 1 ใบ (M3.10 · REST `GET /reviews/{id}`) — กติกาการมองเห็นเดียวกับกล่องรีวิว
 * (ไม่รวมใบที่ลูกค้ายังไม่ส่ง · STAFF เห็นเฉพาะสาขาตน) · มองไม่เห็น = ไม่พบ (404-not-403)
 */
export async function getReview(ctx: MemberCtx, actor: MemberActor, reviewId: string): Promise<ReviewRow> {
  requireRead(actor);
  const scope = unitScopeWhere(actor);
  const row = await prisma.memberReview.findFirst({
    where: { id: String(reviewId ?? ""), tenantId: ctx.tenantId, systemId: ctx.systemId, status: { not: "REQUESTED" }, ...(scope ? { AND: [scope] } : {}) },
    include: { customer: { select: CUSTOMER_SELECT } },
  });
  if (!row) throw new MemberNotFoundError("ไม่พบรีวิวนี้ในระบบสมาชิกที่เปิดอยู่");
  return (await toRows(ctx.tenantId, [row]))[0]!;
}

/**
 * ลิงก์รีวิวนี้เป็นของใคร (M3.10 · REST `POST /me/reviews`) — ใบที่ยังรอส่งเท่านั้น · ไม่มี = null
 * 🔴 เลนลูกค้าต้องเทียบเจ้าของลิงก์กับ session ก่อนส่ง (ลิงก์หลุดไปถึงสมาชิกคนอื่นต้องส่งแทนไม่ได้)
 */
export async function reviewTokenOwner(token: string): Promise<{ tenantId: string; systemId: string; customerId: string } | null> {
  const row = await openRowOf(token);
  return row ? { tenantId: row.tenantId, systemId: row.systemId, customerId: row.customerId } : null;
}

/** กล่อง "รีวิวร้าน" (ภาพ 08 ขวา) — คะแนนรวมทั้งร้าน (ไม่ซ่อน) + 2 รีวิวล่าสุด */
export async function shopSummaryFor360(ctx: MemberCtx): Promise<ShopReviewSummary & { recent: ReviewRow[] }> {
  const where: Prisma.MemberReviewWhereInput = { tenantId: ctx.tenantId, systemId: ctx.systemId, status: { in: VISIBLE }, rating: { gte: 1 } };
  const [groups, recent] = await Promise.all([
    prisma.memberReview.groupBy({ by: ["rating"], where, _count: { _all: true } }),
    prisma.memberReview.findMany({ where, include: { customer: { select: CUSTOMER_SELECT } }, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], take: 2 }),
  ]);
  const distribution = emptyDistribution();
  let count = 0;
  let sum = 0;
  for (const g of groups) {
    if (g.rating >= 1 && g.rating <= 5) {
      distribution[g.rating as 1 | 2 | 3 | 4 | 5] = g._count._all;
      count += g._count._all;
      sum += g.rating * g._count._all;
    }
  }
  return { avg: count ? Math.round((sum / count) * 100) / 100 : null, count, distribution, recent: await toRows(ctx.tenantId, recent) };
}

/** ตัวเลือกตัวกรอง/ตั้งค่า (บริการ/พนักงานที่เคยถูกรีวิว · สาขาที่ actor ดูแล · บอร์ดงานที่เปิดอยู่) */
export async function reviewFilterOptions(ctx: MemberCtx, actor: MemberActor): Promise<ReviewFilterOptions> {
  requireRead(actor);
  const [svcRows, staffRows, units, boards] = await Promise.all([
    prisma.memberReview.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, serviceId: { not: null } }, distinct: ["serviceId"], select: { serviceId: true }, take: 100 }),
    prisma.memberReview.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, staffEmployeeId: { not: null } }, distinct: ["staffEmployeeId"], select: { staffEmployeeId: true }, take: 100 }),
    prisma.businessUnit.findMany({
      where: { tenantId: ctx.tenantId, ...(isUnitScoped(actor) ? { id: { in: actor.unitAccess } } : {}) },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.kanbanBoard.findMany({ where: { tenantId: ctx.tenantId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { createdAt: "asc" }, take: 50 }),
  ]);
  const svcIds = svcRows.map((r) => r.serviceId).filter((x): x is string => !!x);
  const staffIds = staffRows.map((r) => r.staffEmployeeId).filter((x): x is string => !!x);
  const [services, staff] = await Promise.all([
    svcIds.length ? prisma.bookingService.findMany({ where: { id: { in: svcIds }, tenantId: ctx.tenantId }, select: { id: true, name: true } }) : [],
    staffIds.length ? prisma.hrEmployee.findMany({ where: { id: { in: staffIds }, tenantId: ctx.tenantId }, select: { id: true, name: true } }) : [],
  ]);
  return { services, staff, units, boards };
}

// ───────────────────────── AI: สรุปรายเดือน · ร่างคำตอบ ─────────────────────────

type CachedSummary = { strengths: string; frequent: string; trend: string; generatedAt: string; day: string };

function monthRange(month: string): { from: Date; to: Date; prev: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new MemberInputError("เดือนต้องอยู่ในรูป YYYY-MM");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new MemberInputError("เดือนต้องอยู่ในรูป YYYY-MM");
  const from = new Date(Date.UTC(y, mo - 1, 1) - BKK_MS);
  const to = new Date(Date.UTC(y, mo, 1) - BKK_MS);
  const pd = new Date(Date.UTC(y, mo - 2, 1));
  return { from, to, prev: `${pd.getUTCFullYear()}-${String(pd.getUTCMonth() + 1).padStart(2, "0")}` };
}

const excerpt = (s: string | null, n = 48): string => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** แปลผล AI (JSON) — เพี้ยน/ว่าง = null (ใช้สรุปจากข้อมูลตรง ๆ แทน) */
function parseSummaryJson(text: string): { strengths: string; frequent: string } | null {
  const m = /\{[\s\S]*\}/.exec(text ?? "");
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const s = typeof o.strengths === "string" ? o.strengths.trim() : "";
    const f = typeof o.frequent === "string" ? o.frequent.trim() : "";
    return s && f ? { strengths: s.slice(0, 200), frequent: f.slice(0, 200) } : null;
  } catch {
    return null;
  }
}

/**
 * AI สรุปรีวิวเดือนนี้ (ภาพ 23 ขวาบน): จุดแข็ง · ถูกพูดถึงบ่อย · แนวโน้ม
 * แคชรายวันที่ `AppSystem.settings.member.reviewSummary[<เดือน>]` — วันไทยเดียวกัน = ไม่เรียก AI ซ้ำ (`force` = คิดใหม่)
 * "แนวโน้ม" คิดจากตัวเลขจริงเสมอ (เฉลี่ยเดือนก่อน → เดือนนี้) ไม่ให้ AI แต่งตัวเลข
 */
export async function summarize(
  ctx: MemberCtx,
  actor: MemberActor,
  input: { month?: string } = {},
  opts: { force?: boolean; now?: Date } = {},
): Promise<ReviewSummary> {
  requireRead(actor);
  const now = opts.now ?? new Date();
  const month = input.month && input.month.trim() ? input.month.trim() : thaiMonthKey(now);
  const { from, to, prev } = monthRange(month);
  const today = thaiDayKey(now);

  const m = await memberSettingsOf(ctx);
  const cacheAll = m.reviewSummary && typeof m.reviewSummary === "object" ? (m.reviewSummary as Record<string, CachedSummary | undefined>) : {};
  const hit = cacheAll[month];
  if (!opts.force && hit && hit.day === today && typeof hit.strengths === "string") {
    return { strengths: hit.strengths, frequent: hit.frequent, trend: hit.trend, cached: true, generatedAt: hit.generatedAt, month };
  }

  const prevRange = monthRange(prev);
  const base = { tenantId: ctx.tenantId, systemId: ctx.systemId, status: { in: VISIBLE }, rating: { gte: 1 } } satisfies Prisma.MemberReviewWhereInput;
  const [settings, rows, prevAgg] = await Promise.all([
    getReviewSettings(ctx),
    prisma.memberReview.findMany({ where: { ...base, submittedAt: { gte: from, lt: to } }, select: { rating: true, body: true, serviceId: true, submittedAt: true }, orderBy: { submittedAt: "desc" }, take: 200 }),
    prisma.memberReview.aggregate({ where: { ...base, submittedAt: { gte: prevRange.from, lt: prevRange.to } }, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  const avg = rows.length ? rows.reduce((a, r) => a + r.rating, 0) / rows.length : null;
  const prevAvg = prevAgg._count._all > 0 ? prevAgg._avg.rating : null;
  const trend =
    avg === null
      ? "ยังไม่มีรีวิวในเดือนนี้"
      : prevAvg === null
        ? `เฉลี่ย ${avg.toFixed(1)} จาก ${rows.length} รีวิว (ยังไม่มีเดือนก่อนให้เทียบ)`
        : Math.abs(avg - prevAvg) < 0.05
          ? `คงที่ที่ ${avg.toFixed(1)}`
          : `${avg > prevAvg ? "ดีขึ้น" : "ลดลง"}จาก ${prevAvg.toFixed(1)} → ${avg.toFixed(1)}`;

  // สรุปจากข้อมูลตรง ๆ (ใช้เมื่อไม่มี AI/AI ตอบเพี้ยน)
  const good = rows.filter((r) => r.rating >= 4 && r.body);
  const low = rows.filter((r) => r.rating <= settings.escalateBelow);
  let strengths = good.length ? excerpt(good[0]!.body) : rows.length ? "ยังไม่มีรีวิว 4–5 ดาวที่เขียนข้อความในเดือนนี้" : "ยังไม่มีรีวิวในเดือนนี้";
  let frequent = low.length ? `${excerpt(low.find((r) => r.body)?.body ?? "คะแนนต่ำ", 40)} (${low.length} ครั้ง)` : rows.length ? "ยังไม่มีเรื่องที่ลูกค้าติซ้ำ" : "ยังไม่มีรีวิวในเดือนนี้";

  if (rows.length > 0 && (await canSpend(ctx.tenantId).catch(() => false))) {
    const provider = resolveProvider("fast");
    if (provider) {
      const svcIds = [...new Set(rows.map((r) => r.serviceId).filter((x): x is string => !!x))];
      const svcs = svcIds.length ? await prisma.bookingService.findMany({ where: { id: { in: svcIds }, tenantId: ctx.tenantId }, select: { id: true, name: true } }) : [];
      const svcName = new Map(svcs.map((s) => [s.id, s.name]));
      // ส่งเฉพาะคะแนน/ข้อความรีวิว/ชื่อบริการ — ไม่มีชื่อ/ช่องทางติดต่อของลูกค้าใน prompt
      const lines = rows.slice(0, 80).map((r) => `- rating ${r.rating}/5${r.serviceId && svcName.get(r.serviceId) ? ` | service: ${svcName.get(r.serviceId)}` : ""} | text: ${scrubDigits(excerpt(r.body, 240) || "(no text)")}`);
      const system =
        "You are an analyst for a small Thai business. Summarize the customer reviews below. " +
        'Reply with JSON only: {"strengths": "...", "frequent": "..."}. ' +
        "strengths = what customers praise most (one short Thai phrase, max 60 characters). " +
        "frequent = the most frequently mentioned complaint or topic, with a count in parentheses like (6 ครั้ง) (one short Thai phrase, max 60 characters). " +
        "Write both values in Thai. Do not invent facts that are not in the reviews.";
      try {
        const res = await provider.chat([{ role: "system", content: system }, { role: "user", content: `Reviews this month (${rows.length}):\n${lines.join("\n")}` }], { maxTokens: 300 });
        await chargeUsageSafe({ tenantId: ctx.tenantId }, { source: "MEMBER_ASSIST", model: res.model, tokensIn: res.tokensIn, tokensOut: res.tokensOut, userId: actor.userId, note: "AI สรุปรีวิวลูกค้ารายเดือน" });
        const parsed = parseSummaryJson(res.text);
        if (parsed) {
          strengths = parsed.strengths;
          frequent = parsed.frequent;
        }
      } catch {
        // AI ล้ม = ใช้สรุปจากข้อมูลตรง ๆ (หน้าจอต้องไม่ว่าง)
      }
    }
  }

  const generatedAt = now.toISOString();
  await writeSummaryCache(ctx, month, { strengths, frequent, trend, generatedAt, day: today } satisfies CachedSummary);
  return { strengths, frequent, trend, cached: false, generatedAt, month };
}

/** AI ร่างคำตอบรีวิว 1 ใบ (ตั้งต้นจาก `settings.replyTemplate`) — ไม่มี AI = คืนข้อความตั้งต้นที่ปรับตามคะแนน */
export async function draftReply(ctx: MemberCtx, actor: MemberActor, reviewId: string): Promise<{ text: string; ai: boolean }> {
  requireReply(actor);
  const row = await findVisible(ctx, actor, reviewId);
  if (row.status === "REQUESTED") throw new MemberInputError("ลูกค้ายังไม่ได้ส่งรีวิวนี้ — ยังไม่มีอะไรให้ร่างคำตอบ");
  const settings = await getReviewSettings(ctx);
  const fallback = row.rating <= settings.escalateBelow ? `ต้องขออภัยในประสบการณ์ที่ไม่ประทับใจค่ะ ทางร้านรับเรื่องไว้แล้วและจะปรับปรุงให้ดีขึ้น — ${settings.replyTemplate}` : settings.replyTemplate;
  if (!(await canSpend(ctx.tenantId).catch(() => false))) return { text: fallback, ai: false };
  const provider = resolveProvider("fast");
  if (!provider) return { text: fallback, ai: false };
  const svc = row.serviceId ? await prisma.bookingService.findFirst({ where: { id: row.serviceId, tenantId: ctx.tenantId }, select: { name: true } }) : null;
  const system =
    "You are a friendly customer-care writer for a small Thai business. Draft a reply to the customer review below. " +
    "Write in polite Thai (female speaker, ending with ค่ะ), 1-3 short sentences, no emoji, no promises of refunds or callbacks, " +
    "and do not mention any personal data. Start from the shop's template and adapt it to the review. Reply with the message text only.";
  const user = [`Shop template: ${settings.replyTemplate}`, `Rating: ${row.rating}/5`, svc?.name ? `Service: ${svc.name}` : null, `Review text: ${scrubDigits(row.body ?? "(no text)")}`].filter(Boolean).join("\n");
  try {
    const res = await provider.chat([{ role: "system", content: system }, { role: "user", content: user }], { maxTokens: 250 });
    await chargeUsageSafe({ tenantId: ctx.tenantId }, { source: "MEMBER_ASSIST", model: res.model, tokensIn: res.tokensIn, tokensOut: res.tokensOut, userId: actor.userId, note: "AI ร่างคำตอบรีวิว" });
    const text = res.text.trim().replace(/^["“]|["”]$/g, "").slice(0, REVIEW_REPLY_MAX);
    return text ? { text, ai: true } : { text: fallback, ai: false };
  } catch {
    return { text: fallback, ai: false };
  }
}

// ───────────────────────── หน้า LIFF (ไม่ต้อง session) ─────────────────────────

/**
 * สิ่งที่หน้า `/m/<slug>/review/<token>` ต้องรู้ — token ผิดร้าน/ไม่มี = invalid
 * token ที่ใช้ไปแล้ว (hash ถูกล้าง) = อ่าน reviewId จากส่วนหน้าของ token แล้วตอบแค่ "รีวิวไปแล้ว"
 */
export async function reviewLiffView(slug: string, token: string): Promise<ReviewLiffView> {
  let t = String(token ?? "").trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    return { state: "invalid" };
  }
  const tenant = await prisma.tenant.findUnique({ where: { slug: String(slug ?? "").trim() }, select: { id: true, name: true } });
  if (!tenant || t.length < 10) return { state: "invalid" };
  const open = await openRowOf(t);
  if (open && open.tenantId === tenant.id) {
    const [customer, settings, ref] = await Promise.all([
      prisma.customer.findUnique({ where: { id: open.customerId }, select: { name: true, firstName: true, nickname: true } }),
      getReviewSettings({ tenantId: open.tenantId, systemId: open.systemId, actorUserId: null }),
      open.refType && open.refId && (REVIEW_REF_TYPES as readonly string[]).includes(open.refType)
        ? resolveRef(open.tenantId, open.refType as ReviewRefType, open.refId).catch(() => null)
        : null,
    ]);
    const svc = open.serviceId ? await prisma.bookingService.findFirst({ where: { id: open.serviceId, tenantId: open.tenantId }, select: { name: true } }) : null;
    return {
      state: "open",
      shopName: tenant.name,
      serviceName: svc?.name ?? ref?.serviceName ?? null,
      firstName: customer?.nickname || customer?.firstName || (customer?.name ?? "").split(" ")[0] || "",
      rewardPoints: settings.rewardPoints,
      maxPhotos: REVIEW_MAX_PHOTOS,
    };
  }
  const reviewId = t.split(".")[0] ?? "";
  if (reviewId && reviewId !== t) {
    const done = await prisma.memberReview.findFirst({ where: { id: reviewId, tenantId: tenant.id, status: { not: "REQUESTED" } }, select: { rating: true } });
    if (done) return { state: "done", shopName: tenant.name, rating: done.rating };
  }
  return { state: "invalid" };
}

/** ร้านของลิงก์นี้ + ลิงก์ยังเปิดอยู่ไหม (ด่านก่อนรับไฟล์รูปจากหน้า LIFF) */
export async function reviewTokenTenant(slug: string, token: string): Promise<{ tenantId: string } | null> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: String(slug ?? "").trim() }, select: { id: true } });
  const open = await openRowOf(String(token ?? ""));
  return tenant && open && open.tenantId === tenant.id ? { tenantId: tenant.id } : null;
}

/** จำนวนดาวเป็นข้อความอ่านได้ (ใช้ในสรุปการ์ด/แจ้งเตือน) */
export function ratingLabel(rating: number): string {
  return `${Math.max(0, Math.min(5, Math.round(numOr(rating, 0))))} ดาว`;
}

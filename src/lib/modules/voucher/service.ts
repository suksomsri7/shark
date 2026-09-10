// service.ts — voucher (ส่วนลดรายใบของลูกค้าคนเดียว) · M2.5
// สัญญา: ledger/MEMBER-RUN.md §2 M2.5 · พิมพ์เขียว docs/modules/06-member-v2.md §4.2 §4.3 §5.7 §6.2 §7.1 §11.5 §11.6
//
// ── หลักคิดของโมดูลนี้ ────────────────────────────────────────────────────────────────
// 1) **ใบที่ออกไปแล้วต้องไม่เปลี่ยนเงื่อนไขย้อนหลัง** — `kind/value/config` ถูก snapshot ลงใบตอนออก
//    เจ้าของร้านแก้เทมเพลตทีหลังได้ตามใจ โดยไม่กระทบใบที่บอกลูกค้าไปแล้ว
// 2) **ออกซ้ำต้องไม่เบิ้ล** — `idempotencyKey = <origin>:<hash(originRef)>:<customerId>` (unique ต่อร้าน)
//    journey/แคมเปญ/คิว outbox ยิงซ้ำได้เสมอ ⇒ ใบซ้ำนับเป็น `skipped` ไม่ใช่ error
//    🔴 `reason` **ไม่** อยู่ในกุญแจ: คนละเหตุผลแต่ originRef เดียวกัน = งานเดิม (ไม่ใช่งานใหม่)
// 3) **ใช้ใบ = คำสั่งเดียวที่ atomic** — `updateMany where status ACTIVE` แล้วดู count
//    (อ่านแล้วค่อยเขียน = ยิงพร้อมกัน 2 เครื่องจะใช้ได้ทั้งคู่ — บทเรียนตัวนับร่วมของ RUN ก่อน)
// 4) **ออกทีละหลายคนแล้วเกินเพดาน = คำขอ ไม่ใช่ใบ** — พักไว้ที่ `VoucherIssueBatch` แล้วยื่นสายอนุมัติ
//    ผลกลับมาที่ `src/lib/approval-effects.ts` → `issueApprovedBatch` (idempotent · drain ซ้ำปลอดภัย)
// 5) เงินทุกช่อง = **สตางค์ (Int)**
//
// 🔴 import ข้ามโมดูลผ่าน **facade เท่านั้น** (fitness F2): `@/lib/modules/member` · `@/lib/modules/approval`

import { Prisma } from "@prisma/client";
import type { VoucherKind, VoucherOrigin, VoucherStatus } from "@prisma/client";
import { randomCode, randomToken, sha256 } from "@/lib/core/hash";
import { emitOutbox, emitOutboxMany } from "@/lib/core/outbox";
import * as approval from "@/lib/modules/approval";
import {
  MEMBER_LIMITS,
  briefFor,
  hasMemberPerm,
  logActivity,
  memberLimitError,
  memberRefs,
  type MemberActor,
} from "@/lib/modules/member";
import { prisma } from "./db";
import { VoucherForbiddenError, VoucherInputError, VoucherNotFoundError, VoucherStateError } from "./errors";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

/** ctx ของโมดูล — `systemId` = AppSystem.id ของ "ระบบสมาชิก" ที่เป็นเจ้าของใบ */
export type VoucherCtx = {
  tenantId: string;
  systemId: string;
  actorUserId?: string | null;
};

// ───────────────────────── ค่าคงที่ของกติกา ─────────────────────────

export const VOUCHER_KINDS: readonly VoucherKind[] = ["FIXED", "PERCENT", "FREE_SERVICE", "FREE_ITEM"];
export const VOUCHER_ORIGINS: readonly VoucherOrigin[] = [
  "TIER",
  "BIRTHDAY",
  "JOURNEY",
  "CAMPAIGN",
  "REDEEM",
  "COMPENSATION",
  "REFERRAL",
  "STAMP",
  "MANUAL",
  "API",
];

/** ต่ออายุให้อีกกี่วันเมื่อ "คืนใบ" (void บิล) แล้วใบหมดอายุไประหว่างทาง (§11.5) */
export const VOUCHER_RELEASE_GRACE_DAYS = 7;
/** แจ้งล่วงหน้าเมื่อเหลือกี่วัน (วันไทย) */
export const VOUCHER_EXPIRING_DAYS: readonly number[] = [7, 1];

/** ตัวอักษรของรหัสบนใบ — ตัด I O 0 1 ออกเพื่อไม่ให้ลูกค้าอ่านผิดตอนบอกทางโทรศัพท์ */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BKK_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/**
 * actor ของงานเบื้องหลัง (hook ขึ้นระดับ · สแตมป์ครบใบ · cron) — ไม่มีคนกดปุ่ม
 * 🔴 ให้ role OWNER โดยตั้งใจ: ของแจกที่ "ระบบสัญญาไว้กับลูกค้า" ต้องออกได้เสมอ ไม่ติดเพดานพนักงาน
 *    และไม่ควรค้างอยู่ในสายอนุมัติจนลูกค้าไม่ได้ของ (เพดาน/สายอนุมัติมีไว้คุมคนกดเอง §6.2)
 */
export const VOUCHER_SYSTEM_ACTOR: MemberActor = {
  userId: "system",
  role: "OWNER",
  unitAccess: ["*"],
  permissions: {},
};

// ───────────────────────── ชนิดข้อมูล ─────────────────────────

export type VoucherConfig = {
  /** ยอดบิลขั้นต่ำ (สตางค์) */
  minSatang?: number;
  categoryIds?: string[];
  itemIds?: string[];
  serviceIds?: string[];
  /** FREE_SERVICE — บริการที่แถมฟรี 1 หน่วย */
  serviceId?: string;
  /** FREE_ITEM — สินค้าที่แถมฟรี 1 หน่วย */
  itemId?: string;
  /** ใช้ร่วมกับคูปองในบิลเดียวกันได้ไหม (ปริยาย false) */
  stackWithCoupon?: boolean;
  /** PERCENT — เพดานส่วนลด (สตางค์) */
  maxDiscountSatang?: number;
  /** สาขาที่ใช้ได้ (ว่าง = ทุกสาขา) */
  unitIds?: string[];
};

export type TemplateInput = {
  name: string;
  kind: VoucherKind;
  value: number;
  config?: VoucherConfig;
  validDays: number;
  origin: VoucherOrigin;
  active?: boolean;
};

export type TemplateDto = {
  id: string;
  name: string;
  kind: VoucherKind;
  value: number;
  config: VoucherConfig;
  validDays: number;
  origin: VoucherOrigin;
  active: boolean;
  issuedCount: number;
};

export type AdhocInput = {
  kind: VoucherKind;
  value: number;
  config?: VoucherConfig;
  validDays: number;
};

export type IssueInput = {
  customerIds: string[];
  templateId?: string | null;
  adhoc?: AdhocInput | null;
  origin: VoucherOrigin;
  originRef?: Record<string, unknown> | null;
  reason?: string | null;
  /** แจ้งลูกค้าทาง LINE ตอนออก (การส่งจริงเป็นงานของ M3.6 — ใบนี้ส่งต่อไปกับ event) */
  notify?: boolean;
};

export type IssuedVoucherDto = {
  id: string;
  code: string;
  customerId: string;
  customerName: string;
  kind: VoucherKind;
  value: number;
  expiresAt: Date;
  status: VoucherStatus;
};

export type IssueDone = { pending?: false; issued: number; skipped: number; vouchers: IssuedVoucherDto[]; batchId?: string };
export type IssuePending = { pending: true; approvalRequestId: string; batchId: string };
export type IssueResult = IssueDone | IssuePending;

export type CartLine = {
  itemId?: string | null;
  serviceId?: string | null;
  categoryId?: string | null;
  qty: number;
  netSatang: number;
};

export type CartInput = {
  lines: CartLine[];
  netSatang: number;
  unitId?: string | null;
  couponApplied?: boolean;
};

export type ValidateInput = {
  customerId: string;
  code?: string | null;
  voucherId?: string | null;
  cart: CartInput;
};

export type ValidateResult = {
  ok: boolean;
  discountSatang: number;
  voucherId?: string;
  code?: string;
  reason?: string;
};

export type RedeemInput = {
  voucherId: string;
  customerId: string;
  saleId?: string | null;
  appointmentId?: string | null;
  discountSatang?: number | null;
};

export type VoucherDto = {
  id: string;
  code: string;
  name: string;
  customerId: string;
  customerName: string;
  kind: VoucherKind;
  value: number;
  config: VoucherConfig;
  origin: VoucherOrigin;
  status: VoucherStatus;
  issuedAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
};

export type VoucherKpi = {
  activeCount: number;
  activeValueSatang: number;
  usedThisMonth: number;
  usageRatePct: number;
};

export type ListVouchersOptions = {
  status?: VoucherStatus | null;
  origin?: VoucherOrigin | null;
  customerId?: string | null;
  q?: string | null;
  take?: number;
};

// ───────────────────────── ตัวช่วยพื้นฐาน ─────────────────────────

async function withTx<T>(tx: Tx | undefined, fn: (db: Db) => Promise<T>): Promise<T> {
  if (tx) return fn(tx);
  return prisma.$transaction((inner) => fn(inner), { timeout: 30_000, maxWait: 15_000 });
}

/** เลขวันแบบไทย (นับจาก epoch ที่ +07:00) — ใช้เทียบ "วันเดียวกัน/เหลือกี่วัน" ให้ตรงปฏิทินที่ลูกค้าดู */
function thaiDayNumber(at: Date): number {
  return Math.floor((at.getTime() + BKK_OFFSET_MS) / DAY_MS);
}

function thaiDayKey(at: Date): string {
  return new Date(at.getTime() + BKK_OFFSET_MS).toISOString().slice(0, 10);
}

/** ต้นเดือนปัจจุบันตามเวลาไทย (KPI "เดือนนี้" ต้องตรงกับปฏิทินที่เจ้าของร้านดู ไม่ใช่ UTC) */
function thaiMonthStart(now: Date = new Date()): Date {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${s.slice(0, 7)}-01T00:00:00.000+07:00`);
}

/** JSON ที่เรียงคีย์เสมอ — hash ของ originRef ต้องไม่เปลี่ยนตามลำดับคีย์ที่ผู้เรียกพิมพ์ */
function stableJson(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    .join(",")}}`;
}

function objectOf(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

function intOf(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : undefined;
}

/** อ่าน config จากคอลัมน์ Json ให้เป็นรูปเดียวกันเสมอ (ค่าที่ไม่รู้จัก = ทิ้ง ไม่พาโค้ดพัง) */
export function configOf(raw: unknown): VoucherConfig {
  const o = objectOf(raw);
  const out: VoucherConfig = {};
  const min = intOf(o.minSatang);
  if (min !== undefined) out.minSatang = min;
  const cat = strList(o.categoryIds);
  if (cat.length) out.categoryIds = cat;
  const items = strList(o.itemIds);
  if (items.length) out.itemIds = items;
  const services = strList(o.serviceIds);
  if (services.length) out.serviceIds = services;
  if (typeof o.serviceId === "string" && o.serviceId) out.serviceId = o.serviceId;
  if (typeof o.itemId === "string" && o.itemId) out.itemId = o.itemId;
  out.stackWithCoupon = o.stackWithCoupon === true;
  const cap = intOf(o.maxDiscountSatang);
  if (cap !== undefined) out.maxDiscountSatang = cap;
  const units = strList(o.unitIds);
  out.unitIds = units;
  return out;
}

function asJson(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v ?? {})) as Prisma.InputJsonValue;
}

const baht = (satang: number): string => (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** ชื่อที่ใช้เรียกใบ adhoc (ไม่มีเทมเพลตให้ยืมชื่อ) */
function adhocLabel(kind: VoucherKind, value: number, config: VoucherConfig): string {
  if (kind === "FIXED") return `ส่วนลด ฿${baht(value)}`;
  if (kind === "PERCENT") return `ส่วนลด ${value}%`;
  if (kind === "FREE_SERVICE") return "บริการฟรี 1 รายการ";
  return config.itemId ? "สินค้าฟรี 1 ชิ้น" : "ของแถม 1 ชิ้น";
}

/** "มูลค่าหน้าใบ" ที่ใช้คิดเพดานอนุมัติ/เพดานพนักงาน/KPI — PERCENT คิดจากเพดานส่วนลดที่ตั้งไว้ */
function faceValueSatang(kind: VoucherKind, value: number, config: VoucherConfig): number {
  if (kind === "FIXED") return value;
  if (kind === "PERCENT") return config.maxDiscountSatang ?? 0;
  return 0;
}

// ───────────────────────── สิทธิ์ (§6.1 · §6.2) ─────────────────────────
//
// อ่าน  = `member.promo.read` (read-โดยนัย: ใครเข้าโมดูลสมาชิกได้ก็เปิดดูรายการได้ — ด่านอยู่ที่หน้า)
// ออก/ใช้/คืนใบ = `member.promo.issue`
// เทมเพลต/ยกเลิกใบ = `member.promo.manage`

function assertIssue(actor: MemberActor): void {
  if (!hasMemberPerm(actor, "member.promo.issue")) {
    throw new VoucherForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ออก voucher — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

function assertManage(actor: MemberActor): void {
  if (!hasMemberPerm(actor, "member.promo.manage")) {
    throw new VoucherForbiddenError("งานนี้ต้องมีสิทธิ์จัดการโปรโมชัน — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

// ───────────────────────── ตรวจค่าที่กรอก ─────────────────────────

function assertKind(kind: unknown): VoucherKind {
  const k = String(kind ?? "");
  if (!VOUCHER_KINDS.includes(k as VoucherKind)) {
    throw new VoucherInputError("ยังไม่ได้เลือกแบบของ voucher — เลือกส่วนลดบาท · เปอร์เซ็นต์ · บริการฟรี หรือสินค้าฟรี");
  }
  return k as VoucherKind;
}

function assertOrigin(origin: unknown): VoucherOrigin {
  const o = String(origin ?? "");
  if (!VOUCHER_ORIGINS.includes(o as VoucherOrigin)) {
    throw new VoucherInputError("ยังไม่ได้ระบุต้นทางของ voucher — เลือกต้นทางที่ตรงกับงานนี้ก่อน");
  }
  return o as VoucherOrigin;
}

function assertValidDays(validDays: unknown): number {
  const d = Number(validDays);
  if (!Number.isInteger(d) || d < 1) {
    throw new VoucherInputError("อายุของ voucher ต้องเป็นจำนวนวันเต็มอย่างน้อย 1 วัน — ใส่จำนวนวันใหม่แล้วลองอีกครั้ง");
  }
  return d;
}

/** ตรวจ kind × value × config ให้เข้ากันเป็นชุดเดียว (ใช้ทั้งเทมเพลตและใบ adhoc) */
function normalizeShape(kindRaw: unknown, valueRaw: unknown, configRaw: unknown): { kind: VoucherKind; value: number; config: VoucherConfig } {
  const kind = assertKind(kindRaw);
  const config = configOf(configRaw);
  const value = Number(valueRaw ?? 0);

  if (kind === "FIXED") {
    if (!Number.isInteger(value) || value <= 0) {
      throw new VoucherInputError("มูลค่าส่วนลดต้องมากกว่า 0 บาท — ใส่มูลค่าใหม่แล้วลองอีกครั้ง");
    }
  } else if (kind === "PERCENT") {
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new VoucherInputError("ส่วนลดเปอร์เซ็นต์ต้องอยู่ระหว่าง 1–100 — แก้ตัวเลขแล้วลองอีกครั้ง");
    }
  } else if (kind === "FREE_SERVICE") {
    if (!config.serviceId) {
      throw new VoucherInputError("ยังไม่ได้เลือกบริการที่จะแถมฟรี — เลือกบริการก่อนบันทึก");
    }
  } else if (!config.itemId) {
    throw new VoucherInputError("ยังไม่ได้เลือกสินค้าที่จะแถมฟรี — เลือกสินค้าก่อนบันทึก");
  }

  if (config.minSatang !== undefined && config.minSatang < 0) {
    throw new VoucherInputError("ยอดบิลขั้นต่ำติดลบไม่ได้ — ใส่ 0 ถ้าไม่ต้องการกำหนดขั้นต่ำ");
  }
  if (config.maxDiscountSatang !== undefined && config.maxDiscountSatang < 0) {
    throw new VoucherInputError("เพดานส่วนลดติดลบไม่ได้ — เว้นว่างถ้าไม่ต้องการกำหนดเพดาน");
  }

  return { kind, value: kind === "FIXED" || kind === "PERCENT" ? value : 0, config };
}

// ───────────────────────── เทมเพลต ─────────────────────────

async function templateDto(row: {
  id: string;
  name: string;
  kind: VoucherKind;
  value: number;
  config: Prisma.JsonValue;
  validDays: number;
  origin: VoucherOrigin;
  active: boolean;
}, issuedCount: number): Promise<TemplateDto> {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    value: row.value,
    config: configOf(row.config),
    validDays: row.validDays,
    origin: row.origin,
    active: row.active,
    issuedCount,
  };
}

export async function createTemplate(ctx: VoucherCtx, actor: MemberActor, input: TemplateInput): Promise<TemplateDto> {
  assertManage(actor);
  const name = String(input?.name ?? "").trim();
  if (!name) throw new VoucherInputError("ยังไม่ได้ตั้งชื่อ voucher — ตั้งชื่อที่ลูกค้าอ่านแล้วเข้าใจก่อนบันทึก");

  const shape = normalizeShape(input?.kind, input?.value, input?.config);
  const validDays = assertValidDays(input?.validDays);
  const origin = assertOrigin(input?.origin);

  // เพดานเทมเพลตต่อระบบสมาชิก (MEMBER_LIMITS.voucherTemplates · §11.9)
  const used = await prisma.voucherTemplate.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (used >= MEMBER_LIMITS.voucherTemplates) {
    throw memberLimitError(
      `แบบ voucher ของระบบสมาชิกนี้ครบ ${MEMBER_LIMITS.voucherTemplates} แบบแล้ว — เก็บแบบที่เลิกใช้ออกก่อนจึงเพิ่มแบบใหม่ได้`,
    );
  }

  const row = await prisma.voucherTemplate.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name,
      kind: shape.kind,
      value: shape.value,
      config: asJson(shape.config),
      validDays,
      origin,
      active: input?.active !== false,
    },
  });
  return templateDto(row, 0);
}

export async function updateTemplate(
  ctx: VoucherCtx,
  actor: MemberActor,
  templateId: string,
  patch: Partial<TemplateInput>,
): Promise<TemplateDto> {
  assertManage(actor);
  const current = await prisma.voucherTemplate.findFirst({
    where: { id: templateId, tenantId: ctx.tenantId, systemId: ctx.systemId },
  });
  if (!current) throw new VoucherNotFoundError("ไม่พบแบบ voucher นี้ — รีเฟรชหน้าแล้วลองใหม่");

  const name = patch.name === undefined ? current.name : String(patch.name).trim();
  if (!name) throw new VoucherInputError("ยังไม่ได้ตั้งชื่อ voucher — ตั้งชื่อที่ลูกค้าอ่านแล้วเข้าใจก่อนบันทึก");

  const shape = normalizeShape(
    patch.kind ?? current.kind,
    patch.value ?? current.value,
    patch.config ?? current.config,
  );
  const validDays = assertValidDays(patch.validDays ?? current.validDays);
  const origin = assertOrigin(patch.origin ?? current.origin);

  const row = await prisma.voucherTemplate.update({
    where: { id: current.id },
    data: {
      name,
      kind: shape.kind,
      value: shape.value,
      config: asJson(shape.config),
      validDays,
      origin,
      ...(patch.active === undefined ? {} : { active: patch.active }),
    },
  });
  const issuedCount = await prisma.voucher.count({ where: { tenantId: ctx.tenantId, templateId: row.id } });
  return templateDto(row, issuedCount);
}

export async function toggleTemplate(
  ctx: VoucherCtx,
  actor: MemberActor,
  templateId: string,
  active: boolean,
): Promise<{ ok: true; active: boolean }> {
  assertManage(actor);
  const res = await prisma.voucherTemplate.updateMany({
    where: { id: templateId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    data: { active: !!active },
  });
  if (res.count === 0) throw new VoucherNotFoundError("ไม่พบแบบ voucher นี้ — รีเฟรชหน้าแล้วลองใหม่");
  return { ok: true, active: !!active };
}

export async function listTemplates(ctx: VoucherCtx): Promise<TemplateDto[]> {
  const rows = await prisma.voucherTemplate.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
  if (rows.length === 0) return [];
  const counts = await prisma.voucher.groupBy({
    by: ["templateId"],
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, templateId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const byId = new Map(counts.map((c) => [c.templateId ?? "", c._count._all]));
  return Promise.all(rows.map((r) => templateDto(r, byId.get(r.id) ?? 0)));
}

// ───────────────────────── ออกใบ (issue) ─────────────────────────

type VoucherSpec = {
  templateId: string | null;
  name: string;
  kind: VoucherKind;
  value: number;
  config: VoucherConfig;
  validDays: number;
};

async function resolveSpec(ctx: VoucherCtx, input: IssueInput): Promise<VoucherSpec> {
  if (input.templateId) {
    const tpl = await prisma.voucherTemplate.findFirst({
      where: { id: input.templateId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    });
    if (!tpl) throw new VoucherNotFoundError("ไม่พบแบบ voucher ที่เลือก — รีเฟรชหน้าแล้วเลือกใหม่");
    if (!tpl.active) {
      throw new VoucherInputError(`แบบ "${tpl.name}" ถูกปิดใช้งานอยู่ — เปิดใช้งานก่อน หรือเลือกแบบอื่นแทน`);
    }
    return {
      templateId: tpl.id,
      name: tpl.name,
      kind: tpl.kind,
      value: tpl.value,
      config: configOf(tpl.config),
      validDays: tpl.validDays,
    };
  }
  if (input.adhoc) {
    const shape = normalizeShape(input.adhoc.kind, input.adhoc.value, input.adhoc.config);
    const validDays = assertValidDays(input.adhoc.validDays);
    return { templateId: null, name: adhocLabel(shape.kind, shape.value, shape.config), ...shape, validDays };
  }
  throw new VoucherInputError("ยังไม่ได้เลือกแบบของ voucher — เลือกแบบที่ตั้งไว้ หรือกรอกเงื่อนไขเองก่อนออกใบ");
}

/** กุญแจกันออกซ้ำต่อ (ต้นทาง, งาน, ลูกค้า) — ไม่มี originRef = งานครั้งเดียว (สุ่มกุญแจใหม่ทุกครั้ง) */
function idempotencyKeyFor(origin: VoucherOrigin, keyRef: Record<string, unknown> | null, customerId: string, salt: string): string {
  const digest = keyRef ? sha256(stableJson(keyRef)).slice(0, 24) : salt;
  return `${origin}:${digest}:${customerId}`;
}

async function nextCode(db: Db, tenantId: string): Promise<string> {
  for (let i = 0; i < 8; i += 1) {
    const code = `V-${randomCode(6, CODE_ALPHABET)}`;
    const dup = await db.voucher.findFirst({ where: { tenantId, code }, select: { id: true } });
    if (!dup) return code;
  }
  // ชนกัน 8 ครั้งติด = ร้านใหญ่มาก → ยาวขึ้นอีก 4 ตัว (โอกาสชนต่ำจนไม่ต้องวนต่อ)
  return `V-${randomCode(10, CODE_ALPHABET)}`;
}

type IssueOptions = {
  batchId?: string | null;
  approvalRequestId?: string | null;
  tx?: Tx;
};

/** เขียนใบจริง — ผู้เรียกตรวจสิทธิ์/เพดาน/รายชื่อมาแล้ว */
async function writeVouchers(
  ctx: VoucherCtx,
  spec: VoucherSpec,
  names: Map<string, string>,
  customerIds: string[],
  input: IssueInput,
  opts: IssueOptions,
): Promise<IssueDone> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + spec.validDays * DAY_MS);
  const origin = assertOrigin(input.origin);
  const reason = (input.reason ?? "").trim();

  const baseRef = { ...(input.originRef ?? {}) };
  const keyRef: Record<string, unknown> | null = opts.batchId
    ? { ...baseRef, batchId: opts.batchId }
    : input.originRef && Object.keys(baseRef).length > 0
      ? baseRef
      : null;
  // 🔴 `reason`/`userId` อยู่ใน originRef ที่เก็บ แต่ **ไม่อยู่ในกุญแจกันซ้ำ** — คนละเหตุผลบนงานเดิม
  //    ยังเป็นงานเดิม (ไม่ใช่เหตุผลให้ออกใบเพิ่มอีกใบให้ลูกค้าคนเดียวกัน)
  const storedRef: Record<string, unknown> = {
    ...baseRef,
    ...(opts.batchId ? { batchId: opts.batchId } : {}),
    ...(reason ? { reason } : {}),
    ...(ctx.actorUserId ? { userId: ctx.actorUserId } : {}),
  };
  const salt = randomToken(9);

  const keys = customerIds.map((customerId) => ({
    customerId,
    key: idempotencyKeyFor(origin, keyRef, customerId, salt),
  }));
  const existing = await prisma.voucher.findMany({
    where: { tenantId: ctx.tenantId, idempotencyKey: { in: keys.map((k) => k.key) } },
    select: { idempotencyKey: true },
  });
  const already = new Set(existing.map((e) => e.idempotencyKey));
  const todo = keys.filter((k) => !already.has(k.key));

  const issued: IssuedVoucherDto[] = [];
  if (todo.length > 0) {
    await withTx(opts.tx, async (db) => {
      for (const { customerId, key } of todo) {
        const code = await nextCode(db, ctx.tenantId);
        const row = await db.voucher.create({
          data: {
            tenantId: ctx.tenantId,
            systemId: ctx.systemId,
            templateId: spec.templateId,
            customerId,
            code,
            kind: spec.kind,
            value: spec.value,
            config: asJson(spec.config),
            origin,
            originRef: Object.keys(storedRef).length > 0 ? asJson(storedRef) : undefined,
            issuedAt: now,
            expiresAt,
            status: "ACTIVE",
            approvalRequestId: opts.approvalRequestId ?? null,
            idempotencyKey: key,
          },
        });
        await emitOutbox(db, {
          tenantId: ctx.tenantId,
          type: "voucher.issued",
          idempotencyKey: `voucher.issued#${row.id}`,
          systemId: ctx.systemId,
          payload: {
            customerId,
            voucherId: row.id,
            origin,
            code: row.code,
            templateId: spec.templateId,
            expiresAt: expiresAt.toISOString(),
            notify: input.notify === true,
          },
        });
        await logActivity(
          {
            tenantId: ctx.tenantId,
            customerId,
            module: "voucher",
            type: "VOUCHER_ISSUED",
            refType: "Voucher",
            refId: row.id,
            summary: `ได้รับ voucher "${spec.name}" (${row.code}) หมดอายุ ${thaiDayKey(expiresAt)}`,
          },
          db,
        );
        issued.push({
          id: row.id,
          code: row.code,
          customerId,
          customerName: names.get(customerId) ?? "",
          kind: row.kind,
          value: row.value,
          expiresAt: row.expiresAt,
          status: row.status,
        });
      }
    });
  }

  return {
    issued: issued.length,
    skipped: customerIds.length - issued.length,
    vouchers: issued,
    ...(opts.batchId ? { batchId: opts.batchId } : {}),
  };
}

/**
 * ออก voucher ให้ลูกค้าหลายคนพร้อมกัน
 *
 * ตรวจทุกอย่างให้ครบ **ก่อน** เขียนแถวแรก — รายชื่อมีคนที่ไม่มีจริงปนอยู่ = ไม่ออกให้ใครเลย
 * (ครึ่ง ๆ กลาง ๆ คือสิ่งที่หน้าร้านแก้ยากที่สุด: ไม่รู้ว่าใครได้ไปแล้วบ้าง)
 */
export async function issue(ctx: VoucherCtx, actor: MemberActor, input: IssueInput, tx?: Tx): Promise<IssueResult> {
  assertIssue(actor);

  const customerIds = [...new Set((input?.customerIds ?? []).filter((x) => typeof x === "string" && x))];
  if (customerIds.length === 0) {
    throw new VoucherInputError("ยังไม่ได้เลือกผู้รับ — เลือกสมาชิกอย่างน้อย 1 คนก่อนออก voucher");
  }
  const origin = assertOrigin(input.origin);
  const spec = await resolveSpec(ctx, input);

  // ผู้รับต้องเป็นสมาชิกของระบบนี้ + อยู่ในขอบเขตสาขาของผู้ออก (นอกขอบเขต = ไม่พบ §6.4)
  const memberCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null };
  const briefs = await briefFor(memberCtx, actor, customerIds);
  if (briefs.length !== customerIds.length) {
    const missing = customerIds.length - briefs.length;
    throw new VoucherNotFoundError(
      `ไม่พบสมาชิก ${missing} คนในรายชื่อผู้รับ (อาจอยู่คนละสาขาหรือถูกรวมไปแล้ว) — ยังไม่ได้ออก voucher ให้ใคร ตรวจรายชื่อแล้วลองใหม่`,
    );
  }
  const names = new Map(briefs.map((b) => [b.id, b.name]));

  // §11.6 — กฎอัตโนมัติ (journey) ออกให้คนเดียวกันได้ไม่เกิน N ใบต่อวันไทย (กันวนซ้ำ)
  if (origin === "JOURNEY") {
    const cap = MEMBER_LIMITS.vouchersPerCustomerPerDay;
    const dayStart = new Date(thaiDayNumber(new Date()) * DAY_MS - BKK_OFFSET_MS);
    for (const customerId of customerIds) {
      const today = await prisma.voucher.count({
        where: { tenantId: ctx.tenantId, systemId: ctx.systemId, customerId, origin: "JOURNEY", issuedAt: { gte: dayStart } },
      });
      if (today + 1 > cap) {
        throw new VoucherInputError(
          `สมาชิกคนนี้ได้ voucher จากกฎอัตโนมัติครบ ${cap} ใบของวันนี้แล้ว — ระบบเว้นไว้ให้พรุ่งนี้ (ออกด้วยมือยังทำได้ตามปกติ)`,
        );
      }
    }
  }

  // §6.2 — พนักงาน (STAFF) ออกใบมูลค่าเกินเพดานต่อใบไม่ได้ (ไม่มีช่อง "ขออนุมัติ" ให้ STAFF)
  const perVoucher = faceValueSatang(spec.kind, spec.value, spec.config);
  if (actor.role === "STAFF") {
    const staffCap = MEMBER_LIMITS.voucherStaffMaxSatang;
    const uncappedPercent = spec.kind === "PERCENT" && spec.config.maxDiscountSatang === undefined;
    if (uncappedPercent || perVoucher > staffCap) {
      throw new VoucherInputError(
        `พนักงานออก voucher ได้ไม่เกินใบละ ฿${baht(staffCap)} — ใบที่เกินกว่านี้ต้องให้ผู้จัดการหรือเจ้าของร้านเป็นคนออก`,
      );
    }
  }

  // §11.6 — มูลค่ารวมเกินเพดาน → เก็บคำขอไว้แล้วยื่นสายอนุมัติ (OWNER ออกได้ทันทีเสมอ)
  const totalSatang = perVoucher * customerIds.length;
  const approvalOver = MEMBER_LIMITS.voucherIssueApprovalOverSatang;
  if (actor.role !== "OWNER" && totalSatang > approvalOver) {
    return submitIssueForApproval(ctx, actor, { ...input, customerIds, origin }, totalSatang);
  }

  return writeVouchers(ctx, spec, names, customerIds, { ...input, origin }, { tx });
}

async function submitIssueForApproval(
  ctx: VoucherCtx,
  actor: MemberActor,
  input: IssueInput,
  totalSatang: number,
): Promise<IssueResult> {
  const requestedById = ctx.actorUserId ?? actor.userId;
  const batch = await prisma.voucherIssueBatch.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      status: "PENDING",
      input: asJson({
        customerIds: input.customerIds,
        templateId: input.templateId ?? null,
        adhoc: input.adhoc ?? null,
        origin: input.origin,
        originRef: input.originRef ?? null,
        reason: input.reason ?? null,
        notify: input.notify === true,
      }),
      requestedById,
      totalSatang,
    },
  });

  const submitted = await approval.submitForApproval(
    { tenantId: ctx.tenantId },
    {
      entityType: "member.voucher.issue",
      entityId: batch.id,
      systemId: ctx.systemId,
      amountSatang: totalSatang,
      requestedById,
    },
  );

  // ไม่มีนโยบายอนุมัติในร้านนี้ = ไม่มีใครให้รอ → ออกทันที (แต่ยังเก็บ batch ไว้เป็นหลักฐานว่าเคยเกินเพดาน)
  if ("autoApproved" in submitted) {
    return issueApprovedBatch(ctx.tenantId, batch.id, true);
  }

  await prisma.voucherIssueBatch.update({
    where: { id: batch.id },
    data: { approvalRequestId: submitted.requestId },
  });
  return { pending: true, approvalRequestId: submitted.requestId, batchId: batch.id };
}

/**
 * ผลของการอนุมัติ "ออก voucher เกินเพดาน" — เรียกจาก `src/lib/approval-effects.ts` เท่านั้น
 * idempotent 2 ชั้น: guard สถานะ PENDING + `idempotencyKey` ของแต่ละใบ (drain ซ้ำ/replay ปลอดภัย)
 */
export async function issueApprovedBatch(tenantId: string, batchId: string, approved = true): Promise<IssueDone> {
  const empty: IssueDone = { issued: 0, skipped: 0, vouchers: [], batchId };
  const batch = await prisma.voucherIssueBatch.findFirst({ where: { id: batchId, tenantId } });
  if (!batch) return empty;

  if (!approved) {
    await prisma.voucherIssueBatch.updateMany({
      where: { id: batch.id, status: "PENDING" },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    return empty;
  }
  if (batch.status !== "PENDING") return empty;

  const saved = objectOf(batch.input);
  const ctx: VoucherCtx = { tenantId, systemId: batch.systemId, actorUserId: batch.requestedById };
  const input: IssueInput = {
    customerIds: strList(saved.customerIds),
    templateId: typeof saved.templateId === "string" ? saved.templateId : null,
    adhoc: saved.adhoc ? (saved.adhoc as AdhocInput) : null,
    origin: assertOrigin(saved.origin),
    originRef: saved.originRef ? objectOf(saved.originRef) : null,
    reason: typeof saved.reason === "string" ? saved.reason : null,
    notify: saved.notify === true,
  };
  const spec = await resolveSpec(ctx, input);
  const refs = await memberRefs({ tenantId, systemId: batch.systemId, actorUserId: batch.requestedById }, input.customerIds);
  const names = new Map(refs.map((r) => [r.id, r.name]));

  const res = await writeVouchers(ctx, spec, names, input.customerIds, input, {
    batchId: batch.id,
    approvalRequestId: batch.approvalRequestId,
  });
  await prisma.voucherIssueBatch.updateMany({
    where: { id: batch.id, status: "PENDING" },
    data: { status: "ISSUED", issuedAt: new Date(), decidedAt: new Date() },
  });
  return res;
}

// ───────────────────────── ตรวจก่อนใช้ (validate) ─────────────────────────

/** บรรทัดในตะกร้าที่ "เข้าเงื่อนไข" ของใบนี้ (ไม่ตั้งเงื่อนไขเลย = ทั้งบิล) */
function eligibleLines(config: VoucherConfig, lines: CartLine[]): CartLine[] {
  const cats = config.categoryIds ?? [];
  const items = config.itemIds ?? [];
  const services = config.serviceIds ?? [];
  if (cats.length === 0 && items.length === 0 && services.length === 0) return lines;
  return lines.filter(
    (l) =>
      (l.categoryId && cats.includes(l.categoryId)) ||
      (l.itemId && items.includes(l.itemId)) ||
      (l.serviceId && services.includes(l.serviceId)),
  );
}

const sumNet = (lines: CartLine[]): number => lines.reduce((n, l) => n + (Number(l.netSatang) || 0), 0);

/** ราคาต่อหน่วยของบรรทัดที่ตรงกับของแถม (แถมได้ 1 หน่วยเสมอ) */
function unitPriceOf(line: CartLine): number {
  const qty = Number(line.qty) || 1;
  return Math.floor((Number(line.netSatang) || 0) / (qty > 0 ? qty : 1));
}

const no = (reason: string): ValidateResult => ({ ok: false, discountSatang: 0, reason });

/**
 * ใบนี้ใช้กับตะกร้านี้ได้ไหม + ลดได้เท่าไหร่ — **อ่านอย่างเดียว ไม่เขียนอะไรเลย**
 * (หน้าขาย/LIFF เรียกซ้ำได้ทุกครั้งที่ลูกค้าเปลี่ยนของในตะกร้า)
 */
export async function validate(ctx: VoucherCtx, input: ValidateInput): Promise<ValidateResult> {
  const cart = input?.cart ?? { lines: [], netSatang: 0 };
  const lines = Array.isArray(cart.lines) ? cart.lines : [];
  const cartNet = Number(cart.netSatang) || sumNet(lines);

  const row = input.voucherId
    ? await prisma.voucher.findFirst({ where: { id: input.voucherId, tenantId: ctx.tenantId, systemId: ctx.systemId } })
    : input.code
      ? await prisma.voucher.findFirst({
          where: { tenantId: ctx.tenantId, systemId: ctx.systemId, code: String(input.code).trim().toUpperCase() },
        })
      : null;

  if (!row) return no("ไม่พบ voucher ใบนี้ — ตรวจรหัสบนใบอีกครั้ง");
  if (row.customerId !== input.customerId) return no("voucher ใบนี้เป็นของสมาชิกคนอื่น — ใช้กับบิลนี้ไม่ได้");

  if (row.status === "USED") return no("voucher ใบนี้ถูกใช้ไปแล้ว");
  if (row.status === "CANCELLED") return no("voucher ใบนี้ถูกยกเลิกแล้ว — ออกใบใหม่ให้ลูกค้าแทนได้");
  if (row.status === "EXPIRED") return no("voucher ใบนี้หมดอายุแล้ว");
  if (row.expiresAt.getTime() < Date.now()) return no("voucher ใบนี้หมดอายุแล้ว");

  const config = configOf(row.config);
  const units = config.unitIds ?? [];
  if (units.length > 0 && !(cart.unitId && units.includes(cart.unitId))) {
    return no("voucher ใบนี้ใช้ได้เฉพาะบางสาขา — สาขานี้ยังใช้ไม่ได้");
  }
  if (config.minSatang !== undefined && config.minSatang > cartNet) {
    return no(`ยอดบิลยังไม่ถึงขั้นต่ำ ฿${baht(config.minSatang)} ของ voucher ใบนี้`);
  }
  if (config.stackWithCoupon !== true && cart.couponApplied === true) {
    return no("บิลนี้ใช้คูปองอยู่แล้ว — voucher ใบนี้ใช้ร่วมกับคูปองไม่ได้");
  }

  if (row.kind === "FREE_SERVICE" || row.kind === "FREE_ITEM") {
    const target = row.kind === "FREE_SERVICE" ? config.serviceId : config.itemId;
    const line = lines.find((l) => (row.kind === "FREE_SERVICE" ? l.serviceId : l.itemId) === target);
    if (!target || !line) return no("ไม่มีรายการที่เข้าเงื่อนไขของ voucher ใบนี้ในบิล");
    return { ok: true, discountSatang: unitPriceOf(line), voucherId: row.id, code: row.code };
  }

  const eligible = eligibleLines(config, lines);
  const eligibleNet = sumNet(eligible);
  if (eligible.length === 0 || eligibleNet <= 0) {
    return no("ไม่มีรายการที่เข้าเงื่อนไขของ voucher ใบนี้ในบิล");
  }

  let discount = row.kind === "FIXED" ? Math.min(row.value, eligibleNet) : Math.floor((eligibleNet * row.value) / 100);
  if (row.kind === "PERCENT" && config.maxDiscountSatang !== undefined) {
    discount = Math.min(discount, config.maxDiscountSatang);
  }
  return { ok: true, discountSatang: Math.max(0, discount), voucherId: row.id, code: row.code };
}

// ───────────────────────── ใช้ / คืน / ยกเลิก ─────────────────────────

/**
 * ตัดใบเป็น USED — **คำสั่งเดียว** (`updateMany` + guard `status: ACTIVE`) แล้วดู count
 * ⇒ ยิงพร้อมกัน 2 เครื่องบนใบเดียวกัน สำเร็จได้ 1 เท่านั้น (ไม่ใช่ "อ่านแล้วค่อยเขียน")
 * ใส่ `tx` เพื่อให้อยู่ใน transaction ของบิลผู้เรียก (POS · จอง)
 */
export async function redeem(ctx: VoucherCtx, input: RedeemInput, tx?: Tx): Promise<{ ok: true; voucherId: string }> {
  const now = new Date();
  return withTx(tx, async (db) => {
    const res = await db.voucher.updateMany({
      where: {
        id: input.voucherId,
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        status: "ACTIVE",
      },
      data: {
        status: "USED",
        usedAt: now,
        usedRef: asJson({
          ...(input.saleId ? { saleId: input.saleId } : {}),
          ...(input.appointmentId ? { appointmentId: input.appointmentId } : {}),
          ...(input.discountSatang != null ? { discountSatang: input.discountSatang } : {}),
        }),
      },
    });
    if (res.count === 0) {
      throw new VoucherStateError(
        "voucher ใบนี้ใช้กับบิลนี้ไม่ได้ — อาจถูกใช้ไปแล้ว ถูกยกเลิก หมดอายุ หรือเป็นของสมาชิกคนอื่น",
      );
    }
    const row = await db.voucher.findUnique({ where: { id: input.voucherId } });
    await emitOutbox(db, {
      tenantId: ctx.tenantId,
      type: "voucher.used",
      idempotencyKey: `voucher.used#${input.voucherId}#${now.getTime()}`,
      systemId: ctx.systemId,
      payload: {
        customerId: input.customerId,
        voucherId: input.voucherId,
        origin: row?.origin ?? null,
        code: row?.code ?? null,
        saleId: input.saleId ?? null,
        appointmentId: input.appointmentId ?? null,
        discountSatang: input.discountSatang ?? null,
      },
    });
    return { ok: true as const, voucherId: input.voucherId };
  });
}

/**
 * คืนใบกลับให้ลูกค้า (บิลถูก void) — USED → ACTIVE
 * §11.5: ใบที่หมดอายุไประหว่างที่ถูกใช้อยู่ ต้องได้เวลาใหม่ 7 วัน ไม่งั้นลูกค้าเสียสิทธิ์เพราะความผิดของร้าน
 */
export async function release(
  ctx: VoucherCtx,
  input: { voucherId: string; reason?: string | null },
  tx?: Tx,
): Promise<{ ok: true; changed: boolean; expiresAt?: Date }> {
  const now = new Date();
  return withTx(tx, async (db) => {
    const row = await db.voucher.findFirst({ where: { id: input.voucherId, tenantId: ctx.tenantId } });
    if (!row) throw new VoucherNotFoundError();
    if (row.status !== "USED") return { ok: true as const, changed: false, expiresAt: row.expiresAt };

    const expiresAt = row.expiresAt.getTime() < now.getTime() ? new Date(now.getTime() + VOUCHER_RELEASE_GRACE_DAYS * DAY_MS) : row.expiresAt;
    const res = await db.voucher.updateMany({
      where: { id: row.id, tenantId: ctx.tenantId, status: "USED" },
      data: { status: "ACTIVE", usedAt: null, usedRef: Prisma.DbNull, expiresAt },
    });
    if (res.count === 0) return { ok: true as const, changed: false, expiresAt: row.expiresAt };
    return { ok: true as const, changed: true, expiresAt };
  });
}

/** ยกเลิกใบ (ออกผิดคน/ผิดมูลค่า) — ใบที่ลูกค้าใช้ไปแล้วยกเลิกไม่ได้ (ต้อง void บิลก่อน) */
export async function cancel(
  ctx: VoucherCtx,
  actor: MemberActor,
  input: { voucherId: string; reason: string },
): Promise<{ ok: true; changed: boolean }> {
  assertManage(actor);
  const reason = String(input?.reason ?? "").trim();
  if (!reason) throw new VoucherInputError("กรุณาระบุเหตุผลก่อนยกเลิก voucher (ลูกค้าอาจถามภายหลัง)");

  const row = await prisma.voucher.findFirst({ where: { id: input.voucherId, tenantId: ctx.tenantId } });
  if (!row) throw new VoucherNotFoundError();
  if (row.status === "USED") {
    throw new VoucherStateError("voucher ใบนี้ถูกใช้กับบิลไปแล้ว — ยกเลิกบิลนั้นก่อน ใบจึงจะกลับมาให้จัดการได้");
  }
  if (row.status === "CANCELLED") return { ok: true as const, changed: false };

  const storedRef = { ...objectOf(row.originRef), cancelReason: reason };
  await prisma.voucher.updateMany({
    where: { id: row.id, tenantId: ctx.tenantId, status: { in: ["ACTIVE", "EXPIRED"] } },
    data: { status: "CANCELLED", cancelledAt: new Date(), originRef: asJson(storedRef) },
  });
  return { ok: true as const, changed: true };
}

// ───────────────────────── หมดอายุ / ใกล้หมดอายุ (cron รายวัน) ─────────────────────────

/** ใบที่ถึงวันหมดอายุของ **ทุกร้าน** → EXPIRED (idempotent: guard `status: ACTIVE`) */
export async function expireDue(now: Date = new Date()): Promise<{ expired: number }> {
  let expired = 0;
  for (let round = 0; round < 50; round += 1) {
    const due = await prisma.voucher.findMany({
      where: { status: "ACTIVE", expiresAt: { lte: now } },
      select: { id: true, tenantId: true, systemId: true, customerId: true, origin: true, code: true },
      take: 500,
    });
    if (due.length === 0) break;

    const byTenant = new Map<string, typeof due>();
    for (const row of due) {
      const list = byTenant.get(row.tenantId) ?? [];
      list.push(row);
      byTenant.set(row.tenantId, list);
    }
    for (const [tenantId, rows] of byTenant) {
      await prisma.$transaction(async (tx) => {
        const res = await tx.voucher.updateMany({
          where: { id: { in: rows.map((r) => r.id) }, status: "ACTIVE" },
          data: { status: "EXPIRED" },
        });
        await emitOutboxMany(
          tx,
          rows.map((r) => ({
            tenantId,
            type: "voucher.expired",
            idempotencyKey: `voucher.expired#${r.id}`,
            systemId: r.systemId,
            payload: { customerId: r.customerId, voucherId: r.id, origin: r.origin, code: r.code },
          })),
        );
        expired += res.count;
      });
    }
    if (due.length < 500) break;
  }
  return { expired };
}

/**
 * แจ้งล่วงหน้า "voucher ใกล้หมดอายุ" ของทุกร้าน — เหลือ 7 วัน และ 1 วัน (นับเป็นวันไทย)
 * dedupe ต่อ (ใบ, วันไทยที่แจ้ง) ผ่าน idempotencyKey ของ outbox ⇒ รันซ้ำวันเดียวกันไม่ส่งซ้ำ
 */
export async function notifyExpiring(now: Date = new Date()): Promise<{ notified: number }> {
  const today = thaiDayNumber(now);
  const stamp = thaiDayKey(now);
  let notified = 0;

  for (const daysLeft of VOUCHER_EXPIRING_DAYS) {
    const start = new Date((today + daysLeft) * DAY_MS - BKK_OFFSET_MS);
    const end = new Date(start.getTime() + DAY_MS);
    const rows = await prisma.voucher.findMany({
      where: { status: "ACTIVE", expiresAt: { gte: start, lt: end } },
      // ใบที่หมดอายุก่อน = เร่งด่วนกว่า ⇒ แจ้งก่อน (ลำดับของคิวสะท้อนลำดับความเร่งด่วนจริง)
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      select: { id: true, tenantId: true, systemId: true, customerId: true, expiresAt: true, code: true },
      take: 5_000,
    });
    // 🔴 emit ทีละใบ (ไม่ใช่ createMany ก้อนเดียว) แบบเดียวกับ `point/lots.ts#notifyExpiring`:
    //    เช็คก่อนว่าวันนี้แจ้งไปแล้วหรือยัง ⇒ `notified` คือ "จำนวนที่แจ้งใหม่จริง" ไม่ใช่จำนวนใบที่เข้าเกณฑ์
    //    (รันซ้ำวันเดียวกันจึงคืน 0 ไม่ใช่ตัวเลขเดิม — ตัวเลขในรายงาน cron จะได้ไม่หลอกตา)
    for (const r of rows) {
      const key = `voucher.expiring#${r.id}#${stamp}`;
      const already = await prisma.outboxEvent.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: r.tenantId, idempotencyKey: key } },
        select: { id: true },
      });
      if (already) continue;
      await emitOutbox(prisma, {
        tenantId: r.tenantId,
        type: "voucher.expiring",
        idempotencyKey: key,
        systemId: r.systemId,
        payload: { customerId: r.customerId, voucherId: r.id, expiresAt: r.expiresAt.toISOString(), daysLeft, code: r.code },
      });
      notified += 1;
    }
  }
  return { notified };
}

// ───────────────────────── อ่านรายการ ─────────────────────────

function nameOf(templateName: string | null | undefined, kind: VoucherKind, value: number, config: VoucherConfig): string {
  return templateName && templateName.trim() ? templateName : adhocLabel(kind, value, config);
}

/**
 * ใบของลูกค้า 1 คน — ใบที่ใช้ได้ขึ้นก่อน (ใกล้หมดอายุสุดก่อน) แล้วค่อยใบที่จบไปแล้ว
 * ปริยาย **ไม่รวมใบที่ยกเลิก** (ลูกค้าไม่ต้องเห็นของที่ร้านเก็บคืน)
 */
export async function listForCustomer(
  ctx: VoucherCtx,
  customerId: string,
  opts: { status?: VoucherStatus | null } = {},
): Promise<VoucherDto[]> {
  const rows = await prisma.voucher.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      customerId,
      ...(opts.status ? { status: opts.status } : { status: { not: "CANCELLED" } }),
    },
    include: { template: { select: { name: true } } },
  });
  const refs = await memberRefs({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null }, [customerId]);
  const customerName = refs[0]?.name ?? "";

  const dtos = rows.map((r) => {
    const config = configOf(r.config);
    return {
      id: r.id,
      code: r.code,
      name: nameOf(r.template?.name, r.kind, r.value, config),
      customerId: r.customerId,
      customerName,
      kind: r.kind,
      value: r.value,
      config,
      origin: r.origin,
      status: r.status,
      issuedAt: r.issuedAt,
      expiresAt: r.expiresAt,
      usedAt: r.usedAt,
    } satisfies VoucherDto;
  });

  const rank = (s: VoucherStatus): number => (s === "ACTIVE" ? 0 : 1);
  return dtos.sort(
    (a, b) => rank(a.status) - rank(b.status) || a.expiresAt.getTime() - b.expiresAt.getTime() || a.id.localeCompare(b.id),
  );
}

/** ตาราง + KPI ของหน้า "โปรโมชัน › Voucher" (ภาพ 19) */
export async function listVouchers(ctx: VoucherCtx, opts: ListVouchersOptions = {}): Promise<{ rows: VoucherDto[]; kpi: VoucherKpi }> {
  const take = Math.min(Math.max(opts.take ?? 100, 1), 500);
  const q = String(opts.q ?? "").trim();
  const where = {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.origin ? { origin: opts.origin } : {}),
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
  };

  // มีคำค้น = กวาดหน้าต่างกว้างขึ้นแล้วกรองในหน่วยความจำ (ค้น "ผู้รับ" ต้องเทียบชื่อที่มาจากโมดูลสมาชิก
  // ผ่าน facade — โมดูลนี้ไม่ query ตารางลูกค้าเอง)
  const scan = await prisma.voucher.findMany({
    where,
    include: { template: { select: { name: true } } },
    orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    take: q ? 1_000 : take,
  });
  const refs = await memberRefs(
    { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null },
    scan.map((r) => r.customerId),
  );
  const nameById = new Map(refs.map((r) => [r.id, r.name]));

  const all = scan.map((r) => {
    const config = configOf(r.config);
    return {
      id: r.id,
      code: r.code,
      name: nameOf(r.template?.name, r.kind, r.value, config),
      customerId: r.customerId,
      customerName: nameById.get(r.customerId) ?? "",
      kind: r.kind,
      value: r.value,
      config,
      origin: r.origin,
      status: r.status,
      issuedAt: r.issuedAt,
      expiresAt: r.expiresAt,
      usedAt: r.usedAt,
    } satisfies VoucherDto;
  });

  const needle = q.toLowerCase();
  const rows = (q
    ? all.filter(
        (r) =>
          r.code.toLowerCase().includes(needle) ||
          r.name.toLowerCase().includes(needle) ||
          r.customerName.toLowerCase().includes(needle),
      )
    : all
  ).slice(0, take);

  const kpi = await voucherKpi(ctx);
  return { rows, kpi };
}

async function voucherKpi(ctx: VoucherCtx): Promise<VoucherKpi> {
  const base = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const [activeRows, usedThisMonth, issuedTotal, usedTotal] = await Promise.all([
    prisma.voucher.findMany({ where: { ...base, status: "ACTIVE" }, select: { kind: true, value: true, config: true }, take: 5_000 }),
    prisma.voucher.count({ where: { ...base, usedAt: { gte: thaiMonthStart() } } }),
    prisma.voucher.count({ where: { ...base, status: { not: "CANCELLED" } } }),
    prisma.voucher.count({ where: { ...base, status: "USED" } }),
  ]);
  const activeValueSatang = activeRows.reduce((n, r) => n + faceValueSatang(r.kind, r.value, configOf(r.config)), 0);
  return {
    activeCount: activeRows.length,
    activeValueSatang,
    usedThisMonth,
    // "อัตราการใช้" = ใบที่ลูกค้าเอามาใช้จริง ÷ ใบที่ออกไปทั้งหมด (ไม่นับใบที่ร้านยกเลิกเอง)
    usageRatePct: issuedTotal > 0 ? Math.round((usedTotal * 100) / issuedTotal) : 0,
  };
}

// ───────────────────────── รวมสมาชิกซ้ำ ─────────────────────────

/** ย้ายใบทุกใบของคนที่ถูกรวม ไปเป็นของคนที่เก็บไว้ (§11.1) — เรียกจาก `member/profile.ts` */
export async function mergeVouchers(
  ctx: VoucherCtx,
  input: { keepId: string; mergeId: string },
  tx?: Tx,
): Promise<{ moved: number }> {
  const db: Db = tx ?? prisma;
  const res = await db.voucher.updateMany({
    where: { tenantId: ctx.tenantId, customerId: input.mergeId },
    data: { customerId: input.keepId },
  });
  return { moved: res.count };
}

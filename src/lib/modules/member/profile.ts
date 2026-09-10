// profile.ts — หัวใจของ "ระบบสมาชิก v2": สมัคร · แก้ไข · หน้า 360 · ตัวตนหลายช่องทาง · คนซ้ำ/รวมคน
// (WO M1.4 · พิมพ์เขียว docs/modules/06-member-v2.md §5.2 §6.1–6.4 §7.1 §11.1 §11.8)
//
// กติกาประจำไฟล์
//   • ctx = { tenantId, systemId (= ระบบสมาชิก), actorUserId } · actor = สิทธิ์ของคนที่กด (access.ts)
//   • ทุก mutation อยู่ใน transaction เดียว → emit outbox ใน tx เดียวกัน (event รอดพร้อมข้อมูล)
//   • 404-not-403 (§6.4): สมาชิกที่อยู่นอกสาขาที่ actor ดูแล = "ไม่พบ" เสมอ ห้ามบอกว่ามีอยู่จริง
//   • ข้อมูลอ่อนไหวตัดสินที่ `privacy.ts` — ดูไม่ได้ = **ไม่ส่งค่าลง DTO เลย** (ไม่ใช่ซ่อนด้วย CSS)
//   • ข้ามโมดูลผ่าน facade เท่านั้น: `party` (ตัวตนกลาง) · `point` (แต้ม) · `approval` (สายอนุมัติ)
//     · `system` (resolve ระบบแต้มที่ผูกสาขาเดียวกัน) — ห้าม import chat/pos/kanban/บัญชี/CRM/HR
//     ตัวเลข "การเชื่อมต่อ" ของหน้า 360 จึงเป็น **การอ่านอย่างเดียว** ผ่าน prisma (ดูคอมเมนต์ที่ฟังก์ชัน)
//   • prisma ดิบผ่าน `./db` (จุดเดียวของโมดูลที่ล้วง core — ดู member/db.ts)

import type { MemberSource, MemberStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { emitOutbox } from "@/lib/core/outbox";
import { writeAudit } from "@/lib/core/audit";
import { getChannel, isChannelKey } from "@/lib/core/channels";
import { randomCode } from "@/lib/core/hash";
import { formatThaiDateTime, THAI_MONTH_SHORT } from "@/lib/ui/date";
import * as party from "@/lib/modules/party";
import * as point from "@/lib/modules/point";
import * as approval from "@/lib/modules/approval/service";
import { systemForUnit, unitsForSystem } from "@/lib/modules/system/service";
import { prisma } from "./db";
import { coversUnit, hasMemberPerm, isUnitScoped, type MemberActor } from "./access";
import { MemberConflictError, MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import * as fields from "./fields";
import * as tiers from "./tiers";
import { evaluateSensitiveAccess, logAccess, type MemberCtx } from "./privacy";
import { uniqueMemberCode } from "./service";

type Tx = Prisma.TransactionClient;

export type { MemberCtx };

// ───────────────────────── ชนิดข้อมูลสาธารณะ ─────────────────────────

export type MemberTierBrief = { id: string; key: string; name: string; color: string };

/** การ์ดสมาชิกแบบย่อ — ใช้ในแผงข้างของโมดูลอื่น (แชท/บอร์ดงาน) และในผลลัพธ์ "คนซ้ำ" */
export type MemberBrief = {
  id: string;
  memberCode: string;
  name: string;
  tier: MemberTierBrief | null;
  points: number;
  /** เบอร์แบบปิดบัง (081-xxx-1234) — facade ไม่เคยส่งเบอร์เต็มออกนอกโมดูล */
  phoneMasked: string;
  status: MemberStatus;
};

export type CreateMemberInput = {
  phone?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  nickname?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  fields?: Record<string, unknown>;
  consents?: { channel: string; granted: boolean; source?: string }[];
  source: string;
  sourceDetail?: Record<string, unknown>;
  sourceChannel?: string | null;
  referralCode?: string | null;
  homeUnitId?: string | null;
  tags?: string[];
  idempotencyKey?: string | null;
};

export type CreateMemberResult = {
  created: boolean;
  customerId: string;
  memberCode: string;
  partyId: string | null;
  duplicate?: MemberBrief;
};

export type UpdateMemberInput = {
  fields?: Record<string, unknown>;
  tags?: string[];
  status?: string;
  ownerUserId?: string | null;
  homeUnitId?: string | null;
};

export type Member360Field = {
  key: string;
  label: string;
  type: string;
  value: fields.MemberFieldValueInput;
  display: string;
};

export type Member360Section = {
  id: string;
  key: string;
  label: string;
  sensitive: boolean;
  isSystem: boolean;
  sortOrder: number;
  columns: number;
  /** false = ส่วนอ่อนไหวที่ actor คนนี้ดูไม่ได้ → `fields` ว่างเสมอ (ค่าไม่เคยถูกส่งออกไป) */
  visible: boolean;
  fields: Member360Field[];
};

export type MemberIdentityDto = {
  id: string;
  channel: string;
  channelLabel: string;
  externalId: string;
  displayName: string | null;
  verified: boolean;
  linkedBy: string;
  linkedAt: Date;
  lastSeenAt: Date | null;
};

export type MemberConsentDto = {
  channel: string;
  channelLabel: string;
  granted: boolean;
  source: string;
  policyVersion: number | null;
  grantedAt: Date | null;
  revokedAt: Date | null;
};

export type MemberAttributionDto = {
  touch: string;
  source: string;
  linkId: string | null;
  campaignId: string | null;
  staffUserId: string | null;
  referrerCustomerId: string | null;
  unitId: string | null;
  occurredAt: Date;
};

export type Member360 = {
  profile: {
    id: string;
    memberCode: string;
    name: string;
    firstName: string | null;
    lastName: string | null;
    nickname: string | null;
    phone: string | null;
    phoneMasked: string;
    email: string | null;
    birthDate: Date | null;
    gender: string | null;
    status: MemberStatus;
    tags: string[];
    ownerUserId: string | null;
    ownerName: string | null;
    /** M1.5 — เพิ่มควบคู่ ownerUserId/ownerName เดิม (additive) ให้หน้า 360 ไม่ต้อง join เอง */
    owner: { name: string } | null;
    homeUnitId: string | null;
    homeUnit: { id: string; name: string } | null;
    partyId: string | null;
    source: string | null;
    referralCode: string | null;
    referredById: string | null;
    createdAt: Date;
    tier: MemberTierBrief | null;
  };
  sections: Member360Section[];
  stats: {
    spent12mSatang: number;
    visits12m: number;
    points: number;
    totalSpentSatang: number;
    visitCount: number;
    lastActivityAt: Date | null;
    /** M1.5 — ยังไม่มีตาราง voucher (M2.5) → คงที่ 0 จนกว่าใบนั้นจะมา */
    vouchers: number;
    /** M1.5 — อ่านจาก `Customer.reviewAvg` ตรง ๆ (คอลัมน์มีตั้งแต่ M1.1 · ยังไม่มีใครเขียนจนกว่า M3.4) */
    reviewAvg: number | null;
  };
  tier: {
    current: MemberTierBrief | null;
    next: MemberTierBrief | null;
    /** ตีกลับรอบ 1 ข้อ 6 — ความคืบหน้าไปสู่ `next` (เกณฑ์แรกของกฎเลื่อนระดับ) เอามาจาก `tiers.evaluateMember` ตรง ๆ
     *  หน่วยของ `current`/`target` ตามฟิลด์ของเกณฑ์ (spent12m = สตางค์) — ไม่มี = ไม่มีระดับถัดไป/เอนจินล้ม */
    progressToNext: tiers.TierProgress | null;
  };
  identities: MemberIdentityDto[];
  consents: MemberConsentDto[];
  attribution: { first: MemberAttributionDto | null; last: MemberAttributionDto | null };
  connections: { chat: number; crm: number; account: number; kanbanCards: number };
  mergedIntoId: string | null;
};

export type LinkIdentityInput = {
  channel: string;
  externalId: string;
  phone?: string | null;
  email?: string | null;
  displayName?: string | null;
  contactId?: string | null;
  verified?: boolean;
};

export type LinkIdentityResult = {
  customerId: string | null;
  matchedBy: "PHONE" | "EMAIL" | "CHANNEL_ID" | null;
  identityId?: string;
  candidates: MemberBrief[];
};

export type DuplicatePairDto = {
  id: string;
  a: MemberBrief;
  b: MemberBrief;
  reason: string;
  score: number;
};

export type MergeInput = {
  keepId: string;
  mergeId: string;
  /** เลือกว่าจะเอาค่าฟิลด์ของใคร: { nickname: "B" } = ใช้ค่าของคนที่ถูกรวม */
  fieldChoices?: Record<string, "A" | "B">;
  confirm?: string;
};

export type MergeResult = { keptId: string } | { pending: true; approvalRequestId: string };

// ───────────────────────── ตัวช่วยพื้นฐาน ─────────────────────────

const SOURCES: readonly string[] = [
  "WALK_IN", "POS", "BOOKING", "LINE_OA", "LIFF", "WEB_FORM", "CHAT",
  "REFERRAL", "IMPORT", "CRM", "CAMPAIGN", "API", "MARKETPLACE", "APP", "OTHER",
];
const STATUSES: readonly string[] = ["ACTIVE", "SUSPENDED", "CLOSED", "MERGED"];
const GENDERS: readonly string[] = ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"];
const CONSENT_SOURCES: readonly string[] = ["SIGNUP_FORM", "LIFF", "STAFF", "IMPORT", "API", "CUSTOMER_SELF"];
/** ช่องทางที่ค่า `Customer.marketingConsent` (v1) เป็นตัวแทนอยู่ — §4.5 */
const LEGACY_CONSENT_CHANNELS = ["LINE", "EMAIL", "SMS"];
/** ตัวอักษรของโค้ดแนะนำเพื่อน (ตัดตัวสับสน 0/O/1/I เหมือนรหัสสมาชิก) */
const REFERRAL_ALPHABET = "ACDEFGHJKLMNPQRSTUVWXY3456789";

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

function normEmail(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null;
}
function normPhone(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function trimOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** วันที่ไทยแบบ "YYYY-MM-DD" → เที่ยงคืน UTC (คอลัมน์เป็น @db.Date — อ่านกลับด้วย getUTC*) */
function parseYmd(value: string): Date {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/** เบอร์แบบปิดบัง — เห็นต้น 3 ท้าย 4 พอให้ยืนยันตัวตนที่หน้าร้าน ไม่พอให้เอาไปโทรหา */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return "xxx-xxx-xxxx";
  return `${digits.slice(0, 3)}-xxx-${digits.slice(-4)}`;
}

/** รูปแบบเบอร์ที่โมดูลอื่นอาจเก็บไว้ (0…, +66…, 66…) — ใช้ตอนนับ "ห้องแชทของคนนี้" */
function phoneVariants(phone: string | null | undefined): string[] {
  const raw = (phone ?? "").trim();
  if (!raw) return [];
  const norm = party.normalizePartyPhone(raw);
  const out = new Set<string>([raw]);
  if (norm) {
    out.add(norm);
    if (norm.startsWith("0")) {
      out.add(`+66${norm.slice(1)}`);
      out.add(`66${norm.slice(1)}`);
    }
  }
  return [...out];
}

type CustomerRow = Prisma.CustomerGetPayload<Record<string, never>>;

function tierBriefOf(row: { id: string; key: string; name: string; color: string } | null | undefined): MemberTierBrief | null {
  return row ? { id: row.id, key: row.key, name: row.name, color: row.color } : null;
}

// ตีกลับรอบ 1 ข้อ 5 — display เป็นหน้าที่ของ DTO ไม่ใช่ UI: ต้องคืนป้ายไทย ไม่ใช่ค่าดิบที่เก็บใน DB
// (SELECT/MULTI_SELECT ใช้ options.choices ของฟิลด์เอง — ครอบคลุมเพศ/ที่มา/ระดับใบรับรอง ฯลฯ ทุกฟิลด์
//  ที่ผ่านตัวออกแบบฟิลด์ M1.3 โดยอัตโนมัติ เพราะป้ายไทยถูกตั้งไว้ที่ตัวเลือกอยู่แล้ว)
const COUNTRY_NAMES_TH: Record<string, string> = {
  TH: "ไทย", US: "สหรัฐอเมริกา", GB: "สหราชอาณาจักร", CN: "จีน", JP: "ญี่ปุ่น", KR: "เกาหลีใต้",
  DE: "เยอรมนี", FR: "ฝรั่งเศส", AU: "ออสเตรเลีย", RU: "รัสเซีย", IN: "อินเดีย", SG: "สิงคโปร์",
  MY: "มาเลเซีย", MM: "เมียนมา", LA: "ลาว", KH: "กัมพูชา", VN: "เวียดนาม",
};
const LOCALE_NAMES_TH: Record<string, string> = { th: "ไทย", en: "อังกฤษ", zh: "จีน", ja: "ญี่ปุ่น", ko: "เกาหลี" };

/** "YYYY-MM-DD" (DATE เก็บเที่ยงคืน UTC — อ่านจากสตริง ไม่ผ่าน timezone) → "12 ก.พ. 2533" (พ.ศ.) */
function thaiDateOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${d} ${THAI_MONTH_SHORT[m - 1] ?? ""} ${y + 543}`;
}

/** อายุปีนี้จากวันเกิด "YYYY-MM-DD" — null ถ้ารูปแบบผิด */
function ageOf(ymd: string): number | null {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age;
}

/**
 * ค่า display ไทยของฟิลด์ 1 ตัว — export ให้ `list.ts` (ตาราง/ส่งออก) ใช้ตัวเดียวกัน (ไม่พิมพ์ตรรกะซ้ำ)
 * `lookupNames` (ตีกลับรอบ 2 ข้อ 2) — แผนที่ id→ชื่อของฟิลด์ LOOKUP ที่ resolve มาก่อนแล้ว (แบบ batch — ดู
 * `resolveLookupNames`) ไม่ส่งมา = ฟิลด์ LOOKUP คืน id ดิบเหมือนเดิม (list.ts ยังไม่ต้อง resolve ทุกจุด)
 */
export function displayOf(
  field: Pick<fields.FieldDef, "key" | "type" | "options">,
  value: fields.MemberFieldValueInput,
  lookupNames?: Map<string, string>,
): string {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "BOOLEAN") return value ? "ใช่" : "ไม่ใช่";
  if (field.type === "SELECT") {
    const choice = field.options.choices?.find((c) => c.value === value);
    return choice?.label ?? String(value);
  }
  if (field.type === "MULTI_SELECT" && Array.isArray(value)) {
    return value.map((v) => field.options.choices?.find((c) => c.value === v)?.label ?? v).join(", ");
  }
  if (field.type === "LOOKUP" && typeof value === "string" && lookupNames) {
    return lookupNames.get(value) ?? "(ถูกลบ)";
  }
  if (field.type === "DATE" && typeof value === "string") {
    const date = thaiDateOf(value);
    if (field.key === "birthDate") {
      const age = ageOf(value);
      return age !== null ? `${date} (${age} ปี)` : date;
    }
    return date;
  }
  if (field.type === "DATETIME" && typeof value === "string") return formatThaiDateTime(value);
  // ฟิลด์ระบบบางตัวเป็น TEXT เก็บรหัส (ISO ประเทศ/ภาษา/คีย์ช่องทาง) — จับคู่เป็นชื่อไทยตามทะเบียนที่มี
  if (field.key === "nationality" && typeof value === "string") return COUNTRY_NAMES_TH[value.toUpperCase()] ?? value;
  if (field.key === "locale" && typeof value === "string") return LOCALE_NAMES_TH[value.toLowerCase()] ?? value;
  if (field.key === "preferredChannel" && typeof value === "string") return getChannel(value)?.label ?? value;
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/**
 * ตีกลับรอบ 2 ข้อ 2 — resolve id→ชื่อของฟิลด์ LOOKUP แบบ batch (1 query ต่อ target ที่ใช้จริงในหน้านั้น
 * ไม่ใช่ 1 query ต่อฟิลด์) ใช้ได้ทั้งฟิลด์ระบบ (homeUnitId target UNIT · ownerUserId target USER) และ
 * ฟิลด์กำหนดเอง (เช่น instructorId target EMPLOYEE) — id ที่หาไม่เจอ (ถูกลบไปแล้ว) ไม่ใส่ลง map
 * (`displayOf` คืน "(ถูกลบ)" เอง) · อ่านอย่างเดียวข้ามโมดูล (แบบเดียวกับ `connectionsOf`/`privacy.ts` — ดูหมายเหตุหัวไฟล์)
 */
async function resolveLookupNames(ctx: MemberCtx, entries: { target: string | undefined; id: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byTarget = new Map<string, string[]>();
  for (const e of entries) {
    if (!e.target || !e.id) continue;
    const list = byTarget.get(e.target) ?? [];
    list.push(e.id);
    byTarget.set(e.target, list);
  }
  if (byTarget.size === 0) return out;

  await Promise.all(
    [...byTarget.entries()].map(async ([target, rawIds]) => {
      const ids = [...new Set(rawIds)];
      switch (target) {
        case "UNIT": {
          const rows = await prisma.businessUnit.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: { id: true, name: true } });
          for (const r of rows) out.set(r.id, r.name);
          return;
        }
        case "USER": {
          const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
          for (const r of rows) out.set(r.id, r.name ?? r.email);
          return;
        }
        case "EMPLOYEE": {
          const rows = await prisma.hrEmployee.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: { id: true, name: true } });
          for (const r of rows) out.set(r.id, r.name);
          return;
        }
        case "PRODUCT": {
          const rows = await prisma.invItem.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: { id: true, name: true } });
          for (const r of rows) out.set(r.id, r.name);
          return;
        }
        case "SERVICE": {
          const rows = await prisma.bookingService.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: { id: true, name: true } });
          for (const r of rows) out.set(r.id, r.name);
          return;
        }
        case "CUSTOMER": {
          const rows = await prisma.customer.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: { id: true, name: true, firstName: true, lastName: true, memberCode: true } });
          for (const r of rows) out.set(r.id, r.name ?? ([r.firstName, r.lastName].filter(Boolean).join(" ") || r.memberCode || r.id));
          return;
        }
        default:
          return;
      }
    }),
  );
  return out;
}

function tagsOf(row: { tags: Prisma.JsonValue }): string[] {
  return Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === "string") : [];
}

function sourceDetailOf(row: { sourceDetail: Prisma.JsonValue }): Record<string, unknown> {
  const v = row.sourceDetail;
  return v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
}

const db = (tx?: Tx) => tx ?? prisma;

// ───────────────────────── สิทธิ์ + ขอบเขตสาขา ─────────────────────────

function requirePerm(actor: MemberActor, key: string, what: string): void {
  if (!hasMemberPerm(actor, key)) {
    throw new MemberForbiddenError(`บัญชีของคุณยังไม่ได้รับสิทธิ์${what} — ขอสิทธิ์จากเจ้าของร้านก่อน`);
  }
}

const NOT_FOUND_MSG = "ไม่พบสมาชิกคนนี้ในระบบสมาชิกที่เปิดอยู่ (อาจอยู่คนละสาขาหรือถูกลบไปแล้ว)";

async function loadCustomer(ctx: MemberCtx, id: string, tx?: Tx): Promise<CustomerRow> {
  const row = await db(tx).customer.findFirst({
    where: { id, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
  });
  if (!row) throw new MemberNotFoundError(NOT_FOUND_MSG);
  return row;
}

/**
 * ขอบเขตสาขา (§6.1): STAFF/MANAGER ที่ถูกจำกัดสาขา เห็นสมาชิกที่ **สาขาหลัก** อยู่ในสิทธิ์ตน
 * หรือสมาชิกที่ **เคยมาใช้บริการที่สาขาตน** (MemberActivity.unitId) — นอกนั้น = ไม่พบ (ไม่ใช่ 403)
 */
async function assertVisible(ctx: MemberCtx, actor: MemberActor, customer: CustomerRow, tx?: Tx): Promise<void> {
  if (actor.role === "CUSTOMER") {
    if (actor.customerId !== customer.id) throw new MemberNotFoundError(NOT_FOUND_MSG);
    return;
  }
  if (!isUnitScoped(actor)) return;
  if (coversUnit(actor, customer.homeUnitId)) return;
  const seen = await db(tx).memberActivity.count({
    where: { tenantId: ctx.tenantId, customerId: customer.id, unitId: { in: actor.unitAccess } },
  });
  if (seen === 0) throw new MemberNotFoundError(NOT_FOUND_MSG);
}

/** ตั้งสาขาหลักได้เฉพาะสาขาที่ actor ดูแล (ไม่งั้นพนักงานสาขาหนึ่งย้ายสมาชิกไปอีกสาขาแล้วมองไม่เห็นต่อ) */
function assertUnitAllowed(actor: MemberActor, unitId: string | null | undefined): void {
  if (!unitId) return;
  if (!coversUnit(actor, unitId)) {
    throw new MemberForbiddenError("ตั้งสาขาหลักเป็นสาขาที่คุณไม่ได้ดูแลไม่ได้ — เลือกสาขาที่คุณมีสิทธิ์");
  }
}

// ───────────────────────── ระดับ · แต้ม · การ์ดย่อ ─────────────────────────

async function defaultTier(ctx: MemberCtx, tx?: Tx) {
  return db(tx).memberTierDef.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, isDefault: true, archivedAt: null },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * ระบบแต้มของร้านที่ผูก "สาขาเดียวกับระบบสมาชิกนี้" (§5.5) — ไม่มี = ร้านยังไม่เปิดใช้แต้ม
 * resolve ผ่าน facade ของโมดูลระบบ (เส้น member→system มีอยู่แล้วตั้งแต่ WO-Wave4-D)
 */
async function pointSystemOf(ctx: MemberCtx): Promise<string | null> {
  const units = await unitsForSystem(ctx.tenantId, ctx.systemId);
  for (const unitId of units) {
    const id = await systemForUnit(ctx.tenantId, unitId, "POINT");
    if (id) return id;
  }
  return null;
}

/** แต้มคงเหลือของหลายคนพร้อมกัน (§5.5 facade) — M1.5 (`list.ts`) เรียกต่อเพื่อคอลัมน์ "แต้ม" ของตาราง/CSV */
export async function pointsOfMany(ctx: MemberCtx, customerIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of customerIds) out[id] = 0;
  if (customerIds.length === 0) return out;
  const systemId = await pointSystemOf(ctx);
  if (!systemId) return out;
  const rows = await prisma.pointBalance.findMany({
    where: { systemId, customerId: { in: customerIds } },
    select: { customerId: true, balance: true },
  });
  for (const r of rows) out[r.customerId] = (out[r.customerId] ?? 0) + r.balance;
  return out;
}

async function briefsOf(ctx: MemberCtx, rows: CustomerRow[]): Promise<MemberBrief[]> {
  if (rows.length === 0) return [];
  const tierIds = [...new Set(rows.map((r) => r.tierDefId).filter((x): x is string => !!x))];
  const tiers = tierIds.length
    ? await prisma.memberTierDef.findMany({ where: { tenantId: ctx.tenantId, id: { in: tierIds } } })
    : [];
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const points = await pointsOfMany(ctx, rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    memberCode: r.memberCode ?? "",
    name: r.name ?? ([r.firstName, r.lastName].filter(Boolean).join(" ") || r.memberCode || ""),
    tier: tierBriefOf(tierById.get(r.tierDefId ?? "") ?? null),
    points: points[r.id] ?? 0,
    phoneMasked: maskPhone(r.phone),
    status: r.status,
  }));
}

async function briefOf(ctx: MemberCtx, row: CustomerRow): Promise<MemberBrief> {
  const [brief] = await briefsOf(ctx, [row]);
  return brief as MemberBrief;
}

// ───────────────────────── กิจกรรม · audit · event ─────────────────────────

async function writeActivity(
  ctx: MemberCtx,
  tx: Tx,
  input: { customerId: string; type: string; summary: string; unitId?: string | null; data?: Prisma.InputJsonValue },
): Promise<string> {
  const row = await tx.memberActivity.create({
    data: {
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      unitId: input.unitId ?? null,
      module: "member",
      type: input.type,
      summary: input.summary,
      data: input.data,
      actorUserId: ctx.actorUserId,
    },
  });
  return row.id;
}

// ───────────────────────── สมัครสมาชิก (createMember) ─────────────────────────

const createSchema = z.object({
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  firstName: z.string().trim().max(120).optional().nullable(),
  lastName: z.string().trim().max(120).optional().nullable(),
  name: z.string().trim().max(240).optional().nullable(),
  nickname: z.string().trim().max(120).optional().nullable(),
  birthDate: z.string().trim().optional().nullable(),
  gender: z.string().trim().optional().nullable(),
  source: z.string().trim().min(1),
  sourceChannel: z.string().trim().optional().nullable(),
  referralCode: z.string().trim().optional().nullable(),
  homeUnitId: z.string().trim().optional().nullable(),
  idempotencyKey: z.string().trim().max(120).optional().nullable(),
});

function normalizeSource(raw: string): MemberSource {
  const value = raw.trim().toUpperCase();
  if (!SOURCES.includes(value)) {
    throw new MemberInputError(`ช่องทางที่มา "${raw}" ไม่อยู่ในรายการของระบบ — เลือกจากช่องทางที่มีในหน้าสมัคร`);
  }
  return value as MemberSource;
}

function normalizeConsents(input: CreateMemberInput["consents"]): { channel: string; granted: boolean; source: string }[] {
  const out: { channel: string; granted: boolean; source: string }[] = [];
  for (const c of input ?? []) {
    const channel = String(c?.channel ?? "").trim().toUpperCase();
    const def = getChannel(channel);
    if (!def) {
      throw new MemberInputError(`ช่องทาง "${c?.channel}" ยังไม่มีในทะเบียนช่องทางของระบบ — เลือกจากรายการที่มี`);
    }
    if (!def.canConsent) {
      throw new MemberInputError(`ช่องทาง "${def.label}" ยังขอความยินยอมรับข่าวสารไม่ได้ — เลือกช่องทางอื่น`);
    }
    const source = String(c?.source ?? "SIGNUP_FORM").trim().toUpperCase();
    if (!CONSENT_SOURCES.includes(source)) {
      throw new MemberInputError(`ที่มาของความยินยอม "${c?.source}" ไม่อยู่ในรายการของระบบ`);
    }
    if (!out.some((x) => x.channel === channel)) out.push({ channel, granted: !!c?.granted, source });
  }
  return out;
}

/** โค้ดแนะนำเพื่อน 8 ตัว unique ต่อร้าน (partial unique index จาก M1.1) */
async function uniqueReferralCode(tx: Tx, tenantId: string): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = randomCode(8, REFERRAL_ALPHABET);
    const exists = await tx.customer.findFirst({ where: { tenantId, referralCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  return randomCode(8, REFERRAL_ALPHABET) + randomCode(4, REFERRAL_ALPHABET);
}

/** สมาชิกที่ "เป็นคนเดียวกันแน่ ๆ" ตามเบอร์/อีเมล (ไม่รวมคนที่ถูกรวมไปแล้ว) */
async function findExisting(ctx: MemberCtx, keys: { phone?: string | null; email?: string | null }, tx?: Tx): Promise<CustomerRow | null> {
  const client = db(tx);
  const base = { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, status: { not: "MERGED" as MemberStatus } };
  if (keys.phone) {
    const byPhone = await client.customer.findFirst({ where: { ...base, phone: keys.phone } });
    if (byPhone) return byPhone;
  }
  if (keys.email) {
    const byEmail = await client.customer.findFirst({ where: { ...base, email: keys.email } });
    if (byEmail) return byEmail;
  }
  return null;
}

/**
 * สมัครสมาชิกใหม่ (§5.2)
 *
 * ลำดับตายตัว: idempotencyKey → ซ้ำเบอร์/อีเมล → ผู้แนะนำ → สร้างทุกอย่างใน transaction เดียว
 * ซ้ำ = **ไม่สร้างแถวใหม่** และคืน `{ created: false, duplicate }` ให้หน้าจอถามคนใช้ว่า "ใช่คนนี้ไหม"
 * (การสร้างคนซ้ำเงียบ ๆ คือหนี้ที่ตามเก็บยากที่สุดของระบบสมาชิก)
 */
export async function createMember(ctx: MemberCtx, actor: MemberActor, input: CreateMemberInput): Promise<CreateMemberResult> {
  requirePerm(actor, "member.customer.create", "เพิ่มสมาชิกใหม่");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw new MemberInputError("ข้อมูลที่ส่งมายังไม่ครบตามแบบฟอร์มสมัครสมาชิก — ตรวจอีกครั้งแล้วลองใหม่");

  const phone = normPhone(input.phone);
  const email = normEmail(input.email);
  if (!phone && !email) {
    throw new MemberInputError("ต้องมีเบอร์โทรหรืออีเมลอย่างน้อย 1 อย่าง เพื่อใช้ยืนยันตัวสมาชิกครั้งต่อไป");
  }
  if (phone) {
    const norm = party.normalizePartyPhone(phone);
    if (norm.length < 9) throw new MemberInputError(`เบอร์โทร "${phone}" ยังไม่ครบจำนวนหลัก — กรอกเบอร์ 10 หลัก เช่น 0812345678`);
  }
  const birthDate = trimOrNull(input.birthDate);
  if (birthDate && !ymdRe.test(birthDate)) {
    throw new MemberInputError("วันเกิดต้องเป็นรูปแบบ ปี-เดือน-วัน เช่น 1992-05-20");
  }
  const gender = trimOrNull(input.gender)?.toUpperCase() ?? null;
  if (gender && !GENDERS.includes(gender)) throw new MemberInputError(`เพศ "${input.gender}" ไม่อยู่ในตัวเลือกของระบบ`);
  const sourceChannel = trimOrNull(input.sourceChannel)?.toUpperCase() ?? null;
  if (sourceChannel && !isChannelKey(sourceChannel)) {
    throw new MemberInputError(`ช่องทาง "${input.sourceChannel}" ยังไม่มีในทะเบียนช่องทางของระบบ`);
  }
  const tags = (input.tags ?? []).map((t) => String(t).trim()).filter(Boolean);
  const consents = normalizeConsents(input.consents);
  let source = normalizeSource(input.source);
  const homeUnitId = trimOrNull(input.homeUnitId);
  assertUnitAllowed(actor, homeUnitId);

  const idempotencyKey = trimOrNull(input.idempotencyKey);
  if (idempotencyKey) {
    const already = await prisma.customer.findFirst({
      where: {
        tenantId: ctx.tenantId,
        memberSystemId: ctx.systemId,
        sourceDetail: { path: ["idempotencyKey"], equals: idempotencyKey },
      },
    });
    if (already) {
      return {
        created: false,
        customerId: already.id,
        memberCode: already.memberCode ?? "",
        partyId: already.partyId,
        duplicate: await briefOf(ctx, already),
      };
    }
  }

  const existing = await findExisting(ctx, { phone, email });
  if (existing) {
    return {
      created: false,
      customerId: existing.id,
      memberCode: existing.memberCode ?? "",
      partyId: existing.partyId,
      duplicate: await briefOf(ctx, existing),
    };
  }

  // ผู้แนะนำ (D6) — โค้ดไม่มีจริง = หยุดตั้งแต่ยังไม่สร้างอะไร (สมัครไปแล้วค่อยรู้ว่าโค้ดผิด = แก้ยาก)
  let referrer: CustomerRow | null = null;
  const referralCode = trimOrNull(input.referralCode)?.toUpperCase() ?? null;
  if (referralCode) {
    referrer = await prisma.customer.findFirst({
      where: { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, referralCode },
    });
    if (!referrer) {
      throw new MemberInputError(`ไม่พบรหัสแนะนำเพื่อน "${referralCode}" ในร้านนี้ — ตรวจตัวอักษรอีกครั้ง`);
    }
    source = "REFERRAL";
  }

  const firstName = trimOrNull(input.firstName);
  const lastName = trimOrNull(input.lastName);
  const name = trimOrNull(input.name) ?? ([firstName, lastName].filter(Boolean).join(" ") || phone || email || "");
  const tier = await defaultTier(ctx);
  const now = new Date();

  const result = await prisma.$transaction(
    async (tx) => {
      const memberCode = await uniqueMemberCode(tx, ctx.systemId);
      const ownReferral = await uniqueReferralCode(tx, ctx.tenantId);
      // ตัวตนกลาง (D12) — ล้มเหลวไม่ทำให้สมัครไม่ได้ (safeFindOrCreate คืน null)
      const partyId = name
        ? await party.safeFindOrCreate(ctx.tenantId, { name, phone, email, kind: "PERSON" }, tx)
        : null;

      const sourceDetail: Record<string, unknown> = { ...(input.sourceDetail ?? {}) };
      if (ctx.actorUserId && actor.role !== "CUSTOMER") sourceDetail.staffUserId = ctx.actorUserId;
      if (referrer) sourceDetail.referrerCustomerId = referrer.id;
      if (idempotencyKey) sourceDetail.idempotencyKey = idempotencyKey;

      const marketingConsent = consents.some((c) => c.granted && LEGACY_CONSENT_CHANNELS.includes(c.channel));

      const customer = await tx.customer.create({
        data: {
          tenantId: ctx.tenantId,
          memberSystemId: ctx.systemId,
          memberCode,
          name: name || null,
          firstName,
          lastName,
          nickname: trimOrNull(input.nickname),
          birthDate: birthDate ? parseYmd(birthDate) : null,
          gender: gender ? (gender as "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED") : null,
          phone,
          email,
          status: "ACTIVE",
          homeUnitId,
          source,
          sourceDetail: sourceDetail as Prisma.InputJsonValue,
          sourceChannel,
          tags: tags as Prisma.InputJsonValue,
          referralCode: ownReferral,
          referredById: referrer?.id ?? null,
          marketingConsent,
          consentAt: marketingConsent ? now : null,
          partyId,
          tierDefId: tier?.id ?? null,
          tierSince: tier ? now : null,
          tier: tier?.legacyTier ?? "MEMBER",
        },
      });

      if (tier) {
        await tx.memberTierHistory.create({
          data: {
            tenantId: ctx.tenantId,
            customerId: customer.id,
            fromTierDefId: null,
            toTierDefId: tier.id,
            reason: "INITIAL",
            evidence: { source, at: now.toISOString() } as Prisma.InputJsonValue,
            byUserId: ctx.actorUserId,
          },
        });
      }

      for (const c of consents) {
        await tx.memberConsent.create({
          data: {
            tenantId: ctx.tenantId,
            customerId: customer.id,
            channel: c.channel,
            granted: c.granted,
            source: c.source as "SIGNUP_FORM",
            grantedAt: c.granted ? now : null,
            revokedAt: c.granted ? null : now,
            byUserId: ctx.actorUserId,
          },
        });
      }

      // ที่มา (D10 · §7.2): สมัครใหม่ = first touch และ last touch เป็นเหตุการณ์เดียวกัน
      // linkId ยังว่างเสมอในใบนี้ — ตัวแปล `?src=` → AcquisitionLink เป็นงานของ M1.8
      for (const touch of ["FIRST", "LAST"]) {
        await tx.memberAttribution.create({
          data: {
            tenantId: ctx.tenantId,
            customerId: customer.id,
            touch,
            source,
            linkId: null,
            campaignId: typeof input.sourceDetail?.campaignId === "string" ? input.sourceDetail.campaignId : null,
            staffUserId: actor.role === "CUSTOMER" ? null : ctx.actorUserId,
            referrerCustomerId: referrer?.id ?? null,
            unitId: homeUnitId,
            occurredAt: now,
          },
        });
      }

      if (input.fields && Object.keys(input.fields).length > 0) {
        await fields.setFieldValues(
          ctx,
          customer.id,
          input.fields,
          { via: actor.role === "CUSTOMER" ? "CUSTOMER_SELF" : "STAFF", byUserId: ctx.actorUserId },
          tx,
        );
      }

      await writeActivity(ctx, tx, {
        customerId: customer.id,
        type: "CREATED",
        summary: `สมัครสมาชิก (${source})`,
        unitId: homeUnitId,
        data: { source, memberCode } as Prisma.InputJsonValue,
      });

      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        type: "member.created",
        idempotencyKey: `member.created#${customer.id}`,
        payload: { customerId: customer.id, partyId, source, referrerId: referrer?.id ?? null },
        systemId: ctx.systemId,
        unitId: homeUnitId,
      });

      return { customerId: customer.id, memberCode, partyId };
    },
    { timeout: 30_000, maxWait: 15_000 },
  );

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: "member.created",
    targetType: "Customer",
    targetId: result.customerId,
    after: { memberCode: result.memberCode, source, phone: maskPhone(phone) },
  });

  return { created: true, ...result };
}

// ───────────────────────── แก้ไขข้อมูล ─────────────────────────

async function afterMutation(
  ctx: MemberCtx,
  customerId: string,
  changedKeys: string[],
  audit: { action: string; after?: unknown },
): Promise<void> {
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: audit.action,
    targetType: "Customer",
    targetId: customerId,
    after: audit.after ?? { changedKeys },
  });
}

type PatchOutcome = { changedKeys: string[]; summary: string; type: string };

async function applyPatch(
  ctx: MemberCtx,
  actor: MemberActor,
  customer: CustomerRow,
  patch: UpdateMemberInput,
  tx: Tx,
): Promise<PatchOutcome> {
  const changedKeys: string[] = [];
  const data: Prisma.CustomerUpdateInput = {};
  const isCustomer = actor.role === "CUSTOMER";

  if (patch.fields && Object.keys(patch.fields).length > 0) {
    const res = await fields.setFieldValues(
      ctx,
      customer.id,
      patch.fields,
      { via: isCustomer ? "CUSTOMER_SELF" : "STAFF", byUserId: ctx.actorUserId },
      tx,
    );
    changedKeys.push(...res.changed);
  }

  if (patch.tags !== undefined) {
    const tags = (patch.tags ?? []).map((t) => String(t).trim()).filter(Boolean);
    data.tags = tags as Prisma.InputJsonValue;
    changedKeys.push("tags");
  }

  if (patch.status !== undefined) {
    data.status = normalizeStatus(patch.status);
    changedKeys.push("status");
  }

  if (patch.ownerUserId !== undefined) {
    const ownerUserId = trimOrNull(patch.ownerUserId);
    if (ownerUserId) await assertUserOfTenant(ctx, ownerUserId, tx);
    data.ownerUserId = ownerUserId;
    changedKeys.push("ownerUserId");
  }

  if (patch.homeUnitId !== undefined) {
    const homeUnitId = trimOrNull(patch.homeUnitId);
    assertUnitAllowed(actor, homeUnitId);
    data.homeUnitId = homeUnitId;
    changedKeys.push("homeUnitId");
  }

  if (Object.keys(data).length > 0) {
    await tx.customer.update({ where: { id: customer.id }, data });
  }
  return { changedKeys, summary: `แก้ไขข้อมูลสมาชิก (${changedKeys.join(", ") || "ไม่มีการเปลี่ยนแปลง"})`, type: "UPDATED" };
}

function normalizeStatus(raw: string): MemberStatus {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!STATUSES.includes(value)) throw new MemberInputError(`สถานะ "${raw}" ไม่อยู่ในรายการของระบบ`);
  if (value === "MERGED") {
    throw new MemberInputError('สถานะ "ถูกรวมแล้ว" ตั้งเองไม่ได้ — เกิดขึ้นเองเมื่อรวมสมาชิกซ้ำเข้าด้วยกันเท่านั้น');
  }
  return value as MemberStatus;
}

/** ผู้ดูแลต้องเป็น "ผู้ใช้ที่มี Membership ในร้านนี้" (ไม่ใช่ id ของพนักงาน HR หรือผู้ใช้ร้านอื่น) */
async function assertUserOfTenant(ctx: MemberCtx, userId: string, tx?: Tx): Promise<void> {
  const n = await db(tx).membership.count({ where: { tenantId: ctx.tenantId, userId } });
  if (n === 0) {
    throw new MemberInputError("ไม่พบผู้ใช้คนนี้ในร้าน — เลือกผู้ดูแลจากรายชื่อพนักงานที่มีบัญชีเข้าระบบ");
  }
}

async function mutate(
  ctx: MemberCtx,
  actor: MemberActor,
  id: string,
  patch: UpdateMemberInput,
  opts: { action: string; type?: string; summary?: string },
): Promise<MemberBrief> {
  const isCustomer = actor.role === "CUSTOMER";
  if (isCustomer) {
    if (patch.tags !== undefined || patch.status !== undefined || patch.ownerUserId !== undefined || patch.homeUnitId !== undefined) {
      throw new MemberForbiddenError("แก้ได้เฉพาะข้อมูลส่วนตัวที่ร้านเปิดให้กรอกเองเท่านั้น");
    }
  } else {
    requirePerm(actor, "member.customer.update", "แก้ไขข้อมูลสมาชิก");
  }
  const customer = await loadCustomer(ctx, id);
  await assertVisible(ctx, actor, customer);

  const outcome = await prisma.$transaction(
    async (tx) => {
      const res = await applyPatch(ctx, actor, customer, patch, tx);
      const activityId = await writeActivity(ctx, tx, {
        customerId: customer.id,
        type: opts.type ?? res.type,
        summary: opts.summary ?? res.summary,
        unitId: customer.homeUnitId,
        data: { changedKeys: res.changedKeys } as Prisma.InputJsonValue,
      });
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        type: "member.updated",
        idempotencyKey: `member.updated#${activityId}`,
        payload: { customerId: customer.id, changedKeys: res.changedKeys },
        systemId: ctx.systemId,
        unitId: customer.homeUnitId,
      });
      return res;
    },
    { timeout: 30_000, maxWait: 15_000 },
  );

  await afterMutation(ctx, customer.id, outcome.changedKeys, { action: opts.action });
  return briefOf(ctx, await loadCustomer(ctx, id));
}

/** แก้ไขข้อมูลสมาชิก (ฟิลด์ระบบ/ฟิลด์กำหนดเอง + แท็ก/สถานะ/ผู้ดูแล/สาขาหลัก) */
export async function updateMember(
  ctx: MemberCtx,
  actor: MemberActor,
  id: string,
  patch: UpdateMemberInput,
): Promise<MemberBrief> {
  return mutate(ctx, actor, id, patch, { action: "member.updated" });
}

/** เปลี่ยนสถานะสมาชิก (ระงับ/ปิด/กลับมาใช้งาน) — เหตุผลจะถูกบันทึกลงไทม์ไลน์ */
export async function setStatus(
  ctx: MemberCtx,
  actor: MemberActor,
  id: string,
  status: string,
  reason?: string,
): Promise<MemberBrief> {
  const value = normalizeStatus(status);
  const label: Record<string, string> = { ACTIVE: "เปิดใช้งาน", SUSPENDED: "ระงับชั่วคราว", CLOSED: "ปิดบัญชีสมาชิก" };
  return mutate(ctx, actor, id, { status: value }, {
    action: "member.status.changed",
    type: "STATUS_CHANGED",
    summary: `${label[value] ?? value}${reason ? ` — ${reason}` : ""}`,
  });
}

/** ตั้ง/ถอดผู้ดูแลสมาชิก (ต้องเป็นผู้ใช้ที่มีบัญชีในร้าน) */
export async function setOwner(ctx: MemberCtx, actor: MemberActor, id: string, userId: string | null): Promise<MemberBrief> {
  return mutate(ctx, actor, id, { ownerUserId: userId }, {
    action: "member.owner.changed",
    type: "OWNER_CHANGED",
    summary: userId ? "เปลี่ยนผู้ดูแลสมาชิก" : "ถอดผู้ดูแลสมาชิก",
  });
}

/** เพิ่ม/เอาแท็กออก (คงลำดับเดิม แล้วต่อท้ายด้วยแท็กใหม่) */
export async function setTags(
  ctx: MemberCtx,
  actor: MemberActor,
  id: string,
  input: { add?: string[]; remove?: string[] },
): Promise<MemberBrief> {
  const customer = await loadCustomer(ctx, id);
  await assertVisible(ctx, actor, customer);
  const remove = new Set((input.remove ?? []).map((t) => String(t).trim()));
  const current = tagsOf(customer).filter((t) => !remove.has(t));
  for (const raw of input.add ?? []) {
    const t = String(raw).trim();
    if (t && !current.includes(t)) current.push(t);
  }
  return mutate(ctx, actor, id, { tags: current }, {
    action: "member.tags.changed",
    type: "TAGS_CHANGED",
    summary: `แก้ไขแท็ก (${current.join(", ") || "ไม่มีแท็ก"})`,
  });
}

// ───────────────────────── หน้า 360 ─────────────────────────

/**
 * นับ "การเชื่อมต่อ" ของสมาชิกกับโมดูลอื่น (การ์ดขวาของหน้า 360)
 *
 * 🔴 อ่านอย่างเดียวด้วย prisma ตรง ไม่ผ่าน facade ของโมดูลปลายทางโดยตั้งใจ: เป็นการ **นับแถว**
 *    ที่ผูกกับตัวตนกลางเดียวกัน (partyId) ไม่มีตรรกะธุรกิจของโมดูลนั้นเข้ามาเกี่ยว — ถ้าเรียกผ่าน
 *    facade จะกลายเป็นเส้น import ข้ามโมดูลถาวร member→chat/crm/account/kanban เพื่อเลข 4 ตัว
 *    (วิธีเดียวกับที่ `fields.ts#lookupExists` และ `privacy.ts#hrOf` ใช้)
 * 🔴 ห้องแชทนับจาก partyId/customerId **หรือเบอร์ที่ตรงกัน** เพราะกล่องแชทเก็บเบอร์ของลูกค้าไว้
 *    ตั้งแต่ก่อนจะมีตัวตนกลาง (ยังไม่ได้เรียก linkIdentity) — ไม่นับเบอร์ = การ์ดโชว์ 0 ทั้งที่มีห้องอยู่
 */
async function connectionsOf(ctx: MemberCtx, customer: CustomerRow): Promise<Member360["connections"]> {
  const partyId = customer.partyId;
  const phones = phoneVariants(customer.phone);
  const chatOr: Prisma.ChatContactWhereInput[] = [{ customerId: customer.id }];
  if (partyId) chatOr.push({ partyId });
  if (phones.length) chatOr.push({ phone: { in: phones } });

  const [chat, crm, account, kanbanCards] = await Promise.all([
    prisma.chatContact.count({ where: { tenantId: ctx.tenantId, OR: chatOr } }),
    prisma.crmContact.count({
      where: {
        tenantId: ctx.tenantId,
        OR: partyId ? [{ memberCustomerId: customer.id }, { partyId }] : [{ memberCustomerId: customer.id }],
      },
    }),
    partyId ? prisma.accountContact.count({ where: { tenantId: ctx.tenantId, partyId } }) : Promise.resolve(0),
    partyId
      ? prisma.kanbanCardLink.count({ where: { tenantId: ctx.tenantId, linkType: "PARTY", linkId: partyId, removedAt: null } })
      : Promise.resolve(0),
  ]);
  return { chat, crm, account, kanbanCards };
}

/**
 * โปรไฟล์ 360° ของสมาชิก 1 คน (§5.2 · §6.3)
 * ส่วน/ฟิลด์อ่อนไหวที่ actor ดูไม่ได้ → `visible: false` + `fields: []` (ค่าไม่ถูกใส่ลง DTO เลย)
 * ส่วนที่ดูได้และนโยบายสั่งให้บันทึก → เขียน `MemberAccessLog` + ยิง `member.sensitive.viewed`
 */
export async function getMember360(ctx: MemberCtx, actor: MemberActor, id: string): Promise<Member360> {
  const customer = await loadCustomer(ctx, id);
  await assertVisible(ctx, actor, customer);

  const [layout, values, tier, identities, consents, attributions, connections, points, owner, homeUnitRow] = await Promise.all([
    fields.listLayout(ctx),
    fields.getFieldValues(ctx, [customer.id]),
    customer.tierDefId ? prisma.memberTierDef.findFirst({ where: { tenantId: ctx.tenantId, id: customer.tierDefId } }) : Promise.resolve(null),
    prisma.memberChannelIdentity.findMany({ where: { tenantId: ctx.tenantId, customerId: customer.id }, orderBy: { linkedAt: "asc" } }),
    prisma.memberConsent.findMany({ where: { tenantId: ctx.tenantId, customerId: customer.id }, orderBy: { channel: "asc" } }),
    prisma.memberAttribution.findMany({ where: { tenantId: ctx.tenantId, customerId: customer.id } }),
    connectionsOf(ctx, customer),
    pointsOfMany(ctx, [customer.id]),
    customer.ownerUserId
      ? prisma.user.findUnique({ where: { id: customer.ownerUserId }, select: { name: true, email: true } })
      : Promise.resolve(null),
    // M1.5 — สาขาหลักแบบวัตถุ {id,name} ให้หน้า 360 (แถบขวา/หัวโปรไฟล์) ไม่ต้อง join เอง
    customer.homeUnitId
      ? prisma.businessUnit.findUnique({ where: { id: customer.homeUnitId }, select: { id: true, name: true } })
      : Promise.resolve(null),
  ]);

  // ระดับถัดไปบนบันได (ปิดหนี้ M1.4) — อ่านอย่างเดียว (`noCache`) เพื่อไม่ให้การ "เปิดดูโปรไฟล์"
  // ไปเขียนแคชยอด 12 เดือนของสมาชิก · เอนจินระดับล้ม = หน้า 360 ต้องยังเปิดได้ (แค่ไม่มีระดับถัดไป)
  let nextTier: MemberTierBrief | null = null;
  let progressToNext: tiers.TierProgress | null = null;
  try {
    const ev = await tiers.evaluateMember(ctx, customer.id, { noCache: true });
    const row = ev.next ? await prisma.memberTierDef.findFirst({ where: { id: ev.next.id, tenantId: ctx.tenantId } }) : null;
    nextTier = tierBriefOf(row);
    progressToNext = ev.progressToNext;
  } catch {
    nextTier = null; // เอนจินระดับล้ม = หน้าโปรไฟล์ยังต้องเปิดได้ (แค่ไม่บอกว่าระดับถัดไปคืออะไร)
    progressToNext = null;
  }

  const bag = values[customer.id] ?? {};
  // ตีกลับรอบ 2 ข้อ 2 — resolve ชื่อของทุกฟิลด์ LOOKUP ในเลย์เอาต์นี้ครั้งเดียว (ไม่ query ต่อฟิลด์ตอนวนลูป)
  const lookupNames = await resolveLookupNames(
    ctx,
    layout.sections
      .flatMap((s) => s.fields)
      .filter((f) => f.type === "LOOKUP")
      .map((f) => ({ target: f.options.target, id: typeof bag[f.key] === "string" ? (bag[f.key] as string) : "" })),
  );
  const sections: Member360Section[] = [];
  for (const s of layout.sections) {
    const base = {
      id: s.id,
      key: s.key,
      label: s.label,
      sensitive: s.sensitive,
      isSystem: s.isSystem,
      sortOrder: s.sortOrder,
      columns: s.columns,
    };
    if (s.sensitive) {
      const decision = await evaluateSensitiveAccess(ctx, actor, { targetType: "SECTION", targetId: s.id, customerId: customer.id });
      if (!decision.allowed) {
        sections.push({ ...base, visible: false, fields: [] });
        continue;
      }
      if (decision.shouldLog) {
        await logAccess(ctx, actor, {
          customerId: customer.id,
          targetType: "SECTION",
          targetId: s.id,
          page: "member.360",
          decision,
        });
      }
    }
    const list: Member360Field[] = [];
    for (const f of s.fields) {
      // ฟิลด์อ่อนไหวเดี่ยว ๆ ในส่วนที่ไม่อ่อนไหว — ตัดสินทีละฟิลด์ (D8 ตั้งได้ทั้งระดับส่วนและฟิลด์)
      if (f.sensitive && !s.sensitive) {
        const ok = await evaluateSensitiveAccess(ctx, actor, { targetType: "FIELD", targetId: f.id, customerId: customer.id });
        if (!ok.allowed) continue;
        if (ok.shouldLog) {
          await logAccess(ctx, actor, {
            customerId: customer.id,
            targetType: "FIELD",
            targetId: f.id,
            page: "member.360",
            decision: ok,
          });
        }
      }
      const value = bag[f.key] ?? null;
      list.push({ key: f.key, label: f.label, type: f.type, value, display: displayOf(f, value, lookupNames) });
    }
    sections.push({ ...base, visible: true, fields: list });
  }

  const attributionOf = (touch: string): MemberAttributionDto | null => {
    const row = attributions.find((a) => a.touch === touch);
    return row
      ? {
          touch: row.touch,
          source: row.source,
          linkId: row.linkId,
          campaignId: row.campaignId,
          staffUserId: row.staffUserId,
          referrerCustomerId: row.referrerCustomerId,
          unitId: row.unitId,
          occurredAt: row.occurredAt,
        }
      : null;
  };

  return {
    profile: {
      id: customer.id,
      memberCode: customer.memberCode ?? "",
      name: customer.name ?? [customer.firstName, customer.lastName].filter(Boolean).join(" "),
      firstName: customer.firstName,
      lastName: customer.lastName,
      nickname: customer.nickname,
      phone: customer.phone,
      phoneMasked: maskPhone(customer.phone),
      email: customer.email,
      birthDate: customer.birthDate,
      gender: customer.gender,
      status: customer.status,
      tags: tagsOf(customer),
      ownerUserId: customer.ownerUserId,
      ownerName: owner?.name ?? owner?.email ?? null,
      owner: owner ? { name: owner.name ?? owner.email ?? "" } : null,
      homeUnitId: customer.homeUnitId,
      homeUnit: homeUnitRow ? { id: homeUnitRow.id, name: homeUnitRow.name } : null,
      partyId: customer.partyId,
      source: customer.source,
      referralCode: customer.referralCode,
      referredById: customer.referredById,
      createdAt: customer.createdAt,
      tier: tierBriefOf(tier),
    },
    sections,
    stats: {
      spent12mSatang: Number(customer.spent12mSatang),
      visits12m: customer.visits12m,
      points: points[customer.id] ?? 0,
      totalSpentSatang: customer.totalSpentSatang,
      visitCount: customer.visitCount,
      lastActivityAt: customer.lastActivityAt,
      vouchers: 0,
      reviewAvg: customer.reviewAvg !== null ? Number(customer.reviewAvg) : null,
    },
    // M1.9 — `next` = ระดับถัดไปตามบันไดของร้าน (เอนจินระดับเป็นคนตอบ · ไม่เขียนอะไรลง DB ที่นี่)
    tier: { current: tierBriefOf(tier), next: nextTier, progressToNext },
    identities: identities.map((i) => ({
      id: i.id,
      channel: i.channel,
      channelLabel: getChannel(i.channel)?.label ?? i.channel,
      externalId: i.externalId,
      displayName: i.displayName,
      verified: i.verified,
      linkedBy: i.linkedBy,
      linkedAt: i.linkedAt,
      lastSeenAt: i.lastSeenAt,
    })),
    consents: consents.map((c) => ({
      channel: c.channel,
      channelLabel: getChannel(c.channel)?.label ?? c.channel,
      granted: c.granted,
      source: c.source,
      policyVersion: c.policyVersion,
      grantedAt: c.grantedAt,
      revokedAt: c.revokedAt,
    })),
    attribution: { first: attributionOf("FIRST"), last: attributionOf("LAST") },
    connections,
    mergedIntoId: customer.mergedIntoId,
  };
}

/** การ์ดย่อของสมาชิกหลายคน (กรองตามขอบเขตสาขาของ actor) — facade ให้แผงข้างของโมดูลอื่น */
export async function briefFor(ctx: MemberCtx, actor: MemberActor, customerIds: string[]): Promise<MemberBrief[]> {
  const ids = [...new Set((customerIds ?? []).filter((x) => typeof x === "string" && x))];
  if (ids.length === 0) return [];
  const rows = await prisma.customer.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
  });
  const visible: CustomerRow[] = [];
  for (const row of rows) {
    try {
      await assertVisible(ctx, actor, row);
      visible.push(row);
    } catch {
      // มองไม่เห็น = ไม่อยู่ในผลลัพธ์ (เงียบ — ไม่บอกว่ามีคนนี้อยู่จริง §6.4)
    }
  }
  return briefsOf(ctx, visible);
}

// ───────────────────────── ตัวตนหลายช่องทาง (D18) ─────────────────────────

function assertChannel(channel: string): string {
  const key = String(channel ?? "").trim().toUpperCase();
  if (!isChannelKey(key)) {
    throw new MemberInputError(`ช่องทาง "${channel}" ยังไม่มีในทะเบียนช่องทางของระบบ — เพิ่มที่ทะเบียนกลางก่อนจึงผูกได้`);
  }
  return key;
}

/** สมาชิกที่ชื่อคล้ายกับชื่อที่แสดงในช่องทางนั้น (ไว้ให้คนเลือกเองเมื่อระบบไม่กล้าเดา) */
async function nameCandidates(ctx: MemberCtx, displayName: string | null | undefined): Promise<MemberBrief[]> {
  const q = (displayName ?? "").trim();
  if (q.length < 2) return [];
  const rows = await prisma.customer.findMany({
    where: {
      tenantId: ctx.tenantId,
      memberSystemId: ctx.systemId,
      status: { not: "MERGED" },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { nickname: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  return briefsOf(ctx, rows);
}

/**
 * ผูก "id ของช่องทางภายนอก" เข้ากับสมาชิก (D18 · §11.1)
 *
 * กติกาจับคู่ **ตายตัว** (ห้ามสลับลำดับ): เบอร์ → อีเมล → id ช่องทางที่เคยผูก → ไม่ตรง = คืนรายชื่อให้เลือกเอง
 * ชนกัน (id นี้เป็นของคนหนึ่ง แต่เบอร์/อีเมลชี้อีกคน) → CONFLICT + บันทึกคู่ "อาจเป็นคนเดียวกัน"
 * ไม่มี actor เพราะเป็นทางเข้าของระบบ (แชท/อีคอมเมิร์ซ/LIFF) — ด่านสิทธิ์อยู่ที่ผู้เรียก
 */
export async function linkIdentity(ctx: MemberCtx, input: LinkIdentityInput): Promise<LinkIdentityResult> {
  const channel = assertChannel(input.channel);
  const externalId = String(input.externalId ?? "").trim();
  if (!externalId) throw new MemberInputError("ไม่มีรหัสผู้ใช้ของช่องทางนี้ส่งมา จึงผูกกับสมาชิกไม่ได้");
  const phone = normPhone(input.phone);
  const email = normEmail(input.email);
  const displayName = trimOrNull(input.displayName);

  const existing = await prisma.memberChannelIdentity.findFirst({
    where: { tenantId: ctx.tenantId, channel, externalId },
  });

  const byPhone = phone ? await findExisting(ctx, { phone }) : null;
  const byEmail = !byPhone && email ? await findExisting(ctx, { email }) : null;
  const matched = byPhone ?? byEmail;
  const matchedBy: LinkIdentityResult["matchedBy"] = byPhone ? "PHONE" : byEmail ? "EMAIL" : existing ? "CHANNEL_ID" : null;

  // ชนกัน: id ช่องทางนี้เป็นของอีกคน — ระบบไม่เดา ให้คนตัดสิน (พร้อมคู่ "อาจเป็นคนเดียวกัน")
  if (existing && matched && matched.id !== existing.customerId) {
    const other = await prisma.customer.findFirst({ where: { id: existing.customerId, tenantId: ctx.tenantId } });
    if (other?.partyId && matched.partyId) {
      await party.recordMergeCandidatePair(ctx.tenantId, other.partyId, matched.partyId, byPhone ? "PHONE" : "NAME_SIMILAR");
    }
    throw new MemberConflictError(
      `รหัส ${getChannel(channel)?.label ?? channel} นี้ผูกกับสมาชิกคนหนึ่งอยู่แล้ว แต่${byPhone ? "เบอร์" : "อีเมล"}ที่ส่งมาตรงกับสมาชิกอีกคน — ` +
        "ตรวจก่อนว่าเป็นคนเดียวกันหรือไม่ แล้วค่อยรวมคนซ้ำ",
    );
  }

  const customerId = matched?.id ?? existing?.customerId ?? null;
  if (!customerId) {
    return { customerId: null, matchedBy: null, candidates: await nameCandidates(ctx, displayName) };
  }

  const now = new Date();
  const identityId = await prisma.$transaction(async (tx) => {
    let rowId: string;
    if (existing) {
      const updated = await tx.memberChannelIdentity.update({
        where: { id: existing.id },
        data: {
          displayName: displayName ?? existing.displayName,
          contactId: trimOrNull(input.contactId) ?? existing.contactId,
          verified: input.verified ?? existing.verified,
          lastSeenAt: now,
        },
      });
      rowId = updated.id;
    } else {
      const created = await tx.memberChannelIdentity.create({
        data: {
          tenantId: ctx.tenantId,
          customerId,
          channel,
          externalId,
          displayName,
          contactId: trimOrNull(input.contactId),
          verified: input.verified ?? false,
          linkedBy: matchedBy ?? "MANUAL",
          linkedAt: now,
          lastSeenAt: now,
        },
      });
      rowId = created.id;
    }

    // ห้องแชทที่ส่ง contactId มาด้วย → เขียนกลับให้กล่องแชทรู้ว่าห้องนี้คือสมาชิกคนไหน (§9.3)
    const contactId = trimOrNull(input.contactId);
    if (contactId) {
      const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId }, select: { partyId: true } });
      await tx.chatContact.updateMany({
        where: { id: contactId, tenantId: ctx.tenantId },
        data: {
          customerId,
          partyId: customer?.partyId ?? null,
          linkedBy: matchedBy ?? "MANUAL",
          linkedAt: now,
        },
      });
    }

    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "member.identity.linked",
      idempotencyKey: `member.identity.linked#${rowId}#${now.getTime()}`,
      payload: { customerId, channel, externalId, method: matchedBy, identityId: rowId },
      systemId: ctx.systemId,
    });
    return rowId;
  });

  return { customerId, matchedBy, identityId, candidates: [] };
}

/** ช่องทางที่ผูกกับสมาชิกคนนี้ (การ์ด "ช่องทางที่ผูก" ของหน้า 360) */
export async function listIdentities(ctx: MemberCtx, customerId: string): Promise<MemberIdentityDto[]> {
  const rows = await prisma.memberChannelIdentity.findMany({
    where: { tenantId: ctx.tenantId, customerId },
    orderBy: { linkedAt: "asc" },
  });
  return rows.map((i) => ({
    id: i.id,
    channel: i.channel,
    channelLabel: getChannel(i.channel)?.label ?? i.channel,
    externalId: i.externalId,
    displayName: i.displayName,
    verified: i.verified,
    linkedBy: i.linkedBy,
    linkedAt: i.linkedAt,
    lastSeenAt: i.lastSeenAt,
  }));
}

/** ถอดการผูกช่องทาง — ผู้จัดการขึ้นไปเท่านั้น (§11.1: ถอดผิดคน = ประวัติแชทของลูกค้าหลุดไปคนอื่น) */
export async function unlinkIdentity(ctx: MemberCtx, actor: MemberActor, identityId: string): Promise<{ ok: true }> {
  if (actor.role !== "OWNER" && actor.role !== "MANAGER") {
    throw new MemberForbiddenError("ถอดการผูกช่องทางได้เฉพาะผู้จัดการขึ้นไป — แจ้งผู้จัดการสาขาให้ช่วยดำเนินการ");
  }
  const row = await prisma.memberChannelIdentity.findFirst({ where: { id: identityId, tenantId: ctx.tenantId } });
  if (!row) throw new MemberNotFoundError("ไม่พบการผูกช่องทางนี้ (อาจถูกถอดไปแล้ว)");
  await prisma.memberChannelIdentity.delete({ where: { id: row.id } });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: "member.identity.unlinked",
    targetType: "Customer",
    targetId: row.customerId,
    before: { channel: row.channel },
  });
  return { ok: true };
}

// ───────────────────────── คนซ้ำ / รวมคน ─────────────────────────

/** คู่สมาชิกที่ระบบสงสัยว่าเป็นคนเดียวกัน (สแกนผ่านตัวตนกลางแล้วแปลงกลับเป็นสมาชิกของระบบนี้) */
export async function findDuplicates(
  ctx: MemberCtx,
  actor: MemberActor,
  opts: { status?: string } = {},
): Promise<DuplicatePairDto[]> {
  requirePerm(actor, "member.customer.merge", "รวมสมาชิกที่ซ้ำกัน");
  const status = (opts.status ?? "OPEN").toUpperCase();
  await party.recordMergeCandidates(ctx.tenantId);
  const rows = await prisma.partyMergeCandidate.findMany({
    where: { tenantId: ctx.tenantId, status: status as "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  if (rows.length === 0) return [];

  const partyIds = [...new Set(rows.flatMap((r) => [r.partyAId, r.partyBId]))];
  const customers = await prisma.customer.findMany({
    where: { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, partyId: { in: partyIds } },
  });
  const byParty = new Map<string, CustomerRow>();
  for (const c of customers) if (c.partyId && !byParty.has(c.partyId)) byParty.set(c.partyId, c);

  const visible: CustomerRow[] = [];
  for (const c of customers) {
    try {
      await assertVisible(ctx, actor, c);
      visible.push(c);
    } catch {
      // นอกขอบเขตสาขา — ไม่โผล่ในรายการคนซ้ำ
    }
  }
  const visibleIds = new Set(visible.map((c) => c.id));
  const briefs = new Map((await briefsOf(ctx, visible)).map((b) => [b.id, b]));

  const out: DuplicatePairDto[] = [];
  for (const row of rows) {
    const a = byParty.get(row.partyAId);
    const b = byParty.get(row.partyBId);
    if (!a || !b || !visibleIds.has(a.id) || !visibleIds.has(b.id)) continue;
    if (a.status === "MERGED" || b.status === "MERGED") continue;
    out.push({
      id: row.id,
      a: briefs.get(a.id) as MemberBrief,
      b: briefs.get(b.id) as MemberBrief,
      reason: row.reason,
      score: Number(party.nameSimilarity(a.name ?? "", b.name ?? "").toFixed(3)),
    });
  }
  return out;
}

/** "ไม่ใช่คนเดียวกัน" — คู่นี้จะไม่ขึ้นในรายการอีก (ยังค้นย้อนหลังได้ด้วย status DISMISSED) */
export async function dismissDuplicate(ctx: MemberCtx, actor: MemberActor, pairId: string): Promise<{ ok: true }> {
  requirePerm(actor, "member.customer.merge", "จัดการรายการสมาชิกซ้ำ");
  const res = await prisma.partyMergeCandidate.updateMany({
    where: { id: pairId, tenantId: ctx.tenantId, status: "OPEN" },
    data: { status: "DISMISSED" },
  });
  if (res.count === 0) throw new MemberNotFoundError("ไม่พบคู่สมาชิกซ้ำรายการนี้ (อาจถูกจัดการไปแล้ว)");
  return { ok: true };
}

/**
 * hook ตอนรวมคน — โมดูลที่ถือ "ของมีมูลค่า" ของสมาชิก (voucher/สแตมป์/บัตรกำนัล ที่จะมาใน M2.x)
 * ลงทะเบียนย้ายของตัวเองที่นี่ แล้วโค้ดรวมคนไม่ต้องรู้จักโมดูลเหล่านั้นเลย
 * 🔴 ทุกตัวรันใน transaction เดียวกับการรวม (พังตัวใดตัวหนึ่ง = ไม่รวมเลย ไม่ใช่รวมครึ่ง ๆ)
 */
export type MergeHook = (input: { ctx: MemberCtx; keepId: string; mergeId: string; tx: Tx }) => Promise<void>;
const mergeHooks: MergeHook[] = [];

/** ลงทะเบียน hook ตอนรวมคน (เรียกตอนบูตของ composition root — idempotent ต่อฟังก์ชันเดียวกัน) */
export function onMerge(hook: MergeHook): void {
  if (!mergeHooks.includes(hook)) mergeHooks.push(hook);
}

/** คอลัมน์ของสมาชิกที่ "เติมช่องว่างของคนที่เก็บไว้ ด้วยค่าของคนที่ถูกรวม" ได้ (§11.1) */
const FILL_COLUMNS = [
  "email", "phone", "firstName", "lastName", "nickname", "titleTh", "birthDate", "gender",
  "nationality", "avatarFileId", "lineUserId", "phone2", "facebook", "note", "homeUnitId",
  "ownerUserId", "preferredChannel",
] as const;

/** คอลัมน์ที่ถ้าย้ายไปคนที่เก็บไว้ ต้อง **ล้างของเดิม** ด้วย (มี unique/ใช้จับคู่ตัวตน) */
const EXCLUSIVE_COLUMNS = new Set<string>(["phone", "email"]);

async function doMerge(
  ctx: MemberCtx,
  actor: MemberActor,
  input: { keepId: string; mergeId: string; fieldChoices?: Record<string, "A" | "B"> },
): Promise<{ keptId: string }> {
  const keep = await loadCustomer(ctx, input.keepId);
  const merge = await loadCustomer(ctx, input.mergeId);
  if (keep.id === merge.id) throw new MemberInputError("เลือกสมาชิกคนเดียวกันทั้งสองฝั่ง — เลือกอีกคนที่จะรวมเข้ามา");
  if (merge.status === "MERGED" || keep.status === "MERGED") {
    throw new MemberInputError("สมาชิกคู่นี้ถูกรวมไปแล้ว — เปิดโปรไฟล์ของคนที่เก็บไว้เพื่อดูข้อมูลรวม");
  }
  await assertVisible(ctx, actor, keep);
  await assertVisible(ctx, actor, merge);

  const pointSystemId = await pointSystemOf(ctx);
  const mergeBalance = pointSystemId ? await point.getBalance(pointSystemId, merge.id) : 0;

  await prisma.$transaction(
    async (tx) => {
      // (1) ค่าฟิลด์ที่คนเลือกให้ใช้ของฝั่ง B
      const chosen = Object.entries(input.fieldChoices ?? {}).filter(([, side]) => side === "B").map(([key]) => key);
      if (chosen.length > 0) {
        const both = await fields.getFieldValues(ctx, [keep.id, merge.id], tx);
        const patch: Record<string, unknown> = {};
        for (const key of chosen) {
          const value = both[merge.id]?.[key];
          if (value !== undefined && value !== null) patch[key] = value;
        }
        if (Object.keys(patch).length > 0) {
          await fields.setFieldValues(ctx, keep.id, patch, { via: "STAFF", byUserId: ctx.actorUserId }, tx);
        }
      }

      // (2) เติมช่องว่างของคนที่เก็บไว้ด้วยข้อมูลของคนที่ถูกรวม
      const fresh = await tx.customer.findFirst({ where: { id: keep.id } });
      const keepRow = (fresh ?? keep) as unknown as Record<string, unknown>;
      const mergeRow = merge as unknown as Record<string, unknown>;
      const fill: Record<string, unknown> = {};
      const clear: Record<string, unknown> = {};
      for (const col of FILL_COLUMNS) {
        if (keepRow[col] === null || keepRow[col] === undefined || keepRow[col] === "") {
          const value = mergeRow[col];
          if (value !== null && value !== undefined && value !== "") {
            fill[col] = value;
            if (EXCLUSIVE_COLUMNS.has(col)) clear[col] = null;
          }
        }
      }
      // ล้างค่าที่ย้ายออกจากฝั่ง B **ก่อน** เขียนฝั่ง A (คอลัมน์เบอร์มี unique ต่อระบบสมาชิก)
      if (Object.keys(clear).length > 0) {
        await tx.customer.update({ where: { id: merge.id }, data: clear as Prisma.CustomerUpdateInput });
      }
      if (Object.keys(fill).length > 0) {
        await tx.customer.update({ where: { id: keep.id }, data: fill as Prisma.CustomerUpdateInput });
      }

      // (3) ค่าฟิลด์กำหนดเองที่ฝั่ง A ยังว่าง → ย้ายแถวมาเลย (ไม่ทับของเดิม)
      const mergeValues = await tx.memberFieldValue.findMany({ where: { tenantId: ctx.tenantId, customerId: merge.id } });
      for (const row of mergeValues) {
        const taken = await tx.memberFieldValue.count({ where: { customerId: keep.id, fieldId: row.fieldId } });
        if (taken === 0) await tx.memberFieldValue.update({ where: { id: row.id }, data: { customerId: keep.id } });
      }

      // (4) แต้ม: โอนยอดคงเหลือทั้งก้อนเป็นรายการที่มีเหตุผลว่า "MERGE" ทั้งสองฝั่ง (ตรวจสอบย้อนหลังได้)
      if (pointSystemId && mergeBalance > 0) {
        await point.credit(
          {
            tenantId: ctx.tenantId,
            systemId: pointSystemId,
            customerId: keep.id,
            points: mergeBalance,
            reason: `MERGE รับโอนแต้มจากสมาชิกที่ถูกรวม (${merge.memberCode ?? merge.id})`,
            refType: "MEMBER_MERGE",
            refId: `${keep.id}:${merge.id}`,
            idempotencyKey: `member-merge-in-${keep.id}-${merge.id}`,
          },
          tx,
        );
        await point.adjust(
          {
            tenantId: ctx.tenantId,
            systemId: pointSystemId,
            customerId: merge.id,
            delta: -mergeBalance,
            reason: `MERGE โอนแต้มไปสมาชิกที่เก็บไว้ (${keep.memberCode ?? keep.id})`,
            idempotencyKey: `member-merge-out-${keep.id}-${merge.id}`,
          },
          tx,
        );
      }

      // (5) ตัวตนช่องทาง · ยินยอม · ที่อยู่ · ไทม์ไลน์
      await tx.memberChannelIdentity.updateMany({
        where: { tenantId: ctx.tenantId, customerId: merge.id },
        data: { customerId: keep.id, linkedBy: "MERGE" },
      });
      const mergeConsents = await tx.memberConsent.findMany({ where: { tenantId: ctx.tenantId, customerId: merge.id } });
      for (const c of mergeConsents) {
        const own = await tx.memberConsent.findFirst({ where: { customerId: keep.id, channel: c.channel } });
        if (own) {
          // ยอมรับไว้ที่ใดที่หนึ่ง = ยอมรับ (OR) — ถอนความยินยอมต้องเป็นการกระทำของลูกค้าเท่านั้น
          if (c.granted && !own.granted) {
            await tx.memberConsent.update({ where: { id: own.id }, data: { granted: true, grantedAt: c.grantedAt ?? new Date(), revokedAt: null } });
          }
          await tx.memberConsent.delete({ where: { id: c.id } });
        } else {
          await tx.memberConsent.update({ where: { id: c.id }, data: { customerId: keep.id } });
        }
      }
      await tx.memberAddress.updateMany({ where: { tenantId: ctx.tenantId, customerId: merge.id }, data: { customerId: keep.id } });
      await tx.memberActivity.updateMany({ where: { tenantId: ctx.tenantId, customerId: merge.id }, data: { customerId: keep.id } });

      // (6) ที่มา: first touch ของคนที่เก็บไว้ห้ามเปลี่ยน · last touch เอาอันที่ใหม่กว่า
      const mergeLast = await tx.memberAttribution.findFirst({ where: { customerId: merge.id, touch: "LAST" } });
      if (mergeLast) {
        const keepLast = await tx.memberAttribution.findFirst({ where: { customerId: keep.id, touch: "LAST" } });
        if (!keepLast) {
          await tx.memberAttribution.update({ where: { id: mergeLast.id }, data: { customerId: keep.id } });
        } else if (mergeLast.occurredAt > keepLast.occurredAt) {
          await tx.memberAttribution.update({
            where: { id: keepLast.id },
            data: {
              source: mergeLast.source,
              linkId: mergeLast.linkId,
              campaignId: mergeLast.campaignId,
              staffUserId: mergeLast.staffUserId,
              referrerCustomerId: mergeLast.referrerCustomerId,
              unitId: mergeLast.unitId,
              occurredAt: mergeLast.occurredAt,
            },
          });
        }
      }

      // (7) ปิดฝั่ง B + ชี้ทางไปคนที่เก็บไว้ (ไม่ลบแถว — ลิงก์เก่าทุกที่ยังตามมาถึงคนที่ถูกต้อง)
      await tx.customer.update({
        where: { id: merge.id },
        data: { status: "MERGED", mergedIntoId: keep.id },
      });
      if (keep.partyId && merge.partyId) {
        await party.mergeParties(ctx.tenantId, keep.partyId, merge.partyId, tx);
      }
      await tx.partyMergeCandidate.updateMany({
        where: {
          tenantId: ctx.tenantId,
          OR: [
            { partyAId: keep.partyId ?? "", partyBId: merge.partyId ?? "" },
            { partyAId: merge.partyId ?? "", partyBId: keep.partyId ?? "" },
          ],
        },
        data: { status: "MERGED" },
      });

      for (const hook of mergeHooks) await hook({ ctx, keepId: keep.id, mergeId: merge.id, tx });

      await writeActivity(ctx, tx, {
        customerId: keep.id,
        type: "MERGED_IN",
        summary: `รวมสมาชิกซ้ำเข้ามา (${merge.memberCode ?? merge.id})`,
        unitId: keep.homeUnitId,
        data: { mergedId: merge.id, points: mergeBalance } as Prisma.InputJsonValue,
      });
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        type: "member.merged",
        idempotencyKey: `member.merged#${keep.id}#${merge.id}`,
        payload: { keepId: keep.id, mergedId: merge.id },
        systemId: ctx.systemId,
      });
    },
    { timeout: 60_000, maxWait: 20_000 },
  );

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: "member.merged",
    targetType: "Customer",
    targetId: keep.id,
    after: { mergedId: merge.id, points: mergeBalance },
  });
  return { keptId: keep.id };
}

/**
 * รวมสมาชิกซ้ำ (§11.1) — ทำได้ครั้งเดียว ย้อนไม่ได้ จึงบังคับพิมพ์ยืนยัน "MERGE"
 * เจ้าของร้าน = รวมทันที · ผู้จัดการ = ยื่นเข้าสายอนุมัติ (ไม่มีนโยบาย = ผ่านอัตโนมัติ → รวมทันที)
 * พนักงาน = ทำไม่ได้
 */
export async function mergeMembers(ctx: MemberCtx, actor: MemberActor, input: MergeInput): Promise<MergeResult> {
  if (input.confirm !== "MERGE") {
    throw new MemberInputError('การรวมสมาชิกย้อนกลับไม่ได้ — พิมพ์ "MERGE" เพื่อยืนยันก่อนทำรายการ');
  }
  if (input.keepId === input.mergeId) {
    throw new MemberInputError("เลือกสมาชิกคนเดียวกันทั้งสองฝั่ง — เลือกอีกคนที่จะรวมเข้ามา");
  }
  requirePerm(actor, "member.customer.merge", "รวมสมาชิกที่ซ้ำกัน");
  if (actor.role !== "OWNER" && actor.role !== "MANAGER") {
    throw new MemberForbiddenError("รวมสมาชิกได้เฉพาะผู้จัดการขึ้นไป — แจ้งผู้จัดการสาขาให้ช่วยดำเนินการ");
  }

  if (actor.role === "MANAGER") {
    // ตรวจให้ครบก่อนยื่น (ยื่นคำขอที่ทำไม่ได้อยู่แล้ว = ผู้อนุมัติเสียเวลาเปล่า)
    const keep = await loadCustomer(ctx, input.keepId);
    const merge = await loadCustomer(ctx, input.mergeId);
    await assertVisible(ctx, actor, keep);
    await assertVisible(ctx, actor, merge);
    if (merge.status === "MERGED" || keep.status === "MERGED") {
      throw new MemberInputError("สมาชิกคู่นี้ถูกรวมไปแล้ว — เปิดโปรไฟล์ของคนที่เก็บไว้เพื่อดูข้อมูลรวม");
    }
    const res = await approval.submitForApproval(
      { tenantId: ctx.tenantId },
      {
        entityType: "member.merge",
        entityId: `${input.keepId}:${input.mergeId}`,
        systemId: ctx.systemId,
        requestedById: actor.userId,
      },
    );
    if ("requestId" in res) return { pending: true, approvalRequestId: res.requestId };
  }

  return doMerge(ctx, actor, input);
}

/**
 * รวมสมาชิกหลังคำขอ "ผ่าน" สายอนุมัติแล้ว — เรียกจาก composition root `src/lib/approval-effects.ts`
 * 🔴 ไม่ตรวจสิทธิ์ของผู้กดอนุมัติซ้ำ: ด่านสิทธิ์อยู่ที่โมดูลอนุมัติแล้ว (ใครตัดสิน step ไหนได้)
 *    แต่ยังตรวจ "รวมไปแล้ว/ไม่พบ" ตามปกติ ⇒ replay ของ outbox ปลอดภัย
 */
export async function mergeMembersApproved(
  ctx: MemberCtx,
  input: { keepId: string; mergeId: string; approvedById?: string | null },
): Promise<{ keptId: string } | null> {
  const actor: MemberActor = {
    userId: input.approvedById ?? "",
    role: "OWNER",
    unitAccess: ["*"],
    permissions: { "member.*": true },
  };
  const merge = await prisma.customer.findFirst({
    where: { id: input.mergeId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
    select: { status: true },
  });
  if (!merge || merge.status === "MERGED") return null; // ทำไปแล้ว/ไม่มีอยู่ — เงียบ (idempotent)
  return doMerge({ ...ctx, actorUserId: input.approvedById ?? null }, actor, input);
}

// ───────────────────────── facade ย่อยให้โมดูลอื่น ─────────────────────────

/**
 * "คนนี้เป็นสมาชิกคนไหนของร้าน" จากกุญแจที่โมดูลอื่นมีอยู่ (§5.11)
 * ลำดับเดียวกับ `linkIdentity`: ตัวตนกลาง → เบอร์ → id ไลน์ · ไม่พบ = null (ไม่สร้างใหม่)
 */
export async function linkContact(
  ctx: MemberCtx,
  keys: { partyId?: string | null; phone?: string | null; lineUserId?: string | null },
): Promise<string | null> {
  const base = { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, status: { not: "MERGED" as MemberStatus } };
  if (keys.partyId) {
    const canonical = await party.resolveCanonical(ctx.tenantId, keys.partyId);
    const row = await prisma.customer.findFirst({ where: { ...base, partyId: { in: [keys.partyId, canonical] } } });
    if (row) return row.id;
  }
  const phone = normPhone(keys.phone);
  if (phone) {
    const row = await prisma.customer.findFirst({ where: { ...base, phone: { in: phoneVariants(phone) } } });
    if (row) return row.id;
  }
  const lineUserId = trimOrNull(keys.lineUserId);
  if (lineUserId) {
    const identity = await prisma.memberChannelIdentity.findFirst({
      where: { tenantId: ctx.tenantId, channel: "LINE", externalId: lineUserId },
      select: { customerId: true },
    });
    if (identity) return identity.customerId;
    const row = await prisma.customer.findFirst({ where: { ...base, lineUserId } });
    if (row) return row.id;
  }
  return null;
}

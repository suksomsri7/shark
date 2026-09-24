// activities.ts — บริการ "กิจกรรม v2" ของ CRM (ใบ C1.6 · พิมพ์เขียว §5.5 §3.8 · มติ C19 · R-A · R-C.8 · R-E.14)
//
// ของที่ไฟล์นี้เป็นเจ้าของ
//   • CrmActivity v2: logActivity (+ ทะเบียนผลลัพธ์ · nextTask · lastActivityAt · โน้ตปักหมุด · @กล่าวถึง) · completeActivity ·
//     rescheduleActivity · updateActivity · setPinned · deleteActivity · getActivity · listActivities · calendar · listNotes
//   • การ์ดบอร์ดงานของกิจกรรม: openTaskCard (ผ่านประตูเดียว `kanban/links.createCardFromExternal`) · ตัวรับ `kanban.card.completed`
//     (ปิดกิจกรรมที่ผูกการ์ด) · รายการการ์ดของดีล (`dealKanbanCards` — deals.getDeal360 เรียก)
//   • event `crm.activity.logged / crm.activity.completed` — ยิงใน tx ของการเขียนเสมอ · key `crm.activity.<type>#<id>#<seq>` (R-C.8)
//   • ทางเข้าของ v1 (`service.ts` addActivity/completeActivity/listPendingActivities) **ไม่แตะ** — หน้า v1 + qc-crm-activity ยังใช้ของเดิม
//
// 🔴 การอ่านทุกทางผ่าน `./where.ts` (activityWhere · contactWhere · companyWhere · dealWhere — R-A · C1.7 แทนไส้ใน)
// 🔴 ctx.systemId ถูก resolve ใหม่ทุกคำสั่ง (ต้องเป็นระบบ CRM ของร้านนี้) — ไม่เชื่อ id จากผู้เรียก
// 🔴 `lastActivityAt` ของบริษัทเขียนผ่าน `companies.touchLastActivityInTx` เท่านั้น (ผู้เขียน CrmCompany มีที่เดียว — หนี้ C1.3)
// 🔴 ลำดับล็อก (หัวไฟล์ companies.ts · มติผู้คุมงาน C1.5/C1.6): ต้นไม้ → engine → เลขภาษี → Party → แถว CrmCompany (เรียง id) →
//    แถว CrmContact (เรียง id) → แถว CrmDeal (เรียง id) — logActivity ล็อก "บริษัท → ผู้ติดต่อ → ดีล" ก่อนเขียนอะไรทั้งหมด
//    (รวม INSERT ที่ FK ขอ KEY SHARE ของผู้ติดต่อ/ดีล) ⇒ ไม่มีวันไขว้ลำดับกับ deals.moveDeal / companies.setPrimary
// 🔴 บอร์ดงานโหลดตอนใช้ (dynamic import): `kanban/links` → … → outbox-consumers → … → crm facade = วงโหลดถ้า import หัวไฟล์

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { CrmActivity, CrmActivityType, CrmDirection, CrmPriority, Role } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
// 🔴 facade สมาชิกโหลดตอนใช้ (dynamic import) — crm facade ถูก import จากโมดูลบัญชี (account→crm) และ member → … → account
//    ถ้า import ค่าที่หัวไฟล์ = วงโหลด (TDZ · fitness F10.1 — เหตุผลเดียวกับ companies.ts/deals.ts) · หัวไฟล์ import ได้เฉพาะ "ชนิด"
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { activityWhere, contactWhere, dealWhere, recordWhere } from "./where";
import * as companies from "./companies";
import { activityOutcomesOf, parseCrmSettings } from "./settings";
import { logOps } from "@/lib/core/ops";
// CRM C1.7 ▸ คีย์สิทธิ์ตัวเดียวของ CRM (แทน rbac.evaluate) ◂
import { crmCan, crmForbiddenMessage, isApiActor } from "./access";
import {
  ACTIVITY_ATTENDEES_MAX,
  ACTIVITY_BODY_MAX,
  ACTIVITY_CHANNEL_MAX,
  ACTIVITY_DIRECTIONS,
  ACTIVITY_DURATION_MAX_SEC,
  ACTIVITY_LOCATION_MAX,
  ACTIVITY_MENTIONS_MAX,
  ACTIVITY_OUTCOMES_DEFAULT,
  ACTIVITY_PAGE_DEFAULT,
  ACTIVITY_PAGE_MAX,
  ACTIVITY_PRIORITIES,
  ACTIVITY_REASON_MAX,
  ACTIVITY_REASON_MIN,
  ACTIVITY_STATUSES,
  ACTIVITY_TITLE_MAX,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABEL,
  ActivitiesError,
  // CRM C2.4 ▸ ปฏิทินรวมนัดจากโมดูลจอง/คลินิก/โรงเรียน ◂
  type CalendarAppointment,
  type PartyAppointment,
  CALENDAR_MAX_APPOINTMENTS,
  CALENDAR_MAX_ITEMS,
  INVISIBLE_CHARS_RE,
  CALENDAR_MAX_SPAN_DAYS,
  DAY_MS,
  thaiDayStartMs,
  type ActivityDirection,
  type ActivityDto,
  type ActivityErrorCode,
  type ActivityListItem,
  type ActivityListResult,
  type ActivityPriority,
  type ActivityScope,
  type ActivityStatus,
  type ActivityType,
  type LogActivityResult,
  type MentionOption,
} from "./activities-shared";

export {
  ACTIVITY_BODY_MAX,
  ACTIVITY_OUTCOMES_DEFAULT,
  ACTIVITY_REASON_MIN,
  ACTIVITY_TITLE_MAX,
  ActivitiesError,
};

const kanbanLinks = () => import("@/lib/modules/kanban/links");
const memberFacade = () => import("@/lib/modules/member");

// ───────────────────────── ชนิด ─────────────────────────

export type ActivitiesCtx = { tenantId: string; systemId: string; actorUserId: string | null };
type Tx = Prisma.TransactionClient;
type Db = typeof prisma | Tx;

export type LogActivityInput = {
  type: string;
  title: string;
  body?: string | null;
  direction?: string | null;
  channel?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  customRecordId?: string | null;
  startAt?: Date | string | number | null;
  endAt?: Date | string | number | null;
  durationSec?: number | null;
  outcome?: string | null;
  attendees?: { userIds?: string[] | null; contactIds?: string[] | null } | null;
  location?: string | null;
  dueAt?: Date | string | number | null;
  remindAt?: Date | string | number | null;
  done?: boolean | null;
  priority?: string | null;
  /** NOTE เท่านั้น */
  pinned?: boolean | null;
  /** userIds ที่ @กล่าวถึง — NOTE เท่านั้น */
  mentions?: string[] | null;
  nextTask?: { type?: string | null; title?: string | null; dueAt?: Date | string | number | null } | null;
};

export type UpdateActivityInput = {
  title?: string | null;
  body?: string | null;
  outcome?: string | null;
  pinned?: boolean | null;
  mentions?: string[] | null;
};

export type RescheduleInput = {
  dueAt?: Date | string | number | null;
  startAt?: Date | string | number | null;
  endAt?: Date | string | number | null;
};

export type ListActivitiesInput = {
  scope?: ActivityScope | null;
  status?: ActivityStatus | null;
  type?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  customRecordId?: string | null;
  from?: Date | string | number | null;
  to?: Date | string | number | null;
  cursor?: string | null;
  pageSize?: number | null;
};

export type CalendarInput = {
  from: Date | string | number;
  to: Date | string | number;
  mine?: boolean | null;
  team?: boolean | null;
};

export type NotesTarget = { contactId?: string | null; companyId?: string | null; dealId?: string | null; customRecordId?: string | null };
export type DangerOpts = { confirm?: boolean | null; reason?: string | null };
export type OpenTaskCardInput = { activityId: string; boardId: string; columnId?: string | null };
export type DealKanbanCard = { cardId: string; cardNo: number | null; title: string; boardId: string; boardName: string; columnName: string; status: "ACTIVE" | "ARCHIVED"; dueAt: string | null };

// ───────────────────────── ตัวช่วยพื้นฐาน ─────────────────────────

const EVT = { logged: "crm.activity.logged", completed: "crm.activity.completed" } as const;
/** ชนิดที่ "เกิดขึ้นแล้ว" เมื่อเวลาเริ่มผ่านไปแล้ว (มติผู้คุมงาน C1.6 S2) */
const HAPPENED_TYPES: readonly ActivityType[] = ["CALL", "EMAIL", "VISIT", "MEETING"];
const TX_OPTS = { maxWait: 20_000, timeout: 40_000 } as const;
const NOT_FOUND_MSG = "ไม่พบกิจกรรมนี้ในระบบ CRM ที่เปิดอยู่ (อาจถูกลบหรืออยู่คนละระบบ) — รีเฟรชหน้าแล้วลองใหม่";
const TARGET_NOT_FOUND_MSG = "ไม่พบรายการที่จะบันทึกกิจกรรมในระบบ CRM ที่เปิดอยู่ (อาจถูกลบหรืออยู่คนละระบบ) — รีเฟรชหน้าแล้วลองใหม่";
const RACE_MSG = "ข้อมูลของรายการนี้เพิ่งถูกแก้จากที่อื่นพร้อมกัน ระบบจึงยังไม่บันทึก — รีเฟรชหน้าแล้วลองอีกครั้ง";

const fail = (code: ActivityErrorCode, message: string) => new ActivitiesError(code, message);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const newSeq = () => randomUUID().replace(/-/g, "");
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isManager = (a: MemberActor) => a.role === "OWNER" || a.role === "MANAGER";
const identityScope = (ctx: ActivitiesCtx) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId });
const coCtx = (ctx: ActivitiesCtx) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null });

/** เริ่ม tx ใหม่เพราะบริษัท/ผู้ติดต่อของเป้าหมายเปลี่ยนระหว่างรอล็อก (ไม่ใช่ข้อผิดพลาดของผู้ใช้) */
class RelockNeeded extends Error {}

function assertActor(actor: MemberActor | null | undefined): asserts actor is MemberActor {
  // ลูกค้า (portal) ไม่มีทางเข้าบริการฝั่งพนักงาน — ตอบ "ไม่พบ" (404-not-403)
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", NOT_FOUND_MSG);
}

/** AUDIT-CLASS X1: ctx.systemId ต้องเป็นระบบ **CRM** ของร้านนี้จริง (ระบบร้านอื่น/ชนิดอื่น = ไม่พบ) · คืน settings ดิบของระบบ */
async function resolveSystem(ctx: ActivitiesCtx, db: Db = prisma): Promise<unknown> {
  const sys =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string" && ctx.systemId && ctx.tenantId
      ? await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true, settings: true } })
      : null;
  if (!sys) throw fail("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  return sys.settings;
}

async function enter(ctx: ActivitiesCtx, actor: MemberActor | null | undefined): Promise<{ a: MemberActor; settings: unknown }> {
  assertActor(actor);
  const settings = await resolveSystem(ctx);
  return { a: actor, settings };
}

/**
 * ทะเบียนผลลัพธ์ของระบบนี้ — อ่านผ่านตัวอ่านแบบมีชนิดของ `settings.ts` (`activityOutcomesOf`)
 * ตั้ง = รายการนั้น (`[]` = ไม่มีผลลัพธ์ให้เลือก) · ไม่ได้ตั้ง = ค่าตั้งต้นพิมพ์เขียว §4.5 · ชนิดที่ไม่มีรายการ = ไม่รับผลลัพธ์
 */
function outcomeRegistry(settings: unknown, type: ActivityType): readonly string[] | null {
  return activityOutcomesOf(settings, type, ACTIVITY_OUTCOMES_DEFAULT);
}

/** AUDIT-CLASS X1: กิจกรรม 1 แถวผ่าน activityWhere — ระบบอื่น/ร้านอื่น = NOT_FOUND (ข้อความไม่สะท้อนข้อมูลของเขา) */
async function loadActivity(ctx: ActivitiesCtx, a: MemberActor, id: unknown, db: Db = prisma): Promise<CrmActivity> {
  const aid = str(id);
  const row = aid ? await db.crmActivity.findFirst({ where: { AND: [await activityWhere(ctx, a, { db }), { id: aid }] } }) : null;
  if (!row) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  return row;
}

/**
 * AUDIT-CLASS X4: key `crm.activity.<type>#<activityId>#<seq>` (R-C.8) · emit ใน tx ของการเขียน
 * ⇒ เขียนไม่สำเร็จ = ไม่มี event · event เขียนไม่ได้ = การเขียนทั้งก้อนถูกยกเลิก
 * AUDIT-CLASS X8: payload = id/คีย์ล้วน — ไม่มีหัวเรื่อง/เนื้อโน้ต/ผลลัพธ์/ชื่อคน/เบอร์/อีเมล
 */
async function emitActivity(tx: Tx, ctx: ActivitiesCtx, type: (typeof EVT)[keyof typeof EVT], row: CrmActivity, extra: Record<string, unknown> = {}): Promise<void> {
  await emitOutbox(tx, {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    type,
    idempotencyKey: `${type}#${row.id}#${newSeq()}`,
    payload: {
      activityId: row.id,
      type: row.type,
      contactId: row.contactId,
      dealId: row.dealId,
      companyId: row.companyId,
      customRecordId: row.customRecordId,
      ownerUserId: row.ownerUserId,
      ...extra,
    },
  });
}

async function audit(ctx: ActivitiesCtx, action: string, targetId: string, body: { before?: unknown; after?: unknown }): Promise<void> {
  // AUDIT-CLASS X9: ทุก mutation มีแถว audit พร้อมผู้ทำ — ไม่เก็บเนื้อโน้ต/หัวเรื่อง (X8) เก็บแค่ชนิด/ id/ เหตุผล
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId ?? null, actorType: ctx.actorUserId ? "USER" : "SYSTEM", action, targetType: "CrmActivity", targetId, ...body });
}

function attendeesOf(v: unknown): { userIds: string[]; contactIds: string[] } | null {
  if (!isObj(v)) return null;
  const arr = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []);
  return { userIds: arr(v.userIds), contactIds: arr(v.contactIds) };
}

export function toActivityDto(row: CrmActivity): ActivityDto {
  return {
    id: row.id,
    systemId: row.systemId,
    type: row.type as ActivityType,
    title: row.title,
    body: row.body,
    direction: (row.direction as ActivityDirection | null) ?? null,
    channel: row.channel,
    contactId: row.contactId,
    companyId: row.companyId,
    dealId: row.dealId,
    customRecordId: row.customRecordId,
    startAt: iso(row.startAt),
    endAt: iso(row.endAt),
    durationSec: row.durationSec,
    dueAt: iso(row.dueAt),
    remindAt: iso(row.remindAt),
    doneAt: iso(row.doneAt),
    outcome: row.outcome,
    attendees: attendeesOf(row.attendees),
    location: row.location,
    priority: row.priority as ActivityPriority,
    pinned: row.pinned,
    mentions: row.mentions,
    ownerUserId: row.ownerUserId,
    completedById: row.completedById,
    kanbanCardId: row.kanbanCardId,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    // CRM C2.4 ▸ AUDIT-CLASS X10: ธงเดียว — ลิงก์ฟังเสียงออกทาง `calls.getRecording` (ตรวจการมองเห็นก่อนออกใบผ่าน) ◂
    hasRecording: !!row.recordingFileId,
  };
}

// ───────────────────────── ตรวจค่าที่กรอก (AUDIT-CLASS X6) ─────────────────────────

function parseType(v: unknown, label = "ชนิดกิจกรรม"): ActivityType {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (!(ACTIVITY_TYPES as readonly string[]).includes(s)) throw fail("VALIDATION", `${label}ไม่อยู่ในรายการที่ระบบรู้จัก — เลือกใหม่จากรายการ (โทร · นัดพบ · งาน · โน้ต …)`);
  return s as ActivityType;
}

function cleanTitle(v: unknown, label = "หัวเรื่องของกิจกรรม"): string {
  const t = typeof v === "string" ? v.replace(INVISIBLE_CHARS_RE, "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().replace(/\s+/g, " ") : "";
  if (!t) throw fail("VALIDATION", `ใส่${label}ก่อน — เช่น "โทรคุยเรื่องราคา"`);
  if (t.length > ACTIVITY_TITLE_MAX) throw fail("VALIDATION", `${label}ยาวเกิน ${ACTIVITY_TITLE_MAX} ตัวอักษร — ย่อให้สั้นลง แล้วใส่รายละเอียดในช่องโน้ตแทน`);
  return t;
}

/** AUDIT-CLASS X6: เนื้อความ ≤ ACTIVITY_BODY_MAX (8,000) */
function cleanBody(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw fail("VALIDATION", "โน้ตต้องเป็นข้อความ");
  // AUDIT-CLASS X6: อักขระ NUL ในเนื้อความ = ข้อมูลเสีย (Postgres เก็บไม่ได้/ใช้ตัดข้อความ) ⇒ ปฏิเสธชัด ๆ แทนการล้มกลางทาง
  if (v.includes("\u0000")) throw fail("VALIDATION", "โน้ตมีอักขระพิเศษที่บันทึกไม่ได้ (มักติดมาจากการคัดลอก) — พิมพ์หรือวางข้อความใหม่อีกครั้ง");
  const t = v.replace(/\r\n/g, "\n").trim();
  if (!t) return null;
  if (t.length > ACTIVITY_BODY_MAX) throw fail("VALIDATION", `โน้ตยาวเกิน ${ACTIVITY_BODY_MAX.toLocaleString("en-US")} ตัวอักษร — แบ่งเป็นหลายโน้ต หรือแนบเป็นไฟล์แทน`);
  return t;
}

function cleanShort(v: unknown, label: string, max: number): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw fail("VALIDATION", `${label}ต้องเป็นข้อความ`);
  const t = v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (!t) return null;
  if (t.length > max) throw fail("VALIDATION", `${label}ยาวเกิน ${max} ตัวอักษร — ย่อให้สั้นลง`);
  return t;
}

/** วันเวลาจากผู้เรียก (Date · ISO · epoch ms) — ว่าง = null · อ่านไม่ออก = VALIDATION */
function toDate(v: unknown, label: string): Date | null {
  if (v === undefined || v === null || v === "") return null;
  const d = v instanceof Date ? new Date(v.getTime()) : typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  if (!d || !Number.isFinite(d.getTime())) throw fail("VALIDATION", `${label}อ่านไม่ออก — เลือกวันและเวลาจากปฏิทินอีกครั้ง`);
  const y = d.getUTCFullYear();
  if (y < 2000 || y > 2100) throw fail("VALIDATION", `${label}อยู่นอกช่วงที่ระบบรองรับ (ค.ศ. 2000–2100) — ตรวจปีอีกครั้ง`);
  return d;
}

function parseOutcome(v: unknown, type: ActivityType, settings: unknown): string | null {
  const o = typeof v === "string" ? v.trim() : v === undefined || v === null ? "" : null;
  if (o === null) throw fail("VALIDATION", "ผลลัพธ์ต้องเป็นข้อความจากรายการ");
  if (!o) return null;
  const reg = outcomeRegistry(settings, type);
  if (!reg || reg.length === 0) throw fail("VALIDATION", `กิจกรรมชนิด "${ACTIVITY_TYPE_LABEL[type]}" ไม่มีรายการผลลัพธ์ให้เลือก — เว้นช่องผลลัพธ์ว่างไว้ แล้วเขียนรายละเอียดในโน้ตแทน`);
  if (!reg.includes(o)) throw fail("VALIDATION", `ผลลัพธ์นี้ไม่อยู่ในรายการของ "${ACTIVITY_TYPE_LABEL[type]}" — เลือกจาก: ${reg.join(" · ")}`);
  return o;
}

function parseDirection(v: unknown): CrmDirection | null {
  if (v === undefined || v === null || v === "") return null;
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (!(ACTIVITY_DIRECTIONS as readonly string[]).includes(s)) throw fail("VALIDATION", "ทิศทางต้องเป็นสายเข้า (IN) หรือโทรออก (OUT)");
  return s as CrmDirection;
}

function parsePriority(v: unknown): CrmPriority | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (!(ACTIVITY_PRIORITIES as readonly string[]).includes(s)) throw fail("VALIDATION", "ความเร่งด่วนต้องเป็น ต่ำ · ปกติ · ด่วน");
  return s as CrmPriority;
}

function parseDuration(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw fail("VALIDATION", "ระยะเวลาต้องเป็นจำนวนวินาทีเต็ม ตั้งแต่ 0 ขึ้นไป");
  if (v > ACTIVITY_DURATION_MAX_SEC) throw fail("VALIDATION", "ระยะเวลานานเกิน 7 วัน — ตรวจตัวเลขอีกครั้ง");
  return v;
}

function idList(v: unknown, max: number, label: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw fail("VALIDATION", `${label}ต้องเป็นรายการ`);
  const out = [...new Set(v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()))];
  if (out.length > max) throw fail("VALIDATION", `${label}ได้ไม่เกิน ${max} คน/รายการต่อครั้ง`);
  return out;
}

function reasonOf(opts: DangerOpts | null | undefined, what: string): string {
  // AUDIT-CLASS X9: การกระทำอันตรายต้องยืนยัน + เหตุผล ≥ ACTIVITY_REASON_MIN ตัวอักษร (ตรวจก่อนแตะอะไรทั้งหมด)
  if (opts?.confirm !== true) throw fail("CONFIRM_REQUIRED", `การ${what}ต้องกดยืนยันก่อน — ติ๊กช่องยืนยันแล้วลองอีกครั้ง`);
  const reason = String(opts?.reason ?? "").trim();
  if (reason.length < ACTIVITY_REASON_MIN) throw fail("VALIDATION", `ใส่เหตุผลของการ${what}อย่างน้อย ${ACTIVITY_REASON_MIN} ตัวอักษร เพื่อให้ทีมย้อนดูได้ว่าทำไป เพราะอะไร`);
  if (reason.length > ACTIVITY_REASON_MAX) throw fail("VALIDATION", `เหตุผลยาวเกิน ${ACTIVITY_REASON_MAX} ตัวอักษร — ย่อให้สั้นลง`);
  return reason;
}

// ───────────────────────── เป้าหมายของกิจกรรม (ผ่าน where.ts) ─────────────────────────

type Targets = { contactId: string | null; companyId: string | null; dealId: string | null; customRecordId: string | null };

/**
 * AUDIT-CLASS X1: หาเป้าหมายทั้งหมดผ่าน where ของ actor — ของร้านอื่น/ระบบอื่น = NOT_FOUND (ไม่สะท้อนข้อมูลของเขา)
 * ค่าตั้งต้น: dealId ⇒ ผู้ติดต่อ/บริษัทของดีล · contactId อย่างเดียว ⇒ บริษัทหลักของผู้ติดต่อ (แคช companyId)
 * บริษัทที่ระบุเองต้องผูกกับผู้ติดต่ออยู่จริง (ลิงก์ที่ยังไม่สิ้นสุด)
 */
async function resolveTargets(ctx: ActivitiesCtx, a: MemberActor, input: { contactId?: unknown; companyId?: unknown; dealId?: unknown; customRecordId?: unknown }, db: Db = prisma): Promise<Targets> {
  const dealIn = str(input.dealId);
  const contactIn = str(input.contactId);
  const companyIn = str(input.companyId);
  const recordIn = str(input.customRecordId);
  if (!dealIn && !contactIn && !companyIn && !recordIn) {
    throw fail("VALIDATION", "เลือกก่อนว่ากิจกรรมนี้เป็นของใคร — ผู้ติดต่อ บริษัท ดีล หรือรายการ อย่างน้อยหนึ่งอย่าง");
  }
  let contactId: string | null = null;
  let companyId: string | null = null;
  let dealId: string | null = null;
  let customRecordId: string | null = null;
  if (dealIn) {
    const d = await db.crmDeal.findFirst({ where: { AND: [await dealWhere(ctx, a, { db }), { id: dealIn }] }, select: { id: true, contactId: true, companyId: true } });
    if (!d) throw fail("NOT_FOUND", TARGET_NOT_FOUND_MSG);
    dealId = d.id;
    contactId = d.contactId;
    companyId = d.companyId;
  }
  if (contactIn && contactIn !== contactId) {
    const k = await db.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, a, { db }), { id: contactIn }] }, select: { id: true, companyId: true } });
    if (!k) throw fail("NOT_FOUND", TARGET_NOT_FOUND_MSG);
    contactId = k.id;
    if (!dealId) companyId = k.companyId;
  }
  if (companyIn && companyIn !== companyId) {
    // AUDIT-CLASS X1: บริษัทอ่านผ่าน companies.ts (companyWhere ข้างใน — ผู้อ่าน CrmCompany มีที่เดียว · C1.3 S0.3)
    const c = (await companies.companyRefsInTx(db, coCtx(ctx), a, [companyIn]))[0] ?? null;
    if (!c) throw fail("NOT_FOUND", TARGET_NOT_FOUND_MSG);
    if (contactId) {
      const linked = await db.crmCompanyContact.findFirst({ where: { tenantId: ctx.tenantId, companyId: c.id, contactId, endedAt: null }, select: { id: true } });
      if (!linked) throw fail("NOT_FOUND", "บริษัทที่เลือกไม่ได้ผูกกับผู้ติดต่อคนนี้ — เลือกบริษัทจากรายการของผู้ติดต่อ หรือเพิ่มผู้ติดต่อเข้าบริษัทก่อน");
    }
    companyId = c.id;
  }
  if (recordIn) {
    // รายการวัตถุกำหนดเอง: ขอบเขตร้าน + ระบบ (ตัวกรองการมองเห็นระดับรายการมากับ C1.7)
    const r = await db.customRecord.findFirst({ where: { AND: [await recordWhere(ctx, a, { recordId: recordIn, db }), { archivedAt: null }] }, select: { id: true } });
    if (!r) throw fail("NOT_FOUND", TARGET_NOT_FOUND_MSG);
    customRecordId = r.id;
  }
  return { contactId, companyId, dealId, customRecordId };
}

/** ล็อกแถวผู้ติดต่อ/ดีล (FOR UPDATE · เรียง id · ขอบเขตร้าน+ระบบ) — เรียกหลังล็อกบริษัทเสมอ */
async function lockRows(tx: Tx, ctx: ActivitiesCtx, table: "CrmContact" | "CrmDeal", ids: (string | null)[]): Promise<void> {
  const sorted = [...new Set(ids.filter((x): x is string => !!x))].sort();
  if (sorted.length === 0) return;
  if (table === "CrmContact") {
    await tx.$queryRaw`SELECT "id" FROM "CrmContact" WHERE "id" = ANY(${sorted}::text[]) AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} ORDER BY "id" FOR UPDATE`;
  } else {
    await tx.$queryRaw`SELECT "id" FROM "CrmDeal" WHERE "id" = ANY(${sorted}::text[]) AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} ORDER BY "id" FOR UPDATE`;
  }
}

/**
 * AUDIT-CLASS X3: `lastActivityAt := GREATEST(ค่าเดิม, at)` คำสั่งเดียวต่อตาราง — ยิงพร้อมกันกี่ทาง/กี่โพรเซสก็ได้ค่าสูงสุดเสมอ
 * `at` = min(startAt ?? now, now) ⇒ ไม่มีวันถอยหลัง และไม่มีวันเลยเวลาปัจจุบัน · ดีล: ล้าง `stalledAt` ด้วย
 * ลำดับเขียน = ลำดับล็อก: บริษัท (ผ่าน companies.ts — ผู้เขียนเดียว) → ผู้ติดต่อ → ดีล
 */
async function touchLastActivity(tx: Tx, ctx: ActivitiesCtx, t: Targets, at: Date): Promise<void> {
  const ts = at.toISOString();
  if (t.companyId) await companies.touchLastActivityInTx(tx, coCtx(ctx), [t.companyId], at);
  if (t.contactId) {
    await tx.$executeRaw`UPDATE "CrmContact" SET "lastActivityAt" = GREATEST("lastActivityAt", (${ts}::timestamptz AT TIME ZONE 'UTC')) WHERE "id" = ${t.contactId} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}`;
  }
  if (t.dealId) {
    await tx.$executeRaw`UPDATE "CrmDeal" SET "lastActivityAt" = GREATEST("lastActivityAt", (${ts}::timestamptz AT TIME ZONE 'UTC')), "stalledAt" = NULL WHERE "id" = ${t.dealId} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}`;
  }
}

// ───────────────────────── @กล่าวถึง (มติ C19) ─────────────────────────

/** สิทธิ์ของ actor ตามทะเบียน RBAC (OWNER ผ่านเสมอ · ลูกค้าไม่ผ่าน) */
function canDo(a: MemberActor, action: string): boolean {
  // CRM C1.7 ▸ ตัวตัดสินคีย์ตัวเดียวของ CRM (`crm/access.ts`) — MANAGER ปริยาย/อ่านโดยนัย/คีย์ API ตามสัญญาเดียวกันทั้งโมดูล ◂
  return crmCan(a, action);
}

/** CRM C1.7 ▸ AUDIT-CLASS X2: หลังการมองเห็นเสมอ — เห็นแต่ไม่มีคีย์ = FORBIDDEN ข้อความไทย ◂ */
function need(a: MemberActor, key: string): void {
  if (!crmCan(a, key)) throw fail("FORBIDDEN", crmForbiddenMessage(key));
}

function hasCrmAccess(a: MemberActor): boolean {
  if (a.role === "OWNER" || a.role === "MANAGER") return true;
  return Object.entries(a.permissions ?? {}).some(([k, v]) => v === true && (k === "crm.*" || k.startsWith("crm.")));
}

/**
 * AUDIT-CLASS X1: คนที่ถูก @กล่าวถึง "เห็นระเบียนนี้ได้ไหม" — คิดจาก Membership ที่ **ตอบรับแล้ว** ของเขาในร้านนี้
 * แล้วประเมิน where.ts (dealWhere/contactWhere/companyWhere) ในนามของเขา · ไม่ใช่สมาชิกร้าน/คำเชิญที่ยังไม่รับ/ร้านอื่น = ไม่เห็น
 * คืนเฉพาะ userId ที่เห็นจริง (ผู้เรียกแจ้งเตือนเฉพาะกลุ่มนี้ และเก็บเฉพาะกลุ่มนี้ลง `mentions[]`) — ไม่มีการสะท้อนคนที่เหลือ
 */
async function visibleMentions(db: Db, ctx: ActivitiesCtx, userIds: string[], t: Targets, selfId: string | null): Promise<string[]> {
  const ids = userIds.filter((u) => u !== selfId);
  if (ids.length === 0) return [];
  const ms = await db.membership.findMany({ where: { tenantId: ctx.tenantId, userId: { in: ids }, acceptedAt: { not: null } }, select: { userId: true, role: true, unitAccess: true, permissions: true } });
  const { toMemberActor } = await memberFacade();
  const out: string[] = [];
  for (const u of ids) {
    const m = ms.find((x) => x.userId === u);
    if (!m) continue;
    const who = toMemberActor(m.userId, m);
    if (!hasCrmAccess(who)) continue;
    let sees = false;
    if (t.dealId) sees = (await db.crmDeal.count({ where: { AND: [await dealWhere(ctx, who, { db }), { id: t.dealId }] } })) > 0;
    else if (t.contactId) sees = (await db.crmContact.count({ where: { AND: [await contactWhere(ctx, who, { db }), { id: t.contactId }] } })) > 0;
    else if (t.companyId) sees = (await companies.companyRefsInTx(db, coCtx(ctx), who, [t.companyId])).length > 0;
    else if (t.customRecordId) sees = (await db.customRecord.count({ where: await recordWhere(ctx, who, { recordId: t.customRecordId, db }) })) > 0;
    if (sees) out.push(u);
  }
  return out;
}

/** แจ้งเตือนในแอป (รายคน — recipientUserId ตั้งเสมอ · ไม่มีประกาศทั้งร้าน) · ไม่ใส่เนื้อโน้ต (X8) */
async function notifyMentions(tx: Tx, ctx: ActivitiesCtx, userIds: string[], t: Targets): Promise<void> {
  if (userIds.length === 0) return;
  const actorName = ctx.actorUserId
    ? ((await tx.user.findFirst({ where: { id: ctx.actorUserId }, select: { name: true } }))?.name ?? "เพื่อนร่วมทีม")
    : "ระบบ";
  const where = t.dealId ? "ดีล" : t.contactId ? "ผู้ติดต่อ" : t.companyId ? "บริษัท" : "รายการ";
  await tx.appNotification.createMany({
    data: userIds.map((u) => ({
      tenantId: ctx.tenantId,
      recipientUserId: u,
      title: "มีคนกล่าวถึงคุณในโน้ต CRM",
      body: `${actorName} กล่าวถึงคุณในโน้ตของ${where} — เปิดดูได้ในระบบ CRM`,
    })),
  });
}

// ═════════════════════════ บันทึกกิจกรรม ═════════════════════════

type NormalizedLog = {
  type: ActivityType;
  title: string;
  body: string | null;
  direction: CrmDirection | null;
  channel: string | null;
  startAt: Date | null;
  endAt: Date | null;
  durationSec: number | null;
  outcome: string | null;
  attendees: { userIds: string[]; contactIds: string[] } | null;
  location: string | null;
  dueAt: Date | null;
  remindAt: Date | null;
  done: boolean;
  priority: CrmPriority | undefined;
  pinned: boolean;
  mentions: string[];
  nextTask: { type: ActivityType; title: string; dueAt: Date } | null;
};

function normalizeLog(input: LogActivityInput, settings: unknown): NormalizedLog {
  if (!isObj(input)) throw fail("VALIDATION", "ข้อมูลกิจกรรมไม่ครบ — กรอกฟอร์มใหม่อีกครั้ง");
  const type = parseType(input.type);
  const title = cleanTitle(input.title);
  const body = cleanBody(input.body);
  const startAt = toDate(input.startAt, "เวลาเริ่ม");
  const endAt = toDate(input.endAt, "เวลาจบ");
  if (startAt && endAt && endAt.getTime() < startAt.getTime()) throw fail("VALIDATION", "เวลาจบต้องไม่ก่อนเวลาเริ่ม — ตรวจเวลาอีกครั้ง");
  const pinned = input.pinned === true;
  if (pinned && type !== "NOTE") throw fail("VALIDATION", "ปักหมุดได้เฉพาะโน้ต — เปลี่ยนชนิดเป็นโน้ตก่อนถ้าต้องการปักหมุด");
  const mentions = idList(input.mentions, ACTIVITY_MENTIONS_MAX, "การกล่าวถึง");
  if (mentions.length > 0 && type !== "NOTE") throw fail("VALIDATION", "@กล่าวถึงเพื่อนร่วมทีมได้เฉพาะในโน้ต — เปลี่ยนชนิดเป็นโน้ตก่อน");
  const att = input.attendees;
  const attendees = att && isObj(att)
    ? { userIds: idList(att.userIds, ACTIVITY_ATTENDEES_MAX, "ผู้เข้าร่วม"), contactIds: idList(att.contactIds, ACTIVITY_ATTENDEES_MAX, "ผู้เข้าร่วม") }
    : null;
  let nextTask: NormalizedLog["nextTask"] = null;
  if (input.nextTask !== undefined && input.nextTask !== null) {
    const n = input.nextTask;
    if (!isObj(n)) throw fail("VALIDATION", "งานถัดไปไม่ครบ — ใส่ชื่องานและวันครบกำหนด");
    const nType = parseType(n.type ?? "TASK", "ชนิดของงานถัดไป");
    const nTitle = cleanTitle(n.title, "ชื่องานถัดไป");
    const nDue = toDate(n.dueAt, "วันครบกำหนดของงานถัดไป");
    if (!nDue) throw fail("VALIDATION", "งานถัดไปต้องมีวันครบกำหนด — เลือกวันจากปฏิทิน");
    nextTask = { type: nType, title: nTitle, dueAt: nDue };
  }
  return {
    type,
    title,
    body,
    direction: parseDirection(input.direction),
    channel: cleanShort(input.channel, "ช่องทาง", ACTIVITY_CHANNEL_MAX),
    startAt,
    endAt,
    durationSec: parseDuration(input.durationSec),
    outcome: parseOutcome(input.outcome, type, settings),
    attendees,
    location: cleanShort(input.location, "สถานที่", ACTIVITY_LOCATION_MAX),
    dueAt: toDate(input.dueAt, "วันครบกำหนด"),
    remindAt: toDate(input.remindAt, "เวลาเตือน"),
    done: input.done === true,
    priority: parsePriority(input.priority),
    pinned,
    mentions,
    nextTask,
  };
}

/** ผู้ใช้/ผู้ติดต่อในรายชื่อผู้เข้าร่วมต้องเป็นของร้าน/ระบบนี้ — ของที่ไม่ใช่ถูกตัดทิ้ง (ไม่บอกว่ามีอยู่ที่อื่นไหม) */
async function scopeAttendees(ctx: ActivitiesCtx, a: MemberActor, att: NormalizedLog["attendees"]): Promise<NormalizedLog["attendees"]> {
  if (!att) return null;
  const users = att.userIds.length
    ? (await prisma.membership.findMany({ where: { tenantId: ctx.tenantId, userId: { in: att.userIds } }, select: { userId: true } })).map((m) => m.userId)
    : [];
  const contacts = att.contactIds.length
    ? (await prisma.crmContact.findMany({ where: { AND: [await contactWhere(ctx, a), { id: { in: att.contactIds } }] }, select: { id: true } })).map((c) => c.id)
    : [];
  return { userIds: att.userIds.filter((u) => users.includes(u)), contactIds: att.contactIds.filter((c) => contacts.includes(c)) };
}

/**
 * บันทึกกิจกรรม 1 รายการ (+ งานถัดไป) ใน tx เดียว — ดูสัญญาเต็มที่หัวข้อสอบ `qc-crm-c1.6`
 * AUDIT-CLASS X3: ล็อก บริษัท → ผู้ติดต่อ → ดีล ก่อนเขียน · lastActivityAt = GREATEST คำสั่งเดียว
 * AUDIT-CLASS X4: event ยิงใน tx เดียวกับแถว (เขียนไม่สำเร็จ = ไม่มี event · event ล้ม = ไม่มีแถว)
 */
export async function logActivity(ctx: ActivitiesCtx, actor: MemberActor, input: LogActivityInput): Promise<LogActivityResult> {
  const { a, settings } = await enter(ctx, actor);
  const v = normalizeLog(input, settings);
  const attendees = await scopeAttendees(ctx, a, v.attendees);
  const now = new Date();
  // AUDIT-CLASS X3: เวลาของกิจกรรม "ไม่มีวันอยู่ในอนาคต" (นัดล่วงหน้าไม่ทำให้ลูกค้าดูเหมือนเพิ่งคุยกัน)
  const at = new Date(Math.min((v.startAt ?? now).getTime(), now.getTime()));
  // มติผู้คุมงาน C1.6 S2: สิ่งที่ "เกิดขึ้นแล้ว" ไม่ใช่งานค้าง — โน้ต และการโทร/อีเมล/เข้าพบ/นัดพบที่เวลาเริ่มผ่านไปแล้ว
  //   บันทึกเป็นเสร็จทันที (doneAt = at) ⇒ ไม่ไปกองในรายการ "ค้างอยู่" · `done:true` ที่ผู้เรียกส่งมาเองยังยิง completed ตามเดิม
  const happened = v.type === "NOTE" || (HAPPENED_TYPES.includes(v.type) && !!v.startAt && v.startAt.getTime() <= now.getTime());
  const doneAt = v.done ? now : happened ? at : null;
  for (let attempt = 0; ; attempt += 1) {
    try {
      // มติผู้คุมงาน C1.6 S1: หาเป้าหมายใหม่ทุกรอบ — รอบก่อนเจอบริษัท/ผู้ติดต่อเปลี่ยนระหว่างรอล็อก ⇒ รอบนี้ล็อกตัวใหม่
      const pre = await resolveTargets(ctx, a, input ?? {});
      need(a, "crm.activity.create");
      const out = await prisma.$transaction(async (tx) => {
        // ลำดับล็อกของทั้งระบบ: แถว CrmCompany → แถว CrmContact → แถว CrmDeal (เรียง id ทุกชั้น)
        await companies.lockCompanyRowsInTx(tx, coCtx(ctx), [pre.companyId]);
        await lockRows(tx, ctx, "CrmContact", [pre.contactId]);
        await lockRows(tx, ctx, "CrmDeal", [pre.dealId]);
        // ได้ล็อกแล้วหาเป้าหมายใหม่ (READ COMMITTED · คำสั่งใหม่ = ภาพใหม่) — บริษัท/ผู้ติดต่อเปลี่ยนระหว่างรอ = เริ่ม tx ใหม่
        const t = await resolveTargets(ctx, a, input ?? {}, tx);
        if (t.companyId !== pre.companyId || t.contactId !== pre.contactId || t.dealId !== pre.dealId) throw new RelockNeeded();
        const mentions = v.mentions.length ? await visibleMentions(tx, ctx, v.mentions, t, a.userId) : [];
        const row = await tx.crmActivity.create({
          data: {
            ...identityScope(ctx),
            ...t,
            type: v.type as CrmActivityType,
            title: v.title,
            body: v.body,
            direction: v.direction,
            channel: v.channel,
            startAt: v.startAt,
            endAt: v.endAt,
            durationSec: v.durationSec,
            outcome: v.outcome,
            attendees: attendees ? (attendees as Prisma.InputJsonValue) : Prisma.DbNull,
            location: v.location,
            dueAt: v.dueAt,
            remindAt: v.remindAt,
            doneAt,
            completedById: doneAt ? a.userId : null,
            ...(v.priority ? { priority: v.priority } : {}),
            pinned: v.pinned,
            mentions,
            ownerUserId: a.userId,
            source: "MANUAL",
          },
        });
        let next: CrmActivity | null = null;
        if (v.nextTask) {
          next = await tx.crmActivity.create({
            data: { ...identityScope(ctx), ...t, type: v.nextTask.type as CrmActivityType, title: v.nextTask.title, dueAt: v.nextTask.dueAt, ownerUserId: a.userId, source: "MANUAL" },
          });
        }
        await touchLastActivity(tx, ctx, t, at);
        await notifyMentions(tx, ctx, mentions, t);
        await emitActivity(tx, ctx, EVT.logged, row);
        if (next) await emitActivity(tx, ctx, EVT.logged, next, { parentActivityId: row.id });
        if (v.done) await emitActivity(tx, ctx, EVT.completed, row);
        return { row, next };
      }, TX_OPTS);
      await audit(ctx, "crm.activity.log", out.row.id, {
        after: { type: out.row.type, dealId: out.row.dealId, contactId: out.row.contactId, companyId: out.row.companyId, customRecordId: out.row.customRecordId, nextTaskId: out.next?.id ?? null, mentions: out.row.mentions.length, pinned: out.row.pinned },
      });
      const dto = toActivityDto(out.row);
      const nextDto = out.next ? toActivityDto(out.next) : null;
      return { ...dto, nextTask: nextDto, nextTaskId: nextDto?.id ?? null };
    } catch (e) {
      if (e instanceof RelockNeeded) {
        if (attempt < 4) continue;
        throw fail("CONFLICT", RACE_MSG);
      }
      throw e;
    }
  }
}

// ═════════════════════════ ปิด / เลื่อน / แก้ / ปักหมุด / ลบ ═════════════════════════

/**
 * AUDIT-CLASS X3: ปิดครั้งเดียว — conditional update (`doneAt IS NULL`) ⇒ กดพร้อมกันกี่ทางก็มีคนชนะคนเดียว
 * และ event `crm.activity.completed` เกิดเฉพาะกับคนชนะ (ใน tx เดียวกัน) · ปิดแล้ว = no-op ไม่มี event
 */
async function completeInTx(tx: Tx, ctx: ActivitiesCtx, id: string, byUserId: string | null, outcome: string | null | undefined, via?: "KANBAN"): Promise<boolean> {
  const n = await tx.crmActivity.updateMany({
    where: { id, ...identityScope(ctx), doneAt: null },
    data: { doneAt: new Date(), completedById: byUserId, ...(outcome ? { outcome } : {}) },
  });
  if (n.count !== 1) return false;
  const row = await tx.crmActivity.findFirstOrThrow({ where: { id, ...identityScope(ctx) } });
  await emitActivity(tx, ctx, EVT.completed, row, via ? { via } : {});
  return true;
}

export async function completeActivity(ctx: ActivitiesCtx, actor: MemberActor, id: string, opts: { outcome?: string | null } = {}): Promise<ActivityDto> {
  const { a, settings } = await enter(ctx, actor);
  const row = await loadActivity(ctx, a, id);
  // มติผู้คุมงาน C1.6 S5: ปิดงานได้ทุกคนที่เห็นกิจกรรม **และ** มีสิทธิ์ crm.activity.complete
  if (!canDo(a, "crm.activity.complete")) throw fail("FORBIDDEN", "บัญชีนี้ยังไม่ได้รับสิทธิ์ปิดกิจกรรม — ขอให้เจ้าของร้านเปิดสิทธิ์ให้");
  const outcome = opts?.outcome ? parseOutcome(opts.outcome, row.type as ActivityType, settings) : null;
  const done = await prisma.$transaction((tx) => completeInTx(tx, ctx, row.id, a.userId, outcome), TX_OPTS);
  // AUDIT-CLASS X9: แถว audit ทุกครั้งที่คำสั่งสำเร็จ (ปิดแล้วอยู่ก่อน = บันทึกว่าเป็น no-op)
  await audit(ctx, "crm.activity.complete", row.id, { after: { done: true, changed: done, outcome: outcome && done ? "set" : null } });
  return toActivityDto(await loadActivity(ctx, a, row.id));
}

/** แก้/เลื่อนได้เฉพาะเจ้าของกิจกรรม หรือผู้จัดการ/เจ้าของร้าน (คนอื่นในทีม = FORBIDDEN) */
function assertEditor(a: MemberActor, row: CrmActivity, what: string): void {
  if (isManager(a) || row.ownerUserId === a.userId) return;
  throw fail("FORBIDDEN", `${what}ได้เฉพาะเจ้าของกิจกรรมหรือผู้จัดการ — ขอให้เจ้าของกิจกรรมหรือผู้จัดการช่วยดำเนินการ`);
}

export async function rescheduleActivity(ctx: ActivitiesCtx, actor: MemberActor, id: string, input: RescheduleInput): Promise<ActivityDto> {
  const { a } = await enter(ctx, actor);
  const row = await loadActivity(ctx, a, id);
  need(a, "crm.activity.create");
  assertEditor(a, row, "เลื่อนนัด/กำหนดส่ง");
  const data: Prisma.CrmActivityUpdateManyMutationInput = {};
  if (input && "dueAt" in input) data.dueAt = toDate(input.dueAt, "วันครบกำหนด");
  if (input && "startAt" in input) data.startAt = toDate(input.startAt, "เวลาเริ่ม");
  if (input && "endAt" in input) data.endAt = toDate(input.endAt, "เวลาจบ");
  if (Object.keys(data).length === 0) throw fail("VALIDATION", "ยังไม่ได้เลือกเวลาใหม่ — เลือกวันเวลาแล้วลองอีกครั้ง");
  const s = data.startAt !== undefined ? (data.startAt as Date | null) : row.startAt;
  const e = data.endAt !== undefined ? (data.endAt as Date | null) : row.endAt;
  if (s && e && e.getTime() < s.getTime()) throw fail("VALIDATION", "เวลาจบต้องไม่ก่อนเวลาเริ่ม — ตรวจเวลาอีกครั้ง");
  await prisma.crmActivity.updateMany({ where: { id: row.id, ...identityScope(ctx) }, data });
  await audit(ctx, "crm.activity.reschedule", row.id, { before: { dueAt: iso(row.dueAt), startAt: iso(row.startAt), endAt: iso(row.endAt) }, after: { dueAt: iso(data.dueAt as Date | null | undefined), startAt: iso(data.startAt as Date | null | undefined), endAt: iso(data.endAt as Date | null | undefined) } });
  return toActivityDto(await loadActivity(ctx, a, row.id));
}

/** แก้หัวเรื่อง/โน้ต/ผลลัพธ์/หมุด/การกล่าวถึง — ตรวจแบบเดียวกับตอนบันทึก · แก้แล้ว "ไม่แจ้งเตือนซ้ำ" คนที่เคยถูกกล่าวถึงแล้ว */
export async function updateActivity(ctx: ActivitiesCtx, actor: MemberActor, id: string, patch: UpdateActivityInput): Promise<ActivityDto> {
  const { a, settings } = await enter(ctx, actor);
  const row = await loadActivity(ctx, a, id);
  need(a, "crm.activity.create");
  assertEditor(a, row, "แก้ไขกิจกรรม");
  const type = row.type as ActivityType;
  const p = isObj(patch) ? patch : {};
  const data: Prisma.CrmActivityUpdateManyMutationInput = {};
  if ("title" in p) data.title = cleanTitle(p.title);
  if ("body" in p) data.body = cleanBody(p.body);
  if ("outcome" in p) data.outcome = parseOutcome(p.outcome, type, settings);
  if ("pinned" in p) {
    if (p.pinned === true && type !== "NOTE") throw fail("VALIDATION", "ปักหมุดได้เฉพาะโน้ต");
    data.pinned = p.pinned === true;
  }
  const wantMentions = "mentions" in p ? idList(p.mentions, ACTIVITY_MENTIONS_MAX, "การกล่าวถึง") : null;
  if (wantMentions && wantMentions.length > 0 && type !== "NOTE") throw fail("VALIDATION", "@กล่าวถึงเพื่อนร่วมทีมได้เฉพาะในโน้ต");
  const t: Targets = { contactId: row.contactId, companyId: row.companyId, dealId: row.dealId, customRecordId: row.customRecordId };
  await prisma.$transaction(async (tx) => {
    let fresh: string[] = [];
    if (wantMentions) {
      const kept = await visibleMentions(tx, ctx, wantMentions, t, a.userId);
      fresh = kept.filter((u) => !row.mentions.includes(u));
      data.mentions = kept;
    }
    if (Object.keys(data).length > 0) await tx.crmActivity.updateMany({ where: { id: row.id, ...identityScope(ctx) }, data });
    await notifyMentions(tx, ctx, fresh, t);
  }, TX_OPTS);
  await audit(ctx, "crm.activity.update", row.id, { after: { keys: Object.keys(data) } });
  return toActivityDto(await loadActivity(ctx, a, row.id));
}

/** ปักหมุด/ถอดหมุดโน้ต (มติ C19) — ชนิดอื่น = VALIDATION */
export async function setPinned(ctx: ActivitiesCtx, actor: MemberActor, id: string, pinned: boolean): Promise<ActivityDto> {
  const { a } = await enter(ctx, actor);
  const row = await loadActivity(ctx, a, id);
  if (row.type !== "NOTE") throw fail("VALIDATION", "ปักหมุดได้เฉพาะโน้ต — กิจกรรมชนิดอื่นแสดงตามเวลาในไทม์ไลน์");
  // มติผู้คุมงาน C1.6 S5: ปักหมุด/ถอดหมุดได้เฉพาะผู้เขียนโน้ต หรือผู้จัดการ/เจ้าของร้าน
  need(a, "crm.activity.create");
  assertEditor(a, row, "ปักหมุดโน้ต");
  const want = pinned === true;
  if (row.pinned !== want) {
    await prisma.crmActivity.updateMany({ where: { id: row.id, ...identityScope(ctx) }, data: { pinned: want } });
    await audit(ctx, want ? "crm.activity.pin" : "crm.activity.unpin", row.id, { before: { pinned: row.pinned }, after: { pinned: want } });
  }
  return toActivityDto(await loadActivity(ctx, a, row.id));
}

/**
 * AUDIT-CLASS X9: ลบกิจกรรม = ยืนยัน + เหตุผล ≥ 5 · ได้เฉพาะผู้จัดการ/เจ้าของร้าน หรือเจ้าของกิจกรรม · แถว audit เก็บเหตุผล
 */
export async function deleteActivity(ctx: ActivitiesCtx, actor: MemberActor, id: string, opts: DangerOpts): Promise<{ ok: true }> {
  const reason = reasonOf(opts, "ลบกิจกรรม");
  const { a } = await enter(ctx, actor);
  const row = await loadActivity(ctx, a, id);
  need(a, "crm.activity.delete");
  if (!isManager(a) && row.ownerUserId !== a.userId) {
    throw fail("FORBIDDEN", "ลบกิจกรรมได้เฉพาะเจ้าของกิจกรรมหรือผู้จัดการ — ขอให้ผู้จัดการช่วยลบให้");
  }
  await prisma.crmActivity.deleteMany({ where: { id: row.id, ...identityScope(ctx) } });
  await audit(ctx, "crm.activity.delete", row.id, {
    before: { type: row.type, dealId: row.dealId, contactId: row.contactId, companyId: row.companyId, ownerUserId: row.ownerUserId, doneAt: iso(row.doneAt) },
    after: { deleted: true, reason },
  });
  return { ok: true };
}

export async function getActivity(ctx: ActivitiesCtx, actor: MemberActor, id: string): Promise<ActivityDto> {
  const { a } = await enter(ctx, actor);
  return toActivityDto(await loadActivity(ctx, a, id));
}

// ═════════════════════════ อ่าน: รายการ · ปฏิทิน · โน้ต ═════════════════════════

async function userNames(ctx: ActivitiesCtx, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (list.length === 0) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: list }, memberships: { some: { tenantId: ctx.tenantId } } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name?.trim() || "ผู้ใช้"]));
}

/** ชื่อสำหรับแสดงของแถวชุดหนึ่ง — อ่านผ่าน where ของผู้ดู (มองไม่เห็น = null) */
async function enrich(ctx: ActivitiesCtx, a: MemberActor, rows: CrmActivity[]): Promise<ActivityListItem[]> {
  const dealIds = [...new Set(rows.map((r) => r.dealId).filter((x): x is string => !!x))];
  const contactIds = [...new Set(rows.map((r) => r.contactId).filter((x): x is string => !!x))];
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => !!x))];
  const [deals, contacts, cos, people] = await Promise.all([
    dealIds.length ? prisma.crmDeal.findMany({ where: { AND: [await dealWhere(ctx, a), { id: { in: dealIds } }] }, select: { id: true, title: true } }) : Promise.resolve([]),
    contactIds.length ? prisma.crmContact.findMany({ where: { AND: [await contactWhere(ctx, a), { id: { in: contactIds } }] }, select: { id: true, name: true } }) : Promise.resolve([]),
    companyIds.length ? companies.companyRefsInTx(prisma, coCtx(ctx), a, companyIds) : Promise.resolve([]),
    userNames(ctx, rows.map((r) => r.ownerUserId)),
  ]);
  const dm = new Map(deals.map((d) => [d.id, d.title]));
  const km = new Map(contacts.map((k) => [k.id, k.name]));
  const cm = new Map(cos.map((c) => [c.id, c.name]));
  return rows.map((r) => ({
    ...toActivityDto(r),
    dealTitle: r.dealId ? (dm.get(r.dealId) ?? null) : null,
    contactName: r.contactId ? (km.get(r.contactId) ?? null) : null,
    companyName: r.companyId ? (cm.get(r.companyId) ?? null) : null,
    ownerName: r.ownerUserId ? (people.get(r.ownerUserId) ?? null) : null,
  }));
}

/** ตัวกรองเป้าหมาย (ค่าที่ไม่ใช่ข้อความ = ไม่กรอง) — id ของร้าน/ระบบอื่นไม่มีวันผ่าน activityWhere อยู่แล้ว (ได้รายการว่าง) */
function targetFilter(input: { contactId?: unknown; companyId?: unknown; dealId?: unknown; customRecordId?: unknown }): Prisma.CrmActivityWhereInput {
  const w: Prisma.CrmActivityWhereInput = {};
  const k = str(input.contactId);
  const c = str(input.companyId);
  const d = str(input.dealId);
  const r = str(input.customRecordId);
  if (k) w.contactId = k;
  if (c) w.companyId = c;
  if (d) w.dealId = d;
  if (r) w.customRecordId = r;
  return w;
}

/** ช่วงสถานะตามเวลาไทย (+07:00): today = วันปฏิทินไทยของตอนนี้ · week = [วันนี้ 00:00 ไทย, +7 วัน) (มติผู้คุมงาน C1.6 ข้อ 1) */
function statusFilter(status: ActivityStatus | null, nowMs: number): Prisma.CrmActivityWhereInput {
  const d0 = new Date(thaiDayStartMs(nowMs));
  // มติผู้คุมงาน C1.6 S3: โน้ตไม่ใช่งาน (ไม่อยู่ในสถานะค้าง/วันนี้/สัปดาห์/เลยกำหนด) · เวลาอ้างอิง = COALESCE(dueAt, startAt)
  const open: Prisma.CrmActivityWhereInput = { doneAt: null, type: { not: "NOTE" } };
  const when = (range: Prisma.DateTimeNullableFilter): Prisma.CrmActivityWhereInput => ({ OR: [{ dueAt: range }, { dueAt: null, startAt: range }] });
  switch (status) {
    case "pending":
      return open;
    case "overdue":
      return { AND: [open, when({ lt: new Date(nowMs) })] };
    case "today":
      return { AND: [open, when({ gte: d0, lt: new Date(d0.getTime() + DAY_MS) })] };
    case "week":
      return { AND: [open, when({ gte: d0, lt: new Date(d0.getTime() + 7 * DAY_MS) })] };
    case "done":
      return { doneAt: { not: null } };
    default:
      return {};
  }
}

export async function listActivities(ctx: ActivitiesCtx, actor: MemberActor, input: ListActivitiesInput = {}): Promise<ActivityListResult> {
  const { a } = await enter(ctx, actor);
  const i = isObj(input) ? input : {};
  const status = i.status === undefined || i.status === null || i.status === ("" as ActivityStatus) ? null : i.status;
  if (status !== null && !(ACTIVITY_STATUSES as readonly string[]).includes(status)) throw fail("VALIDATION", "สถานะที่เลือกไม่อยู่ในรายการ — เลือกใหม่ (ค้าง · วันนี้ · 7 วัน · เลยกำหนด · เสร็จแล้ว)");
  const type = i.type ? parseType(i.type) : null;
  const from = toDate(i.from, "วันเริ่มของช่วง");
  const to = toDate(i.to, "วันสุดท้ายของช่วง");
  const pageSize = Math.max(1, Math.min(ACTIVITY_PAGE_MAX, Math.floor(Number(i.pageSize ?? ACTIVITY_PAGE_DEFAULT)) || ACTIVITY_PAGE_DEFAULT));
  const AND: Prisma.CrmActivityWhereInput[] = [await activityWhere(ctx, a), targetFilter(i), statusFilter(status, Date.now())];
  if (i.scope === "mine") AND.push({ ownerUserId: a.userId });
  // scope "team": ก่อน C1.7 ไม่มีทีมในการมองเห็น ⇒ เท่ากับทั้งระบบที่ actor เห็น (C1.7 แทนไส้ในที่ where.ts)
  if (type) AND.push({ type: type as CrmActivityType });
  if (from || to) {
    const range = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
    AND.push({ OR: [{ startAt: range }, { startAt: null, dueAt: range }] });
  }
  // มติผู้คุมงาน C1.6 S4: แบ่งหน้าด้วย (คีย์เรียง, id) เอง — ไม่ใช้ cursor ของ Prisma บนคอลัมน์ที่เป็น null ได้
  //   done → doneAt ↓ · มีสถานะอื่น → dueAt ↑ (null ท้ายสุด) · ไม่มีสถานะ → createdAt ↓ · ตัวตัดสินเสมอ = id ตามทิศเดียวกัน
  const key: SortKey = status === "done" ? "doneAt" : status ? "dueAt" : "createdAt";
  const dir: "asc" | "desc" = key === "dueAt" ? "asc" : "desc";
  const orderBy: Prisma.CrmActivityOrderByWithRelationInput[] =
    key === "dueAt" ? [{ dueAt: { sort: "asc", nulls: "last" } }, { id: "asc" }] : [{ [key]: dir }, { id: dir }];
  const cur = decodeCursor(i.cursor);
  if (cur) AND.push(afterCursor(key, dir, cur));
  const rows = await prisma.crmActivity.findMany({ where: { AND }, orderBy, take: pageSize + 1 });
  const page = rows.slice(0, pageSize);
  const last = page[page.length - 1];
  return { items: await enrich(ctx, a, page), nextCursor: rows.length > pageSize && last ? encodeCursor(last[key], last.id) : null };
}

type SortKey = "dueAt" | "doneAt" | "createdAt";
type Cursor = { at: Date | null; id: string };

function encodeCursor(at: Date | null, id: string): string {
  return Buffer.from(`${at ? at.toISOString() : "-"}|${id}`, "utf8").toString("base64url");
}

/** cursor เพี้ยน/ปลอม = เริ่มหน้าแรก (ไม่ error · ไม่ยิง id ของใครเข้า query ตรง ๆ) */
function decodeCursor(v: unknown): Cursor | null {
  if (typeof v !== "string" || !v || v.length > 200) return null;
  const raw = Buffer.from(v, "base64url").toString("utf8");
  const m = /^(-|\d{4}-\d{2}-\d{2}T[\d:.]+Z)\|([a-z0-9]{8,40})$/i.exec(raw);
  if (!m) return null;
  const at = m[1] === "-" ? null : new Date(m[1]!);
  if (at && !Number.isFinite(at.getTime())) return null;
  return { at, id: m[2]! };
}

/** แถวที่อยู่ "หลัง" cursor ตามลำดับ (key, id) — null ของ dueAt อยู่ท้ายสุดเสมอ */
function afterCursor(key: SortKey, dir: "asc" | "desc", c: Cursor): Prisma.CrmActivityWhereInput {
  if (key === "dueAt") {
    if (c.at === null) return { dueAt: null, id: { gt: c.id } };
    return { OR: [{ dueAt: { gt: c.at } }, { dueAt: c.at, id: { gt: c.id } }, { dueAt: null }] };
  }
  const at = c.at ?? new Date(0);
  return dir === "desc"
    ? { OR: [{ [key]: { lt: at } }, { [key]: at, id: { lt: c.id } }] }
    : { OR: [{ [key]: { gt: at } }, { [key]: at, id: { gt: c.id } }] };
}

/**
 * ปฏิทิน (ภาพ 08 ขวา · §3.8): กิจกรรม CRM ที่ (startAt ?? dueAt) อยู่ใน [from, to) · mine = ของฉัน · team = ทั้งทีม (ก่อน C1.7 = ทั้งระบบที่เห็น)
 * CRM C2.4 ▸ เพิ่มช่อง `appointments` = นัดของ **Party เดียวกัน** จากโมดูลจอง/คลินิก/โรงเรียน (อ่านอย่างเดียว) — รูป `items` เดิมไม่เปลี่ยน ◂
 */
export async function calendar(
  ctx: ActivitiesCtx,
  actor: MemberActor,
  input: CalendarInput,
): Promise<{ items: ActivityListItem[]; appointments: CalendarAppointment[]; appointmentsTruncated: boolean }> {
  const { a, settings } = await enter(ctx, actor);
  const from = toDate(input?.from, "วันเริ่มของปฏิทิน");
  const to = toDate(input?.to, "วันสุดท้ายของปฏิทิน");
  if (!from || !to) throw fail("VALIDATION", "เลือกช่วงวันของปฏิทินก่อน");
  if (to.getTime() <= from.getTime()) throw fail("VALIDATION", "วันสุดท้ายต้องอยู่หลังวันเริ่ม");
  if (to.getTime() - from.getTime() > CALENDAR_MAX_SPAN_DAYS * DAY_MS) throw fail("VALIDATION", `ดูปฏิทินได้ครั้งละไม่เกิน ${CALENDAR_MAX_SPAN_DAYS} วัน — เลือกช่วงให้สั้นลง`);
  const range = { gte: from, lt: to };
  const AND: Prisma.CrmActivityWhereInput[] = [await activityWhere(ctx, a), { OR: [{ startAt: range }, { startAt: null, dueAt: range }] }];
  if (input?.mine === true) AND.push({ ownerUserId: a.userId });
  const rows = await prisma.crmActivity.findMany({
    where: { AND },
    orderBy: [{ startAt: { sort: "asc", nulls: "last" } }, { dueAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    take: CALENDAR_MAX_ITEMS,
  });
  const merged = await mergedAppointments(ctx, a, settings, { from, to, mine: input?.mine === true });
  // `appointmentsTruncated` = ชนเพดานแถวนัด (F5) ⇒ หน้าจอบอกผู้ใช้ได้ว่ายังมีต่อ — ไม่ใช่ตัดทิ้งเงียบ ๆ
  return { items: await enrich(ctx, a, rows), appointments: merged.rows, appointmentsTruncated: merged.truncated };
}

// CRM C2.4 ▸ นัดจากโมดูลอื่นบนปฏิทิน CRM (มติผู้คุมงาน C2.4 ข้อ 8 · พิมพ์เขียว §3.8)
//   🔴 อ่านผ่าน **facade ของโมดูลต้นทาง** เท่านั้น (`booking/clinic/school` → `appointmentsByParty` · เส้น crm→booking/clinic/school
//      ใน ALLOWED_EDGES) — CRM ไม่แตะตาราง Appointment/ClinicVisit/SchoolEnrollment เอง และไม่มีทางเขียนอะไรกลับ
//   🔴 โหลดตอนใช้ (dynamic import): booking/service → pos → account → … → crm facade = วงโหลดถ้า import หัวไฟล์
//      (เหตุผลเดียวกับ `kanbanLinks` / `memberFacade` ข้างบน)
//   AUDIT-CLASS X1: ขอบเขต = Party ของ "ผู้ติดต่อที่ actor มองเห็น" (contactWhere) ∩ สาขาที่ actor ดูแล ∩ [from, to)
//     ⇒ พนักงานที่เห็นแต่ลูกค้าของตัวเองไม่มีวันเห็นนัดของลูกค้าคนอื่น · แถวของร้านอื่นที่ชี้ Party เดียวกันถูกตัดที่ facade (tenantId)
//   AUDIT-CLASS X8: DTO ไม่มีชื่อ/เบอร์ของลูกค้าจากโมดูลต้นทาง · คลินิกไม่มีอาการ/การวินิจฉัย/ค่ารักษา (ข้อมูลสุขภาพ)
//   R-E.14: ระบบที่ยัง uiVersion 1 = ไม่รวมอะไรเลย (หน้าจอ v2 ยังไม่เปิด ⇒ ไม่มีของใหม่โผล่)
const bookingFacade = () => import("@/lib/modules/booking");
const clinicFacade = () => import("@/lib/modules/clinic");
const schoolFacade = () => import("@/lib/modules/school");

/** สาขาที่ actor ดูแล — `"*"` = ทุกสาขา (OWNER · unitAccess ["*"] หรือ [] แบบเดียวกับ `visibility.ts`) */
function unitScopeOf(a: MemberActor): string[] | "*" {
  if (a.role === "OWNER" || a.unitAccess.length === 0 || a.unitAccess.includes("*")) return "*";
  return [...a.unitAccess];
}

async function mergedAppointments(
  ctx: ActivitiesCtx,
  a: MemberActor,
  settings: unknown,
  win: { from: Date; to: Date; mine: boolean },
): Promise<{ rows: CalendarAppointment[]; truncated: boolean }> {
  const none = { rows: [] as CalendarAppointment[], truncated: false };
  if (parseCrmSettings(settings).uiVersion !== 2) return none;
  /**
   * 🔴 มติผู้คุมงาน (รอบ 2 · ข้อ F6): **คีย์ API ไม่ได้นัดรวมเลย** (`appointments: []`)
   *    นัดเป็นของโมดูลจอง/คลินิก/โรงเรียน ซึ่งมี scope ของคีย์ตัวเอง — คีย์ที่ถือแค่ `crm.activity.read` ไม่ควรได้แถวของ
   *    คลินิก/คอร์สเรียนติดมาด้วยทางประตูหลังของ CRM · ระบบภายนอกที่ต้องใช้ ให้ถามโมดูลนั้นตรง ๆ ด้วยคีย์ของมัน
   *    (ผลข้างเคียงที่ตั้งใจ: `unitAccess ["*"]` ของคีย์จะไม่กลายเป็น "เห็นทุกสาขา" ในข้อมูลสุขภาพ/คอร์สเรียน)
   */
  if (isApiActor(a)) return none;
  const unitIds = unitScopeOf(a);
  if (Array.isArray(unitIds) && unitIds.length === 0) return none;
  const range = { from: win.from, to: win.to };
  const cap = CALENDAR_MAX_APPOINTMENTS;
  // ถาม "ช่วงเวลา" ก่อน (ไม่ส่งรายชื่อ Party) ⇒ เพดานอยู่ที่แถวนัด ไม่ใช่จำนวนลูกค้า (F5)
  const opts = { unitIds, take: cap + 1 };
  const lists = await Promise.all([
    readFacade("BOOKING", ctx, () => bookingFacade().then((m) => m.appointmentsByParty(ctx.tenantId, null, range, opts))),
    readFacade("CLINIC", ctx, () => clinicFacade().then((m) => m.appointmentsByParty(ctx.tenantId, null, range, opts))),
    readFacade("SCHOOL", ctx, () => schoolFacade().then((m) => m.appointmentsByParty(ctx.tenantId, null, range, opts))),
  ]);
  const all = lists.flat();
  if (all.length === 0) return none;
  // การมองเห็น: แถวจะอยู่บนปฏิทินก็ต่อเมื่อ Party ของมันมีผู้ติดต่อที่ actor **มองเห็น** (X1) · `mine` = เฉพาะผู้ติดต่อของฉัน
  const partyIds = [...new Set(all.map((r) => r.partyId).filter((x): x is string => typeof x === "string" && !!x))];
  const where = await contactWhere(ctx, a);
  const byParty = new Map<string, { id: string; name: string }>();
  for (let i = 0; i < partyIds.length; i += PARTY_LOOKUP_CHUNK) {
    const chunk = partyIds.slice(i, i + PARTY_LOOKUP_CHUNK);
    const contacts = await prisma.crmContact.findMany({
      where: { AND: [where, { partyId: { in: chunk } }, ...(win.mine ? [{ ownerUserId: a.userId }] : [])] },
      select: { id: true, name: true, partyId: true },
      orderBy: { id: "asc" },
    });
    // Party เดียวอาจมีผู้ติดต่อหลายคนในระบบเดียว — เรียงตาม id ให้ผลคงที่ (คนแรกที่เห็นชนะ)
    for (const c of contacts) if (c.partyId && !byParty.has(c.partyId)) byParty.set(c.partyId, { id: c.id, name: c.name });
  }
  if (byParty.size === 0) return none;
  const out: CalendarAppointment[] = [];
  for (const r of all) {
    const c = byParty.get(r.partyId);
    if (!c) continue;
    out.push({
      key: `${r.source}:${r.id}`,
      source: r.source,
      id: r.id,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt ? r.endAt.toISOString() : null,
      title: r.title,
      status: r.status,
      contactId: c.id,
      contactName: c.name,
      readOnly: true,
      href: `/app/sys/${ctx.systemId}/crm/contacts/${c.id}`,
    });
  }
  out.sort((x, y) => (x.startAt === y.startAt ? x.key.localeCompare(y.key) : x.startAt.localeCompare(y.startAt)));
  // ชนเพดาน = บอกออกมา (ต้นทางส่งมาเกิน cap หรือของที่มองเห็นเองเกิน cap)
  const truncated = lists.some((l) => l.length > cap) || out.length > cap;
  return { rows: truncated ? out.slice(0, cap) : out, truncated };
}

/** จำนวน Party ต่อคิวรีค้นผู้ติดต่อ (กัน `IN (...)` ยาวเกินไปเมื่อช่วงเวลามีนัดหลายพันแถว) */
const PARTY_LOOKUP_CHUNK = 500;

/**
 * อ่าน facade ของโมดูลอื่นแบบ "ล้มแล้วปฏิทินยังขึ้น" — แต่ **ไม่เงียบ** (ใบ C2.4 รอบ 2 · ข้อ N20)
 * 🔴 ของเดิมเป็น `.catch(() => [])` ล้วน: โมดูลจองพังทั้งวัน = ปฏิทินโชว์ "ไม่มีนัด" เนียน ๆ ไม่มีใครรู้
 *    ⇒ ล้ม = WARN ผ่าน logOps พร้อม **id ล้วน** (ชื่อโมดูล + ชนิด error) แล้วค่อยคืนรายการว่างของแหล่งนั้นแหล่งเดียว
 * AUDIT-CLASS X8: log ไม่มีชื่อ/เบอร์/ข้อมูลสุขภาพ — มีแค่ชื่อแหล่งกับชนิดข้อผิดพลาด
 */
async function readFacade(
  source: "BOOKING" | "CLINIC" | "SCHOOL",
  ctx: ActivitiesCtx,
  run: () => Promise<PartyAppointment[]>,
): Promise<PartyAppointment[]> {
  try {
    return await run();
  } catch (e) {
    await logOps("WARN", "crm.calendar", "อ่านนัดจากโมดูลอื่นไม่สำเร็จ — ปฏิทินแสดงเฉพาะแหล่งที่อ่านได้", {
      tenantId: ctx.tenantId,
      detail: `source:${source} system:${ctx.systemId} ${e instanceof Error ? e.name : "unknown"}`,
    });
    return [];
  }
}
// ◂ CRM C2.4

/** โน้ตของระเบียน (มติ C19): NOTE เท่านั้น · ที่ปักหมุดขึ้นก่อน แล้วใหม่สุดก่อน */
export async function listNotes(ctx: ActivitiesCtx, actor: MemberActor, target: NotesTarget): Promise<{ items: ActivityListItem[] }> {
  const { a } = await enter(ctx, actor);
  const f = targetFilter(isObj(target) ? target : {});
  if (Object.keys(f).length === 0) throw fail("VALIDATION", "เลือกก่อนว่าจะดูโน้ตของผู้ติดต่อ บริษัท ดีล หรือรายการไหน");
  const rows = await prisma.crmActivity.findMany({
    where: { AND: [await activityWhere(ctx, a), f, { type: "NOTE" }] },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: ACTIVITY_PAGE_MAX,
  });
  return { items: await enrich(ctx, a, rows) };
}

/** รายชื่อเพื่อนร่วมทีมที่ @กล่าวถึงได้ (สมาชิกที่ตอบรับแล้วของร้านนี้) — ใช้กับช่องเลือกในบล็อกโน้ต */
export async function mentionOptions(ctx: ActivitiesCtx, actor: MemberActor): Promise<MentionOption[]> {
  const { a } = await enter(ctx, actor);
  const ms = await prisma.membership.findMany({
    where: { tenantId: ctx.tenantId, acceptedAt: { not: null } },
    select: { userId: true, role: true, unitAccess: true, permissions: true, user: { select: { name: true } } },
    take: 500,
  });
  const { toMemberActor } = await memberFacade();
  // เฉพาะคนที่เข้าโมดูล CRM ได้ (คนอื่นเลือกไปก็ไม่ได้รับแจ้งเตือนอยู่ดี)
  return ms
    .filter((m) => m.userId !== a.userId && hasCrmAccess(toMemberActor(m.userId, m)))
    .map((m) => ({ id: m.userId, name: m.user?.name?.trim() || "ผู้ใช้" }))
    .sort((x, y) => x.name.localeCompare(y.name, "th"));
}

/** ทะเบียนผลลัพธ์ของระบบนี้ (ต่อชนิด) สำหรับชิปในฟอร์ม */
export async function outcomeOptions(ctx: ActivitiesCtx, actor: MemberActor): Promise<Partial<Record<ActivityType, string[]>>> {
  const { settings } = await enter(ctx, actor);
  const out: Partial<Record<ActivityType, string[]>> = {};
  for (const t of ACTIVITY_TYPES) {
    const reg = outcomeRegistry(settings, t);
    if (reg) out[t] = [...reg];
  }
  return out;
}

// ═════════════════════════ บอร์ดงาน ═════════════════════════

type KanbanActorLike = { userId: string; role: Role; unitAccess: string[]; permissions: Record<string, unknown> };
function kanbanActorOf(a: MemberActor): KanbanActorLike | null {
  if (a.role === "CUSTOMER") return null;
  return { userId: a.userId, role: a.role, unitAccess: a.unitAccess, permissions: a.permissions };
}

/** error จากโมดูลบอร์ดงาน → รหัสของเรา (404/403 ตาม `.status` · อย่างอื่นเป็นข้อความไทยของโมดูลนั้น) */
function mapKanbanError(e: unknown): unknown {
  if (e instanceof ActivitiesError) return e;
  const status = isObj(e) && typeof e.status === "number" ? e.status : 0;
  if (status === 404) return fail("NOT_FOUND", "ไม่พบบอร์ดงานนี้ในร้าน หรือบัญชีนี้ยังไม่ได้เป็นสมาชิกบอร์ด — เลือกบอร์ดอื่น");
  if (status === 403) return fail("FORBIDDEN", "บัญชีนี้ดูบอร์ดนี้ได้อย่างเดียว จึงเปิดการ์ดใหม่ไม่ได้ — ขอให้ผู้ดูแลบอร์ดเพิ่มสิทธิ์แก้ไข");
  if (e instanceof Error && /[ก-๙]/.test(e.message) && !(e instanceof Prisma.PrismaClientKnownRequestError)) return fail("VALIDATION", e.message);
  return e;
}

/**
 * เปิดการ์ดบอร์ดงานของกิจกรรม — ผ่าน **ประตูเดียว** `kanban/links.createCardFromExternal` (K3.x) เท่านั้น
 * sourceKey `crm:activity:<id>` ⇒ กดซ้ำ = การ์ดใบเดิม (`created:false`) · ลิงก์ DEAL/CRM_CONTACT/COMPANY/CUSTOM_RECORD ของกิจกรรม
 * แหล่งการ์ด (`KanbanCardSourceType`) = MANUAL — ค่าที่ใกล้ที่สุดที่มีอยู่: พนักงานกดเปิดเองจากหน้ากิจกรรม (มติผู้คุมงาน C1.6 ข้อ 8)
 * AUDIT-CLASS X1: บอร์ดต้องเป็นของร้านนี้ (ร้านอื่น = NOT_FOUND) และผู้กดต้องมีสิทธิ์แก้ไขบอร์ด (ด่านของประตูเอง)
 */
export async function openTaskCard(ctx: ActivitiesCtx, actor: MemberActor, input: OpenTaskCardInput): Promise<{ cardId: string; created: boolean }> {
  const { a } = await enter(ctx, actor);
  const row = await loadActivity(ctx, a, input?.activityId);
  need(a, "crm.activity.create");
  const boardId = str(input?.boardId);
  const kActor = kanbanActorOf(a);
  // มติผู้คุมงาน C1.6 B1: บอร์ดต้องผ่านด่านการมองเห็นของโมดูลบอร์ดงานเอง (`visibleBoardOptions` ← visibleBoardsWhere)
  //   บอร์ดลับ/บอร์ดสาขาอื่น/ร้านอื่น = NOT_FOUND (ไม่บอกว่ามีอยู่) · crm/** ไม่ query ตาราง KanbanBoard เอง
  const board = boardId && kActor ? ((await (await kanbanLinks()).visibleBoardOptions(ctx.tenantId, kActor, { boardId }))[0] ?? null) : null;
  if (!board) throw fail("NOT_FOUND", "ไม่พบบอร์ดงานนี้ หรือบัญชีนี้ยังมองไม่เห็นบอร์ดนี้ — เลือกบอร์ดอื่น");
  const links: { linkType: "DEAL" | "CRM_CONTACT" | "COMPANY" | "CUSTOM_RECORD"; linkId: string; role: "RELATED" }[] = [];
  if (row.dealId) links.push({ linkType: "DEAL", linkId: row.dealId, role: "RELATED" });
  if (row.contactId) links.push({ linkType: "CRM_CONTACT", linkId: row.contactId, role: "RELATED" });
  if (row.companyId) links.push({ linkType: "COMPANY", linkId: row.companyId, role: "RELATED" });
  if (row.customRecordId) links.push({ linkType: "CUSTOM_RECORD", linkId: row.customRecordId, role: "RELATED" });
  let res: { cardId: string; created: boolean };
  try {
    const L = await kanbanLinks();
    res = await L.createCardFromExternal(
      { tenantId: ctx.tenantId, systemId: board.systemId, actorUserId: a.userId, ...(kActor ? { actor: kActor } : {}) },
      {
        boardId: board.id,
        columnId: str(input?.columnId),
        title: row.title,
        dueAt: row.dueAt ?? row.startAt ?? null,
        sourceType: "MANUAL",
        sourceKey: `crm:activity:${row.id}`,
        links,
      },
    );
  } catch (e) {
    throw mapKanbanError(e);
  }
  if (row.kanbanCardId !== res.cardId) {
    await prisma.crmActivity.updateMany({ where: { id: row.id, ...identityScope(ctx) }, data: { kanbanCardId: res.cardId } });
    await audit(ctx, "crm.activity.card", row.id, { after: { kanbanCardId: res.cardId, boardId: board.id, created: res.created } });
  }
  return { cardId: res.cardId, created: res.created };
}

/**
 * ตัวรับ `kanban.card.completed` (ของแถมใต้ compose ใน outbox-consumers) — การ์ดที่ผูกกิจกรรมปิดแล้ว ⇒ ปิดกิจกรรมนั้น
 * AUDIT-CLASS X4: "ปักธงก่อน แล้วค่อยทำ" (H5) = conditional update `doneAt IS NULL` ใน tx เดียวกับ event
 *   ⇒ ส่งซ้ำ/ส่งพร้อมกันเป็นรอบแรก 6 ทาง ก็ปิดครั้งเดียว มี `crm.activity.completed` ใบเดียว · ปิดไปแล้ว = ไม่ทำอะไร
 * R-E.14: ระบบ CRM ที่ยังเป็น uiVersion 1 = ข้าม (แถวคงอยู่ รอเปิด v2)
 */
export async function onKanbanCardCompleted(evt: { tenantId: string; payload: unknown }): Promise<void> {
  const p = isObj(evt?.payload) ? evt.payload : {};
  const cardId = str(p.cardId);
  if (!cardId || typeof evt.tenantId !== "string") return;
  const rows = await prisma.crmActivity.findMany({ where: { tenantId: evt.tenantId, kanbanCardId: cardId, doneAt: null }, select: { id: true, systemId: true }, take: 50 });
  if (rows.length === 0) return;
  const systems = await prisma.appSystem.findMany({ where: { tenantId: evt.tenantId, type: "CRM", id: { in: [...new Set(rows.map((r) => r.systemId))] } }, select: { id: true, settings: true } });
  for (const r of rows) {
    const sys = systems.find((s) => s.id === r.systemId);
    if (!sys || parseCrmSettings(sys.settings).uiVersion !== 2) continue;
    // มติผู้คุมงาน C1.6 S5: ผู้ปิดการ์ดอาจไม่มีสิทธิ์เห็นกิจกรรม CRM นี้ ⇒ ไม่ยกเครดิตให้ใคร — completedById = null ·
    //   แหล่ง = KANBAN (ใน payload event `via` + แถว audit) · enum CrmActivitySource ไม่มีค่า KANBAN และใบนี้ไม่มี migration
    const ctx: ActivitiesCtx = { tenantId: evt.tenantId, systemId: r.systemId, actorUserId: null };
    const done = await prisma.$transaction((tx) => completeInTx(tx, ctx, r.id, null, null, "KANBAN"), TX_OPTS);
    if (done) await audit(ctx, "crm.activity.complete", r.id, { after: { done: true, via: "kanban", source: "KANBAN", kanbanCardId: cardId } });
  }
}

/** การ์ดบอร์ดงานของดีล (ดีล 360 · C1.6) — อ่านผ่าน `kanban/links.listCardsForTarget` ทุกระบบบอร์ดงานของร้าน (กรองบอร์ดที่ผู้ดูเห็นเอง) */
export async function dealKanbanCards(ctx: ActivitiesCtx, actor: MemberActor, dealId: string): Promise<DealKanbanCard[]> {
  // มติผู้คุมงาน C1.6 S6: ทางเข้าของตัวเอง — resolve ระบบใหม่ + ดีลต้องผ่าน dealWhere ของผู้ดู (ไม่พบ = NOT_FOUND)
  const { a } = await enter(ctx, actor);
  const did = str(dealId);
  const deal = did ? await prisma.crmDeal.findFirst({ where: { AND: [await dealWhere(ctx, a), { id: did }] }, select: { id: true } }) : null;
  if (!deal) throw fail("NOT_FOUND", TARGET_NOT_FOUND_MSG);
  const kActor = kanbanActorOf(a);
  if (!kActor) return [];
  const systems = await prisma.appSystem.findMany({ where: { tenantId: ctx.tenantId, type: "KANBAN" }, select: { id: true } });
  if (systems.length === 0) return [];
  const L = await kanbanLinks();
  const out: DealKanbanCard[] = [];
  for (const s of systems) {
    try {
      const cards = await L.listCardsForTarget({ tenantId: ctx.tenantId, systemId: s.id, actorUserId: a.userId }, kActor, { linkType: "DEAL", linkId: deal.id });
      for (const c of cards) out.push({ ...c, dueAt: c.dueAt ? c.dueAt.toISOString() : null });
    } catch (e) {
      // ระบบบอร์ดงานหนึ่งอ่านไม่ได้ไม่ควรทำให้หน้าดีลล่ม — แต่ต้องไม่เงียบ: WARN พร้อม id ล้วน (X8)
      await logOps("WARN", "crm.activities", "อ่านการ์ดบอร์ดงานของดีลไม่สำเร็จ", {
        tenantId: ctx.tenantId,
        detail: `deal:${deal.id} · kanbanSystem:${s.id} · ${e instanceof Error ? e.name : "unknown"}`,
      });
    }
  }
  return out;
}

// ═════════════════════════ ตัวเลือกของหน้าจอ ═════════════════════════

export type ActivityTargetOption = { kind: "CONTACT" | "DEAL" | "COMPANY"; id: string; name: string };

/** ค้นเป้าหมายของกิจกรรม (ผู้ติดต่อ · ดีล · บริษัท) ฝั่งเซิร์ฟเวอร์ — อ่านผ่าน where.ts ของ actor เท่านั้น (AUDIT-CLASS X1) */
export async function searchTargets(ctx: ActivitiesCtx, actor: MemberActor, q: string): Promise<ActivityTargetOption[]> {
  const { a } = await enter(ctx, actor);
  const s = typeof q === "string" ? q.trim().slice(0, 100) : "";
  if (s.length < 1) return [];
  const [ks, ds, cs] = await Promise.all([
    prisma.crmContact.findMany({ where: { AND: [await contactWhere(ctx, a), { archivedAt: null, name: { contains: s, mode: "insensitive" } }] }, select: { id: true, name: true }, take: 8, orderBy: { name: "asc" } }),
    prisma.crmDeal.findMany({ where: { AND: [await dealWhere(ctx, a), { title: { contains: s, mode: "insensitive" } }] }, select: { id: true, title: true }, take: 8, orderBy: { createdAt: "desc" } }),
    companies.companyOptions(coCtx(ctx), a, { q: s }).then((r) => r.slice(0, 5)),
  ]);
  return [
    ...ks.map((k) => ({ kind: "CONTACT" as const, id: k.id, name: k.name })),
    ...ds.map((d) => ({ kind: "DEAL" as const, id: d.id, name: d.title })),
    ...cs.map((c) => ({ kind: "COMPANY" as const, id: c.id, name: c.name })),
  ];
}

/** บอร์ดงานของร้าน (ที่ยังใช้งาน) สำหรับปุ่ม "เปิดการ์ดงาน" — สิทธิ์แก้ไขบอร์ดตรวจที่ประตู `createCardFromExternal` ตอนกดจริง */
export async function boardOptions(ctx: ActivitiesCtx, actor: MemberActor): Promise<{ id: string; name: string }[]> {
  // มติผู้คุมงาน C1.6 B1: เฉพาะบอร์ดที่ผู้ดูมองเห็นตามด่านของโมดูลบอร์ดงาน (ชื่อบอร์ดลับไม่หลุด)
  const { a } = await enter(ctx, actor);
  const kActor = kanbanActorOf(a);
  if (!kActor) return [];
  const rows = await (await kanbanLinks()).visibleBoardOptions(ctx.tenantId, kActor);
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

// CRM C1.8 ▸ กิจกรรมที่ "ระบบ" เขียนจากสะพาน (ฟอร์มเว็บ = WEB · ย้ายขั้นจากใบเสนอราคา = AUTO) — ผู้เขียน CrmActivity ที่เดียวของโมดูล
//   🔴 ไม่ยิง `crm.activity.logged` โดยตั้งใจ: สะพานเขียนไทม์ไลน์สมาชิกของเหตุการณ์ต้นทางเองแล้ว (ยิง = ไทม์ไลน์ซ้ำสองแถว)
//      เหมือนแถว AUTO ของ C1.3 (`companies.onCompanyCreated`)
//   ผู้เรียกถือ tx + ล็อกของตัวเอง (ธงของสะพาน) · ที่นี่เขียนแถว + lastActivityAt (GREATEST คำสั่งเดียว · AUDIT-CLASS X3)
//   AUDIT-CLASS X1: แถวผูกร้าน + ระบบของ ctx · id ของเป้าหมายมาจากบริการที่ resolve ใต้ขอบเขตเดียวกันแล้ว
//   AUDIT-CLASS X8: หัวเรื่องมาจากผู้เรียก (ไม่มีข้อมูลบุคคล) · audit เก็บแค่ชนิด/ที่มา/id
// CRM C2.5 ▸ เพิ่มชนิด/ที่มา `EMAIL` + `direction` — จดหมายเข้า/ออกของระบบอีเมล (`crm/emails.ts`) เขียนกิจกรรม
//   ผ่านตัวเขียนตัวเดียวกันนี้ (ไม่มีผู้เขียน CrmActivity ชุดที่สองในโมดูล) · ยังไม่ยิง `crm.activity.logged`
//   เหมือนแถวของสะพานอื่น (ไทม์ไลน์ของจดหมายมาจาก `crm.email.*` แล้ว — ยิงซ้ำ = สองแถวในไทม์ไลน์เดียว) ◂
export type SystemActivityInput = {
  type: "WEB" | "NOTE" | "EMAIL";
  source: "WEB" | "AUTO" | "EMAIL";
  /** กุญแจของเหตุการณ์ต้นทาง (ธงของสะพาน · ระบบอีเมลใช้ `CrmEmailMessage.id`) */
  sourceRef: string;
  title: string;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  /** CRM C2.5 ▸ ทิศทางของข้อความ (อีเมลเท่านั้น — สะพานอื่นไม่มีทิศทาง) ◂ */
  direction?: "IN" | "OUT" | null;
  at?: Date;
};

export async function recordSystemActivityInTx(tx: Tx, ctx: { tenantId: string; systemId: string }, input: SystemActivityInput): Promise<CrmActivity> {
  const c: ActivitiesCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  const now = new Date();
  const at = new Date(Math.min((input.at ?? now).getTime(), now.getTime()));
  const row = await tx.crmActivity.create({
    data: {
      ...identityScope(c),
      contactId: input.contactId,
      companyId: input.companyId,
      dealId: input.dealId,
      type: input.type as CrmActivityType,
      title: input.title.slice(0, 200),
      source: input.source,
      sourceRef: input.sourceRef,
      ...(input.direction ? { direction: input.direction, channel: "EMAIL" } : {}), // CRM C2.5 ◂
      startAt: at,
      doneAt: at,
    },
  });
  await touchLastActivity(tx, c, { contactId: input.contactId, companyId: input.companyId, dealId: input.dealId, customRecordId: null }, at);
  return row;
}

/** แถว audit ของกิจกรรมที่ระบบเขียน (เรียกหลัง tx ของผู้เรียก commit) */
export async function auditSystemActivity(ctx: { tenantId: string; systemId: string }, row: Pick<CrmActivity, "id" | "type" | "source" | "contactId" | "dealId" | "companyId">, via: string): Promise<void> {
  await audit({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null }, "crm.activity.log", row.id, {
    after: { type: row.type, source: row.source, contactId: row.contactId, dealId: row.dealId, companyId: row.companyId, via },
  });
}
// ◂ CRM C1.8

// CRM C2.2 ▸ งานติดตามที่ "ลำดับการติดตาม" สร้าง (ขั้น TASK · `sequences.ts#runDue`) — ผู้เขียน CrmActivity ที่เดียวของโมดูล
//   AUDIT-CLASS X4: กันซ้ำต่อ (enrollment, version, index) ด้วย sourceRef + advisory lock ของ sourceRef ใน tx เดียว
//     ⇒ ขั้นเดิมถูกทำซ้ำ (เครื่องดับหลังเขียนงาน ก่อนเลื่อนขั้น · lease หมดแล้วรอบใหม่หยิบ) ไม่มีงานแถวที่สอง
//   ยิง `crm.activity.logged` ใน tx เดียวกับแถว (งานเป็นกิจกรรมจริง — กฎ/ไทม์ไลน์เห็นเหมือนงานที่คนสร้าง) · source AUTO (ไม่ใช่ MANUAL)
//   AUDIT-CLASS X8: หัวเรื่องมาจากขั้นที่เจ้าของร้านเขียน · payload/audit มีแต่ id และชนิด
export type SequenceTaskInput = {
  sourceRef: string;
  type: string;
  title: string;
  body?: string | null;
  contactId: string;
  dealId: string | null;
  ownerUserId: string | null;
  dueAt: Date;
};

export async function createSequenceTaskOnce(ctx: { tenantId: string; systemId: string }, input: SequenceTaskInput): Promise<{ id: string; created: boolean }> {
  const c: ActivitiesCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  const out = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm.seq.task:${ctx.tenantId}:${input.sourceRef}`}, 0))`;
    const prior = await tx.crmActivity.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, contactId: input.contactId, sourceRef: input.sourceRef }, select: { id: true } });
    if (prior) return { id: prior.id, created: false, row: null as CrmActivity | null };
    const row = await tx.crmActivity.create({
      data: {
        ...identityScope(c),
        contactId: input.contactId,
        dealId: input.dealId,
        type: input.type as CrmActivityType,
        title: input.title.slice(0, ACTIVITY_TITLE_MAX),
        body: input.body ? input.body.slice(0, ACTIVITY_BODY_MAX) : null,
        ownerUserId: input.ownerUserId,
        dueAt: input.dueAt,
        source: "AUTO",
        sourceRef: input.sourceRef,
      },
    });
    await emitActivity(tx, c, EVT.logged, row, { via: "sequence" });
    return { id: row.id, created: true, row };
  });
  if (out.row) await audit(c, "crm.activity.log", out.row.id, { after: { type: out.row.type, source: out.row.source, contactId: out.row.contactId, dealId: out.row.dealId, via: "sequence" } });
  return { id: out.id, created: out.created };
}
// ◂ CRM C2.2

// CRM C2.4 ▸ กิจกรรม "แชท" 1 รายการต่อห้อง (สะพาน `crm-bridges/chat.ts` ตอนห้องถูกปิดเป็น RESOLVED) + ตัวแตะ lastActivityAt จากแชท
//   🔴 ผู้เขียน `CrmActivity` / `CrmContact.lastActivityAt` มีที่เดียวคือไฟล์นี้ — สะพานห้ามยิง prisma ใส่ตารางของ CRM เอง
//      (กติกาข้อ 6 ของ `crm-bridges/core.ts`) ⇒ สะพานเรียกสองฟังก์ชันนี้ผ่าน facade `@/lib/modules/crm`
//   AUDIT-CLASS X4: กันซ้ำ "ทั้งร้าน" ด้วย advisory lock ของห้อง + ตรวจการมีอยู่จาก (tenantId, source CHAT, sourceRef = conversationId)
//     ⇒ ส่ง event ซ้ำ · ยิงพร้อมกัน 10 ทาง · วนเปิด–ปิดห้องใหม่ = กิจกรรมใบเดียวตลอดไป (และ event `crm.activity.logged` ใบเดียว)
//     🔴 ตรวจ "ทั้งร้าน" ไม่ใช่แค่ระบบเดียว: Party ที่มีผู้ติดต่อในสองระบบ CRM ต้องไม่ได้กิจกรรมสองใบจากห้องเดียว
//   AUDIT-CLASS X8: หัวเรื่องมาจากค่าคงที่ของผู้เรียก (ไม่มีชื่อ/เบอร์/อีเมล/ข้อความแชท) · payload ของ event = id ล้วน
export type ChatActivityInput = {
  /** `ChatConversation.id` — ธงกันซ้ำ */
  conversationId: string;
  contactId: string;
  title: string;
  /** ช่องทางของห้อง (LINE · FB · เว็บ) — ป้ายของช่องทาง ไม่ใช่ข้อมูลบุคคล */
  channel?: string | null;
  at?: Date;
};

export async function createChatActivityOnce(ctx: { tenantId: string; systemId: string }, input: ChatActivityInput): Promise<{ id: string; created: boolean }> {
  const c: ActivitiesCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  const now = new Date();
  const at = new Date(Math.min((input.at ?? now).getTime(), now.getTime()));
  const out = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm.chat.activity:${ctx.tenantId}:${input.conversationId}`}, 0))`;
    const prior = await tx.crmActivity.findFirst({ where: { tenantId: ctx.tenantId, source: "CHAT", sourceRef: input.conversationId }, select: { id: true } });
    if (prior) return { id: prior.id, created: false, row: null as CrmActivity | null };
    const row = await tx.crmActivity.create({
      data: {
        ...identityScope(c),
        contactId: input.contactId,
        type: "CHAT" as CrmActivityType,
        title: input.title.slice(0, ACTIVITY_TITLE_MAX),
        channel: input.channel ? input.channel.slice(0, ACTIVITY_CHANNEL_MAX) : null,
        source: "CHAT",
        sourceRef: input.conversationId,
        startAt: at,
        doneAt: at,
      },
    });
    await touchLastActivity(tx, c, { contactId: input.contactId, companyId: null, dealId: null, customRecordId: null }, at);
    await emitActivity(tx, c, EVT.logged, row, { via: "chat" });
    return { id: row.id, created: true, row };
  }, TX_OPTS);
  if (out.row) await audit(c, "crm.activity.log", out.row.id, { after: { type: out.row.type, source: out.row.source, contactId: out.row.contactId, via: "chat" } });
  return { id: out.id, created: out.created };
}

/**
 * เขียน `aiSummary` ของกิจกรรมแชทที่ระบบเพิ่งสร้าง (ไม่มีคนในลูป ⇒ ไม่ใช่ข้อเสนอ · มติผู้คุมงาน C2.4 ข้อ 7)
 * AUDIT-CLASS X8: ข้อความสรุปอยู่ใน **แถวกิจกรรม** เท่านั้น — ไม่ลง event ไม่ลง audit ไม่ลง log
 * เขียนแบบมีเงื่อนไข (`aiSummary IS NULL`) ⇒ เรียกซ้ำไม่ทับของเดิม
 */
export async function setChatAiSummary(ctx: { tenantId: string; systemId: string }, activityId: string, summary: string): Promise<boolean> {
  const s = typeof summary === "string" ? summary.trim().slice(0, ACTIVITY_BODY_MAX) : "";
  if (!s) return false;
  const r = await prisma.crmActivity.updateMany({
    where: { id: activityId, tenantId: ctx.tenantId, systemId: ctx.systemId, source: "CHAT", aiSummary: null },
    data: { aiSummary: s },
  });
  return r.count === 1;
}

/**
 * ลูกค้าตอบกลับในแชท ⇒ `CrmContact.lastActivityAt := GREATEST(ค่าเดิม, now)` (ไม่สร้างกิจกรรมต่อข้อความ · ไม่ยิง event)
 * AUDIT-CLASS X3: คำสั่งเดียวต่อผู้ติดต่อ ⇒ ข้อความรัว ๆ / ส่งซ้ำ / ยิงพร้อมกัน ได้ค่าสูงสุดเสมอ ไม่มี lost update
 * AUDIT-CLASS X1: ผูกร้าน + ระบบของ ctx (id ของผู้ติดต่อมาจากคิวรีที่ผูกขอบเขตเดียวกันแล้ว)
 */
export async function touchContactsFromChat(ctx: { tenantId: string; systemId: string }, contactIds: string[], at: Date): Promise<number> {
  const ids = [...new Set((contactIds ?? []).filter((x): x is string => typeof x === "string" && !!x))].sort();
  if (ids.length === 0) return 0;
  const ts = new Date(Math.min(at.getTime(), Date.now())).toISOString();
  let n = 0;
  for (const id of ids) {
    n += await prisma.$executeRaw`UPDATE "CrmContact" SET "lastActivityAt" = GREATEST("lastActivityAt", (${ts}::timestamptz AT TIME ZONE 'UTC')) WHERE "id" = ${id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}`;
  }
  return n;
}
// ◂ CRM C2.4

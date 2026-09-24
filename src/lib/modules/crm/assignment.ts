// assignment.ts — มอบหมาย lead อัตโนมัติ (ใบ C2.3 · พิมพ์เขียว §5.7 §11.5 §11.6 · ภาพ 07 ขวา · มติ R1–R12 ของ crm-brief-C2.3)
//
// ── หน้าที่ ─────────────────────────────────────────────────────────────────────
//   • `pick` — ตัวเลือกผู้ดูแลของผู้ติดต่อใหม่ (แทน stub ของ C1.4 ทั้งไฟล์ · ผู้เรียก: contacts.ts insertContactInTx ใน tx ของตัวเอง)
//       1 ผู้ดูแลที่เลือกเอง ⇒ FIXED · 2 มีคนสร้างและไม่ได้ขอ "auto" ⇒ CREATOR (พฤติกรรม C1.4 เดิม) ·
//       3 ระบบยังเป็น uiVersion 1 ⇒ DISABLED (ไม่อ่านกฎ ไม่เขียนอะไร — R-E.14) · 4 กฎที่เปิดอยู่ตาม (sortOrder, id) —
//       กฎแรกที่เงื่อนไขตรง "ตัดสิน" (ไม่ไหลไปกฎถัดไป — R3) · 5 ไม่มีใครในกฎรับได้/ไม่มีกฎตรง ⇒ ผู้รับสำรองจาก settings ⇒ 6 NOBODY
//   • กฎ (สร้าง/แก้/เปิด-ปิด/ลบ/เรียงลำดับ) · ผู้รับสำรอง · `simulate` (ทำนายผลโดยไม่เขียนอะไร) · `openLoadOf` (คอลัมน์ "คิว" ของหน้า)
//
// ── กติกาที่ห้ามหัก ────────────────────────────────────────────────────────────
// 1) AUDIT-CLASS X1: ระบบ resolve ใหม่ทุกคำสั่ง (id + ร้าน + ชนิด CRM) · กฎของระบบอื่น/ร้านอื่น = NOT_FOUND ข้อความเดียวกับ id ที่ไม่มี ·
//    กฎอ้างผู้ใช้/ทีมนอกร้านไม่ได้ (ตรวจตอนบันทึก) · ผู้รับต้องเป็นสมาชิกที่ยอมรับแล้ว + มีคีย์ crm.contact.read ณ เวลาที่เลือก
//    (คนที่ถูกเอาออก/ยังไม่ยอมรับ/มองระเบียนไม่เห็น = ข้ามเอง — §11.6)
// 2) AUDIT-CLASS X3: round-robin เลื่อน cursor ด้วย UPDATE คำสั่งเดียว (`"rrCursor" = ("rrCursor" + 1) % n RETURNING`) — ไม่มี
//    read-modify-write ไม่มี mutex ใน JS (ยิงพร้อมกันคนละโพรเซสก็กระจายเท่ากัน) · กฎที่มีเพดาน/LEAST_OPEN ถือ advisory lock
//    ต่อระบบใน tx ของผู้เรียกก่อนนับงานค้าง ⇒ สร้างพร้อมกัน N รายการไม่มีวันเกินเพดาน
// 3) AUDIT-CLASS X9: ทุกการเปลี่ยนแปลงของกฎ/ผู้รับสำรองเขียน AuditLog `crm.assignment.*` · ลบกฎ = ยืนยัน + เหตุผล ≥ 5 ตัวอักษร
// 4) ลา HR อ่านผ่าน facade `@/lib/modules/hr` (`isOnLeave` · ใบลา APPROVED · วันไทย) — facade โหลดตอนใช้ (hr → บัญชี → crm = วงกลมตอนโหลด)
//    ทางสร้างผู้ติดต่ออ่าน "ใครลาอยู่" ก่อนเปิด tx (`leaveSnapshot`) ⇒ ใน tx ไม่ต้องยืม connection ที่สองจาก pool (pool เต็ม = ค้างกันเอง)
//    🔴 บังคับด้วยโค้ด (แก้ 24 ก.ย. 2569 · ข้อ S4 ของผู้ตรวจ): เมื่ออยู่ใน tx ของผู้เรียก `onLeave` **ไม่เรียก** facade HR และไม่เรียก
//    `logOps` เลย (ทั้งสองวิ่งบน client กลาง = คอนเนกชันที่สอง) — ตอบจาก snapshot ที่อ่านไว้ก่อนเปิด tx เท่านั้น · ไม่มีใน snapshot
//    = ถือว่า "ไม่ลา" (จดไว้ที่ `env.leaveGaps`) · คนที่เกินเพดาน snapshot ถูกเตือนไว้ใน logOps ตอนอ่าน snapshot (นอก tx)
// 5) ไม่มี event ใหม่ (crm.contact.assigned ตัวเดิม) · แจ้งเตือน "ไม่มีผู้ดูแล" มี id + ลิงก์เท่านั้น (ไม่มีชื่อ/เบอร์/อีเมลของลูกค้า — X8)
// 6) ข้อมูลของหน้า (`pageData`) เป็น "อ่านอย่างเดียว" และกันข้อเท็จจริงของคนอื่นไว้ 3 ชั้น (แก้ 24 ก.ย. 2569 · B1 · S1 · S6 · NOTE 1):
//    สถานะลาไปเฉพาะผู้ถือคีย์ `hr.leave.read` (ไม่ถือ = ไม่มีฟิลด์นั้นในก้อนข้อมูล) · เลข "คิว" นับผ่าน `visibleWhere` ของผู้ดู ·
//    ฟิลด์ที่เสนอให้ตั้งเงื่อนไขไม่มีฟิลด์ระบบ/อ่อนไหว · ชื่อพนักงานใช้ชื่อเท่านั้น (ไม่ส่งอีเมลออกไปฝั่ง client)

import { Prisma, type CrmAssignMode, type CrmAssignmentRule, type MemberSource, type Role } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { logOps } from "@/lib/core/ops";
import { evaluate } from "@/lib/core/rbac";
import * as party from "@/lib/modules/party";
import type * as HrFacade from "@/lib/modules/hr";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmCan, CrmForbiddenError, isApiActor } from "./access";
import { contactWhere, dealWhere } from "./where";
import { assertCrmV2 } from "./ui-version";
import { crmAssignmentSettingsOf, parseCrmSettings, setCrmAssignmentKey } from "./settings";
import {
  ASSIGN_CONDITION_FIELDS,
  ASSIGN_CUSTOM_FIELD_PREFIX,
  ASSIGN_CUSTOM_KEY_RE,
  ASSIGN_DELETE_REASON_MIN,
  ASSIGN_MAX_CONDITIONS,
  ASSIGN_MAX_OPEN_MAX,
  ASSIGN_MAX_OPEN_MIN,
  ASSIGN_MAX_USERS,
  ASSIGN_MODES,
  ASSIGN_OPS,
  ASSIGN_REASON_LABELS,
  ASSIGN_RULE_NAME_MAX,
  ASSIGN_SIMULATE_MAX_ROWS,
  type AssignCondition,
  type AssignConditions,
  type AssignMode,
  type AssignOp,
  type AssignReason,
} from "./assignment-shared";

/** facade HR โหลดตอนใช้ (hr/payroll → บัญชี → crm facade = วงกลมตอนโหลด · เหตุผลเดียวกับ member facade ใน contacts.ts) */
const hrFacade = (): Promise<typeof HrFacade> => import("@/lib/modules/hr");

// ───────────────────────── ชนิด ─────────────────────────

export type AssignmentCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
type Tx = Prisma.TransactionClient;
type Db = typeof prisma | Tx;

export type AssignmentDraft = {
  sourceKind?: MemberSource | null;
  sourceChannel?: string | null;
  /** ภาษาของลูกค้า (`CrmContact.locale`) — เงื่อนไข `language` · ทางสร้างจริงส่งมาจาก `contacts.ts` (ค่าที่จะลงคอลัมน์) */
  locale?: string | null;
  partyId?: string | null;
  companyId?: string | null;
  fields?: Record<string, unknown>;
  /**
   * ที่อยู่ที่ "พิมพ์เอง" — มีไว้ให้หน้าจอ "ทดลอง" เท่านั้น (เงื่อนไขจังหวัดจะตอบตรงกับของจริงได้)
   * ทางสร้างจริงไม่ส่งค่านี้: ที่อยู่มาจาก Party ของผู้ติดต่อ (ไม่มีก็ของบริษัท) เสมอ — ค่าใน Party ชนะทุกครั้ง
   */
  address?: string | null;
  /** ขนาดบริษัทที่ "เลือกเอง" — สำหรับหน้าจอ "ทดลอง" เท่านั้น · มี `companyId` = อ่านจากบริษัทจริงและค่านั้นชนะ */
  companySize?: string | null;
};

/** "ใครลาอยู่" ที่อ่านไว้ก่อนเปิด tx (userId → ลาอยู่ไหม) — คนที่ไม่อยู่ใน map ถูกถามสด */
export type AssignmentLeaveSnapshot = { at: Date; onLeave: ReadonlyMap<string, boolean> };

export type AssignmentPickInput = {
  /** ผู้ดูแลที่ผู้ใช้เลือกเอง (ผ่านการตรวจสมาชิกภาพของร้านแล้ว) */
  fixedOwnerUserId?: string | null;
  /** คนที่กดสร้าง/นำเข้า (null = งานที่ไม่มีคน เช่น ฟอร์มสาธารณะ/สะพานแชท) */
  creatorUserId?: string | null;
  /** ที่มาของการมอบหมายเมื่อไม่มีการเลือกเอง — บันทึกลง `assignedBy` */
  via?: "USER" | "IMPORT" | "API";
  /** true = ใช้กฎแม้มีคนสร้าง (`createContact({ ownerUserId: "auto" })`) */
  auto?: boolean;
  /** กฎที่ระบุเจาะจง (ร้าน + ระบบ + เปิดอยู่ · ไม่ตรง = ไม่สนใจ แล้วใช้กฎตามลำดับ) */
  ruleId?: string | null;
  draft?: AssignmentDraft;
  now?: Date;
  leave?: AssignmentLeaveSnapshot | null;
};

export type AssignmentPick = {
  ownerUserId: string | null;
  assignedBy: string | null;
  teamId: string | null;
  ruleId: string | null;
  reason: AssignReason;
};

export type AssignmentRuleDto = {
  id: string;
  name: string;
  mode: AssignMode;
  userIds: string[];
  teamId: string | null;
  maxOpenPerUser: number | null;
  conditions: AssignConditions;
  sortOrder: number;
  active: boolean;
};

export type RuleInput = {
  name: string;
  mode: CrmAssignMode | string;
  userIds?: string[] | null;
  teamId?: string | null;
  maxOpenPerUser?: number | null;
  conditions?: { mode?: string | null; items?: unknown[] | null } | null;
  active?: boolean | null;
};

export type AssignmentSimResult = { index: number; ownerUserId: string | null; teamId: string | null; ruleId: string | null; reason: AssignReason; reasonText: string };

export type AssignmentErrorCode = "VALIDATION" | "NOT_FOUND" | "FORBIDDEN" | "CRM_V2_DISABLED";
export class AssignmentError extends Error {
  readonly code: AssignmentErrorCode;
  constructor(code: AssignmentErrorCode, message: string) {
    super(message);
    this.name = "AssignmentError";
    this.code = code;
  }
}
const fail = (code: AssignmentErrorCode, message: string) => new AssignmentError(code, message);

const MANAGE_KEY = "crm.assignment.manage";
const READ_KEY = "crm.contact.read";
const SYSTEM_NOT_FOUND = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const RULE_NOT_FOUND = "ไม่พบกฎมอบหมายนี้ในระบบ CRM นี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่";
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const lockKey = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;

// ───────────────────────── เงื่อนไข ─────────────────────────

/** Json ที่เก็บ → เงื่อนไขที่มีชนิด (ค่าเพี้ยนถูกทิ้ง — กฎที่บันทึกผ่านบริการผ่านการตรวจแล้ว) */
function parseConditions(raw: unknown): AssignConditions {
  const obj = isObj(raw) ? raw : {};
  const items: AssignCondition[] = [];
  for (const it of Array.isArray(obj.items) ? obj.items : []) {
    if (!isObj(it)) continue;
    const field = str(it.field);
    const op = str(it.op) as AssignOp;
    if (!field || !(ASSIGN_OPS as readonly string[]).includes(op)) continue;
    const value = Array.isArray(it.value) ? it.value.map((x) => String(x ?? "").trim()).filter(Boolean) : String(it.value ?? "").trim();
    items.push({ field, op, value });
  }
  return { mode: obj.mode === "OR" ? "OR" : "AND", items };
}

function fieldProblem(field: string): string | null {
  if ((ASSIGN_CONDITION_FIELDS as readonly string[]).includes(field)) return null;
  if (field.startsWith(ASSIGN_CUSTOM_FIELD_PREFIX) && ASSIGN_CUSTOM_KEY_RE.test(field.slice(ASSIGN_CUSTOM_FIELD_PREFIX.length))) return null;
  return "เงื่อนไขนี้ใช้ช่องที่ระบบยังไม่รองรับ — เลือกช่องจากรายการ (ช่องทางที่มา · ช่องทางย่อย · จังหวัด · ขนาดบริษัท · ภาษา · ฟิลด์กำหนดเอง)";
}

/** ตรวจ + ปรับรูปเงื่อนไขที่ส่งมาจากหน้า/ผู้เรียก (VALIDATION ข้อความไทย) */
function cleanConditions(raw: unknown): AssignConditions {
  if (raw === undefined || raw === null) return { mode: "AND", items: [] };
  if (!isObj(raw)) throw fail("VALIDATION", "รูปแบบเงื่อนไขของกฎไม่ถูกต้อง — ตั้งเงื่อนไขใหม่จากหน้าตั้งค่า");
  const mode = raw.mode === undefined || raw.mode === null || raw.mode === "AND" ? "AND" : raw.mode === "OR" ? "OR" : null;
  if (!mode) throw fail("VALIDATION", "วิธีรวมเงื่อนไขต้องเป็น \"และ\" หรือ \"หรือ\"");
  const list = raw.items === undefined || raw.items === null ? [] : raw.items;
  if (!Array.isArray(list)) throw fail("VALIDATION", "รูปแบบเงื่อนไขของกฎไม่ถูกต้อง — ตั้งเงื่อนไขใหม่จากหน้าตั้งค่า");
  if (list.length > ASSIGN_MAX_CONDITIONS) throw fail("VALIDATION", `กฎหนึ่งใส่เงื่อนไขได้ไม่เกิน ${ASSIGN_MAX_CONDITIONS} ข้อ`);
  const items: AssignCondition[] = [];
  for (const it of list) {
    if (!isObj(it)) throw fail("VALIDATION", "รูปแบบเงื่อนไขของกฎไม่ถูกต้อง — ตั้งเงื่อนไขใหม่จากหน้าตั้งค่า");
    const field = str(it.field);
    const fp = fieldProblem(field);
    if (fp) throw fail("VALIDATION", fp);
    const op = str(it.op);
    if (!(ASSIGN_OPS as readonly string[]).includes(op)) throw fail("VALIDATION", "ตัวเปรียบเทียบของเงื่อนไขต้องเป็น เท่ากับ · ไม่เท่ากับ · เป็นหนึ่งใน · มีคำว่า");
    const values = (Array.isArray(it.value) ? it.value : op === "in" && typeof it.value === "string" ? it.value.split(",") : [it.value])
      .map((x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : ""))
      .filter(Boolean)
      .map((x) => x.slice(0, 200));
    if (values.length === 0) throw fail("VALIDATION", "เงื่อนไขข้อหนึ่งยังไม่มีค่าที่ใช้เทียบ — ใส่ค่าก่อนบันทึก");
    items.push({ field, op: op as AssignOp, value: op === "in" ? [...new Set(values)].slice(0, 50) : values[0] });
  }
  return { mode, items };
}

/** ค่าจริงของร่าง lead ต่อช่อง (โหลดตอนใช้ · แคชต่อร่าง) */
type DraftView = {
  draft: AssignmentDraft;
  address?: Promise<string | null>;
  company?: Promise<{ size: string | null; partyId: string | null } | null>;
};

function companyOf(env: Env, ctx: AssignmentCtx, view: DraftView): Promise<{ size: string | null; partyId: string | null } | null> {
  const cid = str(view.draft.companyId);
  if (!cid) return Promise.resolve(null);
  // AUDIT-CLASS X1: บริษัทของระบบนี้เท่านั้น
  view.company ??= env.db.crmCompany.findFirst({ where: { id: cid, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { size: true, partyId: true } });
  return view.company;
}

async function addressOf(env: Env, ctx: AssignmentCtx, view: DraftView): Promise<string | null> {
  view.address ??= (async () => {
    const own = str(view.draft.partyId);
    const read = async (pid: string) => (await party.getProfile(ctx.tenantId, pid, env.inTx ? (env.db as Tx) : undefined))?.address ?? null;
    const a = own ? await read(own) : null;
    if (a && a.trim()) return a;
    const co = await companyOf(env, ctx, view);
    const b = co?.partyId ? await read(co.partyId) : null;
    if (b && b.trim()) return b;
    // ที่อยู่ที่พิมพ์เองในหน้า "ทดลอง" (ทางสร้างจริงไม่ส่งค่านี้ — ของใน Party ชนะไปแล้วข้างบน)
    return str(view.draft.address) || null;
  })();
  return view.address;
}

async function actualOf(env: Env, ctx: AssignmentCtx, view: DraftView, field: string): Promise<string[]> {
  const d = view.draft;
  const one = (v: unknown): string[] => (typeof v === "string" && v.trim() ? [v.trim()] : typeof v === "number" || typeof v === "boolean" ? [String(v)] : []);
  if (field === "sourceKind") return one(d.sourceKind);
  if (field === "sourceChannel") return one(d.sourceChannel);
  if (field === "language") return one(d.locale).length > 0 ? one(d.locale) : ["th"];
  if (field === "companySize") {
    const size = one((await companyOf(env, ctx, view))?.size);
    return size.length > 0 ? size : one(d.companySize); // บริษัทจริงชนะ · ค่าที่พิมพ์เองใช้ได้แค่ตอน "ทดลอง"
  }
  if (field === "province") return one(await addressOf(env, ctx, view));
  if (field.startsWith(ASSIGN_CUSTOM_FIELD_PREFIX)) {
    const v = isObj(d.fields) ? d.fields[field.slice(ASSIGN_CUSTOM_FIELD_PREFIX.length)] : undefined;
    return Array.isArray(v) ? v.flatMap(one) : one(v);
  }
  return [];
}

async function itemMatches(env: Env, ctx: AssignmentCtx, view: DraftView, c: AssignCondition): Promise<boolean> {
  const actual = (await actualOf(env, ctx, view, c.field)).map((x) => x.toLowerCase());
  const values = (Array.isArray(c.value) ? c.value : [c.value]).map((x) => x.toLowerCase()).filter(Boolean);
  // จังหวัด = ข้อความอิสระของที่อยู่ ⇒ ทุกตัวเปรียบเทียบคือ "ที่อยู่มีคำนี้" (ไม่มีคอลัมน์จังหวัดแยก — R6)
  const contains = c.field === "province" || c.op === "contains";
  const hit = values.some((v) => actual.some((a) => (contains ? a.includes(v) : a === v)));
  return c.op === "neq" ? !hit : hit;
}

async function ruleMatches(env: Env, ctx: AssignmentCtx, view: DraftView, cond: AssignConditions): Promise<boolean> {
  if (cond.items.length === 0) return true;
  if (cond.mode === "OR") {
    for (const c of cond.items) if (await itemMatches(env, ctx, view, c)) return true;
    return false;
  }
  for (const c of cond.items) if (!(await itemMatches(env, ctx, view, c))) return false;
  return true;
}

// ───────────────────────── ผู้รับที่มีสิทธิ์ ─────────────────────────

type Env = {
  db: Db;
  inTx: boolean;
  now: Date;
  leave: Map<string, boolean>;
  /** คนที่อยู่ใน tx แล้วไม่มีคำตอบเรื่องลาใน snapshot (ถือว่าไม่ลา) — ไว้ให้ผู้เรียก/ผู้ตรวจเห็นช่องว่าง ไม่มีใครเขียนอะไรจากมัน */
  leaveGaps: Set<string>;
  /**
   * "ไม่ต้องคิดเรื่องลาเลย" (B1-bis · มติผู้คุมงาน 24 ก.ย.): ใช้กับการ **ทำนายให้ผู้ดูที่ไม่มีคีย์ `hr.leave.read`** เท่านั้น
   * (ป้าย "คิวถัดไป" และปุ่มทดลอง) — ถ้าคิดเรื่องลา คำตอบของมันจะบอกกลาย ๆ ว่าใครลาอยู่วันนี้
   * 🔴 ห้ามใช้กับการมอบหมายจริง (`pick`): ของจริงต้องข้ามคนที่ลาเสมอ
   */
  ignoreLeave?: boolean;
  /** โหมดทำนาย (`simulate` / ป้าย "คิวถัดไป"): ไม่เขียน cursor · นับงานที่ทำนายเพิ่ม */
  sim?: { cursors: Map<string, number>; extraLoad: Map<string, number> };
  loadLocked?: boolean;
};

/** snapshot ที่เก่ากว่านี้ไม่ถูกใช้ (ใบลาตัดสินเป็น "วันไทย" — ของเก่าเสี่ยงคนละวัน) */
const LEAVE_SNAPSHOT_MAX_AGE_MS = 10 * 60_000;
/** เพดานจำนวนคนที่อ่านสถานะลาไว้ก่อนเปิด tx (คนที่เกินถือว่าไม่ลา + เตือนใน logOps ตอนอ่าน — นอก tx) */
const LEAVE_SNAPSHOT_MAX_USERS = 300;

function envOf(db: Db | undefined, now: Date, leave?: AssignmentLeaveSnapshot | null, sim = false): Env {
  const map = new Map<string, boolean>();
  if (leave && Math.abs(leave.at.getTime() - now.getTime()) < LEAVE_SNAPSHOT_MAX_AGE_MS) for (const [k, v] of leave.onLeave) map.set(k, v);
  return { db: db ?? prisma, inTx: !!db && db !== prisma, now, leave: map, leaveGaps: new Set(), ...(sim ? { sim: { cursors: new Map(), extraLoad: new Map() } } : {}) };
}

async function onLeave(env: Env, tenantId: string, userId: string): Promise<boolean> {
  // B1-bis: โหมดทำนายของผู้ดูที่ไม่มีสิทธิ์ดูข้อมูลลา — ไม่ถาม ไม่ใช้ snapshot (คำตอบต้องไม่สะท้อนว่าใครลา)
  if (env.ignoreLeave) return false;
  const hit = env.leave.get(userId);
  if (hit !== undefined) return hit;
  // 🔴 กติกาข้อ 4: อยู่ใน tx ของผู้เรียก = ห้ามยืมคอนเนกชันที่สอง (facade HR และ logOps วิ่งบน client กลาง · tx ข้างนอกถือ
  //    คอนเนกชันค้างรอคิวของ query ข้างใน ⇒ ฟอร์มยิงเป็นชุด = pool หมดทั้งเครื่อง) ⇒ ตอบจาก snapshot ที่อ่านไว้ก่อนเปิด tx เท่านั้น
  if (env.inTx) {
    env.leave.set(userId, false);
    env.leaveGaps.add(userId);
    return false;
  }
  let v = false;
  try {
    v = await (await hrFacade()).isOnLeave(tenantId, userId, env.now);
  } catch {
    // อ่านใบลาไม่ได้ (ชั่วคราว) ⇒ ถือว่าไม่ลา — การมอบหมายไม่ควรล้มเพราะโมดูล HR · บันทึกไว้ให้ตามดู (id ล้วน · นอก tx เสมอ)
    await logOps("WARN", "crm", `มอบหมาย lead: อ่านสถานะลาของผู้ใช้ ${userId} ไม่ได้ — ถือว่าไม่ลา`, { tenantId });
  }
  env.leave.set(userId, v);
  return v;
}

/**
 * ผู้ดูคนนี้มีสิทธิ์เห็น "ข้อเท็จจริงเรื่องการลา" ของพนักงานร้านไหม (คีย์ `hr.leave.read` ของโมดูล HR · PDPA — ลาป่วยคือข้อมูลสุขภาพ)
 * ตัวตัดสินเดียวกับปฏิทินของร้าน (`calendar/service.ts`) ⇒ OWNER/MANAGER เห็น · STAFF เห็นเมื่อได้รับคีย์รายคน · คีย์ API ไม่เห็น
 * ใช้ 2 ที่: ฟิลด์ `onLeave` ของ `pageData` (B1) และ **โหมดทำนาย** ป้ายคิวถัดไป/ปุ่มทดลอง (B1-bis — คำตอบบอกใบ้ได้)
 */
function mayReadLeaveOf(actor: MemberActor): boolean {
  if (isApiActor(actor)) return false;
  return evaluate(
    { role: actor.role as Role, unitAccess: Array.isArray(actor.unitAccess) ? actor.unitAccess : [], permissions: isObj(actor.permissions) ? actor.permissions : {} },
    { module: "hr", action: "hr.leave.read" },
  );
}

/** AUDIT-CLASS X1: สมาชิกที่ยอมรับแล้วของร้านนี้ + มีคีย์อ่านผู้ติดต่อ (ผู้รับต้องมองเห็นระเบียนที่ได้รับ) */
async function readableMembers(db: Db, tenantId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.membership.findMany({ where: { tenantId, userId: { in: userIds }, acceptedAt: { not: null } }, select: { userId: true, role: true, permissions: true } });
  return new Set(rows.filter((m) => crmCan({ role: m.role, permissions: (isObj(m.permissions) ? m.permissions : {}) as Record<string, unknown> }, READ_KEY)).map((m) => m.userId));
}

/**
 * งานค้างของผู้ใช้ในระบบนี้ (R5): lead เปิด (LEAD · ไม่ UNQUALIFIED · ไม่เก็บถาวร/รวม) + ดีลที่ยังเปิด (ไม่เก็บถาวร)
 * `scope` = ขอบเขตการมองเห็นของ "ผู้ดูหน้าจอ" — ใส่เฉพาะเส้นของ `pageData` (AUDIT-CLASS X1: เลขคิวต้องไม่กว้างกว่าระเบียนที่
 * ผู้ดูเปิดได้เอง · ใต้นโยบาย OWN ผู้จัดการเคยเห็นตัวเลขของคนที่ตัวเองเปิดระเบียนไม่ได้) · ไม่ใส่ = งานค้าง "จริง" ของระบบ
 * ซึ่งเป็นสิ่งที่การตัดสิน (LEAST_OPEN · เพดาน) ต้องใช้ — การตัดสินห้ามขึ้นกับว่าใครกำลังดูอยู่
 */
async function loadsOf(
  db: Db,
  ctx: AssignmentCtx,
  userIds: string[],
  scope?: { contact: Prisma.CrmContactWhereInput; deal: Prisma.CrmDealWhereInput },
): Promise<Map<string, number>> {
  const out = new Map<string, number>(userIds.map((u) => [u, 0]));
  if (userIds.length === 0) return out;
  const mine = { tenantId: ctx.tenantId, systemId: ctx.systemId, ownerUserId: { in: userIds } };
  const c = await db.crmContact.groupBy({
    by: ["ownerUserId"],
    where: { AND: [...(scope ? [scope.contact] : []), { ...mine, lifecycleStage: "LEAD", leadStatus: { not: "UNQUALIFIED" }, archivedAt: null, mergedIntoId: null }] },
    _count: { _all: true },
  });
  const d = await db.crmDeal.groupBy({
    by: ["ownerUserId"],
    where: { AND: [...(scope ? [scope.deal] : []), { ...mine, kind: "OPEN", archivedAt: null }] },
    _count: { _all: true },
  });
  for (const g of [...c, ...d]) if (g.ownerUserId) out.set(g.ownerUserId, (out.get(g.ownerUserId) ?? 0) + g._count._all);
  return out;
}

type RuleRow = Pick<CrmAssignmentRule, "id" | "name" | "mode" | "userIds" | "teamId" | "maxOpenPerUser" | "rrCursor" | "conditions" | "sortOrder" | "active">;
const RULE_SELECT = { id: true, name: true, mode: true, userIds: true, teamId: true, maxOpenPerUser: true, rrCursor: true, conditions: true, sortOrder: true, active: true } as const;

/** ผู้สมัครตามลำดับ (R7): รายชื่อในกฎ (ตามที่เรียง) · ไม่มี = สมาชิกทีม (joinedAt, userId) · TEAM_LEAD = หัวหน้าทีม */
async function candidatesOf(env: Env, ctx: AssignmentCtx, rule: RuleRow): Promise<string[]> {
  const team = rule.teamId ? await env.db.team.findFirst({ where: { id: rule.teamId, tenantId: ctx.tenantId, archivedAt: null }, select: { id: true, leadUserId: true } }) : null;
  if (rule.mode === "TEAM_LEAD") {
    if (!team) return [];
    if (team.leadUserId) return [team.leadUserId];
    const lead = await env.db.teamMember.findFirst({ where: { tenantId: ctx.tenantId, teamId: team.id, role: "LEAD" }, orderBy: [{ joinedAt: "asc" }, { userId: "asc" }], select: { userId: true } });
    return lead ? [lead.userId] : [];
  }
  if (rule.userIds.length > 0) return [...new Set(rule.userIds)];
  if (!team) return [];
  const rows = await env.db.teamMember.findMany({ where: { tenantId: ctx.tenantId, teamId: team.id }, orderBy: [{ joinedAt: "asc" }, { userId: "asc" }], select: { userId: true } });
  return [...new Set(rows.map((r) => r.userId))];
}

/**
 * ทีมที่จะปั๊มลงระเบียน (`CrmContact.teamId`) — **เฉพาะเมื่อผู้รับงานเป็นคนของทีมนั้นจริง** (มีแถว `TeamMember` หรือเป็นหัวหน้าทีม)
 * 🔴 AUDIT-CLASS X1 (แก้ 24 ก.ย. 2569 · ข้อ S8): การมองเห็นระดับ TEAM อ่านจาก `teamId` ของแถว ⇒ กฎ `{teamId: T, userIds: [คนนอกทีม T]}`
 *    เคยทำให้สมาชิกทีม T ทุกคนอ่านลีดของคนนอกทีมได้ ขณะที่ทีมของผู้รับเองอ่านไม่ได้ · ไม่ใช่คนของทีม = ไม่ปั๊ม (ลีดเป็นของผู้รับคนเดียว)
 */
async function teamStampOf(env: Env, ctx: AssignmentCtx, teamId: string | null, ownerUserId: string): Promise<string | null> {
  const tid = str(teamId);
  if (!tid || !ownerUserId) return null;
  const row = await env.db.teamMember.findFirst({ where: { tenantId: ctx.tenantId, teamId: tid, userId: ownerUserId }, select: { userId: true } });
  if (row) return tid;
  // หัวหน้าทีมนับเป็นคนของทีมเสมอ (แถว TeamMember ของหัวหน้าอาจถูกลบมือ — `Team.leadUserId` คือแหล่งจริงอีกแหล่ง)
  const lead = await env.db.team.findFirst({ where: { id: tid, tenantId: ctx.tenantId, leadUserId: ownerUserId }, select: { id: true } });
  return lead ? tid : null;
}

/** เลือกผู้รับของกฎที่ตัดสิน — null = ไม่มีใครรับได้ */
async function chooseFromRule(env: Env, ctx: AssignmentCtx, rule: RuleRow): Promise<string | null> {
  const cands = await candidatesOf(env, ctx, rule);
  if (cands.length === 0) return null;
  const members = await readableMembers(env.db, ctx.tenantId, cands);
  // ปิดรับ lead: แถวของทีมในกฎ · กฎไม่มีทีม = แถวทีมใดก็ได้ของร้าน (R4)
  const closed = new Set(
    (await env.db.teamMember.findMany({
      // S2 (รอบ 3): กฎที่ระบุรายชื่อเอง ⇒ แถว "ปิดรับ lead" **ทีมไหนก็นับ** (คนนอกทีมของกฎก็ปิดรับของตัวเองได้) ·
      //   กฎที่ใช้ทีม (รวม TEAM_LEAD) ⇒ ดูแถวของทีมนั้น (R4 เดิม)
      where: { tenantId: ctx.tenantId, userId: { in: cands }, acceptingLeads: false, ...(rule.teamId && rule.userIds.length === 0 ? { teamId: rule.teamId } : {}) },
      select: { userId: true },
    })).map((r) => r.userId),
  );
  const pre = cands.filter((u) => members.has(u) && !closed.has(u));
  const needLoad = rule.maxOpenPerUser !== null || rule.mode === "LEAST_OPEN";
  const available: string[] = [];
  for (const u of pre) {
    if (await onLeave(env, ctx.tenantId, u)) continue;
    available.push(u);
    if (!needLoad && rule.mode !== "ROUND_ROBIN") break; // FIXED/TEAM_LEAD: คนแรกที่ว่างพอ
  }
  if (available.length === 0) return null;

  let loads = new Map<string, number>();
  if (needLoad) {
    // AUDIT-CLASS X3: เพดาน/LEAST_OPEN — คิวเดียวต่อระบบใน tx ของผู้เรียก ⇒ การสร้างพร้อมกันเห็นงานที่อีกคนเพิ่งเขียนเสมอ
    if (env.inTx && !env.sim && !env.loadLocked) {
      await lockKey(env.db as Tx, `crm:assign-load:${ctx.systemId}`);
      env.loadLocked = true;
    }
    loads = await loadsOf(env.db, ctx, available);
    if (env.sim) for (const [u, n] of env.sim.extraLoad) if (loads.has(u)) loads.set(u, (loads.get(u) ?? 0) + n);
  }
  const eligible = rule.maxOpenPerUser !== null ? available.filter((u) => (loads.get(u) ?? 0) < (rule.maxOpenPerUser as number)) : available;
  if (eligible.length === 0) return null;

  if (rule.mode === "LEAST_OPEN") {
    let best = eligible[0];
    for (const u of eligible) if ((loads.get(u) ?? 0) < (loads.get(best) ?? 0)) best = u;
    return best;
  }
  if (rule.mode === "ROUND_ROBIN") {
    const n = eligible.length;
    if (env.sim) {
      const v = env.sim.cursors.get(rule.id) ?? rule.rrCursor;
      env.sim.cursors.set(rule.id, (v + 1) % n);
      return eligible[((v % n) + n) % n];
    }
    // AUDIT-CLASS X3: cursor เลื่อนด้วยคำสั่งเดียว (ไม่มี read-modify-write) — ค่าที่ได้คืนคือตำแหน่งถัดไป ⇒ คนของรอบนี้ = ก่อนหน้า 1 ช่อง
    const rows = await env.db.$queryRaw<{ rrCursor: number }[]>`
      UPDATE "CrmAssignmentRule" SET "rrCursor" = ("rrCursor" + 1) % ${n}::int
      WHERE "id" = ${rule.id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}
      RETURNING "rrCursor"`;
    if (rows.length === 0) return null;
    const next = Number(rows[0].rrCursor);
    return eligible[(((next - 1) % n) + n) % n];
  }
  return eligible[0]; // FIXED · TEAM_LEAD
}

// ───────────────────────── pick ─────────────────────────

async function systemRow(db: Db, ctx: AssignmentCtx): Promise<{ settings: Prisma.JsonValue } | null> {
  if (!str(ctx?.tenantId) || !str(ctx?.systemId)) return null;
  return db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { settings: true } });
}

async function activeRules(db: Db, ctx: AssignmentCtx, ruleId?: string | null): Promise<RuleRow[]> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId, active: true };
  const rid = str(ruleId);
  if (rid) {
    // AUDIT-CLASS X1: กฎที่ระบุต้องเป็นของร้าน + ระบบนี้ + เปิดอยู่ — ไม่ใช่ = ไม่สนใจ (ใช้กฎตามลำดับ)
    const one = await db.crmAssignmentRule.findFirst({ where: { ...scope, id: rid }, select: RULE_SELECT });
    if (one) return [one];
  }
  return db.crmAssignmentRule.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: RULE_SELECT });
}

async function decide(ctx: AssignmentCtx, input: AssignmentPickInput, env: Env, preloaded?: { settings: Prisma.JsonValue; rules: RuleRow[] }): Promise<AssignmentPick & { ruleName?: string }> {
  const fixed = str(input?.fixedOwnerUserId);
  const creator = str(input?.creatorUserId);
  const via = input?.via;
  // 1–2: พฤติกรรม C1.4 เดิมทุกตัวอักษร
  if (fixed) return { ownerUserId: fixed, assignedBy: creator ? `USER:${creator}` : via === "IMPORT" ? "IMPORT" : via === "API" ? "API" : null, teamId: null, ruleId: null, reason: "FIXED" };
  if (creator && input?.auto !== true) return { ownerUserId: creator, assignedBy: via === "IMPORT" ? "IMPORT" : `USER:${creator}`, teamId: null, ruleId: null, reason: "CREATOR" };
  const sys = preloaded ?? (await systemRow(env.db, ctx));
  if (!sys) throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
  // 3: R-E.14 — ระบบ uiVersion 1 ไม่ใช้กฎ (แถวกฎคงไว้ · กลับเป็น 2 = ทำงานต่อ)
  if (parseCrmSettings(sys.settings).uiVersion !== 2) return { ownerUserId: null, assignedBy: null, teamId: null, ruleId: null, reason: "DISABLED" };
  const rules = preloaded?.rules ?? (await activeRules(env.db, ctx, input?.ruleId));
  const view: DraftView = { draft: isObj(input?.draft) ? (input.draft as AssignmentDraft) : {} };
  // 4: กฎแรกที่เงื่อนไขตรงเป็นผู้ตัดสิน (R3 — ไม่ไหลไปกฎถัดไป)
  for (const rule of rules) {
    if (!(await ruleMatches(env, ctx, view, parseConditions(rule.conditions)))) continue;
    const owner = await chooseFromRule(env, ctx, rule);
    if (owner) {
      if (env.sim) env.sim.extraLoad.set(owner, (env.sim.extraLoad.get(owner) ?? 0) + 1);
      // AUDIT-CLASS X1: ปั๊มทีมเฉพาะเมื่อผู้รับเป็นคนของทีมนั้นจริง (S8)
      const teamId = await teamStampOf(env, ctx, rule.teamId ?? null, owner);
      return { ownerUserId: owner, assignedBy: `RULE:${rule.id}`, teamId, ruleId: rule.id, reason: "RULE", ruleName: rule.name };
    }
    break;
  }
  // 5: ผู้รับสำรอง (สมาชิก + มองเห็นได้ · ไม่ดูลา/เพดาน — ทางสุดท้าย R4)
  const fb = crmAssignmentSettingsOf(sys.settings).fallbackUserId;
  if (fb && (await readableMembers(env.db, ctx.tenantId, [fb])).has(fb)) {
    if (env.sim) env.sim.extraLoad.set(fb, (env.sim.extraLoad.get(fb) ?? 0) + 1);
    return { ownerUserId: fb, assignedBy: "RULE:fallback", teamId: null, ruleId: null, reason: "FALLBACK" };
  }
  // 6: ไม่มีใคร — ผู้เรียก (ทางสร้างผู้ติดต่อ) แจ้งเจ้าของร้าน/ผู้จัดการ
  return { ownerUserId: null, assignedBy: null, teamId: null, ruleId: null, reason: "NOBODY" };
}

/**
 * เลือกผู้ดูแลของผู้ติดต่อใหม่ — ผู้เรียกในทางสร้างผู้ติดต่อส่ง `db` = tx ของตัวเอง (cursor/เพดานอยู่ใน tx เดียวกับแถวใหม่ ·
 * tx ถอย = cursor ถอยด้วย) · เรียกเดี่ยว ๆ (ไม่มี db) = ใช้ client ของโมดูล
 * คืน `assignedBy` รูป "USER:{id}" | "RULE:{id}" | "RULE:fallback" | "API" | "IMPORT" | null
 */
export async function pick(ctx: AssignmentCtx, input: AssignmentPickInput, db?: Tx): Promise<AssignmentPick> {
  const env = envOf(db, input?.now instanceof Date ? input.now : new Date(), input?.leave);
  const r = await decide(ctx, input ?? {}, env);
  return { ownerUserId: r.ownerUserId, assignedBy: r.assignedBy, teamId: r.teamId, ruleId: r.ruleId, reason: r.reason };
}

/**
 * "ใครลาอยู่" ของผู้สมัครทุกคนในกฎที่เปิดอยู่ + ผู้รับสำรอง — อ่าน **ก่อน** ผู้เรียกเปิด tx (ทางสร้างผู้ติดต่ออัตโนมัติ)
 * ระบบ uiVersion 1 / ไม่มีกฎ = null (ไม่อ่านอะไรเพิ่ม) · อ่านไม่ได้ = null + WARN ⇒ รอบนั้น `pick` **ไม่ข้ามคนที่ลา**
 * (ใน tx ถามสดไม่ได้ — กติกาข้อ 4 ห้ามยืมคอนเนกชันที่สอง) · เรียก `pick` เดี่ยว ๆ นอก tx ยังถามสดเองได้
 */
export async function leaveSnapshot(ctx: AssignmentCtx, now: Date = new Date()): Promise<AssignmentLeaveSnapshot | null> {
  try {
    const sys = await systemRow(prisma, ctx);
    if (!sys || parseCrmSettings(sys.settings).uiVersion !== 2) return null;
    const rules = await activeRules(prisma, ctx);
    const users = new Set<string>();
    const teamIds = new Set<string>();
    for (const r of rules) {
      for (const u of r.userIds) users.add(u);
      if (r.teamId && (r.userIds.length === 0 || r.mode === "TEAM_LEAD")) teamIds.add(r.teamId);
    }
    if (teamIds.size > 0) {
      const tm = await prisma.teamMember.findMany({ where: { tenantId: ctx.tenantId, teamId: { in: [...teamIds] } }, select: { userId: true } });
      for (const t of tm) users.add(t.userId);
      const leads = await prisma.team.findMany({ where: { tenantId: ctx.tenantId, id: { in: [...teamIds] } }, select: { leadUserId: true } });
      for (const t of leads) if (t.leadUserId) users.add(t.leadUserId);
    }
    const fb = crmAssignmentSettingsOf(sys.settings).fallbackUserId;
    if (fb) users.add(fb);
    if (users.size === 0) return { at: now, onLeave: new Map() };
    const env = envOf(undefined, now);
    const list = [...users].slice(0, LEAVE_SNAPSHOT_MAX_USERS);
    if (users.size > list.length) {
      // นอก tx เสมอ (ที่นี่ปลอดภัยที่จะเขียน log) — คนที่เกินเพดานจะถูกถือว่า "ไม่ลา" ตอนตัดสินใน tx
      await logOps("WARN", "crm", `มอบหมาย lead: ผู้สมัครในกฎมี ${users.size} คน เกินเพดานที่อ่านสถานะลาไว้ล่วงหน้า (${list.length}) — คนที่เกินถือว่าไม่ลา`, { tenantId: ctx.tenantId });
    }
    for (let i = 0; i < list.length; i += 4) await Promise.all(list.slice(i, i + 4).map((u) => onLeave(env, ctx.tenantId, u)));
    return { at: now, onLeave: env.leave };
  } catch {
    // 🔴 อ่านล่วงหน้าไม่ได้ (HR ล่ม/คิวรีล้ม ชั่วคราว) ⇒ คืน null แล้วให้ตัดสินต่อโดยไม่มีข้อมูลลา — รอบนั้น "จะไม่ข้ามคนที่ลา"
    //    ที่นี่อยู่นอก tx เสมอ จึงเขียน log ได้ · id ล้วน ไม่มีข้อมูลบุคคล · log ล้มเองก็ห้ามทำให้ลีดหล่น (มติผู้คุมงาน 24 ก.ย. ข้อ 3)
    await logOps("WARN", "crm", `มอบหมาย lead: อ่านสถานะลาล่วงหน้าของระบบ ${ctx?.systemId ?? "-"} ไม่ได้ — รอบนี้จะไม่ข้ามคนที่ลา`, { tenantId: ctx?.tenantId }).catch(() => {});
    return null;
  }
}

/**
 * แจ้งเตือน "lead ใหม่ยังไม่มีผู้ดูแล" (NOBODY บนทางอัตโนมัติ) — 1 แถวต่อ OWNER/MANAGER ที่ยอมรับแล้ว ใน tx ของผู้สร้างผู้ติดต่อ
 * (ผู้ติดต่อสร้างครั้งเดียว ⇒ แจ้งครั้งเดียวต่อผู้ติดต่อ — X4) · AUDIT-CLASS X8: มีแต่ลิงก์ + id (ไม่มีชื่อ/เบอร์/อีเมล)
 */
export async function notifyUnassigned(db: Tx, ctx: AssignmentCtx, contactId: string): Promise<number> {
  // S3 (รอบ 3): ร้านที่ยัง **ไม่ได้ตั้งกฎมอบหมายเลย** ไม่ได้ "ทำลีดหล่น" — นั่นคือวิธีทำงานปกติของร้าน (ผู้ดูแลว่างไว้ แล้วแจกเอง)
  //   ⇒ ไม่ต้องรบกวนเจ้าของร้าน/ผู้จัดการทุกใบ · มีกฎแล้วแต่ไม่มีใครรับได้/ไม่มีกฎไหนตรง = ยังแจ้งเหมือนเดิม
  if ((await db.crmAssignmentRule.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, active: true } })) === 0) return 0;
  const recips = await db.membership.findMany({ where: { tenantId: ctx.tenantId, role: { in: ["OWNER", "MANAGER"] }, acceptedAt: { not: null } }, select: { userId: true } });
  const ids = [...new Set(recips.map((r) => r.userId))];
  if (ids.length === 0) return 0;
  const link = `/app/sys/${ctx.systemId}/crm/contacts/${contactId}`;
  await db.appNotification.createMany({
    data: ids.map((uid) => ({
      tenantId: ctx.tenantId,
      recipientUserId: uid,
      title: "lead ใหม่ยังไม่มีผู้ดูแล",
      body: `ไม่มีพนักงานในกฎมอบหมายที่รับงานได้ตอนนี้ (ลา · ปิดรับ · เต็มเพดาน) — เปิดเพื่อมอบหมายเอง: ${link}`,
    })),
  });
  return ids.length;
}

// ───────────────────────── ทางเข้าจัดการ (ระบบ → uiVersion → คีย์) ─────────────────────────

async function resolveSystem(ctx: AssignmentCtx): Promise<void> {
  // AUDIT-CLASS X1: ctx.systemId ต้องเป็นระบบ CRM ของร้านนี้จริง — ไม่พบ = NOT_FOUND (ไม่ใช่ FORBIDDEN)
  if (!(await systemRow(prisma, ctx))) throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
}

async function enter(ctx: AssignmentCtx, actor: MemberActor | null | undefined): Promise<MemberActor> {
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
  await resolveSystem(ctx);
  await assertCrmV2(ctx);
  if (!crmCan(actor, MANAGE_KEY)) throw new CrmForbiddenError(MANAGE_KEY);
  return actor;
}

/** ด่านเดียวกับบริการ — server action/หน้า เรียกก่อนทุกอย่าง */
export async function assertAssignmentAccess(ctx: AssignmentCtx, actor: MemberActor | null | undefined): Promise<MemberActor> {
  return enter(ctx, actor);
}

/**
 * AUDIT-CLASS X9 (รอบ 3 · S5): แถว AuditLog `crm.assignment.*` เขียน **ใน tx เดียวกับการเปลี่ยนแปลง** — กฎเปลี่ยนแล้ว
 * ประวัติหายไม่ได้ (เดิม mutation commit ไปแล้ว ส่วน audit เป็นคำสั่งแยกที่ล้มเงียบได้ ⇒ "ใครเปลี่ยนกฎ" หาย)
 * แบบเดียวกับ `visibility.ts#auditInTx` ของใบ C1.7 (ตัวเขียน AuditLog ตัวเดียวกันของโมดูล ไม่ใช่เอนจินที่สอง)
 */
async function auditInTx(tx: Tx, ctx: AssignmentCtx, action: string, targetType: string, targetId: string, body: { before?: unknown; after?: unknown } = {}): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorType: ctx.actorUserId ? "USER" : "SYSTEM",
      actorId: ctx.actorUserId ?? null,
      action: `crm.assignment.${action}`,
      targetType,
      targetId,
      ...(body.before !== undefined ? { before: body.before as Prisma.InputJsonValue } : {}),
      ...(body.after !== undefined ? { after: body.after as Prisma.InputJsonValue } : {}),
    },
  });
}

async function audit(ctx: AssignmentCtx, action: string, targetType: string, targetId: string, body: { before?: unknown; after?: unknown } = {}): Promise<void> {
  // AUDIT-CLASS X9: ทุกการเปลี่ยนแปลง = AuditLog `crm.assignment.*` (ไม่มีข้อมูลบุคคลของลูกค้า — มีแต่ id ผู้ใช้/ทีม)
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? null,
    actorType: ctx.actorUserId ? "USER" : "SYSTEM",
    action: `crm.assignment.${action}`,
    targetType,
    targetId,
    ...body,
  });
}

async function loadRule(ctx: AssignmentCtx, id: unknown): Promise<RuleRow> {
  const rid = str(id);
  // AUDIT-CLASS X1: กฎของร้านอื่น/ระบบอื่น = ไม่พบ (ข้อความเดียวกับ id ที่ไม่มี — ไม่บอกว่ามีอยู่)
  const row = rid ? await prisma.crmAssignmentRule.findFirst({ where: { id: rid, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: RULE_SELECT }) : null;
  if (!row) throw fail("NOT_FOUND", RULE_NOT_FOUND);
  return row;
}

const toDto = (r: RuleRow): AssignmentRuleDto => ({
  id: r.id,
  name: r.name,
  mode: r.mode,
  userIds: [...r.userIds],
  teamId: r.teamId ?? null,
  maxOpenPerUser: r.maxOpenPerUser ?? null,
  conditions: parseConditions(r.conditions),
  sortOrder: r.sortOrder,
  active: r.active,
});

type CleanRule = { name: string; mode: CrmAssignMode; userIds: string[]; teamId: string | null; maxOpenPerUser: number | null; conditions: AssignConditions; active: boolean };

/**
 * AUDIT-CLASS X1 (รอบ 3 · S1): เงื่อนไข `f.<key>` ที่ชี้ **ฟิลด์อ่อนไหว** หรือ **ฟิลด์ระบบ/คอลัมน์ที่บริการเป็นเจ้าของ** = ปฏิเสธตอนบันทึก
 * เดิมตรวจแต่รูปคีย์ (R6) ⇒ กฎอย่าง `f.<ฟิลด์อ่อนไหว>` ถูกบันทึกได้ และ `actualOf` อ่านค่าจาก bag ของ `fields` จริง
 * (= ใช้ข้อมูลอ่อนไหวของลูกค้าตัดสินการมอบหมาย โดยไม่มีด่านสิทธิ์ของฟิลด์นั้นเลย) · คีย์ที่ร้าน "ยังไม่มี" ยังอนุญาตตาม R6
 */
async function assertConditionFieldKeys(ctx: AssignmentCtx, actor: MemberActor, conds: AssignConditions): Promise<void> {
  const keys = [...new Set(conds.items.filter((i) => i.field.startsWith(ASSIGN_CUSTOM_FIELD_PREFIX)).map((i) => i.field.slice(ASSIGN_CUSTOM_FIELD_PREFIX.length)))];
  if (keys.length === 0) return;
  const governed = (await import("@/lib/modules/member")).fields.GOVERNED_CRM_SYSTEM_KEYS.contact;
  const allowed = new Set((await conditionFieldsOf(ctx, actor)).map((f) => f.key));
  const rows = await prisma.memberField.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey: "contact", key: { in: keys } },
    select: { key: true, isSystem: true },
  });
  const known = new Map(rows.map((r) => [r.key, r]));
  for (const k of keys) {
    const row = known.get(k);
    const bad = governed.has(k) || row?.isSystem === true || (row !== undefined && !allowed.has(k));
    if (bad) throw fail("VALIDATION", "เงื่อนไขนี้ใช้ช่องที่ตั้งเป็นเงื่อนไขไม่ได้ (ช่องของระบบ หรือช่องข้อมูลอ่อนไหว) — เลือกช่องจากรายการ");
  }
}

/** AUDIT-CLASS X1: ตรวจทุกช่องของกฎ — ผู้ใช้/ทีมต้องเป็นของร้านนี้ (VALIDATION ข้อความไทยที่ไม่โทษผู้ใช้ · ไม่เขียนอะไร) */
async function cleanRule(ctx: AssignmentCtx, actor: MemberActor, input: RuleInput): Promise<CleanRule> {
  const v = isObj(input) ? input : ({} as RuleInput);
  const name = str(v.name).replace(/\s+/g, " ");
  if (!name) throw fail("VALIDATION", "ตั้งชื่อกฎก่อนบันทึก (เช่น \"lead จากฟอร์มเว็บ\")");
  if (name.length > ASSIGN_RULE_NAME_MAX) throw fail("VALIDATION", `ชื่อกฎยาวได้ไม่เกิน ${ASSIGN_RULE_NAME_MAX} ตัวอักษร`);
  const mode = str(v.mode);
  if (!(ASSIGN_MODES as readonly string[]).includes(mode)) throw fail("VALIDATION", "วิธีแจกต้องเป็น คนแรกที่ว่าง · วนตามคิว · หัวหน้าทีม · คนที่งานค้างน้อยสุด");
  if (v.userIds !== undefined && v.userIds !== null && !Array.isArray(v.userIds)) throw fail("VALIDATION", "รายชื่อผู้รับไม่ถูกต้อง — เลือกใหม่จากรายการ");
  const userIds = [...new Set((v.userIds ?? []).map((u) => str(u)).filter(Boolean))];
  if (userIds.length > ASSIGN_MAX_USERS) throw fail("VALIDATION", `กฎหนึ่งใส่ผู้รับได้ไม่เกิน ${ASSIGN_MAX_USERS} คน`);
  if (userIds.length > 0) {
    const found = await prisma.membership.findMany({ where: { tenantId: ctx.tenantId, userId: { in: userIds } }, select: { userId: true } });
    if (new Set(found.map((f) => f.userId)).size !== userIds.length) throw fail("VALIDATION", "มีรายชื่อผู้รับที่ไม่ได้อยู่ในร้านนี้แล้ว — เลือกผู้รับใหม่จากรายการ");
  }
  const teamId = str(v.teamId) || null;
  if (teamId && !(await prisma.team.findFirst({ where: { id: teamId, tenantId: ctx.tenantId, archivedAt: null }, select: { id: true } })))
    throw fail("VALIDATION", "ไม่พบทีมที่เลือกในร้านนี้ (อาจถูกเก็บถาวร) — เลือกทีมใหม่จากรายการ");
  if (mode === "TEAM_LEAD" && !teamId) throw fail("VALIDATION", "แจกให้หัวหน้าทีมต้องเลือกทีมก่อน");
  if (mode !== "TEAM_LEAD" && userIds.length === 0 && !teamId) throw fail("VALIDATION", "กฎนี้ยังไม่มีผู้รับ — เลือกพนักงานอย่างน้อย 1 คน หรือเลือกทีม");
  let maxOpenPerUser: number | null = null;
  if (v.maxOpenPerUser !== undefined && v.maxOpenPerUser !== null && !(typeof v.maxOpenPerUser === "string" && !str(v.maxOpenPerUser))) {
    const n = Number(v.maxOpenPerUser);
    if (!Number.isInteger(n) || n < ASSIGN_MAX_OPEN_MIN || n > ASSIGN_MAX_OPEN_MAX)
      throw fail("VALIDATION", `เพดานงานค้างต่อคนต้องเป็นจำนวนเต็ม ${ASSIGN_MAX_OPEN_MIN}–${ASSIGN_MAX_OPEN_MAX.toLocaleString("en-US")} (เว้นว่าง = ไม่จำกัด)`);
    maxOpenPerUser = n;
  }
  const conditions = cleanConditions(v.conditions);
  await assertConditionFieldKeys(ctx, actor, conditions); // S1 (รอบ 3)
  return { name, mode: mode as CrmAssignMode, userIds: mode === "TEAM_LEAD" ? [] : userIds, teamId, maxOpenPerUser, conditions, active: v.active === undefined || v.active === null ? true : v.active === true };
}

const auditShape = (r: { name: string; mode: string; userIds: string[]; teamId: string | null; maxOpenPerUser: number | null; active: boolean; conditions: unknown }) => ({
  name: r.name,
  mode: r.mode,
  userIds: r.userIds,
  teamId: r.teamId,
  maxOpenPerUser: r.maxOpenPerUser,
  active: r.active,
  conditions: parseConditions(r.conditions).items.map((i) => `${i.field}:${i.op}`),
});

export async function listRules(ctx: AssignmentCtx, actor: MemberActor): Promise<AssignmentRuleDto[]> {
  await enter(ctx, actor);
  const rows = await prisma.crmAssignmentRule.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: RULE_SELECT });
  return rows.map(toDto);
}

export async function createRule(ctx: AssignmentCtx, actor: MemberActor, input: RuleInput): Promise<AssignmentRuleDto> {
  await enter(ctx, actor);
  const v = await cleanRule(ctx, actor, input);
  // S5: กฎใหม่ + แถวประวัติ อยู่ใน tx เดียว (ลำดับ sortOrder อ่านใน tx เดียวกับที่เขียน)
  const row = await prisma.$transaction(async (tx) => {
    const max = await tx.crmAssignmentRule.aggregate({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, _max: { sortOrder: true } });
    const created = await tx.crmAssignmentRule.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        name: v.name,
        mode: v.mode,
        userIds: v.userIds,
        teamId: v.teamId,
        maxOpenPerUser: v.maxOpenPerUser,
        conditions: v.conditions as unknown as Prisma.InputJsonValue,
        active: v.active,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
      select: RULE_SELECT,
    });
    await auditInTx(tx, ctx, "rule.create", "CrmAssignmentRule", created.id, { after: auditShape(created) });
    return created;
  });
  return toDto(row);
}

export async function updateRule(ctx: AssignmentCtx, actor: MemberActor, id: string, patch: Partial<RuleInput>): Promise<AssignmentRuleDto> {
  await enter(ctx, actor);
  const cur = await loadRule(ctx, id);
  const p = isObj(patch) ? patch : {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k) && (p as Record<string, unknown>)[k] !== undefined;
  const merged: RuleInput = {
    name: has("name") ? (p.name as string) : cur.name,
    mode: has("mode") ? (p.mode as string) : cur.mode,
    userIds: has("userIds") ? (p.userIds ?? []) : cur.userIds,
    teamId: has("teamId") ? (p.teamId ?? null) : cur.teamId,
    maxOpenPerUser: has("maxOpenPerUser") ? (p.maxOpenPerUser ?? null) : cur.maxOpenPerUser,
    conditions: has("conditions") ? p.conditions : (parseConditions(cur.conditions) as RuleInput["conditions"]),
    active: has("active") ? p.active : cur.active,
  };
  const v = await cleanRule(ctx, actor, merged);
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.crmAssignmentRule.update({
      where: { id: cur.id },
      data: { name: v.name, mode: v.mode, userIds: v.userIds, teamId: v.teamId, maxOpenPerUser: v.maxOpenPerUser, conditions: v.conditions as unknown as Prisma.InputJsonValue, active: v.active },
      select: RULE_SELECT,
    });
    await auditInTx(tx, ctx, "rule.update", "CrmAssignmentRule", updated.id, { before: auditShape(cur), after: auditShape(updated) });
    return updated;
  });
  return toDto(row);
}

export async function toggleRule(ctx: AssignmentCtx, actor: MemberActor, id: string, active: boolean): Promise<AssignmentRuleDto> {
  await enter(ctx, actor);
  const cur = await loadRule(ctx, id);
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.crmAssignmentRule.update({ where: { id: cur.id }, data: { active: active === true }, select: RULE_SELECT });
    await auditInTx(tx, ctx, "rule.toggle", "CrmAssignmentRule", updated.id, { before: { active: cur.active }, after: { active: updated.active } });
    return updated;
  });
  return toDto(row);
}

/** ลบกฎ = การกระทำอันตราย (AUDIT-CLASS X9): ต้องยืนยัน + เหตุผลอย่างน้อย 5 ตัวอักษร */
export async function deleteRule(ctx: AssignmentCtx, actor: MemberActor, id: string, opts: { confirm?: boolean | null; reason?: string | null } = {}): Promise<{ ok: true }> {
  await enter(ctx, actor);
  const cur = await loadRule(ctx, id);
  if (opts?.confirm !== true) throw fail("VALIDATION", "ลบกฎแล้วกู้คืนไม่ได้ — กดยืนยันการลบก่อน");
  const reason = str(opts?.reason);
  if (reason.length < ASSIGN_DELETE_REASON_MIN) throw fail("VALIDATION", `ใส่เหตุผลที่ลบกฎอย่างน้อย ${ASSIGN_DELETE_REASON_MIN} ตัวอักษร (เก็บไว้ในประวัติการแก้ไข)`);
  await prisma.$transaction(async (tx) => {
    await tx.crmAssignmentRule.deleteMany({ where: { id: cur.id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
    await auditInTx(tx, ctx, "rule.delete", "CrmAssignmentRule", cur.id, { before: auditShape(cur), after: { reason: reason.slice(0, 300) } });
  });
  return { ok: true };
}

/** เรียงลำดับกฎ: id ที่ส่งมาได้ตำแหน่ง 0..k-1 ตามลำดับ · กฎที่ไม่ได้ส่งต่อท้ายตามลำดับเดิม */
export async function reorderRules(ctx: AssignmentCtx, actor: MemberActor, ids: string[]): Promise<AssignmentRuleDto[]> {
  await enter(ctx, actor);
  if (!Array.isArray(ids)) throw fail("VALIDATION", "ลำดับกฎไม่ถูกต้อง — รีเฟรชหน้าแล้วลองใหม่");
  const want = [...new Set(ids.map((x) => str(x)).filter(Boolean))];
  const rows = await prisma.crmAssignmentRule.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: RULE_SELECT });
  const known = new Set(rows.map((r) => r.id));
  if (want.some((id) => !known.has(id))) throw fail("NOT_FOUND", RULE_NOT_FOUND);
  const order = [...want, ...rows.map((r) => r.id).filter((id) => !want.includes(id))];
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < order.length; i += 1) await tx.crmAssignmentRule.updateMany({ where: { id: order[i], tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { sortOrder: i } });
    await auditInTx(tx, ctx, "rule.reorder", "AppSystem", ctx.systemId, { before: { order: rows.map((r) => r.id) }, after: { order } });
  });
  const fresh = await prisma.crmAssignmentRule.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: RULE_SELECT });
  return fresh.map(toDto);
}

// ───────────────────────── ผู้รับสำรอง (settings.crm.assignment) ─────────────────────────

export async function getAssignmentSettings(ctx: AssignmentCtx, actor: MemberActor): Promise<{ fallbackUserId: string | null }> {
  await enter(ctx, actor);
  const sys = await systemRow(prisma, ctx);
  return { fallbackUserId: crmAssignmentSettingsOf(sys?.settings ?? null).fallbackUserId };
}

export async function setFallbackUser(ctx: AssignmentCtx, actor: MemberActor, userId: string | null): Promise<{ fallbackUserId: string | null }> {
  await enter(ctx, actor);
  const uid = str(userId) || null;
  // AUDIT-CLASS X1 (รอบ 3 · S4): ผู้รับสำรองต้องผ่านด่านเดียวกับผู้รับตามกฎ — สมาชิกที่ยอมรับแล้ว **และมีคีย์อ่านผู้ติดต่อ**
  //   (ไม่มีคีย์ = `decide` ข้ามเขาทุกครั้ง ⇒ ตั้งได้แต่ไม่มีผล = ร้านเข้าใจผิดว่ามีตัวสำรองแล้ว)
  if (uid && !(await readableMembers(prisma, ctx.tenantId, [uid])).has(uid))
    throw fail("VALIDATION", "ผู้รับสำรองต้องเป็นพนักงานของร้านนี้ที่เปิดสิทธิ์ดูผู้ติดต่อไว้ — เลือกใหม่จากรายการ");
  const before = crmAssignmentSettingsOf((await systemRow(prisma, ctx))?.settings ?? null).fallbackUserId;
  // S5: ค่าใน settings + แถวประวัติ อยู่ใน tx เดียว
  await prisma.$transaction(async (tx) => {
    await setCrmAssignmentKey(ctx, "fallbackUserId", uid, tx);
    await auditInTx(tx, ctx, "settings.fallback", "AppSystem", ctx.systemId, { before: { fallbackUserId: before }, after: { fallbackUserId: uid } });
  });
  return { fallbackUserId: uid };
}

// ───────────────────────── งานค้าง · ทดลอง ─────────────────────────

/**
 * งานค้างต่อคน (R5) ของระบบนี้ — ตัวเลขดิบของเอนจิน (ไม่มี actor/คีย์/ตัวกรองการมองเห็น)
 * 🔴 มติผู้คุมงาน 24 ก.ย. 2569 (S5): **ไม่อยู่บน facade `crm/index.ts`** จนกว่า C2.11/C3.2 จะต้องใช้จริงแล้วใส่ actor + คีย์ให้
 *    ผู้ใช้ในโมดูลวันนี้: หน้าตั้งค่าอ่านคอลัมน์ "คิว" ผ่าน `pageData` (ซึ่งกรองด้วยการมองเห็นของผู้ดู) · ที่นี่ไว้ให้ข้อสอบเรียก
 */
export async function openLoadOf(ctx: AssignmentCtx, userIds: string[]): Promise<Record<string, number>> {
  await resolveSystem(ctx);
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((u) => str(u)).filter(Boolean))].slice(0, 500);
  return Object.fromEntries(await loadsOf(prisma, ctx, ids));
}

function reasonText(r: AssignmentPick & { ruleName?: string }): string {
  if (r.reason === "RULE") return `ตามกฎ “${r.ruleName ?? "ไม่มีชื่อ"}”`;
  return ASSIGN_REASON_LABELS[r.reason];
}

/**
 * ทำนายผลของ lead ตามลำดับ — เหมือน `pick` ทุกขั้น (round-robin เริ่มจาก cursor ปัจจุบัน · LEAST_OPEN นับงานที่ทำนายไว้ด้วย)
 * แต่ **ไม่เขียนอะไรเลย** (cursor · ผู้ติดต่อ · audit · แจ้งเตือน · outbox)
 */
export async function simulate(ctx: AssignmentCtx, actor: MemberActor, rows: AssignmentDraft[]): Promise<{ results: AssignmentSimResult[] }> {
  const a = await enter(ctx, actor);
  if (!Array.isArray(rows)) throw fail("VALIDATION", "ข้อมูลทดลองต้องเป็นรายการ lead");
  if (rows.length > ASSIGN_SIMULATE_MAX_ROWS) throw fail("VALIDATION", `ทดลองได้ครั้งละไม่เกิน ${ASSIGN_SIMULATE_MAX_ROWS} รายการ`);
  // 🔴 B1-bis: ผู้ดูที่ไม่มีคีย์ `hr.leave.read` ทดลองได้ แต่ผลต้องไม่คิดเรื่องลา — ไม่งั้น "คนนี้ถูกข้าม" = บอกว่าเขาลาอยู่วันนี้
  //    (หน้าจอเขียนไว้ว่าการทดลองของผู้ดูที่ไม่มีสิทธิ์นั้นไม่คิดเรื่องลา — `pageData.timeOffAware`)
  const env = { ...envOf(undefined, new Date(), null, true), ignoreLeave: !mayReadLeaveOf(a) };
  const sys = await systemRow(prisma, ctx);
  if (!sys) throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
  const pre = { settings: sys.settings, rules: await activeRules(prisma, ctx) };
  const results: AssignmentSimResult[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = await decide(ctx, { auto: true, draft: isObj(rows[i]) ? rows[i] : {} }, env, pre);
    results.push({ index: i, ownerUserId: r.ownerUserId, teamId: r.teamId, ruleId: r.ruleId, reason: r.reason, reasonText: reasonText(r) });
  }
  return { results };
}

// ───────────────────────── ข้อมูลของหน้า `/crm/settings/assignment` ─────────────────────────

export type AssignmentPageData = {
  rules: (AssignmentRuleDto & { nextUserId: string | null; candidateIds: string[] })[];
  fallbackUserId: string | null;
  /**
   * พนักงานที่มองเห็นผู้ติดต่อได้ + คิวงานค้าง (นับเฉพาะระเบียนที่ **ผู้ดู** เปิดได้เอง) + "ปิดรับ lead" ไหม
   * 🔴 `onLeave` มีเฉพาะผู้ดูที่ถือคีย์ `hr.leave.read` — ผู้ดูที่ไม่มีคีย์จะไม่มีฟิลด์นี้ในก้อนข้อมูลเลย (ไม่ใช่ซ่อนบนจอ)
   * 🔴 `name` = ชื่อผู้ใช้เท่านั้น (ไม่มีอีเมลพนักงานหลุดออกไปฝั่ง client — NOTE 1 ของผู้ตรวจ)
   */
  users: { id: string; name: string; load: number; accepting: boolean; onLeave?: boolean }[];
  /**
   * ผู้ดูคนนี้เห็นข้อเท็จจริงเรื่องการลาไหม (คีย์ `hr.leave.read`)
   * 🔴 **ไม่มีฟิลด์นี้เลย** เมื่อผู้ดูไม่มีคีย์ — ก้อนข้อมูลของคนที่ไม่มีสิทธิ์ต้องไม่มีอะไรที่พูดถึง "การลา" แม้แต่ชื่อคีย์
   *    (ไม่มี = `onLeave` ก็ไม่มี **และ** ป้าย "คิวถัดไป"/ปุ่มทดลองถูกคิดแบบไม่สนใจการลา — B1-bis · หน้าจอเขียนบอกผู้ดูตรง ๆ)
   */
  timeOffAware?: true;
  teams: { id: string; name: string }[];
  /** ฟิลด์กำหนดเองของผู้ติดต่อที่ตั้งเงื่อนไข `f.<key>` ได้จริง (ไม่มีฟิลด์ระบบ/อ่อนไหว — "สินค้าที่สนใจ" อยู่ชุดนี้) */
  contactFields: { key: string; label: string }[];
};

/**
 * ฟิลด์ที่เสนอให้ตั้งเงื่อนไข `f.<key>` — ชุดเดียวกับฟอร์มเพิ่มผู้ติดต่อ (`contacts.customFieldLayout`: ไม่เอาฟิลด์ระบบ ·
 * ไม่เอาฟิลด์/ส่วนที่อ่อนไหว) ⇒ ไม่มีตัวตรวจชุดที่สองในโมดูลนี้
 * 🔴 ทำไมต้องตัดฟิลด์ระบบ (S1 ของผู้ตรวจ): `splitFields` ของ `contacts.ts` พาคีย์ระบบไปเป็นคอลัมน์ หรือปฏิเสธเลย
 *    (GOVERNED_CRM_SYSTEM_KEYS) ⇒ ร่าง lead ไม่มีคีย์พวกนั้นอยู่ใน `fields` เลย · เงื่อนไข `f.phone` จึงไม่มีวันตรง และลีดทุกใบ
 *    ตกไปกฎสำรอง/NOBODY พร้อมเด้งแจ้งเตือนผู้จัดการทุกใบ · ป้ายของฟิลด์อ่อนไหวก็ห้ามหลุดไปฝั่ง client
 * โหลด `./contacts` ตอนใช้ (ไฟล์นั้น import ไฟล์นี้อยู่ — import ตรงจะเป็นวงกลมตอนโหลด)
 */
async function conditionFieldsOf(ctx: AssignmentCtx, actor: MemberActor): Promise<{ key: string; label: string }[]> {
  const contacts = await import("./contacts");
  const layout = await contacts.customFieldLayout({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null }, actor);
  return layout.map((f) => ({ key: f.key, label: f.label })).sort((a, b) => a.key.localeCompare(b.key));
}

/** ข้อมูลของหน้า (อ่านอย่างเดียว) — รายชื่อพนักงานที่มองเห็นผู้ติดต่อ · ทีม · ป้าย "คิวถัดไป" ต่อกฎ (ทำนาย ไม่เลื่อน cursor) */
export async function pageData(ctx: AssignmentCtx, actor: MemberActor): Promise<AssignmentPageData> {
  const a = await enter(ctx, actor);
  const [rules, sys, mem, teams, closedRows, fields, cWhere, dWhere] = await Promise.all([
    prisma.crmAssignmentRule.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: RULE_SELECT }),
    systemRow(prisma, ctx),
    // 🔴 NOTE 1: ไม่ดึงอีเมลของพนักงานมาเลย (ก้อนนี้เดินทางไปฝั่ง client)
    prisma.membership.findMany({ where: { tenantId: ctx.tenantId, acceptedAt: { not: null } }, select: { userId: true, role: true, permissions: true, user: { select: { name: true } } } }),
    prisma.team.findMany({ where: { tenantId: ctx.tenantId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.teamMember.findMany({ where: { tenantId: ctx.tenantId, acceptingLeads: false }, select: { userId: true } }),
    conditionFieldsOf(ctx, a),
    // AUDIT-CLASS X1 (S6): ขอบเขตการมองเห็นของผู้ดู — เลขคิวนับได้แค่ระเบียนที่ผู้ดูเปิดเองได้
    contactWhere(ctx, a),
    dealWhere(ctx, a),
  ]);
  const staff = mem.filter((m) => crmCan({ role: m.role, permissions: (isObj(m.permissions) ? m.permissions : {}) as Record<string, unknown> }, READ_KEY));
  const ids = staff.map((m) => m.userId);
  const env = envOf(undefined, new Date(), null, true);
  const loads = await loadsOf(prisma, ctx, ids, { contact: cWhere, deal: dWhere });
  // เครื่องยนต์ยังใช้ข้อมูลลาเต็ม ๆ เพื่อคำนวณป้าย "คิวถัดไป" ของแต่ละกฎ — สิ่งที่คุมคือ "ส่งออกไปให้ใครเห็น"
  for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i + 4).map((u) => onLeave(env, ctx.tenantId, u)));
  // 🔴 B1: สถานะลาเป็นคีย์ของโมดูล HR (`hr.leave.read` · PDPA — ลาป่วยคือข้อมูลสุขภาพ) · คีย์ของหน้านี้ (`crm.assignment.manage`)
  //    ไม่ให้สิทธิ์นั้น ⇒ ผู้ดูที่ไม่มีคีย์ไม่ได้ฟิลด์ `onLeave` เลย
  const mayReadLeave = mayReadLeaveOf(a);
  const closed = new Set(closedRows.map((r) => r.userId));
  const out: AssignmentPageData["rules"] = [];
  // 🔴 B1-bis: ป้าย "คิวถัดไป" ของผู้ดูที่ไม่มีคีย์ต้องคิดแบบ "ไม่สนใจการลา" — ไม่งั้นกฎ FIXED [ก, ข] ที่ตอบว่า "ข"
  //    ก็บอกไปแล้วว่า "ก" ลาอยู่วันนี้ (ไม่มีเพดาน ทั้งคู่รับงานได้ เหลือคำอธิบายเดียวคือการลา)
  const viewEnv: Env = mayReadLeave ? env : { ...env, leave: new Map<string, boolean>(), ignoreLeave: true };
  for (const r of rules) {
    const cands = await candidatesOf(viewEnv, ctx, r);
    const next = r.active ? await chooseFromRule({ ...viewEnv, sim: { cursors: new Map(), extraLoad: new Map() } }, ctx, r).catch(() => null) : null;
    out.push({ ...toDto(r), nextUserId: next, candidateIds: cands });
  }
  return {
    rules: out,
    ...(mayReadLeave ? { timeOffAware: true as const } : {}),
    fallbackUserId: crmAssignmentSettingsOf(sys?.settings ?? null).fallbackUserId,
    users: staff
      .map((m) => ({
        id: m.userId,
        name: m.user?.name?.trim() || "พนักงาน (ยังไม่ได้ตั้งชื่อ)",
        load: loads.get(m.userId) ?? 0,
        accepting: !closed.has(m.userId),
        ...(mayReadLeave ? { onLeave: env.leave.get(m.userId) === true } : {}),
      }))
      .sort((x, y) => x.name.localeCompare(y.name, "th")),
    teams,
    contactFields: fields,
  };
}

/**
 * ผิวที่ facade ของโมดูล (`crm/index.ts`) เปิดให้โค้ดนอกโมดูล — re-export ล้วน ไม่มีตรรกะ
 * 🔴 มติผู้คุมงาน 24 ก.ย. 2569 (S5): `openLoadOf` **ไม่อยู่ในชุดนี้** (ยังไม่มี actor/คีย์/ประตู/ตัวกรองการมองเห็น และยังไม่มี
 *    ผู้เรียกนอกโมดูล) — ยัง export จากไฟล์นี้ตามสัญญา S0.1 ให้ข้อสอบเรียกได้ตรง ๆ
 */
export const assignmentFacade = {
  pick,
  simulate,
  listRules,
  createRule,
  updateRule,
  toggleRule,
  deleteRule,
  reorderRules,
  getAssignmentSettings,
  setFallbackUser,
  leaveSnapshot,
  notifyUnassigned,
  assertAssignmentAccess,
  pageData,
  AssignmentError,
} as const;

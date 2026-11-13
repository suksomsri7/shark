// HR H4.4 ▸ วงจรพนักงาน (server เท่านั้น) — เตือนครบทดลองงาน/สัญญา · บันทึก/ตักเตือน/ประเมิน · รายการรับเข้า/ออกจากงาน · สิ้นสุดการจ้างในธุรกรรมเดียว
//
// กติกา (brief ledger/hr-briefs/hr-brief-H4.4.md):
//   • ผู้ดู "ข้อมูลบันทึก" (บันทึก · รายการตรวจ · แผงต้องจัดการ · ประวัติการสิ้นสุด) = OWNER หรือคีย์ hr.employee.create / hr.* ตรง ๆ
//     (บทบาท MANAGER อย่างเดียวไม่พอ — แบบเดียวกับค่าตั้งการลงเวลา H2.4) · สิ้นสุดการจ้าง = ด่านเดียวกับปุ่มลบเดิม (evaluate hr.employee.create)
//   • สาขา = hrScopeOf ("*"/[] ทุกสาขา · รายการ = เฉพาะพนักงานในสาขานั้นวันนี้) · นอกขอบเขต/ข้ามร้าน/ไม่พบ/ไม่มีสิทธิ์ = ข้อความเดียวกัน (noAccess)
//   • เขียนทุกอย่างผ่าน tenantDb(ctx).$transaction และใช้ tx ตัวเดียวทั้งก้อน · ล็อก hr:emp:<id> → hr:clock:<id> → hr-leave:* → hr-swap:* → ตารางกะ
//   • สิ้นสุดการจ้าง: สถานะ + PIN + สิทธิ์เข้าแอป + เครื่อง push + คำขอที่ค้าง เปลี่ยนในธุรกรรมเดียว (ล้มตรงไหน = ย้อนทั้งหมด) · กดซ้ำ = "สิ้นสุดแล้ว" ไม่เขียนอะไร
//   • เหตุผล/หมายเหตุของการสิ้นสุด · หัวข้อ/รายละเอียด/คะแนนของบันทึก ไม่ออกไป outbox · audit · การ์ด · AI (payload = id/วันที่ล้วน)
//   • บันทึกเพิ่มได้อย่างเดียว (Q5) · ลูกจ้างเห็นเฉพาะบันทึกที่เปิดให้เห็นของตัวเอง (หาตัวจาก employeeOfUser — ไม่รับ id จาก client)
//   • opts.now ใช้ได้เฉพาะข้อสอบ/cron — action/หน้าไม่ส่ง ◂
import type { HrOffboardReason, HrOnboardingKind, HrReviewNoteKind, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { lockHrSettings, writeHrSettingsKeys } from "./settings-lock"; // HR-SET-1 ◂
import { emitOutbox, emitOutboxMany } from "@/lib/core/outbox";
import { writeAudit } from "@/lib/core/audit";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { thaiDateKey } from "@/lib/ui/date";
import { cancelRequest } from "@/lib/modules/approval/service";
import { employeeOfUser } from "./service";
import { clearPinInTx } from "./pin"; // HR H4.4 ▸ ล้าง PIN ใน tx ของการสิ้นสุดการจ้าง ◂
import { hrScopeOf, unitWhere, type HrScope } from "./scope";
import { SETTINGS_TEXT } from "./settings";
import { lockRosterKeysInTx } from "./roster";
import { leaveDecidedEvent, leaveLedgerInTx, leaveRowInTx, lockLeaveEmployeeInTx } from "./leave"; // HR H4.4 r3 ▸ สมุดวันลา (H2.7) ◂
import { addDays } from "./time-rules";

type Ctx = { tenantId: string; systemId: string };
type Tx = Prisma.TransactionClient;
/** ผู้ดู = HrViewer ของ hr/privacy (role · unitAccess · permissions · userId) */
export type LifeViewer = { role: MembershipCtx["role"]; unitAccess: unknown; permissions: unknown; userId?: string | null };

// ═══════════════════════════ ข้อความคงที่ (ห้ามต่อชื่อ/id) ═══════════════════════════
export const LIFE_TEXT = {
  noAccess: "คุณไม่มีสิทธิ์ดูหรือจัดการข้อมูลส่วนนี้ของพนักงานคนนี้",
  self: "บันทึกหรือดำเนินการกับข้อมูลของตัวเองไม่ได้ — ให้ผู้ดูแลคนอื่นทำแทน",
  ended: "พนักงานคนนี้สิ้นสุดการจ้างแล้ว",
  endFuture: "วันสิ้นสุดงานต้องไม่เกินวันนี้ — ถ้ายังไม่ถึงวันออก ให้ตั้งวันสิ้นสุดสัญญาไว้ก่อน",
  endBefore: "วันสิ้นสุดงานต้องไม่ก่อนวันเริ่มงาน",
  reason: "เลือกเหตุผลการสิ้นสุดการจ้าง",
  note: "หมายเหตุยาวเกินไป (ไม่เกิน 500 ตัวอักษร)",
  kind: "ชนิดบันทึกไม่ถูกต้อง",
  title: "กรุณาใส่หัวข้อ (ไม่เกิน 120 ตัวอักษร)",
  body: "กรุณาใส่รายละเอียด (ไม่เกิน 4,000 ตัวอักษร)",
  period: "การประเมินต้องระบุไตรมาส เช่น 2026-Q4",
  score: "คะแนนใช้ได้เฉพาะการประเมิน และต้องเป็น 1 ถึง 5",
  notProbation: "พนักงานคนนี้ไม่ได้อยู่ระหว่างทดลองงาน",
  lead: "จำนวนวันแจ้งล่วงหน้าไม่ถูกต้อง",
  board: "ไม่พบบอร์ดงานนี้ในร้าน — เลือกบอร์ดใหม่",
  template: "รายการตรวจสอบไม่ถูกต้อง (หัวข้อ 1–80 ตัวอักษร · ไม่เกิน 20 ข้อ · รหัสไม่ซ้ำ)",
  // r2 (มติผู้คุม 1 · 8)
  revokeOwner: "พนักงานคนนี้ผูกกับบัญชีเจ้าของร้าน — เปลี่ยนเจ้าของร้านที่หน้าตั้งค่าร้านก่อน จึงจะสิ้นสุดการจ้างได้",
  revokeManager: "การถอนสิทธิ์บัญชีของผู้จัดการทำได้เฉพาะเจ้าของร้าน — ให้เจ้าของร้านเป็นผู้สิ้นสุดการจ้างคนนี้",
  keepAccess: "ร้านตั้งให้ถอนสิทธิ์บัญชีเมื่อสิ้นสุดการจ้าง — เฉพาะเจ้าของร้านเลือกเก็บสิทธิ์ไว้ได้",
  ownerSwitch: "ปิดการล้าง PIN หรือการถอนสิทธิ์บัญชีอัตโนมัติได้เฉพาะเจ้าของร้าน",
  offActive: "เริ่มรายการออกจากงานได้หลังสิ้นสุดการจ้างแล้วเท่านั้น",
} as const;
const T = LIFE_TEXT;
/** ข้อความที่หน้าจอแสดงได้ (ผลของ action → รหัสสั้นใน URL → ข้อความจากรายการนี้เท่านั้น) */
export const LIFE_MSG: Record<string, string> = {
  ...Object.fromEntries(Object.entries(LIFE_TEXT).map(([k, v]) => [`l.${k}`, v])),
  "s.noPermission": SETTINGS_TEXT.noPermission,
  "s.shopWide": SETTINGS_TEXT.shopWide,
  "s.date": SETTINGS_TEXT.date,
  "s.failed": SETTINGS_TEXT.failed,
};
const MSG_CODE = new Map(Object.entries(LIFE_MSG).map(([k, v]) => [v, k]));
/** ข้อความผลลัพธ์ → รหัสสั้น (ไม่รู้จัก = s.failed) */
export const lifeMsgCode = (text: string): string => MSG_CODE.get(text) ?? "s.failed";

class LifeRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LifeRefusal";
  }
}
type Fail = { ok: false; reason: string };
const refuse = (reason: string): Fail => ({ ok: false, reason });
const reasonOf = (e: unknown): string => (e instanceof LifeRefusal ? e.message : SETTINGS_TEXT.failed);
const TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;

// ═══════════════════════════ ตัวช่วย ═══════════════════════════
const nowOf = (o?: { now?: Date }): Date => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? new Date(o.now.getTime()) : new Date());
const dbDate = (day: string): Date => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date | null | undefined): string | null => (d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (s: string): boolean => DAY_RE.test(s) && dayOf(dbDate(s)) === s;
const permsOf = (v: LifeViewer): Record<string, unknown> => (v.permissions && typeof v.permissions === "object" ? (v.permissions as Record<string, unknown>) : {});
const membershipOf = (v: LifeViewer): MembershipCtx => ({ role: v.role, unitAccess: (Array.isArray(v.unitAccess) ? v.unitAccess : []) as string[], permissions: permsOf(v) });
const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;

/** ผู้ดูข้อมูลบันทึก (บันทึก · รายการตรวจ · แผง · ประวัติการสิ้นสุด) — OWNER หรือคีย์ตรง ๆ */
export function canSeeLifecycle(v: LifeViewer | null | undefined): boolean {
  if (!v) return false;
  if (v.role === "OWNER") return true;
  const p = permsOf(v);
  return p["hr.employee.create"] === true || p["hr.*"] === true;
}
/** สิ้นสุดการจ้างได้ไหม (ด่านเดียวกับปุ่มลบเดิม — สาขาตรวจแยกจากแถวจริง) */
export function canOffboard(v: LifeViewer | null | undefined): boolean {
  return !!v && evaluate(membershipOf(v), { module: "hr", action: "hr.employee.create" });
}
/**
 * VIS-1 B1 (มติผู้คุม 12 พ.ย.) ▸ ผู้ที่สิ้นสุดการจ้างได้ (เช่น ผู้จัดการตามบทบาท) เห็นงานประจำของสาขาตัวเองด้วย: แผง "ต้องจัดการ" · แถบทดลองงาน/สัญญา ·
 *   รายการรับเข้า/ออก (อ่าน + ติ๊ก) — ขอบเขตสาขาตรวจจากแถวจริงทุกครั้ง (scopedWhere/unitWhere) · บันทึก/ประเมิน · ค่าตั้ง · เริ่มรายการ · ผ่านทดลองงาน
 *   ยังเป็นของ canSeeLifecycle (OWNER/คีย์ตรง) เท่านั้น ◂
 */
export function canSeeLifecycleOps(v: LifeViewer | null | undefined): boolean {
  return canSeeLifecycle(v) || canOffboard(v);
}
const scopeOf = (v: LifeViewer): HrScope => hrScopeOf({ role: v.role, unitAccess: v.unitAccess });
const scopedWhere = (scope: HrScope, id: string, at: Date): Prisma.HrEmployeeWhereInput => ({ AND: [{ id }, unitWhere(scope, at)] });

// ═══════════════════════════ ค่าตั้ง (AppSystem.settings.hrLifecycle) ═══════════════════════════
export type LifeTemplateRow = { key: string; title: string; dueDays: number };
export type LifecyclePolicy = {
  probationLeadDays: number;
  contractLeadDays: number;
  assignTo: "UNIT_MANAGER" | "OWNER";
  kanban: { enabled: boolean; boardId: string | null };
  autoRevokePin: boolean;
  revokeAppAccess: boolean;
  onboardingTemplate: LifeTemplateRow[];
  offboardingTemplate: LifeTemplateRow[];
};
export const LIFE_RANGE = { probationLeadDays: { min: 0, max: 90 }, contractLeadDays: { min: 0, max: 180 }, dueDays: { min: 0, max: 90 }, rows: 20, titleMax: 80 } as const;
export const ONBOARDING_TEMPLATE: readonly LifeTemplateRow[] = [
  { key: "id_card", title: "บัตร ปชช.", dueDays: 0 },
  { key: "sso", title: "ปสส.", dueDays: 7 },
  { key: "bank", title: "บัญชีธนาคาร", dueDays: 7 },
  { key: "pin", title: "PIN", dueDays: 0 },
  { key: "roster", title: "ตารางงาน", dueDays: 0 },
  { key: "contract", title: "สัญญาจ้างลงนาม", dueDays: 3 },
  { key: "pos_training", title: "อบรม POS", dueDays: 14 },
];
export const OFFBOARDING_TEMPLATE: readonly LifeTemplateRow[] = [
  { key: "pin_revoked", title: "ปิด PIN", dueDays: 0 },
  { key: "app_access", title: "ถอนสิทธิ์บัญชี SHARK", dueDays: 0 },
  { key: "property", title: "คืนทรัพย์สิน/ยูนิฟอร์ม", dueDays: 0 },
  { key: "final_pay", title: "จ่ายค่าจ้างงวดสุดท้าย", dueDays: 3 },
  { key: "sso_out", title: "แจ้งออกประกันสังคม (สปส. 6-09)", dueDays: 15 },
  { key: "certificate", title: "หนังสือรับรองการทำงาน", dueDays: 3 },
];
const DEFAULT_POLICY: LifecyclePolicy = {
  probationLeadDays: 14,
  contractLeadDays: 30,
  assignTo: "UNIT_MANAGER",
  kanban: { enabled: false, boardId: null },
  autoRevokePin: true,
  revokeAppAccess: true,
  onboardingTemplate: ONBOARDING_TEMPLATE.map((r) => ({ ...r })),
  offboardingTemplate: OFFBOARDING_TEMPLATE.map((r) => ({ ...r })),
};
const KEY_RE = /^[a-z0-9_]{1,32}$/;
const intIn = (v: unknown, r: { min: number; max: number }): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= r.min && n <= r.max ? n : null;
};
/** แม่แบบรายการตรวจ — ผิดรูปแบบ = null */
function templateOf(v: unknown): LifeTemplateRow[] | null {
  if (!Array.isArray(v) || v.length > LIFE_RANGE.rows) return null;
  const out: LifeTemplateRow[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const key = str(o.key);
    const label = str(o.title);
    const due = intIn(o.dueDays ?? 0, LIFE_RANGE.dueDays);
    if (!KEY_RE.test(key) || seen.has(key) || label.length < 1 || label.length > LIFE_RANGE.titleMax || due === null) return null;
    seen.add(key);
    out.push({ key, title: label, dueDays: due });
  }
  return out;
}
/** ค่าที่เก็บ → นโยบาย (ช่องเสีย/ไม่มี = ค่าตั้งต้นของช่องนั้น · ไม่ throw) */
function policyOfSettings(settings: unknown): LifecyclePolicy {
  const s = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>).hrLifecycle : null;
  const o = (s && typeof s === "object" && !Array.isArray(s) ? s : {}) as Record<string, unknown>;
  const kb = (o.kanban && typeof o.kanban === "object" ? o.kanban : {}) as Record<string, unknown>;
  const boardId = str(kb.boardId) || null;
  return {
    probationLeadDays: intIn(o.probationLeadDays, LIFE_RANGE.probationLeadDays) ?? DEFAULT_POLICY.probationLeadDays,
    contractLeadDays: intIn(o.contractLeadDays, LIFE_RANGE.contractLeadDays) ?? DEFAULT_POLICY.contractLeadDays,
    assignTo: o.assignTo === "OWNER" ? "OWNER" : "UNIT_MANAGER",
    kanban: { enabled: kb.enabled === true && !!boardId, boardId },
    autoRevokePin: typeof o.autoRevokePin === "boolean" ? o.autoRevokePin : DEFAULT_POLICY.autoRevokePin,
    revokeAppAccess: typeof o.revokeAppAccess === "boolean" ? o.revokeAppAccess : DEFAULT_POLICY.revokeAppAccess,
    onboardingTemplate: templateOf(o.onboardingTemplate) ?? DEFAULT_POLICY.onboardingTemplate.map((r) => ({ ...r })),
    offboardingTemplate: templateOf(o.offboardingTemplate) ?? DEFAULT_POLICY.offboardingTemplate.map((r) => ({ ...r })),
  };
}
const settingsOf = (db: Tx, ctx: Ctx) => db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { id: true, settings: true } });

/** นโยบายวงจรพนักงานของระบบ HR (ค่าตั้งต้นเมื่อยังไม่ตั้ง/ค่าเสีย — ไม่ throw) */
export async function getLifecyclePolicy(ctx: Ctx): Promise<LifecyclePolicy> {
  try {
    const s = await settingsOf(tenantDb({ tenantId: ctx.tenantId }) as unknown as Tx, ctx);
    return policyOfSettings(s?.settings);
  } catch {
    return policyOfSettings(null);
  }
}

export type LifecyclePolicyPatch = Partial<{
  probationLeadDays: number | string;
  contractLeadDays: number | string;
  assignTo: string;
  kanban: { enabled?: boolean; boardId?: string | null };
  autoRevokePin: boolean;
  revokeAppAccess: boolean;
  onboardingTemplate: unknown;
  offboardingTemplate: unknown;
}>;
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k) && (o as Record<string, unknown>)[k] !== undefined;

/** บอร์ด ACTIVE ของระบบบอร์ดงาน (KANBAN) ในร้านนี้ไหม */
async function boardOfTenant(tenantId: string, boardId: string): Promise<boolean> {
  const systems = await tenantDb({ tenantId }).appSystem.findMany({ where: { tenantId, type: "KANBAN" }, select: { id: true }, take: 50 });
  for (const s of systems) {
    const b = await tenantDb({ tenantId, systemId: s.id }).kanbanBoard.findFirst({ where: { id: boardId, status: "ACTIVE" }, select: { id: true } });
    if (b) return true;
  }
  return false;
}

/** ตั้งนโยบาย (ค่าทั้งร้าน ⇒ ผู้ดูแลทุกสาขาเท่านั้น) — ช่องที่ไม่ส่ง = คงค่าเดิม · ค่าตั้งอื่นของระบบคงไว้ */
export async function saveLifecyclePolicy(ctx: Ctx, viewer: LifeViewer, patch: LifecyclePolicyPatch): Promise<{ ok: true; id: string } | Fail> {
  if (!canSeeLifecycle(viewer)) return refuse(SETTINGS_TEXT.noPermission);
  if (scopeOf(viewer).unitIds !== "*") return refuse(SETTINGS_TEXT.shopWide);
  const p = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  const next: Partial<LifecyclePolicy> = {};
  if (has(p, "probationLeadDays")) {
    const n = intIn(p.probationLeadDays, LIFE_RANGE.probationLeadDays);
    if (n === null) return refuse(T.lead);
    next.probationLeadDays = n;
  }
  if (has(p, "contractLeadDays")) {
    const n = intIn(p.contractLeadDays, LIFE_RANGE.contractLeadDays);
    if (n === null) return refuse(T.lead);
    next.contractLeadDays = n;
  }
  if (has(p, "assignTo")) {
    if (p.assignTo !== "UNIT_MANAGER" && p.assignTo !== "OWNER") return refuse(SETTINGS_TEXT.failed);
    next.assignTo = p.assignTo;
  }
  for (const k of ["onboardingTemplate", "offboardingTemplate"] as const) {
    if (!has(p, k)) continue;
    const t = templateOf(p[k]);
    if (!t || t.length === 0) return refuse(T.template);
    next[k] = t;
  }
  const cur = await getLifecyclePolicy(ctx);
  for (const k of ["autoRevokePin", "revokeAppAccess"] as const) {
    if (!has(p, k)) continue;
    if (typeof p[k] !== "boolean") return refuse(SETTINGS_TEXT.failed);
    // r2-8: ปิดการล้าง PIN / การถอนสิทธิ์อัตโนมัติ = เจ้าของร้านเท่านั้น (คงค่าเดิมหรือเปิด = ผู้ตั้งค่าได้ทุกคน)
    if (p[k] === false && cur[k] === true && viewer.role !== "OWNER") return refuse(T.ownerSwitch);
    next[k] = p[k] as boolean;
  }
  if (has(p, "kanban")) {
    const kb = (p.kanban && typeof p.kanban === "object" ? p.kanban : {}) as Record<string, unknown>;
    const enabled = kb.enabled === true;
    const boardId = str(kb.boardId) || null;
    if ((enabled && !boardId) || (boardId && !(await boardOfTenant(ctx.tenantId, boardId)))) return refuse(T.board);
    next.kanban = { enabled, boardId };
  }
  try {
    const fields = Object.keys(next);
    await tenantDb({ tenantId: ctx.tenantId }).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      const sys = await lockHrSettings(tx, ctx, [`hr:lifepolicy:${ctx.systemId}`]); // HR-SET-1 ▸ hr:clockpolicy → hr:lifepolicy → แถว AppSystem · อ่านใหม่ใต้ล็อก ◂
      if (!sys) throw new LifeRefusal(SETTINGS_TEXT.notFound);
      const base = sys.settings && typeof sys.settings === "object" && !Array.isArray(sys.settings) ? (sys.settings as Record<string, unknown>) : {};
      const merged: LifecyclePolicy = { ...policyOfSettings(base), ...next };
      const r = await writeHrSettingsKeys(tx, ctx, { hrLifecycle: merged }); // HR-SET-1 ▸ เปลี่ยนเฉพาะคีย์ hrLifecycle ◂
      if (r.count !== 1) throw new LifeRefusal(SETTINGS_TEXT.notFound);
    }, TX_OPTS);
    await writeAudit({ tenantId: ctx.tenantId, actorType: viewer.userId ? "USER" : "SYSTEM", actorId: viewer.userId ?? null, action: "hr.settings.lifecycle.update", targetType: "AppSystem", targetId: ctx.systemId, after: { systemId: ctx.systemId, fields } });
    return { ok: true, id: ctx.systemId };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}

// ═══════════════════════════ เตือนครบกำหนด (R5 · cron รายชั่วโมง) ═══════════════════════════
export const MILESTONE_EVENT = "hr.employee.milestone_due";
export const CHECKLIST_EVENT = "hr.employee.checklist_started";
export const OFFBOARDED_EVENT = "hr.employee.offboarded";
export type Milestone = "PROBATION_END" | "CONTRACT_END";
const SWEEP_PER_SYSTEM = 50;
const SWEEP_PER_RUN = 500;
const SWEEP_SCAN = 2_000;
type Due = { employeeId: string; unitId: string | null; name: string; milestone: Milestone; date: string };
const milestoneKey = (d: { employeeId: string; milestone: Milestone; date: string }) => `${MILESTONE_EVENT}#${d.employeeId}#${d.milestone}#${d.date}`;

/** พนักงานที่ยังทำงานและครบกำหนดภายในวันแจ้งล่วงหน้า (รวมวันที่ผ่านไปแล้ว) — เรียงวันที่ แล้ว id */
async function dueOf(db: Tx, pol: LifecyclePolicy, day: string, extra: Prisma.HrEmployeeWhereInput = {}): Promise<Due[]> {
  const pCut = dbDate(addDays(day, pol.probationLeadDays));
  const cCut = dbDate(addDays(day, pol.contractLeadDays));
  // r2-8: หน้าต่างสแกนเรียงตามวันครบกำหนด (ล่าสุดก่อน) — วันที่เพิ่งเข้าเกณฑ์อยู่ต้นหน้าต่างเสมอ ไม่ถูกแถวเก่าที่เตือนไปแล้วดันตก
  const sel = { id: true, unitId: true, name: true, probationEndAt: true, contractEndAt: true } as const;
  const probs = await db.hrEmployee.findMany({
    where: { AND: [{ active: true, employmentStatus: "PROBATION", probationEndAt: { lte: pCut } }, extra] },
    orderBy: [{ probationEndAt: "desc" }, { id: "asc" }],
    take: SWEEP_SCAN,
    select: sel,
  });
  const conts = await db.hrEmployee.findMany({
    where: { AND: [{ active: true, contractEndAt: { lte: cCut } }, extra] },
    orderBy: [{ contractEndAt: "desc" }, { id: "asc" }],
    take: SWEEP_SCAN,
    select: sel,
  });
  const out: Due[] = [];
  for (const r of probs) if (r.probationEndAt) out.push({ employeeId: r.id, unitId: r.unitId, name: r.name, milestone: "PROBATION_END", date: dayOf(r.probationEndAt)! });
  for (const r of conts) if (r.contractEndAt) out.push({ employeeId: r.id, unitId: r.unitId, name: r.name, milestone: "CONTRACT_END", date: dayOf(r.contractEndAt)! });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.employeeId < b.employeeId ? -1 : a.employeeId > b.employeeId ? 1 : a.milestone < b.milestone ? -1 : 1));
}

/** ระบบ HR ที่เปิดอยู่ (ทุกร้าน หรือร้านเดียว) — เรียงตาม id */
async function hrSystemsOf(tenantId?: string | null): Promise<Ctx[]> {
  const tenants = tenantId ? [tenantId] : (await tenantDb({ tenantId: "" }).tenant.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((t) => t.id);
  const out: Ctx[] = [];
  for (const tid of tenants) {
    const rows = await tenantDb({ tenantId: tid }).appSystem.findMany({ where: { tenantId: tid, type: "HR", active: true }, select: { id: true }, orderBy: { id: "asc" } });
    for (const r of rows) out.push({ tenantId: tid, systemId: r.id });
  }
  return out.sort((a, b) => (a.systemId < b.systemId ? -1 : a.systemId > b.systemId ? 1 : 0));
}

/**
 * ยิง hr.employee.milestone_due ครั้งเดียวต่อ (พนักงาน, ชนิด, วันที่) — วันใหม่ (ต่อทดลองงาน/สัญญา) = เตือนใหม่ ·
 * ≤ 50 รายการใหม่ต่อระบบต่อรอบ · ≤ 500 ต่อรอบ · ไม่มีอะไรครบ = ไม่เขียนอะไรเลย · ล็อกต่อระบบ (รอบซ้อนกันไม่ยิงซ้ำ)
 */
export async function sweepLifecycleAlerts(input: { now?: Date; tenantId?: string | null } = {}): Promise<{ ok: true; systems: number; emitted: number }> {
  const now = nowOf(input);
  const day = thaiDateKey(now);
  const systems = await hrSystemsOf(input?.tenantId ?? null);
  let emitted = 0;
  for (const ctx of systems) {
    if (emitted >= SWEEP_PER_RUN) break;
    const cap = Math.min(SWEEP_PER_SYSTEM, SWEEP_PER_RUN - emitted);
    const pol = await getLifecyclePolicy(ctx);
    const n = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lock(tx, `hr:lifesweep:${ctx.systemId}`);
      const due = await dueOf(tx, pol, day);
      if (due.length === 0) return 0;
      const have = new Set<string>();
      const keys = due.map(milestoneKey);
      for (let i = 0; i < keys.length; i += 500) {
        const rows = await tx.outboxEvent.findMany({ where: { tenantId: ctx.tenantId, idempotencyKey: { in: keys.slice(i, i + 500) } }, select: { idempotencyKey: true } });
        for (const r of rows) have.add(r.idempotencyKey);
      }
      const fresh = due.filter((d) => !have.has(milestoneKey(d))).slice(0, cap);
      const events = fresh.map((d) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: d.unitId, type: MILESTONE_EVENT, idempotencyKey: milestoneKey(d), payload: { employeeId: d.employeeId, milestone: d.milestone, dueDate: d.date } }));
      return events.length ? await emitOutboxMany(tx, events) : 0;
    }, TX_OPTS);
    emitted += n;
  }
  return { ok: true, systems: systems.length, emitted };
}

// ═══════════════════════════ แผง "ต้องจัดการ" (R6) ═══════════════════════════
export type LifeDueKind = Milestone | "ONBOARDING_OPEN" | "OFFBOARDING_OPEN";
export type LifeDueItem = { employeeId: string; name: string; kind: LifeDueKind; date: string | null; open: number };

/** รายการที่ต้องจัดการของผู้ดู (ตามขอบเขตสาขา) — ไม่มีสิทธิ์ = null */
export async function lifecycleDue(ctx: Ctx, viewer: LifeViewer, opts: { now?: Date } = {}): Promise<{ items: LifeDueItem[] } | null> {
  if (!canSeeLifecycleOps(viewer)) return null;
  const now = nowOf(opts);
  const scope = scopeOf(viewer);
  const db = tenantDb(ctx) as unknown as Tx;
  const pol = await getLifecyclePolicy(ctx);
  // r3: แถวของผู้ดูเอง (บัญชีที่ผูก) ไม่อยู่ในแผงเสมอ
  const notMe: Prisma.HrEmployeeWhereInput = viewer.userId ? { OR: [{ linkedUserId: null }, { linkedUserId: { not: viewer.userId } }] } : {};
  const items: LifeDueItem[] = (await dueOf(db, pol, thaiDateKey(now), { AND: [unitWhere(scope, now), notMe] })).map((d) => ({ employeeId: d.employeeId, name: d.name, kind: d.milestone, date: d.date, open: 0 }));
  const tasks = await db.hrOnboardingTask.findMany({ where: { doneAt: null }, select: { employeeId: true, kind: true, dueDate: true }, take: 2_000 });
  const byEmp = new Map<string, { kind: HrOnboardingKind; open: number; date: string | null }>();
  for (const t of tasks) {
    const k = `${t.employeeId}|${t.kind}`;
    const cur = byEmp.get(k) ?? { kind: t.kind, open: 0, date: null };
    cur.open += 1;
    const d = dayOf(t.dueDate);
    if (d && (!cur.date || d < cur.date)) cur.date = d;
    byEmp.set(k, cur);
  }
  const ids = [...new Set([...byEmp.keys()].map((k) => k.split("|")[0]!))];
  if (ids.length) {
    const emps = await db.hrEmployee.findMany({ where: { AND: [{ id: { in: ids } }, unitWhere(scope, now), notMe] }, select: { id: true, name: true, active: true } });
    const empOf = new Map(emps.map((e) => [e.id, e]));
    for (const [k, v] of byEmp) {
      const e = empOf.get(k.split("|")[0]!);
      if (!e || (v.kind === "ONBOARDING" && !e.active)) continue;
      items.push({ employeeId: e.id, name: e.name, kind: v.kind === "ONBOARDING" ? "ONBOARDING_OPEN" : "OFFBOARDING_OPEN", date: v.date, open: v.open });
    }
  }
  return { items: items.slice(0, 200) };
}

/** ผ่านทดลองงาน: PROBATION → ACTIVE (นับแถวที่เปลี่ยน · ผู้ดูข้อมูลบันทึก) — ไม่ผ่าน = สิ้นสุดการจ้างเหตุผล PROBATION_FAILED */
export async function confirmProbation(ctx: Ctx, viewer: LifeViewer, employeeId: string, opts: { now?: Date } = {}): Promise<{ ok: true } | Fail> {
  if (!canSeeLifecycle(viewer)) return refuse(T.noAccess);
  const id = str(employeeId);
  const now = nowOf(opts);
  const db = tenantDb(ctx);
  const row = id ? await db.hrEmployee.findFirst({ where: scopedWhere(scopeOf(viewer), id, now), select: { id: true, linkedUserId: true } }) : null;
  if (!row) return refuse(T.noAccess);
  if (row.linkedUserId && row.linkedUserId === viewer.userId) return refuse(T.self);
  const r = await db.hrEmployee.updateMany({ where: { id, active: true, employmentStatus: "PROBATION" }, data: { employmentStatus: "ACTIVE" } });
  if (r.count !== 1) return refuse(T.notProbation);
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: viewer.userId ?? null, action: "hr.employee.probation_pass", targetType: "HrEmployee", targetId: id, after: { employeeId: id, day: thaiDateKey(now) } });
  return { ok: true };
}

// ═══════════════════════════ สิ้นสุดการจ้าง (R8 · r2 มติ 1/5/6) ═══════════════════════════
export const OFFBOARD_REASONS: readonly HrOffboardReason[] = ["RESIGNED", "CONTRACT_END", "PROBATION_FAILED", "TERMINATED", "OTHER"];
export type OffboardInput = { endDate?: string | null; reason?: string | null; note?: string | null; revokeAccess?: boolean | null };
export type OffboardResult =
  | { ok: true; pinRevoked: boolean; accessRevoked: boolean; accessKept: boolean; cancelled: { leaves: number; swaps: number; roster: number }; spanning: number }
  | Fail;

/** แถวรายการตรวจจากแม่แบบ (1 แถวต่อรหัส — partial unique ในฐานกันซ้ำ) */
function taskRows(ctx: Ctx, employeeId: string, kind: HrOnboardingKind, tpl: LifeTemplateRow[], baseDay: string) {
  return tpl.map((r, i) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, kind, templateKey: r.key, title: r.title, sortOrder: i, dueDate: dbDate(addDays(baseDay, r.dueDays)) }));
}
const markTask = (tx: Tx, employeeId: string, key: string, at: Date, by: string | null) =>
  tx.hrOnboardingTask.updateMany({ where: { employeeId, kind: "OFFBOARDING", templateKey: key, doneAt: null }, data: { doneAt: at, doneById: by } });
/** audit ในธุรกรรมของผู้เรียก (ล้ม = ย้อนทั้งก้อน) — id/จำนวนล้วน */
const auditTx = (tx: Tx, ctx: Ctx, actorId: string | null, action: string, targetType: string, targetId: string, after: Record<string, unknown>) =>
  tx.auditLog.create({ data: { tenantId: ctx.tenantId, actorType: actorId ? "USER" : "SYSTEM", actorId, action, targetType, targetId, after: after as Prisma.InputJsonValue } });
/** ยกเลิกคำขออนุมัติที่ยังเปิดของ entity เหล่านี้ — คืน id ที่ยกเลิกได้ และ id ที่ตัดสินไปแล้ว (คงไว้ · บันทึกใน audit) */
async function closeRequests(tx: Tx, ctx: Ctx, entityType: string, ids: string[]): Promise<{ cancelled: string[]; kept: string[] }> {
  if (ids.length === 0) return { cancelled: [], kept: [] };
  const reqs = await tx.approvalRequest.findMany({ where: { tenantId: ctx.tenantId, entityType, entityId: { in: ids }, status: { not: "CANCELLED" } }, select: { id: true, status: true }, orderBy: { id: "asc" } });
  const out = { cancelled: [] as string[], kept: [] as string[] };
  for (const r of reqs) {
    if (r.status === "PENDING" && (await cancelRequest({ tenantId: ctx.tenantId }, r.id, { tx }))) out.cancelled.push(r.id);
    else out.kept.push(r.id);
  }
  return out;
}

/**
 * สิ้นสุดการจ้าง — ธุรกรรมเดียว: ล็อกพนักงาน → ล็อกลงเวลา (รอการลงเวลาที่กำลังทำให้จบก่อน) → ตัดสินเรื่องบัญชีแอป (ทำได้ทั้งหมดหรือปฏิเสธทั้งหมด) →
 * สถานะ ENDED + วันสิ้นสุด + ประวัติ + ปิด PIN → ยกเลิกใบลา/คำขอสลับกะที่เริ่มหลังวันสิ้นสุด (+ คำขออนุมัติ) → ลบตารางกะหลังวันสิ้นสุด →
 * รายการออกจากงาน → ถอนสิทธิ์แอป + เครื่อง push → audit + event (ทั้งหมดใน tx เดียว — ล้มตรงไหน = ย้อนทั้งหมด)
 * บัญชีแอป (มติ r2-1): ผูกบัญชีเจ้าของร้าน = ปฏิเสธเสมอ · บัญชี STAFF = ผู้มีสิทธิ์สิ้นสุดการจ้างถอนได้ · บัญชีบทบาทอื่น = เจ้าของร้านเท่านั้น ·
 *   ร้านตั้งให้ถอน แต่ผู้กดไม่ถอน = เจ้าของร้านเท่านั้น (ผลบอก accessKept) · ไม่มีทาง "สำเร็จแต่สิทธิ์ยังค้าง" เมื่อขอถอน
 * ใบลาที่คร่อมวันสิ้นสุด · OT · คำขอแก้เวลา · ของในอดีต ไม่แตะ (นับ spanning) · ทำซ้ำ = "สิ้นสุดแล้ว" ไม่เขียนอะไร
 */
export async function offboardEmployee(ctx: Ctx, viewer: LifeViewer, employeeId: string, input: OffboardInput, opts: { now?: Date } = {}): Promise<OffboardResult> {
  const now = nowOf(opts);
  const id = str(employeeId);
  if (!canOffboard(viewer) || !id) return refuse(T.noAccess);
  const i = (input && typeof input === "object" ? input : {}) as OffboardInput;
  const why = OFFBOARD_REASONS.find((r) => r === i.reason);
  if (!why) return refuse(T.reason);
  const memo = i.note === undefined || i.note === null ? null : String(i.note).trim() || null;
  if (memo && memo.length > 500) return refuse(T.note);
  const today = thaiDateKey(now);
  const end = str(i.endDate) || today;
  if (!validDay(end)) return refuse(SETTINGS_TEXT.date);
  if (end > today) return refuse(T.endFuture);
  const scope = scopeOf(viewer);
  const actor = viewer.userId ?? null;
  const isOwner = viewer.role === "OWNER";
  try {
    const out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lock(tx, `hr:emp:${id}`);
      await lock(tx, `hr:clock:${id}`);
      const emp = await tx.hrEmployee.findFirst({ where: scopedWhere(scope, id, now), select: { id: true, unitId: true, active: true, startDate: true, linkedUserId: true } });
      if (!emp) throw new LifeRefusal(T.noAccess);
      if (emp.linkedUserId && emp.linkedUserId === actor) throw new LifeRefusal(T.self);
      if (!emp.active) throw new LifeRefusal(T.ended);
      if (emp.startDate && dbDate(end) < emp.startDate) throw new LifeRefusal(T.endBefore);
      const pol = policyOfSettings((await settingsOf(tx, ctx))?.settings);

      // บัญชีแอปของพนักงาน — ตัดสินก่อนเขียนอะไร (ปฏิเสธ = ไม่มีอะไรเปลี่ยน)
      const linked = emp.linkedUserId;
      const member = linked ? await tx.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: linked }, select: { id: true, role: true, acceptedAt: true } }) : null;
      if (member?.role === "OWNER") throw new LifeRefusal(T.revokeOwner);
      const wantAccess = typeof i.revokeAccess === "boolean" ? i.revokeAccess : pol.revokeAppAccess;
      if (linked && !wantAccess && pol.revokeAppAccess && !isOwner) throw new LifeRefusal(T.keepAccess);
      if (linked && wantAccess && member && member.role !== "STAFF" && !isOwner) throw new LifeRefusal(T.revokeManager);

      const pinRevoked = pol.autoRevokePin;
      const endAt = dbDate(end);
      const u = await tx.hrEmployee.updateMany({
        where: { id, active: true },
        data: {
          active: false,
          employmentStatus: "ENDED",
          endDate: endAt,
          offboardedAt: now,
          offboardReason: why,
          offboardNote: memo,
          offboardedById: actor,
        },
      });
      if (u.count !== 1) throw new LifeRefusal(T.ended);
      if (pinRevoked) await clearPinInTx(tx, id); // คอลัมน์ PIN = hr/pin.ts เท่านั้น (F16.5) · tx เดียวกัน

      // ใบลาที่เริ่มหลังวันสิ้นสุด (PENDING/APPROVED) ⇒ CANCELLED + คำขออนุมัติ · คำขอที่ตัดสินไปแล้ว = คงไว้ แต่ใบลายังยกเลิก และ audit ระบุ id
      //   r3 (H2.7 สมุดวันลา): ลำดับล็อกรวม = hr:emp → hr:clock → hr-leave:<id> (เรียง) → hr-leave-emp:<sys>:<emp> → hr-swap:<id> (เรียง) → กุญแจตารางกะ ·
      //   H2.7 ใช้ hr-leave → hr-leave-emp → ตารางกะ → แถวประเภทการลา (FOR SHARE) · สลับกะ = hr-swap → ตารางกะ · ไม่มีใครถือ hr:emp/hr:clock แล้วขอกุญแจใบลา ⇒ ไม่มีวงล็อก
      //   APPROVED ⇒ leaveLedgerInTx(APPROVED→CANCELLED) = use-revert ครั้งเดียว (+ expire-late / carry-top ของ H2.7) + hr.leave.decided · PENDING ⇒ การจองเป็นแค่ผลรวมของใบรอ ยกเลิกแล้วคืนเอง
      const lv = await tx.hrLeave.findMany({ where: { employeeId: id, status: { in: ["PENDING", "APPROVED"] }, toDate: { gt: endAt } }, select: { id: true }, orderBy: { id: "asc" } });
      for (const l of lv) await lock(tx, `hr-leave:${l.id}`);
      await lockLeaveEmployeeInTx(tx, ctx.systemId, id);
      const lvNow = await tx.hrLeave.findMany({ where: { id: { in: lv.map((l) => l.id) }, status: { in: ["PENDING", "APPROVED"] } }, select: { id: true, fromDate: true, status: true } });
      const lvFuture = lvNow.filter((l) => l.fromDate > endAt);
      const leaveIds = lvFuture.map((l) => l.id);
      const spanning = lvNow.length - leaveIds.length;
      const leaveReq = await closeRequests(tx, ctx, "HrLeave", leaveIds);
      let leaves = 0;
      for (const l of lvFuture) {
        const lx = l.status === "APPROVED" ? await leaveRowInTx(tx, l.id) : null;
        const c = await tx.hrLeave.updateMany({ where: { id: l.id, status: l.status }, data: { status: "CANCELLED" } });
        if (c.count !== 1) continue;
        leaves += 1;
        if (lx) {
          await leaveLedgerInTx(tx, ctx, lx, "APPROVED", "CANCELLED");
          await emitOutbox(tx, leaveDecidedEvent(ctx, lx, "CANCELLED", "APPROVED"));
        }
      }

      // คำขอสลับกะที่ยังเปิด (เป็นผู้ขอหรือเพื่อน) ⇒ ยกเลิก (+ คำขออนุมัติ)
      const sw = await tx.hrShiftSwapRequest.findMany({ where: { status: { in: ["AWAITING_PEER", "PENDING"] }, OR: [{ requesterEmployeeId: id }, { targetEmployeeId: id }] }, select: { id: true }, orderBy: { id: "asc" } });
      for (const s of sw) await lock(tx, `hr-swap:${s.id}`);
      const swapIds = sw.map((s) => s.id);
      const swapReq = await closeRequests(tx, ctx, "HrShiftSwapRequest", swapIds);
      const swaps = swapIds.length ? (await tx.hrShiftSwapRequest.updateMany({ where: { id: { in: swapIds }, status: { in: ["AWAITING_PEER", "PENDING"] } }, data: { status: "CANCELLED", decidedAt: now } })).count : 0;

      // ตารางกะหลังวันสิ้นสุด ⇒ ลบ (ล็อกกุญแจตารางกะก่อน · คำขอสลับที่อ้างแถวเหล่านี้หายตาม FK Cascade)
      const ro = await tx.hrRosterEntry.findMany({ where: { employeeId: id, date: { gt: endAt } }, select: { id: true, date: true }, orderBy: { id: "asc" } });
      if (ro.length) await lockRosterKeysInTx(tx, ctx.systemId, ro.map((r) => ({ employeeId: id, date: dayOf(r.date)! })));
      const rosterIds = ro.map((r) => r.id);
      const roster = ro.length ? (await tx.hrRosterEntry.deleteMany({ where: { id: { in: rosterIds } } })).count : 0;

      // รายการออกจากงาน (ครั้งแรกเท่านั้น — สิ้นสุดซ้ำหลังกู้คืนใช้ชุดเดิม)
      await tx.hrOnboardingTask.createMany({ data: taskRows(ctx, id, "OFFBOARDING", pol.offboardingTemplate, end), skipDuplicates: true });
      if (pinRevoked) await markTask(tx, id, "pin_revoked", now, actor);

      // ถอนสิทธิ์แอป (ผลเท่ากับ staff/revokeStaffAccess): เลิกผูก · สมาชิกภาพ acceptedAt = null · เครื่อง push ไม่ผูกร้านนี้
      //   เลิกผูก "ทั้งร้าน": partial unique (tenantId, linkedUserId) ⇒ บัญชีหนึ่งผูกพนักงานได้แถวเดียวในร้าน = แถวนี้ (tx ผูกระบบนี้)
      const revoke = !!linked && wantAccess;
      if (revoke && linked) {
        await tx.hrEmployee.updateMany({ where: { id, linkedUserId: linked }, data: { linkedUserId: null, linkApprovedById: null } });
        if (member?.acceptedAt) await tx.membership.updateMany({ where: { id: member.id, tenantId: ctx.tenantId }, data: { acceptedAt: null } });
        await tx.pushDevice.updateMany({ where: { userId: linked, tenantId: ctx.tenantId }, data: { tenantId: null } });
        await markTask(tx, id, "app_access", now, actor);
        await auditTx(tx, ctx, actor, "hr.employee.link", "HrEmployee", id, { employeeId: id, userId: linked, approvedById: null, unlinked: true, viaOffboard: true });
        if (member?.acceptedAt) await auditTx(tx, ctx, actor, "membership.access.revoke", "Membership", member.id, { active: false, viaOffboard: id });
      }
      const accessKept = !!linked && !wantAccess;
      const after = {
        employeeId: id,
        endDate: end,
        leaves,
        swaps,
        roster,
        spanning,
        leaveIds,
        swapIds,
        rosterIds,
        requestsCancelled: [...leaveReq.cancelled, ...swapReq.cancelled],
        requestsKept: [...leaveReq.kept, ...swapReq.kept],
        pinRevoked,
        accessRevoked: revoke,
        accessKept,
      };
      await tx.auditLog.create({ data: { tenantId: ctx.tenantId, actorType: actor ? "USER" : "SYSTEM", actorId: actor, action: "hr.employee.offboard", targetType: "HrEmployee", targetId: id, after: after as Prisma.InputJsonValue } });
      await emitOutbox(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: emp.unitId, type: OFFBOARDED_EVENT, idempotencyKey: `${OFFBOARDED_EVENT}#${id}#${now.getTime()}`, payload: { employeeId: id, endDate: end } });
      return { pinRevoked, accessRevoked: revoke, accessKept, cancelled: { leaves, swaps, roster }, spanning };
    }, TX_OPTS);
    return { ok: true, ...out };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}

/** ประวัติวงจรของพนักงาน (สถานะ · วันที่ · การสิ้นสุดล่าสุด) — ผู้ดูข้อมูลบันทึกในขอบเขตเท่านั้น · แถวของตัวเอง = ไม่มีเหตุผล/หมายเหตุการสิ้นสุด (r2-2) */
export async function loadLifecycleForViewer(
  ctx: Ctx,
  viewer: LifeViewer,
  employeeId: string,
  opts: { now?: Date } = {},
): Promise<{ status: string | null; startDate: string | null; probationEndAt: string | null; contractEndAt: string | null; offboard: { at: Date; endDate: string | null; reason: HrOffboardReason | null; note: string | null } | null } | null> {
  if (!canSeeLifecycleOps(viewer)) return null;
  const id = str(employeeId);
  if (!id) return null;
  const r = await tenantDb(ctx).hrEmployee.findFirst({
    where: scopedWhere(scopeOf(viewer), id, nowOf(opts)),
    select: { employmentStatus: true, startDate: true, probationEndAt: true, contractEndAt: true, endDate: true, offboardedAt: true, offboardReason: true, offboardNote: true, linkedUserId: true },
  });
  if (!r) return null;
  // r2-2: แถวของตัวเอง = ไม่มีเหตุผล/หมายเหตุ · VIS-1 B1: ผู้เห็นเฉพาะงานประจำ (สิ้นสุดได้แต่ไม่มีคีย์บันทึก) = ไม่มีเหตุผล/หมายเหตุเช่นกัน
  const own = (!!r.linkedUserId && r.linkedUserId === viewer.userId) || !canSeeLifecycle(viewer);
  return {
    status: r.employmentStatus ?? null,
    startDate: dayOf(r.startDate),
    probationEndAt: dayOf(r.probationEndAt),
    contractEndAt: dayOf(r.contractEndAt),
    offboard: r.offboardedAt ? { at: r.offboardedAt, endDate: dayOf(r.endDate), reason: own ? null : r.offboardReason, note: own ? null : r.offboardNote } : null,
  };
}

// ═══════════════════════════ บันทึก / ตักเตือน / ประเมิน (R10) ═══════════════════════════
export const NOTE_KINDS: readonly HrReviewNoteKind[] = ["NOTE", "VERBAL_WARNING", "WRITTEN_WARNING", "REVIEW"];
export type ReviewNoteInput = { employeeId: string; kind: string; title: string; body: string; periodLabel?: string | null; score?: number | string | null; visibleToEmployee?: boolean | null };
const PERIOD_RE = /^\d{4}-Q[1-4]$/;

/** เพิ่มบันทึก (เพิ่มได้อย่างเดียว) — ใบเตือนเป็นหนังสือ = ลูกจ้างเห็นเสมอ · ตักเตือนด้วยวาจา/ประเมิน = เห็นโดยปริยาย · บันทึกทั่วไป = ไม่เห็นโดยปริยาย */
export async function addReviewNote(ctx: Ctx, viewer: LifeViewer, input: ReviewNoteInput, opts: { now?: Date } = {}): Promise<{ ok: true; id: string } | Fail> {
  if (!canSeeLifecycle(viewer)) return refuse(T.noAccess);
  const x = (input && typeof input === "object" ? input : {}) as ReviewNoteInput;
  const kind = NOTE_KINDS.find((k) => k === x.kind);
  if (!kind) return refuse(T.kind);
  const head = str(x.title);
  if (head.length < 1 || head.length > 120) return refuse(T.title);
  const text = str(x.body);
  if (text.length < 1 || text.length > 4000) return refuse(T.body);
  const period = str(x.periodLabel) || null;
  if (kind === "REVIEW" && (!period || !PERIOD_RE.test(period))) return refuse(T.period);
  const rawScore = x.score === undefined || x.score === null || x.score === "" ? null : Number(x.score);
  if (rawScore !== null && (kind !== "REVIEW" || !Number.isInteger(rawScore) || rawScore < 1 || rawScore > 5)) return refuse(T.score);
  const id = str(x.employeeId);
  const db = tenantDb(ctx);
  const row = id ? await db.hrEmployee.findFirst({ where: scopedWhere(scopeOf(viewer), id, nowOf(opts)), select: { id: true, linkedUserId: true } }) : null;
  if (!row) return refuse(T.noAccess);
  if (row.linkedUserId && row.linkedUserId === viewer.userId) return refuse(T.self);
  const visible = kind === "WRITTEN_WARNING" ? true : typeof x.visibleToEmployee === "boolean" ? x.visibleToEmployee : kind !== "NOTE";
  const n = await db.hrReviewNote.create({
    data: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: row.id, kind, title: head, body: text, periodLabel: kind === "REVIEW" ? period : null, score: rawScore, authorUserId: viewer.userId ?? null, visibleToEmployee: visible },
    select: { id: true },
  });
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: viewer.userId ?? null, action: "hr.review_note.add", targetType: "HrReviewNote", targetId: n.id, after: { id: n.id, employeeId: row.id, kind } });
  return { ok: true, id: n.id };
}

export type ReviewNoteItem = { id: string; kind: HrReviewNoteKind; title: string; body: string; periodLabel: string | null; score: number | null; createdAt: Date; authorName: string | null; visibleToEmployee: boolean; acknowledgedAt: Date | null };
/** บันทึกของพนักงาน 1 คน (ใหม่ก่อน ≤ 200) — ผู้ดูข้อมูลบันทึกในขอบเขตเท่านั้น (ผู้ดูเงินเดือนอย่างเดียว/ตัวพนักงาน = null) */
export async function listReviewNotes(ctx: Ctx, viewer: LifeViewer, employeeId: string, opts: { now?: Date } = {}): Promise<{ items: ReviewNoteItem[] } | null> {
  if (!canSeeLifecycle(viewer)) return null;
  const id = str(employeeId);
  const db = tenantDb(ctx);
  const row = id ? await db.hrEmployee.findFirst({ where: scopedWhere(scopeOf(viewer), id, nowOf(opts)), select: { id: true, linkedUserId: true } }) : null;
  if (!row) return null;
  // r2-2: แถวของตัวเอง = เฉพาะบันทึกที่เปิดให้พนักงานเห็น (คีย์ HR ไม่เปิดบันทึกลับของตัวเอง)
  const own = !!row.linkedUserId && row.linkedUserId === viewer.userId;
  const rows = await db.hrReviewNote.findMany({ where: { employeeId: row.id, ...(own ? { visibleToEmployee: true } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200 });
  const authors = [...new Set(rows.map((r) => r.authorUserId).filter((u): u is string => !!u))];
  const names = new Map(authors.length ? (await tenantDb({ tenantId: ctx.tenantId }).user.findMany({ where: { id: { in: authors } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]) : []);
  return {
    items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, periodLabel: r.periodLabel, score: r.score, createdAt: r.createdAt, authorName: (r.authorUserId && names.get(r.authorUserId)) || null, visibleToEmployee: r.visibleToEmployee, acknowledgedAt: r.acknowledgedAt })),
  };
}

export type MyReviewNoteItem = Omit<ReviewNoteItem, "authorName" | "visibleToEmployee">;
/** บันทึกที่เปิดให้ฉันเห็น (ตัวพนักงานเอง — หาจากบัญชี ไม่รับ id จาก client) */
export async function myReviewNotes(actor: { tenantId: string; userId: string }): Promise<{ items: MyReviewNoteItem[] }> {
  const link = await employeeOfUser(actor?.tenantId ?? "", actor?.userId ?? "");
  if (!link) return { items: [] };
  const rows = await tenantDb({ tenantId: actor.tenantId, systemId: link.systemId }).hrReviewNote.findMany({ where: { employeeId: link.employeeId, visibleToEmployee: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200 });
  return { items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, periodLabel: r.periodLabel, score: r.score, createdAt: r.createdAt, acknowledgedAt: r.acknowledgedAt })) };
}

/** รับทราบบันทึกของตัวเอง (ที่เปิดให้เห็นเท่านั้น · ครั้งแรกเท่านั้นที่บันทึกเวลา) */
export async function acknowledgeReviewNote(actor: { tenantId: string; userId: string }, noteId: string, opts: { now?: Date } = {}): Promise<{ ok: true } | Fail> {
  const id = str(noteId);
  const link = id ? await employeeOfUser(actor?.tenantId ?? "", actor?.userId ?? "") : null;
  if (!link) return refuse(T.noAccess);
  const db = tenantDb({ tenantId: actor.tenantId, systemId: link.systemId });
  const n = await db.hrReviewNote.findFirst({ where: { id, employeeId: link.employeeId, visibleToEmployee: true }, select: { id: true } });
  if (!n) return refuse(T.noAccess);
  const r = await db.hrReviewNote.updateMany({ where: { id: n.id, acknowledgedAt: null }, data: { acknowledgedAt: nowOf(opts) } });
  if (r.count === 1) await writeAudit({ tenantId: actor.tenantId, actorType: "USER", actorId: actor.userId, action: "hr.review_note.ack", targetType: "HrReviewNote", targetId: n.id, after: { id: n.id, employeeId: link.employeeId } });
  return { ok: true };
}

// ═══════════════════════════ รายการรับเข้า/ออกจากงาน (R11) ═══════════════════════════
const CHECK_KINDS: readonly HrOnboardingKind[] = ["ONBOARDING", "OFFBOARDING"];
/** เริ่มรายการตรวจจากแม่แบบ (1 แถวต่อรหัส แม้กดพร้อมกัน) — event เฉพาะครั้งที่สร้างแถวจริง */
export async function startChecklist(ctx: Ctx, viewer: LifeViewer, employeeId: string, kind: string, opts: { now?: Date } = {}): Promise<{ ok: true; created: number } | Fail> {
  if (!canSeeLifecycle(viewer)) return refuse(T.noAccess);
  const k = CHECK_KINDS.find((x) => x === kind);
  const id = str(employeeId);
  if (!k || !id) return refuse(T.noAccess);
  const now = nowOf(opts);
  const scope = scopeOf(viewer);
  try {
    const created = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lock(tx, `hr:emp:${id}`);
      const emp = await tx.hrEmployee.findFirst({ where: scopedWhere(scope, id, now), select: { id: true, unitId: true, startDate: true, endDate: true, active: true, linkedUserId: true } });
      if (!emp) throw new LifeRefusal(T.noAccess);
      if (emp.linkedUserId && emp.linkedUserId === viewer.userId) throw new LifeRefusal(T.self);
      if (k === "OFFBOARDING" && emp.active) throw new LifeRefusal(T.offActive);
      const pol = policyOfSettings((await settingsOf(tx, ctx))?.settings);
      const base = (k === "ONBOARDING" ? dayOf(emp.startDate) : dayOf(emp.endDate)) ?? thaiDateKey(now);
      const tpl = k === "ONBOARDING" ? pol.onboardingTemplate : pol.offboardingTemplate;
      const n = (await tx.hrOnboardingTask.createMany({ data: taskRows(ctx, id, k, tpl, base), skipDuplicates: true })).count;
      if (n > 0) {
        const first = await tx.hrOnboardingTask.findFirst({ where: { employeeId: id, kind: k }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
        const at = (first?.createdAt ?? now).getTime();
        await emitOutbox(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: emp.unitId, type: CHECKLIST_EVENT, idempotencyKey: `${CHECKLIST_EVENT}#${id}#${k}#${at}`, payload: { employeeId: id, kind: k } });
        await auditTx(tx, ctx, viewer.userId ?? null, "hr.checklist.start", "HrEmployee", id, { employeeId: id, kind: k, created: n });
      }
      return n;
    }, TX_OPTS);
    return { ok: true, created };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}

export type ChecklistItem = { id: string; kind: HrOnboardingKind; title: string; sortOrder: number; dueDate: string | null; done: boolean; doneAt: Date | null; hasCard: boolean };
/** รายการตรวจของพนักงาน 1 คน (ผู้ดูข้อมูลบันทึกในขอบเขตเท่านั้น) */
export async function listChecklist(ctx: Ctx, viewer: LifeViewer, employeeId: string, opts: { now?: Date } = {}): Promise<{ onboarding: ChecklistItem[]; offboarding: ChecklistItem[] } | null> {
  if (!canSeeLifecycleOps(viewer)) return null;
  const id = str(employeeId);
  const db = tenantDb(ctx);
  const row = id ? await db.hrEmployee.findFirst({ where: scopedWhere(scopeOf(viewer), id, nowOf(opts)), select: { id: true, linkedUserId: true } }) : null;
  if (!row) return null;
  if (row.linkedUserId && row.linkedUserId === viewer.userId) return null; // r2-2: รายการตรวจของตัวเอง = ไม่เห็น (Q7)
  const rows = await db.hrOnboardingTask.findMany({ where: { employeeId: row.id }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { id: "asc" }], take: 100 });
  const item = (r: (typeof rows)[number]): ChecklistItem => ({ id: r.id, kind: r.kind, title: r.title, sortOrder: r.sortOrder, dueDate: dayOf(r.dueDate), done: !!r.doneAt, doneAt: r.doneAt, hasCard: !!r.kanbanCardId });
  return { onboarding: rows.filter((r) => r.kind === "ONBOARDING").map(item), offboarding: rows.filter((r) => r.kind === "OFFBOARDING").map(item) };
}

/** ติ๊ก/เลิกติ๊กรายการตรวจ */
export async function setTaskDone(ctx: Ctx, viewer: LifeViewer, taskId: string, done: boolean, opts: { now?: Date } = {}): Promise<{ ok: true; employeeId: string } | Fail> {
  if (!canSeeLifecycleOps(viewer)) return refuse(T.noAccess);
  const id = str(taskId);
  const db = tenantDb(ctx);
  const task = id ? await db.hrOnboardingTask.findFirst({ where: { id }, select: { id: true, employeeId: true } }) : null;
  const now = nowOf(opts);
  const row = task ? await db.hrEmployee.findFirst({ where: scopedWhere(scopeOf(viewer), task.employeeId, now), select: { id: true, linkedUserId: true } }) : null;
  if (!task || !row) return refuse(T.noAccess);
  if (row.linkedUserId && row.linkedUserId === viewer.userId) return refuse(T.self);
  await db.hrOnboardingTask.updateMany({ where: { id: task.id }, data: done ? { doneAt: now, doneById: viewer.userId ?? null } : { doneAt: null, doneById: null } });
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: viewer.userId ?? null, action: "hr.checklist.task", targetType: "HrOnboardingTask", targetId: task.id, after: { taskId: task.id, employeeId: task.employeeId, done } });
  return { ok: true, employeeId: task.employeeId };
}

// ═══════════════════════════ สะพานบอร์ดงาน (ผู้เรียก = src/lib/platform/hr-lifecycle-bridges.ts เท่านั้น) ═══════════════════════════
/** ชื่อ + สาขาของพนักงาน (สำหรับหัวการ์ด — ไม่มีข้อมูลอื่น) */
export async function cardSubjectOf(ctx: Ctx, employeeId: string): Promise<{ name: string; unitId: string | null; linkedUserId: string | null } | null> {
  const id = str(employeeId);
  if (!id) return null;
  const r = await tenantDb(ctx).hrEmployee.findFirst({ where: { id }, select: { name: true, unitId: true, linkedUserId: true } });
  return r ? { name: r.name, unitId: r.unitId, linkedUserId: r.linkedUserId } : null;
}
/** รายการตรวจที่ยังไม่เสร็จ (id · หัวข้อจากแม่แบบ · กำหนด) */
export async function openTasksOf(ctx: Ctx, employeeId: string, kind: string): Promise<{ id: string; label: string; dueDate: Date | null; cardId: string | null }[]> {
  const k = CHECK_KINDS.find((x) => x === kind);
  const id = str(employeeId);
  if (!k || !id) return [];
  const rows = await tenantDb(ctx).hrOnboardingTask.findMany({ where: { employeeId: id, kind: k, doneAt: null }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 50, select: { id: true, title: true, dueDate: true, kanbanCardId: true } });
  return rows.map((r) => ({ id: r.id, label: r.title, dueDate: r.dueDate, cardId: r.kanbanCardId }));
}
/** ผูกการ์ดกับรายการตรวจ (ครั้งแรกเท่านั้น) */
export async function linkTaskCard(ctx: Ctx, taskId: string, cardId: string): Promise<boolean> {
  const id = str(taskId);
  const c = str(cardId);
  if (!id || !c) return false;
  return (await tenantDb(ctx).hrOnboardingTask.updateMany({ where: { id, kanbanCardId: null }, data: { kanbanCardId: c } })).count === 1;
}

/** บอร์ด ACTIVE ของระบบบอร์ดงานในร้าน (ตัวเลือกในหน้าตั้งค่า — ผู้ดูข้อมูลบันทึกเท่านั้น) */
export async function lifecycleBoards(ctx: Ctx, viewer: LifeViewer): Promise<{ id: string; name: string }[]> {
  if (!canSeeLifecycle(viewer)) return [];
  const systems = await tenantDb({ tenantId: ctx.tenantId }).appSystem.findMany({ where: { tenantId: ctx.tenantId, type: "KANBAN" }, select: { id: true }, take: 50 });
  const out: { id: string; name: string }[] = [];
  for (const s of systems) {
    const rows = await tenantDb({ tenantId: ctx.tenantId, systemId: s.id }).kanbanBoard.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { createdAt: "asc" }, take: 100 });
    out.push(...rows);
  }
  return out;
}

/** บัญชีนี้ผูกกับพนักงานคนนี้ไหม (หน้าโปรไฟล์ซ่อนปุ่มที่ทำกับตัวเองไม่ได้) */
export async function isLinkedTo(ctx: Ctx, userId: string | null | undefined, employeeId: string): Promise<boolean> {
  const u = str(userId);
  const id = str(employeeId);
  if (!u || !id) return false;
  return (await tenantDb(ctx).hrEmployee.count({ where: { id, linkedUserId: u } })) > 0;
}

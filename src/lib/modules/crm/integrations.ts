// integrations.ts — "เชื่อมต่อทุกระบบ" ของ CRM v2 (ใบ C3.6 · พิมพ์เขียว §9 · §4.5 · ภาพ 17 · addendum ผู้เขียนข้อสอบข้อ 1–7 · มติผู้คุมงาน 26 ก.ย.)
//
// ผิวของไฟล์ (สัญญาข้อสอบ qc-crm-c3.6):
//   integrationStatus(ctx, actor, { now? })   → { systems: Row[24] (ลำดับ SYSTEM_DEFS), jobs }      คีย์ crm.settings.manage
//   getTargets(ctx, actor) / setTargets(ctx, actor, patch)                                             คีย์ crm.settings.manage
//   targetPicker(ctx, actor)                  → ข้อมูลของตัวเลือก 5 ชนิด (ค่าที่เก็บ · ค่าอัตโนมัติ · ตัวเลือก) สำหรับหน้า
//   resolveCrmTargets(tenantId, crmSystemId)  → { member, account, kanban, chat, inventory }   ← ตัวตัดสินปลายทาง "ตัวเดียว"
//   resolveCrmTargetsDetailed(…)              → ค่าเดียวกัน + ที่มา (target | link | only | null)
//   listTargetCandidates(tenantId, kind)      → { id, name, active }[]                          ← raw lookup ตัวเดียวของระบบปลายทาง
//
// 🔴 ONE resolver (มติผู้คุมงาน): จุดที่เคยหยิบระบบปลายทางเอง 7 จุด (member-bridges#onCrmDealWon · contacts convert · consents ·
//    deals lines · activities kanban · companies account · automation SEND_LINE) ต้องผ่านสองฟังก์ชันล่างเท่านั้น
//    (ข้อสอบ C3.6-S2.4 สแกนหา `appSystem.find*/count({ type: "MEMBER"|… })` ที่หลงเหลือนอกไฟล์นี้)
// 🔴 ลำดับของตัวตัดสิน (ต่อชนิด): (1) ค่าที่ร้านเลือก ถ้าเป็นระบบชนิดนั้นที่ **เปิดใช้อยู่ในร้านเดียวกัน** (id ค้าง/ร้านอื่น/ผิดชนิด =
//    เมินเงียบ ๆ ไม่เคยคืนออกไป — AUDIT-CLASS X1) → (2) ระบบชนิดนั้นที่ผูกสาขา (AppSystemUnit) เดียวกับระบบ CRM (เก่าสุดก่อน) ·
//    บัญชี = สมุดของ AccountSystemLink (`accountSystemForCrm`) → (3) ระบบเดียวของร้านที่เปิดใช้ → (4) null = ผู้เรียกทำแบบเดิม
//    (ทางอ่านไล่ทุกระบบของชนิดนั้นได้ · ทางเขียนไม่ทำอะไร) · ไม่มี actor / ไม่มีประตู uiVersion (สะพาน `onCrmDealWon` เดิมใช้ตัวนี้)
// 🔴 การเขียน `settings.crm.targets` = `setCrmTargetKeys` (jsonb_set คำสั่งเดียว — settings.ts) ใน tx ที่ล็อกแถวไว้อ่านค่า "ก่อน"
//    ให้แถวประวัติ (ไม่เคยเขียนค่าที่อ่านมากลับ = ไม่มี read-modify-write · AUDIT-CLASS X3)
import { Prisma } from "@prisma/client";
import type { MemberActor } from "@/lib/modules/member";
import { FIXED_PAGE_SYSTEMS, SYSTEM_DEFS } from "@/lib/systems";
import { prisma } from "./db";
import { crmCan } from "./access";
import { parseCrmSettings, setCrmTargetKeys } from "./settings";
import { CrmV2DisabledError } from "./ui-version";
import {
  CRM_TARGET_KINDS,
  INTEGRATION_EVENTS,
  INTEGRATION_WINDOW_DAYS,
  JOB_FAILED_MSG,
  IntegrationsError,
  TARGET_KEY,
  TARGET_LABEL,
  TARGET_TYPE,
  crmTargetsOf,
  type CrmTargetKind,
  type CrmTargetSettings,
  type CrmTargets,
  type CrmTargetsDetailed,
  type IntegrationJobRow,
  type IntegrationRow,
  type IntegrationStatus,
  type TargetCandidate,
} from "./integrations-shared";

export { CRM_TARGET_KINDS, IntegrationsError };
export type { CrmTargetKind, CrmTargetSettings, CrmTargets, CrmTargetsDetailed, IntegrationJobRow, IntegrationRow, IntegrationStatus, TargetCandidate };

export type IntegrationsCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
type Actor = MemberActor;
type SysRow = { id: string; settings: Prisma.JsonValue };
type TargetSystemType = (typeof TARGET_TYPE)[CrmTargetKind];

const accountFacade = () => import("@/lib/modules/account");

const MSG_NO_SYSTEM = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const MSG_FORBIDDEN = "หน้าตั้งค่าการเชื่อมต่อใช้ได้เฉพาะผู้ที่ได้รับสิทธิ์ตั้งค่า CRM — ขอสิทธิ์จากเจ้าของร้าน";
const TX_OPTS = { maxWait: 20_000, timeout: 30_000 } as const;
const TARGET_TYPES: readonly TargetSystemType[] = CRM_TARGET_KINDS.map((k) => TARGET_TYPE[k]);
const KIND_OF_TYPE = new Map<string, CrmTargetKind>(CRM_TARGET_KINDS.map((k) => [TARGET_TYPE[k], k]));
const DAY_MS = 24 * 60 * 60_000;
const STATUS_TIMEOUT_MS = 8_000;

// ───────────────────────── ด่านทางเข้าของคน ─────────────────────────

async function loadCrm(tenantId: string, systemId: string): Promise<SysRow | null> {
  if (typeof tenantId !== "string" || typeof systemId !== "string" || !tenantId || !systemId) return null;
  // AUDIT-CLASS X1: ระบบต้องเป็น CRM ของร้านใน ctx — id จากหน้าจอเชื่อไม่ได้ (ร้านอื่น/ชนิดอื่น = ไม่พบ)
  return prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { id: true, settings: true } });
}

/** ระบบของร้าน (ไม่พบ = NOT_FOUND) → uiVersion 2 (R-E.14 · ไม่ใช่ = CrmV2DisabledError) → คีย์ `crm.settings.manage` (FORBIDDEN) */
async function enter(ctx: IntegrationsCtx, actor: Actor | null | undefined): Promise<SysRow> {
  if (!actor || actor.role === "CUSTOMER") throw new IntegrationsError("NOT_FOUND", MSG_NO_SYSTEM);
  const sys = await loadCrm(ctx?.tenantId, ctx?.systemId);
  if (!sys) throw new IntegrationsError("NOT_FOUND", MSG_NO_SYSTEM);
  if (parseCrmSettings(sys.settings).uiVersion !== 2) throw new CrmV2DisabledError();
  // AUDIT-CLASS X2: ตัวตัดสินคีย์ตัวเดียวของ CRM (access.ts)
  if (!crmCan(actor, "crm.settings.manage")) throw new IntegrationsError("FORBIDDEN", MSG_FORBIDDEN);
  return sys;
}

// ───────────────────────── ระบบปลายทาง: raw lookup ตัวเดียว + ตัวตัดสิน ─────────────────────────

type TargetSystem = { id: string; name: string; type: string; active: boolean; createdAt: Date };

/** ทุกระบบชนิดปลายทางของร้าน (เรียง: เปิดใช้ก่อน แล้วเก่า → ใหม่) — ที่เดียวที่ query AppSystem ตามชนิดปลายทาง */
async function targetSystemsOf(tenantId: string, types: readonly TargetSystemType[]): Promise<TargetSystem[]> {
  if (!tenantId || types.length === 0) return [];
  // AUDIT-CLASS X1: ผูก tenantId เสมอ — ระบบของร้านอื่นไม่มีทางเข้ามาในรายการ
  return prisma.appSystem.findMany({
    where: { tenantId, type: { in: [...types] } },
    select: { id: true, name: true, type: true, active: true, createdAt: true },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    take: 200,
  });
}

/**
 * ระบบชนิด `kind` ของร้าน `{ id, name, active }[]` (เปิดใช้ก่อน · เก่า → ใหม่) — ตัวเลือกของหน้าตั้งค่า · "ลูกค้าคนนี้อยู่ระบบสมาชิกไหน" ·
 * ทางอ่านแบบเดิมที่ไล่ทุกระบบเมื่อตัวตัดสินตอบ null
 */
export async function listTargetCandidates(tenantId: string, kind: CrmTargetKind): Promise<TargetCandidate[]> {
  const type = TARGET_TYPE[kind];
  if (!type) return [];
  return (await targetSystemsOf(tenantId, [type])).map((s) => ({ id: s.id, name: s.name, active: s.active }));
}

const EMPTY_DETAILED = (): CrmTargetsDetailed => ({
  member: { id: null, via: null },
  account: { id: null, via: null },
  kanban: { id: null, via: null },
  chat: { id: null, via: null },
  inventory: { id: null, via: null },
});

/**
 * ตัวตัดสินปลายทาง + ที่มาของคำตอบ (ดูลำดับที่หัวไฟล์) — ระบบ CRM ที่ไม่ใช่ของร้านนี้ = null ทุกชนิด
 * `kinds` = ถามเฉพาะชนิดที่ใช้ (หน้าดีล/SEND_LINE ไม่ต้องคิดครบ 5 ชนิด · ชนิดที่ไม่ได้ถาม = null) · ไม่ส่ง = ครบ 5 ชนิด
 * 🔴 เลือก "ต่อระบบ CRM" (ไม่ใช่ต่อสาขา): CRM หนึ่งระบบมีปลายทางชนิดละหนึ่ง — สาขาเป็นแค่ทางเดา (ลำดับ 2) เมื่อร้านยังไม่เลือก
 * 🔴 บัญชี: ปลายทางต้องเป็นสมุดที่ **เชื่อมกับ CRM นี้อยู่** (AccountSystemLink CRM ที่เปิด — ด่าน §9.5) · ค่าเก่าที่ลิงก์ถูกปิด = เมิน
 */
export async function resolveCrmTargetsDetailed(
  tenantId: string,
  crmSystemId: string,
  kinds?: readonly CrmTargetKind[],
  /** สมุดที่เชื่อม CRM นี้ที่ผู้เรียกอ่านมาแล้ว (targetPicker ใช้ชุดเดียวกับตัวเลือก — ไม่ถามซ้ำ) */
  linkedBooksHint?: readonly string[],
): Promise<CrmTargetsDetailed> {
  const out = EMPTY_DETAILED();
  const want = (kinds && kinds.length ? CRM_TARGET_KINDS.filter((k) => kinds.includes(k)) : [...CRM_TARGET_KINDS]) as CrmTargetKind[];
  const crm = await loadCrm(tenantId, crmSystemId);
  if (!crm || want.length === 0) return out;
  const stored = crmTargetsOf(crm.settings);
  const unitKinds = want.filter((k) => k !== "account");
  const [systems, crmUnits] = await Promise.all([
    targetSystemsOf(tenantId, want.map((k) => TARGET_TYPE[k])),
    unitKinds.length ? prisma.appSystemUnit.findMany({ where: { tenantId, systemId: crm.id }, select: { unitId: true }, take: 200 }) : Promise.resolve([] as { unitId: string }[]),
  ]);
  const active = systems.filter((s) => s.active); // เรียงเก่า → ใหม่อยู่แล้ว
  const unitIds = [...new Set(crmUnits.map((u) => u.unitId))];
  const linked = unitIds.length
    ? await prisma.appSystemUnit.findMany({
        where: { tenantId, unitId: { in: unitIds }, type: { in: unitKinds.map((k) => TARGET_TYPE[k]) } },
        select: { systemId: true },
        take: 500,
      })
    : [];
  const linkedIds = new Set(linked.map((l) => l.systemId));
  for (const kind of want) {
    const type = TARGET_TYPE[kind];
    const ofType = active.filter((s) => s.type === type);
    if (ofType.length === 0) continue;
    const storedId = stored[TARGET_KEY[kind]];
    if (kind === "account") {
      // บัญชี: (1) ค่าที่เลือก ∈ สมุดที่เชื่อม CRM นี้ · (2) สมุดที่เชื่อมเก่าสุด (= accountSystemForCrm) · (3) สมุดเดียวของร้าน
      const books = (linkedBooksHint ? [...linkedBooksHint] : await (await accountFacade()).crmLinkedBooks(tenantId, crm.id)).filter((id) => ofType.some((s) => s.id === id));
      if (storedId && books.includes(storedId)) out.account = { id: storedId, via: "target" };
      else if (books[0]) out.account = { id: books[0], via: "link" };
      else if (ofType.length === 1 && ofType[0]) out.account = { id: ofType[0].id, via: "only" };
      continue;
    }
    // (1) ค่าที่ร้านเลือก — ต้องเป็นระบบชนิดนี้ที่เปิดใช้อยู่ในร้านนี้ (AUDIT-CLASS X1: id ร้านอื่น/ผิดชนิด/ปิดแล้ว = เมิน)
    const hit = storedId ? ofType.find((s) => s.id === storedId) : undefined;
    if (hit) {
      out[kind] = { id: hit.id, via: "target" };
      continue;
    }
    // (2) ระบบที่ผูกสาขาเดียวกับ CRM (เก่าสุดก่อน) · (3) ระบบเดียวของร้าน · (4) null
    const byUnit = ofType.find((s) => linkedIds.has(s.id));
    if (byUnit) out[kind] = { id: byUnit.id, via: "link" };
    else if (ofType.length === 1 && ofType[0]) out[kind] = { id: ofType[0].id, via: "only" };
  }
  return out;
}

/** ตัวตัดสินปลายทาง "ตัวเดียว" ของ CRM — `{ member, account, kanban, chat, inventory }` (string | null) · `kinds` = ถามเฉพาะชนิด */
export async function resolveCrmTargets(tenantId: string, crmSystemId: string, kinds?: readonly CrmTargetKind[]): Promise<CrmTargets> {
  const d = await resolveCrmTargetsDetailed(tenantId, crmSystemId, kinds);
  return { member: d.member.id, account: d.account.id, kanban: d.kanban.id, chat: d.chat.id, inventory: d.inventory.id };
}

// ───────────────────────── ค่าที่ร้านเลือก (get / set) ─────────────────────────

export async function getTargets(ctx: IntegrationsCtx, actor: Actor): Promise<CrmTargetSettings> {
  const sys = await enter(ctx, actor);
  return crmTargetsOf(sys.settings);
}

const ALL_KEYS = CRM_TARGET_KINDS.map((k) => TARGET_KEY[k]);

/**
 * ตั้งระบบปลายทาง (เฉพาะคีย์ที่ส่งมา · null = ล้างเป็นอัตโนมัติ) — ทุก id ต้องเป็นระบบชนิดนั้นที่ **เปิดใช้อยู่ในร้านเดียวกัน**
 * ไม่ผ่าน = VALIDATION ข้อความไทย (ไม่เขียนอะไร ไม่มีประวัติ) · เปลี่ยนจริง = แถว AuditLog `crm.integrations.targets` 1 แถว (X9)
 */
export async function setTargets(ctx: IntegrationsCtx, actor: Actor, patch: Partial<CrmTargetSettings>): Promise<CrmTargetSettings> {
  const sys = await enter(ctx, actor);
  const input = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  const clean: Record<string, string | null> = {};
  const want: { kind: CrmTargetKind; id: string }[] = [];
  for (const kind of CRM_TARGET_KINDS) {
    const key = TARGET_KEY[kind];
    if (!Object.prototype.hasOwnProperty.call(input, key) || input[key] === undefined) continue;
    const v = input[key];
    if (v === null || v === "") {
      clean[key] = null;
      continue;
    }
    if (typeof v !== "string" || !v.trim() || v.length > 64) throw new IntegrationsError("VALIDATION", `${TARGET_LABEL[kind]}: เลือกระบบจากรายการ`);
    clean[key] = v.trim();
    want.push({ kind, id: v.trim() });
  }
  if (Object.keys(clean).length === 0) return crmTargetsOf(sys.settings);
  if (want.length > 0) {
    // AUDIT-CLASS X1: id ต้องเป็นระบบของร้านนี้ + ชนิดตรง + เปิดใช้อยู่ — ของร้านอื่น/ชนิดอื่น/ปิดแล้ว = ปฏิเสธ (ไม่บอกว่ามีอยู่)
    const systems = await targetSystemsOf(ctx.tenantId, [...new Set(want.map((w) => TARGET_TYPE[w.kind]))]);
    for (const w of want) {
      const ok = systems.some((s) => s.id === w.id && s.active && s.type === TARGET_TYPE[w.kind]);
      if (!ok) throw new IntegrationsError("VALIDATION", `${TARGET_LABEL[w.kind]}: ระบบที่เลือกไม่ใช่ระบบชนิดนี้ที่เปิดใช้อยู่ในร้าน — เลือกใหม่จากรายการ`);
    }
  }
  const after = await prisma.$transaction(async (tx) => {
    // ล็อกแถวไว้อ่านค่า "ก่อน" ของแถวประวัติ — ตัวเขียนยังเป็น jsonb_set คำสั่งเดียวที่ merge เฉพาะคีย์ที่ส่งมา (AUDIT-CLASS X3)
    const cur = await tx.$queryRaw<{ targets: unknown }[]>`
      SELECT "settings"->'crm'->'targets' AS "targets" FROM "AppSystem"
      WHERE "id" = ${sys.id} AND "tenantId" = ${ctx.tenantId} AND "type" = 'CRM' FOR UPDATE`;
    if (cur.length === 0) throw new IntegrationsError("NOT_FOUND", MSG_NO_SYSTEM);
    const before = crmTargetsOf({ crm: { targets: cur[0]?.targets ?? {} } });
    // บัญชี: ตรวจใต้ล็อกแถวเดียวกัน (สองคนสลับสมุดพร้อมกันเห็นค่า "ก่อน" ชุดเดียวกับที่เขียน) · อ่านผ่าน tx นี้ทั้งหมด (ไม่ขอ connection เพิ่ม)
    if (Object.prototype.hasOwnProperty.call(clean, "accountSystemId")) await checkAccountSwitch(ctx, sys.id, before.accountSystemId, clean.accountSystemId ?? null, tx);
    const raw = await setCrmTargetKeys({ tenantId: ctx.tenantId, systemId: sys.id }, clean, tx);
    if (raw === null) throw new IntegrationsError("NOT_FOUND", MSG_NO_SYSTEM);
    const next = crmTargetsOf({ crm: { targets: raw } });
    const changed = ALL_KEYS.some((k) => before[k] !== next[k]);
    if (changed) {
      // AUDIT-CLASS X9: การเปลี่ยนทุกครั้งมีแถวประวัติ (id ล้วน — ไม่มีข้อมูลบุคคล)
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorType: "USER",
          actorId: ctx.actorUserId ?? actor.userId ?? null,
          action: "crm.integrations.targets",
          targetType: "AppSystem",
          targetId: sys.id,
          before: before as unknown as Prisma.InputJsonValue,
          after: next as unknown as Prisma.InputJsonValue,
        },
      });
    }
    return next;
  }, TX_OPTS);
  return after;
}

/**
 * AUDIT-CLASS X1 (บัญชี · มติผู้ตรวจ C3.6 S3): ปลายทางบัญชีต้องเป็นสมุดที่ **เชื่อมกับ CRM นี้อยู่** (AccountSystemLink CRM ที่เปิด —
 * ไม่ข้ามด่าน §9.5) · และเมื่อสมุดที่ใช้จริงจะเปลี่ยน บริษัทของระบบนี้ต้องไม่ผูกผู้ติดต่อบัญชีของเล่มอื่นอยู่ (ไม่งั้นยอดค้าง/เอกสาร
 * ของบริษัทเหล่านั้นหายจากหน้า 360 เงียบ ๆ) ⇒ ปฏิเสธพร้อมบอกเหตุ (ยังไม่มีทางย้ายการผูกอัตโนมัติ — ต้องทำที่ระบบบัญชีก่อน)
 */
async function checkAccountSwitch(ctx: IntegrationsCtx, crmSystemId: string, storedBefore: string | null, bookId: string | null, tx: Prisma.TransactionClient): Promise<void> {
  const acct = await accountFacade();
  const linked = await acct.crmLinkedBooks(ctx.tenantId, crmSystemId, tx);
  if (bookId && !linked.includes(bookId)) {
    throw new IntegrationsError("VALIDATION", `${TARGET_LABEL.account}: สมุดบัญชีที่เลือกยังไม่ได้เชื่อมกับระบบ CRM นี้ — เชื่อม CRM ที่หน้า "การเชื่อมต่อ" ของระบบบัญชีเล่มนั้นก่อน แล้วค่อยเลือก`);
  }
  // สมุดที่ companies ใช้จริง = ค่าที่เลือก (ถ้ายังเชื่อมอยู่) → สมุดที่เชื่อมเก่าสุด (กติกาเดียวกับตัวตัดสิน · ไม่ใช้ "สมุดเดียวของร้าน")
  const nowBook = storedBefore && linked.includes(storedBefore) ? storedBefore : (linked[0] ?? null);
  const nextBook = bookId ?? linked[0] ?? null; // ล้างค่า = กลับไปใช้สมุดที่เชื่อมเก่าสุด
  if (nextBook === nowBook) return;
  // บริษัทอ่านผ่านบริการบริษัทเท่านั้น (C1.3-S0.3) · โหลดตอนใช้ (companies.ts import ไฟล์นี้ = วงโหลดถ้า import หัวไฟล์)
  const ids = await (await import("./companies")).heldAccountContactIds({ tenantId: ctx.tenantId, systemId: crmSystemId }, tx);
  if (ids.length === 0) return;
  const outside = nextBook ? await acct.accountContactsInOtherBooks(ctx.tenantId, nextBook, ids, tx) : ids.length;
  if (outside > 0) {
    throw new IntegrationsError(
      "VALIDATION",
      `${TARGET_LABEL.account}: มีบริษัท ${outside.toLocaleString("th-TH")} รายในระบบ CRM นี้ที่ผูกกับผู้ติดต่อของสมุดบัญชีเล่มเดิมอยู่ — เปลี่ยนสมุดตอนนี้จะทำให้ยอดค้างและเอกสารของบริษัทเหล่านั้นหายจากหน้า CRM จึงยังเปลี่ยนไม่ได้ (ต้องย้ายการผูกบริษัทไปเล่มใหม่ก่อน)`,
    );
  }
}

// ───────────────────────── ข้อมูลตัวเลือกของหน้า ─────────────────────────

export type TargetPickerRow = {
  kind: CrmTargetKind;
  label: string;
  stored: string | null;
  resolved: string | null;
  via: CrmTargetsDetailed[CrmTargetKind]["via"];
  /** มีค่าที่เลือกไว้ แต่ระบบนั้นปิด/ถูกลบ/(บัญชี) เลิกเชื่อมแล้ว — ตอนนี้ใช้ `resolved` แทน (มติผู้ตรวจ C3.6 S4) */
  stale: boolean;
  candidates: TargetCandidate[];
};

/** ตัวเลือก 5 ชนิด (ภาพ 17 ซ้ายล่าง): ค่าที่เก็บ · ค่าที่ระบบใช้จริงตอนนี้ + ที่มา · ระบบของร้านทั้งหมด */
export async function targetPicker(ctx: IntegrationsCtx, actor: Actor): Promise<TargetPickerRow[]> {
  const sys = await enter(ctx, actor);
  const stored = crmTargetsOf(sys.settings);
  const linkedBooks = await (await accountFacade()).crmLinkedBooks(ctx.tenantId, sys.id); // ครั้งเดียว — ตัวเลือก + ตัวตัดสินใช้ชุดเดียวกัน
  const [detailed, systems] = await Promise.all([resolveCrmTargetsDetailed(ctx.tenantId, sys.id, undefined, linkedBooks), targetSystemsOf(ctx.tenantId, TARGET_TYPES)]);
  return CRM_TARGET_KINDS.map((kind) => {
    const ofKind = systems.filter((s) => KIND_OF_TYPE.get(s.type) === kind);
    // บัญชี: เลือกได้เฉพาะสมุดที่เชื่อมกับ CRM นี้ (S3) — สมุดอื่นแสดงเป็น "ยังไม่ได้เชื่อม" (ปิดไว้ · ไม่ให้เลือก)
    const candidates = ofKind.map((s) => ({ id: s.id, name: s.name, active: s.active && (kind !== "account" || linkedBooks.includes(s.id)) }));
    const storedId = stored[TARGET_KEY[kind]];
    return {
      kind,
      label: TARGET_LABEL[kind],
      stored: storedId,
      resolved: detailed[kind].id,
      via: detailed[kind].via,
      stale: !!storedId && detailed[kind].via !== "target",
      candidates,
    };
  });
}

// ───────────────────────── สถานะ 24 ระบบ + งานเบื้องหลัง ─────────────────────────

/**
 * สถานะการเชื่อมต่อของ 24 ระบบ (ลำดับ SYSTEM_DEFS) + สุขภาพงานรายนาทีทุกตัวในทะเบียน C0.5
 * enabled: หน้าคงที่ (KB · PAGES) = เปิดเสมอ · business = มี BusinessUnit ชนิดนั้นที่ยังไม่ ARCHIVED · feature = มี AppSystem ที่ active
 * lastEventAt / events7d = max(createdAt) / จำนวนใน 7 วัน ของ OutboxEvent ของร้านนี้ (ทุกสถานะ) ที่ชนิดอยู่ใน INTEGRATION_EVENTS[code]
 * AUDIT-CLASS X8: ไม่ส่ง payload ของ event ออกไปเลย (ชนิด + เวลา + จำนวนเท่านั้น)
 */
export async function integrationStatus(ctx: IntegrationsCtx, actor: Actor, opts: { now?: Date } = {}): Promise<IntegrationStatus> {
  await enter(ctx, actor);
  const now = opts.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now : new Date();
  const since = new Date(now.getTime() - 7 * DAY_MS);
  // มติผู้ตรวจ C3.6 S2: ดูย้อนหลังแค่ INTEGRATION_WINDOW_DAYS วัน (ไม่กวาดประวัติทั้งร้าน) + เพดานเวลาของคำสั่ง
  //   (index (tenantId, type, createdAt) = ผู้สมัคร C6.1 · ตอนนี้ใช้ (tenantId, type) แล้วกรองเวลาในแถว)
  const windowFrom = new Date(now.getTime() - INTEGRATION_WINDOW_DAYS * DAY_MS);
  const allTypes = [...new Set(Object.values(INTEGRATION_EVENTS).flat())];
  const [systems, units, events, jobs] = await Promise.all([
    prisma.appSystem.findMany({ where: { tenantId: ctx.tenantId, active: true }, select: { id: true, type: true }, orderBy: { createdAt: "asc" }, take: 500 }),
    prisma.businessUnit.findMany({ where: { tenantId: ctx.tenantId, status: { not: "ARCHIVED" } }, select: { id: true, type: true }, orderBy: { createdAt: "asc" }, take: 500 }),
    // AUDIT-CLASS X1: ผูก tenantId · ใช้ index (tenantId, type) · รวมในฐานข้อมูล (ไม่ดึงแถวมานับในแอป)
    allTypes.length
      ? prisma
          .$transaction(async (tx) => {
            // 🔴 set_config(…, true) = SET LOCAL (อยู่แค่ในธุรกรรมนี้ · SET ธรรมดาบน pooler รั่วข้ามไคลเอนต์) · ค่าผ่านพารามิเตอร์ ไม่ใช่ Unsafe
            await tx.$executeRaw`SELECT set_config('statement_timeout', ${String(STATUS_TIMEOUT_MS)}, true)`;
            return tx.$queryRaw<{ type: string; last: Date | null; n7: number }[]>`
              SELECT "type", max("createdAt") AS "last", (count(*) FILTER (WHERE "createdAt" >= ${since}))::int AS "n7"
              FROM "OutboxEvent" WHERE "tenantId" = ${ctx.tenantId} AND "type" = ANY(${allTypes}::text[]) AND "createdAt" >= ${windowFrom}
              GROUP BY "type"`;
          }, TX_OPTS)
          // เกินเวลา/ล้ม = หน้ายังเปิดได้ (สถิติเหตุการณ์ว่าง + ธง eventsUnavailable) — ไม่พาหน้าตั้งค่าทั้งหน้าล่ม
          .catch(() => null)
      : Promise.resolve([] as { type: string; last: Date | null; n7: number }[]),
    // ทะเบียนงานอ่านไม่ได้ = รายการงานว่าง (แบบหน้ากฎอัตโนมัติ) ไม่ใช่หน้าพัง
    minuteJobs().catch(() => [] as IntegrationJobRow[]),
  ]);
  const eventsUnavailable = events === null;
  const byType = new Map((events ?? []).map((e) => [e.type, e]));
  const rows: IntegrationRow[] = SYSTEM_DEFS.map((d) => {
    const fixed = Object.prototype.hasOwnProperty.call(FIXED_PAGE_SYSTEMS, d.code);
    const ids = fixed
      ? []
      : d.kind === "business"
        ? units.filter((u) => u.type === d.code).map((u) => u.id)
        : systems.filter((s) => s.type === d.code).map((s) => s.id);
    let last: Date | null = null;
    let lastType: string | null = null;
    let n7 = 0;
    for (const t of INTEGRATION_EVENTS[d.code] ?? []) {
      const e = byType.get(t);
      if (!e) continue;
      n7 += Number(e.n7 ?? 0);
      const at = e.last ? new Date(e.last) : null;
      if (at && (!last || at.getTime() > last.getTime())) {
        last = at;
        lastType = t;
      }
    }
    return {
      code: d.code,
      no: d.no,
      label: d.label,
      kind: d.kind,
      enabled: fixed || ids.length > 0,
      systemIds: ids,
      lastEventAt: last ? last.toISOString() : null,
      lastEventType: lastType,
      events7d: n7,
    };
  });
  return { systems: rows, jobs, eventsUnavailable };
}

/** สุขภาพงานรายนาที — ทะเบียนเดียวของ C0.5 (`getMinuteJobStatus`) · โหลดตอนใช้ (ไม่ลากทะเบียนเข้ากราฟตอนโหลดไฟล์) */
async function minuteJobs(): Promise<IntegrationJobRow[]> {
  const mj = await import("@/lib/platform/minute-jobs");
  const list = await mj.getMinuteJobStatus();
  return list
    .map((j) => ({
      name: j.name,
      everyMinutes: j.everyMinutes ?? null,
      lastRunAt: j.lastRunAt ? new Date(j.lastRunAt).toISOString() : null,
      lastOkAt: j.lastOkAt ? new Date(j.lastOkAt).toISOString() : null,
      // มติผู้ตรวจ C3.6 S1: รายละเอียดข้อผิดพลาดของงาน (OpsEvent.detail) เป็นของทั้งแพลตฟอร์ม (stack/ค่าดิบ) — ห้ามถึงมือร้าน
      //   ⇒ DTO มีแค่สถานะ + เวลา + เหตุผลไทยกลาง ๆ · AUDIT-CLASS X8
      failed: !!j.lastError,
      reason: j.lastError ? JOB_FAILED_MSG : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

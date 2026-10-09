// settings-overview.ts — ตัวอ่านของหน้าตั้งค่า POS (P1.18 S · R2 ภาพรวมค่าตั้ง · R10 แท็บพนักงานและสิทธิ์)
//
// 🔴 อ่านอย่างเดียว · ทุกค่ามาจากตัวอ่านเดิมของคีย์นั้น (ไม่มีตัวแกะที่สอง) · คำปฏิเสธเป็นข้อมูล ไม่โยน
// 🔴 ขอบเขต: ร้าน (session) + ระบบ POS + สาขาที่ผูก POS นี้ — ร้านอื่น / ระบบอื่น / สาขาไม่ผูก / id มั่ว = NOT_FOUND
// 🔴 posSettingsOverview: แคชเชียร์ (pos.sale.create) อ่านได้แบบดูอย่างเดียว · canEdit ต่อส่วน = สิทธิ์จริงของตัวเขียนส่วนนั้น
//    (general/caps = pos.settings.manage ครบทุกสาขา · unitStock/staff = ที่สาขานี้ · receipt = pos.device.manage ครบทุกสาขา (FU-c) · payment = เจ้าของ)

import { evaluate } from "@/lib/core/rbac";
import { listPoliciesForEntities } from "@/lib/modules/approval"; // POS P1.18 ▸ R10 มติ Q4 (facade อ่านล้วน) ◂
import { prisma } from "./db";
import { listStaffForDevice } from "./staff-pin";
import type { StaffListItem } from "./register-shared";
import { posDiscountCaps } from "./register-shared";
import { parsePosPaymentSettings } from "./payment-settings";
import { unitOversellPolicy } from "./service";
import { canOnAllLinkedUnits, ctxOk, PERM_SETTINGS_MANAGE, posGeneralSettingsOf, settingsMembership, settingsRefuse, unitLinkedToPos, type PosSettingsWriterActor } from "./settings-general";
import type { PosSettingsCanEdit, PosGeneralSettings, PosOversellPolicy, PosSettingsRefusal } from "./settings-shared";
import type { PosDiscountCaps } from "./register-shared";
import type { PosPaymentSettings } from "./payment-settings";

type UnitCtx = { tenantId: string; systemId: string; unitId: string };

export type PosSettingsOverview = {
  ok: true;
  canEdit: PosSettingsCanEdit;
  general: PosGeneralSettings;
  caps: PosDiscountCaps;
  unitStock: { unitId: string; oversellPolicy: PosOversellPolicy };
  serviceCharge: PosPaymentSettings["serviceCharge"];
  tip: PosPaymentSettings["tip"];
};
export type PosSettingsOverviewResult = PosSettingsOverview | PosSettingsRefusal;

const unitCtxOk = (ctx: unknown): ctx is UnitCtx => ctxOk(ctx) && typeof (ctx as UnitCtx).unitId === "string" && !!(ctx as UnitCtx).unitId && (ctx as UnitCtx).unitId.length <= 64;

/** ขอบเขตร่วม: ระบบ POS ของร้านนี้ + สาขาผูก POS นี้ (ไม่ใช่ = NOT_FOUND) */
async function scopeOf(ctx: unknown, actor: unknown) {
  if (!unitCtxOk(ctx)) return settingsRefuse("NOT_FOUND");
  const m = settingsMembership(actor);
  if (!m) return settingsRefuse("PERMISSION_DENIED");
  const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { id: true, settings: true } });
  if (!sys || !(await unitLinkedToPos(prisma, ctx, ctx.unitId))) return settingsRefuse("NOT_FOUND");
  return { ctx, m, settings: sys.settings as unknown };
}

/** R2 — ภาพรวมค่าตั้งของหน้า "ทั่วไป" (อ่านด้วย pos.sale.create หรือ pos.settings.manage ที่สาขา) */
export async function posSettingsOverview(ctx: UnitCtx, actor: PosSettingsWriterActor, _input: unknown = {}): Promise<PosSettingsOverviewResult> {
  try {
    const s = await scopeOf(ctx, actor);
    if ("ok" in s) return s;
    const { m } = s;
    const unitId = s.ctx.unitId;
    const canRead = evaluate(m, { module: "pos", action: "pos.sale.create", unitId }) || evaluate(m, { module: "pos", action: PERM_SETTINGS_MANAGE, unitId });
    if (!canRead) return settingsRefuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ดูค่าตั้งของสาขานี้");
    const sctx = { tenantId: s.ctx.tenantId, systemId: s.ctx.systemId };
    const [allSettings, allReceipt] = await Promise.all([
      canOnAllLinkedUnits(prisma, sctx, m, PERM_SETTINGS_MANAGE),
      canOnAllLinkedUnits(prisma, sctx, m, "pos.device.manage"),
    ]);
    const atUnit = evaluate(m, { module: "pos", action: PERM_SETTINGS_MANAGE, unitId });
    const pay = parsePosPaymentSettings(s.settings);
    return {
      ok: true,
      canEdit: { general: allSettings, caps: allSettings, unitStock: atUnit, staff: atUnit, payment: m.role === "OWNER", receipt: allReceipt },
      general: posGeneralSettingsOf(s.settings),
      caps: posDiscountCaps(s.settings),
      unitStock: { unitId, oversellPolicy: await unitOversellPolicy(prisma, s.ctx.tenantId, unitId) },
      serviceCharge: pay.serviceCharge,
      tip: pay.tip,
    };
  } catch (e) {
    console.error("[pos/settings-overview] overview", e);
    return settingsRefuse("UNKNOWN");
  }
}

// ═══════════ R10 แท็บ "พนักงานและสิทธิ์" (ภาพ 17C · อ่านอย่างเดียว) ═══════════
/** แถวของตารางสิทธิ์ตามบทบาท (ลำดับ = ภาพ 17C) — permission null = แถวที่ไม่ใช่คีย์สิทธิ์ (ส่วนลด = เพดาน caps · ออเดอร์ออนไลน์ = PLANNED) */
const ROLE_ROWS: readonly { task: string; permission: string | null; planned: string | null; approval: string | null }[] = [
  { task: "sell", permission: "pos.sale.create", planned: null, approval: null },
  { task: "discount", permission: null, planned: null, approval: "POS_DISCOUNT_OVER" },
  { task: "priceOverride", permission: "pos.sale.priceOverride", planned: null, approval: null },
  { task: "void", permission: "pos.sale.void", planned: null, approval: "POS_VOID" },
  { task: "refund", permission: "pos.sale.refund", planned: null, approval: "POS_REFUND" },
  { task: "shiftOperate", permission: "pos.shift.operate", planned: null, approval: null },
  { task: "shiftManage", permission: "pos.shift.manage", planned: null, approval: null },
  { task: "productManage", permission: "pos.product.manage", planned: null, approval: null },
  { task: "stockCount", permission: "pos.stock.count", planned: null, approval: null },
  { task: "reports", permission: "pos.report.view", planned: null, approval: null },
  { task: "settings", permission: PERM_SETTINGS_MANAGE, planned: null, approval: null },
  { task: "onlineOrders", permission: null, planned: "P2.8", approval: null },
];
const POS_POLICY_TYPES = ["POS_VOID", "POS_REFUND", "POS_DISCOUNT_OVER"] as const;

export type PosRoleMatrixRow = {
  task: string;
  permission: string | null;
  planned: string | null;
  owner: boolean;
  manager: boolean;
  /** STAFF ที่เข้าสาขานี้ได้ (Membership ที่ตอบรับแล้ว) — holders = คนที่มีคีย์นี้ (ชัดแจ้งหรือ pos.*) */
  staff: { holders: number; total: number };
  /** มีกติกาอนุมัติ POS_* ที่ active และใช้กับ POS/สาขานี้ */
  needsApproval: boolean;
};
export type PosApprovalPolicyView = {
  id: string;
  entityType: string;
  name: string;
  thresholdSatang: number | null;
  systemId: string | null;
  unitId: string | null;
  steps: { order: number; approverRole: string; approverUserId: string | null }[];
};
export type PosStaffOverviewResult =
  | { ok: true; staff: StaffListItem[]; roleMatrix: PosRoleMatrixRow[]; caps: PosDiscountCaps; approvals: PosApprovalPolicyView[] }
  | PosSettingsRefusal;

/** R10 — แท็บพนักงานและสิทธิ์ของสาขานี้ (pos.settings.manage ที่สาขา · มติ 5) — แก้สิทธิ์รายคนอยู่ที่ /app/settings/staff · แก้กติกาที่ /app/settings/approval */
export async function posStaffOverview(ctx: UnitCtx, actor: PosSettingsWriterActor, _input: unknown = {}): Promise<PosStaffOverviewResult> {
  try {
    const s = await scopeOf(ctx, actor);
    if ("ok" in s) return s;
    const { m } = s;
    const { tenantId, systemId, unitId } = s.ctx;
    if (!evaluate(m, { module: "pos", action: PERM_SETTINGS_MANAGE, unitId })) return settingsRefuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ดูพนักงานและสิทธิ์ของสาขานี้");
    const list = await listStaffForDevice({ tenantId, systemId, unitId }, { unitId });
    if (!list.ok) return settingsRefuse(list.code === "NOT_FOUND" ? "NOT_FOUND" : "UNKNOWN");
    // มติ 7: STAFF ที่เข้าสาขานี้ได้ (unitAccess มีสาขานี้ หรือ "*") · ผู้ถือคีย์ = evaluate ที่สาขานี้ (คีย์ชัดแจ้งหรือ pos.*)
    const members = await prisma.membership.findMany({ where: { tenantId, role: "STAFF", acceptedAt: { not: null } }, select: { unitAccess: true, permissions: true } });
    const staffAt = members
      .map((x) => ({ role: "STAFF" as const, unitAccess: Array.isArray(x.unitAccess) ? x.unitAccess.filter((u): u is string => typeof u === "string") : [], permissions: (x.permissions && typeof x.permissions === "object" && !Array.isArray(x.permissions) ? x.permissions : {}) as Record<string, unknown> }))
      .filter((x) => x.unitAccess.includes(unitId) || x.unitAccess.includes("*"));
    // มติ Q4 + มติ 6: กติกา POS_* ที่ active และใช้กับ POS นี้ที่สาขานี้ (ทั้งร้าน · systemId นี้ · unitId นี้)
    const policies = (await listPoliciesForEntities({ tenantId }, POS_POLICY_TYPES)).filter(
      (p) => p.active && (p.systemId == null || p.systemId === systemId) && (p.unitId == null || p.unitId === unitId),
    );
    const approvals: PosApprovalPolicyView[] = policies.map((p) => ({
      id: p.id,
      entityType: p.entityType,
      name: p.name,
      thresholdSatang: p.thresholdSatang ?? null,
      systemId: p.systemId ?? null,
      unitId: p.unitId ?? null,
      steps: p.steps.map((st) => ({ order: st.order, approverRole: String(st.approverRole), approverUserId: st.approverUserId ?? null })),
    }));
    const roleMatrix: PosRoleMatrixRow[] = ROLE_ROWS.map((r) => ({
      task: r.task,
      permission: r.permission,
      planned: r.planned,
      owner: r.permission !== null,
      manager: r.permission !== null,
      staff: {
        holders: r.permission ? staffAt.filter((x) => evaluate(x, { module: "pos", action: r.permission!, unitId })).length : 0,
        total: staffAt.length,
      },
      needsApproval: !!r.approval && approvals.some((p) => p.entityType === r.approval),
    }));
    return { ok: true, staff: list.items, roleMatrix, caps: posDiscountCaps(s.settings), approvals };
  } catch (e) {
    console.error("[pos/settings-overview] staff", e);
    return settingsRefuse("UNKNOWN");
  }
}

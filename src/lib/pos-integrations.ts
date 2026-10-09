// pos-integrations.ts — composition root ของการ์ด "การเชื่อมต่อระบบ SHARK" ในหน้าตั้งค่า POS + สวิตช์ลงบัญชี (P1.18 S · R7 R8 · CD2 CD3)
//
// 🔴 ทำไมอยู่นอก `src/lib/modules/pos/`: การ์ดต้องอ่านสถานะของ CRM / แชท / บอร์ดงาน / บัญชี — เส้น pos→chat/kanban/hr ไม่อยู่ใน
//    allowlist ของ fitness F2 (ตั้งใจให้ POS ไม่รู้จักโมดูลเหล่านั้น) ⇒ ประกอบที่นี่แบบเดียวกับ `pos-receipt-bridges.ts`
//    โมดูลอื่นเข้าผ่าน facade/ตัวอ่านกลางเท่านั้น (account facade · crm-bridges/core ตัวอ่านประตูเดียวกับสะพาน CRM) ·
//    อ่านแถวของโมดูลอื่นแบบอ่านอย่างเดียว (ไม่มีการเขียนตารางลิงก์/ระบบตรง — สวิตช์บัญชีเขียนผ่าน account facade)
// 🔴 การ์ดบอกความจริงเท่านั้น (CD3): facts.live = ความสามารถที่มีในโค้ดวันนี้ · ที่ยังไม่มี = live:false + phase
// 🔴 สวิตช์ที่ POS สลับได้มีตัวเดียว = ACCOUNT (ลิงก์ระดับ POS · CD2) · การ์ดระดับสาขา/ร้าน = สถานะ + ลิงก์ไปหน้าของเจ้าของระบบ
//    (manage.canManage = สิทธิ์ของเจ้าของระบบนั้น ไม่ใช่สิทธิ์ POS)
// 🔴 คำปฏิเสธเป็นข้อมูล {ok:false, code, message ไทย} — ไม่โยน · backlog อ่านใต้ statement_timeout (เกินเวลา = null หน้ายังแสดงได้)

import type { SystemType } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { writeAudit } from "@/lib/core/audit";
import { setPosLinkEnabled } from "@/lib/modules/account";
import { bridgeOpen, crmGates } from "@/lib/platform/crm-bridges/core";
import { systemForUnit } from "@/lib/modules/system/service";
import { canOnAllLinkedUnits, ctxOk, PERM_SETTINGS_MANAGE, settingsMembership, settingsRefuse, unitLinkedToPos } from "@/lib/modules/pos/settings-general";
import { receiptSettingsOf } from "@/lib/modules/pos/receipt-settings";
import { unitOversellPolicy } from "@/lib/modules/pos/service";
import type { PosSettingsRefusal } from "@/lib/modules/pos/settings-shared";

// ═══════════ ชนิดข้อมูล (สัญญาของ P1.18U) ═══════════
export const POS_INTEGRATION_CODES = ["MEMBER", "POINT", "COUPON", "REWARD", "ACCOUNT", "INVENTORY", "HR", "CRM", "CHAT", "KANBAN", "MARKETING", "BOOKING", "AI"] as const;
export type PosIntegrationCode = (typeof POS_INTEGRATION_CODES)[number];
export type PosIntegrationState = "LINKED" | "OFF" | "NO_SYSTEM" | "PLANNED";
export type PosIntegrationScope = "UNIT" | "POS" | "TENANT" | null;
export type PosIntegrationFact = { key: string; live: boolean; phase: string | null; params?: Record<string, string | number | boolean | null> };
export type PosIntegrationCard = {
  code: PosIntegrationCode;
  state: PosIntegrationState;
  scope: PosIntegrationScope;
  target: { systemId: string; name: string } | null;
  facts: PosIntegrationFact[];
  lastActivityAt: string | null;
  manage: { href: string; canManage: boolean } | null;
};
export type PosIntegrationCardsResult =
  | { ok: true; cards: PosIntegrationCard[]; header: { linked: number; total: 13; backlog: { pending: number; failed: number } | null } }
  | PosSettingsRefusal;
export type PosAccountLinkResult = { ok: true; enabled: boolean; changed: boolean } | PosSettingsRefusal;
export type PosIntegrationOpts = { now?: Date; statementTimeoutMs?: number; testDelayMs?: number };

type UnitCtx = { tenantId: string; systemId: string; unitId: string };
type Actor = { userId: string; role: string; unitAccess?: string[]; permissions?: Record<string, unknown> };

/** §6 ตาราง facts ต่อการ์ด (ลำดับ = บรรทัดในภาพ 10) — [key, live วันนี้, phase ของที่ยังไม่มี] */
const FACTS: Record<PosIntegrationCode, readonly (readonly [string, boolean, string | null])[]> = {
  MEMBER: [["memberLookup", true, null], ["memberSpend", true, null], ["memberSignup", true, null]],
  POINT: [["pointRate", true, null], ["pointRedeem", true, null], ["pointVoidReverse", true, null]],
  COUPON: [["couponCode", true, null], ["voucherPayment", false, "P2.9"], ["couponUnitLimit", true, null]],
  REWARD: [["rewardRedeem", true, null], ["rewardNearCustomerDisplay", false, "P2.10"]],
  ACCOUNT: [["autoPost", true, null], ["taxInvoice", true, null], ["platformCommission", false, "P2.1"], ["promptpayReconcile", false, "P3.10"]],
  INVENTORY: [["stockDeduct", true, null], ["bomDeduct", false, "P2.3"], ["oversellPolicy", true, null], ["lowStockReorder", false, "P3"]],
  HR: [["shiftPinSchedule", false, "P3.5"], ["salesCommission", false, "P3.5"], ["leaveHidesShift", false, "P3.5"]],
  CRM: [["dealPaidCount", true, null], ["bigBillDeal", false, "P3.6"], ["corporateCredit", false, "P3.6"]],
  CHAT: [["lineReceipt", true, null], ["chatOrders", false, "P2.8"], ["orderStatusBot", false, "P3.7"]],
  KANBAN: [["voidBillCard", true, null], ["issueReportCard", true, null], ["stockOutShiftDiffCard", false, "P3.8"], ["shiftCloseCashCheck", false, "P3.8"]],
  MARKETING: [["happyHourPricing", false, "P2.2"], ["couponAfterPurchase", false, "P3"]],
  BOOKING: [["tableReservationsOnMap", false, "P2.4"], ["callQueueFromTable", false, "P2.4"], ["advanceBookingBill", false, "P2.7"]],
  AI: [["shiftDaySummary", false, "P3.9"], ["purchaseSuggestion", false, "P3.9"], ["anomalyDetection", false, "P3.9"]],
};
/** การ์ดที่ยังไม่มีสาย POS ↔ ระบบนั้นเลย (P1) — PLANNED พร้อมเฟส (ร้านไม่มีระบบนั้น = NO_SYSTEM · AI ไม่ใช่ SystemType = PLANNED เสมอ) */
const PLANNED_TYPE: Partial<Record<PosIntegrationCode, SystemType>> = { HR: "HR", MARKETING: "MARKETING", BOOKING: "BOOKING" };
const UNIT_CARDS: readonly PosIntegrationCode[] = ["MEMBER", "POINT", "COUPON", "INVENTORY", "REWARD"];
const BACKLOG_PENDING_MIN = 10;
const BACKLOG_TIMEOUT_MS = 3_000;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const unitCtxOk = (ctx: unknown): ctx is UnitCtx => ctxOk(ctx) && typeof (ctx as UnitCtx).unitId === "string" && !!(ctx as UnitCtx).unitId && (ctx as UnitCtx).unitId.length <= 64;
/** OWNER หรือได้รับคีย์นี้ "ชัดแจ้ง" (fail-closed แบบ canViewPayroll — MANAGER ไม่ผ่านโดยบทบาท) */
const explicitGrant = (m: MembershipCtx, key: string) => m.role === "OWNER" || m.permissions[key] === true;

function factsOf(code: PosIntegrationCode, params: Partial<Record<string, PosIntegrationFact["params"]>> = {}): PosIntegrationFact[] {
  return FACTS[code].map(([key, live, phase]) => (params[key] ? { key, live, phase, params: params[key] } : { key, live, phase }));
}
function card(code: PosIntegrationCode, state: PosIntegrationState, rest: Partial<Omit<PosIntegrationCard, "code" | "state">> = {}, params?: Partial<Record<string, PosIntegrationFact["params"]>>): PosIntegrationCard {
  const live = state === "LINKED" || state === "OFF";
  return {
    code,
    state,
    scope: live ? (rest.scope ?? null) : null,
    target: state === "LINKED" ? (rest.target ?? null) : null,
    facts: factsOf(code, params),
    lastActivityAt: state === "LINKED" ? (rest.lastActivityAt ?? null) : null,
    manage: live ? (rest.manage ?? null) : null,
  };
}

/** R7 backlog: OutboxEvent ของ POS นี้ (type pos.%) ที่ PENDING เกิน 10 นาที / FAILED — ใต้ SET LOCAL statement_timeout · พัง/เกินเวลา = null */
async function backlogOf(tenantId: string, systemId: string, now: Date, opts?: PosIntegrationOpts): Promise<{ pending: number; failed: number } | null> {
  const timeout = typeof opts?.statementTimeoutMs === "number" && opts.statementTimeoutMs > 0 ? Math.floor(opts.statementTimeoutMs) : BACKLOG_TIMEOUT_MS;
  // มติ 4: ตะขอทดสอบ — หน่วงใน tx เดียวกัน (พิสูจน์ว่า timeout ถูกตั้งจริง) · ไม่มีผลใน production · action ไม่ส่ง opts
  const delay = process.env.NODE_ENV !== "production" && typeof opts?.testDelayMs === "number" && opts.testDelayMs > 0 ? opts.testDelayMs : 0;
  const before = new Date(now.getTime() - BACKLOG_PENDING_MIN * 60_000);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('statement_timeout', ${String(timeout)}, true) AS x`;
      if (delay) await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_sleep(${delay / 1000})) s`;
      const rows = await tx.$queryRaw<{ pend: number; fail: number }[]>`
        SELECT (count(*) FILTER (WHERE status = 'PENDING' AND "createdAt" < ${before}))::int AS pend,
               (count(*) FILTER (WHERE status = 'FAILED'))::int AS fail
        FROM "OutboxEvent" WHERE "tenantId" = ${tenantId} AND "systemId" = ${systemId} AND type LIKE 'pos.%'`;
      return { pending: Number(rows[0]?.pend ?? 0), failed: Number(rows[0]?.fail ?? 0) };
    });
  } catch {
    return null;
  }
}

/** กฎ "เปิดการ์ดเมื่อยกเลิกบิล" ของระบบบอร์ดงาน (settings.integrations.cardOnVoidedSale — ค่าเดียวกับที่สะพานบอร์ดงานอ่าน) */
function voidCardRuleOn(settings: unknown): boolean {
  const integ = isRecord(settings) && isRecord(settings.integrations) ? settings.integrations : null;
  const rule = integ && isRecord(integ.cardOnVoidedSale) ? integ.cardOnVoidedSale : null;
  return !!rule && rule.enabled === true && typeof rule.boardId === "string" && rule.boardId.length > 0;
}

/** R7 — 13 การ์ดตามลำดับภาพ 10 + หัว {linked, total, backlog} · อ่านด้วย pos.sale.create หรือ pos.settings.manage ที่สาขา */
export async function posIntegrationCards(ctx: UnitCtx, actor: Actor, _input: unknown = {}, opts?: PosIntegrationOpts): Promise<PosIntegrationCardsResult> {
  try {
    if (!unitCtxOk(ctx)) return settingsRefuse("NOT_FOUND");
    const m = settingsMembership(actor);
    if (!m) return settingsRefuse("PERMISSION_DENIED");
    const { tenantId, systemId, unitId } = ctx;
    const pos = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { id: true, settings: true } });
    if (!pos || !(await unitLinkedToPos(prisma, ctx, unitId))) return settingsRefuse("NOT_FOUND");
    if (!(evaluate(m, { module: "pos", action: "pos.sale.create", unitId }) || evaluate(m, { module: "pos", action: PERM_SETTINGS_MANAGE, unitId })))
      return settingsRefuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ดูการเชื่อมต่อของสาขานี้");
    const now = opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now : new Date();

    const systems = await prisma.appSystem.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, type: true, name: true, active: true, settings: true } });
    const byId = new Map(systems.map((s) => [s.id, s]));
    const ofType = (t: SystemType) => systems.filter((s) => s.type === t);
    const cards = new Map<PosIntegrationCode, PosIntegrationCard>();
    const canLink = evaluate(m, { module: "systems", action: "systems.link.create" });

    // ── การ์ดระดับสาขา: 1 สาขา → 1 ระบบต่อชนิด (AppSystemUnit) ──
    const unitTypes: Record<string, SystemType> = { MEMBER: "MEMBER", POINT: "POINT", COUPON: "COUPON", INVENTORY: "INVENTORY", REWARD: "REWARD" };
    const [pointSettings, policy] = await Promise.all([
      prisma.pointSettings.findUnique({ where: { tenantId }, select: { satangPerPoint: true } }),
      unitOversellPolicy(prisma, tenantId, unitId),
    ]);
    const lastSale = async (where: Record<string, unknown>) =>
      iso((await prisma.posSale.findFirst({ where: { tenantId, systemId, unitId, docType: "SALE", ...where }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }))?.createdAt);
    for (const code of UNIT_CARDS) {
      const type = unitTypes[code]!;
      const linkedId = await systemForUnit(tenantId, unitId, type);
      const sys = linkedId ? byId.get(linkedId) : undefined;
      const manage = { href: "/app/settings/connections", canManage: canLink };
      const params =
        code === "POINT" ? { pointRate: { satangPerPoint: pointSettings?.satangPerPoint ?? 2500 } } : code === "INVENTORY" ? { oversellPolicy: { policy } } : undefined;
      if (sys && sys.active) {
        const lastActivityAt =
          code === "MEMBER" ? await lastSale({ memberId: { not: null } }) : code === "POINT" ? await lastSale({ pointEarned: { gt: 0 } }) : code === "INVENTORY" ? await lastSale({ lines: { some: { itemId: { not: null } } } }) : null;
        cards.set(code, card(code, "LINKED", { scope: "UNIT", target: { systemId: sys.id, name: sys.name }, lastActivityAt, manage }, params));
      } else cards.set(code, card(code, ofType(type).length ? "OFF" : "NO_SYSTEM", { scope: "UNIT", manage }, params));
    }

    // ── ACCOUNT (ระดับ POS · AccountSystemLink) — การ์ดเดียวที่สลับได้จากหน้านี้ ──
    // แก้รอบ 1 F7: POS ผูกได้หลายระบบบัญชี (unique = systemId+kind+linkedId) ⇒ LINKED เมื่อมีแถวที่ยังลงบัญชีอยู่ "อย่างน้อยหนึ่ง" ·
    //   target = แถวที่ยังลงบัญชีแถวแรก · มีมากกว่า 1 แถว ⇒ fact autoPost บอกจำนวน (params.linkCount)
    {
      const links = await prisma.accountSystemLink.findMany({ where: { tenantId, linkedKind: "POS", linkedId: systemId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { systemId: true, enabled: true, archivedAt: true } });
      const activeLink = links.find((l) => l.enabled && !l.archivedAt && byId.has(l.systemId));
      const accSys = activeLink ? byId.get(activeLink.systemId) : links[0] ? byId.get(links[0].systemId) : ofType("ACCOUNT")[0];
      const manage = accSys ? { href: `/app/sys/${accSys.id}/account/settings/connections`, canManage: explicitGrant(m, "account.settings.manage") } : null;
      const params = links.length > 1 ? { autoPost: { linkCount: links.length } } : undefined;
      if (activeLink && accSys) {
        const last = await prisma.outboxEvent.findFirst({ where: { tenantId, systemId, type: "pos.sale.paid", status: "DONE" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
        cards.set("ACCOUNT", card("ACCOUNT", "LINKED", { scope: "POS", target: { systemId: accSys.id, name: accSys.name }, lastActivityAt: iso(last?.createdAt), manage }, params));
      } else cards.set("ACCOUNT", card("ACCOUNT", ofType("ACCOUNT").length ? "OFF" : "NO_SYSTEM", { scope: "POS", manage }, params));
    }

    // ── CRM (ระดับร้าน · ประตูสะพาน v2 ตัวเดียวกับที่ CRM นับบิล POS) ──
    {
      const gates = await crmGates(tenantId);
      const open = gates.find((g) => bridgeOpen(g));
      const first = open ?? gates[0];
      const manage = first ? { href: `/app/sys/${first.systemId}/crm/settings/integrations`, canManage: evaluate(m, { module: "crm", action: "crm.settings.manage" }) } : null;
      if (open) cards.set("CRM", card("CRM", "LINKED", { scope: "TENANT", target: { systemId: open.systemId, name: byId.get(open.systemId)?.name ?? "" }, manage }));
      else cards.set("CRM", card("CRM", gates.length ? "OFF" : "NO_SYSTEM", { scope: "TENANT", manage }));
    }

    // ── CHAT (ระดับร้าน · มติ 9: มีช่อง LINE ที่เชื่อมอยู่ในระบบแชทที่เปิดใช้) ──
    {
      const chats = ofType("CHAT").filter((s) => s.active);
      const line = chats.length
        ? await prisma.chatChannelConnection.findFirst({ where: { tenantId, type: "LINE", status: "CONNECTED", systemId: { in: chats.map((c) => c.id) } }, orderBy: { createdAt: "asc" }, select: { systemId: true } })
        : null;
      const target = line ? byId.get(line.systemId) : chats[0];
      const manage = target ? { href: `/app/sys/${target.id}/chat/channels`, canManage: evaluate(m, { module: "chat", action: "chat.connection.create" }) } : null;
      if (line && target) {
        // แก้รอบ 1 F8: ใบเสร็จที่ส่งทาง LINE "ของ POS นี้" เท่านั้น (audit targetId = PosSale.id → บิลของระบบนี้) — ไม่ใช่ทั้งร้าน
        // POS P1.18U ▸ มติ 10e (R2): สแกน AuditLog แค่ 90 วันล่าสุด (กิจกรรมเก่ากว่านั้นไม่ใช่ "ล่าสุด" ของการ์ด) ◂
        const sent = await prisma.$queryRaw<{ at: Date }[]>`
          SELECT a."createdAt" AS at FROM "AuditLog" a
          JOIN "PosSale" s ON s.id = a."targetId" AND s."tenantId" = a."tenantId"
          WHERE a."tenantId" = ${tenantId} AND a.action = 'pos.receipt.sent' AND a."targetType" = 'PosSale'
            AND a.after->>'via' = 'LINE' AND s."systemId" = ${systemId}
            AND a."createdAt" >= now() - interval '90 days'
          ORDER BY a."createdAt" DESC LIMIT 1`;
        cards.set("CHAT", card("CHAT", "LINKED", { scope: "TENANT", target: { systemId: target.id, name: target.name }, lastActivityAt: iso(sent[0]?.at), manage }));
      } else cards.set("CHAT", card("CHAT", ofType("CHAT").length ? "OFF" : "NO_SYSTEM", { scope: "TENANT", manage }));
    }

    // ── KANBAN (ระดับร้าน · บอร์ดรับเรื่องของใบเสร็จ หรือ กฎการ์ดบิลยกเลิก) ──
    {
      const boards = ofType("KANBAN").filter((s) => s.active);
      const issueBoardId = receiptSettingsOf(pos.settings).issueBoardId;
      const board = issueBoardId ? await prisma.kanbanBoard.findFirst({ where: { id: issueBoardId, tenantId }, select: { systemId: true } }) : null;
      const viaBoard = board ? boards.find((b) => b.id === board.systemId) : undefined;
      const viaRule = boards.find((b) => voidCardRuleOn(b.settings));
      const target = viaBoard ?? viaRule ?? boards[0];
      const manage = target ? { href: `/app/sys/${target.id}/kanban/settings`, canManage: evaluate(m, { module: "kanban", action: "kanban.automation.manage" }) } : null;
      if (viaBoard || viaRule) cards.set("KANBAN", card("KANBAN", "LINKED", { scope: "TENANT", target: { systemId: target!.id, name: target!.name }, manage }));
      else cards.set("KANBAN", card("KANBAN", ofType("KANBAN").length ? "OFF" : "NO_SYSTEM", { scope: "TENANT", manage }));
    }

    // ── ยังไม่มีสาย (P1): HR MARKETING BOOKING AI ──
    for (const [code, type] of Object.entries(PLANNED_TYPE) as [PosIntegrationCode, SystemType][]) cards.set(code, card(code, ofType(type).length ? "PLANNED" : "NO_SYSTEM"));
    cards.set("AI", card("AI", "PLANNED"));

    const list = POS_INTEGRATION_CODES.map((c) => cards.get(c)!);
    const backlog = await backlogOf(tenantId, systemId, now, opts);
    return { ok: true, cards: list, header: { linked: list.filter((c) => c.state === "LINKED").length, total: 13, backlog } };
  } catch (e) {
    console.error("[pos-integrations] cards", e);
    return settingsRefuse("UNKNOWN");
  }
}

/**
 * R8 — สวิตช์ "ลงบัญชีบิลของ POS นี้" (AccountSystemLink POS↔บัญชี · soft: แถว/ตัวเลือกเดิมอยู่ครบ) ผ่าน account facade ·
 * สิทธิ์ (มติ 3): OWNER หรือ account.settings.manage ชัดแจ้ง **และ** pos.settings.manage ครบทุกสาขาที่ผูก POS นี้ ·
 * ปิดต้อง confirm:true (ไม่งั้น CONFIRM_REQUIRED) · สถานะเดิม = ok ไม่มี audit · ไม่เคยเชื่อม = NOT_FOUND "เชื่อมที่หน้าบัญชีก่อน" ·
 * audit pos.integration.account {enabled} (targetId = POS)
 */
export async function setPosAccountLink(ctx: { tenantId: string; systemId: string }, actor: Actor, input: unknown): Promise<PosAccountLinkResult> {
  try {
    if (!ctxOk(ctx)) return settingsRefuse("NOT_FOUND");
    const m = settingsMembership(actor);
    if (!m) return settingsRefuse("PERMISSION_DENIED");
    if (!isRecord(input) || typeof input.enabled !== "boolean" || (input.confirm !== undefined && typeof input.confirm !== "boolean")) return settingsRefuse("VALIDATION", "ค่าที่ส่งมาไม่ถูกต้อง", "enabled");
    const enabled = input.enabled;
    const pos = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { id: true } });
    if (!pos) return settingsRefuse("NOT_FOUND");
    const allowed = m.role === "OWNER" || (explicitGrant(m, "account.settings.manage") && (await canOnAllLinkedUnits(prisma, ctx, m, PERM_SETTINGS_MANAGE)));
    if (!allowed) return settingsRefuse("PERMISSION_DENIED", "เปิด/ปิดการลงบัญชีต้องเป็นเจ้าของร้าน หรือมีสิทธิ์ตั้งค่าบัญชีและตั้งค่าหน้าขายทุกสาขา");
    if (!enabled && input.confirm !== true) return settingsRefuse("CONFIRM_REQUIRED", "ปิดการลงบัญชีต้องยืนยัน — บิลใหม่จะไม่ลงบัญชีจนกว่าจะเปิดอีกครั้ง");
    // แก้รอบ 1 F7: ทำกับ "ทุก" AccountSystemLink ของ POS นี้ใน transaction เดียว (ล็อกแถวลิงก์ FOR UPDATE — สลับพร้อมกันไม่สลับครึ่งเดียว) ·
    //   เขียนผ่าน account facade (setPosLinkEnabled + tx) เท่านั้น · ทุกแถวอยู่ในสถานะที่ขอแล้ว = ok ไม่เปลี่ยน ไม่มี audit
    type LinkRow = { systemId: string; enabled: boolean; archivedAt: Date | null };
    const isOn = (l: LinkRow) => l.enabled && !l.archivedAt;
    const done = await prisma.$transaction(async (tx): Promise<{ before: boolean; links: LinkRow[] } | "NOT_FOUND" | "SAME"> => {
      const links = await tx.$queryRaw<LinkRow[]>`
        SELECT "systemId", enabled, "archivedAt" FROM "AccountSystemLink"
        WHERE "tenantId" = ${ctx.tenantId} AND "linkedKind" = 'POS' AND "linkedId" = ${ctx.systemId}
        ORDER BY "createdAt" ASC, id ASC FOR UPDATE`;
      if (!links.length) return "NOT_FOUND";
      if (links.every((l) => isOn(l) === enabled)) return "SAME";
      for (const l of links) {
        const r = await setPosLinkEnabled({ tenantId: ctx.tenantId, systemId: l.systemId }, ctx.systemId, enabled, m.userId, tx);
        if (!r.ok) throw new Error(`[pos-integrations] account link ${l.systemId}: ${r.reason}`);
      }
      return { before: links.some(isOn), links };
    });
    if (done === "NOT_FOUND") return settingsRefuse("NOT_FOUND", "เชื่อมที่หน้าบัญชีก่อน");
    if (done === "SAME") return { ok: true, enabled, changed: false };
    await writeAudit({
      tenantId: ctx.tenantId,
      actorId: m.userId,
      action: "pos.integration.account",
      targetType: "AppSystem",
      targetId: ctx.systemId,
      before: { enabled: done.before },
      after: { enabled, accountSystemId: done.links[0]!.systemId, ...(done.links.length > 1 ? { accountSystemIds: done.links.map((l) => l.systemId) } : {}) },
    });
    return { ok: true, enabled, changed: true };
  } catch (e) {
    console.error("[pos-integrations] account link", e);
    return settingsRefuse("UNKNOWN");
  }
}

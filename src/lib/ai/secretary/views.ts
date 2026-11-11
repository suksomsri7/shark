// views.ts — มุมมองประกอบของ API เลขา (ใบ S1.14 · ผู้คุม S2.4 + RESOLUTIONS §S) — route แอป + server actions เว็บใช้ตัวเดียวกัน
//
// อ่านอย่างเดียว ไม่มีผลข้างเคียง: ประกอบผลของ lib ที่มีอยู่ (approvalGate · planApprovalGate · kindAllowedByAccess · UNDOABLE_KINDS) ให้เป็นธงต่อผู้ดู
//   🔴 ธงเป็นแค่ "คำใบ้ของจอ" — การกดจริงยังผ่าน executeProposal / executePlan / undoAction ที่ตรวจซ้ำทุกด่าน
import type { AiActionLog } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { bkkYmd } from "@/lib/core/quiet-hours";
import type { MembershipCtx } from "@/lib/core/rbac";
import type { AiMemberActor } from "../actor";
import type { ConvCtx } from "../conversation-owner";
import { listPendingProposals } from "../proposals";
import { listPendingPlans } from "../plans";
import { actorCanConfirmKind, membershipCan } from "../tool-access";
import { kindAccessOf } from "../kind-tables";
import type { RoomCard } from "./rooms";
import { AI_MODULES, getAccess, kindAllowedByAccess, MODULE_LABEL_TH, type AccessMap } from "./access";
import { approvalGate, planApprovalGate } from "./approval-gate";
import { UNDOABLE_KINDS } from "./actions";
import { visibleSinceFor } from "./members";
import { classesOf, logDto, planCardDto, planDto, proposalDto, roomCardDto } from "./dto";

type Viewer = { tenantId: string; userId: string; m: MembershipCtx; conv: { tenantId: string; actor: AiMemberActor } };

async function accessOf(tenantId: string): Promise<AccessMap | null> {
  try {
    return await getAccess(tenantId);
  } catch {
    return null; // อ่านระดับไม่ได้ ⇒ canApprove/canUndo = false (ปิดไว้ก่อน)
  }
}

/**
 * ข้อเสนอ + แผนที่รออนุมัติของบทสนทนา (ห้อง) พร้อม `why` · `canApprove` ของผู้ดู (dry-run ของด่านเดียวกับ executeProposal/executePlan)
 *   proposal: ระดับเลขาของร้านยอม kind (`kindAllowedByAccess`) และ (ห้องเลขา) `approvalGate` ผ่าน (OWNER/MANAGER + สิทธิ์โมดูล) — `why` จาก approvalGate
 *   plan: ทุกขั้นผ่านระดับ + `actorCanConfirmKind` และ (ห้องเลขา) `planApprovalGate` = null — กติกาเดียวกับ inbox.ts (S1.11)
 *   ข้อเสนอที่ยังเตรียมเนื้อ (`resultNote` WORKING#) = canApprove false
 */
export async function pendingItemsFor(v: Viewer, conversationId: string) {
  const [props, plans, access, { hasRoom, pool }] = await Promise.all([
    listPendingProposals(v.conv, conversationId),
    listPendingPlans(v.conv, conversationId),
    accessOf(v.tenantId),
    approverPool(v.tenantId, conversationId),
  ]);
  const approversOf = (kinds: string[]) =>
    !access || kinds.length === 0 || !kinds.every((k) => kindAllowedByAccess(access, k).ok)
      ? []
      : pool.filter((a) => kinds.every((k) => { const q = kindAccessOf(k); return !!q && membershipCan(a.m, q, a.userId); })).map((a) => ({ userId: a.userId, name: a.name }));
  const pItems = [];
  for (const p of props) {
    let canApprove = false;
    let why: string | undefined;
    const working = typeof p.resultNote === "string" && p.resultNote.startsWith("WORKING#");
    if (access && !working && kindAllowedByAccess(access, p.kind).ok) {
      const g = await approvalGate(v.tenantId, v.m, { kind: p.kind, conversationId: p.conversationId, payload: p.payload }, v.userId);
      // ห้องเลขา ⇒ approvalGate = OWNER/MANAGER + membershipCan ของ kind (เหมือน inbox.ts) ·
      //   N4: บทสนทนาที่ไม่มี AiRoom approvalGate ผ่านเสมอ ⇒ ต้องผ่าน membershipCan ของ kind ด้วย (ความจริงเดียวกับ executeProposal/assertCan)
      const q = kindAccessOf(p.kind);
      canApprove = g.ok && (hasRoom || (!!q && membershipCan(v.m, q, v.userId)));
      why = g.ok ? g.why : undefined;
    }
    pItems.push({ ...proposalDto(p, why), canApprove, approvers: approversOf([p.kind]) });
  }
  const plItems = [];
  for (const p of plans) {
    const steps = Array.isArray(p.stepsJson) ? (p.stepsJson as { kind?: unknown }[]) : [];
    const kinds = steps.map((s) => String(s?.kind ?? ""));
    let canApprove = !!access && kinds.length > 0 && kinds.every((k) => kindAllowedByAccess(access!, k).ok && actorCanConfirmKind(v.conv.actor, k));
    if (canApprove) canApprove = (await planApprovalGate(v.tenantId, v.m, p.conversationId, steps, v.userId)) === null;
    plItems.push({ ...planDto(p), kinds, classes: classesOf(kinds), canApprove, approvers: approversOf(kinds) });
  }
  return [...pItems, ...plItems].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
}

/**
 * แผนของห้องสำหรับการ์ดขั้น A3 — PENDING (`listPendingPlans` · ตัด seeHistory แล้ว) + RUNNING (อ่านตรง · ผู้ดูผ่านด่านมองเห็นห้องมาแล้ว ·
 *   สมาชิก seeHistory=false ไม่เห็นแผนก่อน addedAt — R-S1.6a เดียวกัน) · เรียงเก่า→ใหม่
 */
export async function roomPlansFor(ctx: ConvCtx, conversationId: string) {
  const [pending, since] = await Promise.all([listPendingPlans(ctx, conversationId), visibleSinceFor(ctx, conversationId)]);
  const running = await tenantDb({ tenantId: ctx.tenantId }).aiPlan.findMany({
    where: { conversationId, status: "RUNNING", ...(since ? { createdAt: since } : {}) },
    orderBy: { createdAt: "asc" },
  });
  return [...pending, ...running].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(planCardDto);
}

/**
 * แถวบันทึก + `canUndo` (dry-run ของ undoAction: kind ใน UNDOABLE_KINDS · ยังไม่ย้อน · `undoableUntil ≥ now` นาฬิกาเซิร์ฟเวอร์ · ห้องเลขา = OWNER/MANAGER ·
 *   สิทธิ์ของ "การกลับทาง" (`membershipCan` = ตัวตัดสินเดียวกับ assertCan) · ระดับเลขาของร้านยอม kind) + `link` ทางเปิดของจริง
 *   (แอป WebView `?open=` พาธใต้ /app: การ์ด `/app/sys/<sys>/kanban/b/<board>?card=<id>` = kanban/notify.cardLink · ดีล `/app/sys/<sys>/crm/deals/<id>` ·
 *   นัด `/app/u/<slug>/booking/day?date=YYYY-MM-DD` · ไม่รู้ = null) — อ่านเป็นชุด ≤ 4 query ต่อหน้า
 */
export async function logItemsFor(v: Viewer, rows: AiActionLog[], now: Date = new Date()) {
  const access = rows.some((r) => r.undoableUntil) ? await accessOf(v.tenantId) : null;
  const links = await logLinks(v.tenantId, rows);
  return rows.map((r) => {
    const base = logDto(r, now, links.get(r.id) ?? null);
    const reg = Object.prototype.hasOwnProperty.call(UNDOABLE_KINDS, r.kind) ? UNDOABLE_KINDS[r.kind]! : null;
    const canUndo =
      base.canUndo &&
      !!reg &&
      !!r.entityId &&
      (!r.roomId || v.m.role === "OWNER" || v.m.role === "MANAGER") &&
      membershipCan(v.m, reg.undoPermission, v.userId) &&
      !!access &&
      kindAllowedByAccess(access, r.kind).ok;
    return { ...base, canUndo };
  });
}

async function logLinks(tenantId: string, rows: AiActionLog[]): Promise<Map<string, string>> {
  const ids = (t: string) => [...new Set(rows.filter((r) => r.entityType === t && r.entityId).map((r) => r.entityId!))];
  const db = tenantDb({ tenantId });
  const [cardIds, dealIds, apptIds] = [ids("kanban.card"), ids("crm.deal"), ids("booking.appointment")];
  const [cards, deals, appts] = await Promise.all([
    cardIds.length ? db.kanbanCard.findMany({ where: { id: { in: cardIds } }, select: { id: true, systemId: true, boardId: true } }) : [],
    dealIds.length ? db.crmDeal.findMany({ where: { id: { in: dealIds } }, select: { id: true, systemId: true } }) : [],
    apptIds.length ? db.appointment.findMany({ where: { id: { in: apptIds } }, select: { id: true, unitId: true, startAt: true } }) : [],
  ]);
  const units = appts.length ? await db.businessUnit.findMany({ where: { id: { in: [...new Set(appts.map((a) => a.unitId))] } }, select: { id: true, slug: true } }) : [];
  const slugOf = new Map(units.map((u) => [u.id, u.slug]));
  const byEntity = new Map<string, string>();
  for (const c of cards) byEntity.set(`kanban.card:${c.id}`, `/app/sys/${c.systemId}/kanban/b/${c.boardId}?card=${c.id}`);
  for (const d of deals) byEntity.set(`crm.deal:${d.id}`, `/app/sys/${d.systemId}/crm/deals/${d.id}`);
  for (const a of appts) {
    const slug = slugOf.get(a.unitId);
    if (slug) byEntity.set(`booking.appointment:${a.id}`, `/app/u/${slug}/booking/day?date=${bkkYmd(a.startAt)}`);
  }
  const out = new Map<string, string>();
  for (const r of rows) {
    const l = r.entityType && r.entityId ? byEntity.get(`${r.entityType}:${r.entityId}`) : undefined;
    if (l) out.set(r.id, l);
  }
  return out;
}

/**
 * ผู้ที่อนุมัติข้อเสนอในห้องนี้ได้ (R-S1.14j · การ์ด "รอใครอนุมัติ") — OWNER ทุกคน + MANAGER ที่เป็นผู้เปิด/สมาชิกห้อง (R-K4 · มองเห็นห้อง)
 *   Membership ที่รับแล้วของร้าน · ผู้เรียกกรองต่อด้วย `membershipCan` ของ kind + ระดับเลขา (กติกาเดียวกับ approvalGate)
 */
async function approverPool(tenantId: string, conversationId: string): Promise<{ hasRoom: boolean; pool: { userId: string; name: string; m: MembershipCtx }[] }> {
  const room = await tenantDb({ tenantId }).aiRoom.findFirst({ where: { conversationId }, select: { startedById: true, members: { select: { userId: true } } } });
  if (!room) return { hasRoom: false, pool: [] };
  const inRoom = new Set([room.startedById, ...room.members.map((x) => x.userId)]);
  const rows = await prisma.membership.findMany({
    where: { tenantId, acceptedAt: { not: null }, role: { in: ["OWNER", "MANAGER"] } },
    select: { userId: true, role: true, unitAccess: true, permissions: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const pool = rows
    .filter((r) => r.role === "OWNER" || inRoom.has(r.userId))
    .map((r) => ({
      userId: r.userId,
      name: r.user?.name?.trim() || "สมาชิก",
      m: { role: r.role, unitAccess: Array.isArray(r.unitAccess) ? (r.unitAccess as string[]) : [], permissions: (r.permissions ?? {}) as Record<string, unknown> },
    }));
  return { hasRoom: true, pool };
}

/** ผู้เรียกอนุมัติข้อเสนอนี้ได้ไหม (dry-run เดียวกับ pendingItemsFor) — ด่านของเส้นแก้ก่อนอนุมัติ (R-S1.14i) · มองไม่เห็น/ไม่ PENDING = null */
export async function proposalApprovableBy(v: Viewer, proposalId: string): Promise<boolean | null> {
  const row = await tenantDb({ tenantId: v.tenantId }).aiProposal.findFirst({ where: { id: proposalId }, select: { conversationId: true } });
  if (!row) return null;
  const items = await pendingItemsFor(v, row.conversationId);
  const it = items.find((x) => x.type === "proposal" && x.id === proposalId);
  return it ? it.canApprove : null;
}

/** การ์ดห้อง + `pendingProposals` (ข้อเสนอ+แผน PENDING ที่ยังไม่หมดอายุ ต่อห้อง · 2 groupBy ต่อหน้า) */
export async function roomCardsFor(tenantId: string, rows: RoomCard[], now: Date = new Date()) {
  if (rows.length === 0) return [];
  const convIds = rows.map((r) => r.conversationId);
  const db = tenantDb({ tenantId });
  const [props, plans] = await Promise.all([
    db.aiProposal.groupBy({ by: ["conversationId"], where: { conversationId: { in: convIds }, status: "PENDING", expiresAt: { gt: now } }, _count: { _all: true } }),
    db.aiPlan.groupBy({ by: ["conversationId"], where: { conversationId: { in: convIds }, status: "PENDING", expiresAt: { gt: now } }, _count: { _all: true } }),
  ]);
  const n = new Map<string, number>();
  for (const g of [...props, ...plans]) n.set(g.conversationId, (n.get(g.conversationId) ?? 0) + g._count._all);
  return rows.map((r) => roomCardDto(r, n.get(r.conversationId) ?? 0));
}

/**
 * ระดับเลขาต่อระบบ — เฉพาะโมดูลของระบบที่ร้านเปิดอยู่ (AppSystem active · BusinessUnit ที่ไม่ ARCHIVED) + แถว `ai` เสมอ (ปิดไม่ได้ · R-S1.14j)
 *   โมดูลที่ไม่ผูกกับระบบใด (kb · approval · automation · system · calendar) ไม่แสดงในรุ่นนี้ — ระดับยังมีผลตามค่าในฐาน
 */
export async function accessItemsFor(tenantId: string, levels: AccessMap) {
  const [systems, units] = await Promise.all([
    prisma.appSystem.findMany({ where: { tenantId, active: true }, select: { type: true } }),
    prisma.businessUnit.findMany({ where: { tenantId, status: { not: "ARCHIVED" } }, select: { type: true } }),
  ]);
  const enabled = new Set([...systems.map((x) => String(x.type).toLowerCase()), ...units.map((x) => String(x.type).toLowerCase())]);
  const items: { module: string; label: string; level: string; alwaysOn: boolean }[] = [{ module: "ai", label: "ผู้ช่วย AI", level: "DRAFT", alwaysOn: true }];
  for (const m of AI_MODULES) if (enabled.has(m)) items.push({ module: m, label: MODULE_LABEL_TH[m], level: levels[m], alwaysOn: false });
  return items;
}

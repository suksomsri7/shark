// inbox.ts — กล่องรวมรออนุมัติทุกกิจการ (S1.11 · แบบ A6 · R-K1 · R-K4 · R-S1.6a · สัญญา docs/modules/31-secretary.md §5.12)
//
// ผู้ใช้ 1 คน → ทุกร้านที่มี Membership ที่รับคำเชิญแล้ว (หรือร้านเดียว) → ข้อเสนอ/แผน PENDING ที่ยังไม่หมดอายุ **ที่ผู้ใช้มองเห็น**
//   มองเห็น = ด่านเดียวกับประตูยืนยัน: `canConfirmerSeeConversation` (ห้องตัวเอง · ห้องเลขาที่เป็นสมาชิก · OWNER ทุกห้องเลขา/ห้องที่ไม่ได้สร้างโดยคนในร้าน)
//   + `withinSight(visibleSinceForUser…)` (สมาชิก seeHistory=false ไม่เห็นรายการก่อน addedAt — R-S1.6a)
// canApprove = ห้องเลขา ? `approvalGate` ผ่าน (OWNER/MANAGER + สิทธิ์ของโมดูล) : `actorCanConfirmKind` — และระดับเลขาของร้านยอม (`kindAllowedByAccess`)
//   ⇒ ปุ่มอนุมัติในกล่องตรงกับผลของ executeProposal/executePlan · การอนุมัติจริงยังผ่านประตูเดิมของร้านนั้น (ตรวจซ้ำทั้งหมด)
// DTO: ไม่มี payload · summary ผ่านตัวปิดเบอร์/อีเมลของ CRM (`crmApi.maskPiiDeep` — facade · ด่าน fitness ห้าม import ลึก)
// ร้านที่ query ล้ม ⇒ ข้าม + logOps WARN (กล่องของร้านอื่นยังแสดง)

import { prisma, tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import type { MembershipCtx } from "@/lib/core/rbac";
import * as crmSvc from "@/lib/modules/crm";
import { aiMemberActor } from "../actor";
import { canConfirmerSeeConversation } from "../conversations";
import { actorCanConfirmKind } from "../tool-access";
import { getAccess, kindAllowedByAccess } from "./access";
import { approvalGate, planApprovalGate } from "./approval-gate";
import { visibleSinceForUser, withinSight } from "./members";

export type InboxItem = {
  tenantId: string;
  tenantName: string;
  type: "proposal" | "plan";
  id: string;
  roomId: string | null;
  conversationId: string;
  summary: string;
  kind?: string;
  risk?: string;
  createdAt: Date;
  expiresAt: Date | null;
  canApprove: boolean;
  why?: string;
};

const TAKE_DEFAULT = 50;
const TAKE_MAX = 100;
const PER_TENANT_SCAN = 200; // แถวล่าสุดต่อร้านต่อชนิดที่นำมาตรวจการมองเห็น
const SUMMARY_MAX = 200;
const SIGHT_BATCH = 8; // ตรวจการมองเห็นทีละ 8 ห้อง (ไม่แย่ง pool)

/** ปิดเบอร์/อีเมลในข้อความ (ตัวปิดล้ม = ปิดแบบหยาบไว้ก่อน) */
function maskSummary(raw: unknown): string {
  const s = String(raw ?? "");
  let out = s;
  try {
    const m = crmSvc.crmApi.maskPiiDeep(s);
    out = typeof m === "string" ? m : s;
  } catch {
    out = s.replace(/\S+@\S+/g, "***").replace(/\+?\d[\d\s.-]{7,}\d/g, "***");
  }
  return out.slice(0, SUMMARY_MAX);
}

type Tenancy = { tenantId: string; tenantName: string; m: MembershipCtx };

async function memberships(userId: string, tenantId?: string): Promise<Tenancy[]> {
  const rows = await prisma.membership.findMany({
    where: { userId, acceptedAt: { not: null }, ...(tenantId ? { tenantId } : {}) },
    select: { tenantId: true, role: true, unitAccess: true, permissions: true, tenant: { select: { name: true } } },
  });
  return rows.map((r) => {
    const a = aiMemberActor(r.tenantId, userId, { role: r.role, unitAccess: r.unitAccess, permissions: r.permissions });
    return { tenantId: r.tenantId, tenantName: r.tenant?.name ?? "", m: a.membership };
  });
}

/** ข้อเสนอ/แผนที่รออนุมัติของร้านหนึ่ง ที่ผู้ใช้นี้เห็น */
async function tenantItems(t: Tenancy, userId: string, kind: "proposal" | "plan" | undefined, now: Date, take: number): Promise<InboxItem[]> {
  const db = tenantDb({ tenantId: t.tenantId });
  const live = { status: "PENDING" as const, expiresAt: { gt: now } };
  const [props, plans] = await Promise.all([
    kind === "plan"
      ? Promise.resolve([])
      : db.aiProposal.findMany({
          where: live,
          orderBy: { createdAt: "desc" },
          take: PER_TENANT_SCAN,
          select: { id: true, conversationId: true, kind: true, summary: true, risk: true, payload: true, createdAt: true, expiresAt: true, resultNote: true },
        }),
    kind === "proposal"
      ? Promise.resolve([])
      : db.aiPlan.findMany({
          where: live,
          orderBy: { createdAt: "desc" },
          take: PER_TENANT_SCAN,
          select: { id: true, conversationId: true, title: true, stepsJson: true, createdAt: true, expiresAt: true },
        }),
  ]);
  if (props.length === 0 && plans.length === 0) return [];

  const convIds = [...new Set([...props.map((p) => p.conversationId), ...plans.map((p) => p.conversationId)])];
  const rooms = await db.aiRoom.findMany({ where: { conversationId: { in: convIds } }, select: { id: true, conversationId: true } });
  const roomOf = new Map(rooms.map((r) => [r.conversationId, r.id]));
  const access = await getAccess(t.tenantId);
  const actor = { kind: "member" as const, tenantId: t.tenantId, userId, membership: t.m };

  // การมองเห็นต่อบทสนทนา (คำนวณครั้งเดียวต่อห้อง)
  const sight = new Map<string, { visible: boolean; since: { gte: Date } | null }>();
  for (let i = 0; i < convIds.length; i += SIGHT_BATCH) {
    const batch = await Promise.all(
      convIds.slice(i, i + SIGHT_BATCH).map(async (c) => {
        const visible = await canConfirmerSeeConversation(t.tenantId, t.m, userId, c);
        const since = visible && roomOf.has(c) ? await visibleSinceForUser(t.tenantId, t.m.role, userId, c) : null;
        return [c, { visible, since }] as const;
      }),
    );
    for (const [c, v] of batch) sight.set(c, v);
  }
  const sees = (c: string, createdAt: Date) => {
    const s = sight.get(c);
    return !!s?.visible && withinSight(s.since, createdAt);
  };

  const out: InboxItem[] = [];
  for (const p of props) {
    if (!sees(p.conversationId, p.createdAt)) continue;
    if (typeof p.resultNote === "string" && p.resultNote.startsWith("WORKING#")) continue; // ยังเตรียมเนื้อไม่เสร็จ (ยืนยันไม่ได้)
    const roomId = roomOf.get(p.conversationId) ?? null;
    let canApprove = false;
    let why: string | undefined;
    if (kindAllowedByAccess(access, p.kind).ok) {
      if (roomId) {
        const g = await approvalGate(t.tenantId, t.m, { kind: p.kind, conversationId: p.conversationId, payload: p.payload }, userId);
        canApprove = g.ok;
        why = g.ok ? g.why : undefined;
      } else {
        canApprove = actorCanConfirmKind(actor, p.kind);
      }
    }
    out.push({
      tenantId: t.tenantId,
      tenantName: t.tenantName,
      type: "proposal",
      id: p.id,
      roomId,
      conversationId: p.conversationId,
      summary: maskSummary(p.summary),
      kind: p.kind,
      risk: p.risk,
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
      canApprove,
      ...(why ? { why } : {}),
    });
  }
  for (const p of plans) {
    if (!sees(p.conversationId, p.createdAt)) continue;
    const roomId = roomOf.get(p.conversationId) ?? null;
    const steps = Array.isArray(p.stepsJson) ? (p.stepsJson as { kind?: unknown }[]) : [];
    const kinds = steps.map((s) => String(s?.kind ?? ""));
    // ทุกขั้นต้องผ่านระดับเลขา + สิทธิ์ของคนกด (แบบ executePlan) · ห้องเลขา = ด่านผู้อนุมัติต่อทุกขั้น (R-S1.7a)
    let canApprove = kinds.length > 0 && kinds.every((k) => kindAllowedByAccess(access, k).ok && actorCanConfirmKind(actor, k));
    if (canApprove && roomId) canApprove = (await planApprovalGate(t.tenantId, t.m, p.conversationId, steps, userId)) === null;
    out.push({
      tenantId: t.tenantId,
      tenantName: t.tenantName,
      type: "plan",
      id: p.id,
      roomId,
      conversationId: p.conversationId,
      summary: maskSummary(p.title),
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
      canApprove,
    });
  }
  return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take);
}

/**
 * กล่องรวมของผู้ใช้ — ข้อเสนอ/แผนรออนุมัติทุกกิจการที่ผู้ใช้เป็นสมาชิก (รับคำเชิญแล้ว) และ **มองเห็น** · เรียง createdAt desc · take ≤ 100
 *   `opts.tenantId` = เฉพาะร้านนั้น (ไม่ได้เป็นสมาชิก = []) · `opts.kind` = เฉพาะชนิด · ร้านที่ล้ม = ข้าม (logOps)
 */
export async function inboxForUser(userId: string, opts?: { tenantId?: string; kind?: "proposal" | "plan"; take?: number }): Promise<InboxItem[]> {
  const uid = typeof userId === "string" ? userId.trim() : "";
  if (!uid) return [];
  const take = Math.max(1, Math.min(TAKE_MAX, Math.floor(Number(opts?.take) || TAKE_DEFAULT)));
  const kind = opts?.kind === "proposal" || opts?.kind === "plan" ? opts.kind : undefined;
  const now = new Date();
  const tenancies = await memberships(uid, typeof opts?.tenantId === "string" && opts.tenantId ? opts.tenantId : undefined);
  const lists = await Promise.all(
    tenancies.map((t) =>
      tenantItems(t, uid, kind, now, take).catch(async (e) => {
        await logOps("WARN", "ai", "inbox: อ่านรายการรออนุมัติของร้านนี้ไม่ได้ — ข้าม", { tenantId: t.tenantId, detail: e instanceof Error ? e.message : String(e) });
        return [] as InboxItem[];
      }),
    ),
  );
  return lists.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take);
}

/** จำนวนในกล่องรวม (badge) — total = ที่เห็น · canApprove = ที่ผู้ใช้กดอนุมัติได้ (นับจากชุดเดียวกับ inboxForUser · เพดาน 100) */
export async function inboxCount(userId: string): Promise<{ total: number; canApprove: number }> {
  const items = await inboxForUser(userId, { take: TAKE_MAX });
  return { total: items.length, canApprove: items.filter((i) => i.canApprove).length };
}

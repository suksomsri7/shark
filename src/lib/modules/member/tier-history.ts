// tier-history.ts — "ระดับของสมาชิกคนนี้เปลี่ยนมาแล้วกี่ครั้ง เพราะอะไร" (M1.11)
//
// เดิมหน้าจอ (`member/tiers/page.tsx`) อ่านตาราง `MemberTierHistory` เอง — REST/สกิล AI ต้องใช้
// คำตอบเดียวกัน จึงยกเป็นบริการของโมดูลตัวหนึ่ง (ไม่ใช่ให้ op ยิง query ชุดที่สอง)
//
// 🔴 แถวที่ `evidence.pending === true` = "คำขอตั้งระดับด้วยมือที่ยังรออนุมัติ" — **ยังไม่มีผล**
//    ต้องแยกให้ผู้เรียกเห็นชัด ไม่งั้นแอปคู่ค้าจะรายงานว่าลูกค้าขึ้นระดับแล้วทั้งที่ยังไม่ผ่านอนุมัติ

import { prisma } from "./db";
import { canReadMember, type MemberActor } from "./access";
import { MemberForbiddenError, MemberNotFoundError } from "./errors";
import { briefFor, type MemberCtx } from "./profile";
import type { TierRef } from "./tiers";

export type TierHistoryDto = {
  id: string;
  at: Date;
  from: TierRef | null;
  to: TierRef | null;
  /** RULE_UPGRADE · RULE_KEEP · RULE_DOWNGRADE · MANUAL · MERGE … */
  reason: string;
  /** ตัวเลขที่ใช้ตัดสินตอนนั้น (ยอด 12 เดือน · จำนวนครั้ง · แต้มระดับ) */
  evidence: Record<string, unknown>;
  byUserId: string | null;
  approvalRequestId: string | null;
  /** true = ยังรออนุมัติ ยังไม่มีผลกับระดับปัจจุบัน */
  pending: boolean;
};

function objectOf(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** ประวัติระดับของสมาชิกคนหนึ่ง (ใหม่สุดขึ้นก่อน) */
export async function listTierHistory(
  ctx: MemberCtx,
  actor: MemberActor,
  customerId: string,
  opts: { take?: number } = {},
): Promise<{ items: TierHistoryDto[]; total: number }> {
  if (!canReadMember(actor)) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์เข้าโมดูลสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
  const [brief] = await briefFor(ctx, actor, [customerId]);
  if (!brief) throw new MemberNotFoundError();

  const take = Math.min(Math.max(opts.take ?? 20, 1), 100);
  const rows = await prisma.memberTierHistory.findMany({
    where: { tenantId: ctx.tenantId, customerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });
  const tierIds = [...new Set(rows.flatMap((r) => [r.fromTierDefId, r.toTierDefId]).filter((x): x is string => !!x))];
  const defs = tierIds.length
    ? await prisma.memberTierDef.findMany({
        where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: tierIds } },
        select: { id: true, key: true, name: true },
      })
    : [];
  const byId = new Map(defs.map((d) => [d.id, { id: d.id, key: d.key, name: d.name }]));
  const ref = (id: string | null): TierRef | null => (id ? byId.get(id) ?? null : null);

  return {
    items: rows.map((r) => {
      const evidence = objectOf(r.evidence);
      return {
        id: r.id,
        at: r.createdAt,
        from: ref(r.fromTierDefId),
        to: ref(r.toTierDefId),
        reason: r.reason,
        evidence,
        byUserId: r.byUserId,
        approvalRequestId: r.approvalRequestId,
        pending: evidence.pending === true,
      };
    }),
    total: rows.length,
  };
}

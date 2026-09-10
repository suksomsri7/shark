// adjust.ts — ปรับแต้มมือ (พนักงาน/ผู้จัดการ/เจ้าของ) + สายอนุมัติเมื่อเกินเพดาน
//
// WO M2.2 · พิมพ์เขียว docs/modules/06-member-v2.md §5.5 §6.2 §11.4
// หนี้จาก M2.1 (ledger/wo-notes/member-M2.1.md §4): `adjustPoints` (v1 ใน `./service`) ยังไม่แตะล็อต
//   ⇒ ใบนี้เป็นเจ้าของ "ปรับแต้มมือ" ตัวจริง (v2) — ต่อล็อตให้ครบเหมือน earnWithLot/burnFifo
//
// กติกาประจำไฟล์
//   • ctx = { tenantId, systemId (= ระบบแต้ม), memberSystemId?, actorUserId? }
//   • prisma ดิบผ่าน `./internal` (ซึ่งผ่าน `./db`) เท่านั้น (fitness F5.1)
//   • `applyPointAdjust` ต้อง idempotent ผ่าน `idempotencyKey` เพียงอย่างเดียว (เรียกซ้ำจาก
//     `src/lib/approval-effects.ts` ตอน drain ซ้ำต้องปลอดภัยเสมอ — ไม่ต้องพึ่ง claim/lock เพิ่ม)
//
// 🔴 ข้อตัดสิน (ดู wo-notes/member-M2.2.md §3 มีรายละเอียด/หลักฐานเต็ม):
//   1) ด่านสิทธิ์ใช้ `canReadMember(actor)` (เข้าโมดูลสมาชิกได้) ไม่ใช่คีย์เจาะจง `member.point.adjust`
//      เพราะ seed QC ไม่ได้ให้คีย์นี้กับพนักงานสาขา (STAFF_PERMS มีแค่ customer.read/create/update) แต่
//      พิมพ์เขียว §6.2 ตาราง action×role ระบุชัดว่า STAFF ปรับแต้ม "≤ เพดาน" ได้ — เพดาน+สายอนุมัติ
//      คือรั้วป้องกันจริงของ action นี้ (ไม่ใช่คีย์สิทธิ์แยก) ส่วน MANAGER/OWNER ผ่าน canReadMember เสมออยู่แล้ว
//   2) STAFF ที่ขอเกินเพดาน → throw ทันที (ไม่เข้าสายอนุมัติ) ตาม §6.2 ที่ให้ช่อง STAFF แค่ "≤ เพดาน"
//      เท่านั้น (ต่างจาก MANAGER ที่มีช่อง "เกิน → approval" ระบุชัดในตาราง)

import { randomToken } from "@/lib/core/hash";
import { canReadMember, type MemberActor } from "@/lib/modules/member/access";
import * as approval from "@/lib/modules/approval/service";
import {
  addMonths,
  balanceIn,
  endOfBkkYear,
  getSettings,
  pointError,
  prisma,
  withTx,
  writeLedger,
  type Client,
  type PointCtx,
} from "./internal";
import type { LotUse } from "./lots";

export type { PointCtx };

export type AdjustWithApprovalInput = {
  customerId: string;
  delta: number;
  reason: string;
  /** วันหมดอายุของล็อตใหม่ (เฉพาะ delta > 0) — ไม่ส่ง = คิดจากการตั้งค่าแต้มของร้าน */
  expiresAt?: Date | null;
  idempotencyKey?: string;
};

export type AdjustWithApprovalResult =
  | { applied: true; ledgerId: string; balance: number }
  | { pending: true; approvalRequestId: string };

async function resolveAdjustExpiry(
  client: Client,
  tenantId: string,
  explicit: Date | null | undefined,
  now: Date,
): Promise<Date | null> {
  if (explicit !== undefined) return explicit;
  const settings = await getSettings(client, tenantId);
  if (settings.expiryMode === "NEVER") return null;
  if (settings.expiryMode === "END_OF_YEAR") return endOfBkkYear(now);
  return addMonths(now, settings.expiryMonths);
}

/**
 * เขียนการปรับแต้มจริง — ledger `ADJUST` + ต่อล็อต (delta > 0 = เปิดล็อตใหม่ · delta < 0 = ตัด FIFO)
 * เรียกได้ 2 ทาง: (1) ทันทีจาก `adjustWithApproval` เมื่อไม่ต้องอนุมัติ (2) จาก
 * `src/lib/approval-effects.ts` (case `member.point.adjust`) หลังอนุมัติผ่าน — **idempotent ผ่าน idempotencyKey**
 */
export async function applyPointAdjust(
  ctx: PointCtx,
  input: {
    customerId: string;
    delta: number;
    reason: string;
    expiresAt?: Date | null;
    idempotencyKey: string;
    actorUserId?: string | null;
  },
  client: Client = prisma,
): Promise<{ ledgerId: string; balance: number }> {
  return withTx(client, async (tx) => {
    const dup = await tx.pointLedger.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (dup) return { ledgerId: dup.id, balance: await balanceIn(tx, ctx.systemId, input.customerId) };

    if (input.delta > 0) {
      const now = new Date();
      const expiresAt = await resolveAdjustExpiry(tx, ctx.tenantId, input.expiresAt, now);
      const led = await writeLedger(tx, {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        customerId: input.customerId,
        delta: input.delta,
        type: "ADJUST",
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        expiresAt,
        data: { actorUserId: input.actorUserId ?? null },
      });
      if (led.duplicated) return { ledgerId: led.ledgerId, balance: led.balance };
      const lot = await tx.pointLot.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          customerId: input.customerId,
          ledgerId: led.ledgerId,
          points: input.delta,
          remaining: input.delta,
          earnedAt: now,
          expiresAt,
        },
      });
      await tx.pointLedger.update({ where: { id: led.ledgerId }, data: { lotId: lot.id } });
      return { ledgerId: led.ledgerId, balance: led.balance };
    }

    // delta < 0 → ตัด FIFO เหมือน burnFifo แต่บันทึกเป็น type ADJUST (ไม่ใช่ BURN — คนละเหตุผลทางบัญชี)
    const need = -input.delta;
    const current = await balanceIn(tx, ctx.systemId, input.customerId);
    if (current < need) throw pointError(`แต้มคงเหลือไม่พอสำหรับการหักแต้มนี้ (มี ${current} แต้ม ต้องการหัก ${need} แต้ม)`);
    const lots = await tx.pointLot.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, customerId: input.customerId, expiredAt: null, remaining: { gt: 0 } },
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { earnedAt: "asc" }],
    });
    const used: LotUse[] = [];
    let left = need;
    for (const lot of lots) {
      if (left <= 0) break;
      const take = Math.min(lot.remaining, left);
      used.push({ lotId: lot.id, points: take });
      left -= take;
    }
    const led = await writeLedger(tx, {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      customerId: input.customerId,
      delta: input.delta,
      type: "ADJUST",
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      data: { actorUserId: input.actorUserId ?? null, lots: used, lotIds: used.map((u) => u.lotId) },
    });
    if (led.duplicated) return { ledgerId: led.ledgerId, balance: led.balance };
    for (const u of used) {
      await tx.pointLot.update({ where: { id: u.lotId }, data: { remaining: { decrement: u.points } } });
    }
    return { ledgerId: led.ledgerId, balance: led.balance };
  });
}

/**
 * ปรับแต้มมือ v2 — reason บังคับ · OWNER ทำทันทีเสมอ · MANAGER/STAFF ≤ `adjustApprovalOver` ทำทันที
 * MANAGER เกินเพดาน → เข้าสายอนุมัติกลาง (`member.point.adjust` · ไม่มีนโยบาย = autoApproved)
 * STAFF เกินเพดาน → throw (§6.2: ช่อง STAFF มีแค่ "≤ เพดาน" ไม่มีช่องขออนุมัติ)
 */
export async function adjustWithApproval(
  ctx: PointCtx,
  actor: MemberActor,
  input: AdjustWithApprovalInput,
): Promise<AdjustWithApprovalResult> {
  if (!canReadMember(actor)) {
    throw pointError("ยังไม่ได้รับสิทธิ์เข้าระบบสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อนปรับแต้ม");
  }
  const reason = (input.reason ?? "").trim();
  if (!reason) throw pointError("กรุณาระบุเหตุผลก่อนปรับแต้ม");
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw pointError("จำนวนแต้มต้องเป็นจำนวนเต็มที่ไม่เท่ากับ 0");
  }

  const settings = await getSettings(prisma, ctx.tenantId);
  const cap = settings.adjustApprovalOver;
  const withinCap = cap === null || Math.abs(input.delta) <= cap;
  const actorUserId = ctx.actorUserId ?? actor.userId;
  const idempotencyKey = input.idempotencyKey ?? `point.adjust:${ctx.systemId}:${input.customerId}:${randomToken(9)}`;

  if (actor.role === "OWNER" || withinCap) {
    const r = await applyPointAdjust(
      ctx,
      { customerId: input.customerId, delta: input.delta, reason, expiresAt: input.expiresAt, idempotencyKey, actorUserId },
      prisma,
    );
    return { applied: true, ledgerId: r.ledgerId, balance: r.balance };
  }

  if (actor.role === "STAFF") {
    throw pointError(`พนักงานปรับแต้มได้ไม่เกิน ${cap} แต้มต่อครั้ง — เกินกว่านี้ต้องให้ผู้จัดการหรือเจ้าของร้านดำเนินการ`);
  }

  const submitted = await approval.submitForApproval(
    { tenantId: ctx.tenantId },
    {
      entityType: "member.point.adjust",
      entityId: `${input.customerId}:${idempotencyKey}`,
      systemId: ctx.systemId,
      requestedById: actorUserId,
    },
  );
  if ("autoApproved" in submitted) {
    const r = await applyPointAdjust(
      ctx,
      { customerId: input.customerId, delta: input.delta, reason, expiresAt: input.expiresAt, idempotencyKey, actorUserId },
      prisma,
    );
    return { applied: true, ledgerId: r.ledgerId, balance: r.balance };
  }

  await prisma.pointAdjustRequest.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      customerId: input.customerId,
      delta: input.delta,
      reason,
      expiresAt: input.expiresAt ?? null,
      idempotencyKey,
      approvalRequestId: submitted.requestId,
      actorUserId,
    },
  });
  return { pending: true, approvalRequestId: submitted.requestId };
}

/**
 * ผลของการอนุมัติ "ปรับแต้มมือ" — เรียกจาก `src/lib/approval-effects.ts` เท่านั้น
 * idempotent: `applyPointAdjust` เองกันยิงซ้ำผ่าน idempotencyKey อยู่แล้ว · `appliedAt`/`rejectedAt`
 * เป็นแค่บันทึกไว้ดู ไม่ใช่ตัวกันซ้ำ (drain ซ้ำ/replay ปลอดภัยโดยไม่ต้องพึ่งมัน)
 */
export async function applyPointAdjustApproved(
  input: { approvalRequestId: string; tenantId: string; approved: boolean },
): Promise<{ applied: boolean }> {
  const row = await prisma.pointAdjustRequest.findFirst({
    where: { tenantId: input.tenantId, approvalRequestId: input.approvalRequestId },
  });
  if (!row) return { applied: false };

  if (!input.approved) {
    await prisma.pointAdjustRequest.updateMany({ where: { id: row.id, rejectedAt: null }, data: { rejectedAt: new Date() } });
    return { applied: false };
  }

  await applyPointAdjust(
    { tenantId: row.tenantId, systemId: row.systemId, actorUserId: row.actorUserId },
    {
      customerId: row.customerId,
      delta: row.delta,
      reason: row.reason,
      expiresAt: row.expiresAt,
      idempotencyKey: row.idempotencyKey,
      actorUserId: row.actorUserId,
    },
    prisma,
  );
  await prisma.pointAdjustRequest.updateMany({ where: { id: row.id, appliedAt: null }, data: { appliedAt: new Date() } });
  return { applied: true };
}

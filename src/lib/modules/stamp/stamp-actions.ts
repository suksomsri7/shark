"use server";

// stamp-actions.ts — server action ของหน้า "สแตมป์" (M2.3 · ภาพ 17)
//
// 🔴 ทุก action ผ่านด่านเดียว `gate()`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย) →
//    ระบบเป็น MEMBER ของร้านนี้จริง → แล้วแต่ละ action ตรวจคีย์ของตัวเองอีกชั้น
//    (`member.loyalty.manage` = สร้าง/แก้/เปิดปิด/ยกเลิกตรา · `member.loyalty.stamp` = ประทับ — §6.1)
// 🔴 เรียก `service.ts` เท่านั้น — ห้ามแตะตาราง Stamp* ผ่าน prisma ตรงจากที่นี่
// 🔴 ข้อความ error ที่ส่งกลับหน้าจอผ่าน `safeReason` เสมอ (ไม่ปล่อยรายละเอียดภายในหลุด)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import { canReadMember, hasMemberPerm, toMemberActor, type MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import {
  addStamp,
  createCard,
  toggleCard,
  updateCard,
  voidStampEvent,
  type AddStampResult,
  type CreateCardInput,
  type StampCardDto,
  type StampCtx,
  type UpdateCardInput,
} from "./service";

export type StampActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/member/stamps`;

async function gate(systemId: string): Promise<{ ctx: StampCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (read-โดยนัย แบบเดียวกับ fields-actions.ts / giftcard-actions.ts)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" });
  }
  const system = await prisma.appSystem.findFirst({
    where: { id: systemId, tenantId, type: "MEMBER" },
    select: { id: true },
  });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");

  return { ctx: { tenantId, systemId, actorUserId: auth.user.id }, actor };
}

/** ชั้นที่ 2 — คีย์เจาะจงของงานนั้น (แยกจาก gate เพื่อให้อ่านออกว่า action ไหนต้องใช้คีย์อะไร) */
function requireKey(actor: MemberActor, key: "member.loyalty.manage" | "member.loyalty.stamp"): void {
  if (!hasMemberPerm(actor, key)) throw new ForbiddenError({ module: "member", action: key });
}

// ───────────────────────── การ์ด ─────────────────────────

export async function createStampCardAction(
  input: { systemId: string } & CreateCardInput,
): Promise<StampActionResult<StampCardDto>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.loyalty.manage");
    const { systemId: _systemId, ...rest } = input;
    const card = await createCard(ctx, actor, rest);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: card };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกสแตมป์การ์ดไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function updateStampCardAction(
  input: { systemId: string; cardId: string } & UpdateCardInput,
): Promise<StampActionResult<StampCardDto>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.loyalty.manage");
    const { systemId: _systemId, cardId, ...patch } = input;
    const card = await updateCard(ctx, actor, cardId, patch);
    revalidatePath(PATH(input.systemId));
    revalidatePath(`${PATH(input.systemId)}/${cardId}`);
    return { ok: true, data: card };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกสแตมป์การ์ดไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function toggleStampCardAction(input: {
  systemId: string;
  cardId: string;
  active: boolean;
}): Promise<StampActionResult<StampCardDto>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.loyalty.manage");
    const card = await toggleCard(ctx, actor, input.cardId, input.active);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: card };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เปลี่ยนสถานะสแตมป์การ์ดไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── ประทับ / ยกเลิก ─────────────────────────

export async function addStampAction(input: {
  systemId: string;
  cardId: string;
  customerId: string;
  count?: number;
  unitId?: string | null;
  idempotencyKey: string;
}): Promise<StampActionResult<AddStampResult>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.loyalty.stamp");
    const res = await addStamp(ctx, actor, {
      cardId: input.cardId,
      customerId: input.customerId,
      count: input.count,
      refType: "MANUAL",
      unitId: input.unitId ?? null,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ประทับตราไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function voidStampEventAction(input: {
  systemId: string;
  eventId: string;
}): Promise<StampActionResult<{ voided: number }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.loyalty.manage");
    const res = await voidStampEvent(ctx, actor, { eventId: input.eventId });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ยกเลิกตราไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

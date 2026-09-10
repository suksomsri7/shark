"use server";

// giftcard-actions.ts — server action ของหน้า "โปรโมชัน › Gift Card" (M2.6 · ภาพ 20)
//
// 🔴 ทุก action ผ่านด่านเดียว `gate()`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย) →
//    ระบบเป็น MEMBER ของร้านนี้จริง → แล้วแต่ละ action ตรวจคีย์ของตัวเองอีกชั้น
//    (`member.giftcard.sell` = ขาย/เติมเงิน · `member.giftcard.manage` = ตั้งค่า/ระงับ — §6.1
//     คีย์ manage เป็น 1 ใน 4 ตัวที่ **MANAGER ไม่ได้โดยปริยาย**)
// 🔴 เรียก `service.ts` เท่านั้น — ห้ามแตะตาราง GiftCard ผ่าน prisma ตรงจากที่นี่
// 🔴 ข้อความ error ที่ส่งกลับหน้าจอผ่าน `safeReason` เสมอ (ไม่ปล่อยรายละเอียดภายในหลุด)

import { revalidatePath } from "next/cache";
import type { PosPayType } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import {
  canReadMember,
  hasMemberPerm,
  resolvePosForMember,
  toMemberActor,
  type MemberActor,
} from "@/lib/modules/member";
import { prisma } from "./db";
import {
  getSettings,
  list,
  reload,
  sell,
  setSettings,
  suspend,
  transfer,
  unsuspend,
  type GiftCardCtx,
  type GiftCardSettingsDto,
  type SellRecipient,
} from "./service";

export type GiftCardActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

type GiftCardQueryStatus = "ACTIVE" | "DEPLETED" | "EXPIRED" | "SUSPENDED" | null;

const PATH = (systemId: string) => `/app/sys/${systemId}/member/promotions/giftcards`;

async function gate(systemId: string): Promise<{ ctx: GiftCardCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (read-โดยนัย แบบเดียวกับ fields-actions.ts / sources-actions.ts)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" });
  }
  const system = await prisma.appSystem.findFirst({
    where: { id: systemId, tenantId, type: "MEMBER" },
    select: { id: true },
  });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");

  const target = await resolvePosForMember({ tenantId, systemId });
  return {
    ctx: { tenantId, systemId, posSystemId: target?.posSystemId ?? null, actorUserId: auth.user.id },
    actor,
  };
}

/** ชั้นที่ 2 — คีย์เจาะจงของงานนั้น (แยกจาก gate เพื่อให้อ่านออกว่า action ไหนต้องใช้คีย์อะไร) */
function requireKey(actor: MemberActor, key: "member.giftcard.sell" | "member.giftcard.manage"): void {
  if (!hasMemberPerm(actor, key)) throw new ForbiddenError({ module: "member", action: key });
}

// ───────────────────────── ขาย ─────────────────────────

export type SellGiftCardActionInput = {
  systemId: string;
  satang: number;
  buyerCustomerId?: string | null;
  recipientMode: "MEMBER" | "CONTACT" | "PRINT";
  recipientCustomerId?: string | null;
  recipientContact?: { name?: string | null; line?: string | null; email?: string | null } | null;
  message?: string | null;
  unitId: string;
  payType?: PosPayType;
  idempotencyKey: string;
};

export async function sellGiftCardAction(
  input: SellGiftCardActionInput,
): Promise<GiftCardActionResult<{ number: string; pin: string | null; balanceSatang: number }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.giftcard.sell");

    const recipient: SellRecipient =
      input.recipientMode === "MEMBER" && input.recipientCustomerId
        ? { customerId: input.recipientCustomerId }
        : input.recipientMode === "CONTACT"
          ? { contact: input.recipientContact ?? {} }
          : { print: true };

    const res = await sell(ctx, actor, {
      satang: input.satang,
      buyerCustomerId: input.buyerCustomerId ?? null,
      recipient,
      message: input.message ?? null,
      payMethods: [{ type: input.payType ?? "CASH", amountSatang: input.satang }],
      unitId: input.unitId,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath(PATH(input.systemId));
    // 🔴 PIN คืนครั้งเดียวตรงนี้ — พนักงานต้องเขียน/พิมพ์ลงบัตรทันที (ระบบไม่เก็บ PIN ดิบไว้ที่ไหนเลย)
    return { ok: true, data: { number: res.number, pin: res.pin, balanceSatang: input.satang } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ขายบัตรกำนัลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── เติมเงิน ─────────────────────────

export async function reloadGiftCardAction(input: {
  systemId: string;
  number: string;
  satang: number;
  unitId: string;
  payType?: PosPayType;
  idempotencyKey: string;
}): Promise<GiftCardActionResult<{ balanceAfter: number }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.giftcard.sell");
    const res = await reload(ctx, actor, {
      number: input.number,
      satang: input.satang,
      payMethods: [{ type: input.payType ?? "CASH", amountSatang: input.satang }],
      unitId: input.unitId,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: { balanceAfter: res.balanceAfter } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เติมเงินเข้าบัตรไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── ตั้งค่า ─────────────────────────

export async function setGiftCardSettingsAction(
  input: { systemId: string } & Partial<GiftCardSettingsDto>,
): Promise<GiftCardActionResult<GiftCardSettingsDto>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.giftcard.manage");
    const { systemId: _systemId, ...patch } = input;
    const next = await setSettings(ctx, actor, patch);
    revalidatePath(PATH(input.systemId));
    revalidatePath(`${PATH(input.systemId)}/settings`);
    return { ok: true, data: next };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกการตั้งค่าบัตรกำนัลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function getGiftCardSettingsAction(
  systemId: string,
): Promise<GiftCardActionResult<GiftCardSettingsDto>> {
  try {
    const { ctx } = await gate(systemId);
    return { ok: true, data: await getSettings(ctx) };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "อ่านการตั้งค่าบัตรกำนัลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── ระงับ / ปลดระงับ / โอน ─────────────────────────

export async function suspendGiftCardAction(input: {
  systemId: string;
  number: string;
  reason?: string | null;
  resume?: boolean;
}): Promise<GiftCardActionResult<{ ok: true }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.giftcard.manage");
    if (input.resume) await unsuspend(ctx, actor, { number: input.number });
    else await suspend(ctx, actor, { number: input.number, reason: input.reason ?? null });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เปลี่ยนสถานะบัตรไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function transferGiftCardAction(input: {
  systemId: string;
  number: string;
  pin: string;
  toCustomerId: string;
}): Promise<GiftCardActionResult<{ ownerCustomerId: string }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.giftcard.manage");
    const res = await transfer(ctx, actor, input);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: { ownerCustomerId: res.ownerCustomerId } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "โอนเจ้าของบัตรไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── รายการ (กรอง/ค้นหาโดยไม่ต้องรีโหลดทั้งหน้า) ─────────────────────────

export async function listGiftCardsAction(input: {
  systemId: string;
  status?: GiftCardQueryStatus;
  q?: string | null;
}): Promise<GiftCardActionResult<Awaited<ReturnType<typeof list>>>> {
  try {
    const { ctx } = await gate(input.systemId);
    const res = await list(ctx, { status: input.status ?? null, q: input.q ?? null, take: 100 });
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "โหลดรายการบัตรกำนัลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

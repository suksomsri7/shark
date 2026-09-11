// loyalty.ts — "op ของ REST อยู่ที่ระบบสมาชิก แต่ของจริงอยู่คนละระบบ" (M2.10)
//
// คีย์ API ของระบบสมาชิกผูกกับ `AppSystem` ชนิด MEMBER หนึ่งตัว — แต่แต้ม สแตมป์ รางวัล คูปอง และ
// บัตรกำนัลอยู่คนละระบบ (POINT · REWARD · COUPON · POS) ที่ผูกกันผ่าน **สาขา** ไม่ใช่ผ่าน id ตรง ๆ
// ⇒ ทุก op ของชุดสอง ต้องแปลง "ระบบสมาชิก + สาขา" เป็น ctx ของโมดูลปลายทางก่อนเรียก facade
//
// 🔴 ที่นี่คือที่เดียวที่ทำการแปลงนั้น (ก๊อปไว้ 7 ไฟล์ = วันหนึ่งจะมีไฟล์ที่ resolve คนละกติกา แล้วยอดแต้ม
//    ที่หน้าขายกับที่ REST จะไม่ตรงกันเงียบ ๆ) — กติกาเดียวกับ `member/wallet.ts` §M2.7 เป๊ะ
// 🔴 ไฟล์นี้ห้ามแตะ prisma: อ่านทะเบียนระบบผ่าน facade `@/lib/modules/system` เท่านั้น

import { getUnitSystems, listSystems, systemForUnit, unitsForSystem } from "@/lib/modules/system";
import { ApiError } from "@/lib/api/respond";
import type { ApiActor } from "@/lib/api/actor";
import { memberCtxOf } from "./actor";
import type { MemberCtx } from "../profile";

export type LoyaltySystems = {
  unitId: string | null;
  pointSystemId: string | null;
  couponSystemId: string | null;
  posSystemId: string | null;
  rewardSystemId: string | null;
};

/** ระบบแต้ม/คูปอง/POS/รางวัล ที่ผูกสาขานี้ (ไม่ระบุสาขา = สาขาแรกของระบบสมาชิก) */
export async function resolveLoyaltySystems(ctx: MemberCtx, unitIdHint?: string | null): Promise<LoyaltySystems> {
  let unitId = unitIdHint ?? null;
  if (!unitId) {
    const units = await unitsForSystem(ctx.tenantId, ctx.systemId);
    unitId = units[0] ?? null;
  }
  if (!unitId) return { unitId: null, pointSystemId: null, couponSystemId: null, posSystemId: null, rewardSystemId: null };

  const [linked, couponId] = await Promise.all([
    getUnitSystems(ctx.tenantId, unitId),
    systemForUnit(ctx.tenantId, unitId, "COUPON"),
  ]);
  return {
    unitId,
    pointSystemId: linked.POINT ?? null,
    couponSystemId: couponId,
    posSystemId: linked.POS ?? null,
    rewardSystemId: linked.REWARD ?? null,
  };
}

/** ระบบคูปองของร้านเมื่อไม่ได้ผูกกับสาขา (ร้านเล็กเปิดคูปองไว้ระบบเดียว) */
export async function resolveCouponSystemId(ctx: MemberCtx, sys: LoyaltySystems): Promise<string | null> {
  if (sys.couponSystemId) return sys.couponSystemId;
  const all = await listSystems(ctx.tenantId, "COUPON");
  return all[0]?.id ?? null;
}

/** ข้อผิดพลาดมาตรฐานเมื่อร้านยังไม่ได้เปิดระบบที่ op นี้ต้องใช้ — 422 ไม่ใช่ 500 (ไม่ใช่ความผิดของคำขอ) */
export function systemRequired(th: string, en: string): ApiError {
  return new ApiError(422, "unprocessable", th, en);
}

// ───────────────────────── ctx ของโมดูลปลายทาง ─────────────────────────

export type LoyaltyCtxBundle = {
  member: MemberCtx;
  systems: LoyaltySystems;
};

/** ctx ของระบบสมาชิก + ทะเบียนระบบที่เกี่ยวข้อง — ทุก op ของชุดสองเริ่มจากบรรทัดนี้ */
export async function loyaltyCtx(actor: ApiActor, unitIdHint?: string | null): Promise<LoyaltyCtxBundle> {
  const member = memberCtxOf(actor);
  return { member, systems: await resolveLoyaltySystems(member, unitIdHint) };
}

/** ctx ของโมดูลแต้ม — ไม่มีระบบแต้ม = โยนข้อความไทยที่บอกวิธีแก้ (เปิดระบบแต้มแล้วผูกสาขา) */
export function pointCtx(b: LoyaltyCtxBundle): { tenantId: string; systemId: string; memberSystemId: string; actorUserId: string | null } {
  if (!b.systems.pointSystemId) {
    throw systemRequired(
      "ร้านนี้ยังไม่ได้เปิดระบบแต้มสะสมที่ผูกกับสาขาของระบบสมาชิกนี้ — เปิดระบบแต้มก่อนแล้วลองใหม่",
      "This shop has no POINT system linked to the branches of this member system.",
    );
  }
  return {
    tenantId: b.member.tenantId,
    systemId: b.systems.pointSystemId,
    memberSystemId: b.member.systemId,
    actorUserId: b.member.actorUserId ?? null,
  };
}

/** ctx ของโมดูลรางวัล (ต้องรู้ทั้งระบบรางวัลและระบบแต้ม) */
export function rewardCtx(b: LoyaltyCtxBundle): {
  tenantId: string;
  systemId: string;
  memberSystemId: string;
  pointSystemId: string;
  actorUserId: string | null;
} {
  if (!b.systems.rewardSystemId) {
    throw systemRequired(
      "ร้านนี้ยังไม่ได้เปิดระบบของรางวัลที่ผูกกับสาขาของระบบสมาชิกนี้ — เปิดระบบรางวัลก่อนแล้วลองใหม่",
      "This shop has no REWARD system linked to the branches of this member system.",
    );
  }
  return {
    tenantId: b.member.tenantId,
    systemId: b.systems.rewardSystemId,
    memberSystemId: b.member.systemId,
    pointSystemId: b.systems.pointSystemId ?? "",
    actorUserId: b.member.actorUserId ?? null,
  };
}

/** ctx ของสแตมป์/voucher — สองโมดูลนี้อยู่ "ในระบบสมาชิก" อยู่แล้ว ไม่ต้อง resolve อะไร */
export function memberScopedCtx(ctx: MemberCtx): { tenantId: string; systemId: string; actorUserId: string | null } {
  return { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null };
}

/** ctx ของบัตรกำนัล (ต้องรู้ระบบ POS ที่รับเงิน) */
export function giftCardCtx(b: LoyaltyCtxBundle): {
  tenantId: string;
  systemId: string;
  posSystemId: string | null;
  actorUserId: string | null;
} {
  return {
    tenantId: b.member.tenantId,
    systemId: b.member.systemId,
    posSystemId: b.systems.posSystemId,
    actorUserId: b.member.actorUserId ?? null,
  };
}

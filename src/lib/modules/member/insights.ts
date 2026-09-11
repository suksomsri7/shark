// insights.ts — "สรุปสมาชิกคนนี้" + "ควรเสนออะไรให้เขา" (M3.10 · เครื่องมือ member_summary / member_recommend_offer)
//
// ผู้เรียก: REST `GET /members/{id}/summary` · `GET /members/{id}/recommend-offer` และผู้ช่วย AI (tool อ่านอย่างเดียว)
//
// 🔴 ไม่มี AI ในไฟล์นี้: ทุกตัวเลขและทุกคำแนะนำคิดจากข้อมูลจริงของร้านด้วยกติกาที่อ่านออก
//    (ผู้ช่วยเอาไปเรียบเรียงเป็นประโยคเอง) — ถ้าให้โมเดลเดาว่า "ลูกค้าคนนี้น่าจะชอบอะไร" มันจะแต่งตัวเลขได้
// 🔴 ไม่มีข้อมูลติดต่อ/ข้อมูลอ่อนไหวในผลลัพธ์ — การ์ดย่อ (`briefFor`) ใช้เบอร์ปิดบังเสมอ
// 🔴 มองไม่เห็นสมาชิก (ข้ามร้าน/นอกสาขา) = 404 เหมือนทุก op ของโมดูล (ไม่ใช่ 403)

import { prisma } from "./db";
import type { MemberActor } from "./access";
import { MemberNotFoundError } from "./errors";
import { listHistory } from "./history";
import { briefFor, type MemberBrief, type MemberCtx } from "./profile";
import { evaluateMember } from "./tiers";
import { getWallet } from "./wallet";

const DAY_MS = 86_400_000;
const BKK_MS = 7 * 3_600_000;

export type MemberSummary = {
  member: MemberBrief;
  memberSince: Date;
  lastActivityAt: Date | null;
  /** วันที่ไม่ได้มา (นับจากกิจกรรมล่าสุด · ไม่เคยมี = นับจากวันสมัคร) */
  daysSinceLastActivity: number;
  spent12mSatang: number;
  visits12m: number;
  tier: { current: string | null; next: string | null; progressPct: number | null; shortfallSatang: number | null };
  wallet: {
    points: number;
    pointsExpiringSoon: number;
    vouchers: number;
    vouchersExpiringIn7Days: number;
    rewardsPending: number;
    giftCards: number;
    stamps: { name: string; stamps: number; slots: number }[];
  };
  recent: { at: Date; kind: string; title: string }[];
};

export type OfferSuggestion = {
  kind: "POINTS_EXPIRING" | "VOUCHER_REMINDER" | "TIER_PUSH" | "WINBACK" | "STAMP_NEAR" | "BIRTHDAY" | "REWARD_PICKUP" | "WELCOME_BACK_FIRST_VISIT";
  /** ประโยคไทยสั้นที่พนักงาน/ผู้ช่วยเอาไปพูดต่อได้ */
  title: string;
  /** เหตุผลที่คิดจากข้อมูลจริง (ตัวเลขทุกตัวมาจากฐานข้อมูล) */
  reason: string;
  /** ขั้นถัดไปที่ทำได้ใน REST/ผู้ช่วย (ชื่อ tool) — null = แค่ชวนคุย ไม่ต้องออกอะไร */
  nextTool: string | null;
  priority: number;
};

export type OfferRecommendation = { customerId: string; suggestions: OfferSuggestion[] };

async function loadVisible(ctx: MemberCtx, actor: MemberActor, customerId: string): Promise<{ brief: MemberBrief; row: CustomerFacts }> {
  const [brief] = await briefFor(ctx, actor, [customerId]);
  if (!brief) throw new MemberNotFoundError("ไม่พบสมาชิกคนนี้ในระบบสมาชิกที่เปิดอยู่");
  const row = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
    select: { createdAt: true, lastActivityAt: true, spent12mSatang: true, visits12m: true, birthDate: true },
  });
  if (!row) throw new MemberNotFoundError("ไม่พบสมาชิกคนนี้ในระบบสมาชิกที่เปิดอยู่");
  return { brief, row };
}

type CustomerFacts = { createdAt: Date; lastActivityAt: Date | null; spent12mSatang: bigint; visits12m: number; birthDate: Date | null };

function daysSince(at: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / DAY_MS));
}

const baht = (satang: number): string => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
const dayTh = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

/** สรุปสมาชิก 1 คน — ระดับ · ยอด · กระเป๋าสิทธิ์ · กิจกรรมล่าสุด 5 รายการ */
export async function memberSummary(ctx: MemberCtx, actor: MemberActor, customerId: string, now: Date = new Date()): Promise<MemberSummary> {
  const { brief, row } = await loadVisible(ctx, actor, customerId);
  const [evaluation, wallet, history] = await Promise.all([
    evaluateMember(ctx, customerId, { noCache: true }).catch(() => null),
    getWallet(ctx, actor, customerId).catch(() => null),
    listHistory(ctx, actor, customerId, { take: 5 }).catch(() => null),
  ]);
  const p = evaluation?.progressToNext ?? null;
  const moneyField = p && (p.field === "spent12m" || p.field === "spent");
  const soon = now.getTime() + 7 * DAY_MS;
  return {
    member: brief,
    memberSince: row.createdAt,
    lastActivityAt: row.lastActivityAt,
    daysSinceLastActivity: daysSince(row.lastActivityAt ?? row.createdAt, now),
    spent12mSatang: Number(row.spent12mSatang),
    visits12m: row.visits12m,
    tier: {
      current: evaluation?.current?.name ?? brief.tier?.name ?? null,
      next: evaluation?.next?.name ?? null,
      progressPct: p ? Math.max(0, Math.min(100, Math.round(p.pct))) : null,
      shortfallSatang: p && moneyField ? Math.max(0, Math.round(p.target - p.current)) : null,
    },
    wallet: {
      points: wallet?.points.balance ?? brief.points,
      pointsExpiringSoon: (wallet?.points.expiringSoon ?? []).reduce((s, x) => s + x.points, 0),
      vouchers: wallet?.vouchers.length ?? 0,
      vouchersExpiringIn7Days: (wallet?.vouchers ?? []).filter((v) => new Date(v.expiresAt).getTime() <= soon).length,
      rewardsPending: wallet?.rewardsPending.length ?? 0,
      giftCards: wallet?.giftCards.length ?? 0,
      stamps: (wallet?.stamps ?? []).map((s) => ({ name: s.name, stamps: s.stamps, slots: s.slots })),
    },
    recent: (history?.items ?? []).map((h) => ({ at: h.at, kind: h.kind, title: h.title })),
  };
}

/** วันเกิดครั้งถัดไปห่างกี่วัน (ปฏิทินไทย) — ไม่มีวันเกิด = null */
function daysToBirthday(birthDate: Date | null, now: Date): number | null {
  if (!birthDate) return null;
  const today = new Date(now.getTime() + BKK_MS);
  const y = today.getUTCFullYear();
  const start = Date.UTC(y, today.getUTCMonth(), today.getUTCDate());
  let next = Date.UTC(y, birthDate.getUTCMonth(), birthDate.getUTCDate());
  if (next < start) next = Date.UTC(y + 1, birthDate.getUTCMonth(), birthDate.getUTCDate());
  return Math.round((next - start) / DAY_MS);
}

/**
 * ข้อเสนอที่เหมาะกับสมาชิกคนนี้ "ตอนนี้" — เรียงตามความเร่ง (priority น้อย = ทำก่อน)
 * กติกาทุกข้อเขียนไว้ตรงนี้ทั้งหมด (ไม่มีโมเดลตัดสิน) · ไม่มีข้อไหนเข้า = คืนรายการว่าง (ไม่ยัดข้อเสนอให้มีไว้ก่อน)
 */
export async function recommendOffer(ctx: MemberCtx, actor: MemberActor, customerId: string, now: Date = new Date()): Promise<OfferRecommendation> {
  const s = await memberSummary(ctx, actor, customerId, now);
  const { row } = await loadVisible(ctx, actor, customerId);
  const out: OfferSuggestion[] = [];

  if (s.wallet.rewardsPending > 0) {
    out.push({
      kind: "REWARD_PICKUP",
      title: "มีของรางวัลที่แลกไว้แต่ยังไม่ได้รับ — ชวนมารับที่ร้าน",
      reason: `ของรางวัลรอรับ ${s.wallet.rewardsPending} รายการ`,
      nextTool: null,
      priority: 1,
    });
  }
  if (s.wallet.pointsExpiringSoon > 0) {
    out.push({
      kind: "POINTS_EXPIRING",
      title: "แต้มใกล้หมดอายุ — ชวนมาใช้แต้มแลกของรางวัลหรือเป็นส่วนลด",
      reason: `แต้ม ${s.wallet.pointsExpiringSoon.toLocaleString("th-TH")} แต้มจะหมดอายุภายใน 30 วัน (คงเหลือทั้งหมด ${s.wallet.points.toLocaleString("th-TH")} แต้ม)`,
      nextTool: "member_rewards_list",
      priority: 2,
    });
  }
  if (s.wallet.vouchersExpiringIn7Days > 0) {
    out.push({
      kind: "VOUCHER_REMINDER",
      title: "voucher ใกล้หมดอายุ — เตือนให้มาใช้ก่อนหมดสิทธิ์",
      reason: `voucher ${s.wallet.vouchersExpiringIn7Days} ใบจะหมดอายุภายใน 7 วัน`,
      nextTool: null,
      priority: 3,
    });
  }
  const bday = daysToBirthday(row.birthDate, now);
  if (bday !== null && bday <= 14) {
    out.push({
      kind: "BIRTHDAY",
      title: bday === 0 ? "วันนี้วันเกิดสมาชิก — ส่งคำอวยพรพร้อมของขวัญ" : "ใกล้วันเกิดสมาชิก — เตรียมของขวัญวันเกิด",
      reason: bday === 0 ? "วันเกิดคือวันนี้" : `อีก ${bday} วันถึงวันเกิด`,
      nextTool: "member_vouchers_issue",
      priority: 4,
    });
  }
  if (s.tier.next && s.tier.shortfallSatang !== null && s.tier.shortfallSatang > 0 && (s.tier.progressPct ?? 0) >= 70) {
    out.push({
      kind: "TIER_PUSH",
      title: `ใกล้ขึ้นระดับ ${s.tier.next} — เสนอโปรที่พาข้ามเส้นในการมาครั้งถัดไป`,
      reason: `ยอดสะสมไปแล้ว ${s.tier.progressPct}% ขาดอีก ${baht(s.tier.shortfallSatang)}`,
      nextTool: null,
      priority: 5,
    });
  }
  const near = s.wallet.stamps.filter((c) => c.slots > 0 && c.slots - c.stamps <= 2 && c.stamps < c.slots);
  for (const c of near) {
    out.push({
      kind: "STAMP_NEAR",
      title: `บัตรสะสม "${c.name}" ใกล้ครบ — บอกลูกค้าว่าอีกนิดเดียวได้รางวัล`,
      reason: `ประทับแล้ว ${c.stamps}/${c.slots} ดวง`,
      nextTool: "member_stamps_add",
      priority: 6,
    });
  }
  if (s.daysSinceLastActivity >= 60) {
    const first = s.visits12m === 0 && !s.lastActivityAt;
    out.push({
      kind: first ? "WELCOME_BACK_FIRST_VISIT" : "WINBACK",
      title: first ? "สมัครแล้วยังไม่เคยมาใช้บริการ — ส่งสิทธิ์ครั้งแรกชวนมาลอง" : "ไม่ได้มานาน — ส่ง voucher ชวนกลับมา",
      reason: first
        ? `สมัครมาแล้ว ${s.daysSinceLastActivity} วัน ยังไม่มีรายการซื้อหรือนัด`
        : `ไม่มีรายการซื้อ/นัดมา ${s.daysSinceLastActivity} วัน (มาครั้งล่าสุด ${s.lastActivityAt ? dayTh.format(s.lastActivityAt) : "-"})`,
      nextTool: "member_vouchers_issue",
      priority: 7,
    });
  }
  out.sort((a, b) => a.priority - b.priority);
  return { customerId, suggestions: out };
}

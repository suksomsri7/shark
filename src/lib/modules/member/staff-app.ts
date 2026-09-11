// staff-app.ts — ข้อมูลของ "แอปพนักงาน" (SHARK HUB · Expo) จอสมาชิก 3 จอ (M3.11 · ภาพ 28)
//
// ผู้เรียก: `/api/mobile/member/{search,scan,summary,stamp}` (mobile session — Bearer ของพนักงาน + X-Tenant-Id)
// ผ่าน facade `@/lib/modules/member` เท่านั้น — route ไม่แตะ prisma และไม่รู้จักตารางของโมดูลนี้
//
// 🔴 ทุกฟังก์ชันรับ actor ของ "พนักงานคนนั้น" (ไม่ใช่ actor ของระบบ): ขอบเขตสาขา · สิทธิ์ · ข้อมูลอ่อนไหว
//    ตัดสินที่ service เดิมทั้งหมด (`listMembers` · `briefFor` · `memberSummary` · `stamp.addStamp`)
//    มองไม่เห็นสมาชิก (ข้ามร้าน/นอกสาขา) = "ไม่พบ" (404 ไม่ใช่ 403 · §6.4)
// 🔴 ไม่มีเบอร์เต็มในผลลัพธ์ใด ๆ — ใช้เบอร์ปิดบังจาก facade เสมอ (หน้าจอพนักงานมีคนยืนดูข้างหลังได้)
// 🔴 PIN ของใบสแตมป์ (`ruleConfig.staffPin` — ตาราง §6.2 "ประทับสแตมป์: STAFF ✓ (PIN)"):
//    ใบที่ร้านตั้ง PIN ไว้ ต้องใส่ PIN ตรงก่อนประทับทุกครั้ง (กันเครื่องพนักงานที่ถูกหยิบไปกดเอง)
//    ใบที่ไม่ตั้ง PIN = ประทับได้เลย (จอไม่ขอ PIN) · ตรวจที่นี่ก่อนเรียก `addStamp` (service ตรวจ PIN
//    เฉพาะฝั่งลูกค้ากดเอง — ฝั่งพนักงานยังไม่มีด่านนี้)

import * as stamp from "@/lib/modules/stamp";
import { prisma } from "./db";
import type { MemberActor } from "./access";
import { MemberInputError, MemberNotFoundError } from "./errors";
import { listHistory } from "./history";
import { memberSummary } from "./insights";
import { listMembers } from "./list";
import { resolveCardToken } from "./me";
import { briefFor, type MemberCtx } from "./profile";

// ───────────────────────── ชนิดข้อมูลที่แอปอ่าน (JSON) ─────────────────────────

export type StaffMemberRow = {
  id: string;
  memberCode: string;
  name: string;
  /** เบอร์ปิดบัง (081-xxx-5678) — ไม่มีเบอร์เต็มเด็ดขาด */
  phoneMasked: string;
  tier: { name: string; color: string } | null;
  points: number;
};

export type StaffStampCard = {
  cardId: string;
  name: string;
  slots: number;
  stamps: number;
  /** ใบนี้ร้านตั้ง PIN ไว้ = จอต้องขอ PIN ก่อนประทับ */
  pinRequired: boolean;
  /** ของที่ได้เมื่อครบใบ (ข้อความไทยสั้น) */
  reward: string;
};

export type StaffMemberSummary = {
  member: StaffMemberRow;
  stats: { points: number; vouchers: number; stamp: { name: string; stamps: number; slots: number } | null };
  history: { id: string; at: string; kind: string; title: string; sub: string }[];
  /** ปุ่มลัด 3 ปุ่มที่ยังไม่มีจอในแอป — เปิดหน้าเว็บจริงของร้านใน WebView แทน (พาธที่มีอยู่จริงทุกเส้น) */
  links: { redeem: string; points: string; voucher: string };
  canStamp: boolean;
};

export type StaffStampResult = {
  card: StaffStampCard;
  completed: boolean;
  /** ข้อความแบนเนอร์สำเร็จ (ภาพ 28 ค) เช่น "ประทับสำเร็จ · 8/10 · อีก 2 ครั้งได้ดำน้ำฟรี 1 ไดฟ์" */
  banner: string;
};

// ───────────────────────── ขอบเขต ─────────────────────────

/**
 * ระบบสมาชิกของร้าน (ระบบแรกที่เปิดอยู่) — ร้านที่ยังไม่เปิดระบบสมาชิก = ข้อความไทย (route ตอบ 404)
 * 🔴 ผู้เรียกต้องผ่าน requireMobile มาแล้ว (tenantId มาจาก membership ที่ตรวจสด ไม่ใช่จาก client ตรง ๆ)
 */
export async function staffMemberCtx(tenantId: string, actorUserId: string): Promise<MemberCtx> {
  const system = await prisma.appSystem.findFirst({
    where: { tenantId, type: "MEMBER", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!system) throw new MemberNotFoundError("ร้านนี้ยังไม่ได้เปิดระบบสมาชิก — เปิดได้ที่หน้าระบบงานของร้าน");
  return { tenantId, systemId: system.id, actorUserId };
}

function toRow(b: { id: string; memberCode: string; name: string; phoneMasked: string; tier: { name: string; color: string } | null; points: number }): StaffMemberRow {
  return {
    id: b.id,
    memberCode: b.memberCode,
    name: b.name,
    phoneMasked: b.phoneMasked,
    tier: b.tier ? { name: b.tier.name, color: b.tier.color } : null,
    points: b.points,
  };
}

// ───────────────────────── (ก) ค้น / สแกน ─────────────────────────

/** ค้นสมาชิกด้วยชื่อ/เบอร์/รหัสสมาชิก (สูงสุด 20 คน · ขอบเขตสาขาของพนักงานคนนั้น) */
export async function staffSearch(ctx: MemberCtx, actor: MemberActor, q: string): Promise<StaffMemberRow[]> {
  const text = String(q ?? "").trim().slice(0, 60);
  if (!text) return [];
  const res = await listMembers(ctx, actor, { q: text, take: 20, sort: "-lastActivityAt" });
  return res.items.map((r) =>
    toRow({ id: r.id, memberCode: r.memberCode, name: r.name, phoneMasked: r.phoneMasked, tier: r.tier, points: r.points }),
  );
}

/**
 * สแกน QR บัตรสมาชิก (`SHARK-MC:<token>` — token อายุ 24 ชม. ของหน้า `/m/<slug>/card`)
 * หมดอายุ/คนละร้าน/นอกสาขาที่พนักงานดูแล = null (ไม่บอกว่ามีคนนี้อยู่จริงไหม)
 */
export async function staffScan(ctx: MemberCtx, actor: MemberActor, raw: string): Promise<StaffMemberRow | null> {
  const token = String(raw ?? "").trim();
  if (!token || token.length > 400) return null;
  const hit = await resolveCardToken(ctx.tenantId, token);
  if (!hit) return null;
  // ตรวจซ้ำด้วยสายตาของพนักงานคนนี้ (ระบบสมาชิกเดียวกัน + ขอบเขตสาขา)
  const [brief] = await briefFor(ctx, actor, [hit.id]);
  return brief ? toRow(brief) : null;
}

// ───────────────────────── (ข) สรุป ─────────────────────────

function rewardText(card: stamp.StampCardDto): string {
  const cfg = (card.rewardConfig ?? {}) as Record<string, unknown>;
  const note = typeof cfg.note === "string" ? cfg.note.trim() : "";
  if (note) return note;
  if (card.rewardKind === "POINTS") {
    const n = Number(cfg.points);
    return Number.isFinite(n) && n > 0 ? `${n.toLocaleString("th-TH")} แต้ม` : "แต้มโบนัส";
  }
  if (card.rewardKind === "DISCOUNT_NEXT") {
    const pct = Number(cfg.pct);
    return Number.isFinite(pct) && pct > 0 ? `ส่วนลด ${pct}% ครั้งถัดไป` : "ส่วนลดครั้งถัดไป";
  }
  if (card.rewardKind === "VOUCHER") return "voucher ของร้าน";
  return "ของรางวัลของใบนี้";
}

/** ใบสแตมป์ที่พนักงานคนนี้ประทับให้สมาชิกคนนี้ได้ (ใบเปิดอยู่ · ระดับถึง · เปิดให้พนักงานสแกน) */
export async function staffStampCards(ctx: MemberCtx, actor: MemberActor, customerId: string): Promise<StaffStampCard[]> {
  const [brief] = await briefFor(ctx, actor, [customerId]);
  if (!brief) throw new MemberNotFoundError("ไม่พบสมาชิกคนนี้ในสาขาที่คุณดูแล");
  const sctx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null };
  const [progress, cards] = await Promise.all([stamp.progressFor(sctx, customerId), stamp.listCards(sctx)]);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out: StaffStampCard[] = [];
  for (const p of progress) {
    const card = byId.get(p.cardId);
    if (!card || !card.active || !card.ruleConfig.allowStaffScan) continue;
    out.push({
      cardId: p.cardId,
      name: p.name,
      slots: p.slots,
      stamps: p.stamps,
      pinRequired: !!card.ruleConfig.staffPin,
      reward: rewardText(card),
    });
  }
  return out;
}

/** การ์ดสรุปสมาชิก (ภาพ 28 ข): หัวการ์ด · ตัวเลข 3 (แต้ม/voucher/สแตมป์) · ปุ่ม 4 · ประวัติ 3 รายการ */
export async function staffSummary(ctx: MemberCtx, actor: MemberActor, customerId: string): Promise<StaffMemberSummary> {
  const id = String(customerId ?? "").trim();
  if (!id) throw new MemberInputError("ไม่ได้ระบุสมาชิก — กลับไปค้นหาแล้วเลือกใหม่อีกครั้ง");
  const s = await memberSummary(ctx, actor, id);
  const [history, cards] = await Promise.all([
    listHistory(ctx, actor, id, { take: 3 }).catch(() => null),
    staffStampCards(ctx, actor, id).catch(() => [] as StaffStampCard[]),
  ]);
  // ใบที่คืบหน้ามากที่สุดขึ้นเป็นตัวเลขสแตมป์ (ภาพ "7/10") — ใบที่ประทับให้ได้ (รวมใบที่ยัง 0 ดวง) ก่อน แล้วค่อยใบในกระเป๋า
  const ratio = (x: { stamps: number; slots: number }) => x.stamps / Math.max(1, x.slots);
  const pool = cards.length > 0 ? cards.map((c) => ({ name: c.name, stamps: c.stamps, slots: c.slots })) : s.wallet.stamps;
  const top = [...pool].sort((a, b) => ratio(b) - ratio(a))[0] ?? null;
  const base = `/app/sys/${ctx.systemId}/member`;
  return {
    member: toRow({ ...s.member, tier: s.member.tier ? { name: s.member.tier.name, color: s.member.tier.color } : null }),
    stats: { points: s.wallet.points, vouchers: s.wallet.vouchers, stamp: top },
    history: (history?.items ?? []).slice(0, 3).map((h) => ({
      id: h.id,
      at: h.at.toISOString(),
      kind: h.kind,
      title: h.title,
      sub: [h.summary, h.badge].filter((x): x is string => !!x && x.trim().length > 0).join(" · "),
    })),
    links: {
      redeem: `${base}/members/${id}?tab=wallet`,
      points: `${base}/points/adjust`,
      voucher: `${base}/promotions/vouchers`,
    },
    canStamp: cards.length > 0,
  };
}

// ───────────────────────── (ค) ประทับสแตมป์ ─────────────────────────

export type StaffStampInput = {
  customerId: string;
  cardId: string;
  pin?: string | null;
  /** เหตุผล/บริการ (บันทึกเป็นอ้างอิงของตรานี้ ≤ 80 ตัวอักษร) */
  note?: string | null;
  /** รหัสกันซ้ำจากแอป (กดปุ่มซ้ำ/เน็ตหลุดแล้วส่งซ้ำ = ได้ตราเดียว) */
  requestId: string;
};

/** ประทับสแตมป์ 1 ดวงให้สมาชิก (ภาพ 28 ค) — ใบที่ตั้ง PIN ต้อง PIN ตรง · ผลเป็นข้อความแบนเนอร์พร้อมใช้ */
export async function staffStamp(ctx: MemberCtx, actor: MemberActor, input: StaffStampInput): Promise<StaffStampResult> {
  const customerId = String(input?.customerId ?? "").trim();
  const cardId = String(input?.cardId ?? "").trim();
  const requestId = String(input?.requestId ?? "").trim();
  if (!customerId || !cardId) throw new MemberInputError("เลือกสมาชิกและใบสแตมป์ก่อน แล้วค่อยกดประทับ");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) throw new MemberInputError("รายการนี้ไม่มีรหัสกันซ้ำ — ปิดจอแล้วเปิดใหม่อีกครั้ง");

  const cards = await staffStampCards(ctx, actor, customerId);
  const card = cards.find((c) => c.cardId === cardId);
  if (!card) throw new MemberNotFoundError("ใบสแตมป์นี้ประทับให้สมาชิกคนนี้ไม่ได้ — ใบอาจถูกปิด หรือจำกัดระดับ/สาขาไว้");

  if (card.pinRequired) {
    const sctx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null };
    const full = await stamp.getCard(sctx, cardId);
    const pin = String(input?.pin ?? "").trim();
    if (!/^\d{4,6}$/.test(pin)) throw new MemberInputError("ใส่ PIN ของใบนี้ 4–6 หลักก่อนกดประทับ");
    if (pin !== full.ruleConfig.staffPin) throw new MemberInputError("PIN ไม่ตรงกับที่ร้านตั้งไว้ — ตรวจ PIN แล้วลองอีกครั้ง");
  }

  // พนักงานที่ดูแลสาขาเดียว = ตรานี้เกิดที่สาขานั้น (ใบที่จำกัดสาขาจะตรวจได้ถูก) · ดูแลหลายสาขา/ทั้งร้าน = ไม่ระบุ
  const units = actor.unitAccess.filter((u) => u && u !== "*");
  const unitId = units.length === 1 ? units[0]! : null;
  const note = String(input?.note ?? "").trim().slice(0, 80);
  const sctx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null };
  const r = await stamp.addStamp(sctx, actor, {
    cardId,
    customerId,
    count: 1,
    refType: "MANUAL",
    refId: note || null,
    unitId,
    idempotencyKey: `mobile.stamp:${requestId}`,
  });

  const stamps = Math.min(r.stamps, card.slots);
  const left = Math.max(0, card.slots - stamps);
  // "ได้ดำน้ำฟรี" ติดกัน · "ได้ 50 แต้ม" เว้นวรรคก่อนตัวเลข (อ่านเป็นภาษาคน)
  const get = /^[\d฿]/.test(card.reward) ? `ได้ ${card.reward}` : `ได้${card.reward}`;
  const banner = r.completed
    ? `ประทับสำเร็จ · ครบ ${card.slots}/${card.slots} · ${get}แล้ว`
    : `ประทับสำเร็จ · ${stamps}/${card.slots} · อีก ${left} ครั้ง ${get}`;
  return { card: { ...card, stamps: r.completed ? card.slots : stamps }, completed: r.completed, banner };
}

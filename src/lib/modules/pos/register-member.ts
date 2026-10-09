// register-member.ts — POS P1.12 (S) สมาชิกที่ตะกร้า: ค้น (R2) · สมัครด่วน (R4) · สิทธิ์ที่จอชำระ (R5) · ส่งมอบรางวัล (R13) ·
//   ด่านสมาชิกของบิล (R1) · สิทธิ์บนยอดของ quote (R6 — register.ts เรียก) · ล้างสำเนาสมาชิกบนบิลตาม PDPA (R9 · member.erased)
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.12.md §2 R1–R17 · §5 CD1–CD9 · §9 มติผู้คุมงาน · ตารางชื่อใน ledger/wo-notes/pos-P1.12-oracle.md
// 🔴 ฝั่งเซิร์ฟเวอร์ล้วน (แตะ DB) — จอ import ได้แค่ชนิดจาก register-shared.ts · action อยู่ที่ register-actions.ts
// 🔴 POS ถึงสิทธิ์สมาชิกได้ทางเดียว = facade `@/lib/modules/member` (กระเป๋าสิทธิ์ wallet · ห้ามเรียก voucher/point/stamp/giftcard ตรง) ·
//    ส่งมอบรางวัลผ่าน facade `@/lib/modules/reward` (fulfilV2 · เส้น pos→reward ลงทะเบียนใน scripts/fitness.mts · มติ 7)
//    import แบบไดนามิกทั้งคู่ (member/index → wallet → giftcard → pos = วงโหลดไฟล์ · แบบเดียวกับ service.ts)
// 🔴 ผู้กระทำแทน (delegated actor · CD2 · มติ Q2): แคชเชียร์ส่วนใหญ่มีแค่ pos.sale.create ไม่มีคีย์ member.* — ไฟล์นี้ไฟล์เดียวที่สร้าง
//    actor ของโมดูลสมาชิกแทนเขา หลังผ่าน pos.sale.create ที่สาขานั้นแล้วเท่านั้น · คีย์ตรง 3 ตัว (อ่าน · สมัคร · ส่งมอบรางวัล) · บทบาท STAFF
//    (ไม่ยกบทบาทจริง — OWNER/MANAGER ของโมดูลสมาชิกผ่านทุกคีย์) · unitAccess [] = สมาชิกทั้งร้าน (บัตรใช้ได้ทุกสาขา) ·
//    userId = ผู้ใช้จริง (audit/attribution/fulfilledById เป็นของคนจริงเสมอ) · ห้ามเรียกงานผู้ดูแลของโมดูลสมาชิกจากไฟล์นี้
// 🔴 เบอร์โทร: ออกจากไฟล์นี้แบบปิดบังเท่านั้น (phoneMasked · CD8) — เบอร์เต็มมีแค่ในคำขอสมัครด่วนที่แคชเชียร์พิมพ์
// 🔴 ปฏิเสธ = คืน {ok:false, code, message ไทย} ไม่ throw · ขัดข้องที่ไม่คาดคิด = INTERNAL

import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { evaluate } from "@/lib/core/rbac";
import { systemForUnit } from "@/lib/modules/system/service";
import type { MemberActor, MemberBrief, MemberCtx, QuoteResult, UnitPointsDto } from "@/lib/modules/member";
import { prisma } from "./db";
import { registerBenefitsCart, registerRefuse, registerScopeCheck } from "./register";
import {
  REGISTER_HEARD_FROM,
  type RegisterActor,
  type RegisterCtx,
  type RegisterFulfilRewardResult,
  type RegisterMemberBenefitsResult,
  type RegisterMemberConflict,
  type RegisterMemberItem,
  type RegisterMemberLine,
  type RegisterMemberLookupResult,
  type RegisterQuickMemberResult,
  type RegisterRefusal,
} from "./register-shared";
import type { SaleWalletCart } from "./service";

export const AUDIT_MEMBER_REGISTERED = "pos.member.registered";
export const AUDIT_REWARD_FULFILLED = "pos.member.reward_fulfilled";
/** แถวค้นได้ไม่เกิน (R2) */
const LOOKUP_MAX = 8;
const CARD_PREFIX = "SHARK-MC:";

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const isIdemKey = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(v);
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[]) => Object.keys(o).every((k) => allowed.includes(k));
const isRefusal = (v: unknown): v is RegisterRefusal => isRecord(v) && v.ok === false;
const errName = (e: unknown) => (e instanceof Error ? e.name : "");
const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** ขอบของทุกฟังก์ชันสาธารณะในไฟล์นี้ — ขัดข้องที่ไม่คาดคิด = INTERNAL (คืน ไม่ throw) */
async function guard<T>(name: string, body: () => Promise<T>): Promise<T | RegisterRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/register-member] ${name} INTERNAL`, e);
    return registerRefuse("INTERNAL");
  }
}

/** เบอร์เป็นตัวเลขล้วน (สูตรเดียวกับ party.normalizePartyPhone: 0066/66 นำหน้า → 0) */
export function digitsPhone(raw: string): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0066")) d = d.slice(4);
  if (!d.startsWith("66")) return d;
  d = d.slice(2);
  return d.startsWith("0") ? d : "0" + d;
}

// ═══════════════════ ผู้กระทำแทน (CD2 · มติ Q2) ═══════════════════
/** สร้างได้เฉพาะเมื่อผู้ใช้จริงมี pos.sale.create ที่สาขานี้ (ตรวจซ้ำที่นี่ — ไม่พึ่งผู้เรียก) */
function delegatedActor(real: RegisterActor, unitId: string): MemberActor | null {
  if (!evaluate(real, { module: "pos", action: "pos.sale.create", unitId })) return null;
  return {
    userId: real.userId,
    role: "STAFF",
    unitAccess: [],
    permissions: { "member.customer.read": true, "member.customer.create": true, "member.loyalty.fulfil": true },
  };
}

type MemberFacade = typeof import("@/lib/modules/member");
const memberFacade = (): Promise<MemberFacade> => import("@/lib/modules/member");

/** ระบบสมาชิกของสาขา + ผู้กระทำแทน (ยังไม่ระบุตัวสมาชิก) */
type MemberScope = { tenantId: string; unitId: string; memberSystemId: string; mctx: MemberCtx; actor: MemberActor; real: RegisterActor };
async function memberScope(s: { tenantId: string; unitId: string; actor: RegisterActor }): Promise<MemberScope | RegisterRefusal> {
  const memberSystemId = await systemForUnit(s.tenantId, s.unitId, "MEMBER");
  if (!memberSystemId) return registerRefuse("MEMBER_SYSTEM_MISSING");
  const actor = delegatedActor(s.actor, s.unitId);
  if (!actor) return registerRefuse("PERMISSION_DENIED");
  return { tenantId: s.tenantId, unitId: s.unitId, memberSystemId, mctx: { tenantId: s.tenantId, systemId: memberSystemId, actorUserId: s.actor.userId }, actor, real: s.actor };
}

/** ด่านสมาชิกของบิล (R1) ผ่านแล้ว */
export type RegisterMemberGate = MemberScope & { ok: true; brief: MemberBrief };

/**
 * R1 — ลูกค้าคนนี้แนบบิลของสาขานี้ได้ไหม: สาขาไม่มีระบบสมาชิก = MEMBER_SYSTEM_MISSING · ไม่อยู่ในระบบสมาชิกของสาขา (ร้านอื่น/ระบบอื่น/ไม่มีจริง) ·
 * ถูกรวม (MERGED) · ถูกลบ (CLOSED) = MEMBER_NOT_FOUND ข้อความเดียว (404-not-403) · SUSPENDED = MEMBER_SUSPENDED
 * (ผู้เรียกผ่านด่านขอบเขต + pos.sale.create ของสาขาแล้ว)
 */
export async function registerMemberGate(s: { tenantId: string; unitId: string; actor: RegisterActor }, memberId: string): Promise<RegisterMemberGate | RegisterRefusal> {
  const ms = await memberScope(s);
  if (isRefusal(ms)) return ms;
  if (!isId(memberId)) return registerRefuse("MEMBER_NOT_FOUND");
  const member = await memberFacade();
  const [brief] = await member.briefFor(ms.mctx, ms.actor, [memberId]);
  if (!brief || brief.id !== memberId || brief.status === "MERGED" || brief.status === "CLOSED") return registerRefuse("MEMBER_NOT_FOUND");
  if (brief.status === "SUSPENDED") return registerRefuse("MEMBER_SUSPENDED");
  return { ...ms, ok: true, brief };
}

// ═══════════════════ แถวสมาชิกบนจอ (R2 DTO) ═══════════════════
async function itemsOf(ms: MemberScope, briefs: MemberBrief[]): Promise<RegisterMemberItem[]> {
  if (!briefs.length) return [];
  const member = await memberFacade();
  const ids = briefs.map((b) => b.id);
  const [points, stats] = await Promise.all([
    Promise.all(ids.map((id) => member.pointBalanceForUnit(ms.mctx, { customerId: id, unitId: ms.unitId }))),
    // ซื้อล่าสุด/จำนวนครั้ง = บิลขาย POS ของร้าน (ตารางของ POS เอง) ที่ไม่ถูกยกเลิก
    prisma.posSale.groupBy({
      by: ["memberId"],
      where: { tenantId: ms.tenantId, memberId: { in: ids }, docType: "SALE", status: { in: ["PAID", "REFUNDED"] } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ]);
  const statOf = new Map(stats.map((r) => [r.memberId ?? "", r]));
  return briefs.map((b, i) => {
    const st = statOf.get(b.id);
    return {
      id: b.id,
      memberCode: b.memberCode,
      name: b.name,
      phoneMasked: b.phoneMasked,
      tier: b.tier ? { key: b.tier.key, name: b.tier.name, color: b.tier.color } : null,
      points: points[i]?.balance ?? 0,
      lastPurchaseAt: st?._max.createdAt ? st._max.createdAt.toISOString() : null,
      purchaseCount: st?._count._all ?? 0,
      suspended: b.status === "SUSPENDED",
    };
  });
}

/** การ์ดย่อของ id ตามลำดับที่ส่งมา — เฉพาะคนที่แนบบิลได้หรือถูกระงับ (MERGED/CLOSED/ระบบอื่น = ไม่อยู่ในผล) */
async function briefsInOrder(ms: MemberScope, ids: string[]): Promise<MemberBrief[]> {
  if (!ids.length) return [];
  const member = await memberFacade();
  const rows = await member.briefFor(ms.mctx, ms.actor, ids);
  const byId = new Map(rows.filter((b) => b.status === "ACTIVE" || b.status === "SUSPENDED").map((b) => [b.id, b]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

// ═══════════════════ R2 ค้นสมาชิก ═══════════════════
type ListRowLite = { id: string; memberCode: string; lastActivityAt: Date | null };
/** -lastActivityAt (ว่างไว้ท้าย) แล้ว id — ลำดับเดียวกับ listMembers ปริยาย */
const byActivity = (a: ListRowLite, b: ListRowLite) => {
  const x = a.lastActivityAt ? a.lastActivityAt.getTime() : -Infinity;
  const y = b.lastActivityAt ? b.lastActivityAt.getTime() : -Infinity;
  return x !== y ? y - x : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

async function listRows(ms: MemberScope, q: string): Promise<ListRowLite[]> {
  const member = await memberFacade();
  const r = await member.listMembers(ms.mctx, ms.actor, { q, take: LOOKUP_MAX });
  return r.items.map((x) => ({ id: x.id, memberCode: x.memberCode, lastActivityAt: x.lastActivityAt }));
}

/** รูปเบอร์ที่ร้านอาจเก็บไว้ (มติ Q4: พิมพ์มาแบบไหนก็หาเจอ — ตัวเลขล้วน · 3-3-4 · 2-3-4 · เว้นวรรค) */
function phoneForms(typed: string, digits: string): string[] {
  const dash = (d: string, cuts: number[], sep: string) => {
    const parts: string[] = [];
    let at = 0;
    for (const c of cuts) {
      if (d.length <= c) break;
      parts.push(d.slice(at, c));
      at = c;
    }
    parts.push(d.slice(at));
    return parts.join(sep);
  };
  return [...new Set([typed, digits, dash(digits, [3, 6], "-"), dash(digits, [2, 5], "-"), dash(digits, [3, 6], " ")].filter((x) => x.length >= 3))];
}

async function lookupIds(ms: MemberScope, q: string): Promise<string[]> {
  // QR บัตรสมาชิก (SHARK-MC:<token>) — หมดอายุ/ร้านอื่น/ระบบอื่น = ไม่พบ (ด่าน R1 ด้วย briefFor ของระบบสมาชิกของสาขา)
  if (q.startsWith(CARD_PREFIX)) {
    const card = await (await memberFacade()).resolveCardToken(ms.tenantId, q);
    return card ? [card.id] : [];
  }
  // รหัสสมาชิกตรงตัว (ไม่สนตัวพิมพ์)
  if (/^[A-Za-z0-9]{4,16}$/.test(q)) {
    const exact = (await listRows(ms, q)).filter((r) => r.memberCode.toUpperCase() === q.toUpperCase());
    if (exact.length) return exact.map((r) => r.id);
  }
  // เบอร์โทร: ตัวเลข ≥ 3 หลัก (ตัดขีด/วรรค · +66) — ค้นทั้งแบบที่พิมพ์และแบบตัวเลขล้วน/มีขีด (เบอร์เก่าที่เก็บแบบมีขีด)
  if (/^[0-9+\s-]+$/.test(q)) {
    const digits = digitsPhone(q);
    if (digits.length < 3) return [];
    const all = new Map<string, ListRowLite>();
    for (const rows of await Promise.all(phoneForms(q, digits).map((f) => listRows(ms, f)))) for (const r of rows) all.set(r.id, r);
    return [...all.values()].sort(byActivity).map((r) => r.id);
  }
  // ชื่อ (≥ 2 ตัวอักษร)
  if ([...q].length < 2) return [];
  return (await listRows(ms, q)).map((r) => r.id);
}

/** R2 — ค้นสมาชิกที่หน้าขาย: ≤ 8 แถว · ใหม่ล่าสุดก่อน (lastActivityAt) · q สั้นเกิน = items [] (ไม่ปฏิเสธ) · อ่านอย่างเดียว */
export async function registerMemberLookup(ctx: RegisterCtx, actor: RegisterActor, input: { q: string }): Promise<RegisterMemberLookupResult> {
  return guard("registerMemberLookup", async (): Promise<RegisterMemberLookupResult> => {
    const sc = await registerScopeCheck(ctx, actor);
    if (isRefusal(sc)) return sc;
    if (!isRecord(input) || !onlyKeys(input, ["q"]) || typeof input.q !== "string" || input.q.length > 200) return registerRefuse("VALIDATION");
    const ms = await memberScope({ tenantId: sc.ctx.tenantId, unitId: sc.ctx.unitId, actor: sc.actor });
    if (isRefusal(ms)) return ms;
    const q = input.q.trim();
    if (!q) return { ok: true, items: [] };
    const ids = (await lookupIds(ms, q)).slice(0, LOOKUP_MAX * 3);
    const briefs = (await briefsInOrder(ms, ids)).slice(0, LOOKUP_MAX);
    return { ok: true, items: await itemsOf(ms, briefs) };
  });
}

// ═══════════════════ R4 สมัครด่วน ═══════════════════
const QUICK_KEYS = ["phone", "name", "birthDate", "marketingConsent", "heardFrom", "idempotencyKey"] as const;
const CONSENT_CHANNELS = ["LINE", "EMAIL", "SMS"] as const;

function validYmd(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1900 && dt.getTime() <= Date.now();
}

/**
 * R4 — สมัครสมาชิกจากหน้าขาย (14A): เบอร์เก็บเป็นตัวเลขล้วน (มติ 9) · ที่มา POS · สาขาหลัก = สาขานี้ · ยินยอม LINE/EMAIL/SMS ตาม
 * marketingConsent (STAFF) · ที่มา FIRST/LAST มาจาก createMember (staffUserId = ผู้ใช้จริง) · เบอร์ซ้ำ = created:false คนเดิม ·
 * idempotencyKey เดิม = คนเดิม · audit pos.member.registered เฉพาะคนที่ถูกสร้าง (มติ 10 · ไม่มีเบอร์เต็ม)
 */
export async function registerQuickMember(
  ctx: RegisterCtx,
  actor: RegisterActor,
  input: { phone: string; name: string; birthDate?: string; marketingConsent: boolean; heardFrom: string; idempotencyKey: string },
): Promise<RegisterQuickMemberResult> {
  return guard("registerQuickMember", async (): Promise<RegisterQuickMemberResult> => {
    const sc = await registerScopeCheck(ctx, actor);
    if (isRefusal(sc)) return sc;
    // ── โครงคำขอ (คีย์ตรงตัว · ผิด = VALIDATION ไม่มีอะไรถูกเขียน) ──
    if (!isRecord(input) || !onlyKeys(input, QUICK_KEYS)) return registerRefuse("VALIDATION");
    if (typeof input.phone !== "string" || input.phone.length > 40) return registerRefuse("VALIDATION", "เบอร์โทรไม่ถูกต้อง");
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || [...name].length > 80 || name.includes("\u0000")) return registerRefuse("VALIDATION", "ชื่อต้องมี 1–80 ตัวอักษร");
    let birthDate: string | null = null;
    if (input.birthDate !== undefined && input.birthDate !== null) {
      if (typeof input.birthDate !== "string" || !validYmd(input.birthDate)) return registerRefuse("VALIDATION", "วันเกิดต้องเป็น ปี-เดือน-วัน เช่น 1992-05-20");
      birthDate = input.birthDate;
    }
    if (typeof input.marketingConsent !== "boolean") return registerRefuse("VALIDATION");
    if (!(REGISTER_HEARD_FROM as readonly unknown[]).includes(input.heardFrom)) return registerRefuse("VALIDATION", "เลือกที่มาของลูกค้า");
    if (!isIdemKey(input.idempotencyKey)) return registerRefuse("VALIDATION");
    const phone = digitsPhone(input.phone);
    if (phone.length < 9 || phone.length > 10 || !phone.startsWith("0")) return registerRefuse("PHONE_INVALID");

    const ms = await memberScope({ tenantId: sc.ctx.tenantId, unitId: sc.ctx.unitId, actor: sc.actor });
    if (isRefusal(ms)) return ms;
    const member = await memberFacade();
    let res: Awaited<ReturnType<MemberFacade["createMember"]>>;
    try {
      res = await member.createMember(ms.mctx, ms.actor, {
        phone,
        name,
        ...(birthDate ? { birthDate } : {}),
        source: "POS",
        sourceDetail: { heardFrom: input.heardFrom, unitId: ms.unitId },
        homeUnitId: ms.unitId,
        consents: CONSENT_CHANNELS.map((channel) => ({ channel, granted: input.marketingConsent, source: "STAFF" })),
        idempotencyKey: `pos-qr:${input.idempotencyKey}`,
      });
    } catch (e) {
      if (errName(e) === "MemberInputError") return registerRefuse("VALIDATION", errMessage(e));
      if (errName(e) === "MemberForbiddenError") return registerRefuse("PERMISSION_DENIED");
      throw e;
    }
    const [brief] = await briefsInOrder(ms, [res.customerId]);
    if (!brief) return registerRefuse("MEMBER_NOT_FOUND");
    if (res.created) {
      await writeAudit({
        tenantId: ms.tenantId,
        actorId: ms.real.userId,
        action: AUDIT_MEMBER_REGISTERED,
        targetType: "Customer",
        targetId: res.customerId,
        after: { customerId: res.customerId, created: true, unitId: ms.unitId, memberCode: brief.memberCode, phoneMasked: brief.phoneMasked, heardFrom: input.heardFrom },
      });
    }
    const [item] = await itemsOf(ms, [brief]);
    return { ok: true, created: res.created, member: item! };
  });
}

// ═══════════════════ R5 สิทธิ์ที่จอชำระ ═══════════════════
const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
function voucherValueLabel(v: { kind: string; value: number; name: string }): string {
  if (v.kind === "FIXED") return `฿${baht(v.value)}`;
  if (v.kind === "PERCENT") return `${v.value}%`;
  return v.name;
}

/** R5 — สิทธิ์ทั้งหมดของสมาชิกกับตะกร้านี้ (แผงจอชำระ) · อ่านอย่างเดียว · บัตรของขวัญแสดงยอดแบบปิดเลขเท่านั้น (CD3) */
export async function registerMemberBenefits(ctx: RegisterCtx, actor: RegisterActor, input: { memberId: string; cart: unknown }): Promise<RegisterMemberBenefitsResult> {
  return guard("registerMemberBenefits", async (): Promise<RegisterMemberBenefitsResult> => {
    const sc = await registerScopeCheck(ctx, actor);
    if (isRefusal(sc)) return sc;
    if (!isRecord(input) || !onlyKeys(input, ["memberId", "cart"]) || !isRecord(input.cart)) return registerRefuse("VALIDATION");
    const g = await registerMemberGate({ tenantId: sc.ctx.tenantId, unitId: sc.ctx.unitId, actor: sc.actor }, String(input.memberId ?? ""));
    if (isRefusal(g)) return g;
    const cart = await registerBenefitsCart(sc.ctx, sc.actor, input.cart);
    if (isRefusal(cart)) return cart;
    const member = await memberFacade();
    const [wallet, pts, items] = await Promise.all([
      member.getWallet(g.mctx, g.actor, g.brief.id, { cart: cart.cart }),
      member.pointBalanceForUnit(g.mctx, { customerId: g.brief.id, unitId: g.unitId }),
      itemsOf(g, [g.brief]),
    ]);
    const tb = wallet.tierBenefits;
    return {
      ok: true,
      member: items[0]!,
      tier: tb.tier ? { name: tb.tier.name, discountPct: tb.discountPct, discountFixedSatang: tb.discountFixedSatang, discountMaxSatang: tb.discountMaxSatang } : null,
      points: pts
        ? {
            balance: pts.balance,
            burnRateSatang: pts.burnRateSatang,
            burnMinPoints: pts.burnMinPoints,
            burnMaxPct: pts.burnMaxPct,
            balanceValueSatang: pts.balance * pts.burnRateSatang,
            expiringSoon: wallet.points.expiringSoon.map((e) => ({ points: e.points, expiresAt: new Date(e.expiresAt).toISOString() })),
          }
        : null,
      vouchers: wallet.vouchers.map((v) => ({
        id: v.id,
        name: v.name,
        code: v.code,
        valueLabel: voucherValueLabel(v),
        expiresAt: new Date(v.expiresAt).toISOString(),
        applicable: v.applicable === true,
        discountSatang: v.applicable === true ? (v.discountSatang ?? 0) : 0,
        reason: v.applicable === true ? null : (v.reason ?? "ใบนี้ใช้กับบิลนี้ไม่ได้"),
      })),
      stamps: wallet.stamps.map((s) => ({ cardId: s.cardId, name: s.name, stamps: s.stamps, slots: s.slots })),
      giftCards: wallet.giftCards.map((c) => ({ numberMasked: c.numberMasked, balanceSatang: c.balanceSatang, expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString() : null })),
      rewardsPending: wallet.rewardsPending.map((r) => ({ redemptionId: r.redemptionId, rewardName: r.rewardName, expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null })),
    };
  });
}

// ═══════════════════ R13 ส่งมอบรางวัลที่เคาน์เตอร์ ═══════════════════
async function fulfilAudited(tenantId: string, redemptionId: string, customerId: string): Promise<boolean> {
  const row = await prisma.auditLog.findFirst({
    where: { tenantId, action: AUDIT_REWARD_FULFILLED, targetType: "RewardRedemption", targetId: redemptionId, after: { path: ["customerId"], equals: customerId } },
    select: { id: true },
  });
  return !!row;
}

/**
 * R13 — ส่งมอบของรางวัลที่สมาชิกแลกไว้ (ไม่ใช่บรรทัดบิล · ไม่มีเงิน) ผ่าน reward.fulfilV2 · idempotent (ส่งมอบแล้ว = ok · audit แถวเดียว) ·
 * รายการไม่ใช่ของสมาชิกคนนี้ = MEMBER_NOT_FOUND (มติ 13 · ไม่บอกว่ามีอยู่) · fulfilledById + audit = ผู้ใช้จริง
 */
export async function registerFulfilReward(ctx: RegisterCtx, actor: RegisterActor, input: { memberId: string; redemptionId: string }): Promise<RegisterFulfilRewardResult> {
  return guard("registerFulfilReward", async (): Promise<RegisterFulfilRewardResult> => {
    const sc = await registerScopeCheck(ctx, actor);
    if (isRefusal(sc)) return sc;
    if (!isRecord(input) || !onlyKeys(input, ["memberId", "redemptionId"]) || !isId(input.redemptionId)) return registerRefuse("VALIDATION");
    const g = await registerMemberGate({ tenantId: sc.ctx.tenantId, unitId: sc.ctx.unitId, actor: sc.actor }, String(input.memberId ?? ""));
    if (isRefusal(g)) return g;
    const reward = await import("@/lib/modules/reward");
    const rctx = await reward.resolveRewardCtx(g.tenantId, g.memberSystemId, g.real.userId);
    if (!rctx) return registerRefuse("MEMBER_NOT_FOUND");
    const pending = await reward.pendingForCustomer(rctx, g.brief.id);
    if (!pending.some((p) => p.redemptionId === input.redemptionId)) {
      // ส่งมอบไปแล้วจากหน้าขายนี้ (ยิงซ้ำ) = ok · อื่น (ของคนอื่น/ยกเลิก/ไม่มีจริง) = ไม่พบ
      return (await fulfilAudited(g.tenantId, input.redemptionId, g.brief.id)) ? { ok: true } : registerRefuse("MEMBER_NOT_FOUND");
    }
    try {
      await reward.fulfilV2(rctx, g.actor, { redemptionId: input.redemptionId, unitId: g.unitId });
    } catch (e) {
      // หมดอายุ / รับได้เฉพาะสาขาอื่น — ข้อความไทยของโมดูลรางวัล
      return registerRefuse("VALIDATION", errMessage(e).slice(0, 200));
    }
    if (!(await fulfilAudited(g.tenantId, input.redemptionId, g.brief.id))) {
      await writeAudit({
        tenantId: g.tenantId,
        actorId: g.real.userId,
        action: AUDIT_REWARD_FULFILLED,
        targetType: "RewardRedemption",
        targetId: input.redemptionId,
        after: { redemptionId: input.redemptionId, customerId: g.brief.id, unitId: g.unitId },
      });
    }
    return { ok: true };
  });
}

// ═══════════════════ R6 สิทธิ์บนยอดของ quote/submit (register.ts เรียกหลังคิดราคา + คูปอง) ═══════════════════
/** สำเนาสมาชิกบนบิล (R9 · PosSale.memberSnapshot) — ไม่มีเบอร์เต็ม */
export type RegisterMemberSnapshot = { name: string | null; memberCode: string; phoneMasked: string | null; tierKey: string | null; tierName: string | null };
export type RegisterMemberQuote = {
  tierDiscountSatang: number;
  /** = ส่วนลดรวมของกระเป๋า − บรรทัดคูปองของกระเป๋า (สูตรเดียวกับ createSale · คูปองเป็นของ POS) */
  memberDiscountSatang: number;
  memberLines: RegisterMemberLine[];
  pointsToEarn: number;
  stampsToAdd: { cardId: string; name: string; count: number }[];
  memberConflicts: RegisterMemberConflict[];
  /** แต้มที่บิลนี้จะตัดจริง (บรรทัด POINTS ของกระเป๋า) · ยอดแต้มก่อนขายของระบบแต้มของสาขา (null = ไม่มีระบบแต้ม) */
  pointsBurned: number;
  pointsBalance: number | null;
  memberSystemId: string;
  snapshot: RegisterMemberSnapshot;
};

const KIND_OF: Record<string, RegisterMemberLine["kind"] | undefined> = { TIER: "TIER", VOUCHER: "VOUCHER", POINTS: "POINTS", GIFTCARD: "GIFTCARD" };

/**
 * R6 R11 R16 — สิทธิ์ของสมาชิกกับตะกร้านี้ผ่าน `member.quoteApply` (อ่านอย่างเดียว · ลำดับกระเป๋า TIER → VOUCHER → COUPON → POINTS) ด้วยตะกร้า
 * จาก saleWalletCart ตัวเดียวกับ createSale ⇒ ยอดบนจอ = ยอดที่ตัดจริง · สิทธิ์ที่เลือกแต่ใช้ไม่ได้ = memberConflicts (quote ไม่ปฏิเสธ):
 *   ว่อชเชอร์ใช้ไม่ได้ = VOUCHER_INVALID · ว่อชเชอร์ห้ามซ้อนคูปอง (กติกาเดียวกับ createSale: คูปองขัดแย้ง + มีว่อชเชอร์ถูกใช้) = VOUCHER_COUPON_CONFLICT ·
 *   แต้ม: ไม่มีระบบแต้ม = POINTS_DISABLED · < ขั้นต่ำ = POINTS_BELOW_MIN · > คงเหลือ = POINTS_INSUFFICIENT · ถูกตัดให้พอดีเพดาน = POINTS_CAPPED {allowedPoints}
 *   (ลำดับตรวจเดียวกับ computeQuote ของกระเป๋า)
 */
export async function registerMemberQuote(
  g: RegisterMemberGate,
  cart: SaleWalletCart,
  choices: { voucherId: string | null; points: number },
): Promise<RegisterMemberQuote> {
  const member = await memberFacade();
  const want = choices.points;
  const [q, pts] = await Promise.all([
    member.quoteApply(g.mctx, g.actor, g.brief.id, cart, { voucherIds: choices.voucherId ? [choices.voucherId] : [], ...(want > 0 ? { points: want } : {}) }) as Promise<QuoteResult>,
    member.pointBalanceForUnit(g.mctx, { customerId: g.brief.id, unitId: g.unitId }) as Promise<UnitPointsDto | null>,
  ]);
  const couponLine = q.lines.find((l) => l.kind === "COUPON");
  const memberLines: RegisterMemberLine[] = q.lines.flatMap((l) => {
    const kind = KIND_OF[l.kind];
    return kind ? [{ kind, ref: l.ref ?? null, label: l.label, discountSatang: l.discountSatang, note: l.note ?? null }] : [];
  });
  const conflicts: RegisterMemberConflict[] = [];
  // ว่อชเชอร์ที่เลือก
  if (choices.voucherId && !q.lines.some((l) => l.kind === "VOUCHER" && l.ref === choices.voucherId)) {
    const c = q.conflicts.find((x) => x.kind === "VOUCHER" && x.ref === choices.voucherId) ?? q.conflicts.find((x) => x.kind === "VOUCHER");
    conflicts.push({ kind: "VOUCHER", code: "VOUCHER_INVALID", message: c?.message ?? "ว่อชเชอร์ใบนี้ใช้กับบิลนี้ไม่ได้" });
  }
  // คูปอง + ว่อชเชอร์ที่ห้ามซ้อน (createSale โยนในกรณีเดียวกันนี้)
  const couponConflict = cart.couponCode ? q.conflicts.find((x) => x.kind === "COUPON") : undefined;
  if (couponConflict && q.lines.some((l) => l.kind === "VOUCHER")) {
    conflicts.push({ kind: "COUPON", code: "VOUCHER_COUPON_CONFLICT", message: couponConflict.message });
  }
  // แต้ม
  const pointsLine = q.lines.find((l) => l.kind === "POINTS");
  const pointsBurned = pointsLine && pts ? Math.floor(pointsLine.discountSatang / Math.max(1, pts.burnRateSatang)) : 0;
  if (want > 0) {
    const msg = q.conflicts.find((x) => x.kind === "POINTS")?.message;
    if (!pts) conflicts.push({ kind: "POINTS", code: "POINTS_DISABLED", message: msg ?? "สาขานี้ยังไม่ได้เปิดใช้ระบบแต้ม" });
    else if (want < pts.burnMinPoints) conflicts.push({ kind: "POINTS", code: "POINTS_BELOW_MIN", message: msg ?? `ใช้แต้มได้ตั้งแต่ ${pts.burnMinPoints} แต้ม` });
    else if (want > pts.balance) conflicts.push({ kind: "POINTS", code: "POINTS_INSUFFICIENT", message: msg ?? `แต้มคงเหลือ ${pts.balance} แต้ม` });
    else if (pointsBurned !== want) conflicts.push({ kind: "POINTS", code: "POINTS_CAPPED", message: msg ?? `ใช้แต้มได้ ${pointsBurned} แต้ม`, allowedPoints: pointsBurned });
  }
  return {
    tierDiscountSatang: q.lines.filter((l) => l.kind === "TIER").reduce((t, l) => t + l.discountSatang, 0),
    memberDiscountSatang: q.totalDiscountSatang - (couponLine?.discountSatang ?? 0),
    memberLines,
    pointsToEarn: q.pointsToEarn,
    stampsToAdd: q.stampsToAdd.map((s) => ({ cardId: s.cardId, name: s.name, count: s.count })),
    memberConflicts: conflicts,
    pointsBurned,
    pointsBalance: pts ? pts.balance : null,
    memberSystemId: g.memberSystemId,
    snapshot: {
      name: g.brief.name,
      memberCode: g.brief.memberCode,
      phoneMasked: g.brief.phoneMasked,
      tierKey: g.brief.tier?.key ?? null,
      tierName: g.brief.tier?.name ?? null,
    },
  };
}

// ═══════════════════ R9 PDPA — member.erased (outbox-consumers.ts เรียกหลังตัวรับของ CRM) ═══════════════════
/**
 * สมาชิกถูกลบตาม PDPA → ล้างชื่อ/เบอร์ปิดบังในสำเนาสมาชิกของบิลทุกใบของคนนั้นเป็น null (คงรหัสสมาชิก · ระดับ · สิทธิ์ · เงิน) ·
 * idempotent (ล้างซ้ำ = ค่าเดิม) · ไม่แตะ updatedAt/ยอดเงิน · บิลของคนอื่นไม่ถูกแตะ
 */
export async function posMemberErased(evt: { tenantId: string; payload: unknown }): Promise<number> {
  const p = isRecord(evt.payload) ? evt.payload : {};
  const customerId = typeof p.customerId === "string" ? p.customerId : "";
  if (!evt.tenantId || !customerId) return 0;
  return prisma.$executeRaw`
    UPDATE "PosSale" SET "memberSnapshot" = jsonb_set(jsonb_set("memberSnapshot", '{name}', 'null'::jsonb), '{phoneMasked}', 'null'::jsonb)
    WHERE "tenantId" = ${evt.tenantId} AND "memberId" = ${customerId} AND "memberSnapshot" IS NOT NULL AND jsonb_typeof("memberSnapshot") = 'object'
      AND ("memberSnapshot"->'name' <> 'null'::jsonb OR "memberSnapshot"->'phoneMasked' <> 'null'::jsonb)`;
}

/** ชนิดที่ Prisma ต้องการสำหรับคอลัมน์ Json (register.ts ส่ง snapshot เข้า createSale) */
export const memberSnapshotJson = (s: RegisterMemberSnapshot): Prisma.InputJsonValue => ({ ...s }) as unknown as Prisma.InputJsonValue;

// tender.ts — POS P2.9 ▸ บัตรของขวัญ/เครดิตร้านเป็นวิธีชำระ: ตัวอ่านของจอชำระ (ค้นบัตร · ช่องแถว 2 ของจอ 02) + ขั้นย้อนบัตรของคิว void ◂
// สัญญา = scripts/qc-pos-p2.9.mts (G1 R2 V1–V3 S4) · brief ledger/pos-briefs/pos-brief-P2.9.md §2 R2 R5 R12 · มติผู้คุมงาน 6 8 10 13
//
// 🔴 บัตรทุกอย่างผ่าน member facade (`@/lib/modules/member` — import แบบไดนามิก: member → wallet → giftcard → pos = วงโหลดไฟล์) ·
//    ห้าม import `@/lib/modules/giftcard` ใน modules/pos/** (hard rule P1.12 · ST2)
// 🔴 คำปฏิเสธคืนเป็นข้อมูล {ok:false, code, message} (ไม่โยนข้าม action) · ไม่พบ/ร้านอื่น = GIFT_CARD_NOT_FOUND ข้อความเดียวกัน (X2)
// 🔴 ค้นบัตรไม่ใช้ PIN และไม่เขียนอะไร (ตัวนับ PIN ไม่ขยับ) · ผลมีแต่เลขปิดบัง — ไม่มีเลขเต็ม/PIN ออกจากเซิร์ฟเวอร์

import { evaluate } from "@/lib/core/rbac";
import { systemForUnit } from "@/lib/modules/system/service";
import { prisma } from "./db";
import { parsePosPaymentSettings } from "./payment-settings"; // POS P2.9b ▸ มติ 14 ◂
import { registerRefuse, registerScopeCheck } from "./register";
import type { RegisterActor, RegisterCtx, RegisterRefusal } from "./register-shared";

type Db = typeof prisma;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const NUMBER_MAX = 40;

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | RegisterRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/tender] ${name} INTERNAL`, e);
    return registerRefuse("INTERNAL");
  }
}

/** ผลค้นบัตรของขวัญที่จอชำระ (R2) — เลขปิดบัง GC-••••1234 · ยอด · สถานะ · ใช้ได้ไหม + เหตุ (ระงับ/หมดอายุ/หมด/ล็อก PIN) */
export type RegisterGiftCardLookup = {
  ok: true;
  card: {
    numberMasked: string;
    balanceSatang: number;
    status: string;
    expiresAt: string | null;
    usable: boolean;
    reason: "SUSPENDED" | "EXPIRED" | "DEPLETED" | "PIN_LOCKED" | null;
  };
};
export type RegisterGiftCardLookupResult = RegisterGiftCardLookup | RegisterRefusal;

/**
 * R2 — ค้นบัตรของขวัญด้วยเลข (สแกน/พิมพ์) ก่อนใส่ PIN · สิทธิ์ pos.sale.create ที่สาขา · บัตรทั้งร้าน (CD11 — สาขาไม่มีระบบสมาชิกก็ค้นได้)
 * ไม่พบ/ร้านอื่น/เลขเครดิตร้าน = GIFT_CARD_NOT_FOUND (ข้อความเดียวกัน)
 */
export async function registerGiftCardLookup(ctx: RegisterCtx, actor: RegisterActor, input: { number: string }, client?: Db): Promise<RegisterGiftCardLookupResult> {
  return guard("registerGiftCardLookup", async () => {
    const sc = await registerScopeCheck(ctx, actor, client);
    if (sc.ok === false) return sc;
    if (!evaluate(sc.actor, { module: "pos", action: "pos.sale.create", unitId: sc.ctx.unitId })) return registerRefuse("PERMISSION_DENIED");
    const n = isRecord(input) && typeof input.number === "string" ? input.number.trim() : "";
    if (!n || n.length > NUMBER_MAX) return registerRefuse("VALIDATION", "หมายเลขบัตรไม่ถูกต้อง");
    const member = await import("@/lib/modules/member");
    const card = await member.giftCardTenderLookup(sc.ctx.tenantId, n);
    if (!card) return registerRefuse("GIFT_CARD_NOT_FOUND");
    return { ok: true as const, card: { ...card, status: String(card.status), expiresAt: card.expiresAt ? card.expiresAt.toISOString() : null } };
  });
}

/** ช่องแถว 2 ของจอชำระ (02) — สัญญาฝั่งเซิร์ฟเวอร์ให้ P2.9U (มติ 6 8 13) */
export type RegisterPayTenders = {
  ok: true;
  tenders: {
    /** บัตรของขวัญ: ร้านเปิดใช้บัตรกำนัล */
    giftCard: { enabled: boolean };
    /** เครดิตร้าน: สาขามีระบบสมาชิก (ยอดของสมาชิกในบิล = registerMemberBenefits / giftCards) */
    storeCredit: { enabled: boolean };
    /** มัดจำ: POS P2.9b ▸ R9 มติ 14 — แสดงเสมอ · enabled = ค่าตั้ง pos.deposit.enabled ของ POS นี้ (ปิด = reason "DISABLED") ◂ */
    deposit: { visible: true; enabled: boolean; reason?: "DISABLED" };
    /** ลงบิลห้องพัก: แสดงเฉพาะสาขาโรงแรม (UnitType HOTEL) และปิด ("เร็ว ๆ นี้") · มติ 8 */
    roomCharge: { visible: boolean; enabled: false; reason: "SOON" };
  };
};
export type RegisterPayTendersResult = RegisterPayTenders | RegisterRefusal;

export async function registerPayTenders(ctx: RegisterCtx, actor: RegisterActor, client?: Db): Promise<RegisterPayTendersResult> {
  return guard("registerPayTenders", async () => {
    const db = client ?? prisma;
    const sc = await registerScopeCheck(ctx, actor, db);
    if (sc.ok === false) return sc;
    const { tenantId, unitId } = sc.ctx;
    const member = await import("@/lib/modules/member");
    const [unit, memberSystemId, giftCard, sys] = await Promise.all([
      db.businessUnit.findFirst({ where: { id: unitId, tenantId }, select: { type: true } }),
      systemForUnit(tenantId, unitId, "MEMBER"),
      member.giftCardTenderEnabled(tenantId),
      db.appSystem.findFirst({ where: { id: sc.ctx.systemId, tenantId }, select: { settings: true } }), // POS P2.9b ◂
    ]);
    const depositOn = parsePosPaymentSettings(sys?.settings).deposit.enabled;
    return {
      ok: true as const,
      tenders: {
        giftCard: { enabled: giftCard },
        storeCredit: { enabled: !!memberSystemId },
        deposit: depositOn ? { visible: true as const, enabled: true } : { visible: true as const, enabled: false, reason: "DISABLED" as const }, // POS P2.9b ▸ มติ 14 ◂
        roomCharge: { visible: unit?.type === "HOTEL", enabled: false as const, reason: "SOON" as const },
      },
    };
  });
}

/**
 * R5 (มติ 10) — งานหลักของคิว `pos.sale.voided` (ก่อนสะพานสมาชิก · ลองใหม่ได้ · idempotent ต่อ USE): บิลที่ถูก void แล้วเท่านั้น ⇒
 * ย้อน USE ของแถว GIFT_CARD/STORE_CREDIT ทุกแถว (REFUND คีย์ giftcard-refund-<USE> · ไม่มี JV — JV ขายถูกกลับทั้งใบ) · บิล walk-in ก็ทำ ·
 * ล้ม = โยน (event ลองใหม่) · ไม่มีแถวบัตร = query เดียวแล้วจบ
 */
export async function tenderSaleVoided(evt: { tenantId: string; payload: unknown }): Promise<void> {
  const saleId = isRecord(evt.payload) && typeof evt.payload.saleId === "string" ? evt.payload.saleId : "";
  if (!saleId) return;
  const rows = await prisma.posPayment.findMany({
    where: { tenantId: evt.tenantId, saleId, type: { in: ["GIFT_CARD", "STORE_CREDIT"] }, giftCardTxnId: { not: null } },
    select: { giftCardTxnId: true, sale: { select: { status: true, docType: true } } },
  });
  const txnIds = rows.filter((r) => r.sale.status === "VOIDED" && r.sale.docType === "SALE").map((r) => r.giftCardTxnId!);
  if (!txnIds.length) return;
  const member = await import("@/lib/modules/member");
  await member.refundGiftCardTender(evt.tenantId, { txnIds });
}

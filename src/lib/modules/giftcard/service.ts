// service.ts — บัตรกำนัล (Gift Card) · M2.6
// สัญญา: ledger/MEMBER-RUN.md §2 M2.6 · พิมพ์เขียว docs/modules/06-member-v2.md §4.2 §4.3 §5.7 §9.1 §9.4 §11.6
//
// ── หลักคิดของโมดูลนี้ ────────────────────────────────────────────────────────────────
// 1) **ขายบัตรกำนัลไม่ใช่รายได้** — เป็นเงินรับล่วงหน้า (หนี้สิน 2110) จนกว่าลูกค้าจะเอาบัตรมาใช้
//    ⇒ บิล POS ของการขายบัตรถูก "ปักธง" ด้วย `PosSale.giftCardId` แล้ว consumer `pos.sale.paid`
//      จะข้ามบิลนั้นทั้งใบ (ไม่ลงบัญชีขาย · ไม่ให้แต้ม) — โมดูลนี้ลงบัญชีเองผ่าน facade บัญชี
// 2) **สวิตช์ผูกบัญชี (D3) มีผลไปข้างหน้าเท่านั้น** (§11.6) — บัตรที่ขายตอนสวิตช์ปิดจะไม่มี
//    `accountingDocId` ตลอดไป ⇒ ตอนใช้/หมดอายุก็ไม่ลงบัญชี (ไม่งั้นงบจะมีขา Cr 2110 ที่ไม่เคยมีขา Dr)
// 3) **PIN ไม่เคยถูกเก็บดิบ** — เก็บ sha256(`<number>:<pin>`) · ผิด 5 ครั้งระงับ 15 นาที (§11.6)
//    การนับครั้งที่ผิดเขียน **นอก transaction ของรายการ** โดยตั้งใจ: ถ้าเขียนใน tx เดียวกัน การ throw
//    จะ rollback ตัวนับทิ้ง ⇒ เดา PIN ได้ไม่จำกัดครั้ง (ด่านที่ดูเหมือนมีแต่ไม่ทำงาน)
// 4) เงินทุกช่อง = **สตางค์ (Int)** · ทุกทางเข้ามี idempotencyKey (ยิงซ้ำ/retry ไม่เบิ้ล)
//
// 🔴 import ข้ามโมดูลผ่าน **facade เท่านั้น** (fitness F2): `@/lib/modules/pos` · `@/lib/modules/account`
//    · `@/lib/modules/member` — ห้ามล้วง service/gl ของโมดูลอื่นตรง ๆ

import type { Prisma, PosPayType, GiftCard as GiftCardRow, GiftCardStatus } from "@prisma/client";
import { randomCode, safeEqualHex, sha256 } from "@/lib/core/hash";
import { emitOutbox } from "@/lib/core/outbox";
import * as account from "@/lib/modules/account";
import * as pos from "@/lib/modules/pos";
import { hasMemberPerm, memberRefs, type MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import {
  GiftCardForbiddenError,
  GiftCardInputError,
  GiftCardNotFoundError,
  GiftCardStateError,
} from "./errors";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

/** ctx ของโมดูล — `posSystemId` = ระบบ POS ที่รับเงิน (ไม่มี = ขาย/เติมเงินไม่ได้ แต่ยังดูยอด/ใช้บัตรได้) */
export type GiftCardCtx = {
  tenantId: string;
  systemId: string; // AppSystem.id ของระบบสมาชิก
  posSystemId?: string | null;
  actorUserId?: string | null;
};

// ───────────────────────── ค่าคงที่ของกติกา (§11.6) ─────────────────────────

/** หมดอายุขั้นต่ำตามกฎหมาย — ร้านตั้งสั้นกว่านี้ไม่ได้ */
export const GIFTCARD_MIN_EXPIRY_MONTHS = 12;
/** ใส่ PIN ผิดกี่ครั้งจึงระงับ */
export const GIFTCARD_PIN_MAX_FAIL = 5;
/** ระงับนานกี่นาทีเมื่อ PIN ผิดครบ */
export const GIFTCARD_PIN_LOCK_MINUTES = 15;

const DIGITS = "0123456789";

export const GIFTCARD_SETTINGS_DEFAULT = Object.freeze({
  enabled: false,
  accountingLink: false,
  expiryMonths: 24,
  denominations: [100_000, 200_000, 500_000] as number[],
  transferable: true,
  reloadable: true,
});

export type GiftCardSettingsDto = {
  enabled: boolean;
  accountingLink: boolean;
  expiryMonths: number;
  denominations: number[];
  transferable: boolean;
  reloadable: boolean;
};

// ───────────────────────── ตัวช่วยพื้นฐาน ─────────────────────────

async function withTx<T>(tx: Tx | undefined, fn: (db: Db) => Promise<T>): Promise<T> {
  if (tx) return fn(tx);
  return prisma.$transaction((inner) => fn(inner), { timeout: 30_000, maxWait: 15_000 });
}

/** จำนวนเต็มสตางค์ที่มากกว่า 0 — ไม่ใช่ = โยนข้อความไทยบอกช่องที่ผิด */
function positiveSatang(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    throw new GiftCardInputError(`${label}ต้องเป็นจำนวนเงินที่มากกว่า 0 บาท — ใส่ยอดใหม่แล้วลองอีกครั้ง`);
  }
  return n;
}

/** บวกเดือนแบบไม่ข้ามเดือน (31 ม.ค. + 1 เดือน = 28/29 ก.พ. ไม่ใช่ 2/3 มี.ค.) */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** ต้นเดือนปัจจุบันตามเวลาไทย (KPI "เดือนนี้" ต้องตรงกับปฏิทินที่เจ้าของร้านดู ไม่ใช่ UTC) */
export function thaiMonthStart(now: Date = new Date()): Date {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${s.slice(0, 7)}-01T00:00:00.000+07:00`);
}

/** หมายเลขบัตรแบบปิดบัง — ตาราง/รายงานเห็นได้ แต่เอาไปใช้แทนบัตรจริงไม่ได้ */
export function maskNumber(number: string): string {
  return `GC-****${number.slice(-4)}`;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ช่องทางเงินของ POS → ช่องทางที่ facade บัญชีเข้าใจ (โมดูลนี้ไม่รู้เลขบัญชี) */
function accountChannel(type: PosPayType): "CASH" | "TRANSFER" | "PROMPTPAY" | "DEPOSIT" | "ROOM_CHARGE" {
  switch (type) {
    case "CASH":
      return "CASH";
    case "PROMPTPAY":
      return "PROMPTPAY";
    case "DEPOSIT":
      return "DEPOSIT";
    case "ROOM_CHARGE":
      return "ROOM_CHARGE";
    default:
      return "TRANSFER";
  }
}

// ───────────────────────── สิทธิ์ (§6.1) ─────────────────────────
//
// ขาย/ใช้/เติมเงิน = `member.giftcard.sell` (พนักงานหน้าร้านทำได้เมื่อได้รับมอบสิทธิ์)
// ตั้งค่า/ระงับ/โอนแทนลูกค้า = `member.giftcard.manage` — **MANAGER ไม่ได้โดยปริยาย** (1 ใน 4 คีย์ยกเว้น)

function assertSell(actor: MemberActor): void {
  if (!hasMemberPerm(actor, "member.giftcard.sell")) {
    throw new GiftCardForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ขาย/ใช้บัตรกำนัล — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

function assertManage(actor: MemberActor): void {
  if (!hasMemberPerm(actor, "member.giftcard.manage")) {
    throw new GiftCardForbiddenError("งานนี้ต้องมีสิทธิ์ดูแลบัตรกำนัล — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

// ───────────────────────── ตั้งค่า ─────────────────────────

export async function getSettings(ctx: GiftCardCtx): Promise<GiftCardSettingsDto> {
  const row = await prisma.giftCardSettings.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
  });
  if (!row) return { ...GIFTCARD_SETTINGS_DEFAULT, denominations: [...GIFTCARD_SETTINGS_DEFAULT.denominations] };
  return {
    enabled: row.enabled,
    accountingLink: row.accountingLink,
    expiryMonths: row.expiryMonths,
    denominations: [...row.denominations],
    transferable: row.transferable,
    reloadable: row.reloadable,
  };
}

export async function setSettings(
  ctx: GiftCardCtx,
  actor: MemberActor,
  patch: Partial<GiftCardSettingsDto>,
): Promise<GiftCardSettingsDto> {
  assertManage(actor);
  const current = await getSettings(ctx);
  const next: GiftCardSettingsDto = { ...current, ...patch, denominations: [...(patch.denominations ?? current.denominations)] };

  if (!Number.isInteger(next.expiryMonths) || next.expiryMonths < GIFTCARD_MIN_EXPIRY_MONTHS) {
    throw new GiftCardInputError(
      `อายุบัตรกำนัลต้องไม่ต่ำกว่า ${GIFTCARD_MIN_EXPIRY_MONTHS} เดือน (ขั้นต่ำตามกฎหมาย) — ตั้งค่าใหม่อีกครั้ง`,
    );
  }
  if (!Array.isArray(next.denominations) || next.denominations.some((d) => !Number.isInteger(d) || d <= 0)) {
    throw new GiftCardInputError("มูลค่าบัตรที่ตั้งไว้ต้องเป็นจำนวนเงินที่มากกว่า 0 บาททุกช่อง — แก้ค่าที่ผิดแล้วบันทึกใหม่");
  }

  const data = {
    enabled: next.enabled,
    accountingLink: next.accountingLink,
    expiryMonths: next.expiryMonths,
    denominations: next.denominations,
    transferable: next.transferable,
    reloadable: next.reloadable,
  };
  await prisma.giftCardSettings.upsert({
    where: { systemId: ctx.systemId },
    create: { tenantId: ctx.tenantId, systemId: ctx.systemId, ...data },
    update: data,
  });
  return next;
}

// ───────────────────────── ตัวช่วยของตัวบัตร ─────────────────────────

async function loadByNumber(ctx: GiftCardCtx, number: unknown): Promise<GiftCardRow> {
  const n = String(number ?? "").trim().toUpperCase();
  if (!n) throw new GiftCardInputError("ยังไม่ได้ใส่หมายเลขบัตร — พิมพ์หมายเลขบนหน้าบัตรแล้วลองใหม่");
  const card = await prisma.giftCard.findFirst({ where: { tenantId: ctx.tenantId, number: n } });
  if (!card) throw new GiftCardNotFoundError();
  return card;
}

/** หมายเลขใหม่ที่ยังไม่ซ้ำในร้านนี้ — `GC-` + 8 หลักสุ่มจาก crypto (ห้าม Math.random กับรหัสที่ใช้ยืนยันสิทธิ์) */
async function nextNumber(tenantId: string): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const number = `GC-${randomCode(8, DIGITS)}`;
    const dup = await prisma.giftCard.findUnique({
      where: { tenantId_number: { tenantId, number } },
      select: { id: true },
    });
    if (!dup) return number;
  }
  throw new GiftCardStateError("ออกหมายเลขบัตรใหม่ไม่สำเร็จในตอนนี้ — ลองกดขายอีกครั้ง");
}

/**
 * ตรวจ PIN + นับครั้งที่ผิด (§11.6)
 * 🔴 เขียนตัวนับด้วย `prisma` (นอก transaction ของรายการ) โดยตั้งใจ — ดูหมายเหตุข้อ 3 ที่หัวไฟล์
 */
async function verifyPin(card: GiftCardRow, pin: unknown): Promise<void> {
  const now = Date.now();
  if (card.pinLockedUntil && card.pinLockedUntil.getTime() > now) {
    throw new GiftCardStateError(
      `บัตรใบนี้ถูกระงับชั่วคราวเพราะใส่ PIN ผิดหลายครั้ง — รออีกสักครู่ (ระงับครั้งละ ${GIFTCARD_PIN_LOCK_MINUTES} นาที) แล้วลองใหม่`,
    );
  }
  const given = String(pin ?? "");
  if (given && safeEqualHex(card.pinHash, sha256(`${card.number}:${given}`))) {
    if (card.pinFailedCount !== 0 || card.pinLockedUntil) {
      await prisma.giftCard.update({ where: { id: card.id }, data: { pinFailedCount: 0, pinLockedUntil: null } });
    }
    return;
  }
  const failed = card.pinFailedCount + 1;
  const lock = failed >= GIFTCARD_PIN_MAX_FAIL;
  await prisma.giftCard.update({
    where: { id: card.id },
    data: {
      pinFailedCount: failed,
      pinLockedUntil: lock ? new Date(now + GIFTCARD_PIN_LOCK_MINUTES * 60_000) : null,
    },
  });
  if (lock) {
    throw new GiftCardStateError(
      `ใส่ PIN ผิดครบ ${GIFTCARD_PIN_MAX_FAIL} ครั้ง — ระงับการใช้บัตรใบนี้ ${GIFTCARD_PIN_LOCK_MINUTES} นาที แล้วลองใหม่อีกครั้ง`,
    );
  }
  throw new GiftCardInputError(
    `PIN ไม่ถูกต้อง — เหลืออีก ${GIFTCARD_PIN_MAX_FAIL - failed} ครั้งก่อนบัตรจะถูกระงับ ${GIFTCARD_PIN_LOCK_MINUTES} นาที`,
  );
}

/** บัตรใบนี้พร้อมตัดยอดไหม (สถานะ + วันหมดอายุ) */
function assertUsable(card: GiftCardRow, now: Date = new Date()): void {
  if (card.status === "SUSPENDED") {
    throw new GiftCardStateError("บัตรใบนี้ถูกระงับอยู่ — ติดต่อผู้จัดการร้านให้ปลดระงับก่อนใช้");
  }
  if (card.status === "EXPIRED") {
    throw new GiftCardStateError("บัตรใบนี้หมดอายุแล้ว — ออกบัตรใบใหม่ให้ลูกค้าแทน");
  }
  if (card.status === "DEPLETED") {
    throw new GiftCardStateError("ยอดในบัตรใบนี้ถูกใช้หมดแล้ว — เติมเงินเข้าบัตรก่อนจึงจะใช้ต่อได้");
  }
  if (card.expiresAt && card.expiresAt.getTime() <= now.getTime()) {
    throw new GiftCardStateError("บัตรใบนี้หมดอายุแล้ว — ออกบัตรใบใหม่ให้ลูกค้าแทน");
  }
}

/** สมาชิกของระบบนี้จริงไหม (ผ่าน facade member) — ไม่ใช่ = ข้อความไทยบอกให้สมัครก่อน */
async function assertMember(ctx: GiftCardCtx, customerId: string, label: string): Promise<void> {
  const refs = await memberRefs({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null }, [customerId]);
  if (refs.length === 0) {
    throw new GiftCardInputError(`${label}ยังไม่ได้เป็นสมาชิกของร้านนี้ — สมัครสมาชิกให้ก่อนแล้วทำรายการใหม่`);
  }
}

/** ระบบ POS ที่รับเงินของบัตรใบนี้ (ใช้ตอนลงบัญชี) — ctx ก่อน แล้วค่อยย้อนจากบิลที่ขายบัตร */
async function posSystemIdOf(ctx: GiftCardCtx | null, card: { saleId: string | null }): Promise<string | null> {
  if (ctx?.posSystemId) return ctx.posSystemId;
  if (!card.saleId) return null;
  const sale = await prisma.posSale.findUnique({ where: { id: card.saleId }, select: { systemId: true } });
  return sale?.systemId ?? null;
}

// ───────────────────────── ขาย ─────────────────────────

export type SellRecipient =
  | { customerId: string }
  | { contact: { name?: string | null; line?: string | null; email?: string | null } }
  | { print: true };

export type SellInput = {
  satang: number;
  buyerCustomerId?: string | null;
  recipient: SellRecipient;
  message?: string | null;
  expiresAt?: Date | string | null;
  payMethods: { type: PosPayType; amountSatang: number }[];
  unitId: string;
  idempotencyKey: string;
};

export type SellResult = {
  giftCardId: string;
  number: string;
  /** 🔴 คืน **ครั้งเดียว** ตอนขายสำเร็จ — ยิงซ้ำด้วยคีย์เดิมได้ `null` (ระบบไม่เก็บ PIN ดิบไว้ที่ไหนเลย) */
  pin: string | null;
  saleId: string;
  expiresAt: Date | null;
  accountingDocId: string | null;
};

export async function sell(ctx: GiftCardCtx, actor: MemberActor, input: SellInput): Promise<SellResult> {
  assertSell(actor);
  const idem = String(input.idempotencyKey ?? "").trim();
  if (!idem) throw new GiftCardInputError("รายการนี้ไม่มีรหัสกันซ้ำ — รีเฟรชหน้าแล้วกดขายใหม่อีกครั้ง");
  const key = `giftcard-sell-${idem}`;

  // ยิงซ้ำด้วยคีย์เดิม → คืนบัตรใบเดิม (ไม่มีบัตร/บิลใบที่สอง · ไม่คืน PIN ซ้ำ)
  const done = await prisma.giftCardTxn.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: key } },
    include: { giftCard: true },
  });
  if (done) {
    return {
      giftCardId: done.giftCardId,
      number: done.giftCard.number,
      pin: null,
      saleId: done.giftCard.saleId ?? "",
      expiresAt: done.giftCard.expiresAt,
      accountingDocId: done.giftCard.accountingDocId,
    };
  }

  const settings = await getSettings(ctx);
  if (!settings.enabled) {
    throw new GiftCardStateError("ร้านยังไม่ได้เปิดใช้บัตรกำนัล — เปิดที่หน้าตั้งค่าบัตรกำนัลก่อนจึงจะขายได้");
  }
  if (!ctx.posSystemId) {
    throw new GiftCardStateError("ยังไม่ได้ผูกระบบขายหน้าร้าน (POS) กับระบบสมาชิก — ผูกก่อนจึงจะรับเงินค่าบัตรได้");
  }

  const satang = positiveSatang(input.satang, "มูลค่าบัตร");
  const payMethods = input.payMethods ?? [];
  const paid = payMethods.reduce((n, p) => n + (Number(p.amountSatang) || 0), 0);
  if (paid !== satang) {
    throw new GiftCardInputError(
      `ยอดที่รับชำระ (${(paid / 100).toLocaleString("th-TH")} บาท) ไม่เท่ากับมูลค่าบัตร (${(satang / 100).toLocaleString("th-TH")} บาท) — แก้ยอดให้ตรงกันก่อน`,
    );
  }

  // อายุบัตร: ไม่ระบุ = ตามที่ร้านตั้ง · ระบุเองต้องไม่สั้นกว่านั้น (กติกาขั้นต่ำตามกฎหมาย §11.6)
  const now = new Date();
  const minExpiry = addMonths(now, settings.expiryMonths);
  const wanted = toDate(input.expiresAt);
  if (wanted && wanted.getTime() < minExpiry.getTime()) {
    throw new GiftCardInputError(
      `วันหมดอายุที่เลือกสั้นกว่าอายุขั้นต่ำที่ร้านตั้งไว้ (${settings.expiryMonths} เดือน) — เลือกวันใหม่หรือแก้ที่หน้าตั้งค่า`,
    );
  }
  const expiresAt = wanted ?? minExpiry;

  const buyerCustomerId = input.buyerCustomerId ? String(input.buyerCustomerId) : null;
  if (buyerCustomerId) await assertMember(ctx, buyerCustomerId, "ผู้ซื้อที่เลือก");

  const recipient = input.recipient ?? ({ print: true } as SellRecipient);
  let ownerCustomerId: string | null = buyerCustomerId;
  let recipientContact: Prisma.InputJsonValue | undefined;
  if ("customerId" in recipient && recipient.customerId) {
    await assertMember(ctx, recipient.customerId, "ผู้รับที่เลือก");
    ownerCustomerId = recipient.customerId;
  } else if ("contact" in recipient && recipient.contact) {
    // ผู้รับยังไม่ใช่สมาชิก (ส่งทาง LINE/อีเมล) → บัตรยังไม่มีเจ้าของในระบบ จนกว่าจะโอนให้
    ownerCustomerId = null;
    recipientContact = {
      name: recipient.contact.name ?? null,
      line: recipient.contact.line ?? null,
      email: recipient.contact.email ?? null,
    } as Prisma.InputJsonValue;
  }

  const number = await nextNumber(ctx.tenantId);
  const pin = randomCode(6, DIGITS);
  const posSystemId = ctx.posSystemId;

  // 🔴 บิล POS + ตัวบัตร + ธง `PosSale.giftCardId` ต้องอยู่ใน transaction เดียวกัน
  //    ไม่งั้น event `pos.sale.paid` อาจถูกระบายก่อนที่ธงจะถูกตั้ง ⇒ บัญชีบันทึก "ขายสินค้า" ให้บิล
  //    ขายบัตรไปแล้ว (รายได้เกิดสองรอบ: ตอนขายบัตร + ตอนใช้บัตร)
  const created = await prisma.$transaction(
    async (tx) => {
      const sale = await pos.createSale(
        {
          tenantId: ctx.tenantId,
          unitId: input.unitId,
          systemId: posSystemId,
          // 🔴 ไม่ส่ง memberId/pointSystemId โดยตั้งใจ — ซื้อบัตรกำนัลไม่ให้แต้ม (§9.1)
          sourceModule: "MEMBER",
          sourceId: idem,
          idempotencyKey: key,
          lines: [{ name: `Gift Card ${number}`, qty: 1, unitPriceSatang: satang }],
          payMethods: payMethods.map((p) => ({ type: p.type, amountSatang: p.amountSatang })),
        },
        tx,
      );

      const card = await tx.giftCard.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          number,
          pinHash: sha256(`${number}:${pin}`),
          initialSatang: satang,
          balanceSatang: satang,
          buyerCustomerId,
          ownerCustomerId,
          ...(recipientContact !== undefined ? { recipientContact } : {}),
          message: input.message ? String(input.message) : null,
          status: "ACTIVE",
          expiresAt,
          saleId: sale.saleId,
        },
      });
      await tx.posSale.update({ where: { id: sale.saleId }, data: { giftCardId: card.id } });
      await tx.giftCardTxn.create({
        data: {
          tenantId: ctx.tenantId,
          giftCardId: card.id,
          type: "SELL",
          satang,
          balanceAfter: satang,
          refType: "PosSale",
          refId: sale.saleId,
          byUserId: ctx.actorUserId ?? actor.userId ?? null,
          idempotencyKey: key,
        },
      });
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        type: "giftcard.sold",
        idempotencyKey: `giftcard.sold#${card.id}`,
        payload: {
          giftCardId: card.id,
          number,
          satang,
          buyerCustomerId,
          ownerCustomerId,
          saleId: sale.saleId,
        },
        systemId: ctx.systemId,
        unitId: input.unitId,
      });
      return { card, saleId: sale.saleId };
    },
    { timeout: 30_000, maxWait: 15_000 },
  );

  // ── บัญชี (D3) — เปิดสวิตช์ + ร้านเชื่อมบัญชีกับ POS แล้วเท่านั้น ──
  let accountingDocId: string | null = null;
  if (settings.accountingLink) {
    const posted = await account.postGiftCardSale({
      tenantId: ctx.tenantId,
      sourceSystemId: posSystemId,
      refType: "GiftCard",
      refId: created.card.id,
      occurredAt: now,
      satang,
      payMethods: payMethods.map((p) => ({ channel: accountChannel(p.type), amountSatang: p.amountSatang })),
    });
    if (posted.entryId) {
      accountingDocId = posted.entryId;
      await prisma.giftCard.update({ where: { id: created.card.id }, data: { accountingDocId } });
    }
  }

  return { giftCardId: created.card.id, number, pin, saleId: created.saleId, expiresAt, accountingDocId };
}

// ───────────────────────── ดูยอด ─────────────────────────

export type BalanceDto = {
  balanceSatang: number;
  expiresAt: Date | null;
  status: GiftCardStatus;
  ownerCustomerId: string | null;
};

/**
 * ยอดคงเหลือของบัตร — **ไม่ต้องใช้ PIN** (พนักงานต้องบอกลูกค้าได้ว่าเหลือเท่าไหร่โดยไม่ต้องขอรหัส)
 * ลูกค้าที่ล็อกอินเอง (`role: "CUSTOMER"`) ดูได้เฉพาะบัตรที่ตัวเองเป็นเจ้าของ
 */
export async function balance(
  ctx: GiftCardCtx,
  input: { number: string },
  actor?: MemberActor,
): Promise<BalanceDto | null> {
  const n = String(input?.number ?? "").trim().toUpperCase();
  if (!n) return null;
  const card = await prisma.giftCard.findFirst({ where: { tenantId: ctx.tenantId, number: n } });
  if (!card) return null;
  if (actor?.role === "CUSTOMER" && card.ownerCustomerId !== (actor.customerId ?? null)) {
    throw new GiftCardForbiddenError("บัตรใบนี้ไม่ได้อยู่ในชื่อของคุณ — ตรวจหมายเลขบนบัตรอีกครั้ง");
  }
  return {
    balanceSatang: card.balanceSatang,
    expiresAt: card.expiresAt,
    status: card.status,
    ownerCustomerId: card.ownerCustomerId,
  };
}

// ───────────────────────── ใช้บัตร ─────────────────────────

export type UseInput = {
  number: string;
  pin: string;
  satang: number;
  saleId: string;
  idempotencyKey: string;
};

export type UseResult = { txnId: string; balanceAfter: number };

/**
 * ตัดยอดจากบัตร (POS/จอง/ออนไลน์เรียกตัวนี้)
 * `tx` = ให้ตัดยอดอยู่ใน transaction ของบิลผู้เรียก (บิล rollback = ยอดบัตรกลับมาเอง)
 */
export async function use(ctx: GiftCardCtx, input: UseInput, tx?: Tx): Promise<UseResult> {
  const idem = String(input.idempotencyKey ?? "").trim();
  if (!idem) throw new GiftCardInputError("รายการนี้ไม่มีรหัสกันซ้ำ — เริ่มรายการใหม่อีกครั้ง");
  const key = `giftcard-use-${idem}`;
  const done = await prisma.giftCardTxn.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: key } },
  });
  if (done) return { txnId: done.id, balanceAfter: done.balanceAfter };

  const now = new Date();
  const card = await loadByNumber(ctx, input.number);
  assertUsable(card, now);
  await verifyPin(card, input.pin);

  const satang = positiveSatang(input.satang, "ยอดที่ตัดจากบัตร");
  if (satang > card.balanceSatang) {
    throw new GiftCardStateError(
      `ยอดในบัตรเหลือ ${(card.balanceSatang / 100).toLocaleString("th-TH")} บาท ไม่พอสำหรับยอด ${(satang / 100).toLocaleString("th-TH")} บาท — ตัดเท่าที่เหลือแล้วรับส่วนต่างด้วยวิธีอื่น`,
    );
  }

  const settings = await getSettings(ctx);
  const posSystemId = await posSystemIdOf(ctx, card);

  const res = await withTx(tx, async (db) => {
    // 🔴 ตัดยอดด้วยคำสั่งเดียว + เงื่อนไข `gte` — สองเครื่อง POS ตัดพร้อมกันไม่ทำให้ยอดติดลบ
    const upd = await db.giftCard.updateMany({
      where: { id: card.id, status: "ACTIVE", balanceSatang: { gte: satang } },
      data: { balanceSatang: { decrement: satang } },
    });
    if (upd.count === 0) {
      throw new GiftCardStateError("ยอดในบัตรถูกใช้ไปก่อนหน้านี้แล้ว — ตรวจยอดคงเหลือแล้วทำรายการใหม่");
    }
    const after = card.balanceSatang - satang;
    if (after === 0) await db.giftCard.update({ where: { id: card.id }, data: { status: "DEPLETED" } });

    const txn = await db.giftCardTxn.create({
      data: {
        tenantId: ctx.tenantId,
        giftCardId: card.id,
        type: "USE",
        satang,
        balanceAfter: after,
        refType: "PosSale",
        refId: input.saleId ?? null,
        byUserId: ctx.actorUserId ?? null,
        idempotencyKey: key,
      },
    });
    await emitOutbox(db as Tx, {
      tenantId: ctx.tenantId,
      type: "giftcard.used",
      idempotencyKey: `giftcard.used#${txn.id}`,
      payload: {
        giftCardId: card.id,
        number: card.number,
        satang,
        saleId: input.saleId ?? null,
        balanceAfter: after,
        ownerCustomerId: card.ownerCustomerId,
      },
      systemId: ctx.systemId,
    });
    return { txnId: txn.id, balanceAfter: after };
  });

  // บัญชี: รับรู้รายได้ตอน "ใช้" — เฉพาะบัตรที่ **ขายตอนสวิตช์เปิด** (มี accountingDocId) และสวิตช์ยังเปิดอยู่
  if (settings.accountingLink && card.accountingDocId && posSystemId) {
    await account.postGiftCardUse(
      {
        tenantId: ctx.tenantId,
        sourceSystemId: posSystemId,
        refId: res.txnId,
        occurredAt: now,
        satang,
      },
      tx,
    );
  }
  return res;
}

// ───────────────────────── เติมเงิน ─────────────────────────

export type ReloadInput = {
  number: string;
  satang: number;
  payMethods: { type: PosPayType; amountSatang: number }[];
  unitId: string;
  idempotencyKey: string;
};

export async function reload(
  ctx: GiftCardCtx,
  actor: MemberActor,
  input: ReloadInput,
): Promise<{ txnId: string; saleId: string; balanceAfter: number }> {
  assertSell(actor);
  const idem = String(input.idempotencyKey ?? "").trim();
  if (!idem) throw new GiftCardInputError("รายการนี้ไม่มีรหัสกันซ้ำ — เริ่มรายการใหม่อีกครั้ง");
  const key = `giftcard-reload-${idem}`;
  const done = await prisma.giftCardTxn.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: key } },
  });
  if (done) return { txnId: done.id, saleId: done.refId ?? "", balanceAfter: done.balanceAfter };

  const settings = await getSettings(ctx);
  if (!settings.reloadable) {
    throw new GiftCardStateError("ร้านปิดการเติมเงินเข้าบัตรกำนัลไว้ — เปิดที่หน้าตั้งค่าบัตรกำนัลก่อน");
  }
  if (!ctx.posSystemId) {
    throw new GiftCardStateError("ยังไม่ได้ผูกระบบขายหน้าร้าน (POS) กับระบบสมาชิก — ผูกก่อนจึงจะรับเงินเติมบัตรได้");
  }
  const card = await loadByNumber(ctx, input.number);
  if (card.status === "SUSPENDED") {
    throw new GiftCardStateError("บัตรใบนี้ถูกระงับอยู่ — ปลดระงับก่อนจึงจะเติมเงินได้");
  }
  if (card.status === "EXPIRED") {
    throw new GiftCardStateError("บัตรใบนี้หมดอายุแล้ว — ออกบัตรใบใหม่ให้ลูกค้าแทนการเติมเงิน");
  }

  const satang = positiveSatang(input.satang, "ยอดที่เติมเข้าบัตร");
  const payMethods = input.payMethods ?? [];
  const paid = payMethods.reduce((n, p) => n + (Number(p.amountSatang) || 0), 0);
  if (paid !== satang) {
    throw new GiftCardInputError(
      `ยอดที่รับชำระ (${(paid / 100).toLocaleString("th-TH")} บาท) ไม่เท่ากับยอดที่เติม (${(satang / 100).toLocaleString("th-TH")} บาท) — แก้ยอดให้ตรงกันก่อน`,
    );
  }
  const now = new Date();
  const posSystemId = ctx.posSystemId;

  const res = await prisma.$transaction(
    async (tx) => {
      const sale = await pos.createSale(
        {
          tenantId: ctx.tenantId,
          unitId: input.unitId,
          systemId: posSystemId,
          sourceModule: "MEMBER",
          sourceId: idem,
          idempotencyKey: key,
          lines: [{ name: `Gift Card ${card.number} (เติมเงิน)`, qty: 1, unitPriceSatang: satang }],
          payMethods: payMethods.map((p) => ({ type: p.type, amountSatang: p.amountSatang })),
        },
        tx,
      );
      await tx.posSale.update({ where: { id: sale.saleId }, data: { giftCardId: card.id } });
      const after = card.balanceSatang + satang;
      await tx.giftCard.update({
        where: { id: card.id },
        data: { balanceSatang: { increment: satang }, status: "ACTIVE" },
      });
      const txn = await tx.giftCardTxn.create({
        data: {
          tenantId: ctx.tenantId,
          giftCardId: card.id,
          type: "RELOAD",
          satang,
          balanceAfter: after,
          refType: "PosSale",
          refId: sale.saleId,
          byUserId: ctx.actorUserId ?? actor.userId ?? null,
          idempotencyKey: key,
        },
      });
      return { txnId: txn.id, saleId: sale.saleId, balanceAfter: after };
    },
    { timeout: 30_000, maxWait: 15_000 },
  );

  if (settings.accountingLink && card.accountingDocId) {
    await account.postGiftCardSale({
      tenantId: ctx.tenantId,
      sourceSystemId: posSystemId,
      refType: "GiftCardTxn",
      refId: res.txnId,
      occurredAt: now,
      satang,
      payMethods: payMethods.map((p) => ({ channel: accountChannel(p.type), amountSatang: p.amountSatang })),
    });
  }
  return res;
}

// ───────────────────────── โอนเจ้าของ ─────────────────────────

export async function transfer(
  ctx: GiftCardCtx,
  actor: MemberActor,
  input: { number: string; pin: string; toCustomerId: string },
): Promise<{ ok: true; ownerCustomerId: string }> {
  const settings = await getSettings(ctx);
  if (!settings.transferable) {
    throw new GiftCardStateError("ร้านปิดการโอนเจ้าของบัตรกำนัลไว้ — เปิดที่หน้าตั้งค่าบัตรกำนัลก่อน");
  }
  const card = await loadByNumber(ctx, input.number);

  // ลูกค้าโอนบัตรของตัวเองได้ · พนักงานโอนแทนต้องมีสิทธิ์ดูแลบัตรกำนัล
  if (actor.role === "CUSTOMER") {
    if (!actor.customerId || card.ownerCustomerId !== actor.customerId) {
      throw new GiftCardForbiddenError("บัตรใบนี้ไม่ได้อยู่ในชื่อของคุณ จึงโอนให้คนอื่นไม่ได้");
    }
  } else {
    assertManage(actor);
  }

  assertUsable(card);
  await verifyPin(card, input.pin);

  const to = String(input.toCustomerId ?? "");
  if (!to) throw new GiftCardInputError("ยังไม่ได้เลือกผู้รับโอน — ค้นหาสมาชิกที่จะรับบัตรก่อน");
  if (to === card.ownerCustomerId) {
    throw new GiftCardInputError("บัตรใบนี้อยู่ในชื่อของคนนี้อยู่แล้ว — เลือกผู้รับคนอื่น");
  }
  await assertMember(ctx, to, "ผู้รับโอนที่เลือก");

  await prisma.$transaction(async (tx) => {
    await tx.giftCard.update({ where: { id: card.id }, data: { ownerCustomerId: to } });
    await tx.giftCardTxn.create({
      data: {
        tenantId: ctx.tenantId,
        giftCardId: card.id,
        type: "TRANSFER",
        satang: 0,
        balanceAfter: card.balanceSatang,
        refType: "Customer",
        refId: to,
        byUserId: ctx.actorUserId ?? actor.userId ?? null,
        idempotencyKey: `giftcard-transfer-${card.id}-${to}-${Date.now()}`,
      },
    });
  });
  return { ok: true, ownerCustomerId: to };
}

// ───────────────────────── ระงับ / ปลดระงับ ─────────────────────────

export async function suspend(
  ctx: GiftCardCtx,
  actor: MemberActor,
  input: { number: string; reason?: string | null },
): Promise<{ ok: true }> {
  assertManage(actor);
  const card = await loadByNumber(ctx, input.number);
  if (card.status === "SUSPENDED") return { ok: true };
  await prisma.$transaction(async (tx) => {
    await tx.giftCard.update({ where: { id: card.id }, data: { status: "SUSPENDED" } });
    await tx.giftCardTxn.create({
      data: {
        tenantId: ctx.tenantId,
        giftCardId: card.id,
        type: "ADJUST",
        satang: 0,
        balanceAfter: card.balanceSatang,
        refType: "SUSPEND",
        refId: input.reason ? String(input.reason).slice(0, 200) : null,
        byUserId: ctx.actorUserId ?? actor.userId ?? null,
        idempotencyKey: `giftcard-suspend-${card.id}-${Date.now()}`,
      },
    });
  });
  return { ok: true };
}

export async function unsuspend(
  ctx: GiftCardCtx,
  actor: MemberActor,
  input: { number: string },
): Promise<{ ok: true; status: GiftCardStatus }> {
  assertManage(actor);
  const card = await loadByNumber(ctx, input.number);
  if (card.status !== "SUSPENDED") return { ok: true, status: card.status };
  // ปลดระงับแล้วกลับไปสถานะที่ "ควรจะเป็น" ตามยอดคงเหลือ (ยอด 0 = ใช้หมด ไม่ใช่พร้อมใช้)
  const status: GiftCardStatus = card.balanceSatang > 0 ? "ACTIVE" : "DEPLETED";
  await prisma.$transaction(async (tx) => {
    await tx.giftCard.update({ where: { id: card.id }, data: { status } });
    await tx.giftCardTxn.create({
      data: {
        tenantId: ctx.tenantId,
        giftCardId: card.id,
        type: "ADJUST",
        satang: 0,
        balanceAfter: card.balanceSatang,
        refType: "UNSUSPEND",
        byUserId: ctx.actorUserId ?? actor.userId ?? null,
        idempotencyKey: `giftcard-unsuspend-${card.id}-${Date.now()}`,
      },
    });
  });
  return { ok: true, status };
}

// ───────────────────────── คืนยอด (void บิลที่ใช้บัตร) ─────────────────────────

export async function refundUse(
  ctx: GiftCardCtx,
  input: { txnId: string },
): Promise<{ refunded: boolean; txnId?: string; balanceAfter?: number }> {
  const src = await prisma.giftCardTxn.findFirst({
    where: { id: String(input.txnId ?? ""), tenantId: ctx.tenantId },
    include: { giftCard: true },
  });
  if (!src) throw new GiftCardNotFoundError("ไม่พบรายการใช้บัตรที่จะคืนยอด — ตรวจเลขรายการอีกครั้ง");
  if (src.type !== "USE") {
    throw new GiftCardInputError("คืนยอดได้เฉพาะรายการที่ตัดยอดจากบัตร — รายการนี้เป็นรายการชนิดอื่น");
  }
  const key = `giftcard-refund-${src.id}`;
  const done = await prisma.giftCardTxn.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: key } },
  });
  if (done) return { refunded: false, txnId: done.id, balanceAfter: done.balanceAfter };

  const card = src.giftCard;
  const after = card.balanceSatang + src.satang;
  const res = await prisma.$transaction(async (tx) => {
    await tx.giftCard.update({
      where: { id: card.id },
      // บัตรที่ใช้จนหมด (DEPLETED) กลับมาใช้ได้เมื่อคืนยอด · บัตรที่ถูกระงับ/หมดอายุ คงสถานะเดิม
      data: {
        balanceSatang: { increment: src.satang },
        ...(card.status === "DEPLETED" ? { status: "ACTIVE" as GiftCardStatus } : {}),
      },
    });
    const txn = await tx.giftCardTxn.create({
      data: {
        tenantId: ctx.tenantId,
        giftCardId: card.id,
        type: "REFUND",
        satang: src.satang,
        balanceAfter: after,
        refType: "GiftCardTxn",
        refId: src.id,
        byUserId: ctx.actorUserId ?? null,
        idempotencyKey: key,
      },
    });
    return { txnId: txn.id, balanceAfter: after };
  });

  // บัญชี: กลับรายการ "รับรู้รายได้" ของการใช้ครั้งนั้น (ไม่มี JV = ไม่มีอะไรกลับ · เรียกซ้ำได้)
  if (card.accountingDocId) {
    const posSystemId = await posSystemIdOf(ctx, card);
    if (posSystemId) {
      await account.reverseGiftCardPosting({
        tenantId: ctx.tenantId,
        sourceSystemId: posSystemId,
        refType: "GiftCardTxn",
        refId: src.id,
        reason: "คืนยอดบัตรกำนัล (ยกเลิกบิล)",
      });
    }
  }
  return { refunded: true, ...res };
}

// ───────────────────────── หมดอายุ (cron รายวัน) ─────────────────────────

/**
 * บัตรที่ถึงวันหมดอายุแล้วทุกร้าน → EXPIRED (ยอดที่เหลือกลายเป็นรายได้อื่นเมื่อผูกบัญชีไว้)
 * idempotent: `updateMany` มีเงื่อนไข `status: ACTIVE` ⇒ รันซ้ำวันเดียวกันไม่ทำรายการซ้ำ
 */
export async function expireDue(now: Date = new Date()): Promise<{ expired: number }> {
  const due = await prisma.giftCard.findMany({
    where: { status: "ACTIVE", expiresAt: { not: null, lte: now } },
    orderBy: { expiresAt: "asc" },
    take: 1000,
  });
  let expired = 0;
  for (const card of due) {
    try {
      const settings = await getSettings({ tenantId: card.tenantId, systemId: card.systemId });
      const posSystemId = await posSystemIdOf(null, card);
      const leftover = card.balanceSatang;

      const txnId = await prisma.$transaction(async (tx) => {
        const upd = await tx.giftCard.updateMany({
          where: { id: card.id, status: "ACTIVE" },
          data: { status: "EXPIRED", balanceSatang: 0 },
        });
        if (upd.count === 0) return null; // มีคนกวาดไปก่อนแล้ว
        if (leftover <= 0) return "";
        const txn = await tx.giftCardTxn.create({
          data: {
            tenantId: card.tenantId,
            giftCardId: card.id,
            type: "EXPIRE",
            satang: leftover,
            balanceAfter: 0,
            refType: "GiftCard",
            refId: card.id,
            idempotencyKey: `giftcard-expire-${card.id}`,
          },
        });
        return txn.id;
      });
      if (txnId === null) continue;
      expired += 1;

      if (txnId && leftover > 0 && settings.accountingLink && card.accountingDocId && posSystemId) {
        await account.postGiftCardExpire({
          tenantId: card.tenantId,
          sourceSystemId: posSystemId,
          refId: txnId,
          occurredAt: now,
          satang: leftover,
        });
      }
    } catch {
      // บัตรใบเดียวพังต้องไม่ล้มทั้งรอบ (cron รายวัน — รอบพรุ่งนี้ได้ใหม่ · เงื่อนไข ACTIVE ยังคุมอยู่)
    }
  }
  return { expired };
}

// ───────────────────────── รายการ + KPI (หน้าจอ · ภาพ 20) ─────────────────────────

export type GiftCardRowDto = {
  id: string;
  number: string;
  numberMasked: string;
  buyerName: string;
  ownerName: string;
  initialSatang: number;
  balanceSatang: number;
  status: GiftCardStatus;
  expiresAt: Date | null;
  accountingDocId: string | null;
  createdAt: Date;
};

export type GiftCardKpi = {
  soldThisMonthSatang: number;
  soldThisMonthCount: number;
  outstandingSatang: number;
  usedThisMonthSatang: number;
};

export async function list(
  ctx: GiftCardCtx,
  input: { status?: GiftCardStatus | null; q?: string | null; take?: number } = {},
): Promise<{ rows: GiftCardRowDto[]; kpi: GiftCardKpi }> {
  const take = Math.min(Math.max(1, Number(input.take) || 50), 200);
  const q = String(input.q ?? "").trim();
  const where: Prisma.GiftCardWhereInput = {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    ...(input.status ? { status: input.status } : {}),
    ...(q ? { number: { contains: q.toUpperCase().replace(/^GC-/, ""), mode: "insensitive" as const } } : {}),
  };
  const cards = await prisma.giftCard.findMany({ where, orderBy: { createdAt: "desc" }, take });

  const ids = [
    ...new Set(cards.flatMap((c) => [c.buyerCustomerId, c.ownerCustomerId]).filter((x): x is string => !!x)),
  ];
  const refs = await memberRefs(
    { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null },
    ids,
  );
  const nameById = new Map(refs.map((r) => [r.id, r.name || r.memberCode]));
  const contactName = (c: (typeof cards)[number]): string => {
    const contact = (c.recipientContact ?? null) as { name?: unknown; line?: unknown; email?: unknown } | null;
    const v = [contact?.name, contact?.line, contact?.email].find((x) => typeof x === "string" && x);
    return typeof v === "string" ? v : "ไม่ระบุ (แจกพนักงาน)";
  };

  const monthStart = thaiMonthStart();
  const [sold, used, outstanding] = await Promise.all([
    prisma.giftCardTxn.aggregate({
      where: { tenantId: ctx.tenantId, type: "SELL", createdAt: { gte: monthStart }, giftCard: { systemId: ctx.systemId } },
      _sum: { satang: true },
      _count: { _all: true },
    }),
    prisma.giftCardTxn.aggregate({
      where: { tenantId: ctx.tenantId, type: "USE", createdAt: { gte: monthStart }, giftCard: { systemId: ctx.systemId } },
      _sum: { satang: true },
    }),
    prisma.giftCard.aggregate({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
      _sum: { balanceSatang: true },
    }),
  ]);

  return {
    rows: cards.map((c) => ({
      id: c.id,
      number: c.number,
      numberMasked: maskNumber(c.number),
      buyerName: c.buyerCustomerId ? (nameById.get(c.buyerCustomerId) ?? "ไม่ระบุ") : "ไม่ระบุ (ลูกค้าทั่วไป)",
      ownerName: c.ownerCustomerId ? (nameById.get(c.ownerCustomerId) ?? "ไม่ระบุ") : contactName(c),
      initialSatang: c.initialSatang,
      balanceSatang: c.balanceSatang,
      status: c.status,
      expiresAt: c.expiresAt,
      accountingDocId: c.accountingDocId,
      createdAt: c.createdAt,
    })),
    kpi: {
      soldThisMonthSatang: sold._sum.satang ?? 0,
      soldThisMonthCount: sold._count._all ?? 0,
      outstandingSatang: outstanding._sum.balanceSatang ?? 0,
      usedThisMonthSatang: used._sum.satang ?? 0,
    },
  };
}

// ───────────────────────── รวมสมาชิกซ้ำ (§11.1) ─────────────────────────

/** บัตรของคนที่ถูกรวม (ทั้งฐานะผู้ซื้อและเจ้าของ) → คนที่เก็บไว้ · เรียกจาก `member/profile.ts#mergeMembers` */
export async function mergeGiftCards(
  ctx: { tenantId: string; systemId: string },
  input: { keepId: string; mergeId: string },
  tx?: Tx,
): Promise<{ moved: number }> {
  const db: Db = tx ?? prisma;
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const asBuyer = await db.giftCard.updateMany({
    where: { ...scope, buyerCustomerId: input.mergeId },
    data: { buyerCustomerId: input.keepId },
  });
  const asOwner = await db.giftCard.updateMany({
    where: { ...scope, ownerCustomerId: input.mergeId },
    data: { ownerCustomerId: input.keepId },
  });
  return { moved: asBuyer.count + asOwner.count };
}

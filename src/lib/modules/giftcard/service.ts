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

import type { Prisma, PosPayType, GiftCard as GiftCardRow, GiftCardStatus, GiftCardKind } from "@prisma/client";
import { randomCode, safeEqualHex, sha256 } from "@/lib/core/hash";
import { emitOutbox } from "@/lib/core/outbox";
import { callerTx } from "@/lib/core/caller-tx"; // HF-TX ▸ createSale ในธุรกรรมของเรา (ซ่อน $transaction · ไม่มี savepoint ซ้อน) ◂
import * as account from "@/lib/modules/account";
import * as pos from "@/lib/modules/pos";
import { hasMemberPerm, memberRefs, type MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import {
  GiftCardForbiddenError,
  GiftCardInputError,
  GiftCardNotFoundError,
  GiftCardStateError,
  GiftCardTenderError, // POS P2.9 ◂
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
  // POS P2.9 ▸ fix1 F4 (มติ 7): เครดิตร้าน (SC-…) ไม่ใช่บัตรกำนัล — เติมเงิน/ระงับ/โอน/ใช้แบบเดิม = ไม่พบ ◂
  if (!card || card.kind === "STORE_CREDIT") throw new GiftCardNotFoundError();
  return card;
}

/**
 * HF-TX ▸ P2002 (unique ชน) ของธุรกรรมขาย/เติมบัตร — ใต้ `callerTx` createSale ไม่ลองใหม่เอง (แถวตัวนับใบเสร็จของเดือนใหม่ที่สองบิล upsert พร้อมกัน ·
 *   หมายเลขบัตรชน) ⇒ ทั้งธุรกรรม rollback แล้วผู้เรียกลองใหม่ ≤ 3 รอบ (คีย์กันซ้ำทำให้ปลอดภัย) ◂
 */
const SALE_TX_ATTEMPTS = 3;
function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === "P2002";
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
      // POS P2.9 ▸ fix1 H2: ล้างตัวนับเฉพาะเมื่อแถวปัจจุบันไม่ได้ถูกล็อก (คำขอผิดพร้อมกันอาจเพิ่งล็อก) · ล็อกอยู่ = ใช้ไม่ได้ ◂
      const n = await prisma.giftCard.updateMany({ where: { id: card.id, OR: [{ pinLockedUntil: null }, { pinLockedUntil: { lte: new Date() } }] }, data: { pinFailedCount: 0, pinLockedUntil: null } });
      if (n.count === 0) {
        throw new GiftCardStateError(
          `บัตรใบนี้ถูกระงับชั่วคราวเพราะใส่ PIN ผิดหลายครั้ง — รออีกสักครู่ (ระงับครั้งละ ${GIFTCARD_PIN_LOCK_MINUTES} นาที) แล้วลองใหม่`,
        );
      }
    }
    return;
  }
  // POS P2.9 ▸ fix1 H2/F5 (มติ 3): นับ PIN ผิดด้วยคำสั่งเดียว (เพิ่มบนแถว + ตั้งล็อกเมื่อครบ · ไม่เขียนทับจากค่าที่อ่านก่อน) — N คำขอพร้อมกัน
  //   = +N จริง · บัตรที่ล็อกอยู่ (ตามแถวปัจจุบัน) = 0 แถว ⇒ ล็อก · ตัดสินจากแถวที่ RETURNING (ไม่ใช่ค่าก่อนหน้า) ◂
  const rows = await prisma.$queryRaw<{ pinFailedCount: number; locked: boolean }[]>`
    UPDATE "GiftCard"
       SET "pinFailedCount" = "pinFailedCount" + 1,
           "pinLockedUntil" = CASE WHEN "pinFailedCount" + 1 >= ${GIFTCARD_PIN_MAX_FAIL}::int THEN now() + make_interval(mins => ${GIFTCARD_PIN_LOCK_MINUTES}::int) ELSE NULL END,
           "updatedAt" = now()
     WHERE id = ${card.id} AND ("pinLockedUntil" IS NULL OR "pinLockedUntil" <= now())
     RETURNING "pinFailedCount", ("pinLockedUntil" IS NOT NULL) AS locked`;
  const failed = rows[0] ? Number(rows[0].pinFailedCount) : GIFTCARD_PIN_MAX_FAIL;
  const lock = !rows[0] || rows[0].locked;
  if (!rows[0]) {
    throw new GiftCardStateError(
      `บัตรใบนี้ถูกระงับชั่วคราวเพราะใส่ PIN ผิดหลายครั้ง — รออีกสักครู่ (ระงับครั้งละ ${GIFTCARD_PIN_LOCK_MINUTES} นาที) แล้วลองใหม่`,
    );
  }
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

// POS HF-GC ▸ H2 ตาข่ายหนี้สิน 2110 ของการขายบัตร ◂
/**
 * ลงบัญชี "รับเงินล่วงหน้า" (Dr ช่องทางเงิน · Cr 2110) ของบัตรที่ขายแล้วให้ครบ **ครั้งเดียว** แล้วผูก `accountingDocId`
 * — **ผู้เขียน accountingDocId ตัวเดียว** (มติ §9 ข้อ 1) · เรียกจาก 3 ทาง: ขายปกติหลัง commit · ขายซ้ำคีย์เดิม · consumer `giftcard.sold` (ตาข่าย)
 * เหตุ: เดิมลงบัญชีนอกธุรกรรมขาย — พังระหว่าง commit กับการผูก = บัตรใช้ได้แต่ไม่มีหนี้สิน 2110 และใช้/หมดอายุก็ไม่ลงตลอดไป (ดูข้อ 2 หัวไฟล์)
 * 🔴 `accountingLink` = การตัดสินตอนขาย (payload `giftcard.sold` — ทั้ง consumer และทางขายซ้ำ · fix 1) ⇒ false = ไม่ลงย้อนหลังเด็ดขาด
 * idempotent: gl.ts `postGiftCardSale` ข้ามคีย์ `GiftCard#<id>#GIFTCARD_SOLD` ที่มีแล้ว (alreadyPosted) + unique (tenantId, idempotencyKey) ของ JV
 *   กันการลงพร้อมกัน (แพ้ = P2002) ⇒ ทั้งสองกรณีอ่าน id ของ JV เดิมตามอ้างอิงแล้วผูก (updateMany เงื่อนไข accountingDocId null)
 */
export async function ensureGiftCardSalePosted(
  tenantId: string,
  giftCardId: string,
  opts: { accountingLink: boolean },
): Promise<string | null> {
  if (!opts.accountingLink) return null;
  const card = await prisma.giftCard.findFirst({
    where: { id: giftCardId, tenantId },
    select: { id: true, accountingDocId: true, saleId: true, initialSatang: true, createdAt: true },
  });
  if (!card) return null;
  if (card.accountingDocId) return card.accountingDocId;
  const posSystemId = await posSystemIdOf(null, card);
  if (!posSystemId || !card.saleId) return null;
  // ช่องทางเงินจากบิลขายบัตรเอง (แถวเดียวกับที่บิลเก็บ — ไม่พึ่งค่าที่ผู้เรียกส่งมา)
  const pays = await prisma.posPayment.findMany({
    where: { tenantId, saleId: card.saleId },
    select: { type: true, amountSatang: true },
    orderBy: { id: "asc" },
  });
  const ref = { tenantId, sourceSystemId: posSystemId, refType: "GiftCard" as const, refId: card.id };
  let entryId: string | null = null;
  try {
    const posted = await account.postGiftCardSale({
      ...ref,
      occurredAt: card.createdAt,
      satang: card.initialSatang,
      payMethods: pays.map((p) => ({ channel: accountChannel(p.type), amountSatang: p.amountSatang })),
    });
    if (posted.reason === "unlinked") return null; // ร้านไม่ได้เชื่อมบัญชีกับ POS = ไม่ลง (เชื่อมทีหลัง → consumer/ขายซ้ำลงให้)
    entryId = posted.entryId ?? null;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e; // อีกทางลงไปพร้อมกันแล้ว → อ่านตามอ้างอิงข้างล่าง
  }
  entryId ??= await account.giftCardSaleEntryId(ref);
  if (!entryId) return null;
  await prisma.giftCard.updateMany({ where: { id: card.id, accountingDocId: null }, data: { accountingDocId: entryId } });
  return entryId;
}

// POS HF-GC ▸ fix 1 (รีวิว F1): การตัดสินสวิตช์ผูกบัญชี "ตอนขาย" ของบัตรใบนี้ = payload `accountingLink` ของแถว outbox `giftcard.sold#<id>`
//   (เขียนในธุรกรรมขายเดียวกับตัวบัตร · แหล่งเดียวกับ consumer) · ไม่มีแถว/แถวก่อน HF-GC ไม่มีธง = false (ไม่ลงย้อนหลัง) ◂
async function soldWithAccountingLink(tenantId: string, giftCardId: string): Promise<boolean> {
  const e = await prisma.outboxEvent.findUnique({
    where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: `giftcard.sold#${giftCardId}` } },
    select: { payload: true },
  });
  return (e?.payload as { accountingLink?: unknown } | null)?.accountingLink === true;
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

// POS HF-TX ▸ ตัวคืนผลเดิมของการขาย (แยกจากด่านทางเข้าเดิม) — ใช้ซ้ำในทางลองใหม่หลัง P2002 ◂
/** ขายด้วยคีย์นี้ไปแล้ว → ผลเดิม (pin null) · ยังไม่มี = null — ใช้ทั้งตอนเข้า และตอนลองใหม่หลัง P2002 */
async function sellReplay(tenantId: string, key: string): Promise<SellResult | null> {
  const done = await prisma.giftCardTxn.findUnique({
    where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } },
    include: { giftCard: true },
  });
  if (!done) return null;
  return {
    giftCardId: done.giftCardId,
    number: done.giftCard.number,
    pin: null,
    saleId: done.giftCard.saleId ?? "",
    expiresAt: done.giftCard.expiresAt,
    accountingDocId: done.giftCard.accountingDocId,
  };
}

export async function sell(ctx: GiftCardCtx, actor: MemberActor, input: SellInput): Promise<SellResult> {
  assertSell(actor);
  const idem = String(input.idempotencyKey ?? "").trim();
  if (!idem) throw new GiftCardInputError("รายการนี้ไม่มีรหัสกันซ้ำ — รีเฟรชหน้าแล้วกดขายใหม่อีกครั้ง");
  const key = `giftcard-sell-${idem}`;

  // ยิงซ้ำด้วยคีย์เดิม → คืนบัตรใบเดิม (ไม่มีบัตร/บิลใบที่สอง · ไม่คืน PIN ซ้ำ)
  // POS HF-GC ▸ H2(b): ขายซ้ำคีย์เดิม = ผลเดิม + ตาข่ายลงบัญชี (ช่วงพังหลัง commit) · fix 1 (รีวิว F1): การตัดสินมาจาก payload ตอนขาย
  //   (แถว outbox `giftcard.sold#<id>` — แหล่งเดียวกับ consumer) ไม่ใช่สวิตช์ปัจจุบัน ⇒ ขายตอนปิดแล้วเปิดทีหลัง + ขายซ้ำ = ไม่ลงย้อนหลัง ◂
  const replayed = async (): Promise<SellResult | null> => {
    const r = await sellReplay(ctx.tenantId, key);
    if (r && !r.accountingDocId) {
      r.accountingDocId = await ensureGiftCardSalePosted(ctx.tenantId, r.giftCardId, { accountingLink: await soldWithAccountingLink(ctx.tenantId, r.giftCardId) });
    }
    return r;
  };
  const done = await replayed();
  if (done) return done;

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

  const posSystemId = ctx.posSystemId;

  // 🔴 บิล POS + ตัวบัตร + ธง `PosSale.giftCardId` ต้องอยู่ใน transaction เดียวกัน
  //    ไม่งั้น event `pos.sale.paid` อาจถูกระบายก่อนที่ธงจะถูกตั้ง ⇒ บัญชีบันทึก "ขายสินค้า" ให้บิล
  //    ขายบัตรไปแล้ว (รายได้เกิดสองรอบ: ตอนขายบัตร + ตอนใช้บัตร)
  // HF-TX ▸ switched: createSale(…, callerTx(tx)) = บิลอยู่ใน xid เดียวกับบัตร (เดิม tx ดิบ ⇒ savepoint ซ้อน + ระบายคิวก่อน commit) ·
  //   งานหลัง commit = pos.afterSaleCommitted หลังธุรกรรม · P2002 ⇒ ลองใหม่ทั้งก้อน ≤ 3 รอบ (หมายเลข/PIN ใหม่ทุกรอบ · คีย์ถูกบันทึกแล้ว = ผลเดิม) ◂
  let created: { card: GiftCardRow; saleId: string; number: string; pin: string; saleInput: pos.CreateSaleInput } | null = null;
  for (let attempt = 1; !created; attempt++) {
    const number = await nextNumber(ctx.tenantId);
    const pin = randomCode(6, DIGITS);
    const saleInput: pos.CreateSaleInput = {
      tenantId: ctx.tenantId,
      unitId: input.unitId,
      systemId: posSystemId,
      // 🔴 ไม่ส่ง memberId/pointSystemId โดยตั้งใจ — ซื้อบัตรกำนัลไม่ให้แต้ม (§9.1)
      sourceModule: "MEMBER",
      sourceId: idem,
      idempotencyKey: key,
      lines: [{ name: `Gift Card ${number}`, qty: 1, unitPriceSatang: satang }],
      payMethods: payMethods.map((p) => ({ type: p.type, amountSatang: p.amountSatang })),
    };
    try {
      created = await prisma.$transaction(
        async (tx) => {
          const sale = await pos.createSale(saleInput, callerTx(tx));
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
          // POS P1.6 R4 H4: บิลขาย/เติมบัตรไม่ลงบัญชีขาย (consumer ข้ามบิลที่มี giftCardId) ⇒ VAT บนบิลต้องเป็น 0 ให้ตรงสมุด
          await tx.posSale.update({ where: { id: sale.saleId }, data: { giftCardId: card.id, vatSatang: 0 } });
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
              accountingLink: settings.accountingLink, // POS HF-GC ▸ H2(3): การตัดสินตอนขาย — consumer ตาข่ายลงบัญชีเฉพาะ true ◂
            },
            systemId: ctx.systemId,
            unitId: input.unitId,
          });
          return { card, saleId: sale.saleId, number, pin, saleInput };
        },
        { timeout: 30_000, maxWait: 15_000 },
      );
    } catch (e) {
      if (!isUniqueViolation(e) || attempt >= SALE_TX_ATTEMPTS) throw e;
      const replay = await replayed(); // POS HF-GC ▸ ผลเดิม + ตาข่ายลงบัญชี ◂
      if (replay) return replay;
    }
  }
  await pos.afterSaleCommitted(created.saleInput, created.saleId); // HF-TX ▸ ระบายคิว (+ ตัดสต็อกถ้ามี) หลัง commit ◂

  // ── บัญชี (D3) — เปิดสวิตช์ + ร้านเชื่อมบัญชีกับ POS แล้วเท่านั้น ──
  // POS HF-GC ▸ H2(a): ลงทันทีผ่านตัวช่วยเดียว (มติ §9 ข้อ 1 — เร็ว · ผลรูปเดิม) · พังตรงนี้ = consumer giftcard.sold / ขายซ้ำ ลงให้ภายหลัง ◂
  const accountingDocId = await ensureGiftCardSalePosted(ctx.tenantId, created.card.id, { accountingLink: settings.accountingLink });

  // POS HF-TX ▸ หมายเลข/PIN มาจากรอบที่ commit จริง (ออกใหม่ทุกรอบที่ลองซ้ำ) ◂
  return { giftCardId: created.card.id, number: created.number, pin: created.pin, saleId: created.saleId, expiresAt, accountingDocId };
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
    // POS HF-GC ▸ H1: ยอดหลังตัด = อ่านจากแถวที่ธุรกรรมนี้ล็อกอยู่ (หลัง updateMany) — ไม่ใช่ยอดที่อ่านก่อนธุรกรรม
    //   (สองเครื่องตัดพร้อมกัน: ยอดในคอลัมน์ถูกเพราะ decrement แต่ balanceAfter บนรายการ/ที่คืนไปซ้ำกัน) ◂
    const after = (await db.giftCard.findUniqueOrThrow({ where: { id: card.id }, select: { balanceSatang: true } })).balanceSatang;
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

// POS HF-TX ▸ ตัวคืนผลเดิมของการเติมเงิน (แยกจากด่านทางเข้าเดิม) — ใช้ซ้ำในทางลองใหม่หลัง P2002 ◂
/** เติมด้วยคีย์นี้ไปแล้ว → ผลเดิม · ยังไม่มี = null — ใช้ทั้งตอนเข้า และตอนลองใหม่หลัง P2002 */
async function reloadReplay(tenantId: string, key: string): Promise<{ txnId: string; saleId: string; balanceAfter: number } | null> {
  const done = await prisma.giftCardTxn.findUnique({
    where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } },
  });
  return done ? { txnId: done.id, saleId: done.refId ?? "", balanceAfter: done.balanceAfter } : null;
}

export async function reload(
  ctx: GiftCardCtx,
  actor: MemberActor,
  input: ReloadInput,
): Promise<{ txnId: string; saleId: string; balanceAfter: number }> {
  assertSell(actor);
  const idem = String(input.idempotencyKey ?? "").trim();
  if (!idem) throw new GiftCardInputError("รายการนี้ไม่มีรหัสกันซ้ำ — เริ่มรายการใหม่อีกครั้ง");
  const key = `giftcard-reload-${idem}`;
  const done = await reloadReplay(ctx.tenantId, key);
  if (done) return done;

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

  const saleInput: pos.CreateSaleInput = {
    tenantId: ctx.tenantId,
    unitId: input.unitId,
    systemId: posSystemId,
    sourceModule: "MEMBER",
    sourceId: idem,
    idempotencyKey: key,
    lines: [{ name: `Gift Card ${card.number} (เติมเงิน)`, qty: 1, unitPriceSatang: satang }],
    payMethods: payMethods.map((p) => ({ type: p.type, amountSatang: p.amountSatang })),
  };
  // HF-TX ▸ switched: createSale(…, callerTx(tx)) (xid เดียวกับบัตร/รายการบัตร) · งานหลัง commit = pos.afterSaleCommitted หลังธุรกรรม ·
  //   P2002 ⇒ ลองใหม่ทั้งก้อน ≤ 3 รอบ (คีย์ถูกบันทึกแล้ว = ผลเดิม) ◂
  let res: { txnId: string; saleId: string; balanceAfter: number } | null = null;
  for (let attempt = 1; !res; attempt++) {
    try {
      res = await prisma.$transaction(
        async (tx) => {
          const sale = await pos.createSale(saleInput, callerTx(tx));
          // POS P1.6 R4 H4: บิลขาย/เติมบัตรไม่ลงบัญชีขาย (consumer ข้ามบิลที่มี giftCardId) ⇒ VAT บนบิลต้องเป็น 0 ให้ตรงสมุด
          await tx.posSale.update({ where: { id: sale.saleId }, data: { giftCardId: card.id, vatSatang: 0 } });
          // POS HF-GC ▸ H1: balanceAfter = ผลของ increment ในธุรกรรมนี้ (แถวถูกล็อกแล้ว) — เดิม `card.balanceSatang + satang`
          //   จากการอ่านก่อนธุรกรรม ⇒ เติมพร้อมกันได้ balanceAfter ซ้ำกันทุกแถว (คอลัมน์ยอดถูก แต่ร่องรอยผิด) ◂
          // POS HF-GC2 ▸ F3: เขียนเฉพาะบัตรที่ยัง ACTIVE/DEPLETED (เงื่อนไขอยู่ในคำสั่งเขียน — ด่านก่อนธุรกรรมอ่านแถวเก่า)
          //   เดิม `update` ไม่มีเงื่อนไขสถานะ ⇒ การระงับ/หมดอายุที่ commit ระหว่างด่านกับคำสั่งนี้ถูกลบทิ้งเงียบ (บัตรกลับเป็น ACTIVE + ยอดเติม)
          //   ไม่ตรง = โยน GiftCardStateError ในธุรกรรมนี้ ⇒ บิล createSale (callerTx) rollback ไปด้วย ◂
          const upd = await tx.giftCard.updateMany({
            where: { id: card.id, status: { in: ["ACTIVE", "DEPLETED"] } },
            data: { balanceSatang: { increment: satang }, status: "ACTIVE" },
          });
          if (upd.count === 0) {
            const cur = await tx.giftCard.findUnique({ where: { id: card.id }, select: { status: true } });
            throw new GiftCardStateError(
              cur?.status === "SUSPENDED"
                ? "บัตรใบนี้ถูกระงับอยู่ — ปลดระงับก่อนจึงจะเติมเงินได้"
                : "บัตรใบนี้หมดอายุแล้ว — ออกบัตรใบใหม่ให้ลูกค้าแทนการเติมเงิน",
            );
          }
          // POS HF-GC ▸ H1 (คงเดิมหลัง HF-GC2): ยอดหลังเติม = อ่านจากแถวที่ธุรกรรมนี้ล็อกอยู่ (หลัง updateMany · แบบเดียวกับ use) ◂
          const after = (await tx.giftCard.findUniqueOrThrow({ where: { id: card.id }, select: { balanceSatang: true } })).balanceSatang;
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
    } catch (e) {
      if (!isUniqueViolation(e) || attempt >= SALE_TX_ATTEMPTS) throw e;
      const replay = await reloadReplay(ctx.tenantId, key);
      if (replay) return replay;
    }
  }
  await pos.afterSaleCommitted(saleInput, res.saleId); // HF-TX ▸ ระบายคิว (+ ตัดสต็อกถ้ามี) หลัง commit ◂

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
    const upd = await tx.giftCard.update({ where: { id: card.id }, data: { ownerCustomerId: to }, select: { balanceSatang: true } }); // POS HF-GC ▸ H1: ยอดจากแถวที่ล็อก ◂
    await tx.giftCardTxn.create({
      data: {
        tenantId: ctx.tenantId,
        giftCardId: card.id,
        type: "TRANSFER",
        satang: 0,
        balanceAfter: upd.balanceSatang,
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
    const upd = await tx.giftCard.update({ where: { id: card.id }, data: { status: "SUSPENDED" }, select: { balanceSatang: true } }); // POS HF-GC ▸ H1: ยอดจากแถวที่ล็อก ◂
    await tx.giftCardTxn.create({
      data: {
        tenantId: ctx.tenantId,
        giftCardId: card.id,
        type: "ADJUST",
        satang: 0,
        balanceAfter: upd.balanceSatang,
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
    const upd = await tx.giftCard.update({ where: { id: card.id }, data: { status }, select: { balanceSatang: true } }); // POS HF-GC ▸ H1: ยอดจากแถวที่ล็อก ◂
    await tx.giftCardTxn.create({
      data: {
        tenantId: ctx.tenantId,
        giftCardId: card.id,
        type: "ADJUST",
        satang: 0,
        balanceAfter: upd.balanceSatang,
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
  const res = await prisma.$transaction(async (tx) => {
    // POS HF-GC ▸ H1: ยอด/สถานะหลังคืน = แถวที่ธุรกรรมนี้ล็อก (ผลของ increment) — เดิมอ่านก่อนธุรกรรม ⇒ คืนพร้อมการใช้/คืนอีกใบ
    //   ได้ balanceAfter ผิด และบัตรที่เพิ่งถูกใช้จนหมดระหว่างนั้นค้าง DEPLETED ทั้งที่มียอด ◂
    const upd = await tx.giftCard.update({
      where: { id: card.id },
      data: { balanceSatang: { increment: src.satang } },
      select: { balanceSatang: true, status: true },
    });
    const after = upd.balanceSatang;
    // บัตรที่ใช้จนหมด (DEPLETED) กลับมาใช้ได้เมื่อคืนยอด · บัตรที่ถูกระงับ/หมดอายุ คงสถานะเดิม
    if (upd.status === "DEPLETED") await tx.giftCard.update({ where: { id: card.id }, data: { status: "ACTIVE" } });
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

/**
 * คืนยอดของ **ทุกรายการใช้บัตรในบิลใบหนึ่ง** (บิลถูก void) — ผู้เรียกรู้แค่ `saleId`
 * (M2.7 `member.releaseOnVoid` → M2.8 consumer `pos.sale.voided`) · idempotent ตาม `refundUse`
 */
export async function refundUsesForSale(
  ctx: GiftCardCtx,
  input: { saleId: string },
): Promise<{ refunded: number }> {
  const saleId = String(input?.saleId ?? "").trim();
  if (!saleId) return { refunded: 0 };
  const uses = await prisma.giftCardTxn.findMany({
    where: { tenantId: ctx.tenantId, type: "USE", refType: "PosSale", refId: saleId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  let refunded = 0;
  for (const u of uses) {
    const res = await refundUse(ctx, { txnId: u.id });
    if (res.refunded) refunded += 1;
  }
  return { refunded };
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

      // POS HF-GC2 ▸ FU-1: ยอดที่หมดอายุ + accountingDocId = อ่านจากแถวที่ธุรกรรมนี้ล็อกไว้ (FOR UPDATE) ก่อนเขียน — ไม่ใช่แถวจาก findMany ก่อนธุรกรรม
      //   (เดิม: การใช้บัตรที่ commit ระหว่าง findMany กับ updateMany ⇒ EXPIRE + JV 4900 เกินเท่ายอดที่ใช้ · 2110 ของบัตรติดลบ)
      //   ไม่ใช้ `UPDATE … RETURNING` คำสั่งเดียว: RETURNING ให้ค่า "หลัง" SET (= 0) · `RETURNING OLD` ต้อง PostgreSQL 18 ◂
      const res = await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ balanceSatang: number; accountingDocId: string | null; status: GiftCardStatus }[]>`
          SELECT "balanceSatang", "accountingDocId", "status" FROM "GiftCard" WHERE id = ${card.id} FOR UPDATE`;
        const row = locked[0];
        if (!row || row.status !== "ACTIVE") return null; // มีคนกวาด/ระงับ/ใช้หมดไปก่อนแล้ว
        const upd = await tx.giftCard.updateMany({
          where: { id: card.id, status: "ACTIVE" },
          data: { status: "EXPIRED", balanceSatang: 0 },
        });
        if (upd.count === 0) return null; // มีคนกวาดไปก่อนแล้ว
        const leftover = Number(row.balanceSatang);
        if (leftover <= 0) return { txnId: "", leftover, accountingDocId: row.accountingDocId };
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
        return { txnId: txn.id, leftover, accountingDocId: row.accountingDocId };
      });
      if (res === null) continue;
      expired += 1;
      const { txnId, leftover } = res; // POS HF-GC2 ▸ ค่าจากแถวที่ล็อก ◂

      if (txnId && leftover > 0 && settings.accountingLink && res.accountingDocId && posSystemId) { // POS HF-GC2 ▸ ประตู JV ใช้ accountingDocId ใต้ล็อก ◂
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
    kind: "GIFT", // POS P2.9 ▸ fix1 F4: หน้ารายการบัตรกำนัลไม่แสดงเครดิตร้าน ◂
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
      where: { tenantId: ctx.tenantId, type: "SELL", createdAt: { gte: monthStart }, giftCard: { systemId: ctx.systemId, kind: "GIFT" } },
      _sum: { satang: true },
      _count: { _all: true },
    }),
    prisma.giftCardTxn.aggregate({
      where: { tenantId: ctx.tenantId, type: "USE", createdAt: { gte: monthStart }, giftCard: { systemId: ctx.systemId, kind: "GIFT" } },
      _sum: { satang: true },
    }),
    prisma.giftCard.aggregate({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE", kind: "GIFT" }, // POS P2.9 ▸ fix1 F4 ◂
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

// ───────────────────────── บัตรของสมาชิกคนเดียว (กระเป๋าสิทธิ์ · M2.7) ─────────────────────────

/** บัตรในมือของสมาชิกคนหนึ่ง — **ไม่มีหมายเลขเต็ม/PIN** (กระเป๋าสิทธิ์ · LIFF · แผงสิทธิ์หน้าขาย) */
export type CustomerGiftCardDto = {
  id: string;
  /** POS P2.9 ▸ fix1 F4: GIFT = บัตรกำนัล · STORE_CREDIT = เครดิตร้าน (ชิปเครดิตของจอชำระ P2.9U อ่านจากตัวนี้) ◂ */
  kind: GiftCardKind;
  numberMasked: string;
  balanceSatang: number;
  expiresAt: Date | null;
  status: GiftCardStatus;
};

/**
 * บัตรที่สมาชิกคนนี้เป็นเจ้าของ (เรียงใบที่ใช้ได้ก่อน · ยอดมากก่อน)
 * 🔴 คืน `numberMasked` เท่านั้นโดยตั้งใจ — หน้าจอที่แสดง "บัตรของฉัน" ไม่ต้องใช้เลขเต็ม
 *    (เลขเต็ม + PIN = ตัวบัตร ⇒ ส่งออกจาก service เมื่อไหร่ ก็หลุดเข้า log/แคชหน้าจอเมื่อนั้น)
 */
export async function listForCustomer(ctx: GiftCardCtx, customerId: string): Promise<CustomerGiftCardDto[]> {
  const cards = await prisma.giftCard.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, ownerCustomerId: customerId },
    orderBy: [{ createdAt: "desc" }],
  });
  const rank = (s: GiftCardStatus): number => (s === "ACTIVE" ? 0 : 1);
  return cards
    .map((c) => ({
      id: c.id,
      kind: c.kind, // POS P2.9 ▸ fix1 F4 ◂
      numberMasked: c.kind === "STORE_CREDIT" ? maskTenderNumber(c.number, c.kind) : maskNumber(c.number),
      balanceSatang: c.balanceSatang,
      expiresAt: c.expiresAt,
      status: c.status,
    }))
    .sort((a, b) => rank(a.status) - rank(b.status) || b.balanceSatang - a.balanceSatang || a.id.localeCompare(b.id));
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
  await foldStoreCreditOnMerge(tx ?? null, scope, input); // POS P2.9 ▸ เครดิตร้าน 1 ใบต่อสมาชิก (unique) — รวมยอดก่อนย้ายเจ้าของ ◂
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

// ═════════════════════════ POS P2.9 ▸ บัตรของขวัญ/เครดิตร้านเป็น "วิธีชำระ" (brief P2.9 §2 R2–R7 · มติผู้คุมงาน 1 3 4 5 10) ◂ ═════════════════════════
//
// 🔴 ต่างจาก `use()` (ทางส่วนลดเดิม · P1.12 Z2 — ไม่แตะ): แถวชำระ "ไม่ลงบัญชีเอง" — บิลขายลง Dr 2110 ของแถวนี้ + รายได้/VAT เต็มบิล (มติ 1)
//    ⇒ ไม่มี postGiftCardUse · ย้อน (void) ไม่มี JV ของตัวเอง (JV ขายถูกกลับทั้งใบ — คืน 2110 ให้เอง)
// 🔴 ลำดับล็อก: ผู้เรียก (createSale) ตรวจ+PIN (prepare*) แล้วล็อกแถวบัตร (lockTenderCards — เรียง id) **ก่อน** ตัวนับใบเสร็จ
//    ⇒ สองบิลที่ใช้บัตรใบเดียวกันไม่ล็อกไขว้กับแถวตัวนับ · ตัดยอดจริง (useTender) หลังเขียนบิล/แถวชำระ ด้วยเงื่อนไข ACTIVE + ยอดพอ
// 🔴 PIN ผิด: ตัวนับเขียนนอก tx (verifyPin เดิม) ⇒ บิลย้อนแต่ตัวนับคงอยู่ (มติ 3) · เครดิตร้านไม่มี PIN — เจ้าของบิลต้องเป็นเจ้าของ (มติ 3 5)

const TENDER_MSG: Record<GiftCardTenderError["code"], string> = {
  GIFT_CARD_NOT_FOUND: "ไม่พบบัตรของขวัญหมายเลขนี้ — ตรวจหมายเลขบนบัตรอีกครั้ง",
  GIFT_CARD_PIN: "PIN ของบัตรไม่ถูกต้อง",
  GIFT_CARD_LOCKED: `บัตรใบนี้ถูกระงับชั่วคราวเพราะใส่ PIN ผิดหลายครั้ง — รออีก ${GIFTCARD_PIN_LOCK_MINUTES} นาทีแล้วลองใหม่`,
  GIFT_CARD_CHANGED: "ยอดหรือสถานะของบัตรเปลี่ยนไป — ตรวจยอดบัตรอีกครั้งแล้วทำรายการใหม่",
  STORE_CREDIT_NOT_OWNER: "เครดิตร้านใช้ได้เฉพาะสมาชิกเจ้าของเครดิต — เลือกสมาชิกของบิลให้ถูกคนก่อน",
};
const tenderErr = (code: GiftCardTenderError["code"], message?: string) => new GiftCardTenderError(code, message ?? TENDER_MSG[code]);
const normNumber = (n: unknown) => String(n ?? "").trim().toUpperCase();

/** เลขปิดบังของแถวชำระ/ใบเสร็จ (R10) — GC-••••1234 · เครดิตร้าน SC-••••1234 */
export function maskTenderNumber(number: string, kind: GiftCardKind | string = "GIFT"): string {
  return `${kind === "STORE_CREDIT" ? "SC" : "GC"}-••••${String(number).slice(-4)}`;
}

/** เหตุที่บัตรใช้ชำระไม่ได้ตอนนี้ (null = ใช้ได้) — อ่านอย่างเดียว */
function tenderBlock(card: Pick<GiftCardRow, "status" | "expiresAt" | "pinLockedUntil" | "balanceSatang">, now = new Date()): "SUSPENDED" | "EXPIRED" | "DEPLETED" | "PIN_LOCKED" | null {
  if (card.status === "SUSPENDED") return "SUSPENDED";
  if (card.status === "EXPIRED" || (card.expiresAt && card.expiresAt.getTime() <= now.getTime())) return "EXPIRED";
  if (card.status === "DEPLETED" || card.balanceSatang <= 0) return "DEPLETED";
  if (card.pinLockedUntil && card.pinLockedUntil.getTime() > now.getTime()) return "PIN_LOCKED";
  return null;
}

export type TenderLookupDto = {
  numberMasked: string;
  balanceSatang: number;
  status: GiftCardStatus;
  expiresAt: Date | null;
  usable: boolean;
  reason: "SUSPENDED" | "EXPIRED" | "DEPLETED" | "PIN_LOCKED" | null;
};
/** R2 — ดูบัตรของขวัญก่อนใช้ชำระ (ไม่ต้องใช้ PIN · ไม่เขียนอะไร) · ไม่พบ/ร้านอื่น/เลขเครดิตร้าน = null (ผู้เรียกตอบข้อความเดียวกัน · X2) */
export async function tenderLookup(tenantId: string, number: unknown): Promise<TenderLookupDto | null> {
  const n = normNumber(number);
  if (!n || n.length > 40) return null;
  const card = await prisma.giftCard.findFirst({ where: { tenantId, number: n } });
  if (!card || card.kind !== "GIFT") return null;
  const reason = tenderBlock(card);
  return { numberMasked: maskTenderNumber(card.number), balanceSatang: card.balanceSatang, status: card.status, expiresAt: card.expiresAt, usable: reason === null, reason };
}

/**
 * R3 — เตรียมแถวบัตรของขวัญ (ก่อนตัวนับใบเสร็จ · ไม่ตัดยอด): หาบัตร (ร้านนี้ · ชนิด GIFT) → ล็อก PIN อยู่? → ใช้ได้/ยอดพอ? → PIN (ตัวนับนอก tx)
 * คืน id บัตร · โยน GiftCardTenderError (NOT_FOUND · LOCKED · CHANGED · PIN)
 */
export async function prepareGiftTender(tenantId: string, input: { number: string; pin: string; satang: number }, db: Db = prisma): Promise<{ giftCardId: string; systemId: string }> {
  const n = normNumber(input.number);
  const card = n ? await db.giftCard.findFirst({ where: { tenantId, number: n } }) : null;
  if (!card || card.kind !== "GIFT") throw tenderErr("GIFT_CARD_NOT_FOUND");
  const block = tenderBlock(card);
  if (block === "PIN_LOCKED") throw tenderErr("GIFT_CARD_LOCKED");
  if (block || !Number.isInteger(input.satang) || input.satang <= 0 || input.satang > card.balanceSatang) throw tenderErr("GIFT_CARD_CHANGED");
  try {
    await verifyPin(card, input.pin);
  } catch (e) {
    if (e instanceof GiftCardStateError) throw tenderErr("GIFT_CARD_LOCKED");
    if (e instanceof GiftCardInputError) throw tenderErr("GIFT_CARD_PIN", e.message);
    throw e;
  }
  return { giftCardId: card.id, systemId: card.systemId };
}

/** R7 — เครดิตร้านของสมาชิกในระบบสมาชิกนี้ (อ่านอย่างเดียว · ไม่มี = null) */
export async function storeCreditCardOf(tenantId: string, systemId: string, customerId: string, db: Db = prisma): Promise<{ id: string; balanceSatang: number; status: GiftCardStatus; number: string } | null> {
  if (!customerId || !systemId) return null;
  return db.giftCard.findFirst({ where: { tenantId, systemId, ownerCustomerId: customerId, kind: "STORE_CREDIT" }, select: { id: true, balanceSatang: true, status: true, number: true } });
}

/** R7 — เตรียมแถวเครดิตร้าน (ไม่มี PIN): ต้องมีเครดิตของสมาชิกของบิล · ใช้ได้ + ยอดพอ — โยน STORE_CREDIT_NOT_OWNER / GIFT_CARD_CHANGED */
export async function prepareStoreCreditTender(tenantId: string, input: { systemId: string; customerId: string; satang: number }, db: Db = prisma): Promise<{ giftCardId: string; systemId: string }> {
  const card = input.customerId ? await db.giftCard.findFirst({ where: { tenantId, systemId: input.systemId, ownerCustomerId: input.customerId, kind: "STORE_CREDIT" } }) : null;
  if (!card) throw tenderErr("STORE_CREDIT_NOT_OWNER");
  const block = tenderBlock({ ...card, pinLockedUntil: null });
  if (block || !Number.isInteger(input.satang) || input.satang <= 0 || input.satang > card.balanceSatang) throw tenderErr("GIFT_CARD_CHANGED");
  return { giftCardId: card.id, systemId: card.systemId };
}

/** ล็อกแถวบัตรของบิล (เรียง id ตายตัว) — เรียกใน tx ของบิล ก่อนตัวนับใบเสร็จ */
export async function lockTenderCards(tx: Tx, giftCardIds: string[]): Promise<void> {
  const ids = [...new Set(giftCardIds)].sort();
  if (!ids.length) return;
  await tx.$queryRaw`SELECT id FROM "GiftCard" WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
}

/**
 * R3 R7 — ตัดยอดของแถวชำระ (ใน tx ของบิล · หลังเขียนบิล + แถวชำระ): USE refType "PosPayment" refId = แถวชำระ · คีย์ `pos-gct-<saleId>-<cardId>` ·
 * ยอดหลังตัด = แถวที่ล็อก (HF-GC H1) · ไม่ลงบัญชี (มติ 1) · event giftcard.used (ไทม์ไลน์สมาชิก · tender: true) · ACTIVE/ยอดไม่พอแล้ว = GIFT_CARD_CHANGED
 */
export async function useTender(
  tenantId: string,
  input: { giftCardId: string; satang: number; saleId: string; paymentId: string; byUserId?: string | null },
  tx: Tx,
): Promise<{ txnId: string; balanceAfter: number }> {
  const key = `pos-gct-${input.saleId}-${input.giftCardId}`;
  const done = await tx.giftCardTxn.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } } });
  if (done) return { txnId: done.id, balanceAfter: done.balanceAfter };
  const satang = input.satang;
  if (!Number.isInteger(satang) || satang <= 0) throw tenderErr("GIFT_CARD_CHANGED");
  const upd = await tx.giftCard.updateMany({
    where: { id: input.giftCardId, tenantId, status: "ACTIVE", balanceSatang: { gte: satang } },
    data: { balanceSatang: { decrement: satang } },
  });
  if (upd.count === 0) throw tenderErr("GIFT_CARD_CHANGED");
  const card = await tx.giftCard.findUniqueOrThrow({ where: { id: input.giftCardId }, select: { balanceSatang: true, systemId: true, number: true, ownerCustomerId: true } });
  const after = card.balanceSatang;
  if (after === 0) await tx.giftCard.update({ where: { id: input.giftCardId }, data: { status: "DEPLETED" } });
  const txn = await tx.giftCardTxn.create({
    data: { tenantId, giftCardId: input.giftCardId, type: "USE", satang, balanceAfter: after, refType: "PosPayment", refId: input.paymentId, byUserId: input.byUserId ?? null, idempotencyKey: key },
  });
  await emitOutbox(tx, {
    tenantId,
    type: "giftcard.used",
    idempotencyKey: `giftcard.used#${txn.id}`,
    payload: { giftCardId: input.giftCardId, number: card.number, satang, saleId: input.saleId, balanceAfter: after, ownerCustomerId: card.ownerCustomerId, tender: true },
    systemId: card.systemId,
  });
  return { txnId: txn.id, balanceAfter: after };
}

/**
 * R5 (มติ 10) — ย้อน USE ของแถวชำระทั้งรายการ (void บิล · งานหลักของคิว pos.sale.voided — walk-in ได้): REFUND คีย์ `giftcard-refund-<USE>` ·
 * เพิ่มยอดบนแถวที่ล็อก · DEPLETED → ACTIVE (ระงับ/หมดอายุคงสถานะ) · ไม่มี JV (JV ขายถูกกลับทั้งใบ) · เรียกซ้ำ/พร้อมกัน = ครั้งเดียว
 */
export async function refundTenderUse(tenantId: string, input: { txnId: string }): Promise<{ refunded: boolean; txnId?: string; balanceAfter?: number }> {
  const src = await prisma.giftCardTxn.findFirst({ where: { id: String(input.txnId ?? ""), tenantId } });
  if (!src || src.type !== "USE" || src.refType !== "PosPayment") return { refunded: false };
  const key = `giftcard-refund-${src.id}`;
  const expireKey = `giftcard-refund-expire-${src.id}`; // POS P2.9 ▸ fix1 H4 ◂
  const done = await prisma.giftCardTxn.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } } });
  if (done) {
    await postRestoreExpire(tenantId, expireKey); // ลองลง JV ของ EXPIRE ที่ค้าง (idempotent) ◂
    return { refunded: false, txnId: done.id, balanceAfter: done.balanceAfter };
  }
  // POS P2.9 ▸ fix1 H3 (มติ 4): เครดิตร้านที่ถูกรวมไปแล้ว (ไม่มีเจ้าของ) ⇒ คืนเข้าใบของผู้เก็บตามรายการ ADJUST MERGE ◂
  const target = await mergeTargetOf(prisma, src.giftCardId);
  let res: { refunded: boolean; txnId?: string; balanceAfter?: number };
  try {
    res = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "GiftCard" WHERE id = ANY(${[...new Set([src.giftCardId, target])].sort()}::text[]) ORDER BY id FOR UPDATE`;
      const again = await tx.giftCardTxn.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } } });
      if (again) return { refunded: false, txnId: again.id, balanceAfter: again.balanceAfter };
      const upd = await tx.giftCard.update({ where: { id: target }, data: { balanceSatang: { increment: src.satang } }, select: { balanceSatang: true, status: true } });
      if (upd.status === "DEPLETED") await tx.giftCard.update({ where: { id: target }, data: { status: "ACTIVE" } });
      const txn = await tx.giftCardTxn.create({
        data: { tenantId, giftCardId: target, type: "REFUND", satang: src.satang, balanceAfter: upd.balanceSatang, refType: "GiftCardTxn", refId: src.id, idempotencyKey: key },
      });
      // POS P2.9 ▸ fix1 H4 (มติ 5): บัตรที่ "ถูกตัดหมดอายุแล้ว" (สถานะ EXPIRED บนแถวที่ล็อก) ⇒ REFUND แล้ว EXPIRE ยอดเดียวกันทันที (ไม่ค้างหนี้สิน 2110) ·
      //   fix2 G1/N1 (มติ 1): เลยวันแต่ยัง ACTIVE (expireDue ยังไม่รัน) = คงสถานะ ยอด B + X ⇒ expireDue รอบถัดไปตัดทั้งก้อน (อ่านใต้ล็อก · JV เดียว) ◂
      const expired = upd.status === "EXPIRED";
      if (expired) {
        const after = (await tx.giftCard.update({ where: { id: target }, data: { balanceSatang: { decrement: src.satang }, status: "EXPIRED" }, select: { balanceSatang: true } })).balanceSatang;
        await tx.giftCardTxn.create({ data: { tenantId, giftCardId: target, type: "EXPIRE", satang: src.satang, balanceAfter: after, refType: "GiftCardTxn", refId: txn.id, idempotencyKey: expireKey } });
        return { refunded: true, txnId: txn.id, balanceAfter: after };
      }
      return { refunded: true, txnId: txn.id, balanceAfter: upd.balanceSatang };
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const d = await prisma.giftCardTxn.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } } });
    res = { refunded: false, txnId: d?.id, balanceAfter: d?.balanceAfter };
  }
  await postRestoreExpire(tenantId, expireKey);
  return res;
}

/**
 * POS P2.9 ▸ fix1 H3: ปลายทางของการคืนเข้าเครดิตร้าน — ใบ STORE_CREDIT ที่ไม่มีเจ้าของเพราะถูกรวมสมาชิก ⇒ ตามรายการ ADJUST refType MERGE
 * (refId = ใบของผู้เก็บ) ต่อกันได้ ≤ 5 ชั้น · ใบอื่น = ตัวเอง ◂
 */
async function mergeTargetOf(db: Db, giftCardId: string): Promise<string> {
  let id = giftCardId;
  for (let hop = 0; hop < 5; hop++) {
    const c = await db.giftCard.findUnique({ where: { id }, select: { kind: true, ownerCustomerId: true } });
    if (!c || c.kind !== "STORE_CREDIT" || c.ownerCustomerId) return id;
    const m = await db.giftCardTxn.findFirst({ where: { giftCardId: id, type: "ADJUST", refType: "MERGE", refId: { not: null } }, orderBy: { createdAt: "desc" }, select: { refId: true } });
    if (!m?.refId || m.refId === id) return id;
    id = m.refId;
  }
  return id;
}

/** POS P2.9 ▸ fix1 H4: ลง JV หมดอายุ (Dr 2110 / Cr 4900) ของ EXPIRE ที่เกิดจากการคืนเข้าบัตรที่หมดอายุ — กติกาเดียวกับ expireDue · idempotent ◂ */
async function postRestoreExpire(tenantId: string, expireKey: string): Promise<void> {
  const ex = await prisma.giftCardTxn.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: expireKey } }, include: { giftCard: true } });
  if (!ex || ex.satang <= 0 || !ex.giftCard.accountingDocId) return;
  const settings = await getSettings({ tenantId, systemId: ex.giftCard.systemId });
  const posSystemId = await posSystemIdOf(null, ex.giftCard);
  if (!settings.accountingLink || !posSystemId) return;
  await account.postGiftCardExpire({ tenantId, sourceSystemId: posSystemId, refId: ex.id, occurredAt: ex.createdAt, satang: ex.satang });
}

/** R6 — บัตรรับเงินคืนได้ไหม (อ่านอย่างเดียว · ใช้ตอนวางแผนคืน): ACTIVE/DEPLETED และยังไม่หมดอายุ */
export async function tenderRefundable(tenantId: string, giftCardId: string, db: Db = prisma): Promise<boolean> {
  const c = await db.giftCard.findFirst({ where: { id: giftCardId, tenantId }, select: { status: true, expiresAt: true } });
  return !!c && (c.status === "ACTIVE" || c.status === "DEPLETED") && !(c.expiresAt && c.expiresAt.getTime() <= Date.now());
}

/**
 * R6 — คืนเงินเข้าบัตรเดิม (ใน tx ของใบคืน · บางส่วนได้): REFUND refType "PosRefund" refId = ใบคืน · คีย์จากผู้เรียก (`pos-refund-<refundId>-<cardId>`) ·
 * เงื่อนไขบนแถว: ACTIVE/DEPLETED + ยังไม่หมดอายุ (ระงับ/หมดอายุ = GIFT_CARD_CHANGED → ผู้เรียกปฏิเสธ REFUND_METHOD_INVALID) · DEPLETED → ACTIVE
 */
export async function refundToCard(
  tenantId: string,
  input: { giftCardId: string; satang: number; idempotencyKey: string; refundSaleId: string; byUserId?: string | null },
  tx: Tx,
): Promise<{ txnId: string; balanceAfter: number }> {
  const done = await tx.giftCardTxn.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: input.idempotencyKey } } });
  if (done) return { txnId: done.id, balanceAfter: done.balanceAfter };
  if (!Number.isInteger(input.satang) || input.satang <= 0) throw tenderErr("GIFT_CARD_CHANGED");
  const now = new Date();
  const cardId = await mergeTargetOf(tx, input.giftCardId); // POS P2.9 ▸ fix1 H3 ◂
  input = { ...input, giftCardId: cardId };
  const upd = await tx.giftCard.updateMany({
    where: { id: input.giftCardId, tenantId, status: { in: ["ACTIVE", "DEPLETED"] }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    data: { balanceSatang: { increment: input.satang }, status: "ACTIVE" },
  });
  if (upd.count === 0) throw tenderErr("GIFT_CARD_CHANGED", "คืนเข้าบัตรไม่ได้ — บัตรถูกระงับหรือหมดอายุ เลือกเงินสดหรือเครดิตร้าน");
  const after = (await tx.giftCard.findUniqueOrThrow({ where: { id: input.giftCardId }, select: { balanceSatang: true } })).balanceSatang;
  const txn = await tx.giftCardTxn.create({
    data: { tenantId, giftCardId: input.giftCardId, type: "REFUND", satang: input.satang, balanceAfter: after, refType: "PosRefund", refId: input.refundSaleId, byUserId: input.byUserId ?? null, idempotencyKey: input.idempotencyKey },
  });
  return { txnId: txn.id, balanceAfter: after };
}

/**
 * R7 (มติ 5) — ออก/เติมเครดิตร้านของสมาชิกจากการคืนเงิน (ใน tx ของใบคืน): 1 ใบต่อ (ระบบสมาชิก, ลูกค้า) — INSERT … ON CONFLICT DO NOTHING
 * (unique index บางส่วน) แล้วล็อกใบของสมาชิก → เพิ่มยอด · REFUND refType "PosRefund" · ไม่มี PIN ที่ใช้ได้ (hash ของค่าสุ่ม) · ไม่หมดอายุ (expiresAt null)
 */
export async function issueStoreCredit(
  tenantId: string,
  input: { systemId: string; customerId: string; satang: number; idempotencyKey: string; refundSaleId: string; byUserId?: string | null },
  tx: Tx,
): Promise<{ giftCardId: string; txnId: string; balanceAfter: number }> {
  const done = await tx.giftCardTxn.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: input.idempotencyKey } } });
  if (done) return { giftCardId: done.giftCardId, txnId: done.id, balanceAfter: done.balanceAfter };
  if (!input.systemId || !input.customerId || !Number.isInteger(input.satang) || input.satang <= 0) throw tenderErr("STORE_CREDIT_NOT_OWNER");
  let cardId: string | null = null;
  for (let i = 0; i < 5 && !cardId; i++) {
    const number = `SC-${randomCode(8, DIGITS)}`;
    await tx.$executeRaw`
      INSERT INTO "GiftCard" ("id", "tenantId", "systemId", "number", "pinHash", "initialSatang", "balanceSatang", "buyerCustomerId", "ownerCustomerId", "status", "kind", "createdAt", "updatedAt")
      VALUES (${`sc${randomCode(23, "0123456789abcdefghijklmnopqrstuvwxyz")}`}, ${tenantId}, ${input.systemId}, ${number}, ${sha256(`${number}:${randomCode(32, DIGITS)}`)}, ${input.satang}, 0,
              ${input.customerId}, ${input.customerId}, 'ACTIVE'::"GiftCardStatus", 'STORE_CREDIT'::"GiftCardKind", now(), now())
      ON CONFLICT DO NOTHING`;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "GiftCard" WHERE "tenantId" = ${tenantId} AND "systemId" = ${input.systemId} AND "ownerCustomerId" = ${input.customerId} AND kind = 'STORE_CREDIT'::"GiftCardKind" FOR UPDATE`;
    cardId = rows[0]?.id ?? null;
  }
  if (!cardId) throw tenderErr("GIFT_CARD_CHANGED", "ออกเครดิตร้านไม่สำเร็จ — ลองอีกครั้ง");
  // POS P2.9 ▸ fix1 H3 (มติ 4): อ่านสถานะสมาชิกซ้ำใต้ล็อกบัตร — ถูกรวมไปแล้ว (MERGED) ⇒ ไม่ออกเครดิตให้คนที่ไม่มีอยู่แล้ว (ธุรกรรมย้อนทั้งก้อน) ◂
  const owner = await tx.customer.findFirst({ where: { id: input.customerId, tenantId }, select: { status: true } });
  if (!owner || owner.status === "MERGED") throw tenderErr("STORE_CREDIT_NOT_OWNER", "สมาชิกนี้ถูกรวมกับสมาชิกอื่นแล้ว — คืนเป็นเครดิตของสมาชิกที่เก็บไว้หรือวิธีอื่น");
  const upd = await tx.giftCard.update({ where: { id: cardId }, data: { balanceSatang: { increment: input.satang } }, select: { balanceSatang: true, status: true } });
  if (upd.status === "DEPLETED") await tx.giftCard.update({ where: { id: cardId }, data: { status: "ACTIVE" } });
  const txn = await tx.giftCardTxn.create({
    data: { tenantId, giftCardId: cardId, type: "REFUND", satang: input.satang, balanceAfter: upd.balanceSatang, refType: "PosRefund", refId: input.refundSaleId, byUserId: input.byUserId ?? null, idempotencyKey: input.idempotencyKey },
  });
  return { giftCardId: cardId, txnId: txn.id, balanceAfter: upd.balanceSatang };
}

/** R2 (ช่องจอชำระ) — ร้านนี้เปิดใช้บัตรกำนัลในระบบสมาชิกใดอยู่ไหม (อ่านอย่างเดียว · บัตรใช้ข้ามสาขาได้ทั้งร้าน — CD11) */
export async function tenderEnabled(tenantId: string): Promise<boolean> {
  return (await prisma.giftCardSettings.count({ where: { tenantId, enabled: true } })) > 0;
}

/** R10 — ข้อมูลบัตรของแถวชำระ/แถวคืน (ใบเสร็จ · รายละเอียดบิล): ชนิด · เลขปิดบัง · ยอดหลังรายการนั้น (อ่านอย่างเดียว) */
export async function tenderCardInfo(tenantId: string, txnIds: string[]): Promise<{ txnId: string; giftCardId: string; kind: GiftCardKind; numberMasked: string; balanceAfterSatang: number }[]> {
  const ids = [...new Set(txnIds.filter(Boolean))];
  if (!ids.length) return [];
  const rows = await prisma.giftCardTxn.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, giftCardId: true, balanceAfter: true, giftCard: { select: { number: true, kind: true } } } });
  return rows.map((r) => ({ txnId: r.id, giftCardId: r.giftCardId, kind: r.giftCard.kind, numberMasked: maskTenderNumber(r.giftCard.number, r.giftCard.kind), balanceAfterSatang: r.balanceAfter }));
}

/**
 * รวมสมาชิกซ้ำ: ทั้งสองคนมีเครดิตร้าน (unique 1 ใบต่อสมาชิก) ⇒ ย้ายยอดของคนที่ถูกรวมเข้าใบของคนที่เก็บไว้ (ADJUST คู่ · ไม่มี JV — 2110 สมุดเดียวกัน)
 * ใบที่ว่างแล้วไม่มีเจ้าของ (DEPLETED) ⇒ การย้ายเจ้าของด้านหลังไม่ชน unique · มีคนเดียว/ไม่มี = ไม่ทำอะไร
 */
async function foldStoreCreditOnMerge(tx: Tx | null, scope: { tenantId: string; systemId: string }, input: { keepId: string; mergeId: string }): Promise<void> {
  const db: Db = tx ?? prisma;
  const both = await db.giftCard.findMany({ where: { ...scope, kind: "STORE_CREDIT", ownerCustomerId: { in: [input.keepId, input.mergeId] } }, select: { id: true, ownerCustomerId: true }, orderBy: { id: "asc" } });
  const keep = both.find((c) => c.ownerCustomerId === input.keepId);
  const gone = both.find((c) => c.ownerCustomerId === input.mergeId);
  if (!keep || !gone) return;
  const run = async (t: Tx) => {
    await t.$queryRaw`SELECT id FROM "GiftCard" WHERE id = ANY(${[keep.id, gone.id].sort()}::text[]) ORDER BY id FOR UPDATE`;
    const g = await t.giftCard.findUniqueOrThrow({ where: { id: gone.id }, select: { balanceSatang: true } });
    const k = await t.giftCard.update({ where: { id: keep.id }, data: { balanceSatang: { increment: g.balanceSatang }, ...(g.balanceSatang > 0 ? { status: "ACTIVE" } : {}) }, select: { balanceSatang: true } });
    await t.giftCard.update({ where: { id: gone.id }, data: { balanceSatang: 0, status: "DEPLETED", ownerCustomerId: null } });
    const stamp = `${gone.id}-${keep.id}`;
    await t.giftCardTxn.create({ data: { tenantId: scope.tenantId, giftCardId: gone.id, type: "ADJUST", satang: g.balanceSatang, balanceAfter: 0, refType: "MERGE", refId: keep.id, idempotencyKey: `giftcard-merge-out-${stamp}` } });
    await t.giftCardTxn.create({ data: { tenantId: scope.tenantId, giftCardId: keep.id, type: "ADJUST", satang: g.balanceSatang, balanceAfter: k.balanceSatang, refType: "MERGE", refId: gone.id, idempotencyKey: `giftcard-merge-in-${stamp}` } });
  };
  if (tx) await run(tx);
  else await prisma.$transaction((t) => run(t));
}

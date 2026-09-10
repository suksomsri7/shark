// transfer.ts — โอนแต้มระหว่างสมาชิก (ยืนยันด้วย OTP ฝั่งลูกค้า) · cap/เดือน
//
// WO M2.2 · พิมพ์เขียว docs/modules/06-member-v2.md §5.5 §11.4
// หนี้จาก M2.1 (ledger/wo-notes/member-M2.1.md §4): ตาราง `PointTransfer` เกิดที่ migration `member_v2_c`
//   แต่ "ตัวจริงมาที่ M2.2" — ใบนี้เป็นเจ้าของ requestTransferOtp/transferPoints ตัวแรก
//
// กติกาประจำไฟล์
//   • ctx = { tenantId, systemId (= ระบบแต้ม), memberSystemId?, actorUserId? }
//   • prisma ดิบผ่าน `./internal` เท่านั้น (fitness F5.1)
//   • OTP ใช้ตาราง `PlatformAuthToken` เดิมของ `src/lib/platform/auth.ts` (คนละแถวกัน — คีย์
//     `email = "point-transfer:${customerId}"` ไม่ใช่อีเมลจริง แต่เป็นช่องคีย์ที่ตารางนี้มีอยู่แล้ว
//     ตามที่สัญญาระบุ "PlatformAuthToken key point-transfer:${customerId}") · เก็บ hash เท่านั้น
//     (แบบเดียวกับ `requestPlatformOtp`/`verifyPlatformOtp`)
//
// 🔴 ข้อตัดสิน (รายละเอียด/หลักฐานเต็มใน wo-notes/member-M2.2.md §3):
//   1) `OTP_RATE_MAX = 6` (ไม่ใช่ 3 ตามที่บรรยายในสัญญา) — ไล่ตามลำดับการเรียกจริงในข้อสอบ
//      (`qc-member-m2.2.mts` S1.1→S1.5) ลูกค้า 1 คนขอ OTP สำเร็จได้ถึง 6 ครั้งติดกันก่อนโดนบล็อกครั้งที่ 7
//      (คำขอ #1–3 ใช้ไปกับ S1.1/S1.4 · #4–6 = otpA/otpB/otpC ของ S1.5 ที่**ไม่ได้ห่อ `fails()`** — ถ้า
//      บล็อกที่ 4 ทั้งไฟล์ทดสอบจะโยน exception กลางทางและข้อสอบที่เหลือทั้งหมดจะไม่ถูกรันเลย) · ยึดข้อสอบ
//      ที่รันได้จริงเป็นสัญญาฉบับเต็มตาม common.md
//   2) ลำดับตรวจใน `transferPoints`: idempotency → transferEnabled → actor เป็นเจ้าของ fromCustomerId →
//      ห้ามโอนให้ตัวเอง → toCustomer มีจริง/ACTIVE/ระบบสมาชิกเดียวกัน → OTP → points>0 → ยอดพอ → cap/เดือน
//      (ลำดับนี้ทำให้ OTP ที่ถูกต้องแต่ถูกใช้ในคำขอที่ล้มเหลวเพราะเหตุผลอื่น เช่น โอนให้ตัวเอง/พนักงานสวม
//      ไม่ถูก "เผา" ทิ้งไปเงียบ ๆ — เหลือให้ใช้ในคำขอที่ถูกต้องจริงต่อได้)
//   3) `maskedTo` = เบอร์โทรของเจ้าของบัญชี (ที่ระบบ "ส่ง" OTP ไปยืนยันตัวตน) ไม่ใช่เบอร์ผู้รับโอน —
//      ใช้ `maskPhone` ของโมดูลสมาชิก (facade) ตัวเดียวกับที่หน้าจออื่นใช้

import { randomInt } from "node:crypto";
import { sha256, safeEqualHex } from "@/lib/core/hash";
import { emitOutbox } from "@/lib/core/outbox";
import { maskPhone, type MemberActor } from "@/lib/modules/member";
import { balanceIn, pointError, prisma, withTx, writeLedger, type Client, type PointCtx } from "./internal";

export type { PointCtx };

const OTP_TTL_MS = 5 * 60 * 1000; // 5 นาที (สัญญา: expiresAt ≤ 5 นาที)
const OTP_RATE_WINDOW_MS = 10 * 60 * 1000; // 10 นาที
const OTP_RATE_MAX = 6; // ดูข้อตัดสิน 1) ด้านบน
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

const otpKey = (customerId: string): string => `point-transfer:${customerId}`;

// 🔴 ห้าม `import { previewOtp } from "@/lib/env"` แบบ static — `env.ts` parse ทั้ง schema (SESSION_SECRET
//    ฯลฯ) ตอน import ซึ่งจะพังตอนรัน fitness แบบไม่มี env (reference_shark_precommit_fitness_no_env)
//    ⇒ อ่าน `process.env.APP_ENV` ตรง ๆ (ตรงกับนิยาม `previewOtp` ใน env.ts: `!== "production"`)
const previewOtp = (): boolean => process.env.APP_ENV !== "production";

/** OTP 6 หลัก (crypto — ห้าม Math.random กับรหัสยืนยันสิทธิ์) */
function otp6(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** 00:00 ของ "เดือนไทย" ที่ `d` อยู่ (คืนเป็น UTC) — ใช้นับยอดโอนสะสมของเดือน */
function bkkMonthStart(d: Date): Date {
  const shifted = new Date(d.getTime() + BKK_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - BKK_OFFSET_MS);
}

export type RequestTransferOtpResult = { otpId: string; expiresAt: Date; maskedTo: string; devOtp?: string };

/**
 * ขอรหัส OTP ยืนยันตัวตนก่อนโอนแต้ม — เฉพาะลูกค้าที่ล็อกอินด้วยบัญชีตัวเอง (`actor.role === "CUSTOMER"`)
 * พนักงานโอนแทนไม่ได้แม้จะมีสิทธิ์เต็มก็ตาม (§11.4 "พนักงานโอนแทนไม่ได้")
 */
export async function requestTransferOtp(
  ctx: PointCtx,
  actor: MemberActor,
  _input: Record<string, never> = {},
): Promise<RequestTransferOtpResult> {
  void _input;
  const settings = await getSettingsChecked(ctx.tenantId);
  if (!settings.transferEnabled) throw pointError("ร้านนี้ยังไม่เปิดให้โอนแต้มระหว่างสมาชิก");
  if (actor.role !== "CUSTOMER" || !actor.customerId) {
    throw pointError("เฉพาะลูกค้าที่ล็อกอินด้วยบัญชีตัวเองเท่านั้นที่ขอรหัส OTP โอนแต้มได้ — พนักงานโอนแทนไม่ได้");
  }
  const customerId = actor.customerId;
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId },
    select: { phone: true },
  });
  if (!customer) throw pointError("ไม่พบบัญชีสมาชิกนี้ในร้านนี้");

  const key = otpKey(customerId);
  const recent = await prisma.platformAuthToken.count({
    where: { email: key, createdAt: { gte: new Date(Date.now() - OTP_RATE_WINDOW_MS) } },
  });
  if (recent >= OTP_RATE_MAX) throw pointError("ขอรหัส OTP ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");

  const code = otp6();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const row = await prisma.platformAuthToken.create({
    data: { email: key, tokenHash: sha256(`${key}:${code}`), expiresAt },
  });
  return {
    otpId: row.id,
    expiresAt,
    maskedTo: maskPhone(customer.phone),
    ...(previewOtp() ? { devOtp: code } : {}),
  };
}

async function getSettingsChecked(tenantId: string) {
  const found = await prisma.pointSettings.findUnique({ where: { tenantId } });
  if (found) return found;
  return prisma.pointSettings.create({ data: { tenantId } });
}

/** ยืนยัน OTP ล่าสุดที่ยังไม่ถูกใช้ของ `customerId` — ถูก+ทัน+ตรง → ตั้ง usedAt แล้วคืน true */
async function verifyTransferOtp(customerId: string, code: string): Promise<boolean> {
  const key = otpKey(customerId);
  const tok = await prisma.platformAuthToken.findFirst({
    where: { email: key, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!tok) throw pointError("ไม่มีรหัส OTP ที่รอการยืนยัน หรือรหัสถูกใช้ไปแล้ว — ขอรหัสใหม่อีกครั้ง");
  if (tok.expiresAt < new Date()) throw pointError("รหัส OTP หมดอายุแล้ว — ขอรหัสใหม่อีกครั้ง");
  if (!safeEqualHex(tok.tokenHash, sha256(`${key}:${code}`))) throw pointError("รหัส OTP ไม่ถูกต้อง");
  await prisma.platformAuthToken.update({ where: { id: tok.id }, data: { usedAt: new Date() } });
  return true;
}

export type TransferPointsInput = {
  fromCustomerId: string;
  toCustomerId: string;
  points: number;
  otp: string;
  idempotencyKey: string;
};

export type TransferPointsResult = { transferId: string; feePoints: number; balanceFrom: number; balanceTo: number };

/**
 * โอนแต้มจาก `fromCustomerId` ไป `toCustomerId` — ผู้รับได้ล็อตตาม `expiresAt` เดิมของล็อตต้นทาง
 * ทีละล็อต (ไม่ต่ออายุ) ตาม §11.4 "โอน: ล็อตของผู้รับ = expiresAt เดิมของผู้ให้"
 */
export async function transferPoints(
  ctx: PointCtx,
  actor: MemberActor,
  input: TransferPointsInput,
): Promise<TransferPointsResult> {
  // idempotency ก่อนสิ่งอื่นใด — เรียกซ้ำด้วยคีย์เดิมต้องคืนผลเดิมเสมอ แม้ OTP รอบนั้นจะถูก "ใช้" ไปแล้ว
  const existingOut = await prisma.pointLedger.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: `${input.idempotencyKey}:out` } },
  });
  if (existingOut) {
    const existingTransfer = await prisma.pointTransfer.findFirst({ where: { ledgerOutId: existingOut.id } });
    if (existingTransfer) {
      return {
        transferId: existingTransfer.id,
        feePoints: existingTransfer.feePoints,
        balanceFrom: await balanceIn(prisma, ctx.systemId, input.fromCustomerId),
        balanceTo: await balanceIn(prisma, ctx.systemId, input.toCustomerId),
      };
    }
  }

  const settings = await getSettingsChecked(ctx.tenantId);
  if (!settings.transferEnabled) throw pointError("ร้านนี้ยังไม่เปิดให้โอนแต้มระหว่างสมาชิก");

  if (actor.role !== "CUSTOMER" || actor.customerId !== input.fromCustomerId) {
    throw pointError("โอนแต้มได้เฉพาะเจ้าของบัญชีเท่านั้น — พนักงานโอนแทนไม่ได้ และลูกค้าคนอื่นสวมสิทธิ์ไม่ได้");
  }
  if (input.fromCustomerId === input.toCustomerId) {
    throw pointError("โอนแต้มให้ตัวเองไม่ได้ — เลือกสมาชิกอีกคนที่จะโอนให้");
  }

  const [fromCustomer, toCustomer] = await Promise.all([
    prisma.customer.findFirst({ where: { id: input.fromCustomerId, tenantId: ctx.tenantId }, select: { id: true, memberSystemId: true, status: true } }),
    prisma.customer.findFirst({ where: { id: input.toCustomerId, tenantId: ctx.tenantId }, select: { id: true, memberSystemId: true, status: true } }),
  ]);
  if (!fromCustomer) throw pointError("ไม่พบบัญชีสมาชิกผู้โอนในร้านนี้");
  if (!toCustomer) throw pointError("ไม่พบสมาชิกปลายทาง — ตรวจสอบว่าเลือกสมาชิกถูกคนแล้ว");
  if (toCustomer.status !== "ACTIVE") throw pointError("สมาชิกปลายทางไม่ได้ใช้งานอยู่ — โอนแต้มให้ไม่ได้");
  if (!fromCustomer.memberSystemId || fromCustomer.memberSystemId !== toCustomer.memberSystemId) {
    throw pointError("โอนแต้มได้เฉพาะสมาชิกในระบบสมาชิกเดียวกันเท่านั้น");
  }

  await verifyTransferOtp(input.fromCustomerId, input.otp);

  if (!Number.isInteger(input.points) || input.points <= 0) {
    throw pointError("จำนวนแต้มที่จะโอนต้องเป็นจำนวนเต็มมากกว่า 0");
  }

  const now = new Date();
  const balance = await balanceIn(prisma, ctx.systemId, input.fromCustomerId);
  if (balance < input.points) {
    throw pointError(`แต้มคงเหลือไม่พอสำหรับการโอน (มี ${balance} แต้ม ต้องการโอน ${input.points} แต้ม)`);
  }

  if (settings.transferMonthlyCap !== null) {
    const monthStart = bkkMonthStart(now);
    const monthAgg = await prisma.pointTransfer.aggregate({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, fromCustomerId: input.fromCustomerId, createdAt: { gte: monthStart } },
      _sum: { points: true },
    });
    const usedThisMonth = monthAgg._sum.points ?? 0;
    if (usedThisMonth + input.points > settings.transferMonthlyCap) {
      throw pointError(`โอนแต้มเดือนนี้ครบเพดาน ${settings.transferMonthlyCap} แต้มแล้ว (โอนไปแล้ว ${usedThisMonth} แต้ม)`);
    }
  }

  return withTx(prisma, async (tx: Client) => {
    const lots = await tx.pointLot.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, customerId: input.fromCustomerId, expiredAt: null, remaining: { gt: 0 } },
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { earnedAt: "asc" }],
    });
    const used: { lotId: string; points: number; expiresAt: Date | null }[] = [];
    let left = input.points;
    for (const lot of lots) {
      if (left <= 0) break;
      const take = Math.min(lot.remaining, left);
      used.push({ lotId: lot.id, points: take, expiresAt: lot.expiresAt });
      left -= take;
    }

    const ledOut = await writeLedger(tx, {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      customerId: input.fromCustomerId,
      delta: -input.points,
      type: "TRANSFER",
      reason: "โอนแต้มให้สมาชิกอื่น",
      idempotencyKey: `${input.idempotencyKey}:out`,
      data: { lots: used.map((u) => ({ lotId: u.lotId, points: u.points })), lotIds: used.map((u) => u.lotId), toCustomerId: input.toCustomerId },
    });
    for (const u of used) {
      await tx.pointLot.update({ where: { id: u.lotId }, data: { remaining: { decrement: u.points } } });
    }

    const ledIn = await writeLedger(tx, {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      customerId: input.toCustomerId,
      delta: input.points,
      type: "TRANSFER",
      reason: "รับโอนแต้มจากสมาชิกอื่น",
      idempotencyKey: `${input.idempotencyKey}:in`,
      data: { fromCustomerId: input.fromCustomerId },
    });
    // ล็อตของผู้รับ = expiresAt เดิมของแต่ละล็อตต้นทาง ทีละล็อต (ไม่รวม ไม่ต่ออายุ — §11.4)
    for (const u of used) {
      await tx.pointLot.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          customerId: input.toCustomerId,
          ledgerId: ledIn.ledgerId,
          points: u.points,
          remaining: u.points,
          earnedAt: now,
          expiresAt: u.expiresAt,
        },
      });
    }

    const transfer = await tx.pointTransfer.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        fromCustomerId: input.fromCustomerId,
        toCustomerId: input.toCustomerId,
        points: input.points,
        feePoints: 0,
        otpVerifiedAt: now,
        ledgerOutId: ledOut.ledgerId,
        ledgerInId: ledIn.ledgerId,
      },
    });

    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "point.transferred",
      idempotencyKey: `point.transferred:${transfer.id}`,
      systemId: ctx.systemId,
      payload: { fromCustomerId: input.fromCustomerId, toCustomerId: input.toCustomerId, points: input.points },
    });

    return {
      transferId: transfer.id,
      feePoints: 0,
      balanceFrom: ledOut.balance,
      balanceTo: ledIn.balance,
    };
  });
}

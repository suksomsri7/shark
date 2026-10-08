// HR H0.5 ▸ PIN พนักงาน — ไฟล์เดียวที่อ่าน/เขียน "pinHash" / "pinCode" (fitness-hr F16.5 · ข้อสอบ qc-hr-h0.5 S8.1)
//
// เก็บอะไร: pinHash = hex HMAC-SHA256(key = HR_PIN_PEPPER (UTF-8), msg = `${tenantId}\u001f${pin}`) · pinSetAt = เวลาที่ตั้ง
//   · pepper เป็นความลับฝั่งเซิร์ฟเวอร์ (Vercel env) ⇒ ฐานข้อมูลหลุดอย่างเดียวไล่เดา PIN 4–6 หลักไม่ได้
//   · tenantId อยู่ในข้อความ ⇒ PIN เดียวกันคนละร้าน = hash ต่างกัน (เทียบข้ามร้านไม่ได้)
//   · POS (P1.15) / สคริปต์ backfill ต้องได้ค่าเดียวกัน ⇒ ใช้ hashPin() ตัวนี้เท่านั้น
//   · เปลี่ยน pepper = PIN ทุกคนใช้ไม่ได้ทันที (ต้องตั้งใหม่ทั้งร้าน) — ยังไม่มีเครื่องมือหมุน pepper (H0.5 Q1)
// ไม่ซ้ำ "ทั้งร้าน" (ข้ามทุกระบบ HR) ในหมู่คนที่ยังทำงาน = partial unique "HrEmployee_tenantId_pinHash_active_key"
//   (migration 20261201000000_hr_pin_hash) — ดัชนีเป็นผู้ตัดสินตัวเดียว: ไม่มีการ select ตรวจซ้ำก่อนเขียน (แข่งกันตั้งพร้อมกัน = ชนะ 1)
//   ชน = P2002 ⇒ ข้อความกลาง D8 "PIN นี้ใช้ไม่ได้ กรุณาเลือก PIN อื่น" (ห้ามบอกว่าใครถือ PIN นั้น — HF-HR-0)
// pepper อ่านจาก process.env "ตอนเรียก" ไม่ import "@/lib/env" ที่หัวไฟล์: ไฟล์นี้ถูกดึงต่อจาก hr/service ⇒ ai/tools
//   ⇒ fitness (รันแบบไม่มี env) — env.ts parse ทั้ง schema ตอน import จะล้มทั้งด่าน (reference_shark_precommit_fitness_no_env)
//   กติกาเดียวกับ env.ts (HR_PIN_PEPPER: z.string().min(32).optional()) — สั้นกว่า 32 / ไม่มี = ยังไม่ได้ตั้งค่า
// ทางเก่า (HQ4 · ช่วง rollout เท่านั้น): แถวที่ยังมีแต่ pinCode ตัวเปล่า ยืนยันได้แล้วอัปเกรดเป็น hash ในที่ (pinCode = null) —
//   หลัง backfill (scripts/hr-backfill-pin-hash.mts --apply) บน prod ไม่เหลือแถวแบบนี้ ⇒ ลบทางเก่าได้พร้อมคอลัมน์ pinCode (RUN ถัดไป)
// 🔴 ห้ามคืน/พิมพ์/บันทึก PIN · hash · pepper ในผลลัพธ์ · log · audit · event — คืนแค่ id และข้อความไทยคงที่
// ไม่ import "server-only" (ไม่ได้ติดตั้ง · ข้อสอบ import ไฟล์นี้ใต้ tsx — H0.5 F-3) — ไฟล์นี้ไม่มีผู้เรียกฝั่ง client
import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { logOps } from "@/lib/core/ops";

export type PinCtx = { tenantId: string; systemId: string };

/** ข้อความคงที่ (ห้ามต่อ e.message ของระบบ) */
export const PIN_TEXT = {
  format: "PIN ต้องเป็นตัวเลข 4-6 หลัก",
  notFound: "ไม่พบพนักงาน",
  taken: "PIN นี้ใช้ไม่ได้ กรุณาเลือก PIN อื่น",
  wrong: "PIN ไม่ถูกต้อง",
  notConfigured: "ระบบยังไม่ได้ตั้งค่าความปลอดภัยของ PIN — แจ้งผู้ดูแลระบบ",
} as const;
const noPinText = (name: string) => `${name} ยังไม่มี PIN — ให้เจ้าของตั้งที่หน้าพนักงาน`;
const limitedText = (sec: number | undefined) => `ลองใหม่ในอีก ${sec ?? 60} วินาที`;

const PIN_RE = /^\d{4,6}$/;
/** ถังจำกัดของ verifyPin ต่อร้าน (เพิ่มจากตัวจำกัดของผู้เรียก เช่น kiosk 5/60 s ต่อคน · 60/60 s ต่อระบบ) */
export const VERIFY_PIN_LIMIT = { limit: 120, windowMs: 60_000 } as const;

/** ไม่ได้ตั้ง HR_PIN_PEPPER — ผู้ใช้เห็นแค่ข้อความคงที่ ไม่เห็น stack */
export class PinNotConfiguredError extends Error {
  constructor() {
    super(PIN_TEXT.notConfigured);
    this.name = "PinNotConfiguredError";
  }
}

function pepper(): string {
  const p = process.env.HR_PIN_PEPPER;
  if (typeof p !== "string" || p.length < 32) throw new PinNotConfiguredError();
  return p;
}

/** hex HMAC-SHA256(key = HR_PIN_PEPPER, msg = tenantId␟pin) — pin ต้องผ่าน ^\d{4,6}$ มาแล้ว · ไม่มี pepper = PinNotConfiguredError */
export function hashPin(tenantId: string, pin: string): string {
  return createHmac("sha256", pepper()).update(`${tenantId}\u001f${pin}`).digest("hex");
}

/** ค่าหลอกยาวเท่า hash จริง (32 ไบต์) — เทียบทิ้งตอนไม่เจอแถว ให้ทางเจอ/ไม่เจอทำงานเท่ากัน */
const DUMMY_HASH = Buffer.alloc(32, 0);
const HEX64 = /^[0-9a-f]{64}$/;
/** เทียบ hash แบบเวลาคงที่ · stored ว่าง/รูปแบบผิด = เทียบกับ dummy แล้วคืน false */
function hashEquals(stored: string | null | undefined, given: string): boolean {
  const g = Buffer.from(given, "hex");
  if (!stored || !HEX64.test(stored) || g.length !== DUMMY_HASH.length) {
    timingSafeEqual(DUMMY_HASH, g.length === DUMMY_HASH.length ? g : DUMMY_HASH);
    return false;
  }
  return timingSafeEqual(Buffer.from(stored, "hex"), g);
}

/** มี PIN หรือยัง — ระหว่าง rollout แถวที่ยังไม่ backfill (มีแต่ตัวเปล่า) ก็นับว่ามี */
export function hasPin(row: { pinHash: string | null; pinCode: string | null }): boolean {
  return !!row.pinHash || !!row.pinCode;
}
/** ช่องที่ hasPin() ต้องใช้ — ให้ไฟล์อื่น spread ใส่ select โดยไม่ต้องเขียนชื่อคอลัมน์เอง (F16.5) */
export const PIN_SELECT = { pinHash: true, pinCode: true } as const;

/** PIN จากข้อมูลสร้างพนักงาน — `pin` (ชื่อใหม่) หรือ `pinCode` (ชื่อเก่า เลิกใช้ · ยังรับเพื่อผู้เรียกเดิม) · ทั้งสองทางผ่าน setPin = hash เสมอ */
export type PinInput = {
  pin?: string | null;
  /** @deprecated ใช้ `pin` — ชื่อเก่าก่อน H0.5 (ค่านี้ถูก hash ผ่าน setPin ไม่เคยเก็บตัวเปล่า) */
  pinCode?: string | null;
};
export function pinOfInput(input: PinInput): string {
  return String(input.pin ?? input.pinCode ?? "").trim();
}

function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === "P2002";
  const x = e as { code?: unknown; cause?: { code?: unknown } } | null;
  return !!x && (x.code === "P2002" || x.code === "23505" || x.cause?.code === "23505");
}

/**
 * ตั้ง / ล้าง PIN (ว่าง = ล้าง ⇒ ปิดการลงเวลาเองของคนนี้)
 * พนักงานต้องเป็นของระบบ HR นี้ (ctx.systemId) และยังทำงานอยู่ — ไม่ใช่ = "ไม่พบพนักงาน"
 * เขียน pinHash + pinSetAt + pinCode = null ในคำสั่งเดียว (นับแถว) · ชนดัชนี = D8 · audit hr.pin.set / hr.pin.clear (ไม่มี PIN/hash)
 */
export async function setPin(
  ctx: PinCtx,
  employeeId: string,
  pin: string,
  opts: { actorId?: string | null } = {},
): Promise<{ ok: boolean; reason?: string }> {
  const clean = String(pin ?? "").trim();
  if (clean && !PIN_RE.test(clean)) return { ok: false, reason: PIN_TEXT.format };
  let hash: string | null = null;
  if (clean) {
    try {
      hash = hashPin(ctx.tenantId, clean);
    } catch (e) {
      if (e instanceof PinNotConfiguredError) return { ok: false, reason: PIN_TEXT.notConfigured };
      throw e;
    }
  }
  let count = 0;
  try {
    const r = await tenantDb(ctx).hrEmployee.updateMany({
      where: { id: employeeId, active: true },
      data: { pinHash: hash, pinSetAt: hash ? new Date() : null, pinCode: null },
    });
    count = r.count;
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: PIN_TEXT.taken };
    throw e;
  }
  if (count !== 1) return { ok: false, reason: PIN_TEXT.notFound };
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: opts.actorId ?? null,
    action: hash ? "hr.pin.set" : "hr.pin.clear",
    targetType: "HrEmployee",
    targetId: employeeId,
    after: { systemId: ctx.systemId, pinSet: !!hash },
  });
  return { ok: true };
}

export type VerifyPinInput = {
  tenantId: string;
  pin: string;
  /** รับไว้ตามสัญญา C-8 แต่ยังไม่ใช้จนถึง H1.1 (ผูกพนักงานกับสาขา) */
  unitId?: string | null;
  /** ตัวกรองเท่านั้น — ระบุ = หาเฉพาะในระบบ HR นี้ (H0.5 Q2) */
  systemId?: string | null;
};
export type VerifyPinOk = { ok: true; employeeId: string; systemId: string; userId: string | null };
export type VerifyPinFail = { ok: false; reason: string };
export type VerifyPinResult = VerifyPinOk | VerifyPinFail;

/**
 * contract C-8 — "PIN นี้เป็นของพนักงานคนไหนในร้าน" (POS P1.15 เรียกผ่าน hr/index.ts)
 * คืน id เท่านั้น (ไม่มีชื่อ/ตำแหน่ง/hash) · ผิด / รูปแบบผิด / คนพ้นสภาพ / อีกร้าน = ข้อความเดียว "PIN ไม่ถูกต้อง"
 * จำกัด 120 ครั้ง/60 วินาที ต่อร้าน (ถัง hr-verifypin:<tenantId> · ตัวจำกัดล่ม = ปล่อยผ่าน เหมือน H0.3)
 * ทางเก่า: ไม่เจอด้วย hash แต่มีแถว pinCode ตรง **แถวเดียว** ในร้าน ⇒ ยืนยัน + อัปเกรดเป็น hash · ตรงหลายแถว = ไม่ยืนยัน (ต้องตั้งใหม่)
 */
export async function verifyPin(input: VerifyPinInput): Promise<VerifyPinResult> {
  const wrong: VerifyPinFail = { ok: false, reason: PIN_TEXT.wrong };
  const tenantId = String(input?.tenantId ?? "");
  if (!tenantId) return wrong;
  const gate = await checkRateLimitDb(`hr-verifypin:${tenantId}`, VERIFY_PIN_LIMIT);
  if (!gate.ok) return { ok: false, reason: limitedText(gate.retryAfterSec) };
  const pin = String(input?.pin ?? "").trim();
  if (!PIN_RE.test(pin)) {
    hashEquals(null, DUMMY_HASH.toString("hex"));
    return wrong;
  }
  let hash: string;
  try {
    hash = hashPin(tenantId, pin);
  } catch (e) {
    if (e instanceof PinNotConfiguredError) return { ok: false, reason: PIN_TEXT.notConfigured };
    throw e;
  }

  // HrEmployee เป็น system-scoped ⇒ ไล่ระบบ HR ของร้านก่อน แล้ว query ผูก systemId (แบบ employeeOfUser — ห้าม prisma ดิบ · F5.1)
  const systems = await tenantDb({ tenantId }).appSystem.findMany({
    where: { tenantId, type: "HR", ...(input.systemId ? { id: input.systemId } : {}) },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  // คำสั่งเดียวต่อระบบ: แถวที่ hash ตรง หรือ (ทางเก่า) ตัวเปล่าตรง — ภาพเดียวกันของฐาน ⇒ ไม่พลาดตอนอีกคำขออัปเกรดแถวไปพร้อมกัน
  type Row = { id: string; systemId: string; linkedUserId: string | null; pinHash: string | null };
  const rows: Row[] = [];
  for (const s of systems) {
    rows.push(
      ...(await tenantDb({ tenantId, systemId: s.id }).hrEmployee.findMany({
        where: { active: true, OR: [{ pinHash: hash }, { pinCode: pin }] },
        select: { id: true, systemId: true, linkedUserId: true, pinHash: true },
        take: 3,
      })),
    );
  }
  // เทียบทุกแถวแบบเวลาคงที่ (ไม่มีแถว = เทียบกับ dummy หนึ่งครั้ง)
  let hit: Row | null = null;
  if (rows.length === 0) hashEquals(null, hash);
  for (const r of rows) if (hashEquals(r.pinHash, hash) && !hit) hit = r;
  if (hit) return { ok: true, employeeId: hit.id, systemId: hit.systemId, userId: hit.linkedUserId ?? null };

  // ── ทางเก่า (HQ4) ──
  const plain = rows.filter((r) => r.pinHash === null);
  if (plain.length !== 1) return wrong; // 0 = PIN ผิด · ≥2 = PIN ตัวเปล่าซ้ำในร้าน ⇒ ไม่ยืนยันใครเลย (backfill ล้างให้ตั้งใหม่)
  const one = plain[0]!;
  const db = tenantDb({ tenantId, systemId: one.systemId });
  try {
    const up = await db.hrEmployee.updateMany({
      where: { id: one.id, pinCode: pin, active: true },
      data: { pinHash: hash, pinSetAt: new Date(), pinCode: null },
    });
    if (up.count !== 1) {
      // อีกคำขอเพิ่งอัปเกรดแถวนี้ไปก่อน ⇒ ตรวจซ้ำด้วย hash (ไม่ใช่ปฏิเสธ)
      const again = await db.hrEmployee.findFirst({ where: { id: one.id, active: true, pinHash: hash }, select: { pinHash: true } });
      if (!again || !hashEquals(again.pinHash, hash)) return wrong;
    }
  } catch (e) {
    if (isUniqueViolation(e)) return wrong; // คนที่ยังทำงานอีกคนถือ PIN นี้เป็น hash แล้ว ⇒ ไม่ยืนยันแถวตัวเปล่า
    throw e;
  }
  return { ok: true, employeeId: one.id, systemId: one.systemId, userId: one.linkedUserId ?? null };
}

export type VerifyForEmployeeResult = { ok: true; employeeId: string; name: string } | { ok: false; reason: string };

/**
 * kiosk — พนักงานเลือกชื่อบนจอแล้วใส่ PIN (clockWithPin) · เทียบกับแถวของคนนั้นคนเดียว
 * ข้อความเดิมของ kiosk: ไม่พบ / "<ชื่อ> ยังไม่มี PIN — …" / "PIN ไม่ถูกต้อง"
 * ทางเก่า: แถวตัวเปล่าตรง ⇒ ยืนยัน + พยายามอัปเกรดในที่ · ชนดัชนี (อีกคนถือ PIN เดียวกันเป็น hash แล้ว) ⇒ ข้ามการอัปเกรดเงียบ ๆ
 *   (logOps WARN มีแต่ id) แต่ยังยืนยัน — ชื่อถูกเลือกบนจออยู่แล้ว (มติผู้คุมงาน H0.5 F-1(c)) · backfill ล้างแถวซ้ำแบบนี้ที่ขั้น 2 ของ rollout
 * ตัวจำกัดอยู่ที่ kioskClockAction (H0.3: 5/60 s ต่อคน · 60/60 s ต่อระบบ)
 */
export async function verifyPinForEmployee(ctx: PinCtx, employeeId: string, pin: string): Promise<VerifyForEmployeeResult> {
  const db = tenantDb(ctx);
  const row = await db.hrEmployee.findFirst({
    where: { id: employeeId, active: true },
    select: { id: true, name: true, pinHash: true, pinCode: true },
  });
  if (!row) return { ok: false, reason: PIN_TEXT.notFound };
  if (!hasPin(row)) return { ok: false, reason: noPinText(row.name) };
  const clean = String(pin ?? "").trim();
  let given: string;
  let legacy: string | null = null;
  try {
    given = hashPin(ctx.tenantId, PIN_RE.test(clean) ? clean : "");
    if (!row.pinHash && row.pinCode) legacy = hashPin(ctx.tenantId, row.pinCode);
  } catch (e) {
    if (e instanceof PinNotConfiguredError) return { ok: false, reason: PIN_TEXT.notConfigured };
    throw e;
  }
  const match = hashEquals(row.pinHash ?? legacy, given) && PIN_RE.test(clean);
  if (!match) return { ok: false, reason: PIN_TEXT.wrong };
  if (legacy) {
    try {
      await db.hrEmployee.updateMany({
        where: { id: row.id, pinCode: row.pinCode, active: true },
        data: { pinHash: given, pinSetAt: new Date(), pinCode: null },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      void logOps("WARN", "hr-pin", "PIN ตัวเปล่าซ้ำกับคนที่ตั้งเป็น hash แล้ว — ข้ามการอัปเกรด (backfill จะล้างให้ตั้งใหม่)", {
        tenantId: ctx.tenantId,
        detail: `systemId=${ctx.systemId} employeeId=${row.id}`,
      });
    }
  }
  return { ok: true, employeeId: row.id, name: row.name };
}

/**
 * กลับมาทำงาน (active = true) โดยไม่ล้มเพราะ PIN — คนพ้นสภาพไม่อยู่ในดัชนี ระหว่างนั้นคนอื่นอาจตั้ง PIN เดียวกันไปแล้ว
 * ลองเปิดตรง ๆ ก่อน · ชนดัชนี (P2002) ⇒ ลองใหม่ 1 ครั้งพร้อมล้าง PIN ของคนที่กลับมา (pinCleared) + audit hr.pin.clear เหตุผล REACTIVATE_DUPLICATE
 * แต่ละครั้งเป็นคำสั่งเดียว (atomic ในตัว) — ไม่ห่อ interactive tx เพราะ P2002 ทำให้ tx ทั้งก้อนใช้ต่อไม่ได้ (ต้องเริ่มคำสั่งใหม่อยู่ดี)
 */
export async function activateEmployeeKeepingPinUnique(
  ctx: PinCtx,
  employeeId: string,
  opts: { actorId?: string | null } = {},
): Promise<{ count: number; pinCleared: boolean }> {
  const db = tenantDb(ctx);
  try {
    const r = await db.hrEmployee.updateMany({ where: { id: employeeId }, data: { active: true } });
    return { count: r.count, pinCleared: false };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }
  const r = await db.hrEmployee.updateMany({ where: { id: employeeId }, data: { active: true, pinHash: null, pinSetAt: null } });
  if (r.count === 1) {
    await writeAudit({
      tenantId: ctx.tenantId,
      actorId: opts.actorId ?? null,
      action: "hr.pin.clear",
      targetType: "HrEmployee",
      targetId: employeeId,
      after: { systemId: ctx.systemId, pinSet: false, reason: "REACTIVATE_DUPLICATE" },
    });
  }
  return { count: r.count, pinCleared: r.count === 1 };
}

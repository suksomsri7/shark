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
import { checkRateLimitDb, refundRateLimitDb } from "@/lib/core/rate-limit-db"; // HR H0.5 r4 ▸ R4.1 นับก่อน + คืนช่อง (แทน peek ของ r3) ◂
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
// HR H0.5 r3 ▸ R3.1 ถังต่อผู้เรียก (hr-verifypin:<tenantId>:<callerKey>) — ผิด 10 ครั้ง / 10 นาที = ล็อกผู้เรียกนั้น (hunt F1/F3)
//   ทั้งสองถังนับ "เฉพาะครั้งที่ผิด" — ยืนยันถูกไม่กินโควตา (คนใส่ PIN ถูกทั้งวันไม่โดนล็อก · ขยะของเครื่องหนึ่งไม่ทำให้ PIN ถูกของทั้งร้านใช้ไม่ได้) ◂
export const VERIFY_PIN_CALLER_LIMIT = { limit: 10, windowMs: 10 * 60_000 } as const;
// HR H0.5 r4 ▸ R4.2 รูปแบบ callerKey (หลัง trim) — ไม่ตรง = "PIN ไม่ถูกต้อง" ทันที ไม่แตะ DB (hunt G2: NUL ⇒ ถังล่ม fail-open · คีย์ยาวมากถูกเก็บทั้งก้อน) ◂
const CALLER_KEY_RE = /^[A-Za-z0-9:_.-]{1,128}$/;

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
  /**
   * HR H0.5 r3 ▸ R3.1 ผู้เรียก (บังคับ) — ถังจำกัดต่อผู้เรียก: user id เมื่อมีผู้ใช้ · ไม่มีผู้ใช้ = `unit:<unitId>` (หรือ id เครื่อง)
   * ไม่ส่ง / ว่าง = "PIN ไม่ถูกต้อง" ทันที ไม่แตะ DB ไม่สร้างถัง ◂
   */
  callerKey: string;
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
 * HR H0.5 r4 ▸ R4.1–R4.4 ตัวจำกัด 2 ถัง "นับก่อนค้น แล้วคืนช่อง" (ตัวจำกัดล่ม = ปล่อยผ่าน เหมือน H0.3):
 *   ผู้เรียก hr-verifypin:<tenantId>:<callerKey> 10 / 10 นาที · ร้าน hr-verifypin:<tenantId> 120 / 60 s
 *   1) callerKey ว่าง / ไม่ตรง CALLER_KEY_RE ⇒ ผิดทันที (ไม่แตะ DB ไม่มีถัง ไม่มี OpsEvent ไม่มี audit)
 *   2) นับถังผู้เรียกก่อน แล้วถังร้าน (ลำดับตายตัว · แต่ละถัง = คำสั่ง atomic เดียว) — ถังใดเกินเพดาน ⇒ คืนช่องที่เพิ่งนับ
 *      (ทุกการคืน = count − 1 เมื่อ count > 0 ในหน้าต่างเดิม · HR H0.5 r5 ▸ R1 ไม่มีเงื่อนไขเพดานแล้ว ◂) แล้วตอบ "ลองใหม่ในอีก N วินาที"
 *      ⇒ ยิงพร้อมกันกี่ครั้งก็ผ่านถึงการเทียบได้ไม่เกินเพดาน (hunt G1) และครั้งที่ถูกปฏิเสธไม่กินโควตา
 *   3) ผ่านทั้งสองถังเท่านั้นจึงค้น · ถูก / ระบบไม่มี pepper ⇒ คืนช่องทั้งสองถัง (count > 0) ⇒ ทั้งสองถังนับเฉพาะครั้งที่ผิด
 *   4) ครั้งที่ผิดที่ถังผู้เรียกนับได้เท่าเพดานพอดี (10) และยังไม่มี hr.pin.locked ของ callerKey นี้ตั้งแต่ต้นหน้าต่าง ⇒ audit 1 แถว
 *      (ตรวจซ้ำเพราะการคืนช่องทำให้ค่า 10 เกิดซ้ำได้ในหน้าต่างเดียว)
 *   5) ครั้งที่ผิดที่ถังร้านนับได้ 120 พอดี (ซ้ำแบบเดียวกัน) ⇒ audit hr.pin.tenant_limited 1 แถว + OpsEvent WARN ของร้าน 1 แถว
 *      (ไม่มี callerKey / PIN / id พนักงาน) · ครั้งที่ถูกปฏิเสธไม่เขียนอะไร
 *   ช่องว่างที่รู้: ระหว่าง burst ช่องของคำขอที่ถูกยังค้างอยู่จนคืน ⇒ คำขอผิดที่มาพร้อมกันอาจถูกปฏิเสธเร็วกว่าที่ควร (เข้มขึ้น ไม่รั่ว) ◂
 * ลำดับ: หาด้วย hash ก่อน · ไม่เจอเท่านั้นจึงลองทางเก่า (HR H0.5 r3 ▸ R3.5 ครั้งละ 1 คำสั่งครอบทุกระบบ HR ของร้าน ไม่ใช่ 1 คำสั่งต่อระบบ ◂)
 * ทางเก่า: แถว pinCode ตรง (ยังไม่มี hash) **แถวเดียว** ในร้าน ⇒ ยืนยัน + อัปเกรดเป็น hash · ตรงหลายแถว = ไม่ยืนยัน (ต้องตั้งใหม่)
 * เฉพาะระบบ HR ที่ active (≤ 50) — ระบบที่ปิดแล้ว พนักงานในนั้นยืนยันระดับร้านไม่ได้ (kiosk ยังเป็นต่อระบบ ไม่กระทบ)
 */
export async function verifyPin(input: VerifyPinInput): Promise<VerifyPinResult> {
  const wrong: VerifyPinFail = { ok: false, reason: PIN_TEXT.wrong };
  const tenantId = String(input?.tenantId ?? "");
  if (!tenantId) return wrong;
  // HR H0.5 r4 ▸ R4.2 ผู้เรียกต้องมีและตรงรูปแบบ — ไม่ตรง = ผิดทันที ไม่นับ ไม่สร้างแถวถัง ไม่มี OpsEvent/audit ◂
  const callerKey = String(input?.callerKey ?? "").trim();
  if (!CALLER_KEY_RE.test(callerKey)) return wrong;
  const tenantKey = `hr-verifypin:${tenantId}`;
  const callerBucket = `${tenantKey}:${callerKey}`;
  // HR H0.5 r4 ▸ R4.1 นับก่อนค้น: ผู้เรียกก่อน แล้วร้าน · ถังที่ปฏิเสธคืนช่องของตัวเอง + คืนช่องผู้เรียกที่ผ่านไปแล้ว ◂
  // HR H0.5 r5 ▸ R1 (ผู้ตรวจ) คืนทุกครั้งแบบไม่มีเงื่อนไขเพดาน (count > 0 เท่านั้น) — เดิมใช้ count > เพดาน ทำให้เกิด "ช่องผี":
  //   ผู้เรียกผิดค้าง 9 · S (ถูก) นับ → 10 · R นับ → 11 ถูกปฏิเสธ · S คืน 11→10 · R คืนไม่ได้ (10 > 10 เป็นเท็จ)
  //   ⇒ ล็อกทั้งหน้าต่างทั้งที่ผิดแค่ 9 และไม่มี hr.pin.locked (ถังร้านเหมือนกัน ⇒ เต็มเงียบ)
  //   แต่ละครั้งที่นับได้คืนครั้งเดียวพอดี + ผูกกับ windowStart เดิม ⇒ count ไม่มีทางต่ำกว่าช่องของครั้งที่ผิดที่ยังค้างจริง ◂
  const vC = await checkRateLimitDb(callerBucket, VERIFY_PIN_CALLER_LIMIT);
  if (!vC.ok) {
    await refundRateLimitDb(callerBucket, vC.windowStart);
    return { ok: false, reason: limitedText(vC.retryAfterSec) };
  }
  const vT = await checkRateLimitDb(tenantKey, VERIFY_PIN_LIMIT);
  if (!vT.ok) {
    await Promise.all([
      refundRateLimitDb(tenantKey, vT.windowStart),
      refundRateLimitDb(callerBucket, vC.windowStart),
    ]);
    return { ok: false, reason: limitedText(vT.retryAfterSec) };
  }
  // HR H0.5 r4 ▸ R4.1 ถูก / ไม่มี pepper ⇒ คืนช่องทั้งสองถัง (count > 0) — ทั้งสองถังจึงเหลือแต่ครั้งที่ผิด ◂
  const release = async (): Promise<void> => {
    await Promise.all([refundRateLimitDb(callerBucket, vC.windowStart), refundRateLimitDb(tenantKey, vT.windowStart)]);
  };
  const db = tenantDb({ tenantId });
  // HR H0.5 r4 ▸ R4.3/R4.4 มีแถว audit นี้ตั้งแต่ต้นหน้าต่างแล้วหรือยัง (ค้นเฉพาะตอนนับได้เท่าเพดานพอดี) ◂
  const auditedSince = async (action: string, since: Date | undefined, callerOnly: string | null): Promise<boolean> =>
    !!(await db.auditLog.findFirst({
      where: {
        tenantId,
        action,
        ...(since ? { createdAt: { gte: since } } : {}),
        ...(callerOnly ? { after: { path: ["callerKey"], equals: callerOnly } } : {}),
      },
      select: { id: true },
    }));
  // ครั้งที่ผิด: ช่องที่นับไว้ค้างอยู่ (ไม่คืน) · ถึงเพดานพอดี ⇒ audit (ครั้งเดียวต่อหน้าต่าง) — payload = ตัวเลข (+ callerKey เฉพาะ locked) ไม่มี PIN / hash / id พนักงาน
  const failed = async (): Promise<VerifyPinFail> => {
    if (vC.count === VERIFY_PIN_CALLER_LIMIT.limit && !(await auditedSince("hr.pin.locked", vC.windowStart, callerKey))) {
      await writeAudit({
        tenantId,
        actorType: "SYSTEM",
        actorId: null,
        action: "hr.pin.locked",
        targetType: "HrVerifyPinCaller",
        after: { callerKey, count: vC.count, windowSec: VERIFY_PIN_CALLER_LIMIT.windowMs / 1000 },
      });
    }
    // HR H0.5 r4 ▸ R4.4 ถังร้านเต็มครั้งแรกในหน้าต่าง ⇒ audit + OpsEvent WARN ของร้าน (ไม่มีผู้เรียก/พนักงาน) · แจ้งเจ้าของยังเป็นหนี้ ◂
    if (vT.count === VERIFY_PIN_LIMIT.limit && !(await auditedSince("hr.pin.tenant_limited", vT.windowStart, null))) {
      const windowSec = VERIFY_PIN_LIMIT.windowMs / 1000;
      await writeAudit({
        tenantId,
        actorType: "SYSTEM",
        actorId: null,
        action: "hr.pin.tenant_limited",
        targetType: "HrVerifyPinTenant",
        after: { count: vT.count, windowSec },
      });
      await logOps("WARN", "hr-verifypin", `ยืนยัน PIN ผิดครบ ${vT.count} ครั้งใน ${windowSec} วินาที — พักการยืนยัน PIN ของร้านชั่วคราว`, { tenantId }).catch(() => {});
    }
    return wrong;
  };
  const pin = String(input?.pin ?? "").trim();
  if (!PIN_RE.test(pin)) {
    hashEquals(null, DUMMY_HASH.toString("hex"));
    return failed();
  }
  let hash: string;
  try {
    hash = hashPin(tenantId, pin);
  } catch (e) {
    if (e instanceof PinNotConfiguredError) {
      await release(); // HR H0.5 r4 ▸ R4.1 ระบบยังไม่พร้อม ไม่ใช่ความผิดของผู้เรียก ⇒ คืนช่องทั้งสองถัง ◂
      return { ok: false, reason: PIN_TEXT.notConfigured };
    }
    await release();
    throw e;
  }

  // HrEmployee เป็น system-scoped ⇒ ไล่ระบบ HR ของร้านก่อน (แบบ employeeOfUser — ห้าม prisma ดิบ · F5.1)
  // เฉพาะระบบ HR ที่ยังเปิดอยู่ (active) · สูงสุด 50 ระบบ (แบบ payroll.ts payrollEmployeeOfUser) — ระบบที่ปิดแล้ว = พนักงานในนั้นยืนยันระดับร้านไม่ได้
  const systems = await db.appSystem.findMany({
    where: { tenantId, type: "HR", active: true, ...(input.systemId ? { id: input.systemId } : {}) },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 50,
  });
  type Row = { id: string; systemId: string; linkedUserId: string | null; pinHash: string | null };
  // HR H0.5 r3 ▸ R3.5 (hunt F5) ครั้งละ 1 คำสั่งครอบทุกระบบ — tenantDb ผูก systemId ได้ทีละค่า (system-scoped) จึงเขียน SQL ผ่าน
  //   tenantDb(...).$queryRaw (แบบ payroll.ts) และใส่ขอบเขตเองครบ: "tenantId" = ร้านนี้ AND "systemId" IN (ระบบ HR ของร้านนี้ที่อ่านมาข้างบน) ◂
  const sysIds = systems.map((s) => s.id);
  const findRows = async (cond: Prisma.Sql, limit: number): Promise<Row[]> =>
    sysIds.length === 0
      ? []
      : db.$queryRaw<Row[]>`
          SELECT "id", "systemId", "linkedUserId", "pinHash" FROM "HrEmployee"
          WHERE "tenantId" = ${tenantId} AND "systemId" IN (${Prisma.join(sysIds)}) AND "active" = true AND ${cond}
          LIMIT ${limit}`;
  // 1) hash ก่อน — partial unique ⇒ คนที่ยังทำงานถือ hash นี้ได้อย่างมากคนเดียวทั้งร้าน ⇒ เจอแล้วจบ (แถวตัวเปล่ากี่แถวก็บังไม่ได้)
  const byHash = async (): Promise<Row | null> => {
    const r = (await findRows(Prisma.sql`"pinHash" = ${hash}`, 1))[0];
    return r && hashEquals(r.pinHash, hash) ? r : null;
  };
  // HR H0.5 r4 ▸ R4.1 ถูก ⇒ คืนช่องทั้งสองถังก่อนตอบ ◂
  const okOf = async (r: Row): Promise<VerifyPinOk> => {
    await release();
    return { ok: true, employeeId: r.id, systemId: r.systemId, userId: r.linkedUserId ?? null };
  };
  const hit = await byHash();
  if (hit) return okOf(hit);

  // ── ทางเก่า (HQ4) ── ไม่เจอด้วย hash เท่านั้น: แถวตัวเปล่า (ยังไม่มี hash) ที่ตรง — อ่านแค่ 2 แถว (≥ 2 = ไม่ยืนยันอยู่แล้ว)
  const plain = await findRows(Prisma.sql`"pinHash" IS NULL AND "pinCode" = ${pin}`, 2);
  if (plain.length === 0) {
    // อีกคำขออาจเพิ่งอัปเกรดแถวตัวเปล่าแถวเดียวนี้เป็น hash ระหว่างสองคำสั่งข้างบน ⇒ ตรวจด้วย hash ซ้ำหนึ่งครั้ง (OQ-7) · ไม่เจอเลย = เทียบกับ dummy
    const again = await byHash();
    if (again) return okOf(again);
    hashEquals(null, hash);
    return failed();
  }
  if (plain.length !== 1) return failed(); // ≥2 = PIN ตัวเปล่าซ้ำในร้าน ⇒ ไม่ยืนยันใครเลย (backfill ล้างให้ตั้งใหม่)
  const one = plain[0]!;
  const sdb = tenantDb({ tenantId, systemId: one.systemId });
  try {
    const up = await sdb.hrEmployee.updateMany({
      where: { id: one.id, pinCode: pin, active: true },
      data: { pinHash: hash, pinSetAt: new Date(), pinCode: null },
    });
    if (up.count !== 1) {
      // อีกคำขอเพิ่งอัปเกรดแถวนี้ไปก่อน ⇒ ตรวจซ้ำด้วย hash (ไม่ใช่ปฏิเสธ)
      const again = await sdb.hrEmployee.findFirst({ where: { id: one.id, active: true, pinHash: hash }, select: { pinHash: true } });
      if (!again || !hashEquals(again.pinHash, hash)) return failed();
    }
  } catch (e) {
    if (isUniqueViolation(e)) return failed(); // คนที่ยังทำงานอีกคนถือ PIN นี้เป็น hash แล้ว ⇒ ไม่ยืนยันแถวตัวเปล่า
    throw e;
  }
  return okOf(one);
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
 * ลองเปิดตรง ๆ ก่อน · ชนดัชนี (P2002) ⇒ ลองใหม่ 1 ครั้งพร้อมล้าง PIN ของคนที่กลับมา (pinHash + pinCode ตัวเปล่าด้วย · pinCleared) + audit hr.pin.clear เหตุผล REACTIVATE_DUPLICATE
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
  const r = await db.hrEmployee.updateMany({ where: { id: employeeId }, data: { active: true, pinHash: null, pinSetAt: null, pinCode: null } });
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

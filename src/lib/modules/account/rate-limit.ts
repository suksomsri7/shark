// ─────────────────────────────────────────────────────────────
// rate-limit.ts — เพดานอัตราของโมดูลบัญชี (WO 9.2 ข้อ 4/11)
//
// 🔴 ทำไมเพิ่งมี: audit 9.2 พบว่าทั้งโมดูลบัญชี **ไม่มีเพดานอัตราสักจุดเดียว** ทั้งที่มี
//    ผิวสาธารณะ 2 เส้น (`/pay/<token>` · `/r/<token>`) ที่ไม่ต้องล็อกอิน และมีงานที่แพงจริง
//    (อ่านบิลด้วย AI = เสียเงิน · ส่งอีเมลรายงาน · นำเข้า CSV · สร้าง charge ที่ผู้ให้บริการ)
//
// 🔴 ใช้ `rate-limit-db` (Postgres) ไม่ใช่ `rate-limit` (Map ในโปรเซส): Vercel มีหลาย instance
//    เพดานแบบ Map = ที่ตั้งไว้ × จำนวน instance ⇒ แทบไม่กันอะไร (เหตุผลเต็มใน rate-limit-db.ts)
//
// 🔴 fail-open ตามตัวจำกัดข้างล่าง: DB ล่ม = ปล่อยผ่าน (ตัวจำกัดล่มห้ามทำให้ลูกค้าจ่ายเงินไม่ได้)
//
// ตัวเลขคิดจากผู้ใช้จริง ไม่ได้ยกมาจากที่อื่น (บทเรียน §12 SiamDive S2):
//   - เปิดหน้าจ่ายเงิน 60/นาที/IP — ลูกค้า 1 คนรีเฟรชรอสถานะทุก 2-3 วินาทีก็ยังไม่ถึง
//   - ส่งคำขอใบกำกับ 10/นาที/IP — คนกรอกฟอร์มจริงส่งครั้งเดียว
//   - สร้างลิงก์ชำระเงิน 60/ชม./ระบบ — ร้านที่ส่งบิลรัวสุดยังไม่ถึง
//   - อ่านบิล AI 200/วัน/ร้าน — เกินนี้คือสคริปต์ ไม่ใช่คนถ่ายบิล (มี credit gate ซ้อนอยู่แล้ว)
//   - นำเข้า CSV 20/ชม./ระบบ · อีเมลรายงาน 20/วัน/ระบบ
// ─────────────────────────────────────────────────────────────

import { checkRateLimitDb } from "@/lib/core/rate-limit-db";

export type RateSpec = { limit: number; windowMs: number };

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const ACCOUNT_RATE = {
  /** เปิดหน้าสาธารณะด้วย token (`/pay/<token>` · `/r/<token>`) — ต่อ IP */
  publicToken: { limit: 60, windowMs: MIN },
  /** กดส่งฟอร์มขอใบกำกับภาษีจากหน้าสาธารณะ — ต่อ IP */
  publicSubmit: { limit: 10, windowMs: MIN },
  /** สร้างคำขอชำระเงิน (ลิงก์+QR PromptPay) — ต่อระบบบัญชี */
  paymentRequest: { limit: 60, windowMs: HOUR },
  /** นำเข้า CSV (เอกสาร/ผู้ติดต่อ/สินค้า/ผังบัญชี) — ต่อระบบบัญชี */
  import: { limit: 20, windowMs: HOUR },
  /** ส่งอีเมลรายงานสรุป — ต่อระบบบัญชี */
  emailReport: { limit: 20, windowMs: DAY },
  /** อ่านบิลด้วย AI — ต่อร้าน (ซ้อนบน credit gate ของ `canSpend`) */
  aiBill: { limit: 200, windowMs: DAY },
} as const satisfies Record<string, RateSpec>;

export type AccountRateKind = keyof typeof ACCOUNT_RATE;

/** ข้อความไทยเมื่อชนเพดาน — ไม่บอกตัวเลขเพดานภายใน บอกแค่ "รออีกกี่วินาที" */
function thaiMessage(kind: AccountRateKind, retryAfterSec: number): string {
  const wait =
    retryAfterSec >= 3600
      ? `${Math.ceil(retryAfterSec / 3600)} ชั่วโมง`
      : retryAfterSec >= 60
        ? `${Math.ceil(retryAfterSec / 60)} นาที`
        : `${retryAfterSec} วินาที`;
  switch (kind) {
    case "publicToken":
      return `เปิดหน้านี้ถี่เกินไป — กรุณารออีก ${wait} แล้วลองใหม่`;
    case "publicSubmit":
      return `ส่งคำขอถี่เกินไป — กรุณารออีก ${wait} แล้วลองใหม่`;
    case "paymentRequest":
      return `สร้างลิงก์ชำระเงินถี่เกินไป — กรุณารออีก ${wait} แล้วลองใหม่`;
    case "import":
      return `นำเข้าไฟล์ถี่เกินไป — กรุณารออีก ${wait} แล้วลองใหม่`;
    case "emailReport":
      return `ส่งอีเมลรายงานครบโควตาของวันนี้แล้ว — ลองใหม่ในอีก ${wait}`;
    case "aiBill":
      return `อ่านบิลด้วย AI ครบโควตาของวันนี้แล้ว — กรอกเองได้ตามปกติ หรือรออีก ${wait}`;
  }
}

export type AccountRateVerdict = { ok: true } | { ok: false; reason: string; retryAfterSec: number };

/**
 * ตรวจเพดานอัตรา 1 ครั้ง · `scope` = ตัวแยกถัง (IP / systemId / tenantId แล้วแต่ชนิด)
 * ⚠️ ทุกครั้งที่ผ่าน = นับ 1 ⇒ เรียกครั้งเดียวต่อคำขอ ห้ามเรียกซ้ำในเส้นทางเดียวกัน
 */
export async function accountRateGuard(
  kind: AccountRateKind,
  scope: string,
  now = Date.now(),
): Promise<AccountRateVerdict> {
  const spec = ACCOUNT_RATE[kind];
  const v = await checkRateLimitDb(`acc:${kind}:${scope}`, spec, now);
  if (v.ok) return { ok: true };
  const retryAfterSec = v.retryAfterSec ?? Math.ceil(spec.windowMs / 1000);
  return { ok: false, reason: thaiMessage(kind, retryAfterSec), retryAfterSec };
}

/**
 * IP ของผู้เรียก (สำหรับถังสาธารณะ) — รูปแบบเดียวกับ store routes เดิมทั้งระบบ
 * 🔴 อ่านจาก `next/headers` แบบ dynamic import: ไฟล์นี้ถูก import โดยสคริปต์ QC/ตัวตรวจ
 *    ที่ไม่มี request context ของ Next — import ตรงจะพังทั้งไฟล์
 */
export async function publicClientIp(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

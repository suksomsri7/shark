// public-rate.ts — เพดานของประตูสาธารณะของ POS (POS P5.2 ▸ CD-P52-F2 · CD-P52-F3 · fix2 CD-P52-F3b ◂)
//   ใบเสร็จออนไลน์ /r/<token> (แขนง POS) + action สาธารณะของใบเสร็จ = ต่อ IP (posPublicRateGuard)
//   ประตู /q ทั้งหมด (qrGuard ใน qr-order.ts) = ถังพลาดต่อ IP (กันไล่เดา: นับเฉพาะโทเคนไม่รู้จัก) + ถังอ่านต่อ (IP, แฮชโทเคน) (กันถล่มโทเคนจริง)
//
// 🔴 ถังเดียวกับ P2.13 / submitGuard: แถว ChatRateBucket ผ่าน checkRateLimitDb (fixed window · คำสั่งเดียว · ทนข้าม instance · fail-open)
//    กุญแจ `pos:pub:<family>:<ip>` — ต่อ IP ต่อตระกูลโทเคน (ไม่ผูกโทเคน ⇒ ไล่เดาหลายโทเคนจาก IP เดียวนับรวมกัน)
// 🔴 ไม่ import บัญชี (fitness F2.2) — ตัวเลขอ้าง ACCOUNT_RATE.publicToken (60/นาที) / publicSubmit (10/นาที) ของแขนงบัญชี
// 🔴 ชนเพดาน = { ok:false, retryAfterSec } — ประตูคืนรหัส RATE_LIMITED + retryAfterSec (เทียบ 429 + Retry-After ของ REST)
//    ก่อนค้นโทเคน ⇒ คำตอบเดียวกันทั้งโทเคนจริง/ไม่มี (ไม่เปิดช่องรู้ว่าโทเคนมีจริง)
// 🔴 IP = x-forwarded-for ตัวแรก / x-real-ip (รูปเดียวกับ /q actions และ publicClientIp ของบัญชี) · ไม่มี request context = "unknown"

import { createHash } from "node:crypto";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { prisma } from "./db";
import { QR_STATUS_POLL_MS, QR_TABLE_POLL_MS } from "./qr-order-shared";

const MIN = 60_000;
const polls = (ms: number): number => Math.ceil(MIN / ms);

/**
 * งบต่อ IP ต่อนาที (ตัวเลขและที่มา — จดใน ledger/wo-notes/pos-P5.2.md):
 *   receiptRead   60 = ACCOUNT_RATE.publicToken — เปิด/รีเฟรช/พิมพ์ใบเสร็จซ้ำหลายครั้ง (≥ 30 ตามมติ) · หน้า /r แขนง POS + publicReceiptAction
 *   receiptSubmit 30 — แจ้งปัญหา · ขอใบกำกับ · รีวิว (เพดานต่อบิลในบริการคงเดิม: แจ้งปัญหา 3/บิล/24 ชม. · ใบกำกับ 1 คำขอเปิด · รีวิว 1/บิล)
 */
export const POS_PUBLIC_RATE = {
  receiptRead: { limit: 60, windowMs: MIN },
  receiptSubmit: { limit: 30, windowMs: MIN },
} as const;
export type PosPublicRateFamily = keyof typeof POS_PUBLIC_RATE;
export type PosPublicRateVerdict = { ok: true } | { ok: false; retryAfterSec: number };

const ipKey = (ip: unknown): string => (typeof ip === "string" && ip.trim() ? ip.trim().slice(0, 100) : "unknown");

/** นับ 1 ครั้งในถัง `pos:pub:<family>:<ip>` · เกินงบ = { ok:false, retryAfterSec } */
export async function posPublicRateGuard(family: PosPublicRateFamily, ip: unknown): Promise<PosPublicRateVerdict> {
  const v = await checkRateLimitDb(`pos:pub:${family}:${ipKey(ip)}`, POS_PUBLIC_RATE[family]);
  return v.ok ? { ok: true } : { ok: false, retryAfterSec: v.retryAfterSec ?? 60 };
}

// ═══════════ POS P5.2 ▸ fix2 CD-P52-F3b: ประตู /q — พลาดต่อ IP + อ่านต่อ (IP, โทเคน) ◂ ═══════════
/** โทเคนไม่รู้จัก/ผิดรูป ต่อ IP ต่อนาที — ถึงแล้ว = ทุกคำขอของ IP นั้น (โทเคนจริงด้วย) ได้ TOKEN_INVALID จนหมดหน้าต่าง */
export const QR_MISS_PER_IP_PER_MIN = 30;
/**
 * งบอ่านต่อ (IP, โทเคน) ต่อนาที — โทรศัพท์ 1 เครื่องบนโทเคนเดียว × 3:
 *   qrTable 3 × (โพล 60000/QR_TABLE_POLL_MS 8 + บิลรีเฟรชเท่าโพล 8 + เปิดหน้า 1 + บิล SSR 1) = 54 · qrOrder 3 × (โพล 60000/QR_STATUS_POLL_MS 12 + เปิดหน้า 1) = 39 ·
 *   qrLink 30 (เปิดหน้าเท่านั้น) · qrQuote 3 × 30 แก้ตะกร้า/นาที = 90 (useQrQuote ยิงหลังหยุดพิมพ์ 250 ms)
 */
export const QR_HIT_RATE = {
  qrTable: { limit: 3 * (2 * polls(QR_TABLE_POLL_MS) + 2), windowMs: MIN },
  qrOrder: { limit: 3 * (polls(QR_STATUS_POLL_MS) + 1), windowMs: MIN },
  qrLink: { limit: 30, windowMs: MIN },
  qrQuote: { limit: 90, windowMs: MIN },
} as const;
export type QrHitFamily = keyof typeof QR_HIT_RATE;
/** แถว ChatRateBucket อยู่ 24 ชม. ⇒ กุญแจเก็บแฮชโทเคน 16 ตัว ไม่ใช่โทเคนดิบ */
const tokenHash = (token: unknown): string => createHash("sha256").update(typeof token === "string" ? token : "").digest("hex").slice(0, 16);
const missKey = (ip: unknown): string => `pos:pub:miss:${ipKey(ip)}`;
/** อ่านอย่างเดียว (ไม่นับ): ถังพลาดของ IP นี้เต็มในหน้าต่างปัจจุบันไหม · DB ล่ม = ไม่เต็ม (fail-open แบบ checkRateLimitDb) */
export async function qrMissExhausted(ip: unknown, now = Date.now()): Promise<boolean> {
  try {
    const row = await prisma.chatRateBucket.findUnique({ where: { key: missKey(ip) }, select: { count: true, windowStart: true } });
    return !!row && row.windowStart.getTime() > now - MIN && row.count >= QR_MISS_PER_IP_PER_MIN;
  } catch {
    return false;
  }
}
/** นับ 1 พลาด (โทเคนไม่รู้จัก) ในถัง `pos:pub:miss:<ip>` */
export async function qrCountMiss(ip: unknown): Promise<void> {
  await checkRateLimitDb(missKey(ip), { limit: QR_MISS_PER_IP_PER_MIN, windowMs: MIN });
}
/** นับ 1 อ่านที่โทเคนจริงในถัง `pos:pub:<family>:<ip>:<sha256(token)[0..16]>` · เกินงบ = { ok:false, retryAfterSec } */
export async function qrHitGuard(family: QrHitFamily, ip: unknown, token: unknown): Promise<PosPublicRateVerdict> {
  const v = await checkRateLimitDb(`pos:pub:${family}:${ipKey(ip)}:${tokenHash(token)}`, QR_HIT_RATE[family]);
  return v.ok ? { ok: true } : { ok: false, retryAfterSec: v.retryAfterSec ?? 60 };
}

/** IP ของผู้เรียกประตูสาธารณะ — dynamic import (สคริปต์ QC/ตัวตรวจที่ไม่มี request context ของ Next import ไฟล์นี้ได้) */
export async function posPublicClientIp(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

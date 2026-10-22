// public-rate.ts — เพดานต่อ IP ของประตูสาธารณะของ POS (POS P5.2 ▸ CD-P52-F2 · CD-P52-F3 ◂)
//   ใบเสร็จออนไลน์ /r/<token> (แขนง POS) + action สาธารณะของใบเสร็จ · ประตูอ่านของ /q (tableDoor · tablePoll · tableBill · linkDoor · orderStatus)
//
// 🔴 ถังเดียวกับ P2.13 / submitGuard: แถว ChatRateBucket ผ่าน checkRateLimitDb (fixed window · คำสั่งเดียว · ทนข้าม instance · fail-open)
//    กุญแจ `pos:pub:<family>:<ip>` — ต่อ IP ต่อตระกูลโทเคน (ไม่ผูกโทเคน ⇒ ไล่เดาหลายโทเคนจาก IP เดียวนับรวมกัน)
// 🔴 ไม่ import บัญชี (fitness F2.2) — ตัวเลขอ้าง ACCOUNT_RATE.publicToken (60/นาที) / publicSubmit (10/นาที) ของแขนงบัญชี
// 🔴 ชนเพดาน = { ok:false, retryAfterSec } — ประตูคืนรหัส RATE_LIMITED + retryAfterSec (เทียบ 429 + Retry-After ของ REST)
//    ก่อนค้นโทเคน ⇒ คำตอบเดียวกันทั้งโทเคนจริง/ไม่มี (ไม่เปิดช่องรู้ว่าโทเคนมีจริง)
// 🔴 IP = x-forwarded-for ตัวแรก / x-real-ip (รูปเดียวกับ /q actions และ publicClientIp ของบัญชี) · ไม่มี request context = "unknown"

import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { QR_STATUS_POLL_MS, QR_TABLE_POLL_MS } from "./qr-order-shared";

const MIN = 60_000;
const polls = (ms: number): number => Math.ceil(MIN / ms);

/**
 * งบต่อ IP ต่อนาที (ตัวเลขและที่มา — จดใน ledger/wo-notes/pos-P5.2.md):
 *   receiptRead   60 = ACCOUNT_RATE.publicToken — เปิด/รีเฟรช/พิมพ์ใบเสร็จซ้ำหลายครั้ง (≥ 30 ตามมติ) · หน้า /r แขนง POS + publicReceiptAction
 *   receiptSubmit 30 — แจ้งปัญหา · ขอใบกำกับ · รีวิว (เพดานต่อบิลในบริการคงเดิม: แจ้งปัญหา 3/บิล/24 ชม. · ใบกำกับ 1 คำขอเปิด · รีวิว 1/บิล)
 *   qrTable       3 × (โพล 60000/QR_TABLE_POLL_MS + บิลรีเฟรชเท่าโพล + เปิดหน้า 1 + บิล SSR 1) = 3 × (8 + 8 + 2) = 54 — โทรศัพท์ 1 เครื่องที่นั่งโต๊ะ เผื่อ 3 เท่า
 *   qrOrder       3 × (โพล 60000/QR_STATUS_POLL_MS + เปิดหน้า 1) = 3 × (12 + 1) = 39
 *   qrLink        30 — linkDoor = เปิดหน้าเท่านั้น (ไม่มีโพล) · ขั้นต่ำเดียวกับตระกูลใบเสร็จ
 */
export const POS_PUBLIC_RATE = {
  receiptRead: { limit: 60, windowMs: MIN },
  receiptSubmit: { limit: 30, windowMs: MIN },
  qrTable: { limit: 3 * (2 * polls(QR_TABLE_POLL_MS) + 2), windowMs: MIN },
  qrOrder: { limit: 3 * (polls(QR_STATUS_POLL_MS) + 1), windowMs: MIN },
  qrLink: { limit: 30, windowMs: MIN },
} as const;
export type PosPublicRateFamily = keyof typeof POS_PUBLIC_RATE;
export type PosPublicRateVerdict = { ok: true } | { ok: false; retryAfterSec: number };

const ipKey = (ip: unknown): string => (typeof ip === "string" && ip.trim() ? ip.trim().slice(0, 100) : "unknown");

/** นับ 1 ครั้งในถัง `pos:pub:<family>:<ip>` · เกินงบ = { ok:false, retryAfterSec } */
export async function posPublicRateGuard(family: PosPublicRateFamily, ip: unknown): Promise<PosPublicRateVerdict> {
  const v = await checkRateLimitDb(`pos:pub:${family}:${ipKey(ip)}`, POS_PUBLIC_RATE[family]);
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

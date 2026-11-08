// SVC H.10 ▸ ช่องทาง OTA (channel manager) — ชนิดจริงของ adapter + ตัวช่วยบริสุทธิ์ (ใบสั่ง ledger/svc-briefs/svc-brief-h.10.md §1 · §3 · §9)
//   🔴 pure: ไม่มี I/O · ไม่ import prisma/db/server-only — ศูนย์เชื่อมต่อ (`core/integrations/types.ts`) import type จากไฟล์นี้ (ฝั่ง client ได้)
//   • ARI = availability/rates/restrictions ต่อวัน × ห้องที่แม็ป (externalRoomId) × แผนที่แม็ป (externalRateId)
//   • InboundReservation = การจองที่ตัวต่อส่งเข้า (ตัวต่อ+externalId+version = กุญแจ idempotent ของ inbox) · raw = หลักฐานจากช่องทาง (เก็บใน inbox เท่านั้น ไม่ส่งต่อ DTO/log/event)
import { roundFraction } from "../pricing";

/** ราคาส่งช่องทางของแผน 1 แผนใน 1 คืน */
export type AriRate = { priceSatang: number; minNights: number | null; closedToArrival: boolean };
/** ห้อง 1 ประเภทใน 1 วัน — stopSell = ไม่เหลือส่งขาย (available 0) หรือไม่มีราคา */
export type AriRoomDay = { available: number; rates: Record<string, AriRate>; stopSell: boolean };
/** คีย์ = externalRoomId */
export type AriDay = Record<string, AriRoomDay>;
/** คีย์ = วันไทย "YYYY-MM-DD" (ช่วงรวมทั้งสองปลาย) */
export type AriPayload = { byDate: Record<string, AriDay> };

export type InboundStatus = "NEW" | "MODIFIED" | "CANCELLED";
export type InboundGuest = { name: string; phone?: string | null; email?: string | null };
/** การจองจากตัวต่อ (สัญญาใบ §3) — เงินเป็นสตางค์ · วัน "YYYY-MM-DD" · checkOut = วันออก (ไม่นับคืน) */
export type InboundReservation = {
  externalId: string;
  version: number;
  status: InboundStatus;
  externalRoomId: string;
  externalRateId?: string | null;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  guest: InboundGuest;
  grossSatang: number;
  commissionSatang: number;
  /** net ที่ช่องทางคำนวณ (อาจหักภาษีค่าคอมฯ ⇒ ≠ gross − commission) — ไม่ส่ง ⇒ gross − commission */
  netSatang?: number | null;
  prepaid: boolean;
  raw: unknown;
};

/** แม็ปของตัวต่อ 1 ตัว (ส่งให้ pushAri — ไม่มีค่าลับ/ข้อมูลแขก) */
export type ChannelMapping = {
  connectionId: string;
  unitId: string;
  rooms: { roomTypeId: string; externalRoomId: string }[];
  rates: { ratePlanId: string; externalRateId: string; markupBp: number | null }[];
  buffers: { roomTypeId: string; rooms: number }[];
};

/** ตัวเลือกการเรียกตัวต่อ (เท่า CallOpts ของศูนย์ + connectionId ของแถวที่เรียก — ตัวต่อจริงไม่จำเป็นต้องใช้ · FAKE ใช้เลือกคิวทดสอบ) */
export type ChannelCallOpts = { signal?: AbortSignal; connectionId?: string };

/** สูตรราคาของแผนที่แม็ป (ChannelRateMap.formula) */
export type ChannelRateFormula = { markupBp?: number | null } | null | undefined;

/** ราคาส่งช่องทาง = ราคาแผน × (1 + markupBp/10000) ปัดตาม rooms.money.rounding (ค่าเริ่ม SATANG) · ติดลบ ⇒ 0 */
export function markupPrice(priceSatang: number, formula: ChannelRateFormula, rounding: string = "SATANG"): number {
  const p = Number.isFinite(priceSatang) ? Math.max(0, Math.trunc(priceSatang)) : 0;
  const bp = typeof formula?.markupBp === "number" && Number.isFinite(formula.markupBp) ? Math.trunc(formula.markupBp) : 0;
  return roundFraction(p * (10_000 + bp), 10_000, rounding);
}

/** JSON ที่เรียงคีย์ทุกชั้น (ลำดับคีย์ไม่มีผลกับ hash) */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    .join(",")}}`;
}

/** cyrb53 (53 บิต · บริสุทธิ์ · ไม่ใช่การเข้ารหัส — ใช้กันส่งซ้ำค่าเดิมเท่านั้น) */
function cyrb53(s: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** hash ของ ARI (คงที่ · ไม่ขึ้นกับลำดับคีย์ · ต่าง 1 สตางค์ = ต่าง) — 28 ตัวอักษร hex */
export function ariHash(payload: unknown): string {
  const s = stableJson(payload);
  return `${cyrb53(s, 0x9e3779b9)}${cyrb53(s, 0x85ebca6b)}`;
}

/** วันไทย "YYYY-MM-DD" ⇒ เลขวัน (UTC เที่ยงคืน) — ไม่ใช้ getDay */
export const ymdDayNo = (ymd: string): number => Math.round(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
export const ymdOfDayNo = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);
export const ymdAdd = (ymd: string, n: number): string => ymdOfDayNo(ymdDayNo(ymd) + n);
/** วันทั้งช่วงรวมสองปลาย [from, to] */
export function datesInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  for (let n = ymdDayNo(from), e = ymdDayNo(to); n <= e && out.length <= 400; n++) out.push(ymdOfDayNo(n));
  return out;
}

/** สถานะ inbox (CHECK ของฐาน) */
export const INBOX_STATUSES = ["RECEIVED", "APPLIED", "NEEDS_ROOM", "REJECTED"] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];
/** รหัสเหตุผลใน ChannelReservationInbox.error (ข้อความไทยอยู่ที่ INBOX_REASON_TH) */
export type InboxReason =
  | "UNMAPPED_ROOM"
  | "UNMAPPED_RATE"
  | "STALE"
  | "INVALID"
  | "NO_RATE"
  | "NO_ROOM"
  | "MANUAL_REQUIRED"
  | "NOT_FOUND"
  | "REJECTED_BY_STAFF";
export const INBOX_REASON_TH: Record<InboxReason, string> = {
  UNMAPPED_ROOM: "ห้องของช่องทางยังไม่ได้แม็ปกับประเภทห้อง",
  UNMAPPED_RATE: "แผนราคาของช่องทางยังไม่ได้แม็ป",
  STALE: "มีฉบับที่ใหม่กว่าของการจองนี้แล้ว",
  INVALID: "ข้อมูลการจองจากช่องทางไม่ครบหรือไม่ถูกต้อง",
  NO_RATE: "ยังไม่ได้ตั้งราคาห้องประเภทนี้",
  NO_ROOM: "ห้องประเภทนี้เต็มในบางคืน — ย้ายแขกอื่นหรือเปิดห้องแล้วกดลองอีกครั้ง",
  MANUAL_REQUIRED: "การจองเดิมเข้าพักแล้วหรือมีมัดจำที่รับไว้ — จัดการที่หน้าการจองแล้วกดลองอีกครั้ง",
  NOT_FOUND: "ไม่พบโรงแรมหรือประเภทห้องของการจองนี้",
  REJECTED_BY_STAFF: "พนักงานปฏิเสธการจองนี้",
};

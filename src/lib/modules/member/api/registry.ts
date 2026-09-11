// registry.ts — ทะเบียนกลางของทุก endpoint ของ "ระบบสมาชิก" + ตัวจับคู่ path (M1.11)
//
// 🔴 "ทะเบียนเดียว หลายทางออก": op ที่ลงทะเบียนที่นี่คือแหล่งความจริงเดียวของ
//    (1) REST `/api/v1/member/*`  (2) OpenAPI + คู่มือ EN + สกิล Claude  (3) tool ของสกิล AI `members`
//    ⇒ เพิ่ม endpoint = เพิ่ม op ที่ไฟล์ `ops/*.ts` แล้วต่อเข้าทะเบียนนี้ที่เดียว
//    (บทเรียน outbox: เพิ่ม event แล้วลืมลงทะเบียน consumer = คิวตันเงียบ ๆ)
//
// 🔴 ทุก WO ของ M2/M3 ที่เพิ่มฟีเจอร์ให้ระบบสมาชิก **ต้องเพิ่ม op ของตัวเองที่นี่** (ด่าน fitness F13.7)

import { allowedMethodsIn, matchOpIn } from "@/lib/api/dispatch";
import type { ApiOp } from "@/lib/api/op";
import { CORE_OPS } from "./ops/core";
import { COUPONS_OPS } from "./ops/coupons";
import { FIELDS_OPS } from "./ops/fields";
import { GIFTCARDS_OPS } from "./ops/giftcards";
import { ME_OPS } from "./ops/me";
import { MEMBERS_OPS } from "./ops/members";
import { POINTS_OPS } from "./ops/points";
import { PRIVACY_OPS } from "./ops/privacy";
import { REWARDS_OPS } from "./ops/rewards";
import { SOURCES_OPS } from "./ops/sources";
import { STAMPS_OPS } from "./ops/stamps";
import { TIERS_OPS } from "./ops/tiers";
import { VOUCHERS_OPS } from "./ops/vouchers";
import { WALLET_OPS } from "./ops/wallet";
import { CAMPAIGNS_OPS } from "./ops/campaigns";
import { INSIGHTS_OPS } from "./ops/insights";
import { JOIN_OPS } from "./ops/join";
import { JOURNEYS_OPS } from "./ops/journeys";
import { NOTIFICATIONS_OPS } from "./ops/notifications";
import { REFERRALS_OPS } from "./ops/referrals";
import { REPORTS_OPS } from "./ops/reports";
import { REVIEWS_OPS } from "./ops/reviews";
import { SEGMENTS_OPS } from "./ops/segments";
import { SETTINGS_OPS } from "./ops/settings";
import { WEBHOOKS_OPS } from "./ops/webhooks";

export * from "./op";

/** ทุก op ของ API ระบบสมาชิก — เรียงตามหมวดของ `docs/api/MEMBER-API.md` §2 */
export const MEMBER_OPS: ApiOp[] = [
  ...CORE_OPS,
  ...MEMBERS_OPS,
  ...FIELDS_OPS,
  ...PRIVACY_OPS,
  ...SOURCES_OPS,
  ...TIERS_OPS,
  // ── ชุดสอง: ความภักดีและโปรโมชัน (M2.10 · §2.6–2.12) ──
  ...POINTS_OPS,
  ...STAMPS_OPS,
  ...REWARDS_OPS,
  ...WALLET_OPS,
  ...VOUCHERS_OPS,
  ...COUPONS_OPS,
  ...GIFTCARDS_OPS,
  // ── ชุดสาม: การตลาด · ความสัมพันธ์ · รายงาน · การเชื่อมต่อ (M3.10 · §2.13–2.20) ──
  ...INSIGHTS_OPS,
  ...SEGMENTS_OPS,
  ...CAMPAIGNS_OPS,
  ...JOURNEYS_OPS,
  ...REVIEWS_OPS,
  ...REFERRALS_OPS,
  ...NOTIFICATIONS_OPS,
  ...REPORTS_OPS,
  ...SETTINGS_OPS,
  ...WEBHOOKS_OPS,
  // เลนสาธารณะ (`/join/{tenantSlug}/*`) — สมัครสมาชิกจากลิงก์ของร้าน ไม่ต้องมีคีย์ (M3.10 · public-lane.ts)
  ...JOIN_OPS,
  // ช่องทางของลูกค้าเอง (`/me/*`) — session ลูกค้า `cs_…` เท่านั้น (M2.9 ออก token · M2.10 เปิดทาง REST)
  ...ME_OPS,
];

/** หา op ที่ตรงทั้ง method และ path · เจอหลายตัว → เลือกตัวที่ "คงที่มากที่สุด" (param น้อยสุด) */
export function matchOp(method: string, segments: string[]): { op: ApiOp; params: Record<string, string> } | null {
  return matchOpIn(MEMBER_OPS, method, segments);
}

/** method ที่ path นี้รองรับ (ใช้ทำหัว `Allow` ของ 405) — [] = ไม่มี op ที่ path นี้เลย */
export function allowedMethods(segments: string[]): string[] {
  return allowedMethodsIn(MEMBER_OPS, segments);
}

/** op ที่เปิดเป็นเครื่องมือของผู้ช่วย AI (ทะเบียนเดียวกัน — ไม่มีรายชื่อชุดที่สอง) */
export function memberToolOps(): ApiOp[] {
  return MEMBER_OPS.filter((o) => o.tool);
}

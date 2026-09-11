// referrals-shared.ts — ชนิดข้อมูล/ค่าคงที่/ป้ายของ "แนะนำเพื่อน" (M3.5 · พิมพ์เขียว §4.3 §5.10 §11.7 · ภาพ 24 · 08 ขวา)
//
// 🔴 ไฟล์บริสุทธิ์: ไม่แตะ prisma/env/next — import ได้ทั้งจาก server และ client component
//    (`'use client'` ห้าม import `./referrals` ซึ่งลากถึงฐานข้อมูล — build พัง · บทเรียน M3.1)
// 🔴 ไฟล์ `"use server"` (`referrals-actions.ts`) export ชนิดไม่ได้ (หน้า 500) ⇒ ชนิดของผลลัพธ์ action อยู่ที่นี่

export type ReferralRewardKindValue = "POINTS" | "VOUCHER";
export type ReferralConvertOn = "SIGNUP" | "FIRST_PURCHASE";
export type ReferralStatusValue = "PENDING" | "CONVERTED" | "REWARDED" | "REJECTED";

/** รางวัลแบบแต้ม */
export type ReferralPointsValue = { points: number };
/**
 * รางวัลแบบ voucher — `value` ของ FIXED เป็น **บาท** (ตรงกับที่ร้านกรอก "voucher ฿100")
 * 🔴 ตัว voucher จริงเก็บ FIXED เป็นสตางค์ (voucher.prisma `value Int // FIXED = สตางค์`)
 *    ⇒ `referrals.ts` คูณ 100 ตอนออกใบ · PERCENT = 1–100 ใช้ตรง ๆ
 */
export type ReferralVoucherValue = { kind: "FIXED" | "PERCENT"; value: number; validDays: number };
export type ReferralRewardValue = ReferralPointsValue | ReferralVoucherValue;

export type ReferralProgramDto = {
  enabled: boolean;
  referrerRewardKind: ReferralRewardKindValue;
  referrerRewardValue: ReferralRewardValue;
  refereeRewardKind: ReferralRewardKindValue;
  refereeRewardValue: ReferralRewardValue;
  convertOn: ReferralConvertOn;
  minFirstPurchaseSatang: number | null;
  monthlyCap: number | null;
  fraudPhoneDevice: boolean;
  shareText: string;
  /** false = ยังไม่เคยบันทึก (ค่าที่เห็นคือค่าปริยาย) */
  saved: boolean;
  updatedAt: Date | null;
};

export type SetReferralProgramInput = Partial<Omit<ReferralProgramDto, "saved" | "updatedAt">>;

/** ค่าปริยายของโปรแกรม (D6 — ผู้แนะนำ 300 แต้ม · เพื่อน voucher ฿100 · ซื้อครั้งแรก ≥ ฿500 · 10 ครั้ง/เดือน) */
export const REFERRAL_DEFAULTS = Object.freeze({
  enabled: false,
  referrerRewardKind: "POINTS" as ReferralRewardKindValue,
  referrerRewardValue: { points: 300 } as ReferralRewardValue,
  refereeRewardKind: "VOUCHER" as ReferralRewardKindValue,
  refereeRewardValue: { kind: "FIXED", value: 100, validDays: 30 } as ReferralRewardValue,
  convertOn: "FIRST_PURCHASE" as ReferralConvertOn,
  minFirstPurchaseSatang: 50_000,
  monthlyCap: 10,
  fraudPhoneDevice: true,
  // ตัวแปร: {ร้าน} ชื่อร้าน · {รางวัลเพื่อน} ป้ายรางวัลของเพื่อน · {link} ลิงก์เต็มของผู้แนะนำ
  shareText: "ชวนเพื่อนมาใช้บริการกับ {ร้าน} แล้วรับ {รางวัลเพื่อน} ทันที! กดลิงก์นี้เลย {link}",
});

/** ค่าปริยายของรางวัลเมื่อร้านสลับชนิด (แต้ม ↔ voucher) โดยยังไม่ได้ใส่ค่าใหม่ */
export const REFERRAL_DEFAULT_VALUE: Record<ReferralRewardKindValue, ReferralRewardValue> = Object.freeze({
  POINTS: { points: 300 },
  VOUCHER: { kind: "FIXED", value: 100, validDays: 30 },
});

/** เพดาน — ข้อความแชร์ยาวเกินไลน์ตัด · อายุ voucher · แต้มต่อครั้ง */
export const REFERRAL_LIMITS = Object.freeze({
  shareTextMax: 500,
  voucherValidDaysMax: 365,
  pointsMax: 100_000,
  /** โปรแกรมปิด = การแนะนำที่ค้างอยู่ก่อนปิด ยังนับต่อได้กี่วัน (§11.7) */
  closedGraceDays: 30,
  /** เพื่อนต้องสมัครมาไม่เกินกี่ชั่วโมงก่อนผูกโค้ด (เกินนี้ = ไม่ใช่สมาชิกใหม่) */
  newMemberHours: 24,
});

export const REFERRAL_STATUS_LABELS: Record<ReferralStatusValue, string> = Object.freeze({
  PENDING: "รอ",
  CONVERTED: "สำเร็จ",
  REWARDED: "สำเร็จ",
  REJECTED: "ถูกปฏิเสธ",
});

export const REFERRAL_CONVERT_ON_LABELS: Record<ReferralConvertOn, string> = Object.freeze({
  SIGNUP: "เพื่อนสมัครสมาชิก",
  FIRST_PURCHASE: "เพื่อนซื้อครั้งแรก",
});

/** ป้ายรางวัลสั้น ๆ "300 แต้ม" / "voucher ฿100" / "voucher 10%" */
export function rewardLabel(kind: ReferralRewardKindValue, value: ReferralRewardValue): string {
  if (kind === "POINTS") {
    const pts = "points" in value ? value.points : 0;
    return `${Math.round(pts).toLocaleString("th-TH")} แต้ม`;
  }
  if ("kind" in value) {
    return value.kind === "PERCENT" ? `voucher ${value.value}%` : `voucher ฿${Math.round(value.value).toLocaleString("th-TH")}`;
  }
  return "voucher";
}

/** ข้อความแชร์พร้อมใช้ — แทนตัวแปร {ร้าน} {รางวัลเพื่อน} {link} */
export function renderShareText(template: string, vars: { shop: string; refereeReward: string; link: string }): string {
  return template
    .replaceAll("{ร้าน}", vars.shop)
    .replaceAll("{รางวัลเพื่อน}", vars.refereeReward)
    .replaceAll("{link}", vars.link);
}

/** ลิงก์แนะนำของสมาชิก (ทางเข้าสาธารณะ — หน้า `/ref/[code]` พาไปหน้าลูกค้าของร้านนั้น) */
export const referralPath = (code: string): string => `/ref/${encodeURIComponent(code)}`;

/**
 * หน้าปลายทางของ `/ref/<code>` — ไปหน้าเข้าสู่ระบบ/สมัครของร้านพร้อม `?ref=<code>`
 * 🔴 หน้าสมัคร 3 ขั้น `/m/<slug>/join` มาที่ M3.11 — วันนี้ยังไม่มีหน้า (เปิด = 404)
 *    ⇒ ชี้ไปหน้าเข้าสู่ระบบก่อน (มีจริงตั้งแต่ M2.9) · M3.11 เปลี่ยนบรรทัดนี้เป็น `/join` บรรทัดเดียว
 */
export const referralLandingPath = (slug: string, code: string): string =>
  `/m/${encodeURIComponent(slug)}/login?ref=${encodeURIComponent(code)}`;

// ───────────────────────── ผลลัพธ์ของ service (หน้าจอ/REST ใช้ชุดเดียวกัน) ─────────────────────────

export type ReferralCodeView = { code: string; link: string; url: string; shareText: string };

export type AttachResult = { referralId: string; status: ReferralStatusValue; rejectReason?: string | null };

export type EvaluateResult = { converted: boolean; rewarded: boolean; referralId?: string; reason?: string };

/** รางวัลที่จ่ายจริงหนึ่งฝั่ง (เก็บใน Referral.referrerRewardRef / refereeRewardRef) */
export type ReferralRewardRef = {
  kind: ReferralRewardKindValue;
  ledgerId?: string;
  voucherId?: string;
  points?: number;
  /** มูลค่าหน้าใบ (สตางค์) ของ voucher — ใช้คิดต้นทุน/คน */
  valueSatang?: number;
  label?: string;
  capped?: boolean;
  skipped?: string;
};

export type RewardBothResult = {
  referrer: { kind: ReferralRewardKindValue; ref: ReferralRewardRef };
  referee: { kind: ReferralRewardKindValue; ref: ReferralRewardRef };
  capped: boolean;
};

export type ReferralPartyView = { id: string; name: string; memberCode: string };

export type ReferralRowView = {
  id: string;
  referrer: ReferralPartyView;
  referee: ReferralPartyView | null;
  refereeContact: Record<string, unknown> | null;
  status: ReferralStatusValue;
  createdAt: Date;
  convertedAt: Date | null;
  rewardedAt: Date | null;
  conversionRef: Record<string, unknown> | null;
  rejectReason: string | null;
  /** ยอดบิลแรกของเพื่อน (สตางค์) — null = ยังไม่ซื้อ */
  firstPurchaseSatang: number | null;
  rewards: { referrer?: ReferralRewardRef; referee?: ReferralRewardRef };
};

export type ListReferralsResult = { items: ReferralRowView[]; nextCursor: string | null };

export type LeaderboardRow = {
  customerId: string;
  name: string;
  memberCode: string;
  referred: number;
  converted: number;
  pointsEarned: number;
  vouchersEarned: number;
};

export type ReferralStats = {
  referredMembers: number;
  conversionPct: number;
  costPerMemberSatang: number;
  first90dSpendSatang: number;
  vsAvgPct: number;
};

export type ReferralTreeRow = {
  refereeId: string;
  name: string;
  status: ReferralStatusValue;
  convertedAt: Date | null;
  firstPurchaseSatang: number | null;
};

export type ReferralMemberView = {
  code: string;
  link: string;
  url: string;
  shareText: string;
  referred: number;
  converted: number;
  pointsEarned: number;
  tree: ReferralTreeRow[];
};

export type ReferralActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; reason: string };

/** เหตุผลที่ถูกปฏิเสธแบบสั้น (ชิปในตาราง) — ข้อความเต็มอยู่ใน rejectReason */
export function rejectShortOf(reason: string | null | undefined): string {
  const r = reason ?? "";
  if (r.includes("ตัวเอง")) return "แนะนำตัวเอง";
  if (r.includes("ใหม่")) return "ไม่ใช่สมาชิกใหม่";
  if (r.includes("อุปกรณ์เดียว")) return "อุปกรณ์ซ้ำ";
  if (r.includes("เบอร์")) return "เบอร์ซ้ำ";
  return r.slice(0, 24) || "ร้านปฏิเสธ";
}

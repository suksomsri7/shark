// reviews-shared.ts — ชนิดข้อมูล/ค่าปริยาย/ป้ายไทยของ "รีวิวลูกค้า" (M3.4 · ภาพ 23 · 08 ขวา)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่แตะ prisma/env/next — import ได้จาก client component ('use client')
//    (บทเรียน M3.1: client component ที่ลากโมดูลถึง prisma → `next build` พัง "Module not found: pg")
// 🔴 ชนิดผลลัพธ์ของ server action อยู่ที่นี่ ไม่ใช่ใน `reviews-actions.ts` (ไฟล์ "use server" ห้าม export type — M2.2)

/** สถานะรีวิว (ตรงกับ enum `ReviewStatus` ของสคีมา) */
export type ReviewStatusKey = "REQUESTED" | "NEW" | "REPLIED" | "ESCALATED" | "HIDDEN";

export const REVIEW_STATUS_LABELS: Readonly<Record<ReviewStatusKey, string>> = Object.freeze({
  REQUESTED: "รอลูกค้ารีวิว",
  NEW: "ยังไม่ตอบ",
  REPLIED: "ตอบแล้ว",
  ESCALATED: "ส่งต่อผู้จัดการ",
  HIDDEN: "ซ่อนอยู่",
});

/** ชนิดรายการอ้างอิงที่ขอรีวิวได้ (1 รีวิวต่อรายการ) */
export const REVIEW_REF_TYPES = ["PosSale", "Appointment"] as const;
export type ReviewRefType = (typeof REVIEW_REF_TYPES)[number];

/** รูปแนบต่อรีวิว (§11.7) */
export const REVIEW_MAX_PHOTOS = 3;
/** ความยาวข้อความรีวิว/คำตอบ */
export const REVIEW_BODY_MAX = 2000;
export const REVIEW_REPLY_MAX = 1000;

/** บทบาทที่รับการ์ดรีวิวต่ำ (ตรงกับ enum Role ของ Membership) */
export const REVIEW_ASSIGNEE_ROLES = ["OWNER", "MANAGER", "STAFF"] as const;
export type ReviewAssigneeRole = (typeof REVIEW_ASSIGNEE_ROLES)[number];
export const REVIEW_ASSIGNEE_ROLE_LABELS: Readonly<Record<ReviewAssigneeRole, string>> = Object.freeze({
  OWNER: "เจ้าของร้าน",
  MANAGER: "ผู้จัดการสาขา",
  STAFF: "พนักงาน",
});

/**
 * ตั้งค่ารีวิว — เก็บที่ `AppSystem.settings.member.review` ของระบบสมาชิก (§4.3)
 * 🔴 `googleReviewUrl` = null เสมอในรอบนี้ (D5: เจ้าของเลือกเก็บรีวิวในระบบอย่างเดียว · ไม่เชิญรีวิว Google)
 */
export type ReviewSettings = {
  /** ขอรีวิวหลังจบบริการกี่ชั่วโมง */
  askAfterHours: number;
  /** ช่องทางส่งลิงก์รีวิว (รอบนี้มี LINE ช่องเดียว) */
  channel: "LINE";
  /** แต้มที่ให้เมื่อรีวิว (0 = ไม่ให้) */
  rewardPoints: number;
  /** คะแนน ≤ ค่านี้ = เปิดการ์ดในบอร์ดงาน + มอบหมาย (1–5) */
  escalateBelow: number;
  /** บอร์ดปลายทาง (null = บอร์ดแรกของร้าน) */
  escalateBoardId: string | null;
  escalateAssigneeRole: ReviewAssigneeRole;
  /** ข้อความตั้งต้นของคำตอบ (AI ร่างต่อจากนี้) */
  replyTemplate: string;
  googleReviewUrl: string | null;
};

export const REVIEW_SETTINGS_DEFAULT: Readonly<ReviewSettings> = Object.freeze({
  askAfterHours: 2,
  channel: "LINE",
  rewardPoints: 50,
  escalateBelow: 2,
  escalateBoardId: null,
  escalateAssigneeRole: "MANAGER",
  replyTemplate: "ขอบคุณสำหรับรีวิวค่ะ",
  googleReviewUrl: null,
});

/** ชั่วโมงที่เลือกได้ในหน้าตั้งค่า (ภาพ 23 "ขอรีวิวหลัง · ทาง LINE · 2 ชม.") */
export const REVIEW_ASK_AFTER_CHOICES: readonly number[] = Object.freeze([1, 2, 4, 12, 24, 48]);

/** แถวรีวิว 1 ใบ (inbox ภาพ 23 · แท็บ 360 ภาพ 08) */
export type ReviewRow = {
  id: string;
  rating: number;
  body: string | null;
  photoFileIds: string[];
  /** URL รูปที่ resolve จาก FileAsset แล้ว (ไม่มีไฟล์/ไม่มี storage = ว่าง) */
  photoUrls: string[];
  customer: { id: string; name: string; memberCode: string; tier: string | null };
  service: { id: string | null; name: string } | null;
  staff: { id: string; name: string } | null;
  unit: { id: string; name: string } | null;
  refType: string | null;
  refId: string | null;
  createdAt: string;
  submittedAt: string | null;
  status: ReviewStatusKey;
  replyBody: string | null;
  repliedAt: string | null;
  repliedByName: string | null;
  kanbanCardId: string | null;
  kanbanCardNo: number | null;
  kanbanBoardName: string | null;
  hiddenReason: string | null;
};

export type ReviewListResult = { items: ReviewRow[]; nextCursor: string | null };

export type ReviewDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

export type ReviewStats = {
  /** เฉลี่ยในช่วง (null = ยังไม่มีรีวิว) */
  avg: number | null;
  count: number;
  /** ตอบแล้ว % (0–100 · ปัดจำนวนเต็ม) */
  repliedPct: number;
  replied: number;
  /** รีวิว ≤ escalateBelow ในช่วง */
  lowCount: number;
  /** ในจำนวนนั้นกี่ใบที่มีการ์ดบอร์ดงาน */
  lowCards: number;
  distribution: ReviewDistribution;
  /** จำนวนรีวิว 7 วันล่าสุด (ป้าย "+n สัปดาห์นี้") */
  weekDelta: number;
  /** ยังไม่ตอบ (NEW + ESCALATED ที่ยังไม่มีคำตอบ) — ป้ายชิป "ยังไม่ตอบ n" */
  unreplied: number;
  trend: { week: string; avg: number | null }[];
  days: number;
  escalateBelow: number;
};

export type ShopReviewSummary = { avg: number | null; count: number; distribution: ReviewDistribution };

export type ReviewSummary = { strengths: string; frequent: string; trend: string; cached: boolean; generatedAt: string; month: string };

/** ตัวเลือกตัวกรอง (ภาพ 23: ดาว · บริการ · พนักงาน · สาขา) */
export type ReviewFilterOptions = {
  services: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  units: { id: string; name: string }[];
  boards: { id: string; name: string }[];
};

export type ReviewFilters = {
  rating?: number;
  serviceId?: string;
  staffEmployeeId?: string;
  unitId?: string;
  unreplied?: boolean;
  includeHidden?: boolean;
};

export type ReviewActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** สิ่งที่หน้า LIFF ต้องรู้ก่อนวาด (ไม่มีข้อมูลส่วนตัวของลูกค้าเกินชื่อเล่น/ชื่อต้น) */
export type ReviewLiffView =
  | { state: "open"; shopName: string; serviceName: string | null; firstName: string; rewardPoints: number; maxPhotos: number }
  | { state: "done"; shopName: string; rating: number }
  | { state: "invalid" };

export type ReviewSubmitResult = { reviewId: string; pointsEarned: number; escalated: boolean };

// ───────────────────────── ตัวส่ง (ฉีดจาก composition root) ─────────────────────────

export type ReviewConsent = "GRANTED" | "REVOKED" | "NONE";

/**
 * คำขอส่งข้อความหาลูกค้า 1 ครั้ง (ลิงก์ขอรีวิว หรือคำตอบของร้าน)
 * `kind` = ชื่อแม่แบบในทะเบียนแจ้งเตือน (`REVIEW_REQUEST` · `REVIEW_REPLY`)
 */
export type ReviewSendRequest = {
  tenantId: string;
  memberSystemId: string;
  customerId: string;
  reviewId: string;
  channel: "LINE";
  kind: "REVIEW_REQUEST" | "REVIEW_REPLY";
  /** LINE userId ของลูกค้า ("" = ยังไม่ได้ผูก) */
  to: string;
  consent: ReviewConsent;
  body: string;
};
export type ReviewSendResult = { ok: boolean; error?: string; skipped?: boolean };

/** คำขอเปิดการ์ดบอร์ดงาน (รีวิว ≤ N ดาว) — ตัวเปิดการ์ดปริยายคือ `kanban/links.createCardFromExternal` */
export type ReviewCardRequest = {
  tenantId: string;
  boardId: string;
  title: string;
  description: string | null;
  sourceKey: string;
  assigneeUserIds: string[];
  party: { name: string; phone: string | null } | null;
};
export type ReviewCardResult = { cardId: string; created: boolean; cardNo: number | null };

export type ReviewDeps = {
  line?: (req: ReviewSendRequest) => Promise<ReviewSendResult>;
  kanban?: (req: ReviewCardRequest) => Promise<ReviewCardResult>;
};

// ───────────────────────── ตัวช่วยแสดงผล (บริสุทธิ์) ─────────────────────────

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "18 ส.ค." (วันไทย +07:00 · ไม่พึ่ง timezone ของเครื่อง — กับดัก getDay/UTC) */
export function thaiShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`;
}

/** เดือนไทยปัจจุบัน "YYYY-MM" (ค.ศ.) — กุญแจแคชสรุป AI */
export function thaiMonthKey(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 7 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** วันไทย "YYYY-MM-DD" — ตัดสินว่าแคชสรุปยังเป็นของวันนี้ไหม */
export function thaiDayKey(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 7 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 4.6 / — */
export function ratingText(avg: number | null): string {
  return avg === null ? "—" : avg.toFixed(1);
}

export const emptyDistribution = (): ReviewDistribution => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

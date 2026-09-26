// quotas-shared.ts — ค่าคงที่ · ชนิด · ตัวช่วยงวดเวลาไทยของ "โควตา" CRM (ใบ C3.2 · พิมพ์เขียว §5.9 · §11.6 · addendum ข้อ 1–5)
// 🔴 ไฟล์บริสุทธิ์: ห้าม import อะไรที่ลากถึง prisma/next/server-only (หน้า 'use client' ของโควตา/หน้าแรก import ไฟล์นี้ได้) —
//    เวลาไทยใช้ตัวช่วยกลางที่บริสุทธิ์ `@/lib/core/quiet-hours` (bkkParts/bkkAt) ไม่มีสูตรชุดที่สอง
// 🔴 periodKey เป็น **คริสต์ศักราช** (มติผู้คุมงาน addendum ข้อ 2): "2026-09" · "2026-Q3" · "2026" — รูปเดียวกับงวดเงินเดือน HR /
//    งวดบัญชี / periodKey ของคอมมิชชันที่ C3.3 ส่งให้ HR · ปี พ.ศ. ใช้เป็น "ป้าย" บนหน้าจอเท่านั้น (`periodLabel`)
import { bkkAt, bkkParts } from "@/lib/core/quiet-hours";

// 🔴 ทุกช่วงเวลาเป็น **ครึ่งเปิด** บนเที่ยงคืนเวลาไทย (+07:00 · ไม่มีเวลาออมแสง): เดือน ก.ย. 2026 = [2026-08-31T17:00Z, 2026-09-30T17:00Z)
//    คำนวณด้วยเลขคงที่ 7 ชั่วโมง — ห้ามใช้ getDay()/getDate() ดิบของเครื่อง (เครื่อง prod เป็น UTC)

/** เกณฑ์แจ้ง "ถึงโควตา" (%) — ยิง `crm.quota.reached` ครั้งเดียวต่อ (เจ้าของ · งวด · เกณฑ์) ตลอดไป */
export const QUOTA_THRESHOLDS = [80, 100] as const;
export type QuotaThreshold = (typeof QUOTA_THRESHOLDS)[number];

export const QUOTA_OWNER_TYPES = ["USER", "TEAM"] as const;
export type QuotaOwnerType = (typeof QUOTA_OWNER_TYPES)[number];

export const QUOTA_PERIOD_KINDS = ["MONTH", "QUARTER", "YEAR"] as const;
export type QuotaPeriodKind = (typeof QUOTA_PERIOD_KINDS)[number];

/** ฐานของ "ทำได้" (ตาม `settings.crm.commission.basis` — ค่าเริ่มต้น PAID · พิมพ์เขียว §4.5) */
export type QuotaBasis = "PAID" | "WON";

/** ชนิดกิจกรรมที่ไม่ใช่ "งานของพนักงาน" — ไม่นับในความคืบหน้าโควตา (โน้ต · เว็บ · portal) */
export const QUOTA_ACTIVITY_EXCLUDED = ["NOTE", "WEB", "PORTAL"] as const;

/** เพดานเป้าเงิน (สตางค์) — ต้องเป็นจำนวนเต็มที่ปลอดภัยใน JS */
export const QUOTA_TARGET_MAX = Number.MAX_SAFE_INTEGER;
/** เพดานเป้าดีล/กิจกรรมต่องวด */
export const QUOTA_COUNT_MAX = 1_000_000;
export const QUOTA_NOTE_MAX = 500;

const YEAR_MIN = 2000;
const YEAR_MAX = 2199;

export type QuotaErrorCode = "VALIDATION" | "NOT_FOUND" | "FORBIDDEN";

/** error ของโควตา/หน้าแรก — ข้อความไทยที่ไม่โทษผู้ใช้ · `code` ให้ผู้เรียก (action/REST) แปลงเป็น 400/404/403 */
export class QuotaError extends Error {
  readonly status: number;
  constructor(
    readonly code: QuotaErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QuotaError";
    this.status = code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : 400;
  }
}

/** ปี/เดือน (1–12) ของวันเวลานี้ตามปฏิทินไทย — ตัวช่วยเวลาไทยกลาง `core/quiet-hours.bkkParts` (+07:00 · getUTC* หลังบวก offset) */
function thaiYm(d: Date): { y: number; m: number } {
  const t = bkkParts(d);
  return { y: t.y, m: t.mo + 1 };
}

/** เที่ยงคืนไทยของวันที่ 1 เดือน m (1–13 ได้ = ม.ค. ปีถัดไป) ปี y → เวลา UTC (ฐาน = เที่ยงวัน UTC ของวันที่ 1 ซึ่งเป็นวันที่ 1 ตามเวลาไทยด้วย) */
const thaiMonthStart = (y: number, m: number) => bkkAt(new Date(Date.UTC(y, m - 1, 1, 12)), 0, 0);

/** คีย์งวดของวันเวลานี้ (ปฏิทินไทย) — "2026-09" · "2026-Q3" · "2026" */
export function periodKeyOf(d: Date, kind: QuotaPeriodKind = "MONTH"): string {
  const { y, m } = thaiYm(d);
  if (kind === "YEAR") return String(y);
  if (kind === "QUARTER") return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return `${y}-${String(m).padStart(2, "0")}`;
}

type Parsed = { kind: QuotaPeriodKind; y: number; n: number };

function parse(key: unknown): Parsed | null {
  if (typeof key !== "string") return null;
  let m = /^(\d{4})-(\d{2})$/.exec(key);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    return y >= YEAR_MIN && y <= YEAR_MAX && mo >= 1 && mo <= 12 ? { kind: "MONTH", y, n: mo } : null;
  }
  m = /^(\d{4})-Q([1-4])$/.exec(key);
  if (m) {
    const y = Number(m[1]);
    return y >= YEAR_MIN && y <= YEAR_MAX ? { kind: "QUARTER", y, n: Number(m[2]) } : null;
  }
  m = /^(\d{4})$/.exec(key);
  if (m) {
    const y = Number(m[1]);
    return y >= YEAR_MIN && y <= YEAR_MAX ? { kind: "YEAR", y, n: 0 } : null;
  }
  return null;
}

/** คีย์งวดถูกรูปแบบไหม (ปี ค.ศ. 2000–2199 ⇒ คีย์ พ.ศ. เช่น "2569-10" ไม่ผ่าน) */
export function isPeriodKey(key: unknown): key is string {
  return parse(key) !== null;
}

/** ชนิดของงวดจากคีย์ (คีย์ใช้ไม่ได้ = null) */
export function periodKindOf(key: unknown): QuotaPeriodKind | null {
  return parse(key)?.kind ?? null;
}

/** ข้อความไทยเมื่อคีย์งวดใช้ไม่ได้ — ชี้ทางแก้ (ไม่โทษผู้ใช้) · คีย์ที่ดูเป็นปี พ.ศ. ได้คำใบ้เฉพาะ */
export function periodKeyHint(key: unknown): string {
  const s = typeof key === "string" ? key : "";
  const y = Number(/^(\d{4})/.exec(s)?.[1] ?? NaN);
  if (y >= 2400 && y <= 2800) {
    return `งวดของโควตาใช้ปี ค.ศ. — เช่น ${y - 543}${s.slice(4)} แทน ${s.slice(0, 20)} (หน้าจอจะแสดงเป็นปี พ.ศ. ให้เอง)`;
  }
  return "รูปแบบงวดของโควตาคือ ปี-เดือน (2026-09) · ปี-ไตรมาส (2026-Q3) หรือปี (2026) เป็นปี ค.ศ.";
}

/** ช่วงเวลาของงวด (ครึ่งเปิด · เวลา UTC ของเที่ยงคืนไทย) — คีย์ใช้ไม่ได้ = QuotaError VALIDATION */
export function periodRange(key: string): { from: Date; to: Date } {
  const p = parse(key);
  if (!p) throw new QuotaError("VALIDATION", periodKeyHint(key));
  if (p.kind === "MONTH") return { from: thaiMonthStart(p.y, p.n), to: thaiMonthStart(p.y, p.n + 1) };
  if (p.kind === "QUARTER") return { from: thaiMonthStart(p.y, (p.n - 1) * 3 + 1), to: thaiMonthStart(p.y, p.n * 3 + 1) };
  return { from: thaiMonthStart(p.y, 1), to: thaiMonthStart(p.y + 1, 1) };
}

/** งวดก่อนหน้าชนิดเดียวกัน ("2026-01" → "2025-12" · "2026-Q1" → "2025-Q4" · "2026" → "2025") — ใช้ไม่ได้ = null */
export function prevPeriodKey(key: string): string | null {
  const p = parse(key);
  if (!p) return null;
  // รีวิว N4: ต่ำกว่า YEAR_MIN = ไม่มีงวดก่อนหน้า (ทุกชนิดของงวด — ไม่คืนคีย์ที่ isPeriodKey ปฏิเสธ)
  if (p.kind === "YEAR") return p.y - 1 >= YEAR_MIN ? String(p.y - 1) : null;
  if (p.kind === "QUARTER") return p.n === 1 ? (p.y - 1 >= YEAR_MIN ? `${p.y - 1}-Q4` : null) : `${p.y}-Q${p.n - 1}`;
  return p.n === 1 ? (p.y - 1 >= YEAR_MIN ? `${p.y - 1}-12` : null) : `${p.y}-${String(p.n - 1).padStart(2, "0")}`;
}

/** คีย์งวดทั้งสามชนิดที่ครอบวันเวลานี้ (เดือน · ไตรมาส · ปี) — ใช้ตอนหาโควตาที่เงินก้อนหนึ่ง/ชัยชนะหนึ่งมีผล */
export function periodKeysAt(d: Date): string[] {
  return [periodKeyOf(d, "MONTH"), periodKeyOf(d, "QUARTER"), periodKeyOf(d, "YEAR")];
}

const TH_MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."] as const;

/** ป้ายไทยของงวด (ปี พ.ศ.): "ก.ย. 2569" · "ไตรมาส 3/2569" · "ปี 2569" — คีย์ใช้ไม่ได้ = คืนคีย์เดิม */
export function periodLabel(key: string): string {
  const p = parse(key);
  if (!p) return key;
  const be = p.y + 543;
  if (p.kind === "MONTH") return `${TH_MONTH_SHORT[p.n - 1]} ${be}`;
  if (p.kind === "QUARTER") return `ไตรมาส ${p.n}/${be}`;
  return `ปี ${be}`;
}

/** งวดนี้จบแล้วหรือยัง (ปลายช่วง ≤ now) — แก้โควตาของงวดที่จบแล้วต้องเป็นผู้จัดการขึ้นไป (§11.6) */
export function periodEnded(key: string, now: Date): boolean {
  return periodRange(key).to.getTime() <= now.getTime();
}

/** ฐานของโควตาจาก settings ของระบบ (`settings.crm.commission.basis`) — ไม่ได้ตั้ง/ค่าเพี้ยน = PAID */
export function quotaBasisOf(settings: unknown): QuotaBasis {
  const s = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {};
  const crm = s.crm && typeof s.crm === "object" && !Array.isArray(s.crm) ? (s.crm as Record<string, unknown>) : {};
  const c = crm.commission && typeof crm.commission === "object" && !Array.isArray(crm.commission) ? (crm.commission as Record<string, unknown>) : {};
  return c.basis === "WON" ? "WON" : "PAID";
}

/** % ความคืบหน้า = floor(ทำได้ × 100 / เป้า) · ไม่มีเป้า/เป้า 0 = null (คิดด้วย BigInt — ยอดเกิน 2⁵³ ไม่เพี้ยน) */
export function quotaPct(achieved: number | bigint, target: number | bigint | null | undefined): number | null {
  if (target === null || target === undefined) return null;
  const t = BigInt(target);
  if (t <= BigInt(0)) return null;
  return Number((BigInt(achieved) * BigInt(100)) / t);
}

/** อัตราชนะ = ปัดครึ่งขึ้น(ชนะ × 100 / (ชนะ + แพ้)) · ไม่มีดีลปิดเลย = null (62.5 ⇒ 63) */
export function winRatePct(won: number, lost: number): number | null {
  const n = won + lost;
  if (n <= 0) return null;
  return Math.floor((won * 200 + n) / (2 * n));
}

// ───────────────────────── ชนิดข้อมูลที่ส่งออก (DTO — เงินเป็น number สตางค์) ─────────────────────────

export type QuotaDto = {
  id: string;
  ownerType: QuotaOwnerType;
  ownerId: string;
  periodKey: string;
  targetSatang: number;
  targetDeals: number | null;
  targetActivities: number | null;
  note: string | null;
};

export type SetQuotaInput = {
  ownerType: string;
  ownerId: string;
  periodKey: string;
  targetSatang: number;
  targetDeals?: number | null;
  targetActivities?: number | null;
  note?: string | null;
};

export type QuotaProgressDto = {
  quotaId: string | null;
  won: number;
  deals: number;
  paid: number;
  activities: number;
  targetSatang: number | null;
  targetDeals: number | null;
  targetActivities: number | null;
  basis: QuotaBasis;
  pct: number | null;
};

/** แถวของหน้าตั้งโควตา (ภาพ 10 ขวา "โควตารายเดือน") */
export type QuotaBoardRow = {
  ownerType: QuotaOwnerType;
  ownerId: string;
  name: string;
  quotaId: string | null;
  targetSatang: number | null;
  targetDeals: number | null;
  /** เป้าของทีมที่ไม่ได้ตั้งเอง = รวมเป้าของสมาชิก (แสดงเป็นตัวจาง) */
  derived: boolean;
  achievedSatang: number;
  pct: number | null;
};

export type QuotaBoard = { periodKey: string; periodLabel: string; basis: QuotaBasis; ended: boolean; canEditEnded: boolean; /** พนักงานเกินเพดานของตาราง (500 คน) */ truncated: boolean; rows: QuotaBoardRow[] };

// ───────────────────────── หน้าแรก (home-data.ts) ─────────────────────────

export type HomeFilters = { pipelineId?: string | null; ownerUserId?: string | null; periodKey?: string | null; now?: Date };

export type HomeKpis = {
  periodKey: string;
  openPipeline: { count: number; valueSatang: number };
  weighted: { valueSatang: number };
  /** รีวิวรอบ 2 SF-4: pct = floor(achievedSatang × 100 / เป้า) บนฐานเดียวกับ progress() (`basis` · PAID = เงินรับชำระ · WON = ยอดชนะ) */
  won: { count: number; valueSatang: number; targetSatang: number | null; pct: number | null; basis: QuotaBasis; achievedSatang: number };
  winRate: { pct: number | null; prevPct: number | null; deltaPts: number | null; won: number; lost: number };
  stale: { count: number; valueSatang: number };
  hotLeads: { count: number; threshold: number };
};

export type HomeLeaderRow = { userId: string; name: string; wonSatang: number; wonCount: number; /** ทำได้ตามฐานของโควตา */ achievedSatang: number; targetSatang: number | null; pct: number | null; openDeals: number };
export type HomeLeaderboard = { periodKey: string; basis: QuotaBasis; rows: HomeLeaderRow[] };
export type HomeLeadSources = { periodKey: string; items: { sourceKind: string; count: number }[] };
export type HomeUnowned = { deals: { id: string; title: string; valueSatang: number }[]; contacts: { id: string; name: string }[]; moreDeals: boolean; moreContacts: boolean };
export type HomeData = { kpis: HomeKpis; leaderboard: HomeLeaderboard; leadSources: HomeLeadSources; unowned: HomeUnowned | null };

/** ป้ายไทยของที่มา lead (MemberSource) — ไม่รู้จัก = คีย์เดิม */
export const LEAD_SOURCE_LABEL: Readonly<Record<string, string>> = Object.freeze({
  WALK_IN: "เดินเข้าร้าน",
  POS: "หน้าร้าน",
  BOOKING: "ระบบจอง",
  LINE_OA: "แชท LINE",
  LIFF: "LINE (LIFF)",
  WEB_FORM: "ฟอร์มเว็บ",
  CHAT: "แชท",
  REFERRAL: "ผู้แนะนำ",
  IMPORT: "นำเข้าไฟล์",
  CRM: "เพิ่มเองใน CRM",
  CAMPAIGN: "แคมเปญ",
  API: "เชื่อมต่อ API",
  MARKETPLACE: "มาร์เก็ตเพลส",
  APP: "แอป",
  OTHER: "อื่น ๆ",
});

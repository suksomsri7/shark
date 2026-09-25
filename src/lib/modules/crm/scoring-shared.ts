// scoring-shared.ts — ทะเบียน/ค่าคงที่/ตัวช่วยบริสุทธิ์ของ "คะแนนผู้ติดต่อ" (ใบ C2.8 · พิมพ์เขียว §5.7 §4.5 §7.1 · ภาพ 05)
//
// 🔴 ไฟล์บริสุทธิ์: ไม่แตะ prisma / next / server-only / ./db — หน้า (server) อ่านแล้วส่งต่อให้ตัวจัดการฝั่ง client เป็น props
//    (ไฟล์ 'use client' นอกโฟลเดอร์ CRM import ไฟล์นี้ตรงไม่ได้ — fitness F2.3) · เอนจิน `scoring.ts` ใช้ชุดเดียวกัน
// 🔴 ค่าเริ่มต้นของระดับคะแนน (พิมพ์เขียว §4.5): `settings.crm.scoring = { hot: 50, warm: 20, decayDays: 30 }`
// 🔴 `bandOf` เป็นตัวตัดสินระดับที่เดียวของระบบ (≥ hot ร้อน · ≥ warm อุ่น · ต่ำกว่านั้นเย็น ⇒ 0 = เย็น
//    ⇒ `CrmContact.scoreBand` ไม่เป็น null อีกตั้งแต่เหตุการณ์ให้คะแนนใบแรก)

import { AUTOMATION_EVENTS } from "@/lib/automation/labels";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/labels";
import { CENTRAL_SCORE_RULES } from "./templates/business/central";
import { DAY_MS, TH_OFFSET_MS, thaiDayKey, thaiDayStartMs } from "./activities-shared";

export { DAY_MS, TH_OFFSET_MS, thaiDayKey, thaiDayStartMs };

// ───────────────────────── ระดับคะแนน (band) ─────────────────────────

export type ScoreBand = "HOT" | "WARM" | "COLD";

/** พิมพ์เขียว §4.5 — ค่าเริ่มต้นอยู่ "ในตัวอ่าน" (ระบบที่ยังไม่ตั้งค่าต้องได้ค่าที่ใช้งานได้) */
export const SCORING_DEFAULTS: Readonly<{ hot: number; warm: number; decayDays: number }> = Object.freeze({ hot: 50, warm: 20, decayDays: 30 });

export const SCORE_BAND_VALUES: readonly ScoreBand[] = Object.freeze(["HOT", "WARM", "COLD"]);
export const SCORE_BAND_LABELS: Readonly<Record<ScoreBand, string>> = Object.freeze({ HOT: "ร้อน", WARM: "อุ่น", COLD: "เย็น" });

/**
 * ระดับของคะแนน — ตัวตัดสินที่เดียว (บริการ · งานรายวัน · หน้าจอ ใช้ตัวนี้ตัวเดียว)
 * `≥ hot` ร้อน · `≥ warm` อุ่น · ต่ำกว่านั้นเย็น (0 ⇒ เย็น — ไม่ใช่ "ไม่มีระดับ")
 */
export function bandOf(score: number, opts: { hot: number; warm: number }): ScoreBand {
  const n = Number.isFinite(score) ? score : 0;
  if (n >= opts.hot) return "HOT";
  if (n >= opts.warm) return "WARM";
  return "COLD";
}

// ───────────────────────── เพดาน / ค่าคงที่ ─────────────────────────

export const SCORE_EXPLAIN_LIMIT = 3; // ภาพ 05 โชว์เหตุผล 3 ชิ้น
export const SCORE_EXPLAIN_LIMIT_MAX = 50;
export const SCORE_POINTS_MIN = -1000;
export const SCORE_POINTS_MAX = 1000;
export const SCORE_RULE_NAME_MAX = 120;
export const SCORE_EXPIRES_DAYS_MAX = 3650;
export const SCORE_MAX_PER_DAY_MAX = 1000;
export const SCORE_MAX_CONDITIONS = 20;
export const SCORE_DECAY_BATCH = 500;
export const SCORE_DECAY_DAYS_MAX = 3650;
export const SCORE_DELETE_REASON_MIN = 5;
export const SCORE_RECOMPUTE_REASON_MIN = 5;
export const SCORE_INACTIVE_DEFAULT_DAYS = 30;
export const SCORE_REASON_MAX = 200;

/** event เสมือน "เงียบหายไป n วัน" — ไม่มีตัวยิง ไม่มี consumer (R-B): งานรายวันเป็นคนตัดสิน */
export const SCORE_INACTIVE_EVENT = "crm.contact.inactive";
export const SCORE_INACTIVE_LABEL = "เมื่อผู้ติดต่อเงียบหายไปตามจำนวนวันที่ตั้งไว้";

// ───────────────────────── ทะเบียน event ที่กฎคะแนนอ้างได้ ─────────────────────────

/**
 * event ที่ **ไม่ได้** อยู่ใน `AUTOMATION_EVENTS` แต่มี consumer และเป็นสัญญาณของลูกค้าที่ร้านจะให้คะแนนได้จริง
 * (ประกาศป้ายไว้ที่ `webhooks/labels.ts` — ทะเบียนเดียวกันนั้น ไม่ประกาศป้ายใหม่ที่นี่)
 * 🔴 `forms.submission.received` ตัวเดียวที่ไม่มีป้ายในทะเบียนใด (เก่ากว่าทะเบียน) ⇒ ป้ายไทยเขียนไว้ที่นี่
 *    (`crm.deal.quotation.issued` ย้ายไปประกาศที่ `automation/labels.ts` แล้ว — ใบ C2.8 รอบแก้: มีตัวยิงใน `deals.ts` + consumer จริง)
 */
const NON_AUTOMATION_SCORE_EVENTS: readonly string[] = Object.freeze([
  "forms.submission.received",
  "chat.message.received",
  "crm.email.sent",
  "crm.email.received",
  "crm.email.opened",
  "crm.email.clicked",
  "crm.email.replied",
  "crm.email.bounced",
  "crm.web.identified",
]);

const LOCAL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "forms.submission.received": "เมื่อลูกค้ากรอกฟอร์มบนเว็บ",
});

const labelOf = (value: string): string =>
  AUTOMATION_EVENTS.find((e) => e.value === value)?.label ?? WEBHOOK_EVENTS.find((e) => e.value === value)?.label ?? LOCAL_LABELS[value] ?? value;

export type ScoreRuleEventDef = { value: string; label: string };

/**
 * event ที่กฎคะแนนเลือกได้ = ทุก `crm.*` / `custom.record.*` ของ `AUTOMATION_EVENTS` + สัญญาณลูกค้าที่ประกาศไว้ที่
 * `webhooks/labels.ts` + event **เสมือน** `crm.contact.inactive` (ตัวเดียวที่ไม่มีตัวยิง/ตัวบริโภคในระบบคิว)
 */
export const SCORE_RULE_EVENTS: readonly ScoreRuleEventDef[] = Object.freeze([
  ...AUTOMATION_EVENTS.filter((e) => e.value.startsWith("crm.") || e.value.startsWith("custom.record."))
    .filter((e) => !e.value.startsWith("crm.score.")) // คะแนนเปลี่ยน/ข้ามระดับ = ผลของการให้คะแนน ไม่ใช่เหตุให้คะแนน (กันวน)
    .map((e) => ({ value: e.value, label: e.label })),
  ...NON_AUTOMATION_SCORE_EVENTS.map((v) => ({ value: v, label: labelOf(v) })),
  { value: SCORE_INACTIVE_EVENT, label: SCORE_INACTIVE_LABEL },
].map((e) => Object.freeze(e)));

export const SCORE_RULE_EVENT_VALUES: ReadonlySet<string> = new Set(SCORE_RULE_EVENTS.map((e) => e.value));

/** event ที่ "สะพานคะแนน" ถูกเสียบเข้ากับ consumer ของมัน (ที่เหลือยังไม่มี consumer ให้เสียบ — ดูหัวไฟล์ crm-bridges/scoring.ts) */
export const SCORE_BRIDGE_EVENTS: readonly string[] = Object.freeze([
  "forms.submission.received",
  "chat.message.received",
  "crm.activity.completed",
  "crm.email.opened",
  "crm.email.clicked",
  "crm.email.received",
  "crm.web.identified",
  // ใบ C2.8 รอบแก้: `deals.ts` ยิง `crm.deal.quotation.issued` ใน tx เดียวกับการผูก `quotationDocId` แล้ว + มี consumer
  //   ⇒ กฎเริ่มต้น "ได้รับใบเสนอราคา" (+8) ทำงานจริง (ก่อนหน้านี้เป็นหนี้: กฎมีแต่ไม่มีใครยิง)
  "crm.deal.quotation.issued",
]);

/**
 * 🔴 **เหตุการณ์ที่กฎคะแนน "ตั้งได้จริง"** = ตัวที่มีทางเดินมาถึง `onEvent` เท่านั้น =
 *    `SCORE_BRIDGE_EVENTS` (มีสะพาน + consumer) + event เสมือน `crm.contact.inactive` (งานรายวันเป็นคนตัดสิน)
 *    ⇒ `createRule`/`updateRule` และช่องเลือกบนหน้าจอใช้ชุดนี้ ไม่ใช่ `SCORE_RULE_EVENTS` ทั้งทะเบียน:
 *    กฎที่ตั้งบน event ซึ่งไม่มีใครส่งมาให้คะแนน = กฎที่ไม่มีวันทำงาน (ร้านตั้งแล้วรอเก้อ — มติผู้คุมงานรอบแก้ 25 ก.ย.)
 *    `SCORE_RULE_EVENTS` ยังเป็นทะเบียน "ป้ายไทยของ event ที่เคยอ้างได้" ไว้อ่านชื่อกฎเก่า/กฎที่ระบบสร้างให้
 */
export const SCORE_RULE_EVENT_CHOICES: readonly string[] = Object.freeze([...SCORE_BRIDGE_EVENTS, SCORE_INACTIVE_EVENT]);

export const SCORE_RULE_CHOICE_VALUES: ReadonlySet<string> = new Set(SCORE_RULE_EVENT_CHOICES);

// ───────────────────────── กฎเริ่มต้น 8 ข้อ (ข้อมูลของ C1.11) ─────────────────────────

/** คีย์ของกฎเริ่มต้น 8 ข้อ — "ตัวตน" ของกฎที่ระบบสร้างให้ เก็บไว้ที่ `CrmScoreRule.conditions.seedKey` (ตารางไม่มีคอลัมน์ key) */
export const SCORE_SEED_KEYS: readonly string[] = Object.freeze(CENTRAL_SCORE_RULES.map((r) => r.key));

// ───────────────────────── ชนิดที่หน้าจอใช้ ─────────────────────────

export type ScoreRuleConditionInput = { field: string; op: string; value?: unknown };
export type ScoreRuleConditions = { mode?: "AND" | "OR"; items?: ScoreRuleConditionInput[]; days?: number | null; seedKey?: string };

export type ScoreRuleInput = {
  name: string;
  event: string;
  points: number;
  conditions?: ScoreRuleConditions | null;
  expiresDays?: number | null;
  maxPerDay?: number | null;
  active?: boolean;
};

export type ScoreRuleDto = {
  id: string;
  name: string;
  event: string;
  eventLabel: string;
  points: number;
  conditions: { mode: "AND" | "OR"; items: ScoreRuleConditionInput[]; days: number | null };
  expiresDays: number | null;
  maxPerDay: number | null;
  active: boolean;
  isSystem: boolean;
  sortOrder: number;
  seedKey: string | null;
};

export type ScoreExplainItem = {
  logId: string;
  points: number;
  reason: string;
  ruleId: string | null;
  refType: string | null;
  refId: string | null;
  at: string;
  expiresAt: string | null;
};

export type ScoreExplain = { score: number; band: ScoreBand; items: ScoreExplainItem[] };

export type ScoringSettings = { hot: number; warm: number; decayDays: number };

/** ป้ายของ event ในกฎ (ไม่รู้จัก = คืนโค้ดเดิม) — หน้าจอใช้ตัวนี้ ไม่พิมพ์ป้ายซ้ำ */
export const scoreEventLabel = (value: string): string =>
  SCORE_RULE_EVENTS.find((e) => e.value === value)?.label ?? value;

/** "เมื่อวาน/2 วันก่อน/..." สำหรับชิปเหตุผล (ภาพ 05) — บริสุทธิ์ ไม่แตะ locale ของเครื่อง */
export function scoreAgoLabel(at: string | Date, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(at).getTime();
  if (!Number.isFinite(ms)) return "";
  if (ms < 60 * 60_000) return "ไม่ถึงชั่วโมง";
  if (ms < DAY_MS) return `${Math.floor(ms / (60 * 60_000))} ชั่วโมงก่อน`;
  const days = Math.floor(ms / DAY_MS);
  if (days === 1) return "เมื่อวาน";
  if (days < 31) return `${days} วันก่อน`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} เดือนก่อน` : `${Math.floor(days / 365)} ปีก่อน`;
}

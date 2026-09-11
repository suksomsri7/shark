// journeys-shared.ts — ส่วนที่ "หน้าจอกับเซิร์ฟเวอร์ใช้ร่วมกัน" ของ journey อัตโนมัติ (M3.3 · ภาพ 07 บน · 22)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่ import prisma / env / facade / Next — เพราะตัวสร้าง journey เป็น
//    client component ที่ต้องใช้ทะเบียนทริกเกอร์/การกระทำ + ป้ายไทยชุดเดียวกับเอนจิน ถ้าไปดึงจาก
//    `journeys.ts` ตัวบันเดิลจะลาก `core/db.ts → @prisma/adapter-pg → pg` เข้าเบราว์เซอร์แล้ว
//    `next build` พังทันที (บทเรียน M3.1 · 11 ก.ย. 2569 — tsc ผ่านแต่ build ไม่ผ่าน)
// 🔴 ของที่ต้อง "ถามฐานข้อมูล" (นับ/ทดลองรัน/บันทึก) อยู่ที่ `journeys.ts` และเรียกจากหน้าจอผ่าน
//    server action ใน `journeys-actions.ts` เท่านั้น

import type { SegmentDefinition } from "./segments-shared";

// ───────────────────────── กติกาตัวเลข (§11.6) ─────────────────────────

/** การกระทำสูงสุดต่อ journey (รวมขั้นที่ซ้อนใน "รอ n วัน") */
export const JOURNEY_MAX_ACTIONS = 20;
/** "รอ n วัน" นานสุดกี่วัน — เกินกว่านี้ลูกค้าลืมไปแล้ว และคิวค้างยาวเกินจะดูแล */
export const JOURNEY_MAX_WAIT_DAYS = 90;
/** ซ้อน "รอ n วัน" ได้ลึกสุดกี่ชั้น (1 = ในขั้นที่รออยู่ มีขั้นที่รอได้อีกชั้นเดียว) */
export const JOURNEY_MAX_WAIT_DEPTH = 1;
/** กันไว้เป็นกลุ่มเทียบได้สูงสุดกี่ % (มากกว่านี้คือเสียโอกาสขายมากกว่าที่จะได้ความรู้) */
export const JOURNEY_MAX_HOLDOUT_PCT = 50;
/** หน้าต่างวัดผล "เข้าแล้วซื้อ/ใช้สิทธิ์ภายในกี่วัน" */
export const JOURNEY_ATTRIBUTION_DAYS = 30;

// ───────────────────────── ทริกเกอร์ ─────────────────────────

export type JourneyTriggerParamKey = "daysBefore" | "days";

export type JourneyTriggerDef = {
  value: string;
  /** ป้ายไทยที่ผู้ใช้เห็นในประโยค "เมื่อ …" */
  label: string;
  /** กลุ่มไว้จัดหมวดใน dropdown */
  group: string;
  /** ทริกเกอร์ที่มีพารามิเตอร์ (cron รายวันเป็นคนยิง event ให้) */
  param?: { key: JourneyTriggerParamKey; label: string; unit: string; def: number; min: number; max: number };
  /** true = เกิดจาก cron รายวัน ไม่ใช่การกระทำของคน (ใช้ทดลองรันย้อนหลังแบบ "ใครเข้าเกณฑ์ตอนนี้") */
  cron?: boolean;
};

/**
 * ทริกเกอร์ที่ journey เลือกได้ (§7.3)
 *
 * 🔴 ทุกตัวในลิสต์นี้ **ต้องเป็น event ที่มี consumer ใน `src/lib/outbox-consumers.ts` แล้ว**
 *    ไม่งั้น event ค้าง PENDING แล้วคิวทั้งระบบตันเงียบ ๆ (`reference_outbox_new_event_needs_consumer`)
 * 🔴 ทริกเกอร์ของรีวิว (`review.*`) และแนะนำเพื่อน (`referral.*`) มาพร้อมใบที่ยิง event จริง
 *    (M3.4 / M3.5) — ลงทะเบียนที่นี่ตอนนั้น ไม่ใช่ตอนนี้ (ทริกเกอร์ที่ไม่มีใครยิง = กับดักให้ร้านตั้งแล้วรอเก้อ)
 */
export const JOURNEY_TRIGGERS: readonly JourneyTriggerDef[] = Object.freeze([
  // — รอบเวลา (cron รายวันเป็นคนยิงให้) —
  {
    value: "member.birthday.upcoming",
    label: "ก่อนวันเกิดสมาชิก",
    group: "รอบเวลา",
    cron: true,
    param: { key: "daysBefore", label: "ล่วงหน้า", unit: "วัน", def: 7, min: 0, max: 60 },
  },
  {
    value: "member.inactive",
    label: "ไม่ซื้อ/ไม่จองมานาน",
    group: "รอบเวลา",
    cron: true,
    param: { key: "days", label: "หายไป", unit: "วัน", def: 60, min: 7, max: 720 },
  },
  {
    value: "member.tier.review_due",
    label: "ใกล้ถึงรอบทบทวนระดับ",
    group: "รอบเวลา",
    cron: true,
    param: { key: "daysBefore", label: "ล่วงหน้า", unit: "วัน", def: 30, min: 1, max: 90 },
  },
  // — สมาชิก —
  { value: "member.created", label: "มีสมาชิกใหม่", group: "สมาชิก" },
  { value: "member.updated", label: "ข้อมูลสมาชิกถูกแก้ไข", group: "สมาชิก" },
  { value: "member.merged", label: "รวมสมาชิกที่ซ้ำกัน", group: "สมาชิก" },
  { value: "member.identity.linked", label: "ผูกช่องทางติดต่อเข้ากับสมาชิก", group: "สมาชิก" },
  { value: "member.consent.changed", label: "ความยินยอมของสมาชิกเปลี่ยน", group: "สมาชิก" },
  // — ระดับ —
  { value: "member.tier.changed", label: "ระดับสมาชิกเปลี่ยน", group: "ระดับ" },
  { value: "member.tier.at_risk", label: "สมาชิกเสี่ยงหลุดระดับ", group: "ระดับ" },
  // — แต้ม —
  { value: "point.earned", label: "สมาชิกได้แต้ม", group: "แต้ม" },
  { value: "point.burned", label: "สมาชิกใช้แต้ม", group: "แต้ม" },
  { value: "point.expiring", label: "แต้มใกล้หมดอายุ", group: "แต้ม" },
  { value: "point.expired", label: "แต้มหมดอายุ", group: "แต้ม" },
  { value: "point.transferred", label: "สมาชิกโอนแต้มให้กัน", group: "แต้ม" },
  // — สแตมป์ / รางวัล —
  { value: "stamp.added", label: "สมาชิกได้รับตราสะสม", group: "สแตมป์และรางวัล" },
  { value: "stamp.completed", label: "สมาชิกสะสมตราครบใบ", group: "สแตมป์และรางวัล" },
  { value: "stamp.expired", label: "ใบสะสมตราหมดอายุ", group: "สแตมป์และรางวัล" },
  { value: "reward.redeemed", label: "สมาชิกแลกของรางวัล", group: "สแตมป์และรางวัล" },
  { value: "reward.fulfilled", label: "ส่งมอบของรางวัลแล้ว", group: "สแตมป์และรางวัล" },
  // — voucher / บัตรกำนัล —
  { value: "voucher.issued", label: "สมาชิกได้รับ voucher", group: "สิทธิ์และบัตร" },
  { value: "voucher.used", label: "ลูกค้าใช้ voucher", group: "สิทธิ์และบัตร" },
  { value: "voucher.expiring", label: "voucher ใกล้หมดอายุ", group: "สิทธิ์และบัตร" },
  { value: "voucher.expired", label: "voucher หมดอายุ", group: "สิทธิ์และบัตร" },
  { value: "giftcard.sold", label: "ขายบัตรกำนัล", group: "สิทธิ์และบัตร" },
  { value: "giftcard.used", label: "ลูกค้าใช้บัตรกำนัล", group: "สิทธิ์และบัตร" },
  // — หน้าร้าน —
  { value: "pos.sale.paid", label: "ปิดบิลขาย", group: "หน้าร้าน" },
  { value: "booking.completed", label: "ลูกค้ามาตามนัดจริง", group: "หน้าร้าน" },
  { value: "booking.no_show", label: "จองแล้วไม่มา", group: "หน้าร้าน" },
  // 🔴 ไม่มี `campaign.sent` / `chat.contact.linked` โดยตั้งใจ: journey เดินทีละ "คน" ⇒ ทริกเกอร์ต้องบอกได้ว่า
  //    เป็นเรื่องของสมาชิกคนไหน · campaign.sent เป็นเหตุการณ์ระดับแคมเปญ (ไม่มีลูกค้า) = ตั้งแล้วไม่มีวันวิ่ง
] as const);

/** ชุด event ที่ journey ฟังอยู่ — เอนจินเช็คตัวนี้ก่อนแตะฐานข้อมูล (event อื่นทั้งระบบผ่านไปทันที) */
export const JOURNEY_TRIGGER_EVENTS: ReadonlySet<string> = new Set(JOURNEY_TRIGGERS.map((t) => t.value));

export const journeyTriggerDef = (event: string): JourneyTriggerDef | undefined =>
  JOURNEY_TRIGGERS.find((t) => t.value === event);

export const journeyTriggerLabel = (event: string): string => journeyTriggerDef(event)?.label ?? event;

/** ทริกเกอร์ที่ cron รายวันเป็นคนยิง event ให้ (ตัวอื่นมาจากการกระทำจริงในระบบ) */
export const JOURNEY_CRON_TRIGGERS: readonly string[] = Object.freeze(
  JOURNEY_TRIGGERS.filter((t) => t.cron).map((t) => t.value),
);

// ───────────────────────── การกระทำ ─────────────────────────

export const JOURNEY_ACTION_TYPES = [
  "ISSUE_VOUCHER",
  "GIVE_POINTS",
  "SEND_LINE",
  "SEND_EMAIL",
  "SEND_SMS",
  "SEND_PUSH",
  "ADD_TAG",
  "REMOVE_TAG",
  "WAIT_THEN",
  "OPEN_KANBAN_CARD",
  "NOTIFY_STAFF",
  "REQUEST_REVIEW",
] as const;

export type JourneyActionType = (typeof JOURNEY_ACTION_TYPES)[number];

export const JOURNEY_ACTION_LABELS: Readonly<Record<JourneyActionType, string>> = Object.freeze({
  ISSUE_VOUCHER: "ออก voucher",
  GIVE_POINTS: "ให้แต้ม",
  SEND_LINE: "ส่งข้อความ LINE",
  SEND_EMAIL: "ส่งอีเมล",
  SEND_SMS: "ส่ง SMS",
  SEND_PUSH: "ส่งแจ้งเตือนในแอป",
  ADD_TAG: "ติดแท็ก",
  REMOVE_TAG: "เอาแท็กออก",
  WAIT_THEN: "รอแล้วค่อยทำต่อ",
  OPEN_KANBAN_CARD: "เปิดการ์ดงานให้ทีม",
  NOTIFY_STAFF: "แจ้งพนักงาน",
  REQUEST_REVIEW: "ขอรีวิว",
});

export const journeyActionLabel = (type: string): string =>
  JOURNEY_ACTION_LABELS[type as JourneyActionType] ?? type;

/** ช่องทางที่การกระทำนั้นส่งออก (ใช้ตรวจความยินยอมก่อนส่งจริง) — null = ไม่ได้ส่งถึงลูกค้า */
export const JOURNEY_ACTION_CHANNEL: Readonly<Record<string, "LINE" | "EMAIL" | "SMS" | "PUSH">> = Object.freeze({
  SEND_LINE: "LINE",
  SEND_EMAIL: "EMAIL",
  SEND_SMS: "SMS",
  SEND_PUSH: "PUSH",
});

export type JourneyChannel = "LINE" | "EMAIL" | "SMS" | "PUSH";

export const JOURNEY_CHANNEL_LABELS: Readonly<Record<JourneyChannel, string>> = Object.freeze({
  LINE: "LINE",
  EMAIL: "อีเมล",
  SMS: "SMS",
  PUSH: "แจ้งเตือนในแอป",
});

/** ต้นทุนโดยประมาณต่อ 1 ข้อความ (สตางค์) — ใช้คิด ROI เท่านั้น ไม่ใช่ใบเสร็จ */
export const JOURNEY_CHANNEL_COST_SATANG: Readonly<Record<JourneyChannel, number>> = Object.freeze({
  LINE: 15,
  EMAIL: 2,
  SMS: 60,
  PUSH: 0,
});

// ───────────────────────── ชนิดข้อมูล ─────────────────────────

export type JourneyAction = { type: string; params?: Record<string, unknown> };

export type JourneyTrigger = { event: string; params?: Record<string, unknown> };

export type SaveJourneyInput = {
  name: string;
  trigger: JourneyTrigger;
  /** เงื่อนไขชุดเดียวกับกลุ่มลูกค้า (M3.1) — `{ groups: [] }` = ไม่กรองใคร */
  conditions: SegmentDefinition | unknown;
  actions: JourneyAction[];
  holdoutPct: number;
  /** null = เข้าได้ครั้งเดียวตลอดชีพ */
  reentryDays?: number | null;
  enabled: boolean;
};

export type JourneyStats30d = {
  entered: number;
  used: number;
  saleSatang: number;
  costSatang: number;
  roi: number;
};

export type JourneyListRow = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: JourneyTrigger;
  /** ประโยคไทยย่อใต้ชื่อ ("7 วันก่อนวันเกิด · ระดับ ≥ Silver") */
  summary: string;
  stats30d: JourneyStats30d;
};

export type JourneyDto = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: JourneyTrigger;
  conditions: SegmentDefinition;
  actions: JourneyAction[];
  holdoutPct: number;
  reentryDays: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type JourneyStepView = {
  index: number;
  kind: "TRIGGER" | "CONDITION" | "ACTION" | "WAIT";
  /** ป้ายบนการ์ด ("เมื่อ (trigger)" · "ถ้า (เงื่อนไข)" · "ให้ทำ" · "รอ 7 วัน") */
  tag: string;
  title: string;
  note: string;
  count: number;
  countLabel: string;
};

export type JourneyDryRun = {
  candidates: number;
  wouldEnter: number;
  holdout: number;
  skippedByConditions: number;
  perStep: { index: number; type: string; label: string; count: number }[];
};

export type JourneyRecentRow = {
  customerId: string;
  name: string;
  enteredAt: Date;
  stepLabel: string;
  status: string;
  used: boolean;
};

export type JourneyStatsView = {
  entered: number;
  perStep: { index: number; label: string; count: number }[];
  holdout: { entered: number; converted: number; convertedPct: number };
  results: { sent: number; used: number; usedPct: number; saleSatang: number; costSatang: number; roi: number };
  /** usedPct − holdout.convertedPct — "ผลจริงที่เกิดจาก journey นี้" (จุด) */
  uplift: number;
  daily: { date: string; used: number }[];
  recent: JourneyRecentRow[];
};

// ───────────────────────── ตัวแปรในข้อความ ─────────────────────────

export const JOURNEY_VARS: readonly { token: string; label: string }[] = Object.freeze([
  { token: "{ชื่อ}", label: "ชื่อสมาชิก" },
  { token: "{ระดับ}", label: "ระดับสมาชิก" },
  { token: "{voucher}", label: "รหัส voucher ที่เพิ่งออกให้" },
  { token: "{แต้ม}", label: "แต้มคงเหลือ" },
  { token: "{รหัสสมาชิก}", label: "รหัสสมาชิก" },
]);

export type JourneyMessageVars = {
  ชื่อ: string;
  ระดับ: string;
  voucher: string;
  แต้ม: string;
  รหัสสมาชิก: string;
};

/**
 * แทนตัวแปรในข้อความ (กติกาเดียวกับแคมเปญ M3.2)
 * 🔴 ตัวแปรที่ "รู้จักแต่ยังไม่มีค่า" ต้องกลายเป็นค่าว่าง ไม่ใช่ค้างเป็นวงเล็บ — ลูกค้าจริงจะได้ข้อความว่า
 *    "รับ voucher {voucher} ได้เลย" ซึ่งดูเหมือนระบบพัง · ตัวแปรที่ไม่รู้จักปล่อยไว้เหมือนเดิม
 *    (อาจเป็นวงเล็บที่ร้านตั้งใจพิมพ์เอง)
 */
export function renderJourneyMessage(template: string, vars: Partial<JourneyMessageVars>): string {
  const map = vars as Record<string, string | undefined>;
  return String(template ?? "")
    .replace(/\{([^{}]+)\}/g, (whole, key: string) => {
      const v = map[key.trim()];
      return v === undefined ? whole : v;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// ───────────────────────── ประโยคไทยของทริกเกอร์/การกระทำ ─────────────────────────

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** "7 วันก่อนวันเกิดสมาชิก" · "ไม่ซื้อ/ไม่จอง 60 วัน" · "มีสมาชิกใหม่" */
export function describeTrigger(trigger: JourneyTrigger | null | undefined): string {
  if (!trigger?.event) return "ยังไม่ได้เลือกทริกเกอร์";
  const def = journeyTriggerDef(trigger.event);
  if (!def) return trigger.event;
  if (!def.param) return def.label;
  const v = num(trigger.params?.[def.param.key], def.param.def);
  if (def.value === "member.birthday.upcoming") return `${v} วันก่อนวันเกิดสมาชิก`;
  if (def.value === "member.inactive") return `ไม่ซื้อ/ไม่จอง ${v} วัน`;
  if (def.value === "member.tier.review_due") return `${v} วันก่อนรอบทบทวนระดับ`;
  return `${def.label} ${v} ${def.param.unit}`;
}

/** ประโยคไทยสั้น ๆ ของการกระทำ 1 ขั้น (การ์ดขั้นตอน + ตารางหน้ารวมใช้ตัวเดียวกัน) */
export function describeAction(action: JourneyAction): string {
  const p = action.params ?? {};
  switch (action.type) {
    case "ISSUE_VOUCHER":
      return "ออก voucher ให้สมาชิก";
    case "GIVE_POINTS":
      return `ให้แต้ม ${num(p.points, 0).toLocaleString("th-TH")} แต้ม`;
    case "SEND_LINE":
      return "ส่งข้อความ LINE";
    case "SEND_EMAIL":
      return `ส่งอีเมล${str(p.subject) ? ` "${str(p.subject)}"` : ""}`;
    case "SEND_SMS":
      return "ส่ง SMS";
    case "SEND_PUSH":
      return "ส่งแจ้งเตือนในแอป";
    case "ADD_TAG":
      return `ติดแท็ก "${str(p.tag)}"`;
    case "REMOVE_TAG":
      return `เอาแท็ก "${str(p.tag)}" ออก`;
    case "WAIT_THEN":
      return `รอ ${num(p.days, 0)} วัน${p.ifVoucherUnused === true ? " (ถ้ายังไม่ใช้ voucher)" : ""}`;
    case "OPEN_KANBAN_CARD":
      return "เปิดการ์ดงานให้ทีม";
    case "NOTIFY_STAFF":
      return "แจ้งพนักงาน";
    case "REQUEST_REVIEW":
      return "ขอรีวิวจากลูกค้า";
    default:
      return journeyActionLabel(action.type);
  }
}

/** ขั้นที่ซ้อนอยู่ใน WAIT_THEN (ไม่มี = ลิสต์ว่าง) */
export function thenActionsOf(action: JourneyAction): JourneyAction[] {
  const raw = action.params?.thenActions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is JourneyAction => !!a && typeof a === "object" && typeof (a as JourneyAction).type === "string");
}

/** นับการกระทำทั้งหมดรวมที่ซ้อนอยู่ใน "รอ n วัน" (ใช้กับเพดาน 20) */
export function countActions(actions: JourneyAction[]): number {
  let n = 0;
  for (const a of actions) n += 1 + countActions(thenActionsOf(a));
  return n;
}

export type FlatJourneyStep = {
  /** เลขขั้นแบบไล่ลึกก่อน (ขั้นที่ซ้อนใน "รอ n วัน" ต่อท้ายขั้นรอของมันเอง) — ตรงกับ AutomationRun.stepIndex */
  index: number;
  depth: number;
  action: JourneyAction;
  /** เลขขั้นของ "รอ n วัน" ที่ครอบขั้นนี้อยู่ (null = ขั้นระดับบนสุด) */
  parent: number | null;
};

/**
 * เรียงทุกขั้นเป็นแถวเดียวแบบไล่ลึกก่อน — เลขขั้นชุดเดียวกันใช้ทั้งเอนจิน (stepIndex ของแถวที่รอเวลา)
 * สถิติรายขั้น และการ์ดขั้นตอนในหน้ารายละเอียด ⇒ นับตรงกันทุกที่
 */
export function flattenActions(actions: JourneyAction[], start = 0, depth = 0, parent: number | null = null): FlatJourneyStep[] {
  const out: FlatJourneyStep[] = [];
  let i = start;
  for (const a of actions) {
    out.push({ index: i, depth, action: a, parent });
    const inner = thenActionsOf(a);
    const nested = flattenActions(inner, i + 1, depth + 1, i);
    out.push(...nested);
    i += 1 + countActions(inner);
  }
  return out;
}

/** ผลของ server action ของหน้า journey (อยู่ไฟล์บริสุทธิ์ — ไฟล์ "use server" ห้าม export ชนิด) */
export type JourneyActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** ประโยคไทยย่อของทั้ง journey — ใช้ใต้ชื่อในตาราง "Journey ที่เปิดใช้อยู่" */
export function describeJourney(trigger: JourneyTrigger, actions: JourneyAction[], conditionSummary: string): string {
  const head = describeTrigger(trigger);
  const tail = actions.slice(0, 2).map(describeAction).join(" · ");
  return [head, conditionSummary, tail].filter(Boolean).join(" · ");
}

/** ROI = (ยอดที่เกิด − ต้นทุน) ÷ ต้นทุน · ต้นทุน 0 = ยังวัดไม่ได้ (คืน 0) */
export function journeyRoi(saleSatang: number, costSatang: number): number {
  if (costSatang <= 0) return 0;
  return Math.round(((saleSatang - costSatang) / costSatang) * 10) / 10;
}

// ───────────────────────── ตัวส่ง (ฉีดแทนได้) ─────────────────────────
//
// 🔴 ชนิดอยู่ในไฟล์บริสุทธิ์นี้ เพื่อให้ `journeys.ts` อ้างชนิดได้โดยไม่ต้อง import ตัวส่งจริง
//    (ตัวส่งจริงอยู่ `journey-senders.ts` ซึ่งลากแชท/บอร์ดงาน/อีเมลเข้ามา — โหลดตอนจะส่งเท่านั้น)

/**
 * ความยินยอม ณ เวลาส่ง ของช่องทางนั้น
 *   GRANTED = มีแถวยินยอม · REVOKED = มีแถวแต่ถอน/ปฏิเสธไว้ · NONE = ไม่เคยให้คำตอบ
 * 🔴 เอนจินหยุดเองเฉพาะ REVOKED (ลูกค้าบอกชัดว่าไม่เอา — ห้ามส่งไม่ว่าตัวส่งจะเป็นอะไร)
 *    ตัวส่งจริงปริยาย (`src/lib/member-journey-senders.ts`) ส่งเฉพาะ GRANTED (§7.1 เงียบ ≠ ยินยอม)
 */
export type JourneyConsent = "GRANTED" | "REVOKED" | "NONE";

export type JourneySendRequest = {
  tenantId: string;
  memberSystemId: string;
  journeyId: string;
  runId: string;
  customerId: string;
  channel: JourneyChannel;
  /** ที่อยู่ปลายทางของช่องทางนั้น (LINE userId · อีเมล · เบอร์ · token คั่นด้วยจุลภาค) — "" = ยังไม่มี */
  to: string;
  consent: JourneyConsent;
  body: string;
  subject?: string;
  title?: string;
};

/** `skipped` = ไม่ได้ส่งเพราะกติกา (ไม่ยินยอม/ไม่มีที่อยู่/ร้านยังไม่เชื่อมช่องทาง) ไม่ใช่ส่งแล้วล้ม */
export type JourneySendResult = { ok: boolean; error?: string; skipped?: boolean };
export type JourneySendFn = (req: JourneySendRequest) => Promise<JourneySendResult>;

export type JourneyKanbanRequest = {
  tenantId: string;
  journeyId: string;
  runId: string;
  customerId: string;
  boardId: string;
  title: string;
  description?: string | null;
  /** กุญแจกันการ์ดซ้ำ (`journey:{runId}:{stepIndex}`) */
  sourceKey: string;
};

export type JourneyKanbanResult = { ok: boolean; cardId?: string; error?: string };
export type JourneyKanbanFn = (req: JourneyKanbanRequest) => Promise<JourneyKanbanResult>;

export type JourneyDeps = {
  line?: JourneySendFn;
  email?: JourneySendFn;
  sms?: JourneySendFn;
  push?: JourneySendFn;
  kanban?: JourneyKanbanFn;
};

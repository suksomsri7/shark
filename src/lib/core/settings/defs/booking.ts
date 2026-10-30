// ─────────────────────────────────────────────────────────────
// defs/booking.ts — ค่าตั้งจองคิว (ตัดผม/เสริมสวย · นวด/สปา · คลินิก) (pure) · SVC B.0 · ใบสั่ง ledger/svc-briefs/svc-brief-b.0.md §4
// แหล่ง: ledger/DESIGN-BOOKING-QUEUE.md §9 + ภาคผนวก ก #1–#66 · สัญญากลาง CC §1.3 §1.6 §6.1
//
// ▸ คีย์ `booking.<group>.<name>` (group = ส่วนที่ 2 ของคีย์) · นาที/วัน = จำนวนเต็ม · % = 0–100 · อัตรา = basis point 0–10000 · เงิน = สตางค์
// ▸ "—" ในภาคผนวก = null (bool = false)
// ▸ `_fallback` (ร้านเดิมที่ยังไม่เลือกแม่แบบ) = พฤติกรรมระบบจองรุ่นแรกทุกข้อ (มติผู้ตรวจ B.0 ทาง ก · FALLBACK_LEGACY):
//   ร้านเดิมต้องไม่เริ่มโดนตัดนัด/ปล่อยคิว/ส่งข้อความเอง — คีย์ที่รุ่นแรกไม่มีกติกา = ค่าที่ทำให้ไม่มีผล · คีย์ที่ไม่อยู่ในแผนที่ = ค่า BARBER (รุ่นแรกเท่ากัน)
// ▸ ภาคผนวก ก ที่ไม่นิยามที่นี่: #47 = messaging.channelOrder (defs/messaging.ts) · #65 = สิทธิ์ต่อบทบาทใน core/permissions.ts (B.11)
// ▸ ชั้น RESOURCE / DEVICE / COURSE ยังไม่อยู่ใน SUPPORTED_SCOPES ของ service.ts ⇒ ค่าชั้นนั้นได้จากแม่แบบ/ชั้นบน
//   จนใบที่ลงทะเบียนชั้น (B.6 อุปกรณ์ · B.13 ทรัพยากร · คอร์ส)
// ▸ แม่แบบคลินิกซ่อนจนเฟสคลินิก (hiddenUntil "PHASE_CLINIC") · ข้อความแม่แบบคลินิกไม่มี {บริการ} (ภาคผนวก ก #51 — ไม่เปิดเผยการรักษา)
//
// 🔴 pure: import ได้เฉพาะ zod · ../registry · import type
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { defineSettings } from "../registry";
import type { GroupIssue, GroupRule, ScopeKind, SettingDef, SettingValueType, TemplateDef } from "../types";

const EDIT = "booking.settings.edit";
const MONEY_EDIT = "booking.settings.money";

// ─────────────────── ชนิดค่าที่ใช้ซ้ำ ───────────────────
const MIN = z.number().int().min(0).max(525_600); // นาที (≤ 1 ปี)
const POS_MIN = z.number().int().min(1).max(525_600);
const DAYS = z.number().int().min(1).max(3650);
const LATE_MIN = z.number().int().min(0).max(1440); // late.* ≤ 1 วัน
const PCT = z.number().int().min(0).max(100);
const BP = z.number().int().min(0).max(10_000);
const LOCALE = z.enum(["th", "en"]);
const unique = <T,>(a: readonly T[]) => new Set(a).size === a.length;
const uniqArr = <T extends z.ZodType>(item: T, min = 0, max = 20) =>
  z.array(item).min(min).max(max).refine((a) => unique(a), { message: "ค่าซ้ำ" });
const PREFIX = z.string().regex(/^[A-Z]$/);
const SLOT_STEPS: readonly number[] = [5, 10, 15, 20, 30, 60];
const LABEL = z.string().trim().min(1).max(30);

const MSG_KINDS = [
  "confirmation",
  "reminder",
  "checkedIn",
  "ticketIssued",
  "nearTurn",
  "yourTurn",
  "delayed",
  "noShowRebook",
  "rebookInvite",
  "courseExpiry",
] as const;
type MsgKind = (typeof MSG_KINDS)[number];
const MSG_TEXT = z.object({ th: z.string().trim().min(1).max(1000), en: z.string().max(1000).optional() }).strict();

// ─────────────────── ชั้น ───────────────────
const U = ["UNIT"] as const satisfies readonly ScopeKind[];
const T = ["TENANT"] as const satisfies readonly ScopeKind[];
const ST = ["STAFF"] as const satisfies readonly ScopeKind[];
const SV = ["SERVICE"] as const satisfies readonly ScopeKind[];
const DV = ["DEVICE"] as const satisfies readonly ScopeKind[]; // DEVICE: B.6
const U_ST = ["UNIT", "STAFF"] as const satisfies readonly ScopeKind[];
const U_SV = ["UNIT", "SERVICE"] as const satisfies readonly ScopeKind[];
const U_SV_RS = ["UNIT", "SERVICE", "RESOURCE"] as const satisfies readonly ScopeKind[]; // RESOURCE: B.13
const U_SV_ST = ["UNIT", "SERVICE", "STAFF"] as const satisfies readonly ScopeKind[];
const U_DV = ["UNIT", "DEVICE"] as const satisfies readonly ScopeKind[]; // DEVICE: B.6
const U_CO = ["UNIT", "COURSE"] as const satisfies readonly ScopeKind[]; // COURSE: ใบคอร์ส

// ─────────────────── ตัวช่วยสร้าง def ───────────────────
type Tpl3 = readonly [barber: unknown, spa: unknown, clinic: unknown];
/**
 * ร้านเดิม (ยังไม่เลือกแม่แบบ) = พฤติกรรมระบบจองรุ่นแรก (อ่านจาก modules/booking/{service,slots}.ts + components/public-booking.tsx)
 * คีย์ที่ไม่อยู่ที่นี่ = ค่า BARBER ซึ่งเท่ากับรุ่นแรกหรือไม่มีผลกับรุ่นแรก (เช่น slotStep 15 = SLOT_STEP_MIN · มีตัวเลือก "ใครก็ได้" · ยืนยันอัตโนมัติ)
 */
const FALLBACK_LEGACY: Readonly<Record<string, unknown>> = {
  "booking.staff.hoursSource": ["UNIT_HOURS"], // กรอบเวลา = เวลาร้านเท่านั้น
  "booking.service.walkIn": { enabled: true, closeAtOrAboveMin: null }, // ไม่ปิดรับตามความยาวบริการ
  "booking.service.rebookAfterDays": null, // ไม่ชวนกลับ
  // การจอง
  "booking.booking.horizonDays": 14, // public-booking.tsx nextDays(14)
  "booking.booking.minLeadMin": 0, // createAppointment ปฏิเสธเฉพาะเวลาที่ผ่านไปแล้ว
  "booking.booking.onlineSharePct": 100, // ไม่มีเพดานสัดส่วนออนไลน์
  "booking.booking.maxOpenPerPhone": null, // ไม่จำกัดนัดต่อเบอร์
  // มาสาย/ไม่มา — รุ่นแรกไม่มีอัตโนมัติ (พนักงานกด NO_SHOW เอง แล้วริบมัดจำเต็ม = forfeitPct 100 ของ BARBER)
  "booking.late.afterGrace": "WAIT_NOTIFY_COUNTER", // ไม่ปล่อยช่องเอง
  "booking.late.noShowAfterMin": null, // ไม่ตั้งไม่มาอัตโนมัติ
  "booking.late.selfRescheduleMax": 0, // ไม่มีลิงก์จัดการนัด (เลื่อนเองไม่ได้)
  "booking.late.repeatNoShow": null, // ไม่มีบทลงโทษไม่มาซ้ำ
  // มัดจำ — พนักงานบันทึกที่เคาน์เตอร์ตาม BookingService.depositSatang (ไม่เก็บออนไลน์)
  "booking.deposit.method": "NONE",
  "booking.deposit.amount": { mode: "PER_SERVICE" },
  "booking.deposit.payWithinMin": null, // ไม่ตัดนัดที่ยังไม่จ่าย
  // แจ้งเตือน/ข้อความ — รุ่นแรกไม่ส่งข้อความหาลูกค้า
  "booking.notify.reminderOffsetsMin": [],
  "booking.notify.delayAlertMin": null,
  "booking.msg.enabled": Object.fromEntries(
    ["confirmation", "reminder", "checkedIn", "ticketIssued", "nearTurn", "yourTurn", "delayed", "noShowRebook", "rebookInvite", "courseExpiry"].map((k) => [k, false]),
  ),
  // เงิน — ค่าคอมฯ ตามคนขาย (POS) ไม่ใช่ผู้ให้บริการ
  "booking.money.commissionTo": "OFF",
  "booking.money.commissionToPayroll": false,
  // ความเป็นส่วนตัว — ไม่ลบข้อมูลลูกค้าเอง
  "booking.privacy.walkInRetentionDays": null,
  // คิว — ไม่รวม walk-in กับนัด (CC §6.1)
  "booking.queue.singleLine": false,
};

type RowInput = {
  key: string;
  type: SettingValueType;
  labelTh: string;
  helpTh?: string;
  schema: z.ZodType;
  chain: readonly ScopeKind[];
  v: Tpl3;
};
const x3 = (v: unknown): Tpl3 => [v, v, v];

function row(x: RowInput): SettingDef {
  const group = x.key.split(".")[1];
  const money = group === "deposit" || group === "money";
  const privacy = group === "privacy";
  const [barber, spa, clinic] = x.v;
  const fallback = Object.prototype.hasOwnProperty.call(FALLBACK_LEGACY, x.key) ? FALLBACK_LEGACY[x.key] : barber;
  return {
    key: x.key,
    domain: "booking",
    group,
    type: x.type,
    labelTh: x.labelTh,
    ...(x.helpTh ? { helpTh: x.helpTh } : {}),
    schema: x.schema,
    defaults: { _fallback: fallback, BARBER: barber, SPA: spa, CLINIC: clinic },
    chain: x.chain,
    editPermission: money ? MONEY_EDIT : EDIT,
    ...(money ? { sensitivity: "MONEY" as const } : {}),
    ...(privacy ? { sensitivity: "PRIVACY" as const, ownerOnly: true } : {}),
  };
}

// ─────────────────── ข้อความ 10 ชนิด (#51) ───────────────────
type MsgText = { th: string; en?: string };
const MSG_DEF: Record<MsgKind, { labelTh: string; vars: readonly string[]; barber: MsgText; spa?: MsgText; clinic: MsgText }> = {
  confirmation: {
    labelTh: "ข้อความยืนยันการจอง",
    vars: ["ชื่อ", "ร้าน", "เวลา", "ช่าง", "บริการ", "ลิงก์นัด"],
    barber: {
      th: "คุณ{ชื่อ} จอง{บริการ}กับ{ช่าง} ที่ {ร้าน} เวลา {เวลา} เรียบร้อยแล้ว · ดู/เลื่อนนัด: {ลิงก์นัด}",
      en: "Hi {ชื่อ}, your {บริการ} with {ช่าง} at {ร้าน} is booked for {เวลา}. Manage: {ลิงก์นัด}",
    },
    clinic: { th: "คุณ{ชื่อ} นัดพบ{ช่าง} ที่ {ร้าน} เวลา {เวลา} เรียบร้อยแล้ว · ดู/เลื่อนนัด: {ลิงก์นัด}" },
  },
  reminder: {
    labelTh: "ข้อความเตือนก่อนถึงนัด",
    vars: ["ชื่อ", "ร้าน", "เวลา", "ช่าง", "บริการ", "ลิงก์นัด"],
    barber: {
      th: "เตือนนัด: คุณ{ชื่อ} มี{บริการ}กับ{ช่าง} ที่ {ร้าน} เวลา {เวลา} · เลื่อน/ยกเลิก: {ลิงก์นัด}",
      en: "Reminder: {บริการ} with {ช่าง} at {ร้าน}, {เวลา}. Change or cancel: {ลิงก์นัด}",
    },
    clinic: { th: "เตือนนัด: คุณ{ชื่อ} มีนัดพบ{ช่าง} ที่ {ร้าน} เวลา {เวลา} · เลื่อน/ยกเลิก: {ลิงก์นัด}" },
  },
  checkedIn: {
    labelTh: "ข้อความเมื่อเช็กอินแล้ว",
    vars: ["ชื่อ", "ร้าน", "เลขคิว", "ลิงก์บัตร"],
    barber: {
      th: "คุณ{ชื่อ} เช็กอินที่ {ร้าน} แล้ว · บัตรคิว {เลขคิว} · ดูคิวสด: {ลิงก์บัตร}",
      en: "{ชื่อ}, you're checked in at {ร้าน} (ticket {เลขคิว}). Live queue: {ลิงก์บัตร}",
    },
    clinic: { th: "คุณ{ชื่อ} ลงทะเบียนที่ {ร้าน} แล้ว · บัตรคิว {เลขคิว} · ดูคิวสด: {ลิงก์บัตร}" },
  },
  ticketIssued: {
    labelTh: "ข้อความเมื่อรับบัตรคิว",
    vars: ["ชื่อ", "ร้าน", "เลขคิว", "อีกกี่คิว", "ลิงก์บัตร"],
    barber: {
      th: "{ร้าน} · บัตรคิวของคุณคือ {เลขคิว} รออีก {อีกกี่คิว} คิว · ดูคิวสด: {ลิงก์บัตร}",
      en: "{ร้าน} · Your ticket is {เลขคิว}, {อีกกี่คิว} ahead of you. Live queue: {ลิงก์บัตร}",
    },
    clinic: { th: "{ร้าน} · บัตรคิวของคุณคือ {เลขคิว} รออีก {อีกกี่คิว} คิว · ดูคิวสด: {ลิงก์บัตร}" },
  },
  nearTurn: {
    labelTh: "ข้อความใกล้ถึงคิว",
    vars: ["ชื่อ", "ร้าน", "เลขคิว", "อีกกี่คิว", "ลิงก์บัตร"],
    barber: {
      th: "อีก {อีกกี่คิว} คิวจะถึงคิว {เลขคิว} ของคุณที่ {ร้าน} — กรุณากลับมาที่ร้าน · {ลิงก์บัตร}",
      en: "{อีกกี่คิว} more before your ticket {เลขคิว} at {ร้าน} — please head back. {ลิงก์บัตร}",
    },
    clinic: { th: "อีก {อีกกี่คิว} คิวจะถึงคิว {เลขคิว} ของคุณที่ {ร้าน} — กรุณารอหน้าห้องตรวจ · {ลิงก์บัตร}" },
  },
  yourTurn: {
    labelTh: "ข้อความถึงคิวแล้ว",
    vars: ["ชื่อ", "ร้าน", "เลขคิว", "ช่าง"],
    barber: {
      th: "ถึงคิว {เลขคิว} แล้ว — เชิญพบ{ช่าง} ที่ {ร้าน}",
      en: "Ticket {เลขคิว}, it's your turn — please see {ช่าง} at {ร้าน}",
    },
    clinic: { th: "ถึงคิว {เลขคิว} แล้ว — เชิญพบ{ช่าง} ที่ {ร้าน}" },
  },
  delayed: {
    labelTh: "ข้อความแจ้งคิวล่าช้า",
    vars: ["ชื่อ", "ร้าน", "เวลา", "นาทีที่เลื่อน", "ลิงก์นัด"],
    barber: {
      th: "ขออภัยคุณ{ชื่อ} คิวที่ {ร้าน} ช้ากว่ากำหนดประมาณ {นาทีที่เลื่อน} นาที — นัดเวลา {เวลา} อาจเริ่มช้ากว่าเดิม · {ลิงก์นัด}",
      en: "Sorry {ชื่อ}, {ร้าน} is running about {นาทีที่เลื่อน} min late — your {เวลา} slot may start later. {ลิงก์นัด}",
    },
    clinic: { th: "ขออภัยคุณ{ชื่อ} {ร้าน} ช้ากว่ากำหนดประมาณ {นาทีที่เลื่อน} นาที — นัดเวลา {เวลา} อาจเริ่มช้ากว่าเดิม · {ลิงก์นัด}" },
  },
  noShowRebook: {
    labelTh: "ข้อความชวนจองใหม่หลังไม่มาตามนัด",
    vars: ["ชื่อ", "ร้าน", "เวลา", "ลิงก์นัด"],
    barber: {
      th: "คุณ{ชื่อ} ไม่ได้มาตามนัดเวลา {เวลา} ที่ {ร้าน} — จองเวลาใหม่ได้ที่ {ลิงก์นัด}",
      en: "{ชื่อ}, we missed you at {ร้าน} ({เวลา}). Book a new time: {ลิงก์นัด}",
    },
    clinic: { th: "คุณ{ชื่อ} ไม่ได้มาตามนัดเวลา {เวลา} ที่ {ร้าน} — นัดใหม่ได้ที่ {ลิงก์นัด}" },
  },
  rebookInvite: {
    labelTh: "ข้อความชวนกลับมาใช้บริการ",
    vars: ["ชื่อ", "ร้าน", "บริการ", "ลิงก์นัด"],
    barber: {
      th: "คุณ{ชื่อ} ถึงเวลา{บริการ}รอบใหม่แล้ว — จองคิวที่ {ร้าน} ได้ที่ {ลิงก์นัด}",
      en: "{ชื่อ}, time for your next {บริการ} at {ร้าน}. Book here: {ลิงก์นัด}",
    },
    clinic: { th: "คุณ{ชื่อ} ถึงกำหนดนัดติดตามที่ {ร้าน} แล้ว — นัดได้ที่ {ลิงก์นัด}" },
  },
  courseExpiry: {
    labelTh: "ข้อความเตือนคอร์สใกล้หมดอายุ",
    vars: ["ชื่อ", "ร้าน", "บริการ", "วันหมดอายุ", "ลิงก์นัด"],
    barber: {
      th: "คอร์ส{บริการ}ของคุณ{ชื่อ} ที่ {ร้าน} จะหมดอายุวันที่ {วันหมดอายุ} — จองใช้สิทธิ์ได้ที่ {ลิงก์นัด}",
      en: "{ชื่อ}, your {บริการ} package at {ร้าน} expires on {วันหมดอายุ}. Book now: {ลิงก์นัด}",
    },
    clinic: { th: "คอร์สของคุณ{ชื่อ} ที่ {ร้าน} จะหมดอายุวันที่ {วันหมดอายุ} — นัดใช้สิทธิ์ได้ที่ {ลิงก์นัด}" },
  },
};

const msgDefs: SettingDef[] = MSG_KINDS.map((k) => {
  const m = MSG_DEF[k];
  return {
    ...row({ key: `booking.msg.${k}`, type: "template", labelTh: m.labelTh, schema: MSG_TEXT, chain: U, v: [m.barber, m.spa ?? m.barber, m.clinic] }),
    templateVars: m.vars,
  };
});

const msgOn = (off: readonly MsgKind[]): Record<MsgKind, boolean> =>
  Object.fromEntries(MSG_KINDS.map((k) => [k, !off.includes(k)])) as Record<MsgKind, boolean>;
const MSG_ENABLED = z.object(Object.fromEntries(MSG_KINDS.map((k) => [k, z.boolean()])) as Record<MsgKind, z.ZodBoolean>).strict();

// ═════════════════════ นิยาม (ภาคผนวก ก) ═════════════════════
const DEFS: SettingDef[] = [
  // ── ทั่วไป (#1–5) ──
  row({ key: "booking.general.shopType", type: "enum", labelTh: "ประเภทร้าน", schema: z.enum(["BARBER", "SPA", "CLINIC"]), chain: U, v: ["BARBER", "SPA", "CLINIC"] }), // #1
  row({ key: "booking.general.providerLabel", type: "text", labelTh: "คำเรียกผู้ให้บริการ", schema: LABEL, chain: U, v: ["ช่าง", "หมอนวด", "แพทย์"] }), // #2
  row({ key: "booking.general.resourceLabel", type: "text", labelTh: "คำเรียกทรัพยากร", schema: LABEL, chain: U, v: ["เก้าอี้", "เตียง/ห้อง", "ห้องตรวจ"] }), // #3
  row({ key: "booking.general.customerLocales", type: "table", labelTh: "ภาษาที่ลูกค้าเลือกได้", schema: uniqArr(LOCALE, 1, 2), chain: U, v: [["th", "en"], ["th", "en"], ["th"]] }), // #4
  row({
    key: "booking.general.defaultHours", type: "table", labelTh: "เวลาทำการเริ่มต้น (นาทีจากเที่ยงคืน)", helpTh: "ค่าตั้งต้นของสาขาใหม่ — เวลาทำการในตาราง BookingHours ชนะ", // #5
    schema: z
      .object({ openMin: z.number().int().min(0).max(1440), closeMin: z.number().int().min(0).max(1440) })
      .strict()
      .refine((h) => h.openMin < h.closeMin, { message: "เวลาเปิดต้องก่อนเวลาปิด" }),
    chain: U, v: [{ openMin: 600, closeMin: 1200 }, { openMin: 600, closeMin: 1260 }, { openMin: 540, closeMin: 1020 }],
  }),

  // ── ผู้ให้บริการ (#6–11) ──
  row({
    key: "booking.staff.hoursSource", type: "table", labelTh: "ลำดับแหล่งเวลาทำงานของผู้ให้บริการ", // #6
    schema: uniqArr(z.enum(["HR_SHIFT", "STAFF_WEEKLY", "UNIT_HOURS"]), 1, 3), chain: ST, v: x3(["HR_SHIFT", "STAFF_WEEKLY", "UNIT_HOURS"]),
  }),
  row({ key: "booking.staff.weeklySchedule", type: "enum", labelTh: "ตารางรายสัปดาห์ของผู้ให้บริการ", schema: z.enum(["UNIT_HOURS", "OWN_SCHEDULE"]), chain: ST, v: ["UNIT_HOURS", "UNIT_HOURS", "OWN_SCHEDULE"] }), // #7
  row({ key: "booking.staff.maxJobsPerDay", type: "int", labelTh: "งานสูงสุดต่อวัน (ว่าง = ไม่จำกัด)", schema: z.number().int().min(1).max(100).nullable(), chain: U_ST, v: [null, 6, null] }), // #8
  row({ key: "booking.staff.minBreakMin", type: "minutes", labelTh: "พักขั้นต่ำระหว่างงาน (นาที)", schema: MIN, chain: U_ST, v: [0, 10, 0] }), // #9
  row({ key: "booking.staff.customerCanChoose", type: "bool", labelTh: "ลูกค้าเลือกผู้ให้บริการได้", schema: z.boolean(), chain: ST, v: x3(true) }), // #10
  row({
    key: "booking.staff.servicesMode", type: "enum", labelTh: "บริการที่ผู้ให้บริการทำได้", // #11
    helpTh: "ALL = ทำทุกบริการ · ASSIGNED = เฉพาะที่ผูกไว้ (แถว BookingStaffService)",
    schema: z.enum(["ALL", "ASSIGNED"]), chain: ST, v: ["ALL", "ALL", "ASSIGNED"],
  }),

  // ── บริการ (#12–18) ──
  row({ key: "booking.service.durationSource", type: "enum", labelTh: "แหล่งระยะเวลาบริการ", schema: z.enum(["CATALOG"]), chain: SV, v: x3("CATALOG") }), // #12
  row({ key: "booking.service.cleanupMin", type: "minutes", labelTh: "เวลาเก็บ/ทำความสะอาดหลังบริการ (นาที)", helpTh: "ค่าตั้งต้นของบริการใหม่ — บริการที่มีอยู่ใช้ BookingService.bufferMin (คอลัมน์ชนะ)", schema: MIN, chain: U_SV_RS, v: [0, 10, 5] }), // #13
  row({ key: "booking.service.resourceRule", type: "enum", labelTh: "การใช้ทรัพยากรของบริการ", schema: z.enum(["STAFF_CHAIR", "PER_SERVICE", "EXAM_ROOM"]), chain: SV, v: ["STAFF_CHAIR", "PER_SERVICE", "EXAM_ROOM"] }), // #14
  row({ key: "booking.service.staffCount", type: "int", labelTh: "จำนวนผู้ให้บริการต่องาน", schema: z.number().int().min(1).max(10), chain: SV, v: x3(1) }), // #15
  row({ key: "booking.service.onlineBookable", type: "bool", labelTh: "จองออนไลน์ได้", helpTh: "ค่าตั้งต้นของบริการใหม่ — บริการที่มีอยู่ใช้ BookingService.bookable (คอลัมน์ชนะ)", schema: z.boolean(), chain: SV, v: x3(true) }), // #16
  row({
    key: "booking.service.walkIn", type: "table", labelTh: "รับ walk-in", // #17
    helpTh: "closeAtOrAboveMin = ปิดรับ walk-in สำหรับบริการที่ยาวตั้งแต่กี่นาที (ว่าง = รับทุกบริการ)",
    schema: z.object({ enabled: z.boolean(), closeAtOrAboveMin: POS_MIN.nullable() }).strict(),
    chain: SV, v: [{ enabled: true, closeAtOrAboveMin: 90 }, { enabled: true, closeAtOrAboveMin: null }, { enabled: true, closeAtOrAboveMin: null }],
  }),
  row({ key: "booking.service.rebookAfterDays", type: "days", labelTh: "ชวนกลับมาหลังกี่วัน (ว่าง = ปิด)", schema: DAYS.nullable(), chain: U_SV, v: [28, 30, null] }), // #18

  // ── การจอง (#19–26) ──
  row({ key: "booking.booking.horizonDays", type: "days", labelTh: "จองล่วงหน้าได้ไม่เกิน (วัน)", schema: z.number().int().min(1).max(365), chain: U, v: [30, 30, 60] }), // #19
  row({ key: "booking.booking.minLeadMin", type: "minutes", labelTh: "ต้องจองก่อนอย่างน้อย (นาที)", schema: MIN, chain: U_SV, v: [60, 60, 120] }), // #20
  row({
    key: "booking.booking.slotStepMin", type: "minutes", labelTh: "ช่วงห่างของเวลาให้เลือก (นาที)", // #21
    schema: z.number().int().refine((n) => SLOT_STEPS.includes(n), { message: "เลือก 5 10 15 20 30 หรือ 60 นาที" }), chain: U, v: [15, 30, 15],
  }),
  row({ key: "booking.booking.requireConfirm", type: "bool", labelTh: "ร้านต้องยืนยันการจองก่อน", schema: z.boolean(), chain: U_SV, v: [false, false, true] }), // #22
  row({ key: "booking.booking.anyStaffOption", type: "bool", labelTh: "มีตัวเลือก \"ใครก็ได้\"", schema: z.boolean(), chain: U, v: x3(true) }), // #23
  row({ key: "booking.booking.onlineSharePct", type: "percent", labelTh: "สัดส่วนเวลาที่เปิดจองออนไลน์ (%)", schema: PCT, chain: U_ST, v: [60, 60, 80] }), // #24
  row({ key: "booking.booking.maxOpenPerPhone", type: "int", labelTh: "นัดค้างได้สูงสุดต่อเบอร์", schema: z.number().int().min(1).max(50).nullable(), chain: U, v: [2, 2, 1] }), // #25 · null = ไม่จำกัด
  row({ key: "booking.booking.extraFields", type: "enum", labelTh: "ช่องข้อมูลเพิ่มตอนจอง", schema: z.enum(["MASSAGE_NOTE", "SYMPTOM_OPTIONAL"]).nullable(), chain: U_SV, v: [null, "MASSAGE_NOTE", "SYMPTOM_OPTIONAL"] }), // #26

  // ── มาสาย/ไม่มา/เลื่อน (#27–32) ──
  row({ key: "booking.late.graceMin", type: "minutes", labelTh: "ผ่อนผันมาสาย (นาที)", schema: LATE_MIN, chain: U, v: [10, 15, 15] }), // #27
  row({ key: "booking.late.afterGrace", type: "enum", labelTh: "เมื่อเลยเวลาผ่อนผัน", schema: z.enum(["RELEASE_REQUEUE", "WAIT_NOTIFY_COUNTER"]), chain: U, v: ["RELEASE_REQUEUE", "RELEASE_REQUEUE", "WAIT_NOTIFY_COUNTER"] }), // #28
  row({ key: "booking.late.noShowAfterMin", type: "minutes", labelTh: "ถือว่าไม่มาหลัง (นาที · ว่าง = ไม่ตั้งอัตโนมัติ)", schema: LATE_MIN.nullable(), chain: U, v: [30, 30, 60] }), // #29
  row({ key: "booking.late.freeChangeBeforeMin", type: "minutes", labelTh: "เลื่อน/ยกเลิกฟรีก่อนนัด (นาที)", schema: LATE_MIN, chain: U_SV, v: [180, 720, 120] }), // #30
  row({ key: "booking.late.selfRescheduleMax", type: "int", labelTh: "ลูกค้าเลื่อนเองได้สูงสุด (ครั้ง)", schema: z.number().int().min(0).max(20), chain: U, v: [2, 2, 1] }), // #31
  // SVC B.8 ▸ ยกเลิกเองหลังเวลาฟรี (มติผู้คุม Q1: ค่าเริ่ม BLOCK ทุกแม่แบบ · ร้านเปิด FORFEIT เองได้) ◂
  row({ key: "booking.late.lateCancelMode", type: "enum", labelTh: "เมื่อลูกค้ายกเลิกหลังเวลาฟรี", schema: z.enum(["BLOCK", "FORFEIT"]), chain: U, v: x3("BLOCK") }), // #32b
  row({
    key: "booking.late.repeatNoShow", type: "table", labelTh: "ไม่มาซ้ำ", // #32
    schema: z.object({ count: z.number().int().min(1).max(50), windowDays: DAYS, action: z.enum(["REQUIRE_DEPOSIT", "PHONE_ONLY"]) }).strict().nullable(), // null = ปิด
    chain: U, v: [{ count: 2, windowDays: 90, action: "REQUIRE_DEPOSIT" }, { count: 2, windowDays: 90, action: "REQUIRE_DEPOSIT" }, { count: 3, windowDays: 180, action: "PHONE_ONLY" }],
  }),

  // ── มัดจำ (#33–37) · เงิน ──
  row({ key: "booking.deposit.method", type: "enum", labelTh: "วิธีรับมัดจำ", schema: z.enum(["NONE", "PROMPTPAY_SLIP"]), chain: U, v: ["PROMPTPAY_SLIP", "PROMPTPAY_SLIP", "NONE"] }), // #33
  row({
    key: "booking.deposit.amount", type: "table", labelTh: "ยอดมัดจำ", // #34
    helpTh: "PERCENT = % ของราคา (bp) เมื่อบริการยาวตั้งแต่ minDurationMin นาที · PER_SERVICE = ตามที่ตั้งในบริการ · ว่าง = ไม่เก็บ",
    schema: z
      .discriminatedUnion("mode", [
        z.object({ mode: z.literal("PERCENT"), bp: BP, minDurationMin: POS_MIN.nullable() }).strict(),
        z.object({ mode: z.literal("PER_SERVICE") }).strict(),
      ])
      .nullable(),
    chain: U_SV, v: [{ mode: "PERCENT", bp: 2000, minDurationMin: 90 }, { mode: "PER_SERVICE" }, null],
  }),
  row({ key: "booking.deposit.payWithinMin", type: "minutes", labelTh: "ต้องจ่ายมัดจำภายใน (นาที)", schema: z.number().int().min(1).max(1440).nullable(), chain: U, v: [15, 30, null] }), // #35
  row({ key: "booking.deposit.forfeitPct", type: "percent", labelTh: "ริบมัดจำเมื่อไม่มา (%)", schema: PCT.nullable(), chain: U, v: [100, 100, null] }), // #36
  row({ key: "booking.deposit.memberExemptTier", type: "text", labelTh: "ระดับสมาชิกที่ไม่ต้องมัดจำ", schema: z.string().trim().min(1).max(64).nullable(), chain: U, v: [null, "GOLD", null] }), // #37

  // ── คิว (#38–46 + CC §6.1 + มติ B.2) ──
  row({ key: "booking.queue.order", type: "enum", labelTh: "ลำดับคิว", schema: z.enum(["SINGLE_LINE_BY_TIME", "APPOINTMENT_FIRST"]), chain: U, v: ["SINGLE_LINE_BY_TIME", "SINGLE_LINE_BY_TIME", "APPOINTMENT_FIRST"] }), // #38
  row({ key: "booking.queue.walkInFillGaps", type: "bool", labelTh: "walk-in แทรกช่องว่างระหว่างนัด", schema: z.boolean(), chain: U, v: [true, true, false] }), // #39
  row({ key: "booking.queue.safetyMin", type: "minutes", labelTh: "เผื่อเวลาก่อนนัดถัดไป (นาที)", schema: MIN, chain: U, v: [5, 10, 0] }), // #40
  row({ key: "booking.queue.walkInCloseWaitMin", type: "minutes", labelTh: "ปิดรับ walk-in เมื่อรอเกิน (นาที)", schema: MIN, chain: U, v: [120, 90, 180] }), // #41
  row({
    key: "booking.queue.remoteTicket", type: "table", labelTh: "รับบัตรคิวทางมือถือ", // #42
    // SVC B.9 ▸ maxPerHour (ไม่ใส่/null = ไม่จำกัด): เพดานบัตรทางมือถือต่อสาขาต่อ 60 นาที — กันสลับ IP รับบัตรไม่จำกัด (N6/N9) ◂
    schema: z.object({ enabled: z.boolean(), maxWaitMin: POS_MIN.nullable(), maxPerHour: z.number().int().min(1).max(1000).nullable().optional() }).strict(),
    chain: U, v: [{ enabled: true, maxWaitMin: 90 }, { enabled: true, maxWaitMin: 60 }, { enabled: true, maxWaitMin: null }],
  }),
  row({ key: "booking.queue.skipAfterMin", type: "minutes", labelTh: "ข้ามคิวเมื่อเรียกแล้วไม่มา (นาที · ว่าง = ไม่ข้ามเอง)", schema: POS_MIN.nullable(), chain: U, v: [10, 10, 15] }), // #43
  row({ key: "booking.queue.walkInPickStaff", type: "bool", labelTh: "walk-in เลือกผู้ให้บริการได้", schema: z.boolean(), chain: U_DV, v: [true, true, false] }), // #44
  row({ key: "booking.queue.priorityGroups", type: "table", labelTh: "กลุ่มได้คิวก่อน", schema: uniqArr(z.enum(["ELDERLY", "MONK", "DISABLED"]), 0, 3), chain: U, v: [[], [], ["ELDERLY", "MONK", "DISABLED"]] }), // #45
  row({
    key: "booking.queue.prefixes", type: "table", labelTh: "ตัวอักษรนำเลขบัตรคิว", // #46
    schema: z.object({ walkIn: PREFIX, appointment: PREFIX, priority: PREFIX.nullable() }).strict(),
    chain: U, v: [{ walkIn: "A", appointment: "P", priority: null }, { walkIn: "A", appointment: "P", priority: null }, { walkIn: "A", appointment: "P", priority: "B" }],
  }),
  row({ key: "booking.queue.singleLine", type: "bool", labelTh: "โหมดแถวเดียว (นัด + walk-in)", helpTh: "รวมคิว walk-in เข้ากับนัดในแถวเดียว (CC §6.1) · ร้านเดิมที่ยังไม่เลือกแม่แบบ = ปิด", schema: z.boolean(), chain: U, v: x3(true) }),
  row({ key: "booking.queue.overrunExtendMin", type: "minutes", labelTh: "ขยายเวลาเมื่องานเกินเวลา (นาที)", schema: MIN, chain: U, v: x3(5) }),

  // ── แจ้งเตือน (#48–50) · #47 = messaging.channelOrder ──
  row({
    key: "booking.notify.reminderOffsetsMin", type: "table", labelTh: "เตือนก่อนนัด (นาที)", // #48
    schema: uniqArr(z.number().int().min(1).max(43_200), 0, 5), chain: U, v: [[1440, 120], [1440, 180], [1440]],
  }),
  row({ key: "booking.notify.nearTurnAhead", type: "int", labelTh: "แจ้งใกล้ถึงคิวเมื่อเหลือ (คิว)", schema: z.number().int().min(1).max(50), chain: U, v: [2, 2, 3] }), // #49
  row({ key: "booking.notify.delayAlertMin", type: "minutes", labelTh: "แจ้งคิวล่าช้าเมื่อช้าเกิน (นาที · ว่าง = ไม่แจ้ง)", schema: POS_MIN.nullable(), chain: U, v: [15, 15, 30] }), // #50
  // SVC B.9 ▸ มติผู้คุม Q2: ซ่อนชื่อบริการในข้อความถึงลูกค้า (คลินิก = ไม่เปิดเผยการรักษา · #51) — true ⇒ ตัวแปร {บริการ} ว่างเสมอ แม้ร้านแก้ถ้อยคำใส่ {บริการ} ◂
  row({ key: "booking.notify.hideServiceName", type: "bool", labelTh: "ไม่ใส่ชื่อบริการในข้อความถึงลูกค้า", helpTh: "เปิดไว้ ⇒ ตัวแปร {บริการ} ในข้อความแจ้งเตือนเป็นค่าว่างเสมอ (เช่น คลินิกที่ไม่เปิดเผยการรักษา)", schema: z.boolean(), chain: U, v: [false, false, true] }),

  // ── ข้อความ (#51) ──
  row({ key: "booking.msg.enabled", type: "table", labelTh: "เปิด/ปิดข้อความแต่ละชนิด", schema: MSG_ENABLED, chain: U, v: [msgOn(["courseExpiry"]), msgOn([]), msgOn(["rebookInvite", "courseExpiry"])] }),
  ...msgDefs,

  // ── จอแสดงคิว/ตู้ (#52–58) · DEVICE: B.6 ──
  row({
    key: "booking.display.tvShow", type: "table", labelTh: "จอทีวีแสดง", // #52
    schema: z.object({ label: z.enum(["PROVIDER", "RESOURCE"]), showCustomerName: z.boolean() }).strict(),
    chain: DV, v: [{ label: "PROVIDER", showCustomerName: false }, { label: "PROVIDER", showCustomerName: false }, { label: "RESOURCE", showCustomerName: false }],
  }),
  row({ key: "booking.display.voice", type: "table", labelTh: "เสียงเรียกคิว (ภาษา)", schema: uniqArr(LOCALE, 0, 2), chain: DV, v: [["th", "en"], ["th"], ["th"]] }), // #53
  row({ key: "booking.display.nextCount", type: "int", labelTh: "จำนวนคิวถัดไปบนจอ", schema: z.number().int().min(1).max(20), chain: DV, v: [3, 3, 5] }), // #54
  row({ key: "booking.kiosk.services", type: "enum", labelTh: "บริการที่ตู้รับบัตรแสดง", schema: z.enum(["WALKIN_ENABLED", "ALL"]), chain: DV, v: ["WALKIN_ENABLED", "ALL", "ALL"] }), // #55
  row({ key: "booking.kiosk.phone", type: "enum", labelTh: "เบอร์โทรที่ตู้", schema: z.enum(["OPTIONAL", "REQUIRED"]), chain: DV, v: ["OPTIONAL", "OPTIONAL", "REQUIRED"] }), // #56
  row({ key: "booking.kiosk.paperTicket", type: "bool", labelTh: "พิมพ์บัตรคิวกระดาษ", schema: z.boolean(), chain: DV, v: [false, false, true] }), // #57
  row({ key: "booking.kiosk.pinLock", type: "bool", labelTh: "ล็อกตู้ด้วย PIN", schema: z.boolean(), chain: DV, v: x3(true) }), // #58

  // ── เงิน (#59–62) · เงิน ──
  row({ key: "booking.money.onDone", type: "enum", labelTh: "เมื่องานเสร็จ", schema: z.enum(["POS_HELD_BILL"]), chain: U, v: x3("POS_HELD_BILL") }), // #59
  row({ key: "booking.money.commissionTo", type: "enum", labelTh: "ค่าคอมฯ ให้ใคร", schema: z.enum(["PERFORMER", "OFF"]), chain: U, v: ["PERFORMER", "PERFORMER", "OFF"] }), // #60
  row({
    key: "booking.money.commissionRate", type: "table", labelTh: "อัตราค่าคอมฯ (bp)", // #61
    schema: z.object({ serviceBp: BP, productBp: BP }).strict().nullable(),
    chain: U_SV_ST, v: [{ serviceBp: 0, productBp: 0 }, { serviceBp: 0, productBp: 0 }, null],
  }),
  row({ key: "booking.money.commissionToPayroll", type: "bool", labelTh: "ส่งค่าคอมฯ เข้าเงินเดือน", schema: z.boolean(), chain: U, v: [true, true, false] }), // #62

  // ── คอร์ส (#63–64) ──
  row({ key: "booking.course.enabled", type: "bool", labelTh: "เปิดขายคอร์ส", schema: z.boolean(), chain: U, v: [false, true, false] }), // #63
  row({
    key: "booking.course.policy", type: "table", labelTh: "นโยบายคอร์ส", // #64
    schema: z
      .object({
        validityMonths: z.number().int().min(1).max(120),
        extendMonths: z.number().int().min(0).max(120),
        crossBranch: z.boolean(),
        transferable: z.boolean(),
        noShowDeductSessions: z.number().int().min(0).max(10),
        refund: z.object({ mode: z.enum(["REMAINING_PRORATA", "NONE"]), feeBp: BP }).strict(),
        expiryWarnDays: z.number().int().min(0).max(365),
      })
      .strict()
      .nullable(),
    chain: U_CO,
    v: [null, { validityMonths: 6, extendMonths: 1, crossBranch: false, transferable: false, noShowDeductSessions: 1, refund: { mode: "REMAINING_PRORATA", feeBp: 1000 }, expiryWarnDays: 30 }, null],
  }),

  // ── ความเป็นส่วนตัว (#66) · #65 = permissions.ts (B.11) ──
  row({ key: "booking.privacy.walkInRetentionDays", type: "days", labelTh: "เก็บข้อมูลลูกค้า walk-in (วัน · ว่าง = ตามนโยบายร้าน)", schema: DAYS.nullable(), chain: T, v: [180, 180, null] }), // #66
];

// ─────────────────── แม่แบบ 3 ประเภทร้าน ───────────────────
const BOOKING_TEMPLATES: readonly TemplateDef[] = [
  { key: "BARBER", version: 1, labelTh: "ตัดผม/เสริมสวย" },
  { key: "SPA", version: 1, labelTh: "นวด/สปา" },
  { key: "CLINIC", version: 1, labelTh: "คลินิก", hiddenUntil: "PHASE_CLINIC" },
];

// ─────────────────── คีย์ที่นัดจด (CC §1.6) ───────────────────
const SNAPSHOTS: Record<string, readonly string[]> = {
  appointment: [
    "booking.deposit.method",
    "booking.deposit.amount",
    "booking.deposit.payWithinMin",
    "booking.deposit.forfeitPct",
    "booking.late.graceMin",
    "booking.late.afterGrace",
    "booking.late.noShowAfterMin",
    "booking.late.freeChangeBeforeMin",
    "booking.late.selfRescheduleMax",
    "booking.booking.requireConfirm",
    "booking.late.lateCancelMode", // SVC B.8
  ],
};

// ─────────────────── ตรวจข้ามค่าในกลุ่ม ───────────────────
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const GROUP_RULES: readonly GroupRule[] = [
  {
    group: "late",
    check: (v): GroupIssue[] => {
      const grace = num(v["booking.late.graceMin"]);
      const noShow = num(v["booking.late.noShowAfterMin"]);
      return grace !== null && noShow !== null && noShow <= grace
        ? [{ key: "booking.late.noShowAfterMin", code: "NO_SHOW_BEFORE_GRACE", messageTh: "เวลาที่ถือว่าไม่มาต้องมากกว่าเวลาผ่อนผันมาสาย" }]
        : [];
    },
  },
  {
    group: "booking",
    check: (v): GroupIssue[] => {
      const lead = num(v["booking.booking.minLeadMin"]);
      const horizon = num(v["booking.booking.horizonDays"]);
      return lead !== null && horizon !== null && lead >= horizon * 1440
        ? [{ key: "booking.booking.minLeadMin", code: "LEAD_BEYOND_HORIZON", messageTh: "เวลาที่ต้องจองก่อนต้องน้อยกว่าช่วงที่เปิดให้จองล่วงหน้า" }]
        : [];
    },
  },
  {
    group: "deposit",
    check: (v): GroupIssue[] => {
      const method = v["booking.deposit.method"];
      return typeof method === "string" && method !== "NONE" && v["booking.deposit.payWithinMin"] === null
        ? [{ key: "booking.deposit.payWithinMin", code: "DEPOSIT_DEADLINE_REQUIRED", messageTh: "เก็บมัดจำต้องกำหนดเวลาที่ลูกค้าต้องจ่าย" }]
        : [];
    },
  },
  {
    group: "queue",
    check: (v): GroupIssue[] => {
      const out: GroupIssue[] = [];
      const remote = v["booking.queue.remoteTicket"];
      const close = num(v["booking.queue.walkInCloseWaitMin"]);
      if (isRec(remote) && remote.enabled === true && typeof remote.maxWaitMin === "number" && close !== null && remote.maxWaitMin > close)
        out.push({ key: "booking.queue.remoteTicket", code: "REMOTE_WAIT_OVER_CLOSE", messageTh: "เวลารอสูงสุดของบัตรคิวมือถือต้องไม่เกินเกณฑ์ปิดรับ walk-in" });
      const p = v["booking.queue.prefixes"];
      if (isRec(p)) {
        const letters = [p.walkIn, p.appointment, p.priority].filter((x): x is string => typeof x === "string");
        if (!unique(letters))
          out.push({ key: "booking.queue.prefixes", code: "QUEUE_PREFIX_DUPLICATE", messageTh: "ตัวอักษรนำเลขบัตรคิวแต่ละแบบต้องไม่ซ้ำกัน" });
      }
      const groups = v["booking.queue.priorityGroups"];
      if (Array.isArray(groups) && groups.length > 0 && isRec(p) && p.priority === null)
        out.push({ key: "booking.queue.prefixes", code: "PRIORITY_PREFIX_REQUIRED", messageTh: "มีกลุ่มได้คิวก่อน ต้องกำหนดตัวอักษรนำเลขบัตรคิวของกลุ่มนี้" });
      return out;
    },
  },
  {
    group: "course",
    check: (v): GroupIssue[] =>
      v["booking.course.enabled"] === true && v["booking.course.policy"] === null
        ? [{ key: "booking.course.policy", code: "COURSE_POLICY_REQUIRED", messageTh: "เปิดขายคอร์สต้องตั้งนโยบายคอร์ส" }]
        : [],
  },
  {
    group: "money",
    check: (v): GroupIssue[] =>
      v["booking.money.commissionTo"] === "PERFORMER" && v["booking.money.commissionRate"] === null
        ? [{ key: "booking.money.commissionRate", code: "COMMISSION_RATE_REQUIRED", messageTh: "ให้ค่าคอมฯ ผู้ให้บริการต้องตั้งอัตราค่าคอมฯ" }]
        : [],
  },
];

// ─────────────────── ป้ายไทย (B.11 · หน้าตั้งค่าไม่แสดงค่าดิบ) — เพิ่มป้ายอย่างเดียว ไม่แตะ key/ค่าเริ่ม/chain/schema/editPermission ───────────────────
const GROUP_LABELS_TH: Record<string, string> = {
  general: "ทั่วไป",
  staff: "ผู้ให้บริการ",
  service: "บริการ",
  booking: "เวลาและการจอง",
  late: "มาสาย · ไม่มา · ยกเลิก",
  deposit: "มัดจำ",
  queue: "walk-in และลำดับคิว",
  notify: "แจ้งเตือน",
  msg: "ข้อความถึงลูกค้า",
  display: "จอทีวีเรียกคิว",
  kiosk: "ตู้รับบัตรคิว",
  money: "ค่าคอมมิชชันและเงิน",
  course: "คอร์ส",
  privacy: "ความเป็นส่วนตัว",
};

const ENUM_LABELS_TH: Record<string, Record<string, string>> = {
  "booking.general.shopType": { BARBER: "ตัดผม/เสริมสวย", SPA: "นวด/สปา", CLINIC: "คลินิก" },
  "booking.staff.weeklySchedule": { UNIT_HOURS: "ตามเวลาร้าน", OWN_SCHEDULE: "ตารางของตัวเอง" },
  "booking.staff.servicesMode": { ALL: "ทำได้ทุกบริการ", ASSIGNED: "เฉพาะบริการที่ผูกไว้" },
  "booking.service.durationSource": { CATALOG: "ตามแคตตาล็อกสินค้า/บริการ" },
  "booking.service.resourceRule": { STAFF_CHAIR: "เก้าอี้ประจำของช่าง", PER_SERVICE: "ห้อง/เตียงตามบริการ", EXAM_ROOM: "ห้องตรวจ" },
  "booking.booking.extraFields": { MASSAGE_NOTE: "จุดที่ปวด/แรงนวด", SYMPTOM_OPTIONAL: "อาการเบื้องต้น (ไม่บังคับ)" },
  "booking.late.afterGrace": { RELEASE_REQUEUE: "ปล่อยช่อง + ต่อคิวท้าย", WAIT_NOTIFY_COUNTER: "รอไว้ · แจ้งเคาน์เตอร์" },
  "booking.deposit.method": { NONE: "ไม่เก็บมัดจำ", PROMPTPAY_SLIP: "QR พร้อมเพย์ + ตรวจสลิป" },
  "booking.late.lateCancelMode": { BLOCK: "ห้ามยกเลิกเอง (ติดต่อร้าน)", FORFEIT: "ยกเลิกได้ · ร้านเก็บมัดจำตามที่ตั้ง" }, // SVC B.8
  "booking.queue.order": { SINGLE_LINE_BY_TIME: "แถวเดียว ตามเวลาที่จะได้ทำ", APPOINTMENT_FIRST: "นัดก่อน walk-in เสมอ" },
  "booking.kiosk.services": { WALKIN_ENABLED: "เฉพาะบริการที่รับ walk-in", ALL: "ทุกบริการ" },
  "booking.kiosk.phone": { OPTIONAL: "ไม่บังคับ", REQUIRED: "บังคับกรอก" },
  "booking.money.onDone": { POS_HELD_BILL: "เปิดบิลพักไว้ที่หน้าขาย" },
  "booking.money.commissionTo": { PERFORMER: "ผู้ให้บริการ", OFF: "ไม่คิดค่าคอมฯ" },
};

/** def ชนิด percent ที่เก็บเป็น % เต็ม 0–100 (มติผู้คุม 29 ต.ค. · บั๊กหน่วย) — เพิ่ม def percent ใหม่ต้องตั้งที่นี่ด้วย */
const WHOLE_PERCENT_KEYS: ReadonlySet<string> = new Set(["booking.booking.onlineSharePct", "booking.deposit.forfeitPct"]);

const LABELED_DEFS: SettingDef[] = DEFS.map((d) => ({
  ...d,
  ...(ENUM_LABELS_TH[d.key] ? { enumLabelsTh: ENUM_LABELS_TH[d.key] } : {}),
  ...(WHOLE_PERCENT_KEYS.has(d.key) ? { percentScale: 100 as const } : {}),
}));

defineSettings("booking", LABELED_DEFS, { templates: BOOKING_TEMPLATES, snapshots: SNAPSHOTS, groupRules: GROUP_RULES, groupLabelsTh: GROUP_LABELS_TH });

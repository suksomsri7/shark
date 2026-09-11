// journey-presets.ts — journey สำเร็จรูป 6 แบบ (M3.3 · ภาพ 07 ตาราง "Journey ที่เปิดใช้อยู่")
//
// 🔴 ไฟล์นี้ **บริสุทธิ์** (ไม่แตะ prisma/env/Next) — หน้าจอเอาไปวาดปุ่ม "สร้างจากสำเร็จรูป" ได้ตรง ๆ
// 🔴 ของที่ต้องรู้จักร้านจริงถูกทิ้งเป็น "ช่องว่าง" ไว้ให้ `journeys.ts#createFromPreset` เติมตอนสร้าง:
//    - `TIER_AT_LEAST("silver")` → รหัสระดับจริงของร้านนั้นตั้งแต่ Silver ขึ้นไป (ร้านไม่มีระดับนี้ = ตัดเงื่อนไขทิ้ง)
//    - `ISSUE_VOUCHER.params.templateId = ""` → แบบ voucher ที่ผู้ใช้เลือก หรือแบบแรกที่ร้านมี
//      (ร้านที่ยังไม่มีแบบ voucher เลย = ตัดขั้นนั้นทิ้ง ดีกว่าสร้าง journey ที่พังทุกครั้งที่วิ่ง)

import type { JourneyAction, JourneyTrigger } from "./journeys-shared";
import type { SegmentCondition, SegmentDefinition, SegmentFieldDef } from "./segments-shared";

/** ค่าพิเศษในเงื่อนไขของสำเร็จรูป: "ระดับตั้งแต่ <key> ขึ้นไป" — `journeys.ts` แปลเป็นรหัสระดับจริงตอนสร้าง */
export const TIER_AT_LEAST_PREFIX = "@tier-at-least:";
export const TIER_AT_LEAST = (key: string): string => `${TIER_AT_LEAST_PREFIX}${key}`;

export type JourneyPreset = {
  key: string;
  /** ชื่อไทยที่ใช้เป็นชื่อ journey ตอนสร้าง */
  name: string;
  /** คำอธิบายใต้ชื่อในการ์ดสำเร็จรูป */
  desc: string;
  trigger: JourneyTrigger;
  conditions: SegmentDefinition;
  actions: JourneyAction[];
  holdoutPct: number;
  reentryDays: number | null;
};

export const JOURNEY_PRESETS: readonly JourneyPreset[] = Object.freeze([
  {
    key: "birthday",
    name: "วันเกิดสมาชิก — voucher + LINE + แต้ม",
    desc: "ส่งของขวัญล่วงหน้า 7 วันก่อนวันเกิด แล้ววัดว่ากลับมาซื้อจริงกี่คน",
    trigger: { event: "member.birthday.upcoming", params: { daysBefore: 7 } },
    conditions: { groups: [] },
    actions: [
      { type: "ISSUE_VOUCHER", params: { templateId: "" } },
      {
        type: "SEND_LINE",
        params: { template: "สุขสันต์วันเกิดค่ะคุณ {ชื่อ} รับของขวัญจากร้านได้เลย · รหัส {voucher}" },
      },
      { type: "GIVE_POINTS", params: { points: 100 } },
    ],
    holdoutPct: 10,
    reentryDays: 300,
  },
  {
    key: "new_member",
    name: "สมาชิกใหม่ — ต้อนรับ + วันที่ 7/30",
    desc: "ทักทายทันทีที่สมัคร แล้วตามอีก 2 ครั้งใน 7 และ 30 วัน",
    trigger: { event: "member.created" },
    conditions: { groups: [] },
    actions: [
      { type: "ADD_TAG", params: { tag: "new" } },
      { type: "SEND_LINE", params: { template: "ยินดีต้อนรับคุณ {ชื่อ} เข้าสู่ครอบครัวของเราค่ะ" } },
      {
        type: "WAIT_THEN",
        params: {
          days: 7,
          thenActions: [{ type: "SEND_LINE", params: { template: "คุณ {ชื่อ} คะ ครบ 7 วันแล้ว มีอะไรให้ช่วยแนะนำไหมคะ" } }],
        },
      },
      {
        type: "WAIT_THEN",
        params: {
          days: 30,
          thenActions: [{ type: "SEND_LINE", params: { template: "คุณ {ชื่อ} คะ เดือนนี้มีรอบใหม่น่าสนใจ แวะมาคุยกันได้นะคะ" } }],
        },
      },
    ],
    holdoutPct: 10,
    reentryDays: null,
  },
  {
    key: "inactive",
    name: "หายไปนาน — ดึงกลับ",
    desc: "ไม่ซื้อ/ไม่จอง 60 วัน · ส่ง voucher แล้วตามซ้ำทาง SMS ถ้ายังไม่ใช้",
    trigger: { event: "member.inactive", params: { days: 60 } },
    conditions: {
      groups: [
        {
          conditions: [
            { field: "tier", op: "in", value: [TIER_AT_LEAST("silver")] },
            { field: "consent.LINE", op: "eq", value: true },
          ],
        },
      ],
    },
    actions: [
      { type: "ISSUE_VOUCHER", params: { templateId: "" } },
      {
        type: "SEND_LINE",
        params: { template: "คิดถึงคุณ {ชื่อ} นะคะ รับส่วนลดพิเศษไปใช้ได้เลย · รหัส {voucher}" },
      },
      {
        type: "WAIT_THEN",
        params: {
          days: 7,
          ifVoucherUnused: true,
          thenActions: [{ type: "SEND_SMS", params: { template: "คุณ {ชื่อ} ส่วนลดของคุณยังไม่ถูกใช้ · รหัส {voucher}" } }],
        },
      },
    ],
    holdoutPct: 10,
    reentryDays: 90,
  },
  {
    key: "at_risk",
    name: "ใกล้ลดระดับ — เตือนล่วงหน้า",
    desc: "ยอดยังไม่ถึงเกณฑ์คงระดับ · บอกลูกค้าก่อน แล้วให้ทีมตามต่อ",
    trigger: { event: "member.tier.at_risk" },
    conditions: { groups: [] },
    actions: [
      {
        type: "SEND_LINE",
        params: { template: "คุณ {ชื่อ} คะ ระดับ {ระดับ} ของคุณใกล้ถึงรอบทบทวนแล้ว แวะมาใช้บริการก่อนหมดรอบนะคะ" },
      },
      { type: "NOTIFY_STAFF", params: { title: "{ชื่อ} เสี่ยงหลุดระดับ — ติดต่อกลับ" } },
    ],
    holdoutPct: 10,
    reentryDays: 30,
  },
  {
    key: "no_show",
    name: "จองแล้วไม่มา — ชวนนัดใหม่",
    desc: "ส่ง voucher นัดใหม่ทันทีที่ทีมกด “ไม่มาตามนัด”",
    trigger: { event: "booking.no_show" },
    conditions: { groups: [] },
    actions: [
      { type: "ISSUE_VOUCHER", params: { templateId: "" } },
      {
        type: "SEND_LINE",
        params: { template: "คุณ {ชื่อ} คะ เสียดายที่ไม่ได้เจอกัน · รับส่วนลดสำหรับนัดใหม่ได้เลย รหัส {voucher}" },
      },
    ],
    holdoutPct: 10,
    reentryDays: 30,
  },
  {
    key: "review",
    name: "หลังจบบริการ — ขอรีวิว",
    desc: "ปิดบิลแล้วรอ 1 วันค่อยขอรีวิว (ไม่รบกวนตอนลูกค้ายังอยู่หน้าร้าน)",
    trigger: { event: "pos.sale.paid" },
    conditions: { groups: [] },
    actions: [
      {
        type: "WAIT_THEN",
        params: { days: 1, thenActions: [{ type: "REQUEST_REVIEW", params: {} }] },
      },
    ],
    holdoutPct: 10,
    reentryDays: 30,
  },
] as const);

export const JOURNEY_PRESET_KEYS: readonly string[] = Object.freeze(JOURNEY_PRESETS.map((p) => p.key));

export const journeyPreset = (key: string): JourneyPreset | undefined => JOURNEY_PRESETS.find((p) => p.key === key);

/** สถานะของตัวสร้าง journey บนหน้าจอ (เงื่อนไขเป็นแถว AND แถวเดียว — ตรงกับประโยค "และถ้า … และ …") */
export type JourneyBuilderInitial = {
  name: string;
  trigger: JourneyTrigger;
  conditions: SegmentCondition[];
  actions: JourneyAction[];
  holdoutPct: number;
  reentryDays: number | null;
  enabled: boolean;
};

/**
 * แปลง journey สำเร็จรูป → ร่างในตัวสร้าง (หน้าจอใช้ · ฝั่ง server ใช้ `journeys.ts#createFromPreset`)
 * "ระดับตั้งแต่ X" แปลงด้วยลำดับระดับจริงของร้าน (options ของฟิลด์ tier เรียงตามระดับอยู่แล้ว) · voucher = แบบแรก
 * 🔴 อยู่ไฟล์บริสุทธิ์นี้ (ไม่ใช่ใน component "use client") เพราะหน้า server เรียกเพื่อเตรียมตัวอย่างในตัวสร้างด้วย
 */
export function presetToDraft(p: JourneyPreset, fields: SegmentFieldDef[], templates: { id: string }[]): JourneyBuilderInitial {
  const tierOpts = fields.find((f) => f.key === "tier")?.options ?? [];
  const conditions: SegmentCondition[] = p.conditions.groups.flatMap((g) =>
    g.conditions.flatMap((c) => {
      const vals = Array.isArray(c.value) ? c.value : [c.value];
      const marker = vals.find((v) => typeof v === "string" && v.startsWith(TIER_AT_LEAST_PREFIX));
      if (typeof marker !== "string") return [c];
      const at = tierOpts.findIndex((o) => o.value === marker.slice(TIER_AT_LEAST_PREFIX.length));
      if (at < 0) return [];
      return [{ ...c, value: tierOpts.slice(at).map((o) => o.value) }];
    }),
  );
  const mapActions = (list: JourneyAction[]): JourneyAction[] =>
    list.flatMap((a) => {
      if (a.type === "ISSUE_VOUCHER") return templates[0] ? [{ type: a.type, params: { templateId: templates[0].id } }] : [];
      if (a.type === "WAIT_THEN") {
        const inner = mapActions(Array.isArray(a.params?.thenActions) ? (a.params.thenActions as JourneyAction[]) : []);
        return inner.length ? [{ type: a.type, params: { ...(a.params ?? {}), thenActions: inner } }] : [];
      }
      return [{ type: a.type, params: { ...(a.params ?? {}) } }];
    });
  return {
    name: p.name,
    trigger: { event: p.trigger.event, ...(p.trigger.params ? { params: { ...p.trigger.params } } : {}) },
    conditions,
    actions: mapActions(p.actions),
    holdoutPct: p.holdoutPct,
    reentryDays: p.reentryDays,
    enabled: true,
  };
}

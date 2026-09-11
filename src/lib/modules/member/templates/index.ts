// templates/ — เทมเพลตกิจการเป็น "ข้อมูล" (D7 · พิมพ์เขียว docs/modules/06-member-v2.md §10)
//
// ทะเบียนกลาง: `TEMPLATES[key]` → ส่วน/ฟิลด์/ระดับ/สแตมป์/journey (M3.9 · 16 ชุด + ทั่วไป)
// `fields.applyTemplate(ctx, key)` เอาส่วน "fields" ไปสร้างจริง (รูปแบบเดิมของ M1.2 — ยังใช้ได้)
// `templates-service.ts#applyTemplate(ctx, key, { parts, actor })` เอาทั้ง 4 ส่วนไปสร้างจริง (M3.9)
//
// 🔴 เพิ่มเทมเพลตกิจการใหม่ = เพิ่มไฟล์ในโฟลเดอร์นี้ + ลงทะเบียนใน `TEMPLATES` เท่านั้น
//    ห้ามใส่ตรรกะ (เงื่อนไข/คิวรี) ในเทมเพลต — เทมเพลตคือข้อมูลล้วน จึงตรวจด้วยตาได้และ diff รู้เรื่อง
// 🔴 ไฟล์ในโฟลเดอร์นี้ (รวมไฟล์นี้) ห้าม import prisma/facade อื่นใด — ข้อมูลล้วนเท่านั้น
//    (import type จาก `../fields` เป็น type-only ถูกลบตอน compile ไม่นับเป็นการแตะ prisma)

import type { MemberFieldType } from "@prisma/client";
// type-only (ถูกลบตอน compile) — ไม่เกิดวงจร import ตอนรัน แม้ `fields.ts` จะ import ไฟล์นี้
import type { MemberFieldOptions } from "../fields";
import { DIVE_TEMPLATE } from "./dive";
import { GENERAL_TEMPLATE } from "./general";
import { CLINIC_TEMPLATE } from "./clinic";
import { DENTAL_TEMPLATE } from "./dental";
import { RESTAURANT_TEMPLATE } from "./restaurant";
import { FITNESS_TEMPLATE } from "./fitness";
import { HOTEL_TEMPLATE } from "./hotel";
import { RETAIL_TEMPLATE } from "./retail";
import { SALON_TEMPLATE } from "./salon";
import { TUTORING_TEMPLATE } from "./tutoring";
import { VET_TEMPLATE } from "./vet";
import { CARCARE_TEMPLATE } from "./carcare";
import { TRAVEL_TEMPLATE } from "./travel";
import { SPORTSCLUB_TEMPLATE } from "./sportsclub";
import { REPAIR_TEMPLATE } from "./repair";
import { REALESTATE_TEMPLATE } from "./realestate";
import { B2B_TEMPLATE } from "./b2b";

export type MemberTemplateField = {
  key: string;
  label: string;
  type: MemberFieldType;
  options?: MemberFieldOptions;
  required?: boolean;
  unique?: boolean;
  filterable?: boolean;
  showInList?: boolean;
  showOnCard?: boolean;
  customerEditable?: boolean;
  sensitive?: boolean;
  trackHistory?: boolean;
};

export type MemberTemplateSection = {
  key: string;
  label: string;
  description?: string;
  columns?: number;
  sensitive?: boolean;
  fields: MemberTemplateField[];
};

/** สีระดับที่มีจริง (ตรงกับ enum `TierColor`/ตัวเลือกของ `tiers.createTierDef`) */
export type MemberTemplateTierColor = "SLATE" | "BLUE" | "GREEN" | "AMBER" | "RED" | "PURPLE";

/** สิทธิประโยชน์ของระดับ — `kind` แม็ปไปที่ `type` ของ `tiers.setBenefits` ตอน apply จริง */
export type MemberTemplateTierBenefit = { kind: string; config: Record<string, unknown> };

/** กฎเลื่อนระดับแบบง่าย — templates-service แปลงเป็น `RuleInput` ของ `tiers.setTierRules` ตอน apply จริง */
export type MemberTemplateTierRule = { spentSatang?: number; visits?: number; windowMonths?: number };

export type MemberTemplateTier = {
  /** รหัสระดับ — ต้องตรง `^[a-z][a-z0-9_]*$` (กติกาเดียวกับ `tiers.createTierDef`) */
  key: string;
  label: string;
  color?: MemberTemplateTierColor;
  description?: string;
  rule?: MemberTemplateTierRule;
  benefits?: MemberTemplateTierBenefit[];
};

export type MemberTemplateStamp = {
  /** ใช้แยกแยะภายในเทมเพลตเท่านั้น — ของจริงเทียบซ้ำกันด้วย `name` (StampCard ไม่มีคอลัมน์ key) */
  key: string;
  name: string;
  /** จำนวนช่อง 3–30 (`STAMP_MIN_SLOTS`–`STAMP_MAX_SLOTS`) */
  slots: number;
  /** ต้องอยู่ในทะเบียน `stamp.RULE_KINDS` */
  ruleKind: string;
  ruleConfig?: Record<string, unknown>;
  /** ต้องอยู่ในทะเบียน `stamp.REWARD_KINDS` */
  rewardKind: string;
  rewardConfig: Record<string, unknown>;
  description?: string;
};

export type MemberTemplateJourneyTrigger = { event: string; params?: Record<string, unknown> };

export type MemberTemplateJourney = {
  /** ใช้แยกแยะภายในเทมเพลตเท่านั้น — ของจริงเทียบซ้ำกันด้วย `name` (AutomationRule) */
  key: string;
  name: string;
  /** อ้าง journey สำเร็จรูปของ M3.3 (`JOURNEY_PRESETS`) — ให้ค่านี้ **หรือ** `trigger`/`actions` อย่างใดอย่างหนึ่ง */
  presetKey?: string;
  /** นิยามเอง (เมื่อไม่มี presetKey ที่เหมาะ) — `event` ต้องอยู่ใน `JOURNEY_TRIGGERS` */
  trigger?: MemberTemplateJourneyTrigger;
  conditions?: unknown;
  actions?: { type: string; params?: Record<string, unknown> }[];
  description?: string;
};

export type MemberTemplate = {
  key: string;
  /** ชื่อไทยที่แสดงในตัวเลือก "เลือกประเภทกิจการ" */
  name: string;
  description?: string;
  sections: MemberTemplateSection[];
  tiers?: MemberTemplateTier[];
  stamps?: MemberTemplateStamp[];
  journeys?: MemberTemplateJourney[];
};

/** ทะเบียนเทมเพลตทั้งหมด (M3.9 · 16 ชุดตาม §10 + ทั่วไป = 17 คีย์) */
export const TEMPLATES: Record<string, MemberTemplate> = {
  [DIVE_TEMPLATE.key]: DIVE_TEMPLATE,
  [CLINIC_TEMPLATE.key]: CLINIC_TEMPLATE,
  [DENTAL_TEMPLATE.key]: DENTAL_TEMPLATE,
  [RESTAURANT_TEMPLATE.key]: RESTAURANT_TEMPLATE,
  [FITNESS_TEMPLATE.key]: FITNESS_TEMPLATE,
  [HOTEL_TEMPLATE.key]: HOTEL_TEMPLATE,
  [RETAIL_TEMPLATE.key]: RETAIL_TEMPLATE,
  [SALON_TEMPLATE.key]: SALON_TEMPLATE,
  [TUTORING_TEMPLATE.key]: TUTORING_TEMPLATE,
  [VET_TEMPLATE.key]: VET_TEMPLATE,
  [CARCARE_TEMPLATE.key]: CARCARE_TEMPLATE,
  [TRAVEL_TEMPLATE.key]: TRAVEL_TEMPLATE,
  [SPORTSCLUB_TEMPLATE.key]: SPORTSCLUB_TEMPLATE,
  [REPAIR_TEMPLATE.key]: REPAIR_TEMPLATE,
  [REALESTATE_TEMPLATE.key]: REALESTATE_TEMPLATE,
  [B2B_TEMPLATE.key]: B2B_TEMPLATE,
  [GENERAL_TEMPLATE.key]: GENERAL_TEMPLATE,
};

export function getTemplate(key: string): MemberTemplate | null {
  return TEMPLATES[key] ?? null;
}

export {
  DIVE_TEMPLATE,
  GENERAL_TEMPLATE,
  CLINIC_TEMPLATE,
  DENTAL_TEMPLATE,
  RESTAURANT_TEMPLATE,
  FITNESS_TEMPLATE,
  HOTEL_TEMPLATE,
  RETAIL_TEMPLATE,
  SALON_TEMPLATE,
  TUTORING_TEMPLATE,
  VET_TEMPLATE,
  CARCARE_TEMPLATE,
  TRAVEL_TEMPLATE,
  SPORTSCLUB_TEMPLATE,
  REPAIR_TEMPLATE,
  REALESTATE_TEMPLATE,
  B2B_TEMPLATE,
};

// templates/ — เทมเพลตกิจการเป็น "ข้อมูล" (D7 · พิมพ์เขียว docs/modules/06-member-v2.md §10)
//
// ทะเบียนกลาง: `TEMPLATES[key]` → ส่วน/ฟิลด์ (+ระดับ/สแตมป์/journey ที่ M3.9 จะเติม)
// `fields.applyTemplate(ctx, key)` เป็นคนเอาข้อมูลชุดนี้ไปสร้างจริง (เพิ่มเฉพาะที่ยังไม่มี · ไม่ทับของเดิม)
//
// 🔴 เพิ่มเทมเพลตกิจการใหม่ = เพิ่มไฟล์ในโฟลเดอร์นี้ + ลงทะเบียนใน `TEMPLATES` เท่านั้น
//    ห้ามใส่ตรรกะ (เงื่อนไข/คิวรี) ในเทมเพลต — เทมเพลตคือข้อมูลล้วน จึงตรวจด้วยตาได้และ diff รู้เรื่อง

import type { MemberFieldType } from "@prisma/client";
// type-only (ถูกลบตอน compile) — ไม่เกิดวงจร import ตอนรัน แม้ `fields.ts` จะ import ไฟล์นี้
import type { MemberFieldOptions } from "../fields";
import { DIVE_TEMPLATE } from "./dive";
import { GENERAL_TEMPLATE } from "./general";

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

// ── ที่ว่างของ M3.9 (ระดับ/สแตมป์/journey ต่อกิจการ) — ประกาศรูปร่างไว้ก่อนเพื่อให้เติมได้โดยไม่แก้สัญญา ──
export type MemberTemplateTier = { key: string; label: string; minSpendSatang?: number; minVisits?: number };
export type MemberTemplateStamp = { key: string; label: string; goal: number; rewardLabel?: string };
export type MemberTemplateJourney = { key: string; label: string; trigger: string; description?: string };

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

/** ทะเบียนเทมเพลตทั้งหมด (M1.2 = 2 ชุด · M3.9 = ครบ 16 ชุดตาม §10) */
export const TEMPLATES: Record<string, MemberTemplate> = {
  [DIVE_TEMPLATE.key]: DIVE_TEMPLATE,
  [GENERAL_TEMPLATE.key]: GENERAL_TEMPLATE,
};

export function getTemplate(key: string): MemberTemplate | null {
  return TEMPLATES[key] ?? null;
}

export { DIVE_TEMPLATE, GENERAL_TEMPLATE };

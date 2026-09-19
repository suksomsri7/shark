// templates/business/types.ts — ชนิดข้อมูลของ "เทมเพลต CRM ตามประเภทกิจการ" 16 ชุด (ใบ C1.11 · พิมพ์เขียว §10 · สัญญาข้อ C ของ oracle)
//
// 🔴 ข้อมูลล้วน (ไม่แตะ prisma/next) — ตัว apply อยู่ที่ `crm/templates.ts` (`applyBusinessTemplate`)
// 🔴 ทุกชุดมี 6 ส่วน: pipeline+ขั้น (probability · staleDays บนขั้นเปิด · requireFields) · เหตุผลที่แพ้ · กฎคะแนน · sequence เริ่มต้น ·
//    วัตถุกำหนดเอง · ฟิลด์เพิ่มของผู้ติดต่อ/บริษัท/ดีล — ค่าที่แถวไม่ระบุใช้ "ค่ากลาง" ใน `./central.ts`
// 🔴 กฎคะแนน (C2.8) และ sequence (C2.2) **เก็บเป็นข้อมูลเท่านั้น** ในใบนี้ (มติผู้คุมงาน C1.11 ข้อ 2) — ร้านที่ apply ได้ตัวชี้
//    `settings.crm.businessTemplate.key` แล้วใบ C2.x อ่านข้อมูลจากที่นี่ไปสร้างตารางจริง
import type { ObjectTemplateParent } from "../objects";

export type BusinessFieldType = "TEXT" | "LONG_TEXT" | "NUMBER" | "MONEY" | "DATE" | "SELECT" | "MULTI_SELECT" | "BOOLEAN";

export type BusinessField = {
  key: string;
  label: string;
  type: BusinessFieldType;
  options?: { choices?: { value: string; label: string }[]; unit?: string; decimals?: number; min?: number; max?: number; maxLength?: number };
};

export type BusinessStage = {
  name: string;
  kind: "OPEN" | "WON" | "LOST";
  /** 0..100 */
  probability: number;
  /** ขั้นเปิด: จำนวนวันที่ไม่ขยับแล้วถือว่า "นิ่ง" (C2.10 ใช้) */
  staleDays?: number;
  /** ⊆ STAGE_REQUIRABLE_SYSTEM_KEYS ∪ key ของ `fields.deal` ในเทมเพลตเดียวกัน */
  requireFields?: string[];
};

export type BusinessPipeline = { name: string; kind?: "SALES" | "RENEWAL" | "SERVICE"; stages: BusinessStage[] };

export type BusinessLostReason = { key: string; label: string };

/** กฎคะแนน (เก็บไว้ให้ C2.8) — event = key จาก AUTOMATION_EVENTS · points ติดลบได้ */
export type BusinessScoreRule = { key: string; label: string; event: string; points: number; maxPerDay?: number; expiresDays?: number };

/** sequence เริ่มต้น (เก็บไว้ให้ C2.2) — `day` = วันที่นับจากลงทะเบียน */
export type BusinessSequenceStep = { day: number; channel: "EMAIL" | "LINE" | "TASK"; title: string };
export type BusinessSequence = { key: string; name: string; trigger: string; steps: BusinessSequenceStep[] };

export type BusinessObjectSection = { key: string; label: string; fields: BusinessField[] };

/** วัตถุกำหนดเองแบบกำหนดเองในแถว หรืออ้างเทมเพลตวัตถุกลาง 8 ชุด (`OBJECT_TEMPLATES`) */
export type BusinessObject =
  | { key: string; label: string; labelPlural: string; parentType: ObjectTemplateParent; titleFieldKey: string; sections: BusinessObjectSection[] }
  | { templateKey: string };

export type BusinessTemplate = {
  key: string;
  /** ชื่อไทยที่ร้านเห็นในตัวเลือก */
  label: string;
  /** คำอธิบายสั้น (ตัวเลือกตอนเปิดใช้ครั้งแรก) */
  description: string;
  pipelines: BusinessPipeline[];
  lostReasons: BusinessLostReason[];
  scoreRules: BusinessScoreRule[];
  sequences: BusinessSequence[];
  objects: BusinessObject[];
  fields: { contact: BusinessField[]; company: BusinessField[]; deal: BusinessField[] };
};

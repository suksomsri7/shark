// เทมเพลตกิจการ #16 — ทั่วไป (ค่ากลาง) (พิมพ์เขียว §10 แถวที่ 16) · ข้อมูลล้วน (ไม่แตะ prisma/next)
// 🔴 pipeline = `DEFAULT_PIPELINE` 5 ขั้นเดิม (ชื่อ/ชนิด/โอกาสปิดตรงกันทุกตัว) + staleDays ของขั้นเปิด · ไม่มีวัตถุกำหนดเอง
//    (ร้านเพิ่มเองจากเทมเพลตวัตถุ 8 ชุดที่หน้าตั้งค่าวัตถุ) — ชื่อ/ค่าคัดลอกไว้ที่นี่ (ไฟล์ข้อมูลห้าม import rules.ts ที่ลากชนิดของฐานข้อมูลมาด้วย)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES } from "./central";

export const GENERAL_TEMPLATE: BusinessTemplate = {
  key: "general",
  label: "ทั่วไป (ค่ากลาง)",
  description: "ใช้ได้กับทุกกิจการ — pipeline 5 ขั้นมาตรฐาน ปรับเองได้ภายหลัง",
  pipelines: [
    {
      name: "ไปป์ไลน์การขาย",
      kind: "SALES",
      stages: [
        { name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10, staleDays: 7 },
        { name: "ติดต่อแล้ว", kind: "OPEN", probability: 30, staleDays: 7 },
        { name: "เสนอราคา", kind: "OPEN", probability: 60, staleDays: 14 },
        { name: "ปิดการขายได้", kind: "WON", probability: 100 },
        { name: "ไม่สำเร็จ", kind: "LOST", probability: 0 },
      ],
    },
  ],
  lostReasons: [...CENTRAL_LOST_REASONS],
  scoreRules: [...CENTRAL_SCORE_RULES],
  sequences: [CENTRAL_QUOTE_SEQUENCE],
  objects: [],
  fields: { contact: [], company: [], deal: [] },
};

// เทมเพลตกิจการ #11 — ประกัน/การเงิน (พิมพ์เขียว §10 แถวที่ 11) · ข้อมูลล้วน (ไม่แตะ prisma/next)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, pipeline } from "./central";

export const INSURANCE_TEMPLATE: BusinessTemplate = {
  key: "insurance",
  label: "ประกัน / การเงิน",
  description: "ตัวแทนประกัน ที่ปรึกษาการเงิน — เสนอแผน เก็บเอกสาร และต่ออายุกรมธรรม์",
  pipelines: [pipeline("ขายแผนประกัน", [["ผู้สนใจ", 10, 3], ["เสนอแผน", 35, 5, ["valueSatang"]], ["เอกสาร", 60, 7], ["อนุมัติ", 85, 14]], "ชนะ")],
  lostReasons: [...CENTRAL_LOST_REASONS, { key: "underwriting", label: "ไม่ผ่านการพิจารณารับประกัน" }],
  scoreRules: [...CENTRAL_SCORE_RULES],
  sequences: [
    { key: "policy_renew", name: "กรมธรรม์หมดใน 45 วัน: ต่ออายุ", trigger: "custom.record.due", steps: [{ day: 0, channel: "TASK", title: "เปิดดีลต่ออายุกรมธรรม์" }, { day: 5, channel: "LINE", title: "แจ้งกำหนดต่ออายุ" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [{ templateKey: "policy" }],
  fields: {
    contact: [
      { key: "occupation", label: "อาชีพ", type: "TEXT", options: { maxLength: 80 } },
      { key: "coverInterest", label: "ความคุ้มครองที่สนใจ", type: "MULTI_SELECT", options: { choices: [{ value: "life", label: "ชีวิต" }, { value: "health", label: "สุขภาพ" }, { value: "car", label: "รถยนต์" }, { value: "home", label: "บ้าน" }, { value: "saving", label: "ออมทรัพย์" }] } },
    ],
    company: [],
    deal: [],
  },
};

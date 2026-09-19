// เทมเพลตกิจการ #7 — อสังหาฯ/นายหน้า (พิมพ์เขียว §10 แถวที่ 7) · ข้อมูลล้วน (ไม่แตะ prisma/next)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, choices, pipeline } from "./central";

export const REALESTATE_TEMPLATE: BusinessTemplate = {
  key: "realestate",
  label: "อสังหาฯ / นายหน้า",
  description: "โครงการที่อยู่อาศัย นายหน้า — นัดชม จอง จนถึงวันโอน",
  pipelines: [pipeline("ขายทรัพย์", [["ผู้สนใจ", 10, 3], ["นัดชม", 30, 2], ["เสนอ", 55, 7, ["valueSatang"]], ["จอง", 85, 30, ["propertyRef"]]], "โอน")],
  lostReasons: [...CENTRAL_LOST_REASONS, { key: "loan_rejected", label: "สินเชื่อไม่ผ่าน" }],
  scoreRules: [...CENTRAL_SCORE_RULES],
  sequences: [
    { key: "after_viewing", name: "นัดชมแล้ว 2 วัน: โทรตาม", trigger: "crm.activity.completed", steps: [{ day: 2, channel: "TASK", title: "โทรถามความเห็นหลังชมทรัพย์" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [{ templateKey: "property" }],
  fields: {
    contact: [],
    company: [],
    deal: [
      { key: "propertyRef", label: "ทรัพย์", type: "TEXT", options: { maxLength: 120 } },
      { key: "budget", label: "งบ", type: "MONEY" },
      { key: "loanStatus", label: "สินเชื่อ", type: "SELECT", options: { choices: choices([["cash", "เงินสด"], ["pending", "ยื่นกู้แล้ว"], ["approved", "อนุมัติแล้ว"], ["rejected", "ไม่ผ่าน"]]) } },
    ],
  },
};

// เทมเพลตกิจการ #4 — ฟิตเนส/สตูดิโอ (พิมพ์เขียว §10 แถวที่ 4) · ข้อมูลล้วน (ไม่แตะ prisma/next)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, choices, pipeline } from "./central";

export const FITNESS_TEMPLATE: BusinessTemplate = {
  key: "fitness",
  label: "ฟิตเนส / สตูดิโอ",
  description: "ฟิตเนส โยคะ พิลาทิส มวย — จากคลาสทดลองสู่การสมัคร และแพ็กเกจองค์กร",
  pipelines: [pipeline("สมัครสมาชิก", [["ทดลอง", 20, 3], ["เสนอแพ็กเกจ", 50, 3, ["valueSatang"]], ["ตัดสินใจ", 75, 5]], "สมัคร")],
  lostReasons: [...CENTRAL_LOST_REASONS, { key: "location", label: "ไกลจากบ้าน/ที่ทำงาน" }],
  scoreRules: [...CENTRAL_SCORE_RULES],
  sequences: [
    { key: "trial_no_join", name: "ทดลองแล้วไม่สมัคร 3 วัน", trigger: "crm.activity.completed", steps: [{ day: 3, channel: "LINE", title: "ถามความรู้สึกหลังคลาสทดลอง" }, { day: 5, channel: "TASK", title: "โทรเสนอแพ็กเกจเริ่มต้น" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [
    {
      key: "corporate_package",
      label: "แพ็กเกจองค์กร",
      labelPlural: "แพ็กเกจองค์กร",
      parentType: "COMPANY",
      titleFieldKey: "packageName",
      sections: [
        {
          key: "package",
          label: "ข้อมูลแพ็กเกจ",
          fields: [
            { key: "packageName", label: "ชื่อแพ็กเกจ", type: "TEXT", options: { maxLength: 120 } },
            { key: "seats", label: "จำนวนสิทธิ์", type: "NUMBER", options: { unit: "คน", decimals: 0, min: 1 } },
            { key: "startAt", label: "เริ่ม", type: "DATE" },
            { key: "endAt", label: "สิ้นสุด", type: "DATE" },
          ],
        },
      ],
    },
  ],
  fields: {
    contact: [
      { key: "goal", label: "เป้าหมาย", type: "SELECT", options: { choices: choices([["lose", "ลดน้ำหนัก"], ["muscle", "เพิ่มกล้ามเนื้อ"], ["health", "สุขภาพทั่วไป"], ["sport", "ฝึกกีฬา"]]) } },
      { key: "preferredTime", label: "เวลาที่สะดวก", type: "SELECT", options: { choices: choices([["morning", "เช้า"], ["noon", "กลางวัน"], ["evening", "เย็น"], ["weekend", "เสาร์-อาทิตย์"]]) } },
    ],
    company: [],
    deal: [],
  },
};

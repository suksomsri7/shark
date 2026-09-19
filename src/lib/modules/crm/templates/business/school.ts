// เทมเพลตกิจการ #9 — โรงเรียน/สถาบัน (พิมพ์เขียว §10 แถวที่ 9) · ข้อมูลล้วน (ไม่แตะ prisma/next)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, pipeline } from "./central";

export const SCHOOL_TEMPLATE: BusinessTemplate = {
  key: "school",
  label: "โรงเรียน / สถาบันสอน",
  description: "โรงเรียนกวดวิชา สถาบันภาษา สอนว่ายน้ำ/ดนตรี — จากทดลองเรียนสู่การสมัคร",
  pipelines: [pipeline("รับสมัคร", [["สอบถาม", 10, 2], ["ทดลองเรียน", 35, 3], ["เสนอคอร์ส", 60, 5, ["valueSatang"]]], "สมัคร")],
  lostReasons: [...CENTRAL_LOST_REASONS, { key: "schedule", label: "เวลาเรียนไม่ตรง" }],
  scoreRules: [...CENTRAL_SCORE_RULES],
  sequences: [
    { key: "trial_follow", name: "ทดลองเรียนแล้ว 3 วัน: โทรตาม", trigger: "crm.activity.completed", steps: [{ day: 3, channel: "TASK", title: "โทรถามผลการทดลองเรียน" }] },
    { key: "next_course", name: "จบคอร์ส: เสนอคอร์สถัดไป", trigger: "custom.record.due", steps: [{ day: 0, channel: "EMAIL", title: "เสนอคอร์สระดับถัดไป" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [{ templateKey: "learner" }],
  fields: {
    contact: [],
    company: [],
    deal: [
      { key: "course", label: "คอร์ส", type: "TEXT", options: { maxLength: 120 } },
      { key: "intake", label: "รอบ", type: "TEXT", options: { maxLength: 60 } },
    ],
  },
};

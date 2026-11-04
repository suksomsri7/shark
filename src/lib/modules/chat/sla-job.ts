// sla-job.ts — ทางเข้าแบบ import ของงานรายนาที "chat.sla" (ใบ SEC S1.24 · RESOLUTIONS R-K8b)
//
// import ไฟล์นี้ = งานตรวจ SLA แชทลูกค้าลงทะเบียนแล้วแน่นอน (แบบเดียวกับ `ai/secretary/room-jobs-job.ts`)
//   ผู้ import: `scripts/crm-cron.mts` (ตัวรัน VPS ทุกนาที) + `/api/cron/outbox` (hook ของ route) — ไม่แตะ vercel.json
// ตัวงานจริง = `sweepChatSla` ใน routing.ts (กันซ้ำด้วยบันทึกภายในของห้อง ⇒ รันซ้ำ/ถูกตัดกลางคันได้)
import { registerMinuteJob } from "@/lib/platform/minute-jobs";
import { sweepChatSla } from "./routing";

export const CHAT_SLA_MINUTE_JOB = "chat.sla";

/** ลงทะเบียน "chat.sla" ทุก 5 นาที — เรียกซ้ำได้ (ชื่อ+จังหวะเดิม = แทนที่ตัวเดิม) */
export function registerChatSlaMinuteJob(): void {
  registerMinuteJob({
    name: CHAT_SLA_MINUTE_JOB,
    everyMinutes: 5,
    run: async (now, budgetMs, ctrl) => {
      void budgetMs;
      // เผื่อ 2 วิ ให้ห้องที่กำลังทำจบภายในงบ (ห้องที่เหลือรอบหน้าหยิบต่อ)
      await sweepChatSla(now, { deadline: ctrl.deadline - 2_000 });
    },
  });
}

registerChatSlaMinuteJob();

// room-jobs-job.ts — ทางเข้าแบบ import ของงานรายนาที "secretary.roomJobs" (ใบ S1.5 · RESOLUTIONS R-K8b)
//
// import ไฟล์นี้ = ตัวเก็บตกของคิวห้องเลขาลงทะเบียนแล้วแน่นอน (แบบเดียวกับ `crm/sequences-job.ts`)
//   ผู้ import: `scripts/crm-cron.mts` (ตัวรัน VPS ทุกนาที) + `/api/cron/outbox` (hook ของ route) — ไม่แตะ vercel.json
// ทางหลักยังเป็น route ส่งข้อความ (S1.14) ที่รัน `runRoomJobs` ทันทีใน `after()` · ตัวนี้เก็บงานที่ค้าง (lease หมด) เท่านั้น
import { registerRoomJobsMinuteJob, ROOM_JOBS_MINUTE_JOB } from "./worker";

registerRoomJobsMinuteJob();

export { ROOM_JOBS_MINUTE_JOB };

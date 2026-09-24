// emails-job.ts — ทางเข้าแบบ import ของงานรายนาที "crm.email.scheduled" (ใบ C2.5 · RESOLUTIONS R-C.6)
//
// 🔴 ตัวลงทะเบียนจริงอยู่ที่ `src/lib/platform/minute-jobs.ts` (บล็อก `CRM C2.5 ▸`) แบบเดียวกับงานของ C2.1/C2.2 —
//    ลงทะเบียน "ตอนโหลดทะเบียน" ไม่ใช่ตอนที่ใครบังเอิญ import โมดูล CRM: ทั้ง `/api/cron/outbox` และ
//    `scripts/crm-cron.mts` เห็นงานนี้เสมอ ไม่ว่าโพรเซสจะอุ่นหรือเย็น
// 🔴 ไฟล์นี้จึงเหลือหน้าที่เดียว: "import ไฟล์นี้ = ทะเบียนถูกโหลดแล้วแน่นอน" (ตัวรัน `scripts/crm-cron.mts`
//    และ `crm/emails.ts` import ตัวนี้) — ไฟล์เบา ไม่ลากกราฟ CRM ทั้งก้อน
import "@/lib/platform/minute-jobs";

export const EMAIL_SCHEDULED_JOB = "crm.email.scheduled";

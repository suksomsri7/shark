// sequences-job.ts — ทางเข้าแบบ import ของงานรายนาที "crm.sequences" (ใบ C2.2 · RESOLUTIONS R-C.6)
//
// 🔴 ตัวลงทะเบียนจริงอยู่ที่ `src/lib/platform/minute-jobs.ts` (บล็อก `CRM C2.2 ▸`) แบบเดียวกับงานของ C2.1 —
//    ลงทะเบียน "ตอนโหลดทะเบียน" ไม่ใช่ตอนที่ใครบังเอิญ import โมดูล CRM (มติผู้คุมงานรีวิว C2.2 ข้อ 6):
//    ทั้ง `/api/cron/outbox` และ `scripts/crm-cron.mts` เห็นงานนี้เสมอ ไม่ว่าโพรเซสจะอุ่นหรือเย็น
// 🔴 ไฟล์นี้จึงเหลือหน้าที่เดียว: "import ไฟล์นี้ = ทะเบียนถูกโหลดแล้วแน่นอน" (ตัวรัน `scripts/crm-cron.mts` import ตัวนี้)
//    — ไฟล์เบา ไม่ลากกราฟ CRM ทั้งก้อน
import "@/lib/platform/minute-jobs";

export const SEQUENCES_JOB = "crm.sequences";

// scoring-job.ts — ทางเข้าแบบ import ของงานรายวัน "crm.scoring.decay" (ใบ C2.8 · RESOLUTIONS R-C.6)
//
// 🔴 ตัวลงทะเบียนจริงอยู่ที่ `src/lib/platform/minute-jobs.ts` (บล็อก `CRM C2.8 ▸`) แบบเดียวกับงานของ C2.1/C2.2/C2.5 —
//    ลงทะเบียน "ตอนโหลดทะเบียน" ไม่ใช่ตอนที่ใครบังเอิญ import โมดูล CRM (มติผู้คุมงานรีวิว C2.2 ข้อ 6)
// 🔴 ไฟล์นี้จึงเหลือหน้าที่เดียว: "import ไฟล์นี้ = ทะเบียนถูกโหลดแล้วแน่นอน" (ตัวรัน `scripts/crm-cron.mts` import ตัวนี้)
import "@/lib/platform/minute-jobs";

export const SCORING_JOB = "crm.scoring.decay";

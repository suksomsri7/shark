// job-errors.ts — ข้อความล้มของงานห้องเลขาที่แอปแปลภาษาได้ (17 พ.ย. 2026 · pure ไม่อ่านฐาน)
//   worker เขียนข้อความไทยลง `AiRoomJob.error` · rooms.ts (`roomFailedJobs`) อ่านกลับเป็น `reason` ให้แอปเลือกข้อความ th/en เอง
//   ข้อความอื่น (โควตา · ผู้สั่งพ้นสมาชิก ฯลฯ) = reason "other" แอปแสดงข้อความไทยของเซิร์ฟเวอร์ตรง ๆ
//   🔴 ไฟล์นี้ห้าม import worker/rooms (ทั้งสองฝั่ง import ไฟล์นี้)
export const ROOM_JOB_MAX_ATTEMPTS = 3;
/** ลองครบแล้ว (ล้มชั่วคราวซ้ำ ๆ) */
export const ERR_GAVE_UP = `เลขาทำงานนี้ไม่สำเร็จหลังลอง ${ROOM_JOB_MAX_ATTEMPTS} ครั้ง — ลองสั่งใหม่อีกครั้ง`;
/** ผู้ให้บริการ AI ใช้ไม่ได้ระดับบัญชี (เครดิตหมด/คีย์ผิด) — ไม่มีชื่อผู้ให้บริการ/รหัส HTTP/คำว่าเครดิต */
export const ERR_AI_UNAVAILABLE = "ระบบ AI ยังใช้งานไม่ได้ชั่วคราว — ทีมงานได้รับแจ้งแล้ว ลองใหม่อีกครั้งภายหลัง";

export type RoomFailReason = "ai_unavailable" | "gave_up" | "other";
export function failReasonOf(error: string | null | undefined): RoomFailReason {
  if (error === ERR_AI_UNAVAILABLE) return "ai_unavailable";
  if (error === ERR_GAVE_UP) return "gave_up";
  return "other";
}

// job-gen.ts — "รุ่น" ของงานห้องเลขา (SEC S3a.1-S2 · R-Z33 · pure ไม่อ่านฐาน)
//   ops กดลองใหม่ = ขึ้นรุ่นถัดไป (`attempts` = รุ่น×100) ไม่รีเซ็ตเป็น 0 ⇒ fence (= attempts หลัง claim) ไม่ย้อนซ้ำค่าที่ตัวรันเก่าถืออยู่
//   จำนวนครั้งต่อรุ่น = `attempts % 100` · ลองใหม่ได้ ≤ 9 รุ่น (ไม่มีคอลัมน์ใหม่ — prisma แช่แข็ง)
export const ROOM_JOB_GEN = 100;
export const ROOM_JOB_MAX_GENS = 10;
/** ครั้งที่ในรุ่นปัจจุบัน (0..) */
export const attemptsInGen = (attempts: number): number => attempts % ROOM_JOB_GEN;

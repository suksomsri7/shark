// สถานะฟอร์มของหน้า "ผู้ใช้งานและสิทธิ์" (/app/settings/staff · WO-CW2)
//
// 🔴 ทำไมต้องแยกไฟล์ ไม่เก็บไว้ใน actions.ts:
//    ไฟล์ที่ขึ้นต้นด้วย "use server" **export ได้เฉพาะ async function เท่านั้น**
//    ค่าคงที่อย่าง `staffFormInitial` (เป็น object) ทำให้ `next build` ล้มด้วย
//    `A "use server" file can only export async functions, found object.`
//    ⚠️ `tsc --noEmit` จับไม่ได้ และข้อสอบทั้ง 171 ชุดก็จับไม่ได้ — เห็นตอน build เท่านั้น
//    (บทเรียน 31 ส.ค. 2026 · type ไม่เป็นไรเพราะถูกลบตอนคอมไพล์ แต่ค่าจริงเป็นไร)
export type StaffFormState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

export const staffFormInitial: StaffFormState = { status: "idle" };

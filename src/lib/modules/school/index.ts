// school/index.ts — facade ของโมดูล "คอร์สเรียน" (สร้างในใบ CRM v2 C2.4 · มติผู้คุมงาน C2.4 ข้อ 8)
//
// 🔴 **อ่านอย่างเดียว** — ผิวนี้เปิดเท่าที่ปฏิทิน CRM ต้องใช้จริงวันนี้ ไม่มีทางเขียนอะไรผ่านที่นี่
//    (โค้ดในโมดูลนี้และหน้าจอของมันยัง import `./service` ตรงตามเดิม — facade มีไว้ให้ "คนนอกโมดูล" เท่านั้น)
// 🔴 re-export ล้วน ไม่มีตรรกะ (แบบเดียวกับ `crm/index.ts` · `party/index.ts`) ⇒ ไฟล์นี้ไม่แตะ prisma เอง
// 🔴 ผู้ใช้วันนี้: `crm/activities.ts#calendar` (เส้น crm→school ใน `scripts/fitness.mts` ALLOWED_EDGES พร้อมเหตุผล)
export { appointmentsByParty } from "./service";
export type { PartyAppointmentRow } from "./service";

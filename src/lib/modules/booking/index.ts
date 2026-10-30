// booking/index.ts — facade ของโมดูล "ระบบจองคิว" (สร้างในใบ CRM v2 C2.4 · มติผู้คุมงาน C2.4 ข้อ 8)
//
// 🔴 ส่วนของ CRM (appointmentsByParty) **อ่านอย่างเดียว** · B.11 เพิ่มงานเขียนของจอตั้งค่า (ด่านสิทธิ์อยู่ในฟังก์ชัน)
//    (โค้ดในโมดูลนี้และหน้าจอของมันยัง import `./service` ตรงตามเดิม — facade มีไว้ให้ "คนนอกโมดูล" เท่านั้น)
// 🔴 re-export ล้วน ไม่มีตรรกะ (แบบเดียวกับ `crm/index.ts` · `party/index.ts`) ⇒ ไฟล์นี้ไม่แตะ prisma เอง
// 🔴 ผู้ใช้วันนี้: `crm/activities.ts#calendar` (เส้น crm→booking ใน `scripts/fitness.mts` ALLOWED_EDGES พร้อมเหตุผล)
export { appointmentsByParty } from "./service";
export type { PartyAppointmentRow } from "./service";

// SVC B.11 ▸ จอตั้งค่าจองคิว + สิทธิ์ต่อ action + ความเป็นส่วนตัว (หน้า/action ของโมดูลเองและงานรายชั่วโมงเรียกผ่าน facade) ◂
export { loadBookingSettingsPage, applyBookingTemplate, setStaffService, setServiceBooking, applyBookingRolePreset } from "./settings-model";
export { purgeBookingPersonalData } from "./privacy";
export type { PurgeResult } from "./privacy";
export { BOOKING_ACTIONS, bookingActionKeys, canBookingAction } from "./access";
export { maskPhone, canSeeFullPhone, phoneForViewer } from "./privacy-shared";

// SVC B.9 ▸ แจ้งเตือนลูกค้า + ผูก LINE + รับบัตรคิวจากมือถือ (ผู้ใช้ = `platform/booking-{notify,line-link,remote}.ts` — ชั้น platform
//   เพราะต้องแตะทั้ง booking + chat + notifyCustomer) · re-export ล้วน · ทุกตัวผูก ctx ของร้าน/สาขาเอง ◂
export { checkIn, createWalkIn, quoteWalkInWait } from "./queue-line";
export type { CheckInResult, WalkInResult } from "./queue-line";
export { loadTodayLine } from "./today-line";
export type { TodayLineView, LineJob } from "./today-line";
export { ticketTokenFor, deferTicket } from "./public-line";
export { bookingPhoneKey } from "./service";

// SVC B.7 ▸ ลิงก์จัดการนัด + ลิงก์ตัวตนจาก LINE (B.9 ส่งใบนัด/ตอบเมนู OA ผ่าน facade) ◂
export { manageLinkFor, bookingIdentityToken } from "./online";
// SVC B.10 ▸ จบงาน → บิลจากคิว (บิลพัก POS) + ค่าคอมฯ ตามผู้ให้บริการ — action/หน้า/ตัวรับคิว (composition root) เรียกผ่าน facade ◂
export {
  previewServiceBill, finishJob, ensureServiceBill, amendServiceBill, cancelServiceBill, markPaidWithoutPos, authorizeServiceBillOp, onPosSalePaid, voidPaidServiceBill, isLegacyBookingUnit,
} from "./finish";
export type { ExtraLine, BillLine, ServiceBillPreview, FinishFail, FinishResult, ServiceBillOp } from "./finish";

// SVC B.8 ▸ มัดจำรุ่นแรก (สถานะ · หน้าจ่าย · consumer สลิปอนุมัติ · จอร้าน · ใช้มัดจำในบิลของ B.10) — ด่านสิทธิ์/token อยู่ในฟังก์ชัน ◂
export { depositInfo, loadDepositPay, submitDepositSlip, onDepositSlipApproved, depositQueue, confirmDepositByShop, refundDepositByShop, forfeitDepositByShop, depositForBill } from "./deposit";
export type { DepositState, DepositInfo, DepositPay, SlipSubmitFail, ShopCtx, DepositQueueItem } from "./deposit";

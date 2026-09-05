// Webhooks ขาออก (WO-0062) — รายการเหตุการณ์ที่สมัครฮุคได้ + ป้ายไทย
// รวม event ของ Automation (POS/inventory) + Approval (ผ่าน/ปฏิเสธ) — ป้ายไทยล้วน ไม่โชว์ code
import { AUTOMATION_EVENTS, type AutomationEventDef } from "@/lib/automation/labels";

export const WEBHOOK_EVENTS: AutomationEventDef[] = [
  ...AUTOMATION_EVENTS,
  // ── บัญชี (WO 8.3 · SPEC §9.5 "แอปภายนอก/API") ────────────────────────────
  // 🔴 ทุกตัวต้องมี consumer ใน outbox-consumers.ts ด้วย ไม่งั้น event ค้าง PENDING + ฮุคไม่เคยยิง
  { value: "account.document.approved", label: "เมื่ออนุมัติเอกสารบัญชี" },
  { value: "account.payment.recorded", label: "เมื่อบันทึกรับ/จ่ายเงิน" },
  { value: "account.invoice.paid", label: "เมื่อใบแจ้งหนี้ถูกชำระครบ" },
  { value: "account.period.closed", label: "เมื่อปิดงวดบัญชี" },
  // ── บัญชี ชุดที่ 2 (WO C4 · ledger/ACCOUNT-API-RUN.md §C4) ─────────────────
  //    ยิงจาก service ทุกตัว ⇒ เข้าทางไหนก็ได้เหมือนกัน (ปุ่มบนจอ · REST · สกิล AI)
  { value: "account.document.issued", label: "เมื่อออกเอกสารบัญชี (ได้เลขที่แล้ว)" },
  { value: "account.document.voided", label: "เมื่อยกเลิกเอกสารบัญชี" },
  { value: "account.quotation.responded", label: "เมื่อลูกค้าตอบรับ/ปฏิเสธใบเสนอราคา" },
  { value: "account.payment.voided", label: "เมื่อยกเลิกการรับ/จ่ายเงิน" },
  { value: "account.payment_request.paid", label: "เมื่อลูกค้าจ่ายผ่านลิงก์ขอชำระเงิน" },
  { value: "account.payment_request.expired", label: "เมื่อลิงก์ขอชำระเงินหมดอายุ" },
  { value: "account.contact.created", label: "เมื่อเพิ่มผู้ติดต่อใหม่" },
  { value: "account.contact.updated", label: "เมื่อแก้ไขข้อมูลผู้ติดต่อ" },
  { value: "account.contact.merged", label: "เมื่อรวมผู้ติดต่อซ้ำเข้าด้วยกัน" },
  { value: "account.product.created", label: "เมื่อเพิ่มสินค้า/บริการใหม่" },
  { value: "account.product.updated", label: "เมื่อแก้ไขสินค้า/บริการ" },
  // ── บัญชี ชุดที่ 3 (WO D4 · ledger/ACCOUNT-API-RUN.md §D4) ──────────────────
  { value: "account.cheque.changed", label: "เมื่อสถานะเช็คเปลี่ยน (นำฝาก/เรียกเก็บ/เด้ง/ยกเลิก)" },
  { value: "account.reconcile.confirmed", label: "เมื่อยืนยันกระทบยอดธนาคารของเดือน" },
  { value: "account.period.reopened", label: "เมื่อเปิดงวดบัญชีที่ปิดแล้วกลับมา" },
  { value: "account.asset.depreciated", label: "เมื่อคิดค่าเสื่อมสินทรัพย์ประจำงวด" },
  { value: "account.asset.disposed", label: "เมื่อขาย/ตัดจำหน่ายสินทรัพย์" },
  { value: "account.recurring.ran", label: "เมื่อเอกสารประจำทำงานแล้ว" },
  { value: "approval.request.submitted", label: "เมื่อมีคำขออนุมัติใหม่" },
  { value: "approval.request.approved", label: "เมื่อคำขออนุมัติผ่าน" },
  { value: "approval.request.rejected", label: "เมื่อคำขออนุมัติถูกปฏิเสธ" },
  // ── แชท (WO-C3/C3b) ────────────────────────────────────────────────────────
  // 🔴 ก่อนหน้านี้ไม่มี event ของแชทในรายการนี้เลย ⇒ ร้านที่ต้องการรับเฉพาะ "ทีมตอบแล้ว"
  // (เช่น SiamDive ที่เอาไปยิงแจ้งเตือนหาลูกค้า) เลือกไม่ได้ ต้องปล่อยว่าง = รับทุกเหตุการณ์
  // ซึ่งจะได้ `chat.message.mirrored` ติดมาด้วย → แจ้งเตือนลูกค้าซ้ำ
  { value: "chat.message.received", label: "เมื่อลูกค้าทักเข้ามา (แชท)" },
  { value: "chat.message.sent", label: "เมื่อทีมตอบลูกค้า (แชท)" },
  { value: "chat.conversation.status", label: "เมื่อสถานะห้องแชทเปลี่ยน" },
  // ยิงตอนทีมกดอ่าน **โดยยังไม่ต้องพิมพ์ตอบ** — ปลายทางเอาไปทำติ๊กคู่ ✓✓ แบบ WhatsApp
  // ยิงเฉพาะตอนที่ยังมี unread ค้างอยู่จริง (เปิดห้องซ้ำ ๆ ไม่ยิงซ้ำ)
  { value: "chat.conversation.read", label: "เมื่อทีมเปิดอ่านข้อความของลูกค้า (แชท)" },
  // 🔴 ตัวนี้เกิดตอน "ระบบภายนอกส่งคำตอบของทีมเข้ามาเอง" ผ่าน /api/v1/chat/replies
  // ⇒ ระบบที่เป็นคนส่งเข้ามาเอง **ห้ามสมัครรับตัวนี้** ไม่งั้นมันจะได้ยินเสียงตัวเองแล้วแจ้งซ้ำ
  { value: "chat.message.mirrored", label: "เมื่อคัดลอกคำตอบจากระบบอื่นเข้ามา (อย่าเลือกถ้าคุณเป็นระบบนั้น)" },
];

// event code → ป้ายไทย (สำหรับตารางการส่ง) — ไม่รู้จัก → คืน code เดิม
export const webhookEventLabel = (event: string): string =>
  WEBHOOK_EVENTS.find((e) => e.value === event)?.label ?? event;

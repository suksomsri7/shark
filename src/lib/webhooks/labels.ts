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

// Automation v1 (WO-0026) — ป้ายไทยกลางของ trigger/action (ใช้ทั้ง engine body + UI)
// event ที่รองรับ v1 = outbox event ของ POS (ขายสด/ยกเลิกบิล)

export type AutomationEventDef = { value: string; label: string };

/**
 * K2.9 — event ของ "บอร์ดงาน" ครบ 8 ตัวตามพิมพ์เขียว 13-kanban-v2 §7.2
 *
 * 🔴 แยก export ไว้ต่างหากเพราะ dropdown ของ **ตัวสร้างกฎบอร์ด** (`/kanban/automation`) ต้องเห็นแค่ 8 ตัวนี้
 *    ไม่ใช่ทั้งทะเบียนของร้าน (กฎ POS/คลัง/ธีมกิจการไม่เกี่ยวกับบอร์ดงาน — เลือกไปก็ไม่มีวันวิ่ง)
 *    `automation.ts` ของโมดูลบอร์ดงานใช้ชุดนี้เป็น allowlist ตอนตรวจ input ด้วย (ไม่ใช่แค่ตอนวาดจอ)
 * 🔴 ทุกตัวในลิสต์นี้ **ต้องมี consumer ใน `src/lib/outbox-consumers.ts`** ไม่งั้นคิวตันทั้งระบบเงียบ ๆ
 *    (`reference_outbox_new_event_needs_consumer`) — ตรวจแล้ว ณ K2.9: ครบทั้ง 8
 */
export const KANBAN_AUTOMATION_EVENTS: AutomationEventDef[] = [
  { value: "kanban.card.created", label: "เมื่อมีการ์ดใหม่" },
  { value: "kanban.card.moved", label: "เมื่อการ์ดถูกย้ายคอลัมน์" },
  { value: "kanban.card.assigned", label: "เมื่อมอบหมายงาน" },
  { value: "kanban.card.completed", label: "เมื่องานเสร็จ" },
  { value: "kanban.card.due_soon", label: "เมื่อใกล้ถึงกำหนดส่ง" },
  { value: "kanban.card.overdue", label: "เมื่อเลยกำหนดส่ง" },
  { value: "kanban.checklist.completed", label: "เมื่อเช็คลิสต์ครบทุกข้อ" },
  { value: "kanban.comment.added", label: "เมื่อมีความเห็นใหม่ในการ์ด" },
];

// ตัวเลือก trigger ในฟอร์มสร้างกติกา (dropdown) — ป้ายไทยล้วน ไม่โชว์ event code ให้ user
export const AUTOMATION_EVENTS: AutomationEventDef[] = [
  { value: "pos.sale.paid", label: "เมื่อขายสำเร็จ (POS)" },
  { value: "pos.sale.voided", label: "เมื่อยกเลิกบิล" },
  { value: "inventory.lot.expiring", label: "เมื่อสินค้าใกล้หมดอายุ" },
  // ── บอร์ดงาน (K1.4 → ครบ 8 ตัวใน K2.9 · พิมพ์เขียว 13-kanban-v2 §7.2) ─────
  // 🔴 ประกาศที่ `KANBAN_AUTOMATION_EVENTS` ข้างบนที่เดียว แล้ว spread เข้ามาที่นี่
  //    (รายการนี้ถูก spread ต่อเข้า `WEBHOOK_EVENTS` ⇒ เพิ่มที่เดียวได้ทั้งกฎอัตโนมัติและเว็บฮุคขาออก
  //     — `webhooks/labels.ts` จึงต้อง **ไม่** ประกาศ 8 ตัวนี้ซ้ำ ไม่งั้นหน้าตั้งค่าฮุคมีช่องติ๊กซ้ำ)
  ...KANBAN_AUTOMATION_EVENTS,
  // ── บุคคล/HR (K3.3 · ledger/KANBAN-RUN.md §K3.3) ───────────────────────────
  // ยิงจาก `hr/service.ts#requestLeave` หลังเขียนแถวใบลา
  // 🔴 ต้องมี consumer ใน `outbox-consumers.ts` ด้วย (ตัวนั้นต่อสะพาน "การ์ดหาคนแทน" ของบอร์ดงาน)
  //    ขาดไป = event ค้าง PENDING ตลอดกาล แล้วคิวทั้งระบบตันตามไปด้วย (บทเรียน 30 ส.ค. 2026)
  //    รายการนี้ถูก spread ต่อเข้า `WEBHOOK_EVENTS` ⇒ ประกาศที่นี่ที่เดียวได้ทั้งกฎอัตโนมัติและเว็บฮุค
  { value: "hr.leave.submitted", label: "เมื่อพนักงานยื่นใบลา" },
  // ── ธีมกิจการ (B1 · ledger/BRANDING-RUN.md) ────────────────────────────────
  // ยิงจาก `branding/service.ts#setBranding` ใน tx เดียวกับการบันทึกแถว
  // 🔴 ต้องมี consumer ใน `outbox-consumers.ts` ด้วย (ตัวนั้นล้างแคชธีมของอินสแตนซ์ที่ระบายคิว)
  //    ปลายทางที่สนใจ = แอป/ระบบภายนอกที่แคชโลโก้-สีไว้ในเครื่อง แล้วต้องรู้ว่าต้องดึงใหม่
  { value: "tenant.branding.updated", label: "เมื่อเปลี่ยนตราสินค้า/ธีมของกิจการ" },
  // ── ระบบสมาชิก v2 (M1.4 · พิมพ์เขียว 06-member-v2 §7.1/§7.3) ────────────────
  // 🔴 ต้องมี consumer ใน `outbox-consumers.ts` ทุกตัว ไม่งั้น event ค้าง PENDING แล้วคิวตันทั้งระบบ
  // 🔴 `member.sensitive.viewed` **ไม่อยู่ที่นี่โดยตั้งใจ**: "มีคนเปิดดูข้อมูลอ่อนไหว" ไม่ใช่ทริกเกอร์
  //    ที่ร้านควรเอาไปตั้งกฎอัตโนมัติทำอะไรต่อ (เป็นเรื่องของการตรวจสอบ) — สมัครเว็บฮุคได้อย่างเดียว
  { value: "member.created", label: "เมื่อมีสมาชิกใหม่" },
  { value: "member.updated", label: "เมื่อข้อมูลสมาชิกถูกแก้ไข" },
  { value: "member.merged", label: "เมื่อรวมสมาชิกที่ซ้ำกัน" },
  { value: "member.identity.linked", label: "เมื่อผูกช่องทางติดต่อเข้ากับสมาชิก" },
  // M1.9 (D1 · §7.1/§7.3) — ยิงจาก `member/tiers.ts` ใน tx เดียวกับแถวประวัติระดับ
  //   `member.tier.changed` = เลื่อน/ลด/ตั้งมือ (payload มี from · to · reason)
  //   `member.tier.at_risk` = ยังไม่หลุดระดับ แต่ยอดไม่ถึงเกณฑ์คงระดับแล้ว (payload มี shortfall · reviewAt)
  { value: "member.tier.changed", label: "เมื่อระดับสมาชิกเปลี่ยน" },
  { value: "member.tier.at_risk", label: "เมื่อสมาชิกเสี่ยงหลุดระดับ" },
  // M1.7 (D19 · §7.1) — ยิงจาก `member/privacy.ts#setConsent` ใน tx เดียวกับแถวความยินยอม
  //   payload มี customerId · channel (key จากทะเบียนช่องทางกลาง) · granted (true = ให้ / false = ถอน)
  { value: "member.consent.changed", label: "เมื่อความยินยอมของสมาชิกเปลี่ยน" },
  // M2.1 (D2 · §7.1) — ยิงจาก `point/lots.ts` ใน tx เดียวกับ ledger/ล็อต (earn/burn/expire) และจาก cron
  //   payload มี customerId · points · lotId เสมอ · `point.expiring` มี daysLeft (30/7 ตาม remindDays)
  //   🔴 ทุกตัวมี consumer ใน `outbox-consumers.ts` แล้ว (ขาดไป = คิวตันทั้งระบบเงียบ ๆ)
  //   `point.transferred` ยิงจริงที่ M2.2 (โอนแต้มด้วย OTP) — ลงทะเบียนพร้อมกันเป็นชุดเดียว
  { value: "point.earned", label: "เมื่อสมาชิกได้แต้ม" },
  { value: "point.burned", label: "เมื่อสมาชิกใช้แต้ม" },
  { value: "point.expiring", label: "เมื่อแต้มของสมาชิกใกล้หมดอายุ" },
  { value: "point.expired", label: "เมื่อแต้มของสมาชิกหมดอายุ" },
  { value: "point.transferred", label: "เมื่อสมาชิกโอนแต้มให้กัน" },
  // M2.6 (D3 · §7.1) — ยิงจาก `giftcard/service.ts` ใน tx เดียวกับตัวบัตร/รายการบนบัตร
  //   `giftcard.sold` payload: giftCardId · number · satang · buyerCustomerId · ownerCustomerId · saleId
  //   `giftcard.used` payload: giftCardId · number · satang · saleId · balanceAfter
  //   🔴 ทั้งคู่มี consumer ใน `outbox-consumers.ts` แล้ว (ขาดไป = คิวตันทั้งระบบเงียบ ๆ)
  { value: "giftcard.sold", label: "เมื่อขายบัตรกำนัล" },
  { value: "giftcard.used", label: "เมื่อลูกค้าใช้บัตรกำนัล" },
  // M2.3 (§7.1) — ยิงจาก `stamp/service.ts` ใน tx เดียวกับใบสะสม/รายการตรา และจาก cron (หมดอายุ)
  //   `stamp.added` payload: customerId · cardId · progressId · stamps · cycle · count · eventId
  //   `stamp.completed` payload: + rewardKind · rewardConfig (ครบใบแล้วจ่ายรางวัลอะไร)
  //   `stamp.expired` payload: + stamps ที่หายไปเพราะใบหมดอายุ
  //   🔴 ทั้ง 3 ตัวมี consumer ใน `outbox-consumers.ts` แล้ว (ขาดไป = คิวตันทั้งระบบเงียบ ๆ)
  { value: "stamp.added", label: "เมื่อสมาชิกได้รับตราสะสม" },
  { value: "stamp.completed", label: "เมื่อสมาชิกสะสมตราครบใบ" },
  { value: "stamp.expired", label: "เมื่อใบสะสมตราหมดอายุ" },
  // M2.3 (§9.2) — ยิงจาก `booking/service.ts#setAppointmentStatus` เมื่อนัดเปลี่ยนเป็น "มาแล้ว (DONE)"
  //   payload: appointmentId · unitId · customerId · serviceId — สแตมป์ชนิด "จองที่มาจริง" กินทริกเกอร์นี้
  { value: "booking.completed", label: "เมื่อลูกค้ามาตามนัดจริง" },
  // M1.12 (§7.1 §9.3) — ยิงจาก `member/chat-bridge.ts#linkContact` (ทั้งจับคู่อัตโนมัติและเลือกมือ)
  //   payload มี contactId · partyId · customerId · method (PHONE/EMAIL/CHANNEL_ID/MANUAL)
  { value: "chat.contact.linked", label: "เมื่อผูกห้องแชทเข้ากับสมาชิก" },
];

// event code → ป้ายไทย (สำหรับ body แจ้งเตือน + รายการกติกา) — ไม่รู้จัก → คืน code เดิม
export const eventLabel = (event: string): string =>
  AUTOMATION_EVENTS.find((e) => e.value === event)?.label ?? event;

// action type → ป้ายไทย
export const ACTION_LABEL: Record<string, string> = {
  NOTIFY: "แจ้งเตือนในแอป",
  WEBHOOK: "ส่งเว็บฮุค",
};

export const actionLabel = (t: string): string => ACTION_LABEL[t] ?? t;

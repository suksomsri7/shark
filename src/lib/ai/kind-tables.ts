// kind-tables.ts — ตารางชนิดข้อเสนอ (สิทธิ์ของคนกดยืนยัน · ชุดที่ต้องยืนยัน 2 ชั้น) · **pure ล้วน** (SEC S1.7 · R-S1.7d)
//
// ทำไมแยกจาก proposals.ts: `secretary/kind-class.ts` (ชั้นความเสี่ยง) ต้องใช้ตารางนี้โดยไม่ลากฐานข้อมูล/service ทั้งโมดูลมาด้วย
//   ⇒ ไฟล์นี้ **ห้าม import อะไรเลย** (ไม่มี prisma · db · service · ทะเบียน op) — มีแต่ค่าคงที่ + ฟังก์ชันอ่านตาราง
// ส่วนที่ derive จากทะเบียน op ของโมดูล (บัญชี · บอร์ดงาน · สมาชิก · CRM · POS) อยู่ในไฟล์ที่ import service อยู่แล้ว
//   ⇒ proposals.ts เติมเข้าตารางนี้ด้วย `registerDerivedKinds` ตอนโหลดโมดูล (ครั้งเดียว · ก่อนใครเรียก executeProposal/runKind)
//   ผู้ใช้ฝั่ง pure ที่ไม่ได้โหลด proposals.ts จะเห็นแค่ชุดคงที่ — kind ที่ไม่รู้จักถือว่าเสี่ยงทุกชั้น (fail-closed ที่ kind-class)
// proposals.ts re-export `DESTRUCTIVE_KINDS` · `isKnownKind` · `kindAccessOf` ชื่อเดิม (ผู้เรียกเดิมไม่ต้องแก้)

/**
 * ประเภทข้อเสนอที่เขียนไว้ทีละตัว (โมดูลเดิม 63 tool)
 * บัญชี (WO E1) ไม่อยู่ในนี้ — สร้างจากทะเบียน op อัตโนมัติเป็น `account.<op id>` ดู `./account-ops`
 */
export type StaticProposalKind =
  | "inventory_receive"
  | "hr_decide_leave"
  | "marketing_create_campaign"
  | "member_create"
  | "open_system"
  | "inventory_create_item"
  | "inventory_adjust"
  | "hr_create_employee"
  | "coupon_create"
  | "kanban_create_card"
  | "kanban_create_board"
  | "record_expense"
  // ── Phase B1: ทำแทนโมดูลเงินเดิน (proposal NORMAL ทั้งหมด) ──
  | "pos_create_sale"
  | "pos_draft_po" // POS P3.9 ▸ R5 ◂
  | "booking_create_appointment"
  | "hotel_create_reservation"
  | "queue_issue_ticket"
  | "shop_confirm_order"
  // ── Phase B2 (ชุดปิด): CRM·KB·โรงเรียน·คลินิก·เช่า·สายอนุมัติ·คลังตัดออก (NORMAL ทั้งหมด) ──
  | "crm_create_lead"
  | "kb_create_article"
  | "school_enroll"
  | "school_mark_paid"
  | "clinic_create_patient"
  | "rental_create_booking"
  | "approval_decide"
  | "inventory_consume"
  | "reward_redeem"
  // ── Wave5-B: สั่งงานแทนโมดูลที่เดิม AI ทำแทนไม่ได้ (แต้ม/ตั๋ว/ร้านอาหาร) ──
  | "point_adjust"
  | "ticket_mark_paid"
  // ── agentic-3: ตั้งงานประจำให้ผู้ช่วย AI (NORMAL — ยืนยันชั้นเดียว) ──
  | "ai_schedule_task"
  // ── automation: ตั้งกฎอัตโนมัติแบบแจ้งเตือน (NORMAL — ยืนยันชั้นเดียว) ──
  | "automation_create_rule"
  // ── destructive (ลบ/void/ยกเลิก/ปิดบิล — ต้องยืนยัน 2 ชั้น) ──
  | "void_sale"
  | "cancel_appointment"
  | "cancel_reservation"
  | "kanban_archive_card"
  | "shop_refund_order"
  | "restaurant_close_bill"
  // SEC S1.12 ▸ ส่งข้อความถึงลูกค้าผ่านโมดูลแชท (R-K15) · คืนมัดจำนัดหมาย (เส้นสาธิต 3 · R-K16) ◂
  | "chat.send"
  | "booking_refund_deposit"
  // SEC S3a.1-S2 ▸ R-Z22: ในห้องเลขา คลังความรู้/ลบความจำ = ข้อเสนอ (ไม่เขียนทันที) ◂
  | "kb.save"
  | "memory.forget"
  // SEC S3a.1-S2 ▸ R-Z34: เปิดเคสแจ้งทีมงานจากห้องบริบทลูกค้า = ข้อเสนอ ◂
  | "support.open"
  // HR H4.3 ▸ ร่างตารางกะ · บันทึกข้อสังเกตส่วนตัว (ข้อเสนอของเครื่องมือ HR — ไม่ใช่ DESTRUCTIVE) ◂
  | "hr_draft_roster"
  | "hr_flag_pattern";

// action string ต่อ kind — ต้องตรงกับ assertCan ของปุ่มจริงในแต่ละโมดูล (ดู */actions.ts)
export const STATIC_KIND_ACCESS: Record<StaticProposalKind, { module: string; action: string }> = {
  inventory_receive: { module: "inventory", action: "inventory.movement.receive" },
  hr_decide_leave: { module: "hr", action: "hr.leave.decide" },
  marketing_create_campaign: { module: "marketing", action: "marketing.campaign.create" },
  member_create: { module: "member", action: "member.customer.create" },
  open_system: { module: "system", action: "system.system.create" },
  inventory_create_item: { module: "inventory", action: "inventory.item.create" },
  inventory_adjust: { module: "inventory", action: "inventory.movement.adjust" },
  hr_create_employee: { module: "hr", action: "hr.employee.create" },
  coupon_create: { module: "coupon", action: "coupon.coupon.create" },
  kanban_create_card: { module: "kanban", action: "kanban.card.create" },
  kanban_create_board: { module: "kanban", action: "kanban.board.create" },
  // บันทึกค่าใช้จ่ายเข้าบัญชี → ใช้ action จริงของโมดูลบัญชี (สร้างเอกสาร) = account.doc.create
  record_expense: { module: "account", action: "account.doc.create" },
  // Phase B1 — action string ตรงกับปุ่มจริง (ดู */actions.ts)
  pos_create_sale: { module: "pos", action: "pos.sale.create" },
  pos_draft_po: { module: "inventory", action: "inventory.po.create" }, // POS P3.9 ▸ R5 มติ 8: ร่าง PO (DRAFT) ◂
  booking_create_appointment: { module: "booking", action: "booking.appointment.create" },
  hotel_create_reservation: { module: "hotel", action: "hotel.reservation.create" },
  queue_issue_ticket: { module: "queue", action: "queue.ticket.issue" },
  shop_confirm_order: { module: "shop", action: "shop.order.confirm" },
  // Phase B2 — action string ตรงกับปุ่มจริง (ดู */actions.ts · kb ที่ src/app/app/kb/actions.ts)
  crm_create_lead: { module: "crm", action: "crm.contact.create" },
  kb_create_article: { module: "kb", action: "kb.article.create" },
  school_enroll: { module: "school", action: "school.enrollment.create" },
  school_mark_paid: { module: "school", action: "school.enrollment.pay" },
  clinic_create_patient: { module: "clinic", action: "clinic.patient.create" },
  rental_create_booking: { module: "rental", action: "rental.booking.create" },
  approval_decide: { module: "approval", action: "approval.request.decide" },
  inventory_consume: { module: "inventory", action: "inventory.movement.consume" },
  reward_redeem: { module: "reward", action: "reward.redemption.create" },
  // Wave5-B — action string ตรงกับปุ่มจริง (point forms · ticket/restaurant actions.ts)
  point_adjust: { module: "point", action: "point.adjust.create" },
  ticket_mark_paid: { module: "ticket", action: "ticket.order.markPaid" },
  restaurant_close_bill: { module: "restaurant", action: "restaurant.checkout.create" },
  // agentic-3 — ตั้งงานประจำผู้ช่วย AI (module ai · action เฉพาะ AI schedule)
  ai_schedule_task: { module: "ai", action: "ai.schedule.create" },
  // automation — ตั้งกฎอัตโนมัติ (module automation · action สร้างกฎ)
  automation_create_rule: { module: "automation", action: "automation.rule.create" },
  // destructive — action string ตรงกับปุ่มจริงในแต่ละโมดูล (ดู */actions.ts)
  void_sale: { module: "pos", action: "pos.sale.void" },
  cancel_appointment: { module: "booking", action: "booking.appointment.setStatus" },
  cancel_reservation: { module: "hotel", action: "hotel.reservation.cancel" },
  kanban_archive_card: { module: "kanban", action: "kanban.card.delete" },
  shop_refund_order: { module: "shop", action: "shop.order.refund" },
  // SEC S1.12 ▸ R-K14 คีย์ตอบแชทเดิม (ไม่สร้างคีย์ใหม่) · คืนมัดจำ = คีย์ปุ่มคิวมัดจำของร้าน (booking/access.ts refundDueDepositAction) ◂
  "chat.send": { module: "chat", action: "chat.message.send" },
  booking_refund_deposit: { module: "booking", action: "booking.deposit.refund" },
  // SEC S3a.1-S2 ▸ R-Z22: kb.save = คีย์เดียวกับ kb_create_article (ปุ่มเพิ่มบทความ) · memory.forget = คีย์ใช้เลขา (สิทธิ์ลบจริงตรวจใน forgetMemory ด้วยตัวผู้อนุมัติ) ◂
  "kb.save": { module: "kb", action: "kb.article.create" },
  "memory.forget": { module: "ai", action: "ai.chat.send" },
  "support.open": { module: "ai", action: "ai.chat.send" },
  // HR H4.3 ▸ คีย์ของปุ่มจริง (ตารางกะ/บันทึก = hr.employee.create) · ด่านละเอียด (สาขาของทุกช่อง · canSeeLifecycle) ตรวจซ้ำก่อนจองใน hr/ai.ts ◂
  hr_draft_roster: { module: "hr", action: "hr.employee.create" },
  hr_flag_pattern: { module: "hr", action: "hr.employee.create" },
};

export type KindAccess = { module: string; action: string };

// kind ที่ "ลบข้อมูล/ยกเลิกถาวร" → risk=DESTRUCTIVE (ยืนยัน 2 ชั้นก่อนทำจริง)
// AI Plan (plans.ts) ใช้คำนวณ hasDestructive ระดับแผน (ค่าเดียวกัน ไม่ซ้ำ logic) · ส่วน derive (op ชนิด `danger` ของ 5 ทะเบียน) เติมโดย proposals.ts
export const DESTRUCTIVE_KINDS = new Set<string>([
  "void_sale",
  "cancel_appointment",
  "cancel_reservation",
  "kanban_archive_card",
  "shop_refund_order",
  // ปิดบิลโต๊ะ = สร้างธุรกรรมเงิน + ปิดโต๊ะถาวร → ยืนยัน 2 ชั้น
  "restaurant_close_bill",
]);

/**
 * ตารางสิทธิ์จริงที่ใช้ตอนกดยืนยัน = ชุดคงที่ + ของทะเบียน op ที่ derive จาก `op.action` (เติมโดย proposals.ts)
 * (บัญชีมี 30+ คำสั่ง และ action ของมันเปลี่ยนได้ตามสัญญา REST — พิมพ์ซ้ำที่นี่คือแหล่งที่สองที่จะเพี้ยน)
 */
export const KIND_ACCESS: Record<string, KindAccess> = { ...STATIC_KIND_ACCESS };

/**
 * เติมส่วนที่ derive จากทะเบียน op — เรียกจาก proposals.ts ตอนโหลดโมดูลเท่านั้น
 * ลำดับเดียวกับของเดิม (ชุดคงที่ก่อน · ทะเบียนทับเมื่อชื่อชน) · เรียกซ้ำได้ (ผลเท่าเดิม)
 */
export function registerDerivedKinds(input: { access: Readonly<Record<string, KindAccess>>; destructive: readonly string[] }): void {
  for (const [k, v] of Object.entries(input.access)) KIND_ACCESS[k] = v;
  for (const k of input.destructive) DESTRUCTIVE_KINDS.add(k);
}

/** kind นี้รู้จักจริงไหม (มีใน KIND_ACCESS) */
export function isKnownKind(kind: string): boolean {
  return typeof kind === "string" && Object.prototype.hasOwnProperty.call(KIND_ACCESS, kind);
}

/** คีย์สิทธิ์ที่คนกดยืนยันต้องมี · ไม่รู้จัก = null */
export function kindAccessOf(kind: string): KindAccess | null {
  return isKnownKind(kind) ? KIND_ACCESS[kind]! : null;
}

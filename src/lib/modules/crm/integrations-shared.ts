// integrations-shared.ts — ค่าคงที่/ชนิด/ตัวแปลงบริสุทธิ์ของหน้า "เชื่อมต่อทุกระบบ" (ใบ C3.6 · พิมพ์เขียว §9 · ภาพ 17)
//
// 🔴 ไฟล์บริสุทธิ์: ไม่ import prisma / next / ไฟล์ที่ลากกราฟ server — หน้า 'use client' และข้อสอบอ่านได้ตรง
// 🔴 `INTEGRATION_EVENTS` = ชนิด event ของ outbox ที่ "เกี่ยวกับ CRM" ต่อระบบ (ขาเข้า + ขาออก) ตามตาราง §9 —
//    ทุกชื่อต้องเป็นคีย์ของทะเบียนตัวรับ `src/lib/outbox-consumers.ts` (ห้ามคิดชื่อเอง · ข้อสอบ C3.6-S0.1 เทียบกับทะเบียนจริง)
//    ระบบที่ไม่มี event (ร้านอาหาร · Meeting · KB · สินค้า) = [] (สถานะ "ล่าสุด" ว่าง ไม่ใช่ข้อผิดพลาด)

/** ชนิดระบบปลายทางที่ร้านเลือกได้เมื่อมีหลายระบบ (blueprint §4.5 `settings.crm.targets`) */
export const CRM_TARGET_KINDS = ["member", "account", "kanban", "chat", "inventory"] as const;
export type CrmTargetKind = (typeof CRM_TARGET_KINDS)[number];

/** ชนิด AppSystem ของแต่ละปลายทาง */
export const TARGET_TYPE: Readonly<Record<CrmTargetKind, "MEMBER" | "ACCOUNT" | "KANBAN" | "CHAT" | "INVENTORY">> = Object.freeze({
  member: "MEMBER",
  account: "ACCOUNT",
  kanban: "KANBAN",
  chat: "CHAT",
  inventory: "INVENTORY",
});

/** คีย์ใน `settings.crm.targets` ของแต่ละปลายทาง */
export const TARGET_KEY: Readonly<Record<CrmTargetKind, keyof CrmTargetSettings>> = Object.freeze({
  member: "memberSystemId",
  account: "accountSystemId",
  kanban: "kanbanSystemId",
  chat: "chatSystemId",
  inventory: "inventorySystemId",
});

/** ป้ายไทยของตัวเลือก (ภาพ 17 ซ้ายล่าง) */
export const TARGET_LABEL: Readonly<Record<CrmTargetKind, string>> = Object.freeze({
  member: "สมาชิก (MEMBER)",
  account: "บัญชี (ACCOUNT)",
  kanban: "บอร์ดงาน (KANBAN)",
  chat: "แชท (CHAT)",
  inventory: "สินค้า (INVENTORY)",
});

/** `settings.crm.targets` — null = ยังไม่เลือก (ระบบใช้ลำดับอัตโนมัติ: เชื่อมสาขา → ระบบเดียวของร้าน) */
export type CrmTargetSettings = {
  memberSystemId: string | null;
  accountSystemId: string | null;
  kanbanSystemId: string | null;
  chatSystemId: string | null;
  inventorySystemId: string | null;
};

/** ผลของตัวตัดสินปลายทาง — id ของระบบ หรือ null (= ผู้เรียกใช้พฤติกรรมเดิม) */
export type CrmTargets = Record<CrmTargetKind, string | null>;

/** มาจากไหน: ร้านเลือกเอง · ระบบที่ผูกสาขาเดียวกัน (บัญชี = AccountSystemLink) · ระบบเดียวของร้าน · ไม่มี */
export type CrmTargetVia = "target" | "link" | "only" | null;
export type CrmTargetsDetailed = Record<CrmTargetKind, { id: string | null; via: CrmTargetVia }>;

export type TargetCandidate = { id: string; name: string; active: boolean };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const idOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** ตัวอ่านบริสุทธิ์ของ `settings.crm.targets` (ค่าเพี้ยน = null · ไม่ throw) — ไม่ตรวจว่าระบบยังอยู่ (ตัวตัดสินเป็นคนตรวจ) */
export function crmTargetsOf(raw: unknown): CrmTargetSettings {
  const crm = isObj(raw) && isObj(raw.crm) ? raw.crm : null;
  const t = crm && isObj(crm.targets) ? crm.targets : {};
  return {
    memberSystemId: idOrNull(t.memberSystemId),
    accountSystemId: idOrNull(t.accountSystemId),
    kanbanSystemId: idOrNull(t.kanbanSystemId),
    chatSystemId: idOrNull(t.chatSystemId),
    inventorySystemId: idOrNull(t.inventorySystemId),
  };
}

/** event ของ outbox ที่นับเป็น "การเชื่อมต่อกับ CRM" ต่อระบบ (คีย์ = ครบ 24 รหัสของ SYSTEM_DEFS) */
export const INTEGRATION_EVENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  HOTEL: ["hotel.checked_out"],
  RESTAURANT: [],
  SHOP: ["shop.order.paid"],
  BOOKING: ["booking.completed", "booking.no_show"],
  QUEUE: ["queue.served"],
  TICKET: ["ticket.order.paid"],
  MEMBER: ["member.created", "member.updated", "member.merged", "member.tier.changed", "member.consent.changed", "member.identity.linked", "crm.contact.converted"],
  REWARD: ["reward.redeemed", "reward.fulfilled"],
  COUPON: ["voucher.used", "voucher.issued"],
  POINT: ["point.earned", "point.burned"],
  CHAT: ["chat.message.received", "chat.conversation.status", "chat.contact.linked"],
  MEETING: [],
  ACCOUNT: [
    "account.invoice.paid",
    "account.payment.recorded",
    "account.payment.voided",
    "account.quotation.responded",
    "account.document.issued",
    "account.document.voided",
    "account.contact.merged",
  ],
  KANBAN: ["kanban.card.completed"],
  POS: ["pos.sale.paid", "pos.sale.voided"],
  CRM: ["crm.contact.created", "crm.deal.created", "crm.deal.won", "crm.deal.lost"],
  KB: [],
  HR: ["hr.leave.submitted"],
  INVENTORY: [],
  MARKETING: ["campaign.sent"],
  RENTAL: ["rental.returned"],
  SCHOOL: ["school.enrolled"],
  CLINIC: ["clinic.visit.done"],
  PAGES: ["forms.submission.received"],
});

/** คำอธิบายสั้นบนกล่องแผนผัง (→ เข้า CRM · ← CRM ส่งออก) ตามภาพ 17 */
export const INTEGRATION_HINTS: Readonly<Record<string, { into: string; out: string }>> = Object.freeze({
  HOTEL: { into: "→ เข้าพัก VISIT", out: "" },
  RESTAURANT: { into: "→ บิลจัดเลี้ยง", out: "" },
  BOOKING: { into: "→ นัดสำเร็จ MEETING", out: "← ปฏิทินนัดอย่างเดียว" },
  TICKET: { into: "→ จ่ายแล้ว PURCHASE", out: "← ดีลตั๋วกลุ่ม" },
  MEMBER: { into: "→ ระดับ/แต้ม/wallet", out: "← แปลง lead→สมาชิก" },
  REWARD: { into: "→ แลกรางวัล ไทม์ไลน์", out: "← ของขวัญ B2B" },
  COUPON: { into: "→ ใช้คูปอง ไทม์ไลน์", out: "← ออกจากกฎ CRM" },
  POINT: { into: "→ ได้/หมดอายุ", out: "← ให้แต้มต้อนรับ" },
  CHAT: { into: "→ ข้อความ→lead", out: "← เปิดดีล/ส่ง LINE" },
  QUEUE: { into: "→ คิวเสร็จ VISIT", out: "" },
  CLINIC: { into: "→ ตรวจเสร็จ VISIT", out: "" },
  RENTAL: { into: "→ คืน/เกินกำหนด", out: "" },
  PAGES: { into: "→ ฟอร์ม/ลิงก์ LIFF", out: "← widget ดีล/portal" },
  SCHOOL: { into: "→ ลงทะเบียน/จบคอร์ส", out: "← ดีลขายคอร์ส B2B" },
  MEETING: { into: "(ภายใน)", out: "← แจ้งทีมขาย/แชร์ดีล" },
  ACCOUNT: { into: "→ ชำระ/เอกสารออก", out: "← QT/INV จากดีล" },
  KANBAN: { into: "→ การ์ดเสร็จ", out: "← เปิดการ์ดจากดีล" },
  POS: { into: "→ บิลจ่าย→ปิดดีล", out: "← เลือกดีลตอนขาย" },
  KB: { into: "(อ้างอิงตอบ)", out: "← AI อ้าง KB ร่างอีเมล" },
  HR: { into: "→ พนักงาน/ลา", out: "← คอมมิชชั่น→payroll" },
  INVENTORY: { into: "→ ราคา/ชื่อสินค้า", out: "← สินค้าในดีลเปิด" },
  MARKETING: { into: "→ แคมเปญส่งแล้ว", out: "← ROI ต่อแคมเปญ" },
  SHOP: { into: "→ ออเดอร์จ่ายแล้ว", out: "← ลิงก์ชำระจากดีล" },
  CRM: { into: "", out: "" },
});

/** ตำแหน่งบนแผนผัง (ภาพ 17): บน 9 · ซ้าย 3 · ขวา 2 · ล่าง 9 · CRM กลาง */
export const INTEGRATION_MAP_ORDER: readonly string[] = [
  "HOTEL", "RESTAURANT", "BOOKING", "TICKET", "MEMBER", "REWARD", "COUPON", "POINT", "CHAT",
  "QUEUE", "RENTAL", "SCHOOL",
  "CLINIC", "PAGES",
  "MEETING", "ACCOUNT", "KANBAN", "POS", "KB", "HR", "INVENTORY", "MARKETING", "SHOP",
];

export type IntegrationRow = {
  code: string;
  no: number;
  label: string;
  kind: "business" | "feature";
  enabled: boolean;
  systemIds: string[];
  lastEventAt: string | null;
  lastEventType: string | null;
  events7d: number;
};

/** งานเบื้องหลังของแพลตฟอร์ม (ทะเบียน C0.5) — สถานะ + เวลาเท่านั้น (รายละเอียดข้อผิดพลาดเป็นของทั้งแพลตฟอร์ม ไม่ส่งถึงร้าน) */
export type IntegrationJobRow = {
  name: string;
  everyMinutes: number | null;
  lastRunAt: string | null;
  lastOkAt: string | null;
  failed: boolean;
  reason: string | null;
};

/** ย้อนหลังกี่วันที่นับ "เหตุการณ์ล่าสุด" (ไม่กวาดประวัติทั้งร้าน — มติผู้ตรวจ C3.6 S2) */
export const INTEGRATION_WINDOW_DAYS = 90;
export const JOB_FAILED_MSG = "รอบล่าสุดไม่สำเร็จ — ทีมดูแลระบบได้รับแจ้งแล้ว";

/** `eventsUnavailable` = อ่านสถิติเหตุการณ์ไม่ทัน (เกินเวลา/ล้ม) — lastEventAt/events7d ของทุกแถวเป็นค่าว่าง ไม่ใช่ "ไม่มีเหตุการณ์" */
export type IntegrationStatus = { systems: IntegrationRow[]; jobs: IntegrationJobRow[]; eventsUnavailable: boolean };

/** ข้อผิดพลาดของบริการเชื่อมต่อ (code ตามสัญญา CRM · ข้อความไทยไม่โทษผู้ใช้) */
export class IntegrationsError extends Error {
  readonly code: "VALIDATION" | "NOT_FOUND" | "FORBIDDEN";
  constructor(code: "VALIDATION" | "NOT_FOUND" | "FORBIDDEN", message: string) {
    super(message);
    this.code = code;
    this.name = code === "NOT_FOUND" ? "IntegrationsNotFoundError" : code === "FORBIDDEN" ? "IntegrationsForbiddenError" : "IntegrationsValidationError";
  }
}

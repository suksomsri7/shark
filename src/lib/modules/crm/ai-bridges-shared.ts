// ai-bridges-shared.ts — ค่าคงที่/ชนิดบริสุทธิ์ของ "ผู้ช่วย AI ในหน้า CRM + ห้องทีม" (ใบ C3.4)
// 🔴 ไฟล์บริสุทธิ์: ไม่ import prisma/บริการ — ai-bridges.ts · api/ops · หน้า/actions อ่านจากที่นี่ได้โดยไม่ลากกราฟฐานข้อมูล

/** ปุ่มผู้ช่วย AI ในหน้า (addendum ข้อ 2) — deal 360 (4) · contact 360 (2) · company 360 (2) · หน้าแรก (1) */
export const ASSIST_KINDS = [
  "deal.summary",
  "deal.risk",
  "deal.nextStep",
  "deal.draftEmail",
  "contact.whyHot",
  "contact.closingMessage",
  "company.summary",
  "company.upsell",
  "home.atRisk",
] as const;
export type AssistKind = (typeof ASSIST_KINDS)[number];

export const ASSIST_KIND_LABEL: Record<AssistKind, string> = {
  "deal.summary": "สรุปดีล",
  "deal.risk": "ทำไมดีลนี้เสี่ยง",
  "deal.nextStep": "เสนอขั้นถัดไป",
  "deal.draftEmail": "ร่างอีเมลติดตาม",
  "contact.whyHot": "ทำไมคะแนนร้อน",
  "contact.closingMessage": "ร่างข้อความปิดการขาย",
  "company.summary": "สรุปบริษัท",
  "company.upsell": "โอกาสต่อยอดจากประวัติการซื้อ",
  "home.atRisk": "ดีลไหนเสี่ยงเดือนนี้",
};

export const isAssistKind = (v: unknown): v is AssistKind => typeof v === "string" && (ASSIST_KINDS as readonly string[]).includes(v);

/** เหตุผลที่ดีล "เสี่ยง" (addendum ข้อ 7) */
export const AT_RISK_REASONS = ["STALE", "CLOSE_OVERDUE", "NO_NEXT_ACTIVITY", "PIPELINE_LATE_MONTH"] as const;
export type AtRiskReason = (typeof AT_RISK_REASONS)[number];
export const AT_RISK_REASON_LABEL: Record<AtRiskReason, string> = {
  STALE: "ดีลนิ่งเกินกำหนด",
  CLOSE_OVERDUE: "เลยวันคาดว่าจะปิด",
  NO_NEXT_ACTIVITY: "ไม่มีนัด/งานถัดไป",
  PIPELINE_LATE_MONTH: "ยังอยู่ขั้นต้นแต่ใกล้วันปิด",
};

/** ดีลที่ปิดใน ≤ 7 วันแต่ยังเป็น forecast PIPELINE = เสี่ยง */
export const AT_RISK_LATE_DAYS = 7;

/** ข้อเสนอของหน้าแรก: สร้างงานติดตามหนึ่งใบต่อดีลเสี่ยง (addendum ข้อ 8) */
export const ASSIST_TASKS_KIND = "crm.assist.tasks";
/** ข้อเสนอ "ขั้นถัดไป" ของดีล — kind ของ op `deals.nextStep.set` (ทางเดียวกับ tool crm_set_next_step) */
export const NEXT_STEP_KIND = "crm.deals.nextStep.set";
export const NEXT_STEP_OP_ID = "deals.nextStep.set";
/** อายุข้อเสนอ = 24 ชม. เท่ากับ `ai/proposals` */
export const ASSIST_PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;
/** ธง "กำลังทำ" ที่ค้างเกินนี้ = โพรเซสเดิมตาย ⇒ ปล่อยให้คนถัดไปจองใหม่ */
export const ASSIST_WORKING_STALE_MS = 15 * 60 * 1000;

/** ห้องทีม: ผู้เขียนข้อความของระบบ CRM (MeetingMessage.authorUserId) — หน้าห้องแสดงเป็น "ระบบ CRM" */
export const CRM_TEAMROOM_AUTHOR = "system:crm";
/** ชนิด event ที่เป็น "ธงกันซ้ำ" ของการโพสต์ห้องทีม (consumer no-op + ป้ายใน webhooks/labels.ts) */
export const CRM_TEAMROOM_EVENT = "crm.teamroom.posted";
/** ชื่องานรายวันของสรุปดีลนิ่ง */
export const CRM_TEAMROOM_STALE_JOB = "crm.teamroom.stale";
/** จำนวนดีลสูงสุดที่ลิสต์ในข้อความสรุปหนึ่งข้อความ (ที่เหลือบอกเป็นจำนวน) */
export const CRM_TEAMROOM_DIGEST_MAX = 15;

export type TeamRoom = { meetingSystemId: string; channelId: string };

/** ผลของปุ่ม AI ที่หน้าจอได้รับ (ids ล้วน + ข้อความจากโมเดล) */
export type AtRiskItemView = {
  dealId: string;
  title: string;
  companyName: string | null;
  valueSatang: number;
  ownerUserId: string | null;
  teamId: string | null;
  reasons: AtRiskReason[];
  expectedCloseAt: string | null;
};

export type AssistResultView = {
  kind: AssistKind;
  text: string;
  subject?: string;
  body?: string;
  nextStep?: string;
  items?: AtRiskItemView[];
  proposalId: string | null;
  proposalSummary?: string | null;
  reused?: boolean;
  kbArticleIds?: string[];
};

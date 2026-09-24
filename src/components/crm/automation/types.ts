// types.ts — ชนิดข้อมูลที่หน้า `/crm/settings/automation` (server) ส่งให้ตัวสร้างกฎ CRM (client) — ใบ C2.1
// 🔴 ไฟล์ชนิดล้วน (ไม่ import โมดูล CRM — fitness F2.3: โค้ดนอกโฟลเดอร์ CRM แตะ crm ได้เฉพาะ facade)
//    หน้าแปลงทะเบียนจาก `automation-shared.ts` เป็นรายการ {value,label} ก่อนส่งมา

export type CrmAutoOpt = { id: string; name: string };
export type CrmAutoTriggerOpt = { value: string; label: string; group: string; cron: boolean; params: string[] };
export type CrmAutoAction = { type: string; params?: Record<string, unknown> };
export type CrmAutoCondition = { field: string; op: string; value?: unknown };
export type CrmAutoRuleInput = {
  name: string;
  trigger: { event: string; params?: Record<string, unknown> };
  conditions: { mode: "AND" | "OR"; items: CrmAutoCondition[] };
  actions: CrmAutoAction[];
  pipelineId: string | null;
  enabled: boolean;
};

export type CrmAutoRuleRow = CrmAutoRuleInput & {
  id: string;
  starterKey: string | null;
  runsTotal: number;
  runsThisMonth: number;
  lastRunAt: string | null;
  /** ประโยคไทยสั้น: เหตุการณ์ · การกระทำ */
  summary: string;
};

export type CrmAutoRunRow = { id: string; ruleName: string; status: string; detail: string; at: string };

export type CrmAutomationPageData = {
  systemId: string;
  triggers: CrmAutoTriggerOpt[];
  actions: { value: string; label: string }[];
  conditionFields: { value: string; label: string }[];
  ops: { value: string; label: string; valueless: boolean }[];
  bands: CrmAutoOpt[];
  pipelines: { id: string; name: string; stages: CrmAutoOpt[] }[];
  users: CrmAutoOpt[];
  boards: CrmAutoOpt[];
  objects: { key: string; label: string; dateFields: { key: string; label: string }[] }[];
  contactFields: { key: string; label: string }[];
  rules: CrmAutoRuleRow[];
  runs: CrmAutoRunRow[];
  usage: { used: number; limit: number };
  maxActions: number;
  maxWaitDays: number;
  /** งานตามเวลาของ CRM (ขั้นที่รอ · กฎตามเวลา) ไม่ได้เดินล่าสุด → แสดงคำเตือนภาษาไทย */
  timerStale: boolean;
};

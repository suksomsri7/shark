// types.ts — ชนิดข้อมูลที่หน้า server ส่งให้หน้าจอฝั่ง client ของ "คอมมิชชัน" (ใบ C3.3 · ภาพ 10 ขวา)
// 🔴 ไฟล์นี้ไม่ import อะไรเลย — ด่าน F2.3 ของ fitness ห้าม `src/components/**` ล้วงโมดูล CRM (แม้แต่ไฟล์ `*-shared`)
//    ⇒ ป้ายไทย/สถานะ/ข้อความของกฎ มาจากหน้า server ทาง props ทั้งชุด (หน้าอยู่ใน self-dir ของ CRM)

export type CrmCommissionOption = { value: string; label: string };

export type CrmCommissionTierDraft = { uptoBaht: string; pct: string };

export type CrmCommissionRuleView = {
  id: string;
  name: string;
  basis: string;
  basisLabel: string;
  kind: string;
  kindLabel: string;
  description: string;
  pipelineId: string | null;
  pipelineName: string | null;
  pctBp: number | null;
  fixedSatang: number | null;
  tiers: { uptoSatang: number | null; pctBp: number }[];
  minDealSatang: number | null;
  splitCollaboratorsBp: number;
  payoutDelayDays: number;
  active: boolean;
};

/** ค่าที่หน้าจอส่งให้ server action (หน่วยเป็นสตางค์/basis point แล้ว — หน้าจอแปลงจากบาท/เปอร์เซ็นต์เอง) */
export type CrmCommissionRuleDraft = {
  name: string;
  basis: string;
  kind: string;
  config: { pctBp?: number; fixedSatang?: number; tiers?: { uptoSatang: number | null; pctBp: number }[] };
  pipelineId: string | null;
  minDealSatang: number | null;
  splitCollaboratorsBp: number;
  payoutDelayDays: number;
  active: boolean;
};

export type CrmCommissionRowView = {
  id: string;
  dealId: string;
  dealTitle: string;
  userName: string;
  amountSatang: number;
  status: string;
  statusLabel: string;
  basisLabel: string;
  periodKey: string;
  payroll: string | null;
  payrollLabel: string | null;
  rewon: boolean;
  isReversal: boolean;
};

/** ค่าตั้งของร้าน `settings.crm.commission` (ใบ C3.3 · มติผู้คุมงาน — ตัวเขียนต้องมี) */
export type CrmCommissionSettingsDraft = { approvalRequired: boolean; payrollLink: boolean; basis: string };

export type CrmCommissionSettingsData = {
  systemId: string;
  settings: CrmCommissionSettingsDraft;
  canManage: boolean;
  canApprove: boolean;
  rules: CrmCommissionRuleView[];
  pending: CrmCommissionRowView[];
  pipelines: CrmCommissionOption[];
  bases: CrmCommissionOption[];
  kinds: CrmCommissionOption[];
  waitingLabel: string;
  rewonLabel: string;
  limits: { nameMax: number; reasonMin: number; tiersMax: number; delayDaysMax: number };
};

export type CrmMyCommissionsData = {
  systemId: string;
  period: string;
  status: string;
  periods: CrmCommissionOption[];
  statuses: CrmCommissionOption[];
  rows: CrmCommissionRowView[];
  totals: { pendingSatang: number; approvedSatang: number; paidSatang: number; reversedSatang: number; netSatang: number };
  waitingLabel: string;
  rewonLabel: string;
};

export type CrmCommissionActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

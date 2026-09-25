// types.ts — ชนิดข้อมูลที่หน้า server ส่งให้หน้าจอฝั่ง client ของ "คะแนนผู้ติดต่อ" (ใบ C2.8 · พิมพ์เขียว §5.7 §11.5 · ภาพ 05)
// 🔴 ไฟล์นี้ไม่ import อะไรเลย — ด่าน F2.3 ของ fitness ห้าม `src/components/**` ล้วงโมดูล CRM (แม้แต่ไฟล์ `*-shared`)
//    ⇒ ทะเบียนเหตุการณ์/ป้ายไทย/เพดานค่า มาจากหน้า server ทาง props ทั้งชุด (หน้าอยู่ใน self-dir ของ CRM)

export type CrmScoreOption = { value: string; label: string };

export type CrmScoreRuleView = {
  id: string;
  name: string;
  event: string;
  eventLabel: string;
  points: number;
  expiresDays: number | null;
  maxPerDay: number | null;
  active: boolean;
  isSystem: boolean;
  sortOrder: number;
  /** กฎที่ระบบสร้างให้ (คีย์คงที่) — ร้านแก้ชื่อ/แต้มได้ แต่ป้ายบอกที่มา */
  seedKey: string | null;
};

export type CrmScoreRuleDraft = {
  name: string;
  event: string;
  points: number;
  expiresDays: number | null;
  maxPerDay: number | null;
  active: boolean;
};

export type CrmScoreBandsDraft = { hot: number; warm: number; decayDays: number };

export type CrmScoreRecomputeRow = { contactId: string; from: number; to: number; band: string };

export type CrmScorePageData = {
  systemId: string;
  rules: CrmScoreRuleView[];
  bands: CrmScoreBandsDraft;
  /** เหตุการณ์ที่กฎเลือกได้ (ทะเบียนเดียวกับเอนจิน — ส่งมาเป็น props) */
  events: CrmScoreOption[];
  bandLabels: { hot: string; warm: string; cold: string };
  /** จำนวนกฎเริ่มต้นที่ระบบมีให้ (ปุ่ม "สร้างกฎเริ่มต้น") */
  seedCount: number;
  limits: { nameMax: number; pointsMin: number; pointsMax: number; expiresMax: number; maxPerDayMax: number; reasonMin: number; decayDaysMax: number };
};

export type CrmScoreActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

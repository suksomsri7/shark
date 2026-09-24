// types.ts — ชนิดข้อมูลที่หน้า server ส่งให้หน้าจอฝั่ง client ของ "มอบหมายอัตโนมัติ" (ใบ C2.3 · ภาพ 07 ขวา)
// 🔴 ไฟล์นี้ไม่ import อะไรเลย — ด่าน F2.3 ของ fitness ห้าม `src/components/**` ล้วงโมดูล CRM (แม้แต่ไฟล์ `*-shared`)
//    ⇒ ทะเบียนโหมด/เงื่อนไข/ป้ายภาษาไทย/เพดานค่า มาจากหน้า server ทาง props ทั้งชุด (หน้าอยู่ใน self-dir ของ CRM)

export type CrmAssignOption = { value: string; label: string; hint?: string };
/**
 * พนักงาน 1 คนในตาราง "คิวของพนักงาน" — `load` = คิวที่ **ผู้ดูคนนี้** เปิดระเบียนได้เอง
 * `onLeave` ไม่มีมาให้เมื่อผู้ดูไม่มีสิทธิ์ดูข้อมูลการลาของร้าน (หน้าจอแสดงสถานะจาก "ปิดรับ lead" เท่านั้น)
 */
export type CrmAssignUser = { id: string; name: string; load: number; accepting: boolean; onLeave?: boolean };
export type CrmAssignTeam = { id: string; name: string };

export type CrmAssignConditionItem = { field: string; op: string; value: string | string[] };
export type CrmAssignConditions = { mode: string; items: CrmAssignConditionItem[] };

export type CrmAssignRuleView = {
  id: string;
  name: string;
  mode: string;
  modeLabel: string;
  userIds: string[];
  teamId: string | null;
  maxOpenPerUser: number | null;
  conditions: CrmAssignConditions;
  /** สรุปเงื่อนไขเป็นประโยคไทย (คิดที่ฝั่ง server ด้วยทะเบียนตัวเดียวกับเอนจิน) */
  summary: string;
  sortOrder: number;
  active: boolean;
  /** คนที่จะได้ lead ถัดไปถ้ามาตอนนี้ (ทำนาย — ไม่เลื่อนคิวจริง) */
  nextUserId: string | null;
  candidateIds: string[];
};

/** ร่างกฎที่หน้าจอส่งกลับไปบันทึก (รูปเดียวกับ `RuleInput` ของ assignment.ts) */
export type CrmAssignRuleDraft = {
  name: string;
  mode: string;
  userIds: string[];
  teamId: string | null;
  maxOpenPerUser: number | null;
  conditions: CrmAssignConditions;
  active: boolean;
};

/**
 * หนึ่งบรรทัดของการทดลอง (lead สมมุติ) — ครบทั้ง 6 ชนิดเงื่อนไขที่กฎตั้งได้
 * `address`/`companySize` = ค่าที่พิมพ์/เลือกในหน้าทดลอง (ของจริงอ่านจากที่อยู่ใน Party และจากบริษัทที่ผูกไว้)
 * `partyId`/`companyId` = ระเบียนจริง (ผู้เรียกจากโปรแกรมใช้ได้ · หน้าจอยังไม่มีช่องเลือก)
 */
export type CrmAssignSimRow = {
  sourceKind?: string | null;
  sourceChannel?: string | null;
  locale?: string | null;
  address?: string | null;
  companySize?: string | null;
  partyId?: string | null;
  companyId?: string | null;
  fields?: Record<string, string> | null;
};
export type CrmAssignSimResult = { index: number; ownerUserId: string | null; teamId: string | null; ruleId: string | null; reason: string; reasonText: string };

/** เพดาน/ข้อจำกัดที่เอนจินบังคับ — หน้าจอเตือนก่อนส่งด้วยค่าชุดเดียวกัน (ไม่พิมพ์เลขซ้ำ) */
export type CrmAssignLimits = { nameMax: number; maxOpenMin: number; maxOpenMax: number; deleteReasonMin: number; simMax: number };

export type CrmAssignPageData = {
  systemId: string;
  rules: CrmAssignRuleView[];
  fallbackUserId: string | null;
  users: CrmAssignUser[];
  /** ผู้ดูคนนี้เห็นข้อมูลวันลาของพนักงานไหม — false = ป้าย "คิวถัดไป" และผลการทดลองถูกคิดแบบไม่สนใจวันลา (ต้องบอกบนจอ) */
  timeOffAware: boolean;
  teams: CrmAssignTeam[];
  modes: CrmAssignOption[];
  ops: CrmAssignOption[];
  conditionFields: CrmAssignOption[];
  /** คำนำหน้าของเงื่อนไข "ฟิลด์กำหนดเอง" (ทะเบียนเดียวกับเอนจิน — หน้าจอไม่พิมพ์ค่าซ้ำ) */
  customFieldPrefix: string;
  sources: CrmAssignOption[];
  sizes: CrmAssignOption[];
  languages: CrmAssignOption[];
  limits: CrmAssignLimits;
};

/** ผลของ server action: สำเร็จ (+ ข้อมูลที่ action นั้นคืน) หรือข้อความไทยที่อธิบายว่าทำไมไม่ผ่าน */
export type CrmAssignActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

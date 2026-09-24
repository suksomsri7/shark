// types.ts — ชนิดข้อมูลที่หน้า `/crm/settings/sequences` (server) ส่งให้ตัวแก้ไขลำดับการติดตาม (client) — ใบ C2.2
// 🔴 ไฟล์ชนิดล้วน ไม่ import อะไรเลย (fitness F2.3: โค้ดนอกโฟลเดอร์โมดูลแตะ crm ได้เฉพาะ facade ·
//    และ 'use client' ห้าม import โมดูลที่ถึง prisma) — หน้าแปลงค่าจาก `sequences-shared.ts` เป็นรูปนี้ก่อนส่งมา

export type SeqKind = "EMAIL" | "LINE" | "TASK" | "WAIT" | "SMS";

/** ชนิดของขั้นที่ตัวแก้ไขเสนอให้เลือก (ภาพ 07 ล่าง) */
export const SEQ_KIND_OPTIONS: readonly { value: SeqKind; label: string; hint: string }[] = [
  { value: "EMAIL", label: "ส่งอีเมล", hint: "ส่งถึงอีเมลของผู้ติดต่อ (ถามความยินยอมตอนถึงเวลาส่ง)" },
  { value: "LINE", label: "ส่งข้อความ LINE", hint: "ส่งถึงบัญชี LINE ที่ผูกกับผู้ติดต่อ" },
  { value: "TASK", label: "สร้างงานติดตาม", hint: "สร้างงานให้ผู้ดูแลดีล/ผู้ติดต่อไปทำต่อ" },
  { value: "WAIT", label: "รอ", hint: "รอกี่วันทำการ/กี่ชั่วโมงก่อนทำขั้นถัดไป" },
  { value: "SMS", label: "ส่ง SMS", hint: "ส่งถึงเบอร์มือถือ (ถ้าร้านมีผู้ให้บริการ SMS)" },
];

export const SEQ_TASK_TYPE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "TASK", label: "งานทั่วไป" },
  { value: "CALL", label: "โทร" },
  { value: "MEETING", label: "นัดพบ" },
  { value: "VISIT", label: "เข้าพบ" },
  { value: "NOTE", label: "บันทึก" },
];

/** ขั้นที่กำลังแก้อยู่ในหน้าจอ (ทุกช่องเป็นสตริง/ตัวเลขเสมอ — ไม่มี null ให้ React เถียง) */
export type SeqStepDraft = {
  key: string;
  kind: SeqKind;
  subject: string;
  body: string;
  waitDays: number;
  waitHours: number;
  taskTitle: string;
  taskType: string;
  /** 🔴 พกกลับไปกับการบันทึกเสมอ (NOTE รีวิว C2.2) — ไม่ส่งคืน = ค่าที่ใบ C2.5 (เทมเพลตอีเมล) เขียนไว้หายทุกครั้งที่กดบันทึก */
  templateId: string;
  channel: string;
};

/** ขั้นที่ส่งให้ server action (บริการเป็นผู้ตรวจค่าทั้งหมดอีกชั้น) */
export type SeqStepPayload = {
  kind: SeqKind;
  subject?: string;
  body?: string;
  waitDays?: number;
  waitHours?: number;
  taskTitle?: string;
  taskType?: string;
  templateId?: string | null;
  channel?: string | null;
};

export type SeqCounts = { ACTIVE: number; PAUSED: number; DONE: number; STOPPED: number };

export type SeqListRow = {
  id: string;
  name: string;
  version: number;
  active: boolean;
  stepCount: number;
  steps: { kind: string; label: string }[];
  counts: SeqCounts;
  updatedAt: string;
};

export type SeqHead = {
  id: string;
  name: string;
  description: string;
  version: number;
  active: boolean;
  /** ถูกเก็บแล้วเมื่อไร (null = ยังใช้งาน) — ไม่ null = หน้าจอเป็นโหมดอ่านอย่างเดียว + ปุ่ม "ทำการเก็บต่อ" */
  archivedAt: string | null;
  stopOnReply: boolean;
  stopOnWon: boolean;
  stopOnLost: boolean;
  businessDaysOnly: boolean;
  windowFrom: string;
  windowTo: string;
  useWindow: boolean;
};

export type SeqEnrollmentRow = {
  id: string;
  contactId: string;
  contactName: string;
  /** บริษัทของผู้ติดต่อ (คอลัมน์ "บริษัท" ของภาพ 07 ล่าง) — ไม่มี = null (หน้าจอแสดง "—") */
  companyName: string | null;
  /** "เข้าเมื่อ" แบบสัมพัทธ์ ("วันนี้" · "2 วัน") — คิดด้วยปฏิทินไทยฝั่งเซิร์ฟเวอร์ ส่งมาเป็นข้อความแล้ว */
  enteredAgo: string;
  contactHref: string;
  status: string;
  statusLabel: string;
  stepIndex: number;
  stepCount: number;
  sequenceVersion: number;
  nextAt: string | null;
  currentStep: string | null;
  stoppedReason: string | null;
};

export type SeqStatRow = { index: number; kind: string; label: string; sent: number; skipped: number; failed: number; active: number };

/** การ์ดหนึ่งใบบนแถบภาพรวมของลำดับ (ภาพ 07 ล่าง: ป้าย · หัวข้อ · รายละเอียด · ตัวเลขต่อขั้น) */
export type SeqOverviewCard = {
  index: number;
  kind: string;
  chip: string;
  title: string;
  detail: string;
  counts: { label: string; n: number }[];
};

export type SeqEditorData = {
  systemId: string;
  head: SeqHead;
  steps: SeqStepDraft[];
  /** สถิติของเวอร์ชันที่กำลังดู (ไม่จำเป็นต้องเป็นเวอร์ชันล่าสุด — คนที่เดินอยู่อาจอยู่เวอร์ชันก่อนหน้า) */
  stats: SeqStatRow[];
  statsVersion: number;
  /** แถบภาพรวม "ขั้นทั้งหมดเรียงเป็นแถว" ของเวอร์ชันที่กำลังดู (อ่านอย่างเดียว — ตัวแก้ไขอยู่ด้านล่าง) */
  overview: SeqOverviewCard[];
  /** เวอร์ชันทั้งหมดของลำดับ + จำนวนคนที่ยังเดินอยู่ในแต่ละเวอร์ชัน (ที่มาของข้อความเตือนเมื่อสถิติเป็น 0)
   *  🔴 นับมาจากบริการ `versionCounts` (groupBy ทั้งตาราง) — ห้ามคำนวณจากรายการที่แบ่งหน้า */
  versions: { version: number; live: number; total: number }[];
  enrollments: SeqEnrollmentRow[];
  canManage: boolean;
};

/** ลำดับที่ลงทะเบียนได้ (ปุ่มบนผู้ติดต่อ · ลงทะเบียนกลุ่ม) */
export type SeqOption = { id: string; name: string; stepCount: number };

export type SeqHolidayRow = { date: string; name: string };

export type SeqCalendarData = {
  systemId: string;
  businessDays: number[];
  holidays: SeqHolidayRow[];
  importYears: number[];
};

export const WEEKDAYS: readonly { value: number; label: string }[] = [
  { value: 1, label: "จันทร์" },
  { value: 2, label: "อังคาร" },
  { value: 3, label: "พุธ" },
  { value: 4, label: "พฤหัสบดี" },
  { value: 5, label: "ศุกร์" },
  { value: 6, label: "เสาร์" },
  { value: 0, label: "อาทิตย์" },
];

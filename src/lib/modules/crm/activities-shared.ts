// activities-shared.ts — ค่าคงที่ · ชนิด · ตัวช่วยเวลาไทย ของ "กิจกรรม v2 + ไฟล์แนบ" (CRM v2 · ใบ C1.6 · พิมพ์เขียว §5.5 · มติ C19)
//
// 🔴 ไฟล์บริสุทธิ์ (client-safe): ห้าม import prisma / core db / server-only / ไฟล์บริการ (`./activities` · `./files`)
//    คอมโพเนนต์ 'use client' ของหน้ากิจกรรม · ปฏิทิน · บล็อกโน้ต/ไฟล์ใน 360 ดึงเพดานและป้ายจากที่นี่ที่เดียว
// 🔴 เวลาไทย = UTC+7 คิดจาก epoch ตรง ๆ (ห้าม getDay()/getDate() ของเครื่องที่ TZ ไม่แน่นอน)

// ───────────────────────── เพดาน (AUDIT-CLASS X6) ─────────────────────────

/** เนื้อความของกิจกรรม/โน้ต ≤ 8,000 ตัวอักษร (พิมพ์เขียว §4.1) */
export const ACTIVITY_BODY_MAX = 8000;
/** หัวเรื่องของกิจกรรม */
export const ACTIVITY_TITLE_MAX = 300;
/** เหตุผลของการลบ (X9) */
export const ACTIVITY_REASON_MIN = 5;
export const ACTIVITY_REASON_MAX = 500;
/** ช่องทาง/สถานที่ */
export const ACTIVITY_CHANNEL_MAX = 40;
export const ACTIVITY_LOCATION_MAX = 300;
/** ระยะเวลาสูงสุดของหนึ่งกิจกรรม (7 วัน) */
export const ACTIVITY_DURATION_MAX_SEC = 7 * 86_400;
/** คนที่ @กล่าวถึงได้ต่อโน้ต · ผู้เข้าร่วมต่อการนัด */
export const ACTIVITY_MENTIONS_MAX = 20;
export const ACTIVITY_ATTENDEES_MAX = 50;
/** หน้ารายการ */
export const ACTIVITY_PAGE_DEFAULT = 50;
export const ACTIVITY_PAGE_MAX = 200;
/** ช่วงปฏิทินยาวสุดต่อคำขอ (เดือน 6 สัปดาห์ + ช่วงรายการ 60 วัน) */
export const CALENDAR_MAX_SPAN_DAYS = 93;
export const CALENDAR_MAX_ITEMS = 1000;
/**
 * เพดาน "นัดจากโมดูลจอง/คลินิก/โรงเรียน" ที่ปฏิทินตอบได้ต่อครั้ง (ใบ C2.4 รอบ 2 · ข้อ F5)
 * 🔴 เพดานอยู่ที่ **จำนวนแถวนัดในช่วงเวลา** ไม่ใช่จำนวนลูกค้าที่หยิบมาก่อน: ของเดิมหยิบผู้ติดต่อ 1,000 คนแรก
 *    แล้วถามนัดของคนกลุ่มนั้น ⇒ ร้านที่มีลูกค้ามากกว่านั้นไม่เห็นนัดพรุ่งนี้ของลูกค้าคนที่ 1,001 ขึ้นไป โดยไม่มีสัญญาณอะไรเลย
 * 🔴 ถ้าชนเพดานจริง คำตอบจะบอกออกมาตรง ๆ ผ่าน `appointmentsTruncated: true` (หน้าจอบอกผู้ใช้ได้ว่า "ยังมีต่อ")
 */
export const CALENDAR_MAX_APPOINTMENTS = 3000;

/** ไฟล์แนบ CRM (มติ C19 · ไฟล์ส่วนตัว C0.4) — ≤ 10 MiB · ชื่อ ≤ 200 ตัวอักษร */
export const CRM_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const CRM_FILE_NAME_MAX = 200;
export const CRM_FILE_ENTITY_TYPES = ["CONTACT", "COMPANY", "DEAL", "RECORD"] as const;
export type CrmFileEntityType = (typeof CRM_FILE_ENTITY_TYPES)[number];
/**
 * ชนิดไฟล์ที่แนบกับ CRM ได้ — เป็น **ชุดย่อย** ของตารางอนุญาตของ storage (`ALLOWED_UPLOAD_TYPES`) ลบ SVG ออก
 * AUDIT-CLASS X6: SVG มีสคริปต์ฝังได้ — เปิดผ่านลิงก์ส่วนตัวของร้าน = stored XSS (มติผู้คุมงาน C1.6 ข้อ 6)
 * เสียงบันทึกการโทรเป็นของใบ C2.4 (ไม่รับที่นี่)
 */
export const CRM_FILE_MIME_ALLOWLIST: readonly string[] = Object.freeze([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

/** AUDIT-CLASS X6: อักขระล่องหน/สลับทิศทาง (zero-width · bidi override/isolate · line/paragraph separator · BOM) — ใช้ปลอมชื่อ/นามสกุลไฟล์ */
export const INVISIBLE_CHARS_RE = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029\ufeff]/g;

// ───────────────────────── ชนิด/ป้าย ─────────────────────────

export const ACTIVITY_TYPES = ["CALL", "MEETING", "EMAIL", "LINE", "TASK", "NOTE", "CHAT", "SMS", "WHATSAPP", "VISIT", "WEB", "PORTAL"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  CALL: "โทร",
  MEETING: "นัดพบ/ประชุม",
  EMAIL: "อีเมล",
  LINE: "LINE",
  TASK: "งาน",
  NOTE: "โน้ต",
  CHAT: "แชท",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  VISIT: "เข้าพบ",
  WEB: "เว็บไซต์",
  PORTAL: "พอร์ทัลลูกค้า",
};

/** ชนิดที่ผู้ใช้บันทึกเองจากหน้าจอได้ (ที่เหลือมาจากระบบ — แชท/เว็บ/พอร์ทัล) */
export const ACTIVITY_MANUAL_TYPES: readonly ActivityType[] = ["CALL", "MEETING", "TASK", "NOTE", "EMAIL", "LINE", "VISIT", "SMS", "WHATSAPP"];

/** ผลลัพธ์ตั้งต้นของพิมพ์เขียว §4.5 — ใช้เมื่อ `settings.crm.activityOutcomes[type]` ยังไม่ได้ตั้ง */
export const ACTIVITY_OUTCOMES_DEFAULT: Readonly<Partial<Record<ActivityType, readonly string[]>>> = Object.freeze({
  CALL: ["สนใจ", "รับสาย", "ไม่รับ", "ฝากข้อความ", "เบอร์ผิด", "ไม่สนใจ"],
  MEETING: ["สำเร็จ", "เลื่อน", "ยกเลิก", "ไม่มา"],
});

export const ACTIVITY_DIRECTIONS = ["IN", "OUT"] as const;
export type ActivityDirection = (typeof ACTIVITY_DIRECTIONS)[number];
export const ACTIVITY_DIRECTION_LABEL: Record<ActivityDirection, string> = { IN: "สายเข้า (IN)", OUT: "โทรออก (OUT)" };

export const ACTIVITY_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export type ActivityPriority = (typeof ACTIVITY_PRIORITIES)[number];
export const ACTIVITY_PRIORITY_LABEL: Record<ActivityPriority, string> = { LOW: "ต่ำ", NORMAL: "ปกติ", HIGH: "ด่วน" };

export const ACTIVITY_STATUSES = ["pending", "today", "week", "overdue", "done"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];
export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  pending: "ค้างอยู่",
  today: "วันนี้",
  week: "7 วันข้างหน้า",
  overdue: "เลยกำหนด",
  done: "เสร็จแล้ว",
};
export type ActivityScope = "mine" | "team";

export type ActivityErrorCode = "NOT_FOUND" | "VALIDATION" | "FORBIDDEN" | "CONFIRM_REQUIRED" | "CONFLICT";

/** error ของบริการกิจกรรม/ไฟล์ — `.code` ตามสัญญา · ข้อความภาษาไทยที่ไม่โทษผู้ใช้ และไม่สะท้อนข้อมูลของร้าน/ระบบอื่น */
export class ActivitiesError extends Error {
  readonly code: ActivityErrorCode;
  constructor(code: ActivityErrorCode, message: string) {
    super(message);
    this.name = "ActivitiesError";
    this.code = code;
  }
}

// ───────────────────────── DTO ─────────────────────────

export type ActivityDto = {
  id: string;
  systemId: string;
  type: ActivityType;
  title: string;
  body: string | null;
  direction: ActivityDirection | null;
  channel: string | null;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  customRecordId: string | null;
  startAt: string | null;
  endAt: string | null;
  durationSec: number | null;
  dueAt: string | null;
  remindAt: string | null;
  doneAt: string | null;
  outcome: string | null;
  attendees: { userIds: string[]; contactIds: string[] } | null;
  location: string | null;
  priority: ActivityPriority;
  pinned: boolean;
  /** ผู้ที่ถูก @กล่าวถึงและได้รับแจ้งเตือนจริง (คนที่มองไม่เห็นระเบียนถูกตัดทิ้ง — ไม่สะท้อนกลับ) */
  mentions: string[];
  ownerUserId: string | null;
  completedById: string | null;
  kanbanCardId: string | null;
  source: string;
  createdAt: string;
  // CRM C2.4 ▸ AUDIT-CLASS X10: มีไฟล์เสียงไหม — **ธงเดียว** ไม่มีลิงก์/ที่อยู่ไฟล์ใน DTO
  //   ลิงก์ฟังเสียงออกทาง `calls.getRecording` ที่ตรวจการมองเห็นก่อนออกใบผ่านทุกครั้ง ◂
  hasRecording: boolean;
};

// CRM C2.4 ▸ ปฏิทินรวม "นัดของ Party เดียวกัน" จากโมดูลจอง/คลินิก/โรงเรียน (ภาพ 08 ขวา · มติผู้คุมงาน C2.4 ข้อ 8)
/** ที่มาของนัดที่รวมเข้าปฏิทิน CRM — อ่านอย่างเดียวทั้งสามทาง */
export const CALENDAR_APPOINTMENT_SOURCES = ["BOOKING", "CLINIC", "SCHOOL"] as const;
export type CalendarAppointmentSource = (typeof CALENDAR_APPOINTMENT_SOURCES)[number];
export const CALENDAR_APPOINTMENT_SOURCE_LABEL: Record<CalendarAppointmentSource, string> = {
  BOOKING: "จอง",
  CLINIC: "คลินิก",
  SCHOOL: "โรงเรียน",
};

/**
 * 🔴 สัญญาของ facade `appointmentsByParty` ของโมดูล booking/clinic/school (ประกาศไว้ที่นี่เพราะ CRM เป็นผู้อ่าน —
 *    โมดูลปลายทาง **ห้าม** import ชนิดจาก crm ซึ่งจะเป็นเส้น booking→crm ⇒ แต่ละโมดูลประกาศรูปเดียวกันของตัวเอง)
 * AUDIT-CLASS X8: ไม่มี `customerName` / `customerPhone` / `studentPhone` / `symptom` / `diagnosis` / ค่ารักษา — ห้ามเพิ่ม
 */
export type PartyAppointment = {
  source: CalendarAppointmentSource;
  id: string;
  partyId: string;
  unitId: string;
  startAt: Date;
  endAt: Date | null;
  title: string;
  status: string;
};

/** แถวนัดในปฏิทิน CRM — `readOnly: true` เสมอ (แก้ต้องไปที่โมดูลต้นทาง) */
export type CalendarAppointment = {
  /** คีย์สำหรับ React (`<source>:<id>`) — id ของคนละโมดูลอาจชนกันได้ */
  key: string;
  source: CalendarAppointmentSource;
  id: string;
  startAt: string;
  endAt: string | null;
  title: string;
  status: string;
  contactId: string;
  contactName: string | null;
  readOnly: true;
  href: string | null;
};
// ◂ CRM C2.4

/** แถวในรายการ/ปฏิทิน = DTO + ชื่อสำหรับแสดง (อ่านผ่าน where.ts ของผู้ดู — มองไม่เห็น = null) */
export type ActivityListItem = ActivityDto & {
  contactName: string | null;
  companyName: string | null;
  dealTitle: string | null;
  ownerName: string | null;
};

export type LogActivityResult = ActivityDto & { nextTask: ActivityDto | null; nextTaskId: string | null };

export type ActivityListResult = { items: ActivityListItem[]; nextCursor: string | null };

export type FileLinkDto = {
  id: string;
  name: string;
  size: number;
  mime: string;
  /** ลิงก์ส่วนตัวที่ผูกกับผู้ดูคนนี้และหมดอายุ (`/api/files/<id>?exp=…&sig=…`) — ไม่มี URL CDN ถาวร (X10) */
  url: string;
  createdAt: string;
  uploadedById: string | null;
  entityType: CrmFileEntityType;
  entityId: string;
};

export type MentionOption = { id: string; name: string };

// ───────────────────────── เวลาไทย (+07:00) ─────────────────────────

export const TH_OFFSET_MS = 7 * 3600_000;
export const DAY_MS = 86_400_000;

/** เวลาเริ่มวัน (00:00 ไทย) ของขณะ `ms` — คืน epoch ms */
export function thaiDayStartMs(ms: number): number {
  return Math.floor((ms + TH_OFFSET_MS) / DAY_MS) * DAY_MS - TH_OFFSET_MS;
}

/** วันในสัปดาห์แบบไทย (0 = อาทิตย์) ของขณะ `ms` */
export function thaiWeekday(ms: number): number {
  return new Date(ms + TH_OFFSET_MS).getUTCDay();
}

/** "YYYY-MM-DD" ตามปฏิทินไทยของขณะ `ms` */
export function thaiDayKey(ms: number): string {
  return new Date(ms + TH_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" (ปฏิทินไทย) → epoch ms ของ 00:00 ไทยวันนั้น · อ่านไม่ออก = null */
export function thaiDayFromKey(key: string | null | undefined): number | null {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const ms = Date.parse(`${key}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return null;
  if (new Date(ms).toISOString().slice(0, 10) !== key) return null;
  return ms - TH_OFFSET_MS;
}

const TH_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_MONTHS_LONG = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
export const TH_WEEKDAYS_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** "9 ก.ย." (+ " 2569" เมื่อ withYear) ของขณะ `ms` ตามเวลาไทย */
export function thaiDateLabel(ms: number, withYear = false): string {
  const t = new Date(ms + TH_OFFSET_MS);
  return `${t.getUTCDate()} ${TH_MONTHS_SHORT[t.getUTCMonth()]}${withYear ? ` ${t.getUTCFullYear() + 543}` : ""}`;
}

/** "กันยายน 2569" ของขณะ `ms` */
export function thaiMonthLabel(ms: number): string {
  const t = new Date(ms + TH_OFFSET_MS);
  return `${TH_MONTHS_LONG[t.getUTCMonth()]} ${t.getUTCFullYear() + 543}`;
}

/** "10:12" ตามเวลาไทย */
export function thaiTimeLabel(ms: number): string {
  const t = new Date(ms + TH_OFFSET_MS);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

/** "04:32" จากจำนวนวินาที */
export function durationLabel(sec: number | null | undefined): string {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "04:32" / "4:32" / "272" → วินาที · ว่าง = null · อ่านไม่ออก = NaN */
export function parseDurationText(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return Number.NaN;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** ค่าจากช่อง `<input type="datetime-local">` (ตีความเป็นเวลาไทย) → ISO · ว่าง = null · อ่านไม่ออก = "" */
export function thaiLocalInputToIso(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) return "";
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - TH_OFFSET_MS;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

/** ISO → ค่าของ `<input type="datetime-local">` ตามเวลาไทย */
export function isoToThaiLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + TH_OFFSET_MS).toISOString().slice(0, 16);
}

/** ตรวจชื่อผลลัพธ์ฝั่งหน้าจอ (ตัวจริงตรวจซ้ำในบริการ) */
export function outcomesOf(registry: Partial<Record<string, readonly string[]>> | null | undefined, type: ActivityType): readonly string[] {
  const own = registry?.[type];
  // `[]` ที่ตั้งไว้ชัด = ชนิดนี้ไม่มีผลลัพธ์ให้เลือก (มติผู้คุมงาน C1.6 S8)
  if (Array.isArray(own)) return own;
  return ACTIVITY_OUTCOMES_DEFAULT[type] ?? [];
}

/** ขนาดไฟล์แบบคนอ่าน */
export function fileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// calls-shared.ts — ค่าคงที่ · ชนิด · ข้อความ ของ "บันทึกการโทร + ผู้ช่วย AI ของสาย" (CRM v2 · ใบ C2.4 · พิมพ์เขียว §5.5 · มติ C5)
//
// 🔴 ไฟล์บริสุทธิ์ (client-safe): ห้าม import prisma / core db / server-only / `./db` / `./calls` / next/*
//    โมดัลบันทึกการโทร (`src/components/crm/call/*` — 'use client') ดึงเพดาน/ชนิด/ป้ายจากที่นี่ที่เดียว
// 🔴 ทะเบียนชนิดไฟล์เสียงเขียนไว้ตรง ๆ (ไม่ import `@/lib/storage/service`) เพราะไฟล์นั้นลากกราฟ prisma เข้าหน้าไคลเอนต์
//    ⇒ ข้อสอบ `C2.4-S0.2` เทียบรายการนี้กับ `ALLOWED_UPLOAD_TYPES` ของ storage ให้เป็นชุดย่อยเสมอ (ใครเพิ่มฝั่งใดต้องเพิ่มอีกฝั่ง)

// ───────────────────────── เพดาน + ทะเบียนชนิดไฟล์ (AUDIT-CLASS X6) ─────────────────────────

/**
 * เสียงบันทึกการโทร ≤ 25 MB (มติผู้คุมงาน C2.4 ข้อ 11) — สูงกว่าค่าตั้งต้นของ storage (5 MB) เพราะสายคุย 40 นาที
 * ที่อัดเป็น mp3 128 kbps ≈ 36 MB ยังใหญ่กว่า แต่ไฟล์ opus/m4a ของ MediaRecorder ที่เราแนะนำอยู่ราว 6–12 MB
 */
export const CRM_RECORDING_MAX_BYTES = 25 * 1024 * 1024;

/**
 * ชนิดไฟล์เสียงที่รับได้ — **ชุดย่อยของ `ALLOWED_UPLOAD_TYPES` ของ storage และเป็น `audio/*` ทุกตัว**
 * 🔴 ต้องมีทั้ง `audio/webm` (Chrome/Android) และ `audio/mp4` (Safari/iOS อัด webm ไม่ได้เลย) — ครึ่งหนึ่งของผู้ใช้ไทย
 * 🔴 ห้ามใส่ชนิดที่ไม่ใช่เสียง: เปิดผ่านลิงก์ส่วนตัวของร้าน = stored XSS (เหตุผลเดียวกับที่ไฟล์แนบ CRM ตัด SVG ออก)
 */
export const CRM_RECORDING_MIME_ALLOWLIST: readonly string[] = Object.freeze([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);

/** รูปนามบัตร ≤ 5 MB (มติผู้คุมงาน C2.4 ข้อ 6) — รูปไม่ถูกเก็บ ส่งเข้าโมเดลเป็น `data:` URL แล้วทิ้ง */
export const CRM_CARD_MAX_BYTES = 5 * 1024 * 1024;

/** ชนิดรูปนามบัตรที่รับได้ — ไม่มี SVG (สคริปต์ฝังได้) · HEIC/HEIF = กล้อง iPhone ค่าเริ่มต้น */
export const CRM_CARD_MIME_ALLOWLIST: readonly string[] = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/** เหตุผลของการลบเสียง (X9 · ตัวเลขเดียวกับ ACTIVITY_REASON_MIN ของ C1.6) */
export const CRM_RECORDING_REASON_MIN = 5;
export const CRM_RECORDING_REASON_MAX = 500;

/** อายุเก็บเสียงบันทึกการโทร (วัน) — ค่าเริ่มต้น 2 ปี เท่ากับเนื้ออีเมล (พิมพ์เขียว §C6 · R-A: C2.10 ลงทะเบียนเป็นงานรายวัน) */
export const CRM_RECORDING_DAYS_DEFAULT = 730;

/** ค่าเริ่มต้นของ `settings.crm.ai` (R-E.15 — พิมพ์เขียว §4.5 เคยเขียนว่า true · มติ RESOLUTIONS บังคับ false) */
export const CRM_AI_DEFAULTS: Readonly<{ callTranscribe: boolean; chatSummary: boolean }> = Object.freeze({
  callTranscribe: false,
  chatSummary: false,
});

// ───────────────────────── ชนิดข้อมูล ─────────────────────────

export type CallDirection = "IN" | "OUT";
export const CALL_DIRECTIONS: readonly CallDirection[] = ["IN", "OUT"];
export const CALL_DIRECTION_LABEL: Record<CallDirection, string> = { IN: "สายเข้า", OUT: "โทรออก" };

/** ไฟล์เสียงที่ผู้ใช้เลือก/อัดมา (ยังไม่แตะที่เก็บ) */
export type RecordingUpload = { filename: string; contentType: string; data: Uint8Array };

export type LogCallInput = {
  contactId?: string | null;
  dealId?: string | null;
  companyId?: string | null;
  direction: string;
  /** ผลสาย — ต้องอยู่ในทะเบียนของชนิด CALL (`settings.crm.activityOutcomes.CALL` ?? ค่าตั้งต้น §4.5) */
  outcome: string;
  durationSec?: number | null;
  startAt?: Date | string | number | null;
  title?: string | null;
  body?: string | null;
  nextTask?: { type?: string | null; title?: string | null; dueAt?: Date | string | number | null } | null;
  remindAt?: Date | string | number | null;
  recording?: RecordingUpload | null;
};

/**
 * AUDIT-CLASS X10: ผลของ `getRecording` — ลิงก์ที่ผูกกับผู้ดูคนนี้และหมดอายุ (≤ 15 นาที) เท่านั้น
 * 🔴 ไม่มี `cdnUrl` ไม่มี `path` ไม่มีค่าหมาย `private://` — ห้ามเพิ่มช่องใดที่พาที่อยู่ไฟล์ออกไป
 */
export type RecordingDto = {
  activityId: string;
  name: string;
  size: number;
  mime: string;
  url: string;
  expiresAt: string;
  durationSec: number | null;
};

export type CallAiState = "OFF" | "NO_PROVIDER" | "NO_CREDIT" | "READY";
export type CallAiStatus = { state: CallAiState; message: string };

/** ร่างที่โมเดลอ่านได้จากนามบัตร (ยังไม่เขียนอะไรลงฐาน — ต้องกด "ยอมรับ" ก่อน) */
export type CardDraft = { name: string; phone: string; email: string; company: string; jobTitle: string };

/**
 * ค่าที่การ์ด "ผู้ช่วย AI" ของโมดัลแสดง (มาจาก AiProposal ที่ยังรออยู่)
 * `working: true` = จองไว้แล้วแต่ยังถอดเสียงไม่เสร็จ ⇒ หน้าจอโชว์ข้อความรอ และปุ่ม "บันทึกผลนี้" ยังกดไม่ได้
 */
export type CallAiProposalView = {
  proposalId: string;
  transcript: string;
  aiSummary: string;
  aiNextStep: string;
  working?: boolean;
  message?: string;
};

// ───────────────────────── error ─────────────────────────

/**
 * รหัสความล้มของบริการบันทึกการโทร (สัญญาใบ C2.4)
 * ลำดับการปฏิเสธของ `transcribeCall`: ประตู v2 → การมองเห็น (NOT_FOUND) → คีย์ (FORBIDDEN) → ไม่ใช่สายที่มีเสียง
 * (VALIDATION) → สวิตช์ปิด (AI_DISABLED) → ไม่มีตัวถอดเสียง (NOT_CONFIGURED) → เครดิตหมด (NO_CREDIT)
 */
export type CallErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "CONFIRM_REQUIRED"
  | "NO_CREDIT"
  | "AI_DISABLED"
  | "NOT_CONFIGURED";

/** error ของบริการ — ข้อความไทยที่ไม่โทษผู้ใช้ และไม่สะท้อนข้อมูลของร้าน/ระบบอื่น */
export class CallsError extends Error {
  readonly code: CallErrorCode;
  constructor(code: CallErrorCode, message: string) {
    super(message);
    this.name = "CallsError";
    this.code = code;
  }
}

// ───────────────────────── ข้อความไทย (ใช้ร่วมกันทั้งบริการและหน้าจอ) ─────────────────────────

/** สถานะ "ยังไม่ได้เชื่อมบริการถอดเสียง" — ข้อความสงบ ไม่ใช่ข้อผิดพลาด (R-B: RUN นี้ไม่มีผู้ให้บริการ STT) */
export const CRM_TRANSCRIBER_MISSING_MSG = "ยังไม่ได้เชื่อมบริการถอดเสียง — บันทึกสายและฟังไฟล์เสียงได้ตามปกติ ถอดเสียงอัตโนมัติจะใช้ได้เมื่อเจ้าของร้านเชื่อมบริการแล้ว";

export const CRM_CALL_AI_OFF_MSG = "ยังไม่ได้เปิดผู้ช่วย AI ของสายโทร — เปิดได้ที่ ตั้งค่า CRM → ผู้ช่วย AI";
export const CRM_CALL_AI_READY_MSG = "พร้อมถอดเสียงและสรุปสายนี้ให้ (ผลที่ได้จะขึ้นเป็นข้อเสนอ ให้ตรวจก่อนบันทึก)";
/** ข้อเสนอที่จองไว้แล้วแต่ยังถอดเสียงไม่เสร็จ — กดรับ/ปฏิเสธไม่ได้จนกว่าจะมีเนื้อ (ไม่ใช่ข้อผิดพลาดของผู้ใช้) */
export const CRM_CALL_AI_WORKING_MSG = "กำลังถอดเสียงและสรุปสายนี้อยู่ — รอสักครู่แล้วกดดูผลอีกครั้ง (ยังไม่มีอะไรถูกบันทึกลงกิจกรรม)";

/** ขนาดไฟล์แบบคนอ่าน (MB เต็มหน่วย) — ใช้ในข้อความปฏิเสธให้ตรงกับเพดานจริงเสมอ */
export const mbOf = (bytes: number): number => Math.round(bytes / (1024 * 1024));

// ───────────────────────── AUDIT-CLASS X8: ปิดเบอร์/อีเมลก่อนส่งเข้าโมเดล ─────────────────────────

/**
 * ปิดเบอร์โทรและอีเมลในข้อความก่อนส่งออกไปที่โมเดลภายนอก — **ที่เดียวของ CRM** (ใช้ทั้งสรุปสายและสรุปแชท)
 * 🔴 ไม่ใช่ "ปิดเพื่อความสวย": prompt ไหลออกไปที่ผู้ให้บริการ ⇒ เบอร์/อีเมลของลูกค้าต้องไม่ออกจากเครื่องเรา
 * 🔴 อยู่ในไฟล์บริสุทธิ์เพราะสะพานแชท (`crm-bridges/chat.ts`) ต้องใช้ด้วย และสะพาน import โมดูล CRM ได้แค่ผ่าน
 *    facade กับไฟล์ `*-shared` (ข้อสอบ C1.8-S0.5 ห้าม deep import)
 * ลำดับสำคัญ: อีเมลก่อน (มีตัวเลขปนได้) แล้วจึงชุดตัวเลขที่ยาวพอจะเป็นเบอร์ (≥ 7 ตำแหน่ง รวมตัวคั่น - ( ) . และช่องว่าง)
 */
export function redactContactInfo(text: string): string {
  return String(text ?? "")
    .replace(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "(อีเมลถูกปิดไว้)")
    .replace(/\+?\d[\d\s\-().]{5,}\d/g, "(เบอร์ถูกปิดไว้)");
}

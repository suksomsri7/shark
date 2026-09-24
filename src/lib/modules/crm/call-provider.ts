// call-provider.ts — อะแดปเตอร์ "ระบบโทรศัพท์ของร้าน" (VoIP/PBX) ของ CRM (ใบ C2.4 · พิมพ์เขียว §5.5 `callProvider.webhook`)
//
// 🔴 ใบนี้สร้าง **แค่สัญญา + ตัวตรวจ/ตัวแปลงบริสุทธิ์** — ยัง **ไม่มี route HTTP** (มติผู้คุมงาน C2.4 ข้อ 10)
//    เหตุผล: ปลายทางสาธารณะเปิดงาน X7 ทั้งชุด (rate limit · HMAC ต่อผู้ให้บริการ · replay window) โดยที่ไม่มีผู้ให้บริการจริง
//    ให้ทดสอบเลย ⇒ เขียนไปก็ทดสอบไม่ได้จริงและกลายเป็นผิวโจมตีที่ไม่มีใครเฝ้า · ใบที่เชื่อมผู้ให้บริการจริงจะเพิ่ม route เอง
// 🔴 AUDIT-CLASS X8: ตัวแปลง (`callWebhookToActivityInput`) **ห้ามคัดลอก `from`/`to`/`recordingUrl`** ลงหัวเรื่องหรือโน้ต
//    (เบอร์ปลายทางคือข้อมูลส่วนบุคคล และ URL เสียงของผู้ให้บริการคือลิงก์ถาวรที่เราไม่ได้ควบคุมอายุ)
// 🔴 ไฟล์บริสุทธิ์: ไม่มี prisma / next — `ACTIVITY_OUTCOMES_DEFAULT` มาจาก `./activities-shared` (บริสุทธิ์เหมือนกัน)

import { ACTIVITY_OUTCOMES_DEFAULT } from "./activities-shared";
import type { CallDirection } from "./calls-shared";

export const CALL_WEBHOOK_STATUSES = ["ANSWERED", "MISSED", "BUSY", "FAILED"] as const;
export type CallWebhookStatus = (typeof CALL_WEBHOOK_STATUSES)[number];

/** รูปเหตุการณ์ "สายจบแล้ว" ที่เป็นกลางต่อผู้ให้บริการ — อะแดปเตอร์ของแต่ละเจ้าแปลงของตัวเองมาเป็นรูปนี้ */
export type CallWebhookEvent = {
  provider: string;
  providerCallId: string;
  direction: CallDirection;
  /** เบอร์ต้นทาง/ปลายทางตามที่ผู้ให้บริการส่งมา — **ใช้จับคู่ผู้ติดต่อเท่านั้น ห้ามไหลลงหัวเรื่อง/โน้ต/ป้าย (X8)** */
  from: string;
  to: string;
  /** ISO 8601 เท่านั้น */
  startedAt: string;
  endedAt?: string | null;
  durationSec?: number | null;
  status: CallWebhookStatus;
  /** ลิงก์เสียงของผู้ให้บริการ — เก็บไว้ให้ใบที่เชื่อมจริงดึงไฟล์มาเข้าทางส่วนตัวของเราเอง (ห้ามเก็บลงฐาน/DTO) */
  recordingUrl?: string | null;
};

export interface CrmCallProvider {
  key: string;
  /** แปลง webhook ดิบของผู้ให้บริการเป็นรูปกลาง — อ่านไม่ออก = `null` (ห้าม throw: ปลายทางต้องตอบ 200 เสมอ) */
  parseWebhook(input: { headers: Record<string, string>; body: unknown }): CallWebhookEvent | null;
  /** click-to-call ฝั่งผู้ให้บริการ (ยังไม่มีใครทำ — ประกาศไว้ให้สัญญาครบ) */
  placeCall?(input: { tenantId: string; to: string; fromUserId: string | null }): Promise<{ providerCallId: string } | null>;
}

// ───────────────────────── ตัวตรวจบริสุทธิ์ ─────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
/** ISO 8601 แบบมีวันและเวลา (ยอมรับ Z หรือ ±hh:mm) — "เมื่อวาน" / "2026-13-40" / ตัวเลข = อ่านไม่ออก */
const ISO_RE = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?([Zz]|[+-]\d{2}:\d{2})$/;
const isoAt = (v: unknown): string | null => {
  const s = str(v);
  if (!s || !ISO_RE.test(s)) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  const y = new Date(ms).getUTCFullYear();
  return y >= 2000 && y <= 2100 ? new Date(ms).toISOString() : null;
};

/**
 * ตัวตรวจ webhook แบบกลาง (บริสุทธิ์ · **ไม่เคย throw**) — ขาด id / ทิศทางไม่รู้จัก / วันเวลาไม่ใช่ ISO /
 * ระยะเวลาติดลบ / ไม่ใช่ออบเจ็กต์ ⇒ `null`
 */
export function parseCallWebhook(body: unknown): CallWebhookEvent | null {
  try {
    if (!isObj(body)) return null;
    const providerCallId = str(body.providerCallId);
    if (!providerCallId) return null;
    const dir = String(body.direction ?? "").trim().toUpperCase();
    if (dir !== "IN" && dir !== "OUT") return null;
    const startedAt = isoAt(body.startedAt);
    if (!startedAt) return null;
    const status = String(body.status ?? "").trim().toUpperCase();
    if (!(CALL_WEBHOOK_STATUSES as readonly string[]).includes(status)) return null;
    const durRaw = body.durationSec;
    let durationSec: number | null = null;
    if (durRaw !== undefined && durRaw !== null && durRaw !== "") {
      if (typeof durRaw !== "number" || !Number.isFinite(durRaw) || durRaw < 0) return null;
      durationSec = Math.floor(durRaw);
    }
    const endedAt = body.endedAt === undefined || body.endedAt === null || body.endedAt === "" ? null : isoAt(body.endedAt);
    if (body.endedAt !== undefined && body.endedAt !== null && body.endedAt !== "" && !endedAt) return null;
    return {
      provider: str(body.provider) ?? "unknown",
      providerCallId,
      direction: dir as CallDirection,
      from: str(body.from) ?? "",
      to: str(body.to) ?? "",
      startedAt,
      endedAt,
      durationSec,
      status: status as CallWebhookStatus,
      recordingUrl: str(body.recordingUrl),
    };
  } catch {
    return null;
  }
}

/** ผลสายของแต่ละสถานะ — ทุกค่าต้องอยู่ในทะเบียนผลลัพธ์ตั้งต้นของชนิด CALL (§4.5) */
const OUTCOME_OF: Record<CallWebhookStatus, string> = {
  ANSWERED: "รับสาย",
  MISSED: "ไม่รับ",
  BUSY: "ไม่รับ",
  FAILED: "ไม่รับ",
};
const CALL_OUTCOMES: readonly string[] = ACTIVITY_OUTCOMES_DEFAULT.CALL ?? ["รับสาย", "ไม่รับ"];

/** หัวเรื่องของกิจกรรมที่เกิดจากระบบโทรศัพท์ — ภาษาไทย **ไม่มีเบอร์โทร ไม่มีลิงก์เสียง** (X8) */
const TITLE_OF: Record<CallWebhookStatus, Record<CallDirection, string>> = {
  ANSWERED: { IN: "สายเข้า — คุยแล้ว", OUT: "โทรออก — คุยแล้ว" },
  MISSED: { IN: "สายเข้าที่ไม่ได้รับ", OUT: "โทรออก — ไม่มีผู้รับ" },
  BUSY: { IN: "สายเข้า — สายไม่ว่าง", OUT: "โทรออก — สายไม่ว่าง" },
  FAILED: { IN: "สายเข้า — ต่อไม่สำเร็จ", OUT: "โทรออก — ต่อไม่สำเร็จ" },
};

export type CallWebhookActivityInput = {
  type: "CALL";
  direction: CallDirection;
  startAt: string;
  endAt: string | null;
  durationSec: number | null;
  outcome: string;
  title: string;
  channel: string;
  /** กันซ้ำต่อสายของผู้ให้บริการ (ใบที่เชื่อมจริงใช้เป็น `CrmActivity.sourceRef`) — id ล้วน ไม่ใช่เบอร์ */
  sourceRef: string;
};

/**
 * แปลงเหตุการณ์กลางเป็น "ข้อมูลของกิจกรรมที่จะบันทึก" — บริสุทธิ์ · ไม่เคย throw
 * 🔴 ไม่คัดลอก `from`/`to`/`recordingUrl` ลง title/body/channel เลยแม้แต่ช่องเดียว (X8 — ข้อสอบ S6.2 สแกนทั้งก้อน)
 */
export function callWebhookToActivityInput(evt: CallWebhookEvent): CallWebhookActivityInput {
  const status: CallWebhookStatus = (CALL_WEBHOOK_STATUSES as readonly string[]).includes(evt?.status) ? evt.status : "FAILED";
  const direction: CallDirection = evt?.direction === "IN" ? "IN" : "OUT";
  const outcome = OUTCOME_OF[status];
  return {
    type: "CALL",
    direction,
    startAt: isoAt(evt?.startedAt) ?? new Date().toISOString(),
    endAt: isoAt(evt?.endedAt) ?? null,
    durationSec: typeof evt?.durationSec === "number" && Number.isFinite(evt.durationSec) && evt.durationSec >= 0 ? Math.floor(evt.durationSec) : null,
    outcome: CALL_OUTCOMES.includes(outcome) ? outcome : (CALL_OUTCOMES[0] as string),
    title: TITLE_OF[status][direction],
    channel: "ระบบโทรศัพท์",
    sourceRef: typeof evt?.providerCallId === "string" ? evt.providerCallId.slice(0, 120) : "",
  };
}

// ───────────────────────── ทะเบียน (ว่างโดยเจตนา) ─────────────────────────

const REGISTRY_KEY = Symbol.for("shark.crm.call-provider");
type Holder = Record<symbol, CrmCallProvider | null | undefined>;
const holder = globalThis as unknown as Holder;

export function registerCrmCallProvider(p: CrmCallProvider | null): void {
  holder[REGISTRY_KEY] = p;
}

/**
 * ผู้ให้บริการโทรศัพท์ของร้านนี้ — ค่าเริ่มต้น `null` (ยังไม่มีเจ้าไหนเชื่อม)
 * รับ ctx ไว้แล้วเพราะใบที่เชื่อมจริงจะเลือกตามการตั้งค่าของร้าน (วันนี้ยังไม่อ่านอะไร)
 */
export function getCrmCallProvider(_ctx: { tenantId: string; systemId: string }): CrmCallProvider | null {
  void _ctx;
  return holder[REGISTRY_KEY] ?? null;
}

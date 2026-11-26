// ─────────────────────────────────────────────────────────────
// trips/notify-core.ts — ตัวช่วยบริสุทธิ์ของข้อความถึงลูกค้าทริป · RUN TRIPS T1.8a (ใบสั่ง ledger/trips-briefs/T1.8.md §4.2–§4.5 §4.7 §4.10)
//   ชนิด a · กุญแจกันซ้ำ (ไม่มีตัวเลขเลย · R2) · หน้าต่างเตือนวันก่อนเดินทาง (เขตเวลาหน่วย · 17:00) · ตาราง "ส่งได้ไหม" (§4.3)
//   ตัวแปร th/en (ไม่มีชื่อ/เบอร์/อีเมล) · ด่านแม่แบบ (R9) · ตัวแสดงตัวอย่าง
// 🔴 pure: ไม่แตะฐาน · ไม่อ่านเวลาเครื่อง (ผู้เรียกส่ง now) · ไม่ใช่ T1.8b (ชนิดอื่นนอก a = ไม่ส่ง)
// ─────────────────────────────────────────────────────────────
import { findForbiddenTerms } from "@/lib/core/settings/legal/th-rental-2568";
import { getDef } from "@/lib/core/settings/registry";
import { renderTemplate } from "@/lib/core/settings/template";
import type { SettingDef } from "@/lib/core/settings/types";
import { addDaysYmd, localToUtc, utcToLocal, weekdayOfYmd } from "./departures-core";
import { isYmd } from "./json-schemas";
import { localize, type I18nText } from "./products-core";

export const TRIPS_MSG_KINDS_A = ["confirmation", "reminder1Day", "paymentDue"] as const;
export type TripsMsgKindA = (typeof TRIPS_MSG_KINDS_A)[number];
export const isTripsMsgKindA = (k: unknown): k is TripsMsgKindA => typeof k === "string" && (TRIPS_MSG_KINDS_A as readonly string[]).includes(k);
/** สถานะที่ตัดสินก่อนถึงประตู (ไม่เขียนแถว log) */
export type TripsPreGateStatus = "DISABLED" | "BAD_STATE" | "NO_RECIPIENT" | "AGENCY_RULE" | "HELD" | "NOT_FOUND";
/** ช่องทางที่พนักงานเลือก/สร้าง Party เอง ⇒ ใช้ทาง ข (Party → LINE) ได้ (R1) · ช่องทางอื่นทั้งหมด = ทาง ก (รหัสผูก) เท่านั้น (R1 · D-2) */
export const TRIPS_STAFF_CHANNELS: readonly string[] = ["COUNTER", "POS"];
/** ข้อความยืนยันที่ลูกค้าเพิ่งจอง ≤ 30 นาที ข้ามเวลาเงียบได้ (OQ94) */
export const CONFIRM_BYPASS_QUIET_MS = 30 * 60_000;
/** เวลาเตือนวันก่อนเดินทาง (เวลาหน่วย · ค่าคงที่ C-5) */
export const REMINDER_AT_MIN = 17 * 60;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ID_RE = /^[a-z0-9_-]{1,64}$/;
const LETTERS = "ABCDEFGHIJ";

/** id ⇒ ตัวอักษรล้วน (0–9 → A–J · id ของ trips/outbox เป็นตัวพิมพ์เล็ก ⇒ แปลงกลับได้ไม่ชน) · อักขระนอก [a-z0-9_-] ⇒ null */
export function keyId(id: string): string | null {
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  return id.replace(/[0-9]/g, (d) => LETTERS[Number(d)]);
}

export type TripsMsgKeyInput = { bookingId: string; departureId?: string | null; travelDate?: string | null; dueId?: string | null; eventId?: string | null };
/** กุญแจกันซ้ำ (§4.5) — ขาดส่วนที่ชนิดต้องใช้/ id ผิดรูป ⇒ null */
export function tripsMsgKey(kind: string, p: TripsMsgKeyInput): string | null {
  const b = keyId(p?.bookingId);
  if (!b) return null;
  let key: string | null = null;
  if (kind === "confirmation") key = `trips:${b}:confirmation`;
  else if (kind === "reminder1Day") {
    const dep = keyId(String(p.departureId ?? ""));
    const ymd = typeof p.travelDate === "string" && isYmd(p.travelDate) ? keyId(p.travelDate) : null;
    key = dep && ymd ? `trips:${b}:reminder1Day:${dep}:${ymd}` : null;
  } else if (kind === "paymentDue") {
    const due = keyId(String(p.dueId ?? "")), evt = keyId(String(p.eventId ?? ""));
    key = due && evt ? `trips:${b}:paymentDue:${due}:${evt}` : null;
  }
  return key && key.length <= 200 ? key : null;
}

/** หน้าต่างเตือนของวันเดินทาง (เวลาหน่วย): [วันก่อน 17:00, เที่ยงคืนเข้าวันเดินทาง) */
export function reminderWindow(localDateYmd: string, tz: string): { from: Date; to: Date } {
  return { from: localToUtc(tz, addDaysYmd(localDateYmd, -1), REMINDER_AT_MIN), to: localToUtc(tz, localDateYmd, 0) };
}

// ─────────────────── ตาราง "ส่งได้ไหม" ก่อน claim (§4.3) ───────────────────
const STATUS_OK: Record<TripsMsgKindA, readonly string[]> = {
  confirmation: ["CONFIRMED", "PART_PAID", "PAID"],
  reminder1Day: ["CONFIRMED", "PART_PAID", "PAID"],
  paymentDue: ["CONFIRMED", "PART_PAID"],
};
const CHANNEL_NO: Record<TripsMsgKindA, readonly string[]> = { confirmation: ["OTA", "IMPORT"], reminder1Day: ["OTA"], paymentDue: ["OTA", "IMPORT"] };
const AGENCY_OK: Record<TripsMsgKindA, readonly string[]> = { confirmation: ["SHOP_FULL"], reminder1Day: ["SHOP_FULL", "SHOP_OPS_ONLY"], paymentDue: ["SHOP_FULL"] };

export type TripsMsgFacts = {
  status: string; channel: string; depCancelled: boolean; erased: boolean; openRefund: boolean; createdAt: Date;
  agentAccountId: string | null; agencyWho: string | null; collectMode: string; currency: string;
  /** reminder1Day: หน้าต่างของกุญแจ */ window?: { from: Date; to: Date } | null;
  /** paymentDue: งวดสด (null = ไม่พบ) */ due?: { status: string; outstandingSatang: number; dueAt: Date } | null;
};
const DUE_OPEN = ["OPEN", "PARTLY_PAID"];

/** ผลก่อน claim — null = ส่งได้ · ตัวกั้นชั่วคราว (คำขอคืนเงินเปิด) = HELD (รอบหน้าตรวจใหม่ · R4) */
export function msgEligibility(kind: TripsMsgKindA, f: TripsMsgFacts, now: Date): TripsPreGateStatus | null {
  if (!STATUS_OK[kind].includes(f.status) || f.depCancelled || f.erased || CHANNEL_NO[kind].includes(f.channel)) return "BAD_STATE";
  if (f.agentAccountId && !AGENCY_OK[kind].includes(f.agencyWho ?? "")) return "AGENCY_RULE";
  if (kind === "paymentDue" && f.collectMode !== "SHOP") return "AGENCY_RULE";
  if (kind === "reminder1Day") {
    const w = f.window;
    if (!w || now.getTime() < w.from.getTime() || now.getTime() >= w.to.getTime() || f.createdAt.getTime() >= w.from.getTime()) return "BAD_STATE";
  }
  if (kind === "paymentDue") {
    const d = f.due;
    if (f.currency !== "THB" || !d || !DUE_OPEN.includes(d.status) || d.outstandingSatang <= 0 || now.getTime() >= d.dueAt.getTime()) return "BAD_STATE";
  }
  if (kind !== "confirmation" && f.openRefund) return "HELD";
  return null;
}

// ─────────────────── ตัวแปร th/en (§4.2 · ไม่มีข้อมูลบุคคล) ───────────────────
const WD_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MO_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");
/** "อ. 2 มี.ค. 2570" / "Tue 2 Mar 2027" */
export function tripsDateText(ymd: string, locale: "th" | "en"): string {
  if (!isYmd(ymd)) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = weekdayOfYmd(ymd);
  return locale === "en" ? `${WD_EN[wd]} ${d} ${MO_EN[m - 1]} ${y}` : `${WD_TH[wd]} ${d} ${MO_TH[m - 1]} ${y + 543}`;
}
/** วันเวลาในเขตเวลาหน่วย "อ. 2 มี.ค. 2570 20:00" */
export function tripsDateTimeText(at: Date, tz: string, locale: "th" | "en"): string {
  const l = utcToLocal(tz, at);
  return `${tripsDateText(l.ymd, locale)} ${pad2(Math.floor(l.minutes / 60))}:${pad2(l.minutes % 60)}`;
}
/** สตางค์ ⇒ "1,234.00 บาท" / "THB 1,234.00" (THB เท่านั้น · R3) */
export function tripsMoneyText(satang: number, locale: "th" | "en"): string {
  const s = Math.max(0, Math.round(satang));
  const baht = `${Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${pad2(s % 100)}`;
  return locale === "en" ? `THB ${baht}` : `${baht} บาท`;
}
const PICKUP_TBD = { th: "ร้านจะแจ้งเวลารับ", en: "The shop will confirm the pick-up time" };
const MEET_TBD = { th: "ร้านจะแจ้งจุดนัด", en: "The shop will confirm the meeting point" };

export type TripsVarFacts = {
  shopName: string; code: string; productTitle: unknown; meetingPoint: unknown; travelDate: string; tz: string; link: string;
  pickup?: { time: string; place: string } | null; outstandingSatang?: number | null; dueAt?: Date | null;
};
/** ตัวแปร 9 ตัวของ T70 ในภาษาเดียว — en: ลิงก์มี ?lang=en · ค่าไม่ถูกแทนซ้ำ (renderTemplate แทนรอบเดียว) */
export function tripsMsgVars(f: TripsVarFacts, locale: "th" | "en"): Record<string, string> {
  const title = localize(isRec(f.productTitle) ? (f.productTitle as I18nText) : null, locale).text ?? "";
  const mp = isRec(f.meetingPoint) && isRec(f.meetingPoint.text) ? localize(f.meetingPoint.text as I18nText, locale).text : null;
  const link = f.link ? (locale === "en" ? `${f.link}${f.link.includes("?") ? "&" : "?"}lang=en` : f.link) : "";
  return {
    ร้าน: f.shopName,
    สินค้า: title,
    วันเดินทาง: tripsDateText(f.travelDate, locale),
    เวลารับ: f.pickup?.time || PICKUP_TBD[locale],
    จุดนัด: f.pickup?.place || mp || MEET_TBD[locale],
    ยอดค้าง: typeof f.outstandingSatang === "number" ? tripsMoneyText(f.outstandingSatang, locale) : "",
    ครบกำหนด: f.dueAt ? tripsDateTimeText(f.dueAt, f.tz, locale) : "",
    ลิงก์: link,
    รหัสจอง: f.code,
  };
}
/** ตัวแปรที่ข้อความใช้ (th + en) — ตัดสินว่าต้องอ่านจุดรับไหม */
export const templateUses = (value: unknown, name: string): boolean => textsOf(value).some((t) => t.includes(`{${name}}`));

// ─────────────────── ด่านแม่แบบ (§4.7 · R9) ───────────────────
export type TripsTplIssue = { code: "FORBIDDEN_TERM" | "LINK_REQUIRED" | "TOO_LONG" | "THAI_IN_EN"; term?: string; locale?: "th" | "en" };
const FORBIDDEN = ["อัตโนมัติ", "automatic", "การันตี", "รับประกัน", "guarantee", "คืนเงินภายใน", "refund within"];
/** "ทันที"/"immediately" ห้ามเฉพาะในวลีคืนเงิน/ยืนยัน (R9) */
const NOW_PHRASE: readonly [RegExp, string][] = [
  [/(คืนเงิน|ยืนยัน)\S{0,12}ทันที|ทันที\S{0,6}(คืนเงิน|ยืนยัน)/, "ทันที"],
  [/\b(refund\w*|confirm\w*)\W+(\w+\W+){0,2}immediately\b|\bimmediately\W+(\w+\W+){0,2}(refund\w*|confirm\w*)/i, "immediately"],
];
const MAX_CHARS = 1000;
const THAI_RE = /[฀-๿]/;
function textsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return isRec(value) ? [value.th, value.en].filter((x): x is string => typeof x === "string") : [];
}
function langTexts(value: unknown): { th: string; en: string } {
  if (typeof value === "string") return { th: value, en: "" };
  const r = isRec(value) ? value : {};
  return { th: typeof r.th === "string" ? r.th : "", en: typeof r.en === "string" ? r.en : "" };
}

export function checkTripsMsgTemplate(kind: string, value: unknown): { ok: true } | { ok: false; issues: TripsTplIssue[] } {
  const issues: TripsTplIssue[] = [];
  const v = langTexts(value);
  for (const locale of ["th", "en"] as const) {
    const text = v[locale];
    if (locale === "en" && !text) continue;
    const low = text.toLowerCase();
    for (const term of [...FORBIDDEN.filter((x) => low.includes(x)), ...findForbiddenTerms(text), ...NOW_PHRASE.filter(([re]) => re.test(text)).map(([, t]) => t)])
      issues.push({ code: "FORBIDDEN_TERM", term, locale });
    if (isTripsMsgKindA(kind) && !text.includes("{ลิงก์}")) issues.push({ code: "LINK_REQUIRED", locale });
    if (Array.from(text).length > MAX_CHARS) issues.push({ code: "TOO_LONG", locale });
    if (locale === "en" && THAI_RE.test(text.replace(/\{[^{}]*\}/g, ""))) issues.push({ code: "THAI_IN_EN", locale });
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}
/** ข้อความไทยของปัญหาแม่แบบ (ตอนบันทึก) */
export function tripsTplIssueTh(i: TripsTplIssue): string {
  const where = i.locale === "en" ? "ข้อความภาษาอังกฤษ" : "ข้อความภาษาไทย";
  if (i.code === "FORBIDDEN_TERM") return `${where}มีคำที่ใช้ไม่ได้: «${i.term ?? ""}»`;
  if (i.code === "LINK_REQUIRED") return `${where}ต้องมี {ลิงก์}`;
  if (i.code === "TOO_LONG") return `${where}ยาวเกิน ${MAX_CHARS} ตัวอักษร`;
  return "ข้อความภาษาอังกฤษมีอักษรไทยนอกวงเล็บตัวแปร";
}

/** ข้อความมาตรฐานของทะเบียน (ค่าเริ่ม _fallback ของ trips.msg.<kind>) */
export function tripsStandardText(kind: string): unknown {
  const def = getDef(`trips.msg.${kind}`);
  return isRec(def?.defaults) ? def.defaults._fallback : null;
}
const TPL_DEF = { type: "template" } as SettingDef;
/** ตัวอย่างข้อความ (ข้อความมาตรฐานส่งเข้ามาเอง — จอฝั่งเบราว์เซอร์ใช้ตัวนี้) */
export function tripsPreviewWith(kind: string, value: unknown, sampleVars: Record<string, string>, locale: string, standard: unknown): { text: string; fallback: boolean } {
  const fallback = !checkTripsMsgTemplate(kind, value).ok;
  return { text: renderTemplate(TPL_DEF, fallback ? standard : value, sampleVars ?? {}, locale === "en" ? "en" : "th"), fallback };
}
export function renderTripsPreview(kind: string, value: unknown, sampleVars: Record<string, string>, locale: string): { text: string; fallback: boolean } {
  return tripsPreviewWith(kind, value, sampleVars, locale, tripsStandardText(kind));
}

// ─────────────────────────────────────────────────────────────
// trips/manifest-core.ts — ตัวช่วยบริสุทธิ์ของใบรายชื่อรายวัน (ภาพ 12 ส่วนจอใหญ่ · RUN TRIPS T1.4a §3) + ชนิด VM ของจอ
// 🔴 ไม่มี I/O · ไม่อ่านนาฬิกา · import ได้เฉพาะ `import type` — คอมโพเนนต์ 'use client' import ไฟล์นี้ได้
// 🔴 csvCell = ด่านเดียวของทุกเซลล์ในไฟล์ส่งออก: อักขระควบคุม ⇒ ช่องว่าง · ขึ้นต้น = + - @ ⇒ นำหน้าด้วย ' (กันสูตรของโปรแกรมตาราง)
// 🔴 รูป TripVehicleRun.stops ตรึงที่นี่ (parseRunStops) — ตัวแก้การจัดรถเขียนรูปนี้ · รายการผิดรูปถูกทิ้ง ไม่ throw
// ─────────────────────────────────────────────────────────────
import type { HealthView, PaxFieldKey } from "./passengers-core";

export const MANIFEST_VIEWS = ["pickup", "booking"] as const;
export type ManifestView = (typeof MANIFEST_VIEWS)[number];
/** การจองที่ขึ้นใบรายชื่อ = ชุดที่นับเป็นขายแล้ว (ถือที่ · รออนุมัติ · หมดเวลา · ยกเลิก ไม่ขึ้น) */
export const MANIFEST_BOOKING_STATUSES = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"] as const;
/** ลำดับ = ลำดับตัดสิน (ตัวแรกที่จริงชนะ) */
export const MANIFEST_DOC_STATES = ["PURGED", "MISSING_NAMES", "INCOMPLETE", "COMPLETE"] as const;
export type ManifestDocState = (typeof MANIFEST_DOC_STATES)[number];
/** วัตถุประสงค์ของการเปิดดูข้อมูลสุขภาพจากใบรายชื่อ (⊂ PURPOSES ของผู้เดินทาง · ไม่มี "อื่น ๆ") */
export const MANIFEST_HEALTH_PURPOSES = ["MANIFEST", "SAFETY", "CHECKIN"] as const;
export type ManifestHealthPurpose = (typeof MANIFEST_HEALTH_PURPOSES)[number];
export const MANIFEST_CSV_COLUMNS = ["group", "pickupTime", "pickupPlace", "bookingCode", "booker", "channel", "paxNo", "traveller", "paxType", "nationality", "docType", "docMasked", "formStatus", "waiver", "health", "finSize"] as const;
export type ManifestCsvColumn = (typeof MANIFEST_CSV_COLUMNS)[number];
/** การจองสูงสุดต่อใบรายชื่อ */
export const TRIPS_MANIFEST_BOOKING_CAP = 200;
/** แถวผู้เดินทางสูงสุดต่อใบรายชื่อ / ไฟล์ส่งออก */
export const TRIPS_MANIFEST_PAX_CAP = 600;
export const RUN_STOPS_MAX = 60;

// ═══════════════ จุดรับของรถ (TripVehicleRun.stops) ═══════════════
export type RunStop = { bookingId: string; place: string; note: string | null; time: string };
const CTL_RE = /[\u0000-\u001f\u007f]/;
const CTL_ALL_RE = /[\u0000-\u001f\u007f]/g;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const STOP_TEXT_MAX = 120;
const STOP_ID_MAX = 128;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * อ่าน stops ของรถ: อาร์เรย์ของ { bookingId (1..128), place (1..120 หลัง trim), note? (≤ 120) | null, time "HH:MM" } เรียงตามลำดับรับ
 * ไม่ใช่อาร์เรย์ ⇒ [] · รายการผิดรูป ⇒ ทิ้งรายการนั้น · bookingId ซ้ำ ⇒ เก็บตัวแรก · เกิน RUN_STOPS_MAX ⇒ เก็บชุดแรก (หลังกรอง) · ผลไม่มีคีย์อื่น
 * note ที่อ่านไม่ได้ (ไม่ใช่ข้อความ · ยาวเกิน · มีอักขระควบคุม) ⇒ null (ไม่ทิ้งจุดรับทั้งจุดเพราะหมายเหตุ)
 */
export function parseRunStops(raw: unknown): RunStop[] {
  if (!Array.isArray(raw)) return [];
  const out: RunStop[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (out.length >= RUN_STOPS_MAX) break;
    if (!isRec(x)) continue;
    const { bookingId, place, note, time } = x;
    if (typeof bookingId !== "string" || bookingId.length < 1 || bookingId.length > STOP_ID_MAX || CTL_RE.test(bookingId)) continue;
    if (typeof time !== "string" || !TIME_RE.test(time)) continue;
    if (typeof place !== "string" || CTL_RE.test(place)) continue;
    const p = place.trim();
    if (p.length < 1 || p.length > STOP_TEXT_MAX) continue;
    if (seen.has(bookingId)) continue;
    seen.add(bookingId);
    const n = typeof note === "string" && !CTL_RE.test(note) ? note.trim() : "";
    out.push({ bookingId, place: p, note: n.length > 0 && n.length <= STOP_TEXT_MAX ? n : null, time });
  }
  return out;
}

// ═══════════════ สถานะรายชื่อ·เอกสารของการจอง ═══════════════
/**
 * seats = ที่นั่งของการจอง · slots = แถวผู้เดินทาง · purged = แถวที่ถูกลบตามนโยบาย · named = มีชื่อและไม่ถูกลบ · formComplete = แบบฟอร์มส่งแล้ว/ตรวจแล้ว
 * ถูกลบทั้งหมด ⇒ PURGED · ชื่อยังไม่ครบที่นั่ง ⇒ MISSING_NAMES · แบบฟอร์มยังไม่ครบที่นั่ง ⇒ INCOMPLETE · ที่เหลือ COMPLETE
 */
export function manifestDocState(i: { seats: number; slots: number; purged: number; named: number; formComplete: number }): ManifestDocState {
  if (i.slots > 0 && i.purged === i.slots) return "PURGED";
  if (i.named < i.seats) return "MISSING_NAMES";
  if (i.formComplete < i.seats) return "INCOMPLETE";
  return "COMPLETE";
}

// ═══════════════ CSV ═══════════════
const FORMULA_LEAD = new Set(["=", "+", "-", "@"]);
/**
 * เซลล์ CSV ที่ปลอดภัย: null/undefined ⇒ "" · จำนวนเต็มปลอดภัย ⇒ เลขฐานสิบ · ตัวเลขอื่น ⇒ ""
 * ข้อความ: อักขระควบคุมทุกตัว (รวม tab CR LF) ⇒ ช่องว่าง → trim → ขึ้นต้น = + - @ ⇒ นำหน้าด้วย ' → มี " หรือ , ⇒ ครอบ "…" และ " ⇒ ""
 */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isSafeInteger(v) ? String(v) : "";
  if (typeof v !== "string") return "";
  let s = v.replace(CTL_ALL_RE, " ").trim();
  if (s.length > 0 && FORMULA_LEAD.has(s[0])) s = `'${s}`;
  return s.includes('"') || s.includes(",") ? `"${s.replace(/"/g, '""')}"` : s;
}
/** ไฟล์ CSV: BOM + บรรทัดหัว + บรรทัดข้อมูล · ทุกเซลล์ผ่าน csvCell · คั่น , · จบทุกบรรทัดด้วย CRLF · แถวสั้น/ยาวถูกปรับให้เท่าหัว */
export function manifestCsv(header: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  const width = header.length;
  const line = (cells: readonly (string | number | null)[]): string => {
    const out: string[] = [];
    for (let i = 0; i < width; i++) out.push(csvCell(cells[i] ?? null));
    return out.join(",");
  };
  return `﻿${[header, ...rows].map((r) => `${line(r)}\r\n`).join("")}`;
}
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** วันที่ล้วนที่มีจริงในปฏิทิน */
function isRealDate(s: string): boolean {
  const m = YMD_RE.exec(s);
  if (!m) return false;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s;
}
/** ชื่อไฟล์ส่งออก — มีแต่วันที่ของรอบ + 6 ตัวท้ายของรหัสรอบ (ไม่มีชื่อสินค้า/ข้อความผู้ใช้) · ผลตรง /^[A-Za-z0-9.-]{1,60}$/ เสมอ */
export function manifestFileName(localDate: string, departureId: string): string {
  if (typeof localDate !== "string" || !isRealDate(localDate)) return "manifest.csv";
  const tail = String(departureId ?? "").replace(/[^A-Za-z0-9]/g, "").slice(-6);
  return tail ? `manifest-${localDate}-${tail}.csv` : `manifest-${localDate}.csv`;
}

// ═══════════════ ชนิด VM ของจอ (ตัวโหลด loadManifestVM) ═══════════════
export type ManifestPaxQty = { paxTypeId: string; code: string; labelTh: string; labelEn: string | null; qty: number };
export type ManifestExtraQty = { extraId: string; nameTh: string; nameEn: string | null; qty: number };
export type ManifestWaiver = "NOT_REQUIRED" | "MISSING" | "SIGNED" | "NEEDS_RESIGN";
export type ManifestPaxVM = {
  passengerId: string;
  /** ลำดับ 1.. ในการจอง */
  no: number;
  /** ว่าง/ถูกลบ ⇒ null */
  fullName: string | null;
  purged: boolean;
  paxTypeCode: string | null;
  paxTypeTh: string | null;
  paxTypeEn: string | null;
  nationality: string | null;
  docType: string | null;
  /** ปิดบังเสมอ ("••••1234") */
  docMasked: string | null;
  isMinor: boolean;
  formStatus: string;
  missing: PaxFieldKey[];
  waiver: ManifestWaiver;
  /** สถานะเท่านั้น — ไม่มีเนื้อหา */
  health: HealthView;
  finSize: string | null;
  docs: { live: number; pendingDeletion: number };
};
export type ManifestRowVM = {
  bookingId: string;
  code: string;
  status: string;
  bookerName: string | null;
  bookerPurged: boolean;
  channel: string;
  agentAccountId: string | null;
  agentRef: string | null;
  contactRoute: string;
  pax: ManifestPaxQty[];
  extras: ManifestExtraQty[];
  seats: number;
  pickup: { time: string | null; place: string | null; note: string | null; hint: string | null; paid: boolean };
  doc: { state: ManifestDocState; slots: number; named: number; missingNames: number; formComplete: number; waiverRequired: number; waiverSigned: number; healthProvided: number; healthMissing: number; needsFix: number };
  /** null เมื่อผู้ดูไม่มีสิทธิ์ดูการจอง */
  outstandingSatang: number | null;
  phoneMasked: string | null;
  travellers: ManifestPaxVM[];
};
export type ManifestGroupVM = {
  /** run:<runId> | unassigned | all */
  key: string;
  kind: "RUN" | "UNASSIGNED" | "ALL";
  run: { id: string; resourceId: string; vehicleName: string | null; vehicleSeats: number | null; driverName: null; route: string[] } | null;
  people: number;
  rows: ManifestRowVM[];
};
export type ManifestVM = {
  unit: { id: string; slug: string; name: string; tz: string; today: string; nowIso: string; nowLocal: string };
  flags: { canSeeMoney: boolean; canSeeHealth: boolean; canExport: true; canPrint: true; canEditRuns: false; canSend: false };
  view: ManifestView;
  departure: {
    id: string;
    productId: string;
    titleTh: string;
    titleEn: string | null;
    optionTh: string | null;
    optionEn: string | null;
    localDate: string;
    timeText: string;
    status: string;
    capacity: number;
    sold: number;
    boats: { id: string; name: string }[];
    guides: { id: string; name: string }[];
  };
  totals: {
    bookings: number;
    people: number;
    pax: ManifestPaxQty[];
    slots: number;
    named: number;
    /** max(0, people − named) */
    missingNames: number;
    formComplete: number;
    purged: number;
    /** null เมื่อรายการถูกตัด (ต้องอ่านรายคน) */
    waiverRequired: number | null;
    waiverSigned: number | null;
    healthProvided: number | null;
    healthMissing: number | null;
    /** null เมื่อผู้ดูไม่มีสิทธิ์ดูการจอง */
    outstandingSatang: number | null;
    agentCollectBookings: number | null;
    pickup: { assignedPeople: number; vehicles: number; unassignedPeople: number; staleStops: number };
    pendingBookings: number;
  };
  prep: { extras: ManifestExtraQty[]; finSizes: { size: string; n: number }[]; finMissing: number; meals: { travellers: number; guides: number } };
  groups: ManifestGroupVM[];
  bookingsTotal: number;
  bookingsShown: number;
  bookingCap: number;
  truncated: boolean;
  paxTotal: number;
  paxShown: number;
  paxCap: number;
  paxTruncated: boolean;
};

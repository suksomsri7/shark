// ─────────────────────────────────────────────────────────────
// platform/trips-book-core.ts — ตัวช่วยบริสุทธิ์ของการจองทัวร์หน้าสาธารณะ (เลือกคน/รับส่ง/เสริม → ถือที่ → ผู้จอง → จ่าย/วอเชอร์)
// RUN TRIPS W1.2a · ใบสั่ง ledger/trips-briefs/W1.2.md §3.1 §4.1
//
// 🔴 pure ล้วน: import ได้เฉพาะ import type · ไม่มี I/O · ไม่อ่าน env · ไม่อ่านนาฬิกา (เวลารับเข้ามาเป็นข้อความเสมอ) · ไม่มีการเข้ารหัส
// 🔴 เพดาน/ค่าคงที่ของหน้าจองสาธารณะส่วนจอง อยู่ที่ไฟล์นี้ที่เดียว — ไฟล์อื่นห้ามมีตัวเลขเพดานของตัวเอง
// 🔴 ตัวตรวจทุกตัวไม่ throw (อินพุตจากผู้ใช้ทุกรูป ⇒ null/false)
// ─────────────────────────────────────────────────────────────
import type { SelfManageVM } from "./trips-self-core"; // TRIPS W1.3 ▸ ◂
import type { BookBrandVM, BookCancelRow, BookFullVM, BookLocale, BookText } from "./trips-public-core";

// ═══════════════ ค่าคงที่ (ที่เดียว) ═══════════════
/** คน (ที่นั่ง + ทารก) ต่อการถือหนึ่งครั้งของหน้าสาธารณะ (มติ R7) */
export const BOOK_MAX_SEATS = 10;
/** ฟอร์มส่งเร็วกว่านี้ (วินาทีนับจากออก nonce) ⇒ TOO_FAST (มติ W5: 1 วิ) */
export const BOOK_FORM_MIN_SEC = 1;
/** ฟอร์มเก่ากว่านี้ ⇒ STALE_FORM */
export const BOOK_FORM_MAX_SEC = 7200;
/** เหลือเวลาถือน้อยกว่านี้ ⇒ ไม่ออก QR (มติ R8) · "โอนภายใน" = เวลาถือ − ค่านี้ */
export const BOOK_PAY_MARGIN_SEC = 180;
/** เหลือเวลาถือน้อยกว่านี้ ⇒ หน้ายืนยัน/ยืนยันตอบ HOLD_EXPIRED + ถือใหม่ โดยไม่เรียกบริการ (มติ W1: ระยะ "อย่าโอน" + 2 นาทีให้กรอก/โอน) */
export const BOOK_HOLD_USABLE_SEC = BOOK_PAY_MARGIN_SEC + 120;
/**
 * เวลาถือของช่องทาง WEB (trips.sell.holdMinutes · วินาที) ต่ำกว่านี้ ⇒ ไม่ให้ถือตั้งแต่ต้น (มติ Y1: < 10 นาที)
 * = ระยะที่ใช้ยืนยันไม่ได้ (BOOK_HOLD_USABLE_SEC) + 5 นาทีให้กรอกผู้จอง
 */
export const BOOK_HOLD_MIN_SEC = BOOK_HOLD_USABLE_SEC + 300;
/** เวลาถือ (นาที · จากค่าตั้ง) สั้นเกินกว่าจะกรอก/ยืนยัน/โอนทัน (มติ Y1) — ค่าที่ไม่ใช่จำนวนเต็มบวก ⇒ true (ปิดเมื่อพัง) */
export function bookHoldTooShort(holdMinutes: unknown): boolean {
  return typeof holdMinutes !== "number" || !Number.isSafeInteger(holdMinutes) || holdMinutes <= 0 || holdMinutes * 60 < BOOK_HOLD_MIN_SEC;
}
/** นาทีที่ลูกค้ากรอกและยืนยันได้จริงหลังถือ = เวลาถือ − BOOK_HOLD_USABLE_SEC (ปัดลง · มติ Y1 — ข้อความ "ระบบจะถือที่ให้ N นาที") */
export function bookFillMinutes(holdMinutes: number): number {
  return Math.max(0, Math.floor((holdMinutes * 60 - BOOK_HOLD_USABLE_SEC) / 60));
}
/** ถือรอบเดียวกันได้กี่ครั้งต่อเครื่องต่อชั่วโมง — นับเฉพาะตะกร้าใหม่ (มติ R7 · แก้โดยมติ W2: 3 ครั้ง) */
export const BOOK_SLOT_HOLD_PER_HOUR = 3;
/** ยืนยันการจองได้กี่ครั้งต่อเครื่องต่อชั่วโมง (มติ R10) */
export const BOOK_CONFIRM_PER_HOUR = 20;
/** รุ่นของข้อความเงื่อนไข/ความเป็นส่วนตัวที่ลูกค้าติ๊กยอมรับ (มติ R14) — เปลี่ยนข้อความใน book.json ⇒ เปลี่ยนค่านี้ */
export const BOOK_TERMS_VERSION = "2026-11-14.3";

export const BOOK_ERROR_CODES = [
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID",
  "PRICE_CHANGED",
  "SOLD_OUT",
  "CUTOFF_PASSED",
  "SLOT_CLOSED",
  "HOLD_LIMIT",
  "SLOT_BUSY",
  "HOLD_EXPIRED",
  "STALE_FORM",
  "TOO_FAST",
  "ACCEPT_REQUIRED",
  "DONE",
  "BUSY",
  "UNAVAILABLE",
] as const;
export type BookErrorCode = (typeof BOOK_ERROR_CODES)[number];
/** สถานะของหน้าการจอง (AWAIT_SHOP = W1.2b · มติ R8) */
export const BOOK_RES_STATES = ["PAY", "VOUCHER", "EXPIRED", "CANCELLED", "ENDED"] as const;
export type BookResState = (typeof BOOK_RES_STATES)[number];
export const BOOK_TODO_KEYS = ["PAY", "PASSENGERS", "WAIVER"] as const;
export type BookTodoKey = (typeof BOOK_TODO_KEYS)[number];
/** ช่องของฟอร์มที่ INVALID.fields อ้างได้ (ไม่มีชื่อช่องอื่น) */
export const BOOK_FORM_FIELDS = ["d", "t", "pax", "extras", "zone", "seen", "nonce", "name", "phone", "email"] as const;
export type BookFormField = (typeof BOOK_FORM_FIELDS)[number];

export const BOOK_PAX_CODE_RE = /^[A-Z0-9_]{1,32}$/;
export const BOOK_REF_RE = /^[a-z0-9]{12}$/;
export const BOOK_BASKET_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** token ของหน้าการจอง (base64url ของ HMAC-SHA256 = 43 ตัว) */
export const BOOK_RES_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** ตัวอ้างการเลือก (`sel`) ยาวสุด (มติ R9) */
export const BOOK_SEL_MAX = 1024;
const QTY_RE = /^(0|[1-9]\d{0,2})$/;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const byStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function isBookErrorCode(v: unknown): v is BookErrorCode {
  return typeof v === "string" && (BOOK_ERROR_CODES as readonly string[]).includes(v);
}
export function isBookFormField(v: unknown): v is BookFormField {
  return typeof v === "string" && (BOOK_FORM_FIELDS as readonly string[]).includes(v);
}

// ═══════════════ การเลือก (คน · รายการเสริม · รับส่ง) ═══════════════
export type BookSelection = { pax: { code: string; qty: number }[]; extras: { ref: string; qty: number }[]; zone: string | null };

/**
 * อ่านการเลือกจากพารามิเตอร์ของหน้า/ฟอร์ม: `n.<CODE>` (จำนวนคนต่อประเภท) · `x.<ref>` (รายการเสริม) · `z` (ref โซนรับส่ง)
 * ค่าเป็นสตริงจำนวนเต็ม 0–BOOK_MAX_SEATS ไม่มีศูนย์นำ · 0 ทิ้ง · เรียง code/ref · คีย์อื่นทิ้ง (รวม `a` — มติ R14)
 * ข้อใดผิดรูป (ค่าไม่ใช่สตริงเดี่ยว · code/ref ผิดรูป · เกินเพดาน) ⇒ null ทั้งก้อน · ไม่ throw
 */
export function parseBookSelection(sp: unknown): BookSelection | null {
  try {
    if (!isRec(sp)) return null;
    const pax: { code: string; qty: number }[] = [];
    const extras: { ref: string; qty: number }[] = [];
    let zone: string | null = null;
    for (const key of Object.keys(sp)) {
      const isPax = key.startsWith("n.");
      const isExtra = key.startsWith("x.");
      if (!isPax && !isExtra && key !== "z") continue;
      const v: unknown = sp[key];
      if (key === "z") {
        if (typeof v !== "string") return null;
        if (v === "") continue;
        if (!BOOK_REF_RE.test(v)) return null;
        zone = v;
        continue;
      }
      if (typeof v !== "string" || !QTY_RE.test(v)) return null;
      const qty = Number(v);
      if (qty > BOOK_MAX_SEATS) return null;
      const name = key.slice(2);
      if (isPax) {
        if (!BOOK_PAX_CODE_RE.test(name)) return null;
        if (qty > 0) pax.push({ code: name, qty });
      } else {
        if (!BOOK_REF_RE.test(name)) return null;
        if (qty > 0) extras.push({ ref: name, qty });
      }
    }
    pax.sort((a, b) => byStr(a.code, b.code));
    extras.sort((a, b) => byStr(a.ref, b.ref));
    return { pax, extras, zone };
  } catch {
    return null;
  }
}

/** ช่องของฟอร์มที่ทำให้ parseBookSelection ได้ null (แยกตรวจทีละกลุ่ม · ไม่สะท้อนค่า) */
export function selectionFieldsOf(sp: unknown): BookFormField[] {
  const out: BookFormField[] = [];
  try {
    if (!isRec(sp)) return ["pax"];
    const pick = (pred: (k: string) => boolean): Record<string, unknown> => {
      const r: Record<string, unknown> = {};
      for (const k of Object.keys(sp)) if (pred(k)) r[k] = sp[k];
      return r;
    };
    if (parseBookSelection(pick((k) => k.startsWith("n."))) === null) out.push("pax");
    if (parseBookSelection(pick((k) => k.startsWith("x."))) === null) out.push("extras");
    if (parseBookSelection(pick((k) => k === "z")) === null) out.push("zone");
  } catch {
    return ["pax"];
  }
  return out.length ? out : ["pax"];
}

/** ต้องมีที่นั่ง ≥ 1 และคนรวมทุกประเภท ≤ max (ทารกล้วน ⇒ false) */
export function selectionSeatsOk(sel: BookSelection, seatCodes: readonly string[], max: number): boolean {
  if (!sel || !Array.isArray(sel.pax)) return false;
  let seats = 0;
  let people = 0;
  for (const p of sel.pax) {
    people += p.qty;
    if (seatCodes.includes(p.code)) seats += p.qty;
  }
  return seats >= 1 && people <= max;
}

/** คนรวมทุกประเภท (ปุ่ม + ปิดเมื่อถึงเพดาน) */
export function selectionPeople(sel: BookSelection | null): number {
  let n = 0;
  for (const p of sel?.pax ?? []) n += p.qty;
  return n;
}

/** พารามิเตอร์ของหน้าสินค้าจากการเลือก (ลำดับตายตัว · ค่าเป็นสตริง) — ใช้ทำลิงก์/ฟอร์ม GET และ rehold */
export function selectionQuery(sel: BookSelection): Record<string, string> {
  const q: Record<string, string> = {};
  for (const p of sel.pax) q[`n.${p.code}`] = String(p.qty);
  for (const x of sel.extras) q[`x.${x.ref}`] = String(x.qty);
  if (sel.zone) q.z = sel.zone;
  return q;
}

/** การเลือกที่เปลี่ยนจำนวนคนของประเภทเดียว (ปุ่ม − + ของหน้าสินค้า · 0 = เอาออก) */
export function selectionWithPax(sel: BookSelection, code: string, qty: number): BookSelection {
  const pax = sel.pax.filter((p) => p.code !== code);
  if (qty > 0) pax.push({ code, qty });
  pax.sort((a, b) => byStr(a.code, b.code));
  return { pax, extras: [...sel.extras], zone: sel.zone };
}

/** เฉพาะคีย์ของการเลือก (n.* x.* z) ที่เป็นสตริงเดี่ยวจากพารามิเตอร์ของหน้า (ไม่เกิน 60 คีย์) — ส่งต่อให้ตัวตรวจของ platform */
export function selectionParamsOf(sp: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    if (!isRec(sp)) return out;
    let n = 0;
    for (const k of Object.keys(sp)) {
      if (k !== "z" && !k.startsWith("n.") && !k.startsWith("x.")) continue;
      if (++n > 60) break;
      const v = sp[k];
      if (typeof v === "string" && k.length <= 48 && v.length <= 16) out[k] = v;
      else out[k] = "invalid";
    }
  } catch {
    return {};
  }
  return out;
}

// ═══════════════ วันเวลา (ข้อความล้วน) ═══════════════
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function ymdMs(ymd: string): number | null {
  const m = YMD_RE.exec(ymd);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(ms).toISOString().slice(0, 10) === ymd ? ms : null;
}
const DAY_MS = 86_400_000;

/**
 * วันสุดท้ายของแต่ละขั้นยกเลิก = วันเดินทาง − daysBefore (ปฏิทิน) · ขั้นที่เลยวันนี้แล้ว (วันสุดท้าย < today) ไม่แสดง · ขั้น 0 วันไม่แสดง
 * pct = refundBp ÷ 100 (ปัดทิ้ง · เป็นร้อยละของตาราง ไม่ใช่ยอดเงิน)
 */
export function cancelDeadlinesOf(ladder: readonly { daysBefore: number; refundBp: number }[], travelDate: string, today: string): { date: string; pct: number }[] {
  const travel = ymdMs(String(travelDate));
  const now = ymdMs(String(today));
  if (travel === null || now === null || !Array.isArray(ladder)) return [];
  const out: { date: string; pct: number }[] = [];
  for (const s of ladder) {
    const days: unknown = isRec(s) ? s.daysBefore : null;
    const bp: unknown = isRec(s) ? s.refundBp : null;
    if (typeof days !== "number" || !Number.isInteger(days) || days <= 0 || typeof bp !== "number" || !Number.isFinite(bp)) continue;
    const last = travel - days * DAY_MS;
    if (last < now) continue;
    out.push({ date: new Date(last).toISOString().slice(0, 10), pct: Math.trunc(bp / 100) });
  }
  return out;
}

/**
 * สถานะของหน้าการจอง (ตัวตัดสินเดียว — จอห้ามตัดสินเอง)
 * HOLD ที่ยังไม่หมดเวลา ⇒ PAY · HOLD หมดเวลา/ไม่มีเวลาถือ · EXPIRED ⇒ EXPIRED · CONFIRMED/PART_PAID/PAID ⇒ VOUCHER · CANCELLED · TRAVELLED/NO_SHOW ⇒ ENDED
 * PENDING (รอร้านยืนยัน = W1.2b) / ไม่รู้จัก ⇒ null
 */
export function reservationStateOf(i: { status: unknown; holdExpiresAt: unknown; now: unknown }): BookResState | null {
  if (!isRec(i)) return null;
  switch (i.status) {
    case "HOLD": {
      const exp = typeof i.holdExpiresAt === "string" ? Date.parse(i.holdExpiresAt) : Number.NaN;
      const now = typeof i.now === "string" ? Date.parse(i.now) : Number.NaN;
      return Number.isFinite(exp) && Number.isFinite(now) && exp > now ? "PAY" : "EXPIRED";
    }
    case "EXPIRED":
      return "EXPIRED";
    case "CONFIRMED":
    case "PART_PAID":
    case "PAID":
      return "VOUCHER";
    case "CANCELLED":
      return "CANCELLED";
    case "TRAVELLED":
    case "NO_SHOW":
      return "ENDED";
    default:
      return null;
  }
}

export type BookTodo = { key: "PAY"; done: boolean } | { key: "PASSENGERS" | "WAIVER"; done: boolean; count: number; total: number };
const SOLD: readonly string[] = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"];
/**
 * สิ่งที่ต้องทำก่อนเดินทาง (สถานะอย่างเดียว · ลิงก์กรอก = W1.3): PAY ครบเมื่อยอดค้าง 0 และขายแล้ว · PASSENGERS ชื่อครบทุกคน (รวมทารก)
 * · WAIVER เฉพาะสินค้าที่ต้องเซ็น · ลำดับ PAY → PASSENGERS → WAIVER
 */
export function bookTodoOf(i: { status: string; outstandingSatang: number; people: number; named: number; waiverRequired: boolean; waiversSigned: number }): BookTodo[] {
  const people = Math.max(0, Math.trunc(i.people));
  const named = Math.min(people, Math.max(0, Math.trunc(i.named)));
  const out: BookTodo[] = [
    { key: "PAY", done: i.outstandingSatang === 0 && SOLD.includes(i.status) },
    { key: "PASSENGERS", done: people > 0 && named >= people, count: named, total: people },
  ];
  if (i.waiverRequired) {
    const signed = Math.min(people, Math.max(0, Math.trunc(i.waiversSigned)));
    out.push({ key: "WAIVER", done: people > 0 && signed >= people, count: signed, total: people });
  }
  return out;
}

// ═══════════════ ผู้จอง (มติ R11 · ใบสั่ง §4.1) ═══════════════
/** อักขระควบคุม C0/C1 · ตัวกำหนดทิศทาง/ความกว้างศูนย์ที่ห้ามในชื่อ */
const NAME_BAD = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/;
/** ชื่อผู้จอง: NFC → ตัดช่องว่างหัวท้าย → 1–100 อักขระ · มีอักขระต้องห้าม ⇒ null */
export function bookerNameOf(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 1000) return null;
  const s = v.normalize("NFC").trim();
  const n = [...s].length;
  if (n < 1 || n > 100 || NAME_BAD.test(s)) return null;
  return s;
}
/**
 * เบอร์: ตัดช่องว่าง/ขีด/วงเล็บ → 0 + 8–9 หลัก (ไทย) ⇒ +66… · `+660…` (ใส่ 0 หลังรหัสประเทศ) ⇒ ตัด 0 (มติ W5) · + 8–15 หลัก ⇒ เดิม · อื่น ⇒ null (E.164 รูปเดียว)
 */
export function bookerPhoneOf(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 60) return null;
  const s = v.replace(/[\s\-()]/g, "");
  if (/^0\d{8,9}$/.test(s)) return `+66${s.slice(1)}`;
  if (/^\+660\d{8,9}$/.test(s)) return `+66${s.slice(4)}`;
  if (/^\+\d{8,15}$/.test(s)) return s;
  return null;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** อีเมล: ตัดช่องว่าง · ว่าง ⇒ "" (ไม่มีอีเมล) · ตัวเล็ก · ≤ 200 · รูปพื้นฐาน · อื่น ⇒ null */
export function bookerEmailOf(v: unknown): string | null {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string" || v.length > 1000) return null;
  const s = v.trim().toLowerCase();
  if (s === "") return "";
  if (s.length > 200 || !EMAIL_RE.test(s)) return null;
  return s;
}

// ═══════════════ ลิงก์ของเส้นจอง (ไม่มีค่าที่ผู้จองกรอก) ═══════════════
const enc = encodeURIComponent;
const SELECT_ORDER = ["lang", "m", "d", "t"] as const;
/** หน้าสินค้าพร้อมการเลือก (ปุ่ม "ถือใหม่" · กลับไปแก้เมื่อถือไม่สำเร็จ) — query จาก platform (ค่าที่ตรวจรูปแล้ว) + รหัสผิดพลาด */
/** T0.4d D1: นาทีที่ให้รอของ SLOT_BUSY = ceil(วินาที/60) ขั้นต่ำ 1 · พารามิเตอร์ `r` รับเฉพาะจำนวนเต็ม 1–1440 (อื่น ⇒ ไม่มี) */
export function bookWaitMinutes(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^[1-9]\d{0,3}$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 1440 ? n : null;
}
export const bookWaitOfSec = (sec: unknown): number | null => (typeof sec === "number" && Number.isFinite(sec) && sec > 0 ? Math.min(1440, Math.max(1, Math.ceil(sec / 60))) : null);
export function bookSelectHref(shopSlug: string, back: { productSlug: string; query: Record<string, string> }, e?: BookErrorCode | typeof BOOK_HOLD_LIMITED | null, r?: number | null): string {
  const parts: string[] = [];
  const q = isRec(back.query) ? back.query : {};
  for (const k of SELECT_ORDER) if (typeof q[k] === "string" && q[k] !== "") parts.push(`${k}=${enc(q[k])}`);
  for (const k of Object.keys(q).filter((x) => x.startsWith("n.") || x.startsWith("x.")).sort(byStr)) parts.push(`${enc(k)}=${enc(q[k] ?? "")}`);
  if (typeof q.z === "string" && q.z !== "") parts.push(`z=${enc(q.z)}`);
  if (e && (isBookErrorCode(e) || e === BOOK_HOLD_LIMITED)) parts.push(`e=${e}`);
  if (e === "SLOT_BUSY" && bookWaitMinutes(r)) parts.push(`r=${r}`);
  const path = `/book/${enc(shopSlug)}/t/${enc(back.productSlug)}`;
  return parts.length ? `${path}?${parts.join("&")}` : path;
}
/** หน้ายืนยัน: token ตะกร้าใน path · `sel` · (ผิด) `e` + `f` เท่านั้น (มติ R11) · `lang` เฉพาะลิงก์สลับภาษาของหน้าเอง */
export function bookCheckoutHref(shopSlug: string, basketToken: string, sel: string, err?: { e: BookErrorCode; f?: readonly string[]; r?: number | null } | null, lang?: BookLocale | null): string {
  const fields = (err?.f ?? []).filter(isBookFormField);
  const wait = err?.e === "SLOT_BUSY" ? bookWaitMinutes(err.r) : null;
  const tail = err && isBookErrorCode(err.e) ? `&e=${err.e}${fields.length ? `&f=${enc(fields.join(","))}` : ""}${wait ? `&r=${wait}` : ""}` : "";
  return `/book/${enc(shopSlug)}/c/${enc(basketToken)}?sel=${enc(sel)}${tail}${lang === "th" || lang === "en" ? `&lang=${lang}` : ""}`;
}
/** หน้าการจองของลูกค้า (`lang` เฉพาะลิงก์สลับภาษาของหน้าเอง) */
export function bookReservationHref(shopSlug: string, token: string, lang?: BookLocale | null): string {
  return `/book/${enc(shopSlug)}/my/${enc(token)}${lang === "th" || lang === "en" ? `?lang=${lang}` : ""}`;
}
const SEL_RE = /^v1\.[A-Za-z0-9_-]{1,1000}\.[A-Za-z0-9_-]{22}$/;
const SHOP_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
/**
 * ตรวจรูปก่อนใส่ใน Location ของ redirect (มติ W5): slug ร้าน · token ตะกร้า 43 ตัว · `sel` รูป v1 ยาว ≤ BOOK_SEL_MAX · token การจอง 43 ตัว
 * ค่าไหนไม่ใช่สตริงหรือผิดรูป ⇒ false (action ไม่ redirect ด้วยค่านั้น)
 */
export function bookRedirectOk(v: { shopSlug?: unknown; basketToken?: unknown; sel?: unknown; token?: unknown }): boolean {
  const okStr = (x: unknown, re: RegExp, max: number): boolean => typeof x === "string" && x.length <= max && re.test(x);
  if (!okStr(v.shopSlug, SHOP_SLUG_RE, 63)) return false;
  if ("basketToken" in v && !okStr(v.basketToken, BOOK_BASKET_TOKEN_RE, 43)) return false;
  if ("sel" in v && !okStr(v.sel, SEL_RE, BOOK_SEL_MAX)) return false;
  if ("token" in v && !okStr(v.token, BOOK_RES_TOKEN_RE, 43)) return false;
  return true;
}
/**
 * ค่า `e` ของหน้าสินค้าเมื่อถังถือ/ถังต่อรอบของเครื่องนี้เต็มจริง (มติ Y5) — แยกจาก `RATE_LIMITED` (ถังอ่านเต็ม/ด่านล่ม ⇒ ข้อความกลาง)
 * อยู่ในรายการอนุญาตของ bookErrorParam (ไม่สะท้อนค่าอื่น)
 */
export const BOOK_HOLD_LIMITED = "HOLD_LIMITED";
/** รหัสผิดพลาด/ช่องจากพารามิเตอร์ของหน้า (`e` `f`) — เฉพาะค่าที่อยู่ในรายการ (ไม่สะท้อนค่าอื่น) · `e=HOLD_LIMITED` ⇒ RATE_LIMITED + holdLimited */
export function bookErrorParam(sp: unknown): { code: BookErrorCode; fields: BookFormField[]; holdLimited?: true; wait?: number } | null {
  try {
    if (!isRec(sp)) return null;
    const e = sp.e;
    if (e === BOOK_HOLD_LIMITED) return { code: "RATE_LIMITED", fields: [], holdLimited: true };
    if (!isBookErrorCode(e)) return null;
    const f = typeof sp.f === "string" && sp.f.length <= 80 ? sp.f.split(",").filter(isBookFormField) : [];
    const wait = e === "SLOT_BUSY" ? bookWaitMinutes(sp.r) : null;
    return { code: e, fields: f, ...(wait ? { wait } : {}) };
  } catch {
    return null;
  }
}

// ═══════════════ ชนิดของ VM (ไม่มี id ภายในทุกชั้น) ═══════════════
export type BookShopInfo = { name: string; contact: { phone?: string; line?: string }; address?: string };
export type BookOptionsVM = {
  pax: { code: string; label: BookText; ageMin: number | null; ageMax: number | null; seat: boolean; unitSatang: number }[];
  extras: { ref: string; name: BookText; note: BookText; basis: string; unitSatang: number }[];
  zones: { ref: string; kind: string; name: BookText; areas: BookText; surchargeSatang: number }[];
  maxSeats: number;
  left: number;
  slot: { token: string | null; timeText: string };
};
export type BookLineKind = "SEAT" | "EXTRA" | "PICKUP" | "VAT";
export type BookLineVM = { kind: BookLineKind; label: BookText; qty: number; unitSatang: number; amountSatang: number; passThrough: boolean };
export type BookVatNoteVM = "INCLUDED" | "ADDED" | "NONE";
export type BookSummaryVM = {
  date: string;
  slotToken: string | null;
  timeText: string;
  seats: number;
  lines: BookLineVM[];
  totalSatang: number;
  passThroughSatang: number;
  vatNote: BookVatNoteVM;
  cancelRows: BookCancelRow[];
  holdMinutes: number;
  /** นาทีที่กรอก/ยืนยันได้จริงหลังถือ (bookFillMinutes · มติ Y1) — ข้อความ "ระบบจะถือที่ให้ N นาที" ใช้ค่านี้ */
  fillMinutes: number;
};
export type BookRehold = { productSlug: string; query: Record<string, string> };
export type BookCheckoutVM = {
  shop: BookShopInfo;
  /** ตราสินค้าของร้านสำหรับเปลือกหน้า (ชื่อ/โลโก้/สี · เดียวกับหน้าสินค้า) */
  brand: BookBrandVM;
  locale: BookLocale;
  product: { slug: string; title: BookText };
  date: string;
  timeText: string;
  summary: BookSummaryVM;
  holdUntil: string;
  holdUntilLocal: string;
  /** "กรอกและยืนยันภายใน HH:MM" = เวลาหมดถือ − BOOK_HOLD_USABLE_SEC (เวลาร้าน · มติ Y1) */
  confirmByLocal: string;
  cancelRows: BookCancelRow[];
  legal: { licenseNo: string | null; termsVersion: string };
  form: { nonce: string };
};
/**
 * QR ยอดงวดแรกค้าง (บริการ) · ไม่มี QR พร้อมเหตุ: NO_RECEIVER ร้านยังไม่ตั้งผู้รับเงิน · TOO_LATE ใกล้หมดเวลาถือ (R8)
 * · NOTHING_DUE ไม่มียอดต้องโอนตอนนี้ · AGENT_COLLECTS เอเจนซี่เป็นผู้เก็บเงิน (มติ W5) · NOT_SHOP ผู้เก็บเงินแบบอื่นที่ไม่ใช่ร้าน/เอเจนซี่ (มติ Y7 · ข้อความกลาง)
 */
export type BookPayVM = null | { amountSatang: number; qrSvgDataUrl: string; receiverName: string } | { unavailable: "NO_RECEIVER" | "TOO_LATE" | "NOTHING_DUE" | "AGENT_COLLECTS" | "NOT_SHOP" };
export type BookReservationVM = {
  shop: BookShopInfo;
  brand: BookBrandVM;
  locale: BookLocale;
  code: string;
  state: BookResState;
  product: { slug: string; title: BookText };
  date: string;
  timeText: string;
  lines: BookLineVM[];
  totalSatang: number;
  paidSatang: number;
  outstandingSatang: number;
  holdUntil: string | null;
  holdUntilLocal: string | null;
  payByLocal: string | null;
  /** วันที่ (เวลาร้าน) ของ "โอนภายใน" — คู่กับ payByLocal (มติ W4) */
  payByDate: string | null;
  pay: BookPayVM;
  voucher: null | { qrSvgDataUrl: string };
  todo: BookTodo[];
  cancelRows: BookCancelRow[];
  cancelUntil: { date: string; pct: number }[];
  /** TRIPS W1.3 ▸ ก้อน "จัดการการจอง" (ปุ่มยกเลิก/เหตุที่ปิด/สถานะคำขอคืนเงิน · ใบสั่ง W1.3 §3.2) ◂ */
  manage: SelfManageVM;
  /** TRIPS W1.3 ▸ nonce ของฟอร์มยืนยันเบอร์ (เมื่อปุ่มเปิด · นอก manage · มติ L6) ◂ */
  selfVerifyNonce: string | null;
  /** TRIPS W1.3 ▸ การยกเลิกเป็นของเส้นลูกค้าเอง (แบนเนอร์หลังยกเลิก · V2) ◂ */
  selfCancelled: boolean;
  /** TRIPS W1.4a ▸ ก้อนหมดเวลา (มีเฉพาะ state EXPIRED · ใบสั่ง W1.4 §4.2) ◂ */
  expired: BookExpiredVM | null;
};

// ═══════════════ TRIPS W1.4a ▸ หน้าการจองที่หมดเวลา (ใบสั่ง W1.4 §4.2 · ภาพ 07ข) ◂ ═══════════════
/**
 * heldUntil* = เวลาหมดถือล่าสุด (เวลาร้าน) · now = ที่ว่างของรอบเดิมตอนนี้ (CLOSED = ปิด/ยกเลิก/เลยปิดรับ) · rehold = ลิงก์ GET ไปหน้าสินค้าพร้อมการเลือกเดิม (มติ C-2)
 * full = ก้อนรอบเต็มของวันเดิม (เมื่อรอบเดิมเต็ม) — ไม่มี token เดิม/ข้อมูลผู้จองในลิงก์ (มติ C-3)
 */
export type BookExpiredVM = {
  heldUntilDate: string | null;
  heldUntilLocal: string | null;
  now: { state: "OPEN" | "LOW" | "FULL" | "CLOSED"; left: number } | null;
  rehold: { href: string; partial: boolean } | null;
  full: BookFullVM | null;
  /** ถือใหม่ทางเว็บได้ (ไม่ใช่เอเจนซี่ · รอบเดิมไม่ปิด · ร้านเปิดจองทันที) — ไม่ได้ ⇒ ไม่แสดงที่ว่างตอนนี้/ก้อนรอบเต็ม (มติ D4 D6) */
  open: boolean;
  /** การจองผ่านเอเจนซี่ (เงินอยู่ที่เอเจนซี่ ⇒ ไม่มีข้อความ "ร้านจะตรวจรายการโอน" · มติ D7) */
  agency: boolean;
};
const lineIdOf = (l: Record<string, unknown>, field: string, prefix: string): string | null =>
  typeof l[field] === "string" && l[field] !== "" ? String(l[field]) : typeof l.itemRef === "string" && l.itemRef.startsWith(prefix) ? (l.itemRef.slice(prefix.length).split(":")[0] ?? null) || null : null;
/**
 * การเลือกเดิมจากบรรทัด snapshot → พารามิเตอร์ของหน้าสินค้า (`n.<CODE>` · `x.<ref>=1` · `z`) · รายการเดิมที่จับคู่ไม่ได้ (ประเภทคนปิด · เสริมเลิกขาย · เขตปิด) ⇒ ตัดออก + partial
 * รายการเสริมส่ง `1` เสมอ (ฟอร์มเป็นช่องติ๊ก · qty ใน snapshot = ที่ขอ × วัน/คืน/คน ⇒ ส่งต่อแล้วคิดเงินซ้ำ · มติ D1)
 * เขตรับส่งที่พาไปไม่ได้ (เขตไม่มีค่าบริการไม่อยู่ใน snapshot) ไม่ตั้ง partial — ข้อความใต้ปุ่มบอกให้ตรวจรับส่งเสมอ (มติ E2 แทน D5)
 * `skipExtras` = รายการเสริมบังคับ (คิดเองที่หน้าสินค้า ไม่ใช่การเลือก) · ไม่ใช่อาร์เรย์ / ไม่มี SEAT / ไม่เหลือประเภทคน ⇒ null · ไม่ throw
 */
export function reholdSelectionOf(lines: unknown, cat: { paxCodes: readonly string[]; extras: readonly { id: string; ref: string }[]; zones: readonly { id: string; ref: string }[]; skipExtras?: readonly string[] }): { query: Record<string, string>; partial: boolean } | null {
  try {
    if (!Array.isArray(lines)) return null;
    const seats = new Map<string, number>();
    const query: Record<string, string> = {};
    let partial = false;
    for (const l of lines) {
      if (!isRec(l) || typeof l.qty !== "number" || !Number.isInteger(l.qty) || l.qty < 1) continue;
      if (l.kind === "SEAT" && typeof l.paxTypeCode === "string") seats.set(l.paxTypeCode, (seats.get(l.paxTypeCode) ?? 0) + l.qty);
      else if (l.kind === "EXTRA") {
        const id = lineIdOf(l, "extraId", "extra:");
        if (id === null || cat.skipExtras?.includes(id)) continue;
        const x = cat.extras.find((e) => e.id === id);
        if (x) query[`x.${x.ref}`] = "1";
        else partial = true;
      } else if (l.kind === "PICKUP") {
        const z = cat.zones.find((e) => e.id === lineIdOf(l, "zoneId", "pickup:"));
        if (z) query.z = z.ref;
        else partial = true;
      }
    }
    let kept = 0;
    for (const [code, qty] of seats) {
      if (!cat.paxCodes.includes(code) || qty > BOOK_MAX_SEATS) partial = true;
      else {
        query[`n.${code}`] = String(qty);
        kept++;
      }
    }
    return kept > 0 ? { query, partial } : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// platform/trips-book.ts — เส้นจองทัวร์หน้าสาธารณะ `/book/[shop]` ฝั่งเซิร์ฟเวอร์ · RUN TRIPS W1.2a (ใบสั่ง ledger/trips-briefs/W1.2.md §3.2 §4)
//
// เลือกคน/รับส่ง/เสริม (ยอดจากบริการราคา) → ถือที่ (holdTrips) → หน้ายืนยัน → ยืนยัน (confirmTrips) → หน้าการจอง (QR ยอดล็อก / วอเชอร์)
//
// 🔴 ไม่ต้องล็อกอิน ⇒ ผู้เรียกไม่น่าไว้ใจทุกช่อง · ทุกฟังก์ชันไม่ throw (อินพุตทุกรูป ⇒ ผลที่มีรหัส) · ไม่สะท้อนค่าที่ส่งมา
// 🔴 ลำดับด่าน (§4): กุญแจเครื่อง (ไม่ถามฐาน) → ร้าน/สินค้า (ไม่พบ = ถังเดาของ W1.1) → ถังอ่าน **คำสั่ง SQL เดียว** ปิดเมื่อพัง
//    → ปุ่มจองเปิดไหม (ค่าตั้งร้าน) → ฟอร์ม (nonce · ยอดที่เห็น · ผู้จอง) → ref → id → (ถือ) ถังถือ+ถังต่อรอบ คำสั่งเดียว → บริการ
//    ฟอร์มผิด/ด่านล่ม ⇒ ไม่เรียกบริการ ⇒ ไม่มีที่ถือ ไม่มีการจอง ไม่มี Party ใหม่
// 🔴 เงิน: สตางค์จำนวนเต็ม · ยอดทุกตัวมาจาก quoteTripLine/quoteTrips (ก่อนจอง) · snapshot ของการจอง (หลังจอง) · tripPaymentIntent (QR)
//    บรรทัด VAT (ร้านคิดภาษีเพิ่ม) = payable − Σ บรรทัดอื่น คิดที่นี่ที่เดียว (มติ R16 ข้อ 3) — จอห้ามคิด
// 🔴 ไม่มี id ภายในออกจากไฟล์นี้: ref สาธารณะ = HMAC มีกุญแจ · token ตะกร้า/การเลือก (`sel`) เซ็นด้วยกุญแจ · ไม่มีกุญแจ ⇒ ปิด (ไม่มีสูตรสำรอง)
// 🔴 ไม่บันทึก log/ops ที่มีข้อมูลผู้จอง · คีย์ถังมีแค่ร้าน/รอบ/กุญแจเครื่อง
// ─────────────────────────────────────────────────────────────
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { prisma } from "@/lib/core/db";
import { rateBucketCte } from "@/lib/core/rate-limit-db";
import { resolveSettings } from "@/lib/core/settings";
import {
  bookingPublicToken,
  confirmTrips,
  findBookBasket,
  findBookReservation,
  findBookSelfFacts,
  getAvailability,
  holdTrips,
  loadBookCatalog,
  loadBookDay,
  loadBookDeparture,
  outstandingOf,
  quoteTripLine,
  quoteTrips,
  releaseHold,
  tripPaymentIntent,
  tripsHhmm,
  utcToLocal,
  type BookCatalog,
  type BookDaySlot,
  type BookDepartureRow,
  type BookReservationRow,
} from "@/lib/modules/trips";
import { bookBrandOf, bookFullOf, bookMiss, bookPublicRef, bookSaleState, bookSlotToken, bookVisibleProduct, resolveBookShop, type BookShop } from "./trips-public";
import { BOOK_LIMITER_DOWN_RETRY_SEC, BOOK_READ_LIMIT, BOOK_SLOT_TOKEN_RE, bookLocaleOf, cancelRowsOf, isBookYmd, type BookLocale, type BookText } from "./trips-public-core";
import {
  BOOK_BASKET_TOKEN_RE,
  BOOK_CONFIRM_PER_HOUR,
  BOOK_FORM_FIELDS,
  BOOK_FORM_MAX_SEC,
  BOOK_FORM_MIN_SEC,
  BOOK_HOLD_USABLE_SEC,
  BOOK_MAX_SEATS,
  BOOK_PAX_CODE_RE,
  BOOK_PAY_MARGIN_SEC,
  BOOK_REF_RE,
  BOOK_RES_TOKEN_RE,
  BOOK_SEL_MAX,
  BOOK_SLOT_HOLD_PER_HOUR,
  BOOK_TERMS_VERSION,
  bookerEmailOf,
  bookerNameOf,
  bookerPhoneOf,
  bookFillMinutes,
  bookHoldTooShort,
  bookSelectHref,
  reholdSelectionOf,
  type BookExpiredVM,
  bookTodoOf,
  cancelDeadlinesOf,
  parseBookSelection,
  reservationStateOf,
  selectionFieldsOf,
  selectionQuery,
  selectionSeatsOk,
  type BookCheckoutVM,
  type BookErrorCode,
  type BookFormField,
  type BookLineVM,
  type BookOptionsVM,
  type BookPayVM,
  type BookRehold,
  type BookReservationVM,
  type BookSelection,
  type BookShopInfo,
  type BookSummaryVM,
} from "./trips-book-core";
import { selfManageVMOf } from "./trips-self-core"; // TRIPS W1.3 ▸ ก้อน "จัดการการจอง" ◂
import { issueSelfFormNonce } from "./trips-self"; // TRIPS W1.3 ▸ nonce ฟอร์มยืนยันเบอร์ออกจากตัวเปิดหน้า (มติ L6) ◂

// ═══════════════ ชนิดผล ═══════════════
export type BookFlowOpts = { now?: Date; deps?: { query?: (sql: unknown) => Promise<unknown[]> } };
/** ผลไม่สำเร็จของทุกฟังก์ชัน — รหัสใน BOOK_ERROR_CODES · ช่องเสริมตามรหัส (ใบสั่ง §3.2) */
export type BookFail = {
  ok: false;
  code: BookErrorCode;
  reason?: string;
  retryAfterSec?: number;
  fields?: BookFormField[];
  totalSatang?: number;
  heldTotalSatang?: number;
  rehold?: BookRehold;
  token?: string;
  /** slug จริงของร้าน (ตัวเล็ก) — ให้ action ทำ redirect (ไม่ใช้ค่าจากคำขอ · มติ R14) */
  shopSlug?: string;
  /** (ถือไม่สำเร็จ) หน้าสินค้าพร้อมการเลือกเดิม — ค่าที่ตรวจรูปแล้วเท่านั้น */
  back?: BookRehold;
  /** ภาษาที่ตรวจแล้ว (th/en) จากฟอร์ม — action พาข้าม redirect (มติ W5) */
  lang?: BookLocale | null;
  /** (ถือ · RATE_LIMITED) ถังถือ/ถังต่อรอบของเครื่องนี้เต็มจริง — ไม่ใช่ถังอ่าน/ด่านล่ม (มติ Y5) */
  holdLimited?: true;
  /** (หน้าการจอง · UNAVAILABLE reason PENDING) รหัสการจอง + ผู้ขาย ให้ข้อความ "ติดต่อร้าน … พร้อมรหัสการจอง" (มติ Y6) */
  pending?: { bookingCode: string; shop: BookShopInfo };
};
/**
 * `nonce` = nonce ของฟอร์มถือที่ (โดเมน hold ผูกร้าน · มติ W5) — มีเมื่อมีสรุปยอด · ไม่มีกุญแจ ⇒ null
 * `shop` = ผู้ขาย (ชื่อ/เบอร์/LINE) ให้ข้อความ "ถือถี่เกิน — ลองใหม่ภายหลังหรือติดต่อร้าน" (มติ W2)
 */
export type BookQuoteResult = { ok: true; options: BookOptionsVM; summary: BookSummaryVM | null; nonce: string | null; shop: BookShopInfo } | BookFail;
export type BookHoldResult = { ok: true; basketToken: string; sel: string; expiresAt: string; shopSlug: string; lang: BookLocale | null } | BookFail;
export type BookCheckoutResult = { ok: true; vm: BookCheckoutVM } | BookFail;
export type BookConfirmResult = { ok: true; token: string; shopSlug: string; lang: BookLocale | null } | BookFail;
/** ถือใหม่จากหน้ายืนยัน (มติ W2): ปล่อยที่ถือของตะกร้าเดิมแล้วพากลับหน้าสินค้าพร้อมการเลือกเดิม */
export type BookReleaseResult = { ok: true; shopSlug: string; back: BookRehold } | BookFail;
export type BookReservationResult = { ok: true; vm: BookReservationVM } | BookFail;

// ═══════════════ ค่าคงที่ภายใน ═══════════════
const CLIENT_KEY_RE = /^pc_[0-9a-f]{40}$/;
const SECRET_MIN = 32;
const HOUR_MS = 3_600_000;
const K_RATE = "trips.public.rateLimits";
const K_HOLD_MIN = "trips.sell.holdMinutes";
const K_CONTACT = "trips.public.shopContact";
const K_LICENSE = "trips.license.fields";
const K_WAIVER = "trips.waiver.requiredFor";
const NOT_FOUND = (): BookFail => ({ ok: false, code: "NOT_FOUND" });
const fail = (code: BookErrorCode, extra?: Omit<BookFail, "ok" | "code">): BookFail => ({ ok: false, code, ...(extra ?? {}) });
const limiterDown = (): BookFail => ({ ok: false, code: "RATE_LIMITED", reason: "LIMITER_DOWN", retryAfterSec: BOOK_LIMITER_DOWN_RETRY_SEC });
const noClient = (): BookFail => ({ ok: false, code: "RATE_LIMITED", reason: "NO_CLIENT", retryAfterSec: BOOK_LIMITER_DOWN_RETRY_SEC });

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** อ่านช่องของ object จากผู้ใช้แบบไม่ throw (getter/Proxy) */
const field = (o: unknown, k: string): unknown => {
  try {
    return isRec(o) ? o[k] : undefined;
  } catch {
    return undefined;
  }
};
const str = (o: unknown, k: string): string | null => {
  const v = field(o, k);
  return typeof v === "string" ? v : null;
};
/** สำเนา object จากผู้ใช้เป็นสตริงล้วน (ทิ้งค่าอื่น · ไม่เกิน 200 คีย์) */
function plainForm(o: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    if (!isRec(o)) return out;
    let n = 0;
    for (const k of Object.keys(o)) {
      if (++n > 200) break;
      const v = o[k];
      if (typeof v === "string" && k.length <= 64 && v.length <= 4096) out[k] = v;
    }
  } catch {
    return {};
  }
  return out;
}
const nowOf = (o: BookFlowOpts | undefined): Date => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? o.now : new Date());
const queryOf = (o: BookFlowOpts | undefined): ((sql: unknown) => Promise<unknown[]>) =>
  typeof o?.deps?.query === "function" ? o.deps.query : (sql: unknown) => prisma.$queryRaw<unknown[]>(sql as Prisma.Sql);
const sha256hex = (s: string): string => createHash("sha256").update(s).digest("hex");
const intOf = (v: unknown): number | null => {
  const n = typeof v === "bigint" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
};
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

// ═══════════════ กุญแจ · ลายเซ็น ═══════════════
const secretOf = (): string | null => {
  const s = process.env.SESSION_SECRET;
  return typeof s === "string" && s.length >= SECRET_MIN ? s : null;
};
const mac = (secret: string, msg: string): Buffer => createHmac("sha256", secret).update(msg).digest();
/** ref สาธารณะของแถว (12 ตัว a-z2-7) — ผูกร้าน + ชนิด · ไม่ย้อนกลับเป็น id ได้ (สูตรเดียวกับตัวอ้างรอบ `t` ของหน้าสินค้า) */
const refOf = (secret: string, tenantId: string, kind: "product" | "extra" | "zone", id: string): string => bookPublicRef(secret, tenantId, kind, id);
const safeEq = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** ฟอร์มที่ nonce ใช้ได้ (มติ W5: MAC แยกโดเมน ถือ/ยืนยัน + ผูกร้าน) */
export type BookNonceScope = { tenantId: string; purpose: "hold" | "confirm" };
const nonceMsg = (rand: string, sec: string, scope: BookNonceScope): string => `trips.public.nonce.v2:${scope.purpose}:${scope.tenantId}:${rand}.${sec}`;
/**
 * nonce ของฟอร์ม = `<สุ่ม 22>.<วินาที>.<HMAC 22>` · ไม่มีกุญแจ ⇒ null
 * `scope` = ร้าน + ฟอร์ม (บังคับ · หน้าสินค้า = hold ผ่าน quoteBookSelection · หน้ายืนยัน = confirm ผ่าน loadBookCheckout)
 * ไม่มี scope/scope ผิดรูป ⇒ null — ไม่มีรูปที่ไม่ผูกร้าน/ฟอร์มอีกแล้ว (มติ Y7)
 */
export function issueBookFormNonce(opts?: { now?: Date; scope?: BookNonceScope }): string | null {
  const secret = secretOf();
  if (!secret) return null;
  const now = opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now : new Date();
  const sc = opts?.scope;
  const scope = sc && typeof sc.tenantId === "string" && sc.tenantId && (sc.purpose === "hold" || sc.purpose === "confirm") ? { tenantId: sc.tenantId, purpose: sc.purpose } : null;
  if (!scope) return null;
  const rand = randomBytes(16).toString("base64url");
  const sec = String(Math.floor(now.getTime() / 1000));
  return `${rand}.${sec}.${mac(secret, nonceMsg(rand, sec, scope)).toString("base64url").slice(0, 22)}`;
}
type NonceCheck = { ok: true; nonce: string } | { ok: false; code: "INVALID" | "TOO_FAST" | "STALE_FORM" };
/** ลายเซ็นต้องตรงโดเมนของฟอร์มนี้ที่ร้านนี้ (nonce ของร้านอื่น/ของอีกฟอร์ม/รูปที่ไม่ผูก scope ⇒ INVALID · มติ W5 Y7) */
function checkNonce(secret: string, v: unknown, now: Date, scope: BookNonceScope): NonceCheck {
  if (typeof v !== "string" || v.length > 80) return { ok: false, code: "INVALID" };
  const m = /^([A-Za-z0-9_-]{22})\.(\d{1,12})\.([A-Za-z0-9_-]{22})$/.exec(v);
  if (!m) return { ok: false, code: "INVALID" };
  const rand = m[1] ?? "";
  const sec = m[2] ?? "";
  const got = m[3] ?? "";
  if (!safeEq(mac(secret, nonceMsg(rand, sec, scope)).toString("base64url").slice(0, 22), got)) return { ok: false, code: "INVALID" };
  const age = Math.floor(now.getTime() / 1000) - Number(sec);
  if (age < BOOK_FORM_MIN_SEC) return { ok: false, code: "TOO_FAST" };
  if (age > BOOK_FORM_MAX_SEC) return { ok: false, code: "STALE_FORM" };
  return { ok: true, nonce: v };
}

/** ตัวอ้าง QR ของวอเชอร์ = `<รหัสการจอง>.<HMAC 16>` (ผูกร้าน · ไม่มี token/id/ข้อมูลบุคคล) */
export function bookVoucherQrPayload(tenantId: string, code: string): string | null {
  const secret = secretOf();
  if (!secret || typeof tenantId !== "string" || !tenantId || typeof code !== "string" || !/^[A-Za-z0-9-]{1,40}$/.test(code)) return null;
  return `${code}.${mac(secret, `trips.public.voucher.v1:${tenantId}:${code}`).toString("base64url").slice(0, 16)}`;
}
/** ตรวจ QR วอเชอร์ของร้านนี้ ⇒ รหัสการจอง · ผิด/ร้านอื่น ⇒ null */
export function verifyBookVoucherQr(tenantId: string, payload: unknown): string | null {
  if (typeof payload !== "string" || payload.length > 80) return null;
  const cut = payload.lastIndexOf(".");
  if (cut <= 0) return null;
  const code = payload.slice(0, cut);
  const want = bookVoucherQrPayload(tenantId, code);
  return want !== null && safeEq(want, payload) ? code : null;
}

// ═══════════════ sel (มติ R6 · R9) ═══════════════
type SelPayload = { p: string; s: string | null; n: [string, number][]; x: [string, number][]; z: string | null; q: string; t: number };
const selMac = (secret: string, tenantId: string, unitId: string, basketToken: string, part: string): string =>
  mac(secret, `trips.public.sel.v1:${tenantId}:${unitId}:${sha256hex(basketToken)}:${part}`).toString("base64url").slice(0, 22);
function makeSel(secret: string, tenantId: string, unitId: string, basketToken: string, p: SelPayload): string {
  const part = Buffer.from(JSON.stringify({ p: p.p, s: p.s, n: p.n, x: p.x, z: p.z, q: p.q, t: p.t }), "utf8").toString("base64url");
  return `v1.${part}.${selMac(secret, tenantId, unitId, basketToken, part)}`;
}
/** ตรวจลายเซ็นแล้วถอด · ผิด/ร้านอื่น/หน่วยอื่น/ตะกร้าอื่น ⇒ null (ผู้เรียกตอบ NOT_FOUND รูปเดียว) */
function readSel(secret: string, tenantId: string, unitId: string, basketToken: string, sel: string): SelPayload | null {
  const m = /^v1\.([A-Za-z0-9_-]{1,1000})\.([A-Za-z0-9_-]{22})$/.exec(sel);
  if (!m || sel.length > BOOK_SEL_MAX) return null;
  const part = m[1] ?? "";
  if (!safeEq(selMac(secret, tenantId, unitId, basketToken, part), m[2] ?? "")) return null;
  let j: unknown;
  try {
    j = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isRec(j)) return null;
  const pairs = (v: unknown, re: RegExp): [string, number][] | null => {
    if (!Array.isArray(v) || v.length > 50) return null;
    const out: [string, number][] = [];
    for (const x of v) {
      if (!Array.isArray(x) || x.length !== 2 || typeof x[0] !== "string" || !re.test(x[0]) || !isInt(x[1]) || x[1] < 1 || x[1] > BOOK_MAX_SEATS) return null;
      out.push([x[0], x[1]]);
    }
    return out;
  };
  const n = pairs(j.n, BOOK_PAX_CODE_RE);
  const x = pairs(j.x, BOOK_REF_RE);
  if (typeof j.p !== "string" || !BOOK_REF_RE.test(j.p) || !n || !x) return null;
  if (!(j.s === null || (typeof j.s === "string" && BOOK_SLOT_TOKEN_RE.test(j.s)))) return null;
  if (!(j.z === null || (typeof j.z === "string" && BOOK_REF_RE.test(j.z)))) return null;
  if (typeof j.q !== "string" || !/^[0-9a-f]{64}$/.test(j.q) || !isInt(j.t) || j.t < 0) return null;
  return { p: j.p, s: j.s, n, x, z: j.z, q: j.q, t: j.t };
}
const selectionOfSel = (p: SelPayload): BookSelection => ({ pax: p.n.map(([code, qty]) => ({ code, qty })), extras: p.x.map(([ref, qty]) => ({ ref, qty })), zone: p.z });

// ═══════════════ ด่านอัตรา (คำสั่ง SQL เดียวต่อด่าน · ปิดเมื่อพัง) ═══════════════
type Bucket = { name: string; key: string; limit: number; windowMs: number };
const retryOf = (ws: unknown, windowMs: number, nowMs: number): number => {
  const start = ws instanceof Date && Number.isFinite(ws.getTime()) ? ws.getTime() : nowMs;
  return Math.min(Math.ceil(windowMs / 1000), Math.max(1, Math.ceil((start + windowMs - nowMs) / 1000)));
};
/**
 * ถังหลายถังในคำสั่งเดียว (ถังถัดไปนับเมื่อถังก่อนผ่าน) + อ่านถังเดา token แบบไม่นับ (`peek`)
 * ผ่าน ⇒ null · เกิน ⇒ RATE_LIMITED LIMIT · คำสั่งล้ม/ไม่คืนเลขนับ ⇒ LIMITER_DOWN
 */
async function gate(buckets: readonly Bucket[], now: Date, opts: BookFlowOpts | undefined, peek?: { key: string; limit: number; windowMs: number }): Promise<BookFail | null> {
  const nowMs = now.getTime();
  let sql: Prisma.Sql;
  try {
    const ctes = buckets.map((b, i) => rateBucketCte(b.name, b.key, b.windowMs, nowMs, i > 0 ? { after: buckets[i - 1]?.name ?? "", limit: buckets[i - 1]?.limit ?? 0 } : undefined));
    const cols = buckets.map((b) => Prisma.sql`(SELECT "count" FROM ${Prisma.raw(b.name)}) AS ${Prisma.raw(`"${b.name}c"`)}, (SELECT "windowStart" FROM ${Prisma.raw(b.name)}) AS ${Prisma.raw(`"${b.name}w"`)}`);
    if (peek) {
      const cut = new Date(nowMs - peek.windowMs);
      cols.push(Prisma.sql`(SELECT CASE WHEN k."windowStart" > ${cut} THEN k."count" ELSE 0 END FROM "ChatRateBucket" k WHERE k."key" = ${peek.key}) AS "pkc", (SELECT k."windowStart" FROM "ChatRateBucket" k WHERE k."key" = ${peek.key}) AS "pkw"`);
    }
    sql = Prisma.sql`WITH ${Prisma.join(ctes, ", ")} SELECT ${Prisma.join(cols, ", ")}`;
  } catch {
    return limiterDown();
  }
  let rows: unknown;
  try {
    rows = await queryOf(opts)(sql);
  } catch {
    return limiterDown();
  }
  const row = Array.isArray(rows) && isRec(rows[0]) ? rows[0] : null;
  if (!row) return limiterDown();
  for (const b of buckets) {
    const c = intOf(row[`${b.name}c`]);
    if (c === null || c < 1) return limiterDown();
    if (c > b.limit) return { ok: false, code: "RATE_LIMITED", reason: "LIMIT", retryAfterSec: retryOf(row[`${b.name}w`], b.windowMs, nowMs) };
  }
  if (peek) {
    const raw = row.pkc;
    const c = raw === null || raw === undefined ? 0 : intOf(raw);
    if (c === null) return limiterDown();
    if (c >= peek.limit) return { ok: false, code: "RATE_LIMITED", reason: "LIMIT", retryAfterSec: retryOf(row.pkw, peek.windowMs, nowMs) };
  }
  return null;
}
const readBucket = (shop: BookShop, clientKey: string): Bucket => ({ name: "rb", key: `trips:book:${shop.tenantId}:${clientKey}`, limit: BOOK_READ_LIMIT.limit, windowMs: BOOK_READ_LIMIT.windowMs });
/** เพดาน X8 ของหน่วย (ถือที่/ชม./เครื่อง · เดา token/ชม./เครื่อง) — อ่านไม่ได้ ⇒ null (ผู้เรียกปิด) */
async function rateLimitsOf(tenantId: string, unitId: string, now: Date): Promise<{ hold: number; token: number } | null> {
  try {
    const v = (await resolveSettings({ tenantId }, [K_RATE], { unitId }, now))[K_RATE]?.value;
    const hold = field(v, "holdPerHourPerContact");
    const token = field(v, "tokenPerHourPerDevice");
    return isInt(hold) && hold >= 1 && isInt(token) && token >= 1 ? { hold, token } : null;
  } catch {
    return null;
  }
}

// ═══════════════ ร้าน · ส่วนต้นของทุกฟังก์ชัน ═══════════════
type Opened = { shop: BookShop; clientKey: string; now: Date; secret: string };
/** ข้อ 1–3 ของ §4: กุญแจเครื่อง → ร้าน (ไม่พบ ⇒ ถังเดา) → ถังอ่าน (+ถังเพิ่ม) */
async function openShop(i: unknown, opts: BookFlowOpts | undefined, extra?: (shop: BookShop) => Promise<{ buckets: Bucket[]; peek?: { key: string; limit: number; windowMs: number } } | null>): Promise<Opened | BookFail> {
  const clientKey = str(i, "clientKey");
  if (clientKey === null || !CLIENT_KEY_RE.test(clientKey)) return noClient();
  const r = await resolveBookShop(field(i, "shop"));
  if (!r.ok) return bookMiss(clientKey, opts);
  const now = nowOf(opts);
  const more = extra ? await extra(r.shop) : { buckets: [] };
  if (more === null) return limiterDown();
  const g = await gate([readBucket(r.shop, clientKey), ...more.buckets], now, opts, more.peek);
  if (g) return { ...g, shopSlug: r.shop.slug };
  const secret = secretOf();
  if (!secret) return fail("UNAVAILABLE", { shopSlug: r.shop.slug });
  return { shop: r.shop, clientKey, now, secret };
}
const isFail = (v: unknown): v is BookFail => isRec(v) && v.ok === false;
const ctxOf = (o: Opened, unitId: string, locale: BookLocale) => ({ tenantId: o.shop.tenantId, unitId, channel: "WEB" as const, actor: { kind: "PUBLIC" as const, clientKey: o.clientKey }, now: o.now, locale });
const unitOf = (shop: BookShop, unitId: string): { id: string; tz: string } | null => shop.units.find((u) => u.id === unitId) ?? null;
const localHm = (tz: string, d: Date): string => tripsHhmm(utcToLocal(tz, d).minutes);

/** ข้อมูลผู้ขายของร้าน (มติ R13): ชื่อร้าน + ช่องทางติดต่อจากค่าตั้ง (ว่าง = ไม่มีคีย์) · เลขใบอนุญาต (null ไม่บล็อก) */
async function shopInfoOf(shop: BookShop, unitId: string, now: Date): Promise<{ info: BookShopInfo; licenseNo: string | null }> {
  const info: BookShopInfo = { name: shop.name, contact: {} };
  let licenseNo: string | null = null;
  try {
    const r = await resolveSettings({ tenantId: shop.tenantId }, [K_CONTACT, K_LICENSE], { unitId }, now);
    const c = r[K_CONTACT]?.value;
    const phone = str(c, "phone");
    const line = str(c, "line");
    const address = str(c, "address");
    if (phone && phone.trim()) info.contact.phone = phone.trim();
    if (line && line.trim()) info.contact.line = line.trim();
    if (address && address.trim()) info.address = address.trim();
    const no = str(r[K_LICENSE]?.value, "number");
    licenseNo = no && no.trim() ? no.trim() : null;
  } catch {
    // ค่าตั้งอ่านไม่ได้ ⇒ แสดงชื่อร้านอย่างเดียว (ไม่บล็อกการจอง)
  }
  return { info, licenseNo };
}

// ═══════════════ การเลือก → บรรทัดของบริการ ═══════════════
type Mapped = { pax: { paxTypeId: string; qty: number }[]; extras: { extraId: string; qty: number }[]; zoneId: string | null; seatCodes: string[] };
/** ref/code ของการเลือก → id ของร้าน/หน่วย/สินค้านี้ (ประเภทคน/เสริม/โซน ที่ปิดแล้ว ⇒ ช่องผิด · ปิดหนี้ pricing.ts:184) */
function mapSelection(secret: string, tenantId: string, cat: BookCatalog, sel: BookSelection): { ok: true; m: Mapped } | { ok: false; fields: BookFormField[] } {
  const fields: BookFormField[] = [];
  const pax: Mapped["pax"] = [];
  for (const p of sel.pax) {
    const t = cat.paxTypes.find((x) => x.active && x.code === p.code);
    if (!t) {
      if (!fields.includes("pax")) fields.push("pax");
      continue;
    }
    pax.push({ paxTypeId: t.id, qty: p.qty });
  }
  const optional = cat.extras.filter((e) => e.active && e.productLevel && !e.mandatory);
  const extras: Mapped["extras"] = [];
  for (const x of sel.extras) {
    const e = optional.find((o) => refOf(secret, tenantId, "extra", o.id) === x.ref);
    if (!e) {
      if (!fields.includes("extras")) fields.push("extras");
      continue;
    }
    extras.push({ extraId: e.id, qty: x.qty });
  }
  let zoneId: string | null = null;
  if (sel.zone !== null) {
    const z = cat.zones.find((o) => o.active && refOf(secret, tenantId, "zone", o.id) === sel.zone);
    if (!z) fields.push("zone");
    else zoneId = z.id;
  }
  if (fields.length) return { ok: false, fields };
  return { ok: true, m: { pax, extras, zoneId, seatCodes: cat.paxTypes.filter((p) => p.active && p.seat).map((p) => p.code) } };
}
type LineReq = { productKind: "TRIP"; unitId: string; productId: string; slotId: string; optionId?: string; pax: { paxTypeId: string; qty: number }[]; extras?: { extraId: string; qty: number }[]; pickupZoneId?: string };
const lineOf = (unitId: string, productId: string, departureId: string, optionId: string | null, m: Pick<Mapped, "pax" | "extras" | "zoneId">): LineReq => ({
  productKind: "TRIP",
  unitId,
  productId,
  slotId: departureId,
  ...(optionId ? { optionId } : {}),
  pax: m.pax,
  ...(m.extras.length ? { extras: m.extras } : {}),
  ...(m.zoneId ? { pickupZoneId: m.zoneId } : {}),
});

// ═══════════════ บรรทัดเงิน (ตัวสรุปเดียว: ก่อนจอง = ใบเสนอราคา · หลังจอง = snapshot) ═══════════════
type PricedLike = { kind: string; paxTypeId: string | null; paxTypeCode: string | null; extraId: string | null; itemRef: string; qty: number; unitMinor: number; amountSatang: number; vatSatang: number; passThrough: boolean; usesCapacity: boolean };
type TotalsLike = { grossSatang: number; discountSatang: number; passThroughSatang: number; vatSatang: number; payableSatang: number };
/** บรรทัดของ snapshot/ใบเสนอราคา (JSON) ⇒ รูปที่ตรวจแล้ว · ผิดรูป ⇒ null */
function pricedOf(v: unknown): PricedLike[] | null {
  if (!Array.isArray(v)) return null;
  const out: PricedLike[] = [];
  for (const l of v) {
    if (!isRec(l) || typeof l.kind !== "string" || !isInt(l.qty) || !isInt(l.unitMinor) || !isInt(l.amountSatang)) return null;
    out.push({
      kind: l.kind,
      paxTypeId: typeof l.paxTypeId === "string" ? l.paxTypeId : null,
      paxTypeCode: typeof l.paxTypeCode === "string" ? l.paxTypeCode : null,
      extraId: typeof l.extraId === "string" ? l.extraId : null,
      itemRef: typeof l.itemRef === "string" ? l.itemRef : "",
      qty: l.qty,
      unitMinor: l.unitMinor,
      amountSatang: l.amountSatang,
      vatSatang: isInt(l.vatSatang) ? l.vatSatang : 0,
      passThrough: l.passThrough === true,
      usesCapacity: l.kind === "SEAT" && l.usesCapacity !== false,
    });
  }
  return out;
}
function totalsOf(v: unknown): TotalsLike | null {
  if (!isRec(v)) return null;
  const t = { grossSatang: v.grossSatang, discountSatang: v.discountSatang, passThroughSatang: v.passThroughSatang, vatSatang: v.vatSatang, payableSatang: v.payableSatang };
  return isInt(t.grossSatang) && isInt(t.discountSatang) && isInt(t.passThroughSatang) && isInt(t.vatSatang) && isInt(t.payableSatang)
    ? { grossSatang: t.grossSatang, discountSatang: t.discountSatang, passThroughSatang: t.passThroughSatang, vatSatang: t.vatSatang, payableSatang: t.payableSatang }
    : null;
}
const joinText = (a: BookText, b: BookText | null): BookText => (b && b.text ? { text: `${a.text ?? ""} · ${b.text}`.trim(), fallback: a.fallback || b.fallback } : a);
/**
 * บรรทัดที่ลูกค้าเห็น: ป้ายตามภาษาจากแคตตาล็อก (ประเภทคน/รายการเสริม/โซน) · ยอดของบรรทัด = ยอดของบริการตรงตัว
 * ร้านคิดภาษีเพิ่ม (payable > gross − discount) ⇒ บรรทัด VAT เดียว = payable − Σ บรรทัด (ที่เดียว · มติ R12 R16) · ผลรวมไม่ตรงด้วยเหตุอื่น ⇒ null (ไม่ปั้นเลข)
 */
function lineVMs(items: PricedLike[], totals: TotalsLike, cat: BookCatalog): { lines: BookLineVM[]; seats: number; added: boolean } | null {
  const lines: BookLineVM[] = [];
  let sum = 0;
  let seats = 0;
  for (const it of items) {
    if (it.kind !== "SEAT" && it.kind !== "EXTRA" && it.kind !== "PICKUP") return null;
    const paxOf = (id: string | null, code: string | null) => cat.paxTypes.find((p) => (id !== null && p.id === id) || (id === null && code !== null && p.code === code)) ?? null;
    let label: BookText = { text: null, fallback: false };
    if (it.kind === "SEAT") {
      const p = paxOf(it.paxTypeId, it.paxTypeCode);
      label = p ? p.label : { text: it.paxTypeCode, fallback: false };
      if (it.usesCapacity) seats += it.qty;
    } else if (it.kind === "EXTRA") {
      const e = cat.extras.find((x) => x.id === it.extraId);
      const p = it.paxTypeCode !== null ? paxOf(null, it.paxTypeCode) : null;
      label = joinText(e ? e.name : { text: null, fallback: false }, p ? p.label : null);
    } else {
      const zoneId = it.itemRef.startsWith("pickup:") ? it.itemRef.slice("pickup:".length) : "";
      const z = cat.zones.find((x) => x.id === zoneId);
      label = z ? z.name : { text: null, fallback: false };
    }
    lines.push({ kind: it.kind, label, qty: it.qty, unitSatang: it.unitMinor, amountSatang: it.amountSatang, passThrough: it.passThrough });
    sum += it.amountSatang;
  }
  const added = totals.vatSatang > 0 && totals.payableSatang > totals.grossSatang - totals.discountSatang;
  const diff = totals.payableSatang - sum;
  if (diff !== 0) {
    if (!added || diff < 0) return null;
    lines.push({ kind: "VAT", label: { text: null, fallback: false }, qty: 1, unitSatang: diff, amountSatang: diff, passThrough: false });
  }
  return { lines, seats, added };
}

// ═══════════════ แปลงรหัสของบริการ (ตาราง R9) ═══════════════
type SellFailLike = { ok: false; code: string; details?: Record<string, unknown> };
const payableOfQuote = (q: unknown): number | null => {
  const v = field(field(field(q, "totals"), "payable"), "satang");
  return isInt(v) ? v : null;
};
function mapService(r: SellFailLike): BookFail {
  const d = isRec(r.details) ? r.details : {};
  switch (r.code) {
    case "HOLD_LIMIT":
      // T0.4d D1: เพดานที่ถือยังไม่จ่ายของรอบ (ไม่ใช่เพดานของเบอร์) ⇒ SLOT_BUSY + เวลารอ (ไม่บอกจำนวนที่นั่ง) · ทั้งเส้นถือและเส้นยืนยัน
      if (d.reason === "PUBLIC_UNPAID_SHARE") return fail("SLOT_BUSY", isInt(d.retryAfterSec) && d.retryAfterSec > 0 ? { retryAfterSec: d.retryAfterSec } : undefined);
      return fail(r.code);
    case "SOLD_OUT":
    case "CUTOFF_PASSED":
    case "SLOT_CLOSED":
    case "HOLD_EXPIRED":
      return fail(r.code);
    case "PRICE_CHANGED": {
      const total = payableOfQuote(d.quote);
      return fail("PRICE_CHANGED", total !== null ? { totalSatang: total } : undefined);
    }
    case "IDEMPOTENCY_CONFLICT":
      return fail("STALE_FORM");
    case "VALIDATION": {
      if (d.reason === "BASKET_TOKEN_USED") return fail("STALE_FORM");
      const ours = Array.isArray(d.fields) ? BOOK_FORM_FIELDS.filter((f) => (d.fields as unknown[]).includes(f)) : [];
      return ours.length ? fail("INVALID", { fields: ours }) : fail("UNAVAILABLE");
    }
    case "NOT_FOUND":
    case "HOLD_NOT_FOUND":
    case "FORBIDDEN":
      return NOT_FOUND();
    default:
      return fail("BUSY");
  }
}

// ═══════════════ รอบของวัน ═══════════════
/**
 * รอบที่หน้าสินค้าอ้าง (GET · quoteBookSelection เท่านั้น): ตัวอ้างตรง (ref ของ id รอบ · มติ W5) ⇒ รอบนั้น · ไม่งั้นรอบแรกที่ขายได้ · ไม่มี ⇒ รอบแรก
 * ฟอร์มถือ (POST) ไม่ใช้ตัวนี้ — ต้องมี `t` ที่ชี้รอบจริง (มติ W7 Y2)
 */
function chooseSlot(tenantId: string, day: BookDaySlot[], token: string | null): { slot: BookDaySlot; token: string | null } | null {
  if (!day.length) return null;
  // มติ Y3: รอบที่ลูกค้าแยกจากกันไม่ได้ (เวลาออก · ช่วงเวลา · ชื่อตัวเลือก ซ้ำกันในวันเดียว) ไม่มีตัวอ้าง — กติกาเดียวกับหน้าสินค้า (slotTokensOfDay)
  const keyOf = (s: BookDaySlot): string => JSON.stringify([Date.parse(s.startsAt), s.timeText, s.optionName.text, s.optionName.fallback]);
  const seen = new Map<string, number>();
  for (const s of day) seen.set(keyOf(s), (seen.get(keyOf(s)) ?? 0) + 1);
  const tokens = day.map((s) => ((seen.get(keyOf(s)) ?? 0) > 1 ? null : bookSlotToken(tenantId, s.departureId)));
  const byToken = token === null ? -1 : tokens.findIndex((t) => t !== null && t === token);
  const sellable = day.findIndex((s) => s.saleBlock === null && s.publicLeft > 0);
  const i = byToken >= 0 ? byToken : sellable >= 0 ? sellable : 0;
  const slot = day[i];
  return slot ? { slot, token: tokens[i] ?? null } : null;
}
const blockCode = (b: string | null): BookErrorCode | null => (b === null ? null : b === "CUTOFF" || b === "STARTED" ? "CUTOFF_PASSED" : "SLOT_CLOSED");

// ═══════════════ ตัวเลือก (ราคาต่อหน่วยจากบริการราคา · คนเดียวต่อใบเสนอ แบบ W1.1 X3) ═══════════════
type QuoteCtx = ReturnType<typeof ctxOf>;
type Priced = Extract<Awaited<ReturnType<typeof quoteTripLine>>, { ok: true }>["value"];
const addedOf = (v: Priced): boolean => v.totals.vatSatang > 0 && v.totals.payableSatang > v.totals.grossSatang - v.totals.discountSatang;
/** ราคาต่อหน่วยที่แสดง: ร้านคิดภาษีเพิ่ม ⇒ ยอดจ่ายจริงของบรรทัดจำนวน 1 (สุทธิ + ภาษีของบรรทัด · ทั้งคู่จากบริการ · มติ X12) */
const unitShown = (it: Priced["items"][number], added: boolean): number => (added && it.qty === 1 ? it.amountSatang + it.vatSatang : it.unitMinor);
async function optionsOf(o: Opened, ctx: QuoteCtx, base: { unitId: string; productId: string; slot: BookDaySlot; token: string | null }, cat: BookCatalog): Promise<BookOptionsVM | null> {
  const q = async (pax: { paxTypeId: string; qty: number }[], extras: { extraId: string; qty: number }[]): Promise<Priced | null> => {
    const r = await quoteTripLine(ctx, lineOf(base.unitId, base.productId, base.slot.departureId, base.slot.optionId, { pax, extras, zoneId: null }));
    return r.ok && r.value.currency === "THB" ? r.value : null;
  };
  const active = cat.paxTypes.filter((p) => p.active);
  const solo = await Promise.all(active.map((p) => q([{ paxTypeId: p.id, qty: 1 }], [])));
  const lead = active.find((p, k) => p.seat && solo[k]?.items.some((i) => i.kind === "SEAT" && i.paxTypeId === p.id)) ?? null;
  const pax: BookOptionsVM["pax"] = [];
  for (let k = 0; k < active.length; k++) {
    const p = active[k];
    if (!p) continue;
    let v = solo[k] ?? null;
    if (!v && !p.seat && lead) v = await q([{ paxTypeId: lead.id, qty: 1 }, { paxTypeId: p.id, qty: 1 }], []);
    const it = v?.items.find((i) => i.kind === "SEAT" && i.paxTypeId === p.id && i.qty === 1);
    if (!v || !it) continue; // ประเภทคนที่ยังไม่มีราคา ⇒ ไม่แสดงแถวนั้น (W1.1 X7)
    pax.push({ code: p.code, label: p.label, ageMin: p.ageMin, ageMax: p.ageMax, seat: p.seat, unitSatang: unitShown(it, addedOf(v)) });
  }
  if (!pax.some((p) => p.seat) || !lead) return null;
  const optional = cat.extras.filter((e) => e.active && e.productLevel && !e.mandatory);
  const withExtras = optional.length ? await q([{ paxTypeId: lead.id, qty: 1 }], optional.map((e) => ({ extraId: e.id, qty: 1 }))) : null;
  const extras: BookOptionsVM["extras"] = [];
  for (const e of optional) {
    const it = withExtras?.items.find((i) => i.kind === "EXTRA" && i.extraId === e.id && i.qty === 1);
    if (!withExtras || !it) continue;
    extras.push({ ref: refOf(o.secret, o.shop.tenantId, "extra", e.id), name: e.name, note: e.note, basis: e.basis, unitSatang: unitShown(it, addedOf(withExtras)) });
  }
  const zones: BookOptionsVM["zones"] = cat.zones
    .filter((z) => z.active)
    .map((z) => ({ ref: refOf(o.secret, o.shop.tenantId, "zone", z.id), kind: z.kind, name: z.name, areas: z.areas, surchargeSatang: z.surchargeSatang }));
  return { pax, extras, zones, maxSeats: BOOK_MAX_SEATS, left: base.slot.publicLeft, slot: { token: base.token, timeText: base.slot.timeText } };
}

/**
 * เวลาถือของช่องทาง WEB = `trips.sell.holdMinutes` ที่ขอบเขตเดียวกับบริการ (capacity-service policiesFor: หน่วย/สินค้า/รอบ · chain U_P · hold PAYMENT)
 * อ่านไม่ได้/ผิดรูป ⇒ null (ผู้เรียกปิด)
 */
async function holdMinutesOf(tenantId: string, unitId: string, productId: string, departureId: string | null, now: Date): Promise<number | null> {
  try {
    const v = (await resolveSettings({ tenantId }, [K_HOLD_MIN], { unitId, productId, ...(departureId ? { departureId } : {}) }, now))[K_HOLD_MIN]?.value;
    return isInt(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** สรุปยอดของการเลือก (quoteTripLine · บรรทัดมี id ให้ติดป้ายตามภาษา) */
async function summaryOf(ctx: QuoteCtx, line: LineReq, cat: BookCatalog, meta: { date: string; token: string | null; timeText: string; tenantId: string }): Promise<{ ok: true; s: BookSummaryVM } | BookFail> {
  const r = await quoteTripLine(ctx, line);
  if (!r.ok) return mapService(r);
  const v = r.value;
  if (v.currency !== "THB") return fail("UNAVAILABLE");
  const built = lineVMs(pricedOf(v.items) ?? [], v.totals, cat);
  const hm = await holdMinutesOf(meta.tenantId, line.unitId, line.productId, line.slotId, ctx.now);
  if (!built || hm === null) return fail("UNAVAILABLE");
  return {
    ok: true,
    s: {
      date: meta.date,
      slotToken: meta.token,
      timeText: meta.timeText,
      seats: built.seats,
      lines: built.lines,
      totalSatang: v.totals.payableSatang,
      passThroughSatang: v.totals.passThroughSatang,
      vatNote: v.totals.vatSatang === 0 ? "NONE" : built.added ? "ADDED" : "INCLUDED",
      cancelRows: cancelRowsOf(v.cancelLadder),
      holdMinutes: hm,
      fillMinutes: bookFillMinutes(hm),
    },
  };
}

/**
 * มติ Y1: ร้านตั้งเวลาถือ WEB สั้นกว่า BOOK_HOLD_MIN_SEC (< 10 นาที) ⇒ ไม่ให้ถือตั้งแต่ต้น (ไม่ออก nonce · ไม่กินถังถือ · ไม่เรียกบริการ)
 * ใช้คู่กับด่าน "เปิดปุ่ม" ของ openProduct · อ่านค่าตั้งไม่ได้ ⇒ UNAVAILABLE (ปิดเมื่อพัง)
 */
async function holdTimeGate(o: OpenedProduct): Promise<BookFail | null> {
  const hm = await holdMinutesOf(o.shop.tenantId, o.unit.id, o.productId, null, o.now);
  if (hm === null) return fail("UNAVAILABLE");
  return bookHoldTooShort(hm) ? fail("UNAVAILABLE", { reason: "HOLD_TOO_SHORT" }) : null;
}

// ═══════════════ 1) เลือก: ตัวเลือก + สรุปยอด ═══════════════
/** หน้าสินค้า: ตัวเลือกของรอบที่เลือก (ประเภทคน/รายการเสริม/โซน + ราคาต่อหน่วย) + สรุปยอดของการเลือก (null = ยังไม่เลือกคน) · อ่านอย่างเดียว */
export async function quoteBookSelection(input: { shop: unknown; productSlug: unknown; query?: unknown; acceptLanguage?: unknown; clientKey: unknown }, opts?: BookFlowOpts): Promise<BookQuoteResult> {
  try {
    const o = await openProduct(input, opts);
    if (isFail(o)) return o;
    const short = await holdTimeGate(o);
    if (short) return { ...short, shopSlug: o.shop.slug };
    const q = field(input, "query");
    const locale = bookLocaleOf(str(q, "lang"), field(input, "acceptLanguage"));
    const d = str(q, "d");
    if (!isBookYmd(d)) return fail("INVALID", { fields: ["d"] });
    const sel = parseBookSelection(plainSelection(q));
    if (!sel) return fail("INVALID", { fields: selectionFieldsOf(plainSelection(q)) });
    const day = await loadBookDay({ tenantId: o.shop.tenantId, unitId: o.unit.id, productId: o.productId, tz: o.unit.tz }, d, { now: o.now, locale });
    if (!day) return fail("UNAVAILABLE");
    const chosen = chooseSlot(o.shop.tenantId, day, slotParam(q));
    if (!chosen) return fail("INVALID", { fields: ["d"] });
    const cat = await loadBookCatalog({ tenantId: o.shop.tenantId, unitId: o.unit.id, productId: o.productId }, locale);
    const ctx = ctxOf(o, o.unit.id, locale);
    const mapped = mapSelection(o.secret, o.shop.tenantId, cat, sel);
    if (!mapped.ok) return fail("INVALID", { fields: mapped.fields });
    if (sel.pax.length && !selectionSeatsOk(sel, mapped.m.seatCodes, BOOK_MAX_SEATS)) return fail("INVALID", { fields: ["pax"] });
    const options = await optionsOf(o, ctx, { unitId: o.unit.id, productId: o.productId, slot: chosen.slot, token: chosen.token }, cat);
    if (!options) return fail("UNAVAILABLE");
    const { info } = await shopInfoOf(o.shop, o.unit.id, o.now);
    if (!sel.pax.length) return { ok: true, options, summary: null, nonce: null, shop: info };
    const s = await summaryOf(ctx, lineOf(o.unit.id, o.productId, chosen.slot.departureId, chosen.slot.optionId, mapped.m), cat, { date: d, token: chosen.token, timeText: chosen.slot.timeText, tenantId: o.shop.tenantId });
    if (!s.ok) return s.code === "NOT_FOUND" ? NOT_FOUND() : s;
    return { ok: true, options, summary: s.s, nonce: issueBookFormNonce({ now: o.now, scope: { tenantId: o.shop.tenantId, purpose: "hold" } }), shop: info };
  } catch {
    return fail("BUSY");
  }
}
/** เฉพาะคีย์ของการเลือก (n.* x.* z) ที่เป็นสตริง — ค่าอื่นทำให้ parseBookSelection ได้ null ตามตั้งใจ */
function plainSelection(q: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    if (!isRec(q)) return out;
    for (const k of Object.keys(q)) if (k === "z" || k.startsWith("n.") || k.startsWith("x.")) out[k] = q[k];
  } catch {
    return {};
  }
  return out;
}
const slotParam = (q: unknown): string | null => {
  const t = str(q, "t");
  return t !== null && BOOK_SLOT_TOKEN_RE.test(t) ? t : null;
};
type OpenedProduct = Opened & { productId: string; productSlug: string; unit: { id: string; tz: string } };
/** ร้าน + สินค้าที่มองเห็น (ไม่พบ ⇒ ถังเดา) → ถังอ่าน → ปุ่มจองเปิดไหม */
async function openProduct(input: unknown, opts: BookFlowOpts | undefined, extra?: (shop: BookShop) => Promise<{ buckets: Bucket[] } | null>): Promise<OpenedProduct | BookFail> {
  const clientKey = str(input, "clientKey");
  if (clientKey === null || !CLIENT_KEY_RE.test(clientKey)) return noClient();
  const r = await resolveBookShop(field(input, "shop"));
  if (!r.ok) return bookMiss(clientKey, opts);
  const p = await bookVisibleProduct(r.shop, field(input, "productSlug"));
  if (!p) return bookMiss(clientKey, opts);
  const now = nowOf(opts);
  const more = extra ? await extra(r.shop) : { buckets: [] };
  if (more === null) return limiterDown();
  const where = { shopSlug: r.shop.slug, back: { productSlug: p.productSlug, query: {} } };
  const g = await gate([readBucket(r.shop, clientKey), ...more.buckets], now, opts);
  if (g) return { ...g, ...where };
  const secret = secretOf();
  if (!secret) return fail("UNAVAILABLE", where);
  const st = await bookSaleState({ tenantId: r.shop.tenantId, unitId: p.unit.id, productId: p.productId }, now);
  if (st === "BOOKING_OFF" || st === "SHOP_CONFIRMS") return fail("UNAVAILABLE", { reason: st, ...where });
  if (st !== "OPEN") return fail("UNAVAILABLE", where);
  return { shop: r.shop, clientKey, now, secret, productId: p.productId, productSlug: p.productSlug, unit: p.unit };
}

// ═══════════════ 2) ถือที่ ═══════════════
/** ฟอร์มของหน้าสินค้า ⇒ ถือที่ (holdTrips) · nonce เดิม = ตะกร้าเดิม (ส่งซ้ำ/ยิงพร้อมกันได้ผลเดียว) */
export async function startBookHold(input: { shop: unknown; productSlug: unknown; form: unknown; acceptLanguage?: unknown; clientKey: unknown }, opts?: BookFlowOpts): Promise<BookHoldResult> {
  try {
    const form = plainForm(field(input, "form"));
    const d = isBookYmd(form.d) ? form.d : null;
    const selRaw = parseBookSelection(plainSelection(form));
    const backQuery: Record<string, string> = {
      ...(form.lang === "th" || form.lang === "en" ? { lang: form.lang } : {}),
      ...(d ? { m: d.slice(0, 7), d } : {}),
      ...(slotParam(form) ? { t: slotParam(form) ?? "" } : {}),
      ...(selRaw ? selectionQuery(selRaw) : {}),
    };
    const lang: BookLocale | null = form.lang === "th" || form.lang === "en" ? form.lang : null;
    const o = await openProduct(input, opts);
    if (isFail(o)) return o.back ? { ...o, back: { productSlug: o.back.productSlug, query: backQuery }, lang } : o;
    const locale = bookLocaleOf(lang, field(input, "acceptLanguage"));
    const back: BookRehold = { productSlug: o.productSlug, query: backQuery };
    const withBack = (f: BookFail): BookFail => (f.code === "NOT_FOUND" ? NOT_FOUND() : { ...f, shopSlug: o.shop.slug, back, lang });
    // ข้อ 4 (ต่อ · มติ Y1): เวลาถือของร้านสั้นเกิน ⇒ ปิดก่อนถังถือ/บริการ
    const short = await holdTimeGate(o);
    if (short) return withBack(short);
    // ข้อ 5: ฟอร์ม (ผิด = ไม่กินโควตาถือ ไม่เรียกบริการ)
    const nc = checkNonce(o.secret, form.nonce, o.now, { tenantId: o.shop.tenantId, purpose: "hold" });
    if (!nc.ok) return withBack(nc.code === "INVALID" ? fail("INVALID", { fields: ["nonce"] }) : fail(nc.code));
    const seenRaw = form.seen;
    if (typeof seenRaw !== "string" || !/^\d{1,12}$/.test(seenRaw)) return withBack(fail("INVALID", { fields: ["seen"] }));
    const seen = Number(seenRaw);
    if (!d) return withBack(fail("INVALID", { fields: ["d"] }));
    if (!selRaw) return withBack(fail("INVALID", { fields: selectionFieldsOf(plainSelection(form)) }));
    if (!selRaw.pax.length) return withBack(fail("INVALID", { fields: ["pax"] }));
    // มติ Y2 (ปิด W7): ฟอร์มถือต้องระบุรอบ — ไม่มี `t` ⇒ INVALID(t) · ไม่ถอยไปรอบแรกที่ขายได้ (ทางสำรองนั้นมีเฉพาะ GET · quoteBookSelection)
    const askedSlot = typeof form.t === "string" && form.t !== "" ? form.t : null;
    if (askedSlot === null) return withBack(fail("INVALID", { fields: ["t"] }));
    // ข้อ 6: ref → id
    const day = await loadBookDay({ tenantId: o.shop.tenantId, unitId: o.unit.id, productId: o.productId, tz: o.unit.tz }, d, { now: o.now, locale });
    if (!day) return withBack(fail("UNAVAILABLE"));
    // ตัวอ้างรอบต้องชี้รอบจริงของวันนั้น — หาไม่เจอ (รอบถูกลบ/ไม่อยู่ในรายการขายแล้ว/รูปเดิม HHMM จากหน้าที่เปิดค้าง) ⇒ SLOT_CLOSED กลับหน้าสินค้า
    // ห้ามถอยไปถือรอบอื่น (มติ W7 · คู่ W5) · พบแต่ขายไม่ได้ ⇒ blockCode ข้างล่าง
    const k = BOOK_SLOT_TOKEN_RE.test(askedSlot) ? day.findIndex((x) => bookSlotToken(o.shop.tenantId, x.departureId) === askedSlot) : -1;
    const slot = k >= 0 ? day[k] : undefined;
    if (!slot) return withBack(fail("SLOT_CLOSED"));
    const chosen = { slot, token: askedSlot };
    const cat = await loadBookCatalog({ tenantId: o.shop.tenantId, unitId: o.unit.id, productId: o.productId }, locale);
    const mapped = mapSelection(o.secret, o.shop.tenantId, cat, selRaw);
    if (!mapped.ok) return withBack(fail("INVALID", { fields: mapped.fields }));
    if (!selectionSeatsOk(selRaw, mapped.m.seatCodes, BOOK_MAX_SEATS)) return withBack(fail("INVALID", { fields: ["pax"] }));
    const blocked = blockCode(chosen.slot.saleBlock);
    if (blocked) return withBack(fail(blocked));
    // ตะกร้าของ nonce นี้ (มติ W2): มีแล้ว ⇒ ส่งซ้ำ/ดับเบิลคลิก — ข้ามถัง แล้ววิ่งเส้นผลซ้ำของ holdTrips (คีย์เดิม ⇒ ผลเดิม · คำขอต่าง ⇒ STALE_FORM)
    // มติ Y7: ตะกร้ายังไม่ยืนยันแต่ไม่มีที่ถือที่ยังมีผล (ปล่อยแล้วด้วย "ถือใหม่"/หมดเวลา) ⇒ ฟอร์มนี้ใช้ไม่ได้แล้ว STALE_FORM กลับหน้าสินค้า
    const basketToken = mac(o.secret, `trips.public.basket.v1:${o.shop.tenantId}:${nc.nonce}`).toString("base64url");
    const existing = await findBookBasket({ tenantId: o.shop.tenantId, unitIds: o.shop.units.map((u) => u.id) }, sha256hex(basketToken));
    if (existing && existing.status !== "CHECKED_OUT" && !existing.holds.some((x) => x.status === "ACTIVE" && Date.parse(x.expiresAt) > o.now.getTime())) {
      return withBack(fail("STALE_FORM"));
    }
    // ข้อ 8 (ก่อนถังถือ · มติ Y4): ยอดที่ลูกค้าเห็นต้องเท่ายอดของบริการตอนนี้ (มติ R6) — ราคาเปลี่ยน ⇒ PRICE_CHANGED โดยไม่เสียโควตาถือ (ถังอ่านนับแล้ว)
    const ctx = ctxOf(o, o.unit.id, locale);
    const line = lineOf(o.unit.id, o.productId, chosen.slot.departureId, chosen.slot.optionId, mapped.m);
    const qt = await quoteTrips(ctx, { lines: [line] });
    if (!qt.ok) return withBack(mapService(qt));
    const payable = qt.value.totals.payable.satang;
    if (qt.value.totals.payable.currency !== "THB" || !isInt(payable)) return withBack(fail("UNAVAILABLE"));
    if (payable !== seen) return withBack(fail("PRICE_CHANGED", { totalSatang: payable }));
    // ข้อ 7: ถังถือต่อเครื่อง (X8) + ถังต่อรอบต่อเครื่อง (R7 · มติ W2: นับเฉพาะตะกร้าใหม่) — คำสั่งเดียว ปิดเมื่อพัง
    // เต็มจริง ⇒ holdLimited (ข้อความ "เครื่องนี้ถือที่รอบนี้หลายครั้งแล้ว" · มติ Y5) · ค่าตั้งอ่านไม่ได้/ด่านล่ม ⇒ ข้อความกลาง
    if (!existing) {
      const lim = await rateLimitsOf(o.shop.tenantId, o.unit.id, o.now);
      if (!lim) return withBack(limiterDown());
      const hg = await gate(
        [
          { name: "hb", key: `trips:hold:${o.shop.tenantId}:${o.clientKey}`, limit: lim.hold, windowMs: HOUR_MS },
          { name: "sb", key: `trips:slot:${o.shop.tenantId}:${chosen.slot.departureId}:${o.clientKey}`, limit: BOOK_SLOT_HOLD_PER_HOUR, windowMs: HOUR_MS },
        ],
        o.now,
        opts,
      );
      if (hg) return withBack(hg.reason === "LIMIT" ? { ...hg, holdLimited: true } : hg);
    }
    const h = await holdTrips(ctx, { quote: { lines: [line] }, quoteId: qt.value.quoteId, quoteExpiresAt: qt.value.expiresAt, idempotencyKey: `bh_${sha256hex(nc.nonce).slice(0, 64)}`, basketToken });
    if (!h.ok) return withBack(mapService(h));
    const sel = makeSel(o.secret, o.shop.tenantId, o.unit.id, basketToken, {
      p: refOf(o.secret, o.shop.tenantId, "product", o.productId),
      s: chosen.token,
      n: selRaw.pax.map((p) => [p.code, p.qty]),
      x: selRaw.extras.map((x) => [x.ref, x.qty]),
      z: selRaw.zone,
      q: qt.value.quoteId,
      t: payable,
    });
    return { ok: true, basketToken, sel, expiresAt: h.value.expiresAt, shopSlug: o.shop.slug, lang };
  } catch {
    return fail("BUSY");
  }
}

// ═══════════════ ตะกร้าจาก token + sel (หน้ายืนยัน · ยืนยัน) ═══════════════
type Held = {
  o: Opened;
  unit: { id: string; tz: string };
  basket: NonNullable<Awaited<ReturnType<typeof findBookBasket>>>;
  payload: SelPayload;
  dep: BookDepartureRow;
  basketToken: string;
  rehold: BookRehold;
};
/** token ตะกร้า + sel ⇒ ตะกร้าของร้านนี้ (ลายเซ็นถูก · สินค้าตรง) — ผิดทุกกรณี ⇒ NOT_FOUND รูปเดียว */
async function heldBasket(o: Opened, basketToken: unknown, sel: unknown, locale: BookLocale, lang: string | null): Promise<Held | BookFail> {
  if (typeof basketToken !== "string" || !BOOK_BASKET_TOKEN_RE.test(basketToken) || typeof sel !== "string" || sel.length > BOOK_SEL_MAX) return NOT_FOUND();
  const basket = await findBookBasket({ tenantId: o.shop.tenantId, unitIds: o.shop.units.map((u) => u.id) }, sha256hex(basketToken));
  if (!basket || basket.channel !== "WEB" || basket.holds.length !== 1) return NOT_FOUND();
  const unit = unitOf(o.shop, basket.unitId);
  if (!unit) return NOT_FOUND();
  const payload = readSel(o.secret, o.shop.tenantId, unit.id, basketToken, sel);
  if (!payload) return NOT_FOUND();
  const dep = await loadBookDeparture({ tenantId: o.shop.tenantId, unitId: unit.id, tz: unit.tz }, basket.holds[0]?.departureId ?? "", locale);
  if (!dep || refOf(o.secret, o.shop.tenantId, "product", dep.productId) !== payload.p) return NOT_FOUND();
  const rehold: BookRehold = {
    productSlug: dep.product.slug,
    query: { ...(lang === "th" || lang === "en" ? { lang } : {}), m: dep.localDate.slice(0, 7), d: dep.localDate, ...(payload.s ? { t: payload.s } : {}), ...selectionQuery(selectionOfSel(payload)) },
  };
  return { o, unit, basket, payload, dep, basketToken, rehold };
}
/** ตะกร้ายืนยันแล้ว ⇒ DONE + token ของการจองในตะกร้า */
function doneOf(h: Held): BookFail | null {
  if (h.basket.status !== "CHECKED_OUT") return null;
  const id = h.basket.bookingIds[0];
  const token = id ? bookingPublicToken(id) : null;
  return token ? { ok: false, code: "DONE", token, shopSlug: h.o.shop.slug } : fail("UNAVAILABLE");
}
/**
 * ที่ถือยังใช้ยืนยันได้ ⇒ เวลาหมด · หมด/ตะกร้าไม่ OPEN ⇒ null
 * มติ W1: เหลือเวลาถือ < BOOK_HOLD_USABLE_SEC (ระยะ "อย่าโอน" + เวลากรอก/โอน) ⇒ ถือว่าหมดแล้ว — ไม่สร้างการจองที่จ่ายไม่ทัน
 */
function holdUntilOf(h: Held): string | null {
  if (h.basket.status !== "OPEN") return null;
  const usableFrom = h.o.now.getTime() + BOOK_HOLD_USABLE_SEC * 1000;
  const live = h.basket.holds.filter((x) => x.status === "ACTIVE" && Date.parse(x.expiresAt) > usableFrom);
  if (live.length !== h.basket.holds.length || !live.length) return null;
  return live.map((x) => x.expiresAt).sort()[0] ?? null;
}
async function lineOfHeld(h: Held, locale: BookLocale): Promise<{ ok: true; line: LineReq; cat: BookCatalog } | { ok: false; fields: BookFormField[] }> {
  const cat = await loadBookCatalog({ tenantId: h.o.shop.tenantId, unitId: h.unit.id, productId: h.dep.productId }, locale);
  const mapped = mapSelection(h.o.secret, h.o.shop.tenantId, cat, selectionOfSel(h.payload));
  if (!mapped.ok) return mapped;
  return { ok: true, line: lineOf(h.unit.id, h.dep.productId, h.dep.departureId, h.dep.optionId, mapped.m), cat };
}

// ═══════════════ 3) หน้ายืนยัน ═══════════════
/** หน้ายืนยัน (ผู้จอง + สรุป + ผู้ขาย + ยอมรับ) — ราคาเปลี่ยนตั้งแต่ถือ ⇒ PRICE_CHANGED (ยอดเดิม + ยอดใหม่ + ลิงก์ถือใหม่ · ห้ามแสดงยอดใหม่เงียบ ๆ) */
export async function loadBookCheckout(input: { shop: unknown; basketToken: unknown; sel: unknown; lang?: unknown; acceptLanguage?: unknown; clientKey: unknown }, opts?: BookFlowOpts): Promise<BookCheckoutResult> {
  try {
    const o = await openShop(input, opts);
    if (isFail(o)) return o;
    const lang = str(input, "lang");
    const locale = bookLocaleOf(lang, field(input, "acceptLanguage"));
    const h = await heldBasket(o, field(input, "basketToken"), field(input, "sel"), locale, lang);
    if (isFail(h)) return h;
    const done = doneOf(h);
    if (done) return done;
    const st = await bookSaleState({ tenantId: o.shop.tenantId, unitId: h.unit.id, productId: h.dep.productId }, o.now);
    if (st !== "OPEN") return fail("UNAVAILABLE", { shopSlug: o.shop.slug, ...(st === "BOOKING_OFF" || st === "SHOP_CONFIRMS" ? { reason: st } : {}) });
    const holdUntil = holdUntilOf(h);
    if (!holdUntil) return fail("HOLD_EXPIRED", { shopSlug: o.shop.slug, rehold: h.rehold });
    const l = await lineOfHeld(h, locale);
    if (!l.ok) return fail("UNAVAILABLE", { shopSlug: o.shop.slug, rehold: h.rehold });
    const ctx = ctxOf(o, h.unit.id, locale);
    const qt = await quoteTrips(ctx, { lines: [l.line] });
    if (!qt.ok) return { ...mapService(qt), ...(qt.code === "NOT_FOUND" ? {} : { shopSlug: o.shop.slug }) };
    const payable = qt.value.totals.payable.satang;
    if (qt.value.quoteId !== h.payload.q) return fail("PRICE_CHANGED", { heldTotalSatang: h.payload.t, totalSatang: payable, rehold: h.rehold, shopSlug: o.shop.slug });
    const s = await summaryOf(ctx, l.line, l.cat, { date: h.dep.localDate, token: h.payload.s, timeText: h.dep.timeText, tenantId: o.shop.tenantId });
    if (!s.ok) return s.code === "NOT_FOUND" ? NOT_FOUND() : { ...s, shopSlug: o.shop.slug };
    if (s.s.totalSatang !== payable) return fail("PRICE_CHANGED", { heldTotalSatang: h.payload.t, totalSatang: payable, rehold: h.rehold, shopSlug: o.shop.slug });
    const nonce = issueBookFormNonce({ now: o.now, scope: { tenantId: o.shop.tenantId, purpose: "confirm" } });
    if (!nonce) return fail("UNAVAILABLE");
    const [{ info, licenseNo }, brand] = await Promise.all([shopInfoOf(o.shop, h.unit.id, o.now), bookBrandOf(o.shop)]);
    return {
      ok: true,
      vm: {
        shop: info,
        brand,
        locale,
        product: { slug: h.dep.product.slug, title: h.dep.product.title },
        date: h.dep.localDate,
        timeText: h.dep.timeText,
        summary: s.s,
        holdUntil,
        holdUntilLocal: localHm(h.unit.tz, new Date(holdUntil)),
        confirmByLocal: localHm(h.unit.tz, new Date(Date.parse(holdUntil) - BOOK_HOLD_USABLE_SEC * 1000)),
        cancelRows: s.s.cancelRows,
        legal: { licenseNo, termsVersion: BOOK_TERMS_VERSION },
        form: { nonce },
      },
    };
  } catch {
    return fail("BUSY");
  }
}

// ═══════════════ 4) ยืนยันการจอง ═══════════════
/** ฟอร์มหน้ายืนยัน ⇒ confirmTrips (จ่ายตอนนี้ · การจอง HOLD จนร้านรับเงิน) · ผู้จองตรวจเข้ม (§4.1) ก่อนถึงบริการ */
export async function confirmBookHold(
  input: { shop: unknown; basketToken: unknown; sel: unknown; form: unknown; clientKey: unknown },
  opts?: BookFlowOpts,
): Promise<BookConfirmResult> {
  try {
    const clientKey = str(input, "clientKey");
    const o = await openShop(input, opts, async (shop) =>
      clientKey === null ? null : { buckets: [{ name: "cb", key: `trips:confirm:${shop.tenantId}:${clientKey}`, limit: BOOK_CONFIRM_PER_HOUR, windowMs: HOUR_MS }] },
    );
    if (isFail(o)) return o;
    const form = plainForm(field(input, "form"));
    const lang: BookLocale | null = form.lang === "th" || form.lang === "en" ? form.lang : null;
    const locale = bookLocaleOf(lang, null);
    const h = await heldBasket(o, field(input, "basketToken"), field(input, "sel"), locale, lang);
    if (isFail(h)) return h;
    const done = doneOf(h);
    if (done) return { ...done, lang };
    const slug = { shopSlug: o.shop.slug, lang };
    const st = await bookSaleState({ tenantId: o.shop.tenantId, unitId: h.unit.id, productId: h.dep.productId }, o.now);
    if (st !== "OPEN") return fail("UNAVAILABLE", { ...slug, ...(st === "BOOKING_OFF" || st === "SHOP_CONFIRMS" ? { reason: st } : {}) });
    if (!holdUntilOf(h)) return fail("HOLD_EXPIRED", { ...slug, rehold: h.rehold });
    // ข้อ 5: ฟอร์ม — ผิด ⇒ ไม่เรียกบริการ (ไม่มีการจอง · ไม่มี Party ใหม่ · มติ R10)
    const nc = checkNonce(o.secret, form.nonce, o.now, { tenantId: o.shop.tenantId, purpose: "confirm" });
    if (!nc.ok) return nc.code === "INVALID" ? fail("INVALID", { ...slug, fields: ["nonce"] }) : fail(nc.code, slug);
    const seenRaw = form.seen;
    if (typeof seenRaw !== "string" || !/^\d{1,12}$/.test(seenRaw)) return fail("INVALID", { ...slug, fields: ["seen"] });
    if (form.accept !== "on" && form.accept !== "1" && form.accept !== "true") return fail("ACCEPT_REQUIRED", slug);
    const name = bookerNameOf(form.name);
    const phone = bookerPhoneOf(form.phone);
    const email = bookerEmailOf(form.email);
    const bad: BookFormField[] = [];
    if (name === null) bad.push("name");
    if (phone === null) bad.push("phone");
    if (email === null) bad.push("email");
    if (bad.length) return fail("INVALID", { ...slug, fields: bad });
    if (Number(seenRaw) !== h.payload.t) return fail("PRICE_CHANGED", { ...slug, heldTotalSatang: h.payload.t, totalSatang: h.payload.t, rehold: h.rehold });
    const l = await lineOfHeld(h, locale);
    if (!l.ok) return fail("INVALID", { ...slug, fields: l.fields });
    // ข้อ 8: รอบปิด/เลยเวลาปิดรับหลังถือ — บริการไม่ตรวจเอง (หนี้ §12 ข้อ 1 · T0.4c) ⇒ ตรวจก่อนเรียก
    const ctx = ctxOf(o, h.unit.id, locale);
    const av = await getAvailability(ctx, { departureId: h.dep.departureId });
    if (!av.ok) return av.code === "NOT_FOUND" ? NOT_FOUND() : fail("BUSY", slug);
    const blocked = blockCode(av.value.saleBlock);
    if (blocked) return fail(blocked, slug);
    const booker = { name: name ?? "", phone: phone ?? "", ...(email ? { email } : {}) };
    const r = await confirmTrips(ctx, {
      holdIds: h.basket.holds.map((x) => x.id),
      basketId: h.basket.basketId,
      basketToken: h.basketToken,
      quote: { lines: [l.line] },
      quoteId: h.payload.q,
      idempotencyKey: `bc_${sha256hex(nc.nonce).slice(0, 64)}`,
      booker,
      pay: { method: "PAY_NOW" },
    });
    if (r.ok) {
      const token = r.value[0]?.publicToken;
      return typeof token === "string" ? { ok: true, token, shopSlug: o.shop.slug, lang } : fail("BUSY", slug);
    }
    // ยืนยันไม่ ok ⇒ อ่านตะกร้าใหม่ก่อนแปลง (มติ R9)
    const again = await heldBasket(o, h.basketToken, field(input, "sel"), locale, lang);
    if (!isFail(again)) {
      const d2 = doneOf(again);
      if (d2) return { ...d2, lang };
    }
    const m = mapService(r);
    if (m.code === "NOT_FOUND") return m;
    if (m.code === "PRICE_CHANGED") return { ...m, ...slug, heldTotalSatang: h.payload.t, rehold: h.rehold };
    if (m.code === "HOLD_EXPIRED") return { ...m, ...slug, rehold: h.rehold };
    return { ...m, ...slug };
  } catch {
    return fail("BUSY");
  }
}

// ═══════════════ 4b) ถือใหม่จากหน้ายืนยัน (มติ W2) ═══════════════
/**
 * ปุ่ม "ถือใหม่" ของหน้ายืนยัน (ราคาเปลี่ยน/ใกล้หมดเวลา): ปล่อยที่ถือของตะกร้าเดิมด้วยสิทธิ์ของ token ตะกร้า (capKey `basket:<sha256>` ของบริการ)
 * แล้วคืนหน้าสินค้าพร้อมการเลือกเดิม — ตะกร้ายืนยันแล้ว ⇒ DONE · ที่ถือหมด/ปล่อยแล้ว = ไม่มีอะไรต้องปล่อย · บริการปฏิเสธด้วยเหตุอื่น ⇒ BUSY (ไม่พาไปถือซ้อน)
 * ไม่มีฟอร์มให้ตรวจ (ไม่มีค่าที่กรอก) · ไม่กินถังถือ (การปล่อยไม่เพิ่มที่ถือ)
 */
export async function releaseBookHold(input: { shop: unknown; basketToken: unknown; sel: unknown; lang?: unknown; clientKey: unknown }, opts?: BookFlowOpts): Promise<BookReleaseResult> {
  try {
    const o = await openShop(input, opts);
    if (isFail(o)) return o;
    const lr = field(input, "lang");
    const lang: BookLocale | null = lr === "th" || lr === "en" ? lr : null;
    const locale = bookLocaleOf(lang, null);
    const h = await heldBasket(o, field(input, "basketToken"), field(input, "sel"), locale, lang);
    if (isFail(h)) return h;
    const done = doneOf(h);
    if (done) return { ...done, lang };
    const slug = { shopSlug: o.shop.slug, lang };
    if (h.basket.status === "OPEN") {
      const ctx = ctxOf(o, h.unit.id, locale);
      const capKey = `basket:${sha256hex(h.basketToken)}`;
      for (const x of h.basket.holds) {
        if (x.status !== "ACTIVE") continue;
        const r = await releaseHold(ctx, { holdId: x.id, reason: "public.rehold", capKey });
        if (!r.ok && r.code !== "HOLD_EXPIRED" && r.code !== "HOLD_NOT_FOUND") return fail("BUSY", { ...slug, rehold: h.rehold });
      }
    }
    return { ok: true, shopSlug: o.shop.slug, back: h.rehold };
  } catch {
    return fail("BUSY");
  }
}

// ═══════════════ 5) หน้าการจอง ═══════════════
/** หน้าการจองของลูกค้าจาก token (ผูกร้านใน URL) — จ่าย (QR ยอดล็อกของบริการ) / วอเชอร์ / หมดเวลา / ยกเลิก / จบแล้ว */
export async function openBookReservation(input: { shop: unknown; token: unknown; lang?: unknown; acceptLanguage?: unknown; clientKey: unknown }, opts?: BookFlowOpts): Promise<BookReservationResult> {
  try {
    const clientKey = str(input, "clientKey");
    let tokenLimit = 0;
    const o = await openShop(input, opts, async (shop) => {
      const lim = await rateLimitsOf(shop.tenantId, shop.units[0]?.id ?? "", nowOf(opts));
      if (!lim || clientKey === null) return null;
      tokenLimit = lim.token;
      return { buckets: [], peek: { key: `trips:token:${shop.tenantId}:${clientKey}`, limit: lim.token, windowMs: HOUR_MS } };
    });
    if (isFail(o)) return o;
    const token = field(input, "token");
    /** ค้นไม่เจอ ⇒ +1 ถังเดา token ของเครื่อง (คำสั่งแยก · หนี้ที่รับในมติ) — นับไม่ได้ ⇒ ปิด */
    const missed = async (): Promise<BookFail> => {
      if (tokenLimit < 1) return limiterDown();
      try {
        const sql = Prisma.sql`WITH ${rateBucketCte("tb", `trips:token:${o.shop.tenantId}:${o.clientKey}`, HOUR_MS, o.now.getTime())} SELECT (SELECT "count" FROM tb) AS "tc"`;
        const rows = await queryOf(opts)(sql);
        const c = Array.isArray(rows) && isRec(rows[0]) ? intOf(rows[0].tc) : null;
        return c === null ? limiterDown() : NOT_FOUND();
      } catch {
        return limiterDown();
      }
    };
    if (typeof token !== "string" || !BOOK_RES_TOKEN_RE.test(token)) return missed();
    const row = await findBookReservation({ tenantId: o.shop.tenantId, unitIds: o.shop.units.map((u) => u.id) }, sha256hex(token));
    if (!row) return missed();
    const unit = unitOf(o.shop, row.unitId);
    const lang = str(input, "lang");
    const locale = bookLocaleOf(lang, field(input, "acceptLanguage"));
    if (!unit) return NOT_FOUND();
    const dep = await loadBookDeparture({ tenantId: o.shop.tenantId, unitId: unit.id, tz: unit.tz }, row.departureId, locale);
    const snap = isRec(row.policySnapshot) ? row.policySnapshot : null;
    const items = pricedOf(snap?.lines);
    const totals = totalsOf(snap?.totals);
    // รอร้านยืนยัน (AWAIT_SHOP = W1.2b) ⇒ ข้อความของตัวเอง ไม่ใช่ "ยังจองออนไลน์ไม่ได้" (มติ W5) + รหัสการจอง/ทางติดต่อร้าน (มติ Y6 · ไม่สัญญาว่าร้านจะติดต่อ)
    if (row.status === "PENDING") return fail("UNAVAILABLE", { reason: "PENDING", pending: { bookingCode: row.code, shop: (await shopInfoOf(o.shop, unit.id, o.now)).info } });
    const state = reservationStateOf({ status: row.status, holdExpiresAt: row.holdExpiresAt, now: o.now.toISOString() });
    if (!dep || !items || !totals || !state || snap?.currency !== "THB") return fail("UNAVAILABLE");
    const cat = await loadBookCatalog({ tenantId: o.shop.tenantId, unitId: unit.id, productId: dep.productId }, locale);
    const built = lineVMs(items, totals, cat);
    if (!built) return fail("UNAVAILABLE");
    const ladder = Array.isArray(snap.cancelLadder)
      ? snap.cancelLadder.flatMap((s) => (isRec(s) && isInt(s.daysBefore) && isInt(s.refundBp) ? [{ daysBefore: s.daysBefore, refundBp: s.refundBp }] : []))
      : [];
    const total = totals.payableSatang;
    const outstanding = outstandingOf({ status: row.status, payableSatang: total, paidSatang: row.paidSatang });
    let people = 0;
    for (const it of items) if (it.kind === "SEAT") people += it.qty;
    const waiverRequired = await waiverRequiredOf(o.shop.tenantId, unit.id, dep, o.now);
    const ctx = ctxOf(o, unit.id, locale);

    let finalState = state;
    let pay: BookPayVM = null;
    let voucher: BookReservationVM["voucher"] = null;
    const holdUntil = state === "PAY" ? row.holdExpiresAt : null;
    if (state === "PAY" && holdUntil) {
      // เหลือเวลาถือน้อยกว่าระยะเผื่อ ⇒ ไม่ออก QR (ตัดสินที่ตัวโหลด · มติ R8)
      // QR เฉพาะการจองที่ร้านเป็นผู้เก็บเงิน (มติ W5 Y7) — AGENT ⇒ เอเจนซี่เก็บเงินเอง · ค่าอื่นที่ไม่ใช่ SHOP ⇒ ไม่มี QR + ข้อความกลาง
      if (row.collectMode === "AGENT") pay = { unavailable: "AGENT_COLLECTS" };
      else if (row.collectMode !== "SHOP") pay = { unavailable: "NOT_SHOP" };
      else if (Date.parse(holdUntil) - o.now.getTime() < BOOK_PAY_MARGIN_SEC * 1000) pay = { unavailable: "TOO_LATE" };
      else {
        const pi = await tripPaymentIntent(ctx, { publicToken: token });
        if (pi.ok) pay = { amountSatang: pi.value.amountSatang, qrSvgDataUrl: pi.value.svgDataUrl, receiverName: pi.value.displayName };
        else if (pi.code === "STATE_CONFLICT" && pi.details?.reason === "NO_PROMPTPAY_RECEIVER") pay = { unavailable: "NO_RECEIVER" };
        else if (pi.code === "STATE_CONFLICT" && pi.details?.reason === "NOTHING_DUE") pay = { unavailable: "NOTHING_DUE" };
        else if (pi.code === "HOLD_EXPIRED") finalState = "EXPIRED";
        else return fail("BUSY");
      }
    } else if (state === "VOUCHER") {
      const payload = bookVoucherQrPayload(o.shop.tenantId, row.code);
      if (!payload) return fail("UNAVAILABLE");
      const svg = await QRCode.toString(payload, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
      voucher = { qrSvgDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}` };
    }
    const live = finalState === "PAY" && holdUntil !== null;
    const [{ info }, brand] = await Promise.all([shopInfoOf(o.shop, unit.id, o.now), bookBrandOf(o.shop)]);
    // TRIPS W1.3 ▸ ก้อน "จัดการการจอง" (ใบสั่ง W1.3 §3.2 · K8 K10) — ข้อเท็จจริงอ่านไม่ได้ ⇒ ไม่มีปุ่ม (ENDED) · ไม่มี id/ข้อมูลบุคคล ◂
    const facts = await findBookSelfFacts({ tenantId: o.shop.tenantId, unitId: unit.id }, row.bookingId).catch(() => null);
    const manage = selfManageVMOf({ status: row.status, startsAt: dep.startsAt, now: o.now.toISOString(), holdExpiresAt: row.holdExpiresAt, paidSatang: row.paidSatang, facts });
    // TRIPS W1.4a ▸ ก้อนหมดเวลา (ใบสั่ง W1.4 §4.2) — สถานะอื่น ⇒ null ◂
    const expired = finalState === "EXPIRED" ? await expiredVMOf(o, unit, dep, row, items, cat, facts, lang === "th" || lang === "en" ? lang : null, locale) : null;
    return {
      ok: true,
      vm: {
        shop: info,
        brand,
        locale,
        code: row.code,
        state: finalState,
        product: { slug: dep.product.slug, title: dep.product.title },
        date: dep.localDate,
        timeText: dep.timeText,
        lines: built.lines,
        totalSatang: total,
        paidSatang: row.paidSatang,
        outstandingSatang: outstanding,
        holdUntil: live ? holdUntil : null,
        holdUntilLocal: live && holdUntil ? localHm(unit.tz, new Date(holdUntil)) : null,
        payByLocal: live && holdUntil ? localHm(unit.tz, new Date(Date.parse(holdUntil) - BOOK_PAY_MARGIN_SEC * 1000)) : null,
        payByDate: live && holdUntil ? utcToLocal(unit.tz, new Date(Date.parse(holdUntil) - BOOK_PAY_MARGIN_SEC * 1000)).ymd : null,
        pay: finalState === "PAY" ? pay : null,
        voucher,
        todo: bookTodoOf({ status: row.status, outstandingSatang: outstanding, people, named: row.named, waiverRequired, waiversSigned: row.waiversSigned }),
        cancelRows: cancelRowsOf(ladder),
        cancelUntil: cancelDeadlinesOf(ladder, dep.localDate, utcToLocal(unit.tz, o.now).ymd),
        manage,
        selfCancelled: facts?.cancelledBySelf === true,
        selfVerifyNonce: manage.cancel !== null ? issueSelfFormNonce({ now: o.now, scope: { tenantId: o.shop.tenantId, purpose: "verify", token } }) : null,
        expired,
      },
    };
  } catch {
    return fail("BUSY");
  }
}
/**
 * TRIPS W1.4a ▸ ก้อนหมดเวลา: ที่ว่างของรอบเดิมตอนนี้ (getAvailability WEB) · ลิงก์ถือที่ใหม่ = GET ไปหน้าสินค้าพร้อมการเลือกเดิม (ไม่มี token เดิม/ข้อมูลผู้จอง · มติ C-2 C-3)
 * ไม่มีลิงก์เมื่อ: ร้านปิดจอง/สินค้าไม่ขายสาธารณะ · รอบเดิมปิด · การจองผ่านเอเจนซี่ · snapshot อ่านไม่ได้ · รอบเดิมเต็ม ⇒ ลิงก์ + ก้อนรอบเต็มของวันเดิม — อ่านอย่างเดียว ◂
 */
async function expiredVMOf(o: Opened, unit: { id: string; tz: string }, dep: BookDepartureRow, row: BookReservationRow, items: PricedLike[], cat: BookCatalog, facts: { channel: string; agentAccountId: string | null } | null, lang: BookLocale | null, locale: BookLocale): Promise<BookExpiredVM> {
  const tenantId = o.shop.tenantId;
  const held = row.heldUntil ? new Date(row.heldUntil) : null;
  const av = await getAvailability(ctxOf(o, unit.id, locale), { departureId: row.departureId }).catch(() => null);
  const a = av && av.ok ? av.value : null;
  const now: BookExpiredVM["now"] = !a ? null : a.saleBlock !== null ? { state: "CLOSED", left: 0 } : { state: a.publicLeft <= 0 ? "FULL" : a.showLeft ? "LOW" : "OPEN", left: a.publicLeft };
  const agent = row.collectMode === "AGENT" || !facts || facts.channel.startsWith("AGENT") || facts.agentAccountId !== null;
  const secret = o.secret;
  const open = now !== null && now.state !== "CLOSED" && !agent && (await bookSaleState({ tenantId, unitId: unit.id, productId: dep.productId }, o.now)) === "OPEN";
  const sel = open
    ? reholdSelectionOf(items, {
        paxCodes: cat.paxTypes.filter((p) => p.active).map((p) => p.code),
        extras: cat.extras.filter((e) => e.active && e.productLevel && !e.mandatory).map((e) => ({ id: e.id, ref: refOf(secret, tenantId, "extra", e.id) })),
        zones: cat.zones.filter((z) => z.active).map((z) => ({ id: z.id, ref: refOf(secret, tenantId, "zone", z.id) })),
        skipExtras: cat.extras.filter((e) => e.mandatory).map((e) => e.id),
      })
    : null;
  const t = bookSlotToken(tenantId, row.departureId);
  const back = { ...(lang ? { lang } : {}), m: dep.localDate.slice(0, 7), d: dep.localDate, ...(t ? { t } : {}) };
  const rehold = sel ? { href: bookSelectHref(o.shop.slug, { productSlug: dep.product.slug, query: { ...back, ...sel.query } }), partial: sel.partial } : null;
  const seats = items.reduce((n, it) => n + (it.usesCapacity ? it.qty : 0), 0);
  const nq = Object.fromEntries(Object.entries(sel?.query ?? {}).filter(([k]) => k.startsWith("n.")));
  const full = now?.state === "FULL" ? await bookFullOf(o.shop, { productId: dep.productId, productSlug: dep.product.slug, unit, date: dep.localDate, slot: t, error: null, want: async () => (seats > 0 ? seats : null), nq, lang, locale }, o.now) : null;
  return { heldUntilDate: held ? utcToLocal(unit.tz, held).ymd : null, heldUntilLocal: held ? localHm(unit.tz, held) : null, now, rehold, full };
}
/** สินค้านี้ต้องเซ็นเอกสารรับทราบความเสี่ยงไหม (ค่าตั้ง trips.waiver.requiredFor · อ่านไม่ได้ ⇒ ไม่แสดงรายการนี้) */
async function waiverRequiredOf(tenantId: string, unitId: string, dep: BookDepartureRow, now: Date): Promise<boolean> {
  try {
    const v = (await resolveSettings({ tenantId }, [K_WAIVER], { unitId, productId: dep.productId }, now))[K_WAIVER]?.value;
    return v === "ALL" || (v === "SCUBA_ONLY" && dep.product.deepDive);
  } catch {
    return false;
  }
}

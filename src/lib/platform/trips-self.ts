// ─────────────────────────────────────────────────────────────
// platform/trips-self.ts — "การจองของฉัน" ฝั่งเซิร์ฟเวอร์: ยืนยันเบอร์ผู้จอง → grant 15 นาที → ยกเลิกก่อนจ่าย / ยื่นคำขอคืนเงินตาม snapshot · RUN TRIPS W1.3a
// ใบสั่ง ledger/trips-briefs/W1.3.md §3.2 §4 §5 §6 (มติ K1–K16 ชนะ · OQ37 = ลิงก์ + เบอร์ แทน OTP)
//
// 🔴 ไม่ต้องล็อกอิน ⇒ ผู้เรียกไม่น่าไว้ใจทุกช่อง · ทุกฟังก์ชันไม่ throw · ไม่สะท้อนค่าที่ส่งมา · ไม่มีเบอร์/token/กุญแจเครื่องใน log/ถัง/ผล
// 🔴 ลำดับด่าน (§5): กุญแจเครื่อง (ไม่ถามฐาน) → ร้าน (ไม่พบ = ถังเดาของ W1.1) → ถังอ่าน + peek ถังเดา token **คำสั่งเดียว** (ปิดเมื่อพัง)
//    → token → การจอง (ไม่พบ ⇒ +1 ถังเดา) → nonce → grant (ยกเว้นยืนยัน) → ฟอร์มเดิม ⇒ ผลเดิม → ก้อนจัดการ → ฟอร์ม → ยอดใหม่ = ยอดที่เห็น → บริการ
// 🔴 เงิน: ยอดคืน/เก็บ/ขั้น มาจาก cancelTripBooking QUOTE (snapshot) เท่านั้น · ไม่มีการคิดเงินในไฟล์นี้
// 🔴 ยืนยันตัวตน = ลิงก์ + เบอร์ของผู้จอง (Party.phoneNorm) · ไม่ส่งข้อความใด ๆ · grant ผูก ร้าน + การจอง + token + กุญแจเครื่อง (IP) + เวลาหมด
// ─────────────────────────────────────────────────────────────
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { rateBucketCte } from "@/lib/core/rate-limit-db";
import { resolveSettings } from "@/lib/core/settings";
import {
  TRIPS_PUBLIC_SELF_REASON,
  cancelTripBooking,
  findBookReservation,
  findBookSelfFacts,
  loadBookDeparture,
  normalizePartyPhone,
  selfReplayOf,
  utcToLocal,
  type BookReservationRow,
  type BookSelfFacts,
} from "@/lib/modules/trips";
import { bookMiss, resolveBookShop, type BookShop } from "./trips-public";
import { BOOK_LIMITER_DOWN_RETRY_SEC, BOOK_READ_LIMIT } from "./trips-public-core";
import { BOOK_FORM_MAX_SEC, BOOK_FORM_MIN_SEC, BOOK_RES_TOKEN_RE, bookerPhoneOf } from "./trips-book-core";
import {
  SELF_CANCEL_KINDS,
  SELF_GRANT_RE,
  SELF_GRANT_TTL_SEC,
  SELF_WRONG_PER_BOOKING,
  SELF_WRONG_WINDOW_SEC,
  selfManageVMOf,
  selfPhoneMatches,
  type SelfBlock,
  type SelfCancelKind,
  type SelfErrorCode,
  type SelfManageVM,
  type SelfNoncePurpose,
  type SelfRefundVM,
} from "./trips-self-core";

// ═══════════════ ชนิดผล ═══════════════
/** ช่องทดสอบ (หน้า/action ไม่ส่ง) */
export type SelfOpts = { now?: Date; deps?: { query?: (sql: unknown) => Promise<unknown[]> } };
export type SelfField = "phone" | "nonce" | "seen";
export type SelfFail = {
  ok: false;
  code: SelfErrorCode;
  reason?: "LIMIT" | "LOCKED" | "LIMITER_DOWN" | "NO_CLIENT";
  retryAfterSec?: number;
  fields?: SelfField[];
  block?: SelfBlock;
  refund?: SelfRefundVM;
  refundSatang?: number;
  /** (LOCKED) ช่องทางติดต่อร้าน X30 */
  contact?: { phone?: string; line?: string };
  /** slug จริงของร้าน — ให้ action ทำ redirect (ไม่ใช้ค่าจากคำขอ) */
  shopSlug?: string;
};
export type SelfVerifyResult = { ok: true; grant: string; expiresAt: string; shopSlug: string } | SelfFail;
/**
 * จอยกเลิก: ยอดทุกตัวจาก QUOTE ของบริการ · `passThroughSatang` = เงินที่ร้านเก็บแทนที่คืนเต็ม (null = ไม่มี · L7 ก) · `refundPct` ไม่ปัด (12.5) · `partPaid` = ยังมียอดค้าง (L7 ฌ)
 * `form` = ช่องของฟอร์มยกเลิก: nonce + ชนิด/รุ่นที่ลูกค้าเห็น (`kind` `v`) ผูกด้วย MAC `kv` (มติ L1)
 */
export type SelfCancelVM = {
  kind: SelfCancelKind;
  paidSatang: number;
  refundSatang: number;
  keptSatang: number;
  passThroughSatang: number | null;
  refundPct: number | null;
  daysBefore: number;
  partPaid: boolean;
  form: { nonce: string; kind: SelfCancelKind; v: string; kv: string };
};
export type SelfQuoteResult = { ok: true; vm: SelfCancelVM } | SelfFail;
export type SelfCancelOutcome = "CANCELLED" | "REFUND_REQUESTED" | "CANCEL_REQUESTED";
export type SelfCancelResult = { ok: true; result: SelfCancelOutcome; refundSatang: number; replayed: boolean; shopSlug: string } | SelfFail;

// ═══════════════ ค่าคงที่ภายใน ═══════════════
const CLIENT_KEY_RE = /^pc_[0-9a-f]{40}$/;
const SECRET_MIN = 32;
const HOUR_MS = 3_600_000;
const VERIFY_WINDOW_MS = 15 * 60_000;
const DAY_MS = 86_400_000;
const K_RATE = "trips.public.rateLimits";
const K_CONTACT = "trips.public.shopContact";
const QUOTE_KEY = "self_quote_v1";

const fail = (code: SelfErrorCode, extra?: Omit<SelfFail, "ok" | "code">): SelfFail => ({ ok: false, code, ...(extra ?? {}) });
/** ตัวนับล่ม ⇒ ให้ลองใหม่ (พก slug ร้านเมื่อรู้แล้ว ⇒ หน้า redirect กลับได้ ไม่ใช่ 404 · มติ L9) */
const limiterDown = (shopSlug?: string): SelfFail => ({ ok: false, code: "RATE_LIMITED", reason: "LIMITER_DOWN", retryAfterSec: BOOK_LIMITER_DOWN_RETRY_SEC, ...(shopSlug ? { shopSlug } : {}) });
const noClient = (): SelfFail => ({ ok: false, code: "RATE_LIMITED", reason: "NO_CLIENT", retryAfterSec: BOOK_LIMITER_DOWN_RETRY_SEC });
const NOT_FOUND = (): SelfFail => ({ ok: false, code: "NOT_FOUND" });
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** อ่านช่องของ object จากผู้ใช้แบบไม่ throw (getter/Proxy) */
const field = (o: unknown, k: string): unknown => {
  try {
    return isRec(o) ? o[k] : undefined;
  } catch {
    return undefined;
  }
};
/** ค่าสตริงของฟอร์ม — เฉพาะคีย์ของตัวเอง (ไม่อ่านจาก prototype) · อื่น ⇒ null */
const formStr = (o: unknown, k: string): string | null => {
  try {
    if (!isRec(o) || !Object.prototype.hasOwnProperty.call(o, k)) return null;
    const v = o[k];
    return typeof v === "string" && v.length <= 4096 ? v : null;
  } catch {
    return null;
  }
};
const intOf = (v: unknown): number | null => {
  const n = typeof v === "bigint" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
};
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const nowOf = (o: SelfOpts | undefined): Date => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? o.now : new Date());
const queryOf = (o: SelfOpts | undefined): ((sql: unknown) => Promise<unknown[]>) =>
  typeof o?.deps?.query === "function" ? o.deps.query : (sql: unknown) => prisma.$queryRaw<unknown[]>(sql as Prisma.Sql);
const sha256hex = (s: string): string => createHash("sha256").update(s).digest("hex");
const secretOf = (): string | null => {
  const s = process.env.SESSION_SECRET;
  return typeof s === "string" && s.length >= SECRET_MIN ? s : null;
};
const mac22 = (secret: string, msg: string): string => createHmac("sha256", secret).update(msg).digest("base64url").slice(0, 22);
const safeEq = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// ═══════════════ nonce ของฟอร์ม (ผูก ร้าน · วัตถุประสงค์ · sha256(token)) ═══════════════
export type SelfNonceScope = { tenantId: string; purpose: SelfNoncePurpose; token: string };
const nonceMsg = (rand: string, sec: string, s: { tenantId: string; purpose: string; tokenHash: string }): string =>
  `trips.public.self.nonce.v1:${s.purpose}:${s.tenantId}:${s.tokenHash}:${rand}.${sec}`;
/** nonce = `<สุ่ม 22>.<วินาที>.<MAC 22>` · ไม่มีกุญแจ/scope ผิดรูป ⇒ null */
export function issueSelfFormNonce(opts?: { now?: Date; scope?: SelfNonceScope }): string | null {
  const secret = secretOf();
  const sc = opts?.scope;
  if (!secret || !sc || typeof sc.tenantId !== "string" || !sc.tenantId || (sc.purpose !== "verify" && sc.purpose !== "cancel") || typeof sc.token !== "string" || !BOOK_RES_TOKEN_RE.test(sc.token)) return null;
  const now = opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now : new Date();
  const rand = randomBytes(16).toString("base64url");
  const sec = String(Math.floor(now.getTime() / 1000));
  return `${rand}.${sec}.${mac22(secret, nonceMsg(rand, sec, { tenantId: sc.tenantId, purpose: sc.purpose, tokenHash: sha256hex(sc.token) }))}`;
}
type NonceCheck = { ok: true; nonce: string } | { ok: false; code: "INVALID" | "TOO_FAST" | "STALE_FORM" };
function checkNonce(o: Opened, v: unknown, purpose: SelfNoncePurpose): NonceCheck {
  if (typeof v !== "string" || v.length > 80) return { ok: false, code: "INVALID" };
  const m = /^([A-Za-z0-9_-]{22})\.(\d{1,12})\.([A-Za-z0-9_-]{22})$/.exec(v);
  if (!m) return { ok: false, code: "INVALID" };
  const rand = m[1] ?? "";
  const sec = m[2] ?? "";
  if (!safeEq(mac22(o.secret, nonceMsg(rand, sec, { tenantId: o.shop.tenantId, purpose, tokenHash: o.tokenHash })), m[3] ?? "")) return { ok: false, code: "INVALID" };
  const age = Math.floor(o.now.getTime() / 1000) - Number(sec);
  if (age < BOOK_FORM_MIN_SEC) return { ok: false, code: "TOO_FAST" };
  if (age > BOOK_FORM_MAX_SEC) return { ok: false, code: "STALE_FORM" };
  return { ok: true, nonce: v };
}

// ═══════════════ grant (มติ K7: ผูก IP · 15 นาทีคงที่) ═══════════════
const grantMac = (o: Opened, exp: number): string =>
  mac22(o.secret, `trips.public.grant.v1:${o.shop.tenantId}:${o.row.bookingId}:${o.tokenHash}:${o.clientKey}:${exp}`);
function grantOk(o: Opened, g: unknown): boolean {
  if (typeof g !== "string" || g.length > 60 || !SELF_GRANT_RE.test(g)) return false;
  const [, expS, got] = g.split(".");
  const exp = Number(expS);
  const nowSec = Math.floor(o.now.getTime() / 1000);
  if (!Number.isSafeInteger(exp) || exp <= nowSec || exp > nowSec + SELF_GRANT_TTL_SEC) return false;
  return safeEq(grantMac(o, exp), got ?? "");
}

// ═══════════════ ด่านอัตรา (คำสั่ง SQL เดียวต่อด่าน · ปิดเมื่อพัง) ═══════════════
type Bucket = { name: string; key: string; limit: number; windowMs: number };
type Peek = { name: string; key: string; windowMs: number };
type GateRow = Record<string, unknown>;
const retryOf = (ws: unknown, windowMs: number, nowMs: number): number => {
  const start = ws instanceof Date && Number.isFinite(ws.getTime()) ? ws.getTime() : nowMs;
  return Math.min(Math.ceil(windowMs / 1000), Math.max(1, Math.ceil((start + windowMs - nowMs) / 1000)));
};
/** ถังที่นับ (ถังถัดไปนับเมื่อถังก่อนผ่าน) + ถังที่อ่านอย่างเดียว ในคำสั่งเดียว · ล้ม ⇒ null */
async function runGate(buckets: readonly Bucket[], peeks: readonly Peek[], now: Date, opts: SelfOpts | undefined, extra?: { ctes: Prisma.Sql[]; cols: Prisma.Sql[] }): Promise<GateRow | null> {
  const nowMs = now.getTime();
  try {
    const ctes = buckets.map((b, i) => rateBucketCte(b.name, b.key, b.windowMs, nowMs, i > 0 ? { after: buckets[i - 1]?.name ?? "", limit: buckets[i - 1]?.limit ?? 0 } : undefined));
    const cols = buckets.map((b) => Prisma.sql`(SELECT "count" FROM ${Prisma.raw(b.name)}) AS ${Prisma.raw(`"${b.name}c"`)}, (SELECT "windowStart" FROM ${Prisma.raw(b.name)}) AS ${Prisma.raw(`"${b.name}w"`)}`);
    for (const p of peeks) {
      const cut = new Date(nowMs - p.windowMs);
      cols.push(
        Prisma.sql`(SELECT CASE WHEN k."windowStart" > ${cut} THEN k."count" ELSE 0 END FROM "ChatRateBucket" k WHERE k."key" = ${p.key}) AS ${Prisma.raw(`"${p.name}c"`)}, (SELECT k."windowStart" FROM "ChatRateBucket" k WHERE k."key" = ${p.key}) AS ${Prisma.raw(`"${p.name}w"`)}`,
      );
    }
    const all = [...ctes, ...(extra?.ctes ?? [])];
    const sel = [...cols, ...(extra?.cols ?? [])];
    const rows = await queryOf(opts)(all.length ? Prisma.sql`WITH ${Prisma.join(all, ", ")} SELECT ${Prisma.join(sel, ", ")}` : Prisma.sql`SELECT ${Prisma.join(sel, ", ")}`);
    return Array.isArray(rows) && isRec(rows[0]) ? rows[0] : null;
  } catch {
    return null;
  }
}
/** เกินถังที่นับ ⇒ LIMIT · เลขนับหาย ⇒ LIMITER_DOWN · ผ่าน ⇒ null */
function bucketVerdict(row: GateRow, buckets: readonly Bucket[], nowMs: number): SelfFail | null {
  for (const b of buckets) {
    const c = intOf(row[`${b.name}c`]);
    if (c === null || c < 1) return limiterDown();
    if (c > b.limit) return { ok: false, code: "RATE_LIMITED", reason: "LIMIT", retryAfterSec: retryOf(row[`${b.name}w`], b.windowMs, nowMs) };
  }
  return null;
}
/** ค่าที่อ่านของถัง peek (ไม่มีแถว ⇒ 0 · ผิดรูป ⇒ null) */
const peekOf = (row: GateRow, name: string): number | null => {
  const raw = row[`${name}c`];
  return raw === null || raw === undefined ? 0 : intOf(raw);
};
/** +1 ถังเดียว (คำสั่งเดียว) · ล้ม ⇒ false */
async function bump(key: string, windowMs: number, now: Date, opts: SelfOpts | undefined): Promise<boolean> {
  try {
    const rows = await queryOf(opts)(Prisma.sql`WITH ${rateBucketCte("bk", key, windowMs, now.getTime())} SELECT (SELECT "count" FROM bk) AS "c"`);
    return Array.isArray(rows) && isRec(rows[0]) && intOf(rows[0].c) !== null;
  } catch {
    return false;
  }
}
/** เพดาน X8 ของหน่วย (เดา token/ชม./เครื่อง · ยืนยันเบอร์/15 นาที/เครื่อง) — อ่านไม่ได้ ⇒ null (ผู้เรียกปิด) */
async function rateLimitsOf(tenantId: string, unitId: string, now: Date): Promise<{ token: number; verify: number } | null> {
  try {
    const v = (await resolveSettings({ tenantId }, [K_RATE], { unitId }, now))[K_RATE]?.value;
    const token = field(v, "tokenPerHourPerDevice");
    const verify = field(v, "otpPer15Min");
    return isInt(token) && token >= 1 && isInt(verify) && verify >= 1 ? { token, verify } : null;
  } catch {
    return null;
  }
}
/** ช่องทางติดต่อร้าน X30 (เบอร์ · LINE) — อ่านไม่ได้ ⇒ ว่าง */
async function contactOf(tenantId: string, unitId: string, now: Date): Promise<{ phone?: string; line?: string }> {
  try {
    const c = (await resolveSettings({ tenantId }, [K_CONTACT], { unitId }, now))[K_CONTACT]?.value;
    const phone = field(c, "phone");
    const line = field(c, "line");
    return { ...(typeof phone === "string" && phone.trim() ? { phone: phone.trim() } : {}), ...(typeof line === "string" && line.trim() ? { line: line.trim() } : {}) };
  } catch {
    return {};
  }
}

// ═══════════════ ส่วนต้นของทุกฟังก์ชัน (§5 ข้อ 1–4) ═══════════════
type Opened = { shop: BookShop; clientKey: string; now: Date; secret: string; token: string; tokenHash: string; row: BookReservationRow; unit: { id: string; tz: string }; limits: { token: number; verify: number } };
const isFail = (v: unknown): v is SelfFail => isRec(v) && v.ok === false;
/** `count` = นับถังอ่าน (false = อ่านถังอย่างเดียว — หน้ายกเลิกที่ตัวเปิดหน้านับไปแล้ว · มติ L6) */
async function openSelf(input: unknown, opts: SelfOpts | undefined, count = true): Promise<Opened | SelfFail> {
  const clientKey = field(input, "clientKey");
  if (typeof clientKey !== "string" || !CLIENT_KEY_RE.test(clientKey)) return noClient();
  const r = await resolveBookShop(field(input, "shop"));
  if (!r.ok) return bookMiss(clientKey, opts);
  const shop = r.shop;
  const now = nowOf(opts);
  const limits = await rateLimitsOf(shop.tenantId, shop.units[0]?.id ?? "", now);
  if (!limits) return limiterDown(shop.slug);
  const guessKey = `trips:token:${shop.tenantId}:${clientKey}`;
  const read: Bucket = { name: "rb", key: `trips:book:${shop.tenantId}:${clientKey}`, limit: BOOK_READ_LIMIT.limit, windowMs: BOOK_READ_LIMIT.windowMs };
  const row0 = await runGate(count ? [read] : [], [{ name: "tg", key: guessKey, windowMs: HOUR_MS }, ...(count ? [] : [{ name: "rp", key: read.key, windowMs: read.windowMs }])], now, opts);
  if (!row0) return limiterDown(shop.slug);
  const v = count ? bucketVerdict(row0, [read], now.getTime()) : null;
  if (v) return { ...v, shopSlug: shop.slug };
  const readSoFar = count ? 0 : peekOf(row0, "rp");
  if (readSoFar === null) return limiterDown(shop.slug);
  if (readSoFar >= read.limit) return { ok: false, code: "RATE_LIMITED", reason: "LIMIT", retryAfterSec: retryOf(row0.rpw, read.windowMs, now.getTime()), shopSlug: shop.slug };
  const guessed = peekOf(row0, "tg");
  if (guessed === null) return limiterDown(shop.slug);
  if (guessed >= limits.token) return { ok: false, code: "RATE_LIMITED", reason: "LIMIT", retryAfterSec: retryOf(row0.tgw, HOUR_MS, now.getTime()), shopSlug: shop.slug };
  const secret = secretOf();
  if (!secret) return fail("UNAVAILABLE", { shopSlug: shop.slug });
  // ข้อ 4: token → การจอง (ผูกร้าน + หน่วย TRIPS ของร้าน) · ไม่พบ ⇒ +1 ถังเดา token (นับไม่ได้ ⇒ ปิด)
  const token = field(input, "token");
  const missed = async (): Promise<SelfFail> => ((await bump(guessKey, HOUR_MS, now, opts)) ? NOT_FOUND() : limiterDown(shop.slug));
  if (typeof token !== "string" || !BOOK_RES_TOKEN_RE.test(token)) return missed();
  const tokenHash = sha256hex(token);
  const row = await findBookReservation({ tenantId: shop.tenantId, unitIds: shop.units.map((u) => u.id) }, tokenHash);
  if (!row) return missed();
  const unit = shop.units.find((u) => u.id === row.unitId);
  if (!unit) return NOT_FOUND();
  return { shop, clientKey, now, secret, token, tokenHash, row, unit: { id: unit.id, tz: unit.tz }, limits };
}

/** ก้อนจัดการ ณ นาฬิกาของคำขอ (ตัวตัดสินเดียวกับหน้าการจอง) + ข้อเท็จจริงของการจอง */
async function manageOf(o: Opened): Promise<{ m: SelfManageVM; facts: BookSelfFacts | null; startsAt: string | null; localDate: string | null }> {
  const [facts, dep] = await Promise.all([findBookSelfFacts({ tenantId: o.shop.tenantId, unitId: o.unit.id }, o.row.bookingId), loadBookDeparture({ tenantId: o.shop.tenantId, unitId: o.unit.id, tz: o.unit.tz }, o.row.departureId, "th")]);
  const m = selfManageVMOf({ status: o.row.status, startsAt: dep?.startsAt ?? null, now: o.now.toISOString(), holdExpiresAt: o.row.holdExpiresAt, paidSatang: o.row.paidSatang, facts });
  return { m, facts, startsAt: dep?.startsAt ?? null, localDate: dep?.localDate ?? null };
}
/** ปุ่มปิด ⇒ คำขอเปิดของลูกค้า/ร้าน = DONE{refund} · อื่น = NOT_ALLOWED{block} */
const blockedOf = (o: Opened, m: SelfManageVM): SelfFail =>
  m.block === "REFUND_IN_PROGRESS" && m.refund ? fail("DONE", { refund: m.refund, shopSlug: o.shop.slug }) : fail("NOT_ALLOWED", { block: m.block ?? "ENDED", shopSlug: o.shop.slug });
const ctxOf = (o: Opened) => ({ tenantId: o.shop.tenantId, unitId: o.unit.id, channel: "WEB" as const, actor: { kind: "PUBLIC" as const, clientKey: o.clientKey }, now: o.now });
/** publicSelf ของบริการ: รุ่นที่หน้าใช้คิดยอด (มติ L1) */
const publicSelfOf = (o: Opened, expectedVersion: number) => ({ publicSelf: { bookingId: o.row.bookingId, tokenHash: o.tokenHash, expectedVersion } });

// ═══════════════ 1) ยืนยันเบอร์ผู้จอง → grant ═══════════════
/**
 * ถังการจอง (K6 · L2): จองสิทธิ์ลอง 1 ครั้งด้วยคำสั่งเดียว (เพิ่มเมื่อยังไม่ถึงเพดานหรือหน้าต่างหมด) คู่กับถังเครื่อง X8 — ไม่ได้สิทธิ์ ⇒ ถูกล็อก
 * เบอร์ถูก ⇒ คืนสิทธิ์ (ลดตัวนับ) · ยิงผิดพร้อมกันได้เทียบเบอร์ไม่เกินเพดาน
 */
function reserveTryCte(key: string, windowMs: number, now: Date, after: Bucket): Prisma.Sql {
  const at = now;
  const cut = new Date(now.getTime() - windowMs);
  return Prisma.sql`lk AS (
    INSERT INTO "ChatRateBucket" ("id", "key", "count", "windowStart", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${key}, 1, ${at}, NOW(), NOW() FROM ${Prisma.raw(after.name)} p WHERE p."count" <= ${after.limit}
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "ChatRateBucket"."windowStart" <= ${cut} THEN 1 ELSE "ChatRateBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "ChatRateBucket"."windowStart" <= ${cut} THEN ${at} ELSE "ChatRateBucket"."windowStart" END,
      "updatedAt" = NOW()
    WHERE "ChatRateBucket"."windowStart" <= ${cut} OR "ChatRateBucket"."count" < ${SELF_WRONG_PER_BOOKING}
    RETURNING "count", "windowStart")`;
}
/** คืนสิทธิ์ที่จองไว้ (เบอร์ถูก) — ล้มไม่เปลี่ยนผลของลูกค้า */
async function releaseTry(key: string, opts: SelfOpts | undefined): Promise<void> {
  try {
    await queryOf(opts)(Prisma.sql`UPDATE "ChatRateBucket" SET "count" = "count" - 1, "updatedAt" = NOW() WHERE "key" = ${key} AND "count" > 0 RETURNING "count"`);
  } catch {
    // ตัวนับค้าง +1 = ข้างปลอดภัย (ไม่ปล่อยให้เดาเพิ่ม)
  }
}
/** ลิงก์ + เบอร์ของผู้จอง (OQ37) ⇒ grant 15 นาที ผูกเครื่อง · ผิด ⇒ VERIFY_FAILED รูปเดียว (ไม่สะท้อน/ไม่ใบ้เบอร์) */
export async function verifyBookSelf(input: { shop: unknown; token: unknown; form: unknown; clientKey: unknown }, opts?: SelfOpts): Promise<SelfVerifyResult> {
  try {
    const o = await openSelf(input, opts);
    if (isFail(o)) return o;
    const slug = { shopSlug: o.shop.slug };
    const form = field(input, "form");
    if (!isRec(form)) return fail("INVALID", { fields: ["phone", "nonce"], ...slug });
    const nc = checkNonce(o, formStr(form, "nonce"), "verify");
    if (!nc.ok) return nc.code === "INVALID" ? fail("INVALID", { fields: ["nonce"], ...slug }) : fail(nc.code, slug);
    const phone = bookerPhoneOf(formStr(form, "phone"));
    if (phone === null) return fail("INVALID", { fields: ["phone"], ...slug });
    const { m, facts } = await manageOf(o);
    if (m.cancel === null) return fail("NOT_ALLOWED", { block: m.block ?? "ENDED", ...slug });
    // เพดาน (คำสั่งเดียว · K6 L2): ถังเครื่อง X8 (ทุกฟอร์มที่ถูกรูป) → จองสิทธิ์ลองของการจอง (ไม่มีเบอร์/token ในคีย์)
    const machine: Bucket = { name: "vb", key: `trips:verify:${o.shop.tenantId}:${o.clientKey}`, limit: o.limits.verify, windowMs: VERIFY_WINDOW_MS };
    const lockKey = `trips:verifyb:${o.shop.tenantId}:${sha256hex(o.tokenHash).slice(0, 24)}`;
    const wrongWindowMs = SELF_WRONG_WINDOW_SEC * 1000;
    const row = await runGate([machine], [{ name: "lp", key: lockKey, windowMs: wrongWindowMs }], o.now, opts, {
      ctes: [reserveTryCte(lockKey, wrongWindowMs, o.now, machine)],
      cols: [Prisma.sql`(SELECT "count" FROM lk) AS "lkc"`],
    });
    if (!row) return limiterDown(o.shop.slug);
    const v = bucketVerdict(row, [machine], o.now.getTime());
    if (v) return { ...v, ...slug };
    if (intOf(row.lkc) === null) {
      return { ok: false, code: "RATE_LIMITED", reason: "LOCKED", retryAfterSec: retryOf(row.lpw, wrongWindowMs, o.now.getTime()), contact: await contactOf(o.shop.tenantId, o.unit.id, o.now), ...slug };
    }
    // L4: เทียบด้วยตัว normalise เดียวกับ Party ทั้งสองฝั่ง (แล้วเทียบเลขสำคัญ)
    if (!facts || !selfPhoneMatches(normalizePartyPhone(phone), normalizePartyPhone(facts.bookerPhoneNorm))) return fail("VERIFY_FAILED", slug);
    await releaseTry(lockKey, opts);
    const exp = Math.floor(o.now.getTime() / 1000) + SELF_GRANT_TTL_SEC;
    return { ok: true, grant: `g1.${exp}.${grantMac(o, exp)}`, expiresAt: new Date(exp * 1000).toISOString(), shopSlug: o.shop.slug };
  } catch {
    return fail("BUSY");
  }
}

// ═══════════════ 2) ยอดคืนก่อนกดยืนยัน ═══════════════
type Quoted = { ok: true; vm: Omit<SelfCancelVM, "form">; kind: SelfCancelKind } | SelfFail;
/** ยอดจากบริการ (QUOTE · snapshot) ณ นาฬิกาของคำขอ ด้วยรุ่นของการจองตอนนี้ — จอห้ามคิด */
async function quoteOf(o: Opened, kind: SelfCancelKind, localDate: string | null, version: number): Promise<Quoted> {
  const r = await cancelTripBooking(ctxOf(o), { bookingId: o.row.bookingId, mode: "QUOTE", reason: TRIPS_PUBLIC_SELF_REASON, reasonKind: "CUSTOMER", idempotencyKey: QUOTE_KEY }, publicSelfOf(o, version));
  if (!r.ok) return mapService(r);
  const c = r.value.computed;
  if (!isInt(c.refundSatang) || !isInt(c.feeSatang) || c.refundSatang < 0 || c.feeSatang < 0) return fail("BUSY");
  const pt = field(c, "passThroughSatang");
  const step = c.ladderStep;
  const refundPct = kind === "REFUND_REQUEST" && step && isInt(step.refundBp) ? step.refundBp / 100 : null;
  const today = utcToLocal(o.unit.tz, o.now).ymd;
  const days = localDate ? Math.round((Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS) : 0;
  return {
    ok: true,
    kind,
    vm: {
      kind,
      paidSatang: o.row.paidSatang,
      refundSatang: c.refundSatang,
      keptSatang: c.feeSatang,
      passThroughSatang: kind === "REFUND_REQUEST" && isInt(pt) && pt > 0 ? pt : null,
      refundPct,
      daysBefore: Number.isFinite(days) ? Math.max(0, days) : 0,
      partPaid: o.row.status === "PART_PAID",
    },
  };
}
/** MAC ของสิ่งที่ลูกค้าเห็นบนฟอร์ม (nonce + ชนิด + รุ่น · มติ L1) */
const formMac = (o: Opened, nonce: string, kind: string, v: string): string => mac22(o.secret, `trips.public.self.form.v1:${o.shop.tenantId}:${o.tokenHash}:${nonce}:${kind}:${v}`);
/** หน้ายกเลิก: ยอดที่จ่าย/คืน/เก็บ/ขั้น + ฟอร์มยกเลิก · ต้องมี grant · ไม่นับถังอ่านซ้ำ (ตัวเปิดหน้านับแล้ว · มติ L6) */
export async function quoteBookSelfCancel(input: { shop: unknown; token: unknown; grant: unknown; clientKey: unknown }, opts?: SelfOpts): Promise<SelfQuoteResult> {
  try {
    const o = await openSelf(input, opts, false);
    if (isFail(o)) return o;
    if (!grantOk(o, field(input, "grant"))) return fail("VERIFY_REQUIRED", { shopSlug: o.shop.slug });
    const { m, localDate, facts } = await manageOf(o);
    if (m.cancel === null || !facts) return blockedOf(o, m);
    const q = await quoteOf(o, m.cancel, localDate, facts.version);
    if (!q.ok) return { ...q, shopSlug: o.shop.slug };
    const nonce = issueSelfFormNonce({ now: o.now, scope: { tenantId: o.shop.tenantId, purpose: "cancel", token: o.token } });
    if (!nonce) return fail("UNAVAILABLE", { shopSlug: o.shop.slug });
    const v = String(facts.version);
    return { ok: true, vm: { ...q.vm, form: { nonce, kind: q.kind, v, kv: formMac(o, nonce, q.kind, v) } } };
  } catch {
    return fail("BUSY");
  }
}

// ═══════════════ 3) ยกเลิก / ยื่นคำขอ ═══════════════
type ServiceFail = { ok: false; code: string; details?: Record<string, unknown> };
/** รหัสบริการ → รหัสหน้า (§3.2 · ที่ถือหมด/ถูกกวาดระหว่างทาง ⇒ STATE_CHANGED · มติ L9) */
function mapService(r: ServiceFail): SelfFail {
  switch (r.code) {
    case "STATE_CONFLICT":
    case "HOLD_EXPIRED":
    case "HOLD_NOT_FOUND":
      return fail("STATE_CHANGED");
    case "IDEMPOTENCY_CONFLICT":
      return fail("STALE_FORM");
    case "NOT_FOUND":
    case "FORBIDDEN":
      return NOT_FOUND();
    default:
      return fail("BUSY");
  }
}
const SEEN_RE = /^(0|[1-9]\d{0,9})$/;
const outcomeOf = (kind: SelfCancelKind): SelfCancelOutcome => (kind === "UNPAID" ? "CANCELLED" : kind === "REFUND_REQUEST" ? "REFUND_REQUESTED" : "CANCEL_REQUESTED");
/**
 * ฟอร์มยกเลิก: HOLD ⇒ ยกเลิกทันที (คืนที่) · จ่ายแล้ว ⇒ ยื่นคำขอคืนเงิน QUOTED ตาม snapshot · ขายแล้วยังไม่จ่าย ⇒ คำขอยกเลิก ยอด 0
 * ฟอร์มเดิมซ้ำ ⇒ ผลเดิม (replayed · ผลเลือกจากคำขอเดิม) · ชนิดที่เห็น ≠ ตอนนี้ ⇒ STATE_CHANGED · ยอดที่เห็น ≠ ยอดตอนนี้ ⇒ AMOUNT_CHANGED (ไม่ยื่น · มติ L1)
 * บริการตอบ ok แต่ผลไม่ตรงสิ่งที่ลูกค้าเห็น ⇒ ไม่รายงานว่าเป็นผลที่ลูกค้าเลือก (STATE_CHANGED)
 */
export async function cancelBookSelf(input: { shop: unknown; token: unknown; grant: unknown; form: unknown; clientKey: unknown }, opts?: SelfOpts): Promise<SelfCancelResult> {
  try {
    const o = await openSelf(input, opts);
    if (isFail(o)) return o;
    const slug = { shopSlug: o.shop.slug };
    const form = field(input, "form");
    if (!isRec(form)) return fail("INVALID", { fields: ["nonce"], ...slug });
    const nc = checkNonce(o, formStr(form, "nonce"), "cancel");
    if (!nc.ok) return nc.code === "INVALID" ? fail("INVALID", { fields: ["nonce"], ...slug }) : fail(nc.code, slug);
    if (!grantOk(o, field(input, "grant"))) return fail("VERIFY_REQUIRED", slug);
    // ข้อ 6′: ฟอร์มเดิม ⇒ ผลเดิม (คีย์อย่างเดียว · ก่อนด่านสถานะ · K5) — ผลเลือกจากคำขอเดิม (L9) · การอ่านนี้ไม่เทียบรุ่น
    const idempotencyKey = `self_${createHash("sha256").update(nc.nonce).digest("base64url").slice(0, 40)}`;
    const rp = await selfReplayOf(ctxOf(o), { bookingId: o.row.bookingId, idempotencyKey }, publicSelfOf(o, 0));
    if (!rp.ok) return { ...mapService(rp), ...slug };
    if (rp.value) {
      const amount = rp.value.computed.refundSatang;
      const result: SelfCancelOutcome = rp.value.requestId === undefined ? "CANCELLED" : amount > 0 ? "REFUND_REQUESTED" : "CANCEL_REQUESTED";
      return { ok: true, result, refundSatang: amount, replayed: true, shopSlug: o.shop.slug };
    }
    const { m, localDate, facts } = await manageOf(o);
    if (m.cancel === null || !facts) return blockedOf(o, m);
    // L1: ชนิด + รุ่นที่ลูกค้าเห็น (ผูกกับ nonce ด้วย MAC) · ชนิดไม่ตรงตอนนี้ ⇒ STATE_CHANGED (ไม่ยื่น)
    const seenKind = formStr(form, "kind");
    const seenV = formStr(form, "v");
    const kv = formStr(form, "kv");
    const kind = (SELF_CANCEL_KINDS as readonly string[]).find((k) => k === seenKind) as SelfCancelKind | undefined;
    if (!kind || seenV === null || !/^\d{1,10}$/.test(seenV) || kv === null || !safeEq(formMac(o, nc.nonce, kind, seenV), kv)) return fail("INVALID", { fields: ["nonce"], ...slug });
    const seenVersion = Number(seenV);
    if (m.cancel !== kind) return fail("STATE_CHANGED", slug);
    // ข้อ 8: ฟอร์ม — ผิด ⇒ ไม่เรียกบริการ
    const seenRaw = formStr(form, "seen");
    if (seenRaw === null || !SEEN_RE.test(seenRaw)) return fail("INVALID", { fields: ["seen"], ...slug });
    if (formStr(form, "accept") !== "on") return fail("ACCEPT_REQUIRED", slug);
    // ข้อ 9: ยอดใหม่ด้วยนาฬิกาเดียวกัน ≠ ยอดที่เห็น ⇒ AMOUNT_CHANGED
    const q = await quoteOf(o, m.cancel, localDate, facts.version);
    if (!q.ok) return { ...q, ...slug };
    const seen = Number(seenRaw);
    if (q.vm.refundSatang !== seen) return fail("AMOUNT_CHANGED", { refundSatang: q.vm.refundSatang, ...slug });
    // ข้อ 10: บริการ (PUBLIC + publicSelf · รุ่นที่ลูกค้าเห็น · เหตุคงที่ · ลูกค้า · เงิน)
    const r = await cancelTripBooking(
      ctxOf(o),
      { bookingId: o.row.bookingId, mode: "EXECUTE", reason: TRIPS_PUBLIC_SELF_REASON, reasonKind: "CUSTOMER", ...(kind === "UNPAID" ? {} : { choice: "MONEY" as const }), idempotencyKey },
      publicSelfOf(o, seenVersion),
    );
    if (r.ok) {
      const filed = r.value.requestId !== undefined;
      const matches = kind === "UNPAID" ? !filed && r.value.status === "CANCELLED" && r.value.computed.refundSatang === 0 : filed && r.value.computed.refundSatang === seen;
      return matches ? { ok: true, result: outcomeOf(kind), refundSatang: r.value.computed.refundSatang, replayed: false, shopSlug: o.shop.slug } : fail("STATE_CHANGED", slug);
    }
    if (r.code === "STATE_CONFLICT" && r.details?.reason === "REFUND_IN_PROGRESS") {
      const again = await manageOf(o);
      if (again.m.refund) return fail("DONE", { refund: again.m.refund, ...slug });
    }
    const mapped = mapService(r);
    return mapped.code === "NOT_FOUND" ? mapped : { ...mapped, ...slug };
  } catch {
    return fail("BUSY");
  }
}

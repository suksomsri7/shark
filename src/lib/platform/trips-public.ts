// ─────────────────────────────────────────────────────────────
// platform/trips-public.ts — ฝั่งเซิร์ฟเวอร์ของหน้าจองสาธารณะ `/book/[shop]` · RUN TRIPS W1.1a (ใบสั่ง ledger/trips-briefs/W1.1.md §4 §5)
//
// ตัวแก้ร้าน/หน่วย → กุญแจเครื่อง (HMAC มีกุญแจ) → ด่านอัตรา + ตัวนับเปิดดู (คำสั่งเดียว) → ตัวโหลด VM (อ่านอย่างเดียว)
//
// 🔴 ไม่ต้องล็อกอิน ⇒ ทุกอย่างที่นี่ถือว่าผู้เรียกไม่น่าไว้ใจ:
//    • "ไม่พบ" ตัวเดียวทุกสาเหตุ (ร้านไม่มี/ไม่ ACTIVE/ไม่มีหน่วยทัวร์/สินค้าไม่เผยแพร่/ของร้านอื่น) — ไม่มีรูปผลที่ต่างกัน · ไม่แคชข้ามคำขอ
//    • ด่านอัตรา **ปิดเมื่อพัง**: ไม่รู้ว่าใคร (ไม่มี IP ที่อ่านได้/ไม่มีกุญแจเซิร์ฟเวอร์) ⇒ ไม่ให้ผ่าน และไม่ถามฐาน · คำสั่งล้ม/ไม่คืนเลขนับ ⇒ ไม่ให้ผ่าน
//      (จงใจต่างจาก checkRateLimitDb ของ core ที่ปล่อยผ่านเมื่อฐานล่ม — ไฟล์นี้ไม่เรียกตัวนั้น)
//    • กุญแจเครื่อง = HMAC ของ IP รูปมาตรฐาน (IPv6 รวม /64) ด้วยกุญแจเซิร์ฟเวอร์ — ไม่มีกุญแจสำรอง ไม่มีแฮชเปล่า · ไม่ออกไปที่ไคลเอนต์ ไม่ลง log
//    • ตัวนับเปิดดู = ถังกันนับซ้ำ + upsert มีเพดาน ในคำสั่งเดียว — ไม่มีอ่านก่อนเขียน ไม่เปิดธุรกรรม
//      หน้าสินค้า (openBookProduct): ด่านอ่านก่อน → โหลดหน้า → **นับเมื่อรู้ว่าหน้าแสดงได้จริงเท่านั้น** (มติ X6: ไม่นับ 404/ถูกจำกัด/โหลดล่วงหน้า/บอต/ไม่ใช่ GET)
//      ⇒ หน้าสินค้าใช้ 2 คำสั่ง (ด่าน 1 + นับ 1) · bookPageGate ที่ส่ง unit มาเอง ยังนับในคำสั่งเดียวกับด่านตามสัญญาเดิม
//    • ผู้ใช้คือใคร: อ่านจากหัวคำขอที่เดียว (bookRequestFromHeaders → ตัวช่วยใน core) · production ไม่มีหัว IP จากขอบระบบ ⇒ ปิด (มติ X2)
//    • VM ไม่มี id ภายใน · เวลา `now` รับได้เฉพาะจาก opts ของผู้เรียกฝั่งเซิร์ฟเวอร์ (ข้อสอบ) — หน้าไม่ส่ง
// 🔴 เพดานทุกตัวมาจาก trips-public-core (ที่เดียว) — ไฟล์นี้ไม่มีตัวเลขเพดาน
// 🔴 ตารางของโมดูลทัวร์อ่านผ่าน facade `@/lib/modules/trips` เท่านั้น · ตารางเอเจนซี่ไม่แตะ (ลิงก์ผู้แนะนำเข้าทางช่องเสียบ registerBookLinkResolver)
// ─────────────────────────────────────────────────────────────
import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { rateBucketCte } from "@/lib/core/rate-limit-db";
import { resolveSettings } from "@/lib/core/settings";
import { getPublicBranding } from "@/lib/branding/service";
import { storagePathFromCdnUrl } from "@/lib/storage/service";
import { findPublicProduct, listAvailability, loadBookCatalog, loadBookDay, loadPublicCatalog, loadPublicProduct, loadSameDayProducts, normalizeTimezone, utcToLocal, type PublicRef, type PublicSlot } from "@/lib/modules/trips";
import { bookErrorParam, bookSelectHref, parseBookSelection, selectionQuery } from "./trips-book-core"; // TRIPS W1.4a ▸ ◂
import {
  BOOK_CODE_RE,
  BOOK_LIMITER_DOWN_RETRY_SEC,
  BOOK_MISS_LIMIT,
  BOOK_PRODUCT_CAP,
  BOOK_SAMEDAY_MAX,
  BOOK_SAMEDAY_SCAN_CAP,
  addBookDays,
  bookHref,
  bookReachOf,
  fullStateOf,
  nearbyDatesOf,
  type BookFullVM,
  type BookLocale,
  BOOK_PUBLIC_CHANNELS,
  BOOK_READ_LIMIT,
  BOOK_SLOT_CAP,
  BOOK_STAT_ROW_CAP,
  BOOK_UNIT_CAP,
  BOOK_VIEW_PER_CLIENT_DAY,
  BOOK_VIEW_WINDOW_MS,
  bookLocaleOf,
  bookViewCountable,
  canonicalClientIp,
  clampMonth,
  clientIpFromHeaders,
  dayCellOf,
  embedDomainsOf,
  frameAncestorsOf,
  isBookMonth,
  isBookYmd,
  monthGrid,
  monthNeighbours,
  monthRange,
  parseBookQuery,
  parseBookSlot,
  sellableCountOf,
  type BookBrandVM,
  type BookCarry,
  type BookDayVM,
  type BookProductVM,
  type BookPublicChannel,
  type BookShopVM,
  type BookSlotState,
  type BookSlotVM,
} from "./trips-public-core";

// ═══════════════ ชนิด ═══════════════
export type BookShop = { tenantId: string; slug: string; name: string; units: { id: string; slug: string; tz: string }[] };
export type BookNotFound = { ok: false; code: "NOT_FOUND" };
export type BookRateLimited = { ok: false; code: "RATE_LIMITED"; reason: "LIMIT" | "NO_CLIENT" | "LIMITER_DOWN"; retryAfterSec: number };
export type BookGateDeps = { query?: (sql: unknown) => Promise<unknown[]> };
export type BookOpts = { now?: Date; deps?: BookGateDeps };
export type BookGateInput = {
  tenantId: string | null;
  unit: { id: string; tz: string } | null;
  productId: string | null;
  clientKey: string | null;
  channel: BookPublicChannel;
  linkCode: string | null;
};
export type BookGateResult = { ok: true; counted: boolean; linkId: string | null } | BookRateLimited;
export type BookLinkResolver = (q: { tenantId: string; code: string }) => Promise<{ linkId: string; agentAccountId: string; productId: string | null; active: boolean } | null>;

const NOT_FOUND: BookNotFound = { ok: false, code: "NOT_FOUND" };
const notFound = (): BookNotFound => ({ ...NOT_FOUND });
const SHOP_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const CLIENT_KEY_RE = /^pc_[0-9a-f]{40}$/;
const CLIENT_KEY_CONTEXT = "trips.public.client.v1:";
const SECRET_MIN = 32;
const EMBED_KEY = "trips.public.embedDomains";
const MS_MIN = 60_000;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const nowOf = (o: BookOpts | undefined): Date => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? o.now : new Date());

// ═══════════════ กุญแจเครื่อง ═══════════════
/**
 * กุญแจเครื่องของด่านอัตรา/กันนับซ้ำ = "pc_" + HMAC-SHA256(กุญแจเซิร์ฟเวอร์, IP รูปมาตรฐาน) 40 ตัวแรก
 * ไม่มีกุญแจเซิร์ฟเวอร์ (หรือสั้นเกิน) / IP อ่านไม่ได้ ⇒ null — ผู้เรียกต้องปิด (ไม่มีกุญแจสำรอง)
 */
export function bookClientKey(ip: unknown): string | null {
  const secret = process.env.SESSION_SECRET;
  if (typeof secret !== "string" || secret.length < SECRET_MIN) return null;
  const canonical = canonicalClientIp(ip);
  if (!canonical) return null;
  return `pc_${createHmac("sha256", `${CLIENT_KEY_CONTEXT}${secret}`).update(canonical).digest("hex").slice(0, 40)}`;
}

// ═══════════════ ref สาธารณะ (W1.2a) ═══════════════
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
/**
 * ref สาธารณะของแถว = 12 ตัวแรก base32 ตัวเล็กของ HMAC(กุญแจ, "trips.public.ref.v1:"+ร้าน+":"+ชนิด+":"+id) — ผูกร้าน · ย้อนเป็น id ไม่ได้
 * ใช้ทั้งเส้นจอง (สินค้า/รายการเสริม/โซน) และตัวอ้างรอบ `t` (ชนิด slot · W1.2a มติ W5)
 */
export function bookPublicRef(secret: string, tenantId: string, kind: "product" | "extra" | "zone" | "slot", id: string): string {
  const buf = createHmac("sha256", secret).update(`trips.public.ref.v1:${tenantId}:${kind}:${id}`).digest();
  let out = "";
  let bits = 0;
  let acc = 0;
  for (const byte of buf) {
    acc = ((acc << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5 && out.length < 12) {
      out += B32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length >= 12) break;
  }
  return out;
}
/** ตัวอ้างรอบ `t` ของรอบ (ไม่มีกุญแจ ⇒ null — รอบนั้นเลือกด้วยลิงก์ไม่ได้) */
export function bookSlotToken(tenantId: string, departureId: string): string | null {
  const secret = process.env.SESSION_SECRET;
  if (typeof secret !== "string" || secret.length < SECRET_MIN || !tenantId || !departureId) return null;
  return bookPublicRef(secret, tenantId, "slot", departureId);
}

/**
 * คำขอนี้เป็นของใคร + นับเป็นการเปิดดูได้ไหม — ทางเดียวที่หน้าอ่านหัวคำขอ (ตัวตัดสินทั้งหมดอยู่ใน trips-public-core)
 * 🔴 production: ไม่มีหัว IP จากขอบระบบ (เซิร์ฟเวอร์เห็นแต่ที่อยู่ของเครื่องตัวเอง) ⇒ clientKey null ⇒ หน้าปิด — ห้ามตกถังรวมของ 127.0.0.1 (มติ X2 ข)
 *    นอก production ยอมให้ใช้ที่อยู่ของเครื่องเอง (พัฒนา/ทดสอบบนเครื่อง)
 */
export function bookRequestFromHeaders(get: (name: string) => string | null | undefined, method?: unknown): { clientKey: string | null; countView: boolean; acceptLanguage: string | null } {
  const read = (name: string): string | null => {
    try {
      const v = get(name);
      return typeof v === "string" ? v : null;
    } catch {
      return null;
    }
  };
  const ip = clientIpFromHeaders(read, { allowLoopback: process.env.NODE_ENV !== "production" });
  return { clientKey: ip === null ? null : bookClientKey(ip), countView: bookViewCountable({ method, get: read }), acceptLanguage: read("accept-language") };
}

// ═══════════════ บันทึกเหตุ (ไม่เกิน 1 แถวต่อนาทีต่อเรื่องต่อโพรเซส · มติ X9) ═══════════════
const lastNoteMs = new Map<string, number>();
/** detail มีแค่ชนิดของความผิดพลาด (ไม่มี IP/กุญแจเครื่อง/รหัสลิงก์/ชื่อร้าน/ข้อความของคำสั่ง) */
function noteOnce(topic: "limiter" | "branding" | "view", message: string, cause: unknown): void {
  const at = Date.now();
  const last = lastNoteMs.get(topic);
  if (last !== undefined && at - last < MS_MIN) return;
  lastNoteMs.set(topic, at);
  const kind = cause instanceof Error ? cause.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) : "BadResult";
  void logOps("WARN", "trips.public", message, { detail: kind || "Error" }).catch(() => undefined);
}

// ═══════════════ ช่องเสียบตัวแก้ลิงก์ผู้แนะนำ (?a) ═══════════════
let linkResolver: BookLinkResolver | null = null;
/** ลงทะเบียนตัวแก้รหัสลิงก์ของเอเจนซี่ (null = ถอน) — ยังไม่มีใครลงทะเบียนในโค้ดจริง ⇒ ทุกรหัส = ไม่ผูก */
export function registerBookLinkResolver(fn: BookLinkResolver | null): void {
  linkResolver = typeof fn === "function" ? fn : null;
}
type BoundLink = { linkId: string; agentAccountId: string };
/** ผูกรหัสกับลิงก์ของร้านนี้ — ตัวแก้ได้ tenantId ของร้านที่ resolve แล้วเสมอ · ผลผิดรูป/ปิด/ผูกสินค้าอื่น/ตัวแก้ล้ม ⇒ ไม่ผูก */
async function bindLink(tenantId: string, productId: string | null, code: string | null): Promise<BoundLink | null> {
  const fn = linkResolver;
  if (!fn || typeof code !== "string" || !BOOK_CODE_RE.test(code)) return null;
  try {
    const r = await fn({ tenantId, code });
    if (!isRec(r) || r.active !== true || !isId(r.linkId) || !isId(r.agentAccountId)) return null;
    if (r.productId !== null && r.productId !== productId) return null;
    return { linkId: r.linkId, agentAccountId: r.agentAccountId };
  } catch {
    return null;
  }
}

// ═══════════════ ตัวแก้ร้าน ═══════════════
/**
 * `[shop]` → ร้าน ACTIVE + หน่วยทัวร์ที่ ACTIVE — ไม่ใช่ ⇒ NOT_FOUND ตัวเดียวทุกสาเหตุ · slug ผิดรูปไม่ถามฐาน · ไม่แคช
 */
export async function resolveBookShop(shopSlug: unknown): Promise<{ ok: true; shop: BookShop } | BookNotFound> {
  if (typeof shopSlug !== "string") return notFound();
  const slug = shopSlug.trim().toLowerCase();
  if (!SHOP_SLUG_RE.test(slug)) return notFound();
  const tenant = await prisma.tenant.findFirst({ where: { slug, status: "ACTIVE" }, select: { id: true, slug: true, name: true } });
  if (!tenant) return notFound();
  const units = await prisma.businessUnit.findMany({
    where: { tenantId: tenant.id, type: "TRIPS", status: "ACTIVE" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: BOOK_UNIT_CAP,
    select: { id: true, slug: true, settings: true },
  });
  if (!units.length) return notFound();
  return {
    ok: true,
    shop: {
      tenantId: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      units: units.map((u) => ({ id: u.id, slug: u.slug, tz: normalizeTimezone(isRec(u.settings) ? u.settings.timezone : null) })),
    },
  };
}

// ═══════════════ ด่านอัตรา + ตัวนับเปิดดู ═══════════════
const limiterDown = (): BookRateLimited => ({ ok: false, code: "RATE_LIMITED", reason: "LIMITER_DOWN", retryAfterSec: BOOK_LIMITER_DOWN_RETRY_SEC });
const noClient = (): BookRateLimited => ({ ok: false, code: "RATE_LIMITED", reason: "NO_CLIENT", retryAfterSec: BOOK_LIMITER_DOWN_RETRY_SEC });
const defaultQuery = (sql: unknown): Promise<unknown[]> => prisma.$queryRaw<unknown[]>(sql as Prisma.Sql);
const intOf = (v: unknown): number | null => {
  const n = typeof v === "bigint" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
};
/** จดเหตุด่านใช้ไม่ได้ (จำกัดความถี่ — ฐานล่มแล้วทุกคำขอห้ามเพิ่มงานเขียนอีกแถว) */
function noteLimiterDown(cause: unknown): void {
  noteOnce("limiter", "ด่านอัตราของหน้าจองสาธารณะใช้ไม่ได้ — ปิดหน้าไว้ชั่วคราว", cause);
}

type ViewTarget = { tenantId: string; unit: { id: string; tz: string }; channel: BookPublicChannel; clientKey: string; link: BoundLink | null; now: Date };
/**
 * ส่วนของคำสั่งที่นับเปิดดู (ที่เดียว): ถังกันนับซ้ำต่อ (หน่วย · วันของร้าน · ช่องทาง · ลิงก์ · เครื่อง) → เพิ่มตัวนับ 1 เมื่อยังไม่เคยนับ
 * และหน่วยนั้นเป็นหน่วยทัวร์ ACTIVE ของร้านนี้จริง · ตัวนับไม่เกินเพดานแถว · `after` = นับเฉพาะเมื่อถังก่อนหน้าผ่าน
 */
function viewCtes(t: ViewTarget, after?: { after: string; limit: number }): Prisma.Sql[] {
  const day = utcToLocal(t.unit.tz, t.now).ymd;
  const viewKey = `trips:view:${t.unit.id}:${day}:${t.channel}:${t.link ? t.link.linkId : "-"}:${t.clientKey}`;
  return [
    rateBucketCte("vb", viewKey, BOOK_VIEW_WINDOW_MS, t.now.getTime(), after),
    Prisma.sql`st AS (
        INSERT INTO "TripLinkStat" ("id", "tenantId", "unitId", "day", "channel", "linkId", "agentAccountId", "views", "starts", "paid", "createdAt", "updatedAt")
        SELECT gen_random_uuid()::text, u."tenantId", u."id", ${day}::date, ${t.channel}::text, ${t.link ? t.link.linkId : null}::text, ${t.link ? t.link.agentAccountId : null}::text, 1, 0, 0, NOW(), NOW()
        FROM vb v JOIN "BusinessUnit" u ON u."id" = ${t.unit.id} AND u."tenantId" = ${t.tenantId} AND u."type"::text = 'TRIPS' AND u."status"::text = 'ACTIVE'
        WHERE v."count" <= ${BOOK_VIEW_PER_CLIENT_DAY}
        ON CONFLICT ("unitId", "day", "channel", "linkId") DO UPDATE SET "views" = LEAST("TripLinkStat"."views" + 1, ${BOOK_STAT_ROW_CAP}), "updatedAt" = NOW()
        RETURNING 1 AS "one")`,
  ];
}

/**
 * นับเปิดดู 1 ครั้ง (คำสั่งเดียว) — เรียกหลังรู้ว่าหน้าแสดงได้จริงเท่านั้น · ไม่ใช่ด่าน: ล้ม ⇒ ไม่นับ หน้าแสดงต่อ (จดเหตุแบบจำกัดความถี่)
 */
async function countBookView(t: ViewTarget, opts: BookOpts | undefined): Promise<boolean> {
  try {
    const sql = Prisma.sql`WITH ${Prisma.join(viewCtes(t), ", ")} SELECT (SELECT count(*)::int FROM st) AS "sn"`;
    const rows: unknown = await (typeof opts?.deps?.query === "function" ? opts.deps.query : defaultQuery)(sql);
    const row = Array.isArray(rows) && isRec(rows[0]) ? rows[0] : null;
    const n = row ? intOf(row.sn) : null;
    return n !== null && n > 0;
  } catch (e) {
    noteOnce("view", "นับยอดเปิดดูของหน้าจองสาธารณะไม่ได้ — หน้ายังแสดงตามปกติ", e);
    return false;
  }
}

/**
 * ด่านของหน้า: คำสั่ง SQL เดียวต่อการเรียก
 *  • ไม่มีร้าน (tenantId null) ⇒ ถังเดาต่อเครื่องถังเดียว
 *  • มีร้าน ⇒ ถังอ่านต่อ (ร้าน, เครื่อง)
 *  • มีหน่วย ⇒ ต่อท้ายในคำสั่งเดียวกัน: ถังกันนับซ้ำต่อ (หน่วย · วันของร้าน · ช่องทาง · ลิงก์ · เครื่อง) → เพิ่มตัวนับเปิดดู 1 เมื่อยังไม่เคยนับ
 *    และหน่วยนั้นเป็นหน่วยทัวร์ ACTIVE ของร้านนี้จริง (ด่านไม่เชื่อ id ที่ส่งมาเกินร้านที่ resolve แล้ว) · ตัวนับไม่เกินเพดานแถว
 * ผ่าน = มีเลขนับของถังและไม่เกินเพดาน — อย่างอื่นทั้งหมดไม่ผ่าน
 */
export async function bookPageGate(input: BookGateInput, opts?: BookOpts): Promise<BookGateResult> {
  const i: Record<string, unknown> = isRec(input) ? input : {};
  const clientKey = i.clientKey;
  if (typeof clientKey !== "string" || !CLIENT_KEY_RE.test(clientKey)) return noClient();
  const now = nowOf(opts);
  const nowMs = now.getTime();
  const tenantId = isId(i.tenantId) ? i.tenantId : null;
  const unitIn = isRec(i.unit) && isId(i.unit.id) ? { id: i.unit.id, tz: normalizeTimezone(i.unit.tz) } : null;
  const unit = tenantId ? unitIn : null;
  const productId = isId(i.productId) ? i.productId : null;
  const channel: BookPublicChannel = BOOK_PUBLIC_CHANNELS.find((c) => c === i.channel) ?? "WEB";
  const limit = tenantId ? BOOK_READ_LIMIT : BOOK_MISS_LIMIT;
  const readKey = tenantId ? `trips:book:${tenantId}:${clientKey}` : `trips:book:none:${clientKey}`;

  let link: BoundLink | null = null;
  let sql: Prisma.Sql;
  try {
    const ctes: Prisma.Sql[] = [rateBucketCte("rb", readKey, limit.windowMs, nowMs)];
    let tail = Prisma.sql`0 AS "sn"`;
    if (tenantId && unit) {
      link = await bindLink(tenantId, productId, typeof i.linkCode === "string" ? i.linkCode : null);
      ctes.push(...viewCtes({ tenantId, unit, channel, clientKey, link, now }, { after: "rb", limit: limit.limit }));
      tail = Prisma.sql`(SELECT count(*)::int FROM st) AS "sn"`;
    }
    sql = Prisma.sql`WITH ${Prisma.join(ctes, ", ")} SELECT (SELECT "count" FROM rb) AS "rc", (SELECT "windowStart" FROM rb) AS "rw", ${tail}`;
  } catch (e) {
    noteLimiterDown(e);
    return limiterDown();
  }

  let rows: unknown;
  try {
    rows = await (typeof opts?.deps?.query === "function" ? opts.deps.query : defaultQuery)(sql);
  } catch (e) {
    noteLimiterDown(e);
    return limiterDown();
  }
  const row = Array.isArray(rows) && isRec(rows[0]) ? rows[0] : null;
  const count = row ? intOf(row.rc) : null;
  if (row === null || count === null || count < 1) {
    noteLimiterDown(null);
    return limiterDown();
  }
  if (count > limit.limit) {
    const windowSec = Math.ceil(limit.windowMs / 1000);
    const startMs = row.rw instanceof Date && Number.isFinite(row.rw.getTime()) ? row.rw.getTime() : nowMs;
    const wait = Math.ceil((startMs + limit.windowMs - nowMs) / 1000);
    return { ok: false, code: "RATE_LIMITED", reason: "LIMIT", retryAfterSec: Math.min(windowSec, Math.max(1, wait)) };
  }
  const stat = intOf(row.sn);
  return { ok: true, counted: unit !== null && stat !== null && stat > 0, linkId: link ? link.linkId : null };
}

// ═══════════════ โดเมนฝัง ═══════════════
const FRAME_NONE = (): { frameAncestors: string; domains: string[] } => ({ frameAncestors: frameAncestorsOf(null), domains: [] });
/**
 * นโยบายฝังของหน่วย (ค่าตั้ง trips.public.embedDomains) — หน่วยไม่ใช่หน่วยทัวร์ ACTIVE ของร้าน ACTIVE นั้น / อ่านค่าตั้งไม่ได้ ⇒ 'none'
 * 🔴 ยังไม่ต่อเข้าหัว HTTP ในใบนี้ (หน้า /book ยังฝังไม่ได้ — proxy ส่ง X-Frame-Options DENY)
 */
export async function bookFramePolicy(ref: { tenantId: string; unitId: string }): Promise<{ frameAncestors: string; domains: string[] }> {
  try {
    if (!isRec(ref) || !isId(ref.tenantId) || !isId(ref.unitId)) return FRAME_NONE();
    const unit = await prisma.businessUnit.findFirst({ where: { id: ref.unitId, tenantId: ref.tenantId, type: "TRIPS", status: "ACTIVE", tenant: { status: "ACTIVE" } }, select: { id: true } });
    if (!unit) return FRAME_NONE();
    const r = await resolveSettings({ tenantId: ref.tenantId }, [EMBED_KEY], { unitId: unit.id });
    const domains = embedDomainsOf(r[EMBED_KEY]?.value);
    return { frameAncestors: frameAncestorsOf(domains), domains };
  } catch {
    return FRAME_NONE();
  }
}

// ═══════════════ ตัวโหลด VM (อ่านอย่างเดียว) ═══════════════
/** โลโก้แสดงเฉพาะไฟล์ที่อยู่บนที่เก็บไฟล์ของแพลตฟอร์ม (ตัวตรวจเดียวกับระบบไฟล์) — ที่อยู่ภายนอก/ไฟล์ส่วนตัว ⇒ ไม่แสดงรูป (มติ X10: ไม่ให้โฮสต์ภายนอกเห็น IP ผู้เข้าชม) */
function platformLogoOf(url: unknown): string | null {
  if (typeof url !== "string" || url === "" || !/^https:\/\//i.test(url)) return null;
  const path = storagePathFromCdnUrl(url);
  return path !== null && !path.includes("/private/") ? url : null;
}
async function brandOf(shop: BookShop): Promise<BookBrandVM> {
  try {
    const b = await getPublicBranding(shop.tenantId);
    return { slug: shop.slug, name: b.displayName || shop.name, logoUrl: platformLogoOf(b.logoUrl), brandColor: b.brandColor ?? null, brandFg: b.brandFg ?? null };
  } catch (e) {
    noteOnce("branding", "อ่านตราสินค้าของร้านสำหรับหน้าจองสาธารณะไม่ได้ — แสดงชื่อร้านอย่างเดียว", e);
    return { slug: shop.slug, name: shop.name, logoUrl: null, brandColor: null, brandFg: null };
  }
}
const refOf = (shop: BookShop): PublicRef => ({ tenantId: shop.tenantId, unitIds: shop.units.map((u) => u.id) });
/** นาทีที่เวลาร้านนำหน้า UTC ณ เวลานั้น */
function offsetMinOf(tz: string, at: Date): number {
  const l = utcToLocal(tz, at);
  const wall = Date.UTC(Number(l.ymd.slice(0, 4)), Number(l.ymd.slice(5, 7)) - 1, Number(l.ymd.slice(8, 10))) + l.minutes * MS_MIN;
  return Math.round((wall - Math.floor(at.getTime() / MS_MIN) * MS_MIN) / MS_MIN);
}

async function shopVM(shop: BookShop, locale: "th" | "en"): Promise<BookShopVM> {
  const [brand, cat] = await Promise.all([brandOf(shop), loadPublicCatalog(refOf(shop), { locale, take: BOOK_PRODUCT_CAP })]);
  return { shop: brand, locale, products: cat.products, total: cat.total, shown: cat.products.length, truncated: cat.total > cat.products.length };
}

/**
 * ตัวอ้างรอบ `t` ของทุกรอบในวันที่เลือก = ref สาธารณะของ id รอบ (มติ W5 · ไม่อิงลำดับในวัน)
 * id รอบมาจากตัวอ่านของเส้นจอง (loadBookDay · listAvailability ตัวกรองสาธารณะชุดเดียวกัน) จับคู่ทีละตำแหน่ง
 * แล้วตรวจ (เวลาออก · ช่วงเวลา · ชื่อตัวเลือก) ทุกแถว (มติ Y3) — จำนวนไม่เท่า/แถวไม่ตรง (รอบเพิ่ม/หายระหว่างสองคิวรี) ⇒ null ทั้งวัน
 * คู่ (เวลาออก · ช่วงเวลา · ตัวเลือก) ที่ซ้ำกันในวันเดียว = แยกกันไม่ได้ด้วยตำแหน่ง ⇒ ตัวอ้างของทุกแถวในคู่นั้นเป็น null (เลือกด้วยลิงก์ไม่ได้ · ไม่ชี้ผิดรอบ)
 */
async function slotTokensOfDay(shop: BookShop, ask: ProductAsk, date: string, slots: readonly PublicSlot[], now: Date): Promise<(string | null)[]> {
  const none = slots.map(() => null);
  try {
    const rows = await loadBookDay({ tenantId: shop.tenantId, unitId: ask.unit.id, productId: ask.productId, tz: ask.unit.tz }, date, { now, locale: ask.locale });
    if (!rows || rows.length !== slots.length) return none;
    const keyOf = (startsAt: string, timeText: string, opt: { text: string | null; fallback: boolean }): string => JSON.stringify([Date.parse(startsAt), timeText, opt.text, opt.fallback]);
    const seen = new Map<string, number>();
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k];
      const s = slots[k];
      if (!r || !s) return none;
      const key = keyOf(r.startsAt, r.timeText, r.optionName);
      if (key !== keyOf(s.startsAt, s.timeText, s.optionName)) return none;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return rows.map((r) => ((seen.get(keyOf(r.startsAt, r.timeText, r.optionName)) ?? 0) > 1 ? null : bookSlotToken(shop.tenantId, r.departureId)));
  } catch {
    return none;
  }
}
type ProductAsk = { productSlug: string; productId: string; unit: { id: string; tz: string }; locale: "th" | "en"; month: unknown; date: unknown; slot: unknown };
async function productVM(shop: BookShop, ask: ProductAsk, now: Date): Promise<BookProductVM | null> {
  const tz = ask.unit.tz;
  const today = utcToLocal(tz, now).ymd;
  const date = isBookYmd(ask.date) ? ask.date : null;
  const month = clampMonth(isBookMonth(ask.month) ? ask.month : date ? date.slice(0, 7) : null, today);
  const range = monthRange(month);
  const grid = monthGrid(month);
  if (!range || !grid) return null;
  const [brand, data] = await Promise.all([
    brandOf(shop),
    // สินค้า + หน่วย + เขตเวลา มาจากตัวแก้ของคำขอนี้แล้ว — ส่งต่อ ไม่ค้นซ้ำ (มติ X9)
    loadPublicProduct(refOf(shop), { productSlug: ask.productSlug, locale: ask.locale, from: range.from, to: range.to, found: { productId: ask.productId, unitId: ask.unit.id, tz } }, { now }),
  ]);
  if (!data) return null;

  const byDate = new Map<string, number[]>();
  data.slots.forEach((s, idx) => {
    const list = byDate.get(s.localDate);
    if (list) list.push(idx);
    else byDate.set(s.localDate, [idx]);
  });
  const slotsOf = (ymd: string) => (byDate.get(ymd) ?? []).flatMap((idx) => {
    const s = data.slots[idx];
    return s ? [s] : [];
  });
  const cells = new Map<string, { state: BookDayVM["state"]; left: number | null; selectable: boolean; departures: number }>();
  for (const ymd of grid.flat()) {
    if (ymd === null) continue;
    const list = slotsOf(ymd);
    const c = dayCellOf(list, ymd, today);
    const selectable = c.state === "OPEN" || c.state === "LOW";
    cells.set(ymd, { state: c.state, left: c.left, selectable, departures: selectable ? sellableCountOf(list) : 0 });
  }
  const requested = date !== null && date.slice(0, 7) === month ? date : null;
  const firstSelectable = [...cells.entries()].find(([, c]) => c.selectable)?.[0] ?? null;
  const selectedDate = requested !== null && cells.get(requested)?.selectable ? requested : firstSelectable;
  const requestedUnavailable = requested !== null && cells.get(requested)?.selectable !== true;

  let selected: BookProductVM["selected"] = null;
  let offsetAt = now;
  if (selectedDate !== null) {
    // ทุกรอบของวันนั้น (เรียงเวลาออก) — สภาพต่อรอบตัดสินด้วย dayCellOf ตัวเดียวกับช่องปฏิทิน
    const day = (byDate.get(selectedDate) ?? []).flatMap((idx) => {
      const s = data.slots[idx];
      if (!s) return [];
      const c = dayCellOf([s], selectedDate, today);
      const state: BookSlotState = c.state === "OPEN" || c.state === "LOW" || c.state === "FULL" || c.state === "NOT_RUNNING" ? c.state : "CLOSED";
      return [{ idx, s, state, left: c.left, sellable: state === "OPEN" || state === "LOW" }];
    });
    const tokens = await slotTokensOfDay(shop, ask, selectedDate, day.map((d) => d.s), now);
    // เกินเพดาน ⇒ รอบที่ขายได้มาก่อน แล้วเติมรอบอื่นจนเต็ม (ลำดับที่แสดงยังเป็นเวลาออก)
    const keep = new Set<number>();
    day.forEach((d, k) => {
      if (d.sellable && keep.size < BOOK_SLOT_CAP) keep.add(k);
    });
    day.forEach((_, k) => {
      if (keep.size < BOOK_SLOT_CAP) keep.add(k);
    });
    const shown = day.map((d, k) => ({ ...d, token: d.sellable ? (tokens[k] ?? null) : null })).filter((_, k) => keep.has(k));
    // รอบที่หน้าอ้างถึง: รอบที่ขอ (ตัวอ้างตรงรูปและเป็นรอบที่ขายได้ของวันนี้) ไม่งั้นรอบแรกที่ขายได้ — หัวหน้า/ตารางราคา/ที่ว่างมาจากรอบนี้รอบเดียว (มติ X4)
    const want = typeof ask.slot === "string" ? ask.slot : null;
    const chosen = (want === null ? undefined : shown.find((d) => d.sellable && d.token !== null && d.token === want)) ?? shown.find((d) => d.sellable) ?? null;
    const pr = chosen === null ? null : await data.priceOf(chosen.idx);
    const price = pr && pr.ok ? pr.price : null;
    const froms = await Promise.all(shown.map((d) => (d === chosen ? Promise.resolve(price ? price.headline : null) : d.sellable ? data.fromOf(d.idx) : Promise.resolve(null))));
    const slots: BookSlotVM[] = shown.map((d, k) => ({
      timeText: d.s.timeText,
      optionName: d.s.optionName,
      state: d.state,
      left: d.left,
      capacity: d.s.capacity,
      guaranteed: d.s.guaranteed,
      cutoffLocal: d.s.cutoffLocal,
      token: d.token,
      selectable: d.sellable && d.token !== null,
      selected: d === chosen,
      from: froms[k] ?? null,
    }));
    selected = { date: selectedDate, slots, moreSlots: day.length - shown.length, price, priceError: pr && pr.ok ? null : pr ? pr.code : "NOT_FOUND" };
    const startMs = chosen === null ? Number.NaN : Date.parse(chosen.s.startsAt);
    if (Number.isFinite(startMs)) offsetAt = new Date(startMs);
  }
  const nb = monthNeighbours(month, today);
  return {
    shop: brand,
    locale: ask.locale,
    product: data.product,
    // ส่วนต่างจาก UTC คิด ณ เวลาออกของรอบที่เลือก (เขตที่มีเวลาออมแสง: ค่าของวันเดินทาง ไม่ใช่ของวันนี้ · มติ X10) — ยังไม่มีรอบที่เลือก ⇒ ณ ตอนนี้
    tz: { name: tz, offsetMin: offsetMinOf(tz, offsetAt) },
    today,
    month,
    prevMonth: nb.prev,
    nextMonth: nb.next,
    weeks: grid.map((w) =>
      w.map((ymd): BookDayVM | null => {
        const c = ymd === null ? undefined : cells.get(ymd);
        if (ymd === null || !c) return null;
        return { date: ymd, day: Number(ymd.slice(8, 10)), state: c.state, left: c.left, selectable: c.selectable, selected: ymd === selectedDate, departures: c.departures };
      }),
    ),
    requestedUnavailable,
    selected,
    cta: { enabled: false, reason: null },
  };
}

/** สินค้าที่มองเห็นของร้านนี้ + หน่วยของมัน (ไม่เห็น ⇒ null) */
async function visibleProduct(shop: BookShop, productSlug: unknown): Promise<{ productId: string; productSlug: string; unit: { id: string; tz: string } } | null> {
  if (typeof productSlug !== "string") return null;
  const found = await findPublicProduct(refOf(shop), productSlug);
  if (!found) return null;
  const unit = shop.units.find((u) => u.id === found.unitId);
  return unit ? { productId: found.productId, productSlug, unit: { id: unit.id, tz: unit.tz } } : null;
}

/** หน้ารายการสินค้าของร้าน — อ่านอย่างเดียว ไม่ผ่านด่าน (หน้าจริงใช้ openBookShop เท่านั้น ทั้งเนื้อหาและชื่อหน้า · ตัวนี้สำหรับผู้เรียกฝั่งเซิร์ฟเวอร์/ข้อสอบ) */
export async function loadBookShopVM(input: { shop: unknown; lang?: unknown; acceptLanguage?: unknown }): Promise<{ ok: true; vm: BookShopVM } | BookNotFound> {
  const i: Record<string, unknown> = isRec(input) ? input : {};
  const r = await resolveBookShop(i.shop);
  if (!r.ok) return notFound();
  return { ok: true, vm: await shopVM(r.shop, bookLocaleOf(i.lang, i.acceptLanguage)) };
}

/** หน้าสินค้าทัวร์ — อ่านอย่างเดียว ไม่ผ่านด่าน (หน้าจริงใช้ openBookProduct เท่านั้น) · `slot` = ตัวอ้างรอบของ `?t=` */
export async function loadBookProductVM(
  input: { shop: unknown; productSlug: unknown; lang?: unknown; acceptLanguage?: unknown; month?: unknown; date?: unknown; slot?: unknown },
  opts?: BookOpts,
): Promise<{ ok: true; vm: BookProductVM } | BookNotFound> {
  const i: Record<string, unknown> = isRec(input) ? input : {};
  const r = await resolveBookShop(i.shop);
  if (!r.ok) return notFound();
  const p = await visibleProduct(r.shop, i.productSlug);
  if (!p) return notFound();
  const vm = await productVM(r.shop, { productSlug: p.productSlug, productId: p.productId, unit: p.unit, locale: bookLocaleOf(i.lang, i.acceptLanguage), month: i.month, date: i.date, slot: parseBookSlot({ t: i.slot }) }, nowOf(opts));
  return vm ? { ok: true, vm } : notFound();
}

// ═══════════════ ทางเข้าเดียวของหน้า ═══════════════
type OpenFail = BookNotFound | BookRateLimited;
/** คำขอที่หาไม่เจอ: นับในถังเดาของเครื่อง — ผ่าน ⇒ ไม่พบ · ไม่ผ่าน ⇒ ถี่เกิน */
async function miss(clientKey: string, opts: BookOpts | undefined): Promise<OpenFail> {
  const g = await bookPageGate({ tenantId: null, unit: null, productId: null, clientKey, channel: "WEB", linkCode: null }, opts);
  return g.ok ? notFound() : g;
}

/** หน้ารายการ: ไม่รู้ว่าใคร ⇒ ปิด → แก้ร้าน → ด่าน → โหลด · ไม่นับเปิดดู (ร้านมีหลายหน่วยได้) */
export async function openBookShop(
  input: { shop: unknown; query?: unknown; acceptLanguage?: unknown; clientKey: string | null },
  opts?: BookOpts,
): Promise<{ ok: true; vm: BookShopVM; carry: BookCarry } | OpenFail> {
  const i: Record<string, unknown> = isRec(input) ? input : {};
  const clientKey = typeof i.clientKey === "string" && CLIENT_KEY_RE.test(i.clientKey) ? i.clientKey : null;
  if (clientKey === null) return noClient();
  const q = parseBookQuery(i.query);
  const r = await resolveBookShop(i.shop);
  if (!r.ok) return miss(clientKey, opts);
  const g = await bookPageGate({ tenantId: r.shop.tenantId, unit: null, productId: null, clientKey, channel: "WEB", linkCode: null }, opts);
  if (!g.ok) return g;
  return { ok: true, vm: await shopVM(r.shop, bookLocaleOf(q.lang, i.acceptLanguage)), carry: { lang: q.lang, a: null } };
}

/**
 * หน้าสินค้า: ไม่รู้ว่าใคร ⇒ ปิด → แก้ร้าน + หาสินค้าที่มองเห็น → ด่านอ่าน → โหลด → (หน้าแสดงได้จริง) ผูก `?a` + นับเปิดดู
 * `?s` อ่านรูปแล้วทิ้ง · `?a` พาต่อเฉพาะที่ผูกได้ · `?t` = ตัวอ้างรอบ (ตรวจรูป · ไม่ตรง ⇒ รอบแรกที่ขายได้)
 * `countView: false` = คำขอที่ไม่ใช่การเปิดดูของคน (โหลดล่วงหน้า/บอต/ไม่ใช่ GET — หน้าตัดสินด้วย bookRequestFromHeaders) ⇒ ได้หน้าตามปกติแต่ไม่นับ
 * 🔴 ไม่พบ / ถูกจำกัด / โหลดหน้าไม่ได้ ⇒ ไม่มีการนับ (คำสั่งนับรันหลัง VM พร้อมเท่านั้น)
 */
export async function openBookProduct(
  input: { shop: unknown; productSlug: unknown; query?: unknown; acceptLanguage?: unknown; clientKey: string | null; countView?: boolean },
  opts?: BookOpts,
): Promise<{ ok: true; vm: BookProductVM; carry: BookCarry } | OpenFail> {
  const i: Record<string, unknown> = isRec(input) ? input : {};
  const clientKey = typeof i.clientKey === "string" && CLIENT_KEY_RE.test(i.clientKey) ? i.clientKey : null;
  if (clientKey === null) return noClient();
  const q = parseBookQuery(i.query);
  const r = await resolveBookShop(i.shop);
  if (!r.ok) return miss(clientKey, opts);
  const p = await visibleProduct(r.shop, i.productSlug);
  if (!p) return miss(clientKey, opts);
  const g = await bookPageGate({ tenantId: r.shop.tenantId, unit: null, productId: null, clientKey, channel: "WEB", linkCode: null }, opts);
  if (!g.ok) return g;
  const now = nowOf(opts);
  const vm = await productVM(r.shop, { productSlug: p.productSlug, productId: p.productId, unit: p.unit, locale: bookLocaleOf(q.lang, i.acceptLanguage), month: q.m, date: q.d, slot: parseBookSlot(i.query) }, now);
  if (!vm) return notFound();
  // TRIPS W1.2 ▸ ปุ่มจอง: รอบที่เลือกขายได้ ⇒ ด่านเปิดปุ่มเดียวกับเส้นจอง (bookSaleState · มติ R7 R8) ◂
  if (vm.selected?.slots.some((s) => s.selected && s.selectable)) {
    const st = await bookSaleState({ tenantId: r.shop.tenantId, unitId: p.unit.id, productId: p.productId }, now);
    vm.cta = { enabled: st === "OPEN", reason: st === "OPEN" ? null : st };
  }
  // TRIPS W1.4a ▸ ก้อนรอบเต็มของวันที่ขอ (`d` ในเดือนที่แสดง · e=SOLD_OUT) — คนที่ต้องการจาก `n.*` ที่ตรวจรูปแล้ว (ประเภทที่นับที่นั่ง) ◂
  if (q.d !== null && q.d.slice(0, 7) === vm.month) {
    const pax = parseBookSelection(i.query)?.pax ?? null;
    const seatsOf = async () => {
      const seat = new Set((await loadBookCatalog({ tenantId: r.shop.tenantId, unitId: p.unit.id, productId: p.productId }, vm.locale)).paxTypes.filter((x) => x.seat && x.active).map((x) => x.code));
      const n = (pax ?? []).reduce((sum, x) => sum + (seat.has(x.code) ? x.qty : 0), 0);
      return n > 0 ? n : null;
    };
    vm.full = await bookFullOf(r.shop, { ...p, date: q.d, slot: parseBookSlot(i.query), error: bookErrorParam(i.query)?.code ?? null, want: pax ? seatsOf : async () => null, nq: pax ? selectionQuery({ pax, extras: [], zone: null }) : {}, lang: q.lang, locale: vm.locale }, now);
  }
  const link = await bindLink(r.shop.tenantId, p.productId, q.a);
  if (i.countView !== false) await countBookView({ tenantId: r.shop.tenantId, unit: p.unit, channel: "WEB", clientKey, link, now }, opts);
  return { ok: true, vm, carry: { lang: q.lang, a: link !== null ? q.a : null } };
}

// ═══════════════ TRIPS W1.2 ▸ ตัวช่วยที่เส้นจอง (platform/trips-book) ใช้ร่วม ◂ ═══════════════
const K_BOOKING_ON = "trips.public.bookingEnabled";
const K_CONFIRM_MODE = "trips.sell.confirmMode";
/**
 * ด่าน "เปิดปุ่มจอง" (ใบสั่ง W1.2 §4 ข้อ 4 · มติ R7 R8) — ตัวเดียวทั้งหน้าสินค้าและเส้นจอง
 * ค่าตั้งของหน่วยไม่ใช่ true ⇒ BOOKING_OFF · สินค้าเป็น "ร้านยืนยันก่อน" ⇒ SHOP_CONFIRMS · อ่านค่าตั้งไม่ได้ ⇒ UNAVAILABLE (ปิดเมื่อพัง)
 */
export async function bookSaleState(ref: { tenantId: string; unitId: string; productId: string }, now: Date): Promise<"OPEN" | "BOOKING_OFF" | "SHOP_CONFIRMS" | "UNAVAILABLE"> {
  try {
    const r = await resolveSettings({ tenantId: ref.tenantId }, [K_BOOKING_ON, K_CONFIRM_MODE], { unitId: ref.unitId, productId: ref.productId }, now);
    const on = r[K_BOOKING_ON]?.value;
    const mode = r[K_CONFIRM_MODE]?.value;
    if (typeof on !== "boolean" || (mode !== "AUTO" && mode !== "SHOP_CONFIRMS")) return "UNAVAILABLE";
    if (on !== true) return "BOOKING_OFF";
    return mode === "SHOP_CONFIRMS" ? "SHOP_CONFIRMS" : "OPEN";
  } catch {
    return "UNAVAILABLE";
  }
}
/** สินค้าทัวร์ที่มองเห็นของร้านนี้ + หน่วย (ตัวแก้เดียวกับหน้าสินค้า) — ไม่เห็น ⇒ null */
export async function bookVisibleProduct(shop: BookShop, productSlug: unknown): Promise<{ productId: string; productSlug: string; unit: { id: string; tz: string } } | null> {
  return visibleProduct(shop, productSlug);
}
/** คำขอที่หาไม่เจอของเส้นจอง: ถังเดาเดียวกับหน้าอ่าน (ผ่าน ⇒ ไม่พบ · ไม่ผ่าน ⇒ ถี่เกิน) */
export async function bookMiss(clientKey: string, opts?: BookOpts): Promise<BookNotFound | BookRateLimited> {
  return miss(clientKey, opts);
}
/** ตราสินค้าของร้าน (ตัวอ่านเดียวกับหน้าสินค้า · ล้ม ⇒ ชื่อร้านอย่างเดียว) */
export async function bookBrandOf(shop: BookShop): Promise<BookBrandVM> {
  return brandOf(shop);
}

// ═══════════════ TRIPS W1.4a ▸ ก้อนรอบเต็ม (ใบสั่ง W1.4 §4.1 · ใช้ทั้งหน้าสินค้าและหน้าการจองที่หมดเวลา) ◂ ═══════════════
const K_SHOP_CONTACT = "trips.public.shopContact";
const ymdOfRow = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
export type BookFullAsk = { productId: string; productSlug: string; unit: { id: string; tz: string }; date: string; slot: string | null; error: string | null; want: () => Promise<number | null>; nq: Record<string, string>; lang: BookLocale | null; locale: BookLocale };
/**
 * วันที่ `date` เต็ม (fullStateOf) ⇒ ก้อนทางเลือก · ไม่เต็ม ⇒ null — อ่าน listAvailability ครั้งเดียว 15 วัน + สินค้าวันเดียวกัน ≤ BOOK_SAMEDAY_SCAN_CAP
 * ไม่กินถังอัตรา (อยู่ในเส้นเปิดหน้าเดิม) · อ่านล้ม ⇒ null (ก้อนวันที่ขอ) หรือรายการว่าง (ทางเลือก) — หน้าไม่ล่ม
 */
export async function bookFullOf(shop: BookShop, a: BookFullAsk, now: Date): Promise<BookFullVM | null> {
  try {
    const ctx = { tenantId: shop.tenantId, unitId: a.unit.id, channel: "WEB" as const, actor: { kind: "PUBLIC" as const, clientKey: "book-view" }, now, locale: a.locale };
    const av = await listAvailability(ctx, { productId: a.productId, from: addBookDays(a.date, -7), to: addBookDays(a.date, 7) });
    if (!av.ok) return null;
    const day = av.value.filter((x) => ymdOfRow(x.localDate) === a.date);
    if (!fullStateOf({ slots: day.map((x) => ({ left: x.publicLeft, saleBlock: x.saleBlock })), error: a.error, want: null })) return null;
    const open = day.filter((x) => x.saleBlock === null);
    const pick = a.slot ? open.find((x) => bookSlotToken(shop.tenantId, x.slotId) === a.slot) : undefined;
    const left = pick ? pick.publicLeft : Math.max(0, ...open.map((x) => x.publicLeft));
    const want = await a.want().catch(() => null);
    const need = Math.max(want ?? 1, 1);
    const byDay = new Map<string, { date: string; left: number; sellable: boolean }>();
    for (const x of av.value) {
      const d = ymdOfRow(x.localDate), cur = byDay.get(d) ?? { date: d, left: 0, sellable: false };
      if (x.saleBlock === null && x.publicLeft > 0) byDay.set(d, { date: d, left: Math.max(cur.left, x.publicLeft), sellable: true });
      else byDay.set(d, cur);
    }
    const back = (d: string, nq: Record<string, string>) => ({ ...(a.lang ? { lang: a.lang } : {}), m: d.slice(0, 7), d, ...nq });
    const nearby = nearbyDatesOf({ selected: a.date, want, days: [...byDay.values()] }).map((x) => ({ ...x, href: bookSelectHref(shop.slug, { productSlug: a.productSlug, query: back(x.date, a.nq) }) }));
    const sameDay: BookFullVM["sameDay"] = [];
    const others = await loadSameDayProducts({ tenantId: shop.tenantId, unitId: a.unit.id }, { date: a.date, excludeProductId: a.productId, locale: a.locale, take: BOOK_SAMEDAY_SCAN_CAP }).catch(() => []);
    for (const o of others) {
      if (sameDay.length >= BOOK_SAMEDAY_MAX) break;
      if ((await bookSaleState({ tenantId: shop.tenantId, unitId: a.unit.id, productId: o.productId }, now)) !== "OPEN") continue;
      const oa = await listAvailability(ctx, { productId: o.productId, from: a.date, to: a.date }).catch(() => null);
      const best = oa && oa.ok ? Math.max(0, ...oa.value.filter((x) => x.saleBlock === null).map((x) => x.publicLeft)) : 0;
      if (best >= need) sameDay.push({ title: o.title, left: best, href: bookHref(shop.slug, o.slug, back(a.date, {})) });
    }
    const c = await resolveSettings({ tenantId: shop.tenantId }, [K_SHOP_CONTACT], { unitId: a.unit.id }, now).then((x) => x[K_SHOP_CONTACT]?.value).catch(() => null);
    const field = (k: string): string | null => { const v = isRec(c) ? c[k] : null; return typeof v === "string" && v.trim() ? v.trim() : null; };
    return { want, left, date: a.date, nearby, sameDay, contact: bookReachOf(shop.name, field("phone"), field("line")) };
  } catch {
    return null;
  }
}

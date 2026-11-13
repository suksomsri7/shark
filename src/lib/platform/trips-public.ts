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
//    • ตัวนับเปิดดู = คำสั่งเดียวกับด่าน (ถังกันนับซ้ำ + upsert มีเพดาน) — ไม่มีอ่านก่อนเขียน ไม่เปิดธุรกรรม ไม่มีคำสั่งที่สอง
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
import { findPublicProduct, loadPublicCatalog, loadPublicProduct, normalizeTimezone, utcToLocal, type PublicRef } from "@/lib/modules/trips";
import {
  BOOK_CODE_RE,
  BOOK_LIMITER_DOWN_RETRY_SEC,
  BOOK_MISS_LIMIT,
  BOOK_PRODUCT_CAP,
  BOOK_PUBLIC_CHANNELS,
  BOOK_READ_LIMIT,
  BOOK_STAT_ROW_CAP,
  BOOK_UNIT_CAP,
  BOOK_VIEW_PER_CLIENT_DAY,
  BOOK_VIEW_WINDOW_MS,
  bookLocaleOf,
  canonicalClientIp,
  clampMonth,
  dayCellOf,
  embedDomainsOf,
  frameAncestorsOf,
  isBookMonth,
  isBookYmd,
  monthGrid,
  monthNeighbours,
  monthRange,
  parseBookQuery,
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
/** จดเหตุด่านใช้ไม่ได้ — detail มีแค่ชนิดของความผิดพลาด (ไม่มี IP/กุญแจเครื่อง/รหัสลิงก์/ข้อความของคำสั่ง) */
function noteLimiterDown(cause: unknown): void {
  const kind = cause instanceof Error ? cause.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) : "BadResult";
  void logOps("WARN", "trips.public", "ด่านอัตราของหน้าจองสาธารณะใช้ไม่ได้ — ปิดหน้าไว้ชั่วคราว", { detail: kind || "Error" }).catch(() => undefined);
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
      const day = utcToLocal(unit.tz, now).ymd;
      const viewKey = `trips:view:${unit.id}:${day}:${channel}:${link ? link.linkId : "-"}:${clientKey}`;
      ctes.push(rateBucketCte("vb", viewKey, BOOK_VIEW_WINDOW_MS, nowMs, { after: "rb", limit: limit.limit }));
      ctes.push(Prisma.sql`st AS (
        INSERT INTO "TripLinkStat" ("id", "tenantId", "unitId", "day", "channel", "linkId", "agentAccountId", "views", "starts", "paid", "createdAt", "updatedAt")
        SELECT gen_random_uuid()::text, u."tenantId", u."id", ${day}::date, ${channel}::text, ${link ? link.linkId : null}::text, ${link ? link.agentAccountId : null}::text, 1, 0, 0, NOW(), NOW()
        FROM vb v JOIN "BusinessUnit" u ON u."id" = ${unit.id} AND u."tenantId" = ${tenantId} AND u."type"::text = 'TRIPS' AND u."status"::text = 'ACTIVE'
        WHERE v."count" <= ${BOOK_VIEW_PER_CLIENT_DAY}
        ON CONFLICT ("unitId", "day", "channel", "linkId") DO UPDATE SET "views" = LEAST("TripLinkStat"."views" + 1, ${BOOK_STAT_ROW_CAP}), "updatedAt" = NOW()
        RETURNING 1 AS "one")`);
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
async function brandOf(shop: BookShop): Promise<BookBrandVM> {
  try {
    const b = await getPublicBranding(shop.tenantId);
    return { slug: shop.slug, name: b.displayName || shop.name, logoUrl: b.logoUrl ?? null, brandColor: b.brandColor ?? null, brandFg: b.brandFg ?? null };
  } catch {
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

type ProductAsk = { productSlug: string; unit: { id: string; tz: string }; locale: "th" | "en"; month: unknown; date: unknown };
async function productVM(shop: BookShop, ask: ProductAsk, now: Date): Promise<BookProductVM | null> {
  const tz = ask.unit.tz;
  const today = utcToLocal(tz, now).ymd;
  const date = isBookYmd(ask.date) ? ask.date : null;
  const month = clampMonth(isBookMonth(ask.month) ? ask.month : date ? date.slice(0, 7) : null, today);
  const range = monthRange(month);
  const grid = monthGrid(month);
  if (!range || !grid) return null;
  const [brand, data] = await Promise.all([brandOf(shop), loadPublicProduct(refOf(shop), { productSlug: ask.productSlug, locale: ask.locale, from: range.from, to: range.to }, { now })]);
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
  const cells = new Map<string, { state: BookDayVM["state"]; left: number | null; selectable: boolean }>();
  for (const ymd of grid.flat()) {
    if (ymd === null) continue;
    const c = dayCellOf(slotsOf(ymd), ymd, today);
    cells.set(ymd, { state: c.state, left: c.left, selectable: c.state === "OPEN" || c.state === "LOW" });
  }
  const requested = date !== null && date.slice(0, 7) === month ? date : null;
  const firstSelectable = [...cells.entries()].find(([, c]) => c.selectable)?.[0] ?? null;
  const selectedDate = requested !== null && cells.get(requested)?.selectable ? requested : firstSelectable;
  const requestedUnavailable = requested !== null && cells.get(requested)?.selectable !== true;

  let selected: BookProductVM["selected"] = null;
  if (selectedDate !== null) {
    const idxs = byDate.get(selectedDate) ?? [];
    const slots: BookSlotVM[] = [];
    let priceIdx: number | null = null;
    for (const idx of idxs) {
      const s = data.slots[idx];
      if (!s) continue;
      const c = dayCellOf([s], selectedDate, today);
      const state: BookSlotState = c.state === "OPEN" || c.state === "LOW" || c.state === "FULL" || c.state === "NOT_RUNNING" ? c.state : "CLOSED";
      if (priceIdx === null && (state === "OPEN" || state === "LOW")) priceIdx = idx;
      slots.push({ timeText: s.timeText, optionName: s.optionName, state, left: c.left, capacity: s.capacity, guaranteed: s.guaranteed, cutoffLocal: s.cutoffLocal });
    }
    const pr = priceIdx === null ? null : await data.priceOf(priceIdx);
    selected = { date: selectedDate, slots, price: pr && pr.ok ? pr.price : null, priceError: pr && pr.ok ? null : pr ? pr.code : "NOT_FOUND" };
  }
  const nb = monthNeighbours(month, today);
  return {
    shop: brand,
    locale: ask.locale,
    product: data.product,
    tz: { name: tz, offsetMin: offsetMinOf(tz, now) },
    today,
    month,
    prevMonth: nb.prev,
    nextMonth: nb.next,
    weeks: grid.map((w) =>
      w.map((ymd): BookDayVM | null => {
        const c = ymd === null ? undefined : cells.get(ymd);
        if (ymd === null || !c) return null;
        return { date: ymd, day: Number(ymd.slice(8, 10)), state: c.state, left: c.left, selectable: c.selectable, selected: ymd === selectedDate };
      }),
    ),
    requestedUnavailable,
    selected,
    cta: { enabled: false },
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

/** หน้ารายการสินค้าของร้าน — อ่านอย่างเดียว ไม่ผ่านด่าน (หน้าใช้ openBookShop · ตัวนี้สำหรับ metadata) */
export async function loadBookShopVM(input: { shop: unknown; lang?: unknown; acceptLanguage?: unknown }, _opts?: BookOpts): Promise<{ ok: true; vm: BookShopVM } | BookNotFound> {
  const i: Record<string, unknown> = isRec(input) ? input : {};
  const r = await resolveBookShop(i.shop);
  if (!r.ok) return notFound();
  return { ok: true, vm: await shopVM(r.shop, bookLocaleOf(i.lang, i.acceptLanguage)) };
}

/** หน้าสินค้าทัวร์ — อ่านอย่างเดียว ไม่ผ่านด่าน (หน้าใช้ openBookProduct) */
export async function loadBookProductVM(
  input: { shop: unknown; productSlug: unknown; lang?: unknown; acceptLanguage?: unknown; month?: unknown; date?: unknown },
  opts?: BookOpts,
): Promise<{ ok: true; vm: BookProductVM } | BookNotFound> {
  const i: Record<string, unknown> = isRec(input) ? input : {};
  const r = await resolveBookShop(i.shop);
  if (!r.ok) return notFound();
  const p = await visibleProduct(r.shop, i.productSlug);
  if (!p) return notFound();
  const vm = await productVM(r.shop, { productSlug: p.productSlug, unit: p.unit, locale: bookLocaleOf(i.lang, i.acceptLanguage), month: i.month, date: i.date }, nowOf(opts));
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

/** หน้าสินค้า: ไม่รู้ว่าใคร ⇒ ปิด → แก้ร้าน + หาสินค้าที่มองเห็น → ด่าน (+ นับเปิดดู) → โหลด · `?s` อ่านรูปแล้วทิ้ง · `?a` พาต่อเฉพาะที่ผูกได้ */
export async function openBookProduct(
  input: { shop: unknown; productSlug: unknown; query?: unknown; acceptLanguage?: unknown; clientKey: string | null },
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
  const g = await bookPageGate({ tenantId: r.shop.tenantId, unit: p.unit, productId: p.productId, clientKey, channel: "WEB", linkCode: q.a }, opts);
  if (!g.ok) return g;
  const vm = await productVM(r.shop, { productSlug: p.productSlug, unit: p.unit, locale: bookLocaleOf(q.lang, i.acceptLanguage), month: q.m, date: q.d }, nowOf(opts));
  if (!vm) return notFound();
  return { ok: true, vm, carry: { lang: q.lang, a: g.linkId !== null ? q.a : null } };
}

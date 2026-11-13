// ─────────────────────────────────────────────────────────────
// platform/trips-public-core.ts — ตัวช่วยบริสุทธิ์ของหน้าจองสาธารณะ `/book/[shop]` (RUN TRIPS W1.1a · ใบสั่ง ledger/trips-briefs/W1.1.md §3)
//
// 🔴 pure ล้วน: ไม่มี import ค่า · ไม่มี I/O · ไม่อ่าน env · ไม่อ่านนาฬิกา (วัน/เวลารับเข้ามาเป็นข้อความเสมอ) · คิดวันด้วย UTC ล้วน
// 🔴 เพดานอัตราของหน้าอ่าน/ถังเดา/ตัวนับ อยู่ในตารางค่าคงที่ของไฟล์นี้ **ที่เดียว** (มติ R3) — ไฟล์อื่นห้ามมีตัวเลขเพดาน
// 🔴 IP ที่อ่านไม่ได้ ⇒ null เสมอ — ไม่มีถังรวมของ "ไม่รู้ว่าใคร" (ผู้เรียกต้องปิดเมื่อได้ null)
// ─────────────────────────────────────────────────────────────

export const BOOK_LOCALES = ["th", "en"] as const;
export type BookLocale = (typeof BOOK_LOCALES)[number];
export const BOOK_DAY_STATES = ["PAST", "NONE", "NOT_RUNNING", "CLOSED", "FULL", "LOW", "OPEN"] as const;
export type BookDayState = (typeof BOOK_DAY_STATES)[number];
/** ช่องทางของหน้าจองสาธารณะ (⊂ ช่องทางขายของ core/sellable — ไม่รวมแชท AI) */
export const BOOK_PUBLIC_CHANNELS = ["WEB", "LIFF", "EMBED"] as const;
export type BookPublicChannel = (typeof BOOK_PUBLIC_CHANNELS)[number];

// ═══════════════ ตารางเพดาน (ที่เดียว · R3) ═══════════════
/** เปิดหน้าของร้านที่มีจริง ต่อ (ร้าน, เครื่อง) */
export const BOOK_READ_LIMIT: { limit: number; windowMs: number } = { limit: 120, windowMs: 60_000 };
/** คำขอที่หาร้าน/สินค้าไม่เจอ ต่อเครื่อง (ถังเดียว ไม่แยกตามชื่อที่เดา) */
export const BOOK_MISS_LIMIT: { limit: number; windowMs: number } = { limit: 30, windowMs: 600_000 };
/** เครื่องหนึ่งนับเปิดดูได้กี่ครั้ง ต่อ (หน่วย · วันของร้าน · ช่องทาง · ลิงก์) */
export const BOOK_VIEW_PER_CLIENT_DAY = 1;
/** หน้าต่างของถังกันนับซ้ำ (กุญแจถังมีวันของร้านอยู่แล้ว — หน้าต่างนี้กันถังเก่าถูกนับต่อ) */
export const BOOK_VIEW_WINDOW_MS = 86_400_000;
/** เพดานตัวนับต่อแถวต่อวัน */
export const BOOK_STAT_ROW_CAP = 1_000_000;
/** จำนวนการ์ดสินค้าต่อหน้ารายการ */
export const BOOK_PRODUCT_CAP = 60;
/** ดูปฏิทินล่วงหน้าได้กี่เดือนนับจากเดือนนี้ */
export const BOOK_MONTHS_AHEAD = 12;
/** จำนวนหน่วยทัวร์ต่อร้านที่ตัวแก้ร้านอ่าน */
export const BOOK_UNIT_CAP = 20;
/** วินาทีที่บอกให้รอเมื่อด่านอัตราใช้ไม่ได้ */
export const BOOK_LIMITER_DOWN_RETRY_SEC = 60;
/** จำนวนโดเมนฝังสูงสุดที่ออกในนโยบาย */
export const BOOK_EMBED_DOMAIN_CAP = 20;
/** รูปของรหัสใน `?a` `?s` */
export const BOOK_CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const pad2 = (n: number): string => String(n).padStart(2, "0");

// ═══════════════ ภาษา ═══════════════
const isBookLocale = (v: unknown): v is BookLocale => v === "th" || v === "en";

/**
 * ภาษาของหน้า: `lang` ที่เป็น th/en ตรงตัวชนะ · ไม่งั้นอ่าน Accept-Language (เรียง q มาก→น้อย คงลำดับเดิมเมื่อเท่ากัน · q=0 ทิ้ง)
 * แท็กแรกที่ภาษาหลักเป็น th/en ⇒ ภาษานั้น · มีหัวแต่ไม่มีทั้งคู่ ⇒ en · ไม่มีหัว ⇒ th
 */
export function bookLocaleOf(lang: unknown, acceptLanguage: unknown): BookLocale {
  if (isBookLocale(lang)) return lang;
  if (typeof acceptLanguage !== "string" || acceptLanguage.trim() === "") return "th";
  const tags: { primary: string; q: number; i: number }[] = [];
  acceptLanguage.split(",").forEach((part, i) => {
    const [rawTag, ...params] = part.split(";");
    const primary = (rawTag ?? "").trim().toLowerCase().split("-")[0] ?? "";
    if (!primary) return;
    let q = 1;
    for (const p of params) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(p);
      if (m) q = Number(m[1]);
    }
    if (!Number.isFinite(q) || q <= 0) return;
    tags.push({ primary, q, i });
  });
  tags.sort((a, b) => b.q - a.q || a.i - b.i);
  for (const t of tags) if (isBookLocale(t.primary)) return t.primary;
  return "en";
}

// ═══════════════ IP ของเครื่อง ═══════════════
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
function ipv4Of(s: string): string | null {
  const m = IPV4_RE.exec(s);
  if (!m) return null;
  const parts = [m[1], m[2], m[3], m[4]].map((x) => Number(x));
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts.join(".");
}
/** IPv6 (ไม่มีวงเล็บ/พอร์ต/zone) ⇒ 8 กลุ่มเป็นเลข · ผิดรูป ⇒ null · ท้ายเป็น IPv4 ได้ (::ffff:a.b.c.d) */
function ipv6Groups(s: string): number[] | null {
  if (!s.includes(":") || !/^[0-9a-f:.]+$/.test(s)) return null;
  let body = s;
  let tail: number[] = [];
  if (body.includes(".")) {
    const cut = body.lastIndexOf(":");
    const v4 = ipv4Of(body.slice(cut + 1));
    if (!v4) return null;
    const o = v4.split(".").map((x) => Number(x));
    tail = [(o[0] ?? 0) * 256 + (o[1] ?? 0), (o[2] ?? 0) * 256 + (o[3] ?? 0)];
    body = body.slice(0, cut + 1);
    // "…::" คงไว้ · "…x:" ตัด ":" ท้ายออก
    if (!body.endsWith("::")) body = body.slice(0, -1);
    if (body === "") return null;
  }
  const want = 8 - tail.length;
  const halves = body.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(Number.parseInt(g, 16));
    }
    return out;
  };
  const left = parse(halves[0] ?? "");
  if (!left) return null;
  if (halves.length === 1) return left.length === want ? [...left, ...tail] : null;
  const right = parse(halves[1] ?? "");
  if (!right) return null;
  const fill = want - left.length - right.length;
  if (fill < 1) return null;
  return [...left, ...Array.from({ length: fill }, () => 0), ...right, ...tail];
}

/**
 * IP ในรูปมาตรฐานของด่านอัตรา: IPv4 ⇒ รูปจุด · IPv4-mapped ⇒ IPv4 · IPv6 ⇒ รวมเป็น /64 (เครื่องเดียวสุ่มท้าย /64 ได้ไม่จำกัด)
 * ตัดช่องว่าง · `[..]:port` · `:port` ของ IPv4 · `%zone` · อื่น ๆ ทั้งหมด ⇒ null (ไม่มีค่า "ไม่รู้")
 */
export function canonicalClientIp(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().toLowerCase();
  if (s === "" || s.length > 100 || s.includes(",")) return null;
  // รูปที่ฟังก์ชันนี้คืนเอง (…::/64) ต้องอ่านกลับได้ค่าเดิม — หน้าอ่าน IP จากหัวแล้วส่งต่อให้ตัวทำกุญแจ
  if (/^[0-9a-f:]+::\/64$/.test(s)) s = s.slice(0, -3);
  const br = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(s);
  if (br) s = br[1] ?? "";
  else if (!s.includes("[") && !s.includes("]")) {
    const v4port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(s);
    if (v4port) s = v4port[1] ?? "";
  } else return null;
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  const v4 = ipv4Of(s);
  if (v4) return v4;
  const g = ipv6Groups(s);
  if (!g) return null;
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    const hi = g[6] ?? 0;
    const lo = g[7] ?? 0;
    return `${Math.floor(hi / 256)}.${hi % 256}.${Math.floor(lo / 256)}.${lo % 256}`;
  }
  return `${g.slice(0, 4).map((n) => n.toString(16)).join(":")}::/64`;
}

const IP_HEADERS = ["x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"] as const;
/**
 * IP ของเครื่องจากหัวคำขอ (ลำดับเดียวกับหน้าโรงแรม) — หัวแรกที่มีค่า (ตัวแรกก่อนจุลภาค) เป็นตัวตัดสิน
 * อ่านไม่ได้ ⇒ null ไม่ไล่หัวถัดไป · ไม่มีหัวใดเลย ⇒ null
 */
export function clientIpFromHeaders(get: (name: string) => string | null | undefined): string | null {
  for (const name of IP_HEADERS) {
    let v: unknown;
    try {
      v = get(name);
    } catch {
      return null;
    }
    if (typeof v !== "string" || v.trim() === "") continue;
    return canonicalClientIp((v.split(",")[0] ?? "").trim());
  }
  return null;
}

// ═══════════════ พารามิเตอร์ของหน้า ═══════════════
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
/** วันที่ YYYY-MM-DD ที่มีจริงในปฏิทิน */
export function isBookYmd(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = YMD_RE.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
/** เดือน YYYY-MM (01–12) */
export function isBookMonth(v: unknown): v is string {
  return typeof v === "string" && YM_RE.test(v);
}

export type BookQuery = { lang: BookLocale | null; a: string | null; s: string | null; d: string | null; m: string | null };
/** อ่านพารามิเตอร์ของหน้า — ค่าต้องเป็นสตริงเดี่ยวและตรงรูป ไม่งั้น null · คีย์อื่นทิ้ง · ไม่ throw */
export function parseBookQuery(sp: unknown): BookQuery {
  const r: Record<string, unknown> = isRec(sp) ? sp : {};
  const str = (k: string): string | null => {
    let v: unknown;
    try {
      v = r[k];
    } catch {
      return null;
    }
    return typeof v === "string" ? v : null;
  };
  const lang = str("lang");
  const a = str("a");
  const s = str("s");
  const d = str("d");
  const m = str("m");
  return {
    lang: isBookLocale(lang) ? lang : null,
    a: a !== null && BOOK_CODE_RE.test(a) ? a : null,
    s: s !== null && BOOK_CODE_RE.test(s) ? s : null,
    d: isBookYmd(d) ? d : null,
    m: isBookMonth(m) ? m : null,
  };
}

/** ลิงก์ของหน้าจอง — ส่วน path เข้ารหัส · query ลำดับตายตัว lang, a, m, d · ค่าว่างไม่ใส่ */
export function bookHref(shop: string, productSlug: string | null, q?: { lang?: string | null; a?: string | null; m?: string | null; d?: string | null }): string {
  const path = `/book/${encodeURIComponent(String(shop))}${productSlug === null || productSlug === undefined || productSlug === "" ? "" : `/t/${encodeURIComponent(String(productSlug))}`}`;
  const parts: string[] = [];
  for (const k of ["lang", "a", "m", "d"] as const) {
    const v = q?.[k];
    if (typeof v === "string" && v !== "") parts.push(`${k}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `${path}?${parts.join("&")}` : path;
}

// ═══════════════ ปฏิทิน ═══════════════
const monthIndex = (month: string): number => Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1);
const monthOfIndex = (i: number): string => `${String(Math.floor(i / 12)).padStart(4, "0")}-${pad2((i % 12) + 1)}`;

/** ตารางเดือน: แถวสัปดาห์เริ่มวันอาทิตย์ 7 ช่อง · ช่องนอกเดือน = null · เดือนผิดรูป ⇒ null */
export function monthGrid(month: string): (string | null)[][] | null {
  if (!isBookMonth(month)) return null;
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${pad2(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** เดือนที่ดูได้: อยู่ในช่วง [เดือนของ today, +BOOK_MONTHS_AHEAD] ⇒ ค่านั้น · นอกช่วง/ผิดรูป ⇒ เดือนของ today */
export function clampMonth(month: unknown, today: string): string {
  const cur = String(today).slice(0, 7);
  if (!isBookMonth(month) || !isBookMonth(cur)) return cur;
  const i = monthIndex(month);
  const base = monthIndex(cur);
  return i >= base && i <= base + BOOK_MONTHS_AHEAD ? month : cur;
}

/** เดือนก่อน/ถัดไปที่ยังอยู่ในช่วงที่ดูได้ (นอกช่วง ⇒ null) */
export function monthNeighbours(month: string, today: string): { prev: string | null; next: string | null } {
  const cur = String(today).slice(0, 7);
  if (!isBookMonth(month) || !isBookMonth(cur)) return { prev: null, next: null };
  const i = monthIndex(month);
  const base = monthIndex(cur);
  return { prev: i - 1 >= base ? monthOfIndex(i - 1) : null, next: i + 1 <= base + BOOK_MONTHS_AHEAD ? monthOfIndex(i + 1) : null };
}

/** วันแรก–วันสุดท้ายของเดือน (ผิดรูป ⇒ null) */
export function monthRange(month: string): { from: string; to: string } | null {
  if (!isBookMonth(month)) return null;
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${pad2(days)}` };
}

export type BookSlotFacts = { status: string; publicLeft: number; saleBlock: string | null; showLeft: boolean };
/**
 * สภาพของวัน (ตัวตัดสินเดียว — จอห้ามตัดสินเอง): ผ่านแล้ว · ไม่มีรอบ · มีรอบที่ขายได้และยังว่าง ⇒ รอบที่ว่างมากสุด (เหลือน้อย/ว่าง · เลขของรอบนั้นรอบเดียว)
 * · มีรอบที่ขายได้แต่เต็ม ⇒ เต็ม · ทุกรอบยกเลิก ⇒ ไม่ออกเดินทาง · ที่เหลือ ⇒ ปิดรับ
 */
export function dayCellOf(slots: readonly BookSlotFacts[], ymd: string, today: string): { state: BookDayState; left: number | null } {
  if (ymd < today) return { state: "PAST", left: null };
  if (!slots.length) return { state: "NONE", left: null };
  const leftOf = (s: BookSlotFacts): number => (Number.isFinite(s.publicLeft) && s.publicLeft > 0 ? Math.trunc(s.publicLeft) : 0);
  const sellable = slots.filter((s) => s.saleBlock === null);
  let best: BookSlotFacts | null = null;
  for (const s of sellable) if (leftOf(s) > 0 && (best === null || leftOf(s) > leftOf(best))) best = s;
  if (best) return { state: best.showLeft ? "LOW" : "OPEN", left: leftOf(best) };
  if (sellable.length) return { state: "FULL", left: 0 };
  if (slots.every((s) => s.status === "CANCELLED")) return { state: "NOT_RUNNING", left: null };
  return { state: "CLOSED", left: null };
}

/** วันนี้เป็นต้นไปที่มีรอบ (ทุกสภาพยกเว้น ผ่านแล้ว/ไม่มีรอบ) — แถบวันของจอมือถือแสดงเฉพาะวันแบบนี้ */
export function dayHasDeparture(state: BookDayState): boolean {
  return state !== "PAST" && state !== "NONE";
}

// ═══════════════ โดเมนฝัง ═══════════════
// รูปเดียวกับค่าตั้ง trips.public.embedDomains (เขียนซ้ำ — ไฟล์นี้ไม่ import ค่า)
const EMBED_DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;
/** โดเมนที่ผ่านรูป: ตัวเล็ก · ตัดซ้ำ · ไม่เกินเพดาน · ตัวที่ไม่ผ่านทิ้ง */
export function embedDomainsOf(domains: unknown): string[] {
  if (!Array.isArray(domains)) return [];
  const out: string[] = [];
  for (const d of domains) {
    if (typeof d !== "string") continue;
    const v = d.toLowerCase();
    if (!EMBED_DOMAIN_RE.test(v) || out.includes(v)) continue;
    out.push(v);
    if (out.length >= BOOK_EMBED_DOMAIN_CAP) break;
  }
  return out;
}
/** ค่า `frame-ancestors` ของหน่วย — ไม่มีโดเมนที่ผ่าน ⇒ 'none' */
export function frameAncestorsOf(domains: unknown): string {
  const list = embedDomainsOf(domains);
  return list.length ? `frame-ancestors ${list.map((d) => `https://${d}`).join(" ")}` : "frame-ancestors 'none'";
}
/** origin ที่ฝังได้: https · ไม่มีพอร์ต · host ตรงกับโดเมนในรายการตรงตัว */
export function embedOriginAllowed(origin: unknown, domains: unknown): boolean {
  if (typeof origin !== "string" || origin === "") return false;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.origin !== origin.toLowerCase() || u.protocol !== "https:" || u.port !== "") return false;
  return embedDomainsOf(domains).includes(u.hostname);
}

// ═══════════════ ชนิดของ VM (ไม่มี id ภายในทุกชั้น) ═══════════════
/** ข้อความตามภาษา · fallback = ขออังกฤษแต่ร้านยังไม่แปล ⇒ แสดงไทย */
export type BookText = { text: string | null; fallback: boolean };
export type BookBrandVM = { slug: string; name: string; logoUrl: string | null; brandColor: string | null; brandFg: string | null };
export type BookShopVM = { shop: BookBrandVM; locale: BookLocale; products: { slug: string; title: BookText; summary: BookText }[]; total: number; shown: number; truncated: boolean };
export type BookDayVM = { date: string; day: number; state: BookDayState; left: number | null; selectable: boolean; selected: boolean };
export type BookSlotState = "OPEN" | "LOW" | "FULL" | "CLOSED" | "NOT_RUNNING";
export type BookSlotVM = { timeText: string; optionName: BookText; state: BookSlotState; left: number | null; capacity: number; guaranteed: boolean; cutoffLocal: string };
export type BookVatNote = "INCLUDED" | "ADDED" | "NONE";
export type BookPriceVM = {
  currency: "THB";
  pax: { code: string; label: BookText; ageMin: number | null; ageMax: number | null; seat: boolean; unitSatang: number }[];
  fees: { name: BookText; paxCode: string | null; unitSatang: number; passThrough: boolean }[];
  extras: { name: BookText; note: BookText; basis: string; unitSatang: number }[];
  headline: { code: string; unitSatang: number } | null;
  vatNote: BookVatNote;
  cancelLadder: { daysBefore: number; refundBp: number }[];
};
export type BookProductVM = {
  shop: BookBrandVM;
  locale: BookLocale;
  product: { slug: string; title: BookText; summary: BookText; itinerary: BookText; includes: BookText; meeting: BookText };
  tz: { name: string; offsetMin: number };
  today: string;
  month: string;
  prevMonth: string | null;
  nextMonth: string | null;
  weeks: (BookDayVM | null)[][];
  requestedUnavailable: boolean;
  selected: null | { date: string; slots: BookSlotVM[]; price: BookPriceVM | null; priceError: string | null };
  cta: { enabled: false };
};
/** พารามิเตอร์ที่ลิงก์ในหน้าพาต่อ (ภาษาที่เลือกเอง · รหัสผู้แนะนำที่ผูกได้จริง) */
export type BookCarry = { lang: BookLocale | null; a: string | null };

/** ร้อยละคืนเงินจาก basis point (ไม่ใช่ยอดเงิน — ใช้แสดงตารางยกเลิกเท่านั้น) */
export function refundPercentOf(refundBp: number): number {
  return Number.isFinite(refundBp) ? Math.trunc(refundBp / 100) : 0;
}

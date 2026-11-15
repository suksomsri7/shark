// google.ts — ซิงก์ Google Calendar สองทาง (CAL1.8 · สัญญา docs/modules/32-secretary-calendar.md §10.1–§10.5 · R-CAL-16/17/26/27/37)
//
// 🔴 M4: CalLink ต่อ "คน" (ไม่ผูกร้าน) · ร้านไม่มีทางอ่านตารางนี้ · ทุก query ของ CalLink/CalExternalEvent มี `userId` ตรงตัวใน where
//    ฟังก์ชันรับ `userId` ได้เพราะ CalLink ไม่ผูกร้าน — ผู้เรียกมีแค่ route `calendar/google/*` (userGate · userId จากโทเค็น) และ job `calendar.google`
//    **ไม่มี export ไปเครื่องมือ AI** (§3.2)
// 🔴 token ไม่เคยออกจากเซิร์ฟเวอร์ · เก็บใน secret-box ผูก AAD `cal:${userId}:${linkId}` (R-CAL-16) · ไม่อยู่ใน DTO/log · เปิดกล่องไม่ได้ = NEEDS_RECONNECT
// 🔴 แลก `serverAuthCode` จาก @react-native-google-signin (R-CAL-17 · ไม่ใช้ expo-auth-session) ด้วย GOOGLE_WEB_CLIENT_ID/SECRET · redirect_uri ""
// 🔴 scope น้อยสุด: calendar.events + calendar.calendarlist.readonly · ไม่ครบ = scope_missing
// 🔴 transport ฉีดได้ (`GoogleDeps.fetch` แบบ push.ts opts.post) — QC ใช้ของปลอมทั้งหมด · ไม่เคยยิง Google จริงใน QC
// 🔴 CalLink/CalExternalEvent/Membership = แกน global ใน scope.ts (tenantDb ไม่เติมตัวกรองร้าน) · CalItem = แกน tenant ⇒ วนตามสมาชิกภาพของผู้ใช้
// 🔴 ไม่ log title/token/ข้อความดิบของ Google — lastError เป็นข้อความไทยสั้น
import type { CalItem, CalLink, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { errDetail, logOps } from "@/lib/core/ops";
import { integrationSecretKeyConfigured, openIntegrationSecret, sealIntegrationSecret } from "@/lib/core/integrations/secret-box";
import { schedule } from "./next-fire";
import { BOOKING_EXPORT_OFF_HINT, bookingExportAllowed } from "./shop-policy";

export const SCOPE_EVENTS = "https://www.googleapis.com/auth/calendar.events";
export const SCOPE_LIST = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const GOOGLE_SCOPES = [SCOPE_EVENTS, SCOPE_LIST] as const;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

export const SYNC_EVERY_MIN = 15;
export const SYNC_STALE_MS = 14 * 60_000;
export const JOB_BATCH = 20;
export const LEASE_MS = 10 * 60_000; // calendar_b ▸ M5: ยาวกว่ารอบที่ยาวสุด (ต่ออายุทุกหน้า + หยุดที่ deadline) ◂
export const FULL_SYNC_AHEAD_MS = 365 * 86_400_000; // calendar_b ▸ M5: full sync มี timeMax (ซีรีส์ไม่รู้จบไม่ขยายไม่สิ้นสุด) ◂
export const PAGES_PER_RUN = 8; // calendar_b ▸ M5: หน้าต่อรอบต่อสตรีม — เกิน = เก็บ pageToken ทำต่อรอบหน้า ◂
export const SYNC_DEADLINE_MS = 20_000; // ไม่ส่ง deadline (ปุ่มซิงก์) = 20 วิ
export const COPY_DELETE_BUDGET_MS = 8_000; // calendar_b ▸ m7: ลบสำเนาตอนยกเลิกเชื่อม/ลบบัญชี — มีเพดานเวลา ◂
export const FULL_SYNC_BACK_MS = 30 * 86_400_000;
export const PRUNE_BEFORE_MS = 60 * 86_400_000;
export const EVENT_CAP = 5_000;
export const BOOKING_AHEAD_MS = 60 * 86_400_000;
const PAGE = 250;
const MAX_PAGES = 20;

export type GoogleDeps = { fetch?: typeof fetch; now?: Date };
export type ExportKind = "EVENT" | "REMINDER" | "BOOKING";
export type CalendarEntry = {
  id: string; name: string; color: string | null; primary: boolean; accessRole: string; import: boolean;
  /** สตรีมแสดงผล (singleEvents=true · ปฏิทินที่ import) */
  syncToken?: string | null; pageToken?: string | null; fullFrom?: string | null; fullTo?: string | null; lastSyncAt?: string | null;
  /** calendar_b ▸ M1/M2: สตรีมต้นฉบับของสำเนาเรา (singleEvents=false · ปฏิทินปลายทางส่งออก) ◂ */
  masterSyncToken?: string | null; masterPageToken?: string | null; masterFrom?: string | null;
};
export type GoogleLinkDto = {
  status: "NONE" | "ACTIVE" | "NEEDS_RECONNECT";
  email: string | null;
  calendars: { id: string; name: string; color: string | null; primary: boolean; import: boolean; accessRole: string }[];
  exportKinds: ExportKind[];
  exportCalendarId: string | null;
  exportCalendarName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  /**
   * calendar_c ▸ สถานะจริงของ "ส่งนัดลูกค้าที่ฉันรับ" (BOOKING): ร้านต้องเปิดสวิตช์ allowBookingExport ก่อน (มติเจ้าของ)
   *   allowed = มีร้านของผู้ใช้อย่างน้อย 1 ร้านเปิด · currentShop = ร้านใน x-tenant-id (null = ไม่ระบุ) · hint = ข้อความเทาของจอ 9 ◂
   */
  bookingExport: { allowed: boolean; currentShop: boolean | null; hint: string | null; shops: { tenantId: string; name: string; allowed: boolean }[] };
};

/** ข้อผิดพลาดของ service → route `{ error: code, message }` */
export class GoogleError extends Error {
  constructor(public status: 400 | 404 | 409 | 503, public code: string, message: string) {
    super(message);
    this.name = "GoogleError";
  }
}
const NOT_CONFIGURED = () => new GoogleError(503, "not_configured", "ระบบยังไม่พร้อมเชื่อม Google");
const BAD_CODE = () => new GoogleError(400, "bad_code", "เชื่อม Google ไม่สำเร็จ — ลองใหม่อีกครั้ง");
const SCOPE_MISSING = () => new GoogleError(400, "scope_missing", "ยังไม่ได้อนุญาตให้เข้าถึงปฏิทิน — ลองใหม่แล้วกดอนุญาต");
const NEEDS_RECONNECT = () => new GoogleError(409, "needs_reconnect", "ต้องเชื่อม Google ใหม่");
const NOT_LINKED = () => new GoogleError(404, "not_found", "ยังไม่ได้เชื่อม Google Calendar");
const RECONNECT_TH = "ต้องเชื่อม Google ใหม่";

/** แกน global (CalLink · CalExternalEvent · Membership) — tenantDb ไม่เติมตัวกรองร้านให้ตารางแกนนี้ */
const gdb = () => tenantDb({ tenantId: "__calendar_global__" });
const nowOf = (deps?: GoogleDeps) => deps?.now ?? new Date();
const fx = (deps?: GoogleDeps): typeof fetch => deps?.fetch ?? ((i, o) => fetch(i, o));
const aad = (userId: string, linkId: string) => `cal:${userId}:${linkId}`;
const newId = () => `cl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

type Tok = { refreshToken: string; accessToken?: string; expiresAt?: number; sub?: string };

// ─────────────────────────── DTO ───────────────────────────

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
function calsOf(link: Pick<CalLink, "calendars">): CalendarEntry[] {
  const raw = Array.isArray(link.calendars) ? (link.calendars as unknown[]) : [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string")
    .map((x) => ({
      id: String(x.id),
      name: typeof x.name === "string" ? x.name : "",
      color: typeof x.color === "string" ? x.color : null,
      primary: x.primary === true,
      accessRole: typeof x.accessRole === "string" ? x.accessRole : "reader",
      import: x.import === true,
      syncToken: str(x.syncToken),
      pageToken: str(x.pageToken),
      fullFrom: str(x.fullFrom),
      fullTo: str(x.fullTo),
      lastSyncAt: str(x.lastSyncAt),
      masterSyncToken: str(x.masterSyncToken),
      masterPageToken: str(x.masterPageToken),
      masterFrom: str(x.masterFrom),
    }));
}

function toDto(link: CalLink | null): GoogleLinkDto {
  if (!link) return { status: "NONE", email: null, calendars: [], exportKinds: [], exportCalendarId: null, exportCalendarName: null, lastSyncAt: null, lastError: null, bookingExport: NO_BOOKING_EXPORT };
  const cals = calsOf(link);
  const target = link.exportCalendarId ? cals.find((c) => c.id === link.exportCalendarId) : cals.find((c) => c.primary);
  return {
    status: link.status,
    email: link.email || null,
    calendars: cals.map(({ id, name, color, primary, import: imp, accessRole }) => ({ id, name, color, primary, import: imp, accessRole })),
    exportKinds: link.exportKinds.filter((k): k is ExportKind => k === "EVENT" || k === "REMINDER" || k === "BOOKING"),
    exportCalendarId: link.exportCalendarId,
    exportCalendarName: target?.name ?? null,
    lastSyncAt: link.lastSyncAt ? link.lastSyncAt.toISOString() : null,
    lastError: link.lastError,
    bookingExport: NO_BOOKING_EXPORT,
  };
}

async function linkOf(userId: string): Promise<CalLink | null> {
  return gdb().calLink.findFirst({ where: { userId, provider: "GOOGLE" } });
}

const NO_BOOKING_EXPORT: GoogleLinkDto["bookingExport"] = { allowed: false, currentShop: null, hint: BOOKING_EXPORT_OFF_HINT, shops: [] };

/** calendar_c ▸ เติมสถานะนโยบายร้าน (ร้านของผู้ใช้ที่รับคำเชิญแล้ว · ร้านปัจจุบันจาก x-tenant-id ถ้าเป็นสมาชิก) */
async function withPolicy(userId: string, dto: GoogleLinkDto, currentTenantId?: string | null): Promise<GoogleLinkDto> {
  const ms = await gdb().membership.findMany({ where: { userId, acceptedAt: { not: null } }, select: { tenantId: true, tenant: { select: { name: true } } } });
  const allowed = await bookingExportAllowed(ms.map((m) => m.tenantId));
  const shops = ms.map((m) => ({ tenantId: m.tenantId, name: m.tenant.name, allowed: allowed.has(m.tenantId) }));
  const any = shops.some((x) => x.allowed);
  const current = currentTenantId && shops.some((x) => x.tenantId === currentTenantId) ? allowed.has(currentTenantId) : null;
  return { ...dto, bookingExport: { allowed: any, currentShop: current, hint: any && current !== false ? null : BOOKING_EXPORT_OFF_HINT, shops } };
}

export async function googleStatus(userId: string, opts: { tenantId?: string | null } = {}): Promise<GoogleLinkDto | null> {
  const l = await linkOf(userId);
  return l ? withPolicy(userId, toDto(l), opts.tenantId) : null;
}

// ─────────────────────────── HTTP ───────────────────────────

type Res = { status: number; json: Record<string, unknown> };
async function call(deps: GoogleDeps | undefined, url: string, init: RequestInit): Promise<Res> {
  const r = await fx(deps)(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const text = await r.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }
  return { status: r.status, json };
}
const form = (o: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });

function clientCreds(): { id: string; secret: string } | null {
  const id = (process.env.GOOGLE_WEB_CLIENT_ID ?? "").trim();
  const secret = (process.env.GOOGLE_WEB_CLIENT_SECRET ?? "").trim();
  return id && secret ? { id, secret } : null;
}

/** email จาก id_token (มาจาก Google ตรงผ่าน TLS ในคำตอบ token — อ่าน payload อย่างเดียว ไม่ใช้ตัดสินสิทธิ์) */
function idTokenClaims(t: unknown): { email: string; sub: string } {
  if (typeof t !== "string") return { email: "", sub: "" };
  const p = t.split(".")[1];
  if (!p) return { email: "", sub: "" };
  try {
    const o = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { email?: unknown; sub?: unknown };
    return { email: typeof o.email === "string" ? o.email.slice(0, 200) : "", sub: typeof o.sub === "string" ? o.sub.slice(0, 100) : "" };
  } catch {
    return { email: "", sub: "" };
  }
}

async function revoke(token: string, deps?: GoogleDeps): Promise<void> {
  try {
    await call(deps, `${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } });
  } catch {
    /* พยายามเท่านั้น */
  }
}

/** access token ที่ใช้ได้ (refresh เมื่อหมด · invalid_grant/กล่องเปิดไม่ได้ = NEEDS_RECONNECT) */
async function accessToken(link: CalLink, deps: GoogleDeps | undefined, force = false): Promise<string> {
  const tok = openIntegrationSecret(link.tokenBox, aad(link.userId, link.id)) as Tok | null;
  if (!tok || typeof tok.refreshToken !== "string" || !tok.refreshToken) {
    await markReconnect(link);
    throw NEEDS_RECONNECT();
  }
  const now = +nowOf(deps);
  if (!force && tok.accessToken && typeof tok.expiresAt === "number" && tok.expiresAt > now + 60_000) return tok.accessToken;
  const cc = clientCreds();
  if (!cc) throw NOT_CONFIGURED();
  const r = await call(deps, TOKEN_URL, form({ client_id: cc.id, client_secret: cc.secret, refresh_token: tok.refreshToken, grant_type: "refresh_token" }));
  if (r.status >= 400 || typeof r.json.access_token !== "string") {
    // calendar_b ▸ review b M6: เฉพาะ invalid_grant = สิทธิ์ของผู้ใช้ตาย ⇒ NEEDS_RECONNECT · invalid_client/unauthorized_client/5xx = ปัญหาฝั่งเรา
    //   (ตั้งค่าผิด/หมุน secret) ⇒ ชั่วคราว + แจ้ง ops — ไม่ไล่ผู้ใช้ทุกคนไปเชื่อมใหม่ ◂
    if (r.json.error === "invalid_grant") {
      await markReconnect(link);
      throw NEEDS_RECONNECT();
    }
    await logOps("ERROR", "calendar", "google: refresh token ล้ม (ไม่ใช่ invalid_grant — ตรวจ GOOGLE_WEB_CLIENT_ID/SECRET)", { detail: `link=${link.id} status=${r.status} error=${String(r.json.error ?? "").slice(0, 40)}` }).catch(() => undefined);
    throw new Error(`google token refresh ${r.status}`);
  }
  const next: Tok = { refreshToken: tok.refreshToken, accessToken: r.json.access_token, expiresAt: now + Number(r.json.expires_in ?? 3600) * 1000, ...(tok.sub ? { sub: tok.sub } : {}) };
  await gdb().calLink.updateMany({ where: { id: link.id, userId: link.userId }, data: { tokenBox: sealIntegrationSecret(next, aad(link.userId, link.id)) } });
  link.tokenBox = sealIntegrationSecret(next, aad(link.userId, link.id));
  return next.accessToken!;
}

async function markReconnect(link: CalLink): Promise<void> {
  link.status = "NEEDS_RECONNECT";
  await gdb().calLink.updateMany({ where: { id: link.id, userId: link.userId }, data: { status: "NEEDS_RECONNECT", lastError: RECONNECT_TH, leaseUntil: null } });
}

/** เรียก Calendar API ด้วย token ของลิงก์ — 401 = refresh 1 ครั้งแล้วลองใหม่ */
async function api(link: CalLink, deps: GoogleDeps | undefined, method: string, path: string, body?: unknown): Promise<Res> {
  let tok = await accessToken(link, deps);
  for (let i = 0; i < 2; i++) {
    const r = await call(deps, `${API}${path}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (r.status !== 401 || i === 1) return r;
    tok = await accessToken(link, deps, true);
  }
  throw new Error("unreachable");
}

// ─────────────────────────── เชื่อม (§10.1) ───────────────────────────

/** รายการปฏิทินจาก Google รวมค่าเดิม (import/syncToken) · ค่าเริ่ม import: primary = true · อื่น = false */
async function fetchCalendars(link: CalLink, deps?: GoogleDeps): Promise<CalendarEntry[]> {
  const old = new Map(calsOf(link).map((c) => [c.id, c]));
  const out: CalendarEntry[] = [];
  let pageToken = "";
  for (let p = 0; p < 5; p++) {
    const r = await api(link, deps, "GET", `/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
    if (r.status >= 400) throw new Error(`google calendarList ${r.status}`);
    for (const it of (Array.isArray(r.json.items) ? r.json.items : []) as Record<string, unknown>[]) {
      if (typeof it.id !== "string") continue;
      const prev = old.get(it.id);
      const primary = it.primary === true;
      out.push({
        id: it.id,
        name: String(it.summaryOverride ?? it.summary ?? it.id).slice(0, 120),
        color: typeof it.backgroundColor === "string" ? it.backgroundColor : null,
        primary,
        accessRole: typeof it.accessRole === "string" ? it.accessRole : "reader",
        import: prev ? prev.import : primary,
        syncToken: prev?.syncToken ?? null,
        pageToken: prev?.pageToken ?? null,
        fullFrom: prev?.fullFrom ?? null,
        fullTo: prev?.fullTo ?? null,
        lastSyncAt: prev?.lastSyncAt ?? null,
        masterSyncToken: prev?.masterSyncToken ?? null,
        masterPageToken: prev?.masterPageToken ?? null,
        masterFrom: prev?.masterFrom ?? null,
      });
    }
    pageToken = typeof r.json.nextPageToken === "string" ? r.json.nextPageToken : "";
    if (!pageToken) break;
  }
  return out.slice(0, 100);
}

/**
 * แลก serverAuthCode → token (กล่องลับ) → CalLink → ดึงรายการปฏิทิน
 * calendar_b ▸ review b M6: เชื่อมซ้ำบัญชี Google เดิม (sub/email เดิม) = ไม่ถอนสิทธิ์เดิม (revoke ตัดทั้ง grant) · ไม่มี refresh_token มาใหม่
 *   (Google ให้ครั้งแรกเท่านั้น) = ใช้ตัวเดิมต่อ · เปลี่ยนบัญชี = ถอนของเดิม + ล้างแคช/สำเนาเดิม แล้วส่งออกใหม่ ◂
 */
export async function connectGoogle(userId: string, serverAuthCode: string, deps?: GoogleDeps): Promise<GoogleLinkDto> {
  if (!integrationSecretKeyConfigured()) throw NOT_CONFIGURED();
  const cc = clientCreds();
  if (!cc) throw NOT_CONFIGURED();
  const code = String(serverAuthCode ?? "").trim();
  if (!code || code.length > 512) throw BAD_CODE();
  const r = await call(deps, TOKEN_URL, form({ code, client_id: cc.id, client_secret: cc.secret, grant_type: "authorization_code", redirect_uri: "" }));
  if (r.status >= 400 || typeof r.json.access_token !== "string") throw BAD_CODE();
  const granted = String(r.json.scope ?? "").split(/\s+/);
  if (!GOOGLE_SCOPES.every((s) => granted.includes(s))) {
    if (typeof r.json.refresh_token === "string") await revoke(r.json.refresh_token, deps);
    throw SCOPE_MISSING();
  }
  const claims = idTokenClaims(r.json.id_token);
  const prev = await linkOf(userId);
  const old = prev ? (openIntegrationSecret(prev.tokenBox, aad(userId, prev.id)) as Tok | null) : null;
  const sameAccount = !!prev && ((!!claims.sub && !!old?.sub && claims.sub === old.sub) || (!!claims.email && !!prev.email && claims.email.toLowerCase() === prev.email.toLowerCase()));
  const newRt = typeof r.json.refresh_token === "string" && r.json.refresh_token ? r.json.refresh_token : sameAccount && old?.refreshToken ? old.refreshToken : null;
  if (!newRt) throw BAD_CODE();
  const now = +nowOf(deps);
  const tok: Tok = { refreshToken: newRt, accessToken: r.json.access_token, expiresAt: now + Number(r.json.expires_in ?? 3600) * 1000, ...(claims.sub ? { sub: claims.sub } : old?.sub && sameAccount ? { sub: old.sub } : {}) };
  const id = prev?.id ?? newId();
  const box = sealIntegrationSecret(tok, aad(userId, id));
  let link: CalLink;
  if (prev) {
    await gdb().calLink.updateMany({ where: { id, userId }, data: { tokenBox: box, scopes: [...GOOGLE_SCOPES], status: "ACTIVE", lastError: null, leaseUntil: null, ...(claims.email ? { email: claims.email } : {}) } });
    if (!sameAccount) {
      // บัญชีอื่น: ถอนสิทธิ์ของบัญชีเดิม · แคช/สถานะซิงก์ของบัญชีเดิมใช้ไม่ได้ · สำเนาเดิมอยู่ในบัญชีเดิม (ถอนแล้วลบไม่ได้) ⇒ ส่งออกใหม่
      if (old?.refreshToken && old.refreshToken !== newRt) await revoke(old.refreshToken, deps);
      await gdb().calExternalEvent.deleteMany({ where: { userId, linkId: id } });
      await gdb().calLink.updateMany({ where: { id, userId }, data: { calendars: [] as unknown as Prisma.InputJsonValue, exportCalendarId: null } });
      for (const tenantId of await tenantsOf(userId)) {
        await tenantDb({ tenantId }).calItem.updateMany({ where: { userId, tenantId, externalId: { not: null } }, data: { externalId: null, externalEtag: null, externalCalendarId: null } });
      }
    }
    link = (await linkOf(userId))!;
  } else {
    link = await gdb().calLink.create({ data: { id, userId, provider: "GOOGLE", email: claims.email, tokenBox: box, scopes: [...GOOGLE_SCOPES], exportKinds: ["EVENT"] } });
  }
  try {
    const cals = await fetchCalendars(link, deps);
    const email = link.email || cals.find((c) => c.primary)?.id || "";
    await gdb().calLink.updateMany({ where: { id, userId }, data: { calendars: cals as unknown as Prisma.InputJsonValue, email } });
    link = (await linkOf(userId))!;
  } catch (e) {
    if (e instanceof GoogleError) throw e;
    await logOps("WARN", "calendar", "google: ดึงรายการปฏิทินตอนเชื่อมไม่สำเร็จ", { detail: errDetail(e) }).catch(() => undefined);
  }
  await markDirty(userId, link.exportKinds);
  return withPolicy(userId, toDto(link));
}

/**
 * ตั้งค่า (จอ 9): ปฏิทินที่ดึง · ชนิดที่ส่งออก · ปฏิทินปลายทาง (owner/writer เท่านั้น)
 * calendar_b ▸ review b m7: ไม่ยิง Google ใน request — ปิดชนิด/ย้ายปลายทาง = ติดธง syncDirty แล้วรอบซิงก์ (job/after()) ลบ/ย้ายสำเนาเอง ◂
 */
export async function updateGoogle(
  userId: string,
  patch: { calendars?: { id: string; import: boolean }[]; exportCalendarId?: string | null; exportKinds?: ExportKind[] },
): Promise<GoogleLinkDto> {
  const link = await linkOf(userId);
  if (!link) throw NOT_LINKED();
  const cals = calsOf(link);
  const db = gdb();
  if (patch.exportCalendarId !== undefined && patch.exportCalendarId !== null) {
    const t = cals.find((c) => c.id === patch.exportCalendarId);
    if (!t || !(t.accessRole === "owner" || t.accessRole === "writer")) throw new GoogleError(400, "invalid", "ปฏิทินนี้แก้ไขไม่ได้ เลือกปฏิทินอื่น");
  }
  const want = new Map((patch.calendars ?? []).map((c) => [c.id, c.import === true]));
  const turnedOff: string[] = [];
  const nextCals = cals.map((c) => {
    if (!want.has(c.id)) return c;
    const imp = want.get(c.id)!;
    if (c.import && !imp) turnedOff.push(c.id);
    return { ...c, import: imp, ...(imp ? {} : { syncToken: null, pageToken: null, fullFrom: null, fullTo: null }) };
  });
  // ปิดดึงปฏิทิน = ลบแคชของปฏิทินนั้น (ไม่ลบแถวจับคู่สำเนาของเรา sharkRef)
  if (turnedOff.length) await db.calExternalEvent.deleteMany({ where: { userId, linkId: link.id, calendarId: { in: turnedOff }, sharkRef: null } });
  const kinds = patch.exportKinds ? [...new Set(patch.exportKinds.filter((k) => k === "EVENT" || k === "REMINDER" || k === "BOOKING"))] : link.exportKinds;
  const changedKinds = [...new Set([...link.exportKinds.filter((k) => !kinds.includes(k)), ...kinds.filter((k) => !link.exportKinds.includes(k))])];
  const targetChanged = patch.exportCalendarId !== undefined && (patch.exportCalendarId ?? null) !== link.exportCalendarId;
  await db.calLink.updateMany({
    where: { id: link.id, userId },
    data: { calendars: nextCals as unknown as Prisma.InputJsonValue, exportKinds: kinds, ...(patch.exportCalendarId !== undefined ? { exportCalendarId: patch.exportCalendarId } : {}) },
  });
  await markDirty(userId, targetChanged ? ["EVENT", "REMINDER"] : changedKinds);
  return withPolicy(userId, toDto(await linkOf(userId)));
}

// ─────────────────────────── CalItem ข้ามร้านของผู้ใช้ ───────────────────────────

async function tenantsOf(userId: string): Promise<string[]> {
  const ms = await gdb().membership.findMany({ where: { userId }, select: { tenantId: true } });
  return [...new Set(ms.map((m) => m.tenantId))];
}

/** ติดธง syncDirty: ชนิดที่ระบุ (OPEN = จะส่ง · มีสำเนาแต่ปิดชนิดแล้ว = จะลบ) */
async function markDirty(userId: string, kinds: string[]): Promise<void> {
  const k = kinds.filter((x) => x === "EVENT" || x === "REMINDER") as ("EVENT" | "REMINDER")[];
  if (!k.length) return;
  for (const tenantId of await tenantsOf(userId)) {
    await tenantDb({ tenantId }).calItem.updateMany({ where: { userId, tenantId, kind: { in: k }, OR: [{ status: "OPEN" }, { externalId: { not: null } }] }, data: { syncDirty: true } });
  }
}

// ─────────────────────────── ส่งออก (§10.3) ───────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const bkkLocal = (d: Date) => new Date(+d + 7 * 3_600_000);
const ymdOf = (d: Date) => {
  const t = bkkLocal(d);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const dtOf = (d: Date) => {
  const t = bkkLocal(d);
  return `${ymdOf(d)}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:00+07:00`;
};
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** RRULE ของการทำซ้ำ (MONTHLY 29–31 = วันสุดท้ายของเดือนที่สั้นกว่า ตรงกติกา §5.1 ด้วย BYSETPOS=-1) */
export function rruleOf(i: Pick<CalItem, "repeat" | "repeatDays" | "startAt">): string[] {
  if (i.repeat === "DAILY") return ["RRULE:FREQ=DAILY"];
  if (i.repeat === "WEEKLY") {
    const days = i.repeatDays.length ? i.repeatDays : [bkkLocal(i.startAt).getUTCDay()];
    return [`RRULE:FREQ=WEEKLY;BYDAY=${[...days].sort().map((d) => BYDAY[d]).join(",")}`];
  }
  if (i.repeat === "MONTHLY") {
    const d = bkkLocal(i.startAt).getUTCDate();
    if (d <= 28) return [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${d}`];
    const set = Array.from({ length: d - 27 }, (_, k) => 28 + k).join(",");
    return [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${set};BYSETPOS=-1`];
  }
  return [];
}

/** body อีเวนต์ Google ของ CalItem (REMINDER = อีเวนต์ 15 นาที · ไม่ตั้งแจ้งเตือนของ Google — แอปเตือนเอง ไม่ซ้ำ) */
export function eventBodyOf(i: Pick<CalItem, "id" | "kind" | "title" | "note" | "startAt" | "endAt" | "allDay" | "repeat" | "repeatDays">): Record<string, unknown> {
  const end = i.kind === "EVENT" && i.endAt ? i.endAt : new Date(+i.startAt + 15 * 60_000);
  const tz = "Asia/Bangkok";
  return {
    summary: i.title,
    ...(i.note ? { description: i.note.slice(0, 2000) } : {}),
    start: i.allDay ? { date: ymdOf(i.startAt) } : { dateTime: dtOf(i.startAt), timeZone: tz },
    end: i.allDay ? { date: ymdOf(new Date(+(i.endAt && +i.endAt > +i.startAt ? i.endAt : i.startAt) + 86_400_000)) } : { dateTime: dtOf(end), timeZone: tz },
    ...(i.repeat !== "NONE" ? { recurrence: rruleOf(i) } : {}),
    reminders: { useDefault: false, overrides: [] },
    extendedProperties: { private: { sharkItemId: i.id } },
  };
}

const calPath = (calId: string) => `/calendars/${encodeURIComponent(calId)}/events`;
/** id ปฏิทินปลายทางจริง (primary = id ของ primary ในรายการ · ไม่รู้ = "primary") */
function exportCal(link: CalLink): string {
  return link.exportCalendarId ?? calsOf(link).find((c) => c.primary)?.id ?? "primary";
}

type Run = { deadline: number; deps?: GoogleDeps; now: Date };
const timeLeft = (run: Run) => Date.now() < run.deadline;

async function exportItems(link: CalLink, run: Run): Promise<number> {
  let changed = 0;
  const kinds = link.exportKinds;
  const target = exportCal(link);
  for (const tenantId of await tenantsOf(link.userId)) {
    const db = tenantDb({ tenantId });
    const rows = await db.calItem.findMany({ where: { userId: link.userId, tenantId, syncDirty: true }, take: 50, orderBy: { updatedAt: "asc" } });
    for (const r of rows) {
      if (!timeLeft(run)) return changed;
      const should = (r.status === "OPEN" || r.status === "DONE") && kinds.includes(r.kind);
      const at = r.externalCalendarId ?? target;
      let data: Prisma.CalItemUpdateManyMutationInput = { syncDirty: false };
      // สำเนาอยู่คนละปฏิทินกับปลายทาง / ไม่ควรมีแล้ว ⇒ ลบจากปฏิทินที่สำเนาอยู่จริง (review b m7)
      if (r.externalId && (!should || at !== target)) {
        const res = await api(link, run.deps, "DELETE", `${calPath(at)}/${encodeURIComponent(r.externalId)}`);
        if (res.status >= 400 && res.status !== 404 && res.status !== 410) throw new Error(`google delete ${res.status}`);
        data = { syncDirty: false, externalId: null, externalEtag: null, externalCalendarId: null };
        r.externalId = null;
      }
      if (should) {
        const body = eventBodyOf(r);
        let res = r.externalId ? await api(link, run.deps, "PATCH", `${calPath(target)}/${encodeURIComponent(r.externalId)}`, body) : null;
        if (!res || res.status === 404 || res.status === 410) res = await api(link, run.deps, "POST", calPath(target), body);
        if (res.status >= 400 || typeof res.json.id !== "string") throw new Error(`google export ${res.status}`);
        data = { syncDirty: false, externalId: res.json.id, externalEtag: typeof res.json.etag === "string" ? res.json.etag : null, externalCalendarId: target };
      }
      // ไม่แตะ version/userEditedAt (ไม่ใช่การแก้ของผู้ใช้) · ผู้ใช้แก้ระหว่างนี้ = updatedAt เปลี่ยน ⇒ คง dirty ไว้รอบหน้า
      await db.calItem.updateMany({ where: { id: r.id, userId: link.userId, tenantId, updatedAt: r.updatedAt }, data });
      changed++;
    }
  }
  return changed;
}

/**
 * นัดบัตรคิวที่ "ของฉัน" 60 วันข้างหน้า ทุกกิจการ (R-CAL-37 · มติเจ้าของ Q9: ชื่อ = <บริการ> · <ชื่อลูกค้า> · ไม่มีเบอร์/อีเมล)
 * calendar_b ▸ review b m6: เฉพาะสาขาที่ผู้ใช้ยังเข้าถึงได้ (`canAccessUnit`) และร้านไม่ได้ปิดเลขาระบบบัตรคิว (OFF) ◂
 */
async function myAppointments(userId: string, now: Date): Promise<Map<string, { title: string; startAt: Date; endAt: Date; updatedAt: Date }>> {
  const out = new Map<string, { title: string; startAt: Date; endAt: Date; updatedAt: Date }>();
  const { employeeOfUser } = await import("@/lib/modules/hr");
  const { canAccessUnit } = await import("@/lib/core/rbac");
  const { getAccess } = await import("@/lib/ai/secretary/access");
  const { moduleOff } = await import("@/lib/ai/secretary/access-rules");
  const ms = await gdb().membership.findMany({ where: { userId, acceptedAt: { not: null } }, select: { tenantId: true, role: true, unitAccess: true, permissions: true } });
  for (const m of ms) {
    const tenantId = m.tenantId;
    if (moduleOff(await getAccess(tenantId).catch(() => undefined), "booking")) continue;
    // calendar_c ▸ ร้านปิดสวิตช์ (ค่าเริ่ม) = ไม่ส่งนัดของร้านนี้ · สำเนาเดิมถูกลบในรอบนี้ (ไม่อยู่ในชุดที่ต้องการ) ◂
    if (!(await bookingExportAllowed([tenantId])).has(tenantId)) continue;
    const emp = await employeeOfUser(tenantId, userId);
    if (!emp) continue;
    const mc = { role: m.role, unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [], permissions: (m.permissions ?? {}) as Record<string, unknown> };
    const units = await tenantDb({ tenantId }).businessUnit.findMany({ where: { tenantId, type: "BOOKING", status: "ACTIVE" }, select: { id: true } });
    for (const u of units) {
      if (!canAccessUnit(mc, u.id)) continue;
      const db = tenantDb({ tenantId, unitId: u.id });
      const staff = (await db.bookingStaff.findMany({ where: { tenantId, unitId: u.id, active: true, employeeId: emp.employeeId }, select: { id: true } })).map((s) => s.id);
      if (!staff.length) continue;
      const rows = await db.appointment.findMany({
        where: { tenantId, unitId: u.id, staffId: { in: staff }, status: { notIn: ["CANCELLED", "NO_SHOW"] }, startAt: { gte: now, lt: new Date(+now + BOOKING_AHEAD_MS) } },
        select: { id: true, startAt: true, endAt: true, updatedAt: true, customerName: true, service: { select: { name: true } } },
        take: 500,
      });
      for (const a of rows) out.set(`appt:${tenantId}:${a.id}`, { title: `${a.service.name} · ${a.customerName}`.slice(0, 200), startAt: a.startAt, endAt: a.endAt, updatedAt: a.updatedAt });
    }
  }
  return out;
}

/** คำอธิบายของสำเนานัดลูกค้าใน Google (Q9 · ไม่มีข้อมูลติดต่อลูกค้า) */
export const BOOKING_COPY_NOTE = "นัดลูกค้าจาก SHARK (บัตรคิว) — ส่งมาเพราะร้านอนุญาตและคุณเปิด \"นัดลูกค้าที่ฉันรับ\" · ปิดได้ที่ ตั้งค่าปฏิทิน › Google Calendar · แก้ในนี้จะถูกเขียนทับด้วยข้อมูลของร้าน";

async function exportBookings(link: CalLink, run: Run): Promise<number> {
  const db = gdb();
  const copies = await db.calExternalEvent.findMany({ where: { userId: link.userId, linkId: link.id, sharkRef: { not: null } } });
  const want = link.exportKinds.includes("BOOKING") ? await myAppointments(link.userId, run.now) : new Map<string, { title: string; startAt: Date; endAt: Date; updatedAt: Date }>();
  const target = exportCal(link);
  let changed = 0;
  for (const c of copies) {
    if (!timeLeft(run)) return changed;
    const w = want.get(c.sharkRef!);
    if (w && c.calendarId === target) continue;
    const res = await api(link, run.deps, "DELETE", `${calPath(c.calendarId)}/${encodeURIComponent(c.externalId)}`);
    if (res.status >= 400 && res.status !== 404 && res.status !== 410) throw new Error(`google delete ${res.status}`);
    await db.calExternalEvent.deleteMany({ where: { id: c.id, userId: link.userId } });
    changed++;
  }
  const byRef = new Map(copies.filter((c) => c.calendarId === target).map((c) => [c.sharkRef!, c]));
  for (const [ref, a] of want) {
    if (!timeLeft(run)) return changed;
    const c = byRef.get(ref);
    // ฝั่งร้านเป็นต้นฉบับ: ไม่มีสำเนา / นัดถูกแก้หลังส่ง / สำเนาถูกแก้ใน Google (etag ถูกล้างตอนดึง) ⇒ เขียนทับ
    if (c && c.etag && +a.updatedAt <= +c.updatedAt && +c.startAt === +a.startAt) continue;
    // มติเจ้าของ Q9 (15 พ.ย.): ชื่อ = <บริการ> · <ชื่อลูกค้า> (มีชื่อลูกค้า · ไม่มีเบอร์/อีเมล) · คำอธิบาย = ที่มา + เงื่อนไข (ร้านเปิดสวิตช์ + ผู้ใช้เลือกส่ง)
    const body = { summary: a.title, description: BOOKING_COPY_NOTE, start: { dateTime: dtOf(a.startAt), timeZone: "Asia/Bangkok" }, end: { dateTime: dtOf(a.endAt), timeZone: "Asia/Bangkok" }, reminders: { useDefault: false, overrides: [] }, extendedProperties: { private: { sharkRef: ref } } };
    let res = c ? await api(link, run.deps, "PATCH", `${calPath(c.calendarId)}/${encodeURIComponent(c.externalId)}`, body) : null;
    if (!res || res.status === 404 || res.status === 410) res = await api(link, run.deps, "POST", calPath(target), body);
    if (res.status >= 400 || typeof res.json.id !== "string") throw new Error(`google export booking ${res.status}`);
    const data = { calendarId: target, externalId: res.json.id, title: a.title, startAt: a.startAt, endAt: a.endAt, allDay: false, etag: String(res.json.etag ?? "x"), sharkRef: ref, deletedAt: null };
    if (c) await db.calExternalEvent.updateMany({ where: { id: c.id, userId: link.userId }, data });
    else await db.calExternalEvent.create({ data: { ...data, linkId: link.id, userId: link.userId } });
    changed++;
  }
  return changed;
}

/** ลบสำเนาทั้งหมดของลิงก์ทันทีแบบมีเพดานเวลา (ยกเลิกเชื่อม/ลบบัญชี · review b m6/m7) — ที่เหลือหลังหมดเวลาค้างใน Google (บันทึกใน ops) */
async function deleteCopiesNow(link: CalLink, deps: GoogleDeps | undefined, budgetMs = COPY_DELETE_BUDGET_MS): Promise<{ deleted: number; left: number }> {
  const deadline = Date.now() + budgetMs;
  const jobs: { cal: string; id: string }[] = [];
  for (const tenantId of await tenantsOf(link.userId)) {
    const rows = await tenantDb({ tenantId }).calItem.findMany({ where: { userId: link.userId, tenantId, externalId: { not: null } }, select: { externalId: true, externalCalendarId: true }, take: 1_000 });
    for (const r of rows) jobs.push({ cal: r.externalCalendarId ?? exportCal(link), id: r.externalId! });
  }
  const copies = await gdb().calExternalEvent.findMany({ where: { userId: link.userId, linkId: link.id, sharkRef: { not: null } }, select: { calendarId: true, externalId: true } });
  for (const c of copies) jobs.push({ cal: c.calendarId, id: c.externalId });
  let deleted = 0;
  let i = 0;
  const worker = async () => {
    while (i < jobs.length && Date.now() < deadline) {
      const j = jobs[i++]!;
      try {
        const r = await api(link, deps, "DELETE", `${calPath(j.cal)}/${encodeURIComponent(j.id)}`);
        if (r.status < 400 || r.status === 404 || r.status === 410) deleted++;
      } catch {
        /* พยายาม */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, worker));
  const left = jobs.length - deleted;
  if (left > 0) await logOps("WARN", "calendar", "google: ลบสำเนาไม่ครบก่อนถอนสิทธิ์", { detail: `link=${link.id} left=${left}` }).catch(() => undefined);
  return { deleted, left };
}

// ─────────────────────────── ดึงเข้า (§10.2) + แก้สองทาง ───────────────────────────

type GEvent = Record<string, unknown> & { id?: string; status?: string; etag?: string; updated?: string; summary?: string; location?: string; recurringEventId?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }; extendedProperties?: { private?: Record<string, string> } };

/** start/end ของ Google → UTC · all-day = เที่ยงคืนไทย (end exclusive) */
export function timesOf(e: GEvent): { startAt: Date; endAt: Date | null; allDay: boolean } | null {
  const dateMid = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) - 7 * 3_600_000) : null;
  };
  if (e.start?.date) {
    const s = dateMid(e.start.date);
    if (!s) return null;
    return { startAt: s, endAt: e.end?.date ? dateMid(e.end.date) : new Date(+s + 86_400_000), allDay: true };
  }
  if (e.start?.dateTime) {
    const s = new Date(e.start.dateTime);
    if (!Number.isFinite(+s)) return null;
    const en = e.end?.dateTime ? new Date(e.end.dateTime) : null;
    return { startAt: s, endAt: en && Number.isFinite(+en) ? en : null, allDay: false };
  }
  return null;
}

/** ดัชนีสำเนาของเรา: id อีเวนต์ Google → CalItem (ทุกร้านของผู้ใช้) / แถวจับคู่นัดบัตรคิว */
type OurIndex = { items: Map<string, { id: string; tenantId: string }>; bookings: Set<string> };
async function ourIndex(link: CalLink, tenants: string[]): Promise<OurIndex> {
  const items = new Map<string, { id: string; tenantId: string }>();
  for (const tenantId of tenants) {
    const rows = await tenantDb({ tenantId }).calItem.findMany({ where: { userId: link.userId, tenantId, externalId: { not: null } }, select: { id: true, externalId: true }, take: 5_000 });
    for (const r of rows) items.set(r.externalId!, { id: r.id, tenantId });
  }
  const b = await gdb().calExternalEvent.findMany({ where: { userId: link.userId, linkId: link.id, sharkRef: { not: null } }, select: { externalId: true } });
  return { items, bookings: new Set(b.map((x) => x.externalId)) };
}
const isOurs = (e: GEvent, idx: OurIndex) => {
  const priv = e.extendedProperties?.private ?? {};
  return !!priv.sharkItemId || !!priv.sharkRef || idx.items.has(String(e.id)) || idx.bookings.has(String(e.id)) || (!!e.recurringEventId && (idx.items.has(e.recurringEventId) || idx.bookings.has(e.recurringEventId)));
};

/**
 * ต้นฉบับของสำเนาเราถูกแก้/ลบใน Google ⇒ เขียนกลับ (calendar_b ▸ review b M1/M2/M3)
 *   จับคู่ด้วย id อีเวนต์ที่เราเก็บ (CalItem.externalId) — ไม่พึ่ง extendedProperties (อีเวนต์ที่ลบมีแค่ id/status)
 *   instance ของซีรีส์ (มี recurringEventId) ไม่ถูกนำมาเขียนทับซีรีส์เด็ดขาด · ใหม่กว่าชนะเทียบ userEditedAt (job ไม่แตะ)
 */
async function applyRemoteToItem(userId: string, hit: { id: string; tenantId: string }, e: GEvent, now: Date): Promise<boolean> {
  const db = tenantDb({ tenantId: hit.tenantId });
  const r = await db.calItem.findFirst({ where: { id: hit.id, userId, tenantId: hit.tenantId } });
  if (!r) return false;
  if (e.recurringEventId) return false; // ข้อยกเว้นรายครั้ง — ไม่แตะซีรีส์
  if (e.status === "cancelled") {
    if (r.status === "CANCELLED") return false;
    await db.calItem.updateMany({
      where: { id: r.id, userId, tenantId: hit.tenantId, version: r.version },
      data: { status: "CANCELLED", cancelledAt: now, nextFireAt: null, snoozeUntil: null, nagAt: null, externalId: null, externalEtag: null, externalCalendarId: null, syncDirty: false, version: { increment: 1 }, userEditedAt: now },
    });
    return true;
  }
  if (!e.etag || e.etag === r.externalEtag) return false;
  const updated = Date.parse(String(e.updated ?? ""));
  const mine = +(r.userEditedAt ?? r.createdAt);
  const t = timesOf(e);
  if (!Number.isFinite(updated) || updated <= mine || !t || r.status === "CANCELLED") {
    await db.calItem.updateMany({ where: { id: r.id, userId, tenantId: hit.tenantId }, data: { syncDirty: true } }); // ของผู้ใช้ในแอปใหม่กว่า ⇒ ส่งทับ
    return false;
  }
  const start = t.startAt;
  const endAt = r.kind === "EVENT" ? t.endAt : null;
  const s = schedule({ startAt: start, allDay: r.allDay, repeat: r.repeat, repeatDays: r.repeatDays, leadMinutes: r.leadMinutes, status: r.status, occursAt: start, firedOccAt: null, snoozeUntil: null, nagAt: null }, now);
  await db.calItem.updateMany({
    where: { id: r.id, userId, tenantId: hit.tenantId, version: r.version },
    data: {
      title: String(e.summary ?? r.title).trim().slice(0, 200) || r.title,
      startAt: start,
      endAt,
      occursAt: s.occursAt,
      nextFireAt: s.nextFireAt,
      firedOccAt: null,
      snoozeUntil: null,
      nagAt: null,
      externalEtag: e.etag,
      syncDirty: false,
      version: { increment: 1 },
      userEditedAt: new Date(updated),
    },
  });
  return true;
}

type Stream = "display" | "master";
type StreamState = { token: string | null; page: string | null; from: string | null; to: string | null };

/**
 * หนึ่งสตรีมของหนึ่งปฏิทิน (calendar_b ▸ review b M5): full sync มีหน้าต่าง timeMin/timeMax · เพดาน PAGES_PER_RUN หน้าต่อรอบ
 *   + เก็บ pageToken ทำต่อรอบหน้า · syncToken เฉพาะหน้าสุดท้าย · หยุดที่ deadline ระหว่างหน้า · ต่ออายุ lease ทุกหน้า · 410 = ล้างแล้วเริ่มใหม่
 *   display = singleEvents=true (ปฏิทินที่ import · ข้ามสำเนาของเรา) · master = singleEvents=false (ปฏิทินปลายทาง · เฉพาะสำเนาของเรา)
 */
async function runStream(link: CalLink, calId: string, kind: Stream, st: StreamState, run: Run, idx: OurIndex): Promise<{ changed: number; st: StreamState }> {
  const db = gdb();
  let changed = 0;
  let cur = { ...st };
  for (let restart = 0; restart < 2; restart++) {
    for (let p = 0; p < PAGES_PER_RUN; p++) {
      if (!timeLeft(run)) return { changed, st: cur };
      const q = new URLSearchParams({ singleEvents: kind === "display" ? "true" : "false", maxResults: String(PAGE) });
      if (cur.token) q.set("syncToken", cur.token); // incremental (หลายหน้าได้ — pageToken คู่กับ syncToken เดิม)
      else {
        // full sync (เริ่มใหม่หรือทำต่อ): พารามิเตอร์ชุดเดิมทุกหน้า (from/to เก็บไว้ในสถานะ)
        cur.from ??= new Date(+run.now - FULL_SYNC_BACK_MS).toISOString();
        if (kind === "display") cur.to ??= new Date(+run.now + FULL_SYNC_AHEAD_MS).toISOString();
        q.set("timeMin", cur.from);
        if (cur.to) q.set("timeMax", cur.to);
      }
      if (cur.page) q.set("pageToken", cur.page);
      const r = await api(link, run.deps, "GET", `${calPath(calId)}?${q.toString()}`);
      if (r.status === 410) {
        if (kind === "display") await db.calExternalEvent.deleteMany({ where: { userId: link.userId, linkId: link.id, calendarId: calId, sharkRef: null } });
        cur = { token: null, page: null, from: null, to: null };
        break;
      }
      if (r.status >= 400) throw new Error(`google events ${r.status}`);
      const events = ((Array.isArray(r.json.items) ? r.json.items : []) as GEvent[]).filter((e) => typeof e.id === "string");
      changed += kind === "display" ? await applyDisplayPage(link, calId, events, idx, run.now) : await applyMasterPage(link, events, idx, run.now);
      await db.calLink.updateMany({ where: { id: link.id, userId: link.userId }, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } });
      const next = typeof r.json.nextPageToken === "string" ? r.json.nextPageToken : null;
      if (next) {
        cur.page = next;
        continue;
      }
      cur = { token: typeof r.json.nextSyncToken === "string" ? r.json.nextSyncToken : cur.token, page: null, from: null, to: null };
      return { changed, st: cur };
    }
    if (cur.token || cur.page) return { changed, st: cur }; // ยังไม่จบหน้า ⇒ ทำต่อรอบหน้า
  }
  return { changed, st: cur };
}

/** หน้าของสตรีมแสดงผล — คิวรีแถวเดิมครั้งเดียวต่อหน้า · นับเพดานครั้งเดียวต่อหน้า (review b m9) */
async function applyDisplayPage(link: CalLink, calId: string, events: GEvent[], idx: OurIndex, now: Date): Promise<number> {
  const db = gdb();
  const mine = events.filter((e) => !isOurs(e, idx));
  if (!mine.length) return 0;
  const existing = new Map(
    (await db.calExternalEvent.findMany({ where: { userId: link.userId, linkId: link.id, calendarId: calId, externalId: { in: mine.map((e) => e.id!) } }, select: { id: true, externalId: true, etag: true, deletedAt: true } })).map((x) => [x.externalId, x]),
  );
  let room = EVENT_CAP - (await db.calExternalEvent.count({ where: { userId: link.userId, linkId: link.id } }));
  let changed = 0;
  const create: Prisma.CalExternalEventCreateManyInput[] = [];
  for (const e of mine) {
    const ex = existing.get(e.id!);
    if (e.status === "cancelled") {
      if (ex && !ex.deletedAt) {
        await db.calExternalEvent.updateMany({ where: { id: ex.id, userId: link.userId }, data: { deletedAt: now } });
        changed++;
      }
      continue;
    }
    const t = timesOf(e);
    if (!t) continue;
    const data = { title: String(e.summary ?? "").slice(0, 300) || "(ไม่มีชื่อ)", location: typeof e.location === "string" ? e.location.slice(0, 300) : null, startAt: t.startAt, endAt: t.endAt, allDay: t.allDay, etag: String(e.etag ?? ""), deletedAt: null };
    if (ex) {
      if (ex.etag === data.etag && !ex.deletedAt) continue;
      await db.calExternalEvent.updateMany({ where: { id: ex.id, userId: link.userId }, data });
      changed++;
    } else if (room > 0) {
      create.push({ ...data, linkId: link.id, userId: link.userId, calendarId: calId, externalId: e.id! });
      room--;
    }
  }
  if (create.length) changed += (await db.calExternalEvent.createMany({ data: create, skipDuplicates: true })).count;
  return changed;
}

/** หน้าของสตรีมต้นฉบับ (ปฏิทินปลายทาง) — สนใจเฉพาะสำเนาของเรา จับคู่ด้วย id ที่เราเก็บ */
async function applyMasterPage(link: CalLink, events: GEvent[], idx: OurIndex, now: Date): Promise<number> {
  const db = gdb();
  let changed = 0;
  for (const e of events) {
    const hit = idx.items.get(e.id!);
    if (hit) {
      if (await applyRemoteToItem(link.userId, hit, e, now)) changed++;
      continue;
    }
    if (idx.bookings.has(e.id!) && !e.recurringEventId) {
      // สำเนานัดบัตรคิว (ร้านเป็นต้นฉบับ): ลบใน Google = ลบแถวจับคู่ ⇒ สร้างใหม่รอบส่งออก · แก้ = ล้าง etag ⇒ เขียนทับ
      if (e.status === "cancelled") await db.calExternalEvent.deleteMany({ where: { userId: link.userId, linkId: link.id, externalId: e.id!, sharkRef: { not: null } } });
      else await db.calExternalEvent.updateMany({ where: { userId: link.userId, linkId: link.id, externalId: e.id!, sharkRef: { not: null }, NOT: { etag: String(e.etag ?? "") } }, data: { etag: "" } });
      changed++;
    }
  }
  return changed;
}

/**
 * ซิงก์หนึ่งรอบของผู้ใช้: ดึงเข้า (ปฏิทินที่ import) → สตรีมต้นฉบับของปลายทาง (แก้สองทาง) → ส่งออก CalItem → สำเนานัดบัตรคิว → ล้างแคชเก่า
 *   lease กันซ้อน (ต่ออายุทุกหน้า) · deadline หยุดระหว่างหน้า/รายการ แล้วทำต่อรอบหน้า · NEEDS_RECONNECT = 409 · ไม่เชื่อม = 404
 *   calendar_b ▸ review b m5: เขียนกลับเฉพาะสถานะซิงก์ต่อ id ปฏิทินลงรายการล่าสุด (ไม่ทับการเปิด/ปิด import ที่เกิดระหว่างซิงก์) ◂
 */
export async function syncGoogle(userId: string, opts: { reason?: "job" | "open" | "manual"; deps?: GoogleDeps; deadline?: number } = {}): Promise<{ ok: boolean; changed: number }> {
  const deps = opts.deps;
  const now = nowOf(deps);
  const run: Run = { deadline: opts.deadline ?? Date.now() + SYNC_DEADLINE_MS, deps, now };
  const db = gdb();
  const link = await linkOf(userId);
  if (!link) throw NOT_LINKED();
  if (link.status !== "ACTIVE") throw NEEDS_RECONNECT();
  const got = await db.calLink.updateMany({ where: { id: link.id, userId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } });
  if (got.count !== 1) return { ok: true, changed: 0 }; // อีกรอบถืออยู่
  let changed = 0;
  const states = new Map<string, Partial<CalendarEntry>>();
  try {
    const tenants = await tenantsOf(userId);
    const cals = calsOf(link).length ? calsOf(link) : await fetchCalendars(link, deps);
    if (!calsOf(link).length && cals.length) await db.calLink.updateMany({ where: { id: link.id, userId }, data: { calendars: cals as unknown as Prisma.InputJsonValue } });
    const idx = await ourIndex(link, tenants);
    for (const c of cals) {
      if (!c.import) continue;
      const r = await runStream(link, c.id, "display", { token: c.syncToken ?? null, page: c.pageToken ?? null, from: c.fullFrom ?? null, to: c.fullTo ?? null }, run, idx);
      changed += r.changed;
      states.set(c.id, { ...(states.get(c.id) ?? {}), syncToken: r.st.token, pageToken: r.st.page, fullFrom: r.st.from, fullTo: r.st.to, lastSyncAt: now.toISOString() });
    }
    const target = cals.find((c) => c.id === exportCal(link));
    if (target && (link.exportKinds.length || idx.items.size || idx.bookings.size)) {
      const r = await runStream(link, target.id, "master", { token: target.masterSyncToken ?? null, page: target.masterPageToken ?? null, from: target.masterFrom ?? null, to: null }, run, idx);
      changed += r.changed;
      states.set(target.id, { ...(states.get(target.id) ?? {}), masterSyncToken: r.st.token, masterPageToken: r.st.page, masterFrom: r.st.from });
    }
    if (timeLeft(run)) changed += await exportItems(link, run);
    if (timeLeft(run)) changed += await exportBookings(link, run);
    await db.calExternalEvent.deleteMany({ where: { userId, linkId: link.id, sharkRef: null, OR: [{ endAt: { lt: new Date(+now - PRUNE_BEFORE_MS) } }, { endAt: null, startAt: { lt: new Date(+now - PRUNE_BEFORE_MS) } }] } });
    await saveStates(link, states, { lastSyncAt: now, lastError: null });
    return { ok: true, changed };
  } catch (e) {
    const reconnect = e instanceof GoogleError && e.code === "needs_reconnect";
    await saveStates(link, states, { lastSyncAt: now, lastError: reconnect ? RECONNECT_TH : "ซิงก์ไม่สำเร็จ จะลองใหม่รอบถัดไป" }).catch(() => undefined);
    if (!reconnect) await logOps("WARN", "calendar", "google: ซิงก์ล้ม", { detail: `link=${link.id} ${errDetail(e)}`.slice(0, 300) }).catch(() => undefined);
    if (e instanceof GoogleError) throw e;
    return { ok: false, changed };
  }
}

/** รวมสถานะซิงก์ต่อ id ลงรายการปฏิทินล่าสุด (อ่านใหม่) · ปฏิทินที่ถูกปิด import ระหว่างซิงก์ = ไม่คืนสถานะสตรีมแสดงผล + ปล่อย lease */
async function saveStates(link: CalLink, states: Map<string, Partial<CalendarEntry>>, extra: { lastSyncAt: Date; lastError: string | null }): Promise<void> {
  const fresh = await linkOf(link.userId);
  if (!fresh || fresh.id !== link.id) return;
  const merged = calsOf(fresh).map((c) => {
    const s = states.get(c.id);
    if (!s) return c;
    const display = c.import ? { syncToken: s.syncToken ?? c.syncToken, pageToken: s.pageToken !== undefined ? s.pageToken : c.pageToken, fullFrom: s.fullFrom !== undefined ? s.fullFrom : c.fullFrom, fullTo: s.fullTo !== undefined ? s.fullTo : c.fullTo, lastSyncAt: s.lastSyncAt ?? c.lastSyncAt } : {};
    const master = s.masterSyncToken !== undefined || s.masterPageToken !== undefined ? { masterSyncToken: s.masterSyncToken ?? null, masterPageToken: s.masterPageToken ?? null, masterFrom: s.masterFrom ?? null } : {};
    return { ...c, ...display, ...master };
  });
  await gdb().calLink.updateMany({ where: { id: link.id, userId: link.userId }, data: { calendars: merged as unknown as Prisma.InputJsonValue, lastSyncAt: extra.lastSyncAt, lastError: extra.lastError, leaseUntil: null } });
}

// ─────────────────────────── ยกเลิกเชื่อม (§10.4) ───────────────────────────

/** ลบสำเนา (มีเพดานเวลา) → revoke (พยายาม) → ลบ CalLink (cascade แคช) → ล้าง externalId ของ CalItem ทุกร้าน · ไม่เชื่อม = ok */
export async function disconnectGoogle(userId: string, deps?: GoogleDeps): Promise<{ ok: true }> {
  const link = await linkOf(userId);
  if (!link) return { ok: true };
  if (link.status === "ACTIVE") await deleteCopiesNow(link, deps).catch(() => undefined);
  const tok = openIntegrationSecret(link.tokenBox, aad(userId, link.id)) as Tok | null;
  if (tok?.refreshToken) await revoke(tok.refreshToken, deps);
  await gdb().calLink.deleteMany({ where: { id: link.id, userId } });
  for (const tenantId of await tenantsOf(userId)) {
    await tenantDb({ tenantId }).calItem.updateMany({ where: { userId, tenantId, OR: [{ externalId: { not: null } }, { syncDirty: true }] }, data: { externalId: null, externalEtag: null, externalCalendarId: null, syncDirty: false } });
  }
  return { ok: true };
}

/** ลบบัญชี (deleteUserTraces) — ลบสำเนา (มีเพดานเวลา · review b m6) แล้วถอน token แบบพยายาม · ไม่บล็อกการลบ */
export async function revokeGoogleForDeletion(userId: string, deps?: GoogleDeps): Promise<void> {
  const link = await linkOf(userId).catch(() => null);
  if (!link) return;
  if (link.status === "ACTIVE") await deleteCopiesNow(link, deps).catch(() => undefined);
  const tok = openIntegrationSecret(link.tokenBox, aad(userId, link.id)) as Tok | null;
  if (tok?.refreshToken) await revoke(tok.refreshToken, deps);
}

// ─────────────────────────── job `calendar.google` (§10.2 · ทุก 15 นาที) ───────────────────────────

export type GoogleJobResult = { picked: number; ok: number; failed: number; reconnect: number };

/**
 * 🔴 ข้อยกเว้น M3 ตาม §3.3: เลือก CalLink ข้ามผู้ใช้ที่ถึงรอบ แล้วซิงก์ "แทนเจ้าของแถว" ทีละคน · ผลถึงเจ้าของแถวคนเดียว
 *   deadline ของงานส่งต่อเข้า syncGoogle (หยุดระหว่างหน้า · review b M5) · deps.scope (QC เท่านั้น) จำกัดผู้ใช้ที่พิจารณา
 */
export async function runGoogleSync(now: Date, opts: { deadline?: number; deps?: GoogleDeps & { scope?: { userIds?: string[] } } } = {}): Promise<GoogleJobResult> {
  const deadline = opts.deadline ?? Date.now() + 8_000;
  const res: GoogleJobResult = { picked: 0, ok: 0, failed: 0, reconnect: 0 };
  const scope = opts.deps?.scope?.userIds;
  const due = await gdb().calLink.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(+now - SYNC_STALE_MS) } }],
      AND: [{ OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }],
      ...(scope ? { userId: { in: scope } } : {}),
    },
    select: { userId: true },
    orderBy: [{ lastSyncAt: { sort: "asc", nulls: "first" } }],
    take: JOB_BATCH,
  });
  for (const l of due) {
    if (Date.now() > deadline - 500) break;
    res.picked++;
    try {
      const r = await syncGoogle(l.userId, { reason: "job", deps: { ...opts.deps, now }, deadline });
      if (r.ok) res.ok++;
      else res.failed++;
    } catch (e) {
      if (e instanceof GoogleError && e.code === "needs_reconnect") res.reconnect++;
      else res.failed++;
    }
  }
  return res;
}

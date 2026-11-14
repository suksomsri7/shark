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

export const SCOPE_EVENTS = "https://www.googleapis.com/auth/calendar.events";
export const SCOPE_LIST = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const GOOGLE_SCOPES = [SCOPE_EVENTS, SCOPE_LIST] as const;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

export const SYNC_EVERY_MIN = 15;
export const SYNC_STALE_MS = 14 * 60_000;
export const JOB_BATCH = 20;
export const LEASE_MS = 5 * 60_000;
export const FULL_SYNC_BACK_MS = 30 * 86_400_000;
export const PRUNE_BEFORE_MS = 60 * 86_400_000;
export const EVENT_CAP = 5_000;
export const BOOKING_AHEAD_MS = 60 * 86_400_000;
const PAGE = 250;
const MAX_PAGES = 20;

export type GoogleDeps = { fetch?: typeof fetch; now?: Date };
export type ExportKind = "EVENT" | "REMINDER" | "BOOKING";
export type CalendarEntry = { id: string; name: string; color: string | null; primary: boolean; accessRole: string; import: boolean; syncToken?: string | null; lastSyncAt?: string | null };
export type GoogleLinkDto = {
  status: "NONE" | "ACTIVE" | "NEEDS_RECONNECT";
  email: string | null;
  calendars: { id: string; name: string; color: string | null; primary: boolean; import: boolean; accessRole: string }[];
  exportKinds: ExportKind[];
  exportCalendarId: string | null;
  exportCalendarName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
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

type Tok = { refreshToken: string; accessToken?: string; expiresAt?: number };

// ─────────────────────────── DTO ───────────────────────────

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
      syncToken: typeof x.syncToken === "string" ? x.syncToken : null,
      lastSyncAt: typeof x.lastSyncAt === "string" ? x.lastSyncAt : null,
    }));
}

function toDto(link: CalLink | null): GoogleLinkDto {
  if (!link) return { status: "NONE", email: null, calendars: [], exportKinds: [], exportCalendarId: null, exportCalendarName: null, lastSyncAt: null, lastError: null };
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
  };
}

async function linkOf(userId: string): Promise<CalLink | null> {
  return gdb().calLink.findFirst({ where: { userId, provider: "GOOGLE" } });
}

export async function googleStatus(userId: string): Promise<GoogleLinkDto | null> {
  const l = await linkOf(userId);
  return l ? toDto(l) : null;
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
function emailOfIdToken(t: unknown): string {
  if (typeof t !== "string") return "";
  const p = t.split(".")[1];
  if (!p) return "";
  try {
    const o = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { email?: unknown };
    return typeof o.email === "string" ? o.email.slice(0, 200) : "";
  } catch {
    return "";
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
    if (r.json.error === "invalid_grant" || r.status === 400 || r.status === 401) {
      await markReconnect(link);
      throw NEEDS_RECONNECT();
    }
    throw new Error(`google token refresh ${r.status}`);
  }
  const next: Tok = { refreshToken: tok.refreshToken, accessToken: r.json.access_token, expiresAt: now + Number(r.json.expires_in ?? 3600) * 1000 };
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
        lastSyncAt: prev?.lastSyncAt ?? null,
      });
    }
    pageToken = typeof r.json.nextPageToken === "string" ? r.json.nextPageToken : "";
    if (!pageToken) break;
  }
  return out.slice(0, 100);
}

/** แลก serverAuthCode → token (กล่องลับ) → CalLink (เชื่อมซ้ำ = แทนที่ token + ถอน token เดิมแบบพยายาม · คงค่า import) → ดึงรายการปฏิทิน */
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
  if (typeof r.json.refresh_token !== "string" || !r.json.refresh_token) throw BAD_CODE();
  const now = +nowOf(deps);
  const tok: Tok = { refreshToken: r.json.refresh_token, accessToken: r.json.access_token, expiresAt: now + Number(r.json.expires_in ?? 3600) * 1000 };
  const prev = await linkOf(userId);
  const id = prev?.id ?? newId();
  const box = sealIntegrationSecret(tok, aad(userId, id));
  let link: CalLink;
  if (prev) {
    const old = openIntegrationSecret(prev.tokenBox, aad(userId, id)) as Tok | null;
    await gdb().calLink.updateMany({ where: { id, userId }, data: { tokenBox: box, scopes: [...GOOGLE_SCOPES], status: "ACTIVE", lastError: null, leaseUntil: null, ...(emailOfIdToken(r.json.id_token) ? { email: emailOfIdToken(r.json.id_token) } : {}) } });
    if (old?.refreshToken && old.refreshToken !== tok.refreshToken) await revoke(old.refreshToken, deps);
    link = (await linkOf(userId))!;
  } else {
    link = await gdb().calLink.create({ data: { id, userId, provider: "GOOGLE", email: emailOfIdToken(r.json.id_token), tokenBox: box, scopes: [...GOOGLE_SCOPES], exportKinds: ["EVENT"] } });
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
  // นัดส่วนตัวที่มีอยู่แล้ว (ชนิดที่เลือกส่งออก) ⇒ ส่งรอบถัดไป
  await markDirtyForKinds(userId, link.exportKinds);
  return toDto(link);
}

/** ตั้งค่า (จอ 9): ปฏิทินที่ดึง · ชนิดที่ส่งออก · ปฏิทินปลายทาง (owner/writer เท่านั้น) */
export async function updateGoogle(
  userId: string,
  patch: { calendars?: { id: string; import: boolean }[]; exportCalendarId?: string | null; exportKinds?: ExportKind[] },
  deps?: GoogleDeps,
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
    return { ...c, import: imp, ...(imp ? {} : { syncToken: null }) };
  });
  // ปิดดึงปฏิทิน = ลบแคชของปฏิทินนั้น (ไม่ลบแถวจับคู่สำเนาของเรา sharkRef)
  if (turnedOff.length) await db.calExternalEvent.deleteMany({ where: { userId, linkId: link.id, calendarId: { in: turnedOff }, sharkRef: null } });
  const kinds = patch.exportKinds ? [...new Set(patch.exportKinds.filter((k) => k === "EVENT" || k === "REMINDER" || k === "BOOKING"))] : link.exportKinds;
  const removedKinds = link.exportKinds.filter((k) => !kinds.includes(k));
  const addedKinds = kinds.filter((k) => !link.exportKinds.includes(k));
  const targetChanged = patch.exportCalendarId !== undefined && (patch.exportCalendarId ?? null) !== link.exportCalendarId;
  await db.calLink.updateMany({
    where: { id: link.id, userId },
    data: { calendars: nextCals as unknown as Prisma.InputJsonValue, exportKinds: kinds, ...(patch.exportCalendarId !== undefined ? { exportCalendarId: patch.exportCalendarId } : {}) },
  });
  // ปิดชนิด/ย้ายปลายทาง ⇒ ลบสำเนาเดิม (พยายาม) แล้วส่งใหม่ตามค่าใหม่
  if (removedKinds.length || targetChanged) {
    const kill = targetChanged ? (link.exportKinds as ExportKind[]) : (removedKinds as ExportKind[]);
    if (link.status === "ACTIVE") await deleteCopies(link, kill, deps).catch(async (e) => logOps("WARN", "calendar", "google: ลบสำเนาเดิมไม่สำเร็จ", { detail: errDetail(e) }).catch(() => undefined));
  }
  await markDirtyForKinds(userId, targetChanged ? kinds : addedKinds);
  return toDto(await linkOf(userId));
}

// ─────────────────────────── CalItem ข้ามร้านของผู้ใช้ ───────────────────────────

async function tenantsOf(userId: string): Promise<string[]> {
  const ms = await gdb().membership.findMany({ where: { userId }, select: { tenantId: true } });
  return [...new Set(ms.map((m) => m.tenantId))];
}

async function markDirtyForKinds(userId: string, kinds: string[]): Promise<void> {
  const k = kinds.filter((x) => x === "EVENT" || x === "REMINDER") as ("EVENT" | "REMINDER")[];
  if (!k.length) return;
  for (const tenantId of await tenantsOf(userId)) {
    await tenantDb({ tenantId }).calItem.updateMany({ where: { userId, tenantId, kind: { in: k }, status: "OPEN" }, data: { syncDirty: true } });
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
const exportCal = (link: CalLink) => link.exportCalendarId ?? "primary";

async function exportItems(link: CalLink, deps: GoogleDeps | undefined): Promise<number> {
  let changed = 0;
  const kinds = link.exportKinds;
  for (const tenantId of await tenantsOf(link.userId)) {
    const db = tenantDb({ tenantId });
    const rows = await db.calItem.findMany({ where: { userId: link.userId, tenantId, syncDirty: true }, take: 100, orderBy: { updatedAt: "asc" } });
    for (const r of rows) {
      const should = (r.status === "OPEN" || r.status === "DONE") && kinds.includes(r.kind);
      let data: Prisma.CalItemUpdateManyMutationInput = { syncDirty: false };
      if (should) {
        const body = eventBodyOf(r);
        let res = r.externalId ? await api(link, deps, "PATCH", `${calPath(exportCal(link))}/${encodeURIComponent(r.externalId)}`, body) : null;
        if (!res || res.status === 404 || res.status === 410) res = await api(link, deps, "POST", calPath(exportCal(link)), body);
        if (res.status >= 400 || typeof res.json.id !== "string") throw new Error(`google export ${res.status}`);
        data = { syncDirty: false, externalId: res.json.id, externalEtag: typeof res.json.etag === "string" ? res.json.etag : null };
      } else if (r.externalId) {
        const res = await api(link, deps, "DELETE", `${calPath(exportCal(link))}/${encodeURIComponent(r.externalId)}`);
        if (res.status >= 400 && res.status !== 404 && res.status !== 410) throw new Error(`google delete ${res.status}`);
        data = { syncDirty: false, externalId: null, externalEtag: null };
      }
      // ไม่แตะ version (ไม่ใช่การแก้ของผู้ใช้) · ผู้ใช้แก้ระหว่างนี้ = updatedAt เปลี่ยน ⇒ คง dirty ไว้รอบหน้า
      await db.calItem.updateMany({ where: { id: r.id, userId: link.userId, tenantId, updatedAt: r.updatedAt }, data });
      changed++;
    }
  }
  return changed;
}

/** นัดบัตรคิวที่ "ของฉัน" 60 วันข้างหน้า ทุกกิจการ (R-CAL-37 · ชื่อ = <บริการ> · <ชื่อลูกค้า> ไม่มีเบอร์) */
async function myAppointments(userId: string, now: Date): Promise<Map<string, { title: string; startAt: Date; endAt: Date; updatedAt: Date }>> {
  const out = new Map<string, { title: string; startAt: Date; endAt: Date; updatedAt: Date }>();
  const { employeeOfUser } = await import("@/lib/modules/hr");
  for (const tenantId of await tenantsOf(userId)) {
    const emp = await employeeOfUser(tenantId, userId);
    if (!emp) continue;
    const units = await tenantDb({ tenantId }).businessUnit.findMany({ where: { tenantId, type: "BOOKING", status: "ACTIVE" }, select: { id: true } });
    for (const u of units) {
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

async function exportBookings(link: CalLink, deps: GoogleDeps | undefined, now: Date): Promise<number> {
  const db = gdb();
  const copies = await db.calExternalEvent.findMany({ where: { userId: link.userId, linkId: link.id, sharkRef: { not: null } } });
  const want = link.exportKinds.includes("BOOKING") ? await myAppointments(link.userId, now) : new Map();
  let changed = 0;
  for (const c of copies) {
    const w = want.get(c.sharkRef!);
    if (w && c.calendarId === exportCal(link)) continue;
    const res = await api(link, deps, "DELETE", `${calPath(c.calendarId)}/${encodeURIComponent(c.externalId)}`);
    if (res.status >= 400 && res.status !== 404 && res.status !== 410) throw new Error(`google delete ${res.status}`);
    await db.calExternalEvent.deleteMany({ where: { id: c.id, userId: link.userId } });
    changed++;
  }
  const byRef = new Map(copies.filter((c) => c.calendarId === exportCal(link)).map((c) => [c.sharkRef!, c]));
  for (const [ref, a] of want) {
    const c = byRef.get(ref);
    // ฝั่งร้านเป็นต้นฉบับ: ไม่มีสำเนา / นัดถูกแก้หลังส่ง / สำเนาถูกแก้ใน Google (etag ถูกล้างตอนดึง) ⇒ เขียนทับ
    if (c && c.etag && +a.updatedAt <= +c.updatedAt && +c.startAt === +a.startAt) continue;
    const body = { summary: a.title, start: { dateTime: dtOf(a.startAt), timeZone: "Asia/Bangkok" }, end: { dateTime: dtOf(a.endAt), timeZone: "Asia/Bangkok" }, reminders: { useDefault: false, overrides: [] }, extendedProperties: { private: { sharkRef: ref } } };
    let res = c ? await api(link, deps, "PATCH", `${calPath(c.calendarId)}/${encodeURIComponent(c.externalId)}`, body) : null;
    if (!res || res.status === 404 || res.status === 410) res = await api(link, deps, "POST", calPath(exportCal(link)), body);
    if (res.status >= 400 || typeof res.json.id !== "string") throw new Error(`google export booking ${res.status}`);
    const data = { calendarId: exportCal(link), externalId: res.json.id, title: a.title, startAt: a.startAt, endAt: a.endAt, allDay: false, etag: String(res.json.etag ?? "x"), sharkRef: ref, deletedAt: null };
    if (c) await db.calExternalEvent.updateMany({ where: { id: c.id, userId: link.userId }, data });
    else await db.calExternalEvent.create({ data: { ...data, linkId: link.id, userId: link.userId } });
    changed++;
  }
  return changed;
}

/** ลบสำเนาที่ส่งออกแล้วของชนิดที่ระบุ (ปิดตัวเลือก/ย้ายปลายทาง/ยกเลิกเชื่อม) */
async function deleteCopies(link: CalLink, kinds: ExportKind[], deps?: GoogleDeps): Promise<void> {
  const itemKinds = kinds.filter((k) => k === "EVENT" || k === "REMINDER") as ("EVENT" | "REMINDER")[];
  if (itemKinds.length) {
    for (const tenantId of await tenantsOf(link.userId)) {
      const db = tenantDb({ tenantId });
      const rows = await db.calItem.findMany({ where: { userId: link.userId, tenantId, kind: { in: itemKinds }, externalId: { not: null } }, select: { id: true, externalId: true }, take: 1_000 });
      for (const r of rows) {
        await api(link, deps, "DELETE", `${calPath(exportCal(link))}/${encodeURIComponent(r.externalId!)}`).catch(() => undefined);
        await db.calItem.updateMany({ where: { id: r.id, userId: link.userId, tenantId }, data: { externalId: null, externalEtag: null, syncDirty: false } });
      }
    }
  }
  if (kinds.includes("BOOKING")) {
    const db = gdb();
    const copies = await db.calExternalEvent.findMany({ where: { userId: link.userId, linkId: link.id, sharkRef: { not: null } }, select: { id: true, calendarId: true, externalId: true } });
    for (const c of copies) {
      await api(link, deps, "DELETE", `${calPath(c.calendarId)}/${encodeURIComponent(c.externalId)}`).catch(() => undefined);
    }
    await db.calExternalEvent.deleteMany({ where: { userId: link.userId, linkId: link.id, sharkRef: { not: null } } });
  }
}

// ─────────────────────────── ดึงเข้า (§10.2) + แก้สองทาง ───────────────────────────

type GEvent = Record<string, unknown> & { id?: string; status?: string; etag?: string; updated?: string; summary?: string; location?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }; extendedProperties?: { private?: Record<string, string> } };

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

/** อีเวนต์ที่เป็นสำเนา CalItem ถูกแก้/ลบใน Google ⇒ เขียนกลับ (ใหม่กว่าชนะ · ลบ = ยกเลิก) */
async function applyRemoteToItem(userId: string, tenants: string[], itemId: string, e: GEvent, now: Date): Promise<boolean> {
  for (const tenantId of tenants) {
    const db = tenantDb({ tenantId });
    const r = await db.calItem.findFirst({ where: { id: itemId, userId, tenantId } });
    if (!r) continue;
    if (e.status === "cancelled") {
      if (r.status === "CANCELLED") return false;
      await db.calItem.updateMany({
        where: { id: r.id, userId, tenantId, version: r.version },
        data: { status: "CANCELLED", cancelledAt: now, nextFireAt: null, snoozeUntil: null, nagAt: null, externalId: null, externalEtag: null, syncDirty: false, version: { increment: 1 } },
      });
      return true;
    }
    if (!e.etag || e.etag === r.externalEtag) return false;
    const updated = Date.parse(String(e.updated ?? ""));
    const t = timesOf(e);
    if (!Number.isFinite(updated) || updated <= +r.updatedAt || !t || r.status === "CANCELLED") {
      await db.calItem.updateMany({ where: { id: r.id, userId, tenantId }, data: { syncDirty: true } }); // ของเราใหม่กว่า ⇒ ส่งทับ
      return false;
    }
    const start = t.startAt;
    const endAt = r.kind === "EVENT" ? t.endAt : null;
    const s = schedule({ startAt: start, allDay: r.allDay, repeat: r.repeat, repeatDays: r.repeatDays, leadMinutes: r.leadMinutes, status: r.status, occursAt: start, firedOccAt: null, snoozeUntil: null, nagAt: null }, now);
    await db.calItem.updateMany({
      where: { id: r.id, userId, tenantId, version: r.version },
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
      },
    });
    return true;
  }
  return false;
}

async function importCalendar(link: CalLink, cal: CalendarEntry, deps: GoogleDeps | undefined, tenants: string[]): Promise<{ changed: number; syncToken: string | null }> {
  const db = gdb();
  const now = nowOf(deps);
  let changed = 0;
  let token = cal.syncToken ?? null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let pageToken = "";
    let next: string | null = null;
    let gone = false;
    for (let p = 0; p < MAX_PAGES; p++) {
      const q = new URLSearchParams({ singleEvents: "true", maxResults: String(PAGE) });
      if (token) q.set("syncToken", token);
      else q.set("timeMin", new Date(+now - FULL_SYNC_BACK_MS).toISOString());
      if (pageToken) q.set("pageToken", pageToken);
      const r = await api(link, deps, "GET", `${calPath(cal.id)}?${q.toString()}`);
      if (r.status === 410) {
        gone = true;
        break;
      }
      if (r.status >= 400) throw new Error(`google events ${r.status}`);
      for (const e of (Array.isArray(r.json.items) ? r.json.items : []) as GEvent[]) {
        if (typeof e.id !== "string") continue;
        const priv = e.extendedProperties?.private ?? {};
        if (priv.sharkItemId) {
          if (await applyRemoteToItem(link.userId, tenants, priv.sharkItemId, e, now)) changed++;
          continue;
        }
        if (priv.sharkRef) {
          // สำเนานัดบัตรคิวถูกแก้ใน Google ⇒ ล้าง etag ให้รอบส่งออกเขียนทับกลับ (ฝั่งร้านเป็นต้นฉบับ)
          if (e.status !== "cancelled") await db.calExternalEvent.updateMany({ where: { userId: link.userId, linkId: link.id, sharkRef: priv.sharkRef, NOT: { etag: String(e.etag ?? "") } }, data: { etag: "" } });
          else await db.calExternalEvent.deleteMany({ where: { userId: link.userId, linkId: link.id, sharkRef: priv.sharkRef } });
          continue;
        }
        if (e.status === "cancelled") {
          const d = await db.calExternalEvent.updateMany({ where: { userId: link.userId, linkId: link.id, calendarId: cal.id, externalId: e.id, deletedAt: null }, data: { deletedAt: now } });
          changed += d.count;
          continue;
        }
        const t = timesOf(e);
        if (!t) continue;
        const data = { title: String(e.summary ?? "").slice(0, 300) || "(ไม่มีชื่อ)", location: typeof e.location === "string" ? e.location.slice(0, 300) : null, startAt: t.startAt, endAt: t.endAt, allDay: t.allDay, etag: String(e.etag ?? ""), deletedAt: null };
        const u = await db.calExternalEvent.updateMany({ where: { userId: link.userId, linkId: link.id, calendarId: cal.id, externalId: e.id }, data });
        if (u.count === 0) {
          if ((await db.calExternalEvent.count({ where: { userId: link.userId, linkId: link.id } })) >= EVENT_CAP) continue;
          await db.calExternalEvent.create({ data: { ...data, linkId: link.id, userId: link.userId, calendarId: cal.id, externalId: e.id } });
        }
        changed++;
      }
      pageToken = typeof r.json.nextPageToken === "string" ? r.json.nextPageToken : "";
      if (typeof r.json.nextSyncToken === "string") next = r.json.nextSyncToken;
      if (!pageToken) break;
    }
    if (!gone) return { changed, syncToken: next ?? token };
    // 410 Gone ⇒ ล้างแคชของปฏิทินนี้แล้ว full sync ใหม่
    await db.calExternalEvent.deleteMany({ where: { userId: link.userId, linkId: link.id, calendarId: cal.id, sharkRef: null } });
    token = null;
  }
  return { changed, syncToken: null };
}

/**
 * ซิงก์หนึ่งรอบของผู้ใช้: ดึงเข้า (ทุกปฏิทินที่ import) → ส่งออก CalItem ที่ dirty → สำเนานัดบัตรคิว → ล้างแคชเก่า
 *   lease กันซ้อน (job + ปุ่มรีเฟรช) · NEEDS_RECONNECT = 409 · ไม่เชื่อม = 404
 */
export async function syncGoogle(userId: string, opts: { reason?: "job" | "open" | "manual"; deps?: GoogleDeps } = {}): Promise<{ ok: boolean; changed: number }> {
  const deps = opts.deps;
  const now = nowOf(deps);
  const db = gdb();
  const link = await linkOf(userId);
  if (!link) throw NOT_LINKED();
  if (link.status !== "ACTIVE") throw NEEDS_RECONNECT();
  const got = await db.calLink.updateMany({ where: { id: link.id, userId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseUntil: new Date(+now + LEASE_MS) } });
  if (got.count !== 1) return { ok: true, changed: 0 }; // อีกรอบถืออยู่
  let changed = 0;
  try {
    const tenants = await tenantsOf(userId);
    // รายการปฏิทินว่าง (ดึงตอนเชื่อมไม่สำเร็จ) ⇒ ดึงใหม่ก่อน
    const cals = calsOf(link).length ? calsOf(link) : await fetchCalendars(link, deps);
    for (const c of cals) {
      if (!c.import) continue;
      const r = await importCalendar(link, c, deps, tenants);
      changed += r.changed;
      c.syncToken = r.syncToken;
      c.lastSyncAt = now.toISOString();
    }
    changed += await exportItems(link, deps);
    changed += await exportBookings(link, deps, now);
    await db.calExternalEvent.deleteMany({ where: { userId, linkId: link.id, sharkRef: null, OR: [{ endAt: { lt: new Date(+now - PRUNE_BEFORE_MS) } }, { endAt: null, startAt: { lt: new Date(+now - PRUNE_BEFORE_MS) } }] } });
    await db.calLink.updateMany({ where: { id: link.id, userId }, data: { calendars: cals as unknown as Prisma.InputJsonValue, lastSyncAt: now, lastError: null, leaseUntil: null } });
    return { ok: true, changed };
  } catch (e) {
    const reconnect = e instanceof GoogleError && e.code === "needs_reconnect";
    await db.calLink.updateMany({ where: { id: link.id, userId }, data: { leaseUntil: null, lastSyncAt: now, lastError: reconnect ? RECONNECT_TH : "ซิงก์ไม่สำเร็จ จะลองใหม่รอบถัดไป" } });
    if (!reconnect) await logOps("WARN", "calendar", "google: ซิงก์ล้ม", { detail: `link=${link.id} ${errDetail(e)}`.slice(0, 300) }).catch(() => undefined);
    if (e instanceof GoogleError) throw e;
    return { ok: false, changed };
  }
}

// ─────────────────────────── ยกเลิกเชื่อม (§10.4) ───────────────────────────

/** ลบสำเนาที่ส่งออก (พยายาม) → revoke (พยายาม) → ลบ CalLink (cascade แคช) → ล้าง externalId ของ CalItem ทุกร้าน · ไม่เชื่อม = ok */
export async function disconnectGoogle(userId: string, deps?: GoogleDeps): Promise<{ ok: true }> {
  const link = await linkOf(userId);
  if (!link) return { ok: true };
  if (link.status === "ACTIVE") await deleteCopies(link, ["EVENT", "REMINDER", "BOOKING"], deps).catch(() => undefined);
  const tok = openIntegrationSecret(link.tokenBox, aad(userId, link.id)) as Tok | null;
  if (tok?.refreshToken) await revoke(tok.refreshToken, deps);
  await gdb().calLink.deleteMany({ where: { id: link.id, userId } });
  for (const tenantId of await tenantsOf(userId)) {
    await tenantDb({ tenantId }).calItem.updateMany({ where: { userId, tenantId, OR: [{ externalId: { not: null } }, { syncDirty: true }] }, data: { externalId: null, externalEtag: null, syncDirty: false } });
  }
  return { ok: true };
}

/** ลบบัญชี (deleteUserTraces) — ถอน token แบบพยายามเท่านั้น ไม่บล็อกการลบ */
export async function revokeGoogleForDeletion(userId: string, deps?: GoogleDeps): Promise<void> {
  const link = await linkOf(userId).catch(() => null);
  if (!link) return;
  const tok = openIntegrationSecret(link.tokenBox, aad(userId, link.id)) as Tok | null;
  if (tok?.refreshToken) await revoke(tok.refreshToken, deps);
}

// ─────────────────────────── job `calendar.google` (§10.2 · ทุก 15 นาที) ───────────────────────────

export type GoogleJobResult = { picked: number; ok: number; failed: number; reconnect: number };

/**
 * 🔴 ข้อยกเว้น M3 ตาม §3.3: เลือก CalLink ข้ามผู้ใช้ที่ถึงรอบ แล้วซิงก์ "แทนเจ้าของแถว" ทีละคน · ผลถึงเจ้าของแถวคนเดียว
 *   deps.scope (QC เท่านั้น) จำกัดผู้ใช้ที่พิจารณา
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
    if (Date.now() > deadline) break;
    res.picked++;
    try {
      const r = await syncGoogle(l.userId, { reason: "job", deps: { ...opts.deps, now } });
      if (r.ok) res.ok++;
      else res.failed++;
    } catch (e) {
      if (e instanceof GoogleError && e.code === "needs_reconnect") res.reconnect++;
      else res.failed++;
    }
  }
  return res;
}

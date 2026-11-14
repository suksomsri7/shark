// ปฏิทินเลขา (CAL2.x) — ชนิดข้อมูล + เส้น API ตามสัญญา docs/modules/32-secretary-calendar.md (§4.1 AgendaItem · §8 เส้นแอป · §11 นัดชน)
// ทุกเส้นอยู่ใต้ /api/mobile/secretary/calendar/* (ส่ง x-tenant-id) · google/* = ระดับผู้ใช้ (ไม่ส่ง x-tenant-id)
// โหมด fixture (ก่อน CAL1.6 ขึ้น): เฉพาะ dev (__DEV__) หรือ export QC (EXPO_PUBLIC_QC=1) หรือ EXPO_PUBLIC_CAL_FIXTURE=1
//   ⇒ เซิร์ฟเวอร์ตอบ 404 (ยังไม่มีเส้น) = ใช้ข้อมูลตัวอย่างใน calendar.fixtures.ts (แก้ไข/ติ๊ก/ลบได้ในหน่วยความจำ)
//   build จริง (production) ไม่เคยใช้ fixture — 404 = ข้อผิดพลาดตามปกติ (จอแสดง "ยังไม่พร้อม" / ว่าง)
import { useSyncExternalStore } from "react";
import { api, ApiError } from "@/src/api/client";
import { fixtureCall } from "@/src/api/calendar.fixtures";

// ───────── ชนิด (§4.1) ─────────
export type AgendaSource =
  | "booking" | "account" | "tax" | "kanban" | "crm" | "hr" | "dorm" | "ticket" | "trips"
  | "reminder" | "event"
  | "google"
  | "device";

export type ColorKey = "booking" | "account" | "kanban" | "crm" | "hr" | "dorm" | "ticket" | "trips" | "remind" | "personal" | "google" | "device";
export const COLOR_KEYS: readonly ColorKey[] = ["booking", "account", "kanban", "crm", "hr", "dorm", "ticket", "trips", "remind", "personal", "google", "device"];

export type AgendaDeepLink = { kind: "web"; path: string } | { kind: "app"; path: string } | null;

export type AgendaItem = {
  id: string;
  source: AgendaSource;
  title: string;
  sub: string | null;
  label: string;
  startAt: string;
  endAt?: string;
  allDay: boolean;
  timeHint: "DURATION" | "REMIND" | "DUE" | null;
  deepLink: AgendaDeepLink;
  checkable: boolean;
  done: boolean;
  mine: boolean;
  colorKey: ColorKey;
  conflictWith?: string[];
  summary?: { count: number; amountSatang?: number };
  ref?: { itemId?: string; occ?: string; cardId?: string; activityId?: string; systemId?: string };
};

export type ConflictNote = { key: string; kind: "OVERLAP" | "TIGHT"; earlierId: string; laterId: string; text: string; suggestRemindAt: string | null };

export type AgendaNote = { code: "BOOKING_UNLINKED" | "SECTION_FAILED" | "SECTION_OFF"; source: AgendaSource; text: string };
export type AgendaResult = { items: AgendaItem[]; conflicts: ConflictNote[]; notes: AgendaNote[] };

export type MonthRes = { ym: string; days: Record<string, ColorKey[]> };

export type BriefLine = { colorKey: ColorKey; text: string; rightText: string };
export type TodayRes = { day: string; dateLabel: string; count: number; greeting: string; lines: BriefLine[]; more: boolean };

export type CalKind = "REMINDER" | "EVENT";
export type CalRepeat = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
export type CalStatus = "DRAFT" | "OPEN" | "DONE" | "CANCELLED";
export type CalLinkType = "CRM_CONTACT" | "CRM_DEAL" | "ACCOUNT_DOC" | "KANBAN_CARD";
export const LEAD_MINUTES = [0, 5, 10, 15, 30, 60, 120, 1440] as const;

export type CalItemDto = {
  id: string;
  kind: CalKind;
  title: string;
  note: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  repeat: CalRepeat;
  repeatDays: number[];
  leadMinutes: number;
  link: { type: CalLinkType; id: string; systemId: string | null; label: string } | null;
  status: CalStatus;
  doneAt: string | null;
  occursAt: string;
  nextFireAt: string | null;
  snoozeUntil: string | null;
  source: "APP" | "CHAT" | "SUGGEST";
  roomId: string | null;
  exported: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CalItemBody = {
  kind: CalKind;
  title: string;
  note?: string;
  startAt: string;
  endAt?: string;
  allDay?: boolean;
  repeat?: CalRepeat;
  repeatDays?: number[];
  leadMinutes?: number;
  link?: { type: CalLinkType; id: string };
  origin?: "conflict";
};
export type CalItemPatch = Partial<Omit<CalItemBody, "origin" | "link">> & { link?: { type: CalLinkType; id: string } | null };

export type ItemsTab = "today" | "upcoming" | "done";

export type PrefSourceKey = "booking" | "account" | "tax" | "kanban" | "crm" | "hr" | "dorm" | "ticket" | "trips";
export type PrefsRes = {
  tenantName: string;
  morning: { on: boolean; minute: number };
  evening: { on: boolean; minute: number };
  travelMinutes: number;
  sources: { key: PrefSourceKey; label: string; sub: string; on: boolean }[];
  google: { status: "NONE" | "ACTIVE" | "NEEDS_RECONNECT"; email: string | null };
};
export type PrefsPut = {
  morning?: { on?: boolean; minute?: number };
  evening?: { on?: boolean; minute?: number };
  travelMinutes?: number;
  sources?: Partial<Record<PrefSourceKey, boolean>>;
};

export type GoogleLinkDto = {
  status: "NONE" | "ACTIVE" | "NEEDS_RECONNECT";
  email?: string | null;
  calendars?: { id: string; name: string; color: string; primary: boolean; import: boolean; sub?: string | null }[];
  exportKinds?: ("EVENT" | "REMINDER" | "BOOKING")[];
  exportCalendarId?: string | null;
  exportCalendarName?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
};

// ───────── fixture mode ─────────
/** ใช้ fixture ได้เมื่อเซิร์ฟเวอร์ยังไม่มีเส้น (404) — dev/QC เท่านั้น */
export const CAL_FIXTURE_ALLOWED: boolean =
  (typeof __DEV__ !== "undefined" && __DEV__) || process.env.EXPO_PUBLIC_QC === "1" || process.env.EXPO_PUBLIC_CAL_FIXTURE === "1";

let fixtureOn = false;
const fixListeners = new Set<() => void>();
function setFixtureOn(v: boolean) {
  if (fixtureOn === v) return;
  fixtureOn = v;
  fixListeners.forEach((fn) => fn());
}
/** จอแสดงป้าย "ข้อมูลตัวอย่าง" เมื่อกำลังใช้ fixture */
export function useCalFixture(): boolean {
  return useSyncExternalStore(
    (l) => {
      fixListeners.add(l);
      return () => fixListeners.delete(l);
    },
    () => fixtureOn,
    () => fixtureOn,
  );
}

const BASE = "/api/mobile/secretary/calendar";
type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
type Q = Record<string, string | number | undefined>;

function qs(q?: Q): string {
  if (!q) return "";
  const s = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return s ? `?${s}` : "";
}

/** เรียกเส้นปฏิทิน · `sub` = ส่วนหลัง calendar/ (เช่น "agenda", "items/abc/done") · google/* ไม่ส่ง x-tenant-id */
async function call<T>(method: Method, sub: string, opts: { q?: Q; body?: unknown } = {}): Promise<T> {
  // เคยได้ 404 ของเส้นที่ไม่มีแล้ว ⇒ ไปที่ fixture ตรง (ไม่ยิงซ้ำทุกครั้ง)
  if (fixtureOn) return fixtureCall<T>(method, sub, opts.q, opts.body);
  try {
    return await api<T>(BASE + "/" + sub + qs(opts.q), { method, body: opts.body, tenant: !sub.startsWith("google") });
  } catch (e) {
    if (CAL_FIXTURE_ALLOWED && e instanceof ApiError && e.status === 404 && routeMissing(e)) {
      setFixtureOn(true);
      return fixtureCall<T>(method, sub, opts.q, opts.body);
    }
    throw e;
  }
}
/** 404 ของ "เส้นยังไม่มี" (หน้า HTML ของ Next = code error · mock QC = not_found) — ต่างจาก 404 "ไม่พบรายการนี้" ที่มีข้อความไทย */
function routeMissing(e: ApiError): boolean {
  return !e.detail || !/[฀-๿]/.test(e.detail);
}

// ───────── เส้น (§8) ─────────
export const calApi = {
  agenda: (from: string, to?: string) => call<AgendaResult>("GET", "agenda", { q: { from, to } }).then(normAgenda),
  month: (ym: string) => call<MonthRes>("GET", "month", { q: { ym } }),
  today: () => call<TodayRes>("GET", "today"),
  items: (tab: ItemsTab, take = 50, before?: string) => call<{ items: CalItemDto[]; nextBefore?: string | null }>("GET", "items", { q: { tab, take, before } }),
  item: (id: string) => call<{ item: CalItemDto; phone: string | null }>("GET", `items/${encodeURIComponent(id)}`),
  create: (body: CalItemBody) => call<{ item: CalItemDto }>("POST", "items", { body }),
  patch: (id: string, body: CalItemPatch) => call<{ item: CalItemDto }>("PATCH", `items/${encodeURIComponent(id)}`, { body }),
  remove: (id: string) => call<{ ok: true }>("DELETE", `items/${encodeURIComponent(id)}`),
  done: (id: string, occ?: string) => call<{ item: CalItemDto }>("POST", `items/${encodeURIComponent(id)}/done`, { body: occ ? { occ } : {} }),
  reopen: (id: string) => call<{ item: CalItemDto }>("POST", `items/${encodeURIComponent(id)}/reopen`, { body: {} }),
  snooze: (id: string, body: { preset: "1h" | "tomorrow9" } | { until: string }) => call<{ item: CalItemDto }>("POST", `items/${encodeURIComponent(id)}/snooze`, { body }),
  confirm: (id: string) => call<{ item: CalItemDto }>("POST", `items/${encodeURIComponent(id)}/confirm`, { body: {} }),
  sourceDone: (source: "kanban" | "crm", id: string) => call<{ ok: true }>("POST", "source-done", { body: { source, id } }),
  prefs: () => call<PrefsRes>("GET", "prefs"),
  putPrefs: (body: PrefsPut) => call<PrefsRes>("PUT", "prefs", { body }),
  google: () => call<GoogleLinkDto>("GET", "google"),
  putGoogle: (body: { calendars?: { id: string; import: boolean }[]; exportKinds?: ("EVENT" | "REMINDER" | "BOOKING")[]; exportCalendarId?: string | null }) =>
    call<GoogleLinkDto>("PUT", "google", { body }),
  googleSync: () => call<{ ok: boolean; changed: number }>("POST", "google/sync", { body: {} }),
  googleDisconnect: () => call<{ ok: true }>("DELETE", "google"),
};

/** รูปเสียบางส่วน (เซิร์ฟเวอร์รุ่นแรก) ⇒ ค่าว่างที่ปลอดภัย */
function normAgenda(r: AgendaResult): AgendaResult {
  return { items: Array.isArray(r?.items) ? r.items : [], conflicts: Array.isArray(r?.conflicts) ? r.conflicts : [], notes: Array.isArray(r?.notes) ? r.notes : [] };
}

// ───────── นัดในเครื่อง (CAL2.11 — ยังไม่มี expo-calendar ในเลนนี้) ─────────
/** แถว source "device" ของช่วงวัน · ก่อน CAL2.11 = [] (fixture mode = แถวตัวอย่าง "จากปฏิทิน iPhone" ของจอ 10) */
export async function deviceAgenda(from: string, to: string): Promise<AgendaItem[]> {
  if (!fixtureOn) return [];
  return fixtureCall<AgendaItem[]>("GET", "_device", { from, to }, undefined);
}

// ───────── ตัวช่วยร่วม ─────────
/** ลำดับ priority แหล่ง (§4.3) — เวลาเท่ากัน */
export const SOURCE_PRIORITY: AgendaSource[] = ["reminder", "event", "booking", "crm", "kanban", "account", "tax", "hr", "dorm", "ticket", "google", "device"];
const prio = (s: AgendaSource) => {
  const i = SOURCE_PRIORITY.indexOf(s);
  return i < 0 ? 99 : i;
};
/** เรียง: allDay ก่อน → startAt → priority → id (§4.1) */
export function sortAgenda(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.startAt) - Date.parse(b.startAt) || prio(a.source) - prio(b.source) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** deepLink → เส้นทางแอป: web = หน้าระบบ (WebView "/" ด้วย ?open) · app = router.push · null = ไม่มีที่ไป */
export function deepLinkRoute(d: AgendaDeepLink, nonce: string): { pathname: string; params?: Record<string, string> } | null {
  if (!d) return null;
  if (d.kind === "web") {
    if (!/^\/app(\/[A-Za-z0-9_\-%/]*)?(\?[A-Za-z0-9_=&\-%]*)?$/.test(d.path)) return null;
    return { pathname: "/", params: { open: d.path, t: nonce } };
  }
  const [p, q] = d.path.split("?");
  const params: Record<string, string> = {};
  if (q) for (const kv of q.split("&")) {
    const [k, v] = kv.split("=");
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return { pathname: p, params };
}

// QC — เวลาทำการของแชท (WO-C16) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ ชื่อไฟล์: `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — มี qc-chat-*.mts อยู่ก่อนแล้ว 7 ไฟล์
//    (security · security-scope · core-v2 · api-v1 · replies · retention · push-badge · notify)
//    เขียนทับ = ลบด่านทิ้งทั้งชุดโดยไม่มีใครรู้ · qc-all.mts ค้น `qc-*.mts` อัตโนมัติ
//
// ⚠️ ชุดนี้ **ห้ามแตะฐานข้อมูล** (.env ของเครื่องนี้ชี้ prod จริง) → กัน 3 ชั้นเหมือน qc-chat-api-v1:
//   1) ทับ DATABASE_URL เป็น host ที่ต่อไม่ได้ ทันทีหลัง loadEnvFile
//   2) ยัด fake prisma ลง require.cache ของ `src/lib/core/db.ts` **ก่อน** import อะไรก็ตาม
//      · fake เติมค่า default ของ schema ตอน create · ค่าเวลาเป็น **thunk** เสมอ
//        (บทเรียน §12 ซ้ำรอยมา 3 ครั้ง: ค่าเวลาคงที่ตอนโหลดไฟล์ = ข้อสอบเขียวแบบผลลวง)
//      · แปลง `Prisma.DbNull` → SQL NULL จริง ไม่งั้นข้อ "ล้างค่าแล้วต้องได้ null" เขียวเพราะเหตุผิด
//   3) ดัก globalThis.fetch + ข้อ BH-9.9 ตรวจว่าไม่มี query/HTTP หลุดจริง (มีคู่บวกว่ามี query เกิดขึ้น)
//
// สัญญาที่คุม (โจทย์ WO-C16 + ledger/PLAN-CHAT-PLATFORM.md §3.2 · §5 B8):
// BH-0) schema/migration — `ChatSetting.businessHours` เป็น Json? (nullable) · migration additive ล้วน
//       · ไฟล์ business-hours.ts ห้าม import raw prisma (F5 ratchet ของ pnpm fitness)
// BH-1) 🔴 สัญญา GET /api/v1/chat/config (อีกสายเขียนตัวรับอยู่ — เปลี่ยนรูป = ผู้รับพัง):
//       { greeting, offlineMessage, locales, theme, widgetEnabled,
//         businessHours: { tz, note, days:[{d,open,close}], holidays } | null }
//       · ไม่ได้ตั้ง → **null** (ไม่ใช่ 24 ชม. ไม่ใช่ {}) · ฟิลด์เดิม 5 ตัวห้ามหาย/ห้ามเปลี่ยนความหมาย
//       · ของที่รูปเพี้ยนใน DB ต้องออกมาเป็น null ไม่ใช่ throw หรือหลุดค่าเพี้ยนไปให้ผู้รับ
// BH-2) สิทธิ์ของ /config — secret เรียกได้ (SiamDive เรียก s2s) · widget เรียกได้เหมือนเดิม
//       · 🔴 **ห้ามอ่านข้ามร้าน**: กุญแจ widget ของร้าน B ต้องได้ค่าของร้าน B เท่านั้น
//         และเส้นนี้ต้องไม่รับ systemId/connectionId จาก query (tenantId มาจากกุญแจเสมอ — §2 ข้อ 2)
// BH-3) ขาบันทึก — ค่าเวลาผิดรูป ("25:00" / "9:00" / ปิดก่อนเปิด / วันซ้ำ / tz มั่ว / วันที่ไม่มีจริง)
//       ต้องถูกปฏิเสธ **ตอนบันทึก** พร้อมข้อความไทย และต้องไม่มีแถวไหนถูกเขียน
//       · setter ผูก tenantId ใน where เสมอ (รู้ systemId ของร้านอื่นก็แก้ของเขาไม่ได้)
// BH-4) หน้าจอเจ้าของร้าน — ฟอร์มครบ 7 วัน + tz + วันหยุด + ข้อความเสริม · ตรวจสิทธิ์ด้วย assertChatCan
//       · error แสดง inline (ไม่ใช่ alert) · ค่าเริ่มต้น = ไม่เปิดใช้ (ไม่เดาเวลาแทนร้าน)

try { process.loadEnvFile(".env"); } catch {}
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db"; // กันพลาด: ต่อไม่ติดโดยตั้งใจ
process.env.CHAT_CREDENTIALS_KEY ??= "0".repeat(64);

const { readFileSync, existsSync, readdirSync } = await import("node:fs");
const { createRequire } = await import("node:module");
const { resolve } = await import("node:path");
const { createHash } = await import("node:crypto");
const { Prisma } = await import("@prisma/client");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const j = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const section = async (id: string, name: string, fn: () => Promise<void>) => {
  console.log(name);
  try { await fn(); } catch (e) { chk(`${id}.CRASH`, `${name} ล้มกลางคัน`, false, "รันจบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)); }
};

// ───────── fake prisma (mini query engine — ยกจาก qc-chat-api-v1) ─────────
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: { op: string; args: Record<string, unknown> }[] = [];
const seen = (op: string) => calls.filter((c) => c.op === op);
// ตัวนับที่ **ไม่ถูกรีเซ็ตพร้อม resetAll** — ใช้เป็นคู่บวกของข้อ "ไม่มี query หลุด"
// (นับจาก calls.length ตรง ๆ จะเหลือแค่ของฉากสุดท้าย = คู่บวกที่พิสูจน์อะไรไม่ได้)
let opCount = 0;
const push = (op: string, args: Record<string, unknown>) => { opCount++; calls.push({ op, args }); };
let seq = 0;
let netCalls = 0;

const OPS = new Set(["not", "in", "notIn", "gt", "gte", "lt", "lte", "equals", "contains", "startsWith", "endsWith", "mode", "is", "isNot", "some", "every", "none"]);
const num = (v: unknown): number | null => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : null);

function cmp(rowVal: unknown, o: Record<string, unknown>): boolean {
  const a = num(rowVal);
  for (const [op, raw] of Object.entries(o)) {
    const b = num(raw);
    if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
      if (a === null || b === null) return false;
      if (op === "gt" && !(a > b)) return false;
      if (op === "gte" && !(a >= b)) return false;
      if (op === "lt" && !(a < b)) return false;
      if (op === "lte" && !(a <= b)) return false;
    }
  }
  return true;
}

function matches(row: Row, where: unknown): boolean {
  if (!where || typeof where !== "object") return true;
  for (const [k, v] of Object.entries(where as Record<string, unknown>)) {
    if (k === "AND") { if (!(v as unknown[]).every((w) => matches(row, w))) return false; continue; }
    if (k === "OR") { if (!(v as unknown[]).some((w) => matches(row, w))) return false; continue; }
    if (v === undefined) continue;
    if (v === null) { if (row[k] !== null && row[k] !== undefined) return false; continue; }
    if (v instanceof Date) { if (num(row[k]) !== v.getTime()) return false; continue; }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      const opKeys = Object.keys(o).filter((x) => OPS.has(x));
      if (opKeys.length === 0) {
        if (!Object.entries(o).every(([sk, sv]) => row[sk] === sv)) return false;
        continue;
      }
      if ("not" in o) { if (o.not === null ? row[k] === null || row[k] === undefined : row[k] === o.not) return false; continue; }
      if ("in" in o) { if (!(o.in as unknown[]).includes(row[k])) return false; continue; }
      if ("equals" in o) { if (row[k] !== o.equals) return false; continue; }
      if (!cmp(row[k], o)) return false;
      continue;
    }
    if (row[k] !== v) return false;
  }
  return true;
}

// 🔴 ค่า default ของ schema — Prisma เติมให้ตอน create · fake ต้องเติมด้วย
//    ตัวที่เป็น @default(now()) ต้องเป็น **ฟังก์ชัน** ไม่ใช่ค่าคงที่ตอนโหลดไฟล์ (บทเรียน §12)
//    `businessHours` ไม่มี default ในสคีมา (Json?) ⇒ แถวใหม่ต้องได้ null = "ยังไม่ได้ตั้ง"
const DEFAULTS: Record<string, Row> = {
  chatConversation: { status: "OPEN", staffUnreadCount: 0, reopenedCount: 0, tags: [], meta: null, lastMessageAt: null, firstResponseAt: null, resolvedAt: null, assigneeUserId: null, unitId: null },
  chatMessage: { type: "TEXT", isInternal: false, deliveryStatus: "SENT", senderName: null, body: null, clientMessageId: null, externalMessageId: null, attachments: [], purgedAt: null },
  chatContact: { verifiedEmail: false, blockedAt: null, lang: null, externalRef: null, email: null, phone: null, customerId: null, displayName: null, avatarUrl: null },
  chatChannelConnection: { status: "CONNECTED", originAllowlist: [], publicKeyHash: null, publicKeyPrefix: null, defaultUnitId: null, credentials: {}, lastInboundAt: null },
  chatSetting: { widgetEnabled: true, greetingMessage: {}, offlineMessage: {}, theme: {}, senderAlias: null, memberSystemId: null, retentionDays: 365, businessHours: null, preChatFormEnabled: false, slaFirstResponseMin: 15, unassignedAlertMin: 5, widgetDisabledUnitIds: [], createdAt: () => new Date(), updatedAt: () => new Date() },
  chatRateBucket: { count: 0 },
  chatReadState: { lastReadMessageId: null, lastReadAt: () => new Date() },
  outboxEvent: { status: "PENDING", attempts: 0, availableAt: null, processedAt: null },
};

const defaultsOf = (model: string): Row => {
  const src = DEFAULTS[model] ?? {};
  const out: Row = {};
  for (const [k, v] of Object.entries(src)) out[k] = typeof v === "function" ? (v as () => unknown)() : v;
  return out;
};

function applyData(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    // 🔴 Json? ที่ถูกเซ็ตด้วย Prisma.DbNull = SQL NULL จริงบน Postgres
    //    ไม่แปลงที่นี่ = ข้อ "ล้างค่าแล้ว /config ต้องคืน null" จะเขียวเพราะเหตุผิด
    //    (readBusinessHours มองว่า object ของ DbNull เป็นรูปเพี้ยน แล้วบังเอิญคืน null)
    if (v === Prisma.DbNull) { row[k] = null; continue; }
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ("increment" in o) { row[k] = (typeof row[k] === "number" ? (row[k] as number) : 0) + (o.increment as number); continue; }
      if ("decrement" in o) { row[k] = (typeof row[k] === "number" ? (row[k] as number) : 0) - (o.decrement as number); continue; }
      if ("set" in o) { row[k] = o.set; continue; }
    }
    row[k] = v;
  }
}

function delegate(model: string) {
  const rows = () => (tables[model] ??= []);
  const rec = (op: string, a: Record<string, unknown>) => { push(`${model}.${op}`, a); };
  const find = (a: Record<string, unknown>) => rows().find((r) => matches(r, a.where)) ?? null;
  return {
    findFirst: async (a: Record<string, unknown> = {}) => { rec("findFirst", a); return find(a); },
    findUnique: async (a: Record<string, unknown> = {}) => { rec("findUnique", a); return find(a); },
    findMany: async (a: Record<string, unknown> = {}) => { rec("findMany", a); return rows().filter((r) => matches(r, a.where)); },
    count: async (a: Record<string, unknown> = {}) => { rec("count", a); return rows().filter((r) => matches(r, a.where)).length; },
    create: async (a: Record<string, unknown> = {}) => {
      rec("create", a);
      const data = (a.data ?? {}) as Row;
      const r: Row = { id: `fk-${model}-${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...defaultsOf(model), ...data };
      for (const [k, v] of Object.entries(r)) if (v === Prisma.DbNull) r[k] = null;
      rows().push(r);
      return r;
    },
    update: async (a: Record<string, unknown> = {}) => { rec("update", a); const r = find(a); if (!r) throw new Error(`[fake] ${model}.update ไม่พบแถว ${j(a.where)}`); applyData(r, (a.data ?? {}) as Row); return r; },
    updateMany: async (a: Record<string, unknown> = {}) => { rec("updateMany", a); const rs = rows().filter((r) => matches(r, a.where)); for (const r of rs) applyData(r, (a.data ?? {}) as Row); return { count: rs.length }; },
    upsert: async (a: Record<string, unknown> = {}) => { rec("upsert", a); const r = find(a); if (r) { applyData(r, (a.update ?? {}) as Row); return r; } const n: Row = { id: `fk-${model}-${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...defaultsOf(model), ...((a.create ?? {}) as Row) }; rows().push(n); return n; },
    deleteMany: async (a: Record<string, unknown> = {}) => { rec("deleteMany", a); const keep = rows().filter((r) => !matches(r, a.where)); const n = rows().length - keep.length; tables[model] = keep; return { count: n }; },
  };
}

const cache: Record<string, ReturnType<typeof delegate>> = {};
const fakePrisma: unknown = new Proxy({} as Record<string, unknown>, {
  get(_t, p) {
    if (typeof p !== "string" || p === "then") return undefined;
    if (p === "$transaction") {
      return async (fn: unknown) => (typeof fn === "function" ? await (fn as (tx: unknown) => unknown)(fakePrisma) : undefined);
    }
    if (p === "$executeRaw" || p === "$executeRawUnsafe" || p === "$queryRaw") {
      return async (...a: unknown[]) => {
        const sql = Array.isArray(a[0]) ? (a[0] as string[]).join("?") : String(a[0]);
        // ตัวนับ rate limit = INSERT … ON CONFLICT DO UPDATE … RETURNING คำสั่งเดียว
        if (sql.includes('"ChatRateBucket"')) {
          const [key, nowD, floorD] = [a[1] as string, a[2] as Date, a[3] as Date];
          push("chatRateBucket.upsertRaw", { key });
          const rs = (tables.chatRateBucket ??= []);
          let r = rs.find((x) => x.key === key);
          if (!r) { r = { id: `fk-rb-${++seq}`, key, count: 1, windowStart: nowD }; rs.push(r); }
          else if ((r.windowStart as Date).getTime() <= floorD.getTime()) { r.count = 1; r.windowStart = nowD; }
          else r.count = (r.count as number) + 1;
          return [{ count: r.count, windowStart: r.windowStart }];
        }
        push("$executeRaw", { sql });
        return 0;
      };
    }
    if (p === "$disconnect" || p === "$connect") return async () => {};
    if (p.startsWith("$")) return () => { throw new Error(`[fake] ห้ามเรียก prisma.${p} ในข้อสอบนี้ (ห้ามแตะ DB)`); };
    return (cache[p] ??= delegate(p));
  },
});

const req0 = createRequire(import.meta.url);
const dbFile = resolve(import.meta.dirname, "../src/lib/core/db.ts");
req0.cache[dbFile] = { id: dbFile, filename: dbFile, path: resolve(dbFile, ".."), loaded: true, exports: { prisma: fakePrisma, tenantDb: () => fakePrisma }, children: [], paths: [] } as never;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (...a: Parameters<typeof realFetch>) => {
  netCalls++;
  throw new Error("[fake] ห้ามยิงเน็ตเวิร์กในข้อสอบนี้ " + String(a[0]));
}) as typeof realFetch;

// ───────── ของจำลอง: 2 ร้าน (T1 = SiamDive · T2 = ร้านอื่น) ─────────
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const SECRET_KEY = "shark_" + "a".repeat(64);
const SECRET_KEY_T2 = "shark_" + "c".repeat(64);
const WIDGET_KEY = "swk_" + "b".repeat(32);
const WIDGET_KEY_2 = "swk_" + "d".repeat(32);
const GOOD_ORIGIN = "https://www.siamdive.com";
const EVIL_ORIGIN = "https://evil.example";
const API = "https://shark.in.th/api/v1/chat";

// เวลาทำการของร้าน T2 — ต้องไม่มีวันหลุดไปหาผู้ถือกุญแจของ T1 (และกลับกัน)
const T2_HOURS = { tz: "Asia/Tokyo", note: { th: "ของร้านอื่น ห้ามหลุด" }, days: [{ d: 3, open: "10:00", close: "16:00" }], holidays: ["2027-01-01"] };

function resetAll(opts: { hours?: unknown; t2Hours?: unknown } = {}) {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.apiKey = [
    { id: "key-1", tenantId: "T1", name: "SiamDive", keyHash: sha(SECRET_KEY), prefix: SECRET_KEY.slice(0, 12), revokedAt: null, lastUsedAt: new Date(), createdAt: new Date() },
    { id: "key-2", tenantId: "T2", name: "ร้านอื่น", keyHash: sha(SECRET_KEY_T2), prefix: SECRET_KEY_T2.slice(0, 12), revokedAt: null, lastUsedAt: new Date(), createdAt: new Date() },
  ];
  tables.appSystem = [
    { id: "S1", tenantId: "T1", type: "CHAT", name: "แชทลูกค้า SiamDive", active: true, createdAt: new Date(1) },
    { id: "S2", tenantId: "T2", type: "CHAT", name: "แชทร้านอื่น", active: true, createdAt: new Date(2) },
  ];
  tables.chatChannelConnection = [
    { id: "conn-web", tenantId: "T1", systemId: "S1", type: "WEBCHAT", displayName: "แชทหน้าเว็บ", externalAccountId: "webchat", credentials: {}, status: "CONNECTED", defaultUnitId: null, originAllowlist: [GOOD_ORIGIN], publicKeyHash: sha(WIDGET_KEY), publicKeyPrefix: WIDGET_KEY.slice(0, 12), createdAt: new Date(1) },
    { id: "conn-web2", tenantId: "T2", systemId: "S2", type: "WEBCHAT", displayName: "แชทร้านอื่น", externalAccountId: "webchat", credentials: {}, status: "CONNECTED", defaultUnitId: null, originAllowlist: [GOOD_ORIGIN], publicKeyHash: sha(WIDGET_KEY_2), publicKeyPrefix: WIDGET_KEY_2.slice(0, 12), createdAt: new Date(2) },
  ];
  tables.chatSetting = [
    { id: "st1", tenantId: "T1", systemId: "S1", memberSystemId: null, senderAlias: "ทีมงาน SiamDive", widgetEnabled: true, greetingMessage: { th: "สวัสดีค่ะ", en: "Hi there" }, offlineMessage: { th: "นอกเวลาทำการ" }, theme: { primaryColor: "#0aa" }, retentionDays: 365, businessHours: opts.hours ?? null },
    { id: "st2", tenantId: "T2", systemId: "S2", memberSystemId: null, senderAlias: null, widgetEnabled: true, greetingMessage: {}, offlineMessage: {}, theme: {}, retentionDays: 365, businessHours: opts.t2Hours ?? T2_HOURS },
  ];
  calls.length = 0;
  netCalls = 0;
}

const secretHeaders = (key = SECRET_KEY) => ({ authorization: `Bearer ${key}`, "content-type": "application/json" });
const widgetHeaders = (guest?: string | null, origin: string | null = GOOD_ORIGIN, key = WIDGET_KEY) => {
  const h: Record<string, string> = { "x-shark-widget": key, "content-type": "application/json" };
  if (origin) h.origin = origin;
  if (guest) h["x-shark-guest"] = guest;
  return h;
};

type RouteMod = { GET?: (r: Request) => Promise<Response>; OPTIONS?: (r: Request) => Promise<Response> };
async function callConfig(
  mod: RouteMod,
  headers: Record<string, string>,
  query: Record<string, string> = {},
): Promise<{ status: number; json: Record<string, unknown>; headers: Headers }> {
  const url = new URL(`${API}/config`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await mod.GET!(new Request(url, { method: "GET", headers }));
  let body: Record<string, unknown> = {};
  const text = await res.text();
  if (text) { try { body = JSON.parse(text) as Record<string, unknown>; } catch { body = { _raw: text.slice(0, 120) }; } }
  return { status: res.status, json: body, headers: res.headers };
}

const thai = (v: unknown) => typeof v === "string" && /[ก-๙]/.test(v);
const src = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const SRC_BH = src("src/lib/modules/chat/business-hours.ts");
const SRC_SVC = src("src/lib/modules/chat/service.ts");
const SRC_ACTIONS = src("src/lib/modules/chat/actions.ts");
const SRC_UI = src("src/lib/modules/chat/ui.tsx");
const SRC_ROUTE = src("src/app/api/v1/chat/config/route.ts");
const SRC_PAGE = src("src/app/app/sys/[id]/chat/channels/page.tsx");
const SRC_SCHEMA = src("prisma/schema/chat.prisma");
const MIG_DIR = "prisma/migrations";
const migFiles = existsSync(MIG_DIR)
  ? readdirSync(MIG_DIR).filter((d) => existsSync(`${MIG_DIR}/${d}/migration.sql`)).map((d) => ({ d, sql: readFileSync(`${MIG_DIR}/${d}/migration.sql`, "utf8") }))
  : [];
const bhMigrations = migFiles.filter((m) => /businessHours/.test(m.sql));

const HOURS_OK = {
  tz: "Asia/Bangkok",
  note: { th: "นอกเวลาจะตอบให้เช้าวันถัดไป", en: "We reply next morning", de: "" },
  days: [
    { d: 1, open: "09:00", close: "18:00" },
    { d: 2, open: "09:00", close: "18:00" },
    { d: 6, open: "10:00", close: "14:00" },
  ],
  holidays: ["2026-12-31"],
};

try {
  const routeMod = (await import("@/app/api/v1/chat/config/route" as string).catch(() => null)) as RouteMod | null;
  const svc = (await import("@/lib/modules/chat/service" as string).catch((e) => { console.log(`  (import service ล้ม: ${e instanceof Error ? e.message.slice(0, 200) : String(e)})`); return null; })) as {
    setBusinessHours: (t: string, s: string, v: unknown) => Promise<boolean>;
    publicBusinessHours: (raw: unknown, lang?: string | null) => unknown;
  } | null;
  const bh = (await import("@/lib/modules/chat/business-hours" as string).catch(() => null)) as {
    validateBusinessHours: (i: unknown) => { ok: true; value: Record<string, unknown> } | { ok: false; error: string };
    readBusinessHours: (raw: unknown) => unknown;
    isValidTimeZone: (tz: unknown) => boolean;
    minutesOfTime: (v: unknown) => number | null;
    isCalendarDate: (v: unknown) => boolean;
    DEFAULT_TZ: string;
    DAY_LABELS: readonly string[];
    MAX_NOTE_LEN: number;
  } | null;
  const pub = (await import("@/lib/modules/chat/public-auth" as string).catch(() => null)) as {
    mintGuestToken: (c: string) => string;
  } | null;

  chk("BH-0.1", "มี src/lib/modules/chat/business-hours.ts (ตัวตรวจรูปที่เดียวของทั้งขาอ่าน/ขาเขียน)", !!bh, "import ได้", bh ? "ได้" : "ไม่ได้");
  chk("BH-0.2", "import เส้น /api/v1/chat/config + service ได้", !!routeMod?.GET && !!svc, "ได้", j({ route: !!routeMod?.GET, svc: !!svc }));

  // ═════════ BH-0: schema + migration ═════════
  await section("BH-0", "\nBH-0 schema + migration (additive ล้วน · ห้ามแตะ core.prisma):", async () => {
    const block = /model ChatSetting \{[\s\S]*?\n\}/.exec(SRC_SCHEMA)?.[0] ?? "";
    chk("BH-0.3", "ChatSetting มีฟิลด์ businessHours ชนิด Json? (nullable — แยก 'ไม่ได้ตั้ง' ออกจาก 'ตั้งแล้วว่าง')", /businessHours\s+Json\?/.test(block), "businessHours Json?", block.split("\n").filter((l) => /businessHours/.test(l)).join(" | ") || "ไม่มีฟิลด์");
    chk("BH-0.4", "🔴 ห้ามใส่ @default ให้ businessHours (ใส่แล้ว = แถวเดิมกลายเป็น 'ตั้งแล้ว' ทันทีทั้งระบบ)", !/businessHours\s+Json\?\s*@default/.test(block), "ไม่มี @default", /businessHours[^\n]*/.exec(block)?.[0] ?? "-");
    chk("BH-0.5", "มี migration ใหม่ที่เพิ่มคอลัมน์นี้ (เขียนมือ ไม่ได้ต่อ DB)", bhMigrations.length === 1 && /ALTER TABLE "ChatSetting"\s+ADD COLUMN "businessHours" JSONB/.test(bhMigrations[0]!.sql), "1 ไฟล์ · ADD COLUMN JSONB", j(bhMigrations.map((m) => m.d)));
    const sql = bhMigrations[0]?.sql ?? "";
    // ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์ไทยที่อธิบายว่า "ไม่มี DROP/NOT NULL" มีคำพวกนั้นอยู่ในตัวมันเอง
    const stmts = sql.replace(/--[^\n]*/g, "").trim();
    chk("BH-0.6", "🔴 migration additive ล้วน — ไม่มี DROP / NOT NULL / ALTER TYPE / UPDATE", stmts !== "" && !/\bDROP\b|NOT NULL\b|ALTER COLUMN|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i.test(stmts), "ไม่มีคำสั่งทำลาย", stmts.replace(/\s+/g, " ").slice(0, 160));
    chk("BH-0.7", "ไม่แตะ prisma/schema/core.prisma (แช่แข็ง)", !/businessHours/.test(src("prisma/schema/core.prisma")), "ไม่มี businessHours ใน core.prisma", "-", "MAJOR");
    chk("BH-0.8", "business-hours.ts ไม่ import raw prisma (F5 ratchet ของ pnpm fitness — เพิ่มไฟล์ไม่ได้)", SRC_BH !== "" && !/from\s+["']@\/lib\/core\/db["']/.test(SRC_BH), "ไม่ import prisma", /from ["']@\/lib\/core\/db["']/.test(SRC_BH) ? "import แล้ว" : "ไม่ import");
    chk("BH-0.9", "ไม่มีตารางใหม่ในรอบนี้ ⇒ ไม่ต้องแตะ src/lib/core/scope.ts (ChatSetting ลงทะเบียนไว้แล้ว)", !/CREATE TABLE/i.test(stmts) && /ChatSetting:\s*sys\(\)/.test(src("src/lib/core/scope.ts")), "ไม่มี CREATE TABLE + ChatSetting อยู่ใน scope", j({ createTable: /CREATE TABLE/i.test(stmts), scoped: /ChatSetting:\s*sys\(\)/.test(src("src/lib/core/scope.ts")) }), "MAJOR");
  });

  if (bh && svc && routeMod?.GET && pub) {
    const guest = () => pub.mintGuestToken("conn-web");

    // ═════════ BH-1: สัญญา /config ═════════
    await section("BH-1", "\nBH-1 สัญญา GET /api/v1/chat/config (อีกสายเขียนตัวรับอยู่):", async () => {
      resetAll(); // ร้าน T1 ยังไม่ได้ตั้งเวลาทำการ
      const none = await callConfig(routeMod, secretHeaders());
      chk("BH-1.1", "🔴 ไม่ได้ตั้งเวลาทำการ → businessHours: null (ไม่ใช่ {} ไม่ใช่ 24 ชม.)", none.status === 200 && none.json.businessHours === null, "null", `${none.status} ${j(none.json.businessHours)}`);
      chk("BH-1.2", "ฟิลด์เดิมของ /config ยังครบ + เพิ่ม businessHours (ห้ามเปลี่ยนของเดิม)", Object.keys(none.json).sort().join(",") === "businessHours,greeting,locales,offlineMessage,theme,widgetEnabled", "businessHours,greeting,locales,offlineMessage,theme,widgetEnabled", Object.keys(none.json).sort().join(","));
      chk("BH-1.3", "ค่าเดิมยังถูกต้อง (greeting/offlineMessage ไม่ถูกกลืน)", none.json.greeting === "สวัสดีค่ะ" && none.json.offlineMessage === "นอกเวลาทำการ" && none.json.widgetEnabled === true, "greeting/offline เดิม", j({ g: none.json.greeting, o: none.json.offlineMessage }));

      resetAll({ hours: HOURS_OK });
      const set = await callConfig(routeMod, secretHeaders(), { lang: "th" });
      const b = set.json.businessHours as Record<string, unknown> | null;
      chk("BH-1.4", "🔴 ตั้งแล้ว → businessHours มีคีย์ tz/note/days/holidays เป๊ะ (positive control ของ BH-1.1)", !!b && Object.keys(b).sort().join(",") === "days,holidays,note,tz", "days,holidays,note,tz", b ? Object.keys(b).sort().join(",") : "null");
      const days = (b?.days ?? []) as Record<string, unknown>[];
      chk("BH-1.5", "🔴 days[] มี 3 คีย์เป๊ะ { d, open, close } · d เป็นตัวเลข 0..6 · เวลาเป็น \"HH:MM\"", days.length === 3 && days.every((x) => Object.keys(x).sort().join(",") === "close,d,open" && typeof x.d === "number" && /^\d{2}:\d{2}$/.test(String(x.open)) && /^\d{2}:\d{2}$/.test(String(x.close))), "3 คีย์ · d ตัวเลข · HH:MM", j(days));
      chk("BH-1.6", "days เรียงตามวัน และมีเฉพาะวันที่เปิด (วันที่ไม่อยู่ในรายการ = ปิด)", j(days.map((x) => x.d)) === j([1, 2, 6]), "[1,2,6]", j(days.map((x) => x.d)));
      chk("BH-1.7", "tz มาจากค่าที่ร้านตั้ง", b?.tz === "Asia/Bangkok", "Asia/Bangkok", String(b?.tz));
      chk("BH-1.8", "note ภาษาไทยตรงกับที่ตั้งไว้", b?.note === "นอกเวลาจะตอบให้เช้าวันถัดไป", "นอกเวลาจะตอบให้เช้าวันถัดไป", String(b?.note));
      const en = await callConfig(routeMod, secretHeaders(), { lang: "en" });
      chk("BH-1.9", "note คลี่ตามภาษาที่ขอ (ผ่าน resolveLocale ตัวเดียวกับ greeting)", (en.json.businessHours as Record<string, unknown>)?.note === "We reply next morning", "We reply next morning", j((en.json.businessHours as Record<string, unknown>)?.note));
      const de = await callConfig(routeMod, secretHeaders(), { lang: "de" });
      chk("BH-1.10", '🔴 note ที่ร้านตั้งใจปิดไว้ ("") ต้องเป็น null — ห้ามไหลไปหยิบภาษาอื่นมาแสดง', (de.json.businessHours as Record<string, unknown>)?.note === null, "null", j((de.json.businessHours as Record<string, unknown>)?.note));
      chk("BH-1.11", "holidays คืนตามที่ตั้ง (เรียงแล้ว ไม่ซ้ำ)", j(b?.holidays) === j(["2026-12-31"]), '["2026-12-31"]', j(b?.holidays));

      // note เป็นสตริงเดียว (ไม่ใช่ map) — ของที่มาจาก API/ของเก่า ต้องใช้ได้ ไม่ใช่หายทั้งก้อน
      resetAll({ hours: { ...HOURS_OK, note: "ตอบเร็วสุดในเวลาทำการ" } });
      const plain = await callConfig(routeMod, secretHeaders(), { lang: "en" });
      chk("BH-1.12", "note ที่เป็นสตริงเดียว ใช้ได้ทุกภาษา", (plain.json.businessHours as Record<string, unknown>)?.note === "ตอบเร็วสุดในเวลาทำการ", "ตอบเร็วสุดในเวลาทำการ", j((plain.json.businessHours as Record<string, unknown>)?.note));

      // ไม่มี note เลย → null (ไม่ใช่ "" ไม่ใช่ undefined ที่หายไปจาก JSON)
      resetAll({ hours: { tz: "Asia/Bangkok", days: [{ d: 0, open: "08:30", close: "17:45" }] } });
      const noNote = await callConfig(routeMod, secretHeaders());
      const nb = noNote.json.businessHours as Record<string, unknown>;
      chk("BH-1.13", "ไม่ตั้ง note/holidays → note: null · holidays: [] (คีย์ยังอยู่ครบ ผู้รับไม่ต้องเดา)", nb?.note === null && j(nb?.holidays) === j([]) && j(Object.keys(nb).sort()) === j(["days", "holidays", "note", "tz"]), "note null · holidays []", j(nb));

      // 🔴 ของเพี้ยนใน DB (แก้มือ/ของเก่า) ต้องไม่หลุดออก API และต้องไม่ throw
      for (const [id, bad, why] of [
        ["BH-1.14", { tz: "Asia/Bangkok", days: [{ d: 1, open: "25:00", close: "26:00" }] }, "เวลาเกิน 24 ชม."],
        ["BH-1.15", { tz: "Mars/Olympus", days: [{ d: 1, open: "09:00", close: "18:00" }] }, "เขตเวลาไม่มีจริง"],
        ["BH-1.16", { tz: "Asia/Bangkok", days: "ทั้งวัน" }, "days ไม่ใช่รายการ"],
        ["BH-1.17", { tz: "Asia/Bangkok", days: [{ d: 1, open: "18:00", close: "09:00" }] }, "ปิดก่อนเปิด"],
      ] as [string, unknown, string][]) {
        resetAll({ hours: bad });
        const r = await callConfig(routeMod, secretHeaders());
        chk(id, `ข้อมูลเพี้ยนใน DB (${why}) → businessHours: null และไม่ throw`, r.status === 200 && r.json.businessHours === null, "200 + null", `${r.status} ${j(r.json.businessHours)}`);
      }
    });

    // ═════════ BH-2: สิทธิ์ + ห้ามอ่านข้ามร้าน ═════════
    await section("BH-2", "\nBH-2 สิทธิ์ของ /config (secret เรียกได้ · widget ห้ามข้ามร้าน):", async () => {
      resetAll({ hours: HOURS_OK });
      const s = await callConfig(routeMod, secretHeaders());
      chk("BH-2.1", "🔴 secret key (server-to-server) เรียก /config ได้ — SiamDive ใช้ทางนี้", s.status === 200 && (s.json.businessHours as Record<string, unknown>)?.tz === "Asia/Bangkok", "200 + ของร้านตัวเอง", `${s.status} ${j(s.json.businessHours)}`);
      chk("BH-2.2", "โหมด secret ไม่มี CORS header (ไม่ได้มาจากเบราว์เซอร์ — กันเอา secret ไปแปะหน้าเว็บ)", s.headers.get("access-control-allow-origin") === null, "ไม่มี ACAO", String(s.headers.get("access-control-allow-origin")), "MAJOR");

      const w = await callConfig(routeMod, widgetHeaders(guest()));
      chk("BH-2.3", "widget key ยังเรียกได้เหมือนเดิม (ไม่ถดถอย) + ได้ businessHours ด้วย", w.status === 200 && (w.json.businessHours as Record<string, unknown>)?.tz === "Asia/Bangkok" && w.headers.get("access-control-allow-origin") === GOOD_ORIGIN, "200 + ACAO", `${w.status} ${j({ b: w.json.businessHours, o: w.headers.get("access-control-allow-origin") })}`);

      // 🔴 หัวใจ: กุญแจของร้าน T2 ต้องเห็นเฉพาะของ T2
      const w2 = await callConfig(routeMod, widgetHeaders(pub.mintGuestToken("conn-web2"), GOOD_ORIGIN, WIDGET_KEY_2));
      const b2 = w2.json.businessHours as Record<string, unknown> | null;
      chk("BH-2.4", "widget key ของอีกร้าน → ได้ค่าของร้านตัวเอง (positive control ว่าเส้นทางเดินถึงจริง)", w2.status === 200 && b2?.tz === "Asia/Tokyo", "200 + Asia/Tokyo", `${w2.status} ${j(b2)}`);
      chk("BH-2.5", "🔴 widget key ของอีกร้าน อ่านเวลาทำการของร้านแรกไม่ได้ (ไม่มีข้อมูลข้ามร้านหลุด)", !j(w2.json).includes("Asia/Bangkok") && !j(w2.json).includes("นอกเวลาจะตอบให้เช้าวันถัดไป") && !j(w2.json).includes("สวัสดีค่ะ"), "ไม่มีค่าของร้านแรกปน", j(w2.json).slice(0, 160));

      // เส้นนี้ต้องไม่รับ systemId/connectionId จาก query — กุญแจเป็นตัวตัดสินเสมอ
      const inject = await callConfig(routeMod, widgetHeaders(pub.mintGuestToken("conn-web2"), GOOD_ORIGIN, WIDGET_KEY_2), { systemId: "S1", connectionId: "conn-web", tenantId: "T1" });
      chk("BH-2.6", "🔴 ยัด systemId/connectionId/tenantId มาทาง query ก็ยังได้ของร้านตัวเอง", (inject.json.businessHours as Record<string, unknown>)?.tz === "Asia/Tokyo" && !j(inject.json).includes("Asia/Bangkok"), "Asia/Tokyo", j(inject.json.businessHours));
      chk("BH-2.7", "โค้ดของเส้นนี้ไม่อ่าน systemId/connectionId/tenantId จาก URL เลย (อ่านแค่ lang)", !/searchParams\.get\("(systemId|connectionId|tenantId)"\)/.test(SRC_ROUTE) && /searchParams\.get\("lang"\)/.test(SRC_ROUTE), "อ่านแค่ lang", SRC_ROUTE.split("\n").filter((l) => /searchParams/.test(l)).join(" | "), "MAJOR");

      const secret2 = await callConfig(routeMod, secretHeaders(SECRET_KEY_T2));
      chk("BH-2.8", "🔴 secret key ของอีกร้าน ก็ได้เฉพาะของร้านตัวเอง", (secret2.json.businessHours as Record<string, unknown>)?.tz === "Asia/Tokyo" && !j(secret2.json).includes("Asia/Bangkok"), "Asia/Tokyo", j(secret2.json.businessHours));

      const bad = await callConfig(routeMod, { "content-type": "application/json" });
      chk("BH-2.9", "ไม่ส่งกุญแจ → 401 + ข้อความไทย (ไม่ใช่เปิดให้อ่านฟรี)", bad.status === 401 && thai(bad.json.error), "401 + ไทย", `${bad.status} ${j(bad.json)}`);
      const evil = await callConfig(routeMod, widgetHeaders(guest(), EVIL_ORIGIN));
      chk("BH-2.10", "🔴 widget จากโดเมนนอก allowlist → 403 และไม่มีเวลาทำการหลุด", evil.status === 403 && !j(evil.json).includes("09:00"), "403 + ไม่มีข้อมูล", `${evil.status} ${j(evil.json)}`);
      tables.apiKey![0]!.revokedAt = new Date();
      const revoked = await callConfig(routeMod, secretHeaders());
      chk("BH-2.11", "secret key ที่ถูกเพิกถอน → 401", revoked.status === 401, "401", `${revoked.status} ${j(revoked.json)}`, "MAJOR");
    });

    // ═════════ BH-3: ขาบันทึก (validate + ไม่ข้ามร้าน) ═════════
    await section("BH-3", "\nBH-3 บันทึก — ค่าผิดรูปต้องถูกปฏิเสธที่เซิร์ฟเวอร์:", async () => {
      const ok = bh.validateBusinessHours({ tz: "Asia/Bangkok", note: "ทดสอบ", days: [{ d: 1, open: "09:00", close: "18:00" }], holidays: ["2026-12-31"] });
      chk("BH-3.1", "ค่าถูกต้อง → ผ่าน (positive control ของทุกข้อลบข้างล่าง)", ok.ok === true, "ok", j(ok));

      const cases: [string, unknown, string][] = [
        ["BH-3.2", { tz: "Asia/Bangkok", days: [{ d: 1, open: "25:00", close: "26:00" }] }, '🔴 "25:00" (ชั่วโมงเกิน 23)'],
        ["BH-3.3", { tz: "Asia/Bangkok", days: [{ d: 1, open: "9:00", close: "18:00" }] }, '"9:00" (ไม่ใช่ 2 หลัก)'],
        ["BH-3.4", { tz: "Asia/Bangkok", days: [{ d: 1, open: "09:60", close: "18:00" }] }, '"09:60" (นาทีเกิน 59)'],
        ["BH-3.5", { tz: "Asia/Bangkok", days: [{ d: 1, open: "18:00", close: "09:00" }] }, "ปิดก่อนเปิด"],
        ["BH-3.6", { tz: "Asia/Bangkok", days: [{ d: 1, open: "09:00", close: "09:00" }] }, "เปิด=ปิด (ช่วงเวลายาว 0 นาที)"],
        ["BH-3.7", { tz: "Asia/Bangkok", days: [{ d: 7, open: "09:00", close: "18:00" }] }, "d = 7 (นอกช่วง 0..6)"],
        ["BH-3.8", { tz: "Asia/Bangkok", days: [{ d: 1, open: "09:00", close: "18:00" }, { d: 1, open: "10:00", close: "11:00" }] }, "วันซ้ำ"],
        ["BH-3.9", { tz: "Mars/Olympus", days: [{ d: 1, open: "09:00", close: "18:00" }] }, "เขตเวลาไม่มีจริง"],
        ["BH-3.10", { tz: "Asia/Bangkok", days: [] }, "ไม่เลือกวันทำการเลย"],
        ["BH-3.11", { tz: "Asia/Bangkok", days: [{ d: 1, open: "09:00", close: "18:00" }], holidays: ["2026-02-30"] }, "วันหยุดที่ไม่มีในปฏิทิน"],
        ["BH-3.12", { tz: "Asia/Bangkok", days: [{ d: 1, open: "09:00", close: "18:00" }], holidays: ["31/12/2026"] }, "วันหยุดผิดรูปแบบ"],
        ["BH-3.13", { tz: "Asia/Bangkok", days: [{ d: 1, open: "09:00", close: "18:00" }], note: "ก".repeat(bh.MAX_NOTE_LEN + 1) }, "ข้อความเสริมยาวเกินเพดาน"],
        ["BH-3.14", { tz: "Asia/Bangkok", days: [{ d: 1, open: null, close: "18:00" }] }, "ไม่กรอกเวลาเปิด"],
      ];
      for (const [id, input, why] of cases) {
        const r = bh.validateBusinessHours(input);
        chk(id, `${why} → ปฏิเสธพร้อมข้อความไทย`, r.ok === false && thai((r as { error: string }).error), "ok:false + ไทย", j(r));
      }

      // ค่าผิดรูปต้องไม่ถูกเขียนลง DB เลยแม้แต่แถวเดียว
      resetAll();
      const before = j(tables.chatSetting);
      const bad = bh.validateBusinessHours({ tz: "Asia/Bangkok", days: [{ d: 1, open: "25:00", close: "26:00" }] });
      if (!bad.ok) { /* ไม่เรียก setter — เหมือนที่ action ทำ */ }
      chk("BH-3.15", "🔴 ค่าผิดรูป → ไม่มี query เขียนออกไปเลย (ไม่มี updateMany/create ของ chatSetting)", seen("chatSetting.updateMany").length === 0 && seen("chatSetting.create").length === 0 && j(tables.chatSetting) === before, "ไม่มีการเขียน", j({ u: seen("chatSetting.updateMany").length, c: seen("chatSetting.create").length }));

      resetAll();
      const good = bh.validateBusinessHours(HOURS_OK);
      const saved = good.ok ? await svc.setBusinessHours("T1", "S1", good.value) : false;
      const row = tables.chatSetting!.find((r) => r.systemId === "S1")!;
      chk("BH-3.16", "บันทึกค่าที่ถูกต้อง → เขียนจริง (positive control ของ BH-3.15)", saved === true && !!row.businessHours && j((row.businessHours as Record<string, unknown>).days) === j(HOURS_OK.days), "เขียนแล้ว", j(row.businessHours));
      const wheres = seen("chatSetting.updateMany").map((c) => c.args.where as Row);
      chk("BH-3.17", "🔴 setter ผูก tenantId ใน where เสมอ (รู้ systemId ของร้านอื่นก็แก้ของเขาไม่ได้)", wheres.length > 0 && wheres.every((w) => w.tenantId === "T1" && w.systemId === "S1"), "where {tenantId,systemId}", j(wheres));

      const cross = await svc.setBusinessHours("T1", "S2", good.ok ? good.value : null);
      const t2row = tables.chatSetting!.find((r) => r.systemId === "S2")!;
      chk("BH-3.18", "🔴 ตั้งค่าข้ามร้าน → คืน false และค่าเดิมของอีกร้านไม่ถูกแตะ", cross === false && j(t2row.businessHours) === j(T2_HOURS), "false + ค่าเดิม", j({ cross, v: t2row.businessHours }));

      // ล้างค่า = null (ไม่ใช่ {} ที่จะกลายเป็น "ตั้งแล้วแต่ว่าง")
      const cleared = await svc.setBusinessHours("T1", "S1", null);
      const after = await callConfig(routeMod, secretHeaders());
      chk("BH-3.19", "🔴 ล้างค่า → คอลัมน์เป็น NULL จริง และ /config กลับไปคืน businessHours: null", cleared === true && row.businessHours === null && after.json.businessHours === null, "null ทั้งคู่", j({ cleared, row: row.businessHours, api: after.json.businessHours }));

      // ระบบที่ยังไม่มีแถว ChatSetting — ต้องสร้างให้ แต่เฉพาะระบบ CHAT ของร้านนั้นจริง
      resetAll();
      tables.chatSetting = [];
      const created = await svc.setBusinessHours("T1", "S1", good.ok ? good.value : null);
      chk("BH-3.20", "ยังไม่มีแถวตั้งค่า → สร้างให้ (ร้านที่เพิ่งเปิดระบบก็ตั้งได้)", created === true && tables.chatSetting!.length === 1 && tables.chatSetting![0]!.tenantId === "T1", "สร้าง 1 แถวของ T1", j(tables.chatSetting));
      const ghost = await svc.setBusinessHours("T1", "S-ไม่มีจริง", good.ok ? good.value : null);
      chk("BH-3.21", "systemId ที่ไม่ใช่ระบบ CHAT ของร้านนี้ → false และไม่สร้างแถวผี", ghost === false && tables.chatSetting!.length === 1, "false + 1 แถวเท่าเดิม", j({ ghost, n: tables.chatSetting!.length }));

      chk("BH-3.22", "ตัวช่วยตรวจเวลา/วันที่/เขตเวลาทำงานถูก (unit)", bh.minutesOfTime("09:05") === 545 && bh.minutesOfTime("25:00") === null && bh.minutesOfTime("9:00") === null && bh.isCalendarDate("2026-12-31") && !bh.isCalendarDate("2026-02-30") && bh.isValidTimeZone("Asia/Bangkok") && !bh.isValidTimeZone("Mars/Olympus"), "ครบทุกเคส", j({ m: bh.minutesOfTime("09:05"), bad: bh.minutesOfTime("25:00"), short: bh.minutesOfTime("9:00"), d1: bh.isCalendarDate("2026-12-31"), d2: bh.isCalendarDate("2026-02-30") }), "MAJOR");
    });

    // ═════════ BH-4: หน้าจอเจ้าของร้าน + สิทธิ์ ═════════
    await section("BH-4", "\nBH-4 หน้าจอตั้งค่า (เจ้าของร้านต้องกดเองได้ ไม่ใช่แค่ API):", async () => {
      const actionBlock = /export async function setBusinessHoursAction[\s\S]*?\n\}/.exec(SRC_ACTIONS)?.[0] ?? "";
      chk("BH-4.1", "มี server action setBusinessHoursAction", actionBlock !== "", "มี", "ไม่มี");
      chk("BH-4.2", "🔴 action ตรวจสิทธิ์ด้วย assertChatCan ก่อนทำอะไร (แบบเดียวกับ action อื่นในไฟล์นี้)", /assertChatCan\(auth, "chat\.setting\.setBusinessHours"\)/.test(actionBlock) && actionBlock.indexOf("assertChatCan") < actionBlock.indexOf("formData.get"), "assertChatCan มาก่อนอ่านฟอร์ม", actionBlock.slice(0, 220).replace(/\s+/g, " "));
      chk("BH-4.3", "🔴 action ตรวจรูปที่เซิร์ฟเวอร์ (validateBusinessHours) ไม่พึ่ง validation ของเบราว์เซอร์", /validateBusinessHours\(/.test(actionBlock), "เรียก validateBusinessHours", actionBlock.includes("validateBusinessHours") ? "เรียก" : "ไม่เรียก");
      chk("BH-4.4", "ไม่ติ๊ก 'แสดงเวลาทำการ' = ล้างค่า (ผู้ใช้ปิดฟีเจอร์เองได้ ไม่ต้องลบทีละวัน)", /enabled/.test(actionBlock) && /setBusinessHours\([^)]*null\)/.test(actionBlock.replace(/\s+/g, " ")), "มีทางล้างค่า", actionBlock.replace(/\s+/g, " ").slice(0, 400).includes("null") ? "มี" : "ไม่มี", "MAJOR");

      chk("BH-4.5", "หน้า channels มีฟอร์มครบ 7 วัน (day-0..day-6 + open/close ทุกวัน)", /setBusinessHoursAction/.test(SRC_UI) && /name=\{`day-\$\{d\}`\}/.test(SRC_UI) && /name=\{`open-\$\{d\}`\}/.test(SRC_UI) && /name=\{`close-\$\{d\}`\}/.test(SRC_UI) && /DAY_LABELS\.map/.test(SRC_UI), "ฟอร์มรายวันจาก DAY_LABELS", j({ action: /setBusinessHoursAction/.test(SRC_UI), day: /name=\{`day-\$\{d\}`\}/.test(SRC_UI), map: /DAY_LABELS\.map/.test(SRC_UI) }));
      chk("BH-4.6", "DAY_LABELS มี 7 วัน เรียงจากอาทิตย์ (ตรงกับ d = 0..6 ในสัญญา)", bh.DAY_LABELS.length === 7 && bh.DAY_LABELS[0] === "อาทิตย์" && bh.DAY_LABELS[6] === "เสาร์", "7 วัน · อาทิตย์…เสาร์", j(bh.DAY_LABELS));
      chk("BH-4.7", "มีช่องเขตเวลา · วันหยุด · ข้อความเสริม ครบตามที่เจ้าของขอ", /name="tz"/.test(SRC_UI) && /name="holidays"/.test(SRC_UI) && /name="note"/.test(SRC_UI) && /name="enabled"/.test(SRC_UI), "tz/holidays/note/enabled", j({ tz: /name="tz"/.test(SRC_UI), h: /name="holidays"/.test(SRC_UI), n: /name="note"/.test(SRC_UI), e: /name="enabled"/.test(SRC_UI) }));
      chk("BH-4.8", "ข้อความบนหน้าจอเป็นภาษาไทย + บอกชัดว่าไม่ตั้ง = ไม่แสดงอะไร", /เวลาทำการของทีมตอบแชท/.test(SRC_UI) && /ไม่ตั้งไว้ = ไม่แสดงอะไรเลย/.test(SRC_UI), "มีคำอธิบายไทย", /เวลาทำการ/.test(SRC_UI) ? "มี" : "ไม่มี", "MINOR");
      chk("BH-4.9", "action ส่ง error กลับหน้าเดิมด้วย ?err= (แบบเดียวกับโมดูลบัญชี/คลินิก)", /err=\$\{encodeURIComponent\(/.test(actionBlock), "redirect พร้อม ?err=", actionBlock.split("\n").filter((l) => /err=/.test(l)).join(" | ").slice(0, 160), "MAJOR");
      chk("BH-4.10", "หน้า channels รับ ?err= แล้วส่งต่อให้การ์ด (ไม่งั้นข้อความผิดพลาดหายไปเฉย ๆ)", /searchParams/.test(SRC_PAGE) && /err=\{err\}/.test(SRC_PAGE) && /\{err &&/.test(SRC_UI) && !/alert\(/.test(SRC_UI), "ส่ง err ลง component + แสดงผล", j({ page: /err=\{err\}/.test(SRC_PAGE), ui: /\{err &&/.test(SRC_UI) }));
      chk("BH-4.11", "ค่าเริ่มต้นของร้านที่ยังไม่เคยตั้ง = ยังไม่เปิดใช้ (checkbox ไม่ติ๊ก) — ไม่เดาเวลาแทนร้าน", /defaultChecked=\{!!hours\}/.test(SRC_UI), "defaultChecked={!!hours}", /defaultChecked=\{!!hours\}/.test(SRC_UI) ? "ตรง" : "ไม่ตรง");
      chk("BH-4.12", "service ใช้ readBusinessHours ตัวเดียวกับหน้าจอ (ตรวจรูปที่เดียว ไม่แตกเป็น 2 ชุด)", /readBusinessHours/.test(SRC_SVC) && /readBusinessHours/.test(SRC_UI) && /publicBusinessHours/.test(SRC_SVC), "ใช้ตัวเดียวกัน", j({ svc: /readBusinessHours/.test(SRC_SVC), ui: /readBusinessHours/.test(SRC_UI) }), "MAJOR");
    });
  }

  chk("BH-9.8", "มี query เกิดขึ้นจริงระหว่างสอบ (คู่บวกของ BH-9.9 — ถ้าไม่มีเลยแปลว่าไม่ได้ทดสอบอะไร)", opCount > 40, "> 40 query", String(opCount), "MINOR");
  chk("BH-9.9", "ไม่มี query หลุดออก DB จริง (fake prisma รับทุกครั้ง · ไม่มี HTTP ออก)", process.env.DATABASE_URL === "postgresql://qc:qc@127.0.0.1:1/qc-no-db" && netCalls === 0, "DATABASE_URL ถูกทับ · net 0", `${String(process.env.DATABASE_URL).slice(0, 30)} · net ${netCalls}`, "MINOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT BUSINESS HOURS =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

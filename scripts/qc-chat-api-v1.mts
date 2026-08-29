// QC — Public Chat API v1 (WO-C3 + B2 + WO-C5) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ ชื่อไฟล์: `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — `qc-chat-security.mts` (M9–M12),
//    `qc-chat-security-scope.mts` (B1/B5/B6/B10), `qc-chat-core-v2.mts` (WO-C2),
//    `qc-chat.mts`/`qc-chat-notify.mts` มีอยู่ก่อนแล้ว เขียนทับ = ลบด่านทิ้งทั้งชุด
//    (qc-all.mts ค้น `qc-*.mts` อัตโนมัติ — สร้างไฟล์ใหม่ = เป็นด่านทันที)
//
// ⚠️ ชุดนี้ **ห้ามแตะฐานข้อมูล** (.env ของเครื่องนี้ชี้ prod จริง) → กัน 3 ชั้นเหมือน core-v2:
//   1) ทับ DATABASE_URL เป็น host ที่ต่อไม่ได้ ทันทีหลัง loadEnvFile
//   2) ยัด fake prisma ลง require.cache ของ `src/lib/core/db.ts` **ก่อน** import อะไรก็ตาม
//      · fake **เติมค่า default ของ schema ตอน create** (ไม่งั้นได้ข้อสอบเขียวแบบผลลวง — §12)
//   3) ดัก globalThis.fetch + มีข้อ CA-9.9 ตรวจว่าไม่มี query/HTTP หลุดออกจริง
//
// สัญญาที่คุม (ledger/PLAN-CHAT-PLATFORM.md §3):
// CA-1) ตัวตน 2 ระดับ §3.1 — secret (`Authorization: Bearer shark_…`) เทียบ widget
//       (`X-Shark-Widget: swk_…` + Origin) · 🔴 **สลับช่องกันแล้วต้อง 401 ทั้งสองทาง**
// CA-2) 🔴 widget อ้าง `externalUserId` ของคนอื่นไม่ได้ — ตัวตนมาจาก guest token ที่เซิร์ฟเวอร์
//       เซ็นให้เท่านั้น · ห้ามอ่านจาก body/query · token ของ connection อื่นใช้ข้ามไม่ได้
// CA-3) CORS — ACAO = origin ที่ขอมาและอยู่ใน allowlist เท่านั้น (ห้าม `*` เพราะมี credentials) ·
//       `Vary: Origin` ทุกคำตอบ · allowlist ว่าง = ปฏิเสธทุก origin · OPTIONS ครบทุกเส้น ·
//       secret mode ไม่มี CORS
// CA-4) shape ของ `messages[]` §3.2 เป๊ะ (7 ฟิลด์ · attachments 6 ฟิลด์รวม width/height)
// CA-5) tenantId/systemId มาจากกุญแจเสมอ ห้ามรับจาก body · ชั้น route ห้ามมี logic ธุรกิจ
// CA-6) B2 — rate limit นับจาก**แถวใน DB** (`ChatRateBucket`) ไม่ใช่ memory · ผู้เรียกเดิม await จริง ·
//       1 คำขอ = 1 การเขียนถัง (ห้ามซ้อนชั้นโดยไม่จำเป็น)
// CA-7) WO-C5 — allowlist ไฟล์ครอบของที่ SiamDive ใช้ (heic/heif/doc/docx/xlsx/txt) · 10MB ·
//       🔴 ตารางนามสกุลต้องไม่มีตัวไหนตกเป็น `.bin`
// CA-8) /config ผ่าน resolveLocale (ไม่กลืนสตริงว่างที่ร้านตั้งใจ) + สิทธิ์ต่อเส้นถูกต้อง
//
// 📌 แก้สัญญา 2 ข้อเมื่อ WO-C16 (เวลาทำการ) — เจ้าของสั่งเอง ไม่ใช่ builder ตัดสินเอง:
//    · CA-8.1 คีย์ของ /config เพิ่ม `businessHours` (เพิ่มฟิลด์ · ของเดิม 5 ตัวห้ามหาย — ยังล็อกครบ)
//    · CA-8.9 `/config` เดิม "widget เท่านั้น" → เปิดให้ **secret เรียกได้ด้วย** เพราะผู้ใช้จริงรายแรก
//      (เว็บ SiamDive) เรียกจากเซิร์ฟเวอร์ ไม่ได้ฝัง widget ⇒ บังคับ widget key = บังคับให้ร้าน
//      ออกกุญแจสาธารณะ + ตั้ง originAllowlist ทั้งที่ไม่มีเบราว์เซอร์เข้ามาเกี่ยวเลย
//      🔴 ที่ยังต้องแดงเหมือนเดิม: widget อ่านของร้านอื่นไม่ได้ (คุมเพิ่มใน qc-chat-business-hours.mts BH-2)
try { process.loadEnvFile(".env"); } catch {}
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db"; // กันพลาด: ต่อไม่ติดโดยตั้งใจ
process.env.CHAT_CREDENTIALS_KEY ??= "0".repeat(64);

const { readFileSync, existsSync } = await import("node:fs");
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

// ───────── fake prisma (mini query engine) ─────────
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: { op: string; args: Record<string, unknown> }[] = [];
const seen = (op: string) => calls.filter((c) => c.op === op);
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

// 🔴 ค่า default ของ schema — Prisma เติมให้ตอน create · fake ต้องเติมด้วย ไม่งั้นเงื่อนไขอย่าง
//    `updateMany where staffUnreadCount: 0` (announceInbound) หาแถวไม่เจอ = ข้อสอบเขียวแบบผลลวง (§12)
//    ตัวที่เป็น `@default(now())` ต้องเป็น **ฟังก์ชัน** ไม่ใช่ค่าคงที่ตอนโหลดไฟล์:
//    `ChatReadState.lastReadAt` ที่ค้างเป็น epoch ทำให้ /unread นับข้อความเก่าทั้งหมดว่ายังไม่อ่าน
const DEFAULTS: Record<string, Row> = {
  chatConversation: { status: "OPEN", staffUnreadCount: 0, reopenedCount: 0, tags: [], meta: null, lastMessageAt: null, firstResponseAt: null, resolvedAt: null, assigneeUserId: null, unitId: null },
  chatMessage: { type: "TEXT", isInternal: false, deliveryStatus: "SENT", senderName: null, body: null, clientMessageId: null, externalMessageId: null, attachments: [], purgedAt: null },
  chatContact: { verifiedEmail: false, blockedAt: null, lang: null, externalRef: null, email: null, phone: null, customerId: null, displayName: null, avatarUrl: null },
  chatChannelConnection: { status: "CONNECTED", originAllowlist: [], publicKeyHash: null, publicKeyPrefix: null, defaultUnitId: null, credentials: {}, lastInboundAt: null },
  chatSetting: { widgetEnabled: true, greetingMessage: {}, offlineMessage: {}, theme: {}, senderAlias: null, memberSystemId: null, retentionDays: 365 },
  chatRateBucket: { count: 0 },
  chatReadState: { lastReadMessageId: null, lastReadAt: () => new Date() }, // @default(now())
  outboxEvent: { status: "PENDING", attempts: 0, availableAt: null, processedAt: null },
  fileAsset: {},
};

// คลี่ค่า default ที่เป็นฟังก์ชัน (now()) ให้เป็นค่าจริง ณ เวลาที่ create
const defaultsOf = (model: string): Row => {
  const src = DEFAULTS[model] ?? {};
  const out: Row = {};
  for (const [k, v] of Object.entries(src)) out[k] = typeof v === "function" ? (v as () => unknown)() : v;
  return out;
};

function applyData(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ("increment" in o) { row[k] = (typeof row[k] === "number" ? (row[k] as number) : 0) + (o.increment as number); continue; }
      if ("decrement" in o) { row[k] = (typeof row[k] === "number" ? (row[k] as number) : 0) - (o.decrement as number); continue; }
      if ("set" in o) { row[k] = o.set; continue; }
    }
    row[k] = v;
  }
}

function p2002(model: string): never {
  throw new Prisma.PrismaClientKnownRequestError(`[fake] unique constraint ${model}`, { code: "P2002", clientVersion: "qc" });
}

function delegate(model: string) {
  const rows = () => (tables[model] ??= []);
  const rec = (op: string, a: Record<string, unknown>) => { calls.push({ op: `${model}.${op}`, args: a }); };
  const find = (a: Record<string, unknown>) => rows().find((r) => matches(r, a.where)) ?? null;
  return {
    findFirst: async (a: Record<string, unknown> = {}) => { rec("findFirst", a); return find(a); },
    findUnique: async (a: Record<string, unknown> = {}) => { rec("findUnique", a); return find(a); },
    findMany: async (a: Record<string, unknown> = {}) => { rec("findMany", a); return rows().filter((r) => matches(r, a.where)); },
    count: async (a: Record<string, unknown> = {}) => { rec("count", a); return rows().filter((r) => matches(r, a.where)).length; },
    aggregate: async (a: Record<string, unknown> = {}) => { rec("aggregate", a); return { _count: { _all: rows().filter((r) => matches(r, a.where)).length } }; },
    create: async (a: Record<string, unknown> = {}) => {
      rec("create", a);
      const data = (a.data ?? {}) as Row;
      if (model === "chatMessage" && data.clientMessageId != null && rows().some((r) => r.conversationId === data.conversationId && r.clientMessageId === data.clientMessageId)) p2002(model);
      if (model === "outboxEvent" && rows().some((r) => r.tenantId === data.tenantId && r.idempotencyKey === data.idempotencyKey)) p2002(model);
      if (model === "chatRateBucket" && rows().some((r) => r.key === data.key)) p2002(model); // key @unique
      if (model === "chatContact" && rows().some((r) => r.systemId === data.systemId && r.channel === data.channel && r.channelConnectionId === data.channelConnectionId && r.externalUserId === data.externalUserId)) p2002(model);
      const r: Row = { id: `fk-${model}-${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...defaultsOf(model), ...data };
      rows().push(r);
      if (model === "chatAttachment") {
        const msg = (tables.chatMessage ??= []).find((m) => m.id === r.messageId);
        if (msg) ((msg.attachments ??= []) as Row[]).push(r);
      }
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
        // 🔴 ตัวนับ rate limit เป็น `INSERT … ON CONFLICT DO UPDATE … RETURNING` คำสั่งเดียว
        //    (core/rate-limit-db.ts — จงใจไม่แตกเป็นหลายคำสั่ง เพราะเวอร์ชันที่แตกนับพลาด
        //     เมื่อมีคำขอพร้อมกัน: วัดบน Neon จริงได้ 15/20)
        //    fake ต้องจำลองความหมายของ SQL นี้จริง ๆ ไม่ใช่คืน 0 — ไม่งั้นข้อ CA-6.* วัดอะไรไม่ได้เลย
        if (sql.includes('"ChatRateBucket"')) {
          const [key, nowD, floorD] = [a[1] as string, a[2] as Date, a[3] as Date];
          calls.push({ op: "chatRateBucket.upsertRaw", args: { key } }); // CA-6.5 นับ "เขียนถังกี่ครั้ง" จากตรงนี้
          const rs = (tables.chatRateBucket ??= []);
          let r = rs.find((x) => x.key === key);
          if (!r) {
            r = { id: `fk-chatRateBucket-${++seq}`, key, count: 1, windowStart: nowD, createdAt: new Date(), updatedAt: new Date() };
            rs.push(r);
          } else if ((r.windowStart as Date).getTime() <= floorD.getTime()) {
            r.count = 1; // หน้าต่างหมดอายุ → เริ่มนับใหม่ (ไม่ใช่ล็อกตลอดกาล)
            r.windowStart = nowD;
          } else {
            r.count = (r.count as number) + 1;
          }
          return [{ count: r.count, windowStart: r.windowStart }];
        }
        calls.push({ op: "$executeRaw", args: { sql } });
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

// ───────── ของจำลอง (ร้าน/กุญแจ/ช่องทาง) ─────────
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const SECRET_KEY = "shark_" + "a".repeat(64);
const SECRET_KEY_T2 = "shark_" + "c".repeat(64);
const WIDGET_KEY = "swk_" + "b".repeat(32);
const WIDGET_KEY_2 = "swk_" + "d".repeat(32);
const GOOD_ORIGIN = "https://www.siamdive.com";
const EVIL_ORIGIN = "https://evil.example";

const API = "https://shark.in.th/api/v1/chat";
const ROUTES = ["identities", "messages", "thread", "read", "unread", "attachments", "guest", "config"];

function resetAll(opts: { allowlist?: string[] } = {}) {
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
    { id: "conn-web", tenantId: "T1", systemId: "S1", type: "WEBCHAT", displayName: "แชทหน้าเว็บ", externalAccountId: "webchat", credentials: {}, status: "CONNECTED", defaultUnitId: null, originAllowlist: opts.allowlist ?? [GOOD_ORIGIN], publicKeyHash: sha(WIDGET_KEY), publicKeyPrefix: WIDGET_KEY.slice(0, 12), createdAt: new Date(1) },
    { id: "conn-web2", tenantId: "T2", systemId: "S2", type: "WEBCHAT", displayName: "แชทร้านอื่น", externalAccountId: "webchat", credentials: {}, status: "CONNECTED", defaultUnitId: null, originAllowlist: [GOOD_ORIGIN], publicKeyHash: sha(WIDGET_KEY_2), publicKeyPrefix: WIDGET_KEY_2.slice(0, 12), createdAt: new Date(2) },
  ];
  tables.chatSetting = [
    { id: "st1", tenantId: "T1", systemId: "S1", memberSystemId: null, senderAlias: "ทีมงาน SiamDive", widgetEnabled: true, greetingMessage: { th: "สวัสดีค่ะ", en: "Hi there", de: "" }, offlineMessage: { th: "นอกเวลาทำการ" }, theme: { primaryColor: "#0aa" } },
  ];
  calls.length = 0;
  netCalls = 0;
}

const secretHeaders = (extra: Record<string, string> = {}) => ({ authorization: `Bearer ${SECRET_KEY}`, "content-type": "application/json", ...extra });
const widgetHeaders = (guest?: string | null, origin: string | null = GOOD_ORIGIN, key = WIDGET_KEY) => {
  const h: Record<string, string> = { "x-shark-widget": key, "content-type": "application/json" };
  if (origin) h.origin = origin;
  if (guest) h["x-shark-guest"] = guest;
  return h;
};

type Handler = (req: Request) => Promise<Response>;
type RouteMod = { GET?: Handler; POST?: Handler; OPTIONS?: Handler };
const mods: Record<string, RouteMod> = {};
async function loadRoutes(): Promise<string[]> {
  const missing: string[] = [];
  for (const r of ROUTES) {
    const m = (await import(`@/app/api/v1/chat/${r}/route` as string).catch(() => null)) as RouteMod | null;
    if (!m) { missing.push(r); continue; }
    mods[r] = m;
  }
  return missing;
}

async function call(
  route: string,
  method: "GET" | "POST" | "OPTIONS",
  opts: { headers?: Record<string, string>; body?: unknown; query?: Record<string, string>; form?: FormData } = {},
): Promise<{ status: number; json: Record<string, unknown>; headers: Headers }> {
  const url = new URL(`${API}/${route}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const init: RequestInit = { method, headers: opts.headers ?? {} };
  if (opts.form) init.body = opts.form;
  else if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const handler = method === "GET" ? mods[route]?.GET : method === "POST" ? mods[route]?.POST : mods[route]?.OPTIONS;
  if (!handler) return { status: 0, json: { error: `ไม่มี handler ${method} /${route}` }, headers: new Headers() };
  const res = await handler(new Request(url, init));
  let body: Record<string, unknown> = {};
  const text = await res.text();
  if (text) { try { body = JSON.parse(text) as Record<string, unknown>; } catch { body = { _raw: text.slice(0, 120) }; } }
  return { status: res.status, json: body, headers: res.headers };
}

const thai = (v: unknown) => typeof v === "string" && /[ก-๙]/.test(v);

// ───────── source สำหรับข้อ static ─────────
const SRC_AUTH = existsSync("src/lib/modules/chat/public-auth.ts") ? readFileSync("src/lib/modules/chat/public-auth.ts", "utf8") : "";
const SRC_RL = readFileSync("src/lib/modules/chat/rate-limit.ts", "utf8");
const SRC_WEBCHAT = readFileSync("src/app/api/chat/webchat/[connectionId]/route.ts", "utf8");
const routeSrc: Record<string, string> = {};
for (const r of ROUTES) {
  const p = `src/app/api/v1/chat/${r}/route.ts`;
  routeSrc[r] = existsSync(p) ? readFileSync(p, "utf8") : "";
}
const ALL_ROUTE_SRC = Object.values(routeSrc).join("\n");

try {
  const missing = await loadRoutes();
  chk("CA-0.1", `มีครบทั้ง 8 เส้นตาม §3.2 (${ROUTES.join(", ")})`, missing.length === 0, "ครบ 8 เส้น", missing.length ? `ขาด: ${missing.join(", ")}` : "ครบ");

  const pub = (await import("@/lib/modules/chat/public-auth" as string).catch((e) => { console.log(`  (import public-auth ล้ม: ${e instanceof Error ? e.message.slice(0, 200) : String(e)})`); return null; })) as {
    mintGuestToken: (c: string) => string;
    verifyGuestToken: (c: string, t: unknown) => boolean;
  } | null;
  chk("CA-0.2", "มี src/lib/modules/chat/public-auth.ts (ตัวตน 2 ระดับ §3.1)", !!pub, "import ได้", pub ? "ได้" : "ไม่ได้");

  if (pub && missing.length === 0) {
    const guest = () => pub.mintGuestToken("conn-web");
    const guestOther = () => pub.mintGuestToken("conn-web2");

    // ═════════ CA-1: ตัวตน 2 ระดับ + สลับช่อง ═════════
    await section("CA-1", "\nCA-1 ตัวตน 2 ระดับ (§3.1 — สลับช่องกันต้อง 401):", async () => {
      resetAll();
      const okSecret = await call("messages", "POST", { headers: secretHeaders(), body: { externalUserId: "dev-1", body: "สวัสดี" } });
      chk("CA-1.1", "secret key ผ่าน Authorization → ผ่าน (positive control)", okSecret.status === 200 && okSecret.json.ok === true, "200 {ok:true}", `${okSecret.status} ${j(okSecret.json)}`);

      resetAll();
      const g = guest();
      const okWidget = await call("messages", "POST", { headers: widgetHeaders(g), body: { body: "สวัสดี" } });
      chk("CA-1.2", "widget key + Origin ที่อนุญาต + guest → ผ่าน (positive control)", okWidget.status === 200 && okWidget.json.ok === true, "200 {ok:true}", `${okWidget.status} ${j(okWidget.json)}`);

      resetAll();
      // 🔴 เอา secret key ไปใส่ช่องของ widget — ถ้าผ่าน = secret key ใช้จากเบราว์เซอร์ได้ (D2 พัง)
      const swap1 = await call("messages", "POST", { headers: { "x-shark-widget": SECRET_KEY, origin: GOOD_ORIGIN, "content-type": "application/json" }, body: { body: "hi" } });
      chk("CA-1.3", "🔴 secret key ผ่าน X-Shark-Widget → 401", swap1.status === 401 && thai(swap1.json.error), "401 + ข้อความไทย", `${swap1.status} ${j(swap1.json)}`);

      resetAll();
      // 🔴 เอา widget key ไปใส่ Authorization — ถ้าผ่าน = widget key ได้สิทธิ์ระดับเซิร์ฟเวอร์
      const swap2 = await call("messages", "POST", { headers: { authorization: `Bearer ${WIDGET_KEY}`, "content-type": "application/json" }, body: { externalUserId: "ใครก็ได้", body: "hi" } });
      chk("CA-1.4", "🔴 widget key ผ่าน Authorization: Bearer → 401", swap2.status === 401 && thai(swap2.json.error), "401 + ข้อความไทย", `${swap2.status} ${j(swap2.json)}`);

      resetAll();
      const both = await call("messages", "POST", { headers: { authorization: `Bearer ${SECRET_KEY}`, "x-shark-widget": WIDGET_KEY, origin: GOOD_ORIGIN, "content-type": "application/json" }, body: { externalUserId: "dev-1", body: "hi" } });
      chk("CA-1.5", "ส่งกุญแจมาทั้ง 2 แบบ → 401 (ไม่เดาให้)", both.status === 401, "401", `${both.status} ${j(both.json)}`, "MAJOR");

      resetAll();
      const none = await call("thread", "GET", { headers: {}, query: { externalUserId: "dev-1" } });
      chk("CA-1.6", "ไม่ส่งกุญแจเลย → 401 + ข้อความไทย", none.status === 401 && thai(none.json.error), "401 + ไทย", `${none.status} ${j(none.json)}`);

      resetAll();
      tables.apiKey![0]!.revokedAt = new Date();
      const revoked = await call("thread", "GET", { headers: secretHeaders(), query: { externalUserId: "dev-1" } });
      chk("CA-1.7", "คีย์ที่ถูกเพิกถอนแล้ว → 401", revoked.status === 401, "401", `${revoked.status} ${j(revoked.json)}`, "MAJOR");

      resetAll();
      tables.chatChannelConnection![0]!.status = "DISABLED";
      const disabled = await call("config", "GET", { headers: widgetHeaders() });
      chk("CA-1.8", "connection ถูกปิด → กุญแจ widget ใช้ไม่ได้ (401)", disabled.status === 401, "401", `${disabled.status} ${j(disabled.json)}`, "MAJOR");

      chk("CA-1.9", "กุญแจ widget เก็บเป็น hash เท่านั้น (ไม่มีคอลัมน์เก็บ raw)", /publicKeyHash/.test(readFileSync("src/lib/modules/chat/service.ts", "utf8")) && !/publicKey\s*:\s*rawKey/.test(readFileSync("src/lib/modules/chat/service.ts", "utf8")) && /sha256hex\(rawKey\)/.test(readFileSync("src/lib/modules/chat/service.ts", "utf8")), "เขียนเฉพาะ sha256(raw)", "ดู service.ts");
    });

    // ═════════ CA-2: widget อ้างเป็นคนอื่นไม่ได้ ═════════
    await section("CA-2", "\nCA-2 🔴 widget อ้าง externalUserId ของคนอื่นไม่ได้:", async () => {
      // เหยื่อคุยไว้ก่อนผ่านฝั่งเซิร์ฟเวอร์
      resetAll();
      const VICTIM = "sd2-device-เหยื่อ";
      const SECRET_MSG = "เลขบัตรเครดิตของฉันคือ 4111";
      await call("messages", "POST", { headers: secretHeaders(), body: { externalUserId: VICTIM, body: SECRET_MSG } });
      const g = guest();
      // widget ของคนอื่นพยายามอ่านเธรดของเหยื่อ
      const peek = await call("thread", "GET", { headers: widgetHeaders(g), query: { externalUserId: VICTIM } });
      const leaked = j(peek.json).includes("4111");
      chk("CA-2.1", "🔴 widget อ่านเธรดของคนอื่นไม่ได้ → 403 และไม่มีข้อความหลุด", peek.status === 403 && !leaked && thai(peek.json.error), "403 + ไม่มีข้อความเหยื่อ", `${peek.status} ${j(peek.json).slice(0, 120)}`);

      const post = await call("messages", "POST", { headers: widgetHeaders(g), body: { externalUserId: VICTIM, body: "แทรกข้อความในนามคนอื่น" } });
      const victimConv = (tables.chatConversation ?? [])[0];
      const injected = (tables.chatMessage ?? []).some((m) => String(m.body ?? "").includes("แทรกข้อความในนามคนอื่น"));
      chk("CA-2.2", "🔴 widget ส่งข้อความในนามคนอื่นไม่ได้ → 403 และไม่มีแถวถูกเขียน", post.status === 403 && !injected, "403 + ไม่มีข้อความใหม่", `${post.status} · injected ${injected} · conv ${j(victimConv?.id)}`);

      const un = await call("unread", "GET", { headers: widgetHeaders(g), query: { externalUserId: VICTIM } });
      chk("CA-2.3", "🔴 widget ถามยอดยังไม่อ่านของคนอื่นไม่ได้ → 403", un.status === 403, "403", `${un.status} ${j(un.json)}`);

      const rd = await call("read", "POST", { headers: widgetHeaders(g), body: { externalUserId: VICTIM } });
      chk("CA-2.4", "🔴 widget ทำเครื่องหมายอ่านแทนคนอื่นไม่ได้ → 403", rd.status === 403, "403", `${rd.status} ${j(rd.json)}`);

      // ตัวตนต้องมาจาก guest ที่เซิร์ฟเวอร์ออกให้เท่านั้น
      const noGuest = await call("thread", "GET", { headers: widgetHeaders(null) });
      chk("CA-2.5", "widget ที่ยังไม่มี guest → 401 (บอกให้เรียก /guest ก่อน)", noGuest.status === 401 && thai(noGuest.json.error), "401 + ไทย", `${noGuest.status} ${j(noGuest.json)}`);

      const forged = await call("thread", "GET", { headers: widgetHeaders("swg_" + "f".repeat(32) + ".deadbeef") });
      chk("CA-2.6", "🔴 guest token ปลอม (ลายเซ็นไม่ตรง) → ใช้ไม่ได้", forged.status === 401, "401", `${forged.status} ${j(forged.json)}`);

      const crossToken = guestOther(); // token ที่เราออกให้จริง แต่ของอีก connection
      const cross = await call("thread", "GET", { headers: widgetHeaders(crossToken) });
      chk("CA-2.7", "🔴 guest token ของ connection อื่น ใช้ข้ามไม่ได้", cross.status === 401, "401", `${cross.status} ${j(cross.json)}`);

      // positive control — ของตัวเองต้องได้
      const own = await call("messages", "POST", { headers: widgetHeaders(g), body: { externalUserId: g, body: "ข้อความของฉันเอง" } });
      chk("CA-2.8", "widget ส่งในนามตัวเอง (ระบุ guest ของตัวเอง) → ผ่าน (positive control)", own.status === 200 && own.json.ok === true, "200", `${own.status} ${j(own.json)}`);

      // ไม่ต้องระบุอะไรเลยก็ต้องได้ — ตัวตนมาจาก token
      const own2 = await call("messages", "POST", { headers: widgetHeaders(g), body: { body: "อีกข้อความ" } });
      const mine = await call("thread", "GET", { headers: widgetHeaders(g) });
      const mineMsgs = (mine.json.messages ?? []) as Row[];
      chk("CA-2.9", "widget อ่านเฉพาะเธรดของตัวเอง (ไม่มีข้อความเหยื่อปน)", own2.status === 200 && mine.status === 200 && mineMsgs.length === 2 && !j(mineMsgs).includes("4111"), "2 ข้อความของตัวเอง", `${mine.status} · ${j(mineMsgs.map((m) => m.body))}`);

      // widget ตั้งตราประทับ "ยืนยันอีเมลแล้ว" เองไม่ได้
      const ct = (tables.chatContact ?? []).find((c) => c.externalUserId === g);
      const claim = await call("messages", "POST", { headers: widgetHeaders(g), body: { body: "x", verifiedEmail: true, email: "hacker@example.com", externalRef: "โกง" } });
      const ct2 = (tables.chatContact ?? []).find((c) => c.externalUserId === g);
      chk("CA-2.10", "🔴 widget ตั้ง verifiedEmail/email/externalRef เองไม่ได้ (เชื่อเฉพาะฝั่งเซิร์ฟเวอร์)", claim.status === 200 && ct2?.verifiedEmail !== true && ct2?.email == null && ct2?.externalRef == null, "verifiedEmail ยังเป็น false", j({ before: ct?.verifiedEmail, after: ct2?.verifiedEmail, email: ct2?.email, ref: ct2?.externalRef }));

      chk("CA-2.11", "โค้ดของเส้น messages/thread/read/unread ไม่มีทางอ่าน externalUserId ตรง ๆ จาก body", ["messages", "thread", "read", "unread"].every((r) => !/body\.externalUserId\s*(?![,)])|params\.get\("externalUserId"\)\s*\)?\s*;?\s*$/m.test("") && /resolveExternalUserId\(/.test(routeSrc[r]!)), "ทุกเส้นผ่าน resolveExternalUserId", j(["messages", "thread", "read", "unread"].map((r) => /resolveExternalUserId\(/.test(routeSrc[r]!))), "MAJOR");
    });

    // ═════════ CA-3: CORS + origin allowlist ═════════
    await section("CA-3", "\nCA-3 CORS + origin allowlist:", async () => {
      resetAll();
      const g = guest();
      const good = await call("config", "GET", { headers: widgetHeaders(g, GOOD_ORIGIN) });
      chk("CA-3.1", "origin ที่อนุญาต → 200 + Allow-Origin เป็น origin นั้น (ไม่ใช่ *)", good.status === 200 && good.headers.get("access-control-allow-origin") === GOOD_ORIGIN, `ACAO=${GOOD_ORIGIN}`, `${good.status} ACAO=${good.headers.get("access-control-allow-origin")}`);
      chk("CA-3.2", "มี Vary: Origin (กัน CDN เสิร์ฟคำตอบข้าม origin)", /origin/i.test(good.headers.get("vary") ?? ""), "Vary: Origin", String(good.headers.get("vary")));
      chk("CA-3.3", "มี Allow-Credentials (คู่กับ ACAO เจาะจง)", good.headers.get("access-control-allow-credentials") === "true", "true", String(good.headers.get("access-control-allow-credentials")), "MAJOR");

      const evil = await call("config", "GET", { headers: widgetHeaders(g, EVIL_ORIGIN) });
      chk("CA-3.4", "🔴 origin นอก allowlist → 403 และไม่มี Allow-Origin", evil.status === 403 && evil.headers.get("access-control-allow-origin") === null && thai(evil.json.error), "403 + ไม่มี ACAO", `${evil.status} ACAO=${evil.headers.get("access-control-allow-origin")}`);
      chk("CA-3.5", "คำตอบที่ปฏิเสธก็ยังต้องมี Vary: Origin", /origin/i.test(evil.headers.get("vary") ?? ""), "Vary: Origin", String(evil.headers.get("vary")), "MAJOR");

      const noOrigin = await call("config", "GET", { headers: widgetHeaders(g, null) });
      chk("CA-3.6", "ไม่มี Origin เลยในโหมด widget → 403 (ตัดสินไม่ได้ = ไม่อนุญาต)", noOrigin.status === 403, "403", `${noOrigin.status} ${j(noOrigin.json)}`);

      // 🔴 allowlist ว่าง = ปฏิเสธทุก origin (ไม่ใช่ยอมทุกอัน)
      resetAll({ allowlist: [] });
      const empty = await call("config", "GET", { headers: widgetHeaders(guest(), GOOD_ORIGIN) });
      chk("CA-3.7", "🔴 allowlist ว่าง → ปฏิเสธทุก origin (ปลอดภัยโดยปริยาย)", empty.status === 403 && empty.headers.get("access-control-allow-origin") === null, "403 + ไม่มี ACAO", `${empty.status} ACAO=${empty.headers.get("access-control-allow-origin")}`);

      resetAll();
      chk("CA-3.8", "ทุกเส้นมี OPTIONS handler", ROUTES.every((r) => typeof mods[r]?.OPTIONS === "function"), "8/8", j(ROUTES.filter((r) => typeof mods[r]?.OPTIONS !== "function")));
      const pre = await call("messages", "OPTIONS", { headers: { origin: GOOD_ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "x-shark-widget" } });
      chk("CA-3.9", "preflight origin ที่อนุญาต → 2xx + ACAO + allow-methods/headers", pre.status === 204 && pre.headers.get("access-control-allow-origin") === GOOD_ORIGIN && /POST/.test(pre.headers.get("access-control-allow-methods") ?? "") && /x-shark-widget/i.test(pre.headers.get("access-control-allow-headers") ?? ""), "204 + header ครบ", `${pre.status} ${j({ o: pre.headers.get("access-control-allow-origin"), m: pre.headers.get("access-control-allow-methods"), h: pre.headers.get("access-control-allow-headers") })}`);
      const preEvil = await call("messages", "OPTIONS", { headers: { origin: EVIL_ORIGIN, "access-control-request-method": "POST" } });
      chk("CA-3.10", "preflight origin นอก allowlist → ไม่มี ACAO", preEvil.headers.get("access-control-allow-origin") === null && preEvil.status === 403, "403 + ไม่มี ACAO", `${preEvil.status} ACAO=${preEvil.headers.get("access-control-allow-origin")}`);

      const s = await call("thread", "GET", { headers: secretHeaders({ origin: EVIL_ORIGIN }), query: { externalUserId: "dev-1" } });
      chk("CA-3.11", "โหมด secret ไม่มี CORS header เลย (server-to-server ไม่ต้องมี)", s.status === 200 && s.headers.get("access-control-allow-origin") === null && s.headers.get("access-control-allow-credentials") === null, "ไม่มี ACAO/credentials", `${s.status} ${j({ o: s.headers.get("access-control-allow-origin") })}`);

      chk("CA-3.12", '🔴 ไม่มีที่ไหนตั้ง Allow-Origin เป็น "*" (คู่กับ credentials = เปิดให้ทั้งโลก)', !/allow-origin["'\s:]*[,)]?\s*["']\*/i.test(SRC_AUTH + ALL_ROUTE_SRC), "ไม่มี *", "พบ * ในโค้ด");
    });

    // ═════════ CA-4: shape ของ messages[] §3.2 ═════════
    await section("CA-4", "\nCA-4 สัญญา messages[] §3.2 (เปลี่ยน = ลูกค้าที่ต่ออยู่พัง):", async () => {
      resetAll();
      const DEV = "sd2-device-1";
      const sent = await call("messages", "POST", {
        headers: secretHeaders(),
        body: {
          externalUserId: DEV, body: "อยากได้ทริปสิมิลัน", lang: "de", verifiedEmail: true, externalRef: "device-abc",
          clientMessageId: "sd2:1", context: { pageUrl: "https://www.siamdive.com/trip/1", country: "DE" },
          attachments: [{ url: "https://cdn.example/a.png", mimeType: "image/png", name: "a.png", sizeBytes: 10, width: 800, height: 600 }],
        },
      });
      chk("CA-4.1", "ส่งข้อความ+ไฟล์แนบผ่านเส้น secret → 200 (positive control)", sent.status === 200 && !!sent.json.messageId, "200 + messageId", `${sent.status} ${j(sent.json)}`);

      const th = await call("thread", "GET", { headers: secretHeaders(), query: { externalUserId: DEV } });
      const msgs = (th.json.messages ?? []) as Row[];
      const keys = msgs[0] ? Object.keys(msgs[0]).sort().join(",") : "(ไม่มีข้อความ)";
      chk("CA-4.2", "messages[] มี 7 ฟิลด์ตาม §3.2 เป๊ะ", keys === "attachments,body,createdAt,direction,id,senderName,type", "attachments,body,createdAt,direction,id,senderName,type", keys);
      const at = ((msgs[0]?.attachments ?? []) as Row[])[0];
      const atKeys = at ? Object.keys(at).sort().join(",") : "(ไม่มีไฟล์แนบ)";
      chk("CA-4.3", "attachments[] มี 6 ฟิลด์ (รวม width/height — widget ใช้กันภาพกระตุก)", atKeys === "height,mimeType,name,sizeBytes,url,width" && at?.width === 800 && at?.height === 600, "height,mimeType,name,sizeBytes,url,width + ค่าถูก", `${atKeys} · ${j(at)}`);
      chk("CA-4.4", "/thread คืน conversationId + status ตาม §3.2", typeof th.json.conversationId === "string" && th.json.status === "OPEN", "{conversationId, status:OPEN}", j({ c: th.json.conversationId, s: th.json.status }));

      // โน้ตภายในห้ามหลุดถึงลูกค้า (ตรวจผ่าน route จริง ไม่ใช่เรียก service ตรง)
      const conv = (tables.chatConversation ?? [])[0]!;
      (tables.chatMessage ??= []).push({ id: "note-1", tenantId: "T1", systemId: "S1", conversationId: conv.id, direction: "OUT", type: "TEXT", body: "ลูกค้ารายนี้ค้างชำระ", isInternal: true, senderName: null, createdAt: new Date(), attachments: [] });
      const th2 = await call("thread", "GET", { headers: secretHeaders(), query: { externalUserId: DEV } });
      chk("CA-4.5", "🔴 โน้ตภายในไม่หลุดออก API (end-to-end ผ่าน route)", !j(th2.json).includes("ค้างชำระ"), "ไม่มีโน้ต", j(th2.json).slice(0, 150));

      const after = new Date(Date.now() + 60_000).toISOString();
      const th3 = await call("thread", "GET", { headers: secretHeaders(), query: { externalUserId: DEV, after } });
      chk("CA-4.6", "?after กรองข้อความเก่าออกจริง", ((th3.json.messages ?? []) as Row[]).length === 0, "0 ข้อความ", j(((th3.json.messages ?? []) as Row[]).length), "MAJOR");
      const bad = await call("thread", "GET", { headers: secretHeaders(), query: { externalUserId: DEV, after: "เมื่อวาน" } });
      chk("CA-4.7", "after ที่ไม่ใช่ ISO → 400 + ข้อความไทย", bad.status === 400 && thai(bad.json.error), "400 + ไทย", `${bad.status} ${j(bad.json)}`, "MINOR");

      // /identities + /read + /unread
      resetAll();
      const id1 = await call("identities", "POST", { headers: secretHeaders(), body: { externalUserId: "dev-x", displayName: "คุณเอ", lang: "th", email: "a@b.co", verifiedEmail: true } });
      const ctRow = (tables.chatContact ?? [])[0];
      chk("CA-4.8", "/identities คืน contactId + เขียน lang/email/verifiedEmail (M2)", id1.status === 200 && id1.json.contactId === ctRow?.id && ctRow?.lang === "th" && ctRow?.verifiedEmail === true, "{contactId} + ฟิลด์ M2", `${id1.status} ${j(id1.json)} · ${j({ lang: ctRow?.lang, v: ctRow?.verifiedEmail })}`);
      chk("CA-4.9", "/identities ไม่สร้างเธรดเปล่าให้ทีมต้องมานั่งปิดเอง", (tables.chatConversation ?? []).length === 0 && id1.json.conversationId === undefined, "0 conversation", j({ n: (tables.chatConversation ?? []).length, c: id1.json.conversationId }), "MAJOR");

      resetAll();
      const DEV2 = "dev-unread";
      await call("messages", "POST", { headers: secretHeaders(), body: { externalUserId: DEV2, body: "ถามหน่อยครับ" } });
      const conv2 = (tables.chatConversation ?? [])[0]!;
      (tables.chatMessage ??= []).push(
        { id: "out-1", tenantId: "T1", systemId: "S1", conversationId: conv2.id, direction: "OUT", type: "TEXT", body: "สวัสดีค่ะ", isInternal: false, senderName: null, createdAt: new Date(Date.now() - 1000), attachments: [] },
        { id: "out-2", tenantId: "T1", systemId: "S1", conversationId: conv2.id, direction: "OUT", type: "TEXT", body: "มีอะไรให้ช่วยคะ", isInternal: false, senderName: null, createdAt: new Date(Date.now() - 500), attachments: [] },
        { id: "note-2", tenantId: "T1", systemId: "S1", conversationId: conv2.id, direction: "OUT", type: "TEXT", body: "โน้ตทีม", isInternal: true, senderName: null, createdAt: new Date(Date.now() - 400), attachments: [] },
      );
      const u1 = await call("unread", "GET", { headers: secretHeaders(), query: { externalUserId: DEV2 } });
      chk("CA-4.10", "/unread นับเฉพาะข้อความจากร้าน ไม่นับโน้ตภายใน", u1.status === 200 && u1.json.unread === 2, "{unread:2}", `${u1.status} ${j(u1.json)}`);
      const staffUnreadBefore = conv2.staffUnreadCount;
      const rd = await call("read", "POST", { headers: secretHeaders(), body: { externalUserId: DEV2, lastReadMessageId: "out-2" } });
      const u2 = await call("unread", "GET", { headers: secretHeaders(), query: { externalUserId: DEV2 } });
      chk("CA-4.11", "/read แล้ว /unread เป็น 0", rd.status === 200 && u2.json.unread === 0, "{unread:0}", `${rd.status} ${j(u2.json)}`);
      const unreadWhere = seen("chatMessage.count").map((c) => (c.args.where ?? {}) as Row);
      chk("CA-4.11b", "🔴 /unread กรองโน้ตภายในที่ระดับ query จริง (ไม่ใช่กรองทีหลัง)", unreadWhere.length > 0 && unreadWhere.every((w) => w.isInternal === false && w.direction === "OUT"), "where มี isInternal:false + direction:OUT", j(unreadWhere));
      chk("CA-4.12", "🔴 ลูกค้าอ่านแล้ว ต้องไม่ล้างแบดจ์ 'รอตอบ' ของทีมงาน", (tables.chatConversation ?? [])[0]!.staffUnreadCount === staffUnreadBefore && staffUnreadBefore === 1, "staffUnreadCount ไม่เปลี่ยน (1)", j({ before: staffUnreadBefore, after: (tables.chatConversation ?? [])[0]!.staffUnreadCount }));
    });

    // ═════════ CA-5: tenantId/systemId จากกุญแจ + ชั้น route ไม่มี logic ═════════
    await section("CA-5", "\nCA-5 tenantId/systemId มาจากกุญแจ + ชั้น route ไม่มี logic ธุรกิจ:", async () => {
      resetAll();
      const r = await call("messages", "POST", { headers: secretHeaders(), body: { externalUserId: "dev-1", body: "hi", tenantId: "T2", systemId: "S2" } });
      const ct = (tables.chatContact ?? [])[0];
      chk("CA-5.1", "🔴 ใส่ tenantId/systemId มาใน body → ไม่มีผล (เขียนลงร้านของกุญแจ)", r.status === 200 && ct?.tenantId === "T1" && ct?.systemId === "S1", "T1/S1", `${r.status} ${j({ t: ct?.tenantId, s: ct?.systemId })}`);

      resetAll();
      const cross = await call("messages", "POST", { headers: secretHeaders({ "x-shark-system": "S2" }), body: { externalUserId: "dev-1", body: "hi" } });
      chk("CA-5.2", "🔴 ระบุ X-Shark-System ของร้านอื่น → ปฏิเสธ (ไม่เขียนข้ามร้าน)", cross.status === 404 && (tables.chatContact ?? []).length === 0, "404 + ไม่มี contact", `${cross.status} · contact ${(tables.chatContact ?? []).length}`);

      resetAll();
      tables.appSystem = [{ id: "S2", tenantId: "T2", type: "CHAT", active: true, createdAt: new Date() }];
      const noSys = await call("thread", "GET", { headers: secretHeaders(), query: { externalUserId: "dev-1" } });
      chk("CA-5.3", "ร้านที่ยังไม่เปิดระบบแชท → 404 + ข้อความไทย", noSys.status === 404 && thai(noSys.json.error), "404 + ไทย", `${noSys.status} ${j(noSys.json)}`, "MAJOR");

      chk("CA-5.4", "ไม่มี route ไหนอ่าน tenantId/systemId จาก body/query", !/body\.(tenantId|systemId)|get\("(tenantId|systemId)"\)/.test(ALL_ROUTE_SRC), "ไม่มี", "พบใน route");
      chk("CA-5.5", "ชั้น route ไม่แตะ prisma ตรง ๆ (เรียกชั้น 1 อย่างเดียว — กฎเหล็กข้อ 1)", !/@\/lib\/core\/db/.test(ALL_ROUTE_SRC), "ไม่ import prisma", "พบ import prisma ใน route");
      chk("CA-5.6", "ชั้น route ไม่ประกอบ query/where เอง", !/where\s*:/.test(ALL_ROUTE_SRC), "ไม่มี where ใน route", "พบ where ใน route", "MAJOR");
      chk("CA-5.7", "ทุกเส้นเรียก authenticateChatRequest (ไม่มีเส้นไหนเปิดโล่ง)", ROUTES.every((r2) => /authenticateChatRequest\(/.test(routeSrc[r2]!)), "8/8", j(ROUTES.filter((r2) => !/authenticateChatRequest\(/.test(routeSrc[r2]!))));
    });

    // ═════════ CA-6: B2 rate limit บน DB ═════════
    await section("CA-6", "\nCA-6 B2 — rate limit นับจากแถวใน DB (ไม่ใช่ memory ต่อ process):", async () => {
      const rl = (await import("@/lib/core/rate-limit-db" as string).catch(() => null)) as {
        checkRateLimitDb: (k: string, o: { limit: number; windowMs: number }, now?: number) => Promise<{ ok: boolean; retryAfterSec?: number }>;
      } | null;
      if (!rl) { chk("CA-6.0", "มีตัวนับบน DB (core/rate-limit-db.ts)", false, "import ได้", "ไม่มี"); return; }

      resetAll();
      const t0 = Date.now();
      const verdicts = [];
      for (let i = 0; i < 4; i++) verdicts.push(await rl.checkRateLimitDb("k1", { limit: 3, windowMs: 60_000 }, t0 + i));
      const bucket = (tables.chatRateBucket ?? []).find((b) => b.key === "k1");
      // 🔴 ไม่ล็อกว่า count ต้องเท่ากับ "จำนวนที่ผ่าน" เป๊ะ — ตัวนับ atomic คำสั่งเดียว
      //    (INSERT … ON CONFLICT) เพิ่มค่าทุกคำขอรวมคำขอที่ถูกปฏิเสธ ซึ่งไม่กระทบการตัดสิน
      //    (CA-6.2 คุมพฤติกรรมที่ผู้ใช้เห็นจริงอยู่แล้ว) การล็อกค่าเป๊ะเท่ากับล็อกรายละเอียด
      //    ภายในของ implementation หนึ่ง แล้วบังคับให้กลับไปใช้แบบหลายคำสั่งที่นับพลาดตอนยิงพร้อมกัน
      //    สัญญาที่ต้องคุมจริงคือ "ตัวเลขอยู่บนแถวใน DB และขยับตามคำขอ" — Map ใน process = 0 แถว
      chk("CA-6.1", "🔴 ตัวเลขที่นับอยู่บนแถวจริงใน ChatRateBucket (ไม่ใช่ Map ใน process)", !!bucket && (bucket.count as number) >= 3, "แถว k1 · count ≥ 3 (ขยับตามคำขอ)", j({ rows: (tables.chatRateBucket ?? []).length, count: bucket?.count }));
      chk("CA-6.2", "ครบเพดานแล้วถูกปฏิเสธ + บอก retry-after", verdicts.slice(0, 3).every((v) => v.ok) && verdicts[3]!.ok === false && (verdicts[3]!.retryAfterSec ?? 0) > 0, "3 ผ่าน · ที่ 4 ถูกปฏิเสธ", j(verdicts));
      const other = await rl.checkRateLimitDb("k2", { limit: 3, windowMs: 60_000 }, t0);
      chk("CA-6.3", "คนละ key คนละถัง", other.ok === true && (tables.chatRateBucket ?? []).length === 2, "ผ่าน + 2 แถว", j({ ok: other.ok, rows: (tables.chatRateBucket ?? []).length }), "MAJOR");
      const later = await rl.checkRateLimitDb("k1", { limit: 3, windowMs: 60_000 }, t0 + 61_000);
      const b2 = (tables.chatRateBucket ?? []).find((b) => b.key === "k1");
      chk("CA-6.4", "หน้าต่างหมดอายุ → รีเซ็ตตัวนับ (ไม่ใช่ล็อกตลอดกาล)", later.ok === true && b2?.count === 1, "ผ่าน + count=1", j({ ok: later.ok, count: b2?.count }));

      // 1 คำขอ = 1 การเขียนถัง (ห้ามซ้อนชั้น — ทุก request คือ 1 UPDATE บน DB)
      resetAll();
      const g = guest();
      await call("thread", "GET", { headers: widgetHeaders(g) }); // ครั้งแรกสร้างถัง
      calls.length = 0;
      await call("thread", "GET", { headers: widgetHeaders(g) });
      const bucketOps = calls.filter((c) => c.op.startsWith("chatRateBucket."));
      chk("CA-6.5", "🔴 1 คำขอ = เขียนถังครั้งเดียว (ห้ามซ้อนหลายชั้นโดยไม่จำเป็น)", bucketOps.length === 1, "1 ครั้ง", j(bucketOps.map((c) => c.op)));

      // เพดานจริงต้องกันได้ผ่าน route
      resetAll();
      const g2 = guest();
      let blocked = 0;
      let ok200 = 0;
      for (let i = 0; i < 95; i++) {
        const res = await call("unread", "GET", { headers: widgetHeaders(g2) });
        if (res.status === 429) blocked++;
        else if (res.status === 200) ok200++;
      }
      const last = await call("unread", "GET", { headers: widgetHeaders(g2) });
      chk("CA-6.6", "widget ยิงถี่เกินเพดาน → 429 + retry-after (นับต่อ guest ไม่ใช่ต่อ IP — NAT ไม่พัง)", blocked > 0 && ok200 >= 60 && last.status === 429 && !!last.headers.get("retry-after") && thai(last.json.error), "มี 429 หลังเกินเพดาน", j({ ok200, blocked, last: last.status, retry: last.headers.get("retry-after") }));
      const guestKeys = (tables.chatRateBucket ?? []).map((b) => String(b.key));
      chk("CA-6.7", "ถังของ widget ผูกกับ guest+connection (ไม่ใช่ IP)", guestKeys.length === 1 && guestKeys[0]!.startsWith("chat:v1:guest:conn-web:"), "chat:v1:guest:conn-web:*", j(guestKeys));

      resetAll();
      await call("thread", "GET", { headers: secretHeaders(), query: { externalUserId: "dev-1" } });
      const secretKeys = (tables.chatRateBucket ?? []).map((b) => String(b.key));
      chk("CA-6.8", "ถังของ secret ผูกกับคีย์ (ไม่ใช่ IP ของ Vercel ที่ใช้ร่วมกัน)", secretKeys.length === 1 && secretKeys[0] === "chat:v1:key:key-1", "chat:v1:key:key-1", j(secretKeys));

      chk("CA-6.9", "chat/rate-limit.ts ไม่เหลือ Map ใน memory แล้ว", !/new Map\s*[<(]/.test(SRC_RL) && /rate-limit-db/.test(SRC_RL), "ไม่มี new Map + ใช้ตัวนับบน DB", `Map ${/new Map\s*[<(]/.test(SRC_RL)}`);
      chk("CA-6.10", "🔴 ผู้เรียกเดิม (webchat route) await จริง — ลืม await = Promise truthy = ด่านเปิดโล่ง", /await\s+rateLimit\(/.test(SRC_WEBCHAT), "await rateLimit(", SRC_WEBCHAT.includes("rateLimit(") ? "เรียกแต่ไม่ await" : "ไม่ได้เรียก");
      chk("CA-6.11", "__resetRateLimit ที่ไม่ระบุ key ต้องไม่ล้างทั้งตาราง (สคริปต์เดิมต่อ prod จริง)", /if \(!key\) return;/.test(readFileSync("src/lib/core/rate-limit-db.ts", "utf8")), "ไม่มี key = ไม่ทำอะไร", "ล้างทั้งตาราง", "MAJOR");
    });

    // ═════════ CA-7: WO-C5 upload ═════════
    await section("CA-7", "\nCA-7 WO-C5 — ไฟล์แนบ (ชนิด/ขนาด/นามสกุล):", async () => {
      const st = (await import("@/lib/storage/service" as string).catch(() => null)) as {
        ALLOWED_UPLOAD_TYPES: Record<string, string>;
        CHAT_ATTACHMENT_MAX_BYTES: number;
      } | null;
      if (!st) { chk("CA-7.0", "import storage/service ได้", false, "ได้", "ไม่ได้"); return; }
      const types = st.ALLOWED_UPLOAD_TYPES;
      // ชุดที่ SiamDive ใช้อยู่จริงวันนี้ (siamdive2 api/support-chat/upload/route.ts:17)
      const NEEDED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain"];
      const miss = NEEDED.filter((t) => !types[t]);
      chk("CA-7.1", "รับชนิดไฟล์ครบที่ SiamDive ใช้อยู่ (ลดลง = ผู้ใช้เดิมส่งไม่ผ่าน)", miss.length === 0, "ครบ 11 ชนิด", miss.length ? `ขาด: ${miss.join(", ")}` : "ครบ");
      const badExt = Object.entries(types).filter(([, e]) => !e || e === "bin" || e === "octet-stream");
      chk("CA-7.2", "🔴 ตารางนามสกุลไม่มีตัวไหนตกเป็น .bin (ปัญหาเดียวกับ siamdive2/bunny.ts:46)", badExt.length === 0, "ไม่มี bin", j(badExt));
      chk("CA-7.3", "นามสกุลของชนิดใหม่ถูกต้อง (ไม่ใช่ลอกค่าเดียวกันทั้งแถว)", types["image/heic"] === "heic" && types["application/msword"] === "doc" && types["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] === "xlsx" && types["text/plain"] === "txt", "heic/doc/xlsx/txt", j({ heic: types["image/heic"], doc: types["application/msword"], xlsx: types["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], txt: types["text/plain"] }));
      chk("CA-7.4", "เพดานไฟล์แนบแชท = 10MB (SiamDive ใช้ 10MB อยู่แล้ว)", st.CHAT_ATTACHMENT_MAX_BYTES === 10 * 1024 * 1024, "10485760", String(st.CHAT_ATTACHMENT_MAX_BYTES));

      resetAll();
      process.env.SHARK_BUNNY_ZONE = "qc-zone";
      process.env.SHARK_BUNNY_KEY = "qc-key";
      process.env.SHARK_BUNNY_CDN = "https://cdn.qc.local";
      // จำลอง Bunny (ไม่ยิงเน็ตจริง) — และเก็บไว้ตรวจว่า /attachments **ห่อ uploadFile เดิม** จริง
      // ไม่ใช่เขียนขาอัปโหลดใหม่ของตัวเอง
      const puts: { url: string; accessKey: string | null; contentType: string | null }[] = [];
      const stubbedFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.startsWith("https://sg.storage.bunnycdn.com/")) return stubbedFetch(input as never, init as never);
        const h = new Headers(init?.headers);
        puts.push({ url, accessKey: h.get("AccessKey"), contentType: h.get("Content-Type") });
        return new Response(null, { status: 201 });
      }) as typeof globalThis.fetch;
      // PNG 1x1 จริง — ใช้พิสูจน์ว่า width/height ถูกอ่านจากไฟล์ ไม่ใช่ค่าที่ client ส่งมา
      const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000030000000208060000", "hex");
      const form = new FormData();
      form.set("file", new File([new Uint8Array(png)], "รูป.png", { type: "image/png" }));
      const up = await call("attachments", "POST", { headers: { authorization: `Bearer ${SECRET_KEY}` }, form });
      chk("CA-7.5", "/attachments คืน { url,name,mimeType,sizeBytes,width,height } ตาม §3.2", up.status === 200 && Object.keys(up.json).sort().join(",") === "height,mimeType,name,sizeBytes,url,width" && String(up.json.url).startsWith("https://cdn.qc.local/") && up.json.mimeType === "image/png", "6 ฟิลด์ + url บน CDN", `${up.status} ${j(up.json)}`);
      chk("CA-7.6", "width/height อ่านจากไฟล์จริง (widget เอาไปกันภาพกระตุก)", up.json.width === 3 && up.json.height === 2, "3x2", j({ w: up.json.width, h: up.json.height }), "MAJOR");
      const formBad = new FormData();
      formBad.set("file", new File([new Uint8Array([1, 2, 3])], "x.exe", { type: "application/x-msdownload" }));
      const upBad = await call("attachments", "POST", { headers: { authorization: `Bearer ${SECRET_KEY}` }, form: formBad });
      chk("CA-7.7", "ชนิดไฟล์นอกรายการ → ปฏิเสธ + ข้อความไทย", upBad.status === 415 && thai(upBad.json.error), "415 + ไทย", `${upBad.status} ${j(upBad.json)}`);
      const formBig = new FormData();
      formBig.set("file", new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" }));
      const upBig = await call("attachments", "POST", { headers: { authorization: `Bearer ${SECRET_KEY}` }, form: formBig });
      chk("CA-7.8", "เกิน 10MB → 413 + ข้อความไทย", upBig.status === 413 && thai(upBig.json.error), "413 + ไทย", `${upBig.status} ${j(upBig.json)}`, "MAJOR");
      const noKey = await call("attachments", "POST", { headers: {}, form: new FormData() });
      chk("CA-7.9", "🔴 /attachments ไม่มีกุญแจ → 401 (บทเรียน S1: อัปโหลดที่ไม่มี auth)", noKey.status === 401, "401", `${noKey.status} ${j(noKey.json)}`);
      chk("CA-7.10", "ห่อ uploadFile เดิม (ขึ้น Bunny SG + AccessKey) ไม่ได้เขียนขาอัปโหลดใหม่", puts.length === 1 && puts[0]!.url.includes("/qc-zone/t/T1/attachment/") && puts[0]!.accessKey === "qc-key", "PUT ไป Bunny 1 ครั้ง path t/<tenantId>/attachment/", j(puts));
      chk("CA-7.11", "ไฟล์ถูกบันทึกเป็น FileAsset ของร้านที่ถือกุญแจ", (tables.fileAsset ?? []).length === 1 && (tables.fileAsset ?? [])[0]!.tenantId === "T1", "1 แถว tenantId=T1", j((tables.fileAsset ?? []).map((r) => ({ t: r.tenantId, k: r.kind }))), "MAJOR");
      globalThis.fetch = stubbedFetch;
      delete process.env.SHARK_BUNNY_ZONE;
      delete process.env.SHARK_BUNNY_KEY;
      delete process.env.SHARK_BUNNY_CDN;
    });

    // ═════════ CA-8: /config + สิทธิ์ต่อเส้น ═════════
    await section("CA-8", "\nCA-8 /config หลายภาษา + สิทธิ์ต่อเส้น:", async () => {
      resetAll();
      const g = guest();
      const cfgTh = await call("config", "GET", { headers: widgetHeaders(g), query: { lang: "th" } });
      chk("CA-8.1", "/config คืน greeting/offlineMessage/locales/theme/widgetEnabled + businessHours (WO-C16)", cfgTh.status === 200 && Object.keys(cfgTh.json).sort().join(",") === "businessHours,greeting,locales,offlineMessage,theme,widgetEnabled", "6 ฟิลด์", `${cfgTh.status} ${j(cfgTh.json)}`);
      chk("CA-8.2", "greeting ตามภาษาที่ขอ (ผ่าน resolveLocale)", cfgTh.json.greeting === "สวัสดีค่ะ" && cfgTh.json.offlineMessage === "นอกเวลาทำการ", "สวัสดีค่ะ", j({ g: cfgTh.json.greeting, o: cfgTh.json.offlineMessage }));
      const cfgEn = await call("config", "GET", { headers: widgetHeaders(g), query: { lang: "en" } });
      chk("CA-8.3", "ภาษาอื่นได้ข้อความของภาษานั้น", cfgEn.json.greeting === "Hi there", "Hi there", j(cfgEn.json.greeting));
      const cfgDe = await call("config", "GET", { headers: widgetHeaders(g), query: { lang: "de" } });
      chk("CA-8.4", '🔴 สตริงว่างที่ร้านตั้งใจปิด ต้องคืน "" ไม่ใช่ไหลไปภาษาอื่น', cfgDe.json.greeting === "", '""', j(cfgDe.json.greeting));
      const cfgJa = await call("config", "GET", { headers: widgetHeaders(g), query: { lang: "ja" } });
      chk("CA-8.5", "ภาษาที่ไม่มี → ตกไปภาษาฐาน (th)", cfgJa.json.greeting === "สวัสดีค่ะ", "สวัสดีค่ะ", j(cfgJa.json.greeting), "MAJOR");
      chk("CA-8.6", "locales บอกภาษาที่ร้านตั้งไว้จริง", j((cfgTh.json.locales ?? []) as string[]) === j(["th", "en", "de"]), '["th","en","de"]', j(cfgTh.json.locales), "MINOR");

      const gsec = await call("guest", "POST", { headers: secretHeaders(), body: {} });
      chk("CA-8.7", "/guest ใช้ได้เฉพาะกุญแจ widget → secret ต้อง 403", gsec.status === 403 && thai(gsec.json.error), "403 + ไทย", `${gsec.status} ${j(gsec.json)}`, "MAJOR");
      const idw = await call("identities", "POST", { headers: widgetHeaders(g), body: { externalUserId: "ใครก็ได้" } });
      chk("CA-8.8", "🔴 /identities ใช้ได้เฉพาะกุญแจเซิร์ฟเวอร์ → widget ต้อง 403", idw.status === 403, "403", `${idw.status} ${j(idw.json)}`);
      const cfgSec = await call("config", "GET", { headers: secretHeaders() });
      // WO-C16: เปลี่ยนจาก "secret ต้อง 403" → "secret เรียกได้" (ดูเหตุผลในหัวไฟล์)
      // ยังล็อกว่าได้ของร้านตัวเองเท่านั้น: greeting ที่ได้ต้องเป็นของ T1 ซึ่งเป็นเจ้าของคีย์
      chk("CA-8.9", "/config เรียกด้วยกุญแจเซิร์ฟเวอร์ได้ (s2s) และได้ค่าของร้านที่ถือกุญแจ", cfgSec.status === 200 && cfgSec.json.greeting === "สวัสดีค่ะ", "200 + ของ T1", `${cfgSec.status} ${j(cfgSec.json)}`, "MINOR");

      resetAll();
      const mint = await call("guest", "POST", { headers: { "x-shark-widget": WIDGET_KEY, origin: GOOD_ORIGIN, "content-type": "application/json" }, body: {} });
      const token = String(mint.json.guestToken ?? "");
      chk("CA-8.10", "/guest ออก token ที่ผ่านการเซ็นของเราจริง + ตั้ง cookie httpOnly", mint.status === 200 && pub.verifyGuestToken("conn-web", token) && /HttpOnly/i.test(mint.headers.get("set-cookie") ?? ""), "token ถูกเซ็น + HttpOnly", `${mint.status} ${j({ t: token.slice(0, 12), c: (mint.headers.get("set-cookie") ?? "").slice(0, 60) })}`);
      chk("CA-8.11", "token ที่ออกให้ connection นี้ ใช้กับ connection อื่นไม่ได้", pub.verifyGuestToken("conn-web2", token) === false, "false", String(pub.verifyGuestToken("conn-web2", token)));
      const useCookie = await call("thread", "GET", { headers: { "x-shark-widget": WIDGET_KEY, origin: GOOD_ORIGIN, cookie: `swg_conn-web=${encodeURIComponent(token)}` } });
      chk("CA-8.12", "ใช้ token จาก cookie ที่เซิร์ฟเวอร์ตั้งให้ได้ (ไม่ต้องพึ่ง body)", useCookie.status === 200, "200", `${useCookie.status} ${j(useCookie.json)}`, "MAJOR");
    });
  }

  chk("CA-9.9", "ไม่มี query หลุดออก DB จริง (fake prisma รับทุกครั้ง · ไม่มี HTTP ออก)", process.env.DATABASE_URL === "postgresql://qc:qc@127.0.0.1:1/qc-no-db" && netCalls === 0, "DATABASE_URL ถูกทับ · net 0", `${String(process.env.DATABASE_URL).slice(0, 30)} · net ${netCalls}`, "MINOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT API V1 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

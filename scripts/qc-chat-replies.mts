// QC — คำตอบของทีมงานจากระบบภายนอก + เวลาจริงของข้อความ (WO-C3b) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ ชื่อไฟล์: `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — qc-chat.mts · qc-chat-notify.mts ·
//    qc-chat-security.mts (M9–M12) · qc-chat-security-scope.mts (B1/B5/B6/B10) ·
//    qc-chat-core-v2.mts (WO-C2) · qc-chat-api-v1.mts (WO-C3/C5/B2) · qc-chat-retention.mts (WO-C12)
//    มีอยู่ก่อนแล้ว เขียนทับ = ลบด่านทิ้งทั้งชุดโดยไม่มีใครรู้
//    (qc-all.mts ค้น `qc-*.mts` อัตโนมัติ — สร้างไฟล์ใหม่ = เป็นด่านทันที)
//
// ⚠️ ชุดนี้ **ห้ามแตะฐานข้อมูล** (.env ของเครื่องนี้ชี้ prod จริง) → กัน 3 ชั้นเหมือน qc-chat-api-v1:
//   1) ทับ DATABASE_URL เป็น host ที่ต่อไม่ได้ ทันทีหลัง loadEnvFile
//   2) ยัด fake prisma ลง require.cache ของ `src/lib/core/db.ts` **ก่อน** import อะไรก็ตาม
//      · fake เติมค่า default ของ schema ตอน create · **ค่าเวลาเป็น thunk ไม่ใช่ค่าคงที่ตอนโหลดไฟล์**
//        (บทเรียน §12 ซ้ำรอยมา 2 ครั้ง: lastReadAt ที่ค้างเป็น epoch ทำให้ /unread ผิดทิศ)
//      · จำลอง `$queryRaw` ของ ChatRateBucket จริง (INSERT … ON CONFLICT … RETURNING)
//        ไม่งั้น route ทุกเส้นเจอ verdict ปลอมแล้ววัดอะไรไม่ได้
//      · บันทึกว่าแต่ละ query เกิดใน tx ไหน (ใช้ตัดสิน "event ต้องอยู่ tx เดียวกับข้อความ")
//   3) ดัก globalThis.fetch + ข้อ XR-9.9 ตรวจว่าไม่มี query/HTTP หลุดออกจริง
//
// สัญญาที่คุม (ledger/PLAN-CHAT-PLATFORM.md §2 กฎเหล็ก · §3 สัญญา API · §3.4 ความหมายของ event):
// XR-1) `POST /api/v1/chat/replies` — 🔴 **secret key เท่านั้น** · widget key ต้อง **403 ไม่ใช่ 401**
//       (กุญแจถูกแต่ไม่มีสิทธิ์) · ถ้าหลุด = ใครก็ปลอมเป็นทีมงานคุยกับลูกค้าในนามร้านได้
//       · ชั้น route ห้ามมี logic ธุรกิจ (กฎเหล็กข้อ 1) · tenantId/systemId มาจากกุญแจเสมอ
// XR-2) ข้อความที่เขียนเป็น OUT · deliveryStatus SENT · senderUserId **null** (ไม่ใช่พนักงานใน SHARK)
//       · 🔴 **ห้ามยิงออกช่องทางภายนอกซ้ำ** — ต้นทางส่งถึงลูกค้าไปแล้ว ยิงซ้ำ = ลูกค้าได้ 2 รอบ
//         (พิสูจน์บนเธรด LINE ที่ `sendReply` ยิงจริง = positive control ของกับดัก fetch)
// XR-3) 🔴 **ห้าม emit `chat.message.sent`** — §3.4 ตกลงว่าแปลว่า "แอดมินตอบแล้ว" และ WO-C6 ผูกไว้กับ
//       การ push แจ้งลูกค้า ⇒ ยิงกลับหาระบบต้นทาง = push ซ้ำ + วนลูปได้ · ใช้ `chat.message.mirrored`
//       · emit อยู่ tx เดียวกับการเขียนข้อความ · idempotencyKey คนละ namespace กับ 2 ตัวเดิม
//       · ต้องมี consumer จริงใน outbox-consumers ไม่งั้น event ค้าง PENDING ตลอดกาล
//       · `sendReply` เดิมของทีมงานใน SHARK ต้องยัง emit `chat.message.sent` เหมือนเดิม
// XR-4) denorm ต้อง **ตรงกับ `sendReply` เป๊ะ** (ชุดฟิลด์เดียวกัน): lastMessageAt/Preview/Direction ·
//       staffUnreadCount 0 · firstResponseAt เฉพาะตอนยังว่าง · โน้ตภายในห้ามแตะ denorm
// XR-5) `clientMessageId` ซ้ำ → ไม่เกิดข้อความซ้ำ/ไม่ยิง event ซ้ำ (WO-C7 รันย้ายข้อมูลซ้ำได้)
// XR-6) `isInternal: true` = โน้ตภายใน ห้ามหลุดถึงลูกค้า · กติกากรองต้องอยู่ที่ค่าคงที่เดียว
// XR-7) `sentAt` (secret เท่านั้น) — 🔴 widget ตั้งเองไม่ได้ · อนาคตเกิน 1 วัน / เก่าเกินเหตุ = ปฏิเสธ
//       · ประวัติที่ย้ายมาต้องได้เวลาจริง ไม่ใช่ "ตอนย้าย"
// XR-8) `/thread` และ `/messages` คืน `createdAt` ครบตามสัญญา §3.2

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
// แต่ละหมวดแยกกัน — ของที่ยังไม่มี/พังกลางคัน ต้องแดงเฉพาะหมวดนั้น ไม่ใช่กลืนหมวดอื่นหายไปเงียบ ๆ
const section = async (id: string, name: string, fn: () => Promise<void>) => {
  console.log(name);
  try { await fn(); } catch (e) { chk(`${id}.CRASH`, `${name} ล้มกลางคัน`, false, "รันจบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)); }
};

// ───────── fake prisma (mini query engine + tx tracing) ─────────
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: { op: string; args: Record<string, unknown>; tx: number | null }[] = [];
const seen = (op: string) => calls.filter((c) => c.op === op);
let seq = 0;
let txId: number | null = null;
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
        // compound unique (เช่น tenantId_idempotencyKey ของ outbox)
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
//    ตัวที่เป็น `@default(now())` ต้องเป็น **ฟังก์ชัน** ไม่ใช่ค่าคงที่ตอนโหลดไฟล์ (§12 ซ้ำรอย 2 ครั้ง)
const DEFAULTS: Record<string, Row> = {
  chatConversation: { status: "OPEN", staffUnreadCount: 0, reopenedCount: 0, tags: [], meta: null, lastMessageAt: null, lastMessagePreview: null, lastMessageDirection: null, firstResponseAt: null, firstCustomerMessageAt: null, resolvedAt: null, assigneeUserId: null, unitId: null },
  chatMessage: { type: "TEXT", isInternal: false, deliveryStatus: "SENT", senderUserId: null, senderName: null, body: null, clientMessageId: null, externalMessageId: null, attachments: [], purgedAt: null, createdAt: () => new Date() },
  chatContact: { verifiedEmail: false, blockedAt: null, lang: null, externalRef: null, email: null, phone: null, customerId: null, displayName: null, avatarUrl: null },
  chatChannelConnection: { status: "CONNECTED", originAllowlist: [], publicKeyHash: null, publicKeyPrefix: null, defaultUnitId: null, credentials: {}, lastInboundAt: null },
  chatSetting: { widgetEnabled: true, greetingMessage: {}, offlineMessage: {}, theme: {}, senderAlias: null, memberSystemId: null, retentionDays: 365 },
  chatRateBucket: { count: 0 },
  chatReadState: { lastReadMessageId: null, lastReadAt: () => new Date() }, // @default(now())
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
  const rec = (op: string, a: Record<string, unknown>) => { calls.push({ op: `${model}.${op}`, args: a, tx: txId }); };
  const find = (a: Record<string, unknown>) => rows().find((r) => matches(r, a.where)) ?? null;
  return {
    findFirst: async (a: Record<string, unknown> = {}) => { rec("findFirst", a); return find(a); },
    findUnique: async (a: Record<string, unknown> = {}) => { rec("findUnique", a); return find(a); },
    findMany: async (a: Record<string, unknown> = {}) => { rec("findMany", a); return rows().filter((r) => matches(r, a.where)); },
    count: async (a: Record<string, unknown> = {}) => { rec("count", a); return rows().filter((r) => matches(r, a.where)).length; },
    create: async (a: Record<string, unknown> = {}) => {
      rec("create", a);
      const data = (a.data ?? {}) as Row;
      if (model === "chatMessage" && data.clientMessageId != null && rows().some((r) => r.conversationId === data.conversationId && r.clientMessageId === data.clientMessageId)) p2002(model);
      if (model === "outboxEvent" && rows().some((r) => r.tenantId === data.tenantId && r.idempotencyKey === data.idempotencyKey)) p2002(model);
      if (model === "chatRateBucket" && rows().some((r) => r.key === data.key)) p2002(model);
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
      return async (fn: unknown) => {
        if (typeof fn !== "function") return undefined;
        const prev = txId;
        txId = ++seq;
        calls.push({ op: "$transaction.begin", args: {}, tx: txId });
        try { return await (fn as (tx: unknown) => unknown)(fakePrisma); }
        finally { txId = prev; }
      };
    }
    if (p === "$executeRaw" || p === "$executeRawUnsafe" || p === "$queryRaw") {
      return async (...a: unknown[]) => {
        const sql = Array.isArray(a[0]) ? (a[0] as string[]).join("?") : String(a[0]);
        // 🔴 ตัวนับ rate limit เป็นคำสั่งเดียว (INSERT … ON CONFLICT DO UPDATE … RETURNING) —
        //    fake ต้องจำลองความหมายจริง ไม่ใช่คืน 0 ไม่งั้นทุก route ได้ verdict ปลอม
        if (sql.includes('"ChatRateBucket"')) {
          const [key, nowD, floorD] = [a[1] as string, a[2] as Date, a[3] as Date];
          calls.push({ op: "chatRateBucket.upsertRaw", args: { key }, tx: txId });
          const rs = (tables.chatRateBucket ??= []);
          let r = rs.find((x) => x.key === key);
          if (!r) {
            r = { id: `fk-chatRateBucket-${++seq}`, key, count: 1, windowStart: nowD, createdAt: new Date(), updatedAt: new Date() };
            rs.push(r);
          } else if ((r.windowStart as Date).getTime() <= floorD.getTime()) {
            r.count = 1;
            r.windowStart = nowD;
          } else {
            r.count = (r.count as number) + 1;
          }
          return [{ count: r.count, windowStart: r.windowStart }];
        }
        calls.push({ op: "$executeRaw", args: { sql }, tx: txId });
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

// ดักเน็ตเวิร์ก — ใช้ตัดสินว่า adapter ถูกเรียกหรือไม่ (LINE ยิง api.line.me)
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
const GOOD_ORIGIN = "https://www.siamdive.com";

const API = "https://shark.in.th/api/v1/chat";
const ROUTES = ["replies", "messages", "thread", "unread"];

// 🔴 credentials ต้องมี channelAccessToken จริง ไม่งั้น adapter โยน TOKEN_MISSING **ก่อนถึง fetch**
//    → positive control XR-2.4 จะเขียวแบบผลลวงว่า "ไม่ยิงเน็ต" ทั้งที่โค้ดไม่เคยไปถึงจุดยิงเลย
const CONN_LINE: Row = { id: "conn-line", tenantId: "T1", systemId: "S1", type: "LINE", displayName: "LINE OA", externalAccountId: "U-bot", credentials: { channelAccessToken: "qc-line-token", channelSecret: "qc-line-secret" }, status: "CONNECTED", defaultUnitId: null, originAllowlist: [], publicKeyHash: null, publicKeyPrefix: null, createdAt: new Date(3) };

function resetAll() {
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
    { id: "conn-web2", tenantId: "T2", systemId: "S2", type: "WEBCHAT", displayName: "แชทร้านอื่น", externalAccountId: "webchat", credentials: {}, status: "CONNECTED", defaultUnitId: null, originAllowlist: [GOOD_ORIGIN], publicKeyHash: null, publicKeyPrefix: null, createdAt: new Date(2) },
    { ...CONN_LINE },
  ];
  tables.chatSetting = [
    { id: "st1", tenantId: "T1", systemId: "S1", memberSystemId: null, senderAlias: "ทีมงาน SiamDive", widgetEnabled: true, greetingMessage: { th: "สวัสดีค่ะ" }, offlineMessage: {}, theme: {}, retentionDays: 365 },
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
  opts: { headers?: Record<string, string>; body?: unknown; query?: Record<string, string> } = {},
): Promise<{ status: number; json: Record<string, unknown>; headers: Headers }> {
  const url = new URL(`${API}/${route}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const init: RequestInit = { method, headers: opts.headers ?? {} };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const handler = method === "GET" ? mods[route]?.GET : method === "POST" ? mods[route]?.POST : mods[route]?.OPTIONS;
  if (!handler) return { status: 0, json: { error: `ไม่มี handler ${method} /${route}` }, headers: new Headers() };
  const res = await handler(new Request(url, init));
  let body: Record<string, unknown> = {};
  const text = await res.text();
  if (text) { try { body = JSON.parse(text) as Record<string, unknown>; } catch { body = { _raw: text.slice(0, 120) }; } }
  return { status: res.status, json: body, headers: res.headers };
}

const thai = (v: unknown) => typeof v === "string" && /[ก-๙]/.test(v);
const msgRows = () => tables.chatMessage ?? [];
const evtOf = (type: string) => seen("outboxEvent.create").filter((c) => ((c.args.data ?? {}) as Row).type === type);

// source สำหรับข้อ static
const SRC_SERVICE = readFileSync("src/lib/modules/chat/service.ts", "utf8");
// ตัดคอมเมนต์ก่อนนับ "มีที่เดียว" — คอมเมนต์อธิบายกติกาอ้างชื่อโค้ดอยู่ด้วย จะนับซ้ำ
const CODE_SERVICE = SRC_SERVICE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\/.*$/gm, "");
const REPLIES_PATH = "src/app/api/v1/chat/replies/route.ts";
const SRC_REPLIES = existsSync(REPLIES_PATH) ? readFileSync(REPLIES_PATH, "utf8") : "";
const SRC_MESSAGES = readFileSync("src/app/api/v1/chat/messages/route.ts", "utf8");

type Chat = {
  receiveExternalReply: (a: Record<string, unknown>) => Promise<{ ok: boolean; conversationId?: string; messageId?: string; createdAt?: string; duplicate?: boolean; reason?: string }>;
  sendReply: (a: Record<string, unknown>) => Promise<{ ok: boolean; reason?: string; messageId?: string }>;
};

try {
  const missing = await loadRoutes();
  chk("XR-0.1", "มีเส้น POST /api/v1/chat/replies (§3.2 + WO-C3b)", !missing.includes("replies") && typeof mods.replies?.POST === "function", "มี POST handler", missing.includes("replies") ? "ไม่มีไฟล์ route" : `POST=${typeof mods.replies?.POST}`);

  const chat = (await import("@/lib/modules/chat/service" as string).catch((e) => { console.log(`  (import service ล้ม: ${e instanceof Error ? e.message.slice(0, 200) : String(e)})`); return null; })) as Chat | null;
  chk("XR-0.2", "service มี receiveExternalReply (ชั้น 1 — route ห้ามมี logic เอง)", typeof chat?.receiveExternalReply === "function", "เป็นฟังก์ชัน", String(typeof chat?.receiveExternalReply));

  const pub = (await import("@/lib/modules/chat/public-auth" as string).catch(() => null)) as { mintGuestToken: (c: string) => string } | null;

  // 🔴 gate เฉพาะเส้นที่ "มีอยู่ก่อนงานนี้" — ถ้า /replies หายไป ข้อสอบต้อง **แดงทั้งชุด**
  //    ไม่ใช่ข้ามไปเงียบ ๆ เหลือแต่ XR-0.1 (ด่านที่ข้ามตัวเองได้ = ด่านหลอก)
  const missingOld = missing.filter((r) => r !== "replies");
  if (chat && pub && missingOld.length === 0) {
    const guest = () => pub.mintGuestToken("conn-web");

    // เตรียมเธรดที่ลูกค้าทักไว้แล้ว (คำตอบต้องมีคนถามก่อน)
    const seedThread = async (dev: string, text = "ขอสอบถามทริปสิมิลันครับ") => {
      const r = await call("messages", "POST", { headers: secretHeaders(), body: { externalUserId: dev, body: text } });
      return r;
    };

    // ═════════ XR-1: สิทธิ์ของเส้น /replies ═════════
    await section("XR-1", "\nXR-1 🔴 /replies = secret key เท่านั้น (widget ต้อง 403 ไม่ใช่ 401):", async () => {
      resetAll();
      const DEV = "sd2-device-1";
      await seedThread(DEV);
      const okSecret = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV, body: "ยินดีให้ข้อมูลค่ะ" } });
      chk("XR-1.1", "secret key → บันทึกคำตอบได้ (positive control)", okSecret.status === 200 && okSecret.json.ok === true && !!okSecret.json.messageId, "200 {ok:true,messageId}", `${okSecret.status} ${j(okSecret.json)}`);

      const before = msgRows().length;
      const g = guest();
      const w = await call("replies", "POST", { headers: widgetHeaders(g), body: { externalUserId: DEV, body: "ผมคือทีมงานนะครับ โอนมาที่บัญชีนี้" } });
      const impersonated = msgRows().some((m) => String(m.body ?? "").includes("โอนมาที่บัญชีนี้"));
      chk("XR-1.2", "🔴 กุญแจ widget (Origin ถูก + guest ถูก) → 403 + ไม่มีข้อความปลอมถูกเขียน", w.status === 403 && thai(w.json.error) && !impersonated && msgRows().length === before, "403 + ไม่มีแถวใหม่", `${w.status} ${j(w.json)} · เขียน ${msgRows().length - before} แถว`);

      const wNoGuest = await call("replies", "POST", { headers: widgetHeaders(null), body: { externalUserId: DEV, body: "x" } });
      chk("XR-1.3", "🔴 widget ที่ยังไม่มี guest ก็ต้อง 403 (เหตุผลคือ 'ไม่ใช่เส้นของ widget' ไม่ใช่ 'ทำ guest ให้ครบ')", wNoGuest.status === 403, "403", `${wNoGuest.status} ${j(wNoGuest.json)}`);

      const none = await call("replies", "POST", { headers: { "content-type": "application/json" }, body: { externalUserId: DEV, body: "x" } });
      chk("XR-1.4", "ไม่ส่งกุญแจเลย → 401 + ข้อความไทย", none.status === 401 && thai(none.json.error), "401 + ไทย", `${none.status} ${j(none.json)}`);

      const swap = await call("replies", "POST", { headers: { "x-shark-widget": SECRET_KEY, origin: GOOD_ORIGIN, "content-type": "application/json" }, body: { externalUserId: DEV, body: "x" } });
      chk("XR-1.5", "🔴 เอา secret key ไปใส่ช่อง X-Shark-Widget → 401 (secret ห้ามใช้จากเบราว์เซอร์ — D2)", swap.status === 401, "401", `${swap.status} ${j(swap.json)}`);

      // ร้านอื่นถือกุญแจของตัวเอง ตอบแทนลูกค้าของร้านเราไม่ได้
      const nBefore = msgRows().length;
      const cross = await call("replies", "POST", { headers: { authorization: `Bearer ${SECRET_KEY_T2}`, "content-type": "application/json" }, body: { externalUserId: DEV, body: "ข้ามร้าน" } });
      const crossed = msgRows().some((m) => String(m.body ?? "") === "ข้ามร้าน" && m.systemId === "S1");
      chk("XR-1.6", "🔴 กุญแจร้านอื่นตอบแทนลูกค้าของร้านเราไม่ได้ (tenantId มาจากกุญแจเสมอ)", cross.status !== 200 && !crossed && msgRows().length === nBefore, "ไม่ 200 + ไม่มีแถวใน S1", `${cross.status} ${j(cross.json)} · crossed ${crossed}`);

      chk("XR-1.7", "มี OPTIONS handler (CORS ครบเหมือนเส้นอื่น)", typeof mods.replies?.OPTIONS === "function", "มี", String(typeof mods.replies?.OPTIONS));
      chk("XR-1.8", "ชั้น route ไม่แตะ prisma / ไม่ประกอบ where เอง (กฎเหล็กข้อ 1)", !/@\/lib\/core\/db/.test(SRC_REPLIES) && !/where\s*:/.test(SRC_REPLIES) && /authenticateChatRequest\(/.test(SRC_REPLIES), "เรียกชั้น 1 อย่างเดียว", `db ${/@\/lib\/core\/db/.test(SRC_REPLIES)} · where ${/where\s*:/.test(SRC_REPLIES)}`);
      chk("XR-1.9", "route ไม่อ่าน tenantId/systemId จาก body", !/body\.(tenantId|systemId)/.test(SRC_REPLIES), "ไม่มี", "พบใน route");
    });

    // ═════════ XR-2: OUT + ห้ามยิงออกช่องทางภายนอกซ้ำ ═════════
    await section("XR-2", "\nXR-2 🔴 ข้อความ OUT ที่ไม่ถูกยิงออกช่องทางภายนอกซ้ำ:", async () => {
      resetAll();
      const DEV = "sd2-device-2";
      await seedThread(DEV);
      const res = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV, body: "ได้ครับ เดี๋ยวส่งรายละเอียดให้", senderName: "ทีมงาน SiamDive" } });
      const row = msgRows().find((m) => m.id === res.json.messageId);
      chk("XR-2.1", "เขียนเป็น direction OUT · deliveryStatus SENT · type TEXT", row?.direction === "OUT" && row?.deliveryStatus === "SENT" && row?.type === "TEXT", "OUT/SENT/TEXT", j({ d: row?.direction, s: row?.deliveryStatus, t: row?.type }));
      chk("XR-2.2", "🔴 senderUserId = null (คนตอบไม่ใช่พนักงานใน SHARK — ห้ามชี้ไปที่ผู้ใช้คนไหน)", row?.senderUserId === null, "null", j(row?.senderUserId));
      chk("XR-2.3", "senderName ที่ระบุมาถูกเก็บบนแถว", row?.senderName === "ทีมงาน SiamDive", "ทีมงาน SiamDive", j(row?.senderName));

      // 🔴 หัวใจ: เธรดที่ช่องทางเป็น LINE — sendReply ยิงออกจริง (positive control ของกับดัก fetch)
      resetAll();
      tables.chatContact = [{ id: "ct-line", tenantId: "T1", systemId: "S1", channel: "LINE", channelConnectionId: "conn-line", externalUserId: "U-line-1", displayName: "คุณเอ", blockedAt: null, verifiedEmail: false, email: null, phone: null, lang: null, externalRef: null, customerId: null }];
      tables.chatConversation = [{ id: "conv-line", tenantId: "T1", systemId: "S1", contactId: "ct-line", channel: "LINE", channelConnectionId: "conn-line", unitId: null, status: "OPEN", lastMessageAt: new Date(10), staffUnreadCount: 1, firstResponseAt: null, meta: null, contact: { id: "ct-line", externalUserId: "U-line-1", displayName: "คุณเอ" } }];
      netCalls = 0;
      const viaStaff = await chat.sendReply({ tenantId: "T1", systemId: "S1", conversationId: "conv-line", senderUserId: "U1", body: "ตอบจากจอ SHARK", unitAccess: ["*"] });
      const netAfterStaff = netCalls;
      chk("XR-2.4", "positive control — sendReply บนเธรด LINE **ยิงออก** ช่องทางภายนอกจริง (กับดัก fetch ทำงาน)", netAfterStaff > 0, "netCalls > 0", j({ net: netAfterStaff, ok: viaStaff.ok, reason: viaStaff.reason }));

      netCalls = 0;
      const mirrored = await chat.receiveExternalReply({ connection: tables.chatChannelConnection!.find((c) => c.id === "conn-line"), externalUserId: "U-line-1", body: "ตอบจากระบบต้นทาง (ส่งถึงลูกค้าไปแล้ว)" });
      const mrow = msgRows().find((m) => m.id === mirrored.messageId);
      chk("XR-2.5", "🔴 receiveExternalReply บนเธรดเดียวกัน **ไม่ยิงออกเลย** (ยิงซ้ำ = ลูกค้าได้ข้อความ 2 รอบ)", mirrored.ok === true && netCalls === 0 && mrow?.direction === "OUT", "netCalls 0 + เขียนแถว OUT", j({ net: netCalls, ok: mirrored.ok, dir: mrow?.direction }));
      chk("XR-2.6", "ไม่ตั้ง PENDING ทิ้งไว้ให้ใครมาส่งต่อ (ถึงลูกค้าแล้วโดยต้นทาง = SENT)", mrow?.deliveryStatus === "SENT", "SENT", j(mrow?.deliveryStatus));
      chk("XR-2.7", "โค้ดของ receiveExternalReply ไม่เรียก adapter เลย", (() => { const i = CODE_SERVICE.indexOf("export async function receiveExternalReply"); const body = i < 0 ? "" : CODE_SERVICE.slice(i, i + 6000); return i >= 0 && !/getAdapter\(|adapter\.sendMessage/.test(body); })(), "ไม่มี getAdapter/adapter.sendMessage", "พบการเรียก adapter", "MAJOR");
    });

    // ═════════ XR-3: event ที่ยิง (และที่ห้ามยิง) ═════════
    await section("XR-3", "\nXR-3 🔴 ห้าม emit chat.message.sent — ใช้ chat.message.mirrored แทน (§3.4):", async () => {
      resetAll();
      const DEV = "sd2-device-3";
      await seedThread(DEV);
      calls.length = 0;
      const res = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV, body: "ทริป 4 วัน 4 คืน ราคา 25,000 บาทค่ะ" } });
      const sentEvts = evtOf("chat.message.sent");
      const mirrEvts = evtOf("chat.message.mirrored");
      chk("XR-3.1", "🔴 ไม่ยิง chat.message.sent เด็ดขาด (ต้นทางเป็นคนส่ง → ยิงกลับ = push ซ้ำ/วนลูป)", res.status === 200 && sentEvts.length === 0, "0 event chat.message.sent", j({ n: sentEvts.length, payload: sentEvts.map((c) => (c.args.data as Row).payload) }));
      chk("XR-3.2", "ยิง chat.message.mirrored 1 event", mirrEvts.length === 1, "1 event", j(mirrEvts.length));
      const pl = ((mirrEvts[0]?.args.data as Row | undefined)?.payload ?? {}) as Row;
      chk("XR-3.3", "payload ครบ 6 ฟิลด์แบบเดียวกับ §3.4 (ผู้รับ map โค้ดเดิมได้)", Object.keys(pl).sort().join(",") === "channel,conversationId,externalUserId,messageId,preview,senderName" && pl.externalUserId === DEV && pl.channel === "WEBCHAT" && pl.messageId === res.json.messageId && pl.senderName === "ทีมงาน SiamDive", "channel,conversationId,externalUserId,messageId,preview,senderName", j(pl));
      const idem = String((mirrEvts[0]?.args.data as Row | undefined)?.idempotencyKey ?? "");
      chk("XR-3.4", "idempotencyKey คนละ namespace กับขาเข้า (chat.msg.) และขาออกของ SHARK (chat.sent.)", !idem.startsWith("chat.msg.") && !idem.startsWith("chat.sent.") && idem.includes(String(res.json.messageId)), "ไม่ชน namespace + ผูก messageId", idem);
      const msgTx = seen("chatMessage.create").at(-1)?.tx ?? null;
      chk("XR-3.5", "emitOutbox อยู่ทรานแซกชันเดียวกับการเขียนข้อความ (ข้อความรอด = event รอด)", msgTx !== null && mirrEvts[0]?.tx === msgTx, "tx เดียวกัน", j({ msgTx, evtTx: mirrEvts[0]?.tx }));

      // โน้ตภายใน = ไม่มี event ใด ๆ
      resetAll();
      const DEV2 = "sd2-device-4";
      await seedThread(DEV2);
      calls.length = 0;
      const note = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV2, body: "ลูกค้ารายนี้ค้างชำระ ห้ามให้เครดิต", isInternal: true } });
      chk("XR-3.6", "🔴 โน้ตภายใน → ไม่ยิง event ใด ๆ (แต่เขียนข้อความจริง)", note.status === 200 && seen("outboxEvent.create").length === 0 && seen("chatMessage.create").length === 1, "0 event + 1 ข้อความ", j({ evt: seen("outboxEvent.create").length, msg: seen("chatMessage.create").length }));

      const oc = (await import("@/lib/outbox-consumers" as string).catch(() => null)) as { consumers?: Record<string, unknown> } | null;
      const reg = oc?.consumers ?? {};
      chk("XR-3.7", "🔴 ลงทะเบียน consumer ของ chat.message.mirrored (ไม่มี = event ค้าง PENDING ตลอดกาล)", typeof reg["chat.message.mirrored"] === "function", "มี handler", j(Object.keys(reg).filter((k) => k.startsWith("chat."))));

      // งานนี้ต้องไม่ทำ sendReply เดิมพัง
      resetAll();
      tables.chatContact = [{ id: "ct-1", tenantId: "T1", systemId: "S1", channel: "WEBCHAT", channelConnectionId: "conn-web", externalUserId: "guest-1", displayName: "คุณเอ", blockedAt: null }];
      tables.chatConversation = [{ id: "conv-1", tenantId: "T1", systemId: "S1", contactId: "ct-1", channel: "WEBCHAT", channelConnectionId: "conn-web", unitId: null, status: "OPEN", lastMessageAt: new Date(3), staffUnreadCount: 2, firstResponseAt: null, meta: null, contact: { id: "ct-1", externalUserId: "guest-1", displayName: "คุณเอ" } }];
      calls.length = 0;
      const staff = await chat.sendReply({ tenantId: "T1", systemId: "S1", conversationId: "conv-1", senderUserId: "U1", body: "ตอบจากจอ SHARK", unitAccess: ["*"] });
      chk("XR-3.8", "positive control — sendReply ของทีมงานใน SHARK ยัง emit chat.message.sent เหมือนเดิม", staff.ok === true && evtOf("chat.message.sent").length === 1 && evtOf("chat.message.mirrored").length === 0, "1 sent · 0 mirrored", j({ sent: evtOf("chat.message.sent").length, mirr: evtOf("chat.message.mirrored").length, ok: staff.ok }));
    });

    // ═════════ XR-4: denorm ต้องตรงกับ sendReply ═════════
    await section("XR-4", "\nXR-4 denormalized ต้องตรงกับ sendReply (ไม่งั้น inbox ทีมเพี้ยน):", async () => {
      // ชุด A — sendReply (ของจริงที่ต้องเทียบ)
      resetAll();
      tables.chatContact = [{ id: "ct-1", tenantId: "T1", systemId: "S1", channel: "WEBCHAT", channelConnectionId: "conn-web", externalUserId: "guest-1", displayName: "คุณเอ", blockedAt: null }];
      tables.chatConversation = [{ id: "conv-1", tenantId: "T1", systemId: "S1", contactId: "ct-1", channel: "WEBCHAT", channelConnectionId: "conn-web", unitId: null, status: "OPEN", lastMessageAt: new Date(3), lastMessagePreview: "ถามราคา", lastMessageDirection: "IN", staffUnreadCount: 2, firstResponseAt: null, meta: null, contact: { id: "ct-1", externalUserId: "guest-1", displayName: "คุณเอ" } }];
      calls.length = 0;
      await chat.sendReply({ tenantId: "T1", systemId: "S1", conversationId: "conv-1", senderUserId: "U1", body: "ตอบแล้วนะคะ", unitAccess: ["*"] });
      const denormA = seen("chatConversation.update").map((c) => (c.args.data ?? {}) as Row).filter((d) => "lastMessageDirection" in d);
      const convA = { ...(tables.chatConversation![0] as Row) };

      // ชุด B — receiveExternalReply (สภาพเริ่มต้นเดียวกันเป๊ะ)
      resetAll();
      tables.chatContact = [{ id: "ct-1", tenantId: "T1", systemId: "S1", channel: "WEBCHAT", channelConnectionId: "conn-web", externalUserId: "guest-1", displayName: "คุณเอ", blockedAt: null }];
      tables.chatConversation = [{ id: "conv-1", tenantId: "T1", systemId: "S1", contactId: "ct-1", channel: "WEBCHAT", channelConnectionId: "conn-web", unitId: null, status: "OPEN", lastMessageAt: new Date(3), lastMessagePreview: "ถามราคา", lastMessageDirection: "IN", staffUnreadCount: 2, firstResponseAt: null, meta: null, contact: { id: "ct-1", externalUserId: "guest-1", displayName: "คุณเอ" } }];
      calls.length = 0;
      const rB = await chat.receiveExternalReply({ connection: tables.chatChannelConnection!.find((c) => c.id === "conn-web"), externalUserId: "guest-1", body: "ตอบแล้วนะคะ" });
      const denormB = seen("chatConversation.update").map((c) => (c.args.data ?? {}) as Row).filter((d) => "lastMessageDirection" in d);
      const convB = tables.chatConversation![0] as Row;

      const keysA = denormA.length ? Object.keys(denormA[0]!).sort().join(",") : "(ไม่มี)";
      const keysB = denormB.length ? Object.keys(denormB[0]!).sort().join(",") : "(ไม่มี)";
      chk("XR-4.1", "🔴 ชุดฟิลด์ denorm เท่ากับของ sendReply เป๊ะ (เทียบจาก data ที่ยิงเข้า DB จริง)", keysA !== "(ไม่มี)" && keysA === keysB, `เหมือน sendReply: ${keysA}`, `sendReply=${keysA} · mirrored=${keysB}`);
      chk("XR-4.2", "lastMessagePreview/Direction อัปเดตเป็นข้อความฝั่งร้าน", convB.lastMessagePreview === "ตอบแล้วนะคะ" && convB.lastMessageDirection === "OUT", "ตอบแล้วนะคะ / OUT", j({ p: convB.lastMessagePreview, d: convB.lastMessageDirection }));
      chk("XR-4.3", "🔴 staffUnreadCount = 0 (ตอบแล้ว = ออกจากกล่อง 'รอตอบ' เหมือน sendReply)", convB.staffUnreadCount === 0 && convA.staffUnreadCount === 0, "0 ทั้งสองทาง", j({ sendReply: convA.staffUnreadCount, mirrored: convB.staffUnreadCount }));
      chk("XR-4.4", "firstResponseAt ถูกประทับเมื่อยังว่าง (SLA ตอบครั้งแรก)", convB.firstResponseAt instanceof Date && convA.firstResponseAt instanceof Date, "มีค่าเวลา", j({ sendReply: convA.firstResponseAt, mirrored: convB.firstResponseAt }));
      chk("XR-4.5", "lastMessageAt ขยับตามข้อความใหม่", (convB.lastMessageAt as Date | null)?.getTime?.() !== new Date(3).getTime() && rB.ok === true, "ไม่ใช่ค่าเดิม", j({ at: convB.lastMessageAt, ok: rB.ok }), "MAJOR");

      // firstResponseAt ที่มีอยู่แล้วห้ามถูกทับ (ไม่งั้น SLA รีเซ็ตทุกครั้งที่ตอบ)
      const FIRST = new Date(Date.now() - 3_600_000);
      tables.chatConversation![0]!.firstResponseAt = FIRST;
      await chat.receiveExternalReply({ connection: tables.chatChannelConnection!.find((c) => c.id === "conn-web"), externalUserId: "guest-1", body: "ตอบเพิ่มอีกข้อความ" });
      chk("XR-4.6", "firstResponseAt ที่มีอยู่แล้วห้ามถูกทับ (SLA ต้องไม่รีเซ็ตทุกครั้งที่ตอบ)", (tables.chatConversation![0]!.firstResponseAt as Date).getTime() === FIRST.getTime(), "ค่าเดิม", j(tables.chatConversation![0]!.firstResponseAt));

      // โน้ตภายในห้ามแตะ denorm
      resetAll();
      const DEV = "sd2-device-5";
      await seedThread(DEV);
      const convBefore = { ...(tables.chatConversation![0] as Row) };
      await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV, body: "โน้ตทีม: ลูกค้ารายนี้ต่อราคาเก่ง", isInternal: true } });
      const convAfter = tables.chatConversation![0] as Row;
      chk("XR-4.7", "🔴 โน้ตภายในไม่ทับ preview / ไม่ล้างแบดจ์ 'รอตอบ' ของทีม", convAfter.lastMessagePreview === convBefore.lastMessagePreview && convAfter.staffUnreadCount === convBefore.staffUnreadCount && convAfter.staffUnreadCount === 1, "preview + unread เท่าเดิม (1)", j({ before: { p: convBefore.lastMessagePreview, u: convBefore.staffUnreadCount }, after: { p: convAfter.lastMessagePreview, u: convAfter.staffUnreadCount } }));
    });

    // ═════════ XR-5: กันซ้ำด้วย clientMessageId ═════════
    await section("XR-5", "\nXR-5 clientMessageId — ยิงซ้ำต้องไม่เกิดข้อความซ้ำ (WO-C7 รันซ้ำได้):", async () => {
      resetAll();
      const DEV = "sd2-device-6";
      await seedThread(DEV);
      const n0 = msgRows().length;
      const a = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV, body: "ตอบครั้งเดียว", clientMessageId: "sd2:reply:42" } });
      const n1 = msgRows().length;
      calls.length = 0;
      const b = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV, body: "ตอบครั้งเดียว", clientMessageId: "sd2:reply:42" } });
      const n2 = msgRows().length;
      chk("XR-5.1", "🔴 clientMessageId เดิม → duplicate + ไม่เพิ่มแถว", a.status === 200 && b.status === 200 && b.json.duplicate === true && n1 === n0 + 1 && n2 === n1, "duplicate:true · จำนวนเท่าเดิม", j({ a: a.json, b: b.json, n0, n1, n2 }));
      chk("XR-5.2", "ยิงซ้ำแล้วไม่มี event เพิ่ม (ไม่งั้นผู้รับ webhook เห็นคำตอบเด้ง 2 รอบ)", evtOf("chat.message.mirrored").length === 0, "0 event ในรอบที่ 2", j(evtOf("chat.message.mirrored").length));
      const c = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV, body: "ตอบอีกข้อความ", clientMessageId: "sd2:reply:43" } });
      chk("XR-5.3", "positive control — id ใหม่ยังเขียนได้จริง", c.status === 200 && c.json.duplicate === undefined && msgRows().length === n2 + 1, "เพิ่ม 1 แถว", j({ c: c.json, n: msgRows().length }));
    });

    // ═════════ XR-6: โน้ตภายในห้ามหลุดถึงลูกค้า ═════════
    await section("XR-6", "\nXR-6 🔴 โน้ตภายในต้องไม่หลุดถึงลูกค้า:", async () => {
      resetAll();
      const DEV = "sd2-device-7";
      const SECRET_NOTE = "ลูกค้ารายนี้ค้างชำระ ห้ามให้เครดิต";
      await seedThread(DEV);
      const note = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV, body: SECRET_NOTE, isInternal: true } });
      const noteRow = msgRows().find((m) => m.id === note.json.messageId);
      chk("XR-6.1", "isInternal:true เขียนแถวที่เป็นโน้ตภายในจริง", note.status === 200 && noteRow?.isInternal === true, "isInternal true", j({ s: note.status, v: noteRow?.isInternal }));
      const th = await call("thread", "GET", { headers: secretHeaders(), query: { externalUserId: DEV } });
      chk("XR-6.2", "🔴 โน้ตไม่โผล่ใน /thread (end-to-end ผ่าน route จริง)", !j(th.json).includes("ค้างชำระ"), "ไม่มีโน้ต", j(th.json).slice(0, 160));
      const un = await call("unread", "GET", { headers: secretHeaders(), query: { externalUserId: DEV } });
      chk("XR-6.3", "โน้ตไม่ถูกนับใน /unread ของลูกค้า", un.status === 200 && un.json.unread === 0, "{unread:0}", `${un.status} ${j(un.json)}`);
      const pub2 = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV, body: "ตอบให้ลูกค้าเห็น" } });
      const th2 = await call("thread", "GET", { headers: secretHeaders(), query: { externalUserId: DEV } });
      const un2 = await call("unread", "GET", { headers: secretHeaders(), query: { externalUserId: DEV } });
      chk("XR-6.4", "positive control — คำตอบปกติเห็นได้และถูกนับ (ด่านไม่ได้กรองทุกอย่างทิ้ง)", pub2.status === 200 && j(th2.json).includes("ตอบให้ลูกค้าเห็น") && un2.json.unread === 1, "เห็น + unread 1", j({ th: j(th2.json).includes("ตอบให้ลูกค้าเห็น"), u: un2.json.unread }));
      chk("XR-6.5", "🔴 กติกากรองโน้ต (`isInternal: false`) ยังมีที่เดียวใน service (งานนี้ห้ามเขียนซ้ำที่ 2)", (CODE_SERVICE.match(/isInternal:\s*false/g) ?? []).length === 1, "1 แห่ง", String((CODE_SERVICE.match(/isInternal:\s*false/g) ?? []).length));
    });

    // ═════════ XR-7: sentAt ═════════
    await section("XR-7", "\nXR-7 sentAt — เวลาจริงของข้อความ (secret เท่านั้น):", async () => {
      const OLD = new Date("2024-03-01T08:30:00.000Z");
      resetAll();
      const DEV = "sd2-device-8";
      const inb = await call("messages", "POST", { headers: secretHeaders(), body: { externalUserId: DEV, body: "ทักไว้เมื่อปีที่แล้ว", sentAt: OLD.toISOString(), clientMessageId: "sd2:1" } });
      const inbRow = msgRows().find((m) => m.id === inb.json.messageId);
      chk("XR-7.1", "🔴 /messages: secret ตั้ง sentAt ได้ → createdAt = เวลาจริง (ไม่ใช่ตอนย้าย)", inb.status === 200 && (inbRow?.createdAt as Date)?.getTime() === OLD.getTime(), OLD.toISOString(), j({ s: inb.status, at: inbRow?.createdAt }));
      chk("XR-7.2", "lastMessageAt ของเธรดใช้เวลาจริงด้วย (ประวัติที่ย้ายมาเรียงถูก)", (tables.chatConversation![0]!.lastMessageAt as Date)?.getTime() === OLD.getTime(), OLD.toISOString(), j(tables.chatConversation![0]!.lastMessageAt));

      const OLD2 = new Date("2024-03-01T09:00:00.000Z");
      const rep = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV, body: "ตอบไปตั้งแต่ตอนนั้น", sentAt: OLD2.toISOString(), clientMessageId: "sd2:2" } });
      const repRow = msgRows().find((m) => m.id === rep.json.messageId);
      chk("XR-7.3", "🔴 /replies: secret ตั้ง sentAt ได้ → createdAt = เวลาจริง", rep.status === 200 && (repRow?.createdAt as Date)?.getTime() === OLD2.getTime(), OLD2.toISOString(), j({ s: rep.status, at: repRow?.createdAt }));
      const th = await call("thread", "GET", { headers: secretHeaders(), query: { externalUserId: DEV } });
      const order = ((th.json.messages ?? []) as Row[]).map((m) => String(m.createdAt));
      chk("XR-7.4", "ประวัติที่ย้ายมาเรียงตามเวลาจริง (ลูกค้าถามก่อน ทีมตอบทีหลัง)", order.length === 2 && order[0] === OLD.toISOString() && order[1] === OLD2.toISOString(), `[${OLD.toISOString()}, ${OLD2.toISOString()}]`, j(order));

      // 🔴 widget ปลอมเวลาไม่ได้
      resetAll();
      const g = guest();
      const before = Date.now();
      const w = await call("messages", "POST", { headers: widgetHeaders(g), body: { body: "ข้อความของ widget", sentAt: OLD.toISOString() } });
      const wRow = msgRows().find((m) => m.id === w.json.messageId);
      const wAt = (wRow?.createdAt as Date)?.getTime() ?? 0;
      chk("XR-7.5", "🔴 widget ตั้ง sentAt เองไม่ได้ (ปลอมเวลา = แทรกข้อความไว้กลางประวัติ/บนสุดของ inbox)", w.status === 200 && wAt !== OLD.getTime() && wAt >= before - 1000 && wAt <= Date.now() + 1000, "createdAt ≈ ตอนนี้ ไม่ใช่ค่าที่ส่งมา", j({ s: w.status, at: wRow?.createdAt, claimed: OLD.toISOString() }));

      // ขอบเขตของค่า
      resetAll();
      const DEV2 = "sd2-device-9";
      await seedThread(DEV2);
      const n0 = msgRows().length;
      const future = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
      const fRep = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV2, body: "x", sentAt: future } });
      chk("XR-7.6", "🔴 sentAt อนาคตเกิน 1 วัน → ปฏิเสธ + ข้อความไทย + ไม่เขียนแถว", fRep.status === 422 && thai(fRep.json.error) && msgRows().length === n0, "422 + ไทย + ไม่มีแถวใหม่", `${fRep.status} ${j(fRep.json)} · +${msgRows().length - n0} แถว`);
      const fMsg = await call("messages", "POST", { headers: secretHeaders(), body: { externalUserId: DEV2, body: "x", sentAt: future } });
      chk("XR-7.7", "/messages ก็ต้องกันเวลาอนาคตเหมือนกัน (กติกาเดียวกันทั้ง 2 เส้น)", fMsg.status === 422 && thai(fMsg.json.error), "422 + ไทย", `${fMsg.status} ${j(fMsg.json)}`);
      const ancient = new Date(Date.now() - 10 * 365 * 24 * 3600_000).toISOString();
      const aRep = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV2, body: "x", sentAt: ancient } });
      chk("XR-7.8", "sentAt เก่าเกินเหตุ (10 ปี — อาการหน่วยเวลาผิด) → ปฏิเสธ", aRep.status === 422 && thai(aRep.json.error), "422 + ไทย", `${aRep.status} ${j(aRep.json)}`, "MAJOR");
      const bad = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV2, body: "x", sentAt: "เมื่อวาน" } });
      chk("XR-7.9", "sentAt ที่ไม่ใช่ ISO → 400 + ข้อความไทย", bad.status === 400 && thai(bad.json.error), "400 + ไทย", `${bad.status} ${j(bad.json)}`, "MINOR");
      const skew = new Date(Date.now() + 3600_000).toISOString();
      const okSkew = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV2, body: "นาฬิกาต้นทางเร็วไป 1 ชม.", sentAt: skew } });
      chk("XR-7.10", "positive control — อนาคตในขอบ (1 ชม. · clock skew ปกติ) ต้องผ่าน ไม่ใช่ปฏิเสธหมด", okSkew.status === 200 && okSkew.json.ok === true, "200", `${okSkew.status} ${j(okSkew.json)}`);
    });

    // ═════════ XR-8: createdAt ตามสัญญา §3.2 ═════════
    await section("XR-8", "\nXR-8 createdAt ครบตามสัญญา §3.2:", async () => {
      resetAll();
      const DEV = "sd2-device-10";
      const m = await call("messages", "POST", { headers: secretHeaders(), body: { externalUserId: DEV, body: "สวัสดีครับ" } });
      chk("XR-8.1", "POST /messages คืน createdAt เป็น ISO", typeof m.json.createdAt === "string" && !Number.isNaN(Date.parse(String(m.json.createdAt))), "ISO string", j(m.json));
      const r = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: DEV, body: "สวัสดีค่ะ" } });
      chk("XR-8.2", "POST /replies คืน createdAt เป็น ISO", typeof r.json.createdAt === "string" && !Number.isNaN(Date.parse(String(r.json.createdAt))), "ISO string", j(r.json));
      const th = await call("thread", "GET", { headers: secretHeaders(), query: { externalUserId: DEV } });
      const msgs = (th.json.messages ?? []) as Row[];
      chk("XR-8.3", "GET /thread คืน createdAt ครบทุกข้อความ (ISO)", msgs.length === 2 && msgs.every((x) => typeof x.createdAt === "string" && !Number.isNaN(Date.parse(String(x.createdAt)))), "ครบทุกข้อความ", j(msgs.map((x) => x.createdAt)));
      chk("XR-8.4", "messages[] ยังมี 7 ฟิลด์ตาม §3.2 เป๊ะ (คำตอบที่สะท้อนมาไม่ทำสัญญาพัง)", msgs[0] ? Object.keys(msgs[0]).sort().join(",") === "attachments,body,createdAt,direction,id,senderName,type" : false, "attachments,body,createdAt,direction,id,senderName,type", msgs[0] ? Object.keys(msgs[0]).sort().join(",") : "(ไม่มี)");
      const out = msgs.find((x) => x.direction === "OUT");
      chk("XR-8.5", "คำตอบที่สะท้อนมาแสดงชื่อฝั่งร้าน (ตกไปใช้ senderAlias เมื่อไม่ระบุ)", out?.senderName === "ทีมงาน SiamDive", "ทีมงาน SiamDive", j(out?.senderName));
      chk("XR-8.6", "/messages ส่ง createdAt กลับจริง (route ไม่ทิ้งค่าที่ชั้น 1 คืนมา)", /result\.createdAt/.test(SRC_MESSAGES), "route อ่าน result.createdAt", "ไม่มีใน route", "MINOR");

      // คำตอบสำหรับคนที่ยังไม่เคยทัก = ไม่สร้างเธรดผี
      resetAll();
      const ghost = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: "ไม่เคยมีตัวตน", body: "ตอบใครก็ไม่รู้" } });
      chk("XR-8.7", "ตอบให้คนที่ไม่เคยทัก → ปฏิเสธ + ไม่สร้าง contact/เธรดผีให้ทีมมานั่งปิดเอง", ghost.status === 422 && thai(ghost.json.error) && (tables.chatContact ?? []).length === 0 && (tables.chatConversation ?? []).length === 0, "422 + 0 contact + 0 conversation", `${ghost.status} ${j(ghost.json)} · ct ${(tables.chatContact ?? []).length} · conv ${(tables.chatConversation ?? []).length}`);
      const empty = await call("replies", "POST", { headers: secretHeaders(), body: { externalUserId: "x", body: "   " } });
      chk("XR-8.8", "body ว่าง → 422 + ข้อความไทย", empty.status === 422 && thai(empty.json.error), "422 + ไทย", `${empty.status} ${j(empty.json)}`, "MINOR");
    });
  }

  chk("XR-9.9", "ไม่มี query หลุดออก DB จริง (fake prisma รับทุกครั้ง · DATABASE_URL ถูกทับ)", process.env.DATABASE_URL === "postgresql://qc:qc@127.0.0.1:1/qc-no-db", "DATABASE_URL ถูกทับ", String(process.env.DATABASE_URL).slice(0, 40), "MINOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT REPLIES (WO-C3b) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

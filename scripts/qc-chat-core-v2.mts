// QC — chat core v2 (WO-C2) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ ชื่อไฟล์: `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — `qc-chat-security.mts` (M9–M12) และ
//    `qc-chat-security-scope.mts` (B1/B5/B6/B10) มีอยู่ก่อนแล้ว เขียนทับ = ลบด่านทิ้งทั้งชุด
//    (qc-all.mts ค้น `qc-*.mts` อัตโนมัติ — สร้างไฟล์ใหม่ = เป็นด่านทันที)
//
// ⚠️ ชุดนี้ **ห้ามแตะฐานข้อมูล** (.env ของเครื่องนี้ชี้ prod จริง) → กัน 2 ชั้นเหมือน scope suite:
//   1) ทับ DATABASE_URL เป็น host ที่ต่อไม่ได้ ทันทีหลัง loadEnvFile
//   2) ยัด fake prisma ลง require.cache ของ `src/lib/core/db.ts` **ก่อน** import service
//   fake รอบนี้ทำเพิ่มจาก scope suite: ใส่ค่า default ของ schema ตอน create · รองรับ compound
//   unique (tenantId_idempotencyKey ของ outbox) · ตัวเปรียบเทียบ gt/gte/lt/lte · บังคับ
//   @@unique([conversationId, clientMessageId]) ให้โยน P2002 จริง · **บันทึกว่าแต่ละ query
//   เกิดในทรานแซกชันไหน** (ใช้ตัดสินข้อ "outbox ต้องอยู่ใน tx เดียวกับการเขียนข้อความ")
//
// สัญญา:
// XC-1) publicThread() — คืน messages[] ตาม §3.2 เป๊ะ: id · direction · type · body ·
//       attachments[] · senderName · createdAt · 🔴 โน้ตภายใน (isInternal) **ห้ามหลุดถึงลูกค้า**
//       · OUT ที่ไม่ระบุชื่อ ใช้ ChatSetting.senderAlias · IN ไม่มีชื่อ
//       · getWebchatThread ต้องห่อตัวเดียวกัน (logic ห้ามซ้ำ 2 ที่) · ChatWidget ต้องเรนเดอร์ไฟล์แนบ
// XC-2) receiveExternalInbound() — ต้องเดินผ่าน findOrCreateContact (capNewPerHour) +
//       getOrOpenConversation (advisory lock) + announceInbound **ตัวเดิม** ห้าม fork logic
//       · lang/verifiedEmail/externalRef → ChatContact · context → ChatConversation.meta
//       · attachments → ChatAttachment (kind IMAGE เมื่อ image/* มิฉะนั้น FILE)
//       · clientMessageId ซ้ำ → duplicate ไม่แจ้งเตือน/ไม่ยิง event ซ้ำ
// XC-3) outbox ขาออก (B4) — sendReply ยิง `chat.message.sent` payload ตาม §3.4 ครบ ·
//       🔴 ห้ามยิงเมื่อ isInternal · idempotencyKey ห้ามชน namespace ขาเข้า (`chat.msg.`) ·
//       emit ต้องอยู่ tx เดียวกับการเขียนข้อความ · **network call ต้องอยู่นอก tx** ·
//       setStatus ยิง `chat.conversation.status` (สถานะไม่เปลี่ยน = ไม่ยิง) ·
//       ทั้ง 2 type ต้องมี consumer จริงใน outbox-consumers ไม่งั้น event ค้าง PENDING ตลอดกาล
// XC-4) resolveLocale() — ไม่กลืนสตริงว่างที่ร้านตั้งใจตั้ง (ห้าม `||`) · page.tsx เลิกฮาร์ดโค้ด `.th`
try { process.loadEnvFile(".env"); } catch {}
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db"; // กันพลาด: ต่อไม่ติดโดยตั้งใจ
process.env.CHAT_CREDENTIALS_KEY ??= "0".repeat(64);

const { readFileSync } = await import("node:fs");
const { createRequire } = await import("node:module");
const { resolve } = await import("node:path");
const { Prisma } = await import("@prisma/client");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const j = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
// รันแต่ละหมวดแยกกัน — ฟังก์ชันที่ยังไม่มี/พังกลางคัน ต้องได้ "แดงเฉพาะหมวดนั้น"
// ไม่ใช่ล้มทั้งชุดจนหมวดอื่นหายไปเงียบ ๆ (ทำให้ fail-before อ่านไม่ออกว่าอะไรควรแดง)
const section = async (id: string, name: string, fn: () => Promise<void>) => {
  console.log(name);
  try { await fn(); } catch (e) { chk(`${id}.CRASH`, `${name} ล้มกลางคัน`, false, "รันจบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 200) : String(e)); }
};

// ───────── fake prisma (mini query engine + tx tracing) ─────────
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: { op: string; args: Record<string, unknown>; tx: number | null }[] = [];
const seen = (op: string) => calls.filter((c) => c.op === op);
let seq = 0;
let txId: number | null = null; // id ของทรานแซกชันที่กำลังเปิดอยู่ (null = นอก tx)
let netCalls = 0;

const OPS = new Set(["not", "in", "notIn", "gt", "gte", "lt", "lte", "equals", "contains", "startsWith", "endsWith", "mode", "is", "isNot", "some", "every", "none"]);
const num = (v: unknown): number | null =>
  v instanceof Date ? v.getTime() : typeof v === "number" ? v : null;

function cmp(rowVal: unknown, o: Record<string, unknown>): boolean {
  const a = num(rowVal);
  for (const [op, raw] of Object.entries(o)) {
    const b = num(raw);
    if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
      if (a === null || b === null) return false; // ค่าไม่มี/ไม่ใช่ตัวเลข = ไม่เข้าเงื่อนไข
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
        // compound unique (เช่น tenantId_idempotencyKey) → เทียบทุก sub-key กับแถวตรง ๆ
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

// ค่า default ของ schema ที่ข้อสอบชุดนี้พึ่งพา (create ของ Prisma เติมให้ — fake ต้องเติมด้วย
// ไม่งั้น updateMany where staffUnreadCount:0 ของ announceInbound จะไม่เจอแถว = ผลลวง)
const DEFAULTS: Record<string, Row> = {
  chatConversation: { status: "OPEN", staffUnreadCount: 0, reopenedCount: 0, tags: [], meta: null, lastMessageAt: null, firstResponseAt: null, resolvedAt: null, assigneeUserId: null },
  chatMessage: { type: "TEXT", isInternal: false, deliveryStatus: "SENT", senderName: null, body: null, clientMessageId: null, externalMessageId: null, attachments: [] },
  chatContact: { verifiedEmail: false, blockedAt: null, lang: null, externalRef: null, email: null, phone: null, customerId: null, displayName: null },
  outboxEvent: { status: "PENDING", attempts: 0, availableAt: null, processedAt: null },
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
  throw new Prisma.PrismaClientKnownRequestError(`[fake] unique constraint ${model}`, {
    code: "P2002",
    clientVersion: "qc",
  });
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
    aggregate: async (a: Record<string, unknown> = {}) => { rec("aggregate", a); return { _count: { _all: rows().filter((r) => matches(r, a.where)).length } }; },
    create: async (a: Record<string, unknown> = {}) => {
      rec("create", a);
      const data = (a.data ?? {}) as Row;
      // @@unique([conversationId, clientMessageId]) — ของจริงโยน P2002 ตอนส่งซ้ำ
      if (model === "chatMessage" && data.clientMessageId != null &&
          rows().some((r) => r.conversationId === data.conversationId && r.clientMessageId === data.clientMessageId)) p2002(model);
      // @@unique([tenantId, idempotencyKey])
      if (model === "outboxEvent" &&
          rows().some((r) => r.tenantId === data.tenantId && r.idempotencyKey === data.idempotencyKey)) p2002(model);
      const r: Row = { id: `fk-${model}-${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...(DEFAULTS[model] ?? {}), ...data };
      rows().push(r);
      // ผูก attachment กลับเข้าข้อความ (เลียน relation ของ Prisma เวลา include)
      if (model === "chatAttachment") {
        const msg = (tables.chatMessage ??= []).find((m) => m.id === r.messageId);
        if (msg) ((msg.attachments ??= []) as Row[]).push(r);
      }
      return r;
    },
    update: async (a: Record<string, unknown> = {}) => { rec("update", a); const r = find(a); if (!r) throw new Error(`[fake] ${model}.update ไม่พบแถว ${j(a.where)}`); applyData(r, (a.data ?? {}) as Row); return r; },
    updateMany: async (a: Record<string, unknown> = {}) => { rec("updateMany", a); const rs = rows().filter((r) => matches(r, a.where)); for (const r of rs) applyData(r, (a.data ?? {}) as Row); return { count: rs.length }; },
    upsert: async (a: Record<string, unknown> = {}) => { rec("upsert", a); const r = find(a); if (r) { applyData(r, (a.update ?? {}) as Row); return r; } const n: Row = { id: `fk-${model}-${++seq}`, createdAt: new Date(), ...(DEFAULTS[model] ?? {}), ...((a.create ?? {}) as Row) }; rows().push(n); return n; },
    deleteMany: async (a: Record<string, unknown> = {}) => { rec("deleteMany", a); return { count: 0 }; },
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
        calls.push({ op: "$executeRaw", args: { sql }, tx: txId });
        return 0;
      };
    }
    if (p === "$disconnect" || p === "$connect") return async () => {};
    if (p.startsWith("$")) return () => { throw new Error(`[fake] ห้ามเรียก prisma.${p} ในข้อสอบนี้ (ห้ามแตะ DB)`); };
    return (cache[p] ??= delegate(p));
  },
});

// ยัดลง require.cache ก่อน import service — ทุกโมดูลที่ import "@/lib/core/db" จะได้ตัวปลอมนี้
const req = createRequire(import.meta.url);
const dbFile = resolve(import.meta.dirname, "../src/lib/core/db.ts");
req.cache[dbFile] = { id: dbFile, filename: dbFile, path: resolve(dbFile, ".."), loaded: true, exports: { prisma: fakePrisma, tenantDb: () => fakePrisma }, children: [], paths: [] } as never;

// ดักเน็ตเวิร์ก — ข้อสอบนี้ห้ามมี HTTP ออกจริง และใช้ตัดสินว่า adapter ถูกเรียกนอก tx
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...a: Parameters<typeof realFetch>) => {
  netCalls++;
  throw new Error("[fake] ห้ามยิงเน็ตเวิร์กในข้อสอบนี้ " + String(a[0]));
}) as typeof realFetch;

const SRC = readFileSync("src/lib/modules/chat/service.ts", "utf8");
// ตัดคอมเมนต์ทิ้งก่อนนับ "มีที่เดียว" — คอมเมนต์อธิบายกติกาอ้างชื่อโค้ดอยู่ด้วย (จะนับซ้ำ)
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\/.*$/gm, "");
const WIDGET = readFileSync("src/app/(store)/chat/[connectionId]/ChatWidget.tsx", "utf8");
const PAGE = readFileSync("src/app/(store)/chat/[connectionId]/page.tsx", "utf8");

type Chat = {
  publicThread: (a: Record<string, unknown>) => Promise<{ conversationId?: string; status?: string; messages: Row[] }>;
  getWebchatThread: (c: unknown, t: string) => Promise<{ conversationId?: string; messages: Row[] }>;
  receiveExternalInbound: (a: Record<string, unknown>) => Promise<{ ok: boolean; conversationId?: string; messageId?: string; duplicate?: boolean; reason?: string }>;
  sendReply: (a: Record<string, unknown>) => Promise<{ ok: boolean; reason?: string; messageId?: string }>;
  setStatus: (a: Record<string, unknown>) => Promise<{ ok: boolean; reason?: string }>;
  getSetting: (t: string, s: string) => Promise<Row>;
  resolveLocale: (m: unknown, l?: string | null, f?: string) => string | null;
};

const CONN_WEB = { id: "conn-web", tenantId: "T1", systemId: "S1", type: "WEBCHAT", displayName: "แชทหน้าเว็บ", status: "CONNECTED", externalAccountId: "webchat", credentials: {}, defaultUnitId: null };
const CONN_LINE = { id: "conn-line", tenantId: "T1", systemId: "S1", type: "LINE", displayName: "LINE OA", status: "CONNECTED", externalAccountId: "U-bot", credentials: {}, defaultUnitId: null };

function resetAll() {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.chatChannelConnection = [{ ...CONN_WEB }, { ...CONN_LINE }];
  tables.chatSetting = [{ id: "st1", tenantId: "T1", systemId: "S1", memberSystemId: null, senderAlias: "ทีมงาน SiamDive", greetingMessage: { th: "สวัสดีค่ะ", en: "Hi there" }, offlineMessage: {} }];
  calls.length = 0;
  netCalls = 0;
}

try {
  const chat = (await import("@/lib/modules/chat/service" as string).catch((e) => { console.log(`  (import ล้ม: ${e instanceof Error ? e.message.slice(0, 200) : String(e)})`); return null; })) as Chat | null;

  if (!chat) { chk("XC-0", "import chat/service ได้ (fake prisma ติด)", false, "import ได้", "import ไม่ได้"); }
  else {
    // ───────── XC-1 · B3: publicThread ตามสัญญา §3.2 + โน้ตภายในห้ามหลุด ─────────
    await section("XC-1", "XC-1 publicThread (B3 — type/attachments/senderName + โน้ตภายใน):", async () => {
    resetAll();
    tables.chatContact = [{ id: "ct-1", tenantId: "T1", systemId: "S1", channel: "WEBCHAT", channelConnectionId: "conn-web", externalUserId: "guest-1", displayName: "คุณเอ", blockedAt: null }];
    tables.chatConversation = [{ id: "conv-1", tenantId: "T1", systemId: "S1", contactId: "ct-1", channel: "WEBCHAT", channelConnectionId: "conn-web", unitId: null, status: "OPEN", lastMessageAt: new Date(3), staffUnreadCount: 0, firstResponseAt: null, meta: null, contact: { id: "ct-1", externalUserId: "guest-1", displayName: "คุณเอ" } }];
    const SECRET_NOTE = "ลูกค้ารายนี้ค้างชำระ ห้ามให้เครดิต";
    tables.chatMessage = [
      { id: "m1", tenantId: "T1", systemId: "S1", conversationId: "conv-1", direction: "IN", type: "TEXT", body: "สวัสดีครับ", isInternal: false, senderName: null, createdAt: new Date(1), attachments: [] },
      { id: "m2", tenantId: "T1", systemId: "S1", conversationId: "conv-1", direction: "OUT", type: "IMAGE", body: null, isInternal: false, senderName: null, createdAt: new Date(2), attachments: [{ id: "at1", url: "https://cdn.example/x.jpg", fileName: "x.jpg", mimeType: "image/jpeg", sizeBytes: 1234, width: 800, height: 600 }] },
      { id: "m3", tenantId: "T1", systemId: "S1", conversationId: "conv-1", direction: "OUT", type: "TEXT", body: SECRET_NOTE, isInternal: true, senderName: null, createdAt: new Date(3), attachments: [] },
    ];
    const th1 = await chat.publicThread({ connection: CONN_WEB, externalUserId: "guest-1" });
    const keys = th1.messages[0] ? Object.keys(th1.messages[0]).sort().join(",") : "(ไม่มีข้อความ)";
    chk("XC-1.1", "ทุกข้อความมีฟิลด์ครบตาม §3.2 (มี type + attachments + senderName)", keys === "attachments,body,createdAt,direction,id,senderName,type", "attachments,body,createdAt,direction,id,senderName,type", keys);
    const img = th1.messages.find((m) => m.id === "m2");
    const at = ((img?.attachments ?? []) as Row[])[0];
    chk("XC-1.2", "ข้อความรูปคืน attachments พร้อม url/name/mimeType/sizeBytes (ไม่ใช่ฟองว่าง)", img?.type === "IMAGE" && at?.url === "https://cdn.example/x.jpg" && at?.name === "x.jpg" && at?.mimeType === "image/jpeg" && at?.sizeBytes === 1234, "IMAGE + attachment ครบ", j({ type: img?.type, at }));
    const leaked = th1.messages.some((m) => m.id === "m3" || String(m.body ?? "").includes("ค้างชำระ"));
    const msgWheres = seen("chatMessage.findMany").map((c) => (c.args.where ?? {}) as Row);
    chk("XC-1.3", "🔴 โน้ตภายในไม่หลุดถึงลูกค้า (ผลลัพธ์ไม่มี + where กรอง isInternal:false)", !leaked && msgWheres.length > 0 && msgWheres.every((w) => w.isInternal === false), "ไม่มีโน้ต + isInternal:false ใน where", j({ leaked, msgWheres }));
    chk("XC-1.4", "OUT ที่ไม่ระบุชื่อ ใช้ senderAlias ของร้าน (ไม่ใช่ชื่อพนักงานจริง)", img?.senderName === "ทีมงาน SiamDive", "ทีมงาน SiamDive", String(img?.senderName));
    chk("XC-1.5", "IN (ลูกค้าเอง) ไม่มี senderName", th1.messages.find((m) => m.id === "m1")?.senderName === null, "null", j(th1.messages.find((m) => m.id === "m1")?.senderName));
    const th2 = await chat.getWebchatThread(CONN_WEB, "guest-1");
    chk("XC-1.6", "getWebchatThread ห่อ publicThread ตัวเดียวกัน (ผลลัพธ์เท่ากัน)", j(th2) === j(th1), "ผลลัพธ์เหมือน publicThread", `${j(th2).slice(0, 80)} vs ${j(th1).slice(0, 80)}`);
    chk("XC-1.7", "logic กรองโน้ตภายในมีที่เดียวใน service (ไม่เขียนซ้ำ 2 ที่)", (CODE.match(/isInternal:\s*false/g) ?? []).length === 1, "isInternal: false 1 แห่ง", String((CODE.match(/isInternal:\s*false/g) ?? []).length), "MAJOR");
    chk("XC-1.8", "ChatWidget เรนเดอร์ไฟล์แนบจริง (ไม่ใช่ {m.body} เปล่า)", /attachments/.test(WIDGET) && /<img/.test(WIDGET) && /mimeType/.test(WIDGET), "อ่าน attachments + มี <img>", `attachments ${/attachments/.test(WIDGET)} · img ${/<img/.test(WIDGET)}`, "MAJOR");
    chk("XC-1.9", "publicThread คืน conversationId + status ตาม §3.2", th1.conversationId === "conv-1" && th1.status === "OPEN", "conv-1 / OPEN", j({ c: th1.conversationId, s: th1.status }), "MINOR");

    // ───────── XC-2: receiveExternalInbound ใช้ทางเดิม ไม่ fork ─────────
    });

    await section("XC-2", "\nXC-2 receiveExternalInbound (ทางเข้า s2s — ห้าม fork logic):", async () => {
    resetAll();
    const r1 = await chat.receiveExternalInbound({
      connection: CONN_WEB,
      externalUserId: "sd2-device-1",
      body: "อยากได้ทริปสิมิลัน 3 วัน",
      displayName: "คุณบี",
      lang: "de",
      verifiedEmail: true,
      externalRef: "device-abc",
      email: "b@example.com",
      clientMessageId: "sd2:1",
      context: { pageUrl: "https://www.siamdive.com/trip/1", country: "DE" },
      attachments: [
        { url: "https://cdn.example/a.png", mimeType: "image/png", fileName: "a.png", sizeBytes: 10 },
        { url: "https://cdn.example/b.pdf", mimeType: "application/pdf" },
      ],
    });
    chk("XC-2.1", "รับข้อความสำเร็จ (positive control)", r1.ok === true && !!r1.conversationId && !!r1.messageId, "{ok,conversationId,messageId}", j(r1));
    const lockCalls = calls.filter((c) => c.op === "$executeRaw" && /pg_advisory_xact_lock/.test(String(c.args.sql)));
    chk("XC-2.2", "เดินผ่าน getOrOpenConversation เดิม (advisory lock ในทรานแซกชัน)", lockCalls.length === 1 && lockCalls[0]!.tx !== null, "advisory lock 1 ครั้ง ใน tx", j(lockCalls.map((c) => ({ tx: c.tx, sql: String(c.args.sql).slice(0, 40) }))));
    const inboundEvts = seen("outboxEvent.create").map((c) => (c.args.data ?? {}) as Row).filter((d) => d.type === "chat.message.received");
    const notif = seen("appNotification.create").length;
    const convRow = tables.chatConversation![0]!;
    chk("XC-2.3", "เดินผ่าน announceInbound เดิม (outbox chat.message.received + แจ้งเตือน + unread)", inboundEvts.length === 1 && inboundEvts[0]!.idempotencyKey === `chat.msg.${r1.messageId}` && notif === 1 && convRow.staffUnreadCount === 1, "1 event(chat.msg.<id>) + 1 แจ้งเตือน + unread 1", j({ evts: inboundEvts.map((e) => e.idempotencyKey), notif, unread: convRow.staffUnreadCount }));
    const capCall = seen("chatContact.count").map((c) => (c.args.where ?? {}) as Row);
    chk("XC-2.4", "ใช้เพดาน contact ใหม่/ชม. เหมือน webchat (findOrCreateContact capNewPerHour)", capCall.length === 1 && !!(capCall[0]!.createdAt as Row)?.gte && capCall[0]!.channelConnectionId === "conn-web", "count contact ใหม่ต่อ connection ใน 1 ชม.", j(capCall));
    const ct = tables.chatContact![0]!;
    chk("XC-2.5", "lang / verifiedEmail / externalRef ลง ChatContact (M2)", ct.lang === "de" && ct.verifiedEmail === true && ct.externalRef === "device-abc" && ct.email === "b@example.com", "de / true / device-abc / อีเมล", j({ lang: ct.lang, v: ct.verifiedEmail, ref: ct.externalRef, email: ct.email }));
    const meta = (convRow.meta ?? {}) as Row;
    chk("XC-2.6", "context ลง ChatConversation.meta (M3 · §3.3)", meta.pageUrl === "https://www.siamdive.com/trip/1" && meta.country === "DE", "{pageUrl, country}", j(meta));
    const ats = tables.chatAttachment ?? [];
    const msgRow = tables.chatMessage![0]!;
    chk("XC-2.7", "attachments → ChatAttachment + kind IMAGE/FILE ตาม mimeType", ats.length === 2 && ats[0]!.kind === "IMAGE" && ats[1]!.kind === "FILE" && ats[1]!.fileName === "b.pdf" && msgRow.type === "IMAGE", "2 แถว IMAGE+FILE · message.type=IMAGE", j({ kinds: ats.map((a) => a.kind), names: ats.map((a) => a.fileName), t: msgRow.type }));
    const thExt = await chat.publicThread({ connection: CONN_WEB, externalUserId: "sd2-device-1" });
    chk("XC-2.8", "อ่านกลับผ่าน publicThread เห็นไฟล์แนบครบ (end-to-end)", thExt.messages.length === 1 && ((thExt.messages[0]!.attachments ?? []) as Row[]).length === 2, "1 ข้อความ · 2 ไฟล์แนบ", j(thExt.messages.map((m) => ({ t: m.type, n: (m.attachments as Row[]).length }))));
    const evtBefore = seen("outboxEvent.create").length, notifBefore = seen("appNotification.create").length;
    const dup = await chat.receiveExternalInbound({ connection: CONN_WEB, externalUserId: "sd2-device-1", body: "อยากได้ทริปสิมิลัน 3 วัน", clientMessageId: "sd2:1" });
    chk("XC-2.9", "clientMessageId ซ้ำ → duplicate + ไม่แจ้งเตือน/ไม่ยิง event ซ้ำ", dup.ok === true && dup.duplicate === true && seen("outboxEvent.create").length === evtBefore && seen("appNotification.create").length === notifBefore, "{ok,duplicate} + ไม่มี event/แจ้งเตือนเพิ่ม", j({ dup, evt: seen("outboxEvent.create").length - evtBefore, notif: seen("appNotification.create").length - notifBefore }));
    chk("XC-2.10", "ไม่ fork logic: advisory lock เขียนไว้ที่เดียวในทั้งไฟล์", (CODE.match(/pg_advisory_xact_lock/g) ?? []).length === 1, "1 แห่ง", String((CODE.match(/pg_advisory_xact_lock/g) ?? []).length), "MAJOR");
    const empty = await chat.receiveExternalInbound({ connection: CONN_WEB, externalUserId: "sd2-device-2", body: "   " });
    chk("XC-2.11", "ไม่มีทั้งข้อความและไฟล์ → ปฏิเสธพร้อมเหตุผลไทย", empty.ok === false && /[ก-๙]/.test(empty.reason ?? ""), "{ok:false, reason ไทย}", j(empty), "MINOR");

    // ───────── XC-3 · B4: outbox ตอนแอดมินตอบ / เปลี่ยนสถานะ ─────────
    });

    await section("XC-3", "\nXC-3 outbox ขาออก (B4 — chat.message.sent / chat.conversation.status):", async () => {
    const seedConv = (id: string, channel: string, connId: string) => {
      tables.chatContact = [{ id: "ct-1", tenantId: "T1", systemId: "S1", channel, channelConnectionId: connId, externalUserId: "guest-1", displayName: "คุณเอ", blockedAt: null }];
      tables.chatConversation = [{ id, tenantId: "T1", systemId: "S1", contactId: "ct-1", channel, channelConnectionId: connId, unitId: null, status: "OPEN", lastMessageAt: new Date(1), staffUnreadCount: 2, firstResponseAt: null, meta: null, contact: { id: "ct-1", externalUserId: "guest-1", displayName: "คุณเอ" } }];
      tables.chatMessage = [];
      tables.outboxEvent = [];
      tables.chatConversationEvent = [];
      calls.length = 0;
      netCalls = 0;
    };
    resetAll(); seedConv("conv-1", "WEBCHAT", "conn-web");
    const rep = await chat.sendReply({ tenantId: "T1", systemId: "S1", conversationId: "conv-1", senderUserId: "U1", body: "ได้ครับ เดี๋ยวส่งรายละเอียดให้", unitAccess: ["*"] });
    const sentCalls = seen("outboxEvent.create").filter((c) => ((c.args.data ?? {}) as Row).type === "chat.message.sent");
    const sent = (sentCalls[0]?.args.data ?? {}) as Row;
    chk("XC-3.1", "แอดมินตอบ → ยิง chat.message.sent 1 event", rep.ok === true && sentCalls.length === 1, "1 event", j({ rep, n: sentCalls.length }));
    const pl = (sent.payload ?? {}) as Row;
    chk("XC-3.2", "payload ครบตาม §3.4 (7 ฟิลด์ ค่าถูก — body = ข้อความเต็ม ไม่ใช่ preview ที่ถูกตัด)", Object.keys(pl).sort().join(",") === "body,channel,conversationId,externalUserId,messageId,preview,senderName" && pl.conversationId === "conv-1" && pl.messageId === rep.messageId && pl.externalUserId === "guest-1" && pl.channel === "WEBCHAT" && pl.preview === "ได้ครับ เดี๋ยวส่งรายละเอียดให้" && pl.body === "ได้ครับ เดี๋ยวส่งรายละเอียดให้" && pl.senderName === "ทีมงาน SiamDive", "body,channel,conversationId,externalUserId,messageId,preview,senderName ค่าถูก", j(pl));
    chk("XC-3.3", "idempotencyKey คนละ namespace กับขาเข้า (chat.msg.*)", typeof sent.idempotencyKey === "string" && !String(sent.idempotencyKey).startsWith("chat.msg.") && String(sent.idempotencyKey).includes(String(rep.messageId)), "ไม่ขึ้นต้น chat.msg. + ผูก messageId", String(sent.idempotencyKey));
    const msgCreateTx = seen("chatMessage.create")[0]?.tx ?? null;
    chk("XC-3.4", "emitOutbox อยู่ทรานแซกชันเดียวกับการเขียนข้อความ", msgCreateTx !== null && sentCalls[0]!.tx === msgCreateTx, "tx เดียวกัน", j({ msgTx: msgCreateTx, evtTx: sentCalls[0]?.tx }));
    // 🔴 internal note
    seedConv("conv-1", "WEBCHAT", "conn-web");
    const note = await chat.sendReply({ tenantId: "T1", systemId: "S1", conversationId: "conv-1", senderUserId: "U1", body: "ลูกค้ารายนี้ค้างชำระ", isInternal: true, unitAccess: ["*"] });
    const noteEvts = seen("outboxEvent.create").filter((c) => ((c.args.data ?? {}) as Row).type === "chat.message.sent");
    chk("XC-3.5", "🔴 โน้ตภายใน → ห้ามยิง chat.message.sent (แต่ต้องเขียนข้อความจริง)", note.ok === true && noteEvts.length === 0 && seen("chatMessage.create").length === 1, "0 event + 1 ข้อความ", j({ note, evt: noteEvts.length, msg: seen("chatMessage.create").length }));
    chk("XC-3.6", "โน้ตภายในไม่ทับ preview / ไม่ล้าง unread ของทีม", tables.chatConversation![0]!.staffUnreadCount === 2 && tables.chatConversation![0]!.lastMessagePreview === undefined, "unread 2 · preview ไม่เปลี่ยน", j({ u: tables.chatConversation![0]!.staffUnreadCount, p: tables.chatConversation![0]!.lastMessagePreview }), "MAJOR");
    // network call ต้องอยู่นอก tx
    seedConv("conv-line", "LINE", "conn-line");
    const lineRep = await chat.sendReply({ tenantId: "T1", systemId: "S1", conversationId: "conv-line", senderUserId: "U1", body: "สวัสดีครับ", unitAccess: ["*"] });
    const failEvt = seen("chatConversationEvent.create").filter((c) => ((c.args.data ?? {}) as Row).type === "DELIVERY_FAILED");
    const statusUpd = seen("chatMessage.update");
    chk("XC-3.7", "การส่งออกช่องทางภายนอกเกิดนอกทรานแซกชัน (ไม่ขัง network ไว้ใน tx)", lineRep.ok === false && failEvt.length === 1 && failEvt[0]!.tx === null && statusUpd.length === 1 && statusUpd[0]!.tx === null, "DELIVERY_FAILED + อัปเดตสถานะส่ง นอก tx", j({ ok: lineRep.ok, failTx: failEvt.map((c) => c.tx), updTx: statusUpd.map((c) => c.tx) }));
    chk("XC-3.8", "ยิง event ให้แล้วแม้ช่องทางภายนอกส่งไม่ผ่าน (ข้อความรอด = event รอด)", seen("outboxEvent.create").filter((c) => ((c.args.data ?? {}) as Row).type === "chat.message.sent").length === 1 && netCalls === 0, "1 event · ไม่มี HTTP จริง", j({ evt: seen("outboxEvent.create").length, net: netCalls }), "MAJOR");
    // setStatus
    seedConv("conv-1", "WEBCHAT", "conn-web");
    const st = await chat.setStatus({ tenantId: "T1", systemId: "S1", conversationId: "conv-1", status: "RESOLVED", actorUserId: "U1", unitAccess: ["*"] });
    const stEvts = seen("outboxEvent.create").filter((c) => ((c.args.data ?? {}) as Row).type === "chat.conversation.status");
    const stPl = ((stEvts[0]?.args.data as Row)?.payload ?? {}) as Row;
    chk("XC-3.9", "ปิดเธรด → ยิง chat.conversation.status พร้อม payload §3.4", st.ok === true && stEvts.length === 1 && Object.keys(stPl).sort().join(",") === "conversationId,externalUserId,status" && stPl.status === "RESOLVED" && stPl.externalUserId === "guest-1", "1 event {conversationId,status,externalUserId}", j({ st, n: stEvts.length, stPl }));
    chk("XC-3.10", "event ของ setStatus อยู่ tx เดียวกับการเปลี่ยนสถานะ", stEvts[0]?.tx != null && stEvts[0]!.tx === (seen("chatConversation.update")[0]?.tx ?? null), "tx เดียวกัน", j({ evt: stEvts[0]?.tx, upd: seen("chatConversation.update")[0]?.tx }), "MAJOR");
    calls.length = 0;
    const same = await chat.setStatus({ tenantId: "T1", systemId: "S1", conversationId: "conv-1", status: "RESOLVED", actorUserId: "U1", unitAccess: ["*"] });
    chk("XC-3.11", "สถานะไม่เปลี่ยนจริง → ไม่ยิง event (กัน webhook รัว)", same.ok === true && seen("outboxEvent.create").length === 0, "0 event", j({ same, n: seen("outboxEvent.create").length }), "MAJOR");
    // consumer registry — ไม่มี handler = event ค้าง PENDING ตลอดกาลพร้อม lastError
    const oc = (await import("@/lib/outbox-consumers" as string).catch(() => null)) as { consumers?: Record<string, unknown> } | null;
    const reg = oc?.consumers ?? {};
    chk("XC-3.12", "ลงทะเบียน consumer ทั้ง 2 type (ไม่งั้น event ค้าง PENDING ตลอดกาล)", typeof reg["chat.message.sent"] === "function" && typeof reg["chat.conversation.status"] === "function" && typeof reg["chat.message.received"] === "function", "มี handler ครบ 3 type", j(Object.keys(reg)));

    // ───────── XC-4 · B8: หลายภาษา + ไม่กลืนสตริงว่าง ─────────
    });

    await section("XC-4", "\nXC-4 หลายภาษา (B8 — resolveLocale ห้ามกลืนสตริงว่างที่ตั้งใจ):", async () => {
    const rl = chat.resolveLocale;
    chk("XC-4.1", "ภาษาที่ขอมีอยู่ → คืนของภาษานั้น", rl({ th: "สวัสดี", en: "Hello" }, "en") === "Hello", "Hello", j(rl({ th: "สวัสดี", en: "Hello" }, "en")));
    chk("XC-4.2", "ไม่มีภาษาที่ขอ → ตกไป fallback", rl({ th: "สวัสดี" }, "ja", "th") === "สวัสดี", "สวัสดี", j(rl({ th: "สวัสดี" }, "ja", "th")));
    chk("XC-4.3", '🔴 สตริงว่างที่ร้านตั้งใจตั้ง ต้องคืน "" ไม่ใช่ไหลไป fallback', rl({ th: "สวัสดี", en: "" }, "en", "th") === "", '""', j(rl({ th: "สวัสดี", en: "" }, "en", "th")));
    chk("XC-4.4", '🔴 fallback ที่ตั้งใจว่าง ก็ต้องคืน "" ไม่ใช่ข้ามไปภาษาอื่น', rl({ th: "", en: "Hello" }, "ja", "th") === "", '""', j(rl({ th: "", en: "Hello" }, "ja", "th")));
    chk("XC-4.5", "ไม่มีภาษาไหนเลย → null (ผู้เรียกซ่อนเอง)", rl({}, "th") === null && rl(null, "th") === null, "null", j([rl({}, "th"), rl(null, "th")]));
    chk("XC-4.6", "โลแคลยาว (th-TH) ตกมาใช้ภาษาฐาน th", rl({ th: "สวัสดี" }, "th-TH") === "สวัสดี", "สวัสดี", j(rl({ th: "สวัสดี" }, "th-TH")), "MAJOR");
    resetAll();
    const setting = await chat.getSetting("T1", "S1");
    chk("XC-4.7", "getSetting คืน greeting/offline เป็น map ภาษา (และคงฟิลด์เดิมให้ผู้เรียกไม่พัง)", j((setting.greeting ?? {}) as Row) === j({ th: "สวัสดีค่ะ", en: "Hi there" }) && j(setting.offline ?? null) === "{}" && "memberSystemId" in setting && "senderAlias" in setting, "greeting/offline เป็น map + memberSystemId/senderAlias ยังอยู่", j({ g: setting.greeting, o: setting.offline, keys: Object.keys(setting).length }));
    chk("XC-4.8", "หน้า widget เลิกฮาร์ดโค้ด .th แล้วใช้ resolveLocale", /resolveLocale\(/.test(PAGE) && !/greetingMessage\s+as\s+\{\s*th\?/.test(PAGE), "ใช้ resolveLocale · ไม่มี cast .th", `resolveLocale ${/resolveLocale\(/.test(PAGE)}`, "MAJOR");
    });
  }

  chk("XC-9.9", "ไม่มี query หลุดออก DB จริง (fake prisma รับทุกครั้ง · ไม่มี HTTP ออก)", process.env.DATABASE_URL === "postgresql://qc:qc@127.0.0.1:1/qc-no-db" && netCalls === 0, "DATABASE_URL ถูกทับ · net 0", `${String(process.env.DATABASE_URL).slice(0, 30)} · net ${netCalls}`, "MINOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT CORE V2 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

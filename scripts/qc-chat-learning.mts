// QC — WO-CW3 §5.4: คลังเรียนรู้คำตอบ (คำสั่งข้อ 9) + PDPA · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ชื่อนี้ยังไม่มีในรีโป (ตรวจแล้ว 31 ส.ค. 2026)
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
// ⚠️ ห้ามแตะฐานข้อมูล/เน็ตจริง → ทับ DATABASE_URL + fake prisma + ดัก globalThis.fetch
// ⚠️ contract-first: `chat/learning.ts` ยังไม่มี (สาย D) → import แบบ catch(()=>null)
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-WHATSAPP §5.4 · §3 N4 · PLAN-CHAT-PLATFORM WO-C12) ═══════
// LN-1) โครงข้อมูล `ChatAnswerExample` ครบ + ลงทะเบียน core/scope.ts แกน system
// LN-2) 🔴 คลังโตเฉพาะจากคำตอบที่ **ส่งจริง** — `sendReply` เฉย ๆ ห้ามสร้างตัวอย่างเอง
//       (เก็บทุกอันจะได้ "ครับ" / "เดี๋ยวเช็คให้" เต็มคลัง แล้วคำแนะนำรอบหลังจะแย่ลง ไม่ใช่ดีขึ้น)
//       คู่บวก: กด "บันทึกเป็นตัวอย่างคำตอบ" แล้วต้องเข้าคลังจริง
// LN-3) ตัวอย่างต้องผูก question = ข้อความลูกค้าที่ตั้งต้น · answer = คำตอบที่ส่งจริง
//       · channel/lang เก็บจริง (ใช้เลือกตัวอย่างให้ตรงช่องทาง/ภาษา)
// LN-4) ถอดตัวอย่างที่ไม่ดี = `archivedAt` (ไม่ลบแถว) และตัวที่ถอดแล้ว **ต้องไม่ถูกดึงมาใช้อีก**
//       คู่บวก: ตัวที่ยังไม่ถอดต้องถูกดึงมาได้จริง
// LN-5) การค้นคลังผูก tenantId + systemId เสมอ (ข้ามร้านไม่ได้)
// LN-6) 🔴🔴 **PDPA — หัวใจของชุดนี้**: `ChatAnswerExample` เป็น "สำเนาเนื้อความอีกที่หนึ่ง"
//       (question/answer = ข้อความจริงของลูกค้าและของทีม) ⇒ **ต้องถูกกวาดด้วย `retentionDays`
//       เหมือน `lastMessagePreview`** (บทเรียน 28 ส.ค.: ปกปิดข้อความแล้วเนื้อหายังโผล่ที่อื่น)
//       ยอมรับได้ทั้ง "ปกปิดเนื้อหา" และ "ลบแถว" — สิ่งที่ยอมไม่ได้คือเนื้อความยังอยู่
//       คู่บวก: ตัวอย่างที่ยังไม่หมดอายุต้องไม่ถูกแตะ (ไม่ใช่กวาดเรียบทั้งตาราง)
// LN-7) useCount / lastUsedAt ขยับเมื่อตัวอย่างถูกใช้จริง (ใช้จัดอันดับรอบถัดไป)
// LN-8) 🔴 รอบนี้ **ไม่ทำ embedding / fine-tune** — retrieval แบบ keyword เหมือน searchKb
//       (ห้ามมีการยิง LLM ตอนบันทึกตัวอย่าง — ค่าใช้จ่ายแอบซ่อน)
// LN-9) หน้าจัดการคลัง (ดู/ถอด/แก้) มีจริงและ **เดินถึงจากเมนู** — ของที่คนแก้ไม่ได้ = ของที่เน่าแล้วซ่อมไม่ได้
//
// ═══════ สัญญาชื่อที่สาย D ต้องทำตาม (ถ้าเปลี่ยน ให้แก้ ALIAS ไม่ใช่แก้ตรรกะข้อสอบ) ═══════
//   src/lib/modules/chat/learning.ts
//     saveAnswerExample({ tenantId, systemId, messageId, userId, tags? }) → { ok, exampleId?, reason? }
//     searchAnswerExamples({ tenantId, systemId, query, channel?, lang?, take? }) → [{ id, question, answer }]
//     archiveAnswerExample({ tenantId, systemId, exampleId, userId }) → { ok, reason? }

try { process.loadEnvFile(".env"); } catch {}
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db";
process.env.CHAT_CREDENTIALS_KEY ??= "0".repeat(64);
process.env.SHARK_AI_KEY = "qc-fake-key";
delete process.env.SHARK_AI_MOCK;
delete process.env.SHARK_AI_MODEL;

const { readFileSync, existsSync } = await import("node:fs");
const { createRequire } = await import("node:module");
const { resolve } = await import("node:path");
const { Prisma } = await import("@prisma/client");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const j = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const section = async (id: string, name: string, fn: () => Promise<void>) => {
  console.log(name);
  try { await fn(); } catch (e) { chk(`${id}.CRASH`, `${name} ล้มกลางคัน`, false, "รันจบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)); }
};

// ───────── fake prisma (mini query engine + tx tracing) ─────────
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: { op: string; args: Record<string, unknown>; tx: number | null }[] = [];
let seq = 0;
let txId: number | null = null;

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
      if (opKeys.length === 0) { if (!Object.entries(o).every(([sk, sv]) => row[sk] === sv)) return false; continue; }
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
// 🔴 ค่า default ของ schema — Prisma เติมให้ตอน create · fake ต้องเติมด้วย ไม่งั้นเงื่อนไข where เพี้ยน
//    ค่าเวลาเป็น **thunk** เสมอ (บทเรียน §12) ไม่ใช่ค่าคงที่ตอนโหลดไฟล์
const DEFAULTS: Record<string, Row> = {
  chatConversation: { status: "OPEN", staffUnreadCount: 0, reopenedCount: 0, tags: [], meta: null, lastMessageAt: null, lastMessagePreview: null, lastMessageDirection: null, firstResponseAt: null, firstCustomerMessageAt: null, resolvedAt: null, assigneeUserId: null, unitId: null },
  chatMessage: { type: "TEXT", isInternal: false, deliveryStatus: "SENT", senderName: null, body: null, clientMessageId: null, externalMessageId: null, purgedAt: null, deliveryError: null, senderUserId: null, stickerMeta: null, orderContext: null, meta: null },
  chatAttachment: { fileName: "", sizeBytes: null, width: null, height: null, storageKey: "" },
  chatContact: { verifiedEmail: false, blockedAt: null, lang: null, externalRef: null, email: null, phone: null, customerId: null, displayName: null },
  outboxEvent: { status: "PENDING", attempts: 0, availableAt: null, processedAt: null },
  chatReadState: { lastReadMessageId: null },
  fileAsset: { bytes: 0 },
};
const TIME_FIELDS: Record<string, string[]> = { chatReadState: ["lastReadAt"] };
function applyData(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ("increment" in o) { row[k] = (typeof row[k] === "number" ? (row[k] as number) : 0) + (o.increment as number); continue; }
      if ("decrement" in o) { row[k] = (typeof row[k] === "number" ? (row[k] as number) : 0) - (o.decrement as number); continue; }
      if ("set" in o) { row[k] = o.set; continue; }
      if ("connect" in o) { row[k] = (o.connect as Row).id; continue; }
      if ("createMany" in o || "create" in o) { row[k] = v; continue; }
    }
    row[k] = v;
  }
}
function p2002(model: string): never {
  throw new Prisma.PrismaClientKnownRequestError(`[fake] unique constraint ${model}`, { code: "P2002", clientVersion: "qc" });
}
function newRow(model: string, data: Row): Row {
  const times: Row = {};
  for (const f of TIME_FIELDS[model] ?? []) times[f] = new Date();
  const r: Row = { id: `fk-${model}-${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...(DEFAULTS[model] ?? {}), ...times };
  applyData(r, data);
  return r;
}
const REL_ONE: Record<string, string> = { contact: "chatContact", user: "user", conversation: "chatConversation", channelConnection: "chatChannelConnection", message: "chatMessage" };
const REL_MANY: Record<string, { model: string; fk: string }> = {
  messages: { model: "chatMessage", fk: "conversationId" },
  attachments: { model: "chatAttachment", fk: "messageId" },
};
function withInclude(model: string, row: Row | null, include: unknown): Row | null {
  if (!row || !include || typeof include !== "object") return row;
  const out = { ...row };
  for (const [k, v] of Object.entries(include as Record<string, unknown>)) {
    if (!v) continue;
    const many = REL_MANY[k];
    if (many) {
      const nested = typeof v === "object" ? (v as Record<string, unknown>) : {};
      out[k] = (tables[many.model] ?? []).filter((r) => r[many.fk] === row.id && matches(r, nested.where)).map((r) => withInclude(many.model, r, nested.include));
      continue;
    }
    const target = (tables[REL_ONE[k] ?? k] ?? []).find((r) => r.id === row[`${k}Id`]);
    out[k] = target ?? null;
  }
  return out;
}
function delegate(model: string) {
  const rows = () => (tables[model] ??= []);
  const rec = (op: string, a: Record<string, unknown>) => { calls.push({ op: `${model}.${op}`, args: a, tx: txId }); };
  const find = (a: Record<string, unknown>) => rows().find((r) => matches(r, a.where)) ?? null;
  return {
    findFirst: async (a: Record<string, unknown> = {}) => { rec("findFirst", a); return withInclude(model, find(a), a.include); },
    findUnique: async (a: Record<string, unknown> = {}) => { rec("findUnique", a); return withInclude(model, find(a), a.include); },
    findMany: async (a: Record<string, unknown> = {}) => { rec("findMany", a); return rows().filter((r) => matches(r, a.where)).map((r) => withInclude(model, r, a.include)); },
    count: async (a: Record<string, unknown> = {}) => { rec("count", a); return rows().filter((r) => matches(r, a.where)).length; },
    aggregate: async (a: Record<string, unknown> = {}) => { rec("aggregate", a); return { _count: { _all: rows().filter((r) => matches(r, a.where)).length } }; },
    groupBy: async (a: Record<string, unknown> = {}) => { rec("groupBy", a); return []; },
    create: async (a: Record<string, unknown> = {}) => {
      rec("create", a);
      const data = (a.data ?? {}) as Row;
      if (model === "chatMessage" && data.clientMessageId != null && rows().some((r) => r.conversationId === data.conversationId && r.clientMessageId === data.clientMessageId)) p2002(model);
      if (model === "outboxEvent" && rows().some((r) => r.tenantId === data.tenantId && r.idempotencyKey === data.idempotencyKey)) p2002(model);
      const r = newRow(model, data);
      rows().push(r);
      return r;
    },
    createMany: async (a: Record<string, unknown> = {}) => {
      rec("createMany", a);
      const list = ((a.data ?? []) as Row[]);
      for (const d of list) rows().push(newRow(model, d));
      return { count: list.length };
    },
    update: async (a: Record<string, unknown> = {}) => { rec("update", a); const r = find(a); if (!r) throw new Error(`[fake] ${model}.update ไม่พบแถว ${j(a.where)}`); applyData(r, (a.data ?? {}) as Row); return r; },
    updateMany: async (a: Record<string, unknown> = {}) => { rec("updateMany", a); const rs = rows().filter((r) => matches(r, a.where)); for (const r of rs) applyData(r, (a.data ?? {}) as Row); return { count: rs.length }; },
    upsert: async (a: Record<string, unknown> = {}) => { rec("upsert", a); const r = find(a); if (r) { applyData(r, (a.update ?? {}) as Row); return r; } const n = newRow(model, (a.create ?? {}) as Row); rows().push(n); return n; },
    delete: async (a: Record<string, unknown> = {}) => { rec("delete", a); const r = find(a); if (!r) throw new Error("[fake] delete ไม่พบแถว"); tables[model] = rows().filter((x) => x !== r); return r; },
    deleteMany: async (a: Record<string, unknown> = {}) => { rec("deleteMany", a); const before = rows().length; tables[model] = rows().filter((r) => !matches(r, a.where)); return { count: before - (tables[model]?.length ?? 0) }; },
  };
}
const cacheD: Record<string, ReturnType<typeof delegate>> = {};
const fakePrisma: unknown = new Proxy({} as Record<string, unknown>, {
  get(_t, p) {
    if (typeof p !== "string" || p === "then") return undefined;
    if (p === "$transaction") {
      return async (fn: unknown) => {
        if (Array.isArray(fn)) return await Promise.all(fn);
        if (typeof fn !== "function") return undefined;
        const prev = txId;
        txId = ++seq;
        calls.push({ op: "$transaction.begin", args: {}, tx: txId });
        try { return await (fn as (tx: unknown) => unknown)(fakePrisma); }
        finally { txId = prev; }
      };
    }
    if (p === "$executeRaw" || p === "$executeRawUnsafe" || p === "$queryRaw" || p === "$queryRawUnsafe") {
      return async (...a: unknown[]) => { calls.push({ op: "$executeRaw", args: { sql: Array.isArray(a[0]) ? (a[0] as string[]).join("?") : String(a[0]) }, tx: txId }); return []; };
    }
    if (p === "$disconnect" || p === "$connect") return async () => {};
    if (p.startsWith("$")) return () => { throw new Error(`[fake] ห้ามเรียก prisma.${p}`); };
    return (cacheD[p] ??= delegate(p));
  },
});
const req = createRequire(import.meta.url);
const putModule = (relPath: string, exports: Record<string, unknown>) => {
  const f = resolve(import.meta.dirname, "..", relPath);
  req.cache[f] = { id: f, filename: f, path: resolve(f, ".."), loaded: true, exports, children: [], paths: [] } as never;
};
putModule("src/lib/core/db.ts", { prisma: fakePrisma, tenantDb: () => fakePrisma, platformDb: () => fakePrisma });
let SESSION = { userId: "U1", role: "OWNER", unitAccess: ["*"] as string[], permissions: {} as Record<string, unknown> };
putModule("src/lib/core/context.ts", {
  requireTenant: async () => ({
    user: { id: SESSION.userId, email: "owner@example.com", name: "เจ้าของ" },
    memberships: [],
    active: { tenantId: "T1", tenant: { id: "T1", name: "ร้านทดสอบ", status: "ACTIVE" }, role: SESSION.role, unitAccess: SESSION.unitAccess, permissions: SESSION.permissions },
  }),
  requireAuth: async () => ({ user: { id: "U1", email: "owner@example.com" }, memberships: [], active: null }),
  requireMembership: async () => ({}),
});

// ───────── ดักเน็ตเวิร์ก: บันทึก url + body + ทรานแซกชันที่เปิดอยู่ตอนยิง ─────────
// ตอบตามปลายทาง: OpenRouter → รูป chat completion · Expo → tickets · LINE → sentMessages
// 🔴 มีทั้งโหมด ok / http500 / throw เพื่อพิสูจน์ fail-soft ได้ทุกทาง
type NetCall = { url: string; method: string; body: string; tx: number | null };
const net: NetCall[] = [];
let netMode: "ok" | "http500" | "throw" = "ok";
let aiReplyText = "AI_REPLY";
globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: unknown }) => {
  const url = String(typeof input === "object" && input && "url" in input ? (input as { url: string }).url : input);
  let body = "";
  try { body = typeof init?.body === "string" ? init.body : init?.body ? "<binary>" : ""; } catch { body = ""; }
  net.push({ url, method: init?.method ?? "GET", body, tx: txId });
  if (netMode === "throw") throw new Error("[fake] ปลายทางล่ม");
  if (netMode === "http500") return { ok: false, status: 500, text: async () => "boom", json: async () => ({ error: "boom" }) };
  if (url.includes("openrouter.ai")) {
    return { ok: true, status: 200, text: async () => "{}", json: async () => ({
      choices: [{ message: { content: aiReplyText } }],
      usage: { prompt_tokens: 120, completion_tokens: 40 },
      model: (() => { try { return (JSON.parse(body || "{}") as { model?: string }).model ?? "unknown"; } catch { return "unknown"; } })(),
    }) };
  }
  if (url.includes("exp.host")) {
    const payloads = (() => { try { return JSON.parse(body) as unknown[]; } catch { return []; } })();
    return { ok: true, status: 200, text: async () => "{}", json: async () => ({ data: payloads.map(() => ({ status: "ok" })) }) };
  }
  return { ok: true, status: 200, text: async () => "{}", json: async () => ({ sentMessages: [{ id: "line-1" }] }) };
}) as unknown as typeof fetch;

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
// 🔴 ตัดคอมเมนต์ก่อน grep เสมอ — คอมเมนต์ที่เล่าอดีตถูกนับเป็นการใช้จริง = ผลลบปลอม
const strip = (s: string) => s.replace(/([a-z])\/\*/g, "$1/\u0000").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\u0000/g, "*").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1"); // 🔴 D24: กัน `image/*` `audio/*` ในสตริงถูกนับเป็นเปิดคอมเมนต์ (เคยกินโค้ดหาย 12k ตัวอักษร)


const SCHEMA_CHAT = read("prisma/schema/chat.prisma");
const SCOPE_SRC = strip(read("src/lib/core/scope.ts"));
const RETENTION_SRC = strip(read("src/lib/modules/chat/retention.ts"));
const CHANNELS_PAGE = strip(read("src/app/app/sys/[id]/chat/channels/page.tsx"));
const CHAT_UI = strip(read("src/lib/modules/chat/ui.tsx"));

type Fn = (...a: never[]) => unknown;
const pick = (o: Record<string, unknown> | null, names: string[]): Fn | null => {
  for (const n of names) { const v = o?.[n]; if (typeof v === "function") return v as Fn; }
  return null;
};
const ALIAS = {
  save: ["saveAnswerExample", "recordAnswerExample", "addAnswerExample", "confirmAnswerExample"],
  search: ["searchAnswerExamples", "findAnswerExamples", "searchExamples", "retrieveAnswerExamples"],
  archive: ["archiveAnswerExample", "removeAnswerExample", "disableAnswerExample"],
};
const AI_CALLS = () => net.filter((n) => n.url.includes("openrouter.ai"));

const Q_TEXT = "ราคาแพ็กเกจดำน้ำเท่าไหร่ครับ";
const A_TEXT = "แพ็กเกจ 2 วัน 3,500 บาทครับ รวมอุปกรณ์";

function seedShop() {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.appSystem = [{ id: "S1", tenantId: "T1", type: "CHAT", name: "แชทลูกค้า", active: true, createdAt: new Date() }];
  tables.chatChannelConnection = [{ id: "conn-web", tenantId: "T1", systemId: "S1", type: "WEBCHAT", displayName: "แชทหน้าเว็บ", status: "CONNECTED", externalAccountId: "webchat", credentials: {}, defaultUnitId: null }];
  tables.chatSetting = [{ id: "st1", tenantId: "T1", systemId: "S1", memberSystemId: null, senderAlias: "ทีมงาน", greetingMessage: {}, offlineMessage: {}, retentionDays: 365, aiSuggestEnabled: true, translateEnabled: true, staffLang: "th", businessHours: null }];
  tables.chatContact = [{ id: "ct1", tenantId: "T1", systemId: "S1", channel: "WEBCHAT", externalUserId: "guest-1", displayName: "คุณเอ", lang: "th", verifiedEmail: false, blockedAt: null, createdAt: new Date() }];
  tables.chatConversation = [{ id: "cv1", tenantId: "T1", systemId: "S1", contactId: "ct1", channel: "WEBCHAT", channelConnectionId: "conn-web", status: "OPEN", staffUnreadCount: 1, unitId: null, assigneeUserId: null, reopenedCount: 0, tags: [], createdAt: new Date(), lastMessageAt: new Date() }];
  tables.chatMessage = [
    { id: "m-in", tenantId: "T1", systemId: "S1", conversationId: "cv1", direction: "IN", type: "TEXT", body: Q_TEXT, isInternal: false, deliveryStatus: "SENT", createdAt: new Date(Date.now() - 60_000), purgedAt: null, meta: null },
  ];
  tables.chatAnswerExample = [];
  tables.chatAiSuggestion = [];
  tables.aiCreditWallet = [{ id: "w1", tenantId: "T1", balanceMicro: 10_000_000, grantedAt: new Date() }];
  tables.aiCreditTxn = [];
  calls.length = 0;
  net.length = 0;
  netMode = "ok";
}

const mkExample = (over: Record<string, unknown>) => ({
  id: "ex", tenantId: "T1", systemId: "S1", question: Q_TEXT, answer: A_TEXT, channel: "WEBCHAT",
  lang: "th", tags: [], sourceMessageId: null, fromSuggestionId: null, useCount: 0, lastUsedAt: null,
  archivedAt: null, createdByUserId: "U1", createdAt: new Date(), updatedAt: new Date(), ...over,
});

try {
  const learn = (await import("@/lib/modules/chat/learning" as string).catch(() => null)) as Record<string, unknown> | null;
  const saveExample = pick(learn, ALIAS.save) as ((a: Record<string, unknown>) => Promise<{ ok?: boolean; exampleId?: string; reason?: string }>) | null;
  const searchExamples = pick(learn, ALIAS.search) as ((a: Record<string, unknown>) => Promise<{ id: string; question: string; answer: string }[]>) | null;
  const archiveExample = pick(learn, ALIAS.archive) as ((a: Record<string, unknown>) => Promise<{ ok?: boolean }>) | null;
  const svc = (await import("@/lib/modules/chat/service" as string).catch(() => null)) as Record<string, unknown> | null;
  const sendReply = (svc?.sendReply ?? null) as ((a: Record<string, unknown>) => Promise<{ ok: boolean; messageId?: string }>) | null;
  const ret = (await import("@/lib/modules/chat/retention" as string).catch(() => null)) as { purgeExpiredChatMessages?: (o: Record<string, unknown>) => Promise<{ purged: number }> } | null;

  // ═════════ LN-1 · โครงข้อมูล ═════════
  await section("LN-1", "LN-1 โครงข้อมูลของคลังตัวอย่างคำตอบ (N4):", async () => {
    chk("LN-1.1", "มี model ChatAnswerExample", /model ChatAnswerExample \{/.test(SCHEMA_CHAT), "มี", "ยังไม่มี (สาย A)");
    for (const [id, field] of [["LN-1.2", "question"], ["LN-1.3", "answer"], ["LN-1.4", "fromSuggestionId"], ["LN-1.5", "archivedAt"], ["LN-1.6", "useCount"]] as const) {
      chk(id, `ChatAnswerExample มีฟิลด์ ${field}`, new RegExp(`model ChatAnswerExample \\{[\\s\\S]*?\\n\\s*${field}\\s`).test(SCHEMA_CHAT), "มี", "ยังไม่มี");
    }
    chk("LN-1.7", "🔴 ลงทะเบียนใน core/scope.ts แกน system (ลืม = query throw ตอน runtime · บทเรียน ChatRateBucket)",
      /ChatAnswerExample:\s*sys\(/.test(SCOPE_SRC), "ChatAnswerExample: sys()", "ยังไม่ได้ลงทะเบียน");
    chk("LN-1.8", "มีไฟล์ src/lib/modules/chat/learning.ts + ฟังก์ชันบันทึกตัวอย่าง",
      saveExample !== null, `หนึ่งใน ${j(ALIAS.save)}`, learn ? j(Object.keys(learn)) : "ยังไม่มีโมดูล (สาย D ยังไม่เขียน)");
  });

  // ═════════ LN-2 · คลังโตเฉพาะจากคำตอบที่ส่งจริง + ต้องกดยืนยัน ═════════
  await section("LN-2", "LN-2 🔴 พิมพ์เองล้วนต้องกดยืนยันก่อนเข้าคลัง:", async () => {
    if (!sendReply) { chk("LN-2.0", "มี sendReply", false, "มี", "import ไม่ได้"); return; }
    seedShop();
    const r = await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", senderUserId: "U1", body: "ครับ", unitAccess: ["*"] });
    chk("LN-2.1", "🔴 ตอบลูกค้าธรรมดา **ไม่** สร้างตัวอย่างอัตโนมัติ (ไม่งั้นคลังเต็มไปด้วย 'ครับ' แล้วคำแนะนำแย่ลง)",
      r?.ok === true && (tables.chatAnswerExample ?? []).length === 0,
      "ส่งได้ + คลัง 0 แถว", `${j(r)} · คลัง ${(tables.chatAnswerExample ?? []).length} แถว`);

    if (!saveExample) { chk("LN-2.2", "มีฟังก์ชันกดยืนยันบันทึกตัวอย่าง", false, `หนึ่งใน ${j(ALIAS.save)}`, "ยังไม่มี"); return; }
    seedShop();
    const sent = await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", senderUserId: "U1", body: A_TEXT, unitAccess: ["*"] });
    const outId = sent?.messageId ?? (tables.chatMessage ?? []).find((m) => m.direction === "OUT")?.id;
    const s = await saveExample({ tenantId: "T1", systemId: "S1", messageId: outId, userId: "U1" });
    const ex = (tables.chatAnswerExample ?? []);
    chk("LN-2.2", "🟢 คู่บวก: กด 'บันทึกเป็นตัวอย่างคำตอบ' แล้วเข้าคลังจริง",
      s?.ok === true && ex.length === 1, "ok:true + 1 แถว", `${j(s)} · ${ex.length} แถว`);
    chk("LN-2.3", "question = ข้อความลูกค้าที่ตั้งต้น · answer = คำตอบที่ส่งจริง",
      ex[0]?.question === Q_TEXT && ex[0]?.answer === A_TEXT, "ตรงทั้งคู่",
      j({ q: ex[0]?.question ?? null, a: ex[0]?.answer ?? null }));
    chk("LN-2.4", "พิมพ์เองล้วน → fromSuggestionId = null (แยกออกจากที่มาจาก AI)",
      ex[0]?.fromSuggestionId === null || ex[0]?.fromSuggestionId === undefined, "null", j(ex[0]?.fromSuggestionId ?? null));
    chk("LN-2.5", "เก็บ channel + lang ไว้ด้วย (ใช้เลือกตัวอย่างให้ตรงช่องทาง/ภาษาในรอบถัดไป)",
      ex[0]?.channel === "WEBCHAT" && typeof ex[0]?.lang === "string", "WEBCHAT + lang",
      j({ ch: ex[0]?.channel ?? null, lang: ex[0]?.lang ?? null }), "MAJOR");
    chk("LN-2.6", "🔴 บันทึกตัวอย่างต้องไม่ยิง LLM (ค่าใช้จ่ายแอบซ่อน — รอบนี้ไม่ทำ embedding)",
      AI_CALLS().length === 0, "0 ครั้ง", `${AI_CALLS().length} ครั้ง`);
    chk("LN-2.7", "บันทึกตัวอย่างจากข้อความของร้านอื่นไม่ได้",
      await (async () => {
        seedShop();
        (tables.chatMessage ?? []).push({ id: "m-t2", tenantId: "T2", systemId: "S2", conversationId: "cv-t2", direction: "OUT", type: "TEXT", body: "ความลับ", isInternal: false, deliveryStatus: "SENT", createdAt: new Date(), purgedAt: null, meta: null });
        const bad = await saveExample({ tenantId: "T1", systemId: "S1", messageId: "m-t2", userId: "U1" }).catch(() => ({ ok: false }));
        return bad?.ok !== true && (tables.chatAnswerExample ?? []).length === 0;
      })(), "ok:false + คลังว่าง", "บันทึกข้ามร้านได้");
    chk("LN-2.8", "โน้ตภายในห้ามเข้าคลัง (ไม่ใช่คำตอบที่ลูกค้าเคยเห็น)",
      await (async () => {
        seedShop();
        await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", senderUserId: "U1", body: "โน้ต: ลูกค้าคนนี้ต่อราคาเก่ง", isInternal: true, unitAccess: ["*"] });
        const noteId = (tables.chatMessage ?? []).find((m) => m.isInternal === true)?.id;
        const bad = await saveExample({ tenantId: "T1", systemId: "S1", messageId: noteId, userId: "U1" }).catch(() => ({ ok: false }));
        return bad?.ok !== true && (tables.chatAnswerExample ?? []).length === 0;
      })(), "ok:false + คลังว่าง", "โน้ตภายในเข้าคลังได้");
  });

  // ═════════ LN-4/5/7 · ค้นคลัง · ถอด · ตัวนับการใช้ ═════════
  await section("LN-4", "LN-4 ค้นคลัง: ขอบเขตร้าน · ตัวที่ถอดแล้วห้ามถูกใช้ · ตัวนับการใช้:", async () => {
    if (!searchExamples) { chk("LN-4.0", "มีฟังก์ชันค้นคลัง", false, `หนึ่งใน ${j(ALIAS.search)}`, learn ? j(Object.keys(learn)) : "ยังไม่มีโมดูล"); return; }
    seedShop();
    tables.chatAnswerExample = [
      mkExample({ id: "ex-mine" }),
      mkExample({ id: "ex-other", tenantId: "T2", systemId: "S2", answer: "ความลับของร้านอื่น" }),
      mkExample({ id: "ex-archived", archivedAt: new Date(), answer: "คำตอบที่ถูกถอดออกเพราะไม่ดี" }),
    ];
    const hits = (await searchExamples({ tenantId: "T1", systemId: "S1", query: "ราคาแพ็กเกจ", take: 10 })) ?? [];
    const ids = hits.map((h) => h.id);
    chk("LN-4.1", "🟢 คู่บวก: ตัวอย่างของร้านตัวเองถูกดึงมาได้จริง", ids.includes("ex-mine"), "มี ex-mine", j(ids));
    chk("LN-4.2", "🔴 ตัวอย่างของร้านอื่นไม่หลุดออกมา", !ids.includes("ex-other"), "ไม่มี ex-other", j(ids));
    chk("LN-4.3", "🔴 ตัวอย่างที่ถูกถอด (archivedAt) ไม่ถูกดึงมาใช้อีก แต่แถวยังอยู่ให้ตรวจย้อนได้",
      !ids.includes("ex-archived") && (tables.chatAnswerExample ?? []).some((e) => e.id === "ex-archived"),
      "ไม่อยู่ในผลค้น + แถวยังอยู่", j(ids));
    const badWhere = calls.filter((c) => c.op.startsWith("chatAnswerExample.find"))
      .filter((c) => { const w = j(c.args.where ?? {}); return !w.includes("T1") || !w.includes("S1"); });
    chk("LN-4.4", "ทุก query ของคลังผูก tenantId + systemId (ไม่มี where เปล่า)",
      badWhere.length === 0, "0 query ไร้ขอบเขต", j(badWhere.map((c) => j(c.args.where ?? {}).slice(0, 90))));
    const used = (tables.chatAnswerExample ?? []).find((e) => e.id === "ex-mine");
    chk("LN-4.5", "useCount / lastUsedAt ขยับเมื่อตัวอย่างถูกดึงไปใช้ (ใช้จัดอันดับรอบถัดไป)",
      (used?.useCount as number) > 0 && used?.lastUsedAt != null, "useCount>0 + lastUsedAt",
      j({ n: used?.useCount ?? null, at: used?.lastUsedAt ? "date" : null }), "MAJOR");

    if (archiveExample) {
      seedShop();
      tables.chatAnswerExample = [mkExample({ id: "ex-mine" })];
      const a = await archiveExample({ tenantId: "T1", systemId: "S1", exampleId: "ex-mine", userId: "U1" });
      chk("LN-4.6", "ถอดตัวอย่าง = ตั้ง archivedAt ไม่ใช่ลบแถว",
        a?.ok === true && (tables.chatAnswerExample ?? []).length === 1 && (tables.chatAnswerExample ?? [])[0]?.archivedAt != null,
        "1 แถว + archivedAt", `${j(a)} · ${(tables.chatAnswerExample ?? []).length} แถว`);
      chk("LN-4.7", "ไม่มีการเรียก chatAnswerExample.delete/deleteMany จากการถอด",
        !calls.some((c) => c.op === "chatAnswerExample.delete"), "ไม่มี delete", j(calls.filter((c) => c.op.startsWith("chatAnswerExample.delete")).map((c) => c.op)));
    } else {
      chk("LN-4.6", "มีฟังก์ชันถอดตัวอย่าง", false, `หนึ่งใน ${j(ALIAS.archive)}`, "ยังไม่มี");
    }
  });

  // ═════════ LN-6 · 🔴🔴 PDPA ═════════
  await section("LN-6", "LN-6 🔴🔴 PDPA: คลังตัวอย่างต้องถูกกวาดด้วย retentionDays เหมือน lastMessagePreview:", async () => {
    chk("LN-6.1", "retention.ts อ้างถึง ChatAnswerExample จริง (ไม่ใช่แค่คอมเมนต์ในสคีมา)",
      /chatAnswerExample/.test(RETENTION_SRC), "มีการกวาดในโค้ด", "ไม่มี — เนื้อความจะยังอยู่หลังหมดอายุ");
    if (!ret?.purgeExpiredChatMessages) { chk("LN-6.2", "มี purgeExpiredChatMessages", false, "มี", "import ไม่ได้"); return; }
    seedShop();
    // 🔴 ห้ามฮาร์ดโค้ดวันที่ — คำนวณจาก now เสมอ (ข้อสอบเน่าตามเวลา · ด่าน F11 ของ fitness จับ)
    const now = new Date();
    const DAY = 24 * 3600 * 1000;
    const old = new Date(now.getTime() - 400 * DAY);   // เกิน retention 365 วัน
    const fresh = new Date(now.getTime() - 10 * DAY);  // ยังไม่หมดอายุ
    const SECRET = "เบอร์ลูกค้า 081-234-5678 ห้ามค้างในระบบเกินอายุเก็บ";
    tables.chatMessage = [{ id: "m-old", tenantId: "T1", systemId: "S1", conversationId: "cv1", direction: "IN", type: "TEXT", body: SECRET, isInternal: false, deliveryStatus: "SENT", createdAt: old, purgedAt: null, meta: null }];
    tables.chatAnswerExample = [
      mkExample({ id: "ex-old", createdAt: old, question: SECRET, answer: "ตอบไปแล้วครับ" }),
      mkExample({ id: "ex-fresh", createdAt: fresh, question: Q_TEXT, answer: A_TEXT }),
    ];
    await ret.purgeExpiredChatMessages({ now });

    const rowsNow = tables.chatAnswerExample ?? [];
    const exCalls = calls.filter((c) => c.op.startsWith("chatAnswerExample."));
    // 🔴 คู่บวกของทั้งหมวด: ถ้า retention ไม่เคยแตะตารางนี้เลย ข้อ 6.3–6.5 จะ "เขียวหลอก"
    //    (ไม่มีอะไรเปลี่ยนเพราะไม่มีโค้ด ไม่ใช่เพราะโค้ดทำถูก) → ผูกทุกข้อไว้กับตัวนี้
    const swept = exCalls.length > 0;
    const stillThere = rowsNow.some((e) => j(e).includes(SECRET));
    chk("LN-6.2", "🔴 เนื้อความของตัวอย่างที่หมดอายุต้องไม่เหลืออยู่ (ปกปิดหรือลบแถวก็ได้ แต่ห้ามยังอ่านได้)",
      !stillThere, "ไม่พบเนื้อความเดิม", "ยังอ่านเนื้อความเดิมได้จาก ChatAnswerExample");
    const fresh1 = rowsNow.find((e) => e.id === "ex-fresh");
    chk("LN-6.3", "🟢 คู่บวก: ตัวอย่างที่ยังไม่หมดอายุต้องไม่ถูกแตะ (ไม่ใช่กวาดเรียบทั้งตาราง)",
      swept && fresh1?.question === Q_TEXT && fresh1?.answer === A_TEXT, "คงเดิม (และต้องมีการกวาดเกิดขึ้นจริง)",
      swept ? j(fresh1 ?? null) : "retention ไม่เคยแตะ ChatAnswerExample เลย — ข้อนี้พิสูจน์อะไรไม่ได้");
    chk("LN-6.4", "การกวาดผูก tenantId + systemId เสมอ (ห้ามกวาดข้ามร้าน)",
      swept && exCalls.every((c) => { const w = j(c.args.where ?? {}); return w.includes("tenantId") && w.includes("systemId"); }),
      "ทุก query มีขอบเขต (และต้องมี query จริง)",
      swept ? j(exCalls.map((c) => j(c.args.where ?? {}).slice(0, 90))) : "ไม่มี query ของ ChatAnswerExample เลย");
    chk("LN-6.5", "กวาดซ้ำได้ (idempotent) — รันสองรอบแล้วผลเหมือนเดิม ไม่พัง",
      swept && await (async () => {
        try {
          const snap = j(tables.chatAnswerExample ?? []);
          await ret.purgeExpiredChatMessages!({ now });
          return j(tables.chatAnswerExample ?? []) === snap;
        } catch { return false; }
      })(), "ผลเหมือนเดิม", swept ? "ผลเปลี่ยนหรือพัง" : "ยังไม่มีการกวาด — ข้อนี้พิสูจน์อะไรไม่ได้");
  });

  // ═════════ LN-9 · หน้าจัดการคลังต้องเดินถึงจากเมนู ═════════
  await section("LN-9", "LN-9 🔴 หน้าจัดการคลัง (ของที่คนแก้ไม่ได้ = ของที่เน่าแล้วซ่อมไม่ได้):", async () => {
    const hasPage = /answerExample|AnswerExample|คลังคำตอบ|ตัวอย่างคำตอบ/.test(CHANNELS_PAGE + CHAT_UI);
    chk("LN-9.1", "หน้า 'เชื่อมช่องทาง' มีส่วนจัดการคลังตัวอย่างคำตอบ (ดู/ถอด/แก้)",
      hasPage, "มีในหน้า channels", "ไม่พบ — คลังจะโตแล้วไม่มีใครแก้ได้");
    chk("LN-9.2", "มีปุ่ม 'บันทึกเป็นตัวอย่างคำตอบ' ให้คนกดในหน้าแชทจริง (เส้นทางที่ 2 ของ §5.4)",
      /บันทึกเป็นตัวอย่าง|saveAnswerExampleAction|saveExampleAction/.test(CHAT_UI + strip(read("src/lib/modules/chat/inbox-client.tsx")) + strip(read("src/lib/modules/chat/actions.ts"))),
      "มีปุ่ม/action", "ไม่พบ — คลังจะโตไม่ได้เลยเพราะไม่มีทางกด");
    chk("LN-9.3", "มี server action ของการถอดตัวอย่าง (แอดมินถอดของเน่าออกได้เอง)",
      /archiveAnswerExampleAction|archiveExampleAction|removeAnswerExampleAction/.test(strip(read("src/lib/modules/chat/actions.ts"))),
      "มี action", "ไม่พบ", "MAJOR");
  });

  chk("LN-9.9", "ไม่มี query หลุดออก DB จริง · ไม่มี HTTP ออกนอกปลายทางที่ดักไว้",
    process.env.DATABASE_URL === "postgresql://qc:qc@127.0.0.1:1/qc-no-db" &&
    net.every((n) => /openrouter\.ai|api\.line\.me|exp\.host|bunnycdn\.com/.test(n.url)),
    "DATABASE_URL ถูกทับ · ปลายทางรู้จักทั้งหมด",
    `${String(process.env.DATABASE_URL).slice(0, 30)} · ${j([...new Set(net.map((n) => n.url.split("/")[2] ?? n.url))])}`, "MINOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT LEARNING =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

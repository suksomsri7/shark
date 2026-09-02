// QC — WO-CW3 §5.2: แปลภาษาแบบ "กดแปล" (มติ W3) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ชื่อนี้ยังไม่มีในรีโป (ตรวจแล้ว 31 ส.ค. 2026)
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
// ⚠️ ห้ามแตะฐานข้อมูล/เน็ตจริง → ทับ DATABASE_URL + fake prisma + ดัก globalThis.fetch
// ⚠️ contract-first: `chat/translate.ts` ยังไม่มี (สาย D) → import แบบ catch(()=>null)
//    ข้อที่ยังไม่มีโค้ดต้อง **แดงอย่างถูกต้อง** ไม่ใช่ skip เงียบ
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-WHATSAPP §5.2 · §3 N2/N5 · §2 กฎเหล็กข้อ 4/5) ═══════
// TR-1) โครงข้อมูลพร้อม: `ChatMessage` มี detectedLang/translatedBody/translatedLang/translatedAt (N2)
//       · `ChatSetting` มี translateEnabled + staffLang (N5)
//       · 🔴 `AiCreditSource` ต้องมีค่าสำหรับ "แปล" แยกจาก CHAT — ไม่งั้นเจ้าของแยกค่าใช้จ่ายไม่ออก
//         (แผน §5.2 เขียน `source:"chat_translate"` แต่ enum จริงเป็นตัวพิมพ์ใหญ่และ **ยังไม่มีค่านี้**
//          → §3 ของแผนตกหล่นเรื่องนี้ ต้องเพิ่มใน migration ของสาย A)
// TR-2) กดแปลซ้ำภาษาเดิม = ไม่จ่ายซ้ำ (คืนของเดิม ไม่ยิง LLM) · คู่บวก: ภาษาใหม่ = ยิงจริง
// TR-3) 🔴 ต้นฉบับห้ามถูกทับ — `body` เดิมคงอยู่ · คำแปลไปอยู่คนละฟิลด์
// TR-4) FAST_MODEL + **prompt เป็นภาษาอังกฤษ** (ไทยกิน token 4 เท่า · reference_llm_thai_token_cost)
// TR-5) หักเครดิตผ่าน chargeUsageSafe ด้วย source ของการแปล (ไม่ปนกับ CHAT ของผู้ช่วย AI)
// TR-6) 🔴 network call อยู่ **นอกทรานแซกชัน** (กฎเหล็กข้อ 5)
// TR-7) 🔴 fail-soft ทุกทาง (กฎเหล็กข้อ 4): provider ล่ม / ตอบ 500 / ไม่มีคีย์ / เครดิตหมด
//       → คืน { ok:false, reason:ไทย } **ห้าม throw** และ **แชทยังส่งข้อความได้ปกติ**
// TR-8) เครดิตหมด = ไม่ยิง LLM เลย (ไม่ใช่ยิงแล้วค่อยพบว่าจ่ายไม่ได้)
// TR-9) ปิดสวิตช์ต่อร้าน (translateEnabled=false) = ปฏิเสธก่อนจ่ายเงิน
// TR-10) ข้ามร้านไม่ได้ — messageId ของร้านอื่นต้องแปลไม่ได้ และต้องไม่ยิง LLM
// TR-11) ขากลับ (ทีม→ลูกค้า): "แปลก่อนส่ง" **ห้ามส่งเอง** — ไม่มี ChatMessage เกิดตอนกดแปล
//        · เมื่อส่งจริงด้วยคำแปล ต้นฉบับที่ทีมพิมพ์ต้องถูกเก็บใน `ChatMessage.meta.originalBody`
//
// ═══════ สัญญาชื่อที่สาย D ต้องทำตาม (ถ้าเปลี่ยน ให้แก้ ALIAS ไม่ใช่แก้ตรรกะข้อสอบ) ═══════
//   src/lib/modules/chat/translate.ts
//     translateMessage({ tenantId, systemId, messageId, targetLang, userId })
//        → { ok:true, text:string, cached:boolean } | { ok:false, reason:string }
//     translateDraft({ tenantId, systemId, conversationId, body, targetLang, userId })
//        → { ok:true, text:string } | { ok:false, reason:string }

try { process.loadEnvFile(".env"); } catch {}
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db";
process.env.CHAT_CREDENTIALS_KEY ??= "0".repeat(64);
// ให้ provider เป็น OpenRouter จริง (แต่ fetch ถูกดัก) — mock/โมเดลบังคับจาก .env ต้องไม่มายุ่ง
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
const SCHEMA_CREDIT = read("prisma/schema/ai_credit.prisma");
const TRANSLATE_SRC = strip(read("src/lib/modules/chat/translate.ts"));

type Fn = (...a: never[]) => unknown;
const pick = (o: Record<string, unknown> | null, names: string[]): Fn | null => {
  for (const n of names) { const v = o?.[n]; if (typeof v === "function") return v as Fn; }
  return null;
};
const ALIAS = {
  msg: ["translateMessage", "translateChatMessage", "translate"],
  draft: ["translateDraft", "translateOutgoing", "translateBeforeSend", "translateReplyDraft"],
};

const AI_CALLS = () => net.filter((n) => n.url.includes("openrouter.ai"));

function seedShop(opts?: { balanceMicro?: number; translateEnabled?: boolean }) {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.chatChannelConnection = [{ id: "conn-web", tenantId: "T1", systemId: "S1", type: "WEBCHAT", displayName: "แชทหน้าเว็บ", status: "CONNECTED", externalAccountId: "webchat", credentials: {}, defaultUnitId: null }];
  tables.chatSetting = [{ id: "st1", tenantId: "T1", systemId: "S1", memberSystemId: null, senderAlias: "ทีมงาน", greetingMessage: {}, offlineMessage: {}, retentionDays: 365, translateEnabled: opts?.translateEnabled ?? true, aiSuggestEnabled: true, staffLang: "th" }];
  tables.chatContact = [{ id: "ct1", tenantId: "T1", systemId: "S1", channel: "WEBCHAT", externalUserId: "guest-1", displayName: "Customer A", lang: "en", verifiedEmail: false, blockedAt: null, createdAt: new Date() }];
  tables.chatConversation = [{ id: "cv1", tenantId: "T1", systemId: "S1", contactId: "ct1", channel: "WEBCHAT", channelConnectionId: "conn-web", status: "OPEN", staffUnreadCount: 1, unitId: null, assigneeUserId: null, reopenedCount: 0, tags: [], createdAt: new Date(), lastMessageAt: new Date() }];
  tables.chatMessage = [
    { id: "m1", tenantId: "T1", systemId: "S1", conversationId: "cv1", direction: "IN", type: "TEXT", body: "How much is the trip?", isInternal: false, deliveryStatus: "SENT", createdAt: new Date(), purgedAt: null, detectedLang: null, translatedBody: null, translatedLang: null, translatedAt: null, meta: null },
    // ข้อความของ "ร้านอื่น" — ต้องแปลไม่ได้ (กันข้อมูลข้ามร้าน)
    { id: "m-other", tenantId: "T2", systemId: "S2", conversationId: "cv-other", direction: "IN", type: "TEXT", body: "ความลับของร้านอื่น", isInternal: false, deliveryStatus: "SENT", createdAt: new Date(), purgedAt: null, detectedLang: null, translatedBody: null, translatedLang: null, translatedAt: null, meta: null },
  ];
  tables.aiCreditWallet = [{ id: "w1", tenantId: "T1", balanceMicro: opts?.balanceMicro ?? 10_000_000, grantedAt: new Date() }];
  tables.aiCreditTxn = [];
  calls.length = 0;
  net.length = 0;
  netMode = "ok";
  aiReplyText = "ทริปนี้ราคาเท่าไหร่";
}

type TRes = { ok?: boolean; text?: string; cached?: boolean; reason?: string };

try {
  const tr = (await import("@/lib/modules/chat/translate" as string).catch(() => null)) as Record<string, unknown> | null;
  const translateMessage = pick(tr, ALIAS.msg) as ((a: Record<string, unknown>) => Promise<TRes>) | null;
  const translateDraft = pick(tr, ALIAS.draft) as ((a: Record<string, unknown>) => Promise<TRes>) | null;
  const svc = (await import("@/lib/modules/chat/service" as string).catch(() => null)) as Record<string, unknown> | null;
  const sendReply = (svc?.sendReply ?? null) as ((a: Record<string, unknown>) => Promise<{ ok: boolean; reason?: string }>) | null;
  const provider = (await import("@/lib/ai/provider" as string).catch(() => null)) as { FAST_MODEL?: string; SMART_MODEL?: string } | null;

  // ═════════ TR-1 · โครงข้อมูล ═════════
  await section("TR-1", "TR-1 โครงข้อมูลของการแปล (N2/N5 + แหล่งค่าใช้จ่าย):", async () => {
    for (const [id, field] of [["TR-1.1", "detectedLang"], ["TR-1.2", "translatedBody"], ["TR-1.3", "translatedLang"], ["TR-1.4", "translatedAt"]] as const) {
      chk(id, `ChatMessage มีฟิลด์ ${field} (N2)`, new RegExp(`\\n\\s*${field}\\s`).test(SCHEMA_CHAT), "มีในสคีมา", "ยังไม่มี (สาย A ยังไม่เพิ่ม)");
    }
    chk("TR-1.5", "ChatSetting มี translateEnabled + staffLang (N5)",
      /\n\s*translateEnabled\s/.test(SCHEMA_CHAT) && /\n\s*staffLang\s/.test(SCHEMA_CHAT), "มีทั้งคู่", "ยังไม่มี");
    chk("TR-1.6", "🔴 AiCreditSource มีค่าสำหรับ 'การแปล' แยกจาก CHAT (ไม่งั้นเจ้าของแยกค่าใช้จ่ายไม่ออก)",
      /enum AiCreditSource[\s\S]*?TRANSLATE[\s\S]*?\n\}/.test(SCHEMA_CREDIT), "มีค่า *TRANSLATE*",
      "ยังไม่มี — §3 ของแผนตกหล่น ต้องเพิ่มใน migration ของสาย A");
    chk("TR-1.7", "มีไฟล์ src/lib/modules/chat/translate.ts + ฟังก์ชันแปลข้อความ",
      translateMessage !== null, `หนึ่งใน ${j(ALIAS.msg)}`, tr ? j(Object.keys(tr)) : "ยังไม่มีโมดูล (สาย D ยังไม่เขียน)");
  });

  // ═════════ TR-2/3 · แปลครั้งแรก · ไม่จ่ายซ้ำ · ต้นฉบับไม่ถูกทับ ═════════
  await section("TR-2", "TR-2 แปลครั้งแรก / ซ้ำไม่จ่ายซ้ำ / ต้นฉบับคงอยู่:", async () => {
    if (!translateMessage) { chk("TR-2.0", "มีฟังก์ชันแปล", false, "มี", "ยังไม่มี"); return; }
    seedShop();
    const r1 = await translateMessage({ tenantId: "T1", systemId: "S1", messageId: "m1", targetLang: "th", userId: "U1" });
    chk("TR-2.1", "แปลครั้งแรกสำเร็จ", r1?.ok === true && !!r1?.text, "ok:true + มีคำแปล", j(r1));
    chk("TR-2.2", "ยิง LLM 1 ครั้ง (ไม่ซ้ำซ้อน)", AI_CALLS().length === 1, "1 ครั้ง", `${AI_CALLS().length} ครั้ง`);
    const m = (tables.chatMessage ?? []).find((x) => x.id === "m1");
    chk("TR-2.3", "🔴 ต้นฉบับไม่ถูกทับ (body เดิมคงอยู่)", m?.body === "How much is the trip?", "ข้อความเดิม", j(m?.body ?? null));
    chk("TR-2.4", "คำแปลเก็บที่ translatedBody + translatedLang + translatedAt",
      typeof m?.translatedBody === "string" && (m.translatedBody as string).length > 0 && m?.translatedLang === "th" && m?.translatedAt instanceof Date,
      "ครบ 3 ฟิลด์", j({ b: m?.translatedBody ?? null, l: m?.translatedLang ?? null, at: m?.translatedAt ? "date" : null }));
    chk("TR-2.5", "บันทึกภาษาต้นทางที่ตรวจได้ (detectedLang) — ใช้เลือกว่าควรขึ้นปุ่มแปลไหม",
      typeof m?.detectedLang === "string" && (m.detectedLang as string).length > 0, "มีค่า", j(m?.detectedLang ?? null), "MAJOR");

    const before = AI_CALLS().length;
    const r2 = await translateMessage({ tenantId: "T1", systemId: "S1", messageId: "m1", targetLang: "th", userId: "U1" });
    chk("TR-2.6", "🔴 กดแปลซ้ำภาษาเดิม → ไม่ยิง LLM อีก (ไม่จ่ายซ้ำ) และคืนคำแปลเดิม",
      r2?.ok === true && AI_CALLS().length === before && r2?.text === r1?.text,
      "ไม่มีการยิงเพิ่ม + ข้อความเดิม", `calls +${AI_CALLS().length - before} · ${j(r2)}`);

    const r3 = await translateMessage({ tenantId: "T1", systemId: "S1", messageId: "m1", targetLang: "ja", userId: "U1" });
    chk("TR-2.7", "🟢 คู่บวก: ภาษาใหม่ต้องยิง LLM จริง (พิสูจน์ว่าไม่ได้ cache แบบเหมารวมทุกกรณี)",
      r3?.ok === true && AI_CALLS().length === before + 1, "ยิงเพิ่ม 1 ครั้ง", `calls +${AI_CALLS().length - before} · ${j(r3)}`);
  });

  // ═════════ TR-4/5/6 · โมเดล · prompt · เครดิต · ตำแหน่ง tx ═════════
  await section("TR-4", "TR-4 โมเดล/prompt/เครดิต/ทรานแซกชัน:", async () => {
    if (!translateMessage) { chk("TR-4.0", "มีฟังก์ชันแปล", false, "มี", "ยังไม่มี"); return; }
    seedShop();
    await translateMessage({ tenantId: "T1", systemId: "S1", messageId: "m1", targetLang: "th", userId: "U1" });
    const call = AI_CALLS()[0];
    const payload = (() => { try { return JSON.parse(call?.body ?? "{}") as { model?: string; messages?: { role: string; content: unknown }[] }; } catch { return {}; } })();
    chk("TR-4.1", "ใช้ FAST_MODEL (งานแปลไม่ต้องใช้โมเดลแพง)",
      payload.model === provider?.FAST_MODEL, j(provider?.FAST_MODEL ?? "FAST_MODEL"), j(payload.model ?? null));
    const sysText = (payload.messages ?? []).filter((m) => m.role === "system").map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join(" ");
    chk("TR-4.2", "🔴 คำสั่ง (system prompt) เป็นภาษาอังกฤษ — ไทยกิน token ~4 เท่า (reference_llm_thai_token_cost)",
      sysText.length > 0 && !/[฀-๿]/.test(sysText), "ไม่มีอักษรไทยใน system prompt",
      sysText ? `พบอักษรไทย: ${sysText.slice(0, 120)}` : "ไม่มี system prompt เลย");
    chk("TR-4.3", "หักเครดิตจริง (มีแถว AiCreditTxn ชนิด USAGE)",
      (tables.aiCreditTxn ?? []).some((t) => t.kind === "USAGE"), "มีแถว USAGE", j((tables.aiCreditTxn ?? []).map((t) => t.kind)));
    chk("TR-4.4", "🔴 source ของค่าใช้จ่ายต้องเป็นของ 'การแปล' ไม่ใช่ CHAT (ปนกัน = แยกบิลไม่ออก)",
      (tables.aiCreditTxn ?? []).some((t) => t.kind === "USAGE" && /TRANSLATE/i.test(String(t.source))),
      "source มีคำว่า TRANSLATE", j((tables.aiCreditTxn ?? []).map((t) => t.source)));
    chk("TR-4.5", "🔴 การยิง LLM อยู่ **นอก** ทรานแซกชัน (network ใน tx = pool ของ Neon ตัน)",
      AI_CALLS().length > 0 && AI_CALLS().every((n) => n.tx === null), "tx=null", j(AI_CALLS().map((n) => n.tx)));
  });

  // ═════════ TR-7 · fail-soft ทุกทาง ═════════
  await section("TR-7", "TR-7 🔴 พังแล้วต้องไม่ทำให้ตอบแชทไม่ได้ (กฎเหล็กข้อ 4):", async () => {
    if (!translateMessage) { chk("TR-7.0", "มีฟังก์ชันแปล", false, "มี", "ยังไม่มี"); return; }
    const runFail = async (mode: "throw" | "http500") => {
      seedShop();
      netMode = mode;
      let threw = false;
      let res: TRes = {};
      try { res = await translateMessage({ tenantId: "T1", systemId: "S1", messageId: "m1", targetLang: "th", userId: "U1" }); }
      catch { threw = true; }
      netMode = "ok";
      return { threw, res };
    };
    const a = await runFail("throw");
    chk("TR-7.1", "provider ล่ม → ไม่ throw + คืนเหตุผลภาษาไทย",
      !a.threw && a.res?.ok === false && /[฀-๿]/.test(String(a.res?.reason ?? "")), "ok:false + reason ไทย",
      a.threw ? "throw ขึ้นมา" : j(a.res));
    const b = await runFail("http500");
    chk("TR-7.2", "provider ตอบ 500 → ไม่ throw + คืนเหตุผลภาษาไทย",
      !b.threw && b.res?.ok === false && /[฀-๿]/.test(String(b.res?.reason ?? "")), "ok:false + reason ไทย",
      b.threw ? "throw ขึ้นมา" : j(b.res));

    seedShop();
    const savedKey = process.env.SHARK_AI_KEY;
    delete process.env.SHARK_AI_KEY;
    let threwNoKey = false;
    let noKey: TRes = {};
    try { noKey = await translateMessage({ tenantId: "T1", systemId: "S1", messageId: "m1", targetLang: "th", userId: "U1" }); } catch { threwNoKey = true; }
    process.env.SHARK_AI_KEY = savedKey;
    chk("TR-7.3", "ไม่มีคีย์ AI → ปิดอย่างสุภาพ ไม่ throw", !threwNoKey && noKey?.ok === false, "ok:false", threwNoKey ? "throw" : j(noKey));

    // 🟢 คู่บวกสำคัญที่สุด: แปลพังแล้ว "แชทยังใช้ได้" — วัดจากการส่งข้อความจริงหลังเหตุการณ์
    if (sendReply) {
      const r = await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", senderUserId: "U1", body: "ตอบลูกค้าตามปกติ", unitAccess: ["*"] });
      chk("TR-7.4", "🟢 คู่บวก: หลังการแปลล้มทุกรูปแบบ ทีมยังตอบลูกค้าได้ตามปกติ",
        r?.ok === true, "ok:true", j(r));
    } else {
      chk("TR-7.4", "หา sendReply เพื่อพิสูจน์คู่บวกไม่ได้", false, "มี sendReply", "import ไม่ได้", "MAJOR");
    }
  });

  // ═════════ TR-8/9/10 · เครดิตหมด · สวิตช์ · ข้ามร้าน ═════════
  await section("TR-8", "TR-8 เครดิตหมด / ปิดสวิตช์ / ข้ามร้าน — ต้องไม่ยิง LLM เลย:", async () => {
    if (!translateMessage) { chk("TR-8.0", "มีฟังก์ชันแปล", false, "มี", "ยังไม่มี"); return; }
    seedShop({ balanceMicro: 0 });
    const a = await translateMessage({ tenantId: "T1", systemId: "S1", messageId: "m1", targetLang: "th", userId: "U1" }).catch(() => ({ ok: undefined } as TRes));
    chk("TR-8.1", "เครดิตหมด → บอกตรง ๆ เป็นภาษาไทย (ไม่เงียบ)",
      a?.ok === false && /[฀-๿]/.test(String(a?.reason ?? "")), "ok:false + reason ไทย", j(a));
    chk("TR-8.2", "🔴 และต้องไม่ยิง LLM เลย (ยิงก่อนแล้วค่อยพบว่าจ่ายไม่ได้ = จ่ายฟรีให้ผู้ให้บริการ)",
      AI_CALLS().length === 0, "0 ครั้ง", `${AI_CALLS().length} ครั้ง`);

    seedShop({ translateEnabled: false });
    const b = await translateMessage({ tenantId: "T1", systemId: "S1", messageId: "m1", targetLang: "th", userId: "U1" }).catch(() => ({ ok: undefined } as TRes));
    chk("TR-8.3", "ร้านที่ปิดสวิตช์แปล → ปฏิเสธก่อนจ่ายเงิน",
      b?.ok === false && AI_CALLS().length === 0, "ok:false + ไม่ยิง LLM", `${j(b)} · calls=${AI_CALLS().length}`);

    seedShop();
    const c = await translateMessage({ tenantId: "T1", systemId: "S1", messageId: "m-other", targetLang: "th", userId: "U1" }).catch(() => ({ ok: undefined } as TRes));
    chk("TR-8.4", "🔴 แปลข้อความของร้านอื่นไม่ได้ (messageId เดาถูกก็ไม่หลุด)",
      c?.ok === false, "ok:false", j(c));
    chk("TR-8.5", "🔴 และเนื้อความของร้านอื่นต้องไม่ถูกส่งออกไปหา LLM เลย",
      !AI_CALLS().some((n) => n.body.includes("ความลับของร้านอื่น")), "ไม่มีเนื้อความร้านอื่นใน payload",
      j(AI_CALLS().map((n) => n.body.slice(0, 80))));
  });

  // ═════════ TR-11 · ขากลับ ทีม→ลูกค้า ═════════
  await section("TR-11", "TR-11 'แปลก่อนส่ง' ห้ามส่งเอง + ต้นฉบับที่ทีมพิมพ์ต้องเก็บไว้:", async () => {
    if (!translateDraft) { chk("TR-11.0", "มีฟังก์ชันแปลร่างก่อนส่ง", false, `หนึ่งใน ${j(ALIAS.draft)}`, tr ? j(Object.keys(tr)) : "ยังไม่มีโมดูล"); return; }
    seedShop();
    const before = (tables.chatMessage ?? []).length;
    const r = await translateDraft({ tenantId: "T1", systemId: "S1", conversationId: "cv1", body: "ราคา 3,500 บาทครับ", targetLang: "en", userId: "U1" });
    chk("TR-11.1", "แปลร่างได้", r?.ok === true && !!r?.text, "ok:true + ข้อความ", j(r));
    chk("TR-11.2", "🔴 กดแปลแล้ว **ยังไม่ส่ง** — ไม่มี ChatMessage เกิดใหม่ (ทีมต้องเห็นและยืนยันก่อน)",
      (tables.chatMessage ?? []).length === before, `${before} แถวเท่าเดิม`, `${(tables.chatMessage ?? []).length} แถว`);
    chk("TR-11.3", "🔴 และต้องไม่มีการยิงออกช่องทางภายนอกเลยตอนกดแปล",
      net.filter((n) => n.url.includes("api.line.me")).length === 0, "0 ครั้ง", `${net.filter((n) => n.url.includes("api.line.me")).length} ครั้ง`);

    if (sendReply) {
      seedShop();
      await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", senderUserId: "U1", body: "The price is 3,500 THB", originalBody: "ราคา 3,500 บาทครับ", unitAccess: ["*"] });
      const sent = (tables.chatMessage ?? []).find((m) => m.direction === "OUT");
      chk("TR-11.4", "ส่งจริงด้วยคำแปล → เนื้อความที่ลูกค้าได้คือคำแปล",
        sent?.body === "The price is 3,500 THB", "คำแปล", j(sent?.body ?? null));
      chk("TR-11.5", "🔴 ต้นฉบับที่ทีมพิมพ์เก็บใน meta.originalBody (ทีมย้อนดูได้ว่าตัวเองพิมพ์อะไร)",
        !!sent?.meta && typeof sent.meta === "object" && "originalBody" in (sent.meta as object) &&
        (sent.meta as { originalBody?: string }).originalBody === "ราคา 3,500 บาทครับ",
        "meta.originalBody = ต้นฉบับไทย", j(sent?.meta ?? null));
    } else {
      chk("TR-11.4", "หา sendReply ไม่ได้", false, "มี sendReply", "import ไม่ได้", "MAJOR");
    }
  });

  chk("TR-9.9", "ไม่มี query หลุดออก DB จริง · HTTP ออกเฉพาะปลายทางที่ดักไว้",
    process.env.DATABASE_URL === "postgresql://qc:qc@127.0.0.1:1/qc-no-db" &&
    net.every((n) => /openrouter\.ai|api\.line\.me|exp\.host|bunnycdn\.com/.test(n.url)),
    "DATABASE_URL ถูกทับ · ปลายทางรู้จักทั้งหมด",
    `${String(process.env.DATABASE_URL).slice(0, 30)} · ${j([...new Set(net.map((n) => n.url.split("/")[2] ?? n.url))])}`, "MINOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT TRANSLATE =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

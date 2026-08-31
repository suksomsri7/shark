// QC — WO-CW3 §5.3: AI แนะนำคำตอบจากข้อมูลทั้งกิจการ (คำสั่งข้อ 8) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ชื่อนี้ยังไม่มีในรีโป (ตรวจแล้ว 31 ส.ค. 2026)
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
// ⚠️ ห้ามแตะฐานข้อมูล/เน็ตจริง → ทับ DATABASE_URL + fake prisma + ดัก globalThis.fetch
// ⚠️ contract-first: `chat/ai-suggest.ts` ยังไม่มี (สาย D) → import แบบ catch(()=>null)
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-WHATSAPP §5.3/§5.4 · §2 กฎเหล็กข้อ 4/5) ═══════
// AS-1) โครงข้อมูล `ChatAiSuggestion` ครบตาม §3 N3 + ลงทะเบียนใน core/scope.ts (แกน system)
//       · `AiCreditSource` ต้องมีค่าของ "AI แนะนำคำตอบ" แยกจาก CHAT (แผน §3 ตกหล่นเรื่องนี้)
// AS-2) 🔴 **เป็นข้อเสนอเท่านั้น ห้ามส่งเอง** — เรียก suggestReply แล้วต้องไม่มี ChatMessage ทิศ OUT
//       และไม่มีการยิงออกช่องทางภายนอกเลย
//       คู่บวก: `sendReply` บนเธรด LINE เดียวกันต้องยิงออกจริง (พิสูจน์ว่ากับดัก fetch จับได้จริง —
//       บทเรียน WO-C3b: เคยเขียวหลอกเพราะ adapter โยน error ก่อนถึงจุดที่วัด)
// AS-3) เสนอได้สูงสุด 3 ตัวเลือก · ทุกตัวถูกบันทึกเป็น `ChatAiSuggestion` (rank 0..2 · outcome PENDING)
// AS-4) 🔴 `sourcesUsed` บันทึกจริง (ตรวจย้อนได้ว่าคำตอบมาจากไหน) · ว่าง = ต้องติดป้ายเตือน
// AS-5) 🔴 ข้อมูลข้ามร้านห้ามหลุดเข้า prompt — seed ของร้าน T2 ไว้ทุกแหล่ง (ข้อความ/KB/คลังตัวอย่าง)
//       แล้วต้องไม่โผล่ใน payload ที่ส่งออก · คู่บวก: ของร้าน T1 ต้องโผล่จริง (ไม่งั้นแปลว่า
//       prompt ว่างเปล่าแล้วข้อสอบเขียวเพราะ "ไม่มีอะไรเลย" ไม่ใช่เพราะกันข้ามร้านได้)
// AS-6) ใช้ SMART_MODEL · คำสั่งใน prompt เป็นภาษาอังกฤษ (reference_llm_thai_token_cost)
// AS-7) 🔴 prompt ต้องสั่งห้ามแต่งข้อมูล ([[feedback_no_fabricated_trip_data]]) และ
//       ห้ามสัญญาว่า "จะติดต่อกลับ" ([[feedback_no_callback_promise]])
// AS-8) เครดิตหมด / provider ล่ม → { ok:false, reason:ไทย } ไม่ throw · **แชทยังตอบได้ปกติ**
//       และเครดิตหมดต้องไม่ยิง LLM เลย
// AS-9) 🔴 network call อยู่นอกทรานแซกชัน
// AS-10) `recordSuggestionOutcome` — similarity ≥95 → SENT_AS_IS · <95 → SENT_EDITED · ข้าม → IGNORED
//        · ความจริงคือ "ข้อความที่ส่งจริง" ไม่ใช่ที่ AI เสนอ
// AS-11) 🔴 IGNORED ไม่เข้าคลัง `ChatAnswerExample` (สัญญาณลบห้ามกลายเป็นตัวอย่างให้เรียนรู้)
// AS-12) ปิดสวิตช์ต่อร้าน (aiSuggestEnabled=false) → ปฏิเสธก่อนจ่ายเงิน
//
// ═══════ สัญญาชื่อที่สาย D ต้องทำตาม (ถ้าเปลี่ยน ให้แก้ ALIAS ไม่ใช่แก้ตรรกะข้อสอบ) ═══════
//   src/lib/modules/chat/ai-suggest.ts
//     suggestReply({ tenantId, systemId, conversationId, userId })
//        → { ok:true, options:[{ id, body, sources:string[], warn?:boolean }] } | { ok:false, reason }
//     recordSuggestionOutcome({ tenantId, systemId, suggestionId, sentMessageId?, sentBody?, outcome? })
//        → { ok:boolean, outcome?:string, similarity?:number }

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
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1");


const SCHEMA_CHAT = read("prisma/schema/chat.prisma");
const SCHEMA_CREDIT = read("prisma/schema/ai_credit.prisma");
const SCOPE_SRC = strip(read("src/lib/core/scope.ts"));

type Fn = (...a: never[]) => unknown;
const pick = (o: Record<string, unknown> | null, names: string[]): Fn | null => {
  for (const n of names) { const v = o?.[n]; if (typeof v === "function") return v as Fn; }
  return null;
};
const ALIAS = {
  suggest: ["suggestReply", "suggestReplies", "buildSuggestions", "suggest"],
  outcome: ["recordSuggestionOutcome", "recordOutcome", "markSuggestionOutcome"],
};
const AI_CALLS = () => net.filter((n) => n.url.includes("openrouter.ai"));

// ความลับของร้านอื่น — ต้องไม่โผล่ใน prompt เด็ดขาด
const SECRET_T2 = "ZZ-ความลับของร้านที่สอง-ZZ";
// ของร้านตัวเอง — ต้องโผล่จริง (คู่บวก: ถ้าไม่โผล่ = prompt ว่าง แล้วข้อ 'ไม่ข้ามร้าน' จะเขียวหลอก)
const MINE_MSG = "YY-ลูกค้าถามเรื่องราคาแพ็กเกจดำน้ำ-YY";
const MINE_KB = "YY-ราคาแพ็กเกจดำน้ำ 3,500 บาท-YY";
const MINE_EXAMPLE = "YY-คำตอบที่ทีมเคยตอบเรื่องราคา-YY";

function seedShop(opts?: { balanceMicro?: number; aiSuggestEnabled?: boolean }) {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.appSystem = [{ id: "S1", tenantId: "T1", type: "CHAT", name: "แชทลูกค้า", active: true, createdAt: new Date() }];
  tables.chatChannelConnection = [
    { id: "conn-line", tenantId: "T1", systemId: "S1", type: "LINE", displayName: "LINE OA", status: "CONNECTED", externalAccountId: "@qc", credentials: { channelAccessToken: "TOKEN-QC", channelSecret: "SECRET-QC" }, defaultUnitId: null },
  ];
  tables.chatSetting = [{ id: "st1", tenantId: "T1", systemId: "S1", memberSystemId: null, senderAlias: "ทีมงาน", greetingMessage: {}, offlineMessage: {}, retentionDays: 365, aiSuggestEnabled: opts?.aiSuggestEnabled ?? true, translateEnabled: true, staffLang: "th", businessHours: null }];
  tables.chatContact = [
    { id: "ct1", tenantId: "T1", systemId: "S1", channel: "LINE", externalUserId: "Uline1", displayName: "คุณเอ", lang: "th", verifiedEmail: false, blockedAt: null, customerId: null, createdAt: new Date() },
  ];
  tables.chatConversation = [
    { id: "cv1", tenantId: "T1", systemId: "S1", contactId: "ct1", channel: "LINE", channelConnectionId: "conn-line", status: "OPEN", staffUnreadCount: 1, unitId: null, assigneeUserId: null, reopenedCount: 0, tags: [], createdAt: new Date(), lastMessageAt: new Date() },
  ];
  tables.chatMessage = [
    { id: "m1", tenantId: "T1", systemId: "S1", conversationId: "cv1", direction: "IN", type: "TEXT", body: MINE_MSG, isInternal: false, deliveryStatus: "SENT", createdAt: new Date(), purgedAt: null, meta: null },
    // ข้อความของร้านอื่น (คนละ tenant/system/conversation) — ห้ามหลุดเข้า prompt
    { id: "m-t2", tenantId: "T2", systemId: "S2", conversationId: "cv-t2", direction: "IN", type: "TEXT", body: SECRET_T2, isInternal: false, deliveryStatus: "SENT", createdAt: new Date(), purgedAt: null, meta: null },
  ];
  tables.kbArticle = [
    { id: "kb1", tenantId: "T1", title: "ราคาแพ็กเกจ", body: MINE_KB, active: true, createdAt: new Date() },
    { id: "kb2", tenantId: "T2", title: "ราคาแพ็กเกจ", body: SECRET_T2, active: true, createdAt: new Date() },
  ];
  tables.chatAnswerExample = [
    { id: "ex1", tenantId: "T1", systemId: "S1", question: MINE_MSG, answer: MINE_EXAMPLE, channel: "LINE", lang: "th", tags: [], sourceMessageId: null, fromSuggestionId: null, useCount: 0, lastUsedAt: null, archivedAt: null, createdByUserId: "U1", createdAt: new Date() },
    { id: "ex2", tenantId: "T2", systemId: "S2", question: SECRET_T2, answer: SECRET_T2, channel: "LINE", lang: "th", tags: [], sourceMessageId: null, fromSuggestionId: null, useCount: 0, lastUsedAt: null, archivedAt: null, createdByUserId: "U9", createdAt: new Date() },
  ];
  tables.chatAiSuggestion = [];
  tables.aiCreditWallet = [{ id: "w1", tenantId: "T1", balanceMicro: opts?.balanceMicro ?? 10_000_000, grantedAt: new Date() }];
  tables.aiCreditTxn = [];
  calls.length = 0;
  net.length = 0;
  netMode = "ok";
  // ตอบเป็น JSON 3 ตัวเลือก — รูปที่ผู้เขียนโค้ดน่าจะขอจากโมเดล
  aiReplyText = JSON.stringify({
    options: [
      { body: "ราคาแพ็กเกจดำน้ำ 3,500 บาทครับ", sources: ["kb:kb1"] },
      { body: "รบกวนขอวันที่ที่สนใจครับ", sources: ["example:ex1"] },
      { body: "มีรอบเช้าและรอบบ่ายครับ", sources: [] },
    ],
  });
}

type SRes = { ok?: boolean; options?: { id?: string; body?: string; sources?: string[]; warn?: boolean }[]; reason?: string };

try {
  const ai = (await import("@/lib/modules/chat/ai-suggest" as string).catch(() => null)) as Record<string, unknown> | null;
  const suggestReply = pick(ai, ALIAS.suggest) as ((a: Record<string, unknown>) => Promise<SRes>) | null;
  const recordOutcome = pick(ai, ALIAS.outcome) as ((a: Record<string, unknown>) => Promise<{ ok?: boolean; outcome?: string; similarity?: number }>) | null;
  const svc = (await import("@/lib/modules/chat/service" as string).catch(() => null)) as Record<string, unknown> | null;
  const sendReply = (svc?.sendReply ?? null) as ((a: Record<string, unknown>) => Promise<{ ok: boolean; reason?: string; messageId?: string }>) | null;
  const provider = (await import("@/lib/ai/provider" as string).catch(() => null)) as { SMART_MODEL?: string; FAST_MODEL?: string } | null;

  // ═════════ AS-1 · โครงข้อมูล ═════════
  await section("AS-1", "AS-1 โครงข้อมูลของคำแนะนำ (N3):", async () => {
    chk("AS-1.1", "มี model ChatAiSuggestion ในสคีมา", /model ChatAiSuggestion \{/.test(SCHEMA_CHAT), "มี", "ยังไม่มี (สาย A)");
    for (const [id, field] of [["AS-1.2", "sourcesUsed"], ["AS-1.3", "outcome"], ["AS-1.4", "similarity"], ["AS-1.5", "costMicro"], ["AS-1.6", "rank"]] as const) {
      chk(id, `ChatAiSuggestion มีฟิลด์ ${field}`, new RegExp(`model ChatAiSuggestion \\{[\\s\\S]*?\\n\\s*${field}\\s`).test(SCHEMA_CHAT), "มี", "ยังไม่มี");
    }
    chk("AS-1.7", "🔴 ลงทะเบียนใน core/scope.ts แกน system (ลืม = query throw ตอน runtime + fitness F1.1 แดง)",
      /ChatAiSuggestion:\s*sys\(/.test(SCOPE_SRC), "ChatAiSuggestion: sys()", "ยังไม่ได้ลงทะเบียน");
    chk("AS-1.8", "🔴 AiCreditSource มีค่าของ 'AI แนะนำคำตอบ' แยกจาก CHAT (แผน §3 ตกหล่น — ต้องเพิ่มใน migration)",
      /enum AiCreditSource[\s\S]*?SUGGEST[\s\S]*?\n\}/.test(SCHEMA_CREDIT), "มีค่า *SUGGEST*", "ยังไม่มี");
    chk("AS-1.9", "มีไฟล์ src/lib/modules/chat/ai-suggest.ts + ฟังก์ชันแนะนำคำตอบ",
      suggestReply !== null, `หนึ่งใน ${j(ALIAS.suggest)}`, ai ? j(Object.keys(ai)) : "ยังไม่มีโมดูล (สาย D ยังไม่เขียน)");
  });

  // ═════════ AS-2 · ห้ามส่งเอง (มีคู่บวกว่ากับดักจับได้) ═════════
  await section("AS-2", "AS-2 🔴 เป็นข้อเสนอเท่านั้น ห้ามส่งเอง:", async () => {
    if (!suggestReply) { chk("AS-2.0", "มี suggestReply", false, "มี", "ยังไม่มี"); return; }
    seedShop();
    const r = await suggestReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", userId: "U1" });
    chk("AS-2.1", "แนะนำสำเร็จ", r?.ok === true && Array.isArray(r?.options) && (r.options?.length ?? 0) > 0, "ok:true + มีตัวเลือก", j(r).slice(0, 200));
    chk("AS-2.2", "🔴 ไม่มี ChatMessage ทิศ OUT ถูกเขียน (AI ห้ามตอบลูกค้าเอง)",
      !(tables.chatMessage ?? []).some((m) => m.direction === "OUT" && m.tenantId === "T1"),
      "0 แถว OUT", j((tables.chatMessage ?? []).filter((m) => m.direction === "OUT").length));
    chk("AS-2.3", "🔴 ไม่มีการยิงออกช่องทางภายนอก (LINE) เลย",
      net.filter((n) => n.url.includes("api.line.me")).length === 0, "0 ครั้ง", `${net.filter((n) => n.url.includes("api.line.me")).length} ครั้ง`);

    // 🟢 คู่บวก: เธรดเดียวกันนี้ **ยิงออกได้จริง** เมื่อคนกดส่ง — พิสูจน์ว่าที่ไม่ยิงไม่ใช่เพราะ adapter พัง
    if (sendReply) {
      const before = net.filter((n) => n.url.includes("api.line.me")).length;
      await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", senderUserId: "U1", body: "ตอบด้วยมือ", unitAccess: ["*"] });
      chk("AS-2.4", "🟢 คู่บวก: คนกดส่งเองบนเธรดเดียวกัน → ยิงออก LINE จริง (บทเรียน WO-C3b)",
        net.filter((n) => n.url.includes("api.line.me")).length === before + 1,
        "ยิงเพิ่ม 1 ครั้ง", `เพิ่ม ${net.filter((n) => n.url.includes("api.line.me")).length - before}`);
    } else {
      chk("AS-2.4", "หา sendReply เพื่อทำคู่บวกไม่ได้", false, "มี sendReply", "import ไม่ได้", "MAJOR");
    }
  });

  // ═════════ AS-3/4 · จำนวนตัวเลือก · บันทึกที่มา ═════════
  await section("AS-3", "AS-3 จำนวนตัวเลือก + บันทึก ChatAiSuggestion + sourcesUsed:", async () => {
    if (!suggestReply) { chk("AS-3.0", "มี suggestReply", false, "มี", "ยังไม่มี"); return; }
    seedShop();
    const r = await suggestReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", userId: "U1" });
    chk("AS-3.1", "เสนอไม่เกิน 3 ตัวเลือก", (r?.options?.length ?? 99) <= 3, "≤3", j(r?.options?.length ?? null));
    const rows = (tables.chatAiSuggestion ?? []).filter((s) => s.tenantId === "T1");
    chk("AS-3.2", "ทุกตัวเลือกถูกบันทึกเป็น ChatAiSuggestion",
      rows.length === (r?.options?.length ?? -1) && rows.length > 0, "จำนวนเท่ากับตัวเลือก", `rows=${rows.length} options=${r?.options?.length ?? "-"}`);
    chk("AS-3.3", "outcome เริ่มที่ PENDING (เสนอแล้วยังไม่มีใครตัดสิน ≠ ถูกข้าม)",
      rows.length > 0 && rows.every((s) => s.outcome === "PENDING"), "PENDING ทุกแถว", j(rows.map((s) => s.outcome)));
    chk("AS-3.4", "rank ไล่ 0..n และผูก sourceMessageId กับข้อความลูกค้าที่ตั้งต้น",
      rows.length > 0 && rows.every((s) => typeof s.rank === "number") && rows.every((s) => s.sourceMessageId === "m1"),
      "rank เป็นตัวเลข + sourceMessageId=m1", j(rows.map((s) => ({ r: s.rank, src: s.sourceMessageId }))));
    chk("AS-3.5", "🔴 sourcesUsed บันทึกจริง (ตรวจย้อนได้ว่าคำตอบมาจากไหน ไม่ใช่ [] ทุกแถว)",
      rows.some((s) => Array.isArray(s.sourcesUsed) && (s.sourcesUsed as unknown[]).length > 0),
      "อย่างน้อย 1 แถวมีที่มา", j(rows.map((s) => s.sourcesUsed)));
    chk("AS-3.6", "🔴 ตัวเลือกที่ไม่มีที่มา ต้องถูกติดป้ายเตือน (ห้ามแต่งข้อมูลแล้วดูเหมือนของจริง)",
      (r?.options ?? []).every((o) => (o.sources?.length ?? 0) > 0 || o.warn === true),
      "ทุกตัวที่ไม่มีที่มา warn=true", j((r?.options ?? []).map((o) => ({ s: o.sources?.length ?? 0, w: o.warn ?? null }))));
    chk("AS-3.7", "costMicro ถูกบันทึกจริง (ไม่ใช่ 0 ทุกแถว — เจ้าของต้องเห็นว่าปุ่มนี้กินเงินเท่าไหร่)",
      rows.some((s) => typeof s.costMicro === "number" && (s.costMicro as number) > 0), ">0 อย่างน้อย 1 แถว",
      j(rows.map((s) => s.costMicro)), "MAJOR");
  });

  // ═════════ AS-5 · ข้ามร้านไม่หลุด (มีคู่บวกว่า prompt ไม่ว่าง) ═════════
  await section("AS-5", "AS-5 🔴 ข้อมูลข้ามร้านห้ามหลุดเข้า prompt:", async () => {
    if (!suggestReply) { chk("AS-5.0", "มี suggestReply", false, "มี", "ยังไม่มี"); return; }
    seedShop();
    await suggestReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", userId: "U1" });
    const payload = AI_CALLS().map((n) => n.body).join("\n");
    chk("AS-5.1", "🟢 คู่บวก (สำคัญ): ข้อความของ **ร้านตัวเอง** โผล่ใน prompt จริง — ไม่งั้นข้อ 5.2 เขียวเพราะ prompt ว่าง",
      payload.includes(MINE_MSG), "มีข้อความของร้านตัวเอง", payload ? `payload ${payload.length} ตัวอักษร` : "ไม่มี payload เลย");
    chk("AS-5.2", "🔴 ความลับของร้านอื่นต้องไม่อยู่ใน prompt",
      !payload.includes(SECRET_T2), "ไม่มี", "พบข้อมูลข้ามร้านใน prompt");
    chk("AS-5.3", "คลังความรู้ (KB) ของร้านตัวเองถูกใช้เป็นบริบท",
      payload.includes(MINE_KB), "มี KB ของร้าน", "ไม่พบ — บริบทข้อ 3 ของแผนหายไป", "MAJOR");
    chk("AS-5.4", "คลังตัวอย่างคำตอบของร้านตัวเองถูกใช้เป็นบริบท (นี่คือสิ่งที่ทำให้แม่นขึ้นตามการใช้งาน)",
      payload.includes(MINE_EXAMPLE), "มี ChatAnswerExample ของร้าน", "ไม่พบ — บริบทข้อ 2 ของแผนหายไป", "MAJOR");
    const badWhere = calls.filter((c) => /^(chatMessage|chatAnswerExample|kbArticle)\.(findMany|findFirst)$/.test(c.op))
      .filter((c) => { const w = j(c.args.where ?? {}); return !w.includes("T1") && !w.includes("S1"); });
    chk("AS-5.5", "ทุก query ที่ประกอบบริบทผูก tenantId/systemId เสมอ (ไม่มี where เปล่า)",
      badWhere.length === 0, "0 query ไร้ขอบเขต", j(badWhere.map((c) => `${c.op} ${j(c.args.where ?? {})}`.slice(0, 100))));
  });

  // ═════════ AS-6/7 · โมเดล + คำสั่งใน prompt ═════════
  await section("AS-6", "AS-6 โมเดล + กติกาที่ต้องอยู่ใน prompt:", async () => {
    if (!suggestReply) { chk("AS-6.0", "มี suggestReply", false, "มี", "ยังไม่มี"); return; }
    seedShop();
    await suggestReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", userId: "U1" });
    const call = AI_CALLS()[0];
    const payload = (() => { try { return JSON.parse(call?.body ?? "{}") as { model?: string; messages?: { role: string; content: unknown }[] }; } catch { return {}; } })();
    chk("AS-6.1", "ใช้ SMART_MODEL (งานประกอบคำตอบจากหลายแหล่ง ไม่ใช่งานเบา)",
      payload.model === provider?.SMART_MODEL, j(provider?.SMART_MODEL ?? "SMART_MODEL"), j(payload.model ?? null));
    const sysText = (payload.messages ?? []).filter((m) => m.role === "system").map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join(" ").toLowerCase();
    chk("AS-6.2", "🔴 prompt สั่งห้ามแต่งข้อมูล / ไม่รู้ให้บอกว่าไม่รู้ ([[feedback_no_fabricated_trip_data]])",
      /do not (make up|invent|fabricate|guess)|never (make up|invent|fabricate|guess)|say you (don't|do not) know/.test(sysText),
      "มีคำสั่งห้ามเดา", sysText ? sysText.slice(0, 160) : "ไม่มี system prompt");
    chk("AS-6.3", "🔴 prompt ห้ามสัญญาว่า 'จะติดต่อกลับ' ([[feedback_no_callback_promise]])",
      /call (you )?back|contact you back|get back to you|ติดต่อกลับ/.test(sysText), "มีคำสั่งห้ามสัญญาติดต่อกลับ",
      sysText ? "ไม่พบ" : "ไม่มี system prompt");
    chk("AS-6.4", "คำสั่ง (system prompt) เขียนเป็นภาษาอังกฤษ (reference_llm_thai_token_cost)",
      sysText.length > 0 && !/[฀-๿]/.test(sysText), "ไม่มีอักษรไทยในคำสั่ง",
      sysText ? "พบอักษรไทยในคำสั่ง" : "ไม่มี system prompt", "MAJOR");
    chk("AS-6.5", "🔴 การยิง LLM อยู่นอกทรานแซกชัน", AI_CALLS().length > 0 && AI_CALLS().every((n) => n.tx === null), "tx=null", j(AI_CALLS().map((n) => n.tx)));
    chk("AS-6.6", "หักเครดิตด้วย source ของ 'AI แนะนำ' (ไม่ปนกับ CHAT ของผู้ช่วย AI)",
      (tables.aiCreditTxn ?? []).some((t) => t.kind === "USAGE" && /SUGGEST/i.test(String(t.source))),
      "source มีคำว่า SUGGEST", j((tables.aiCreditTxn ?? []).map((t) => t.source)));
  });

  // ═════════ AS-8 · fail-soft ═════════
  await section("AS-8", "AS-8 🔴 พังแล้วต้องไม่ทำให้ตอบแชทไม่ได้:", async () => {
    if (!suggestReply) { chk("AS-8.0", "มี suggestReply", false, "มี", "ยังไม่มี"); return; }
    seedShop({ balanceMicro: 0 });
    const a = await suggestReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", userId: "U1" }).catch(() => ({ ok: undefined } as SRes));
    chk("AS-8.1", "เครดิตหมด → บอกตรง ๆ เป็นภาษาไทย ไม่เงียบ",
      a?.ok === false && /[฀-๿]/.test(String(a?.reason ?? "")), "ok:false + reason ไทย", j(a));
    chk("AS-8.2", "🔴 เครดิตหมดต้องไม่ยิง LLM เลย", AI_CALLS().length === 0, "0 ครั้ง", `${AI_CALLS().length} ครั้ง`);

    seedShop();
    netMode = "throw";
    let threw = false;
    let b: SRes = {};
    try { b = await suggestReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", userId: "U1" }); } catch { threw = true; }
    netMode = "ok";
    chk("AS-8.3", "provider ล่ม → ไม่ throw + reason ไทย", !threw && b?.ok === false && /[฀-๿]/.test(String(b?.reason ?? "")),
      "ok:false + reason ไทย", threw ? "throw ขึ้นมา" : j(b));
    if (sendReply) {
      const r = await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", senderUserId: "U1", body: "ตอบเองตามปกติ", unitAccess: ["*"] });
      chk("AS-8.4", "🟢 คู่บวก: AI พังแล้วทีมยังตอบลูกค้าได้ (กฎเหล็กข้อ 4)", r?.ok === true, "ok:true", j(r));
    } else {
      chk("AS-8.4", "หา sendReply ไม่ได้", false, "มี sendReply", "import ไม่ได้", "MAJOR");
    }

    seedShop({ aiSuggestEnabled: false });
    const c = await suggestReply({ tenantId: "T1", systemId: "S1", conversationId: "cv1", userId: "U1" }).catch(() => ({ ok: undefined } as SRes));
    chk("AS-8.5", "ร้านที่ปิดสวิตช์ AI แนะนำ → ปฏิเสธก่อนจ่ายเงิน",
      c?.ok === false && AI_CALLS().length === 0, "ok:false + ไม่ยิง LLM", `${j(c)} · calls=${AI_CALLS().length}`);
  });

  // ═════════ AS-10/11 · บันทึกผลลัพธ์ + คลังเรียนรู้ ═════════
  await section("AS-10", "AS-10 บันทึกผลลัพธ์: ความจริงคือ 'ข้อความที่ส่งจริง':", async () => {
    if (!recordOutcome) { chk("AS-10.0", "มี recordSuggestionOutcome", false, `หนึ่งใน ${j(ALIAS.outcome)}`, ai ? j(Object.keys(ai)) : "ยังไม่มีโมดูล"); return; }
    const seedSug = () => {
      seedShop();
      tables.chatAiSuggestion = [{ id: "sg1", tenantId: "T1", systemId: "S1", conversationId: "cv1", sourceMessageId: "m1", suggestedBody: "ราคาแพ็กเกจดำน้ำ 3,500 บาทครับ", rank: 0, model: "m", costMicro: 100, sourcesUsed: ["kb:kb1"], outcome: "PENDING", sentMessageId: null, similarity: null, createdByUserId: "U1", createdAt: new Date() }];
      tables.chatAnswerExample = (tables.chatAnswerExample ?? []).filter((e) => e.tenantId === "T2");
    };

    seedSug();
    const a = await recordOutcome({ tenantId: "T1", systemId: "S1", suggestionId: "sg1", sentMessageId: "m-sent", sentBody: "ราคาแพ็กเกจดำน้ำ 3,500 บาทครับ" });
    const s1 = (tables.chatAiSuggestion ?? [])[0];
    chk("AS-10.1", "ส่งเหมือนที่เสนอเป๊ะ → SENT_AS_IS + similarity ≥95",
      s1?.outcome === "SENT_AS_IS" && typeof s1?.similarity === "number" && (s1.similarity as number) >= 95,
      "SENT_AS_IS + ≥95", `${j(s1?.outcome ?? null)} · ${j(s1?.similarity ?? null)} · ${j(a)}`);

    seedSug();
    await recordOutcome({ tenantId: "T1", systemId: "S1", suggestionId: "sg1", sentMessageId: "m-sent", sentBody: "รอบเช้าเหลือ 2 ที่ครับ ราคา 2,900 บาท รวมอาหารกลางวัน" });
    const s2 = (tables.chatAiSuggestion ?? [])[0];
    chk("AS-10.2", "แก้แล้วค่อยส่ง → SENT_EDITED + similarity <95",
      s2?.outcome === "SENT_EDITED" && typeof s2?.similarity === "number" && (s2.similarity as number) < 95,
      "SENT_EDITED + <95", `${j(s2?.outcome ?? null)} · ${j(s2?.similarity ?? null)}`);
    const ex = (tables.chatAnswerExample ?? []).filter((e) => e.tenantId === "T1");
    chk("AS-10.3", "🔴 คลังเก็บ **ข้อความที่ส่งจริง** ไม่ใช่ที่ AI เสนอ (ของมนุษย์คือความจริงเสมอ)",
      ex.length === 1 && ex[0]?.answer === "รอบเช้าเหลือ 2 ที่ครับ ราคา 2,900 บาท รวมอาหารกลางวัน",
      "answer = ข้อความที่ส่งจริง", j(ex.map((e) => e.answer)));
    chk("AS-10.4", "ตัวอย่างในคลังผูกกลับไปที่คำแนะนำต้นทาง (fromSuggestionId) และข้อความที่ส่ง",
      ex[0]?.fromSuggestionId === "sg1" && ex[0]?.sourceMessageId === "m-sent",
      "ผูกครบ", j({ from: ex[0]?.fromSuggestionId ?? null, src: ex[0]?.sourceMessageId ?? null }));

    seedSug();
    await recordOutcome({ tenantId: "T1", systemId: "S1", suggestionId: "sg1", outcome: "IGNORED" });
    const s3 = (tables.chatAiSuggestion ?? [])[0];
    chk("AS-10.5", "ทีมกดข้าม → IGNORED (สัญญาณลบ ใช้วัดคุณภาพรายเดือน)", s3?.outcome === "IGNORED", "IGNORED", j(s3?.outcome ?? null));
    chk("AS-10.6", "🔴 IGNORED **ไม่เข้าคลัง** (สัญญาณลบห้ามกลายเป็นตัวอย่างให้เรียนรู้)",
      (tables.chatAnswerExample ?? []).filter((e) => e.tenantId === "T1").length === 0,
      "0 แถวใหม่", `${(tables.chatAnswerExample ?? []).filter((e) => e.tenantId === "T1").length} แถว`);

    seedSug();
    const bad = await recordOutcome({ tenantId: "T2", systemId: "S2", suggestionId: "sg1", outcome: "IGNORED" }).catch(() => ({ ok: false }));
    chk("AS-10.7", "แก้ผลลัพธ์ของคำแนะนำร้านอื่นไม่ได้",
      bad?.ok !== true && (tables.chatAiSuggestion ?? [])[0]?.outcome === "PENDING", "ok:false + ไม่ถูกแตะ",
      `${j(bad)} · ${j((tables.chatAiSuggestion ?? [])[0]?.outcome ?? null)}`);
  });

  chk("AS-9.9", "ไม่มี query หลุดออก DB จริง · HTTP ออกเฉพาะปลายทางที่ดักไว้",
    process.env.DATABASE_URL === "postgresql://qc:qc@127.0.0.1:1/qc-no-db" &&
    net.every((n) => /openrouter\.ai|api\.line\.me|exp\.host|bunnycdn\.com/.test(n.url)),
    "DATABASE_URL ถูกทับ · ปลายทางรู้จักทั้งหมด",
    `${String(process.env.DATABASE_URL).slice(0, 30)} · ${j([...new Set(net.map((n) => n.url.split("/")[2] ?? n.url))])}`, "MINOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT AI SUGGEST =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

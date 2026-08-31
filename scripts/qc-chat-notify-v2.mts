// QC — WO-CW5: ระบบแจ้งเตือนแชทรอบ 2 (คำสั่งข้อ 5 · ปิด G9) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — มี `qc-chat-notify.mts` (ของเดิม 23 ข้อ · ต่อ Neon prod จริง)
//    และ `qc-chat-push-badge.mts` (WO-C14 · 28 ข้อ) อยู่ก่อนแล้ว → ชุดนี้จึงชื่อ `-v2` **ห้ามเขียนทับของเดิม**
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
// ⚠️ ห้ามแตะฐานข้อมูล/เน็ตจริง → ทับ DATABASE_URL + fake prisma + ดัก globalThis.fetch (Expo)
// ⚠️ contract-first: ตัวกรองผู้รับยังไม่มี (สาย E) → ข้อที่ยังไม่มีโค้ดต้องแดงอย่างถูกต้อง
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-WHATSAPP §7 · §1 G9) ═══════
// NV-1) 🔴 **ปิด G9**: วันนี้ `sendPushToTenant` ยิงทุกเครื่องในร้านโดยไม่ดูสิทธิ์
//       ⇒ พนักงานที่ไม่มีสิทธิ์อ่านแชทลูกค้า ได้ตัวอย่างข้อความลูกค้าเด้งขึ้นหน้าจอล็อกมือถือ
//       (นี่คือข้อมูลรั่วที่ "ซ่อนเมนู" แก้ไม่ได้) → ต้องยิงเฉพาะคนที่มีสิทธิ์อ่านกล่องแชท
//       คู่บวก: ให้สิทธิ์ครบทุกคน → ต้องได้ครบทุกเครื่อง (พิสูจน์ว่าที่ไม่ได้ไม่ใช่เพราะ push พังทั้งระบบ)
// NV-2) เธรดที่มอบหมายแล้ว → ผู้รับผิดชอบต้องได้แจ้งเตือนแน่นอน (และมาก่อน)
// NV-3) ไม่แจ้งข้อความของตัวเอง (ทีมตอบ = ไม่ push) · ไม่แจ้งโน้ตภายใน
// NV-4) 🔴 ไม่แจ้งคนที่ **กำลังเปิดห้องนั้นอยู่** — สัญญาณที่ใช้คือ `ChatReadState.lastReadAt` ที่สด
//       (`markReadOnOpenAction` เขียนค่านี้ทุกครั้งที่เปิดห้องอยู่แล้ว ⇒ ไม่ต้องสร้างตารางใหม่)
// NV-5) 🔴 ตัวนับ `sent` ห้ามโกหก — นับเฉพาะใบที่ Expo ตอบ status "ok"
//       (29 ส.ค.: คืน {sent:1} ทั้งที่ Expo ปฏิเสธทุกใบ — ตัวเลขที่โกหกแพงกว่าไม่มีตัวเลข)
// NV-6) push อยู่ **นอกทรานแซกชัน** และ **ห้าม throw** — แจ้งเตือนพังต้องไม่ทำข้อความลูกค้าหาย
// NV-7) AppNotification ในเว็บยังถูกสร้างเหมือนเดิม (ช่องทางสำรองเมื่อ push ไม่ถึง)
// NV-8) payload: ไทย + ช่องทาง + ชื่อลูกค้า + ตัวอย่างข้อความ · `data` ห้ามใช้คีย์ `conversationId`
//       (แอปมือถืออ่านคีย์นั้นแล้วเปิดจอ **แชท AI** คนละตัว → จอโหลดไม่ขึ้น)
// NV-9) ฝั่งหน้าจอ (`chat-notify-client.tsx`): เสียงปิดได้และจำค่าไว้ · ห้ามเล่นเสียง/ขอสิทธิ์
//       แจ้งเตือนก่อนผู้ใช้กดเอง · เลข unread บน document.title
//
// ═══════ วิธีวัด (ไม่พึ่งชื่อฟังก์ชันใหม่) ═══════
//   ยิงข้อความลูกค้าเข้าทาง `receiveWebchatInbound` ของจริง แล้วอ่าน payload ที่ถูกส่งไป Expo
//   → วัด "ใครได้แจ้งเตือนบ้าง" จากพฤติกรรมจริง ไม่ใช่จากชื่อฟังก์ชันที่เดาเอา

try { process.loadEnvFile(".env"); } catch {}
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db";
process.env.CHAT_CREDENTIALS_KEY ??= "0".repeat(64);

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


const PUSH_SRC = strip(read("src/lib/core/push.ts"));
const NOTIFY_SRC = strip(read("src/lib/modules/chat/notify.ts"));
const CLIENT_SRC = strip(read("src/components/chat-notify-client.tsx"));

// โทเคนที่ถูกยิงจริงในรอบล่าสุด (เรียงตามลำดับที่ส่ง)
const pushedTokens = (): string[] =>
  net.filter((n) => n.url.includes("exp.host")).flatMap((n) => {
    try { return (JSON.parse(n.body) as { to?: string }[]).map((p) => String(p.to ?? "")); } catch { return []; }
  });
const pushCallsTx = () => net.filter((n) => n.url.includes("exp.host")).map((n) => n.tx);

const CONN_WEB = { id: "conn-web", tenantId: "T1", systemId: "S1", type: "WEBCHAT", displayName: "แชทหน้าเว็บ", status: "CONNECTED", externalAccountId: "webchat", credentials: {}, defaultUnitId: null };

// ── ร้านตัวอย่าง: 3 คน 3 เครื่อง ──
//   U-OWNER  = OWNER (มีสิทธิ์ทุกอย่างโดยนิยาม)
//   U-AGENT  = STAFF ที่ได้รับสิทธิ์อ่านแชท
//   U-COOK   = STAFF ในครัว **ไม่มีสิทธิ์อ่านแชทลูกค้า** ← คนนี้ต้องไม่ได้รับแจ้งเตือน
type SeedOpts = { readActionForAll?: boolean; assignTo?: string | null; viewerUserId?: string | null };
function seedShop(opts: SeedOpts = {}) {
  for (const k of Object.keys(tables)) delete tables[k];
  const READ = "chat.conversation.read";
  tables.user = [
    { id: "U-OWNER", email: "owner@example.com", name: "เจ้าของ", createdAt: new Date() },
    { id: "U-AGENT", email: "agent@example.com", name: "แอดมินเพจ", createdAt: new Date() },
    { id: "U-COOK", email: "cook@example.com", name: "พ่อครัว", createdAt: new Date() },
  ];
  tables.membership = [
    { id: "M-OWNER", userId: "U-OWNER", tenantId: "T1", role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date(), invitedAt: new Date(), createdAt: new Date() },
    { id: "M-AGENT", userId: "U-AGENT", tenantId: "T1", role: "STAFF", unitAccess: ["*"], permissions: { [READ]: true }, acceptedAt: new Date(), invitedAt: new Date(), createdAt: new Date() },
    { id: "M-COOK", userId: "U-COOK", tenantId: "T1", role: "STAFF", unitAccess: ["*"], permissions: opts.readActionForAll ? { [READ]: true } : {}, acceptedAt: new Date(), invitedAt: new Date(), createdAt: new Date() },
  ];
  tables.pushDevice = [
    { id: "pd-owner", tenantId: "T1", userId: "U-OWNER", expoToken: "ExponentPushToken[owner]", platform: "ios", createdAt: new Date() },
    { id: "pd-agent", tenantId: "T1", userId: "U-AGENT", expoToken: "ExponentPushToken[agent]", platform: "ios", createdAt: new Date() },
    { id: "pd-cook", tenantId: "T1", userId: "U-COOK", expoToken: "ExponentPushToken[cook]", platform: "android", createdAt: new Date() },
  ];
  tables.appSystem = [{ id: "S1", tenantId: "T1", type: "CHAT", name: "แชทลูกค้า", active: true, createdAt: new Date() }];
  tables.chatChannelConnection = [{ ...CONN_WEB }];
  tables.chatSetting = [{ id: "st1", tenantId: "T1", systemId: "S1", memberSystemId: null, senderAlias: "ทีมงาน", greetingMessage: {}, offlineMessage: {}, retentionDays: 365, businessHours: null, aiSuggestEnabled: false, translateEnabled: false, staffLang: "th" }];
  if (opts.assignTo !== undefined || opts.viewerUserId !== undefined) {
    // 🔴 ต้องมี channelConnectionId ให้ตรงกับห้อง cv1 — Fable แก้ 31 ส.ค.
    //    `findOrCreateContact` ค้นด้วย {systemId, channel, channelConnectionId, externalUserId}
    //    ปล่อยว่าง = undefined ≠ "conn-web" ⇒ สร้าง contact **และห้องใหม่** ทุกครั้ง
    //    ⇒ cv1 (ที่มี assignee) กับ rs1 (ChatReadState) ที่ seed ไว้ไม่เคยถูกใช้เลย
    //    = ข้อ NV-2.2/NV-3.3 เขียวไม่ได้ไม่ว่าจะเขียนโค้ดถูกแค่ไหน (ข้อสอบวัดผิดตัว ไม่ใช่โค้ดพัง)
    tables.chatContact = [{ id: "ct1", tenantId: "T1", systemId: "S1", channel: "WEBCHAT", channelConnectionId: "conn-web", externalUserId: "guest-1", displayName: "คุณเอ", lang: "th", verifiedEmail: false, blockedAt: null, createdAt: new Date() }];
    tables.chatConversation = [{ id: "cv1", tenantId: "T1", systemId: "S1", contactId: "ct1", channel: "WEBCHAT", channelConnectionId: "conn-web", status: "OPEN", staffUnreadCount: 0, unitId: null, assigneeUserId: opts.assignTo ?? null, reopenedCount: 0, tags: [], createdAt: new Date(), lastMessageAt: new Date(Date.now() - 3600_000) }];
    tables.chatMessage = [];
    // 🔴 ค่าเวลาเป็น thunk เสมอ — "กำลังเปิดห้องอยู่" คือ lastReadAt สด ๆ เมื่อกี้ ไม่ใช่เวลาโหลดไฟล์
    if (opts.viewerUserId) {
      tables.chatReadState = [{ id: "rs1", tenantId: "T1", systemId: "S1", conversationId: "cv1", userId: opts.viewerUserId, lastReadAt: new Date(), lastReadMessageId: null }];
    }
  }
  calls.length = 0;
  net.length = 0;
  netMode = "ok";
}

type Chat = {
  receiveWebchatInbound: (a: Record<string, unknown>) => Promise<{ ok: boolean; conversationId?: string; reason?: string }>;
  sendReply: (a: Record<string, unknown>) => Promise<{ ok: boolean }>;
};
const say = (chat: Chat, body: string) =>
  chat.receiveWebchatInbound({ connection: CONN_WEB, guestToken: "guest-1", body, displayName: "คุณเอ" });

try {
  const chat = (await import("@/lib/modules/chat/service" as string).catch((e) => { console.log(`  (import service ล้ม: ${e instanceof Error ? e.message.slice(0, 160) : String(e)})`); return null; })) as Chat | null;
  const push = (await import("@/lib/core/push" as string).catch(() => null)) as Record<string, unknown> | null;

  if (!chat) chk("NV-0", "import chat/service ได้", false, "import ได้", "import ไม่ได้");
  else {
    // ═════════ NV-1 · ปิด G9 (ยิงเฉพาะคนมีสิทธิ์) ═════════
    await section("NV-1", "NV-1 🔴 ยิงเฉพาะคนที่มีสิทธิ์อ่านแชทลูกค้า (ปิด G9):", async () => {
      seedShop({ assignTo: null });
      await say(chat, "สวัสดีครับ อยากสอบถามราคา");
      const tokens = pushedTokens();
      chk("NV-1.1", "🟢 คู่บวก: มีการยิง push จริง (พิสูจน์ว่าเส้นทางเดินถึงจุดที่วัด)",
        tokens.length > 0, ">0 ใบ", `${tokens.length} ใบ`);
      chk("NV-1.2", "OWNER ได้รับแจ้งเตือน", tokens.includes("ExponentPushToken[owner]"), "มี owner", j(tokens));
      chk("NV-1.3", "พนักงานที่ได้รับสิทธิ์อ่านแชทได้รับแจ้งเตือน", tokens.includes("ExponentPushToken[agent]"), "มี agent", j(tokens));
      chk("NV-1.4", "🔴 พนักงานที่ **ไม่มีสิทธิ์อ่านแชท** ต้องไม่ได้รับ (ตัวอย่างข้อความลูกค้าเด้งบนจอล็อก = ข้อมูลรั่ว)",
        !tokens.includes("ExponentPushToken[cook]"), "ไม่มี cook", j(tokens));

      seedShop({ assignTo: null, readActionForAll: true });
      await say(chat, "สวัสดีครับ");
      chk("NV-1.5", "🟢 คู่บวก: ให้สิทธิ์ครบทุกคน → ได้ครบทุกเครื่อง (ไม่ใช่ push พังทั้งระบบ)",
        pushedTokens().length === 3, "3 ใบ", `${pushedTokens().length} ใบ · ${j(pushedTokens())}`);
    });

    // ═════════ NV-2 · ผู้รับผิดชอบ ═════════
    await section("NV-2", "NV-2 เธรดที่มอบหมายแล้ว → ผู้รับผิดชอบต้องได้แน่ และมาก่อน:", async () => {
      seedShop({ assignTo: "U-AGENT" });
      await say(chat, "ขอถามเรื่องที่คุยไว้เมื่อวานครับ");
      const tokens = pushedTokens();
      chk("NV-2.1", "ผู้รับผิดชอบได้รับแจ้งเตือนแน่นอน", tokens.includes("ExponentPushToken[agent]"), "มี agent", j(tokens));
      chk("NV-2.2", "ผู้รับผิดชอบมาก่อนคนอื่นในคิวส่ง (งานของใครต้องถึงคนนั้นก่อน)",
        tokens[0] === "ExponentPushToken[agent]", "agent อยู่ลำดับแรก", j(tokens), "MAJOR");
      chk("NV-2.3", "🔴 มอบหมายแล้วก็ยังห้ามหลุดไปหาคนไม่มีสิทธิ์",
        !tokens.includes("ExponentPushToken[cook]"), "ไม่มี cook", j(tokens));
    });

    // ═════════ NV-3 · เงื่อนไขไม่แจ้ง ═════════
    await section("NV-3", "NV-3 เงื่อนไขไม่แจ้ง: ข้อความตัวเอง · โน้ตภายใน · ห้องที่เปิดอยู่:", async () => {
      seedShop({ assignTo: null });
      await say(chat, "สวัสดีครับ");
      net.length = 0;
      await chat.sendReply({ tenantId: "T1", systemId: "S1", conversationId: (tables.chatConversation ?? [])[0]?.id, senderUserId: "U-AGENT", body: "สวัสดีครับ ยินดีให้บริการ", unitAccess: ["*"] });
      chk("NV-3.1", "ทีมตอบเอง → ไม่มี push (ห้ามเด้งใส่ตัวเอง)",
        pushedTokens().length === 0, "0 ใบ", j(pushedTokens()));

      seedShop({ assignTo: null });
      await say(chat, "สวัสดีครับ");
      net.length = 0;
      await chat.sendReply({ tenantId: "T1", systemId: "S1", conversationId: (tables.chatConversation ?? [])[0]?.id, senderUserId: "U-AGENT", body: "โน้ต: ลูกค้ารายนี้ต่อราคาเก่ง", isInternal: true, unitAccess: ["*"] });
      chk("NV-3.2", "โน้ตภายใน → ไม่มี push", pushedTokens().length === 0, "0 ใบ", j(pushedTokens()));

      // U-AGENT กำลังเปิดห้องนี้อยู่ (lastReadAt สด) → ไม่ต้องเด้งซ้ำใส่หน้าที่เขามองอยู่
      seedShop({ assignTo: null, viewerUserId: "U-AGENT" });
      await say(chat, "ยังอยู่ไหมครับ");
      const tokens = pushedTokens();
      chk("NV-3.3", "🔴 คนที่กำลังเปิดห้องนั้นอยู่ (ChatReadState.lastReadAt สด) ไม่ต้องได้ push",
        !tokens.includes("ExponentPushToken[agent]"), "ไม่มี agent", j(tokens));
      chk("NV-3.4", "🟢 คู่บวก: คนอื่นที่มีสิทธิ์แต่ไม่ได้เปิดห้อง ยังได้รับตามปกติ",
        tokens.includes("ExponentPushToken[owner]"), "มี owner", j(tokens));
    });

    // ═════════ NV-6/7/8 · ตำแหน่ง tx · ไม่พาระบบพัง · payload ═════════
    await section("NV-6", "NV-6 ความปลอดภัยของเส้นทางแจ้งเตือน:", async () => {
      seedShop({ assignTo: null });
      await say(chat, "สวัสดีครับ");
      chk("NV-6.1", "🔴 push อยู่ **นอก** ทรานแซกชัน (Expo ตอบช้า = ขัง connection Neon → pool ตัน)",
        pushCallsTx().length > 0 && pushCallsTx().every((t) => t === null), "tx=null", j(pushCallsTx()));
      chk("NV-6.2", "AppNotification ในเว็บยังถูกสร้าง (ช่องทางสำรองเมื่อ push ไม่ถึง)",
        (tables.appNotification ?? []).length === 1, "1 แถว", `${(tables.appNotification ?? []).length} แถว`);

      seedShop({ assignTo: null });
      netMode = "throw";
      let threw = false;
      const r = await say(chat, "ข้อความสำคัญของลูกค้า").catch(() => { threw = true; return { ok: false }; });
      netMode = "ok";
      chk("NV-6.3", "🔴 Expo ล่ม → ไม่ throw และ **ข้อความลูกค้าไม่หาย**",
        !threw && r?.ok === true && (tables.chatMessage ?? []).some((m) => m.body === "ข้อความสำคัญของลูกค้า"),
        "ok:true + ข้อความถูกบันทึก", `${threw ? "throw" : j(r)} · rows=${(tables.chatMessage ?? []).length}`);

      seedShop({ assignTo: null });
      await say(chat, "อยากถามเรื่องราคาแพ็กเกจครับ");
      const payload = (() => { try { return (JSON.parse(net.find((n) => n.url.includes("exp.host"))?.body ?? "[]") as Record<string, unknown>[])[0] ?? {}; } catch { return {}; } })();
      chk("NV-6.4", "ข้อความแจ้งเตือนเป็นภาษาไทย + มีชื่อลูกค้า + ตัวอย่างข้อความ",
        /[฀-๿]/.test(String(payload.title ?? "") + String(payload.body ?? "")) &&
        String(payload.body ?? "").includes("คุณเอ") && String(payload.body ?? "").includes("ราคาแพ็กเกจ"),
        "ไทย + ชื่อ + ตัวอย่าง", j({ t: payload.title ?? null, b: payload.body ?? null }));
      const data = (payload.data ?? {}) as Record<string, unknown>;
      chk("NV-6.5", "🔴 `data` ห้ามใช้คีย์ `conversationId` (แอปอ่านคีย์นั้นแล้วเปิดจอแชท AI คนละตัว = จอโหลดไม่ขึ้น)",
        !("conversationId" in data), "ไม่มีคีย์นี้", j(Object.keys(data)));
      chk("NV-6.6", "`data` พาไปกล่องแชทลูกค้าได้ (chatConversationId + url)",
        typeof data.chatConversationId === "string" && typeof data.url === "string", "มีทั้งคู่", j(data));
    });
  }

  // ═════════ NV-5 · ตัวนับต้องไม่โกหก (กันถอยหลังจากบทเรียน 29 ส.ค.) ═════════
  await section("NV-5", "NV-5 🔴 ตัวเลข sent ต้องไม่โกหก:", async () => {
    const sendPushToTenant = (push?.sendPushToTenant ?? null) as ((t: string, m: Record<string, unknown>, d?: { post?: (p: unknown[]) => Promise<unknown[]> }) => Promise<{ sent: number }>) | null;
    if (!sendPushToTenant) { chk("NV-5.0", "มี sendPushToTenant", false, "มี", push ? j(Object.keys(push)) : "import ไม่ได้"); return; }
    seedShop({ assignTo: null });
    const okRes = await sendPushToTenant("T1", { title: "t", body: "b" }, { post: async (p) => p.map(() => ({ status: "ok" })) });
    chk("NV-5.1", "🟢 คู่บวก: Expo รับทุกใบ → นับตามจริง", okRes.sent === 3, "3", j(okRes));
    const badRes = await sendPushToTenant("T1", { title: "t", body: "b" }, { post: async (p) => p.map(() => ({ status: "error", message: "InvalidCredentials", details: { error: "InvalidCredentials" } })) });
    chk("NV-5.2", "🔴 Expo ปฏิเสธทุกใบ → sent ต้องเป็น 0 (เคยคืน 1 แล้วปิดทางสงสัยไปเป็นชั่วโมง)",
      badRes.sent === 0, "0", j(badRes));
    const halfRes = await sendPushToTenant("T1", { title: "t", body: "b" }, { post: async (p) => p.map((_, i) => (i === 0 ? { status: "ok" } : { status: "error", details: { error: "MessageTooBig" } })) });
    chk("NV-5.3", "รับบ้างปฏิเสธบ้าง → นับเฉพาะที่รับจริง", halfRes.sent === 1, "1", j(halfRes));
    chk("NV-5.4", "error อื่นที่ไม่ใช่ DeviceNotRegistered ต้องถูก log ไม่ใช่กลืนเงียบ",
      /logOps\(\s*"ERROR",\s*"push"/.test(PUSH_SRC), "มี logOps ERROR", "ไม่พบ");
    chk("NV-5.5", "🔴 push.ts ต้องมีทางส่งแบบเลือกผู้รับ (ไม่ใช่ยิงทุกเครื่องในร้านอย่างเดียว — G9)",
      /userIds|recipientUserIds|sendPushToUsers/.test(PUSH_SRC), "มีพารามิเตอร์/ฟังก์ชันเลือกผู้รับ",
      "มีแต่ sendPushToTenant ที่ยิงทุกเครื่อง");
  });

  // ═════════ NV-9 · ฝั่งหน้าจอ ═════════
  await section("NV-9", "NV-9 ฝั่งหน้าจอ: เสียง/สิทธิ์แจ้งเตือน/เลขบน title:", async () => {
    chk("NV-9.1", "มีคอมโพเนนต์ src/components/chat-notify-client.tsx",
      CLIENT_SRC.length > 0, "มีไฟล์", "ยังไม่มี (สาย E ยังไม่เขียน)");
    chk("NV-9.2", "เสียงเตือนปิดได้และจำค่าไว้ (localStorage)",
      /localStorage/.test(CLIENT_SRC) && /sound|เสียง/i.test(CLIENT_SRC), "มี localStorage + สวิตช์เสียง", "ไม่พบ");
    chk("NV-9.3", "🔴 ขอสิทธิ์แจ้งเตือนเฉพาะตอนผู้ใช้กดเอง ไม่ใช่เด้งขอทันทีที่เข้าหน้า",
      !/useEffect\([\s\S]{0,200}?Notification\.requestPermission/.test(CLIENT_SRC) && /requestPermission/.test(CLIENT_SRC),
      "requestPermission อยู่ใน handler ของปุ่ม", CLIENT_SRC ? "ขอทันทีตอน mount หรือไม่มีเลย" : "ยังไม่มีไฟล์");
    chk("NV-9.4", "เล่นเสียงแล้วต้อง .catch() (เบราว์เซอร์บล็อก autoplay — ห้ามโยน error ขึ้นคอนโซล)",
      /\.play\(\)\s*[\s\S]{0,40}catch/.test(CLIENT_SRC), "มี catch", "ไม่พบ");
    chk("NV-9.5", "เลข unread ขึ้นบน document.title (เห็นได้แม้สลับแท็บไปทำอย่างอื่น)",
      /document\.title/.test(CLIENT_SRC), "มี document.title", "ไม่พบ");
    chk("NV-9.6", "มี src/lib/modules/chat/notify.ts เป็นที่รวมกติกาการแจ้งเตือน (ที่เดียว ไม่กระจาย)",
      NOTIFY_SRC.length > 0, "มีไฟล์", "ยังไม่มี (สาย E ยังไม่เขียน)");
  });

  chk("NV-9.9", "ไม่มี query หลุดออก DB จริง · HTTP ออกเฉพาะ exp.host ที่ดักไว้",
    process.env.DATABASE_URL === "postgresql://qc:qc@127.0.0.1:1/qc-no-db" &&
    net.every((n) => /exp\.host|api\.line\.me/.test(n.url)),
    "DATABASE_URL ถูกทับ · ปลายทางรู้จักทั้งหมด",
    `${String(process.env.DATABASE_URL).slice(0, 30)} · ${j([...new Set(net.map((n) => n.url.split("/")[2] ?? n.url))])}`, "MINOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT NOTIFY V2 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

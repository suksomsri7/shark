// QC — WO-CW3 §5.1: ทีมงานส่งรูป/ไฟล์/ถ่ายรูปให้ลูกค้า (ปิด G3) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ชื่อนี้ยังไม่มีในรีโป (ตรวจแล้ว 31 ส.ค. 2026)
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
//
// ⚠️ ห้ามแตะฐานข้อมูล (.env ชี้ Neon prod จริง) → ทับ DATABASE_URL + fake prisma ใน require.cache
//    + ดัก globalThis.fetch (Bunny/LINE) · fake เติมค่า default ของ schema · ค่าเวลาเป็น thunk เสมอ
//
// ⚠️ contract-first: โค้ดที่วัดยังไม่มี (สาย D) → import แบบ catch(()=>null) · ข้อที่ยังไม่มีโค้ด
//    ต้อง **แดงอย่างถูกต้อง** ไม่ใช่ skip เงียบ
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-WHATSAPP §5.1 · §2 กฎเหล็กข้อ 5 · §6.2) ═══════
// AT-1) `sendReply` += `attachments?: ExternalAttachmentInput[]` — **ใช้ type เดิมของ
//       `receiveExternalInbound`** (service.ts:804) ห้ามสร้างชนิดใหม่ (2 ชนิดสำหรับของอย่างเดียวกัน
//       = อีกไม่นานจะเพี้ยนจากกัน แล้วไฟล์ขาเข้า/ขาออกแสดงผลไม่เหมือนกัน)
// AT-2) ข้อความที่มี **แต่ไฟล์ ไม่มีตัวอักษร** ต้องส่งได้ (ของเดิม `if(!body) return {ok:false}` บล็อก)
//       คู่ลบ: ไม่มีทั้ง body และไฟล์ = ปฏิเสธ
// AT-3) type ของข้อความ: mime ขึ้นต้น image/ → IMAGE · อื่น ๆ → FILE (กติกาเดียวกับขาเข้า)
// AT-4) `ChatAttachment` ถูกสร้างครบทุกไฟล์ ผูก messageId + tenantId + systemId
// AT-5) 🔴 การเขียนข้อความ + ไฟล์แนบ + outbox อยู่ **ทรานแซกชันเดียว** ·
//       การอัปโหลด (Bunny) และการยิงออกช่องทาง (LINE) อยู่ **นอกทรานแซกชันเสมอ**
//       (network ใน tx = ถือ connection Neon ค้าง → pool ตันทั้งแพลตฟอร์ม)
// AT-6) เพดาน 10 MB ใช้ `CHAT_ATTACHMENT_MAX_BYTES` ตัวเดิม (ห้ามพิมพ์ตัวเลขซ้ำ) · เกิน = ปฏิเสธ
// AT-7) MIME นอก `ALLOWED_UPLOAD_TYPES` = ปฏิเสธ (ทะเบียนเดียวกับ storage/service.ts)
// AT-8) LINE ต้องได้ **image message จริง** ไม่ใช่ทิ้งไฟล์เงียบ ๆ
//       คู่บวก: ข้อความตัวอักษรบนเธรด LINE เดียวกันต้องยังยิงเป็น text (พิสูจน์ว่ากับดัก fetch
//       จับได้จริง — บทเรียน WO-C3b: adapter โยน TOKEN_MISSING ก่อนถึงจุดวัด = เขียวหลอก)
// AT-9) ช่องทางที่ยังไม่มี adapter → บันทึกในระบบตามปกติ ห้าม throw (ข้อความของทีมต้องไม่หาย)
// AT-10) preview ของข้อความที่มีแต่ไฟล์ ต้องไม่ว่าง (หน้ารายการ inbox ต้องไม่เป็นบรรทัดเปล่า)
// AT-11) แนบได้ไม่เกิน 10 รายการต่อข้อความ (กติกาเดียวกับขาเข้า)
// AT-12) อัปโหลดล้ม → คืนเหตุผลภาษาไทย ไม่ throw และ **ต้องไม่เขียนข้อความครึ่ง ๆ กลาง ๆ**
// AT-13) 🔴 WO-CV14 ต่อเนื่อง (Fable ตัดสิน 2 ก.ย.): ด่านชนิดไฟล์ของ `uploadReplyFiles` ต้อง
//        **normalize ก่อนเทียบทะเบียน** ให้ตรงกับ `sendVoiceReplyAction` และ `uploadFile`
//        เหตุ: mime ที่มีพารามิเตอร์ห้อย (`audio/wav;codecs=1` · `audio/webm;codecs=opus`) เป็นของจริง
//        ที่เบราว์เซอร์คืนมา ⇒ เทียบดิบ = ไฟล์ที่ระบบรับอยู่แล้วถูกปฏิเสธ โดยที่ storage เองรับได้
//        และข้อความ error ของด่านนี้ต้อง **สร้างจากทะเบียน** ไม่ใช่พิมพ์ลิสต์นามสกุลไว้เอง
//        (ลิสต์พิมพ์มือ = ทะเบียนที่สอง — วันที่เพิ่มชนิดใหม่ ข้อความจะโกหกผู้ใช้ทันที)
//
// ═══════ สัญญาชื่อ/ช่องฟอร์มที่สาย D ต้องทำตาม (ถ้าเปลี่ยน ให้แก้ค่าคงที่ตรงนี้ ไม่ใช่แก้ตรรกะ) ═══════
//   sendReplyAction: ไฟล์มาในช่อง FormData ชื่อ "files" (multiple) — `formData.getAll("files")`
//   sendReply({ ..., attachments: ExternalAttachmentInput[] })  // url ต้องอัปเสร็จแล้วก่อนเรียก

try { process.loadEnvFile(".env"); } catch {}
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db";
process.env.CHAT_CREDENTIALS_KEY ??= "0".repeat(64);
// เปิด storage ด้วยค่าปลอม — ต้องให้ uploadFile "เดินไปถึงจุดยิง" จริง ไม่งั้นวัดตำแหน่ง tx ไม่ได้
process.env.SHARK_BUNNY_ZONE = "qc-zone";
process.env.SHARK_BUNNY_KEY = "qc-key";
process.env.SHARK_BUNNY_CDN = "https://qc-cdn.example.com";

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
type NetCall = { url: string; method: string; body: string; tx: number | null };
const net: NetCall[] = [];
let netMode: "ok" | "fail" = "ok";
globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: unknown }) => {
  const url = String(typeof input === "object" && input && "url" in input ? (input as { url: string }).url : input);
  let body = "";
  try { body = typeof init?.body === "string" ? init.body : init?.body ? "<binary>" : ""; } catch { body = ""; }
  net.push({ url, method: init?.method ?? "GET", body, tx: txId });
  if (netMode === "fail") return { ok: false, status: 500, text: async () => "boom", json: async () => ({}) };
  return { ok: true, status: 200, text: async () => "{}", json: async () => ({ sentMessages: [{ id: "line-1" }] }) };
}) as unknown as typeof fetch;

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
// 🔴 ตัดคอมเมนต์ก่อน grep เสมอ (คอมเมนต์ที่เล่าอดีต = ผลลบปลอม)
const strip = (s: string) => s.replace(/([a-z])\/\*/g, "$1/\u0000").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\u0000/g, "*").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1"); // 🔴 D24: กัน `image/*` `audio/*` ในสตริงถูกนับเป็นเปิดคอมเมนต์ (เคยกินโค้ดหาย 12k ตัวอักษร)
const SERVICE_SRC = strip(read("src/lib/modules/chat/service.ts"));
const ACTIONS_SRC = strip(read("src/lib/modules/chat/actions.ts"));

const LINE_CREDS = { channelAccessToken: "TOKEN-QC", channelSecret: "SECRET-QC" };
function seedShop() {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.chatChannelConnection = [
    { id: "conn-web", tenantId: "T1", systemId: "S1", type: "WEBCHAT", displayName: "แชทหน้าเว็บ", status: "CONNECTED", externalAccountId: "webchat", credentials: {}, defaultUnitId: null },
    { id: "conn-line", tenantId: "T1", systemId: "S1", type: "LINE", displayName: "LINE OA", status: "CONNECTED", externalAccountId: "@qc", credentials: LINE_CREDS, defaultUnitId: null },
    { id: "conn-fb", tenantId: "T1", systemId: "S1", type: "FACEBOOK", displayName: "Messenger", status: "CONNECTED", externalAccountId: "fb", credentials: {}, defaultUnitId: null },
  ];
  tables.chatSetting = [{ id: "st1", tenantId: "T1", systemId: "S1", memberSystemId: null, senderAlias: "ทีมงาน", greetingMessage: {}, offlineMessage: {}, retentionDays: 365 }];
  tables.chatContact = [
    { id: "ct-web", tenantId: "T1", systemId: "S1", channel: "WEBCHAT", externalUserId: "guest-1", displayName: "คุณเอ", verifiedEmail: false, blockedAt: null, createdAt: new Date() },
    { id: "ct-line", tenantId: "T1", systemId: "S1", channel: "LINE", externalUserId: "Uline1", displayName: "คุณบี", verifiedEmail: false, blockedAt: null, createdAt: new Date() },
    { id: "ct-fb", tenantId: "T1", systemId: "S1", channel: "FACEBOOK", externalUserId: "fb1", displayName: "คุณซี", verifiedEmail: false, blockedAt: null, createdAt: new Date() },
  ];
  tables.chatConversation = [
    { id: "cv-web", tenantId: "T1", systemId: "S1", contactId: "ct-web", channel: "WEBCHAT", channelConnectionId: "conn-web", status: "OPEN", staffUnreadCount: 1, unitId: null, assigneeUserId: null, reopenedCount: 0, tags: [], createdAt: new Date(), lastMessageAt: new Date() },
    { id: "cv-line", tenantId: "T1", systemId: "S1", contactId: "ct-line", channel: "LINE", channelConnectionId: "conn-line", status: "OPEN", staffUnreadCount: 1, unitId: null, assigneeUserId: null, reopenedCount: 0, tags: [], createdAt: new Date(), lastMessageAt: new Date() },
    { id: "cv-fb", tenantId: "T1", systemId: "S1", contactId: "ct-fb", channel: "FACEBOOK", channelConnectionId: "conn-fb", status: "OPEN", staffUnreadCount: 1, unitId: null, assigneeUserId: null, reopenedCount: 0, tags: [], createdAt: new Date(), lastMessageAt: new Date() },
  ];
  tables.chatMessage = [];
  tables.chatAttachment = [];
  calls.length = 0;
  net.length = 0;
  netMode = "ok";
}

const IMG = { url: "https://qc-cdn.example.com/t/T1/attachment/a1.jpg", mimeType: "image/jpeg", fileName: "a1.jpg", sizeBytes: 1234, storageKey: "t/T1/attachment/a1.jpg" };
const PDF = { url: "https://qc-cdn.example.com/t/T1/attachment/a2.pdf", mimeType: "application/pdf", fileName: "a2.pdf", sizeBytes: 2345, storageKey: "t/T1/attachment/a2.pdf" };

type SendReply = (a: Record<string, unknown>) => Promise<{ ok: boolean; reason?: string; messageId?: string }>;

try {
  const svc = (await import("@/lib/modules/chat/service" as string).catch((e) => { console.log(`  (import service ล้ม: ${e instanceof Error ? e.message.slice(0, 160) : String(e)})`); return null; })) as Record<string, unknown> | null;
  const sendReply = (svc?.sendReply ?? null) as SendReply | null;
  const chatActions = (await import("@/lib/modules/chat/actions" as string).catch(() => null)) as Record<string, (fd: FormData) => Promise<unknown>> | null;
  const storage = (await import("@/lib/storage/service" as string).catch(() => null)) as { CHAT_ATTACHMENT_MAX_BYTES?: number; ALLOWED_UPLOAD_TYPES?: Record<string, string> } | null;

  if (!sendReply) chk("AT-0", "import chat/service + sendReply ได้", false, "มี sendReply", "import ไม่ได้");

  // ═════════ AT-1 · สัญญาชนิดข้อมูล ═════════
  await section("AT-1", "AT-1 สัญญาชนิดข้อมูล (ห้ามสร้างชนิดซ้ำ):", async () => {
    chk("AT-1.1", "`sendReply` รับ attachments",
      /export async function sendReply\(args:\s*\{[\s\S]{0,900}?attachments\??:/.test(SERVICE_SRC),
      "signature มี attachments", "ยังรับแค่ body: string (G3)");
    chk("AT-1.2", "🔴 ใช้ `ExternalAttachmentInput` ตัวเดิม ไม่สร้างชนิดใหม่สำหรับของอย่างเดียวกัน",
      /export async function sendReply\(args:\s*\{[\s\S]{0,900}?attachments\??:\s*ExternalAttachmentInput\[\]/.test(SERVICE_SRC),
      "attachments?: ExternalAttachmentInput[]", "ไม่พบ (ยังไม่มี หรือใช้ชนิดใหม่)");
    chk("AT-1.3", "ยังคง export `ExternalAttachmentInput` ให้ทั้งขาเข้า/ขาออกใช้ร่วมกัน",
      /export type ExternalAttachmentInput/.test(SERVICE_SRC), "มี export", "หายไป");
  });

  // ═════════ AT-2/3/4 · ส่งไฟล์ได้จริง ═════════
  await section("AT-2", "AT-2 ส่งไฟล์อย่างเดียว (ไม่มีตัวอักษร) ต้องส่งได้:", async () => {
    if (!sendReply) { chk("AT-2.0", "มี sendReply", false, "มี", "ไม่มี"); return; }
    seedShop();
    const r = await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv-web", senderUserId: "U1", body: "", attachments: [IMG], unitAccess: ["*"] });
    chk("AT-2.1", "🔴 ข้อความที่มีแต่ไฟล์ ส่งได้ (ของเดิม `if(!body) return {ok:false}` บล็อกอยู่)",
      r?.ok === true, "ok:true", j(r));
    const msg = (tables.chatMessage ?? [])[0];
    chk("AT-2.2", "ข้อความถูกเขียนจริง ทิศ OUT", msg?.direction === "OUT", "OUT", j(msg?.direction ?? null));
    chk("AT-2.3", "type = IMAGE เมื่อ mime ขึ้นต้น image/", msg?.type === "IMAGE", "IMAGE", j(msg?.type ?? null));
    const att = (tables.chatAttachment ?? [])[0];
    chk("AT-2.4", "สร้าง ChatAttachment ผูก messageId + tenantId + systemId",
      !!att && att.messageId === msg?.id && att.tenantId === "T1" && att.systemId === "S1",
      "ครบ 3 ฟิลด์", j(att ?? null));
    chk("AT-2.5", "🔴 preview ของข้อความที่มีแต่ไฟล์ต้องไม่ว่าง (หน้ารายการ inbox ห้ามเป็นบรรทัดเปล่า)",
      typeof (tables.chatConversation ?? []).find((c) => c.id === "cv-web")?.lastMessagePreview === "string" &&
      String((tables.chatConversation ?? []).find((c) => c.id === "cv-web")?.lastMessagePreview ?? "").trim() !== "",
      "มีข้อความ เช่น 'รูปภาพ'", j((tables.chatConversation ?? []).find((c) => c.id === "cv-web")?.lastMessagePreview ?? null));

    seedShop();
    const r2 = await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv-web", senderUserId: "U1", body: "", attachments: [PDF], unitAccess: ["*"] });
    chk("AT-2.6", "type = FILE เมื่อไม่ใช่รูป",
      r2?.ok === true && (tables.chatMessage ?? [])[0]?.type === "FILE", "FILE", `${j(r2)} · ${j((tables.chatMessage ?? [])[0]?.type ?? null)}`);

    seedShop();
    const r3 = await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv-web", senderUserId: "U1", body: "", attachments: [], unitAccess: ["*"] });
    chk("AT-2.7", "🟢 คู่ลบ: ไม่มีทั้งตัวอักษรและไฟล์ = ปฏิเสธ (ไม่ใช่ปล่อยผ่านทุกกรณี)",
      r3?.ok === false && (tables.chatMessage ?? []).length === 0, "ok:false + ไม่มีแถว", `${j(r3)} · rows=${(tables.chatMessage ?? []).length}`);

    seedShop();
    // 🔴 ต้องมี body ด้วย — ไม่งั้นวันนี้มันแดง/เขียวเพราะด่าน "ข้อความว่าง" ไม่ใช่เพราะด่านจำนวนไฟล์
    //    (ข้อสอบที่ผ่านด้วยเหตุผลอื่น = เขียวหลอก)
    const many = Array.from({ length: 11 }, (_, i) => ({ ...IMG, url: `${IMG.url}?i=${i}` }));
    const r4 = await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv-web", senderUserId: "U1", body: "ดูรูปนี้", attachments: many, unitAccess: ["*"] });
    chk("AT-2.8", "แนบเกิน 10 รายการต่อข้อความ = ปฏิเสธ (กติกาเดียวกับขาเข้า) · มี body ด้วยเพื่อไม่ให้ด่าน 'ข้อความว่าง' ตัดสินแทน",
      r4?.ok === false && (tables.chatMessage ?? []).length === 0, "ok:false + ไม่มีแถว", `${j(r4)} · rows=${(tables.chatMessage ?? []).length}`);
  });

  // ═════════ AT-5 · ตำแหน่งทรานแซกชัน ═════════
  await section("AT-5", "AT-5 🔴 ทรานแซกชัน: ข้อมูลอยู่ใน tx เดียว · network อยู่นอก tx:", async () => {
    if (!sendReply) { chk("AT-5.0", "มี sendReply", false, "มี", "ไม่มี"); return; }
    seedShop();
    await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv-line", senderUserId: "U1", body: "", attachments: [IMG], unitAccess: ["*"] });
    const msgCreate = calls.find((c) => c.op === "chatMessage.create");
    const attCreate = calls.find((c) => c.op === "chatAttachment.create" || c.op === "chatAttachment.createMany");
    chk("AT-5.1", "ข้อความ + ไฟล์แนบเขียนในทรานแซกชันเดียวกัน (ไฟล์กำพร้า/ข้อความไม่มีไฟล์ = ผู้ใช้เห็นของไม่ครบ)",
      !!msgCreate && !!attCreate && msgCreate.tx !== null && msgCreate.tx === attCreate.tx,
      "tx เดียวกันและไม่ใช่ null", `msg.tx=${j(msgCreate?.tx ?? null)} att.tx=${j(attCreate?.tx ?? null)}`);
    const lineCalls = net.filter((n) => n.url.includes("api.line.me"));
    chk("AT-5.2", "🔴 การยิงออก LINE อยู่ **นอก** ทรานแซกชัน (network ใน tx = pool ของ Neon ตัน)",
      lineCalls.length > 0 && lineCalls.every((n) => n.tx === null),
      "ยิงจริง + tx=null", `calls=${lineCalls.length} tx=${j(lineCalls.map((n) => n.tx))}`);
  });

  // ═════════ AT-8 · LINE ต้องได้ image message จริง ═════════
  await section("AT-8", "AT-8 LINE ได้ image message จริง (มีคู่บวกว่าเส้นทางเดินถึง):", async () => {
    if (!sendReply) { chk("AT-8.0", "มี sendReply", false, "มี", "ไม่มี"); return; }
    seedShop();
    await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv-line", senderUserId: "U1", body: "", attachments: [IMG], unitAccess: ["*"] });
    const push = net.filter((n) => n.url.includes("api.line.me") && n.url.includes("/message/push"));
    chk("AT-8.1", "🔴 ยิงเป็น image message พร้อม originalContentUrl (ไม่ใช่ทิ้งไฟล์เงียบ ๆ)",
      push.some((n) => /"type"\s*:\s*"image"/.test(n.body) && n.body.includes(IMG.url)),
      `image + ${IMG.url}`, push.length ? push.map((n) => n.body.slice(0, 160)).join(" | ") : "ไม่มีการยิงออก LINE เลย");

    seedShop();
    await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv-line", senderUserId: "U1", body: "สวัสดีครับ", unitAccess: ["*"] });
    const pushText = net.filter((n) => n.url.includes("/message/push"));
    chk("AT-8.2", "🟢 คู่บวก: ข้อความตัวอักษรบนเธรด LINE เดียวกันยังยิงเป็น text จริง (พิสูจน์ว่ากับดัก fetch จับได้ · บทเรียน WO-C3b)",
      pushText.some((n) => /"type"\s*:\s*"text"/.test(n.body) && n.body.includes("สวัสดีครับ")),
      "text + เนื้อความ", pushText.length ? pushText.map((n) => n.body.slice(0, 160)).join(" | ") : "ไม่มีการยิงออกเลย");

    seedShop();
    const r = await sendReply({ tenantId: "T1", systemId: "S1", conversationId: "cv-fb", senderUserId: "U1", body: "", attachments: [IMG], unitAccess: ["*"] });
    chk("AT-8.3", "ช่องทางที่ยังไม่มี adapter (FACEBOOK) → บันทึกในระบบตามปกติ ไม่ throw",
      r?.ok === true && (tables.chatMessage ?? []).length === 1, "ok:true + มีแถว", `${j(r)} · rows=${(tables.chatMessage ?? []).length}`);
    chk("AT-8.4", "และสถานะส่งบอกความจริง (FAILED + เหตุผล) ไม่ใช่ SENT ทั้งที่ไม่มีทางส่งได้",
      (tables.chatMessage ?? [])[0]?.deliveryStatus === "FAILED", "FAILED",
      j((tables.chatMessage ?? [])[0]?.deliveryStatus ?? null), "MAJOR");
  });

  // ═════════ AT-6/7 · เพดานขนาด + ชนิดไฟล์ (ทะเบียนเดียวกับ storage) ═════════
  await section("AT-6", "AT-6 เพดาน 10MB + allowlist ต้องมาจากทะเบียนเดียว:", async () => {
    chk("AT-6.1", "storage export CHAT_ATTACHMENT_MAX_BYTES = 10MB",
      storage?.CHAT_ATTACHMENT_MAX_BYTES === 10 * 1024 * 1024, "10485760", j(storage?.CHAT_ATTACHMENT_MAX_BYTES ?? null));
    chk("AT-6.2", "🔴 ฝั่งทีมงานใช้ค่าคงที่ตัวเดียวกัน ไม่พิมพ์ตัวเลขซ้ำ (เพดาน 2 ที่ = อีกไม่นานเพี้ยนจากกัน)",
      /CHAT_ATTACHMENT_MAX_BYTES/.test(ACTIONS_SRC) || /CHAT_ATTACHMENT_MAX_BYTES/.test(SERVICE_SRC),
      "อ้างค่าคงที่", "ไม่พบการอ้างค่าคงที่ในฝั่งทีมงาน");
    chk("AT-6.3", "allowlist ชนิดไฟล์เป็นทะเบียนเดียว (ALLOWED_UPLOAD_TYPES) และไม่มี fallback .bin",
      !!storage?.ALLOWED_UPLOAD_TYPES && Object.values(storage.ALLOWED_UPLOAD_TYPES).every((v) => v !== "bin"),
      "ไม่มี bin", j(storage?.ALLOWED_UPLOAD_TYPES ?? null));
  });

  // ═════════ AT-9 · เส้นทางจริงของทีมงาน (action → upload → sendReply) ═════════
  await section("AT-9", "AT-9 เส้นทางจริงจากฟอร์ม: อัปโหลดนอก tx · เกินขนาด/ผิดชนิด = ปฏิเสธ:", async () => {
    const act = chatActions?.sendReplyAction;
    if (!act) { chk("AT-9.0", "มี sendReplyAction", false, "มี", chatActions ? j(Object.keys(chatActions)) : "import ไม่ได้"); return; }
    const mkFd = (files: File[], body = "") => {
      const fd = new FormData();
      fd.set("systemId", "S1"); fd.set("conversationId", "cv-web"); fd.set("body", body);
      for (const f of files) fd.append("files", f);
      return fd;
    };
    const catchRedirect = async (fn: () => unknown) => { try { await fn(); return "ไม่ throw"; } catch (e) { return e instanceof Error ? `${e.name}:${e.message.slice(0, 80)}` : String(e); } };

    seedShop();
    const okFile = new File([new Uint8Array(32)], "photo.jpg", { type: "image/jpeg" });
    await catchRedirect(() => act(mkFd([okFile])));
    const bunny = net.filter((n) => n.url.includes("storage.bunnycdn.com"));
    // 🔴 คู่บวกของทั้งหมวด: ถ้าเส้นทางอัปไฟล์ยังไม่มีเลย ข้อ 9.4–9.6 จะ "เขียวหลอก"
    //    (ไม่มีอะไรถูกเขียนเพราะไม่มีฟีเจอร์ ไม่ใช่เพราะด่านทำงาน) → ผูกทุกข้อไว้กับตัวนี้
    const hasUploadPath = bunny.length === 1;
    chk("AT-9.1", "ฟอร์มของทีมงานรับไฟล์ (ช่อง `files`) แล้วอัปขึ้น storage จริง",
      hasUploadPath, "อัปโหลด 1 ไฟล์", `${bunny.length} ครั้ง · net=${j(net.map((n) => n.url.slice(0, 60)))}`);
    chk("AT-9.2", "🔴 อัปโหลดเกิด **นอก** ทรานแซกชัน (Bunny ช้า = ขัง connection Neon)",
      bunny.length > 0 && bunny.every((n) => n.tx === null), "tx=null", j(bunny.map((n) => n.tx)));
    chk("AT-9.3", "ข้อความ + ChatAttachment ถูกบันทึกหลังอัปเสร็จ",
      (tables.chatMessage ?? []).length === 1 && (tables.chatAttachment ?? []).length === 1,
      "msg 1 · att 1", `msg ${(tables.chatMessage ?? []).length} · att ${(tables.chatAttachment ?? []).length}`);

    seedShop();
    const bigFile = new File([new Uint8Array(11 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    await catchRedirect(() => act(mkFd([bigFile])));
    chk("AT-9.4", "ไฟล์เกิน 10MB → ไม่อัป ไม่เขียนข้อความ (บอกก่อน ไม่ใช่ปล่อยอัปแล้วค่อยเด้ง error)",
      hasUploadPath && net.filter((n) => n.url.includes("bunnycdn")).length === 0 && (tables.chatMessage ?? []).length === 0,
      "อัป 0 · msg 0 (และต้องมีเส้นทางอัปไฟล์อยู่จริง)", hasUploadPath ? `อัป ${net.filter((n) => n.url.includes("bunnycdn")).length} · msg ${(tables.chatMessage ?? []).length}` : "ยังไม่มีเส้นทางอัปไฟล์ — ข้อนี้พิสูจน์อะไรไม่ได้");

    seedShop();
    const badFile = new File([new Uint8Array(32)], "hack.exe", { type: "application/x-msdownload" });
    await catchRedirect(() => act(mkFd([badFile])));
    chk("AT-9.5", "MIME นอก allowlist → ปฏิเสธ ไม่เขียนข้อความ",
      hasUploadPath && (tables.chatMessage ?? []).length === 0, "msg 0 (และต้องมีเส้นทางอัปไฟล์อยู่จริง)",
      hasUploadPath ? `msg ${(tables.chatMessage ?? []).length}` : "ยังไม่มีเส้นทางอัปไฟล์ — ข้อนี้พิสูจน์อะไรไม่ได้");

    seedShop();
    netMode = "fail";
    await catchRedirect(() => act(mkFd([new File([new Uint8Array(32)], "photo.jpg", { type: "image/jpeg" })])));
    chk("AT-9.6", "🔴 อัปโหลดล้ม → ไม่มีข้อความครึ่ง ๆ กลาง ๆ ค้างในเธรด (และไม่ throw ขึ้นหน้าจอ)",
      hasUploadPath && (tables.chatMessage ?? []).length === 0 && (tables.chatAttachment ?? []).length === 0,
      "ไม่มีแถวใด ๆ (และต้องมีเส้นทางอัปไฟล์อยู่จริง)",
      hasUploadPath ? `msg ${(tables.chatMessage ?? []).length} · att ${(tables.chatAttachment ?? []).length}` : "ยังไม่มีเส้นทางอัปไฟล์ — ข้อนี้พิสูจน์อะไรไม่ได้");
    netMode = "ok";

    seedShop();
    await catchRedirect(() => act(mkFd([], "ข้อความล้วน")));
    chk("AT-9.7", "🟢 คู่บวก: ส่งข้อความตัวอักษรล้วน (ไม่มีไฟล์) ยังทำงานเหมือนเดิม",
      (tables.chatMessage ?? []).length === 1 && net.filter((n) => n.url.includes("bunnycdn")).length === 0,
      "msg 1 · ไม่อัปอะไร", `msg ${(tables.chatMessage ?? []).length} · อัป ${net.filter((n) => n.url.includes("bunnycdn")).length}`);
  });

  // ═════════ AT-13 · normalize mime ที่ด่านไฟล์แนบ + ข้อความ error จากทะเบียน ═════════
  await section("AT-13", "AT-13 🔴 mime ที่มีพารามิเตอร์ห้อยต้องผ่านด่าน + ข้อความบอกชนิดต้องมาจากทะเบียน:", async () => {
    const act = chatActions?.sendReplyAction;
    if (!act) { chk("AT-13.0", "มี sendReplyAction", false, "มี", "ไม่มี"); return; }
    const mkFd = (files: File[]) => {
      const fd = new FormData();
      fd.set("systemId", "S1"); fd.set("conversationId", "cv-web"); fd.set("body", "");
      for (const f of files) fd.append("files", f);
      return fd;
    };
    const run = async (fn: () => unknown) => { try { await fn(); } catch { /* action โยน redirect/ChatError ได้ตามปกติ */ } };

    seedShop();
    await run(() => act(mkFd([new File([new Uint8Array(32)], "เสียงลูกค้า.wav", { type: "audio/wav;codecs=1" })])));
    const msgs = tables.chatMessage ?? [];
    const atts = tables.chatAttachment ?? [];
    const bunny = net.filter((n) => n.url.includes("storage.bunnycdn.com"));
    chk("AT-13.1", "🔴 `audio/wav;codecs=1` ต้อง **ผ่าน** ด่าน (storage เองรับ `audio/wav` อยู่แล้ว — เทียบดิบคือปฏิเสธของที่ระบบรับได้)",
      msgs.length === 1 && atts.length === 1 && bunny.length === 1,
      "msg 1 · att 1 · อัป 1", `msg ${msgs.length} · att ${atts.length} · อัป ${bunny.length}`);
    chk("AT-13.2", "mime ที่บันทึกลง ChatAttachment เป็นชื่อในทะเบียน (ตัด `;codecs=…` ทิ้ง) ไม่ใช่ค่าดิบ",
      atts[0]?.mimeType === "audio/wav", "audio/wav", j(atts[0]?.mimeType ?? null));
    chk("AT-13.3", "ไฟล์ถูกอัปด้วยนามสกุล `.wav` จริง (Bunny เสิร์ฟ Content-Type จากนามสกุล)",
      bunny.length === 1 && /\.wav$/.test(String(bunny[0]?.url ?? "")), "path ลงท้าย .wav", j(bunny[0]?.url ?? null));
    chk("AT-13.4", "ชนิดข้อความยังเป็น FILE (ไม่มี durationMs = ไม่ใช่ข้อความเสียง)",
      msgs[0]?.type === "FILE" && atts[0]?.durationMs == null, "FILE + durationMs null", j({ t: msgs[0]?.type ?? null, d: atts[0]?.durationMs ?? null }));

    seedShop();
    await run(() => act(mkFd([new File([new Uint8Array(32)], "hack.exe", { type: "application/x-msdownload;charset=binary" })])));
    chk("AT-13.5", "🔴 คู่ลบ: normalize แล้วยังไม่อยู่ในทะเบียน = ปฏิเสธเหมือนเดิม (normalize ≠ ปล่อยผ่าน)",
      (tables.chatMessage ?? []).length === 0 && net.filter((n) => n.url.includes("bunnycdn")).length === 0,
      "msg 0 · อัป 0", `msg ${(tables.chatMessage ?? []).length} · อัป ${net.filter((n) => n.url.includes("bunnycdn")).length}`);

    // ── ข้อความบอกชนิดที่รับได้ ต้องมาจากทะเบียน ไม่ใช่พิมพ์มือ ──
    chk("AT-13.6", "ด่านนี้ normalize ก่อนเทียบทะเบียน (เลิกเทียบ `f.type` ดิบ)",
      /normalizeUploadType\(\s*f\.type\s*\)/.test(ACTIONS_SRC) && !/\(f\.type \?\? ""\)\.trim\(\)\.toLowerCase\(\)/.test(ACTIONS_SRC),
      "ใช้ normalizeUploadType(f.type)", "ยังเทียบ f.type ดิบ");
    // ขอบเขต: วัดเฉพาะ **ด่านไฟล์แนบ** (`uploadReplyFiles`) ตามที่ Fable สั่ง — เส้นทางข้อความเสียง
    // (`sendVoiceReplyAction`) ยังมีลิสต์พิมพ์มืออยู่และ **ตกยุคแล้ว** (ไม่มี wav ทั้งที่ตัวอัดใช้ wav
    // เป็นทางลงบน iOS ตั้งแต่ 2 ก.ย.) — รายงานให้ Fable ส่งต่อสาย M ไม่แก้ข้ามสายเอง
    const UPLOAD_FN = (() => {
      const i = ACTIONS_SRC.indexOf("async function uploadReplyFiles");
      if (i < 0) return "";
      const j2 = ACTIONS_SRC.slice(i + 10).search(/\nexport\s/);
      return j2 < 0 ? ACTIONS_SRC.slice(i) : ACTIONS_SRC.slice(i, i + 10 + j2);
    })();
    chk("AT-13.7", "🔴 ข้อความ error ของด่านไฟล์แนบ ไม่มีลิสต์นามสกุลพิมพ์มือ (ทะเบียนที่สอง) — ต้องสร้างจาก ALLOWED_UPLOAD_TYPES",
      UPLOAD_FN !== "" && !/jpg\/png\/webp|webm\/m4a\/mp3/.test(UPLOAD_FN) && /uploadExtensions\(/.test(UPLOAD_FN),
      "สร้างจากทะเบียน",
      UPLOAD_FN === "" ? "หา uploadReplyFiles ไม่เจอ" : (/jpg\/png\/webp|webm\/m4a\/mp3/.test(UPLOAD_FN) ? "ยังพิมพ์ลิสต์นามสกุลไว้ในข้อความ" : "ไม่ได้สร้างจากทะเบียน"));
  });

  // ═════════ AT-10 · PDPA: ไฟล์แนบขาออกต้องถูกกวาดเหมือนขาเข้า ═════════
  await section("AT-10", "AT-10 PDPA: ไฟล์แนบของทีมก็ต้องถูกกวาดตาม retentionDays:", async () => {
    const ret = (await import("@/lib/modules/chat/retention" as string).catch(() => null)) as { purgeExpiredChatMessages?: (o: Record<string, unknown>) => Promise<{ purged: number }> } | null;
    if (!ret?.purgeExpiredChatMessages) { chk("AT-10.0", "มี purgeExpiredChatMessages", false, "มี", "ไม่มี"); return; }
    seedShop();
    const now = new Date();                                  // 🔴 ห้ามฮาร์ดโค้ดวันที่ — ข้อสอบเน่าตามเวลา
    const old = new Date(now.getTime() - 400 * 24 * 3600 * 1000); // เกิน retention 365 วัน
    tables.chatMessage = [{ id: "m-old", tenantId: "T1", systemId: "S1", conversationId: "cv-web", direction: "OUT", type: "IMAGE", body: null, isInternal: false, deliveryStatus: "SENT", createdAt: old, purgedAt: null }];
    tables.chatAttachment = [{ id: "a-old", tenantId: "T1", systemId: "S1", messageId: "m-old", kind: "IMAGE", url: IMG.url, fileName: "a1.jpg", storageKey: IMG.storageKey, mimeType: "image/jpeg" }];
    await ret.purgeExpiredChatMessages({ now });
    const a = (tables.chatAttachment ?? [])[0];
    chk("AT-10.1", "url + fileName ของไฟล์แนบถูกล้าง", a?.url === "" && a?.fileName === "", "ว่างทั้งคู่", j(a));
    chk("AT-10.2", "แต่ storageKey ยังอยู่ (handle เดียวที่จะไปลบไฟล์จริงบน CDN ได้ทีหลัง)",
      a?.storageKey === IMG.storageKey, "คงเดิม", j(a?.storageKey ?? null));
  });

  chk("AT-9.9", "ไม่มี query หลุดออก DB จริง · HTTP ออกเฉพาะปลายทางที่ดักไว้ (bunny/line)",
    process.env.DATABASE_URL === "postgresql://qc:qc@127.0.0.1:1/qc-no-db" &&
    net.every((n) => n.url.includes("bunnycdn.com") || n.url.includes("api.line.me")),
    "DATABASE_URL ถูกทับ · ปลายทางรู้จักทั้งหมด", `${String(process.env.DATABASE_URL).slice(0, 30)} · ${j([...new Set(net.map((n) => n.url.split("/")[2] ?? n.url))])}`, "MINOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT ATTACHMENTS =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

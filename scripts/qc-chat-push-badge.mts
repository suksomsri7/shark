// QC — WO-C14: แจ้งเตือนเข้ามือถือทีมงานเมื่อลูกค้าทัก + แบดจ์ข้อความค้างที่เมนู (ปิดบั๊ก B9)
//
// ⚠️ ชื่อไฟล์: `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — มี qc-chat.mts(=security) · qc-chat-notify ·
//    qc-chat-security · qc-chat-security-scope · qc-chat-core-v2 · qc-chat-api-v1 · qc-chat-retention ·
//    qc-chat-replies อยู่ก่อนแล้ว · เขียนทับ = ลบด่านทิ้งทั้งชุด (qc-all.mts ค้น `qc-*.mts` อัตโนมัติ)
//
// ⚠️ ชุดนี้ **ห้ามแตะฐานข้อมูล** (.env ของเครื่องนี้ชี้ prod จริง) → กัน 3 ชั้น (ยกวิธีจาก qc-chat-core-v2):
//   1) ทับ DATABASE_URL เป็น host ที่ต่อไม่ได้ ทันทีหลัง loadEnvFile
//   2) ยัด fake prisma ลง require.cache ของ `src/lib/core/db.ts` **ก่อน** import service
//   3) ยัด fake `src/lib/core/context.ts` (requireTenant) — ไม่งั้น server action จะไปแตะ cookies()/DB
//   fake เติมค่า default ของ schema ตอน create · **ค่าเวลาเป็น thunk เสมอ** (บทเรียน §12 ซ้ำ 3 ครั้ง:
//   ค่าเวลาคงที่ตอนโหลดไฟล์ = ผลลวงคนละทิศ) · บันทึกว่าแต่ละ query/HTTP เกิดในทรานแซกชันไหน
//
// สัญญา:
// CP-1) push ขาเข้า — `announceInbound` ต้องยิง `sendPushToTenant` **จังหวะเดียวกับ AppNotification**
//       · de-dup ด้วย `firstUnread` ตัวเดียวกัน (พิมพ์รัว 5 บรรทัด = push ครั้งเดียว)
//       · ทีมกดอ่านแล้วลูกค้าทักใหม่ = push อีกครั้ง (de-dup ≠ ยิงครั้งเดียวตลอดกาล)
//       · 🔴 network call ต้องอยู่ **นอกทรานแซกชัน** (Expo ตอบช้า = ขัง connection Neon → pool ตัน)
//       · 🔴 push พัง **ห้ามทำให้ข้อความลูกค้าหาย** และห้าม throw
//       · ข้อความไทย: ช่องทาง + ชื่อลูกค้า + ตัวอย่างข้อความ
//       · `data` ห้ามใช้คีย์ `conversationId` — แอปมือถืออ่านคีย์นั้นแล้วเปิดจอ **แชท AI** คนละตัว
// CP-2) แบดจ์ที่เมนู — `unreadCount()` (B9: เขียนไว้แล้วแต่ไม่มีใครเรียก) ต้องถูกเรียกจริงผ่าน
//       `loadNavBadgesAction` · 🔴 ร้านที่ไม่ได้เปิดระบบแชท **ต้องไม่มี query แชทเลย**
//       · tenantId มาจาก session เท่านั้น (ปลอม systemId ของร้านอื่น = 0)
//       · wiring: layout → AppShell → NavDrawer ทั้งโหมด overlay และ pinned
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
// รันแต่ละหมวดแยกกัน — หมวดที่พังกลางคันต้องแดงเฉพาะหมวดนั้น ไม่ใช่กลืนหมวดอื่นหายเงียบ ๆ
const section = async (id: string, name: string, fn: () => Promise<void>) => {
  console.log(name);
  try { await fn(); } catch (e) { chk(`${id}.CRASH`, `${name} ล้มกลางคัน`, false, "รันจบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)); }
};

// ───────── fake prisma (mini query engine + tx tracing) ─────────
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: { op: string; args: Record<string, unknown>; tx: number | null }[] = [];
const seen = (op: string) => calls.filter((c) => c.op === op);
const seenModel = (model: string) => calls.filter((c) => c.op.startsWith(`${model}.`));
let seq = 0;
let txId: number | null = null; // id ของทรานแซกชันที่กำลังเปิดอยู่ (null = นอก tx)

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

// ค่า default ของ schema ที่ข้อสอบชุดนี้พึ่งพา — create ของ Prisma เติมให้ fake ต้องเติมด้วย
// 🔴 ไม่งั้น `updateMany where staffUnreadCount: 0` ของ announceInbound หาแถวไม่เจอ = เขียวแบบผลลวง
// 🔴 ค่าเวลาเป็น **thunk** เสมอ (บทเรียน §12) — ค่าคงที่ตอนโหลดไฟล์ทำให้ข้อสอบชี้ผิดทิศ
const DEFAULTS: Record<string, Row> = {
  chatConversation: { status: "OPEN", staffUnreadCount: 0, reopenedCount: 0, tags: [], meta: null, lastMessageAt: null, lastMessagePreview: null, lastMessageDirection: null, firstResponseAt: null, firstCustomerMessageAt: null, resolvedAt: null, assigneeUserId: null, unitId: null },
  chatMessage: { type: "TEXT", isInternal: false, deliveryStatus: "SENT", senderName: null, body: null, clientMessageId: null, externalMessageId: null, attachments: [] },
  chatContact: { verifiedEmail: false, blockedAt: null, lang: null, externalRef: null, email: null, phone: null, customerId: null, displayName: null },
  outboxEvent: { status: "PENDING", attempts: 0, availableAt: null, processedAt: null },
  chatReadState: { lastReadMessageId: null },
  pushDevice: { platform: "ios" },
  appNotification: { readAt: null },
};
const TIME_FIELDS: Record<string, string[]> = { chatReadState: ["lastReadAt"] };

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

// สร้างแถวใหม่ — ค่าเวลาเรียก new Date() **ตอนนี้** ไม่ใช่ตอนโหลดไฟล์
function newRow(model: string, data: Row): Row {
  const times: Row = {};
  for (const f of TIME_FIELDS[model] ?? []) times[f] = new Date();
  return { id: `fk-${model}-${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...(DEFAULTS[model] ?? {}), ...times, ...data };
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
    groupBy: async (a: Record<string, unknown> = {}) => { rec("groupBy", a); return []; },
    create: async (a: Record<string, unknown> = {}) => {
      rec("create", a);
      const data = (a.data ?? {}) as Row;
      if (model === "chatMessage" && data.clientMessageId != null &&
          rows().some((r) => r.conversationId === data.conversationId && r.clientMessageId === data.clientMessageId)) p2002(model);
      if (model === "outboxEvent" && rows().some((r) => r.tenantId === data.tenantId && r.idempotencyKey === data.idempotencyKey)) p2002(model);
      const r = newRow(model, data);
      rows().push(r);
      return r;
    },
    update: async (a: Record<string, unknown> = {}) => { rec("update", a); const r = find(a); if (!r) throw new Error(`[fake] ${model}.update ไม่พบแถว ${j(a.where)}`); applyData(r, (a.data ?? {}) as Row); return r; },
    updateMany: async (a: Record<string, unknown> = {}) => { rec("updateMany", a); const rs = rows().filter((r) => matches(r, a.where)); for (const r of rs) applyData(r, (a.data ?? {}) as Row); return { count: rs.length }; },
    upsert: async (a: Record<string, unknown> = {}) => { rec("upsert", a); const r = find(a); if (r) { applyData(r, (a.update ?? {}) as Row); return r; } const n = newRow(model, (a.create ?? {}) as Row); rows().push(n); return n; },
    deleteMany: async (a: Record<string, unknown> = {}) => { rec("deleteMany", a); const before = rows().length; tables[model] = rows().filter((r) => !matches(r, a.where)); return { count: before - (tables[model]?.length ?? 0) }; },
  };
}

const cache: Record<string, ReturnType<typeof delegate>> = {};
const fakePrisma: unknown = new Proxy({} as Record<string, unknown>, {
  get(_t, p) {
    if (typeof p !== "string" || p === "then") return undefined;
    if (p === "$transaction") {
      return async (fn: unknown) => {
        if (Array.isArray(fn)) return await Promise.all(fn); // แบบ array (support/service ใช้)
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

const req = createRequire(import.meta.url);
const putModule = (relPath: string, exports: Record<string, unknown>) => {
  const f = resolve(import.meta.dirname, "..", relPath);
  req.cache[f] = { id: f, filename: f, path: resolve(f, ".."), loaded: true, exports, children: [], paths: [] } as never;
};
putModule("src/lib/core/db.ts", { prisma: fakePrisma, tenantDb: () => fakePrisma });

// requireTenant ปลอม — server action ของจริงจะไปแตะ cookies()/DB ซึ่งชุดนี้ห้าม
let SESSION_TENANT = "T1";
putModule("src/lib/core/context.ts", {
  requireTenant: async () => ({
    user: { id: "U1", email: "owner@example.com" },
    memberships: [],
    active: { tenantId: SESSION_TENANT, tenant: { id: SESSION_TENANT, name: "ร้านทดสอบ", status: "ACTIVE" }, unitAccess: ["*"] },
  }),
  requireAuth: async () => ({ user: { id: "U1", email: "owner@example.com" }, memberships: [], active: null }),
  requireMembership: async () => ({}),
});

// ───────── ดักเน็ตเวิร์ก: บันทึก payload ของ Expo push + ทรานแซกชันที่กำลังเปิดตอนยิง ─────────
type NetCall = { url: string; payloads: Row[]; tx: number | null };
const net: NetCall[] = [];
let netMode: "ok" | "throw" = "ok";
globalThis.fetch = (async (input: unknown, init?: { body?: unknown }) => {
  let payloads: Row[] = [];
  try { payloads = JSON.parse(String(init?.body ?? "[]")) as Row[]; } catch { payloads = []; }
  net.push({ url: String(input), payloads, tx: txId });
  if (netMode === "throw") throw new Error("[fake] Expo ล่ม");
  return { ok: true, status: 200, json: async () => ({ data: payloads.map(() => ({ status: "ok" })) }) };
}) as unknown as typeof fetch;

const SRC = readFileSync("src/lib/modules/chat/service.ts", "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\/.*$/gm, "");
const LAYOUT = readFileSync("src/app/app/layout.tsx", "utf8");
const SHELL = readFileSync("src/components/app-shell/AppShell.tsx", "utf8");
const DRAWER = readFileSync("src/components/app-shell/NavDrawer.tsx", "utf8");
const ACTIONS = readFileSync("src/lib/support/actions.ts", "utf8");
const MOBILE_PUSH = readFileSync("apps/mobile/src/lib/push-register.ts", "utf8");

type Chat = {
  receiveWebchatInbound: (a: Record<string, unknown>) => Promise<{ ok: boolean; conversationId?: string; reason?: string }>;
  markRead: (a: Record<string, unknown>) => Promise<void>;
  unreadCount: (t: string, s: string) => Promise<number>;
};
type Actions = {
  loadNavBadgesAction: (ids?: string[]) => Promise<{ helpUnread: number; aiUnread: number; chatUnread: Record<string, number> }>;
};

const CONN_WEB = { id: "conn-web", tenantId: "T1", systemId: "S1", type: "WEBCHAT", displayName: "แชทหน้าเว็บ", status: "CONNECTED", externalAccountId: "webchat", credentials: {}, defaultUnitId: null };

// เครื่องมือถือของทีมงาน 1 เครื่อง — ตัวชี้ขาดว่า "เส้นทาง push เดินถึงจุดยิงจริง" (positive control)
function seedShop(opts?: { devices?: number }) {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.chatChannelConnection = [{ ...CONN_WEB }];
  tables.chatSetting = [{ id: "st1", tenantId: "T1", systemId: "S1", memberSystemId: null, senderAlias: "ทีมงาน", greetingMessage: {}, offlineMessage: {} }];
  tables.pushDevice = Array.from({ length: opts?.devices ?? 1 }, (_, i) => ({
    id: `pd-${i}`, tenantId: "T1", userId: "U1", expoToken: `ExponentPushToken[dev-${i}]`, platform: "ios", createdAt: new Date(),
  }));
  calls.length = 0;
  net.length = 0;
  netMode = "ok";
}

const say = (chat: Chat, body: string, clientMessageId?: string) =>
  chat.receiveWebchatInbound({ connection: CONN_WEB, guestToken: "guest-1", body, displayName: "คุณเอ", ...(clientMessageId ? { clientMessageId } : {}) });

try {
  const chat = (await import("@/lib/modules/chat/service" as string).catch((e) => { console.log(`  (import chat ล้ม: ${e instanceof Error ? e.message.slice(0, 200) : String(e)})`); return null; })) as Chat | null;

  if (!chat) chk("CP-0", "import chat/service ได้ (fake prisma ติด)", false, "import ได้", "import ไม่ได้");
  else {
    // ═════════ CP-1 · push เข้ามือถือทีมงานเมื่อลูกค้าทัก ═════════
    await section("CP-1", "CP-1 push ขาเข้า (de-dup · นอก tx · ห้ามพา flow พัง):", async () => {
      // ── คู่บวก: ร้านมีเครื่องลงทะเบียน → ต้องยิงถึงจุดส่งจริง ──
      seedShop();
      const r1 = await say(chat, "อยากได้ทริปสิมิลัน 3 วัน");
      const expo = net.filter((n) => n.url.includes("exp.host"));
      chk("CP-1.1", "🟢 คู่บวก: ลูกค้าทัก 1 ข้อความ → ยิง push เข้า Expo จริง 1 ครั้ง (เส้นทางเดินถึงจุดยิง)",
        r1.ok === true && expo.length === 1 && expo[0]!.payloads.length === 1 && expo[0]!.payloads[0]!.to === "ExponentPushToken[dev-0]",
        "1 คำขอไป exp.host · 1 payload · token ของเครื่องร้าน", j({ ok: r1.ok, n: expo.length, payloads: expo[0]?.payloads.length, to: expo[0]?.payloads[0]?.to }));

      const p0 = (expo[0]?.payloads[0] ?? {}) as Row;
      chk("CP-1.2", "ข้อความแจ้งเตือนเป็นภาษาไทย ระบุช่องทาง + ชื่อลูกค้า + ตัวอย่างข้อความ",
        /[ก-๙]/.test(String(p0.title)) && String(p0.title).includes("แชทหน้าเว็บ") && String(p0.body).includes("คุณเอ") && String(p0.body).includes("สิมิลัน"),
        "title มีช่องทาง · body มีชื่อลูกค้า+ตัวอย่าง", j({ title: p0.title, body: p0.body }));

      const data = (p0.data ?? {}) as Row;
      chk("CP-1.3", "🔴 data ห้ามใช้คีย์ `conversationId` (แอปมือถืออ่านคีย์นั้นแล้วเปิดจอ 'แชท AI' คนละตัว) แต่ต้องพกห้องแชทไปด้วย",
        !("conversationId" in data) && data.chatConversationId === r1.conversationId && String(data.url).includes(`/app/sys/S1/chat?c=${r1.conversationId}`),
        "ไม่มีคีย์ conversationId · มี chatConversationId + url", j(data));
      chk("CP-1.4", "แอปมือถือยัง deep link ด้วย data.conversationId เท่านั้น (เหตุผลของ CP-1.3 — ถ้าแอปเปลี่ยน ให้กลับมาทบทวน)",
        /data\?\.conversationId/.test(MOBILE_PUSH) || /conversationId\?:\s*unknown/.test(MOBILE_PUSH),
        "push-register อ่าน data.conversationId", "ไม่พบ (แอปอาจรองรับ deep link แล้ว)", "MINOR");

      // ── de-dup: พิมพ์รัว 5 ข้อความ = push ครั้งเดียว ──
      seedShop();
      for (let i = 1; i <= 5; i++) await say(chat, `ข้อความที่ ${i}`);
      const burst = net.filter((n) => n.url.includes("exp.host"));
      const conv = tables.chatConversation![0]!;
      chk("CP-1.5", "🔴 ลูกค้าพิมพ์รัว 5 ข้อความ → push **ครั้งเดียว** (กติกา de-dup เดียวกับ AppNotification)",
        burst.length === 1 && seen("appNotification.create").length === 1 && conv.staffUnreadCount === 5 && (tables.chatMessage ?? []).length === 5,
        "push 1 · แจ้งเตือนในเว็บ 1 · unread 5 · ข้อความ 5", j({ push: burst.length, notif: seen("appNotification.create").length, unread: conv.staffUnreadCount, msgs: (tables.chatMessage ?? []).length }));

      chk("CP-1.6", "จำนวน push เท่ากับจำนวน AppNotification เป๊ะ (ผูกกับ firstUnread ตัวเดียวกัน ไม่ใช่ตัวนับแยก)",
        burst.length === seen("appNotification.create").length,
        "เท่ากัน", j({ push: burst.length, notif: seen("appNotification.create").length }));

      // ── de-dup ≠ ยิงครั้งเดียวตลอดกาล: ทีมกดอ่านแล้วลูกค้าทักใหม่ ต้องได้แจ้งเตือนอีก ──
      await chat.markRead({ tenantId: "T1", systemId: "S1", conversationId: String(conv.id), userId: "U1", unitAccess: ["*"] });
      net.length = 0;
      await say(chat, "ยังว่างอยู่ไหมครับ");
      chk("CP-1.7", "🟢 คู่บวก: ทีมกดอ่านแล้วลูกค้าทักใหม่ → push อีกครั้ง (de-dup ไม่ใช่ 'เงียบตลอดกาล')",
        net.filter((n) => n.url.includes("exp.host")).length === 1,
        "push 1 ครั้ง", j({ push: net.filter((n) => n.url.includes("exp.host")).length }));

      // ── ส่งซ้ำ clientMessageId เดิม (webhook/กดส่งซ้ำ) → ห้ามแจ้งเตือนซ้ำ ──
      seedShop();
      await say(chat, "ทักครั้งแรก", "cm-1");
      const afterFirst = net.filter((n) => n.url.includes("exp.host")).length;
      await chat.markRead({ tenantId: "T1", systemId: "S1", conversationId: String(tables.chatConversation![0]!.id), userId: "U1", unitAccess: ["*"] });
      await say(chat, "ทักครั้งแรก", "cm-1");
      chk("CP-1.8", "ส่งซ้ำ clientMessageId เดิม → ไม่ push ซ้ำ (แม้ทีมจะกดอ่านไปแล้ว)",
        afterFirst === 1 && net.filter((n) => n.url.includes("exp.host")).length === 1,
        "push รวม 1 ครั้ง", j({ afterFirst, total: net.filter((n) => n.url.includes("exp.host")).length }));

      // ── 🔴 network call ต้องอยู่นอกทรานแซกชัน ──
      seedShop();
      await say(chat, "สอบถามราคาครับ");
      const expoCalls = net.filter((n) => n.url.includes("exp.host"));
      const devRead = seen("pushDevice.findMany");
      const msgTx = seen("chatMessage.create")[0]?.tx ?? null;
      const notifTx = seen("appNotification.create")[0]?.tx ?? null;
      chk("CP-1.9", "🔴 การยิง push เกิด **นอกทรานแซกชัน** (Expo ตอบช้า = ห้ามขัง connection ของ Neon)",
        expoCalls.length === 1 && expoCalls.every((c) => c.tx === null) && devRead.length === 1 && devRead.every((c) => c.tx === null),
        "1 คำขอ · tx = null ทั้งการอ่านเครื่องและการยิง", j({ n: expoCalls.length, netTx: expoCalls.map((c) => c.tx), devTx: devRead.map((c) => c.tx) }));
      chk("CP-1.10", "🟢 คู่บวกของ CP-1.9: การเขียนข้อความ/แจ้งเตือนยังอยู่ในทรานแซกชันจริง (ไม่ใช่ tx หายไปทั้งไฟล์)",
        notifTx !== null && seen("chatConversation.updateMany")[0]?.tx === notifTx,
        "AppNotification + denorm อยู่ tx เดียวกัน (ไม่ใช่ null)", j({ msgTx, notifTx, denormTx: seen("chatConversation.updateMany")[0]?.tx }));

      // ── 🔴 push พัง ห้ามทำให้ข้อความลูกค้าหาย และห้าม throw ──
      seedShop();
      netMode = "throw";
      let threw: string | null = null;
      const rFail = await say(chat, "Expo ล่มแต่ข้อความต้องรอด").catch((e) => { threw = String(e); return null; });
      const failedTry = net.filter((n) => n.url.includes("exp.host"));
      chk("CP-1.11", "🔴 push พัง (Expo ล่ม) → ข้อความลูกค้ายังถูกบันทึก + แจ้งเตือนในเว็บยังขึ้น + ไม่ throw",
        threw === null && rFail?.ok === true && (tables.chatMessage ?? []).length === 1 && seen("appNotification.create").length === 1 && tables.chatConversation![0]!.staffUnreadCount === 1,
        "ไม่ throw · 1 ข้อความ · 1 แจ้งเตือน · unread 1", j({ threw, ok: rFail?.ok, msgs: (tables.chatMessage ?? []).length, notif: seen("appNotification.create").length }));
      chk("CP-1.12", "🟢 คู่บวกของ CP-1.11: เส้นทางที่พังคือ 'ยิงจริงแล้วพัง' ไม่ใช่ 'ไม่เคยยิง' (+ ลง OpsEvent ให้สืบได้)",
        failedTry.length === 1 && seen("opsEvent.create").length >= 1,
        "พยายามยิง 1 ครั้ง + มี OpsEvent", j({ tried: failedTry.length, ops: seen("opsEvent.create").length }));

      // ── ร้านที่ไม่มีเครื่องลงทะเบียน: ห้ามยิง HTTP ทิ้งเปล่า ──
      seedShop({ devices: 0 });
      await say(chat, "ร้านนี้ยังไม่ได้ลงแอป");
      chk("CP-1.13", "ร้านที่ยังไม่มีเครื่องลงทะเบียน → ไม่ยิง HTTP เลย (แต่ข้อความ + แจ้งเตือนในเว็บครบ)",
        net.length === 0 && (tables.chatMessage ?? []).length === 1 && seen("appNotification.create").length === 1,
        "HTTP 0 · ข้อความ 1 · แจ้งเตือน 1", j({ net: net.length, msgs: (tables.chatMessage ?? []).length, notif: seen("appNotification.create").length }), "MAJOR");

      // ── ไม่ fork logic: ทางเข้าทุกทาง (LINE / webchat / s2s) ผ่าน announceInbound ตัวเดียว ──
      chk("CP-1.14", "เรียก sendPushToTenant ที่เดียวในทั้งไฟล์ (LINE/webchat/s2s ได้พฤติกรรมเดียวกัน ไม่ fork)",
        (CODE.match(/sendPushToTenant\(/g) ?? []).length === 1,
        "1 แห่ง", String((CODE.match(/sendPushToTenant\(/g) ?? []).length), "MAJOR");
      // ยืนยันซ้ำจากซอร์ส — 🔴 ต้องตัดเอา **เฉพาะตัว announceInbound** ก่อน
      // (สไลซ์จาก `prisma.$transaction` ตัวแรกของทั้งไฟล์ = วัดผิดฟังก์ชัน แล้วเขียวแบบผลลวง)
      // ในฟังก์ชันนี้ ระหว่างเปิด `prisma.$transaction(` กับจุดเรียก push ต้องมีบรรทัดปิด tx (`\n  });`)
      // ⚠️ อาร์กิวเมนต์ของฟังก์ชันนี้เป็น object type ที่ปิดด้วย `\n}):` → หา `\n}` เฉย ๆ จะตัดสั้นเกิน
      //    ต้องเริ่มนับจากปีกกาเปิดของ **ตัวบอดี้** และตรวจว่าตัดครบจริง (ต้องเจอ drainAll ท้ายฟังก์ชัน)
      const fnStart = CODE.indexOf("async function announceInbound(");
      const bodyAt = fnStart >= 0 ? CODE.indexOf("Promise<void> {", fnStart) : -1;
      const fnEnd = bodyAt >= 0 ? CODE.indexOf("\n}", bodyAt) : -1;
      const FN = fnEnd > fnStart && fnStart >= 0 ? CODE.slice(fnStart, fnEnd) : "";
      const txStart = FN.indexOf("prisma.$transaction");
      const pushAt = FN.indexOf("sendPushToTenant(tenantId");
      const between = txStart >= 0 && pushAt > txStart ? FN.slice(txStart, pushAt) : "";
      chk("CP-1.15", "ยืนยันจากซอร์สของ announceInbound เอง: จุดเรียก push อยู่หลังบรรทัดปิด $transaction และไม่ใช้ตัวจับ tx",
        FN.includes("drainAll") && txStart >= 0 && pushAt > txStart && between.includes("\n  });") && !/tx\.[\w.]*sendPushToTenant/.test(FN),
        "ตัดฟังก์ชันได้ครบ (เจอ drainAll) + มีบรรทัดปิด tx คั่นก่อนถึง push", j({ fn: FN.length, whole: FN.includes("drainAll"), txStart, pushAt, closed: between.includes("\n  });") }), "MINOR");
    });

    // ═════════ CP-2 · แบดจ์ข้อความค้างที่เมนู (ปิดบั๊ก B9) ═════════
    await section("CP-2", "\nCP-2 แบดจ์ที่เมนู (B9 — unreadCount ที่ไม่เคยมีใครเรียก):", async () => {
      const actions = (await import("@/lib/support/actions" as string).catch((e) => { console.log(`  (import actions ล้ม: ${e instanceof Error ? e.message.slice(0, 200) : String(e)})`); return null; })) as Actions | null;

      // 3 ห้องค้างของ T1/S1 · 1 ห้องของระบบอื่น · 1 ห้องของร้านอื่น · 1 ห้องที่อ่านครบแล้ว
      const seedRooms = () => {
        for (const k of Object.keys(tables)) delete tables[k];
        tables.chatConversation = [
          { id: "c1", tenantId: "T1", systemId: "S1", staffUnreadCount: 3, status: "OPEN" },
          { id: "c2", tenantId: "T1", systemId: "S1", staffUnreadCount: 1, status: "OPEN" },
          { id: "c3", tenantId: "T1", systemId: "S1", staffUnreadCount: 0, status: "OPEN" },
          { id: "c4", tenantId: "T1", systemId: "S2", staffUnreadCount: 5, status: "OPEN" },
          { id: "c5", tenantId: "T2", systemId: "S1", staffUnreadCount: 9, status: "OPEN" },
        ];
        calls.length = 0;
        net.length = 0;
      };

      seedRooms();
      const n1 = await chat.unreadCount("T1", "S1");
      chk("CP-2.1", "unreadCount นับ 'จำนวนห้องที่ค้างตอบ' ของร้าน+ระบบนั้น (ไม่ใช่จำนวนข้อความ · ไม่ข้ามร้าน/ข้ามระบบ)",
        n1 === 2, "2 ห้อง (c1,c2)", String(n1));

      if (!actions) chk("CP-2.2", "import support/actions ได้", false, "import ได้", "import ไม่ได้");
      else {
        // ── คู่บวก: ส่ง systemId ของระบบแชทมา → ต้องมี query + ตัวเลขถูก ──
        seedRooms();
        const b1 = await actions.loadNavBadgesAction(["S1"]);
        const agg = seen("chatConversation.aggregate");
        chk("CP-2.2", "🟢 คู่บวก: loadNavBadgesAction เรียก unreadCount จริงและคืนตัวเลขถูกราย systemId (ปิด B9)",
          b1.chatUnread?.S1 === 2 && agg.length === 1 && (agg[0]!.args.where as Row)?.tenantId === "T1",
          "{S1:2} · aggregate 1 ครั้ง · where ผูก tenantId", j({ chatUnread: b1.chatUnread, agg: agg.length, where: agg[0]?.args.where }));

        // ── 🔴 ร้านที่ไม่ได้เปิดระบบแชท: ห้ามมี query ส่วนเกินเลย ──
        seedRooms();
        const b0 = await actions.loadNavBadgesAction([]);
        // "ไม่มี query ส่วนเกิน" = ห้ามแตะตารางแชท **และห้ามไปถาม appSystem/businessUnit เพื่อหาว่ามีระบบแชทไหม**
        // (รายชื่อระบบต้องมาจาก layout ที่ query ไปแล้ว — ถามซ้ำ = เพิ่ม query ให้ทุกร้านรวมร้านที่ไม่มีแชท)
        const FORBIDDEN = ["chatConversation", "chatMessage", "chatContact", "chatSetting", "appSystem", "businessUnit"];
        const touched0 = FORBIDDEN.filter((m) => seenModel(m).length > 0);
        chk("CP-2.3", "🔴 ร้านที่ไม่ได้เปิดระบบแชท (ลิสต์ว่าง) → **ไม่มี query ส่วนเกินเลย** (ทั้งตารางแชทและการถามหาระบบแชทซ้ำ)",
          j(b0.chatUnread) === "{}" && touched0.length === 0,
          "chatUnread ว่าง · 0 query ใน " + FORBIDDEN.join("/"), j({ chatUnread: b0.chatUnread, touched: touched0 }));
        seedRooms();
        const bU = await actions.loadNavBadgesAction();
        chk("CP-2.4", "ไม่ส่งอาร์กิวเมนต์เลย (ผู้เรียกเก่า) → ยังทำงานได้และไม่มี query แชท",
          j(bU.chatUnread) === "{}" && seenModel("chatConversation").length === 0,
          "chatUnread ว่าง · 0 query", j({ chatUnread: bU.chatUnread, conv: seenModel("chatConversation").length }), "MAJOR");

        // ── ปลอม systemId ของร้านอื่น: tenantId มาจาก session เสมอ ──
        seedRooms();
        SESSION_TENANT = "T1";
        const bX = await actions.loadNavBadgesAction(["S1", "S2"]);
        chk("CP-2.5", "🔴 tenantId มาจาก session เท่านั้น — ห้องของร้านอื่น (T2/S1 unread 9) ไม่ถูกนับเข้าแบดจ์",
          bX.chatUnread?.S1 === 2 && bX.chatUnread?.S2 === 1 && seen("chatConversation.aggregate").every((c) => (c.args.where as Row)?.tenantId === "T1"),
          "S1=2 (ไม่ใช่ 3) · S2=1 · where tenantId=T1 ทุกครั้ง", j({ chatUnread: bX.chatUnread }));

        // ── กันไคลเอนต์ยัดลิสต์ยาว ──
        seedRooms();
        const many = Array.from({ length: 40 }, (_, i) => `S${i}`).concat(["S1", "S1", "S1"]);
        await actions.loadNavBadgesAction(many);
        chk("CP-2.6", "ตัดลิสต์ที่ 10 + ตัดตัวซ้ำ (ไคลเอนต์ยัด 43 รายการ ต้องไม่กลายเป็น 43 query)",
          seen("chatConversation.aggregate").length <= 10,
          "≤ 10 query", String(seen("chatConversation.aggregate").length), "MAJOR");
      }

      // ── wiring: เห็นจากหน้าไหนก็ได้จริงไหม (บทเรียน 29 ส.ค.: โค้ดถูกแต่คนใช้ไปไม่ถึง) ──
      chk("CP-2.7", "layout หา id ระบบแชทจาก appSystems ที่ query ไปแล้ว (ไม่มี query เพิ่มในทุกหน้า)",
        /appSystems\.filter\(\(s\) => s\.type === "CHAT"\)/.test(LAYOUT) && /chatSystemIds=\{chatSystemIds\}/.test(LAYOUT) && !/unreadCount/.test(LAYOUT),
        "filter จาก appSystems + ส่งเป็น prop + ไม่เรียก unreadCount ใน layout", j({ filter: /appSystems\.filter/.test(LAYOUT), prop: /chatSystemIds=/.test(LAYOUT), unread: /unreadCount/.test(LAYOUT) }));
      chk("CP-2.8", "AppShell ส่ง badges ให้ NavDrawer **ทั้ง 2 โหมด** (overlay บนมือถือ + pinned บนจอใหญ่)",
        (SHELL.match(/badges=\{navBadges\}/g) ?? []).length === 2 && /loadNavBadgesAction\(ids\)/.test(SHELL),
        "badges= 2 แห่ง", String((SHELL.match(/badges=\{navBadges\}/g) ?? []).length));
      chk("CP-2.9", "🔴 ระบบแชทในเมนูเป็น accordion → badge ต้องอยู่ที่หัว NavGroup ด้วย ไม่งั้นมองไม่เห็นเลย",
        /function NavGroup\(\{ item, onNavigate, badge/.test(DRAWER) && /<NavBadge n=\{badge\}/.test(DRAWER) && /<NavBadge n=\{badges\?\.\[it\.key\] \?\? 0\}/.test(DRAWER),
        "NavGroup รับ badge + เรนเดอร์ · รายการแบนก็เรนเดอร์", j({ group: /<NavBadge n=\{badge\}/.test(DRAWER), flat: /<NavBadge n=\{badges/.test(DRAWER) }));
      chk("CP-2.10", "แบดจ์ไม่โผล่ตอนเลข 0 (เมนูสะอาดเวลาไม่มีอะไรค้าง)",
        /if \(!n \|\| n <= 0\) return null;/.test(DRAWER), "return null เมื่อ n <= 0", "ไม่พบ", "MINOR");
      chk("CP-2.11", "actions ใช้ unreadCount ของโมดูลแชทตัวเดิม ไม่เขียน query ซ้ำ (ห้ามมี chatConversation ใน actions)",
        /unreadCount as chatUnreadCount/.test(ACTIONS) && !/chatConversation/.test(ACTIONS),
        "import unreadCount + ไม่มี prisma.chatConversation", j({ imp: /chatUnreadCount/.test(ACTIONS), raw: /chatConversation/.test(ACTIONS) }));
      chk("CP-2.12", "ไม่ยิงซ้ำเป็น polling — โหลดตอน mount + ตอนกดเปิดเมนูเท่านั้น",
        /refreshBadges\(\); \/\/ เปิดเมนู/.test(SHELL) && !/setInterval/.test(SHELL),
        "มี refresh ตอนเปิดเมนู · ไม่มี setInterval", j({ onMenu: /refreshBadges\(\)/.test(SHELL), poll: /setInterval/.test(SHELL) }), "MINOR");
    });

    // ═════════ CP-3 · event "ทีมเปิดอ่าน" (ติ๊กคู่ ✓✓ ฝั่งลูกค้า) ═════════
    //
    // เจ้าของสั่ง 29 ส.ค. 2026 (สั่งซ้ำ): ต้องเหมือน WhatsApp — ติ๊กเปลี่ยนตอน **อ่าน** ไม่ใช่ตอนตอบ
    // ⇒ `markRead` ต้องยิง `chat.conversation.read` ออก outbox ให้ระบบปลายทาง (SiamDive) เอาไปประทับ
    // 🔴 กับดัก: หน้า inbox เรียก markRead ทุกครั้งที่เปิดห้อง ⇒ ยิงทุกครั้ง = ถล่ม webhook ปลายทาง
    await section("CP-3", "\nCP-3 event 'ทีมเปิดอ่าน' → ติ๊กคู่ฝั่งลูกค้า:", async () => {
      const readEvents = () => (tables.outboxEvent ?? []).filter((r) => r.type === "chat.conversation.read");
      const markRead = (convId: string) =>
        chat.markRead({ tenantId: "T1", systemId: "S1", conversationId: convId, userId: "U1", unitAccess: ["*"] });

      seedShop();
      await say(chat, "สนใจทริปครับ");
      const cv = String(tables.chatConversation![0]!.id);
      await markRead(cv);
      const ev = readEvents();
      chk("CP-3.1", "🟢 คู่บวก: ทีมกดอ่านตอนมีข้อความค้าง → ยิง event 'อ่านแล้ว' 1 ใบ พร้อมตัวตนลูกค้า",
        ev.length === 1 && !!(ev[0]!.payload as Row | undefined) && !!((ev[0]!.payload as Row).externalUserId),
        "1 ใบ · payload มี externalUserId", j({ n: ev.length, payload: ev[0]?.payload }));

      await markRead(cv);
      await markRead(cv);
      chk("CP-3.2", "🔴 เปิดห้องซ้ำโดยไม่มีอะไรค้าง → **ไม่ยิงซ้ำ** (inbox เรียก markRead ทุกครั้งที่เปิด)",
        readEvents().length === 1, "ยังเป็น 1 ใบ", j({ n: readEvents().length }));

      await say(chat, "ถามเพิ่มอีกนิดครับ");
      await markRead(cv);
      chk("CP-3.3", "🟢 ลูกค้าทักใหม่แล้วทีมอ่านอีกรอบ → ยิงอีกใบ (กันซ้ำ ≠ ยิงครั้งเดียวตลอดกาล)",
        readEvents().length === 2 && new Set(readEvents().map((r) => r.idempotencyKey)).size === 2,
        "2 ใบ · กุญแจกันซ้ำคนละตัว", j({ n: readEvents().length, keys: readEvents().map((r) => r.idempotencyKey) }));

      const txs = seen("outboxEvent.create").map((c) => c.tx);
      chk("CP-3.4", "การยิง event อยู่ในทรานแซกชันเดียวกับการล้าง unread (ล้างสำเร็จ = event รอด)",
        txs.length >= 2 && txs.every((t) => t !== null),
        "tx ไม่เป็น null", j({ txs }));

      // 🔴 เจ้าของเจอจริง 30 ส.ค. 2026 — ต้นเหตุของ **ทั้งสองอาการ**:
      //    "ข้อความมาแต่ไม่ได้ notification" + "ติ๊กคู่ ✓✓ ไม่เคยขึ้น"
      //    คือหน้า inbox ไม่เคยเรียก markRead ตอนเปิดห้อง (มีแค่ตอนกดตอบ/กดปุ่มเอง)
      const UI = readFileSync("src/lib/modules/chat/ui.tsx", "utf8");
      const ACT = readFileSync("src/lib/modules/chat/actions.ts", "utf8");
      chk("CP-3.5", "🔴 เปิดห้องแชท = อ่านแล้วอัตโนมัติ (ไม่ต้องรอทีมกดปุ่ม)",
        /<ChatMarkReadOnOpen/.test(UI) && /markReadOnOpenAction/.test(ACT),
        "หน้าแชทเรียก ChatMarkReadOnOpen + มี action", j({ ui: /<ChatMarkReadOnOpen/.test(UI), act: /markReadOnOpenAction/.test(ACT) }));
      chk("CP-3.6", "🔴 action ที่ยิงจากตอนเปิดหน้า **ห้าม redirect** (ไม่งั้นวนโหลดหน้าไม่รู้จบ)",
        !/redirect\(/.test(ACT.slice(ACT.indexOf("markReadOnOpenAction"), ACT.indexOf("// ── ทำเป็นอ่านแล้ว ──"))),
        "ไม่มี redirect ในตัว on-open", "?");

      // 🔴 เจ้าของเจอจริง 30 ส.ค. 2026 (รอบที่สองของเรื่องเดียวกัน): guard "ยิงครั้งเดียวต่อห้อง"
      //    แน่นเกินไป — ทีมเปิดห้องค้างไว้แล้วลูกค้าส่งใหม่ ⇒ ไม่ถูกนับว่าอ่าน ติ๊กค้างที่ ✓
      const { nextMarkReadState } = (await import("@/components/chat-mark-read-on-open" as string)) as {
        nextMarkReadState: (f: string | null, k: string, u: number) => { fire: boolean; fired: string | null };
      };
      const K = "S1:C1";
      const s1 = nextMarkReadState(null, K, 1);
      const s2 = nextMarkReadState(s1.fired, K, 1);      // รอบรีเฟรชระหว่างรอ action → ห้ามยิงซ้ำ
      const s3 = nextMarkReadState(s2.fired, K, 0);      // อ่านสำเร็จ ตัวนับกลับเป็น 0
      const s4 = nextMarkReadState(s3.fired, K, 1);      // ลูกค้าส่งใหม่ขณะทีมยังเปิดค้างอยู่
      chk("CP-3.7", "🔴 เปิดค้างไว้แล้วมีข้อความใหม่เข้ามา → ต้องสั่งอ่าน**อีกครั้ง**",
        s1.fire && !s2.fire && !s3.fire && s4.fire,
        "ยิง · ไม่ยิง · ไม่ยิง · ยิง", j([s1.fire, s2.fire, s3.fire, s4.fire]));
      chk("CP-3.8", "ไม่มีอะไรค้าง → ไม่ยิงเลย (ไม่รบกวนเซิร์ฟเวอร์ทุกรอบรีเฟรช)",
        !nextMarkReadState(null, K, 0).fire, "ไม่ยิง", "?");
      const PAGE = readFileSync("src/app/app/sys/[id]/chat/page.tsx", "utf8");
      chk("CP-3.9", "หน้าแชทรีเฟรชถี่พอที่ติ๊กคู่จะตามทัน (≤ 10 วิ)",
        (() => { const m = PAGE.match(/<AutoRefresh ms=\{(\d+)\}/); return !!m && Number(m[1]) <= 10_000; })(),
        "≤ 10000", (PAGE.match(/<AutoRefresh ms=\{(\d+)\}/) ?? [])[1] ?? "ไม่พบ");
    });

    // ═════════ CP-4 · แจ้งเตือนต้องกลับมาเมื่อลูกค้าทักรอบใหม่ ═════════
    //
    // 🔴 เจ้าของ: "ฝั่ง shark ไม่ได้รับ notification แต่ข้อความมา"
    //    de-dup เดิม = "แจ้งครั้งเดียวจนกว่าทีมจะอ่าน" ⇒ ตัวนับค้าง = เงียบตลอดกาล
    //    เจตนาจริงคือกัน "พิมพ์รัวหลายบรรทัด" ซึ่งวัดด้วย **เวลา** ตรงกว่า
    await section("CP-4", "\nCP-4 แจ้งเตือนกลับมาเมื่อทักรอบใหม่ (ไม่ใช่เงียบตลอดกาล):", async () => {
      const pushes = () => net.filter((n) => n.url.includes("exp.host")).length;
      seedShop();
      net.length = 0;
      await say(chat, "ทักครั้งแรก");
      const after1 = pushes();
      await say(chat, "พิมพ์ต่อทันที");
      const after2 = pushes();
      chk("CP-4.1", "พิมพ์ต่อทันที (ยังเป็นชุดเดียวกัน) → ไม่แจ้งซ้ำ",
        after1 === 1 && after2 === 1, "1 แล้วยัง 1", j({ after1, after2 }));

      // ดันเวลาข้อความล่าสุดให้ย้อนไปนานกว่าหน้าต่าง แล้วทักใหม่ = คนละชุด
      const cv = tables.chatConversation![0]!;
      cv.lastMessageAt = new Date(Date.now() - 30 * 60_000);
      await say(chat, "กลับมาถามใหม่อีกครั้ง");
      chk("CP-4.2", "🔴 เว้นช่วงนานแล้วทักใหม่ → **แจ้งอีกครั้ง** แม้ทีมยังไม่ได้เคลียร์ unread",
        pushes() === 2, "2 ครั้ง", j({ pushes: pushes(), unread: cv.staffUnreadCount }));
      chk("CP-4.3", "ตัวนับ unread ยังเดินตามจริงทุกข้อความ (คนละเรื่องกับการแจ้งเตือน)",
        cv.staffUnreadCount === 3, "3", j({ unread: cv.staffUnreadCount }));
    });

    // ═════════ CP-5 · emit แล้วต้อง "ปลุกตัวส่ง" ทุกครั้ง ═════════
    //
    // 🔴 กับดักที่เงียบที่สุดในไฟล์นี้ (เจ้าของเจอจริง 30 ส.ค. 2026 — รอบที่สองของเรื่องเดียวกัน):
    //    `emitOutbox` แค่ **เขียนลงคิว** · ถ้าไม่เรียก `drainAll()` ต่อ event จะนอนรอ cron
    //    รายชั่วโมง ⇒ ปลายทางเห็นผลช้าเป็นชั่วโมง ซึ่งผู้ใช้อ่านว่า "ไม่ทำงาน"
    //    ไม่มี error ไม่มี log — ข้อสอบที่ mock ตัว drain ไว้ก็ยังเขียว ⇒ ต้องตรวจที่ **ซอร์ส**
    await section("CP-5", "\nCP-5 ทุกจุดที่ยิง event ต้องปลุกตัวส่งทันที:", async () => {
      const SRC = readFileSync("src/lib/modules/chat/service.ts", "utf8");
      // ตัดคอมเมนต์ทิ้งก่อน — คอมเมนต์ที่ **อธิบายกับดัก** ต้องไม่ถูกนับเป็นโค้ดจริง
      const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
      const fns = code.split(/\nexport async function |\nasync function /).slice(1);
      const offenders = fns
        .map((f) => ({ name: f.slice(0, f.indexOf("(")), emits: f.includes("emitOutbox("), drains: f.includes("drainAll(") }))
        .filter((f) => f.emits && !f.drains)
        .map((f) => f.name);
      chk("CP-5.1", "🔴 ทุกฟังก์ชันที่ `emitOutbox` ต้องเรียก `drainAll()` ด้วย (ไม่งั้น event ค้างคิว)",
        offenders.length === 0, "ไม่มีฟังก์ชันที่ลืม", j({ ลืม: offenders }));
      // คู่บวก: ต้องมีฟังก์ชันที่ทำถูกอยู่จริง ไม่ใช่ regex หาอะไรไม่เจอเลยแล้วเขียวลอย ๆ
      const good = fns.filter((f) => f.includes("emitOutbox(") && f.includes("drainAll(")).length;
      chk("CP-5.2", "🟢 คู่บวก: ตัวตรวจหาฟังก์ชันที่ emit เจอจริง (ไม่ใช่เขียวเพราะหาไม่เจอ)",
        good >= 3, "อย่างน้อย 3 ฟังก์ชัน", j({ ถูกต้อง: good }));
    });

    // ═════════ CP-6 · ทุก event ที่ยิง ต้องมีตัวรับลงทะเบียนไว้ ═════════
    //
    // 🔴 กับดักที่ทำ **production ตันทั้งระบบ** 30 ส.ค. 2026:
    //    เพิ่ม type `chat.conversation.read` แล้วลืมลงทะเบียนใน `outbox-consumers.ts`
    //    ⇒ drain เจอแล้วข้าม (ไม่นับ fail) · event ค้าง PENDING เงียบ ๆ · webhook ไม่เคยถูกยิง
    //    ⇒ ติ๊กคู่ ✓✓ ไม่มีวันขึ้น และคำตอบของทีมไม่ถึงลูกค้า
    //    ไฟล์ consumers เขียนเตือนกับดักนี้ไว้ตรง ๆ แล้วยังพลาด ⇒ ต้องมีด่านอัตโนมัติ
    await section("CP-6", "\nCP-6 ทุก event ที่ยิงต้องมีตัวรับ:", async () => {
      const { readdirSync, statSync } = await import("node:fs");
      const walk = (dir: string): string[] =>
        readdirSync(dir).flatMap((f) => {
          const p = `${dir}/${f}`;
          return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
        });
      // ทุก `type: "xxx.yyy"` ที่อยู่ในบล็อก emitOutbox ทั่วทั้ง src/
      const emitted = new Set<string>();
      for (const f of walk("src")) {
        const src = readFileSync(f, "utf8");
        for (const m of src.matchAll(/emitOutbox\([\s\S]{0,400}?type:\s*"([a-z0-9._]+)"/g)) emitted.add(m[1]!);
      }
      const registry = readFileSync("src/lib/outbox-consumers.ts", "utf8");
      const registered = new Set(Array.from(registry.matchAll(/^\s{2}"([a-z0-9._]+)":/gm), (m) => m[1]!));
      const missing = [...emitted].filter((t) => !registered.has(t));
      chk("CP-6.1", "🔴 ทุก event type ที่ยิงจากที่ไหนก็ตามใน src/ ต้องมี consumer ลงทะเบียนไว้",
        missing.length === 0, "ไม่มีตัวไหนตกหล่น", j({ ยังไม่ลงทะเบียน: missing }));
      chk("CP-6.2", "🟢 คู่บวก: ตัวสแกนหา event เจอจริงหลายตัว (ไม่ใช่เขียวเพราะ regex พัง)",
        emitted.size >= 5 && emitted.has("chat.conversation.read"),
        "≥5 ตัว และมี chat.conversation.read", j({ เจอ: [...emitted].sort() }));
      chk("CP-6.3", "ไม่มี consumer = ต้องส่งเสียง ไม่ใช่ค้างเงียบ",
        /logOps\(\s*"ERROR",\s*"outbox"/.test(readFileSync("src/lib/core/outbox.ts", "utf8")),
        "มี logOps ERROR ตอนไม่เจอ consumer", "?");

      // ── ตัวเฝ้าคิว: ตาข่ายนิรภัยต้องมีสัญญาณเตือน ไม่งั้นเรารู้ตัวช้ากว่าผู้ใช้เสมอ ──
      const { outboxHealth } = await import("@/lib/core/outbox" as string) as {
        outboxHealth: (n: Date, ms?: number) => Promise<{ stale: number; dead: number; oldestStaleMin: number }>;
      };
      const NOW = new Date("2026-08-30T10:00:00.000Z");
      tables.outboxEvent = [
        { id: "o1", status: "PENDING", createdAt: new Date("2026-08-30T09:00:00.000Z"), tenantId: "T1" }, // ค้าง 60 นาที
        { id: "o2", status: "PENDING", createdAt: new Date("2026-08-30T09:59:00.000Z"), tenantId: "T1" }, // เพิ่งเข้า ปกติ
        { id: "o3", status: "FAILED", createdAt: new Date("2026-08-30T08:00:00.000Z"), tenantId: "T1" },
        { id: "o4", status: "DONE", createdAt: new Date("2026-08-30T08:00:00.000Z"), tenantId: "T1" },
      ];
      const h = await outboxHealth(NOW);
      chk("CP-6.4", "🔴 ตัวเฝ้านับ 'ค้างนานผิดปกติ' และ 'ล้มถาวร' ได้ถูกต้อง (ใบที่เพิ่งเข้าไม่นับ)",
        h.stale === 1 && h.dead === 1 && h.oldestStaleMin === 60,
        "ค้าง 1 · ตาย 1 · เก่าสุด 60 นาที", j(h));
      tables.outboxEvent = [{ id: "o5", status: "DONE", createdAt: NOW, tenantId: "T1" }];
      const h2 = await outboxHealth(NOW);
      chk("CP-6.5", "🟢 คู่บวก: คิวปกติ → เงียบ (ไม่ปลุกเจ้าของทุกชั่วโมง)",
        h2.stale === 0 && h2.dead === 0, "0/0", j(h2));
      const CRON = readFileSync("src/lib/platform/cron.ts", "utf8");
      chk("CP-6.6", "cron รายชั่วโมงเรียกตัวเฝ้า **หลัง** drain แล้วแจ้ง ERROR เมื่อผิดปกติ",
        /outboxHealth\(now\)/.test(CRON) && /"outbox-health"/.test(CRON) &&
        CRON.indexOf("drainAll()") < CRON.indexOf("outboxHealth(now)"),
        "เรียกหลัง drain + logOps ERROR", j({ health: /outboxHealth\(now\)/.test(CRON), source: /"outbox-health"/.test(CRON) }));
    });
  }

  chk("CP-9.9", "ไม่มี query หลุดออก DB จริง (fake prisma รับทุกครั้ง) · HTTP ออกเฉพาะ exp.host ที่ดักไว้",
    process.env.DATABASE_URL === "postgresql://qc:qc@127.0.0.1:1/qc-no-db" && net.every((n) => n.url.includes("exp.host")),
    "DATABASE_URL ถูกทับ · HTTP เฉพาะ exp.host", `${String(process.env.DATABASE_URL).slice(0, 30)} · urls ${j([...new Set(net.map((n) => n.url))])}`, "MINOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT PUSH + BADGE =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

// QC — WO-CV8: ข้อความเสียง (อัด → อัป → เล่นกลับ → ลูกค้าได้ยิน) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ตรวจแล้ว 1 ก.ย. 2026 ไม่มีชื่อนี้ในรีโป
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
// ⚠️ **ห้ามแตะ DB จริง** → ทับ `DATABASE_URL` ก่อน import โค้ดแอป
// ⚠️ contract-first: ของทั้งหมดยังไม่มี (สาย H รอบ 4) → ต้องแดงอย่างถูกต้อง ห้าม skip เงียบ
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-V2 §3 WO-CV8) ═══════
// VO-1) สคีมา: `ChatMessageType.AUDIO` + `ChatAttachment.durationMs`
// VO-2) 🔴 ที่เก็บไฟล์ยอมรับชนิดเสียงจริง **พร้อมนามสกุลที่ถูก** — ถ้าเพิ่ม mime แต่ลืมนามสกุล
//       ไฟล์จะถูกเสิร์ฟเป็น octet-stream แล้วกดฟังไม่ได้ (กลายเป็นดาวน์โหลด)
// VO-3) adapter ทุกตัวประกาศได้ว่าส่งเสียงได้ไหม (`capabilities`) — ไม่ใช่ให้หน้าจอเดาเอง
// VO-4) 🔴 **ช่องทางที่ไม่รองรับต้องกันก่อนกดส่ง** ไม่ใช่ปล่อยให้ FAILED ทีหลัง
//       (เสียงที่อัดแล้วส่งไม่ออก = ของที่หายไปเฉย ๆ · ทีมไม่รู้ว่าลูกค้าไม่ได้ยิน)
//       วัด 2 ชั้น: (ก) หน้าจอซ่อน/ปิดปุ่มไมค์ตาม capability · (ข) ฝั่งเซิร์ฟเวอร์ปฏิเสธ **ก่อน**
//       สร้างแถวข้อความ (ไม่ใช่สร้างแล้วค่อยมาร์ก FAILED)
// VO-5) อัดด้วย `MediaRecorder` + มีทางลงให้เบราว์เซอร์ที่ไม่รองรับ webm (Safari = audio/mp4)
// VO-6) อัปผ่าน **เส้นทางไฟล์แนบเดิม** (ไม่สร้างที่เก็บใหม่ซ้อน) และมีเพดานความยาว
// VO-7) 🔴 **ลูกค้าต้องฟังได้** — ทางออกสาธารณะ (`PublicMsg`/API v1) ต้องพา url + ความยาวไปด้วย
//       ไม่งั้นทีมส่งเสียงไปแล้วลูกค้าไม่มีทางเล่น = ของที่ส่งแล้วหาย
// VO-8) ความยาวคลิปถูกบันทึกจริงและถูกตรวจ (เลขติดลบ/ยาวเกินเพดานต้องไม่ผ่าน)
// VO-11) 🔴 LINE ส่งเสียงแบบ async (WO-CV13 · ปิดมติ D31 ทาง ข) — ไฟล์ที่ตัวอัดผลิตคือ wav
//        แต่ LINE รับเฉพาะ m4a ⇒ ระหว่างรอ worker แปลง ข้อความ "อยู่ในห้องแล้วแต่ยังไม่ถึงลูกค้า"
//        ช่วงนี้ต้องมีสถานะของมันเอง (นาฬิกา + เหตุผล) **ห้ามขึ้นติ๊ก ✓** และห้ามยิง wav เข้า LINE
// VO-9) PDPA: ไฟล์เสียงถูกกวาดตาม `retentionDays` เหมือนเนื้อความอื่น
//       🔴 เสียงคือเนื้อความอีกรูปหนึ่ง — ปกปิดข้อความแล้วแต่คลิปเสียงยังฟังได้ = ยังไม่ได้ปกปิด

try { process.loadEnvFile(".env"); } catch {}
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db";
process.env.CHAT_CREDENTIALS_KEY ??= "0".repeat(64);

const { readFileSync, existsSync, readdirSync, statSync } = await import("node:fs");
const { join, resolve } = await import("node:path");

// 🔴 Fable 1 ก.ย. — หา "รากรีโป" โดยเดินขึ้นจนเจอ package.json แทนการนับชั้นตายตัว
//    ของเดิม `resolve(import.meta.dirname, "..")` ถูกเมื่ออยู่ใน `scripts/` แต่พังทันทีที่ย้ายมา
//    `scripts/pending/` (ชี้ไป `scripts/` → `read()` คืนสตริงว่าง → **แดงหลอก 13 ข้อทั้งที่โค้ดถูก**)
//    ⇒ ชุดนี้ต้องรันได้เหมือนกันทั้งตอนพักและตอนย้ายเข้าเป็นด่านจริง (มติ D5)
const ROOT = (() => {
  let d = import.meta.dirname;
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(d, "package.json"))) return d;
    d = resolve(d, "..");
  }
  throw new Error("หารากรีโปไม่เจอ (เดินขึ้นไป 6 ชั้นแล้วไม่เจอ package.json)");
})();

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const j = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const section = async (id: string, name: string, fn: () => void | Promise<void>) => {
  console.log(name);
  try { await fn(); } catch (e) { chk(`${id}.CRASH`, `${name} ล้มกลางคัน`, false, "รันจบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)); }
};

const read = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const strip = (s: string) => s.replace(/([a-z])\/\*/g, "$1/\u0000").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\u0000/g, "*").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1"); // 🔴 D24: กัน `image/*` `audio/*` ในสตริงถูกนับเป็นเปิดคอมเมนต์ (เคยกินโค้ดหาย 12k ตัวอักษร)
function walk(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return /\.tsx?$/.test(abs) ? [rel] : [];
  const out: string[] = [];
  for (const e of readdirSync(abs)) out.push(...walk(join(rel, e)));
  return out;
}

const FILES = [...walk("src/lib/modules/chat"), ...walk("src/app/app/sys/[id]/chat"), ...walk("src/app/api/v1/chat"), ...walk("src/app/api/chat")];
const SCREEN = FILES.filter((f) => f.endsWith(".tsx")).map((f) => strip(read(f))).join("\n");
const SERVER = FILES.filter((f) => f.endsWith(".ts")).map((f) => strip(read(f))).join("\n");
const SCHEMA = read("prisma/schema/chat.prisma");
const RETENTION = strip(read("src/lib/modules/chat/retention.ts"));
const SERVICE = strip(read("src/lib/modules/chat/service.ts"));

// ───────── prisma จำลอง + ตัวดัก fetch สำหรับ VO-11 (WO-CV13) ─────────
// 🔴 ต้องยัดลง require.cache **ก่อน** โมดูลใด ๆ ที่ import `@/lib/core/db` ถูกโหลด
//    (storage/service ด้านล่างก็ import db — ยัดทีหลัง = สายไปแล้วสำหรับโมดูลนั้น)
// เลียนแบบวิธีของ `qc-chat-core-v2.mts` แต่เพิ่ม `include` (attachments / conversation.contact)
// ซึ่ง `deliverPendingVoice` ใช้จริง
const { createRequire } = await import("node:module");
const { Prisma } = await import("@prisma/client");

/** โฮสต์ CDN ปลอมของข้อสอบ — ด่าน S1 ตัดสินจากค่านี้ ⇒ ต้องตั้งเองไม่ใช่พึ่ง .env ของเครื่อง */
const QC_CDN = "https://qc-cdn.example.net";
process.env.SHARK_BUNNY_CDN = QC_CDN;
process.env.ABLY_API_KEY = ""; // ปิด realtime — ข้อสอบนี้ห้ามยิงเน็ตออกจริง

type Row = Record<string, unknown>;
type ChatSvc = {
  sendReply: (a: Record<string, unknown>) => Promise<{ ok: boolean; reason?: string; messageId?: string }>;
  deliverPendingVoice?: (a?: { limit?: number; now?: Date }) => Promise<{ sent: number; failed: number; skipped: number }>;
};

const tables: Record<string, Row[]> = {};
let seq = 0;
const CMP = new Set(["gt", "gte", "lt", "lte"]);
const OPS = new Set(["not", "in", "notIn", "equals", "contains", "startsWith", "endsWith", "mode", ...CMP]);
const numOf = (v: unknown): number | null => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : null);

function matches(row: Row, where: unknown): boolean {
  if (!where || typeof where !== "object") return true;
  for (const [k, v] of Object.entries(where as Record<string, unknown>)) {
    if (k === "AND") { if (!(v as unknown[]).every((w) => matches(row, w))) return false; continue; }
    if (k === "OR") { if (!(v as unknown[]).some((w) => matches(row, w))) return false; continue; }
    if (v === undefined) continue;
    if (v === null) { if (row[k] !== null && row[k] !== undefined) return false; continue; }
    if (v instanceof Date) { if (numOf(row[k]) !== v.getTime()) return false; continue; }
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
      if ("startsWith" in o) { if (!String(row[k] ?? "").startsWith(String(o.startsWith))) return false; continue; }
      const a = numOf(row[k]);
      for (const op of opKeys) {
        const b = numOf(o[op]);
        if (a === null || b === null) return false;
        if (op === "gt" && !(a > b)) return false;
        if (op === "gte" && !(a >= b)) return false;
        if (op === "lt" && !(a < b)) return false;
        if (op === "lte" && !(a <= b)) return false;
      }
      continue;
    }
    if (row[k] !== v) return false;
  }
  return true;
}

/** เลียน `include` ของ Prisma เท่าที่เส้นทางส่งเสียงใช้จริง */
function withInclude(model: string, row: Row | null, include: unknown): Row | null {
  if (!row || !include || typeof include !== "object") return row;
  const inc = include as Record<string, unknown>;
  const out: Row = { ...row };
  if (inc.attachments) out.attachments = (tables.chatAttachment ?? []).filter((a) => a.messageId === row.id);
  if (inc.contact) out.contact = (tables.chatContact ?? []).find((c) => c.id === row.contactId) ?? row.contact ?? null;
  if (inc.conversation && model === "chatMessage") {
    const conv = (tables.chatConversation ?? []).find((c) => c.id === row.conversationId) ?? null;
    out.conversation = withInclude("chatConversation", conv, (inc.conversation as { include?: unknown })?.include);
  }
  return out;
}

const DEFAULTS: Record<string, Row> = {
  chatMessage: { type: "TEXT", isInternal: false, deliveryStatus: "SENT", senderName: null, body: null, meta: null, clientMessageId: null, externalMessageId: null, deliveryError: null, translatedBody: null, translatedLang: null },
  chatConversation: { status: "OPEN", staffUnreadCount: 0, tags: [], meta: null, lastMessageAt: null, firstResponseAt: null, assigneeUserId: null, unitId: null },
  chatAttachment: { durationMs: null, width: null, height: null },
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

function fakeDelegate(model: string) {
  const rows = () => (tables[model] ??= []);
  const find = (a: Record<string, unknown>) => rows().find((r) => matches(r, a.where)) ?? null;
  const sorted = (a: Record<string, unknown>) => {
    const list = rows().filter((r) => matches(r, a.where));
    const ob = a.orderBy as Record<string, string> | undefined;
    if (ob && typeof ob === "object" && !Array.isArray(ob)) {
      const key = Object.keys(ob)[0]!;
      const dir = ob[key] === "desc" ? -1 : 1;
      list.sort((x, y) => ((numOf(x[key]) ?? 0) - (numOf(y[key]) ?? 0)) * dir);
    }
    return typeof a.take === "number" ? list.slice(0, a.take) : list;
  };
  return {
    findFirst: async (a: Record<string, unknown> = {}) => withInclude(model, find(a), a.include),
    findUnique: async (a: Record<string, unknown> = {}) => withInclude(model, find(a), a.include),
    findMany: async (a: Record<string, unknown> = {}) => sorted(a).map((r) => withInclude(model, r, a.include)),
    count: async (a: Record<string, unknown> = {}) => rows().filter((r) => matches(r, a.where)).length,
    aggregate: async (a: Record<string, unknown> = {}) => ({ _count: { _all: rows().filter((r) => matches(r, a.where)).length } }),
    create: async (a: Record<string, unknown> = {}) => {
      const data = (a.data ?? {}) as Row;
      if (model === "outboxEvent" && rows().some((r) => r.tenantId === data.tenantId && r.idempotencyKey === data.idempotencyKey)) {
        throw new Prisma.PrismaClientKnownRequestError("[fake] unique", { code: "P2002", clientVersion: "qc" });
      }
      const r: Row = { id: `fk-${model}-${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...structuredClone(DEFAULTS[model] ?? {}), ...data };
      rows().push(r);
      return r;
    },
    update: async (a: Record<string, unknown> = {}) => { const r = find(a); if (!r) throw new Error(`[fake] ${model}.update ไม่พบแถว`); applyData(r, (a.data ?? {}) as Row); return r; },
    updateMany: async (a: Record<string, unknown> = {}) => { const rs = rows().filter((r) => matches(r, a.where)); for (const r of rs) applyData(r, (a.data ?? {}) as Row); return { count: rs.length }; },
    upsert: async (a: Record<string, unknown> = {}) => { const r = find(a); if (r) { applyData(r, (a.update ?? {}) as Row); return r; } const n: Row = { id: `fk-${model}-${++seq}`, createdAt: new Date(), ...(DEFAULTS[model] ?? {}), ...((a.create ?? {}) as Row) }; rows().push(n); return n; },
    deleteMany: async () => ({ count: 0 }),
  };
}

const delegateCache: Record<string, ReturnType<typeof fakeDelegate>> = {};
const fakePrisma: unknown = new Proxy({} as Record<string, unknown>, {
  get(_t, p) {
    if (typeof p !== "string" || p === "then") return undefined;
    if (p === "$transaction") {
      return async (fn: unknown) => (typeof fn === "function" ? await (fn as (tx: unknown) => unknown)(fakePrisma) : undefined);
    }
    if (p === "$executeRaw" || p === "$executeRawUnsafe" || p === "$queryRaw" || p === "$queryRawUnsafe") return async () => 0;
    if (p === "$disconnect" || p === "$connect") return async () => {};
    if (p.startsWith("$")) return () => { throw new Error(`[fake] ห้ามเรียก prisma.${p} ในข้อสอบนี้`); };
    return (delegateCache[p] ??= fakeDelegate(p));
  },
});

const qcRequire = createRequire(import.meta.url);
const qcDbFile = resolve(import.meta.dirname, "../src/lib/core/db.ts");
qcRequire.cache[qcDbFile] = {
  id: qcDbFile, filename: qcDbFile, path: resolve(qcDbFile, ".."), loaded: true,
  exports: { prisma: fakePrisma, tenantDb: () => fakePrisma }, children: [], paths: [],
} as never;

// ── ตัวดัก fetch: ข้อสอบนี้ห้ามยิงเน็ตออกจริง และต้องอ่าน payload ที่ยิงเข้า LINE ได้ ──
const netCalls: { url: string; body: unknown }[] = [];
let nextStatus = 200;
const resetNet = () => { netCalls.length = 0; nextStatus = 200; };
globalThis.fetch = (async (u: unknown, init?: { body?: unknown }) => {
  let body: unknown = null;
  try { body = JSON.parse(String(init?.body ?? "null")); } catch { body = String(init?.body ?? ""); }
  netCalls.push({ url: String(u), body });
  const payload = nextStatus === 200 ? JSON.stringify({ sentMessages: [{ id: "LINE-MSG-1" }] }) : "err";
  return new Response(payload, { status: nextStatus, headers: { "content-type": "application/json" } });
}) as typeof fetch;

/** ห้อง LINE สะอาด 1 ห้อง (contact + conversation + connection + ตั้งค่าร้าน) */
function seedLineRoom() {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.chatChannelConnection = [{ id: "conn-line", tenantId: "T1", systemId: "S1", type: "LINE", displayName: "LINE OA", status: "CONNECTED", externalAccountId: "U-bot", credentials: { channelAccessToken: "tok-qc", channelSecret: "sec-qc" }, defaultUnitId: null }];
  tables.chatSetting = [{ id: "st1", tenantId: "T1", systemId: "S1", memberSystemId: null, senderAlias: "ทีมงาน", greetingMessage: {}, offlineMessage: {} }];
  tables.chatContact = [{ id: "ct-1", tenantId: "T1", systemId: "S1", channel: "LINE", channelConnectionId: "conn-line", externalUserId: "U-line-1", displayName: "คุณเอ", blockedAt: null }];
  tables.chatConversation = [{ id: "conv-line", tenantId: "T1", systemId: "S1", contactId: "ct-1", channel: "LINE", channelConnectionId: "conn-line", unitId: null, status: "OPEN", lastMessageAt: new Date(1), staffUnreadCount: 0, firstResponseAt: null, meta: null }];
  tables.chatMessage = [];
  tables.chatAttachment = [];
  tables.outboxEvent = [];
  tables.chatConversationEvent = [];
  resetNet();
}

/** ข้อความเสียงที่ค้างรอไฟล์แปลง 1 ใบ (สภาพเดียวกับที่ sendReply ทิ้งไว้) */
function seedPending(id: string, att: { mimeType: string; url: string }, createdAt: Date) {
  (tables.chatMessage ??= []).push({
    id, tenantId: "T1", systemId: "S1", conversationId: "conv-line", direction: "OUT", type: "AUDIO",
    body: null, isInternal: false, senderUserId: "U1", senderName: null,
    deliveryStatus: "PENDING", deliveryError: null, externalMessageId: null,
    meta: { pendingReason: "TRANSCODE" }, createdAt,
  });
  (tables.chatAttachment ??= []).push({
    id: `at-${id}`, tenantId: "T1", systemId: "S1", messageId: id, kind: "AUDIO",
    url: att.url, storageKey: att.url, fileName: att.url.split("/").pop(), mimeType: att.mimeType,
    sizeBytes: 20000, durationMs: 4200, width: null, height: null, createdAt,
  });
}

const storage = (await import("@/lib/storage/service" as string).catch(() => null)) as
  | { ALLOWED_UPLOAD_TYPES?: Record<string, string>; CHAT_ATTACHMENT_MAX_BYTES?: number }
  | null;
const adapters = (await import("@/lib/modules/chat/adapter" as string).catch(() => null)) as
  | { getAdapter?: (t: string) => { capabilities: Record<string, unknown> }; isSupported?: (t: string) => boolean }
  | null;

try {
  await section("VO-0", "VO-0 คู่บวก — สภาพตั้งต้น:", () => {
    chk("VO-0.1", "🟢 import ทะเบียนที่เก็บไฟล์ได้", storage?.ALLOWED_UPLOAD_TYPES !== undefined, "ได้", "import ไม่ผ่าน");
    chk("VO-0.2", "🟢 import ทะเบียน adapter ได้", typeof adapters?.getAdapter === "function", "ได้", "import ไม่ผ่าน");
    chk("VO-0.3", "🟢 อ่านซอร์สหน้าจอแชทได้", SCREEN.length > 5000, "≥5000", `${SCREEN.length}`);
  });

  // ═════════ VO-1 · สคีมา ═════════
  await section("VO-1", "VO-1 สคีมารองรับข้อความเสียง:", () => {
    const typeEnum = SCHEMA.match(/enum ChatMessageType \{([\s\S]*?)\n\}/)?.[1] ?? "";
    chk("VO-1.1", "enum ChatMessageType มีค่า AUDIO", /\bAUDIO\b/.test(typeEnum), "มี AUDIO", "ยังไม่มี");
    const att = SCHEMA.match(/model ChatAttachment \{([\s\S]*?)\n\}/)?.[1] ?? "";
    chk("VO-1.2", "ChatAttachment มี durationMs (แสดง 0:12 ได้โดยไม่ต้องโหลดไฟล์)",
      /durationMs\s+Int\?/.test(att), "มี durationMs Int?", "ยังไม่มี");
  });

  // ═════════ VO-2 · ชนิดไฟล์ ═════════
  await section("VO-2", "VO-2 ที่เก็บไฟล์ยอมรับเสียงพร้อมนามสกุลที่ถูก:", () => {
    const types = storage?.ALLOWED_UPLOAD_TYPES ?? {};
    const audio = Object.entries(types).filter(([mime]) => mime.startsWith("audio/"));
    chk("VO-2.1", "🔴 allowlist มีชนิดเสียงอย่างน้อย 1 ชนิด (ไม่งั้นอัปโหลดถูกปฏิเสธตั้งแต่ต้นทาง)",
      audio.length > 0, "≥1 ชนิด audio/*", `มีแต่ ${j(Object.keys(types).slice(0, 12))}`);
    chk("VO-2.2", "รองรับชนิดที่เบราว์เซอร์อัดออกมาจริง (webm ของ Chrome/Android · mp4/m4a ของ Safari/iOS)",
      audio.some(([m]) => /webm/.test(m)) && audio.some(([m]) => /(mp4|m4a|aac|mpeg)/.test(m)),
      "มีทั้งฝั่ง Chrome และ Safari", j(audio.map(([m]) => m)));
    chk("VO-2.3", "🔴 ทุกชนิดเสียงมีนามสกุลจริง ไม่ตกเป็น bin (ไม่งั้น CDN เสิร์ฟเป็นดาวน์โหลด กดฟังไม่ได้)",
      audio.length > 0 && audio.every(([, ext]) => !!ext && ext !== "bin"), "ทุกชนิดมี ext",
      j(audio.filter(([, e]) => !e || e === "bin")));
  });

  // ═════════ VO-3/4 · ความสามารถของช่องทาง + กันก่อนส่ง ═════════
  await section("VO-3", "VO-3/4 ช่องทางที่ส่งเสียงไม่ได้ ต้องกัน **ก่อน** กดส่ง:", () => {
    const cap = (t: string): Record<string, unknown> | null => {
      try { return adapters?.getAdapter?.(t)?.capabilities ?? null; } catch { return null; }
    };
    const web = cap("WEBCHAT");
    const line = cap("LINE");
    const AUDIO_KEYS = ["sendAudio", "audio", "sendVoice", "voice"];
    const hasFlag = (c: Record<string, unknown> | null) => !!c && AUDIO_KEYS.some((k) => typeof c[k] === "boolean");
    chk("VO-3.1", `🔴 adapter ประกาศความสามารถเรื่องเสียง (รับชื่อ ${j(AUDIO_KEYS)})`,
      hasFlag(web) && hasFlag(line), "ทุก adapter ที่เปิดใช้ประกาศครบ",
      `WEBCHAT=${j(web)} · LINE=${j(line)}`);
    chk("VO-3.2", "🟢 คู่บวก: ธงเดิม (sendImage) ยังอยู่ — ไม่ได้ทำของเดิมหายตอนเพิ่มของใหม่",
      typeof web?.sendImage === "boolean", "มี sendImage", j(web));
    // (ก) ฝั่งหน้าจอ
    chk("VO-4.1", "หน้าจออ่านความสามารถของช่องทางก่อนโชว์ปุ่มไมค์",
      /(sendAudio|sendVoice|canSendAudio|capabilities)/.test(SCREEN), "หน้าจอรู้ว่าช่องทางนี้ส่งเสียงได้ไหม",
      "ไม่รู้ — ทีมจะกดอัดแล้วส่งไม่ออก");
    chk("VO-4.2", "มีข้อความไทยบอกเหตุผลตอนช่องทางไม่รองรับ (ห้ามเงียบ · ห้ามโทษผู้ใช้)",
      /(ช่องทางนี้ยังส่งข้อความเสียงไม่ได้|ไม่รองรับข้อความเสียง|ส่งเสียงไม่ได้)/.test(SCREEN + SERVER),
      "มีข้อความอธิบาย", "ไม่มี");
    // (ข) ฝั่งเซิร์ฟเวอร์ — ต้องปฏิเสธก่อนสร้างแถว ไม่ใช่สร้างแล้วมาร์ก FAILED
    const sendPath = SERVICE.slice(SERVICE.indexOf("sendReply"));
    const iCap = sendPath.search(/sendAudio|sendVoice|capabilities/);
    const iCreate = sendPath.search(/chatMessage\.create/);
    chk("VO-4.3", "🔴 ฝั่งเซิร์ฟเวอร์ตรวจความสามารถ **ก่อน** สร้างแถวข้อความ (ไม่ใช่สร้างแล้วมาร์ก FAILED)",
      iCap >= 0 && iCreate >= 0 && iCap < iCreate, "ตรวจก่อน create",
      iCap < 0 ? "ไม่มีการตรวจความสามารถในเส้นทางส่ง" : `ตรวจที่ ${iCap} · create ที่ ${iCreate}`);
  });

  // ═════════ VO-10 · ชนิดไฟล์ต้อง "เล่นได้ทุกเครื่อง" (เพิ่ม 2 ก.ย. — เจ้าของเทสจริงแล้วเจอ iOS เล่น webm ไม่ได้) ═════════
  await section("VO-10", "VO-10 ชนิดไฟล์เล่นได้ทุกเครื่อง (D29):", () => {
    const V10_STORAGE = strip(read("src/lib/storage/service.ts"));
    const ci = SCREEN.indexOf("CANDIDATE_TYPES");
    const cand = ci >= 0 ? SCREEN.slice(ci, ci + 400) : "";
    // 🔁 แก้รอบสอง 2 ก.ย.: m4a จาก MediaRecorder ของ Chrome เป็น fragmented MP4 ⇒ iOS เปิดไฟล์ตรง ๆ ไม่ได้
    //    ⇒ สัญญาใหม่: **WAV ผ่าน Web Audio เป็นเส้นทางเดียว** (candidates ว่าง = MediaRecorder ไม่ถูกใช้ผลิตไฟล์)
    chk("VO-10.1", "🔴 ตัวอัดผลิตเฉพาะชนิดที่เล่นได้ทุกเครื่องแน่นอน — WAV เส้นทางเดียว (candidates ว่าง)",
      /CANDIDATE_TYPES = \[\] as const/.test(SCREEN) && /startWav\(stream\)/.test(SCREEN),
      "CANDIDATE_TYPES ว่าง + startWav", cand.slice(0, 120));
    chk("VO-10.2", "🔴 มีทางลง WAV (Web Audio) สำหรับเบราว์เซอร์ที่อัด m4a ไม่ได้ (Firefox) — ห้ามผลิต webm อีก",
      /encodeWav/.test(SCREEN) && /audio\/wav/.test(SCREEN), "encodeWav + audio/wav", "ไม่พบ");
    chk("VO-10.3", "storage รับ audio/wav พร้อมนามสกุล", /"audio\/wav":\s*"wav"/.test(V10_STORAGE), "มี", "ไม่พบ");
    chk("VO-10.4", "🔴 ฟองเสียงตรวจ canPlayType — ไฟล์เก่าที่เครื่องเล่นไม่ได้ต้องได้ลิงก์เปิด/ดาวน์โหลด ไม่ใช่ปุ่มเงียบ",
      /canPlayType/.test(SCREEN), "มี fallback", "ปุ่มโกหก");
    chk("VO-10.5", "🔴 ดัก error ตอนเล่นจริงด้วย (ไฟล์ชนิดถูกแต่โครงผิด canPlayType จับไม่ได้ — fMP4)",
      /onError=/.test(SCREEN) && /\.catch\(/.test(SCREEN), "onError + play().catch สลับเป็นลิงก์", "ไม่พบ");
  });

  // ═════════ VO-5/6/8 · การอัดและอัป ═════════
  await section("VO-5", "VO-5/6/8 การอัดและการอัปโหลด:", () => {
    chk("VO-5.1", "อัดด้วย MediaRecorder ในคอมโพเนนต์ฝั่งเบราว์เซอร์", /MediaRecorder/.test(SCREEN), "มี", "ไม่พบ");
    chk("VO-5.2", "🔴 มีทางลงเมื่อเบราว์เซอร์ไม่รองรับ webm (Safari/iOS อัดได้แค่ mp4 — ครึ่งหนึ่งของลูกค้าไทย)",
      /isTypeSupported/.test(SCREEN) || (/audio\/webm/.test(SCREEN) && /audio\/(mp4|aac)/.test(SCREEN)),
      "เลือกชนิดตามที่เบราว์เซอร์รองรับ", "ล็อก webm อย่างเดียว — iPhone อัดไม่ได้");
    chk("VO-5.3", "ขอสิทธิ์ไมโครโฟนตอนผู้ใช้กดเอง (ไม่ใช่ขอทันทีที่เปิดหน้า)",
      /getUserMedia/.test(SCREEN), "ผ่าน getUserMedia ตอนกด", "ไม่พบ", "MAJOR");
    chk("VO-6.1", "อัปผ่านเส้นทางไฟล์แนบเดิม (ไม่สร้างที่เก็บใหม่ซ้อน)",
      /(uploadFile|CHAT_ATTACHMENT_MAX_BYTES)/.test(SERVER), "ใช้เส้นทางเดิม", "ไม่พบ");
    chk("VO-8.1", "ความยาวคลิปถูกส่งขึ้นและบันทึกลง durationMs",
      /durationMs/.test(SERVER), "บันทึกจริง", "ไม่บันทึก — ฟองเสียงจะไม่รู้ความยาว");
    chk("VO-8.2", "🔴 ตรวจความยาวที่รับมา (ค่าติดลบ/เกินเพดานต้องไม่ผ่าน — ค่ามาจากเบราว์เซอร์ = ปลอมได้)",
      /durationMs/.test(SERVER) && /(Math\.min|Math\.max|MAX_VOICE|> *\d{4,}|<= *0)/.test(SERVER),
      "มีการจำกัดค่า", "รับค่าดิบจากเบราว์เซอร์ตรง ๆ", "MAJOR");
  });

  // ═════════ VO-7 · ลูกค้าต้องฟังได้ ═════════
  await section("VO-7", "VO-7 🔴 ลูกค้าต้องฟังได้จริง (ไม่งั้นของที่ส่งแล้วหาย):", () => {
    const pubAtt = SERVICE.match(/export type PublicAttachment = \{([\s\S]*?)\};/)?.[1] ?? "";
    chk("VO-7.1", "🟢 คู่บวก: หา PublicAttachment (รูปข้อมูลที่ส่งให้ลูกค้า) เจอ", pubAtt.length > 20, "เจอ", "ไม่เจอ — สัญญาเปลี่ยน");
    chk("VO-7.2", "ทางออกสาธารณะพาความยาวคลิปไปด้วย (ไม่งั้นฝั่งลูกค้าวาดฟองเสียงไม่ได้)",
      /durationMs/.test(pubAtt), "มี durationMs", "ไม่มี — ลูกค้าได้แค่ลิงก์ไฟล์เปล่า");
    chk("VO-7.3", "ตัวแปลงข้อความสาธารณะส่งค่านั้นออกไปจริง (ไม่ใช่ประกาศ type ไว้เฉย ๆ)",
      /duration/.test(SERVICE.slice(SERVICE.indexOf("function toPublicMsg"), SERVICE.indexOf("function toPublicMsg") + 900)),
      "toPublicMsg ส่ง duration", "ประกาศแล้วแต่ไม่ได้ส่ง");
    chk("VO-7.4", "ข้อความชนิด AUDIO ไม่ถูกกรองทิ้งจากทางออกสาธารณะ (ตัวกรองที่มีต้องเป็นเรื่องโน้ตภายในเท่านั้น)",
      !/type\s*:\s*\{\s*in\s*:\s*\[/.test(SERVICE) || /AUDIO/.test(SERVICE), "ไม่มีรายชื่อชนิดที่กรอง AUDIO ทิ้ง",
      "พบตัวกรองชนิดข้อความที่อาจตัด AUDIO ทิ้ง", "MAJOR");
  });

  // ═════════ VO-9 · PDPA ═════════
  await section("VO-9", "VO-9 PDPA — เสียงคือเนื้อความอีกรูปหนึ่ง:", () => {
    chk("VO-9.1", "🔴 การกวาดตามอายุข้อมูลจัดการไฟล์แนบด้วย (ไม่ใช่ล้างแต่ตัวหนังสือ)",
      /chatAttachment|attachments/i.test(RETENTION), "retention แตะไฟล์แนบ",
      "ล้างแต่ body — คลิปเสียงยังฟังได้หลังปกปิดข้อความแล้ว");
    chk("VO-9.2", "ไม่มีวันที่/ปีฮาร์ดโค้ดในโค้ดเสียง",
      !/\b20\d{2}-\d{2}-\d{2}\b/.test(SCREEN), "ไม่มี", j((SCREEN.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? []).slice(0, 3)));
  });

  // ═════════ VO-11 · LINE ส่งข้อความเสียงแบบ async (WO-CV13 · ปิดมติ D31 ทาง ข) ═════════
  //
  // 🔴 ทำไมต้องมีหมวดนี้ (บทเรียน D31): "ช่องทางส่งเสียงได้" เป็นคำสัญญาที่ **ผิดได้เงียบ ๆ**
  //    ไฟล์ที่ตัวอัดผลิตคือ wav แต่ LINE รับเฉพาะ m4a ⇒ ทางที่เลือกคือส่งช้าแบบ async
  //    ซึ่งแลกมาด้วยช่วงเวลาที่ "ข้อความอยู่ในห้องแล้วแต่ยังไม่ถึงลูกค้า" — ช่วงนี้แหละที่อันตราย
  //    เพราะถ้าฟองขึ้น ✓ ทีมจะเชื่อว่าลูกค้าได้ยินแล้ว ⇒ ข้อสอบต้องล็อกสถานะให้ตรงความจริง
  //
  // ชุดนี้รันด้วย prisma จำลองในหน่วยความจำ + ดัก `fetch` เพื่ออ่าน payload ที่ยิงเข้า LINE จริง ๆ
  // (แบบเดียวกับ `qc-chat-core-v2.mts` — ห้ามแตะ DB จริงและห้ามยิงเน็ตออกจริง)
  await section("VO-11", "\nVO-11 ส่งเสียงเข้า LINE แบบ async (D31 ทาง ข):", async () => {
    const chat = (await import("@/lib/modules/chat/service" as string).catch((e) => {
      console.log(`  (import service ล้ม: ${e instanceof Error ? e.message.slice(0, 200) : String(e)})`);
      return null;
    })) as ChatSvc | null;
    const line = (await import("@/lib/modules/chat/line" as string).catch(() => null)) as
      | { lineAdapter?: { capabilities?: Record<string, unknown>; sendMessage?: (a: unknown) => Promise<{ externalMessageId?: string }> } }
      | null;
    const bubble = (await import("@/lib/modules/chat/bubble" as string).catch(() => null)) as
      | { deliveryMark?: (m: Row, r: number | null) => { icon: string; title: string; failed: boolean; read: boolean } }
      | null;

    // ── VO-11.1 · adapter ของ LINE ต้องยิง audio message ตามสเปกจริง ──
    const cap = line?.lineAdapter?.capabilities ?? {};
    chk("VO-11.1a", "🔴 LINE ประกาศ capabilities.audio = true (ปุ่มไมค์ในห้อง LINE ถึงจะกดได้)",
      cap.audio === true, "true", j(cap));
    resetNet();
    let audioBody: Row | null = null;
    try {
      await line?.lineAdapter?.sendMessage?.({
        creds: { channelAccessToken: "tok-qc" },
        externalUserId: "U-line-1",
        message: { type: "AUDIO", audioUrl: `${QC_CDN}/chat/a.m4a`, durationMs: 4200 },
      });
      audioBody = ((netCalls[0]?.body as Row)?.messages as Row[])?.[0] ?? null;
    } catch { /* แดงที่ chk ข้างล่าง ไม่ใช่ล้มทั้งหมวด */ }
    chk("VO-11.1b", "sendMessage(AUDIO) → body ของ LINE เป็น {type:'audio', originalContentUrl, duration(ms)}",
      audioBody?.type === "audio" && audioBody?.originalContentUrl === `${QC_CDN}/chat/a.m4a` && audioBody?.duration === 4200,
      `audio·${QC_CDN}/chat/a.m4a·4200`, j(audioBody));

    // ── VO-11.2 · เสียง wav ในห้อง LINE = ค้าง PENDING ห้ามแตะ adapter ──
    seedLineRoom();
    resetNet();
    const wav = await chat!.sendReply({
      tenantId: "T1", systemId: "S1", conversationId: "conv-line", senderUserId: "U1",
      unitAccess: ["*"],
      attachments: [{ url: `${QC_CDN}/chat/v1.wav`, mimeType: "audio/wav", fileName: "v1.wav", sizeBytes: 64000, durationMs: 4200 }],
    });
    const wavMsg = (tables.chatMessage ?? []).find((m) => m.id === wav.messageId) ?? null;
    chk("VO-11.2a", "🔴 เสียง wav ในห้อง LINE → บันทึกได้ (ok) แต่สถานะเป็น PENDING ไม่ใช่ SENT",
      wav.ok === true && wavMsg?.deliveryStatus === "PENDING" && wavMsg?.type === "AUDIO",
      "ok:true · PENDING · AUDIO", j({ ok: wav.ok, reason: wav.reason, st: wavMsg?.deliveryStatus, t: wavMsg?.type }));
    chk("VO-11.2b", "meta.pendingReason = TRANSCODE (ฟองต้องรู้ว่ากำลังรอแปลงไฟล์ ไม่ใช่ 'กำลังส่ง' เฉย ๆ)",
      ((wavMsg?.meta ?? {}) as Row).pendingReason === "TRANSCODE", "TRANSCODE", j(wavMsg?.meta));
    // 🔴 ต้องพ่วง `ok === true` ด้วย ไม่งั้นข้อนี้เขียวหลอกตอนที่ระบบ **ปฏิเสธเสียงตั้งแต่ต้น**
    //    (ไม่ยิงเพราะไม่รับ ≠ ไม่ยิงเพราะรอไฟล์แปลง — คนละความหมายกันคนละเรื่อง)
    chk("VO-11.2c", "🔴 รับข้อความไว้แล้วแต่ไม่ยิง adapter เลย (ยิง wav เข้า LINE = 400 ทุกครั้ง)",
      wav.ok === true && netCalls.length === 0, "ok:true · 0 คำขอ", j({ ok: wav.ok, urls: netCalls.map((c) => c.url) }));
    chk("VO-11.2d", "ยังยิง outbox `chat.message.sent` ตามเดิม (ห้ามเพิ่ม event type ใหม่ที่ไม่มี consumer)",
      (tables.outboxEvent ?? []).filter((e) => e.type === "chat.message.sent").length === 1,
      "1 event", j((tables.outboxEvent ?? []).map((e) => e.type)));

    // ── VO-11.3 · เสียง m4a ในห้อง LINE = ส่งทันที ──
    seedLineRoom();
    resetNet();
    const m4a = await chat!.sendReply({
      tenantId: "T1", systemId: "S1", conversationId: "conv-line", senderUserId: "U1",
      unitAccess: ["*"],
      attachments: [{ url: `${QC_CDN}/chat/v2.m4a`, mimeType: "audio/mp4", fileName: "v2.m4a", sizeBytes: 20000, durationMs: 3754 }],
    });
    const m4aMsg = (tables.chatMessage ?? []).find((m) => m.id === m4a.messageId) ?? null;
    const m4aSent = ((netCalls[0]?.body as Row)?.messages as Row[])?.[0] ?? null;
    chk("VO-11.3", "เสียง m4a ในห้อง LINE → ยิง audio ทันที + SENT + externalMessageId",
      m4a.ok === true && m4aSent?.type === "audio" && m4aMsg?.deliveryStatus === "SENT" && m4aMsg?.externalMessageId === "LINE-MSG-1",
      "audio · SENT · LINE-MSG-1", j({ ok: m4a.ok, reason: m4a.reason, sent: m4aSent, st: m4aMsg?.deliveryStatus, ext: m4aMsg?.externalMessageId }));

    // ── VO-11.4 · ตัวส่งที่ค้าง ──
    chk("VO-11.4a", "🟢 คู่บวก: service export `deliverPendingVoice` ให้สคริปต์นอก Next เรียกได้",
      typeof chat?.deliverPendingVoice === "function", "function", typeof chat?.deliverPendingVoice);
    // 🔴 ยังไม่มีของ = ทุกข้อที่เหลือต้อง "แดงอย่างถูกต้อง" ไม่ใช่ล้มทั้งหมวดจนอ่านไม่ออกว่าอะไรควรแดง
    const deliver = async (a: { limit: number; now: Date }) =>
      typeof chat?.deliverPendingVoice === "function" ? await chat.deliverPendingVoice(a) : { sent: -1, failed: -1, skipped: -1 };
    seedLineRoom();
    resetNet();
    const NOW = new Date();
    seedPending("p-m4a", { mimeType: "audio/mp4", url: `${QC_CDN}/chat/p1.m4a` }, new Date(NOW.getTime() - 60_000));
    seedPending("p-wav-new", { mimeType: "audio/wav", url: `${QC_CDN}/chat/p2.wav` }, new Date(NOW.getTime() - 60_000));
    seedPending("p-wav-old", { mimeType: "audio/wav", url: `${QC_CDN}/chat/p3.wav` }, new Date(NOW.getTime() - 45 * 60_000));
    const res4 = await deliver({ limit: 10, now: NOW });
    const row = (id: string) => (tables.chatMessage ?? []).find((m) => m.id === id) ?? null;
    chk("VO-11.4b", "ไฟล์เป็น m4a แล้ว → ส่งเข้า LINE แล้วเป็น SENT",
      row("p-m4a")?.deliveryStatus === "SENT" && res4.sent === 1,
      "SENT · sent=1", j({ st: row("p-m4a")?.deliveryStatus, res: res4 }));
    chk("VO-11.4c", "ยังเป็น wav และอายุน้อย → ไม่แตะ (รอ worker รอบถัดไป)",
      row("p-wav-new")?.deliveryStatus === "PENDING" && res4.skipped === 1,
      "PENDING · skipped=1", j({ st: row("p-wav-new")?.deliveryStatus, res: res4 }));
    chk("VO-11.4d", "🔴 ยังเป็น wav และค้างเกิน 30 นาที → FAILED TRANSCODE_TIMEOUT (ฟองขึ้น ✗ + ปุ่มส่งซ้ำ)",
      row("p-wav-old")?.deliveryStatus === "FAILED" && row("p-wav-old")?.deliveryError === "TRANSCODE_TIMEOUT",
      "FAILED·TRANSCODE_TIMEOUT", j({ st: row("p-wav-old")?.deliveryStatus, err: row("p-wav-old")?.deliveryError }));
    chk("VO-11.4e", "ยิงเข้า LINE เฉพาะใบที่พร้อมจริง 1 ใบ (ไม่ยิงใบที่ยังเป็น wav)",
      netCalls.length === 1 && ((netCalls[0]?.body as Row)?.messages as Row[])?.[0]?.type === "audio",
      "1 คำขอ · audio", j(netCalls.map((c) => (c.body as Row)?.messages)));

    // ── VO-11.5 · adapter ล้ม / โทเคนหลุด ──
    seedLineRoom();
    resetNet();
    nextStatus = 500;
    seedPending("p-fail", { mimeType: "audio/mp4", url: `${QC_CDN}/chat/p4.m4a` }, new Date(NOW.getTime() - 60_000));
    await deliver({ limit: 10, now: NOW });
    const failRow = row("p-fail");
    const failEvt = (tables.chatConversationEvent ?? []).filter((e) => e.type === "DELIVERY_FAILED");
    chk("VO-11.5a", "adapter โยน → FAILED + deliveryError + ChatConversationEvent DELIVERY_FAILED",
      failRow?.deliveryStatus === "FAILED" && typeof failRow?.deliveryError === "string" &&
        String(failRow?.deliveryError).startsWith("LINE_500") && failEvt.length === 1,
      "FAILED · LINE_500* · 1 event", j({ st: failRow?.deliveryStatus, err: failRow?.deliveryError, evt: failEvt.length }));
    seedLineRoom();
    resetNet();
    nextStatus = 401;
    seedPending("p-token", { mimeType: "audio/mp4", url: `${QC_CDN}/chat/p5.m4a` }, new Date(NOW.getTime() - 60_000));
    await deliver({ limit: 10, now: NOW });
    const conn = (tables.chatChannelConnection ?? []).find((c) => c.id === "conn-line") ?? null;
    chk("VO-11.5b", "🔴 TOKEN_EXPIRED → ปิดสถานะ connection เป็น ERROR (ไม่งั้นทีมยิงซ้ำเรื่อย ๆ โดยไม่รู้ว่าโทเคนหลุด)",
      row("p-token")?.deliveryError === "TOKEN_EXPIRED" && conn?.status === "ERROR",
      "TOKEN_EXPIRED · connection ERROR", j({ err: row("p-token")?.deliveryError, st: conn?.status }));
    nextStatus = 200;

    // ── VO-11.6 · S1 ลิงก์ต้องอยู่ใต้ CDN ของเราเท่านั้น ──
    seedLineRoom();
    resetNet();
    seedPending("p-evil", { mimeType: "audio/mp4", url: "https://evil.example.com/pwn.m4a" }, new Date(NOW.getTime() - 60_000));
    await deliver({ limit: 10, now: NOW });
    chk("VO-11.6", "🔒 S1: url นอก CDN ของเรา → FAILED AUDIO_URL_NOT_CDN และ **ไม่ยิง** (ห้ามพา LINE ไปดึงไฟล์ที่อื่น)",
      row("p-evil")?.deliveryStatus === "FAILED" && row("p-evil")?.deliveryError === "AUDIO_URL_NOT_CDN" && netCalls.length === 0,
      "FAILED·AUDIO_URL_NOT_CDN·0 คำขอ", j({ st: row("p-evil")?.deliveryStatus, err: row("p-evil")?.deliveryError, net: netCalls.length }));

    // ── VO-11.7 · ฟองต้องบอกความจริง ──
    const mark = bubble?.deliveryMark?.({ deliveryStatus: "PENDING", createdAt: 0, pendingReason: "TRANSCODE" }, null);
    chk("VO-11.7", "🔴 ฟอง PENDING+TRANSCODE → นาฬิกา + ข้อความที่บอกว่ากำลังส่งเข้า LINE · ห้ามเป็นติ๊ก ✓",
      mark?.icon === "clock" && /LINE/.test(mark?.title ?? "") && mark?.read === false,
      "clock + title มีคำว่า LINE + read:false", j(mark));

    // ── VO-11.8 · ด่าน static ของ worker + adapter ──
    const WORKER = strip(read("scripts/voice-transcode-worker.mts"));
    const LINE_SRC = read("src/lib/modules/chat/line.ts");
    chk("VO-11.8a", "🔒 S2: worker กรอง `kind: \"AUDIO\"` (wav ที่แนบเป็นไฟล์เอกสารต้องไม่ถูกแปลงเงียบ ๆ)",
      /kind:\s*"AUDIO"/.test(WORKER), 'kind: "AUDIO"', "ไม่พบ");
    chk("VO-11.8b", "🔒 S2: worker กรอง url ให้อยู่ใต้ CDN ของเรา (กัน SSRF — worker fetch url จาก DB ตรง ๆ)",
      /startsWith:\s*`\$\{CDN\}\//.test(WORKER), "url startsWith CDN", "ไม่พบ");
    chk("VO-11.8c", "worker เรียก deliverPendingVoice หลังลูปแปลง (ไม่งั้นแปลงเสร็จแล้วไม่มีใครส่ง)",
      /deliverPendingVoice/.test(WORKER), "เรียก deliverPendingVoice", "ไม่พบ");
    chk("VO-11.8d", "line.ts ไม่เหลือข้อความ \"ยังไม่ตัดสิน\" (คอมเมนต์ที่ค้างโกหกคือหนี้ที่แพงที่สุด)",
      !/ยังไม่ตัดสิน/.test(LINE_SRC), "ไม่มี", "ยังมีคอมเมนต์เก่าที่ขัดกับความจริงใหม่");
  });

} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT V2 VOICE =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

// QC — chat retention / PDPA (WO-C12) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ ชื่อไฟล์: `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — qc-chat-security.mts (M9–M12),
//    qc-chat-security-scope.mts (B1/B5/B6/B10), qc-chat-core-v2.mts (WO-C2) มีอยู่ก่อนแล้ว
//    (qc-all.mts ค้น `qc-*.mts` อัตโนมัติ — สร้างไฟล์ใหม่ = เป็นด่านทันที)
//
// ⚠️ ชุดนี้ **ห้ามแตะฐานข้อมูล** (.env ของเครื่องนี้ชี้ prod จริง) → กัน 2 ชั้นเหมือน qc-chat-core-v2:
//   1) ทับ DATABASE_URL เป็น host ที่ต่อไม่ได้ ทันทีหลัง loadEnvFile
//   2) ยัด fake prisma ลง require.cache ของ `src/lib/core/db.ts` **ก่อน** import โมดูล
//   fake รอบนี้ทำเพิ่มจาก core-v2: รองรับ `take` + `orderBy` จริง (ไม่งั้นข้อสอบเรื่อง batch/limit
//   จะเขียวแบบผลลวงเพราะของปลอมคืนทุกแถวเสมอ) · ใส่ค่า default ของ schema ตอน create
//   (บทเรียน §12: ไม่เติม default = where ที่อิงค่า default หาแถวไม่เจอ = ข้อสอบเขียวหลอก)
//
// สัญญา src/lib/modules/chat/retention.ts:
// RT-1) purgeExpiredChatMessages({now,limit}) → { scanned, purged, systems }
//       ข้อความเก่ากว่า now − retentionDays ถูก **ปกปิด** (body/stickerMeta/orderContext/meta/
//       senderName ล้าง + purgedAt ประทับ) โดย **แถวยังอยู่** (purgedAt ในสคีมา = เจตนาเก็บซอง)
//       · ไฟล์แนบ: url/fileName ล้าง แต่ **storageKey ต้องอยู่** (handle เดียวที่จะไปลบไฟล์จริงบน CDN
//         ทีหลัง — ลบแถว = ไฟล์กำพร้าตลอดกาล) · ห้ามเรียก delete/deleteMany เลย
//       · 🔴 positive control: ข้อความที่ยังไม่ถึงกำหนดต้องไม่ถูกแตะแม้แต่ฟิลด์เดียว
//       · 🔴 ChatConversation.lastMessagePreview (denorm) ต้องถูกล้างด้วย ไม่งั้นเนื้อหายังโผล่ใน inbox
//         แต่เธรดที่ข้อความล่าสุดยังไม่หมดอายุ ห้ามโดนล้าง (positive control)
// RT-2) รันซ้ำได้: รอบ 2 ต้อง scanned/purged = 0 · purgedAt เดิมไม่ถูกทับ · where มี purgedAt: null
//       · limit จำกัดจำนวนจริงต่อรอบ (ส่ง take ลง query) และมีค่าตั้งต้น (ไม่ใช่ไม่จำกัด)
// RT-3) แยกร้าน/แยกระบบ: แต่ละ ChatSetting ใช้ retentionDays ของตัวเอง · ทุก where มี tenantId+systemId
//       · clamp 90–730 (ค่าเพี้ยนน้อยห้ามกวาดของใหม่ทิ้ง · ค่าเพี้ยนมากห้ามกลายเป็นเก็บตลอดกาล)
// RT-4) ต่อเข้า cron: runDailyCron มี chatPurged + field เดิมครบ · purge พังต้องไม่ล้มทั้งรอบ (-1)
//       · หน้า channels มีช่องตั้งค่า 90–730 · action ตรวจสิทธิ์ด้วย assertChatCan · setter ไม่ข้ามร้าน
// RT-5) 🔴 WO-CV9 (เพิ่ม 2 ก.ย.) **ไฟล์จริงบน storage ต้องถูกลบ ไม่ใช่แค่ล้างฟิลด์**
//       เหตุผลที่แก้ในชุดเดิมแทนสร้างไฟล์ใหม่ (Fable อนุญาตเฉพาะรอบนี้): ชุดนี้คือด่านของ retention
//       โดยตรง · ข้อ RT-1.7/RT-1.8 ที่มีอยู่ **การันตีตรงข้าม**กับพฤติกรรมใหม่ไม่ได้ถ้าไม่มี RT-5 คู่กัน
//       — RT-1.8 บอกแค่ "storageKey ต้องอยู่" ซึ่ง**เขียวได้ทั้งที่ไฟล์ยังอยู่บน CDN ตลอดกาล**
//       ⇒ ต้องมีข้อที่ **fail-before**: ถอด `deleteStoredFile` ออกจาก retention.ts เมื่อไหร่ RT-5.1 แดงทันที
//       · ไฟล์ที่หลายแถวชี้ร่วมกัน ห้ามลบ (positive control — ฟองของเธรดที่ยังไม่หมดอายุต้องรอด)
//       · ลบไฟล์ล้มเหลว/ระเบิด → ฟิลด์ต้องถูกล้างอยู่ดี (ความเป็นส่วนตัวใน DB ห้ามขึ้นกับ CDN)

try { process.loadEnvFile(".env"); } catch {}
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db"; // กันพลาด: ต่อไม่ติดโดยตั้งใจ
// 🔴 ตัด env ของ Bunny ทิ้งทันทีหลัง loadEnvFile — .env ของเครื่องนี้เป็นคีย์ **ของจริง**
//    retention เรียกตัวลบไฟล์แล้ว (WO-CV9): env ครบเมื่อไหร่ = ยิง DELETE ไปที่ storage prod จริง
//    ข้อสอบที่ลบไฟล์ลูกค้าทิ้งคือข้อสอบที่อันตรายกว่าบั๊กที่มันจับ
delete process.env.SHARK_BUNNY_ZONE;
delete process.env.SHARK_BUNNY_KEY;
delete process.env.SHARK_BUNNY_CDN;
delete process.env.BUNNY_ACCOUNT_KEY;
process.env.CHAT_CREDENTIALS_KEY ??= "0".repeat(64);

const { readFileSync } = await import("node:fs");
const { createRequire } = await import("node:module");
const { resolve } = await import("node:path");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const j = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
// แต่ละหมวดรันแยก — หมวดที่พังต้องแดงเฉพาะตัวเอง ไม่กลืนหมวดอื่นหายไปเงียบ ๆ (อ่าน fail-before ออก)
const section = async (id: string, name: string, fn: () => Promise<void>) => {
  console.log(name);
  try { await fn(); } catch (e) { chk(`${id}.CRASH`, `${name} ล้มกลางคัน`, false, "รันจบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)); }
};

// ───────── fake prisma (mini query engine + take/orderBy จริง) ─────────
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: { op: string; args: Record<string, unknown> }[] = [];
const seen = (op: string) => calls.filter((c) => c.op === op);
let seq = 0;
let netCalls = 0;
let boom: string | null = null; // ชื่อ op ที่ให้ระเบิด (ทดสอบว่า cron ไม่ล้มทั้งรอบ)

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

// ค่า default ของ schema (chat.prisma) — fake ต้องเติมเองตอน create ไม่งั้นได้ข้อสอบเขียวหลอก
const DEFAULTS: Record<string, Row> = {
  chatSetting: { retentionDays: 365, widgetEnabled: true, preChatFormEnabled: false, slaFirstResponseMin: 15, unassignedAlertMin: 5, memberSystemId: null, senderAlias: null, greetingMessage: {}, offlineMessage: {}, theme: {}, widgetDisabledUnitIds: [] },
  chatMessage: { type: "TEXT", isInternal: false, deliveryStatus: "SENT", senderName: null, body: null, stickerMeta: null, orderContext: null, meta: null, purgedAt: null, clientMessageId: null, externalMessageId: null },
  chatConversation: { status: "OPEN", staffUnreadCount: 0, reopenedCount: 0, tags: [], meta: null, lastMessageAt: null, lastMessagePreview: null },
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

// เรียง + ตัดตาม take จริง (ของปลอมที่ไม่ทำ = ข้อสอบเรื่อง batch เขียวหลอก)
function order(rows: Row[], orderBy: unknown): Row[] {
  if (!orderBy || typeof orderBy !== "object") return rows;
  const [k, dir] = Object.entries(orderBy as Record<string, string>)[0] ?? [];
  if (!k) return rows;
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = num(a[k]) ?? 0, y = num(b[k]) ?? 0;
    if (x !== y) return (x - y) * sign;
    return String(a.id).localeCompare(String(b.id)) * sign;
  });
}

function delegate(model: string) {
  const rows = () => (tables[model] ??= []);
  const rec = (op: string, a: Record<string, unknown>) => {
    const full = `${model}.${op}`;
    calls.push({ op: full, args: a });
    if (boom && full === boom) throw new Error(`[fake] จงใจให้ ${full} พัง`);
  };
  const sel = (a: Record<string, unknown>) => {
    let rs = rows().filter((r) => matches(r, a.where));
    rs = order(rs, a.orderBy);
    if (typeof a.take === "number") rs = rs.slice(0, a.take);
    return rs;
  };
  return {
    findFirst: async (a: Record<string, unknown> = {}) => { rec("findFirst", a); return sel(a)[0] ?? null; },
    findUnique: async (a: Record<string, unknown> = {}) => { rec("findUnique", a); return sel(a)[0] ?? null; },
    findMany: async (a: Record<string, unknown> = {}) => { rec("findMany", a); return sel(a); },
    count: async (a: Record<string, unknown> = {}) => { rec("count", a); return sel(a).length; },
    aggregate: async (a: Record<string, unknown> = {}) => { rec("aggregate", a); return { _count: { _all: sel(a).length } }; },
    create: async (a: Record<string, unknown> = {}) => {
      rec("create", a);
      const r: Row = { id: `fk-${model}-${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...(DEFAULTS[model] ?? {}), ...((a.data ?? {}) as Row) };
      rows().push(r);
      return r;
    },
    update: async (a: Record<string, unknown> = {}) => { rec("update", a); const r = sel(a)[0]; if (!r) throw new Error(`[fake] ${model}.update ไม่พบแถว ${j(a.where)}`); applyData(r, (a.data ?? {}) as Row); return r; },
    updateMany: async (a: Record<string, unknown> = {}) => { rec("updateMany", a); const rs = rows().filter((r) => matches(r, a.where)); for (const r of rs) applyData(r, (a.data ?? {}) as Row); return { count: rs.length }; },
    upsert: async (a: Record<string, unknown> = {}) => { rec("upsert", a); const r = sel(a)[0]; if (r) { applyData(r, (a.update ?? {}) as Row); return r; } const n: Row = { id: `fk-${model}-${++seq}`, createdAt: new Date(), ...(DEFAULTS[model] ?? {}), ...((a.create ?? {}) as Row) }; rows().push(n); return n; },
    // ลบจริง — ของปลอมที่คืน count 0 เฉย ๆ จะทำให้ข้อ "แถวยังอยู่" เขียวหลอกเวลาโค้ดเลือกลบแถวทิ้ง
    delete: async (a: Record<string, unknown> = {}) => { rec("delete", a); const r = sel(a)[0]; if (r) tables[model] = rows().filter((x) => x !== r); return r ?? null; },
    deleteMany: async (a: Record<string, unknown> = {}) => { rec("deleteMany", a); const rs = rows().filter((r) => matches(r, a.where)); tables[model] = rows().filter((r) => !rs.includes(r)); return { count: rs.length }; },
  };
}

const cache: Record<string, ReturnType<typeof delegate>> = {};
const fakePrisma: unknown = new Proxy({} as Record<string, unknown>, {
  get(_t, p) {
    if (typeof p !== "string" || p === "then") return undefined;
    if (p === "$transaction") return async (fn: unknown) => (typeof fn === "function" ? await (fn as (tx: unknown) => unknown)(fakePrisma) : undefined);
    if (p === "$executeRaw" || p === "$executeRawUnsafe" || p === "$queryRaw" || p === "$queryRawUnsafe") {
      return async (...a: unknown[]) => { calls.push({ op: "$executeRaw", args: { sql: Array.isArray(a[0]) ? (a[0] as string[]).join("?") : String(a[0]) } }); return []; };
    }
    if (p === "$disconnect" || p === "$connect") return async () => {};
    if (p.startsWith("$")) return () => { throw new Error(`[fake] ห้ามเรียก prisma.${p} ในข้อสอบนี้ (ห้ามแตะ DB)`); };
    return (cache[p] ??= delegate(p));
  },
});

const req = createRequire(import.meta.url);
const dbFile = resolve(import.meta.dirname, "../src/lib/core/db.ts");
req.cache[dbFile] = { id: dbFile, filename: dbFile, path: resolve(dbFile, ".."), loaded: true, exports: { prisma: fakePrisma, tenantDb: () => fakePrisma }, children: [], paths: [] } as never;

// ดักเน็ตเวิร์ก — ข้อสอบนี้ห้ามมี HTTP ออกจริง
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...a: Parameters<typeof realFetch>) => { netCalls++; throw new Error("[fake] ห้ามยิงเน็ตเวิร์กในข้อสอบนี้ " + String(a[0])); }) as typeof realFetch;

const UI = readFileSync("src/lib/modules/chat/ui.tsx", "utf8");
const ACTIONS = readFileSync("src/lib/modules/chat/actions.ts", "utf8");

type PurgeDeps = { deleteFile?: (url: string, o?: { tenantId?: string }) => Promise<{ ok: boolean; reason?: string }> };
type Retention = {
  purgeExpiredChatMessages: (o?: { now?: Date; limit?: number }, d?: PurgeDeps) => Promise<{ scanned: number; purged: number; systems: number }>;
  setRetentionDays: (t: string, s: string, d: unknown) => Promise<number | null>;
  clampRetentionDays: (v: unknown) => number;
  RETENTION_MIN_DAYS: number;
  RETENTION_MAX_DAYS: number;
};

const DAY = 86_400_000;
const NOW = new Date("2026-08-28T03:00:00+07:00");
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

// เนื้อหาที่ต้องหายจริง (ถ้าโผล่ที่ไหนหลัง purge = ช่องโหว่)
const OLD_SECRET = "เลขบัตรประชาชนลูกค้า 1234567890123";
const NEW_TEXT = "ขอจองทริปสิมิลันวันที่ 5 ค่ะ";

/**
 * S1 (T1) retention 90 วัน · S2 (T2) retention 730 วัน
 * S1: conv-a มีข้อความเก่า(200 วัน) 2 ข้อความ + ไฟล์แนบ → ต้องถูกปกปิดทั้งคู่ + preview ถูกล้าง
 *     conv-b มีข้อความเก่า(200 วัน) 1 + ข้อความใหม่(2 วัน) 1 → เก่าโดน · ใหม่ห้ามโดน · preview ห้ามล้าง
 * S2: conv-c ข้อความเก่า 200 วัน แต่ร้านตั้ง 730 วัน → ห้ามแตะ (positive control ข้ามระบบ)
 */
function seed() {
  for (const k of Object.keys(tables)) delete tables[k];
  calls.length = 0;
  netCalls = 0;
  boom = null;
  tables.chatSetting = [
    { id: "set-1", tenantId: "T1", systemId: "S1", retentionDays: 90 },
    { id: "set-2", tenantId: "T2", systemId: "S2", retentionDays: 730 },
  ];
  tables.chatConversation = [
    { id: "conv-a", tenantId: "T1", systemId: "S1", contactId: "ct-a", channel: "WEBCHAT", status: "OPEN", lastMessageAt: ago(200), lastMessagePreview: OLD_SECRET, staffUnreadCount: 0 },
    { id: "conv-b", tenantId: "T1", systemId: "S1", contactId: "ct-b", channel: "LINE", status: "OPEN", lastMessageAt: ago(2), lastMessagePreview: NEW_TEXT, staffUnreadCount: 1 },
    { id: "conv-c", tenantId: "T2", systemId: "S2", contactId: "ct-c", channel: "WEBCHAT", status: "OPEN", lastMessageAt: ago(200), lastMessagePreview: "ของร้านอื่น ห้ามแตะ", staffUnreadCount: 0 },
  ];
  tables.chatMessage = [
    { id: "m-old-1", tenantId: "T1", systemId: "S1", conversationId: "conv-a", direction: "IN", type: "TEXT", body: OLD_SECRET, senderName: null, stickerMeta: null, orderContext: null, meta: { ip: "1.2.3.4" }, isInternal: false, purgedAt: null, externalMessageId: "line-evt-1", clientMessageId: null, createdAt: ago(201) },
    { id: "m-old-2", tenantId: "T1", systemId: "S1", conversationId: "conv-a", direction: "OUT", type: "IMAGE", body: "ส่งสำเนาบัตรมาให้แล้วครับ", senderName: "สมชาย ใจดี", stickerMeta: null, orderContext: null, meta: null, isInternal: false, purgedAt: null, externalMessageId: null, clientMessageId: null, createdAt: ago(200) },
    { id: "m-old-3", tenantId: "T1", systemId: "S1", conversationId: "conv-b", direction: "IN", type: "TEXT", body: "ข้อความเก่าของอีกเธรด", senderName: null, stickerMeta: null, orderContext: null, meta: null, isInternal: false, purgedAt: null, externalMessageId: null, clientMessageId: null, createdAt: ago(200) },
    { id: "m-new-1", tenantId: "T1", systemId: "S1", conversationId: "conv-b", direction: "IN", type: "TEXT", body: NEW_TEXT, senderName: null, stickerMeta: null, orderContext: null, meta: { pageUrl: "https://www.siamdive.com/x" }, isInternal: false, purgedAt: null, externalMessageId: null, clientMessageId: null, createdAt: ago(2) },
    { id: "m-t2-old", tenantId: "T2", systemId: "S2", conversationId: "conv-c", direction: "IN", type: "TEXT", body: "ข้อความร้านอื่น 200 วัน (retention 730)", senderName: null, stickerMeta: null, orderContext: null, meta: null, isInternal: false, purgedAt: null, externalMessageId: null, clientMessageId: null, createdAt: ago(200) },
  ];
  tables.chatAttachment = [
    { id: "at-old", tenantId: "T1", systemId: "S1", messageId: "m-old-2", kind: "IMAGE", storageKey: "t/T1/chat/abc123.jpg", url: "https://cdn.shark/t/T1/chat/abc123.jpg", fileName: "บัตรประชาชน-สมหญิง.jpg", mimeType: "image/jpeg", sizeBytes: 4242, width: 800, height: 600 },
    { id: "at-new", tenantId: "T1", systemId: "S1", messageId: "m-new-1", kind: "FILE", storageKey: "t/T1/chat/def456.pdf", url: "https://cdn.shark/t/T1/chat/def456.pdf", fileName: "ใบจอง.pdf", mimeType: "application/pdf", sizeBytes: 111 },
    { id: "at-t2", tenantId: "T2", systemId: "S2", messageId: "m-t2-old", kind: "FILE", storageKey: "t/T2/chat/ghi789.pdf", url: "https://cdn.shark/t/T2/chat/ghi789.pdf", fileName: "ของร้านอื่น.pdf", mimeType: "application/pdf", sizeBytes: 222 },
  ];
}

// คืน {} เมื่อหาแถวไม่เจอ — โค้ดที่เลือก "ลบแถวทิ้ง" ต้องทำให้ข้อที่เกี่ยวข้องแดงเป็นข้อ ๆ
// ไม่ใช่ระเบิดทั้งหมวดจนอ่าน fail-before ไม่ออก (แถวหาย = ข้อ RT-1.4 จับได้อยู่แล้ว)
const MISSING: Row = { __missing: true };
const msg = (id: string) => tables.chatMessage?.find((m) => m.id === id) ?? MISSING;
const conv = (id: string) => tables.chatConversation?.find((c) => c.id === id) ?? MISSING;
const att = (id: string) => tables.chatAttachment?.find((a) => a.id === id) ?? MISSING;
const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "object" && v !== null && !(v instanceof Date) && Object.keys(v as object).length === 0);

try {
  const ret = (await import("@/lib/modules/chat/retention" as string).catch((e) => { console.log(`  (import ล้ม: ${e instanceof Error ? e.message.slice(0, 300) : String(e)})`); return null; })) as Retention | null;

  if (!ret || typeof ret.purgeExpiredChatMessages !== "function") {
    chk("RT-0", "มี src/lib/modules/chat/retention.ts + purgeExpiredChatMessages()", false, "import ได้ + มีฟังก์ชัน", ret ? "ไม่มีฟังก์ชัน" : "import ไม่ได้");
  } else {
    // ───────── RT-1: ปกปิดของเก่า · ห้ามแตะของใหม่ ─────────
    await section("RT-1", "RT-1 ปกปิดเนื้อหาที่หมดอายุ (เก็บแถว ไม่ลบทิ้ง):", async () => {
      seed();
      const r = await ret.purgeExpiredChatMessages({ now: NOW });

      chk("RT-1.1", "คืน { scanned, purged, systems } เป็นตัวเลขครบ", typeof r.scanned === "number" && typeof r.purged === "number" && typeof r.systems === "number", "ครบ 3 ตัวเลข", j(r));
      const m1 = msg("m-old-1");
      chk("RT-1.2", "🔴 ข้อความเก่ากว่ากำหนดถูกปกปิด (body/meta ล้าง + purgedAt ประทับ)", m1.body === null && isBlank(m1.meta) && m1.purgedAt instanceof Date, "body null · meta ว่าง · purgedAt เป็นวันที่", j({ body: m1.body, meta: m1.meta, purgedAt: m1.purgedAt }));
      const m2 = msg("m-old-2");
      chk("RT-1.3", "senderName ของข้อความเก่าถูกล้างด้วย (ชื่อพนักงานก็เป็นข้อมูลบุคคล)", m2.senderName === null && m2.body === null, "senderName null · body null", j({ s: m2.senderName, b: m2.body }));
      chk("RT-1.4", "แถวยังอยู่ครบ (ปกปิด ไม่ใช่ลบทิ้ง — purgedAt ในสคีมาบอกเจตนา)", tables.chatMessage!.length === 5, "5 แถวเท่าเดิม", String(tables.chatMessage!.length));
      chk("RT-1.5", "🔴 ไม่เรียก delete/deleteMany เลยสักครั้ง (FK/สมุดกัน webhook ซ้ำต้องรอด)", seen("chatMessage.delete").length + seen("chatMessage.deleteMany").length + seen("chatAttachment.delete").length + seen("chatAttachment.deleteMany").length === 0, "0 ครั้ง", j(calls.filter((c) => /delete/i.test(c.op)).map((c) => c.op)));

      // 🔴 positive control — ของใหม่ห้ามโดนแม้แต่ฟิลด์เดียว
      const mn = msg("m-new-1");
      chk("RT-1.6", "🔴 positive control: ข้อความที่ยังไม่ถึงกำหนดไม่ถูกแตะเลย", mn.body === NEW_TEXT && mn.purgedAt === null && !isBlank(mn.meta), "body/meta เดิม · purgedAt null", j({ body: mn.body, purgedAt: mn.purgedAt, meta: mn.meta }));

      // ไฟล์แนบ
      const ao = att("at-old");
      chk("RT-1.7", "ไฟล์แนบของข้อความที่หมดอายุ: url/fileName ถูกล้าง (ชื่อไฟล์เป็น PII)", ao.url === "" && ao.fileName === "", '"" ทั้งคู่', j({ url: ao.url, fileName: ao.fileName }));
      chk("RT-1.8", "🔴 storageKey ต้องยังอยู่ — เป็น handle เดียวที่จะไปลบไฟล์จริงบน CDN ทีหลัง", ao.storageKey === "t/T1/chat/abc123.jpg", "t/T1/chat/abc123.jpg", String(ao.storageKey));
      const an = att("at-new");
      chk("RT-1.9", "positive control: ไฟล์แนบของข้อความที่ยังไม่หมดอายุไม่ถูกแตะ", an.url === "https://cdn.shark/t/T1/chat/def456.pdf" && an.fileName === "ใบจอง.pdf", "url/fileName เดิม", j({ url: an.url, fileName: an.fileName }));

      // 🔴 denorm ที่มองไม่เห็น
      chk("RT-1.10", "🔴 lastMessagePreview ของเธรดที่ข้อความล่าสุดถูกปกปิด ต้องถูกล้าง (ไม่งั้นเนื้อหายังโผล่ใน inbox)", conv("conv-a").lastMessagePreview === null, "null", j(conv("conv-a").lastMessagePreview));
      chk("RT-1.11", "🔴 positive control: เธรดที่ข้อความล่าสุดยังไม่หมดอายุ preview ห้ามหาย", conv("conv-b").lastMessagePreview === NEW_TEXT, NEW_TEXT, j(conv("conv-b").lastMessagePreview));

      // ไม่มีเนื้อหาหลงเหลือที่ไหนเลย
      const dump = j({ m: tables.chatMessage, c: tables.chatConversation, a: tables.chatAttachment });
      chk("RT-1.12", "🔴 เนื้อหาลับไม่หลงเหลือในตารางไหนเลยหลัง purge (ทั้งข้อความ · preview · ชื่อไฟล์)", !dump.includes("1234567890123") && !dump.includes("บัตรประชาชน-สมหญิง"), "ไม่พบ", `พบ: ${["1234567890123", "บัตรประชาชน-สมหญิง"].filter((s) => dump.includes(s)).join(", ")}`);
      chk("RT-1.13", "ตัวเลขที่คืนตรงกับของจริง (S1 ปกปิด 3 · 1 ระบบ)", r.purged === 3 && r.scanned === 3 && r.systems === 1, "{scanned:3,purged:3,systems:1}", j(r));
    });

    // ───────── RT-2: รันซ้ำได้ + batch ─────────
    await section("RT-2", "\nRT-2 รันซ้ำได้ (idempotent) + จำกัดจำนวนต่อรอบ:", async () => {
      seed();
      const r1 = await ret.purgeExpiredChatMessages({ now: NOW });
      const stamp = msg("m-old-1").purgedAt as Date;
      calls.length = 0;
      const LATER = new Date(NOW.getTime() + DAY);
      const r2 = await ret.purgeExpiredChatMessages({ now: LATER });
      chk("RT-2.1", "🔴 รันซ้ำ → ไม่บวม (scanned/purged/systems = 0)", r2.scanned === 0 && r2.purged === 0 && r2.systems === 0, "{0,0,0}", j({ r1, r2 }));
      chk("RT-2.2", "รันซ้ำไม่ทับ purgedAt เดิม (เวลาที่ลบจริงต้องคงที่)", (msg("m-old-1").purgedAt as Date).getTime() === stamp.getTime(), String(stamp.getTime()), String((msg("m-old-1").purgedAt as Date).getTime()));
      chk("RT-2.3", "รันซ้ำไม่ยิง updateMany ทิ้งเปล่า ๆ (where กรอง purgedAt: null ตั้งแต่ตอนอ่าน)", seen("chatMessage.updateMany").length === 0, "0 ครั้ง", String(seen("chatMessage.updateMany").length));
      // where ของ updateMany ต้องกัน purgedAt ซ้ำ
      seed();
      await ret.purgeExpiredChatMessages({ now: NOW });
      const wheres = seen("chatMessage.updateMany").map((c) => (c.args.where ?? {}) as Row);
      chk("RT-2.4", "updateMany ของข้อความมี purgedAt: null ใน where (กันทับซ้ำเชิงแข่งขัน)", wheres.length > 0 && wheres.every((w) => w.purgedAt === null), "ทุกครั้งมี purgedAt: null", j(wheres));

      // limit จำกัดจริง
      seed();
      const b1 = await ret.purgeExpiredChatMessages({ now: NOW, limit: 1 });
      chk("RT-2.5", "🔴 limit จำกัดจำนวนต่อรอบจริง (limit 1 → ปกปิด 1)", b1.purged === 1 && tables.chatMessage!.filter((m) => m.purgedAt !== null).length === 1, "purged 1", j({ b1, purged: tables.chatMessage!.filter((m) => m.purgedAt !== null).length }));
      const takes = seen("chatMessage.findMany").map((c) => c.args.take);
      chk("RT-2.6", "ส่ง take ลง query จริง (ไม่ใช่ดึงทั้งตารางมาแล้วค่อยตัดใน memory)", takes.length > 0 && takes.every((t) => typeof t === "number" && (t as number) <= 1), "take ≤ 1 ทุกครั้ง", j(takes));
      const b2 = await ret.purgeExpiredChatMessages({ now: NOW, limit: 1 });
      const b3 = await ret.purgeExpiredChatMessages({ now: NOW, limit: 5 });
      chk("RT-2.7", "รันหลายรอบแล้วเก็บครบ (ไม่มีข้อความเก่าตกค้าง)", b2.purged === 1 && b3.purged === 1 && tables.chatMessage!.filter((m) => m.purgedAt !== null).length === 3, "3 รอบรวม 3 แถว", j({ b2, b3, total: tables.chatMessage!.filter((m) => m.purgedAt !== null).length }));

      // ค่าตั้งต้นต้องมี (ไม่ใช่ไม่จำกัด)
      seed();
      calls.length = 0;
      await ret.purgeExpiredChatMessages({ now: NOW });
      const defTakes = seen("chatMessage.findMany").map((c) => c.args.take);
      chk("RT-2.8", "ไม่ส่ง limit → ยังมีเพดานต่อรอบ (ห้ามยิง findMany ไร้ take = ดึงทั้งตาราง)", defTakes.length > 0 && defTakes.every((t) => typeof t === "number" && (t as number) > 0), "ทุก findMany มี take", j(defTakes), "MAJOR");
    });

    // ───────── RT-3: แยกร้าน / แยกระบบ / clamp ─────────
    await section("RT-3", "\nRT-3 เคารพค่าของแต่ละระบบ + ไม่ข้ามร้าน:", async () => {
      seed();
      await ret.purgeExpiredChatMessages({ now: NOW });
      const t2 = msg("m-t2-old");
      chk("RT-3.1", "🔴 ระบบที่ตั้ง 730 วัน ข้อความ 200 วันต้องไม่ถูกแตะ (retentionDays แยกกันจริง)", t2.body === "ข้อความร้านอื่น 200 วัน (retention 730)" && t2.purgedAt === null && att("at-t2").url !== "", "body/purgedAt/url เดิม", j({ b: t2.body, p: t2.purgedAt, u: att("at-t2").url }));
      chk("RT-3.2", "🔴 ไม่ข้ามร้าน: ทุก where ของ chatMessage/chatAttachment/chatConversation มี tenantId + systemId", ["chatMessage.findMany", "chatMessage.updateMany", "chatAttachment.updateMany", "chatConversation.updateMany"].every((op) => { const cs = seen(op); return cs.length > 0 && cs.every((c) => { const w = (c.args.where ?? {}) as Row; return typeof w.tenantId === "string" && typeof w.systemId === "string"; }); }), "ทุก query ผูก tenantId+systemId", j(["chatMessage.findMany", "chatMessage.updateMany", "chatAttachment.updateMany", "chatConversation.updateMany"].map((op) => ({ op, n: seen(op).length, w: seen(op).map((c) => Object.keys((c.args.where ?? {}) as Row)) }))));
      chk("RT-3.3", "preview ของเธรดร้านอื่นไม่ถูกล้าง", conv("conv-c").lastMessagePreview === "ของร้านอื่น ห้ามแตะ", "ของร้านอื่น ห้ามแตะ", j(conv("conv-c").lastMessagePreview));

      // ระบบที่ตั้งค่าเพี้ยน → clamp
      chk("RT-3.4", "clamp: ต่ำกว่า 90 → 90 · เกิน 730 → 730 · ค่าไม่ใช่ตัวเลข → 365", typeof ret.clampRetentionDays === "function" && ret.clampRetentionDays(1) === 90 && ret.clampRetentionDays(0) === 90 && ret.clampRetentionDays(99999) === 730 && ret.clampRetentionDays(null) === 365 && ret.clampRetentionDays(365) === 365, "90/90/730/365/365", typeof ret.clampRetentionDays === "function" ? j([ret.clampRetentionDays(1), ret.clampRetentionDays(0), ret.clampRetentionDays(99999), ret.clampRetentionDays(null), ret.clampRetentionDays(365)]) : "ไม่มีฟังก์ชัน");

      // ตั้ง 1 วัน (เพี้ยน) → ต้องยังใช้ 90 → ข้อความ 2 วันต้องรอด
      seed();
      tables.chatSetting![0]!.retentionDays = 1;
      await ret.purgeExpiredChatMessages({ now: NOW });
      chk("RT-3.5", "🔴 ค่าเพี้ยน (1 วัน) ต้องถูกบีบเป็น 90 — ข้อความอายุ 2 วันห้ามหาย", msg("m-new-1").body === NEW_TEXT && msg("m-new-1").purgedAt === null, "ข้อความใหม่รอด", j({ b: msg("m-new-1").body, p: msg("m-new-1").purgedAt }));

      // ระบบที่ยังไม่มีข้อความเก่า ไม่ถูกนับเป็น systems
      seed();
      tables.chatMessage = tables.chatMessage!.filter((m) => m.systemId === "S2");
      const r = await ret.purgeExpiredChatMessages({ now: NOW });
      chk("RT-3.6", "ไม่มีอะไรให้ปกปิด → {0,0,0} ไม่ throw", r.scanned === 0 && r.purged === 0 && r.systems === 0, "{0,0,0}", j(r), "MAJOR");
    });

    // ───────── RT-4: cron + หน้าตั้งค่า + สิทธิ์ ─────────
    await section("RT-4", "\nRT-4 ต่อเข้า cron + หน้าตั้งค่า:", async () => {
      const cron = (await import("@/lib/platform/cron" as string).catch((e) => { console.log(`  (import cron ล้ม: ${e instanceof Error ? e.message.slice(0, 200) : String(e)})`); return null; })) as { runDailyCron: (n?: Date) => Promise<Record<string, number>> } | null;
      if (!cron) { chk("RT-4.0", "import @/lib/platform/cron ได้", false, "import ได้", "import ไม่ได้"); return; }

      const LEGACY = ["subsExpired", "proposalsExpired", "outboxDrained", "tenantsPurged", "weeklyReports", "lotsExpiring", "webhooksRetried", "periodsClosed", "onboardingDripped", "dnaReviews", "proactiveNudges"];
      seed();
      const res = await cron.runDailyCron(NOW);
      chk("RT-4.1", "runDailyCron มี chatPurged + field เดิมครบ 11 ตัว", typeof res.chatPurged === "number" && LEGACY.every((k) => typeof res[k] === "number"), "chatPurged + field เดิมครบ", j(res));
      chk("RT-4.2", "cron กวาดจริง (chatPurged = 3 ตามข้อมูลที่หมดอายุ)", res.chatPurged === 3, "3", String(res.chatPurged));

      // 🔴 purge พัง → ต้องไม่ล้มทั้งรอบ
      seed();
      boom = "chatSetting.findMany";
      // 🔴 ต้องไม่ throw — ถ้า runDailyCron ระเบิด แปลว่างานย่อยตัวเดียวล้ม cron ทั้งรอบ
      const res2 = await cron.runDailyCron(NOW).catch((e: unknown) => ({ __threw: e instanceof Error ? e.message.slice(0, 120) : String(e) }) as unknown as Record<string, number>);
      boom = null;
      chk("RT-4.3", "🔴 purge พัง → cron ไม่ล้มทั้งก้อน (chatPurged = -1 · field เดิมยังครบ)", res2.chatPurged === -1 && LEGACY.every((k) => typeof res2[k] === "number"), "chatPurged -1 + field เดิมครบ (ไม่ throw)", j(res2));

      // หน้าตั้งค่า
      chk("RT-4.4", "หน้า channels มีช่องตั้ง retentionDays พร้อมบังคับช่วง 90–730", /name="retentionDays"/.test(UI) && /RETENTION_MIN_DAYS/.test(UI) && /RETENTION_MAX_DAYS/.test(UI) && /setRetentionDaysAction/.test(UI), "input retentionDays + min/max จากค่าคงที่ 90/730", j({ input: /name="retentionDays"/.test(UI), min: /RETENTION_MIN_DAYS/.test(UI), action: /setRetentionDaysAction/.test(UI) }), "MAJOR");
      chk("RT-4.5", "ค่าคงที่ช่วงตรงกับสคีมา (90–730)", ret.RETENTION_MIN_DAYS === 90 && ret.RETENTION_MAX_DAYS === 730, "90 / 730", j([ret.RETENTION_MIN_DAYS, ret.RETENTION_MAX_DAYS]), "MAJOR");
      const actionBlock = ACTIONS.slice(ACTIONS.indexOf("export async function setRetentionDaysAction"));
      chk("RT-4.6", "🔴 action ตรวจสิทธิ์ด้วย assertChatCan ก่อนบันทึก (แบบเดียวกับ action อื่น)", /export async function setRetentionDaysAction/.test(ACTIONS) && /assertChatCan\(auth, "chat\.setting\./.test(actionBlock.slice(0, 400)), "มี assertChatCan ใน setRetentionDaysAction", actionBlock.slice(0, 220).replace(/\s+/g, " "));

      // setter: clamp + ไม่ข้ามร้าน
      seed();
      const okv = await ret.setRetentionDays("T1", "S1", "1");
      chk("RT-4.7", "setRetentionDays บีบค่าเข้าช่วง (ส่ง 1 → เก็บ 90) — ฟอร์มโกงได้ เซิร์ฟเวอร์ต้องกัน", okv === 90 && tables.chatSetting![0]!.retentionDays === 90, "90", j({ okv, row: tables.chatSetting![0]!.retentionDays }));
      const setWheres = seen("chatSetting.updateMany").map((c) => (c.args.where ?? {}) as Row);
      chk("RT-4.8", "🔴 setter ผูก tenantId ใน where (รู้ systemId ของร้านอื่นก็แก้ค่าเขาไม่ได้)", setWheres.length > 0 && setWheres.every((w) => w.tenantId === "T1" && w.systemId === "S1"), "where {tenantId,systemId}", j(setWheres));
      seed();
      const cross = await ret.setRetentionDays("T1", "S2", 100); // S2 เป็นของ T2
      chk("RT-4.9", "🔴 ตั้งค่าข้ามร้าน → ไม่แตะอะไรเลย (คืน null · ค่าเดิมของอีกร้านคงอยู่)", cross === null && tables.chatSetting![1]!.retentionDays === 730, "null · ค่าเดิม 730", j({ cross, v: tables.chatSetting![1]!.retentionDays }));
    });

    // ───────── RT-5: ลบไฟล์จริงบน storage (WO-CV9 · ปิดหนี้ PDPA) ─────────
    //
    // 🔴 ทำไมต้องมีหมวดนี้ (fail-before): RT-1.7 พิสูจน์แค่ว่า `url` ในฐานข้อมูลถูกล้าง
    //    ซึ่ง **เขียวได้เต็ม ๆ ทั้งที่ไฟล์จริงยังเสิร์ฟอยู่บน CDN ตลอดกาล** — ใครถือ url เก่าก็ยังเปิดได้
    //    หมวดนี้ผูกไว้กับ "มีการเรียกตัวลบจริงด้วย url ของแถวที่หมดอายุ" ⇒ ถอดโค้ดลบออกเมื่อไหร่ RT-5.1 แดงทันที
    const OLD_URL = "https://cdn.shark/t/T1/chat/abc123.jpg";
    const NEW_URL = "https://cdn.shark/t/T1/chat/def456.pdf";
    const T2_URL = "https://cdn.shark/t/T2/chat/ghi789.pdf";
    await section("RT-5", "\nRT-5 🔴 ไฟล์จริงบน storage ต้องถูกลบ ไม่ใช่แค่ล้างฟิลด์:", async () => {
      // (ก) เรียกตัวลบจริงด้วย url ของแถวที่หมดอายุ
      seed();
      const del: { url: string; tenantId?: string }[] = [];
      await ret.purgeExpiredChatMessages({ now: NOW }, { deleteFile: async (u, o) => { del.push({ url: u, tenantId: o?.tenantId }); return { ok: true }; } });
      chk("RT-5.1", "🔴 fail-before: ต้องเรียกตัวลบไฟล์ด้วย url ของไฟล์แนบที่หมดอายุ (ไม่เรียก = ไฟล์ยังเปิดได้ตลอดกาล)", del.filter((d) => d.url === OLD_URL).length === 1, `เรียก 1 ครั้งด้วย ${OLD_URL}`, j(del));
      chk("RT-5.2", "🔴 positive control: ไฟล์ของข้อความที่ยังไม่หมดอายุห้ามถูกลบ", !del.some((d) => d.url === NEW_URL), "ไม่เรียกด้วย url ของ at-new", j(del.map((d) => d.url)));
      chk("RT-5.3", "🔴 positive control ข้ามร้าน: ไฟล์ของร้านที่ยังไม่ถึงกำหนด (retention 730) ห้ามถูกลบ", !del.some((d) => d.url === T2_URL), "ไม่เรียกด้วย url ของ at-t2", j(del.map((d) => d.url)));
      chk("RT-5.4", "ส่ง tenantId ไปด้วย (OpsEvent ตอนลบไม่สำเร็จต้องรู้ว่าเป็นของร้านไหน)", del.length > 0 && del.every((d) => d.tenantId === "T1"), "tenantId T1 ทุกครั้ง", j(del), "MAJOR");
      chk("RT-5.5", "ล้างฟิลด์ควบคู่กันเหมือนเดิม (ลบไฟล์ไม่ได้มาแทนการ redact)", att("at-old").url === "" && att("at-old").storageKey === "t/T1/chat/abc123.jpg", 'url "" · storageKey เดิม', j({ u: att("at-old").url, k: att("at-old").storageKey }));

      // (ข) ไฟล์ที่หลายแถวชี้ร่วมกัน — ห้ามลบ (ไม่งั้นฟองของเธรดที่ยังไม่หมดอายุพังไปด้วย)
      seed();
      tables.chatAttachment!.find((a) => a.id === "at-new")!.url = OLD_URL; // at-new (ยังไม่หมดอายุ) ใช้ไฟล์เดียวกับ at-old
      const del2: string[] = [];
      await ret.purgeExpiredChatMessages({ now: NOW }, { deleteFile: async (u) => { del2.push(u); return { ok: true }; } });
      chk("RT-5.6", "🔴 ไฟล์ที่แถวอื่น (ยังไม่หมดอายุ) ใช้ร่วมอยู่ ต้องไม่ถูกลบ — แถวที่เหลือจะลบเองตอนมันหมดอายุ", !del2.includes(OLD_URL), "ไม่ลบ", j(del2));
      chk("RT-5.7", "แต่ฟิลด์ของแถวที่หมดอายุยังต้องถูกล้าง (แชร์ไฟล์ ≠ ยกเว้นการ redact)", att("at-old").url === "" && att("at-new").url === OLD_URL, 'at-old ว่าง · at-new คงเดิม', j({ o: att("at-old").url, n: att("at-new").url }));

      // (ค) ตัวลบระเบิด/ล้มเหลว → การล้างฟิลด์ต้องเกิดอยู่ดี (ความเป็นส่วนตัวใน DB ห้ามขึ้นกับ CDN)
      seed();
      const r3 = await ret.purgeExpiredChatMessages({ now: NOW }, { deleteFile: async () => { throw new Error("[fake] CDN ล่ม"); } }).catch((e) => ({ __threw: String(e) }) as never);
      chk("RT-5.8", "🔴 ตัวลบไฟล์ระเบิด → purge ต้องไม่ล้ม และฟิลด์ยังถูกล้างครบ", (r3 as { purged?: number }).purged === 3 && att("at-old").url === "" && msg("m-old-1").body === null, "purged 3 · url ว่าง · body null", j({ r3, u: att("at-old").url, b: msg("m-old-1").body }));
      seed();
      await ret.purgeExpiredChatMessages({ now: NOW }, { deleteFile: async () => ({ ok: false, reason: "HTTP 500" }) });
      chk("RT-5.9", "ลบไม่สำเร็จ (ok:false) → ยัง redact ต่อ · storageKey เก็บไว้ตามเก็บทีหลังได้", att("at-old").url === "" && att("at-old").storageKey === "t/T1/chat/abc123.jpg", 'url "" · storageKey เดิม', j({ u: att("at-old").url, k: att("at-old").storageKey }));

      // (ง) ไม่มี env storage → ห้ามยิงเน็ตเลยสักครั้ง (เส้นทางจริงของ CI/dev)
      seed();
      const netBefore = netCalls;
      await ret.purgeExpiredChatMessages({ now: NOW });
      chk("RT-5.10", "🔴 ไม่ฉีด deps + ไม่มี env storage → ไม่ยิง HTTP ออกเลย (ปิดอย่างสุภาพ ไม่ใช่พยายามแล้วพัง)", netCalls === netBefore && att("at-old").url === "", "net เท่าเดิม · ยัง redact", `net +${netCalls - netBefore}`);

      // (จ) ตัวลบใน storage/service.ts ต้องมีจริงและถือ 404 = สำเร็จ (รันซ้ำได้)
      const st = (await import("@/lib/storage/service" as string).catch(() => null)) as { deleteStoredFile?: (u: string, o?: unknown, d?: unknown) => Promise<{ ok: boolean; reason?: string }>; storagePathFromCdnUrl?: (u: string) => string | null } | null;
      if (!st?.deleteStoredFile) { chk("RT-5.11", "storage/service.ts export deleteStoredFile()", false, "มีฟังก์ชัน", "ไม่มี"); return; }
      process.env.SHARK_BUNNY_CDN = "https://cdn.shark";
      const seenPaths: string[] = [];
      const okDel = await st.deleteStoredFile(OLD_URL, { tenantId: "T1" }, { del: async (p: string) => { seenPaths.push(p); return 200; } });
      const gone = await st.deleteStoredFile(OLD_URL, { tenantId: "T1" }, { del: async () => 404 });
      const bad = await st.deleteStoredFile("https://someone-else.example.com/a.jpg", { tenantId: "T1" }, { del: async (p: string) => { seenPaths.push(p); return 200; } });
      delete process.env.SHARK_BUNNY_CDN;
      chk("RT-5.11", "🔴 cdnUrl → path บน storage ถูกต้อง (ส่วนหลัง SHARK_BUNNY_CDN/)", okDel.ok === true && seenPaths[0] === "t/T1/chat/abc123.jpg", "t/T1/chat/abc123.jpg", j({ okDel, seenPaths }));
      chk("RT-5.12", "🔴 404 = สำเร็จ (ไฟล์หายไปแล้วคือปลายทางที่ต้องการ ⇒ รันซ้ำไม่แดง)", gone.ok === true, "ok true", j(gone));
      chk("RT-5.13", "🔴 url ที่ไม่ได้อยู่บน CDN ของเรา (ไฟล์ของ provider อื่น) ต้องไม่ถูกยิงลบ", bad.ok === false && seenPaths.length === 1, "ไม่เรียก del · ok false", j({ bad, seenPaths }));
    });
  }

  chk("RT-9.9", "ไม่มี query หลุดออก DB จริง (fake prisma รับทุกครั้ง · ไม่มี HTTP ออก)", process.env.DATABASE_URL === "postgresql://qc:qc@127.0.0.1:1/qc-no-db" && netCalls === 0, "DATABASE_URL ถูกทับ · net 0", `${String(process.env.DATABASE_URL).slice(0, 30)} · net ${netCalls}`, "MINOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT RETENTION (WO-C12 · PDPA) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

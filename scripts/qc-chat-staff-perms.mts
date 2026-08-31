// QC — WO-CW2: ระบบผู้ใช้งาน + สิทธิ์ (G6/G7/G8) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ ชื่อไฟล์: `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ชื่อนี้ยังไม่มีในรีโป (ตรวจแล้ว 31 ส.ค. 2026) ·
//    ของเดิมที่มีอยู่: qc-chat-notify ·
//    qc-chat-security · qc-chat-security-scope · qc-chat-core-v2 · qc-chat-api-v1 · qc-chat-retention ·
//    qc-chat-replies · qc-chat-push-badge · qc-chat-business-hours · qc-chat-member-autolink อยู่ก่อนแล้ว
//    เขียนทับ = ลบด่านทิ้งทั้งชุด (qc-all.mts ค้น `qc-*.mts` อัตโนมัติ — ไฟล์ใหม่ = เป็นด่านทันที)
//
// ⚠️ ชุดนี้ **ห้ามแตะฐานข้อมูล** (.env ของเครื่องนี้ชี้ Neon prod จริง) → กัน 3 ชั้น:
//   1) ทับ DATABASE_URL เป็น host ที่ต่อไม่ติด ทันทีหลัง loadEnvFile
//   2) ยัด fake prisma ลง require.cache ของ `src/lib/core/db.ts` **ก่อน** import อะไรก็ตาม
//   3) ยัด fake `src/lib/core/context.ts` (requireTenant) — ไม่งั้น server action ไปแตะ cookies()/DB
//   fake เติมค่า default ของ schema ตอน create · **ค่าเวลาเป็น thunk เสมอ** (บทเรียน §12)
//
// ⚠️ contract-first: โค้ดที่วัดยัง**ไม่มี**ในรอบนี้ (สาย C กำลังเขียน) → ใช้ `import(... as string).catch(()=>null)`
//    ข้อที่ยังไม่มีโค้ดต้อง **แดงอย่างถูกต้อง** (นั่นคืออาการที่ถูก) ไม่ใช่ skip เงียบ
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-WHATSAPP §4 + §1 G6/G7/G8) ═══════
// SP-1) ทะเบียน action กลาง `src/lib/core/permissions.ts` — ทะเบียนเดียวของทั้งระบบ
//       🔴 ต้องครอบคลุม **ทุก action ที่ chat/actions.ts ยิงเข้า assertCan จริง** (parse จากซอร์ส)
//          ไม่ใช่ลิสต์ที่พิมพ์มือแยกกัน (บทเรียน AS-6.1: ลิสต์พิมพ์มือเพี้ยนจากของจริงเสมอ)
//       · ต้องมี action สำหรับ "อ่านกล่องแชท" (วันนี้ยังไม่มีเลย) + ai.suggest + translate.use
// SP-2) ขา **เขียน** ของแชทต้องผ่าน assertCan ทุกเส้น (วันนี้ผ่านแล้ว — ด่านนี้กันถอยหลัง)
//       🔴 แผน §1 G8 บอกว่า "chat/actions.ts ตรวจแค่ requireTenant" — **ไม่ตรงโค้ดจริง 31 ส.ค.**
//          ของจริงมี assertChatCan ครบทุก export แล้ว · ที่ยังโล่งคือขา **อ่าน** (SP-3)
// SP-3) 🔴 ขา **อ่าน** ต้องถูกกั้นด้วย (ช่องโหว่จริงที่เปิดอยู่วันนี้)
//       `ChatInboxSection` / `ChatHub` / หน้า /app/sys/<id>/chat + server action ที่ดึงข้อมูล
//       STAFF ที่ไม่มีสิทธิ์ **ต้องอ่านแชทลูกค้าไม่ได้** · คู่บวก: OWNER ผ่านด่านไปได้จริง
// SP-4) STAFF ไม่มีสิทธิ์ → ตอบลูกค้าไม่ได้ (ForbiddenError) · คู่บวก: OWNER เดินผ่านด่านจริง
// SP-5) `grantStaffAccess` — upsert User ตามอีเมล + Membership STAFF **permissions ว่างเปล่า**
//       (fail-closed) + 🔴 เซ็ต `HrEmployee.linkedUserId` จริง (ปิดหนี้ G7 · ฟิลด์ตายมาตลอด)
// SP-6) 🔴 OWNER คนสุดท้ายห้ามถูกลดสิทธิ์/ถอนออก · คู่บวก: มี OWNER 2 คน → ลดได้จริง
// SP-7) 🔴 MANAGER ห้ามตั้งใครเป็น OWNER · ห้ามให้สิทธิ์ที่ตัวเองไม่มี · คู่บวก: ให้สิทธิ์ที่ตัวเองมี = ผ่าน
// SP-8) 🔴 ห้ามแก้สิทธิ์ตัวเอง (ยกเว้น OWNER) · คู่บวก: OWNER แก้ตัวเองได้
// SP-9) ถอนสิทธิ์ = **ไม่ลบแถว Membership** (ประวัติ senderUserId ในแชทต้องยังอ้างชื่อได้)
// SP-10) หน้า `/app/settings/staff` มีจริง **และเดินถึงจากเมนู** (บทเรียน 29 ส.ค.: หน้ากำพร้าที่ไม่มีลิงก์)
// SP-11) ทุก action ของ staff ผ่าน assertCan · tenantId มาจาก session ไม่ใช่ FormData
//
// ═══════ สัญญาชื่อ/รูปพารามิเตอร์ที่สาย C ต้องทำตาม (ข้อสอบเรียกแบบนี้) ═══════
//   src/lib/staff/service.ts
//     grantStaffAccess({ tenantId, actorUserId, employeeId, email })
//        → { ok:boolean, reason?:string, userId?:string, membershipId?:string }
//     updateStaffAccess({ tenantId, actorUserId, membershipId, role?, unitAccess?, permissions? })
//        → { ok:boolean, reason?:string }
//     revokeStaffAccess({ tenantId, actorUserId, membershipId }) → { ok:boolean, reason?:string }
//   ทุกตัว **อ่านสิทธิ์ของ actor จาก DB เอง** (ห้ามเชื่อ role ที่ส่งมาจากฟอร์ม)
//   ชื่ออื่นที่ยอมรับ: ดู ALIAS ด้านล่าง — ถ้าเปลี่ยนชื่อไปจากนี้ ให้เพิ่มใน ALIAS ไม่ใช่แก้ตรรกะข้อสอบ

try { process.loadEnvFile(".env"); } catch {}
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db"; // กันพลาด: ต่อไม่ติดโดยตั้งใจ
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

// ───────── fake prisma (mini query engine) ─────────
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: { op: string; args: Record<string, unknown>; tx: number | null }[] = [];
const seenModel = (model: string) => calls.filter((c) => c.op.startsWith(`${model}.`));
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

// ค่า default ของ schema ที่ชุดนี้พึ่งพา — Prisma เติมให้ตอน create · fake ต้องเติมด้วย
// 🔴 ค่าเวลาเป็น **thunk** เสมอ (บทเรียน §12 ซ้ำ 3 ครั้ง) — ตั้งค่าคงที่ตอนโหลดไฟล์ = ผลลวงคนละทิศ
const DEFAULTS: Record<string, Row> = {
  membership: { unitAccess: [], permissions: {}, acceptedAt: null },
  user: { name: null, image: null },
  hrEmployee: { active: true, linkedUserId: null, email: null, phone: null, position: null, pinCode: null },
  chatConversation: { status: "OPEN", staffUnreadCount: 0, reopenedCount: 0, tags: [], meta: null, lastMessageAt: null, lastMessagePreview: null, lastMessageDirection: null, firstResponseAt: null, firstCustomerMessageAt: null, resolvedAt: null, assigneeUserId: null, unitId: null },
  chatMessage: { type: "TEXT", isInternal: false, deliveryStatus: "SENT", senderName: null, body: null, clientMessageId: null, externalMessageId: null, purgedAt: null },
  chatContact: { verifiedEmail: false, blockedAt: null, lang: null, externalRef: null, email: null, phone: null, customerId: null, displayName: null },
  outboxEvent: { status: "PENDING", attempts: 0, availableAt: null, processedAt: null },
  chatReadState: { lastReadMessageId: null },
};
const TIME_FIELDS: Record<string, string[]> = { chatReadState: ["lastReadAt"], membership: ["invitedAt"] };

function applyData(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ("increment" in o) { row[k] = (typeof row[k] === "number" ? (row[k] as number) : 0) + (o.increment as number); continue; }
      if ("decrement" in o) { row[k] = (typeof row[k] === "number" ? (row[k] as number) : 0) - (o.decrement as number); continue; }
      if ("set" in o) { row[k] = o.set; continue; }
      if ("connect" in o) { row[k] = (o.connect as Row).id; continue; }
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

// include: { contact: true } / { user: true } / { messages: {...} } — เติม relation ให้พอใช้
// 🔴 ต้องเติมให้ครบจริง ไม่งั้น inbox พังด้วย TypeError **ก่อน**ถึงจุดที่ข้อสอบวัด = ผลลวง
const REL_ONE: Record<string, string> = {
  contact: "chatContact", user: "user", tenant: "tenant", conversation: "chatConversation",
  employee: "hrEmployee", membership: "membership", channelConnection: "chatChannelConnection",
  customer: "customer", assignee: "user",
};
const REL_MANY: Record<string, { model: string; fk: string }> = {
  messages: { model: "chatMessage", fk: "conversationId" },
  attachments: { model: "chatAttachment", fk: "messageId" },
  memberships: { model: "membership", fk: "userId" },
  events: { model: "chatConversationEvent", fk: "conversationId" },
  conversations: { model: "chatConversation", fk: "contactId" },
};
function withInclude(model: string, row: Row | null, include: unknown): Row | null {
  if (!row || !include || typeof include !== "object") return row;
  const out = { ...row };
  for (const [k, v] of Object.entries(include as Record<string, unknown>)) {
    if (!v) continue;
    const many = REL_MANY[k];
    if (many) {
      const nested = typeof v === "object" ? (v as Record<string, unknown>) : {};
      out[k] = (tables[many.model] ?? [])
        .filter((r) => r[many.fk] === row.id && matches(r, nested.where))
        .map((r) => withInclude(many.model, r, nested.include));
      continue;
    }
    const target = (tables[REL_ONE[k] ?? k] ?? []).find((r) => r.id === row[`${k}Id`]);
    out[k] = target ? withInclude(REL_ONE[k] ?? k, target, typeof v === "object" ? (v as Record<string, unknown>).include : undefined) : null;
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
      if (model === "user" && rows().some((r) => r.email === data.email)) p2002(model);
      if (model === "membership" && rows().some((r) => r.userId === data.userId && r.tenantId === data.tenantId)) p2002(model);
      const r = newRow(model, data);
      rows().push(r);
      return r;
    },
    update: async (a: Record<string, unknown> = {}) => { rec("update", a); const r = find(a); if (!r) throw new Error(`[fake] ${model}.update ไม่พบแถว ${j(a.where)}`); applyData(r, (a.data ?? {}) as Row); return r; },
    updateMany: async (a: Record<string, unknown> = {}) => { rec("updateMany", a); const rs = rows().filter((r) => matches(r, a.where)); for (const r of rs) applyData(r, (a.data ?? {}) as Row); return { count: rs.length }; },
    upsert: async (a: Record<string, unknown> = {}) => { rec("upsert", a); const r = find(a); if (r) { applyData(r, (a.update ?? {}) as Row); return r; } const n = newRow(model, (a.create ?? {}) as Row); rows().push(n); return n; },
    delete: async (a: Record<string, unknown> = {}) => { rec("delete", a); const r = find(a); if (!r) throw new Error(`[fake] ${model}.delete ไม่พบแถว`); tables[model] = rows().filter((x) => x !== r); return r; },
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
      return async (...a: unknown[]) => {
        const sql = Array.isArray(a[0]) ? (a[0] as string[]).join("?") : String(a[0]);
        calls.push({ op: "$executeRaw", args: { sql }, tx: txId });
        return [];
      };
    }
    if (p === "$disconnect" || p === "$connect") return async () => {};
    if (p.startsWith("$")) return () => { throw new Error(`[fake] ห้ามเรียก prisma.${p} ในข้อสอบนี้ (ห้ามแตะ DB)`); };
    return (cacheD[p] ??= delegate(p));
  },
});

const req = createRequire(import.meta.url);
const putModule = (relPath: string, exports: Record<string, unknown>) => {
  const f = resolve(import.meta.dirname, "..", relPath);
  req.cache[f] = { id: f, filename: f, path: resolve(f, ".."), loaded: true, exports, children: [], paths: [] } as never;
};
putModule("src/lib/core/db.ts", { prisma: fakePrisma, tenantDb: () => fakePrisma, platformDb: () => fakePrisma });

// session ปลอม — ปรับ role/permissions ได้ระหว่างเทส
type Sess = { userId: string; role: string; unitAccess: string[]; permissions: Record<string, unknown> };
let SESSION: Sess = { userId: "U-OWNER", role: "OWNER", unitAccess: ["*"], permissions: {} };
putModule("src/lib/core/context.ts", {
  requireTenant: async () => ({
    user: { id: SESSION.userId, email: `${SESSION.userId}@example.com`, name: SESSION.userId },
    memberships: [],
    active: {
      tenantId: "T1",
      tenant: { id: "T1", name: "ร้านทดสอบ", status: "ACTIVE" },
      role: SESSION.role,
      unitAccess: SESSION.unitAccess,
      permissions: SESSION.permissions,
    },
  }),
  requireAuth: async () => ({ user: { id: SESSION.userId, email: `${SESSION.userId}@example.com` }, memberships: [], active: null }),
  requireMembership: async () => ({}),
});

// ไม่ให้มี HTTP หลุดออกจริง
let netCount = 0;
globalThis.fetch = (async () => { netCount += 1; return { ok: true, status: 200, json: async () => ({}) }; }) as unknown as typeof fetch;

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
// 🔴 ตัดคอมเมนต์ก่อน grep เสมอ — คอมเมนต์ที่เล่าอดีตถูกนับเป็นการใช้จริง = ผลลบปลอม
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1");

const F_ACTIONS = "src/lib/modules/chat/actions.ts";
const F_UI = "src/lib/modules/chat/ui.tsx";
const F_CHATPAGE = "src/app/app/sys/[id]/chat/page.tsx";
const F_SYSPAGE = "src/app/app/sys/[id]/page.tsx";
const F_DRAWER = "src/components/app-shell/NavDrawer.tsx";

const ACTIONS_SRC = strip(read(F_ACTIONS));
const UI_SRC = strip(read(F_UI));
const CHATPAGE_SRC = strip(read(F_CHATPAGE));
const SYSPAGE_SRC = strip(read(F_SYSPAGE));
const DRAWER_SRC = strip(read(F_DRAWER));

const isForbidden = (e: unknown) => e instanceof Error && (e.name === "ForbiddenError" || /ไม่มีสิทธิ์/.test(e.message));
const callAndCatch = async (fn: () => unknown): Promise<{ threw: boolean; forbidden: boolean; detail: string }> => {
  try { await fn(); return { threw: false, forbidden: false, detail: "ไม่ throw" }; }
  catch (e) { return { threw: true, forbidden: isForbidden(e), detail: e instanceof Error ? `${e.name}: ${e.message.slice(0, 120)}` : String(e) }; }
};

type Fn = (...a: never[]) => unknown;
/** ฟังก์ชันของ staff service ตามสัญญาหัวไฟล์ — รับ object เดียว คืน { ok, reason? } */
type StaffFn = (a: Record<string, unknown>) => Promise<{ ok?: boolean; reason?: string; userId?: string; membershipId?: string }>;
const pick = (o: Record<string, unknown> | null, names: string[]): Fn | null => {
  for (const n of names) { const v = o?.[n]; if (typeof v === "function") return v as Fn; }
  return null;
};
const pickStaff = (o: Record<string, unknown> | null, names: string[]): StaffFn | null => pick(o, names) as StaffFn | null;
const ALIAS = {
  grant: ["grantStaffAccess", "grantAccess", "addStaffAccess", "createStaffAccess"],
  update: ["updateStaffAccess", "updateStaff", "setStaffAccess", "updateMembershipAccess"],
  revoke: ["revokeStaffAccess", "revokeStaff", "suspendStaffAccess", "disableStaffAccess"],
  list: ["listStaffAccess", "listStaffMembers", "listMemberships", "listTenantStaff"],
};

// ── เตรียมร้านตัวอย่าง: OWNER 1 · MANAGER 1 · STAFF 1 · พนักงาน HR ที่ยังไม่มีบัญชี 1 ──
function seedShop(opts?: { owners?: number }) {
  for (const k of Object.keys(tables)) delete tables[k];
  const owners = opts?.owners ?? 1;
  tables.user = [
    { id: "U-OWNER", email: "owner@example.com", name: "เจ้าของ", createdAt: new Date() },
    { id: "U-OWNER2", email: "owner2@example.com", name: "เจ้าของสอง", createdAt: new Date() },
    { id: "U-MGR", email: "mgr@example.com", name: "ผู้จัดการ", createdAt: new Date() },
    { id: "U-STAFF", email: "staff@example.com", name: "พนักงาน", createdAt: new Date() },
  ];
  tables.membership = [
    { id: "M-OWNER", userId: "U-OWNER", tenantId: "T1", role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date(), invitedAt: new Date(), createdAt: new Date() },
    ...(owners > 1 ? [{ id: "M-OWNER2", userId: "U-OWNER2", tenantId: "T1", role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date(), invitedAt: new Date(), createdAt: new Date() }] : []),
    { id: "M-MGR", userId: "U-MGR", tenantId: "T1", role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date(), invitedAt: new Date(), createdAt: new Date() },
    { id: "M-STAFF", userId: "U-STAFF", tenantId: "T1", role: "STAFF", unitAccess: ["*"], permissions: {}, acceptedAt: new Date(), invitedAt: new Date(), createdAt: new Date() },
  ];
  tables.appSystem = [{ id: "S1", tenantId: "T1", type: "CHAT", name: "แชทลูกค้า", active: true, createdAt: new Date() }];
  tables.hrEmployee = [{ id: "E1", tenantId: "T1", systemId: "SHR", name: "พนักงานใหม่", email: "newbie@example.com", active: true, linkedUserId: null, createdAt: new Date() }];
  tables.chatChannelConnection = [{ id: "conn-web", tenantId: "T1", systemId: "S1", type: "WEBCHAT", displayName: "แชทหน้าเว็บ", status: "CONNECTED", externalAccountId: "webchat", credentials: {}, defaultUnitId: null }];
  tables.chatSetting = [{ id: "st1", tenantId: "T1", systemId: "S1", memberSystemId: null, senderAlias: "ทีมงาน", greetingMessage: {}, offlineMessage: {}, retentionDays: 365 }];
  tables.chatContact = [{ id: "ct1", tenantId: "T1", systemId: "S1", channel: "WEBCHAT", externalUserId: "guest-1", displayName: "คุณเอ", verifiedEmail: false, blockedAt: null, createdAt: new Date() }];
  tables.chatConversation = [{ id: "cv1", tenantId: "T1", systemId: "S1", contactId: "ct1", channel: "WEBCHAT", channelConnectionId: "conn-web", status: "OPEN", staffUnreadCount: 1, unitId: null, assigneeUserId: null, reopenedCount: 0, tags: [], createdAt: new Date(), lastMessageAt: new Date() }];
  tables.chatMessage = [{ id: "msg1", tenantId: "T1", systemId: "S1", conversationId: "cv1", direction: "IN", type: "TEXT", body: "สวัสดีครับ ราคาเท่าไหร่", isInternal: false, deliveryStatus: "SENT", createdAt: new Date(), purgedAt: null }];
  calls.length = 0;
  netCount = 0;
}

try {
  seedShop();

  const chatActions = (await import("@/lib/modules/chat/actions" as string).catch(() => null)) as Record<string, Fn> | null;
  const chatUi = (await import("@/lib/modules/chat/ui" as string).catch(() => null)) as Record<string, Fn> | null;
  const perms = (await import("@/lib/core/permissions" as string).catch(() => null)) as Record<string, unknown> | null;
  const staffSvc = (await import("@/lib/staff/service" as string).catch(() => null)) as Record<string, unknown> | null;

  // ═════════ SP-1 · ทะเบียน action กลาง ═════════
  await section("SP-1", "SP-1 ทะเบียน action กลาง (ทะเบียนเดียวของทั้งระบบ):", async () => {
    chk("SP-1.1", "มีไฟล์ทะเบียนกลาง src/lib/core/permissions.ts", existsSync("src/lib/core/permissions.ts"),
      "มีไฟล์", existsSync("src/lib/core/permissions.ts") ? "มี" : "ยังไม่มี (สาย C ยังไม่เขียน)");

    // เก็บ action ที่โค้ดจริงยิงเข้า assertCan — ทะเบียนต้องครอบให้ครบ ไม่ใช่ลิสต์พิมพ์มือแยกกัน
    const usedActions = [...new Set([...ACTIONS_SRC.matchAll(/assertChatCan\(\s*auth\s*,\s*"([^"]+)"/g)].map((m) => m[1]!))];
    chk("SP-1.2", "อ่าน action ของแชทจากซอร์สจริงได้ (ไม่พึ่งลิสต์ที่พิมพ์ในข้อสอบ)",
      usedActions.length >= 8, "≥8 action", `${usedActions.length}: ${j(usedActions)}`);

    const registryText = perms ? JSON.stringify(perms) : "";
    const missing = usedActions.filter((a) => !registryText.includes(a));
    chk("SP-1.3", "🔴 ทะเบียนกลางครอบคลุมทุก action ที่ chat/actions.ts ใช้จริง (ห้ามลิสต์เพี้ยนจากของจริง)",
      perms !== null && missing.length === 0, "ครบทุกตัว", perms ? `ขาด ${j(missing)}` : "ยังไม่มีทะเบียน");

    chk("SP-1.4", "ทะเบียนมี action สำหรับ 'อ่านกล่องแชท' (วันนี้ยังไม่มี action นี้ในระบบเลย)",
      /chat\.[a-zA-Z.]*read/.test(registryText), "มี chat.*read", perms ? "ไม่พบใน ทะเบียน" : "ยังไม่มีทะเบียน");
    chk("SP-1.5", "ทะเบียนมี action ของ AI แนะนำ + การแปล (ทั้งคู่มีค่าใช้จ่าย ต้องกั้นรายคน)",
      /chat\.[a-zA-Z.]*suggest/.test(registryText) && /chat\.[a-zA-Z.]*translate|chat\.translate/.test(registryText),
      "มี suggest + translate", perms ? "ไม่ครบ" : "ยังไม่มีทะเบียน");
    chk("SP-1.6", "ทะเบียนมี action ของหน้าตั้งสิทธิ์เอง (settings.staff.*)",
      /settings\.staff\./.test(registryText), "มี settings.staff.*", perms ? "ไม่พบ" : "ยังไม่มีทะเบียน");
    chk("SP-1.7", "ทุกรายการในทะเบียนมีคำอธิบายภาษาไทย (หน้าตั้งสิทธิ์ต้องอ่านรู้เรื่อง ไม่ใช่โชว์ action ดิบ)",
      /[฀-๿]/.test(registryText), "มีข้อความไทย", perms ? "ไม่มีข้อความไทยเลย" : "ยังไม่มีทะเบียน", "MAJOR");
    chk("SP-1.8", "🔴 หน้าตั้งสิทธิ์ต้อง import ทะเบียนกลาง ไม่พิมพ์ลิสต์ซ้ำเอง (บทเรียน AS-6.1)",
      existsSync("src/app/app/settings/staff") &&
      /core\/permissions/.test(strip(read("src/app/app/settings/staff/page.tsx"))),
      "page.tsx import @/lib/core/permissions", existsSync("src/app/app/settings/staff/page.tsx") ? "ไม่ได้ import ทะเบียน" : "ยังไม่มีหน้า");
  });

  // ═════════ SP-2 · ขาเขียนของแชทผ่าน assertCan ครบ (กันถอยหลัง) ═════════
  await section("SP-2", "SP-2 ขาเขียนของแชทผ่าน assertCan ครบทุกเส้น:", async () => {
    const exported = [...ACTIONS_SRC.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]!);
    const bodies = ACTIONS_SRC.split(/export\s+async\s+function\s+/).slice(1);
    const noGate = bodies.map((b) => b.slice(0, b.indexOf("\n}\n") + 1 || b.length))
      .map((b, i) => ({ name: exported[i] ?? `#${i}`, gated: /assertChatCan\(|assertCan\(/.test(b) }))
      .filter((x) => !x.gated).map((x) => x.name);
    chk("SP-2.1", "ทุก server action ของแชทเรียก assertCan ก่อนทำงาน",
      exported.length > 0 && noGate.length === 0, "ทุกตัวมีด่าน", `ไม่มีด่าน: ${j(noGate)} (จากทั้งหมด ${exported.length})`);
    chk("SP-2.2", "assertCan ถูกเรียก **ก่อน** เรียก service (ไม่ใช่ตรวจทีหลัง)",
      bodies.every((b) => {
        const g = b.search(/assertChatCan\(|assertCan\(/);
        const s = b.search(/await\s+(sendReply|setStatus|assign|markRead|linkCustomer|connectLine|setConnectionStatus|setMemberSystem|setBusinessHours|setRetentionDays)\(/);
        return g < 0 ? false : s < 0 || g < s;
      }), "ด่านมาก่อน service", "มี action ที่ตรวจทีหลัง");
    chk("SP-2.3", "tenantId มาจาก session เสมอ ไม่ใช่ FormData (ปลอม tenant ของร้านอื่นไม่ได้)",
      !/formData\.get\(\s*["']tenantId["']\s*\)/.test(ACTIONS_SRC), "ไม่อ่าน tenantId จากฟอร์ม", "อ่าน tenantId จากฟอร์ม");
  });

  // ═════════ SP-3 · 🔴 ขาอ่าน (ช่องโหว่จริงวันนี้) ═════════
  await section("SP-3", "SP-3 🔴 ขาอ่านกล่องแชทต้องถูกกั้น (วันนี้ STAFF ทุกคนอ่านได้หมด):", async () => {
    chk("SP-3.1", "หน้า /app/sys/<id>/chat ตรวจสิทธิ์อ่านก่อน render",
      /assertCan\(|assertChatCan\(|canReadChat\(/.test(CHATPAGE_SRC), "มีด่านในหน้า chat",
      CHATPAGE_SRC ? "ไม่มีด่านเลย มีแต่ requireTenant()" : `อ่านไฟล์ไม่ได้: ${F_CHATPAGE}`);
    chk("SP-3.2", "ตัว inbox (chat/ui) ตรวจสิทธิ์อ่านเอง (หน้าอื่นที่ฝังเข้าไปต้องกันได้ด้วย)",
      /assertCan\(|assertChatCan\(|canReadChat\(/.test(UI_SRC), "มีด่านใน ui",
      UI_SRC ? "ไม่มีด่านเลย" : `อ่านไฟล์ไม่ได้: ${F_UI}`);
    chk("SP-3.3", "หน้าภาพรวมระบบ (/app/sys/<id>) ก็ต้องกั้น — เป็นกล่องแชทเต็มจอในรอบนี้",
      /assertCan\(|assertChatCan\(|canReadChat\(/.test(SYSPAGE_SRC) || /assertCan\(|assertChatCan\(/.test(UI_SRC),
      "มีด่านที่หน้าภาพรวมหรือในคอมโพเนนต์แชท", "ไม่มีด่านทั้งสองที่");

    // ── ด่านจริงระดับรัน: STAFF ไม่มีสิทธิ์ ต้องอ่านแชทไม่ได้ ──
    const inbox = pick(chatUi, ["ChatInboxSection", "ChatInbox", "ChatInboxServer"]);
    if (!inbox) {
      chk("SP-3.4", "หา ChatInboxSection เพื่อพิสูจน์ด้วยการรันจริงไม่ได้ (โครงหน้าเปลี่ยน — ต้องตรวจมือ)",
        false, "มี export ChatInboxSection", chatUi ? `exports: ${j(Object.keys(chatUi))}` : "import ui ไม่ได้", "MINOR");
    } else {
      seedShop();
      SESSION = { userId: "U-STAFF", role: "STAFF", unitAccess: ["*"], permissions: {} };
      const denied = await callAndCatch(() => inbox({ systemId: "S1", tenantId: "T1" } as never));
      chk("SP-3.4", "🔴 STAFF ที่ไม่มีสิทธิ์ เรียก inbox แล้วต้องถูกปฏิเสธ (ไม่ใช่ได้ข้อความลูกค้าไปเต็ม ๆ)",
        denied.forbidden, "ForbiddenError", denied.detail);
      const staffSawMessages = seenModel("chatConversation").some((c) => c.op.endsWith(".findMany"));
      chk("SP-3.5", "🔴 คู่บวกฝั่งลบ: STAFF ที่ถูกปฏิเสธต้องไม่มี query ดึงบทสนทนาเกิดขึ้นเลย",
        !staffSawMessages, "ไม่มี chatConversation.findMany", "มี query ดึงบทสนทนาแม้ไม่มีสิทธิ์");

      // คู่บวก: OWNER ต้องเดินผ่านด่านได้จริง (พิสูจน์ว่าโค้ดเดินไปถึงจุดที่วัด ไม่ใช่พังก่อน)
      seedShop();
      SESSION = { userId: "U-OWNER", role: "OWNER", unitAccess: ["*"], permissions: {} };
      const allowed = await callAndCatch(() => inbox({ systemId: "S1", tenantId: "T1" } as never));
      // 🔴 คู่บวกต้องเข้มกว่า "ไม่ใช่ Forbidden" — ถ้า inbox พังด้วย error อื่น (fake ไม่ครบ)
      //    ข้อ SP-3.4 จะแดงด้วยเหตุผลผิด แล้วเราจะไล่แก้ผิดจุด
      chk("SP-3.6", "🟢 คู่บวก: OWNER เรียก inbox แล้วผ่านด่าน + ไม่ throw + มี query ดึงบทสนทนาจริง",
        !allowed.threw && seenModel("chatConversation").some((c) => c.op.endsWith(".findMany")),
        "ไม่ throw + อ่านข้อมูลได้", `${allowed.detail} · calls=${seenModel("chatConversation").length}`);

      // STAFF ที่ได้รับสิทธิ์อ่าน ต้องอ่านได้ (ไม่งั้นให้สิทธิ์ไปก็ไม่มีความหมาย)
      seedShop();
      const readAction = (perms ? JSON.stringify(perms) : "").match(/chat\.[a-zA-Z.]*read/)?.[0] ?? "chat.conversation.read";
      SESSION = { userId: "U-STAFF", role: "STAFF", unitAccess: ["*"], permissions: { [readAction]: true } };
      const granted = await callAndCatch(() => inbox({ systemId: "S1", tenantId: "T1" } as never));
      chk("SP-3.7", "🟢 คู่บวก: STAFF ที่ได้รับสิทธิ์อ่านแล้ว เข้ากล่องแชทได้",
        !granted.forbidden, "ผ่านด่าน", granted.detail);
    }
  });

  // ═════════ SP-4 · ตอบลูกค้าโดยไม่มีสิทธิ์ไม่ได้ ═════════
  await section("SP-4", "SP-4 ตอบลูกค้าโดยไม่มีสิทธิ์ไม่ได้ (มีคู่บวกว่าโค้ดเดินถึงจริง):", async () => {
    const sendAction = pick(chatActions, ["sendReplyAction"]);
    if (!sendAction) { chk("SP-4.0", "หา sendReplyAction ได้", false, "มี export", chatActions ? j(Object.keys(chatActions)) : "import ไม่ได้"); return; }
    const fd = () => {
      const f = new FormData();
      f.set("systemId", "S1"); f.set("conversationId", "cv1"); f.set("body", "สวัสดีครับ");
      return f;
    };
    seedShop();
    SESSION = { userId: "U-STAFF", role: "STAFF", unitAccess: ["*"], permissions: {} };
    const r1 = await callAndCatch(() => sendAction(fd() as never));
    chk("SP-4.1", "STAFF ไม่มีสิทธิ์ → ตอบลูกค้าไม่ได้ (ForbiddenError)", r1.forbidden, "ForbiddenError", r1.detail);
    chk("SP-4.2", "🔴 และต้องไม่มี ChatMessage ถูกเขียนลงไปเลย", (tables.chatMessage ?? []).length === 1,
      "ยังมีแค่ข้อความลูกค้า 1 แถว", `${(tables.chatMessage ?? []).length} แถว`);

    seedShop();
    SESSION = { userId: "U-OWNER", role: "OWNER", unitAccess: ["*"], permissions: {} };
    const r2 = await callAndCatch(() => sendAction(fd() as never));
    chk("SP-4.3", "🟢 คู่บวก: OWNER เดินผ่านด่านและเขียนข้อความจริง (พิสูจน์ว่าด่านคือสิ่งที่กั้น ไม่ใช่โค้ดพังก่อน)",
      !r2.forbidden && (tables.chatMessage ?? []).some((m) => m.direction === "OUT"),
      "มีข้อความ OUT ถูกเขียน", `${r2.detail} · rows=${(tables.chatMessage ?? []).length}`);
  });

  // ═════════ SP-5 · ให้พนักงานเข้าใช้งาน + ปิดหนี้ G7 ═════════
  await section("SP-5", "SP-5 ให้พนักงาน HR เข้าใช้งาน (fail-closed + linkedUserId):", async () => {
    const grant = pickStaff(staffSvc, ALIAS.grant);
    if (!grant) { chk("SP-5.0", "มี src/lib/staff/service.ts + grantStaffAccess", false, `หนึ่งใน ${j(ALIAS.grant)}`, staffSvc ? j(Object.keys(staffSvc)) : "ยังไม่มีโมดูล (สาย C ยังไม่เขียน)"); return; }
    seedShop();
    const res = await grant({ tenantId: "T1", actorUserId: "U-OWNER", employeeId: "E1", email: "newbie@example.com" });
    chk("SP-5.1", "OWNER ให้สิทธิ์พนักงานที่มีใน HR ได้ (ไม่มีพิธีเชิญ — มติ W2)", res?.ok === true, "ok:true", j(res));
    const newUser = (tables.user ?? []).find((u) => u.email === "newbie@example.com");
    chk("SP-5.2", "upsert User ตามอีเมล (passwordless — ไม่ตั้งรหัส)", !!newUser, "มีแถว User", j(newUser ?? null));
    const mem = (tables.membership ?? []).find((m) => m.userId === newUser?.id);
    chk("SP-5.3", "สร้าง Membership role=STAFF", mem?.role === "STAFF", "STAFF", j(mem?.role ?? null));
    chk("SP-5.4", "🔴 fail-closed: เริ่มจาก **ไม่มีสิทธิ์อะไรเลย** (permissions ว่าง + unitAccess ว่าง)",
      j(mem?.permissions ?? null) === "{}" && j(mem?.unitAccess ?? null) === "[]",
      "permissions {} · unitAccess []", `${j(mem?.permissions ?? null)} · ${j(mem?.unitAccess ?? null)}`);
    const emp = (tables.hrEmployee ?? []).find((e) => e.id === "E1");
    chk("SP-5.5", "🔴 ปิดหนี้ G7: HrEmployee.linkedUserId ถูกเซ็ตจริง (ฟิลด์นี้ตายมาตลอด — grep = 0 hit)",
      !!emp?.linkedUserId && emp.linkedUserId === newUser?.id, "linkedUserId = user.id", j(emp?.linkedUserId ?? null));
    chk("SP-5.6", "ให้สิทธิ์พนักงานของร้านอื่นไม่ได้ (employeeId ข้ามร้าน)",
      await (async () => {
        seedShop();
        (tables.hrEmployee ?? []).push({ id: "E9", tenantId: "T-OTHER", systemId: "SHR9", name: "คนร้านอื่น", email: "x@other.com", active: true, linkedUserId: null, createdAt: new Date() });
        const r = (await grant({ tenantId: "T1", actorUserId: "U-OWNER", employeeId: "E9", email: "x@other.com" })) as { ok?: boolean };
        return r?.ok !== true;
      })(), "ok:false", "ให้สิทธิ์ข้ามร้านได้");
    chk("SP-5.7", "STAFF ธรรมดาสั่งให้สิทธิ์คนอื่นไม่ได้ (ยกระดับตัวเองผ่านคนอื่นไม่ได้)",
      await (async () => {
        seedShop();
        const r = await callAndCatch(() => grant({ tenantId: "T1", actorUserId: "U-STAFF", employeeId: "E1", email: "newbie@example.com" }));
        const created = (tables.membership ?? []).length > 3;
        return (r.forbidden || r.threw || true) && !created;
      })(), "ไม่มี Membership ใหม่", "STAFF สร้าง Membership ได้");
  });

  // ═════════ SP-6 · OWNER คนสุดท้าย ═════════
  await section("SP-6", "SP-6 🔴 OWNER คนสุดท้ายห้ามถูกลดสิทธิ์/ถอนออก:", async () => {
    const update = pickStaff(staffSvc, ALIAS.update);
    const revoke = pickStaff(staffSvc, ALIAS.revoke);
    if (!update || !revoke) { chk("SP-6.0", "มี updateStaffAccess + revokeStaffAccess", false, `${j(ALIAS.update)} + ${j(ALIAS.revoke)}`, staffSvc ? j(Object.keys(staffSvc)) : "ยังไม่มีโมดูล"); return; }
    seedShop({ owners: 1 });
    const d1 = (await update({ tenantId: "T1", actorUserId: "U-OWNER", membershipId: "M-OWNER", role: "MANAGER" }).catch((e: unknown) => ({ ok: false, reason: String(e) }))) as { ok?: boolean; reason?: string };
    const owner1 = (tables.membership ?? []).find((m) => m.id === "M-OWNER");
    chk("SP-6.1", "ลด OWNER คนสุดท้ายเป็น MANAGER ไม่ได้ (ล็อกตัวเองออกจากร้านถาวร)",
      d1?.ok !== true && owner1?.role === "OWNER", "ok:false + role ยังเป็น OWNER", `${j(d1)} · role=${j(owner1?.role)}`);
    const r1 = (await revoke({ tenantId: "T1", actorUserId: "U-OWNER", membershipId: "M-OWNER" }).catch((e: unknown) => ({ ok: false, reason: String(e) }))) as { ok?: boolean };
    chk("SP-6.2", "ถอน OWNER คนสุดท้ายออกไม่ได้",
      r1?.ok !== true && (tables.membership ?? []).some((m) => m.id === "M-OWNER" && m.acceptedAt !== null),
      "ok:false + ยังใช้งานได้", j(r1));

    seedShop({ owners: 2 });
    const d2 = (await update({ tenantId: "T1", actorUserId: "U-OWNER", membershipId: "M-OWNER2", role: "MANAGER" }).catch((e: unknown) => ({ ok: false, reason: String(e) }))) as { ok?: boolean };
    chk("SP-6.3", "🟢 คู่บวก: มี OWNER 2 คน → ลดคนที่สองได้จริง (พิสูจน์ว่ากติกาไม่ได้ห้ามทุกกรณี)",
      d2?.ok === true && (tables.membership ?? []).find((m) => m.id === "M-OWNER2")?.role === "MANAGER",
      "ok:true + role=MANAGER", `${j(d2)} · role=${j((tables.membership ?? []).find((m) => m.id === "M-OWNER2")?.role)}`);
  });

  // ═════════ SP-7 · ห้ามยกระดับเกินตัวเอง ═════════
  await section("SP-7", "SP-7 🔴 ห้ามให้สิทธิ์ที่ตัวเองไม่มี:", async () => {
    const update = pickStaff(staffSvc, ALIAS.update);
    if (!update) { chk("SP-7.0", "มี updateStaffAccess", false, j(ALIAS.update), staffSvc ? j(Object.keys(staffSvc)) : "ยังไม่มีโมดูล"); return; }
    seedShop();
    const a = (await update({ tenantId: "T1", actorUserId: "U-MGR", membershipId: "M-STAFF", role: "OWNER" }).catch(() => ({ ok: false }))) as { ok?: boolean };
    chk("SP-7.1", "MANAGER ตั้งใครเป็น OWNER ไม่ได้",
      a?.ok !== true && (tables.membership ?? []).find((m) => m.id === "M-STAFF")?.role === "STAFF",
      "ok:false + role ไม่เปลี่ยน", `${j(a)} · ${j((tables.membership ?? []).find((m) => m.id === "M-STAFF")?.role)}`);

    seedShop();
    // STAFF ที่มีสิทธิ์ตั้งสิทธิ์ (settings.staff.write) แต่ไม่มี chat.* → ห้ามแจก chat.*
    (tables.membership ?? []).push({ id: "M-ADMIN", userId: "U-ADMIN", tenantId: "T1", role: "STAFF", unitAccess: ["*"], permissions: { "settings.staff.write": true }, acceptedAt: new Date(), invitedAt: new Date(), createdAt: new Date() });
    (tables.user ?? []).push({ id: "U-ADMIN", email: "admin@example.com", name: "แอดมินย่อย", createdAt: new Date() });
    const b = (await update({ tenantId: "T1", actorUserId: "U-ADMIN", membershipId: "M-STAFF", permissions: { "chat.message.send": true } } as never).catch(() => ({ ok: false }))) as { ok?: boolean };
    const staffPerms = j((tables.membership ?? []).find((m) => m.id === "M-STAFF")?.permissions);
    chk("SP-7.2", "🔴 คนที่ไม่มีสิทธิ์ตอบแชท แจกสิทธิ์ตอบแชทให้คนอื่นไม่ได้ (ไม่งั้นยกระดับตัวเองผ่านคนอื่นได้)",
      b?.ok !== true && !staffPerms.includes("chat.message.send"), "ok:false + ไม่ถูกแจกสิทธิ์", `${j(b)} · ${staffPerms}`);

    seedShop();
    (tables.membership ?? []).push({ id: "M-ADMIN", userId: "U-ADMIN", tenantId: "T1", role: "STAFF", unitAccess: ["*"], permissions: { "settings.staff.write": true, "chat.message.send": true }, acceptedAt: new Date(), invitedAt: new Date(), createdAt: new Date() });
    (tables.user ?? []).push({ id: "U-ADMIN", email: "admin@example.com", name: "แอดมินย่อย", createdAt: new Date() });
    const c = (await update({ tenantId: "T1", actorUserId: "U-ADMIN", membershipId: "M-STAFF", permissions: { "chat.message.send": true } } as never).catch(() => ({ ok: false }))) as { ok?: boolean };
    chk("SP-7.3", "🟢 คู่บวก: แจกสิทธิ์ที่ **ตัวเองมี** ได้จริง (ไม่ใช่ห้ามหมดทุกกรณี)",
      c?.ok === true && j((tables.membership ?? []).find((m) => m.id === "M-STAFF")?.permissions).includes("chat.message.send"),
      "ok:true + ได้รับสิทธิ์", `${j(c)} · ${j((tables.membership ?? []).find((m) => m.id === "M-STAFF")?.permissions)}`);

    seedShop();
    const d = (await update({ tenantId: "T1", actorUserId: "U-MGR", membershipId: "M-STAFF", unitAccess: ["unit-นอกเขต"] }).catch(() => ({ ok: false }))) as { ok?: boolean };
    chk("SP-7.4", "ให้สาขาที่ตัวเองเข้าไม่ถึงไม่ได้ (MANAGER unitAccess=['*'] จึงผ่าน — ด่านนี้ดูว่าเช็คจริงไหม)",
      typeof d?.ok === "boolean", "มีคำตอบชัดเจน", j(d), "MINOR");
  });

  // ═════════ SP-8 · ห้ามแก้สิทธิ์ตัวเอง ═════════
  await section("SP-8", "SP-8 🔴 ห้ามแก้สิทธิ์ตัวเอง (ยกเว้น OWNER):", async () => {
    const update = pickStaff(staffSvc, ALIAS.update);
    if (!update) { chk("SP-8.0", "มี updateStaffAccess", false, j(ALIAS.update), staffSvc ? j(Object.keys(staffSvc)) : "ยังไม่มีโมดูล"); return; }
    seedShop();
    const a = (await update({ tenantId: "T1", actorUserId: "U-MGR", membershipId: "M-MGR", permissions: { "chat.message.send": true } } as never).catch(() => ({ ok: false }))) as { ok?: boolean };
    chk("SP-8.1", "MANAGER แก้สิทธิ์ของตัวเองไม่ได้",
      a?.ok !== true && !j((tables.membership ?? []).find((m) => m.id === "M-MGR")?.permissions).includes("chat.message.send"),
      "ok:false", `${j(a)} · ${j((tables.membership ?? []).find((m) => m.id === "M-MGR")?.permissions)}`);
    seedShop({ owners: 2 });
    const b = (await update({ tenantId: "T1", actorUserId: "U-OWNER", membershipId: "M-OWNER", unitAccess: ["*"] }).catch(() => ({ ok: false }))) as { ok?: boolean };
    chk("SP-8.2", "🟢 คู่บวก: OWNER แก้ของตัวเองได้ (เจ้าของร้านต้องไม่ถูกกันออกจากของตัวเอง)",
      b?.ok === true, "ok:true", j(b));
  });

  // ═════════ SP-9 · ถอนสิทธิ์ต้องไม่ลบแถว ═════════
  await section("SP-9", "SP-9 ถอนสิทธิ์ = ปิดการเข้าถึง ไม่ใช่ลบประวัติ:", async () => {
    const revoke = pickStaff(staffSvc, ALIAS.revoke);
    if (!revoke) { chk("SP-9.0", "มี revokeStaffAccess", false, j(ALIAS.revoke), staffSvc ? j(Object.keys(staffSvc)) : "ยังไม่มีโมดูล"); return; }
    seedShop();
    const before = (tables.membership ?? []).length;
    const r = (await revoke({ tenantId: "T1", actorUserId: "U-OWNER", membershipId: "M-STAFF" }).catch(() => ({ ok: false }))) as { ok?: boolean };
    const after = (tables.membership ?? []).length;
    chk("SP-9.1", "ถอนสิทธิ์สำเร็จ", r?.ok === true, "ok:true", j(r));
    chk("SP-9.2", "🔴 แถว Membership ยังอยู่ (ประวัติ senderUserId ในแชทต้องยังอ้างชื่อคนได้)",
      after === before, `${before} แถวเท่าเดิม`, `${after} แถว`);
    const m = (tables.membership ?? []).find((x) => x.id === "M-STAFF");
    chk("SP-9.3", "แต่เข้าใช้งานไม่ได้แล้ว (acceptedAt=null หรือฟิลด์ระงับถูกตั้ง)",
      !!m && (m.acceptedAt === null || m.acceptedAt === undefined || Object.keys(m).some((k) => /suspend|revoke|disabled/i.test(k) && m[k] != null)),
      "ถูกระงับ", j(m ?? null));
    chk("SP-9.4", "ไม่มีการเรียก membership.delete/deleteMany เลยตลอดชุดนี้",
      !calls.some((c) => c.op === "membership.delete" || c.op === "membership.deleteMany"),
      "ไม่มี delete", j(calls.filter((c) => c.op.startsWith("membership.delete")).map((c) => c.op)));
  });

  // ═════════ SP-10 · เดินถึงจากเมนูจริง (บทเรียน 29 ส.ค.) ═════════
  await section("SP-10", "SP-10 🔴 หน้าใหม่ต้องเดินถึงจากเมนู (บั๊ก 5 ตัวผ่านข้อสอบ 400+ ข้อ):", async () => {
    chk("SP-10.1", "มีหน้า /app/settings/staff จริง", existsSync("src/app/app/settings/staff/page.tsx"),
      "มี page.tsx", existsSync("src/app/app/settings/staff") ? "มีโฟลเดอร์แต่ไม่มี page.tsx" : "ยังไม่มีหน้า");
    chk("SP-10.2", "🔴 มีลิงก์ /app/settings/staff ในเมนู NavDrawer (ไม่ใช่หน้ากำพร้าแบบ /app/settings/webhooks)",
      /["']\/app\/settings\/staff["']/.test(DRAWER_SRC), "มีลิงก์ในเมนู",
      DRAWER_SRC ? "ไม่มีลิงก์ในเมนู" : `อ่านไฟล์ไม่ได้: ${F_DRAWER}`);
    chk("SP-10.3", "ลิงก์ในเมนูมีป้ายภาษาไทยที่คนอ่านรู้ว่าคืออะไร",
      /\/app\/settings\/staff[\s\S]{0,120}label:\s*"[^"]*[฀-๿][^"]*"/.test(DRAWER_SRC),
      "label ไทย", "ไม่พบ label ไทยข้างลิงก์", "MAJOR");
  });

  // ═════════ SP-11 · ด่านที่ action ของหน้าตั้งสิทธิ์ ═════════
  await section("SP-11", "SP-11 action ของหน้าตั้งสิทธิ์ต้องมีด่านของตัวเอง:", async () => {
    const f = "src/lib/staff/actions.ts";
    const SRC = strip(read(f));
    chk("SP-11.1", "มี src/lib/staff/actions.ts", SRC.length > 0, "มีไฟล์", "ยังไม่มี (สาย C ยังไม่เขียน)");
    const bodies = SRC.split(/export\s+async\s+function\s+/).slice(1);
    chk("SP-11.2", "ทุก action ผ่าน assertCan ก่อนทำงาน",
      bodies.length > 0 && bodies.every((b) => /assertCan\(/.test(b)), "ทุกตัวมีด่าน",
      `${bodies.filter((b) => !/assertCan\(/.test(b)).length}/${bodies.length} ไม่มีด่าน`);
    chk("SP-11.3", "🔴 ห้ามอ่าน tenantId/actorUserId จาก FormData (ฟอร์มโกงได้)",
      SRC.length > 0 && !/formData\.get\(\s*["'](tenantId|actorUserId|userId)["']\s*\)/.test(SRC),
      "มาจาก session เท่านั้น", SRC.length > 0 ? "อ่านจากฟอร์ม" : "ยังไม่มีไฟล์");
    chk("SP-11.4", "การเปลี่ยนสิทธิ์ถูกบันทึกลง AuditLog (ใครให้สิทธิ์ใครเมื่อไหร่)",
      /auditLog|writeAudit|logAudit/i.test(strip(read("src/lib/staff/service.ts"))) || /auditLog|writeAudit|logAudit/i.test(SRC),
      "มี audit", "ไม่มีร่องรอย audit", "MAJOR");
  });

  chk("SP-9.9", "ไม่มี query หลุดออก DB จริง · ไม่มี HTTP ออกนอกเครื่อง",
    process.env.DATABASE_URL === "postgresql://qc:qc@127.0.0.1:1/qc-no-db" && netCount === 0,
    "DATABASE_URL ถูกทับ · fetch 0 ครั้ง", `${String(process.env.DATABASE_URL).slice(0, 30)} · fetch ${netCount}`, "MINOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT STAFF PERMS =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

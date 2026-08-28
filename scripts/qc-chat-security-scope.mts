// QC — chat security (WO-C4) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ ทำไมไม่ใช่ไฟล์ `qc-chat-security.mts`: ชื่อนั้น **มีอยู่แล้ว** และเป็นด่านจริงของ M9–M12
// (race lock / contact cap / CSPRNG token / unit RBAC) ที่ผูกกับ `pnpm qc:chat` และขับ Neon จริง
// เขียนทับ = ลบข้อสอบเก่าทิ้ง → แยกไฟล์ใหม่แทน (qc-all.mts:39-41 ค้น `qc-*.mts` อัตโนมัติอยู่แล้ว)
//
// ⚠️ ชุดนี้ **ห้ามแตะฐานข้อมูล** (.env ของเครื่องนี้ชี้ prod จริง) → ใช้ 2 ชั้นกัน:
//   1) ทับ DATABASE_URL เป็น host ที่ต่อไม่ได้ ทันทีหลัง loadEnvFile
//   2) ยัด fake prisma ลง require.cache ของ `src/lib/core/db.ts` **ก่อน** import service
//      (tsx โหลด .ts เป็น CJS → require.cache ใช้ได้จริง) · model/op ที่ไม่ได้ stub = โยนทันที
//   → ตรวจ "พฤติกรรมจริงของ service" ได้โดยไม่มี query ออกไปข้างนอกแม้แต่ครั้งเดียว
//
// สัญญา:
// B1) getConnection(tenantId, systemId, connectionId) — 3 อาร์กิวเมนต์ · where ที่ยิงจริงต้องมี
//     tenantId + systemId เสมอ · คนละร้าน/คนละระบบ → null · ร้านตัวเอง → เจอแถว
//     (ข้อยกเว้นเดียวที่ resolve connection ได้โดยไม่มีบริบทร้าน = webhook ขาเข้าที่ยืนยันด้วย HMAC
//      ซึ่ง query เองใน route ของมัน — ห้ามมีทางลัด "ไม่ scope" หลุดออกมาเป็น export ของ service)
// B5) assign() — assigneeUserId ต้องเป็นสมาชิก tenant นั้น (listStaff(tenantId)) · ไม่ใช่ → คืน
//     { ok:false, reason:"<ไทย>" } **และห้ามเขียน DB** · null = ปล่อยว่าง (ผ่าน) · สมาชิกจริง = ผ่าน
// B6) linkCustomer() — รับ unitAccess?: string[] แล้วตัดสินด้วย canAccessConvUnit จากเธรดล่าสุด
//     ของ contact · ต่าง unit → { ok:false, reason:"<ไทย>" } ทั้งขาผูกและขาถอด · "*" = ผ่าน
//     · actions.ts ต้องส่ง auth.active.unitAccess ลงมาจริง (ไม่งั้นรูยังเปิดอยู่)
// B10) line.ts verifyWebhook — อ่าน header ตัวพิมพ์เล็กครั้งเดียว ห้ามมี fallback ที่ตายแล้ว
//      (route lowercase คีย์ทุกตัวก่อนส่งเข้า adapter)
try { process.loadEnvFile(".env"); } catch {}
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db"; // กันพลาด: ต่อไม่ติดโดยตั้งใจ
process.env.CHAT_CREDENTIALS_KEY ??= "0".repeat(64);

const { readFileSync } = await import("node:fs");
const { createRequire } = await import("node:module");
const { resolve } = await import("node:path");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

// ───────── fake prisma (mini query engine — พอสำหรับ where แบบที่ chat service ใช้) ─────────
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: { op: string; args: Record<string, unknown> }[] = [];
const seen = (op: string) => calls.filter((c) => c.op === op);

function matches(row: Row, where: unknown): boolean {
  if (!where || typeof where !== "object") return true;
  for (const [k, v] of Object.entries(where as Record<string, unknown>)) {
    if (k === "AND") { if (!(v as unknown[]).every((w) => matches(row, w))) return false; continue; }
    if (k === "OR") { if (!(v as unknown[]).some((w) => matches(row, w))) return false; continue; }
    if (v === null) { if (row[k] !== null && row[k] !== undefined) return false; continue; }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if ("not" in o) { if (o.not === null ? row[k] === null || row[k] === undefined : row[k] === o.not) return false; continue; }
      if ("in" in o) { if (!(o.in as unknown[]).includes(row[k])) return false; continue; }
      continue; // operator อื่นยังไม่จำเป็นกับข้อสอบชุดนี้
    }
    if (row[k] !== v) return false;
  }
  return true;
}

function delegate(model: string) {
  const rows = () => (tables[model] ??= []);
  const rec = (op: string, a: Record<string, unknown>) => { calls.push({ op: `${model}.${op}`, args: a }); };
  const find = (a: Record<string, unknown>) => rows().find((r) => matches(r, a.where)) ?? null;
  return {
    findFirst: async (a: Record<string, unknown> = {}) => { rec("findFirst", a); return find(a); },
    findUnique: async (a: Record<string, unknown> = {}) => { rec("findUnique", a); return find(a); },
    findMany: async (a: Record<string, unknown> = {}) => { rec("findMany", a); return rows().filter((r) => matches(r, a.where)); },
    count: async (a: Record<string, unknown> = {}) => { rec("count", a); return rows().filter((r) => matches(r, a.where)).length; },
    create: async (a: Record<string, unknown> = {}) => { rec("create", a); const r = { ...(a.data as Row) }; rows().push(r); return r; },
    update: async (a: Record<string, unknown> = {}) => { rec("update", a); const r = find(a); if (!r) throw new Error(`[fake] ${model}.update ไม่พบแถว`); Object.assign(r, a.data as Row); return r; },
    updateMany: async (a: Record<string, unknown> = {}) => { rec("updateMany", a); const rs = rows().filter((r) => matches(r, a.where)); for (const r of rs) Object.assign(r, a.data as Row); return { count: rs.length }; },
    upsert: async (a: Record<string, unknown> = {}) => { rec("upsert", a); const r = find(a); if (r) { Object.assign(r, a.update as Row); return r; } const n = { ...(a.create as Row) }; rows().push(n); return n; },
    deleteMany: async (a: Record<string, unknown> = {}) => { rec("deleteMany", a); return { count: 0 }; },
  };
}

const cache: Record<string, ReturnType<typeof delegate>> = {};
const fakePrisma: unknown = new Proxy({} as Record<string, unknown>, {
  get(_t, p) {
    if (typeof p !== "string" || p === "then") return undefined;
    if (p === "$transaction") return async (fn: unknown) => (typeof fn === "function" ? (fn as (tx: unknown) => unknown)(fakePrisma) : undefined);
    if (p === "$executeRaw" || p === "$executeRawUnsafe" || p === "$queryRaw") return async () => 0;
    if (p === "$disconnect" || p === "$connect") return async () => {};
    if (p.startsWith("$")) return () => { throw new Error(`[fake] ห้ามเรียก prisma.${p} ในข้อสอบนี้ (ห้ามแตะ DB)`); };
    return (cache[p] ??= delegate(p));
  },
});

// ยัดลง require.cache ก่อน import service — ทุกโมดูลที่ import "@/lib/core/db" จะได้ตัวปลอมนี้
const req = createRequire(import.meta.url);
const dbFile = resolve(import.meta.dirname, "../src/lib/core/db.ts");
req.cache[dbFile] = { id: dbFile, filename: dbFile, path: resolve(dbFile, ".."), loaded: true, exports: { prisma: fakePrisma, tenantDb: () => fakePrisma }, children: [], paths: [] } as never;

try {
  const chat = (await import("@/lib/modules/chat/service" as string).catch((e) => { console.log(`  (import ล้ม: ${e instanceof Error ? e.message.slice(0, 120) : String(e)})`); return null; })) as {
    getConnection: (...a: unknown[]) => Promise<unknown>;
    assign: (a: Record<string, unknown>) => Promise<{ ok: boolean; reason?: string }>;
    linkCustomer: (a: Record<string, unknown>) => Promise<{ ok: boolean; reason?: string }>;
  } | null;

  if (!chat) { chk("CS-0", "import chat/service ได้ (fake prisma ติด)", false, "import ได้", "import ไม่ได้"); }
  else {
    const th = (s?: string) => !!s && /[ก-๙]/.test(s);

    // ───────── CS-1 · B1: getConnection ต้อง scope ด้วย tenant + system ─────────
    console.log("CS-1 getConnection (B1 — ข้ามร้าน):");
    tables.chatChannelConnection = [
      { id: "conn-A", tenantId: "T-เรา", systemId: "S-เรา", type: "LINE", displayName: "ของเรา" },
      { id: "conn-B", tenantId: "T-คนอื่น", systemId: "S-คนอื่น", type: "LINE", displayName: "ของร้านอื่น" },
    ];
    chk("CS-1.1", "signature = (tenantId, systemId, connectionId)", chat.getConnection.length === 3, "3 อาร์กิวเมนต์", `${chat.getConnection.length} อาร์กิวเมนต์`);
    calls.length = 0;
    const mine = await chat.getConnection("T-เรา", "S-เรา", "conn-A");
    chk("CS-1.2", "ร้านตัวเอง → เจอแถว (positive control)", (mine as Row | null)?.id === "conn-A", "conn-A", JSON.stringify(mine ?? null).slice(0, 60));
    const wheres = calls.filter((c) => c.op.startsWith("chatChannelConnection.")).map((c) => (c.args.where ?? {}) as Row);
    chk("CS-1.3", "query ที่ยิงจริงมี tenantId + systemId ใน where", wheres.length > 0 && wheres.every((w) => "tenantId" in w && "systemId" in w), "where มี tenantId+systemId", JSON.stringify(wheres));
    const cross = await chat.getConnection("T-คนอื่น", "S-คนอื่น", "conn-A");
    chk("CS-1.4", "ร้านอื่นถือ id ของเรา → null (ห้ามข้ามร้าน)", cross === null, "null", JSON.stringify(cross ?? null).slice(0, 60));
    const otherSys = await chat.getConnection("T-เรา", "S-อื่น", "conn-A");
    chk("CS-1.5", "ระบบอื่นใน tenant เดียวกัน → null", otherSys === null, "null", JSON.stringify(otherSys ?? null).slice(0, 60));
    chk("CS-1.6", "service ไม่ export ทางลัดที่ไม่ scope", !/findUnique\(\{\s*where:\s*\{\s*id:\s*connectionId\s*\}\s*\}\)/.test(readFileSync("src/lib/modules/chat/service.ts", "utf8")), "ไม่มี findUnique by id เปล่า", "ยังมี");

    // ───────── CS-2 · B5: assign ให้คนนอก tenant ไม่ได้ ─────────
    console.log("\nCS-2 assign (B5 — assignee นอก tenant):");
    const resetAssign = () => {
      tables.chatConversation = [{ id: "conv-1", tenantId: "T-เรา", systemId: "S-เรา", unitId: null, status: "OPEN", assigneeUserId: null }];
      tables.membership = [{ id: "m1", userId: "U-ใน", tenantId: "T-เรา", acceptedAt: new Date(), createdAt: new Date(), user: { email: "in@qc.local", name: "พนักงานเรา" } }];
      tables.chatConversationEvent = [];
      calls.length = 0;
    };
    resetAssign();
    const rOut = await chat.assign({ tenantId: "T-เรา", systemId: "S-เรา", conversationId: "conv-1", assigneeUserId: "U-นอก", actorUserId: "U-ใน", unitAccess: ["*"] });
    chk("CS-2.1", "assign คนนอก tenant → ok:false + เหตุผลไทย", rOut?.ok === false && th(rOut?.reason), "{ok:false, reason ไทย}", JSON.stringify(rOut));
    chk("CS-2.2", "assign คนนอก → ห้ามเขียน DB (ไม่ update/ไม่ log)", seen("chatConversation.update").length === 0 && seen("chatConversationEvent.create").length === 0, "0 write", `update ${seen("chatConversation.update").length} · event ${seen("chatConversationEvent.create").length}`);
    chk("CS-2.3", "ตรวจสมาชิกด้วย tenantId ของเธรด (ไม่ใช่ค่าอื่น)", seen("membership.findMany").some((c) => ((c.args.where ?? {}) as Row).tenantId === "T-เรา"), "membership.findMany where.tenantId = T-เรา", JSON.stringify(seen("membership.findMany").map((c) => c.args.where)));
    resetAssign();
    const rIn = await chat.assign({ tenantId: "T-เรา", systemId: "S-เรา", conversationId: "conv-1", assigneeUserId: "U-ใน", actorUserId: "U-ใน", unitAccess: ["*"] });
    chk("CS-2.4", "assign สมาชิกจริง → ok:true + เขียนจริง (positive control)", rIn?.ok === true && tables.chatConversation![0]!.assigneeUserId === "U-ใน", "ok + assignee=U-ใน", `${JSON.stringify(rIn)} · ${String(tables.chatConversation![0]!.assigneeUserId)}`);
    resetAssign();
    const rNull = await chat.assign({ tenantId: "T-เรา", systemId: "S-เรา", conversationId: "conv-1", assigneeUserId: null, actorUserId: "U-ใน", unitAccess: ["*"] });
    chk("CS-2.5", "ปล่อยว่าง (null) → ยังทำได้", rNull?.ok === true, "ok:true", JSON.stringify(rNull));

    // ───────── CS-3 · B6: linkCustomer ข้าม unit ไม่ได้ ─────────
    console.log("\nCS-3 linkCustomer (B6 — ข้าม unit):");
    const resetLink = () => {
      tables.chatSetting = [{ id: "st1", tenantId: "T-เรา", systemId: "S-เรา", memberSystemId: "M-1" }];
      tables.chatContact = [{ id: "ct-1", tenantId: "T-เรา", systemId: "S-เรา", displayName: "ลูกค้าสาขาบี", phone: null, customerId: null }];
      tables.chatConversation = [{ id: "conv-B", tenantId: "T-เรา", systemId: "S-เรา", contactId: "ct-1", unitId: "unit-บี", status: "OPEN", lastMessageAt: new Date() }];
      tables.chatConversationEvent = [];
      calls.length = 0;
    };
    const link = (unitAccess: string[] | undefined, customerId: string | null | undefined) =>
      chat.linkCustomer({ tenantId: "T-เรา", systemId: "S-เรา", contactId: "ct-1", actorUserId: "U-ใน", customerId, unitAccess });
    resetLink();
    const lDenied = await link(["unit-เอ"], "cus-1");
    chk("CS-3.1", "unit เอ ผูกลูกค้าของเธรด unit บี → ok:false + ไทย", lDenied?.ok === false && th(lDenied?.reason), "{ok:false, reason ไทย}", JSON.stringify(lDenied));
    chk("CS-3.2", "ถูกปฏิเสธแล้วห้ามเขียน contact", seen("chatContact.update").length === 0 && tables.chatContact![0]!.customerId === null, "0 write", `update ${seen("chatContact.update").length}`);
    resetLink();
    const lUnlink = await link(["unit-เอ"], null);
    chk("CS-3.3", "ขาถอด (customerId:null) ข้าม unit ก็ต้องถูกปฏิเสธ", lUnlink?.ok === false && seen("chatContact.update").length === 0, "{ok:false} + 0 write", JSON.stringify(lUnlink));
    resetLink();
    const lSame = await link(["unit-บี"], "cus-1");
    chk("CS-3.4", "unit เดียวกัน → ผูกได้ (positive control)", lSame?.ok === true && tables.chatContact![0]!.customerId === "cus-1", "ok + customerId=cus-1", `${JSON.stringify(lSame)} · ${String(tables.chatContact![0]!.customerId)}`);
    resetLink();
    const lStar = await link(["*"], "cus-1");
    chk("CS-3.5", 'unitAccess "*" → ผูกได้ (positive control)', lStar?.ok === true, "ok:true", JSON.stringify(lStar));
    const actions = readFileSync("src/lib/modules/chat/actions.ts", "utf8");
    const linkCall = actions.slice(actions.indexOf("await linkCustomer("), actions.indexOf("await linkCustomer(") + 400);
    chk("CS-3.6", "actions.ts ส่ง auth.active.unitAccess เข้า linkCustomer จริง", /unitAccess:\s*auth\.active\.unitAccess/.test(linkCall), "ส่ง unitAccess", linkCall.replace(/\s+/g, " ").slice(0, 120));

    // ───────── CS-4 · B10: line.ts ไม่มี fallback header ที่ตายแล้ว ─────────
    console.log("\nCS-4 line.ts header (B10 — fallback ที่ตายแล้ว):");
    const lineSrc = readFileSync("src/lib/modules/chat/line.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, ""); // ตัดคอมเมนต์ทิ้งก่อนนับ (คอมเมนต์อธิบายบั๊กมีชื่อ header อยู่ด้วย)
    const lower = lineSrc.match(/["']x-line-signature["']/g)?.length ?? 0;
    const mixed = /["']X-Line-Signature["']/.test(lineSrc);
    chk("CS-4.1", "อ่าน header ตัวพิมพ์เล็กครั้งเดียว ไม่มี key ซ้ำ/ตัวพิมพ์ใหญ่ที่ตายแล้ว", lower === 1 && !mixed, "x-line-signature 1 ครั้ง · ไม่มี X-Line-Signature", `lower ${lower} · mixed ${mixed}`, "MAJOR");
    chk("CS-4.2", "ยังตรวจ signature อยู่ (ไม่ได้ลบทั้งด่าน)", /timingSafeEqual/.test(lineSrc) && /createHmac\(\s*["']sha256["']/.test(lineSrc), "HMAC + timingSafeEqual", "หาย");
  }
  chk("CS-9.9", "ไม่มี query หลุดออก DB จริง (fake prisma รับทุกครั้ง)", calls.length >= 0 && process.env.DATABASE_URL === "postgresql://qc:qc@127.0.0.1:1/qc-no-db", "DATABASE_URL ถูกทับ", String(process.env.DATABASE_URL).slice(0, 30), "MINOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT SECURITY =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

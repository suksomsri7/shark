// PROBE — SVC D.9 reviewer B (โจมตีด้วยหลายโพรเซส) · ไม่ใช่ข้อสอบ · ไม่แก้ src · ไม่ยิง LINE จริง (ตัวจำลอง 127.0.0.1 + LINE_API_BASE)
// รัน: cd /root/projects/shark-svc-l2 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d9-b.mts
// ข้อมูลใต้ร้าน `qc-svc-d9pb-*` + ผู้ใช้ `svc-d9pb-*@shark.local` · ถัง rate `dorm:portal:*:svc-d9b-*` · ล้างใน finally ทุกครั้ง
// หมวด: LK รหัสผูก · SD/SP/SV/SE/SC/SJ ส่งบิลแข่งสถานะ · ID/IP/IA รูปสลิปในแชท · PT พอร์ทัล 404/เวลา/จบกลางทาง · PS สลิปพอร์ทัล · RL rate limit · BZ 40P01/BUSY
/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { sqcPortalToken } from "./svc-qc-data.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "probe-d9-b";
const ORIGIN = "https://qc-d9b.invalid";
const F = {
  line: "src/lib/platform/dorm-line.ts",
  portal: "src/lib/platform/dorm-portal.ts",
  webhook: "src/app/api/chat/webhook/[connectionId]/route.ts",
  fileRoute: "src/app/(store)/d/[token]/f/[fileId]/route.ts",
  page: "src/app/(store)/d/[token]/page.tsx",
  actions: "src/app/(store)/d/[token]/actions.ts",
} as const;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x) ?? String(x); } catch { return String(x); } };
const revive = (_k: string, v: any) => (v && typeof v === "object" && typeof v.__date === "string" ? new Date(v.__date) : v);
const D = (iso: string) => ({ __date: iso });
const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngOf = (seed: string): Uint8Array => Uint8Array.from(Buffer.concat([Buffer.from(PNG_SIG), createHash("sha256").update(`pb-d9:${seed}`).digest(), createHash("sha256").update(seed).digest()]));
const noopDeps = { put: async () => {}, del: async () => 200 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
/** cuid v1: 'c' + เวลา ms (base36 8 ตัว) — เวลาที่โพรเซสผู้สร้างแถวอ้างสิทธิ์ */
const cuidTs = (id: unknown): number | null => {
  if (typeof id !== "string" || !/^c[a-z0-9]{20,}$/.test(id)) return null;
  const t = parseInt(id.slice(1, 9), 36);
  return Number.isFinite(t) && Math.abs(t - Date.now()) < 86_400_000 ? t : null;
};

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4
// ORACLE-EDIT (ผู้คุม 30 ต.ค. · W2/W3) — ตัวตรวจสลิป FAKE แบบ qc-svc-r0.6 (W3: แชทแนบอัตโนมัติเฉพาะเมื่อมีตัวตรวจ) · ลูกโพรเซสได้ env เดียวกัน
process.env.INTEGRATIONS_FAKE = "1";
if ((process.env.INTEGRATIONS_CREDENTIALS_KEY ?? "").length < 32) process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }

// ครอบ fetch (นอกเครื่อง = บล็อก) ทั้งแม่และลูก
{
  const REAL = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
    let host = "";
    try { host = new URL(url).hostname; } catch { /* */ }
    if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL(input, init);
    return new Response(JSON.stringify({ message: "blocked by probe" }), { status: 503, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

type Item = Record<string, any> & { op: string; dly?: number };
// ═══════════ โหมดลูก ═══════════
const CA = process.argv.indexOf("--child");
if (CA >= 0) {
  const job = JSON.parse(Buffer.from(process.argv[CA + 1] ?? "", "base64url").toString("utf8"), revive) as { items: Item[]; at: number; conc?: number };
  let out: unknown[] = [];
  try {
    const LN: any = await import(pathToFileURL(join(ROOT, F.line)).href);
    const PT: any = await import(pathToFileURL(join(ROOT, F.portal)).href);
    const PB: any = await import("@/lib/platform/postback-routes" as string);
    const ACC: any = await import("@/lib/modules/account" as string);
    const OC: any = await import("@/lib/outbox-consumers" as string);
    const { prisma } = (await import("@/lib/core/db" as string)) as any;
    let WH: any = null, FR: any = null;
    const runOne = async (x: Item): Promise<unknown> => {
      switch (x.op) {
        case "link": return PB.handleLinkCodeText(x.ctx, x.text);
        case "image": return LN.onLineImage(x.ctx, { messageId: x.messageId }, { deps: noopDeps });
        case "send": return LN.sendDormBill({ tenantId: x.tenantId }, { billId: x.billId }, x.now ? { now: new Date(x.now) } : undefined);
        case "consume": await OC.consumers["dorm.billrun.sent"](x.evt); return { ok: true };
        case "jobs": return LN.runDormLineJobs(new Date(x.now), { tenantId: x.tenantId });
        case "pay": return ACC.recordExternalPayment({ ...x.input, paidAt: new Date(x.input.paidAt) });
        case "db": return prisma[x.model][x.method](x.args);
        case "load": { const r = await PT.loadPortal(x.token, { bill: x.bill ?? null }, { clientKey: x.ck }); return x.full ? r : r === null ? null : { ok: true }; }
        case "receipt": return PT.loadPortalReceipt(x.token, { bill: x.bill }, { clientKey: x.ck });
        case "lease": return PT.loadPortalLease(x.token, { clientKey: x.ck });
        case "file": return PT.portalFileRef(x.token, x.fileId, { clientKey: x.ck });
        case "slip": return PT.submitPortalSlip(x.token, { billId: x.billId, file: { data: pngOf(x.seed), contentType: "image/png" }, idempotencyKey: x.key }, { clientKey: x.ck, deps: noopDeps });
        case "webhook": {
          WH ??= await import(pathToFileURL(join(ROOT, F.webhook)).href);
          const raw = J(x.body);
          const sig = createHmac("sha256", x.secret).update(raw, "utf8").digest("base64");
          const res: Response = await WH.POST(new Request(`http://127.0.0.1/api/chat/webhook/${x.connId}`, { method: "POST", body: raw, headers: { "content-type": "application/json", "x-line-signature": sig } }), { params: Promise.resolve({ connectionId: x.connId }) });
          return { status: res.status, text: await res.text() };
        }
        case "fileGet": {
          FR ??= await import(pathToFileURL(join(ROOT, F.fileRoute)).href);
          const res: Response = await FR.GET(new Request(`http://127.0.0.1/d/${x.token}/f/${x.fileId}`, { headers: x.headers ?? {} }), { params: Promise.resolve({ token: x.token, fileId: x.fileId }) });
          const h: Record<string, string> = {};
          res.headers.forEach((v, k) => { h[k] = v; });
          return { status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()).toString("base64") };
        }
        default: return { childFail: `op ${x.op}` };
      }
    };
    // อุ่นเครื่อง (ต่อฐาน · โหลดโมดูลเส้นที่ใช้) ก่อนจุดนัด — ไม่ให้ครั้งแรกเย็นบิดเวลา
    try { await prisma.$queryRawUnsafe("SELECT 1"); await PT.loadPortal("abc.def", { bill: null }, { clientKey: `svc-d9b-warm-${process.pid}` }); } catch { /* */ }
    const wait = job.at - Date.now();
    if (wait > 0) await sleep(wait);
    const exec = async (x: Item) => {
      if (x.dly && x.dly > 0) await sleep(x.dly);
      const t0 = Date.now();
      try { const r = await runOne(x); return { op: x.op, tag: x.tag, r, t0, t1: Date.now() }; }
      catch (e) { return { op: x.op, tag: x.tag, threw: errMsg(e), t0, t1: Date.now() }; }
    };
    const conc = job.conc && job.conc > 0 ? job.conc : job.items.length;
    const res: unknown[] = new Array(job.items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(conc, job.items.length) }, async () => { for (;;) { const i = next++; if (i >= job.items.length) return; res[i] = await exec(job.items[i]!); } }));
    out = res;
  } catch (e) { out = [{ childFail: errMsg(e) }]; }
  console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
  try { const { prisma } = (await import("@/lib/core/db" as string)) as any; await prisma.$disconnect(); } catch { /* */ }
  process.exit(0);
}

{
  const { appendFileSync } = await import("node:fs");
  const LOG = `/tmp/svc-d9b-probe.out.${process.pid}.log`;
  process.stdout.on("error", () => { /* */ });
  const orig = console.log.bind(console);
  console.log = (...a: unknown[]) => { try { appendFileSync(LOG, `${a.map((x) => (typeof x === "string" ? x : J(x))).join(" ")}\n`); } catch { /* */ } try { orig(...a); } catch { /* */ } };
  console.log(`(probe log: ${LOG} · start ${new Date().toISOString()})`);
}

// ═══════════ ตัวจำลอง LINE ═══════════
process.env.APP_URL = ORIGIN;
type FakeReq = { method: string; path: string; auth: string; json: any; t: number };
const FAKE: FakeReq[] = [];
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const path = (req.url ?? "").split("?")[0] ?? "";
    let json: any = null;
    if (String(req.headers["content-type"] ?? "").includes("json")) { try { json = JSON.parse(raw.toString("utf8")); } catch { json = null; } }
    FAKE.push({ method: req.method ?? "", path, auth: String(req.headers.authorization ?? ""), json, t: Date.now() });
    const send = (code: number, obj: unknown) => { if (res.writableEnded) return; res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    const content = /^\/v2\/bot\/message\/([^/]+)\/content$/.exec(path);
    if (req.method === "GET" && content) { res.writeHead(200, { "content-type": "image/png" }); return res.end(Buffer.from(pngOf(`line-${content[1]}`))); }
    if (req.method === "POST" && path === "/v2/bot/message/push") return send(200, { sentMessages: [{ id: `fm${FAKE.length}` }] });
    if (req.method === "POST" && path === "/v2/bot/message/reply") return send(200, { sentMessages: [{ id: `fr${FAKE.length}` }] });
    if (req.method === "GET" && path.startsWith("/v2/bot/profile/")) return send(200, { displayName: "ผู้เช่าโพรบ", userId: path.split("/").pop() });
    return send(200, {});
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
process.env.LINE_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const mark = () => FAKE.length;
const pushesTo = (ext: string, m: number) => FAKE.slice(m).filter((r) => r.method === "POST" && r.path === "/v2/bot/message/push" && r.json?.to === ext);
const billPushesTo = (ext: string, m: number) => pushesTo(ext, m).filter((r) => J(r.json).includes("บิลค่าเช่า"));
const repliesSince = (m: number, rtPrefix = "") => FAKE.slice(m).filter((r) => r.method === "POST" && r.path === "/v2/bot/message/reply" && String(r.json?.replyToken ?? "").startsWith(rtPrefix));
const contentGets = (m: number) => FAKE.slice(m).filter((r) => r.method === "GET" && /\/content$/.test(r.path));

// ═══════════ ยิงจากโพรเซสลูก ═══════════
const SYNC_MS = 14_000;
const ALL_OUT: any[] = [];
async function procs(jobs: Item[][], opts: { lead?: number; conc?: number } = {}): Promise<any[][]> {
  const at = Date.now() + (opts.lead ?? SYNC_MS);
  const outs = await Promise.all(jobs.map((items) => new Promise<any[]>((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify({ items, at, conc: opts.conc })).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\[.*\])/.exec(buf);
      let out: any[];
      try { out = m ? JSON.parse(m[1]) : items.map(() => ({ childFail: `exit=${code} ${buf.split("\n").slice(-4).join(" | ").slice(0, 300)}` })); } catch { out = items.map(() => ({ childFail: "parse" })); }
      resolve(out);
    });
  })));
  for (const o of outs) ALL_OUT.push(...o);
  return outs;
}

type Rec = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: Rec[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown) => {
  const d = typeof detail === "string" ? detail : J(detail);
  results.push({ id, ok, sev, what, detail: d });
  console.log(`  ${ok ? "✅ HOLD" : "❌ BREACH"} [${id}] (${sev}) ${what} — ${d.slice(0, 2400)}`);
};
const BADRX = /P2028|P2024|P2002|P2034|40P01|deadlock|timed out|Unable to start a transaction|Transaction already closed|Unique constraint/i;
const badOf = (rs: any[]) => rs.filter((x) => x?.threw || x?.childFail || BADRX.test(J(x)));
const tryRun = async (id: string, sev: string, what: string, fn: () => Promise<void>) => {
  try { await fn(); } catch (e) { rec(id, false, sev, `${what} (probe crashed)`, errMsg(e)); }
};

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const LN: any = await import(pathToFileURL(join(ROOT, F.line)).href);
const PT: any = await import(pathToFileURL(join(ROOT, F.portal)).href);
const PB: any = await import("@/lib/platform/postback-routes" as string);
const SL: any = await import("@/lib/core/signed-link" as string);
const ACC: any = await import("@/lib/modules/account" as string);
const SYS: any = await import("@/lib/modules/system/service" as string);
const ASV: any = await import("@/lib/modules/account/service" as string);
const GL: any = await import("@/lib/modules/account/gl" as string);
const SET: any = await import("@/lib/core/settings" as string);
const DORM: any = await import("@/lib/modules/dorm" as string);
const PRISMA_NS: any = (await import("@prisma/client" as string)).Prisma;

// ═══════════ ล้าง ═══════════
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  const soft = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* */ } };
  const conns: { id: string }[] = await prisma.chatChannelConnection.findMany({ where: { tenantId: { in: tids } }, select: { id: true } }).catch(() => []);
  if (conns.length) await soft(() => prisma.chatWebhookLog.deleteMany({ where: { connectionId: { in: conns.map((c) => c.id) } } }));
  await soft(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: { in: tids } }, data: { reversalOfId: null } }));
  await soft(() => prisma.accountDocumentPayment.updateMany({ where: { tenantId: { in: tids } }, data: { chequeId: null, whtCertDocId: null } }));
  await soft(() => prisma.accountDocument.updateMany({ where: { tenantId: { in: tids } }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
  await soft(() => prisma.accountLedger.updateMany({ where: { tenantId: { in: tids } }, data: { parentId: null } }));
  await soft(() => prisma.dormMeter.updateMany({ where: { tenantId: { in: tids } }, data: { replacedById: null } }));
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  for (const t of tids) await soft(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `chat-link:${t}:%`));
}
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
let ckN = 0;
const ck = (tag = "x") => `svc-d9b-${STAMP}-${tag}-${++ckN}`;

const tenantIds: string[] = [];
let exitCode = 0;
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d9pb-" } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้าง ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d9pb-" } } });
  await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'dorm:portal:%:svc-d9b-%'`);

  // ═══════════ fixtures (แบบข้อสอบ d.9) ═══════════
  console.log("\n── สร้างข้อมูลทดสอบ ──");
  const RENT = 450_000, COMMON = 30_000, BASE = RENT + COMMON;
  const P1 = "2026-10", P2 = "2026-11";
  const NOW1 = "2026-09-25T03:00:00.000Z", NOW2 = "2026-10-25T03:00:00.000Z";
  const NOWQ = "2026-10-26T15:00:00.000Z", NOWQ2 = "2026-10-27T01:05:00.000Z";
  const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `PB D9 ${tag}`, slug: `qc-svc-d9pb-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  const mkBook = async (tenantId: string, name: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: false });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const mkUnit = async (tenantId: string, tag: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type: "DORM", name, slug: `d9pb${tag}-${STAMP}` } })).id as string;
  const setVal = async (tenantId: string, key: string, scopeId: string, value: unknown, scope = "UNIT") => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope, scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope, scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "pb-d9" } });
  };
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[]) => {
    const u = await prisma.user.create({ data: { email: `svc-d9pb-${STAMP}-${key}@shark.local`, name: `PB D9 ${key}` } });
    await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: {}, acceptedAt: new Date() } });
    return u.id as string;
  };
  const BOOK_A = await mkBook(A, `บัญชีหอ PB9 A ${STAMP}`), BOOK_B = await mkBook(B, `บัญชีหอ PB9 B ${STAMP}`);
  const DA = await mkUnit(A, "a", "หอโพรบเอ"), DM = await mkUnit(A, "m", "หอโพรบเอ็ม"), DB = await mkUnit(B, "b", "หอโพรบบี");
  for (const [t, bk, u] of [[A, BOOK_A, DA], [A, BOOK_A, DM], [B, BOOK_B, DB]] as const) {
    await prisma.accountSystemLink.create({ data: { tenantId: t, systemId: bk, linkedKind: "BUSINESS", linkedId: u, enabled: true } });
    await setVal(t, "rooms.utility.elec.metering", u, "NONE");
    await setVal(t, "rooms.utility.water.metering", u, "NONE");
    await setVal(t, "messaging.quietHours", u, null);
    await setVal(t, "messaging.channelOrder", u, ["LINE", "WEB_LINK"]);
    await setVal(t, "rooms.lateFee.autoCharge", u, false);
  }
  await setVal(A, "payments.receiver", DA, { promptpayId: "0812345678", displayName: "หอโพรบเอ" });
  const OWN = await mkUser("owner", A, "OWNER", ["*"]);
  const OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
  const sysA = (await prisma.appSystem.create({ data: { tenantId: A, type: "CHAT", name: `pb-d9-chat-${STAMP}` } })).id;
  const sysB = (await prisma.appSystem.create({ data: { tenantId: B, type: "CHAT", name: `pb-d9-chat-b-${STAMP}` } })).id;
  const RAND = randomBytes(3).toString("hex");
  const SECRET: Record<string, string> = {};
  const mkConn = async (tenantId: string, sys: string, tag: string) => {
    SECRET[tag] = `pbd9sec${tag}${RAND}`;
    return (await prisma.chatChannelConnection.create({ data: { tenantId, systemId: sys, type: "LINE", displayName: `pb-d9-${tag}-${STAMP}`, externalAccountId: `pb-d9-${tag}-${STAMP}`, credentials: { channelAccessToken: `pbd9tok${tag}${RAND}`, channelSecret: SECRET[tag] }, meta: { basicId: `@pbd9${tag}` } } })).id as string;
  };
  const OA1 = await mkConn(A, sysA, "a1"), OA2 = await mkConn(A, sysA, "a2"), OAB = await mkConn(B, sysB, "b");
  SECRET[OA1] = SECRET.a1; SECRET[OA2] = SECRET.a2; SECRET[OAB] = SECRET.b;
  await setVal(A, "messaging.lineConnectionId", DA, OA1);
  await setVal(A, "messaging.lineConnectionId", DM, OA1); // หน่วยที่ 2 ใช้ OA เดียวกัน (สัญญาค้าง 2 งวด)
  await setVal(B, "messaging.lineConnectionId", DB, OAB);

  const mkRooms = async (tenantId: string, unitId: string, numbers: string[]) => {
    const ty = (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: "มาตรฐาน", capacity: 2, baseRateSatang: RENT, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id as string;
    const b = (await prisma.roomBuilding.create({ data: { tenantId, unitId, name: "อาคาร โพรบ", floors: 3, sortOrder: 1 } })).id as string;
    const R: Record<string, string> = {};
    for (const n of numbers) R[n] = (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId: ty, number: n, buildingId: b, floorNo: Number(n[0]), floor: n[0] } })).id as string;
    return { ty, R };
  };
  let ph = 0;
  const PH0 = 10_000_000 + Math.floor(Math.random() * 80_000_000);
  const mkParty = async (tenantId: string, name: string) => (await prisma.party.create({ data: { tenantId, name, phone: `08${String(PH0 + ++ph).slice(-8)}` } })).id as string;
  const mkFile = async (tenantId: string) => (await prisma.fileAsset.create({ data: { tenantId, kind: "ATTACHMENT", path: `t/${tenantId}/private/pb-d9-${randomBytes(6).toString("hex")}.png`, cdnUrl: "private://pb-d9", contentType: "image/png", bytes: 64 } })).id as string;
  const mkLease = async (tenantId: string, unitId: string, roomId: string, ty: string, partyId: string, photos: unknown = []) => {
    const s = await SET.snapshotPolicy({ tenantId }, "lease", { unitId, roomTypeId: ty, roomId });
    const l = await prisma.dormLease.create({ data: {
      tenantId, unitId, roomId, partyId, status: "ACTIVE", startDate: dbDate("2026-01-01"), endDate: dbDate("2027-12-31"),
      rentSatang: RENT, commonFeeSatang: COMMON, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0, coTenants: { occupants: [], vehicles: [] },
      policySnapshot: s, signedAt: new Date(), createdById: "pb-d9", moveInPhotos: photos as any,
    } });
    const oc = await prisma.roomOccupancy.create({ data: { tenantId, unitId, roomId, startDate: dbDate("2026-01-01"), endDate: dbDate("2028-01-01"), kind: "LEASE", refType: "DormLease", refId: l.id } });
    await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
    return l.id as string;
  };
  type Ct = { id: string; ext: string; partyId: string | null; conn: string; tenantId: string };
  const C: Record<string, Ct> = {};
  const mkContact = async (key: string, tenantId: string, sys: string, conn: string, partyId: string | null) => {
    const ext = `Upbd9${key.replace(/[^A-Za-z0-9]/g, "")}${RAND}`;
    const row = await prisma.chatContact.create({ data: { tenantId, systemId: sys, channel: "LINE", channelConnectionId: conn, externalUserId: ext, partyId, lang: "th" } });
    C[key] = { id: row.id, ext, partyId, conn, tenantId };
    return C[key];
  };
  // ห้องในหน่วย DA — หนึ่งสัญญาต่อแท็ก (Party ใหม่ + ผู้ติดต่อ OA1 ของ Party นั้น ยกเว้นแท็กรหัสผูก)
  const TAGS: [string, string][] = [
    ["LK", "101"], ["LK2", "102"], ["LKE", "103"],
    ["SD", "110"], ["SP1", "111"], ["SP2", "112"], ["SP3", "113"], ["SP4", "114"], ["SP5", "115"],
    ["SV1", "116"], ["SV2", "117"], ["SV3", "118"], ["SE1", "119"], ["SE2", "120"], ["SE3", "121"],
    ["SC1", "122"], ["SC2", "123"], ["SC3", "124"], ["SJ", "125"], ["SJ2", "126"], ["CAL", "127"],
    ["ID", "130"], ["IP1", "131"], ["IP2", "132"], ["IP3", "133"], ["IP4", "134"], ["IA1", "135"], ["IA2", "136"],
    ["PT", "140"], ["PT2", "141"], ["PTE", "142"], ["PS", "143"], ["PS2", "144"], ["RL", "145"], ["PTR", "146"],
  ];
  const RA = await mkRooms(A, DA, TAGS.map((t) => t[1]));
  const RM = await mkRooms(A, DM, ["201"]);
  const RB = await mkRooms(B, DB, ["101"]);
  const L: Record<string, string> = {}, P: Record<string, string> = {}, ROOM: Record<string, string> = {};
  const FILES = { pt: await mkFile(A), ptId: await mkFile(A), pt2: await mkFile(A) };
  for (const [tag, no] of TAGS) {
    P[tag] = tag === "IA2" ? P.IA1 : await mkParty(A, `ผู้เช่าโพรบ ${tag}`);
    const photos = tag === "PT" ? [{ fileId: FILES.pt, kind: "ROOM_PHOTO", at: "2026-01-01" }, { fileId: FILES.ptId, kind: "ID_CARD", at: "2026-01-01" }]
      : tag === "PT2" ? [{ fileId: FILES.pt2, kind: "DOCUMENT", at: "2026-01-01" }] : [];
    L[tag] = await mkLease(A, DA, RA.R[no]!, RA.ty, P[tag]!, photos);
    ROOM[tag] = no;
    if (!["LK", "LK2", "LKE", "IA2"].includes(tag)) await mkContact(tag, A, sysA, OA1, P[tag]!);
  }
  P.IM = await mkParty(A, "ผู้เช่าโพรบ IM"); L.IM = await mkLease(A, DM, RM.R["201"]!, RM.ty, P.IM); await mkContact("IM", A, sysA, OA1, P.IM);
  P.LB = await mkParty(B, "ผู้เช่าโพรบ ร้านบี"); L.LB = await mkLease(B, DB, RB.R["101"]!, RB.ty, P.LB); await mkContact("LB", B, sysB, OAB, P.LB);
  for (let i = 0; i < 12; i++) await mkContact(`KL${i}`, A, sysA, OA1, null);
  for (let i = 0; i < 6; i++) await mkContact(`KE${i}`, A, sysA, OA1, null);
  await mkContact("CC", A, sysA, OA1, null); await mkContact("CC2", A, sysA, OA1, null); await mkContact("CN", A, sysA, OA1, null);
  await mkContact("KLB", B, sysB, OAB, null);
  await mkContact("PTo2", A, sysA, OA2, P.PT); // ผู้เช่า PT แต่อยู่ OA อื่นของร้าน
  await mkContact("IA", A, sysA, OA1, P.IA1);

  // ลิงก์ผู้เช่า PTE "ก่อนย้ายออก" (ผ่าน portalUrl จริงขณะยัง live)
  const urlPTEbefore: string = await PT.portalUrl({ tenantId: A }, { leaseId: L.PTE });
  const tokPTEbefore = (/\/d\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/.exec(urlPTEbefore) ?? [])[1] ?? "";

  // รอบบิล
  const parkOutbox = async () => { await prisma.$executeRawUnsafe(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, tenantIds); };
  const runPeriod = async (ctx: any, unitId: string, periodKey: string, now: string) => {
    const r = await DORM.prepareBillRun(ctx, { unitId, periodKey }, { now: new Date(now) });
    let last: any = null;
    if (r?.ok) for (let i = 0; i < 200; i++) { last = await DORM.sendBillRun(ctx, { unitId, runId: r.runId }, { now: new Date(now) }); if (!last?.ok || last.done) break; }
    await parkOutbox();
    return { r, s: last };
  };
  const cO = { tenantId: A, actorUserId: OWN }, cB = { tenantId: B, actorUserId: OWNB };
  const t0f = Date.now();
  const ra = await runPeriod(cO, DA, P1, NOW1), rm1 = await runPeriod(cO, DM, P1, NOW1), rm2 = await runPeriod(cO, DM, P2, NOW2), rb = await runPeriod(cB, DB, P1, NOW1);
  const BILL: Record<string, any> = {};
  for (const tag of Object.keys(L)) BILL[tag] = await prisma.dormBill.findFirst({ where: { leaseId: L[tag], periodKey: P1 } });
  BILL.IM2 = await prisma.dormBill.findFirst({ where: { leaseId: L.IM, periodKey: P2 } });
  const missing = Object.entries(BILL).filter(([, b]) => !(b?.accountDocumentId && ["SENT", "PARTIALLY_PAID"].includes(b.status) && b.totalSatang === BASE)).map(([k]) => k);
  console.log(`  fixture ${Math.round((Date.now() - t0f) / 1000)}s · runs ${J({ a: ra.s?.done ?? ra.r?.code, m1: rm1.s?.done ?? rm1.r?.code, m2: rm2.s?.done ?? rm2.r?.code, b: rb.s?.done ?? rb.r?.code })} · bills ${Object.keys(BILL).length} missing=${missing.join(",") || "—"}`);
  if (missing.length) throw new Error(`fixture: บิลไม่ครบ ${missing.join(",")}`);
  const FIX_MARK = mark();
  const preFixPushes = FAKE.filter((r) => r.path === "/v2/bot/message/push").length;
  console.log(`  (push ระหว่างสร้างฉาก ${preFixPushes} — ไม่นับ)`);
  void FIX_MARK;
  let payN = 0;
  const payIn = (tag: string, amount: number, bill = BILL[tag]) => ({ tenantId: bill.tenantId, unitId: bill.unitId, docId: bill.accountDocumentId, amountSatang: amount, idempotencyKey: `pb-d9-${STAMP}-${++payN}`, paidAt: "2026-10-04T05:00:00.000Z" });
  const pay = async (tag: string, amount: number) => { const r = await ACC.recordExternalPayment({ ...payIn(tag, amount), paidAt: new Date("2026-10-04T05:00:00.000Z") }); if (!r?.ok) throw new Error(`fixture pay ${tag}: ${J(r)}`); return r; };
  const outstandingOf = async (tag: string, bill = BILL[tag]): Promise<number> => { const [b] = await DORM.portalLeaseBills(bill.tenantId, { id: bill.leaseId, unitId: bill.unitId }, { only: [bill.id] }); return b ? b.outstandingSatang : -1; };
  const smlOf = (bill: any) => prisma.serviceMessageLog.findMany({ where: { tenantId: bill.tenantId, dedupeKey: `rooms:bill:${bill.id}` } });
  const tok = (leaseId: string, tenantId = A, purpose = "dorm.portal", expMin = 60) => SL.signLink({ tenantId, purpose, subjectId: leaseId, expMin }) as string;
  const pctx = (k: string) => ({ tenantId: C[k]!.tenantId, connectionId: C[k]!.conn, chatContactId: C[k]!.id, partyId: C[k]!.partyId, replyToken: null });
  const lctx = (k: string) => ({ tenantId: C[k]!.tenantId, connectionId: C[k]!.conn, chatContactId: C[k]!.id, replyToken: null });
  const whBody = (k: string, msg: Record<string, unknown>, rt: string) => ({ destination: "Upbd9dest", events: [{ type: "message", mode: "active", timestamp: Date.now(), webhookEventId: `01PB${randomBytes(8).toString("hex")}`, replyToken: rt, source: { type: "user", userId: C[k]!.ext }, message: msg }] });

  // ═══════════════════════ LK รหัสผูกห้อง ═══════════════════════
  console.log("\n── LK รหัสผูกห้อง ──");
  await tryRun("LK-1", "BLOCKER", "รหัสเดียว 12 ทาง", async () => {
    const ic = await LN.issueDormLinkCode(cO, { unitId: DA, leaseId: L.LK });
    if (!ic?.ok) throw new Error(`issue ${J(ic)}`);
    const m = mark();
    const direct = (i: number) => ({ op: "link", tag: `KL${i}`, ctx: lctx(`KL${i}`), text: ic.code });
    const wh = (i: number) => ({ op: "webhook", tag: `KL${i}`, connId: OA1, secret: SECRET[OA1], body: whBody(`KL${i}`, { id: `7${Date.now()}${i}`, type: "text", text: ic.code }, `rt-lk1-${i}-${RAND}`) });
    const outs = (await procs([[direct(0), direct(1), direct(2)], [direct(3), direct(4), direct(5)], [direct(6), direct(7), direct(8)], [wh(9), wh(10), wh(11)]])).flat();
    const bound = await prisma.chatContact.findMany({ where: { id: { in: Array.from({ length: 12 }, (_, i) => C[`KL${i}`]!.id) }, partyId: { not: null } }, select: { id: true, partyId: true } });
    const row = await prisma.chatLinkCode.findFirst({ where: { tenantId: A, purpose: "DORM_LEASE", refId: L.LK }, orderBy: { createdAt: "desc" } });
    const directOut = outs.filter((o) => o.op === "link");
    const winners = directOut.filter((o) => o.r?.linked === true);
    const loserTexts = new Set(directOut.filter((o) => o.r?.linked !== true).map((o) => o.r?.reply?.text));
    const whReplies = repliesSince(m, "rt-lk1-").map((r) => String(r.json?.messages?.[0]?.text ?? ""));
    const whLosers = whReplies.filter((t) => t !== whReplies.find((x) => x.includes("ห้อง")));
    const allLoserTexts = new Set([...loserTexts, ...whLosers]);
    const ok = bound.length === 1 && bound[0].partyId === P.LK && !!row?.usedAt && row.usedByChatContactId === bound[0].id
      && winners.length + whReplies.filter((t) => t.includes("ห้อง 101")).length === 1
      && allLoserTexts.size === 1 && [...allLoserTexts][0] === PB.LINK_FAILED_TEXT && !badOf(outs).length && outs.filter((o) => o.op === "webhook").every((o) => o.r?.status === 200);
    rec("LK-1", ok, "BLOCKER", "รหัสเดียว 9 ทางตรง (3 โพรเซส) + 3 webhook ลายเซ็นจริง (โพรเซสที่ 4) พร้อมกัน ⇒ ผูก 1 · ผู้แพ้ได้ LINK_FAILED_TEXT ไบต์เดียวกัน",
      { bound: bound.length, boundParty: bound[0]?.partyId === P.LK, winnersDirect: winners.length, whReplies: whReplies.map((t) => t.slice(0, 40)), loserTexts: [...allLoserTexts].map((t) => String(t).slice(0, 40)), bad: badOf(outs).slice(0, 2), whStatus: outs.filter((o) => o.op === "webhook").map((o) => o.r?.status) });
  });

  await tryRun("LK-2", "BLOCKER", "ผู้ติดต่อเดียวสองรหัส", async () => {
    // สองรหัสของสองสัญญา (Party ต่างกัน) ยิงพร้อมกันจากผู้ติดต่อ CC คนเดียว (2 โพรเซส)
    const c1 = await LN.issueDormLinkCode(cO, { unitId: DA, leaseId: L.LK2 });
    const c2 = await LN.issueDormLinkCode(cO, { unitId: DA, leaseId: L.LK });
    if (!c1?.ok || !c2?.ok) throw new Error("issue");
    const outs = (await procs([[{ op: "link", tag: "c1", ctx: lctx("CC"), text: c1.code }], [{ op: "link", tag: "c2", ctx: lctx("CC"), text: c2.code }]])).flat();
    const cc = await prisma.chatContact.findUnique({ where: { id: C.CC!.id }, select: { partyId: true } });
    const roomOfParty = cc?.partyId === P.LK2 ? "102" : cc?.partyId === P.LK ? "101" : "?";
    const succ = outs.filter((o) => /ห้อง \d+/.test(J(o.r?.reply)));
    const succRooms = succ.map((o) => (/ห้อง (\d+)/.exec(J(o.r?.reply)) ?? [])[1]);
    const others = outs.filter((o) => !succ.includes(o)).map((o) => o.r?.reply?.text);
    const okA = !!cc?.partyId && succ.length <= 1 && succRooms.every((r) => r === roomOfParty) && others.every((t) => t === PB.LINK_OK_TEXT || t === PB.LINK_FAILED_TEXT) && !badOf(outs).length;
    // ตามลำดับ: ผู้ติดต่อที่ผูกแล้วพิมพ์รหัสห้องอื่น ⇒ LINK_OK_TEXT ตรงตัว · Party ไม่เปลี่ยน · ไม่มีเลขห้อง/ลิงก์ของห้องนั้น
    const otherLease = cc?.partyId === P.LK2 ? L.LK : L.LK2;
    const c3 = await LN.issueDormLinkCode(cO, { unitId: DA, leaseId: otherLease });
    const r3 = await PB.handleLinkCodeText(lctx("CC"), c3.code);
    const cc2 = await prisma.chatContact.findUnique({ where: { id: C.CC!.id }, select: { partyId: true } });
    const c3row = await prisma.chatLinkCode.findFirst({ where: { tenantId: A, codeLast4: String(c3.code).slice(-4), purpose: "DORM_LEASE" }, orderBy: { createdAt: "desc" } });
    const okB = r3?.reply?.text === PB.LINK_OK_TEXT && cc2?.partyId === cc?.partyId;
    rec("LK-2", okA && okB, "BLOCKER", "ผู้ติดต่อเดียวใช้ 2 รหัส (พร้อมกัน 2 โพรเซส แล้วตามด้วยรหัสที่ 3): Party เดียว · ข้อความสำเร็จ ≤1 และตรงห้องของ Party ที่ผูกจริง · ที่เหลือ LINK_OK/LINK_FAILED ตรงตัว · ผูกแล้วไม่ถูกทับ",
      { finalRoom: roomOfParty, succRooms, others: others.map((t) => String(t).slice(0, 30)), r3: r3?.reply?.text, partyKept: cc2?.partyId === cc?.partyId, code3Burnt: !!c3row?.usedAt, bad: badOf(outs).slice(0, 2) });
    if (c3row?.usedAt) console.log("    ℹ️ หมายเหตุ LK-2: รหัสของห้องอื่นที่ผู้ติดต่อ (ผูกแล้ว) พิมพ์ถูกเผาทิ้ง (usedAt) แม้ไม่ผูก — ผู้เช่าตัวจริงต้องขอรหัสใหม่ (พฤติกรรม R0.7 · ไม่รั่วข้อมูล)");
  });

  await tryRun("LK-3", "BLOCKER", "รหัสร้าน A บน OA ร้าน B", async () => {
    const c4 = await LN.issueDormLinkCode(cO, { unitId: DA, leaseId: L.LK2 });
    if (!c4?.ok) throw new Error("issue");
    const m = mark();
    const outs = (await procs([
      [{ op: "link", tag: "b-ctx", ctx: lctx("KLB"), text: c4.code }, { op: "link", tag: "forged-ctx", ctx: { ...lctx("KLB"), tenantId: A }, text: c4.code }],
      [{ op: "webhook", tag: "b-wh", connId: OAB, secret: SECRET[OAB], body: whBody("KLB", { id: `8${Date.now()}1`, type: "text", text: c4.code }, `rt-lk3-${RAND}`) }],
    ])).flat();
    const klb = await prisma.chatContact.findUnique({ where: { id: C.KLB!.id }, select: { partyId: true } });
    const row = await prisma.chatLinkCode.findFirst({ where: { tenantId: A, codeLast4: String(c4.code).slice(-4), purpose: "DORM_LEASE" }, orderBy: { createdAt: "desc" } });
    const whTxt = repliesSince(m, "rt-lk3-").map((r) => r.json?.messages?.[0]?.text);
    // รหัสยังใช้ได้ในร้าน A
    const after = await PB.handleLinkCodeText(lctx("CC2"), c4.code);
    const cc2 = await prisma.chatContact.findUnique({ where: { id: C.CC2!.id }, select: { partyId: true } });
    const direct = outs.filter((o) => o.op === "link").map((o) => o.r?.reply?.text);
    const ok = klb?.partyId === null && direct.every((t) => t === PB.LINK_FAILED_TEXT) && whTxt.every((t) => t === PB.LINK_FAILED_TEXT) && after?.linked === true && cc2?.partyId === P.LK2 && !badOf(outs).length;
    rec("LK-3", ok, "BLOCKER", "รหัสร้าน A พิมพ์บน OA ร้าน B (ctx ร้าน B · ctx ปลอม tenant A + OA ร้าน B · webhook ร้าน B) ⇒ LINK_FAILED_TEXT ทุกทาง · ไม่ผูก · ไม่เผารหัส (ใช้ต่อในร้าน A ได้)",
      { klbParty: klb?.partyId ?? null, direct, whTxt, usedBeforeA: row?.usedAt ? "used" : "unused", afterInA: after?.linked, bad: badOf(outs).slice(0, 2) });
  });

  await tryRun("LK-4", "BLOCKER", "ผูกขณะสัญญาถูกปิด", async () => {
    const ic = await LN.issueDormLinkCode(cO, { unitId: DA, leaseId: L.LKE });
    if (!ic?.ok) throw new Error("issue");
    const lk = (i: number, dly: number) => ({ op: "link", tag: `KE${i}`, ctx: lctx(`KE${i}`), text: ic.code, dly });
    const outs = (await procs([[lk(0, 0), lk(1, 60)], [lk(2, 120), lk(3, 200)], [{ op: "db", tag: "end", dly: 80, model: "dormLease", method: "update", args: { where: { id: L.LKE }, data: { status: "ENDED", endedAt: D(new Date().toISOString()), endReason: "MOVE_OUT" } } }]])).flat();
    const bound = await prisma.chatContact.findMany({ where: { id: { in: [0, 1, 2, 3].map((i) => C[`KE${i}`]!.id) }, partyId: { not: null } }, select: { id: true, partyId: true } });
    const leak: string[] = [];
    for (const b of bound) {
      const ctx = { tenantId: A, connectionId: OA1, chatContactId: b.id, partyId: b.partyId, replyToken: null };
      const pbR = await LN.onDormPostback(ctx, { action: "bills", params: {} });
      if (pbR?.text !== LN.DORM_POSTBACK_NOT_FOUND) leak.push(`postback ${J(pbR).slice(0, 60)}`);
      const im = await LN.onLineImage(ctx, { messageId: `9${Date.now()}44` }, { deps: noopDeps });
      if (im?.handled !== false) leak.push(`image ${J(im).slice(0, 60)}`);
    }
    const url = await PT.portalUrl({ tenantId: A }, { leaseId: L.LKE });
    const linkReplies = outs.filter((o) => o.op === "link").map((o) => ({ linked: o.r?.linked, room: /ห้อง 103/.test(J(o.r?.reply)), t0: o.t0 }));
    const endT1 = outs.find((o) => o.tag === "end")?.t1 ?? 0;
    const afterEndSuccess = outs.filter((o) => o.op === "link" && o.t0 > endT1 && /ห้อง 103/.test(J(o.r?.reply)));
    rec("LK-4", !leak.length && url === "" && !afterEndSuccess.length && !badOf(outs).length, "BLOCKER", "§8.1#2 ปิดสัญญากลางทางขณะ 4 ผู้ติดต่อพิมพ์รหัส ⇒ หลังปิด ไม่มีทางเปิดบิล/พอร์ทัล/แนบสลิปได้ · ไม่มีข้อความสำเร็จที่เริ่มหลังปิด",
      { bound: bound.length, linkReplies, leak, portalUrlAfter: url, bad: badOf(outs).slice(0, 2) });
  });

  // ═══════════════════════ S ส่งบิล ═══════════════════════
  console.log("\n── S ส่งบิล (แข่งสถานะ) ──");
  const evtOf = (bill: any) => prisma.outboxEvent.findFirst({ where: { tenantId: bill.tenantId, type: "dorm.billrun.sent", idempotencyKey: `dorm.billrun.sent:${bill.id}` } });
  await tryRun("SD-1", "CRITICAL", "ส่งบิลเดียวพร้อมกัน", async () => {
    const b = BILL.SD, m = mark();
    const evt = await evtOf(b);
    const s = { op: "send", tenantId: A, billId: b.id };
    const outs = (await procs([[s, s, s], [s, s, s], [s, s, { op: "consume", evt }], [{ op: "consume", evt }, { op: "consume", evt }]])).flat();
    const ps = billPushesTo(C.SD!.ext, m);
    const sml = await smlOf(b);
    const statuses: Record<string, number> = {};
    for (const o of outs) { const k = o.r?.status ?? (o.r?.ok ? "consumed" : "?"); statuses[k] = (statuses[k] ?? 0) + 1; }
    rec("SD-1", ps.length === 1 && sml.length === 1 && sml[0].status === "SENT" && !badOf(outs).length, "CRITICAL", "sendDormBill ×8 + consumer ×3 ใน 4 โพรเซสพร้อมกัน ⇒ push 1 · log 1 แถว SENT", { pushes: ps.length, sml: sml.map((r: any) => r.status), statuses, bad: badOf(outs).slice(0, 2) });
  });

  // ตัววัดเวลา: payment หนึ่งครั้ง (ใช้กำหนดจังหวะแข่ง)
  const tc = Date.now(); await pay("CAL", BASE); const PAY_MS = Date.now() - tc;
  const tsd = Date.now(); await LN.sendDormBill({ tenantId: A }, { billId: BILL.CAL.id }); const SEND_PAID_MS = Date.now() - tsd;
  console.log(`  (จังหวะ: recordExternalPayment ≈ ${PAY_MS} ms · sendDormBill ถึงข้อ PAID ≈ ${SEND_PAID_MS} ms)`);

  type RaceTrial = { tag: string; push: number; status: string; claimTs: number | null; sendT0: number; sendT1: number; mutT0: number; mutT1: number; pushT: number | null; amountInMsg: string | null; mutOk: boolean };
  const raceRows: RaceTrial[] = [];
  const judgeRace = (rows: RaceTrial[]) => {
    const strong = rows.filter((x) => x.push > 0 && x.mutOk && x.sendT0 > x.mutT1);                         // เริ่มส่งหลังสถานะเปลี่ยนเสร็จแล้วยังส่ง
    const claimAfter = rows.filter((x) => x.push > 0 && x.mutOk && x.claimTs !== null && x.claimTs > x.mutT1);  // อ้างสิทธิ์ (claim) หลังสถานะเปลี่ยนเสร็จ
    const pushAfter = rows.filter((x) => x.push > 0 && x.mutOk && x.pushT !== null && x.pushT > x.mutT1);       // ข้อความออกหลังสถานะเปลี่ยนเสร็จ
    return { strong, claimAfter, pushAfter };
  };
  const runSendRace = async (tags: string[], mutation: (tag: string) => Item, sendOff: (k: number) => number, mutOff: (k: number) => number) => {
    const m = mark();
    const jobs: Item[][] = [];
    tags.forEach((tag, k) => {
      jobs.push([{ op: "send", tag, tenantId: A, billId: BILL[tag].id, dly: Math.max(0, sendOff(k)) }]);
      jobs.push([{ ...mutation(tag), tag, dly: Math.max(0, mutOff(k)) }]);
    });
    const outs = (await procs(jobs)).flat();
    const rows: RaceTrial[] = [];
    for (const tag of tags) {
      const s = outs.find((o) => o.op === "send" && o.tag === tag), mu = outs.find((o) => o.op !== "send" && o.tag === tag);
      const ps = billPushesTo(C[tag]!.ext, m);
      const sml = await smlOf(BILL[tag]);
      const amt = ps[0] ? (/฿[\d,]+\.\d\d/.exec(J(ps[0].json?.messages?.[0]?.contents ?? ps[0].json)) ?? [])[0] ?? null : null;
      rows.push({ tag, push: ps.length, status: s?.r?.status ?? s?.threw ?? "?", claimTs: cuidTs(sml[0]?.id), sendT0: s?.t0 ?? 0, sendT1: s?.t1 ?? 0, mutT0: mu?.t0 ?? 0, mutT1: mu?.t1 ?? 0, pushT: ps[0]?.t ?? null, amountInMsg: amt, mutOk: !mu?.threw && (mu?.r?.ok !== false) });
    }
    raceRows.push(...rows);
    return { rows, outs };
  };
  const fmtRows = (rows: RaceTrial[]) => rows.map((x) => ({ tag: x.tag, st: x.status, push: x.push, amt: x.amountInMsg, sendStartVsCommit: x.sendT0 - x.mutT1, claimVsCommit: x.claimTs !== null ? x.claimTs - x.mutT1 : null, pushVsCommit: x.pushT !== null ? x.pushT - x.mutT1 : null }));

  await tryRun("SP-1", "MAJOR", "ส่งบิล vs จ่ายครบ", async () => {
    const tags = ["SP1", "SP2", "SP3", "SP4", "SP5"];
    const fr = [0.2, 0.45, 0.7, 0.9, 1.05];
    const { rows, outs } = await runSendRace(tags, (tag) => ({ op: "pay", input: payIn(tag, BASE) }), (k) => Math.round(PAY_MS * fr[k]! - 150), () => 0);
    const j = judgeRace(rows);
    const anyPaidPush = rows.filter((x) => x.push > 0);
    rec("SP-1a", !j.strong.length && !badOf(outs).length, "CRITICAL", "§8.1#5 ส่งที่ 'เริ่ม' หลังรับเงินครบ commit แล้ว ⇒ ต้องไม่ส่ง (อ่านสด)", { trials: fmtRows(rows), strong: j.strong.map((x) => x.tag), bad: badOf(outs).slice(0, 2) });
    rec("SP-1b", !j.claimAfter.length, "MAJOR", "§8.1#5 'ถ้าจ่ายครบก่อน claim ⇒ ไม่ส่ง': claim (แถว ServiceMessageLog) เกิดหลังรับเงินครบ commit ต้องไม่ push", { claimAfter: j.claimAfter.map((x) => x.tag), pushedTrials: anyPaidPush.map((x) => x.tag), payMs: PAY_MS });
    rec("SP-1c", !j.pushAfter.length, "MINOR", "ไม่มีข้อความทวงออกหลังรับเงินครบ commit แล้ว (ข้อความค้างจังหวะ)", { pushAfter: j.pushAfter.map((x) => ({ tag: x.tag, amt: x.amountInMsg, pushVsCommit: (x.pushT ?? 0) - x.mutT1 })) });
  });
  await tryRun("SV-1", "MAJOR", "ส่งบิล vs VOID", async () => {
    const { rows, outs } = await runSendRace(["SV1", "SV2", "SV3"], (tag) => ({ op: "db", model: "dormBill", method: "update", args: { where: { id: BILL[tag].id }, data: { status: "VOID" } } }), () => 0, (k) => [30, 90, 180][k]!);
    const j = judgeRace(rows);
    rec("SV-1", !j.strong.length && !j.claimAfter.length && !badOf(outs).length, "MAJOR", "ส่งบิลแข่ง VOID (VOID commit +30/90/180 ms หลังเริ่มส่ง): ไม่มี push ที่ claim/เริ่มหลัง VOID commit", { trials: fmtRows(rows), strong: j.strong.map((x) => x.tag), claimAfter: j.claimAfter.map((x) => x.tag), pushAfter: j.pushAfter.map((x) => x.tag) });
  });
  await tryRun("SE-1", "MAJOR", "ส่งบิล vs ปิดสัญญา", async () => {
    const { rows, outs } = await runSendRace(["SE1", "SE2", "SE3"], (tag) => ({ op: "db", model: "dormLease", method: "update", args: { where: { id: L[tag] }, data: { status: "ENDED", endedAt: D(new Date().toISOString()), endReason: "MOVE_OUT" } } }), () => 0, (k) => [40, 110, 200][k]!);
    const j = judgeRace(rows);
    rec("SE-1", !j.strong.length && !j.claimAfter.length && !badOf(outs).length, "MAJOR", "ส่งบิลแข่งปิดสัญญา (ENDED commit +40/110/200 ms): ไม่มี push ที่ claim/เริ่มหลังปิด", { trials: fmtRows(rows), strong: j.strong.map((x) => x.tag), claimAfter: j.claimAfter.map((x) => x.tag), pushAfter: j.pushAfter.map((x) => x.tag) });
  });
  await tryRun("SC-1", "MAJOR", "ส่งบิล vs ปิดช่องทาง", async () => {
    const { rows, outs } = await runSendRace(["SC1", "SC2", "SC3"], (tag) => ({ op: "db", model: "settingValue", method: "create", args: { data: { tenantId: A, key: "rooms.billing.sendChannels", scope: "LEASE", scopeId: L[tag], value: ["PRINT"], setById: "pb-d9" } } }), () => 0, (k) => [40, 110, 200][k]!);
    const j = judgeRace(rows);
    rec("SC-1", !j.strong.length && !j.claimAfter.length && !badOf(outs).length, "MAJOR", "ส่งบิลแข่งปิดช่องทาง (sendChannels=[PRINT] ระดับสัญญา +40/110/200 ms): ไม่มี push ที่ claim/เริ่มหลังปิด", { trials: fmtRows(rows), strong: j.strong.map((x) => x.tag), claimAfter: j.claimAfter.map((x) => x.tag), pushAfter: j.pushAfter.map((x) => x.tag) });
  });

  await tryRun("SJ-1", "CRITICAL", "งานส่งซ้ำ 2 โพรเซส", async () => {
    await setVal(A, "messaging.quietHours", DA, { start: "21:00", end: "08:00" });
    try {
      const q1 = await LN.sendDormBill({ tenantId: A }, { billId: BILL.SJ.id }, { now: new Date(NOWQ) });
      const q2 = await LN.sendDormBill({ tenantId: A }, { billId: BILL.SJ2.id }, { now: new Date(NOWQ) });
      const evt = await evtOf(BILL.SJ2);
      const m = mark();
      const jb = { op: "jobs", tenantId: A, now: NOWQ2 };
      const outs = (await procs([[jb, jb], [jb, jb], [{ op: "consume", evt }, { op: "send", tenantId: A, billId: BILL.SJ2.id, now: NOWQ2 }], [{ op: "pay", tag: "SJ2", input: payIn("SJ2", BASE), dly: Math.round(PAY_MS * 0.1) }]])).flat();
      const p1 = billPushesTo(C.SJ!.ext, m), p2 = billPushesTo(C.SJ2!.ext, m);
      const s1 = await smlOf(BILL.SJ), s2 = await smlOf(BILL.SJ2);
      const payO = outs.find((o) => o.op === "pay");
      const claim2 = cuidTs(s2[0]?.id);
      const resent = outs.filter((o) => o.op === "jobs").map((o) => o.r?.resent);
      rec("SJ-1a", q1?.status === "SKIPPED_QUIET" && p1.length === 1 && s1.length === 1 && s1[0].status === "SENT" && !badOf(outs).length, "CRITICAL", "X5 runDormLineJobs ×4 ใน 2 โพรเซส (หลังเวลาเงียบ) ⇒ push 1 · log SENT", { q1: q1?.status, pushes: p1.length, sml: s1.map((r: any) => r.status), resent, bad: badOf(outs).slice(0, 2) });
      const stale = p2.length > 0 && payO?.r?.ok && ((p2[0]!.t > payO.t1 && claim2 !== null && claim2 > payO.t1));
      rec("SJ-1b", p2.length <= 1 && !stale && !badOf(outs).length, "MAJOR", "§8.1#5 consumer + send + งานส่งซ้ำ ×4 + รับเงินครบระหว่างทาง ⇒ ข้อความ ≤1 · ถ้า claim หลังจ่ายครบ ⇒ ไม่ส่ง", { q2: q2?.status, pushes: p2.length, amt: p2[0] ? (/฿[\d,]+\.\d\d/.exec(J(p2[0].json)) ?? [])[0] : null, sml: s2.map((r: any) => r.status), claimVsPay: claim2 !== null && payO ? claim2 - payO.t1 : null, pushVsPay: p2[0] && payO ? p2[0].t - payO.t1 : null, pay: payO?.r?.ok });
    } finally { await setVal(A, "messaging.quietHours", DA, null); }
  });

  // ═══════════════════════ I รูปสลิปในแชท ═══════════════════════
  console.log("\n── I รูปสลิปในแชท ──");
  const slipsOn = (billIds: string[]) => prisma.paymentSlip.findMany({ where: { tenantId: { in: [A, B] }, refType: "DORM_BILL", refId: { in: billIds } }, select: { id: true, refId: true, expectedSatang: true, status: true, createdAt: true } });
  // ORACLE-EDIT (ผู้คุม 30 ต.ค. · W2/W3) — ID-1 แยก: (0) ไม่มีตัวตรวจ ⇒ ไม่ดึงรูป · 0 สลิป (control ลบ) · (1) ตัวตรวจ FAKE (VALID + transRef) ⇒ messageId เดียวยิง ×N ⇒ สลิป 1 ใบพอดี
  await tryRun("ID-1", "CRITICAL", "messageId เดิมซ้ำ", async () => {
    const ctx = pctx("ID");
    // (0) control ลบ — ยังไม่มีตัวตรวจ
    const m0 = mark();
    const mid0 = `9${Date.now() % 1_000_000_000}10`;
    const im0 = { op: "image", ctx, messageId: mid0 };
    const outs0 = (await procs([[im0, im0], [im0, im0]])).flat();
    const s0 = await slipsOn([BILL.ID.id]);
    rec("ID-1n", s0.length === 0 && contentGets(m0).length === 0 && outs0.every((o) => o.r?.handled === false && !o.r?.reply) && !badOf(outs0).length, "CRITICAL", "ไม่มีตัวตรวจสลิป: รูป ×4 (2 โพรเซส) ⇒ handled false · ไม่ดึงรูป · สลิป 0", { slips: s0.length, contentGets: contentGets(m0).length, res: outs0.map((o) => o.r?.handled), bad: badOf(outs0).slice(0, 2) });
    // (1) ตัวตรวจ FAKE บนหน่วยของบิล
    const { saveIntegration, testIntegration } = (await import("@/lib/core/integrations" as string)) as any;
    const actor = { userId: OWN, role: "OWNER", unitAccess: ["*"], permissions: {} };
    const sv = await saveIntegration({ tenantId: A }, actor, { create: true, kind: "SLIP_VERIFY", provider: "FAKE", label: `pb-d9-${STAMP}-id1`, unitIds: [BILL.ID.unitId], onFailure: "MANUAL", fields: { apiKey: `pbd9${randomBytes(14).toString("hex")}`, mode: "OK" } });
    const intId = sv?.integration?.id ?? "";
    if (intId) await testIntegration({ tenantId: A }, actor, { id: intId });
    const intRow = intId ? await prisma.tenantIntegration.findUnique({ where: { id: intId } }) : null;
    if (intRow?.status !== "CONNECTED") throw new Error(`ตั้งตัวตรวจ FAKE ไม่ได้ ${J(sv).slice(0, 120)}`);
    const mid = `9${Date.now() % 1_000_000_000}11`;
    const im = { op: "image", ctx, messageId: mid };
    const whI = (i: number) => ({ op: "webhook", connId: OA1, secret: SECRET[OA1], body: whBody("ID", { id: mid, type: "image", contentProvider: { type: "line" } }, `rt-id-${i}-${RAND}`) });
    const outs = (await procs([[im, im], [im, im], [im, im], [whI(1), whI(2)]])).flat();
    const s = await slipsOn([BILL.ID.id]);
    const ids = new Set(outs.filter((o) => o.op === "image").map((o) => o.r?.attached?.slipId).filter(Boolean));
    rec("ID-1", s.length === 1 && s[0].refId === BILL.ID.id && ids.size <= 1 && !badOf(outs).length && outs.filter((o) => o.op === "webhook").every((o) => o.r?.status === 200), "CRITICAL", "ตัวตรวจ FAKE: รูป messageId เดียว: onLineImage ×6 (3 โพรเซส) + webhook ×2 (โพรเซสที่ 4) ⇒ สลิป 1 ใบพอดี บนบิลของผู้ส่ง", { slips: s.length, attachedIds: ids.size, ignored: outs.filter((o) => o.op === "image" && o.r?.handled === false).length, expected: s.map((x: any) => x.expectedSatang), bad: badOf(outs).slice(0, 2) });
  });

  await tryRun("IP-1", "MAJOR", "แนบสลิป vs รับเงินสดครบ", async () => {
    const tags = ["IP1", "IP2", "IP3", "IP4"];
    const offs = [-200, 0, 200, 450];
    const jobs: Item[][] = [];
    const midBase = `9${Date.now() % 1_000_000_000}`;
    tags.forEach((tag, k) => {
      const mid = `${midBase}2${k}`;
      jobs.push([{ op: "image", tag, ctx: pctx(tag), messageId: mid, dly: Math.max(0, offs[k]!) }, { op: "image", tag, ctx: pctx(tag), messageId: mid, dly: Math.max(0, offs[k]!) }]);
      jobs.push([{ op: "pay", tag, input: payIn(tag, BASE), dly: Math.max(0, -offs[k]!) }]);
    });
    const outs = (await procs(jobs)).flat();
    const rows: any[] = [];
    const strong: string[] = [];
    for (const tag of tags) {
      const s = await slipsOn([BILL[tag].id]);
      const ims = outs.filter((o) => o.op === "image" && o.tag === tag), p = outs.find((o) => o.op === "pay" && o.tag === tag);
      const outNow = await outstandingOf(tag);
      const attachedAfterCommit = ims.filter((o) => o.r?.attached && p?.r?.ok && o.t0 > p.t1);
      if (attachedAfterCommit.length) strong.push(tag);
      rows.push({ tag, slips: s.length, slipStatus: s.map((x: any) => x.status), expected: s.map((x: any) => x.expectedSatang), payOk: p?.r?.ok, applied: p?.r?.appliedSatang, outstandingNow: outNow, imgStartVsPayCommit: ims.map((o) => o.t0 - (p?.t1 ?? 0)), attached: ims.map((o) => !!o.r?.attached) });
    }
    const multi = rows.filter((r) => r.slips > 1);
    const autoApproved = rows.filter((r) => r.slipStatus.includes("AUTO_APPROVED") || r.slipStatus.includes("APPROVED"));
    rec("IP-1a", !multi.length && !strong.length && !badOf(outs).length, "CRITICAL", "§8.1#3 รูปเดียว (2 ทาง) แข่งรับเงินสดครบ 4 จังหวะ ⇒ สลิป ≤1 ต่อบิล · ไม่มีการแนบที่เริ่มหลังรับเงิน commit", { rows, strong, bad: badOf(outs).slice(0, 2) });
    const stalePaid = rows.filter((r) => r.slips === 1 && r.outstandingNow === 0);
    rec("IP-1b", !autoApproved.length, "MAJOR", "สลิปที่ค้างบนบิลที่จ่ายครบแล้วต้องไม่อนุมัติอัตโนมัติ (เงินไม่เคลื่อนที่ใน D.9 · ผลเงินอยู่ D.10)", { slipOnPaidBill: stalePaid.map((r) => ({ tag: r.tag, status: r.slipStatus, expected: r.expected })), autoApproved: autoApproved.map((r) => r.tag) });
  });

  await tryRun("IA-1", "CRITICAL", "กรณีกำกวม/ไม่รู้จักไม่แนบ", async () => {
    const m = mark();
    const ia = (k: string, n: number) => ({ op: "image", tag: k, ctx: pctx(k), messageId: `9${Date.now() % 1_000_000_000}3${n}` });
    const before = await slipsOn([BILL.IA1.id, BILL.IA2.id, BILL.IM.id, BILL.IM2.id]);
    // ORACLE-EDIT (ผู้คุม 30 ต.ค. · d10-5): D.10 R8 เก็บรูปกรณีกำกวม (IA/IM ดึงรูปได้) ⇒ นับการดึงรูปเฉพาะ messageId ของผู้ส่งที่ไม่รู้จัก (CN · PTo2) ต้อง = 0
    const unk = [ia("CN", 5), ia("PTo2", 6)];
    const unkMids = new Set(unk.map((x) => x.messageId));
    const outs = (await procs([[ia("IA", 1), ia("IA", 2)], [ia("IM", 3), ia("IM", 4)], [...unk, { op: "image", tag: "forged", ctx: { ...pctx("CN"), partyId: P.PT }, messageId: `9${Date.now() % 1_000_000_000}37` }]])).flat();
    const after = await slipsOn([BILL.IA1.id, BILL.IA2.id, BILL.IM.id, BILL.IM2.id]);
    const res = Object.fromEntries(outs.map((o) => [`${o.tag}`, { h: o.r?.handled, a: !!o.r?.attached, reply: !!o.r?.reply }]));
    const gets = contentGets(m).filter((r) => [...unkMids].some((mid) => r.path.includes(`/${mid}/`))).length; // ORACLE-EDIT (ผู้คุม 30 ต.ค. · d10-5)
    const ambOk = outs.filter((o) => o.tag === "IA" || o.tag === "IM").every((o) => o.r?.handled === true && o.r?.attached === null);
    const unkOk = outs.filter((o) => o.tag === "CN" || o.tag === "PTo2").every((o) => o.r?.handled === false && o.r?.attached === null && !o.r?.reply);
    const forged = outs.find((o) => o.tag === "forged");
    rec("IA-1", after.length === before.length && ambOk && unkOk && gets === 0 /* ORACLE-EDIT (ผู้คุม 30 ต.ค. · d10-5) */ && !badOf(outs).length, "CRITICAL", "กำกวม (Party 2 สัญญา · สัญญาเดียวค้าง 2 งวด) / ไม่รู้จัก (ไม่มี Party · ผู้เช่าบน OA อื่น) พร้อมกัน 3 โพรเซส ⇒ ไม่มีสลิป · ไม่ดึงรูปของผู้ไม่รู้จัก",
      { res, slipsBefore: before.length, slipsAfter: after.length, contentGets: gets, forgedCtx: { h: forged?.r?.handled, a: !!forged?.r?.attached }, bad: badOf(outs).slice(0, 2) });
    if (forged?.r?.attached) console.log("    ℹ️ IA-1: ctx ประกอบเอง (partyId ของผู้เช่า + chatContactId ของคนอื่น) แนบได้ — onLineImage เชื่อ ctx.partyId; webhook สร้าง ctx จากแถวผู้ติดต่อเสมอ (ไม่ใช่ทางโจมตีจากภายนอก)");
  });

  // ═══════════════════════ PT พอร์ทัล ═══════════════════════
  console.log("\n── PT พอร์ทัล ──");
  await prisma.dormLease.update({ where: { id: L.PTE }, data: { status: "ENDED", endedAt: new Date(), endReason: "MOVE_OUT" } });
  const good = tok(L.PT);
  const [gp, gs] = good.split(".");
  const tampered = `${gp}.${gs!.slice(0, -2)}${gs!.slice(-2) === "AA" ? "AB" : "AA"}`;
  const tamperedPayload = (() => { const o = JSON.parse(Buffer.from(gp!, "base64url").toString("utf8")); o.s = L.PT2; return `${Buffer.from(JSON.stringify(o)).toString("base64url")}.${gs}`; })();
  const expired = sqcPortalToken(process.env.SESSION_SECRET ?? "", { tenantId: A, leaseId: L.PT, nowMs: Date.now() - 3 * 3_600_000, ttlMin: 60 });
  const CASES: [string, string, string | null][] = [
    ["ร้านผิด (token tenant B + สัญญา A)", tok(L.PT, B), null],
    ["ร้านผิด (token tenant A + สัญญา B)", tok(L.LB, A), null],
    ["ห้องผิด (?bill= บิลสัญญาอื่น)", good, BILL.PT2.id],
    ["?bill= บิลร้าน B", good, BILL.LB.id],
    ["สัญญาจบ (ลิงก์ออกก่อนย้ายออก)", tokPTEbefore, null],
    ["สัญญาจบ + บิลของตัวเอง", tokPTEbefore, BILL.PTE.id],
    ["ลายเซ็นปลอม", tampered, null],
    ["payload ปลอม (subject → สัญญาอื่น)", tamperedPayload, null],
    ["หมดอายุ", expired, null],
    ["purpose อื่น", tok(L.PT, A, "booking.manage"), null],
    ["ขยะ", "abc.def", null],
  ];
  await tryRun("PT-1", "BLOCKER", "404 เดียวกัน", async () => {
    if (!tokPTEbefore) throw new Error("ไม่ได้ลิงก์ PTE ก่อนย้ายออก");
    // กรณีที่ token เองผิด (bill = null) ⇒ ทุกทางเข้า · กรณี ?bill= ผิด (token ถูก) ⇒ เฉพาะทางที่รับ bill (load/receipt/slip)
    const jobs: Item[][] = [0, 1, 2].map((p): Item[] => [0, 1].flatMap((round) => CASES.flatMap(([name, t, b]): Item[] => [
      { op: "load", tag: `${name}`, token: t, bill: b, ck: ck("pt1"), full: true },
      { op: "receipt", tag: `${name}`, token: t, bill: b ?? BILL.PT.id, ck: ck("pt1") },
      ...(b === null ? [
        { op: "lease", tag: `${name}`, token: t, ck: ck("pt1") },
        { op: "file", tag: `${name}`, token: t, fileId: FILES.pt, ck: ck("pt1") },
        { op: "fileGet", tag: `${name}`, token: t, fileId: FILES.pt, headers: { "x-real-ip": ck("pt1") } },
      ] : []),
      { op: "slip", tag: `${name}`, token: t, billId: b ?? BILL.PT.id, seed: `pt1-${p}-${round}-${name}`, key: `pt1${p}${round}${randomBytes(3).toString("hex")}`, ck: ck("pt1") },
    ])).concat([
      { op: "file", tag: "fileId ของสัญญาอื่น", token: good, fileId: FILES.pt2, ck: ck("pt1") },
      { op: "file", tag: "fileId บัตร ID_CARD ของตัวเอง", token: good, fileId: FILES.ptId, ck: ck("pt1") },
      { op: "fileGet", tag: "fileId ของสัญญาอื่น", token: good, fileId: FILES.pt2, headers: { "x-real-ip": ck("pt1") } },
      { op: "receipt", tag: "receipt บิลสัญญาอื่น", token: good, bill: BILL.PT2.id, ck: ck("pt1") },
      { op: "load", tag: "positive-control", token: good, bill: null, ck: ck("pt1"), full: true },
    ] as Item[]));
    const outs = (await procs(jobs, { conc: 1 })).flat();
    const fail: string[] = [];
    const slipTexts = new Set<string>(), fileBodies = new Set<string>();
    for (const o of outs) {
      if (o.tag === "positive-control") { if (!o.r || o.r.roomNumber !== "140") fail.push(`positive-control ${J(o.r).slice(0, 60)}`); continue; }
      if (o.op === "slip") { slipTexts.add(J(o.r)); continue; }
      if (o.op === "fileGet") { fileBodies.add(J({ s: o.r?.status, h: o.r?.headers, b: o.r?.body })); continue; }
      if (o.r !== null) fail.push(`${o.op} ${o.tag} = ${J(o.r).slice(0, 80)}`);
    }
    const sj = [...slipTexts];
    rec("PT-1", !fail.length && sj.length === 1 && /"code":"NOT_FOUND"/.test(sj[0] ?? "") && fileBodies.size === 1 && /"s":404/.test([...fileBodies][0] ?? "") && !badOf(outs).length, "BLOCKER",
      "X1/X7 ข้าม 3 โพรเซส: ร้านผิด 2 ทาง · ห้องผิด · บิลร้าน B · สัญญาจบ (ลิงก์ก่อนย้ายออก) · ลายเซ็น/payload ปลอม · หมดอายุ · purpose อื่น · ขยะ · fileId สัญญาอื่น/บัตร ⇒ load/receipt/lease/file = null · slip NOT_FOUND ผลเดียวทุกไบต์ · route ไฟล์ 404 เนื้อ+หัวเดียวทุกไบต์",
      { fail: fail.slice(0, 6), slipVariants: sj.map((s) => s.slice(0, 120)), fileVariants: fileBodies.size, fileSample: [...fileBodies][0]?.slice(0, 200), bad: badOf(outs).slice(0, 2) });
    // เวลา: ค่ากลางของ load ต่อกรณีล้ม (รวม 3 โพรเซส)
    const loads = outs.filter((o) => o.op === "load");
    const byCase: Record<string, number[]> = {};
    for (const o of loads) (byCase[o.tag] ??= []).push(o.t1 - o.t0);
    const meds = Object.fromEntries(Object.entries(byCase).map(([k, v]) => [k, Math.round(median(v))]));
    const failMeds = Object.entries(meds).filter(([k]) => k !== "positive-control").map(([, v]) => v);
    const spread = Math.max(...failMeds) - Math.min(...failMeds);
    rec("PT-2", spread <= 250, "MAJOR", `X7 เวลาตอบ: ค่ากลาง load ต่อกรณีล้ม (3 โพรเซส) ต่างกัน ≤ 250 ms (ได้ ${spread} ms)`, { medians: meds });
  });

  await tryRun("PT-3", "BLOCKER", "ปิดสัญญาระหว่างเปิดพอร์ทัล", async () => {
    const t = tok(L.PTR);
    const loop = (p: number) => Array.from({ length: 24 }, (_, i) => ({ op: "load", tag: `l${p}-${i}`, token: t, bill: null, ck: ck("pt3"), dly: i * 80 }));
    const outs = (await procs([loop(0), loop(1), loop(2), [{ op: "db", tag: "end", dly: 900, model: "dormLease", method: "update", args: { where: { id: L.PTR }, data: { status: "ENDED", endedAt: D(new Date().toISOString()), endReason: "MOVE_OUT" } } }]])).flat();
    const end = outs.find((o) => o.tag === "end");
    const loads = outs.filter((o) => o.op === "load");
    const leakAfter = loads.filter((o) => o.t0 > (end?.t1 ?? Infinity) && o.r !== null);
    const before = loads.filter((o) => o.t0 < (end?.t1 ?? 0) && o.r !== null).length;
    rec("PT-3", !!end && !end.threw && before > 0 && !leakAfter.length && !badOf(outs).length, "BLOCKER", "ลิงก์ถูกเปิดวนจาก 3 โพรเซสขณะปิดสัญญา ⇒ ทุกคำขอที่เริ่มหลังปิด commit = null (บทเรียน B.6)", { okBeforeEnd: before, leakAfterEnd: leakAfter.length, total: loads.length, bad: badOf(outs).slice(0, 2) });
  });

  // ═══════════════════════ PS สลิปพอร์ทัล ═══════════════════════
  console.log("\n── PS สลิปพอร์ทัล ──");
  await tryRun("PS-1", "CRITICAL", "สลิปพอร์ทัลพร้อมกัน", async () => {
    await pay("PS", 100_000);
    const live = await outstandingOf("PS");
    const t = tok(L.PS);
    const sameKey = `samekey${RAND}`;
    const same = (p: number) => [0, 1, 2].map(() => ({ op: "slip", tag: "same", token: t, billId: BILL.PS.id, seed: `ps1-same-${STAMP}`, key: sameKey, ck: ck(`ps1s${p}`) }));
    const outs1 = (await procs([same(0), same(1), same(2)])).flat();
    const s1 = await slipsOn([BILL.PS.id]);
    const ids1 = new Set(outs1.map((o) => o.r?.slipId).filter(Boolean));
    rec("PS-1a", s1.length === 1 && ids1.size === 1 && s1[0].expectedSatang === live && !badOf(outs1).length, "CRITICAL", `คีย์เดียว+รูปเดียว ×9 (3 โพรเซส) ⇒ สลิป 1 · ยอดคาดหวัง = ค้างสด ${live}`, { slips: s1.length, ids: ids1.size, codes: outs1.map((o) => (o.r?.ok ? (o.r.replayed ? "replay" : "new") : o.r?.code)), expected: s1.map((x: any) => x.expectedSatang), bad: badOf(outs1).slice(0, 2) });
    const diffKeySameImg = (p: number) => [0, 1].map((i) => ({ op: "slip", tag: "dk", token: t, billId: BILL.PS.id, seed: `ps1-dup-${STAMP}`, key: `dk${p}${i}${RAND}`, ck: ck(`ps1d${p}`) }));
    const outs2 = (await procs([diffKeySameImg(0), diffKeySameImg(1), diffKeySameImg(2)])).flat();
    const s2 = (await slipsOn([BILL.PS.id])).filter((x: any) => !s1.some((y: any) => y.id === x.id));
    const liveNew = s2.filter((x: any) => x.status !== "REJECTED");
    rec("PS-1b", liveNew.length <= 1 && s2.every((x: any) => x.expectedSatang === live) && !badOf(outs2).length, "CRITICAL", "คีย์ต่างกัน 6 คีย์ + รูปเดียวกัน (3 โพรเซส) ⇒ สลิปที่ยังมีผล ≤1 (ที่เหลือ REJECTED ซ้ำรูป)", { newRows: s2.length, live: liveNew.length, statuses: s2.map((x: any) => x.status), codes: outs2.map((o) => (o.r?.ok ? o.r.status : o.r?.code)), bad: badOf(outs2).slice(0, 2) });
    const diffAll = (p: number) => [0, 1].map((i) => ({ op: "slip", tag: "da", token: t, billId: BILL.PS.id, seed: `ps1-da-${STAMP}-${p}-${i}`, key: `da${p}${i}${RAND}`, ck: ck(`ps1a${p}`) }));
    const outs3 = (await procs([diffAll(0), diffAll(1), diffAll(2)])).flat();
    const s3 = (await slipsOn([BILL.PS.id])).filter((x: any) => !s1.some((y: any) => y.id === x.id) && !s2.some((y: any) => y.id === x.id));
    const live3 = s3.filter((x: any) => x.status !== "REJECTED");
    rec("PS-1c", s3.every((x: any) => x.expectedSatang === live) && !badOf(outs3).length, "MINOR", "คีย์ต่าง + รูปต่าง ×6 (3 โพรเซส) ⇒ ทุกใบยอดคาดหวัง = ค้างสด (บันทึกจำนวนสลิปค้างตรวจที่ระบบยอมให้ซ้อนบนบิลเดียว)", { newRows: s3.length, liveNew: live3.length, expected: [...new Set(s3.map((x: any) => x.expectedSatang))], bad: badOf(outs3).slice(0, 2) });
    if (live3.length > 1) console.log(`    ℹ️ PS-1c: บิลเดียวมีสลิปค้างตรวจ ${live3.length + 1} ใบพร้อมกัน แต่ละใบคาดหวังยอดค้างเต็ม — ถ้าพนักงานอนุมัติเกิน 1 ใบ = จ่ายเกิน (D.10 รับเป็นเครดิต 2110) · can.uploadSlip ยัง true ระหว่าง PENDING_REVIEW`);
  });

  await tryRun("PS-2", "CRITICAL", "สลิปพอร์ทัล vs รับเงินบางส่วน", async () => {
    const t = tok(L.PS2);
    const PART = 150_000;
    const sl = (k: number, dly: number) => ({ op: "slip", tag: `s${k}`, token: t, billId: BILL.PS2.id, seed: `ps2-${STAMP}-${k}`, key: `ps2${k}${RAND}`, ck: ck("ps2"), dly });
    const outs = (await procs([[sl(0, 0)], [sl(1, Math.round(PAY_MS * 0.6))], [sl(2, PAY_MS + 250)], [sl(3, PAY_MS + 900)], [{ op: "pay", tag: "pay", input: payIn("PS2", PART) }]])).flat();
    const p = outs.find((o) => o.op === "pay");
    const rows = await slipsOn([BILL.PS2.id]);
    const byId = new Map(rows.map((r: any) => [r.id, r]));
    const viol: unknown[] = [];
    const tr = outs.filter((o) => o.op === "slip").map((o) => {
      const row: any = o.r?.slipId ? byId.get(o.r.slipId) : null;
      const exp = row?.expectedSatang ?? null;
      if (exp !== null && ![BASE, BASE - PART].includes(exp)) viol.push({ tag: o.tag, exp });
      if (exp !== null && p?.r?.ok && o.t0 > p.t1 && exp !== BASE - PART) viol.push({ tag: o.tag, exp, startedAfterPay: o.t0 - p.t1 });
      return { tag: o.tag, code: o.r?.ok ? o.r.status : o.r?.code, exp, startVsPayCommit: p ? o.t0 - p.t1 : null };
    });
    rec("PS-2", !viol.length && p?.r?.ok && !badOf(outs).length, "CRITICAL", "§8.1#4 แนบสลิปพอร์ทัล 4 จังหวะแข่งรับเงินบางส่วน 150,000 ⇒ ยอดคาดหวัง ∈ {ก่อน, หลัง} · ที่เริ่มหลังรับเงิน commit = ค้างสดใหม่ 330,000", { trials: tr, viol, pay: p?.r?.ok, bad: badOf(outs).slice(0, 2) });
  });

  // ═══════════════════════ RL rate limit ═══════════════════════
  console.log("\n── RL rate limit ──");
  await tryRun("RL-1", "MAJOR", "clientKey ปลอมหัว", async () => {
    const H = (o: Record<string, string>) => new Headers(o);
    const k = PT.portalClientKey;
    const xffRot = new Set([1, 2, 3, 4].map((i) => k(H({ "x-real-ip": "203.0.113.7", "x-forwarded-for": `10.0.0.${i}, 203.0.113.7` }))));
    const vercelRot = new Set([1, 2, 3].map((i) => k(H({ "x-real-ip": "203.0.113.7", "x-vercel-forwarded-for": `10.9.0.${i}` }))));
    const noReal = new Set([1, 2, 3].map((i) => k(H({ "x-forwarded-for": `10.1.0.${i}, 203.0.113.7` }))));
    const realRot = new Set([1, 2, 3].map((i) => k(H({ "x-real-ip": `10.2.0.${i}` }))));
    const page = readFileSync(join(ROOT, F.page), "utf8"), act = readFileSync(join(ROOT, F.actions), "utf8");
    const sameFn = /portalClientKey\(\s*await headers\(\)\s*\)/.test(page) && /portalClientKey\(\s*await headers\(\),\s*\[\s*"x-real-ip",\s*"x-vercel-forwarded-for",\s*"x-forwarded-for"\s*\]\s*\)/.test(act);
    const order = J(PT.PORTAL_IP_HEADERS) === J(["x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"]);
    rec("RL-1", xffRot.size === 1 && vercelRot.size === 1 && sameFn && order, "MAJOR", "clientKey ตามกติกาใบสั่ง (x-real-ip → x-vercel-forwarded-for → x-forwarded-for ตัวแรก): หมุน XFF/x-vercel-forwarded-for เมื่อมี x-real-ip ไม่เปลี่ยนคีย์ · หน้า/action ใช้ฟังก์ชันเดียวกัน",
      { xffRotKeys: xffRot.size, vercelRotKeys: vercelRot.size, sameFn, order, note_noRealIp_xffRotKeys: noReal.size, note_realIpRotKeys: realRot.size });
    console.log(`    ℹ️ RL-1: ถ้าไม่มี x-real-ip จากขอบ (ไม่ใช่ Vercel) หมุน XFF ได้คีย์ใหม่ ${noReal.size}/3 · หมุน x-real-ip ได้คีย์ใหม่ ${realRot.size}/3 — กันได้เฉพาะเมื่อขอบเขียนทับ x-real-ip (Vercel ทำ) ตามกติกาใบสั่ง`);
  });
  await tryRun("RL-2", "MAJOR", "ตัวนับข้ามโพรเซส", async () => {
    const key = ck("rl2");
    const t = tok(L.RL);
    const lane = (p: number) => Array.from({ length: 50 }, (_, i) => ({ op: "load", tag: `rl${p}-${i}`, token: t, bill: null, ck: key }));
    const outs = (await procs([lane(0), lane(1), lane(2)], { conc: 4 })).flat();
    const pass = outs.filter((o) => o.op === "load" && o.r !== null).length;
    const lim = PT.PORTAL_RATE.view.limit;
    rec("RL-2", pass === lim && !badOf(outs).length, "MAJOR", `ลิงก์ถูก 150 ครั้ง clientKey เดียว 3 โพรเซส (คู่ขนาน 4/โพรเซส) ⇒ ผ่านพอดี ${lim} (ถังนับอะตอมิก · ไม่รั่ว)`, { pass, limit: lim, bad: badOf(outs).slice(0, 2) });
    // slip: ถังแยก · ใช้คีย์เดิมที่เกินโควตา view แล้วยังยื่นสลิปได้ (ตามใบสั่ง — ถังแยก)
  });

  // ═══════════════════════ BZ 40P01 / BUSY ═══════════════════════
  console.log("\n── BZ ──");
  {
    const dl = ALL_OUT.filter((x) => /40P01|deadlock|P2034|BUSY/i.test(J(x)));
    const thrown = ALL_OUT.filter((x) => x?.threw || x?.childFail);
    const srcs = ["src/lib/platform/dorm-line.ts", "src/lib/platform/dorm-portal.ts", "src/lib/modules/dorm/portal.ts"].map((f) => readFileSync(join(ROOT, f), "utf8"));
    const hasBusy = srcs.some((s) => /40P01|BUSY/.test(s));
    rec("BZ-1", !dl.length && !thrown.length, "MAJOR", `ทุกการยิงพร้อมกันของ probe (${ALL_OUT.length} ผล) ไม่มี 40P01/deadlock/P2034/BUSY/throw หลุดถึงผู้เรียก · ไฟล์ D.9 ${hasBusy ? "มี" : "ไม่มี"}ทาง BUSY ของตัวเอง (ทุกเส้นเขียนผ่าน submitSlip/notifyCustomer/consumeLinkCode ที่จัดการเอง)`, { deadlocks: dl.slice(0, 3), thrown: thrown.slice(0, 3) });
  }
} catch (e) {
  console.log(`💥 CRASH: ${e instanceof Error ? e.stack : String(e)}`);
  exitCode = 2;
} finally {
  await cleanup(tenantIds);
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d9pb-" } } }).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'dorm:portal:%:svc-d9b-%'`).catch(() => {});
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d9pb-" } } });
  const lu = await prisma.user.count({ where: { email: { startsWith: "svc-d9pb-" } } });
  console.log(`\n── ล้าง: tenant ค้าง ${left} · user ค้าง ${lu} ──`);
  const bad = results.filter((r) => !r.ok);
  console.log(`\nPROBE_SUMMARY ${J({ total: results.length, fail: bad.map((r) => `${r.id}:${r.sev}`) })}`);
  server.close();
  await prisma.$disconnect();
  process.exit(exitCode || (bad.length ? 1 : 0));
}

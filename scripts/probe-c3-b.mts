// PROBE — SVC C.3 reviewer B (ชิ้นกลางเข้ม K1): เตือน ERROR ครั้งเดียว/เหตุ · replay · ฟื้นแล้วตกใหม่ · งานโควตาซ้อน · อดอยาก · X1 · X10 · 40P01
// ไม่ใช่ข้อสอบ · ไม่แก้ src · ร้าน `qc-svc-c3pb-*` · ผู้ใช้ `svc-c3pb-*@shark.local` · FAKE + กุญแจสุ่ม · บล็อกเน็ต · ล้างใน finally
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-c3-b.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const IS_CHILD = process.argv.includes("--child");
loadSvcQcEnv("probe-c3-b");
if (process.env.CI || process.env.APP_ENV === "production") { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }
if (!IS_CHILD) {
  process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
  process.env.INTEGRATIONS_FAKE = "1";
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = ""; try { host = new URL(url).hostname; } catch { /* */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(host);
  return new Response("{}", { status: 503 });
}) as typeof fetch;

// ═══════════ โหมดลูก ═══════════
if (IS_CHILD) {
  const ix = process.argv.indexOf("--child");
  let out: unknown[] = [];
  try {
    const job = JSON.parse(Buffer.from(process.argv[ix + 1] ?? "", "base64url").toString("utf8")) as { op: string; items: any[]; at: number };
    const I = (await import("@/lib/core/integrations" as string)) as any;
    const OC = (await import("@/lib/outbox-consumers" as string)) as any;
    const one = async (x: any) => {
      if (job.op === "consume") { await OC.consumers["integration.failed"](x.evt); return { ok: true }; }
      if (job.op === "job") return I.runIntegrationHealthJob(new Date(x.now), x.opts);
      if (job.op === "test") return I.testIntegration(x.ctx, x.actor, { id: x.id });
      return { childFail: `op ${job.op}` };
    };
    const w = job.at - Date.now();
    if (w > 0) await sleep(w);
    out = await Promise.all(job.items.map(async (x) => { try { return await one(x); } catch (e) { return { threw: errMsg(e) }; } }));
  } catch (e) { out = [{ childFail: errMsg(e) }]; }
  console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
  try { const { prisma } = (await import("@/lib/core/db" as string)) as any; await prisma.$disconnect(); } catch { /* */ }
  process.exit(0);
}

type R = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: R[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown) => {
  const d = typeof detail === "string" ? detail : J(detail);
  results.push({ id, ok, sev, what, detail: d });
  console.log(`  ${ok ? "✅ HOLD" : "❌ BREACH"} [${id}] (${sev}) ${what} — ${d.slice(0, 1400)}`);
};
const BADRX = /P2028|P2024|P2002|P2034|P2010|40P01|Unique constraint|timed out|Transaction already closed/i;
const badOf = (rs: any[]) => rs.filter((x) => x?.threw || x?.childFail || BADRX.test(J(x)));
async function fanout(op: string, groups: any[][], leadMs = 12_000): Promise<any[]> {
  const at = Date.now() + leadMs;
  const outs = await Promise.all(groups.map((items) => new Promise<any[]>((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify({ op, items, at })).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\[.*\])/.exec(buf);
      try { resolve(m ? JSON.parse(m[1]) : items.map(() => ({ childFail: `exit=${code} ${buf.split("\n").slice(-3).join(" | ").slice(0, 200)}` }))); } catch { resolve(items.map(() => ({ childFail: "parse" }))); }
    });
  })));
  return outs.flat();
}

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const I: any = await import("@/lib/core/integrations" as string);
const OC: any = await import("@/lib/outbox-consumers" as string);
const SET: any = await import("@/lib/core/settings" as string);

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
  const evIds: string[] = (await prisma.outboxEvent.findMany({ where: { tenantId: { in: tids } }, select: { id: true } })).map((e: any) => e.id);
  if (evIds.length) { try { await prisma.opsAlertState.deleteMany({ where: { source: { in: evIds.map((x) => `integration-alert:failed:${x}`) } } }); } catch (e) { console.log(`  ⚠️ OpsAlertState ${errMsg(e)}`); } }
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ ลบไม่หมด ${pending.join(",")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ tenant ${errMsg(e)}`); }
}

const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const SQLS = STAMP.replace(/[^a-z0-9]/g, "");
const tenantIds: string[] = [];
const SECRETS: string[] = [];
const sec = (t: string) => { const s = `pbc3${t}${randomBytes(10).toString("hex")}`; SECRETS.push(s); return s; };
const leaks = (v: unknown) => { const s = J(v); return SECRETS.filter((x) => s.includes(x)).length; };
const ACC = `pbacc${randomBytes(4).toString("hex")}`;
const LBL = (t: string) => `svc-c3pb-${STAMP}-${t}`;
const T: Record<string, string> = {};
const U: Record<string, string> = {};
const ACT: Record<string, any> = {};
const IDS: Record<string, string> = {};
const ROWT: Record<string, string> = {};
let exitCode = 0;
let dlInstalled = false;

async function mkTenant(k: string) { const t = await prisma.tenant.create({ data: { name: `PB C3 ${k}`, slug: `qc-svc-c3pb-${k.toLowerCase()}-${STAMP}` } }); tenantIds.push(t.id); T[k] = t.id; U[k] = (await prisma.businessUnit.create({ data: { tenantId: t.id, type: "BOOKING", name: `PB ${k}`, slug: `c3pb${k}-${STAMP}`.toLowerCase() } })).id; }
async function mkUser(key: string, k: string, role: string, unitAccess: string[], permissions: Record<string, unknown> = {}, accepted = true) {
  const u = await prisma.user.create({ data: { email: `svc-c3pb-${STAMP}-${key}@shark.local`, name: `PB ${key}` } });
  await prisma.membership.create({ data: { userId: u.id, tenantId: T[k], role, unitAccess, permissions, acceptedAt: accepted ? new Date() : null } });
  ACT[key] = { userId: u.id, role, unitAccess, permissions };
}
const ownerOf = (k: string) => ACT[`o${k}1`];
async function mkRow(k: string, tag: string, kind: string, fields: Record<string, string> = {}, extra: any = {}) {
  const r = await I.saveIntegration({ tenantId: T[k] }, ownerOf(k), { create: true, kind, provider: "FAKE", label: LBL(tag), fields: { apiKey: sec(tag), accountId: ACC, mode: "OK", ...fields }, ...extra });
  if (r?.ok !== true) throw new Error(`mkRow ${tag}: ${J(r)}`);
  IDS[tag] = r.integration.id; ROWT[tag] = k;
  return r.integration.id as string;
}
const row = (tag: string) => prisma.tenantIntegration.findUnique({ where: { id: IDS[tag] } });
async function setF(tag: string, fields: Record<string, string>) {
  const r0 = await row(tag);
  const r = await I.saveIntegration({ tenantId: T[ROWT[tag]] }, ownerOf(ROWT[tag]), { id: IDS[tag], kind: r0.kind, provider: "FAKE", fields });
  if (r?.ok !== true) throw new Error(`setF ${tag}: ${J(r)}`);
}
const testRow = (tag: string) => I.testIntegration({ tenantId: T[ROWT[tag]] }, ownerOf(ROWT[tag]), { id: IDS[tag] });
async function connect(tag: string) { await setF(tag, { mode: "OK" }); const t = await testRow(tag); if (!(t?.ok && t.passed)) throw new Error(`connect ${tag}: ${J(t)}`); }
async function failN(tag: string, n = 5) { await setF(tag, { mode: "FAIL" }); for (let i = 0; i < n; i++) await testRow(tag); }
const park = async () => { if (tenantIds.length) await prisma.$executeRawUnsafe(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, tenantIds); };
const evShape = (r: any) => ({ id: r.id, tenantId: r.tenantId, type: r.type, payload: r.payload, systemId: r.systemId ?? null, unitId: r.unitId ?? null });
const failedEvents = async (tag: string) => (await prisma.outboxEvent.findMany({ where: { tenantId: T[ROWT[tag]], type: "integration.failed" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).filter((e: any) => e.payload?.integrationId === IDS[tag]).map(evShape);
const consume = async (evt: any) => { try { await OC.consumers["integration.failed"](evt); return { ok: true }; } catch (e) { return { threw: errMsg(e) }; } };
const notifs = async (tag: string) => (await prisma.appNotification.findMany({ where: { tenantId: { in: tenantIds } } })).filter((n: any) => `${n.title} ${n.body}`.includes(LBL(tag)));
const recips = (ns: any[]) => ns.map((n) => n.recipientUserId ?? "<ALL>").sort();
const qlogs = (tag: string) => prisma.integrationCallLog.count({ where: { integrationId: IDS[tag], op: "quota" } });

console.log(`\n===== PROBE C.3 reviewer B · ${STAMP} =====`);
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-c3pb-" } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: any) => t.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-c3pb-" } } });

  for (const k of ["A", "B", "Q", "S", "D"]) await mkTenant(k);
  await mkUser("oA1", "A", "OWNER", ["*"]);
  await mkUser("oA2", "A", "OWNER", ["*"]);
  await mkUser("oA3", "A", "OWNER", ["*"], {}, false);
  await mkUser("mgrA", "A", "MANAGER", ["*"]);
  await mkUser("keyA", "A", "STAFF", [U.A], { "settings.integrations.manage": true });
  await mkUser("oB1", "B", "OWNER", ["*"]);
  await mkUser("oQ1", "Q", "OWNER", ["*"]);
  await mkUser("oS1", "S", "OWNER", ["*"]);
  await mkUser("oD1", "D", "OWNER", ["*"]);
  const OWNERS_A = [ACT.oA1.userId, ACT.oA2.userId].sort();

  // ── PC ตัวควบคุม ──
  {
    await mkRow("A", "pc0", "SMS");
    await connect("pc0"); await failN("pc0"); await park();
    const ev = await failedEvents("pc0");
    const r = ev[0] ? await consume(ev[0]) : { threw: "no event" };
    const ns = await notifs("pc0");
    const blk = (await fetch("https://probe-c3.invalid/x")).status;
    rec("PC-1", ev.length === 1 && !("threw" in r) && J(recips(ns)) === J(OWNERS_A) && blk === 503, "MAJOR", "ตัวควบคุม: ตก ERROR ⇒ event 1 ⇒ consumer แจ้ง oA1+oA2 · เน็ตถูกบล็อก", { ev: ev.length, r, recips: recips(ns).length, blk });
  }

  // ── E-CONC: 20 ทางพร้อมกัน (4 โพรเซส × 5) + ทดสอบพร้อมกันบนแถวเดียวกัน ──
  {
    await mkRow("A", "cc1", "SLIP_VERIFY", {}, { onFailure: "MANUAL" });
    await connect("cc1"); await failN("cc1"); await park();
    const ev = await failedEvents("cc1");
    const kids = await fanout("consume", [0, 1, 2, 3].map(() => [0, 1, 2, 3, 4].map(() => ({ evt: ev[0] }))));
    const ns = await notifs("cc1");
    rec("E-CONC", ev.length === 1 && badOf(kids).length === 0 && J(recips(ns)) === J(OWNERS_A), "CRITICAL", "event เดียว × 20 โพรเซส/ทางพร้อมกัน ⇒ แจ้ง 1 แถว/เจ้าของที่รับเชิญ (ไม่ถึง oA3/MANAGER/STAFF ถือคีย์/ร้าน B)", { ev: ev.length, bad: badOf(kids).slice(0, 3), recips: recips(ns).length, recipOk: J(recips(ns)) === J(OWNERS_A) });
    const nB = await prisma.appNotification.count({ where: { tenantId: T.B } });
    rec("E-SCOPE", nB === 0 && ns.every((n: any) => n.tenantId === T.A && n.recipientUserId), "CRITICAL", "ไม่มีแจ้งข้ามร้าน/ทั้งร้าน", { nB });
    // ผสม: consume ซ้ำ × 6 + test (FAIL) × 6 บนแถวเดียวกันพร้อมกัน (ล็อกแถวเดียวกัน) ⇒ ไม่ throw/ไม่ deadlock · ยัง 2
    const mixed = await Promise.all([
      fanout("consume", [[{ evt: ev[0] }, { evt: ev[0] }, { evt: ev[0] }], [{ evt: ev[0] }, { evt: ev[0] }, { evt: ev[0] }]]),
      fanout("test", [[0, 1, 2].map(() => ({ ctx: { tenantId: T.A }, actor: ACT.oA1, id: IDS.cc1 })), [0, 1, 2].map(() => ({ ctx: { tenantId: T.A }, actor: ACT.oA1, id: IDS.cc1 }))]),
    ]);
    const all = mixed.flat();
    rec("E-MIX", badOf(all).length === 0 && (await notifs("cc1")).length === 2, "MAJOR", "consume×6 + test×6 พร้อมกันบนแถวเดียว ⇒ ไม่ throw · ไม่ deadlock · แจ้งยัง 2", { bad: badOf(all).slice(0, 3), n: (await notifs("cc1")).length });
  }

  // ── E-REPLAY: ฟื้นแล้ว replay event เก่า ──
  {
    await mkRow("A", "rp1", "SMS");
    await connect("rp1"); await failN("rp1"); await park();
    const ev1 = (await failedEvents("rp1"))[0];
    await connect("rp1"); await park();
    const r1 = await consume(ev1);
    const n1 = (await notifs("rp1")).length;
    await failN("rp1"); await park(); // ตกใหม่: แถว ERROR อีกครั้ง — event เก่ายังต้องไม่เตือน (เกตฟื้นหลัง event)
    const r2 = await consume(ev1);
    const n2 = (await notifs("rp1")).length;
    const ev2 = (await failedEvents("rp1"))[1];
    await consume(ev2); await consume(ev2);
    const n3 = (await notifs("rp1")).length;
    rec("E-REPLAY", n1 === 0 && n2 === 0 && n3 === 2 && !("threw" in r1) && !("threw" in r2), "CRITICAL", "ฟื้นก่อนรับ ⇒ 0 · replay event เก่าขณะตกรอบใหม่ ⇒ 0 · event ใหม่ ⇒ 2 (ครั้งเดียว)", { n1, n2, n3, r1, r2 });
  }

  // ── E-FRF: ตก → เตือน → ฟื้น → ตก → เตือน = 2 เหตุ ──
  {
    await mkRow("A", "fr1", "SMS", {}, { onFailure: "REJECT" });
    await connect("fr1"); await failN("fr1"); await park();
    await consume((await failedEvents("fr1"))[0]);
    await connect("fr1"); await failN("fr1"); await park();
    const evs = await failedEvents("fr1");
    const kids = await fanout("consume", [[{ evt: evs[1] }, { evt: evs[0] }, { evt: evs[1] }], [{ evt: evs[0] }, { evt: evs[1] }, { evt: evs[1] }]]);
    const ns = await notifs("fr1");
    rec("E-FRF", evs.length === 2 && ns.length === 4 && badOf(kids).length === 0 && ns.every((n: any) => /ปฏิเสธ/.test(n.body)), "CRITICAL", "fail→recover→fail ⇒ 2 เหตุ × 2 เจ้าของ = 4 (ส่งพร้อมกันผสม event เก่า/ใหม่)", { evs: evs.length, n: ns.length, bad: badOf(kids).slice(0, 2) });
  }

  // ── E-DRAFT + E-STALE ──
  {
    await mkRow("A", "dr1", "SMS");
    await failN("dr1");
    const r = await row("dr1");
    rec("E-DRAFT", r.status === "ERROR" && (await failedEvents("dr1")).length === 0 && (await notifs("dr1")).length === 0, "MAJOR", "DRAFT ล้มครบ 5 ⇒ ERROR เงียบ ไม่มี event ไม่มีแจ้ง", { status: r.status });
    // ตก (event1 ค้างคิว) → ถอด → วางคีย์ใหม่ (DRAFT) → ล้ม 5 (ERROR เงียบ) → consumer event1 มาถึงช้า
    await mkRow("A", "st1", "SMS");
    await connect("st1"); await failN("st1"); await park();
    const ev1 = (await failedEvents("st1"))[0];
    const d = await I.disableIntegration({ tenantId: T.A }, ACT.oA1, { id: IDS.st1 });
    const s2 = await I.saveIntegration({ tenantId: T.A }, ACT.oA1, { id: IDS.st1, kind: "SMS", provider: "FAKE", fields: { apiKey: sec("st1b"), accountId: ACC, mode: "FAIL" } });
    for (let i = 0; i < 5; i++) await testRow("st1");
    const st = (await row("st1")).status;
    await consume(ev1);
    const n = (await notifs("st1")).length;
    rec("E-STALE", n === 0, "MINOR", "event เก่าของเหตุที่จบด้วยการถอด มาถึงหลังแถว (ต่อใหม่เป็น DRAFT) ตก ERROR เงียบ ⇒ ต้องไม่เตือน (DRAFT ห้ามเตือน)", { disable: d?.ok, resave: s2?.ok, statusBeforeConsume: st, notifs: n });
  }

  // ── E-FORGE: event ปลอม/ข้ามร้าน/payload ขยะ ──
  {
    const ev = (await failedEvents("cc1"))[0];
    const before = (await notifs("cc1")).length;
    await prisma.opsAlertState.deleteMany({ where: { source: `integration-alert:failed:${ev.id}` } }); // เปิดทางให้เตือนอีกถ้าเกตอื่นรั่ว
    const fx = [
      { ...ev, tenantId: T.B },
      { ...ev, id: `pbforge${SQLS}` },
      { ...ev, payload: { integrationId: IDS.rp1 } },
      { ...ev, payload: null },
      { ...ev, payload: "x" },
      { ...ev, id: "'; DROP TABLE x;--" },
    ];
    const rs = [];
    for (const f of fx) rs.push(await consume(f));
    const after = (await notifs("cc1")).length;
    const real = await consume(ev); // ตัวควบคุมบวก: event จริงหลังลบกันซ้ำ ⇒ เตือนอีก 2
    const after2 = (await notifs("cc1")).length;
    rec("E-FORGE", after === before && rs.every((x) => !("threw" in x)) && after2 === before + 2, "CRITICAL", "event ปลอม (ร้านอื่น/id ไม่มีจริง/แถวไม่ตรง/payload ขยะ/id แปลก) ⇒ ไม่เตือน ไม่ throw · ตัวควบคุมบวก event จริงหลังลบ OpsAlertState ⇒ +2", { before, after, after2, threw: rs.filter((x: any) => x.threw) });
  }

{
  for (const [tagS, MSG] of [["dl1", "deadlock detected"], ["dl2", "probe deadlock"]] as const) {
    const tag = tagS;
  // ── DL 40P01 (trigger บน AppNotification ของร้าน A) ⇒ ลองใหม่ 1 ครั้ง ⇒ BUSY ⇒ consumer throw ⇒ ไม่มีแถวกันซ้ำค้าง ⇒ ลองหลังเอา trigger ออก = เตือนครบ ──
  {
    await mkRow("A", tag, "SMS");
    await connect(tag); await failN(tag); await park();
    const ev = (await failedEvents(tag))[0];
    const fn = `probe_c3_dl_${SQLS}${tag}`, tg = `probe_c3_tg_${SQLS}${tag}`, sq = `probe_c3_sq_${SQLS}${tag}`;
    try {
      await prisma.$executeRawUnsafe(`CREATE SEQUENCE "${sq}"`);
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger AS $$ BEGIN PERFORM nextval('"${sq}"'); RAISE EXCEPTION '${MSG}' USING ERRCODE = '40P01'; END $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${tg}" BEFORE INSERT ON "AppNotification" FOR EACH ROW WHEN (NEW."tenantId" = '${T.A}' AND NEW."title" LIKE '%${LBL(tag)}%') EXECUTE FUNCTION "${fn}"()`);
      dlInstalled = true;
      let diag: any = null;
      try { await prisma.$transaction(async (tx: any) => { await tx.appNotification.create({ data: { tenantId: T.A, recipientUserId: ACT.oA1.userId, title: `diag ${LBL(tag)}`, body: "x" } }); }); diag = "no-error"; }
      catch (e: any) { diag = { name: e?.name, code: e?.code, meta: e?.meta, msg: String(e?.message ?? "").slice(-160) }; }
      await prisma.$executeRawUnsafe(`ALTER SEQUENCE "${sq}" RESTART`);
      const r = await consume(ev);
      const tries: any[] = await prisma.$queryRawUnsafe(`SELECT last_value::int AS v, is_called FROM "${sq}"`);
      const claim = await prisma.opsAlertState.count({ where: { source: `integration-alert:failed:${ev.id}` } });
      const attempts = tries[0]?.is_called ? tries[0].v : 0;
      rec(`DL-1-${tag}`, "threw" in r && attempts === 2 && claim === 0 && (await notifs(tag)).length === 0, tag === "dl1" ? "MAJOR" : "INFO", `40P01 (${MSG}) ทุกครั้ง ⇒ ลอง 2 ครั้ง ⇒ BUSY ⇒ throw ให้คิวลองใหม่ · OpsAlertState ไม่ค้าง (rollback)`, { r, attempts, claim, diag });
    } finally {
      try { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${tg}" ON "AppNotification"`); } catch (e) { console.log(`  ⚠️ drop trigger ${errMsg(e)}`); }
      try { await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`); } catch { /* */ }
      try { await prisma.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS "${sq}"`); } catch { /* */ }
      dlInstalled = false;
    }
    const r2 = await consume(ev);
    rec(`DL-2-${tag}`, !("threw" in r2) && J(recips(await notifs(tag))) === J(OWNERS_A), "MAJOR", "หลังฐานหายแย่ง: คิวลองใหม่ ⇒ เตือนครบ 1/เจ้าของ (ไม่หาย ไม่ซ้ำ)", { r2, n: (await notifs(tag)).length });
  }

  }
}
  // ── QJ-OVL: งานโควตาซ้อน 2 โพรเซส × 2 ──
  {
    for (const t of ["q1", "q2", "q3", "q4"]) { await mkRow("Q", t, "SLIP_VERIFY", { quotaRemaining: "5", quotaLimit: "100" }); await connect(t); }
    await mkRow("Q", "q5", "SLIP_VERIFY", { quotaRemaining: "50", quotaLimit: "100" }); await connect("q5");
    await mkRow("Q", "qd", "SLIP_VERIFY", { quotaRemaining: "0" }); // DRAFT
    await park();
    const now = Date.now();
    const kids = await fanout("job", [[{ now, opts: { tenantId: T.Q } }, { now, opts: { tenantId: T.Q } }], [{ now, opts: { tenantId: T.Q } }, { now, opts: { tenantId: T.Q } }]]);
    const per: Record<string, number> = {};
    for (const t of ["q1", "q2", "q3", "q4", "q5"]) per[t] = (await notifs(t)).length;
    const logs: Record<string, number> = {};
    for (const t of ["q1", "q2", "q3", "q4", "q5", "qd"]) logs[t] = await qlogs(t);
    const alertedSum = kids.reduce((a: number, x: any) => a + (x?.alerted ?? 0), 0);
    rec("QJ-OVL", badOf(kids).length === 0 && ["q1", "q2", "q3", "q4"].every((t) => per[t] === 1) && per.q5 === 0 && alertedSum === 4 && logs.qd === 0, "CRITICAL", "งานรายชั่วโมงซ้อน 4 ทาง (2 โพรเซส) ⇒ แถวต่ำ 4 แถวเตือนแถวละ 1 · แถวปกติ 0 · ผลรวม alerted = 4 · DRAFT ไม่ถูกเรียก", { per, alertedSum, kids: kids.map((k: any) => k?.checked ?? J(k)) });
    rec("QJ-OVL-calls", Object.entries(logs).filter(([t]) => t !== "qd").every(([, v]) => v === 1), "INFO", "จำนวนเรียก quota() ต่อแถวเมื่อซ้อน (ใบ §2.4 ยอมให้ซ้ำ) — 1 = ไม่ซ้ำ", logs);
    const r30 = await I.runIntegrationHealthJob(new Date(now + 30 * 60_000), { tenantId: T.Q });
    const r61 = await I.runIntegrationHealthJob(new Date(now + 61 * 60_000), { tenantId: T.Q });
    const per2 = (await Promise.all(["q1", "q2", "q3", "q4"].map((t) => notifs(t)))).map((x) => x.length);
    rec("QJ-CADENCE", r30.checked === 0 && r61.checked === 5 && r61.alerted === 0 && per2.every((x) => x === 1), "MAJOR", "+30 นาที ⇒ ไม่เรียก · +61 นาที ⇒ เรียก 5 ไม่เตือนซ้ำ (เหตุเดิมยังเปิด)", { r30, r61, per2 });
    // ฟื้น (โควตาเติม) → ต่ำใหม่ ⇒ เหตุใหม่
    await setF("q1", { quotaRemaining: "90" });
    const r122 = await I.runIntegrationHealthJob(new Date(now + 122 * 60_000), { tenantId: T.Q });
    await setF("q1", { quotaRemaining: "3" });
    const r183 = await I.runIntegrationHealthJob(new Date(now + 183 * 60_000), { tenantId: T.Q });
    rec("QJ-REOPEN", (await notifs("q1")).length === 2 && r183.alerted === 1, "MAJOR", "โควตาเติมแล้วตกใหม่ ⇒ เหตุใหม่ แจ้งอีก 1 (รวม 2)", { r122, r183, n: (await notifs("q1")).length });
  }

  // ── QJ-STARV: แถวล้มจำนวนมากอยู่ข้างหน้า แถวปกติโควตาต่ำยังถูกตรวจ ──
  {
    const bad = ["s1", "s2", "s3", "s4", "s5", "s6"];
    for (const t of bad) { await mkRow("S", t, "SLIP_VERIFY"); await connect(t); await setF(t, { mode: "FAIL" }); }
    await mkRow("S", "sh", "SLIP_VERIFY", { quotaRemaining: "2", quotaLimit: "100" }); await connect("sh");
    await park();
    const now = Date.now();
    // แถวปกติตรวจล่าสุด 61 นาทีก่อน (ถึงรอบแล้วแต่อยู่หลังแถว checkedAt ว่าง)
    await prisma.tenantIntegration.update({ where: { id: IDS.sh }, data: { quota: { remaining: 50, limit: 100, resetsAt: null, checkedAt: new Date(now - 61 * 60_000).toISOString(), lowAlertedAt: null } } });
    const rounds: any[] = [];
    let shRound = -1;
    for (let i = 0; i < 4; i++) {
      const r = await I.runIntegrationHealthJob(new Date(now + i * 1000), { tenantId: T.S, maxRows: 3 });
      rounds.push(r);
      if (shRound < 0 && (await qlogs("sh")) > 0) shRound = i;
    }
    const checkedAts = await Promise.all(bad.map(async (t) => ((await row(t)).quota as any)?.checkedAt ?? null));
    const badCalls = await Promise.all(bad.map((t) => qlogs(t)));
    rec("QJ-STARV", shRound >= 0 && shRound <= 2 && checkedAts.every(Boolean) && badCalls.every((c) => c === 1) && (await notifs("sh")).length === 1, "CRITICAL", "6 แถวล้ม (checkedAt ว่าง) อยู่หน้าแถวปกติ · maxRows 3 ⇒ แถวล้มได้ checkedAt (ไม่วนซ้ำ) · แถวปกติถูกตรวจภายในรอบที่ 3 + เตือน 1", { rounds, shRound, badCalls, checkedAtSet: checkedAts.filter(Boolean).length });
    // งบ: SLOW 1.5 วิ · deadline 2 วิ ⇒ ตรวจได้ไม่กี่แถว · คืนผลไม่ throw · รอบต่อไปหยิบแถวที่เหลือ
    for (const t of bad) await setF(t, { mode: "SLOW" });
    await prisma.$executeRawUnsafe(`UPDATE "TenantIntegration" SET "quota" = NULL WHERE "tenantId" = $1`, T.S);
    const t0 = Date.now();
    const b1 = await I.runIntegrationHealthJob(new Date(now + 10_000), { tenantId: T.S, deadline: Date.now() + 2000 });
    const el = Date.now() - t0;
    const ac = new AbortController(); ac.abort();
    const b0 = await I.runIntegrationHealthJob(new Date(now + 11_000), { tenantId: T.S, signal: ac.signal });
    rec("QJ-BUDGET", b1.checked >= 1 && b1.checked <= 3 && el < 6500 && b0.checked === 0, "MAJOR", "deadline 2 วิ กับแถว SLOW ⇒ หยุดตามงบ (ไม่ทำทั้ง 7) · signal abort ⇒ 0", { b1, el, b0 });
  }

  // ── XS / SEC: มุมมองสุขภาพ ──
  {
    await mkRow("B", "xb1", "SLIP_VERIFY"); await connect("xb1");
    await mkRow("A", "xu2", "SMS", {}, { unitIds: [] });
    const unitOther = (await prisma.businessUnit.create({ data: { tenantId: T.A, type: "BOOKING", name: "PB A2", slug: `c3pba2-${STAMP}` } })).id;
    await mkRow("A", "xu3", "SMS", {}, { unitIds: [unitOther] });
    const cA = { tenantId: T.A };
    const g = (actor: any, id: unknown) => I.getIntegrationHealth(cA, actor, { id });
    const variants = [await g(ACT.oA1, IDS.xb1), await g(ACT.oA1, "nope000000000000"), await g(ACT.oA1, "../x"), await g(ACT.oA1, 42), await g(ACT.keyA, IDS.xu3), await g(ACT.keyA, IDS.xb1)];
    const s = variants.map((v) => J(v));
    rec("XS-1", s.every((x) => x === s[0]) && variants[0]?.ok === false && variants[0]?.code === "NOT_FOUND", "CRITICAL", "X1: id ร้านอื่น / ไม่มี / รูปผิด / ไม่ใช่ string / แถวหน่วยอื่น (ผู้จำกัดหน่วย) ⇒ NOT_FOUND เดียวกันทุกตัวอักษร", s.map((x) => x.slice(0, 120)));
    const lA = await I.listIntegrationHealth(cA, ACT.keyA);
    const ids = (lA.items ?? []).map((x: any) => x.id);
    rec("XS-2", lA.ok && ids.includes(IDS.xu2) && !ids.includes(IDS.xu3) && !ids.includes(IDS.xb1), "CRITICAL", "list ของผู้จำกัดหน่วย: เห็นแถวทุกหน่วย ไม่เห็นแถวหน่วยอื่น/ร้านอื่น", { n: ids.length });
    const lB = await I.listIntegrationHealth({ tenantId: T.B }, ACT.oA1); // actor ร้าน A ใส่ ctx ร้าน B (สัญญาเดียวกับ listIntegrations — session เป็นผู้ผูก)
    const listB = await I.listIntegrations({ tenantId: T.B }, ACT.oA1);
    rec("XS-3", J({ ok: lB.ok, code: lB.code }) === J({ ok: listB.ok, code: listB.code }), "INFO", "ctx ร้าน B + actor ร้าน A: พฤติกรรมเท่ากับ listIntegrations เดิม (ไม่หลวมกว่า)", { health: { ok: lB.ok, code: lB.code }, list: { ok: listB.ok, code: listB.code } });
    // ค่าลับ: ทุกผลของมุมมอง + แจ้งเตือนทั้งหมด
    const allViews = [await I.listIntegrationHealth(cA, ACT.oA1), await I.listIntegrationHealth({ tenantId: T.Q }, ACT.oQ1), await I.listIntegrationHealth({ tenantId: T.S }, ACT.oS1), await g(ACT.oA1, IDS.cc1), await I.getIntegrationHealth({ tenantId: T.Q }, ACT.oQ1, { id: IDS.q1 })];
    const allN = await prisma.appNotification.findMany({ where: { tenantId: { in: tenantIds } } });
    const keysBad = allViews.flatMap((v: any) => (v.items ?? (v.health ? [v.health] : []))).filter((h: any) => J(Object.keys(h).sort()) !== J(["daily", "id", "kind", "label", "onFailure", "provider", "quota", "recent", "status", "unitIds"]));
    const blob = J([allViews, allN]);
    rec("SEC-1", leaks(blob) === 0 && !blob.includes(ACC) && !/apiKey|secretBox|secretNames|lastError|INTEGRATIONS_CREDENTIALS|fake provider/i.test(blob) && keysBad.length === 0, "CRITICAL", "X10: มุมมองสุขภาพ (get/list ทุกร้าน) + แจ้งเตือนทั้งหมด ไม่มีค่าลับ/accountId/ชื่อฟิลด์ลับ/ข้อความดิบ · ชุดคีย์พอดี", { leaks: leaks(blob), acc: blob.includes(ACC), keysBad: keysBad.length, views: allViews.map((v: any) => v.ok) });
    const stA = { userId: ACT.keyA.userId, role: "STAFF", unitAccess: [U.A], permissions: {} };
    const ps = [await g(stA, IDS.xb1), await g(stA, IDS.xu2)];
    rec("SEC-2", ps.every((p) => p.ok === false && p.code === "PERMISSION_DENIED") && J(ps[0]) === J(ps[1]), "MAJOR", "STAFF ไม่มีคีย์ ⇒ PERMISSION_DENIED เหมือนกันทั้ง id ร้านอื่นและ id ร้านตน (ไม่เป็นช่องเดาว่ามีแถว)", ps.map((p) => J(p).slice(0, 80)));
  }

  // ── SET: ค่าตั้ง #83 ──
  {
    const d = SET.getDef("integrations.quota.alertPercent");
    rec("SET-1", d && d.domain === "integrations" && J(d.chain) === J(["TENANT"]) && d.ownerOnly === true && /[฀-๿]/.test(d.labelTh) && d.defaults?._fallback === 10, "MAJOR", "#83 ทะเบียน: ป้ายไทย · TENANT · ownerOnly · ค่าเริ่ม 10", d ? { domain: d.domain, chain: d.chain, ownerOnly: d.ownerOnly } : null);
    // ค่าตั้งของร้าน D = 50 ⇒ 40/100 ต่ำ (positive) · ร้าน Q ค่าเริ่ม 10 ⇒ 40/100 ไม่ต่ำ
    let wrote: any = null;
    try {
      wrote = await prisma.settingValue.create({ data: { tenantId: T.D, key: "integrations.quota.alertPercent", scope: "TENANT", scopeId: T.D, value: 50 } });
    } catch (e) { wrote = { err: errMsg(e) }; }
    await mkRow("D", "d1", "SLIP_VERIFY", { quotaRemaining: "40", quotaLimit: "100" }); await connect("d1"); await park();
    const rD = await I.runIntegrationHealthJob(new Date(), { tenantId: T.D });
    const v = await I.getIntegrationHealth({ tenantId: T.D }, ACT.oD1, { id: IDS.d1 });
    rec("SET-2", wrote && !wrote.err ? rD.alerted === 1 && v.thresholdPercent === 50 && v.health?.quota?.low === true : true, wrote?.err ? "INFO" : "MAJOR", "ค่าตั้ง #83 ของร้าน (50%) มีผลกับงาน + มุมมอง", { wrote: wrote?.err ?? "ok", rD, th: v.thresholdPercent, low: v.health?.quota?.low });
  }

  rec("NET", BLOCKED.filter((h) => h !== "probe-c3.invalid").length === 0, "MAJOR", "ไม่มีคำขอออกนอกเครื่องจากโค้ด (นอกจากตัวควบคุม)", BLOCKED);
} catch (e) {
  console.log(`🔴 probe ล้ม: ${errMsg(e)}`);
  exitCode = 1;
} finally {
  if (dlInstalled) {
    try { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "probe_c3_tg_${SQLS}" ON "AppNotification"`); await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "probe_c3_dl_${SQLS}"()`); } catch { /* */ }
  }
  await cleanup(tenantIds);
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-c3pb-" } } }); } catch { /* */ }
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-c3pb-" } } });
  const trig: any[] = await prisma.$queryRawUnsafe(`SELECT tgname FROM pg_trigger WHERE tgname LIKE 'probe_c3_%'`);
  console.log(`(cleanup: tenant ค้าง ${left} · trigger ค้าง ${trig.length})`);
  const breach = results.filter((r) => !r.ok && r.sev !== "INFO");
  console.log(`PROBE_SUMMARY ${J({ total: results.length, hold: results.filter((r) => r.ok).length, breach: breach.map((r) => r.id), info: results.filter((r) => !r.ok && r.sev === "INFO").map((r) => r.id), cleanupLeft: left, triggersLeft: trig.length })}`);
  try { await prisma.$disconnect(); } catch { /* */ }
  process.exit(exitCode);
}

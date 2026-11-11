// PROBE — SVC D.8 reviewer B (โจมตีด้วยหลายโพรเซส) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d8-b.mts
// ข้อมูลใต้ร้าน `qc-svc-d8pb-*` + ผู้ใช้ `svc-d8pb-*@shark.local` · ล้างใน finally ทุกครั้ง
/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, dirname } from "node:path";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const DORM_IDX = "src/lib/modules/dorm/index.ts";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };

// ── ด่านฐาน (QC เท่านั้น) ──
for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
  const u = process.env[n] ?? "";
  let hn = "";
  try { hn = new URL(u).hostname; } catch { /* */ }
  if (!hn.includes(svcQcHostMark()) /* ORACLE-EDIT (ผู้คุม 31 ต.ค. · ฐานต่อเลน) */) { console.error(`🔴 probe: ${n} ไม่ใช่ฐาน qc-svc — หยุด`); process.exit(4); }
}
if (process.env.APP_ENV === "production" || process.env.CI) { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }

// ═══════════ โหมดลูก ═══════════
const CA = process.argv.indexOf("--child");
if (CA >= 0) {
  const job = JSON.parse(Buffer.from(process.argv[CA + 1] ?? "", "base64url").toString("utf8")) as { calls: { op: string; args: any[] }[]; at: number; killMs?: number };
  let out: unknown[] = [];
  try {
    const dorm = (await import(pathToFileURL(join(ROOT, DORM_IDX)).href)) as Record<string, any>;
    const wait = job.at - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (job.killMs) setTimeout(() => { console.log("CHILD_KILLED"); process.exit(137); }, job.killMs);
    out = await Promise.all(job.calls.map(async (c) => {
      const t0 = Date.now();
      const args = c.args.map((a) => (a && typeof a === "object" && typeof a.__date === "string" ? new Date(a.__date) : a && typeof a === "object" && a.deps ? { ...a.deps, ...(a.deps.now ? { now: new Date(a.deps.now) } : {}) } : a));
      try { const r = await dorm[c.op](...args); return { op: c.op, r, ms: Date.now() - t0 }; }
      catch (e) { return { op: c.op, threw: errMsg(e), ms: Date.now() - t0 }; }
    }));
  } catch (e) { out = [{ childFail: errMsg(e) }]; }
  console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
  try { const { prisma } = (await import("@/lib/core/db" as string)) as any; await prisma.$disconnect(); } catch { /* */ }
  process.exit(0);
}

// โพรเซสหลัก: เขียน log ลงไฟล์เองด้วย (stdout ของ iso อาจขาด) · กัน EPIPE
{
  const { appendFileSync } = await import("node:fs");
  const LOG = `/tmp/probe-d8-b.out.${process.pid}.log`;
  process.stdout.on("error", () => { /* ท่อขาด — ยังเขียนไฟล์ */ });
  const orig = console.log.bind(console);
  console.log = (...a: unknown[]) => { try { appendFileSync(LOG, `${a.map((x) => (typeof x === "string" ? x : J(x))).join(" ")}\n`); } catch { /* */ } try { orig(...a); } catch { /* */ } };
  console.log(`(probe log: ${LOG} · start ${new Date().toISOString()})`);
}

async function procs(jobs: { calls: { op: string; args: any[] }[]; killMs?: number }[], leadMs = 15_000): Promise<{ out: any[]; killed: boolean; code: number | null }[]> {
  const at = Date.now() + leadMs;
  return Promise.all(jobs.map((j) => new Promise<{ out: any[]; killed: boolean; code: number | null }>((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify({ ...j, at })).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\[.*\])/.exec(buf);
      let out: any[] = [];
      try { out = m ? JSON.parse(m[1]) : []; } catch { /* */ }
      resolve({ out, killed: buf.includes("CHILD_KILLED"), code });
    });
  })));
}
const dArg = (deps: Record<string, unknown>) => ({ deps });

// ═══════════ ผลการโจมตี ═══════════
type F = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: F[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown) => {
  results.push({ id, ok, sev, what, detail: typeof detail === "string" ? detail : J(detail) });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${what}${ok ? "" : ` — ${typeof detail === "string" ? detail : J(detail)}`.slice(0, 1600)}`);
};
const BADRX = /P2028|P2024|P2002|P2034|timed out|Unable to start a transaction|Transaction already closed/i;
const badOf = (rs: any[]) => rs.filter((x) => x?.threw || x?.childFail || (x?.r?.ok === false && ["INTERNAL"].includes(x.r.code)) || BADRX.test(J(x)));

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const dorm: any = await import(pathToFileURL(join(ROOT, DORM_IDX)).href);
const ACC: any = await import("@/lib/modules/account" as string);
const SYS: any = await import("@/lib/modules/system/service" as string);
const ASV: any = await import("@/lib/modules/account/service" as string);
const GL: any = await import("@/lib/modules/account/gl" as string);
const SET: any = await import("@/lib/core/settings" as string);

const P_RUN = "2026-11", P_UTIL = "2026-10";
const NOW = "2026-10-26T07:05:00.000Z";
const READ_AT = (p: string) => new Date(`${p}-25T03:00:00.000Z`);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
}

const tenantIds: string[] = [];
let exitCode = 0;
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d8pb-" } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: { id: string }) => t.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d8pb-" } } });

  // ═══════════ fixtures (ตามแบบข้อสอบ) ═══════════
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `PB D8 ${tag}`, slug: `qc-svc-d8pb-${tag}-${stamp}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b"), C = await mkTenant("c");
  const mkUnit = async (tenantId: string, type: string, tag: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name: `หอ PB ${tag}`, slug: `pb${tag}-${stamp}` } })).id as string;
  const mkBook = async (tenantId: string, name: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: false });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const link = (tenantId: string, systemId: string, unitId: string) => prisma.accountSystemLink.create({ data: { tenantId, systemId, linkedKind: "BUSINESS", linkedId: unitId, enabled: true } });
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = [], accepted = true) => {
    const u = await prisma.user.create({ data: { email: `svc-d8pb-${stamp}-${key}@shark.local`, name: `PB ${key}` } });
    await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: accepted ? new Date() : null } });
    return u.id as string;
  };
  const setVal = async (tenantId: string, key: string, scope: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope, scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope, scopeId, value, setById: "pb-d8" } });
  };
  let seq = 0;
  const RUNNUM = 100000 + Math.floor(Math.random() * 800000);
  const newPhone = () => `08${String((RUNNUM % 1000) * 100000 + ++seq).padStart(8, "0").slice(-8)}`;
  const mkLease = async (tenantId: string, unitId: string, roomId: string, roomTypeId: string, name: string, patch: Record<string, unknown> = {}) => {
    const party = await prisma.party.create({ data: { tenantId, name, phone: newPhone() } });
    const s = await SET.snapshotPolicy({ tenantId }, "lease", { unitId, roomTypeId, roomId });
    const l = await prisma.dormLease.create({ data: {
      tenantId, unitId, roomId, partyId: party.id, status: "ACTIVE", startDate: dbDate("2026-01-01"), endDate: dbDate("2027-03-31"),
      rentSatang: 450_000, commonFeeSatang: 0, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0,
      coTenants: { occupants: [], vehicles: [] }, policySnapshot: { ...s, values: { ...(s?.values ?? {}), ...patch } }, signedAt: new Date(), createdById: "pb-d8",
    } });
    const oc = await prisma.roomOccupancy.create({ data: { tenantId, unitId, roomId, startDate: dbDate("2026-01-01"), endDate: dbDate("2027-04-01"), kind: "LEASE", refType: "DormLease", refId: l.id } });
    await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
    return { leaseId: l.id as string, partyId: party.id as string };
  };
  type Unit = { u: string; book: string | null; tenantId: string; R: Record<string, string>; L: Record<string, { leaseId: string; partyId: string }>; M: Record<string, string> };
  /** หอเล็ก (ไฟมิเตอร์ห้อง · น้ำ NONE · บิลการไฟฟ้า 500,000/1,000 หน่วย) — แบบเดียวกับ small() ของข้อสอบ */
  const small = async (tenantId: string, ctx: any, tag: string, rooms: { no: string; reading?: number | null; flag?: string; name?: string; patch?: Record<string, unknown> }[], o: { book?: string | null; auth?: [number, number] | null } = {}): Promise<Unit> => {
    const u = await mkUnit(tenantId, "DORM", tag);
    const book = o.book === null ? null : (o.book ?? (await mkBook(tenantId, `บัญชี PB ${tag} ${stamp}`)));
    if (book) await link(tenantId, book, u);
    await setVal(tenantId, "rooms.utility.water.metering", "UNIT", u, "NONE");
    const ty = (await prisma.hotelRoomType.create({ data: { tenantId, unitId: u, name: "มาตรฐาน", capacity: 2, baseRateSatang: 450_000, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id;
    const b = (await prisma.roomBuilding.create({ data: { tenantId, unitId: u, name: `อาคาร ${tag}`, floors: 3, sortOrder: 1 } })).id;
    const R: Unit["R"] = {}, L: Unit["L"] = {}, M: Unit["M"] = {};
    for (const r of rooms) {
      R[r.no] = (await prisma.hotelRoom.create({ data: { tenantId, unitId: u, roomTypeId: ty, number: r.no, buildingId: b, floorNo: 1, floor: "1" } })).id;
      L[r.no] = await mkLease(tenantId, u, R[r.no], ty, r.name ?? `ผู้เช่า ${tag} ${r.no}`, r.patch);
      M[r.no] = (await prisma.dormMeter.create({ data: { tenantId, unitId: u, roomId: R[r.no], kind: "ELEC", role: "ROOM", startReading: 0 } })).id;
      if (r.reading !== null) await prisma.dormMeterReading.create({ data: { tenantId, unitId: u, meterId: M[r.no], periodKey: P_UTIL, kind: "PERIOD", value: r.reading ?? 100, source: "IMPORT", readAt: READ_AT(P_UTIL), ...(r.flag ? { flag: r.flag } : {}) } });
    }
    if (o.auth !== null) {
      const a = o.auth ?? [500_000, 1000];
      const x = await dorm.recordAuthorityBill(ctx, { unitId: u, kind: "ELEC", periodKey: P_UTIL, billSatang: a[0], units: a[1] });
      if (!x?.ok) throw new Error(`recordAuthorityBill ${tag}: ${J(x)}`);
    }
    return { u, book, tenantId, R, L, M };
  };

  const OWN = await mkUser("owner", A, "OWNER", ["*"]);
  const OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
  const OWNC = await mkUser("owner-c", C, "OWNER", ["*"]);
  const cO = { tenantId: A, actorUserId: OWN.toString() }, cB = { tenantId: B, actorUserId: OWNB }, cC = { tenantId: C, actorUserId: OWNC };

  const prep = (ctx: any, u: string) => dorm.prepareBillRun(ctx, { unitId: u, periodKey: P_RUN }, { now: new Date(NOW) });
  const send = (ctx: any, u: string, runId: string, deps: Record<string, unknown> = {}) => dorm.sendBillRun(ctx, { unitId: u, runId }, { now: new Date(NOW), ...deps });
  const sendAll = async (ctx: any, u: string, runId: string, maxWaitMs = 90_000) => {
    const t0 = Date.now();
    const calls: any[] = [];
    for (let i = 0; i < 80; i++) {
      const r = await send(ctx, u, runId);
      calls.push(r?.ok ? { sent: r.sent, done: r.done, rem: r.remaining, failed: r.failed?.length ? r.failed : undefined } : r);
      if (!r?.ok || (r.done && !r.failed?.length)) break;
      if (r.done && r.failed?.length) break;
      if (Date.now() - t0 > maxWaitMs) break;
      if (r.sent === 0) await sleep(2_000);
    }
    return calls;
  };
  /** ตรวจบัญชี: ใบ/สัญญา · ใบกำพร้า · ยอดใบ = บิล · AR = Σ ใบแจ้งหนี้ − ใบลด + ใบเพิ่ม · ทุกรายการสมดุล · event/ลิงก์ 1/บิล */
  const audit = async (U: Unit) => {
    const bills = await prisma.dormBill.findMany({ where: { unitId: U.u, periodKey: P_RUN } });
    const docs = await prisma.accountDocument.findMany({ where: { tenantId: U.tenantId, refSystemId: U.u, source: "DORM" } });
    const inv = docs.filter((d: any) => d.docType === "INVOICE");
    const perLease = Object.values(U.L).map((l) => inv.filter((d: any) => d.refId === `${l.leaseId}:${P_RUN}`).length);
    const linked = new Set(bills.map((b: any) => b.accountDocumentId).filter(Boolean));
    const orphan = inv.filter((d: any) => !linked.has(d.id)).map((d: any) => ({ refId: d.refId, grand: d.grandTotal, docNo: d.docNo }));
    const mism = bills.filter((b: any) => b.accountDocumentId).map((b: any) => ({ b, d: inv.find((d: any) => d.id === b.accountDocumentId) }))
      .filter((x: any) => !x.d || x.d.grandTotal !== x.b.totalSatang).map((x: any) => ({ bill: x.b.id.slice(-6), bill$: x.b.totalSatang, doc$: x.d?.grandTotal }));
    const sentBills = bills.filter((b: any) => ["SENT", "PARTIALLY_PAID", "PAID"].includes(b.status));
    const stuck = bills.filter((b: any) => b.status === "DRAFT").length;
    let arNet = 0, unbal = 0;
    if (U.book) {
      const ar = await prisma.accountLedger.findFirst({ where: { systemId: U.book, code: "1100" } });
      const lines = await prisma.accountJournalLine.findMany({ where: { systemId: U.book }, select: { entryId: true, accountId: true, debit: true, credit: true } });
      arNet = lines.filter((l: any) => l.accountId === ar?.id).reduce((s: number, l: any) => s + l.debit - l.credit, 0);
      const byE = new Map<string, number>();
      for (const l of lines) byE.set(l.entryId, (byE.get(l.entryId) ?? 0) + l.debit - l.credit);
      unbal = [...byE.values()].filter((v) => v !== 0).length;
    }
    const sumSent = sentBills.reduce((s: number, b: any) => s + b.totalSatang, 0);
    const credit = docs.filter((d: any) => d.docType === "CREDIT_NOTE" && d.status !== "DRAFT" && d.status !== "VOID").reduce((s: number, d: any) => s + d.grandTotal, 0);
    const debit = docs.filter((d: any) => d.docType === "DEBIT_NOTE" && d.status !== "DRAFT" && d.status !== "VOID").reduce((s: number, d: any) => s + d.grandTotal, 0);
    const ev = await prisma.outboxEvent.findMany({ where: { type: "dorm.billrun.sent", unitId: U.u } });
    const evPer = new Map<string, number>();
    for (const e of ev) evPer.set(e.payload?.billId, (evPer.get(e.payload?.billId) ?? 0) + 1);
    const prs = U.book ? await prisma.accountPaymentRequest.findMany({ where: { systemId: U.book } }) : [];
    const prPerDoc = new Map<string, number>();
    for (const p of prs) if (p.status === "PENDING") prPerDoc.set(p.documentId, (prPerDoc.get(p.documentId) ?? 0) + 1);
    const out = {
      leases: Object.keys(U.L).length, bills: bills.length, sent: sentBills.length, stuckDraft: stuck, held: bills.filter((b: any) => b.status === "HELD").length,
      invoices: inv.length, perLeaseMax: Math.max(0, ...perLease), orphan, mism,
      arNet, expectAr: sumSent - credit + debit, sumSent, credit, debit, unbal,
      ev: ev.length, evDup: [...evPer.values()].filter((n) => n > 1).length,
      prPending: prs.filter((p: any) => p.status === "PENDING").length, prDupDocs: [...prPerDoc.values()].filter((n) => n > 1).length,
      claimLeft: bills.filter((b: any) => String(b.paymentRequestId ?? "").startsWith("claim:")).length,
    };
    return { ...out, clean: out.perLeaseMax <= 1 && !orphan.length && !mism.length && out.arNet === out.expectAr && !unbal && out.evDup === 0 && out.ev === out.sent && out.prDupDocs === 0 };
  };
  const runOf = async (u: string) => prisma.dormBillRun.findFirst({ where: { unitId: u, periodKey: P_RUN } });

  // ═════════════════ K: ฆ่าโพรเซสผู้ส่งกลางทาง + ยิงซ้อนหลายโพรเซส ═════════════════
  console.log("\n── K ส่งรอบเดียวกันหลายโพรเซส + process.exit กลางงบ ──");
  {
    const K = await small(A, cO, "k", Array.from({ length: 10 }, (_, i) => ({ no: `K${String(i + 1).padStart(2, "0")}`, reading: 50 + i })));
    const p = await prep(cO, K.u);
    const runId = p?.runId;
    const killLog: any[] = [];
    const killPlan = [[350, 900, 1700], [600, 1300, 2400], [450, 1100, 3000]];
    for (const [round, ks] of killPlan.entries()) {
      const r = await procs(ks.map((k) => ({ calls: [{ op: "sendBillRun", args: [cO, { unitId: K.u, runId }, dArg({ now: NOW, budgetMs: 4_000 })] }], killMs: k })));
      const st = await prisma.dormBill.groupBy({ by: ["status"], where: { unitId: K.u }, _count: { _all: true } });
      killLog.push({ round, killed: r.filter((x) => x.killed).length, out: r.map((x) => x.out.map((o: any) => o.r ? [o.r.ok, o.r.code ?? o.r.sent, o.r.done] : o)), st: st.map((s: any) => `${s.status}:${s._count._all}`) });
      // ระหว่างนั้นโพรเซสหลักยิงซ้อน (ต้องได้ ok/RUN_BUSY ไม่ throw)
      const mid = await send(cO, K.u, runId, { budgetMs: 3_000 });
      killLog[killLog.length - 1].mainMid = mid?.ok ? { sent: mid.sent, done: mid.done } : mid;
      await sleep(25_000); // ให้สัญญาเช่าผู้ส่งของโพรเซสที่ตายหมดอายุ (budget 4s + slack 20s)
    }
    const fin = await sendAll(cO, K.u, runId, 120_000);
    const a = await audit(K);
    const run = await runOf(K.u);
    rec("K-1", a.clean && a.stuckDraft === 0 && a.sent === 10 && run?.status === "SENT", "BLOCKER",
      "ฆ่าผู้ส่ง 3 รอบ × 3 โพรเซส ⇒ 1 ใบ/สัญญา · ไม่ค้าง · เรียกต่อจบครบ · AR = Σ บิล · event/ลิงก์ 1/บิล", { a, run: run?.status, fin: fin.slice(-3), killLog });
    const leftover = await prisma.dormBillRun.findFirst({ where: { id: runId } });
    rec("K-2", !J(leftover?.progress ?? {}).includes('"sender"'), "MINOR", "จบแล้วไม่มีสัญญาเช่าผู้ส่งค้างใน progress", leftover?.progress);
  }

  // ═════════════════ R1: setBillExtraLines แทรกระหว่าง sendBillRun (หลังด่าน RUN_STALE) ═════════════════
  console.log("\n── R1 setBillExtraLines ระหว่างส่ง (บิลยัง DRAFT ในรอบ REVIEW) ──");
  {
    const R = await small(A, cO, "r1", Array.from({ length: 8 }, (_, i) => ({ no: `R${i + 1}`, reading: 60 + i })));
    const p = await prep(cO, R.u);
    const runId = p?.runId;
    const last = await prisma.dormBill.findFirst({ where: { unitId: R.u, leaseId: R.L.R8.leaseId } });
    const sP = send(cO, R.u, runId);
    let seenReview = false;
    for (let i = 0; i < 400 && !seenReview; i++) { const r = await prisma.dormBillRun.findFirst({ where: { id: runId }, select: { status: true } }); seenReview = r?.status === "REVIEW"; if (!seenReview) await sleep(25); }
    const x = await dorm.setBillExtraLines(cO, { unitId: R.u, billId: last.id, lines: [{ kind: "LATE_FEE", labelTh: "ค่าปรับชำระล่าช้า", amountSatang: 10_000 }] });
    const s1 = await sP;
    const fin = await sendAll(cO, R.u, runId, 60_000);
    const a = await audit(R);
    const b8 = await prisma.dormBill.findFirst({ where: { id: last.id } });
    rec("R1-1", a.clean && a.stuckDraft === 0 && b8?.status === "SENT", "BLOCKER",
      "แก้บรรทัดมือระหว่างส่ง ⇒ ต้องไม่มีใบกำพร้า/บิลค้างถาวร (ยอดใบ = บิล · AR = Σ บิล)",
      { seenReview, extra: x?.ok ? { ok: true, total: x.totalSatang } : x, s1: s1?.ok ? { sent: s1.sent, failed: s1.failed } : s1, fin, b8: { status: b8?.status, total: b8?.totalSatang, doc: b8?.accountDocumentId }, a });
  }

  // ═════════════════ R2: scheduleBillRun(null) + บิลการไฟฟ้าแก้ + prepare ระหว่างส่ง ═════════════════
  console.log("\n── R2 ยกเลิกตั้งเวลา (REVIEW→DRAFT) + แก้บิลการไฟฟ้า + เตรียมใหม่ ระหว่างส่ง ──");
  {
    const R = await small(A, cO, "r2", Array.from({ length: 8 }, (_, i) => ({ no: `Q${i + 1}`, reading: 60 + i })), { auth: [1_982_400, 4200] });
    const p = await prep(cO, R.u);
    const runId = p?.runId;
    const sP = send(cO, R.u, runId);
    let seenReview = false;
    for (let i = 0; i < 400 && !seenReview; i++) { const r = await prisma.dormBillRun.findFirst({ where: { id: runId }, select: { status: true } }); seenReview = r?.status === "REVIEW"; if (!seenReview) await sleep(25); }
    const sc = await dorm.scheduleBillRun(cO, { unitId: R.u, runId, at: null }, { now: new Date(NOW) });
    const au = await dorm.recordAuthorityBill(cO, { unitId: R.u, kind: "ELEC", periodKey: P_UTIL, billSatang: 1_890_000, units: 4200 });
    const pp = await prep(cO, R.u);
    const s1 = await sP;
    const fin = await sendAll(cO, R.u, runId, 60_000);
    const a = await audit(R);
    rec("R2-1", a.clean && a.stuckDraft === 0, "BLOCKER", "ยกเลิกตั้งเวลา+เตรียมใหม่ระหว่างส่ง ⇒ ไม่มีใบกำพร้า/ใบผิดยอด/บิลค้าง",
      { seenReview, sc: sc?.ok ? sc.status : sc, au: au?.ok, pp: pp?.ok ? { status: pp.status, changed: pp.changed } : pp, s1: s1?.ok ? { sent: s1.sent, failed: s1.failed } : s1, fin, a });
  }

  // ═════════════════ ST: ส่งไปบางส่วนแล้วข้อมูลเปลี่ยน ⇒ RUN_STALE ถาวร? ═════════════════
  console.log("\n── ST ส่งบางส่วน (maxBills) → บิลการไฟฟ้าแก้ → ทางออก? ──");
  {
    const S = await small(A, cO, "st", Array.from({ length: 4 }, (_, i) => ({ no: `T${i + 1}`, reading: 100 + i })), { auth: [1_982_400, 4200] });
    const p = await prep(cO, S.u);
    const runId = p?.runId;
    const s0 = await send(cO, S.u, runId, { maxBills: 2 });
    await dorm.recordAuthorityBill(cO, { unitId: S.u, kind: "ELEC", periodKey: P_UTIL, billSatang: 1_890_000, units: 4200 });
    const s1 = await send(cO, S.u, runId);
    const pp = await prep(cO, S.u);
    const s2 = await send(cO, S.u, runId);
    const sc = await dorm.scheduleBillRun(cO, { unitId: S.u, runId, at: null }, { now: new Date(NOW) });
    const pp2 = await prep(cO, S.u);
    const s3 = await send(cO, S.u, runId);
    const a = await audit(S);
    rec("ST-1", s3?.ok === true && a.stuckDraft === 0, "MAJOR", "ส่งไปแล้ว 2/4 แล้วบิลการไฟฟ้าแก้ ⇒ ต้องมีทางส่งที่เหลือได้ (เตรียมใหม่/ยกเลิกตั้งเวลา)",
      { s0: s0?.ok ? { sent: s0.sent, done: s0.done } : s0, s1: s1?.code ?? s1, pp: pp?.ok ? { status: pp.status, changed: pp.changed } : pp, s2: s2?.code ?? s2, sc: sc?.ok ? sc.status : sc, pp2: pp2?.ok ? { changed: pp2.changed } : pp2, s3: s3?.code ?? { sent: s3?.sent, done: s3?.done }, stuck: a.stuckDraft });
  }

  // ═════════════════ MX: prepare ∥ send ∥ setBillExtraLines ∥ releaseHeldBill ∥ adjustSentBill (4 โพรเซส) ═════════════════
  console.log("\n── MX ผสม 5 ฟังก์ชันพร้อมกัน 4 โพรเซส ──");
  {
    const MX = await small(A, cO, "mx", [...Array.from({ length: 7 }, (_, i) => ({ no: `X${i + 1}`, reading: 40 + i })), { no: "X8", reading: 400, flag: "HIGH" }]);
    const p = await prep(cO, MX.u);
    const runId = p?.runId;
    await send(cO, MX.u, runId, { maxBills: 2 });
    const bills = await prisma.dormBill.findMany({ where: { unitId: MX.u } });
    const sent = bills.filter((b: any) => b.status === "SENT");
    const drafts = bills.filter((b: any) => b.status === "DRAFT");
    const held = bills.find((b: any) => b.status === "HELD");
    // ยืนยันป้ายมิเตอร์ของ X8 ⇒ release จะผ่าน (ปล่อยกลางทางของการส่ง)
    await prisma.dormMeterReading.updateMany({ where: { meterId: MX.M.X8, periodKey: P_UTIL }, data: { confirmedAt: new Date(), confirmedById: OWN } });
    const lastDraft = drafts[drafts.length - 1];
    const jobs = Array.from({ length: 4 }, (_, k) => ({ calls: [
      { op: "prepareBillRun", args: [cO, { unitId: MX.u, periodKey: P_RUN }, dArg({ now: NOW })] },
      { op: "sendBillRun", args: [cO, { unitId: MX.u, runId }, dArg({ now: NOW })] },
      { op: "setBillExtraLines", args: [cO, { unitId: MX.u, billId: drafts[(k * 2 + 1) % drafts.length]?.id, lines: [{ kind: "OTHER", labelTh: `ค่าซ่อมก๊อกน้ำ ${k}`, amountSatang: 5_000 + k * 100 }] }] },
      { op: "setBillExtraLines", args: [cO, { unitId: MX.u, billId: lastDraft?.id, lines: [{ kind: "LATE_FEE", labelTh: "ค่าปรับ", amountSatang: 1_000 * (k + 1) }] }] },
      { op: "releaseHeldBill", args: [cO, { unitId: MX.u, billId: held?.id }, dArg({ now: NOW })] },
      { op: "adjustSentBill", args: [cO, { unitId: MX.u, billId: sent[k % sent.length]?.id, kind: k % 2 ? "DEBIT" : "CREDIT", reason: "ปรับยอดหลังส่งตามคำร้องผู้เช่า", idempotencyKey: `mx-${k % 2}`, lines: [{ code: "ELEC", labelTh: "ปรับค่าไฟ", amountSatang: 1_000 }] }] },
    ] }));
    const r = await procs(jobs);
    const flat = r.flatMap((x) => x.out);
    const bad = badOf(flat);
    const codes = flat.map((o: any) => `${o.op}:${o.r?.ok === true ? "OK" : o.r?.code ?? (o.threw ? "THREW" : "?")}`);
    const stale = flat.filter((o: any) => o.op === "sendBillRun" && o.r?.code === "RUN_STALE").length;
    const fin = await sendAll(cO, MX.u, runId, 90_000);
    const a = await audit(MX);
    const tally: Record<string, number> = {};
    for (const c of codes) tally[c] = (tally[c] ?? 0) + 1;
    rec("MX-1", !bad.length, "BLOCKER", "ผสมพร้อมกัน 4 โพรเซส ⇒ ไม่มี throw/P2028/INTERNAL", { bad: bad.slice(0, 4), tally });
    rec("MX-2", a.clean && a.stuckDraft === 0, "BLOCKER", "หลังผสม + ส่งต่อจนจบ ⇒ 1 ใบ/สัญญา · ไม่มีใบกำพร้า/ใบผิดยอด · AR = Σ บิล − ลด + เพิ่ม · ไม่ค้าง",
      { stale, fin, a });
    const adj = await prisma.accountDocument.findMany({ where: { tenantId: A, refSystemId: MX.u, docType: { in: ["CREDIT_NOTE", "DEBIT_NOTE"] } } });
    rec("MX-3", adj.length <= 2, "MAJOR", "ใบลด/เพิ่มหนี้ คีย์ละ 1 ใบ (2 คีย์ ⇒ ≤ 2 ใบ)", adj.map((d: any) => [d.docType, d.refId, d.grandTotal]));
  }

  // ═════════════════ J: งานตามเวลาซ้อน 3 โพรเซส ═════════════════
  console.log("\n── J runDormBillingJobs ซ้อน 3 โพรเซส ──");
  {
    const J1 = await small(C, cC, "j1", [{ no: "J1" }, { no: "J2" }, { no: "J3" }]);
    const J2 = await small(C, cC, "j2", [{ no: "L1" }, { no: "L2" }, { no: "L3" }, { no: "L4", reading: null }]);
    await setVal(C, "rooms.billing.autoSend", "UNIT", J1.u, true);
    await setVal(C, "rooms.billing.autoSend", "UNIT", J2.u, true);
    const r = await procs([0, 1, 2].map((k) => ({ calls: [{ op: "runDormBillingJobs", args: [{ __date: `2026-10-25T02:00:${String(k * 7).padStart(2, "0")}.000Z` }, { tenantId: C }] }] })));
    const r2 = await procs([0, 1].map((k) => ({ calls: [{ op: "runDormBillingJobs", args: [{ __date: `2026-10-25T02:05:0${k}.000Z` }, { tenantId: C }] }] })));
    const flat = [...r, ...r2].flatMap((x) => x.out);
    const runs = await prisma.dormBillRun.findMany({ where: { tenantId: C } });
    const a1 = await audit(J1), a2 = await audit(J2);
    rec("J-1", !badOf(flat).length && runs.length === 2 && a1.clean && a2.clean && a1.sent === 3 && a2.sent === 3 && a2.held === 1, "BLOCKER",
      "งานตามเวลา 3 โพรเซส + 2 โพรเซสรอบถัดไป ⇒ รอบละ 1 · ใบ 1/สัญญา · HELD ค้าง",
      { out: flat.map((o: any) => o.r ?? o), runs: runs.map((x: any) => x.status), a1: { sent: a1.sent, inv: a1.invoices, clean: a1.clean }, a2: { sent: a2.sent, held: a2.held, inv: a2.invoices, clean: a2.clean } });
  }

  // ═════════════════ PL: ลิงก์จ่าย — claim ค้าง/หมดอายุ ═════════════════
  console.log("\n── PL ลิงก์จ่าย claim ค้าง/หมดอายุ ──");
  {
    const PL = await small(A, cO, "pl", [{ no: "P1" }, { no: "P2" }, { no: "P3" }, { no: "P4" }]);
    const p = await prep(cO, PL.u);
    await sendAll(cO, PL.u, p?.runId);
    const bs = await prisma.dormBill.findMany({ where: { unitId: PL.u }, orderBy: { createdAt: "asc" } });
    const pr0 = await prisma.accountPaymentRequest.count({ where: { systemId: PL.book } });
    const fresh = `claim:${Date.now()}`, old = `claim:${Date.now() - 300_000}`;
    await prisma.dormBill.update({ where: { id: bs[0].id }, data: { paymentRequestId: fresh } });   // ผู้ส่งอื่นกำลังทำ
    await prisma.dormBill.update({ where: { id: bs[1].id }, data: { paymentRequestId: old } });     // ตายหลังจอง ก่อน/หลังสร้างลิงก์
    await prisma.dormBill.update({ where: { id: bs[2].id }, data: { paymentRequestId: null } });    // ตายหลังสร้างลิงก์ ก่อนเขียน id
    // P4: ตายหลังสร้างลิงก์ + ระหว่างนั้นมีใบลดหนี้ (ยอดค้างเปลี่ยน)
    const adj = await dorm.adjustSentBill(cO, { unitId: PL.u, billId: bs[3].id, kind: "CREDIT", reason: "ลดค่าไฟตามที่ตกลงกับผู้เช่า", idempotencyKey: "pl4", lines: [{ code: "ELEC", labelTh: "ลดค่าไฟ", amountSatang: 1_000 }] });
    await prisma.dormBill.update({ where: { id: bs[3].id }, data: { paymentRequestId: old } });
    const r = await procs([0, 1, 2, 3].map(() => ({ calls: [{ op: "sendBillRun", args: [cO, { unitId: PL.u, runId: p?.runId }, dArg({ now: NOW })] }] })));
    const after = await prisma.dormBill.findMany({ where: { unitId: PL.u }, orderBy: { createdAt: "asc" } });
    const prs = await prisma.accountPaymentRequest.findMany({ where: { systemId: PL.book } });
    const per = after.map((b: any) => prs.filter((x: any) => x.documentId === b.accountDocumentId && x.status === "PENDING").map((x: any) => x.amountSatang));
    rec("PL-1", after[0].paymentRequestId === fresh && !String(after[1].paymentRequestId).startsWith("claim:") && !!after[2].paymentRequestId && per.slice(0, 3).every((x: number[]) => x.length === 1) && !badOf(r.flatMap((x) => x.out)).length,
      "MAJOR", "claim สด ไม่แย่ง · claim หมดอายุ/ว่าง ⇒ ได้ลิงก์ (ใช้ใบเดิม) · ลิงก์ PENDING 1 ต่อบิล", { pr0, prNow: prs.length, ids: after.map((b: any) => String(b.paymentRequestId).slice(0, 14)), per, codes: r.flatMap((x) => x.out).map((o: any) => o.r?.payLinkPending ?? o.r?.code) });
    rec("PL-2", per[3].length === 1, "MAJOR", "บิลที่มีใบลดหนี้แล้วลิงก์ถูกสร้างใหม่ ⇒ ลิงก์ PENDING ต้องเหลือ 1 (ไม่ใช่ยอดเก่า+ยอดใหม่)", { adj: adj?.ok ? adj.totalSatang : adj, P4: per[3] });
    // pending ที่ claim สดค้างตลอด ⇒ หลัง 120 วิ ต้องถูกลองใหม่ได้ (ตรวจด้วยการถอยเวลา claim)
    await prisma.dormBill.update({ where: { id: bs[0].id }, data: { paymentRequestId: `claim:${Date.now() - 121_000}` } });
    const rr = await send(cO, PL.u, p?.runId);
    const b0 = await prisma.dormBill.findFirst({ where: { id: bs[0].id } });
    rec("PL-3", !String(b0?.paymentRequestId).startsWith("claim:") && rr?.payLinkPending === 0, "MINOR", "claim เกิน 120 วิ ⇒ ส่งซ้ำแล้วได้ลิงก์ · payLinkPending 0", { b0: b0?.paymentRequestId, rr: rr?.payLinkPending });
    const a = await audit(PL);
    rec("PL-4", a.clean, "MAJOR", "บัญชี PL หลังเล่น claim สะอาด", a);
  }

  // ═════════════════ X: สิทธิ์/ข้ามร้าน ═════════════════
  console.log("\n── X สิทธิ์ · ข้ามร้าน · ถอนสิทธิ์สด ──");
  {
    const XA = await small(A, cO, "xa", [{ no: "A1" }, { no: "A2" }, { no: "A3", reading: 300, flag: "HIGH" }]);
    const XB = await small(B, cB, "xb", [{ no: "B1" }]);
    const XA2 = await small(A, cO, "xa2", [{ no: "Z1" }]);
    const pA = await prep(cO, XA.u);
    const pB = await prep(cB, XB.u);
    const pA2 = await prep(cO, XA2.u);
    await send(cO, XA.u, pA.runId, { maxBills: 1 });
    const bA = await prisma.dormBill.findMany({ where: { unitId: XA.u }, orderBy: { createdAt: "asc" } });
    const sentA = bA.find((b: any) => b.status === "SENT"), draftA = bA.find((b: any) => b.status === "DRAFT"), heldA = bA.find((b: any) => b.status === "HELD");
    const snapBefore = J(await prisma.dormBill.findMany({ where: { unitId: XA.u }, orderBy: { id: "asc" }, select: { id: true, status: true, totalSatang: true, lines: true, updatedAt: true } }));
    const docsBefore = await prisma.accountDocument.count({ where: { tenantId: A } });
    const L = { feeLines: [{ kind: "LATE_FEE", labelTh: "ค่าปรับ", amountSatang: 100 }], adj: { kind: "CREDIT", reason: "พยายามข้ามร้านลดหนี้ให้ตัวเอง", idempotencyKey: "x", lines: [{ code: "ELEC", labelTh: "x", amountSatang: 100 }] } };
    const attacks: [string, any, any][] = [];
    const tryAll = async (label: string, ctx: any, unitId: string) => {
      const ownUnit = label === "B@ownUnit" || label === "A@otherUnit"; // หน่วยของผู้เรียกเอง — เตรียม/ประมาณได้จริง ไม่ใช่การโจมตี
      if (label !== "A@otherUnit") attacks.push([`${label}.prepareA`, await dorm.prepareBillRun(ctx, { unitId: XA.u, periodKey: P_RUN }, { now: new Date(NOW) }), "NOT_FOUND"]);
      attacks.push([`${label}.send`, await dorm.sendBillRun(ctx, { unitId, runId: pA.runId }, { now: new Date(NOW) }), "NOT_FOUND"]);
      attacks.push([`${label}.schedule`, await dorm.scheduleBillRun(ctx, { unitId, runId: pA.runId, at: "2026-10-28T01:00:00.000Z" }, { now: new Date(NOW) }), "NOT_FOUND"]);
      attacks.push([`${label}.extra`, await dorm.setBillExtraLines(ctx, { unitId, billId: draftA?.id, lines: L.feeLines }), "NOT_FOUND"]);
      attacks.push([`${label}.release`, await dorm.releaseHeldBill(ctx, { unitId, billId: heldA?.id }, { now: new Date(NOW) }), "NOT_FOUND"]);
      attacks.push([`${label}.adjust`, await dorm.adjustSentBill(ctx, { unitId, billId: sentA?.id, ...L.adj }), "NOT_FOUND"]);
      attacks.push([`${label}.getBill`, await dorm.getBill(ctx, { unitId, billId: sentA?.id }), null]);
      attacks.push([`${label}.csv`, await dorm.billRunCsv(ctx, { unitId, runId: pA.runId }), null]);
      if (!ownUnit) attacks.push([`${label}.estimates`, await dorm.meterEstimates(ctx, { unitId, periodKey: P_UTIL }), {}]);
    };
    await tryAll("B@ownUnit", cB, XB.u);                                   // ร้าน B ใช้หน่วยตัวเอง + id ของร้าน A
    await tryAll("B@unitA", cB, XA.u);                                     // ร้าน B ใส่หน่วย A ตรง ๆ
    await tryAll("AnoMember", { tenantId: A, actorUserId: OWNB }, XA.u);   // ctx ร้าน A แต่ผู้ใช้ไม่มี membership
    await tryAll("A@otherUnit", cO, XA2.u);                                // เจ้าของ A ใช้ run/bill ของหน่วยอื่น
    attacks.push(["B.modelA", await dorm.billRunModel(cB, { unitId: XA.u, periodKey: P_RUN }), null]);
    void pB; void pA2;
    // ผู้มีแค่ dorm.bill.run (ไม่มี send)
    const RUNNER = await mkUser("runner", A, "STAFF", [XA.u], ["dorm.view", "dorm.bill.run"]);
    const cR = { tenantId: A, actorUserId: RUNNER };
    attacks.push(["runner.send", await dorm.sendBillRun(cR, { unitId: XA.u, runId: pA.runId }, { now: new Date(NOW) }), "NOT_FOUND"]);
    attacks.push(["runner.schedule", await dorm.scheduleBillRun(cR, { unitId: XA.u, runId: pA.runId, at: "2026-10-28T01:00:00.000Z" }, { now: new Date(NOW) }), "NOT_FOUND"]);
    attacks.push(["runner.adjust", await dorm.adjustSentBill(cR, { unitId: XA.u, billId: sentA?.id, ...L.adj, idempotencyKey: "r" }), "NOT_FOUND"]);
    attacks.push(["runner.jobsBypass?", null, null]);
    // คนจดมิเตอร์
    const METER = await mkUser("meter", A, "STAFF", [XA.u], ["dorm.meter.read"]);
    const cM = { tenantId: A, actorUserId: METER };
    attacks.push(["meter.estimates", await dorm.meterEstimates(cM, { unitId: XA.u, periodKey: P_UTIL }), {}]);
    attacks.push(["meter.model", await dorm.billRunModel(cM, { unitId: XA.u, periodKey: P_RUN }), null]);
    attacks.push(["meter.getBill", await dorm.getBill(cM, { unitId: XA.u, billId: sentA?.id }), null]);
    attacks.push(["meter.csv", await dorm.billRunCsv(cM, { unitId: XA.u, runId: pA.runId }), null]);
    const fails = attacks.filter(([k, got, want]) => !k.endsWith("?") && (want === null ? got !== null : typeof want === "string" ? !(got?.ok === false && got?.code === want) : J(got) !== J(want)));
    const snapAfter = J(await prisma.dormBill.findMany({ where: { unitId: XA.u }, orderBy: { id: "asc" }, select: { id: true, status: true, totalSatang: true, lines: true, updatedAt: true } }));
    const docsAfter = await prisma.accountDocument.count({ where: { tenantId: A } });
    const runsB = await prisma.dormBillRun.count({ where: { tenantId: B } });
    rec("X-1", !fails.length && snapBefore === snapAfter && docsBefore === docsAfter && runsB === 1, "BLOCKER", "ข้ามร้าน/ข้ามหน่วย/ไม่มีสิทธิ์ ⇒ NOT_FOUND/null/{} ทุกตัว · ไม่มีอะไรเปลี่ยน",
      { fails: fails.map(([k, g]) => [k, g === null ? null : typeof g === "string" ? g.slice(0, 60) : g?.code ?? J(g).slice(0, 120)]), same: snapBefore === snapAfter, docsBefore, docsAfter, runsB });
    // ถอนสิทธิ์สด
    const SENDER = await mkUser("sender", A, "STAFF", [XA.u], ["dorm.view", "dorm.bill.run", "dorm.bill.send"]);
    const cS = { tenantId: A, actorUserId: SENDER };
    const ok1 = await dorm.scheduleBillRun(cS, { unitId: XA.u, runId: pA.runId, at: "2026-10-28T01:00:00.000Z" }, { now: new Date(NOW) });
    await prisma.membership.updateMany({ where: { userId: SENDER, tenantId: A }, data: { permissions: { "dorm.view": true, "dorm.bill.run": true } } });
    const r1 = await dorm.scheduleBillRun(cS, { unitId: XA.u, runId: pA.runId, at: null }, { now: new Date(NOW) });
    const r2 = await dorm.adjustSentBill(cS, { unitId: XA.u, billId: sentA?.id, ...L.adj, idempotencyKey: "rv" });
    await prisma.membership.updateMany({ where: { userId: SENDER, tenantId: A }, data: { permissions: { "dorm.view": true, "dorm.bill.run": true, "dorm.bill.send": true }, unitAccess: [XA2.u] } });
    const r3 = await dorm.sendBillRun(cS, { unitId: XA.u, runId: pA.runId }, { now: new Date(NOW) });
    await prisma.membership.updateMany({ where: { userId: SENDER, tenantId: A }, data: { unitAccess: [XA.u], acceptedAt: null } });
    const r4 = await dorm.sendBillRun(cS, { unitId: XA.u, runId: pA.runId }, { now: new Date(NOW) });
    await prisma.membership.deleteMany({ where: { userId: SENDER, tenantId: A } });
    const r5 = await dorm.prepareBillRun(cS, { unitId: XA.u, periodKey: P_RUN }, { now: new Date(NOW) });
    const nf = (x: any) => x?.ok === false && x.code === "NOT_FOUND";
    rec("X-2", ok1?.ok === true && nf(r1) && nf(r2) && nf(r3) && nf(r4) && nf(r5), "BLOCKER", "ถอนสิทธิ์ send / ย้าย unitAccess / acceptedAt null / ลบ membership ⇒ มีผลทันที",
      { ok1: ok1?.ok ?? ok1, r1: r1?.code ?? r1?.ok, r2: r2?.code ?? r2?.ok, r3: r3?.code ?? r3?.ok, r4: r4?.code ?? r4?.ok, r5: r5?.code ?? r5?.ok });
  }

  // ═════════════════ LG: กฎหมาย — ค่าปรับมือ · ใบลด/เพิ่มหนี้ ═════════════════
  console.log("\n── LG ค่าปรับเกินเพดาน · ใบลด/เพิ่มหนี้ ──");
  {
    const LGU = await small(A, cO, "lg", [
      { no: "F1", patch: { "rooms.lateFee.capPerBill": 30_000 } },
      { no: "F2", patch: { "rooms.lateFee.kind": "NONE", "rooms.lateFee.capPerBill": null } },
      { no: "F3", patch: { "rooms.lateFee.capPerBill": null } },
      { no: "F4" },
    ]);
    const p = await prep(cO, LGU.u);
    const bid = async (no: string) => (await prisma.dormBill.findFirst({ where: { unitId: LGU.u, leaseId: LGU.L[no].leaseId } }))?.id;
    const ex = (no: string, lines: any[]) => bid(no).then((id) => dorm.setBillExtraLines(cO, { unitId: LGU.u, billId: id, lines }));
    await setVal(A, "rooms.lateFee.capPerBill", "UNIT", LGU.u, 10_000_000); // ค่าตั้งปัจจุบันเพดานสูง — สัญญาต้องใช้ของ snapshot
    const LF = (n: number, label = "ค่าปรับชำระล่าช้า") => ({ kind: "LATE_FEE", labelTh: label, amountSatang: n });
    const t: Record<string, any> = {};
    t.f1Over = await ex("F1", [LF(20_000), LF(15_000)]);
    t.f1Cap = await ex("F1", [LF(30_000)]);
    t.f1OtherBypass = await ex("F1", [LF(30_000), { kind: "OTHER", labelTh: "ค่าปรับผิดนัดเพิ่มเติม", amountSatang: 900_000 }]);
    t.f2KindNone = await ex("F2", [LF(20_000)]);
    t.f3NullCap = await ex("F3", [LF(100_000_000)]);
    t.f4DefaultCap = await ex("F4", [LF(60_000)]);
    t.neg = await ex("F4", [LF(-100)]);
    t.zero = await ex("F4", [LF(0)]);
    t.frac = await ex("F4", [LF(1.5)]);
    t.huge = await ex("F4", [LF(100_000_001)]);
    t.eleven = await ex("F4", Array.from({ length: 11 }, () => ({ kind: "OTHER", labelTh: "x", amountSatang: 1 })));
    t.nan = await ex("F4", [{ kind: "OTHER", labelTh: "x", amountSatang: Number.NaN }]);
    t.str = await ex("F4", [{ kind: "OTHER", labelTh: "x", amountSatang: "100" }]);
    t.badKind = await ex("F4", [{ kind: "RENT", labelTh: "x", amountSatang: 100 }]);
    await ex("F4", []);
    await ex("F1", [LF(30_000)]);
    const code = (x: any) => (x?.ok ? "OK" : x?.code);
    rec("LG-1", code(t.f1Over) === "LATE_FEE_OVER_CAP" && code(t.f1Cap) === "OK" && code(t.f4DefaultCap) === "LATE_FEE_OVER_CAP", "BLOCKER", "ค่าปรับมือเกินเพดาน snapshot ⇒ LATE_FEE_OVER_CAP (ค่าตั้งปัจจุบันสูงกว่าไม่ช่วย)",
      { f1Over: code(t.f1Over), f1Cap: code(t.f1Cap), f4DefaultCap500: code(t.f4DefaultCap) });
    rec("LG-2", ["neg", "zero", "frac", "huge", "eleven", "nan", "str", "badKind"].every((k) => code(t[k]) === "INVALID_INPUT"), "MAJOR", "บรรทัดมือติดลบ/0/ทศนิยม/เกิน/11 บรรทัด/NaN/string/ชนิดผิด ⇒ INVALID_INPUT",
      Object.fromEntries(["neg", "zero", "frac", "huge", "eleven", "nan", "str", "badKind"].map((k) => [k, code(t[k])])));
    rec("LG-3", code(t.f1OtherBypass) !== "OK", "MINOR", "ค่าปรับแฝงเป็น OTHER (ชื่อ 'ค่าปรับ…') เลี่ยงเพดาน", code(t.f1OtherBypass));
    rec("LG-4", code(t.f2KindNone) !== "OK", "MINOR", "สัญญาไม่มีค่าปรับ (lateFee.kind NONE) ยังใส่ LATE_FEE มือได้?", code(t.f2KindNone));
    rec("LG-5", code(t.f3NullCap) !== "OK", "MINOR", "เพดาน snapshot = null ⇒ ค่าปรับมือ ฿1,000,000 ผ่าน (ไม่ตรวจ evaluateLegal LATE_FEE_CAP)", code(t.f3NullCap));
    await sendAll(cO, LGU.u, p.runId);
    const f1 = await bid("F1"), f4 = await bid("F4");
    const f1b = await prisma.dormBill.findFirst({ where: { id: f1 } }), f4b = await prisma.dormBill.findFirst({ where: { id: f4 } });
    const adj = (billId: string, kind: string, key: string, lines: any[], reason = "ปรับยอดตามคำร้องผู้เช่าที่ตรวจแล้ว") => dorm.adjustSentBill(cO, { unitId: LGU.u, billId, kind, reason, idempotencyKey: key, lines });
    const a: Record<string, any> = {};
    a.debitLate = await adj(f1, "DEBIT", "late", [{ code: "LATE_FEE", labelTh: "ค่าปรับชำระล่าช้าเพิ่ม", amountSatang: 500_000 }]);
    a.creditNeg = await adj(f4, "CREDIT", "neg", [{ code: "ELEC", labelTh: "x", amountSatang: -100 }]);
    a.creditZero = await adj(f4, "CREDIT", "zero", [{ code: "ELEC", labelTh: "x", amountSatang: 0 }]);
    a.creditOver = await adj(f4, "CREDIT", "over", [{ code: "RENT", labelTh: "ลดค่าห้อง", amountSatang: (f4b?.totalSatang ?? 0) + 1 }]);
    a.shortReason = await adj(f4, "CREDIT", "sr", [{ code: "ELEC", labelTh: "x", amountSatang: 100 }], "   สั้น    ไป   ");
    // ใบลดหนี้ 2 คีย์พร้อมกัน แต่ละใบ 60% ⇒ รวมเกินบิล
    const sixty = Math.floor((f4b?.totalSatang ?? 0) * 0.6);
    const conc = await procs([0, 1, 2, 3].map((k) => ({ calls: [{ op: "adjustSentBill", args: [cO, { unitId: LGU.u, billId: f4, kind: "CREDIT", reason: "ลดค่าห้องเพราะซ่อมแอร์นานหลายวัน", idempotencyKey: `c60-${k}`, lines: [{ code: "RENT", labelTh: "ลดค่าห้อง", amountSatang: sixty }] }] }] })));
    const cn = await prisma.accountDocument.findMany({ where: { tenantId: A, refSystemId: LGU.u, docType: "CREDIT_NOTE", sourceDocId: f4b?.accountDocumentId } });
    const cnSum = cn.reduce((s: number, d: any) => s + d.grandTotal, 0);
    a.sameKeyOtherAmt = await adj(f4, "DEBIT", "dup", [{ code: "ELEC", labelTh: "เพิ่มค่าไฟ", amountSatang: 100 }]);
    a.sameKeyOtherAmt2 = await adj(f4, "DEBIT", "dup", [{ code: "ELEC", labelTh: "เพิ่มค่าไฟ", amountSatang: 999 }]);
    const ac = (x: any) => (x?.ok ? `OK(${x.totalSatang}${x.created === false ? ",dup" : ""})` : x?.code);
    rec("LG-6", ac(a.creditNeg) === "INVALID_INPUT" && ac(a.creditZero) === "INVALID_INPUT" && a.creditOver?.code === "EXCEEDS_REMAINING" && ac(a.shortReason) === "REASON_REQUIRED" && a.sameKeyOtherAmt2?.code === "IDEMPOTENCY_CONFLICT",
      "MAJOR", "ใบลด/เพิ่มหนี้: ติดลบ/0 ⇒ INVALID_INPUT · ลดเกินบิล ⇒ EXCEEDS_REMAINING · เหตุผลสั้น ⇒ REASON_REQUIRED · คีย์เดิมยอดอื่น ⇒ IDEMPOTENCY_CONFLICT",
      Object.fromEntries(Object.entries(a).map(([k, v]) => [k, ac(v)])));
    rec("LG-7", cnSum <= (f4b?.totalSatang ?? 0) && !badOf(conc.flatMap((x) => x.out)).length, "BLOCKER", "ใบลดหนี้ 60% × 4 โพรเซสพร้อมกัน ⇒ รวมไม่เกินยอดบิล",
      { bill: f4b?.totalSatang, cn: cn.map((d: any) => d.grandTotal), cnSum, codes: conc.flatMap((x) => x.out).map((o: any) => o.r?.code ?? (o.r?.ok ? "OK" : o.threw)) });
    rec("LG-8", a.debitLate?.ok !== true, "MAJOR", "ใบเพิ่มหนี้โค้ด LATE_FEE ฿5,000 บนบิลที่เพดานสัญญา ฿300 (ค่าปรับในบิลแล้ว ฿300) ⇒ ควรถูกกันด้วยเพดาน snapshot",
      { debitLate: ac(a.debitLate), billLate: (f1b?.lines as any[] ?? []).filter((l: any) => l.code === "LATE_FEE").map((l: any) => l.grossSatang) });
    const audLG = await audit(LGU);
    rec("LG-9", audLG.clean, "BLOCKER", "บัญชี LG สะอาด (AR = Σ บิล − ลด + เพิ่ม)", audLG);
  }

  // ═════════════════ CSV ═════════════════
  console.log("\n── CSV formula injection ──");
  {
    const CS = await small(A, cO, "csv", [
      { no: "=1+2", name: '=HYPERLINK("http://evil.example/x","คลิก")' },
      { no: "C2", name: "+1+1" },
      { no: "C3", name: "-2+3" },
      { no: "C4", name: "@SUM(A1:A2)" },
      { no: "C5", name: "\t=cmd|' /C calc'!A0" },
      { no: "C6", name: " =1+1" },
      { no: "C7", name: "\r\n=1+1" },
      { no: "C8", name: "สมชาย, \"ใจดี\"" },
    ]);
    const p = await prep(cO, CS.u);
    const c8 = await prisma.dormBill.findFirst({ where: { unitId: CS.u, leaseId: CS.L.C8.leaseId } });
    await dorm.setBillExtraLines(cO, { unitId: CS.u, billId: c8.id, lines: [{ kind: "OTHER", labelTh: "=1+1", amountSatang: 100, note: "@x" }] });
    const csv: string = (await dorm.billRunCsv(cO, { unitId: CS.u, runId: p.runId })) ?? "";
    // แยก CSV ตามมาตรฐาน RFC4180
    const rows: string[][] = [];
    { let row: string[] = [], cell = "", q = false;
      for (let i = 0; i < csv.length; i++) {
        const ch = csv[i];
        if (q) { if (ch === '"') { if (csv[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
        else if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (ch !== "\r" || csv[i + 1] !== "\n") cell += ch;
      }
      if (cell || row.length) { row.push(cell); rows.push(row); } }
    const danger = rows.flatMap((r, ri) => r.map((c, ci) => ({ ri, ci, c }))).filter(({ c }) => /^[=+\-@\t\r]/.test(c) && !/^-?\d+(\.\d+)?$/.test(c));
    const widths = new Set(rows.map((r) => r.length));
    rec("CSV-1", !danger.length && widths.size === 1 && rows.length === 9, "MAJOR", "CSV: ทุกช่องที่ขึ้นต้น = + - @ \\t \\r ถูกกันสูตร · คอลัมน์คงที่ · 8 แถว + หัว",
      { danger: danger.slice(0, 6), widths: [...widths], rows: rows.length, sample: rows.slice(1, 3) });
  }
} catch (e) {
  console.log(`💥 CRASH: ${e instanceof Error ? e.stack : String(e)}`);
  exitCode = 2;
} finally {
  await cleanup(tenantIds);
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d8pb-" } } });
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d8pb-" } } });
  console.log(`\n── ล้าง: tenant ค้าง ${left} ──`);
  const bad = results.filter((r) => !r.ok);
  console.log(`\nPROBE_SUMMARY ${J({ total: results.length, fail: bad.map((r) => `${r.id}:${r.sev}`) })}`);
  await prisma.$disconnect();
  process.exit(exitCode || (bad.length ? 1 : 0));
}

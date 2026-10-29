// PROBE — SVC D.3 reviewer B (โจมตีด้วย probe จริงหลายโพรเซส) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d3-b.mts
// ข้อมูลใต้ร้าน `qc-svc-d3pb-*` + ผู้ใช้ `svc-d3pb-*@shark.local` · ล้างใน finally ทุกครั้ง
/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";

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
  if (!hn.includes("ep-mute-scene")) { console.error(`🔴 probe: ${n} ไม่ใช่ฐาน qc-svc — หยุด`); process.exit(4); }
}
if (process.env.APP_ENV === "production" || process.env.CI) { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }

// ═══════════ โหมดลูก ═══════════
// op = "dorm:<fn>" | "acc:<fn>" | "asv:<fn>" · args: {__date} ⇒ Date · {deps} ⇒ deps (now เป็น Date)
const CA = process.argv.indexOf("--child");
if (CA >= 0) {
  const job = JSON.parse(Buffer.from(process.argv[CA + 1] ?? "", "base64url").toString("utf8")) as { calls: { op: string; args: any[] }[]; at: number; killMs?: number };
  let out: unknown[] = [];
  try {
    const mods: Record<string, any> = {
      dorm: await import(pathToFileURL(join(ROOT, DORM_IDX)).href),
      acc: await import("@/lib/modules/account" as string),
      asv: await import("@/lib/modules/account/service" as string),
    };
    const wait = job.at - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (job.killMs) setTimeout(() => { console.log("CHILD_KILLED"); process.exit(137); }, job.killMs);
    console.log("CHILD_GO");
    out = await Promise.all(job.calls.map(async (c) => {
      const t0 = Date.now();
      const [m, name] = c.op.split(":");
      const args = c.args.map((a) => (a && typeof a === "object" && typeof a.__date === "string" ? new Date(a.__date) : a && typeof a === "object" && a.deps ? { ...a.deps, ...(a.deps.now ? { now: new Date(a.deps.now) } : {}) } : a));
      try { const r = await mods[m][name](...args); return { op: c.op, r, ms: Date.now() - t0 }; }
      catch (e) { return { op: c.op, threw: errMsg(e), ms: Date.now() - t0 }; }
    }));
  } catch (e) { out = [{ childFail: errMsg(e) }]; }
  console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
  try { const { prisma } = (await import("@/lib/core/db" as string)) as any; await prisma.$disconnect(); } catch { /* */ }
  process.exit(0);
}

// โพรเซสหลัก: เขียน log ลงไฟล์ด้วย · กัน EPIPE
{
  const { appendFileSync } = await import("node:fs");
  const LOG = `/tmp/probe-d3-b.out.${process.pid}.log`;
  process.stdout.on("error", () => { /* */ });
  const orig = console.log.bind(console);
  console.log = (...a: unknown[]) => { try { appendFileSync(LOG, `${a.map((x) => (typeof x === "string" ? x : J(x))).join(" ")}\n`); } catch { /* */ } try { orig(...a); } catch { /* */ } };
  console.log(`(probe log: ${LOG} · start ${new Date().toISOString()})`);
}

type Kid = { child: ChildProcess; done: Promise<{ out: any[]; killed: boolean; code: number | null; buf: string }> };
function spawnKid(j: { calls: { op: string; args: any[] }[]; killMs?: number }, at: number): Kid {
  const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify({ ...j, at })).toString("base64url")], { cwd: ROOT, env: process.env });
  let buf = "";
  child.stdout?.on("data", (d) => { buf += String(d); });
  child.stderr?.on("data", (d) => { buf += String(d); });
  const done = new Promise<{ out: any[]; killed: boolean; code: number | null; buf: string }>((resolve) => {
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\[.*\])/.exec(buf);
      let out: any[] = [];
      try { out = m ? JSON.parse(m[1]) : []; } catch { /* */ }
      resolve({ out, killed: buf.includes("CHILD_KILLED") || code === null || code === 137, code, buf: buf.slice(-400) });
    });
  });
  return { child, done };
}
async function procs(jobs: { calls: { op: string; args: any[] }[]; killMs?: number }[], leadMs = 14_000) {
  const at = Date.now() + leadMs;
  return Promise.all(jobs.map((j) => spawnKid(j, at).done));
}
const dArg = (deps: Record<string, unknown>) => ({ deps });

// ═══════════ ผล ═══════════
type F = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: F[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown) => {
  results.push({ id, ok, sev, what, detail: typeof detail === "string" ? detail : J(detail) });
  console.log(`  ${ok ? "✅ HOLD" : "❌ BREACH"} [${id}] (${sev}) ${what}${` — ${typeof detail === "string" ? detail : J(detail)}`.slice(0, 2200)}`);
};
const BADRX = /P2028|P2024|P2002|P2034|40P01|timed out|Unable to start a transaction|Transaction already closed|prisma|invalid `/i;
const flat = (rs: { out: any[] }[]) => rs.flatMap((x) => x.out);
const badOf = (xs: any[]) => xs.filter((x) => x?.threw || x?.childFail || (x?.r?.ok === false && ["INTERNAL", "ACCOUNT_REJECTED"].includes(x.r.code)) || BADRX.test(J(x?.r ?? x)));

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const dorm: any = await import(pathToFileURL(join(ROOT, DORM_IDX)).href);
const ACC: any = await import("@/lib/modules/account" as string);
const SYS: any = await import("@/lib/modules/system/service" as string);
const ASV: any = await import("@/lib/modules/account/service" as string);
const GL: any = await import("@/lib/modules/account/gl" as string);
const SET: any = await import("@/lib/core/settings" as string);

const P_RUN = "2026-11", P_UTIL = "2026-10";
const NOW = "2026-10-26T07:05:00.000Z";
const NOW_LATE = "2026-11-20T03:00:00.000Z";
const ISSUE = "2026-10-26";
const READ_AT = (p: string) => new Date(`${p}-25T03:00:00.000Z`);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bkkYmd = (d: unknown) => (d instanceof Date ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d) : "");
const SELLER = "0105561000003", SELLER_B = "0105563333336", BUYER_CO = "0105562222221", BUYER_PERSON = "3101001234565", BAD_TAX = "1234567890123";
const LIVE = { notIn: ["VOIDED", "CANCELLED"] };
const tailNo = (docNo: string | null) => { const m = /(\d+)\s*$/.exec(docNo ?? ""); return m ? Number.parseInt(m[1], 10) : -1; };

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
  await soft(() => prisma.accountDocument.updateMany({ where: { tenantId: { in: tids } }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null, supersededByDocId: null } }));
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
const kids: ChildProcess[] = [];
let exitCode = 0;
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d3pb-" } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: { id: string }) => t.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d3pb-" } } });

  // ═══════════ fixtures ═══════════
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `PB D3 ${tag}`, slug: `qc-svc-d3pb-${tag}-${stamp}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  const mkUnit = async (tenantId: string, type: string, tag: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name: `หอ PB ${tag}`, slug: `pb3${tag}-${stamp}` } })).id as string;
  const mkBook = async (tenantId: string, name: string, taxId: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: true, vatRateBp: 700, taxId, branchCode: "00000", address: "99 ถนนสุขุมวิท กรุงเทพฯ 10110" });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const link = (tenantId: string, systemId: string, unitId: string) => prisma.accountSystemLink.create({ data: { tenantId, systemId, linkedKind: "BUSINESS", linkedId: unitId, enabled: true } });
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = []) => {
    const u = await prisma.user.create({ data: { email: `svc-d3pb-${stamp}-${key}@shark.local`, name: `PB ${key}` } });
    await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: new Date() } });
    return u.id as string;
  };
  const setVal = async (tenantId: string, key: string, scope: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope, scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope, scopeId, value, setById: "pb-d3" } });
  };
  let seq = 0;
  const RUNNUM = 100000 + Math.floor(Math.random() * 800000);
  const newPhone = () => `08${String((RUNNUM % 1000) * 100000 + ++seq).padStart(8, "0").slice(-8)}`;
  type PartyOpt = { kind?: "PERSON" | "COMPANY"; taxId?: string | null; branchCode?: string | null; address?: string | null };
  type Unit = { u: string; book: string; tenantId: string; R: Record<string, string>; L: Record<string, { leaseId: string; partyId: string }> };
  const dormOf = async (tenantId: string, ctx: any, tag: string, book: string, rooms: { no: string; name?: string; party?: PartyOpt; reading?: number }[]): Promise<Unit> => {
    const u = await mkUnit(tenantId, "DORM", tag);
    await link(tenantId, book, u);
    await setVal(tenantId, "rooms.vat.registered", "UNIT", u, true);
    await setVal(tenantId, "rooms.vat.pricesIncludeVat", "UNIT", u, true);
    await setVal(tenantId, "rooms.utility.water.metering", "UNIT", u, "NONE");
    const ty = (await prisma.hotelRoomType.create({ data: { tenantId, unitId: u, name: "มาตรฐาน", capacity: 2, baseRateSatang: 450_000, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id;
    const bl = (await prisma.roomBuilding.create({ data: { tenantId, unitId: u, name: `อาคาร ${tag}`, floors: 3, sortOrder: 1 } })).id;
    const R: Unit["R"] = {}, L: Unit["L"] = {};
    for (const r of rooms) {
      R[r.no] = (await prisma.hotelRoom.create({ data: { tenantId, unitId: u, roomTypeId: ty, number: r.no, buildingId: bl, floorNo: 1, floor: "1" } })).id;
      const party = await prisma.party.create({ data: { tenantId, name: r.name ?? `ผู้เช่า ${tag} ${r.no}`, phone: newPhone(), kind: r.party?.kind ?? "PERSON", taxId: r.party?.taxId ?? null, branchCode: r.party?.branchCode ?? "00000", address: r.party?.address ?? null } });
      const s = await SET.snapshotPolicy({ tenantId }, "lease", { unitId: u, roomTypeId: ty, roomId: R[r.no] });
      const l = await prisma.dormLease.create({ data: {
        tenantId, unitId: u, roomId: R[r.no], partyId: party.id, status: "ACTIVE", startDate: dbDate("2026-01-01"), endDate: dbDate("2027-03-31"),
        rentSatang: 450_000, commonFeeSatang: 30_000, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0,
        coTenants: { occupants: [], vehicles: [] }, policySnapshot: s, signedAt: new Date(), createdById: "pb-d3",
      } });
      const oc = await prisma.roomOccupancy.create({ data: { tenantId, unitId: u, roomId: R[r.no], startDate: dbDate("2026-01-01"), endDate: dbDate("2027-04-01"), kind: "LEASE", refType: "DormLease", refId: l.id } });
      await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
      L[r.no] = { leaseId: l.id, partyId: party.id };
      const m = await prisma.dormMeter.create({ data: { tenantId, unitId: u, roomId: R[r.no], kind: "ELEC", role: "ROOM", startReading: 0 } });
      await prisma.dormMeterReading.create({ data: { tenantId, unitId: u, meterId: m.id, periodKey: P_UTIL, kind: "PERIOD", value: r.reading ?? 100, source: "IMPORT", readAt: READ_AT(P_UTIL) } });
    }
    const x = await dorm.recordAuthorityBill(ctx, { unitId: u, kind: "ELEC", periodKey: P_UTIL, billSatang: 1_000_000, units: 2000 });
    if (!x?.ok) throw new Error(`recordAuthorityBill ${tag}: ${J(x)}`);
    return { u, book, tenantId, R, L };
  };

  const OWN = await mkUser("owner", A, "OWNER", ["*"]);
  const OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
  const cO = { tenantId: A, actorUserId: OWN }, cB = { tenantId: B, actorUserId: OWNB };
  const BOOK_K = await mkBook(A, `บริษัท หอเค จำกัด ${stamp}`, SELLER);
  const BOOK_R = await mkBook(A, `บริษัท หออาร์ จำกัด ${stamp}`, SELLER);
  const BOOK_P = await mkBook(A, `บริษัท หอพี จำกัด ${stamp}`, SELLER);
  const BOOK_B = await mkBook(B, `บริษัท หอบี จำกัด ${stamp}`, SELLER_B);
  const K: Unit[] = [];
  for (const t of ["k1", "k2", "k3"]) K.push(await dormOf(A, cO, t, BOOK_K, [1, 2, 3, 4].map((i) => ({ no: `${t.toUpperCase()}-${i}`, reading: 40 + i * 7 }))));
  const DR = await dormOf(A, cO, "r", BOOK_R, [{ no: "R1" }, { no: "R2", reading: 77 }, { no: "R3", reading: 91 }]);
  const LONG = `บริษัท ${"ก".repeat(320)} จำกัด`;
  const DP = await dormOf(A, cO, "p", BOOK_P, [
    { no: "P1", name: "บริษัท สาขาผิด จำกัด", party: { kind: "COMPANY", taxId: BUYER_CO, branchCode: "12" } },
    { no: "P2", name: LONG },
    { no: "P3", name: "ห้างหุ้นส่วนจำกัด ไม่มีเลข", party: { kind: "COMPANY" } },
    { no: "P4", name: "บริษัท ขีดกลาง จำกัด", party: { kind: "COMPANY", taxId: "0-1055-62222-22-1", branchCode: "00002", address: "1 ถนนพระราม 9 กรุงเทพฯ" } },
    { no: "P5", name: "นายเดิม ก่อนแก้" },
    { no: "P6", name: "นายแข่ง ระหว่างส่ง" },
    { no: "P7", name: "บริษัท สาขาตัวหนังสือ จำกัด", party: { kind: "COMPANY", taxId: BUYER_CO, branchCode: "สาขา 1" } },
  ]);
  const DB = await dormOf(B, cB, "b", BOOK_B, [{ no: "B1" }]);
  const DCV = await mkUnit(A, "DORM", "cv"); await link(A, BOOK_R, DCV);

  const prep = (ctx: any, u: string, now = NOW) => dorm.prepareBillRun(ctx, { unitId: u, periodKey: P_RUN }, { now: new Date(now) });
  const send = (ctx: any, u: string, runId: string, deps: Record<string, unknown> = {}) => dorm.sendBillRun(ctx, { unitId: u, runId }, { now: new Date(NOW), ...deps });
  const runOf = async (u: string) => prisma.dormBillRun.findFirst({ where: { unitId: u, periodKey: P_RUN } });
  const billOf = async (U: Unit, no: string) => prisma.dormBill.findFirst({ where: { unitId: U.u, leaseId: U.L[no].leaseId, periodKey: P_RUN } });
  const sendAll = async (ctx: any, u: string, runId: string, maxWaitMs = 120_000) => {
    const t0 = Date.now();
    const calls: any[] = [];
    for (let i = 0; i < 80; i++) {
      const r = await send(ctx, u, runId);
      calls.push(r?.ok ? { sent: r.sent, done: r.done, rem: r.remaining, tp: r.taxInvoicePending, failed: r.failed?.length ? r.failed.map((f: any) => f.code) : undefined } : { code: r?.code });
      if (!r?.ok) break;
      if (r.done && r.taxInvoicePending === 0) break;
      if (r.done && r.failed?.length) break;
      if (Date.now() - t0 > maxWaitMs) break;
      if (r.sent === 0) await sleep(2_500);
    }
    return calls;
  };
  const tisOfInv = async (inv: string | null | undefined, live = true) => (inv ? prisma.accountDocument.findMany({ where: { docType: "TAX_INVOICE", sourceDocId: inv, ...(live ? { status: LIVE } : {}) }, orderBy: { createdAt: "asc" } }) : []);
  const ledgerBal = async (systemId: string, code: string) => {
    const led = await prisma.accountLedger.findFirst({ where: { systemId, code } });
    if (!led) return 0;
    const ls = await prisma.accountJournalLine.findMany({ where: { systemId, accountId: led.id }, select: { debit: true, credit: true } });
    return ls.reduce((s: number, l: any) => s + l.credit - l.debit, 0);
  };
  const unbalanced = async (systemId: string) => {
    const lines = await prisma.accountJournalLine.findMany({ where: { systemId }, select: { entryId: true, debit: true, credit: true } });
    const by = new Map<string, number>();
    for (const l of lines) by.set(l.entryId, (by.get(l.entryId) ?? 0) + l.debit - l.credit);
    return [...by.values()].filter((v) => v !== 0).length;
  };
  /** เลขที่ใบกำกับของสมุด: ไม่ซ้ำ · ต่อเนื่อง 1..n · ตัวนับ = n · ทุกเลขมีเอกสารจริง */
  const numbering = async (systemId: string, docType = "TAX_INVOICE") => {
    const docs = (await prisma.accountDocument.findMany({ where: { systemId, docType }, select: { id: true, docNo: true, status: true } })).filter((d: any) => d.docNo || !["DRAFT", "CANCELLED"].includes(d.status));
    const withNo = docs.filter((d: any) => d.docNo);
    const heads = new Map<string, number[]>();
    for (const d of withNo) { const h = String(d.docNo).replace(/\d+\s*$/, ""); heads.set(h, [...(heads.get(h) ?? []), tailNo(d.docNo)]); }
    const nos = [...heads.values()].map((xs) => xs.sort((a, b) => a - b));
    const seqRows = await prisma.accountDocSequence.findMany({ where: { systemId, docType } });
    const last = seqRows.reduce((s: number, r: any) => s + Number(r.lastNo), 0);
    const contiguous = nos.every((xs) => xs.every((x: number, i: number) => x === i + 1));
    return { n: withNo.length, noNo: docs.length - withNo.length, uniq: new Set(withNo.map((d: any) => d.docNo)).size === withNo.length, contiguous, last, ok: contiguous && last === withNo.length && docs.length === withNo.length && new Set(withNo.map((d: any) => d.docNo)).size === withNo.length, nos };
  };
  /** ใบกำกับต่อบิลของหน่วย: ที่ยังมีผล 1 ใบ/บิลที่ส่งแล้ว · ยอดตรงบิล · ใบที่ถูกแทนมี replacedById */
  const tiAudit = async (U: Unit) => {
    const bills = await prisma.dormBill.findMany({ where: { unitId: U.u, periodKey: P_RUN } });
    const issues: any[] = [];
    for (const b of bills) {
      const st = b.status;
      if (!["SENT", "PARTIALLY_PAID", "PAID"].includes(st)) { issues.push({ bill: b.id.slice(-5), st, why: "ไม่ SENT" }); continue; }
      const live = await tisOfInv(b.accountDocumentId);
      const all = await tisOfInv(b.accountDocumentId, false);
      const vatLines = (b.lines as any[]).filter((l) => l.taxKind === "VAT7");
      const net = vatLines.reduce((s, l) => s + (l.netSatang ?? 0), 0);
      if (live.length !== 1) issues.push({ bill: b.id.slice(-5), live: live.length });
      else if (live[0].vatAmount !== b.vatSatang || live[0].subTotal !== net) issues.push({ bill: b.id.slice(-5), ti: [live[0].subTotal, live[0].vatAmount], bill$: [net, b.vatSatang] });
      for (const d of all) if (["VOIDED", "CANCELLED"].includes(d.status) && !d.replacedById) issues.push({ bill: b.id.slice(-5), voidedNoReplace: d.docNo });
    }
    return { bills: bills.length, issues };
  };
  const vatCheck = async (systemId: string) => {
    const live = await prisma.accountDocument.findMany({ where: { systemId, docType: "TAX_INVOICE", status: { notIn: ["VOIDED", "CANCELLED", "DRAFT"] } } });
    const notes = await prisma.accountDocument.findMany({ where: { systemId, docType: { in: ["CREDIT_NOTE", "DEBIT_NOTE"] }, status: { notIn: ["VOIDED", "CANCELLED", "DRAFT"] } } });
    const tiVat = live.reduce((s: number, d: any) => s + d.vatAmount, 0);
    const cn = notes.filter((d: any) => d.docType === "CREDIT_NOTE").reduce((s: number, d: any) => s + d.vatAmount, 0);
    const dn = notes.filter((d: any) => d.docType === "DEBIT_NOTE").reduce((s: number, d: any) => s + d.vatAmount, 0);
    const b2200 = await ledgerBal(systemId, "2200"), b2205 = await ledgerBal(systemId, "2205");
    return { tiVat, cn, dn, b2200, b2205, unbal: await unbalanced(systemId), ok: b2200 === tiVat - cn + dn && b2205 === 0 };
  };

  // ═══════════════════ N. เลขที่ + ฆ่าโพรเซสกลางทาง (สมุด K เดียว · 3 หอ × 4 ห้อง) ═══════════════════
  console.log("\n── N เลขที่ใบกำกับ · ฆ่าโพรเซสระหว่าง 'ใบแจ้งหนี้แล้ว ก่อนใบกำกับ' · 'ใบกำกับแล้ว ก่อน SENT' · ยิงหลายโพรเซส ──");
  const runK: string[] = [];
  for (const U of K) { const p = await prep(cO, U.u); runK.push(p?.runId); if (!p?.ok) console.log(`  (prep ${U.u} ล้ม ${J(p)})`); }
  // ใบแรกของสมุด (สร้างแถวตัวนับ TAX_INVOICE)
  const first = await send(cO, K[0].u, runK[0], { maxBills: 1 });
  console.log(`  (ส่งใบแรก K1: ${J(first?.ok ? { sent: first.sent, tp: first.taxInvoicePending } : first)})`);
  /** ถือล็อกแถวตัวนับ TAX_INVOICE ของสมุด ⇒ tx ใบกำกับของลูกค้างที่ finalizeDocNos (หลังใบแจ้งหนี้ commit แล้ว) → ฆ่าลูก (SIGKILL) → ปล่อยล็อก */
  const killBetweenInvoiceAndTi = async (U: Unit, runId: string) => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    let locked = false;
    const invBefore = await prisma.accountDocument.count({ where: { refSystemId: U.u, docType: "INVOICE", source: "DORM" } });
    const lockTx = prisma.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe(`SELECT "id" FROM "AccountDocSequence" WHERE "systemId" = $1 AND "docType"::text = 'TAX_INVOICE' FOR UPDATE`, U.book);
      locked = true;
      await hold;
    }, { maxWait: 20_000, timeout: 180_000 }).catch((e: unknown) => console.log(`  (lockTx: ${errMsg(e)})`));
    for (let i = 0; i < 200 && !locked; i++) await sleep(50);
    const kid = spawnKid({ calls: [{ op: "dorm:sendBillRun", args: [cO, { unitId: U.u, runId }, dArg({ now: NOW, budgetMs: 4_000 })] }] }, Date.now() + 500);
    kids.push(kid.child);
    let invNow = invBefore;
    const t0 = Date.now();
    while (Date.now() - t0 < 90_000) {
      invNow = await prisma.accountDocument.count({ where: { refSystemId: U.u, docType: "INVOICE", source: "DORM" } });
      if (invNow > invBefore) break;
      await sleep(100);
    }
    await sleep(2_500); // ลูกกำลังรอล็อกตัวนับในธุรกรรมใบกำกับ
    kid.child.kill("SIGKILL");
    const res = await kid.done;
    release();
    await lockTx;
    await sleep(3_000);
    const invs = await prisma.accountDocument.findMany({ where: { refSystemId: U.u, docType: "INVOICE", source: "DORM" }, select: { id: true, docNo: true } });
    const noTi: string[] = [];
    for (const d of invs) if (!(await tisOfInv(d.id)).length) noTi.push(d.id);
    const bills = await prisma.dormBill.findMany({ where: { unitId: U.u, periodKey: P_RUN }, select: { id: true, status: true, sentVia: true, accountDocumentId: true } });
    return { invBefore, invNow, invs: invs.length, noTi, killed: res.killed, bills: bills.map((b: any) => `${b.status}:${String(b.sentVia ?? "").slice(0, 6)}:${b.accountDocumentId ? "doc" : "-"}`) };
  };
  const kA1 = await killBetweenInvoiceAndTi(K[0], runK[0]);
  console.log(`  (ฆ่า K1 ระหว่างใบแจ้งหนี้→ใบกำกับ: ${J(kA1)})`);
  // K2: ใบแรกส่งปกติ → ฆ่าแบบเดียวกัน → แล้วจำลอง "ใบกำกับ commit แล้ว แต่ตาย ก่อนตั้ง SENT" (ออกใบกำกับให้ใบแจ้งหนี้ที่ค้างจาก facade ตรง)
  await sleep(26_000); // สัญญาเช่าผู้ส่งของลูกที่ตาย (K1) หมดอายุ — ไม่เกี่ยวกับ K2 แต่กันชนล็อกร้าน
  const f2 = await send(cO, K[1].u, runK[1], { maxBills: 1 });
  const kA2 = await killBetweenInvoiceAndTi(K[1], runK[1]);
  console.log(`  (ฆ่า K2: ${J({ f2: f2?.ok ? f2.sent : f2, kA2 })})`);
  let simB: any = null;
  let simBInv = "";
  if (kA2.noTi.length) {
    simBInv = kA2.noTi[0];
    const inv = await prisma.accountDocument.findFirst({ where: { id: simBInv } });
    simB = await ACC.createExternalTaxInvoice({ tenantId: A, unitId: K[1].u, sourceDocId: simBInv, buyer: { name: "ผู้เช่าจำลอง", address: "ห้องจำลอง" } });
    console.log(`  (จำลองใบกำกับ commit ก่อน SENT: ${J({ inv: inv?.docNo, simB })})`);
  }
  rec("N-0", kA1.noTi.length === 1 && kA1.killed && kA2.noTi.length === 1, "INFO", "สร้างสภาพ 'ใบแจ้งหนี้แล้ว ก่อนใบกำกับ' ได้จริงด้วย SIGKILL (positive control ของฉาก)", { kA1, kA2 });

  // ยิงซ้อนหลายโพรเซส (บางตัวถูกฆ่า) + ออกใบแทนพร้อมกัน + ทางกู้พร้อมกัน บนสมุดเดียว
  const b11: any = await billOf(K[0], "K1-1");
  const storm = await procs([
    { calls: [{ op: "dorm:sendBillRun", args: [cO, { unitId: K[0].u, runId: runK[0] }, dArg({ now: NOW, budgetMs: 4_000 })] }], killMs: 1_800 },
    { calls: [{ op: "dorm:sendBillRun", args: [cO, { unitId: K[1].u, runId: runK[1] }, dArg({ now: NOW, budgetMs: 6_000 })] }] },
    { calls: [{ op: "dorm:sendBillRun", args: [cO, { unitId: K[2].u, runId: runK[2] }, dArg({ now: NOW, budgetMs: 4_000 })] }], killMs: 2_600 },
    { calls: [{ op: "dorm:sendBillRun", args: [cO, { unitId: K[2].u, runId: runK[2] }, dArg({ now: NOW, budgetMs: 6_000 })] }, { op: "dorm:sendBillRun", args: [cO, { unitId: K[0].u, runId: runK[0] }, dArg({ now: NOW, budgetMs: 6_000 })] }] },
    { calls: [
      ...[1, 2, 3].map(() => ({ op: "dorm:reissueBillTaxInvoice", args: [cO, { unitId: K[0].u, billId: b11?.id, reason: "แก้ที่อยู่ผู้ซื้อตามคำขอผู้เช่า", idempotencyKey: "s1" }, dArg({ now: NOW })] })),
      ...[1, 2, 3].map(() => ({ op: "dorm:reissueBillTaxInvoice", args: [cO, { unitId: K[0].u, billId: b11?.id, reason: "ใบเดิมพิมพ์ไม่ชัดขอออกใหม่", idempotencyKey: "s2" }, dArg({ now: NOW })] })),
      ...[1, 2, 3].map(() => ({ op: "dorm:issueBillTaxInvoice", args: [cO, { unitId: K[0].u, billId: b11?.id }] })),
    ] },
  ]);
  const stormFlat = flat(storm);
  console.log(`  (storm: killed=${storm.map((s) => s.killed).join(",")} · ${J(stormFlat.map((x: any) => x.r ? `${x.op.split(":")[1]}:${x.r.ok ? (x.r.created ?? x.r.sent ?? "ok") : x.r.code}` : x.threw ?? x.childFail))})`);
  await sleep(26_000);
  const finK: any[] = [];
  for (let i = 0; i < 3; i++) finK.push(await sendAll(cO, K[i].u, runK[i]));
  const auditsK = [];
  for (const U of K) auditsK.push(await tiAudit(U));
  const numK = await numbering(BOOK_K);
  const numKInv = await numbering(BOOK_K, "INVOICE");
  const vatK = await vatCheck(BOOK_K);
  const runsK = await Promise.all(runK.map((id) => prisma.dormBillRun.findFirst({ where: { id }, select: { status: true } })));
  rec("N-1", auditsK.every((a) => a.bills === 4 && !a.issues.length) && runsK.every((r: any) => r?.status === "SENT"), "BLOCKER",
    "หลังฆ่า 2 จุด + ยิงซ้อน 5 โพรเซส ⇒ เรียกต่อแล้วบิลจบ SENT ครบ 12 · ใบกำกับที่มีผล 1 ใบ/บิล · ยอดใบกำกับ = ส่วน VAT ของบิลทุกสตางค์ · ใบถูกแทนมี replacedById",
    { auditsK, runs: runsK.map((r: any) => r?.status), finK: finK.map((f) => f.slice(-2)) });
  rec("N-2", numK.ok && numKInv.ok, "BLOCKER", "เลขที่ใบกำกับของสมุด K (รวมใบแทน/ใบ VOIDED) ไม่ซ้ำ ไม่ข้าม 1..n · ตัวนับ = จำนวนใบ · ใบแจ้งหนี้ก็ต่อเนื่อง (ใบที่ถูกฆ่ากลางทางไม่กินเลข)", { numK, numKInv });
  rec("N-3", vatK.ok && vatK.unbal === 0, "BLOCKER", "ภาษีขาย 2200 = Σ VAT ใบกำกับที่มีผล ทุกสตางค์ · 2205 = 0 · JV สมดุลทุกใบ", vatK);
  {
    const bk2: any = simBInv ? await prisma.dormBill.findFirst({ where: { accountDocumentId: simBInv } }) : null;
    const t = simBInv ? await tisOfInv(simBInv, false) : [];
    rec("N-4", !!simB?.ok && bk2?.status === "SENT" && t.length === 1 && t[0].id === simB.docId, "BLOCKER",
      "สภาพ 'ใบกำกับ commit แล้ว ตายก่อน SENT' ⇒ เรียกต่อ: บิล SENT ผูกใบแจ้งหนี้เดิม · ใบกำกับเดิม (ไม่มีใบ/เลขเพิ่ม)", { simB, st: bk2?.status, tis: t.map((x: any) => [x.docNo, x.status]) });
  }
  {
    const inv = b11?.accountDocumentId;
    const all = await tisOfInv(inv, false);
    const refs = all.map((d: any) => d.refId);
    const s1 = refs.filter((r: string) => r === `${inv}#s1`).length, s2 = refs.filter((r: string) => r === `${inv}#s2`).length;
    const reis = stormFlat.filter((x: any) => x.op === "dorm:reissueBillTaxInvoice");
    const iss = stormFlat.filter((x: any) => x.op === "dorm:issueBillTaxInvoice");
    const live = all.filter((d: any) => !["VOIDED", "CANCELLED"].includes(d.status));
    const chainOk = all.every((d: any) => d.status !== "VOIDED" || all.some((n: any) => n.id === d.replacedById));
    rec("N-5", s1 <= 1 && s2 <= 1 && live.length === 1 && chainOk && !badOf(reis).length && !badOf(iss).length && iss.every((x: any) => x.r?.ok === true && x.r.created === false),
      "BLOCKER", "ออกใบแทนพร้อมกัน (คีย์ s1×3 · s2×3) + ทางกู้ ×3 ระหว่างส่งบิลอื่นในสมุดเดียว ⇒ ต่อคีย์ ≤ 1 ใบ · ใบที่มีผล 1 · สายแทนต่อกันครบ · ไม่มี throw/INTERNAL",
      { s1, s2, live: live.length, chainOk, reis: reis.map((x: any) => x.r ? (x.r.ok ? `ok:${x.r.created}` : x.r.code) : x.threw), iss: iss.map((x: any) => x.r ? (x.r.ok ? `ok:${x.r.created}` : x.r.code) : x.threw), all: all.map((d: any) => [d.docNo, d.status, String(d.refId).split("#")[1] ?? "-"]) });
  }
  {
    const bad = badOf(stormFlat.filter((x: any) => x.op === "dorm:sendBillRun"));
    rec("N-6", !bad.length, "MAJOR", "sendBillRun ใต้การแข่ง/ฆ่า: ทุกผลที่กลับมาไม่ throw · ไม่มีข้อความ Prisma/INTERNAL", bad.slice(0, 4));
  }

  // ═══════════════════ R. ออกใบแทน: ซ้ำ/พร้อมกัน/ข้ามงวดปิด/ใบแทนของใบแทน ═══════════════════
  console.log("\n── R ออกใบแทน ──");
  const runR = (await prep(cO, DR.u))?.runId;
  const sR = await sendAll(cO, DR.u, runR);
  console.log(`  (ส่ง R: ${J(sR.slice(-1))})`);
  const bR1: any = await billOf(DR, "R1"), bR2: any = await billOf(DR, "R2"), bR3: any = await billOf(DR, "R3");
  const reissue = (b: any, key: string, extra: Record<string, unknown> = {}, now = NOW, ctx: any = cO) =>
    dorm.reissueBillTaxInvoice(ctx, { unitId: DR.u, billId: b?.id, reason: "แก้ชื่อผู้ซื้อตามคำขอของผู้เช่า", idempotencyKey: key, ...extra }, { now: new Date(now) });
  {
    const a = await reissue(bR1, "a");
    const a2 = await reissue(bR1, "a");
    const b = await reissue(bR1, "b"); // ใบแทนของใบแทน
    const a3 = await reissue(bR1, "a"); // คีย์เก่าหลังถูกแทนต่อแล้ว
    const all = await tisOfInv(bR1?.accountDocumentId, false);
    const v = await dorm.billTaxInvoice(cO, { unitId: DR.u, billId: bR1?.id });
    rec("R-1", a?.ok && a.created && a2?.ok && !a2.created && a2.docId === a.docId && b?.ok && b.created && b.replacedDocId === a.docId && all.length === 3
      && all.filter((d: any) => d.status === "ISSUED").length === 1 && v?.replaces?.docNo === a.docNo && v?.history?.length === 3 && (a3?.ok === false ? ["IDEMPOTENCY_CONFLICT", "ALREADY_REPLACED"].includes(a3.code) : a3?.docId === a.docId),
    "MAJOR", "ใบแทนซ้ำคีย์เดิม = ใบเดิม · ใบแทนของใบแทน = เลขใหม่ ชี้ใบก่อนหน้า · ประวัติ 3 · คีย์เก่าหลังแทนต่อ ⇒ ไม่สร้างใหม่",
    { a: a?.ok ? [a.docNo, a.created] : a, a2: a2?.ok ? [a2.docNo, a2.created] : a2, b: b?.ok ? [b.docNo, b.replacedDocNo] : b, a3: a3?.ok ? [a3.docNo, a3.created] : a3, all: all.map((d: any) => [d.docNo, d.status]) });
  }
  {
    const n0 = await numbering(BOOK_R);
    const keys = Array.from({ length: 12 }, (_, i) => `c${i % 6}`);
    const rs = await procs([0, 1, 2, 3].map((p) => ({ calls: keys.slice(p * 3, p * 3 + 3).map((k) => ({ op: "dorm:reissueBillTaxInvoice", args: [cO, { unitId: DR.u, billId: bR2?.id, reason: "ทดสอบออกใบแทนพร้อมกันหลายโพรเซส", idempotencyKey: k }, dArg({ now: NOW })] })) })));
    const xs = flat(rs);
    const all = await tisOfInv(bR2?.accountDocumentId, false);
    const live = all.filter((d: any) => d.status === "ISSUED");
    const perKey = new Map<string, number>();
    for (const d of all) { const k = String(d.refId).split("#")[1]; if (k) perKey.set(k, (perKey.get(k) ?? 0) + 1); }
    const n1 = await numbering(BOOK_R);
    rec("R-2", live.length === 1 && [...perKey.values()].every((n) => n === 1) && !badOf(xs).length && n1.ok && xs.every((x: any) => x.r?.ok === true || ["ALREADY_REPLACED", "IDEMPOTENCY_CONFLICT"].includes(x.r?.code)),
      "BLOCKER", "ออกใบแทน 4 โพรเซส × 3 (6 คีย์ ซ้ำคีย์ละ 2) บนบิลเดียว ⇒ ใบที่มีผล 1 · คีย์ละ ≤ 1 ใบ · เลขต่อเนื่อง · ไม่มี throw/Prisma",
      { codes: xs.map((x: any) => x.r ? (x.r.ok ? `ok:${x.r.created}` : x.r.code) : x.threw ?? x.childFail), live: live.length, perKey: [...perKey.entries()], n0: n0.n, n1 });
  }
  {
    // งวด ต.ค. ปิด (AccountPeriod CLOSED) ⇒ ใบแทนวันที่เดิม = PERIOD_LOCKED · REISSUE_DAY (พ.ย.) ผ่านได้ แต่ ภ.พ.30 ต.ค. ต้องไม่เปลี่ยน
    const REP: any = await import("@/lib/modules/account/reports" as string);
    const per0: any = await prisma.accountPeriod.findFirst({ where: { systemId: BOOK_R, periodKey: "2026-10" } });
    const per: any = per0
      ? await prisma.accountPeriod.update({ where: { id: per0.id }, data: { status: "CLOSED", closedAt: new Date() } })
      : await prisma.accountPeriod.create({ data: { tenantId: A, systemId: BOOK_R, periodKey: "2026-10", status: "CLOSED", closedAt: new Date() } });
    const ppBefore = await REP.pp30({ tenantId: A, systemId: BOOK_R }, "2026-10");
    const tClose = new Date();
    const s0 = await numbering(BOOK_R);
    const x = await reissue(bR3, "lock1");
    const x2 = await procs([0, 1, 2].map(() => ({ calls: [{ op: "dorm:reissueBillTaxInvoice", args: [cO, { unitId: DR.u, billId: bR3?.id, reason: "ทดสอบงวดปิดหลายโพรเซสพร้อมกัน", idempotencyKey: "lock2" }, dArg({ now: NOW })] }] })));
    const s1 = await numbering(BOOK_R);
    const t1 = await tisOfInv(bR3?.accountDocumentId, false);
    await setVal(A, "rooms.vat.reissueDate", "UNIT", DR.u, "REISSUE_DAY");
    const y = await reissue(bR3, "day1", {}, NOW_LATE);
    await prisma.settingValue.deleteMany({ where: { tenantId: A, key: "rooms.vat.reissueDate" } });
    const ppAfter = await REP.pp30({ tenantId: A, systemId: BOOK_R }, "2026-10");
    const ppNov = await REP.pp30({ tenantId: A, systemId: BOOK_R }, "2026-11");
    const revOct = await prisma.accountJournalEntry.count({ where: { systemId: BOOK_R, journal: "REVERSAL", periodKey: "2026-10", createdAt: { gte: tClose } } });
    const jvOctAfter = await prisma.accountJournalEntry.count({ where: { systemId: BOOK_R, periodKey: "2026-10", createdAt: { gte: tClose } } });
    if (per0) await prisma.accountPeriod.update({ where: { id: per.id }, data: { status: per0.status, closedAt: per0.closedAt } });
    else await prisma.accountPeriod.delete({ where: { id: per.id } });
    rec("R-3", x?.ok === false && x.code === "PERIOD_LOCKED" && flat(x2).every((z: any) => z.r?.code === "PERIOD_LOCKED") && s1.n === s0.n && s1.last === s0.last && t1.length === 1
      && y?.ok === true && y.issueDate === "2026-11-20" && ppAfter?.output?.total === ppBefore?.output?.total && ppNov?.output?.total === 0 && revOct === 0 && jvOctAfter === 0,
      "MAJOR", "งวด ต.ค. ปิด: ใบแทนวันที่เดิม (เดี่ยว + 3 โพรเซส) = PERIOD_LOCKED ไม่กินเลข · ใบแทนแบบวันออกใหม่ (พ.ย.) ผ่าน · ภ.พ.30 ต.ค. ไม่เปลี่ยน · ไม่มี JV ใด (รวมกลับรายการ) เกิดในงวด ต.ค. หลังปิด · พ.ย. สุทธิ 0",
      { x: x?.code ?? x?.ok, x2: flat(x2).map((z: any) => z.r?.code ?? z.threw), s0: [s0.n, s0.last], s1: [s1.n, s1.last], y: y?.ok ? y.issueDate : y, pp: [ppBefore?.output?.total, ppAfter?.output?.total, ppNov?.output?.total], revOct, jvOctAfter });
  }
  {
    // voidDocument: ใบกำกับหอ / ใบแจ้งหนี้หอที่มีใบกำกับ ⇒ ปฏิเสธ · เอกสารทั่วไป (MANUAL) ยังยกเลิกได้
    const liveR1: any = (await tisOfInv(bR1?.accountDocumentId))[0];
    const voidedR1: any = (await tisOfInv(bR1?.accountDocumentId, false)).find((d: any) => d.status === "VOIDED");
    const a = await ASV.voidDocument(A, BOOK_R, liveR1?.id, "ทดสอบยกเลิกใบกำกับตรง");
    const b = await ASV.voidDocument(A, BOOK_R, bR1?.accountDocumentId, "ทดสอบยกเลิกใบแจ้งหนี้");
    const c = await ASV.voidDocument(A, BOOK_R, voidedR1?.id, "ทดสอบยกเลิกใบที่ถูกแทนแล้ว");
    const man = await ASV.createDocument({ tenantId: A, systemId: BOOK_R, docType: "INVOICE", vatMode: "INCLUDE", lines: [{ description: "ค่าบริการทั่วไป", qty: 1, unitPrice: 10_700, vatRateBp: 700 }] });
    const mi = man?.id ? await ASV.issueDocument(A, BOOK_R, man.id) : null;
    const mv = man?.id ? await ASV.voidDocument(A, BOOK_R, man.id, "ทดสอบยกเลิกเอกสารทั่วไป") : null;
    const mdoc: any = man?.id ? await prisma.accountDocument.findFirst({ where: { id: man.id } }) : null;
    const after: any = await prisma.accountDocument.findFirst({ where: { id: liveR1?.id } });
    const inv: any = await prisma.accountDocument.findFirst({ where: { id: bR1?.accountDocumentId } });
    rec("R-4", a?.ok === false && b?.ok === false && c?.ok === false && after?.status === "ISSUED" && !["VOIDED", "CANCELLED"].includes(inv?.status) && mi?.ok === true && mv?.ok === true && mdoc?.status === "VOIDED",
      "MAJOR", "voidDocument: ใบกำกับหอ ✗ · ใบแจ้งหนี้หอที่มีใบกำกับ ✗ · ใบที่ถูกแทนแล้ว ✗ · ใบแจ้งหนี้ MANUAL ของสมุดเดียวกันยังออก+ยกเลิกได้ตามเดิม",
      { a, b, c, mi, mv, st: [after?.status, inv?.status, mdoc?.status] });
  }
  {
    // facade ข้ามหน่วยในสมุดที่ใช้ร่วม (K1/K2 ใช้ BOOK_K)
    const k1b: any = await billOf(K[0], "K1-2"), k2b: any = await billOf(K[1], "K2-2");
    const k1ti: any = (await tisOfInv(k1b?.accountDocumentId))[0];
    const n0 = await numbering(BOOK_K);
    const a = await ACC.replaceExternalTaxInvoice({ tenantId: A, unitId: K[1].u, taxInvoiceDocId: k1ti?.id, reason: "ลองแทนข้ามหน่วยในสมุดเดียว", idempotencyKey: "xu" });
    const b = await ACC.createExternalTaxInvoice({ tenantId: A, unitId: K[1].u, sourceDocId: k1b?.accountDocumentId, buyer: { name: "x", address: "y" } });
    const c = await ACC.replaceExternalTaxInvoice({ tenantId: A, unitId: K[0].u, taxInvoiceDocId: k1b?.accountDocumentId, reason: "ส่ง id ใบแจ้งหนี้แทนใบกำกับ", idempotencyKey: "xv" });
    const d = await ACC.externalTaxInvoicesOf({ tenantId: A, unitId: K[1].u, sourceDocId: k1b?.accountDocumentId });
    const e = await dorm.billTaxInvoice(cO, { unitId: K[1].u, billId: k2b?.id, docId: k1ti?.id });
    const f = await ACC.replaceExternalTaxInvoice({ tenantId: B, unitId: DB.u, taxInvoiceDocId: k1ti?.id, reason: "ร้าน B ลองแทนใบร้าน A", idempotencyKey: "xb" });
    const n1 = await numbering(BOOK_K);
    rec("X-1", a?.code === "NOT_FOUND" && b?.code === "NOT_FOUND" && c?.code === "NOT_FOUND" && Array.isArray(d) && d.length === 0 && e === null && f?.ok === false && n1.n === n0.n,
      "BLOCKER", "facade ข้ามหน่วย (สมุดร่วม)/id ผิดชนิด/ข้ามร้าน ⇒ NOT_FOUND · อ่าน [] · billTaxInvoice(docId ของบิลอื่น) null · ไม่มีเลขเพิ่ม",
      { a: a?.code, b: b?.code, c: c?.code, d: Array.isArray(d) ? d.length : d, e, f: f?.code, n: [n0.n, n1.n] });
  }

  // ═══════════════════ X. สิทธิ์สด · ข้ามร้าน ═══════════════════
  console.log("\n── X สิทธิ์ · ข้ามร้าน ──");
  {
    const runB = (await prep(cB, DB.u))?.runId;
    await sendAll(cB, DB.u, runB);
    const bB: any = await billOf(DB, "B1");
    const bBti: any = (await tisOfInv(bB?.accountDocumentId))[0];
    const r1: any = await billOf(DR, "R1");
    const a = await dorm.issueBillTaxInvoice(cB, { unitId: DR.u, billId: r1?.id });
    const b = await dorm.issueBillTaxInvoice(cB, { unitId: DB.u, billId: r1?.id });
    const c = await dorm.reissueBillTaxInvoice(cB, { unitId: DB.u, billId: r1?.id, reason: "ร้าน B ลองออกใบแทนบิลร้าน A", idempotencyKey: "xb1" });
    const d = await dorm.billTaxInvoice(cB, { unitId: DB.u, billId: bB?.id, docId: (await tisOfInv(r1?.accountDocumentId))[0]?.id });
    const e = await dorm.billTaxInvoice(cO, { unitId: DB.u, billId: bB?.id });
    const f = await dorm.reissueBillTaxInvoice({ tenantId: A, actorUserId: OWNB }, { unitId: DR.u, billId: r1?.id, reason: "ผู้ใช้ร้าน B ปลอม tenantId ร้าน A", idempotencyKey: "xb2" });
    const g = await dorm.billTaxInvoice({ tenantId: B, actorUserId: OWN }, { unitId: DB.u, billId: bB?.id });
    rec("X-2", a?.code === "NOT_FOUND" && b?.code === "NOT_FOUND" && c?.code === "NOT_FOUND" && d === null && e === null && f?.code === "NOT_FOUND" && g === null && !!bBti,
      "BLOCKER", "ข้ามร้าน: ออก/ออกแทน/อ่าน ด้วย billId/docId ร้านอื่น · ctx ปลอม (tenantId ร้านอื่น + ผู้ใช้ไม่มีสมาชิก) ⇒ NOT_FOUND / null",
      { a: a?.code, b: b?.code, c: c?.code, d: !!d, e: !!e, f: f?.code, g: !!g });
  }
  {
    const ST = await mkUser("staff", A, "STAFF", [DR.u], ["dorm.view", "dorm.bill.send"]);
    const cS = { tenantId: A, actorUserId: ST };
    const r2: any = await billOf(DR, "R2");
    const a = await dorm.issueBillTaxInvoice(cS, { unitId: DR.u, billId: r2?.id });
    const ka = await dorm.reissueBillTaxInvoice(cS, { unitId: DR.u, billId: r2?.id, reason: "พนักงานที่มีสิทธิ์ออกใบแทน", idempotencyKey: "st1" });
    const k1b: any = await billOf(K[0], "K1-3");
    const other = await dorm.issueBillTaxInvoice(cS, { unitId: K[0].u, billId: k1b?.id });
    await prisma.membership.updateMany({ where: { tenantId: A, userId: ST }, data: { permissions: { "dorm.view": true } } });
    const n0 = await numbering(BOOK_R);
    const b = await dorm.reissueBillTaxInvoice(cS, { unitId: DR.u, billId: r2?.id, reason: "ถอนสิทธิ์แล้วลองออกใบแทน", idempotencyKey: "st2" });
    const b2 = await dorm.issueBillTaxInvoice(cS, { unitId: DR.u, billId: r2?.id });
    const v = await dorm.billTaxInvoice(cS, { unitId: DR.u, billId: r2?.id });
    await prisma.membership.updateMany({ where: { tenantId: A, userId: ST }, data: { unitAccess: [K[0].u], permissions: { "dorm.view": true, "dorm.bill.send": true } } });
    const c = await dorm.reissueBillTaxInvoice(cS, { unitId: DR.u, billId: r2?.id, reason: "ย้ายหน่วยแล้วลองออกใบแทน", idempotencyKey: "st3" });
    const cv = await dorm.billTaxInvoice(cS, { unitId: DR.u, billId: r2?.id });
    await prisma.membership.deleteMany({ where: { tenantId: A, userId: ST } });
    const d = await dorm.billTaxInvoice(cS, { unitId: DR.u, billId: r2?.id });
    const n1 = await numbering(BOOK_R);
    rec("X-3", a?.ok === true && ka?.ok === true && other?.code === "NOT_FOUND" && b?.code === "NOT_FOUND" && b2?.code === "NOT_FOUND" && !!v?.docId && c?.code === "NOT_FOUND" && cv === null && d === null && n1.n === n0.n,
      "BLOCKER", "สิทธิ์สด: STAFF dorm.bill.send ออก/ออกแทนได้ · หน่วยอื่น ✗ · ถอน dorm.bill.send ⇒ ทันที NOT_FOUND (ยังอ่านได้) · ย้ายหน่วย ⇒ ✗/null · ลบสมาชิก ⇒ null · ไม่มีเลขเพิ่ม",
      { a: a?.ok ?? a?.code, ka: ka?.ok ?? ka?.code, other: other?.code, b: b?.code, b2: b2?.code, v: !!v, c: c?.code, cv: !!cv, d: !!d });
  }

  // ═══════════════════ P. ผู้ซื้อ ═══════════════════
  console.log("\n── P ผู้ซื้อ (Party) ──");
  const runP = (await prep(cO, DP.u, NOW))?.runId;
  {
    const held = await prisma.dormBill.findMany({ where: { runId: runP, status: "HELD" }, select: { leaseId: true, holdReason: true } });
    console.log(`  (P held: ${J(held)})`);
  }
  // P6: แก้ชื่อ Party ระหว่างส่ง (ลูกส่ง · หลักแก้ชื่อวน)
  const p6Party = DP.L.P6.partyId;
  const kidP = spawnKid({ calls: [{ op: "dorm:sendBillRun", args: [cO, { unitId: DP.u, runId: runP }, dArg({ now: NOW, budgetMs: 20_000 })] }] }, Date.now() + 8_000);
  kids.push(kidP.child);
  const names = new Set<string>(["นายแข่ง ระหว่างส่ง"]);
  {
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < 30_000) {
      const nm = `นายแข่ง รอบ${++i}`;
      names.add(nm);
      await prisma.party.update({ where: { id: p6Party }, data: { name: nm } });
      const b6: any = await billOf(DP, "P6");
      if (b6?.status === "SENT") break;
      await sleep(40);
    }
  }
  const resP = await kidP.done;
  console.log(`  (ส่ง P (ลูก): ${J(resP.out.map((x: any) => x.r?.ok ? { sent: x.r.sent, failed: x.r.failed, tp: x.r.taxInvoicePending } : x))})`);
  const finP = await sendAll(cO, DP.u, runP, 40_000);
  console.log(`  (ส่ง P ต่อ: ${J(finP)})`);
  {
    const b1: any = await billOf(DP, "P1");
    const inv1 = b1?.accountDocumentId ? null : await prisma.accountDocument.findFirst({ where: { refSystemId: DP.u, docType: "INVOICE", refId: { startsWith: DP.L.P1.leaseId } } });
    const ti1 = await tisOfInv(b1?.accountDocumentId ?? inv1?.id);
    const strand = !!inv1 && !["SENT", "PARTIALLY_PAID", "PAID"].includes(b1?.status) && ti1.length === 0;
    rec("P-1", !strand && b1?.status === "SENT" && ti1.length === 1 && (ti1[0] as any)?.contactSnapshot?.branchCode === "00012", "MAJOR",
      "(T1) Party เลขถูก + สาขา '12' ⇒ เติมเป็น 00012 แล้วออกได้ · ไม่มีใบแจ้งหนี้ลอย",
      { st: b1?.status, hold: b1?.holdReason, sentVia: String(b1?.sentVia ?? "").slice(0, 8), inv: inv1 ? [inv1.docNo, inv1.status] : null, ti: ti1.length, fail: finP.map((f: any) => f.failed).filter(Boolean).slice(-1) });
    // ทางกู้ (ถ้ายังไม่ส่ง): แก้สาขา → ส่งต่อ
    await prisma.party.update({ where: { id: DP.L.P1.partyId }, data: { branchCode: "00012" } });
    const fx = await sendAll(cO, DP.u, runP, 40_000);
    const b1b: any = await billOf(DP, "P1");
    const t1b: any[] = await tisOfInv(b1b?.accountDocumentId);
    rec("P-1b", b1b?.status === "SENT" && t1b.length === 1 && t1b[0]?.contactSnapshot?.branchCode === "00012", "MAJOR", "แก้สาขาแล้วส่งต่อ ⇒ SENT + ใบกำกับสาขา 00012 (ทางกู้ทำได้จริงโดยไม่ต้อง prepare ใหม่)",
      { st: b1b?.status, hold: b1b?.holdReason, ti: t1b.map((t) => t.contactSnapshot), fx: fx.slice(-2) });
  }
  {
    const b2: any = await billOf(DP, "P2");
    const inv2 = await prisma.accountDocument.findFirst({ where: { refSystemId: DP.u, docType: "INVOICE", refId: { startsWith: DP.L.P2.leaseId } } });
    const ti2 = await tisOfInv(inv2?.id);
    const strand = !!inv2 && !["SENT", "PARTIALLY_PAID", "PAID"].includes(b2?.status) && ti2.length === 0;
    const nl = ti2[0] ? [...String((ti2[0] as any).contactSnapshot?.name ?? "")].length : 0;
    rec("P-2", !strand && ((b2?.status === "HELD" && /^BUYER_TAX_ID_INVALID/.test(b2?.holdReason ?? "") && !inv2) || (b2?.status === "SENT" && ti2.length === 1 && nl > 0 && nl <= 300)), "MAJOR",
      "(T1) Party ชื่อยาว 330 ตัว ⇒ ตัดเหลือ ≤300 แล้วออกได้ (หรือพักก่อนออกใบ) · ไม่มีใบแจ้งหนี้ลอย",
      { st: b2?.status, hold: b2?.holdReason, inv: inv2 ? [inv2.docNo, inv2.status] : null, ti: ti2.length, nameLen: ti2[0] ? String(ti2[0].contactSnapshot?.name ?? "").length : null });
  }
  {
    const b7: any = await billOf(DP, "P7");
    const inv7 = await prisma.accountDocument.findFirst({ where: { refSystemId: DP.u, docType: "INVOICE", refId: { startsWith: DP.L.P7.leaseId } } });
    const rel = await dorm.releaseHeldBill?.(cO, { unitId: DP.u, billId: b7?.id }).catch((e: unknown) => ({ threw: errMsg(e) }));
    const th = dorm.holdReasonTh ? dorm.holdReasonTh(b7?.holdReason ?? null) : null;
    rec("P-6", b7?.status === "HELD" && /^BUYER_TAX_ID_INVALID/.test(b7?.holdReason ?? "") && !inv7 && rel?.ok !== true && /สาขา/.test(String(th ?? rel?.reason ?? "")),
      "MAJOR", "(T1) สาขา 'สาขา 1' (ไม่ใช่ตัวเลข) ⇒ พักบิลรหัส BUYER_TAX_ID_INVALID* ตอนเตรียมรอบ · ไม่มีใบแจ้งหนี้ · ปล่อยพักไม่ได้จนแก้ · ข้อความบอกว่าแก้สาขา",
      { st: b7?.status, hold: b7?.holdReason, inv: inv7?.docNo ?? null, rel: rel?.ok ?? rel?.code, th, relReason: rel?.reason });
  }
  {
    const b3: any = await billOf(DP, "P3"), b4: any = await billOf(DP, "P4");
    const [t3]: any[] = await tisOfInv(b3?.accountDocumentId);
    const [t4]: any[] = await tisOfInv(b4?.accountDocumentId);
    const v4 = await dorm.billTaxInvoice(cO, { unitId: DP.u, billId: b4?.id });
    rec("P-3", t3?.contactSnapshot?.legalType === "COMPANY" && t3.contactSnapshot.taxId === null && t3.contactSnapshot.branchCode === null && /ห้อง P3/.test(t3.contactSnapshot.address ?? "")
      && t4?.contactSnapshot?.taxId === BUYER_CO && t4.contactSnapshot.branchCode === "00002" && v4?.buyer?.branchLabel === "สาขาที่ 00002",
      "MINOR", "นิติบุคคลไม่มีเลข ⇒ ออกได้ taxId/สาขา null ที่อยู่ = ห้อง · เลขมีขีด ⇒ เก็บเลขล้วน 13 หลัก สาขา 00002",
      { t3: t3?.contactSnapshot, t4: t4?.contactSnapshot, v4: v4?.buyer });
  }
  {
    const b6: any = await billOf(DP, "P6");
    const [t6]: any[] = await tisOfInv(b6?.accountDocumentId);
    const inv6: any = await prisma.accountDocument.findFirst({ where: { id: b6?.accountDocumentId } });
    const nm = t6?.contactSnapshot?.name;
    rec("P-4", b6?.status === "SENT" && !!nm && names.has(nm), "MINOR", "แก้ชื่อ Party วนระหว่างส่ง ⇒ ใบกำกับมีชื่อที่เคยเป็นจริงชื่อเดียว (snapshot ณ ตอนออก)",
      { st: b6?.status, ti: nm, inv: inv6?.contactSnapshot?.name ?? null });
  }
  {
    const b5: any = await billOf(DP, "P5");
    const [t5]: any[] = await tisOfInv(b5?.accountDocumentId);
    const before = t5?.contactSnapshot;
    await prisma.party.update({ where: { id: DP.L.P5.partyId }, data: { name: "นายใหม่ หลังแก้", taxId: BUYER_PERSON, address: "88 ถนนใหม่ กรุงเทพฯ" } });
    const v = await dorm.billTaxInvoice(cO, { unitId: DP.u, billId: b5?.id });
    const t5b: any = await prisma.accountDocument.findFirst({ where: { id: t5?.id } });
    const r = await dorm.reissueBillTaxInvoice(cO, { unitId: DP.u, billId: b5?.id, reason: "ผู้เช่าแจ้งเปลี่ยนชื่อและเลขผู้เสียภาษี", idempotencyKey: "p5" }, { now: new Date(NOW) });
    const nw: any = r?.docId ? await prisma.accountDocument.findFirst({ where: { id: r.docId } }) : null;
    const old: any = await prisma.accountDocument.findFirst({ where: { id: t5?.id } });
    const vOld = await dorm.billTaxInvoice(cO, { unitId: DP.u, billId: b5?.id, docId: t5?.id });
    const bad = await dorm.reissueBillTaxInvoice(cO, { unitId: DP.u, billId: b5?.id, reason: "ลองใส่เลขผู้ซื้อผิดตอนออกใบแทน", idempotencyKey: "p5bad", buyer: { taxId: BAD_TAX } }, { now: new Date(NOW) });
    const clr = await dorm.reissueBillTaxInvoice(cO, { unitId: DP.u, billId: b5?.id, reason: "ลบเลขผู้เสียภาษีออกจากใบตามคำขอ", idempotencyKey: "p5clr", buyer: { taxId: "" } }, { now: new Date(NOW) });
    const clrDoc: any = clr?.docId ? await prisma.accountDocument.findFirst({ where: { id: clr.docId } }) : null;
    const party: any = await prisma.party.findFirst({ where: { id: DP.L.P5.partyId } });
    rec("P-5", v?.buyer?.name === "นายเดิม ก่อนแก้" && v?.buyer?.taxId === null && J(t5b?.contactSnapshot) === J(before) && r?.ok === true && nw?.contactSnapshot?.name === "นายใหม่ หลังแก้" && nw.contactSnapshot.taxId === BUYER_PERSON
      && J(old?.contactSnapshot) === J(before) && vOld?.buyer?.name === "นายเดิม ก่อนแก้" && bad?.code === "BUYER_TAX_ID_INVALID" && clr?.ok === true && clrDoc?.contactSnapshot?.taxId === null && party?.taxId === BUYER_PERSON,
      "MAJOR", "แก้ Party หลังออก ⇒ ใบเดิม/ตัวอ่านยังเป็น snapshot เดิม · ใบแทน (ไม่ส่ง buyer) อ่าน Party ใหม่ · ใบเดิมไม่ถูกแก้ทับ · override เลขผิด ⇒ BUYER_TAX_ID_INVALID · override taxId '' ⇒ ไม่มีเลข · Party ไม่ถูกแก้",
      { v: v?.buyer, nw: nw?.contactSnapshot, old: old?.contactSnapshot, bad: bad?.code, clr: clr?.ok ? clrDoc?.contactSnapshot : clr, partyTax: party?.taxId });
  }

  // ═══════════════════ C. ใบลด/เพิ่มหนี้หลังมีใบกำกับ ═══════════════════
  // ═══════════════════ T3. ผู้ขายถูกตรึงใน snapshot ═══════════════════
  console.log("\n── T3 ผู้ขายตรึงตอนออก ──");
  {
    const b3: any = await billOf(DR, "R3");
    const v0 = await dorm.billTaxInvoice(cO, { unitId: DR.u, billId: b3?.id });
    const old = await ACC.externalTaxInvoicesOf({ tenantId: A, unitId: DR.u, sourceDocId: b3?.accountDocumentId });
    const oldLive: any = old.find((r: any) => r.status === "ISSUED");
    await ASV.saveSettings(A, BOOK_R, { orgName: `บริษัท หออาร์ใหม่ จำกัด ${stamp}`, taxId: SELLER, branchCode: "00003", address: "777 ถนนใหม่ เชียงใหม่ 50000" });
    const v1 = await dorm.billTaxInvoice(cO, { unitId: DR.u, billId: b3?.id });
    const vOldDoc = await dorm.billTaxInvoice(cO, { unitId: DR.u, billId: b3?.id, docId: oldLive?.docId });
    const r = await dorm.reissueBillTaxInvoice(cO, { unitId: DR.u, billId: b3?.id, reason: "ผู้ขายย้ายที่อยู่สำนักงานจึงออกใหม่", idempotencyKey: "t3" }, { now: new Date(NOW) });
    const v2 = await dorm.billTaxInvoice(cO, { unitId: DR.u, billId: b3?.id });
    const vOld2 = await dorm.billTaxInvoice(cO, { unitId: DR.u, billId: b3?.id, docId: oldLive?.docId });
    let printCopy: string | null = null;
    try {
      const React: any = await import("react" as string);
      const RDS: any = await import("react-dom/server" as string);
      const PC: any = await import(pathToFileURL(join(ROOT, "src/components/dorm/TaxInvoicePrint.tsx")).href);
      const html = String(RDS.renderToStaticMarkup(React.createElement(PC.default, { model: vOld2, copy: true })));
      printCopy = /777 ถนนใหม่/.test(html) ? "ที่อยู่ใหม่บนสำเนาใบเดิม!" : /99 ถนนสุขุมวิท/.test(html) && /สำเนา/.test(html) ? "OK" : html.slice(0, 200);
    } catch (e) { printCopy = `render ล้ม: ${errMsg(e)}`; }
    rec("T3-1", !!v0 && v1?.seller?.address === v0.seller?.address && v1?.seller?.name === v0.seller?.name && v1?.seller?.branchLabel === "สำนักงานใหญ่" && vOldDoc?.seller?.address === v0.seller?.address
      && r?.ok === true && /777 ถนนใหม่/.test(v2?.seller?.address ?? "") && v2?.seller?.branchLabel === "สาขาที่ 00003" && /หออาร์ใหม่/.test(v2?.seller?.name ?? "") && vOld2?.seller?.address === v0.seller?.address && printCopy === "OK",
      "MAJOR", "แก้ค่าตั้งผู้ขายหลังออก ⇒ ใบเดิม (ตัวอ่าน + สำเนาพิมพ์) ผู้ขายเดิม · ใบแทนใช้ค่าใหม่ (ชื่อ/สาขา 00003/ที่อยู่)",
      { v0: v0?.seller, v1: v1?.seller, vOldDoc: vOldDoc?.seller, r: r?.ok ? r.docNo : r, v2: v2?.seller, vOld2: vOld2?.seller, oldSnap: old.map((x: any) => x.seller), printCopy });
  }

  console.log("\n── C ใบลด/เพิ่มหนี้ ──");
  {
    const b1: any = await billOf(DR, "R1");
    const cur: any = (await tisOfInv(b1?.accountDocumentId))[0];
    const v0 = await vatCheck(BOOK_R);
    const cn = await dorm.adjustSentBill(cO, { unitId: DR.u, billId: b1?.id, kind: "CREDIT", reason: "จดเลขมิเตอร์ไฟผิดเกินจริง", idempotencyKey: "pcn1", lines: [{ code: "ELEC", labelTh: "ค่าไฟฟ้า (ลดหนี้)", amountSatang: 10_700 }] });
    const dn = await dorm.adjustSentBill(cO, { unitId: DR.u, billId: b1?.id, kind: "DEBIT", reason: "จดเลขมิเตอร์ไฟขาดไปสองหน่วย", idempotencyKey: "pdn1", lines: [{ code: "ELEC", labelTh: "ค่าไฟฟ้า (เพิ่มหนี้)", amountSatang: 21_400 }] });
    const cnd: any = cn?.docId ? await prisma.accountDocument.findFirst({ where: { id: cn.docId } }) : null;
    const dnd: any = dn?.docId ? await prisma.accountDocument.findFirst({ where: { id: dn.docId } }) : null;
    const v1 = await vatCheck(BOOK_R);
    const wantNote = `อ้างอิงใบกำกับภาษีเลขที่ ${cur?.docNo} ลงวันที่ 26 ต.ค. 2569`;
    rec("C-1", cn?.ok && dn?.ok && cnd?.note === wantNote && dnd?.note === wantNote && cnd.vatAmount === 700 && dnd.vatAmount === 1400 && v1.ok && v1.b2200 === v0.b2200 - 700 + 1400,
      "MAJOR", "ใบลด/เพิ่มหนี้ไฟของบิลที่มีใบกำกับ (ผ่านใบแทนมาแล้ว) ⇒ note อ้างเลขที่+วันที่ใบกำกับปัจจุบัน · VAT 700/1,400 · 2200 ปรับตรง",
      { cn: cnd && [cnd.note, cnd.vatAmount], dn: dnd && [dnd.note, dnd.vatAmount], want: wantNote, v0, v1 });
    // ใบแทนลงวันออกใหม่ (พ.ย.) แล้วออกใบลดหนี้ ⇒ อ้างวันที่ใบใหม่
    await setVal(A, "rooms.vat.reissueDate", "UNIT", DR.u, "REISSUE_DAY");
    const rr = await dorm.reissueBillTaxInvoice(cO, { unitId: DR.u, billId: b1?.id, reason: "ผู้เช่าขอแก้ที่อยู่บนใบกำกับภาษี", idempotencyKey: "pc-day" }, { now: new Date(NOW_LATE) });
    await prisma.settingValue.deleteMany({ where: { tenantId: A, key: "rooms.vat.reissueDate" } });
    const cn2 = await dorm.adjustSentBill(cO, { unitId: DR.u, billId: b1?.id, kind: "CREDIT", reason: "ลดค่าไฟเพิ่มตามที่ตกลงกัน", idempotencyKey: "pcn2", lines: [{ code: "ELEC", labelTh: "ค่าไฟฟ้า (ลดหนี้)", amountSatang: 5_350 }] });
    const cn2d: any = cn2?.docId ? await prisma.accountDocument.findFirst({ where: { id: cn2.docId } }) : null;
    const cnOld: any = cnd ? await prisma.accountDocument.findFirst({ where: { id: cnd.id } }) : null;
    const v2 = await vatCheck(BOOK_R);
    rec("C-2", rr?.ok && cn2d?.note === `อ้างอิงใบกำกับภาษีเลขที่ ${rr.docNo} ลงวันที่ 20 พ.ย. 2569` && cn2d.vatAmount === 350 && cnOld?.note === wantNote && v2.ok,
      "MINOR", "หลังออกใบแทนวันใหม่ ⇒ ใบลดหนี้ถัดไปอ้างเลข/วันที่ใบใหม่ · ใบลดหนี้เดิมไม่ถูกแก้ทับ · 2200 ตรง",
      { rr: rr?.ok ? [rr.docNo, rr.issueDate] : rr, cn2: cn2d && [cn2d.note, cn2d.vatAmount], cnOld: cnOld?.note, v2 });
  }

  // ═══════════════════ G. ทางแปลงเอกสารเดิมของบัญชี (convert → issueDocument TAX_INVOICE) บนใบแจ้งหนี้หอ ═══════════════════
  console.log("\n── G ทางแปลงเอกสารเดิม vs ใบกำกับหอ ──");
  const mkInv = (ref: string) => ACC.createExternalInvoice({ tenantId: A, sourceKind: "DORM", unitId: DCV, refType: "PbD3Cv", refId: ref, customer: { name: "ผู้เช่า CV" },
    lines: [{ description: "ค่าห้อง", qty: 1, unitPriceSatang: 450_000, taxKind: "EXEMPT" }, { description: "ค่าไฟฟ้า", qty: 1, unitPriceSatang: 10_700, taxKind: "VAT7" }], vat: { registered: true, pricesIncludeVat: true }, issueDate: ISSUE });
  {
    // G-1: ทางแปลง convert → issueDocument บนใบแจ้งหนี้หอ (มีบรรทัดยกเว้น) ⇒ ต้องไม่ผ่าน · หอออกของตัวเองได้ (เฉพาะส่วน VAT)
    const inv = await mkInv("cv1");
    const cv = inv?.ok ? await ASV.convertDocument(A, BOOK_R, inv.docId, "TAX_INVOICE") : null;
    const is = cv?.ok ? await ASV.issueDocument(A, BOOK_R, cv.newId) : null;
    if (cv?.ok) await ASV.cancelDraft(A, BOOK_R, cv.newId);
    const cd = inv?.ok ? await ASV.createDocument({ tenantId: A, systemId: BOOK_R, docType: "TAX_INVOICE", sourceDocId: inv.docId, vatMode: "INCLUDE", lines: [{ description: "ค่าห้อง+ไฟ", qty: 1, unitPrice: 460_700, vatRateBp: 700 }] }).catch((e: unknown) => ({ threw: errMsg(e) })) : null;
    const ci = cd?.id ? await ASV.issueDocument(A, BOOK_R, cd.id) : null;
    if (cd?.id) await ASV.cancelDraft(A, BOOK_R, cd.id);
    const d = inv?.ok ? await ACC.createExternalTaxInvoice({ tenantId: A, unitId: DCV, sourceDocId: inv.docId, buyer: { name: "ผู้เช่า CV", address: "ห้อง CV" } }) : null;
    const live = inv?.ok ? await tisOfInv(inv.docId) : [];
    rec("G-1", is?.ok === false && /หอพัก/.test(is?.reason ?? "") && (cd?.threw || ci?.ok === false) && d?.ok === true && d.created === true && d.subTotalSatang === 10_000 && live.length === 1 && live[0].source === "DORM",
      "MAJOR", "(T7) ใบแจ้งหนี้หอมีบรรทัดยกเว้น: convert→issue ✗ · createDocument(TAX_INVOICE, sourceDocId)→issue ✗ · หอออกใบของตัวเอง (ฐาน 100.00 เฉพาะ VAT) ได้ 1 ใบ",
      { cv: cv?.ok ?? cv, is, cd: cd?.id ? "draft" : cd, ci, d: d?.ok ? { created: d.created, sub: d.subTotalSatang } : d, live: live.map((x: any) => [x.docNo, x.source]) });
  }
  {
    // G-3: ใบแจ้งหนี้จากรอบบิลจริง (refType DormBill) แม้มีใบกำกับแล้ว ⇒ ด่าน T7 ทำงานก่อน pipeline-M2
    const b3: any = await billOf(DR, "R2");
    const cv = await ASV.convertDocument(A, BOOK_R, b3?.accountDocumentId, "TAX_INVOICE");
    const is = cv?.ok ? await ASV.issueDocument(A, BOOK_R, cv.newId) : null;
    if (cv?.ok) await ASV.cancelDraft(A, BOOK_R, cv.newId);
    rec("G-3", (cv?.ok === false || is?.ok === false) && (await tisOfInv(b3?.accountDocumentId)).length === 1, "MINOR",
      "(T7) ใบแจ้งหนี้รอบบิล (DormBill) ที่มีใบกำกับแล้ว ⇒ ทางแปลงทั่วไปถูกปฏิเสธ (convert หรือ issue)", { cv, is });
  }
  {
    // G-4: ทางลิงก์สาธารณะ (ลูกค้าขอใบกำกับเอง) บนใบแจ้งหนี้หอ ⇒ คำขอ DRAFT ออกไม่ได้ · ไม่ขวางใบของหอ
    const inv = await mkInv("pub1");
    const lk = inv?.ok ? await ASV.ensurePublicTaxInvoiceLink(A, BOOK_R, inv.docId) : null;
    const rq = lk?.ok ? await ASV.issuePublicTaxInvoice(lk.token, { name: "บริษัท ขอเอง จำกัด", taxId: BUYER_CO, address: "1 ถนน" }) : null;
    const dr: any = inv?.ok ? await prisma.accountDocument.findFirst({ where: { sourceDocId: inv.docId, docType: "TAX_INVOICE", status: "DRAFT" } }) : null;
    const is = dr ? await ASV.issueDocument(A, BOOK_R, dr.id) : null;
    const d = inv?.ok ? await ACC.createExternalTaxInvoice({ tenantId: A, unitId: DCV, sourceDocId: inv.docId, buyer: { name: "ผู้เช่า CV", address: "ห้อง CV" } }) : null;
    const live = inv?.ok ? await tisOfInv(inv.docId) : [];
    const liveNoDraft = live.filter((x: any) => x.status !== "DRAFT");
    rec("G-4", (!dr || is?.ok === false) && liveNoDraft.length === 1 && liveNoDraft[0].source === "DORM" && d?.ok === true, "MAJOR",
      "(T7) ลิงก์สาธารณะขอใบกำกับบนใบแจ้งหนี้หอ ⇒ ร่างคำขอออกไม่ได้ · หอยังออกใบของตัวเองได้ 1 ใบ",
      { lk: lk?.ok ?? lk, rq, draft: !!dr, is, d: d?.ok ? { created: d.created } : d, live: live.map((x: any) => [x.docNo, x.status, x.source]) });
  }
  {
    // G-5: ใบกำกับ MANUAL ที่ค้างจากก่อนมีด่าน (จำลองด้วยการเขียนตรง) ⇒ หอตอบ TAX_INVOICE_EXISTS_OTHER · ไม่ผูกเป็นใบของบิล · ไม่มีใบหอเพิ่ม
    const inv = await mkInv("legacy1");
    const cv = inv?.ok ? await ASV.convertDocument(A, BOOK_R, inv.docId, "TAX_INVOICE") : null;
    if (cv?.ok) await prisma.accountDocument.update({ where: { id: cv.newId }, data: { status: "ISSUED", docNo: `LEGACY-${stamp}` } });
    const d = inv?.ok ? await ACC.createExternalTaxInvoice({ tenantId: A, unitId: DCV, sourceDocId: inv.docId, buyer: { name: "ผู้เช่า CV", address: "ห้อง CV" } }) : null;
    const rd = inv?.ok ? await ACC.externalTaxInvoicesOf({ tenantId: A, unitId: DCV, sourceDocId: inv.docId }) : null;
    const dormTi = inv?.ok ? await prisma.accountDocument.count({ where: { sourceDocId: inv.docId, docType: "TAX_INVOICE", source: "DORM" } }) : -1;
    rec("G-5", d?.ok === false && d.code === "TAX_INVOICE_EXISTS_OTHER" && /[฀-๿]/.test(d.reason ?? "") && Array.isArray(rd) && rd.length === 0 && dormTi === 0, "MAJOR",
      "(T6) ใบกำกับ MANUAL ค้างบนใบแจ้งหนี้หอ ⇒ facade หอ = TAX_INVOICE_EXISTS_OTHER · ตัวอ่านหอไม่นับเป็นใบของบิล · ไม่มีใบหอเกิด",
      { cv: cv?.ok ?? cv, d, rd: Array.isArray(rd) ? rd.length : rd, dormTi });
    // ลบใบจำลองออก (กันเลขไม่ใช่ชุดปกติไปกวนข้ออื่น)
    if (cv?.ok) { await prisma.accountDocumentRelation.deleteMany({ where: { OR: [{ fromId: cv.newId }, { toId: cv.newId }] } }); await prisma.accountDocumentLine.deleteMany({ where: { documentId: cv.newId } }); await prisma.accountDocument.delete({ where: { id: cv.newId } }).catch(() => null); }
  }
  {
    const outs: any[] = [];
    for (const ref of ["cv2", "cv3", "cv4"]) {
      const inv = await mkInv(ref);
      const cv = inv?.ok ? await ASV.convertDocument(A, BOOK_R, inv.docId, "TAX_INVOICE") : null;
      if (!inv?.ok || !cv?.ok) { outs.push({ ref, inv: inv?.ok, cv }); continue; }
      const rs = await procs([
        { calls: [{ op: "asv:issueDocument", args: [A, BOOK_R, cv.newId] }] },
        { calls: [{ op: "acc:createExternalTaxInvoice", args: [{ tenantId: A, unitId: DCV, sourceDocId: inv.docId, buyer: { name: "ผู้เช่า CV", address: "ห้อง CV" } }] }] },
        { calls: [{ op: "acc:createExternalTaxInvoice", args: [{ tenantId: A, unitId: DCV, sourceDocId: inv.docId, buyer: { name: "ผู้เช่า CV", address: "ห้อง CV" } }] }] },
      ], 10_000);
      const live = await tisOfInv(inv.docId);
      const liveNoDraft = live.filter((x: any) => x.status !== "DRAFT");
      await ASV.cancelDraft(A, BOOK_R, cv.newId).catch(() => null);
      outs.push({ ref, live: liveNoDraft.length, srcs: liveNoDraft.map((d: any) => d.source), rs: flat(rs).map((x: any) => x.r ? (x.r.ok ? `ok:${x.r.created ?? x.r.docNo}` : x.r.code ?? x.r.reason?.slice(0, 40)) : x.threw) });
    }
    rec("G-2", outs.every((o) => o.live === 1 && o.srcs[0] === "DORM"), "MAJOR", "แข่ง 3 โพรเซส: issueDocument(ร่างจากทางแปลง) vs createExternalTaxInvoice ×2 ⇒ ใบที่มีผล 1 ใบเสมอ และเป็นใบของหอ (ทางแปลงแพ้ทุกครั้ง)", outs);
  }
  {
    const n = await numbering(BOOK_R);
    const v = await vatCheck(BOOK_R);
    const pend = await prisma.accountDocument.findMany({ where: { systemId: BOOK_R, docType: "INVOICE", source: "DORM", status: { notIn: ["VOIDED", "CANCELLED", "DRAFT"] } }, select: { id: true, vatAmount: true } });
    let pendVat = 0;
    for (const d of pend) if (!(await prisma.accountDocument.count({ where: { sourceDocId: d.id, docType: "TAX_INVOICE", source: "DORM", status: { notIn: ["VOIDED", "CANCELLED", "DRAFT"] } } }))) pendVat += d.vatAmount;
    rec("Z-1", n.ok && v.b2200 === v.tiVat - v.cn + v.dn && v.b2205 === pendVat && v.unbal === 0, "BLOCKER", "ท้ายสุดสมุด R: เลขใบกำกับต่อเนื่องต่อชุด · 2200 = Σ VAT ใบกำกับที่มีผล − ใบลด + ใบเพิ่ม · 2205 = VAT ของใบแจ้งหนี้หอที่ยังไม่มีใบกำกับ · JV สมดุล", { n, v, pendVat });
  }

  // ═══════════════════ สรุป ═══════════════════
  const breaches = results.filter((r) => !r.ok && r.sev !== "INFO");
  console.log(`\n══ สรุป probe D.3-B: ${results.length} ข้อ · HOLD ${results.filter((r) => r.ok).length} · BREACH ${breaches.length} ══`);
  for (const r of breaches) console.log(`  ❌ [${r.id}] ${r.sev} ${r.what}`);
  exitCode = breaches.length ? 1 : 0;
} catch (e) {
  console.log(`🔴 probe ล้ม: ${e instanceof Error ? e.stack : String(e)}`);
  exitCode = 2;
} finally {
  for (const k of kids) { try { if (k.exitCode === null) k.kill("SIGKILL"); } catch { /* */ } }
  await sleep(1_000);
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d3pb-" } } }); } catch { /* */ }
  try {
    const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d3pb-" } } });
    const lu = await prisma.user.count({ where: { email: { startsWith: "svc-d3pb-" } } });
    console.log(`  (ล้างแล้ว: tenant ค้าง ${left} · user ค้าง ${lu})`);
  } catch { /* */ }
  try { await prisma.$disconnect(); } catch { /* */ }
  process.exit(exitCode);
}

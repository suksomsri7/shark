// PROBE — SVC D.8 reviewer B รอบยืนยัน F1–F16 (การจองบิล sending: · ฆ่าตรงจุด · INVOICE_CONFLICT · ลิงก์จ่าย F13 · backoff F4/F12) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d8-b2.mts
// ข้อมูลใต้ร้าน `qc-svc-d8pc-*` + ผู้ใช้ `svc-d8pc-*@shark.local` · ล้างใน finally ทุกครั้ง
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
    if ((job as any).watch) {
      const w = (job as any).watch as { billId: string; refId: string; tenantId: string; unitId: string; mode: "A" | "B" };
      const { prisma: pz } = (await import("@/lib/core/db" as string)) as any;
      void (async () => {
        try {
        for (let i = 0; i < 20_000; i++) {
          const b = await pz.dormBill.findFirst({ where: { id: w.billId }, select: { status: true, sentVia: true } });
          const doc = await pz.accountDocument.count({ where: { tenantId: w.tenantId, refSystemId: w.unitId, refType: "DormBill", refId: w.refId, docType: "INVOICE" } });
          if (b?.status === "DRAFT" && String(b.sentVia ?? "").startsWith("sending:") && (w.mode === "A" ? doc === 0 : doc > 0)) { console.log(`CHILD_KILLED mode=${w.mode} doc=${doc}`); process.exit(137); }
          if (b && b.status !== "DRAFT") { console.log("CHILD_MISSED"); process.exit(138); }
          await new Promise((r) => setTimeout(r, 2));
        }
        } catch (e) { console.log(`CHILD_WATCH_ERR ${errMsg(e)}`); }
      })();
    }
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
  const LOG = `/tmp/probe-d8-b2.out.${process.pid}.log`;
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
      resolve({ out, killed: buf.includes("CHILD_KILLED"), code, tail: buf.split("\n").filter((l) => l && !/SECURITY WARNING|libpq|sslmode|pg-connection-string|To prepare|^\s*$/.test(l)).slice(-4).join(" | ").slice(0, 400) } as any);
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
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d8pc-" } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: { id: string }) => t.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d8pc-" } } });

  // ═══════════ fixtures (ตามแบบข้อสอบ) ═══════════
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `PB D8 ${tag}`, slug: `qc-svc-d8pc-${tag}-${stamp}` } }); tenantIds.push(t.id); return t.id as string; };
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
    const u = await prisma.user.create({ data: { email: `svc-d8pc-${stamp}-${key}@shark.local`, name: `PB ${key}` } });
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
    const credit = docs.filter((d: any) => d.docType === "CREDIT_NOTE" && !["DRAFT", "VOIDED", "CANCELLED"].includes(d.status)).reduce((s: number, d: any) => s + d.grandTotal, 0);
    const debit = docs.filter((d: any) => d.docType === "DEBIT_NOTE" && !["DRAFT", "VOIDED", "CANCELLED"].includes(d.status)).reduce((s: number, d: any) => s + d.grandTotal, 0);
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

  const ACCB: any = await import(pathToFileURL(join(ROOT, "src/lib/modules/dorm/account-bridge.ts")).href);
  const NOVAT = { registered: false, pricesIncludeVat: true };
  const D = await mkTenant("d");
  const OWND = await mkUser("owner-d", D, "OWNER", ["*"]);
  const cD = { tenantId: D, actorUserId: OWND };
  const code = (x: any) => (x?.ok === true ? "OK" : x?.code ?? (x === null ? "null" : J(x).slice(0, 60)));
  const bill = (id: string) => prisma.dormBill.findFirst({ where: { id } });

  const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
  const want = (k: string) => !ONLY.length || ONLY.includes(k);
  // ═════════════════ CL: ฆ่าผู้ส่ง "หลังจองก่อนออกใบ" (A) และ "หลังออกใบก่อน SENT" (B) ═════════════════
  console.log("\n── CL การจองบิล sending: + ฆ่าผู้ส่งตรงจุด ──");
  if (want("CL")) {
    // CL1: ทางส่งต่อ = sendBillRun (ร้าน A) · CL2: ทางส่งต่อ = งานตามเวลา autoSend (ร้าน C)
    for (const [tag, tenantId, ctx, viaJob] of [["cl1", A, cO, false], ["cl2", C, cC, true]] as const) {
      const U = await small(tenantId, ctx, tag, Array.from({ length: 6 }, (_, i) => ({ no: `${tag.toUpperCase()}${i + 1}`, reading: 70 + i })));
      if (viaJob) await setVal(tenantId, "rooms.billing.autoSend", "UNIT", U.u, true);
      const p = await prep(ctx, U.u);
      const runId = p?.runId;
      const order = Object.keys(U.L);
      const kills: any[] = [];
      // จุดฆ่า: ห้องที่ 2 (A) · ห้องที่ 4 (B) · ห้องที่ 5 (A)
      for (const [idx, mode] of [[1, "A"], [3, "B"], [4, "A"]] as const) {
        // เป้า = บิล DRAFT ห้องแรก (ผู้ส่งไล่ตามเลขห้อง และ QC ช้า ~1 ใบ/การเรียก) — ห้องที่ idx ใช้เป็นป้ายเท่านั้น
        const drafts0 = await prisma.dormBill.findMany({ where: { unitId: U.u, status: "DRAFT" } });
        const roomNo = (b: any) => Object.entries(U.R).find(([, id]) => id === b.roomId)?.[0] ?? "";
        drafts0.sort((x: any, y: any) => roomNo(x).localeCompare(roomNo(y), "th", { numeric: true }));
        const target = drafts0[0];
        if (!target) break;
        const r = await procs([{ calls: [{ op: "sendBillRun", args: [ctx, { unitId: U.u, runId }, dArg({ now: NOW, budgetMs: 4_000 })] }], watch: { billId: target.id, refId: `${target.leaseId}:${P_RUN}`, tenantId, unitId: U.u, mode } } as any], 12_000);
        const after = await bill(target.id);
        const doc = await prisma.accountDocument.count({ where: { tenantId, refSystemId: U.u, refType: "DormBill", refId: `${target.leaseId}:${P_RUN}`, docType: "INVOICE" } });
        kills.push({ room: roomNo(target), mode, killed: r[0].killed, code: r[0].code, tail: (r[0] as any).tail, out: J(r[0].out).slice(0, 200), status: after?.status, sentVia: String(after?.sentVia ?? "").slice(0, 8), docForRef: doc });
        // (3) ระหว่างบิลถูกจอง (ผู้ส่งตาย · สัญญาเช่ายังไม่หมด): แก้/ปล่อย/เตรียม ⇒ ไม่แก้บิล
        if (after?.status === "DRAFT" && String(after?.sentVia).startsWith("sending:")) {
          const u0 = after.updatedAt?.getTime();
          const x1 = await dorm.setBillExtraLines(ctx, { unitId: U.u, billId: target.id, lines: [{ kind: "OTHER", labelTh: "ค่าซ่อมประตู", amountSatang: 7_700 }] });
          const x2 = await dorm.releaseHeldBill(ctx, { unitId: U.u, billId: target.id }, { now: new Date(NOW) });
          await dorm.recordAuthorityBill(ctx, { unitId: U.u, kind: "ELEC", periodKey: P_UTIL, billSatang: 480_000 + idx * 1000, units: 1000 }); // ข้อมูลเปลี่ยน
          const x3 = await prep(ctx, U.u);
          const sc = await dorm.scheduleBillRun(ctx, { unitId: U.u, runId, at: null }, { now: new Date(NOW) });
          const x4 = await prep(ctx, U.u);
          const now2 = await bill(target.id);
          kills[kills.length - 1].locked = { extra: code(x1), release: code(x2), prep: code(x3), sched: code(sc), prepAfterUnsched: code(x4), unchanged: now2?.updatedAt?.getTime() === u0 && now2?.totalSatang === after.totalSatang && now2?.status === "DRAFT" };
        }
        await sleep(25_000); // สัญญาเช่าผู้ส่งของโพรเซสที่ตายหมด (budget 4s + 20s)
      }
      const reprep = await prep(ctx, U.u); // เจ้าของกดเตรียมใหม่หลังข้อมูลเปลี่ยน (บิลที่ไม่ถูกจอง)
      let fin: any;
      if (viaJob) {
        const outs: any[] = [];
        for (let i = 0; i < 6; i++) {
          const x = await dorm.runDormBillingJobs(new Date(`2026-10-26T0${2 + i}:00:00.000Z`), { tenantId: C });
          outs.push(x);
          const left = await prisma.dormBill.count({ where: { unitId: U.u, status: "DRAFT" } });
          if (!left) break;
        }
        fin = outs;
      } else fin = await sendAll(ctx, U.u, runId, 120_000);
      const a = await audit(U);
      const run = await runOf(U.u);
      const claims = await prisma.dormBill.count({ where: { unitId: U.u, sentVia: { startsWith: "sending:" } } });
      const stale = await prisma.dormBill.findMany({ where: { unitId: U.u, status: "DRAFT" }, select: { id: true, sentVia: true } });
      const hitA = kills.filter((k) => k.killed && k.mode === "A").length, hitB = kills.filter((k) => k.killed && k.mode === "B").length;
      rec(`${tag.toUpperCase()}-1`, a.clean && a.sent === 6 && a.stuckDraft === 0 && claims === 0 && run?.status === "SENT", "BLOCKER",
        `ฆ่าผู้ส่งหลังจองก่อนออกใบ (A×${hitA}) / หลังออกใบก่อน SENT (B×${hitB}) ⇒ ส่งต่อด้วย ${viaJob ? "งานตามเวลา" : "sendBillRun"} จบ SENT 6/6 · 1 ใบ/สัญญา · ไม่ค้างจอง · AR = Σ บิล`,
        { kills: kills.map(({ locked, ...k }) => k), reprep: code(reprep), fin, run: run?.status, claims, stale, a });
      rec(`${tag.toUpperCase()}-2`, hitA >= 1 && hitB >= 1, "MINOR", "positive control: ฆ่าได้ตรงจุด A และ B อย่างน้อยอย่างละ 1", kills.map(({ locked, ...k }) => k));
      const lk = kills.filter((k) => k.locked).map((k) => k.locked);
      rec(`${tag.toUpperCase()}-3`, lk.length > 0 && lk.every((l) => l.unchanged && ["BILL_LOCKED", "RUN_BUSY"].includes(l.extra) && ["BILL_LOCKED", "RUN_BUSY", "NOT_HELD"].includes(l.release)), "BLOCKER",
        "บิลถูกจองค้าง (ผู้ส่งตาย) ⇒ setBillExtraLines BILL_LOCKED/RUN_BUSY · release ไม่แก้ · prepare/ยกเลิกตั้งเวลา+prepare หลังข้อมูลเปลี่ยน ไม่แตะบิล", lk);
    }
  }

  // ═════════════════ LV: แก้บิลระหว่างส่งจริง (ไม่ฆ่า) ═════════════════
  console.log("\n── LV แก้/ปล่อย/เตรียม ระหว่างกำลังส่ง ──");
  if (want("LV")) {
    const U = await small(A, cO, "lv", [...Array.from({ length: 8 }, (_, i) => ({ no: `V${i + 1}`, reading: 60 + i })), { no: "V9", reading: 400, flag: "HIGH" }]);
    const p = await prep(cO, U.u);
    const runId = p.runId;
    const sP = send(cO, U.u, runId);
    let claimed: any = null;
    for (let i = 0; i < 2000 && !claimed; i++) { claimed = await prisma.dormBill.findFirst({ where: { unitId: U.u, status: "DRAFT", sentVia: { startsWith: "sending:" } } }); if (!claimed) await sleep(3); }
    const v8 = await prisma.dormBill.findFirst({ where: { unitId: U.u, leaseId: U.L.V8.leaseId } });
    const v9 = await prisma.dormBill.findFirst({ where: { unitId: U.u, leaseId: U.L.V9.leaseId } });
    const r: Record<string, string> = {};
    if (claimed) r.extraOnClaimed = code(await dorm.setBillExtraLines(cO, { unitId: U.u, billId: claimed.id, lines: [{ kind: "LATE_FEE", labelTh: "ค่าปรับ", amountSatang: 100 }] }));
    r.extraOnLaterDraft = code(await dorm.setBillExtraLines(cO, { unitId: U.u, billId: v8.id, lines: [{ kind: "LATE_FEE", labelTh: "ค่าปรับ", amountSatang: 100 }] }));
    r.extraOnHeld = code(await dorm.setBillExtraLines(cO, { unitId: U.u, billId: v9.id, lines: [{ kind: "OTHER", labelTh: "ค่าซ่อมก๊อก", amountSatang: 100 }] }));
    await dorm.recordAuthorityBill(cO, { unitId: U.u, kind: "ELEC", periodKey: P_UTIL, billSatang: 470_000, units: 1000 });
    r.prep = code(await prep(cO, U.u));
    r.unschedule = code(await dorm.scheduleBillRun(cO, { unitId: U.u, runId, at: null }, { now: new Date(NOW) }));
    const s1 = await sP;
    const fin = await sendAll(cO, U.u, runId, 90_000);
    const a = await audit(U);
    rec("LV-1", a.clean && !a.orphan.length && !a.mism.length && (!claimed || ["BILL_LOCKED", "RUN_BUSY"].includes(r.extraOnClaimed)) && ["BILL_LOCKED", "RUN_BUSY"].includes(r.extraOnLaterDraft) && r.unschedule === "RUN_BUSY", "BLOCKER",
      "ระหว่างส่ง: แก้บิลที่จอง/บิล DRAFT ถัดไป ⇒ BILL_LOCKED · ยกเลิกตั้งเวลา ⇒ RUN_BUSY · ไม่มีใบกำพร้า/ผิดยอด",
      { claimed: !!claimed, r, s1: s1?.ok ? { sent: s1.sent, failed: s1.failed } : code(s1), fin, a });
    rec("LV-2", a.stuckDraft === 0 || fin.some((f: any) => f?.failed?.some((x: any) => x.code === "RUN_STALE")), "MAJOR",
      "หลังส่งจบ: บิลที่เหลือส่งได้ หรือได้ RUN_STALE ต่อบิลชัดเจน (ไม่ค้างเงียบ)", { stuck: a.stuckDraft, fin });
    // ST เดิม: ส่งบางส่วนแล้วข้อมูลเปลี่ยน ⇒ เตรียมใหม่ได้ (F2)
    const pp = await prep(cO, U.u);
    const fin2 = await sendAll(cO, U.u, runId, 60_000);
    const a2 = await audit(U);
    rec("LV-3", a2.clean && a2.stuckDraft === 0, "MAJOR", "หลัง RUN_STALE ต่อบิล ⇒ prepare (รอบ REVIEW) คำนวณใหม่แล้วส่งครบ", { pp: pp?.ok ? { changed: pp.changed, status: pp.status } : code(pp), fin2, a2 });
  }

  // ═════════════════ IC: ref มีใบอยู่แล้ว ═════════════════
  console.log("\n── IC ใบเดิมของ ref ยอดไม่ตรง / ยอดตรง ──");
  if (want("IC")) {
    const U = await small(A, cO, "ic", [{ no: "I1" }, { no: "I2" }, { no: "I3" }]);
    const p = await prep(cO, U.u);
    const b1 = await prisma.dormBill.findFirst({ where: { unitId: U.u, leaseId: U.L.I1.leaseId } });
    const b2 = await prisma.dormBill.findFirst({ where: { unitId: U.u, leaseId: U.L.I2.leaseId } });
    // I1: ใบเดิมยอดอื่น · I2: ใบเดิมยอด/บรรทัดตรงบิล (กู้คืน)
    const bad = await ACC.createExternalInvoice({ tenantId: A, sourceKind: "DORM", unitId: U.u, refType: "DormBill", refId: `${b1.leaseId}:${P_RUN}`, customer: { name: "ผู้เช่า I1" },
      lines: [{ description: "ค่าห้อง", qty: 1, unitPriceSatang: 123_400, taxKind: "NONE" }], vat: NOVAT, issueDate: "2026-10-26" });
    const good = await ACC.createExternalInvoice({ tenantId: A, sourceKind: "DORM", unitId: U.u, refType: "DormBill", refId: `${b2.leaseId}:${P_RUN}`, customer: { name: "ผู้เช่า I2" },
      lines: ACCB.dormBillInvoiceLines({ lines: b2.lines, subtotalSatang: b2.subtotalSatang, vatSatang: b2.vatSatang, totalSatang: b2.totalSatang }), vat: NOVAT, issueDate: "2026-10-26", dueDate: b2.dueDate.toISOString().slice(0, 10) });
    const s = await sendAll(cO, U.u, p.runId, 30_000);
    const f1 = s.flatMap((x: any) => x?.failed ?? []).find((f: any) => f.billId === b1.id);
    const b1a = await bill(b1.id), b2a = await bill(b2.id);
    const pp = await prep(cO, U.u);
    const b1b = await bill(b1.id);
    rec("IC-1", ["INVOICE_CONFLICT", "INVOICE_MISMATCH"].includes(f1?.code) && f1?.docId === bad.docId && !!b1a && b1a.status === "DRAFT" && !!b1b && b1b.id === b1.id, "BLOCKER",
      "ref มีใบยอดอื่น ⇒ failed INVOICE_CONFLICT/MISMATCH + docId เดิม · บิลไม่ถูกลบ (แม้เตรียมใหม่)", { bad: code(bad), f1, b1a: b1a ? { st: b1a.status, via: b1a.sentVia } : null, b1b: !!b1b, pp: code(pp) });
    rec("IC-2", b2a?.status === "SENT" && b2a?.accountDocumentId === good.docId, "MAJOR", "ref มีใบยอด/บรรทัดตรงบิล ⇒ ผูกใบเดิม + SENT (กู้คืน)", { good: code(good), b2: { st: b2a?.status, doc: b2a?.accountDocumentId === good.docId } });
    // ทางแก้ที่ข้อความบอก: ยกเลิกใบเดิม แล้วส่งอีกครั้ง
    let vd: any;
    try { vd = await ASV.voidDocument(A, U.book, bad.docId, "ทดสอบ probe ยกเลิกใบยอดผิด"); } catch (e) { vd = { threw: errMsg(e) }; }
    const sv = await sendAll(cO, U.u, p.runId, 30_000);
    const b1c = await bill(b1.id);
    rec("IC-3", b1c?.status === "SENT", "MAJOR", "ทำตามข้อความ (ยกเลิกใบเดิมในบัญชี แล้วส่งอีกครั้ง) ⇒ ต้องออกได้ ไม่ค้าง INVOICE_CONFLICT ถาวร",
      { void: vd?.threw ?? (vd?.ok === false ? vd : "ok"), after: sv.slice(-1), b1: { st: b1c?.status, via: String(b1c?.sentVia).slice(0, 8) } });
    const a = await audit(U);
    rec("IC-4", a.arNet === a.expectAr && !a.unbal, "BLOCKER", "AR หอ IC = Σ บิล SENT (ใบที่ยกเลิกกลับรายการแล้ว)", a);
  }

  // ═════════════════ F13: ลิงก์จ่ายหลังใบลด/เพิ่มหนี้ + ฟังก์ชันใหม่ข้ามร้าน ═════════════════
  console.log("\n── F13 ลิงก์จ่าย PENDING เดียวต่อเอกสาร · cancelOtherPendingPaymentRequests ข้ามร้าน ──");
  if (want("F13")) {
    const U = await small(A, cO, "f13", [{ no: "Y1" }, { no: "Y2" }, { no: "Y3" }]);
    const p = await prep(cO, U.u);
    await sendAll(cO, U.u, p.runId);
    const bs = await prisma.dormBill.findMany({ where: { unitId: U.u }, orderBy: { createdAt: "asc" } });
    const pend = async (docId: string) => (await prisma.accountPaymentRequest.findMany({ where: { documentId: docId, status: "PENDING" } })).map((x: any) => x.amountSatang);
    const outstanding = async (b: any) => {
      const cn = await prisma.accountDocument.findMany({ where: { sourceDocId: b.accountDocumentId, docType: { in: ["CREDIT_NOTE", "DEBIT_NOTE"] }, status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } } });
      return b.totalSatang - cn.filter((d: any) => d.docType === "CREDIT_NOTE").reduce((s: number, d: any) => s + d.grandTotal, 0);
    };
    const adj = (b: any, kind: string, key: string, amt: number) => dorm.adjustSentBill(cO, { unitId: U.u, billId: b.id, kind, reason: "ปรับยอดตามที่ตกลงกับผู้เช่าแล้ว", idempotencyKey: key, lines: [{ code: "ELEC", labelTh: "ปรับค่าไฟ", amountSatang: amt }] });
    const c1 = await adj(bs[0], "CREDIT", "c1", 2_000);
    const p0 = await pend(bs[0].accountDocumentId);
    const d1 = await adj(bs[1], "DEBIT", "d1", 3_000);
    const p1 = await pend(bs[1].accountDocumentId);
    const p1d = d1?.docId ? await pend(d1.docId) : [];
    rec("F13-1", c1?.ok && p0.length === 1 && p0[0] === (await outstanding(bs[0])), "MAJOR", "ลดหนี้แล้ว ⇒ ลิงก์ PENDING ของใบแจ้งหนี้ = 1 ใบ ยอด = คงค้างใหม่", { c1: code(c1), p0, out: await outstanding(bs[0]) });
    rec("F13-2", d1?.ok && p1.length === 1, "MINOR", "เพิ่มหนี้แล้ว ⇒ ลิงก์ของใบแจ้งหนี้เดิมยังเป็น 1 ใบ (ใบเพิ่มหนี้เก็บแยก)", { d1: code(d1), invoicePending: p1, debitNotePending: p1d });
    // ช่องรับเงินปิดชั่วคราวตอนลดหนี้ ⇒ ไม่มีลิงก์ใหม่ · ลิงก์เดิมถูกยกเลิก? แล้วเปิดคืน ⇒ ต้องได้ลิงก์กลับมา
    await prisma.accountFinance.updateMany({ where: { systemId: U.book }, data: { useForReceive: false } });
    const c3 = await adj(bs[2], "CREDIT", "c3", 1_000);
    const p3a = await pend(bs[2].accountDocumentId);
    await prisma.accountFinance.updateMany({ where: { systemId: U.book }, data: { useForReceive: true } });
    const rs = await send(cO, U.u, p.runId);
    await sleep(200);
    const p3b = await pend(bs[2].accountDocumentId);
    const b3 = await bill(bs[2].id);
    const b3pr = b3?.paymentRequestId && !String(b3.paymentRequestId).startsWith("claim:") ? await prisma.accountPaymentRequest.findFirst({ where: { id: b3.paymentRequestId } }) : null;
    rec("F13-3", p3b.length === 1 && b3pr?.status === "PENDING", "MAJOR", "ลดหนี้ตอนช่องรับเงินปิด ⇒ ห้ามเหลือ 0 ลิงก์ถาวร: เปิดช่องคืนแล้วส่งซ้ำต้องได้ลิงก์ PENDING 1 ใบ (paymentRequestId ชี้ใบที่ใช้ได้)",
      { c3: code(c3), pendingWhileClosed: p3a, pendingAfterReopen: p3b, billPr: b3?.paymentRequestId ? String(b3.paymentRequestId).slice(0, 10) : null, billPrStatus: b3pr?.status, payLinkPending: rs?.payLinkPending });
    // ข้ามร้าน: ฟังก์ชันใหม่ของ account facade
    const docA = bs[0].accountDocumentId;
    const before = await pend(docA);
    const BOOK_B = await mkBook(B, `บัญชี PB B ${stamp}`);
    const x1 = await ACC.cancelOtherPendingPaymentRequests({ tenantId: B, systemId: U.book }, docA, null, OWNB);
    const x2 = await ACC.cancelOtherPendingPaymentRequests({ tenantId: B, systemId: BOOK_B }, docA, null, OWNB);
    const otherBookA = await mkBook(A, `บัญชี PB A2 ${stamp}`);
    const x3 = await ACC.cancelOtherPendingPaymentRequests({ tenantId: A, systemId: otherBookA }, docA, null, OWN);
    const after = await pend(docA);
    rec("F13-4", x1 === 0 && x2 === 0 && x3 === 0 && J(before) === J(after) && before.length === 1, "BLOCKER", "cancelOtherPendingPaymentRequests: ร้าน B / สมุดอื่น ⇒ ยกเลิก 0 ใบ ลิงก์ร้าน A ยังอยู่", { x1, x2, x3, before, after });
    const a = await audit(U);
    rec("F13-5", a.arNet === a.expectAr && !a.unbal && a.prDupDocs === 0, "MAJOR", "บัญชี F13 สะอาด · PENDING ไม่ซ้ำต่อเอกสาร", a);
  }

  // ═════════════════ BO: backoff/คิวงานตามเวลา (ร้าน D) ═════════════════
  console.log("\n── BO รอบด่านไม่ผ่าน/ว่าง ≥ 51 รอบ vs รอบตั้งเวลาที่ถึงคิว ──");
  if (want("BO")) {
    const N = 55;
    const T = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 26, h, m)).toISOString();
    const W: Unit[] = [];
    const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      const u = await small(D, cD, `w${i}`, [{ no: `W${i}` }], { book: null, auth: null });
      await setVal(D, "rooms.utility.elec.method", "UNIT", u.u, "FIXED_RATE");
      await setVal(D, "rooms.utility.elec.fixedRate", "UNIT", u.u, 400);
      const pw = await dorm.prepareBillRun(cD, { unitId: u.u, periodKey: P_RUN }, { now: new Date(T(0)) });
      if (!pw?.ok) throw new Error(`prepare W${i}: ${J(pw)}`);
      W.push(u);
    }
    console.log(`  (ฉาก ${N} หอ ${Math.round((Date.now() - t0) / 1000)} วิ)`);
    const G = await small(D, cD, "g", [{ no: "G1" }, { no: "G2" }]);
    const pg = await dorm.prepareBillRun(cD, { unitId: G.u, periodKey: P_RUN }, { now: new Date(T(0)) });
    const sg = await dorm.scheduleBillRun(cD, { unitId: G.u, runId: pg.runId, at: T(1) }, { now: new Date(T(0)) });
    await prisma.accountSystemLink.updateMany({ where: { tenantId: D, linkedId: G.u }, data: { enabled: false } });
    const job = (iso: string) => dorm.runDormBillingJobs(new Date(iso), { tenantId: D });
    const docsG = () => prisma.accountDocument.count({ where: { tenantId: D, refSystemId: G.u, docType: "INVOICE" } });
    const j1 = await job(T(2));
    const gRun1 = await prisma.dormBillRun.findFirst({ where: { id: pg.runId } });
    await prisma.accountSystemLink.updateMany({ where: { tenantId: D, linkedId: G.u }, data: { enabled: true } });
    const j2 = await job(T(2, 10)), d2 = await docsG();
    const j3 = await job(T(3)), d3 = await docsG();
    rec("BO-1", d3 === 2, "MAJOR", `รอบตั้งเวลาที่เคยล้ม (backoff หมดแล้ว · แก้สมุดแล้ว) ต้องถูกหยิบส่ง แม้มีรอบ DRAFT ว่าง ${N} รอบ (ไม่ตั้งเวลา/ไม่ autoSend)`,
      { sched: code(sg), j1, progress1: gRun1?.progress, j2, d2, j3, d3 });
    // positive control: เหลือรอบว่าง 49 ⇒ G ต้องถูกหยิบ
    for (const u of W.slice(0, 6)) { await prisma.dormBill.deleteMany({ where: { unitId: u.u } }); await prisma.dormBillRun.deleteMany({ where: { unitId: u.u } }); }
    const j4 = await job(T(3, 30)), d4 = await docsG();
    rec("BO-2", d4 === 2, "MINOR", "positive control BO-1: ลบรอบว่าง 6 เหลือ 49 ⇒ G ส่งได้ (ยืนยันว่าสาเหตุคือคิว LIMIT 50)", { j4, d4 });
    // รอบด่านไม่ผ่านตั้งเวลา 49 รอบ + G2 ตั้งเวลาทีหลัง
    const Wl = W; // ทุกหอ W มีรอบอีกครั้ง (งาน (ข) เตรียมคืนให้ 6 หอที่ลบ)
    for (const u of Wl) {
      const r = await prisma.dormBillRun.findFirst({ where: { unitId: u.u } });
      const s = await dorm.scheduleBillRun(cD, { unitId: u.u, runId: r.id, at: T(4, 50) }, { now: new Date(T(4, 40)) });
      if (!s?.ok) throw new Error(`schedule W: ${J(s)}`);
    }
    const G2 = await small(D, cD, "g2", [{ no: "H1" }, { no: "H2" }]);
    const pg2 = await dorm.prepareBillRun(cD, { unitId: G2.u, periodKey: P_RUN }, { now: new Date(T(0)) });
    await dorm.scheduleBillRun(cD, { unitId: G2.u, runId: pg2.runId, at: T(4, 55) }, { now: new Date(T(4, 40)) });
    const docsG2 = () => prisma.accountDocument.count({ where: { tenantId: D, refSystemId: G2.u, docType: "INVOICE" } });
    const tA = Date.now();
    const h1 = await job(T(5)), e1 = await docsG2(), ms1 = Date.now() - tA;
    const backed = (await prisma.dormBillRun.findMany({ where: { tenantId: D, unitId: { in: Wl.map((x) => x.u) } }, select: { progress: true } })).filter((r: any) => r.progress && r.progress.nextAttemptAt).length;
    const h2 = await job(T(5, 1)), e2 = await docsG2();
    rec("BO-3", e1 === 2, "MAJOR", `รอบตั้งเวลาด่านไม่ผ่าน ${Wl.length} รอบ (ถึงคิวก่อน) ⇒ G2 (ตั้งเวลาทีหลัง 5 นาที) ต้องส่งได้ในรอบงานแรก`, { h1, e1, ms1, backedOff: backed, h2, e2 });
    rec("BO-4", e2 === 2, "BLOCKER", "รอบงานถัดไป (รอบล้มถอยเวลาแล้ว) ⇒ G2 ส่งครบ", { e2 });
  }
} catch (e) {
  console.log(`💥 CRASH: ${e instanceof Error ? e.stack : String(e)}`);
  exitCode = 2;
} finally {
  await cleanup(tenantIds);
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d8pc-" } } });
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d8pc-" } } });
  console.log(`\n── ล้าง: tenant ค้าง ${left} ──`);
  const bad = results.filter((r) => !r.ok);
  console.log(`\nPROBE_SUMMARY ${J({ total: results.length, fail: bad.map((r) => `${r.id}:${r.sev}`) })}`);
  await prisma.$disconnect();
  process.exit(exitCode || (bad.length ? 1 : 0));
}


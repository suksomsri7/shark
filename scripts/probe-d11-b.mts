// PROBE — SVC D.11 reviewer B (โจมตีด้วยหลายโพรเซส) · ไม่ใช่ข้อสอบ · ไม่แก้ src · ไม่ส่งข้อความจริง (หน่วยทดสอบไม่มี OA ⇒ NO_CHANNEL)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d11-b.mts
// ข้อมูลใต้ร้าน `qc-svc-d11pb-*` + ผู้ใช้ `svc-d11pb-*@shark.local` · ล้างใน finally ทุกครั้ง
// หมวด: WS ยกเว้นระหว่างส่งรอบ (หนี้ #6) · MX ผสมเงิน 4 โพรเซส 3 เฟส · TB ไม่ทบต้น · WA ยกเว้น/อนุมัติ · DN เตือน/ทวง · XT ข้ามร้าน/สิทธิ์
/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const DORM_IDX = "src/lib/modules/dorm/index.ts";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };
const revive = (_k: string, v: any) => (v && typeof v === "object" && typeof v.__date === "string" ? new Date(v.__date) : v);
const D = (iso: string) => ({ __date: iso });

// ── ด่านฐาน (QC เท่านั้น) ──
for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
  const u = process.env[n] ?? "";
  let hn = "";
  try { hn = new URL(u).hostname; } catch { /* */ }
  if (!hn.includes("ep-mute-scene")) { console.error(`🔴 probe: ${n} ไม่ใช่ฐาน qc-svc — หยุด`); process.exit(4); }
}
if (process.env.APP_ENV === "production" || process.env.CI) { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }

type Call = { m: "dorm" | "acc" | "aps"; op: string; args: any[] };
// ═══════════ โหมดลูก ═══════════
const CA = process.argv.indexOf("--child");
if (CA >= 0) {
  const job = JSON.parse(Buffer.from(process.argv[CA + 1] ?? "", "base64url").toString("utf8"), revive) as { calls: Call[]; at: number };
  let out: unknown[] = [];
  try {
    const mods: Record<string, any> = {
      dorm: await import(pathToFileURL(join(ROOT, DORM_IDX)).href),
      acc: await import("@/lib/modules/account" as string),
      aps: await import("@/lib/modules/approval/service" as string),
    };
    const wait = job.at - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    out = await Promise.all(job.calls.map(async (c) => {
      const t0 = Date.now();
      try { const r = await mods[c.m][c.op](...c.args); return { op: c.op, r, ms: Date.now() - t0 }; }
      catch (e) { return { op: c.op, threw: errMsg(e), ms: Date.now() - t0 }; }
    }));
  } catch (e) { out = [{ childFail: errMsg(e) }]; }
  console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
  try { const { prisma } = (await import("@/lib/core/db" as string)) as any; await prisma.$disconnect(); } catch { /* */ }
  process.exit(0);
}

{
  const { appendFileSync } = await import("node:fs");
  const LOG = `/tmp/probe-d11-b.out.${process.pid}.log`;
  process.stdout.on("error", () => { /* */ });
  const orig = console.log.bind(console);
  console.log = (...a: unknown[]) => { try { appendFileSync(LOG, `${a.map((x) => (typeof x === "string" ? x : J(x))).join(" ")}\n`); } catch { /* */ } try { orig(...a); } catch { /* */ } };
  console.log(`(probe log: ${LOG} · start ${new Date().toISOString()})`);
}

async function procs(jobs: Call[][], leadMs = 14_000): Promise<any[][]> {
  const at = Date.now() + leadMs;
  return Promise.all(jobs.map((calls) => new Promise<any[]>((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify({ calls, at })).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\[.*\])/.exec(buf);
      let out: any[] = [];
      try { out = m ? JSON.parse(m[1]) : [{ childFail: `exit=${code} ${buf.split("\n").slice(-3).join(" | ").slice(0, 200)}` }]; } catch { out = [{ childFail: "parse" }]; }
      resolve(out);
    });
  })));
}

type F = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: F[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown) => {
  results.push({ id, ok, sev, what, detail: typeof detail === "string" ? detail : J(detail) });
  console.log(`  ${ok ? "✅ HOLD" : "❌ BREACH"} [${id}] (${sev}) ${what}${` — ${typeof detail === "string" ? detail : J(detail)}`.slice(0, 2400)}`);
};
const BADRX = /P2028|P2024|P2002|P2034|40P01|timed out|Unable to start a transaction|Transaction already closed/i;
const badOf = (rs: any[]) => rs.filter((x) => x?.threw || x?.childFail || x?.r?.code === "INTERNAL" || BADRX.test(J(x)));
const codeOf = (x: any) => (x?.threw ? `THREW` : x?.r === null ? "null" : x?.r?.ok === true ? "OK" : x?.r?.code ?? x?.r?.status ?? J(x?.r).slice(0, 40));
const tally = (rs: any[]) => { const t: Record<string, number> = {}; for (const x of rs) { const k = `${x?.op}:${codeOf(x)}`; t[k] = (t[k] ?? 0) + 1; } return t; };

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const dorm: any = await import(pathToFileURL(join(ROOT, DORM_IDX)).href);
const calc: any = await import(pathToFileURL(join(ROOT, "src/lib/modules/dorm/calc.ts")).href);
const ACC: any = await import("@/lib/modules/account" as string);
const SYS: any = await import("@/lib/modules/system/service" as string);
const ASV: any = await import("@/lib/modules/account/service" as string);
const GL: any = await import("@/lib/modules/account/gl" as string);
const SET: any = await import("@/lib/core/settings" as string);
const APS: any = await import("@/lib/modules/approval/service" as string);
const PRISMA_NS: any = (await import("@prisma/client" as string)).Prisma;

const P1 = "2026-10", P2 = "2026-11", P3 = "2026-12";
const NOW1 = "2026-09-25T03:00:00.000Z", NOW_W1 = "2026-10-20T03:00:00.000Z", NOW2 = "2026-10-25T03:00:00.000Z", NOW_A = "2026-10-27T03:00:00.000Z", NOW3 = "2026-11-26T03:00:00.000Z";
const PAY = (ymd: string) => new Date(`${ymd}T05:00:00.000Z`);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RENT = 450_000, COMMON = 30_000, BASE = RENT + COMMON;
const G0 = { "rooms.lateFee.graceDays": 0 };
const RSN = "ผู้เช่าโอนผิดบัญชี ตรวจสอบหลักฐานแล้วจริง";
const lineOf = (b: any, code: string) => (Array.isArray(b?.lines) ? b.lines.find((l: any) => l.code === code) : undefined);
const lateOf = (b: any) => { const l = lineOf(b, "LATE_FEE"); return l ? Number(l.grossSatang ?? l.amountSatang ?? 0) : 0; };
const autoOf = (b: any): any[] => { const a = lineOf(b, "LATE_FEE")?.meta?.auto; if (typeof a !== "string") return []; try { const v = JSON.parse(a); return Array.isArray(v) ? v : []; } catch { return []; } };

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
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d11pb-" } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: { id: string }) => t.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d11pb-" } } });

  // ═══════════ fixtures (แบบข้อสอบ d.11) ═══════════
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `PB D11 ${tag}`, slug: `qc-svc-d11pb-${tag}-${stamp}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b"), C = await mkTenant("c"), Dt = await mkTenant("d");
  const mkUnit = async (tenantId: string, type: string, tag: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name: `หอ PB11 ${tag}`, slug: `pb11${tag}-${stamp}` } })).id as string;
  const mkBook = async (tenantId: string, name: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: false });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = [], accepted = true) => {
    const u = await prisma.user.create({ data: { email: `svc-d11pb-${stamp}-${key}@shark.local`, name: `PB11 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: accepted ? new Date() : null } });
    return { id: u.id as string, mid: m.id as string };
  };
  const U = async (tenantId: string, unitId: string, key: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId: unitId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId: unitId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "pb-d11" } });
  };
  let seq = 0;
  const RUNNUM = 100000 + Math.floor(Math.random() * 800000);
  const newPhone = () => `08${String((RUNNUM % 1000) * 100000 + ++seq).padStart(8, "0").slice(-8)}`;
  type Unit = { u: string; tenantId: string; book: string; R: Record<string, string>; L: Record<string, { leaseId: string; partyId: string }> };
  const dormUnit = async (tenantId: string, tag: string, book: string, rooms: { no: string; patch?: Record<string, unknown>; name?: string }[]): Promise<Unit> => {
    const u = await mkUnit(tenantId, "DORM", tag);
    await prisma.accountSystemLink.create({ data: { tenantId, systemId: book, linkedKind: "BUSINESS", linkedId: u, enabled: true } });
    await U(tenantId, u, "rooms.utility.elec.metering", "NONE");
    await U(tenantId, u, "rooms.utility.water.metering", "NONE");
    const ty = (await prisma.hotelRoomType.create({ data: { tenantId, unitId: u, name: "มาตรฐาน", capacity: 2, baseRateSatang: RENT, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id;
    const bld = (await prisma.roomBuilding.create({ data: { tenantId, unitId: u, name: `อาคาร ${tag}`, floors: 3, sortOrder: 1 } })).id;
    const R: Unit["R"] = {}, L: Unit["L"] = {};
    for (const r of rooms) {
      R[r.no] = (await prisma.hotelRoom.create({ data: { tenantId, unitId: u, roomTypeId: ty, number: r.no, buildingId: bld, floorNo: 1, floor: "1" } })).id;
      const party = await prisma.party.create({ data: { tenantId, name: r.name ?? `ผู้เช่าห้อง ${r.no}`, phone: newPhone() } });
      const s = await SET.snapshotPolicy({ tenantId }, "lease", { unitId: u, roomTypeId: ty, roomId: R[r.no] });
      const l = await prisma.dormLease.create({ data: {
        tenantId, unitId: u, roomId: R[r.no], partyId: party.id, status: "ACTIVE", startDate: dbDate("2026-01-01"), endDate: dbDate("2027-12-31"),
        rentSatang: RENT, commonFeeSatang: COMMON, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0,
        coTenants: { occupants: [], vehicles: [] }, policySnapshot: { ...s, values: { ...(s?.values ?? {}), ...(r.patch ?? {}) } }, signedAt: new Date(), createdById: "pb-d11",
      } });
      const oc = await prisma.roomOccupancy.create({ data: { tenantId, unitId: u, roomId: R[r.no], startDate: dbDate("2026-01-01"), endDate: dbDate("2028-01-01"), kind: "LEASE", refType: "DormLease", refId: l.id } });
      await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
      L[r.no] = { leaseId: l.id, partyId: party.id };
    }
    return { u, tenantId, book, R, L };
  };
  const prep = (ctx: any, u: string, P: string, now: string): Promise<any> => dorm.prepareBillRun(ctx, { unitId: u, periodKey: P }, { now: new Date(now) });
  const sendAll = async (ctx: any, u: string, runId: string, now: string) => {
    let last: any = null;
    for (let i = 0; i < 40; i++) { last = await dorm.sendBillRun(ctx, { unitId: u, runId }, { now: new Date(now) }); if (!last?.ok || last.done) break; if (last.sent === 0) await sleep(1_500); }
    return last;
  };
  /** เตรียม+ส่งจนไม่มี DRAFT (เตรียมซ้ำเมื่อ RUN_STALE) */
  const settle = async (ctx: any, u: string, P: string, now: string) => {
    const log: any[] = [];
    for (let i = 0; i < 5; i++) {
      const p = await prep(ctx, u, P, now);
      const s = p?.ok ? await sendAll(ctx, u, p.runId, now) : null;
      const drafts = await prisma.dormBill.count({ where: { unitId: u, periodKey: P, status: "DRAFT" } });
      log.push({ p: p?.ok ? p.changed : p?.code, s: s?.ok ? { done: s.done, sent: s.sent, failed: (s.failed ?? []).map((f: any) => f.code) } : s?.code, drafts });
      if (!drafts) break;
      await sleep(1_000);
    }
    return log;
  };
  const billsOf = async (u: Unit, P: string) => { const o: Record<string, any> = {}; for (const no of Object.keys(u.L)) o[no] = await prisma.dormBill.findFirst({ where: { unitId: u.u, leaseId: u.L[no].leaseId, periodKey: P } }); return o; };
  let payN = 0;
  const payArgs = (tenantId: string, b: any, amount: number, ymd: string) => ({ tenantId, unitId: b.unitId, docId: b.accountDocumentId, amountSatang: amount, idempotencyKey: `pb-d11-${stamp}-${++payN}`, paidAt: PAY(ymd) });
  const pay = async (tenantId: string, b: any, amount: number, ymd: string) => {
    const r = await ACC.recordExternalPayment(payArgs(tenantId, b, amount, ymd));
    if (!r?.ok) throw new Error(`fixture รับชำระ ${b?.id}: ${r?.code} ${r?.reason ?? ""}`);
    return r;
  };
  const payJ = (tenantId: string, b: any, amount: number, ymd: string): Call => ({ m: "acc", op: "recordExternalPayment", args: [{ ...payArgs(tenantId, b, amount, ymd), paidAt: D(PAY(ymd).toISOString()) }] });
  const waive = (ctx: any, u: string, srcId: string, now: string, reason = RSN): Promise<any> => dorm.waiveLateFee(ctx, { unitId: u, sourceBillId: srcId, reason }, { now: new Date(now) });
  const waiveJ = (ctx: any, u: string, srcId: string, now: string): Call => ({ m: "dorm", op: "waiveLateFee", args: [ctx, { unitId: u, sourceBillId: srcId, reason: RSN }, { now: D(now) }] });
  const octSent = async (ctx: any, U1: Unit) => {
    const p = await prep(ctx, U1.u, P1, NOW1);
    const s = p?.ok ? await sendAll(ctx, U1.u, p.runId, NOW1) : null;
    if (!(p?.ok && s?.ok && s.done)) throw new Error(`ฉากรอบ ต.ค. ${U1.u}: ${J(p).slice(0, 200)} ${J(s).slice(0, 200)}`);
    return billsOf(U1, P1);
  };

  /** ตรวจเงิน/ค่าปรับทั้งหน่วย (ทุกงวด) */
  const moneyAudit = async (U1: Unit, capOf: (leaseId: string) => number | null) => {
    const bills = await prisma.dormBill.findMany({ where: { unitId: U1.u } });
    const waivedRows = await prisma.auditLog.findMany({ where: { tenantId: U1.tenantId, action: "dorm.latefee.waived" }, select: { targetId: true } });
    const waived = new Set(waivedRows.map((x: any) => x.targetId));
    const dupWaived = waivedRows.length - waived.size;
    const docs = await prisma.accountDocument.findMany({ where: { tenantId: U1.tenantId, systemId: U1.book } });
    const live = docs.filter((d: any) => !["DRAFT", "VOIDED", "CANCELLED", "VOID"].includes(d.status));
    const bad: string[] = [];
    const breach6: any[] = [];
    const perSrc = new Map<string, number>();
    for (const b of bills) {
      const cap = capOf(b.leaseId);
      if (cap !== null && lateOf(b) > cap) bad.push(`target ${b.periodKey}/${b.id.slice(-5)} LATE ${lateOf(b)} > E ${cap}`);
      const es = autoOf(b);
      if (new Set(es.map((e) => e.sourceBillId)).size !== es.length) bad.push(`dup entry ${b.id.slice(-5)}`);
      const bySrc = new Map<string, number>();
      for (const e of es) { perSrc.set(e.sourceBillId, (perSrc.get(e.sourceBillId) ?? 0) + Number(e.amountSatang)); bySrc.set(e.sourceBillId, (bySrc.get(e.sourceBillId) ?? 0) + Number(e.amountSatang)); }
      for (const [src, amt] of bySrc) {
        if (!waived.has(src)) continue;
        if (b.status === "DRAFT" || b.status === "HELD") bad.push(`waived src ${src.slice(-5)} still in ${b.status} ${b.periodKey}`);
        if (["SENT", "PARTIALLY_PAID", "PAID"].includes(b.status)) {
          const cn = live.filter((d: any) => d.docType === "CREDIT_NOTE" && d.refId === `${b.id}:waive:${src}`);
          const cnSum = cn.reduce((s: number, d: any) => s + d.grandTotal, 0);
          if (cnSum !== amt) breach6.push({ target: `${b.periodKey}/${b.id.slice(-6)}`, src: src.slice(-6), feeInSentBill: amt, creditNote: cnSum });
        }
      }
      if (b.accountDocumentId) {
        const d = docs.find((x: any) => x.id === b.accountDocumentId);
        if (!d || d.grandTotal !== b.totalSatang) bad.push(`invoice≠bill ${b.id.slice(-5)} ${d?.grandTotal}≠${b.totalSatang}`);
      }
    }
    for (const [src, v] of perSrc) { const sb = bills.find((x: any) => x.id === src); const cap = sb ? capOf(sb.leaseId) : null; if (cap !== null && v > cap) bad.push(`src ${src.slice(-5)} Σauto ${v} > E ${cap}`); }
    const refDup = new Map<string, number>();
    for (const d of live.filter((x: any) => x.docType === "CREDIT_NOTE" || x.docType === "DEBIT_NOTE")) refDup.set(`${d.docType}:${d.refId}`, (refDup.get(`${d.docType}:${d.refId}`) ?? 0) + 1);
    const dupDocs = [...refDup.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    // GL
    const ar = await prisma.accountLedger.findFirst({ where: { systemId: U1.book, code: "1100" } });
    const lines = await prisma.accountJournalLine.findMany({ where: { systemId: U1.book }, select: { entryId: true, accountId: true, debit: true, credit: true } });
    const arNet = lines.filter((l: any) => l.accountId === ar?.id).reduce((s: number, l: any) => s + l.debit - l.credit, 0);
    const byE = new Map<string, number>();
    for (const l of lines) byE.set(l.entryId, (byE.get(l.entryId) ?? 0) + l.debit - l.credit);
    const unbal = [...byE.values()].filter((v) => v !== 0).length;
    const pays = await prisma.accountDocumentPayment.findMany({ where: { tenantId: U1.tenantId, systemId: U1.book, voidedAt: null }, select: { amount: true, documentId: true } });
    const want = live.filter((d: any) => ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"].includes(d.docType)).reduce((s: number, d: any) => s + (d.docType === "CREDIT_NOTE" ? -d.grandTotal : d.grandTotal), 0) - pays.reduce((s: number, p: any) => s + p.amount, 0);
    // ใบแจ้งหนี้ถูกลด+รับเกินยอด (ใบลดหนี้ชนรับชำระ)
    const over: any[] = [];
    for (const d of live.filter((x: any) => x.docType === "INVOICE")) {
      const lg = await ACC.docPaymentLedger(U1.tenantId, d.id);
      if (lg && lg.grandTotal - lg.liveTieOffSatang - lg.creditNoteSatang < 0) over.push({ doc: d.id.slice(-6), grand: lg.grandTotal, paid: lg.liveTieOffSatang, credit: lg.creditNoteSatang });
    }
    return { bad, breach6, dupDocs, dupWaived, arNet, want, unbal, over, waived: waived.size, clean: !bad.length && !breach6.length && !dupDocs.length && !dupWaived && arNet === want && !unbal };
  };

  const OWN = await mkUser("own-a", A, "OWNER", ["*"]);
  const OWN2 = await mkUser("own2-a", A, "OWNER", ["*"]);
  const OWNB = await mkUser("own-b", B, "OWNER", ["*"]);
  const OWNC = await mkUser("own-c", C, "OWNER", ["*"]);
  const OWND = await mkUser("own-d", Dt, "OWNER", ["*"]);
  const cO = { tenantId: A, actorUserId: OWN.id }, cB = { tenantId: B, actorUserId: OWNB.id }, cC = { tenantId: C, actorUserId: OWNC.id }, cD = { tenantId: Dt, actorUserId: OWND.id };
  const mOwn = (_t: string, uid: string) => ({ role: "OWNER", unitAccess: ["*"], permissions: {}, userId: uid });
  const BOOK_A = await mkBook(A, `บัญชี PB11 A ${stamp}`);

  // ═════════════════ WS: ยกเว้นระหว่างที่รอบปลายทางกำลังส่ง (หนี้ #6) ═════════════════
  console.log("\n── WS ยกเว้นค่าปรับระหว่างส่งรอบ พ.ย. (บิลปลายทาง DRAFT ในรอบ REVIEW / ถูกจองส่ง) ──");
  {
    const rooms = Array.from({ length: 12 }, (_, i) => ({ no: `W${String(i + 1).padStart(2, "0")}`, patch: G0 }));
    const WS = await dormUnit(A, "ws", BOOK_A, rooms);
    const oct = await octSent(cO, WS);
    for (const no of Object.keys(oct)) await pay(A, oct[no], BASE, "2026-10-09"); // ช้า 4 วัน ⇒ 20,000
    const p2 = await prep(cO, WS.u, P2, NOW2);
    const nov0 = await billsOf(WS, P2);
    const fees0 = Object.values(nov0).map((b: any) => lateOf(b));
    const targets = ["W08", "W09", "W10", "W11", "W12"];
    const childP = procs([[{ m: "dorm", op: "sendBillRun", args: [cO, { unitId: WS.u, runId: p2.runId }, { now: D(NOW2), budgetMs: 240_000 }] }]], 10_000);
    let firstSent = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 90_000) {
      const n = await prisma.dormBill.count({ where: { runId: p2.runId, status: "SENT" } });
      if (n >= 1) { firstSent = true; break; }
      await sleep(30);
    }
    const before = Object.fromEntries(await Promise.all(targets.map(async (no) => { const b = await prisma.dormBill.findFirst({ where: { id: nov0[no].id } }); return [no, `${b.status}${String(b.sentVia ?? "").startsWith("sending") ? "+claim" : ""}`]; })));
    const runSt = (await prisma.dormBillRun.findFirst({ where: { id: p2.runId } }))?.status;
    const wr = await Promise.all(targets.map((no) => waive(cO, WS.u, oct[no].id, NOW2)));
    const childOut = (await childP).flat();
    const fin = await settle(cO, WS.u, P2, NOW2);
    const nov = await billsOf(WS, P2);
    const per = targets.map((no, i) => {
      const b = nov[no];
      return { no, atWaive: before[no], waive: wr[i]?.ok ? `${wr[i].status}/cn${(wr[i].creditNotes ?? []).length}` : wr[i]?.code, final: b?.status, fee: lateOf(b) };
    });
    const ma = await moneyAudit(WS, () => 50_000);
    const leaked = per.filter((x) => x.final !== "DRAFT" && x.fee > 0);
    rec("WS-1", firstSent && !ma.breach6.length, "BLOCKER",
      "ยกเว้นค่าปรับขณะบิลปลายทางอยู่ในรอบที่กำลังส่ง ⇒ บิลต้องไม่ถูกส่งพร้อมค่าปรับที่ยกเว้นแล้วโดยไม่มีใบลดหนี้ (หนี้ #6)",
      { fees0: [...new Set(fees0)], runAtWaive: runSt, per, leakedNoCredit: ma.breach6, child: tally(childOut), fin });
    rec("WS-2", ma.clean || (ma.breach6.length > 0 && !ma.bad.length && ma.arNet === ma.want && !ma.unbal), "BLOCKER", "บัญชี WS: GL สมดุล · AR = Σ เอกสาร · ใบ = บิล · ไม่มีเอกสารซ้ำ", { ...ma, breach6: ma.breach6.length });
    void leaked;
  }

  // ═════════════════ TB: ไม่ทบต้น — บิลค้างหลายงวด · รับชำระบางส่วน · % จากเงินต้นเท่านั้น ═════════════════
  console.log("\n── TB ไม่ทบต้น · ค้างหลายงวด · จ่ายบางส่วน ──");
  {
    const PCT = { "rooms.lateFee.kind": "PERCENT", "rooms.lateFee.percentBp": 500, "rooms.lateFee.graceDays": 0, "rooms.lateFee.capPerBill": null };
    const DAYX = { "rooms.lateFee.kind": "PER_DAY", "rooms.lateFee.amount": 5_000, "rooms.lateFee.graceDays": 0, "rooms.lateFee.capPerBill": null };
    const TB = await dormUnit(A, "tb", BOOK_A, [{ no: "T1", patch: PCT }, { no: "T3", patch: PCT }, { no: "T4", patch: PCT }, { no: "T5", patch: { ...G0 } }, { no: "T6", patch: DAYX }]);
    const oct = await octSent(cO, TB);
    await pay(A, oct.T1, 200_000, "2026-10-03"); await pay(A, oct.T1, 280_000, "2026-10-20");
    await pay(A, oct.T4, BASE, "2026-10-10");
    const s2 = await settle(cO, TB.u, P2, NOW2);
    const nov = await billsOf(TB, P2);
    const novFee = Object.fromEntries(Object.entries(nov).map(([k, b]: any) => [k, lateOf(b)]));
    // พ.ย.: T1 = 5% × 280,000 = 14,000 · T3 = 5% × 480,000 = 24,000 · T4 = 24,000 · T5 = 50,000 (เพดาน) · T6 = 20 วัน × 5,000 = 100,000
    rec("TB-0", novFee.T1 === 14_000 && novFee.T3 === 24_000 && novFee.T4 === 24_000 && novFee.T5 === 50_000 && novFee.T6 === 100_000, "MAJOR", "ฐานรอบ พ.ย. (% ของเงินต้นค้าง ณ วันครบ · จ่ายบางส่วนก่อนครบ)", { novFee, s2 });
    await pay(A, nov.T1, 100_000, "2026-11-02");                 // ⇒ เงินต้น พ.ย. ค้าง ณ ครบ 380,000 ⇒ 19,000 (ไม่ใช่ 19,700 จาก 394,000)
    await pay(A, nov.T3, 24_000, "2026-11-01");                  // จ่าย "เท่าค่าปรับ" ⇒ ตัดเงินต้นก่อน ⇒ 456,000 × 5% = 22,800 (ไม่ใช่ 24,000)
    const adj4 = await dorm.adjustSentBill(cO, { unitId: TB.u, billId: nov.T4.id, kind: "CREDIT", reason: "ลดค่าปรับบางส่วนตามที่ตกลงกับผู้เช่าแล้ว", idempotencyKey: "tb4", lines: [{ code: "LATE_FEE", labelTh: "ลดค่าปรับ", amountSatang: 10_000 }] });
    await pay(A, nov.T4, 470_000, "2026-11-05");                 // เงินต้นจริงค้าง 10,000 (ตัดเงินต้นก่อน) ⇒ 500
    await pay(A, nov.T5, BASE, "2026-11-05");                    // จ่ายเงินต้นตรงเวลา ค้างเฉพาะค่าปรับ ⇒ ไม่มีค่าปรับ พ.ย.
    await pay(A, nov.T6, 200_000, "2026-11-10");                 // ค้าง 2 งวด จ่ายบางส่วนช้า
    const s3 = await settle(cO, TB.u, P3, NOW3);
    const dec = await billsOf(TB, P3);
    const df = Object.fromEntries(Object.entries(dec).map(([k, b]: any) => [k, { fee: lateOf(b), auto: autoOf(b).map((e: any) => [e.periodKey, e.amountSatang]) }]));
    const lgT6 = await dorm.lateFeeLedger(cO, { unitId: TB.u, leaseId: TB.L.T6.leaseId }, { now: new Date(NOW3) });
    const t6n = lgT6?.items?.find((x: any) => x.periodKey === P2);
    const exp = (o: number) => calc.lateFee({ policy: { kind: "PERCENT", amountSatang: 0, percentBp: 500, capSatang: null, graceDays: 0 }, dueDate: "2026-11-05", paidDate: "2026-11-26", overdueSatang: o }).feeSatang;
    rec("TB-1", df.T1.fee === exp(380_000) && df.T1.fee === 19_000, "BLOCKER", "% ต่องวดคิดจากเงินต้นเท่านั้น: T1 พ.ย. จ่าย 100,000 ก่อนครบ ⇒ 5% × 380,000 = 19,000 (ไม่รวมค่าปรับ 14,000 ในบิล)", { T1: df.T1, want: exp(380_000) });
    rec("TB-2", df.T3.fee === 22_800, "BLOCKER", "จ่ายเท่ายอดค่าปรับ ⇒ ตัดเงินต้นก่อน: T3 ⇒ 5% × 456,000 = 22,800 (ไม่ใช่ 24,000) · ค่าปรับ ต.ค. (ONCE แบบ %) ไม่ลงซ้ำ", { T3: df.T3 });
    rec("TB-3", df.T4.fee === 500, "MINOR", "ใบลดหนี้มือที่ลดค่าปรับ (LATE_FEE) ไม่ควรถูกนับเป็นการลดเงินต้น: T4 เงินต้นจริงค้าง 10,000 ⇒ 500 (ระบบลดเงินต้นด้วยใบลดค่าปรับ ⇒ คิดน้อยไป)", { T4: df.T4, adj4: adj4?.ok ?? adj4?.code });
    rec("TB-4", df.T5.fee === 0, "BLOCKER", "ค่าปรับค้างไม่ก่อค่าปรับ: T5 จ่ายเงินต้น พ.ย. ตรงเวลา ค้างเฉพาะค่าปรับ 50,000 ⇒ ธ.ค. 0", { T5: df.T5 });
    rec("TB-5", df.T6.fee === 160_000 + 105_000 && t6n?.principalOutstandingSatang === 280_000, "MAJOR", "ค้าง 2 งวด จ่ายบางส่วน: T6 ธ.ค. = ส่วนเพิ่ม ต.ค. 160,000 + พ.ย. 105,000 · เงินต้นค้าง พ.ย. 280,000 (ไม่รวมค่าปรับ 100,000)", { T6: df.T6, t6n: t6n && { p: t6n.principalSatang, po: t6n.principalOutstandingSatang, acc: t6n.accruedSatang, ch: t6n.chargedSatang }, s3 });
  }

  // ═════════════════ MX: ผสมเงิน 4 โพรเซส 3 เฟส (ร้าน D) ═════════════════
  console.log("\n── MX เตรียม ∥ ส่ง ∥ ยกเว้น ∥ รับชำระ ∥ งานตามเวลา ∥ ใบเพิ่มหนี้ (4 โพรเซส × 3 เฟส) ──");
  {
    const BOOK_D = await mkBook(Dt, `บัญชี PB11 D ${stamp}`);
    const MX = await dormUnit(Dt, "mx", BOOK_D, Array.from({ length: 8 }, (_, i) => ({ no: `M${i + 1}`, patch: G0 })));
    const CARE = await mkUser("care-d", Dt, "STAFF", [MX.u], ["dorm.view", "dorm.bill.run", "dorm.bill.send"]);
    const cCare = { tenantId: Dt, actorUserId: CARE.id };
    await APS.createPolicy({ tenantId: Dt }, { name: "ยกเว้นค่าปรับหอ", entityType: "dorm.latefee.waive", steps: [{ order: 1, approverRole: "OWNER" }] });
    const oct = await octSent(cD, MX);
    await pay(Dt, oct.M1, BASE, "2026-10-09");
    await pay(Dt, oct.M2, BASE, "2026-10-05");
    const rq3 = await waive(cCare, MX.u, oct.M3.id, NOW_W1);
    const dec3 = rq3?.requestId ? await APS.decide(mOwn(Dt, OWND.id), { tenantId: Dt }, rq3.requestId, { decision: "APPROVED" }) : null;
    const p2 = await prep(cD, MX.u, P2, NOW2);
    const ph1 = await procs([
      [{ m: "dorm", op: "prepareBillRun", args: [cD, { unitId: MX.u, periodKey: P2 }, { now: D(NOW2) }] }, waiveJ(cD, MX.u, oct.M4.id, NOW2), { m: "dorm", op: "applyLateFeeWaiverApproval", args: [{ tenantId: Dt, requestId: rq3?.requestId, sourceBillId: oct.M3.id }] }],
      [{ m: "dorm", op: "sendBillRun", args: [cD, { unitId: MX.u, runId: p2.runId }, { now: D(NOW2), budgetMs: 60_000 }] }, payJ(Dt, oct.M5, BASE, "2026-10-12"), { m: "dorm", op: "runDormDunningJobs", args: [D(NOW2), { tenantId: Dt }] }],
      [{ m: "dorm", op: "prepareBillRun", args: [cD, { unitId: MX.u, periodKey: P2 }, { now: D(NOW2) }] }, { m: "dorm", op: "runDormBillingJobs", args: [D(NOW2), { tenantId: Dt }] }, waiveJ(cD, MX.u, oct.M6.id, NOW2)],
      [{ m: "dorm", op: "sendBillRun", args: [cD, { unitId: MX.u, runId: p2.runId }, { now: D(NOW2), budgetMs: 60_000 }] }, waiveJ(cD, MX.u, oct.M4.id, NOW2), payJ(Dt, oct.M7, 300_000, "2026-10-04"), { m: "dorm", op: "runDormDunningJobs", args: [D(NOW2), { tenantId: Dt }] }],
    ]);
    const f1 = ph1.flat();
    const st1 = await settle(cD, MX.u, P2, NOW2);
    const a1 = await moneyAudit(MX, () => 50_000);
    // ค่าปรับที่ส่งออกไปแล้วต้องไม่เกินที่ถึงกำหนด (ไม่ยกเว้น) — โดยเฉพาะ M5 รับชำระย้อนวันที่ 12 ต.ค. ระหว่างเตรียม/ส่ง (7 วัน = 35,000)
    const nov = await billsOf(MX, P2);
    const overCharge: any[] = [];
    for (const no of Object.keys(MX.L)) {
      const g = await dorm.lateFeeLedger(cD, { unitId: MX.u, leaseId: MX.L[no].leaseId }, { now: new Date(NOW2) });
      for (const it of g?.items ?? []) if (it.waiver.status !== "APPLIED" && it.chargedSatang > it.dueSatang) overCharge.push({ no, due: it.dueSatang, charged: it.chargedSatang, st: nov[no]?.status });
    }
    rec("MX-1", !badOf(f1).length, "BLOCKER", "เฟส 1 (เตรียม×2 ∥ ส่ง×2 ∥ ยกเว้น×3 ∥ ผลอนุมัติ ∥ รับชำระย้อนวันที่×2 ∥ งานทวง×2 ∥ งานรอบบิล) ⇒ ไม่มี throw/INTERNAL/P20xx", { bad: badOf(f1).slice(0, 4), tally: tally(f1) });
    rec("MX-2", a1.clean && !a1.over.length, "BLOCKER", "หลังเฟส 1: ค่าปรับ ≤ E ทั้ง 2 ชั้น · ไม่ซ้ำ · บิลที่ยกเว้นไม่มีค่าปรับค้างใน DRAFT · ส่งแล้วมีใบลดหนี้เท่ายอด · AR/GL = Σ เอกสาร", { ...a1, st1, rq3: rq3?.status, dec3: dec3?.ok });
    rec("MX-3", !overCharge.length, "MAJOR", "หลังเฟส 1: ค่าปรับที่ลงบิล (ไม่ยกเว้น) ≤ ที่ถึงกำหนดตามรับชำระที่บันทึกแล้ว (รับชำระย้อนวันที่ระหว่างเตรียม/ส่ง)", { overCharge, novFee: Object.fromEntries(Object.entries(nov).map(([k, b]: any) => [k, [b?.status, lateOf(b)]])) });

    // เฟส 2 (27 ต.ค.): บิล พ.ย. ส่งแล้ว — ยกเว้น (ใบลดหนี้) ∥ รับชำระเต็มใบเดียวกัน ∥ ใบเพิ่มหนี้ค่าปรับ 2 คีย์ ∥ ผลอนุมัติ ∥ งานทวง
    const debitJ = (billId: string, key: string, amt: number): Call => ({ m: "dorm", op: "adjustSentBill", args: [cD, { unitId: MX.u, billId, kind: "DEBIT", reason: "ค่าปรับเพิ่มตามที่ตกลงกับผู้เช่าแล้ว", idempotencyKey: key, lines: [{ code: "LATE_FEE", labelTh: "ค่าปรับชำระล่าช้า", amountSatang: amt }] }] });
    const ph2 = await procs([
      [waiveJ(cD, MX.u, oct.M1.id, NOW_A), debitJ(nov.M2.id, "d-a", 30_000), { m: "dorm", op: "runDormDunningJobs", args: [D(NOW_A), { tenantId: Dt }] }],
      [payJ(Dt, nov.M1, nov.M1.totalSatang, "2026-10-27"), debitJ(nov.M2.id, "d-b", 30_000), waiveJ(cD, MX.u, oct.M7.id, NOW_A)],
      [payJ(Dt, nov.M7, nov.M7.totalSatang, "2026-10-27"), waiveJ(cD, MX.u, oct.M1.id, NOW_A), { m: "dorm", op: "applyLateFeeWaiverApproval", args: [{ tenantId: Dt, requestId: rq3?.requestId, sourceBillId: oct.M3.id }] }],
      [waiveJ(cD, MX.u, oct.M7.id, NOW_A), debitJ(nov.M2.id, "d-c", 30_000), { m: "dorm", op: "runDormDunningJobs", args: [D(NOW_A), { tenantId: Dt }] }],
    ]);
    const f2 = ph2.flat();
    const a2 = await moneyAudit(MX, () => 50_000);
    const dn = await prisma.accountDocument.findMany({ where: { tenantId: Dt, docType: "DEBIT_NOTE", sourceDocId: nov.M2.accountDocumentId, status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } } });
    const dnSum = dn.reduce((s: number, d: any) => s + d.grandTotal, 0);
    rec("MX-4", !badOf(f2).length, "BLOCKER", "เฟส 2 ไม่มี throw/INTERNAL", { bad: badOf(f2).slice(0, 4), tally: tally(f2) });
    rec("MX-5", dnSum <= 50_000, "MAJOR", "ใบเพิ่มหนี้ค่าปรับ 30,000 × 3 คีย์ จาก 3 โพรเซสบนบิลเดียว (เพดาน E 50,000) ⇒ Σ ต้อง ≤ 50,000 (F14 ใต้การแข่ง)", { dn: dn.map((d: any) => [d.refId, d.grandTotal]), dnSum, codes: f2.filter((x) => x.op === "adjustSentBill").map(codeOf) });
    rec("MX-6", !a2.over.length, "MAJOR", "ยกเว้น (ใบลดหนี้) ชนรับชำระเต็มใบเดียวกัน ⇒ ไม่มีใบแจ้งหนี้ที่ รับ + ลดหนี้ > ยอดใบ (มติ 8 ALREADY_PAID)", { over: a2.over, waive: f2.filter((x) => x.op === "waiveLateFee").map(codeOf), pay: f2.filter((x) => x.op === "recordExternalPayment").map(codeOf) });
    rec("MX-7", a2.clean, "BLOCKER", "หลังเฟส 2: ใบลดหนี้ยกเว้น 1 ต่อ ref · audit ยกเว้น 1 ต่อบิล · AR/GL = Σ เอกสาร", { ...a2 });

    // เฟส 3 (26 พ.ย.): เตรียม/ส่ง ธ.ค. ∥ ยกเว้นต้นทาง ต.ค./พ.ย. ∥ รับชำระ ∥ งานตามเวลา
    const p3 = await prep(cD, MX.u, P3, NOW3);
    const ph3 = await procs([
      [{ m: "dorm", op: "prepareBillRun", args: [cD, { unitId: MX.u, periodKey: P3 }, { now: D(NOW3) }] }, waiveJ(cD, MX.u, oct.M8.id, NOW3)],
      [{ m: "dorm", op: "sendBillRun", args: [cD, { unitId: MX.u, runId: p3.runId }, { now: D(NOW3), budgetMs: 60_000 }] }, payJ(Dt, nov.M6, nov.M6.totalSatang, "2026-11-10"), { m: "dorm", op: "runDormDunningJobs", args: [D(NOW3), { tenantId: Dt }] }],
      [{ m: "dorm", op: "runDormBillingJobs", args: [D(NOW3), { tenantId: Dt }] }, waiveJ(cD, MX.u, nov.M8.id, NOW3), waiveJ(cD, MX.u, nov.M4.id, NOW3)],
      [{ m: "dorm", op: "prepareBillRun", args: [cD, { unitId: MX.u, periodKey: P3 }, { now: D(NOW3) }] }, waiveJ(cD, MX.u, nov.M5.id, NOW3), { m: "dorm", op: "runDormDunningJobs", args: [D(NOW3), { tenantId: Dt }] }],
    ]);
    const f3 = ph3.flat();
    const st3 = await settle(cD, MX.u, P3, NOW3);
    const a3 = await moneyAudit(MX, () => 50_000);
    rec("MX-8", !badOf(f3).length, "BLOCKER", "เฟส 3 ไม่มี throw/INTERNAL", { bad: badOf(f3).slice(0, 4), tally: tally(f3) });
    rec("MX-9", a3.clean && !a3.over.length, "BLOCKER", "หลังเฟส 3 (ทุกงวด): เพดาน 2 ชั้น · ไม่ซ้ำ · ยกเว้นแล้วไม่ค้าง/มีใบลดหนี้ครบ · AR/GL = Σ เอกสาร", { ...a3, st3 });
  }

  // ═════════════════ WA: ยกเว้น/อนุมัติ ═════════════════
  console.log("\n── WA ยกเว้น/อนุมัติ: ไม่มีสิทธิ์ · ข้ามร้าน · ยื่นซ้ำหลังปฏิเสธ · อนุมัติซ้อน · ผู้อนุมัติถูกลดสิทธิ์ ──");
  let WAx: Unit | null = null;
  let waOct: Record<string, any> = {};
  {
    const WA = await dormUnit(A, "wa", BOOK_A, ["A1", "A2", "A3", "A4", "A5"].map((no) => ({ no, patch: G0 })));
    WAx = WA;
    const WX = await mkUnit(A, "DORM", "wx");
    const CARE = await mkUser("care-a", A, "STAFF", [WA.u], ["dorm.view", "dorm.bill.run", "dorm.bill.send"]);
    const MGR = await mkUser("mgr-a", A, "MANAGER", [WA.u]);
    const VIEW = await mkUser("view-a", A, "STAFF", [WA.u], ["dorm.view"]);
    const SLIP = await mkUser("slip-a", A, "STAFF", [WA.u], ["dorm.view", "dorm.slip.review"]);
    const PEND = await mkUser("pend-a", A, "MANAGER", [WA.u], [], false);
    const OTHERU = await mkUser("care-other", A, "STAFF", [WX], ["dorm.view", "dorm.bill.run", "dorm.bill.send", "dorm.latefee.waive"]);
    const cx = (u: { id: string }) => ({ tenantId: A, actorUserId: u.id });
    await APS.createPolicy({ tenantId: A }, { name: "ยกเว้นค่าปรับหอ", entityType: "dorm.latefee.waive", steps: [{ order: 1, approverRole: "OWNER" }] });
    const oct = await octSent(cO, WA);
    waOct = oct;
    for (const no of Object.keys(oct)) await pay(A, oct[no], BASE, "2026-10-09");
    await settle(cO, WA.u, P2, NOW2);
    const nov = await billsOf(WA, P2);
    const n0 = [await prisma.auditLog.count({ where: { tenantId: A, action: { startsWith: "dorm.latefee" } } }), await prisma.approvalRequest.count({ where: { tenantId: A } }), await prisma.accountDocument.count({ where: { tenantId: A, docType: "CREDIT_NOTE" } })];
    const nf = (x: any) => x?.ok === false && x.code === "NOT_FOUND";
    const att: Record<string, any> = {
      view: await waive(cx(VIEW), WA.u, oct.A1.id, NOW_A),
      slip: await waive(cx(SLIP), WA.u, oct.A1.id, NOW_A),
      pend: await waive(cx(PEND), WA.u, oct.A1.id, NOW_A),
      otherUnitStaff: await waive(cx(OTHERU), WA.u, oct.A1.id, NOW_A),
      otherUnitStaffOwnUnit: await waive(cx(OTHERU), WX, oct.A1.id, NOW_A),
      ownerWrongUnit: await waive(cO, WX, oct.A1.id, NOW_A),
      ownerB: await waive(cB, WA.u, oct.A1.id, NOW_A),
      noMember: await waive({ tenantId: A, actorUserId: OWNB.id }, WA.u, oct.A1.id, NOW_A),
      targetAsSource: await waive(cO, WA.u, nov.A1.id, NOW_A),
    };
    const n1 = [await prisma.auditLog.count({ where: { tenantId: A, action: { startsWith: "dorm.latefee" } } }), await prisma.approvalRequest.count({ where: { tenantId: A } }), await prisma.accountDocument.count({ where: { tenantId: A, docType: "CREDIT_NOTE" } })];
    const okNF = ["view", "slip", "pend", "otherUnitStaff", "otherUnitStaffOwnUnit", "ownerWrongUnit", "ownerB", "noMember"].every((k) => nf(att[k]));
    rec("WA-1", okNF && J(n0) === J(n1), "BLOCKER", "ยกเว้นโดยผู้ไม่มีสิทธิ์/สมาชิกค้างตอบรับ/คนของหน่วยอื่น/ร้านอื่น/หน่วยผิด ⇒ NOT_FOUND · ไม่มี audit/คำขอ/ใบลดหนี้", { codes: Object.fromEntries(Object.entries(att).map(([k, v]) => [k, v?.ok ? v.status : v?.code])), n0, n1 });

    // ยื่นซ้ำหลังถูกปฏิเสธ (ผู้ยื่นเดิม · ผู้จัดการ · หลังสลับโหมด)
    const r1 = await waive(cx(CARE), WA.u, oct.A1.id, NOW_A);
    const d1 = await APS.decide(mOwn(A, OWN.id), { tenantId: A }, r1?.requestId, { decision: "REJECTED", note: "ไม่อนุมัติ" });
    const again = { care: await waive(cx(CARE), WA.u, oct.A1.id, NOW_A), mgr: await waive(cx(MGR), WA.u, oct.A1.id, NOW_A) } as Record<string, any>;
    await U(A, WA.u, "rooms.lateFee.waiverApproval", "MANAGER_DIRECT");
    again.mgrDirect = await waive(cx(MGR), WA.u, oct.A1.id, NOW_A);
    await prisma.settingValue.deleteMany({ where: { tenantId: A, key: "rooms.lateFee.waiverApproval", scopeId: WA.u } });
    const reqs = await prisma.approvalRequest.count({ where: { tenantId: A, entityId: oct.A1.id } });
    const cnA1 = await prisma.accountDocument.count({ where: { tenantId: A, docType: "CREDIT_NOTE", sourceDocId: nov.A1.accountDocumentId } });
    rec("WA-2", again.care?.code === "ALREADY_REJECTED" && again.mgr?.code === "ALREADY_REJECTED" && reqs === 1, "MAJOR", "ยื่นซ้ำหลังถูกปฏิเสธ (ผู้ยื่นเดิม/ผู้จัดการ) ⇒ ALREADY_REJECTED · คำขอ 1 ใบ", { r1: r1?.status, d1: d1?.ok, again: Object.fromEntries(Object.entries(again).map(([k, v]) => [k, v?.ok ? `${v.status}/cn${(v.creditNotes ?? []).length}` : v?.code])), reqs, cnA1 });
    rec("WA-2b", again.mgrDirect?.code === "ALREADY_REJECTED" || again.mgrDirect?.ok !== true, "MINOR", "หลังเจ้าของปฏิเสธ ผู้จัดการสลับโหมด MANAGER_DIRECT แล้วยกเว้นเองได้ (ข้ามคำปฏิเสธของเจ้าของ)?", { mgrDirect: again.mgrDirect?.ok ? `${again.mgrDirect.status}/cn${(again.mgrDirect.creditNotes ?? []).length}` : again.mgrDirect?.code });

    // อนุมัติซ้อน: ผลอนุมัติ ×4 (2 โพรเซส) ∥ งานตามเวลา ×2 ∥ เจ้าของยกเว้นตรง ×2 ⇒ ใบลดหนี้ใบเดียว
    const r2 = await waive(cx(CARE), WA.u, oct.A2.id, NOW_A);
    const crossT = await dorm.applyLateFeeWaiverApproval({ tenantId: B, requestId: r2?.requestId, sourceBillId: oct.A2.id });
    const wrongSrc = await dorm.applyLateFeeWaiverApproval({ tenantId: A, requestId: r2?.requestId, sourceBillId: oct.A3.id });
    const pendApply = await dorm.applyLateFeeWaiverApproval({ tenantId: A, requestId: r2?.requestId, sourceBillId: oct.A2.id });
    const d2 = await APS.decide(mOwn(A, OWN.id), { tenantId: A }, r2?.requestId, { decision: "APPROVED" });
    const ap = (): Call => ({ m: "dorm", op: "applyLateFeeWaiverApproval", args: [{ tenantId: A, requestId: r2?.requestId, sourceBillId: oct.A2.id }] });
    const ph = await procs([
      [ap(), ap(), { m: "dorm", op: "runDormDunningJobs", args: [D(NOW_A), { tenantId: A }] }],
      [ap(), ap(), { m: "dorm", op: "runDormDunningJobs", args: [D(NOW_A), { tenantId: A }] }, waiveJ(cO, WA.u, oct.A2.id, NOW_A)],
      [waiveJ(cO, WA.u, oct.A2.id, NOW_A)],
    ]);
    const fl = ph.flat();
    const cn2 = await prisma.accountDocument.findMany({ where: { tenantId: A, docType: "CREDIT_NOTE", sourceDocId: nov.A2.accountDocumentId } });
    const au2 = await prisma.auditLog.findMany({ where: { tenantId: A, action: "dorm.latefee.waived", targetId: oct.A2.id } });
    const applied = fl.filter((x) => x.op === "applyLateFeeWaiverApproval" && x.r?.status === "APPLIED").length + fl.filter((x) => x.op === "waiveLateFee" && x.r?.created === true).length + fl.filter((x) => x.op === "runDormDunningJobs").reduce((s, x) => s + Number(x.r?.waiversApplied ?? 0), 0);
    rec("WA-3", crossT?.status !== "APPLIED" && wrongSrc?.status !== "APPLIED" && pendApply?.status === "SKIPPED", "BLOCKER", "ผลอนุมัติปลอม: tenantId ร้านอื่น / sourceBill อื่น / ยังไม่อนุมัติ ⇒ ไม่ยกเว้น", { crossT, wrongSrc, pendApply });
    rec("WA-4", !badOf(fl).length && cn2.length === 1 && cn2[0]?.grandTotal === 20_000 && au2.length === 1 && applied === 1, "BLOCKER", "อนุมัติแล้ว ผลอนุมัติ×4 ∥ งานตามเวลา×2 ∥ เจ้าของยกเว้นตรง×2 (3 โพรเซส) ⇒ ใบลดหนี้ 1 ใบ 20,000 · audit 1 · ผู้ทำสำเร็จ 1", { d2: d2?.ok, cn: cn2.map((d: any) => [d.grandTotal, d.refId?.slice(-20)]), audits: au2.length, applied, tally: tally(fl), bad: badOf(fl).slice(0, 3) });

    // ผู้อนุมัติถูกลดสิทธิ์ก่อนผลถูกใช้ (OWNER คนที่ 2 อนุมัติ แล้วถูกเปลี่ยนเป็น MANAGER)
    const r3 = await waive(cx(CARE), WA.u, oct.A3.id, NOW_A);
    const d3 = await APS.decide(mOwn(A, OWN2.id), { tenantId: A }, r3?.requestId, { decision: "APPROVED" });
    await prisma.membership.update({ where: { id: OWN2.mid }, data: { role: "MANAGER" } });
    const ap3 = await dorm.applyLateFeeWaiverApproval({ tenantId: A, requestId: r3?.requestId, sourceBillId: oct.A3.id });
    const cn3 = await prisma.accountDocument.count({ where: { tenantId: A, docType: "CREDIT_NOTE", sourceDocId: nov.A3.accountDocumentId } });
    rec("WA-5", d3?.ok === true && ap3?.status !== "APPLIED" && cn3 === 0, "MAJOR", "ผู้อนุมัติขั้นสุดท้ายถูกลดจากเจ้าของก่อนผลถูกใช้ ⇒ ไม่ยกเว้น (เจ้าของสดเท่านั้น)", { d3: d3?.ok ?? d3, ap3, cn3 });

    // ผู้ดูแลยื่นขอ ∥ เจ้าของยกเว้นตรง พร้อมกัน (บิลปลายทางส่งแล้ว) ⇒ ใบลดหนี้ใบเดียว
    const ph4 = await procs([[waiveJ(cx(CARE), WA.u, oct.A4.id, NOW_A), waiveJ(cx(CARE), WA.u, oct.A4.id, NOW_A)], [waiveJ(cO, WA.u, oct.A4.id, NOW_A), waiveJ(cO, WA.u, oct.A4.id, NOW_A)]]);
    const cn4 = await prisma.accountDocument.count({ where: { tenantId: A, docType: "CREDIT_NOTE", sourceDocId: nov.A4.accountDocumentId } });
    const rq4 = await prisma.approvalRequest.count({ where: { tenantId: A, entityId: oct.A4.id } });
    rec("WA-6", cn4 === 1 && rq4 <= 1 && !badOf(ph4.flat()).length, "MAJOR", "ยื่นขอ ×2 ∥ เจ้าของยกเว้น ×2 (2 โพรเซส) ⇒ ใบลดหนี้ 1 · คำขอ ≤ 1", { cn4, rq4, tally: tally(ph4.flat()) });
  }

  // ═════════════════ DN: เตือน/ทวง (ร้าน C) ═════════════════
  console.log("\n── DN เตือน/ทวง: งานซ้อน 3 โพรเซส · นัดจ่าย · สัญญาจบ · ยอด 0 · ทวงมือ ∥ งาน ──");
  {
    const BOOK_C = await mkBook(C, `บัญชี PB11 C ${stamp}`);
    const DN = await dormUnit(C, "dn", BOOK_C, ["N1", "N2", "N3", "N4", "N5", "N6"].map((no) => ({ no })));
    const DF = await dormUnit(C, "df", BOOK_C, [{ no: "F1" }, { no: "F2" }, { no: "F3" }, { no: "F4" }, { no: "F5", name: "สมศักดิ์ ตัดไฟ" }]);
    // แม่แบบของ DF ถูกต้อง (ไม่มีคำต้องห้าม) แต่ใช้ {tenantName}
    await U(C, DF.u, "rooms.msg.reminder", { th: "เรียนคุณ {tenantName} บิลห้อง {roomNo} ยอด {amount} ครบกำหนด {dueDate} — {unitName}", en: "Dear {tenantName}, room {roomNo} {amount} due {dueDate}" });
    const NOW_C = "2026-11-25T03:00:00.000Z";
    const CB: Record<string, any> = {};
    for (const X of [DN, DF]) {
      const p = await prep(cC, X.u, P3, NOW_C);
      const s = p?.ok ? await sendAll(cC, X.u, p.runId, NOW_C) : null;
      if (!(p?.ok && s?.ok && s.done)) throw new Error(`ฉาก DN ${X.u}: ${J(p).slice(0, 160)} ${J(s).slice(0, 160)}`);
      Object.assign(CB, await billsOf(X, P3));
    }
    const sml = (pre: string) => prisma.serviceMessageLog.findMany({ where: { tenantId: C, dedupeKey: { startsWith: pre } } });
    const jobJ = (iso: string): Call => ({ m: "dorm", op: "runDormDunningJobs", args: [D(iso), { tenantId: C }] });
    // เตือน 3 ธ.ค. ซ้อน 3 โพรเซส + ในโพรเซส
    const at3 = "2026-12-03T03:00:00.000Z";
    const [k3, m3] = await Promise.all([procs([[jobJ(at3)], [jobJ(at3)], [jobJ(at3)]]), sleep(14_000).then(() => dorm.runDormDunningJobs(new Date(at3), { tenantId: C }))]);
    const rem = await sml("rooms:reminder:");
    const remKeys = rem.map((r: any) => r.dedupeKey);
    const dupKeys = remKeys.length - new Set(remKeys).size;
    const fRem = ["F1", "F2", "F3", "F4"].filter((no) => remKeys.includes(`rooms:reminder:${CB[no].id}:2`)).length;
    const tb = await prisma.auditLog.count({ where: { tenantId: C, action: "dorm.dunning.template_blocked", unitId: DF.u } });
    rec("DN-1", !badOf(k3.flat()).length && dupKeys === 0 && ["N1", "N2", "N3", "N4", "N5", "N6"].every((no) => remKeys.filter((k: string) => k === `rooms:reminder:${CB[no].id}:2`).length === 1) && !rem.some((r: any) => r.status === "SENT"), "BLOCKER",
      "งานเตือน 3 ธ.ค. ซ้อน 4 ทาง (3 โพรเซส) ⇒ 1 แถวต่อคีย์ · ไม่มีการส่งจริง (SENT)", { n: rem.length, dupKeys, statuses: [...new Set(rem.map((r: any) => r.status))], main: m3, kids: tally(k3.flat()) });
    rec("DN-2", fRem === 4, "MINOR", "ผู้เช่าคนเดียว (ชื่อมีคำ \"ตัดไฟ\") ในแม่แบบที่ใช้ {tenantName} ⇒ ไม่ควรหยุดเตือนห้องอื่นทั้งหน่วย (และไม่ควรจด template_blocked ว่าแม่แบบผิด)", { fRemOf4: fRem, templateBlockedAudit: tb });
    // ยอด 0 · สัญญาจบ · นัดจ่าย · จ่ายบางส่วน (ค้าง 1 สตางค์)
    await pay(C, CB.N2, BASE, "2026-12-04");
    const cr3 = await dorm.adjustSentBill(cC, { unitId: DN.u, billId: CB.N3.id, kind: "CREDIT", reason: "ยกค่าห้องเดือนนี้ให้เพราะซ่อมห้องทั้งเดือน", idempotencyKey: "n3", lines: [{ code: "RENT", labelTh: "ลดค่าห้อง", amountSatang: BASE }] });
    await prisma.dormLease.update({ where: { id: DN.L.N4.leaseId }, data: { status: "ENDED", endedAt: new Date("2026-12-06T03:00:00.000Z") } });
    const pr5 = await dorm.setPaymentPromise(cC, { unitId: DN.u, billId: CB.N5.id, promiseDate: "2026-12-20" }, { now: new Date("2026-12-06T03:00:00.000Z") });
    await pay(C, CB.N6, BASE - 1, "2026-12-04");
    // 8 ธ.ค. (+3): งาน ×3 โพรเซส ∥ ทวงมือ N1 ×2 ∥ นัดจ่าย N6 ∥ ทวงมือ N2/N3 (ยอด 0)
    const at8 = "2026-12-08T03:00:00.000Z";
    const dmJ = (no: string, u: string): Call => ({ m: "dorm", op: "sendDunningNow", args: [cC, { unitId: u, billId: CB[no].id }, { now: D(at8) }] });
    const k8 = await procs([[jobJ(at8), dmJ("N1", DN.u)], [jobJ(at8), dmJ("N1", DN.u), dmJ("N2", DN.u)], [jobJ(at8), dmJ("N3", DN.u), { m: "dorm", op: "setPaymentPromise", args: [cC, { unitId: DN.u, billId: CB.N6.id, promiseDate: "2026-12-09" }, { now: D(at8) }] }]]);
    const f8 = k8.flat();
    const dun = await sml("rooms:dunning:");
    const keyOf = (no: string, k: string | number) => `rooms:dunning:${CB[no].id}:${k}`;
    const has = (no: string, k: string | number) => dun.filter((r: any) => r.dedupeKey === keyOf(no, k)).length;
    const dunDup = dun.length - new Set(dun.map((r: any) => r.dedupeKey)).size;
    const wrongParty = dun.filter((r: any) => { const id = r.dedupeKey.split(":")[2]; const b = Object.values(CB).find((x: any) => x.id === id); return r.partyId && b && r.partyId !== b.partyId; }).length;
    const manual = f8.filter((x) => x.op === "sendDunningNow");
    rec("DN-3", dunDup === 0 && has("N1", 3) === 1 && has("N1", "m20261208") === 1 && !has("N2", 3) && !has("N3", 3) && !has("N4", 3) && !has("N5", 3) && wrongParty === 0 && !dun.some((r: any) => r.status === "SENT"), "BLOCKER",
      "ทวง 8 ธ.ค. งาน ×3 ∥ ทวงมือ ⇒ 1 แถวต่อคีย์ · ไม่ทวง N2 (จ่ายครบ) · N3 (ลดหนี้เหลือ 0) · N4 (สัญญาจบ) · N5 (นัดจ่าย) · partyId ตรงบิล",
      { keys: dun.map((r: any) => r.dedupeKey.split(":").slice(2).join(":").slice(-14)), dunDup, wrongParty, n6: [has("N6", 3), has("N6", "m20261208")], manual: manual.map((x) => (x.r?.ok ? `${x.r.status}${x.r.duplicate ? "/dup" : ""}` : x.r?.code ?? x.threw)), cr3: cr3?.ok ?? cr3?.code, pr5: pr5?.ok, bad: badOf(f8.filter((x) => !(x.op === "sendDunningNow" && x.r?.code === "NOT_OVERDUE"))).slice(0, 3) });
    const mn = manual.filter((x) => x.r?.ok === true);
    rec("DN-4", mn.filter((x) => x.r.duplicate === false).length === 1 && manual.filter((x) => ["N2", "N3"].length && x.r?.code === "NOT_OVERDUE").length === 2, "MAJOR", "ทวงมือ N1 ×2 ข้ามโพรเซส ⇒ ไม่ซ้ำ 1 ราย · ทวงมือบิลยอด 0 (N2 จ่ายครบ / N3 ลดหนี้) ⇒ NOT_OVERDUE", { manual: manual.map((x) => (x.r?.ok ? `${x.r.status}/dup=${x.r.duplicate}` : x.r?.code)) });
    // นัดจ่ายหมดแล้วทวงต่อ · ห้ามทวงย้อนหลังหลายขั้น
    await dorm.runDormDunningJobs(new Date("2026-12-21T03:00:00.000Z"), { tenantId: C });
    const dun2 = await sml("rooms:dunning:");
    const k = (no: string, s: number) => dun2.filter((r: any) => r.dedupeKey === keyOf(no, s)).length;
    rec("DN-5", k("N5", 14) === 1 && k("N5", 7) === 0 && k("N1", 14) === 1 && k("N1", 7) === 0 && k("N4", 14) === 0 && k("N2", 14) === 0, "MAJOR", "21 ธ.ค.: นัดจ่าย N5 (20 ธ.ค.) หมดแล้ว ⇒ ทวงขั้น +14 เท่านั้น (ไม่รัวขั้น +7) · สัญญาจบ/จ่ายครบยังเงียบ", { N5: [k("N5", 7), k("N5", 14)], N1: [k("N1", 7), k("N1", 14)], N4: k("N4", 14), N2: k("N2", 14) });
    // นัดจ่ายโดยผู้ไม่มีสิทธิ์/ร้านอื่น · วันนัดอดีต (เวลาไทยเที่ยงคืน)
    const VW = await mkUser("view-c", C, "STAFF", [DN.u], ["dorm.view"]);
    const pp = {
      view: await dorm.setPaymentPromise({ tenantId: C, actorUserId: VW.id }, { unitId: DN.u, billId: CB.N1.id, promiseDate: "2026-12-25" }, { now: new Date("2026-12-21T03:00:00.000Z") }),
      ownerB: await dorm.setPaymentPromise(cB, { unitId: DN.u, billId: CB.N1.id, promiseDate: "2026-12-25" }, { now: new Date("2026-12-21T03:00:00.000Z") }),
      bkkMidnight: await dorm.setPaymentPromise(cC, { unitId: DN.u, billId: CB.N1.id, promiseDate: "2026-12-21" }, { now: new Date("2026-12-21T17:30:00.000Z") }),
    } as Record<string, any>;
    rec("DN-6", pp.view?.code === "NOT_FOUND" && pp.ownerB?.code === "NOT_FOUND" && pp.bkkMidnight?.code === "INVALID_INPUT", "MAJOR", "นัดจ่าย: ผู้ดูอย่างเดียว/ร้านอื่น ⇒ NOT_FOUND · 22 ธ.ค. 00:30 ไทย นัดวันที่ 21 (อดีตตามวันไทย) ⇒ INVALID_INPUT", Object.fromEntries(Object.entries(pp).map(([kk, v]) => [kk, v?.ok ? `OK ${v.promiseDate}` : v?.code])));
  }

  // ═════════════════ XT: ข้ามร้าน/สิทธิ์ในทุก action ═════════════════
  console.log("\n── XT ข้ามร้าน/ข้ามหน่วย/สิทธิ์สด ทุก action (overdue · notice · waive · promise · dunning · ledger · approval · job) ──");
  {
    const WA = WAx!;
    const nov = await billsOf(WA, P2);
    const BOOK_B = await mkBook(B, `บัญชี PB11 B ${stamp}`);
    const XB = await dormUnit(B, "xb", BOOK_B, [{ no: "B1", patch: G0 }]);
    const snap = async () => [
      await prisma.auditLog.count({ where: { tenantId: { in: [A, B] } } }),
      await prisma.accountDocument.count({ where: { tenantId: { in: [A, B] } } }),
      await prisma.serviceMessageLog.count({ where: { tenantId: { in: [A, B] } } }),
      await prisma.approvalRequest.count({ where: { tenantId: { in: [A, B] } } }),
      await prisma.outboxEvent.count({ where: { tenantId: A, type: "dorm.bill.overdue" } }),
    ];
    const s0 = await snap();
    const now = { now: new Date("2026-11-20T03:00:00.000Z") };
    const bill = nov.A5, src = waOct.A5, lease = WA.L.A5.leaseId;
    const X: [string, any, any][] = [];
    const all = async (label: string, ctx: any, unitId: string) => {
      const om = await dorm.overdueModel(ctx, { unitId }, now);
      X.push([`${label}.overdueModel`, om && label === "B@ownUnit" && !(om.rows ?? []).some((r: any) => r.billId === bill.id) ? null : om, null]);
      X.push([`${label}.lateFeeLedger`, await dorm.lateFeeLedger(ctx, { unitId, leaseId: lease }, now), null]);
      X.push([`${label}.terminationNotice`, await dorm.terminationNotice(ctx, { unitId, leaseId: lease }, now), "NOT_FOUND"]);
      X.push([`${label}.waive`, await dorm.waiveLateFee(ctx, { unitId, sourceBillId: src.id, reason: RSN }, now), "NOT_FOUND"]);
      X.push([`${label}.promise`, await dorm.setPaymentPromise(ctx, { unitId, billId: bill.id, promiseDate: "2026-11-25" }, now), "NOT_FOUND"]);
      X.push([`${label}.dunNow`, await dorm.sendDunningNow(ctx, { unitId, billId: bill.id }, now), "NOT_FOUND"]);
    };
    await all("B@unitA", cB, WA.u);
    await all("B@ownUnit", cB, XB.u);
    await all("noMember", { tenantId: A, actorUserId: OWNB.id }, WA.u);
    await all("tenantSpoof", { tenantId: B, actorUserId: OWN.id }, WA.u);
    const MTR = await mkUser("meter-a", A, "STAFF", [WA.u], ["dorm.meter.read"]);
    await all("meter", { tenantId: A, actorUserId: MTR.id }, WA.u);
    // ctx ผิดรูป
    X.push(["badCtx.overdue", await dorm.overdueModel(null, { unitId: WA.u }), null]);
    X.push(["badCtx.waive", await dorm.waiveLateFee({ tenantId: A }, { unitId: WA.u, sourceBillId: src.id, reason: RSN }), "NOT_FOUND"]);
    X.push(["arrUnit.overdue", await dorm.overdueModel(cO, { unitId: [WA.u] }), null]);
    // ผลอนุมัติข้ามร้าน · งานตามเวลาร้าน B
    X.push(["apply.B", (await dorm.applyLateFeeWaiverApproval({ tenantId: B, requestId: "x", sourceBillId: src.id }))?.status === "APPLIED" ? "APPLIED" : null, null]);
    const jb = await dorm.runDormDunningJobs(new Date("2026-11-20T03:00:00.000Z"), { tenantId: B });
    const fails = X.filter(([, got, want]) => (want === null ? got !== null : !(got?.ok === false && got?.code === want)));
    const s1 = await snap();
    rec("XT-1", !fails.length && J(s0) === J(s1), "BLOCKER", "ร้านอื่น/ไม่มีสมาชิก/ปลอม tenantId/คนจดมิเตอร์/ctx ผิดรูป ⇒ null/NOT_FOUND ทุก action · audit/เอกสาร/ข้อความ/คำขอ/event ไม่เปลี่ยน",
      { fails: fails.map(([kk, g]) => [kk, g === null ? null : g?.code ?? (g?.ok ? "OK!" : J(g).slice(0, 80))]), s0, s1, jb });
    // สิทธิ์สด: ถอนคีย์ · ย้ายหน่วย · เลิกตอบรับ ⇒ ทันที
    const SND = await mkUser("sender-a", A, "STAFF", [WA.u], ["dorm.view", "dorm.bill.run", "dorm.bill.send", "dorm.lease.manage"]);
    const cS = { tenantId: A, actorUserId: SND.id };
    const ok1 = await dorm.setPaymentPromise(cS, { unitId: WA.u, billId: bill.id, promiseDate: "2026-11-25" }, now);
    await prisma.membership.update({ where: { id: SND.mid }, data: { permissions: { "dorm.view": true } } });
    const r1 = await dorm.sendDunningNow(cS, { unitId: WA.u, billId: bill.id }, now);
    const r1b = await dorm.waiveLateFee(cS, { unitId: WA.u, sourceBillId: src.id, reason: RSN }, now);
    await prisma.membership.update({ where: { id: SND.mid }, data: { permissions: { "dorm.view": true, "dorm.bill.send": true, "dorm.bill.run": true }, unitAccess: ["nope"] } });
    const r2 = await dorm.setPaymentPromise(cS, { unitId: WA.u, billId: bill.id, promiseDate: "2026-11-26" }, now);
    await prisma.membership.update({ where: { id: SND.mid }, data: { unitAccess: [WA.u], acceptedAt: null } });
    const r3 = await dorm.overdueModel(cS, { unitId: WA.u }, now);
    const r4 = await dorm.waiveLateFee(cS, { unitId: WA.u, sourceBillId: src.id, reason: RSN }, now);
    const nf = (x: any) => x?.ok === false && x.code === "NOT_FOUND";
    rec("XT-2", ok1?.ok === true && nf(r1) && nf(r1b) && nf(r2) && r3 === null && nf(r4), "BLOCKER", "ถอนคีย์/ย้าย unitAccess/เลิกตอบรับ กลางทาง ⇒ มีผลทันที (ไม่แคชสิทธิ์)", { ok1: ok1?.ok, r1: r1?.code, r1b: r1b?.code, r2: r2?.code, r3: r3 === null, r4: r4?.code });
    // notice ต้องมี lease.manage + money: ผู้ดูแลมี bill.send (ไม่มี lease.manage)
    const CARE2 = await mkUser("care2-a", A, "STAFF", [WA.u], ["dorm.view", "dorm.bill.run", "dorm.bill.send"]);
    const tn = await dorm.terminationNotice({ tenantId: A, actorUserId: CARE2.id }, { unitId: WA.u, leaseId: lease }, now);
    const om = await dorm.overdueModel({ tenantId: A, actorUserId: CARE2.id }, { unitId: WA.u }, now);
    rec("XT-3", nf(tn) && (om === null || om?.can?.notice === false), "MAJOR", "หนังสือบอกเลิก: ผู้ไม่มี dorm.lease.manage ⇒ NOT_FOUND · จอไม่แสดงปุ่ม", { tn: tn?.code ?? tn?.ok, omCan: om?.can ?? null });
  }
} catch (e) {
  console.log(`💥 CRASH: ${e instanceof Error ? e.stack : String(e)}`);
  exitCode = 2;
} finally {
  await cleanup(tenantIds);
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d11pb-" } } });
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d11pb-" } } });
  const lu = await prisma.user.count({ where: { email: { startsWith: "svc-d11pb-" } } });
  console.log(`\n── ล้าง: tenant ค้าง ${left} · user ค้าง ${lu} ──`);
  const bad = results.filter((r) => !r.ok);
  console.log(`\nPROBE_SUMMARY ${J({ total: results.length, fail: bad.map((r) => `${r.id}:${r.sev}`) })}`);
  await prisma.$disconnect();
  process.exit(exitCode || (bad.length ? 1 : 0));
}

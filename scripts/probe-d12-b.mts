// PROBE — SVC D.12 reviewer B (โจมตีด้วยหลายโพรเซส) · ไม่ใช่ข้อสอบ · ไม่แก้ src · ไม่ส่งข้อความจริง (หน่วยทดสอบไม่มี OA)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d12-b.mts
// ข้อมูลใต้ร้าน `qc-svc-d12pb-*` + ผู้ใช้ `svc-d12pb-*@shark.local` · ล้างใน finally ทุกครั้ง · ไม่แตะร้าน svc-qc (งานตามเวลาเรียกพร้อม tenantId เสมอ)
// หมวด: SS ปิด∥ปิด · SR ปิด∥เปิดใหม่ · SP ปิด∥รับชำระมือ · SD ส่ง∥ใบเพิ่มหนี้ · SI ตรวจซ้ำ∥ส่ง · SL ปิด∥ยกเว้น/ใบเพิ่มหนี้ค่าปรับ
//       AP อนุมัติ∥ปิด · AK ผู้ไม่มีคีย์ · SB ปิด∥รอบบิล D.8 (เดือนก่อนวันออกที่ยังไม่ออกบิล) · TB ย้ายห้อง∥รอบบิล · TS ย้ายห้อง∥ปิด
//       RN ต่อสัญญา · NC แจ้ง∥ยกเลิก · JB งานตามเวลา · DL บังคับ 40P01 · KL SIGKILL · TK ย้ายห้องตายกลางทาง · XS ข้ามร้าน · M เงินหลังทุกฉาก
/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import pg from "pg";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const DORM_IDX = "src/lib/modules/dorm/index.ts";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x) ?? String(x); } catch { return String(x); } };
const revive = (_k: string, v: any) => (v && typeof v === "object" && typeof v.__date === "string" ? new Date(v.__date) : v);
const D = (d: Date | string) => ({ __date: typeof d === "string" ? d : d.toISOString() });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── ด่านฐาน (QC เท่านั้น) ──
for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
  const u = process.env[n] ?? "";
  let hn = "";
  try { hn = new URL(u).hostname; } catch { /* */ }
  if (!hn.includes("ep-mute-scene")) { console.error(`🔴 probe: ${n} ไม่ใช่ฐาน qc-svc — หยุด`); process.exit(4); }
}
if (process.env.APP_ENV === "production" || process.env.CI) { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }

type Call = { m: "dorm" | "acc" | "aps" | "x"; op: string; args: any[]; delayMs?: number };
// ═══════════ โหมดลูก ═══════════
const CA = process.argv.indexOf("--child");
if (CA >= 0) {
  const job = JSON.parse(Buffer.from(process.argv[CA + 1] ?? "", "base64url").toString("utf8"), revive) as { calls: Call[]; at: number; signal?: boolean };
  let out: unknown[] = [];
  try {
    const dm: any = await import(pathToFileURL(join(ROOT, DORM_IDX)).href);
    const mods: Record<string, any> = {
      dorm: dm,
      acc: await import("@/lib/modules/account" as string),
      aps: await import("@/lib/modules/approval/service" as string),
      x: {
        __prepSend: async (c: unknown, x: any) => {
          const r = await dm.prepareBillRun(c, { unitId: x.unitId, periodKey: x.periodKey }, { now: new Date(x.now) });
          if (!r?.ok) return { stage: "prepare", ...r };
          let last: any = null;
          for (let i = 0; i < 40; i++) { last = await dm.sendBillRun(c, { unitId: x.unitId, runId: r.runId }, { now: new Date(x.now) }); if (!last?.ok || last.done) break; }
          return { stage: "send", ...(last ?? {}), runId: r.runId };
        },
        __jobs: async (x: any) => dm.runDormMoveOutJobs(new Date(x.now), { tenantId: x.tenantId }),
      },
    };
    const wait = job.at - Date.now();
    if (wait > 0) await sleep(wait);
    if (job.signal) console.log("CHILD_START");
    out = await Promise.all(job.calls.map(async (c) => {
      if (c.delayMs) await sleep(c.delayMs);
      const t0 = Date.now();
      try { const r = await mods[c.m][c.op](...c.args); return { op: c.op, r, ms: Date.now() - t0, t: t0 }; }
      catch (e) { return { op: c.op, threw: errMsg(e), ms: Date.now() - t0, t: t0 }; }
    }));
  } catch (e) { out = [{ childFail: errMsg(e) }]; }
  console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
  try { const { prisma } = (await import("@/lib/core/db" as string)) as any; await prisma.$disconnect(); } catch { /* */ }
  process.exit(0);
}

{
  const { appendFileSync } = await import("node:fs");
  const LOG = `/tmp/svc-d12b-probe.out.${process.pid}.log`;
  process.stdout.on("error", () => { /* */ });
  const orig = console.log.bind(console);
  console.log = (...a: unknown[]) => { try { appendFileSync(LOG, `${a.map((x) => (typeof x === "string" ? x : J(x))).join(" ")}\n`); } catch { /* */ } try { orig(...a); } catch { /* */ } };
  console.log(`(probe log: ${LOG} · start ${new Date().toISOString()})`);
}

const LEAD = 13_000;
function spawnJob(job: unknown, onOut?: (s: string, kill: () => void) => void): Promise<{ buf: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify(job)).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); onOut?.(buf, () => { if (child.exitCode === null) child.kill("SIGKILL"); }); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => resolve({ buf, code }));
  });
}
async function procs(jobs: Call[][], leadMs = LEAD): Promise<any[]> {
  const at = Date.now() + leadMs;
  const outs = await Promise.all(jobs.map(async (calls) => {
    const { buf, code } = await spawnJob({ calls, at });
    const m = /CHILD_RESULT (\[.*\])/.exec(buf);
    try { return m ? (JSON.parse(m[1]) as any[]) : calls.map((c) => ({ op: c.op, childFail: `exit=${code} ${buf.split("\n").slice(-3).join(" | ").slice(0, 200)}` })); }
    catch { return calls.map((c) => ({ op: c.op, childFail: "parse" })); }
  }));
  return outs.flat();
}
/** ลูก 1 ตัว · SIGKILL หลังพิมพ์ CHILD_START ไป killMs */
async function killDuring(call: Call, killMs: number): Promise<{ killed: boolean; tail: string }> {
  let killed = false, armed = false;
  const { buf } = await spawnJob({ calls: [call], at: Date.now(), signal: true }, (b, kill) => {
    if (!armed && b.includes("CHILD_START")) { armed = true; setTimeout(() => { if (!/CHILD_RESULT/.test(b)) { killed = true; kill(); } }, killMs); }
  });
  return { killed: killed && !/CHILD_RESULT/.test(buf), tail: buf.slice(-200) };
}

type F = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: F[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown) => {
  const d = typeof detail === "string" ? detail : J(detail);
  results.push({ id, ok, sev, what, detail: d });
  console.log(`  ${ok ? "✅ HOLD" : "❌ BREACH"} [${id}] (${sev}) ${what} — ${d.slice(0, 2400)}`);
};
const BADRX = /P2028|P2024|P2002|P2034|40P01|deadlock|timed out|Unable to start a transaction|Transaction already closed|Unique constraint/i;
const codeOf = (x: any) => (x?.childFail ? "CHILDFAIL" : x?.threw ? "THREW" : x?.r === null ? "null" : x?.r?.ok === true ? "OK" : x?.r?.code ?? x?.r?.stage ?? J(x?.r).slice(0, 40));
/** ผลที่ไม่ยอมรับ: throw · ลูกตาย · UNAVAILABLE/INTERNAL · ข้อความ Prisma/40P01 หลุด (รหัสปฏิเสธทางธุรกิจ เช่น STALE/BUSY ไม่นับ — `_okCodes` เพื่ออ่านง่ายเท่านั้น) */
const badOf = (rs: any[], _okCodes: string[] = []) => rs.filter((x) => x?.threw || x?.childFail || ["UNAVAILABLE", "INTERNAL"].includes(x?.r?.code) || BADRX.test(J(x?.r ?? x)));
const tally = (rs: any[]) => { const t: Record<string, number> = {}; for (const x of rs) { const k = `${x?.op}:${codeOf(x)}`; t[k] = (t[k] ?? 0) + 1; } return t; };

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const dorm: any = await import(pathToFileURL(join(ROOT, DORM_IDX)).href);
const ACC: any = await import("@/lib/modules/account" as string);
const SYS: any = await import("@/lib/modules/system/service" as string);
const ASV: any = await import("@/lib/modules/account/service" as string);
const GL: any = await import("@/lib/modules/account/gl" as string);
const SET: any = await import("@/lib/core/settings" as string);
const APS: any = await import("@/lib/modules/approval/service" as string);
const NFR: string = ((await import(pathToFileURL(join(ROOT, "src/lib/modules/dorm/moveout-access.ts")).href)) as any).MOVEOUT_NF_REASON;
const PRISMA_NS: any = (await import("@prisma/client" as string)).Prisma;

// ── เวลา (ไทย) ──
const BK = (ymd: string, hm = "12:00") => new Date(`${ymd}T${hm.length === 5 ? `${hm}:00` : hm}+07:00`);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const ymdOf = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : "");
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const RENT = 450_000, COMMON = 30_000, BASE = RENT + COMMON, DEP = 900_000;
const OOS = "ผู้ให้เช่ามีห้องให้เช่าน้อยกว่าสามห้อง (probe D.12 B)";
const NOW_OCT = BK("2026-09-25", "10:00"), NOW_NOV = BK("2026-10-25", "10:00");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89]);
const RSN = "ผู้เช่าขอผ่อนผันเป็นกรณีพิเศษ ตรวจสอบแล้ว";
const CLOSED = ["SETTLED", "REFUNDED"];

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
  await soft(() => prisma.dormLease.updateMany({ where: { tenantId: { in: tids } }, data: { previousLeaseId: null } }));
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
const step = async (id: string, f: () => Promise<void>) => {
  console.log(`\n── ${id} ──`);
  try { await f(); } catch (e) { rec(`${id}-ERR`, false, "PROBE-ERR", "ฉากล้มกลางทาง (ข้อผิดพลาดของ probe หรือผลไม่คาดคิด)", e instanceof Error ? (e.stack ?? e.message).slice(0, 800) : String(e)); }
};
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d12pb-" } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: { id: string }) => t.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d12pb-" } } });
  const svcqc0 = await prisma.tenant.findFirst({ where: { slug: "svc-qc" }, select: { id: true } });
  const svcqcSnap = async () => svcqc0 ? {
    mo: await prisma.dormMoveOut.count({ where: { tenantId: svcqc0.id } }),
    lease: J((await prisma.dormLease.findMany({ where: { tenantId: svcqc0.id }, select: { id: true, status: true, endDate: true }, orderBy: { id: "asc" } })).map((l: any) => [l.id, l.status, ymdOf(l.endDate)])),
    sv: await prisma.settingValue.count({ where: { tenantId: svcqc0.id } }),
    ev: await prisma.outboxEvent.count({ where: { tenantId: svcqc0.id, type: { in: ["dorm.moveout.settled", "dorm.deposit.refund_due", "dorm.lease.renewed", "dorm.lease.ended"] } } }),
  } : null;
  const SVCQC_0 = await svcqcSnap();

  // ═══════════ fixtures (แบบข้อสอบ d.12) ═══════════
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `PB D12 ${tag}`, slug: `qc-svc-d12pb-${tag}-${stamp}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  const mkBook = async (tenantId: string, name: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: false });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = [], accepted = true) => {
    const u = await prisma.user.create({ data: { email: `svc-d12pb-${stamp}-${key}@shark.local`, name: `PB12 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: accepted ? new Date() : null } });
    return { id: u.id as string, mid: m.id as string };
  };
  const setU = async (tenantId: string, unitId: string, key: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId: unitId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId: unitId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "pb-d12" } });
  };
  let seq = 0;
  const RUNNUM = 100000 + Math.floor(Math.random() * 800000);
  const newPhone = () => `08${String((RUNNUM % 1000) * 100000 + ++seq).padStart(8, "0").slice(-8)}`;
  type L = { leaseId: string; partyId: string; roomId: string; occupancyId: string; unitId: string; tenantId: string };
  type Unit = { u: string; tenantId: string; ty: string; bld: string; rooms: Record<string, string> };
  const BOOK = await mkBook(A, `บัญชี PB12 A ${stamp}`);
  const FIN = (await prisma.accountFinance.findFirst({ where: { tenantId: A, systemId: BOOK }, select: { id: true } }))?.id ?? "";
  const BOOK_B = await mkBook(B, `บัญชี PB12 B ${stamp}`);
  const FIN_B = (await prisma.accountFinance.findFirst({ where: { tenantId: B, systemId: BOOK_B }, select: { id: true } }))?.id ?? "";
  const mkUnit = async (tenantId: string, tag: string, book: string, roomNos: string[], o: { metered?: boolean } = {}): Promise<Unit> => {
    const u = (await prisma.businessUnit.create({ data: { tenantId, type: "DORM", name: `หอ PB12 ${tag}`, slug: `pb12${tag}-${stamp}` } })).id as string;
    await prisma.accountSystemLink.create({ data: { tenantId, systemId: book, linkedKind: "BUSINESS", linkedId: u, enabled: true } });
    if (o.metered) { await setU(tenantId, u, "rooms.legal.mode", "OUT_OF_SCOPE"); await setU(tenantId, u, "rooms.legal.outOfScopeReason", OOS); } // ไม่มีมิเตอร์ = ค่าเริ่ม (แบบหน่วย DN ของข้อสอบ)
    if (o.metered) {
      for (const [k, v] of [["rooms.utility.elec.method", "FIXED_RATE"], ["rooms.utility.water.method", "FIXED_RATE"], ["rooms.utility.elec.fixedRate", 472], ["rooms.utility.water.fixedRate", 1600]] as [string, unknown][]) await setU(tenantId, u, k, v);
    } else {
      await setU(tenantId, u, "rooms.utility.elec.metering", "NONE");
      await setU(tenantId, u, "rooms.utility.water.metering", "NONE");
    }
    const ty = (await prisma.hotelRoomType.create({ data: { tenantId, unitId: u, name: "มาตรฐาน", capacity: 2, baseRateSatang: RENT, depositSatang: 0, rentMode: "MONTHLY", monthlyRateSatang: RENT, areaSqm: 24 } })).id as string;
    const bld = (await prisma.roomBuilding.create({ data: { tenantId, unitId: u, name: `อาคาร ${tag}`, floors: 3, sortOrder: 1 } })).id as string;
    const rooms: Record<string, string> = {};
    for (const no of roomNos) rooms[no] = (await prisma.hotelRoom.create({ data: { tenantId, unitId: u, roomTypeId: ty, number: no, buildingId: bld, floorNo: 1, floor: "1" } })).id;
    return { u, tenantId, ty, bld, rooms };
  };
  const LF = { "rooms.lateFee.kind": "PER_DAY", "rooms.lateFee.amount": 5_000, "rooms.lateFee.capPerBill": 50_000, "rooms.lateFee.graceDays": 0 };
  const NOLF = { "rooms.lateFee.kind": "NONE" };
  let depCount = 0;
  const mkLease = async (U: Unit, no: string, o: { start?: string; end?: string; patch?: Record<string, unknown>; deposit?: number } = {}): Promise<L> => {
    const tenantId = U.tenantId;
    const party = await prisma.party.create({ data: { tenantId, name: `ผู้เช่า ${no}`, phone: newPhone() } });
    const start = o.start ?? "2025-11-01", end = o.end ?? "2027-10-31";
    const s = await SET.snapshotPolicy({ tenantId }, "lease", { unitId: U.u, roomTypeId: U.ty, roomId: U.rooms[no] });
    const dep = o.deposit ?? DEP;
    const l = await prisma.dormLease.create({ data: {
      tenantId, unitId: U.u, roomId: U.rooms[no], partyId: party.id, status: "ACTIVE", startDate: dbDate(start), endDate: dbDate(end),
      rentSatang: RENT, commonFeeSatang: COMMON, depositSatang: dep, advanceRentSatang: 0, bookingFeeSatang: 0,
      coTenants: { occupants: [], vehicles: [] }, policySnapshot: { ...s, values: { ...(s?.values ?? {}), ...NOLF, ...(o.patch ?? {}) } }, signedAt: new Date(), createdById: "pb-d12",
    } });
    const oc = await prisma.roomOccupancy.create({ data: { tenantId, unitId: U.u, roomId: U.rooms[no], startDate: dbDate(start), endDate: dbDate(addDays(end, 1)), kind: "LEASE", refType: "DormLease", refId: l.id } });
    await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
    if (dep > 0) {
      const r = await ACC.postSecurityDeposit({ tenantId, unitId: U.u, leaseId: l.id, amountSatang: dep, idempotencyKey: `pb-d12-${stamp}-dep-${l.id}`, partyId: party.id, financeAccountId: tenantId === A ? FIN : FIN_B, paidAt: BK("2025-10-28") });
      if (!r?.ok) throw new Error(`fixture ประกัน ${no}: ${r?.code} ${r?.reason ?? ""}`);
      if (tenantId === A) depCount++;
    }
    return { leaseId: l.id, partyId: party.id, roomId: U.rooms[no], occupancyId: oc.id, unitId: U.u, tenantId };
  };
  let payN = 0;
  const payDoc = async (unitId: string, docId: string, amount: number, ymd: string) => {
    const r = await ACC.recordExternalPayment({ tenantId: A, unitId, docId, amountSatang: amount, idempotencyKey: `pb-d12-${stamp}-pay-${++payN}`, paidAt: BK(ymd) });
    if (!r?.ok) throw new Error(`fixture รับชำระ ${docId}: ${r?.code} ${r?.reason ?? ""}`);
    return r;
  };
  const prep = (ctx: any, unitId: string, P: string, now: Date): Promise<any> => dorm.prepareBillRun(ctx, { unitId, periodKey: P }, { now });
  const sendAll = async (ctx: any, unitId: string, runId: string, now: Date) => {
    let last: any = null;
    for (let i = 0; i < 40; i++) { last = await dorm.sendBillRun(ctx, { unitId, runId }, { now }); if (!last?.ok || last.done) break; if (last.sent === 0) await sleep(800); }
    return last;
  };
  const runAll = async (ctx: any, unitId: string, P: string, now: Date) => {
    const log: unknown[] = [];
    for (let i = 0; i < 6; i++) {
      const p = await prep(ctx, unitId, P, now);
      if (!p?.ok) { log.push(["prep", p?.code, p?.reason]); if (p?.code === "RUN_BUSY" || p?.code === "BUSY" || p?.code === "RUN_STALE") { await sleep(1000); continue; } return { ok: false, code: p?.code, log }; }
      const s = await sendAll(ctx, unitId, p.runId, now);
      const st = await prisma.dormBill.groupBy({ by: ["status"], where: { unitId, periodKey: P }, _count: { _all: true } });
      const drafts = st.filter((x: any) => x.status === "DRAFT").reduce((a: number, x: any) => a + x._count._all, 0);
      log.push(["send", s?.ok ? { done: s.done, sent: s.sent, failed: (s.failed ?? []).map((f: any) => f.code) } : [s?.code, s?.reason], st.map((x: any) => `${x.status}:${x._count._all}`)]);
      if (s?.ok && s.done && !drafts) return { ...s, log };
      await sleep(800);
    }
    return { ok: false, code: "RUN_NOT_DONE", log };
  };
  const billOf = async (leaseId: string, P: string): Promise<any> => prisma.dormBill.findFirst({ where: { leaseId, periodKey: P, status: { not: "VOID" } } });
  const runAndPay = async (ctx: any, U: Unit, P: string, now: Date, ls: L[], unpaid: Set<string> = new Set()) => {
    const s = await runAll(ctx, U.u, P, now);
    if (!s?.ok) throw new Error(`fixture รอบ ${P} ${U.u}: ${J(s).slice(0, 200)}`);
    for (const l of ls) {
      if (unpaid.has(l.leaseId)) continue;
      const b = await billOf(l.leaseId, P);
      if (b?.accountDocumentId) await payDoc(U.u, b.accountDocumentId, b.totalSatang, `${P}-03`);
    }
  };

  const OWN = await mkUser("owner", A, "OWNER", ["*"]);
  const OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
  const cO = { tenantId: A, actorUserId: OWN.id }, cB = { tenantId: B, actorUserId: OWNB.id };
  const mOwnerA = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: OWN.id };

  // หน่วยหลัก UX (ไม่มีมิเตอร์ · รอบ ต.ค. จริงผ่าน D.8)
  const XN = Array.from({ length: 30 }, (_, i) => `X${String(i + 1).padStart(2, "0")}`);
  const UX = await mkUnit(A, "x", BOOK, [...XN, "XS1", "XS2", "XS3", "XS4"]);
  const X: Record<string, L> = {};
  for (const no of XN) X[no] = await mkLease(UX, no, { patch: no === "X09" ? LF : {} });
  await runAndPay(cO, UX, "2026-10", NOW_OCT, Object.values(X), new Set([X.X03.leaseId, X.X09.leaseId]));
  const CARE = await mkUser("care", A, "STAFF", [UX.u], ["dorm.view", "dorm.moveout.manage"]);
  const MGR = await mkUser("mgr", A, "MANAGER", [UX.u], ["dorm.view", "dorm.moveout.manage"]);
  const MGRK = await mkUser("mgrk", A, "MANAGER", [UX.u], ["dorm.view", "dorm.moveout.manage", "dorm.deposit.deduct.approve"]);
  const PEND = await mkUser("pend", A, "MANAGER", [UX.u], ["dorm.view", "dorm.moveout.manage"], false);
  const cCare = { tenantId: A, actorUserId: CARE.id }, cMgr = { tenantId: A, actorUserId: MGR.id }, cMgrK = { tenantId: A, actorUserId: MGRK.id };
  await APS.createPolicy({ tenantId: A }, { name: "หักประกันเกินวงเงิน", entityType: "dorm.moveout.deduction", steps: [{ order: 1, approverRole: "OWNER" }] });

  // ── ตัวช่วย facade ──
  const notice = (ctx: any, l: L, moveOutDate: string, now: Date): Promise<any> => dorm.giveMoveOutNotice(ctx, { unitId: l.unitId, leaseId: l.leaseId, moveOutDate }, { now });
  const moRow = (l: L): Promise<any> => prisma.dormMoveOut.findFirst({ where: { leaseId: l.leaseId } });
  const files = async (ctx: any, l: L, mo: string, n = 1): Promise<string[]> => {
    const r = await dorm.addMoveOutFiles(ctx, { unitId: l.unitId, moveOutId: mo, files: Array.from({ length: n }, (_, i) => ({ data: PNG, contentType: "image/png", filename: `ev-${i}.png` })) }, { put: async () => {} });
    return r?.ok ? (r.added ?? []).map((a: any) => a.fileId) : [];
  };
  const dmg = (ev: string[], amount: number, key = "screen") => (amount > 0 ? [{ key, labelTh: "มุ้งลวดหน้าต่าง", verdict: "DAMAGE", amountSatang: amount, evidenceFileIds: ev }] : []);
  const inspect = (ctx: any, l: L, mo: string, items: any[], now: Date): Promise<any> => dorm.recordMoveOutInspection(ctx, { unitId: l.unitId, moveOutId: mo, items, meterReadings: [] }, { now });
  const sendSum = (ctx: any, l: L, mo: string, now: Date): Promise<any> => dorm.sendMoveOutSummary(ctx, { unitId: l.unitId, moveOutId: mo }, { now });
  const settleIn = (l: L, mo: string, fin = FIN) => ({ unitId: l.unitId, moveOutId: mo, refund: { channel: "TRANSFER", financeAccountId: fin } });
  const settle = (ctx: any, l: L, mo: string, now: Date, fin = FIN): Promise<any> => dorm.settleMoveOut(ctx, settleIn(l, mo, fin), { now });
  const reopen = (ctx: any, l: L, mo: string, now: Date, reason = "ผู้เช่าโต้แย้งยอด"): Promise<any> => dorm.reopenMoveOutSummary(ctx, { unitId: l.unitId, moveOutId: mo, reason }, { now });
  const settleJ = (ctx: any, l: L, mo: string, now: Date, delayMs = 0, fin = FIN): Call => ({ m: "dorm", op: "settleMoveOut", args: [ctx, settleIn(l, mo, fin), { now: D(now) }], delayMs });
  const sendJ = (ctx: any, l: L, mo: string, now: Date, delayMs = 0): Call => ({ m: "dorm", op: "sendMoveOutSummary", args: [ctx, { unitId: l.unitId, moveOutId: mo }, { now: D(now) }], delayMs });
  const reopenJ = (ctx: any, l: L, mo: string, now: Date, delayMs = 0): Call => ({ m: "dorm", op: "reopenMoveOutSummary", args: [ctx, { unitId: l.unitId, moveOutId: mo, reason: "ผู้เช่าโต้แย้งยอด" }, { now: D(now) }], delayMs });
  /** แจ้ง → แนบรูป → ตรวจ (ค่าเสียหาย) → ส่ง (ตรึง) */
  const frozenMo = async (ctx: any, l: L, o: { moveOut?: string; noticeAt?: Date; damage?: number; at?: Date; send?: boolean } = {}) => {
    const moveOut = o.moveOut ?? "2026-10-31";
    const n = await notice(cO, l, moveOut, o.noticeAt ?? BK("2026-09-30", "10:00"));
    if (!n?.ok) throw new Error(`fixture แจ้ง ${l.leaseId}: ${J(n).slice(0, 200)}`);
    const mo = n.moveOutId as string;
    const damage = o.damage ?? 35_000;
    const ev = damage > 0 ? await files(ctx, l, mo, 1) : [];
    const at = o.at ?? BK(moveOut, "10:00");
    const i = await inspect(ctx, l, mo, dmg(ev, damage), at);
    if (!i?.ok) throw new Error(`fixture ตรวจ ${l.leaseId}: ${J(i).slice(0, 200)}`);
    if (o.send === false) return { mo, ev, send: null as any };
    const s = await sendSum(ctx, l, mo, at);
    if (!s?.ok) throw new Error(`fixture ส่ง ${l.leaseId}: ${J(s).slice(0, 200)}`);
    return { mo, ev, send: s };
  };
  const settleKeyJvs = async (mo: string) => (await prisma.accountJournalEntry.findMany({ where: { tenantId: A, refType: "DormSecurityDeposit", idempotencyKey: { contains: `dorm.moveout:${mo}:settle:` } }, select: { id: true, status: true, reversalOfId: true, createdAt: true } }));
  const liveSettleJvs = async (mo: string) => (await settleKeyJvs(mo)).filter((e: any) => e.status === "POSTED" && !e.reversalOfId);
  const moDocs = async (mo: string) => prisma.accountDocument.findMany({ where: { tenantId: A, refType: "DormMoveOut", refId: { startsWith: mo } }, orderBy: { createdAt: "asc" } });
  const cnOf = async (docId: string) => (await prisma.accountDocument.findMany({ where: { tenantId: A, sourceDocId: docId, docType: "CREDIT_NOTE", status: { notIn: ["VOIDED", "CANCELLED", "DRAFT"] } }, select: { grandTotal: true } })).reduce((s: number, d: any) => s + d.grandTotal, 0);
  const paidOf = async (docId: string) => (await prisma.accountDocumentPayment.findMany({ where: { tenantId: A, documentId: docId, voidedAt: null }, select: { amount: true, whtAmountSatang: true, channel: true } }));
  const statusOf = async (mo: string) => (await prisma.dormMoveOut.findFirst({ where: { id: mo }, select: { status: true } }))?.status;
  /** ปิดให้จบ (ใช้หลังการแข่ง): STALE/BILL_PENDING ⇒ เปิดใหม่ → ส่ง → ปิด */
  const finish = async (ctx: any, l: L, mo: string, now: Date) => {
    const log: string[] = [];
    for (let i = 0; i < 4; i++) {
      const st = await settle(ctx, l, mo, now);
      log.push(`settle:${st?.ok ? "OK" : st?.code}`);
      if (st?.ok) return { st, log };
      if (st?.code === "STALE" || st?.code === "NOT_FROZEN" || st?.code === "DEDUCTION_REJECTED") {
        const row = await prisma.dormMoveOut.findFirst({ where: { id: mo }, select: { deductions: true } });
        if ((row?.deductions as any)?.frozen) { const r = await reopen(cO, l, mo, now); log.push(`reopen:${r?.ok ? "OK" : r?.code}`); }
        const s = await sendSum(ctx, l, mo, now); log.push(`send:${s?.ok ? "OK" : s?.code}`);
        continue;
      }
      if (st?.code === "REOPENING") { const r = await reopen(cO, l, mo, now); log.push(`reopen:${r?.ok ? "OK" : r?.code}`); const s = await sendSum(ctx, l, mo, now); log.push(`send:${s?.ok ? "OK" : s?.code}`); continue; }
      if (st?.code === "BUSY") { await sleep(500); continue; }
      return { st, log };
    }
    return { st: null, log };
  };

  // ═══════════ เงิน (หลังทุกฉาก) ═══════════
  const seenJv = new Map<string, number>(), seenDoc = new Map<string, { st: string; gt: number }>(), seenPay = new Set<string>();
  const leaseIndex = async () => new Map<string, any>((await prisma.dormLease.findMany({ where: { tenantId: A }, select: { id: true, unitId: true, partyId: true, previousLeaseId: true } })).map((l: any) => [l.id, l]));
  const rootOfIdx = (idx: Map<string, any>, id: string) => { let cur = idx.get(id); const seen = new Set<string>(); while (cur?.previousLeaseId && !seen.has(cur.id)) { seen.add(cur.id); const p = idx.get(cur.previousLeaseId); if (!p || p.partyId !== cur.partyId || p.unitId !== cur.unitId) break; cur = p; } return cur?.id ?? id; };
  const money = async (tag: string) => {
    const issues: string[] = [];
    const jvs = await prisma.accountJournalEntry.findMany({ where: { tenantId: A }, select: { id: true, refType: true, refId: true, idempotencyKey: true, status: true, reversalOfId: true, lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } } });
    for (const e of jvs) {
      const dr = e.lines.reduce((s: number, x: any) => s + x.debit, 0), cr = e.lines.reduce((s: number, x: any) => s + x.credit, 0);
      if (dr !== cr) issues.push(`JV ไม่สมดุล ${e.id.slice(-6)} ${dr}≠${cr}`);
    }
    const jvMap = new Map<string, any>(jvs.map((e: any) => [e.id, e]));
    for (const [id, n] of seenJv) { const e = jvMap.get(id); if (!e) issues.push(`JV ถูกลบ ${id.slice(-6)}`); else if (e.lines.length !== n) issues.push(`JV บรรทัดเปลี่ยน ${id.slice(-6)}`); }
    const docs = await prisma.accountDocument.findMany({ where: { tenantId: A }, select: { id: true, docType: true, status: true, grandTotal: true, sourceDocId: true, refType: true, refId: true } });
    const docMap = new Map<string, any>(docs.map((d: any) => [d.id, d]));
    const dead = ["VOIDED", "CANCELLED", "DRAFT"];
    for (const [id, p] of seenDoc) {
      const d = docMap.get(id);
      if (!d) issues.push(`เอกสารถูกลบ ${id.slice(-6)}`);
      else if (!dead.includes(p.st) && dead.includes(d.status)) issues.push(`เอกสารถูกยกเลิกแทนใบลดหนี้ ${d.docType} ${id.slice(-6)}`);
      else if (!dead.includes(p.st) && p.gt !== d.grandTotal) issues.push(`ยอดเอกสารถูกแก้ทับ ${id.slice(-6)} ${p.gt}→${d.grandTotal}`);
    }
    const pays = await prisma.accountDocumentPayment.findMany({ where: { tenantId: A }, select: { id: true, documentId: true, amount: true, whtAmountSatang: true, voidedAt: true } });
    const payIds = new Set<string>(pays.map((p: any) => p.id));
    for (const id of seenPay) if (!payIds.has(id)) issues.push(`แถวรับชำระถูกลบ ${id.slice(-6)}`);
    const paidBy = new Map<string, number>();
    for (const p of pays) if (!p.voidedAt) paidBy.set(p.documentId, (paidBy.get(p.documentId) ?? 0) + p.amount + (p.whtAmountSatang ?? 0));
    const cnBy = new Map<string, number>();
    for (const d of docs) if (d.docType === "CREDIT_NOTE" && d.sourceDocId && !dead.includes(d.status)) cnBy.set(d.sourceDocId, (cnBy.get(d.sourceDocId) ?? 0) + d.grandTotal);
    for (const d of docs) {
      if (!["INVOICE", "DEBIT_NOTE"].includes(d.docType) || dead.includes(d.status)) continue;
      const used = (paidBy.get(d.id) ?? 0) + (cnBy.get(d.id) ?? 0);
      if (used > d.grandTotal + 1) issues.push(`ใช้เกินยอดเอกสาร ${d.docType} ${d.refType}/${String(d.refId).slice(-8)}: ชำระ ${paidBy.get(d.id) ?? 0} + ลดหนี้ ${cnBy.get(d.id) ?? 0} > ${d.grandTotal}`);
    }
    // ใบวันออกค้างเกิน 1 ใบต่อใบย้ายออก (รุ่นเก่าต้องถูกลดหนี้เต็ม)
    const mos = await prisma.dormMoveOut.findMany({ where: { tenantId: A }, select: { id: true, unitId: true, leaseId: true, status: true, deductions: true } });
    const idx = await leaseIndex();
    for (const mo of mos) {
      const inv = docs.filter((d: any) => d.refType === "DormMoveOut" && String(d.refId).startsWith(mo.id) && d.docType === "INVOICE" && !dead.includes(d.status));
      const liveInv = inv.filter((d: any) => (cnBy.get(d.id) ?? 0) < d.grandTotal);
      const ded = mo.deductions as any;
      const keyJ = jvs.filter((e: any) => String(e.idempotencyKey ?? "").includes(`dorm.moveout:${mo.id}:settle:`) && e.status === "POSTED" && !e.reversalOfId);
      if (CLOSED.includes(mo.status)) {
        const s = ded?.settle;
        if (!s) { issues.push(`ปิดแล้วไม่มี settle ${mo.id.slice(-6)}`); continue; }
        if (s.refundSatang + s.appliedSatang !== s.heldSatang && s.heldSatang > 0) issues.push(`คืน+หัก≠ถือ ${mo.id.slice(-6)} ${s.refundSatang}+${s.appliedSatang}≠${s.heldSatang}`);
        if ((mo.status === "REFUNDED") !== (s.refundSatang > 0)) issues.push(`สถานะ/ยอดคืนไม่ตรง ${mo.id.slice(-6)} ${mo.status} ${s.refundSatang}`);
        if (s.entryId) {
          const e = jvMap.get(s.entryId);
          if (!e) issues.push(`ไม่พบ JV ปิด ${mo.id.slice(-6)}`);
          else {
            const dr214 = e.lines.filter((x: any) => /^214/.test(x.account.code)).reduce((a: number, x: any) => a + x.debit, 0);
            const cr = e.lines.reduce((a: number, x: any) => a + x.credit, 0);
            if (dr214 !== s.heldSatang || cr !== s.heldSatang) issues.push(`JV ปิด Dr214 ${dr214} / Cr ${cr} ≠ ถือ ${s.heldSatang}`);
          }
        }
        if (keyJ.length > 1) issues.push(`JV ปิดซ้ำ ${mo.id.slice(-6)} ×${keyJ.length}`);
        if (liveInv.length > 1) issues.push(`ใบวันออกค้างหลายรุ่น ${mo.id.slice(-6)} ×${liveInv.length}`);
        const root = rootOfIdx(idx, mo.leaseId);
        const bal = jvs.filter((e: any) => e.refType === "DormSecurityDeposit" && e.refId === `${mo.unitId}:${root}`).flatMap((e: any) => e.lines).filter((x: any) => /^214/.test(x.account.code)).reduce((a: number, x: any) => a + x.credit - x.debit, 0);
        if (bal !== 0) issues.push(`2140 ของต้นสายไม่กลับเป็น 0 หลังปิด ${mo.id.slice(-6)} = ${bal}`);
      } else if (keyJ.length) issues.push(`มี JV ปิดแต่ใบยังไม่ปิด ${mo.id.slice(-6)} (${mo.status})`);
    }
    const recv = jvs.filter((e: any) => e.refType === "DormSecurityDeposit" && /#RECEIVE:/.test(String(e.idempotencyKey ?? ""))).length;
    if (recv !== depCount) issues.push(`JV รับประกัน ${recv} ≠ ที่รับจริง ${depCount} (ประกันถูกสร้าง/ย้ายเพิ่ม)`);
    for (const e of jvs) seenJv.set(e.id, e.lines.length);
    for (const d of docs) seenDoc.set(d.id, { st: d.status, gt: d.grandTotal });
    for (const p of pays) seenPay.add(p.id);
    rec(`${tag}-M`, !issues.length, "BLOCKER", "เงินหลังฉาก: JV สมดุล · ไม่ลบ/ไม่แก้ทับ/ไม่ void · ไม่ใช้เกินยอด · คืน+หัก=ถือ · Dr214=ถือ · 2140 ต้นสาย=0 หลังปิด · JV ปิด ≤1 ⇔ ปิด · ไม่มีประกันใหม่", { issues: issues.slice(0, 12), n: issues.length });
  };
  await money("BASE");

  // ═════════════ SS ปิด ∥ ปิด: 4 โพรเซส × 3 + ในโพรเซส 30 ทาง (เกิน pool) ═════════════
  await step("SS ปิด ∥ ปิด 42 ทาง", async () => {
    const f = await frozenMo(cO, X.X01);
    const at = BK("2026-10-31", "13:00");
    const rs = await procs([
      ...Array.from({ length: 4 }, () => Array.from({ length: 3 }, () => settleJ(cO, X.X01, f.mo, at))),
      Array.from({ length: 30 }, () => settleJ(cO, X.X01, f.mo, at)),
    ]);
    const jv = await liveSettleJvs(f.mo);
    const ok = rs.filter((x) => x?.r?.ok === true);
    const first = ok.filter((x) => x.r.duplicate === false);
    const ev = await prisma.outboxEvent.count({ where: { tenantId: A, idempotencyKey: `dorm.moveout.settled:${f.mo}` } });
    const busy = rs.filter((x) => x?.r?.code === "BUSY").length;
    const pays = (await paidOf(f.send.invoiceDocId)).filter((p: any) => p.channel === "DEPOSIT_APPLY").length;
    rec("SS-1", jv.length === 1 && first.length === 1 && ev === 1 && pays === 1 && CLOSED.includes(await statusOf(f.mo)) && !badOf(rs).length, "BLOCKER",
      "ปิด 42 ทาง (4×3 + 30 ในโพรเซสเดียว) ⇒ JV ปิด 1 · duplicate:false 1 · event 1 · แถว DEPOSIT_APPLY 1 · ไม่มี throw/P20xx/UNAVAILABLE",
      { jv: jv.length, first: first.length, ev, pays, tally: tally(rs), bad: badOf(rs).slice(0, 3) });
    rec("SS-2", busy === 0 && ok.length === rs.length, "MINOR", "ปิด 42 ทาง: ทุกคำขอได้ ok (ไม่มี BUSY ที่ผู้ใช้ต้องกดซ้ำ)", { busy, ok: ok.length, n: rs.length, slowest: Math.max(...rs.map((x) => x?.ms ?? 0)) });
    await money("SS");
  });

  // ═════════════ SR ปิด ∥ เปิดใบสรุปใหม่ ═════════════
  await step("SR ปิด ∥ reopen", async () => {
    const f = await frozenMo(cO, X.X02);
    const at = BK("2026-10-31", "13:00");
    const rs = await procs([
      [settleJ(cO, X.X02, f.mo, at), settleJ(cO, X.X02, f.mo, at, 40), settleJ(cO, X.X02, f.mo, at, 120)],
      [reopenJ(cO, X.X02, f.mo, at), reopenJ(cO, X.X02, f.mo, at, 60)],
      [settleJ(cO, X.X02, f.mo, at, 10), reopenJ(cO, X.X02, f.mo, at, 30), settleJ(cO, X.X02, f.mo, at, 200)],
    ]);
    const jv = await liveSettleJvs(f.mo);
    const inv = f.send.invoiceDocId as string;
    const cn = await cnOf(inv), paid = (await paidOf(inv)).reduce((s: number, p: any) => s + p.amount, 0);
    const doc = await prisma.accountDocument.findFirst({ where: { id: inv } });
    const row = await prisma.dormMoveOut.findFirst({ where: { id: f.mo } });
    const st = row?.status, fz = (row?.deductions as any)?.frozen;
    const consistent = jv.length === 1 ? (CLOSED.includes(st) && cn === 0 && paid === doc.grandTotal) : (jv.length === 0 && !CLOSED.includes(st) && cn === doc.grandTotal && !fz);
    rec("SR-1", consistent && !badOf(rs).length, "BLOCKER", "ปิด ∥ เปิดใหม่: (ปิดชนะ ⇒ ใบวันออกจ่ายครบด้วยประกัน ไม่มีใบลดหนี้) หรือ (เปิดใหม่ชนะ ⇒ ไม่มี JV · ใบลดหนี้เต็ม · ไม่ตรึง) — ไม่มีทั้งหักและลดหนี้", { jv: jv.length, st, cn, paid, grand: doc?.grandTotal, frozen: !!fz, tally: tally(rs), bad: badOf(rs).slice(0, 2) });
    const fin = jv.length ? null : await finish(cO, X.X02, f.mo, at);
    if (fin) rec("SR-2", fin.st?.ok === true, "MAJOR", "หลังเปิดใหม่ชนะ: ส่งรุ่น 2 แล้วปิดได้", fin.log);
    await money("SR");
  });

  // ═════════════ SP ปิด ∥ รับชำระมือบนบิลค้าง (facade บัญชี · D.10 ยังไม่มี) ═════════════
  await step("SP ปิด ∥ รับชำระบิลค้าง", async () => {
    const f = await frozenMo(cO, X.X03);
    const oct = await billOf(X.X03.leaseId, "2026-10");
    const at = BK("2026-10-31", "13:00");
    const payJ = (k: string, delayMs: number): Call => ({ m: "acc", op: "recordExternalPayment", args: [{ tenantId: A, unitId: UX.u, docId: oct.accountDocumentId, amountSatang: oct.totalSatang, idempotencyKey: `pb-d12-${stamp}-sp-${k}`, paidAt: D(BK("2026-10-31", "12:00")) }], delayMs });
    const rs = await procs([
      [settleJ(cO, X.X03, f.mo, at), settleJ(cO, X.X03, f.mo, at, 80)],
      [payJ("a", 0), payJ("b", 50)],
      [settleJ(cO, X.X03, f.mo, at, 20), payJ("c", 100), settleJ(cO, X.X03, f.mo, at, 150)],
    ]);
    const jv = await liveSettleJvs(f.mo);
    const pays = await paidOf(oct.accountDocumentId);
    const applied = pays.reduce((s: number, p: any) => s + p.amount, 0);
    const dep = pays.filter((p: any) => p.channel === "DEPOSIT_APPLY").length;
    rec("SP-1", applied <= oct.totalSatang && dep <= 1 && jv.length <= 1 && !badOf(rs).length, "BLOCKER", "ปิด ∥ รับชำระบิล ต.ค. ที่ค้าง (3 คีย์): บิลไม่ถูกชำระเกินยอด (เงินสด + หักประกัน ≤ ยอดบิล · ส่วนเกินไป 2110) · JV ≤ 1",
      { applied, total: oct.totalSatang, pays: pays.map((p: any) => [p.channel, p.amount]), jv: jv.length, tally: tally(rs) });
    const fin = jv.length ? null : await finish(cO, X.X03, f.mo, at);
    const row = await prisma.dormMoveOut.findFirst({ where: { id: f.mo }, select: { status: true, refundSatang: true, deductions: true } });
    const s = (row?.deductions as any)?.settle;
    const cashFirst = pays.some((p: any) => p.channel !== "DEPOSIT_APPLY");
    const pays2 = await paidOf(oct.accountDocumentId);
    const applied2 = pays2.reduce((a: number, p: any) => a + p.amount, 0);
    rec("SP-2", CLOSED.includes(row?.status) && applied2 <= oct.totalSatang && (s ? s.refundSatang + s.appliedSatang === s.heldSatang : false), "MAJOR", "หลังแข่ง: ปิดได้ · บิล ต.ค. ไม่ถูกชำระเกินยอด (เงินสดมาก่อน ⇒ ประกันไม่หักซ้ำ)", { fin: fin?.log ?? "settled-in-race", status: row?.status, settle: s && [s.appliedSatang, s.refundSatang], cashFirst, pays: pays2.map((p: any) => [p.channel, p.amount]) });
    await money("SP");
  });

  // ═════════════ SD ส่ง ×N ∥ ใบเพิ่มหนี้ใหม่ ⇒ STALE ═════════════
  await step("SD ส่ง ∥ ใบเพิ่มหนี้", async () => {
    const n = await notice(cO, X.X04, "2026-10-31", BK("2026-09-30", "10:00"));
    const mo = n.moveOutId as string;
    const ev = await files(cO, X.X04, mo, 1);
    await inspect(cO, X.X04, mo, dmg(ev, 35_000), BK("2026-10-31", "10:00"));
    const oct = await billOf(X.X04.leaseId, "2026-10");
    const at = BK("2026-10-31", "11:00");
    const dnJ = (delayMs: number): Call => ({ m: "dorm", op: "adjustSentBill", args: [cO, { unitId: UX.u, billId: oct.id, kind: "DEBIT", reason: "ค่าซ่อมก๊อกน้ำที่ผู้เช่าทำเสียหาย", idempotencyKey: `pb-d12-${stamp}-sd`, lines: [{ code: "OTHER", labelTh: "ค่าซ่อมก๊อกน้ำ", amountSatang: 12_000 }] }], delayMs });
    const rs = await procs([
      [sendJ(cO, X.X04, mo, at), sendJ(cO, X.X04, mo, at, 30), sendJ(cO, X.X04, mo, at, 90)],
      [sendJ(cO, X.X04, mo, at, 10), sendJ(cO, X.X04, mo, at, 60), sendJ(cO, X.X04, mo, at, 150)],
      [dnJ(0), dnJ(40), dnJ(120)],
      [sendJ(cO, X.X04, mo, at, 20), sendJ(cO, X.X04, mo, at, 200), sendJ(cO, X.X04, mo, at, 400)],
    ]);
    const dn = await prisma.accountDocument.findMany({ where: { tenantId: A, sourceDocId: oct.accountDocumentId, docType: "DEBIT_NOTE", status: { notIn: ["VOIDED", "CANCELLED", "DRAFT"] } }, select: { id: true } });
    const row = await prisma.dormMoveOut.findFirst({ where: { id: mo } });
    const fz = (row?.deductions as any)?.frozen;
    const docs = await moDocs(mo);
    const live = [];
    for (const d of docs) if (d.docType === "INVOICE" && (await cnOf(d.id)) < d.grandTotal) live.push(d.refId);
    const inFrozen = fz ? dn.every((d: any) => (fz.docIds ?? []).includes(d.id)) : true;
    const st = await settle(cO, X.X04, mo, BK("2026-10-31", "13:00"));
    const jvSd = (await liveSettleJvs(mo)).length;
    rec("SD-1", dn.length === 1 && (!fz ? st?.code === "NOT_FROZEN" && jvSd === 0 : inFrozen ? st?.ok === true || st?.code === "STALE" : st?.code === "STALE" && jvSd === 0), "BLOCKER", "ส่ง ×12 ∥ ใบเพิ่มหนี้: ใบเพิ่มหนี้ที่ไม่อยู่ในชุดที่ตรึง ⇒ ปิด STALE (ไม่มี JV ที่ลืมหนี้ใหม่)", { dn: dn.length, frozen: !!fz, inFrozen, settle: st?.ok ? "OK" : st?.code, tally: tally(rs) });
    rec("SD-2", live.length <= 1 && !badOf(rs, ["STALE"]).length, "MAJOR", "ส่ง ×12 ∥ ใบเพิ่มหนี้: ใบวันออกที่ยังมีผล (ไม่ถูกลดหนี้เต็ม) ≤ 1 · ไม่มี throw", { invoices: docs.map((d: any) => [d.refId.slice(-4), d.grandTotal]), live, bad: badOf(rs, ["STALE"]).slice(0, 3) });
    const fin = st?.ok ? null : await finish(cO, X.X04, mo, BK("2026-10-31", "13:00"));
    const dnPaid = dn[0] ? (await paidOf(dn[0].id)).reduce((s: number, p: any) => s + p.amount, 0) : -1;
    rec("SD-3", CLOSED.includes(await statusOf(mo)) && dnPaid === 12_000, "MAJOR", "หลังแข่ง: ปิดได้ และใบเพิ่มหนี้ถูกหักด้วยประกันครบ (ไม่ตกหล่น)", { fin: fin?.log, dnPaid });
    await money("SD");
  });

  // ═════════════ SI ตรวจห้องซ้ำ ∥ ส่ง ═════════════
  await step("SI ตรวจซ้ำ ∥ ส่ง", async () => {
    const n = await notice(cO, X.X08, "2026-10-31", BK("2026-09-30", "10:00"));
    const mo = n.moveOutId as string;
    const ev = await files(cO, X.X08, mo, 2);
    await inspect(cO, X.X08, mo, dmg([ev[0]], 35_000), BK("2026-10-31", "10:00"));
    const at = BK("2026-10-31", "11:00");
    const inJ = (amt: number, delayMs: number): Call => ({ m: "dorm", op: "recordMoveOutInspection", args: [cO, { unitId: UX.u, moveOutId: mo, items: dmg([ev[1]], amt), meterReadings: [] }, { now: D(at) }], delayMs });
    const rs = await procs([
      [sendJ(cO, X.X08, mo, at), sendJ(cO, X.X08, mo, at, 50), sendJ(cO, X.X08, mo, at, 150)],
      [inJ(60_000, 0), inJ(70_000, 40), inJ(80_000, 100)],
      [sendJ(cO, X.X08, mo, at, 20), inJ(90_000, 70), sendJ(cO, X.X08, mo, at, 250)],
    ]);
    const row = await prisma.dormMoveOut.findFirst({ where: { id: mo } });
    const fz = (row?.deductions as any)?.frozen;
    const inspDmg = ((row?.inspection as any)?.items ?? []).filter((i: any) => i.verdict === "DAMAGE").reduce((s: number, i: any) => s + i.amountSatang, 0);
    const fzDmg = fz ? (fz.lines ?? []).filter((l: any) => l.code === "DAMAGE").reduce((s: number, l: any) => s + l.amountSatang, 0) : null;
    const inv = fz?.invoiceDocId ? await prisma.accountDocument.findFirst({ where: { id: fz.invoiceDocId } }) : null;
    rec("SI-1", !fz || (fzDmg === inspDmg && row?.deductSatang === inspDmg && (!inv || inv.grandTotal === fzDmg)), "BLOCKER", "ตรวจซ้ำ ∥ ส่ง: ใบที่ตรึงต้องตรงผลตรวจที่บันทึกอยู่ (ไม่มีใบตรึงด้วยข้อมูลเก่าแต่สถานะ/ผลตรวจเป็นข้อมูลใหม่) · ใบแจ้งหนี้ = บรรทัดที่ตรึง",
      { frozen: !!fz, fzDmg, inspDmg, colDeduct: row?.deductSatang, inv: inv?.grandTotal ?? null, tally: tally(rs) });
    rec("SI-2", !badOf(rs, ["STALE"]).length, "MAJOR", "ตรวจซ้ำ ∥ ส่ง: ไม่มี throw/UNAVAILABLE (FROZEN/STALE ได้)", badOf(rs, ["STALE"]).slice(0, 3));
    const fin = await finish(cO, X.X08, mo, BK("2026-10-31", "13:00"));
    rec("SI-3", fin.st?.ok === true, "MAJOR", "หลังแข่ง ปิดได้", fin.log);
    await money("SI");
  });

  // ═════════════ SL ปิด ∥ ยกเว้นค่าปรับ ∥ ใบเพิ่มหนี้ค่าปรับ (D.11) ═════════════
  await step("SL ปิด ∥ ค่าปรับ D.11", async () => {
    const at = BK("2026-11-10", "10:00");
    const f = await frozenMo(cO, X.X09, { at, damage: 0 });
    const oct = await billOf(X.X09.leaseId, "2026-10");
    const row0 = await prisma.dormMoveOut.findFirst({ where: { id: f.mo } });
    const late0 = ((row0?.deductions as any)?.frozen?.lines ?? []).filter((l: any) => l.code === "LATE_FEE").reduce((s: number, l: any) => s + l.amountSatang, 0);
    const wJ = (delayMs: number): Call => ({ m: "dorm", op: "waiveLateFee", args: [cO, { unitId: UX.u, sourceBillId: oct.id, reason: RSN }, { now: D(at) }], delayMs });
    const dJ = (delayMs: number): Call => ({ m: "dorm", op: "adjustSentBill", args: [cO, { unitId: UX.u, billId: oct.id, kind: "DEBIT", reason: "ค่าปรับชำระล่าช้าเพิ่มเติม", idempotencyKey: `pb-d12-${stamp}-sl`, lines: [{ code: "LATE_FEE", labelTh: "ค่าปรับชำระล่าช้า", amountSatang: 1_000 }] }], delayMs });
    const rs = await procs([
      [settleJ(cO, X.X09, f.mo, at), settleJ(cO, X.X09, f.mo, at, 60), settleJ(cO, X.X09, f.mo, at, 160)],
      [wJ(0), wJ(30), wJ(90)],
      [dJ(0), dJ(50), settleJ(cO, X.X09, f.mo, at, 20)],
    ]);
    const jv = await liveSettleJvs(f.mo);
    const waived = await prisma.auditLog.count({ where: { tenantId: A, action: "dorm.latefee.waived", targetId: oct.id } });
    const dn = await prisma.accountDocument.findMany({ where: { tenantId: A, sourceDocId: oct.accountDocumentId, docType: "DEBIT_NOTE", status: { notIn: ["VOIDED", "CANCELLED", "DRAFT"] } }, select: { id: true, createdAt: true } });
    const fz = (await prisma.dormMoveOut.findFirst({ where: { id: f.mo } }))?.deductions as any;
    const sneaky = jv.length ? dn.filter((d: any) => d.createdAt < jv[0].createdAt && !(fz?.frozen?.docIds ?? []).includes(d.id)) : [];
    rec("SL-1", late0 > 0 && waived === 0 && !sneaky.length && jv.length <= 1 && !badOf(rs, ["STALE"]).length, "BLOCKER", "ปิด ∥ ยกเว้นค่าปรับ ∥ ใบเพิ่มหนี้ค่าปรับ: ยกเว้นหลังตรึง = MOVEOUT_FROZEN (ไม่มี 'ยกเว้นแล้ว + ใบวันออกเก็บ') · ใบเพิ่มหนี้ที่เกิดก่อน JV ต้องอยู่ในชุดที่หัก",
      { late0, waived, dn: dn.length, sneaky: sneaky.length, jv: jv.length, tally: tally(rs) });
    if (!jv.length) { const fin = await finish(cO, X.X09, f.mo, at); rec("SL-2", fin.st?.ok === true, "MAJOR", "หลังแข่ง ปิดได้", fin.log); }
    await money("SL");
  });

  // ═════════════ AP อนุมัติ ∥ ปิด · ปฏิเสธ ∥ ปิด ═════════════
  await step("AP อนุมัติ/ปฏิเสธ ∥ ปิด", async () => {
    const at = BK("2026-10-31", "13:00");
    const reqOf = async (mo: string) => prisma.approvalRequest.findFirst({ where: { tenantId: A, entityType: "dorm.moveout.deduction", entityId: { startsWith: mo } } });
    const fa = await frozenMo(cCare, X.X05, { damage: 250_000 });
    const fr = await frozenMo(cCare, X.X06, { damage: 250_000 });
    const ra = await reqOf(fa.mo), rr = await reqOf(fr.mo);
    const decJ = (id: string, decision: string, delayMs: number): Call => ({ m: "aps", op: "decide", args: [mOwnerA, { tenantId: A }, id, { decision }], delayMs });
    const rs = await procs([
      [decJ(ra?.id ?? "-", "APPROVED", 60), decJ(rr?.id ?? "-", "REJECTED", 60)],
      [settleJ(cCare, X.X05, fa.mo, at), settleJ(cCare, X.X05, fa.mo, at, 50), settleJ(cCare, X.X05, fa.mo, at, 120), settleJ(cCare, X.X05, fa.mo, at, 300)],
      [settleJ(cCare, X.X06, fr.mo, at), settleJ(cCare, X.X06, fr.mo, at, 50), settleJ(cCare, X.X06, fr.mo, at, 120), settleJ(cCare, X.X06, fr.mo, at, 300)],
    ]);
    const ja = await liveSettleJvs(fa.mo), jr = await liveSettleJvs(fr.mo);
    const after = await settle(cCare, X.X05, fa.mo, at);
    const afterR = await settle(cCare, X.X06, fr.mo, at);
    rec("AP-1", !!ra && ja.length <= 1 && after?.ok === true && (await liveSettleJvs(fa.mo)).length === 1 && !badOf(rs, ["NEEDS_APPROVAL"]).length, "BLOCKER", "อนุมัติ ∥ ปิด (ผู้ดูแลไม่มีคีย์): ก่อนอนุมัติ NEEDS_APPROVAL · หลังอนุมัติปิดได้ · JV 1", { req: ra?.status, tally: tally(rs.filter((x) => x?.r !== undefined)), after: after?.ok ? "OK" : after?.code });
    rec("AP-2", !!rr && jr.length === 0 && afterR?.code === "DEDUCTION_REJECTED", "BLOCKER", "ปฏิเสธ ∥ ปิด: ไม่มี JV เลย · หลังปฏิเสธ = DEDUCTION_REJECTED", { req: rr?.status, jv: jr.length, afterR: afterR?.ok ? "OK!" : afterR?.code });
    await money("AP");
  });

  // ═════════════ AK ผู้อนุมัติที่ไม่มีคีย์ ═════════════
  await step("AK ผู้ไม่มีคีย์อนุมัติ", async () => {
    const at = BK("2026-10-31", "13:00");
    const fo = await frozenMo(cO, X.X07, { damage: 250_000 });           // ตรึงโดยเจ้าของ ⇒ ไม่มีคำขอ
    const fc = await frozenMo(cCare, X.X10, { damage: 250_000 });        // ตรึงโดยผู้ดูแล ⇒ คำขอ PENDING
    const req = await prisma.approvalRequest.findFirst({ where: { tenantId: A, entityType: "dorm.moveout.deduction", entityId: { startsWith: fc.mo } } });
    const mMgr = { role: "MANAGER", unitAccess: [UX.u], permissions: { "dorm.view": true, "dorm.moveout.manage": true }, userId: MGR.id };
    const d1 = req ? await APS.decide(mMgr, { tenantId: A }, req.id, { decision: "APPROVED" }).catch((e: unknown) => ({ ok: false, status: `threw:${errMsg(e)}` })) : null;
    const req1 = req ? await prisma.approvalRequest.findFirst({ where: { id: req.id } }) : null;
    const s1 = await settle(cMgr, X.X10, fc.mo, at);
    const s2 = await settle(cMgr, X.X07, fo.mo, at);
    const s3 = await settle(cCare, X.X07, fo.mo, at);
    rec("AK-1", req1?.status === "PENDING" && s1?.code === "NEEDS_APPROVAL" && (await liveSettleJvs(fc.mo)).length === 0, "BLOCKER",
      "ผู้จัดการคุมหน่วยแต่ไม่มีคีย์ dorm.deposit.deduct.approve: อนุมัติคำขอของผู้ดูแลไม่ได้ · ปิดใบที่รออนุมัติไม่ได้ (R7)", { decide: d1?.ok ?? d1?.status, req: req1?.status, s1: s1?.code ?? "OK!" });
    const selfAud = await prisma.auditLog.count({ where: { tenantId: A, targetId: fo.mo, action: { in: ["dorm.moveout.summary_frozen", "dorm.moveout.deduction_self_approved"] } } });
    rec("AK-2", true, "NOTE", "ข้อสังเกต (มติ Y16 ของ builder · ถามผู้คุม): ใบหักเกินวงเงินที่เจ้าของ/ผู้ถือคีย์ตรึงเอง (selfApprovedById) ⇒ ผู้ไม่มีคีย์ (ผู้จัดการ/ผู้ดูแล) กดปิดได้ — ตีความ 'อนุมัติตอนตรึง' · ไม่ตรงตัวอักษร §2.3 ข้อ 6 'คนอื่น ⇒ ต้องมีคำขอ APPROVED'", { mgrNoKey: s2?.ok ? "OK" : s2?.code, care: s3?.ok ? "OK" : s3?.code, audits: selfAud });
    const k1 = await settle(cMgrK, X.X07, fo.mo, at);
    const k2 = await settle(cMgrK, X.X10, fc.mo, at);
    const au = await prisma.auditLog.count({ where: { tenantId: A, action: "dorm.moveout.deduction_self_approved", targetId: { in: [fo.mo, fc.mo] } } });
    rec("AK-3", k1?.ok === true && k2?.ok === true && au >= 1, "MAJOR", "ผู้จัดการที่ถือคีย์จริงปิดเกินวงเงินได้ + audit deduction_self_approved ทุกครั้ง", { k1: k1?.ok ? "OK" : k1?.code, k2: k2?.ok ? "OK" : k2?.code, au });
    const req2 = req ? await prisma.approvalRequest.findFirst({ where: { id: req.id } }) : null;
    rec("AK-4", req2?.status !== "PENDING", "MINOR", "หลังผู้ถือคีย์ปิดเอง คำขออนุมัติของรุ่นนั้นไม่ควรค้าง PENDING ในกล่องเจ้าของ", { req: req2?.status });
    // ถอนคีย์สด
    const f3 = await frozenMo(cCare, X.X11, { damage: 250_000 });
    await prisma.membership.update({ where: { id: MGRK.mid }, data: { permissions: { "dorm.view": true, "dorm.moveout.manage": true } } });
    const k3 = await settle(cMgrK, X.X11, f3.mo, at);
    await prisma.membership.update({ where: { id: MGRK.mid }, data: { permissions: { "dorm.view": true, "dorm.moveout.manage": true, "dorm.deposit.deduct.approve": true } } });
    rec("AK-5", k3?.code === "NEEDS_APPROVAL", "BLOCKER", "ใบรออนุมัติ (ผู้ดูแลตรึง): ถอนคีย์ของผู้จัดการแล้วให้ปิด ⇒ NEEDS_APPROVAL ทันที (ไม่แคชสิทธิ์)", k3?.ok ? "OK!" : k3?.code);
    await settle(cO, X.X11, f3.mo, at);
    await money("AK");
  });

  // ═════════════ SB ปิด ∥ รอบบิล D.8 ของเดือนก่อนวันออกที่ยังไม่ออกบิล ═════════════
  await step("SB ปิด ∥ รอบบิล ธ.ค. (ออก 5 ม.ค.)", async () => {
    const UB = await mkUnit(A, "b", BOOK, Array.from({ length: 12 }, (_, i) => `B${i + 1}`));
    const BL: L[] = [];
    for (let i = 1; i <= 12; i++) BL.push(await mkLease(UB, `B${i}`));
    await runAndPay(cO, UB, "2026-10", NOW_OCT, BL);
    await runAndPay(cO, UB, "2026-11", NOW_NOV, BL);
    const at = BK("2027-01-05", "10:00");
    const fs: { l: L; mo: string; rent: number }[] = [];
    for (const l of BL) {
      const f = await frozenMo(cO, l, { moveOut: "2027-01-05", noticeAt: BK("2026-11-20", "10:00"), damage: 0, at });
      const row = await prisma.dormMoveOut.findFirst({ where: { id: f.mo } });
      const rent = ((row?.deductions as any)?.frozen?.lines ?? []).filter((x: any) => x.code === "RENT").reduce((s: number, x: any) => s + x.amountSatang, 0);
      fs.push({ l, mo: f.mo, rent });
    }
    rec("SB-PC", fs.every((f) => f.rent >= RENT), "PC", "ฐาน: ใบที่ตรึง (5 ม.ค.) มีค่าห้อง ธ.ค. เต็มเดือน + ม.ค. เศษ (ธ.ค. ยังไม่ออกบิล)", fs.map((f) => f.rent));
    const sAt = BK("2027-01-05", "13:00");
    const rs = await procs([
      fs.slice(0, 4).map((f, i) => settleJ(cO, f.l, f.mo, sAt, i * 900)),
      fs.slice(4, 8).map((f, i) => settleJ(cO, f.l, f.mo, sAt, 300 + i * 900)),
      fs.slice(8, 12).map((f, i) => settleJ(cO, f.l, f.mo, sAt, 600 + i * 900)),
      [{ m: "x", op: "__prepSend", args: [cO, { unitId: UB.u, periodKey: "2026-12", now: BK("2027-01-05", "09:00").toISOString() }], delayMs: 0 }],
      [{ m: "x", op: "__prepSend", args: [cO, { unitId: UB.u, periodKey: "2026-12", now: BK("2027-01-05", "09:00").toISOString() }], delayMs: 1100 }],
      [{ m: "x", op: "__prepSend", args: [cO, { unitId: UB.u, periodKey: "2026-12", now: BK("2027-01-05", "09:00").toISOString() }], delayMs: 2300 }],
    ]);
    const midDouble: string[] = [];
    for (const f of fs) {
      const dec = await billOf(f.l.leaseId, "2026-12");
      if ((await liveSettleJvs(f.mo)).length && dec) midDouble.push(`${f.l.roomId.slice(-4)}:${dec.status}`);
    }
    // ทำให้จบ: รอบ ธ.ค. ส่ง · ใบที่ยังไม่ปิด ⇒ เปิดใหม่/ส่ง/ปิด
    await runAll(cO, UB.u, "2026-12", BK("2027-01-05", "09:00"));
    const fins: string[] = [];
    for (const f of fs) if (!CLOSED.includes(await statusOf(f.mo))) fins.push((await finish(cO, f.l, f.mo, sAt)).log.join(">"));
    const dbl: any[] = [];
    for (const f of fs) {
      const dec = await billOf(f.l.leaseId, "2026-12");
      const row = await prisma.dormMoveOut.findFirst({ where: { id: f.mo } });
      const s = (row?.deductions as any)?.settle;
      const fzRent = ((row?.deductions as any)?.frozen?.lines ?? []).filter((x: any) => x.code === "RENT").reduce((a: number, x: any) => a + x.amountSatang, 0);
      const decLive = dec && dec.accountDocumentId ? (await cnOf(dec.accountDocumentId)) < dec.totalSatang : !!dec;
      if (s && decLive && fzRent >= RENT) dbl.push({ room: f.l.roomId.slice(-4), dec: dec.status, decTotal: dec.totalSatang, fzRent });
    }
    const decN = await prisma.dormBill.count({ where: { unitId: UB.u, periodKey: "2026-12", status: { not: "VOID" } } });
    rec("SB-COV", true, "NOTE", "ความครอบคลุม: กี่สัญญาที่รอบ ธ.ค. ได้บิลก่อนปิด (BILL_PENDING/STALE ⇒ แข่งจริง)", { decBills: decN, codes: tally(rs) });
    rec("SB-1", !dbl.length && !midDouble.length, "BLOCKER", "ปิด (หักค่าห้อง ธ.ค. จากประกัน) ∥ เตรียม/ส่งรอบ ธ.ค. ในโพรเซสอื่น ⇒ ค่าห้อง ธ.ค. ถูกเก็บครั้งเดียว (ไม่มีบิล ธ.ค. ที่มีผลคู่กับใบวันออกที่หัก ธ.ค. แล้ว)",
      { double: dbl, midDouble, tally: tally(rs), fins: fins.slice(0, 4) });
    rec("SB-2", !badOf(rs, ["STALE", "BILL_PENDING", "RUN_BUSY", "BUSY"]).length, "MAJOR", "ปิด ∥ รอบบิล: ไม่มี throw/P20xx/UNAVAILABLE", badOf(rs, ["STALE", "BILL_PENDING", "RUN_BUSY", "BUSY"]).slice(0, 3));
    await money("SB");
  });

  // ═════════════ TB ย้ายห้อง ∥ รอบบิลเดือนที่มีผล ═════════════
  await step("TB ย้ายห้อง ∥ รอบบิล ธ.ค.", async () => {
    const rooms = [...Array.from({ length: 8 }, (_, i) => `T${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `TN${i + 1}`)];
    const UT = await mkUnit(A, "t", BOOK, rooms);
    const TL: L[] = [];
    for (let i = 1; i <= 8; i++) TL.push(await mkLease(UT, `T${i}`));
    await runAndPay(cO, UT, "2026-10", NOW_OCT, TL);
    await runAndPay(cO, UT, "2026-11", NOW_NOV, TL);
    const held0 = (await dorm.listLeases(cO, { unitId: UT.u }))?.heldTotalSatang;
    const now = BK("2026-11-25", "10:00");
    const pre1 = await dorm.transferRoom(cO, { unitId: UT.u, leaseId: TL[0].leaseId, toRoomId: UT.rooms.TN1, effectiveDate: "2026-12-01" }, { now });
    if (!pre1?.ok) throw new Error(`fixture ย้าย T1: ${J(pre1).slice(0, 200)}`);
    const trJ = (l: L, to: string, delayMs: number): Call => ({ m: "dorm", op: "transferRoom", args: [cO, { unitId: UT.u, leaseId: l.leaseId, toRoomId: UT.rooms[to], effectiveDate: "2026-12-01" }, { now: D(now) }], delayMs });
    const rs = await procs([
      TL.slice(1, 4).flatMap((l, i) => [trJ(l, `TN${i + 2}`, i * 500), trJ(l, `TN${i + 2}`, 20 + i * 500)]),
      TL.slice(4).flatMap((l, i) => [trJ(l, `TN${i + 5}`, 250 + i * 500), trJ(l, `TN${i + 5}`, 280 + i * 500)]),
      [{ m: "x", op: "__prepSend", args: [cO, { unitId: UT.u, periodKey: "2026-12", now: now.toISOString() }], delayMs: 400 }],
      [{ m: "x", op: "__prepSend", args: [cO, { unitId: UT.u, periodKey: "2026-12", now: now.toISOString() }], delayMs: 1300 }],
    ]);
    await runAll(cO, UT.u, "2026-12", now);
    const per: any[] = [];
    let wrong = 0, kidsN = 0;
    for (const l of TL) {
      const kids = await prisma.dormLease.findMany({ where: { previousLeaseId: l.leaseId, status: { not: "CANCELLED" } }, select: { id: true } });
      kidsN += kids.length;
      const ids = [l.leaseId, ...kids.map((k: any) => k.id)];
      const dec = await prisma.dormBill.findMany({ where: { leaseId: { in: ids }, periodKey: "2026-12", status: { not: "VOID" } }, select: { leaseId: true, status: true } });
      const heldRoot = await ACC.securityDepositHeld({ tenantId: A, unitId: UT.u, leaseId: l.leaseId });
      const heldKid = kids[0] ? await ACC.securityDepositHeld({ tenantId: A, unitId: UT.u, leaseId: kids[0].id }) : 0;
      const g = kids[0] ? await dorm.getLease(cO, { unitId: UT.u, leaseId: kids[0].id }) : null;
      const okRow = kids.length <= 1 && dec.length === 1 && (kids.length ? dec[0].leaseId === kids[0].id : dec[0].leaseId === l.leaseId) && heldRoot === DEP && heldKid === 0 && (!g || g.heldSatang === DEP);
      if (!okRow) wrong++;
      per.push({ kids: kids.length, dec: dec.map((d: any) => (d.leaseId === l.leaseId ? "old" : "new") + ":" + d.status), heldRoot, heldKid, gHeld: g?.heldSatang ?? null });
    }
    const held1 = (await dorm.listLeases(cO, { unitId: UT.u }))?.heldTotalSatang;
    rec("TB-1", wrong === 0, "BLOCKER", "ย้ายห้อง ×14 (7 สัญญา × 2 · T1 ย้ายก่อน) ∥ เตรียม/ส่งรอบ ธ.ค. ×2 ⇒ ค่าห้อง ธ.ค. ของแต่ละสาย 1 ใบพอดี (สัญญาใหม่ถ้าย้ายสำเร็จ) · สัญญาใหม่ ≤ 1 · ประกันอยู่ต้นสาย ไม่ซ้อน", { per, tally: tally(rs) });
    rec("TB-2", held0 === held1 && held0 === 8 * DEP && kidsN >= 1, "BLOCKER", "ยอดประกันถือทั้งหน่วย (listLeases) เท่าเดิม = 8 × 9,000 หลังย้ายห้อง (นับครั้งเดียวต่อสาย)", { held0, held1, kidsN });
    rec("TB-3", !badOf(rs, ["BILL_PENDING", "ALREADY_BILLED", "RUN_BUSY", "BUSY"]).length, "MAJOR", "ย้ายห้อง ∥ รอบบิล: ไม่มี throw/P20xx/UNAVAILABLE", badOf(rs, ["BILL_PENDING", "ALREADY_BILLED", "RUN_BUSY", "BUSY"]).slice(0, 3));
    // TS: สาย T1 (ย้ายแล้ว) แจ้งย้ายออก/ตรึง/ปิด ∥ ย้ายห้องซ้ำ (สัญญาเดิม/ใหม่)
    const kid1 = (await prisma.dormLease.findFirst({ where: { previousLeaseId: TL[0].leaseId } }))?.id;
    if (kid1) {
      const K: L = { ...TL[0], leaseId: kid1, roomId: UT.rooms.TN1 };
      const decK = await billOf(kid1, "2026-12");
      if (decK?.accountDocumentId) await payDoc(UT.u, decK.accountDocumentId, decK.totalSatang, "2026-12-03");
      const f = await frozenMo(cO, K, { moveOut: "2026-12-31", noticeAt: BK("2026-11-26", "10:00"), damage: 35_000, at: BK("2026-12-31", "10:00") });
      const sAt = BK("2026-12-31", "13:00");
      const rs2 = await procs([
        [settleJ(cO, K, f.mo, sAt), settleJ(cO, K, f.mo, sAt, 80)],
        [{ m: "dorm", op: "transferRoom", args: [cO, { unitId: UT.u, leaseId: kid1, toRoomId: UT.rooms.T1, effectiveDate: "2027-01-01" }, { now: D(sAt) }] },
          { m: "dorm", op: "transferRoom", args: [cO, { unitId: UT.u, leaseId: TL[0].leaseId, toRoomId: UT.rooms.T1, effectiveDate: "2027-01-01" }, { now: D(sAt) }], delayMs: 40 }],
        [{ m: "dorm", op: "renewLease", args: [cO, { unitId: UT.u, leaseId: kid1, months: 12 }, { now: D(sAt) }], delayMs: 20 }, settleJ(cO, K, f.mo, sAt, 150)],
      ]);
      const jv = await liveSettleJvs(f.mo);
      const extra = await prisma.dormLease.count({ where: { previousLeaseId: { in: [kid1] }, status: { not: "CANCELLED" } } });
      const row = await prisma.dormMoveOut.findFirst({ where: { id: f.mo } });
      const heldR = await ACC.securityDepositHeld({ tenantId: A, unitId: UT.u, leaseId: TL[0].leaseId });
      const s = (row?.deductions as any)?.settle;
      rec("TS-1", jv.length === 1 && extra === 0 && heldR === 0 && s?.heldSatang === DEP, "BLOCKER", "ปิดสัญญาที่ย้ายห้องมา (ประกันที่ต้นสาย) ∥ ย้ายห้อง/ต่อสัญญาซ้ำ: JV 1 ใช้ประกันต้นสาย 9,000 · ไม่มีสัญญาใหม่งอก · ต้นสายเหลือ 0",
        { jv: jv.length, extra, heldR, settleHeld: s?.heldSatang, tally: tally(rs2) });
    } else rec("TS-1", false, "PROBE-ERR", "ไม่มีสัญญาใหม่ของ T1 ให้ทดสอบ (ย้ายห้องไม่สำเร็จเลย)", per[0]);
    await money("TB");
  });

  // ═════════════ RN ต่อสัญญา ×N · ต่อ ∥ แจ้ง · แจ้ง ∥ ย้าย · ต่อ ∥ ย้าย ═════════════
  await step("RN ต่อสัญญา/แจ้ง/ย้าย", async () => {
    const UR = await mkUnit(A, "r", BOOK, ["R1", "R2", "R3", "R4", "R5", "RT3", "RT4"]);
    const R: Record<string, L> = {};
    for (const no of ["R1", "R2", "R3", "R4", "R5"]) R[no] = await mkLease(UR, no, { end: "2026-12-31" });
    const now = BK("2026-11-01", "10:00");
    const rnJ = (l: L, delayMs = 0, months = 12): Call => ({ m: "dorm", op: "renewLease", args: [cO, { unitId: UR.u, leaseId: l.leaseId, months }, { now: D(now) }], delayMs });
    const ntJ = (l: L, d: string, delayMs = 0): Call => ({ m: "dorm", op: "giveMoveOutNotice", args: [cO, { unitId: UR.u, leaseId: l.leaseId, moveOutDate: d }, { now: D(now) }], delayMs });
    const trJ = (l: L, to: string, delayMs = 0): Call => ({ m: "dorm", op: "transferRoom", args: [cO, { unitId: UR.u, leaseId: l.leaseId, toRoomId: UR.rooms[to], effectiveDate: "2026-12-01" }, { now: D(now) }], delayMs });
    const rs = await procs([
      [...Array.from({ length: 3 }, (_, i) => rnJ(R.R1, i * 20)), rnJ(R.R2), ntJ(R.R3, "2026-12-15"), trJ(R.R4, "RT4")],
      [...Array.from({ length: 3 }, (_, i) => rnJ(R.R1, i * 25)), ntJ(R.R2, "2026-12-15", 5), trJ(R.R3, "RT3", 5), rnJ(R.R4, 5)],
      [...Array.from({ length: 3 }, (_, i) => rnJ(R.R1, i * 30, 6)), rnJ(R.R2, 30), ntJ(R.R3, "2026-12-15", 30), trJ(R.R4, "RT4", 30)],
      [...Array.from({ length: 20 }, (_, i) => rnJ(R.R1, i * 5)), ntJ(R.R2, "2026-12-15", 50), trJ(R.R3, "RT3", 50), rnJ(R.R4, 50)],
    ]);
    const kids = async (l: L) => prisma.dormLease.findMany({ where: { previousLeaseId: l.leaseId, status: { not: "CANCELLED" } }, select: { id: true, roomId: true, startDate: true, endDate: true } });
    const moLive = async (l: L) => prisma.dormMoveOut.count({ where: { leaseId: l.leaseId, status: { not: "CANCELLED" } } });
    const k1 = await kids(R.R1);
    const r1 = rs.filter((x) => x.op === "renewLease" && x?.r?.leaseId && x.r.leaseId === k1[0]?.id);
    const ends = new Set(rs.filter((x) => x.op === "renewLease" && x?.r?.ok && x.r.leaseId === k1[0]?.id).map((x) => x.r.endDate));
    rec("RN-1", k1.length === 1 && r1.filter((x) => x.r.duplicate === false).length === 1, "BLOCKER", "ต่อสัญญา R1 พร้อมกัน 29 ทาง (4 โพรเซส · 20 ในโพรเซสเดียว · ระยะ 12/6 เดือนปนกัน) ⇒ สัญญาใหม่ 1 · duplicate:false 1", { kids: k1.length, first: r1.filter((x) => x.r.duplicate === false).length, ends: [...ends], tally: tally(rs.filter((x) => x.op === "renewLease")) });
    const occ = await prisma.roomOccupancy.findMany({ where: { tenantId: A, unitId: UR.u, roomId: UR.rooms.R1, active: true }, select: { startDate: true, endDate: true } });
    const overlap = occ.some((a: any, i: number) => occ.some((b: any, j: number) => i !== j && a.startDate < b.endDate && b.startDate < a.endDate));
    rec("RN-2", !overlap && occ.length === 2, "BLOCKER", "ห้อง R1 หลังต่อสัญญาพร้อมกัน: occupancy 2 แถว (เดิม + ใหม่) ไม่ซ้อน", { occ: occ.map((o: any) => [ymdOf(o.startDate), ymdOf(o.endDate)]) });
    const k2 = await kids(R.R2), m2 = await moLive(R.R2);
    rec("RN-3", !(k2.length > 0 && m2 > 0) && k2.length + m2 === 1, "BLOCKER", "ต่อสัญญา ∥ แจ้งย้ายออก (R2) ⇒ ได้อย่างใดอย่างหนึ่ง ไม่ได้ทั้งคู่", { renew: k2.length, notice: m2 });
    const k3 = await kids(R.R3), m3 = await moLive(R.R3);
    rec("RN-4", !(k3.length > 0 && m3 > 0) && k3.length + m3 === 1, "BLOCKER", "แจ้งย้ายออก ∥ ย้ายห้อง (R3) ⇒ ได้อย่างใดอย่างหนึ่ง (ไม่มีใบย้ายออกบนสัญญาที่ย้ายห้องไปแล้ว — ปิดประกันขณะผู้เช่ายังอยู่ห้องใหม่)", { transfer: k3.length, notice: m3 });
    const k4 = await kids(R.R4);
    rec("RN-5", k4.length === 1, "BLOCKER", "ต่อสัญญา ∥ ย้ายห้อง (R4) ⇒ สัญญาลูก 1 (ไม่มี 2 สัญญาใช้ประกันต้นสายเดียวกัน)", { kids: k4.map((k: any) => [k.roomId === UR.rooms.R4 ? "renew" : "transfer", ymdOf(k.startDate)]) });
    rec("RN-6", !badOf(rs, ["HAS_RENEWAL", "NOT_EDITABLE", "ROOM_TAKEN"]).length, "MAJOR", "ต่อ/แจ้ง/ย้าย พร้อมกัน: ไม่มี throw/P20xx/UNAVAILABLE/BUSY", { bad: badOf(rs, ["HAS_RENEWAL", "NOT_EDITABLE", "ROOM_TAKEN"]).slice(0, 3), tally: tally(rs.filter((x) => x.op !== "renewLease")) });
    const heldAll = (await dorm.listLeases(cO, { unitId: UR.u }))?.heldTotalSatang;
    rec("RN-7", heldAll === 5 * DEP, "BLOCKER", "ยอดประกันถือทั้งหน่วยหลังต่อ/ย้าย = 5 × 9,000 (ไม่นับซ้ำสัญญาลูก)", { heldAll });
    // NC: แจ้ง ×N ∥ ยกเลิก ×N (R5)
    const n0 = await notice(cO, R.R5, "2026-12-20", now);
    const cJ = (delayMs: number): Call => ({ m: "dorm", op: "cancelMoveOut", args: [cO, { unitId: UR.u, moveOutId: n0.moveOutId, reason: "ผู้เช่าเปลี่ยนใจอยู่ต่อ" }, { now: D(now) }], delayMs });
    const rs2 = await procs([
      [cJ(0), ntJ(R.R5, "2026-12-20", 30), ntJ(R.R5, "2026-12-10", 60)],
      [ntJ(R.R5, "2026-12-20", 0), cJ(40), ntJ(R.R5, "2026-12-20", 120)],
      [ntJ(R.R5, "2026-12-10", 10), cJ(80), cJ(160)],
      [ntJ(R.R5, "2026-12-20", 20), ntJ(R.R5, "2026-12-10", 100), cJ(200)],
    ]);
    const mo = await moRow(R.R5);
    const lz = await prisma.dormLease.findFirst({ where: { id: R.R5.leaseId } });
    const oc = await prisma.roomOccupancy.findFirst({ where: { id: R.R5.occupancyId } });
    const insp = mo?.inspection as any;
    const live = mo && mo.status !== "CANCELLED";
    const okC = live
      ? lz?.status === "NOTICE" && ymdOf(lz?.endDate) === ymdOf(mo.moveOutDate) && ymdOf(oc?.endDate) === addDays(ymdOf(mo.moveOutDate), 1) && insp?.originalEndDate === "2026-12-31"
      : lz?.status === "ACTIVE" && ymdOf(lz?.endDate) === "2026-12-31" && ymdOf(oc?.endDate) === "2027-01-01";
    const rows = await prisma.dormMoveOut.count({ where: { leaseId: R.R5.leaseId } });
    rec("NC-1", okC && rows === 1 && !badOf(rs2, ["ALREADY_NOTICED", "NOT_EDITABLE"]).length, "BLOCKER", "แจ้ง ×8 (2 วัน) ∥ ยกเลิก ×5 ⇒ แถวเดียว · สถานะสัญญา/วันจบ/occupancy ตรงกับใบเสมอ · วันจบเดิมไม่ถูกทับด้วยวันออก",
      { mo: mo && [mo.status, ymdOf(mo.moveOutDate)], lease: lz && [lz.status, ymdOf(lz.endDate)], oc: ymdOf(oc?.endDate), orig: insp?.originalEndDate, rows, tally: tally(rs2) });
    await money("RN");
  });

  // ═════════════ JB งานตามเวลา: ซ้อนข้ามเที่ยงคืนไทย (วันที่ 7 ∥ วันที่ 8) · งาน ∥ ปิด ═════════════
  await step("JB งานตามเวลา", async () => {
    const n24 = await notice(cO, X.X24, "2026-10-31", BK("2026-09-30", "10:00"));
    const mo24 = n24.moveOutId as string;
    const d7 = new Date("2026-11-07T23:59:59.999+07:00"), d8 = new Date("2026-11-08T00:00:00.000+07:00");
    const jJ = (now: Date, delayMs = 0): Call => ({ m: "x", op: "__jobs", args: [{ now: now.toISOString(), tenantId: A }], delayMs });
    const rs = await procs([[jJ(d7)], [jJ(d8)], [jJ(d7, 5)], [jJ(d8, 5)]]);
    const k7 = await prisma.outboxEvent.findMany({ where: { tenantId: A, idempotencyKey: `dorm.deposit.refund_due:${mo24}:2026-11-07` } });
    const k8 = await prisma.outboxEvent.findMany({ where: { tenantId: A, idempotencyKey: `dorm.deposit.refund_due:${mo24}:2026-11-08` } });
    const od = await prisma.auditLog.findMany({ where: { tenantId: A, action: "dorm.deposit.refund_overdue", targetId: mo24 } });
    const odAt = od[0] ? new Date((od[0].after as any)?.at ?? 0).getTime() : 0;
    rec("JB-1", k7.length === 1 && k8.length === 1 && (k7[0].payload as any)?.daysLeft === 0 && (k8[0].payload as any)?.daysLeft === -1, "BLOCKER", "งาน 4 โพรเซส 23:59:59.999 (วัน 7) ∥ 00:00:00.000 (วัน 8): เตือน 1 ครั้งต่อวันไทย · daysLeft 0 / −1", { k7: k7.length, k8: k8.length, p7: k7[0]?.payload, p8: k8[0]?.payload });
    rec("JB-2", od.length === 1 && odAt >= new Date("2026-11-07T17:00:00.000Z").getTime(), "BLOCKER", "เลยกำหนด: audit refund_overdue 1 ครั้ง และมาจากงานวันที่ 8 เท่านั้น (งานวันที่ 7 23:59 ไม่นับเลย)", { n: od.length, at: od.map((x: any) => (x.after as any)?.at) });
    rec("JB-3", !rs.some((x) => x?.threw || x?.childFail), "MAJOR", "งานซ้อน: ไม่มี throw", rs.map((x) => x?.threw ?? x?.childFail ?? J(x?.r)));
    // งาน ∥ ปิด (X25) — ไม่มีเตือนที่เกิดหลัง JV ปิดในวันเดียวกัน
    const f = await frozenMo(cO, X.X25);
    const t = BK("2026-11-02", "09:00");
    const rs2 = await procs([[jJ(t)], [jJ(t, 30)], [jJ(t, 80)], [settleJ(cO, X.X25, f.mo, t, 10), settleJ(cO, X.X25, f.mo, t, 40)]]);
    const jv = await liveSettleJvs(f.mo);
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: A, idempotencyKey: `dorm.deposit.refund_due:${f.mo}:2026-11-02` }, select: { createdAt: true } });
    const late = jv.length ? ev.filter((e: any) => e.createdAt > jv[0].createdAt) : [];
    rec("JB-4", jv.length === 1 && ev.length <= 1 && !late.length, "BLOCKER", "งาน ×3 ∥ ปิด ×2 วันเดียวกัน: เตือน ≤ 1 · ไม่มีเตือนที่เกิดหลัง JV ปิด", { jv: jv.length, ev: ev.length, late: late.length, tally: tally(rs2) });
    await money("JB");
  });

  // ═════════════ DL บังคับ 40P01 ระหว่างปิด ⇒ ลองใหม่ 1 ครั้ง ⇒ BUSY ═════════════
  await step("DL บังคับ 40P01", async () => {
    const f = await frozenMo(cO, X.X12);
    const statDl = async () => Number(((await prisma.$queryRawUnsafe(`SELECT deadlocks::bigint AS d FROM pg_stat_database WHERE datname = current_database()`)) as any[])[0].d);
    const dl0 = await statDl();
    // ผู้โจมตี: tx เดียวถือแถว Tenant ตลอด · รอจนแบ็กเอนด์ของการปิดถูกบล็อกหลังเรา แล้วจึงขอ advisory สัญญา (session) ⇒ ฝั่งปิดรอก่อน = ฝั่งปิดเป็นเหยื่อ 40P01
    //   ได้ล็อกแล้วปล่อยทันที (pg_advisory_unlock) แต่ยังถือแถว Tenant ⇒ การลองใหม่ของฝั่งปิดชนซ้ำ ⇒ คาด BUSY
    const atk = new pg.Client({ connectionString: process.env.DIRECT_URL }), mon = new pg.Client({ connectionString: process.env.DIRECT_URL });
    await atk.connect(); await mon.connect();
    const atkPid = Number((await atk.query("SELECT pg_backend_pid() AS p")).rows[0].p);
    await atk.query("BEGIN");
    await atk.query(`UPDATE "Tenant" SET "updatedAt" = now() WHERE id = $1`, [A]);
    let stop = false, attacks = 0, atkDl = 0, atkOther = "";
    const attacker = (async () => {
      while (!stop) {
        try {
          const b = await mon.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))`, [atkPid]);
          if (b.rows[0].n > 0) {
            await sleep(150);
            await atk.query(`SELECT pg_advisory_lock(hashtextextended($1, 0))`, [`dorm.lease:${X.X12.leaseId}`]);
            await atk.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [`dorm.lease:${X.X12.leaseId}`]);
            attacks++;
          }
        } catch (e) { if (/deadlock/i.test(errMsg(e))) atkDl++; else atkOther = errMsg(e); try { await atk.query("ROLLBACK"); await atk.query("BEGIN"); await atk.query(`UPDATE "Tenant" SET "updatedAt" = now() WHERE id = $1`, [A]); } catch { /* */ } }
        await sleep(25);
      }
    })();
    const r = await procs([[settleJ(cO, X.X12, f.mo, BK("2026-10-31", "13:00"))]], 9_000);
    stop = true; await attacker;
    await atk.query("ROLLBACK").catch(() => null);
    await atk.end().catch(() => null); await mon.end().catch(() => null);
    const dl1 = await statDl();
    const mid = { st: await statusOf(f.mo), jv: (await liveSettleJvs(f.mo)).length };
    const half = !((mid.jv === 0 && !CLOSED.includes(mid.st)) || (mid.jv === 1 && CLOSED.includes(mid.st)));
    const again = await settle(cO, X.X12, f.mo, BK("2026-10-31", "13:00"));
    rec("DL-PC", dl1 - dl0 >= 1, "PC", "positive control: เกิด deadlock จริง (pg_stat_database.deadlocks เพิ่ม)", { forced: dl1 - dl0, attacks, atkDl, atkOther });
    const code = codeOf(r[0]);
    rec("DL-1", ["BUSY", "OK"].includes(code) && !r[0]?.threw && !half && again?.ok === true && (await liveSettleJvs(f.mo)).length === 1, "BLOCKER",
      "บังคับ 40P01 ระหว่างปิด (ล็อกแถว Tenant แล้วขอ advisory สัญญา) ⇒ ไม่ throw/UNAVAILABLE · ผล BUSY (หรือ OK ถ้าผู้โจมตีถูกเลือกเป็นเหยื่อ) · ไม่มีครึ่งสถานะ · ปิดซ้ำได้ JV 1",
      { code, reason: r[0]?.r?.reason, ms: r[0]?.ms, deadlocks: dl1 - dl0, mid, again: again?.ok ? "OK" : again?.code });
    rec("DL-2", code === "BUSY" ? dl1 - dl0 - atkDl >= 2 : true, "MINOR", "ผล BUSY ต้องมาจากการชน 2 ครั้ง (ลองใหม่ 1 ครั้งจริง) — นับ deadlock ที่ฝั่งปิดเป็นเหยื่อ", { code, victimSettle: dl1 - dl0 - atkDl });
    await money("DL");
  });

  // ═════════════ KL SIGKILL กลางการปิด / ส่ง / เปิดใหม่ ═════════════
  await step("KL SIGKILL", async () => {
    const delays = [15, 45, 90, 150, 250, 400, 650, 1000];
    const ks = ["X13", "X14", "X15", "X16", "X17", "X18", "X19", "X20"];
    const out: string[] = [];
    let bad = 0;
    for (let i = 0; i < ks.length; i++) {
      const l = X[ks[i]];
      const f = await frozenMo(cO, l);
      const at = BK("2026-10-31", "14:00");
      const kd = await killDuring(settleJ(cO, l, f.mo, at), delays[i]);
      const jv0 = (await liveSettleJvs(f.mo)).length, st0 = await statusOf(f.mo);
      const dap0 = (await paidOf(f.send.invoiceDocId)).filter((p: any) => p.channel === "DEPOSIT_APPLY").length;
      const half = !((jv0 === 0 && !CLOSED.includes(st0) && dap0 === 0) || (jv0 === 1 && CLOSED.includes(st0) && dap0 === 1));
      const r = await settle(cO, l, f.mo, at);
      const jv1 = (await liveSettleJvs(f.mo)).length, st1 = await statusOf(f.mo);
      const hk = (await prisma.hotelRoom.findFirst({ where: { id: l.roomId }, select: { hkStatus: true } }))?.hkStatus;
      const ev = await prisma.outboxEvent.count({ where: { tenantId: A, idempotencyKey: `dorm.moveout.settled:${f.mo}` } });
      if (half || r?.ok !== true || jv1 !== 1 || !CLOSED.includes(st1) || hk !== "DIRTY" || ev !== 1) bad++;
      out.push(`${ks[i]}@${delays[i]} killed=${kd.killed} [jv${jv0},${st0},dap${dap0}] → [${r?.ok ? (r.duplicate ? "dup" : "OK") : r?.code},jv${jv1},${st1},${hk},ev${ev}]`);
    }
    rec("KL-1", bad === 0, "BLOCKER", "SIGKILL กลางการปิด 8 จังหวะ (15–1000ms): มี JV ⇔ สถานะปิด ⇔ แถว DEPOSIT_APPLY · ปิดซ้ำ ok · JV 1 · event 1 · ห้อง DIRTY", out);
    // ส่ง (ตรึง) ถูกฆ่า
    const out2: string[] = [];
    let bad2 = 0;
    for (const [k, ms] of [["X21", 120], ["X22", 400], ["X23", 900]] as const) {
      const l = X[k];
      const f = await frozenMo(cO, l, { send: false });
      const at = BK("2026-10-31", "11:00");
      const kd = await killDuring(sendJ(cO, l, f.mo, at), ms);
      const s = await sendSum(cO, l, f.mo, at);
      const s2 = s?.ok ? s : await sendSum(cO, l, f.mo, at);
      const docs = await moDocs(f.mo);
      const live: string[] = [];
      for (const d of docs) if ((await cnOf(d.id)) < d.grandTotal) live.push(d.refId);
      const st = await settle(cO, l, f.mo, BK("2026-10-31", "14:00"));
      if (!s2?.ok || live.length !== 1 || st?.ok !== true) bad2++;
      out2.push(`${k}@${ms} killed=${kd.killed} send=${s?.ok ? "OK" : s?.code}/${s2?.ok ? "OK" : s2?.code} invoices=${docs.length} live=${live.length} settle=${st?.ok ? "OK" : st?.code}`);
    }
    rec("KL-2", bad2 === 0, "BLOCKER", "SIGKILL กลางการส่งใบสรุป: ส่งซ้ำได้ · ใบวันออกที่มีผล 1 ใบ · ปิดได้", out2);
    // เปิดใหม่ถูกฆ่า (ใบลดหนี้ออกแล้วแต่ยังไม่ขึ้นรุ่น)
    const out3: string[] = [];
    let bad3 = 0;
    for (const [k, ms] of [["X26", 150], ["X27", 450], ["X28", 900]] as const) {
      const l = X[k];
      const f = await frozenMo(cO, l);
      const at = BK("2026-10-31", "12:00");
      const kd = await killDuring(reopenJ(cO, l, f.mo, at), ms);
      const cn0 = await cnOf(f.send.invoiceDocId);
      const fz0 = !!((await prisma.dormMoveOut.findFirst({ where: { id: f.mo } }))?.deductions as any)?.frozen;
      const stMid = await settle(cO, l, f.mo, BK("2026-10-31", "14:00"));
      const midBad = stMid?.ok === true && cn0 > 0; // ปิดด้วยใบที่ถูกลดหนี้แล้ว
      const fin = await finish(cO, l, f.mo, BK("2026-10-31", "14:00"));
      const cn1 = await cnOf(f.send.invoiceDocId);
      const v1paid = (await paidOf(f.send.invoiceDocId)).reduce((s: number, p: any) => s + p.amount, 0);
      if (midBad || !CLOSED.includes(await statusOf(f.mo)) || cn1 + v1paid > 35_000) bad3++;
      out3.push(`${k}@${ms} killed=${kd.killed} [cn${cn0},frozen=${fz0}] midSettle=${stMid?.ok ? "OK" : stMid?.code} fin=${fin.log.join(">")} v1[cn${cn1},paid${v1paid}]`);
    }
    rec("KL-3", bad3 === 0, "BLOCKER", "SIGKILL กลางการเปิดใบสรุปใหม่: ใบรุ่นเดิมที่ถูกลดหนี้แล้วต้องไม่ถูกหักด้วยประกัน · ทำต่อจนปิดได้ · ใบรุ่น 1 ลดหนี้+ชำระ ≤ ยอด", out3);
    await money("KL");
  });

  // ═════════════ TK ย้ายห้องตายกลางทาง (ค่าน้ำไฟห้องเดิม · ใบ DormTransfer นอก tx) ═════════════
  await step("TK ย้ายห้อง SIGKILL", async () => {
    const UM = await mkUnit(A, "m", BOOK, [...Array.from({ length: 9 }, (_, i) => `M${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `MN${i + 1}`)], { metered: true });
    const ML: L[] = [];
    const MTR: Record<string, { E: string; W: string }> = {};
    for (const no of Object.keys(UM.rooms)) {
      const e = await prisma.dormMeter.create({ data: { tenantId: A, unitId: UM.u, roomId: UM.rooms[no], kind: "ELEC", role: "ROOM", startReading: 1000, digits: 5 } });
      const w = await prisma.dormMeter.create({ data: { tenantId: A, unitId: UM.u, roomId: UM.rooms[no], kind: "WATER", role: "ROOM", startReading: 300, digits: 4 } });
      MTR[no] = { E: e.id, W: w.id };
    }
    for (let i = 1; i <= 9; i++) {
      const l = await mkLease(UM, `M${i}`, { start: "2026-11-01" });
      for (const [k, v] of [["E", 1000], ["W", 300]] as const) await prisma.dormMeterReading.create({ data: { tenantId: A, unitId: UM.u, meterId: MTR[`M${i}`][k], leaseId: l.leaseId, periodKey: "2026-11", kind: "MOVE_IN", value: v, readAt: BK("2026-11-01", "09:00") } });
      ML.push(l);
    }
    const now = BK("2026-11-26", "10:00");
    const trIn = (i: number) => ({ unitId: UM.u, leaseId: ML[i].leaseId, toRoomId: UM.rooms[`MN${i + 1}`], effectiveDate: "2026-12-01", meterReadings: [{ meterId: MTR[`M${i + 1}`].E, value: 1100 }, { meterId: MTR[`M${i + 1}`].W, value: 310 }, { meterId: MTR[`MN${i + 1}`].E, value: 1000 }, { meterId: MTR[`MN${i + 1}`].W, value: 300 }] });
    const invOf = async (leaseId: string) => prisma.accountDocument.findMany({ where: { tenantId: A, refType: "DormTransfer", refId: leaseId } });
    const pc = await dorm.transferRoom(cO, trIn(0), { now });
    const pcInv = await invOf(ML[0].leaseId);
    rec("TK-PC", pc?.ok === true && pcInv.length === 1 && pcInv[0].grandTotal > 0, "PC", "positive control: ย้ายห้องปกติ ⇒ ใบค่าน้ำไฟห้องเดิม DormTransfer 1 ใบ (100 หน่วย × 4.72 + 10 × 16)", { pc: pc?.ok ? pc.mode : pc?.code, inv: pcInv.map((d: any) => d.grandTotal) });
    const delays = [150, 300, 450, 600, 800, 1100, 1500, 2200];
    const out: string[] = [];
    let lost = 0;
    for (let i = 1; i < 9; i++) {
      const kd = await killDuring({ m: "dorm", op: "transferRoom", args: [cO, trIn(i), { now: D(now) }] }, delays[i - 1]);
      const kid = await prisma.dormLease.findFirst({ where: { previousLeaseId: ML[i].leaseId } });
      const inv0 = (await invOf(ML[i].leaseId)).length;
      const again = await dorm.transferRoom(cO, trIn(i), { now });
      const inv1 = (await invOf(ML[i].leaseId)).length;
      if (kid && inv1 === 0) lost++;
      out.push(`M${i + 1}@${delays[i - 1]} killed=${kd.killed} kid=${!!kid} inv=${inv0}→${inv1} again=${again?.ok ? (again.duplicate ? "dup" : "OK") : again?.code}`);
    }
    rec("TK-1", lost === 0, "MAJOR", "SIGKILL ระหว่างย้ายห้อง (หลัง commit ก่อนออกใบค่าน้ำไฟห้องเดิม) ⇒ เรียกซ้ำ/ทางใดทางหนึ่งต้องออกใบให้ได้ (ไม่มีค่าน้ำไฟห้องเดิมหายถาวร)", { lost, out });
    await money("TK");
  });

  // ═════════════ XS ข้ามร้าน/หน่วย ⇒ NOT_FOUND เหมือนกันทุกกรณี ═════════════
  await step("XS ข้ามร้าน", async () => {
    const UB2 = await mkUnit(B, "bx", BOOK_B, ["701", "702"]);
    const BLs = await mkLease(UB2, "701");
    const bn = await notice(cB, BLs, "2026-10-31", BK("2026-09-30", "10:00"));
    const bmo = bn?.moveOutId ?? "-";
    const bMeter = (await prisma.dormMeter.create({ data: { tenantId: B, unitId: UB2.u, roomId: UB2.rooms["701"], kind: "ELEC", role: "ROOM", startReading: 1, digits: 5 } })).id;
    const fa = await frozenMo(cO, X.X29);                         // ใบของ A ที่ตรึงแล้ว (ยังไม่ปิด)
    const na = await notice(cO, X.X30, "2026-10-31", BK("2026-09-30", "10:00"));  // ใบของ A ยังไม่ตรวจ
    const snap = async () => J(await prisma.dormMoveOut.findMany({ where: { id: { in: [fa.mo, na.moveOutId, bmo] } }, select: { id: true, status: true, deductions: true, inspection: true, updatedAt: true }, orderBy: { id: "asc" } }));
    const s0 = await snap();
    const jv0 = await prisma.accountJournalEntry.count({ where: { tenantId: { in: [A, B] } } });
    const at = { now: BK("2026-10-31", "13:00") };
    const T: [string, any][] = [];
    const spoof = { tenantId: B, actorUserId: OWN.id }, pend = { tenantId: A, actorUserId: PEND.id };
    for (const [lab, ctx, unitId, mo, lease] of [
      ["B→A ids@unitA", cB, UX.u, fa.mo, X.X29.leaseId], ["B→A ids@unitB", cB, UB2.u, fa.mo, X.X29.leaseId], ["A→B ids@unitB", cO, UB2.u, bmo, BLs.leaseId],
      ["A→B ids@unitA", cO, UX.u, bmo, BLs.leaseId], ["spoofTenant", spoof, UX.u, fa.mo, X.X29.leaseId], ["pendingMember", pend, UX.u, fa.mo, X.X29.leaseId],
      ["wrongUnitSameShop", cO, (await prisma.businessUnit.findFirst({ where: { tenantId: A, slug: { startsWith: "pb12r-" } } }))?.id ?? "-", fa.mo, X.X29.leaseId],
    ] as [string, any, string, string, string][]) {
      T.push([`${lab}.settle`, await dorm.settleMoveOut(ctx, { unitId, moveOutId: mo, refund: { channel: "TRANSFER" } }, at)]);
      T.push([`${lab}.send`, await dorm.sendMoveOutSummary(ctx, { unitId, moveOutId: mo }, at)]);
      T.push([`${lab}.reopen`, await dorm.reopenMoveOutSummary(ctx, { unitId, moveOutId: mo, reason: "ทดสอบข้ามร้าน" }, at)]);
      T.push([`${lab}.cancel`, await dorm.cancelMoveOut(ctx, { unitId, moveOutId: mo, reason: "ทดสอบข้ามร้าน" }, at)]);
      T.push([`${lab}.inspect`, await dorm.recordMoveOutInspection(ctx, { unitId, moveOutId: mo, items: [], meterReadings: [] }, at)]);
      T.push([`${lab}.files`, await dorm.addMoveOutFiles(ctx, { unitId, moveOutId: mo, files: [{ data: PNG, contentType: "image/png" }] }, { put: async () => {} })]);
      T.push([`${lab}.notice`, await dorm.giveMoveOutNotice(ctx, { unitId, leaseId: lease, moveOutDate: "2026-12-31" }, at)]);
      T.push([`${lab}.renew`, await dorm.renewLease(ctx, { unitId, leaseId: lease, months: 12 }, at)]);
      T.push([`${lab}.transfer`, await dorm.transferRoom(ctx, { unitId, leaseId: lease, toRoomId: UX.rooms.XS1, effectiveDate: "2026-12-01" }, at)]);
    }
    T.push(["toRoomOfShopB", await dorm.transferRoom(cO, { unitId: UX.u, leaseId: X.X30.leaseId, toRoomId: UB2.rooms["702"], effectiveDate: "2026-12-01" }, at)]);
    T.push(["meterOfShopB", await dorm.recordMoveOutInspection(cO, { unitId: UX.u, moveOutId: na.moveOutId, items: [], meterReadings: [{ meterId: bMeter, value: 5 }] }, at)]);
    const nf = T.filter(([, r]) => !(r?.ok === false && r.code === "NOT_FOUND"));
    const reasons = new Set(T.filter(([, r]) => r?.code === "NOT_FOUND").map(([, r]) => r.reason));
    const reads: [string, any][] = [
      ["B.summary", await dorm.moveOutSummary(cB, { unitId: UX.u, moveOutId: fa.mo }, at)], ["B.model", await dorm.moveOutModel(cB, { unitId: UX.u, moveOutId: fa.mo }, at)],
      ["A.summary(B)", await dorm.moveOutSummary(cO, { unitId: UX.u, moveOutId: bmo }, at)], ["A.model(roomB)", await dorm.moveOutModel(cO, { unitId: UB2.u, roomNumber: "701" }, at)],
      ["spoof.summary", await dorm.moveOutSummary(spoof, { unitId: UX.u, moveOutId: fa.mo }, at)], ["badCtx", await dorm.moveOutSummary(null as any, { unitId: UX.u, moveOutId: fa.mo }, at)],
    ];
    const leak = reads.filter(([, r]) => r !== null);
    const finB = await dorm.settleMoveOut(cO, { unitId: UX.u, moveOutId: fa.mo, refund: { channel: "TRANSFER", financeAccountId: FIN_B } }, at);
    const jvFinB = await liveSettleJvs(fa.mo);
    const s1 = await snap();
    const jv1 = await prisma.accountJournalEntry.count({ where: { tenantId: { in: [A, B] } } });
    rec("XS-1", !nf.length && reasons.size === 1 && [...reasons][0] === NFR, "BLOCKER", `ทุกทางเขียนข้ามร้าน/หน่วย/ปลอม tenantId/สมาชิกยังไม่ตอบรับ/ห้องหรือมิเตอร์ร้านอื่น (${T.length} กรณี) ⇒ NOT_FOUND reason เดียวกันทุกกรณี`,
      { notNF: nf.map(([k, r]) => [k, r?.code ?? (r?.ok ? "OK!" : J(r).slice(0, 60))]).slice(0, 10), reasons: [...reasons].map((x) => String(x).slice(0, 60)) });
    rec("XS-2", !leak.length, "BLOCKER", "อ่านข้ามร้าน ⇒ null ทุกกรณี", leak.map(([k]) => k));
    rec("XS-3", finB?.ok !== true && jvFinB.length === 0, "BLOCKER", "ปิดประกันโดยระบุบัญชีเงินของร้าน B ⇒ ปฏิเสธ ไม่มี JV", { code: finB?.ok ? "OK!" : finB?.code, reason: finB?.reason });
    rec("XS-4", s0 === s1 && jv0 === jv1, "BLOCKER", "หลังยิงข้ามร้านทั้งหมด: ใบย้ายออกทั้งสองร้าน + JV ไม่เปลี่ยน", { same: s0 === s1, jv: [jv0, jv1] });
    await money("XS");
  });

  // ── ฉากร่วม svc-qc ต้องไม่ถูกแตะ ──
  const SVCQC_1 = await svcqcSnap();
  rec("SC-1", J(SVCQC_0) === J(SVCQC_1), "BLOCKER", "ร้าน svc-qc (ฉากร่วม) ไม่ถูกแตะ: ใบย้ายออก · สัญญา · ค่าตั้ง · event หอ เท่าเดิม", { same: J(SVCQC_0) === J(SVCQC_1), a: SVCQC_0 && { mo: SVCQC_0.mo, sv: SVCQC_0.sv, ev: SVCQC_0.ev }, b: SVCQC_1 && { mo: SVCQC_1.mo, sv: SVCQC_1.sv, ev: SVCQC_1.ev } });
} catch (e) {
  console.log(`💥 CRASH: ${e instanceof Error ? e.stack : String(e)}`);
  exitCode = 2;
} finally {
  await cleanup(tenantIds);
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d12pb-" } } });
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d12pb-" } } });
  const lu = await prisma.user.count({ where: { email: { startsWith: "svc-d12pb-" } } });
  console.log(`\n── ล้าง: tenant ค้าง ${left} · user ค้าง ${lu} ──`);
  const bad = results.filter((r) => !r.ok);
  console.log(`\nPROBE_SUMMARY ${J({ total: results.length, fail: bad.map((r) => `${r.id}:${r.sev}`) })}`);
  await prisma.$disconnect();
  process.exit(exitCode || (bad.length ? 1 : 0));
}

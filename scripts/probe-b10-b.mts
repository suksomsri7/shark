// PROBE — SVC B.10 reviewer B (โจมตีด้วยหลายโพรเซส) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-b10-b.mts
// ข้อมูลใต้ร้าน slug `qc-svc-b10pb-*` + ผู้ใช้ `qc-svc-b10pb-*@qc.invalid` · ล้างใน finally ทุกครั้ง (+ กวาดค้างตอนเริ่ม)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import pg from "pg";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── ด่านฐาน (QC svc เท่านั้น) ──
for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
  let hn = "";
  try { hn = new URL(process.env[n] ?? "").hostname; } catch { /* */ }
  if (!hn.startsWith("ep-mute-scene")) { console.error(`🔴 probe: ${n} ไม่ใช่ฐาน qc-svc — หยุด`); process.exit(4); }
}
if (process.env.APP_ENV === "production" || process.env.CI) { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }

const imp = (rel: string): Promise<any> => import(pathToFileURL(join(ROOT, rel)).href);
const FINISH = "src/lib/modules/booking/finish.ts";

// ═══════════ โหมดลูก ═══════════
type Call = { op: string; a: any[]; delayMs?: number };
const goFile = (run: string, key: string) => `/tmp/probe-b10b-go-${run}-${key}`;
async function runOp(c: Call): Promise<any> {
  const t0 = Date.now();
  if (c.delayMs) await sleep(c.delayMs);
  const a = c.a.map((x) => (x && typeof x === "object" && typeof x.__date === "string" ? new Date(x.__date) : x));
  try {
    let r: any;
    if (c.op === "finish") r = await (await imp(FINISH)).finishJob(a[0], a[1], { extras: a[2], now: a[3] });
    else if (c.op === "complete") r = await (await import("@/lib/modules/booking/queue-line" as string)).completeJob(a[0], a[1], { now: a[2] });
    else if (c.op === "ensure") r = await (await imp(FINISH)).ensureServiceBill(a[0], a[1]);
    else if (c.op === "amend") r = await (await imp(FINISH)).amendServiceBill(a[0], a[1], { extras: a[2] });
    else if (c.op === "cancel") r = await (await imp(FINISH)).cancelServiceBill(a[0], a[1], { reason: a[2] });
    else if (c.op === "pay") r = await (await import("@/lib/modules/pos" as string)).serviceBills.payServiceBill(a[0], a[1], { heldCartId: a[2], payMethods: a[3], idempotencyKey: a[4] });
    else if (c.op === "recall") r = await (await import("@/lib/modules/pos/held-cart" as string)).recallHeldCart(a[0], a[1], { id: a[2] });
    else if (c.op === "setStatus") r = await (await import("@/lib/modules/booking/service" as string)).setAppointmentStatus(a[0], a[1], a[2], a[3]);
    else if (c.op === "refundDep") r = await (await import("@/lib/modules/pos/deposit" as string)).moduleRefundDeposit({ tenantId: a[0], unitId: a[1], receiptSaleId: a[2], reason: "probe b10", actorId: a[3] });
    else if (c.op === "consume") {
      const { prisma } = await import("@/lib/core/db" as string);
      const ev = await prisma.outboxEvent.findUnique({ where: { id: a[0] } });
      const h = (await import("@/lib/outbox-consumers" as string)).consumers[ev.type];
      await h(ev);
      r = { ok: true };
    } else r = { unknownOp: c.op };
    return { op: c.op, r: slim(r), ms: Date.now() - t0 };
  } catch (e) {
    return { op: c.op, threw: errMsg(e), ms: Date.now() - t0 };
  }
}
const slim = (r: any) => (r && typeof r === "object" ? { ok: r.ok, code: r.code ?? null, heldCartId: r.heldCartId ?? null, saleId: r.saleId ?? null, already: r.already ?? null, duplicated: r.duplicated ?? null, reason: typeof r.reason === "string" ? r.reason.slice(0, 80) : typeof r.message === "string" ? r.message.slice(0, 80) : null } : r);

if (process.env.PROBE_B10B_CHILD) {
  const spec = JSON.parse(process.env.PROBE_B10B_CHILD) as { run: string; key: string; calls: Call[] };
  try {
    const { prisma } = await import("@/lib/core/db" as string);
    await prisma.$queryRawUnsafe("SELECT 1");
    await imp(FINISH);
    await import("@/lib/modules/pos" as string);
    await import("@/lib/outbox-consumers" as string);
    await import("@/lib/modules/pos/held-cart" as string);
    await import("@/lib/modules/pos/deposit" as string);
    console.log(`READY ${spec.key}`);
    const t0 = Date.now();
    while (!existsSync(goFile(spec.run, spec.key))) { if (Date.now() - t0 > 300_000) process.exit(5); await sleep(5); }
    const outs = await Promise.all(spec.calls.map(runOp));
    console.log(`RES ${spec.key} ${JSON.stringify(outs)}`);
    await prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.log(`CHILD_ERR ${errMsg(e)}`);
    process.exit(3);
  }
}

// ═══════════ โพรเซสหลัก ═══════════
const LOG = `/tmp/probe-b10-b.out.${process.pid}.log`;
{
  process.stdout.on("error", () => { /* */ });
  const orig = console.log.bind(console);
  console.log = (...x: unknown[]) => { try { appendFileSync(LOG, `${x.map((y) => (typeof y === "string" ? y : J(y))).join(" ")}\n`); } catch { /* */ } try { orig(...x); } catch { /* */ } };
  console.log(`(probe log: ${LOG} · start ${new Date().toISOString()})`);
}
const RUN = Date.now().toString(36);
const goFiles: string[] = [];
async function fan(key: string, perChild: Call[][]): Promise<any[]> {
  const n = perChild.length;
  const ready = new Set<number>(); const res = new Map<number, any[]>(); const dead = new Set<number>(); const errs: string[] = [];
  const kids = perChild.map((calls, idx) => {
    const ch = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, PROBE_B10B_CHILD: JSON.stringify({ run: RUN, key, calls }) }, stdio: ["ignore", "pipe", "pipe"] });
    createInterface({ input: ch.stdout }).on("line", (l) => {
      if (l === `READY ${key}`) ready.add(idx);
      else if (l.startsWith(`RES ${key} `)) res.set(idx, JSON.parse(l.slice(`RES ${key} `.length)));
      else if (l.startsWith("CHILD_ERR")) errs.push(`#${idx} ${l}`);
    });
    let tail = "";
    ch.stderr.on("data", (b: Buffer) => { tail = (tail + b.toString()).slice(-600); });
    ch.on("exit", (code) => { dead.add(idx); if (code !== 0) errs.push(`#${idx} exit ${code} ${tail.split("\n").filter(Boolean).slice(-2).join(" | ")}`); });
    return ch;
  });
  const waitFor = async (cond: () => boolean, ms: number) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) return false; await sleep(20); } return true; };
  try {
    await waitFor(() => ready.size === n || dead.size > 0, 240_000);
    if (ready.size < n) throw new Error(`ลูกไม่พร้อม ${ready.size}/${n} ${errs.slice(0, 2).join(" · ")}`);
    const f = goFile(RUN, key); writeFileSync(f, "go"); goFiles.push(f);
    await waitFor(() => res.size + [...dead].filter((i) => !res.has(i)).length >= n, 240_000);
  } finally {
    await waitFor(() => dead.size === n, 30_000);
    for (const k of kids) if (k.exitCode === null) k.kill("SIGKILL");
  }
  if (errs.length) console.log(`  (ลูก: ${errs.slice(0, 3).join(" · ")})`);
  return [...res.values()].flat();
}

type R = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: R[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown = "") => {
  const d = typeof detail === "string" ? detail : J(detail);
  results.push({ id, ok, sev, what, detail: d });
  console.log(`  ${ok ? "✅ HOLD" : "❌ BREACH"} [${id}] (${sev}) ${what}${d ? ` — ${d.slice(0, 1400)}` : ""}`);
};
const BADRX = /P2028|P2024|P2002|P2034|timed out|Unable to start a transaction|Transaction already closed|INTERNAL/i;
const badOf = (outs: any[]) => outs.filter((o) => o.threw || BADRX.test(J(o)));
const step = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { rec(id, false, "ERR", "probe ล้มเอง (ไม่ใช่ผลตัดสิน)", errMsg(e)); } };

// ═══════════ ฐาน + ล้าง ═══════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const q = async (sql: string, p: unknown[] = []): Promise<any[]> => (await pool.query(sql, p)).rows;
const colCache = new Map<string, any[]>();
const rid = (p: string) => `b10pb_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
async function insertRow(table: string, vals: Record<string, unknown>) {
  if (!colCache.has(table)) colCache.set(table, await q(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  const v: Record<string, unknown> = { ...vals };
  for (const c of colCache.get(table)!) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type as string;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? "2031-01-01" : t === "ARRAY" ? [] : null;
  }
  const k = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${k.map((x) => `"${x}"`).join(", ")}) VALUES (${k.map((_, i) => `$${i + 1}`).join(", ")})`, k.map((x) => v[x]));
}
const SLUG = "qc-svc-b10pb-";
const MAIL = "qc-svc-b10pb-";
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  const tables = (await q(`SELECT DISTINCT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.t as string);
  let pending = tables;
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const failed: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { failed.push(t); } }
    pending = failed;
  }
  if (pending.length) console.log(`  ⚠️ ลบไม่ได้: ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ ลบ Tenant: ${errMsg(e)}`); }
}
async function cleanupUsers() {
  try {
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${MAIL}%`]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}

// ═══════════ เวลา ═══════════
const addDays = (ds: string, n: number) => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const dd = (k: number) => addDays(TODAY, 8 + k);
const at = (ds: string, min: number) => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + (min - 420) * 60_000); };
const D = (d: Date) => ({ __date: d.toISOString() });

// ═══════════ ids ═══════════
const T = (k: string) => `b10pb_${k}_${RUN}`;
const ids = {
  tA: T("tA"), tB: T("tB"), uA: T("uA"), uL: T("uL"), uS: T("uS"), uN: T("uN"), uB: T("uB"), uP: T("uP"),
  posA: T("posA"), posB: T("posB"), posP: T("posP"), hrA: T("hrA"), CUTP: T("CUTP"), pp: T("pp"), WAXI: T("WAXI"),
  COLOR: T("COLOR"), TREAT: T("TREAT"), CUT: T("CUT"), FULL: T("FULL"), CUTL: T("CUTL"), CUTS: T("CUTS"), CUTN: T("CUTN"), CUTB: T("CUTB"),
  WAX: T("WAX"), WAXL: T("WAXL"), WAXARCH: T("WAXARCH"), WAXB: T("WAXB"),
  ek: T("ek"), boy: T("boy"), gone: T("gone"), ll: T("ll"), ss: T("ss"), nn: T("nn"), bb: T("bb"),
  empEk: T("empEk"), empBoy: T("empBoy"),
  uOwner: T("uOwner"), uEk: T("uEk"), uBoy: T("uBoy"), uCash: T("uCash"), uMgr: T("uMgr"), uOwnerB: T("uOwnerB"),
};
const cA = { tenantId: ids.tA, unitId: ids.uA, actorUserId: ids.uEk };
const cBoy = { ...cA, actorUserId: ids.uBoy };
const cMgr = { ...cA, actorUserId: ids.uMgr };
const cL = { tenantId: ids.tA, unitId: ids.uL, actorUserId: ids.uOwner };
const cS = { tenantId: ids.tA, unitId: ids.uS, actorUserId: ids.uOwner };
const cB = { tenantId: ids.tB, unitId: ids.uB, actorUserId: ids.uOwnerB };
const DEV1 = "b10pbdev00000000001", DEV2 = "b10pbdev00000000002";
const rA = { tenantId: ids.tA, systemId: ids.posA, unitId: ids.uA, deviceId: DEV1 };
const rA2 = { ...rA, deviceId: DEV2 };
const rL = { tenantId: ids.tA, systemId: ids.posA, unitId: ids.uL, deviceId: DEV1 };
const rB = { tenantId: ids.tB, systemId: ids.posB, unitId: ids.uB, deviceId: DEV1 };
const CASHIER = { userId: ids.uCash, role: "STAFF", unitAccess: [ids.uA, ids.uL, ids.uS], permissions: { "pos.sale.create": true } };
const OWNER_REG = { userId: ids.uOwner, role: "OWNER", unitAccess: ["*"], permissions: {} };
const OWNER_B_REG = { userId: ids.uOwnerB, role: "OWNER", unitAccess: ["*"], permissions: {} };
const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.uOwner };
const OWNER_BS = { ...OWNER, userId: ids.uOwnerB };
let phoneN = 0;
const newPhone = () => `08${String(61_000_000 + Math.floor(Math.random() * 800_000) * 10 + ++phoneN).slice(-8)}`;

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const FN: any = await imp(FINISH);
const POS: any = await import("@/lib/modules/pos" as string);
const SB: any = POS.serviceBills;
const LN: any = await import("@/lib/modules/booking/queue-line" as string);
const BK: any = await import("@/lib/modules/booking/service" as string);
const SET: any = await import("@/lib/core/settings" as string);
const HELD: any = await import("@/lib/modules/pos/held-cart" as string);
const DEP: any = await import("@/lib/modules/pos/deposit" as string);
const BILLS: any = await import("@/lib/modules/pos/bills" as string);
const REFUND: any = await import("@/lib/modules/pos/refund" as string);
const CONS: any = (await import("@/lib/outbox-consumers" as string)).consumers;

// ═══════════ ตัวอ่าน ═══════════
const apRow = async (id: string) => (await q(`SELECT id, status::text AS status, "heldCartId", "depositSaleId", "depositPaidAt", "queueTicketId" FROM "Appointment" WHERE id = $1`, [id]))[0];
const cartsOf = async (id: string) => q(`SELECT id, status::text AS status, version, "unitId", "cartJson" FROM "PosHeldCart" WHERE "serviceJobId" = $1 ORDER BY "createdAt"`, [id]);
const salesOf = async (id: string) => q(`SELECT id, status::text AS status, "grandTotalSatang", "idempotencyKey", "soldByUserId" FROM "PosSale" WHERE "sourceModule" = 'BOOKING' AND "sourceId" = $1 AND "docType"::text = 'SALE' ORDER BY "createdAt"`, [id]);
const linesOf = async (saleId: string) => q(`SELECT id, "lineTotalSatang", qty, "unitPriceSatang", "performerEmployeeId", "productId", "serviceId" FROM "PosSaleLine" WHERE "saleId" = $1 ORDER BY "lineTotalSatang" DESC`, [saleId]);
const paysOf = async (saleId: string) => q(`SELECT type::text AS type, "amountSatang", "refSaleId" FROM "PosPayment" WHERE "saleId" = $1 ORDER BY type::text`, [saleId]);
const commOf = async (saleId: string) => q(`SELECT "userId", "employeeId", kind::text AS kind, "amountSatang", "baseSatang", "rateBp", "lineId" FROM "PosStaffCommission" WHERE "saleId" = $1 ORDER BY kind::text, "amountSatang" DESC`, [saleId]);
const depOf = async (receipt: string) => (await q(`SELECT status::text AS status, "amountSatang", "usedSatang", "refundedSatang" FROM "PosDeposit" WHERE "receiptSaleId" = $1`, [receipt]))[0] ?? null;
const evCount = async (key: string) => Number((await q(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND "idempotencyKey" = $2`, [[ids.tA, ids.tB], key]))[0]?.n ?? 0);
async function consume(type: string, saleId: string) {
  const rows = await q(`SELECT id, "tenantId", type, payload, "systemId", "unitId" FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = $2 AND payload->>'saleId' = $3`, [ids.tA, type, saleId]);
  for (const r of rows) await CONS[type](r);
  return rows.map((r) => r.id as string);
}
const halfUp = (n: number, d: number) => Math.floor((2 * n + d) / (2 * d));

async function bookInService(ctx: any, svc: string, staff: string, ds: string, startMin: number, o: { deposit?: boolean; start?: boolean } = {}): Promise<string> {
  const r = await BK.bookAppointment(ctx, { serviceId: svc, staffId: staff, dateStr: ds, startMin, channel: "STAFF", customerName: "คุณโพรบ บีสิบ", customerPhone: newPhone(), idempotencyKey: rid("idem") });
  if (!r.ok) throw new Error(`จอง ${ds} ${startMin} ล้ม ${r.code} ${r.reason}`);
  if (r.status === "PENDING") { const c = await BK.setAppointmentStatus(ctx.tenantId, ctx.unitId, r.id, "CONFIRMED"); if (!c.ok) throw new Error(`ยืนยัน ${J(c)}`); }
  if (o.deposit) { const d = await BK.recordDeposit(ctx, r.id, "PROMPTPAY"); if (!d.ok) throw new Error(`มัดจำ ${J(d)}`); }
  const c = await LN.checkIn(ctx, { appointmentId: r.id }, { via: "STAFF", now: at(ds, startMin - 5) });
  if (!c.ok) throw new Error(`เช็กอิน ${J(c)}`);
  if (o.start !== false) { const s = await LN.startJob(ctx, r.id, { now: at(ds, startMin) }); if (!s.ok) throw new Error(`เริ่ม ${J(s)}`); }
  return r.id;
}
const cash = (n: number) => [{ type: "CASH", amountSatang: n }];
const ALLOWED_PAY = new Set(["SERVICE_BILL_PAID", "BUSY", "NOT_FOUND", "PAYMENT_MISMATCH"]);

// ═══════════ main ═══════════
const TIDS = [ids.tA, ids.tB];
try {
  const stale = (await q(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id as string);
  if (stale.length) { console.log(`(กวาดร้านค้าง ${stale.length})`); await cleanup(stale); }
  await cleanupUsers();

  // ── fixtures ──
  for (const [id, n] of [[ids.tA, "a"], [ids.tB, "b"]] as const) await insertRow("Tenant", { id, name: `PB B10 ${n}`, slug: `${SLUG}${n}-${RUN}`, updatedAt: new Date() });
  for (const [id, t, n] of [[ids.uA, ids.tA, "a"], [ids.uL, ids.tA, "l"], [ids.uS, ids.tA, "s"], [ids.uN, ids.tA, "n"], [ids.uB, ids.tB, "b"], [ids.uP, ids.tA, "p"]] as const) {
    await insertRow("BusinessUnit", { id, tenantId: t, type: "BOOKING", name: `สาขา pb ${n}`, slug: `b10pb-${n}-${RUN}`, updatedAt: new Date() });
    for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: id, weekday: w, openMin: 600, closeMin: 1260, closed: false, updatedAt: new Date() });
  }
  const svc = (id: string, t: string, u: string, name: string, dur: number, price: number, dep = 0) =>
    insertRow("BookingService", { id, tenantId: t, unitId: u, name, durationMin: dur, priceSatang: price, bufferMin: 0, depositSatang: dep, bookable: true, active: true, sortOrder: 0, updatedAt: new Date() });
  await svc(ids.COLOR, ids.tA, ids.uA, "ทำสีผม", 60, 90000, 20000);
  await svc(ids.TREAT, ids.tA, ids.uA, "ทรีตเมนต์", 30, 30000);
  await svc(ids.CUT, ids.tA, ids.uA, "ตัดผม", 30, 25000);
  await svc(ids.FULL, ids.tA, ids.uA, "จ่ายเต็มล่วงหน้า", 30, 20000, 20000);
  await svc(ids.CUTL, ids.tA, ids.uL, "ตัดผม", 30, 25000);
  await svc(ids.CUTS, ids.tA, ids.uS, "ตัดผม", 30, 25000);
  await svc(ids.CUTN, ids.tA, ids.uN, "ตัดผม", 30, 25000);
  await svc(ids.CUTB, ids.tB, ids.uB, "ตัดผม", 30, 25000);
  await svc(ids.CUTP, ids.tA, ids.uP, "ตัดผม", 30, 25000);
  let ord = 0;
  const staff = (id: string, t: string, u: string, name: string, emp: string | null = null, active = true) =>
    insertRow("BookingStaff", { id, tenantId: t, unitId: u, name, sortOrder: ++ord, active, employeeId: emp, createdAt: new Date(Date.now() - 600_000 + ord * 1000), updatedAt: new Date() });
  await insertRow("AppSystem", { id: ids.hrA, tenantId: ids.tA, type: "HR", name: "HR pb", updatedAt: new Date() });
  await insertRow("HrEmployee", { id: ids.empEk, tenantId: ids.tA, systemId: ids.hrA, name: "ช่างเอก", linkedUserId: ids.uEk, active: true, updatedAt: new Date() });
  await insertRow("HrEmployee", { id: ids.empBoy, tenantId: ids.tA, systemId: ids.hrA, name: "ช่างบอย", linkedUserId: ids.uBoy, active: true, updatedAt: new Date() });
  await staff(ids.ek, ids.tA, ids.uA, "ช่างเอก", ids.empEk);
  await staff(ids.boy, ids.tA, ids.uA, "ช่างบอย", ids.empBoy);
  await staff(ids.gone, ids.tA, ids.uA, "ช่างลาออก", null, false);
  await staff(ids.ll, ids.tA, ids.uL, "ช่างร้านเดิม");
  await staff(ids.ss, ids.tA, ids.uS, "ช่างสลับแม่แบบ");
  await staff(ids.nn, ids.tA, ids.uN, "ช่างสาขา N");
  await staff(ids.bb, ids.tB, ids.uB, "ช่างร้าน B");
  await staff(ids.pp, ids.tA, ids.uP, "ช่างสาขา POS ปิด");
  const posSettings = JSON.stringify({ pos: { shift: { required: { register: false, otherSources: false } }, staffCommission: { enabled: true, defaultBp: 300, sellerRoles: ["OWNER", "MANAGER", "STAFF"], skipDealBills: true } } });
  await insertRow("AppSystem", { id: ids.posA, tenantId: ids.tA, type: "POS", name: "POS pb A", settings: posSettings, updatedAt: new Date() });
  await insertRow("AppSystem", { id: ids.posB, tenantId: ids.tB, type: "POS", name: "POS pb B", settings: posSettings, updatedAt: new Date() });
  await insertRow("AppSystem", { id: ids.posP, tenantId: ids.tA, type: "POS", name: "POS pb ปิดใช้", settings: posSettings, active: false, updatedAt: new Date() });
  for (const [t, s, u] of [[ids.tA, ids.posA, ids.uA], [ids.tA, ids.posA, ids.uL], [ids.tA, ids.posA, ids.uS], [ids.tB, ids.posB, ids.uB], [ids.tA, ids.posP, ids.uP]] as const) await insertRow("AppSystemUnit", { id: rid("asu"), tenantId: t, systemId: s, unitId: u, type: "POS" });
  for (const [id, t, s, u, arch] of [[ids.WAX, ids.tA, ids.posA, null, false], [ids.WAXL, ids.tA, ids.posA, ids.uL, false], [ids.WAXARCH, ids.tA, ids.posA, null, true], [ids.WAXB, ids.tB, ids.posB, null, false]] as const) {
    await insertRow("PosProduct", { id, tenantId: t, systemId: s, unitId: u, kind: "PRODUCT", name: "แว็กซ์", basePriceSatang: 29000, trackStock: false, images: "[]", updatedAt: new Date(), ...(arch ? { archivedAt: new Date() } : {}) });
  }
  // สินค้านับสต็อก (ผูก InvItem) — หน้าขายปกติส่ง itemId = invItemId ⇒ ตัดสต็อก + COGS
  await insertRow("PosProduct", { id: ids.WAXI, tenantId: ids.tA, systemId: ids.posA, unitId: null, kind: "PRODUCT", name: "แว็กซ์นับสต็อก", basePriceSatang: 29000, trackStock: true, invItemId: T("inv"), images: "[]", updatedAt: new Date() });
  const users: [string, string, string, string, string[], Record<string, boolean>][] = [
    [ids.uOwner, "owner", ids.tA, "OWNER", ["*"], {}],
    [ids.uEk, "ek", ids.tA, "STAFF", [ids.uA], { "booking.job.run": true }],
    [ids.uBoy, "boy", ids.tA, "STAFF", [ids.uA], { "booking.job.run": true }],
    [ids.uCash, "cash", ids.tA, "STAFF", [ids.uA, ids.uL, ids.uS], { "pos.sale.create": true }],
    [ids.uMgr, "mgr", ids.tA, "MANAGER", [ids.uA], {}],
    [ids.uOwnerB, "ownerb", ids.tB, "OWNER", ["*"], {}],
  ];
  for (const [uid, k, t, role, ua, perms] of users) {
    await insertRow("User", { id: uid, email: `${MAIL}${k}-${RUN}@qc.invalid`, name: `PB ${k}`, updatedAt: new Date() });
    await insertRow("Membership", { id: rid("mb"), userId: uid, tenantId: t, role, unitAccess: JSON.stringify(ua), permissions: JSON.stringify(perms), acceptedAt: new Date(), updatedAt: new Date() });
  }
  for (const [t, u, a] of [[ids.tA, ids.uA, OWNER], [ids.tA, ids.uN, OWNER], [ids.tB, ids.uB, OWNER_BS], [ids.tA, ids.uP, OWNER]] as const) {
    const r = await SET.applyTemplate(a, { tenantId: t }, { unitId: u, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
    if (!r.ok) throw new Error(`applyTemplate ${u} ${J(r)}`);
  }
  const s0 = await SET.setSettings(OWNER, { tenantId: ids.tA }, [
    { key: "booking.money.commissionTo", scope: "UNIT", scopeId: ids.uA, value: "PERFORMER" },
    { key: "booking.deposit.amount", scope: "UNIT", scopeId: ids.uA, value: { mode: "PER_SERVICE" } },
    { key: "booking.money.commissionRate", scope: "UNIT", scopeId: ids.uA, value: { serviceBp: 1000, productBp: 500 } },
    { key: "booking.money.commissionRate", scope: "STAFF", scopeId: ids.boy, value: { serviceBp: 1250, productBp: 0 } },
  ]);
  if (!s0.ok) throw new Error(`setSettings ${J(s0)}`);
  console.log(`(fixtures พร้อม · วัน ${dd(0)}…)`);

  // ═══════════ K1 เสร็จซ้อน 4 โพรเซส ═══════════
  console.log("\n── K1: กดเสร็จซ้อน 4 โพรเซส (finish×2+extras · completeJob · ensure · setAppointmentStatus DONE) ──");
  await step("K1", async () => {
    for (let round = 0; round < 3; round++) {
      const ds = dd(round), id = await bookInService(cA, ids.COLOR, ids.ek, ds, 600, { deposit: true });
      const now = D(at(ds, 660));
      const ex = [{ kind: "PRODUCT", productId: ids.WAX, qty: 1 }];
      const outs = await fan(`k1-${round}`, [
        [{ op: "finish", a: [cA, id, ex, now] }, { op: "finish", a: [cA, id, [], now] }],
        [{ op: "complete", a: [cA, id, now] }, { op: "finish", a: [cA, id, ex, now] }],
        [{ op: "ensure", a: [cA, id] }, { op: "finish", a: [cBoy, id, [], now] }],
        [{ op: "setStatus", a: [ids.tA, ids.uA, id, "DONE"] }, { op: "finish", a: [cA, id, ex, now] }],
      ]);
      const carts = await cartsOf(id);
      const held = carts.filter((c: any) => c.status === "HELD");
      const ap = await apRow(id);
      const okIds = new Set(outs.filter((o) => o.r?.ok && o.r?.heldCartId).map((o) => o.r.heldCartId));
      const ec = await evCount(`booking.completed#${id}`);
      const tk = ap.queueTicketId ? Number((await q(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "idempotencyKey" = $1`, [`queue.ticket.done#${ap.queueTicketId}`]))[0].n) : -1;
      const bads = badOf(outs);
      const pass = carts.length <= 1 && held.length <= 1 && ap.status === "DONE" && ec === 1 && tk <= 1 && bads.length === 0 && [...okIds].every((x) => x === held[0]?.id) && (held.length === 0 || ap.heldCartId === held[0].id);
      rec(`K1-${round}`, pass, "CRITICAL", `เสร็จซ้อน 8 ทาง/4 โพรเซส ⇒ บิลพัก ≤1 · นัด DONE · booking.completed 1 · queue.ticket.done ≤1 · ไม่มี throw/P2028`,
        { carts: carts.map((c: any) => [c.status, c.cartJson?.service?.lines?.length]), apHeld: ap.heldCartId === held[0]?.id, status: ap.status, ec, tk, codes: outs.map((o) => `${o.op}:${o.threw ? "THREW " + o.threw : o.r?.ok ? (o.r.already ? "ok-already" : "ok") : o.r?.code}`), bads });
      if (held.length === 0) {
        // setAppointmentStatus(DONE) ชนะก่อน + ensure ใน mix ⇒ ต้องมีบิลได้ทาง ensure
        const e = await FN.ensureServiceBill(cA, id);
        rec(`K1-${round}b`, !!e.ok && !!e.heldCartId, "MAJOR", "ไม่มีบิลหลังชน ⇒ ensureServiceBill เปิดได้", e);
      }
    }
  });

  // ═══════════ K2 จ่ายซ้อน: 2 เครื่อง + recall ปกติ + amend + cancel ═══════════
  console.log("\n── K2: จ่ายซ้อน (หน้าขาย 2 เครื่อง + recallHeldCart + amend + cancel · 5 โพรเซส) ──");
  const k2Sales: string[] = [];
  await step("K2", async () => {
    for (let round = 0; round < 4; round++) {
      const ds = dd(4 + round), id = await bookInService(cA, ids.COLOR, ids.ek, ds, 600, { deposit: true });
      const f = await FN.finishJob(cA, id, { extras: [{ kind: "SERVICE", serviceId: ids.TREAT, staffId: ids.boy }, { kind: "PRODUCT", productId: ids.WAX, qty: 1 }], now: at(ds, 700) });
      if (!f.ok) throw new Error(`finish ${J(f)}`);
      const cart = f.heldCartId as string, receipt = (await apRow(id)).depositSaleId as string;
      const due = 90000 + 30000 + 29000 - 20000;
      const outs = await fan(`k2-${round}`, [
        [{ op: "pay", a: [rA, CASHIER, cart, cash(due), `k2-${RUN}-${round}-a`], delayMs: round === 1 ? 30 : 0 }, { op: "pay", a: [rA, CASHIER, cart, cash(due), `k2-${RUN}-${round}-a`] }],
        [{ op: "pay", a: [rA2, CASHIER, cart, [{ type: "CASH", amountSatang: due - 10000 }, { type: "CARD", amountSatang: 10000 }], `k2-${RUN}-${round}-b`] }],
        [{ op: "recall", a: [rA, CASHIER, cart] }, { op: "recall", a: [rA2, OWNER_REG, cart] }],
        [{ op: "amend", a: [cA, id, [{ kind: "PRODUCT", productId: ids.WAX, qty: 2 }]], delayMs: round === 2 ? 0 : 15 }],
        [{ op: "cancel", a: [cMgr, id, "probe cancel"], delayMs: round === 3 ? 0 : 40 }],
      ]);
      const sales = await salesOf(id);
      const carts = await cartsOf(id);
      const d = await depOf(receipt);
      const bads = badOf(outs);
      const payOuts = outs.filter((o) => o.op === "pay");
      const recallOk = outs.filter((o) => o.op === "recall" && o.r?.ok);
      let detail: any = { codes: outs.map((o) => `${o.op}:${o.threw ? "THREW " + o.threw : o.r?.ok ? "ok" + (o.r.duplicated ? "-dup" : "") : o.r?.code}`), sales: sales.length, carts: carts.map((c: any) => c.status), dep: d };
      let pass = sales.length <= 1 && bads.length === 0 && recallOk.length === 0 && payOuts.every((o) => o.r?.ok || ALLOWED_PAY.has(o.r?.code));
      if (sales.length === 1) {
        const s = sales[0];
        k2Sales.push(s.id);
        const ls = await linesOf(s.id), ps = await paysOf(s.id);
        const sumL = ls.reduce((t: number, l: any) => t + l.lineTotalSatang, 0);
        const sumP = ps.reduce((t: number, p: any) => t + p.amountSatang, 0);
        const depRows = ps.filter((p: any) => p.type === "DEPOSIT");
        pass &&= s.grandTotalSatang === sumL && sumP === sumL && depRows.length === 1 && depRows[0].amountSatang === 20000 && depRows[0].refSaleId === receipt && d?.usedSatang === 20000 && !carts.some((c: any) => c.status === "HELD")
          && payOuts.filter((o) => o.r?.ok).every((o) => o.r.saleId === s.id);
        // ค่าคอมฯ: ตัวรับซ้อน 4 โพรเซส
        const evIds = await consume("pos.sale.paid", s.id);
        const cOuts = await fan(`k2c-${round}`, [0, 1, 2, 3].map(() => [{ op: "consume", a: [evIds[0]] }]));
        const c = await commOf(s.id);
        const want = ls.map((l: any) => {
          const bp = l.productId ? (l.performerEmployeeId === ids.empBoy ? 0 : 500) : (l.performerEmployeeId === ids.empBoy ? 1250 : 1000);
          return halfUp(l.lineTotalSatang * bp, 10000);
        }).reduce((t: number, x: number) => t + x, 0);
        const sumC = c.reduce((t: number, x: any) => t + x.amountSatang, 0);
        const okComm = c.every((x: any) => x.kind === "ACCRUE" && x.userId !== ids.uCash && ((x.employeeId === ids.empEk && x.userId === ids.uEk) || (x.employeeId === ids.empBoy && x.userId === ids.uBoy))) && sumC === want && new Set(c.map((x: any) => x.lineId)).size === c.length;
        const bp = await evCount(`booking.paid#${id}`);
        pass &&= okComm && bp === 1 && badOf(cOuts).length === 0;
        detail = { ...detail, grand: s.grandTotalSatang, sumL, pays: ps.map((p: any) => [p.type, p.amountSatang]), comm: c.map((x: any) => [x.employeeId === ids.empEk ? "ek" : x.employeeId === ids.empBoy ? "boy" : x.employeeId, x.amountSatang, x.rateBp]), want, sumC, bookingPaid: bp, consumerBad: badOf(cOuts) };
      } else {
        pass &&= (d?.usedSatang ?? 0) === 0 && carts.filter((c: any) => c.status === "HELD").length <= 1;
      }
      rec(`K2-${round}`, pass, "CRITICAL", "จ่ายซ้อน ⇒ ขาย ≤1 · grand=Σบรรทัด=Σจ่าย · DEPOSIT 1 แถวอ้างใบรับ (ใช้ครั้งเดียว) · recall ปกติไม่สำเร็จ · ค่าคอมฯ 1 ชุดถูกยอดตามผู้ทำ (ตัวรับซ้อน 4 โพรเซส) · booking.paid 1 · ไม่มี throw/P2028", detail);
    }
  });

  // ═══════════ K3 คืนมัดจำ ∥ จ่าย ═══════════
  console.log("\n── K3: moduleRefundDeposit ∥ payServiceBill (เงินออกซ้ำไม่ได้) ──");
  await step("K3", async () => {
    for (let round = 0; round < 3; round++) {
      const ds = dd(10 + round), id = await bookInService(cA, ids.COLOR, ids.ek, ds, 600, { deposit: true });
      const f = await FN.finishJob(cA, id, { now: at(ds, 700) });
      if (!f.ok) throw new Error(`finish ${J(f)}`);
      const receipt = (await apRow(id)).depositSaleId as string;
      const outs = await fan(`k3-${round}`, [
        [{ op: "refundDep", a: [ids.tA, ids.uA, receipt, ids.uOwner], delayMs: round * 20 }],
        [{ op: "pay", a: [rA, CASHIER, f.heldCartId, cash(70000), `k3-${RUN}-${round}-a`] }],
        [{ op: "pay", a: [rA2, CASHIER, f.heldCartId, cash(90000), `k3-${RUN}-${round}-b`] }],
      ]);
      const sales = await salesOf(id), d = await depOf(receipt);
      const ps = sales.length ? await paysOf(sales[0].id) : [];
      const depUsed = ps.filter((p: any) => p.type === "DEPOSIT").reduce((t: number, p: any) => t + p.amountSatang, 0);
      const pass = sales.length <= 1 && badOf(outs).length === 0 && (d.usedSatang + d.refundedSatang) <= d.amountSatang && depUsed === d.usedSatang
        && (sales.length === 0 || ps.reduce((t: number, p: any) => t + p.amountSatang, 0) === 90000);
      rec(`K3-${round}`, pass, "CRITICAL", "คืนมัดจำ ∥ จ่าย ⇒ มัดจำไม่ถูกทั้งคืนและใช้ · ใช้+คืน ≤ ยอดมัดจำ · Σจ่าย = ฿900", { codes: outs.map((o) => `${o.op}:${o.threw ?? (o.r?.ok ? "ok" : o.r?.code)}`), dep: d, pays: ps.map((p: any) => [p.type, p.amountSatang]) });
    }
  });

  // ═══════════ K4 ราคา/ของปลอมจาก client ═══════════
  console.log("\n── K4: ราคา · แถว DEPOSIT · ส่วนลดปลอม · ราคาแคตตาล็อกเปลี่ยนระหว่างพัก ──");
  await step("K4", async () => {
    const ds = dd(14);
    // (a) ของเพิ่มที่แนบราคา/อัตรา/ผู้ทำปลอม
    const id = await bookInService(cA, ids.CUT, ids.ek, ds, 600);
    const taint = [
      { kind: "SERVICE", serviceId: ids.TREAT, unitPriceSatang: 1, amountSatang: 1, priceSatang: 1, commissionBp: 10000, performerEmployeeId: ids.empBoy },
      { kind: "PRODUCT", productId: ids.WAX, qty: 1, unitPriceSatang: 1, basePriceSatang: 1, commissionBp: 10000 },
    ];
    const f = await FN.finishJob(cA, id, { extras: taint, now: at(ds, 640) });
    const c0 = (await cartsOf(id))[0];
    const ln = c0?.cartJson?.service?.lines ?? [];
    rec("K4-a", !!f.ok && J(ln.map((l: any) => [l.unitPriceSatang, l.commissionBp, l.performerEmployeeId])) === J([[25000, 1000, ids.empEk], [30000, 1000, ids.empEk], [29000, 500, ids.empEk]]), "CRITICAL",
      "ของเพิ่มแนบราคา/อัตรา/ผู้ทำปลอม ⇒ server ใช้ราคา/อัตรา/ผู้ทำของตัวเอง", { f, lines: ln.map((l: any) => [l.name, l.unitPriceSatang, l.commissionBp, l.performerEmployeeId]) });
    const cart = f.heldCartId as string;
    // (b) ของผิดขอบเขต/ผิดรูป ⇒ BAD_INPUT ไม่แตะบิล
    const badSets: [string, any[]][] = [
      ["สินค้าของสาขาอื่น (WAXL unitId=uL)", [{ kind: "PRODUCT", productId: ids.WAXL, qty: 1 }]],
      ["สินค้าเก็บถาวร", [{ kind: "PRODUCT", productId: ids.WAXARCH, qty: 1 }]],
      ["สินค้าร้าน B", [{ kind: "PRODUCT", productId: ids.WAXB, qty: 1 }]],
      ["บริการสาขา N", [{ kind: "SERVICE", serviceId: ids.CUTN }]],
      ["ผู้ทำของสาขา L", [{ kind: "SERVICE", serviceId: ids.TREAT, staffId: ids.ll }]],
      ["ผู้ทำปิดใช้", [{ kind: "SERVICE", serviceId: ids.TREAT, staffId: ids.gone }]],
      ["qty 1.5", [{ kind: "PRODUCT", productId: ids.WAX, qty: 1.5 }]],
      ["qty -1", [{ kind: "PRODUCT", productId: ids.WAX, qty: -1 }]],
      ["21 บรรทัด", Array.from({ length: 21 }, () => ({ kind: "SERVICE", serviceId: ids.TREAT }))],
      ["kind DEPOSIT", [{ kind: "DEPOSIT", amountSatang: 50000 }]],
      ["kind DISCOUNT", [{ kind: "DISCOUNT", amountSatang: 50000 }]],
    ];
    const bad: string[] = [];
    for (const [n, ex] of badSets) {
      const r = await FN.amendServiceBill(cA, id, { extras: ex });
      if (r.ok || r.code !== "BAD_INPUT") bad.push(`${n}⇒${J(r).slice(0, 80)}`);
    }
    const c1 = (await cartsOf(id))[0];
    rec("K4-b", bad.length === 0 && c1.version === c0.version, "CRITICAL", "amend ของผิดขอบเขต/ผิดรูป/DEPOSIT/DISCOUNT ⇒ BAD_INPUT · บิลไม่ถูกแตะ (version เดิม)", bad.join(" · ") || `version ${c0.version}→${c1.version}`);
    // (c) ฝั่งจ่าย: แถวจ่ายปลอม
    const due = 25000 + 30000 + 29000;
    const payBad: [string, any][] = [
      ["DEPOSIT", [...cash(due - 1000), { type: "DEPOSIT", amountSatang: 1000 }]],
      ["deposit ตัวเล็ก", [...cash(due - 1000), { type: "deposit", amountSatang: 1000 }]],
      ["VOUCHER", [...cash(due - 1000), { type: "VOUCHER", amountSatang: 1000 }]],
      ["GIFT_CARD", [...cash(due - 1000), { type: "GIFT_CARD", amountSatang: 1000 }]],
      ["POINTS", [...cash(due - 1000), { type: "POINTS", amountSatang: 1000 }]],
      ["CREDIT", [...cash(due - 1000), { type: "CREDIT", amountSatang: 1000 }]],
      ["ติดลบ", [...cash(due + 1000), { type: "CARD", amountSatang: -1000 }]],
      ["ศูนย์", [...cash(due), { type: "CARD", amountSatang: 0 }]],
      ["ทศนิยม", [{ type: "CASH", amountSatang: due - 0.5 }, { type: "CARD", amountSatang: 0.5 }]],
      ["tendered < amount", [{ type: "CASH", amountSatang: due, cashTenderedSatang: 100 }]],
      ["5 แถว", [{ type: "CASH", amountSatang: due - 4 }, ...cash(1), ...cash(1), ...cash(1), ...cash(1)]],
    ];
    const pb: string[] = [];
    for (const [n, pm] of payBad) {
      const r = await SB.payServiceBill(rA, CASHIER, { heldCartId: cart, payMethods: pm, idempotencyKey: rid("kb") });
      if (r.ok || !["VALIDATION", "PAYMENT_MISMATCH"].includes(r.code)) pb.push(`${n}⇒${J(r).slice(0, 80)}`);
    }
    // ส่วนลด/ยอดปลอมในอินพุต (ฟิลด์เกิน) — จ่ายยอดต่ำกว่าจริง ⇒ ต้อง MISMATCH
    const disc = await SB.payServiceBill(rA, CASHIER, { heldCartId: cart, payMethods: cash(due - 10000), idempotencyKey: rid("kd"), billDiscountSatang: 10000, discountSatang: 10000, grandTotalSatang: due - 10000, lines: [{ name: "x", qty: 1, unitPriceSatang: 1 }], couponCode: "FREE" });
    if (disc.ok || disc.code !== "PAYMENT_MISMATCH") pb.push(`ส่วนลดปลอม⇒${J(disc).slice(0, 80)}`);
    rec("K4-c", pb.length === 0 && (await salesOf(id)).length === 0, "CRITICAL", "จ่าย: DEPOSIT/วิธีจ่ายแปลก/ติดลบ/ศูนย์/ทศนิยม/ส่วนลด-ยอด-บรรทัดปลอม ⇒ ปฏิเสธ ไม่มีบิล", pb.join(" · "));
    // (d) ราคาแคตตาล็อกเปลี่ยนระหว่างพัก ⇒ ใช้ราคาที่ล็อก
    await q(`UPDATE "PosProduct" SET "basePriceSatang" = 50000 WHERE id = $1`, [ids.WAX]);
    await q(`UPDATE "BookingService" SET "priceSatang" = 99900 WHERE id = ANY($1::text[])`, [[ids.TREAT, ids.CUT]]);
    const v = await SB.serviceBillView(rA, CASHIER, { heldCartId: cart });
    const p = await SB.payServiceBill(rA, CASHIER, { heldCartId: cart, payMethods: cash(due), idempotencyKey: rid("kp") });
    const ls = p.ok ? (await linesOf(p.saleId)).map((l: any) => l.lineTotalSatang) : [];
    await q(`UPDATE "PosProduct" SET "basePriceSatang" = 29000 WHERE id = $1`, [ids.WAX]);
    await q(`UPDATE "BookingService" SET "priceSatang" = 30000 WHERE id = $1`, [ids.TREAT]);
    await q(`UPDATE "BookingService" SET "priceSatang" = 25000 WHERE id = $1`, [ids.CUT]);
    rec("K4-d", v.ok && v.dueSatang === due && p.ok && p.grandTotalSatang === due && J(ls) === J([30000, 29000, 25000]), "CRITICAL", "แคตตาล็อก/ราคาบริการขึ้นระหว่างพัก ⇒ หน้าขายเห็น+เก็บราคาที่ล็อก", { view: v.ok ? v.dueSatang : v, pay: p.ok ? p.grandTotalSatang : p, ls });
    // (e) ยอดต้องจ่าย ฿0 (มัดจำเต็มราคา) — จ่ายได้ไหม
    const idF = await bookInService(cA, ids.FULL, ids.boy, ds, 720, { deposit: true });
    const ff = await FN.finishJob(cBoy, idF, { now: at(ds, 760) });
    const vf = ff.ok ? await SB.serviceBillView(rA, CASHIER, { heldCartId: ff.heldCartId }) : null;
    const tries = [
      ["[]", []], ["CASH 0", cash(0)], ["CASH 1", cash(1)],
    ] as [string, any][];
    const tr: string[] = [];
    let paidF = false;
    for (const [n, pm] of tries) {
      const r = await SB.payServiceBill(rA, CASHIER, { heldCartId: ff.heldCartId, payMethods: pm, idempotencyKey: rid("kf") });
      tr.push(`${n}⇒${r.ok ? "ok" : r.code}`);
      if (r.ok) { paidF = true; break; }
    }
    rec("K4-e", paidF, "MAJOR", "งานที่มัดจำครอบเต็มราคา (ต้องจ่าย ฿0) ⇒ ต้องปิดบิลได้ (ไม่ค้างลิ้นชักตลอดไป · มัดจำต้องถูกใช้)", { finish: ff.ok ? "ok" : ff, due: vf?.dueSatang, dep: vf?.depositSatang, tries: tr, listed: ((await SB.listServiceBills(rA, CASHIER)).items ?? []).some((i: any) => i.heldCartId === ff.heldCartId) });
  });

  // ═══════════ K5 void/คืนบิลขายแล้ว ═══════════
  console.log("\n── K5: void/คืนบิลจากคิวที่ขายแล้ว ⇒ ค่าคอมฯ ย้อน · ทางคืนเงินของคน ──");
  await step("K5", async () => {
    const ds = dd(15);
    const id = await bookInService(cA, ids.CUT, ids.ek, ds, 600);
    const f = await FN.finishJob(cA, id, { extras: [{ kind: "SERVICE", serviceId: ids.TREAT, staffId: ids.boy }], now: at(ds, 640) });
    const p = await SB.payServiceBill(rA, CASHIER, { heldCartId: f.heldCartId, payMethods: cash(55000), idempotencyKey: rid("k5") });
    if (!p.ok) throw new Error(`pay ${J(p)}`);
    await consume("pos.sale.paid", p.saleId);
    const c0 = await commOf(p.saleId);
    // ORACLE-EDIT (ผู้คุม 30 ต.ค.): มติ Q11 ทางของคน = voidPaidServiceBill ฝั่งจองคิว (refundSale/voidSaleByActor เดิมขัดกับ K5-b เอง)
    // ยิงพร้อมกัน 2 ครั้ง ⇒ void จริงครั้งเดียว (K5-b ตรวจ REVERSE ไม่ซ้ำ)
    const [v1, v2] = await Promise.all([
      FN.voidPaidServiceBill(cA, id, { reason: "probe void 1" }),
      FN.voidPaidServiceBill(cA, id, { reason: "probe void 2" }),
    ]);
    const okN = [v1, v2].filter((v: any) => v.ok).length;
    rec("K5-a", okN >= 1, "MAJOR", "บิลจากคิวที่รับเงินแล้ว: voidPaidServiceBill (ฝั่งจองคิว · สิทธิ์ + เหตุผล) ยกเลิกได้ · ยิงซ้ำพร้อมกันไม่พัง",
      { v1: v1.ok ? "ok" : (v1 as any).code, v2: v2.ok ? "ok" : (v2 as any).code });
    if (okN === 0) await POS.voidSale(ids.tA, ids.uA, p.saleId, { actorUserId: ids.uOwner, reason: "probe void" });
    await consume("pos.sale.voided", p.saleId);
    await consume("pos.sale.voided", p.saleId);
    const c1 = await commOf(p.saleId);
    const byEmp = (emp: string) => c1.filter((x: any) => x.employeeId === emp).reduce((t: number, x: any) => t + x.amountSatang, 0);
    const rev = c1.filter((x: any) => x.kind === "REVERSE");
    rec("K5-b", c0.length === 2 && rev.length === 2 && byEmp(ids.empEk) === 0 && byEmp(ids.empBoy) === 0 && rev.every((x: any) => x.userId !== ids.uCash), "CRITICAL",
      "voidSale + ตัวรับ voided ×2 ⇒ REVERSE ต่อผู้ทำ (เอก/บอย) Σ0 ไม่ซ้ำ", c1.map((x: any) => [x.kind, x.employeeId === ids.empEk ? "ek" : "boy", x.amountSatang]));
    const e = await FN.ensureServiceBill(cA, id);
    const pv = await FN.previewServiceBill(cA, id);
    rec("K5-c", (await cartsOf(id)).filter((c: any) => c.status === "HELD").length === 0, "MINOR", "หลัง void: ไม่มีบิลพักใหม่เปิดเอง (หนี้ §5 เปิดบิลใหม่หลัง void)", { ensure: e, billStatus: pv?.billStatus, bookingPaid: await evCount(`booking.paid#${id}`) });
  });

  // ═══════════ K6 ออกจาก DONE ∥ เปิดบิล / จ่าย ═══════════
  console.log("\n── K6: setAppointmentStatus(ออกจาก DONE) ∥ ensureServiceBill — race หน้าต่างเล็ก ──");
  await step("K6", async () => {
    const ds = dd(16);
    const id = await bookInService(cA, ids.CUT, ids.ek, ds, 600);
    const f = await FN.finishJob(cA, id, { now: at(ds, 640) });
    if (!f.ok) throw new Error(`finish ${J(f)}`);
    let breach = 0, trials = 0; const seen: string[] = [];
    let breachId: string | null = null;
    for (let i = 0; i < 24 && !breachId; i++) {
      // เตรียม: DONE + ไม่มีบิล HELD
      const ap = await apRow(id);
      if (ap.status !== "DONE") { const back = await BK.setAppointmentStatus(ids.tA, ids.uA, id, "DONE"); if (!back.ok) throw new Error(`กลับ DONE ${J(back)}`); }
      if ((await cartsOf(id)).some((c: any) => c.status === "HELD")) { const c = await FN.cancelServiceBill(cMgr, id, { reason: `k6 prep ${i}` }); if (!c.ok) throw new Error(`cancel ${J(c)}`); }
      const target = i % 2 ? "CANCELLED" : "CONFIRMED";
      const opener: Call = i % 4 < 2 ? { op: "ensure", a: [cA, id] } : { op: "finish", a: [cA, id, [], D(at(ds, 641))] };
      const outs = await fan(`k6-${i}`, [
        [opener],
        [{ op: "setStatus", a: [ids.tA, ids.uA, id, target], delayMs: (i % 8) * 12 }],
      ]);
      trials++;
      const ap2 = await apRow(id), held = (await cartsOf(id)).filter((c: any) => c.status === "HELD");
      seen.push(`${opener.op}∥${target} ⇒ ${ap2.status}/${held.length}:${outs.map((o) => (o.r?.ok ? "ok" : o.r?.code ?? o.threw ?? "x")).join(",")}`);
      if (ap2.status !== "DONE" && held.length > 0) { breach++; breachId = held[0].id; }
    }
    let after: any = null;
    if (breachId) {
      const p = await SB.payServiceBill(rA, CASHIER, { heldCartId: breachId, payMethods: cash(25000), idempotencyKey: rid("k6p") });
      if (p.ok) await consume("pos.sale.paid", p.saleId);
      after = { pay: p.ok ? "ok" : p.code, apStatus: (await apRow(id)).status, bookingPaid: await evCount(`booking.paid#${id}`) };
    }
    rec("K6-a", breach === 0, "MAJOR", `ensure/finish ∥ setAppointmentStatus(CONFIRMED|CANCELLED) ${trials} รอบ ⇒ ต้องไม่มีนัดที่ออกจาก DONE แต่มีบิล HELD (เงินค้าง/จ่ายได้บนงานที่ไม่ DONE)`, { breach, trials, seen: seen.slice(-8), after });
    // จ่าย ∥ ออกจาก DONE (บิล HELD อยู่แล้ว)
    const id2 = await bookInService(cA, ids.CUT, ids.boy, ds, 720);
    const f2 = await FN.finishJob(cBoy, id2, { now: at(ds, 760) });
    const outs = await fan("k6b", [
      [{ op: "pay", a: [rA, CASHIER, f2.heldCartId, cash(25000), rid("k6b")] }],
      [{ op: "setStatus", a: [ids.tA, ids.uA, id2, "CANCELLED"] }],
      [{ op: "setStatus", a: [ids.tA, ids.uA, id2, "CONFIRMED"], delayMs: 20 }],
    ]);
    const ap2 = await apRow(id2);
    rec("K6-b", ap2.status === "DONE" && badOf(outs).length === 0, "MAJOR", "จ่าย ∥ ออกจาก DONE (บิล HELD อยู่ก่อน) ⇒ นัดคง DONE", { status: ap2.status, sales: (await salesOf(id2)).length, codes: outs.map((o) => `${o.op}:${o.r?.ok ? "ok" : o.r?.code ?? o.threw}`) });
  });

  // ═══════════ K7 สิทธิ์ · ข้ามร้าน/สาขา ═══════════
  console.log("\n── K7: สิทธิ์สด · ข้ามร้าน/สาขา ──");
  await step("K7", async () => {
    const ds = dd(17);
    const idE = await bookInService(cA, ids.CUT, ids.ek, ds, 600);
    const fE = await FN.finishJob(cA, idE, { now: at(ds, 640) });
    const idB = await bookInService(cBoy, ids.CUT, ids.boy, ds, 600);
    const A = FN.authorizeServiceBillOp;
    const exp: [string, any, string, string, string, boolean][] = [
      ["เอกยกเลิกบิลงานตัวเอง (ไม่มี runAny)", cA, ids.uEk, "cancel", idE, false],
      ["เอกแก้บิลงานบอย", cA, ids.uEk, "amend", idB, false],
      ["เอกกดเสร็จงานบอย", cA, ids.uEk, "finish", idB, false],
      ["บอยยกเลิกบิลงานเอก", cA, ids.uBoy, "cancel", idE, false],
      ["แคชเชียร์กดเสร็จ/แก้", cA, ids.uCash, "amend", idE, false],
      ["เจ้าของร้าน B ใน ctx ร้าน A", cA, ids.uOwnerB, "cancel", idE, false],
      ["ผู้จัดการ uA ยกเลิก", cA, ids.uMgr, "cancel", idE, true],
      ["เอกแก้งานตัวเอง", cA, ids.uEk, "amend", idE, true],
    ];
    const bad: string[] = [];
    for (const [n, ctx, u, op, id, want] of exp) { const r = await A(ctx, u, op, id); if (r.ok !== want) bad.push(`${n}⇒${J(r).slice(0, 60)}`); }
    // ctx ร้าน/สาขาอื่น
    for (const [n, ctx] of [["ctx ร้าน B", cB], ["ctx สาขา L", cL], ["ctx สาขา S", cS]] as const) {
      const r = await A(ctx, ids.uOwner, "cancel", idE);
      if (r.ok || r.code !== "NOT_FOUND") bad.push(`${n} auth⇒${J(r).slice(0, 60)}`);
      for (const [op, fn] of [["finish", () => FN.finishJob(ctx, idE, {})], ["ensure", () => FN.ensureServiceBill(ctx, idE)], ["amend", () => FN.amendServiceBill(ctx, idE, { extras: [] })], ["cancel", () => FN.cancelServiceBill(ctx, idE, { reason: "x" })], ["markPaid", () => FN.markPaidWithoutPos(ctx, idE)]] as const) {
        const r2 = await fn();
        if (r2.ok || r2.code !== "NOT_FOUND") bad.push(`${n} ${op}⇒${J(r2).slice(0, 60)}`);
      }
      if ((await FN.previewServiceBill(ctx, idE)) !== null) bad.push(`${n} preview ไม่ null`);
    }
    // facade ตรงข้ามขอบเขต
    const fx = [
      await SB.replaceServiceBillLines({ tenantId: ids.tB, unitId: ids.uB, appointmentId: idE, lines: [{ kind: "SERVICE", name: "x", qty: 1, unitPriceSatang: 1, productId: null, serviceId: null, performerEmployeeId: null, commissionBp: null }] }),
      await SB.discardServiceBill({ tenantId: ids.tA, unitId: ids.uL, appointmentId: idE, actorUserId: ids.uOwner, reason: "x" }),
    ];
    if (fx.some((r: any) => r.ok)) bad.push(`facade ข้ามขอบเขต⇒${J(fx)}`);
    if ((await SB.serviceBillStatus(ids.tB, ids.uA, idE)) !== null) bad.push("serviceBillStatus ร้าน B เห็น");
    // หน้าขายข้ามร้าน/สาขา/ระบบ
    const regs: [string, any, any][] = [
      ["rB ร้าน B", rB, OWNER_B_REG], ["rL สาขา L ระบบเดียวกัน", rL, CASHIER], ["ร้าน A + ระบบ posB", { ...rA, systemId: ids.posB }, OWNER_REG],
      ["ร้าน B + ระบบ posA + uA", { ...rA, tenantId: ids.tB }, OWNER_B_REG], ["สาขา uN (ไม่ผูก POS)", { ...rA, unitId: ids.uN }, OWNER_REG],
    ];
    for (const [n, rc, ac] of regs) {
      const v = await SB.serviceBillView(rc, ac, { heldCartId: fE.heldCartId });
      const p = await SB.payServiceBill(rc, ac, { heldCartId: fE.heldCartId, payMethods: cash(25000), idempotencyKey: rid("x") });
      const l = await SB.listServiceBills(rc, ac);
      if (v.ok || p.ok || (l.ok && l.items.some((i: any) => i.heldCartId === fE.heldCartId))) bad.push(`${n}⇒view ${v.ok} pay ${p.ok ? "OK!" : p.code}`);
    }
    rec("K7-a", bad.length === 0 && (await salesOf(idE)).length === 0 && (await cartsOf(idE)).filter((c: any) => c.status === "HELD").length === 1, "CRITICAL", "ช่าง A แตะบิลช่าง B · ร้าน/สาขา/ระบบอื่น ⇒ FORBIDDEN/NOT_FOUND · ไม่มีอะไรเปลี่ยน", bad.join(" · "));
    // ถอนสิทธิ์มีผลทันที
    const steps: string[] = [];
    const chk = async (n: string, want: boolean) => { const r = await A(cA, ids.uEk, "amend", idE); steps.push(`${n}:${r.ok}`); if (r.ok !== want) bad.push(`ถอนสิทธิ์ ${n}⇒${r.ok}`); };
    try {
      await chk("ก่อน", true);
      await q(`UPDATE "Membership" SET "unitAccess" = $3::jsonb WHERE "userId" = $1 AND "tenantId" = $2`, [ids.uEk, ids.tA, JSON.stringify([ids.uN])]); await chk("ย้ายสาขา", false);
      await q(`UPDATE "Membership" SET "unitAccess" = $3::jsonb WHERE "userId" = $1 AND "tenantId" = $2`, [ids.uEk, ids.tA, JSON.stringify([ids.uA])]); await chk("คืนสาขา", true);
      await q(`UPDATE "Membership" SET role = 'VIEWER' WHERE "userId" = $1 AND "tenantId" = $2`, [ids.uEk, ids.tA]).catch(async () => { await q(`UPDATE "Membership" SET permissions = '{}'::jsonb WHERE "userId" = $1 AND "tenantId" = $2`, [ids.uEk, ids.tA]); });
      await chk("ลดบทบาท/ถอดสิทธิ์", false);
      await q(`UPDATE "Membership" SET role = 'STAFF', permissions = $3::jsonb WHERE "userId" = $1 AND "tenantId" = $2`, [ids.uEk, ids.tA, JSON.stringify({ "booking.job.run": true })]); await chk("คืน", true);
      await q(`UPDATE "HrEmployee" SET "linkedUserId" = NULL WHERE id = $1`, [ids.empEk]); await chk("ตัดผูกพนักงาน↔ผู้ใช้", false);
      await q(`UPDATE "HrEmployee" SET "linkedUserId" = $2 WHERE id = $1`, [ids.empEk, ids.uEk]);
      await q(`DELETE FROM "Membership" WHERE "userId" = $1 AND "tenantId" = $2`, [ids.uEk, ids.tA]); await chk("ลบสมาชิก", false);
    } finally {
      await q(`DELETE FROM "Membership" WHERE "userId" = $1 AND "tenantId" = $2`, [ids.uEk, ids.tA]);
      await insertRow("Membership", { id: rid("mb"), userId: ids.uEk, tenantId: ids.tA, role: "STAFF", unitAccess: JSON.stringify([ids.uA]), permissions: JSON.stringify({ "booking.job.run": true }), acceptedAt: new Date(), updatedAt: new Date() });
      await q(`UPDATE "HrEmployee" SET "linkedUserId" = $2 WHERE id = $1`, [ids.empEk, ids.uEk]);
    }
    rec("K7-b", !bad.some((b) => b.startsWith("ถอนสิทธิ์")), "CRITICAL", "ถอนสิทธิ์ (ย้ายสาขา/ลดบทบาท/ตัดผูก/ลบสมาชิก) มีผลทันที", steps.join(" · "));
  });

  // ═══════════ K8 ทางเดิม _fallback + สลับแม่แบบ ═══════════
  console.log("\n── K8: สาขาเดิม (_fallback) · สลับแม่แบบหลังบิล CASH เดิม ──");
  await step("K8", async () => {
    const ds = dd(18);
    // (a) สาขาเดิม: finishJob ⇒ legacy · ไม่มีบิลพัก · ไม่มี booking.paid · บิล CASH booking-sale เดิม ⇒ ค่าคอมฯ ทางผู้ขายเดิม (ไม่มี employeeId)
    const r0 = await BK.bookAppointment(cL, { serviceId: ids.CUTL, staffId: ids.ll, dateStr: ds, startMin: 600, channel: "STAFF", customerName: "คุณเดิม", customerPhone: newPhone(), idempotencyKey: rid("i") });
    if (!r0.ok) throw new Error(`book L ${J(r0)}`);
    if (r0.status === "PENDING") await BK.setAppointmentStatus(ids.tA, ids.uL, r0.id, "CONFIRMED");
    const st = await BK.setAppointmentStatus(ids.tA, ids.uL, r0.id, "DONE");
    const e = await FN.ensureServiceBill(cL, r0.id);
    const legacySale = await POS.createSale({ tenantId: ids.tA, unitId: ids.uL, systemId: ids.posA, sourceModule: "BOOKING", sourceId: r0.id, idempotencyKey: `booking-sale-${r0.id}`, lines: [{ name: "ตัดผม", qty: 1, unitPriceSatang: 25000, serviceId: ids.CUTL }], payMethods: cash(25000) });
    await consume("pos.sale.paid", legacySale.saleId);
    const cl = await commOf(legacySale.saleId);
    const ln = await linesOf(legacySale.saleId);
    rec("K8-a", st.ok && e.ok && e.legacy === true && e.heldCartId === null && (await cartsOf(r0.id)).length === 0 && (await evCount(`booking.paid#${r0.id}`)) === 0 && ln.every((l: any) => l.performerEmployeeId === null) && cl.every((x: any) => x.employeeId === null), "CRITICAL",
      "สาขาเดิม: ensure ⇒ legacy · ไม่มีบิลพัก · บิล CASH booking-sale เดิม ⇒ ไม่มี booking.paid · บรรทัด/ค่าคอมฯ ไม่มี employeeId (ทางเดิม)", { ensure: e, comm: cl.map((x: any) => [x.kind, x.userId, x.amountSatang]) });
    // (b) สาขา S: ทางเดิมขายไปแล้ว (booking-sale CASH) → เจ้าของเลือกแม่แบบ BARBER → กดเสร็จ/ensure ซ้ำ ⇒ ต้องไม่เปิดบิลจากคิวเก็บเงินซ้ำ
    const r1 = await BK.bookAppointment(cS, { serviceId: ids.CUTS, staffId: ids.ss, dateStr: ds, startMin: 600, channel: "STAFF", customerName: "คุณสลับ", customerPhone: newPhone(), idempotencyKey: rid("i") });
    if (!r1.ok) throw new Error(`book S ${J(r1)}`);
    if (r1.status === "PENDING") await BK.setAppointmentStatus(ids.tA, ids.uS, r1.id, "CONFIRMED");
    await BK.setAppointmentStatus(ids.tA, ids.uS, r1.id, "DONE");
    const e1 = await FN.ensureServiceBill(cS, r1.id);
    if (e1.ok && e1.legacy) await POS.createSale({ tenantId: ids.tA, unitId: ids.uS, systemId: ids.posA, sourceModule: "BOOKING", sourceId: r1.id, idempotencyKey: `booking-sale-${r1.id}`, lines: [{ name: "ตัดผม", qty: 1, unitPriceSatang: 25000, serviceId: ids.CUTS }], payMethods: cash(25000) });
    const ap = await SET.applyTemplate(OWNER, { tenantId: ids.tA }, { unitId: ids.uS, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
    const e2 = await FN.finishJob(cS, r1.id, {});
    const pv = await FN.previewServiceBill(cS, r1.id);
    let paid2: any = null;
    if (e2.ok && e2.heldCartId) {
      const p = await SB.payServiceBill({ tenantId: ids.tA, systemId: ids.posA, unitId: ids.uS, deviceId: DEV1 }, CASHIER, { heldCartId: e2.heldCartId, payMethods: cash(pv?.dueSatang ?? 25000), idempotencyKey: rid("k8") });
      paid2 = p.ok ? "ok" : p.code;
    }
    const sales = await salesOf(r1.id);
    rec("K8-b", sales.length <= 1 && !(e2.ok && e2.heldCartId), "MAJOR", "สาขาที่ขายทางเดิม (booking-sale CASH) แล้วเลือกแม่แบบ ⇒ กดเสร็จ/ensure ซ้ำต้องไม่เปิดบิลจากคิวเก็บเงินนัดเดิมซ้ำ",
      { applyTemplate: ap.ok, finishAfterSwitch: e2, previewDue: pv?.dueSatang, payAgain: paid2, bookingSales: sales.map((s: any) => [s.idempotencyKey.slice(0, 13), s.grandTotalSatang]) });
  });
  await step("K8c", async () => {
    const r = await SET.applyTemplate(OWNER, { tenantId: ids.tA }, { unitId: ids.uS, domain: "booking", templateKey: "_fallback", overwrite: "RESET_ALL" });
    rec("K8-c", !r.ok, "MINOR", "ทางกลับ (V2 → _fallback) ทำผ่าน applyTemplate ไม่ได้ ⇒ บิล bq-sale แล้วกลับไปออก booking-sale ซ้ำไม่มีทางเกิดจาก UI", { applyFallback: r.ok ? "ok!" : r.code });
  });

  // ═══════════ K9 สต็อก/COGS ของสินค้าในบิลจากคิว ═══════════
  console.log("\n── K9: สินค้านับสต็อกในบิลจากคิว ⇒ บรรทัดบิลมี itemId (ตัดสต็อก/COGS) ไหม ──");
  await step("K9", async () => {
    const ds = dd(19);
    const id = await bookInService(cA, ids.CUT, ids.ek, ds, 600);
    const f = await FN.finishJob(cA, id, { extras: [{ kind: "PRODUCT", productId: ids.WAXI, qty: 2 }], now: at(ds, 640) });
    if (!f.ok) throw new Error(`finish ${J(f)}`);
    const p = await SB.payServiceBill(rA, CASHIER, { heldCartId: f.heldCartId, payMethods: cash(25000 + 58000), idempotencyKey: rid("k9") });
    if (!p.ok) throw new Error(`pay ${J(p)}`);
    const ln = await q(`SELECT name, "productId", "itemId", qty FROM "PosSaleLine" WHERE "saleId" = $1 AND "productId" = $2`, [p.saleId, ids.WAXI]);
    rec("K9", ln.length === 1 && ln[0].itemId === T("inv"), "MAJOR", "สินค้าผูกคลัง (trackStock + invItemId) ในบิลจากคิว ⇒ PosSaleLine.itemId = invItemId (หน้าขายปกติตัดสต็อก+COGS ทางนี้) — ไม่มี = สต็อกไม่ลด/COGS ไม่ลง", { line: ln });
  });

  // ═══════════ K10 POS ปิดใช้แต่ยังลิงก์สาขา ═══════════
  console.log("\n── K10: AppSystem POS active=false แต่ยังผูกสาขา ⇒ กดเสร็จได้ไหม ──");
  await step("K10", async () => {
    const ds = dd(20);
    const cP = { tenantId: ids.tA, unitId: ids.uP, actorUserId: ids.uOwner };
    const id = await bookInService(cP, ids.CUTP, ids.pp, ds, 600);
    const f = await FN.finishJob(cP, id, { now: at(ds, 640) });
    const c = await LN.completeJob(cP, id, { now: at(ds, 641) });
    const ap = await apRow(id);
    const mp = ap.status === "DONE" ? await FN.markPaidWithoutPos(cP, id) : null;
    const pv = await FN.previewServiceBill(cP, id);
    rec("K10", ap.status === "DONE" && (!!mp?.ok || (f.ok && !!f.heldCartId)), "MAJOR", "POS ปิดใช้ (active=false) แต่ลิงก์สาขาค้าง ⇒ ช่างยังจบงานได้ และมีทางรับเงิน (บิลจากคิว หรือ 'รับเงินแล้ว')",
      { finishJob: f, completeJob: c, status: ap.status, markPaid: mp, previewPos: pv?.pos });
  });
} catch (e) {
  rec("FATAL", false, "ERR", "probe ล้ม", errMsg(e));
} finally {
  for (const f of goFiles) { try { unlinkSync(f); } catch { /* */ } }
  try { await cleanup(TIDS); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  const left = (await q(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n;
  console.log(`\n(ล้างข้อมูลแล้ว · ร้านค้าง ${left})`);
  const br = results.filter((r) => !r.ok);
  console.log(`\n══ สรุป: ${results.length - br.length} HOLD · ${br.length} BREACH/ERR ══`);
  for (const r of br) console.log(`  ❌ [${r.id}] (${r.sev}) ${r.what} — ${r.detail.slice(0, 600)}`);
  await pool.end();
  try { await prisma.$disconnect(); } catch { /* */ }
  process.exit(0);
}

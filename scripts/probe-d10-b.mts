// PROBE — SVC D.10 reviewer B (โจมตีด้วยหลายโพรเซส) · ไม่ใช่ข้อสอบ · ไม่แก้ src · ไม่ส่งข้อความจริง (หน่วยทดสอบไม่มี OA · fetch นอกเครื่องถูกบล็อก)
// รัน: cd /root/projects/shark-svc-l2 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d10-b.mts
// ข้อมูลใต้ร้าน `qc-svc-d10pb-*` + ผู้ใช้ `svc-d10pb-*@shark.local` · ล้างใน finally ทุกครั้ง · ไม่แตะร้าน svc-qc / ค่าตั้งระดับร้าน
// หมวด: SA consumer ซ้ำ · SB ตัดสินผสม · SC สองสลิป · SD แข่งเงินสด · SE บางส่วน/เกิน · SG ใบลด/เพิ่มหนี้แข่ง · SV VOID แข่ง · SR ยกเลิกใบเสร็จแข่ง
//       SN เลขใบเสร็จ · SP หลังจ่ายครบ · SO outbox consumer · BZ 40P01 ฉีด · KL SIGKILL กลางทาง · XT ข้ามร้าน/ข้ามหน่วย · INV ค่าคงที่เงินหลังทุกฉาก
/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const PAY_REL = "src/lib/platform/dorm-pay.ts";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x) ?? String(x); } catch { return String(x); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// ── ด่านฐาน (QC เท่านั้น) ──
for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
  const u = process.env[n] ?? "";
  let hn = "";
  try { hn = new URL(u).hostname; } catch { /* */ }
  if (!hn.includes("ep-mute-scene")) { console.error(`🔴 probe: ${n} ไม่ใช่ฐาน qc-svc — หยุด`); process.exit(4); }
}
if (process.env.APP_ENV === "production" || process.env.CI) { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }
process.env.APP_URL = "https://qc-d10pb.invalid";
process.env.LINE_API_BASE = "http://127.0.0.1:9";
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

type Call = { m: "pay" | "acc" | "asv" | "slip" | "oc" | "dorm" | "raw"; op: string; args: any[] };
type Fault = { fn: string; mode: "fail" | "killAfter"; n: number };
type Job = { calls: Call[]; fault?: Fault };

// ═══════════ โหมดลูก ═══════════
const CA = process.argv.indexOf("--child");
if (CA >= 0) {
  const job = JSON.parse(Buffer.from(process.argv[CA + 1] ?? "", "base64url").toString("utf8")) as Job & { at: number };
  let out: unknown[] = [];
  let hits = 0;
  try {
    const { prisma } = (await import("@/lib/core/db" as string)) as any;
    const f = job.fault;
    if (f) {
      const orig = prisma.$transaction.bind(prisma);
      prisma.$transaction = async (...a: any[]) => {
        const stk = new Error().stack ?? "";
        if (!stk.includes(f.fn)) return orig(...a);
        const h = ++hits;
        if (f.mode === "fail" && h <= f.n) { const e: any = new Error("deadlock detected (probe-injected 40P01)"); e.code = "40P01"; throw e; }
        const r = await orig(...a);
        if (f.mode === "killAfter" && h === f.n) { process.kill(process.pid, "SIGKILL"); await new Promise(() => { /* ตาย */ }); }
        return r;
      };
    }
    const mods: Record<string, any> = {
      pay: await import(pathToFileURL(join(ROOT, PAY_REL)).href),
      acc: await import("@/lib/modules/account" as string),
      asv: await import("@/lib/modules/account/service" as string),
      slip: await import("@/lib/payment/slip-verify" as string),
      oc: (await import("@/lib/outbox-consumers" as string)).consumers,
      dorm: await import("@/lib/modules/dorm" as string),
      raw: {
        // ยกเลิกใบแจ้งหนี้ (บัญชี) แล้วพลิกบิลเป็น VOID เมื่อสำเร็จ
        voidBill: async (tenantId: string, systemId: string, billId: string, invoiceId: string) => {
          const r = await mods.asv.voidDocument(tenantId, systemId, invoiceId, "probe ยกเลิกใบแจ้งหนี้แข่งรับเงิน");
          if (r?.ok) await prisma.dormBill.updateMany({ where: { tenantId, id: billId }, data: { status: "VOID" } });
          return r;
        },
        flipVoid: async (tenantId: string, billId: string) => (await prisma.dormBill.updateMany({ where: { tenantId, id: billId }, data: { status: "VOID" } })).count,
      },
    };
    const wait = job.at - Date.now();
    if (wait > 0) await sleep(wait);
    out = await Promise.all(job.calls.map(async (c) => {
      const t0 = Date.now();
      try {
        const fn = c.m === "oc" ? mods.oc[c.op] : mods[c.m][c.op];
        const r = await fn(...c.args);
        return { op: c.op, r: r === undefined ? "done" : r, ms: Date.now() - t0 };
      } catch (e) { return { op: c.op, threw: errMsg(e), ms: Date.now() - t0 }; }
    }));
  } catch (e) { out = [{ childFail: errMsg(e) }]; }
  console.log(`CHILD_RESULT ${JSON.stringify({ out, hits })}`);
  try { const { prisma } = (await import("@/lib/core/db" as string)) as any; await prisma.$disconnect(); } catch { /* */ }
  process.exit(0);
}

{
  const { appendFileSync } = await import("node:fs");
  const LOG = `/tmp/svc-d10b-probe.out.${process.pid}.log`;
  process.stdout.on("error", () => { /* */ });
  const orig = console.log.bind(console);
  console.log = (...a: unknown[]) => { try { appendFileSync(LOG, `${a.map((x) => (typeof x === "string" ? x : J(x))).join(" ")}\n`); } catch { /* */ } try { orig(...a); } catch { /* */ } };
  console.log(`(probe log: ${LOG} · start ${new Date().toISOString()})`);
}

type ChildOut = { out: any[]; hits: number; exit: string };
const ALL_OUT: any[] = [];
async function procs(jobs: Job[], leadMs = 14_000): Promise<ChildOut[]> {
  const at = Date.now() + leadMs;
  const res = await Promise.all(jobs.map((job) => new Promise<ChildOut>((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify({ ...job, at })).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code, sig) => {
      const m = /CHILD_RESULT (\{.*\})/.exec(buf);
      let o: ChildOut = { out: [], hits: 0, exit: `${code ?? ""}${sig ? `:${sig}` : ""}` };
      try { if (m) { const p = JSON.parse(m[1]); o = { out: p.out, hits: p.hits, exit: o.exit }; } else o.out = [{ childFail: `exit=${o.exit} ${buf.split("\n").slice(-3).join(" | ").slice(0, 200)}` }]; } catch { o.out = [{ childFail: "parse" }]; }
      resolve(o);
    });
  })));
  for (const r of res) if (!r.exit.includes("SIGKILL")) ALL_OUT.push(...r.out);
  return res;
}
const flat = (rs: ChildOut[]) => rs.flatMap((r) => r.out);

type F = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: F[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown) => {
  results.push({ id, ok, sev, what, detail: typeof detail === "string" ? detail : J(detail) });
  console.log(`  ${ok ? "✅ HOLD" : "❌ BREACH"} [${id}] (${sev}) ${what}${` — ${typeof detail === "string" ? detail : J(detail)}`.slice(0, 2600)}`);
};
const RETRY_RX = /\[dorm\.pay\]/;
const BADRX = /P2028|P2024|P2002|P2034|40P01|deadlock|timed out|Unable to start a transaction|Transaction already closed|Unique constraint/i;
/** ผิดปกติจริง (ไม่นับ throw สัญญาณลองใหม่ของ consumer ตาม §3.4) */
const hardOf = (rs: any[]) => rs.filter((x) => x?.childFail || (x?.threw && !RETRY_RX.test(x.threw)) || x?.r?.code === "FAILED" || x?.r?.code === "INTERNAL" || BADRX.test(J(x?.r ?? x?.threw ?? "")));
const retryOf = (rs: any[]) => rs.filter((x) => x?.threw && RETRY_RX.test(x.threw));
const codeOf = (x: any) => (x?.childFail ? "CHILDFAIL" : x?.threw ? (RETRY_RX.test(x.threw) ? "THREW-RETRY" : "THREW") : x?.r === null ? "null" : x?.r === "done" ? "done" : x?.r?.ok === true ? "OK" : x?.r?.code ?? J(x?.r).slice(0, 40));
const tally = (rs: any[]) => { const t: Record<string, number> = {}; for (const x of rs) { const k = `${x?.op}:${codeOf(x)}`; t[k] = (t[k] ?? 0) + 1; } return t; };

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const PAY: any = await import(pathToFileURL(join(ROOT, PAY_REL)).href);
const DORM: any = await import("@/lib/modules/dorm" as string);
const ACC: any = await import("@/lib/modules/account" as string);
const SYS: any = await import("@/lib/modules/system/service" as string);
const ASV: any = await import("@/lib/modules/account/service" as string);
const GL: any = await import("@/lib/modules/account/gl" as string);
const SET: any = await import("@/lib/core/settings" as string);
const SLIP: any = await import("@/lib/payment/slip-verify" as string);
const OC: any = (await import("@/lib/outbox-consumers" as string)).consumers;
const PRISMA_NS: any = (await import("@prisma/client" as string)).Prisma;

const P1 = "2026-10";
const NOW1 = "2026-09-25T03:00:00.000Z";
const RENT = 450_000, COMMON = 30_000, BASE = RENT + COMMON;
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

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
const parkOutbox = async (tids: string[]) => { await prisma.$executeRawUnsafe(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, tids); };

const tenantIds: string[] = [];
let exitCode = 0;
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d10pb-" } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: { id: string }) => t.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d10pb-" } } });

  // ═══════════ fixtures (แบบข้อสอบ d.10) ═══════════
  const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `PB D10 ${tag}`, slug: `qc-svc-d10pb-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  const mkBook = async (tenantId: string, name: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: false });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const setVal = async (tenantId: string, key: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "pb-d10" } });
  };
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = []) => {
    const u = await prisma.user.create({ data: { email: `svc-d10pb-${STAMP}-${key}@shark.local`, name: `PB10 ${key}` } });
    await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: new Date() } });
    return u.id as string;
  };
  let phoneN = 0;
  const RUNNUM = 10 + Math.floor(Math.random() * 80);
  const newPhone = () => `08${String(RUNNUM * 1_000_000 + ++phoneN).padStart(8, "0").slice(-8)}`;
  type Lease = { leaseId: string; partyId: string; roomId: string };
  const dormUnit = async (tenantId: string, tag: string, book: string, rooms: string[]) => {
    const u = (await prisma.businessUnit.create({ data: { tenantId, type: "DORM", name: `หอ PB10 ${tag}`, slug: `pb10${tag}-${STAMP}` } })).id as string;
    await prisma.accountSystemLink.create({ data: { tenantId, systemId: book, linkedKind: "BUSINESS", linkedId: u, enabled: true } });
    await setVal(tenantId, "rooms.utility.elec.metering", u, "NONE");
    await setVal(tenantId, "rooms.utility.water.metering", u, "NONE");
    await setVal(tenantId, "messaging.quietHours", u, null);
    await setVal(tenantId, "rooms.lateFee.autoCharge", u, false);
    await setVal(tenantId, "payments.receiver", u, { promptpayId: "0812345678", displayName: "หอทดสอบ" });
    const ty = (await prisma.hotelRoomType.create({ data: { tenantId, unitId: u, name: "มาตรฐาน", capacity: 2, baseRateSatang: RENT, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id;
    const bld = (await prisma.roomBuilding.create({ data: { tenantId, unitId: u, name: `อาคาร ${tag}`, floors: 3, sortOrder: 1 } })).id;
    const L: Record<string, Lease> = {};
    for (const no of rooms) {
      const roomId = (await prisma.hotelRoom.create({ data: { tenantId, unitId: u, roomTypeId: ty, number: no, buildingId: bld, floorNo: 1, floor: "1" } })).id;
      const party = await prisma.party.create({ data: { tenantId, name: `ผู้เช่า${no} ทดสอบ`, phone: newPhone() } });
      const snap = await SET.snapshotPolicy({ tenantId }, "lease", { unitId: u, roomTypeId: ty, roomId });
      const l = await prisma.dormLease.create({ data: {
        tenantId, unitId: u, roomId, partyId: party.id, status: "ACTIVE", startDate: dbDate("2026-01-01"), endDate: dbDate("2027-12-31"),
        rentSatang: RENT, commonFeeSatang: COMMON, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0,
        coTenants: { occupants: [], vehicles: [] }, policySnapshot: snap, signedAt: new Date(), createdById: "pb-d10",
      } });
      const oc = await prisma.roomOccupancy.create({ data: { tenantId, unitId: u, roomId, startDate: dbDate("2026-01-01"), endDate: dbDate("2028-01-01"), kind: "LEASE", refType: "DormLease", refId: l.id } });
      await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
      L[no] = { leaseId: l.id, partyId: party.id, roomId };
    }
    return { u, L };
  };
  const BOOK_A = await mkBook(A, `บัญชีหอ PB10 A ${STAMP}`), BOOK_B = await mkBook(B, `บัญชีหอ PB10 B ${STAMP}`);
  const ROOMS = Array.from({ length: 34 }, (_, i) => String(101 + i));
  const UA = await dormUnit(A, "a", BOOK_A, ROOMS);
  const UX = await dormUnit(A, "x", BOOK_A, ["901", "902"]);
  const UB = await dormUnit(B, "b", BOOK_B, ["501"]);
  const DA = UA.u, DX = UX.u, DB = UB.u;
  const OWN = await mkUser("owner", A, "OWNER", ["*"]);
  const OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
  const REV = await mkUser("rev", A, "STAFF", [DA], ["dorm.view", "dorm.slip.review"]);
  const REVX = await mkUser("revx", A, "STAFF", [DX], ["dorm.view", "dorm.slip.review", "dorm.payment.manual"]);
  const CASH = await mkUser("cash", A, "STAFF", [DA], ["dorm.view", "dorm.payment.manual"]);
  const cO = { tenantId: A, actorUserId: OWN }, cOB = { tenantId: B, actorUserId: OWNB }, cR = { tenantId: A, actorUserId: REV }, cRX = { tenantId: A, actorUserId: REVX }, cC = { tenantId: A, actorUserId: CASH };

  const sendAll = async (ctx: any, unitId: string, runId: string) => {
    let last: any = null;
    for (let i = 0; i < 60; i++) { last = await DORM.sendBillRun(ctx, { unitId, runId }, { now: new Date(NOW1) }); if (!last?.ok || last.done) break; if (last.sent === 0) await sleep(1_000); }
    return last;
  };
  const runP = async (ctx: any, unitId: string) => {
    const r = await DORM.prepareBillRun(ctx, { unitId, periodKey: P1 }, { now: new Date(NOW1) });
    const s = r?.ok ? await sendAll(ctx, unitId, r.runId) : null;
    return { r: r?.ok ? "ok" : r?.code, s: s?.done ?? s?.code ?? null };
  };
  const runs = [await runP(cO, DA), await runP(cO, DX), await runP(cOB, DB)];
  await parkOutbox(tenantIds);
  const billOf = async (lease: Lease): Promise<any> => prisma.dormBill.findFirst({ where: { leaseId: lease.leaseId, periodKey: P1 } });
  const bills: Record<string, any> = {};
  for (const no of ROOMS) bills[no] = await billOf(UA.L[no]);
  bills.X1 = await billOf(UX.L["901"]); bills.X2 = await billOf(UX.L["902"]);
  bills.B1 = await billOf(UB.L["501"]);
  const notReady = Object.entries(bills).filter(([, b]) => !b || !["SENT", "PARTIALLY_PAID", "PAID"].includes(b.status) || !b.accountDocumentId || b.totalSatang !== BASE).map(([k]) => k);
  rec("FX-1", !notReady.length, "BLOCKER", `ฉากเงิน D.8: บิล ${P1} ${ROOMS.length + 3} ใบ (ร้าน A หน่วย a/x · ร้าน B) ส่งแล้ว มีใบแจ้งหนี้ ฿4,800.00`, { runs, notReady });
  if (notReady.length) throw new Error("ฉากไม่พร้อม");
  const bl = (k: string) => bills[k];
  const fresh = async (k: string) => (bills[k] = await prisma.dormBill.findFirst({ where: { id: bl(k).id } }));

  // ── สลิป/เหตุการณ์ ──
  let slipN = 0;
  const mkFile = async (tenantId: string) => (await prisma.fileAsset.create({ data: { tenantId, kind: "ATTACHMENT", path: `t/${tenantId}/private/pb-d10-${randomBytes(6).toString("hex")}.png`, cdnUrl: "private://pb-d10", contentType: "image/png", bytes: 64 } })).id as string;
  const mkSlip = async (b: any, o: { amount: number | null; status?: string; expected?: number; domain?: string; refType?: string; tenantId?: string }) => {
    const n = ++slipN;
    const tenantId = o.tenantId ?? b.tenantId;
    return prisma.paymentSlip.create({ data: {
      tenantId, unitId: b.unitId, domain: o.domain ?? "DORM", refType: o.refType ?? "DORM_BILL", refId: b.id, partyId: b.partyId, fileId: await mkFile(tenantId),
      imageHash: sha(`pb-d10-${STAMP}-img-${n}`), transRef: `PBD10${STAMP.toUpperCase()}T${n}`, expectedSatang: o.expected ?? BASE, amountSatang: o.amount, payerName: "ผู้โ***", bankCode: "004",
      transferredAt: new Date(Date.now() - 3_600_000), checks: { idempotencyKey: `pbd10-${STAMP}-${n}` }, status: o.status ?? "NEEDS_REVIEW", reviewReason: null,
    } });
  };
  const evtOf = (s: any, over: Record<string, unknown> = {}) => ({
    id: `pb-d10-evt-${s.id}`, tenantId: s.tenantId, unitId: s.unitId, type: "payment.slip.approved", systemId: null,
    payload: { slipId: s.id, domain: s.domain, refType: s.refType, refId: s.refId, amountSatang: s.amountSatang ?? s.expectedSatang, status: s.status }, ...over,
  });
  const consumeUntilQuiet = async (evt: any, tries = 4): Promise<string[]> => {
    const log: string[] = [];
    for (let i = 0; i < tries; i++) {
      try { await PAY.onDormSlipApproved(evt); log.push("done"); return log; } catch (e) { log.push(`threw:${errMsg(e).slice(0, 60)}`); await sleep(1_500); }
    }
    return log;
  };
  const cashUntilQuiet = async (ctx: any, inp: any, tries = 5): Promise<any> => {
    let r: any = null;
    for (let i = 0; i < tries; i++) { r = await PAY.recordDormPayment(ctx, inp); if (r?.code !== "BUSY") return r; await sleep(1_500); }
    return r;
  };
  const cashIn = (k: string, amount: number, key: string, channel = "CASH") => ({ unitId: bl(k).unitId, billId: bl(k).id, amountSatang: amount, channel, idempotencyKey: `pbd10-${STAMP}-${key}` });
  const C = (m: Call["m"], op: string, ...args: any[]): Call => ({ m, op, args });

  // ── ตัววัดเงิน ──
  const docsOf = async (b: any) => {
    const dn = await prisma.accountDocument.findMany({ where: { tenantId: b.tenantId, sourceDocId: b.accountDocumentId, docType: "DEBIT_NOTE", status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } }, select: { id: true, grandTotal: true } });
    const inv = await prisma.accountDocument.findFirst({ where: { id: b.accountDocumentId }, select: { id: true, grandTotal: true, status: true } });
    return { inv, dn };
  };
  const paidOn = async (b: any): Promise<number> => {
    const { inv, dn } = await docsOf(b);
    const ids = [inv?.id, ...dn.map((d: any) => d.id)].filter(Boolean);
    const r = await prisma.accountDocumentPayment.aggregate({ where: { tenantId: b.tenantId, documentId: { in: ids }, voidedAt: null }, _sum: { amount: true, whtAmountSatang: true } });
    return Number(r._sum.amount ?? 0) + Number(r._sum.whtAmountSatang ?? 0);
  };
  type Rc = { id: string; docNo: string | null; status: string; grandTotal: number; refId: string | null; sourceDocId: string | null; alloc: { fromId: string; amount: number }[] };
  const receipts = async (tenantId = A): Promise<Rc[]> => (await prisma.accountDocument.findMany({
    where: { tenantId, docType: "RECEIPT", source: "DORM" },
    select: { id: true, docNo: true, status: true, grandTotal: true, refId: true, sourceDocId: true, relationsTo: { where: { type: "CONVERT" }, select: { fromId: true, amount: true } } },
    orderBy: { createdAt: "asc" },
  })).map((r: any) => ({ ...r, alloc: r.relationsTo.map((x: any) => ({ fromId: x.fromId, amount: x.amount ?? 0 })) }));
  const liveRc = (rs: Rc[]) => rs.filter((r) => r.status !== "VOIDED" && r.status !== "CANCELLED");
  const rcOfBill = async (k: string) => { const b = bl(k); const { dn } = await docsOf(b); const ids = new Set([b.accountDocumentId, ...dn.map((d: any) => d.id)]); return (await receipts()).filter((r) => r.sourceDocId === b.accountDocumentId || r.alloc.some((a) => ids.has(a.fromId))); };
  const net2110 = async (tenantId = A): Promise<number> => {
    const ls: any[] = await prisma.accountJournalLine.findMany({ where: { tenantId, account: { code: "2110" } }, select: { debit: true, credit: true } });
    return ls.reduce((s, l) => s + l.credit - l.debit, 0);
  };
  const counts = async (tenantId = A) => ({
    pay: await prisma.accountDocumentPayment.count({ where: { tenantId } }),
    je: await prisma.accountJournalEntry.count({ where: { tenantId } }),
    jl: await prisma.accountJournalLine.count({ where: { tenantId } }),
    doc: await prisma.accountDocument.count({ where: { tenantId } }),
    rel: await prisma.accountDocumentRelation.count({ where: { tenantId } }),
  });
  const billEvents = async (billId: string) => prisma.outboxEvent.findMany({ where: { tenantId: A, type: { in: ["dorm.bill.paid", "dorm.bill.partially_paid"] }, payload: { path: ["billId"], equals: billId } }, select: { type: true, idempotencyKey: true } });
  const holdOf = async (slipId: string) => { const s = await prisma.paymentSlip.findFirst({ where: { id: slipId }, select: { status: true, checks: true } }); return { status: s?.status, hold: (s?.checks as any)?.dormHold ?? null }; };

  let lastCounts = await counts();
  /** ค่าคงที่เงินหลังทุกฉาก (ทั้งร้าน A + บิลของฉาก) */
  const invariants = async (tag: string, keys: string[], opt: { skipStatus?: string[]; skipReceiptMatch?: string[] } = {}) => {
    const bad: string[] = [];
    const ub: { e: string; d: bigint | number }[] = await prisma.$queryRawUnsafe(`SELECT "entryId" AS e, SUM(debit) - SUM(credit) AS d FROM "AccountJournalLine" WHERE "tenantId" = $1 GROUP BY 1 HAVING SUM(debit) <> SUM(credit)`, A);
    if (ub.length) bad.push(`JV ไม่สมดุล ${ub.length}`);
    const rs = await receipts();
    const live = liveRc(rs);
    const credit = live.reduce((s, r) => s + r.grandTotal - r.alloc.reduce((a, x) => a + x.amount, 0), 0);
    const n2110 = await net2110();
    if (n2110 !== credit) bad.push(`2110 สุทธิ ${n2110} ≠ Σ เครดิตใบเสร็จที่มีผล ${credit}`);
    const nos = rs.map((r) => r.docNo ?? "");
    if (nos.some((n) => !n) || new Set(nos).size !== nos.length) bad.push(`เลขใบเสร็จว่าง/ซ้ำ ${J(nos)}`);
    const per = new Map<string, number>();
    for (const r of rs) if (r.refId?.startsWith("slip:")) per.set(r.refId, (per.get(r.refId) ?? 0) + 1);
    const multi = [...per].filter(([, n]) => n > 1);
    if (multi.length) bad.push(`สลิปมีใบเสร็จ >1 ${J(multi)}`);
    const onVoid: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS n FROM "AccountDocumentPayment" p JOIN "AccountDocument" d ON d."id" = p."documentId" WHERE p."tenantId" = $1 AND p."voidedAt" IS NULL AND d."status"::text IN ('VOIDED','CANCELLED')`, A);
    if (Number(onVoid[0]?.n ?? 0) > 0) bad.push(`รับชำระที่มีผลบนเอกสารที่ยกเลิก ${onVoid[0]?.n}`);
    const c = await counts();
    for (const k of Object.keys(c) as (keyof typeof c)[]) if (c[k] < lastCounts[k]) bad.push(`แถวบัญชี ${k} ลดลง ${lastCounts[k]}→${c[k]}`);
    lastCounts = c;
    const bal = await DORM.billBalances(A, keys.map((k) => bl(k).id));
    for (const k of keys) {
      const b = await fresh(k);
      const { inv, dn } = await docsOf(b);
      const ids = [inv?.id, ...dn.map((d: any) => d.id)].filter(Boolean) as string[];
      const paid = await paidOn(b);
      const cn = await prisma.accountDocument.aggregate({ where: { tenantId: A, sourceDocId: { in: ids }, docType: "CREDIT_NOTE", status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } }, _sum: { grandTotal: true } });
      const invLive = inv && !["DRAFT", "VOIDED", "CANCELLED"].includes(inv.status);
      const grand = (invLive ? inv.grandTotal : 0) + dn.reduce((s: number, d: any) => s + d.grandTotal, 0);
      const own = invLive ? Math.max(0, grand - paid - Number(cn._sum.grandTotal ?? 0)) : 0;
      const bb = bal.get(b.id);
      if (!bb || bb.ownOutstandingSatang !== own) bad.push(`${k}: billBalances.own ${bb?.ownOutstandingSatang} ≠ ใบ+ใบเพิ่ม−รับ−ใบลด ${own}`);
      if (b.paidSatang !== paid && b.status !== "VOID") bad.push(`${k}: DormBill.paidSatang ${b.paidSatang} ≠ รับชำระในบัญชี ${paid}`);
      if (!opt.skipReceiptMatch?.includes(k)) {
        const idset = new Set(ids);
        const alloc = live.reduce((s, r) => s + r.alloc.filter((a) => idset.has(a.fromId)).reduce((x, a) => x + a.amount, 0), 0);
        if (alloc !== paid) bad.push(`${k}: Σ ใบเสร็จที่มีผล (ส่วนลงบิล) ${alloc} ≠ รับชำระ ${paid}`);
      }
      if (b.status !== "VOID" && !opt.skipStatus?.includes(k)) {
        const want = own === 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "SENT";
        if (b.status !== want) bad.push(`${k}: สถานะบิล ${b.status} ต้องเป็น ${want} (own ${own} paid ${paid})`);
      }
    }
    rec(`INV-${tag}`, !bad.length, "CRITICAL", `ค่าคงที่เงินหลังฉาก ${tag}: JV สมดุล · 2110 = Σเครดิตใบเสร็จ · Σใบเสร็จ = paidSatang · billBalances = ใบ+ใบเพิ่ม−รับ−ใบลด · เลขไม่ซ้ำ · ไม่ลบแถวบัญชี · ไม่มีรับชำระบนใบยกเลิก`, bad.length ? bad : { n2110, credit, receipts: rs.length });
    await parkOutbox(tenantIds);
  };
  await invariants("FX", []);

  // ═══════════ SA consumer เหตุการณ์เดียว 4 โพรเซส × 4 ทาง (สด · ยังไม่มีใบเสร็จ) ═══════════
  console.log("\n── SA consumer ซ้ำหลายโพรเซส ──");
  {
    const k = "101";
    const s = await mkSlip(bl(k), { amount: BASE, status: "AUTO_APPROVED" });
    const n0 = await net2110();
    const rs = flat(await procs([0, 1, 2, 3].map(() => ({ calls: [0, 1, 2, 3].map(() => C("pay", "onDormSlipApproved", evtOf(s))) }))));
    const tail = await consumeUntilQuiet(evtOf(s));
    const rc = (await receipts()).filter((r) => r.refId === `slip:${s.id}`);
    const b = await fresh(k);
    rec("SA-1", !hardOf(rs).length && rc.length === 1 && (await paidOn(b)) === BASE && b.status === "PAID" && (await net2110()) === n0 && (await billEvents(b.id)).length === 1, "CRITICAL",
      "consumer 16 ทาง × 4 โพรเซส บนสลิปใหม่ ⇒ ใบเสร็จ 1 · รับชำระ = ยอดสลิป · 2110 ไม่โต · event 1 · ไม่มี P2002/throw ผิดชนิด", { tally: tally(rs), tail, receipts: rc.length, paid: await paidOn(b), status: b.status });
    const rt = retryOf(rs);
    rec("SA-2", rt.length === 0, "LOW", "§8.1 ข้อ 1 \"ไม่มี throw หลุดในทางปกติ\": การส่ง event ซ้ำพร้อมกันครั้งแรก ⇒ ผู้แพ้ claim ได้ throw สัญญาณลองใหม่ (ตาม §3.4) — ขัดกันในใบ ผู้คุมเคาะ", { retryThrows: rt.length, sample: rt[0]?.threw });
    await invariants("SA", [k]);
  }

  // ═══════════ SB ตัดสินสลิปเดียว 8 ทาง × 3 โพรเซส (APPROVE ปน PARTIAL_CARRY ปน ASK_MORE ปน REJECT) ═══════════
  console.log("\n── SB ตัดสินผสมพร้อมกัน ──");
  {
    const k = "102";
    const s = await mkSlip(bl(k), { amount: 450_000 });
    const acts = ["APPROVE", "PARTIAL_CARRY", "REJECT", "ASK_MORE", "APPROVE", "PARTIAL_CARRY", "REJECT", "APPROVE"];
    const inp = (a: string) => ({ slipId: s.id, action: a, reason: `พร้อมกัน ${a}`, ...(a === "APPROVE" ? { amountSatang: BASE } : {}) });
    const je0 = (await counts()).je, n0 = await net2110();
    const rs = flat(await procs([0, 1, 2].map(() => ({ calls: acts.map((a) => C("pay", "reviewDormSlip", cR, inp(a))) }))));
    const oks = rs.filter((x) => x?.r?.ok === true);
    const losers = rs.filter((x) => x?.r?.ok !== true);
    const st = (await prisma.paymentSlip.findFirst({ where: { id: s.id } })).status;
    const win = oks[0]?.r;
    const rc = (await receipts()).filter((r) => r.refId === `slip:${s.id}`);
    const b = await fresh(k);
    const paid = await paidOn(b);
    let consistent = false;
    if (win?.status === "REJECTED") consistent = st === "REJECTED" && rc.length === 0 && paid === 0 && (await counts()).je === je0;
    else if (win?.status === "APPROVED") consistent = st === "APPROVED" && rc.length === 1 && (paid === BASE || paid === 450_000);
    // ผลผู้ชนะ (การกระทำ) ต้องสอดคล้องกับเงินที่ลง
    await consumeUntilQuiet(evtOf(await prisma.paymentSlip.findFirst({ where: { id: s.id } })));
    const rc2 = (await receipts()).filter((r) => r.refId === `slip:${s.id}`);
    rec("SB-1", !hardOf(rs).length && oks.length === 1 && losers.every((x) => ["ALREADY_DECIDED", "BUSY"].includes(x?.r?.code)) && consistent && rc2.length === rc.length, "CRITICAL",
      "reviewDormSlip 24 ทาง × 3 โพรเซส (ผสม 4 การกระทำ) ⇒ ผู้ชนะ 1 · ผู้แพ้ ALREADY_DECIDED/BUSY · สถานะสลิปตรงผู้ชนะ · REJECT ชนะ ⇒ ไม่มีบัญชี · consumer ตามหลัง = ไม่ทำอะไร",
      { tally: tally(rs), winner: win ? { status: win.status, alloc: win.receipt?.allocations?.map((a: any) => a.amountSatang), carried: win.receipt?.carriedSatang, credit: win.receipt?.creditSatang } : null, slip: st, receipts: rc2.length, paid, d2110: (await net2110()) - n0, carried: b.carriedSatang });
    await invariants("SB", [k]);
  }

  // ═══════════ SC สองสลิปเต็มยอดบนบิลเดียว + สลิป AUTO ใบที่ 3 เข้าระหว่างทาง ═══════════
  console.log("\n── SC สองสลิปบิลเดียว + AUTO ──");
  {
    const k = "103";
    const s1 = await mkSlip(bl(k), { amount: BASE }), s2 = await mkSlip(bl(k), { amount: BASE }), s3 = await mkSlip(bl(k), { amount: BASE, status: "AUTO_APPROVED" });
    const n0 = await net2110();
    const rs = flat(await procs([
      { calls: [C("pay", "reviewDormSlip", cR, { slipId: s1.id, action: "APPROVE", reason: "ทางหนึ่ง" })] },
      { calls: [C("pay", "reviewDormSlip", cR, { slipId: s2.id, action: "APPROVE", reason: "ทางสอง" })] },
      { calls: [C("pay", "onDormSlipApproved", evtOf(s3)), C("pay", "onDormSlipApproved", evtOf(s3))] },
    ]));
    const tail = await consumeUntilQuiet(evtOf(s3));
    const b = await fresh(k);
    const st = await Promise.all([s1, s2, s3].map((x) => holdOf(x.id)));
    const live = liveRc(await rcOfBill(k));
    const reviewOk = rs.filter((x) => x.op === "reviewDormSlip" && x?.r?.ok === true).length;
    const reviewLose = rs.filter((x) => x.op === "reviewDormSlip" && x?.r?.ok !== true);
    const s3Paid = (await receipts()).some((r) => r.refId === `slip:${s3.id}`);
    const effective = reviewOk + (s3Paid ? 1 : 0);
    rec("SC-1", !hardOf(rs).length && effective === 1 && live.length === 1 && (await paidOn(b)) === BASE && (await net2110()) === n0 && reviewLose.every((x) => ["ALREADY_PAID", "BUSY"].includes(x?.r?.code)) && (s3Paid || st[2].hold?.reason === "AFTER_PAID"), "CRITICAL",
      "สลิป NEEDS_REVIEW 2 ใบ อนุมัติพร้อมกัน 2 โพรเซส + AUTO ใบที่ 3 (consumer) ⇒ ลงบิล 1 · ผู้แพ้ ALREADY_PAID/BUSY · AUTO ที่แพ้ถูกพัก AFTER_PAID · 2110 = 0",
      { tally: tally(rs), tail, slips: st.map((x) => [x.status, x.hold?.reason ?? null]), live: live.length, paid: await paidOn(b), d2110: (await net2110()) - n0 });
    const loserSlips = [s1, s2].filter((_, i) => st[i].status === "NEEDS_REVIEW").length;
    rec("SC-2", loserSlips === 2 - reviewOk, "MAJOR", "สลิปที่แพ้ (ALREADY_PAID/BUSY) ยังคง NEEDS_REVIEW (ไม่ถูกอนุมัติเงียบ)", st.map((x) => x.status));
    await invariants("SC", [k]);
  }

  // ═══════════ SD อนุมัติ ∥ เงินสด ∥ consumer AUTO ใบอื่น ═══════════
  console.log("\n── SD อนุมัติแข่งเงินสด ──");
  {
    const k = "104";
    const s1 = await mkSlip(bl(k), { amount: BASE }), s2 = await mkSlip(bl(k), { amount: BASE, status: "AUTO_APPROVED" });
    const n0 = await net2110();
    const ci = cashIn(k, BASE, "sd-cash");
    const rs = flat(await procs([
      { calls: [C("pay", "reviewDormSlip", cR, { slipId: s1.id, action: "APPROVE", reason: "แข่งเงินสด" })] },
      { calls: [C("pay", "recordDormPayment", cC, ci)] },
      { calls: [C("pay", "onDormSlipApproved", evtOf(s2))] },
    ]));
    const tail = await consumeUntilQuiet(evtOf(s2));
    const cashRetry = await cashUntilQuiet(cC, ci);
    const b = await fresh(k);
    const live = liveRc(await rcOfBill(k));
    rec("SD-1", !hardOf(rs).length && live.length === 1 && (await paidOn(b)) === BASE && (await net2110()) === n0, "CRITICAL",
      "อนุมัติสลิปเต็ม ∥ เงินสดเต็ม (คีย์ต่าง) ∥ consumer AUTO ใบอื่น บนบิลเดียว + ลองซ้ำหลังแข่ง ⇒ ใบเสร็จที่มีผล 1 · รับชำระ = ยอดบิลพอดี · 2110 ไม่โต",
      { tally: tally(rs), tail, cashRetry: cashRetry?.code ?? (cashRetry?.ok ? (cashRetry.duplicate ? "OK-dup" : "OK") : null), live: live.length, paid: await paidOn(b), d2110: (await net2110()) - n0, s2: await holdOf(s2.id) });
    await invariants("SD", [k]);
  }

  // ═══════════ SE บางส่วน + บางส่วนพร้อมกัน · เกิน ═══════════
  console.log("\n── SE บางส่วนพร้อมกัน ──");
  {
    const k = "105";
    const n0 = await net2110();
    const keys = ["se-a", "se-b", "se-c", "se-d"];
    const rs = flat(await procs(keys.map((x) => ({ calls: [C("pay", "recordDormPayment", cC, cashIn(k, 160_000, x)), C("pay", "recordDormPayment", cC, cashIn(k, 160_000, x))] }))));
    const after: any[] = [];
    for (const x of keys) after.push(await cashUntilQuiet(cC, cashIn(k, 160_000, x)));
    const b = await fresh(k);
    const live = liveRc(await rcOfBill(k));
    const okKeys = after.filter((r) => r?.ok).length;
    // ผลเรียงตามโพรเซส: [คีย์ i ทาง 1, คีย์ i ทาง 2] ⇒ สำเร็จทั้งคู่ต้องได้ใบเสร็จเดียวกัน
    const dupSame = keys.every((_, i) => { const r = [rs[2 * i], rs[2 * i + 1]].filter((y) => y?.r?.ok); return new Set(r.map((y) => y.r.receipt?.receiptId)).size <= 1; });
    rec("SE-1", !hardOf(rs).length && (await paidOn(b)) === BASE && live.length === 3 && okKeys === 3 && after.filter((r) => r?.code === "ALREADY_PAID").length === 1 && (await net2110()) === n0 && b.status === "PAID" && dupSame, "CRITICAL",
      "เงินสด 4 คีย์ × ฿1,600 (2 ทางต่อคีย์) 4 โพรเซสพร้อมกันบนบิล ฿4,800 + ลองซ้ำ ⇒ สำเร็จ 3 · ที่ 4 ALREADY_PAID · รับชำระ 480,000 พอดี · 2110 ไม่โต",
      { tally: tally(rs), after: after.map((r) => r?.code ?? (r?.ok ? "OK" : null)), live: live.length, paid: await paidOn(b), d2110: (await net2110()) - n0 });
    const k2 = "106";
    const m0 = await net2110();
    const rs2 = flat(await procs(["sf-a", "sf-b"].map((x) => ({ calls: [C("pay", "recordDormPayment", cC, cashIn(k2, 300_000, x))] }))));
    const after2 = [await cashUntilQuiet(cC, cashIn(k2, 300_000, "sf-a")), await cashUntilQuiet(cC, cashIn(k2, 300_000, "sf-b"))];
    const live2 = liveRc(await rcOfBill(k2));
    const b2 = await fresh(k2);
    const credit2 = live2.reduce((s, r) => s + r.grandTotal - r.alloc.reduce((a, x) => a + x.amount, 0), 0);
    rec("SE-2", !hardOf(rs2).length && after2.every((r) => r?.ok) && live2.length === 2 && (await paidOn(b2)) === BASE && (await net2110()) - m0 === 120_000 && credit2 === 120_000 && b2.status === "PAID", "CRITICAL",
      "เงินสด 2 คีย์ × ฿3,000 พร้อมกัน (รวมเกิน ฿1,200) ⇒ ทั้งคู่รับ · ลงบิล 480,000 · ส่วนเกิน 120,000 อยู่ 2110 = เครดิตในใบเสร็จ (M-6) ไม่ใช่รายได้",
      { tally: tally(rs2), after: after2.map((r) => (r?.ok ? `OK credit=${r.receipt?.creditSatang}` : r?.code)), paid: await paidOn(b2), d2110: (await net2110()) - m0, credit2 });
    await invariants("SE", [k, k2]);
  }

  // ═══════════ SG อนุมัติ ∥ ใบลดหนี้ (ยกเว้น) / ใบเพิ่มหนี้ (ค่าปรับ) — กลไก D.11/D.8 adjustSentBill ═══════════
  console.log("\n── SG ใบลด/เพิ่มหนี้แข่งรับเงิน ──");
  {
    const adj = (k: string, kind: string, amt: number, key: string) => C("dorm", "adjustSentBill", cO, { unitId: DA, billId: bl(k).id, kind, reason: kind === "CREDIT" ? "ยกเว้นค่าปรับตามที่อนุมัติ" : "ค่าปรับชำระล่าช้าตามสัญญา", idempotencyKey: `pbd10-${STAMP}-${key}`, lines: [{ code: "OTHER", labelTh: kind === "CREDIT" ? "ยกเว้นค่าปรับ" : "ค่าปรับ", amountSatang: amt }] });
    const sG = await mkSlip(bl("107"), { amount: BASE }), sH = await mkSlip(bl("108"), { amount: BASE }), sI = await mkSlip(bl("109"), { amount: BASE, status: "AUTO_APPROVED" });
    const rs = flat(await procs([
      { calls: [C("pay", "reviewDormSlip", cR, { slipId: sG.id, action: "APPROVE", reason: "แข่งใบลดหนี้" })] },
      { calls: [adj("107", "CREDIT", 30_000, "sg-cr")] },
      { calls: [C("pay", "reviewDormSlip", cR, { slipId: sH.id, action: "APPROVE", reason: "แข่งใบเพิ่มหนี้" })] },
      { calls: [adj("108", "DEBIT", 25_000, "sh-db"), C("pay", "onDormSlipApproved", evtOf(sI)), adj("109", "CREDIT", 30_000, "si-cr")] },
    ]));
    const tail = await consumeUntilQuiet(evtOf(sI));
    const out: any = {};
    const bad: string[] = [];
    for (const k of ["107", "108", "109"]) {
      const b = await fresh(k);
      const { inv, dn } = await docsOf(b);
      const ids = [inv.id, ...dn.map((d: any) => d.id)];
      const cn = Number((await prisma.accountDocument.aggregate({ where: { tenantId: A, sourceDocId: { in: ids }, docType: "CREDIT_NOTE", status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } }, _sum: { grandTotal: true } }))._sum.grandTotal ?? 0);
      const grand = inv.grandTotal + dn.reduce((s: number, d: any) => s + d.grandTotal, 0);
      const paid = await paidOn(b);
      // ไม่มีสถานะที่ผู้เช่าจ่ายเกินยอดหลังยกเว้น (ส่วนเกินต้องไปอยู่ 2110 ไม่ใช่ลงบิล)
      if (paid > grand - cn) bad.push(`${k}: ลงบิล ${paid} > ยอดหลังใบลดหนี้ ${grand - cn}`);
      out[k] = { status: b.status, paid, grand, cn, live: liveRc(await rcOfBill(k)).map((r) => [r.grandTotal, r.alloc.map((a) => a.amount)]) };
    }
    rec("SG-1", !hardOf(rs).length && !bad.length, "CRITICAL",
      "อนุมัติ ∥ ใบลดหนี้ ฿300 (ยกเว้น) · อนุมัติ ∥ ใบเพิ่มหนี้ ฿250 · consumer ∥ ใบลดหนี้ ⇒ ไม่ลงบิลเกินยอดหลังยกเว้น (เกิน ⇒ 2110) · ไม่มี throw/ผิดชนิด",
      { tally: tally(rs), tail, out, bad });
    await invariants("SG", ["107", "108", "109"]);
  }

  // ═══════════ SV อนุมัติ/consumer ∥ ยกเลิกใบแจ้งหนี้+บิล VOID ═══════════
  console.log("\n── SV VOID แข่งรับเงิน ──");
  {
    const s10 = await mkSlip(bl("110"), { amount: BASE }), s11 = await mkSlip(bl("111"), { amount: BASE, status: "AUTO_APPROVED" }), s12 = await mkSlip(bl("112"), { amount: BASE });
    const rs = flat(await procs([
      { calls: [C("pay", "reviewDormSlip", cR, { slipId: s10.id, action: "APPROVE", reason: "แข่ง VOID" })] },
      { calls: [C("raw", "voidBill", A, BOOK_A, bl("110").id, bl("110").accountDocumentId)] },
      { calls: [C("pay", "onDormSlipApproved", evtOf(s11)), C("raw", "voidBill", A, BOOK_A, bl("111").id, bl("111").accountDocumentId)] },
      { calls: [C("pay", "reviewDormSlip", cR, { slipId: s12.id, action: "APPROVE", reason: "แข่งพลิกบิล" }), C("raw", "flipVoid", A, bl("112").id)] },
    ]));
    const tails = [await consumeUntilQuiet(evtOf(await prisma.paymentSlip.findFirst({ where: { id: s10.id } }))), await consumeUntilQuiet(evtOf(s11))];
    const res: any = {};
    const bad: string[] = [];
    for (const [k, s] of [["110", s10], ["111", s11]] as const) {
      const b = await fresh(k);
      const inv = await prisma.accountDocument.findFirst({ where: { id: b.accountDocumentId }, select: { status: true } });
      const paid = await paidOn(b);
      const h = await holdOf(s.id);
      const rc = (await receipts()).filter((r) => r.refId === `slip:${s.id}`);
      res[k] = { bill: b.status, inv: inv.status, paid, slip: h.status, hold: h.hold?.reason ?? null, receipts: rc.length };
      if (inv.status === "VOIDED" && (paid !== 0 || rc.length)) bad.push(`${k}: ใบยกเลิกแต่มีเงิน/ใบเสร็จ`);
      if (inv.status === "VOIDED" && !(h.hold?.reason === "BILL_VOID" || h.status === "NEEDS_REVIEW")) bad.push(`${k}: ใบยกเลิกแต่สลิปอนุมัติแล้วไม่ถูกพัก BILL_VOID`);
      if (inv.status !== "VOIDED" && (paid !== BASE || rc.length !== 1)) bad.push(`${k}: ใบไม่ยกเลิกแต่เงินไม่ครบ`);
    }
    rec("SV-1", !hardOf(rs.filter((x) => x.op !== "voidBill")).length && !bad.length, "CRITICAL",
      "ยกเลิกใบแจ้งหนี้ (voidDocument) + บิล VOID ∥ อนุมัติมือ / consumer ⇒ ไม่มีรับชำระบนใบที่ยกเลิก · แพ้ ⇒ BILL_VOID/พัก · ชนะ ⇒ ยกเลิกใบไม่ได้ (มีรับชำระ)",
      { tally: tally(rs), voids: rs.filter((x) => x.op === "voidBill").map((x) => x?.r?.ok ?? x?.r?.reason ?? x?.threw), res, tails, bad });
    const rv = rs[0]; // ลำดับผล: [0] ตัดสิน s10 · [1] voidBill 110 · [2] consumer s11 · [3] voidBill 111 · [4] ตัดสิน s12 · [5] พลิก 112
    const s10row = await holdOf(s10.id);
    rec("SV-2", !(rv?.r?.ok === false && rv?.r?.code !== "BUSY" && s10row.status === "APPROVED"), "MINOR",
      "ทางมือแพ้ VOID หลัง decideSlip ⇒ ผลคืนสอดคล้องกับสถานะสลิป (ไม่คืน BILL_VOID ขณะที่สลิปถูกอนุมัติแล้วเงียบ ๆ)", { review: rv?.r?.code ?? (rv?.r?.ok ? "OK" : null), slip: s10row });
    const b12 = await fresh("112");
    rec("SV-3", true, "INFO", "(สังเกต) บิล VOID แบบพลิกแถวตรง (ไม่ใช่ทางของผลิตภัณฑ์) ∥ อนุมัติ — ผลที่ได้", { review: rs[4]?.r?.ok ? "OK" : rs[4]?.r?.code ?? codeOf(rs[4]), bill: b12.status, paid: await paidOn(b12) });
    await invariants("SV", ["110", "111"]);
  }

  // ═══════════ SR ยกเลิกใบเสร็จ ∥ รับเงินใหม่ ∥ consumer replay ═══════════
  console.log("\n── SR ยกเลิกใบเสร็จแข่ง ──");
  {
    const k = "113";
    const s = await mkSlip(bl(k), { amount: BASE, status: "AUTO_APPROVED" });
    await PAY.onDormSlipApproved(evtOf(s));
    const r1 = (await receipts()).find((r) => r.refId === `slip:${s.id}`);
    const je0 = await prisma.accountJournalEntry.count({ where: { tenantId: A, reversalOfId: { not: null } } });
    const vin = { receiptId: r1?.id ?? "x", reason: "สลิปปลอม ธนาคารแจ้งกลับ" };
    const ci = cashIn(k, BASE, "sr-cash");
    const rs = flat(await procs([
      { calls: [C("pay", "voidDormReceipt", cC, vin), C("pay", "voidDormReceipt", cC, vin)] },
      { calls: [C("pay", "voidDormReceipt", cO, vin), C("pay", "voidDormReceipt", cO, vin)] },
      { calls: [C("pay", "recordDormPayment", cC, ci), C("pay", "onDormSlipApproved", evtOf(s))] },
      { calls: [C("pay", "recordDormPayment", cC, ci), C("pay", "onDormSlipApproved", evtOf(s))] },
    ]));
    const cr = await cashUntilQuiet(cC, ci);
    await consumeUntilQuiet(evtOf(s));
    const vo = rs.filter((x) => x.op === "voidDormReceipt");
    const revN = (await prisma.accountJournalEntry.count({ where: { tenantId: A, reversalOfId: { not: null } } })) - je0;
    const all = await receipts();
    const slipRc = all.filter((r) => r.refId === `slip:${s.id}`);
    const live = liveRc(await rcOfBill(k));
    const b = await fresh(k);
    rec("SR-1", !hardOf(rs).length && vo.filter((x) => x?.r?.ok).length === 1 && vo.filter((x) => !x?.r?.ok).every((x) => ["ALREADY_VOID", "BUSY"].includes(x?.r?.code)) && revN === 1 && slipRc.length === 1 && slipRc[0].status === "VOIDED"
      && cr?.ok && live.length === 1 && (await paidOn(b)) === BASE && live[0].docNo !== r1?.docNo, "CRITICAL",
      "voidDormReceipt 4 ทาง ∥ เงินสดใหม่ 2 ทาง ∥ consumer replay 2 ทาง ⇒ ยกเลิกครั้งเดียว · กลับรายการ 1 · สลิปไม่ได้ใบเสร็จใหม่ · เงินสดลงหลังยกเลิก (ใบเสร็จใหม่เลขใหม่) · รับชำระ 480,000",
      { tally: tally(rs), cashAfter: cr?.code ?? (cr?.ok ? "OK" : null), reversals: revN, slipReceipts: slipRc.map((r) => r.status), live: live.map((r) => r.docNo), voidedNo: r1?.docNo, paid: await paidOn(b) });
    await invariants("SR", [k]);
  }

  // ═══════════ SN เลขใบเสร็จไม่ซ้ำภายใต้การแข่ง + ไม่ใช้ซ้ำหลังยกเลิก ═══════════
  console.log("\n── SN เลขใบเสร็จ ──");
  {
    const ks = ["114", "115", "116", "117", "118", "119", "120", "121"];
    const rs = flat(await procs([0, 1, 2, 3].map((p) => ({ calls: [ks[p * 2], ks[p * 2 + 1]].map((k) => C("pay", "recordDormPayment", cC, cashIn(k, BASE, `sn-${k}`))) }))));
    const fix = [];
    for (const k of ks) fix.push(await cashUntilQuiet(cC, cashIn(k, BASE, `sn-${k}`)));
    const ok8 = fix.filter((r) => r?.ok).map((r) => r.receipt);
    const voidThese = ok8.slice(0, 2);
    const vr = flat(await procs(voidThese.map((v: any) => ({ calls: [C("pay", "voidDormReceipt", cC, { receiptId: v.receiptId, reason: "บันทึกผิด ลงใหม่" })] }))));
    const re = flat(await procs(voidThese.map((v: any) => ({ calls: [C("pay", "recordDormPayment", cC, { unitId: DA, billId: v.billId, amountSatang: BASE, channel: "TRANSFER", idempotencyKey: `pbd10-${STAMP}-sn2-${v.billId.slice(-6)}` })] }))));
    const all = await receipts();
    const nos = all.map((r) => r.docNo);
    const voidedNos = voidThese.map((v: any) => v.docNo);
    const reNos = re.filter((x) => x?.r?.ok).map((x) => x.r.receipt.docNo);
    rec("SN-1", !hardOf([...rs, ...vr, ...re]).length && ok8.length === 8 && new Set(nos).size === nos.length && nos.every(Boolean) && reNos.length === 2 && reNos.every((n: string) => !voidedNos.includes(n))
      && all.filter((r) => voidedNos.includes(r.docNo)).every((r) => r.status === "VOIDED"), "CRITICAL",
      "เงินสด 8 บิลพร้อมกัน 4 โพรเซส ⇒ เลข 8 ใบไม่ซ้ำ · ยกเลิก 2 ใบพร้อมกัน + รับใหม่พร้อมกัน ⇒ เลขใหม่ไม่ใช้เลขที่ยกเลิก · ใบที่ยกเลิกคงเลขเดิม",
      { tally: tally([...rs, ...vr, ...re]), nos, voidedNos, reNos });
    await invariants("SN", ks);
  }

  // ═══════════ SP สลิปหลังบิลจ่ายครบ ⇒ REVIEW (พัก) ไม่มีใบเสร็จที่สอง ═══════════
  console.log("\n── SP สลิปหลังจ่ายครบ ──");
  {
    const k = "122";
    const pr = await PAY.recordDormPayment(cC, cashIn(k, BASE, "sp-cash"));
    const ss = [await mkSlip(bl(k), { amount: BASE, status: "AUTO_APPROVED" }), await mkSlip(bl(k), { amount: BASE, status: "AUTO_APPROVED" }), await mkSlip(bl(k), { amount: 100_000, status: "AUTO_APPROVED" })];
    const c0 = await counts(), n0 = await net2110();
    const rs = flat(await procs(ss.map((s) => ({ calls: [C("pay", "onDormSlipApproved", evtOf(s)), C("pay", "onDormSlipApproved", evtOf(s))] }))));
    for (const s of ss) await consumeUntilQuiet(evtOf(s));
    const c1 = await counts();
    const holds = await Promise.all(ss.map((s) => holdOf(s.id)));
    const audits = await prisma.auditLog.count({ where: { tenantId: A, action: "dorm.slip.held", targetId: { in: ss.map((s) => s.id) } } });
    rec("SP-1", pr?.ok && !hardOf(rs).length && c1.pay === c0.pay && c1.doc === c0.doc && c1.je === c0.je && (await net2110()) === n0 && holds.every((h) => h.hold?.reason === "AFTER_PAID" && h.hold?.open === true) && audits === 3, "CRITICAL",
      "บิลจ่ายครบแล้ว + สลิป AUTO 3 ใบ × 2 ทาง × 3 โพรเซส ⇒ พักทั้งหมด (AFTER_PAID · audit ใบละ 1) · ไม่มีรับชำระ/ใบเสร็จ/JV/2110 ใหม่",
      { tally: tally(rs), holds: holds.map((h) => h.hold?.reason ?? h.status), audits, dPay: c1.pay - c0.pay, dDoc: c1.doc - c0.doc });
    await invariants("SP", [k]);
  }

  // ═══════════ SO outbox consumer จริง (decideSlip ⇒ แถว outbox ⇒ consumers[...]) ส่งซ้ำ/พร้อมกัน ═══════════
  console.log("\n── SO outbox consumer ──");
  {
    const k = "123";
    const s = await mkSlip(bl(k), { amount: BASE });
    const d = await SLIP.decideSlip({ userId: OWN }, { tenantId: A }, s.id, { decision: "APPROVE", reason: "ตรวจแล้ว" });
    const ev = await prisma.outboxEvent.findFirst({ where: { tenantId: A, type: "payment.slip.approved", payload: { path: ["slipId"], equals: s.id } } });
    await parkOutbox(tenantIds);
    const evj = ev ? JSON.parse(J(ev)) : null;
    const rs = ev ? flat(await procs([0, 1, 2].map(() => ({ calls: [C("oc", "payment.slip.approved", evj), C("oc", "payment.slip.approved", evj)] })))) : [];
    let tail = "";
    for (let i = 0; i < 4 && ev; i++) { try { await OC["payment.slip.approved"](ev); tail += "done"; break; } catch (e) { tail += `threw:${errMsg(e).slice(0, 50)};`; await sleep(1_500); } }
    const b = await fresh(k);
    const rc = (await receipts()).filter((r) => r.refId === `slip:${s.id}`);
    rec("SO-1", d?.ok && !!ev && !hardOf(rs).length && rc.length === 1 && (await paidOn(b)) === BASE && (await billEvents(b.id)).length === 1, "CRITICAL",
      "decideSlip ⇒ แถว outbox ⇒ consumers['payment.slip.approved'] 6 ทาง × 3 โพรเซส + ส่งซ้ำ ⇒ ใบเสร็จ 1 · รับชำระ 480,000 · event 1",
      { decide: d?.ok ?? d?.code, tally: tally(rs), tail, receipts: rc.length, paid: await paidOn(b) });
    await invariants("SO", [k]);
  }

  // ═══════════ BZ ฉีด 40P01 (ห่อ prisma.$transaction ในโพรเซสลูก ตามชื่อฟังก์ชันบัญชีใน stack) ═══════════
  console.log("\n── BZ 40P01 ฉีด ──");
  {
    const [f1] = await procs([{ calls: [C("pay", "recordDormPayment", cC, cashIn("124", BASE, "bz1"))], fault: { fn: "dormRecordPayment", mode: "fail", n: 99 } }], 8_000);
    const p1 = await paidOn(await fresh("124"));
    const again = await PAY.recordDormPayment(cC, cashIn("124", BASE, "bz1"));
    rec("BZ-1", f1.out[0]?.r?.code === "BUSY" && f1.hits === 2 && p1 === 0 && again?.ok === true && liveRc(await rcOfBill("124")).length === 1 && (await paidOn(await fresh("124"))) === BASE, "MAJOR",
      "40P01 ทุกครั้งที่ลงเงิน (เงินสด) ⇒ ลองซ้ำ 1 ครั้ง (ธุรกรรม 2 ครั้ง) แล้ว BUSY · ไม่มีเงิน · claim ถูกปล่อย · ลองใหม่คีย์เดิม = สำเร็จครั้งเดียว",
      { r: f1.out[0]?.r?.code ?? f1.out[0], txAttempts: f1.hits, paidAfterBusy: p1, again: again?.ok ? "OK" : again?.code });
    const [f2] = await procs([{ calls: [C("pay", "recordDormPayment", cC, cashIn("125", BASE, "bz2"))], fault: { fn: "dormRecordPayment", mode: "fail", n: 1 } }], 8_000);
    rec("BZ-2", f2.out[0]?.r?.ok === true && f2.hits === 2 && liveRc(await rcOfBill("125")).length === 1 && (await paidOn(await fresh("125"))) === BASE, "MAJOR",
      "40P01 ครั้งเดียว ⇒ ลองซ้ำภายในสำเร็จ · ใบเสร็จ 1 · รับชำระ 1 ครั้ง", { r: f2.out[0]?.r?.ok ?? f2.out[0]?.r?.code, txAttempts: f2.hits });
    const pay0 = await prisma.accountDocumentPayment.count({ where: { tenantId: A, documentId: bl("126").accountDocumentId } });
    const [f3] = await procs([{ calls: [C("pay", "recordDormPayment", cC, cashIn("126", BASE, "bz3"))], fault: { fn: "dormIssueReceipt", mode: "fail", n: 99 } }], 8_000);
    const mid = { pays: (await prisma.accountDocumentPayment.count({ where: { tenantId: A, documentId: bl("126").accountDocumentId } })) - pay0, rc: (await rcOfBill("126")).length, bill: (await fresh("126")).status };
    const again3 = await PAY.recordDormPayment(cC, cashIn("126", BASE, "bz3"));
    const pays3 = (await prisma.accountDocumentPayment.count({ where: { tenantId: A, documentId: bl("126").accountDocumentId } })) - pay0;
    rec("BZ-3", f3.out[0]?.r?.code === "BUSY" && f3.hits === 2 && again3?.ok === true && pays3 === 1 && liveRc(await rcOfBill("126")).length === 1 && (await fresh("126")).status === "PAID", "MAJOR",
      "40P01 ตอนออกใบเสร็จ (เงินลงแล้ว) ⇒ BUSY · ลองใหม่คีย์เดิม ⇒ ใบเสร็จ 1 · รับชำระไม่ซ้ำ (1 แถว)", { r: f3.out[0]?.r?.code, txAttempts: f3.hits, mid, again: again3?.ok ? "OK" : again3?.code, pays: pays3 });
    const s4 = await mkSlip(bl("127"), { amount: BASE, status: "AUTO_APPROVED" });
    const [f4] = await procs([{ calls: [C("pay", "onDormSlipApproved", evtOf(s4))], fault: { fn: "dormRecordPayment", mode: "fail", n: 99 } }], 8_000);
    const t4 = await consumeUntilQuiet(evtOf(s4));
    rec("BZ-4", !!f4.out[0]?.threw && f4.hits === 2 && t4.slice(-1)[0] === "done" && (await receipts()).filter((r) => r.refId === `slip:${s4.id}`).length === 1 && (await paidOn(await fresh("127"))) === BASE, "MAJOR",
      "consumer: 40P01 ทุกครั้ง ⇒ ลองซ้ำ 1 แล้ว throw (คิวลองใหม่) · ส่งใหม่ ⇒ สำเร็จครั้งเดียว", { r: f4.out[0]?.threw ?? f4.out[0]?.r, txAttempts: f4.hits, tail: t4 });
    const s5 = await mkSlip(bl("128"), { amount: BASE });
    const [f5] = await procs([{ calls: [C("pay", "reviewDormSlip", cR, { slipId: s5.id, action: "APPROVE", reason: "ฉีด 40P01" })], fault: { fn: "dormRecordPayment", mode: "fail", n: 99 } }], 8_000);
    const st5 = await holdOf(s5.id);
    const retry5 = await PAY.reviewDormSlip(cR, { slipId: s5.id, action: "APPROVE", reason: "ลองอีกครั้ง" });
    const t5 = await consumeUntilQuiet(evtOf(await prisma.paymentSlip.findFirst({ where: { id: s5.id } })));
    rec("BZ-5", f5.out[0]?.r?.code === "BUSY" && f5.hits === 2 && t5.slice(-1)[0] === "done" && (await receipts()).filter((r) => r.refId === `slip:${s5.id}`).length === 1 && (await paidOn(await fresh("128"))) === BASE, "MAJOR",
      "ตัดสินมือ: 40P01 ทุกครั้งหลัง decideSlip ⇒ BUSY · consumer ทำต่อจากแผนเดิม ⇒ ใบเสร็จ 1", { r: f5.out[0]?.r?.code, txAttempts: f5.hits, slipAfter: st5.status, retryReview: retry5?.code ?? (retry5?.ok ? "OK" : null), tail: t5 });
    // แผนค้างจาก BUSY (ยังไม่มีเงินลงสักขั้น) แล้วบิลถูกจ่ายครบทางอื่น ⇒ ลองคีย์เดิมต้องได้ ALREADY_PAID (§3.3) ไม่ใช่ 2110
    const [f6] = await procs([{ calls: [C("pay", "recordDormPayment", cC, cashIn("129", BASE, "bz6"))], fault: { fn: "dormRecordPayment", mode: "fail", n: 99 } }], 8_000);
    const other = await PAY.recordDormPayment(cC, cashIn("129", BASE, "bz6-other"));
    const n0 = await net2110();
    const stale = await PAY.recordDormPayment(cC, cashIn("129", BASE, "bz6"));
    const d2110 = (await net2110()) - n0;
    rec("BZ-6", f6.out[0]?.r?.code === "BUSY" && other?.ok && stale?.code === "ALREADY_PAID" && d2110 === 0, "MAJOR",
      "แผนค้างจาก BUSY (ยังไม่ลงเงินสักขั้น) + บิลถูกจ่ายครบด้วยคีย์อื่น ⇒ ลองคีย์เดิม = ALREADY_PAID ตาม §3.3 (ไม่ replay แผนเก่าเป็นเงินรับล่วงหน้า 2110 จากการแข่ง)",
      { first: f6.out[0]?.r?.code, other: other?.ok ? "OK" : other?.code, staleRetry: stale?.ok ? `OK credit=${stale.receipt?.creditSatang} alloc=${J(stale.receipt?.allocations?.map((a: any) => a.amountSatang))}` : stale?.code, d2110 });
    await invariants("BZ", ["124", "125", "126", "127", "128", "129"]);
  }

  // ═══════════ KL SIGKILL กลางทาง (ห่อ $transaction · ฆ่าตัวเองหลัง commit ขั้นที่ n) ═══════════
  console.log("\n── KL SIGKILL กลางทาง ──");
  {
    const dbn = async (k: string, key: string) => DORM.adjustSentBill(cO, { unitId: DA, billId: bl(k).id, kind: "DEBIT", reason: "ค่าซ่อมที่ผู้เช่าตกลงแล้ว", idempotencyKey: `pbd10-${STAMP}-${key}`, lines: [{ code: "OTHER", labelTh: "ค่าซ่อม", amountSatang: 25_000 }] });
    const D1 = await dbn("130", "k1db"), D2 = await dbn("131", "k2db"), D3 = await dbn("132", "k3db");
    const TOT = BASE + 25_000;
    const s2 = await mkSlip(bl("131"), { amount: TOT, expected: TOT, status: "AUTO_APPROVED" });
    const s3 = await mkSlip(bl("132"), { amount: TOT, expected: TOT });
    const kills = await procs([
      { calls: [C("pay", "recordDormPayment", cC, cashIn("130", TOT, "kl1"))], fault: { fn: "dormRecordPayment", mode: "killAfter", n: 1 } },
      { calls: [C("pay", "onDormSlipApproved", evtOf(s2))], fault: { fn: "dormRecordPayment", mode: "killAfter", n: 1 } },
      { calls: [C("pay", "reviewDormSlip", cR, { slipId: s3.id, action: "APPROVE", reason: "ฆ่ากลางทาง" })], fault: { fn: "dormRecordPayment", mode: "killAfter", n: 1 } },
      { calls: [C("pay", "recordDormPayment", cC, cashIn("133", BASE, "kl4"))], fault: { fn: "dormIssueReceipt", mode: "killAfter", n: 1 } },
    ], 8_000);
    const killed = kills.map((x) => x.exit);
    const mid: any = {};
    for (const k of ["130", "131", "132", "133"]) { const b = await fresh(k); mid[k] = { status: b.status, paidSatang: b.paidSatang, acct: await paidOn(b), rc: (await rcOfBill(k)).length, claim: (b.policySnapshot as any)?.dormPay?.claimUntil ?? null, plans: Object.keys((b.policySnapshot as any)?.dormPay?.plans ?? {}).length }; }
    // ระหว่างค้าง: ยังถือ claim ⇒ ทางมือ BUSY (ไม่มีเงินซ้อน)
    const during = [await PAY.recordDormPayment(cC, cashIn("130", 1_000, "kl1-other")), await PAY.recordDormPayment(cC, cashIn("130", TOT, "kl1"))];
    const halfOk = ["130", "131", "132"].every((k) => mid[k].status !== "PAID" && mid[k].rc === 0) && mid["133"].rc === 1;
    rec("KL-1", killed.every((e) => e.includes("SIGKILL")) && D1?.ok && D2?.ok && D3?.ok && halfOk && during.every((r) => r?.code === "BUSY"), "MAJOR",
      "SIGKILL หลังลงเงินขั้นแรก (ใบแจ้งหนี้) ก่อนใบเพิ่มหนี้/ใบเสร็จ — เงินสด · consumer · ตัดสินมือ · และหลังออกใบเสร็จก่อนอัปเดตบิล ⇒ ไม่มีบิล PAID โดยไม่มีใบเสร็จ · claim ค้างกันทางอื่นลงเงินซ้อน (BUSY)",
      { killed, mid, during: during.map((r) => r?.code ?? (r?.ok ? "OK" : null)) });
    const until = Math.max(...Object.values(mid).map((x: any) => Number(x.claim ?? 0)));
    const wait = until - Date.now() + 2_000;
    console.log(`  (รอ claim หมดอายุ ${Math.round(wait / 1000)} วิ)`);
    if (wait > 0) await sleep(wait);
    const r1 = await PAY.recordDormPayment(cC, cashIn("130", TOT, "kl1"));
    const t2 = await consumeUntilQuiet(evtOf(s2));
    const t3 = await consumeUntilQuiet(evtOf(await prisma.paymentSlip.findFirst({ where: { id: s3.id } })));
    const r4 = await PAY.recordDormPayment(cC, cashIn("133", BASE, "kl4"));
    const fin: any = {};
    const bad: string[] = [];
    for (const [k, tot] of [["130", TOT], ["131", TOT], ["132", TOT], ["133", BASE]] as const) {
      const b = await fresh(k);
      const live = liveRc(await rcOfBill(k));
      const pays = await prisma.accountDocumentPayment.count({ where: { tenantId: A, documentId: { in: [(await docsOf(b)).inv.id, ...(await docsOf(b)).dn.map((d: any) => d.id)] }, voidedAt: null } });
      fin[k] = { status: b.status, paid: await paidOn(b), live: live.map((r) => [r.grandTotal, r.alloc.map((a) => a.amount)]), pays, plans: Object.keys((b.policySnapshot as any)?.dormPay?.plans ?? {}).length, ev: (await billEvents(b.id)).length };
      if (b.status !== "PAID" || (await paidOn(b)) !== tot || live.length !== 1 || live[0].grandTotal !== tot || fin[k].plans !== 0 || fin[k].ev !== 1) bad.push(k);
    }
    rec("KL-2", r1?.ok && r4?.ok && t2.slice(-1)[0] === "done" && t3.slice(-1)[0] === "done" && !bad.length, "CRITICAL",
      "หลัง claim หมดอายุ ลองใหม่ (คีย์เดิม / outbox replay) ⇒ ทำต่อจากแผนเดิมครบครั้งเดียว: ใบเสร็จ 1 ยอดเต็ม · รับชำระไม่ซ้ำ · บิล PAID · event 1 · แผนถูกลบ",
      { r1: r1?.ok ? `OK dup=${r1.duplicate}` : r1?.code, r4: r4?.ok ? `OK dup=${r4.duplicate}` : r4?.code, t2, t3, fin, bad });
    await invariants("KL", ["130", "131", "132", "133"]);
  }

  // ═══════════ XT ข้ามร้าน/ข้ามหน่วย/สลิปที่ไม่ใช่ของหอ ═══════════
  console.log("\n── XT ข้ามร้าน/หน่วย ──");
  {
    const NF = PAY.DORM_PAY_NF;
    // ของจริงของร้าน A ให้ร้าน B ยิง
    const sA = await mkSlip(bl("134"), { amount: BASE });
    const xPaid = await PAY.recordDormPayment({ tenantId: A, actorUserId: OWN }, { unitId: DX, billId: bl("X1").id, amountSatang: BASE, channel: "CASH", idempotencyKey: `pbd10-${STAMP}-x1cash` });
    const sXheld = await mkSlip(bl("X1"), { amount: BASE, status: "AUTO_APPROVED" });
    await PAY.onDormSlipApproved(evtOf(sXheld));
    const sX = await mkSlip(bl("X2"), { amount: BASE });
    const rcA = (await receipts()).find((r) => r.status !== "VOIDED");
    const item = await PAY.stashChatSlip({ tenantId: A, connectionId: `pb-conn-${STAMP}`, partyId: UA.L["134"].partyId, leaseIds: [UA.L["134"].leaseId] }, { messageId: `9${Date.now()}`, data: new Uint8Array([1, 2, 3]), contentType: "image/png" }, { deps: { put: async () => {} } });
    const sBook = await mkSlip(bl("134"), { amount: BASE, domain: "BOOKING", refType: "APPT_DEPOSIT" });
    const sDep = await mkSlip(bl("134"), { amount: BASE, refType: "DORM_DEPOSIT" });
    const snap = async () => ({
      slips: (await prisma.paymentSlip.findMany({ where: { tenantId: A }, select: { id: true, status: true, checks: true }, orderBy: { id: "asc" } })).map((x: any) => [x.id, x.status, J(x.checks?.dormHold ?? null)]),
      c: await counts(), audits: await prisma.auditLog.count({ where: { tenantId: A } }), bills: (await prisma.dormBill.findMany({ where: { tenantId: A }, select: { id: true, status: true, paidSatang: true }, orderBy: { id: "asc" } })).map((b: any) => [b.id, b.status, b.paidSatang]),
    });
    const s0 = await snap();
    const nopeIn = { slipId: "nope-xyz-000", action: "APPROVE", reason: "ลอง" };
    const calls: [string, () => Promise<any>][] = [
      ["B.review(slipA)", () => PAY.reviewDormSlip(cOB, { slipId: sA.id, action: "APPROVE", reason: "ข้ามร้าน" })],
      ["B.review(slipA,REJECT)", () => PAY.reviewDormSlip(cOB, { slipId: sA.id, action: "REJECT", reason: "ข้ามร้าน" })],
      ["B.resolve(heldX)", () => PAY.resolveHeldSlip(cOB, { slipId: sXheld.id, action: "CREDIT", reason: "ข้ามร้าน" })],
      ["B.cash(DA,billA)", () => PAY.recordDormPayment(cOB, { unitId: DA, billId: bl("134").id, amountSatang: BASE, channel: "CASH", idempotencyKey: `pbd10-${STAMP}-xb1` })],
      ["B.cash(DB,billA)", () => PAY.recordDormPayment(cOB, { unitId: DB, billId: bl("134").id, amountSatang: BASE, channel: "CASH", idempotencyKey: `pbd10-${STAMP}-xb2` })],
      ["B.void(rcA)", () => PAY.voidDormReceipt(cOB, { receiptId: rcA?.id ?? "x", reason: "ข้ามร้านยกเลิก" })],
      ["B.attach(itemA)", () => PAY.attachChatSlip(cOB, { itemId: item?.itemId ?? "x", billId: bl("B1").id }, { deps: { put: async () => {}, del: async () => 200 } })],
      ["B.dismiss(itemA)", () => PAY.dismissChatSlip(cOB, { itemId: item?.itemId ?? "x", reason: "ข้ามร้าน" }, { deps: { del: async () => 200 } })],
      ["REV(DA).review(slipDX)", () => PAY.reviewDormSlip(cR, { slipId: sX.id, action: "APPROVE", reason: "ข้ามหน่วย" })],
      ["REV(DA).resolve(heldDX)", () => PAY.resolveHeldSlip(cR, { slipId: sXheld.id, action: "CREDIT", reason: "ข้ามหน่วย" })],
      ["CASH(DA).cash(DX bill)", () => PAY.recordDormPayment(cC, { unitId: DX, billId: bl("X2").id, amountSatang: BASE, channel: "CASH", idempotencyKey: `pbd10-${STAMP}-xc1` })],
      ["CASH(DA).cash(DA,DXbill)", () => PAY.recordDormPayment(cC, { unitId: DA, billId: bl("X2").id, amountSatang: BASE, channel: "CASH", idempotencyKey: `pbd10-${STAMP}-xc2` })],
      ["REVX(DX).review(slipDA)", () => PAY.reviewDormSlip(cRX, { slipId: sA.id, action: "APPROVE", reason: "ข้ามหน่วย" })],
      ["REVX(DX).attach(itemDA)", () => PAY.attachChatSlip(cRX, { itemId: item?.itemId ?? "x", billId: bl("134").id }, { deps: { put: async () => {}, del: async () => 200 } })],
      ["REV.review(BOOKING slip)", () => PAY.reviewDormSlip(cR, { slipId: sBook.id, action: "APPROVE", reason: "ไม่ใช่ของหอ" })],
      ["REV.review(DORM_DEPOSIT)", () => PAY.reviewDormSlip(cR, { slipId: sDep.id, action: "APPROVE", reason: "ไม่ใช่บิล" })],
      ["A.review(nope)", () => PAY.reviewDormSlip(cO, nopeIn)],
      ["A.cash(nope)", () => PAY.recordDormPayment(cO, { unitId: DA, billId: "nope-xyz-000", amountSatang: BASE, channel: "CASH", idempotencyKey: `pbd10-${STAMP}-xn` })],
      ["A.void(nope)", () => PAY.voidDormReceipt(cO, { receiptId: "nope-xyz-000", reason: "ไม่มีจริงเลย" })],
    ];
    // ยิงพร้อมกันจากหลายโพรเซสด้วย (ร้าน B ทุกฟังก์ชัน)
    const fan = flat(await procs([
      { calls: [C("pay", "reviewDormSlip", cOB, { slipId: sA.id, action: "APPROVE", reason: "ข้ามร้าน" }), C("pay", "recordDormPayment", cOB, { unitId: DA, billId: bl("134").id, amountSatang: BASE, channel: "CASH", idempotencyKey: `pbd10-${STAMP}-xb3` })] },
      { calls: [C("pay", "voidDormReceipt", cOB, { receiptId: rcA?.id ?? "x", reason: "ข้ามร้านยกเลิก" }), C("pay", "resolveHeldSlip", cOB, { slipId: sXheld.id, action: "CREDIT", reason: "ข้ามร้าน" })] },
    ]));
    const got: [string, any][] = [];
    for (const [n, f] of calls) { try { got.push([n, await f()]); } catch (e) { got.push([n, { threw: errMsg(e) }]); } }
    const body = (x: any) => J(x);
    const ref = body({ ok: false, code: "NOT_FOUND", reason: NF });
    const wrong = got.filter(([, r]) => body(r) !== ref).map(([n, r]) => [n, r?.code ?? r?.threw ?? (r?.ok ? "OK!" : J(r).slice(0, 60))]);
    const wrongFan = fan.filter((x) => body(x?.r) !== ref).map((x) => [x.op, codeOf(x)]);
    const models = [await PAY.dormPaymentsModel(cOB, { unitId: DA }), await PAY.dormPaymentsModel(cR, { unitId: DX }), await PAY.dormBillReceipts(cOB, { unitId: DA, billId: bl("134").id }), await PAY.dormBillReceipts(cR, { unitId: DX, billId: bl("X1").id })];
    await PAY.onDormSlipApproved(evtOf(await prisma.paymentSlip.update({ where: { id: sA.id }, data: { status: "AUTO_APPROVED" } }), { tenantId: B }));
    const s1 = await snap();
    const s0b = { ...s0, slips: s0.slips.map((x: any) => (x[0] === sA.id ? [x[0], "AUTO_APPROVED", x[2]] : x)) };
    rec("XT-1", item?.itemId && xPaid?.ok && !wrong.length && !wrongFan.length && models.every((m) => m === null) && J(s0b) === J(s1), "BLOCKER",
      "ร้าน B / ผู้ตรวจหน่วยอื่น / สลิปไม่ใช่บิลหอ / id ขยะ ⇒ NOT_FOUND เนื้อเดียวกันทุกไบต์ (ในโพรเซส + 2 โพรเซสพร้อมกัน) · โมเดล/ใบเสร็จ = null · event tenantId ไม่ตรง = ไม่ทำอะไร · ไม่มีแถวใดของ A เปลี่ยน",
      { wrong, wrongFan, models: models.map((m) => (m === null ? null : "LEAK")), changed: J(s0b) === J(s1) ? null : { c0: s0.c, c1: s1.c, a0: s0.audits, a1: s1.audits } });
    const dB = await SLIP.decideSlip({ userId: REV }, { tenantId: A }, sBook.id, { decision: "REJECT", reason: "ไม่ใช่ของหอ" });
    const dX = await SLIP.decideSlip({ userId: REV }, { tenantId: A }, sX.id, { decision: "REJECT", reason: "ข้ามหน่วย" });
    const dBo = await SLIP.decideSlip({ userId: OWNB }, { tenantId: A }, sX.id, { decision: "REJECT", reason: "ข้ามร้าน" });
    rec("XT-2", dB?.ok === false && dX?.ok === false && dBo?.ok === false, "BLOCKER",
      "ทางกลาง decideSlip (R1): ผู้ถือ dorm.slip.review ของหน่วย A ตัดสินสลิปจองคิว (BOOKING) ในหน่วยเดียวกันไม่ได้ · สลิปหอหน่วย B ไม่ได้ · ผู้ใช้ร้าน B ไม่ได้",
      { booking: dB?.ok ? "OK!" : dB?.code, otherUnit: dX?.ok ? "OK!" : dX?.code, otherShop: dBo?.ok ? "OK!" : dBo?.code });
    const dDep = await SLIP.decideSlip({ userId: REV }, { tenantId: A }, sDep.id, { decision: "REJECT", reason: "ไม่ใช่บิลหอ" });
    rec("XT-3", dDep?.ok === false, "LOW",
      "R1 มติผู้คุม \"รับ dorm.slip.review สำหรับสลิป DORM_BILL\": โค้ดเปิดตาม domain DORM ทั้งโดเมน (refType อื่นของหอในอนาคต เช่น เงินประกัน ⇒ ผู้ตรวจบิลตัดสินได้) — ตอนนี้ไม่มี refType อื่นในผลิตภัณฑ์",
      { dormDeposit: dDep?.ok ? `OK (${dDep.status})` : dDep?.code });
    await invariants("XT", ["134"]);
  }

  // ═══════════ BZ-0 รวม: ไม่มี 40P01/P2002/throw ผิดชนิดรั่วจากทุกการยิงพร้อมกัน ═══════════
  const hard = hardOf(ALL_OUT.filter((x) => x?.op !== "voidBill" && x?.op !== "adjustSentBill"));
  rec("BZ-0", !hard.length, "MAJOR", `ทุกการยิงพร้อมกันของ probe (${ALL_OUT.length} ผล · ไม่นับโพรเซสที่ถูกฆ่า) ไม่มี P2002/P2028/40P01/deadlock/FAILED/throw ผิดชนิดรั่วถึงผู้เรียก`, { hard: hard.slice(0, 6).map((x) => J(x).slice(0, 200)) });
} catch (e) {
  console.log(`💥 CRASH: ${e instanceof Error ? e.stack : String(e)}`);
  exitCode = 2;
} finally {
  await cleanup(tenantIds);
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d10pb-" } } });
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d10pb-" } } });
  const lu = await prisma.user.count({ where: { email: { startsWith: "svc-d10pb-" } } });
  console.log(`\n── ล้าง: tenant ค้าง ${left} · user ค้าง ${lu} ──`);
  const bad = results.filter((r) => !r.ok);
  console.log(`\nPROBE_SUMMARY ${J({ total: results.length, fail: bad.map((r) => `${r.id}:${r.sev}`) })}`);
  await prisma.$disconnect();
  process.exit(exitCode || (bad.length ? 1 : 0));
}

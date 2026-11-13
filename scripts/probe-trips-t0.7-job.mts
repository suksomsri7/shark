// probe-trips-t0.7-job.mts — นักล่า T0.7a (F): งาน trips.paymentDue บนร้านตัวเองเท่านั้น (tenantIds) ด้วยนาฬิกาฉีด
//   F1 ถูกต้อง+รันซ้ำ · F2 มากกว่าหนึ่งหน้า (> 200 งวด) · F3 งาน ∥ รับเงินบนงวดเดียวกัน (AUTO_RELEASE) · F4 งาน ∥ งาน · F5 HOLD/PAID ไม่ถูกแตะ
// ใช้: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.7-job.mts [--only=F1,F2,F3,F4] [--bulk=110]
import {
  boot, call, code, out, q, mkShop, mkDep, setV, unitSet, mkBk, pay, duesOf, reqsOf, bkRow, opAdd, summary, finding, withdraw, staff,
  allMoneyInv, dbStats, connSampler, cleanup, sweepStale, shutdown, mods, fnOf, asRec, sleep,
  type Rec, type Shop, type Bk,
} from "./probe-trips-t0.7-lib.mjs";

boot("probe-trips-t0.7-job");
const only = (process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "F1,F2,F3,F4").split(",");
const BULK = Number(process.argv.find((a) => a.startsWith("--bulk="))?.slice(7) ?? "110");
const DT = { date: "2027-03-30" }; // มัดจำครบกำหนดตอนจอง (1 มี.ค.) · ส่วนที่เหลือ 20 วันก่อน = 10 มี.ค.
const H = 3_600_000;

let job: (now: Date, o: Rec) => Promise<Rec>;
const runJob = async (sh: Shop[], now: Date) => { try { return asRec(await job(now, { tenantIds: sh.map((s) => s.tenantId) })); } catch (e) { return { THROW: String(e) }; } };
const ob = async (sh: Shop, type: string) => q<{ idempotencyKey: string; payload: Rec }>(`SELECT "idempotencyKey", payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = $2`, [sh.tenantId, type]);
async function check(sh: Shop, label: string) {
  const bad = await allMoneyInv(sh);
  out("inv", label, bad.length ? bad.slice(0, 30) : "clean");
  if (bad.length) finding(`INV-${label}`, "BLOCKER", `invariants broken after ${label}`, bad.slice(0, 30));
}

async function F1(shN: Shop, shA: Shop) {
  const bs: Bk[] = []; for (let i = 0; i < 6; i++) bs.push(await mkBk(shN, DT));
  const ba: Bk[] = []; for (let i = 0; i < 6; i++) ba.push(await mkBk(shA, DT));
  await pay(bs[0], Number((await duesOf(bs[0].id))[0]?.amountSatang)); // มัดจำครบ
  await pay(ba[0], Number((await duesOf(ba[0].id))[0]?.amountSatang));
  await pay(ba[1], 1); // งวดแรกบางส่วน
  const d1 = new Date(String((await duesOf(bs[0].id))[1]?.dueAt)); // ส่วนที่เหลือ
  const times = [new Date(d1.getTime() - 8 * 24 * H), new Date(d1.getTime() - 6 * 24 * H), new Date(d1.getTime() - 12 * H), new Date(d1.getTime() + 23 * H), new Date(d1.getTime() + 25 * H), new Date(d1.getTime() + 26 * H), new Date(d1.getTime() + 26 * H)];
  const rr: Rec[] = [];
  for (const t of times) rr.push({ t: t.toISOString(), r: await runJob([shN, shA], t) });
  opAdd("F", times.length);
  out("F1-runs", rr);
  const rem = await ob(shN, "trips.payment.due_soon"); const ovN = await ob(shN, "trips.payment.overdue"); const ovA = await ob(shA, "trips.payment.overdue");
  const reqN = await q(`SELECT count(*)::int n FROM "TripRefundRequest" WHERE "tenantId" = $1`, [shN.tenantId]);
  const reqA = await q<{ bookingId: string; status: string; by: string }>(`SELECT "bookingId", status, by FROM "TripRefundRequest" WHERE "tenantId" = $1`, [shA.tenantId]);
  const dueSt = async (sh: Shop) => (await q<{ status: string; n: number }>(`SELECT status, count(*)::int n FROM "TripPaymentDue" WHERE "tenantId" = $1 GROUP BY status`, [sh.tenantId]));
  out("F1", { remindersN: rem.length, remKeys: [...new Set(rem.map((x) => x.idempotencyKey.split(":").pop()))], overdueN: ovN.length, overdueA: ovA.length, reqN: reqN[0], reqA: reqA.length, dueN: await dueSt(shN), dueA: await dueSt(shA) });
  // ทุกการจองของ shA ต้องมีคำขอ ≤ 1 · การจองจ่ายมัดจำครบ (ba[0]) ได้คำขอเพราะส่วนที่เหลือเลยกำหนด
  const per = new Map<string, number>(); for (const r of reqA) per.set(r.bookingId, (per.get(r.bookingId) ?? 0) + 1);
  if ([...per.values()].some((n) => n > 1)) finding("F1-multi-req", "BLOCKER", "AUTO_RELEASE filed >1 request per booking", [...per]);
  if (Number(asRec(reqN[0]).n) !== 0) finding("F1-notify-req", "MAJOR", "NOTIFY_SHOP filed refund requests", reqN[0]);
  // ถอนคำขอ AUTO_RELEASE แล้วรันงานอีก ⇒ ห้ามยื่นใหม่ซ้ำ ๆ (หรือยื่นใหม่? รายงานพฤติกรรม)
  const one = reqA[0];
  if (one) {
    const rq = (await reqsOf(one.bookingId))[0];
    const w = await withdraw(shA, String(rq.id));
    await runJob([shA], new Date(d1.getTime() + 48 * H)); await runJob([shA], new Date(d1.getTime() + 72 * H));
    const after = await reqsOf(one.bookingId);
    const p = await pay({ ...ba[0], id: one.bookingId } as Bk, 1);
    out("F1-withdraw-rerun", { withdraw: code(w), reqs: after.map((x) => x.status), payAfterWithdraw: code(p) });
  }
  await check(shN, "F1-N"); await check(shA, "F1-A");
}

async function F2(shN: Shop) {
  const deps: string[] = []; for (let i = 0; i < 4; i++) deps.push(await mkDep(shN, { ...DT, capacity: 400 }));
  const bs: Bk[] = [];
  for (let i = 0; i < BULK; i += 10) bs.push(...(await Promise.all(Array.from({ length: Math.min(10, BULK - i) }, (_, k) => mkBk(shN, { dep: deps[(i + k) % 4], a: 1, camera: false })))));
  const nDues = Number(asRec((await q(`SELECT count(*)::int n FROM "TripPaymentDue" WHERE "tenantId" = $1 AND status IN ('OPEN','PARTLY_PAID')`, [shN.tenantId]))[0]).n);
  const t = new Date(new Date(String((await duesOf(bs[0].id))[1]?.dueAt)).getTime() + 30 * H);
  const t0 = Date.now(); const r1 = await runJob([shN], t); const ms1 = Date.now() - t0;
  const r2 = await runJob([shN], new Date(t.getTime() + H));
  const st = await q(`SELECT status, count(*)::int n FROM "TripPaymentDue" WHERE "tenantId" = $1 GROUP BY status`, [shN.tenantId]);
  const ov = await ob(shN, "trips.payment.overdue");
  opAdd("F", BULK + 2);
  out("F2", { bookings: bs.length, openDuesBefore: nDues, run1: { overdue: r1.overdue, reminders: r1.reminders, failed: r1.failed, ms: ms1 }, run2: { overdue: r2.overdue, failed: r2.failed }, statuses: st, overdueEvents: ov.length });
  const openLeft = st.find((x) => x.status === "OPEN" || x.status === "PARTLY_PAID");
  if (openLeft) finding("F2-paging", "MAJOR", "dues left OPEN after >1 page run", st);
  if (ov.length !== nDues) finding("F2-events", "MAJOR", "overdue events != dues", { ev: ov.length, nDues });
  await check(shN, "F2");
}

async function F3(shA: Shop) {
  // งวดส่วนที่เหลือ: ลูกค้าจ่ายพอดีขณะงานเลยกำหนดวิ่ง (AUTO_RELEASE)
  const pairs: Rec[] = []; let raceHits = 0; let dl = 0;
  for (let round = 0; round < 5; round++) {
    const bs: Bk[] = [];
    for (let i = 0; i < 8; i++) { const b = await mkBk(shA, DT); await pay(b, Number((await duesOf(b.id))[0]?.amountSatang)); bs.push(b); }
    const d1 = new Date(String((await duesOf(bs[0].id))[1]?.dueAt)); const t = new Date(d1.getTime() + 25 * H);
    const d0 = (await dbStats()).deadlocks;
    const rs = await Promise.all([
      runJob([shA], t),
      ...bs.map(async (b, k) => { await sleep((k % 8) * 35 + round * 10); const due = (await duesOf(b.id))[1]; return pay(b, Number(due?.amountSatang) - Number(due?.paidSatang), { now: t.toISOString() }); }),
    ]);
    dl += (await dbStats()).deadlocks - d0;
    for (const [k, b] of bs.entries()) {
      const bk = await bkRow(b.id); const rq = await reqsOf(b.id); const due = (await duesOf(b.id))[1];
      pairs.push({ round, k, pay: code(rs[k + 1]), status: bk.status, due: due?.status, reqs: rq.map((x) => x.status) });
      if (bk.status === "PAID" && rq.some((x) => ["QUOTED", "APPROVED"].includes(String(x.status)))) { raceHits++; finding("F3-autorelease-after-paid", "MAJOR", "AUTO_RELEASE filed a refund request on a booking that had already paid the overdue due", { b: b.id, due: due?.status, reqs: rq.map((x) => [x.status, x.by]) }); }
    }
    out("F3-run", { round, job: rs[0] });
  }
  opAdd("F", 5 * 9);
  const t: Record<string, number> = {}; for (const p of pairs) { const k = `${p.pay}|${p.status}|${p.due}|${(p.reqs as string[]).join(",")}`; t[k] = (t[k] ?? 0) + 1; }
  out("F3", { outcomes: t, raceHits, deadlocksDbWide: dl });
  await check(shA, "F3");
}

async function F3b(shA: Shop) {
  // งวดมัดจำเลยกำหนด (การจอง CONFIRMED): ลูกค้าจ่ายมัดจำขณะงานกำลังวิ่งทีละแถว ⇒ หน้าต่างระหว่าง CAS OVERDUE กับการยื่นคำขอ SYSTEM
  const N = Number(process.env.T07_N ?? 40); const bs: Bk[] = [];
  for (let i = 0; i < N; i += 10) bs.push(...(await Promise.all(Array.from({ length: Math.min(10, N - i) }, () => mkBk(shA, { ...DT, a: 1, camera: false })))));
  const d0 = new Date(String((await duesOf(bs[0].id))[0]?.dueAt)); const t = new Date(d0.getTime() + 30 * H);
  const tj = Date.now();
  const rs = await Promise.all([
    runJob([shA], t),
    ...bs.map(async (b, k) => { await sleep(Math.max(0, k * Number(process.env.T07_SP ?? 230) + Math.floor(Math.random() * 400) - 250)); const due = (await duesOf(b.id))[0]; return pay(b, Number(due?.amountSatang), { now: t.toISOString() }); }),
  ]);
  const jobMs = Date.now() - tj;
  const out_: Record<string, number> = {}; const hits: Rec[] = [];
  for (const [k, b] of bs.entries()) {
    const bk = await bkRow(b.id); const rq = await reqsOf(b.id); const due = (await duesOf(b.id))[0];
    const key = `${code(rs[k + 1])}|${bk.status}|dep:${due?.status}|${rq.map((x) => x.status).join(",")}`; out_[key] = (out_[key] ?? 0) + 1;
    if (due?.status === "PAID" && rq.some((x) => ["QUOTED", "APPROVED"].includes(String(x.status)))) hits.push({ b: b.id, booking: bk.status, paid: bk.paidSatang, reqAmount: rq[0]?.amountSatang, reqComputedPaid: asRec(rq[0]?.computed).paidSatang });
  }
  opAdd("F", N + 1);
  out("F3b", { job: rs[0], jobMs, outcomes: out_, hits: hits.length, sample: hits.slice(0, 3) });
  if (hits.length) finding("F3b-autorelease-after-cure", "MAJOR", "AUTO_RELEASE filed a SYSTEM refund request (seats will be released on approval) for a booking whose overdue deposit was paid between the job's OVERDUE CAS and the request — runPaymentDue does not re-check the due under the booking lock before filing", { hits: hits.length, of: N, sample: hits.slice(0, 3) });
  await check(shA, "F3b");
}

async function F4(shA: Shop, shN: Shop) {
  // งาน ∥ งาน (สองคำสั่งพร้อมกัน ×5) บนการจองใหม่ + การจอง HOLD/PAID ต้องไม่ถูกแตะ
  const bs: Bk[] = []; for (let i = 0; i < 10; i++) bs.push(await mkBk(i % 2 ? shA : shN, DT));
  const hold = await mkBk(shA, { ...DT, pay: "PAY_NOW" }); const paid = await mkBk(shA, DT); await pay(paid, paid.payable);
  const t = new Date(new Date(String((await duesOf(bs[0].id))[1]?.dueAt)).getTime() + 25 * H);
  const d0 = (await dbStats()).deadlocks;
  const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => runJob([shA, shN], new Date(t.getTime() + i * 60_000))));
  const dl = (await dbStats()).deadlocks - d0;
  const reqs = await q<{ bookingId: string; n: number }>(`SELECT "bookingId", count(*)::int n FROM "TripRefundRequest" WHERE "tenantId" = $1 GROUP BY "bookingId"`, [shA.tenantId]);
  out("F4", { runs: rs.map((r) => ({ o: r.overdue, a: r.autoReleased, f: r.failed, T: r.THROW })), deadlocksDbWide: dl, reqsPerBooking: reqs.map((x) => x.n), holdDues: (await duesOf(hold.id)).map((d) => d.status), holdStatus: (await bkRow(hold.id)).status, paidDues: (await duesOf(paid.id)).map((d) => d.status) });
  opAdd("F", 6);
  if (reqs.some((x) => x.n > 1)) finding("F4-dup-req", "BLOCKER", "parallel job runs filed >1 request", reqs);
  if ((await duesOf(hold.id)).some((d) => d.status === "OVERDUE")) finding("F4-hold-touched", "MAJOR", "job touched HOLD dues", {});
  await check(shA, "F4-A"); await check(shN, "F4-N");
}

async function main() {
  await sweepStale();
  const { T } = await mods(); job = fnOf(T, "runPaymentDue") as unknown as typeof job;
  const shN = await mkShop("jn"); const shA = await mkShop("ja");
  const DEP = [unitSet("U", "trips.pay.depositPct", 30), unitSet("U", "trips.pay.balanceDueDaysBefore", 20), unitSet("U", "trips.pay.reminderDaysBefore", [7, 1])];
  await setV(shN, DEP.map((c) => ({ ...c, scopeId: shN.unitId })));
  await setV(shA, [...DEP.map((c) => ({ ...c, scopeId: shA.unitId })), unitSet(shA.unitId, "trips.pay.overdueAction", "AUTO_RELEASE")]);
  const d0 = (await dbStats()).deadlocks; const stopS = connSampler(); const t0 = Date.now();
  try {
    if (only.includes("F1")) await F1(shN, shA);
    if (only.includes("F3")) await F3(shA);
    if (only.includes("F3b")) { const shC = await mkShop("jc"); await setV(shC, [...DEP.map((c) => ({ ...c, scopeId: shC.unitId })), unitSet(shC.unitId, "trips.pay.overdueAction", "AUTO_RELEASE")]); await F3b(shC); }
    if (only.includes("F4")) await F4(shA, shN);
    if (only.includes("F2")) { const shB = await mkShop("jb"); await setV(shB, DEP.map((c) => ({ ...c, scopeId: shB.unitId }))); await F2(shB); }
    const other = await q(`SELECT count(*)::int n FROM "OutboxEvent" WHERE type LIKE 'trips.payment.%' AND "createdAt" > now() - interval '1 hour' AND "tenantId" NOT IN (SELECT id FROM "Tenant" WHERE slug LIKE 'trips-t07h-%')`);
    out("F-foreign-tenant-events-last-hour (should be 0 from this probe; other runs may add)", other[0]);
  } catch (e) { finding("PROBE-CRASH", "INFO", "probe crashed", String(e instanceof Error ? e.stack : e).slice(0, 1500)); }
  finally {
    const cs = await stopS();
    summary("job", { wallMs: Date.now() - t0, deadlocksDbWideDelta: (await dbStats()).deadlocks - d0, conn: cs });
    await cleanup(); await shutdown();
  }
}
await main();

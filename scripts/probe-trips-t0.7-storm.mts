// probe-trips-t0.7-storm.mts — นักล่า T0.7a (K): ผู้เรียก 80 ขนานแบบผสม × หลายรอบ บนการจองชุดเดียวกัน
//   รับเงิน (คีย์ซ้ำ/ต่าง · ทุก tender) · QR · ยื่น/ตัดสิน/ถอน/บันทึกโอนคืน · งานงวด · ตัวกวาด · pay บน HOLD
//   วัด: รหัสผล · THROW/รั่ว · p50/p95/max · 40P01 ทั้งฐาน · การเชื่อมต่อสูงสุด/idle-in-tx · ค่าคงที่ M1–M7 + I1–I5 หลังทุกรอบ
// ใช้: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.7-storm.mts [--rounds=3] [--par=80] [--bk=24]
import {
  boot, call, code, out, q, mkShop, mkDep, setV, unitSet, mkBk, pay, reqRefund, decide, execute, withdraw, bkRow, reqsOf, duesOf, tally, pctl, opAdd, summary, finding, staff, pub,
  allMoneyInv, moneyControls, dbStats, connSampler, cleanup, sweepStale, shutdown, mods, fnOf, hex, asRec, addMin, NOW0, PAY_NOW,
  type Rec, type Shop, type Bk,
} from "./probe-trips-t0.7-lib.mjs";

boot("probe-trips-t0.7-storm");
const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const ROUNDS = Number(arg("rounds", "3")); const PAR = Number(arg("par", "80")); const NBK = Number(arg("bk", "24"));
let seed = 777; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const TEND = ["CASH", "PROMPTPAY", "TRANSFER", "CARD"];

async function main() {
  await sweepStale();
  const { T } = await mods(); const job = fnOf(T, "runPaymentDue"); const sweep = fnOf(T, "runExpireHolds");
  const sh = await mkShop("ka");
  await setV(sh, [unitSet(sh.unitId, "trips.pay.depositPct", 30), unitSet(sh.unitId, "trips.pay.balanceDueDaysBefore", 20), unitSet(sh.unitId, "trips.pay.overdueAction", "AUTO_RELEASE"),
    unitSet(sh.unitId, "payments.receiver", { promptpayId: "0812345678", displayName: "ร้านล่า" })]);
  const d0 = (await dbStats()).deadlocks; const stopS = connSampler(); const t0 = Date.now();
  const all: Rec[] = []; const perRound: Rec[] = [];
  try {
    for (let round = 0; round < ROUNDS; round++) {
      const deps: string[] = []; for (let i = 0; i < 3; i++) deps.push(await mkDep(sh, { date: "2027-03-25", capacity: 200 }));
      const bs: Bk[] = [];
      for (let i = 0; i < NBK; i += 8) bs.push(...(await Promise.all(Array.from({ length: Math.min(8, NBK - i) }, (_, k) => mkBk(sh, { dep: deps[(i + k) % 3], a: 1 + ((i + k) % 3), pay: (i + k) % 6 === 5 ? "PAY_NOW" : "PAY_LATER" })))));
      // ตั้งต้น: ครึ่งหนึ่งจ่ายมัดจำ · บางใบยื่นคำขอ+อนุมัติแล้ว
      for (const [i, b] of bs.entries()) if (b.status !== "HOLD" && i % 2 === 0) await pay(b, Number((await duesOf(b.id))[0]?.amountSatang), { tender: pick(TEND) });
      for (const [i, b] of bs.entries()) if (b.status !== "HOLD" && i % 3 === 1) { if (i % 2) await pay(b, 123_457, { tender: pick(TEND) }); const r = await reqRefund(b, { now: addMin(NOW0, 2) }); if (r.ok === true) await decide(sh, String(asRec(r.value).requestId), { now: addMin(NOW0, 2) }); }
      const sharedKeys = Array.from({ length: 6 }, () => `sk${hex(5)}`);
      const now = addMin(NOW0, 3);
      const ops: (() => Promise<Rec>)[] = [];
      for (let i = 0; i < PAR; i++) {
        const b = pick(bs); const r = rnd();
        if (r < 0.32) ops.push(() => pay(b, 1 + Math.floor(rnd() * 400_000), { tender: pick(TEND), now, key: rnd() < 0.3 ? pick(sharedKeys) : undefined }));
        else if (r < 0.40) ops.push(() => call("tripPaymentIntent", rnd() < 0.5 ? staff(sh, { now }) : pub(sh, { now }), rnd() < 0.5 ? { bookingId: b.id } : { publicToken: b.token }));
        else if (r < 0.52) ops.push(() => reqRefund(b, { now: addMin(now, 1) }));
        else if (r < 0.64) ops.push(async () => { const rq = (await reqsOf(b.id)).find((x) => x.status === "QUOTED"); return rq ? decide(sh, String(rq.id), { decision: rnd() < 0.8 ? "APPROVE" : "REJECT", now: addMin(now, 2) }) : { ok: true, value: "noop" } as Rec; });
        else if (r < 0.68) ops.push(async () => { const rq = (await reqsOf(b.id)).find((x) => x.status === "QUOTED"); return rq ? withdraw(sh, String(rq.id)) : { ok: true, value: "noop" } as Rec; });
        else if (r < 0.82) ops.push(async () => { const rq = (await reqsOf(b.id)).find((x) => x.status === "APPROVED"); return rq ? execute(sh, String(rq.id), { now: addMin(now, 3) }) : { ok: true, value: "noop" } as Rec; });
        else if (r < 0.86) ops.push(async () => { const t1 = Date.now(); try { const x = await job(new Date(rnd() < 0.7 ? "2027-03-01T23:00:00Z" : "2027-03-07T05:00:00Z"), { tenantIds: [sh.tenantId] }); return { ok: true, value: x, __ms: Date.now() - t1, __job: 1 } as Rec; } catch (e) { return { ok: "THROW", e: String(e), __job: 1 } as Rec; } });
        else if (r < 0.88) ops.push(async () => { try { await sweep(new Date(addMin(NOW0, 40)), { tenantIds: [sh.tenantId] }); return { ok: true, value: "sweep" } as Rec; } catch (e) { return { ok: "THROW", e: String(e) } as Rec; } });
        else if (r < 0.94) ops.push(() => call("tripMoneySummary", staff(sh), { bookingId: b.id }));
        else ops.push(() => call("cancelTripBooking", staff(sh, { now: addMin(now, 1) }), { bookingId: b.id, mode: "EXECUTE", reason: "ยกเลิก", idempotencyKey: `kc${hex(6)}` }));
      }
      const dA = (await dbStats()).deadlocks; const tw = Date.now();
      const rs = await Promise.all(ops.map((f) => f().catch((e) => ({ ok: "THROW", e: String(e) }) as Rec)));
      const wall = Date.now() - tw; const dlr = (await dbStats()).deadlocks - dA;
      all.push(...rs);
      const busy = rs.filter((x) => x.code === "BUSY").length;
      const thr = rs.filter((x) => x.ok === "THROW");
      const bad = await allMoneyInv(sh);
      const res = { round, n: rs.length, tally: tally(rs.filter((x) => !x.__job)), jobs: rs.filter((x) => x.__job).map((x) => ({ f: asRec(x.value).failed, o: asRec(x.value).overdue, a: asRec(x.value).autoReleased })), busy, throws: thr.slice(0, 5).map((x) => String(x.e).slice(0, 200)), wall, p50: pctl(rs, 0.5), p95: pctl(rs, 0.95), max: pctl(rs, 1), deadlocksDbWide: dlr, inv: bad.length ? bad.slice(0, 20) : "clean" };
      perRound.push(res); out("K-round", res);
      opAdd("K", rs.length);
      if (bad.length) finding(`K-inv-r${round}`, "BLOCKER", "invariants broken under storm", bad.slice(0, 20));
      if (thr.length) finding(`K-throw-r${round}`, "MAJOR", "raw throw escaped", thr.slice(0, 3).map((x) => x.e));
      if (busy) finding(`K-busy-r${round}`, "MINOR", "BUSY results under 80 parallel callers", { busy, of: rs.length });
      if (dlr) finding(`K-deadlock-r${round}`, "MAJOR", "DB-wide deadlock counter moved during storm round (may include other sessions)", dlr);
    }
    out("controls", await moneyControls(sh));
  } catch (e) { finding("PROBE-CRASH", "INFO", "probe crashed", String(e instanceof Error ? e.stack : e).slice(0, 1500)); }
  finally {
    const cs = await stopS();
    summary("storm", { wallMs: Date.now() - t0, deadlocksDbWideDelta: (await dbStats()).deadlocks - d0, conn: cs, perRound });
    await cleanup(); await shutdown();
  }
}
await main();

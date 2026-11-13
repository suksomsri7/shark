// probe-trips-t0.6-deadlock.mts — นักล่า T0.6: ตะกร้า 2 บรรทัดคนละงวด (เดือนเดินทาง) ลำดับสลับกัน ⇒ ล็อกแถว SellCounter สลับลำดับ ⇒ 40P01
// กลุ่ม: MIX (ครึ่ง [พ.ค., เม.ย.] ครึ่ง [เม.ย., พ.ค.]) · SAME (ทุกตะกร้า [เม.ย., พ.ค.] = ตัวควบคุม) · PAIR (2 คำขอพร้อมกัน × N ครั้ง = ทำซ้ำขั้นต่ำ)
// ใช้: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.6-deadlock.mts [--n=40] [--pairs=20]
import { boot, call, code, out, q, mkShop, mkDep, staff, line, booker, quote, dbStats, cleanup, sweepStale, shutdown, hex, type Rec, type Shop } from "./probe-trips-t0.6-lib.mjs";

boot("probe-trips-t0.6-deadlock");
const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const N = Number(arg("n", "40"));
const PAIRS = Number(arg("pairs", "20"));
const tally = (rs: Rec[]) => { const m: Record<string, number> = {}; for (const r of rs) m[code(r)] = (m[code(r)] ?? 0) + 1; return m; };

async function prepared(sh: Shop, order: "AM" | "MA") {
  const apr = await mkDep(sh, { date: "2027-04-20", capacity: 4 });
  const may = await mkDep(sh, { date: "2027-05-20", capacity: 4 });
  const ln = order === "AM" ? [line(sh.P, apr), line(sh.P, may)] : [line(sh.P, may), line(sh.P, apr)];
  const ctx = staff(sh);
  const qt = await quote(ctx, ln);
  return { ctx, body: { quote: { lines: ln }, quoteId: qt.quoteId, quoteExpiresAt: qt.expiresAt, idempotencyKey: `dl${hex(6)}`, booker: booker(), pay: { method: "PAY_LATER" } } };
}
async function wave(sh: Shop, label: string, orders: ("AM" | "MA")[]) {
  const reqs = await Promise.all(orders.map((o) => prepared(sh, o))); // ราคา/ใบเสนอ นอกการวัด
  const dl0 = (await dbStats()).deadlocks;
  const t0 = Date.now();
  const rs = await Promise.all(reqs.map((r) => call("bookTripsNow", r.ctx, r.body, {})));
  const wall = Date.now() - t0;
  const dl = (await dbStats()).deadlocks - dl0;
  const ms = rs.map((r) => Number(r.__ms) || 0).sort((a, b) => a - b);
  const res = { label, n: orders.length, tally: tally(rs), deadlocksDbWideDelta: dl, wallMs: wall, p50: ms[Math.floor(ms.length / 2)], max: ms[ms.length - 1] };
  out("wave", res);
  return res;
}

async function rekeyVsSweeper(sh: Shop, label: string, who: "PUBLIC" | "STAFF", rounds: number) {
  const { mods, fnOf, hold, confirm, pub, withNow } = await import("./probe-trips-t0.6-lib.mjs");
  const { T } = await mods();
  const sweep = fnOf(T, "runExpireHolds");
  let dl = 0; const all: Rec[] = []; let maxMs = 0;
  for (let r = 0; r < rounds; r++) {
    const hs = [];
    for (let i = 0; i < 12; i++) { const d = await mkDep(sh, { date: "2027-04-25", capacity: 4 }); hs.push(await hold(who === "PUBLIC" ? pub(sh) : staff(sh), [line(sh.P, d)])); }
    const exp = Math.min(...hs.map((h) => new Date(String(h.v.expiresAt)).getTime()));
    const dl0 = (await dbStats()).deadlocks;
    const rs = await Promise.all([
      ...hs.map((h) => confirm(h, { ctx: withNow(h.ctx, new Date(exp - 1000).toISOString()) })),
      (async () => { await new Promise((z) => setTimeout(z, 300 + (r % 10) * 120)); const t0 = Date.now(); const x = await sweep(new Date(exp + 1000), { tenantIds: [sh.tenantId] }); return { ok: true, value: x, __ms: Date.now() - t0 } as Rec; })(),
    ]);
    dl += (await dbStats()).deadlocks - dl0;
    all.push(...rs.slice(0, hs.length));
    maxMs = Math.max(maxMs, ...rs.map((x) => Number(x.__ms) || 0));
  }
  const res = { label, rounds, confirms: tally(all), deadlocksDbWideDelta: dl, maxMs };
  out("rekey", res);
  return res;
}

async function main() {
  await sweepStale();
  const sh = await mkShop("dl");
  const results: Rec[] = [];
  if (process.argv.includes("--only=RK")) {
    results.push(await rekeyVsSweeper(sh, "PUBLIC confirm (rekey first) ∥ sweeper", "PUBLIC", PAIRS));
    results.push(await rekeyVsSweeper(sh, "STAFF confirm (no rekey) ∥ sweeper — control", "STAFF", PAIRS));
    console.log("\n===== SUMMARY =====");
    console.log(JSON.stringify({ rk: results }, null, 1));
    return;
  }
  results.push(await wave(sh, "SAME order (control)", Array.from({ length: N }, () => "AM" as const)));
  results.push(await wave(sh, "MIX opposite order", Array.from({ length: N }, (_, i) => (i % 2 ? "MA" : "AM") as "AM" | "MA")));
  results.push(await wave(sh, "SAME order (control, again)", Array.from({ length: N }, () => "MA" as const)));
  results.push(await wave(sh, "MIX opposite order (again)", Array.from({ length: N }, (_, i) => (i % 2 ? "MA" : "AM") as "AM" | "MA")));
  // PAIR: minimal reproduction — 2 concurrent requests per trial
  const pr: Rec[] = [];
  let pairDl = 0;
  for (let t = 0; t < PAIRS; t++) {
    const w = await wave(sh, `pair ${t}`, ["AM", "MA"]);
    pairDl += Number(w.deadlocksDbWideDelta);
    pr.push(w);
  }
  const slowPairs = pr.filter((w) => Number(w.max) > 900).length;
  const ctrl: Rec[] = [];
  let ctrlDl = 0;
  for (let t = 0; t < PAIRS; t++) { const w = await wave(sh, `pair-ctrl ${t}`, ["AM", "AM"]); ctrlDl += Number(w.deadlocksDbWideDelta); ctrl.push(w); }
  const codes = await q<{ code: string }>(`SELECT code FROM "TripBooking" WHERE "tenantId" = $1`, [sh.tenantId]);
  console.log("\n===== SUMMARY =====");
  console.log(JSON.stringify({ waves: results, pairs: { trials: PAIRS, deadlocksDbWideDelta: pairDl, slowOver900ms: slowPairs, tallies: pr.map((w) => w.tally) }, pairControl: { trials: PAIRS, deadlocksDbWideDelta: ctrlDl, slowOver900ms: ctrl.filter((w) => Number(w.max) > 900).length }, bookings: codes.length }, null, 1));
}

let rc = 0;
try { await main(); } catch (e) { console.error("probe crashed", e); rc = 2; }
finally { try { await cleanup(); } catch (e) { console.error("cleanup", e); } await shutdown(); }
process.exit(rc);

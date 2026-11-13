// probe-trips-t0.7-round.mts — นักล่า T0.7a (E): ราคาแปลก × มัดจำ 1–100 % × มี/ไม่มีเงินเก็บแทน × ผ่อนหลายครั้งหลาย tender × คืนเงิน 50 % · ร้านไม่จด VAT · โค้ดส่วนลด
// ใช้: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.7-round.mts [--prices=..] [--pcts=..]
import {
  boot, call, code, out, q, mkShop, mkProd, setV, unitSet, mkBk, pay, reqRefund, decide, execute, evsOf, bkRow, opAdd, summary, finding, staff,
  allMoneyInv, moneyControls, dbStats, connSampler, cleanup, sweepStale, shutdown, hex, rid, insertRow, asRec, asArr, addMin, NOW0,
  type Rec, type Shop, type Bk, type Prod,
} from "./probe-trips-t0.7-lib.mjs";

boot("probe-trips-t0.7-round");
const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const PRICES = arg("prices", "990655,4345,1,99,107,10700,1145000,333333,0").split(",").map(Number);
const PCTS = arg("pcts", "1,7,33,50,99,100").split(",").map(Number);
const D = "2027-05-20";
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const TEND = ["CASH", "PROMPTPAY", "TRANSFER", "CARD"];

async function prodFor(sh: Shop, price: number, pt: boolean, pct: number): Promise<Prod> {
  const P = await mkProd(sh.tenantId, sh.unitId, `e${price}${pt ? "p" : "n"}${pct}${hex(2)}`);
  await q(`UPDATE "TripPrice" SET "amountMinor" = $2 WHERE "productId" = $1 AND "amountMinor" > 0`, [P.id, price]);
  if (!pt) await q(`UPDATE "TripExtra" SET active = false WHERE "productId" = $1 AND kind = 'PARK_FEE'`, [P.id]);
  await setV(sh, [{ key: "trips.pay.depositPct", scope: "PRODUCT", scopeId: P.id, value: pct }]);
  return P;
}
function splitAmount(total: number, k: number): number[] {
  if (total <= 0) return [];
  const parts: number[] = []; let left = total;
  for (let i = 0; i < k - 1 && left > 1; i++) { const a = Math.max(1, Math.floor(left * (0.05 + rnd() * 0.5))); parts.push(a); left -= a; }
  parts.push(left);
  return parts;
}

async function run(sh: Shop, label: string, refundEvery: number) {
  let nB = 0; let nP = 0; let nR = 0; const diffs: Rec[] = [];
  for (const price of PRICES) for (const pt of [true, false]) for (const pct of PCTS) {
    let b: Bk;
    try {
      const P = await prodFor(sh, price, pt, pct);
      b = await mkBk(sh, { P, date: D, a: 1, camera: false });
    } catch (e) { out("E-book-fail", { price, pt, pct, e: String(e).slice(0, 200) }); continue; }
    nB++;
    const sched = asArr(b.snap.paymentSchedule).map((x) => [x.kind, x.amountSatang, x.vatableSatang, x.passThroughSatang]);
    const k = 1 + Math.floor(rnd() * 6);
    const parts = splitAmount(b.payable, k);
    const codes: string[] = [];
    for (const a of parts) { const r = await pay(b, a, { tender: TEND[Math.floor(rnd() * 4)] }); codes.push(code(r)); nP++; }
    if (b.payable === 0) { const r = await pay(b, 1); codes.push(`zero:${code(r)}`); const qr = await call("tripPaymentIntent", staff(sh), { bookingId: b.id }); codes.push(`zeroQR:${code(qr)}`); nP++; }
    if (codes.some((c) => c !== "ok" && !c.startsWith("zero"))) finding(`E-pay-${price}-${pt}-${pct}`, "MAJOR", "valid instalment refused", { price, pt, pct, sched, parts, codes });
    const sum = asRec((await call("tripMoneySummary", staff(sh), { bookingId: b.id })).value);
    const v = asRec(sum.vat); const nRcv = (await evsOf(b.id)).filter((e) => e.kind === "RECEIVED").length;
    const doc = asRec(sum.document);
    const row = await bkRow(b.id);
    const d = { price, pt, pct, payable: b.payable, sched, parts: parts.length, status: row.status, bookingVat: v.bookingVatSatang, rcvVat: v.receivedVatSatang, diff: v.receiptRoundingDiffSatang, docVat: doc.vatSatang, n: nRcv };
    diffs.push(d);
    if (Math.abs(Number(v.receiptRoundingDiffSatang)) > Math.max(0, nRcv - 1)) finding(`E-diff-${price}-${pt}-${pct}`, "MINOR", "Σ receipt VAT differs from booking VAT by more than n−1", d);
    if (Number(v.receivedVatSatang) - Number(v.bookingVatSatang) !== Number(v.receiptRoundingDiffSatang) && row.status === "PAID") finding(`E-diffcalc-${price}`, "MINOR", "receiptRoundingDiffSatang != Σvat − bookingVat", d);
    if (Number(doc.vatSatang) !== Number(v.bookingVatSatang)) finding(`E-docvat-${price}-${pt}-${pct}`, "MINOR", "moneyDocument.vatSatang != TripBooking.vatSatang", d);
    if (nB % refundEvery === 0 && b.payable > 0) {
      const r = await reqRefund(b, { now: addMin(NOW0, 60 * 24 * 60) }); // ~1 ก.ค. ⇒ ก่อนเดินทาง < 30 วัน ⇒ 50 %
      const id = String(asRec(r.value).requestId);
      const dd = await decide(sh, id); const x = await execute(sh, id);
      nR += 3;
      if (r.ok !== true || dd.ok !== true || x.ok !== true) finding(`E-refund-${price}-${pt}-${pct}`, "MAJOR", "refund flow failed", { r: code(r), d: code(dd), x: code(x), amount: asRec(r.value).amountSatang });
    }
  }
  opAdd("E", nB * 3 + nP + nR);
  out(`E-${label}`, { bookings: nB, payments: nP, refundCalls: nR });
  for (const d of diffs) if (Number(d.diff) !== 0) out("E-diff", d);
  const bad = await allMoneyInv(sh);
  out("inv", label, bad.length ? bad.slice(0, 40) : "clean");
  if (bad.length) finding(`INV-E-${label}`, "BLOCKER", "money invariants broken (rounding)", bad.slice(0, 40));
}

async function main() {
  await sweepStale();
  const sh = await mkShop("ea"); const shN = await mkShop("en");
  await setV(sh, [unitSet(sh.unitId, "trips.pay.balanceDueDaysBefore", 20)]);
  await setV(shN, [unitSet(shN.unitId, "trips.pay.balanceDueDaysBefore", 20), unitSet(shN.unitId, "trips.tax.vatRegistered", { registered: false, thresholdSatang: 180_000_000, warnAtPct: 90 })]);
  const d0 = (await dbStats()).deadlocks; const stopS = connSampler(); const t0 = Date.now();
  try {
    await run(sh, "vat", 2);
    if (!process.argv.includes("--skip-novat")) { PRICES.splice(4); await run(shN, "novat", 3); }
    // โค้ดส่วนลด 10 % บนราคาแปลก
    const codeStr = `T07E${hex(3)}`.toUpperCase();
    await insertRow("TripPriceRule", { id: rid("ru"), tenantId: sh.tenantId, unitId: sh.unitId, productId: null, kind: "PROMO_CODE", code: codeStr, params: JSON.stringify({ kind: "PROMO_CODE", code: codeStr, discountBp: 1_000, maxUses: 50 }), priority: 0, active: true, usedCount: 0, updatedAt: new Date() });
    for (const price of [990655, 4345, 107]) for (const pct of [33, 100]) {
      const P = await prodFor(sh, price, true, pct);
      try {
        const b = await mkBk(sh, { P, date: D, a: 3, camera: false, promo: codeStr });
        for (const a of splitAmount(b.payable, 4)) await pay(b, a, { tender: TEND[Math.floor(rnd() * 4)] });
        const r = await reqRefund(b, { now: addMin(NOW0, 60 * 24 * 60) }); await decide(sh, String(asRec(r.value).requestId)); const x = await execute(sh, String(asRec(r.value).requestId));
        out("E-promo", { price, pct, payable: b.payable, totals: b.snap.totals, refund: code(x) });
        opAdd("E", 10);
      } catch (e) { out("E-promo-fail", String(e).slice(0, 300)); }
    }
    const bad = await allMoneyInv(sh); out("inv", "promo", bad.length ? bad : "clean");
    if (bad.length) finding("INV-E-promo", "BLOCKER", "invariants (promo)", bad.slice(0, 30));
    out("controls", await moneyControls(sh));
  } catch (e) { finding("PROBE-CRASH", "INFO", "probe crashed", String(e instanceof Error ? e.stack : e).slice(0, 1500)); }
  finally {
    const cs = await stopS();
    summary("round", { wallMs: Date.now() - t0, deadlocksDbWideDelta: (await dbStats()).deadlocks - d0, conn: cs });
    await cleanup(); await shutdown();
  }
}
await main();

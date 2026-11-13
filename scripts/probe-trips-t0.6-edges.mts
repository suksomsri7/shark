// probe-trips-t0.6-edges.mts — นักล่า T0.6: E (แก้/เลื่อนวัน) H (คำอนุมัติราคา) I (แยกร้าน) J (token) K (อินพุต) T (TOCTOU) · ร้านชั่วคราว trips-t06h-*
// ใช้: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.6-edges.mts [--only=E,H,I,K,T,J] [--rounds=N]
import {
  boot, mods, fnOf, call, code, stats, out, fmt, asRec, asArr, hex, tok, rid, sleep, q, pool, NOW0, R, insertRow, sha256hex,
  mkShop, mkDep, mkProd, staff, pub, withNow, line, booker, quote, hold, confirm, confirmBody, bookNow, refs,
  allInv, invTenant, dbStats, connSampler, cleanup, sweepStale, shutdown, findings, finding,
  type Rec, type Shop, type H,
} from "./probe-trips-t0.6-lib.mjs";

boot("probe-trips-t0.6-edges");
const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const ONLY = new Set(arg("only", "E,H,I,K,T,X,J").split(","));
const ROUNDS = Number(arg("rounds", "5"));
const ops: Record<string, number> = {};
const bump = (w: string, n = 1) => { ops[w] = (ops[w] ?? 0) + n; };
const violations: Rec[] = [];
async function check(w: string, sh: Shop, deps: string[], ctx = "") {
  const b = await allInv(sh, deps);
  if (b.length) { violations.push({ w, ctx, b: b.slice(0, 10) }); out(`VIOL ${w}`, ctx, b.slice(0, 6)); }
  return b;
}
const par = <T,>(n: number, f: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => f(i)));
const tally = (rs: Rec[]) => { const m: Record<string, number> = {}; for (const r of rs) m[code(r)] = (m[code(r)] ?? 0) + 1; return m; };
const bkRow = async (id: unknown) => (await q<Rec>(`SELECT id, status, version, "departureId", "grossSatang", "discountSatang", code FROM "TripBooking" WHERE id = $1`, [String(id)]))[0] ?? {};
const qOk = async (ctx: Rec, lines: Rec[], opts: Rec = {}) => call("quoteTrips", ctx, { lines }, opts);
async function changeReq(sh: Shop, ctx: Rec, bookingId: string, ln: Rec, extra: Rec = {}, qopts: Rec = {}): Promise<Rec> {
  const b = await bkRow(bookingId);
  const qr = await qOk(ctx, [ln], qopts);
  if (qr.ok !== true) return { ...qr, __stage: "quote" };
  const qt = asRec(qr.value);
  return { bookingId, expectedVersion: Number(b.version), line: ln, quoteId: qt.quoteId, quoteExpiresAt: qt.expiresAt, idempotencyKey: `g${hex(6)}`, ...extra };
}
const change = async (ctx: Rec, req: Rec, opts: Rec = {}) => (req.__stage ? req : call("changeTripBooking", ctx, req, opts));

async function main() {
  await sweepStale();
  const { T } = await mods();
  const s0 = await dbStats();
  const sampler = connSampler();
  const sh = await mkShop("e");
  const shB = await mkShop("f");

  // ═══ E: change / move-date races ═══
  if (ONLY.has("E")) {
    for (let round = 0; round < ROUNDS; round++) {
      const A = await mkDep(sh, { date: "2027-04-03", capacity: 10 });
      const B = await mkDep(sh, { date: "2027-04-04", capacity: 4 });
      const b1 = refs((await bookNow(staff(sh), [line(sh.P, A, { a: 2 })])).r)[0];
      const b2 = refs((await bookNow(staff(sh), [line(sh.P, B, { a: 2 })])).r)[0];
      const b3 = refs((await bookNow(staff(sh), [line(sh.P, B, { a: 1 })])).r)[0]; // B: 3/4 sold → 1 left
      bump("E", 3);
      // E1 move b1 A→B (needs 2, 1 left) racing bookNow on B; E2 move b2 B→A ∥ (implicitly frees B); E3 double change of b3 same version
      const reqs = await Promise.all([
        changeReq(sh, staff(sh), String(b1.bookingId), line(sh.P, B, { a: 2 })),
        changeReq(sh, staff(sh), String(b2.bookingId), line(sh.P, A, { a: 2 })),
        changeReq(sh, staff(sh), String(b3.bookingId), line(sh.P, B, { a: 2 })),
        changeReq(sh, staff(sh), String(b3.bookingId), line(sh.P, A, { a: 1 })),
      ]);
      const rs = await Promise.all([
        change(staff(sh), reqs[0]), change(staff(sh), reqs[1]), change(staff(sh), reqs[2]), change(staff(sh), reqs[3]),
        bookNow(staff(sh), [line(sh.P, B, { a: 1 })]).then((x) => x.r),
        call("cancelTripBooking", staff(sh), { bookingId: String(b1.bookingId), mode: "EXECUTE", reason: "race", idempotencyKey: `x${hex(6)}` }),
      ]);
      bump("E", 6);
      const b3rs = [rs[2], rs[3]].filter((r) => r.ok === true).length;
      out(`E r${round}`, rs.map(code), "b3 both-ok?", b3rs);
      if (b3rs > 1) finding("E-doublechange", "BLOCKER", "two changes with the same expectedVersion both succeeded", rs.map(code));
      await check("E", sh, [A, B], `round ${round}`);
      // move A→B ∥ B→A (two bookings, both directions) ×5 pairs
      const pairs = [];
      const SA = await mkDep(sh, { date: "2027-04-03", capacity: 6 });
      const SB = await mkDep(sh, { date: "2027-04-04", capacity: 6 });
      for (let k = 0; k < 5; k++) {
        const x = refs((await bookNow(staff(sh), [line(sh.P, SA, { a: 1 })])).r)[0];
        const y = refs((await bookNow(staff(sh), [line(sh.P, SB, { a: 1 })])).r)[0];
        bump("E", 2);
        if (x && y) pairs.push([x, y]);
      }
      const mv = await Promise.all(pairs.flatMap(([x, y]) => [
        changeReq(sh, staff(sh), String(x.bookingId), line(sh.P, SB, { a: 1 })).then((rq) => change(staff(sh), rq)),
        changeReq(sh, staff(sh), String(y.bookingId), line(sh.P, SA, { a: 1 })).then((rq) => change(staff(sh), rq)),
      ]));
      bump("E", mv.length);
      out(`E r${round} swap`, tally(mv));
      if (mv.some((r) => r.ok === "THROW" || r.code === "BUSY")) finding("E-swap", "MAJOR", "A→B ∥ B→A threw/BUSY", tally(mv));
      await check("E", sh, [SA, SB], `swap ${round}`);
    }
    // E4: +1 pax on the same departure, 10 parallel changes, 1 seat left
    {
      const D = await mkDep(sh, { date: "2027-04-05", capacity: 11 });
      const bs = [];
      for (let i = 0; i < 10; i++) bs.push(refs((await bookNow(staff(sh), [line(sh.P, D, { a: 1 })])).r)[0]);
      const reqs = await Promise.all(bs.map((b) => changeReq(sh, staff(sh), String(b.bookingId), line(sh.P, D, { a: 2 }))));
      const rs = await Promise.all(reqs.map((rq) => change(staff(sh), rq)));
      bump("E", 20);
      out("E grow ×10 last seat", tally(rs));
      if (rs.filter((r) => r.ok === true).length !== 1) finding("E-grow", "BLOCKER", "grow-by-1 with one seat left: ok ≠ 1", tally(rs));
      await check("E", sh, [D], "grow");
    }
    // E5: move to a departure of ANOTHER product while keeping productId; and line.optionId of other option
    {
      const A = await mkDep(sh, { date: "2027-04-06" });
      const X = await mkDep(sh, { date: "2027-04-06", P: sh.P2 });
      const b = refs((await bookNow(staff(sh), [line(sh.P, A, { a: 1 })])).r)[0];
      const rq = await changeReq(sh, staff(sh), String(b.bookingId), { ...line(sh.P, X, { a: 1 }) });
      const r = await change(staff(sh), rq); bump("E", 2);
      const row = await bkRow(b.bookingId);
      const depP = (await q<{ productId: string }>(`SELECT "productId" FROM "TripDeparture" WHERE id = $1`, [String(row.departureId)]))[0]?.productId;
      out("E move to other product's departure (productId kept)", code(r), "booking.productId=P", depP === sh.P.id ? "dep matches" : "DEP OF OTHER PRODUCT");
      if (r.ok === true && depP !== sh.P.id) finding("E-crossproduct", "MAJOR", "changeTripBooking moved a booking onto a departure of a different product (booking.productId ≠ departure.productId)", { r: code(r) });
      await check("E", sh, [A, X], "crossproduct");
    }
    // E6: promo booking changed → redemption stays ACTIVE although discount gone
    {
      const A = await mkDep(sh, { date: "2027-04-07" });
      const pc = `EP${hex(2)}`.toUpperCase();
      const rule = await insertRow("TripPriceRule", { id: rid("ru"), tenantId: sh.tenantId, unitId: sh.unitId, productId: null, kind: "PROMO_CODE", code: pc, params: JSON.stringify({ kind: "PROMO_CODE", code: pc, discountBp: 1000, maxUses: 5 }), priority: 0, active: true, usedCount: 0, updatedAt: new Date() });
      const b = refs((await bookNow(staff(sh), [line(sh.P, A, { a: 2, promo: pc })])).r)[0];
      const before = await bkRow(b?.bookingId);
      const rq = await changeReq(sh, staff(sh), String(b?.bookingId), line(sh.P, A, { a: 3 }));
      const r = await change(staff(sh), rq); bump("E", 2);
      const after = await bkRow(b?.bookingId);
      const red = await q<Rec>(`SELECT status, "discountSatang" FROM "TripPromoRedemption" WHERE "bookingId" = $1`, [String(b?.bookingId)]);
      const used = (await q<Rec>(`SELECT "usedCount" FROM "TripPriceRule" WHERE id = $1`, [rule]))[0];
      out("E change promo booking", code(r), "discount", before.discountSatang, "→", after.discountSatang, "redemption", red, used);
      if (r.ok === true && Number(after.discountSatang) === 0 && red.some((x) => x.status === "ACTIVE")) finding("E-promo", "MINOR", "change drops the promo discount from the booking but leaves the redemption ACTIVE (usedCount still counts it; per-contact quota stays consumed)", { before: before.discountSatang, after: after.discountSatang, red, used });
    }
  }

  // ═══ H: price-override approvals ═══
  if (ONLY.has("H")) {
    const d = await mkDep(sh, { date: "2027-04-08", capacity: 40 });
    const OVR = (u: number) => [{ itemRef: "seat:ADULT", unitMinor: u, reason: "ลูกค้าประจำ ส่วนลดพิเศษจากเจ้าของ" }];
    const mkAp = async (tenantId: string, o: Rec) => insertRow("ApprovalRequest", { id: rid("ap"), tenantId, policyId: rid("pol"), entityType: "trips.price_override", entityId: rid("e"), unitId: sh.unitId, status: "APPROVED", requestedById: sh.userId, decidedAt: new Date(), idempotencyKey: `h-${hex(6)}`, ...o });
    const tryBook = async (label: string, unitMinor: number, approvals: Rec[], o: { ctx?: Rec; ln?: Rec[] } = {}) => {
      const ctx = o.ctx ?? staff(sh); const ln = o.ln ?? [line(sh.P, d, { a: 1 })];
      const qopts = { overrides: OVR(unitMinor), canOverride: true, overrideApprovals: approvals.map((a) => ({ approvalId: a.approvalId, itemRef: a.itemRef, unitMinor: a.unitMinor, ...(a.resolvedMinor !== undefined ? { resolvedMinor: a.resolvedMinor } : {}) })) };
      const qr = await qOk(ctx, ln, qopts);
      bump("H", 2);
      if (qr.ok !== true) { out(`H ${label}`, "quote", code(qr)); return { stage: "quote", r: qr }; }
      const qt = asRec(qr.value);
      const r = await call("bookTripsNow", ctx, { quote: { lines: ln }, quoteId: qt.quoteId, quoteExpiresAt: qt.expiresAt, idempotencyKey: `ho${hex(6)}`, booker: booker(), pay: { method: "PAY_LATER" }, priceOverrides: OVR(unitMinor), overrideApprovals: approvals }, { canOverride: true });
      const g = refs(r)[0] ? (await bkRow(refs(r)[0].bookingId)).grossSatang : null;
      out(`H ${label}`, code(r), "gross", g);
      return { stage: "book", r };
    };
    const ap = (approvalId: string, unitMinor: number, resolvedMinor?: number) => ({ approvalId, itemRef: "seat:ADULT", unitMinor, ...(resolvedMinor !== undefined ? { resolvedMinor } : {}) });
    const good = await mkAp(sh.tenantId, { amountSatang: 200_000 });
    const h0 = await tryBook("H0 control: proper approval 200,000", 200_000, [ap(good, 200_000, R.adultSatang)]);
    const h1 = await tryBook("H1 same approval reused (2nd booking, same amount)", 200_000, [ap(good, 200_000, R.adultSatang)]);
    const h2 = await tryBook("H2 same approval, different amount 100,000", 100_000, [ap(good, 100_000, R.adultSatang)]);
    const leave = await mkAp(sh.tenantId, { entityType: "hr.leave", amountSatang: 1, unitId: sh.unit2 });
    const h3 = await tryBook("H3 approval of an unrelated entity (hr.leave, other unit, amount 1)", 1_000, [ap(leave, 1_000, R.adultSatang)]);
    const foreign = await mkAp(shB.tenantId, { unitId: shB.unitId });
    const h4 = await tryBook("H4 another tenant's approval id", 200_000, [ap(foreign, 200_000, R.adultSatang)]);
    const h5 = await tryBook("H5 missing resolvedMinor", 200_000, [ap(good, 200_000)]);
    const h6 = await tryBook("H6 wrong resolvedMinor", 200_000, [ap(good, 200_000, R.adultSatang + 1)]);
    const pend = await mkAp(sh.tenantId, { status: "PENDING", decidedAt: null });
    const h7 = await tryBook("H7 PENDING approval", 200_000, [ap(pend, 200_000, R.adultSatang)]);
    const rej = await mkAp(sh.tenantId, { status: "REJECTED" });
    const h8 = await tryBook("H8 REJECTED approval", 200_000, [ap(rej, 200_000, R.adultSatang)]);
    // H9: PUBLIC sends overrideApprovals without priceOverrides
    const lnp = [line(sh.P, d, { a: 1 })];
    const qp = await quote(pub(sh), lnp);
    const h9 = await call("holdTrips", pub(sh), { quote: { lines: lnp }, quoteId: qp.quoteId, quoteExpiresAt: qp.expiresAt, idempotencyKey: `hp${hex(6)}`, basketToken: tok(), overrideApprovals: [ap(good, 1, R.adultSatang)] }, {});
    bump("H");
    // H10 override without canOverride (service opts) on hold
    const qn = await qOk(staff(sh), lnp, { overrides: OVR(340_000), canOverride: true });
    const h10 = await call("holdTrips", staff(sh), { quote: { lines: lnp }, quoteId: asRec(qn.value).quoteId, quoteExpiresAt: asRec(qn.value).expiresAt, idempotencyKey: `hn${hex(6)}`, priceOverrides: OVR(340_000) }, {});
    bump("H", 2);
    out("H9 PUBLIC hold with overrideApprovals only", code(h9), "H10 hold override w/o canOverride", code(h10));
    const accepted = (x: { stage: string; r: Rec }) => x.stage === "book" && x.r.ok === true;
    const res = { h0: code(h0.r), h1: code(h1.r), h2: code(h2.r), h3: code(h3.r), h4: code(h4.r), h5: code(h5.r), h6: code(h6.r), h7: code(h7.r), h8: code(h8.r), h9: code(h9), h10: code(h10) };
    (globalThis as Rec).__H = res;
    if (accepted(h3)) finding("H-unbound", "MAJOR", "an APPROVED approval of an unrelated entity (entityType hr.leave, other unit, amountSatang 1) authorises a manual price of 1,000 satang — approvals are not bound to entityType/unit/amount/line", res);
    if (accepted(h1) && accepted(h2)) finding("H-reuse", "MAJOR", "one APPROVED approval id authorises unlimited bookings at any amount (reused for 3 bookings: 200,000 ×2 and 100,000)", res);
    if (accepted(h4) || accepted(h7) || accepted(h8)) finding("H-status", "BLOCKER", "foreign/pending/rejected approval accepted", res);
    await check("H", sh, [d], "H");
  }

  // ═══ I: isolation ═══
  if (ONLY.has("I")) {
    const d = await mkDep(sh, { date: "2027-04-09" });
    const ha = await hold(pub(sh), [line(sh.P, d)]);
    const hb = await hold(pub(sh), [line(sh.P, d)]);
    const bkA = refs((await bookNow(staff(sh), [line(sh.P, d, { a: 2 })])).r)[0];
    const pendA = refs(await confirm(await hold(staff(sh), [line(sh.P, d)]), { pay: "PAY_NOW" }))[0];
    bump("I", 6);
    const tB = staff(shB); const tBasA = { ...staff(shB), tenantId: shB.tenantId, unitId: sh.unitId }; const u2 = staff(sh, { unit: sh.unit2 });
    const actors: [string, Rec][] = [["tenantB-own-unit", tB], ["tenantB-ctx-with-unitA", tBasA], ["tenantA-unit2", u2]];
    const res: Rec = {};
    for (const [nm, ctx] of actors) {
      res[`${nm}:confirm`] = code(await call("confirmTrips", ctx, confirmBody(ha), {}));
      res[`${nm}:cancel`] = code(await call("cancelTripBooking", ctx, { bookingId: String(bkA?.bookingId), mode: "EXECUTE", reason: "x", idempotencyKey: `x${hex(6)}` }));
      res[`${nm}:cancelPend`] = code(await call("cancelTripBooking", ctx, { bookingId: String(pendA?.bookingId), mode: "EXECUTE", reason: "x", idempotencyKey: `x${hex(6)}` }));
      res[`${nm}:approve`] = code(await call("approveTripBooking", ctx, { bookingId: String(pendA?.bookingId), expectedVersion: 0, decision: "REJECT" }));
      res[`${nm}:get`] = code(await call("getTripBooking", ctx, { bookingId: String(bkA?.bookingId) }));
      res[`${nm}:change`] = code(await call("changeTripBooking", ctx, { bookingId: String(bkA?.bookingId), expectedVersion: 0, line: line(sh.P, d), quoteId: "x", quoteExpiresAt: "2099-01-01T00:00:00Z", idempotencyKey: `g${hex(6)}` }));
      res[`${nm}:list`] = fmt(asArr(asRec((await call("listTripBookings", ctx, {})).value).items).filter((x) => x.id === bkA?.bookingId).length);
      bump("I", 7);
    }
    // public: other basket's hold ids with own basket+token; correct basket wrong token; staff of same tenant confirming a public basket
    res["pub:mixHolds"] = code(await call("confirmTrips", ha.ctx, { ...confirmBody(ha), holdIds: hb.v.holdIds }, {}));
    res["pub:otherBasket-ownToken"] = code(await call("confirmTrips", ha.ctx, { ...confirmBody(ha), basketId: hb.v.basketId, holdIds: hb.v.holdIds }, {}));
    res["pub:noToken"] = code(await call("confirmTrips", ha.ctx, confirmBody(ha, { token: null }), {}));
    res["pub:cancel"] = code(await call("cancelTripBooking", pub(sh), { bookingId: String(bkA?.bookingId), mode: "EXECUTE", reason: "x", idempotencyKey: `x${hex(6)}` }));
    res["pub:get"] = code(await call("getTripBooking", pub(sh), { bookingId: String(bkA?.bookingId) }));
    res["staffA:confirm-public-basket"] = code(await call("confirmTrips", staff(sh), confirmBody(ha, { token: null }), {}));
    bump("I", 6);
    // T0.4 releaseHold on a hold bound to a HOLD booking (staff) and public with guessed contact capKey
    const ph = await hold(pub(sh), [line(sh.P, d)]);
    const phone = "0812345678";
    const pc = await confirm(ph, { booker: { name: "เหยื่อ", phone } }); // PUBLIC PAY_NOW ⇒ HOLD booking (KEEP)
    const hid = (ph.v.holdIds as string[])[0];
    const attacker = pub(sh);
    res["pub-attacker:releaseHold(contact capKey guessed from phone)"] = code(await call("releaseHold", attacker, { holdId: hid, reason: "x", capKey: "contact:tel:+66812345678" }));
    const bst = await bkRow(refs(pc)[0]?.bookingId);
    res["victim booking after attacker release"] = `${bst.status}`;
    const ph2 = await hold(pub(sh), [line(sh.P, d)]);
    const pc2 = await confirm(ph2);
    res["staff:releaseHold(booking-bound hold)"] = code(await call("releaseHold", staff(sh), { holdId: (ph2.v.holdIds as string[])[0], reason: "staff-release" }));
    res["booking after staff releaseHold"] = (await bkRow(refs(pc2)[0]?.bookingId)).status;
    bump("I", 7);
    out("I isolation", res);
    (globalThis as Rec).__I = res;
    const leaks = Object.entries(res).filter(([k, v]) => /^(tenantB|tenantA-unit2)/.test(k) && !k.endsWith(":list") && !/NOT_FOUND|HOLD_NOT_FOUND|FORBIDDEN|VALIDATION/.test(String(v)));
    if (leaks.length) finding("I-leak", "BLOCKER", "cross tenant/unit action not rejected", leaks);
    const inv = await check("I", sh, [d], "isolation");
    if (inv.some((x) => x.startsWith("I5-unpaid-nohold"))) finding("I-releasehold", "MAJOR", "T0.4 releaseHold releases the hold of a HOLD-status booking: booking stays HOLD with no seats held (I5); T0.6 did not guard booking-bound holds", inv.filter((x) => x.startsWith("I5")));
    // forged prepared via exported finalizeTripsInTx (internal API trust)
    {
      const shF = await mkShop("g");
      const d = await mkDep(shF, { date: "2027-04-09" });
      const sh = shF;
      const h = await hold(staff(sh), [line(sh.P, d)]);
      const prep = await call("prepareTripConfirm", staff(sh), confirmBody(h), {});
      const P = asRec(asRec(prep.value).prepared);
      const forged = { ...P, lines: asArr(P.lines).map((l) => ({ ...l, status: "CONFIRMED", holdMode: "KEEP", columns: { ...asRec(l.columns), grossSatang: 1, netToShopSatang: 1 } })) };
      const { D } = await mods();
      const db = asRec(fnOf(D, "tenantDb")({ tenantId: sh.tenantId, unitId: sh.unitId }) as unknown);
      let fr: Rec;
      try {
        fr = asRec(await (db.$transaction as (f: (tx: unknown) => Promise<unknown>) => Promise<unknown>).call(db, async (tx: unknown) => {
          const r = asRec(await fnOf(T, "finalizeTripsInTx")(tx, staff(sh), [], { prepared: forged, basketId: P.basketId }));
          return r;
        }));
      } catch (e) { fr = { ok: "THROW", e: String(e).slice(0, 200) }; }
      bump("I", 3);
      const fbId = asArr(asRec(fr.value).bookings)[0]?.bookingId;
      const fb = fbId ? await bkRow(fbId) : {};
      out("I forged prepared → finalizeTripsInTx", code(fr), fb);
      const inv2 = await check("I", sh, [d], "forged");
      if (fr.ok === true) finding("I-forged-prepared", "MINOR", "finalizeTripsInTx (exported on facade + tripSellable.finalizeInTx) trusts a caller-built `prepared` wholesale: forged status CONFIRMED + holdMode KEEP + grossSatang 1 accepted → CONFIRMED booking at 1 satang whose seats are only held (sold counter not incremented). Not reachable from any server action today (no caller in src)", { booking: fb, inv: inv2.slice(0, 4) });
      // restore invariant noise: cancel won't work on CONFIRMED; mark it so later checks don't double count — leave it, report
    }
  }

  // ═══ K: inputs ═══
  if (ONLY.has("K")) {
    const d = await mkDep(sh, { date: "2027-04-10", capacity: 60 });
    const res: Rec = {};
    const tryHold = async (label: string, ln: Rec[], ctx = staff(sh)) => {
      const qr = await qOk(ctx, ln);
      if (qr.ok !== true) { res[label] = `quote:${code(qr)}`; bump("K"); return null; }
      const qt = asRec(qr.value);
      const r = await call("holdTrips", ctx, { quote: { lines: ln }, quoteId: qt.quoteId, quoteExpiresAt: qt.expiresAt, idempotencyKey: `k${hex(6)}`, ...(asRec(ctx.actor).kind === "PUBLIC" ? { basketToken: tok() } : {}) }, {});
      res[label] = code(r); bump("K", 2);
      return r.ok === true ? { r, v: asRec(r.value), quote: qt, lines: ln, ctx, key: "", token: undefined } as H : null;
    };
    const P = sh.P;
    const L = (pax: Rec[], o: Rec = {}) => ({ ...line(P, d), pax, ...o });
    await tryHold("qty int4+1", [L([{ paxTypeId: P.pt.ADULT, qty: 2_147_483_648 }])]);
    await tryHold("qty int4max", [L([{ paxTypeId: P.pt.ADULT, qty: 2_147_483_647 }])]);
    await tryHold("qty 0", [L([{ paxTypeId: P.pt.ADULT, qty: 0 }])]);
    await tryHold("qty -1", [L([{ paxTypeId: P.pt.ADULT, qty: -1 }])]);
    await tryHold("qty 1.5", [L([{ paxTypeId: P.pt.ADULT, qty: 1.5 }])]);
    await tryHold("qty 51 (QTY_MAX+1)", [L([{ paxTypeId: P.pt.ADULT, qty: 51 }])]);
    await tryHold("infant only", [L([{ paxTypeId: P.pt.INFANT, qty: 2 }])]);
    await tryHold("dup paxType entries 25+25", [L([{ paxTypeId: P.pt.ADULT, qty: 25 }, { paxTypeId: P.pt.ADULT, qty: 25 }])]);
    await tryHold("dup paxType entries 30+30 (>QTY_MAX)", [L([{ paxTypeId: P.pt.ADULT, qty: 30 }, { paxTypeId: P.pt.ADULT, qty: 30 }])]);
    await tryHold("extras qty int4max", [L([{ paxTypeId: P.pt.ADULT, qty: 1 }], { extras: [{ extraId: P.cam, qty: 2_147_483_647 }] })]);
    await tryHold("200 lines", Array.from({ length: 200 }, () => line(P, d)));
    await tryHold("21 lines", Array.from({ length: 21 }, () => line(P, d)));
    const d20 = await mkDep(sh, { date: "2027-04-10", capacity: 60 });
    const h20 = await tryHold("20 lines same departure", Array.from({ length: 20 }, () => line(P, d20)));
    if (h20) { const c = await confirm(h20, { booker: booker() }); res["20 lines confirm"] = `${code(c)} bookings=${refs(c).length}`; bump("K"); }
    await tryHold("option of other product", [line(P, d, { opt: sh.P2.opt })]);
    await tryHold("option2 of same product (departure is option1)", [line(P, d, { opt: P.opt2 })]);
    const d2 = await mkDep(sh, { date: "2027-04-10", P: sh.P2 });
    await tryHold("slot of P2 with productId P", [{ ...line(P, d), slotId: d2 }]);
    await tryHold("paxType of P2 on P", [L([{ paxTypeId: sh.P2.pt.ADULT, qty: 1 }])]);
    await tryHold("unitId of unit2 on P line", [{ ...line(P, d), unitId: sh.unit2 }]);
    // absurd strings on confirm/bookNow
    const nulName = await bookNow(staff(sh), [line(P, d)], { booker: { name: "a\u0000b", phone: "0811111111" } });
    res["booker name with NUL"] = code(nulName.r);
    if (nulName.r.ok === true) res["booker NUL → bookerPartyId"] = String((await q<Rec>(`SELECT "bookerPartyId" FROM "TripBooking" WHERE id = $1`, [String(refs(nulName.r)[0]?.bookingId)]))[0]?.bookerPartyId);
    const pnul = await (async () => { const h = await hold(pub(sh), [line(P, d)]); return confirm(h, { extra: { passengers: [{ name: "p\u0000q", paxTypeId: P.pt.ADULT }] } }); })();
    res["PUBLIC passenger name with NUL"] = code(pnul);
    const pbn = await (async () => { const h = await hold(pub(sh), [line(P, d)]); return confirm(h, { booker: { name: "b\u0000", phone: "0899999999" } }); })();
    res["PUBLIC booker name with NUL"] = code(pbn);
    if (pbn.ok === true) res["PUBLIC booker NUL → bookerPartyId"] = String((await q<Rec>(`SELECT "bookerPartyId" FROM "TripBooking" WHERE id = $1`, [String(refs(pbn)[0]?.bookingId)]))[0]?.bookerPartyId);
    const nulPax = await bookNow(staff(sh), [line(P, d)], { extra: { passengers: [{ name: "x\u0000y", paxTypeId: P.pt.ADULT }] } });
    res["passenger name with NUL"] = code(nulPax.r);
    const nulNote = await bookNow(staff(sh), [line(P, d)], { extra: { note: "n\u0000" } });
    res["note with NUL"] = code(nulNote.r);
    const loneSur = await bookNow(staff(sh), [line(P, d)], { booker: { name: "\ud800", phone: "0811111112" } });
    res["booker name lone surrogate"] = code(loneSur.r);
    const longName = await bookNow(staff(sh), [line(P, d)], { booker: { name: "x".repeat(201), phone: "0811111113" } });
    res["booker name 201 chars"] = code(longName.r);
    const phoneOnly = await bookNow(staff(sh), [line(P, d)], { booker: { name: "y", phone: "+".padEnd(40, "9") } });
    res["phone 39 digits"] = code(phoneOnly.r);
    const tooMany = await bookNow(staff(sh), [line(P, d)], { extra: { passengers: [{ name: "a", paxTypeId: P.pt.ADULT }, { name: "b", paxTypeId: P.pt.ADULT }] } });
    res["2 passengers for 1 seat"] = code(tooMany.r);
    const fields = await bookNow(staff(sh), [line(P, d)], { extra: { passengers: [{ name: "a", paxTypeId: P.pt.ADULT, fields: { ["x".repeat(10000)]: "y".repeat(100000) } }] } });
    res["passenger fields 110KB"] = code(fields.r);
    const pubNoContact = await (async () => { const h = await hold(pub(sh), [line(P, d)]); return confirm(h, { booker: { name: "nobody" } }); })();
    res["public no contact"] = code(pubNoContact);
    const pubAgent = await (async () => { const h = await hold(pub(sh), [line(P, d)]); return confirm(h, { pay: "WALLET" }); })();
    res["public WALLET"] = code(pubAgent);
    const pubLater = await (async () => { const h = await hold(pub(sh), [line(P, d)]); return confirm(h, { pay: "PAY_LATER" }); })();
    res["public PAY_LATER"] = code(pubLater);
    const expQ = await (async () => { const qt = await quote(staff(sh), [line(P, d)]); return call("holdTrips", staff(sh), { quote: { lines: [line(P, d)] }, quoteId: qt.quoteId, quoteExpiresAt: "2000-01-01T00:00:00Z", idempotencyKey: `k${hex(6)}` }, {}); })();
    res["quoteExpiresAt in the past"] = code(expQ);
    const badCtx = await call("holdTrips", { ...staff(sh), now: "not-a-date" }, {}); res["ctx.now invalid"] = code(badCtx);
    const nulls = await call("confirmTrips", staff(sh), null); res["confirm null input"] = code(nulls);
    const sysHold = await call("holdTrips", { tenantId: sh.tenantId, unitId: sh.unitId, channel: "COUNTER", actor: { kind: "SYSTEM", job: "x" }, now: new Date(NOW0) }, {}); res["SYSTEM hold"] = code(sysHold);
    const agent = await call("holdTrips", { tenantId: sh.tenantId, unitId: sh.unitId, channel: "AGENT", actor: { kind: "AGENT", agentAccountId: "x", userId: "y" }, now: new Date(NOW0) }, {}); res["AGENT hold empty"] = code(agent);
    bump("K", 18);
    out("K inputs", res);
    (globalThis as Rec).__K = res;
    const thrown = Object.entries(res).filter(([, v]) => String(v).startsWith("THROW"));
    if (thrown.length) finding("K-throw", "MAJOR", "inputs that make a service throw instead of returning a SellResult", thrown);
    const inv = await check("K", sh, [d, d2, d20], "inputs");
    void inv;
  }

  // ═══ T: TOCTOU between prepare (outside tx) and the tx ═══
  if (ONLY.has("T")) {
    const tctx = { tenantId: sh.tenantId, actorUserId: sh.userId };
    const blockBasket = async (basketId: string) => {
      const c = await pool().connect();
      await c.query("BEGIN");
      await c.query(`SELECT id FROM "SellBasket" WHERE id = $1 FOR UPDATE`, [basketId]);
      return async () => { await c.query("COMMIT"); c.release(); };
    };
    const waitBlocked = async () => { for (let i = 0; i < 100; i++) { const r = await q<{ n: number }>(`SELECT count(*)::int n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%SellBasket%FOR UPDATE%'`); if (r[0].n > 0) return true; await sleep(100); } return false; };
    const res: Rec = {};
    for (const who of ["PUBLIC", "STAFF"]) {
      // T1 option disabled
      const d = await mkDep(sh, { date: "2027-04-11" });
      const h = await hold(who === "PUBLIC" ? pub(sh) : staff(sh), [line(sh.P, d)]);
      const unblock = await blockBasket(String(h.v.basketId));
      const pc = confirm(h);
      const blocked = await waitBlocked();
      const off = await call("setOptionActive", tctx, { unitId: sh.unitId, optionId: sh.P.opt, active: false });
      await unblock();
      const r = await pc;
      bump("T", 3);
      res[`${who} option disabled mid-confirm`] = `blocked=${blocked} disable=${code(off)} confirm=${code(r)}`;
      if (r.ok === true && off.ok === true) finding(`T-option-${who}`, "MAJOR", `${who} confirm commits a booking on an option that was disabled (committed) before the confirm tx took its product lock — lockProductsInTx calls assertProductSellableInTx without optionId`, { r: code(r) });
      await call("setOptionActive", tctx, { unitId: sh.unitId, optionId: sh.P.opt, active: true });
      // T2 product archived (control: product status IS re-checked in tx)
      const d2 = await mkDep(sh, { date: "2027-04-11", P: sh.P2 });
      const h2 = await hold(who === "PUBLIC" ? pub(sh) : staff(sh), [line(sh.P2, d2)]);
      const unblock2 = await blockBasket(String(h2.v.basketId));
      const pc2 = confirm(h2);
      const blocked2 = await waitBlocked();
      const arch = await call("archiveProduct", tctx, { unitId: sh.unitId, productId: sh.P2.id, confirm: true, reason: "hunter archive mid-confirm" });
      await unblock2();
      const r2 = await pc2;
      bump("T", 3);
      res[`${who} product archived mid-confirm`] = `blocked=${blocked2} archive=${code(arch)} confirm=${code(r2)}`;
      if (r2.ok === true && arch.ok === true) finding(`T-archive-${who}`, "BLOCKER", "booking created on archived product", {});
      await q(`UPDATE "TripProduct" SET status = 'ACTIVE' WHERE id = $1`, [sh.P2.id]);
      // T3 price edited mid-confirm (by design: fingerprint checked outside tx)
      const d3 = await mkDep(sh, { date: "2027-04-12" });
      const h3 = await hold(who === "PUBLIC" ? pub(sh) : staff(sh), [line(sh.P, d3)]);
      const unblock3 = await blockBasket(String(h3.v.basketId));
      const pc3 = confirm(h3);
      await waitBlocked();
      const priceId = (await q<{ id: string }>(`SELECT id FROM "TripPrice" WHERE "productId" = $1 AND "paxTypeId" = $2`, [sh.P.id, sh.P.pt.ADULT]))[0].id;
      await q(`UPDATE "TripPrice" SET "amountMinor" = "amountMinor" + 100000 WHERE id = $1`, [priceId]);
      await unblock3();
      const r3 = await pc3;
      await q(`UPDATE "TripPrice" SET "amountMinor" = "amountMinor" - 100000 WHERE id = $1`, [priceId]);
      bump("T", 3);
      res[`${who} price edited mid-confirm`] = `confirm=${code(r3)} gross=${refs(r3)[0] ? (await bkRow(refs(r3)[0].bookingId)).grossSatang : "-"}`;
      await check("T", sh, [d, d2, d3], who);
    }
    out("T toctou", res);
    (globalThis as Rec).__T = res;
  }

  // ═══ J: public token ═══
  if (ONLY.has("J")) {
    const tokenOf = fnOf(T, "bookingPublicToken") as unknown as (id: string) => string;
    const saved = { s: process.env.SESSION_SECRET, n: process.env.NODE_ENV };
    const res: Rec = {};
    const tryT = (id: string) => { try { return tokenOf(id); } catch (e) { return `THROW ${String(e).slice(0, 80)}`; } };
    const env = process.env as Record<string, string | undefined>;
    env.SESSION_SECRET = "x".repeat(40); env.NODE_ENV = "development";
    const a1 = tryT("tb_a"), a2 = tryT("tb_a"), b1 = tryT("tb_b");
    res["with secret: same id same token"] = a1 === a2; res["with secret: different ids differ"] = a1 !== b1; res["len(base64url)"] = a1.length;
    env.SESSION_SECRET = "y".repeat(40);
    res["rotating secret changes token"] = tryT("tb_a") !== a1;
    delete env.SESSION_SECRET;
    const dev = tryT("tb_a");
    res["dev no secret"] = dev.startsWith("THROW") ? dev : "token (unkeyed)";
    res["dev no secret token == sha256('trips.booking.token.v1:dev:'+id) (public formula)"] = dev === (await import("node:crypto")).createHash("sha256").update("trips.booking.token.v1:dev:tb_a").digest("base64url");
    env.NODE_ENV = "production";
    res["prod no secret"] = tryT("tb_a").startsWith("THROW") ? "THROWS (fail-closed)" : "RETURNS TOKEN";
    env.SESSION_SECRET = "short";
    res["prod short secret (<32)"] = tryT("tb_a").startsWith("THROW") ? "THROWS" : "RETURNS TOKEN";
    env.NODE_ENV = "test"; delete env.SESSION_SECRET;
    res["NODE_ENV=test no secret (e.g. staging/preview)"] = tryT("tb_a").startsWith("THROW") ? "THROWS" : "RETURNS UNKEYED TOKEN";
    // end-to-end: confirm in production w/o secret — what does the caller get?
    env.NODE_ENV = "production"; delete env.SESSION_SECRET;
    const d = await mkDep(sh, { date: "2027-04-13" });
    const bn = await bookNow(staff(sh), [line(sh.P, d)]);
    res["prod no secret: bookTripsNow (STAFF)"] = code(bn.r);
    const nb = (await q<{ n: number }>(`SELECT count(*)::int n FROM "TripBooking" WHERE "departureId" = $1`, [d]))[0].n;
    res["prod no secret: bookings written"] = nb;
    if (saved.s === undefined) delete env.SESSION_SECRET; else env.SESSION_SECRET = saved.s;
    if (saved.n === undefined) delete env.NODE_ENV; else env.NODE_ENV = saved.n;
    // token replay equality through the real flow
    const h = await hold(pub(sh), [line(sh.P, d)]);
    const body = confirmBody(h);
    const c1 = await call("confirmTrips", h.ctx, body, {}); const c2 = await call("confirmTrips", h.ctx, body, {});
    const hashRow = (await q<{ h: string }>(`SELECT "publicTokenHash" h FROM "TripBooking" WHERE id = $1`, [String(refs(c1)[0]?.bookingId)]))[0]?.h;
    res["replay returns same token"] = refs(c1)[0]?.publicToken === refs(c2)[0]?.publicToken;
    res["stored hash = sha256(token)"] = hashRow === sha256hex(String(refs(c1)[0]?.publicToken));
    const g = await call("getTripBooking", staff(sh), { bookingId: String(refs(c1)[0]?.bookingId) });
    res["DTO has no token/hash"] = !/publicToken/i.test(JSON.stringify(g.value ?? {}));
    bump("J", 12);
    out("J token", res);
    (globalThis as Rec).__J = res;
    if (String(res["prod no secret: bookTripsNow (STAFF)"]).startsWith("THROW")) finding("J-prod-throw", "MINOR", "production without SESSION_SECRET: bookTripsNow throws a raw Error to the caller (fail-closed as ruled, but not a SellResult; nothing written)", res);
  }

  // ═══ X: PENDING approve/reject/cancel races · cancel idempotency · change key replay · per-contact hold cap on rekey ═══
  if (ONLY.has("X")) {
    const { setV } = await import("./probe-trips-t0.6-lib.mjs");
    await setV(sh, [{ key: "trips.sell.confirmMode", scope: "PRODUCT", scopeId: sh.P2.id, value: "SHOP_CONFIRMS" }]);
    const res: Rec = {};
    for (let round = 0; round < ROUNDS; round++) {
      const d = await mkDep(sh, { date: "2027-04-14", P: sh.P2, capacity: 30 });
      const pend: Rec[] = [];
      for (let i = 0; i < 6; i++) { const h = await hold(pub(sh), [line(sh.P2, d)]); const c = await confirm(h); pend.push(refs(c)[0] ?? {}); bump("X", 2); }
      if (round === 0) res.pendingStatus = pend.map((p) => p.status);
      const races = await Promise.all(pend.flatMap((p) => [
        call("approveTripBooking", staff(sh), { bookingId: String(p.bookingId), expectedVersion: 0, decision: "APPROVE" }),
        call("approveTripBooking", staff(sh), { bookingId: String(p.bookingId), expectedVersion: 0, decision: "REJECT", reason: "race" }),
        call("cancelTripBooking", staff(sh), { bookingId: String(p.bookingId), mode: "EXECUTE", reason: "race", idempotencyKey: `x${hex(6)}` }),
      ]));
      bump("X", races.length);
      const perB = pend.map((_, i) => races.slice(i * 3, i * 3 + 3).filter((r) => r.ok === true).length);
      out(`X r${round} approve∥reject∥cancel`, tally(races), "winners per booking", perB);
      if (perB.some((n) => n !== 1)) {
        // approve then cancel is legal (HOLD can be cancelled) — only flag 0 winners or reject+approve both
        const bad = pend.map((p, i) => ({ i, a: code(races[i * 3]), r: code(races[i * 3 + 1]), c: code(races[i * 3 + 2]) })).filter((x) => x.a === "ok" && x.r === "ok");
        if (bad.length) finding("X-approve-reject", "BLOCKER", "approve and reject both succeeded", bad);
      }
      // approve after shop-confirm hold expired (sweeper not run) and sweeper racing approve
      const h = await hold(pub(sh), [line(sh.P2, d)]); const c = await confirm(h); const b = refs(c)[0];
      const hr = (await q<{ e: Date }>(`SELECT "expiresAt" e FROM "TripHold" WHERE "bookingId" = $1`, [String(b?.bookingId)]))[0];
      const late = new Date(new Date(hr.e).getTime() + 1000).toISOString();
      const [ap, sw] = await Promise.all([
        call("approveTripBooking", withNow(staff(sh), late), { bookingId: String(b?.bookingId), expectedVersion: 0, decision: "APPROVE" }),
        fnOf(T, "runExpireHolds")(new Date(late), { tenantIds: [sh.tenantId] }),
      ]);
      bump("X", 4);
      out(`X r${round} approve-after-expiry ∥ sweeper`, code(ap), fmt(sw).slice(0, 60), (await bkRow(b?.bookingId)).status);
      await check("X", sh, [d], `pending ${round}`);
    }
    // cancel same key ×10 parallel, then other key
    {
      const d = await mkDep(sh, { date: "2027-04-15" });
      const h = await hold(pub(sh), [line(sh.P, d)]); const c = await confirm(h); const b = refs(c)[0];
      const key = `cx${hex(6)}`;
      const rs = await par(10, () => call("cancelTripBooking", staff(sh), { bookingId: String(b?.bookingId), mode: "EXECUTE", reason: "dup", idempotencyKey: key }));
      const other = await call("cancelTripBooking", staff(sh), { bookingId: String(b?.bookingId), mode: "EXECUTE", reason: "dup", idempotencyKey: `cy${hex(6)}` });
      const ev = (await q<{ n: number }>(`SELECT count(*)::int n FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'trips.booking.cancelled' AND payload->>'bookingId' = $2`, [sh.tenantId, String(b?.bookingId)]))[0]?.n;
      bump("X", 13);
      res.cancelSameKeyX10 = tally(rs); res.cancelOtherKey = code(other); res.cancelEvents = ev;
      if (rs.some((r) => r.ok !== true)) finding("X-cancel-idem", "MINOR", "same-key cancel fired ×10 in parallel: not all return the original result", tally(rs));
      await check("X", sh, [d], "cancel-idem");
    }
    // change replay with the same idempotencyKey
    {
      const d = await mkDep(sh, { date: "2027-04-16" });
      const b = refs((await bookNow(staff(sh), [line(sh.P, d, { a: 1 })])).r)[0];
      const rq = await changeReq(sh, staff(sh), String(b?.bookingId), line(sh.P, d, { a: 2 }));
      const r1 = await change(staff(sh), rq); const r2 = await change(staff(sh), rq);
      const par2 = await changeReq(sh, staff(sh), String(b?.bookingId), line(sh.P, d, { a: 3 }));
      const rp = await par(5, () => change(staff(sh), par2));
      bump("X", 8);
      res.changeReplaySameKey = [code(r1), code(r2)]; res.changeSameReqX5 = tally(rp);
      if (r1.ok === true && r2.ok !== true) finding("X-change-idem", "MINOR", "changeTripBooking accepts idempotencyKey but ignores it: an identical retry after success returns " + code(r2) + " instead of the original result", { r1: code(r1), r2: code(r2) });
      await check("X", sh, [d], "change-idem");
    }
    // per-contact hold cap at rekey: 8 baskets, same phone, confirmed in parallel (PUBLIC PAY_NOW keeps holds)
    {
      const d = await mkDep(sh, { date: "2027-04-17", capacity: 30 });
      const hs: H[] = [];
      for (let i = 0; i < 8; i++) hs.push(await hold(pub(sh), [line(sh.P, d)]));
      const phone = `08${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
      const rs = await Promise.all(hs.map((h) => confirm(h, { booker: { name: "คนเดียว", phone } })));
      bump("X", 16);
      const okN = rs.filter((r) => r.ok === true).length;
      res.capSamePhone8 = tally(rs);
      const act = (await q<{ n: number }>(`SELECT count(*)::int n FROM "TripHold" h JOIN "TripBooking" b ON b.id = h."bookingId" WHERE b."departureId" = $1 AND h.status = 'ACTIVE'`, [d]))[0]?.n;
      out("X per-contact cap", tally(rs), "active booking holds", act);
      void okN;
      await check("X", sh, [d], "cap");
    }
    out("X", res);
    (globalThis as Rec).__X = res;
  }

  const sm = await sampler();
  const s1 = await dbStats();
  console.log("\n===== SUMMARY =====");
  console.log(JSON.stringify({ ops, stats, violations, findings, H: (globalThis as Rec).__H, I: (globalThis as Rec).__I, K: (globalThis as Rec).__K, T: (globalThis as Rec).__T, X: (globalThis as Rec).__X, J: (globalThis as Rec).__J, pool: { ...sm, deadlocksDbWideDelta: s1.deadlocks - s0.deadlocks } }, null, 1));
}

let rc = 0;
try { await main(); } catch (e) { console.error("probe crashed", e); rc = 2; }
finally { try { await cleanup(); } catch (e) { console.error("cleanup", e); } await shutdown(); }
process.exit(rc);

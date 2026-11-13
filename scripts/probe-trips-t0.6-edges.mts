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
      const rq0 = await changeReq(sh, staff(sh), String(b?.bookingId), line(sh.P, A, { a: 3 }));
      const r0 = await change(staff(sh), rq0);
      const rqF = await changeReq(sh, staff(sh), String(b?.bookingId), line(sh.P, A, { a: 3 }), { dropPromo: false });
      const rF = await change(staff(sh), rqF);
      const rq = await changeReq(sh, staff(sh), String(b?.bookingId), line(sh.P, A, { a: 3 }), { dropPromo: true });
      const r = await change(staff(sh), rq); bump("E", 4);
      const after = await bkRow(b?.bookingId);
      const red = await q<Rec>(`SELECT status, "discountSatang" FROM "TripPromoRedemption" WHERE "bookingId" = $1`, [String(b?.bookingId)]);
      const used = (await q<Rec>(`SELECT "usedCount" FROM "TripPriceRule" WHERE id = $1`, [rule]))[0];
      out("E change promo booking", "no flag", code(r0), "dropPromo:false", code(rF), "dropPromo:true", code(r), "discount", before.discountSatang, "→", after.discountSatang, "redemption", red, used);
      (globalThis as Rec).__E6 = { noFlag: code(r0), dropFalse: code(rF), dropTrue: code(r), before: before.discountSatang, after: after.discountSatang, red, used };
      if (r.ok === true && red.some((x) => x.status === "ACTIVE")) finding("E-promo", "MINOR", "change with dropPromo leaves redemption ACTIVE", { red, used });
      if (r0.ok === true) finding("E-promo-noflag", "MINOR", "change of promo booking without dropPromo accepted", {});
      await check("E", sh, [A], "promo");
    }
  }

  // ═══ H: price-override approvals (r2: bound + single-use) ═══
  if (ONLY.has("H")) {
    const d = await mkDep(sh, { date: "2027-04-08", capacity: 60 });
    const d2 = await mkDep(sh, { date: "2027-04-08", capacity: 60 });
    const entityOf = fnOf(T, "tripPriceOverrideEntityId") as unknown as (i: Rec) => string;
    const OVR = (u: number, itemRef = "seat:ADULT") => [{ itemRef, unitMinor: u, reason: "ลูกค้าประจำ ส่วนลดพิเศษจากเจ้าของ" }];
    const mkAp = async (tenantId: string, o: Rec) => insertRow("ApprovalRequest", { id: rid("ap"), tenantId, policyId: rid("pol"), entityType: "trips.price_override", entityId: rid("e"), unitId: sh.unitId, status: "APPROVED", requestedById: sh.userId, decidedAt: new Date(), idempotencyKey: `h-${hex(6)}`, ...o });
    const bound = async (o: { dep?: string; unitMinor: number; resolved?: number; itemRef?: string; tenant?: string; extra?: Rec; qty?: number }) => // ผู้คุม 13 พ.ย.: มติ S3 — entityId ผูก qty · amount = unitMinor × qty
      mkAp(o.tenant ?? sh.tenantId, { entityId: entityOf({ unitId: sh.unitId, departureId: o.dep ?? d, itemRef: o.itemRef ?? "seat:ADULT", unitMinor: o.unitMinor, resolvedMinor: o.resolved ?? R.adultSatang, qty: o.qty ?? 1 }), amountSatang: o.unitMinor * (o.qty ?? 1), ...(o.extra ?? {}) });
    const ap = (approvalId: string, unitMinor: number, resolvedMinor?: number, itemRef = "seat:ADULT") => ({ approvalId, itemRef, unitMinor, ...(resolvedMinor !== undefined ? { resolvedMinor } : {}) });
    const tryBook = async (label: string, unitMinor: number, approvals: Rec[], o: { ctx?: Rec; ln?: Rec[]; ovr?: Rec[] } = {}) => {
      const ctx = o.ctx ?? staff(sh); const ln = o.ln ?? [line(sh.P, d, { a: 1 })];
      const ovr = o.ovr ?? OVR(unitMinor);
      const qopts = { overrides: ovr, canOverride: true, overrideApprovals: approvals };
      const qr = await qOk(ctx, ln, qopts);
      bump("H", 2);
      if (qr.ok !== true) { out(`H ${label}`, "quote", code(qr), fmt(qr.details).slice(0, 160)); return { stage: "quote", r: qr }; }
      const qt = asRec(qr.value);
      const r = await call("bookTripsNow", ctx, { quote: { lines: ln }, quoteId: qt.quoteId, quoteExpiresAt: qt.expiresAt, idempotencyKey: `ho${hex(6)}`, booker: booker(), pay: { method: "PAY_LATER" }, priceOverrides: ovr, overrideApprovals: approvals }, { canOverride: true });
      const ids = refs(r).map((x) => String(x.bookingId));
      const rows = ids.length ? await q<Rec>(`SELECT b.id, b."grossSatang", (SELECT json_agg(json_build_object('k', i.kind, 'pt', i."paxTypeId", 'u', i."unitPriceMinor", 'src', i."priceSource")) FROM "TripBookingItem" i WHERE i."bookingId" = b.id AND i.kind = 'SEAT') AS seats FROM "TripBooking" b WHERE b.id = ANY($1::text[])`, [ids]) : [];
      const aud = ids.length ? await q<Rec>(`SELECT "targetId", after FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'trips.booking.price_override' AND "targetId" = ANY($2::text[])`, [sh.tenantId, ids]) : [];
      out(`H ${label}`, code(r), rows.map((x) => ({ gross: x.grossSatang, seats: x.seats })), "audit", aud.map((x) => asRec(x.after).approvalIds));
      return { stage: "book", r, rows, aud };
    };
    const res: Rec = {};
    const good = await bound({ unitMinor: 200_000 });
    const h0 = await tryBook("H0 bound approval 200,000 (positive)", 200_000, [ap(good, 200_000, R.adultSatang)]); res.h0 = code(h0.r); res.h0rows = h0.rows; res.h0audit = (h0.aud ?? []).map((x) => asRec(x.after).approvalIds);
    res.h1 = code((await tryBook("H1 same approval reused", 200_000, [ap(good, 200_000, R.adultSatang)])).r);
    res.h2 = code((await tryBook("H2 approval of 200,000 used for 100,000", 100_000, [ap(await bound({ unitMinor: 200_000 }), 100_000, R.adultSatang)])).r);
    res.h3 = code((await tryBook("H3 hr.leave with the right entityId", 200_000, [ap(await bound({ unitMinor: 200_000, extra: { entityType: "hr.leave" } }), 200_000, R.adultSatang)])).r);
    res.h3b = code((await tryBook("H3b right type+entity but approval.unitId = unit2", 200_000, [ap(await bound({ unitMinor: 200_000, extra: { unitId: sh.unit2 } }), 200_000, R.adultSatang)])).r);
    res.h3c = code((await tryBook("H3c bound to departure d used on d2", 200_000, [ap(await bound({ unitMinor: 200_000 }), 200_000, R.adultSatang)], { ln: [line(sh.P, d2)] })).r);
    res.h3d = code((await tryBook("H3d approval.unitId NULL (tenant-wide)", 200_000, [ap(await bound({ unitMinor: 200_000, extra: { unitId: null } }), 200_000, R.adultSatang)])).r);
    res.h3e = code((await tryBook("H3e amountSatang on approval = 1 (ignored?)", 200_000, [ap(await bound({ unitMinor: 200_000, extra: { amountSatang: 1 } }), 200_000, R.adultSatang)])).r);
    res.h4 = code((await tryBook("H4 other tenant (same entityId)", 200_000, [ap(await bound({ unitMinor: 200_000, tenant: shB.tenantId, extra: { unitId: shB.unitId } }), 200_000, R.adultSatang)])).r);
    res.h5 = code((await tryBook("H5 missing resolvedMinor", 200_000, [ap(await bound({ unitMinor: 200_000 }), 200_000)])).r);
    res.h6 = code((await tryBook("H6 wrong resolvedMinor", 200_000, [ap(await bound({ unitMinor: 200_000, resolved: R.adultSatang + 1 }), 200_000, R.adultSatang + 1)])).r);
    res.h7 = code((await tryBook("H7 PENDING", 200_000, [ap(await bound({ unitMinor: 200_000, extra: { status: "PENDING", decidedAt: null } }), 200_000, R.adultSatang)])).r);
    res.h8 = code((await tryBook("H8 REJECTED", 200_000, [ap(await bound({ unitMinor: 200_000, extra: { status: "REJECTED" } }), 200_000, R.adultSatang)])).r);
    // H9 PUBLIC with overrideApprovals only
    const lnp = [line(sh.P, d, { a: 1 })];
    const qp = await quote(pub(sh), lnp);
    res.h9 = code(await call("holdTrips", pub(sh), { quote: { lines: lnp }, quoteId: qp.quoteId, quoteExpiresAt: qp.expiresAt, idempotencyKey: `hp${hex(6)}`, basketToken: tok(), overrideApprovals: [ap(good, 1, R.adultSatang)] }, {}));
    // H11 approval named but override within cap (no approval needed) — is it consumed?
    const within = await bound({ unitMinor: 340_000 });
    res.h11 = code((await tryBook("H11 approval for an override inside the cap (340,000)", 340_000, [ap(within, 340_000, R.adultSatang)])).r);
    res.h11reuse = code((await tryBook("H11b same within-cap approval again", 340_000, [ap(within, 340_000, R.adultSatang)])).r);
    // H14 multi-line: two lines same departure, one approval (seat:ADULT)
    const multi = await bound({ unitMinor: 200_000 });
    const h14 = await tryBook("H14 one approval, 2 lines same departure (2×3 adults)", 200_000, [ap(multi, 200_000, R.adultSatang)], { ln: [line(sh.P, d, { a: 3 }), line(sh.P, d, { a: 3 })] });
    res.h14 = code(h14.r); res.h14rows = h14.rows; res.h14audit = (h14.aud ?? []).map((x) => asRec(x.after).approvalIds);
    // H15 one approval for seat:ADULT + a below-cap override of seat:CHILD without approval
    const h15ap = await bound({ unitMinor: 200_000 });
    const h15 = await tryBook("H15 approval for ADULT + unapproved CHILD override 100,000", 200_000, [ap(h15ap, 200_000, R.adultSatang)], { ln: [line(sh.P, d, { a: 1, c: 1 })], ovr: [...OVR(200_000), ...OVR(100_000, "seat:CHILD")] });
    res.h15 = code(h15.r); res.h15rows = h15.rows;
    // H16 approval over two departures
    const h16 = await tryBook("H16 approval with lines on two departures", 200_000, [ap(await bound({ unitMinor: 200_000 }), 200_000, R.adultSatang)], { ln: [line(sh.P, d), line(sh.P, d2)] });
    res.h16 = code(h16.r);
    // H17 hold with approval (not consumed), confirm consumes, then bookNow with it ⇒ USED
    const hap = await bound({ unitMinor: 200_000 });
    const lnH = [line(sh.P, d)];
    const qH = await qOk(staff(sh), lnH, { overrides: OVR(200_000), canOverride: true, overrideApprovals: [ap(hap, 200_000, R.adultSatang)] });
    const hh = await call("holdTrips", staff(sh), { quote: { lines: lnH }, quoteId: asRec(qH.value).quoteId, quoteExpiresAt: asRec(qH.value).expiresAt, idempotencyKey: `hh${hex(6)}`, priceOverrides: OVR(200_000), overrideApprovals: [ap(hap, 200_000, R.adultSatang)] }, { canOverride: true });
    const hh2 = await call("holdTrips", staff(sh), { quote: { lines: lnH }, quoteId: asRec(qH.value).quoteId, quoteExpiresAt: asRec(qH.value).expiresAt, idempotencyKey: `hh${hex(6)}`, priceOverrides: OVR(200_000), overrideApprovals: [ap(hap, 200_000, R.adultSatang)] }, { canOverride: true });
    const mkC = (h: Rec) => ({ basketId: asRec(h.value).basketId, holdIds: asRec(h.value).holdIds, idempotencyKey: `c${hex(6)}`, quoteId: asRec(qH.value).quoteId, quote: { lines: lnH }, booker: booker(), pay: { method: "PAY_LATER" }, priceOverrides: OVR(200_000), overrideApprovals: [ap(hap, 200_000, R.adultSatang)] });
    const [c1, c2] = await Promise.all([call("confirmTrips", staff(sh), mkC(hh), { canOverride: true }), call("confirmTrips", staff(sh), mkC(hh2), { canOverride: true })]);
    bump("H", 5);
    res.h17 = { hold1: code(hh), hold2: code(hh2), confirm1: code(c1), confirm2: code(c2) };
    // race: 20 parallel bookNow with one bound approval (pre-quoted)
    const raceAp = await bound({ unitMinor: 200_000 });
    const qR = await qOk(staff(sh), lnH, { overrides: OVR(200_000), canOverride: true, overrideApprovals: [ap(raceAp, 200_000, R.adultSatang)] });
    const dl0 = (await dbStats()).deadlocks;
    const rr = await par(20, (i) => i % 2
      ? call("bookTripsNow", staff(sh), { quote: { lines: lnH }, quoteId: asRec(qR.value).quoteId, quoteExpiresAt: asRec(qR.value).expiresAt, idempotencyKey: `hr${hex(6)}`, booker: booker(), pay: { method: "PAY_LATER" }, priceOverrides: OVR(200_000), overrideApprovals: [ap(raceAp, 200_000, R.adultSatang)] }, { canOverride: true })
      : (async () => {
          const h = await call("holdTrips", staff(sh), { quote: { lines: lnH }, quoteId: asRec(qR.value).quoteId, quoteExpiresAt: asRec(qR.value).expiresAt, idempotencyKey: `hq${hex(6)}`, priceOverrides: OVR(200_000), overrideApprovals: [ap(raceAp, 200_000, R.adultSatang)] }, { canOverride: true });
          if (h.ok !== true) return h;
          return call("confirmTrips", staff(sh), { basketId: asRec(h.value).basketId, holdIds: asRec(h.value).holdIds, idempotencyKey: `c${hex(6)}`, quoteId: asRec(qR.value).quoteId, quote: { lines: lnH }, booker: booker(), pay: { method: "PAY_LATER" }, priceOverrides: OVR(200_000), overrideApprovals: [ap(raceAp, 200_000, R.adultSatang)] }, { canOverride: true });
        })());
    bump("H", 30);
    const audN = (await q<{ n: number }>(`SELECT count(*)::int n FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'trips.booking.price_override' AND $2 = ANY(string_to_array(after->>'approvalIds', ','))`, [sh.tenantId, raceAp]))[0].n;
    res.race20 = { tally: tally(rr), auditRows: audN, deadlocksDbWideDelta: (await dbStats()).deadlocks - dl0, maxMs: Math.max(...rr.map((x) => Number(x.__ms) || 0)) };
    out("H race ×20", res.race20);
    if (rr.filter((x) => x.ok === true).length !== 1 || audN !== 1) finding("H-race", "BLOCKER", "single-use approval: not exactly one success / one audit row", res.race20);
    out("H", res);
    (globalThis as Rec).__H = res;
    if (h0.r.ok !== true) finding("H-positive", "MAJOR", "correctly bound approval refused", res.h0);
    for (const k of ["h1", "h2", "h3", "h3b", "h3c", "h4", "h7", "h8", "h16"]) if (String(res[k]) === "ok") finding(`H-${k}`, "MAJOR", `approval case ${k} accepted`, res[k]);
    if (h14.r.ok === true && refs(h14.r).length > 1) finding("H-multiline", "MINOR", "one single-use approval authorises the override on every line of the request that shares the departure (2 bookings, 6 seats) — single-use is per request, not per seat/line", { rows: h14.rows, audit: res.h14audit });
    await check("H", sh, [d, d2], "H");
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
    if (res["staff:releaseHold(booking-bound hold)"] === "ok" || inv.some((x) => x.startsWith("I5-unpaid-nohold"))) finding("I-releasehold", "MAJOR", "T0.4 releaseHold releases the hold of a HOLD-status booking: booking stays HOLD with no seats held (I5); T0.6 did not guard booking-bound holds", inv.filter((x) => x.startsWith("I5")));
    // prepared: forged / foreign actor / reused / direct finalize bypassing lockOpenBasket + option check
    {
      const shF = await mkShop("g");
      const sh = shF;
      const { D } = await mods();
      const inTx = async (ctx: Rec, fn: (tx: unknown) => Promise<unknown>): Promise<Rec> => {
        const db = asRec(fnOf(D, "tenantDb")({ tenantId: String(ctx.tenantId), unitId: String(ctx.unitId) }) as unknown);
        try { return asRec(await (db.$transaction as (f: (tx: unknown) => Promise<unknown>) => Promise<unknown>).call(db, fn)); }
        catch (e) { const o = asRec(e); return typeof o.code === "string" && o.name !== "PrismaClientKnownRequestError" ? { ok: false, code: o.code, details: o.details, thrown: true } : { ok: "THROW", e: String(e).slice(0, 200) }; }
      };
      const fin = (ctx: Rec, P: unknown, basketId: unknown) => inTx(ctx, (tx) => fnOf(T, "finalizeTripsInTx")(tx, ctx, [], { prepared: P, basketId }));
      const res2: Rec = {};
      const mk = async (who: "STAFF" | "PUBLIC" = "STAFF") => { const d = await mkDep(sh, { date: "2027-04-09" }); const h = await hold(who === "STAFF" ? staff(sh) : pub(sh), [line(sh.P, d)]); const prep = await call("prepareTripConfirm", h.ctx, confirmBody(h), {}); return { d, h, P: asRec(asRec(prep.value).prepared), prep }; };
      const a1 = await mk();
      const clone = structuredClone(a1.P);
      const forged = { ...clone, lines: asArr(clone.lines).map((l) => ({ ...l, status: "CONFIRMED", holdMode: "KEEP" })) };
      res2.forgedPlain = code(await fin(staff(sh), forged, a1.P.basketId));
      res2.cloneUnmodified = code(await fin(staff(sh), clone, a1.P.basketId));
      let mutate = "no error";
      try { (a1.P as Rec).payMethod = "PAY_NOW"; (asArr(a1.P.lines)[0] as Rec).status = "CONFIRMED"; } catch (e) { mutate = `throws ${String(e).slice(0, 60)}`; }
      res2.mutateSealed = mutate;
      res2.otherStaffUser = code(await fin(staff(sh, { user: "someone-else" }), a1.P, a1.P.basketId));
      res2.otherTenantCtx = code(await fin(staff(shB), a1.P, a1.P.basketId));
      res2.wrongBasketId = code(await fin(staff(sh), a1.P, "sb_x"));
      const p1 = await mk("PUBLIC");
      res2.publicPreparedOtherClient = code(await fin(pub(sh), p1.P, p1.P.basketId));
      // reuse: same sealed P twice concurrently, then again after commit
      const both = await Promise.all([fin(staff(sh), a1.P, a1.P.basketId), fin(staff(sh), a1.P, a1.P.basketId)]);
      res2.sameSealedTwiceConcurrent = both.map(code);
      res2.sameSealedAfterCommit = code(await fin(staff(sh), a1.P, a1.P.basketId));
      res2.bookingsOfBasket = (await q<{ n: number }>(`SELECT count(*)::int n FROM "TripBooking" WHERE "basketId" = $1`, [String(a1.P.basketId)]))[0].n;
      // direct finalize after option disabled (skips lockProductsInTx in confirmTx)
      const a2 = await mk();
      const tctx = { tenantId: sh.tenantId, actorUserId: sh.userId };
      const off = await call("setOptionActive", tctx, { unitId: sh.unitId, optionId: sh.P.opt, active: false });
      const dr = await fin(staff(sh), a2.P, a2.P.basketId);
      res2.directFinalizeAfterOptionDisabled = `disable=${code(off)} finalize=${code(dr)}`;
      await call("setOptionActive", tctx, { unitId: sh.unitId, optionId: sh.P.opt, active: true });
      bump("I", 14);
      out("I prepared", res2);
      (globalThis as Rec).__FP = res2;
      if (dr.ok === true) finding("FP-bypass", "MINOR", "finalizeTripsInTx with a genuine sealed `prepared` skips the in-tx product/option re-check (lockProductsInTx lives in confirmTx, not in finalize) — a K1.1 caller that forgets it books on a disabled option", res2.directFinalizeAfterOptionDisabled);
      for (const k of ["forgedPlain", "cloneUnmodified", "otherStaffUser", "otherTenantCtx", "wrongBasketId", "publicPreparedOtherClient", "sameSealedAfterCommit"]) if (String(res2[k]) === "ok") finding(`FP-${k}`, "MAJOR", `prepared case ${k} accepted`, res2);
      if (Number(res2.bookingsOfBasket) > 1 || (res2.sameSealedTwiceConcurrent as string[]).filter((x) => x === "ok").length > 1) finding("FP-reuse", "BLOCKER", "sealed prepared used twice produced 2 bookings", res2);
      await check("FP", sh, [a1.d, a2.d, p1.d], "prepared");
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
    const nulNote = await bookNow(staff(sh), [line(P, d)], { extra: { note: "n" } });
    res["note (now rejected field)"] = code(nulNote.r);
    for (const [nm, ex] of [["booker.marketingConsent", { booker: { name: "m", phone: "0811110001", marketingConsent: true } }], ["pay.tender", { pay: { method: "PAY_LATER", tender: "CASH" } }]] as [string, Rec][]) {
      const r = await bookNow(staff(sh), [line(P, d)], { extra: ex }); res[`${nm} (now rejected)`] = code(r.r);
    }
    const ctl = await bookNow(staff(sh), [line(P, d)], { booker: { name: "tab\there", phone: "0811110002" } }); res["booker name with TAB"] = code(ctl.r);
    const del = await bookNow(staff(sh), [line(P, d)], { booker: { name: "del\u007f", phone: "0811110003" } }); res["booker name with DEL"] = code(del.r);
    const c1 = await bookNow(staff(sh), [line(P, d)], { booker: { name: "c1\u0085x", phone: "0811110004" } }); res["booker name with C1 NEL U+0085"] = code(c1.r);
    const bidi = await bookNow(staff(sh), [line(P, d)], { booker: { name: "bidi\u202Eevil", phone: "0811110005" } }); res["booker name with U+202E"] = code(bidi.r);
    const nulPhone = await bookNow(staff(sh), [line(P, d)], { booker: { name: "p", phone: "081\u00001110006" } }); res["phone with NUL"] = code(nulPhone.r);
    const loneSur = await bookNow(staff(sh), [line(P, d)], { booker: { name: "\ud800", phone: "0811111112" } });
    res["booker name lone surrogate"] = code(loneSur.r);
    const longName = await bookNow(staff(sh), [line(P, d)], { booker: { name: "x".repeat(201), phone: "0811111113" } });
    res["booker name 201 chars"] = code(longName.r);
    const phoneOnly = await bookNow(staff(sh), [line(P, d)], { booker: { name: "y", phone: "+".padEnd(40, "9") } });
    res["phone 39 digits"] = code(phoneOnly.r);
    const tooMany = await bookNow(staff(sh), [line(P, d)], { extra: { passengers: [{ name: "a", paxTypeId: P.pt.ADULT }, { name: "b", paxTypeId: P.pt.ADULT }] } });
    res["2 passengers for 1 seat"] = code(tooMany.r);
    const fields = await bookNow(staff(sh), [line(P, d)], { extra: { passengers: [{ name: "a", paxTypeId: P.pt.ADULT, fields: { ["x".repeat(10000)]: "y".repeat(100000) } }] } });
    res["passenger fields (now rejected)"] = code(fields.r);
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
    const tokenOf = fnOf(T, "bookingPublicToken") as unknown as (id: string) => string | null;
    const saved = { s: process.env.SESSION_SECRET, n: process.env.NODE_ENV };
    const env = process.env as Record<string, string | undefined>;
    const restore = () => { if (saved.s === undefined) delete env.SESSION_SECRET; else env.SESSION_SECRET = saved.s; if (saved.n === undefined) delete env.NODE_ENV; else env.NODE_ENV = saved.n; };
    const res: Rec = {};
    const tryT = (id: string): string => { try { const t = tokenOf(id); return t === null ? "null" : t; } catch (e) { return `THROW ${String(e).slice(0, 80)}`; } };
    env.SESSION_SECRET = "x".repeat(40); env.NODE_ENV = "development";
    const a1 = tryT("tb_a"), a2 = tryT("tb_a"), b1 = tryT("tb_b");
    res["with secret: same id same token"] = a1 === a2; res["with secret: different ids differ"] = a1 !== b1; res["len(base64url)"] = a1.length;
    env.SESSION_SECRET = "y".repeat(40); res["rotating secret changes token"] = tryT("tb_a") !== a1;
    for (const [nenv, sec] of [["development", undefined], ["test", undefined], ["production", undefined], ["production", "short"], ["development", "z".repeat(31)], ["production", "z".repeat(32)]] as [string, string | undefined][]) {
      env.NODE_ENV = nenv; if (sec === undefined) delete env.SESSION_SECRET; else env.SESSION_SECRET = sec;
      const t = tryT("tb_a"); res[`token NODE_ENV=${nenv} secret=${sec === undefined ? "none" : `${sec.length} chars`}`] = t === "null" || t.startsWith("THROW") ? t : "token";
    }
    restore();
    // end-to-end without secret: every entry point returns BUSY SERVER_KEY_MISSING, nothing written
    const d = await mkDep(sh, { date: "2027-04-13" });
    const qS = await quote(staff(sh), [line(sh.P, d)]);
    const hPub = await hold(pub(sh), [line(sh.P, d)]); // with secret
    const hSt = await hold(staff(sh), [line(sh.P, d)]);
    const bodyPub = confirmBody(hPub);
    const okC = await call("confirmTrips", hPub.ctx, bodyPub, {}); // with secret ⇒ ok
    for (const nenv of ["production", "development"]) {
      env.NODE_ENV = nenv; delete env.SESSION_SECRET;
      const seq0 = (await q<{ n: number }>(`SELECT COALESCE(sum(seq),0)::int n FROM "SellCounter" WHERE "tenantId" = $1`, [sh.tenantId]))[0].n;
      const n0 = (await q<{ n: number }>(`SELECT count(*)::int n FROM "TripBooking" WHERE "departureId" = $1`, [d]))[0].n;
      const bn = await call("bookTripsNow", staff(sh), { quote: { lines: [line(sh.P, d)] }, quoteId: qS.quoteId, quoteExpiresAt: qS.expiresAt, idempotencyKey: `n${hex(6)}`, booker: booker(), pay: { method: "PAY_LATER" } }, {});
      const hn = await hold(staff(sh), [line(sh.P, d)], { quote: qS });
      const cn = await call("confirmTrips", hSt.ctx, confirmBody(hSt), {});
      const rp = await call("confirmTrips", hPub.ctx, bodyPub, {}); // replay of a committed confirm
      const n1 = (await q<{ n: number }>(`SELECT count(*)::int n FROM "TripBooking" WHERE "departureId" = $1`, [d]))[0].n;
      const seq1 = (await q<{ n: number }>(`SELECT COALESCE(sum(seq),0)::int n FROM "SellCounter" WHERE "tenantId" = $1`, [sh.tenantId]))[0].n;
      res[`no secret (${nenv})`] = { bookNow: code(bn), hold: code(hn.r), confirm: code(cn), replay: code(rp), bookingsWritten: n1 - n0, seqDelta: seq1 - seq0 };
      restore();
    }
    res["confirm with secret"] = code(okC);
    const c2 = await call("confirmTrips", hPub.ctx, bodyPub, {});
    const hashRow = (await q<{ h: string }>(`SELECT "publicTokenHash" h FROM "TripBooking" WHERE id = $1`, [String(refs(okC)[0]?.bookingId)]))[0]?.h;
    res["replay returns same token"] = refs(okC)[0]?.publicToken === refs(c2)[0]?.publicToken;
    res["stored hash = sha256(token)"] = hashRow === sha256hex(String(refs(okC)[0]?.publicToken));
    const g = await call("getTripBooking", staff(sh), { bookingId: String(refs(okC)[0]?.bookingId) });
    res["DTO has no token/hash"] = !/publicToken/i.test(JSON.stringify(g.value ?? {}));
    bump("J", 20);
    out("J token", res);
    (globalThis as Rec).__J = res;
    for (const k of Object.keys(res).filter((k) => k.startsWith("no secret"))) {
      const v = asRec(res[k]);
      if (Number(v.bookingsWritten) !== 0 || Number(v.seqDelta) !== 0 || ["bookNow", "hold", "confirm", "replay"].some((x) => !String(v[x]).startsWith("BUSY/SERVER_KEY_MISSING"))) finding("J-nosecret", "MINOR", `${k}: not all entry points return BUSY SERVER_KEY_MISSING / something written`, v);
    }
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
      const diffReason = await call("cancelTripBooking", staff(sh), { bookingId: String(b?.bookingId), mode: "EXECUTE", reason: "other reason", idempotencyKey: key });
      res.cancelSameKeyX10 = tally(rs); res.cancelOtherKey = code(other); res.cancelEvents = ev; res.cancelSameKeyDiffReason = code(diffReason);
      if (diffReason.ok === true) finding("X-cancel-body", "MINOR", "same cancel key with a different reason accepted", {});
      // 10 parallel cancels with DIFFERENT keys on one HOLD booking: one cancellation, seats returned once
      const d2 = await mkDep(sh, { date: "2027-04-15", capacity: 5 });
      const h2 = await hold(pub(sh), [line(sh.P, d2, { a: 2 })]); const c2 = await confirm(h2); const b2 = refs(c2)[0];
      const before = (await q<Rec>(`SELECT held, sold FROM "TripDeparture" WHERE id = $1`, [d2]))[0];
      const rs2 = await par(10, (i) => call("cancelTripBooking", staff(sh), { bookingId: String(b2?.bookingId), mode: "EXECUTE", reason: `r${i}`, idempotencyKey: `cz${hex(6)}` }));
      const after = (await q<Rec>(`SELECT held, sold FROM "TripDeparture" WHERE id = $1`, [d2]))[0];
      const ev2 = (await q<{ n: number }>(`SELECT count(*)::int n FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'trips.booking.cancelled' AND payload->>'bookingId' = $2`, [sh.tenantId, String(b2?.bookingId)]))[0]?.n;
      const aud2 = (await q<{ n: number }>(`SELECT count(*)::int n FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'trips.booking.cancel' AND "targetId" = $2`, [sh.tenantId, String(b2?.bookingId)]))[0]?.n;
      bump("X", 14);
      res.cancelDiffKeysX10 = { tally: tally(rs2), before, after, events: ev2, audits: aud2 };
      if (rs2.filter((r) => r.ok === true).length !== 1 || ev2 !== 1 || aud2 !== 1 || Number(after.held) !== Number(before.held) - 2) finding("X-cancel-race", "MAJOR", "10 parallel cancels (different keys): not exactly one cancellation / seats", res.cancelDiffKeysX10);
      await check("X", sh, [d2], "cancel-race");
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
      const rpAfter = await change(staff(sh), par2);
      const diffBody = await change(staff(sh), { ...par2, line: line(sh.P, d, { a: 4 }) });
      const audN = (await q<{ n: number }>(`SELECT count(*)::int n FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'trips.booking.change' AND "targetId" = $2`, [sh.tenantId, String(b?.bookingId)]))[0]?.n;
      bump("X", 10);
      res.changeReplaySameKey = [code(r1), code(r2)]; res.changeSameReqX5 = tally(rp); res.changeSameReqAfter = code(rpAfter); res.changeSameKeyDiffBody = code(diffBody); res.changeAudits = audN;
      if (rp.some((r) => r.ok !== true) || audN !== 2) finding("X-change-par", "MINOR", "same change ×5 parallel: not all ok / audits ≠ 2", { tally: tally(rp), audN });
      if (diffBody.ok === true) finding("X-change-body", "MAJOR", "same change key with a different body applied", {});
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

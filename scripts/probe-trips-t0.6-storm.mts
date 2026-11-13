// probe-trips-t0.6-storm.mts — นักล่า T0.6: งานขนานจริง A B C D F G + I6/I7 · ร้านชั่วคราว trips-t06h-*
// ใช้: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.6-storm.mts [--only=A,B] [--rounds=N]
import {
  boot, mods, fnOf, call, code, stats, out, fmt, asRec, asArr, hex, tok, rid, sleep, q, NOW0,
  mkShop, mkDep, mkProd, staff, pub, withNow, line, booker, quote, hold, confirm, confirmBody, bookNow, refs,
  invDeps, invTenant, allInv, positiveControls, dbStats, connSampler, cleanup, sweepStale, shutdown, findings, finding,
  type Rec, type Shop, type H,
} from "./probe-trips-t0.6-lib.mjs";

boot("probe-trips-t0.6-storm");
const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const ONLY = new Set(arg("only", "PC,A,B,C,D,F,G,G2,P").split(","));
const ROUNDS = Number(arg("rounds", "6"));
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

async function main() {
  await sweepStale();
  const { T } = await mods();
  const s0 = await dbStats();
  const sampler = connSampler();
  const sh = await mkShop("a");
  out("setup", { tenant: sh.tenantId.slice(-10) });

  // ═══ PC: ตัวควบคุมบวก ═══
  if (ONLY.has("PC")) {
    const d = await mkDep(sh, { date: "2027-03-15" });
    const code0 = `PC${hex(2)}`.toUpperCase();
    const rule = await insertRule(sh, { kind: "PROMO_CODE", code: code0, discountBp: 1000, maxUses: 5 });
    const h = await hold(staff(sh), [line(sh.P, d, { promo: code0 })]);
    const c = await confirm(h, { pay: "PAY_NOW" });
    const b2 = await bookNow(staff(sh), [line(sh.P, d)]);
    out("PC base", code(h.r), code(c), code(b2.r));
    const pre = await allInv(sh, [d]);
    out("PC clean-before", pre);
    const pc = await positiveControls(sh, d, String(refs(c)[0]?.bookingId ?? ""), rule);
    out("PC controls", pc);
    (globalThis as Rec).__pc = { pre, pc };
  }

  // ═══ A: last-seat storm ═══
  if (ONLY.has("A")) {
    const { createHash } = await import("node:crypto");
    for (let round = 0; round < ROUNDS; round++) {
      const cap = 12;
      const d = await mkDep(sh, { date: "2027-03-20", capacity: cap });
      await bookNow(staff(sh), [line(sh.P, d, { a: 2 })]); // sold 2
      // 4 public HOLD bookings (KEEP: seats stay held) — staff cancels them during the storm, freeing 4 seats mid-flight
      const holdBookings: string[] = [];
      for (let i = 0; i < 4; i++) { const h = await hold(pub(sh), [line(sh.P, d)]); const c = await confirm(h); const b = refs(c)[0]; if (b) holdBookings.push(String(b.bookingId)); }
      // 2 open public baskets whose holds will be released mid-storm
      const openBaskets: H[] = [];
      for (let i = 0; i < 2; i++) openBaskets.push(await hold(pub(sh), [line(sh.P, d)]));
      bump("A", 13);
      // pre-quote so the storm hits the tx, not the quote
      const prepped = await Promise.all(Array.from({ length: 40 }, async (_, i) => {
        const kind = i % 3; const ctx = kind === 0 ? pub(sh) : staff(sh);
        const ln = [line(sh.P, d, { a: 1 + (i % 2) })];
        return { kind, ctx, ln, qt: await quote(ctx, ln) };
      }));
      const per: Record<string, Record<string, number>> = { pubHoldConfirm: {}, staffHoldConfirm: {}, staffBookNow: {}, cancel: {}, release: {} };
      const add = (k: string, r: Rec) => { per[k][code(r)] = (per[k][code(r)] ?? 0) + 1; };
      const tasks = prepped.map(async (p) => {
        if (p.kind === 2) { const r = (await bookNow(p.ctx, p.ln, { quote: p.qt })).r; bump("A"); add("staffBookNow", r); return r; }
        const h = await hold(p.ctx, p.ln, { quote: p.qt }); bump("A");
        if (h.r.ok !== true) { add(p.kind === 0 ? "pubHoldConfirm" : "staffHoldConfirm", h.r); return h.r; }
        const c = await confirm(h); bump("A"); add(p.kind === 0 ? "pubHoldConfirm" : "staffHoldConfirm", c); return c;
      });
      const side = [
        ...holdBookings.map(async (id, k) => { await sleep(20 * k); const r = await call("cancelTripBooking", staff(sh), { bookingId: id, mode: "EXECUTE", reason: "hunt cancel", idempotencyKey: `x${hex(6)}` }); bump("A"); add("cancel", r); return r; }),
        ...openBaskets.map(async (h, k) => { await sleep(30 * k); const r = await call("releaseHold", h.ctx, { holdId: (h.v.holdIds as string[])[0], reason: "hunt", capKey: `basket:${createHash("sha256").update(String(h.token)).digest("hex")}` }); bump("A"); add("release", r); return r; }),
      ];
      await Promise.all([...tasks, ...side]);
      const v = await check("A", sh, [d], `round ${round}`);
      const dep = (await q<Rec>(`SELECT capacity, sold, held FROM "TripDeparture" WHERE id = $1`, [d]))[0];
      const st = await q<Rec>(`SELECT status, count(*)::int n FROM "TripBooking" WHERE "departureId" = $1 GROUP BY status ORDER BY status`, [d]);
      out(`A r${round}`, per, dep, st, v.length ? "VIOL" : "inv ok");
    }
  }

  // ═══ B: double submit ═══
  if (ONLY.has("B")) {
    for (const n of [2, 5, 10, 20]) {
      for (const who of ["STAFF", "PUBLIC"]) {
        const d = await mkDep(sh, { date: "2027-03-21" });
        const ctx = who === "STAFF" ? staff(sh) : pub(sh);
        const h = await hold(ctx, [line(sh.P, d, { a: 2 })]); bump("B");
        const body = confirmBody(h, { key: `dup${hex(5)}` });
        const rs = await par(n, () => call("confirmTrips", ctx, body, {}));
        bump("B", n);
        const okIds = new Set(rs.filter((r) => r.ok === true).map((r) => fmt(refs(r).map((x) => x.bookingId))));
        const nb = (await q<{ n: number }>(`SELECT count(*)::int n FROM "TripBooking" WHERE "basketId" = $1`, [h.v.basketId]))[0].n;
        const tokens = new Set(rs.filter((r) => r.ok === true).map((r) => String(refs(r)[0]?.publicToken)));
        out(`B same-key ×${n} ${who}`, tally(rs), "distinct results", okIds.size, "bookings", nb, "tokens", tokens.size);
        if (nb !== 1 || okIds.size !== 1 || rs.some((r) => r.ok !== true)) finding("B-dup", "MAJOR", `same confirm ×${n} (${who}) not idempotent`, { tally: tally(rs), nb, distinct: okIds.size });
        // same key different body
        const diff = await call("confirmTrips", ctx, { ...body, note: "different" }, {}); bump("B");
        const other = await call("confirmTrips", ctx, { ...body, idempotencyKey: `oth${hex(5)}` }, {}); bump("B");
        out(`B ${who} diff-body`, code(diff), "other-key", code(other));
        if (diff.ok === true || (diff.ok === false && diff.code !== "IDEMPOTENCY_CONFLICT")) finding("B-diffbody", "MINOR", `same key different body ⇒ ${code(diff)}`, { who });
        await check("B", sh, [d], `×${n} ${who}`);
      }
    }
    // same key with different body fired in parallel (race between first commit and conflict)
    {
      const d = await mkDep(sh, { date: "2027-03-21" });
      const h = await hold(staff(sh), [line(sh.P, d, { a: 2 })]);
      const key = `race${hex(5)}`;
      const rs = await par(10, (i) => call("confirmTrips", h.ctx, confirmBody(h, { key, extra: { note: `n${i % 2}` } }), {}));
      bump("B", 11);
      const nb = (await q<{ n: number }>(`SELECT count(*)::int n FROM "TripBooking" WHERE "basketId" = $1`, [h.v.basketId]))[0].n;
      out("B same-key mixed-bodies ×10", tally(rs), "bookings", nb);
      if (nb !== 1) finding("B-mixed", "BLOCKER", "mixed bodies created ≠1 booking", { nb });
    }
    // hold replay before / after checkout (STAFF and PUBLIC)
    for (const who of ["STAFF", "PUBLIC"]) {
      const d = await mkDep(sh, { date: "2027-03-22" });
      const ctx = who === "STAFF" ? staff(sh) : pub(sh);
      const ln = [line(sh.P, d, { a: 1 })];
      const qt = await quote(ctx, ln);
      const key = `hr${hex(6)}`;
      const h1 = await hold(ctx, ln, { key, quote: qt });
      const rs = await par(8, () => hold(ctx, ln, { key, quote: qt, token: h1.token }));
      bump("B", 9);
      const baskets = new Set(rs.map((x) => String(x.v.basketId)));
      out(`B hold replay ×8 before checkout ${who}`, tally(rs.map((x) => x.r)), "baskets", [...baskets].length, "same", baskets.has(String(h1.v.basketId)));
      const c = await confirm(h1); bump("B");
      const after = await hold(ctx, ln, { key, quote: qt, token: h1.token }); bump("B");
      const held = (await q<{ held: number; sold: number }>(`SELECT held, sold FROM "TripDeparture" WHERE id = $1`, [d]))[0];
      out(`B hold replay after checkout ${who}`, "confirm", code(c), "replay", code(after.r), asRec(after.r.value).basketId === h1.v.basketId ? "same basket" : "NEW/none", held);
      if (after.r.ok === true && asRec(after.r.value).basketId !== h1.v.basketId) finding("B-hold-replay", "MAJOR", `identical hold replay after checkout created a NEW basket/hold (${who})`, { held });
      else if (after.r.ok !== true) finding("B-hold-replay", "MINOR", `identical hold replay after checkout ⇒ ${code(after.r)} instead of the original Hold (${who})`, {});
      // hold key == later confirm key
      const d2 = await mkDep(sh, { date: "2027-03-22" });
      const k2 = `same${hex(6)}`;
      const h2 = await hold(ctx, [line(sh.P, d2, { a: 1 })], { key: k2 });
      const bk2 = booker();
      const c2 = await confirm(h2, { key: k2, booker: bk2 }); bump("B", 2);
      const c2b = await confirm(h2, { key: k2, booker: bk2 }); bump("B");
      out(`B hold-key reused as confirm-key ${who}`, code(h2.r), code(c2), "replay", code(c2b));
      if (c2.ok !== true || c2b.ok !== true) finding("B-keyreuse", "MINOR", `client reusing the hold key as the confirm key ⇒ ${code(c2)} / replay ${code(c2b)} (${who})`, {});
      await check("B", sh, [d, d2], `replay ${who}`);
    }
    // staff holdTrips key K then bookTripsNow key K
    {
      const d = await mkDep(sh, { date: "2027-03-22" });
      const k = `kk${hex(6)}`;
      const h = await hold(staff(sh), [line(sh.P, d)], { key: k });
      const bn = (await bookNow(staff(sh), [line(sh.P, d)], { key: k })).r; bump("B", 2);
      out("B holdKey==bookNowKey", code(h.r), code(bn));
    }
  }

  // ═══ C: multi-product baskets opposite order + product writers ═══
  if (ONLY.has("C")) {
    const tctx = { tenantId: sh.tenantId, actorUserId: sh.userId };
    for (let round = 0; round < ROUNDS; round++) {
      const d1 = await mkDep(sh, { date: "2027-03-25", capacity: 40 });
      const d2 = await mkDep(sh, { date: "2027-03-25", capacity: 40, P: sh.P2 });
      const dl0 = (await dbStats()).deadlocks;
      let stop = false;
      const writerLog: string[] = [];
      const writer = (async () => {
        let k = 0;
        while (!stop) {
          const a = await call("archiveProduct", tctx, { unitId: sh.unitId, productId: sh.P2.id, confirm: true, reason: "hunter archive test reason" });
          writerLog.push(`arch:${code(a)}`);
          await sleep(15);
          const r1 = await call("restoreProduct", tctx, { unitId: sh.unitId, productId: sh.P2.id });
          const r2 = await call("publishProduct", tctx, { unitId: sh.unitId, productId: sh.P2.id });
          writerLog.push(`rest:${code(r1)} pub:${code(r2)}`);
          if (r2.ok !== true) await q(`UPDATE "TripProduct" SET status = 'ACTIVE' WHERE id = $1`, [sh.P2.id]);
          const o = await call("setOptionActive", tctx, { unitId: sh.unitId, optionId: sh.P.opt2, active: k % 2 === 1 });
          writerLog.push(`opt:${code(o)}`);
          k++; bump("C", 4);
        }
      })();
      const rs = await par(30, async (i) => {
        const order = i % 2 === 0 ? [line(sh.P, d1), line(sh.P2, d2)] : [line(sh.P2, d2), line(sh.P, d1)];
        bump("C", 2);
        if (i % 3 === 0) return (await bookNow(staff(sh), order).catch((e) => ({ r: { ok: "THROW", e: String(e) } as Rec }))).r;
        try {
          const h = await hold(i % 3 === 1 ? pub(sh) : staff(sh), order);
          if (h.r.ok !== true) return h.r;
          bump("C");
          return await confirm(h);
        } catch (e) { return { ok: "THROW", e: String(e) } as Rec; }
      });
      stop = true; await writer;
      await q(`UPDATE "TripProduct" SET status = 'ACTIVE' WHERE id = $1`, [sh.P2.id]);
      const dl = (await dbStats()).deadlocks - dl0;
      // bookings on an archived product: compare booking createdAt vs archive audit windows is fuzzy — check none created while status ARCHIVED via audit after
      out(`C r${round}`, tally(rs), "deadlocks(db-wide Δ)", dl, "writer", [...new Set(writerLog)].slice(0, 8));
      if (rs.some((r) => r.ok === "THROW")) finding("C-throw", "MAJOR", "multi-product basket storm threw", rs.filter((r) => r.ok === "THROW").slice(0, 2));
      if (rs.some((r) => r.code === "BUSY")) finding("C-busy", "MINOR", "BUSY under multi-product storm", tally(rs));
      await check("C", sh, [d1, d2], `round ${round}`);
    }
  }

  // ═══ D: confirm racing hold expiry + sweeper + REHOLD ═══
  if (ONLY.has("D")) {
    const sweep = fnOf(T, "runExpireHolds");
    for (let round = 0; round < ROUNDS; round++) {
      const d = await mkDep(sh, { date: "2027-03-26", capacity: 12 });
      const hs: H[] = [];
      for (let i = 0; i < 10; i++) hs.push(await hold(i % 2 ? pub(sh) : staff(sh), [line(sh.P, d)]));
      bump("D", 10);
      const exp = new Date(String(hs[0].v.expiresAt)).getTime();
      const tasks: Promise<unknown>[] = hs.map((h, i) => {
        const when = new Date(exp + (i % 3 - 1) * 1000).toISOString(); // -1s, 0, +1s
        const onExp = asRec(h.ctx.actor).kind === "STAFF" && i % 4 === 0 ? { onExpired: "REHOLD" } : {};
        bump("D");
        return confirm(h, { ctx: withNow(h.ctx, when), extra: onExp });
      });
      tasks.push((async () => { await sleep(5); bump("D"); return sweep(new Date(exp + 500), { tenantIds: [sh.tenantId] }); })());
      const rs = await Promise.all(tasks);
      const cr = rs.slice(0, hs.length) as Rec[];
      await check("D", sh, [d], `round ${round}`);
      out(`D r${round}`, tally(cr), "sweep", fmt(rs[hs.length]).slice(0, 120));
    }
    // KEEP-mode public booking with promo then sweep → booking EXPIRED → consumer releases promo
    {
      const d = await mkDep(sh, { date: "2027-03-26" });
      const pc = `DX${hex(2)}`.toUpperCase();
      const rule = await insertRule(sh, { kind: "PROMO_CODE", code: pc, discountBp: 1000, maxUses: 3 });
      const h = await hold(pub(sh), [line(sh.P, d, { promo: pc })]);
      const c = await confirm(h); bump("D", 2);
      const b = refs(c)[0];
      const exp = new Date(String(h.v.expiresAt)).getTime();
      const sw = await sweep(new Date(exp + 1000), { tenantIds: [sh.tenantId] }); bump("D");
      const bst = (await q<{ status: string }>(`SELECT status FROM "TripBooking" WHERE id = $1`, [String(b?.bookingId)]))[0]?.status;
      const before = await invTenant(sh.tenantId);
      const rel = await call("onTripBookingExpired", { tenantId: sh.tenantId, unitId: sh.unitId, bookingId: String(b?.bookingId) });
      const rel2 = await call("onTripBookingExpired", { tenantId: sh.tenantId, unitId: sh.unitId, bookingId: String(b?.bookingId) });
      bump("D", 2);
      const ruleRow = (await q<Rec>(`SELECT "usedCount" FROM "TripPriceRule" WHERE id = $1`, [rule]))[0];
      out("D keep+promo+sweep", code(c), "status", b?.status, "→", bst, "sweep", fmt(sw).slice(0, 80), "before-consumer", before.filter((x) => x.startsWith("I4")), "consumer", code(rel), fmt(rel.value), "again", fmt(rel2.value), ruleRow);
      await check("D", sh, [d], "keep+promo");
    }
    // REHOLD when seats were taken meanwhile → SOLD_OUT nothing written
    {
      const d = await mkDep(sh, { date: "2027-03-27", capacity: 2 });
      const h = await hold(staff(sh), [line(sh.P, d, { a: 2 })]);
      const exp = new Date(String(h.v.expiresAt)).getTime();
      await fnOf(T, "runExpireHolds")(new Date(exp + 1000), { tenantIds: [sh.tenantId] });
      const other = (await bookNow(staff(sh, { now: new Date(exp + 2000).toISOString() }), [line(sh.P, d, { a: 1 })])).r;
      const c = await confirm(h, { ctx: withNow(h.ctx, new Date(exp + 3000).toISOString()), extra: { onExpired: "REHOLD" } });
      bump("D", 4);
      const nb = (await q<{ n: number }>(`SELECT count(*)::int n FROM "TripBooking" WHERE "basketId" = $1`, [h.v.basketId]))[0].n;
      out("D REHOLD into full", code(other), code(c), "bookings", nb);
      await check("D", sh, [d], "rehold-full");
      // concurrent REHOLD x2 of different baskets for the last seat
      const d2 = await mkDep(sh, { date: "2027-03-27", capacity: 1 });
      const ha = await hold(staff(sh), [line(sh.P, d2)]);
      await fnOf(T, "runExpireHolds")(new Date(exp + 1000), { tenantIds: [sh.tenantId] });
      const hb = await hold(staff(sh, { now: new Date(exp + 1500).toISOString() }), [line(sh.P, d2)]);
      const exp2 = new Date(String(hb.v.expiresAt)).getTime();
      const later = new Date(Math.max(exp2, exp) + 5000).toISOString();
      const both = await Promise.all([confirm(ha, { ctx: withNow(ha.ctx, later), extra: { onExpired: "REHOLD" } }), confirm(hb, { ctx: withNow(hb.ctx, later), extra: { onExpired: "REHOLD" } })]);
      bump("D", 4);
      out("D REHOLD×2 last seat (hold b still ACTIVE but past expiry)", both.map(code));
      await check("D", sh, [d2], "rehold-race");
    }
  }

  // ═══ F: promo maxUses + PRICE_CHANGED injection ═══
  if (ONLY.has("F")) {
    for (const maxUses of [1, 2, 3]) {
      for (let round = 0; round < Math.max(2, Math.floor(ROUNDS / 2)); round++) {
        const d = await mkDep(sh, { date: "2027-03-28", capacity: 40 });
        const pc = `F${maxUses}${hex(2)}`.toUpperCase();
        const rule = await insertRule(sh, { kind: "PROMO_CODE", code: pc, discountBp: 1000, maxUses });
        const hs: H[] = [];
        for (let i = 0; i < 20; i++) hs.push(await hold(i % 2 ? pub(sh) : staff(sh), [line(sh.P, d, { promo: pc })]));
        bump("F", 20);
        const rs = await par(20, (i) => confirm(hs[i], { pay: "PAY_NOW" }));
        bump("F", 20);
        const okN = rs.filter((r) => r.ok === true).length;
        const rr = (await q<{ used: number; act: number }>(`SELECT "usedCount" used, (SELECT count(*)::int FROM "TripPromoRedemption" x WHERE x."ruleId" = r.id AND x.status='ACTIVE') act FROM "TripPriceRule" r WHERE id = $1`, [rule]))[0];
        const fails = rs.filter((r) => r.ok !== true);
        const badFail = fails.filter((r) => !(r.code === "PRICE_CHANGED" && ["PROMO_EXHAUSTED"].includes(String(asRec(r.details).reason))));
        out(`F maxUses=${maxUses} r${round}`, tally(rs), "ok", okN, rr);
        if (okN !== maxUses || rr.used !== maxUses || rr.act !== maxUses) finding("F-promo", "BLOCKER", `maxUses ${maxUses}: ok ${okN} used ${rr.used} active ${rr.act}`, tally(rs));
        if (badFail.length) finding("F-promo-code", "MINOR", "unexpected failure code under promo storm", tally(badFail));
        // failed confirms must keep hold ACTIVE and write nothing
        const failedBaskets = hs.filter((_, i) => rs[i].ok !== true).map((h) => String(h.v.basketId));
        const leaked = (await q<{ n: number }>(`SELECT count(*)::int n FROM "TripBooking" WHERE "basketId" = ANY($1::text[])`, [failedBaskets]))[0].n;
        const stillActive = (await q<{ n: number }>(`SELECT count(*)::int n FROM "TripHold" WHERE "basketId" = ANY($1::text[]) AND status = 'ACTIVE'`, [failedBaskets]))[0].n;
        if (leaked || stillActive !== failedBaskets.length) finding("F-rollback", "BLOCKER", "failed promo confirm wrote rows / lost hold", { leaked, stillActive, failed: failedBaskets.length });
        await check("F", sh, [d], `maxUses ${maxUses}`);
      }
    }
    // PRICE_CHANGED injection between quote and hold, and between hold and confirm
    {
      const d = await mkDep(sh, { date: "2027-03-29" });
      const ln = [line(sh.P, d, { a: 2 })];
      const ctx = pub(sh);
      const qt = await quote(ctx, ln);
      const priceId = (await q<{ id: string }>(`SELECT id FROM "TripPrice" WHERE "productId" = $1 AND "paxTypeId" = $2`, [sh.P.id, sh.P.pt.ADULT]))[0].id;
      await q(`UPDATE "TripPrice" SET "amountMinor" = "amountMinor" + 100 WHERE id = $1`, [priceId]);
      const seq0 = (await q<{ n: number }>(`SELECT COALESCE(sum(seq),0)::int n FROM "SellCounter" WHERE "tenantId" = $1`, [sh.tenantId]))[0].n;
      const h0 = await hold(ctx, ln, { quote: qt }); bump("F");
      await q(`UPDATE "TripPrice" SET "amountMinor" = "amountMinor" - 100 WHERE id = $1`, [priceId]);
      const h = await hold(ctx, ln); bump("F");
      await q(`UPDATE "TripPrice" SET "amountMinor" = "amountMinor" + 100 WHERE id = $1`, [priceId]);
      const c = await confirm(h); bump("F");
      await q(`UPDATE "TripPrice" SET "amountMinor" = "amountMinor" - 100 WHERE id = $1`, [priceId]);
      const seq1 = (await q<{ n: number }>(`SELECT COALESCE(sum(seq),0)::int n FROM "SellCounter" WHERE "tenantId" = $1`, [sh.tenantId]))[0].n;
      const nb = (await q<{ n: number }>(`SELECT count(*)::int n FROM "TripBooking" WHERE "basketId" = $1`, [String(h.v.basketId)]))[0].n;
      const hst = (await q<{ status: string }>(`SELECT status FROM "TripHold" WHERE "basketId" = $1`, [String(h.v.basketId)])).map((x) => x.status);
      out("F PRICE_CHANGED", "hold-after-edit", code(h0.r), !!asRec(h0.r.details).quote, "confirm-after-edit", code(c), !!asRec(c.details).quote, "bookings", nb, "hold", hst, "seqΔ", seq1 - seq0);
      if (h0.r.code !== "PRICE_CHANGED" || c.code !== "PRICE_CHANGED" || nb || seq1 !== seq0 || hst[0] !== "ACTIVE") finding("F-pricechanged", "BLOCKER", "PRICE_CHANGED wrote or not detected", { h0: code(h0.r), c: code(c), nb, hst, seq: seq1 - seq0 });
      // retry with fresh quote must work (after confirm failed)
      const c2 = await confirm(h); bump("F");
      out("F confirm again after price restored", code(c2));
      await check("F", sh, [d], "price");
    }
  }

  // ═══ G: numbering 50 parallel across two units + month boundary ═══
  if (ONLY.has("G")) {
    const P3 = await mkProd(sh.tenantId, sh.unit2, "g3");
    const dA = await mkDep(sh, { date: "2027-04-30", capacity: 200 });
    const dB = await mkDep(sh, { date: "2027-05-01", capacity: 200, P: P3 });
    const dC = await mkDep(sh, { date: "2027-05-01", capacity: 200 });
    for (let round = 0; round < Math.max(2, Math.floor(ROUNDS / 2)); round++) {
      const rs = await par(50, async (i) => {
        const now = i % 2 ? "2027-03-31T16:59:59.000Z" : "2027-03-31T17:00:01.000Z";
        const u2 = i % 3 === 0;
        const ctx = staff(sh, { now, unit: u2 ? sh.unit2 : sh.unitId });
        const ln = u2 ? [line(P3, dB)] : i % 3 === 1 ? [line(sh.P, dA)] : [line(sh.P, dC), line(sh.P, dA)];
        bump("G");
        if (i % 2) return (await bookNow(ctx, ln)).r;
        const h = await hold(ctx, ln); bump("G");
        return h.r.ok === true ? confirm(h) : h.r;
      });
      const codes = (await q<{ code: string; unitId: string }>(`SELECT code, "unitId" FROM "TripBooking" WHERE "departureId" = ANY($1::text[])`, [[dA, dB, dC]]));
      out(`G r${round}`, tally(rs), "codes", codes.length, "sample", codes.slice(0, 3).map((c) => c.code));
      if (rs.some((r) => r.ok !== true)) finding("G-fail", "MAJOR", "numbering storm had failures", tally(rs));
      await check("G", sh, [dA, dB, dC], `round ${round}`);
    }
  }

  // ═══ G2: two-line baskets, disjoint departures, opposite period order (counter-row lock order) ═══
  if (ONLY.has("G2")) {
    for (let round = 0; round < Math.max(2, Math.floor(ROUNDS / 2)); round++) {
      const dl0 = (await dbStats()).deadlocks;
      const deps: string[] = [];
      const rs = await par(40, async (i) => {
        const apr = await mkDep(sh, { date: "2027-04-20", capacity: 4 });
        const may = await mkDep(sh, { date: "2027-05-20", capacity: 4 });
        deps.push(apr, may);
        const ln = i % 2 ? [line(sh.P, may), line(sh.P, apr)] : [line(sh.P, apr), line(sh.P, may)];
        bump("G2");
        if (i % 4 < 2) return (await bookNow(staff(sh), ln)).r;
        const h = await hold(i % 4 === 2 ? pub(sh) : staff(sh), ln); bump("G2");
        return h.r.ok === true ? confirm(h) : h.r;
      });
      const dl = (await dbStats()).deadlocks - dl0;
      const slow = rs.filter((r) => Number(r.__ms) > 10_000).length;
      out(`G2 r${round}`, tally(rs), "deadlocksΔ(db-wide)", dl, "slow>10s", slow, "maxMs", Math.max(...rs.map((r) => Number(r.__ms) || 0)));
      if (rs.some((r) => r.ok !== true)) finding("G2-fail", dl > 0 ? "MAJOR" : "MINOR", "opposite-period two-line baskets failed", { tally: tally(rs), deadlocks: dl });
      await check("G2", sh, deps, `round ${round}`);
    }
  }

  // ═══ P: pool pressure (I6) — 40 parallel public hold+confirm + 40 staff bookNow ═══
  if (ONLY.has("P")) {
    for (let round = 0; round < Math.max(2, Math.floor(ROUNDS / 2)); round++) {
      const deps = await Promise.all(Array.from({ length: 8 }, () => mkDep(sh, { date: "2027-04-22", capacity: 30 })));
      const t0 = Date.now();
      const rs = await par(80, async (i) => {
        const d = deps[i % deps.length];
        bump("P");
        if (i % 2) return (await bookNow(staff(sh), [line(sh.P, d)])).r;
        const h = await hold(pub(sh), [line(sh.P, d)]); bump("P");
        return h.r.ok === true ? confirm(h) : h.r;
      });
      const ms = rs.map((r) => Number(r.__ms) || 0).sort((a, b) => a - b);
      const stall = rs.filter((r) => /P2028|P2024|Unable to start a transaction|Timed out fetching/i.test(String(r.e ?? "")) || r.code === "BUSY");
      out(`P r${round}`, tally(rs), "wall", Date.now() - t0, "p50", ms[Math.floor(ms.length / 2)], "p95", ms[Math.floor(ms.length * 0.95)], "max", ms[ms.length - 1], "stalls", stall.length);
      if (stall.length || ms[ms.length - 1] > 25_000) finding("P-stall", "MAJOR", "pool stall / BUSY under 80 parallel callers", { tally: tally(rs), max: ms[ms.length - 1] });
      await check("P", sh, deps, `round ${round}`);
    }
  }

  const sm = await sampler();
  const s1 = await dbStats();
  const pcRes = (globalThis as Rec).__pc;
  const summary = { ops, stats, violations, findings, pc: pcRes, pool: { ...sm, deadlocksDbWideDelta: s1.deadlocks - s0.deadlocks } };
  console.log("\n===== SUMMARY =====");
  console.log(JSON.stringify(summary, null, 1));
}

async function insertRule(sh: Shop, params: Rec): Promise<string> {
  const { insertRow } = await import("./probe-trips-t0.6-lib.mjs");
  return insertRow("TripPriceRule", { id: rid("ru"), tenantId: sh.tenantId, unitId: sh.unitId, productId: null, kind: params.kind, code: params.code ?? null, params: JSON.stringify(params), priority: 0, active: true, usedCount: 0, updatedAt: new Date() });
}

let rc = 0;
try { await main(); } catch (e) { console.error("probe crashed", e); rc = 2; }
finally { try { await cleanup(); } catch (e) { console.error("cleanup", e); } await shutdown(); }
process.exit(rc);

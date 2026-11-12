// probe-trips-t0.4-races.mts — นักล่า T0.4 ข้อ 2 (แข่งเฉพาะจุด ×200) · ข้อ 5 (เพดานถือ) · ข้อ 9 (แยกร้าน/หน่วย + input ร้าย) · untracked
import {
  DATE, NOW0, PUB, STAFF, SYS, addMin, asRec, basket, boot, brief, call, cleanup, fmt, fnOf, hex, ikey, inTx, invCheck, mkDep, mkShop, mkUnit, mkProd, mods, out, q, rawLeak, setV, shutdown, sleep, unnamed,
  type Rec, type Shop,
} from "./probe-trips-t0.4-lib.mjs";

boot("probe-trips-t0.4-races");
const findings: string[] = [];
const F = (s: string) => { findings.push(s); console.log(`  🔴 ${s}`); };
const ITER = 200;
const BATCH = 10;
const jitter = (ms = 25) => sleep(Math.floor(Math.random() * ms));
const leakCheck = (tag: string, rs: Rec[]) => { for (const r of rs) if (rawLeak(r) || unnamed(r)) { F(`${tag}: raw/unnamed ${fmt(r).slice(0, 300)}`); return; } };

async function staffHold(sh: Shop, dep: string, qty: number, now: Date, purpose = "PAYMENT"): Promise<string> {
  const r = await call("placeHold", STAFF(sh, now), { departureId: dep, qty, idempotencyKey: ikey(), purpose });
  if (r.ok !== true) throw new Error(`setup hold ${fmt(r)}`);
  return String(asRec(r.value).holdId);
}
const convertTx = async (sh: Shop, hid: string, now: Date) => { const { T } = await mods(); return inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "convertHoldInTx")(tx, STAFF(sh, now), { holdId: hid })); };
const statusOf = async (ids: string[]) => new Map((await q<{ id: string; status: string }>(`SELECT id, status FROM "TripHold" WHERE id = ANY($1::text[])`, [ids])).map((r) => [r.id, r.status]));

/** ตัวแข่งบน hold: setup ต่อรอบ 10 ตัว · pair = สองขาพร้อมกัน · judge ตัดสินผลต่อ hold */
async function holdRace(sh: Shop, name: string, purpose: string, legs: (hid: string, exp: Date) => Promise<Rec>[], judge: (rs: Rec[], st: string) => string | null) {
  const dep = await mkDep(sh, { capacity: 5000 });
  let bad = 0; const outcomes = new Map<string, number>();
  const t0 = Date.now();
  for (let b = 0; b < ITER / BATCH; b++) {
    const now = addMin(NOW0, b);
    const hs = await Promise.all(Array.from({ length: BATCH }, () => staffHold(sh, dep, 2, now, purpose)));
    const exp = new Date((await q<{ e: Date }>(`SELECT "expiresAt" AS e FROM "TripHold" WHERE id = $1`, [hs[0]]))[0].e);
    const res = await Promise.all(hs.map((h) => Promise.all(legs(h, exp))));
    const st = await statusOf(hs);
    res.forEach((rs, i) => {
      leakCheck(name, rs);
      const k = `${rs.map(brief).join("|")} → ${st.get(hs[i])}`;
      outcomes.set(k, (outcomes.get(k) ?? 0) + 1);
      const why = judge(rs, String(st.get(hs[i])));
      if (why && bad++ < 5) F(`race ${name}: ${why} :: ${k}`);
    });
    const inv = await invCheck([dep]);
    for (const v of inv.viol) F(`race ${name}: invariant ${v}`);
  }
  // sold ต้องเท่ากับ CONVERTED จริง
  const row = (await invCheck([dep])).rows[0];
  const conv = (await q<{ s: number }>(`SELECT COALESCE(sum("qtyPublic"),0)::int AS s FROM "TripHold" WHERE "departureId" = $1 AND status = 'CONVERTED'`, [dep]))[0].s;
  if (row.sold !== conv) F(`race ${name}: sold ${row.sold} ≠ Σ CONVERTED ${conv}`);
  out(`race ${name}`, { iterations: ITER, ms: Date.now() - t0, bad, outcomes: Object.fromEntries(outcomes) });
}

async function races(sh: Shop) {
  const { T } = await mods();
  const sweep = (now: Date) => call("runExpireHolds", now, { tenantIds: [sh.tenantId] }).then((r) => (r.THROW ? r : Array.isArray(r.failed) && r.failed.length ? { ok: false, code: "SWEEP_FAILED", f: r.failed } : { ok: true, expired: r.expired }));
  const justBefore = (e: Date) => new Date(e.getTime() - 1);
  if (!process.argv.includes("--skip-done")) {
  // a) convert vs sweeper
  await holdRace(sh, "convert-vs-sweeper", "PAYMENT", (h, e) => [convertTx(sh, h, justBefore(e)), jitter().then(() => sweep(e))],
    (rs, st) => (rs[0].ok === true ? (st === "CONVERTED" ? null : "convert ok but not CONVERTED") : rs[0].code === "HOLD_EXPIRED" && st === "EXPIRED" ? null : "unexpected"));
  // b) convert vs release
  await holdRace(sh, "convert-vs-release", "PAYMENT", (h, e) => [convertTx(sh, h, justBefore(e)), jitter().then(() => call("releaseHold", STAFF(sh, justBefore(e)), { holdId: h, reason: "race" }))],
    (rs, st) => { const okN = rs.filter((r) => r.ok === true).length; if (okN !== 1) return `ok count ${okN}`; return (rs[0].ok === true) === (st === "CONVERTED") && (rs[1].ok === true) === (st === "RELEASED") ? null : "winner/state mismatch"; });
  // c) convert ×2
  await holdRace(sh, "convert-x2", "PAYMENT", (h, e) => [convertTx(sh, h, justBefore(e)), convertTx(sh, h, justBefore(e))],
    (rs, st) => (rs.filter((r) => r.ok === true).length === 1 && st === "CONVERTED" && rs.some((r) => r.code === "STATE_CONFLICT") ? null : "not exactly one convert"));
  // d) release ×2
  await holdRace(sh, "release-x2", "PAYMENT", (h, e) => [call("releaseHold", STAFF(sh, justBefore(e)), { holdId: h, reason: "a" }), call("releaseHold", STAFF(sh, justBefore(e)), { holdId: h, reason: "b" })],
    (rs, st) => (rs.every((r) => r.ok === true) && rs.filter((r) => asRec(r.value).duplicated === true).length === 1 && st === "RELEASED" ? null : "release x2 not (ok, ok-duplicated)"));
  // e) extend vs sweeper (SHOP_CONFIRM ต่ออายุได้)
  await holdRace(sh, "extend-vs-sweeper", "SHOP_CONFIRM", (h, e) => [call("extendHold", STAFF(sh, justBefore(e)), { holdId: h }), jitter().then(() => sweep(e))],
    (rs, st) => (rs[0].ok === true ? (st === "ACTIVE" ? null : "extend ok but hold not ACTIVE") : rs[0].code === "HOLD_EXPIRED" && st === "EXPIRED" ? null : "unexpected"));

  // f) placeHold คีย์เดียว ×10 (STAFF ครึ่ง PUBLIC ครึ่ง)
  {
    const dep = await mkDep(sh, { capacity: 5000 });
    let bad = 0; const t0 = Date.now(); let calls = 0;
    for (let i = 0; i < ITER; i++) {
      const pub = i % 2 === 1;
      const key = ikey(); const bk = basket();
      const input = { departureId: dep, qty: 2, idempotencyKey: key, ...(pub ? { capKey: bk } : {}) };
      const rs = await Promise.all(Array.from({ length: 10 }, () => call("placeHold", pub ? PUB(sh) : STAFF(sh), input)));
      calls += 10;
      leakCheck("idem-x10", rs);
      const ids = new Set(rs.filter((r) => r.ok === true).map((r) => String(asRec(r.value).holdId)));
      const fresh = rs.filter((r) => r.ok === true && asRec(r.value).duplicated === false).length;
      if ((ids.size !== 1 || fresh !== 1 || rs.some((r) => r.ok !== true)) && bad++ < 5) F(`idem-x10 ${pub ? "PUBLIC" : "STAFF"}: ids=${ids.size} fresh=${fresh} codes=${rs.map(brief).join(",")}`);
    }
    const inv = await invCheck([dep]);
    for (const v of inv.viol) F(`idem-x10 invariant ${v}`);
    const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripHold" WHERE "departureId" = $1`, [dep]))[0].n;
    if (n !== ITER || inv.rows[0].held !== ITER * 2) F(`idem-x10: rows ${n} held ${inv.rows[0].held} expected ${ITER} / ${ITER * 2}`);
    out("race idem-x10", { iterations: ITER, calls, ms: Date.now() - t0, bad, rows: n, held: inv.rows[0].held });
  }

  }
  // g1) cancelDeparture vs placeHold บนรอบว่าง · g2) cancel vs release vs convert
  {
    let bad = 0; const oc = new Map<string, number>(); const t0 = Date.now();
    for (let b = 0; b < ITER / BATCH; b++) {
      const deps = await Promise.all(Array.from({ length: BATCH }, () => mkDep(sh, { capacity: 10 })));
      const res = await Promise.all(deps.map((d) => Promise.all([
        jitter(250).then(() => call("cancelDeparture", sh.tctx, { unitId: sh.unitId, departureId: d, reason: "hunt race" }, { now: NOW0 })),
        jitter(30).then(() => call("placeHold", b % 2 ? PUB(sh) : STAFF(sh), { departureId: d, qty: 1, idempotencyKey: ikey(), ...(b % 2 ? { capKey: basket() } : {}) })),
      ])));
      const inv = await invCheck(deps);
      res.forEach((rs, i) => {
        leakCheck("cancel-vs-hold", rs);
        const row = inv.rows.find((x) => x.id === deps[i]);
        const k = `${rs.map(brief).join("|")} → ${row?.status} h${row?.held}`;
        oc.set(k, (oc.get(k) ?? 0) + 1);
        const okN = rs.filter((r) => r.ok === true).length;
        if ((okN !== 1 || (row?.status === "CANCELLED") !== (rs[0].ok === true) || (row?.held ?? 0) !== (rs[1].ok === true ? 1 : 0)) && bad++ < 5) F(`cancel-vs-hold: ${k}`);
      });
      for (const v of inv.viol) F(`cancel-vs-hold invariant ${v}`);
    }
    out("race cancel-vs-hold", { iterations: ITER, ms: Date.now() - t0, bad, outcomes: Object.fromEntries(oc) });
  }
  {
    let bad = 0; const oc = new Map<string, number>(); const t0 = Date.now();
    for (let b = 0; b < ITER / BATCH; b++) {
      const deps = await Promise.all(Array.from({ length: BATCH }, () => mkDep(sh, { capacity: 10 })));
      const hs = await Promise.all(deps.map((d) => staffHold(sh, d, 2, NOW0)));
      const res = await Promise.all(deps.map((d, i) => Promise.all([
        jitter(40).then(() => call("releaseHold", STAFF(sh), { holdId: hs[i], reason: "race" })),
        jitter(400).then(() => call("cancelDeparture", sh.tctx, { unitId: sh.unitId, departureId: d, reason: "hunt race" }, { now: NOW0 })),
        jitter(300).then(() => convertTx(sh, hs[i], NOW0)),
      ])));
      const inv = await invCheck(deps);
      const st = await statusOf(hs);
      res.forEach((rs, i) => {
        leakCheck("cancel-release-convert", rs);
        const row = inv.rows.find((x) => x.id === deps[i]);
        const k = `${rs.map(brief).join("|")} → dep ${row?.status} s${row?.sold} h${row?.held} hold ${st.get(hs[i])}`;
        oc.set(k, (oc.get(k) ?? 0) + 1);
        const conv = rs[2].ok === true, rel = rs[0].ok === true, can = rs[1].ok === true;
        const good = (conv !== rel) && (!can || (rel && !conv)) && (row?.sold ?? -1) === (conv ? 2 : 0) && (row?.status === "CANCELLED") === can;
        if (!good && bad++ < 5) F(`cancel-release-convert: ${k}`);
      });
      for (const v of inv.viol) F(`cancel-release-convert invariant ${v}`);
    }
    out("race cancel-release-convert", { iterations: ITER, ms: Date.now() - t0, bad, outcomes: Object.fromEntries(oc) });
  }

  // h) ลดความจุเหลือ sold+held พอดี vs ถือ 1
  {
    let bad = 0; const oc = new Map<string, number>(); const t0 = Date.now();
    for (let b = 0; b < ITER / BATCH; b++) {
      const deps = await Promise.all(Array.from({ length: BATCH }, () => mkDep(sh, { capacity: 10, sold: 4 })));
      await Promise.all(deps.map((d) => staffHold(sh, d, 3, NOW0)));
      const res = await Promise.all(deps.map((d) => Promise.all([
        call("setDepartureCapacity", sh.tctx, { unitId: sh.unitId, departureId: d, capacity: 7 }, { now: NOW0 }),
        jitter(150).then(() => call("placeHold", STAFF(sh), { departureId: d, qty: 1, idempotencyKey: ikey() })),
      ])));
      const inv = await invCheck(deps);
      res.forEach((rs, i) => {
        leakCheck("cap-vs-hold", rs);
        const row = inv.rows.find((x) => x.id === deps[i]);
        const k = `${rs.map(brief).join("|")} → c${row?.capacity} h${row?.held} ${row?.status}`;
        oc.set(k, (oc.get(k) ?? 0) + 1);
        if (rs.filter((r) => r.ok === true).length !== 1 && bad++ < 5) F(`cap-vs-hold: ${k}`);
      });
      for (const v of inv.viol) F(`cap-vs-hold invariant ${v}`);
    }
    out("race cap-vs-hold", { iterations: ITER, ms: Date.now() - t0, bad, outcomes: Object.fromEntries(oc) });
  }

  // i) ที่สุดท้าย ×50 (20 รอบ)
  {
    let bad = 0; const oc = new Map<string, number>(); const t0 = Date.now(); let calls = 0;
    for (let i = 0; i < 20; i++) {
      const d = await mkDep(sh, { capacity: 5, sold: 4 });
      const rs = await Promise.all(Array.from({ length: 50 }, (_, j) => call("placeHold", j % 2 ? PUB(sh) : STAFF(sh), { departureId: d, qty: 1, idempotencyKey: ikey(), ...(j % 2 ? { capKey: basket() } : {}) })));
      calls += 50;
      leakCheck("last-seat", rs);
      const row = (await invCheck([d])).rows[0];
      const k = `ok=${rs.filter((r) => r.ok === true).length} ${[...new Set(rs.filter((r) => r.ok !== true).map(brief))].join(",")} → h${row.held} ${row.status}`;
      oc.set(k, (oc.get(k) ?? 0) + 1);
      if ((rs.filter((r) => r.ok === true).length !== 1 || row.status !== "FULL" || row.held !== 1) && bad++ < 5) F(`last-seat: ${k}`);
      const nf = rs.filter((r) => r.ok !== true && r.code === "SOLD_OUT" && asRec(r.details).publicLeft === undefined);
      if (nf.length && bad++ < 5) F(`last-seat: SOLD_OUT without details.publicLeft ${fmt(nf[0])}`);
      for (const v of (await invCheck([d])).viol) F(`last-seat invariant ${v}`);
    }
    out("race last-seat-x50", { iterations: 20, calls, ms: Date.now() - t0, bad, outcomes: Object.fromEntries(oc) });
  }
  void T; void SYS;
}

// ═══════════ ข้อ 5 เพดานถือ ═══════════
async function holdCap(sh: Shop, shA2: Shop, shB: Shop) {
  const { T } = await mods();
  await setV(sh, [{ key: "trips.public.holdCapPerContact", scope: "UNIT", scopeId: sh.unitId, value: 5 }]);
  const dep = await mkDep(sh, { capacity: 5000 });
  // 20 พร้อมกันต่อ basket เดียว × 10 รอบ
  const tally = new Map<string, number>();
  for (let i = 0; i < 10; i++) {
    const bk = basket();
    const rs = await Promise.all(Array.from({ length: 20 }, () => call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: bk })));
    leakCheck("cap20", rs);
    const okN = rs.filter((r) => r.ok === true).length;
    const k = `ok=${okN} ${[...new Set(rs.filter((r) => r.ok !== true).map(brief))].join(",")}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
    if (okN !== 5) F(`cap: 20 parallel on one basket with cap 5 → ${k}`);
  }
  out("cap 20-parallel x10", Object.fromEntries(tally));
  // หมดเวลาแล้วไม่นับ (ยังไม่กวาด)
  const bk = basket();
  for (let i = 0; i < 5; i++) await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: bk });
  const r6now = await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: bk });
  const r6later = await call("placeHold", PUB(sh, addMin(NOW0, 16)), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: bk });
  out("cap expired-not-counted", { sixthNow: brief(r6now), sixthAfter16min: brief(r6later) });
  if (r6now.code !== "HOLD_LIMIT" || r6later.ok !== true) F(`cap expired: now=${brief(r6now)} +16m=${brief(r6later)}`);
  // หน่วยอื่น/ร้านอื่น basket เดียวกัน
  const bx = basket();
  for (let i = 0; i < 5; i++) await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: bx });
  const depA2 = await mkDep(shA2, { capacity: 50 });
  const depB = await mkDep(shB, { capacity: 50 });
  const inA2 = await call("placeHold", PUB(shA2), { departureId: depA2, qty: 1, idempotencyKey: ikey(), capKey: bx });
  const inB = await call("placeHold", PUB(shB), { departureId: depB, qty: 1, idempotencyKey: ikey(), capKey: bx });
  out("cap cross-unit/tenant (basket full in unit A)", { otherUnitSameTenant: brief(inA2), otherTenant: brief(inB) });
  if (inB.ok !== true) F(`cap: basket full in tenant A blocks tenant B → ${brief(inB)}`);
  if (inA2.ok !== true) F(`cap: basket full in unit A blocks the same basket key in unit A2 (same tenant) → ${brief(inA2)} (count query is per tenant, not per unit)`);
  // ผู้ที่ไม่นับเพดาน: STAFF 20 ครั้ง
  const st = await Promise.all(Array.from({ length: 20 }, () => call("placeHold", STAFF(sh), { departureId: dep, qty: 1, idempotencyKey: ikey() })));
  if (st.some((r) => r.ok !== true)) F(`cap: STAFF holds limited ${st.map(brief).join(",")}`);
  // re-key ไป contact: 20 ตะกร้าคนละ 1 hold → contact เดียว พร้อมกัน ⇒ ผ่าน 5 พอดี
  const contact = `contact:${hex(8)}`;
  const hids: string[] = [];
  for (let i = 0; i < 20; i++) { const r = await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: basket() }); hids.push(String(asRec(r.value).holdId)); }
  const rk = await Promise.all(hids.map((h) => inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "rekeyHoldsToContactInTx")(tx, PUB(sh), { holdIds: [h], contactKey: contact }))));
  leakCheck("rekey", rk);
  const rkOk = rk.filter((r) => r.ok === true).length;
  out("cap rekey 20 parallel → one contact (cap 5)", { ok: rkOk, codes: [...new Set(rk.map(brief))] });
  if (rkOk !== 5) F(`cap rekey: ${rkOk} of 20 rekeyed into one contact with cap 5`);
  // re-key hold ที่หมดอายุ · hold ของ STAFF · hold ของหน่วยอื่น
  const hExp = String(asRec((await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: basket() })).value).holdId);
  const rkExp = await inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "rekeyHoldsToContactInTx")(tx, PUB(sh, addMin(NOW0, 20)), { holdIds: [hExp], contactKey: `contact:${hex(6)}` }));
  const hSt = String(asRec(st[0].value).holdId);
  const rkSt = await inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "rekeyHoldsToContactInTx")(tx, PUB(sh), { holdIds: [hSt], contactKey: `contact:${hex(6)}` }));
  const hA2 = String(asRec(inA2.value).holdId);
  const rkA2 = await inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "rekeyHoldsToContactInTx")(tx, PUB(sh), { holdIds: [hA2], contactKey: `contact:${hex(6)}` }));
  out("cap rekey edge", { expiredHold: brief(rkExp), staffHold: brief(rkSt), otherUnitHoldFromUnitA: brief(rkA2) });
  // ตะกร้าเดิมหลัง re-key ไปแล้ว: ถือเพิ่มได้อีก 5
  const bk2 = basket(); const mine: string[] = [];
  for (let i = 0; i < 5; i++) mine.push(String(asRec((await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: bk2 })).value).holdId));
  await inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "rekeyHoldsToContactInTx")(tx, PUB(sh), { holdIds: mine, contactKey: `contact:${hex(6)}` }));
  let more = 0;
  for (let i = 0; i < 6; i++) if ((await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: bk2 })).ok === true) more++;
  out("cap basket after rekey of its 5 holds", { additionalHoldsAllowed: more, note: "basket count resets after rekey; contact cap only re-checked at next confirm" });
  for (const v of (await invCheck([dep])).viol) F(`cap invariant ${v}`);
}

// ═══════════ ข้อ 9 แยกร้าน/หน่วย + input ร้าย ═══════════
async function isolation(sh: Shop, shA2: Shop, shB: Shop) {
  const { T } = await mods();
  const dep = await mkDep(sh, { capacity: 30, sold: 5 });
  const dep2 = await mkDep(sh, { capacity: 30, sold: 5 });
  const h = await staffHold(sh, dep, 2, NOW0);
  const h2 = await staffHold(sh, dep, 1, NOW0);
  const party = await (await import("./probe-trips-t0.4-lib.mjs")).insertRow("Party", { tenantId: sh.tenantId, name: "hunt party", updatedAt: new Date() });
  const snap = async () => fmt(await q(`SELECT d.id, d.capacity, d.sold, d.held, d.reserved, d.status, d.version, (SELECT json_agg(json_build_object('id', h.id, 's', h.status, 'k', h."capKeyHash", 'e', h."expiresAt") ORDER BY h.id) FROM "TripHold" h WHERE h."departureId" = d.id) AS hs FROM "TripDeparture" d WHERE d.id = ANY($1::text[]) ORDER BY d.id`, [[dep, dep2]]));
  const before = await snap();
  const ctxs: [string, (now?: Date) => Rec][] = [
    ["tenantB", (n) => STAFF(shB, n)], ["unitA2", (n) => STAFF(shA2, n)], ["tenantB+unitA", (n) => ({ ...STAFF(sh, n), tenantId: shB.tenantId })], ["pubB", (n) => PUB(shB, n)],
  ];
  const results = new Map<string, Set<string>>();
  const msgs = new Set<string>();
  const add = (fnName: string, r: Rec) => { const k = r.THROW ? `THROW:${String(r.THROW).slice(0, 80)}` : r.ok === true ? "OK!" : String(r.code); const s = results.get(fnName) ?? new Set(); s.add(k); results.set(fnName, s); if (r.code === "NOT_FOUND") msgs.add(String(r.messageTh)); };
  for (const [, mk] of ctxs) {
    const c = mk(NOW0);
    add("getAvailability", await call("getAvailability", c, { departureId: dep }));
    add("listAvailability", await call("listAvailability", c, { productId: sh.prodId, from: DATE, to: DATE }).then((r) => (r.ok === true && Array.isArray(r.value) && r.value.length === 0 ? { ok: false, code: "EMPTY" } : r)));
    add("placeHold", await call("placeHold", c, { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: basket() }));
    add("extendHold", await call("extendHold", c, { holdId: h }));
    add("releaseHold", await call("releaseHold", c, { holdId: h, reason: "x" }));
    add("convertHold", await call("convertHold", c, { holdId: h }));
    add("returnSold", await call("returnSold", c, { departureId: dep, qty: 1 }));
    add("moveSold", await call("moveSold", c, { fromDepartureId: dep, toDepartureId: dep2, qty: 1 }));
    add("joinWaitlist", await call("joinWaitlist", c, { departureId: dep, qty: 1, partyId: party, idempotencyKey: ikey() }));
    add("offerWaitlist", await call("offerWaitlist", c, { departureId: dep }));
    add("listWaitlist", await call("listWaitlist", c, { departureId: dep }));
    const rows = await fnOf(T, "capacityRowsOf")(c, { holdId: h }).catch((e: unknown) => ({ THROW: String(e) }));
    add("capacityRowsOf", Array.isArray(rows) && rows.length === 0 ? { ok: false, code: "EMPTY" } : { ok: true, rows });
    const tenant = String(c.tenantId), unit = String(c.unitId);
    for (const [fnName, input] of [["convertHoldInTx", { holdId: h }], ["releaseHoldInTx", { holdId: h, reason: "x" }], ["returnSoldInTx", { departureId: dep, qty: 1 }], ["moveSoldInTx", { fromDepartureId: dep, toDepartureId: dep2, qty: 1 }],
      ["reserveSeatsInTx", { departureId: dep, qty: 1 }], ["unreserveSeatsInTx", { departureId: dep, qty: 1 }], ["holdFromReservedInTx", { departureId: dep, qty: 1 }], ["unholdToReservedInTx", { departureId: dep, qty: 1 }],
      ["rekeyHoldsToContactInTx", { holdIds: [h], contactKey: "contact:x1234567" }]] as const) {
      add(fnName, await inTx(tenant.startsWith("trips-hunt4") ? tenant : sh.tenantId, unit, (tx) => fnOf(T, fnName)(tx, c, input)));
    }
    add("reserveInTx", await inTx(tenant, unit, (tx) => fnOf(T, "reserveInTx")(tx, c, [{ layer: "1a", table: "TripDeparture", id: dep, sortKey: dep }], { op: "HOLD", qtyPublic: 1, qtyAllot: 0 })));
  }
  const after = await snap();
  if (before !== after) F(`isolation: A's rows changed by foreign ctx\n before ${before}\n after  ${after}`);
  const leaks = [...results.entries()].filter(([, s]) => [...s].some((k) => k === "OK!" || k.startsWith("THROW")));
  out("isolation codes", Object.fromEntries([...results.entries()].map(([k, s]) => [k, [...s]])));
  out("isolation NOT_FOUND messages", [...msgs]);
  for (const [k, s] of leaks) F(`isolation: ${k} → ${[...s].join(",")}`);
  if (msgs.size > 1) F(`isolation: NOT_FOUND messages differ ${fmt([...msgs])}`);

  // cross-unit idempotency (same STAFF user in unit A2 replaying A's key)
  const key = ikey();
  const a = await call("placeHold", STAFF(sh), { departureId: dep, qty: 1, idempotencyKey: key });
  const a2same = await call("placeHold", STAFF(shA2), { departureId: dep, qty: 1, idempotencyKey: key });
  const depA2 = await mkDep(shA2, { capacity: 10 });
  const a2own = await call("placeHold", STAFF(shA2), { departureId: depA2, qty: 1, idempotencyKey: key });
  out("idempotency across units (same staff user, same key)", { unitA: brief(a), unitA2_withA_dep: `${brief(a2same)} ${fmt(a2same.value ?? "")}`, unitA2_ownDep: brief(a2own) });
  if (a2same.ok === true) F(`isolation: unit A2 ctx replaying A's key with A's departureId gets A's hold back ${fmt(a2same.value)} (expected NOT_FOUND)`);
  if (a2own.ok !== true) F(`isolation: same staff key in another unit refused → ${brief(a2own)} (key namespace is tenant-wide, not per unit)`);

  // input ร้าย
  const bad: [string, unknown][] = [["qty0", 0], ["qty-1", -1], ["qty2^31", 2147483648], ["qtyNaN", Number.NaN], ["qty1.5", 1.5], ["qtyStr", "3"], ["qty51", 51], ["qtyInf", Number.POSITIVE_INFINITY]];
  const adv: Record<string, string> = {};
  for (const [n, v] of bad) adv[`placeHold ${n}`] = brief(await call("placeHold", STAFF(sh), { departureId: dep, qty: v, idempotencyKey: ikey() }));
  for (const [n, v] of bad) adv[`returnSold ${n}`] = brief(await call("returnSold", STAFF(sh), { departureId: dep, qty: v }));
  for (const [n, v] of bad) adv[`reserveSeatsInTx ${n}`] = brief(await inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "reserveSeatsInTx")(tx, SYS(sh), { departureId: dep, qty: v })));
  adv["key unicode"] = brief(await call("placeHold", STAFF(sh), { departureId: dep, qty: 1, idempotencyKey: "ทดสอบคีย์ยาวพอ" }));
  adv["key 10KB"] = brief(await call("placeHold", STAFF(sh), { departureId: dep, qty: 1, idempotencyKey: "a".repeat(10_240) }));
  adv["key null-byte"] = brief(await call("placeHold", STAFF(sh), { departureId: dep, qty: 1, idempotencyKey: "abcdefgh\u0000" }));
  adv["departureId 10KB"] = brief(await call("placeHold", STAFF(sh), { departureId: "d".repeat(10_240), qty: 1, idempotencyKey: ikey() }));
  adv["departureId sql"] = brief(await call("placeHold", STAFF(sh), { departureId: "x' OR '1'='1", qty: 1, idempotencyKey: ikey() }));
  adv["capKey contact: (PUBLIC)"] = brief(await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: "contact:abcdefgh" }));
  adv["capKey basket short"] = brief(await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: "basket:abc" }));
  adv["capKey basket 129"] = brief(await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: `basket:${"a".repeat(129)}` }));
  adv["capKey basket unicode"] = brief(await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: "basket:ตะกร้าของฉันนะ" }));
  adv["capKey missing PUBLIC"] = brief(await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey() }));
  adv["extra field"] = brief(await call("placeHold", STAFF(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), held: 0 }));
  adv["PUBLIC purpose SHOP_CONFIRM"] = brief(await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: basket(), purpose: "SHOP_CONFIRM" }));
  adv["STAFF purpose WAITLIST_OFFER"] = brief(await call("placeHold", STAFF(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), purpose: "WAITLIST_OFFER" }));
  adv["PUBLIC channel COUNTER"] = brief(await call("placeHold", PUB(sh, NOW0, "COUNTER"), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: basket() }));
  adv["ctx now Invalid Date"] = brief(await call("placeHold", { ...STAFF(sh), now: new Date(Number.NaN) }, { departureId: dep, qty: 1, idempotencyKey: ikey() }));
  adv["ctx AGENT"] = brief(await call("placeHold", { ...STAFF(sh), actor: { kind: "AGENT", agentAccountId: "a", agentUserId: "b" } }, { departureId: dep, qty: 1, idempotencyKey: ikey() }));
  adv["release reason empty"] = brief(await call("releaseHold", STAFF(sh), { holdId: h2, reason: "  " }));
  adv["release reason 201"] = brief(await call("releaseHold", STAFF(sh), { holdId: h2, reason: "r".repeat(201) }));
  adv["move same dep"] = brief(await call("moveSold", STAFF(sh), { fromDepartureId: dep, toDepartureId: dep, qty: 1 }));
  adv["rekey 51 ids"] = brief(await inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "rekeyHoldsToContactInTx")(tx, PUB(sh), { holdIds: Array.from({ length: 51 }, () => h), contactKey: "contact:x" })));
  adv["rekey contactKey 10KB"] = brief(await inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "rekeyHoldsToContactInTx")(tx, PUB(sh), { holdIds: [h], contactKey: "c".repeat(10_240) })));
  adv["acquireHoldCap add 2^31"] = brief(await inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "acquireHoldCapInTx")(tx, PUB(sh), { capKey: "basket:abcdefgh", mode: "HOLDS", add: 2147483648, limit: 1 })));
  adv["listAvailability 63 days"] = brief(await call("listAvailability", STAFF(sh), { productId: sh.prodId, from: "2027-03-01", to: "2027-05-02" }));
  adv["listAvailability from>to"] = brief(await call("listAvailability", STAFF(sh), { productId: sh.prodId, from: "2027-03-10", to: "2027-03-01" }));
  adv["listAvailability bad date"] = brief(await call("listAvailability", STAFF(sh), { productId: sh.prodId, from: "2027-02-30", to: "2027-03-01" }));
  adv["placeHold null input"] = brief(await call("placeHold", STAFF(sh), null));
  adv["placeHold null ctx"] = brief(await call("placeHold", null, { departureId: dep, qty: 1, idempotencyKey: ikey() }));
  adv["capacityRowsOf null line"] = fmt(await fnOf(T, "capacityRowsOf")(STAFF(sh), null).catch((e: unknown) => `THROW ${String(e)}`));
  adv["onWaitlistTrigger garbage"] = fmt(await fnOf(T, "onWaitlistTrigger")({ tenantId: 5, payload: "x" }).then(() => "ok").catch((e: unknown) => `THROW ${String(e)}`));
  adv["onWaitlistTrigger foreign dep"] = fmt(await fnOf(T, "onWaitlistTrigger")({ tenantId: shB.tenantId, payload: { departureId: dep } }).then(() => "ok").catch((e: unknown) => `THROW ${String(e)}`));
  out("adversarial", adv);
  for (const [k, v] of Object.entries(adv)) {
    if (v.startsWith("THROW") || v.includes("THROW")) F(`adversarial ${k}: ${v}`);
    if (v === "ok" && !k.startsWith("capacityRowsOf") && !k.startsWith("onWaitlistTrigger") && k !== "extra field") F(`adversarial ${k}: accepted`);
  }
  if (adv["extra field"] === "ok") F("adversarial extra field accepted (strictObject expected)");
  for (const v of (await invCheck([dep, dep2])).viol) F(`isolation invariant ${v}`);
}

try {
  const sh = await mkShop("ra");
  const uA2 = await mkUnit(sh.tenantId, "ra2");
  const pA2 = await mkProd(sh.tenantId, uA2);
  const shA2: Shop = { ...sh, unitId: uA2, prodId: pA2.id, optId: pA2.opt };
  const shB = await mkShop("rb");
  await races(sh);
  await holdCap(sh, shA2, shB);
  await isolation(sh, shA2, shB);
} catch (e) {
  F(`probe crashed: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  try { await cleanup(); } catch (e) { console.log("cleanup err", e); }
  console.log(`\n=== races findings ${findings.length} ===`);
  for (const f of [...new Set(findings)]) console.log(" -", f);
  await shutdown();
}

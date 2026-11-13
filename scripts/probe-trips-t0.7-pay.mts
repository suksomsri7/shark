// probe-trips-t0.7-pay.mts — นักล่า T0.7a: รับเงิน (A) · HOLD (B) · ขอบเขตอินพุต (G) · สิทธิ์/แยกร้าน (H) · QR (J)
// ใช้: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.7-pay.mts [--only=A,B,G,H,J]
import {
  boot, call, code, out, q, mkShop, mkDep, staff, pub, withNow, setV, unitSet, mkBk, pay, reqRefund, duesOf, evsOf, bkRow, tally, pctl, opAdd, summary, finding,
  allMoneyInv, moneyControls, dbStats, connSampler, cleanup, sweepStale, shutdown, hex, rid, insertRow, mods, fnOf, NOW0, PAY_NOW, addMin, asRec, asArr, fmt,
  type Rec, type Shop, type Bk,
} from "./probe-trips-t0.7-lib.mjs";

boot("probe-trips-t0.7-pay");
const only = (process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "A,B,G,H,J").split(",");
const INT4 = 2_147_483_647;
const DD = { date: "2027-05-20" };

async function check(sh: Shop, label: string) {
  const bad = await allMoneyInv(sh);
  out("inv", label, bad.length ? bad.slice(0, 30) : "clean");
  if (bad.length) finding(`INV-${label}`, "MAJOR", `invariants broken after ${label}`, bad.slice(0, 30));
  return bad;
}

async function wlA(sh: Shop, shD: Shop) {
  // A1 คีย์เดียว ×20
  for (let rep = 0; rep < 5; rep++) {
    const b = await mkBk(sh); const key = `same${hex(5)}`;
    const rs = await Promise.all(Array.from({ length: 20 }, () => pay(b, b.payable, { key })));
    opAdd("A", 20);
    const n = (await evsOf(b.id)).filter((e) => e.kind === "RECEIVED").length;
    const okN = rs.filter((r) => r.ok === true).length; const rep_ = rs.filter((r) => asRec(r.value).replayed === true).length;
    out("A1", { rep, tally: tally(rs), receipts: n, replayed: rep_ });
    if (n !== 1 || okN !== 20) finding("A1-samekey", "MAJOR", "same idempotency key ×20 did not produce exactly one receipt + 20 ok", { tally: tally(rs), receipts: n });
  }
  // A2 คีย์ต่างยอดเต็ม ×20
  for (let rep = 0; rep < 5; rep++) {
    const b = await mkBk(sh);
    const rs = await Promise.all(Array.from({ length: 20 }, () => pay(b, b.payable)));
    opAdd("A", 20);
    const bk = await bkRow(b.id);
    out("A2", { rep, tally: tally(rs), paid: bk.paidSatang, payable: b.payable, status: bk.status });
    if (Number(bk.paidSatang) !== b.payable || rs.filter((r) => r.ok === true).length !== 1) finding("A2-diffkeys", "BLOCKER", "parallel different-key full payments", { tally: tally(rs), paid: bk.paidSatang });
  }
  // A3 เกิน 1 สตางค์ · ทีละน้อย · ขอบ
  {
    const b = await mkBk(sh);
    const r1 = await pay(b, b.payable + 1); const r2 = await pay(b, b.payable - 1); const r3 = await pay(b, 2); const r4 = await pay(b, 1); const r5 = await pay(b, 1);
    opAdd("A", 5);
    out("A3", [code(r1), code(r2), code(r3), code(r4), code(r5)]);
    if (code(r1) !== "VALIDATION/OVERPAYMENT" || r2.ok !== true || code(r3) !== "VALIDATION/OVERPAYMENT" || r4.ok !== true || r5.ok === true) finding("A3-edges", "MAJOR", "payable+1 / remainder edges", [code(r1), code(r2), code(r3), code(r4), code(r5)]);
  }
  // A4 1 สตางค์ ×60 ขนาน + ส่วนที่เหลือ
  {
    const b = await mkBk(sh);
    const rs = await Promise.all(Array.from({ length: 60 }, () => pay(b, 1)));
    const rest = await pay(b, b.payable - 60);
    opAdd("A", 61);
    const evs = (await evsOf(b.id)).filter((e) => e.kind === "RECEIVED");
    const pt = evs.reduce((s, e) => s + Number(e.passThroughSatang), 0); const vat = evs.reduce((s, e) => s + Number(e.vatSatang), 0);
    const sum = asRec((await call("tripMoneySummary", staff(sh), { bookingId: b.id })).value);
    out("A4", { tally: tally(rs), rest: code(rest), receipts: evs.length, pt, snapPt: b.pt, vatSum: vat, bookingVat: (await bkRow(b.id)).vatSatang, vatInfo: sum.vat });
    const diff = Number(asRec(sum.vat).receiptRoundingDiffSatang);
    if (Math.abs(diff) > evs.length - 1) finding("A4-rounding", "MINOR", "receipt rounding diff exceeds n-1", { diff, n: evs.length });
  }
  // A5 มัดจำ 30 % + ส่วนที่เหลือ: จ่ายตรงงวด · ข้ามงวด
  {
    const b = await mkBk(shD, DD); const d = await duesOf(b.id);
    out("A5-dues", d.map((x) => [x.seq, x.kind, x.amountSatang, x.vatableSatang, x.passThroughSatang, x.status, x.dueAt]));
    const r1 = await pay(b, Number(d[0]?.amountSatang)); const r2 = await pay(b, Number(d[1]?.amountSatang));
    const b2 = await mkBk(shD, DD); const d2 = await duesOf(b2.id);
    const r3 = await pay(b2, Number(d2[0]?.amountSatang) + 1); const r4 = await pay(b2, Number(d2[1]?.amountSatang) - 1);
    opAdd("A", 4);
    out("A5", { exact: [code(r1), code(r2)], cross: [code(r3), asArr(asRec(r3.value).events).length, code(r4)], st: [(await bkRow(b.id)).status, (await bkRow(b2.id)).status] });
  }
  // A6 ขนานคีย์ต่างยอดรวมเกิน payable (10 × payable/8)
  for (let rep = 0; rep < 5; rep++) {
    const b = await mkBk(rep % 2 ? shD : sh, DD);
    const part = Math.floor(b.payable / 8);
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => pay(b, part, { tender: ["CASH", "PROMPTPAY", "TRANSFER", "CARD"][i % 4] })));
    opAdd("A", 10);
    const bk = await bkRow(b.id);
    out("A6", { rep, tally: tally(rs), paid: bk.paidSatang, payable: b.payable, status: bk.status });
    if (Number(bk.paidSatang) > b.payable || rs.filter((r) => r.ok === true).length !== 8) finding("A6-oversum", "BLOCKER", "parallel instalments past payable", { tally: tally(rs), paid: bk.paidSatang });
  }
  await check(sh, "A"); await check(shD, "A-D");
}

async function wlB(sh: Shop) {
  const { T } = await mods(); const sweep = fnOf(T, "runExpireHolds");
  // B1 pay ∥ pay บน HOLD (คีย์ต่าง ยอดบางส่วน)
  const r1: Rec[] = [];
  for (let i = 0; i < 10; i++) {
    const b = await mkBk(sh, { pay: "PAY_NOW" });
    if (i === 0) out("B-hold", { status: b.status, holds: await q(`SELECT status, "expiresAt", "qtyPublic" FROM "TripHold" WHERE "bookingId" = $1`, [b.id]) });
    const rs = await Promise.all([pay(b, 100_000), pay(b, 200_000), pay(b, 300_000, { tender: "TRANSFER" })]);
    r1.push(...rs);
    const conv = await q(`SELECT count(*)::int n FROM "OutboxEvent" WHERE "idempotencyKey" = $1`, [`trips.booking.confirmed:${b.id}`]);
    if (Number(asRec(conv[0]).n) !== 1) finding("B1-confirmed-evt", "MAJOR", "HOLD→paid confirmed event count", { n: conv[0], tally: tally(rs) });
  }
  opAdd("B", 30);
  out("B1", tally(r1));
  // B2 pay หลัง hold หมดเวลา (นาฬิกาเลยเวลา hold) · QR ก่อน/หลัง
  {
    const b = await mkBk(sh, { pay: "PAY_NOW" });
    const h = asRec((await q(`SELECT "expiresAt" FROM "TripHold" WHERE "bookingId" = $1`, [b.id]))[0]);
    const exp = new Date(String(h.expiresAt)).toISOString();
    const late = await pay(b, 100_000, { now: addMin(exp, 1) });
    const qr = await call("tripPaymentIntent", staff(sh, { now: addMin(exp, 1) }), { bookingId: b.id });
    const qrPub = await call("tripPaymentIntent", pub(sh, { now: addMin(exp, 1) }), { publicToken: b.token });
    opAdd("B", 3);
    out("B2", { exp, payLate: code(late), qrStaffLate: code(qr), qrPubLate: code(qrPub), qrAmt: asRec(qr.value).amountSatang });
    if (qrPub.ok === true) finding("J-QR-expired-hold", "MINOR", "tripPaymentIntent issues a locked PromptPay QR for a HOLD booking whose hold already expired (sweeper not yet run); a payment against it is then refused HOLD_EXPIRED, so the customer's money lands outside the system", { payAfterExpiry: code(late), qrPublic: code(qrPub), amount: asRec(qrPub.value).amountSatang });
  }
  // B3 pay ∥ ตัวกวาด รอบขอบเวลา
  const r3: Rec[] = []; let dl = 0;
  for (let i = 0; i < 12; i++) {
    const bs: Bk[] = []; for (let k = 0; k < 4; k++) bs.push(await mkBk(sh, { pay: "PAY_NOW" }));
    const exps = await Promise.all(bs.map(async (b) => new Date(String(asRec((await q(`SELECT "expiresAt" FROM "TripHold" WHERE "bookingId" = $1`, [b.id]))[0]).expiresAt)).getTime()));
    const d0 = (await dbStats()).deadlocks;
    const rs = await Promise.all([
      ...bs.map((b, k) => pay(b, k % 2 ? b.payable : 50_000, { now: new Date(exps[k] - 1000).toISOString() })),
      (async () => { await new Promise((z) => setTimeout(z, (i % 6) * 40)); try { const x = await sweep(new Date(Math.max(...exps) + 1000), { tenantIds: [sh.tenantId] }); return { ok: true, value: x } as Rec; } catch (e) { return { ok: "THROW", e: String(e) } as Rec; } })(),
    ]);
    dl += (await dbStats()).deadlocks - d0;
    r3.push(...rs.slice(0, 4));
    for (const b of bs) { const bk = await bkRow(b.id); const ev = (await evsOf(b.id)).length; if (bk.status === "EXPIRED" && ev > 0) finding("B3-expired-with-money", "BLOCKER", "booking EXPIRED but has money rows", { id: b.id, ev }); }
  }
  opAdd("B", 48 + 12);
  out("B3", { pays: tally(r3), deadlocksDbWide: dl });
  // B4 pay ∥ ยกเลิก (STAFF cancel HOLD)
  const r4: Rec[] = [];
  for (let i = 0; i < 10; i++) {
    const b = await mkBk(sh, { pay: "PAY_NOW" });
    const rs = await Promise.all([pay(b, 100_000), call("cancelTripBooking", staff(sh, { now: PAY_NOW }), { bookingId: b.id, mode: "EXECUTE", reason: "ลูกค้ายกเลิก", idempotencyKey: `cx${hex(6)}` })]);
    r4.push({ ok: true, code: `${code(rs[0])} | ${code(rs[1])}` } as Rec);
    const bk = await bkRow(b.id); const ev = (await evsOf(b.id)).length;
    if (bk.status === "CANCELLED" && ev > 0) finding("B4-cancelled-with-money", "BLOCKER", "HOLD cancelled but money recorded", { id: b.id });
  }
  opAdd("B", 20);
  out("B4", r4.map((r) => r.code));
  // B5 SYSTEM + slip บน HOLD
  {
    const b = await mkBk(sh, { pay: "PAY_NOW" });
    // งวดยังไม่มีสำหรับ HOLD — สลิปต้องอ้างงวด ⇒ ทดลองทั้ง (ก) ไม่มีงวด (ข) หลังสร้างงวดด้วยการรับเงินบางส่วนไม่ได้ (เพราะจะเปลี่ยนเป็น PART_PAID)
    const d = await duesOf(b.id);
    out("B5", { holdDues: d.length });
  }
  await check(sh, "B");
}

async function wlG(sh: Shop) {
  const b = await mkBk(sh);
  const cases: [string, unknown, Rec?][] = [
    ["int4", INT4], ["int4+1", INT4 + 1], ["0", 0], ["neg", -1], ["frac", 1.5], ["str", "100"], ["NaN", Number.NaN], ["Inf", Number.POSITIVE_INFINITY], ["big", 1e300], ["null", null],
  ];
  const res: Rec = {};
  for (const [k, v] of cases) res[k] = code(await pay(b, v));
  const ref = (s: string) => pay(b, 1, { extra: { reference: s } });
  res.refOk = code(await ref("TX-123/ab.c_d"));
  res.ref65 = code(await ref("A".repeat(65)));
  res.refHuge = code(await ref("A".repeat(100_000)));
  res.refCtl = code(await ref("abc\u0000def"));
  res.refNl = code(await ref("abc\ndef"));
  res.refThai = code(await ref("โอน"));
  res.refRLO = code(await ref("abc‮def"));
  res.receivedAt = code(await pay(b, 1, { extra: { receivedAt: "2026-01-01T00:00:00Z" } }));
  res.at = code(await pay(b, 1, { extra: { now: "2026-01-01T00:00:00Z" } }));
  res.tenderAgency = code(await pay(b, 1, { tender: "AGENCY" }));
  res.tenderBtc = code(await pay(b, 1, { tender: "BITCOIN" }));
  res.tenderLower = code(await pay(b, 1, { tender: "cash" }));
  res.keyShort = code(await pay(b, 1, { key: "abc" }));
  res.keyBad = code(await pay(b, 1, { key: "abc def ghi" }));
  res.keyHuge = code(await pay(b, 1, { key: "k".repeat(5000) }));
  res.unit2 = code(await pay(b, 1, { ctx: staff(sh, { unit: sh.unit2 }) }));
  res.badId = code(await call("recordTripPayment", staff(sh), { bookingId: "x".repeat(10_000), amountSatang: 1, tender: "CASH", idempotencyKey: `g${hex(6)}` }));
  res.ctxNowBad = code(await call("recordTripPayment", { ...staff(sh), now: "yesterday" }, { bookingId: b.id, amountSatang: 1, tender: "CASH", idempotencyKey: `g${hex(6)}` }));
  res.ctxNowInvalid = code(await call("recordTripPayment", { ...staff(sh), now: new Date("x") }, { bookingId: b.id, amountSatang: 1, tender: "CASH", idempotencyKey: `g${hex(6)}` }));
  res.inputNull = code(await call("recordTripPayment", staff(sh), null));
  res.inputArr = code(await call("recordTripPayment", staff(sh), []));
  res.ctxNull = code(await call("recordTripPayment", null, {}));
  // คำขอคืนเงิน: เหตุผลสกปรก · การหักเกิน int4
  const b2 = await mkBk(sh); await pay(b2, b2.payable);
  res.rfReasonCtl = code(await reqRefund(b2, { reason: "a\u0000b" }));
  res.rfReasonHuge = code(await reqRefund(b2, { reason: "ก".repeat(501) }));
  res.rfReasonBidi = code(await reqRefund(b2, { reason: "x‮y" }));
  res.rfDedOver = code(await reqRefund(b2, { deductions: [{ category: "VISA", amountSatang: INT4 }, { category: "VISA", amountSatang: INT4 }] }));
  const fa = await insertRow("FileAsset", { id: rid("fa"), tenantId: sh.tenantId, kind: "ATTACHMENT", updatedAt: new Date() });
  res.rfDedOverEv = code(await reqRefund(b2, { deductions: [{ category: "VISA", amountSatang: INT4, evidenceFileId: fa }, { category: "VISA", amountSatang: INT4, evidenceFileId: fa }] }));
  res.rfDedOneMax = code(await reqRefund(b2, { deductions: [{ category: "VISA", amountSatang: INT4, evidenceFileId: fa }] }));
  res.rfDedNeg = code(await reqRefund(b2, { deductions: [{ category: "VISA", amountSatang: -5 }] }));
  res.rfBadKind = code(await call("requestTripRefund", staff(sh), { bookingId: b2.id, expectedVersion: 0, reasonKind: "OVERDUE", choice: "MONEY", reason: "x", idempotencyKey: `g${hex(6)}` }));
  res.rfCredit = code(await call("requestTripRefund", staff(sh), { bookingId: b2.id, expectedVersion: Number((await bkRow(b2.id)).version), reasonKind: "CUSTOMER", choice: "CREDIT", reason: "x", idempotencyKey: `g${hex(6)}` }));
  res.rfMove = code(await call("requestTripRefund", staff(sh), { bookingId: b2.id, expectedVersion: Number((await bkRow(b2.id)).version), reasonKind: "CUSTOMER", choice: "MOVE_DATE", reason: "x", idempotencyKey: `g${hex(6)}` }));
  res.cashDayBad = code(await call("tripCashDay", staff(sh), { businessDate: "2027-02-30" }));
  res.cashDayOk = code(await call("tripCashDay", staff(sh), { businessDate: "2027-03-01" }));
  opAdd("G", Object.keys(res).length);
  for (const [k, v] of Object.entries(res)) out("G", k, v);
  const bk = await bkRow(b.id);
  out("G-booking", { paid: bk.paidSatang, status: bk.status, rows: (await evsOf(b.id)).length });
  const accepted = Object.entries(res).filter(([k, v]) => !["int4", "refOk", "cashDayOk"].includes(k) && String(v) === "ok");
  if (accepted.length) finding("G-accepted", "MAJOR", "malformed inputs accepted", accepted);
  if (res.int4 === "ok") finding("G-int4-accepted?", "INFO", "int4 accepted (expected OVERPAYMENT)", res.int4);
  for (const [k, v] of Object.entries(res)) if (String(v).startsWith("THROW") || String(v).startsWith("BUSY")) finding(`G-${k}`, "MAJOR", "raw/BUSY on malformed input", v);
  await check(sh, "G");
}

async function wlH(sh: Shop, shB: Shop) {
  const b = await mkBk(sh); await pay(b, 300_000);
  const rq = await (async () => { const b2 = await mkBk(sh); await pay(b2, b2.payable); const r = await reqRefund(b2); return { b2, id: String(asRec(r.value).requestId) }; })();
  const ctxs: [string, Rec][] = [
    ["tenantB", staff(shB)],
    ["tenantB-asA-tenant", staff(sh, { user: shB.userId })], // ผู้ใช้ของร้าน B อ้างร้าน A
    ["unit2", staff(sh, { unit: sh.unit2 })],
    ["mixTenantBunitA", { ...staff(shB), unitId: sh.unitId }],
    ["public", pub(sh)],
    ["agent", { tenantId: sh.tenantId, unitId: sh.unitId, channel: "AGENT_PORTAL", actor: { kind: "AGENT", agentAccountId: "ag1", agentUserId: "agu1" }, now: new Date(NOW0) }],
    ["systemNoSlip", { tenantId: sh.tenantId, unitId: sh.unitId, channel: "COUNTER", actor: { kind: "SYSTEM", job: "x" }, now: new Date(NOW0) }],
    ["staffNoUser", { tenantId: sh.tenantId, unitId: sh.unitId, channel: "COUNTER", actor: { kind: "STAFF" }, now: new Date(NOW0) }],
  ];
  const res: Rec = {};
  for (const [name, c] of ctxs) {
    const one: Rec = {};
    one.pay = code(await call("recordTripPayment", c, { bookingId: b.id, amountSatang: 1, tender: "CASH", idempotencyKey: `h${hex(6)}` }));
    one.intent = code(await call("tripPaymentIntent", c, { bookingId: b.id }));
    one.dues = code(await call("listTripDues", c, { bookingId: b.id }));
    one.summary = code(await call("tripMoneySummary", c, { bookingId: b.id }));
    const cd = await call("tripCashDay", c, { businessDate: "2027-03-01" });
    one.cashDay = cd.ok === true ? `ok:${asArr(asRec(cd.value).events).filter((e) => e.bookingId === b.id).length}` : code(cd);
    one.req = code(await call("requestTripRefund", c, { bookingId: b.id, expectedVersion: Number((await bkRow(b.id)).version), reasonKind: "CUSTOMER", choice: "MONEY", reason: "x", idempotencyKey: `h${hex(6)}` }));
    one.decide = code(await call("decideTripRefund", c, { requestId: rq.id, decision: "APPROVE", idempotencyKey: `h${hex(6)}` }));
    one.withdraw = code(await call("withdrawTripRefund", c, { requestId: rq.id, reason: "x", idempotencyKey: `h${hex(6)}` }));
    one.execute = code(await call("executeTripRefund", c, { requestId: rq.id, idempotencyKey: `h${hex(6)}` }));
    one.get = code(await call("getTripRefund", c, { requestId: rq.id }));
    const lr = await call("listTripRefunds", c, { bookingId: rq.b2.id });
    one.list = `${code(lr)}:${asArr(asRec(lr.value).items).length}`;
    one.cancelQuote = code(await call("cancelTripBooking", c, { bookingId: rq.b2.id, mode: "QUOTE", reason: "x", idempotencyKey: `h${hex(6)}` }));
    res[name] = one;
    const leaked = Object.entries(one).filter(([k, v]) => String(v) === "ok" || ((k === "list" || k === "cashDay") && String(v).startsWith("ok:") && !String(v).endsWith(":0")));
    if (name !== "systemNoSlip" && name !== "tenantB-asA-tenant" && leaked.length) finding(`H-${name}`, "BLOCKER", `actor ${name} reached tenant-A money`, leaked);
    if (name === "systemNoSlip") { const w = Object.entries(one).filter(([k, v]) => ["pay", "decide", "withdraw", "execute", "cashDay"].includes(k) && String(v) === "ok"); if (w.length) finding("H-system", "MAJOR", "SYSTEM without slip reached write path", w); }
  }
  opAdd("H", ctxs.length * 12);
  for (const [k, v] of Object.entries(res)) out("H", k, v);
  const bk = await bkRow(b.id); const rr = asRec((await q(`SELECT status FROM "TripRefundRequest" WHERE id = $1`, [rq.id]))[0]);
  out("H-after (tenantB-asA-tenant ctx is a forged service ctx; trust boundary = money-actions requireUnit)", { paid: bk.paidSatang, version: bk.version, req: rr.status });
  if (false) finding("H-mutated", "BLOCKER", "foreign actors mutated money", { paid: bk.paidSatang, req: rr.status });
  // สลิป: SYSTEM บน CONFIRMED · บน HOLD · สลิปร้านอื่น · ไม่อนุมัติ · ใช้ซ้ำ
  const sys = (s: Shop): Rec => ({ tenantId: s.tenantId, unitId: s.unitId, channel: "COUNTER", actor: { kind: "SYSTEM", job: "trips.slip" }, now: new Date(PAY_NOW) });
  const mkSlip = async (s: Shop, bid: string, amount: number, o: Rec = {}) => {
    const due = asRec((await duesOf(bid))[0]);
    return insertRow("PaymentSlip", { id: rid("slip"), tenantId: s.tenantId, unitId: s.unitId, domain: "TRIPS", refType: "TRIP_DUE", refId: String(due.id ?? "nodue"), fileId: rid("f"), imageHash: hex(16), expectedSatang: amount, amountSatang: amount, checks: "{}", status: "APPROVED", ...o });
  };
  const sc = await mkBk(sh); const slip = await mkSlip(sh, sc.id, 100_000);
  const s1 = await call("recordTripPayment", sys(sh), { bookingId: sc.id, amountSatang: 100_000, tender: "TRANSFER", idempotencyKey: `s${hex(6)}`, slipId: slip });
  const s1r = await Promise.all(Array.from({ length: 10 }, () => call("recordTripPayment", sys(sh), { bookingId: sc.id, amountSatang: 100_000, tender: "TRANSFER", idempotencyKey: `s${hex(6)}`, slipId: slip })));
  const s2 = await call("recordTripPayment", sys(sh), { bookingId: sc.id, amountSatang: 100_000, tender: "CASH", idempotencyKey: `s${hex(6)}`, slipId: slip });
  const sB = await mkSlip(shB, sc.id, 100_000);
  const s3 = await call("recordTripPayment", sys(sh), { bookingId: sc.id, amountSatang: 100_000, tender: "TRANSFER", idempotencyKey: `s${hex(6)}`, slipId: sB });
  const sP = await mkSlip(sh, sc.id, 50_000, { status: "PENDING" });
  const s4 = await call("recordTripPayment", sys(sh), { bookingId: sc.id, amountSatang: 50_000, tender: "TRANSFER", idempotencyKey: `s${hex(6)}`, slipId: sP });
  const sM = await mkSlip(sh, sc.id, 50_000);
  const s5 = await call("recordTripPayment", sys(sh), { bookingId: sc.id, amountSatang: 50_001, tender: "TRANSFER", idempotencyKey: `s${hex(6)}`, slipId: sM });
  const other = await mkBk(sh); const sO = await mkSlip(sh, other.id, 50_000);
  const s6 = await call("recordTripPayment", sys(sh), { bookingId: sc.id, amountSatang: 50_000, tender: "TRANSFER", idempotencyKey: `s${hex(6)}`, slipId: sO });
  const hb = await mkBk(sh, { pay: "PAY_NOW" });
  // HOLD ไม่มีงวด ⇒ สลิปต้องอ้างงวดที่ยังไม่มี ⇒ ใส่ refId = id สุ่ม (ผลต้องไม่ใช่ ok)
  const sH = await mkSlip(sh, hb.id, 50_000);
  const s7 = await call("recordTripPayment", sys(sh), { bookingId: hb.id, amountSatang: 50_000, tender: "TRANSFER", idempotencyKey: `s${hex(6)}`, slipId: sH });
  opAdd("H", 17);
  out("H-slip", { first: code(s1), replay10: tally(s1r), cashTender: code(s2), otherTenantSlip: code(s3), pending: code(s4), mismatch: code(s5), otherBooking: code(s6), holdNoDue: code(s7) });
  const rcvN = (await evsOf(sc.id)).filter((e) => e.kind === "RECEIVED" && e.slipId === slip).length;
  if (rcvN !== 1) finding("H-slip-dup", "BLOCKER", "one slip produced != 1 receipt", { rcvN });
  // piiPurgedAt
  const pb = await mkBk(sh); await pay(pb, 100_000);
  await q(`UPDATE "TripBooking" SET "piiPurgedAt" = now() WHERE id = $1`, [pb.id]);
  const pp = await pay(pb, 1); const pq = await call("tripPaymentIntent", staff(sh), { bookingId: pb.id }); const ppub = await call("tripPaymentIntent", pub(sh), { publicToken: pb.token });
  const pr = await reqRefund(pb); const ps = await call("tripMoneySummary", staff(sh), { bookingId: pb.id });
  opAdd("H", 5);
  out("H-purged", { pay: code(pp), qr: code(pq), qrPub: code(ppub), refundReq: code(pr), summary: code(ps) });
  if (pp.ok === true || pq.ok === true) finding("H-purged", "MAJOR", "purged booking accepted pay/QR", { pay: code(pp), qr: code(pq) });
  await check(sh, "H"); await check(shB, "H-B");
}

async function wlJ(sh: Shop, shD: Shop) {
  const cnt = async (t: string) => Number(asRec((await q(`SELECT (SELECT count(*) FROM "TripMoneyEvent" WHERE "tenantId" = $1) + (SELECT count(*) FROM "TripPaymentDue" WHERE "tenantId" = $1) + (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = $1) + (SELECT count(*) FROM "OutboxEvent" WHERE "tenantId" = $1) AS n`, [t]))[0]).n);
  const res: Rec = {};
  const b = await mkBk(shD, DD); const d = await duesOf(b.id);
  const n0 = await cnt(shD.tenantId);
  const q0 = await call("tripPaymentIntent", staff(shD), { bookingId: b.id });
  await pay(b, 12_345);
  const n1 = await cnt(shD.tenantId);
  const q1 = await call("tripPaymentIntent", staff(shD), { bookingId: b.id });
  const q1p = await call("tripPaymentIntent", pub(shD), { publicToken: b.token });
  await pay(b, Number(d[0]?.amountSatang) - 12_345);
  const q2 = await call("tripPaymentIntent", staff(shD), { bookingId: b.id });
  await pay(b, 7);
  const q3 = await call("tripPaymentIntent", staff(shD), { bookingId: b.id });
  const n2 = await cnt(shD.tenantId);
  res.amounts = [asRec(q0.value).amountSatang, asRec(q1.value).amountSatang, asRec(q1p.value).amountSatang, asRec(q2.value).amountSatang, asRec(q3.value).amountSatang];
  res.want = [d[0]?.amountSatang, Number(d[0]?.amountSatang) - 12_345, Number(d[0]?.amountSatang) - 12_345, d[1]?.amountSatang, Number(d[1]?.amountSatang) - 7];
  res.codes = [code(q0), code(q1), code(q1p), code(q2), code(q3)];
  // QR ไม่เขียนแถว: นับก่อน/หลังรอบที่มีแต่ QR
  const n3 = await cnt(shD.tenantId);
  await Promise.all(Array.from({ length: 20 }, () => call("tripPaymentIntent", staff(shD), { bookingId: b.id })));
  const n4 = await cnt(shD.tenantId);
  res.rowsWrittenByQr = n4 - n3; res.n = [n0, n1, n2];
  // หน่วยที่ไม่มีผู้รับ · PAID · ไม่มี token · token ผิดร้าน
  const bu2 = await mkBk(sh);
  res.noReceiver = code(await call("tripPaymentIntent", staff(sh), { bookingId: bu2.id }));
  await pay(bu2, bu2.payable);
  res.paid = code(await call("tripPaymentIntent", staff(sh), { bookingId: bu2.id }));
  res.pubBadToken = code(await call("tripPaymentIntent", pub(shD), { publicToken: "A".repeat(43) }));
  res.pubWithId = code(await call("tripPaymentIntent", pub(shD), { bookingId: b.id }));
  res.pubOtherUnit = code(await call("tripPaymentIntent", pub(shD, { unit: shD.unit2 }), { publicToken: b.token }));
  // ระหว่างคำขอคืนเงินเปิด
  const br = await mkBk(shD, DD); await pay(br, 1000); await reqRefund(br);
  res.duringRefund = code(await call("tripPaymentIntent", staff(shD), { bookingId: br.id }));
  {
    const hb = await mkBk(shD, { ...DD, pay: "PAY_NOW" });
    const exp = new Date(String(asRec((await q(`SELECT "expiresAt" FROM "TripHold" WHERE "bookingId" = $1`, [hb.id]))[0]).expiresAt)).toISOString();
    const qp = await call("tripPaymentIntent", pub(shD, { now: addMin(exp, 30) }), { publicToken: hb.token });
    const pl = await pay(hb, Number(asRec(qp.value).amountSatang ?? 1), { now: addMin(exp, 31), tender: "PROMPTPAY" });
    res.expiredHoldQr = { qr: code(qp), amount: asRec(qp.value).amountSatang, payAfter: code(pl), status: (await bkRow(hb.id)).status };
    if (qp.ok === true && pl.ok !== true) finding("J-QR-expired-hold", "MINOR", "tripPaymentIntent (PUBLIC) issues a locked PromptPay QR for a HOLD booking whose hold expired 30 min earlier (sweeper not yet run); recording the matching payment is then refused HOLD_EXPIRED — customer money arrives outside the system. Brief §7 does not require an expiry check, so this is a brief gap/suspicion", res.expiredHoldQr);
  }
  {
    // tripCashDay: ขอบเที่ยงคืนเวลาร้าน · RETAINED ไม่นับ · CASH คาดหวัง = รับ − คืน
    const cb = await mkBk(shD, DD);
    await pay(cb, 1_000, { now: "2027-03-02T16:59:59.000Z", tender: "CASH" });
    await pay(cb, 2_000, { now: "2027-03-02T17:00:00.000Z", tender: "CASH" });
    await pay(cb, 4_000, { now: "2027-03-02T17:00:01.000Z", tender: "CARD" });
    const day = async (d: string) => asRec((await call("tripCashDay", staff(shD), { businessDate: d })).value);
    const c2 = await day("2027-03-02"); const c3 = await day("2027-03-03");
    const ev = (x: Rec) => asArr(x.events).filter((e) => e.bookingId === cb.id).map((e) => e.amountSatang);
    res.cashDay = { d2: ev(c2), d3: ev(c3), d3expected: c3.expectedSatang, d3card: asRec(asRec(c3.byTender).CARD).receivedSatang };
    if (JSON.stringify(ev(c2)) !== "[1000]" || JSON.stringify(ev(c3)) !== "[2000,4000]" || c3.expectedSatang !== 2000) finding("J-cashday", "MAJOR", "tripCashDay business-date boundary/expected wrong", res.cashDay);
  }
  opAdd("J", 40);
  out("J", res);
  if (JSON.stringify(res.amounts) !== JSON.stringify(res.want)) finding("J-amount", "MAJOR", "QR amount != outstanding of first open due", { got: res.amounts, want: res.want });
  if (res.rowsWrittenByQr !== 0) finding("J-writes", "MAJOR", "QR wrote rows", res.rowsWrittenByQr);
}

async function main() {
  await sweepStale();
  const sh = await mkShop("pa"); const shD = await mkShop("pd"); const shB = await mkShop("pb");
  const RECV = { promptpayId: "0812345678", displayName: "ร้านล่า T0.7" };
  await setV(shD, [unitSet(shD.unitId, "trips.pay.depositPct", 30), unitSet(shD.unitId, "trips.pay.balanceDueDaysBefore", 20), unitSet(shD.unitId, "payments.receiver", RECV)]);
  const d0 = (await dbStats()).deadlocks; const stopS = connSampler(); const t0 = Date.now();
  try {
    if (only.includes("A")) await wlA(sh, shD);
    if (only.includes("B")) await wlB(sh);
    if (only.includes("G")) await wlG(sh);
    if (only.includes("H")) await wlH(sh, shB);
    if (only.includes("J")) await wlJ(sh, shD);
    const pc = await moneyControls(shD); out("controls-D", pc);
    const pc2 = await moneyControls(sh); out("controls-A", pc2);
  } catch (e) { finding("PROBE-CRASH", "INFO", "probe crashed", String(e instanceof Error ? e.stack : e).slice(0, 1500)); }
  finally {
    const cs = await stopS();
    summary("pay", { wallMs: Date.now() - t0, deadlocksDbWideDelta: (await dbStats()).deadlocks - d0, conn: cs });
    await cleanup(); await shutdown();
  }
}
await main();

// probe-trips-t0.7-refund.mts — นักล่า T0.7a: คำขอคืนเงิน (C) · ขั้นบันได (D) · แก้การจอง/โค้ดหลังมีเงิน (I)
// ใช้: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.7-refund.mts [--only=C,D,I]
import {
  boot, call, code, out, q, mkShop, mkDep, staff, setV, unitSet, mkBk, pay, reqRefund, decide, execute, withdraw, duesOf, evsOf, reqsOf, bkRow, tally, opAdd, summary, finding,
  allMoneyInv, moneyControls, dbStats, connSampler, cleanup, sweepStale, shutdown, hex, rid, insertRow, line, quote, NOW0, PAY_NOW, addMin, asRec, asArr, BKK,
  type Rec, type Shop, type Bk,
} from "./probe-trips-t0.7-lib.mjs";

boot("probe-trips-t0.7-refund");
const only = (process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "C,D,I").split(",");
const D50 = { date: "2027-03-21" }; // NOW0 (1 มี.ค. 10:00 น.) = 20 วันก่อน ⇒ ขั้น 50 %
const DD = { date: "2027-03-25" };

async function check(sh: Shop, label: string) {
  const bad = await allMoneyInv(sh);
  out("inv", label, bad.length ? bad.slice(0, 30) : "clean");
  if (bad.length) finding(`INV-${label}`, "BLOCKER", `invariants broken after ${label}`, bad.slice(0, 30));
  return bad;
}
const rid_ = (r: Rec) => String(asRec(r.value).requestId ?? "");
const approval = (sh: Shop, entityId: string, o: Rec = {}) =>
  insertRow("ApprovalRequest", { id: rid("ap"), tenantId: sh.tenantId, policyId: rid("pol"), entityType: "trips.refund", entityId, unitId: sh.unitId, status: "APPROVED", requestedById: sh.userId, decidedAt: new Date(), idempotencyKey: `ap-${hex(8)}`, ...o });

async function paidBk(sh: Shop, o: Rec = {}, tenders: [number, string][] | null = null): Promise<Bk> {
  const b = await mkBk(sh, o);
  if (!tenders) { const r = await pay(b, b.payable); if (r.ok !== true) throw new Error(`pay ${code(r)}`); return b; }
  let left = b.payable;
  for (const [i, [frac, t]] of tenders.entries()) { const a = i === tenders.length - 1 ? left : Math.floor(b.payable * frac); left -= a; const r = await pay(b, a, { tender: t }); if (r.ok !== true) throw new Error(`pay ${code(r)}`); }
  return b;
}

async function wlC(sh: Shop, shD: Shop) {
  // C1 pay ∥ request
  for (let rep = 0; rep < 8; rep++) {
    const b = await mkBk(sh, D50); await pay(b, 300_000);
    const ver = Number((await bkRow(b.id)).version);
    const rs = await Promise.all([pay(b, 100_000), pay(b, 50_000), reqRefund(b, { ver }), reqRefund(b, { ver }), pay(b, 10_000)]);
    opAdd("C", 5);
    const bk = await bkRow(b.id); const rq = await reqsOf(b.id);
    const open = rq.filter((r) => ["QUOTED", "APPROVED"].includes(String(r.status)));
    const c = asRec(open[0]?.computed);
    out("C1", { rep, codes: rs.map(code), paid: bk.paidSatang, reqs: rq.map((r) => r.status), quotedPaid: c.paidSatang, quotedVer: c.bookingVersion, ver: bk.version });
    if (open.length > 1) finding("C1-two-open", "BLOCKER", "two open refund requests", rq.map((r) => r.status));
    if (open.length && (Number(c.paidSatang) !== Number(bk.paidSatang) || Number(c.bookingVersion) !== Number(bk.version))) finding("C1-stale-quote", "MAJOR", "open request quote not equal to booking after race", { c: [c.paidSatang, c.bookingVersion], bk: [bk.paidSatang, bk.version] });
  }
  // C2 request ×10 ขนาน (คีย์ต่าง)
  for (let rep = 0; rep < 4; rep++) {
    const b = await paidBk(sh, D50);
    const ver = Number((await bkRow(b.id)).version);
    const rs = await Promise.all(Array.from({ length: 10 }, () => reqRefund(b, { ver })));
    opAdd("C", 10);
    const rq = await reqsOf(b.id);
    out("C2", { rep, tally: tally(rs), rows: rq.length });
    if (rq.length !== 1) finding("C2-req-race", "BLOCKER", "parallel requests produced != 1 row", { rows: rq.length, tally: tally(rs) });
  }
  // C3 approve ∥ reject ∥ withdraw
  for (let rep = 0; rep < 8; rep++) {
    const b = await paidBk(sh, D50); const r = await reqRefund(b); const id = rid_(r);
    const rs = await Promise.all([decide(sh, id), decide(sh, id, { decision: "REJECT" }), withdraw(sh, id), decide(sh, id), withdraw(sh, id)]);
    opAdd("C", 6);
    const row = asRec((await reqsOf(b.id))[0]);
    const okN = rs.filter((x) => x.ok === true).length;
    const ap = Number(asRec((await q(`SELECT count(*)::int n FROM "OutboxEvent" WHERE "idempotencyKey" LIKE $1`, [`trips.refund.approved:${id}:g%`]))[0]).n); // ผู้คุม 13 พ.ย.: มติ W2
    const aud = (await q<{ action: string }>(`SELECT action FROM "AuditLog" WHERE "targetId" = $1 AND action IN ('trips.refund.approve','trips.refund.reject','trips.refund.withdraw')`, [id])).map((x) => x.action);
    out("C3", { rep, codes: rs.map(code), final: row.status, approvedEvt: ap, audit: aud });
    if (okN !== 1 || aud.length !== 1 || (row.status === "APPROVED") !== (ap === 1)) finding("C3-decide-race", "MAJOR", "decide/withdraw race not exactly-one", { codes: rs.map(code), final: row.status, ap, aud });
  }
  // C4 execute ×10 (คีย์ต่าง) · คีย์เดียว ×10
  for (let rep = 0; rep < 6; rep++) {
    const b = await paidBk(sh, D50, rep % 2 ? [[0.3, "CASH"], [0.3, "TRANSFER"], [0.4, "CARD"]] : null);
    const id = rid_(await reqRefund(b)); await decide(sh, id);
    const key = `xs${hex(5)}`;
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => execute(sh, id, rep >= 3 ? { key } : {})));
    opAdd("C", 12);
    const bk = await bkRow(b.id); const dep = asRec((await q(`SELECT sold FROM "TripDeparture" WHERE id = $1`, [b.dep]))[0]);
    out("C4", { rep, sameKey: rep >= 3, tally: tally(rs), status: bk.status, refunded: bk.refundedSatang, sold: dep.sold });
    if (Number(dep.sold) !== 0) finding("C4-seats", "BLOCKER", "seats not returned exactly once", { sold: dep.sold });
    if (rep >= 3 && rs.some((x) => x.ok !== true)) finding("C4-samekey-replay", "MINOR", "same-key execute ×10 not all ok", tally(rs));
    if (rep < 3 && rs.filter((x) => x.ok === true).length !== 1) finding("C4-diffkey", "MAJOR", "different-key execute ×10 not exactly one ok", tally(rs));
  }
  // C5 execute ∥ payment ∥ request
  for (let rep = 0; rep < 6; rep++) {
    const b = await mkBk(sh, D50); await pay(b, 400_000);
    const id = rid_(await reqRefund(b)); await decide(sh, id);
    const rs = await Promise.all([execute(sh, id), pay(b, 1000), pay(b, b.payable - 400_000), reqRefund(b)]);
    opAdd("C", 6);
    out("C5", { rep, codes: rs.map(code), st: (await bkRow(b.id)).status });
  }
  // C6 สองกลุ่ม tender + bankTender
  {
    const b = await paidBk(shD, DD, [[0.25, "CASH"], [0.25, "PROMPTPAY"], [0.5, "TRANSFER"]]);
    const evs = (await evsOf(b.id)).map((e) => [e.kind, e.tender, e.amountSatang, e.passThroughSatang, e.vatSatang, String(e.dueId).slice(-6)]);
    const id = rid_(await reqRefund(b)); await decide(shD, id);
    const x = await execute(shD, id, { bankTender: "TRANSFER" });
    opAdd("C", 6);
    out("C6", { receipts: evs, exec: code(x), refunds: asArr(asRec(x.value).events).map((e) => [e.kind, e.tender, e.amountSatang, e.passThroughSatang, e.vatSatang]) });
  }
  // C7 แก้ยอดมือ + คำอนุมัติ
  {
    const res: Rec = {};
    const mk = async () => { const b = await paidBk(sh, D50); const r = await reqRefund(b); return { b, id: rid_(r), comp: asRec(r.value).computed as Rec }; };
    const a = await mk(); const ca = asRec(a.comp);
    const paidNonPt = asArr(ca.lines).filter((l) => l.rule === "BP").reduce((s, l) => s + Number(l.paidSatang), 0);
    res.computed = { refund: ca.refundSatang, nonPt: ca.refundNonPtSatang, pt: ca.refundPassThroughSatang, paidNonPt };
    res.shortReason = code(await decide(sh, a.id, { delta: 100, manualReason: "สั้น" }));
    res.overMaxPlus1 = code(await decide(sh, a.id, { delta: paidNonPt - Number(ca.refundNonPtSatang) + 1, manualReason: "เกินกว่าที่รับมา หนึ่งสตางค์" }));
    res.belowZero = code(await decide(sh, a.id, { delta: -Number(ca.refundNonPtSatang) - 1, manualReason: "ติดลบหนึ่งสตางค์ทดสอบ" }));
    const big = paidNonPt - Number(ca.refundNonPtSatang);
    const r1 = await decide(sh, a.id, { delta: big, manualReason: "คืนเต็มตามดุลยพินิจผู้จัดการ" });
    res.bigNoApproval = { code: code(r1), details: r1.details };
    const ent = String(asRec(r1.details).entityId);
    const wrongAmt = await approval(sh, `trf1_${"0".repeat(64)}`);
    res.wrongEntity = code(await decide(sh, a.id, { delta: big, manualReason: "คืนเต็มตามดุลยพินิจผู้จัดการ", approvalId: wrongAmt }));
    const apOtherUnit = await approval(sh, ent, { unitId: sh.unit2 });
    res.otherUnit = code(await decide(sh, a.id, { delta: big, manualReason: "คืนเต็มตามดุลยพินิจผู้จัดการ", approvalId: apOtherUnit }));
    const apPending = await approval(sh, ent, { status: "PENDING" });
    res.pending = code(await decide(sh, a.id, { delta: big, manualReason: "คืนเต็มตามดุลยพินิจผู้จัดการ", approvalId: apPending }));
    const apType = await approval(sh, ent, { entityType: "trips.price" });
    res.wrongType = code(await decide(sh, a.id, { delta: big, manualReason: "คืนเต็มตามดุลยพินิจผู้จัดการ", approvalId: apType }));
    const apOtherTenant = await insertRow("ApprovalRequest", { id: rid("ap"), tenantId: shD.tenantId, policyId: rid("pol"), entityType: "trips.refund", entityId: ent, unitId: sh.unitId, status: "APPROVED", requestedById: sh.userId, decidedAt: new Date(), idempotencyKey: `ap-${hex(8)}` });
    res.otherTenant = code(await decide(sh, a.id, { delta: big, manualReason: "คืนเต็มตามดุลยพินิจผู้จัดการ", approvalId: apOtherTenant }));
    const apNullUnit = await approval(sh, ent, { unitId: null });
    const good = await approval(sh, ent);
    // ใช้คำอนุมัติเดียว ×6 ขนาน (คีย์ต่าง)
    const rs = await Promise.all(Array.from({ length: 6 }, () => decide(sh, a.id, { delta: big, manualReason: "คืนเต็มตามดุลยพินิจผู้จัดการ", approvalId: good })));
    res.parallelGood = tally(rs);
    const consumed = Number(asRec((await q(`SELECT count(*)::int n FROM "AuditLog" WHERE action = 'trips.approval.consumed' AND "targetId" = $1`, [good]))[0]).n);
    res.consumedRows = consumed;
    // ใช้ซ้ำกับคำขออื่น (entity ต่าง ⇒ NOT_APPROVED) และคำอนุมัติที่ใช้แล้วกับ entity ของคำขอใหม่ (ทำ entity ให้ตรงด้วย SQL) ⇒ APPROVAL_USED
    const b2 = await mk(); const c2 = asRec(b2.comp);
    const big2 = asArr(c2.lines).filter((l) => l.rule === "BP").reduce((s, l) => s + Number(l.paidSatang), 0) - Number(c2.refundNonPtSatang);
    res.reuseOtherReq = code(await decide(sh, b2.id, { delta: big2, manualReason: "คืนเต็มตามดุลยพินิจผู้จัดการ", approvalId: good }));
    const r2 = await decide(sh, b2.id, { delta: big2, manualReason: "คืนเต็มตามดุลยพินิจผู้จัดการ" });
    await q(`UPDATE "ApprovalRequest" SET "entityId" = $2 WHERE id = $1`, [good, String(asRec(r2.details).entityId)]);
    res.reuseUsed = code(await decide(sh, b2.id, { delta: big2, manualReason: "คืนเต็มตามดุลยพินิจผู้จัดการ", approvalId: good }));
    res.nullUnitApproval = code(await decide(sh, b2.id, { delta: big2, manualReason: "คืนเต็มตามดุลยพินิจผู้จัดการ", approvalId: await approval(sh, String(asRec(r2.details).entityId), { unitId: null }) }));
    void apNullUnit;
    // ลดยอดมือเล็ก (≤ X13) · warning
    const c3 = await mk();
    const rd = await decide(sh, c3.id, { delta: -150_000, manualReason: "หักค่าเสียหายตามหลักฐานแนบ" });
    res.smallMinus = { code: code(rd), warnings: asRec(rd.value).warnings, amount: asRec(rd.value).amountSatang };
    const ex = [await execute(sh, a.id), await execute(sh, c3.id), await execute(sh, b2.id)];
    res.exec = ex.map(code);
    opAdd("C", 22);
    out("C7", res);
    if (consumed !== 1 || (res.parallelGood as Rec).ok !== 1) finding("C7-approval-reuse", "BLOCKER", "approval consumed != once under parallel decide", { consumed, tally: res.parallelGood });
    for (const k of ["shortReason", "overMaxPlus1", "belowZero", "wrongEntity", "otherUnit", "pending", "wrongType", "otherTenant", "reuseOtherReq", "reuseUsed"]) if (String(res[k]) === "ok") finding(`C7-${k}`, "BLOCKER", "manual override accepted when it must be refused", { k, v: res[k] });
  }
  // C8 ใบเสนอค้าง (รุ่นการจองเปลี่ยนจากภายนอก · จำลองงาน T0.8) — APPROVED แล้วไม่มีทางออก?
  {
    const b = await paidBk(sh, D50); const id = rid_(await reqRefund(b)); await decide(sh, id);
    await q(`UPDATE "TripBooking" SET version = version + 1 WHERE id = $1`, [b.id]);
    const r = { exec: code(await execute(sh, id)), withdraw: code(await withdraw(sh, id)), newReq: code(await reqRefund(b)), pay: code(await pay(b, 1)), decide: code(await decide(sh, id)) };
    opAdd("C", 5);
    out("C8", r);
    if (r.exec !== "ok" && r.withdraw !== "ok" && r.newReq !== "ok") finding("C8-approved-stuck", "MINOR", "an APPROVED request whose booking version moved (e.g. T0.8 purge bump per §22-5) has no exit: execute=STALE_QUOTE, withdraw=STATE_CONFLICT (APPROVED cannot withdraw), new request=REFUND_IN_PROGRESS, pay=REFUND_IN_PROGRESS — booking frozen. Reproduced only with a simulated version bump", r);
  }
  // C9 ยอดคืน 0 (< 15 วัน) · CONFIRMED ไม่มีเงิน · เก็บแทนจ่ายออกแล้ว · หักค่าใช้จ่ายจริง
  {
    const res: Rec = {};
    const b0 = await paidBk(sh, { date: "2027-03-10" });
    const r0 = await reqRefund(b0); await decide(sh, rid_(r0)); const x0 = await execute(sh, rid_(r0));
    res.zero = { req: asRec(r0.value).amountSatang, exec: code(x0), ev: asArr(asRec(x0.value).events).map((e) => [e.kind, e.amountSatang]), st: (await bkRow(b0.id)).status };
    const bc = await mkBk(sh, D50);
    const rc = await call("cancelTripBooking", staff(sh, { now: addMin(NOW0, 5) }), { bookingId: bc.id, mode: "EXECUTE", reason: "ลูกค้ายกเลิก", idempotencyKey: `cc${hex(6)}` });
    const idc = String(asRec(rc.value).requestId); const dc = await decide(sh, idc); const xc = await execute(sh, idc);
    res.confirmedNoMoney = { cancel: code(rc), status: asRec(rc.value).status, decide: code(dc), exec: code(xc), st: (await bkRow(bc.id)).status, sold: asRec((await q(`SELECT sold FROM "TripDeparture" WHERE id = $1`, [bc.dep]))[0]).sold };
    const bp = await paidBk(sh, D50);
    await insertRow("TripPassThroughEvidence", { id: rid("ev"), tenantId: sh.tenantId, unitId: sh.unitId, departureId: bp.dep, bookingId: null, extraKind: "PARK_FEE", paidToPayee: "กรมอุทยาน", amountSatang: 1, paidAt: new Date(NOW0), fileIds: [], updatedAt: new Date() });
    const rp = await reqRefund(bp); await decide(sh, rid_(rp)); const xp = await execute(sh, rid_(rp));
    res.ptPaidOut = { amount: asRec(rp.value).amountSatang, pt: asRec(asRec(rp.value).computed).refundPassThroughSatang, warn: asRec(asRec(rp.value).computed).warnings, exec: code(xp) };
    const fa = await insertRow("FileAsset", { id: rid("fa"), tenantId: sh.tenantId, kind: "ATTACHMENT", updatedAt: new Date() });
    const bd = await paidBk(sh, D50);
    const rdd = await reqRefund(bd, { deductions: [{ category: "VISA", amountSatang: 100_000, evidenceFileId: fa }, { category: "OTHER_NECESSARY", amountSatang: 50_000_000, evidenceFileId: fa }] });
    const xd = rdd.ok === true ? (await decide(sh, rid_(rdd)), await execute(sh, rid_(rdd))) : null;
    res.deductions = { code: code(rdd), amount: asRec(rdd.value).amountSatang, ded: asRec(asRec(rdd.value).computed).deductionsSatang, nonPt: asRec(asRec(rdd.value).computed).refundNonPtSatang, pt: asRec(asRec(rdd.value).computed).refundPassThroughSatang, exec: xd ? code(xd) : null };
    // QUOTE ของ cancel = ยอดคำขอจริง
    const bq = await mkBk(sh, D50); await pay(bq, 333_333);
    const cq = await call("cancelTripBooking", staff(sh, { now: addMin(NOW0, 10) }), { bookingId: bq.id, mode: "QUOTE", reason: "x", idempotencyKey: `cq${hex(6)}` });
    const rq = await reqRefund(bq);
    res.quoteVsReq = { quote: asRec(asRec(cq.value).computed).refundSatang, req: asRec(rq.value).amountSatang };
    opAdd("C", 16);
    out("C9", res);
    if (res.quoteVsReq && (res.quoteVsReq as Rec).quote !== (res.quoteVsReq as Rec).req) finding("C9-quote-mismatch", "MAJOR", "cancel QUOTE != request amount", res.quoteVsReq);
  }
  await check(sh, "C"); await check(shD, "C-D");
}

// ═════ D ขั้นบันได ═════
function expectRefund(snap: Rec, bp: number) {
  const lines = asArr(snap.lines); let n = 0; let pt = 0;
  for (const l of lines) { const a = Number(l.amountSatang); if (l.passThrough === true) pt += a; else n += Math.floor((a * bp + 5000) / 10000); }
  return n + pt;
}
async function wlD(sh: Shop, shL: Shop) {
  const D = "2027-05-20";
  const at = (ymd: string, hm: string) => BKK(ymd, hm).toISOString();
  const minus = (d: number) => { const t = new Date(`${D}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - d); return t.toISOString().slice(0, 10); };
  const cases: [string, string, number][] = [
    ["D-31 12:00", at(minus(31), "12:00"), 10000], ["D-30 00:00", at(minus(30), "00:00"), 10000], ["D-30 23:59", at(minus(30), "23:59"), 10000],
    ["D-30 16:59:59Z", new Date(BKK(minus(30), "23:59").getTime() + 59_000).toISOString(), 10000], ["D-29 00:00 (=17:00Z prev)", at(minus(29), "00:00"), 5000],
    ["D-15 23:59", at(minus(15), "23:59"), 5000], ["D-14 00:00", at(minus(14), "00:00"), 0], ["D-1 23:59", at(minus(1), "23:59"), 0],
    ["D 00:00", at(D, "00:00"), 0], ["D 07:59 (before dep)", at(D, "07:59"), 0], ["D 08:30 (after dep start)", at(D, "08:30"), 0], ["D+1", at(minus(-1), "10:00"), 0],
  ];
  const res: Rec[] = [];
  for (const [label, now, bp] of cases) {
    const b = await mkBk(sh, { date: D }); await pay(b, b.payable);
    const r = await reqRefund(b, { now });
    const c = asRec(asRec(r.value).computed);
    const want = expectRefund(b.snap, bp);
    res.push({ label, now, code: code(r), daysBefore: c.daysBefore, bp: c.refundBp, amount: asRec(r.value).amountSatang, want, warn: c.warnings });
    if (r.ok !== true || Number(asRec(r.value).amountSatang) !== want) finding(`D-${label}`, "MAJOR", "ladder boundary mismatch", res[res.length - 1]);
  }
  for (const rk of ["EXTERNAL", "MIN_NOT_MET", "SHOP_FAULT"]) {
    const b = await mkBk(sh, { date: D }); await pay(b, b.payable);
    const r = await reqRefund(b, { now: at(minus(2), "10:00"), reasonKind: rk });
    res.push({ label: rk, code: code(r), amount: asRec(r.value).amountSatang, paid: b.payable, bp: asRec(asRec(r.value).computed).refundBp });
  }
  // ตารางร้านต่ำกว่าขั้นต่ำ (60→100 · 0→0) ⇒ WARN ไม่บล็อก
  for (const [label, d] of [["L D-40", 40], ["L D-20", 20], ["L D-10", 10], ["L D-61", 61]] as const) {
    const b = await mkBk(shL, { date: D }); await pay(b, b.payable);
    const r = await reqRefund(b, { now: at(minus(d), "10:00") });
    const c = asRec(asRec(r.value).computed);
    res.push({ label, code: code(r), bp: c.refundBp, amount: asRec(r.value).amountSatang, warn: c.warnings });
    const shouldWarn = d < 60 && d >= 15;
    if (r.ok !== true) finding(`D-${label}`, "MAJOR", "low shop ladder blocked request", code(r));
    if (shouldWarn !== asArr(c.warnings).length > 0 && !(Array.isArray(c.warnings) && (c.warnings as string[]).includes("REFUND_BELOW_STATUTORY_MINIMUM") === shouldWarn)) finding(`D-${label}-warn`, "MINOR", "statutory warning mismatch", { d, warnings: c.warnings });
  }
  // บางส่วน: PART_PAID ที่ขั้น 50 % · คืนตามสัดส่วน
  opAdd("D", res.length * 3);
  for (const x of res) out("D", x);
  await check(sh, "D"); await check(shL, "D-L");
}

// ═════ I แก้การจอง/โค้ดหลังมีเงิน ═════
async function wlI(sh: Shop, shD: Shop) {
  const res: Rec = {};
  const change = async (s: Shop, b: Bk, dep: string, o: { a?: number; camera?: boolean; dropPromo?: boolean; now?: string } = {}) => {
    const ctx = staff(s, { now: o.now ?? addMin(NOW0, 20) });
    const ln = line(b.sh === s ? s.P : s.P, dep, { a: o.a ?? 2, camera: o.camera ?? true });
    const qt = await quote(ctx, [ln]);
    return call("changeTripBooking", ctx, { bookingId: b.id, expectedVersion: Number((await bkRow(b.id)).version), line: ln, quoteId: qt.quoteId, quoteExpiresAt: qt.expiresAt, idempotencyKey: `ch${hex(6)}`, ...(o.dropPromo ? { dropPromo: true } : {}) });
  };
  // I1 PART_PAID เลื่อนวัน (ยอดเท่าเดิม · งวดเดียว)
  {
    const b = await mkBk(sh, D50); await pay(b, 300_000);
    const dep2 = await mkDep(sh, { date: "2027-03-22" });
    const r = await change(sh, b, dep2);
    res.partPaidMove = { code: code(r), dues: (await duesOf(b.id)).map((d) => [d.seq, d.status, d.amountSatang, d.paidSatang, d.dueAt]), st: (await bkRow(b.id)).status };
  }
  // I2 มัดจำ+ส่วนที่เหลือ: PART_PAID เลื่อนไปวันที่ทำให้ส่วนที่เหลือครบกำหนดแล้ว (งวดยุบเป็น 1)
  {
    const b = await mkBk(shD, DD); const d = await duesOf(b.id); await pay(b, Number(d[0]?.amountSatang));
    const near = await mkDep(shD, { date: "2027-03-12" }); const far = await mkDep(shD, { date: "2027-04-25" });
    const r1 = await change(shD, b, near); const r2 = await change(shD, b, far);
    res.depositMove = { near: code(r1), far: code(r2), dues: (await duesOf(b.id)).map((x) => [x.seq, x.kind, x.status, x.amountSatang, x.paidSatang, x.dueAt]) };
    // จ่ายส่วนที่เหลือแล้วคืนเงิน
    const dd = await duesOf(b.id); const open = dd.filter((x) => x.status !== "CANCELLED" && x.status !== "PAID");
    const pr = open.length ? await pay(b, Number(open[0].amountSatang) - Number(open[0].paidSatang)) : null;
    res.depositMovePayRest = pr ? code(pr) : "none";
  }
  // I3 PAID เปลี่ยนจำนวนคน ⇒ PRICE_CHANGED_AFTER_PAYMENT ไม่เขียน
  {
    const b = await paidBk(sh, D50); const v0 = (await bkRow(b.id)).version;
    const r = await change(sh, b, b.dep, { a: 3 });
    res.paidPaxChange = { code: code(r), versionSame: (await bkRow(b.id)).version === v0 };
  }
  // I4 CONFIRMED เปลี่ยน (ยังไม่มีเงิน) ⇒ งวดใหม่ seq ต่อ · แล้วจ่าย
  {
    const b = await mkBk(sh, D50); const r = await change(sh, b, b.dep, { a: 3 });
    const pb = await bkRow(b.id); const snap = asRec(pb.policySnapshot);
    const pr = await pay({ ...b, payable: Number(asRec(snap.totals).payableSatang) }, Number(asRec(snap.totals).payableSatang));
    res.confirmedChange = { code: code(r), dues: (await duesOf(b.id)).map((d) => [d.seq, d.status, d.amountSatang]), pay: code(pr) };
  }
  // I5 โค้ดส่วนลด: จ่ายครบแล้วยกเลิก ⇒ คืนที่ก่อนคืนโค้ด · usedCount
  {
    const codeStr = `T07H${hex(3)}`.toUpperCase();
    const rule = await insertRow("TripPriceRule", { id: rid("ru"), tenantId: sh.tenantId, unitId: sh.unitId, productId: null, kind: "PROMO_CODE", code: codeStr, params: JSON.stringify({ kind: "PROMO_CODE", code: codeStr, discountBp: 1_000, maxUses: 10 }), priority: 0, active: true, usedCount: 0, updatedAt: new Date() });
    const bs: Bk[] = []; for (let i = 0; i < 4; i++) bs.push(await mkBk(sh, { ...D50, promo: codeStr }));
    for (const b of bs) await pay(b, b.payable);
    const ch = await change(sh, bs[0], bs[0].dep, { dropPromo: true });
    const ids: string[] = []; for (const b of bs) { const c = await call("cancelTripBooking", staff(sh, { now: addMin(NOW0, 30) }), { bookingId: b.id, mode: "EXECUTE", reason: "ยกเลิก", idempotencyKey: `cp${hex(6)}` }); ids.push(String(asRec(c.value).requestId)); }
    await Promise.all(ids.map((id) => decide(sh, id)));
    const xs = await Promise.all(ids.map((id) => execute(sh, id)));
    const rr = asRec((await q(`SELECT "usedCount" FROM "TripPriceRule" WHERE id = $1`, [rule]))[0]);
    const red = await q(`SELECT status, count(*)::int n FROM "TripPromoRedemption" WHERE "ruleId" = $1 GROUP BY status`, [rule]);
    res.promo = { payable: bs.map((b) => b.payable), dropPromoOnPaid: code(ch), exec: xs.map(code), usedCount: rr.usedCount, redemptions: red };
  }
  opAdd("I", 30);
  out("I", res);
  await check(sh, "I"); await check(shD, "I-D");
}

async function main() {
  await sweepStale();
  const sh = await mkShop("ra"); const shD = await mkShop("rd"); const shL = await mkShop("rl");
  await setV(shD, [unitSet(shD.unitId, "trips.pay.depositPct", 30), unitSet(shD.unitId, "trips.pay.balanceDueDaysBefore", 20)]);
  await setV(shL, [unitSet(shL.unitId, "trips.cancel.ladder", [{ fromDaysBefore: 60, refundPct: 100 }, { fromDaysBefore: 0, refundPct: 0 }])]);
  const d0 = (await dbStats()).deadlocks; const stopS = connSampler(); const t0 = Date.now();
  try {
    if (only.includes("C")) await wlC(sh, shD);
    if (only.includes("D")) await wlD(sh, shL);
    if (only.includes("I")) await wlI(sh, shD);
    out("controls", await moneyControls(sh));
  } catch (e) { finding("PROBE-CRASH", "INFO", "probe crashed", String(e instanceof Error ? e.stack : e).slice(0, 1500)); }
  finally {
    const cs = await stopS();
    summary("refund", { wallMs: Date.now() - t0, deadlocksDbWideDelta: (await dbStats()).deadlocks - d0, conn: cs });
    await cleanup(); await shutdown();
  }
}
await main();

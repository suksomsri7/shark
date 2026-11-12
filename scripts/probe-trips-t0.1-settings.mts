// probe-trips-t0.1-settings.mts — hunter T0.1: ทางเขียนค่าตั้งบนฐานจริง (หอ regression · ชุดปน · ค่าปรปักษ์ · ชั้นใหม่ · พร้อมกัน 20 ทาง)
import { boot, cleanup, errMsg, fmt, insertRow, mkDeparture, mkProduct, mkTenant, mkUnit, mkUser, out, q, rid, type Actor, type Rec } from "./probe-trips-t0.1-lib.mjs";
boot("probe-trips-t0.1-settings");

const S = (await import("@/lib/core/settings")) as unknown as Rec;
const AP = (await import("@/lib/modules/approval/service")) as unknown as Rec;
const EFF = (await import("@/lib/approval-effects")) as unknown as Rec;
type R = Rec & { ok?: boolean; code?: string; issues?: Rec[]; approvalId?: string | null };
const setS = (a: Actor, ctx: Rec, ch: Rec[], o: Rec = {}) => (S.setSettings as (...x: unknown[]) => Promise<R>)(a, ctx, ch, o);
const resolve = (ctx: Rec, key: string, refs: Rec) => (S.resolveSetting as (...x: unknown[]) => Promise<Rec>)(ctx, key, refs);
const refsFor = (ctx: Rec, scope: string, id: string) => (S.refsFor as (...x: unknown[]) => Promise<Rec | null>)(ctx, scope, id);
const reset = (a: Actor, ctx: Rec, t: Rec) => (S.resetSetting as (...x: unknown[]) => Promise<R>)(a, ctx, t);
const sum = (r: R) => `${r.ok === true ? "ok" : String(r.code)}${r.issues ? ` ${(r.issues as Rec[]).map((i) => `${String(i.key ?? "")}:${String(i.code)}${i.severity ? `/${String(i.severity)}` : ""}`).join(",")}` : ""}${r.approvalId ? ` approval=${r.approvalId.slice(0, 6)}` : ""}`;
const safe = async (f: () => Promise<R>): Promise<string> => { try { return sum(await f()); } catch (e) { return `THROW ${errMsg(e)}`; } };
const lastChange = async (tid: string, key: string) => (await q<Rec>(`SELECT "legalLevel","legalCode",reason,"approvalId" FROM "SettingChange" WHERE "tenantId"=$1 AND key=$2 ORDER BY at DESC LIMIT 1`, [tid, key]))[0] ?? null;
const BAD_LADDER = [{ fromDaysBefore: 30, refundPct: 100 }, { fromDaysBefore: 15, refundPct: 20 }, { fromDaysBefore: 0, refundPct: 0 }];
const BAL = "trips.pay.balanceDueDaysBefore";
const RET = "rooms.deposit.returnDays";
const THREAT = { th: "ค้างชำระจะตัดน้ำไฟทันที {tenantName}", en: "pay or else" };

try {
  const tA = await mkTenant("a"), tB = await mkTenant("b");
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };
  const uT = await mkUnit(tA, "t"), uT2 = await mkUnit(tA, "t2"), uR = await mkUnit(tA, "r", "DORM"), uB = await mkUnit(tB, "b");
  const OWN = await mkUser(tA, "own", "OWNER", ["*"], {});
  const OWNB = await mkUser(tB, "ownb", "OWNER", ["*"], {});
  const MGR = await mkUser(tA, "mgr", "MANAGER", ["*"], { "dorm.settings.edit": true, "trips.settings.edit": true, "trips.settings.money": true });
  const STF = await mkUser(tA, "stf", "STAFF", [uT], { "trips.settings.edit": true, "trips.settings.money": true });
  const p1 = await mkProduct(tA, uT), p2 = await mkProduct(tA, uT), pOther = await mkProduct(tA, uT2), pB = await mkProduct(tB, uB);
  const d1 = await mkDeparture(tA, uT, p1, 40);
  const dX = await mkDeparture(tA, uT, pOther, 41); // รอบหน่วย uT แต่สินค้าอยู่หน่วย uT2
  const dY = await mkDeparture(tA, uT, pB, 42); // รอบร้าน A อ้างสินค้าร้าน B

  // ── A. หอ regression บนฐานจริง (rooms.deposit.returnDays · STRICT ปริยาย) ──
  out("A1 STRICT ret=60 owner ack+reason", await safe(() => setS(OWN, ctxA, [{ key: RET, scope: "UNIT", scopeId: uR, value: 60, reason: "เหตุผลยาวพอสิบตัวอักษร" }], { ackLegalWarn: true })));
  out("A2 threat template owner ack+reason", await safe(() => setS(OWN, ctxA, [{ key: "rooms.msg.bill", scope: "UNIT", scopeId: uR, value: THREAT, reason: "เหตุผลยาวพอสิบตัวอักษร" }], { ackLegalWarn: true })));
  for (const u of [uR, uT]) await insertRow("SettingValue", { id: rid("sv"), tenantId: tA, key: "rooms.legal.mode", scope: "UNIT", scopeId: u, value: JSON.stringify("WARN"), effectiveFrom: new Date(0), setById: OWN.userId, updatedAt: new Date() });
  out("A3 WARN ret=60 no ack", await safe(() => setS(OWN, ctxA, [{ key: RET, scope: "UNIT", scopeId: uR, value: 60 }])));
  out("A4 WARN ret=60 ack no reason", await safe(() => setS(OWN, ctxA, [{ key: RET, scope: "UNIT", scopeId: uR, value: 60 }], { ackLegalWarn: true })));
  out("A5 WARN ret=60 ack reason 'สั้น'", await safe(() => setS(OWN, ctxA, [{ key: RET, scope: "UNIT", scopeId: uR, value: 60, reason: "สั้น" }], { ackLegalWarn: true })));
  out("A6 WARN threat still BLOCK", await safe(() => setS(OWN, ctxA, [{ key: "rooms.msg.bill", scope: "UNIT", scopeId: uR, value: THREAT, reason: "เหตุผลยาวพอสิบตัวอักษร" }], { ackLegalWarn: true })));
  out("A7 WARN MANAGER ack+reason no policy", await safe(() => setS(MGR, ctxA, [{ key: RET, scope: "UNIT", scopeId: uR, value: 60, reason: "เหตุผลยาวพอสิบตัวอักษร" }], { ackLegalWarn: true })));
  out("A8 WARN owner ack+reason", await safe(() => setS(OWN, ctxA, [{ key: RET, scope: "UNIT", scopeId: uR, value: 60, reason: "เหตุผลยาวพอสิบตัวอักษร" }], { ackLegalWarn: true })), await lastChange(tA, RET));

  // ── B. ชุดปน หอ + ทัวร์ ──
  out("B1 mix ret(WARN,no reason)+ladder(W01) ack", await safe(() => setS(OWN, ctxA, [{ key: RET, scope: "UNIT", scopeId: uT, value: 45 }, { key: "trips.cancel.ladder", scope: "UNIT", scopeId: uT, value: BAD_LADDER }], { ackLegalWarn: true })));
  out("B2 mix threat+ladder ack", await safe(() => setS(OWN, ctxA, [{ key: "rooms.msg.bill", scope: "UNIT", scopeId: uT, value: THREAT, reason: "เหตุผลยาวพอสิบตัวอักษร" }, { key: "trips.cancel.ladder", scope: "UNIT", scopeId: uT, value: BAD_LADDER }], { ackLegalWarn: true })));
  out("B3 mix ret(STRICT unit uT2)+ladder ack+reason", await safe(() => setS(OWN, ctxA, [{ key: RET, scope: "UNIT", scopeId: uT2, value: 45, reason: "เหตุผลยาวพอสิบตัวอักษร" }, { key: "trips.cancel.ladder", scope: "UNIT", scopeId: uT2, value: BAD_LADDER }], { ackLegalWarn: true })));
  // ผู้จัดการ ชุดปน มีสายอนุมัติเจ้าของ ⇒ ทัวร์ติดไปในคำขออนุมัติด้วยไหม
  await (AP.createPolicy as (...x: unknown[]) => Promise<unknown>)(ctxA, { name: "hunt legal", entityType: "settings.legal_override", steps: [{ order: 1, approverRole: "OWNER" }] });
  const rb4 = await setS(MGR, ctxA, [{ key: RET, scope: "UNIT", scopeId: uT, value: 45, reason: "เหตุผลยาวพอสิบตัวอักษร" }, { key: "trips.cancel.ladder", scope: "UNIT", scopeId: uT, value: BAD_LADDER }], { ackLegalWarn: true });
  out("B4 MGR mix ret+ladder ack (policy)", sum(rb4));
  out("B4b MGR ladder only ack", await safe(() => setS(MGR, ctxA, [{ key: "trips.cancel.ladder", scope: "PRODUCT", scopeId: p2, value: BAD_LADDER }], { ackLegalWarn: true })));
  if (rb4.approvalId) {
    const d = await (AP.decide as (...x: unknown[]) => Promise<Rec>)(OWN, ctxA, rb4.approvalId, { decision: "APPROVED" });
    const ar = (await q<Rec>(`SELECT "entityId" FROM "ApprovalRequest" WHERE id=$1`, [rb4.approvalId]))[0];
    await (EFF.applyApprovalEffect as (...x: unknown[]) => Promise<void>)({ tenantId: tA, type: "approval.request.approved", payload: { requestId: rb4.approvalId, entityType: "settings.legal_override", entityId: ar?.entityId } });
    const rows = await q<Rec>(`SELECT key,"legalLevel","legalCode",reason FROM "SettingChange" WHERE "tenantId"=$1 AND "approvalId"=$2 ORDER BY key`, [tA, rb4.approvalId]);
    out("B5 after owner approve", `decide ${fmt(d.ok)}`, rows);
  }

  // ── C. ค่าปรปักษ์ผ่าน setSettings จริง (ไม่ควรมี THROW/LEGAL_BLOCK/ok) ──
  const nasty: [string, unknown][] = [["undef", undefined], ["NaN", NaN], ["Inf", Infinity], ["neg", -1], ["1e15", 1e15], ["str", "x"], ["arr", []], ["obj", {}], ["proto", JSON.parse('{"__proto__":{"a":1}}')], ["deep", JSON.parse("[".repeat(3000) + "]".repeat(3000))], ["big", "ก".repeat(300_000)]];
  const legalKeys = ["trips.fx.rateSource", "trips.cancel.ladder", "trips.cancel.shopCancelRefund", "trips.tax.vatRate", "trips.tax.invoiceOnEachPayment", "trips.tax.invoiceForm", "trips.tax.cancelFeeVat", "trips.tax.forfeitAfterInvoice", "trips.parkFee.table", "trips.parkFee.ageBands", "trips.dive.ratio", "trips.insurance.minSum", "trips.pdpa.retention", "trips.waiver.template"];
  const cOut = new Map<string, number>();
  for (const k of legalKeys) for (const [t, v] of nasty) { const r = await safe(() => setS(OWN, ctxA, [{ key: k, scope: "UNIT", scopeId: uT, value: v }], { ackLegalWarn: true })); const kk = r.startsWith("THROW") || r.startsWith("ok") || r.includes("LEGAL_BLOCK") ? `${k}←${t}: ${r}` : r.split(" ")[0] + " " + (r.split(":")[1] ?? ""); cOut.set(kk, (cOut.get(kk) ?? 0) + 1); }
  out("C1 nasty×legalKeys", [...cOut]);
  // effectiveFrom ปรปักษ์บนคีย์ effectiveDated
  const efs: [string, unknown][] = [["far-future", "9999-12-31"], ["max-date", new Date(8.64e15)], ["min-date", new Date(-8.64e15)], ["year0", "0000-01-01"], ["bc", new Date(-62198755200000 - 86_400_000 * 366 * 5000)], ["str-garbage", "abc"], ["number", 0]];
  for (const [t, ef] of efs) out(`C2 effectiveFrom ${t}`, await safe(() => setS(OWN, ctxA, [{ key: "trips.fx.rates", scope: "UNIT", scopeId: uT, value: [{ currency: "USD", rateMicros: 35_000_000 + Math.floor(Math.random() * 1000) }], effectiveFrom: ef }])));
  try { out("C2b resolve fx.rates after", await resolve(ctxA, "trips.fx.rates", { unitId: uT })); } catch (e) { out("C2b resolve THROW", errMsg(e)); }
  // ค่าที่ schema ยอมแต่ความหมายกลับหัว (ผ่านทางจริง)
  out("C3 childAgeBand inverted", await safe(() => setS(OWN, ctxA, [{ key: "trips.pax.childAgeBand", scope: "UNIT", scopeId: uT, value: { infantBelow: 20, childFrom: 4, childTo: 2 } }])));
  out("C4 minorConsent inverted", await safe(() => setS(OWN, ctxA, [{ key: "trips.pdpa.minorConsent", scope: "UNIT", scopeId: uT, value: { parentOnlyAtOrBelow: 25, minorBelow: 5 } }])));
  out("C5 fx.rates duplicate USD", await safe(() => setS(OWN, ctxA, [{ key: "trips.fx.rates", scope: "UNIT", scopeId: uT, value: [{ currency: "USD", rateMicros: 1 }, { currency: "USD", rateMicros: 99_000_000 }] }])));
  out("C6 parkFee.table confirmedAt 2099 (no warn?)", await safe(() => setS(OWN, ctxA, [{ key: "trips.parkFee.table", scope: "UNIT", scopeId: uT, value: { confirmedAt: "2099-01-01", groups: [{ code: "G1", nameTh: "x", thaiChildSatang: 0, thaiAdultSatang: 0, foreignChildSatang: 0, foreignAdultSatang: 0 }], diveSatangPerPaxDay: 0, mooring: { upTo20Satang: 0, from21Satang: 0 } } }])));
  out("C7 waiver ZWSP (no warn?)", await safe(() => setS(OWN, ctxA, [{ key: "trips.waiver.template", scope: "UNIT", scopeId: uT, value: { th: "ผู้จัดไม่รับผิดชอบ​ทุกกรณี" } }])));

  // ── D. ชั้นใหม่ ──
  out("D1 fx.rateSource@PRODUCT", await safe(() => setS(OWN, ctxA, [{ key: "trips.fx.rateSource", scope: "PRODUCT", scopeId: p1, value: "BOT_REF" }])));
  out("D1b cabinSharing@PRODUCT", await safe(() => setS(OWN, ctxA, [{ key: "trips.pax.cabinSharing", scope: "PRODUCT", scopeId: p1, value: "ANY" }])));
  out("D1c cabinSharing@DEPARTURE", await safe(() => setS(OWN, ctxA, [{ key: "trips.pax.cabinSharing", scope: "DEPARTURE", scopeId: d1, value: "ANY" }])));
  out("D1d BAL@TENANT (chain lacks TENANT)", await safe(() => setS(OWN, ctxA, [{ key: BAL, scope: "TENANT", scopeId: tA, value: 3 }])));
  out("D2 PRODUCT missing id", await safe(() => setS(OWN, ctxA, [{ key: BAL, scope: "PRODUCT", scopeId: rid("nope"), value: 3 }])));
  out("D2b DEPARTURE id given as PRODUCT", await safe(() => setS(OWN, ctxA, [{ key: BAL, scope: "PRODUCT", scopeId: d1, value: 3 }])));
  out("D2c product B via tenant A", await safe(() => setS(OWN, ctxA, [{ key: BAL, scope: "PRODUCT", scopeId: pB, value: 3 }])));
  // รอบที่เปลี่ยนสินค้า
  await setS(OWN, ctxA, [{ key: BAL, scope: "PRODUCT", scopeId: p1, value: 40 }, { key: BAL, scope: "PRODUCT", scopeId: p2, value: 20 }]);
  const before = await refsFor(ctxA, "DEPARTURE", d1);
  const vb = await resolve(ctxA, BAL, before ?? {});
  await q(`UPDATE "TripDeparture" SET "productId"=$1 WHERE id=$2`, [p2, d1]);
  const after = await refsFor(ctxA, "DEPARTURE", d1);
  const va = await resolve(ctxA, BAL, after ?? {});
  out("D3 departure product changed", `before ${fmt(before)} → ${String(vb.value)}/${String(vb.source)}`, `after ${fmt(after)} → ${String(va.value)}/${String(va.source)}`);
  const stale = await resolve(ctxA, BAL, { unitId: uT, productId: p1, departureId: d1 });
  out("D3b caller passes stale refs {p1,d1}", `${String(stale.value)}/${String(stale.source)} (สินค้าจริงของรอบ = p2)`);
  // รอบหน่วย uT แต่สินค้าหน่วย uT2 · รอบร้าน A อ้างสินค้าร้าน B
  await setS(OWN, ctxA, [{ key: BAL, scope: "PRODUCT", scopeId: pOther, value: 33 }]);
  const rx = await refsFor(ctxA, "DEPARTURE", dX);
  out("D4 dep(uT)→product(uT2)", fmt(rx), fmt(await resolve(ctxA, BAL, rx ?? {})));
  out("D4b STAFF(uT only) writes DEPARTURE dX", await safe(() => setS(STF, ctxA, [{ key: BAL, scope: "DEPARTURE", scopeId: dX, value: 2 }])));
  out("D4c STAFF(uT only) writes PRODUCT pOther", await safe(() => setS(STF, ctxA, [{ key: BAL, scope: "PRODUCT", scopeId: pOther, value: 2 }])));
  await setS(OWNB, ctxB, [{ key: BAL, scope: "PRODUCT", scopeId: pB, value: 7 }]);
  const ry = await refsFor(ctxA, "DEPARTURE", dY);
  out("D5 dep(A)→product(B)", fmt(ry), fmt(await resolve(ctxA, BAL, ry ?? {})));
  // reset ที่ทุกชั้นเมื่อไม่มีแถว + ชั้นที่ไม่อยู่ใน chain
  for (const [sc, id] of [["DEPARTURE", d1], ["PRODUCT", p1], ["UNIT", uT], ["TENANT", tA], ["AGENT", rid("ag")], ["VESSEL", rid("v")]] as const) out(`D6 reset ${sc}`, await safe(() => reset(OWN, ctxA, { key: BAL, scope: sc, scopeId: id })));
  out("D6b reset other-tenant product", await safe(() => reset(OWN, ctxA, { key: BAL, scope: "PRODUCT", scopeId: pB })), `B value still ${String((await resolve(ctxB, BAL, { unitId: uB, productId: pB })).value)}`);

  // ── E. 20 ทางพร้อมกัน key/scope เดียวกัน ──
  const vals = Array.from({ length: 20 }, (_, i) => i + 101);
  const t0 = Date.now();
  const rs = await Promise.allSettled(vals.map((v) => setS(OWN, ctxA, [{ key: BAL, scope: "PRODUCT", scopeId: p2, value: v }])));
  const okN = rs.filter((r) => r.status === "fulfilled" && r.value.ok === true).length;
  const errs = rs.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.ok !== true)).map((r) => (r.status === "rejected" ? errMsg(r.reason) : sum(r.value)));
  const rowsV = await q<{ value: unknown }>(`SELECT value FROM "SettingValue" WHERE "tenantId"=$1 AND key=$2 AND scope='PRODUCT' AND "scopeId"=$3`, [tA, BAL, p2]);
  const ch = await q<{ before: unknown; after: unknown; at: Date }>(`SELECT before, after, at FROM "SettingChange" WHERE "tenantId"=$1 AND key=$2 AND scope='PRODUCT' AND "scopeId"=$3 AND (CASE WHEN jsonb_typeof(after)='number' THEN (after)::text::numeric ELSE 0 END) > 100 ORDER BY at, id`, [tA, BAL, p2]);
  // ไล่โซ่ before→after
  const byBefore = new Map<string, unknown[]>();
  for (const c of ch) { const k = JSON.stringify(c.before); byBefore.set(k, [...(byBefore.get(k) ?? []), c.after]); }
  let curV: unknown = 20; let steps = 0; const forks = [...byBefore].filter(([, a]) => a.length > 1);
  while (byBefore.has(JSON.stringify(curV)) && steps < 50) { curV = (byBefore.get(JSON.stringify(curV)) ?? [])[0]; steps++; }
  out("E1 20 parallel", `ok ${okN}/20 · ${Date.now() - t0}ms · errs ${fmt(errs.slice(0, 3))}`, `rows ${rowsV.length} value ${fmt(rowsV.map((r) => r.value))}`, `changes ${ch.length} · chain steps ${steps} · chain end ${fmt(curV)} · forks ${fmt(forks)}`);

  // ── F. W03 ข้ามชั้น: ladder แย่ที่ PRODUCT + มัดจำ 0 → เปลี่ยนมัดจำที่ UNIT เป็น 30 ──
  await setS(OWN, ctxA, [{ key: "trips.pay.depositPct", scope: "UNIT", scopeId: uT2, value: 0 }]);
  const pF = await mkProduct(tA, uT2);
  out("F0 ladder bad @PRODUCT (deposit 0)", await safe(() => setS(OWN, ctxA, [{ key: "trips.cancel.ladder", scope: "PRODUCT", scopeId: pF, value: [{ fromDaysBefore: 30, refundPct: 50 }, { fromDaysBefore: 0, refundPct: 0 }] }])));
  out("F0b same ack", await safe(() => setS(OWN, ctxA, [{ key: "trips.cancel.ladder", scope: "PRODUCT", scopeId: pF, value: [{ fromDaysBefore: 30, refundPct: 50 }, { fromDaysBefore: 0, refundPct: 0 }] }], { ackLegalWarn: true })));
  out("F1 deposit UNIT 0→30 (no ack) — W03 for pF?", await safe(() => setS(OWN, ctxA, [{ key: "trips.pay.depositPct", scope: "UNIT", scopeId: uT2, value: 30 }])));
  out("F1b deposit PRODUCT pF 30 (no ack)", await safe(() => setS(OWN, ctxA, [{ key: "trips.pay.depositPct", scope: "PRODUCT", scopeId: pF, value: 40 }])));
} catch (e) {
  console.log("FATAL", errMsg(e), e instanceof Error ? e.stack?.split("\n").slice(0, 4).join(" | ") : "");
} finally {
  await cleanup();
  process.exit(0);
}

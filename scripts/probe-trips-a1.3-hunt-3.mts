// hunt-3 — A1.3a isolation (shop B ids in every shop-A service · restricted staff · forged ctx) + dangerous input (numbers · extra keys · names · try inputs)
// run: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-a1.3-hunt-3.mts
import { huntSetup, NOW, type Rec } from "./probe-trips-a1.3-hunt-lib.mjs"; // PROBE-EDIT (typecheck): .mts → .mjs (TS5097 · tsx maps .mjs → .mts)

const H = await huntSetup("probe-a1.3-hunt-3");
const { call, check, fmt, R, q } = H;
const pct = (bp: number, extra: Rec = {}) => ({ productKind: "TRIP", mode: "COMMISSION_PCT", valueBp: bp, ...extra });
const strip = (r: Rec) => JSON.stringify(r);

try {
  const SA = await H.mkShop("i3a", { u: null, u2: null });
  const SB = await H.mkShop("i3b", { u: null });
  const PA = await H.mkProd(SA, "PA", "u");
  const PA2 = await H.mkProd(SA, "PA2", "u");
  const PB = await H.mkProd(SB, "PB", "u");
  await H.tiersOf(SA); const tB = await H.tiersOf(SB);
  const XA = await H.mkAccount(SA, "XA");
  const RU = await H.mkAccount(SA, "RU", { unitIds: [SA.units.u] });
  const XB = await H.mkAccount(SB, "XB", { tierId: tB.A });
  const cA = await H.mkCard(SA, { kind: "AGENT", agentAccountId: XA }, [pct(1000, { productId: PA.id })]);
  const cRU = await H.mkCard(SA, { kind: "AGENT", agentAccountId: RU }, [pct(1100, { productId: PA.id })]);
  const cB = await H.mkCard(SB, { kind: "AGENT", agentAccountId: XB }, [pct(2000, { productId: PB.id })]);
  const cBT = await H.mkCard(SB, { kind: "TIER", tierCode: "A" }, [pct(2100, { productId: PB.id })]);
  const depA = await H.mkDep(PA, "2027-03-03");
  const depB = await H.mkDep(PB, "2027-03-03");
  SA.staff.RESTR = await H.mkStaff(SA.id, "i3restr", "STAFF", [SA.units.u2], { "agency.rate.view": true, "agency.rate.edit": true, "agency.account.view": true });
  SA.staff.VIEW = await H.mkStaff(SA.id, "i3view", "STAFF", ["*"], { "agency.rate.view": true });
  const fpB0 = await H.dbFingerprint([SB.id]);
  const audA0 = await H.auditCount(SA.id, "%");
  const NOPE = "a13h_nope_0000000";

  // ── shop-B ids in shop-A services: answer must equal the nonexistent-id answer byte for byte ──
  const pairs: [string, string, (id: string) => Rec][] = [
    ["getAgentRateCard", "card", (id) => ({ cardId: id })],
    ["updateAgentRateCard", "card", (id) => ({ cardId: id, expectedVersion: cB.version, patch: { name: "hijack" } })],
    ["setAgentRateCardStatus ARCHIVE", "card", (id) => ({ cardId: id, expectedVersion: cB.version, action: "ARCHIVE" })],
    ["setAgentRateCardStatus ACTIVATE", "card", (id) => ({ cardId: id, expectedVersion: cB.version, action: "ACTIVATE" })],
    ["upsertAgentRate (B card)", "card", (id) => ({ cardId: id, expectedVersion: cB.version, rate: pct(1, { productId: PA.id }) })],
    ["upsertAgentRate (A card, B rate id)", "rate", (id) => ({ cardId: cA.id, expectedVersion: cA.version, rate: { id, ...pct(1, { productId: PA.id }) } })],
    ["setAgentRateActive (A card, B rate id)", "rate", (id) => ({ cardId: cA.id, expectedVersion: cA.version, rateId: id, active: false })],
    ["setAgentRateActive (B card, B rate)", "cardrate", (id) => ({ cardId: id, expectedVersion: cB.version, rateId: id === NOPE ? NOPE : cB.rateIds[0], active: false })],
    ["createAgentRateCard owner = B account", "acc", (id) => ({ owner: { kind: "AGENT", agentAccountId: id }, name: "x" })],
    ["createAgentRateCard copyFrom = B card", "card", (id) => ({ owner: { kind: "AGENT", agentAccountId: XA }, name: "x", copyFromCardId: id })],
    ["listAgentRateCards owner = B account", "acc", (id) => ({ owner: { kind: "AGENT", agentAccountId: id } })],
    ["setAgentAccountTier B account", "acc", (id) => ({ agentAccountId: id, tierCode: "A", expectedUpdatedAt: new Date().toISOString() })],
    ["tryAgentPrice B account", "acc", (id) => ({ agentAccountId: id, unitId: SA.units.u, productId: PA.id, slotId: depA, pax: [{ paxTypeId: PA.pt.ADULT, qty: 2 }], at: NOW.toISOString() })],
    ["tryAgentPrice B product/slot", "prod", (id) => ({ agentAccountId: XA, unitId: SA.units.u, productId: id, slotId: id === NOPE ? NOPE : depB, pax: [{ paxTypeId: PA.pt.ADULT, qty: 2 }], at: NOW.toISOString() })],
    ["tryAgentPrice B unit", "unit", (id) => ({ agentAccountId: XA, unitId: id, productId: PA.id, slotId: depA, pax: [{ paxTypeId: PA.pt.ADULT, qty: 2 }], at: NOW.toISOString() })],
  ];
  const bId = (k: string) => (k === "card" ? cB.id : k === "rate" ? cB.rateIds[0] : k === "cardrate" ? cB.id : k === "acc" ? XB : k === "prod" ? PB.id : k === "unit" ? SB.units.u : cBT.id);
  for (const [fn, kind, mk] of pairs) {
    const name = fn.split(" ")[0];
    const rb = await call(name, SA.ctx(), mk(bId(kind)), { now: NOW });
    const rn = await call(name, SA.ctx(), mk(NOPE), { now: NOW });
    const leak = strip(rb).includes(String(XB)) || strip(rb).includes(PB.id) || strip(rb).includes("2000");
    check(`X ${fn}: B id ≡ nonexistent id (NOT_FOUND, no leak)`, rb.ok === false && rb.code === "NOT_FOUND" && strip(rb) === strip(rn) && !leak, `NOT_FOUND ≡ ${strip(rn).slice(0, 120)}`, `B: ${fmt(rb)}`);
  }
  // listAgentRateCards cursor = a shop-B card id vs nonexistent cursor
  {
    for (let i = 0; i < 3; i++) await H.mkCard(SA, { kind: "TIER", tierCode: "C" }, [], { activate: false });
    const rb = await call("listAgentRateCards", SA.ctx(), { cursor: cB.id }, { now: NOW });
    const rn = await call("listAgentRateCards", SA.ctx(), { cursor: NOPE }, { now: NOW });
    check("X listAgentRateCards cursor = shop-B card id ≡ cursor = nonexistent id (no cross-shop existence oracle)", strip(rb) === strip(rn), strip(rn).slice(0, 160), `B-cursor items ${R(rb).items ? (rb.items as unknown[]).length : "-"} ${fmt(rb).slice(0, 200)} · nonexistent ${fmt(rn).slice(0, 200)}`);
  }
  // rate rows referencing other-shop product / option / pax type from another product of the same shop
  {
    const cases: [string, Rec][] = [
      ["productId of shop B", pct(1, { productId: PB.id })],
      ["optionId of shop B product", pct(1, { productId: PA.id, optionId: PB.opt })],
      ["optionId of other product (same shop)", pct(1, { productId: PA.id, optionId: PA2.opt })],
      ["paxTypeId of other product (same shop)", { productKind: "TRIP", productId: PA.id, mode: "NET", valueMinor: 1000, paxTypeId: PA2.pt.ADULT }],
      ["paxTypeId of shop B", { productKind: "TRIP", productId: PA.id, mode: "NET", valueMinor: 1000, paxTypeId: PB.pt.ADULT }],
    ];
    const bogus = await call("upsertAgentRate", SA.ctx(), { cardId: cA.id, expectedVersion: cA.version, rate: pct(1, { productId: NOPE }) }, { now: NOW });
    for (const [what, rate] of cases) {
      const r = await call("upsertAgentRate", SA.ctx(), { cardId: cA.id, expectedVersion: cA.version, rate }, { now: NOW });
      check(`X rate ${what} → PRODUCT_NOT_FOUND ≡ bogus product`, r.ok === false && r.reason === "PRODUCT_NOT_FOUND" && strip(r) === strip(bogus), strip(bogus).slice(0, 100), fmt(r));
      const t = await call("tryAgentPrice", SA.ctx(), { agentAccountId: XA, unitId: SA.units.u, productId: PA.id, slotId: depA, pax: [{ paxTypeId: PA.pt.ADULT, qty: 1 }], at: NOW.toISOString(), draft: { ownerKind: "AGENT", rates: [rate] } }, { now: NOW });
      check(`X try draft ${what} → PRODUCT_NOT_FOUND`, t.ok === false && t.reason === "PRODUCT_NOT_FOUND", "PRODUCT_NOT_FOUND", fmt(t));
    }
  }
  // restricted staff (unit u2 only): account RU (unitIds [u]) invisible ⇒ same NOT_FOUND as nonexistent
  {
    const g1 = await call("getAgentRateCard", SA.ctx("RESTR"), { cardId: cRU.id }, { now: NOW });
    const g0 = await call("getAgentRateCard", SA.ctx("RESTR"), { cardId: NOPE }, { now: NOW });
    check("X restricted staff: card of invisible account ≡ nonexistent", strip(g1) === strip(g0) && g1.code === "NOT_FOUND", strip(g0), fmt(g1));
    const l = await call("listAgentRateCards", SA.ctx("RESTR"), {}, { now: NOW });
    check("X restricted staff: list excludes invisible account's cards", l.ok === true && !strip(l).includes(cRU.id), "no cRU", `${(l.items as unknown[] | undefined)?.length} items · has cRU ${strip(l).includes(cRU.id)}`);
    const t1 = await call("tryAgentPrice", SA.ctx("RESTR"), { agentAccountId: RU, unitId: SA.units.u2, productId: PA.id, slotId: depA, pax: [{ paxTypeId: PA.pt.ADULT, qty: 1 }] }, { now: NOW });
    check("X restricted staff: try with invisible account → NOT_FOUND", t1.ok === false && t1.code === "NOT_FOUND", "NOT_FOUND", fmt(t1));
    const t2 = await call("tryAgentPrice", SA.ctx("RESTR"), { agentAccountId: XA, unitId: SA.units.u, productId: PA.id, slotId: depA, pax: [{ paxTypeId: PA.pt.ADULT, qty: 1 }] }, { now: NOW });
    check("X restricted staff: try in a unit outside own access → NOT_FOUND", t2.ok === false && t2.code === "NOT_FOUND", "NOT_FOUND", fmt(t2));
    const w = await call("upsertAgentRate", SA.ctx("RESTR"), { cardId: cA.id, expectedVersion: cA.version, rate: pct(5, { productId: PA.id }) }, { now: NOW });
    check("X restricted staff cannot write (FORBIDDEN)", w.ok === false && w.code === "FORBIDDEN", "FORBIDDEN", fmt(w));
    const v = await call("upsertAgentRate", SA.ctx("VIEW"), { cardId: NOPE, expectedVersion: 1, rate: pct(5, { productId: PA.id }) }, { now: NOW });
    check("X view-only staff write → FORBIDDEN before touching id", v.ok === false && v.code === "FORBIDDEN", "FORBIDDEN", fmt(v));
  }
  // forged / odd ctx
  {
    const forged: [string, unknown][] = [
      ["actor of shop B on tenant A", { tenantId: SA.id, actorUserId: SB.staff.OWNER.userId }],
      ["tenant B with actor of A", { tenantId: SB.id, actorUserId: SA.staff.OWNER.userId }],
      ["extra key role:OWNER", { ...SA.ctx("VIEW"), role: "OWNER" }],
      ["extra key unitAccess:*", { ...SA.ctx("RESTR"), unitAccess: ["*"] }],
      ["null ctx", null],
      ["array ctx", [SA.id]],
    ];
    for (const [what, ctx] of forged) {
      const r = await call("upsertAgentRate", ctx, { cardId: cA.id, expectedVersion: cA.version, rate: pct(7, { productId: PA.id }) }, { now: NOW });
      check(`X forged ctx (${what}) → FORBIDDEN`, r.ok === false && r.code === "FORBIDDEN", "FORBIDDEN", fmt(r));
    }
  }
  const fpB1 = await H.dbFingerprint([SB.id]);
  check("X shop B untouched (cards/rates/accounts/audit fingerprint)", JSON.stringify(fpB0) === JSON.stringify(fpB1), fmt(fpB0), fmt(fpB1));
  const audA1 = await H.auditCount(SA.id, "%");
  const createdCardsAudit = 3; // the 3 TIER C cards made for the cursor test
  check("X no audit in shop A from refused cross-shop calls", audA1 - audA0 === createdCardsAudit, `+${createdCardsAudit}`, `+${audA1 - audA0}`);

  // ═════════ dangerous input (expect VALIDATION BAD_INPUT unless noted · never THROW/BUSY · nothing written) ═════════
  const fp0 = await H.dbFingerprint([SA.id]);
  const big = 2 ** 31;
  const rateCases: [string, Rec, string][] = [
    ["valueBp -1", pct(-1, { productId: PA.id }), "BAD_INPUT"],
    ["valueBp 10001", pct(10001, { productId: PA.id }), "BAD_INPUT"],
    ["valueBp 12.5", pct(12.5, { productId: PA.id }), "BAD_INPUT"],
    ["valueBp NaN", pct(NaN, { productId: PA.id }), "BAD_INPUT"],
    ["valueBp Infinity", pct(Infinity, { productId: PA.id }), "BAD_INPUT"],
    ["valueBp '1200'", { ...pct(0, { productId: PA.id }), valueBp: "1200" }, "BAD_INPUT"],
    ["valueBp 1e3 as string exp", { ...pct(0, { productId: PA.id }), valueBp: "1e3" }, "BAD_INPUT"],
    ["valueBp -0", pct(-0, { productId: PA.id, travelFrom: "2031-01-01" }), "OK"],
    ["valueMinor 2^31 (NET)", { productKind: "TRIP", productId: PA.id, mode: "NET", valueMinor: big }, "BAD_INPUT"],
    ["valueMinor -1 (NET)", { productKind: "TRIP", productId: PA.id, mode: "NET", valueMinor: -1 }, "BAD_INPUT"],
    ["valueMinor 1e20 (FIXED)", { productKind: "TRIP", productId: PA.id, mode: "COMMISSION_FIXED", valueMinor: 1e20 }, "BAD_INPUT"],
    ["valueMinor bigint-ish string", { productKind: "TRIP", productId: PA.id, mode: "NET", valueMinor: "9007199254740993" }, "BAD_INPUT"],
    ["markupCapBp 100001", { productKind: "TRIP", productId: PA.id, mode: "MARKUP", valueMinor: 1000, markupCapBp: 100001 }, "BAD_INPUT"],
    ["priority -1", pct(1, { productId: PA.id, priority: -1 }), "BAD_INPUT"],
    ["priority 1001", pct(1, { productId: PA.id, priority: 1001 }), "BAD_INPUT"],
    ["priority 1.5", pct(1, { productId: PA.id, priority: 1.5 }), "BAD_INPUT"],
    ["currency thb", pct(1, { productId: PA.id, currency: "thb" }), "BAD_INPUT"],
    ["currency USD on THB product (PCT)", pct(1, { productId: PA.id, currency: "USD" }), "CURRENCY_MISMATCH"],
    ["FIXED currency USD", { productKind: "TRIP", productId: PA.id, mode: "COMMISSION_FIXED", valueMinor: 100, currency: "USD" }, "CURRENCY_MISMATCH"],
    ["productKind HOTEL", { ...pct(1, { productId: PA.id }), productKind: "HOTEL" }, "KIND_NOT_SUPPORTED"],
    ["productKind TICKET", { ...pct(1, { productId: PA.id }), productKind: "TICKET" }, "KIND_NOT_SUPPORTED"],
    ["cabinTypeId set", pct(1, { productId: PA.id, cabinTypeId: "cab_1" }), "CABIN_RATE_NOT_SUPPORTED"],
    ["PCT with paxTypeId", pct(1, { productId: PA.id, paxTypeId: PA.pt.ADULT }), "PAX_RATE_COMMISSION"],
    ["NET minSell < net", { productKind: "TRIP", productId: PA.id, mode: "NET", valueMinor: 1000, minSellMinor: 999 }, "MIN_SELL_BELOW_NET"],
    ["MARKUP with valueBp", { productKind: "TRIP", productId: PA.id, mode: "MARKUP", valueMinor: 1000, markupCapBp: 100, valueBp: 5 }, "MODE_VALUE_MISMATCH"],
    ["MARKUP w/o cap", { productKind: "TRIP", productId: PA.id, mode: "MARKUP", valueMinor: 1000 }, "MODE_VALUE_MISMATCH"],
    ["PCT with minSell", pct(1, { productId: PA.id, minSellMinor: 5 }), "MODE_VALUE_MISMATCH"],
    ["extra key tenantId", pct(1, { productId: PA.id, tenantId: SB.id }), "BAD_INPUT"],
    ["extra key rateCardId", pct(1, { productId: PA.id, rateCardId: cB.id }), "BAD_INPUT"],
    ["extra key version", pct(1, { productId: PA.id, version: 99 }), "BAD_INPUT"],
    ["extra key createdAt", pct(1, { productId: PA.id, createdAt: "2020-01-01" }), "BAD_INPUT"],
    ["extra key specialPeriod", pct(1, { productId: PA.id, specialPeriod: false }), "BAD_INPUT"],
    ["bookTo < bookFrom", pct(1, { productId: PA.id, bookFrom: "2027-01-02", bookTo: "2027-01-01" }), "BAD_RANGE"],
    ["productId with SQL", pct(1, { productId: "x' OR '1'='1" }), "BAD_INPUT"],
    ["productId 65 chars", pct(1, { productId: "a".repeat(65) }), "BAD_INPUT"],
    // PROBE-EDIT (มติ Z2): เดิมคีย์มิติชนแถวตั้งต้นของ card (ไม่มีวัน) ⇒ RATE_OVERLAP ตามมติ — ย้ายไปช่วงของตัวเอง (2030-06-01 · ไม่ซ้อนแถว -0 ที่เปิดปลาย 2031-01-01..) เพื่อยังทดสอบ __proto__ ได้
    ["proto-polluted rate", JSON.parse(`{"productKind":"TRIP","productId":"${PA.id}","mode":"COMMISSION_PCT","valueBp":1,"travelFrom":"2030-06-01","travelTo":"2030-06-01","__proto__":{"tenantId":"${SB.id}"}}`) as Rec, "BAD_INPUT|OK"],
    ["id unknown (upsert by id)", { id: NOPE, ...pct(1, { productId: PA.id }) }, "NOT_FOUND"],
    ["id number", { id: 5, ...pct(1, { productId: PA.id }) }, "BAD_INPUT"],
  ];
  let v = cA.version;
  for (const [what, rate, want] of rateCases) {
    const r = await call("upsertAgentRate", SA.ctx(), { cardId: cA.id, expectedVersion: v, rate }, { now: NOW });
    if (r.ok === true) v = Number(R(r.card).version);
    const got = r.ok === true ? "OK" : r.code === "NOT_FOUND" ? "NOT_FOUND" : r.code === "VALIDATION" ? String(r.reason) : `${String(r.code)}:${String(r.reason ?? r.e ?? "")}`;
    check(`I rate ${what}`, want.split("|").includes(got), want, `${got} ${r.ok === true ? fmt(R(r.rate)).slice(0, 160) : ""}`);
  }
  // envelope-level junk
  const envCases: [string, Rec][] = [
    ["expectedVersion 0", { cardId: cA.id, expectedVersion: 0, rate: pct(1, { productId: PA.id }) }],
    ["expectedVersion '1'", { cardId: cA.id, expectedVersion: "1", rate: pct(1, { productId: PA.id }) }],
    ["expectedVersion 1.5", { cardId: cA.id, expectedVersion: 1.5, rate: pct(1, { productId: PA.id }) }],
    ["expectedVersion 1e12", { cardId: cA.id, expectedVersion: 1e12, rate: pct(1, { productId: PA.id }) }],
    ["envelope tenantId", { cardId: cA.id, expectedVersion: v, rate: pct(1, { productId: PA.id }), tenantId: SB.id }],
    ["rate = array", { cardId: cA.id, expectedVersion: v, rate: [pct(1, { productId: PA.id })] }],
    ["rate = null", { cardId: cA.id, expectedVersion: v, rate: null }],
  ];
  for (const [what, inp] of envCases) {
    const r = await call("upsertAgentRate", SA.ctx(), inp, { now: NOW });
    check(`I envelope ${what} → VALIDATION BAD_INPUT`, r.ok === false && r.code === "VALIDATION" && r.reason === "BAD_INPUT", "BAD_INPUT", fmt(r));
  }
  // card names
  const nameCases: [string, string, "OK" | "BAD_INPUT"][] = [
    ["empty", "", "BAD_INPUT"], ["spaces", "    ", "BAD_INPUT"], ["81 chars", "a".repeat(81), "BAD_INPUT"], ["80 chars", "a".repeat(80), "OK"],
    ["10k chars", "a".repeat(10_000), "BAD_INPUT"], ["NUL", "a\u0000b", "BAD_INPUT"], ["newline", "a\nb", "BAD_INPUT"], ["RLO", "a‮b", "BAD_INPUT"],
    ["zero-width only", "​​", "BAD_INPUT"], ["lone surrogate", "a\ud800b", "BAD_INPUT"], ["Thai 80 graphemes w/ marks", "กิ่".repeat(26) + "กิ", "OK"],
  ];
  for (const [what, name, want] of nameCases) {
    const r = await call("createAgentRateCard", SA.ctx(), { owner: { kind: "TIER", tierCode: "B" }, name }, { now: NOW });
    const got = r.ok === true ? "OK" : String(r.reason ?? r.code);
    check(`I name ${what}`, got === want, want, `${got} ${r.ok === true ? `stored=${JSON.stringify(R(r.card).name).slice(0, 60)}` : fmt(r).slice(0, 120)}`);
  }
  for (const [what, inp] of [["card validFrom 0000-01-01", { owner: { kind: "TIER", tierCode: "B" }, name: "y0", validFrom: "0000-01-01" }], ["card validTo 0000-12-31", { owner: { kind: "TIER", tierCode: "B" }, name: "y0b", validTo: "0000-12-31" }]] as const) {
    const r = await call("createAgentRateCard", SA.ctx(), inp, { now: NOW });
    // PROBE-EDIT (มติ Z8): ปี 0000 นอก 1900–2200 ⇒ ต้อง VALIDATION BAD_INPUT (ไม่ยอมรับอีกแล้ว)
    check(`I ${what} → VALIDATION BAD_INPUT (not BUSY/ops ERROR)`, r.ok === false && r.code === "VALIDATION" && r.reason === "BAD_INPUT", "VALIDATION BAD_INPUT", fmt(r));
  }
  const formula: string[] = [];
  for (const name of ["=HYPERLINK(\"http://evil\",\"x\")", "+cmd|' /C calc'!A0", "@SUM(1+1)", "-2+3"]) {
    const r = await call("createAgentRateCard", SA.ctx(), { owner: { kind: "TIER", tierCode: "B" }, name }, { now: NOW });
    formula.push(`${JSON.stringify(name).slice(0, 24)}→${r.ok === true ? "STORED" : String(r.reason)}`);
  }
  console.log(`INFO [I name CSV-formula] ${formula.join(" · ")} (ใบสั่งไม่บังคับ — ตัวส่งออก CSV ของ A1.3b ต้องกันเอง)`);
  // try inputs
  const tryBase = { agentAccountId: XA, unitId: SA.units.u, productId: PA.id, slotId: depA, pax: [{ paxTypeId: PA.pt.ADULT, qty: 2 }], at: NOW.toISOString() };
  const tryCases: [string, Rec, string][] = [
    ["pax 21 lines", { ...tryBase, pax: Array.from({ length: 21 }, () => ({ paxTypeId: PA.pt.ADULT, qty: 1 })) }, "BAD_INPUT"],
    ["pax qty -1", { ...tryBase, pax: [{ paxTypeId: PA.pt.ADULT, qty: -1 }] }, "BAD_INPUT"],
    ["pax qty 1.5", { ...tryBase, pax: [{ paxTypeId: PA.pt.ADULT, qty: 1.5 }] }, "BAD_INPUT"],
    ["pax qty 100000 (amount overflow)", { ...tryBase, pax: [{ paxTypeId: PA.pt.ADULT, qty: 100_000 }] }, "VALIDATION"],
    ["pax empty", { ...tryBase, pax: [] }, "BAD_INPUT"],
    ["at garbage", { ...tryBase, at: "yesterday-ish" }, "BAD_INPUT"],
    ["at far future 9999", { ...tryBase, at: "9999-12-31T23:59:59Z" }, "BAD_INPUT"], // PROBE-EDIT (มติ Z8): ปีนอก 1900–2200 ⇒ BAD_INPUT
    ["agentDiscountSatang 2^31", { ...tryBase, agentDiscountSatang: big }, "BAD_INPUT"],
    ["agentDiscountSatang over cap", { ...tryBase, agentDiscountSatang: 2_000_000 }, "VALIDATION"],
    ["actualSaleSatang NaN", { ...tryBase, actualSaleSatang: NaN }, "BAD_INPUT"],
    ["extra key tenantId", { ...tryBase, tenantId: SB.id }, "BAD_INPUT"],
    ["draft 201 rates", { ...tryBase, draft: { ownerKind: "AGENT", rates: Array.from({ length: 201 }, (_, i) => pct(1, { productId: PA.id, priority: i % 1000 })) } }, "BAD_INPUT"],
    ["draft rate with id", { ...tryBase, draft: { ownerKind: "AGENT", rates: [{ id: cA.rateIds[0], ...pct(1, { productId: PA.id }) }] } }, "BAD_INPUT"],
    ["draft ownerKind X", { ...tryBase, draft: { ownerKind: "X", rates: [] } }, "BAD_INPUT"],
    ["draft extra key", { ...tryBase, draft: { ownerKind: "AGENT", rates: [], tenantId: SB.id } }, "BAD_INPUT"],
    ["draft validTo<validFrom", { ...tryBase, draft: { ownerKind: "AGENT", validFrom: "2027-01-02", validTo: "2027-01-01", rates: [] } }, "BAD_RANGE"],
    ["draft duplicated NND", { ...tryBase, draft: { ownerKind: "AGENT", rates: [pct(1, { productId: PA.id }), pct(2, { productId: PA.id })] } }, "RATE_OVERLAP"],
  ];
  for (const [what, inp, want] of tryCases) {
    const r = await call("tryAgentPrice", SA.ctx(), inp, { now: NOW });
    const got = r.ok === true ? "OK" : r.code === "VALIDATION" && (r.reason === "BAD_INPUT" || r.reason === "BAD_RANGE" || r.reason === "RATE_OVERLAP") ? String(r.reason) : String(r.code);
    check(`I try ${what}`, want.split("|").includes(got), want, `${got} ${fmt(r).slice(0, 200)}`);
  }
  const fp1 = await H.dbFingerprint([SA.id]);
  const okWrites = rateCases.filter(([, , w]) => w.includes("OK")).length;
  console.log(`INFO [I fingerprint] before ${fmt(fp0)} after ${fmt(fp1)} (expected writes: ≤ ${okWrites} rate rows · 2–3 cards from OK names/formula)`);
  const rows = await q<{ n: number }>(`SELECT count(*)::int n FROM "AgentRate" WHERE "rateCardId" = $1`, [cA.id]);
  check("I rejected rate inputs wrote nothing (rows on card A = 1 seed + accepted only)", rows[0].n <= 1 + okWrites, `≤ ${1 + okWrites}`, String(rows[0].n));
  const ops = await q<{ j: string }>(`SELECT row_to_json(o)::text j FROM "OpsEvent" o WHERE "tenantId" = $1`, [SA.id]).catch((e) => [{ j: `QUERY-ERR ${String(e).slice(0, 80)}` }]);
  check("I no ops event from any dangerous input (§7 ข้อ 10)", ops.length === 0, "0 OpsEvent rows for shop A", `${ops.length} rows · ${ops.map((o) => o.j.slice(0, 260)).join(" | ")}`);
} catch (e) {
  console.log(`PROBE ERROR ${String(e instanceof Error ? e.stack : e).slice(0, 800)}`);
} finally {
  H.summary("hunt-3");
  await H.cleanup();
}

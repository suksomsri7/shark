// probe-trips-w1.2-hunt-2 — HTTP: money to the satang (target 7) · X29 off / SHOP_CONFIRMS (6) · slot closed / stop-sell / cutoff between hold and confirm (8) · staff booking on my/ (12)
// QR byte check + staff booking call @/lib/modules/trips directly (src at run time — noted in the report)
// PROBE-EDIT (r2 · มติ Y2 Y6 Y7): ช่อง bind หาจากค่า · ฟอร์มถือพก t · PENDING แสดงรหัสการจอง + ทางติดต่อร้าน (Y6)
// PROBE-EDIT (r1 · มติ W2 W5): + ถือใหม่จากหน้าราคาเปลี่ยนปล่อยที่ถือเดิม (W2) · PRICE_CHANGED ยอดเท่าเดิม = "เงื่อนไขเปลี่ยน" (W5) · QR เฉพาะร้านเก็บเงิน (W5) · PENDING มีข้อความของตัวเอง (W5)
import * as L from "./probe-trips-w1.2-hunt-lib.mjs";
const { line, known, info, guard, req, submit, kindOf, loc, testid, freshIp, sleep } = L;

L.boot("probe-w1.2-hunt-2");
const LABEL = "hunt-2";
type Rec = Record<string, unknown>;
type AnyFn = (...a: unknown[]) => Promise<Rec>;
try {
  await L.sweepStale();
  const TR = (await import("@/lib/modules/trips")) as unknown as Record<string, AnyFn>;
  const today = L.ymdBkk(new Date());
  // shop V: VAT added on top · park fee pass-through · out-of-zone pickup · contact
  const V = await L.mkShop("v", { contact: { phone: "076-999-000", line: "@w12v", address: null } });
  await L.setV(V.tenant, [{ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: V.unit, value: { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 } }, { key: "trips.tax.priceIncludesVat", scope: "UNIT", scopeId: V.unit, value: false }]);
  const PV = await L.mkProd(V, "V");
  const zOut = await L.mkZone(V, "out", { surcharge: L.OUTZ, sort: 1 });
  const dV = await L.mkDep(PV, L.addDays(today, 20), { capacity: 30 });
  // shop A: plain · deposit product · SHOP_CONFIRMS product · gate deps
  const A = await L.mkShop("a");
  const PA = await L.mkProd(A, "A");
  const PDEP = await L.mkProd(A, "DEP");
  const PSC = await L.mkProd(A, "SC");
  await L.setV(A.tenant, [{ key: "trips.pay.depositPct", scope: "PRODUCT", scopeId: PDEP.id, value: 30 }, { key: "trips.pay.balanceDueDaysBefore", scope: "PRODUCT", scopeId: PDEP.id, value: 3 },
    { key: "trips.sell.confirmMode", scope: "PRODUCT", scopeId: PSC.id, value: "SHOP_CONFIRMS" }]);
  const D20 = L.addDays(today, 20), D22 = L.addDays(today, 22);
  const dDep = await L.mkDep(PDEP, D20);
  const dSc = await L.mkDep(PSC, D20);
  const dPc = await L.mkDep(PA, D20, { capacity: 30 });
  const dOff = await L.mkDep(PA, L.addDays(today, 21), { capacity: 30 });
  const dClose = await L.mkDep(PA, D22, { capacity: 30 });
  const dStop = await L.mkDep(PA, L.addDays(today, 23), { capacity: 30 });
  const dCut = await L.mkDep(PA, L.addDays(today, 24), { capacity: 30 });
  const dStaff = await L.mkDep(PA, L.addDays(today, 25), { capacity: 30 });
  const PTC = await L.mkProd(A, "TC"); // PROBE-EDIT: ร้านแก้ตารางยกเลิกหลังถือ (ยอดไม่เปลี่ยน · W5)
  const dTc = await L.mkDep(PTC, D20, { capacity: 30 });
  const dRh = await L.mkDep(PA, L.addDays(today, 26), { capacity: 30 }); // PROBE-EDIT: ถือใหม่ (W2)

  // ═══ 7. money ═══
  await guard("money-vat", async () => {
    const ip = freshIp();
    const camRef = L.pubRef(V.tenant, "extra", PV.cam), diveRef = L.pubRef(V.tenant, "extra", PV.dive), zRef = L.pubRef(V.tenant, "zone", zOut);
    const pick: L.Pick = { d: L.addDays(today, 20), n: { ADULT: 2, CHILD: 1 }, x: { [camRef]: 1, [diveRef]: 2 }, z: zRef };
    const g = await L.openSelect(V, PV, pick, ip);
    const selLines = L.summaryLines(g.r.body);
    const selTotal = L.moneyOf(g.r.body, "book-total");
    const seen = g.form ? Number(L.fieldOf(g.form, "seen")) : null;
    info("money", `select: ${kindOf(g.r)} lines=${JSON.stringify(selLines)} total=${selTotal} seen=${seen}`);
    const sum = selLines.reduce((s, l) => s + (l.satang ?? NaN), 0);
    line("M-select-sum", "select page Σ lines = total = seen", `Σ=${sum} total=${selTotal} seen=${seen}`, sum === selTotal && selTotal === seen);
    line("M-select-vatline", "VAT-added shop shows one VAT line + pickup + 2 extras + park", selLines.map((l) => l.kind).join(","), selLines.filter((l) => l.kind === "VAT").length === 1 && selLines.some((l) => l.kind === "PICKUP"));
    if (!g.form) return;
    await sleep(L.FORM_WAIT);
    const post = await submit(g.path, g.form.fields, ip);
    const hl = loc(post);
    if (!hl.includes("/c/")) { line("M-hold", "hold ok", kindOf(post), false); return; }
    const c = await L.openCheckout(hl, ip);
    const cLines = L.summaryLines(c.r.body);
    const cTotal = L.moneyOf(c.r.body, "book-total");
    const cSum = cLines.reduce((s, l) => s + (l.satang ?? NaN), 0);
    line("M-checkout-sum", "checkout Σ lines = total = select total", `Σ=${cSum} total=${cTotal} select=${selTotal}`, cSum === cTotal && cTotal === selTotal);
    if (!c.form) return;
    await sleep(L.FORM_WAIT);
    const cf = await submit(hl, L.bookerFields(c.form), ip);
    const rp = loc(cf);
    if (!rp.includes("/my/")) { line("M-confirm", "confirm ok", kindOf(cf), false); return; }
    const b = (await L.bookingsOf(V.tenant)).at(-1);
    const snapPay = Number(((b?.policySnapshot?.totals as Rec | undefined)?.payableSatang) ?? NaN);
    const r = await req(rp, { ip });
    const rLines = L.summaryLines(r.body);
    const rTotal = L.moneyOf(r.body, "book-res-total");
    const rPay = L.moneyOf(r.body, "book-pay-amount");
    const rSum = rLines.reduce((s, l) => s + (l.satang ?? NaN), 0);
    info("money", `res: ${kindOf(r)} lines=${JSON.stringify(rLines)} total=${rTotal} pay=${rPay} snapshot=${snapPay} gross=${b?.grossSatang} vat=${b?.vatSatang} pass=${b?.passThroughSatang}`);
    line("M-res", "my/ Σ lines = res-total = pay-amount = snapshot payable = checkout total", `Σ=${rSum} total=${rTotal} pay=${rPay} snap=${snapPay} c/=${cTotal}`, rSum === rTotal && rTotal === rPay && rPay === snapPay && snapPay === cTotal);
    // QR bytes vs service
    const tok = decodeURIComponent(rp.split("/my/")[1]?.split("?")[0] ?? "");
    const pageQr = L.imgSrc(r.body, "book-pay-qr");
    const pi = await TR.tripPaymentIntent?.({ tenantId: V.tenant, unitId: V.unit, channel: "WEB", actor: { kind: "PUBLIC", clientKey: `pc_${"7".repeat(40)}` }, now: new Date() }, { publicToken: tok });
    const svc = ((pi?.value as Rec | undefined)?.svgDataUrl as string | undefined) ?? null;
    line("M-qr-bytes", "QR on page = tripPaymentIntent svgDataUrl byte-for-byte (direct call · src at run time)", `page=${pageQr?.length ?? 0}B svc=${svc?.length ?? 0}B equal=${pageQr === svc}`, !!pageQr && pageQr === svc);
    const amt = Number((pi?.value as Rec | undefined)?.amountSatang);
    line("M-qr-amount", "intent amount = page pay amount", `intent=${amt} page=${rPay}`, amt === rPay);
  });
  await guard("money-deposit", async () => {
    const ip = freshIp();
    const r = await L.bookHttp(A, PDEP, { d: D20, n: { ADULT: 1 } }, ip);
    if (!r.resPath) { line("M-dep", "deposit booking", r.why, false); return; }
    const p = await req(r.resPath, { ip });
    const total = L.moneyOf(p.body, "book-res-total"), now = L.moneyOf(p.body, "book-pay-amount");
    line("M-deposit", "deposit product: pay-now = 30% of trip (฿1,050) ≠ total (฿4,100)", `now=${now} total=${total}`, now === 105_000 && total === 410_000);
    void dDep;
  });
  await guard("price-change", async () => {
    const ip = freshIp();
    const h = await L.holdHttp(A, PA, { d: D20, n: { ADULT: 1 } }, ip);
    if (!h.location.includes("/c/")) { line("PC-hold", "hold", h.post ? kindOf(h.post) : "", false); return; }
    const c = await L.openCheckout(h.location, ip);
    if (!c.form) return;
    await L.q(`UPDATE "TripPrice" SET "amountMinor" = "amountMinor" + 10000 WHERE "productId" = $1 AND "paxTypeId" = $2`, [PA.id, PA.pt.ADULT]);
    try {
      await sleep(L.FORM_WAIT);
      const before = (await L.bookingsOf(A.tenant)).length;
      const cf = await submit(h.location, L.bookerFields(c.form), ip);
      const after = (await L.bookingsOf(A.tenant)).length;
      line("PC-confirm", "price raised between c/ and confirm ⇒ back to c/ with e=PRICE_CHANGED, no booking", `${kindOf(cf)} bookings +${after - before}`, loc(cf).includes("e=PRICE_CHANGED") && after === before);
      const c2 = await req(h.location, { ip });
      line("PC-page", "c/ then shows book-price-changed + book-rehold (old + new totals)", kindOf(c2), testid(c2.body, "book-price-changed") && testid(c2.body, "book-rehold"));
    } finally {
      await L.q(`UPDATE "TripPrice" SET "amountMinor" = "amountMinor" - 10000 WHERE "productId" = $1 AND "paxTypeId" = $2`, [PA.id, PA.pt.ADULT]);
    }
    void dPc;
  });

  // ═══ 6. X29 off · SHOP_CONFIRMS ═══
  await guard("x29", async () => {
    const ipOld = freshIp();
    const old = await L.bookHttp(A, PA, { d: L.addDays(today, 21), n: { ADULT: 1 } }, ipOld);
    const ip = freshIp();
    const h = await L.holdHttp(A, PA, { d: L.addDays(today, 21), n: { ADULT: 2 } }, ip);
    if (!h.location.includes("/c/") || !old.resPath) { info("x29", `setup failed ${old.why} ${h.post ? kindOf(h.post) : ""}`); return; }
    const c = await L.openCheckout(h.location, ip);
    await L.setV(A.tenant, [{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: A.unit, value: false }]);
    try {
      const c2 = await req(h.location, { ip });
      line("X29-c", "c/ while booking off ⇒ UNAVAILABLE (no form)", `${kindOf(c2)} code=${L.errCode(c2.body)} form=${!!L.postForm(c2.body)}`, L.errCode(c2.body) === "UNAVAILABLE" && !L.postForm(c2.body));
      if (c.form) {
        await sleep(L.FORM_WAIT);
        const before = (await L.bookingsOf(A.tenant)).length;
        const cf = await submit(h.location, L.bookerFields(c.form), ip);
        const after = (await L.bookingsOf(A.tenant)).length;
        line("X29-confirm", "confirm while booking off ⇒ e=UNAVAILABLE, no booking", `${kindOf(cf)} +${after - before}`, loc(cf).includes("e=UNAVAILABLE") && after === before);
      }
      const m = await req(old.resPath, { ip: ipOld });
      line("X29-my", "existing reservation still opens while booking off", kindOf(m), m.status === 200 && testid(m.body, "book-res"));
      const ipS = freshIp();
      const s = await L.openSelect(A, PA, { d: L.addDays(today, 21), n: { ADULT: 1 } }, ipS);
      line("X29-select", "product page: book-closed, no hold form", `closed=${testid(s.r.body, "book-closed")} form=${!!s.form}`, testid(s.r.body, "book-closed") && !s.form);
    } finally {
      await L.setV(A.tenant, [{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: A.unit, value: true }]);
    }
    void dOff;
  });
  await guard("shop-confirms", async () => {
    const ip = freshIp();
    const s = await L.openSelect(A, PSC, { d: D20, n: { ADULT: 1 } }, ip);
    line("SC-select", "SHOP_CONFIRMS product: book-closed, no hold form", `closed=${testid(s.r.body, "book-closed")} form=${!!s.form}`, testid(s.r.body, "book-closed") && !s.form);
    // forge: hold form of PA re-bound to PSC (bound args are plain JSON)
    const ip2 = freshIp();
    const g = await L.openSelect(A, PA, { d: D20, n: { ADULT: 1 } }, ip2);
    if (!g.form) return;
    await sleep(L.FORM_WAIT);
    const key = L.boundKey(g.form, (a) => a[0] === A.slug && a[1] === PA.slug); // PROBE-EDIT (r2): ช่อง bind หาจากค่า
    const fields = g.form.fields.map(([k, v]): [string, string] => (k === key ? [k, JSON.stringify([A.slug, PSC.slug])] : [k, v]));
    const before = (await L.holdsOf(dSc)).length;
    const r = await submit(`/book/${A.slug}/t/${PSC.slug}?d=${D20}&n.ADULT=1`, fields, ip2);
    const after = (await L.holdsOf(dSc)).length;
    line("SC-post", "direct POST hold on SHOP_CONFIRMS product ⇒ refused (e=UNAVAILABLE), no hold", `${kindOf(r)} holds +${after - before} bound=${key || "none"}`, !!key && after === before && !loc(r).includes("/c/"));
  });

  // ═══ 8. slot closed · stop-sell WEB · cutoff passed between hold and confirm ═══
  const counters = async (dep: string) => {
    const d = await L.depRow(dep);
    const hs = await L.q<{ s: number }>(`SELECT COALESCE(sum("qtyPublic"),0)::int AS s FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE'`, [dep]);
    const bs = await L.q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripBooking" WHERE "departureId" = $1`, [dep]);
    return { held: d?.held, holdSum: hs[0]?.s, sold: d?.sold, bookings: bs[0]?.n, status: d?.status };
  };
  for (const [tag, dep, d, act, undo, want] of [
    ["closed", dClose, D22, async () => { await L.q(`UPDATE "TripDeparture" SET status = 'CLOSED' WHERE id = $1`, [dClose]); }, async () => { await L.q(`UPDATE "TripDeparture" SET status = 'OPEN' WHERE id = $1`, [dClose]); }, "SLOT_CLOSED"],
    ["stopsell", dStop, L.addDays(today, 23), async () => { await L.q(`UPDATE "TripDeparture" SET "stopSell" = '{"channels":["WEB"]}'::jsonb WHERE id = $1`, [dStop]); }, async () => { await L.q(`UPDATE "TripDeparture" SET "stopSell" = NULL WHERE id = $1`, [dStop]); }, "SLOT_CLOSED"],
    ["cutoff", dCut, L.addDays(today, 24), async () => { await L.setV(A.tenant, [{ key: "trips.sell.cutoff", scope: "DEPARTURE", scopeId: dCut, value: { daysBefore: 30, atMin: 600 } }]); }, async () => undefined, "CUTOFF_PASSED"],
  ] as const) {
    await guard(`gate-${tag}`, async () => {
      const ip = freshIp();
      const h = await L.holdHttp(A, PA, { d, n: { ADULT: 2 } }, ip);
      if (!h.location.includes("/c/")) { line(`G-${tag}`, "hold", h.post ? kindOf(h.post) : kindOf(h.sel), false); return; }
      const c = await L.openCheckout(h.location, ip);
      const c0 = await counters(dep);
      await act();
      try {
        if (!c.form) return;
        await sleep(L.FORM_WAIT);
        const cf = await submit(h.location, L.bookerFields(c.form), ip);
        const c1 = await counters(dep);
        line(`G-${tag}`, `confirm after ${tag} ⇒ e=${want}, no TripBooking`, `${kindOf(cf)} bookings=${c1.bookings}`, loc(cf).includes(`e=${want}`) && c1.bookings === 0);
        line(`G-${tag}-counters`, "held = Σ active holds · sold 0 (before/after)", `before ${JSON.stringify(c0)} after ${JSON.stringify(c1)}`, c1.held === c1.holdSum && c1.sold === 0 && c0.held === c0.holdSum);
        const c2 = await req(h.location, { ip });
        info(`gate-${tag}`, `c/ after ${tag}: ${kindOf(c2)} code=${L.errCode(c2.body)} form=${!!L.postForm(c2.body)}`);
      } finally { await undo(); }
    });
  }

  // ═══ PROBE-EDIT (r1) W2: ถือใหม่จากหน้าราคาเปลี่ยน ⇒ ปล่อยที่ถือของตะกร้าเดิมก่อน ═══
  await guard("rehold", async () => {
    const ip = freshIp();
    const h = await L.holdHttp(A, PA, { d: L.addDays(today, 26), n: { ADULT: 2 } }, ip);
    if (!h.location.includes("/c/")) { line("RH-hold", "hold", h.post ? kindOf(h.post) : kindOf(h.sel), false); return; }
    await L.q(`UPDATE "TripPrice" SET "amountMinor" = "amountMinor" + 10000 WHERE "productId" = $1 AND "paxTypeId" = $2`, [PA.id, PA.pt.ADULT]);
    try {
      const c = await req(h.location, { ip });
      const f = L.postForm(c.body);
      line("RH-page", "c/ after price raise: book-price-changed + rehold form (POST)", `${kindOf(c)} form=${!!f}`, testid(c.body, "book-price-changed") && !!f);
      if (!f) return;
      const d0 = await L.depRow(dRh);
      const r = await submit(h.location, f.fields, ip);
      const d1 = await L.depRow(dRh);
      const act = await L.q<{ n: number }>(`SELECT COALESCE(sum("qtyPublic"),0)::int AS n FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE'`, [dRh]);
      line("RH-release", "rehold POST ⇒ redirect to the product page with the same selection · old basket's seats released (held 2 → 0)", `${kindOf(r)} held ${d0?.held}→${d1?.held} active=${act[0]?.n}`, loc(r).includes(`/t/${PA.slug}`) && /n\.ADULT=2/.test(loc(r)) && d1?.held === 0 && act[0]?.n === 0);
      const again = await L.holdHttp(A, PA, { d: L.addDays(today, 26), n: { ADULT: 2 } }, ip);
      const d2 = await L.depRow(dRh);
      line("RH-again", "hold again (same device) ⇒ held = the new hold only (2)", `${again.post ? kindOf(again.post) : "-"} held=${d2?.held}`, again.location.includes("/c/") && d2?.held === 2);
      // ตะกร้าคนอื่น: POST ปุ่มถือใหม่ของตะกร้านี้แต่ผูก sel ของตะกร้าอื่น ⇒ ไม่ปล่อย
      const ipX = freshIp();
      const hx = await L.holdHttp(A, PA, { d: L.addDays(today, 26), n: { ADULT: 1 } }, ipX);
      const cx = hx.location.includes("/c/") ? await req(hx.location, { ip: ipX }) : null;
      const fx = cx ? L.postForm(cx.body) : null;
      if (fx && again.location) {
        const key = L.boundKey(fx, (a) => a.length === 3 && a[0] === A.slug); // PROBE-EDIT (r2): ช่อง bind หาจากค่า [ร้าน, ตะกร้า, sel]
        const bound = JSON.parse(L.fieldOf(fx, key) ?? "[]") as string[];
        const otherBasket = decodeURIComponent(again.location.split("/c/")[1]?.split("?")[0] ?? "");
        const d3 = await L.depRow(dRh);
        const rr = await submit(hx.location, fx.fields.map(([k, v]): [string, string] => (k === key ? [k, JSON.stringify([bound[0], otherBasket, bound[2]])] : [k, v])), ipX);
        const d4 = await L.depRow(dRh);
        line("RH-foreign", "rehold bound to another customer's basket (sel not matching) ⇒ 404, nothing released", `${kindOf(rr)} held ${d3?.held}→${d4?.held}`, rr.status === 404 && d4?.held === d3?.held);
      } else info("rehold", `foreign: no form (${cx ? kindOf(cx) : "-"})`);
    } finally {
      await L.q(`UPDATE "TripPrice" SET "amountMinor" = "amountMinor" - 10000 WHERE "productId" = $1 AND "paxTypeId" = $2`, [PA.id, PA.pt.ADULT]);
    }
  });
  // ═══ PROBE-EDIT (r1) W5: ร้านแก้เงื่อนไข (ตารางยกเลิก) หลังถือ · ยอดเท่าเดิม ⇒ หน้า "เงื่อนไขการจองเปลี่ยน" ไม่โชว์ยอดเดิม/ใหม่ ═══
  await guard("terms-change", async () => {
    const ip = freshIp();
    const h = await L.holdHttp(A, PTC, { d: D20, n: { ADULT: 1 } }, ip);
    if (!h.location.includes("/c/")) { line("TC-hold", "hold", h.post ? kindOf(h.post) : kindOf(h.sel), false); return; }
    await L.setV(A.tenant, [{ key: "trips.cancel.ladder", scope: "PRODUCT", scopeId: PTC.id, value: [{ fromDaysBefore: 7, refundPct: 100 }, { fromDaysBefore: 0, refundPct: 0 }] }]);
    const c = await req(h.location, { ip });
    const amounts = (c.body.match(/ยอดตอนถือที่|ยอดตอนนี้/g) ?? []).length;
    line("TC-page", "c/ ⇒ book-price-changed with the terms message (เงื่อนไข) · no old/new totals · rehold form", `${kindOf(c)} terms=${/เงื่อนไขการจองเปลี่ยน/.test(c.body)} oldNew=${amounts} form=${!!L.postForm(c.body)}`, testid(c.body, "book-price-changed") && /เงื่อนไข/.test(c.body) && amounts === 0 && !!L.postForm(c.body));
    void dTc;
  });
  // ═══ PROBE-EDIT (r1) W5: QR เฉพาะร้านเก็บเงิน · PENDING มีข้อความของตัวเอง ═══
  await guard("collect-pending", async () => {
    const ip = freshIp();
    const r = await L.bookHttp(A, PA, { d: L.addDays(today, 25), n: { ADULT: 1 } }, ip);
    if (!r.resPath) { info("collect", `booking failed ${r.why}`); return; }
    const tok = decodeURIComponent(r.resPath.split("/my/")[1]?.split("?")[0] ?? "");
    await L.q(`UPDATE "TripBooking" SET "collectMode" = 'AGENT' WHERE "publicTokenHash" = $1`, [L.sha256hex(tok)]);
    const p = await req(r.resPath, { ip });
    line("CM-agent", "agent-collected booking (collectMode AGENT · planted) ⇒ my/ has no PromptPay QR and not the 'no payment account' text", `${kindOf(p)} qr=${testid(p.body, "book-pay-qr")} noAccount=${testid(p.body, "book-pay-unavailable")}`, p.status === 200 && !testid(p.body, "book-pay-qr") && !testid(p.body, "book-pay-unavailable"));
    await L.q(`UPDATE "TripBooking" SET status = 'PENDING', "collectMode" = 'SHOP' WHERE "publicTokenHash" = $1`, [L.sha256hex(tok)]);
    const pp = await req(r.resPath, { ip });
    line("PD-page", "PENDING booking ⇒ its own notice (book-res-pending), not 'online booking unavailable'", `${kindOf(pp)} pending=${testid(pp.body, "book-res-pending")} unavailable=${testid(pp.body, "book-res-unavailable")}`, testid(pp.body, "book-res-pending") && !testid(pp.body, "book-res-unavailable") && !testid(pp.body, "book-pay-qr"));
    // PROBE-EDIT (r2 · มติ Y6): หน้า PENDING แสดงรหัสการจอง + ทางติดต่อร้าน (ชื่อร้าน) · ไม่สัญญาว่าร้านจะติดต่อ (ข้อความนอก <script>)
    const code = (await L.bookingsOf(A.tenant)).find((b) => b.publicTokenHash === L.sha256hex(tok))?.code ?? "?";
    const vt = L.visibleText(pp.body);
    line("PD-code", "PENDING page shows the booking code (book-res-code) + shop contact · no promise that the shop will contact you", `code=${code} codeShown=${vt.includes(code)} resCode=${testid(pp.body, "book-res-code")} shop=${vt.includes(A.name)} promise=${/ร้านจะ\s*(ติดต่อ|โทร|แจ้ง)|shop will (contact|call)/i.test(vt)}`,
      testid(pp.body, "book-res-code") && vt.includes(code) && vt.includes(A.name) && !/ร้านจะ\s*(ติดต่อ|โทร|แจ้ง)|shop will (contact|call)/i.test(vt));
  });

  // ═══ 12. staff booking opened on my/ ═══
  await guard("staff", async () => {
    const ctx = { tenantId: A.tenant, unitId: A.unit, channel: "COUNTER", actor: { kind: "STAFF", userId: A.owner }, now: new Date() };
    const lineReq = { productKind: "TRIP", unitId: A.unit, productId: PA.id, slotId: dStaff, optionId: PA.opt, pax: [{ paxTypeId: PA.pt.ADULT, qty: 2 }] };
    for (const method of ["PAY_LATER", "PAY_NOW"]) {
      const qt = await TR.quoteTrips?.(ctx, { lines: [lineReq] });
      const qv = (qt?.value ?? {}) as Rec;
      const h = await TR.holdTrips?.(ctx, { quote: { lines: [lineReq] }, quoteId: qv.quoteId, quoteExpiresAt: qv.expiresAt, idempotencyKey: `w12h_${L.hex(6)}` });
      const hv = (h?.value ?? {}) as Rec;
      const cf = await TR.confirmTrips?.(ctx, { holdIds: hv.holdIds, basketId: hv.basketId, quote: { lines: [lineReq] }, quoteId: qv.quoteId, idempotencyKey: `w12hc_${L.hex(6)}`, booker: { name: `พนักงานจอง ${L.hex(2)}`, phone: L.freshPhone() }, pay: { method } });
      const ref = (Array.isArray(cf?.value) ? cf.value[0] : null) as Rec | null;
      info("staff", `${method}: quote ${qt?.ok} hold ${h?.ok} ${h?.ok ? "" : JSON.stringify(h).slice(0, 160)} confirm ${cf?.ok} status=${ref?.status} token=${ref?.publicToken ? "yes" : "no"} ${cf?.ok ? "" : JSON.stringify(cf).slice(0, 200)}`);
      if (!ref?.publicToken) continue;
      const r = await req(`/book/${A.slug}/my/${String(ref.publicToken)}`, { ip: freshIp() });
      info("staff", `${method} my/: ${kindOf(r)} state-testids: ${["book-pay", "book-pay-qr", "book-voucher", "book-voucher-qr", "book-res-expired", "book-pay-unavailable", "book-res-unavailable", "book-error"].filter((t) => testid(r.body, t)).join(",")} code=${L.errCode(r.body)}`);
      known(`STAFF-${method}`, "staff COUNTER booking opened by its public token on my/ — page renders a state (shop-collected ⇒ QR allowed by W5)", `${kindOf(r)}`, r.status === 200, "informational");
    }
  });
} catch (e) {
  console.log(`ERROR top: ${String(e instanceof Error ? e.stack : e).slice(0, 800)}`);
} finally {
  await L.cleanup();
  L.summary(LABEL);
}

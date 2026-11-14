// probe-trips-w1.2-hunt-4 — HTTP: 404 shape normalised for the echoed URL (target 2) · replay/back button · TOO_FAST · seat caps · my/ TOO_LATE + EXPIRED (5/8) · counters after confirm
// PROBE-EDIT (r1 · มติ W1 W5): TOO_FAST = 1 วิ · W1: ถือที่เหลือ < 300 วิ ⇒ c/ และยืนยัน HOLD_EXPIRED ไม่มีการจอง (เดิม KNOWN) · TOO_LATE/EXPIRED ของ my/ ทำด้วยการเลื่อนเวลาถือในฐาน
//   (นาฬิกาเครื่องเดียวกับเซิร์ฟเวอร์ · ไม่ใช้ NOW() ของฐาน) แทนสินค้าถือ 1 นาที (ซึ่งตอนนี้จองไม่ได้ตามมติ W1)
import * as L from "./probe-trips-w1.2-hunt-lib.mjs";
const { line, known, info, guard, req, submit, kindOf, loc, testid, freshIp, sleep } = L;

L.boot("probe-w1.2-hunt-4");
const LABEL = "hunt-4";
try {
  await L.sweepStale();
  const today = L.ymdBkk(new Date());
  const A = await L.mkShop("a", { contact: { phone: "076-555-444", line: "@w12x", address: null } });
  const B = await L.mkShop("b");
  const PA = await L.mkProd(A, "A");
  const PX = await L.mkProd(A, "X");
  await L.setV(A.tenant, [{ key: "trips.sell.holdMinutes", scope: "PRODUCT", scopeId: PX.id, value: 1 }]);
  const PB = await L.mkProd(B, "B");
  const dA = await L.mkDep(PA, L.addDays(today, 20), { capacity: 20 });
  const dX = await L.mkDep(PX, L.addDays(today, 20), { capacity: 20 });
  const dLate = await L.mkDep(PA, L.addDays(today, 22), { capacity: 20 }); // PROBE-EDIT: W1 + TOO_LATE/EXPIRED
  const dA21 = await L.mkDep(PA, L.addDays(today, 21), { capacity: 20 });
  void dA21;
  await L.mkDep(PB, L.addDays(today, 20));

  // ═══ 2. 404 shape with the echoed URL removed ═══
  await guard("404-norm", async () => {
    const ip = freshIp();
    const r0 = await L.bookHttp(A, PA, { d: L.addDays(today, 20), n: { ADULT: 1 } }, ip);
    const tok = decodeURIComponent(r0.resPath.split("/my/")[1] ?? "");
    const rnd = () => Buffer.from(L.hex(32), "hex").toString("base64url").slice(0, 43);
    const cases: [string, string, string][] = [
      ["shop missing", `${L.SLUG}zz${L.STAMP}`, rnd()],
      ["token random", A.slug, rnd()],
      ["token A on B", B.slug, tok],
      ["token malformed", A.slug, "xyz"],
    ];
    const bodies: string[] = [];
    for (const [n, shop, t] of cases) {
      const path = `/book/${shop}/my/${t}`;
      const r = await req(path, { ip });
      const norm = r.body.split(shop).join("S").split(t).join("T").replace(/[A-Za-z0-9_-]{30,}/g, "#");
      bodies.push(norm);
      info("404-norm", `${n}: ${r.status} raw=${r.body.length} norm=${norm.length} ${r.ms.toFixed(0)}ms`);
    }
    const same = bodies.every((b) => b === bodies[0]);
    const diffAt = bodies.map((b) => { let i = 0; while (i < b.length && b[i] === bodies[0]?.[i]) i++; return i; });
    line("NF-norm", "after removing the echoed shop/token, all my/ 404 bodies are identical", `identical=${same} firstDiff=${diffAt.join(",")}`, same);
    if (!same) { const i = diffAt.find((x) => x < (bodies[0]?.length ?? 0)) ?? 0; info("404-norm", `diff context: «${bodies[0]?.slice(Math.max(0, i - 80), i + 80)}» vs «${bodies[bodies.findIndex((_, k) => diffAt[k] === i)]?.slice(Math.max(0, i - 80), i + 80)}»`); }
    // POST-action 404 body (notFound inside action) — what is in it
    const g = await L.openSelect(A, PA, { d: L.addDays(today, 20), n: { ADULT: 1 } }, freshIp());
    if (g.form) {
      const key = g.form.fields.find(([k]) => /^\$ACTION_\d+:1$/.test(k))?.[0] ?? "";
      const r = await submit(g.path, g.form.fields.map(([k, v]): [string, string] => (k === key ? [k, JSON.stringify(["nope", "nope"])] : [k, v])), freshIp());
      const leak = [A.name, A.slug, PA.slug, "ทัวร์ล่า"].filter((x) => r.body.includes(x));
      info("404-norm", `action 404: ${r.status} ${r.body.length}B title="${L.titleOf(r.body)}" content-type=${r.headers["content-type"]} leak=[${leak.join(",")}] head=${r.body.slice(0, 160).replace(/\s+/g, " ")}`);
      known("NF-action-shape", "action notFound() answers 404 with the same not-found page as GET (one shape)", `${r.status} ${r.body.length}B vs GET 404 ~258KB · leak=[${leak.join(",")}]`, r.status === 404 && r.body.length > 100_000, "different body from GET 404 (method differs; informational)");
    }
  });

  // ═══ replay / back button / TOO_FAST / caps ═══
  await guard("replay", async () => {
    const ip = freshIp();
    const g = await L.openSelect(A, PA, { d: L.addDays(today, 20), n: { ADULT: 2 } }, ip);
    if (!g.form) return;
    // PROBE-EDIT (W5): เพดาน 1 วิ — ส่งทันทีหลังเปิดหน้า (อาจข้ามขอบวินาที ⇒ ลองได้ 3 หน้า)
    let fast = await submit(g.path, g.form.fields, ip);
    for (let i = 0; i < 2 && !loc(fast).includes("e=TOO_FAST"); i++) { const gg = await L.openSelect(A, PA, { d: L.addDays(today, 21), n: { ADULT: 1 } }, freshIp()); if (gg.form) fast = await submit(gg.path, gg.form.fields, ip); }
    line("RP-toofast", "hold submitted right after the page (< 1 s) ⇒ e=TOO_FAST, no hold", `${/e=([A-Z_]+)/.exec(loc(fast))?.[1] ?? kindOf(fast)}`, loc(fast).includes("e=TOO_FAST"));
    await sleep(L.FORM_WAIT);
    const h1 = await submit(g.path, g.form.fields, ip);
    const c = await L.openCheckout(loc(h1), ip);
    if (!c.form) { info("replay", `no checkout ${kindOf(h1)}`); return; }
    await sleep(L.FORM_WAIT);
    const cf = await submit(loc(h1), L.bookerFields(c.form), ip);
    const my = loc(cf);
    const d0 = await L.depRow(dA);
    const n0 = (await L.bookingsOf(A.tenant)).length;
    // back button: re-POST the hold form and the confirm form
    const h2 = await submit(g.path, g.form.fields, ip);
    const h2c = loc(h2).includes("/c/") ? await req(loc(h2), { ip }) : null;
    const cf2 = await submit(loc(h1), L.bookerFields(c.form), freshIp());
    const d1 = await L.depRow(dA);
    const n1 = (await L.bookingsOf(A.tenant)).length;
    info("replay", `re-hold: ${kindOf(h2)} → ${h2c ? kindOf(h2c) : "-"} · re-confirm: ${kindOf(cf2)}`);
    line("RP-back", "re-POST of hold + confirm after booking ⇒ same my/ (DONE), no 2nd hold/booking, counters unchanged", `bookings ${n0}→${n1} held ${d0?.held}→${d1?.held} sold ${d0?.sold}→${d1?.sold} same=${loc(cf2) === my}`, n1 === n0 && d1?.held === d0?.held && d1?.sold === d0?.sold && loc(cf2) === my);
    info("replay", `counters after one 2-seat HOLD booking: ${JSON.stringify(d1)}`);
  });
  await guard("caps", async () => {
    for (const [tag, n] of [["11 people", { ADULT: 10, INFANT: 1 }], ["infant only", { INFANT: 1 }], ["qty 999", { ADULT: 999 }], ["unknown code", { ADULT: 1, VIP: 1 }]] as const) {
      const ip = freshIp();
      const g = await L.openSelect(A, PA, { d: L.addDays(today, 20), n }, ip);
      const fields: [string, string][] = g.form ? g.form.fields : [];
      info("caps", `${tag}: page ${kindOf(g.r)} form=${!!g.form}`);
      if (!g.form) {
        // forge from a valid page
        const v = await L.openSelect(A, PA, { d: L.addDays(today, 20), n: { ADULT: 1 } }, ip);
        if (!v.form) continue;
        fields.push(...v.form.fields.filter(([k]) => !k.startsWith("n.")), ...Object.entries(n).map(([k, x]): [string, string] => [`n.${k}`, String(x)]));
      }
      await sleep(L.FORM_WAIT);
      const before = (await L.holdsOf(dA)).length;
      const r = await submit(g.path, fields, ip);
      const after = (await L.holdsOf(dA)).length;
      line(`CAP-${tag}`, "refused (INVALID), no hold", `${/e=([A-Z_]+)/.exec(loc(r))?.[1] ?? kindOf(r)} +${after - before}`, after === before && !loc(r).includes("/c/"));
    }
  });

  // ═══ PROBE-EDIT (r1) W1: hold usable only while ≥ 300 s remain · my/ TOO_LATE then EXPIRED (hold time moved in the DB with the machine clock) ═══
  const moveHold = async (bt: string, msFromNow: number) => L.q(`UPDATE "TripHold" SET "expiresAt" = $2 WHERE "basketId" IN (SELECT id FROM "SellBasket" WHERE "publicTokenHash" = $1) AND status = 'ACTIVE'`, [L.sha256hex(bt), new Date(Date.now() + msFromNow)]);
  const basketOfLoc = (l: string) => decodeURIComponent(l.split("/c/")[1]?.split("?")[0] ?? "");
  await guard("w1", async () => {
    // 1-minute hold product: the hold itself works but can never reach a booking (W1)
    const ip = freshIp();
    const r = await L.bookHttp(A, PX, { d: L.addDays(today, 20), n: { ADULT: 1 } }, ip);
    line("W1-short", "1-minute hold ⇒ c/ HOLD_EXPIRED (+ rehold) · no booking", `${r.why || "booked"} code=${r.checkout ? L.errCode(r.checkout.body) : "-"} rehold=${r.checkout ? testid(r.checkout.body, "book-rehold") : "-"}`, !r.resPath && !!r.checkout && L.errCode(r.checkout.body) === "HOLD_EXPIRED");
    void dX;
    // 15-minute hold, opened c/, then time moved to 290 s left ⇒ c/ and confirm HOLD_EXPIRED · 400 s left ⇒ form back
    const ip2 = freshIp();
    const h = await L.holdHttp(A, PA, { d: L.addDays(today, 22), n: { ADULT: 1 } }, ip2);
    if (!h.location.includes("/c/")) { info("w1", `hold failed ${h.post ? kindOf(h.post) : ""}`); return; }
    const c = await L.openCheckout(h.location, ip2);
    if (!c.form) { info("w1", `no checkout form ${kindOf(c.r)}`); return; }
    await moveHold(basketOfLoc(h.location), 290_000);
    const c2 = await req(h.location, { ip: ip2 });
    await sleep(L.FORM_WAIT);
    const n0 = (await L.bookingsOf(A.tenant)).length;
    const cf = await submit(h.location, L.bookerFields(c.form), ip2);
    const n1 = (await L.bookingsOf(A.tenant)).length;
    line("W1-c", "290 s left ⇒ c/ HOLD_EXPIRED + rehold, no form", `code=${L.errCode(c2.body)} rehold=${testid(c2.body, "book-rehold")} form=${testid(c2.body, "book-pay-submit")}`, L.errCode(c2.body) === "HOLD_EXPIRED" && !testid(c2.body, "book-pay-submit"));
    line("W1-confirm", "290 s left ⇒ confirm e=HOLD_EXPIRED, no booking", `${kindOf(cf)} bookings +${n1 - n0}`, loc(cf).includes("e=HOLD_EXPIRED") && n1 === n0);
    await moveHold(basketOfLoc(h.location), 400_000);
    const c3 = await req(h.location, { ip: ip2 });
    line("W1-ok", "400 s left ⇒ c/ shows the booker form", `${kindOf(c3)} form=${testid(c3.body, "book-pay-submit")}`, testid(c3.body, "book-pay-submit"));
  });
  await guard("late", async () => {
    const ip = freshIp();
    const h = await L.holdHttp(A, PA, { d: L.addDays(today, 22), n: { ADULT: 1 } }, ip);
    const c = h.location.includes("/c/") ? await L.openCheckout(h.location, ip) : null;
    if (!c?.form) { info("late", `no checkout ${c ? kindOf(c.r) : "-"}`); return; }
    await sleep(L.FORM_WAIT);
    const cf = await submit(h.location, L.bookerFields(c.form), ip);
    const resPath = loc(cf);
    if (!resPath.includes("/my/")) { info("late", `booking failed ${kindOf(cf)}`); return; }
    const p0 = await req(resPath, { ip });
    line("LATE-qr", "right after confirm (≈15 min left) ⇒ PAY with QR (not TOO_LATE)", `qr=${testid(p0.body, "book-pay-qr")} tooLate=${testid(p0.body, "book-pay-too-late")}`, testid(p0.body, "book-pay-qr") && !testid(p0.body, "book-pay-too-late"));
    await moveHold(basketOfLoc(h.location), 120_000);
    const p = await req(resPath, { ip });
    line("LATE-tooLate", "my/ with < 3 min left ⇒ book-pay-too-late, no QR", `tooLate=${testid(p.body, "book-pay-too-late")} qr=${testid(p.body, "book-pay-qr")}`, testid(p.body, "book-pay-too-late") && !testid(p.body, "book-pay-qr"));
    await moveHold(basketOfLoc(h.location), -60_000);
    const e = await req(resPath, { ip });
    const contact = ["076-555-444", "@w12x"].filter((x) => e.body.includes(x));
    line("LATE-expired", "after hold time ⇒ EXPIRED + shop contact, no QR (sweeper not run)", `expired=${testid(e.body, "book-res-expired")} contact=[${contact.join(",")}] qr=${testid(e.body, "book-pay-qr")}`, testid(e.body, "book-res-expired") && contact.length === 2 && !testid(e.body, "book-pay-qr"));
    void dLate;
  });
} catch (e) {
  console.log(`ERROR top: ${String(e instanceof Error ? e.stack : e).slice(0, 800)}`);
} finally {
  await L.cleanup();
  L.summary(LABEL);
}

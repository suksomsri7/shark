// probe-trips-w1.2-hunt-3 — HTTP: races (target 9) · same-time slots / stale slot ref (10) · dangerous booker input (11) · rate gates (13)
// PROBE-EDIT (r2 · มติ Y1 Y5): ถือหมดเวลาด้วยการเลื่อนเวลาในฐาน (สินค้าถือ 1 นาทีถือไม่ได้แล้ว) · ถือถี่เกิน ⇒ e=HOLD_LIMITED + ข้อความแยกจากข้อความกลาง
// PROBE-EDIT (r1 · มติ W2 W5 W7): ตัวอ้างรอบ `t` = ref ของ id รอบ (W5) แทน "0800-2" · ลบรอบหลังเปิดหน้า ⇒ คาด SLOT_CLOSED (W7) · เพดานถือต่อรอบ 3 + ส่งซ้ำไม่นับ (W2) ·
//   R9c-back เป็น KNOWN (เซิร์ฟเวอร์ QC ไม่รันงานรายนาที trips.expireHolds — หนี้ที่รับในมติ)
import * as L from "./probe-trips-w1.2-hunt-lib.mjs";
const { line, known, info, guard, req, submit, kindOf, loc, testid, freshIp, sleep } = L;

L.boot("probe-w1.2-hunt-3");
const LABEL = "hunt-3";
try {
  await L.sweepStale();
  const today = L.ymdBkk(new Date());
  const A = await L.mkShop("a", { contact: { phone: "076-333-777", line: "@w12h3", address: null } }); // PROBE-EDIT: ข้อความถือถี่เกินต้องมีทางติดต่อร้าน (W2)
  const PA = await L.mkProd(A, "A");
  // PROBE-EDIT (r2 · มติ Y1): สินค้าถือ 1 นาทีถือไม่ได้แล้ว (HOLD_TOO_SHORT) ⇒ ใช้เวลาถือปกติ แล้วเลื่อนเวลาหมดถือในฐานด้วยนาฬิกาเครื่อง (= นาฬิกาเซิร์ฟเวอร์ QC บนเครื่องเดียวกัน)
  const PX = await L.mkProd(A, "X");
  const PO = await L.mkProd(A, "O", { opts: 3 });
  const dRaceC = await L.mkDep(PA, L.addDays(today, 20), { capacity: 40 });
  const dRace12 = await L.mkDep(PA, L.addDays(today, 21), { capacity: 12 });
  const dExp = await L.mkDep(PX, L.addDays(today, 20), { capacity: 3 });
  const dIn = await L.mkDep(PA, L.addDays(today, 22), { capacity: 40 });
  const dRl: string[] = [];
  for (let i = 0; i < 6; i++) dRl.push(await L.mkDep(PA, L.addDays(today, 30 + i), { capacity: 40 }));
  // same-time slots: day S = 3 departures at 08:00 (options 1,2,3) · day T = 08:00 + 13:00
  const DS = L.addDays(today, 25), DT = L.addDays(today, 26);
  const s1 = await L.mkDep(PO, DS, { opt: PO.opts[0] });
  await sleep(5);
  const s2 = await L.mkDep(PO, DS, { opt: PO.opts[1] });
  await sleep(5);
  const s3 = await L.mkDep(PO, DS, { opt: PO.opts[2] });
  const t8 = await L.mkDep(PO, DT, { hm: "08:00" });
  const t13 = await L.mkDep(PO, DT, { hm: "13:00" });
  const dSlot = await L.mkDep(PA, L.addDays(today, 40), { capacity: 40 }); // PROBE-EDIT: ถังต่อรอบ (W2)
  const DSL = L.addDays(today, 40);

  // ═══ 9a. 10 concurrent confirms on one basket ═══
  for (const flavor of ["same-nonce", "distinct-nonces"] as const) {
    await guard(`race-confirm-${flavor}`, async () => {
      const ip = freshIp();
      const h = await L.holdHttp(A, PA, { d: L.addDays(today, 20), n: { ADULT: 1 } }, ip);
      if (!h.location.includes("/c/")) { line(`R9a-${flavor}`, "hold", h.post ? kindOf(h.post) : "", false); return; }
      const forms: L.Form[] = [];
      for (let i = 0; i < (flavor === "same-nonce" ? 1 : 10); i++) { const c = await L.openCheckout(h.location, ip); if (c.form) forms.push(c.form); }
      await sleep(L.FORM_WAIT);
      const phone = L.freshPhone();
      const before = (await L.bookingsOf(A.tenant)).length;
      const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => submit(h.location, L.bookerFields(forms[flavor === "same-nonce" ? 0 : i] as L.Form, { name: "แข่ง ยืนยัน", phone }), freshIp())));
      const after = (await L.bookingsOf(A.tenant)).length;
      const locs = new Set(rs.map((r) => (loc(r).includes("/my/") ? loc(r) : kindOf(r))));
      line(`R9a-${flavor}`, "10 concurrent confirms ⇒ exactly 1 booking, every answer → same my/ (or a coded error), no 5xx", `bookings +${after - before} · outcomes: ${[...locs].map((x) => x.slice(0, 70)).join(" | ")}`, after - before === 1 && rs.every((r) => r.status < 500));
    });
  }
  // ═══ 9b. 30 devices hold 1 seat on a 12-seat departure ═══
  await guard("race-hold", async () => {
    const ips = Array.from({ length: 30 }, () => freshIp());
    const pages = await Promise.all(ips.map((ip) => L.openSelect(A, PA, { d: L.addDays(today, 21), n: { ADULT: 1 } }, ip)));
    await sleep(L.FORM_WAIT);
    const rs = await Promise.all(pages.map((p, i) => (p.form ? submit(p.path, p.form.fields, ips[i] ?? null) : Promise.resolve(null))));
    const okN = rs.filter((r) => r && loc(r).includes("/c/")).length;
    const codes = rs.map((r) => (r ? (loc(r).includes("/c/") ? "OK" : /e=([A-Z_]+)/.exec(loc(r))?.[1] ?? `${r.status}`) : "noform"));
    const d = await L.depRow(dRace12);
    const hs = await L.q<{ s: number }>(`SELECT COALESCE(sum("qtyPublic"),0)::int AS s FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE'`, [dRace12]);
    const tally: Record<string, number> = {};
    for (const c of codes) tally[c] = (tally[c] ?? 0) + 1;
    line("R9b", "exactly 12 holds succeed, held = 12 = Σ active holds, rest SOLD_OUT, no 5xx", `ok=${okN} held=${d?.held} Σ=${hs[0]?.s} codes=${JSON.stringify(tally)}`, okN === 12 && d?.held === 12 && hs[0]?.s === 12 && rs.every((r) => !r || r.status < 500));
  });
  // ═══ 9c. hold expires ⇒ seats come back ═══
  await guard("expire", async () => {
    const ips = [freshIp(), freshIp(), freshIp()];
    const hs = [];
    for (const ip of ips) hs.push(await L.holdHttp(A, PX, { d: L.addDays(today, 20), n: { ADULT: 1 } }, ip));
    const okN = hs.filter((h) => h.location.includes("/c/")).length;
    const ipN = freshIp();
    const full = await L.holdHttp(A, PX, { d: L.addDays(today, 20), n: { ADULT: 1 } }, ipN);
    info("expire", `3/3 holds ok=${okN} · 4th: ${full.post ? kindOf(full.post) : kindOf(full.sel)} (expect SOLD_OUT)`);
    for (const h of hs) { const bt = decodeURIComponent(h.location.split("/c/")[1]?.split("?")[0] ?? ""); if (bt) await L.q(`UPDATE "TripHold" SET "expiresAt" = $2 WHERE "basketId" IN (SELECT id FROM "SellBasket" WHERE "publicTokenHash" = $1) AND status = 'ACTIVE'`, [L.sha256hex(bt), new Date(Date.now() - 60_000)]); }
    const c = await req(hs[0]?.location ?? "/", { ip: ips[0] });
    info("expire", `c/ after hold time moved 1 min into the past: ${kindOf(c)} code=${L.errCode(c.body)}`);
    line("R9c-c", "c/ of expired hold ⇒ HOLD_EXPIRED", `code=${L.errCode(c.body)}`, L.errCode(c.body) === "HOLD_EXPIRED");
    const again = await L.holdHttp(A, PX, { d: L.addDays(today, 20), n: { ADULT: 3 } }, freshIp());
    const d = await L.depRow(dExp);
    known("R9c-back", "after expiry a new device can hold all 3 seats again", `${again.post ? kindOf(again.post) : kindOf(again.sel)} held=${d?.held}`, again.location.includes("/c/"), "QC server does not run the per-minute trips.expireHolds job (accepted debt in rulings) — seats return when the sweeper runs");
  });

  // ═══ 10. same-time slots / stale slot reference — PROBE-EDIT (มติ W5 W7): t = ref ของ id รอบ · ห้ามถอยไปถือรอบอื่น ═══
  await guard("slots", async () => {
    const ip = freshIp();
    const ref2 = L.slotRef(A.tenant, s2);
    const g = await L.openSelect(A, PO, { d: DS, t: ref2, n: { ADULT: 1 } }, ip);
    const refsOnPage = L.slotRefsIn(g.r.body);
    info("slots", `select t=ref(s2): ${kindOf(g.r)} form=${!!g.form} t=${g.form ? L.fieldOf(g.form, "t") : "-"} · refs on page ${refsOnPage.length} (s2 listed=${refsOnPage.includes(ref2)})`);
    line("SL-ref", "slot refs on the page are 12-char a-z2-7, distinct per run · the chosen run's ref is in the form", `refs=${refsOnPage.length} formT=${g.form ? L.fieldOf(g.form, "t") : "-"}`, refsOnPage.length >= 3 && new Set(refsOnPage).size === refsOnPage.length && (!g.form || L.fieldOf(g.form, "t") === ref2));
    if (!g.form) return;
    await L.q(`DELETE FROM "TripDeparture" WHERE id = $1`, [s1]); // shop removes the first 08:00 run between page and hold
    await sleep(L.FORM_WAIT);
    const r = await submit(g.path, g.form.fields, ip);
    const held = await L.q<{ departureId: string }>(`SELECT "departureId" FROM "TripHold" WHERE "tenantId" = $1 AND "departureId" = ANY($2)`, [A.tenant, [s2, s3]]);
    const where = held.map((h) => (h.departureId === s2 ? "s2 (option 2 = chosen)" : "s3 (option 3 = NOT chosen)")).join(",");
    line("SL-shift", "hold lands on the run the customer chose (option 2) even after another run was removed", `${kindOf(r)} held on ${where || "none"}`, held.some((h) => h.departureId === s2) && !held.some((h) => h.departureId === s3));
    // stale ref: chosen 08:00, shop removes it, 13:00 remains ⇒ SLOT_CLOSED (W7)
    const ip2 = freshIp();
    const g2 = await L.openSelect(A, PO, { d: DT, t: L.slotRef(A.tenant, t8), n: { ADULT: 1 } }, ip2);
    if (!g2.form) return;
    await L.q(`DELETE FROM "TripDeparture" WHERE id = $1`, [t8]);
    await sleep(L.FORM_WAIT);
    const r2 = await submit(g2.path, g2.form.fields, ip2);
    const h2 = await L.q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripHold" WHERE "departureId" = $1`, [t13]);
    line("SL-fallback", "stale slot ref (08:00 removed) ⇒ e=SLOT_CLOSED back to the product page, not silently held on 13:00", `${kindOf(r2)} holds on 13:00=${h2[0]?.n}`, h2[0]?.n === 0 && loc(r2).includes("e=SLOT_CLOSED"));
    // old HHMM ref from a page left open before the change ⇒ SLOT_CLOSED (W7)
    const g3 = await L.openSelect(A, PO, { d: DT, n: { ADULT: 1 } }, ip2);
    if (g3.form) {
      await sleep(L.FORM_WAIT);
      const r3 = await submit(g3.path, g3.form.fields.map(([k, v]): [string, string] => (k === "t" ? [k, "1300"] : [k, v])), ip2);
      const h3 = await L.q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripHold" WHERE "departureId" = $1`, [t13]);
      line("SL-hhmm", "old HHMM t=1300 posted ⇒ e=SLOT_CLOSED, no hold", `${kindOf(r3)} holds on 13:00=${h3[0]?.n}`, loc(r3).includes("e=SLOT_CLOSED") && h3[0]?.n === 0);
    }
    // GET with an unknown t ⇒ page opens on the first sellable run (no error)
    const g4 = await L.openSelect(A, PO, { d: DT, t: L.slotRef(A.tenant, t8), n: { ADULT: 1 } }, freshIp());
    line("SL-get", "GET with a ref that no longer exists ⇒ 200 product page, first sellable run (13:00) selected", `${kindOf(g4.r)} formT=${g4.form ? L.fieldOf(g4.form, "t") : "-"}`, g4.r.status === 200 && !!g4.form && L.fieldOf(g4.form, "t") === L.slotRef(A.tenant, t13));
  });

  // ═══ PROBE-EDIT (r1) W2: ถังต่อรอบต่อเครื่อง 3/ชม. · ส่งซ้ำ nonce เดิมไม่นับ · ข้อความถือถี่เกินมีทางติดต่อร้าน ═══
  await guard("slot-bucket", async () => {
    const ip = freshIp();
    const first = await L.openSelect(A, PA, { d: DSL, n: { ADULT: 1 } }, ip);
    if (!first.form) { info("slot-bucket", `no form ${kindOf(first.r)}`); return; }
    await sleep(L.FORM_WAIT);
    const r1 = await submit(first.path, first.form.fields, ip);
    const again = [];
    for (let i = 0; i < 5; i++) again.push(await submit(first.path, first.form.fields, ip));
    const d1 = await L.depRow(dSlot);
    line("SB-resend", "re-POST of the same hold form ×5 ⇒ same /c/ location every time, held stays 1", `held=${d1?.held} same=${again.every((r) => loc(r) === loc(r1))}`, loc(r1).includes("/c/") && again.every((r) => loc(r) === loc(r1)) && d1?.held === 1);
    const codes: string[] = [];
    let lastLoc = "";
    for (let i = 0; i < 3; i++) {
      const g = await L.openSelect(A, PA, { d: DSL, n: { ADULT: 1 } }, ip);
      if (!g.form) { codes.push(`noform:${kindOf(g.r)}`); continue; }
      await sleep(L.FORM_WAIT);
      const r = await submit(g.path, g.form.fields, ip);
      lastLoc = loc(r);
      codes.push(lastLoc.includes("/c/") ? "OK" : /e=([A-Z_]+)/.exec(lastLoc)?.[1] ?? `${r.status}`);
    }
    const d2 = await L.depRow(dSlot);
    // PROBE-EDIT (r2 · มติ Y5): ถังต่อรอบเต็มจริง ⇒ e=HOLD_LIMITED (แยกจาก RATE_LIMITED ของถังอ่าน/ด่านล่ม)
    line("SB-cap", "after the resends: 3 new holds ⇒ OK,OK,HOLD_LIMITED (held 3) — 4th new basket on the same run/device limited", `${codes.join(",")} held=${d2?.held}`, codes.join(",") === "OK,OK,HOLD_LIMITED" && d2?.held === 3);
    if (lastLoc && !lastLoc.includes("/c/")) {
      const p = await req(lastLoc, { ip });
      // PROBE-EDIT (คัดแยก): "รอสักครู่" ที่เจอมาจากคลังข้อความของระบบอื่น (POS/จอลูกค้า/บัญชี) ใน <script> RSC payload ไม่ใช่ข้อความที่ลูกค้าเห็น ⇒ ตรวจเฉพาะข้อความนอก <script>
      const txt = L.visibleText(p.body);
      const hlAttr = /data-hold-limited="true"/.test(p.body);
      line("SB-msg", "e=HOLD_LIMITED page: the 'held too often' message (data-hold-limited) + shop contact, not 'wait a moment'", `${kindOf(p)} holdLimited=${hlAttr} contact=${txt.includes("076-333-777") || txt.includes("@w12h3")} later=${/ภายหลัง|later/i.test(txt)} wait=${/รอสักครู่/.test(txt)}`, hlAttr && (txt.includes("076-333-777") || txt.includes("@w12h3")) && /ภายหลัง|later/i.test(txt) && !/รอสักครู่/.test(txt));
      // มติ Y5: e=RATE_LIMITED (ถังอ่าน/ด่านล่ม) บนหน้าเดียวกัน ⇒ ข้อความกลาง (ไม่ใช่ข้อความถือถี่เกิน) · ค่า e นอกรายการถูกทิ้ง
      const pr = await req(lastLoc.replace("e=HOLD_LIMITED", "e=RATE_LIMITED"), { ip: freshIp() });
      const tr = L.visibleText(pr.body);
      line("SB-msg-neutral", "e=RATE_LIMITED ⇒ neutral 'cannot hold right now' message (data-hold-limited=false) + shop contact · different text from HOLD_LIMITED", `holdLimited=${/data-hold-limited="(\w+)"/.exec(pr.body)?.[1]} contact=${tr.includes("076-333-777") || tr.includes("@w12h3")} same=${tr === txt}`, /data-hold-limited="false"/.test(pr.body) && (tr.includes("076-333-777") || tr.includes("@w12h3")) && !/รอสักครู่/.test(tr) && tr !== txt);
      const pj = await req(lastLoc.replace("e=HOLD_LIMITED", "e=HOLD_LIMITED%3Cx%3E"), { ip: freshIp() });
      line("SB-msg-junk", "e outside the allow-list ⇒ no error box, value not reflected", `error=${testid(pj.body, "book-error")} reflect=${L.visibleText(pj.body).includes("<x>")}`, !testid(pj.body, "book-error") && !L.visibleText(pj.body).includes("<x>"));
    }
    const other = await L.holdHttp(A, PA, { d: L.addDays(today, 35), n: { ADULT: 1 } }, ip);
    line("SB-otherrun", "same device still holds another run", other.post ? kindOf(other.post) : kindOf(other.sel), other.location.includes("/c/"));
  });

  // ═══ 11. dangerous booker input ═══
  await guard("input", async () => {
    const mark = `ZQX${L.hex(4)}`;
    const ip = freshIp();
    const h = await L.holdHttp(A, PA, { d: L.addDays(today, 22), n: { ADULT: 1 } }, ip);
    if (!h.location.includes("/c/")) return;
    const c = await L.openCheckout(h.location, ip);
    if (!c.form) return;
    await sleep(L.FORM_WAIT);
    const bad: [string, { name?: string; phone?: string; email?: string }, string][] = [
      ["name RLO", { name: `‮${mark}rlo` }, "name"],
      ["name NUL", { name: `${mark}\u0000nul` }, "name"],
      ["name ZWSP", { name: `${mark}​zw` }, "name"],
      ["name 5000", { name: `${mark}${"ก".repeat(5000)}` }, "name"],
      ["name 101", { name: `${mark}${"a".repeat(94)}` }, "name"],
      ["name blank", { name: "   " }, "name"],
      ["phone 0066", { phone: "0066812345678" }, "phone"],
      ["phone letters", { phone: `08${mark}` }, "phone"],
      ["phone fullwidth", { phone: "０８１２３４５６７８" }, "phone"],
      ["phone short", { phone: "0812345" }, "phone"],
      ["phone +16 digits", { phone: "+1234567890123456" }, "phone"],
      ["email CRLF", { email: `a${mark}@b.co\r\nBcc: x@y.z` }, "email"],
      ["email 201", { email: `${mark}${"a".repeat(190)}@b.co` }, "email"],
      ["email no tld", { email: `${mark}@localhost` }, "email"],
    ];
    const before = (await L.bookingsOf(A.tenant)).length;
    for (const [tag, b, f] of bad) {
      const r = await submit(h.location, L.bookerFields(c.form, b), freshIp());
      const l = loc(r);
      const refl = l.includes(mark) || l.includes(encodeURIComponent(mark)) || r.body.includes(mark);
      line(`IN-${tag}`, `INVALID f=${f} · no value in Location/body`, `${kindOf(r).slice(0, 40)} e=${/e=([A-Z_]+)/.exec(l)?.[1]} f=${/f=([a-z,%2C]+)/.exec(l)?.[1]} reflect=${refl}`, /e=INVALID/.test(l) && new RegExp(`f=[^&]*${f}`).test(l) && !refl);
    }
    line("IN-nobooking", "no booking from invalid input", `+${(await L.bookingsOf(A.tenant)).length - before}`, (await L.bookingsOf(A.tenant)).length === before);
    // valid-but-dangerous values (each on its own basket)
    const good: [string, { name?: string; phone?: string; email?: string }, string][] = [
      ["name <script>", { name: `<script>alert('${mark}s')</script>` }, ""],
      ["name CSV", { name: `=HYPERLINK("http://x/${mark}c","x")` }, ""],
      ["phone +66 0", { phone: "+66 0812345679" }, "+66812345679"],
      ["phone +1", { phone: "+1 415 555 0100" }, "+14155550100"],
      ["phone dashes", { phone: "(081)-234-5670" }, "+66812345670"],
      ["email upper", { email: `UP${mark}@Example.COM` }, ""],
    ];
    for (const [tag, b, wantPhone] of good) {
      const ip2 = freshIp();
      const r = await L.bookHttp(A, PA, { d: L.addDays(today, 22), n: { ADULT: 1 } }, ip2, { name: b.name ?? `ปกติ ${mark}`, phone: b.phone ?? L.freshPhone(), email: b.email });
      const l = r.confirm ? loc(r.confirm) : "";
      const page = r.resPath ? await req(r.resPath, { ip: ip2 }) : null;
      const refl = l.includes(mark) || !!page?.body.includes(mark);
      const party = await L.q<{ name: string; phone: string | null; email: string | null }>(`SELECT p.name, p.phone, p.email FROM "TripBooking" b JOIN "Party" p ON p.id = b."bookerPartyId" WHERE b."tenantId" = $1 ORDER BY b."createdAt" DESC LIMIT 1`, [A.tenant]);
      info("input", `${tag}: ${r.resPath ? "booked" : r.why} party=${JSON.stringify(party[0] ?? null).slice(0, 140)}`);
      line(`IN-ok-${tag}`, `accepted · not reflected in Location/my/${wantPhone ? ` · Party.phone ${wantPhone}` : ""}`, `booked=${!!r.resPath} reflect=${refl} phone=${party[0]?.phone}`, !!r.resPath && !refl && (!wantPhone || party[0]?.phone === wantPhone));
    }
    // marker must not appear in ops/audit/outbox/bucket keys
    const ops = await L.q<{ n: number }>(`SELECT count(*)::int AS n FROM "OpsEvent" WHERE message LIKE $1 OR detail LIKE $1`, [`%${mark}%`]);
    const aud = await L.q<{ n: number; a: string | null }>(`SELECT count(*)::int AS n, max(action) AS a FROM "AuditLog" WHERE "tenantId" = $2 AND (before::text LIKE $1 OR after::text LIKE $1 OR "targetId" LIKE $1)`, [`%${mark}%`, A.tenant]);
    const out = await L.q<{ n: number; t: string | null }>(`SELECT count(*)::int AS n, max(type) AS t FROM "OutboxEvent" WHERE "tenantId" = $2 AND payload::text LIKE $1`, [`%${mark}%`, A.tenant]);
    const bk = await L.q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, [`%${mark}%`]);
    const phones = await L.q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE '%+66812345679%' OR key LIKE '%0812345679%'`);
    line("IN-logs", "booker marker absent from OpsEvent / AuditLog / OutboxEvent / bucket keys", `ops=${ops[0]?.n} audit=${aud[0]?.n}(${aud[0]?.a}) outbox=${out[0]?.n}(${out[0]?.t}) buckets=${bk[0]?.n} phoneBuckets=${phones[0]?.n}`, ops[0]?.n === 0 && aud[0]?.n === 0 && out[0]?.n === 0 && bk[0]?.n === 0 && phones[0]?.n === 0);
  });

  // ═══ 13. rate gates ═══
  await guard("noip", async () => {
    const ip = freshIp();
    const h = await L.holdHttp(A, PA, { d: L.addDays(today, 30), n: { ADULT: 1 } }, ip);
    const pages: [string, string][] = [["product", `/book/${A.slug}/t/${PA.slug}?d=${L.addDays(today, 30)}&n.ADULT=1`], ["c/", h.location], ["index", `/book/${A.slug}`]];
    for (const [n, p] of pages) {
      if (!p) continue;
      const r = await req(p, { ip: null });
      line(`RL-noip-${n}`, "no IP header ⇒ closed (rate-limited page, no form)", `${kindOf(r)} form=${!!L.postForm(r.body)}`, testid(r.body, "book-rate-limited") && !L.postForm(r.body));
    }
    const g = await L.openSelect(A, PA, { d: L.addDays(today, 31), n: { ADULT: 1 } }, freshIp());
    if (g.form) {
      await sleep(L.FORM_WAIT);
      const before = (await L.holdsOf(dRl[1] ?? "")).length;
      const r = await submit(g.path, g.form.fields, null);
      const after = (await L.holdsOf(dRl[1] ?? "")).length;
      line("RL-noip-hold", "POST hold without IP header ⇒ no hold", `${kindOf(r)} +${after - before}`, after === before && !loc(r).includes("/c/"));
    }
    if (h.location.includes("/c/")) {
      const c = await L.openCheckout(h.location, ip);
      if (c.form) {
        await sleep(L.FORM_WAIT);
        const before = (await L.bookingsOf(A.tenant)).length;
        const r = await submit(h.location, L.bookerFields(c.form), null);
        line("RL-noip-confirm", "POST confirm without IP header ⇒ no booking", `${kindOf(r)} +${(await L.bookingsOf(A.tenant)).length - before}`, (await L.bookingsOf(A.tenant)).length === before);
      }
    }
  });
  await guard("hold-bucket", async () => {
    const ip = freshIp();
    const plan = Array.from({ length: 11 }, (_, i) => L.addDays(today, 30 + Math.floor(i / 2)));
    const pages = [];
    for (const d of plan) pages.push(await L.openSelect(A, PA, { d, n: { ADULT: 1 } }, ip));
    await sleep(L.FORM_WAIT);
    const rs = [];
    for (const p of pages) rs.push(p.form ? await submit(p.path, p.form.fields, ip) : null);
    const codes = rs.map((r) => (r ? (loc(r).includes("/c/") ? "OK" : /e=([A-Z_]+)/.exec(loc(r))?.[1] ?? `${r.status}`) : "noform"));
    line("RL-hold-X8", "same device, 11 holds over 6 runs (≤2 per run) ⇒ 10 OK then HOLD_LIMITED (ถังถือต่อเครื่องเต็มจริง · มติ Y5)", codes.join(","), codes.filter((c) => c === "OK").length === 10 && codes[10] === "HOLD_LIMITED");
    const other = await L.holdHttp(A, PA, { d: L.addDays(today, 35), n: { ADULT: 1 } }, freshIp());
    line("RL-hold-other", "another device still holds", other.post ? kindOf(other.post) : kindOf(other.sel), other.location.includes("/c/"));
  });
  await guard("confirm-bucket", async () => {
    const ip = freshIp();
    const h = await L.holdHttp(A, PA, { d: L.addDays(today, 22), n: { ADULT: 1 } }, ip);
    const c = h.location ? await L.openCheckout(h.location, ip) : null;
    if (!c?.form) return;
    await sleep(L.FORM_WAIT);
    const codes: string[] = [];
    for (let i = 0; i < 21; i++) { const r = await submit(h.location, L.bookerFields(c.form, { accept: false }), ip); codes.push(/e=([A-Z_]+)/.exec(loc(r))?.[1] ?? kindOf(r)); }
    line("RL-confirm-20", "21 confirms from one device ⇒ 20 × ACCEPT_REQUIRED then RATE_LIMITED", `${codes.slice(0, 2).join(",")}…${codes.slice(-2).join(",")} (${codes.filter((x) => x === "RATE_LIMITED").length} limited)`, codes.slice(0, 20).every((x) => x === "ACCEPT_REQUIRED") && codes[20] === "RATE_LIMITED");
    const r2 = await submit(h.location, L.bookerFields(c.form, { accept: false }), freshIp());
    line("RL-confirm-other", "other device unaffected", /e=([A-Z_]+)/.exec(loc(r2))?.[1] ?? kindOf(r2), loc(r2).includes("e=ACCEPT_REQUIRED"));
    // read bucket: 121 GET c/ from one device within a minute
    const ipR = freshIp();
    const st: string[] = [];
    for (let i = 0; i < 121; i++) { const r = await req(h.location, { ip: ipR }); st.push(testid(r.body, "book-rate-limited") ? "R" : String(r.status)); }
    line("RL-read-120", "121 reads/min from one device ⇒ first 120 served, 121st rate-limited", `${st.filter((x) => x === "R").length} limited · last=${st[120]} first=${st[0]}`, st.slice(0, 120).every((x) => x !== "R") && st[120] === "R");
    // 200 concurrent c/ GETs from 200 devices
    const rs = await Promise.all(Array.from({ length: 200 }, () => req(h.location, { ip: freshIp(), fresh: true })));
    const t: Record<string, number> = {};
    for (const r of rs) { const k = r.err ? (r.err.includes("hang up") ? "hangup" : "err") : String(r.status); t[k] = (t[k] ?? 0) + 1; }
    line("RL-200", "200 concurrent c/ ⇒ no 5xx (socket hang-ups reported apart)", JSON.stringify(t), rs.every((r) => r.status < 500));
  });
} catch (e) {
  console.log(`ERROR top: ${String(e instanceof Error ? e.stack : e).slice(0, 800)}`);
} finally {
  await L.cleanup();
  L.summary(LABEL);
}

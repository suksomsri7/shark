// probe-trips-w1.2-hunt-1 — HTTP: flow smoke · Origin (target 1) · 404 shape (2) · headers (3) · sel tampering (4) · reservation token (5)
// all requests over HTTP to the QC server (controller's new build) · rows under temp shops `trips-w12h-*` · removed in finally
// PROBE-EDIT (r2 · มติ Y2): ช่อง bind ของฟอร์มถือหาจากค่า (boundKey) · ฟอร์มหน้าสินค้าพก t เอง
// PROBE-EDIT (r1): ผลบวกปลอมของรอบก่อน — (1) Next สะท้อน slug/token ใน URL ลงหน้า 404 (RSC payload) ⇒ ไม่นับ slug เป็นการรั่ว · เทียบรูปหลังตัดค่าที่สะท้อนจาก URL ต่อชนิดเส้นทาง
//   (2) S-control ใช้ตะกร้าที่ยืนยันแล้ว ⇒ DONE (307 → my/) เป็นผลที่ถูก · ตัวควบคุมใช้ตะกร้าที่ยังไม่ยืนยัน
import * as L from "./probe-trips-w1.2-hunt-lib.mjs";
import { createHash } from "node:crypto";
const createHashHex = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const { line, known, info, guard, req, submit, kindOf, loc, testid, titleOf, freshIp, sleep } = L;

L.boot("probe-w1.2-hunt-1");
const LABEL = "hunt-1";
try {
  await L.sweepStale();
  const A = await L.mkShop("a", { contact: { phone: "076-111-222", line: "@w12hunt", address: "1 ถนนล่า ภูเก็ต" } });
  const B = await L.mkShop("b");
  const PA = await L.mkProd(A, "A");
  const PB = await L.mkProd(B, "B");
  const today = L.ymdBkk(new Date());
  const D1 = L.addDays(today, 20);
  const dA = await L.mkDep(PA, D1, { capacity: 40 });
  const dA2 = await L.mkDep(PA, L.addDays(today, 21), { capacity: 40 });
  const dB = await L.mkDep(PB, D1, { capacity: 40 });
  const zOut = await L.mkZone(A, "out", { surcharge: L.OUTZ, sort: 1 });
  void zOut; void dB;
  const ids = async (): Promise<string[]> => {
    const t = [A.tenant, B.tenant];
    const rows = await L.q<{ id: string }>(`SELECT id FROM "TripProduct" WHERE "tenantId" = ANY($1) UNION SELECT id FROM "TripOption" WHERE "tenantId" = ANY($1) UNION SELECT id FROM "TripExtra" WHERE "tenantId" = ANY($1)
      UNION SELECT id FROM "TripPickupZone" WHERE "tenantId" = ANY($1) UNION SELECT id FROM "TripDeparture" WHERE "tenantId" = ANY($1) UNION SELECT id FROM "TripPaxType" WHERE "tenantId" = ANY($1)
      UNION SELECT id FROM "SellBasket" WHERE "tenantId" = ANY($1) UNION SELECT id FROM "TripHold" WHERE "tenantId" = ANY($1) UNION SELECT id FROM "TripBooking" WHERE "tenantId" = ANY($1)
      UNION SELECT id FROM "Party" WHERE "tenantId" = ANY($1) UNION SELECT id FROM "BusinessUnit" WHERE "tenantId" = ANY($1) UNION SELECT id FROM "Tenant" WHERE id = ANY($1)`, [t]);
    return rows.map((r) => r.id);
  };
  const pick: L.Pick = { d: D1, n: { ADULT: 2, CHILD: 1 } };

  // ═══ 0. flow smoke ═══
  let resPath = "", holdLoc = "", ipMain = freshIp(), phoneMain = L.freshPhone(), nameMain = `สมชาย ล่า${L.hex(2)}`, emailMain = `w12h-${L.hex(3)}@example.com`;
  await guard("flow", async () => {
    const r = await L.bookHttp(A, PA, pick, ipMain, { name: nameMain, phone: phoneMain, email: emailMain });
    holdLoc = r.holdLoc; resPath = r.resPath;
    info("flow", `hold → ${holdLoc.slice(0, 90)} · checkout ${r.checkout ? kindOf(r.checkout) : "-"} · confirm ${r.confirm ? kindOf(r.confirm) : "-"} · ${r.why}`);
    line("flow-1", "HTTP no-JS: select → hold 303 → c/ 200 → confirm 303 → my/", `res=${resPath.slice(0, 50)}`, !!resPath);
    if (r.checkout) {
      const f = L.postForm(r.checkout.body);
      info("flow", `c/ form fields: ${(f?.fields ?? []).map(([k, v]) => `${k}${k.startsWith("$ACTION_") ? `=${v.slice(0, 160)}` : ""}`).join(" | ")}`);
    }
  });

  // ═══ 1. Origin ═══
  await guard("origin-hold", async () => {
    const variants: [string, Record<string, string>, string | null][] = [
      ["same-origin (control)", {}, L.BASE],
      ["Origin evil", {}, "https://evil.example"],
      ["Origin null", {}, "null"],
      ["no Origin", {}, null],
      ["Host spoofed = Origin", { host: "evil.example" }, "http://evil.example"],
      ["X-Forwarded-Host spoofed = Origin", { "x-forwarded-host": "evil.example" }, "https://evil.example"],
      ["Origin same host other port", {}, "http://127.0.0.1:9999"],
    ];
    for (const [name, hdr, origin] of variants) {
      const ip = freshIp();
      const g = await L.openSelect(A, PA, pick, ip);
      if (!g.form) { info("origin", `${name}: no form ${kindOf(g.r)}`); continue; }
      await sleep(L.FORM_WAIT);
      const before = (await L.holdsOf(dA)).length;
      const r = await submit(g.path, g.form.fields, ip, { origin, headers: hdr });
      const after = (await L.holdsOf(dA)).length;
      const created = after - before;
      info("origin", `HOLD ${name}: ${kindOf(r)} · holds +${created} · body ${r.body.length}B ${r.body.slice(0, 120).replace(/\s+/g, " ")}`);
      if (name.startsWith("same-origin")) line("O-0", "same-origin hold works (control)", `${r.status} +${created}`, created === 1);
      else if (name === "no Origin") known("O-nohdr", "POST without Origin header (non-browser / old browser) — Next skips the CSRF check; not exploitable cross-site (browsers always send Origin on cross-site POST)", `${r.status} holds +${created}`, created === 0, "Next 16 accepts a server action without Origin (only warns)");
      else if (name.startsWith("Host spoofed") || name.startsWith("X-Forwarded-Host")) known(`O-${name.slice(0, 6)}`, "spoofed Host/X-Forwarded-Host only matters if the edge passes it through (browser cannot set them cross-site)", `${r.status} holds +${created}`, created === 0, "a non-browser client can always forge both; no CSRF impact");
      else line(`O-${name.replace(/\W+/g, "")}`, "cross-origin POST rejected, no hold created", `${r.status} holds +${created}`, created === 0 && r.status !== 303);
    }
  });
  await guard("origin-confirm", async () => {
    for (const [name, origin] of [["Origin evil", "https://evil.example"], ["Origin null", "null"], ["no Origin", null]] as const) {
      const ip = freshIp();
      const h = await L.holdHttp(A, PA, { d: L.addDays(today, 21), n: { ADULT: 1 } }, ip);
      if (!h.location.includes("/c/")) { info("origin", `confirm ${name}: hold failed ${h.post ? kindOf(h.post) : ""}`); continue; }
      const c = await L.openCheckout(h.location, ip);
      if (!c.form) { info("origin", `confirm ${name}: no checkout form ${kindOf(c.r)}`); continue; }
      await sleep(L.FORM_WAIT);
      const before = (await L.bookingsOf(A.tenant)).length;
      const r = await submit(h.location, L.bookerFields(c.form), ip, { origin });
      const created = (await L.bookingsOf(A.tenant)).length - before;
      info("origin", `CONFIRM ${name}: ${kindOf(r)} · bookings +${created} · ${r.body.slice(0, 100).replace(/\s+/g, " ")}`);
      if (name === "no Origin") known("O-confirm-nohdr", "no Origin ⇒ framework skips check", `${r.status} +${created}`, created === 0, "Next 16 accepts actions without Origin");
      else line(`O-confirm-${name.replace(/\W+/g, "")}`, "cross-origin confirm rejected, no booking", `${r.status} +${created}`, created === 0 && r.status !== 303);
    }
  });

  // ═══ 2. 404 shape ═══
  let tokA = "";
  if (resPath) tokA = decodeURIComponent(resPath.split("/my/")[1]?.split("?")[0] ?? "");
  const basketA = holdLoc ? decodeURIComponent(holdLoc.split("/c/")[1]?.split("?")[0] ?? "") : "";
  const selA = holdLoc ? new URL(holdLoc, L.BASE).searchParams.get("sel") ?? "" : "";
  const randTok = Buffer.from(L.hex(32), "hex").toString("base64url").slice(0, 43);
  await guard("404", async () => {
    const ip = freshIp();
    const cases: [string, string][] = [
      ["c/ shop missing", `/book/${L.SLUG}nope-${L.STAMP}/c/${basketA}?sel=${encodeURIComponent(selA)}`],
      ["c/ basket random", `/book/${A.slug}/c/${randTok}?sel=${encodeURIComponent(selA)}`],
      ["c/ basket of A on shop B", `/book/${B.slug}/c/${basketA}?sel=${encodeURIComponent(selA)}`],
      ["c/ basket malformed", `/book/${A.slug}/c/abc?sel=x`],
      ["c/ no sel", `/book/${A.slug}/c/${basketA}`],
      ["my/ shop missing", `/book/${L.SLUG}nope-${L.STAMP}/my/${tokA}`],
      ["my/ token random", `/book/${A.slug}/my/${randTok}`],
      ["my/ token of A on B", `/book/${B.slug}/my/${tokA}`],
      ["my/ token malformed", `/book/${A.slug}/my/xyz`],
      ["my/ token uppercase-flip", `/book/${A.slug}/my/${tokA.replace(/[a-z]/, (c) => c.toUpperCase())}`],
    ];
    // PROBE-EDIT (r1): Next ใส่ path ของคำขอ (slug ร้าน · token/ตะกร้า · sel) ลงหน้า 404 เอง — ไม่ใช่ข้อมูลร้านที่รั่ว ⇒ นับเฉพาะชื่อร้าน/ชื่อสินค้า และเทียบรูปหลังตัดค่าที่มาจาก URL (ต่อชนิดเส้นทาง c/ · my/)
    const echoed = [A.slug, B.slug, `${L.SLUG}nope-${L.STAMP}`, basketA, encodeURIComponent(basketA), selA, encodeURIComponent(selA), tokA, encodeURIComponent(tokA), randTok, tokA.replace(/[a-z]/, (c) => c.toUpperCase())].filter((x) => x.length >= 3).sort((x, y) => y.length - x.length);
    // PROBE-EDIT (คัดแยก): ค่ารูปผิดสั้น ๆ ("abc"/"xyz"/sel=x) และการมี/ไม่มี query `?sel=` ก็สะท้อนจาก URL ลง RSC payload (`"c":[…,"abc?sel=x"],"q":"?sel=x"`) ⇒ ตัดออกด้วย
    echoed.push("abc", "xyz");
    echoed.sort((x, y) => y.length - x.length);
    const normOf = (b: string) => { let x = b; for (const e of echoed) x = x.split(e).join("§"); return x.replace(/\?sel=(§|x)/g, "").replace(/__PAGE__\?\{[^}]*\}/g, "__PAGE__").replace(/[A-Za-z0-9_-]{30,}/g, "#"); }; // + คีย์ต้นไม้เส้นทาง `__PAGE__?{"sel":…}` (สะท้อน query)
    const shapes = new Map<string, Map<string, string[]>>();
    for (const [name, path] of cases) {
      const r = await req(path, { ip });
      const norm = normOf(r.body);
      const leak = [A.name, B.name, "ร้านล่า", "ทัวร์ล่า", "Hunt tour"].filter((s) => r.body.includes(s));
      const route = name.startsWith("c/") ? "c" : "my";
      const g = shapes.get(route) ?? shapes.set(route, new Map()).get(route) ?? new Map<string, string[]>();
      const key = `${r.status}|${titleOf(r.body)}|${norm.length}|${createHashHex(norm)}`;
      (g.get(key) ?? g.set(key, []).get(key))?.push(name);
      info("404", `${name}: ${r.status} len=${r.body.length} norm=${norm.length} title="${titleOf(r.body)}" ${r.ms.toFixed(0)}ms leak=[${leak.join(",")}] echoedSlug=${r.body.includes(A.slug) || r.body.includes(B.slug)}`);
      line(`NF-${name}`, "404 · no shop name/product in body (slug echoed from the URL by Next is not a leak)", `${r.status} leak=[${leak.join(",")}]`, r.status === 404 && leak.length === 0);
    }
    for (const [route, g] of shapes) line(`NF-shape-${route}`, `one shape for all ${route}/ not-found cases after removing values echoed from the URL`, [...g.entries()].map(([k, v]) => `${k.slice(0, 60)}: ${v.join("/")}`).join(" ; "), g.size === 1);
    // POST action whose bound shop is changed (the bound args are plain JSON in the form)
    const ip2 = freshIp();
    const g = await L.openSelect(A, PA, pick, ip2);
    if (g.form) {
      await sleep(L.FORM_WAIT);
      // PROBE-EDIT (r2): ชื่อช่อง bind หาจากค่า ([slug ร้าน, slug สินค้า]) ไม่ใช่ "$ACTION_0:1" ตายตัว
      const bk = L.boundKey(g.form, (a) => a[0] === A.slug && a[1] === PA.slug);
      const bound = bk ? L.fieldOf(g.form, bk) : null;
      info("404", `hold form bound args (plain text in HTML): ${bk || "ไม่พบช่อง bind"}=${bound}`);
      const fields = g.form.fields.map(([k, v]): [string, string] => (k === bk ? [k, JSON.stringify([`${L.SLUG}nope-${L.STAMP}`, PA.slug])] : [k, v]));
      const r = await submit(g.path, fields, ip2);
      line("NF-action", "hold action with unknown bound shop ⇒ HTTP 404 (notFound in action), no leak", `${kindOf(r)} len=${r.body.length} bound=${bk || "none"}`, !!bk && r.status === 404 && !r.body.includes(A.name));
      const fields2 = g.form.fields.map(([k, v]): [string, string] => (k === bk ? [k, JSON.stringify([B.slug, PA.slug])] : [k, v]));
      const r2 = await submit(g.path, fields2, ip2);
      line("NF-action-xshop", "hold action bound to shop B with A's product ⇒ 404, no hold in B", `${kindOf(r2)}`, !!bk && r2.status === 404);
    }
  });

  // ═══ 3. headers ═══
  await guard("headers", async () => {
    const ip = freshIp();
    const pages: [string, string][] = [["c/", holdLoc], ["my/", resPath], ["404 c/", `/book/${A.slug}/c/abc?sel=x`]];
    for (const [name, path] of pages) {
      if (!path) continue;
      const r = await req(path, { ip });
      const b = r.body;
      const h = r.headers;
      const head = /<head>([\s\S]*?)<\/head>/.exec(b)?.[1] ?? "";
      const metaRef = /<meta name="referrer" content="([^"]*)"/.exec(b)?.[1] ?? null;
      const robots = /<meta name="robots" content="([^"]*)"/.exec(b)?.[1] ?? null;
      const og = (b.match(/property="og:|name="twitter:/g) ?? []).length;
      console.log(`  EVIDENCE ${name} ${r.status} cache-control: ${h["cache-control"]} | x-frame-options: ${h["x-frame-options"]} | csp: ${String(h["content-security-policy"] ?? "-").slice(0, 160)} | referrer-policy: ${h["referrer-policy"]} | meta referrer: ${metaRef} | robots: ${robots} | og/twitter: ${og} | title: "${titleOf(b)}" | x-robots-tag: ${h["x-robots-tag"]}`);
      if (name === "404 c/") continue;
      const cc = String(h["cache-control"] ?? "");
      line(`H-${name}-cache`, "Cache-Control private + no-store", cc, /private/.test(cc) && /no-store/.test(cc));
      const xfo = String(h["x-frame-options"] ?? ""), csp = String(h["content-security-policy"] ?? "");
      line(`H-${name}-frame`, "X-Frame-Options DENY or CSP frame-ancestors 'none'", `xfo=${xfo} fa=${/frame-ancestors[^;]*/.exec(csp)?.[0] ?? "-"}`, /deny/i.test(xfo) || /frame-ancestors 'none'/.test(csp));
      line(`H-${name}-meta`, "meta referrer no-referrer + robots noindex,nofollow + no og/twitter", `ref=${metaRef} robots=${robots} og=${og}`, metaRef === "no-referrer" && /noindex/.test(robots ?? "") && /nofollow/.test(robots ?? "") && og === 0);
      const t = titleOf(b);
      const bad = [D1, "ทัวร์ล่า", "Hunt tour", A.name, /TR-|[A-Z]{2}-\d{4}-\d{4}/.test(t) ? "code" : ""].filter((x) => x && t.includes(x));
      line(`H-${name}-title`, "<title> generic (no code/product/date/shop)", `"${t}"`, bad.length === 0 && t.length > 0);
      void head;
    }
    // action response headers
    const ip2 = freshIp();
    const h = await L.holdHttp(A, PA, { d: L.addDays(today, 21), n: { ADULT: 1 } }, ip2);
    if (h.post) console.log(`  EVIDENCE hold-POST ${h.post.status} location=${loc(h.post).slice(0, 60)}… cache-control: ${h.post.headers["cache-control"]} | x-frame-options: ${h.post.headers["x-frame-options"]} | referrer-policy: ${h.post.headers["referrer-policy"]}`);
  });

  // ═══ 4. sel tampering ═══
  await guard("sel", async () => {
    if (!holdLoc || !selA) { info("sel", "no legit hold"); return; }
    // a second legit hold in A (another IP) and one in B
    const ip2 = freshIp();
    const h2 = await L.holdHttp(A, PA, { d: L.addDays(today, 21), n: { ADULT: 1 } }, ip2);
    const ipB = freshIp();
    const hB = await L.holdHttp(B, PB, { d: D1, n: { ADULT: 1 } }, ipB);
    const bas2 = h2.location ? decodeURIComponent(h2.location.split("/c/")[1]?.split("?")[0] ?? "") : "";
    const sel2 = h2.location ? new URL(h2.location, L.BASE).searchParams.get("sel") ?? "" : "";
    const basB = hB.location ? decodeURIComponent(hB.location.split("/c/")[1]?.split("?")[0] ?? "") : "";
    const selB = hB.location ? new URL(hB.location, L.BASE).searchParams.get("sel") ?? "" : "";
    // payload decode
    const [, part, mac] = selA.split(".");
    const json = Buffer.from(part ?? "", "base64url").toString("utf8");
    info("sel", `sel len=${selA.length} payload=${json}`);
    const all = await ids();
    const leakIds = all.filter((i) => json.includes(i));
    line("S-payload", "decoded sel payload has no internal id", `leaks=${leakIds.length}`, leakIds.length === 0);
    const j = JSON.parse(json) as { n: [string, number][]; t: number };
    const reenc = (o: unknown) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
    const j1 = { ...j, n: j.n.map(([c, n]) => [c, c === "ADULT" ? 1 : n]) };
    const j2 = { ...j, t: 1 };
    const variants: [string, string, string][] = [
      ["qty edited, MAC kept", basketA, `v1.${reenc(j1)}.${mac}`],
      ["total edited, MAC kept", basketA, `v1.${reenc(j2)}.${mac}`],
      ["MAC cut 1", basketA, selA.slice(0, -1)],
      ["MAC +1", basketA, `${selA}A`],
      ["MAC flipped", basketA, `${selA.slice(0, -1)}${selA.endsWith("A") ? "B" : "A"}`],
      ["sel of A2 on basket A", basketA, sel2],
      ["sel of A on basket A2", bas2, selA],
      ["sel of shop A on shop B basket", basB, selA],
      ["sel of shop B on shop A basket", basketA, selB],
      ["length 1025", basketA, `v1.${"A".repeat(1000)}.${"A".repeat(22)}`],
      ["length 8000", basketA, `${selA}${"A".repeat(8000)}`],
      ["NUL", basketA, `v1.\u0000.${mac}`],
      ["RLO + emoji", basketA, `v1.‮😀.${mac}`],
      ["v2 prefix", basketA, selA.replace(/^v1/, "v2")],
      ["empty", basketA, ""],
      ["base64 padding", basketA, `v1.${part}==.${mac}`],
      ["percent junk", basketA, "%%%"],
    ];
    const ip3 = freshIp();
    const shapes = new Map<string, string[]>();
    for (const [name, bas, sel] of variants) {
      if (!bas) { info("sel", `${name}: skipped (no basket)`); continue; }
      const path = `/book/${name.includes("on shop B") ? B.slug : A.slug}/c/${encodeURIComponent(bas)}?sel=${encodeURIComponent(sel)}`.replace("?sel=%%%", "?sel=%%%");
      const r = await req(name === "percent junk" ? `/book/${A.slug}/c/${bas}?sel=%%%` : path, { ip: ip3 });
      const shape = `${r.status}|${testid(r.body, "book-not-found") ? "nf" : kindOf(r)}`;
      (shapes.get(shape) ?? shapes.set(shape, []).get(shape))?.push(name);
      line(`S-${name}`, "NOT_FOUND (404) one shape, not 500, no checkout", `${kindOf(r)}`, r.status === 404 && !testid(r.body, "book-checkout"));
    }
    info("sel", `shapes: ${[...shapes.entries()].map(([k, v]) => `${k}=${v.length}`).join(" ; ")}`);
    // legit sel still works (control) — PROBE-EDIT (r1): ตะกร้า A ยืนยันแล้วใน flow ⇒ DONE (redirect → my/) คือผลที่ถูก · ตัวควบคุม 200 ใช้ตะกร้า A2 ที่ยังไม่ยืนยัน
    const okDone = await req(holdLoc, { ip: ip3 });
    line("S-control-done", "legit c/ of the confirmed basket ⇒ DONE redirect to my/", kindOf(okDone), [303, 307, 308].includes(okDone.status) && loc(okDone).includes("/my/"));
    if (h2.location) {
      const ok = await req(h2.location, { ip: ip3 });
      line("S-control", "legit c/ of an open basket still 200 checkout", kindOf(ok), ok.status === 200 && testid(ok.body, "book-checkout"));
    }
    // confirm action with tampered bound sel (the bound args are plain in the form)
    if (h2.location) {
      const c = await L.openCheckout(h2.location, ip2);
      if (c.form) {
        await sleep(L.FORM_WAIT);
        // PROBE-EDIT (คัดแยก): หน้า c/ (r1) ตั้งชื่อช่อง bind เป็น `$ACTION_1:1` (มี `$ACTION_REF_1`) ไม่ใช่ `$ACTION_0:1` ⇒ เดิมหาไม่เจอ (bound=[]) ไม่ได้แก้อะไร = ยืนยันปกติ · หาช่องจริงจากค่า (JSON array 3 ตัว ขึ้นต้นด้วย slug ร้าน)
        const bk = c.form.fields.find(([k, v]) => { if (!/^\$ACTION_\d+:\d+$/.test(k)) return false; try { const j = JSON.parse(v) as unknown; return Array.isArray(j) && j.length === 3 && j[0] === A.slug; } catch { return false; } })?.[0] ?? "";
        line("S-confirm-boundfield", "confirm form carries the bound args [shop, basket, sel] in a hidden $ACTION_n:m field", bk || "none", !!bk);
        const bound = JSON.parse(L.fieldOf(c.form, bk) ?? "[]") as string[];
        const t = [bound[0], bound[1], `v1.${reenc({ ...JSON.parse(Buffer.from(sel2.split(".")[1] ?? "", "base64url").toString()), n: [["ADULT", 3]] })}.${sel2.split(".")[2]}`];
        const before = (await L.bookingsOf(A.tenant)).length;
        const r = await submit(h2.location, L.bookerFields({ action: "", fields: c.form.fields.map(([k, v]): [string, string] => (k === bk ? [k, JSON.stringify(t)] : [k, v])) }), ip2);
        const after = (await L.bookingsOf(A.tenant)).length;
        line("S-confirm-tampered", "confirm with bound sel qty edited ⇒ 404, no booking", `${kindOf(r)} bookings +${after - before}`, r.status === 404 && after === before);
        // huge bound sel → Location header?
        const huge = [bound[0], bound[1], `${sel2}${"A".repeat(20_000)}`];
        const r2 = await submit(h2.location, L.bookerFields({ action: "", fields: c.form.fields.map(([k, v]): [string, string] => (k === bk ? [k, JSON.stringify(huge)] : [k, v])) }), ip2);
        line("S-confirm-huge-bound", "confirm with 20k bound sel ⇒ 404, no 5xx / no 20k Location", `${kindOf(r2)} locLen=${loc(r2).length}`, r2.status === 404 && loc(r2).length < 2000);
      }
    }
  });

  // ═══ 5. reservation token ═══
  await guard("token", async () => {
    if (!tokA) { info("token", "no reservation token"); return; }
    const ipR = freshIp();
    const r = await req(resPath, { ip: ipR });
    const b = r.body;
    line("T-open", "my/ PAY page opens", kindOf(r), r.status === 200 && testid(b, "book-res"));
    const all = await ids();
    const leakIds = all.filter((i) => b.includes(i));
    line("T-noids", "my/ HTML has no internal id", `leaks=${leakIds.length} ${leakIds.slice(0, 3).join(",")}`, leakIds.length === 0);
    const pii = [phoneMain, `+66${phoneMain.slice(1)}`, emailMain, nameMain].filter((x) => b.includes(x));
    line("T-nopii", "my/ HTML has no booker name/phone/email", `found=[${pii.join(",")}]`, pii.length === 0);
    const bad = ["priceSource", "warnings", "quoteId", "bookingId", "dueId", "000201", "publicTokenHash", B.name, B.slug].filter((x) => b.includes(x));
    line("T-noraw", "no priceSource/quoteId/intent payload/other shop", `found=[${bad.join(",")}]`, bad.length === 0);
    // token of A on B: counted in B's guess bucket
    const ipG = freshIp();
    const ck = L.clientKeyOf(ipG);
    const r2 = await req(`/book/${B.slug}/my/${tokA}`, { ip: ipG });
    const cnt = await L.q<{ count: number }>(`SELECT "count" FROM "ChatRateBucket" WHERE key = $1`, [`trips:token:${B.tenant}:${ck}`]);
    line("T-xshop", "token A on shop B ⇒ 404 + B guess bucket +1", `${r2.status} bucket=${cnt[0]?.count ?? "none"}`, r2.status === 404 && Number(cnt[0]?.count) === 1);
    // guess past the cap on A (X8 tokenPerHourPerDevice default 30)
    const ipX = freshIp();
    const st: string[] = [];
    for (let i = 0; i < 31; i++) {
      const t = Buffer.from(L.hex(32), "hex").toString("base64url").slice(0, 43);
      const rr = await req(`/book/${A.slug}/my/${t}`, { ip: ipX });
      st.push(rr.status === 404 ? "4" : testid(rr.body, "book-rate-limited") ? "R" : String(rr.status));
    }
    info("token", `31 guesses: ${st.join("")}`);
    const real = await req(resPath, { ip: ipX });
    line("T-cap-same", "after cap, real token from the same IP ⇒ closed (rate-limited)", kindOf(real), testid(real.body, "book-rate-limited"));
    const other = await req(resPath, { ip: freshIp() });
    line("T-cap-other", "other IP still opens the real token", kindOf(other), other.status === 200 && testid(other.body, "book-res"));
    // checkout page HTML leaks
    if (holdLoc) {
      const c = await req(holdLoc, { ip: freshIp() });
      const leak = all.filter((i) => c.body.includes(i));
      info("token", `c/ after confirm: ${kindOf(c)}`);
      line("T-c-done", "c/ of a confirmed basket ⇒ redirect to my/ (DONE), no ids", `${kindOf(c)} leaks=${leak.length}`, (c.status === 307 || c.status === 303 || c.status === 308) && loc(c).includes("/my/") && leak.length === 0);
    }
  });
} catch (e) {
  console.log(`ERROR top: ${String(e instanceof Error ? e.stack : e).slice(0, 800)}`);
} finally {
  await L.cleanup();
  L.summary(LABEL);
}

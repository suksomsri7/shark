// probe-trips-w1.1-hunt-1.mts — W1.1a hunter: enumeration / visibility / stored+reflected XSS / internal ids / headers (HTTP, QC server)
// post-review round: + NF-NO-SHOP-DATA (X1 / H-F7: a not-found page under a real shop carries no shop/brand name, title included) · LOGO-EXTERNAL-* (X10: a logo on a non-platform host is not rendered)
import { allIds, boot, cleanup, freshIp, insertRow, kind, line, median, mkDep, mkProd, mkTenant, mkUnit, q, req, rid, STAMP, sweepStale, titleOf, titlesAll, type Resp } from "./probe-trips-w1.1-hunt-lib.mjs";

boot("probe-w1.1-hunt-1");
const XSS = `<img src=x onerror=alert(1)>"'</script><script>alert(7)</script>{{7*7}}`;
const RAW_MARKS = ["<img src=x onerror", "<script>alert(7)", "</script><script>alert"];
const norm = (r: Resp, subs: string[]) => { let b = r.body; subs.forEach((s, i) => { b = b.split(s).join(`§${i}§`); b = b.split(encodeURIComponent(s)).join(`§${i}§`); }); return b; };
const hdrShape = (r: Resp) => Object.keys(r.headers).filter((h) => !["date", "link", "etag", "content-length"].includes(h)).sort().map((h) => `${h}=${String(r.headers[h])}`).join(" | ");

try {
  await sweepStale();
  const A = await mkTenant("a", "ACTIVE", `Hunt A ${XSS}`);
  const B = await mkTenant("b");
  const S = await mkTenant("s", "SUSPENDED");
  const N = await mkTenant("n"); // active shop, no TRIPS unit
  const uA = await mkUnit(A.id, "a"); const uAp = await mkUnit(A.id, "ap", { status: "PAUSED" }); const uAb = await mkUnit(A.id, "ab", { type: "BOOKING" });
  const uB = await mkUnit(B.id, "b"); const uS = await mkUnit(S.id, "s"); await mkUnit(N.id, "n", { type: "BOOKING" });
  await insertRow("TenantBranding", { id: rid("br"), tenantId: A.id, displayName: `Brand ${XSS}`, logoUrl: "https://hunt-tracker.invalid/pixel.png?shop=a", brandColor: "#aa0000", brandFg: "#ffffff", applyStorefront: true, applyMobile: true, updatedAt: new Date() });
  const pA = await mkProd("A", A.id, uA, { title: { th: `ทัวร์ ${XSS}`, en: `Tour ${XSS}` }, body: { summary: { th: `S ${XSS}`, en: `S ${XSS}` }, itinerary: { th: `I ${XSS}\njavascript:alert(1)`, en: `I ${XSS}` }, includes: { th: `C ${XSS}`, en: `C ${XSS}` }, internalNote: { th: "STAFFNOTE-SECRET-123" }, costMinor: 99999 }, meeting: { text: { th: `M ${XSS}`, en: `M ${XSS}` }, lat: 7.77, lng: 98.33, staffNote: "MEETING-STAFF-SECRET" }, optName: { th: `O ${XSS}`, en: `O ${XSS}` } });
  const now = new Date();
  const d1 = new Date(now.getTime() + 5 * 86_400_000); d1.setUTCHours(1, 0, 0, 0);
  const ymd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  await mkDep(pA, ymd(d1), d1, { sold: 3 });
  const hidden: Record<string, string> = {};
  hidden.DRAFT = (await mkProd("DRAFT", A.id, uA, { status: "DRAFT" })).slug;
  hidden.ARCHIVED = (await mkProd("ARCH", A.id, uA, { status: "ARCHIVED" })).slug;
  hidden.PAUSED = (await mkProd("PAUS", A.id, uA, { status: "PAUSED" }).catch(() => ({ slug: "" }))).slug;
  hidden.LIVEABOARD = (await mkProd("LIVE", A.id, uA, { type: "LIVEABOARD" })).slug;
  hidden.TICKET = (await mkProd("TICK", A.id, uA, { type: "TICKET" }).catch(() => ({ slug: "" }))).slug;
  hidden.PAUSED_UNIT = (await mkProd("PUNI", A.id, uAp)).slug;
  hidden.NON_TRIPS_UNIT = (await mkProd("WUNI", A.id, uAb)).slug;
  hidden.OTHER_SHOP = (await mkProd("BONL", B.id, uB)).slug;
  const pS = await mkProd("SUSP", S.id, uS);
  for (const k of Object.keys(hidden)) if (!hidden[k]) { console.log(`  (skip ${k}: status/type not insertable)`); delete hidden[k]; }
  const missingLike = (slug: string) => slug.replace(/^w11h-[a-z]+/, (m) => `w11h-${"z".repeat(m.length - 5)}`);

  // ── 1. hidden product vs truly missing slug of the same length (same shop) ──
  console.log("\n== 1. visibility: hidden product vs missing slug (same length) ==");
  for (const [k, slug] of Object.entries(hidden)) {
    const miss = missingLike(slug);
    const ra: Resp[] = [], rb: Resp[] = [];
    for (let i = 0; i < 12; i++) { ra.push(await req(`/book/${A.slug}/t/${slug}`, { ip: freshIp() })); rb.push(await req(`/book/${A.slug}/t/${miss}`, { ip: freshIp() })); }
    const a = ra[0] as Resp, b = rb[0] as Resp;
    const same = kind(a) === kind(b) && norm(a, [slug]) === norm(b, [miss]) && hdrShape(a) === hdrShape(b) && titlesAll(a).join("|") === titlesAll(b).join("|");
    const ma = median(ra.slice(2).map((r) => r.ms)), mb = median(rb.slice(2).map((r) => r.ms));
    line(`VIS-${k}`, `identical to missing slug (${kind(b)} len ${b.body.length} titles ${JSON.stringify(titlesAll(b))})`, `${kind(a)} len ${a.body.length} titles ${JSON.stringify(titlesAll(a))} headersSame=${hdrShape(a) === hdrShape(b)} bodySame=${norm(a, [slug]) === norm(b, [miss])} · median ms hidden ${ma.toFixed(1)} vs missing ${mb.toFixed(1)}`, same);
  }
  // X1 / H-F7: the not-found page under a real, ACTIVE shop must not carry the shop or brand name anywhere (titles streamed in the RSC payload included).
  // The shop/brand names of this probe contain the XSS marker, which exists nowhere else ⇒ any trace of it on a 404 = shop data leaked.
  for (const [k, path] of [["missing-slug", `/book/${A.slug}/t/nope-${STAMP}`], ...Object.entries(hidden).slice(0, 2).map(([hk, slug]) => [`hidden-${hk}`, `/book/${A.slug}/t/${slug}`] as [string, string])] as [string, string][]) {
    const r = await req(path, { ip: freshIp() });
    const t = titlesAll(r);
    const leak = ["Hunt A", "Brand ", "alert(1)", "alert(7)", "onerror"].filter((m) => t.some((x) => x.includes(m))).concat(["onerror=alert(1)", "alert(7)"].filter((m) => r.body.includes(m)).map((m) => `body:${m}`));
    line(`NF-NO-SHOP-DATA ${k}`, "404 · no shop / brand / product name in any title or in the body", `${kind(r)} titles ${JSON.stringify(t)} · traces: ${JSON.stringify(leak)}`, r.status === 404 && leak.length === 0);
  }
  // shops
  console.log("\n== 1b. shop visibility ==");
  const missShop = (slug: string) => slug.replace(/-(\w)$/, "-q");
  for (const [k, slug, path] of [["SUSPENDED_SHOP", S.slug, ""], ["SUSPENDED_SHOP_PRODUCT", S.slug, `/t/${pS.slug}`], ["NO_TRIPS_UNIT_SHOP", N.slug, ""]] as const) {
    const ra: Resp[] = [], rb: Resp[] = [];
    for (let i = 0; i < 10; i++) { ra.push(await req(`/book/${slug}${path}`, { ip: freshIp() })); rb.push(await req(`/book/${missShop(slug)}${path}`, { ip: freshIp() })); }
    const a = ra[0] as Resp, b = rb[0] as Resp;
    const same = kind(a) === kind(b) && norm(a, [slug]) === norm(b, [missShop(slug)]) && hdrShape(a) === hdrShape(b);
    line(`VIS-${k}`, `identical to missing shop (${kind(b)} len ${b.body.length})`, `${kind(a)} len ${a.body.length} titles ${JSON.stringify(titlesAll(a))} · median ms ${median(ra.slice(2).map((r) => r.ms)).toFixed(1)} vs ${median(rb.slice(2).map((r) => r.ms)).toFixed(1)}`, same);
  }
  // hidden products never listed on the index
  const idx = await req(`/book/${A.slug}`, { ip: freshIp() });
  const listedHidden = Object.entries(hidden).filter(([, s]) => idx.body.includes(s)).map(([k]) => k);
  line("VIS-INDEX", "index lists only the visible product", `kind ${kind(idx)} · hidden slugs present: ${JSON.stringify(listedHidden)} · visible present: ${idx.body.includes(pA.slug)}`, listedHidden.length === 0 && idx.body.includes(pA.slug));

  // ── 2. page content: internal ids / secrets / stored XSS ──
  console.log("\n== 2. content of the visible product page ==");
  for (const lang of ["th", "en"]) {
    const r = await req(`/book/${A.slug}/t/${pA.slug}?lang=${lang}`, { ip: freshIp() });
    const ids = allIds.filter((id) => r.body.includes(id));
    line(`IDS-${lang}`, "no internal id of the temp shop in HTML/RSC payload", `kind ${kind(r)} · ids found: ${ids.length} ${JSON.stringify(ids.slice(0, 4))}`, ids.length === 0 && kind(r) === "200/PRODUCT");
    const secrets = ["STAFFNOTE-SECRET-123", "MEETING-STAFF-SECRET", "99999", "7.77", "98.33", "commissionable", "passThrough\\\":", "priceMinor", "amountMinor"].filter((s) => r.body.includes(s));
    line(`SECRETS-${lang}`, "no unlisted body/meeting fields, no price internals", `found: ${JSON.stringify(secrets)}`, secrets.length === 0);
    const raw = RAW_MARKS.filter((m) => r.body.includes(m));
    const escaped = r.body.includes("&lt;img src=x onerror");
    line(`XSS-STORED-${lang}`, "shop-written texts never appear as raw markup", `raw marks: ${JSON.stringify(raw)} · escaped form present: ${escaped} · title: ${titleOf(r).slice(0, 80)}`, raw.filter((m) => m !== "</script><script>alert" || /[^\\]<\/script><script>alert/.test(r.body)).length === 0 && escaped);
    const imgs = [...r.body.matchAll(/<img[^>]*src="([^"]*)"/g)].map((m) => m[1]);
    console.log(`  INFO  [LOGO-${lang}] <img> sources on the public page: ${JSON.stringify(imgs)}  referrer-policy=${String(r.headers["referrer-policy"])} csp=${String(r.headers["content-security-policy"] ?? "(none)")}`);
    // X10: the shop's logo here is on a third-party host ⇒ must not be rendered (no visitor IP to that host) — nor referenced anywhere in the payload
    line(`LOGO-EXTERNAL-${lang}`, "logo on a non-platform host is not rendered or referenced (X10)", `<img> ${JSON.stringify(imgs)} · host in payload: ${r.body.includes("hunt-tracker.invalid")}`, !r.body.includes("hunt-tracker.invalid"));
  }

  // ── 3. reflected params ──
  console.log("\n== 3. reflected parameters ==");
  const P = encodeURIComponent(`"><script>alert(9)</script>`);
  for (const [k, path] of [
    ["lang", `/book/${A.slug}/t/${pA.slug}?lang=${P}`], ["m", `/book/${A.slug}/t/${pA.slug}?m=${P}`], ["d", `/book/${A.slug}/t/${pA.slug}?d=${P}`], ["a", `/book/${A.slug}/t/${pA.slug}?a=${P}`], ["s", `/book/${A.slug}/t/${pA.slug}?s=${P}`],
    ["a-valid-shape", `/book/${A.slug}/t/${pA.slug}?a=HUNTCODE123`], ["unknown-key", `/book/${A.slug}/t/${pA.slug}?zzz=${P}`], ["slug-404", `/book/${A.slug}/t/${P}`], ["shop-404", `/book/${P}`], ["index-lang", `/book/${A.slug}?lang=${P}&a=HUNTCODE123`],
  ] as const) {
    const r = await req(path, { ip: freshIp() });
    const raw = r.body.includes(`"><script>alert(9)</script>`);
    const carried = r.body.includes("HUNTCODE123");
    line(`REFLECT-${k}`, "no raw reflection, no 5xx, unbound ?a not carried into links", `${kind(r)} raw=${raw}${k.includes("a-valid") || k === "index-lang" ? ` aCarriedOrEchoed=${carried}` : ""}`, !raw && r.status < 500 && !carried);
  }

  // ── 4. headers ──
  console.log("\n== 4. headers / methods ==");
  const pr = await req(`/book/${A.slug}/t/${pA.slug}`, { ip: freshIp() });
  const nf = await req(`/book/${A.slug}/t/nope-${STAMP}`, { ip: freshIp() });
  for (const [k, r] of [["product", pr], ["notfound", nf]] as const) {
    const h = r.headers;
    console.log(`  INFO  [HDR-${k}] status=${r.status} cache-control=${String(h["cache-control"])} vary=${String(h.vary)} x-frame-options=${String(h["x-frame-options"])} csp=${String(h["content-security-policy"] ?? "(none)")} x-robots-tag=${String(h["x-robots-tag"] ?? "(none)")} set-cookie=${String(h["set-cookie"] ?? "(none)")} robotsMeta=${/<meta name="robots" content="([^"]*)"/.exec(r.body)?.[1] ?? "(none)"}`);
    line(`HDR-CACHE-${k}`, "not cacheable by a shared proxy (private/no-store)", String(h["cache-control"]), /no-store|private/.test(String(h["cache-control"])));
    line(`HDR-FRAME-${k}`, "X-Frame-Options DENY", String(h["x-frame-options"]), String(h["x-frame-options"]) === "DENY");
    line(`HDR-ROBOTS-${k}`, "noindex (meta or header)", `${/<meta name="robots" content="([^"]*)"/.exec(r.body)?.[1] ?? "(none)"} / ${String(h["x-robots-tag"] ?? "(none)")}`, /noindex/.test(r.body.slice(0, 20000)) || /noindex/.test(String(h["x-robots-tag"])));
    line(`HDR-COOKIE-${k}`, "no cookie set on public page", String(h["set-cookie"] ?? "(none)"), !h["set-cookie"]);
  }
} finally {
  await cleanup();
}

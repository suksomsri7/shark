// probe-trips-w1.1-hunt-3.mts — W1.1a hunter: query parameters / odd paths / methods / server actions / RSC gate (HTTP, QC server)
import { boot, cleanup, freshIp, kind as kindHtml, line, mkDep, mkProd, mkTenant, mkUnit, pmap, req, STAMP, sweepStale, viewsOf, ymdAt, type Resp } from "./probe-trips-w1.1-hunt-lib.mjs";

boot("probe-w1.1-hunt-3");
const kind = (r: Resp): string => {
  const k = kindHtml(r);
  if (!k.endsWith("OTHER")) return k;
  const b = r.body;
  return `${r.status}/${b.includes('book-rate-limited') ? "rsc:RATE" : b.includes("book-product") ? "rsc:PRODUCT" : b.includes("book-not-found") ? "NOTFOUND*" : b.length === 0 ? "EMPTY" : "OTHER"}`;
};
const monthShown = (r: Resp) => /data-testid="book-day-(\d{4}-\d{2})-\d{2}"/.exec(r.body)?.[1] ?? "(none)";
const selected = (r: Resp) => /data-testid="book-day-(\d{4}-\d{2}-\d{2})" data-state="[A-Z_]+" data-selected="true"/.exec(r.body)?.[1] ?? "(none)";

try {
  await sweepStale();
  const A = await mkTenant("a", "ACTIVE", "Hunt Param Shop");
  const uA = await mkUnit(A.id, "a");
  const pA = await mkProd("A", A.id, uA);
  const draft = await mkProd("DRAFT", A.id, uA, { status: "DRAFT" });
  const now = new Date();
  const today = ymdAt(now, 420);
  const curMonth = today.slice(0, 7);
  for (const add of [3, 5, 40]) { const d = new Date(now.getTime() + add * 86_400_000); d.setUTCHours(1, 0, 0, 0); await mkDep(pA, ymdAt(d, 420), d, { sold: 3 }); }
  const PA = `/book/${A.slug}/t/${pA.slug}`;
  const far = (n: number) => { const y = Number(curMonth.slice(0, 4)), m = Number(curMonth.slice(5, 7)) - 1 + n; return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`; };

  console.log(`\n== 1. ?m / ?d / ?lang (today ${today}) ==`);
  const cases: [string, string, string | null][] = [
    ["m=0000-00", "m=0000-00", curMonth], ["m=0000-01", "m=0000-01", curMonth], ["m=9999-12", "m=9999-12", curMonth], ["m=2026-13", "m=2026-13", curMonth], ["m=past 2020-01", "m=2020-01", curMonth],
    [`m=+12 (${far(12)})`, `m=${far(12)}`, far(12)], [`m=+13 (${far(13)})`, `m=${far(13)}`, curMonth], ["m repeated", `m=${far(1)}&m=${far(2)}`, curMonth], ["m[]=", `m[]=${far(1)}`, curMonth], ["m with NUL", `m=${far(1)}%00`, curMonth],
    ["m=-0001-01", "m=-0001-01", curMonth], ["m huge 6000 chars", `m=${"9".repeat(6000)}`, curMonth],
    ["d=2026-02-30", "d=2026-02-30", curMonth], ["d=9999-12-31", "d=9999-12-31", curMonth], ["d=0000-01-01", "d=0000-01-01", curMonth], [`d outside m`, `m=${curMonth}&d=${far(1)}-05`, curMonth], [`d only, next month`, `d=${far(1)}-05`, far(1)],
    ["d with newline", "d=2026-11-20%0a", curMonth], ["lang=xx", "lang=xx", curMonth], ["lang=EN", "lang=EN", curMonth], ["lang twice", "lang=th&lang=en", curMonth], ["lang=%00", "lang=%00", curMonth],
    ["300 junk params", Array.from({ length: 300 }, (_, i) => `k${i}=v${i}`).join("&"), curMonth], ["__proto__ / constructor keys", "__proto__=x&constructor=y&m[__proto__]=z", curMonth],
  ];
  for (const [name, qs, month] of cases) {
    const r = await req(`${PA}?${qs}`, { ip: freshIp() });
    const got = `${kind(r)} month=${monthShown(r)} selected=${selected(r)} ${r.ms.toFixed(0)}ms`;
    line(`Q ${name}`, `200 product page, month ${month}, no 5xx`, got, r.status === 200 && kind(r) === "200/PRODUCT" && monthShown(r) === month);
  }

  console.log("\n== 2. odd paths ==");
  const paths: [string, string, (r: Resp) => boolean][] = [
    ["shop UPPERCASE", `/book/${A.slug.toUpperCase()}`, (r) => r.status === 404 || r.status === 200 || (r.status >= 300 && r.status < 400)],
    ["shop with %20 padding", `/book/%20${A.slug}%20`, (r) => r.status < 500],
    ["shop trailing dot", `/book/${A.slug}.`, (r) => r.status === 404],
    ["shop + NUL", `/book/${A.slug}%00`, (r) => r.status < 500 && !kind(r).includes("INDEX")],
    ["shop = %00", `/book/%00`, (r) => r.status < 500],
    ["shop traversal", `/book/..%2f..%2fapp`, (r) => r.status < 500],
    ["shop 5000 chars", `/book/${"a".repeat(5000)}`, (r) => r.status < 500],
    ["shop unicode fullwidth", `/book/${encodeURIComponent(A.slug.replace("w", "ｗ"))}`, (r) => r.status === 404],
    ["product UPPERCASE", `/book/${A.slug}/t/${pA.slug.toUpperCase()}`, (r) => r.status === 404],
    ["product + NUL", `${PA}%00`, (r) => r.status === 404],
    ["product bad utf8", `/book/${A.slug}/t/%E0%A4%A`, (r) => r.status < 500],
    ["product lone %", `/book/${A.slug}/t/%`, (r) => r.status < 500],
    ["product 5000 chars", `/book/${A.slug}/t/${"a".repeat(5000)}`, (r) => r.status === 404],
    ["product unicode + sql", `/book/${A.slug}/t/${encodeURIComponent("ก' OR 1=1 --‮")}`, (r) => r.status === 404],
    ["product % wildcard", `/book/${A.slug}/t/${encodeURIComponent("%")}`, (r) => r.status === 404],
    ["product trailing slash", `${PA}/`, (r) => r.status < 500],
    ["product extra segment", `${PA}/extra`, (r) => r.status === 404],
    ["/book/<shop>/t", `/book/${A.slug}/t`, (r) => r.status === 404],
    ["/book", `/book`, (r) => r.status === 404],
    ["double slash", `/book//${A.slug}`, (r) => r.status < 500],
  ];
  for (const [name, path, good] of paths) {
    const r = await req(path, { ip: freshIp() });
    line(`P ${name}`, "no 5xx / no unintended resolve", `${kind(r)}${r.headers.location ? ` → ${String(r.headers.location).slice(0, 80)}` : ""} ${r.ms.toFixed(0)}ms`, good(r));
  }

  console.log("\n== 3. methods / server actions / RSC ==");
  const v0 = await viewsOf(uA);
  const meth: [string, Parameters<typeof req>[1]][] = [
    ["HEAD", { method: "HEAD" }], ["OPTIONS", { method: "OPTIONS" }], ["PUT", { method: "PUT", body: "{}" }], ["DELETE", { method: "DELETE" }], ["PATCH", { method: "PATCH", body: "{}" }],
    ["POST form", { method: "POST", body: "a=1", headers: { "content-type": "application/x-www-form-urlencoded" } }],
    ["POST Next-Action (fake id)", { method: "POST", body: "[]", headers: { "next-action": "0123456789abcdef0123456789abcdef01234567", "content-type": "text/plain;charset=UTF-8" } }],
    ["POST Next-Action multipart", { method: "POST", body: "--x\r\nContent-Disposition: form-data; name=\"1_$ACTION_ID_0123456789abcdef0123456789abcdef01234567\"\r\n\r\n\r\n--x--\r\n", headers: { "content-type": "multipart/form-data; boundary=x" } }],
    ["POST 2 MB body", { method: "POST", body: "x".repeat(2_000_000), headers: { "content-type": "text/plain" } }],
  ];
  for (const [name, o] of meth) {
    const r = await req(PA, { ...o, ip: freshIp() });
    line(`M ${name}`, "no 5xx; non-GET methods should not render/count the page (405)", `${kind(r)} allow=${String(r.headers.allow ?? "(none)")} x-action=${String(r.headers["x-nextjs-action-not-found"] ?? r.headers["x-action-revalidated"] ?? "(none)")} len=${r.body.length}`, r.status < 500 && (name === "HEAD" || name === "OPTIONS" || r.status === 405 || r.status === 404 || r.status === 400));
  }
  console.log(`  INFO  views added by the 9 non-GET requests above: +${(await viewsOf(uA)) - v0}`);
  // RSC request from an exhausted client: gated?
  const ipX = freshIp();
  await pmap(Array.from({ length: 121 }, (_, i) => i), 8, () => req(`/book/${A.slug}`, { ip: ipX }));
  const rsc = await req(`${PA}?_rsc=zz11`, { ip: ipX, headers: { rsc: "1" } });
  const pre = await req(`${PA}?_rsc=zz12`, { ip: ipX, headers: { rsc: "1", "next-router-prefetch": "1" } });
  const seg = await req(`${PA}?_rsc=zz13`, { ip: ipX, headers: { rsc: "1", "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree" } });
  line("RSC-GATED", "RSC payload of an exhausted client is the rate-limited notice, no product data", `rsc → ${kind(rsc)} (has price data: ${rsc.body.includes("book-prices")}) · prefetch → ${kind(pre)} (has product data: ${pre.body.includes("book-prices") || pre.body.includes("Hunt A")}) · segment prefetch → ${kind(seg)} len ${seg.body.length} (product data: ${seg.body.includes("book-prices") || seg.body.includes("Hunt A")})`, !rsc.body.includes("book-prices") && !pre.body.includes("book-prices") && !seg.body.includes("book-prices"));
  console.log(`  INFO  RSC response headers: cache-control=${String(rsc.headers["cache-control"])} vary=${String(rsc.headers.vary)} content-type=${String(rsc.headers["content-type"])}`);
  console.log(`  INFO  prefetch response headers: cache-control=${String(pre.headers["cache-control"])} len=${pre.body.length}`);

  console.log("\n== 4. follow-ups from probe 1 ==");
  // (a) is ?a echoed into links?
  const ra = await req(`${PA}?a=HUNTCODE123&lang=en`, { ip: freshIp() });
  const hrefs = [...ra.body.matchAll(/href="([^"]*HUNTCODE123[^"]*)"/g)].map((m) => m[1]);
  const ctx = [...ra.body.matchAll(/.{60}HUNTCODE123.{30}/g)].map((m) => m[0]).slice(0, 3);
  line("A-CARRY", "unbound ?a never carried into page links", `hrefs with the code: ${hrefs.length} · other occurrences: ${JSON.stringify(ctx)}`, hrefs.length === 0);
  // (b) draft vs missing: byte diff
  const slugM = draft.slug.replace("draft", "zzzzz");
  let same = 0; const diffs: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (await req(`/book/${A.slug}/t/${draft.slug}`, { ip: freshIp() })).body.split(draft.slug).join("§");
    const b = (await req(`/book/${A.slug}/t/${slugM}`, { ip: freshIp() })).body.split(slugM).join("§");
    if (a === b) same++;
    else { let k = 0; while (k < Math.min(a.length, b.length) && a[k] === b[k]) k++; diffs.push(`@${k} len ${a.length}/${b.length}: «${a.slice(k - 30, k + 50)}» vs «${b.slice(k - 30, k + 50)}»`); }
  }
  line("DRAFT-BYTES", "draft 404 byte-identical to missing 404 (after slug substitution) in 6/6 pairs", `${same}/6 identical${diffs.length ? ` · first diff ${diffs[0]}` : ""}`, same === 6);
  if (same !== 6) {
    // control: missing vs missing
    let ctl = 0;
    for (let i = 0; i < 6; i++) {
      const a = (await req(`/book/${A.slug}/t/${slugM}`, { ip: freshIp() })).body;
      const b = (await req(`/book/${A.slug}/t/${slugM}`, { ip: freshIp() })).body;
      if (a === b) ctl++;
    }
    console.log(`  INFO  control missing-vs-missing identical: ${ctl}/6 (if < 6 the difference is render noise, not a signal)`);
  }
  void STAMP;
} finally {
  await cleanup();
}

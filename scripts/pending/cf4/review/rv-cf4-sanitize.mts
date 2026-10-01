// C5.5-fix4 REVIEW — pure probe (no DB): does the forward-ported default-deny core sanitizer keep what session/crm relied on
// (C5.4-E decode-once / escapeAttr, composeOutgoing tracked-link wrapping, templates saved then sent = 2 passes, inbound
// render/snippet) and stay closed against attack inputs? Plus a timing demo of the session/crm-only regex in
// emails-actions.ts:106 (finding RV-1).
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf4/review/rv-cf4-sanitize.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const NEW = (await import("@/lib/core/sanitize" as string)) as Any;
const ENG = (await import("@/lib/core/html-allowlist" as string)) as Any;
const OLD = (await import("./legacy-c54e-sanitize.ts" as string)) as Any;
const SHARED = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;

const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual.slice(0, 1500)}`);
};
const j = (v: unknown) => JSON.stringify(v);

// modes the CRM uses (emails.ts: signature = default · template save/send = composer links · inbound = img + links · emails-shared render)
const MODES: Record<string, Any> = {
  default: undefined,
  composer: { allowLinkSchemes: ["http", "https", "mailto", "tel"] },
  inbound: { allowImages: true, allowLinkSchemes: ["http", "https", "mailto", "tel"] },
  renderImg: { allowImages: true },
};

// ── benign corpus (shapes real CRM mail / templates have) ──
const BENIGN = [
  `<p>สวัสดีครับ คุณสมชาย</p><p>ขอบคุณที่สนใจ <strong>แพ็กเกจ</strong> ของเรา</p>`,
  `<p>ดูรายละเอียด <a href="https://shop.example.com/p?a=1&amp;b=2&amp;c=3">ที่นี่</a></p>`,
  `<p><a href="https://x.example/?q=it&#39;s&amp;r=&quot;x&quot;">quote</a></p>`,
  `<p>โทร <a href="tel:+66812345678">081-234-5678</a> · <a href="mailto:sales@example.com?subject=hi&amp;body=x">อีเมล</a></p>`,
  `<div dir="ltr"><div>Hi,<br><br>See attached.<br></div><div><br></div>-- <br><div class="gmail_signature">Somchai<br>Sales</div></div>`,
  `<html><head><style>p{color:red}</style></head><body><table><tr><td><p>Row &amp; col &nbsp; x</p></td></tr></table></body></html>`,
  `<!--[if mso]><v:rect>vml</v:rect><![endif]--><p>Outlook</p>`,
  `<p>รูป <img src="https://cdn.example.com/a.png?x=1&amp;y=2" alt="โลโก้ &quot;ร้าน&quot;" width="120" height="40"></p>`,
  `<ul><li>หนึ่ง</li><li>สอง <em>เน้น</em></li></ul><ol><li>a</li></ol><blockquote>อ้าง</blockquote><pre><code>x = 1</code></pre>`,
  `<h1>หัว</h1><h2>รอง</h2><h3>ย่อย</h3><hr><p><s>ขีด</s> <u>เส้น</u> <b>หนา</b> <i>เอียง</i></p>`,
  `<p>ราคา 5 &lt; 6 และ 7 &gt; 3</p>`,
  `<p><a href='https://single.example/path'>single quoted</a> <a href=https://bare.example/x>bare</a></p>`,
  `<p><a href="https://shop.example.com/%E0%B8%97?x=%20">encoded</a></p>`,
  `<span style="font-family:Tahoma">ข้อความ</span><font color="red">แดง</font>`,
  `<p>Thai &amp; English &copy; 2026 &hellip;</p>`,
];

// ── attack corpus ──
const ATTACK = [
  `<svg/onload=alert(1)>`, `<details/open/ontoggle=alert(1)>`, `<a/href=javascript:alert(1)>x</a>`, `<x-y onclick=alert(1)>z</x-y>`,
  `<a href="java&#9;script:alert(1)">x</a>`, `<a href="&#106;avascript:alert(1)">x</a>`, `<a href="&#x6A;avascript:alert(1)">x</a>`,
  `<a href="&#0000106avascript:alert(1)">x</a>`, `<a href="javascript&colon;alert(1)">x</a>`, `<a href=" javascript:alert(1)">x</a>`,
  `<a href="\u0001javascript:alert(1)">x</a>`, `<a href="https://ok" onclick="alert(1)">x</a>`, `<a href="https://ok" href="javascript:alert(1)">x</a>`,
  `<a title='href="javascript:alert(1)"' href=https://ok>x</a>`, `<a href="javascript:alert(1)" title='href="https://ok"'>x</a>`,
  `<a href="https://ok/&quot; onmouseover=&quot;alert(1)">x</a>`, `<a href="https://ok/&lt;/a&gt;&lt;script&gt;alert(1)&lt;/script&gt;">x</a>`,
  `<a href="https://ok/&#39; onmouseover=&#39;alert(1)">x</a>`, `<img src=x onerror=alert(1)>`, `<img src="https://x" onerror="alert(1)">`,
  `<img src="javascript:alert(1)">`, `<img src="https://x&quot; onerror=&quot;alert(1)">`, `<img/src="https://x"/onerror=alert(1)>`,
  `<scr<script>ipt>alert(1)</script>`, `<script>alert(1)</script foo>tail`, `<<script>script>alert(1)<</script>/script>`,
  `<!--><script>alert(1)</script>-->`, `<!-- --!><img src=x onerror=alert(1)>`, `<style><img src=x onerror=alert(1)></style>`,
  `<noscript><p title="</noscript><img src=x onerror=alert(1)>">`, `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>`,
  `<textarea><img src=x onerror=alert(1)></textarea>`, `<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>`,
  `<a href="https:\\\\evil.example">x</a>`, `<a href="https:/\\evil.example">x</a>`, `<base href="https://evil/">`,
  `<meta http-equiv=refresh content="0;url=javascript:alert(1)">`, `<form action="https://evil"><input autofocus onfocus=alert(1)></form>`,
  `<object data="javascript:alert(1)"></object>`, `<embed src="javascript:alert(1)">`, `<link rel=stylesheet href="https://evil/x.css">`,
  `<A HREF="JAVASCRIPT:alert(1)">x</A>`, `<ScRiPt>alert(1)</sCrIpT>`, `<p\u000bonclick=alert(1)>x</p>`, `<p\u000conclick=alert(1)>x</p>`,
  `<a href="javascript:alert(1)">x</a>`, `<a href="data:text/html,<script>alert(1)</script>">x</a>`, `<a href="vbscript:msgbox(1)">x</a>`,
  `<a href="https://ok">` + `<p `.repeat(50), `<p title="a>b" onclick="alert(1)">x</p>`, `<a href="https://ok>"onclick=alert(1)//">x</a>`,
  `<img src="https://x" alt="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">`, `<div style="background:url(javascript:alert(1))">x</div>`,
  `<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>`, `<isindex action=javascript:alert(1) type=image>`,
];

// output judge: rebuild-only markup, attribute allowlist, safe schemes, no stray '<'
const TAG_RE = /<(\/?)([a-zA-Z0-9]+)((?:\s+[a-z]+="[^"<>]*")*)\s*>/g;
const ALLOWED = new Set(["p", "br", "hr", "h1", "h2", "h3", "ul", "ol", "li", "strong", "b", "em", "i", "s", "u", "code", "pre", "blockquote", "a"]);
function judge(out: string, images: boolean, schemes: string[]): string[] {
  const bad: string[] = [];
  const rest = out.replace(TAG_RE, (whole: string, close: string, name: string, attrs: string) => {
    const tag = name.toLowerCase();
    if (!(ALLOWED.has(tag) || (images && tag === "img" && !close))) bad.push(`tag:${tag}`);
    const names = [...attrs.matchAll(/\s+([a-z]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!] as const);
    for (const [an, av] of names) {
      const ok = (tag === "a" && ["href", "rel", "target"].includes(an)) || (tag === "img" && ["src", "alt", "width", "height"].includes(an));
      if (!ok) bad.push(`attr:${tag}.${an}`);
      const decoded = ENG.decodeAttr(av);
      if (tag === "a" && an === "href") {
        const s = decoded.replace(/[\u0000- ]+/g, "").toLowerCase();
        const scheme = (/^([a-z][a-z0-9+.-]*):/.exec(s) ?? [])[1];
        if (!scheme || !schemes.includes(scheme)) bad.push(`href:${av}`);
      }
      if (tag === "img" && an === "src" && !/^https?:\/\//i.test(decoded)) bad.push(`src:${av}`);
    }
    return "";
  });
  if (rest.includes("<")) bad.push(`stray<:${rest.slice(rest.indexOf("<"), rest.indexOf("<") + 40)}`);
  // event handler as an attribute NAME (values blanked first: `&quot; onmouseover=&quot;` inside a quoted value is URL text, not an attribute)
  if (/<[^>]*\son[a-z]+\s*=/i.test(out.replace(/"[^"]*"/g, '""'))) bad.push("on*= attribute");
  return bad;
}

// ── S1: benign corpus — new output vs C5.4-E output (byte-identical expected on normal HTML) ──
{
  // doc #6 (Outlook conditional comment): C5.4-E passed `<!--[if mso]>…<![endif]-->` through verbatim; default-deny drops comments — expected tightening
  const EXPECTED_DIFF = new Set([6]);
  const diffs: string[] = [];
  const expected: string[] = [];
  for (const [m, o] of Object.entries(MODES)) for (const [i, x] of BENIGN.entries()) {
    const a = NEW.sanitizeHtml(x, o);
    const b = OLD.sanitizeHtml(x, o);
    if (a !== b) (EXPECTED_DIFF.has(i) ? expected : diffs).push(`${m}#${i}: new=${j(a)} old=${j(b)}`);
  }
  chk("S1", "benign CRM-shaped HTML (15 docs × 4 modes): default-deny output byte-identical to session/crm's C5.4-E output, except the expected comment drop (#6)", diffs.length === 0 && expected.length === 4, `unexpected=${diffs.length ? diffs.join(" | ") : 0} · expected(comment dropped)=${expected.length}: ${expected[0] ?? "-"}`);
}

// ── S2: idempotence (template save → send = 2 passes · re-sanitise at read) on benign + attack + fuzz ──
{
  const fails: string[] = [];
  let n = 0;
  const alphabet = ["<", ">", "&", ";", "#", "x", "6", "a", "amp", "quot", "lt", "gt", "#39", "#x27", '"', "'", "=", " ", "/", "href", "a ", "p", "img ", "src", "https://h/", "javascript:", "\t", "!--", "-->", "script", "ก"];
  let seed = 0x5eed;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const fuzz: string[] = [];
  for (let k = 0; k < 40_000; k++) { let s = ""; const len = 1 + Math.floor(rnd() * 24); for (let t = 0; t < len; t++) s += alphabet[Math.floor(rnd() * alphabet.length)]; fuzz.push(s); }
  for (const [m, o] of Object.entries(MODES)) for (const x of [...BENIGN, ...ATTACK, ...fuzz]) {
    n++;
    const once = NEW.sanitizeHtml(x, o);
    const twice = NEW.sanitizeHtml(once, o);
    if (once !== twice && fails.length < 8) fails.push(`${m}: in=${j(x)} once=${j(once)} twice=${j(twice)}`);
    else if (once !== twice) fails.push("…");
  }
  chk("S2", `sanitize(sanitize(x)) === sanitize(x) for every mode (${n} inputs: benign + attack + 40 000 fuzz × 4 modes)`, fails.length === 0, fails.length ? `${fails.length} non-idempotent: ${fails.slice(0, 8).join(" | ")}` : `${n}/${n}`);
}

// ── S3: composeOutgoing tracked-link wrapping still sees every safe link, and the URL it records = the URL the browser sees ──
{
  const decode5 = (v: string) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"); // emails.ts decodeAttr (L971)
  const bad: string[] = [];
  let links = 0;
  for (const x of [...BENIGN, ...ATTACK]) {
    const out = NEW.sanitizeHtml(x, MODES.composer);
    const old = OLD.sanitizeHtml(x, MODES.composer);
    const wrapped = [...out.matchAll(/href="(https?:\/\/[^"]*)"/gi)].map((m) => decode5(m[1]!));
    const browser = [...out.matchAll(/<a href="([^"]*)"/g)].map((m) => ENG.decodeAttr(m[1]!)).filter((u: string) => /^https?:\/\//i.test(u));
    links += wrapped.length;
    if (j(wrapped) !== j(browser)) bad.push(`wrap≠browser ${j(x)} → ${j(wrapped)} vs ${j(browser)}`);
    if (BENIGN.includes(x)) {
      const wOld = [...old.matchAll(/href="(https?:\/\/[^"]*)"/gi)].map((m) => decode5(m[1]!));
      if (j(wOld) !== j(wrapped)) bad.push(`new≠C5.4-E ${j(x)} → ${j(wrapped)} vs ${j(wOld)}`);
    }
  }
  chk("S3", "composer mode: composeOutgoing's href regex + emails.ts decodeAttr record exactly the http(s) URLs the browser would follow, and the same URLs as C5.4-E on the benign corpus", bad.length === 0 && links >= 8, bad.length ? bad.join(" | ") : `links=${links}`);
}

// ── S4: attack corpus closed in every mode (judge = rebuilt markup only, attribute allowlist, safe schemes, no stray '<') ──
{
  const bad: string[] = [];
  let n = 0;
  for (const [m, o] of Object.entries(MODES)) for (const x of ATTACK) {
    n++;
    const out = NEW.sanitizeHtml(x, o);
    const schemes = o?.allowLinkSchemes ?? ["http", "https"];
    const b = judge(out, !!o?.allowImages, schemes);
    if (b.length) bad.push(`${m} ${j(x)} → ${j(out)} [${b.join(",")}]`);
  }
  // the same corpus through the two CRM render helpers the thread page uses
  for (const x of ATTACK) for (const showImages of [false, true]) {
    n++;
    const out = SHARED.renderInboundHtml(x, { showImages });
    const b = judge(out, showImages, ["http", "https"]);
    if (b.length) bad.push(`renderInboundHtml(${showImages}) ${j(x)} → ${j(out)} [${b.join(",")}]`);
  }
  chk("S4", `attack corpus (${ATTACK.length} vectors × 4 sanitize modes + renderInboundHtml × 2): no executable markup survives`, bad.length === 0, bad.length ? bad.join("\n          ") : `${n}/${n} closed`);
  // positive control for the judge: the legacy C5.4-E sanitizer must be flagged on the hotfix's own vectors
  const ctl = ["<svg/onload=alert(1)>", "<x-y onclick=alert(1)>z</x-y>"].map((x) => judge(OLD.sanitizeHtml(x), false, ["http", "https"]).length > 0);
  chk("S4.ctl", "positive control: the judge flags the pre-hotfix C5.4-E output for `<svg/onload>` and `<x-y onclick>`", ctl.every(Boolean), j(ctl));
}

// ── S5: engine decodeAttr ≡ C5.4-E regex decoder (differential fuzz, independent of oracle F's generator) ──
{
  const ref = (v: string) => v.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|quot|apos|lt|gt);/gi, (whole, ent: string) => {
    const e = ent.toLowerCase();
    if (e === "amp") return "&"; if (e === "quot") return '"'; if (e === "apos") return "'"; if (e === "lt") return "<"; if (e === "gt") return ">";
    const code = e.startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
  const parts = ["&", "#", "x", "X", ";", "0", "1", "7", "9", "f", "F", "g", "a", "amp", "AMP", "quot", "apos", "lt", "gt", "LT", "1114111", "110000", "0000000", "d800", "&&", " ", "ก"];
  let seed = 0xc0ffee;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const miss: string[] = [];
  const N = 300_000;
  for (let k = 0; k < N; k++) {
    let s = ""; const len = 1 + Math.floor(rnd() * 12); for (let t = 0; t < len; t++) s += parts[Math.floor(rnd() * parts.length)];
    if (ENG.decodeAttr(s) !== ref(s) && miss.length < 5) miss.push(`${j(s)} eng=${j(ENG.decodeAttr(s))} ref=${j(ref(s))}`);
  }
  chk("S5", `engine decodeAttr === C5.4-E regex decoder on ${N} random entity-dense strings`, miss.length === 0, miss.length ? miss.join(" | ") : `${N}/${N}`);
}

// ── S6: inbound snippet / text paths (emailSnippet uses html only when text is empty) ──
{
  const sn = SHARED.emailSnippet("", `<p>x &lt; 5 &amp; y</p><p>a < b</p>`);
  const txt = NEW.htmlToText(`<p>x &lt; 5 &amp; y</p><p>a < b</p>`);
  chk("S6.info", "INFO: emailSnippet(html only) keeps entities literally (pre-existing; now also a bare `<` shows as `&lt;`) · htmlToText decodes them", true, `snippet=${j(sn)} htmlToText=${j(txt)}`);
}

// ── S7: worst shapes at the 1 MB inbound cap (linear) ──
{
  const shapes: Record<string, string> = {
    "a+spaces": "<a" + " ".repeat(999_998),
    "lt-only": "<".repeat(1_000_000),
    "lt-alpha-no-gt": "<a".repeat(500_000),
    "attrs": "<a " + 'x="1" '.repeat(166_000) + ">",
    "unclosed-script": "<script>".repeat(125_000),
    "comments": "<!--".repeat(250_000),
    "entities": '<a href="' + "&#x6a;".repeat(166_000) + '">',
  };
  const res: string[] = [];
  let worst = 0;
  for (const [k, s] of Object.entries(shapes)) {
    const t = performance.now();
    NEW.sanitizeHtml(s, MODES.inbound);
    NEW.htmlToText(s);
    const ms = performance.now() - t;
    worst = Math.max(worst, ms);
    res.push(`${k}=${ms.toFixed(0)}ms`);
  }
  chk("S7", "inbound path (sanitizeHtml inbound mode + htmlToText) on 7 worst shapes of 1 MB: each < 1 500 ms", worst < 1500, res.join(" · "));
}

// ── RV-1 (finding demo, not a pass/fail of the forward-port): emails-actions.ts:106 runs /<[^>]*>/g on the RAW, uncapped bodyHtml in the catch path ──
{
  const expr = (bodyHtml: string) => String(bodyHtml ?? "").replace(/<[^>]*>/g, "").trim(); // verbatim from sendCrmEmailAction's catch
  const out: string[] = [];
  const times: number[] = [];
  for (const n of [10_000, 20_000, 40_000]) {
    const s = "<".repeat(n);
    const t = performance.now();
    expr(s);
    const ms = performance.now() - t;
    times.push(ms);
    out.push(`${n}<=${ms.toFixed(0)}ms`);
  }
  const ratio = times[2]! / Math.max(1, times[1]!);
  const linear = performance.now(); NEW.htmlToText("<".repeat(1_000_000)); const lin = performance.now() - linear;
  chk("RV-1.demo", "FINDING DEMO: the catch-path expression is quadratic (doubling n ≈ ×4 time) — 12 MB server-action body limit ⇒ hours of CPU per request; a linear alternative (core htmlToText on 1 MB) for comparison",
    ratio > 2.8, `${out.join(" · ")} · ratio(40k/20k)=${ratio.toFixed(2)} · extrapolated 1 MB ≈ ${((times[2]! / 1000) * (1_000_000 / 40_000) ** 2 / 60).toFixed(0)} min · core htmlToText 1 MB = ${lin.toFixed(0)} ms`);
}

// ── RV-2 (finding demo, pre-existing on prod too): inbound From/To header parsers are quadratic on `<` without `>` and run on uncapped header strings ──
{
  const IA = (await import("@/lib/core/inbound-address" as string)) as Any;
  const out: string[] = [];
  const t: Record<string, number[]> = { bareEmail: [], displayNameOf: [] };
  for (const n of [10_000, 20_000, 40_000]) {
    const s = "a" + "<".repeat(n);
    let a = performance.now(); IA.bareEmail(s); t.bareEmail!.push(performance.now() - a);
    a = performance.now(); SHARED.displayNameOf(s); t.displayNameOf!.push(performance.now() - a);
    out.push(`${n}: bareEmail=${t.bareEmail!.at(-1)!.toFixed(0)}ms displayNameOf=${t.displayNameOf!.at(-1)!.toFixed(0)}ms`);
  }
  const r1 = t.bareEmail![2]! / Math.max(1, t.bareEmail![1]!);
  chk("RV-2.demo", "FINDING DEMO: core/inbound-address bareEmail `/<([^>]*)>\\s*$/` and emails-shared displayNameOf `/^\\s*(.*?)\\s*<[^>]*>\\s*$/` are quadratic (ingestInbound calls them on payload.from BEFORE the sender bucket; the route does not cap header strings)",
    r1 > 2.8, `${out.join(" · ")} · bareEmail ratio(40k/20k)=${r1.toFixed(2)}`);
}

const passed = cks.filter((x) => x.ok).length;
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} rv-cf4-sanitize: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((x) => !x.ok).map((x) => x.id) })}`);
process.exit(0);

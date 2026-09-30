// CRM C4.4-fix2 ▸ J1 unit probe — ONE shared server-side "plain text → e-mail HTML" function that escapes everything
//   and turns only http(s) URLs into real links (so composeOutgoing can click-track them) ◂
// Pure (no DB): pnpm exec tsx scripts/pending/cui/probe-j1-linkify.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
let pass = 0;
let fail = 0;
const chk = (id: string, ok: boolean, msg: string) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✅" : "❌"} ${id} ${msg}`);
};

const decodeAttr = (v: string) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const S = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;
const toHtml: ((t: string, p?: Any) => string) | undefined = S.crmPlainTextToEmailHtml;
const toText: ((h: string) => string) | undefined = S.crmEmailHtmlToComposerText;
chk("J1.0", typeof toHtml === "function", `emails-shared exports crmPlainTextToEmailHtml (got ${typeof toHtml})`);
chk("J1.0b", typeof toText === "function", `emails-shared exports crmEmailHtmlToComposerText (got ${typeof toText})`);

if (typeof toHtml === "function") {
  // the send path wraps exactly what composeOutgoing's regex sees, decoded the way composeOutgoing decodes (emails.ts)
  // every tag in the output must be one of OUR shapes — anything else = HTML injection
  const TAG_OK = /^<(?:p|\/p|br|\/a|a href="https?:\/\/[^"<>\s]+" rel="noopener" target="_blank")>$/i;
  const tagsOk = (h: string) => [...h.matchAll(/<[^>]*>/g)].every((m) => TAG_OK.test(m[0])) && !/<[^>]*$/.test(h.replace(/<[^>]*>/g, ""));
  const hrefs = (h: string) => [...h.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  const cases: [string, string, (h: string) => boolean, string][] = [
    ["J1.1", "ดูรายละเอียดได้ที่ https://example.com/quote", (h) => hrefs(h)[0] === "https://example.com/quote" && />https:\/\/example\.com\/quote<\/a>/.test(h), "plain https URL → <a href>"],
    ["J1.2", "ดูที่ https://example.com/a.", (h) => hrefs(h)[0] === "https://example.com/a" && /<\/a>\.<\/p>$/.test(h), "trailing '.' stays outside the link"],
    ["J1.3", "(ดู https://example.com/x)", (h) => hrefs(h)[0] === "https://example.com/x" && /<\/a>\)/.test(h), "closing ')' not part of the URL when unbalanced"],
    ["J1.4", "wiki https://en.wikipedia.org/wiki/Foo_(bar) ok", (h) => hrefs(h)[0] === "https://en.wikipedia.org/wiki/Foo_(bar)", "balanced ')' stays in the URL"],
    ["J1.5", "q https://example.com/p?a=1&b=2, next", (h) => hrefs(h)[0] === "https://example.com/p?a=1&amp;b=2" && /<\/a>, next/.test(h), "& escaped in href/label · ',' outside"],
    ["J1.6", "<script>alert(1)</script> https://x.test/<img src=x onerror=1>", (h) => !/<script|<img|onerror="/i.test(h) && /&lt;script&gt;/.test(h), "HTML in text stays escaped text (no injection)"],
    ["J1.7", "javascript:alert(1) data:text/html,<b>x</b> ftp://x.test/y", (h) => !/href=/.test(h), "javascript:/data:/ftp: never linkified"],
    ["J1.8", 'x https://example.com/"onmouseover="alert(1) y', (h) => hrefs(h)[0] === "https://example.com/" && !/<a [^>]*onmouseover/i.test(h), "quote cannot break out of href (URL ends at the quote)"],
    ["J1.9", "https://", (h) => !/href=/.test(h), "bare scheme with no host → text"],
    ["J1.10", "a\nb\n\nc", (h) => h === "<p>a<br>b</p><p>c</p>", "paragraphs on blank line · <br> on single newline"],
    ["J1.11", "HTTPS://Example.com/Up", (h) => hrefs(h)[0] === "HTTPS://Example.com/Up", "scheme case-insensitive"],
    ["J1.12", "ไปที่https://example.com/th แล้ว", (h) => hrefs(h)[0] === "https://example.com/th", "Thai directly before the URL still links (URL ends at the space)"],
    ["J1.13", "xhttps://example.com", (h) => !/href=/.test(h), "no link when glued to a latin word (xhttps://)"],
    ["J1.14", "end https://example.com/a?!;:", (h) => hrefs(h)[0] === "https://example.com/a", "trailing ?!;: trimmed"],
    ["J1.15", "", (h) => h === "", "empty → empty"],
    ["J1.16", "สอง https://a.test/1 และ https://b.test/2", (h) => hrefs(h).length === 2, "two URLs → two links"],
    ["J1.17", "https://example.com/'quoted'", (h) => hrefs(h)[0] === "https://example.com/'quoted" || hrefs(h)[0] === "https://example.com/", "single quote handled (no attribute break — href is double-quoted)"],
  ];
  for (const [id, input, ok, msg] of cases) {
    const h = toHtml(input);
    chk(id, ok(h) && tagsOk(h), `${msg} — in=${JSON.stringify(input)} out=${h}`);
  }
  // no catastrophic backtracking: 200 KB of URL-ish junk in well under a second
  const junk = ("https://" + "a".repeat(50) + "((((....))))" + ".").repeat(3000) + "!".repeat(5000);
  const t0 = Date.now();
  toHtml(junk);
  const ms = Date.now() - t0;
  chk("J1.18", ms < 1000, `200 KB adversarial input linkified in ${ms} ms (< 1000)`);
  // composeOutgoing wraps exactly the links we produced (same regex as emails.ts composeOutgoing)
  const body = toHtml("ใบเสนอราคา https://example.com/quote?id=7&x=1 ครับ");
  const wrapped = [...body.matchAll(/href="(https?:\/\/[^"]*)"/gi)].map((m) => decodeAttr(m[1]!));
  chk("J1.19", wrapped.length === 1 && wrapped[0] === "https://example.com/quote?id=7&x=1", `composeOutgoing's href regex finds exactly the typed URL (decoded) — got ${JSON.stringify(wrapped)}`);
  // r2 (SF-2): `"` IS escaped now (so a literal href="…" in text can never be picked up) — the plain-text alternative must still read `It's "fine"`
  const { htmlToText } = (await import("@/lib/core/sanitize" as string)) as Any;
  const quote = toHtml(`It's "fine" — https://example.com/q`);
  chk("J1.19b", htmlToText(quote).includes(`It's "fine"`) && !/&#39;/.test(quote), `text alternative reads It's "fine" · apostrophe kept literal — got ${quote}`);

  // ── r2 SF-2: text that LOOKS like an attribute is never rewritten by composeOutgoing's href wrapper ──
  const wrapRe = /href="(https?:\/\/[^"]*)"/gi;
  for (const [id, input] of [
    ["SF2.1", 'xx href="https://.evil/path" yy'],
    ["SF2.2", `zz href="https://example.com/${"a".repeat(2100)}" zz`],
    ["SF2.3", `href="https://ok.example/p" and https://ok.example/q`],
  ] as const) {
    const h = toHtml(input);
    const wrapped = [...h.matchAll(wrapRe)].map((m) => decodeAttr(m[1]!));
    const own = [...h.matchAll(/<a href="([^"]*)" rel="noopener" target="_blank">/g)].map((m) => decodeAttr(m[1]!));
    chk(id, JSON.stringify(wrapped) === JSON.stringify(own) && tagsOk(h), `composeOutgoing wraps only the linkifier's own anchors — wrapped=${JSON.stringify(wrapped).slice(0, 120)} own=${JSON.stringify(own).slice(0, 120)}`);
  }

  // ── r3 R2-SF1: a URL that runs straight into a placeholder is left as escaped TEXT, whole (mail clients autolink it) —
  //    never a truncated link to the wrong address, never a value inside an href ◂
  const noA = (h: string) => !/<a\b/i.test(h);
  const r3: [string, string, "brace" | "mustache", Record<string, string>, (h: string) => boolean, string][] = [
    ["R3.1", "ดู https://shop.com/?ref={ชื่อ}&x=1 ค่ะ", "brace", { ชื่อ: "abc" }, (h) => noA(h) && h.includes("https://shop.com/?ref=abc&amp;x=1"), "brace: URL + {ชื่อ} + tail = one plain text run"],
    ["R3.2", "https://shop.com/{{contact.firstName}}/x", "mustache", { "contact.firstName": "abc" }, (h) => noA(h) && h.includes("https://shop.com/abc/x"), "mustache: URL + {{…}} + tail = plain text"],
    ["R3.3", "https://{ชื่อ}.example/p", "brace", { ชื่อ: "evil" }, (h) => noA(h), "slot in the host = text"],
    ["R3.4", "https://shop.com/a.{ชื่อ}", "brace", { ชื่อ: "b" }, (h) => noA(h) && h.includes("https://shop.com/a.b"), "punctuation then slot = text (untrimmed URL touches the slot)"],
    ["R3.5", "ดู https://shop.com/p {ชื่อ}", "brace", { ชื่อ: "https://evil.example" }, (h) => [...h.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]).join("|") === "https://shop.com/p" && !/href="https:\/\/evil/.test(h), "a space before the slot = the author URL is still a link · the value stays text"],
    ["R3.6", "{{contact.firstName}}https://shop.com/q", "mustache", { "contact.firstName": "x" }, (h) => [...h.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]).join("|") === "https://shop.com/q", "slot BEFORE a URL does not stop the author URL"],
  ];
  for (const [id, text, syntax, values, ok, msg] of r3) {
    const h = toHtml(text, { syntax, values } as Any);
    chk(id, ok(h) && tagsOk(h), `${msg} — in=${JSON.stringify(text)} out=${h}`);
  }

  // ── r2 SF-1: linear conversion — 400 KB of the reviewer's worst case (URLs of 2030 ")") well under 1 s ──
  const worst = ("https://a" + ")".repeat(2030) + " ").repeat(200);
  const tw = Date.now();
  toHtml(worst);
  const wMs = Date.now() - tw;
  chk("SF1.u", wMs < 500, `${(worst.length / 1024).toFixed(0)} KB worst-case trailing ")" input converted in ${wMs} ms (< 500)`);
}

if (typeof toText === "function") {
  const t1 = toText('<p>สวัสดี {{contact.firstName}}</p><p>ดูโปรที่ <a href="https://shop.test/promo?a=1&amp;b=2" rel="noopener" target="_blank">หน้าโปรโมชัน</a> ได้เลย</p>');
  chk("J1.20", t1.includes("https://shop.test/promo?a=1&b=2") && t1.includes("หน้าโปรโมชัน") && t1.includes("{{contact.firstName}}") && /\n\n/.test(t1), `template HTML → composer text keeps the link URL + label + paragraph break — got ${JSON.stringify(t1)}`);
  const t2 = toText('<p><a href="https://shop.test/x">https://shop.test/x</a></p>');
  chk("J1.21", t2 === "https://shop.test/x", `link whose label is its URL is not duplicated — got ${JSON.stringify(t2)}`);
  const t3 = toText('<p>a &lt;b&gt; &amp; c<br>d</p>');
  chk("J1.22", t3 === "a <b> & c\nd", `entities decoded once · <br> → newline — got ${JSON.stringify(t3)}`);
  const t4 = toText('<p><a href="mailto:x@y.test">เขียนถึงเรา</a></p>');
  chk("J1.23", t4.includes("เขียนถึงเรา"), `non-http link keeps its label — got ${JSON.stringify(t4)}`);
  // ── r2 N-2: mailto:/tel: targets kept as text · hrefs with a space or a trailing ")" survive template → text → HTML ──
  const t5 = toText('<p><a href="mailto:hello@shop.test">เขียนถึงเรา</a> · <a href="tel:+6621234567">โทร</a></p>');
  chk("N2.1", t5.includes("hello@shop.test") && t5.includes("+6621234567") && t5.includes("เขียนถึงเรา"), `mailto/tel address kept as plain text — got ${JSON.stringify(t5)}`);
  if (typeof toHtml === "function") {
    for (const [id, href] of [["N2.2", "https://shop.test/a b/c"], ["N2.3", "https://shop.test/x)"], ["N2.4", "https://en.wikipedia.org/wiki/Foo_(bar)"]] as const) {
      const t = toText(`<p><a href="${href.replace(/"/g, "&quot;")}">ป้าย</a></p>`);
      const h = toHtml(t);
      const got = [...h.matchAll(/<a href="([^"]*)"/g)].map((m) => decodeURI(decodeAttr(m[1]!)));
      chk(id, got.length === 1 && got[0] === href, `template href ${JSON.stringify(href)} survives template → text → HTML — text=${JSON.stringify(t)} got=${JSON.stringify(got)}`);
    }
  }
  if (typeof toHtml === "function") {
    const round = toHtml(t1);
    chk("J1.24", /href="https:\/\/shop\.test\/promo\?a=1&amp;b=2"/.test(round), `template → text → send HTML carries the template's link again — got ${round}`);
  }
}

console.log(`\nJ1 linkify probe: ${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);

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

const S = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;
const toHtml: ((t: string) => string) | undefined = S.crmPlainTextToEmailHtml;
const toText: ((h: string) => string) | undefined = S.crmEmailHtmlToComposerText;
chk("J1.0", typeof toHtml === "function", `emails-shared exports crmPlainTextToEmailHtml (got ${typeof toHtml})`);
chk("J1.0b", typeof toText === "function", `emails-shared exports crmEmailHtmlToComposerText (got ${typeof toText})`);

if (typeof toHtml === "function") {
  // the send path wraps exactly what composeOutgoing's regex sees, decoded the way composeOutgoing decodes (emails.ts)
  const decodeAttr = (v: string) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
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
  const quote = toHtml(`It's "fine" — https://example.com/q`);
  chk("J1.19b", quote.includes(`It's "fine"`), `quotes in text are not turned into entities (htmlToText can't decode &#39;) — got ${quote}`);
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
  if (typeof toHtml === "function") {
    const round = toHtml(t1);
    chk("J1.24", /href="https:\/\/shop\.test\/promo\?a=1&amp;b=2"/.test(round), `template → text → send HTML carries the template's link again — got ${round}`);
  }
}

console.log(`\nJ1 linkify probe: ${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);

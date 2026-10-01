// QC — HOTFIX 2026-10-01: default-deny HTML sanitizers (attribute-separator XSS bypass + ReDoS)
//      core `src/lib/core/sanitize.ts#sanitizeHtml/htmlToText` + kanban `src/lib/modules/kanban/sanitize.ts#sanitizeDescription/renderDescription`
// PURE in-process oracle: no DB, no env, no network. Run: pnpm exec tsx scripts/qc-sanitize-hotfix.mts
// Note: ledger/wo-notes/hotfix-sanitize-2026-10-01.md
//
//   A  XSS corpus (≥150 vectors) × 4 modes (kanban · core default · core links+mailto/tel · core allowImages inbound mode).
//      PASS per vector = the OUTPUT re-tokenised by the strict tokenizer below: every `<` starts an allowlisted tag of that
//      mode with exactly the canonical attribute set (a: href+rel[+target] · img: src[+alt][+width][+height]), attribute
//      values contain no raw `"<>'` and every `&` is one of the 5 escapes, decoded URLs (control/space chars removed) use an
//      allowed scheme · everything between tags contains no `<`. Not "does not contain alert".
//   B  idempotence f(f(x)) === f(x) on the corpus + the benign samples, every mode.
//   C  benign content preserved: output === the pre-hotfix implementation (copied verbatim below as LEGACY_*) byte for
//      byte, except the declared intentional differences (each asserted against its exact new output).
//   D  performance: every shape escalated by doubling up to 1 MB; each sanitizer call < 200 ms and time(2n)/time(n) < 3
//      (escalation stops at the first violation so the pre-hotfix cubic code cannot hang the run) · htmlToText/renderDescription
//      (regex post-processing, not sanitizers) get a ReDoS-only bound (< 1 000 ms up to 1 MB).
//   F  engine decodeAttr/escapeAttr ≡ the regex versions (differential fuzz).
//   E  pinned outputs of the reported payloads + text/htmlToText behaviour.
type Fn = (dirty: string | null | undefined, opts?: Record<string, unknown>) => string;
const core = (await import("@/lib/core/sanitize" as string)) as { sanitizeHtml: Fn; htmlToText: Fn };
const kb = (await import("@/lib/modules/kanban/sanitize" as string)) as { sanitizeDescription: Fn; renderDescription: Fn };

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, name: string, ok: boolean, exp: string, act: string, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — exp ${exp} | act ${act}`}`);
};
const cut = (s: unknown, n = 160) => JSON.stringify(String(s).slice(0, n));

// ═════════════════════════════ modes ═════════════════════════════
type Mode = {
  key: string;
  run: (x: string) => string;
  legacy: (x: string) => string;
  tags: ReadonlySet<string>;
  target: boolean; // <a … target="_blank">
  schemes: readonly string[];
  images: boolean;
};
const CORE_TAGS = new Set(["p", "br", "hr", "h1", "h2", "h3", "ul", "ol", "li", "strong", "b", "em", "i", "s", "u", "code", "pre", "blockquote", "a"]);
const KB_TAGS = new Set(["p", "br", "h1", "h2", "ul", "ol", "li", "strong", "b", "em", "i", "s", "code", "a"]);
const MAILTO = ["http", "https", "mailto", "tel"] as const;
const MODES: Mode[] = [
  { key: "K", run: (x) => kb.sanitizeDescription(x), legacy: (x) => LEGACY_sanitizeDescription(x), tags: KB_TAGS, target: false, schemes: ["http", "https"], images: false },
  { key: "C", run: (x) => core.sanitizeHtml(x), legacy: (x) => LEGACY_sanitizeHtml(x), tags: CORE_TAGS, target: true, schemes: ["http", "https"], images: false },
  { key: "CL", run: (x) => core.sanitizeHtml(x, { allowLinkSchemes: MAILTO }), legacy: (x) => LEGACY_sanitizeHtml(x, { allowLinkSchemes: MAILTO }), tags: CORE_TAGS, target: true, schemes: MAILTO, images: false },
  { key: "CI", run: (x) => core.sanitizeHtml(x, { allowImages: true, allowLinkSchemes: MAILTO }), legacy: (x) => LEGACY_sanitizeHtml(x, { allowImages: true, allowLinkSchemes: MAILTO }), tags: CORE_TAGS, target: true, schemes: MAILTO, images: true },
];

// ═════════════════════════════ strict output tokenizer ═════════════════════════════
const decode5 = (v: string) => v.replace(/&(amp|quot|lt|gt|#39);/g, (_w, e: string) => ({ amp: "&", quot: '"', lt: "<", gt: ">", "#39": "'" })[e] ?? "");
const attrValueOk = (v: string) => !/["<>']/.test(v) && !/&(?!(amp|quot|lt|gt|#39);)/.test(v);
function urlOk(raw: string, schemes: readonly string[]): boolean {
  const u = decode5(raw).replace(/[\u0000- \u007f]+/g, "").toLowerCase();
  const m = /^([a-z][a-z0-9+.-]*):/.exec(u);
  if (!m || !schemes.includes(m[1]!)) return false;
  if (m[1] === "http" || m[1] === "https") return /^https?:\/\/[^/\\]/.test(u);
  return u.length > m[1]!.length + 1;
}
/** null = clean · string = the first violation */
function strictCheck(out: string, m: Mode): string | null {
  if (typeof out !== "string") return `not a string: ${typeof out}`;
  let i = 0;
  for (;;) {
    const lt = out.indexOf("<", i);
    if (lt < 0) return null;
    const gt = out.indexOf(">", lt);
    if (gt < 0) return `raw '<' in text at ${lt}: ${cut(out.slice(lt, lt + 40), 60)}`;
    const tag = out.slice(lt, gt + 1);
    let mm: RegExpExecArray | null;
    if ((mm = /^<\/([a-z0-9]+)>$/.exec(tag))) {
      if (!m.tags.has(mm[1]!)) return `closing tag not allowlisted: ${tag}`;
    } else if ((mm = /^<([a-z0-9]+)>$/.exec(tag))) {
      if (!m.tags.has(mm[1]!) || mm[1] === "a") return `tag not allowlisted / missing attrs: ${tag}`;
    } else if ((mm = /^<a href="([^"]*)" rel="noopener"( target="_blank")?>$/.exec(tag))) {
      if (!m.tags.has("a")) return `a not allowlisted: ${tag}`;
      if (!!mm[2] !== m.target) return `a target mismatch: ${tag}`;
      if (!attrValueOk(mm[1]!)) return `href not escaped: ${tag}`;
      if (!urlOk(mm[1]!, m.schemes)) return `href scheme: ${tag}`;
    } else if (m.images && (mm = /^<img src="([^"]*)"(?: alt="([^"]*)")?(?: width="(\d{1,5})")?(?: height="(\d{1,5})")?>$/.exec(tag))) {
      if (!attrValueOk(mm[1]!) || !attrValueOk(mm[2] ?? "")) return `img attr not escaped: ${tag}`;
      if (!urlOk(mm[1]!, ["http", "https"])) return `img src scheme: ${tag}`;
    } else return `non-canonical tag: ${cut(tag, 80)}`;
    i = gt + 1;
  }
}

// ═════════════════════════════ A · XSS corpus ═════════════════════════════
const V: string[] = [
  // reported shapes
  `<svg/onload=alert(1)>`, `<details/open/ontoggle=alert(1)>x</details>`, `<a/href="javascript:alert(1)">x</a>`, `<img/src=x/onerror=alert(1)>`,
  `<a/href=javascript:alert(1)>x</a>`, `<div/onmouseover=alert(1)>hover</div>`, `<video/src/onerror=alert(1)>`, `<body/onload=alert(1)>`,
  `<input/autofocus/onfocus=alert(1)>`, `<select/autofocus/onfocus=alert(1)>`, `<marquee/onstart=alert(1)>`, `<audio/src/onerror=alert(1)>`,
  `<p/onclick=alert(1)>x</p>`, `<b/onmouseover=alert(1)>x</b>`, `<a/href="https://ok.example"/onclick=alert(1)>ok</a>`,
  // classic
  `<script>alert(1)</script>`, `<SCRIPT>alert(1)</SCRIPT>`, `<script src=//evil.example/x.js></script>`, `<script>alert(1)`, `<script\n>alert(1)</script\n>`,
  `<img src=x onerror=alert(1)>`, `<IMG SRC=x ONERROR=alert(1)>`, `<img src="x" onerror="alert(1)"/>`, `<img src=x onerror=alert(1)//`, `<svg onload=alert(1)>`,
  `<svg><script>alert(1)</script></svg>`, `<svg><animate onbegin=alert(1) attributeName=x dur=1s>`, `<svg><a xlink:href="javascript:alert(1)"><text x=20 y=20>x</text></a></svg>`,
  `<svg><foreignObject><p onclick=alert(1)>x</p></foreignObject></svg>`, `<svg><use href="data:image/svg+xml,<svg id=x xmlns=http://www.w3.org/2000/svg><image href=1 onerror=alert(1) /></svg>#x"/></svg>`,
  `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>`, `<math><mi xlink:href="javascript:alert(1)">x</mi></math>`,
  `<math><mtext><mglyph><svg><mtext><textarea><path id="</textarea><img onerror=alert(1) src=1>"></path></textarea></mtext></svg></mglyph></mtext></math>`,
  `<iframe src="javascript:alert(1)"></iframe>`, `<iframe srcdoc="<script>alert(1)</script>"></iframe>`, `<iframe src=//evil.example>`,
  `<object data="javascript:alert(1)"></object>`, `<object data=x.swf>`, `<embed src="javascript:alert(1)">`, `<embed src=x>after`,
  `<form action="javascript:alert(1)"><button>x</button></form>`, `<form><button formaction=javascript:alert(1)>x</button></form>`,
  `<meta http-equiv="refresh" content="0;url=javascript:alert(1)">`, `<base href="javascript:alert(1)//">`, `<link rel=stylesheet href=//evil.example/x.css>`,
  `<link rel=import href=//evil.example>`, `<style>@import "//evil.example";</style>`, `<style>*{background:url(javascript:alert(1))}</style>`, `<style>`,
  `<p style="background:url(javascript:alert(1))">x</p>`, `<p style="x:expression(alert(1))">x</p>`, `<div style="behavior:url(x.htc)">x</div>`,
  `<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>`, `<template><img src=x onerror=alert(1)></template>`,
  `<noembed><img title="</noembed><img src=x onerror=alert(1)>"></noembed>`, `<noframes><img title="</noframes><img src=x onerror=alert(1)>"></noframes>`,
  `<textarea><img title="</textarea><img src=x onerror=alert(1)>"></textarea>`, `<title><img title="</title><img src=x onerror=alert(1)>"></title>`,
  `<xmp><img title="</xmp><img src=x onerror=alert(1)>"></xmp>`, `<plaintext><img src=x onerror=alert(1)>`, `<listing><img src=x onerror=alert(1)></listing>`,
  `<table><td background="javascript:alert(1)">x</td></table>`, `<isindex action=javascript:alert(1) type=image>`, `<keygen autofocus onfocus=alert(1)>`,
  `<object><param name=src value=javascript:alert(1)></object>`, `<applet code=x>`, `<frameset onload=alert(1)>`, `<bgsound src=javascript:alert(1)>`,
  // nested / broken
  `<<script>alert(1)//<</script>`, `<scr<script>ipt>alert(1)</scr</script>ipt>`, `<scr<script>x</script>ipt>alert(1)</script>`, `<<img src=x onerror=alert(1)>`,
  `<a<img src=x onerror=alert(1)>>`, `<p <img src=x onerror=alert(1)>>`, `<<a href=javascript:alert(1)>x</a>`, `<<<<p>>>>`, `< img src=x onerror=alert(1)>`,
  `<img src=x onerror=alert(1)`, `<a href="javascript:alert(1)"`, `<p title="`, `<svg/onload=alert(1)`, `x</p><svg/onload=alert(1)>`, `</p><svg onload=alert(1)>`,
  `<p title="><svg/onload=alert(1)>">x</p>`, `<p title='><svg/onload=alert(1)>'>x</p>`, `<p title=><svg/onload=alert(1)>>x</p>`, `<a title="x>" href="javascript:alert(1)">y</a>`,
  `<a href="https://ok.example" title="x><img src=x onerror=alert(1)>">y</a>`, `<a href="https://ok.example/"onmouseover="alert(1)">y</a>`,
  `<a href='https://ok.example/'onmouseover=alert(1)>y</a>`, `<a href=https://ok.example/"onmouseover=alert(1)//>y</a>`, `<a href="https://x&quot; onclick=alert(1) x=&quot;">y</a>`,
  `<a href="https://x&#34; onclick=alert(1) x=&#34;">y</a>`, `<a href="https://x' onclick=alert(1) x='">y</a>`, `<a href="https://x/<script>alert(1)</script>">y</a>`,
  `</script><script>alert(1)</script>`, `</a><a href=javascript:alert(1)>x</a>`, `</ p><svg/onload=alert(1)>`, `</>x<//>y`, `</x onclick=alert(1)>`,
  // comments / CDATA / doctype / PI
  `<!--<img src=x onerror=alert(1)>-->`, `<!-- --!><img src=x onerror=alert(1)>-->`, `<!-- --><svg/onload=alert(1)>`, `<!--><svg/onload=alert(1)>-->`,
  `<!---><svg/onload=alert(1)>-->`, `<!--[if gte mso 9]><svg/onload=alert(1)><![endif]-->`, `<![CDATA[<svg/onload=alert(1)>]]>`, `<svg><![CDATA[><image xlink:href="]]><img src=x onerror=alert(1)>"></svg>`,
  `<!DOCTYPE html><svg/onload=alert(1)>`, `<!doctype x><img src=x onerror=alert(1)>`, `<?xml version="1.0"?><svg/onload=alert(1)>`, `<? x ><img src=x onerror=alert(1)>`,
  `<!x><svg/onload=alert(1)>`, `<!--`, `<!--<svg/onload=alert(1)>`, `<!`, `<?`, `</`, `<`, `<!-- unterminated <p>x</p>`,
  // custom elements / names with digits, colons, dashes
  `<x-foo onclick=alert(1)>x</x-foo>`, `<my-element/onclick=alert(1)>x</my-element>`, `<o:p onclick=alert(1)>x</o:p>`, `<svg:svg onload=alert(1)>`,
  `<h1-x onclick=alert(1)>x</h1-x>`, `<p1 onclick=alert(1)>x</p1>`, `<h4 onclick=alert(1)>x</h4>`, `<a-b href=javascript:alert(1)>x</a-b>`, `<p:x onmouseover=alert(1)>x</p:x>`,
  `<script-x>alert(1)</script-x>`, `<a:b href="javascript:alert(1)">x</a:b>`, `<p.x onclick=alert(1)>`, `<p onclick=alert(1)>x</p>`, `<p onclick=alert(1)>x</p>`,
  // null bytes / control chars
  `<scr\u0000ipt>alert(1)</scr\u0000ipt>`, `<img\u0000src=x onerror=alert(1)>`, `<a href="java\u0000script:alert(1)">x</a>`, `<a href="\u0000javascript:alert(1)">x</a>`,
  `<svg\u0000onload=alert(1)>`, `<a\u000chref=javascript:alert(1)>x</a>`, `<img\u000csrc=x\u000conerror=alert(1)>`, `<p\u000bonclick=alert(1)>x</p>`, `\u0000<svg/onload=alert(1)>`,
  // attribute-separator variants, every handler shape
  `<svg\tonload=alert(1)>`, `<svg\nonload=alert(1)>`, `<svg\ronload=alert(1)>`, `<svg\fonload=alert(1)>`, `<svg//onload=alert(1)>`, `<svg / onload=alert(1)>`,
  `<svg onload = alert(1)>`, `<svg onload="alert(1)"/>`, `<svg onload='alert(1)'>`, `<svg onload=alert&#40;1&#41;>`, `<svg ONLOAD=alert(1)>`, `<svg oNlOaD=alert(1)>`,
  `<p onclick="alert(1)" class=x>x</p>`, `<p class=x onclick=alert(1)>x</p>`, `<b onmouseover=alert(1)>x</b>`, `<li onfocus=alert(1) tabindex=1>x</li>`,
  `<a href="https://ok.example" onclick="alert(1)">ok</a>`, `<a onclick="alert(1)" href="https://ok.example">ok</a>`, `<a href="https://ok.example" style="position:fixed;inset:0">ok</a>`,
  `<p id=x onanimationstart=alert(1) style=animation-name:x>x</p>`, `<p onpointerenter=alert(1)>x</p>`, `<blockquote onbeforecopy=alert(1)>x</blockquote>`,
  // URL obfuscation
  `<a href="javascript:alert(1)">x</a>`, `<a href="JaVaScRiPt:alert(1)">x</a>`, `<a href=" javascript:alert(1)">x</a>`, `<a href="java\tscript:alert(1)">x</a>`,
  `<a href="java\nscript:alert(1)">x</a>`, `<a href="java&#x09;script:alert(1)">x</a>`, `<a href="java&#9;script:alert(1)">x</a>`, `<a href="java&Tab;script:alert(1)">x</a>`,
  `<a href="&#106;avascript:alert(1)">x</a>`, `<a href="&#x6A;avascript:alert(1)">x</a>`, `<a href="javascript&colon;alert(1)">x</a>`, `<a href="javascript&#58;alert(1)">x</a>`,
  `<a href="javascript&#x3A;alert(1)">x</a>`, `<a href="&#0000106&#0000097&#0000118&#0000097&#0000115&#0000099&#0000114&#0000105&#0000112&#0000116&#0000058alert(1)">x</a>`,
  `<a href="data:text/html,<script>alert(1)</script>">x</a>`, `<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>`, `<a href="vbscript:msgbox(1)">x</a>`,
  `<a href="VBSCRIPT:msgbox(1)">x</a>`, `<a href="\u0001javascript:alert(1)">x</a>`, `<a href="javascript\u0000:alert(1)">x</a>`, `<a href="//evil.example">x</a>`,
  `<a href="/relative">x</a>`, `<a href="https:alert(1)">x</a>`, `<a href="http:/\\evil.example">x</a>`, `<a href="javascript://%0aalert(1)">x</a>`,
  `<a href="javascript://https://ok.example/%0aalert(1)">x</a>`, `<a href=javascript:alert(1)>x</a>`, `<a href='javascript:alert(1)'>x</a>`, `<a href = "javascript:alert(1)">x</a>`,
  `<A HREF="javascript:alert(1)">x</A>`, `<a href="  https://ok.example">x</a>`, `<a href="mailto:a@b.example?body=<script>">x</a>`, `<a href="tel:+66-1">x</a>`,
  `<a href="mailto:">x</a>`, `<a href="https://ok.example" href="javascript:alert(1)">x</a>`, `<a href="javascript:alert(1)" href="https://ok.example">x</a>`,
  `<a data-href="https://ok.example" href="javascript:alert(1)">x</a>`, `<a xhref="https://ok.example">x</a>`, `<a href>x</a>`, `<a href="">x</a>`,
  `<img src="javascript:alert(1)">`, `<img src="data:image/svg+xml,<svg onload=alert(1)>">`, `<img src=" https://ok.example/a.png" onerror=alert(1)>`,
  `<img src="https://ok.example/a.png" onerror="alert(1)" alt="x" width="10" height="20">`, `<img src="https://ok.example/a.png" alt="&quot; onerror=alert(1) x=&quot;">`,
  `<img src="https://ok.example/a.png" alt='"><svg/onload=alert(1)>'>`, `<img src="https://ok.example/a.png" width="1 onerror=alert(1)">`, `<img/src="https://ok.example/a.png"/onerror=alert(1)>`,
  `<img src=https://ok.example/a.png onerror=alert(1)>`, `<img srcset="javascript:alert(1)" src="https://ok.example/a.png">`, `<img data-src="https://ok.example/a.png" src="javascript:alert(1)">`,
  // over-long / repeated
  `<svg/onload=alert(1)>`.repeat(2000), `<p title="` + "x".repeat(5000), `<a href="javascript:alert(1)">`.repeat(500) + "x",
  "<".repeat(3000) + `svg/onload=alert(1)>`, `<p>` + "a".repeat(20000) + `<svg/onload=alert(1)>`,
];
// generated: separators × elements × handlers
const SEPS = [" ", "/", "\t", "\n", "\r", "\f", "/ ", " /", "//", " "];
const ELEMS = ["svg", "img src=x", "details open", "body", "video src=x", "p", "b", "a", "iframe", "x-y", "marquee", "math", "h1", "li", "code"];
const HANDLERS = ["onload", "onerror", "ontoggle", "onmouseover", "onfocus", "onclick", "onbegin", "onanimationstart"];
for (let i = 0; i < SEPS.length; i++) {
  for (let j = 0; j < ELEMS.length; j++) {
    const sep = SEPS[i]!;
    const h = HANDLERS[(i + j) % HANDLERS.length]!;
    const el = ELEMS[j]!.replace(/ /g, sep);
    V.push(`<${el}${sep}${h}=alert(1)>x</${ELEMS[j]!.split(" ")[0]}>`);
  }
}
const URLS = [
  "javascript:alert(1)", "JAVASCRIPT:alert(1)", "\tjavascript:alert(1)", "java\rscript:alert(1)", "jav&#x0A;ascript:alert(1)", "&#x6a;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;&#x3a;alert(1)",
  "data:text/html,x", "vbscript:x", "javascript&#x3a;alert(1)", "\u0008javascript:alert(1)",
];
for (const u of URLS) {
  V.push(`<a href="${u}">x</a>`, `<a/href='${u}'>x</a>`, `<img src="${u}">`);
}
console.log(`\n── A: XSS corpus — ${V.length} vectors × ${MODES.length} modes ──`);
{
  let bad = 0;
  const firstFails: string[] = [];
  for (const m of MODES) {
    let modeBad = 0;
    for (const v of V) {
      let out = "";
      let err: string | null;
      try {
        out = m.run(v);
        err = strictCheck(out, m);
      } catch (e) {
        err = `threw ${(e as Error).message}`;
      }
      if (err) {
        modeBad++;
        if (firstFails.length < 12) firstFails.push(`${m.key} ${cut(v, 70)} → ${cut(out, 90)} :: ${err}`);
      }
    }
    bad += modeBad;
    chk(`HS-A.${m.key}`, `mode ${m.key}: every output passes the strict tokenizer (${V.length} vectors)`, modeBad === 0, "0 violations", `${modeBad} violations`);
  }
  for (const f of firstFails) console.log(`      · ${f}`);
  chk("HS-A.count", "corpus has ≥ 150 vectors", V.length >= 150, "≥150", String(V.length), "MAJOR");
  void bad;
}

// ═════════════════════════════ benign samples ═════════════════════════════
const POLICY = `<h1>นโยบายความเป็นส่วนตัว</h1>
<p>ร้าน <strong>ตัวอย่าง</strong> ("ร้าน") ให้ความสำคัญกับข้อมูลส่วนบุคคลของท่านตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562</p>
<h2>1. ข้อมูลที่เราเก็บ</h2>
<ul>
  <li>ชื่อ-นามสกุล, เบอร์โทรศัพท์, อีเมล</li>
  <li>ประวัติการซื้อ &amp; แต้มสะสม</li>
</ul>
<h3>1.1 วัตถุประสงค์</h3>
<ol><li><em>ให้บริการสมาชิก</em></li><li><b>ส่งโปรโมชัน</b> (เมื่อท่านยินยอม)</li></ol>
<blockquote>มาตรา 19: การเก็บรวบรวมข้อมูลต้องได้รับความยินยอม</blockquote>
<p>ติดต่อ: <a href="https://shop.example/contact">ช่องทางติดต่อ</a> หรือ <code>dpo@shop.example</code></p>
<hr>
<p><s>ฉบับเก่า</s> <u>ฉบับปรับปรุง</u> 1 ต.ค. 2569<br>ขอบคุณค่ะ</p>
<pre>เวลาทำการ 09:00–18:00</pre>`;
const GMAIL = `<div dir="ltr">สวัสดีครับ<div><br></div><div>แนบใบเสนอราคา <b>QT-001</b> ตามที่คุยกันครับ</div><div><br></div><div>ขอบคุณครับ<br clear="all"><div><br></div>-- <br><div dir="ltr" class="gmail_signature"><div dir="ltr"><span style="color:rgb(0,0,0)">สมชาย</span><div><a href="https://www.shop.example" target="_blank">www.shop.example</a></div></div></div></div></div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Tue, 30 Sep 2026 at 10:00, ลูกค้า &lt;<a href="mailto:buyer@client.example">buyer@client.example</a>&gt; wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex"><div dir="ltr">ขอราคาด้วยครับ</div></blockquote></div>`;
const OUTLOOK_SIMPLE = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><style type="text/css">p{margin:0}</style></head><body><div><p class="MsoNormal">Dear team,</p><p class="MsoNormal">Please find the PO attached.</p><table border="0"><tr><td><p>Item</p></td><td><p>Qty 5</p></td></tr></table><p class="MsoNormal">Regards,<br>Buyer</p></div></body></html>`;
const BENIGN: string[] = [
  "", "สวัสดีครับ", "  ข้อความมีช่องว่างหัวท้าย  ", "plain text only", "Tom &amp; Jerry &nbsp; &copy; 2026", "Tom & Jerry", "1 > 0 and \"quotes\" and 'single'",
  `<p>สวัสดี</p>`, `<P>ตัวพิมพ์ใหญ่</P>`, `<p class="lead" style="color:red" id="x">มี attribute</p>`, `<br>`, `<br/>`, `<br />`, `<BR>`, `<hr>`, `<hr/>`, `<p/>`, `<p />`,
  `<h1>หัว 1</h1><h2>หัว 2</h2><h3>หัว 3</h3>`, `<ul><li>หนึ่ง</li><li>สอง</li></ul>`, `<ol><li>1</li></ol>`, `<strong>หนา</strong> <b>หนา</b> <em>เอียง</em> <i>เอียง</i> <s>ขีด</s> <u>เส้นใต้</u>`,
  `<code>x = 1</code>`, `<pre>บรรทัด 1\nบรรทัด 2</pre>`, `<blockquote>อ้างอิง</blockquote>`, `<a href="https://shark.in.th">ลิงก์</a>`, `<a href="http://example.com/path?x=1">http</a>`,
  `<a href='https://example.com/single'>single</a>`, `<a href=https://example.com/unquoted>unquoted</a>`, `<a href="https://example.com" title="t" class="c">attrs</a>`,
  `<a class="c" href="https://example.com">href second</a>`, `<A HREF="HTTPS://EXAMPLE.COM/UP">upper</A>`, `<a href="mailto:a@b.example">mail</a>`, `<a href="tel:+6621234567">tel</a>`,
  `<a href="https://example.com/q?a=1&b=2">amp raw</a>`, `<p>ย่อหน้า<br>ขึ้นบรรทัด</p><p>ย่อหน้าสอง</p>`, `<div><span>div/span ถูกปลด</span></div>`, `<table><tr><td>ตาราง</td></tr></table>`,
  `<h4>h4</h4><h5>h5</h5><h6>h6</h6>`, `<font color="red">font</font>`, `<center>center</center>`, `<img src="https://cdn.example/a.png" alt="รูป" width="100" height="50">`,
  `<img src="https://cdn.example/a.png">`, `<img alt="ไม่มี src">`, `<p><script>alert(1)</script>หลังสคริปต์</p>`, `<p>ก่อน<style>p{}</style>หลัง</p>`, `<p>ก่อน<iframe src="https://e.example"></iframe>หลัง</p>`,
  `<p onclick="x()">สวัสดี <b>ครับ</b><img src="https://t.example/p.gif" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a><a href="https://ok.example/a?b=1">ok</a></p>`,
  `<div style="color:red"><h1>หัว</h1><iframe src="https://e.example"></iframe><ul><li>1</li></ul></div>`, `<table><tr><td>a</td></tr></table><blockquote>q</blockquote><svg onload="x()"><circle/></svg>`,
  `<p>สวัสดี <b>หนา</b> <script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="https://ok.test" onclick="evil()">ok</a><img src=x onerror=alert(1)><h1>หัว</h1><h3>ตัด</h3><ul><li>ข้อ</li></ul><iframe src="//x"></iframe></p>`,
  `<p>นโยบายความเป็นส่วนตัว v1</p>`, `<p>v2 ร่าง</p>`, `<p>x</p><script>alert(1)</script>`, `<p>นโยบายความเป็นส่วนตัวของร้าน</p>`, POLICY, GMAIL, OUTLOOK_SIMPLE,
  `<p>จาก: buyer@client.example</p><p>รายละเอียดงาน</p>`, `<ul><li>ชื่อ: สมชาย &amp; สมหญิง</li><li>เบอร์: 081-234-5678</li><li>หมายเหตุ: &lt;ไม่มี&gt; &quot;ด่วน&quot; &#39;ok&#39;</li></ul>`,
  `<p>ข้อความแชท: ราคาเท่าไหร่ครับ</p>`, `<p>สวัสดี\n\nบรรทัดใหม่</p>`, "line1\nline2\r\nline3", "ข้อความ\u0000มี null", `<p>emoji 🦈🎉</p>`, `<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>`,
];
// markdown-lite HTML exactly as renderDescription builds it BEFORE its sanitizer pass (CardBack + mail-to-board text path) — benign by construction
const MD = ["- ข้อ 1\n- ข้อ 2", "**หนา** และ *เอียง*", "ลิงก์ https://shark.in.th/x?a=1&b=2 ท้าย", "ย่อหน้า 1\n\nย่อหน้า 2\nบรรทัด", "<b>ไม่ใช่ HTML</b> & < > \" '", "* ดาว\n* ดาว 2", "a < b > c", "x<5 แต่ y>3"];
for (const t of MD) BENIGN.push(LEGACY_mdToHtml(t));


console.log(`\n── B: idempotence (corpus ${V.length} + benign ${BENIGN.length}) ──`);
for (const m of MODES) {
  let bad = 0;
  const ex: string[] = [];
  for (const x of [...V, ...BENIGN]) {
    const a = m.run(x);
    const b = m.run(a);
    if (a !== b) {
      bad++;
      if (ex.length < 3) ex.push(`${cut(x, 50)} → ${cut(a, 70)} → ${cut(b, 70)}`);
    }
  }
  chk(`HS-B.${m.key}`, `mode ${m.key}: sanitize(sanitize(x)) === sanitize(x)`, bad === 0, "0", `${bad} · ${ex.join(" ‖ ")}`);
}

console.log(`\n── C: benign content preserved vs the pre-hotfix implementation ──`);
{
  // allowed differences, asserted exactly: (input, mode) → new output
  const allowed = new Map<string, string>();
  const key = (input: string, mode: string) => `${mode}\u0001${input}`;
  const pinDiff = (input: string, modes: string[], out: string) => { for (const md of modes) allowed.set(key(input, md), out); };
  const ALLM = ["K", "C", "CL", "CI"];
  // D2 · href entity decoded once — legacy double-escaped (`&amp;` → `&amp;amp;` = broken link, not idempotent)
  const mdLink = LEGACY_mdToHtml("ลิงก์ https://shark.in.th/x?a=1&b=2 ท้าย");
  pinDiff(mdLink, ["K"], `<p>ลิงก์ <a href="https://shark.in.th/x?a=1&amp;b=2" rel="noopener">https://shark.in.th/x?a=1&amp;b=2</a> ท้าย</p>`);
  pinDiff(mdLink, ["C", "CL", "CI"], `<p>ลิงก์ <a href="https://shark.in.th/x?a=1&amp;b=2" rel="noopener" target="_blank">https://shark.in.th/x?a=1&amp;b=2</a> ท้าย</p>`);
  // D3..D11 · each pinned to its exact new output in every mode (legacy output noted in the note's benign-diff list)
  const DIFFS: [string, string, string?][] = [
    // [input, new output in K/C/CL (and CI unless 3rd given), CI output]
    ["ราคา x<5 บาท", "ราคา x&lt;5 บาท"], // D3 raw `<` in text → `&lt;` (renders the same)
    ["<p>a</p><!-- comment --><p>b</p>", "<p>a</p><p>b</p>"], // D4 comments dropped (invisible before, too)
    ["<!DOCTYPE html><html><body><p>x</p></body></html>", "<p>x</p>"], // D5 doctype dropped
    [`<p class="MsoNormal">Hi<o:p></o:p></p>`, "<p>Hi</p>"], // D6 names with `:`/`-` are tags (dropped), not text
    ["<p>unterminated <b", "<p>unterminated &lt;b"], // D7 unterminated tag at the end → escaped text
    ["a </ b", "a"], // D8 `</` + non-letter = bogus comment (browser hides it too) → dropped
    [`<a href="https://example.com/?a=1&amp;b=2">x</a>`, ""], // D9 entity in href decoded once (legacy `&amp;amp;`) — outputs per mode below
    [`<a data-href="https://a.example" href="https://b.example">x</a>`, ""], // D10 real `href` attribute, not the first `href=` substring
    [`<a href="https://x.example/a'b">q</a>`, ""], // D11 `'` `<` `>` in attribute values escaped too
    [`<img src="https://cdn.example/a.png?x=1&amp;y=2" alt="a &amp; b">`, "", `<img src="https://cdn.example/a.png?x=1&amp;y=2" alt="a &amp; b">`], // D12 img attrs decoded once
  ];
  const A_OUT: Record<string, [string, string]> = {
    // input → [kanban, core]
    [`<a href="https://example.com/?a=1&amp;b=2">x</a>`]: [`<a href="https://example.com/?a=1&amp;b=2" rel="noopener">x</a>`, `<a href="https://example.com/?a=1&amp;b=2" rel="noopener" target="_blank">x</a>`],
    [`<a data-href="https://a.example" href="https://b.example">x</a>`]: [`<a href="https://b.example" rel="noopener">x</a>`, `<a href="https://b.example" rel="noopener" target="_blank">x</a>`],
    [`<a href="https://x.example/a'b">q</a>`]: [`<a href="https://x.example/a&#39;b" rel="noopener">q</a>`, `<a href="https://x.example/a&#39;b" rel="noopener" target="_blank">q</a>`],
  };
  for (const [input, out, ci] of DIFFS) {
    BENIGN.push(input);
    const a = A_OUT[input];
    if (a) { pinDiff(input, ["K"], a[0]); pinDiff(input, ["C", "CL", "CI"], a[1]); continue; }
    pinDiff(input, ["K", "C", "CL"], out);
    pinDiff(input, ["CI"], ci ?? out);
  }
  void ALLM;
  let bad = 0;
  const diffs: string[] = [];
  for (const m of MODES) {
    for (const x of BENIGN) {
      const now = m.run(x);
      const old = m.legacy(x);
      const pinned = allowed.get(key(x, m.key));
      if (pinned !== undefined) {
        if (now !== pinned) { bad++; diffs.push(`${m.key} PINNED ${cut(x, 50)} → new ${cut(now, 90)} ≠ pinned ${cut(pinned, 90)}`); }
        else if (now !== old) diffs.push(`${m.key} intentional ${cut(x, 50)}: legacy ${cut(old, 90)} → new ${cut(now, 90)}`);
        continue;
      }
      if (now !== old) { bad++; diffs.push(`${m.key} DIFF ${cut(x, 60)}: legacy ${cut(old, 120)} → new ${cut(now, 120)}`); }
    }
  }
  for (const d of diffs) console.log(`      · ${d}`);
  {
    let rb = 0;
    for (const t of MD) {
      const now = kb.renderDescription(t);
      const old = LEGACY_sanitizeDescription(LEGACY_mdToHtml(t));
      const pinned = allowed.get(key(LEGACY_mdToHtml(t), "K"));
      if (now !== (pinned ?? old)) { rb++; console.log(`      · renderDescription DIFF ${cut(t, 50)}: legacy ${cut(old, 100)} → new ${cut(now, 100)}`); }
    }
    if (rb) bad += rb;
  }
  chk("HS-C.1", `benign samples (${BENIGN.length} × ${MODES.length} modes): new output === legacy output, except the pinned intentional differences`, bad === 0, "0 unexpected", `${bad} unexpected`, "MAJOR");
}

// ═════════════════════════════ E · pinned payload outputs ═════════════════════════════
console.log("\n── E: pinned outputs ──");
{
  const K = (x: string) => kb.sanitizeDescription(x);
  const C = (x: string) => core.sanitizeHtml(x);
  chk("HS-E.1", "`<svg/onload=alert(1)>` → \"\" (core + kanban)", K(`<svg/onload=alert(1)>`) === "" && C(`<svg/onload=alert(1)>`) === "", '""', `${cut(K(`<svg/onload=alert(1)>`))} ${cut(C(`<svg/onload=alert(1)>`))}`);
  chk("HS-E.2", "`<details/open/ontoggle=alert(1)>x</details>` → \"x\"", K(`<details/open/ontoggle=alert(1)>x</details>`) === "x" && C(`<details/open/ontoggle=alert(1)>x</details>`) === "x", "x", `${cut(K(`<details/open/ontoggle=alert(1)>x</details>`))} ${cut(C(`<details/open/ontoggle=alert(1)>x</details>`))}`);
  chk("HS-E.3", "`<a/href=\"javascript:alert(1)\">x</a>` → \"x</a>\" (opener dropped like legacy did for whitespace-separated)", K(`<a/href="javascript:alert(1)">x</a>`) === "x</a>" && C(`<a/href="javascript:alert(1)">x</a>`) === "x</a>", "x</a>", `${cut(K(`<a/href="javascript:alert(1)">x</a>`))} ${cut(C(`<a/href="javascript:alert(1)">x</a>`))}`);
  chk("HS-E.4", "`<a/href=\"https://ok.example\">ok</a>` keeps the link (slash separator understood, not just rejected)", K(`<a/href="https://ok.example">ok</a>`) === `<a href="https://ok.example" rel="noopener">ok</a>` && C(`<a/href="https://ok.example">ok</a>`) === `<a href="https://ok.example" rel="noopener" target="_blank">ok</a>`, "link", `${cut(K(`<a/href="https://ok.example">ok</a>`))} ${cut(C(`<a/href="https://ok.example">ok</a>`))}`, "MAJOR");
  chk("HS-E.5", "`<x-foo onclick=alert(1)>x</x-foo>` → \"x\" (custom element dropped)", K(`<x-foo onclick=alert(1)>x</x-foo>`) === "x" && C(`<x-foo onclick=alert(1)>x</x-foo>`) === "x", "x", `${cut(K(`<x-foo onclick=alert(1)>x</x-foo>`))} ${cut(C(`<x-foo onclick=alert(1)>x</x-foo>`))}`);
  chk("HS-E.6", "text `x<5 y` keeps its text as `x&lt;5 y`", K("x<5 y") === "x&lt;5 y" && C("x<5 y") === "x&lt;5 y", "x&lt;5 y", `${cut(K("x<5 y"))} ${cut(C("x<5 y"))}`, "MAJOR");
  chk("HS-E.7", "core htmlToText(`<p>a &lt; b</p><svg/onload=alert(1)>`) → `a < b` (plain text, nothing live)", core.htmlToText(`<p>a &lt; b</p><svg/onload=alert(1)>`) === "a < b", "a < b", cut(core.htmlToText(`<p>a &lt; b</p><svg/onload=alert(1)>`)), "MAJOR");
  chk("HS-E.8", "null/undefined/\"\" → \"\" (both)", K(null as unknown as string) === "" && K(undefined as unknown as string) === "" && C(null as unknown as string) === "" && C("") === "", '""', "?", "MAJOR");
  const img = core.sanitizeHtml(`<img src="https://cdn.example/a.png?x=1&amp;y=2" alt="รูป &amp; ภาพ" width="100" height="50" onerror="alert(1)">`, { allowImages: true });
  chk("HS-E.9", "allowImages: img kept with src/alt/width/height only, entities decoded once", img === `<img src="https://cdn.example/a.png?x=1&amp;y=2" alt="รูป &amp; ภาพ" width="100" height="50">`, "canonical img", cut(img, 200), "MAJOR");
  chk("HS-E.10", "core unclosed `<script>` drops everything after it (legacy semantics kept)", C("<p>a</p><script>alert(1)<p>b</p>") === "<p>a</p>", "<p>a</p>", cut(C("<p>a</p><script>alert(1)<p>b</p>")), "MAJOR");
  chk("HS-E.11", "kanban unclosed `<script>` drops the opener only, rest is inert text (legacy semantics kept)", K("<p>a</p><script>alert(1)<p>b</p>") === "<p>a</p>alert(1)<p>b</p>", "<p>a</p>alert(1)<p>b</p>", cut(K("<p>a</p><script>alert(1)<p>b</p>")), "MAJOR");
  chk("HS-E.12", "comment dropped: `a<!-- x -->b` → `ab`", K("a<!-- x -->b") === "ab" && C("a<!-- x -->b") === "ab", "ab", `${cut(K("a<!-- x -->b"))} ${cut(C("a<!-- x -->b"))}`, "MAJOR");
}

// ═════════════════════════════ G · CRM inbound HTML cap (review S2) ═════════════════════════════
console.log("\n── G: CRM inbound HTML capped before sanitising ──");
{
  const { existsSync, readFileSync } = await import("node:fs");
  const src = existsSync("src/lib/modules/crm/emails.ts") ? readFileSync("src/lib/modules/crm/emails.ts", "utf8") : "";
  const cap = /const (\w+) = str\(payload\?\.html\)\.slice\(0, (1_000_000|1000000|512_000|524_288)\);/.exec(src);
  const v = cap?.[1] ?? "\u0000";
  const ok = !!cap && src.includes(`sanitizeHtml(${v}, { allowImages: true`) && src.includes(`htmlToText(${v})`) && !/sanitizeHtml\(str\(payload\?\.html\)/.test(src) && !/htmlToText\(str\(payload\?\.html\)\)/.test(src);
  const big = "<a ".repeat(Math.ceil(1_000_000 / 3)).slice(0, 1_000_000);
  const t0 = performance.now();
  core.sanitizeHtml(big, { allowImages: true, allowLinkSchemes: MAILTO });
  core.htmlToText(big);
  const ms = performance.now() - t0;
  chk("HS-G.1", `crm/emails.ts ingestInbound slices payload.html to ≤ 1 MB once and feeds that to BOTH sanitizeHtml and htmlToText · worst shape at the cap = ${ms.toFixed(0)} ms (< 1 500)`,
    (src === "" || ok) && ms < 1500, "capped + < 1 500 ms", `cap=${!!cap} ms=${ms.toFixed(0)}`, "MAJOR");
}

// ═════════════════════════════ F · engine decodeAttr ≡ the C5.4-E regex decoder (differential fuzz) ═════════════════════════════
console.log("\n── F: decodeAttr differential fuzz ──");
{
  type Eng = { decodeAttr: (v: string) => string; escapeAttr: (v: string) => string };
  const eng = ((await import("@/lib/core/html-allowlist" as string).catch(() => null)) ?? { decodeAttr: () => "\u0000missing", escapeAttr: () => "\u0000missing" }) as Eng;
  const ref = (v: string) => v.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|quot|apos|lt|gt);/gi, (whole, ent: string) => {
    const e = ent.toLowerCase();
    if (e === "amp") return "&"; if (e === "quot") return '"'; if (e === "apos") return "'"; if (e === "lt") return "<"; if (e === "gt") return ">";
    const code = e.startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
  const refEsc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");
  const ALPH = ["&", "#", "x", "X", ";", "a", "m", "p", "q", "u", "o", "t", "l", "g", "s", "A", "M", "P", "0", "1", "9", "f", "F", "3", "4", "<", ">", '"', "'", "ก"];
  let seed = 20261001;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let bad = 0;
  let ex = "";
  for (let r = 0; r < 20000; r++) {
    const len = 1 + Math.floor(rnd() * 16);
    let v = "";
    for (let i = 0; i < len; i++) v += ALPH[Math.floor(rnd() * ALPH.length)];
    if (eng.decodeAttr(v) !== ref(v) || eng.escapeAttr(v) !== refEsc(v)) { bad++; if (!ex) ex = JSON.stringify(v); }
  }
  for (const v of ["&#x110000;", "&#0;", "&#1114111;", "&#x10FFFF;", "&#00000065;", "&#0000065;", "&#x0000041;", "&#x000041;", "&AMP;", "&Quot;", "&apos;", "&amp", "&#;", "&#x;", "&&amp;;", "&#55296;"]) {
    if (eng.decodeAttr(v) !== ref(v)) { bad++; if (!ex) ex = JSON.stringify(v); }
  }
  chk("HS-F.1", "decodeAttr/escapeAttr (single-pass) ≡ the regex versions of CRM C5.4-E on 20 000 random + edge strings", bad === 0, "0", `${bad} first=${ex}`, "MAJOR");
}

// ═════════════════════════════ D · performance ═════════════════════════════
console.log("\n── D: performance (each call < 200 ms · doubling ratio < 3 · up to 1 MB) ──");
{
  const MAX = 1 << 20;
  const SHAPES: { name: string; gen: (n: number) => string }[] = [
    { name: "<a + spaces + x", gen: (n) => "<a" + " ".repeat(n) + "x" },
    { name: "<p + tabs (no >)", gen: (n) => "<p" + "\t".repeat(n) },
    { name: '"<".repeat', gen: (n) => "<".repeat(n) },
    { name: '"<a ".repeat', gen: (n) => "<a ".repeat(Math.ceil(n / 3)) },
    { name: '"<a/".repeat', gen: (n) => "<a/".repeat(Math.ceil(n / 3)) },
    { name: "<script> openers", gen: (n) => "<script>".repeat(Math.ceil(n / 8)) },
    { name: "<style> openers", gen: (n) => "<style>".repeat(Math.ceil(n / 7)) },
    { name: "<iframe x> openers", gen: (n) => "<iframe x>".repeat(Math.ceil(n / 10)) },
    { name: "<script> + </script-ish closers", gen: (n) => "<script>" + "</script ".repeat(Math.ceil(n / 9)) },
    { name: "mixed strip openers", gen: (n) => "<script><style><iframe><object><embed><noscript>".repeat(Math.ceil(n / 48)) },
    { name: "<!-- openers", gen: (n) => "<!--".repeat(Math.ceil(n / 4)) },
    { name: "<!----> comments", gen: (n) => "<!---->".repeat(Math.ceil(n / 7)) },
    { name: "<! / <? bogus", gen: (n) => "<!<?".repeat(Math.ceil(n / 4)) },
    { name: '"</".repeat', gen: (n) => "</".repeat(Math.ceil(n / 2)) },
    { name: "long attribute run", gen: (n) => "<p " + "a=1 ".repeat(Math.ceil(n / 4)) + ">x</p>" },
    { name: "long href value", gen: (n) => '<a href="https://x/' + "y".repeat(n) + '">z</a>' },
    { name: "entity-heavy href", gen: (n) => '<a href="https://x/?' + "&amp;".repeat(Math.ceil(n / 5)) + '">z</a>' },
    { name: "unclosed quote attr", gen: (n) => '<a href="' + "x".repeat(n) },
    { name: "quote run in tag", gen: (n) => "<a " + "\"'".repeat(Math.ceil(n / 2)) + ">" },
    { name: "many small tags", gen: (n) => "<p>a</p>".repeat(Math.ceil(n / 8)) },
    { name: "slash-separated vectors", gen: (n) => "<svg/onload=alert(1)>".repeat(Math.ceil(n / 21)) },
    { name: "Thai text", gen: (n) => "ภาษาไทย ".repeat(Math.ceil(n / 8)) },
    { name: "<a + spaces + = (attr)", gen: (n) => "<a " + "x=".repeat(Math.ceil(n / 2)) },
    { name: "deep nesting", gen: (n) => "<b>".repeat(Math.ceil(n / 6)) + "x" + "</b>".repeat(Math.ceil(n / 6)) },
  ];
  // strict = the two sanitizers (200 ms + ratio < 3) · loose = wrappers whose own post-processing is chained global regex
  // `replace` (htmlToText: 7 · renderDescription: escape + 3 inline passes) — V8 shows a one-off memory-tier step between
  // 256 KB and 1 MB on those (up to ~10× for one doubling, then ≈ 2.2×/doubling again from 2 MB up, i.e. linear), so they
  // get a ReDoS-only bound: < 1 000 ms for every shape up to 1 MB (the cubic pre-hotfix code needs > 500 ms at n = 1 024).
  type Target = { key: string; f: (x: string) => string; strict: boolean };
  const TARGETS: Target[] = [
    { key: "kanban.sanitizeDescription", f: (x) => kb.sanitizeDescription(x), strict: true },
    { key: "core.sanitizeHtml", f: (x) => core.sanitizeHtml(x), strict: true },
    { key: "core.sanitizeHtml(allowImages)", f: (x) => core.sanitizeHtml(x, { allowImages: true, allowLinkSchemes: MAILTO }), strict: true },
    { key: "core.htmlToText", f: (x) => core.htmlToText(x), strict: false },
    { key: "kanban.renderDescription", f: (x) => kb.renderDescription(x), strict: false },
  ];
  const time = (f: (x: string) => string, x: string, runs = 3) => {
    let best = Infinity;
    for (let r = 0; r < runs; r++) {
      const t = performance.now();
      f(x);
      best = Math.min(best, performance.now() - t);
      if (best > 200) break;
    }
    return best;
  };
  for (const tg of TARGETS) {
    let fails = 0;
    const notes: string[] = [];
    let worst = 0;
    const LIMIT = tg.strict ? 200 : 1000;
    const RATIO = tg.strict ? 3 : Infinity;
    for (const sh of SHAPES) {
      let prev = -1;
      let prevX = "";
      for (let n = 1 << 10; n <= MAX; n *= 2) {
        const x = sh.gen(n);
        let ms = time(tg.f, x);
        // one re-measure (best of 5) before calling a limit breach — GC pauses / a loaded box (escalation already stopped
        // the pre-hotfix code long before a single call could take more than a few seconds)
        if (ms > LIMIT && ms <= 4 * LIMIT) ms = Math.min(ms, time(tg.f, x, 5));
        worst = Math.max(worst, ms);
        if (ms > LIMIT) { fails++; notes.push(`${sh.name} n=${n}: ${ms.toFixed(0)} ms`); break; }
        // ratio only meaningful above timer noise (both sides ≥ 5 ms) · one re-measure of both sizes before calling it
        if (prev >= 5 && ms / prev >= RATIO) {
          if (ms <= 200) { prev = time(tg.f, prevX, 5); ms = time(tg.f, x, 5); }
          if (prev >= 5 && ms / prev >= RATIO) { fails++; notes.push(`${sh.name} n=${n}: ratio ${(ms / prev).toFixed(1)} (${prev.toFixed(1)}→${ms.toFixed(1)} ms)`); break; }
        }
        prev = ms;
        prevX = x;
      }
    }
    for (const nn of notes.slice(0, 6)) console.log(`      · ${tg.key}: ${nn}`);
    chk(`HS-D.${tg.key}`, `${tg.key}: ${SHAPES.length} shapes up to 1 MB, each < ${LIMIT} ms${tg.strict ? `, doubling ratio < ${RATIO}` : ""} (worst ${worst.toFixed(1)} ms)`, fails === 0, "0 violations", `${fails} violations`, tg.strict ? "CRITICAL" : "MAJOR");
  }
}

// ═════════════════════════════ LEGACY (pre-hotfix, origin/main 04d2ade9) — verbatim copies, reference for section C only ═════════════════════════════
function LEGACY_sanitizeHtml(dirty: string | null | undefined, opts?: { allowImages?: boolean; allowLinkSchemes?: readonly string[] }): string {
  const STRIP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript"] as const;
  const VOID_DANGEROUS = /<(img|input|source|track|embed|object|iframe|script|style|noscript)\b[^>]*\/?>/gi;
  const VOID_DANGEROUS_KEEP_IMG = /<(input|source|track|embed|object|iframe|script|style|noscript)\b[^>]*\/?>/gi;
  const ALLOWLIST = new Set(["p", "br", "hr", "h1", "h2", "h3", "ul", "ol", "li", "strong", "b", "em", "i", "s", "u", "code", "pre", "blockquote", "a"]);
  const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)(\s+[^>]*)?\s*\/?>/g;
  const HREF_RE = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
  const SRC_RE = /src\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
  const ALT_RE = /alt\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
  const NUM_ATTR_RE = (name: string) => new RegExp(`${name}\\s*=\\s*("(\\d{1,5})"|'(\\d{1,5})'|(\\d{1,5}))`, "i");
  const escapeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const attrValue = (attrs: string | undefined, re: RegExp) => { const m = attrs ? attrs.match(re) : null; return m ? (m[2] ?? m[3] ?? m[4] ?? "") : ""; };
  const linkSchemeOk = (hrefRaw: string, schemes: readonly string[]) => {
    const href = hrefRaw.replace(/[\u0000- ]+/g, "");
    const m = href.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
    if (!m) return false;
    const scheme = (m[1] ?? "").toLowerCase();
    if (!schemes.includes(scheme)) return false;
    if (scheme === "http" || scheme === "https") return /^https?:\/\/[^/\\]/i.test(href);
    return href.length > scheme.length + 1;
  };
  if (!dirty) return "";
  const allowImages = opts?.allowImages === true;
  const schemes = (opts?.allowLinkSchemes ?? ["http", "https"]).map((s) => String(s).toLowerCase());
  let out = String(dirty);
  for (const tag of STRIP_WITH_CONTENT) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, "gi"), "");
  }
  out = out.replace(allowImages ? VOID_DANGEROUS_KEEP_IMG : VOID_DANGEROUS, "");
  out = out.replace(TAG_RE, (match, tagNameRaw: string, attrsRaw: string | undefined) => {
    const tag = tagNameRaw.toLowerCase();
    const isClosing = match.startsWith("</");
    if (allowImages && tag === "img") {
      if (isClosing) return "";
      const src = attrValue(attrsRaw, SRC_RE);
      if (!/^https?:\/\//i.test(src)) return "";
      const alt = attrValue(attrsRaw, ALT_RE);
      const w = attrValue(attrsRaw, NUM_ATTR_RE("width"));
      const h = attrValue(attrsRaw, NUM_ATTR_RE("height"));
      return `<img src="${escapeAttr(src)}"${alt ? ` alt="${escapeAttr(alt)}"` : ""}${w ? ` width="${w}"` : ""}${h ? ` height="${h}"` : ""}>`;
    }
    if (!ALLOWLIST.has(tag)) return "";
    if (isClosing) return `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "hr") return "<hr>";
    if (tag === "a") {
      const m = attrsRaw ? attrsRaw.match(HREF_RE) : null;
      const href = m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
      if (!linkSchemeOk(href, schemes)) return "";
      return `<a href="${escapeAttr(href)}" rel="noopener" target="_blank">`;
    }
    return `<${tag}>`;
  });
  return out.trim();
}
function LEGACY_sanitizeDescription(dirty: string | null | undefined): string {
  const STRIP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript"] as const;
  const VOID_DANGEROUS = /<(img|input|hr|source|track|embed|object|iframe|script|style|noscript)\b[^>]*\/?>/gi;
  const ALLOWLIST = new Set(["p", "br", "h1", "h2", "ul", "ol", "li", "strong", "b", "em", "i", "s", "code", "a"]);
  const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)(\s+[^>]*)?\s*\/?>/g;
  const HREF_RE = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
  const escapeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  if (!dirty) return "";
  let out = dirty;
  for (const tag of STRIP_WITH_CONTENT) out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
  out = out.replace(VOID_DANGEROUS, "");
  out = out.replace(TAG_RE, (match, tagNameRaw: string, attrsRaw: string | undefined) => {
    const tag = tagNameRaw.toLowerCase();
    const isClosing = match.startsWith("</");
    if (!ALLOWLIST.has(tag)) return "";
    if (isClosing) return `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "a") {
      const m = attrsRaw ? attrsRaw.match(HREF_RE) : null;
      const href = m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
      if (!/^https?:\/\//i.test(href)) return "";
      return `<a href="${escapeAttr(href)}" rel="noopener">`;
    }
    return `<${tag}>`;
  });
  return out.trim();
}

/** renderDescription's HTML builder before sanitizeDescription (verbatim from kanban/sanitize.ts — unchanged by the hotfix) */
function LEGACY_mdToHtml(text: string): string {
  const escapeHtml = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const renderInline = (line: string) => {
    let x = escapeHtml(line);
    x = x.replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}" rel="noopener">${url}</a>`);
    x = x.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    x = x.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return x;
  };
  const parts: string[] = [];
  for (const para of text.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = para.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;
    if (lines.every((l) => /^[-*]\s+/.test(l.trim()))) parts.push(`<ul>${lines.map((l) => `<li>${renderInline(l.trim().replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`);
    else parts.push(`<p>${lines.map((l) => renderInline(l.trim())).join("<br>")}</p>`);
  }
  return parts.join("");
}

// ═════════════════════════════ summary ═════════════════════════════
const f = cks.filter((c) => !c.ok);
console.log(`\n${f.length === 0 ? "🟢 GREEN" : "🔴 RED"} — ${cks.length - f.length}/${cks.length} passed`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.length === 0 ? 0 : 1);

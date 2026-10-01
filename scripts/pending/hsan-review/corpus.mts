// @ts-nocheck
// corpus.mts — handcrafted parser-differential vectors + seeded grammar fuzzer (shared by attack.mts / sqlcheck.mts)
// ───────────────────────── 1. handcrafted parser-differential vectors ─────────────────────────
export const SCHEMES = [
  "javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "\u0001javascript:alert(1)", "\u0000javascript:alert(1)",
  "java\tscript:alert(1)", "java\nscript:alert(1)", "java\rscript:alert(1)", "jav&#x09;ascript:alert(1)", "jav&#9;ascript:alert(1)",
  "jav&Tab;ascript:alert(1)", "java&NewLine;script:alert(1)", "javascript&colon;alert(1)", "javascript&colon alert(1)", "&#106avascript:alert(1)",
  "&#x6A;avascript:alert(1)", "&#0000106;avascript:alert(1)", "&#x0006A;avascript:alert(1)", "javascript&#58;alert(1)", "javascript&#x3a;alert(1)",
  "javascript&#x3A alert(1)", "​javascript:alert(1)", "﻿javascript:alert(1)", " javascript:alert(1)", "‮javascript:alert(1)",
  "java\u0000script:alert(1)", "vbscript:msgbox(1)", "data:text/html,<script>alert(1)</script>", "data:text/html;base64,PHNjcmlwdD4=",
  "blob:https://x/1", "filesystem:https://x/t", "//evil.example/phish", "\\\\evil.example", "/\\evil.example", "https:evil.example",
  "http:\\\\evil.example", "https:/\\evil.example", "http://ok.example/a?b=1&amp;c=2", "https://ok.example/&lt;x&gt;", "https://ok/&quot;onmouseover=alert(1)",
  "mailto:a@b.c", "tel:+6612", "mailto:javascript:alert(1)", "https://x/\u0000", "h&#x74;tps://x", "http&#58;//x", "javas­cript:alert(1)",
  "&#x2F;&#x2F;evil", "javascript:/*http://x*/alert(1)", "http://x\"onmouseover=\"alert(1)", "http://x' onmouseover='alert(1)", "http://x`onmouseover=1",
];
const QUOTES = (v: string) => [`"${v}"`, `'${v}'`, v.replace(/\s/g, ""), `\`${v}\``, `"${v}`, `${v}"`];
const SEPS = [" ", "/", "\t", "\n", "\r", "\f", "\u000b", " ", " ", "　", "/ /", "\u0000", "//"];
export function vectors(): string[] {
  const v: string[] = [];
  for (const s of SCHEMES) for (const q of QUOTES(s)) for (const sep of [" ", "/", "\n", " "]) {
    v.push(`<a${sep}href=${q}>x</a>`);
    v.push(`<img${sep}src=${q}${sep}alt=x>`);
  }
  for (const sep of SEPS) {
    for (const tag of ["svg", "details", "img", "p", "a", "b", "x-y", "o:p", "math", "body", "video", "pre", "code", "li", "h3", "u", "blockquote"]) {
      v.push(`<${tag}${sep}onload=alert(1)${sep}onerror=alert(1)${sep}ontoggle=alert(1)${sep}open${sep}src=x>t</${tag}>`);
      v.push(`<${tag}${sep}style=x:expression(alert(1))>t`);
    }
  }
  v.push(
    // attribute value containing `>` / backtick / unbalanced quotes
    `<a href="https://x>"onmouseover=alert(1)>y</a>`, `<a href='https://x>'onmouseover=alert(1)>y</a>`, `<a title="><img src=x onerror=alert(1)>">x</a>`,
    `<p title="</p><script>alert(1)</script>">`, `<a href=https://x\`onmouseover=alert(1)\`>`, `<a href="https://x' onmouseover='alert(1)">`,
    `<a href="https://x"" onmouseover=alert(1)>`, `<p a="b'c>d<img src=x onerror=alert(1)>`, `<b x='>'><img src=x onerror=alert(1)></b>`,
    // entities that a later stage could decode
    `&lt;img src=x onerror=alert(1)&gt;`, `&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;`, `&#x3c;svg onload=alert(1)&#x3e;`, `&#60;svg/onload=alert(1)>`,
    `&lt;svg/onload=alert(1)&gt;`, `<p>&lt</p>`, `<a href="https://x/&#x22;&#x3e;&#x3c;svg onload=alert(1)&#x3e;">x</a>`,
    // comments / CDATA / PI / doctype / bogus
    `<!--><img src=x onerror=alert(1)>-->`, `<!---><img src=x onerror=alert(1)>-->`, `<!-- --!><img src=x onerror=alert(1)>`, `<!--<!--><img src=x onerror=alert(1)>-->`,
    `<![CDATA[><img src=x onerror=alert(1)>]]>`, `<?xml ><img src=x onerror=alert(1)>?>`, `<!DOCTYPE html><img src=x onerror=alert(1)>`, `</ x><img src=x onerror=alert(1)>`,
    `</a/onclick=alert(1)>`, `</p title="><img src=x onerror=alert(1)>">`, `<!--`, `<!--x`, `<!`, `</`, `<`, `<a`, `<a href="https://x`, `<<a>a href=javascript:alert(1)>x`,
    `<<script>script>alert(1)<</script>/script>`, `<scr<script>ipt>alert(1)</scr</script>ipt>`, `<script>alert(1)</script/>`, `<script>alert(1)</script x>`,
    `<script>alert(1)</SCRIPT >tail`, `<style><a href="</style><img src=x onerror=alert(1)>">`, `<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>`,
    `<iframe srcdoc="<script>alert(1)</script>"></iframe>`, `<object data=javascript:alert(1)>`, `<embed src=javascript:alert(1)>`, `<script src=//x></script>`,
    // namespace confusion — allowlisted children never re-open svg/math
    `<svg><p><style><img src=x onerror=alert(1)></style></p></svg>`, `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>`,
    `<svg></p><style><a id="</style><img src=x onerror=alert(1)>">`, `<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>`,
    `<pre><svg onload=alert(1)></pre>`, `<code><script>alert(1)</script></code>`, `<pre>\n<img src=x onerror=alert(1)></pre>`, `<code>&lt;b&gt;</code>`,
    `<template><img src=x onerror=alert(1)></template>`, `<textarea><img title="</textarea><img src=x onerror=alert(1)>">`, `<title><img title="</title><img src=x onerror=alert(1)>">`,
    `<xmp><img title="</xmp><img src=x onerror=alert(1)>">`, `<plaintext><img src=x onerror=alert(1)>`, `<noembed><img title="</noembed><img src=x onerror=alert(1)>">`,
    // NUL / BOM / zero-width / RTL / Kelvin in tag names
    `<a\u0000 href=javascript:alert(1)>x`, `<scr\u0000ipt>alert(1)</script>`, `<\u0000script>alert(1)</script>`, `<﻿svg onload=alert(1)>`, `<svg​onload=alert(1)>`,
    `<Kbd onclick=1>`, `<p‮onclick=1>`, `<ſcript>alert(1)</ſcript>`, `<İmg src=x onerror=alert(1)>`, `<a href="https://x" \u0000onclick=alert(1)>`,
    // case / duplicates / weird names
    `<A HREF="javascript:alert(1)">x</A>`, `<a href="https://ok" href="javascript:alert(1)">x</a>`, `<a href="javascript:alert(1)" href="https://ok">x</a>`,
    `<a data-href="https://ok" href="javascript:alert(1)">x</a>`, `<a =href="https://ok" href=javascript:alert(1)>x</a>`, `<a href = "https://ok" >x</a>`,
    `<a href\n=\n"https://ok"\n>x</a>`, `<a hReF=https://ok>x</a>`, `<img src="https://x" width="1 onerror=alert(1)" height=2x>`, `<img src=https://x width=12345678>`,
    `<a href="https://x">a<a href="https://y">b</a></a>`, `<p><p><p>`, `</p></p>`, `<br/><hr/><br />`,
    // markdown-lite specific (renderDescription input is text)
    `**https://x**`, `*https://x" onmouseover="alert(1)*`, `https://x"><img src=x onerror=alert(1)>`, `- https://x/?a=1&b=2`, `**<b>**`, `https://x/&lt;svg&gt;`,
  );
  return v;
}

// ───────────────────────── 2. grammar fuzzer (seeded) ─────────────────────────
export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TAGN = ["a", "p", "b", "i", "img", "pre", "code", "br", "hr", "li", "ul", "h1", "h3", "u", "blockquote", "A", "IMG", "script", "SCRIPT", "style", "svg", "math", "iframe",
  "details", "x-y", "o:p", "noscript", "textarea", "title", "xmp", "plaintext", "template", "object", "embed", "body", "video", "scr\u0000ipt", "Kbd", "ſcript", "a ", "a​"];
const ATTRN = ["href", "src", "HREF", "onload", "onerror", "onclick", "ontoggle", "onmouseover", "style", "rel", "target", "alt", "width", "height", "xlink:href",
  "formaction", "data-href", "=", "\"", "'", "<", "open", "srcdoc", "on\u0000load", "href\u0000"];
const SEPF = ["", " ", "/", "\t", "\n", "\r", "\f", "\u000b", " ", " ", "\u0000", "//", "  ", "/ "];
const TXT = ["x", "<", ">", "&", "&lt;", "&amp;lt;", "&#60;", "&#x3c;", "-->", "--!>", "<!--", "<!", "<?", "</", "]]>", "<![CDATA[", "ราคา < 500 บาท", "\u0000", "`",
  "\"", "'", "=", "&colon;", "&Tab;", "&NewLine;", "&#106", "javascript:", "alert(1)", "\n\n", "- ", "**", "*", "https://ok.example/?a=1&b=2", "</script>", "</style >",
  "</script/>", "</a>", "</p>", "</SCRIPT>", "<\\/script>"];
export function fuzzInput(r: () => number): string {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;
  const parts: string[] = [];
  const nParts = 1 + Math.floor(r() * 10);
  for (let p = 0; p < nParts; p++) {
    const k = r();
    if (k < 0.35) parts.push(pick(TXT));
    else {
      let t = "<" + (r() < 0.2 ? "/" : "") + pick(TAGN);
      const na = Math.floor(r() * 4);
      for (let a = 0; a < na; a++) {
        t += pick(SEPF) || " ";
        t += pick(ATTRN);
        if (r() < 0.8) {
          t += pick(["=", " = ", "=\n", "==", "/="]);
          const val = r() < 0.6 ? pick(SCHEMES) : pick(TXT);
          const q = r();
          t += q < 0.35 ? `"${val}"` : q < 0.6 ? `'${val}'` : q < 0.8 ? val : q < 0.9 ? `"${val}` : `\`${val}\``;
        }
      }
      if (r() < 0.2) t += pick(SEPF) + "/";
      if (r() < 0.9) t += ">";
      parts.push(t);
    }
  }
  let s = parts.join(r() < 0.5 ? "" : pick(["", " ", "\n"]));
  // byte-level mutations
  const muts = Math.floor(r() * 3);
  for (let m = 0; m < muts; m++) {
    const pos = Math.floor(r() * (s.length + 1));
    const op = r();
    if (op < 0.4) s = s.slice(0, pos) + pick(["<", ">", "\"", "'", "/", "=", "&", "\u0000", " ", "\n", "-", "!", "?", "`"]) + s.slice(pos);
    else if (op < 0.7) s = s.slice(0, pos) + s.slice(pos + 1);
    else s = s.slice(0, pos) + s.slice(pos, pos + 1 + Math.floor(r() * 6)).repeat(2) + s.slice(pos + 1 + Math.floor(r() * 6));
  }
  return s;
}

/** handcrafted vectors + n fuzz inputs from `seed` */
export function vectorsAndFuzz(n: number, seed = 0x5a11c0de): string[] {
  const r = mulberry32(seed);
  const out = vectors();
  for (let i = 0; i < n; i++) out.push(fuzzInput(r));
  return out;
}

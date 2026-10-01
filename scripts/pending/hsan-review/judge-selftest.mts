// @ts-nocheck
// positive/negative controls for judge.mts — a judge that flags nothing proves nothing
import { judge, tokenize, browserScheme, decodeText } from "./judge.mts";
const M = {
  key: "core", tags: new Set(["p","a","br","b","img"]), attrs: { a: new Set(["href","rel","target"]), img: new Set(["src","alt"]) },
  schemes: new Set(["http","https"]), urlAttrs: new Set(["href","src"]), required: { a: { rel: "noopener" } },
};
const MUST_FLAG = [
  `<svg/onload=alert(1)>`, `<details/open/ontoggle=alert(1)>`, `<a href="jav&#x09;ascript:alert(1)" rel="noopener">x</a>`,
  `<a href="&#106avascript:alert(1)" rel="noopener">`, `<a href=" javascript:alert(1)" rel="noopener">`, `<a href="java&Tab;script:x" rel="noopener">`,
  `<a href="javascript&colon;x" rel="noopener">`, `<a href="&#x6A;avascript:x" rel="noopener">`, `<a href="&#0000106;avascript:x" rel="noopener">`,
  `<a href=javascript:x rel=noopener>`, `<a/href=javascript:x/rel=noopener>`, `<p onclick=x>`, `<p/onclick=x>`, `<a href="x" rel="noopener" onmouseover=1>`,
  `<!--x-->`, `<!DOCTYPE html>`, `<?x?>`, `</ x>`, `<a rel="noopener" href="&NewLine;javascript:x">`, `<img src="data:image/svg+xml,x">`,
  `<P ONCLICK=1>`, `<a href="vbscript:x" rel="noopener">`, `<x-y onclick=1>`, `<style>`, `<textarea>`, `<math>`, `<p\tonclick=1>`, `<p\nonclick=1>`, `<p\fonclick=1>`,
  `<a href="https://x" rel="noopener" =onclick=1>`, `<b "onclick=1>`, `<a href=" &#1;javascript:x" rel="noopener">`, `<a href="jav&#13;ascript:x" rel="noopener">`,
];
const MUST_PASS = [
  `<p>a &lt;svg onload=1&gt;</p>`, `<a href="https://x.com/?a=1&amp;b=2" rel="noopener" target="_blank">x</a>`, `x &lt;5 &amp; y`, `<br><b>b</b>`,
  `<img src="https://x/y.png" alt="&quot;&lt;&gt;&#39;">`, `<a href="http://x" rel="noopener">&lt;script&gt;</a>`, `a&lt;!--b--&gt;`,
  `<a href="https://x/&amp;colon;" rel="noopener">`, `<a href="https://x/?q=&quot;onmouseover=1" rel="noopener">`,
];
let bad = 0;
for (const x of MUST_FLAG) { const v = judge(x, M); if (!v.length) { bad++; console.log("❌ judge MISSED", JSON.stringify(x)); } }
for (const x of MUST_PASS) { const v = judge(x, M); if (v.length) { bad++; console.log("❌ judge FALSE POSITIVE", JSON.stringify(x), v); } }
// tokenizer spot checks
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log("❌", m, JSON.stringify(a), "≠", JSON.stringify(b)); } };
eq(browserScheme("\u0001 jav\tas\ncript:x"), "javascript", "scheme trim/strip");
eq(browserScheme("java\u0001script:x"), null, "inner C0 not stripped");
eq(decodeText("&notit; &notin; &amp &ampx &#128; &#x0;", false), "¬it; ∉ & &x € �", "text charrefs");
eq(decodeText("&ampx=&amp=&amp &colon;", true), "&ampx=&amp=& :", "attr charrefs historical rule");
eq(tokenize(`<a href="x>y">`).toks[0].attrs[0].value, "x>y", "quoted > inside value");
eq(tokenize(`<a b='1'c=2>`).toks[0].attrs.map((a) => a.name), ["b", "c"], "after quoted no space");
eq(tokenize(`<!-- a --!> <b>`).toks.map((t) => t.t), ["comment", "text", "start"], "--!> ends comment");
eq(tokenize(`<a b=1 b=2>`).toks[0].attrs.length, 1, "duplicate attr dropped");
console.log(bad ? `JUDGE SELFTEST FAIL ${bad}` : `JUDGE SELFTEST OK (${MUST_FLAG.length} must-flag · ${MUST_PASS.length} must-pass · tokenizer spot checks)`);
process.exit(bad ? 1 : 0);

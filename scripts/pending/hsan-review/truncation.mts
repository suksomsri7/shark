// @ts-nocheck
// truncation.mts — Item 3c: does cutting inbound HTML at an arbitrary offset (the 1,000,000-char cap) ever yield unsafe
// output? Every prefix of every handcrafted vector (+ 3 000 fuzz inputs) through the inbound mode, judged; plus a lone
// surrogate at the cut and the worst shapes exactly at the cap.
import { judge } from "./judge.mts";
import { vectors, vectorsAndFuzz } from "./corpus.mts";
const core = (await import("@/lib/core/sanitize" as string)) as any;
const MODE = { key: "inbound", tags: new Set(["p","br","hr","h1","h2","h3","ul","ol","li","strong","b","em","i","s","u","code","pre","blockquote","a","img"]),
  attrs: { a: new Set(["href","rel","target"]), img: new Set(["src","alt","width","height"]) }, schemes: new Set(["http","https","mailto","tel"]), urlAttrs: new Set(["href","src"]) };
const run = (x: string) => core.sanitizeHtml(x.slice(0, 1_000_000), { allowImages: true, allowLinkSchemes: ["http","https","mailto","tel"] });
let n = 0, bad = 0;
for (const x of vectorsAndFuzz(3000)) for (let k = 0; k <= x.length; k++) {
  n++;
  const out = run(x.slice(0, k));
  const v = judge(out, MODE).filter((y) => y.cls === "XSS");
  if (v.length) { bad++; if (bad < 5) console.log("❌", JSON.stringify(x.slice(0, k)), "→", JSON.stringify(out), v[0].what); }
}
console.log(`prefix truncation: ${n} prefixes judged → XSS ${bad}`);
const sur = "a".repeat(999_999) + "😀tail";
const o = run(sur);
console.log(`lone surrogate at the cut: output ends with U+${o.charCodeAt(o.length - 1).toString(16)} (lone high surrogate → UTF-8 encoders write U+FFFD; no throw)`);
for (const [k, x] of [["<a ×n", "<a ".repeat(400000)], ["<×n", "<".repeat(1_200_000)], ["<a/×n", "<a/".repeat(400000)], ["<p><b>×n", "<p><b>".repeat(200000)]] as const) {
  const t = performance.now(); const h = x.slice(0, 1_000_000); core.sanitizeHtml(h, { allowImages: true }); core.htmlToText(h);
  console.log(`at cap ${k}: sanitizeHtml+htmlToText ${(performance.now() - t).toFixed(0)} ms`);
}

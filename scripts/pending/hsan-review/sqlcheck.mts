// @ts-nocheck
// sqlcheck.mts — does the builder's read-only finder regex (hotfix note "Stored data") catch the shapes that are actually
// dangerous in stored rows? Two populations: (a) LEGACY sanitizer output (rows written via sanitize-at-write on prod) and
// (b) RAW input (rows written with no sanitizer: REST create/AI/templates/copies). "Dangerous" = own judge on the stored
// string as the browser would render it via innerHTML (XSS-class violation). Run: pnpm exec tsx scripts/pending/hsan-review/sqlcheck.mts
import { exploitable } from "./exploitable.mts";
const legacyCore = (await import("./legacy/core-sanitize.legacy.ts" as string)) as any;
const legacyKb = (await import("./legacy/kanban-sanitize.legacy.ts" as string)) as any;
const SQL_RE = /<[a-z][^\s>\/]*\/|<[a-z][a-z0-9]*[-:]|<(svg|math|details|video|audio|body|iframe|object|embed|form|input|select|textarea|marquee|meta|base|link|style|script|img)[\s\/>]|\son[a-z]+\s*=|javascript:|vbscript:|data:text/i;
// reviewer's proposed pattern (adds: handlers after any separator/quote, entity-obfuscated schemes, any tag re-assembled with on*)
// reviewer's proposed pattern — handlers after any separator/quote; entity/whitespace-obfuscated javascript:/vbscript: (letter-by-letter); data:
const SEP = "(\\s|&[a-z]+;?|&#0*[0-9]+;?|&#x0*[0-9a-f]+;?)*";
const L = (ch: string) => { const u = ch.toUpperCase().charCodeAt(0), l = ch.toLowerCase().charCodeAt(0); return `(${ch}|&#0*(${l}|${u});?|&#x0*(${l.toString(16)}|${u.toString(16)});?)`; };
const word = (w: string) => [...w].map(L).join(SEP) + SEP + "(:|&colon;?|&#0*58;?|&#x0*3a;?)";
export const REVIEWER_SQL_RE_SOURCE = "<[a-z][^\\s>/]*/|<[a-z][a-z0-9]*[-:]|<(svg|math|details|video|audio|body|iframe|frame|object|embed|form|input|button|select|textarea|marquee|meta|base|link|style|script|img|template|isindex|xmp|noembed|noframes|plaintext|title)[\\s/>]|[\\s/\"'`]on[a-z]+\\s*=|" + word("javascript") + "|" + word("vbscript") + "|data:";
const SQL_RE2 = new RegExp(REVIEWER_SQL_RE_SOURCE, "i");
const ALL = ["p","br","hr","h1","h2","h3","ul","ol","li","strong","b","em","i","s","u","code","pre","blockquote","a","img"];
const M = { key: "stored", tags: new Set(ALL), attrs: { a: new Set(["href","rel","target"]), img: new Set(["src","alt","width","height"]) }, schemes: new Set(["http","https","mailto","tel"]), urlAttrs: new Set(["href","src"]) };
const { vectorsAndFuzz } = await import("./corpus.mts");
const inputs: string[] = vectorsAndFuzz(Number(process.env.N ?? 100000));
const pops: [string, (s: string) => string][] = [
  ["legacy kanban sanitizeDescription", (s) => legacyKb.sanitizeDescription(s)],
  ["legacy core sanitizeHtml", (s) => legacyCore.sanitizeHtml(s)],
  ["RAW (unsanitised write paths)", (s) => s],
];
for (const [name, f] of pops) {
  let dangerous = 0, miss = 0, miss2 = 0;
  const ex: string[] = [];
  const ex2: string[] = [];
  const seen = new Set<string>();
  for (const x of inputs) {
    const stored = f(x);
    const w = exploitable(stored);
    if (!w) continue;
    const v = [{ what: w }];
    dangerous++;
    if (!SQL_RE.test(stored)) {
      miss++;
      const k = v[0].what.replace(/^<[^ >]*/, "").replace(/=.*$/, "") || v[0].what;
      if (!seen.has(k) && ex.length < 14) { seen.add(k); ex.push(`      ${v[0].what.slice(0, 90)}  ← stored ${JSON.stringify(stored.slice(0, 120))}`); }
    }
    if (!SQL_RE2.test(stored)) { miss2++; if (ex2.length < 6) ex2.push(`      [reviewer miss] ${v[0].what.slice(0, 60)} ← ${JSON.stringify(stored.slice(0, 150))}`); }
  }
  console.log(`${name}: ${inputs.length} inputs → ${dangerous} stored values EXPLOITABLE under innerHTML · builder SQL misses ${miss} · reviewer SQL misses ${miss2}`);
  for (const e of ex) console.log(e);
  for (const e of ex2) console.log(e);
}

console.log("\nREVIEWER PATTERN (Postgres ARE, use with ~*; double the single quote inside a SQL literal):\n" + REVIEWER_SQL_RE_SOURCE);
// noise check on benign production-shaped text
const benign = ["January meeting: ราคา 500", "Java developer: นัดคุย", "ข้อมูล data: ลูกค้า", "<p>ตามที่คุยกัน on Monday = ok</p>", "<a href=\"https://x\">x</a>", "<p>สวัสดี<br/>ครับ</p>", "<o:p></o:p>"];
console.log("noise on benign samples: " + benign.map((b) => `${SQL_RE2.test(b) ? "HIT" : "-"} ${JSON.stringify(b)}`).join(" · "));

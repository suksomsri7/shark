// C5.5-fix5 — pure probe (no DB queries): the quadratic-regex / uncapped-input class of review C5.5-fix4 (RV-1 · RV-2 · RV-9 + sweep).
// For every site: (G) growth — time(4n) / time(n) on the pathological pump must stay near-linear (< 8; quadratic ≈ 16) ·
// (E) equality — the rewritten code gives byte-identical output to the b8e8ad52 expression (`legacy-b8e8.ts`) on realistic +
// weird-but-valid + seeded-random corpora · (S) static — the site no longer carries a regex tag-strip / angle-parse literal.
// Private sites (kanban-email-in · core/email · emails.ts refIdsOf/auth pairs · thread page) are measured on the regex literal
// still in the file (unfixed ⇒ RED) or on the helper the file now calls (fixed).
// A snapshot of every exported site function's outputs is written per run (label) and compared to the base snapshot if given.
// Run (pure, env only for module load): bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf6/probe-cf6-linear.mts <label> [baseLabel]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";

const LABEL = process.argv[2] ?? "run";
const BASE = process.argv[3] ?? null;
const SNAPDIR = "/tmp/cf6-logs";
mkdirSync(SNAPDIR, { recursive: true });

const opt = async (p: string) => { try { return (await import(p as string)) as Any; } catch (e) { console.log(`   (import ${p} failed: ${e instanceof Error ? e.message.slice(0, 120) : e})`); return null; } };
const L = (await import("./legacy-b8e8.ts" as string)) as Any;
const IA = await opt("@/lib/core/inbound-address");
const LT = await opt("@/lib/core/linear-text");
const SHARED = await opt("@/lib/modules/crm/emails-shared");
const CS = await opt("@/lib/modules/crm/contacts-shared");
const SAN = await opt("@/lib/core/sanitize");
const LOGO = await opt("@/lib/branding/logo");
const CARDS = await opt("@/lib/modules/kanban/cards");

const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual.slice(0, 1500)}`);
};
const j = (v: unknown) => JSON.stringify(v);

// ───────────── timing: growth ratio between n and 4n (min of 3; a run > 150 ms is not repeated) ─────────────
function best(f: (s: string) => unknown, s: string): number {
  let b = Infinity;
  for (let k = 0; k < 3; k++) {
    const a = performance.now();
    f(s);
    const d = performance.now() - a;
    b = Math.min(b, d);
    if (d > 150) break;
  }
  return b;
}
type G = { n: number; a: number; b: number; ratio: number; linear: boolean };
function growth(f: (s: string) => unknown, mk: (n: number) => string, n = 8000): G {
  const s1 = mk(n), s2 = mk(4 * n);
  best(f, s1); // warm-up (JIT)
  const a = best(f, s1);
  const b = best(f, s2);
  const ratio = b / Math.max(a, 0.005);
  // linear: ×4 input ⇒ ≈×4 time; quadratic ⇒ ≈×16 · below 3 ms at 4n is timer noise either way
  return { n, a, b, ratio, linear: b < 3 || ratio < 8 };
}
const gs = (g: G) => `n=${g.n}: ${g.a.toFixed(2)} ms → 4n: ${g.b.toFixed(2)} ms (×${g.ratio.toFixed(1)})`;

// ───────────── seeded PRNG corpora ─────────────
let seed = 0x5eed_cf6;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
const randStr = (alpha: readonly string[], maxLen: number) => { let s = ""; const n = Math.floor(rnd() * (maxLen + 1)); for (let i = 0; i < n; i++) s += pick(alpha); return s; };

// ───────────── static: regex tag-strip / angle-parse literals left in a file ─────────────
const FORBIDDEN = /<(?:[A-Za-z]+|\()?(?:\[\^>\]|\.|\[\\s\\S\]|\[\\S\\s\])[*+]/;
function regexLiterals(file: string): { line: number; text: string }[] {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { line: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: node.getText(sf) });
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
const forbiddenIn = (file: string) => regexLiterals(file).filter((r) => FORBIDDEN.test(r.text.slice(1, r.text.lastIndexOf("/"))));
const literalIn = (file: string, exact: string) => regexLiterals(file).some((r) => r.text === exact);
const compile = (lit: string) => new RegExp(lit.slice(1, lit.lastIndexOf("/")), lit.slice(lit.lastIndexOf("/") + 1));

const snap: Record<string, string> = {};
const record = (key: string, outs: unknown[]) => { snap[key] = createHash("sha256").update(j(outs)).digest("hex"); };

// ════════════════ corpora ════════════════
const NAMES = ["สมชาย ใจดี", "Somchai Jaidee", "\"สมชาย, ใจดี\"", "'Ann O'Neil'", "\"Dr. A. B. (Sales)\"", "José Ñúñez", "李雷", "", "  ", "\"\"", "Name With  Spaces", "\"Quoted \\\"inner\\\" name\"", "ก<ข", "a>b", "=?UTF-8?B?4Liq4Lih4LiK4Liy4Lii?=", "(comment) Name"];
const ADDRS = ["a@b.co", "Somchai.K+tag@Example.COM", "crm+abcdefgh@shark.in.th", "crm+abcdefgh+t0123456789ab@shark.in.th", "งาน+abcd2345@shark.in.th", "x@xn--e1afmkfd.xn--p1ai", "\"odd local\"@ex.com", "user@[192.168.0.1]", "a@b", "@", "", "no-at-sign", "UPPER@CASE.TEST"];
const ADDR_CORPUS: string[] = [];
for (const n of NAMES) for (const a of ADDRS) {
  ADDR_CORPUS.push(`${n} <${a}>`, `${n}<${a}>`, `${n} <${a}> `, `${n}\t<${a}>\r\n`, `${n} <${a}> (comment)`, `${n} < ${a} >`, `${a}`, ` ${a} `, `<${a}>`, `${n} <${a}>\u00a0`, `${n}\n<${a}>`, `${n} <<${a}>>`, `${n} <${a}> <${a}>`, `"${n} <x@y.z>" <${a}>`, `${n} <${a}`, `${n} ${a}>`, `${n} <>`, `\ufeff${n} <${a}>\u2028`);
}
const ADDR_ALPHA = ["<", ">", " ", "\t", "\n", "\r", "\u00a0", "\u2028", "\u2029", "\ufeff", "a", "B", "@", ".", "\"", "'", "ก", "(", ")", ",", ";", ":", "\\", "+"];
for (let i = 0; i < 6000; i++) ADDR_CORPUS.push(randStr(ADDR_ALPHA, 18));

const HTML_REAL = [
  "<p>สวัสดีครับ</p><p>ส่งงานภายในวันศุกร์</p>",
  "<p>รายการ</p><ul><li>หนึ่ง</li><li class=\"x\">สอง &amp; สาม</li></ul>",
  "<ol>\n  <li>a</li>\n  <LI>b</LI>\n</ol>",
  "line1<br>line2<br/>line3<BR />line4<br\t/>",
  "<div>  trailing spaces   \n\t\tand tabs\t \nend</div>",
  "<h1>หัว</h1><h2>รอง</h2><h6>เล็ก</h6><table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>",
  "&nbsp;&quot;q&quot; it&#39;s it&#039;s &lt;tag&gt; &amp;amp; &amp;lt;",
  "<link rel=\"x\"><li>ok</li><lib>",
  "<p>5 < 6 and 7 > 3</p>",
  "<p>unclosed <b",
  "<<>><> <><p></p>",
  "\n\n\n\n<p>gap</p>\n\n\n\n\n<p>gap2</p>\n\n\n",
  "<p>a</p>   \n   <p>b</p>",
  "<blockquote><p>อ้าง</p></blockquote><pre>code   \n  x</pre>",
  "<a href=\"https://ex.com/?a=1&amp;b=2\">ลิงก์</a> &amp; <img src=\"https://i.example/p.png\" alt=\"x\">",
  "<IMG SRC=\"http://x\"> <img alt='a' src=\"https://y\"><img src='https://single'> <img\nsrc=\"https://nl\">",
];
const HTML_ALPHA = ["<", ">", "/", "l", "i", "L", "I", "b", "r", "B", "p", " ", "\t", "\n", "&", ";", "#", "0", "3", "9", "n", "a", "m", "q", "u", "o", "t", "g", "s", "x", "d", "v", "h", "1", "\"", "=", "c", "k", "\r"];
const HTML_CORPUS: string[] = [...HTML_REAL];
for (let i = 0; i < 20000; i++) HTML_CORPUS.push(randStr(HTML_ALPHA, 40));
for (let i = 0; i < 2000; i++) HTML_CORPUS.push(pick(HTML_REAL) + randStr(HTML_ALPHA, 12) + pick(HTML_REAL));
const IMG_ALPHA = ["<", "img", "IMG", " ", ">", "src=\"http:", "src=\"https:", "SRC=\"HTTPS:", "src='https:", "src=\"ftp:", "x", "\n", "src=\"http"];
for (let i = 0; i < 6000; i++) HTML_CORPUS.push(randStr(IMG_ALPHA, 10));

const AUTH_REAL = [
  "mx.shark.in.th; dmarc=pass (p=none) header.from=example.com; spf=pass smtp.mailfrom=example.com; dkim=pass header.i=@example.com",
  "dmarc=pass header.from=\"ex.com\" reason=\"a=b; c\"",
  "spf = pass  smtp.mailfrom = a@b.c (comment)",
  "dkim=pass header.b=abc\\\"def",
  "x=\"unterminated header.from=ex.com",
  "a.b-c_d=e=f=g; h=\"i\\\"j\" k",
];
const AUTH_ALPHA = ["a", "z", "0", ".", "_", "-", "=", " ", "\"", "\\", ";", "x", "\t", "dmarc", "pass", "header.from", "@"];
const AUTH_CORPUS: string[] = [...AUTH_REAL.map((s) => s.toLowerCase())];
for (let i = 0; i < 12000; i++) AUTH_CORPUS.push(randStr(AUTH_ALPHA, 16));

const PII_REAL = ["ติดต่อ somchai@example.com หรือ 081-234-5678", "a@b@c d@e", "\"x@y\" <p@q.r>", "+66 81 234 5678", "email:a.b+c@d.co.th,phone:0812345678", "@@ a@ @b"];
const PII_ALPHA = ["a", "@", " ", ".", "\"", "'", "<", ">", "1", "-", "+", "\n", "ก", "_"];
const PII_CORPUS: string[] = [...PII_REAL];
for (let i = 0; i < 8000; i++) PII_CORPUS.push(randStr(PII_ALPHA, 24));

const SVG_REAL = ["<svg xmlns=\"http://www.w3.org/2000/svg\"><circle r=\"5\"/></svg>", "<svg onload=\"alert(1)\">", "<svg><a xlink:href=\"javascript:alert(1)\">", "<svg><script>1</script>", "<svg button=\"1\" icon=\"2\">", "<svg ONCLICK =x>", "<svg on=1 one=2>", "<svg><g xonx\n=1>", "<svg>on\u00a0x=1", "<svg>onA\u2028=1", "<svg>on1=2 onx_=3"];
const SVG_ALPHA = ["o", "n", "O", "N", "x", "=", " ", "\t", "\n", "a", "<", "s", "c", "r", "i", "p", "t", ":", "1", "_", "\u00a0", "-"];
const SVG_CORPUS: string[] = [...SVG_REAL];
for (let i = 0; i < 12000; i++) SVG_CORPUS.push("<svg>" + randStr(SVG_ALPHA, 14));

// ════════════════ RV-1 · emails-actions.ts catch path ════════════════
{
  const F = "src/lib/modules/crm/emails-actions.ts";
  const src = readFileSync(F, "utf8");
  const head = src.slice(src.indexOf("export async function sendCrmEmailAction"), src.indexOf("/** ลิงก์ชั่วคราวของไฟล์แนบ"));
  const beforeTry = head.slice(0, head.indexOf("  try {"));
  const hits = forbiddenIn(F);
  chk("RV1.S", "sendCrmEmailAction: bodyHtml size checked BEFORE try (same rule as bodyText: crmEmailBodyTooLong) and no regex tag-strip literal left in emails-actions.ts",
    /crmEmailBodyTooLong\(input\.bodyHtml\)/.test(beforeTry) && hits.length === 0, `bodyHtml pre-check=${/crmEmailBodyTooLong\(input\.bodyHtml\)/.test(beforeTry)} · forbidden literals=${j(hits)}`);
  // the catch-path expression as it stands in the file: old literal ⇒ measure it · fixed ⇒ the linear htmlToText on the capped body
  const catchFn = literalIn(F, "/<[^>]*>/g") ? (s: string) => L.actionCatchStrip(s) : (s: string) => SAN.htmlToText(s);
  const g = growth(catchFn, (n) => "<".repeat(n));
  chk("RV1.G", "catch-path body check on `<`×n (no `>`) grows linearly (fix4 review measured ×4.85 per doubling = quadratic)", g.linear, gs(g));
}

// ════════════════ RV-9 · kanban descriptionToText ════════════════
if (CARDS?.descriptionToText) {
  const f = CARDS.descriptionToText as (s: string) => string;
  const pumps: [string, (n: number) => string][] = [["<", (n) => "<".repeat(n)], ["<li", (n) => "<li".repeat(Math.ceil(n / 3))], ["space+x", (n) => " ".repeat(n) + "x"], ["<a + spaces", (n) => "<a" + " ".repeat(n)], ["<br + spaces", (n) => "<br" + " ".repeat(n)]];
  const res = pumps.map(([k, mk]) => [k, growth(f, mk)] as const);
  chk("RV9.G", "descriptionToText linear on every pump (`<`×n · `<li`×n · spaces then x · `<a`+spaces · `<br`+spaces)", res.every(([, g]) => g.linear), res.map(([k, g]) => `${k}: ${gs(g)}`).join(" | "));
  const diff = HTML_CORPUS.filter((h) => f(h) !== L.descriptionToText(h));
  chk("RV9.E", `descriptionToText byte-identical to b8e8ad52 on ${HTML_CORPUS.length} inputs (16 realistic card bodies · 20 000 random tag/entity/whitespace strings · 2 000 mixed · 6 000 img-ish)`,
    diff.length === 0, `differ=${diff.length} first=${j(diff.slice(0, 3).map((h) => [h, f(h), L.descriptionToText(h)]))}`);
  chk("RV9.S", "kanban/cards.ts carries no regex tag-strip literal", forbiddenIn("src/lib/modules/kanban/cards.ts").length === 0, j(forbiddenIn("src/lib/modules/kanban/cards.ts")));
  record("descriptionToText", HTML_CORPUS.map((h) => f(h)));
} else chk("RV9.G", "descriptionToText importable", false, "import failed");

// ════════════════ sweep · emailSnippet · thread page remote-image test · composer text ════════════════
if (SHARED) {
  const g = growth((s) => SHARED.emailSnippet(null, s), (n) => "<".repeat(n));
  const diff = HTML_CORPUS.filter((h) => SHARED.emailSnippet(null, h, 100000) !== L.snippetStrip(SAN.sanitizeHtml(h)).replace(/\s+/g, " ").trim().slice(0, 100000));
  chk("SW.snippet", "emailSnippet(html only): linear and byte-identical to the b8e8ad52 expression on the HTML corpus", g.linear && diff.length === 0 && forbiddenIn("src/lib/modules/crm/emails-shared.ts").length === 0,
    `${gs(g)} · differ=${diff.length} ${j(diff.slice(0, 2))} · forbidden in emails-shared=${j(forbiddenIn("src/lib/modules/crm/emails-shared.ts"))}`);
  record("emailSnippet", HTML_CORPUS.map((h) => SHARED.emailSnippet(null, h, 100000)));

  const PAGE = "src/app/app/sys/[id]/crm/emails/[threadKey]/page.tsx";
  const remote = literalIn(PAGE, "/<img[^>]+src=\"https?:/i") ? (s: string) => L.REMOTE_IMG_RE.test(s) : SHARED.hasRemoteImages ? (s: string) => SHARED.hasRemoteImages(s) as boolean : null;
  if (remote) {
    const g2 = growth(remote, (n) => "<img".repeat(Math.ceil(n / 4)));
    const diff2 = HTML_CORPUS.filter((h) => remote(h) !== L.REMOTE_IMG_RE.test(h));
    chk("SW.remoteImg", "thread page 'has remote images' test: linear on `<img`×n and identical to /<img[^>]+src=\"https?:/i on the HTML corpus", g2.linear && diff2.length === 0, `${gs(g2)} · differ=${diff2.length} ${j(diff2.slice(0, 3))}`);
  } else chk("SW.remoteImg", "thread page remote-image test resolvable", false, "neither the old literal nor hasRemoteImages()");

  const comp = SHARED.crmEmailHtmlToComposerText as (s: string) => string;
  const g3 = growth(comp, (n) => " ".repeat(n) + "x");
  const g3b = growth(comp, (n) => "\t ".repeat(n / 2) + "x\n");
  chk("SW.composer", "crmEmailHtmlToComposerText linear on a long blank run before text (per-line trailing trim)", g3.linear && g3b.linear, `${gs(g3)} | ${gs(g3b)}`);
  const lines = [...HTML_CORPUS.slice(0, 4000), "a \t ", " \t\t", "x\u00a0 ", "  ", ""];
  const lt = LT?.trimEndBlanks as ((s: string) => string) | undefined;
  const diff3 = lt ? lines.filter((l) => l.split("\n").some((x) => lt(x) !== L.composerLineTrim(x))) : ["helper missing"];
  chk("SW.composer.E", "trimEndBlanks ≡ /[ \\t]+$/g per line on 4 000+ lines", diff3.length === 0, `differ=${diff3.length} ${j(diff3.slice(0, 2))}`);
  record("composer", HTML_CORPUS.slice(0, 8000).map((h) => comp(h)));
}

// ════════════════ RV-2 · header parsers ════════════════
if (IA && SHARED) {
  const gB = growth((s) => IA.bareEmail(s), (n) => "<".repeat(n));
  const gB2 = growth((s) => IA.bareEmail(s), (n) => "<".repeat(n) + ">");
  const dB = ADDR_CORPUS.filter((a) => IA.bareEmail(a) !== L.bareEmail(a));
  chk("RV2.bareEmail", `core bareEmail: linear (\`<\`×n · \`<\`×n+\`>\`) and byte-identical to b8e8ad52 on ${ADDR_CORPUS.length} addresses (Thai/quoted/comments/angles/odd whitespace + 6 000 random)`,
    gB.linear && gB2.linear && dB.length === 0, `${gs(gB)} | ${gs(gB2)} · differ=${dB.length} ${j(dB.slice(0, 3).map((a) => [a, IA.bareEmail(a), L.bareEmail(a)]))}`);
  record("bareEmail", ADDR_CORPUS.map((a) => IA.bareEmail(a)));

  const gD = growth((s) => SHARED.displayNameOf(s), (n) => "<".repeat(n));
  const gD2 = growth((s) => SHARED.displayNameOf(s), (n) => "a ".repeat(n / 2) + "<x>y");
  const gD3 = growth((s) => SHARED.displayNameOf(s), (n) => "a" + " ".repeat(n) + "<<");
  const dD = ADDR_CORPUS.filter((a) => SHARED.displayNameOf(a) !== L.displayNameOf(a));
  chk("RV2.displayName", "displayNameOf: linear on 3 pumps and byte-identical to b8e8ad52 on the address corpus", gD.linear && gD2.linear && gD3.linear && dD.length === 0,
    `${gs(gD)} | ${gs(gD2)} | ${gs(gD3)} · differ=${dD.length} ${j(dD.slice(0, 3).map((a) => [a, SHARED.displayNameOf(a), L.displayNameOf(a)]))}`);
  record("displayNameOf", ADDR_CORPUS.map((a) => SHARED.displayNameOf(a)));

  // private sites: the literal in the file (RED) or the core helper it now calls
  const KIN = "src/lib/platform/kanban-email-in.ts";
  const kFn = literalIn(KIN, "/<([^>]+)>/") ? (s: string) => L.kanbanBareEmail(s) : IA.firstAngleAddr ? (s: string) => (IA.firstAngleAddr(s) ?? s).trim().toLowerCase() : null;
  if (kFn) {
    const g = growth(kFn, (n) => "<".repeat(n));
    const d = ADDR_CORPUS.filter((a) => kFn(a) !== L.kanbanBareEmail(a));
    chk("RV2.kanban", "kanban-email-in bareEmail (board mail-in From): linear and identical to /<([^>]+)>/ on the address corpus · no angle regex left in the file", g.linear && d.length === 0 && forbiddenIn(KIN).length === 0,
      `${gs(g)} · differ=${d.length} ${j(d.slice(0, 2))} · forbidden=${j(forbiddenIn(KIN))}`);
  } else chk("RV2.kanban", "kanban-email-in parser resolvable", false, "-");

  const CE = "src/lib/core/email.ts";
  const cFn = literalIn(CE, "/<([^>]*)>\\s*$/") ? (s: string) => L.coreBareAddr(s) : IA.trailingAngleAddr ? (s: string) => (IA.trailingAngleAddr(s) ?? s).trim() : null;
  if (cFn) {
    const g = growth(cFn, (n) => "<".repeat(n));
    const d = ADDR_CORPUS.filter((a) => cFn(a) !== L.coreBareAddr(a));
    chk("RV2.coreEmail", "core/email.ts bareAddr (outbound from/to/reply-to check): linear and identical on the address corpus · no angle regex left", g.linear && d.length === 0 && forbiddenIn(CE).length === 0,
      `${gs(g)} · differ=${d.length} ${j(d.slice(0, 2))} · forbidden=${j(forbiddenIn(CE))}`);
  } else chk("RV2.coreEmail", "core/email parser resolvable", false, "-");

  const EM = "src/lib/modules/crm/emails.ts";
  const rFn = literalIn(EM, "/<([^>]+)>/g") ? (s: string) => L.refIds(s) : IA.angleIds ? (s: string) => (IA.angleIds(s) as string[]).map((x) => x.trim()) : null;
  if (rFn) {
    const g = growth(rFn, (n) => "<".repeat(n));
    const corp = [...ADDR_CORPUS, ...HTML_CORPUS.slice(0, 6000), "<a@b> <c@d>\n\t<e@f>", "<> <<x>> <y"];
    const d = corp.filter((a) => j(rFn(a)) !== j(L.refIds(a)));
    chk("RV2.refIds", "emails.ts refIdsOf (In-Reply-To/References): linear and identical to matchAll(/<([^>]+)>/g)", g.linear && d.length === 0, `${gs(g)} · differ=${d.length} ${j(d.slice(0, 2))}`);
  } else chk("RV2.refIds", "refIdsOf resolvable", false, "-");

  // Authentication-Results pair regex: whatever literal the file now has vs the b8e8ad52 one
  const auth = regexLiterals(EM).find((r) => r.text.includes(String.raw`\s*=\s*("(?:[^"\\]|\\.)*"|[^\s";]+)`));
  if (auth) {
    const re = compile(auth.text);
    const pairs = (s: string) => [...s.matchAll(re)].map((m) => [m[1], m[2]]);
    const old = (s: string) => [...s.matchAll(L.AUTH_PAIR_RE)].map((m: Any) => [m[1], m[2]]);
    const g = growth(pairs, (n) => "a".repeat(n));
    const g2 = growth(pairs, (n) => "a ".repeat(n / 2));
    const d = AUTH_CORPUS.filter((s) => j(pairs(s)) !== j(old(s)));
    chk("RV2.authPairs", `Authentication-Results key=value pairs: linear on a long key run (with/without spaces) and identical to b8e8ad52 on ${AUTH_CORPUS.length} clauses`, g.linear && g2.linear && d.length === 0,
      `literal ${auth.text} · ${gs(g)} | ${gs(g2)} · differ=${d.length} ${j(d.slice(0, 2).map((s) => [s, pairs(s), old(s)]))}`);
  } else chk("RV2.authPairs", "auth pair regex found in emails.ts", false, "-");
}

// ════════════════ RV-2 · header caps (pure helper) ════════════════
if (IA?.capInboundEnvelope) {
  const normal = { messageId: "<abc@ex.com>", from: "\"สมชาย\" <s@ex.com>", to: ["crm+abcdefgh@shark.in.th", "x@y.z"], cc: ["c@d.e"], subject: "RE: ใบเสนอราคา", headers: { "in-reply-to": "<p@q>", references: "<a@b> <c@d>", "authentication-results": "mx; dmarc=pass header.from=ex.com" }, text: "t", html: "<p>h</p>", attachments: [] };
  const same = j(IA.capInboundEnvelope(normal)) === j(normal);
  const long = "x".repeat(IA.INBOUND_ADDR_MAX + 1);
  const big = IA.capInboundEnvelope({ ...normal, from: `"${long}" <s@ex.com>`, messageId: `<${long}>`, to: [long, "crm+abcdefgh@shark.in.th"], cc: [long], subject: "s".repeat(IA.INBOUND_HEADER_MAX + 10), headers: { references: "<".repeat(IA.INBOUND_HEADER_MAX + 1), "in-reply-to": "<p@q>" } });
  const edge = IA.capInboundEnvelope({ ...normal, from: "f".repeat(IA.INBOUND_ADDR_MAX), headers: { references: "r".repeat(IA.INBOUND_HEADER_MAX) } });
  chk("RV2.caps", "capInboundEnvelope: normal mail unchanged (deep-equal) · over-long From/Message-ID/To item/Cc item dropped (not truncated) · subject truncated at 16 KiB · over-long header dropped, the rest kept · values exactly at the limit kept",
    same && big.from === "" && big.messageId === "" && j(big.to) === j(["crm+abcdefgh@shark.in.th"]) && j(big.cc) === "[]" && big.subject.length === IA.INBOUND_HEADER_MAX && !("references" in big.headers) && big.headers["in-reply-to"] === "<p@q>" && big.text === "t"
      && edge.from.length === IA.INBOUND_ADDR_MAX && edge.headers.references.length === IA.INBOUND_HEADER_MAX,
    `same=${same} from=${j(big.from)} mid=${j(big.messageId)} to=${j(big.to)} cc=${j(big.cc)} subj=${big.subject?.length} hdrs=${j(Object.keys(big.headers ?? {}))} edge=${edge.from.length}/${edge.headers?.references?.length}`);
  const route = readFileSync("src/app/api/email/inbound/route.ts", "utf8");
  const em = readFileSync("src/lib/modules/crm/emails.ts", "utf8");
  const ingestHead = em.slice(em.indexOf("export async function ingestInbound("), em.indexOf("export async function ingestInbound(") + 900);
  const kin = readFileSync("src/lib/platform/kanban-email-in.ts", "utf8");
  const kHead = kin.slice(kin.indexOf("export async function ingestInboundEmail("), kin.indexOf("export async function ingestInboundEmail(") + 900);
  chk("RV2.caps.S", "caps applied at the route (provider payload + CRM extras) and again at the top of ingestInbound (CRM) and ingestInboundEmail (board)",
    (route.match(/capInboundEnvelope\(/g) ?? []).length >= 2 && /capInboundEnvelope\(/.test(ingestHead) && /capInboundEnvelope\(/.test(kHead),
    `route=${(route.match(/capInboundEnvelope\(/g) ?? []).length} ingestInbound=${/capInboundEnvelope\(/.test(ingestHead)} board=${/capInboundEnvelope\(/.test(kHead)}`);
} else {
  chk("RV2.caps", "capInboundEnvelope exists", false, "missing (unfixed)");
}

// ════════════════ sweep · maskPii · SVG logo check ════════════════
if (CS?.maskPii) {
  const g = growth((s) => CS.maskPii(s), (n) => "a".repeat(n));
  const g2 = growth((s) => CS.maskPii(s), (n) => "a".repeat(n) + "@");
  const d = PII_CORPUS.filter((s) => CS.maskPii(s) !== L.maskPii(s));
  chk("SW.maskPii", `CRM maskPii (audit/export/import messages): linear on a long local-part run and identical to b8e8ad52 on ${PII_CORPUS.length} strings`, g.linear && g2.linear && d.length === 0,
    `${gs(g)} | ${gs(g2)} · differ=${d.length} ${j(d.slice(0, 3).map((s) => [s, CS.maskPii(s), L.maskPii(s)]))}`);
  record("maskPii", PII_CORPUS.map((s) => CS.maskPii(s)));
}
if (LOGO?.validateLogoFile) {
  const enc = new TextEncoder();
  const v = (t: string) => LOGO.validateLogoFile({ name: "x.svg", type: "image/svg+xml", bytes: enc.encode(t) });
  const g = growth((s) => v(s), (n) => "<svg>" + "on".repeat(n / 2));
  const d = SVG_CORPUS.filter((t) => (v(t).ok === true) !== !L.svgUnsafe(t.trim()));
  chk("SW.logo", "branding validateLogoFile: SVG unsafe-pattern check linear on `on`×n (2 MB uploads allowed) and the same accept/reject as b8e8ad52 on SVG corpus", g.linear && d.length === 0,
    `${gs(g)} · differ=${d.length} ${j(d.slice(0, 3))}`);
  record("logo", SVG_CORPUS.map((t) => j(v(t))));
}

// ════════════════ sweep · e-mail-in-free-text redaction (REST/assistant PII mask · call/chat AI redaction · ops log · AI dataset) ════════════════
{
  const SER = await opt("@/lib/modules/crm/api/serialize");
  const CSH = await opt("@/lib/modules/crm/calls-shared");
  const DS = await opt("@/lib/ai/dataset");
  const EM_REAL = ["a@b.cd9x@e.fg", "a@b.cd_x@e.fg", "a@b.cd.x@e.fg", "a@b.c", "a@@b.co", "x.y+z@sub.example.co.th, o'brien@ex.ie", "mail:somchai@example.com.", "1234567@x.yy", "a@b.cd-e@f.gh", "'q'@w.ee", "%%@a.bb@c.dd"];
  const EM_ALPHA = ["a", "Z", "0", ".", "_", "%", "+", "-", "'", "@", " ", ".com", "@x.co", "\n", "ก", "<", ">", ";", "9"];
  const EM_CORPUS = [...EM_REAL, ...PII_CORPUS];
  for (let i = 0; i < 15000; i++) EM_CORPUS.push(randStr(EM_ALPHA, 20));
  const helper = LT?.replaceEmailsInText as ((s: string, f: (m: string) => string, o?: Any) => string) | undefined;
  if (helper) {
    const d1 = EM_CORPUS.filter((s) => helper(s, (m) => `[${m.length}]`) !== s.replace(L.EMAIL_IN_TEXT, (m: string) => `[${m.length}]`));
    const d2 = EM_CORPUS.filter((s) => helper(s, () => "X", { apostrophe: true }) !== s.replace(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "X"));
    const g = growth((s) => helper(s, () => "X"), (n) => "a".repeat(n));
    const g2 = growth((s) => helper(s, () => "X"), (n) => "a.".repeat(n / 2) + "@");
    const g3 = growth((s) => helper(s, () => "X"), (n) => "a@b.".repeat(n / 4));
    chk("SW.emailInText.E", `replaceEmailsInText ≡ the e-mail regex global replace (both local-part classes) on ${EM_CORPUS.length} strings incl. adjacent/overlapping shapes · linear on 3 pumps`,
      d1.length === 0 && d2.length === 0 && g.linear && g2.linear && g3.linear, `differ=${d1.length}/${d2.length} ${j(d1.slice(0, 2))} ${j(d2.slice(0, 2))} · ${gs(g)} | ${gs(g2)} | ${gs(g3)}`);
  } else chk("SW.emailInText.E", "replaceEmailsInText exists", false, "missing (unfixed)");
  const sites: [string, ((s: string) => string) | undefined, (s: string) => string][] = [
    ["serialize.maskPiiPatterns", SER?.maskPiiPatterns, SER?.maskContactValue ? L.maskPiiPatternsWith(SER.maskContactValue) : (s: string) => s],
    ["calls-shared.redactContactInfo", CSH?.redactContactInfo, L.redactContactInfo],
    ["ai/dataset.anonymize", DS?.anonymize, L.anonymize],
  ];
  for (const [k, f, old] of sites) {
    if (!f) { chk(`SW.${k}`, `${k} importable`, false, "import failed"); continue; }
    const g = growth(f, (n) => "a".repeat(n));
    const d = EM_CORPUS.filter((s) => f(s) !== old(s));
    chk(`SW.${k}`, `${k}: linear on a long local-part run without @ and identical to b8e8ad52 on the e-mail corpus`, g.linear && d.length === 0, `${gs(g)} · differ=${d.length} ${j(d.slice(0, 2))}`);
    record(k, EM_CORPUS.map((s) => f(s)));
  }
  const OC = "src/lib/outbox-consumers.ts";
  const ocLit = regexLiterals(OC).filter((r) => r.text.includes("@[A-Za-z0-9.-]+"));
  chk("SW.outbox", "outbox-consumers redactPii: no e-mail regex literal left (uses replaceEmailsInText — its identity is SW.emailInText.E)", ocLit.length === 0 && /replaceEmailsInText\(/.test(readFileSync(OC, "utf8")), j(ocLit));
}

// ════════════════ sweep · request-header trailing-run strips (public widget Origin · custom-domain Host) ════════════════
{
  const CHAT = await opt("@/lib/modules/chat/service");
  const te = LT?.trimEndRun as ((s: string, c: string) => string) | undefined;
  const corp = [...ADDR_CORPUS.slice(0, 3000), "https://a.b/", "https://a.b///", "///", "", "a.b.", "a.b...", ". .", "x/\n/", "/\u00a0/"];
  for (let i = 0; i < 6000; i++) corp.push(randStr(["/", ".", "a", " ", "\n", ":", "h"], 12));
  const d = te ? corp.filter((s) => te(s, "/") !== s.replace(/\/+$/, "") || te(s, ".") !== s.replace(/\.+$/, "")) : ["helper missing"];
  const g = CHAT?.normalizeOrigin ? growth((s) => CHAT.normalizeOrigin(s), (n) => "/".repeat(n) + "x") : null;
  const DOM = "src/lib/domain/service.ts";
  const domLit = regexLiterals(DOM).filter((r) => r.text === "/\\.+$/");
  chk("SW.trailing", "chat normalizeOrigin (public widget Origin header) linear on `/`×n+x · trimEndRun ≡ /\\/+$/ and /\\.+$/ on 9 000+ strings · domain normalizeHost (request Host) no longer uses /\\.+$/",
    d.length === 0 && !!g && g.linear && domLit.length === 0, `differ=${d.length} ${j(d.slice(0, 2))} · ${g ? gs(g) : "normalizeOrigin missing"} · domain literal=${j(domLit)}`);
}

// ════════════════ control · htmlToText (core) on raw input — the one allow-listed tag-strip regex runs on engine output ════════════════
if (SAN) {
  const g = growth((s) => SAN.htmlToText(s), (n) => "<".repeat(n), 20000);
  const g2 = growth((s) => SAN.htmlToText(s), (n) => "<a" + " ".repeat(n), 20000);
  chk("CTL.htmlToText", "control: core htmlToText is linear on raw `<`×n and `<a`+spaces (its tag-strip regex only ever sees sanitizeHtml output — the F16 allow-list entry)", g.linear && g2.linear, `${gs(g)} | ${gs(g2)}`);
}

// ════════════════ static sweep: forbidden literals across src/ ════════════════
{
  const { execSync } = await import("node:child_process");
  const files = execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { encoding: "utf8" }).split("\n").filter(Boolean);
  const hits: string[] = [];
  for (const f of files) {
    const t = readFileSync(f, "utf8");
    if (!/\[\^>\]|<\.|\[\\s\\S\]/.test(t)) continue;
    for (const r of forbiddenIn(f)) hits.push(`${f}:${r.line} ${r.text}`);
  }
  const allowed = hits.filter((h) => h.startsWith("src/lib/core/sanitize.ts:") && h.endsWith("/<[^>]*>/g"));
  chk("SW.static", "no regex tag-strip / angle-parse literal left in tracked src/ except core/sanitize.ts htmlToText (engine output only)", hits.length === allowed.length && allowed.length === 1, j(hits));
}

// ════════════════ snapshot ════════════════
writeFileSync(`${SNAPDIR}/snap-${LABEL}.json`, JSON.stringify(snap, null, 1));
if (BASE && existsSync(`${SNAPDIR}/snap-${BASE}.json`)) {
  const base = JSON.parse(readFileSync(`${SNAPDIR}/snap-${BASE}.json`, "utf8")) as Record<string, string>;
  const keys = Object.keys(base);
  const bad = keys.filter((k) => base[k] !== snap[k]);
  chk("SNAP", `every exported site function gives the same outputs as the ${BASE} run on the full corpora (${keys.join(", ")})`, bad.length === 0 && keys.length >= 6, `differ: ${j(bad)}`);
}

const pass = cks.filter((c) => c.ok).length;
console.log(`\nJSON_SUMMARY ${j({ probe: "probe-cf6-linear", label: LABEL, pass, total: cks.length, failed: cks.filter((c) => !c.ok).map((c) => c.id) })}`);
process.exit(0);

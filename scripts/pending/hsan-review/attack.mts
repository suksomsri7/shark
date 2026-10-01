// @ts-nocheck
// attack.mts — INDEPENDENT reviewer harness for the sanitizer hotfix (6513a9f7) · review: ledger/wo-notes/hotfix-sanitize-2026-10-01-review.md
// PURE: no DB, no env, no network. Run: pnpm exec tsx scripts/pending/hsan-review/attack.mts [section…] > out.txt
//   sections: vectors fuzz notes perf compat   (default: all) · env FUZZ_N (default 300000) · FUZZ_SEED (default 0x5A11C0DE)
// Judge = judge.mts (own WHATWG tokenizer + full entity table + WHATWG URL scheme parsing) — NOT the builder's re-tokenizer.
import { judge, type JudgeMode } from "./judge.mts";

const core = (await import("@/lib/core/sanitize" as string)) as any;
const kb = (await import("@/lib/modules/kanban/sanitize" as string)) as any;
const legacyCore = (await import("./legacy/core-sanitize.legacy.ts" as string)) as any;
const legacyKb = (await import("./legacy/kanban-sanitize.legacy.ts" as string)) as any;

const args = new Set(process.argv.slice(2));
const want = (s: string) => args.size === 0 || args.has(s);
const J = (x: unknown, n = 140) => JSON.stringify(String(x).slice(0, n));

// ───────────────────────── modes ─────────────────────────
const KB_TAGS = ["p", "br", "h1", "h2", "ul", "ol", "li", "strong", "b", "em", "i", "s", "code", "a"];
const CORE_TAGS = ["p", "br", "hr", "h1", "h2", "h3", "ul", "ol", "li", "strong", "b", "em", "i", "s", "u", "code", "pre", "blockquote", "a"];
type Mode = { key: string; run: (x: string) => string; legacy?: (x: string) => string; judge: JudgeMode };
const jm = (key: string, tags: string[], a: string[], schemes: string[], img = false, target = false): JudgeMode => ({
  key,
  tags: new Set(img ? [...tags, "img"] : tags),
  attrs: { a: new Set(a), ...(img ? { img: new Set(["src", "alt", "width", "height"]) } : {}) },
  schemes: new Set(schemes),
  urlAttrs: new Set(["href", "src"]),
  required: { a: target ? { rel: "noopener", target: "_blank" } : { rel: "noopener" } },
});
const LINKS = { allowLinkSchemes: ["http", "https", "mailto", "tel"] };
const MODES: Mode[] = [
  { key: "kanban.sanitizeDescription", run: (x) => kb.sanitizeDescription(x), legacy: (x) => legacyKb.sanitizeDescription(x), judge: jm("kanban", KB_TAGS, ["href", "rel"], ["http", "https"]) },
  { key: "kanban.renderDescription", run: (x) => kb.renderDescription(x), legacy: (x) => legacyKb.renderDescription(x), judge: jm("kanban-md", KB_TAGS, ["href", "rel"], ["http", "https"]) },
  { key: "core.default(policy)", run: (x) => core.sanitizeHtml(x), legacy: (x) => legacyCore.sanitizeHtml(x), judge: jm("core", CORE_TAGS, ["href", "rel", "target"], ["http", "https"], false, true) },
  { key: "core.links(composer)", run: (x) => core.sanitizeHtml(x, LINKS), legacy: (x) => legacyCore.sanitizeHtml(x, LINKS), judge: jm("core-links", CORE_TAGS, ["href", "rel", "target"], ["http", "https", "mailto", "tel"], false, true) },
  { key: "core.inbound(img+links)", run: (x) => core.sanitizeHtml(x, { allowImages: true, ...LINKS }), legacy: (x) => legacyCore.sanitizeHtml(x, { allowImages: true, ...LINKS }), judge: jm("core-in", CORE_TAGS, ["href", "rel", "target"], ["http", "https", "mailto", "tel"], true, true) },
  { key: "core.render(showImages)", run: (x) => core.sanitizeHtml(x, { allowImages: true }), legacy: (x) => legacyCore.sanitizeHtml(x, { allowImages: true }), judge: jm("core-img", CORE_TAGS, ["href", "rel", "target"], ["http", "https"], true, true) },
];

type Finding = { mode: string; input: string; out: string; cls: string; what: string };
const findings: Finding[] = [];
let checks = 0;
/** judge f(x), f(f(x)) (render-side re-sanitise) and idempotence */
function check(m: Mode, x: string, record = true): number {
  let bad = 0;
  const out = m.run(x);
  const out2 = m.run(out);
  checks++;
  for (const v of judge(out, m.judge)) {
    // POLICY: relative URLs are impossible by construction (sanitizers require absolute http(s)/mailto/tel) — any is a finding
    bad++;
    if (record && findings.length < 400) findings.push({ mode: m.key, input: x, out, cls: v.cls, what: v.what });
  }
  for (const v of judge(out2, m.judge)) {
    bad++;
    if (record && findings.length < 400) findings.push({ mode: m.key, input: x, out: out2, cls: v.cls, what: "2nd pass: " + v.what });
  }
  if (out2 !== out && m.key !== "kanban.renderDescription") {
    bad++;
    if (record && findings.length < 400) findings.push({ mode: m.key, input: x, out: `${out} ⇒ ${out2}`, cls: "IDEMPOTENCE", what: "f(f(x)) ≠ f(x)" });
  }
  return bad;
}

import { SCHEMES, vectors, mulberry32, fuzzInput } from "./corpus.mts";
// ───────────────────────── run ─────────────────────────
const summary: Record<string, unknown> = {};
if (want("vectors")) {
  const vs = vectors();
  let bad = 0;
  for (const m of MODES) for (const x of vs) bad += check(m, x);
  summary.vectors = { inputs: vs.length, modes: MODES.length, checks: vs.length * MODES.length, violations: bad };
  console.log(`\n[1] handcrafted vectors: ${vs.length} × ${MODES.length} modes → violations ${bad}`);
}
if (want("fuzz")) {
  const N = Number(process.env.FUZZ_N ?? 300000);
  const SEED = Number(process.env.FUZZ_SEED ?? 0x5a11c0de);
  const r = mulberry32(SEED);
  const t0 = Date.now();
  let bad = 0;
  const byMode: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    const x = fuzzInput(r);
    for (const m of MODES) {
      const b = check(m, x);
      if (b) byMode[m.key] = (byMode[m.key] ?? 0) + b;
      bad += b;
    }
  }
  summary.fuzz = { inputs: N, seed: "0x" + SEED.toString(16), modes: MODES.length, judged: N * MODES.length, violations: bad, byMode, seconds: (Date.now() - t0) / 1000 };
  console.log(`\n[2] fuzz: ${N} inputs × ${MODES.length} modes (seed 0x${SEED.toString(16)}) → violations ${bad} · ${(Date.now() - t0) / 1000}s`, byMode);
  // positive control: the same judge on the LEGACY sanitizers must find the known bypasses
  const r2 = mulberry32(SEED);
  let legacyBad = 0;
  const legacyN = Math.min(N, 20000);
  for (let i = 0; i < legacyN; i++) {
    const x = fuzzInput(r2);
    for (const m of MODES) {
      if (!m.legacy) continue;
      try { legacyBad += judge(m.legacy(x), m.judge).filter((v) => v.cls === "XSS").length; } catch { /* legacy may throw? */ }
    }
  }
  summary.fuzzPositiveControl = { legacyInputs: legacyN, legacyXssViolations: legacyBad };
  console.log(`    positive control: same seed, first ${legacyN} inputs through the PRE-HOTFIX sanitizers → XSS-class violations ${legacyBad}`);
}

if (findings.length) {
  const cls: Record<string, number> = {};
  for (const f of findings) cls[`${f.mode} ${f.cls}`] = (cls[`${f.mode} ${f.cls}`] ?? 0) + 1;
  console.log("\nFINDINGS (first 400) by mode/class:", cls);
  const seen = new Set<string>();
  for (const f of findings) {
    const k = f.mode + f.what.replace(/".*$/, "");
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  · [${f.mode}] ${f.cls} ${f.what}\n      in : ${J(f.input)}\n      out: ${J(f.out)}`);
  }
}

// ───────────────────────── 3. notes: allowed-tag abuse / expansion ─────────────────────────
if (want("notes")) {
  console.log("\n[3] allowed-tag abuse");
  const show = (k: string, x: string, f: (s: string) => string) => console.log(`  ${k}: ${J(x, 80)} → ${J(f(x), 200)}`);
  show("phish core", `<a href="https://shark-in-th.login.example/verify">ยืนยันตัวตนที่ shark.in.th</a>`, (x) => core.sanitizeHtml(x));
  show("phish kanban", `<a href="https://evil.example">https://shark.in.th/kanban</a>`, (x) => kb.sanitizeDescription(x));
  show("beacon inbound", `<img src="https://tracker.example/p.gif?id=1" width=1 height=1>`, (x) => core.sanitizeHtml(x, { allowImages: true }));
  show("beacon policy", `<img src="https://tracker.example/p.gif">`, (x) => core.sanitizeHtml(x));
  show("beacon kanban", `<img src="https://tracker.example/p.gif">`, (x) => kb.sanitizeDescription(x));
  show("layout core h1", `<h1><h1><h1>BIG</h1></h1></h1>`, (x) => core.sanitizeHtml(x));
  const exp = (name: string, unit: string, f: (s: string) => string) => {
    const x = unit.repeat(Math.ceil(100000 / unit.length));
    console.log(`  expansion ${name}: ${J(unit, 40)} ×n → ${(f(x).length / x.length).toFixed(2)}×`);
  };
  for (const [u, f, n] of [
    ["<", (s: string) => core.sanitizeHtml(s), "core <"],
    ["<a href=http://a>", (s: string) => core.sanitizeHtml(s), "core a"],
    ["<a href=http://a'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''>", (s: string) => core.sanitizeHtml(s), "core a + '"],
    ["<a href=http://a" + '"'.repeat(60) + ">", (s: string) => core.sanitizeHtml(s), 'core a + "'],
    ["<a href=http://a" + '"'.repeat(60) + ">", (s: string) => kb.sanitizeDescription(s), 'kanban a + "'],
    ["<img src=http://a" + "'".repeat(60) + ">", (s: string) => core.sanitizeHtml(s, { allowImages: true }), "inbound img + '"],
    ["<p>", (s: string) => core.sanitizeHtml(s), "core <p>"],
    ["<", (s: string) => kb.renderDescription(s), "renderDescription <"],
    ['"', (s: string) => kb.renderDescription(s), 'renderDescription "'],
  ] as const) exp(n, u, f);
  // nesting depth: deeply nested allowlisted tags pass through unbounded
  const deep = "<blockquote>".repeat(50000) + "x";
  console.log(`  nesting: 50 000 × <blockquote> → output ${core.sanitizeHtml(deep).length} chars (no depth limit; browsers cap DOM depth ~512 for layout but parse fine)`);
}

// ───────────────────────── 4. performance ─────────────────────────
function timeIt(f: (s: string) => string, x: string, reps = 3): number {
  let best = Infinity;
  for (let i = 0; i < reps; i++) {
    const t = performance.now();
    f(x);
    best = Math.min(best, performance.now() - t);
  }
  return best;
}
if (want("perf")) {
  console.log("\n[4] performance (best of 3, ms) — doubling to 1 MB; CRM-inbound functions also to 8 MB");
  const shapes: [string, (n: number) => string][] = [
    ["<×n", (n) => "<".repeat(n)],
    ["&×n", (n) => "&".repeat(n)],
    ['"×n', (n) => '"'.repeat(n)],
    ["<a␠×n x", (n) => "<a" + " ".repeat(n) + "x"],
    ["<a + attr soup", (n) => "<a" + ' x="1"/y=2 z'.repeat(Math.ceil(n / 13)) + ">"],
    ["<a href=&#×n>", (n) => "<a href=" + "&#".repeat(n >> 1) + ">"],
    ["<a href=&amp×n>", (n) => '<a href="' + "&amp".repeat(n >> 2) + '">'],
    ["<p>×n nested", (n) => "<p><b>".repeat(Math.ceil(n / 6))],
    ["<script>×n no closer", (n) => "<script>".repeat(Math.ceil(n / 8))],
    ["<script>…</scrip ×n", (n) => "<script></scrip".repeat(Math.ceil(n / 15))],
    ["<!--×n", (n) => "<!--".repeat(n >> 2)],
    ["<!-- -- ×n", (n) => "<!-- --".repeat(Math.ceil(n / 7))],
    ["</×n", (n) => "</".repeat(n >> 1)],
    ["<a/×n", (n) => "<a/".repeat(Math.ceil(n / 3))],
    ["<a ×n (no >)", (n) => "<a ".repeat(Math.ceil(n / 3))],
    ["<a>×n", (n) => "<a href=https://x/>".repeat(Math.ceil(n / 19))],
    ["thai text + <", (n) => "ราคา < 500 บาท ".repeat(Math.ceil(n / 15))],
    ["\\n×n + - ", (n) => "- a\n".repeat(n >> 2)],
    ["** ×n", (n) => "**a".repeat(Math.ceil(n / 3))],
    ["https:// ×n", (n) => "https://".repeat(n >> 3)],
    ["\\s ×n", (n) => " \n".repeat(n >> 1) + "x"],
  ];
  const fns: [string, (s: string) => string, number][] = [
    ["sanitizeDescription", (s) => kb.sanitizeDescription(s), 1 << 20],
    ["sanitizeHtml", (s) => core.sanitizeHtml(s), 1 << 20],
    ["sanitizeHtml(inbound)", (s) => core.sanitizeHtml(s, { allowImages: true, ...LINKS }), 8 << 20],
    ["htmlToText", (s) => core.htmlToText(s), 8 << 20],
    ["renderDescription", (s) => kb.renderDescription(s), 1 << 20],
  ];
  const perf: Record<string, Record<string, { at1MB: number; worst: number; worstAt: number; maxRatio: number; at8MB?: number }>> = {};
  for (const [fname, f, max] of fns) {
    perf[fname] = {};
    for (const [sname, gen] of shapes) {
      let prev = 0;
      let maxRatio = 0;
      let worst = 0;
      let worstAt = 0;
      let at1 = 0;
      let at8: number | undefined;
      for (let n = 1 << 14; n <= max; n <<= 1) {
        const x = gen(n);
        const ms = timeIt(f, x, n >= 4 << 20 ? 1 : 3);
        if (prev > 2) maxRatio = Math.max(maxRatio, ms / prev);
        prev = ms;
        if (ms > worst) { worst = ms; worstAt = n; }
        if (n === 1 << 20) at1 = ms;
        if (n === 8 << 20) at8 = ms;
        if (ms > 20000) break;
      }
      perf[fname][sname] = { at1MB: +at1.toFixed(1), worst: +worst.toFixed(1), worstAt, maxRatio: +maxRatio.toFixed(2), ...(at8 !== undefined ? { at8MB: +at8.toFixed(1) } : {}) };
    }
    const rows = Object.entries(perf[fname]).sort((a, b) => b[1].at1MB - a[1].at1MB).slice(0, 6);
    console.log(`  ${fname}: worst @1MB ` + rows.map(([k, v]) => `${k}=${v.at1MB}ms${v.at8MB !== undefined ? `/8MB ${v.at8MB}ms` : ""}(×${v.maxRatio}/doubling)`).join(" · "));
  }
  summary.perf = perf;
  // legacy htmlToText/renderDescription for comparison on the worst shapes (prod today)
  const lt = timeIt((s) => legacyKb.renderDescription(s), "- a\n".repeat(1 << 18), 1);
  console.log(`  legacy renderDescription "- a\\n"×256k (1 MB): ${lt.toFixed(1)} ms (prod today)`);
  // render-side cost on the public join page: worst stored policy from a 200 000-char API input
  for (const [k, x] of [
    ["<p>×66k", "<p>".repeat(66666)],
    ["<a href>×10k", "<a href=https://x/>".repeat(10526)],
    ["< text ×200k", "<".repeat(200000)],
  ] as const) {
    const stored = core.sanitizeHtml(x);
    console.log(`  joinForm render re-sanitise of worst stored policy (${k}, stored ${stored.length} chars): ${timeIt((s) => core.sanitizeHtml(s), stored).toFixed(1)} ms`);
  }
}

// ───────────────────────── 5. compatibility on production-shaped content ─────────────────────────
if (want("compat")) {
  console.log("\n[5] compatibility: new vs legacy on production-shaped content");
  const word = `<p class=MsoNormal><span lang=TH style='font-family:"Angsana New"'>สวัสดีครับ<o:p></o:p></span></p>\n<p class=MsoNormal><b>ราคา</b> &lt; 500 บาท<o:p>&nbsp;</o:p></p>`;
  const gmail = `<div dir="ltr">ขอบคุณครับ<br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Mon, 1 Oct 2026 at 10:00, A &lt;<a href="mailto:a@b.co">a@b.co</a>&gt; wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex"><div dir="ltr">สวัสดี<br>ราคา 3<5 ?</div></blockquote></div></div>`;
  const outlook = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><style>p{margin:0}</style></head><body><div class="WordSection1"><p class="MsoNormal">Hi<o:p></o:p></p><table><tr><td>a</td></tr></table><img src="cid:image001.png@01D"></div></body></html>`;
  const links = `<p>ดูที่ <a href="https://shark.in.th/x?a=1&amp;b=2">ลิงก์</a> และ <a href="https://shark.in.th/x?a=1&b=2">ลิงก์2</a> และ <a href="https://x/?q=a%26b&amp;amp;c=1">3</a></p>`;
  const policy = `<h2>นโยบายความเป็นส่วนตัว</h2><p>บริษัทฯ เก็บข้อมูล <strong>ชื่อ</strong> &amp; เบอร์โทร</p><h3>1. วัตถุประสงค์</h3><ul><li>เพื่อสมาชิก</li><li>อายุ &lt; 20 ปี ต้องได้รับความยินยอม</li></ul><blockquote>พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 มาตรา 19</blockquote><p>ติดต่อ <a href="mailto:dpo@x.co">dpo@x.co</a> หรือ <a href="https://x.co/privacy">เว็บไซต์</a></p>`;
  const md = `สรุปงาน\n- ซื้อของ < 500 บาท\n- ดู https://shark.in.th/x?a=1&b=2\n\n**ด่วน** *วันนี้*`;
  const thaiCmp = `<p>ถ้า a<b และ b>c แล้ว a<c</p><p>x <5 y> 3</p><p>1<2</p>`;
  const cases: [string, string, Mode[]][] = [
    ["Word paste", word, MODES.filter((m) => m.key !== "kanban.renderDescription")],
    ["Gmail thread", gmail, MODES.filter((m) => m.key.startsWith("core"))],
    ["Outlook mail", outlook, MODES.filter((m) => m.key.startsWith("core"))],
    ["links with &", links, MODES.filter((m) => m.key !== "kanban.renderDescription")],
    ["PDPA policy", policy, MODES.filter((m) => m.key === "core.default(policy)")],
    ["markdown-lite", md, MODES.filter((m) => m.key === "kanban.renderDescription")],
    ["Thai comparisons", thaiCmp, MODES.filter((m) => m.key !== "kanban.renderDescription")],
    ["CardBack round-trip", kb.renderDescription(md), MODES.filter((m) => m.key === "kanban.sanitizeDescription")],
  ];
  for (const [name, x, ms] of cases) for (const m of ms) {
    const a = m.legacy!(x);
    const b = m.run(x);
    console.log(`  ${a === b ? "=" : "≠"} ${name} [${m.key}]${a === b ? "" : `\n      legacy: ${J(a, 400)}\n      new   : ${J(b, 400)}`}`);
  }
  // already-stored legacy output re-sanitised at render (getCardDetail / joinForm) must be byte-identical
  let drift = 0;
  const r = mulberry32(42);
  for (let i = 0; i < 20000; i++) {
    const x = i % 2 ? fuzzInput(r) : [word, gmail, links, policy, thaiCmp, md][i % 6]! + fuzzInput(r);
    for (const [legacyF, newF, k] of [
      [(s: string) => legacyKb.sanitizeDescription(s), (s: string) => kb.sanitizeDescription(s), "kanban"],
      [(s: string) => legacyCore.sanitizeHtml(s), (s: string) => core.sanitizeHtml(s), "core"],
    ] as const) {
      const stored = legacyF(x);
      const rendered = newF(stored);
      if (rendered !== stored) {
        drift++;
        if (drift <= 12) console.log(`  render drift [${k}] stored ${J(stored, 160)}\n                     now    ${J(rendered, 160)}`);
      }
    }
  }
  console.log(`  legacy-stored rows re-sanitised at render: ${drift} / 40000 differ (expected: only where legacy stored unsafe/odd markup)`);
  // classify benign drift: legacy-stored output that legacy considered fully clean, on BENIGN corpus only
  let benignDrift = 0;
  for (const x of [word, gmail, outlook, links, policy, thaiCmp]) for (const [lf, nf] of [
    [(s: string) => legacyKb.sanitizeDescription(s), (s: string) => kb.sanitizeDescription(s)],
    [(s: string) => legacyCore.sanitizeHtml(s), (s: string) => core.sanitizeHtml(s)],
  ] as const) {
    const st = lf(x);
    const re = nf(st);
    if (re !== st) { benignDrift++; console.log(`  benign stored→render drift: ${J(st, 200)}\n                         → ${J(re, 200)}`); }
  }
  summary.compatBenignStoredDrift = benignDrift;
}

console.log("\nSUMMARY " + JSON.stringify(summary));

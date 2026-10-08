// C5.5-fix5 — empirical super-linear regex sweep over src/ (pure · no DB · no app imports).
// Every regex literal (and `new RegExp("literal")`) in src/**/*.ts(x) is run against pumped inputs
// (pump.repeat(k) + suffix) at two sizes; a regex is FLAGGED when the time grows super-linearly
// (ratio t(N2)/t(N1) well above N2/N1) and the large run is not trivially fast. A regex that does not
// return within the watchdog window (exponential backtracking) is flagged HANG.
// This is a triage aid: a flag says "this pattern is super-linear on SOME input" — reachability
// (who controls the string, is it capped first) is decided by reading the call site (see the fix5 note).
// Run: pnpm exec tsx scripts/pending/cf6/regex-sweep.mts [--json out.json] [--only path-substring]
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Worker } from "node:worker_threads";
import ts from "typescript";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

type Entry = { file: string; line: number; source: string; flags: string; text: string };

function walk(dir: string, out: string[]): void {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(n) && !n.endsWith(".d.ts")) out.push(p);
  }
}

const files: string[] = [];
walk(join(ROOT, "src"), files);
const entries: Entry[] = [];
for (const f of files) {
  const rel = relative(ROOT, f);
  if (only && !rel.includes(only)) continue;
  const text = readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = text.split("\n");
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const lit = node.getText(sf);
      const end = lit.lastIndexOf("/");
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      entries.push({ file: rel, line, source: lit.slice(1, end), flags: lit.slice(end + 1), text: (lines[line - 1] ?? "").trim().slice(0, 200) });
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "RegExp" && node.arguments?.length) {
      const a0 = node.arguments[0];
      const a1 = node.arguments[1];
      if (a0 && (ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0))) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const flags = a1 && (ts.isStringLiteral(a1) || ts.isNoSubstitutionTemplateLiteral(a1)) ? a1.text : "";
        entries.push({ file: rel, line, source: a0.text, flags, text: (lines[line - 1] ?? "").trim().slice(0, 200) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const WORKER = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const { performance } = require("node:perf_hooks");
const BASE = [" ", "\t", "\n", "a", "Z", "0", "<", ">", "&", "=", "-", ".", "@", "/", '"', "'", "(", ")", "{", "}", "[", "]", "#", ";", ":", ",", "_", "|", "*", "+", "ก", "\\", "%", "!", "?", "$", "~", " ", "\r"];
const SUFFIX = ["", "x", "!", "\n", "\u0000"];
const N1 = 1500, N2 = 6000;
const cache = new Map();
function make(p, suffix, n) {
  const k = p + "\u0001" + suffix + "\u0001" + n;
  let s = cache.get(k);
  if (s === undefined) { s = p.repeat(Math.max(1, Math.floor(n / p.length))) + suffix; if (cache.size > 20000) cache.clear(); cache.set(k, s); }
  return s;
}
function words(src) {
  // literal runs of the pattern (escapes of metachars kept as the char) — "<li", "<br", "&#", "dmarc" …
  const out = new Set();
  const cleaned = src.replace(/\\[sSdDwWbBnrtfv]/g, " ").replace(/\[[^\]]*\]/g, " ");
  for (const m of cleaned.matchAll(/(?:\\.|[^\\()[\]{}*+?|^$. ])+/g)) {
    const w = m[0].replace(/\\(.)/g, "$1");
    if (w.length >= 2 && w.length <= 8) out.add(w);
  }
  return [...out].slice(0, 12);
}
function run(re, s) {
  re.lastIndex = 0;
  const t = performance.now();
  if (re.global) s.replace(re, ""); else re.exec(s);
  return performance.now() - t;
}
for (let i = workerData.start; i < workerData.entries.length; i++) {
  const e = workerData.entries[i];
  parentPort.postMessage({ type: "start", i });
  let re;
  try { re = new RegExp(e.source, e.flags.replace(/[^gimsuyd]/g, "")); } catch (err) { parentPort.postMessage({ type: "done", i, verdict: "SKIP", why: String(err).slice(0, 80) }); continue; }
  const ws = words(e.source);
  const pumps = [...BASE, ...ws, ...ws.map((w) => w + " "), ...ws.map((w) => w + "a"), ...ws.map((w) => " " + w)];
  let worst = null;
  for (const p of pumps) for (const sfx of SUFFIX) {
    const s1 = make(p, sfx, N1);
    let t1 = run(re, s1);
    if (t1 < 0.4) continue;
    t1 = Math.min(t1, run(re, s1));
    if (t1 < 0.4) continue;
    const t2 = Math.min(run(re, make(p, sfx, N2)), run(re, make(p, sfx, N2)));
    const ratio = t2 / t1;
    if (!worst || t2 > worst.t2) worst = { pump: p, suffix: sfx, t1, t2, ratio };
  }
  const flagged = !!worst && worst.ratio > 8 && worst.t2 > 4;
  parentPort.postMessage({ type: "done", i, verdict: flagged ? "SUPERLINEAR" : "ok", worst });
}
parentPort.postMessage({ type: "end" });
`;

type Result = Entry & { verdict: string; worst?: { pump: string; suffix: string; t1: number; t2: number; ratio: number } | null };
const results: Result[] = [];
const WATCHDOG_MS = 5000;

async function runFrom(start: number): Promise<number | null> {
  return new Promise((resolve) => {
    const w = new Worker(WORKER, { eval: true, workerData: { entries, start } });
    let cur = start;
    let timer: NodeJS.Timeout = setTimeout(() => {}, 0);
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void w.terminate();
        results.push({ ...(entries[cur] as Entry), verdict: "HANG", worst: null });
        resolve(cur + 1);
      }, WATCHDOG_MS);
    };
    arm();
    w.on("message", (m: { type: string; i: number; verdict?: string; worst?: Result["worst"] }) => {
      if (m.type === "start") { cur = m.i; arm(); }
      else if (m.type === "done") results.push({ ...(entries[m.i] as Entry), verdict: m.verdict ?? "?", worst: m.worst ?? null });
      else if (m.type === "end") { clearTimeout(timer); void w.terminate(); resolve(null); }
    });
    w.on("error", () => { clearTimeout(timer); resolve(cur + 1); });
  });
}

const t0 = Date.now();
let next: number | null = 0;
while (next !== null && next < entries.length) next = await runFrom(next);
const bad = results.filter((r) => r.verdict === "SUPERLINEAR" || r.verdict === "HANG");
bad.sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line));
console.log(`regex literals scanned: ${entries.length} in ${files.length} files · ${((Date.now() - t0) / 1000).toFixed(1)} s · flagged ${bad.length}`);
for (const r of bad) {
  const w = r.worst;
  console.log(`${r.verdict.padEnd(11)} ${r.file}:${r.line}  /${r.source}/${r.flags}${w ? `  pump=${JSON.stringify(w.pump)}+${JSON.stringify(w.suffix)} t1=${w.t1.toFixed(1)}ms t2=${w.t2.toFixed(1)}ms ×${w.ratio.toFixed(1)}` : ""}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ scanned: entries.length, flagged: bad }, null, 1));

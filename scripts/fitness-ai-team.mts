// Fitness functions of the RUN "AI TEAM" (SHARK HUB v2) — mechanical guards for the owner's decisions, no prose.
//
// Run:   pnpm exec tsx scripts/fitness-ai-team.mts            (no DB, no env, no network, < 2 s)
// Root:  FITNESS_AI_TEAM_ROOT=<dir> scans that tree instead of the repo (oracles point it at a temp root — never write probe
//        files into the worktree). Default = the repo root.
// Exit:  1 iff a CRITICAL/MAJOR finding (same rule and same output shape as scripts/fitness.mts).
//
// ⚠ Check ids are F16.1–F16.6 INSIDE THIS FILE. scripts/fitness.mts has its own, unrelated F16.0–F16.2 (tag-stripping regex).
//   In prose always write these as "AT-F16.n" (controller ruling 8 Oct, brief error 1).
//
//   F16.1  owner decision 6/R-A8 + 9/R-A10: the user never sees "token" / "โทเคน" / "บาทต่องาน" / "ค่าแรง" / "wage".
//          Scans (a) every string VALUE of src/messages/<locale>/ai-team.json, (b) every string literal of
//          apps/mobile/src/i18n/team.ts, (c) every zod expression (`z.…(…)`, keys included — request and response alike) of
//          src/app/api/mobile/team/** and of the shared schema files src/lib/mobile/team-*.ts.
//   F16.2  position templates (src/lib/ai/team/templates.ts) reference only skills that exist in src/lib/ai/skills.ts
//          (read as text, like F13.3) — plus the virtual skill id "core" (RESOLUTIONS R-E C15).
//   F16.3  the team report DTO (src/lib/ai/team/daily.ts + src/app/api/mobile/team/report/**) has no money key.
//   Ratchet: a file that does not exist yet = pass with a note. F16.4/F16.5 (testID inventory) are added by T2.1, F16.6 by T3.1.
//   Never vacuous: when a target file EXISTS but the scanner found nothing in it to scan (no string, no zod expression,
//   no skill id, no report type) the check FAILS — a green that scanned nothing would be read as coverage.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const ROOT = process.env.FITNESS_AI_TEAM_ROOT ? resolve(process.env.FITNESS_AI_TEAM_ROOT) : REPO_ROOT;

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; detail: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, detail: string, sev: Sev = "MAJOR") {
  checks.push({ id, name, ok, detail, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
}

const rel = (p: string) => relative(ROOT, p).split("\\").join("/");
const read = (p: string): string => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};
function walk(dir: string, filter: (p: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = join(dir, e);
    let isDir = false;
    try {
      isDir = statSync(p).isDirectory();
    } catch {
      continue; // removed between readdir and stat
    }
    if (isDir) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}
const cut = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** every string literal ("…" '…' `…`) of a TypeScript source, comments removed first */
function stringLiterals(src: string): string[] {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
  const out: string[] = [];
  const re = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  for (const m of noComments.matchAll(re)) out.push(m[0].slice(1, -1));
  return out;
}

/** every string value of a parsed JSON tree, with its key path */
function jsonStrings(node: unknown, path: string, out: { path: string; value: string }[]): void {
  if (typeof node === "string") out.push({ path, value: node });
  else if (Array.isArray(node)) node.forEach((v, i) => jsonStrings(v, `${path}[${i}]`, out));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) jsonStrings(v, path ? `${path}.${k}` : k, out);
}

/**
 * Declarations `const <name> = …` whose name matches `nameRe`, each cut at the next top-level declaration.
 * Text-based on purpose (like F13.3): the route files are not importable without env.
 */
function declarations(src: string, nameRe: RegExp): { name: string; body: string }[] {
  const starts: { name: string; index: number }[] = [];
  const all = /^(?:export\s+)?(?:const|let|type|interface|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of src.matchAll(all)) starts.push({ name: String(m[1]), index: m.index ?? 0 });
  const out: { name: string; body: string }[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const s = starts[i];
    if (!nameRe.test(s.name)) continue;
    out.push({ name: s.name, body: src.slice(s.index, i + 1 < starts.length ? starts[i + 1].index : src.length) });
  }
  return out;
}

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");

/** index just after the bracket that closes the one at `open` (strings skipped) · -1 when it never closes */
function closeOf(src: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const stack: string[] = [];
  let quote = "";
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (pairs[c]) stack.push(pairs[c]);
    else if (c === ")" || c === "}" || c === "]") {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

/** every top-level zod expression `z.<fn>( … )` (+ chained calls) of a source — schemas declared anywhere, named anything */
function zodExpressions(source: string): string[] {
  const src = stripComments(source);
  const out: string[] = [];
  const re = /(^|[^\w$.])z\s*\.\s*[A-Za-z_]\w*\s*\(/g;
  let m: RegExpExecArray | null = re.exec(src);
  while (m) {
    const start = m.index + String(m[1]).length;
    let end = closeOf(src, re.lastIndex - 1);
    if (end < 0) break;
    // chained calls: .optional() · .extend({ … }) · .refine(…)
    for (;;) {
      const chain = /^\s*\.\s*[A-Za-z_]\w*\s*\(/.exec(src.slice(end));
      if (!chain) break;
      const next = closeOf(src, end + chain[0].length - 1);
      if (next < 0) break;
      end = next;
    }
    out.push(src.slice(start, end));
    re.lastIndex = end; // nested z.… calls are inside the expression already
    m = re.exec(src);
  }
  return out;
}

/** return-type annotation of a function declaration / arrow function text ("" when it has none) */
function returnTypeOf(decl: string): string {
  const open = decl.indexOf("(");
  if (open < 0) return "";
  const afterParams = closeOf(decl, open);
  if (afterParams < 0) return "";
  const rest = decl.slice(afterParams);
  const colon = /^\s*:/.exec(rest);
  if (!colon) return "";
  let depth = 0;
  let seen = false;
  let prev = ":";
  for (let i = colon[0].length; i < rest.length; i += 1) {
    const c = rest[i];
    if (depth === 0 && seen && ((c === "{" && !"|&,:(<".includes(prev)) || (c === "=" && rest[i + 1] === ">"))) return rest.slice(colon[0].length, i);
    if (c === "{" || c === "(" || c === "[" || c === "<") depth += 1;
    else if (c === "}" || c === ")" || c === "]" || (c === ">" && rest[i - 1] !== "=")) depth -= 1;
    if (!/\s/.test(c)) {
      seen = true;
      prev = c;
    }
  }
  return "";
}

console.log(`── AI TEAM fitness (AT-F16.x) · root ${ROOT === REPO_ROOT ? "repo" : "FITNESS_AI_TEAM_ROOT"} ──`);

// ─────────────────── F16.1: forbidden words in what the user reads ───────────────────
{
  // "token" also catches "tokens"; Thai words are exact; "wage" also catches "wages" / a `wage` key
  const FORBIDDEN = /token|โทเคน|บาทต่องาน|ค่าแรง|wage/i;
  const word = (s: string) => FORBIDDEN.exec(s)?.[0] ?? "";
  const hits: string[] = [];
  const scanned: string[] = [];
  const absent: string[] = [];
  const vacuous: string[] = []; // the target exists but nothing in it could be scanned

  // (a) web i18n: src/messages/<locale>/ai-team.json — string values
  const messagesDir = join(ROOT, "src", "messages");
  const jsonFiles = existsSync(messagesDir)
    ? readdirSync(messagesDir)
        .map((locale) => join(messagesDir, locale, "ai-team.json"))
        .filter((p) => existsSync(p))
    : [];
  if (jsonFiles.length === 0) absent.push("src/messages/*/ai-team.json");
  for (const f of jsonFiles) {
    scanned.push(rel(f));
    const raw = read(f);
    const strings: { path: string; value: string }[] = [];
    try {
      jsonStrings(JSON.parse(raw), "", strings);
    } catch {
      strings.push({ path: "(file is not valid JSON — scanned as text)", value: raw });
    }
    if (strings.length === 0) vacuous.push(`${rel(f)} (no string value)`);
    for (const s of strings) if (FORBIDDEN.test(s.value)) hits.push(`${rel(f)} · ${cut(s.path)} · "${word(s.value)}"`);
  }

  // (b) app i18n: apps/mobile/src/i18n/team.ts — string literals
  const appFile = join(ROOT, "apps", "mobile", "src", "i18n", "team.ts");
  if (!existsSync(appFile)) absent.push("apps/mobile/src/i18n/team.ts");
  else {
    scanned.push(rel(appFile));
    const literals = stringLiterals(read(appFile));
    if (literals.length === 0) vacuous.push(`${rel(appFile)} (no string literal)`);
    for (const s of literals) if (FORBIDDEN.test(s)) hits.push(`${rel(appFile)} · "${word(s)}" in «${cut(s, 40)}»`);
  }

  // (c) mobile API: every zod expression (keys + literals) of the team route tree and of the shared schema files
  const apiDir = join(ROOT, "src", "app", "api", "mobile", "team");
  const mobileLib = join(ROOT, "src", "lib", "mobile");
  const sharedFiles = existsSync(mobileLib)
    ? readdirSync(mobileLib)
        .filter((f) => /^team-.*\.tsx?$/.test(f))
        .map((f) => join(mobileLib, f))
    : [];
  const routeFiles = walk(apiDir, (p) => /\.tsx?$/.test(p));
  if (routeFiles.length === 0) absent.push("src/app/api/mobile/team/**");
  let schemas = 0;
  for (const f of [...routeFiles, ...sharedFiles]) {
    scanned.push(rel(f));
    for (const expr of zodExpressions(read(f))) {
      schemas += 1;
      if (FORBIDDEN.test(expr)) hits.push(`${rel(f)} · zod schema «${cut(expr.replace(/\s+/g, " "), 40)}» · "${word(expr)}"`);
    }
  }
  if (routeFiles.length > 0 && schemas === 0) vacuous.push(`src/app/api/mobile/team/** (${routeFiles.length} file(s), no zod expression found)`);

  const note = `${scanned.length} file(s) scanned · ${schemas} zod expression(s)${absent.length ? ` · not there yet (ratchet): ${absent.join(", ")}` : ""}`;
  const problems = [...hits, ...vacuous.map((v) => `nothing scanned in ${v}`)];
  chk(
    "F16.1",
    'no "token" / "โทเคน" / "บาทต่องาน" / "ค่าแรง" / "wage" in team i18n strings and mobile team zod schemas',
    problems.length === 0,
    problems.length ? `${problems.length} finding(s): ${problems.slice(0, 8).join(" | ")}${problems.length > 8 ? " …" : ""}` : note,
    "CRITICAL",
  );
}

// ─────────────────── F16.2: position templates reference real skills ───────────────────
{
  const templatesFile = join(ROOT, "src", "lib", "ai", "team", "templates.ts");
  // the skill registry is read from the scanned root, or from the repo when a temp root does not carry it
  const skillsInRoot = join(ROOT, "src", "lib", "ai", "skills.ts");
  const skillsFile = existsSync(skillsInRoot) ? skillsInRoot : join(REPO_ROOT, "src", "lib", "ai", "skills.ts");
  const name = "position templates reference only skills registered in src/lib/ai/skills.ts (+ virtual skill \"core\")";
  if (!existsSync(templatesFile)) {
    chk("F16.2", name, true, "src/lib/ai/team/templates.ts not there yet (ratchet · T1.3 creates it)");
  } else if (!existsSync(skillsFile)) {
    chk("F16.2", name, false, "src/lib/ai/skills.ts not found — cannot verify the templates");
  } else {
    const skillsSrc = read(skillsFile);
    const start = skillsSrc.indexOf("export const SKILLS");
    const registry = start >= 0 ? skillsSrc.slice(start) : skillsSrc;
    const known = new Set<string>(["core"]);
    for (const m of registry.matchAll(/^\s{2,6}id:\s*["']([a-z][a-z0-9_-]*)["']/gm)) known.add(String(m[1]));
    const used = new Set<string>();
    for (const m of read(templatesFile).matchAll(/\bskillId\s*:\s*["'`]([^"'`]+)["'`]/g)) used.add(String(m[1]));
    const unknown = [...used].filter((id) => !known.has(id));
    chk(
      "F16.2",
      name,
      unknown.length === 0 && known.size > 1 && used.size > 0,
      unknown.length
        ? `${rel(templatesFile)} names skill(s) that do not exist: ${unknown.join(", ")}`
        : used.size === 0
          ? `${rel(templatesFile)} exists but no \`skillId: "…"\` was found in it — nothing was verified (template shape changed?)`
          : known.size <= 1
          ? "could not read any skill id from skills.ts (registry shape changed?)"
          : `${used.size} skill id(s) used · ${known.size - 1} registered`,
    );
  }
}

// ─────────────────── F16.3: no money in the team report DTO ───────────────────
{
  // owner decision 9 / R-A10: hours, tasks, pass %, wait minutes, quota % — never wages or a baht value of work
  const MONEY_KEY = /baht|satang|thb|usd|micro|wage|salary|payroll|price|cost|amount|money|revenue|บาท|สตางค์|ค่าแรง|เงินเดือน|มูลค่า/i;
  const files = [join(ROOT, "src", "lib", "ai", "team", "daily.ts"), ...walk(join(ROOT, "src", "app", "api", "mobile", "team", "report"), (p) => /\.tsx?$/.test(p))].filter((p) => existsSync(p));
  const name = "team report DTO carries no money key (hours · tasks · pass % · wait minutes · quota % only)";
  if (files.length === 0) {
    chk("F16.3", name, true, "src/lib/ai/team/daily.ts and src/app/api/mobile/team/report/** not there yet (ratchet · T4.5 creates them)", "CRITICAL");
  } else {
    const hits: string[] = [];
    let blocks = 0;
    for (const f of files) {
      // the report DTO = every type / zod schema whose name contains "Report", and the RETURN TYPE of every function
      // whose name contains "Report" (a function body is not a DTO: its local keys are not scanned)
      for (const d of declarations(read(f), /Report/)) {
        const isFunction = /^(?:export\s+)?(?:async\s+)?function\b/.test(d.body);
        const isArrow = /^(?:export\s+)?(?:const|let)\s+[\w$]+\s*=\s*(?:async\s*)?\(/.test(d.body);
        const text = isFunction || isArrow ? returnTypeOf(stripComments(d.body)) : stripComments(d.body);
        if (!text.trim()) continue;
        blocks += 1;
        for (const m of text.matchAll(/(?:^|[{,;\s<(])["']?([A-Za-z_$\u0E00-\u0E7F][\w$\u0E00-\u0E7F]*)["']?\s*\??\s*:/g)) {
          const key = String(m[1]);
          if (MONEY_KEY.test(key)) hits.push(`${rel(f)} · ${d.name}.${key}`);
        }
      }
    }
    if (blocks === 0) hits.push(`nothing scanned: ${files.map(rel).join(", ")} exist(s) but no type / schema / function return type named *Report* was found`);
    chk("F16.3", name, hits.length === 0, hits.length ? `finding(s): ${[...new Set(hits)].slice(0, 8).join(" | ")}` : `${files.length} file(s) · ${blocks} report type(s)/schema(s)`, "CRITICAL");
  }
}

// ─────────────────── summary (same shape as scripts/fitness.mts) ───────────────────
const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== FITNESS AI-TEAM =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log(
  "\nJSON_SUMMARY " +
    JSON.stringify({
      total: checks.length,
      passed: checks.length - failed.length,
      findings: failed.map((c) => ({ id: c.id, sev: c.sev, detail: c.detail })),
    }),
);
process.exit(bySev("CRITICAL") + bySev("MAJOR") > 0 ? 1 : 0);

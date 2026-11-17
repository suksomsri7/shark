// QC HR VIS-5a helpers (pure + intl shim) · brief hr-brief-VIS-5a.md · notes hr-VIS-5a-oracle.md · ⚠️ ORACLE-EDIT only
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import { type Any, ROOT, rd, stripComments, diffHunks, srcFiles } from "./qc-hr-lib.mjs";

export const VIEWS = ["run", "hours", "adjust", "profiles", "docs", "ytd", "history"] as const;
const H = "src/lib/modules/hr/";
export const MSG: Record<"th" | "en", Any> = {
 th: { ...JSON.parse(rd("src/messages/th/common.json") || "{}"), pos: JSON.parse(rd("src/messages/th/pos.json") || "{}") },
 en: { ...JSON.parse(rd("src/messages/en/common.json") || "{}"), pos: JSON.parse(rd("src/messages/en/pos.json") || "{}") },
};

/** next-intl/server outside Next: same messages as src/i18n/request.ts, locale from LOC.cur (use-intl createTranslator when resolvable, else {x} fill) */
export const LOC = { cur: "th" as "th" | "en", hits: 0, misses: [] as string[] };
export function installIntlShim(): void {
 let create: Any = null;
 try { create = createRequire(join(ROOT, "node_modules/next-intl/package.json"))("use-intl/core").createTranslator; } catch { create = null; }
 const get = (o: Any, path: string) => path.split(".").reduce((x: Any, k) => (x && typeof x === "object" ? x[k] : undefined), o);
 const tr = (nsArg: unknown) => {
  const ns = typeof nsArg === "string" ? nsArg : ((nsArg as Any)?.namespace as string | undefined);
  const loc = LOC.cur, msgs = MSG[loc];
  const real = create ? create({ locale: loc, messages: msgs, namespace: ns, onError: () => undefined, getMessageFallback: ({ key, namespace }: Any) => { LOC.misses.push(`${namespace ?? ""}.${key}`); return `‹${key}›`; } }) : null;
  const f = (key: string, vals?: Record<string, unknown>) => {
   if (real) return String(real(key, vals));
   const v = get(msgs, ns ? `${ns}.${key}` : key);
   if (typeof v !== "string") { LOC.misses.push(`${ns}.${key}`); return `‹${key}›`; }
   return v.replace(/\{(\w+)\}/g, (_, k) => String(vals?.[k] ?? `{${k}}`));
  };
  return Object.assign(f, { has: (k: string) => typeof get(msgs, ns ? `${ns}.${k}` : k) === "string", rich: f, markup: f, raw: (k: string) => get(msgs, ns ? `${ns}.${k}` : k) });
 };
 const shim = {
  getTranslations: async (ns?: unknown) => tr(ns), getLocale: async () => LOC.cur, getMessages: async () => MSG[LOC.cur], getNow: async () => new Date(), getTimeZone: async () => "Asia/Bangkok",
  getFormatter: async () => ({ number: (n: number) => String(n), dateTime: (d: Date) => d.toISOString() }), setRequestLocale: () => undefined, getRequestConfig: (f: unknown) => f,
 };
 const M = Module as Any, orig = M._load;
 M._load = function (req: string, ...rest: unknown[]) { if (req === "next-intl/server") { LOC.hits++; return shim; } return orig.call(this, req, ...rest); };
}

/** data-testid → count in rendered HTML */
export function idsIn(html: string): Map<string, number> {
 const m = new Map<string, number>();
 for (const x of html.matchAll(/data-testid="([^"]+)"/g)) m.set(x[1]!, (m.get(x[1]!) ?? 0) + 1);
 return m;
}
/** id pattern ("hr-x-*") matches a concrete id */
export const idMatch = (pat: string, id: string) => (pat.endsWith("*") ? id.startsWith(pat.slice(0, -1)) && id.length > pat.length - 1 : pat.includes("*") ? new RegExp(`^${pat.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^\"]+")}$`).test(id) : pat === id);
/** outer HTML of the first element carrying data-testid=id (balanced same-name tags) */
export function elById(html: string, id: string): string {
 const at = html.indexOf(`data-testid="${id}"`);
 if (at < 0) return "";
 const st = html.lastIndexOf("<", at), tag = /^<([a-zA-Z0-9]+)/.exec(html.slice(st))?.[1] ?? "";
 if (!tag) return "";
 const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
 re.lastIndex = st;
 let d = 0;
 for (let m = re.exec(html); m; m = re.exec(html)) {
  if (m[2] === "/") { if (d === 0) return html.slice(st, re.lastIndex); continue; }
  d += m[1] ? -1 : 1;
  if (d === 0) return html.slice(st, re.lastIndex);
 }
 return html.slice(st);
}
/** text a person reads (tags + attributes dropped, entities decoded) */
export const textOfHtml = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
export const THAI = /[\u0E01-\u0E3A\u0E40-\u0E5B]/; // Thai letters/marks (฿ U+0E3F is a currency sign, not language)
/** ฿ amounts in text: "฿1,234.00" / "−฿12.00" */
export const AMOUNT = /฿\s?\d|\d{1,3}(?:,\d{3})+\.\d{2}|\b\d+\.\d{2}\b/;

/** expected periodLabel (brief §5): th "ก.ย. 2569" (BE, hr.self.m.m*) · en "Sep 2026" */
export const labelOf = (key: string, loc: "th" | "en") => { const m = Number(key.slice(5, 7)), y = Number(key.slice(0, 4)); return `${MSG[loc]?.hr?.self?.m?.[`m${m}`]} ${loc === "th" ? y + 543 : y}`; };

/** money arithmetic on *Satang identifiers in code lines (comments stripped) — normalized expressions */
export function satArith(lines: string[]): string[] {
 const out: string[] = [];
 for (const l of lines) {
  const s = stripComments(l).replace(/"[^"]*"|'[^']*'/g, '""');
  for (const m of s.matchAll(/[\w.?!\])]+\s*[-+*/%]\s*[\w.?!([]+/g)) if (m[0].includes("Satang")) out.push(m[0].replace(/\s+/g, ""));
  for (const m of s.matchAll(/(?<![\w.)\]\s])\s*-\s*[\w.?!]*Satang\b/g)) out.push(m[0].replace(/\s+/g, ""));
 }
 return out;
}
/** multiset a − b */
export const minus = (a: string[], b: string[]) => { const r = [...b]; return a.filter((x) => { const i = r.indexOf(x); if (i >= 0) { r.splice(i, 1); return false; } return true; }); };

/** brief §7 VIS5A rule: every hunk adds a line with "HR VIS-5a" and "◂" (new file: marker in first 3 lines) */
export function vis5aUnmarked(base: string, files: string[], isNew: (f: string) => boolean): string[] {
 const bad: string[] = [];
 for (const f of files) {
  const n = f.split("/").slice(-2).join("/");
  if (isNew(f)) { if (!/HR VIS-5a/.test(rd(f).split("\n").slice(0, 3).join("\n"))) bad.push(`${n}:new-unmarked`); continue; }
  const hs = diffHunks(base, f);
  if (!hs) { bad.push(`${n}:git`); continue; }
  const k = hs.filter((h) => !h.added.some((l) => l.includes("HR VIS-5a") && l.includes("◂"))).length;
  if (k) bad.push(`${n}:${k}/${hs.length} hunks unmarked`);
 }
 return bad;
}
/** oracle edits: every hunk adds "ORACLE-EDIT (HR VIS-5a · controller)" */
export const oracleEditOk = (base: string, f: string) => { const hs = diffHunks(base, f) ?? []; return hs.length > 0 && hs.every((h) => h.added.some((l) => l.includes("ORACLE-EDIT (HR VIS-5a · controller)"))); };

/** query parameter names a file can put on /hr/payroll?… (string literals + keep() lists) */
export function payrollParams(src: string): string[] {
 const s = stripComments(src), out = new Set<string>();
 for (const m of s.matchAll(/[`"?&]([a-z][a-zA-Z0-9]{0,7})=(?!=)/g)) out.add(m[1]!);
 for (const m of s.matchAll(/for\s*\(const\s+(\w+)\s+of\s+\[([^\]]*)\]\)([\s\S]{0,240})/g)) if (m[3]!.includes(`\${${m[1]}}=`)) for (const k of m[2]!.matchAll(/"([a-z]\w*)"/g)) out.add(k[1]!); // keep() lists that become ?k=
 return [...out];
}
/** redirect/link/GET-form targets of the payroll page → view (brief §3 payViewOf) — source tag · query · view */
export const ROUTES: [string, string, string][] = [
 ["bank-files/actions", "bmsg=NO", "docs"], ["bank-files/actions", "bank=R1&bfmt=KBANK&bmsg=ack", "docs"], ["bank-files/actions", "bank=R1&bfmt=KBANK&bfile=F1", "docs"],
 ["bank-files/ui", "bank=R1", "docs"], ["bank-files/ui", "bank=R1&bfmt=KBANK&beff=2026-09-30&benc=TIS620&bmode=X&bera=CE&bbranch=U1", "docs"],
 ["filings/actions", "fmsg=NO", "docs"], ["filings/actions", "fk=PND1&fp=2026-09&fmsg=saved", "docs"], ["filings/actions", "fk=SSO110&frun=R1&fmsg=made&ffile=F1", "docs"],
 ["filings/actions", "ty=2026&fperson=E1&fmsg=bulk&fbi=2&fbs=1&fstop=X", "docs"], ["filings/actions", "fk=PND1A&fp=2026&fmsg=BAD&fflds=a,b&fdoc=PND-2026-0001", "docs"], ["filings/actions", "ty=2026&fmsg=issued", "docs"],
 ["filings/ui", "fk=PND1", "docs"], ["filings/ui", "fk=SSO110&frun=R1", "docs"], ["filings/ui", "ty=2026", "docs"], ["filings/ui", "fk=PND1&fp=2026-09", "docs"],
 ["payroll-opening-actions", "ymsg=NO", "ytd"], ["payroll-opening-actions", "yty=2026&ymsg=saved", "ytd"], ["payroll-opening-actions", "yty=2026&ymsg=bulk&yn=3", "ytd"], ["payroll-opening-ui", "yty=2025", "ytd"],
 ["stock-charge-actions", "stock=ok", "adjust"], ["stock-charge-ui", "stockq=cup&stockinv=I1", "adjust"], ["stock-charge-ui", "stockq=cup", "adjust"],
 ["payslip-actions", "sc=issued", "docs"], ["payslip-actions", "sc=NO", "docs"],
 ["page.we", "period=2026-09&we=fin&n=3", "hours"], ["page.we", "period=2026-09&we=more&n=1&after=E1", "hours"], ["page.we", "period=2026-09&we=ok&n=4&r=0", "hours"], ["page.we", "period=2026-09&we=NO", "hours"], ["page.we+view", "view=hours&period=2026-09&we=fin&n=3", "hours"],
 ["page.back2", "period=2026-09&run=R1&r2=done", "run"], ["page.back2", "period=2026-09&r2=synced", "run"], ["payroll-run-ui.row", "period=2026-09&run=R1", "run"],
 ["default", "", "run"], ["default", "period=2026-09", "run"], ["unknown", "view=bogus", "run"], ["unknown", "view=", "run"], ["unknown", "view=RUN", "run"],
 ...VIEWS.map((v): [string, string, string] => ["explicit", `view=${v}`, v]), ["explicit-wins", "view=history&bank=R1", "history"], ["explicit-wins", "view=run&fk=PND1", "run"], ["explicit-wins", "view=profiles&yty=2026", "profiles"],
];
/** files whose payroll params the table must cover (source tag → file) */
export const ROUTE_SRC: Record<string, string> = {
 "bank-files/actions": `${H}bank-files/actions.ts`, "filings/actions": `${H}filings/actions.ts`, "payroll-opening-actions": `${H}payroll-opening-actions.ts`, "stock-charge-actions": `${H}stock-charge-actions.ts`, "payslip-actions": `${H}payslip-actions.ts`,
};
export const spOf = (q: string): Record<string, string> => Object.fromEntries(new URLSearchParams(q));

// ═════════════ r4 A1 — inline "use server" closures (round-4 visual review A1 · controller ruling) ═════════════
// A closure captured by an inline server action is sent to the browser as an encrypted bound argument (Next server-actions transform
// `encryptActionBoundArgs(id, …captured)`); a function value there makes React flight log "Functions cannot be passed directly to Client
// Components" on every render and the button crashes the page. A1 = TypeScript compiler API (binding-level) · A2 = the real Next SWC transform.
export type CaptureHit = { file: string; line: number; action: string; name: string; kind: string; declLine: number };
/** page.tsx / layout.tsx under the given app dirs */
export const appPages = (dirs: string[]) => dirs.flatMap((d) => { try { return srcFiles(d); } catch { return []; } }).filter((f) => /\/(page|layout)\.tsx$/.test(f)).sort();
const isFn = (n: Any, ts: Any) => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);
const unwrap = (n: Any, ts: Any): Any => (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression?.(n) || ts.isNonNullExpression(n) || ts.isTypeAssertionExpression?.(n)) ? unwrap(n.expression, ts) : n);
const useServer = (fn: Any, ts: Any) => !!fn.body && ts.isBlock(fn.body) && fn.body.statements.some((s: Any, i: number) => i < 3 && ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === "use server");
/** classify a binding a server action may close over: "" = serializable as far as the source shows */
function fnKind(decl: Any, ts: Any, checker: Any): string {
 if (ts.isFunctionDeclaration(decl)) return useServer(decl, ts) ? "" : "nested function declaration";
 if (ts.isVariableDeclaration(decl)) {
  const init = unwrap(decl.initializer, ts);
  if (init && isFn(init, ts)) return useServer(init, ts) ? "" : `local ${ts.isArrowFunction(init) ? "arrow" : "function"} expression`;
  if (init && ts.isObjectLiteralExpression(init)) {
   const f = init.properties.filter((p: Any) => (ts.isMethodDeclaration(p) && !useServer(p, ts)) || (ts.isPropertyAssignment(p) && isFn(unwrap(p.initializer, ts), ts) && !useServer(unwrap(p.initializer, ts), ts)));
   if (f.length) return `object literal with ${f.length} function member(s)`;
  }
 }
 if (ts.isVariableDeclaration(decl) || ts.isParameter(decl) || ts.isBindingElement(decl)) {
  try { const t = checker.getTypeAtLocation(decl.name ?? decl); if (t.getCallSignatures().length) return "function-typed binding"; } catch { /* no type = unknown, not flagged */ }
 }
 return "";
}
/** every inline "use server" function nested in another function of `files` that captures a function-valued local of an enclosing function */
export async function serverActionCaptures(files: string[]): Promise<{ hits: CaptureHit[]; actions: number; locals: Map<string, Map<string, string>>; err: string }> {
 const locals = new Map<string, Map<string, string>>(), hits: CaptureHit[] = [];
 let actions = 0;
 try {
  const ts = ((await import("typescript")) as Any).default ?? (await import("typescript"));
  const cfgPath = join(ROOT, "tsconfig.json"), cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const opts = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT).options;
  const program = ts.createProgram(files.map((f) => join(ROOT, f)), { ...opts, noEmit: true, incremental: false, tsBuildInfoFile: undefined });
  const checker = program.getTypeChecker();
  for (const f of files) {
   const sf = program.getSourceFile(join(ROOT, f));
   if (!sf) continue;
   const lineOf = (n: Any) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
   const loc = new Map<string, string>();
   locals.set(f, loc);
   const visitLocals = (n: Any, inFn: boolean) => { // name → kind for bindings declared inside any function (A2 resolves SWC bound names with this)
    if (inFn && (ts.isVariableDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name && ts.isIdentifier(n.name)) { const k = fnKind(n, ts, checker); if (k || !loc.has(n.name.text)) loc.set(n.name.text, k || loc.get(n.name.text) || ""); }
    ts.forEachChild(n, (c: Any) => visitLocals(c, inFn || isFn(n, ts)));
   };
   visitLocals(sf, false);
   const visit = (n: Any, chain: Any[]) => {
    if (isFn(n, ts) && useServer(n, ts) && chain.length) {
     actions++;
     const outer = chain[0], seen = new Set<string>();
     const label = ts.isPropertyAssignment(n.parent) || ts.isVariableDeclaration(n.parent) ? (n.parent.name?.getText(sf) ?? "?") : ts.isMethodDeclaration(n) || ts.isFunctionDeclaration(n) ? (n.name?.getText(sf) ?? "?") : "(inline)";
     const walk = (x: Any) => {
      if (ts.isIdentifier(x)) {
       const p = x.parent;
       const isKey = (ts.isPropertyAccessExpression(p) && p.name === x) || (ts.isPropertyAssignment(p) && p.name === x) || (ts.isJsxAttribute?.(p) && p.name === x) || ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p)) && p.name === x);
       const sym = isKey ? null : ts.isShorthandPropertyAssignment(p) ? checker.getShorthandAssignmentValueSymbol(p) : checker.getSymbolAtLocation(x);
       const decl = sym?.declarations?.[0];
       if (decl && decl.getSourceFile() === sf && decl.pos >= outer.pos && decl.end <= outer.end && !(decl.pos >= n.pos && decl.end <= n.end) && !seen.has(x.text)) {
        seen.add(x.text);
        const k = fnKind(decl, ts, checker);
        if (k) hits.push({ file: f, line: lineOf(n), action: label, name: x.text, kind: k, declLine: lineOf(decl) });
       }
      }
      ts.forEachChild(x, walk);
     };
     ts.forEachChild(n.body, walk);
    }
    ts.forEachChild(n, (c: Any) => visit(c, isFn(n, ts) ? [...chain, n] : chain));
   };
   visit(sf, []);
  }
 } catch (e) { return { hits, actions, locals, err: String((e as Error)?.message ?? e).slice(0, 200) }; }
 return { hits, actions, locals, err: "" };
}
/** the build's own transform: Next SWC server-actions pass (server layer) → bound argument names per inline action */
export async function swcBoundArgs(files: string[]): Promise<{ per: Map<string, { regs: number; bound: string[][] }>; err: string }> {
 const per = new Map<string, { regs: number; bound: string[][] }>();
 try {
  const swc = createRequire(join(ROOT, "package.json"))("next/dist/build/swc/index.js") as Any;
  await swc.loadBindings?.();
  for (const f of files) {
   const out = await swc.transform(rd(f), {
    filename: join(ROOT, f), sourceMaps: false,
    jsc: { parser: { syntax: "typescript", tsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } },
    serverComponents: { isReactServerLayer: true, cacheComponentsEnabled: false, useCacheEnabled: false, taintEnabled: false, pageExtensions: ["tsx"] },
    serverActions: { isReactServerLayer: true, isDevelopment: false, useCacheEnabled: false, hashSalt: "", cacheKinds: ["default"] },
   });
   const code = String(out.code);
   per.set(f, { regs: (code.match(/registerServerReference\(/g) ?? []).length, bound: [...code.matchAll(/encryptActionBoundArgs\("[0-9a-f]+",\s*([^)]*)\)/g)].map((m) => m[1]!.split(",").map((s) => s.trim()).filter(Boolean)) });
  }
 } catch (e) { return { per, err: String((e as Error)?.message ?? e).slice(0, 200) }; }
 return { per, err: "" };
}

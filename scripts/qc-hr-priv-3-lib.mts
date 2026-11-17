// QC HR PRIV-3 helpers — render real pages as a viewer without a server (technique of wip/hr-vis-5a/-5bc libs, copied) · statics on the diff · ⚠️ ORACLE-EDIT only
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { join, dirname, posix } from "node:path";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { type Any, ROOT, rd, errText } from "./qc-hr-lib.mjs";
import { textOfAny } from "./qc-hr-priv-2-lib.mjs";

export const H = "src/lib/modules/hr/";
const git = (a: string[]) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
/** base = merge-base with LOCAL session/hr (QC_PRIV3_BASE overrides) */
export const BASE = process.env.QC_PRIV3_BASE || git(["merge-base", "HEAD", "session/hr"]) || "ea2b41ea13d0e3ac7d7e0f3ad6cbd1c9c41d5f53";
export const sha16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
export const fileAtBase = (p: string): string | null => { try { return execFileSync("git", ["show", `${BASE}:${p}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } };

// ═════════════ diff statics ═════════════
export type Hunk = { a: number; an: number; added: string[]; removed: string[] };
export function hunksOf(f: string): Hunk[] {
 const out: Hunk[] = [];
 for (const l of git(["diff", "-U0", BASE, "--", f]).split("\n")) {
  const m = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(l);
  if (m) out.push({ a: Number(m[1]), an: m[2] === undefined ? 1 : Number(m[2]), added: [], removed: [] });
  else if (out.length && l.startsWith("+") && !l.startsWith("+++")) out.at(-1)!.added.push(l.slice(1));
  else if (out.length && l.startsWith("-") && !l.startsWith("---")) out.at(-1)!.removed.push(l.slice(1));
 }
 return out;
}
/** tracked diff vs BASE + untracked (any extension — .mts included) */
export function changed(): string[] {
 const t = git(["diff", "--name-only", BASE, "--"]).split("\n"), u = git(["ls-files", "--others", "--exclude-standard"]).split("\n");
 return [...new Set([...t, ...u].filter(Boolean))];
}
/** last import line (1-based) of a source text */
export const importEnd = (src: string) => { let n = 0; src.split("\n").forEach((l, i) => { if (/^import\b|^\s*\}?\s*from\s+["']/.test(l)) n = i + 1; }); return n; };
/** base line range [start,end] of a top-level function (from its leading comment block to the closing brace at column 0) */
export function fnRange(src: string, name: string): [number, number] {
 const L = src.split("\n"), i = L.findIndex((l) => new RegExp(`^export\\s+(async\\s+)?function\\s+${name}\\b`).test(l));
 if (i < 0) return [0, -1];
 let s = i;
 while (s > 0 && /^\s*\/\//.test(L[s - 1]!)) s--;
 let e = i;
 while (e < L.length && L[e] !== "}") e++;
 return [s + 1, e + 1];
}
export const inRange = (h: Hunk, rs: [number, number][]) => rs.some(([s, e]) => (h.an === 0 ? h.a >= s - 1 && h.a <= e : h.a >= s && h.a + h.an - 1 <= e));

/** relative imports of a hr module (resolved file paths) */
function relImports(f: string): string[] {
 const src = rd(f), out: string[] = [];
 for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["'](\.{1,2}\/[^"']+|@\/lib\/modules\/hr\/[^"']+)["']/gm)) {
  const spec = m[1]!, base = spec.startsWith("@/") ? join("src", spec.slice(2)) : join(dirname(f), spec);
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(join(ROOT, c))) { out.push(posix.normalize(c)); break; }
 }
 return out;
}
/** modules on a value-import path from `from` back to `from` (cycle members) — empty = no cycle through it */
export function cycleThrough(from: string): string[] {
 const hits = new Set<string>(), seen = new Set<string>();
 const walk = (f: string, path: string[]) => {
  for (const n of relImports(f)) {
   if (n === from) { path.forEach((p) => hits.add(p)); continue; }
   if (seen.has(n)) continue;
   seen.add(n);
   walk(n, [...path, n]);
  }
 };
 walk(from, []);
 return [...hits].sort();
}

// ═════════════ render without a browser (copied approach: next-intl/server → in-memory translator over the real messages) ═════════════
const req = createRequire(join(ROOT, "src", "qc-priv3-anchor.cjs"));
let React: Any, RDS: Any, NI: Any, ARC: Any;
const CUR = { locale: "th", messages: {} as Any };
const MSG: Record<string, Any> = {};
const msgsOf = (lc: string) => (MSG[lc] ??= { ...JSON.parse(rd(`src/messages/${lc}/common.json`)), pos: JSON.parse(rd(`src/messages/${lc}/pos.json`) || "{}") });
export function installIntl(): void {
 React = req("react"); RDS = req("react-dom/server"); NI = req("next-intl"); ARC = req("next/dist/shared/lib/app-router-context.shared-runtime");
 const getMessageFallback = ({ namespace, key }: Any) => `‹MISSING:${namespace ? `${namespace}.` : ""}${key}›`;
 const tr = (ns?: string) => NI.createTranslator({ locale: CUR.locale, messages: CUR.messages, namespace: ns, timeZone: "Asia/Bangkok", onError: () => undefined, getMessageFallback });
 const shim = {
  getTranslations: async (o?: Any) => tr(typeof o === "string" ? o : o?.namespace), getLocale: async () => CUR.locale, getMessages: async () => CUR.messages,
  getFormatter: async () => NI.createFormatter({ locale: CUR.locale, timeZone: "Asia/Bangkok" }), getNow: async () => new Date(), getTimeZone: async () => "Asia/Bangkok", setRequestLocale: () => undefined, getRequestConfig: (f: Any) => f,
 };
 const Mod = req("node:module") as Any, id = join(ROOT, "src", "‹qc-priv3-next-intl-server›.cjs"), orig = Mod._resolveFilename;
 Mod._cache[id] = { id, filename: id, loaded: true, exports: shim, children: [], paths: [] };
 Mod._resolveFilename = function (this: unknown, r: string, ...a: unknown[]) { return r === "next-intl/server" ? id : orig.call(this, r, ...a); };
}
const CLIENT = new Map<unknown, string>();
/** functions exported by "use client" files (HR + components) — their props are what the browser receives */
export async function loadClientSet(files: string[]): Promise<number> {
 for (const f of files.filter((x) => x.endsWith(".tsx") && /^\s*["']use client["']/.test(rd(x)))) {
  const m = (await import(`@/${f.slice(4).replace(/\.tsx$/, "")}` as string).catch(() => null)) as Any;
  for (const v of Object.values(m ?? {})) if (typeof v === "function" || (v && typeof v === "object" && (v as Any).$$typeof)) CLIENT.set(v, f.split("/").pop()!);
 }
 return CLIENT.size;
}
const digestOf = (e: Any) => String(e?.digest ?? "");
const isNextCtl = (e: Any) => /^NEXT_(REDIRECT|HTTP_ERROR|NOT_FOUND)/.test(digestOf(e) || String(e?.message ?? ""));
export type Rendered = { html: string; client: { name: string; props: Any }[]; clientText: string; err: string; digest: string };
async function resolveNode(n: Any, out: Rendered["client"], d = 0): Promise<Any> {
 if (d > 300 || n === null || n === undefined || typeof n !== "object") return n;
 if (typeof n.then === "function") return resolveNode(await n, out, d + 1);
 if (Array.isArray(n)) return Promise.all(n.map((x) => resolveNode(x, out, d + 1)));
 if (!React.isValidElement(n)) return n;
 const { type, props } = n as Any;
 const keepClient = async (name: string) => {
  out.push({ name, props });
  const p: Any = {};
  for (const [k, v] of Object.entries(props ?? {})) p[k] = v && typeof v === "object" && (React.isValidElement(v) || Array.isArray(v)) ? await resolveNode(v, out, d + 1) : v;
  return React.createElement(type, { ...p, key: n.key });
 };
 if (typeof type === "function") {
  if (CLIENT.has(type)) return keepClient(CLIENT.get(type)!);
  let r: Any;
  const err = console.error;
  console.error = () => undefined;
  try { r = type(props); } catch (e) { if (isNextCtl(e)) throw e; return keepClient(type.displayName || type.name || "anon"); } finally { console.error = err; }
  return resolveNode(await r, out, d + 1);
 }
 if (type && typeof type === "object" && (type.$$typeof === Symbol.for("react.forward_ref") || type.$$typeof === Symbol.for("react.memo"))) return keepClient(CLIENT.get(type) ?? type.render?.name ?? type.type?.name ?? "wrapped");
 if (props && "children" in props) return React.cloneElement(n, undefined, ...[].concat(await resolveNode(props.children, out, d + 1) as never));
 return n;
}
/** Next request scope (technique of qc-hr-h0.3 / priv-2) — cookie = the viewer's session */
export async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
 const nw = req("next/dist/server/app-render/work-async-storage.external.js"), nu = req("next/dist/server/app-render/work-unit-async-storage.external.js"), nc = req("next/dist/server/web/spec-extension/cookies.js");
 const rq = new Request(`http://qc.local${pathname}`, { headers: { cookie } }), jar = new nc.RequestCookies(rq.headers);
 const ws = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
 const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: rq.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
 return nw.workAsyncStorage.run(ws, () => nu.workUnitAsyncStorage.run(unit, fn));
}
const fail = (e: unknown, client: Rendered["client"] = []): Rendered => ({ html: "", client, clientText: textOfAny(client.map((c) => c.props)), err: errText(e), digest: digestOf(e) });
/** render a page module's default export as the cookie's viewer */
export async function renderPage(mod: Any, cookie: string, path: string, params: Record<string, string>, sp: Record<string, string> = {}): Promise<Rendered> {
 try { return await inScope(`${cookie}; LOCALE=th`, path, async () => renderTree(await mod.default({ params: Promise.resolve(params), searchParams: Promise.resolve(sp) }))); } catch (e) { return fail(e); }
}
/** render a server component element as the cookie's viewer */
export async function renderEl(cookie: string, path: string, el: () => Any): Promise<Rendered> {
 try { return await inScope(`${cookie}; LOCALE=th`, path, async () => renderTree(el())); } catch (e) { return fail(e); }
}
export const h = (t: Any, p: Any, ...c: Any[]) => React.createElement(t, p, ...c);
const ROUTER = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {}, hmrRefresh() {} };
async function renderTree(node: Any): Promise<Rendered> {
 const client: Rendered["client"] = [];
 CUR.locale = "th"; CUR.messages = msgsOf("th");
 try {
  const tree = await resolveNode(node, client);
  const el = React.createElement(NI.NextIntlClientProvider, { locale: "th", messages: CUR.messages, timeZone: "Asia/Bangkok", onError: () => undefined, getMessageFallback: ({ namespace, key }: Any) => `‹MISSING:${namespace}.${key}›` }, React.createElement(ARC.AppRouterContext.Provider, { value: ROUTER }, tree));
  const err = console.error;
  console.error = () => undefined;
  try { return { html: String(RDS.renderToStaticMarkup(el)), client, clientText: textOfAny(client.map((c) => c.props)), err: "", digest: "" }; } finally { console.error = err; }
 } catch (e) { return fail(e, client); }
}

// ═════════════ HTML helpers ═════════════
export const unent = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;|&#160;/g, " ");
export const textOfHtml = (s: string) => unent(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
/** canonical testid set: ids/dates blanked, sorted unique */
export const testids = (html: string) => [...new Set([...html.matchAll(/data-testid="([^"]*)"/g)].map((m) => m[1]!.replace(/[a-z0-9]{20,}/g, "*").replace(/\d{4}-\d{2}(-\d{2})?/g, "D")))].sort();
/** outer markup of the balanced element that starts at `<tag` index s */
function balanced(html: string, s: number): string {
 const tag = /^<([a-zA-Z0-9]+)/.exec(html.slice(s))?.[1] ?? "div", re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
 re.lastIndex = s + 1;
 let depth = 1, m: RegExpExecArray | null;
 while ((m = re.exec(html))) { depth += m[0].startsWith("</") ? -1 : 1; if (!depth) return html.slice(s, m.index + m[0].length); }
 return html.slice(s);
}
/** the leave-filing form (the <form> holding name="toDate" — OT form uses date/start/end) */
export function leaveForm(html: string): string {
 const at = html.indexOf('name="toDate"');
 if (at < 0) return "";
 return balanced(html, html.lastIndexOf("<form", at));
}
/** option values of the select name="employeeId" inside a fragment (empty value = placeholder, dropped) */
export function employeeOptions(frag: string): string[] {
 const at = frag.indexOf('name="employeeId"');
 if (at < 0) return [];
 const sel = balanced(frag, frag.lastIndexOf("<select", at));
 return [...sel.matchAll(/<option[^>]*value="([^"]*)"/g)].map((m) => m[1]!).filter(Boolean);
}
export const hrefsIn = (s: string) => [...s.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((m) => unent(m[1]!));
export const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };
export const ROUTE_RE = /\/hr\/(employees|leave|payroll)(?=$|[/?#])/;
export const gatedOf = (href: string) => (ROUTE_RE.exec(href)?.[1] === "employees" ? "register" : (ROUTE_RE.exec(href)?.[1] as "leave" | "payroll" | undefined));

// ═════════════ goldens measured on base ea2b41ea1 (QC_PRIV3_MEASURE=1 · 2 runs identical) — entitled viewers must keep them ═════════════
//   pages: "<fixture keys seen>|sha16(testids)|n" · leave cells exclude the filing form (R3 changes it) · control/nav/hub: outcome / sha16 of non-gated hrefs / hub links|first "n คน"
type Gold = { xs?: string; cycle?: string[]; pages?: Record<string, string>; control?: Record<string, string>; picker?: Record<string, string>; nav?: Record<string, string>; hub?: Record<string, string> };
/** "O:ok M:404 …" per page → { "page.O": "ok", "page.M": "NEXT_HTTP_ERROR_FALLBACK;404" } */
const unpack = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).flatMap(([pg, s]) => s.split(" ").map((x) => { const [v, k] = x.split(":"); return [`${pg}.${v}`, k === "404" ? "NEXT_HTTP_ERROR_FALLBACK;404" : k!]; })));
export const GOLD: Gold = {
 xs: "ok|-|form:n", // r2 R9 · 44a75f37a
 cycle: ["src/lib/modules/hr/judge.ts", "src/lib/modules/hr/payroll.ts", "src/lib/modules/hr/roster-board.ts", "src/lib/modules/hr/work-entries.ts"],
 pages: {
  "register.O": "e1e2e3e4e5e6e7|b81b2621bee09a78|8",
  "register.M": "e1e2e3e4e5e6e7|b81b2621bee09a78|8",
  "register.MB": "e1e2e4e5e7|4daaf3bfe057d61b|2",
  "register.P": "e1e2e3e4e5e6e7|d427af2f3180cec1|7",
  "register.PB": "e1e2e4e5e7|1abb61947757f28a|1",
  "register.SD": "e1e2e3e4e5e6e7|d427af2f3180cec1|7",
  "leave.O": "e1e2e3e4e6e7|68440db10095c997|6",
  "leave.M": "e1e2e3e4e6e7|68440db10095c997|6",
  "leave.MB": "e1e2e4e7|f6287be1c22c5f20|4",
  "leave.P": "e1e2e3e4e6e7|68440db10095c997|6",
  "leave.PB": "e1e2e4e7|f6287be1c22c5f20|4",
  "leave.S": "|d1cc5e44885ed9d3|5",
  "leave.SR": "|e3b0c44298fc1c14|0",
  "leave.SD": "e2|e3b0c44298fc1c14|0",
  "payroll.O": "e1e2e3e4e5e6e7|07bd63a74da29600|43",
  "payroll.M": "e1e2e3e4e6e7|0802a8ff261a91a1|18",
  "payroll.MB": "e1e2e4e7|0802a8ff261a91a1|18",
  "payroll.P": "e1e2e3e4e5e6e7|07bd63a74da29600|43",
  "payroll.PB": "e1e2e4e7|f92d71370225ba96|21",
  "leave.PR": "e1e2e3e4e6e7|7ee7d8d31c899a18|3", // r2 R9 · measured on 44a75f37a
  "leave.PA": "e2e3|69f7236813fcf746|4", // r2 R9 · measured on 44a75f37a
  "payroll.PR": "e1e2e3e4e6e7|e9f214478c45cc28|15", // r2 R9 · measured on 44a75f37a
 },
 control: unpack({
  hub: "O:ok M:ok MB:ok P:ok PB:ok S:ok S0:ok SR:ok SD:ok K:ok N:ok PR:ok PA:ok",
  attendance: "O:ok M:ok MB:ok P:404 PB:404 S:ok S0:ok SR:404 SD:404 K:404 N:404 PR:404 PA:404",
  roster: "O:ok M:ok MB:ok P:404 PB:404 S:404 S0:404 SR:404 SD:404 K:404 N:404 PR:404 PA:404",
  kiosk: "O:ok M:ok MB:ok P:404 PB:404 S:404 S0:404 SR:404 SD:404 K:ok N:404 PR:404 PA:404",
  requests: "O:ok M:ok MB:ok P:ok PB:ok S:404 S0:404 SR:404 SD:ok K:404 N:404 PR:404 PA:ok",
  reports: "O:ok M:ok MB:ok P:ok PB:ok S:404 S0:404 SR:404 SD:ok K:404 N:404 PR:404 PA:404",
  settings: "O:ok M:ok MB:ok P:404 PB:404 S:404 S0:404 SR:404 SD:404 K:404 N:404 PR:404 PA:404",
  law: "O:ok M:ok MB:ok P:404 PB:404 S:404 S0:404 SR:404 SD:404 K:404 N:404 PR:404 PA:404",
 }),
 picker: {"O": "e1,e2,e3,e4,e6,e7", "M": "e1,e2,e3,e4,e6,e7", "MB": "e1,e2,e4,e7", "P": "e1,e2,e3,e4,e6,e7", "PB": "e1,e2,e4,e7", "S": "e1,e2,e3,e4,e6,e7", "SR": "e1,e2,e3,e4,e6,e7", "SD": "e1,e2,e3,e4,e6,e7"},
 nav: {"O": "cd91126ce675553b", "O+L": "e17fc8d4f5e9d02f", "M": "cd91126ce675553b", "M+L": "e17fc8d4f5e9d02f", "MB": "cd91126ce675553b", "MB+L": "e17fc8d4f5e9d02f", "P": "14f7814f73aa18c5", "P+L": "ddceeb07bd12eb16", "PB": "14f7814f73aa18c5", "PB+L": "ddceeb07bd12eb16", "S": "040a6263c09e16d7", "S+L": "3c0b3a58827a0e37", "S0": "040a6263c09e16d7", "S0+L": "3c0b3a58827a0e37", "SR": "040a6263c09e16d7", "SR+L": "3c0b3a58827a0e37", "SD": "14f7814f73aa18c5", "SD+L": "ddceeb07bd12eb16", "K": "5376633c94c41a21", "K+L": "8e0daf2454570a2d", "N": "040a6263c09e16d7", "N+L": "3c0b3a58827a0e37", "PR": "040a6263c09e16d7", "PR+L": "3c0b3a58827a0e37", "PA": "14f7814f73aa18c5", "PA+L": "ddceeb07bd12eb16"},
 hub: {"O": "ac4dfe0d4aed6d66|6", "M": "ac4dfe0d4aed6d66|6", "MB": "ac4dfe0d4aed6d66|4", "P": "6369a38186eee9c8|6", "PB": "ef71fdc31ae76d0e|1", "S": "b0a6102daa942ffa|6", "S0": "b0a6102daa942ffa|6", "SR": "b22af5dae3961cd4|6", "SD": "6369a38186eee9c8|6", "K": "4a8c2bd596c43dd3|6", "N": "b22af5dae3961cd4|6", "PR": "3ec4c825dc74ba63|", "PA": "1841919fb3ad1957|"},
};

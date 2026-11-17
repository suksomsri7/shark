// QC HR VIS-5b/5c shared helpers (render without a browser · statics on the diff) · briefs hr-brief-VIS-5b.md / -5c.md · notes hr-VIS-5bc-oracle.md · ⚠️ ORACLE-EDIT only
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { type Any, ROOT, rd, stripComments, srcFiles, flat, jsonOf, fileAt, errText, importsOf } from "./qc-hr-lib.mjs";
import { textOfAny, bodyOf } from "./qc-hr-priv-2-lib.mjs";

export const H = "src/lib/modules/hr/";
const git = (a: string[]) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
/** R-base: merge-base with LOCAL session/hr (QC_VIS5_BASE overrides) — same rule as priv-2 S4/S5 */
export const BASE = process.env.QC_VIS5_BASE || git(["merge-base", "HEAD", "session/hr"]) || "09713f4305eb3b8c1a5f8545f909efec0e30b96e";
export const sha16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// ═════════════ ticket file lists (brief §6/§7 · 5b-1 · 5c §7) ═════════════
export type Tk = "5b" | "5c";
export const MARK: Record<Tk, string> = { "5b": "HR VIS-5b", "5c": "HR VIS-5c" };
export const UI = `${H}ui.tsx`, TH = "src/messages/th/common.json", EN = "src/messages/en/common.json", INV = "scripts/hr-ui-inventory.json";
export const OWN: Record<Tk, { files: string[]; fresh: string[]; ranges: [number, number][]; block: string; after: string }> = {
 "5b": { files: ["src/app/app/sys/[id]/page.tsx", "src/components/module-tabs.tsx", `${H}overview-ui.tsx`, `${H}InboxBatch.tsx`], fresh: [`${H}hub-ui.tsx`, `${H}hub-rules.ts`], ranges: [[89, 118], [717, 802]] /* HR VIS-5b re-merge ▸ base = session/hr a49f81829: PRIV-3 shifted ui.tsx (+1 import · +7 before HrHub · +2 in it) · was [[88, 117], [710, 793]] ◂ */, block: "hub", after: "inbox" },
 "5c": { files: ["src/app/app/sys/[id]/hr/employees/page.tsx", "src/app/app/sys/[id]/hr/employees/[employeeId]/page.tsx", `${H}EmployeeProfileForm.tsx`], fresh: [`${H}people-ui.tsx`, `${H}people-rules.ts`], ranges: [[439, 716]] /* HR VIS-5b re-merge ▸ same PRIV-3 shift (+7) · was [[432, 709]] ◂ */, block: "people", after: "life" },
};
export const ORACLE_FILES = ["scripts/qc-hr-vis-5b.mts", "scripts/qc-hr-vis-5c.mts", "scripts/qc-hr-vis-5-lib.mts"];
const SHARED_FREE = [TH, EN, INV, UI, "scripts/walk-hr-matrix.json", ...ORACLE_FILES];
export const ORACLE_EDIT_MARK = "ORACLE-EDIT (HR VIS-5";

export type Hunk = { a: number; an: number; added: string[]; removed: string[] };
/** `git diff -U0 BASE -- f` hunks with base line numbers (a = first base line · an = base line count; an 0 = pure insertion after a) */
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
/** tracked diff vs BASE + untracked under src/ and scripts/ (scratchpad/ and ledger/ of other agents are not ours to judge) */
export function changed(): string[] {
 const t = git(["diff", "--name-only", BASE, "--"]).split("\n"), u = git(["ls-files", "--others", "--exclude-standard", "--", "src", "scripts", "prisma"]).split("\n");
 return [...new Set([...t, ...u].filter(Boolean))];
}
const importEnd = (src: string) => { let n = 0; src.split("\n").forEach((l, i) => { if (/^import\b|^\s*\}?\s*from\s+["']/.test(l)) n = i + 1; }); return n; };
const inRange = (h: Hunk, rs: [number, number][]) => rs.some(([s, e]) => (h.an === 0 ? h.a >= s - 1 && h.a <= e : h.a >= s && h.a + h.an - 1 <= e));
const marked = (h: Hunk, mk: string) => h.added.some((l) => l.includes(mk));
/** S-files/S-hunks of one ticket: outside = files the ticket may not touch · bad = unmarked / out-of-range hunks */
export function diffStatics(tk: Tk): { outside: string[]; bad: string[]; files: string[] } {
 const me = OWN[tk], other = OWN[tk === "5b" ? "5c" : "5b"], ch = changed(), outside: string[] = [], bad: string[] = [];
 const oracleOk = (f: string) => /^scripts\/(qc-|fitness)[^/]*\.mts$/.test(f) && fileAt(BASE, f) !== null && hunksOf(f).length > 0 && hunksOf(f).every((h) => marked(h, ORACLE_EDIT_MARK));
 // ORACLE-EDIT (HR VIS-5a · controller) S1 (re-merge 2): explicit VIS-5a files (lane wip/hr-vis-5a carries VIS-5b in base) — edited src/tools only when EVERY hunk adds a line with "HR VIS-5a" and "◂"; new files (2 src + VIS-5a's own 2 oracles) only with "HR VIS-5a" in lines 1–3 · anything else still outside ◂
 const V5A_EDIT = ["src/app/app/sys/[id]/hr/payroll/page.tsx", "src/app/app/sys/[id]/hr/attendance/page.tsx", `${H}payroll-ui.tsx`, `${H}payroll-run-ui.tsx`, `${H}reports-ui.tsx`, "scripts/walk-hr.mts", "scripts/seed-hr-walk.mts"], V5A_NEW = [`${H}pay-run-view.ts`, `${H}period-label.ts`, "scripts/qc-hr-vis-5a.mts", "scripts/qc-hr-vis-5a-lib.mts"]; // ORACLE-EDIT (HR VIS-5a · controller) ◂
 const vis5aOk = (f: string) => V5A_EDIT.includes(f) ? fileAt(BASE, f) !== null && hunksOf(f).length > 0 && hunksOf(f).every((h) => h.added.some((l) => l.includes("HR VIS-5a") && l.includes("◂"))) : V5A_NEW.includes(f) && fileAt(BASE, f) === null && rd(f).split("\n").slice(0, 3).join("\n").includes("HR VIS-5a"); // ORACLE-EDIT (HR VIS-5a · controller) ◂
 // ORACLE-EDIT (HR VIS-5d · controller) S1: explicit VIS-5d files (brief hr-brief-VIS-5d.md §8) — edited src/walk tools only when EVERY hunk adds a line with "HR VIS-5d" and "◂"; new files (settings-view.ts · settings-ui.tsx · *TemplateRowsEditor*.tsx · the VIS-5d oracle) only with "HR VIS-5d" in lines 1–3 · anything else still outside ◂
 const V5D_EDIT = ["src/app/app/sys/[id]/hr/settings/page.tsx", "src/app/app/sys/[id]/hr/settings/law/page.tsx", "src/app/app/sys/[id]/hr/settings/ApiKeysCard.tsx", ...["law-ui", "lifecycle-ui", "line-ui", "work-entries-ui", "labor-ui", "attendance-pay-ui", "payroll-run-ui", "payroll-accounting-ui", "bank-files/ui", "filings/ui", "leave-presets-ui"].map((x) => `${H}${x}.tsx`), "scripts/walk-hr.mts", "scripts/seed-hr-walk.mts"]; // ORACLE-EDIT (HR VIS-5d · controller) ◂
 const vis5dOk = (f: string) => V5D_EDIT.includes(f) ? fileAt(BASE, f) !== null && hunksOf(f).length > 0 && hunksOf(f).every((h) => h.added.some((l) => l.includes("HR VIS-5d") && l.includes("◂"))) : (/^src\/lib\/modules\/hr\/(settings-view\.ts|settings-ui\.tsx|[\w-]*TemplateRowsEditor[\w-]*\.tsx)$/.test(f) || f === "scripts/qc-hr-vis-5d.mts") && fileAt(BASE, f) === null && rd(f).split("\n").slice(0, 3).join("\n").includes("HR VIS-5d"); // ORACLE-EDIT (HR VIS-5d · controller) ◂
 for (const f of ch) {
  if (f.startsWith("ledger/") || SHARED_FREE.includes(f)) continue;
  if (vis5dOk(f)) continue; // ORACLE-EDIT (HR VIS-5d · controller) S1 ◂
  if (vis5aOk(f)) continue; // ORACLE-EDIT (HR VIS-5a · controller) S1 ◂
  if (me.files.includes(f)) { for (const h of hunksOf(f)) if (!marked(h, MARK[tk])) bad.push(`${f.split("/").slice(-2).join("/")}@${h.a}:unmarked`); continue; }
  if (me.fresh.includes(f)) { const b = fileAt(BASE, f); if (b !== null || !rd(f).split("\n").slice(0, 3).join("\n").includes(MARK[tk])) bad.push(`${f.split("/").pop()}:header`); continue; }
  if (oracleOk(f)) continue;
  outside.push(f + (other.files.includes(f) || other.fresh.includes(f) ? "(other ticket)" : ""));
 }
 // ui.tsx is shared by range: own hunks in own ranges (or the import block) carry the own marker · the other ticket's hunks only in its ranges with its marker
 const ie = importEnd(fileAt(BASE, UI) ?? "");
 for (const h of ch.includes(UI) ? hunksOf(UI) : []) {
  const imp = h.a <= ie + 1 && h.added.concat(h.removed).every((l) => /^\s*(import\b|\}?\s*from\b|[\w{},\s]*$|\/\/)/.test(l) || l.includes("HR VIS-5"));
  const mine = marked(h, MARK[tk]) && (imp || inRange(h, me.ranges)), theirs = !marked(h, MARK[tk]) && marked(h, MARK[tk === "5b" ? "5c" : "5b"]) && (imp || inRange(h, other.ranges));
  if (!mine && !theirs) bad.push(`ui.tsx@${h.a}+${h.an}:${marked(h, MARK[tk]) ? "range" : "unmarked"}`);
 }
 return { outside, bad, files: ch };
}

// ═════════════ i18n (F16.4 for the new block · position · no Thai in en · no Thai literal in new JSX) ═════════════
export function msgStatics(tk: Tk): Record<string, boolean | string> {
 const me = OWN[tk], oth = OWN[tk === "5b" ? "5c" : "5b"].block, base = (p: string) => { try { return JSON.parse(fileAt(BASE, p) ?? "null"); } catch { return null; } };
 const r: Record<string, boolean | string> = {};
 for (const [lc, p] of [["th", TH], ["en", EN]] as const) {
  const b = flat(base(p) ?? {}), n = flat(jsonOf(p) ?? {});
  const moved = [...new Set([...Object.keys(b), ...Object.keys(n)])].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(n[k]) && !k.startsWith(`hr.${me.block}.`) && !k.startsWith(`hr.${oth}.`) && !/^hr\.(run2|payview|setview)\./.test(k)); // ORACLE-EDIT (HR VIS-5d · controller) S5: + hr.setview.* (VIS-5d message block · no other key) ◂ // ORACLE-EDIT (HR VIS-5a · controller) S5 (re-merge 2): VIS-5a's message keys (hr.run2.* · hr.payview.*, the same key-path rule as leave-3 ST3) are not "other" keys ◂
  r[`${lc}Only`] = !moved.length || moved.slice(0, 3).join(",");
  const hk = Object.keys((jsonOf(p) ?? {}).hr ?? {});
  r[`${lc}After`] = hk.indexOf(me.block) > 0 && hk.indexOf(me.block) === hk.indexOf(me.after) + 1;
 }
 const th = flat((jsonOf(TH) ?? {}).hr?.[me.block] ?? {}), en = flat((jsonOf(EN) ?? {}).hr?.[me.block] ?? {});
 r.parity = Object.keys(th).length > 0 && Object.keys(th).sort().join() === Object.keys(en).sort().join() && [...Object.values(th), ...Object.values(en)].every((v) => typeof v === "string" && v.trim() !== "");
 r.enNoThai = Object.values(en).every((v) => !/[฀-๿]/.test(String(v)));
 const thaiLines: string[] = [];
 for (const f of [...me.files, ...me.fresh, UI]) {
  if (!rd(f)) continue;
  const lines = fileAt(BASE, f) === null ? rd(f).split("\n").map((l, i) => [i + 1, l] as const) : hunksOf(f).filter((h) => f !== UI || marked(h, MARK[tk])).flatMap((h) => h.added.map((l) => [h.a, l] as const));
  for (const [n, l] of lines) if (/[฀-๿]/.test(stripComments(l).replace(/\{\/\*.*?\*\/\}/g, ""))) thaiLines.push(`${f.split("/").pop()}:${n}`);
 }
 r.noThaiLiteral = !thaiLines.length || thaiLines.slice(0, 4).join(",");
 return r;
}

// ═════════════ inventory ═════════════
type Row = { page: string; testid: string; wo?: string; conditional?: string; via?: string };
export const invRows = (atBase: boolean): Row[] => { try { return ((atBase ? JSON.parse(fileAt(BASE, INV) ?? "{}") : jsonOf(INV))?.rows ?? []) as Row[]; } catch { return []; } };
export const idRe = (id: string) => (id.endsWith("*") ? id.slice(0, -1) : id);
/** every id → a row (page · wo) */
export function invHas(ids: string[], page: string, wo: string): string[] {
 const rows = invRows(false).filter((r) => r.page === page);
 return ids.filter((id) => !rows.some((r) => r.testid === id && r.wo === wo));
}
/** source text of HR UI (modules + pages + components) for "id still exists" */
export const uiSource = () => [...srcFiles("src/lib/modules/hr"), ...srcFiles("src/app/app/sys/[id]"), "src/components/module-tabs.tsx"].filter((f) => f.endsWith(".tsx") || f.endsWith(".ts")).map((f) => rd(f)).join("\n");
/** ids that rows of `page` named at BASE and the source no longer contains */
export function baseIdsGone(page: string): string[] {
 const src = uiSource();
 return [...new Set(invRows(true).filter((r) => r.page === page).map((r) => r.testid))].filter((id) => !src.includes(idRe(id).replace(/-$/, "")));
}

// ═════════════ pinned bodies (golden = base 09713f430) ═════════════
export function pinned(spec: Record<string, [string, string, string]>): string[] {
 return Object.entries(spec).filter(([n, [f, want]]) => sha16(bodyOf(stripComments(rd(f)), n.replace(/#.*$/, ""))) !== want).map(([n, [, , w]]) => `${n}${w ? `(${w})` : ""}`);
}

// ═════════════ render without a browser ═════════════
const req = createRequire(join(ROOT, "src", "qc-vis5-anchor.cjs")); // same CJS instances as the app modules (tsx require chain)
let React: Any, RDS: Any, NI: Any, ARC: Any;
export const CUR = { locale: "th", messages: {} as Any, missing: [] as string[] };
const MSG: Record<string, Any> = {};
const msgsOf = (lc: string) => (MSG[lc] ??= { ...JSON.parse(rd(`src/messages/${lc}/common.json`)), pos: JSON.parse(rd(`src/messages/${lc}/pos.json`) || "{}") });
/** next-intl/server outside Next: same messages as src/i18n/request.ts · missing keys recorded (‹MISSING:…›) */
export function installIntl(): void {
 React = req("react"); RDS = req("react-dom/server"); NI = req("next-intl"); ARC = req("next/dist/shared/lib/app-router-context.shared-runtime");
 const onError = (e: Any) => { CUR.missing.push(String(e?.message ?? e).slice(0, 80)); };
 const getMessageFallback = ({ namespace, key }: Any) => `‹MISSING:${namespace ? `${namespace}.` : ""}${key}›`;
 const tr = (ns?: string) => NI.createTranslator({ locale: CUR.locale, messages: CUR.messages, namespace: ns, timeZone: "Asia/Bangkok", onError, getMessageFallback });
 const shim = {
  getTranslations: async (o?: Any) => tr(typeof o === "string" ? o : o?.namespace), getLocale: async () => CUR.locale, getMessages: async () => CUR.messages,
  getFormatter: async () => NI.createFormatter({ locale: CUR.locale, timeZone: "Asia/Bangkok" }), getNow: async () => new Date(), getTimeZone: async () => "Asia/Bangkok", setRequestLocale: () => undefined, getRequestConfig: (f: Any) => f,
 };
 const Mod = req("node:module") as Any, id = join(ROOT, "src", "‹qc-next-intl-server›.cjs"), orig = Mod._resolveFilename;
 Mod._cache[id] = { id, filename: id, loaded: true, exports: shim, children: [], paths: [] };
 Mod._resolveFilename = function (this: unknown, r: string, ...a: unknown[]) { return r === "next-intl/server" ? id : orig.call(this, r, ...a); };
}
/** functions exported by "use client" files (HR + components) — their props are what the browser receives */
const CLIENT = new Map<unknown, string>();
export async function loadClientSet(): Promise<number> {
 for (const f of [...srcFiles("src/lib/modules/hr"), ...srcFiles("src/components")].filter((x) => x.endsWith(".tsx") && /^\s*["']use client["']/.test(rd(x)))) {
  const m = (await import(`@/${f.slice(4).replace(/\.tsx$/, "")}` as string).catch(() => null)) as Any;
  for (const v of Object.values(m ?? {})) if (typeof v === "function" || (v && typeof v === "object" && (v as Any).$$typeof)) CLIENT.set(v, f.split("/").pop()!);
 }
 return CLIENT.size;
}
const isNextCtl = (e: Any) => /^NEXT_(REDIRECT|HTTP_ERROR|NOT_FOUND)/.test(String(e?.digest ?? e?.message ?? ""));
export type Rendered = { html: string; client: { name: string; props: Any }[]; clientText: string; err: string };
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
/** Next request scope (technique of qc-hr-h0.3 / priv-2) — cookie = the viewer's session · search = page query */
export async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
 const nw = req("next/dist/server/app-render/work-async-storage.external.js"), nu = req("next/dist/server/app-render/work-unit-async-storage.external.js"), nc = req("next/dist/server/web/spec-extension/cookies.js");
 const rq = new Request(`http://qc.local${pathname}`, { headers: { cookie } }), jar = new nc.RequestCookies(rq.headers);
 const ws = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
 const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: rq.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
 return nw.workAsyncStorage.run(ws, () => nu.workUnitAsyncStorage.run(unit, fn));
}
/** render a page module's default export as `who` (cookie) in `locale` */
export async function renderPage(mod: Any, cookie: string, path: string, params: Record<string, string>, sp: Record<string, string>, locale: "th" | "en"): Promise<Rendered> {
 try { return await inScope(`${cookie}; LOCALE=${locale}`, path, async () => renderTree(await mod.default({ params: Promise.resolve(params), searchParams: Promise.resolve(sp) }), locale)); } catch (e) { return { html: "", client: [], clientText: "", err: `${(e as Any)?.digest ? `${String((e as Any).digest).split(";")[0]} ` : ""}${errText(e)}` }; }
}
/** React.createElement of the app's React instance */
export const h = (t: Any, p: Any, ...c: Any[]) => React.createElement(t, p, ...c);
const ROUTER = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {}, hmrRefresh() {} };
/** await server components · keep client components as elements (props recorded) · static HTML inside intl + router providers */
export async function renderTree(node: Any, locale: "th" | "en"): Promise<Rendered> {
 const client: Rendered["client"] = [];
 CUR.locale = locale; CUR.messages = msgsOf(locale);
 try {
  const tree = await resolveNode(node, client);
  const el = React.createElement(NI.NextIntlClientProvider, { locale, messages: CUR.messages, timeZone: "Asia/Bangkok", onError: () => undefined, getMessageFallback: ({ namespace, key }: Any) => `‹MISSING:${namespace}.${key}›` }, React.createElement(ARC.AppRouterContext.Provider, { value: ROUTER }, tree));
  const err = console.error;
  console.error = () => undefined;
  try { return { html: String(RDS.renderToStaticMarkup(el)), client, clientText: textOfAny(client.map((c) => c.props)), err: "" }; } finally { console.error = err; }
 } catch (e) { return { html: "", client, clientText: "", err: `${(e as Any)?.digest ? `${String((e as Any).digest).split(";")[0]} ` : ""}${errText(e)}` }; }
}

// ═════════════ HTML helpers ═════════════
export const unent = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;|&#160;/g, " ");
export const textOfHtml = (h: string) => unent(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
/** ids by prefix (exact attribute values) */
export const idsWith = (html: string, pfx: string) => [...html.matchAll(new RegExp(`data-testid="(${pfx.replace(/[-]/g, "\\-")}[^"]*)"`, "g"))].map((m) => m[1]!);
/** outer markup of the element carrying data-testid=id (balanced on its tag name) */
export function elOf(html: string, id: string): string {
 const at = html.indexOf(`data-testid="${id}"`);
 if (at < 0) return "";
 const s = html.lastIndexOf("<", at), tag = /^<([a-zA-Z0-9]+)/.exec(html.slice(s))?.[1] ?? "div";
 if (/^(input|img|br|hr|meta|link)$/i.test(tag)) return html.slice(s, html.indexOf(">", at) + 1);
 const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
 re.lastIndex = s + 1;
 let depth = 1, m: RegExpExecArray | null;
 while ((m = re.exec(html))) { depth += m[0].startsWith("</") ? -1 : 1; if (!depth) return html.slice(s, m.index + m[0].length); }
 return html.slice(s);
}
/** the element shows n as the whole text of one of its nodes (e.g. <span>7</span>) */
export const showsNum = (el: string, n: number) => new RegExp(`>\\s*${n}\\s*<`).test(el);
export const attrOf = (el: string, name: string) => unent(new RegExp(`\\s${name}="([^"]*)"`).exec(el)?.[1] ?? "");
export const hrefsIn = (el: string) => [...el.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((m) => unent(m[1]!));
export const queryOf = (href: string): Record<string, string> => Object.fromEntries(new URL(href, "http://x").searchParams.entries());
export const isClientFile = (f: string) => /^\s*["']use client["']/.test(rd(f));
export const clientNames = (r: Rendered) => new Set(r.client.map((c) => c.name));
export { importsOf };

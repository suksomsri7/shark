// C5.5-fix5 INDEPENDENT REVIEW — differential fuzz + growth, pure (no DB, no env).
// OLD implementations are NOT hand-copied: each one is cut out of `git show b8e8ad52:<file>` with the TypeScript AST, transpiled and
// evaluated; NEW implementations are cut out of the working tree the same way (private functions) or imported (exported ones).
// For every rewritten site: (E) old ≡ new on adversarial seeded-random corpora (angle brackets, quotes, escapes, comments, CR/LF/TAB/NUL,
// U+2028/2029, NBSP/BOM/ideographic space, Kelvin/long-s/dotted-I look-alikes, Thai, fullwidth `＜`) · (G) growth time(4n)/time(n).
// Run: pnpm exec tsx scripts/pending/cf6/review/rv-cf6-fuzz.mts [casesPerSite]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const N = Number(process.argv[2] ?? 60000);
const BASE = "b8e8ad52";
const LT = (await import("@/lib/core/linear-text" as string)) as Any;
const IA = (await import("@/lib/core/inbound-address" as string)) as Any;
const SH = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;
const CS = (await import("@/lib/modules/crm/contacts-shared" as string)) as Any;
const SER = (await import("@/lib/modules/crm/api/serialize" as string)) as Any;
const CALLS = (await import("@/lib/modules/crm/calls-shared" as string)) as Any;
const SAN = (await import("@/lib/core/sanitize" as string)) as Any;

// ───────────── source extraction ─────────────
const oldSrc = (f: string) => execFileSync("git", ["show", `${BASE}:${f}`], { encoding: "utf8", maxBuffer: 64 << 20 });
const newSrc = (f: string) => readFileSync(f, "utf8");
function cut(src: string, name: string): string {
  const sf = ts.createSourceFile("x.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let out: string | null = null;
  const visit = (n: ts.Node) => {
    if (out) return;
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) out = n.getText(sf);
    else if (ts.isVariableStatement(n) && n.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name)) out = n.getText(sf);
    else ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!out) throw new Error(`cut: ${name} not found`);
  return (out as string).replace(/^export\s+/, "");
}
function load(parts: string[], ret: string, deps: Record<string, unknown> = {}): Any {
  const js = ts.transpileModule(parts.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return new Function(...Object.keys(deps), `${js}\nreturn ${ret};`)(...Object.values(deps));
}

const F = {
  ia: "src/lib/core/inbound-address.ts",
  sh: "src/lib/modules/crm/emails-shared.ts",
  em: "src/lib/modules/crm/emails.ts",
  kb: "src/lib/platform/kanban-email-in.ts",
  ce: "src/lib/core/email.ts",
  cards: "src/lib/modules/kanban/cards.ts",
  logo: "src/lib/branding/logo.ts",
  chat: "src/lib/modules/chat/service.ts",
  dom: "src/lib/domain/service.ts",
  cs: "src/lib/modules/crm/contacts-shared.ts",
  ser: "src/lib/modules/crm/api/serialize.ts",
  calls: "src/lib/modules/crm/calls-shared.ts",
  ds: "src/lib/ai/dataset.ts",
  ob: "src/lib/outbox-consumers.ts",
  page: "src/app/app/sys/[id]/crm/emails/[threadKey]/page.tsx",
};
const linDeps = { ...LT, trailingAngleAddr: IA.trailingAngleAddr, firstAngleAddr: IA.firstAngleAddr, angleIds: IA.angleIds };

const O: Any = {}, W: Any = {};
O.bareEmail = load([cut(oldSrc(F.ia), "bareEmail")], "bareEmail");
W.bareEmail = IA.bareEmail;
O.displayNameOf = load([cut(oldSrc(F.sh), "displayNameOf")], "displayNameOf");
W.displayNameOf = SH.displayNameOf;
O.kbBare = load([cut(oldSrc(F.kb), "bareEmail")], "bareEmail");
W.kbBare = load([cut(newSrc(F.kb), "bareEmail")], "bareEmail", linDeps);
O.bareAddr = load([cut(oldSrc(F.ce), "bareAddr")], "bareAddr");
W.bareAddr = load([cut(newSrc(F.ce), "bareAddr")], "bareAddr", linDeps);
const emHelpers = (src: string) => [cut(src, "str"), cut(src, "uniq")];
O.refIdsOf = load([...emHelpers(oldSrc(F.em)), cut(oldSrc(F.em), "refIdsOf")], "refIdsOf");
W.refIdsOf = load([...emHelpers(newSrc(F.em)), cut(newSrc(F.em), "refIdsOf")], "refIdsOf", linDeps);
O.authResultPass = load([...emHelpers(oldSrc(F.em)), cut(oldSrc(F.em), "authResultsInstances"), cut(oldSrc(F.em), "authResultPass")], "authResultPass", { process });
W.authResultPass = load([...emHelpers(newSrc(F.em)), cut(newSrc(F.em), "authResultsInstances"), cut(newSrc(F.em), "authResultPass")], "authResultPass", { process });
O.desc = load([cut(oldSrc(F.cards), "descriptionToText")], "descriptionToText");
W.desc = load([cut(newSrc(F.cards), "descriptionToText")], "descriptionToText", linDeps);
O.svg = load([cut(oldSrc(F.logo), "SVG_UNSAFE_PATTERNS")], "SVG_UNSAFE_PATTERNS");
W.svg = load([cut(newSrc(F.logo), "SVG_UNSAFE_PATTERNS")], "SVG_UNSAFE_PATTERNS");
O.origin = load([cut(oldSrc(F.chat), "normalizeOrigin")], "normalizeOrigin");
W.origin = load([cut(newSrc(F.chat), "normalizeOrigin")], "normalizeOrigin", linDeps);
O.host = load([cut(oldSrc(F.dom), "normalizeHost")], "normalizeHost");
W.host = load([cut(newSrc(F.dom), "normalizeHost")], "normalizeHost", linDeps);
O.maskPii = load([cut(oldSrc(F.cs), "maskPii")], "maskPii");
W.maskPii = CS.maskPii;
O.maskPiiPatterns = load([cut(oldSrc(F.ser), "EMAIL_IN_TEXT"), cut(oldSrc(F.ser), "TH_PHONE_IN_TEXT"), cut(oldSrc(F.ser), "maskPiiPatterns")], "maskPiiPatterns", { maskContactValue: SER.maskContactValue });
W.maskPiiPatterns = SER.maskPiiPatterns;
O.redactContactInfo = load([cut(oldSrc(F.calls), "redactContactInfo")], "redactContactInfo");
W.redactContactInfo = CALLS.redactContactInfo;
O.anonymize = load([cut(oldSrc(F.ds), "anonymize")], "anonymize");
W.anonymize = load([cut(newSrc(F.ds), "anonymize")], "anonymize", linDeps);
O.redactPii = load([cut(oldSrc(F.ob), "redactPii")], "redactPii");
W.redactPii = load([cut(newSrc(F.ob), "redactPii")], "redactPii", linDeps);
O.remoteImg = load([cut(oldSrc(F.page), "REMOTE_IMG_RE")], "REMOTE_IMG_RE");
W.hasRemoteImages = SH.hasRemoteImages;
O.emailSnippet = load([cut(oldSrc(F.sh), "emailSnippet")], "emailSnippet", { sanitizeHtml: SAN.sanitizeHtml });
W.emailSnippet = SH.emailSnippet;

// ───────────── checks ─────────────
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, name: string, ok: boolean, actual: string) => {
  cks.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}\n        — ${actual.slice(0, 900)}`);
};
const J = (v: unknown) => JSON.stringify(v);

// seeded PRNG (mulberry32)
let seed = 0xc0ffee;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)] as T;
const gen = (alpha: readonly string[], maxParts: number) => {
  const n = Math.floor(rnd() * (maxParts + 1));
  let s = "";
  for (let i = 0; i < n; i++) s += pick(alpha);
  return s;
};
const WS = [" ", "\t", "\r", "\n", "\0", "\u000b", "\u000c", "\u00a0", "\ufeff", "\u2028", "\u2029", "\u3000", "\u0085", "\u180e", "\u200b"];
const LOOK = ["\u212a", "\u017f", "\u0130", "\u0131", "＜", "＞", "‹", "›", "ก", "ไ", "é", "Ａ"];

function diff(id: string, name: string, alpha: readonly string[], maxParts: number, a: (s: string) => unknown, b: (s: string) => unknown, extra: string[] = [], cases = N) {
  let bad: string | null = null;
  let n = 0;
  const distinct = new Set<string>();
  let truthy = 0;
  const all = [...extra];
  for (let i = 0; i < cases; i++) all.push(gen(alpha, maxParts));
  for (const s of all) {
    n++;
    let x: string, y: string;
    try { x = J(a(s)); } catch (e) { x = `THROW ${(e as Error).message}`; }
    try { y = J(b(s)); } catch (e) { y = `THROW ${(e as Error).message}`; }
    if (x !== y) { bad = `input ${J(s)} → old ${x} · new ${y}`; break; }
    if (distinct.size < 100000) distinct.add(x);
    if (x === "true") truthy++;
  }
  chk(id, name, bad === null && distinct.size > 1, bad ?? `identical on ${n} inputs · ${distinct.size} distinct old outputs${distinct.has("true") ? ` · ${truthy} true` : ""}`);
}

console.log(`\n── E: old (git show ${BASE}) ≡ new on adversarial corpora (${N} random per site + fixed edge cases) ──`);
const ANG = ["<", ">", "<", ">", "<>", "><", '"', "'", "\\", "(", ")", ",", ";", "@", ".", "a", "B", "x", "=", "<a@b.co>", "name", "<x>", ...WS, ...LOOK];
const ANG_FIXED = ["", " ", "<>", "<<>>", "a<b>", "a <b> ", '"Doe, John" <j@d.co>', "<a> <b>", "<a>\n", "<a>\u2028", "x\n<y>", "x\u2028<y>", "x\r\n <y>", "\ufeff<y>\ufeff", "<a\n>", "＜a@b.co＞", "<a@b.co>\u0085", "<a@b.co>\u180e", "a@b.co (comment <x>)", "<<a@b.co>", "<a@b.co>>", "\0<a@b.co>\0", "\"<evil@x.co>\" <good@y.co>", "<good@y.co> \"<evil@x.co>\""];
diff("E.bareEmail", "core bareEmail (sender identity · rate-limit bucket · contact attribution · isCrmInboundAddress)", ANG, 14, O.bareEmail, W.bareEmail, ANG_FIXED);
diff("E.bareEmail.long", "core bareEmail — longer strings (≤ 60 parts)", ANG, 60, O.bareEmail, W.bareEmail, [], Math.floor(N / 4));
diff("E.displayNameOf", "displayNameOf (lead name · mimicsStaff display-name check)", ANG, 14, O.displayNameOf, W.displayNameOf, ANG_FIXED);
diff("E.kbBare", "kanban-email-in bareEmail (board mail-in sender → assignee)", ANG, 14, O.kbBare, W.kbBare, ANG_FIXED);
diff("E.bareAddr", "core/email bareAddr (outbound from/to/reply-to check)", ANG, 14, O.bareAddr, W.bareAddr, ANG_FIXED);
diff("E.refIds", "emails.ts refIdsOf (In-Reply-To/References → parent thread)", ANG, 14, (s) => O.refIdsOf({ "in-reply-to": s, references: s.split("").reverse().join("") }), (s) => W.refIdsOf({ "in-reply-to": s, references: s.split("").reverse().join("") }), ANG_FIXED);

// Authentication-Results — the WHOLE old/new authResultPass (instances parser + pairs regex) with our authserv-id set
process.env.CRM_INBOUND_AUTHSERV_ID = "mx.shark.in.th";
const AR = ["mx.shark.in.th", "mx.shark.in.th;", " dmarc=pass", " dmarc=fail", "dmarc=pass", " header.from=shop.co", "header.from=shop.co", " header.from=x@shop.co", " spf=pass", " dkim=pass", ";", "; ", " ", "\t", "\n", "\n\t", ",", "(", ")", "(c)", '"', '\\"', "\\", "=", "x", "-", ".", "_", "1", "reason=\"a;b\"", " policy.dmarc=none", "xdmarc=pass", "dmarc.x=pass", "a", "Dmarc=Pass", "HEADER.FROM=SHOP.CO", "\u212a", "\r"];
const AR_FIXED = [
  "mx.shark.in.th; dmarc=pass header.from=shop.co",
  "mx.shark.in.th; dmarc=pass header.from=shop.co; spf=pass smtp.mailfrom=shop.co",
  "mx.shark.in.th; xdmarc=pass header.from=shop.co",
  "mx.shark.in.th; foo.dmarc=pass header.from=shop.co",
  "mx.shark.in.th; dmarc=pass xheader.from=shop.co",
  "mx.shark.in.th; dmarc=pass reason=\"x header.from=shop.co\"",
  "mx.shark.in.th; dmarc=pass a\"b\"header.from=shop.co",
  "mx.shark.in.th; dmarc=pass x=\"q\"header.from=shop.co",
  "mx.shark.in.th; dmarc=pass header.from=\"shop.co\"",
  "mx.shark.in.th; dmarc=fail header.from=shop.co\nmx.shark.in.th; dmarc=pass header.from=shop.co",
  "mx.shark.in.th; dmarc=pass header.from=shop.co.",
  "mx.shark.in.th; dmarc = pass header.from = shop.co",
  "mx.shark.in.th; dmarc=pass\theader.from=shop.co",
  "mx.shark.in.th; dmarc=pass header.from=evil@shop.co",
];
diff("E.authResultPass", "authResultPass WHOLE (old vs new) — from shop.co · forged/odd A-R values", AR, 18, (s) => O.authResultPass({ "authentication-results": s }, "shop.co"), (s) => W.authResultPass({ "authentication-results": s }, "shop.co"), AR_FIXED);
const AR_ID = ["mx.shark.in.th", "mx.shark.in.th 1", "MX.Shark.In.Th", "evil.example", "mx.shark.in.th (c)", "mx.shark.in.thx", "x mx.shark.in.th"];
const AR_CL = ["dmarc=pass header.from=shop.co", "dmarc=fail header.from=shop.co", "dmarc=pass header.from=evil.co", "spf=pass smtp.mailfrom=shop.co", "dkim=pass header.i=@shop.co", "dmarc=pass (p=none) header.from=shop.co", "dmarc=pass reason=\"ok;x\" header.from=shop.co", "dmarc=pass x=\"a\\\"b\" header.from=shop.co", "xdmarc=pass header.from=shop.co", "dmarc=pass xheader.from=shop.co", "dmarc=pass header.from=SHOP.CO", "dmarc=pass\theader.from=shop.co", "dmarc = pass header.from = shop.co", "none", "dmarc=pass header.from=shop.co.", "dmarc=pass header.from=\"shop.co\""];
const NOISE = ["", "", "", " ", "\t", "\n", "\n\t", ",", "(", ")", "\"", "\\", ";", "=", "a", ".", "-"];
const arDoc = () => {
  const inst = () => { let t = pick(AR_ID); const k = 1 + Math.floor(rnd() * 3); for (let i = 0; i < k; i++) t += pick(["; ", ";", " ;\n\t"]) + pick(AR_CL); return t; };
  let d = inst();
  if (rnd() < 0.4) d += pick(["\n", ",", "\n\t", ", "]) + inst();
  const m = Math.floor(rnd() * 3);
  for (let i = 0; i < m; i++) { const at = Math.floor(rnd() * (d.length + 1)); d = d.slice(0, at) + pick(NOISE) + d.slice(at); }
  return d;
};
const AR_STRUCT: string[] = [];
for (let i = 0; i < N; i++) AR_STRUCT.push(arDoc());
diff("E.authResultPass.struct", "authResultPass WHOLE (old vs new) — structured A-R docs (real/forged instances, folding, comments, quotes) + noise", ["x"], 0, (s) => O.authResultPass({ "authentication-results": s }, "shop.co"), (s) => W.authResultPass({ "authentication-results": s }, "shop.co"), AR_STRUCT, 0);
const AR_ON = AR_FIXED.filter((s) => W.authResultPass({ "authentication-results": s }, "shop.co")).length;
chk("E.authResultPass.positive", "positive control: some fixed A-R values do authenticate (the diff is not vacuous)", AR_ON > 0, `${AR_ON}/${AR_FIXED.length} fixed values pass (same on old: ${AR_FIXED.filter((s) => O.authResultPass({ "authentication-results": s }, "shop.co")).length})`);
// the pair regex alone, on raw (not just lower-cased) clauses: full match lists must be equal
const PAIR_OLD = /([a-z0-9._-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^\s";]+)/g;
const PAIR_NEW = /(?<![a-z0-9._-])([a-z0-9._-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^\s";]+)/g;
chk("E.pairRe.src", "the pair regex literals used here are the ones in the base / tip files", oldSrc(F.em).includes(`matchAll(${PAIR_OLD})`) && newSrc(F.em).includes(`matchAll(${PAIR_NEW})`), `${PAIR_OLD} · ${PAIR_NEW}`);
const mAll = (re: RegExp, s: string) => [...s.matchAll(re)].map((m) => [m.index, m[1], m[2]]);
diff("E.pairRe", "Authentication-Results pair regex alone: identical match lists (index, key, value)", ["a", "k", "dmarc", "header.from", ".", "-", "_", "1", "=", " = ", '"', "\\", '\\"', " ", "\t", ";", "x", "@", "(", "\n", "Z", "é", "\u212a", "pass"], 24, (s) => mAll(PAIR_OLD, s), (s) => mAll(PAIR_NEW, s));

const HT = ["<", ">", "<li", "<LI", "<Li ", "<li>", "</li>", "<link>", "<br>", "<br/>", "<BR />", "</p>", "</div>", "<p>", "<a href='x'>", " ", "\t", "\n", "\r", "&amp;", "&nbsp;", "&lt;", "&#39;", "&#039;", "x", "ก", "<>", "<<", ">>", "\u0130", "\u0131", "\u212a", "<l", "i", "<img", " src=\"http:", " SRC=\"HTTPS:", "src=\"https:", "<IMG", "\u017f"];
diff("E.desc", "kanban descriptionToText (whole function old vs new)", HT, 22, O.desc, W.desc);
diff("E.stripTags", "stripTags ≡ /<[^>]*>/g (repl ' ')", HT, 22, (s) => s.replace(/<[^>]*>/g, " "), (s) => LT.stripTags(s, " "));
diff("E.stripTags+", "stripTags nonEmpty ≡ /<[^>]+>/g (repl '')", HT, 22, (s) => s.replace(/<[^>]+>/g, ""), (s) => LT.stripTags(s, "", { nonEmpty: true }));
diff("E.openTag", "replaceOpenTagCi(li) ≡ /<li[^>]*>/gi", HT, 22, (s) => s.replace(/<li[^>]*>/gi, "- "), (s) => LT.replaceOpenTagCi(s, "li", "- "));
diff("E.trimEndBlanks", "trimEndBlanks ≡ /[ \\t]+$/g (incl. strings with embedded \\n)", [" ", "\t", "\n", "a", "\u00a0", "\r"], 16, (s) => s.replace(/[ \t]+$/g, ""), (s) => LT.trimEndBlanks(s));
diff("E.trimBlanksNl", "trimBlanksBeforeNewlines ≡ /[ \\t]+\\n/g", [" ", "\t", "\n", "a", "\u00a0", "\r"], 16, (s) => s.replace(/[ \t]+\n/g, "\n"), (s) => LT.trimBlanksBeforeNewlines(s));
diff("E.remoteImg", "hasRemoteImages ≡ /<img[^>]+src=\"https?:/i (thread page 'show images' button)", HT, 22, (s) => O.remoteImg.test(s), (s) => W.hasRemoteImages(s));
diff("E.emailSnippet", "emailSnippet (whole, old vs new)", HT, 22, (s) => O.emailSnippet(null, s), (s) => W.emailSnippet(null, s), [], Math.floor(N / 4));

// SVG logo check — the only decision is refuse/accept, compare the full .some() verdict and pattern 2 alone
const SV = ["o", "n", "O", "N", "on", "ON", "oN", "a", "z", "Z", "=", " ", "\t", "\n", "\r", "\u00a0", "\ufeff", "\u2028", "\u3000", "-", ":", "1", "_", "\u017f", "\u212a", "é", "<", ">", "\"", "'", "/", "x", "onload", "ONERROR", "<script", "<SCRIPT", "javascript:", "JaVaScRiPt:", "java\nscript:", "&#106;", "ก", "\0"];
const svgAll = (pats: RegExp[]) => (t: string) => pats.some((re) => re.test(t));
diff("E.svg", "branding/logo SVG_UNSAFE_PATTERNS verdict (refuse/accept)", SV, 16, svgAll(O.svg), svgAll(W.svg));
diff("E.svg.onattr", "branding/logo `on*=` pattern alone", SV, 16, (s) => O.svg[1].test(s), (s) => W.svg[1].test(s));
diff("E.svg.long", "branding/logo verdict, longer documents (≤ 80 parts)", SV, 80, svgAll(O.svg), svgAll(W.svg), [], Math.floor(N / 4));

const OR = ["/", "/", "//", ".", "a", "http://", "https://", "x.co", ":", "8080", " ", "\t", "\n", "\u00a0", "\ufeff", "\\", "?", "#", "@", "A", "\u212a"];
diff("E.origin", "chat normalizeOrigin (widget Origin allow-list)", OR, 10, O.origin, W.origin, ["https://a.co/", "https://a.co////", "  https://A.co/ ", "https://a.co/.", "/", "////", "https://a.co/\u00a0", "https://a.co\\/"]);
diff("E.host", "domain normalizeHost (Host → tenant)", [".", ".", "a", "B", " ", "\t", "\u00a0", "-", "x.co", "\u212a", "\u0130", "/"], 12, O.host, W.host, ["a.co.", "a.co...", " A.CO. ", ".", "...."]);

const EM = ["a", "Z", "9", ".", "_", "%", "+", "-", "'", "@", " ", "x", "co", "b.cd", "@e.fg", ".c", "9x", "ก", "\n", "é", "A", "\u212a", "<", ">", "\"", "(", "0812345678", "+66 81 234 5678", "08-1234-5678", "1", " ", "\t", "\u00a0"];
const EM_FIXED = ["a@b.cd9x@e.fg", "a@b.cd_x@e.fg", "a@b.c", "a@b.cd", "x'y@b.cd", "a@b.cd.ef", "a@@b.cd", "a@b..cd", ".@-.co", "a@b.cd%x@e.fg", "a@b.cd+x@e.fg", "a@b.cd-x@e.fg", "a@b.cd.x@e.fg"];
diff("E.mailInText", "replaceEmailsInText ≡ /[A-Za-z0-9._%+-]+@…/g (matches marked)", EM, 20, (s) => s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => `[${m}]`), (s) => LT.replaceEmailsInText(s, (m: string) => `[${m}]`), EM_FIXED);
diff("E.mailInTextApos", "replaceEmailsInText apostrophe ≡ /[A-Za-z0-9._%+'-]+@…/g", EM, 20, (s) => s.replace(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => `[${m}]`), (s) => LT.replaceEmailsInText(s, (m: string) => `[${m}]`, { apostrophe: true }), EM_FIXED);
diff("E.maskPiiPatterns", "crm/api/serialize maskPiiPatterns (READONLY keys / AI assistant)", EM, 20, O.maskPiiPatterns, W.maskPiiPatterns, EM_FIXED);
diff("E.redactContactInfo", "calls-shared redactContactInfo (transcripts → AI)", EM, 20, O.redactContactInfo, W.redactContactInfo, EM_FIXED);
diff("E.anonymize", "ai/dataset anonymize", EM, 20, O.anonymize, W.anonymize, EM_FIXED);
diff("E.redactPii", "outbox-consumers redactPii (ops log)", EM, 20, O.redactPii, W.redactPii, EM_FIXED);
diff("E.maskPii", "contacts-shared maskPii (errors / audit)", ["a", "@", "@", ".", " ", "\"", "'", "<", ">", "1", "2", "-", "+", "\t", "\n", "ก", "x@y.z", "@@", "\u00a0", "\u2028", "\u3000", "\ufeff"], 20, O.maskPii, W.maskPii);

// ───────────── G: growth (time(4n)/time(n)) on adversarial pumps — incl. pumps aimed at the NEW code ─────────────
console.log("\n── G: growth of the NEW code, n → 4n (linear ≈ ×4 · quadratic ≈ ×16; pass < 8 or 4n under 3 ms) ──");
function best(f: (s: string) => unknown, s: string) { let b = Infinity; for (let k = 0; k < 3; k++) { const a = performance.now(); f(s); const d = performance.now() - a; b = Math.min(b, d); if (d > 300) break; } return b; }
function growth(id: string, name: string, f: (s: string) => unknown, mk: (n: number) => string, n = 50000) {
  const s1 = mk(n), s2 = mk(4 * n);
  best(f, s1);
  const a = best(f, s1), b = best(f, s2);
  const r = b / Math.max(a, 0.005);
  chk(id, name, b < 3 || r < 8, `n=${n} (${s1.length} ch): ${a.toFixed(2)} ms → ${s2.length} ch: ${b.toFixed(2)} ms (×${r.toFixed(1)})`);
}
const rep = (u: string) => (n: number) => u.repeat(Math.ceil(n / u.length));
const pumps: [string, (n: number) => string][] = [["<", rep("<")], ["<>", rep("<>")], ["<<>", rep("<<>")], ["< ", rep("< ")], ["<…> ws", (n) => "<a>" + " ".repeat(n)], ["ws…<a>", (n) => " ".repeat(n) + "<a>"], ["<…>", (n) => "<".repeat(n) + ">"], ["a <", rep("a <")], ["\\n<…>", (n) => "a\n".repeat(n / 2) + "<x>"]];
for (const [nm, mk] of pumps) {
  growth(`G.bareEmail[${nm}]`, `bareEmail ${nm}`, W.bareEmail, mk);
  growth(`G.displayNameOf[${nm}]`, `displayNameOf ${nm}`, W.displayNameOf, mk);
  growth(`G.kbBare[${nm}]`, `kanban bareEmail ${nm}`, W.kbBare, mk);
  growth(`G.refIds[${nm}]`, `refIdsOf ${nm}`, (s) => W.refIdsOf({ references: s }), mk);
}
const tagPumps: [string, (n: number) => string][] = [["<", rep("<")], ["<li", rep("<li")], ["<img", rep("<img")], ["<img src=\"http", rep("<img src=\"http")], ["<i", rep("<i")], ["sp+x", (n) => " ".repeat(n) + "x"], ["sp\\n", rep(" \t\n")], ["<a"+"sp", (n) => "<a" + " ".repeat(n)], ["<br sp", rep("<br ")], ["<>", rep("<>")], ["</", rep("</")], ["&", rep("&")]];
for (const [nm, mk] of tagPumps) {
  growth(`G.desc[${nm}]`, `descriptionToText ${nm}`, W.desc, mk);
  growth(`G.remoteImg[${nm}]`, `hasRemoteImages ${nm}`, W.hasRemoteImages, mk);
  growth(`G.htmlToText[${nm}]`, `core htmlToText (catch path of sendCrmEmailAction · inbound bodyText) ${nm}`, SAN.htmlToText, mk, 20000);
}
const mailPumps: [string, (n: number) => string][] = [["a", rep("a")], ["a@", rep("a@")], ["a@b.", rep("a@b.")], ["a.", (n) => "x@" + "a.".repeat(n / 2)], ["a@b.c9", rep("a@b.c9")], ["'", rep("'")], ["a@b.cd9", rep("a@b.cd9")], ["-@", rep("-@")], ["a@-", (n) => "a@" + "-".repeat(n)], ["a@a.a@", rep("a@a.a@")], ["1 ", rep("1 ")], ["0", rep("0")], ["1(", rep("1(")]];
for (const [nm, mk] of mailPumps) {
  growth(`G.maskPiiPatterns[${nm}]`, `maskPiiPatterns ${nm}`, W.maskPiiPatterns, mk);
  growth(`G.redactContactInfo[${nm}]`, `redactContactInfo ${nm}`, W.redactContactInfo, mk);
  growth(`G.maskPii[${nm}]`, `contacts maskPii ${nm}`, W.maskPii, mk);
}
for (const [nm, mk] of [["onon", rep("on")], ["o", rep("o")], ["on ", rep("on ")], ["a=", rep("aon=")], ["onX", (n: number) => "on" + "x".repeat(n)], ["sp=", (n: number) => "onx" + " ".repeat(n)]] as [string, (n: number) => string][]) {
  growth(`G.svg[${nm}]`, `SVG verdict ${nm}`, svgAll(W.svg), mk, 200000);
}
growth("G.origin", "normalizeOrigin ////…x", W.origin, (n) => "https://a.co" + "/".repeat(n) + "x");
growth("G.host", "normalizeHost ....x", W.host, (n) => "a" + ".".repeat(n) + "x");
// auth pairs on the 16 KiB-capped header — pumps aimed at the quoted-value alternative (a pre-existing shape the lookbehind does not touch)
const arPumps: [string, (n: number) => string][] = [["key run", (n) => "mx.shark.in.th; dmarc=pass " + "a".repeat(n)], ["k=\"\\\"", (n) => "mx.shark.in.th; dmarc=pass " + "k=\"\\\"".repeat(n / 5)], ["a=\"", (n) => "mx.shark.in.th; dmarc=pass " + "a=\"x".repeat(n / 4)]];
for (const [nm, mk] of arPumps) {
  growth(`G.authResultPass[${nm}]`, `authResultPass (new) ${nm}`, (s) => W.authResultPass({ "authentication-results": s }, "shop.co"), mk, 4096);
  const t = performance.now();
  W.authResultPass({ "authentication-results": mk(IA.INBOUND_HEADER_MAX - 40) }, "shop.co");
  console.log(`        · at the 16 KiB cap: ${(performance.now() - t).toFixed(1)} ms (${nm})`);
}

const fails = cks.filter((c) => !c.ok);
console.log(`\nJSON_SUMMARY ${J({ pass: cks.length - fails.length, total: cks.length, failed: fails.map((c) => c.id) })}`);

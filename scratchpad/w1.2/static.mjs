import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
const ROOT = process.cwd();
const walk = (rel) => { const abs = join(ROOT, rel); if (!existsSync(abs)) return []; const out = []; for (const n of readdirSync(abs)) { const p = join(rel, n); if (statSync(join(ROOT, p)).isDirectory()) out.push(...walk(p)); else if (/\.(ts|tsx|mts)$/.test(n)) out.push(p); } return out; };
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const compFiles = walk("src/components/book"), appFiles = walk("src/app/book");
const uiSrc = [...compFiles, ...appFiles].map((f) => stripComments(read(f))).join("\n");
const PLAT = ["@/lib/platform/trips-public", "@/lib/platform/trips-public-core", "@/lib/platform/trips-book", "@/lib/platform/trips-book-core"];
const UI_EXTRA = ["@/components/trips/trips-shared", "@/lib/branding/public", "@/messages/th/book.json", "@/messages/en/book.json"];
const allow = (s, ui) => s === "react" || s === "next" || s.startsWith("next/") || PLAT.includes(s) || (ui && UI_EXTRA.includes(s)) || s.startsWith("@/components/book/") || s.startsWith("./") || s.startsWith("../");
const bad = [];
for (const [files, ui] of [[appFiles, false], [compFiles, true]]) for (const f of files) for (const m of stripComments(read(f)).matchAll(/from\s+["']([^"']+)["']/g)) if (!allow(m[1] ?? "", ui)) bad.push(`${f} <- ${m[1]}`);
console.log("S4 imports bad:", bad);
console.log("use server files:", [...appFiles, ...compFiles].filter((f) => /["']use server["']/.test(read(f))));
const ac = stripComments(read("src/app/book/[shop]/actions.ts"));
console.log("redirects:", [...ac.matchAll(/redirect\(([^;]*)\)/g)].map((m) => m[1]).filter((r) => /\.get\(|formData|FormData|fd\b/.test(r)));
console.log("qkeys:", [...new Set([...ac.matchAll(/[?&]([A-Za-z_.]+)=/g)].map((m) => m[1]))]);
for (const [re, what] of [[/\bnow\s*:/, "now:"], [/\bdeps\s*:/, "deps:"], [/new Date\(/, "new Date("], [/Date\.now\(/, "Date.now"], [/x-forwarded-for|x-real-ip/i, "ip"], [/clientIpFromHeaders\(|bookClientKey\(/, "ck"]]) if (re.test(ac)) console.log("actions has", what);
console.log("export check", /export\s+(const|let|function\s)/.test(ac.replace(/export\s+async\s+function/g, "")));
for (const [re, what] of [[/\.toFixed\(/, "toFixed"], [/\.toLocaleString\(/, "toLocaleString"], [/parseFloat\(/, "parseFloat"], [/Intl\.NumberFormat/, "Intl"], [/Satang\s*[/*+-]\s*[\w(]|[\w)]\s*[*+-]\s*\w*Satang\b/, "satang math"], [/\.reduce\(/, "reduce"], [/dangerouslySetInnerHTML/, "dSIH"], [/new Date\(/, "new Date("], [/Date\.now\(/, "Date.now"]]) { const m = uiSrc.match(re); if (m) console.log("S6 UI has", what, JSON.stringify(uiSrc.slice(Math.max(0, m.index - 60), m.index + 40))); }
console.log("form action", /<form[^>]*action=\{/.test(uiSrc), "fetch", /\bfetch\(/.test(uiSrc));
for (const f of ["src/app/book/[shop]/c/[basket]/page.tsx", "src/app/book/[shop]/my/[token]/page.tsx"]) {
  const s = stripComments(read(f));
  const mi = s.search(/generateMetadata|export\s+const\s+metadata/); const mEnd = mi < 0 ? -1 : s.indexOf("\n}", mi); const meta = mi < 0 ? "" : s.slice(mi, mEnd > mi ? mEnd : mi + 1500);
  const titles = [...meta.matchAll(/title\s*:\s*([^,}\n]+)/g)].map((m) => m[1]);
  console.log(f, /referrer\s*:\s*["']no-referrer["']/.test(s), /robots\s*:\s*\{\s*index\s*:\s*false\s*,\s*follow\s*:\s*false\s*\}/.test(s), /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(s), titles, titles.every((t) => !/vm\b|\.code\b|product|\.date\b|params|token|basket/.test(t)));
}
const OWN = ["src/lib/platform/trips-book-core.ts","src/lib/platform/trips-book.ts","src/lib/modules/trips/public-booking.ts","src/app/book/[shop]/actions.ts","src/app/book/[shop]/c/[basket]/page.tsx","src/app/book/[shop]/my/[token]/page.tsx"];
for (const f of [...OWN, ...compFiles]) { const s = stripComments(read(f)); if (/:\s*any\b|<any>|\bas any\b|any\[\]/.test(s)) console.log("any in", f); if (/@ts-ignore|@ts-expect-error|eslint-disable/.test(read(f))) console.log("flag", f); }
for (const f of ["src/lib/platform/trips-book.ts","src/lib/modules/trips/public-booking.ts","src/lib/platform/trips-book-core.ts"]) { const s = stripComments(read(f)); for (const [re, what] of [[/\$transaction/, "$transaction"], [/checkRateLimitDb(Many)?\(/, "crl"], [/console\.(log|info|warn|error|debug)\(/, "console"], [/["'`]unknown["'`]/, "unknown"], [/"Agent[A-Z]\w*"|agentLink\.|agentAccount\./, "agent"]]) if (re.test(s)) console.log(f, "has", what); }
const core = stripComments(read("src/lib/platform/trips-book-core.ts"));
console.log("core imports", [...core.matchAll(/^import\s+(?!type\b)[^;]*;/gm)].map(m=>m[0]));
for (const [re, what] of [[/process\.env/, "env"], [/Date\.now\(/, "Date.now"], [/new Date\(\s*\)/, "new Date()"], [/\.get(Day|Date|Hours|Month|FullYear|Minutes)\(/, "getDay"], [/\bfetch\(/, "fetch"], [/prisma/, "prisma"], [/node:crypto|createHmac/, "crypto"]]) if (re.test(core)) console.log("core has", what);
const pm = stripComments(read("src/lib/modules/trips/public-booking.ts"));
console.log("pubmod writes", /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|INSERT INTO|UPDATE\s+"|DELETE FROM/.test(pm), /from\s+["']@\/lib\/core\/db["']/.test(pm));

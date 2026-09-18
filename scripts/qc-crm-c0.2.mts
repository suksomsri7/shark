// QC — CRM v2 WO C0.2: the crm module facade (`src/lib/modules/crm/index.ts`) — ZERO behaviour change
// Fable oracle (oracle writer) · the C0.2 builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh pnpm exec tsx scripts/qc-crm-c0.2.mts
// requires: crm-seed
//
// What this file proves (brief: ledger/crm-briefs/crm-brief-C0.2.md + its "Controller addendum 2026-09-17")
//   S1  the facade EXISTS and is COMPLETE — every symbol the five outside importers actually use today is
//       re-exported, with the same runtime shape. The symbol list is DERIVED FROM THE CODE by this file
//       (regex over the importer sources), never copied from the brief; SYMBOL_BASELINE below is only a
//       positive control that the derivation itself still works.
//   S2  no file outside the crm module imports `crm/service|rules|actions` any more (static scan of src/)
//       🔴 ORACLE-EDIT 17 ก.ย.: `crm/ui` = ทางเข้าคอมโพเนนต์ที่ถูกต้อง (ทุกโมดูลทำแบบนี้) — ไม่นับเป็นการล้วงลึก
//   S3  ZERO BEHAVIOUR CHANGE — the re-exported functions are called THROUGH THE FACADE and DIRECTLY from
//       `crm/service` in the same process against the same rows, and the two answers must be deep-equal on a
//       stable projection. Equality is RELATIONAL (facade vs direct, same run) so it survives any reseed:
//       no id, count or name from the QC data set is ever hard-coded here.
//   S4  the F2.3 fitness rule exists, has the same shape as F2.2 (account) and actually bites
//   X1  the facade does not widen data access: the same call with a foreign tenant / a foreign system of the
//       same tenant must still come back empty through BOTH paths (X2–X10: N-A, see the table at the bottom)
//
// House rules honoured (COMMON §"Oracle house style"):
//   1) SKIP guard — `src/lib/modules/crm/index.ts` does not exist yet ⇒ print SKIPPED + JSON_SUMMARY
//      {skipped:true} + exit 0, WITHOUT opening a database connection.
//   2) chk(id, name, ok, expected, actual, sev) with ids C0.2-S<g>.<n> / C0.2-X<k>.<n>
//   3) every row this file creates carries the marker `qc-c02-<tag>` and is deleted in `finally`;
//      seed rows are read but never written.
//   4) last line = JSON_SUMMARY {...}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

// ═══ SKIP guard (rule 1) — the facade is the deliverable of this work order ═══
const FACADE_FILE = "src/lib/modules/crm/index.ts";
if (!existsSync(FACADE_FILE)) {
  console.log(`⚠️  SKIPPED — WO C0.2 not built yet (${FACADE_FILE} does not exist)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const cq = (await import("./crm-qc-env.mts" as string).catch(() => null)) as {
  resolveCrmScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null>;
} | null;

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
const cut = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n)}…` : s);

// deep-equality on a stable projection: Set → sorted array, Date → ISO, object keys sorted, BigInt → string.
const stable = (v: Any): Any => {
  if (v === undefined || v === null) return null;
  if (v instanceof Set) return [...v].map((x) => String(x)).sort();
  if (v instanceof Map) return [...v.entries()].map(([k, x]) => [String(k), stable(x)]).sort();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(stable);
  if (typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  return v;
};
const j = (v: Any) => JSON.stringify(stable(v));
const eq = (a: Any, b: Any) => j(a) === j(b);
const byId = (rows: Any) => (Array.isArray(rows) ? [...rows].sort((x: Any, y: Any) => String(x?.id).localeCompare(String(y?.id))) : rows);
const nonEmpty = (v: Any) => (v instanceof Set ? v.size > 0 : Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined);

// ═══════════════════════════════════════════════════════════════════════════
// the five outside importers (controller addendum 2026-09-17 — re-verified with
//   grep -rn "modules/crm" src/ --include=*.ts --include=*.tsx \
//     | grep -v "^src/lib/modules/crm/" | grep -v "^src/app/app/sys/\[id\]/crm/"
// which returns exactly these six lines (five of them reach the server surface; the sixth, page.tsx, uses the ui entry point — see the ORACLE-EDIT note below) on session/crm @ efd8452)
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 ORACLE-EDIT C0.2-S1.3/S2.1/S2.2/S2.3/S4.3 (ผู้คุมงาน · 17 ก.ย. 2569) — ถอด `src/app/app/sys/[id]/page.tsx` ออกจาก
// รายชื่อ "ผู้เรียกที่ต้องย้ายไป facade" และให้ `crm/ui` เป็น **ทางเข้าที่สองที่ถูกต้อง** ไม่ใช่ของภายในที่ต้องซ่อน
// เหตุผล (หลักฐานในโค้ด main): หน้ารวมระบบ `src/app/app/sys/[id]/page.tsx` import Hub ของ **ทุกโมดูล** จาก `<module>/ui`
//   บรรทัด 8–19: coupon/ui · meeting/ui · kanban/ui · chat/ui · inventory/ui · hr/ui · marketing/ui · member/ui · point/ui · reward/ui
//   ⇒ กติกาของบ้านนี้คือ "index.ts = ผิวฝั่งเซิร์ฟเวอร์ · ui.tsx = ทางเข้าคอมโพเนนต์" · CRM ต้องเหมือนพี่น้องอีก 10 โมดูล
// และ addendum 2 ข้อ 1 ของผู้คุมงาน (สั่งให้ยัด CrmHub เข้า facade) **ผิด**: ทำให้ index.ts ลาก ui.tsx → core/context → lib/env
//   ซึ่ง parse process.env ตอน import ⇒ `env -u DATABASE_URL pnpm fitness` (ด่าน D5 โหมดสอง) แดงทั้ง F10.1 และ F13
//   builder พิสูจน์แล้วว่าถอดบรรทัดเดียวนี้ออก fitness กลับเขียวทั้งสองโหมด
const OUTSIDE_IMPORTERS = [
  "src/lib/ai/proposals.ts",
  "src/lib/modules/forms/service.ts",
  "src/lib/modules/account/contacts-list.ts",
  "src/lib/modules/account/contact-links.ts",
  "src/lib/modules/account/contact-profile.ts",
] as const;

// POSITIVE CONTROL for the derivation only (verified by hand on session/crm @ efd8452, 17 Sep 2026).
// The assertion is `derived ⊇ baseline`, never `derived === baseline`: if an importer starts using one more
// symbol the oracle must demand it too, but if the regex below ever rots to `[]` this baseline turns red.
const SYMBOL_BASELINE: Record<string, string[]> = {
  "src/lib/ai/proposals.ts": ["createContact"],
  "src/lib/modules/forms/service.ts": ["createContact"],
  "src/lib/modules/account/contacts-list.ts": ["listPartyIdsWithContact"],
  "src/lib/modules/account/contact-links.ts": ["findContactsForLink", "setContactPartyId"],
  "src/lib/modules/account/contact-profile.ts": ["findContactByPartyId", "findLatestDealForContact"],
};
// submodules the facade is meant to hide (the S2 scan and the derivation both key off this list)
// 🔴 ORACLE-EDIT (ดูเหตุผลด้านบน): `ui` ถูกถอดออก — เป็นทางเข้าที่ถูกต้องเหมือนทุกโมดูล ไม่ใช่ของภายใน
const DEEP = "(?:service|rules|actions)";
// specifiers that count as "the crm module": the facade itself or one of its internals
const CRM_SPEC = `@/lib/modules/crm(?:/index|/${DEEP})?`;

/** Derive, FROM THE SOURCE, which crm symbols a file uses (named imports + `ns.<x>` on a namespace import). */
function deriveSymbols(src: string): string[] {
  const out = new Set<string>();
  // import { a, b as c, type T } from "<crm>"
  for (const m of src.matchAll(new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*["']${CRM_SPEC}["']`, "g"))) {
    for (const raw of (m[1] ?? "").split(",")) {
      const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim();
      if (name) out.add(name);
    }
  }
  // import Default from "<crm>"  (not used today, but a builder could introduce it)
  for (const m of src.matchAll(new RegExp(`import\\s+([A-Za-z_$][\\w$]*)\\s*(?:,|from)[^\\n]*["']${CRM_SPEC}["']`, "g"))) {
    if (m[1] && m[1] !== "type") out.add("default");
  }
  // import * as ns from "<crm>"  → every `ns.<symbol>` in the file
  for (const m of src.matchAll(new RegExp(`import\\s+\\*\\s+as\\s+([A-Za-z_$][\\w$]*)\\s*from\\s*["']${CRM_SPEC}["']`, "g"))) {
    const ns = m[1];
    for (const u of src.matchAll(new RegExp(`\\b${ns}\\.([A-Za-z_$][\\w$]*)`, "g"))) out.add(u[1]);
  }
  return [...out].sort();
}

const derivedPerFile: Record<string, string[]> = {};
for (const f of OUTSIDE_IMPORTERS) derivedPerFile[f] = deriveSymbols(read(f));
const DERIVED = [...new Set(Object.values(derivedPerFile).flat())].sort();

/** every *.ts/*.tsx/*.mts under a directory */
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(p)) out.push(p);
  }
  return out;
}

const tag = Math.random().toString(36).slice(2, 8).replace(/[0-9]/g, "z"); // letters only (keeps redaction rules quiet)
const MARK = `qc-c02-${tag}`;
const rnd6 = String(Math.floor(Math.random() * 900000) + 100000);
const PHONE = `0999${rnd6}`;
const EMAIL = `${MARK}@qc.local`;
const made = { systems: [] as string[], pipelines: [] as string[], stages: [] as string[], deals: [] as string[], contacts: [] as string[], parties: [] as string[] };
let tid = "";
let SYS = "";

try {
  // ═══════════════════════════════════════════════════════════════════════
  // S1 — the facade exists and is complete (symbol list derived from the code)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── S1: facade completeness (symbol list derived from the five importers, not from the brief) ──");
  const derivationOk = OUTSIDE_IMPORTERS.every((f) => existsSync(f) && (SYMBOL_BASELINE[f] ?? []).every((s) => derivedPerFile[f].includes(s)));
  chk(
    "C0.2-S1.1",
    `[static] the symbol list is derived from the five outside importers and still covers the hand-verified baseline — ${OUTSIDE_IMPORTERS.map((f) => `${f.split("/").pop()}:{${derivedPerFile[f].join(",")}}`).join(" · ")}`,
    derivationOk && DERIVED.length > 0,
    `each file ⊇ ${JSON.stringify(SYMBOL_BASELINE)}`,
    cut(JSON.stringify(derivedPerFile)),
  );

  // load the facade + the internals it is supposed to hide
  const loadErr: Record<string, string> = {};
  const load = async (spec: string) => {
    try {
      return (await import(spec as string)) as Record<string, Any>;
    } catch (e) {
      loadErr[spec] = String((e as Error)?.message ?? e).slice(0, 160);
      return null;
    }
  };
  const facade = (await load("@/lib/modules/crm")) ?? (await load("@/lib/modules/crm/index"));
  const internals: Record<string, Record<string, Any> | null> = {};
  for (const m of ["service", "ui", "rules", "actions"]) internals[m] = await load(`@/lib/modules/crm/${m}`);
  chk(
    "C0.2-S1.2",
    "the facade module loads in a plain node/tsx process (account/forms/ai all import it from server code, and both fitness modes import those — so the facade must never drag in anything that needs a full env at import time; this is exactly what ORACLE-EDIT #1 was about)",
    !!facade,
    "loads",
    facade ? "loads" : `import failed: ${cut(JSON.stringify(loadErr))}`,
  );

  const ownerOf = (s: string) => Object.keys(internals).find((m) => internals[m] && s in (internals[m] as Record<string, Any>));
  const missing = DERIVED.filter((s) => !facade || !(s in facade) || facade[s] === undefined);
  chk(
    "C0.2-S1.3",
    `the facade re-exports EVERY symbol the five importers use (${DERIVED.length}: ${DERIVED.join(", ")}) — a missing one is a build break for a \`* as crmSvc\` caller`,
    !!facade && missing.length === 0,
    DERIVED.join(","),
    missing.length ? `missing from the facade: ${missing.join(", ")}` : "all present",
  );

  const shapeBad: string[] = [];
  for (const s of DERIVED) {
    if (!facade || !(s in facade)) continue;
    const owner = ownerOf(s);
    if (!owner) { shapeBad.push(`${s}: not found in service/ui/rules/actions (cannot compare)`); continue; }
    const src = (internals[owner] as Record<string, Any>)[s];
    const got = facade[s];
    if (got !== src) shapeBad.push(`${s}: facade value !== crm/${owner}.${s} (a wrapper was inserted — that is behaviour change, not a re-export)`);
    else if (typeof got !== typeof src) shapeBad.push(`${s}: typeof ${typeof got} vs ${typeof src}`);
    else if (typeof got === "function" && (got.length !== src.length || got.name !== src.name)) shapeBad.push(`${s}: arity/name ${got.name}/${got.length} vs ${src.name}/${src.length}`);
  }
  chk(
    "C0.2-S1.4",
    "SAME SHAPE: every re-exported symbol is the IDENTICAL binding as the internal one (===, same typeof, same arity, same fn.name) — this is what makes \"pure re-export\" mechanical: a wrapper, a bound copy or a changed signature all break ===",
    !!facade && shapeBad.length === 0,
    "identical bindings",
    shapeBad.length ? shapeBad.join(" · ") : "identical",
  );

  const fsrc = read(FACADE_FILE);
  const fsrcCode = fsrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const FORBIDDEN: [string, RegExp][] = [["function", /\bfunction\b/], ["class", /\bclass\b/], ["arrow =>", /=>/], ["const", /\bconst\s/], ["let", /\blet\s/], ["var", /\bvar\s/], ["await", /\bawait\b/], ["return", /\breturn\b/], ["if", /\bif\s*\(/]];
  const logicHits = FORBIDDEN.filter(([, r]) => r.test(fsrcCode)).map(([n]) => n);
  const hasReexport = /export\s+(?:\*|\{|type\s)/.test(fsrcCode) && /from\s*["'](?:\.\/|@\/lib\/modules\/crm\/)/.test(fsrcCode);
  chk(
    "C0.2-S1.5",
    "[static] index.ts is RE-EXPORTS ONLY — no function body, no const, no branch, no await (the brief: \"index.ts is re-exports only\"; a wrapper, a default value or a feature flag here would be behaviour change smuggled into a facade work order)",
    logicHits.length === 0 && hasReexport,
    "only `export … from \"./…\"` / `export * from` / `export type`",
    logicHits.length ? `logic found in index.ts: ${logicHits.join(", ")}` : hasReexport ? "re-exports only" : "no `… from \"./…\"` re-export found at all",
  );

  // ORACLE-EDIT C0.2-S1.6 (controller, 18 Sep): later work orders legitimately widen the facade inside their own
  //   marked blocks `// CRM C1.x ▸ … ◂ CRM C1.x` — exports declared there are owned by that WO, not "free" widening.
  const woBlocks = [...fsrc.matchAll(/\/\/ CRM (C\d+\.\d+[a-z]?) ▸[\s\S]*?◂ CRM \1/g)].map((m) => m[0]).join("\n");
  const woOwned = new Set<string>([
    ...[...woBlocks.matchAll(/export\s+\*\s+as\s+(\w+)/g)].map((m) => m[1]!),
    ...[...woBlocks.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((m) => m[1]!.split(",").map((x) => x.trim().split(/\s+as\s+/).pop()!.replace(/^type\s+/, "")).filter(Boolean)),
  ]);
  const extras = facade ? Object.keys(facade).filter((k) => k !== "default" && !DERIVED.includes(k) && !woOwned.has(k)) : [];
  chk(
    "C0.2-S1.6",
    `the facade exports EXACTLY what outside code uses today (+ types, which are erased at runtime) — extra runtime exports widen the module surface for free and should be added by the work order that needs them`,
    extras.length === 0,
    DERIVED.join(","),
    extras.length ? `extra runtime exports: ${extras.join(", ")}` : "exact",
    "MINOR",
  );

  // ═══════════════════════════════════════════════════════════════════════
  // S2 — nobody outside the crm module reaches past the facade
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── S2: no outside file imports crm/service|rules|actions (ui = component entry point, allowed) ──");
  // EXEMPT DIRECTORIES (exactly two, and why):
  //   1. `src/lib/modules/crm/**`      — the module's OWN files. Inside a module the files import each other
  //      relatively/deeply by design, and the facade itself must import them (`export … from "./service"`);
  //      forbidding it here would forbid the deliverable.
  //   2. `src/app/app/sys/[id]/crm/**` — the CRM module's own pages. Next.js forces a module's routes to live
  //      under src/app, so these files are part of the crm module even though they sit outside src/lib/modules;
  //      they are not "other modules" and F2.2/F2.3 do not consider them either.
  const EXEMPT = ["src/lib/modules/crm/", "src/app/app/sys/[id]/crm/"];
  const DEEP_RE = new RegExp(`(?:from\\s*|import\\(\\s*)["'][^"']*modules/crm/${DEEP}(?:["'/])`);
  const FACADE_RE = new RegExp(`(?:from\\s*|import\\(\\s*)["']@/lib/modules/crm(?:/index)?["']`);
  const allSrc = walk("src");
  const outsideFiles = allSrc.filter((f) => !EXEMPT.some((d) => f.startsWith(d)));
  const offenders = outsideFiles.filter((f) => DEEP_RE.test(read(f)));
  chk(
    "C0.2-S2.1",
    `[static] no file outside the crm module imports @/lib/modules/crm/{service,rules,actions} (${outsideFiles.length} files scanned under src/; exempt: (1) src/lib/modules/crm/** = the module's own files, the facade has to import them; (2) src/app/app/sys/[id]/crm/** = the module's own Next.js routes, which live outside src/lib only because of routing)`,
    offenders.length === 0,
    "0 deep importers",
    offenders.length ? offenders.join(", ") : "0",
  );
  // 🔴 ORACLE-EDIT: `crm/ui` ย้ายจากฝั่ง "ต้องถูกจับ" ไปฝั่ง "ต้องถูกปล่อย" (ทางเข้าคอมโพเนนต์ เหมือนทุกโมดูล)
  const bites = DEEP_RE.test('import * as x from "@/lib/modules/crm/service";') && DEEP_RE.test('import { x } from "@/lib/modules/crm/actions";') && DEEP_RE.test('const r = await import("@/lib/modules/crm/rules");');
  const quiet = !DEEP_RE.test('import * as x from "@/lib/modules/crm";') && !DEEP_RE.test('import * as x from "@/lib/modules/crm/index";') && !DEEP_RE.test('import { CrmHub } from "@/lib/modules/crm/ui";');
  chk(
    "C0.2-S2.2",
    "[static] POSITIVE CONTROL for the S2.1 scanner: it flags a synthetic `from \"@/lib/modules/crm/service\"` / `/actions` / dynamic `import(\".../rules\")`, and does NOT flag the legitimate entry points (`@/lib/modules/crm`, `crm/index`, `crm/ui`) — otherwise \"0 offenders\" would mean nothing",
    bites && quiet,
    "flags deep, ignores facade",
    `flagsDeep=${bites} ignoresFacade=${quiet}`,
  );
  const notRepointed = OUTSIDE_IMPORTERS.filter((f) => !FACADE_RE.test(read(f)));
  chk(
    "C0.2-S2.3",
    "[static] each of the five importers now imports FROM THE FACADE (`@/lib/modules/crm` or `/index`) — guards the cheap way to make S2.1 green, which is to delete the import instead of repointing it",
    notRepointed.length === 0,
    "6/6 repointed",
    notRepointed.length ? `still not importing the facade: ${notRepointed.join(", ")}` : "6/6",
  );

  // ═══════════════════════════════════════════════════════════════════════
  // S4 — the F2.3 fitness rule exists and bites
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── S4: fitness F2.3 (\"other modules touch crm only via crm/index\") ──");
  const fit = read("scripts/fitness.mts");
  const f23Idx = fit.indexOf('"F2.3"');
  const f23From = f23Idx < 0 ? 0 : fit.lastIndexOf("const", f23Idx) >= 0 ? Math.max(0, fit.lastIndexOf("const", f23Idx) - 600) : Math.max(0, f23Idx - 900);
  const f23Block = f23Idx < 0 ? "" : fit.slice(f23From, f23Idx + 500);
  chk(
    "C0.2-S4.1",
    "[static] scripts/fitness.mts declares a check with id F2.3 whose name says other modules reach crm only through crm/index (the facade)",
    f23Idx >= 0 && /crm/i.test(f23Block) && /index|facade/i.test(f23Block),
    "chk(\"F2.3\", …crm…index…)",
    f23Idx < 0 ? "no F2.3 in fitness.mts" : cut(f23Block.replace(/\s+/g, " "), 180),
  );
  chk(
    "C0.2-S4.2",
    // 🔴 ORACLE-EDIT C0.2-S4.2 (ผู้คุมงาน · 17 ก.ย. 2569 · รอบสอง — ผู้ตรวจจับได้ว่าข้อนี้ "เขียวด้วยเหตุผลที่ผิด")
    // ของเดิมบังคับให้บล็อก F2.3 มีคำว่า `moduleFiles` (ตามรูปของ F2.2) — แต่กฎฉบับที่สั่งให้ทำ **จงใจไม่ใช้** `moduleFiles`
    // เพราะต้องกวาดทั้ง src/ (ผู้เรียก 2 ใน 6 อยู่นอก src/lib/modules) · ที่ผ่านมาเขียวเพราะหน้าต่าง +500 ตัวอักษร
    // ไหลไปโดนกฎ F5 ที่อยู่ถัดไปซึ่งมีคำว่า `moduleFiles` พอดี ⇒ ข้อสอบไม่ได้ตรวจสิ่งที่อ้างเลย
    // ฉบับแก้: ตรวจ "สัญญาที่แท้จริง" ของกฎฉบับกว้าง — ต้องกวาดไฟล์นอกโมดูล · กันโฟลเดอร์ของโมดูลเอง 2 อัน ·
    //          จับ modules/crm/<ที่ไม่ใช่ index|ui> · รายงานชื่อไฟล์ที่ผิด
    "[static] F2.3 มีสัญญาครบตามกฎฉบับกว้าง: กวาดไฟล์นอกโมดูล · ยกเว้นโฟลเดอร์ของโมดูลเอง (src/lib/modules/crm + app/sys/[id]/crm) · จับ modules/crm/<ไม่ใช่ index|ui> · บอกชื่อไฟล์ที่ผิด",
    /modules\\?\/crm\\?\//.test(f23Block)
      && /\(\?!index/.test(f23Block)
      && /\(\?!ui/.test(f23Block)
      && /app\/sys\/\[id\]\/crm|app\\?\/sys/.test(f23Block)
      && /src\/lib\/modules\/crm/.test(f23Block),
    "กวาดนอกโมดูล + ยกเว้น 2 โฟลเดอร์ของตัวเอง + (?!index) + (?!ui) + รายงานไฟล์",
    f23Idx < 0 ? "no F2.3" : `crmPath=${/modules\\?\/crm\\?\//.test(f23Block)} notIndex=${/\(\?!index/.test(f23Block)} notUi=${/\(\?!ui/.test(f23Block)} exemptRoutes=${/app\/sys\/\[id\]\/crm|app\\?\/sys/.test(f23Block)} exemptModule=${/src\/lib\/modules\/crm/.test(f23Block)}`,
  );
  // pull the regex literal out of the F2.3 block and prove it on synthetic lines (we never write a file into src/)
  let reLit: string | null = null;
  for (const m of f23Block.matchAll(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g)) {
    if (m[0].includes("modules") && m[0].includes("crm")) { reLit = m[0]; break; }
  }
  let biteOk = false;
  let biteAct = "no regex literal mentioning modules/crm found next to the F2.3 check — cannot prove the rule bites";
  if (reLit) {
    try {
      const body = reLit.slice(1, reLit.lastIndexOf("/"));
      const flags = reLit.slice(reLit.lastIndexOf("/") + 1);
      const R = new RegExp(body, flags.replace("g", ""));
      // 🔴 ORACLE-EDIT: ด่าน F2.3 ต้องจับ service/rules/actions และ **ปล่อย** ui (ทางเข้าคอมโพเนนต์)
      const hitsDeep = R.test('import * as crmSvc from "@/lib/modules/crm/service";') && R.test('import { x } from "@/lib/modules/crm/actions";') && !R.test('import { CrmHub } from "@/lib/modules/crm/ui";');
      const spares = !R.test('import * as crmSvc from "@/lib/modules/crm";') && !R.test('import * as crmSvc from "@/lib/modules/crm/index";');
      biteOk = hitsDeep && spares;
      biteAct = `pattern=${cut(reLit, 90)} flagsDeep=${hitsDeep} sparesFacade=${spares}`;
    } catch (e) { biteAct = `bad regex: ${String((e as Error)?.message ?? e).slice(0, 80)}`; }
  }
  chk(
    "C0.2-S4.3",
    "[static] F2.3 ACTUALLY BITES: its own matcher, applied to synthetic import lines, flags `crm/service` and `crm/actions`, and spares `@/lib/modules/crm`, `crm/index` and `crm/ui` (the component entry point every module exposes) — a rule that matches nothing would be green forever",
    biteOk,
    "flags deep imports, spares the facade",
    biteAct,
  );
  const runFitness = (env: NodeJS.ProcessEnv, label: string) => {
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/fitness.mts"], { encoding: "utf8", env, timeout: 300_000 });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const m = /JSON_SUMMARY (\{.*\})/.exec(out);
    let sum: Any = null;
    try { sum = m ? JSON.parse(m[1]) : null; } catch { sum = null; }
    const failedIds: string[] = Array.isArray(sum?.findings) ? sum.findings.map((f: Any) => String(f.id)) : [];
    return { label, code: r.status ?? -1, saw: /\[F2\.3\]/.test(out), red: failedIds.includes("F2.3"), total: sum?.total ?? -1, passed: sum?.passed ?? -1, tail: cut(out.split("\n").filter(Boolean).slice(-4).join(" | "), 200) };
  };
  const envA = { ...process.env };
  const envB = { ...process.env };
  delete envB.DATABASE_URL;
  const fa = runFitness(envA, "with env");
  chk(
    "C0.2-S4.4",
    `pnpm fitness runs green WITH env and F2.3 is among the checks it actually executed (${fa.passed}/${fa.total})`,
    fa.code === 0 && fa.saw && !fa.red,
    "exit 0 + [F2.3] printed + not in findings",
    `exit=${fa.code} sawF2.3=${fa.saw} f23Red=${fa.red} · ${fa.tail}`,
  );
  const fb = runFitness(envB, "env -u DATABASE_URL");
  chk(
    "C0.2-S4.5",
    `pnpm fitness runs green with \`env -u DATABASE_URL\` too (MASTER-PLAN §3 D5 — this is the pre-commit mode, where a rule that reaches lib/env would explode) and F2.3 is executed there as well (${fb.passed}/${fb.total})`,
    fb.code === 0 && fb.saw && !fb.red,
    "exit 0 + [F2.3] printed + not in findings",
    `exit=${fb.code} sawF2.3=${fb.saw} f23Red=${fb.red} · ${fb.tail}`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // S3 — ZERO BEHAVIOUR CHANGE (facade call ≡ direct call, same run, same rows)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── S3: zero behaviour change — facade call ≡ crm/service call ──");
  const svc = internals.service;
  if (!facade || !svc) throw new Error(`cannot compare: facade=${!!facade} service=${!!svc} ${cut(JSON.stringify(loadErr))}`);

  // scope: the QC CRM shop if it is seeded, else any CRM system, else one created (and deleted) by this file
  const scope = cq ? await cq.resolveCrmScope(prisma).catch(() => null) : null;
  if (scope) { tid = scope.tenantId; SYS = scope.systemId; }
  else {
    const anySys = await P.appSystem.findFirst({ where: { type: "CRM" }, orderBy: { createdAt: "asc" } });
    if (anySys) { tid = anySys.tenantId; SYS = anySys.id; }
    else {
      const t = await P.tenant.findFirst({ orderBy: { createdAt: "asc" } });
      if (!t) throw new Error("QC database has no tenant at all — cannot run S3");
      tid = t.id;
      const s = await P.appSystem.create({ data: { tenantId: tid, type: "CRM", name: MARK } });
      SYS = s.id; made.systems.push(s.id);
    }
  }
  const ctx = { tenantId: tid, systemId: SYS };

  // fixture — a guaranteed non-empty answer for every read path (a negative result needs a positive control:
  // "facade returned nothing and so did direct" proves nothing at all)
  const pipe = await P.crmPipeline.create({ data: { tenantId: tid, systemId: SYS, name: `${MARK}-pipeline`, isDefault: false, sortOrder: 9999 } });
  made.pipelines.push(pipe.id);
  const stage = await P.crmStage.create({ data: { tenantId: tid, systemId: SYS, pipelineId: pipe.id, name: `${MARK}-stage`, kind: "OPEN", probability: 50, sortOrder: 0 } });
  made.stages.push(stage.id);
  const pty = await P.party.create({ data: { tenantId: tid, kind: "PERSON", name: `${MARK}-party`, phone: PHONE, phoneNorm: PHONE, email: EMAIL } });
  made.parties.push(pty.id);
  const fx = await P.crmContact.create({ data: { tenantId: tid, systemId: SYS, name: `${MARK}-contact`, phone: PHONE, email: EMAIL, company: `${MARK}-co`, partyId: pty.id } });
  made.contacts.push(fx.id);
  const fxDeal = await P.crmDeal.create({ data: { tenantId: tid, systemId: SYS, contactId: fx.id, pipelineId: pipe.id, stageId: stage.id, title: `${MARK}-deal`, valueSatang: 123456 } });
  made.deals.push(fxDeal.id);

  // ── the four re-exported READ functions, through the facade vs straight from crm/service ──
  const keys = { phoneVariants: [PHONE], email: EMAIL, partyId: pty.id };
  const pairs: { id: string; fn: string; name: string; viaFacade: Any; viaDirect: Any; sorted?: boolean }[] = [
    { id: "C0.2-S3.1", fn: "findContactByPartyId", name: "findContactByPartyId(ctx, partyId) — account contact-profile.ts:598 (the \"CRM\" card)", viaFacade: await facade.findContactByPartyId(ctx, pty.id), viaDirect: await svc.findContactByPartyId(ctx, pty.id) },
    { id: "C0.2-S3.2", fn: "findContactsForLink", name: "findContactsForLink(ctx, {phoneVariants,email,partyId}) — account contact-links.ts:77 (the \"same person?\" block)", viaFacade: await facade.findContactsForLink(ctx, keys), viaDirect: await svc.findContactsForLink(ctx, keys), sorted: true },
    { id: "C0.2-S3.3", fn: "listPartyIdsWithContact", name: "listPartyIdsWithContact(ctx, partyIds) — account contacts-list.ts:210 (the \"CRM\" badge; returns a Set)", viaFacade: await facade.listPartyIdsWithContact(ctx, [pty.id]), viaDirect: await svc.listPartyIdsWithContact(ctx, [pty.id]) },
    { id: "C0.2-S3.4", fn: "findLatestDealForContact", name: "findLatestDealForContact(ctx, contactId) — account contact-profile.ts:604 (the latest deal line)", viaFacade: await facade.findLatestDealForContact(ctx, fx.id), viaDirect: await svc.findLatestDealForContact(ctx, fx.id) },
  ];
  for (const p of pairs) {
    const a = p.sorted ? byId(p.viaFacade) : p.viaFacade;
    const b = p.sorted ? byId(p.viaDirect) : p.viaDirect;
    chk(
      p.id,
      `${p.name} — facade answer === crm/service answer (deep-equal on a stable projection) AND the answer is non-empty on the fixture row (positive control; equality is facade-vs-direct in ONE run, so no id/count from the seed is baked in)`,
      eq(a, b) && nonEmpty(p.viaFacade),
      "identical + non-empty",
      `facade=${cut(j(a), 140)} direct=${cut(j(b), 140)}`,
    );
  }
  chk(
    "C0.2-S3.5",
    "findContactsForLink returns the rows in the SAME ORDER through both paths (createdAt asc, take 5) — ordering is part of the behaviour the UI shows",
    eq(pairs[1].viaFacade, pairs[1].viaDirect),
    "same order",
    `facade=${cut(j(pairs[1].viaFacade), 120)} direct=${cut(j(pairs[1].viaDirect), 120)}`,
    "MINOR",
  );

  // ── the same read paths over REAL seed rows (not the fixture) ──
  const seedRows = await P.crmContact.findMany({ where: { tenantId: tid, systemId: SYS, partyId: { not: null }, NOT: { name: { contains: MARK } } }, select: { id: true, partyId: true }, take: 25, orderBy: { createdAt: "asc" } });
  const seedPartyIds = seedRows.map((r: Any) => r.partyId as string);
  let seedSame = true;
  if (seedPartyIds.length > 0) {
    seedSame =
      eq(await facade.listPartyIdsWithContact(ctx, seedPartyIds), await svc.listPartyIdsWithContact(ctx, seedPartyIds)) &&
      eq(await facade.findContactByPartyId(ctx, seedPartyIds[0]), await svc.findContactByPartyId(ctx, seedPartyIds[0])) &&
      eq(byId(await facade.findContactsForLink(ctx, { partyId: seedPartyIds[0] })), byId(await svc.findContactsForLink(ctx, { partyId: seedPartyIds[0] }))) &&
      eq(await facade.findLatestDealForContact(ctx, seedRows[0].id), await svc.findLatestDealForContact(ctx, seedRows[0].id));
  }
  chk(
    "C0.2-S3.6",
    `the same four reads over REAL QC seed rows (${seedPartyIds.length} party ids of the CRM shop, read-only) give identical answers through both paths — MINOR because the CRM data set is only seeded by C1.1; 0 rows means "not proven here", not "broken"`,
    seedPartyIds.length > 0 && seedSame,
    "identical over ≥1 seed row",
    seedPartyIds.length === 0 ? "0 seed CRM contacts with a partyId — proven on the fixture rows only (C0.2 runs before C1.1 seeds the CRM data set)" : `n=${seedPartyIds.length} identical=${seedSame}`,
    "MINOR",
  );

  // ── the two re-exported WRITE functions ──
  const input = { name: `${MARK}-created`, phone: PHONE, email: EMAIL, company: `${MARK}-co`, source: "AI" };
  const viaF = await facade.createContact(ctx, input);
  made.contacts.push(viaF.id);
  const viaD = await svc.createContact(ctx, input);
  made.contacts.push(viaD.id);
  const pick = (r: Any) => (r ? { tenantId: r.tenantId, systemId: r.systemId, name: r.name, phone: r.phone, email: r.email, company: r.company, source: r.source, ownerUserId: r.ownerUserId, lifecycleStage: r.lifecycleStage, memberCustomerId: r.memberCustomerId, note: r.note, archivedAt: r.archivedAt, partyLinked: r.partyId !== null } : null);
  const rowF = await P.crmContact.findUnique({ where: { id: viaF.id } });
  const rowD = await P.crmContact.findUnique({ where: { id: viaD.id } });
  if (rowF?.partyId) made.parties.push(rowF.partyId);
  if (rowD?.partyId && rowD.partyId !== rowF?.partyId) made.parties.push(rowD.partyId);
  chk(
    "C0.2-S3.7",
    "MUTATION createContact(ctx, input) — forms/service.ts:4 and ai/proposals.ts:940: the row written through the facade is field-for-field the same as the row written straight from crm/service (id/createdAt/updatedAt excluded), both get a Party linked, and both land in the caller's ctx scope. Temp rows are tagged qc-c02-<tag> and deleted in finally",
    !!rowF && !!rowD && eq(pick(rowF), pick(rowD)) && rowF.partyId !== null && rowD.partyId !== null && rowF.systemId === SYS && rowD.systemId === SYS,
    "identical projection + party linked",
    `facade=${cut(j(pick(rowF)), 150)} direct=${cut(j(pick(rowD)), 150)}`,
  );
  const setF = await facade.setContactPartyId(ctx, viaF.id, pty.id);
  const setD = await svc.setContactPartyId(ctx, viaD.id, pty.id);
  const afterF = await P.crmContact.findUnique({ where: { id: viaF.id }, select: { partyId: true } });
  const afterD = await P.crmContact.findUnique({ where: { id: viaD.id }, select: { partyId: true } });
  chk(
    "C0.2-S3.8",
    "MUTATION setContactPartyId(ctx, contactId, partyId) — account contact-links.ts:173: same boolean, same stored partyId through both paths",
    setF === true && setD === true && afterF?.partyId === pty.id && afterD?.partyId === pty.id,
    "true/true + both repointed",
    `facade=${setF}/${afterF?.partyId === pty.id} direct=${setD}/${afterD?.partyId === pty.id}`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // X1 — scope: the facade must not widen anybody's data access
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── X1: the facade widens nobody's scope ──");
  const otherTenant = await P.tenant.findFirst({ where: { id: { not: tid } }, select: { id: true } });
  const foreignTid = otherTenant?.id ?? `${MARK}-no-such-tenant`;
  const otherSystem = await P.appSystem.findFirst({ where: { tenantId: tid, id: { not: SYS } }, select: { id: true, type: true } });
  const foreignSys = otherSystem?.id ?? `${MARK}-no-such-system`;

  const probe = async (mod: Record<string, Any>, c: { tenantId: string; systemId: string }) => ({
    byParty: await mod.findContactByPartyId(c, pty.id),
    forLink: byId(await mod.findContactsForLink(c, keys)),
    partyIds: await mod.listPartyIdsWithContact(c, [pty.id]),
    latestDeal: await mod.findLatestDealForContact(c, fx.id),
  });
  const emptyish = (r: Any) => r.byParty === null && Array.isArray(r.forLink) && r.forLink.length === 0 && r.partyIds instanceof Set && r.partyIds.size === 0 && r.latestDeal === null;

  const xTenF = await probe(facade, { tenantId: foreignTid, systemId: SYS });
  const xTenD = await probe(svc, { tenantId: foreignTid, systemId: SYS });
  chk(
    "C0.2-X1.1",
    `cross-shop: the four reads called with a FOREIGN tenantId (${otherTenant ? "a real other shop of the QC database" : "a tenant id that does not exist"}) but this shop's CRM systemId come back empty through the facade AND straight from crm/service, and the two are identical — positive control: S3.1–S3.4 proved the same calls DO return the fixture row with the right ctx`,
    emptyish(xTenF) && eq(xTenF, xTenD),
    "empty through both paths",
    `facade=${cut(j(xTenF), 140)} direct=${cut(j(xTenD), 140)}`,
  );
  const xSysF = await probe(facade, { tenantId: tid, systemId: foreignSys });
  const xSysD = await probe(svc, { tenantId: tid, systemId: foreignSys });
  chk(
    "C0.2-X1.2",
    `cross-SYSTEM inside the same shop (MASTER-PLAN §4 X1 explicitly asks for this): same tenant, a different AppSystem${otherSystem ? ` (type ${otherSystem.type})` : " (synthetic id — the QC shop has only one system)"} ⇒ the four reads come back empty through the facade AND direct, identically`,
    emptyish(xSysF) && eq(xSysF, xSysD),
    "empty through both paths",
    `facade=${cut(j(xSysF), 140)} direct=${cut(j(xSysD), 140)}`,
  );
  const wF = await facade.setContactPartyId({ tenantId: foreignTid, systemId: SYS }, fx.id, pty.id);
  const wD = await svc.setContactPartyId({ tenantId: tid, systemId: foreignSys }, fx.id, pty.id);
  const fxAfter = await P.crmContact.findUnique({ where: { id: fx.id }, select: { partyId: true, tenantId: true, systemId: true } });
  chk(
    "C0.2-X1.3",
    "cross-scope WRITE: setContactPartyId with a foreign tenantId (through the facade) and with a foreign systemId (direct) both return false and change no row — the facade must not become an IDOR hole for account/forms/ai",
    wF === false && wD === false && fxAfter?.partyId === pty.id && fxAfter?.tenantId === tid && fxAfter?.systemId === SYS,
    "false/false + row untouched",
    `facade=${wF} direct=${wD} row=${cut(j(fxAfter), 120)}`,
  );
  const leaky = [xTenF, xSysF].flatMap((r) => [j(r)]).filter((s) => s.includes(PHONE) || s.includes(EMAIL) || s.includes(fx.id) || s.includes(pty.id));
  chk(
    "C0.2-X1.4",
    "no data leaks out of the denied calls: nothing in the foreign-scope answers contains the fixture's phone, e-mail, contact id or party id",
    leaky.length === 0,
    "no fixture data in denied answers",
    leaky.length ? cut(leaky.join(" | "), 160) : "clean",
  );

  // X2–X10: N-A for this work order (one line each — MASTER-PLAN §3 D3). C0.2 adds no op, no route, no event,
  // no cron job, no input surface, no file and no notification; it only re-points import specifiers.
  //   X2  keys/AI     N-A — no new REST op and no new AI tool; crm_create_lead keeps its old permission path
  //                         (ai/proposals.ts only changes which specifier it imports createContact from).
  //   X3  concurrency N-A — no counter, cursor, accumulator or status flag is added or moved.
  //   X4  redelivery  N-A — no outbox event and no consumer is added or changed by C0.2.
  //   X5  cron lease  N-A — no job picks rows up; C0.2 adds no scheduled work.
  //   X6  hostile in  N-A — no new input, import, CSV, URL field, HTML sink or file upload.
  //   X7  public edge N-A — no public endpoint, token or rate limit is touched.
  //   X8  PDPA        N-A — no payload, log or OpsEvent row changes; a re-export carries no data.
  //                         (Known, NOT closed by C0.2: src/lib/member-bridges.ts reaches CRM tables through
  //                          raw prisma inside onCrmDealWon — F2.3 cannot see that; C1.8 owns it.)
  //   X9  danger ops  N-A — no mutation is added; the two re-exported writers keep their own audit/permission path.
  //   X10 secrets     N-A — no file, token, cookie or secret is involved.
} catch (e) {
  console.error("💥", e);
  chk("C0.2-ERR", "the oracle ran to completion", false, "completed", String((e as Error)?.message ?? e).slice(0, 220));
} finally {
  await cleanup();
  await prisma.$disconnect();
}

async function cleanup() {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* the row may already be gone */ } };
  if (!tid) return;
  await d(() => P.crmDeal.deleteMany({ where: { tenantId: tid, OR: [{ id: { in: made.deals } }, { title: { contains: MARK } }] } }));
  await d(() => P.crmActivity.deleteMany({ where: { tenantId: tid, contactId: { in: made.contacts } } }));
  await d(() => P.crmContact.deleteMany({ where: { tenantId: tid, OR: [{ id: { in: made.contacts } }, { name: { contains: MARK } }] } }));
  await d(() => P.crmStage.deleteMany({ where: { tenantId: tid, OR: [{ id: { in: made.stages } }, { name: { contains: MARK } }] } }));
  await d(() => P.crmPipeline.deleteMany({ where: { tenantId: tid, OR: [{ id: { in: made.pipelines } }, { name: { contains: MARK } }] } }));
  await d(() => P.party.deleteMany({ where: { tenantId: tid, OR: [{ id: { in: made.parties } }, { name: { contains: MARK } }] } }));
  for (const id of made.systems) await d(() => P.appSystem.delete({ where: { id } }));
  // prove the QC data set is exactly as it was found
  try {
    const left = {
      deals: await P.crmDeal.count({ where: { tenantId: tid, title: { contains: MARK } } }),
      contacts: await P.crmContact.count({ where: { tenantId: tid, name: { contains: MARK } } }),
      stages: await P.crmStage.count({ where: { tenantId: tid, name: { contains: MARK } } }),
      pipelines: await P.crmPipeline.count({ where: { tenantId: tid, name: { contains: MARK } } }),
      parties: await P.party.count({ where: { tenantId: tid, name: { contains: MARK } } }),
      systems: await P.appSystem.count({ where: { tenantId: tid, name: { contains: MARK } } }),
    };
    const dirty = Object.values(left).reduce((n: number, v) => n + (v as number), 0);
    chk("C0.2-CLEAN", "the oracle left the QC data set exactly as it found it (no deal/contact/stage/pipeline/party/system tagged qc-c02-* survives)", dirty === 0, "nothing left", JSON.stringify(left), "MAJOR");
  } catch (e) {
    chk("C0.2-CLEAN", "the oracle left the QC data set exactly as it found it", false, "nothing left", String((e as Error)?.message ?? e).slice(0, 120), "MAJOR");
  }
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C0.2: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);

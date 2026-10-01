// @ts-nocheck
// pgtest.mts — run the builder's finder (hotfix note) and finder.sql VERBATIM in an in-memory Postgres (PGlite, transitive dep of
// prisma — no server, no project DB) to prove: (1) both parse/compile on real Postgres ARE, (2) READ ONLY really rejects writes,
// (3) PG regex semantics = the JS approximation used in sqlcheck.mts (same hit set on the same rows).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { vectorsAndFuzz } from "./corpus.mts";
const require = createRequire(import.meta.url);
const pgDir = require.resolve("prisma/package.json").replace(/node_modules\/prisma\/package\.json$/, "node_modules/");
const { PGlite } = await import(require.resolve("@electric-sql/pglite", { paths: [pgDir, require.resolve("prisma/package.json")] }).replace(/\.cjs$/, ".js"));
const legacyKb = (await import("./legacy/kanban-sanitize.legacy.ts" as string)) as any;
const db = new PGlite();
await db.exec(`CREATE TABLE "MemberPrivacyPolicy"(id text, "tenantId" text, "createdAt" timestamptz default now(), "bodyHtml" text);
CREATE TABLE "KanbanCard"(id text, "tenantId" text, "createdAt" timestamptz default now(), description text);
CREATE TABLE "KanbanCardTemplate"(id text, "tenantId" text, "createdAt" timestamptz default now(), description text);
CREATE TABLE "CrmEmailMessage"(id text, "tenantId" text, "createdAt" timestamptz default now(), "bodyHtml" text);`);
const rows = vectorsAndFuzz(3000).flatMap((x) => [x, legacyKb.sanitizeDescription(x)]).filter((x) => x && !x.includes("\u0000"));
for (let i = 0; i < rows.length; i++) await db.query(`INSERT INTO "KanbanCard"(id,"tenantId",description) VALUES ($1,'t',$2)`, [String(i), rows[i]]);
await db.query(`INSERT INTO "MemberPrivacyPolicy"(id,"tenantId","bodyHtml") VALUES ('p1','t','<details/open/ontoggle=alert(1)>x')`);
await db.query(`INSERT INTO "CrmEmailMessage"(id,"tenantId","bodyHtml") VALUES ('m1','t','<a/href=javascript:alert(1)>x')`);
// builder query, verbatim from the note
const note = readFileSync(new URL("../../../ledger/wo-notes/hotfix-sanitize-2026-10-01.md", import.meta.url), "utf8");
const builderSql = note.slice(note.indexOf("```sql") + 6, note.indexOf("```", note.indexOf("```sql") + 6));
const res1 = await db.exec(builderSql);
const b1 = res1.find((r) => r.fields?.some((f) => f.name === "tbl") && r.rows.some((x) => x.tbl === "KanbanCard"));
const reviewerSql = readFileSync(new URL("./finder.sql", import.meta.url), "utf8");
const res2 = await db.exec(reviewerSql);
const r2 = res2.find((r) => r.fields?.some((f) => f.name === "hit") && r.rows.some((x) => x.tbl === "KanbanCard"));
// JS cross-check
const BRE = /<[a-z][^\s>\/]*\/|<[a-z][a-z0-9]*[-:]|<(svg|math|details|video|audio|body|iframe|object|embed|form|input|select|textarea|marquee|meta|base|link|style|script|img)[\s\/>]|\son[a-z]+\s*=|javascript:|vbscript:|data:text/i;
const { RE } = await import("./mkfinder.mts");
const RRE = new RegExp(RE, "i");
const jsB = new Set(rows.map((x, i) => (BRE.test(x) ? String(i) : null)).filter(Boolean));
const jsR = new Set(rows.map((x, i) => (RRE.test(x) ? String(i) : null)).filter(Boolean));
const pgB = new Set(b1.rows.filter((x) => x.tbl === "KanbanCard").map((x) => x.id));
const pgR = new Set(r2.rows.filter((x) => x.tbl === "KanbanCard").map((x) => x.id));
const diff = (a, b) => [...a].filter((x) => !b.has(x)).length + [...b].filter((x) => !a.has(x)).length;
console.log(`rows ${rows.length} · builder SQL: PG hits ${pgB.size} vs JS ${jsB.size} (sym.diff ${diff(pgB, jsB)}) · reviewer SQL: PG hits ${pgR.size} (capped LIMIT 2000) vs JS ${jsR.size} (sym.diff ${pgR.size < 2000 ? diff(pgR, jsR) : "n/a (LIMIT)"})`);
const sampleHit = r2.rows.find((x) => x.tbl === "MemberPrivacyPolicy");
console.log(`policy row hit column: ${JSON.stringify(sampleHit?.hit)} · CrmEmailMessage reviewer hits ${res2.at(-2)?.rows?.length ?? "?"}`);
// READ ONLY really rejects writes
try { await db.exec(`BEGIN READ ONLY; UPDATE "KanbanCard" SET description = 'x'; ROLLBACK;`); console.log("❌ READ ONLY did not reject a write"); }
catch (e) { console.log(`READ ONLY write rejected: ${String(e.message).slice(0, 80)}`); await db.exec("ROLLBACK"); }
// direct pattern comparison without LIMIT, with examples of PG/JS disagreement
for (const [name, re, js] of [["builder", BRE.source.replace(/\\\//g, "/"), jsB], ["reviewer", RE, jsR]] as const) {
  const q = await db.query(`SELECT id FROM "KanbanCard" WHERE description ~* $1`, [re]);
  if (name === "builder") console.log(`   (pattern sent to PG: ${re.slice(0, 40)}…)`);
  const pg = new Set(q.rows.map((x) => x.id));
  const onlyJs = [...js].filter((x) => !pg.has(x));
  const onlyPg = [...pg].filter((x) => !js.has(x));
  console.log(`${name}: PG ${pg.size} · JS ${js.size} · only-JS ${onlyJs.length} · only-PG ${onlyPg.length}`);
  for (const id of onlyJs.slice(0, 4)) console.log(`   only-JS ${JSON.stringify(rows[Number(id)].slice(0, 120))}`);
  for (const id of onlyPg.slice(0, 2)) console.log(`   only-PG ${JSON.stringify(rows[Number(id)].slice(0, 120))}`);
}
// recall of both patterns in REAL Postgres on the rows that are exploitable under innerHTML
{
  const { exploitable } = await import("./exploitable.mts");
  const bad = new Set(rows.map((x, i) => (exploitable(x) ? String(i) : null)).filter((x) => x !== null));
  for (const [name, re] of [["builder", BRE.source.replace(/\\\//g, "/")], ["reviewer", RE]] as const) {
    const q = await db.query(`SELECT id FROM "KanbanCard" WHERE description ~* $1`, [re]);
    const hit = new Set(q.rows.map((x) => x.id));
    const miss = [...bad].filter((x) => !hit.has(x));
    console.log(`PG recall ${name}: exploitable rows ${bad.size} · missed ${miss.length}` + miss.slice(0, 3).map((m) => `\n     ${JSON.stringify(rows[Number(m)].slice(0, 110))}`).join(""));
  }
}

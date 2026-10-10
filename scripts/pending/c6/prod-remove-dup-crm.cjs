// C6.3: take the duplicate, empty, v1 CRM system of the pilot tenant out of the menu — same writes as removeSystemAction (src/lib/actions/systems.ts:110):
//   unlink AppSystemUnit rows of that system + AppSystem.active=false. Nothing is deleted from CRM tables. Owner order 8 Oct 2026 ("ลบตัวบน"). Dry-run by default; --apply writes.
// them; every query runs inside `BEGIN READ ONLY` (pooler-safe: no SET, the transaction ends with ROLLBACK). Owner authorised the
// read-only prod probe on 7 Oct 2026 (chat). Usage: node scripts/pending/c6/prod-probe-c61.cjs [--direct]   (default = DATABASE_URL)
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "../../../.env"), "utf8").split("\n")) {
  const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}
const useDirect = process.argv.includes("--direct");
// --url-from-env: take the URL from the process env instead of .env (used by neon-rehearse-migrations.cjs against a throw-away branch)
const url = process.argv.includes("--url-from-env") ? (useDirect ? process.env.DIRECT_URL : process.env.DATABASE_URL) : useDirect ? env.DIRECT_URL : env.DATABASE_URL;
if (!url) { console.error("no url in .env for", useDirect ? "DIRECT_URL" : "DATABASE_URL"); process.exit(1); }
let host = "?"; try { host = new URL(url).host.replace(/^[^.]*/, (h) => h.slice(0, 12) + "…"); } catch {}
const T = "cmtazbpjh000004lcjikxju2i", SYS = "cmtdvo8h1000004l1d5tl5ej5", KEEP = "cmtdvoopr000004jpf1vaply9";
const apply = process.argv.includes("--apply");
(async () => {
  const c = new Client({ connectionString: url, statement_timeout: 20000 });
  await c.connect();
  console.log(`remove duplicate CRM system · host ${host} · ${apply ? "APPLY" : "dry-run"} · ${new Date().toISOString()}`);
  await c.query(apply ? "BEGIN READ WRITE" : "BEGIN READ ONLY");
  try {
    const s = (await c.query(`SELECT id, "tenantId", type::text AS type, active, settings::text AS settings FROM "AppSystem" WHERE id IN ($1,$2) ORDER BY "createdAt"`, [SYS, KEEP])).rows;
    console.log("systems", JSON.stringify(s));
    const t = s.find((r) => r.id === SYS), k = s.find((r) => r.id === KEEP);
    if (!t || t.tenantId !== T || t.type !== "CRM" || t.settings !== "{}") throw new Error("target is not the empty v1 CRM system of the pilot tenant — stop");
    if (!k || k.tenantId !== T || !k.active || !/"uiVersion":\s*2/.test(k.settings)) throw new Error("kept system is not the active v2 one — stop");
    const cols = (await c.query(`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='systemId' AND table_name LIKE 'Crm%' ORDER BY 1`)).rows.map((r) => r.table_name);
    let used = 0;
    for (const tb of cols) { const n = (await c.query(`SELECT count(*)::int AS n FROM "${tb}" WHERE "systemId"=$1`, [SYS])).rows[0].n; if (n) { console.log("  has rows:", tb, n); if (!["CrmPipeline", "CrmStage"].includes(tb)) used += n; } }
    console.log(`Crm* tables with systemId checked: ${cols.length} · business rows on target (excl. default pipeline/stages): ${used}`);
    if (used) throw new Error("target system has CRM rows — stop");
    const links = (await c.query(`SELECT id, "unitId" FROM "AppSystemUnit" WHERE "tenantId"=$1 AND "systemId"=$2`, [T, SYS])).rows;
    console.log("unit links of target", JSON.stringify(links));
    if (apply) {
      const d = await c.query(`DELETE FROM "AppSystemUnit" WHERE "tenantId"=$1 AND "systemId"=$2`, [T, SYS]);
      const u = await c.query(`UPDATE "AppSystem" SET active=false, "updatedAt"=now() WHERE id=$1 AND "tenantId"=$2 AND active`, [SYS, T]);
      console.log(`unlinked ${d.rowCount} · deactivated ${u.rowCount}`);
      if (u.rowCount > 1) throw new Error("more than one row — rollback");
      await c.query("COMMIT");
    } else { await c.query("ROLLBACK"); console.log("dry-run only"); }
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); console.error("STOP:", e.message); process.exitCode = 1; }
  await c.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });

// hunt-ops — read-only: agency.* OpsEvent rows of the last N minutes (what did the "BUSY/UNEXPECTED" results log?)
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
loadTripsQcEnv("probe-a1.2-hunt-ops");
const mins = Number(process.argv[2] ?? 30);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const rows = (await pool.query(`SELECT level::text AS level, source, message, detail, "createdAt" FROM "OpsEvent" WHERE "createdAt" >= now() - ($1 || ' minutes')::interval AND (source LIKE 'agency.%' OR source = 'rate-limit-db') ORDER BY "createdAt"`, [String(mins)])).rows;
const tally = new Map<string, number>();
for (const r of rows) {
  let d: Record<string, unknown> = {};
  try { d = JSON.parse(r.detail ?? "{}"); } catch { d = { raw: String(r.detail).slice(0, 200) }; }
  const k = `${r.level} ${r.source} where=${d.where ?? "-"} name=${d.name ?? "-"} code=${d.code ?? "-"} ${d.raw ?? ""} frame0=${Array.isArray(d.frames) ? String(d.frames[0]).slice(0, 110) : "-"}`;
  tally.set(k, (tally.get(k) ?? 0) + 1);
}
for (const [k, n] of tally) console.log(`${n}× ${k}`);
console.log(`total ${rows.length} rows in last ${mins} min`);
await pool.end();

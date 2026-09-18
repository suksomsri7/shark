// read-only · QC only (host gate) — table sizes for the crm_v2_a lock-window estimate
const fs = require("fs");
const line = fs.readFileSync(".env.qc", "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
let url = line.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
if (url.includes("ep-royal-night") || !url.includes("ep-plain-art")) { console.error("host gate: not QC — abort"); process.exit(4); }
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("BEGIN READ ONLY");
  const r = await c.query(`select relname, n_live_tup::bigint n, pg_size_pretty(pg_total_relation_size(relid)) sz from pg_stat_user_tables
    where relname in ('Appointment','ShopOrder','RentalBooking','QueueTicket','ClinicVisit','MemberActivity','MemberField','MemberSection',
    'MemberAddress','MemberSavedView','AutomationRule','CrmContact','CrmDeal','CrmActivity','CrmStage','CrmPipeline') order by n_live_tup desc`);
  for (const x of r.rows) console.log(x.relname.padEnd(16), String(x.n).padStart(8), x.sz);
  const t = await c.query(`select count(*)::int n from "Tenant"`); console.log("tenants:", t.rows[0].n);
  await c.query("ROLLBACK"); await c.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });

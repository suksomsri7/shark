const { Client } = require("pg");
const c = new Client({ connectionString: process.argv[2] });
c.connect().then(async () => {
  const r = await c.query(`select migration_name, finished_at, rolled_back_at from "_prisma_migrations" where migration_name like '%member_v2%' or migration_name like '%kanban_v2_u%' order by finished_at`);
  console.log(r.rows);
  const t = await c.query(`select count(*)::int as n from information_schema.tables where table_name in ('MemberTierDef','MemberChannelIdentity','MemberField')`);
  console.log("tables", t.rows[0]);
  await c.end();
}).catch((e) => { console.error("ERR", e.message); process.exit(1); });

// C6.2 read-only: tenant slugs/status + CRM systems on prod (for --tenant <slug> dry-runs)
const fs=require("node:fs"),path=require("node:path"),{Client}=require("pg");const env={};for(const l of fs.readFileSync(path.join(__dirname,"../../../.env"),"utf8").split("\n")){const m=/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l);if(m)env[m[1]]=m[2].replace(/^"(.*)"$/,"$1");}
(async()=>{const c=new Client({connectionString:env.DATABASE_URL,statement_timeout:20000});await c.connect();await c.query("BEGIN READ ONLY");
const t=await c.query(`SELECT t.slug, t.status::text, t.name, (SELECT count(*)::int FROM "AppSystem" s WHERE s."tenantId"=t.id AND s.type::text='CRM') AS crm_systems, (SELECT count(*)::int FROM "AppSystem" s WHERE s."tenantId"=t.id) AS systems FROM "Tenant" t ORDER BY t."createdAt"`);
for(const r of t.rows)console.log(JSON.stringify(r));
const s=await c.query(`SELECT s.id, s.name, t.slug, s.settings->'crm' AS crm_settings FROM "AppSystem" s JOIN "Tenant" t ON t.id=s."tenantId" WHERE s.type::text='CRM'`);console.log("CRM systems:");for(const r of s.rows)console.log(JSON.stringify(r));
await c.query("ROLLBACK");await c.end();})().catch(e=>{console.error("ERR",e.message);process.exit(1)});

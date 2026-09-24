// probe (controller) — สภาพ QC1 ตอนนี้สำหรับ scope ของ CRM QC
type Any = any;
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { Client } = (await import("pg" as string)) as { Client: new (o: Any) => Any };
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 20_000 });
await db.connect();
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
console.log("HOST", host);
console.log("tenants slug like member-qc:", JSON.stringify(await q(`select id, slug from "Tenant" where slug like '%member-qc%' order by "createdAt"`)));
const t = (await q(`select id from "Tenant" where slug=$1`, ["siam-dive-member-qc"]))[0] as Any;
if (t) {
  console.log("systems:", (await q(`select type::text as type from "AppSystem" where "tenantId"=$1 order by "createdAt"`, [t.id])).map((r: Any) => r.type).join(","));
  console.log("memberships:", JSON.stringify((await q(`select count(*)::int c from "Membership" where "tenantId"=$1`, [t.id]))[0]));
  console.log("users of tenant:", JSON.stringify((await q(`select count(distinct "userId")::int c from "Membership" where "tenantId"=$1`, [t.id]))[0]));
  console.log("crmContacts:", JSON.stringify((await q(`select count(*)::int c from "CrmContact" where "tenantId"=$1`, [t.id]))[0]));
  console.log("crmContacts with partyId:", JSON.stringify((await q(`select count(*)::int c from "CrmContact" where "tenantId"=$1 and "partyId" is not null`, [t.id]))[0]));
}
await db.end();

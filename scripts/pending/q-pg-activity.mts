// read-only: live sessions / locks on the QC DB (controller probe)
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const a = await P.$queryRawUnsafe(`select pid, state, wait_event_type, wait_event, extract(epoch from now()-xact_start)::int as xact_s, extract(epoch from now()-query_start)::int as q_s, left(query,160) q from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle' order by xact_start nulls last limit 15`);
const b = await P.$queryRawUnsafe(`select count(*)::int n from pg_stat_activity where datname=current_database() and state='idle in transaction'`);
const o = await P.$queryRawUnsafe(`select id, "availableAt", attempts, status from "OutboxEvent" where id='cmujwfa0b00c362kzq0eknuaf'`);
console.log(JSON.stringify({ a, b, o }, (k, v) => typeof v === "bigint" ? String(v) : v, 0));
process.exit(0);

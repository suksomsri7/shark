import { boot, pool, q } from "./probe-trips-w1.1-hunt-lib.mjs";
boot("hunt-ops");
console.log(JSON.stringify(await q(`SELECT to_char(date_trunc('minute', "createdAt"), 'HH24:MI') AS utc_min, level::text, detail, count(*)::int AS n FROM "OpsEvent" WHERE source LIKE 'trips.public%' AND "createdAt" > NOW() - interval '3 hours' GROUP BY 1,2,3 ORDER BY 1`)));
console.log("now", new Date().toISOString());
await pool().end();

// probe-trips-w1.1-hunt-7.mts — W1.1a hunter: final residue check + removal of the hunter's own rate buckets from manual curl recon (IPs 100.99.1.1 / 100.99.1.2)
import { boot, clientKeyOf, pool, q, SLUG } from "./probe-trips-w1.1-hunt-lib.mjs";
boot("probe-w1.1-hunt-7");
try {
  const keys = ["100.99.1.1", "100.99.1.2"].map(clientKeyOf).filter((k): k is string => !!k);
  for (const k of keys) { const r = await pool().query(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'trips:%' AND key LIKE $1`, [`%:${k}`]); console.log(`removed ${r.rowCount} bucket rows of recon client ${k.slice(0, 9)}…`); }
  const lo = clientKeyOf("127.0.0.1");
  console.log("left: buckets of 127.0.0.1 (requests without IP header; may also be the controller's):", JSON.stringify((await q(`SELECT regexp_replace(key, 'pc_.*', 'pc_…') AS key, count FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:%:${lo}`]))));
  console.log("hunt tenants left:", (await q(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0]);
  console.log("rows left under hunt ids (TripLinkStat/TripProduct/BusinessUnit with w11h_ ids):", JSON.stringify((await q(`SELECT (SELECT count(*)::int FROM "TripLinkStat" WHERE "unitId" LIKE 'w11h\\_%') AS stat, (SELECT count(*)::int FROM "TripProduct" WHERE id LIKE 'w11h\\_%') AS prod, (SELECT count(*)::int FROM "BusinessUnit" WHERE id LIKE 'w11h\\_%') AS unit, (SELECT count(*)::int FROM "ChatRateBucket" WHERE key LIKE 'trips:%w11h\\_%') AS buckets`))[0]));
  console.log("trips:* buckets total now:", JSON.stringify((await q(`SELECT split_part(key, ':', 2) AS kind, count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE 'trips:%' GROUP BY 1`))));
  console.log("OpsEvent trips.public last 2h:", (await q(`SELECT count(*)::int AS n FROM "OpsEvent" WHERE source LIKE 'trips.public%' AND "createdAt" > NOW() - interval '2 hours'`))[0]);
  console.log("seed shop andaman-dive TripLinkStat (not modified by cleanup; recon added 1 view on the latest day):", JSON.stringify(await q(`SELECT s."day"::text AS day, s.channel, s.views FROM "TripLinkStat" s JOIN "Tenant" t ON t.id = s."tenantId" WHERE t.slug = 'andaman-dive' ORDER BY s."day" DESC LIMIT 3`)));
} finally { await pool().end(); }

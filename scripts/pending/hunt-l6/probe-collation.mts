// probe-collation.mts — HUNTER L6 · read-only: how does the QC DB sort/search Thai names (no writes)
// Run: bash scripts/qc2.sh pnpm exec tsx scripts/pending/hunt-l6/probe-collation.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-cool-shadow/.test(host)) { console.log("not QC2"); process.exit(1); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const db = await P.$queryRawUnsafe(`SELECT datcollate, datctype FROM pg_database WHERE datname = current_database()`);
const col = await P.$queryRawUnsafe(`SELECT collation_name FROM information_schema.columns WHERE table_name='CrmContact' AND column_name='name'`);
const sorted = await P.$queryRawUnsafe(`SELECT n FROM (VALUES ('ไพโรจน์'),('กมล'),('เอกชัย'),('สมชาย'),('โชคดี'),('ขวัญใจ'),('แก้วตา'),('อรุณ')) v(n) ORDER BY n`);
const sortedTh = await P.$queryRawUnsafe(`SELECT n FROM (VALUES ('ไพโรจน์'),('กมล'),('เอกชัย'),('สมชาย'),('โชคดี'),('ขวัญใจ'),('แก้วตา'),('อรุณ')) v(n) ORDER BY n COLLATE "th-TH-x-icu"`).catch((e: Any) => String(e).slice(0, 120));
const sara = await P.$queryRawUnsafe(`SELECT ('น' || chr(3661) || chr(3634)) ILIKE '%น้ำ%' AS decomposed_matches_composed, 'น้ำ' ILIKE '%น้ำ%' AS same`);
console.log(JSON.stringify({ db, col, sortedDefault: sorted.map((r: Any) => r.n), sortedThaiIcu: Array.isArray(sortedTh) ? sortedTh.map((r: Any) => r.n) : sortedTh, sara }, null, 1));
await P.$disconnect();

// read-only: memberCode ordering + non-seed customers in the member QC system
type Any = any; // eslint-disable-line
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { readFileSync } = await import("node:fs");
const { prisma } = await import("@/lib/core/db");
const mq = (await import("../member-qc-env.mts" as string)) as Any;
const P = prisma as Any;
const scope = await mq.resolveMemberScope(prisma);
const SYS = scope.systemId; const tid = scope.tenantId;
const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
const seedIds = new Set(E.members.map((m: Any) => m.id));
const idx = new Map(E.members.map((m: Any, i: number) => [m.id, i + 1]));
console.log("collation", JSON.stringify(await prisma.$queryRawUnsafe(`select datcollate from pg_database where datname=current_database()`)));
const all = await P.customer.findMany({ where: { memberSystemId: SYS }, orderBy: { memberCode: "desc" }, select: { id: true, memberCode: true, homeUnitId: true, status: true, createdAt: true, updatedAt: true, mergedIntoId: true } });
console.log("total customers in SYS", all.length, "seed", all.filter((c: Any) => seedIds.has(c.id)).length);
const u = E.units; const un = (x: string) => x === u.patong ? "patong" : x === u.kata ? "kata" : x;
for (const c of all.slice(0, 12)) console.log(c.memberCode, "m" + (idx.get(c.id) ?? "-new"), un(c.homeUnitId), c.status, c.createdAt.toISOString(), c.updatedAt.toISOString());
console.log("non-seed:"); for (const c of all.filter((c: Any) => !seedIds.has(c.id))) console.log(" ", c.id, c.memberCode, un(c.homeUnitId), c.status, c.createdAt.toISOString());
const kataSeed = E.members.map((m: Any, i: number) => ({ i: i + 1, code: m.memberCode, unit: m.unit })).filter((m: Any) => m.unit === "kata").sort((a: Any, b: Any) => (a.code < b.code ? 1 : -1));
console.log("kata seed by code desc (JS order):", JSON.stringify(kataSeed.slice(0, 4)));
// audit/outbox for m41
const m41 = E.members[40].id;
const aud = await P.auditLog.findMany({ where: { tenantId: tid, targetId: m41 }, orderBy: { createdAt: "asc" }, select: { action: true, actorId: true, createdAt: true, diff: true } }).catch((e: Error) => [{ err: e.message.slice(0, 100) }]);
console.log("audit m41", JSON.stringify(aud).slice(0, 1500));
const ob = await prisma.$queryRawUnsafe(`select type, "createdAt", status, payload::text as p from "OutboxEvent" where "tenantId"=$1 and payload::text like $2 order by "createdAt"`, tid, `%${m41}%`) as Any[];
console.log("outbox m41", ob.length); for (const o of ob) console.log(" ", o.type, o.createdAt.toISOString(), o.status, o.p.slice(0, 160));
await prisma.$disconnect();

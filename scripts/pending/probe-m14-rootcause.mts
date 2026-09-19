// read-only root-cause probe for qc-member-m1.4 S3.5/S5.x (19 Sep) — copies oracle setup exactly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { readFileSync } = await import("node:fs");
const { prisma } = await import("@/lib/core/db");
const mq = (await import("../member-qc-env.mts" as string)) as Any;
const P = prisma as Any;
const scope = await mq.resolveMemberScope(prisma);
const tid = scope.tenantId; const SYS = scope.systemId;
const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
console.log("scope", tid, SYS, "expectedPath", mq.MQC.expectedPath, "E.tenant", E.tenantId, "units", JSON.stringify(E.units));
const units = E.units as Record<string, string>;
const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role as string, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
const U = { owner: E.users.owner.userId, thana: E.users.staff.thana.userId, kata: E.users.staff.kata.userId };
const thana = await actorOf(U.thana); const kata = await actorOf(U.kata); const owner = await actorOf(U.owner);
console.log("thana actor", JSON.stringify({ ...thana, permissions: Object.keys(thana.permissions) }));
console.log("kata actor", JSON.stringify({ ...kata, permissions: Object.keys(kata.permissions) }));
const allMs = await P.membership.findMany({ where: { userId: { in: [U.thana, U.kata] } }, select: { tenantId: true, userId: true, role: true, unitAccess: true, updatedAt: true, createdAt: true } });
console.log("all memberships of thana/kata", JSON.stringify(allMs));
const pOnly = await P.customer.findFirst({ where: { memberSystemId: SYS, homeUnitId: units.patong, status: "ACTIVE", activities: { none: { unitId: units.kata } } }, orderBy: { memberCode: "asc" } });
const kOnly = await P.customer.findFirst({ where: { memberSystemId: SYS, homeUnitId: units.kata, status: "ACTIVE", activities: { none: { unitId: units.patong } } }, orderBy: { memberCode: "desc" } });
const pick = (c: Any) => c && { id: c.id, code: c.memberCode, name: c.name, home: c.homeUnitId, tenant: c.tenantId, sys: c.memberSystemId, status: c.status, partyId: c.partyId, createdAt: c.createdAt, updatedAt: c.updatedAt, source: c.source, sourceDetail: c.sourceDetail, mergedIntoId: c.mergedIntoId };
console.log("pOnly", JSON.stringify(pick(pOnly)));
console.log("kOnly", JSON.stringify(pick(kOnly)));
console.log("E.members[0], [40], [59]", JSON.stringify([E.members[0], E.members[40], E.members[59]].map((m: Any) => m && { id: m.id, code: m.memberCode })));
for (const [label, c] of [["pOnly", pOnly], ["kOnly", kOnly]] as const) {
  const acts = await P.memberActivity.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "asc" } });
  console.log(label, "activities", JSON.stringify(acts.map((a: Any) => ({ id: a.id, t: a.tenantId === tid, mod: a.module, type: a.type, unit: a.unitId, at: a.createdAt, occ: a.occurredAt, ref: a.refId ?? a.sourceId, key: a.dedupeKey ?? a.idempotencyKey }))));
}
// top of ordering by memberCode desc among kata-home actives
const kataHome = await P.customer.findMany({ where: { memberSystemId: SYS, homeUnitId: units.kata, status: "ACTIVE" }, orderBy: { memberCode: "desc" }, take: 8, select: { id: true, memberCode: true, name: true, createdAt: true, updatedAt: true } });
console.log("kata-home top by code desc", JSON.stringify(kataHome));
const PR = (await import("@/lib/modules/member/profile" as string)) as Any;
const M = (await import("@/lib/modules/member" as string)) as Any;
const ctx = (u: string) => ({ tenantId: tid, systemId: SYS, actorUserId: u });
for (const [n, a, c] of [["thana→kOnly", thana, kOnly], ["thana→pOnly", thana, pOnly], ["kata→pOnly", kata, pOnly], ["kata→kOnly", kata, kOnly]] as const) {
  try { const v = await PR.getMember360(ctx(a.userId), a, c.id); console.log(n, "VISIBLE", v?.profile?.id); } catch (e) { console.log(n, "ERR", (e as Error).name, (e as Error).message.slice(0, 60)); }
}
const bk = await M.briefFor(ctx(U.kata), kata, [pOnly.id, kOnly.id, E.members[40].id]);
console.log("briefK", JSON.stringify(bk.map((b: Any) => [b.id, b.memberCode])));
await prisma.$disconnect();

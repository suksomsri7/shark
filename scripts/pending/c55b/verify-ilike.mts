// controller: verify C5.5 hunt-2a 2a-6/2a-5 premise — Prisma `equals + mode: insensitive` treats `_` as a wildcard? READ-ONLY (QC1)
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
console.log("host", accEnv.loadQcEnv().host);
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const row = await P.crmContact.findFirst({ where: { email: { contains: "." } }, select: { id: true, email: true, tenantId: true } });
if (!row) { console.log("no contact with a dot in e-mail"); process.exit(0); }
const local = String(row.email).split("@")[0], dom = String(row.email).split("@")[1];
const look = local.replace(".", "_") + "@" + dom;                    // somchai_k@ for somchai.k@
const pct = "%" + "@" + dom;
const hitU = await P.crmContact.findMany({ where: { tenantId: row.tenantId, email: { equals: look, mode: "insensitive" } }, select: { id: true } });
const hitP = await P.crmContact.findMany({ where: { tenantId: row.tenantId, email: { equals: pct, mode: "insensitive" } }, select: { id: true }, take: 3 });
const ctrl = await P.crmContact.findMany({ where: { tenantId: row.tenantId, email: { equals: local.replace(".", "x") + "@" + dom, mode: "insensitive" } }, select: { id: true } });
console.log(JSON.stringify({ stored: "<a.b@d>", lookalikeUnderscoreMatches: hitU.some((r: any) => r.id === row.id), percentMatches: hitP.length, controlLetterMatches: ctrl.length }));
process.exit(0);

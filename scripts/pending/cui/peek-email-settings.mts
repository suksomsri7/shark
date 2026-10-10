// CRM C4.4-fix2 ▸ read-only: QC1 shop's CRM e-mail tracking switches (no values printed except booleans) ◂
/* eslint-disable @typescript-eslint/no-explicit-any */
const accEnv = (await import("../../acc-v2-env.mts" as string)) as any;
accEnv.loadQcEnv();
const { prisma } = (await import("@/lib/core/db" as string)) as any;
const lib = (await import("../../crm-journeys/lib.mts" as string)) as any;
const env = await lib.resolveEnv(prisma);
const sys = await prisma.appSystem.findFirst({ where: { id: env.SYS }, select: { settings: true } });
const e = (sys?.settings as any)?.crm?.email ?? {};
console.log(JSON.stringify({ trackOpens: e.trackOpens ?? null, trackClicks: e.trackClicks ?? null }));
await prisma.$disconnect();

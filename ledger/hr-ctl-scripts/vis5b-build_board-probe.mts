// scratch: board + kpis of the seed tenant (read-only) for the days the walk can open
import { readFileSync } from "node:fs";
const E = JSON.parse(readFileSync("/root/projects/shark-hr/scripts/hr-expected.json", "utf8"));
const { prisma } = (await import("@/lib/core/db" as string)) as any;
const judge = (await import("@/lib/modules/hr/judge")) as any, rules = (await import("@/lib/modules/hr/hub-rules")) as any, rep = (await import("@/lib/modules/hr/reports")) as any;
const ctx = { tenantId: E.tenant.id, systemId: E.systems.HR };
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const names = Object.fromEntries(Object.entries(E.employees).map(([k, v]) => [v, k]));
for (const who of ["owner", "manager-branch"]) {
  const uid = E.users[who].userId, m = await prisma.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: uid } });
  const v = { role: m.role, unitAccess: m.unitAccess, permissions: m.permissions, userId: uid };
  for (const off of [0, -1, -2, -3, -5, -6]) {
    const day = add(E.dates.today, off), b = await judge.loadAttendanceBoard(ctx, v, { day }, {});
    if (!b) { console.log(who, day, "no board"); continue; }
    const k = rules.kpisOf(b), f = rules.boardFactsOf(b), { rows, off: offN } = rules.boardRowsOf(b);
    console.log(`${who} ${day} kpi=${JSON.stringify(k)} rows=${rows.map((r: any) => `${names[r.employeeId] ?? r.name}:${r.slots.map((s: any) => s.status + (s.lateMin ? s.lateMin : "") + (s.shift ? "@" + s.shift.name : "")).join("/")}`).join(" ")} off=${offN.length} worked=${f.workedMin} planned=${f.plannedMin} methods=${JSON.stringify(f.methods)} thin=${JSON.stringify(f.thinnest)}`);
  }
}
await prisma.$disconnect();
process.exit(0);

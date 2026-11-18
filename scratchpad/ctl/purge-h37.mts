import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const P = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any) as any;
const src = readFileSync("scripts/qc-hr-lib.mts", "utf8");
const m = src.match(/const MODEL_DELETE_ORDER = \[([\s\S]*?)\];/)!;
const ORDER = [...m[1]!.matchAll(/"([A-Za-z0-9_]+)"/g)].map((x) => x[1]!);
const ts = await P.tenant.findMany({ where: { slug: { startsWith: "qc-hr-h37-afbvmztl-" } }, select: { id: true, slug: true } });
if (ts.length !== 3) { console.log("unexpected tenant count", ts.length); process.exit(2); }
for (const t of ts) {
  const left: string[] = [];
  for (const tb of ["HrNotice", "HrLineLink"]) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, t.id);
  for (const k of ORDER) if (P[k]?.deleteMany) { try { await P[k].deleteMany({ where: { tenantId: t.id } }); } catch (e: any) { left.push(`${k}:${String(e?.code ?? e?.message).slice(0, 60)}`); } }
  for (const k of ORDER) if (P[k]?.deleteMany) { try { await P[k].deleteMany({ where: { tenantId: t.id } }); } catch { /* second pass */ } }
  await P.tenant.delete({ where: { id: t.id } });
  console.log("deleted", t.slug, "first-pass errors:", left.join(",") || "none");
}
const users = await P.user.findMany({ where: { email: { startsWith: "qc-hr-h37-afbvmztl" } }, select: { id: true } });
for (const u of users) { await P.session.deleteMany({ where: { userId: u.id } }); await P.appNotification.deleteMany({ where: { recipientUserId: u.id } }); await P.membership.deleteMany({ where: { userId: u.id } }); await P.user.delete({ where: { id: u.id } }); }
console.log("users deleted", users.length, "tenants left", await P.tenant.count({ where: { slug: { startsWith: "qc-hr-h37-" } } }));
await P.$disconnect();

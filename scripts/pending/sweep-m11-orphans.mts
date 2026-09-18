// Sweep orphans left by a qc-member-m1.1 run the controller stopped mid-way (18 Sep, crm-c12a-verify).
// QC only (acc-v2-env gate). Usage: tsx scripts/pending/sweep-m11-orphans.mts [--apply]
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
console.log("host", accEnv.loadQcEnv().host);
const { prisma } = await import("@/lib/core/db");
type Any = any; // eslint-disable-line
const P = prisma as Any;
const apply = process.argv.includes("--apply");
const users = await prisma.user.findMany({ where: { email: "mb-bf-hr@shark.local" }, select: { id: true } });
const others = await prisma.tenant.findMany({ where: { name: "MEMBER BF OTHER" }, select: { id: true, slug: true } });
const hr = await P.hrEmployee.findMany({ where: { OR: [{ email: "MB-BF-HR@shark.local" }, { name: "พนักงาน BF ไม่มีอีเมล" }] }, select: { id: true } });
const chat = await prisma.chatContact.findMany({ where: { displayName: "ลูกค้า BF1 ทางเว็บ" }, select: { id: true } });
const crm = await P.crmContact.findMany({ where: { name: "ลูกค้า BF1 ใน CRM" }, select: { id: true } });
const cust = await prisma.customer.findMany({ where: { memberCode: { in: ["BF-1", "BF-2"] }, name: { startsWith: "ลูกค้า backfill" } }, select: { id: true } });
console.log(JSON.stringify({ users: users.length, otherTenants: others.length, hr: hr.length, chat: chat.length, crm: crm.length, cust: cust.length }));
if (apply) {
  for (const c of cust) { for (const m of ["memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberActivity"]) await P[m].deleteMany({ where: { customerId: c.id } }); await prisma.customer.delete({ where: { id: c.id } }); }
  for (const c of chat) await prisma.chatContact.delete({ where: { id: c.id } });
  for (const c of crm) await P.crmContact.delete({ where: { id: c.id } });
  for (const h of hr) await P.hrEmployee.delete({ where: { id: h.id } });
  for (const u of users) { await prisma.membership.deleteMany({ where: { userId: u.id } }); await prisma.user.delete({ where: { id: u.id } }); }
  for (const o of others) {
    for (const m of ["memberTierHistory", "memberAttribution", "memberConsent", "memberTierDef", "memberField", "memberSection", "customer", "party", "automationRule", "appSystem"]) await P[m].deleteMany({ where: { tenantId: o.id } });
    await prisma.tenant.delete({ where: { id: o.id } });
  }
  console.log("applied");
}
await prisma.$disconnect();

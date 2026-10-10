// READ-ONLY (QC1 acc-v2 seed): SQL statements of the account contact profile "links" tab for the oracle's contact (Q7/Q8 contact) —
//   no viewer (what qc-acc-v2-contact-profile Q8.links measures) vs the seed OWNER's real viewer (what the page runs for the owner).
//   contactProfile is a pure loader (no writes). Needs scripts/acc-v2-expected.json with key contactProfile (see the review note).
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf19/review/qc1-links-budget.mts
import { readFileSync } from "node:fs";
const env = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string }; QC: { expectedPath: string } };
const { host } = env.loadQcEnv();
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
let sqlLog: string[] = [];
let counting = false;
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), log: [{ emit: "event", level: "query" }] });
(client as unknown as { $on: (e: string, cb: (ev: { query: string }) => void) => void }).$on("query", (ev) => {
  if (counting) sqlLog.push(ev.query);
});
(globalThis as unknown as { prisma?: PrismaClient }).prisma = client;
const { prisma } = await import("@/lib/core/db");
const cp = await import("@/lib/modules/account/contact-profile");
const E = JSON.parse(readFileSync(env.QC.expectedPath, "utf8"));
const ctx = { tenantId: E.tenantId as string, systemId: E.systemId as string };
const id = E.contactProfile.contactId as string;
const m = await prisma.membership.findFirst({ where: { tenantId: ctx.tenantId, role: "OWNER" }, orderBy: { createdAt: "asc" }, select: { userId: true, role: true, unitAccess: true, permissions: true } });
const owner = m ? { userId: m.userId, role: m.role, unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as string[]) : [], permissions: (m.permissions ?? {}) as Record<string, unknown> } : null;
const run = async (viewer: unknown) => {
  sqlLog = []; counting = true;
  const p = await cp.contactProfile(ctx, id, { base: "/x", tab: "links", asOf: new Date("2026-09-30T12:00:00+07:00"), ...(viewer === "omit" ? {} : { crmViewer: viewer as never }) });
  counting = false;
  const n = sqlLog.filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(q)).length;
  return { n, cards: p?.linksTab?.cards.map((c) => `${c.key}:${c.linked}`) };
};
console.log(`BUDGET ${JSON.stringify({ host: host.split("-pooler")[0], noViewer: await run("omit"), owner: await run(owner) })}`);
await prisma.$disconnect();

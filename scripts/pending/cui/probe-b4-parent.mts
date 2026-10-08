// CRM C4.2-fix ▸ B4 service-level probe — a custom-object record's "open parent" link must only exist when the viewer can
//   actually open the parent page (same loader the parent page uses: getCompany360/getContact360/getDeal360) ◂
//   Persona = the seeded staff (thana · nok) with `crm.record.read` added IN MEMORY ONLY (no membership write — shared QC1),
//   plus the real manager. Record visibility (recordVisibilitySql) follows the parent's OWN/TEAM policy but not the parent's
//   read key/scope ⇒ a staff member can see a record whose parent company page is a 404.
//   HEAD rule (page code before the fix): link = parentId && type ∈ CONTACT/COMPANY/DEAL.
//   Fixed rule: link = parentLinks(ctx, actor, refs) (src/components/crm/objects/server.ts) — if that export is missing
//   the probe evaluates the HEAD rule.
// Read-only. Run: pnpm exec tsx scripts/pending/cui/probe-b4-parent.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as Any;
const envInfo = accEnv.loadQcEnv();
if (!String(envInfo?.host ?? "").includes("ep-plain-art")) {
  console.error("not QC1 — stop");
  process.exit(4);
}
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const lib = (await import("../../crm-journeys/lib.mts" as string)) as Any;
const CRM = (await import("@/lib/modules/crm" as string)) as Any;
const SRV = (await import("@/components/crm/objects/server" as string)) as Any;
const hasFix = typeof SRV.parentLinks === "function" && !process.argv.includes("--head-rule");
console.log(`page rule under test: ${hasFix ? "parentLinks() (fixed)" : "HEAD (link for every parent id)"}`);

let pass = 0;
let fail = 0;
const chk = (id: string, ok: boolean, msg: string) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✅" : "❌"} ${id} ${msg}`);
};

const env = await lib.resolveEnv(prisma);
const SYS = env.SYS as string;
const PATH: Record<string, string> = { CONTACT: "contacts", COMPANY: "companies", DEAL: "deals" };
const opens = async (ctx: Any, actor: Any, type: string, id: string): Promise<boolean> => {
  const f = type === "COMPANY" ? CRM.companies.getCompany360 : type === "CONTACT" ? CRM.contacts.getContact360 : CRM.deals.getDeal360;
  try {
    await f(ctx, actor, id);
    return true;
  } catch {
    return false;
  }
};

const recs = await prisma.customRecord.findMany({
  where: { systemId: SYS, parentType: { in: ["COMPANY", "CONTACT", "DEAL"] }, parentId: { not: null }, archivedAt: null },
  select: { id: true, parentType: true, parentId: true },
  take: 200,
});
console.log(`records with a CRM parent on QC1: ${recs.length}`);

for (const role of ["thana", "nok", "manager"] as const) {
  const m = await prisma.membership.findFirst({ where: { tenantId: env.tenantId, userId: env.users[role].userId }, select: { role: true, permissions: true, unitAccess: true } });
  const perms = { ...(m.permissions ?? {}), ...(role === "manager" ? {} : { "crm.record.read": true }) };
  const actor = { userId: env.users[role].userId, role: m.role, permissions: perms, unitAccess: m.unitAccess ?? [] };
  const ctx = { tenantId: env.tenantId, systemId: SYS, actorUserId: actor.userId };
  const visible = await CRM.visibility.visibleIdsAmong(env.tenantId, actor, "RECORD", recs.map((r: Any) => r.id));
  const mine = recs.filter((r: Any) => visible.has(r.id));
  const links: Map<string, string> = hasFix
    ? await SRV.parentLinks(ctx, actor, mine.map((r: Any) => ({ parentType: r.parentType, parentId: r.parentId })))
    : new Map(mine.map((r: Any) => [`${r.parentType}:${r.parentId}`, `/app/sys/${SYS}/crm/${PATH[r.parentType]}/${r.parentId}`]));
  let dead = 0;
  let missing = 0;
  let linked = 0;
  for (const r of mine) {
    const k = `${r.parentType}:${r.parentId}`;
    const can = await opens(ctx, actor, r.parentType, r.parentId);
    if (links.has(k)) {
      linked++;
      if (!can) dead++;
    } else if (can) missing++;
  }
  chk(`B4.dead[${role}]`, dead === 0, `${role}${role === "manager" ? "" : " (+crm.record.read in memory)"}: ${mine.length} visible records · ${linked} parent links · ${dead} lead to a parent page that 404s for this viewer`);
  chk(`B4.kept[${role}]`, missing === 0, `${role}: every parent the viewer CAN open still gets its link — ${missing} missing`);
}
await prisma.$disconnect();
console.log(`\nB4 parent-link probe: ${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);

// PRIV-3 hunt — remove leftovers of MY crashed runs only (tenants slug qc-h52p-* · users email qc-h52p-*)
import { qc4Env } from "/root/projects/shark-hr-l5/scripts/qc-hr-lib.mjs";
import { sweepTenants, sweepResidue } from "/root/projects/shark-hr-l5/scripts/qc-hr-h4.3-lib.mjs";
const PFX = "qc-h52p-";
const { P } = await qc4Env("h52p-cleanup");
const ts = ((await P.tenant.findMany({ where: { slug: { startsWith: PFX } }, select: { id: true, slug: true } })) as { id: string; slug: string }[]);
console.log(`tenants: ${ts.map((t) => t.slug).join(",") || "none"}`);
const ids = ts.map((t) => t.id);
if (ids.length) {
  await P.apiKey?.deleteMany?.({ where: { tenantId: { in: ids } } }).catch(() => undefined);
  await sweepTenants(P, ids);
  for (let i = 0; i < 2; i++) await P.tenant.deleteMany({ where: { id: { in: ids } } }).catch((e: unknown) => console.log(`tenant del: ${String(e).slice(0, 120)}`));
}
const us = ((await P.user.findMany({ where: { email: { startsWith: PFX } }, select: { id: true } })) as { id: string }[]).map((u) => u.id);
for (const uid of us) {
  await P.session.deleteMany({ where: { userId: uid } }).catch(() => undefined);
  await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined);
  await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined);
  await P.user.deleteMany({ where: { id: uid } }).catch((e: unknown) => console.log(`user del: ${String(e).slice(0, 120)}`));
}
const left = await sweepResidue(P, ids);
console.log(`RESIDUE rows=${left.join(",") || "none"} tenants=${await P.tenant.count({ where: { slug: { startsWith: PFX } } })} users=${await P.user.count({ where: { email: { startsWith: PFX } } })}`);
process.exit(0);

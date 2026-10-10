// C5.5-fix4 evidence (not a gate): does Prisma `contains … mode insensitive` on this DB treat `%` / `_` in the search
// term as wildcards? Answers whether the account list searches (left unchanged by this card — they are "contains"
// searches, not equality) widen on `%` / `_`. Records the fact for the follow-up card; exits 0 either way.
// Run (QC3): bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf4/probe-cf4-contains.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf4c-${rand}`;
let T = "";
let left = -1;
try {
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG }, select: { id: true } })).id as string;
  const S = (await P.appSystem.create({ data: { tenantId: T, type: "ACCOUNT", name: `${TAG} acc` }, select: { id: true } })).id as string;
  for (const n of ["alpha", "beta", "gamma.x"]) await P.accountContact.create({ data: { tenantId: T, systemId: S, name: `${n} ${TAG}` }, select: { id: true } });
  const cnt = (q: string) => P.accountContact.count({ where: { tenantId: T, systemId: S, name: { contains: q, mode: "insensitive" } } });
  const pct = await cnt("%");
  const us = await cnt("gamma_x");
  const lit = await cnt("zzz%zzz");
  console.log(`contains "%" → ${pct}/3 rows · contains "gamma_x" → ${us} (stored "gamma.x") · contains "zzz%zzz" → ${lit}`);
  console.log(`VERDICT ${pct === 3 && us === 1 ? "WILDCARDS LEAK in contains (% and _ are patterns)" : pct === 0 && us === 0 ? "contains escapes % and _ (literal)" : "mixed"}`);
} finally {
  if (T) {
    await P.accountContact.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    left = (await P.accountContact.count({ where: { tenantId: T } })) + (await P.tenant.count({ where: { id: T } }));
    console.log(`CLEAN left=${left}`);
  }
  await prisma.$disconnect();
}

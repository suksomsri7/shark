// C5.5-fix9 REVIEW probe — person export vs the merged chain (the erase covers contacts merged into the person; does the export?)
//   A is merged into B (mergedIntoId = B). Rows that `mergeContacts` does NOT re-point (form answers · score logs · consents) stay on A.
//   exportContact(B) says complete:true — FINDING if A's rows are absent while the bundle claims completeness.
// Run (QC3): bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf12/review/probe-cf12-review-chain.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
if (!/ep-weathered-river/.test(String(accEnv.loadQcEnv().host ?? process.env.DATABASE_URL ?? ""))) {
  console.error("QC3 only");
  process.exit(4);
}
globalThis.fetch = (async () => {
  throw new Error("network blocked");
}) as typeof fetch;
const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf12c-${rand}`;
let T = "";
const USERS: string[] = [];
const res: [string, boolean, string][] = [];
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true }),
    S,
  );
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };
  const B = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `ผู้รอด ${TAG}`, ownerUserId: u.id } });
  const A = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `ถูกรวม ${TAG}`, ownerUserId: u.id, mergedIntoId: B.id, archivedAt: new Date() } });
  const form = (await P.formDef.create({ data: { tenantId: T, name: `ฟอร์ม ${TAG}`, publicToken: `${TAG}-form` } })).id as string;
  for (const c of [A, B]) {
    for (let i = 0; i < 2; i += 1) {
      await P.formSubmission.create({ data: { tenantId: T, formId: form, crmContactId: c.id, answersJson: { name: c.name, i } } });
      await P.crmScoreLog.create({ data: { tenantId: T, contactId: c.id, points: 1, reason: `${c.name} ${i}` } });
    }
  }
  const b = await CRM.privacy.exportContact(ctx, owner, B.id);
  const forms = (b?.tables?.FormSubmission ?? []).length;
  const scores = (b?.tables?.CrmScoreLog ?? []).length;
  const chain = j(b?.tables).includes(A.id) || j(b?.tables).includes(A.name);
  res.push(["C1", !(b?.complete === true && (forms < 4 || scores < 4)), `export(B): complete=${b?.complete} FormSubmission=${forms}/4 CrmScoreLog=${scores}/4 mentionsA=${chain} (the erase of B covers A)`]);
} catch (e) {
  res.push(["C0", false, e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 400) : String(e)]);
} finally {
  if (T) {
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((x) => String(x.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0;
    for (const t of tables) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])?.[0]?.n ?? 0);
    for (const uid of USERS) {
      await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined);
      await P.user.delete({ where: { id: uid } }).catch(() => undefined);
    }
    res.push(["CLEAN", left === 0 && (await P.tenant.count({ where: { id: T } })) === 0, `left=${left}`]);
  }
  await prisma.$disconnect();
}
function j(v: unknown) {
  return JSON.stringify(v ?? null);
}
for (const [id, ok, a] of res) console.log(`  ${ok ? "✅" : "❌"} [${id}]${id === "C1" ? " (FINDING check)" : ""} ${a}`);
console.log(`JSON_SUMMARY ${JSON.stringify(res.map(([id, ok]) => [id, id === "C1" ? (ok ? "NOT-REPRODUCED" : "REPRODUCED") : ok]))}`);
process.exit(res.find((r) => r[0] === "CLEAN")?.[1] ? 0 : 1);

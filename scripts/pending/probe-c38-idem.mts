// probe-c38-idem.mts — หลักฐานรีวิว C3.8 S1: ค่าลับที่คืนครั้งเดียว (token เชิญพอร์ทัล) ไม่ถูกเก็บลง ApiIdempotency.responseJson
//   และ replay ยังได้ null · ทุกอย่างอยู่ในร้านชั่วคราว `qc-c38p-<rand>` ลบใน finally · QC2 เท่านั้น
// Run: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c38-idem.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const AK = (await import("@/lib/api-keys/service" as string)) as Any;
const SC = (await import("@/lib/api-keys/scopes" as string)) as Any;
const ROUTE = (await import("@/app/api/v1/crm/[...path]/route" as string)) as Any;
const TAG = `qc-c38p-${Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q")}`;
let tenantId = "";
let userId = "";
const checks: [string, boolean, string][] = [];
console.log(`[env] DB ${host} · tag ${TAG}`);
try {
  userId = (await P.user.create({ data: { email: `${TAG}@qc.invalid`, name: `QC ${TAG}` } })).id;
  tenantId = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  await P.membership.create({ data: { userId, tenantId, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const S = (await sysSvc.createSystem(tenantId, "CRM", `CRM ${TAG}`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, portal: { enabled: true, loginMethods: ["EMAIL_OTP"], showDeals: true, allowIssue: true, issueBoardId: null } }), S);
  const partyC = (await P.party.create({ data: { tenantId, name: `บริษัท ${TAG}`, kind: "COMPANY" } })).id;
  const co = (await P.crmCompany.create({ data: { tenantId, systemId: S, partyId: partyC, name: `บริษัท ${TAG}` } })).id as string;
  const partyK = (await P.party.create({ data: { tenantId, name: `คุณ ${TAG}`, kind: "PERSON" } })).id;
  const k = (await P.crmContact.create({ data: { tenantId, systemId: S, partyId: partyK, name: `คุณ ${TAG}`, firstName: `คุณ ${TAG}` } })).id as string;
  await P.crmCompanyContact.create({ data: { tenantId, companyId: co, contactId: k, isPrimary: true } });
  const admin = ((SC.API_SCOPE_BUNDLES as Any[]).find((b) => b.id === "crm.admin")?.scopes ?? []) as string[];
  const key = await AK.createApiKey({ tenantId }, `${TAG} admin`, { scopes: admin, systemId: S, createdById: userId });
  const call = async () => {
    const res: Response = await ROUTE.POST(
      new Request(`http://qc.invalid/api/v1/crm/companies/${co}/portal-invites`, { method: "POST", headers: { authorization: `Bearer ${key.rawKey}`, "idempotency-key": `${TAG}-idem`, "content-type": "application/json" }, body: JSON.stringify({ contactId: k }) }),
      { params: Promise.resolve({ path: ["companies", co, "portal-invites"] }) },
    );
    return { status: res.status, replayed: res.headers.get("idempotent-replayed"), body: JSON.parse(await res.text()) as Any };
  };
  const first = await call();
  const url = String(first.body?.data?.inviteUrl ?? "");
  const token = url.split("/").filter(Boolean).pop() ?? "";
  checks.push(["first call 200 with inviteUrl (the one time)", first.status === 200 && token.length > 20, `status=${first.status} url=${!!url}`]);
  const row = (await P.apiIdempotency.findFirst({ where: { keyId: key.id, idemKey: `${TAG}-idem` } })) as Any;
  const stored = JSON.stringify(row?.responseJson ?? null);
  checks.push(["ApiIdempotency.responseJson carries no token (inviteUrl stored as null)", !!row && row.status === 200 && !stored.includes(token) && row.responseJson?.data?.inviteUrl === null, `row=${!!row} tokenStored=${token ? stored.includes(token) : "n/a"} inviteUrl=${JSON.stringify(row?.responseJson?.data?.inviteUrl)}`]);
  const again = await call();
  checks.push(["replay: 200 · Idempotent-Replayed: true · inviteUrl null · same accessId", again.status === 200 && again.replayed === "true" && again.body?.data?.inviteUrl === null && again.body?.data?.accessId === first.body?.data?.accessId, `status=${again.status} replayed=${again.replayed} inviteUrl=${JSON.stringify(again.body?.data?.inviteUrl)}`]);
} catch (e) {
  checks.push(["probe ran without an exception", false, e instanceof Error ? e.message.slice(0, 300) : String(e)]);
} finally {
  if (tenantId) {
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    await P.chatRateBucket.deleteMany({ where: { key: { contains: tenantId } } }).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tenantId).catch(() => undefined);
    for (const k of ["appSystemUnit", "appSystem", "businessUnit"]) await P[k].deleteMany({ where: { tenantId } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  }
  if (userId) {
    await P.session.deleteMany({ where: { userId } }).catch(() => undefined);
    await P.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
  const left = tenantId ? await P.tenant.count({ where: { id: tenantId } }) : 0;
  const leftKeys = tenantId ? await P.apiKey.count({ where: { tenantId } }) : 0;
  checks.push(["cleanup: tenant + keys gone", left === 0 && leftKeys === 0, `tenant=${left} keys=${leftKeys}`]);
  await prisma.$disconnect();
}
for (const [n, ok, d] of checks) console.log(`  ${ok ? "✅" : "❌"} ${n}${ok ? "" : ` — ${d}`}`);
const passed = checks.filter((c) => c[1]).length;
console.log(`JSON_SUMMARY ${JSON.stringify({ total: checks.length, passed })}`);
process.exit(passed === checks.length ? 0 : 1);

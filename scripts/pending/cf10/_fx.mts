// C5.5-fix7 probe fixture — copy of scripts/pending/cf7/_fx.mts pinned to QC2 (ep-cool-shadow) · throwaway tenants `qc-cf10-*` only ·
//   swept in `done()` · prints a JSON_SUMMARY line
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf10/probe-cf10.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";

export async function fixture(label: string) {
  const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
  const { host } = accEnv.loadQcEnv();
  if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) {
    console.log(`QC2 only — got ${host}`);
    process.exit(1);
  }
  globalThis.fetch = (async () => {
    throw new Error("network blocked");
  }) as typeof fetch;
  const { prisma } = await import("@/lib/core/db");
  const P = prisma as Any;
  const TAG = `qc-cf10-${label}-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
  const res: { id: string; ok: boolean; msg: string }[] = [];
  const chk = (id: string, ok: boolean, msg: string) => {
    res.push({ id, ok, msg });
    console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
  };
  const USERS: string[] = [];
  const TENANTS: string[] = [];
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj),
      sysId,
    );
  let n = 0;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  /** a whole shop: tenant · OWNER · CRM v2 (bridges on) · ACCOUNT linked to the CRM · pipeline (3 OPEN · WON · LOST) */
  const mkShop = async (suffix: string, opts: { account?: boolean; portal?: boolean } = {}) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    const uid = await mkUser(`-${suffix}`);
    await P.membership.create({ data: { userId: uid, tenantId: t.id, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    const S = (await sysSvc.createSystem(t.id, "CRM", `CRM ${TAG} ${++n}`)).id as string;
    await setCrm(S, { uiVersion: 2, bridgesEnabled: true, ...(opts.portal ? { portal: { enabled: true, loginMethods: ["EMAIL_OTP"], showDeals: false, allowIssue: false, issueBoardId: null } } : {}) });
    let A: string | null = null;
    if (opts.account) {
      A = (await sysSvc.createSystem(t.id, "ACCOUNT", `บัญชี ${TAG} ${n}`)).id as string;
      const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
      await accSvc.saveSettings(t.id, A, { orgName: `QC ${TAG}`, taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
      const connections = (await import("@/lib/modules/account/connections" as string)) as Any;
      const r = await connections.connect({ tenantId: t.id, systemId: A }, "CRM", S, uid);
      if (!r?.ok) throw new Error(`connections.connect failed: ${JSON.stringify(r)}`);
    }
    const pipe = await P.crmPipeline.create({
      data: {
        tenantId: t.id,
        systemId: S,
        name: `ขาย ${TAG}`,
        isDefault: true,
        stages: {
          create: (
            [
              ["ใหม่", "OPEN", 10],
              ["เสนอราคา", "OPEN", 60],
              ["ตกลง", "OPEN", 90],
              ["ชนะ", "WON", 100],
              ["แพ้", "LOST", 0],
            ] as const
          ).map(([name, kind, probability], i) => ({ tenantId: t.id, systemId: S, sortOrder: i, name, kind, probability })),
        },
      },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
    const owner = { userId: uid, role: "OWNER", unitAccess: ["*"], permissions: {} };
    return { tid: t.id as string, slug: t.slug as string, uid, S, A, ctx: { tenantId: t.id as string, systemId: S, actorUserId: uid }, owner, pipe: pipe as Any, stages: pipe.stages as Any[] };
  };
  const call = async (f: () => Promise<Any>): Promise<Any> => {
    try {
      return { ok: true, v: await f() };
    } catch (err) {
      return { ok: false, err };
    }
  };
  const done = async (name: string, before?: () => Promise<void>) => {
    if (before) await before().catch((e) => chk("CLEAN-before", false, String((e as Error)?.message ?? e).slice(0, 200)));
    for (const T of TENANTS) {
      const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
      for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
      await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
      await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
      let left = 0;
      for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
      chk(`CLEAN-${T.slice(-6)}`, left === 0 && (await P.tenant.count({ where: { id: T } })) === 0, `tenant rows left=${left}`);
    }
    for (const id of USERS) {
      await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined);
      await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined);
      await P.user.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
    const passed = res.filter((r) => r.ok).length;
    console.log(`\n${passed === res.length ? "🟢" : "🔴"} ${name}: ${passed}/${res.length}`);
    console.log(`JSON_SUMMARY ${JSON.stringify({ total: res.length, passed, findings: res.filter((r) => !r.ok).map((r) => r.id) })}`);
    process.exit(passed === res.length ? 0 : 1);
  };
  return { P, prisma, TAG, chk, call, mkShop, mkUser, setCrm, done };
}

/** a valid Thai tax id (mod-11) from a 12-digit prefix */
export function validTaxId(prefix12: string): string {
  const p = prefix12.replace(/\D/g, "").padEnd(12, "0").slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(p[i]) * (13 - i);
  return `${p}${(11 - (sum % 11)) % 10}`;
}

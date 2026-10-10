// probe-54a.mts — C5.4-A HUNTER · QC2 ONLY · throwaway tenant `qc-hunt54a-<rand>` deleted in finally · no drain/cron
//   H1 member REST customer lane `me.history` path (listHistory, CUSTOMER actor) still shows a CRM DEAL_WON row (kind purchase)
//      while listActivity (fixed path) hides it
//   H2 withIdempotency: a transient library error (Prisma write-conflict shape → mapError 422) is STORED and replayed — retry never runs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";
const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-cool-shadow/.test(host)) { console.log(`not QC2 (${host}) — refuse`); process.exit(1); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54a-${randomBytes(4).toString("hex").replace(/[0-9]/g, "q")}`;
const TENANTS: string[] = [];
const out: Record<string, unknown> = { tag: TAG };
try {
  const t = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  TENANTS.push(t.id);
  const T = t.id as string;
  const S = (await P.appSystem.create({ data: { tenantId: T, type: "MEMBER", name: `M ${TAG}` } })).id as string;
  const cu = await P.customer.create({ data: { tenantId: T, memberSystemId: S, name: `ลูกค้า ${TAG}`, phone: "0812345678" } });
  await P.memberActivity.create({ data: { tenantId: T, customerId: cu.id, module: "crm", type: "DEAL_WON", refType: "CrmDeal", refId: "d1", summary: `ปิดดีล "ดีลภายใน-กำไร40%" สำเร็จ · ฿123,456` } });
  await P.memberActivity.create({ data: { tenantId: T, customerId: cu.id, module: "pos", type: "PURCHASE", summary: "ซื้อ ฿100" } });
  const { customerActor } = (await import("@/lib/modules/member/customer-session" as string)) as Any;
  const actor = customerActor(cu.id);
  const ctx = { tenantId: T, systemId: S, actorUserId: null };
  const { listHistory } = (await import("@/lib/modules/member/history" as string)) as Any;
  const { listActivity } = (await import("@/lib/modules/member/activity" as string)) as Any;
  const h = await listHistory(ctx, actor, cu.id, { kind: "all", take: 20 });
  const CUSTOMER_HISTORY_KINDS = ["purchase", "booking", "tier", "loyalty", "review"]; // copy of me.ts filter
  out.H1_meHistory = h.items.filter((x: Any) => CUSTOMER_HISTORY_KINDS.includes(x.kind)).map((x: Any) => `${x.kind}: ${x.title} | ${x.summary}`);
  const a = await listActivity(ctx, actor, cu.id, {});
  out.H1_listActivity = a.items.map((x: Any) => `${x.module}/${x.type}: ${x.summary}`);

  // H2 — idempotency replay of a transient DB error
  const { withIdempotency } = (await import("@/lib/api/idempotency" as string)) as Any;
  let runs = 0;
  const op = { id: "hunt.op", method: "POST", idempotency: "required" };
  const apiActor = { kind: "apikey", tenantId: T, keyId: `${TAG}-key`, scopes: [] };
  const mkReq = () => new Request("https://x.invalid/api/v1/crm/contacts", { method: "POST", headers: { "idempotency-key": "k1" }, body: "{}" });
  const flaky = async () => { runs++; if (runs === 1) { const e: Any = new Error("Transaction failed due to a write conflict or a deadlock. Please retry your transaction"); e.code = "P2034"; throw e; } return { status: 201, body: { ok: true, data: { id: "new" } } }; };
  const r1 = await withIdempotency(apiActor, mkReq(), op, "{}", "rq1", {}, flaky);
  const r2 = await withIdempotency(apiActor, mkReq(), op, "{}", "rq2", {}, flaky);
  out.H2 = { first: r1.status, retry: r2.status, replayed: r2.headers.get("idempotent-replayed"), handlerRuns: runs };
} catch (e) {
  out.error = String((e as Error)?.stack ?? e).slice(0, 800);
} finally {
  for (let pass = 0; pass < 3; pass += 1) {
    const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (const tb of tables) for (const id of TENANTS) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id).catch(() => undefined);
  }
  for (const id of TENANTS) { await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => undefined); await P.tenant.delete({ where: { id } }).catch(() => undefined); }
  out.tenantsLeft = await P.tenant.count({ where: { id: { in: TENANTS } } });
  console.log(JSON.stringify(out, null, 1));
  await prisma.$disconnect();
}

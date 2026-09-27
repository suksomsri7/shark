// probe-hunt39b.mts — C3.9 hunt part 2 (retention anchor · score-rule seed vs cap) — NOT an oracle · QC1 only
// Run: bash scripts/iso.sh bash scripts/pending/run-hunt39.sh probe-hunt39b
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const env = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-plain-art/.test(host)) { console.log(`not QC1 (${host})`); process.exit(1); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, "q");
const TAG = `qc-hunt39-${rand}`;
const out: Record<string, unknown> = { db: host, tag: TAG };
const TENANTS: string[] = [];
const USERS: string[] = [];
const safe = async <T,>(label: string, f: () => Promise<T>): Promise<T | string> => { try { return await f(); } catch (e) { const x = e as Any; return `ERR ${label}: ${x?.name ?? ""}(${x?.code ?? "-"}) ${String(x?.message ?? e).slice(0, 220)}`; } };
const DAY = 86_400_000;

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const PRIV = (await import("@/lib/modules/crm/privacy" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const t = await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b`, limits: { crm: { scoreRules: 2 } } } });
  TENANTS.push(t.id);
  const T = t.id as string;
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC owner ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = '{"crm":{"uiVersion":2,"bridgesEnabled":true}}'::jsonb WHERE "id" = $1`, S);
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };

  // ════════ H4 — a lead created TODAY is erased by the retention job on its first run, without the 30-day warning ════════
  //   trigger: the first activity logged on it is back-dated (call history typed in afterwards) ⇒ lastActivityAt = GREATEST(NULL, past) = past
  //   ⇒ COALESCE(lastActivityAt, createdAt) = 25 months ago < cutoff(24 months)
  {
    const mk = async (tag: string) => {
      const r = await CRM.contacts.createContact(ctx, owner, { firstName: `ลีด${tag}${rand}`, phone: `08${String(Math.floor(Math.random() * 1e8)).padStart(8, "6")}`, sourceKind: "CRM" });
      return r.contact.id as string;
    };
    const fresh = await mk("สด");
    const control = await mk("คุม");
    const past = new Date(Date.now() - 760 * DAY);
    const act = await safe("logActivity(backdated)", () => CRM.activities.logActivity(ctx, owner, { type: "CALL", title: "โทรคุยครั้งแรก (บันทึกย้อนหลัง)", contactId: fresh, startAt: past, direction: "OUT", done: true }));
    const rowsBefore = await P.crmContact.findMany({ where: { id: { in: [fresh, control] } }, select: { id: true, createdAt: true, lastActivityAt: true, lifecycleStage: true } });
    const run = await safe("retentionLeads", () => PRIV.retentionLeads(new Date(), { tenantIds: [T] }));
    const erasedAudit = await P.auditLog.findMany({ where: { tenantId: T, action: "crm.contact.erase" }, select: { targetId: true, after: true } });
    const warned = await P.auditLog.count({ where: { tenantId: T, action: "crm.retention.warned" } });
    const rowsAfter = await P.crmContact.findMany({ where: { id: { in: [fresh, control] } }, select: { id: true, name: true, phone: true, archivedAt: true } });
    out.H4 = {
      logActivity: typeof act === "string" ? act : "ok",
      before: rowsBefore,
      retentionRun: run,
      eraseAudits: erasedAudit.map((a: Any) => ({ targetId: a.targetId, isFresh: a.targetId === fresh, source: a.after?.source })),
      warningsEverWritten: warned,
      after: rowsAfter,
    };
  }

  // ════════ H5 — scoring seed ignores the scoreRules cap (Tenant.limits.crm.scoreRules = 2) ════════
  {
    const seeded = await safe("seedSystemRules", () => CRM.scoring.seedSystemRules(ctx, owner));
    const count = await P.crmScoreRule.count({ where: { tenantId: T, systemId: S } });
    const create = await safe("createRule", () => CRM.scoring.createRule(ctx, owner, { name: "ทดสอบ", event: "crm.email.opened", points: 1 }));
    out.H5 = { cap: 2, seeded, rulesAfterSeed: count, createRuleAfter: typeof create === "string" ? create : "created" };
  }
} catch (e) {
  out.fatal = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
} finally {
  for (let pass = 0; pass < 4; pass += 1) {
    const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (const tb of tables) for (const id of TENANTS) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id).catch(() => undefined);
  }
  for (const id of TENANTS) { await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => undefined); await P.tenant.delete({ where: { id } }).catch(() => undefined); }
  for (const id of USERS) { await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined); await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined); await P.user.delete({ where: { id } }).catch(() => undefined); }
  out.cleanup = {
    tenantsLeft: await P.tenant.count({ where: { id: { in: TENANTS } } }),
    usersLeft: await P.user.count({ where: { id: { in: USERS } } }),
    opsLeft: await P.opsEvent.count({ where: { tenantId: { in: TENANTS } } }),
    outboxLeft: await P.outboxEvent.count({ where: { tenantId: { in: TENANTS } } }),
    auditLeft: await P.auditLog.count({ where: { tenantId: { in: TENANTS } } }),
  };
  console.log(JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  await prisma.$disconnect();
  process.exit(0);
}

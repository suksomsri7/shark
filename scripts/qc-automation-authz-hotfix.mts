// QC — HOTFIX 2026-10-01 item 2: platform automation page `/app/settings/automation` — authz
//   service `src/lib/automation/service.ts` setRuleEnabled/deleteRule touch ONLY scope KANBAN rows of the caller's tenant
//   (MEMBER_TIER / MEMBER_JOURNEY / CRM rows and other tenants' rows = silent no-op, count 0, nothing thrown) ·
//   the page's actions (create/toggle/delete) require `automation.rule.create` (same key the AI proposal
//   `automation_create_rule` already demands for the same service) — OWNER/MANAGER pass, STAFF only with the key.
// QC DATABASE ONLY (.env.qc via scripts/acc-v2-env.mts) · own throwaway tenants `qc-hsan-authz-<rand>-{a,b}` · cleans to 0 rows.
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-automation-authz-hotfix.mts
// Note: ledger/wo-notes/hotfix-sanitize-2026-10-01.md §"Item 2 — automation page authz"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { readFileSync } from "node:fs";
const { prisma } = await import("@/lib/core/db");
const svc = (await import("@/lib/automation/service" as string)) as Record<string, (...a: Any[]) => Any>;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const P = prisma as Any;
const TAG = `qc-hsan-authz-${Math.random().toString(36).slice(2, 8)}`;
const tenants: string[] = [];
try {
  const tA = await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } }); tenants.push(tA.id);
  const tB = await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } }); tenants.push(tB.id);
  const mk = (tenantId: string, scope: string, name: string) =>
    P.automationRule.create({ data: { tenantId, name, event: "pos.sale.paid", actionType: "NOTIFY", actionConfig: {}, scope, enabled: true } });
  const kA = await mk(tA.id, "KANBAN", "QC kanban A");
  const jA = await mk(tA.id, "MEMBER_JOURNEY", "QC journey A");
  const tierA = await mk(tA.id, "MEMBER_TIER", "QC tier A");
  const crmA = await mk(tA.id, "CRM", "QC crm A");
  const kB = await mk(tB.id, "KANBAN", "QC kanban B");
  const ctxA = { tenantId: tA.id };
  const row = (id: string) => P.automationRule.findUnique({ where: { id } });

  // ═══ S1 setRuleEnabled ═══
  const others = [jA, tierA, crmA];
  const errs1: unknown[] = [];
  for (const r of others) errs1.push(await fails(() => svc.setRuleEnabled(ctxA, r.id, false)));
  const after1 = await Promise.all(others.map((r) => row(r.id)));
  chk("HZ-S1.1", "setRuleEnabled(tenant A, id of a MEMBER_JOURNEY / MEMBER_TIER / CRM rule of A) → nothing changes (enabled stays true) and nothing is thrown (no existence oracle)",
    after1.every((r: Any) => r?.enabled === true) && errs1.every((e) => e === null), "all enabled, no throw", `${after1.map((r: Any) => r?.enabled).join(",")} errs=${errs1.map((e) => (e ? (e as Error).message.slice(0, 40) : "-")).join("|")}`);
  const eB = await fails(() => svc.setRuleEnabled(ctxA, kB.id, false));
  chk("HZ-S1.2", "setRuleEnabled(tenant A, KANBAN rule of tenant B) → B's rule untouched · no throw", (await row(kB.id))?.enabled === true && eB === null, "untouched", `enabled=${(await row(kB.id))?.enabled} err=${eB?.message?.slice(0, 60)}`);
  const eX = await fails(() => svc.setRuleEnabled(ctxA, "does-not-exist", false));
  chk("HZ-S1.3", "setRuleEnabled(unknown id) → no throw (same outcome as a foreign/other-scope id)", eX === null, "no throw", String(eX?.message).slice(0, 80), "MAJOR");
  await svc.setRuleEnabled(ctxA, kA.id, false);
  const kOff = await row(kA.id);
  await svc.setRuleEnabled(ctxA, kA.id, true);
  const kOn = await row(kA.id);
  chk("HZ-S1.4", "positive control: setRuleEnabled on A's own KANBAN rule switches it off and on again", kOff?.enabled === false && kOn?.enabled === true, "false→true", `${kOff?.enabled}→${kOn?.enabled}`);

  // ═══ S2 deleteRule ═══
  const errs2: unknown[] = [];
  for (const r of others) errs2.push(await fails(() => svc.deleteRule(ctxA, r.id)));
  errs2.push(await fails(() => svc.deleteRule(ctxA, kB.id)));
  const still = await P.automationRule.count({ where: { id: { in: [...others.map((r) => r.id), kB.id] } } });
  chk("HZ-S2.1", "deleteRule(tenant A, journey/tier/CRM id of A or KANBAN id of B) → all 4 rows still exist · nothing thrown", still === 4 && errs2.every((e) => e === null), "4 rows, no throw", `rows=${still} errs=${errs2.filter(Boolean).length}`);
  const eD = await fails(() => svc.deleteRule(ctxA, "does-not-exist"));
  chk("HZ-S2.2", "deleteRule(unknown id) → no throw", eD === null, "no throw", String(eD?.message).slice(0, 80), "MAJOR");
  await svc.deleteRule(ctxA, kA.id);
  chk("HZ-S2.3", "positive control: deleteRule on A's own KANBAN rule removes it", (await row(kA.id)) === null, "gone", "still there");

  // ═══ S3 listRules unchanged ═══
  const kA2 = await mk(tA.id, "KANBAN", "QC kanban A2");
  const list = await svc.listRules(ctxA);
  chk("HZ-S3.1", "listRules(A) = A's KANBAN rules only (no journey/tier/CRM, nothing of B)", list.length === 1 && list[0]?.id === kA2.id, "[kA2]", JSON.stringify(list.map((r: Any) => r.name)), "MAJOR");

  // ═══ S4 permission gate (pure) ═══
  const can = svc.canManageShopAutomation as (m: Any) => boolean;
  const m = (role: string, permissions: Record<string, unknown> = {}) => ({ role, unitAccess: ["*"], permissions });
  const gate = typeof can === "function"
    ? [can(m("OWNER")), can(m("MANAGER")), can(m("STAFF")), can(m("STAFF", { "automation.rule.create": true })), can(m("STAFF", { "automation.*": true })), can(m("STAFF", { "kanban.automation.manage": true })), can(null)]
    : [];
  chk("HZ-S4.1", "canManageShopAutomation(m): OWNER ✓ · MANAGER ✓ · STAFF ✗ · STAFF+automation.rule.create ✓ · STAFF+automation.* ✓ · STAFF+kanban.automation.manage ✗ · null ✗",
    JSON.stringify(gate) === JSON.stringify([true, true, false, true, true, false, false]), "[t,t,f,t,t,f,f]", JSON.stringify(gate));

  // ═══ S5 actions wiring (static — server actions need a session) ═══
  const src = readFileSync("src/lib/automation/actions.ts", "utf8");
  const body = (fn: string) => { const i = src.indexOf(`export async function ${fn}`); const j = src.indexOf("export async function", i + 10); return i < 0 ? "" : src.slice(i, j < 0 ? undefined : j); };
  const gated = (fn: string, call: string) => { const b = body(fn); const g = Math.max(b.indexOf("canManageShopAutomation("), b.indexOf("mayManage(")); const c = b.indexOf(`${call}(`); return g > 0 && c > g; };
  chk("HZ-S5.1", "createRuleAction / toggleRuleAction / deleteRuleAction each check canManageShopAutomation (directly or via mayManage) BEFORE createRule / setRuleEnabled / deleteRule",
    gated("createRuleAction", "createRule") && gated("toggleRuleAction", "setRuleEnabled") && gated("deleteRuleAction", "deleteRule"), "all 3 gated",
    `create=${gated("createRuleAction", "createRule")} toggle=${gated("toggleRuleAction", "setRuleEnabled")} delete=${gated("deleteRuleAction", "deleteRule")}`);
  const ssrc = readFileSync("src/lib/automation/service.ts", "utf8");
  chk("HZ-S5.2", "service writers use updateMany/deleteMany with `scope: \"KANBAN\"` (no unique update/delete by bare id left)",
    /automationRule\.updateMany\(\{\s*where:\s*\{\s*id,\s*scope:\s*"KANBAN"/.test(ssrc) && /automationRule\.deleteMany\(\{\s*where:\s*\{\s*id,\s*scope:\s*"KANBAN"/.test(ssrc) && !/automationRule\.(update|delete)\(/.test(ssrc),
    "scoped *Many", "unscoped write found", "MAJOR");
} catch (e) {
  chk("CRASH", "finished", false, "finished", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    if (tenants.length) {
      await P.automationRule.deleteMany({ where: { tenantId: { in: tenants } } });
      await P.tenant.deleteMany({ where: { id: { in: tenants } } });
    }
    const left = await P.automationRule.count({ where: { tenantId: { in: tenants } } }) + await P.tenant.count({ where: { slug: { startsWith: TAG } } });
    chk("HZ-CLEAN", "cleanup → 0 rows of this run left (rules + tenants)", left === 0, "0", String(left), "MAJOR");
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 160)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC hotfix automation authz =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

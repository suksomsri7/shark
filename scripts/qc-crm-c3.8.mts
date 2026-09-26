// QC — CRM v2 WO C3.8: REST + AI, third set (~16 ops → registry ≥ 117) · complete manifest (32 tools) · generated docs · webhooks complete ·
//      skill parity (F13.9 of the brief) · dynamic records for every custom object · SMOKE EVERY OP · X2 full matrix from the registry
// Oracle writer · the C3.8 builder must NOT touch this file · QC3 database only (.env.qc3 through scripts/qc3.sh)
// Run: bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c3.8.mts
//      `--force-run` = run every check while C3.8 is absent — its checks go red for the right reason (op/manifest/records-dynamic
//                      missing), the fixtures, the registry-wide regression probes and CLEAN run green
// requires: crm-seed   (the SEEDED shop is READ ONLY: K.1 resolves it by the CQC contract (slug + e-mails), S3.1 reads its custom objects
//                       through `objectValueSchema` / `crmObjectsOpenApi` — no row of the seed is written · every write lives in the
//                       throwaway tenants `qc-c38-<rand>-{a,b}` swept in finally)
//
// SOURCES: CRM-RUN §2 "C3.8" (20 = op coverage 1 · portal ops under a portal session 4 · records dynamic for every object 3 · manifest 32
//   tools 2 · docs == generator 1 · webhooks complete 2 · skill F13.9 1 · smoke every op 6) · crm-brief-C3.6-C3.9.md (C3.8 + its addendum —
//   the op names/paths below are ORACLE-PROPOSED there) · crm-brief-C3.4.md addendum (the 9 new tools → 32; crm_reports /
//   crm_quota_progress / crm_commissions_mine sit on ops of THIS set) · RESOLUTIONS (R-C.3 key filters · R-C.5 portal lane · R-E.4 tool
//   split · R-E.14 uiVersion 1 ⇒ 409) · MASTER-PLAN §4 · src/lib/modules/crm/api/{registry,dispatch,op,openapi,tools,portal-lane,
//   webhook-events,config,rate}.ts · scripts/gen-crm-api-docs.mts · scripts/qc-crm-c1.10.mts + qc-crm-c2.11.mts (house method).
//
// ══════════════════════════════════ CONTRACT (oracle-proposed — controller to confirm; the builder implements exactly this) ══════════════════════
//   A. 16 NEW OPS (every one `test: "C3.8-…"` of THIS file · strict input · Thai label · ASCII summary · lists `{items,nextCursor}` take ≤ 100):
//        reports.get              GET  /reports/{tab}                     crm.report.view        read   (rate report · tool crm_reports — C3.4)
//        reports.export.start     POST /reports/{tab}/export              crm.report.view        danger (C3.1 export lane · crm.admin key only)
//        reports.export.get       GET  /reports/exports/{jobId}           crm.report.view        read   (requester only · signed /api/files link)
//        quotas.list              GET  /quotas                            crm.report.view        read
//        quotas.set               PUT  /quotas                            crm.quota.manage       write
//        quotas.progress          GET  /quotas/progress                   crm.report.view        read   (tool crm_quota_progress — C3.4)
//        commissions.mine         GET  /commissions/mine                  crm.commission.view    read   (tool crm_commissions_mine — C3.4)
//        commissions.list         GET  /commissions                       crm.commission.view    read
//        commissions.approve      POST /commissions/{id}/approve          crm.commission.approve write
//        commissions.reject       POST /commissions/{id}/reject           crm.commission.approve danger
//        portal.access.list       GET  /companies/{id}/portal-access      crm.portal.manage      read   (staff side of the portal — NOT /portal/*)
//        portal.invite            POST /companies/{id}/portal-invites     crm.portal.manage      write
//        portal.revoke            POST /portal-access/{id}/revoke         crm.portal.manage      danger
//        objects.schema.get       GET  /objects/{key}/schema              crm.record.read        read   (records-dynamic.ts)
//        integrations.status      GET  /integrations                      crm.settings.manage    read
//        integrations.targets.set PUT  /integrations/targets              crm.settings.manage    write
//      counted as well when present (created by C3.4): deals.atRisk.list · activities.taskCard.open. Registry total ≥ 117.
//   B. `src/lib/modules/crm/api/ops/records-dynamic.ts` exports RECORDS_DYNAMIC_OPS · objectValueSchema(ctx, actor, objectKey) → JSON schema of
//      the object's live fields (sensitive fields only for actors that may see them) · crmObjectsOpenApi({tenantId, systemId}) →
//      { paths: { "/objects/<key>/records": …, "/objects/<key>/records/{id}": … }, objects: [{ key, fields[] }] }. The openapi.json route
//      merges those concrete paths when called WITH a valid CRM key (without a key: the static doc, no tenant data).
//   C. `src/lib/modules/crm/api/manifest.ts` exports crmManifest() → { version, ops[{id,method,path,kind,action,tool?}], portalOps[…],
//      tools[{name,opId,write,danger}], webhookEvents[], internalEvents[] } (pure, from the registries) · route
//      `src/app/api/v1/crm/manifest.json/route.ts` (no key, like openapi.json) · `CRM_INTERNAL_EVENTS` exported by webhook-events.ts
//      (consumer-only flag events that are deliberately NOT offered to webhooks) · buildOpenApi() carries `x-shark-webhooks` = crmWebhookEvents().
//   D. docs/api/CRM-API.md 100 % generated (renderDocs) incl. a portal-lane section (every PORTAL_OPS path) and the webhook list ·
//      `.claude/skills/shark-crm-api/SKILL.md` (name: shark-crm-api, names all 32 tools) + references/endpoints.md == renderEndpointsReference()
//      which lists CRM_OPS AND PORTAL_OPS.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// CHECK INVENTORY (20 contract + X): K.1 · S1.1 · S2.1–S2.4 · S3.1–S3.3 · S4.1–S4.2 · S5.1 · S6.1–S6.2 · S7.1 · S8.1–S8.6 ·
//   X1.1 · X2.1–X2.2 · X3.1 · X6.1 · X8.1–X8.2 · X9.1 · U.1 · CLEAN  (C3.8-FATAL only when something throws).
//   n/a: X4/X5 (no consumer/cron in this WO) · X7 (public endpoints are C3.9's; the portal/API limiter is S8.6) · X10 (export links = C3.9 S4).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const API_DIR = "src/lib/modules/crm/api";
const RD_FILE = `${API_DIR}/ops/records-dynamic.ts`;
const MANIFEST_FILE = `${API_DIR}/manifest.ts`;
const ROUTE_SPEC = "@/app/api/v1/crm/[...path]/route";
const OA_SPEC = "@/app/api/v1/crm/openapi.json/route";
const MAN_ROUTE_SPEC = "@/app/api/v1/crm/manifest.json/route";
const DOC_FILE = "docs/api/CRM-API.md";
const SKILLS_FILE = "src/lib/ai/skills.ts";
const SKILL_DIR = ".claude/skills/shark-crm-api";
const SKILL_MD = `${SKILL_DIR}/SKILL.md`;
const SKILL_REF = `${SKILL_DIR}/references/endpoints.md`;
const TOOLS_FILE = `${API_DIR}/tools.ts`;
const EXPECTED = "scripts/crm-expected.json";

const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes("--force-run");
const read = (p: string) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");
const walk = (dir: string, re = /\.(ts|tsx|mts)$/): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, re));
    else if (re.test(name)) out.push(p);
  }
  return out.sort();
};

type Must = { id: string; m: string; p: string; action: string; kind: "read" | "write" | "danger" };
const MUST: Must[] = [
  { id: "reports.get", m: "GET", p: "/reports/{tab}", action: "crm.report.view", kind: "read" },
  { id: "reports.export.start", m: "POST", p: "/reports/{tab}/export", action: "crm.report.view", kind: "danger" },
  { id: "reports.export.get", m: "GET", p: "/reports/exports/{jobId}", action: "crm.report.view", kind: "read" },
  { id: "quotas.list", m: "GET", p: "/quotas", action: "crm.report.view", kind: "read" },
  { id: "quotas.set", m: "PUT", p: "/quotas", action: "crm.quota.manage", kind: "write" },
  { id: "quotas.progress", m: "GET", p: "/quotas/progress", action: "crm.report.view", kind: "read" },
  { id: "commissions.mine", m: "GET", p: "/commissions/mine", action: "crm.commission.view", kind: "read" },
  { id: "commissions.list", m: "GET", p: "/commissions", action: "crm.commission.view", kind: "read" },
  { id: "commissions.approve", m: "POST", p: "/commissions/{id}/approve", action: "crm.commission.approve", kind: "write" },
  { id: "commissions.reject", m: "POST", p: "/commissions/{id}/reject", action: "crm.commission.approve", kind: "danger" },
  { id: "portal.access.list", m: "GET", p: "/companies/{id}/portal-access", action: "crm.portal.manage", kind: "read" },
  { id: "portal.invite", m: "POST", p: "/companies/{id}/portal-invites", action: "crm.portal.manage", kind: "write" },
  { id: "portal.revoke", m: "POST", p: "/portal-access/{id}/revoke", action: "crm.portal.manage", kind: "danger" },
  { id: "objects.schema.get", m: "GET", p: "/objects/{key}/schema", action: "crm.record.read", kind: "read" },
  { id: "integrations.status", m: "GET", p: "/integrations", action: "crm.settings.manage", kind: "read" },
  { id: "integrations.targets.set", m: "PUT", p: "/integrations/targets", action: "crm.settings.manage", kind: "write" },
];
const C34_OPS = ["deals.atRisk.list", "activities.taskCard.open"];
const TOOLS_TOTAL = 32;
const OPS_MIN = 117;
// every test id a C3.8 op may carry (fitness F13.10 finds the literals here)
const TEST_IDS = [
  "C3.8-K.1", "C3.8-S1.1", "C3.8-S2.1", "C3.8-S2.2", "C3.8-S2.3", "C3.8-S2.4", "C3.8-S3.1", "C3.8-S3.2", "C3.8-S3.3", "C3.8-S4.1", "C3.8-S4.2",
  "C3.8-S5.1", "C3.8-S6.1", "C3.8-S6.2", "C3.8-S7.1", "C3.8-S8.1", "C3.8-S8.2", "C3.8-S8.3", "C3.8-S8.4", "C3.8-S8.5", "C3.8-S8.6",
  "C3.8-X1.1", "C3.8-X2.1", "C3.8-X2.2", "C3.8-X3.1", "C3.8-X6.1", "C3.8-X8.1", "C3.8-X8.2", "C3.8-X9.1", "C3.8-U.1",
];

// ═══════════════════════════ SKIP guard (no DB connection before it) ═══════════════════════════
const BUILT = existsSync(RD_FILE) && existsSync(MANIFEST_FILE);
if (!FORCE && !BUILT) {
  console.log(`⚠️  SKIPPED — WO C3.8 not built yet (${existsSync(RD_FILE) ? "" : RD_FILE + " absent "}${existsSync(MANIFEST_FILE) ? "" : MANIFEST_FILE + " absent"}) (run with --force-run to exercise fixtures, registry-wide probes and cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c38-${rand}`;

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const cut = (v: unknown, n = 240) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const thai = (s: unknown) => /[ก-๙]/.test(String(s ?? ""));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
type Res = { ok: boolean; v: Any; err: string; code: string; msg: string };
const MISSING: Res = { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", msg: "" };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return MISSING;
  try { return { ok: true, v: await fn(...args), err: "", code: "", msg: "" }; } catch (e) {
    const x = e as Any; const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), msg };
  }
};
const ABSENT = BUILT ? "" : " · [C3.8 ABSENT]";
const TENANTS: string[] = [];
const USERS: string[] = [];
const KEY_IDS: string[] = [];
const PII: string[] = [];
const pii = <T extends string>(s: T): T => { PII.push(s); return s; };
let docSnapshot: string | null = null;
let skillRefSnapshot: string | null = null;
let seq = 0;
const nx = () => `${++seq}`;
/** Thai (B.E.) month key of now in +07:00 — the periodKey shape of CrmQuota/CrmCommission ("2569-09") */
const BE_MONTH = (() => { const d = new Date(Date.now() + 7 * 3_600_000); return `${d.getUTCFullYear() + 543}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; })();

console.log(`\n═══ QC CRM v2 · C3.8 — REST + AI third set · manifest · docs · smoke every op ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !BUILT ? " · --force-run with C3.8 ABSENT (its checks expected red; fixtures + CLEAN green)" : ""}\n`);

try {
  docSnapshot = read(DOC_FILE) || null;
  skillRefSnapshot = read(SKILL_REF) || null;
  const REG = (await import("@/lib/modules/crm/api/registry" as string).catch(() => ({}))) as Any;
  const TOOLS = (await import("@/lib/modules/crm/api/tools" as string).catch(() => ({}))) as Any;
  const WHE = (await import("@/lib/modules/crm/api/webhook-events" as string).catch(() => ({}))) as Any;
  const WHL = (await import("@/lib/webhooks/labels" as string).catch(() => ({}))) as Any;
  const OAM = (await import("@/lib/modules/crm/api/openapi" as string).catch(() => ({}))) as Any;
  const PL = (await import("@/lib/modules/crm/api/portal-lane" as string).catch(() => ({}))) as Any;
  const ACT = (await import("@/lib/modules/crm/api/actor" as string).catch(() => ({}))) as Any;
  const RATE = (await import("@/lib/modules/crm/api/rate" as string).catch(() => ({}))) as Any;
  const RD = (await import("@/lib/modules/crm/api/ops/records-dynamic" as string).catch(() => ({}))) as Any;
  const MAN = (await import("@/lib/modules/crm/api/manifest" as string).catch(() => ({}))) as Any;
  const ROUTE = (await import(ROUTE_SPEC as string).catch(() => ({}))) as Any;
  const OA_ROUTE = (await import(OA_SPEC as string).catch(() => ({}))) as Any;
  const MAN_ROUTE = (await import(MAN_ROUTE_SPEC as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const AK = (await import("@/lib/api-keys/service" as string).catch(() => ({}))) as Any;
  const SC = (await import("@/lib/api-keys/scopes" as string).catch(() => ({}))) as Any;
  const SF = (await import("@/lib/modules/member/session-facade" as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const ACC = (await import("@/lib/modules/crm/access" as string).catch(() => ({}))) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;

  const OPS: Any[] = Array.isArray(REG.CRM_OPS) ? (REG.CRM_OPS as Any[]) : [];
  const PORTAL_OPS: Any[] = Array.isArray(PL.PORTAL_OPS) ? (PL.PORTAL_OPS as Any[]) : [];
  const byId = new Map(OPS.map((o) => [String(o.id), o]));
  const toolInfos = (): Any[] => { try { return (TOOLS.crmToolInfos?.() ?? []) as Any[]; } catch { return []; } };
  const toolNames = (): string[] => toolInfos().map((t) => String(t.name));
  const webhookEvents = (): string[] => { try { return (WHE.crmWebhookEvents?.() ?? []) as string[]; } catch { return []; } };
  const jsonSchema = (op: Any): Any => { try { return op?.input && typeof OAM.jsonSchemaOf === "function" ? OAM.jsonSchemaOf(op.input, "input") : null; } catch { return null; } };
  console.log(`[registry] CRM_OPS=${OPS.length} · PORTAL_OPS=${PORTAL_OPS.length} · tools=${toolNames().length} · webhook events=${webhookEvents().length}`);

  // ═════════════════════════════════ K.1 — seed control (read-only) ═════════════════════════════════
  const EXP = JSON.parse(read(EXPECTED) || "{}") as Any;
  const CQ = ((await import("./crm-qc-env.mts" as string).catch(() => ({}))) as Any).CQC ?? {};
  const seedTenant = (await P.tenant.findFirst({ where: { slug: String(CQ.tenantSlug ?? "siam-dive-member-qc") } })) as Any;
  const seedT = String(seedTenant?.id ?? "");
  const seedSys = seedT ? ((await P.appSystem.findFirst({ where: { tenantId: seedT, type: "CRM" }, orderBy: { createdAt: "asc" } })) as Any) : null;
  const seedS = String(seedSys?.id ?? "");
  const seedOwnerU = (await P.user.findFirst({ where: { email: String(EXP.users?.owner?.email ?? "mb-owner@shark.local") } })) as Any;
  const seedObjects = seedS ? ((await P.customObject.findMany({ where: { systemId: seedS, archivedAt: null }, select: { key: true } })) as Any[]) : [];
  chk("C3.8-K.1", "seed control: the seeded shop resolves on THIS database by the CQC contract (slug · owner e-mail) with a CRM system and ≥ 1 live custom object (S3.1 has something to enumerate)",
    !!seedSys && !!seedOwnerU && seedObjects.length >= 1, "seed as assumed", `tenant=${!!seedTenant} crm=${!!seedSys} owner=${!!seedOwnerU} objects=${seedObjects.length}`, "MAJOR");

  // ═════════════════════════════════ S1.1 — op coverage ═════════════════════════════════
  {
    const qcSrc = walk("scripts", /^qc-crm-.*\.mts$/).map(read).join("\n");
    const untested = [...OPS, ...PORTAL_OPS].filter((o) => !o.test || !qcSrc.includes(`"${o.test}"`)).map((o) => String(o.id));
    const missing = MUST.filter((m) => !byId.has(m.id)).map((m) => m.id);
    const wrong: string[] = [];
    for (const m of MUST) {
      const o = byId.get(m.id) as Any;
      if (!o) continue;
      if (String(o.method) !== m.m || String(o.path) !== m.p || String(o.action) !== m.action || String(o.kind) !== m.kind) wrong.push(`${m.id}:${o.method} ${o.path} ${o.action} ${o.kind}`);
      if (!TEST_IDS.includes(String(o.test ?? ""))) wrong.push(`${m.id}:test=${o.test}`);
    }
    const mp = OPS.map((o) => `${o.method} ${String(o.path).replace(/\{[^}]+\}/g, "{}")}`);
    const dup = mp.length - new Set(mp).size;
    chk("C3.8-S1.1", `op coverage: the LIVE registry holds ≥ ${OPS_MIN} ops (today ${OPS.length}) incl. the 16 C3.8 ops with the exact method/path/action/kind of the contract and a C3.8 test id, every op of CRM_OPS ∪ PORTAL_OPS carries a test id that exists in a qc-crm-*.mts file (F13.10), no duplicate METHOD path`,
      OPS.length >= OPS_MIN && missing.length === 0 && wrong.length === 0 && untested.length === 0 && dup === 0,
      `≥ ${OPS_MIN} · 16 · tested · unique`, `ops=${OPS.length} missing=${cut(missing.join(","), 200) || "-"} wrong=${cut(wrong.join(" | "), 160) || "-"} untested=${cut(untested.join(","), 160) || "-"} dup=${dup} c34=${C34_OPS.filter((x) => byId.has(x)).join(",") || "-"}${ABSENT}`);
  }

  // ═════════════════════════════════ SETUP — tenants A/B · systems · users · keys · rows ═════════════════════════════════
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id); return u.id as string;
  };
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id); return t.id as string;
  };
  const setCrm = (sysId: string, obj: Record<string, unknown>) => P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`, JSON.stringify(obj), sysId);
  const STAFF_PERMS = Object.fromEntries(((ACC.CRM_ROLE_DEFAULTS?.STAFF ?? ["crm.contact.read", "crm.deal.read", "crm.activity.read", "crm.record.read", "crm.report.view"]) as string[]).map((k) => [k, true]));
  const uOwner = await mkUser("");
  const uThana = await mkUser("-thana");
  const uNok = await mkUser("-nok");
  const T = await mkTenant("a");
  const TB = await mkTenant("b");
  await P.membership.create({ data: { userId: uOwner, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: uThana, tenantId: T, role: "STAFF", unitAccess: ["*"], permissions: STAFF_PERMS, acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: uNok, tenantId: T, role: "STAFF", unitAccess: ["*"], permissions: STAFF_PERMS, acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: uOwner, tenantId: TB, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const mkSys = async (tid: string, label: string) => (await sysSvc.createSystem(tid, "CRM", `${label} ${TAG}`)).id as string;
  const S = await mkSys(T, "CRM");
  const S2 = await mkSys(T, "CRM สอง");
  const SV = await mkSys(T, "CRM v1");
  const SB = await mkSys(TB, "CRM B");
  const PORTAL_SETTINGS = { enabled: true, loginMethods: ["EMAIL_OTP"], showDeals: true, allowIssue: true, issueBoardId: null };
  await setCrm(S, { uiVersion: 2, bridgesEnabled: true, portal: PORTAL_SETTINGS });
  await setCrm(S2, { uiVersion: 2 });
  await setCrm(SV, { uiVersion: 1 });
  await setCrm(SB, { uiVersion: 2 });
  const owner = { userId: uOwner, role: "OWNER", unitAccess: ["*"], permissions: {} as Record<string, unknown> };
  const thana = { userId: uThana, role: "STAFF", unitAccess: ["*"], permissions: STAFF_PERMS };
  const cS = { tenantId: T, systemId: S, actorUserId: uOwner };
  const teamP = (await P.team.create({ data: { tenantId: T, name: `ภูเก็ต ${TAG}` } })).id as string;
  const teamK = (await P.team.create({ data: { tenantId: T, name: `กระบี่ ${TAG}` } })).id as string;
  await P.teamMember.create({ data: { tenantId: T, teamId: teamP, userId: uThana, role: "MEMBER" } });
  await P.teamMember.create({ data: { tenantId: T, teamId: teamK, userId: uNok, role: "LEAD" } });

  const SECRET_BODY = `เนื้ออีเมลลับ ${TAG}`;
  type Row = { id: string; partyId: string };
  const mkContact = async (tid: string, sid: string, o: { owner?: string; team?: string | null; tag: string }): Promise<Row> => {
    const name = pii(`คุณ${o.tag} ${TAG}`);
    const phone = pii(`08${String(10_000_000 + Number(nx()) * 7919).slice(0, 8)}`);
    const email = pii(`${o.tag}${nx()}.${rand}@qc.invalid`);
    const partyId = (await P.party.create({ data: { tenantId: tid, name, kind: "PERSON" } })).id as string;
    const c = await P.crmContact.create({ data: { tenantId: tid, systemId: sid, name, firstName: name, phone, email, partyId, ownerUserId: o.owner ?? null, teamId: o.team ?? null } });
    return { id: c.id as string, partyId };
  };
  const mkCompany = async (tid: string, sid: string, name: string, team: string | null = null): Promise<string> => {
    const partyId = (await P.party.create({ data: { tenantId: tid, name, kind: "COMPANY" } })).id as string;
    return (await P.crmCompany.create({ data: { tenantId: tid, systemId: sid, partyId, name, teamId: team } })).id as string;
  };
  const mkPipe = async (tid: string, sid: string) => (await P.crmPipeline.create({
    data: { tenantId: tid, systemId: sid, name: `ขาย ${TAG}`, stages: { create: [{ tenantId: tid, systemId: sid, name: "ใหม่", kind: "OPEN", probability: 10, sortOrder: 0 }, { tenantId: tid, systemId: sid, name: "เสนอ", kind: "OPEN", probability: 50, sortOrder: 1 }, { tenantId: tid, systemId: sid, name: "ชนะ", kind: "WON", probability: 100, sortOrder: 2 }] } },
    include: { stages: true },
  })) as Any;
  const stagesOf = (p: Any) => [...(p.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => String(s.id));
  const mkDeal = async (tid: string, sid: string, contactId: string, pipe: Any, o: { owner?: string; team?: string | null; companyId?: string | null; title: string }) =>
    (await P.crmDeal.create({ data: { tenantId: tid, systemId: sid, contactId, pipelineId: pipe.id, stageId: stagesOf(pipe)[0], title: o.title, valueSatang: 250_000, ownerUserId: o.owner ?? null, teamId: o.team ?? null, companyId: o.companyId ?? null } })).id as string;
  const mkActivity = async (tid: string, sid: string, contactId: string, dealId: string | null, ownerId: string | null) =>
    (await P.crmActivity.create({ data: { tenantId: tid, systemId: sid, contactId, dealId, type: "TASK", title: `งาน ${TAG}-${nx()}`, ownerUserId: ownerId, dueAt: new Date(Date.now() + 86_400_000) } })).id as string;
  const mkEmail = async (tid: string, sid: string, contactId: string, threadKey: string) => {
    await P.crmEmailMessage.create({ data: { tenantId: tid, systemId: sid, contactId, direction: "OUT", messageId: `<${TAG}-${nx()}@qc.invalid>`, threadKey, fromAddr: `shop.${rand}@qc.invalid`, toAddrs: [`to.${rand}@qc.invalid`], subject: `เรื่อง ${TAG}`, bodyHtml: `<p>${SECRET_BODY}</p>`, bodyText: SECRET_BODY, snippet: "สวัสดี", status: "SENT", sentAt: new Date(), trackTokenHash: sha(`${TAG}-${nx()}`) } });
  };

  // tenant A · system S — the main row set I (phuket, owner) + krabi rows + sacrificial set
  const pipeA = await mkPipe(T, S);
  const kA = await mkContact(T, S, { owner: uThana, team: teamP, tag: "เอ" });
  const kA2 = await mkContact(T, S, { owner: uThana, team: teamP, tag: "เอสอง" });
  const coA = await mkCompany(T, S, `บริษัทเอ ${TAG}`, teamP);
  const coB = await mkCompany(T, S, `บริษัทบี ${TAG}`, teamK);
  const kB = await mkContact(T, S, { owner: uNok, team: teamK, tag: "บี" });
  const kC = await mkContact(T, S, { owner: uThana, team: teamP, tag: "ซี" });
  for (const [co, k] of [[coA, kA.id], [coA, kC.id], [coB, kB.id]] as const) await P.crmCompanyContact.create({ data: { tenantId: T, companyId: co, contactId: k, isPrimary: true } });
  const dA = await mkDeal(T, S, kA.id, pipeA, { owner: uThana, team: teamP, companyId: coA, title: `ดีลภูเก็ต ${TAG}` });
  const dK = await mkDeal(T, S, kB.id, pipeA, { owner: uNok, team: teamK, companyId: coB, title: `ดีลกระบี่ลับ ${TAG}` });
  const aA = await mkActivity(T, S, kA.id, dA, uThana);
  const THREAD = `${TAG}-thread`;
  await mkEmail(T, S, kA.id, THREAD);
  // sacrificial rows (destructive smoke: archive · delete · merge · revoke)
  const kX = await mkContact(T, S, { owner: uThana, team: teamP, tag: "เอ็กซ์" });
  const kX2 = await mkContact(T, S, { owner: uThana, team: teamP, tag: "เอ็กซ์สอง" });
  const coX = await mkCompany(T, S, `บริษัทเอ็กซ์ ${TAG}`, teamP);
  const coX2 = await mkCompany(T, S, `บริษัทเอ็กซ์สอง ${TAG}`, teamP);
  await P.crmCompanyContact.create({ data: { tenantId: T, companyId: coX, contactId: kX.id, isPrimary: true } });
  const dX = await mkDeal(T, S, kX.id, pipeA, { owner: uThana, team: teamP, companyId: coX, title: `ดีลเสียสละ ${TAG}` });
  const aX = await mkActivity(T, S, kX.id, dX, uThana);
  const teamX = (await P.team.create({ data: { tenantId: T, name: `ทีมเสียสละ ${TAG}` } })).id as string;
  // commission rows (raw — no FK to deal; C3.3 service may be absent)
  const mkCommission = async (dealId: string, userId: string) => {
    try { return (await P.crmCommission.create({ data: { tenantId: T, systemId: S, dealId, ruleId: `${TAG}-rule`, userId, amountSatang: BigInt(5_000), basisSatang: BigInt(250_000), basis: "PAID", status: "PENDING", periodKey: BE_MONTH, refType: "DEAL_PAYMENT", refId: `${TAG}-${nx()}` } })).id as string; } catch (e) { console.log(`  [setup] commission row: ${cut((e as Error).message, 120)}`); return ""; }
  };
  const cmA = await mkCommission(dA, uThana);
  const cmX = await mkCommission(dX, uThana);
  // other CRM system in the same tenant (X1) + tenant B (cross-tenant)
  const pipeS2 = await mkPipe(T, S2);
  const kS2 = await mkContact(T, S2, { owner: uOwner, tag: "สองระบบ" });
  const coS2 = await mkCompany(T, S2, `บริษัทระบบสอง ${TAG}`);
  const dS2 = await mkDeal(T, S2, kS2.id, pipeS2, { owner: uOwner, title: `ดีลระบบสองลับ ${TAG}` });
  const aS2 = await mkActivity(T, S2, kS2.id, dS2, uOwner);
  const pipeB = await mkPipe(TB, SB);
  const kBB = await mkContact(TB, SB, { owner: uOwner, tag: "ร้านบี" });
  const teamBB = (await P.team.create({ data: { tenantId: TB, name: `ทีมร้านบีลับ ${TAG}` } })).id as string;
  const coBB = await mkCompany(TB, SB, `บริษัทร้านบีลับ ${TAG}`);
  const dBB = await mkDeal(TB, SB, kBB.id, pipeB, { owner: uOwner, title: `ดีลร้านบีลับ ${TAG}` });
  const aBB = await mkActivity(TB, SB, kBB.id, dBB, uOwner);
  const SECRET_FOREIGN = [`ดีลระบบสองลับ ${TAG}`, `ดีลร้านบีลับ ${TAG}`, `บริษัทร้านบีลับ ${TAG}`, `ทีมร้านบีลับ ${TAG}`];
  /** GET /contacts/by-party/{partyId} answers 200 with NO contact for a party it cannot see (C1.10 contract) — that is a refusal, not a leak */
  const emptyByParty = (o: Any, r: { status: number; body: Any }) => o.id === "contacts.byParty" && r.status === 200 && !r.body?.data?.contact && !r.body?.data?.id;
  // custom objects: from the templates (car = vehicle) + contract (COMPANY parent, portal-visible)
  const OB = (CRM?.objects ?? {}) as Any;
  const TPL = ((await import("@/lib/modules/crm/templates/objects" as string).catch(() => ({}))) as Any).OBJECT_TEMPLATES ?? [];
  const firstField = (tk: string) => String(((TPL as Any[]).find((t) => t.key === tk)?.sections?.[0]?.fields?.[0]?.key) ?? "name");
  const mkObject = async (sysCtx: Any, key: string, templateKey: string, parentType: string, portalVisible = false) =>
    call(OB.create, sysCtx, owner, { key, label: key, labelPlural: key, parentType, titleFieldKey: firstField(templateKey), templateKey, showAsTab: true, portalVisible });
  const objCar = await mkObject(cS, "car", "vehicle", "CONTACT");
  const objContract = await mkObject(cS, "contract", "contract", "COMPANY", true);
  const objCarS2 = await mkObject({ tenantId: T, systemId: S2, actorUserId: uOwner }, "car", "vehicle", "CONTACT");
  const objCarB = await mkObject({ tenantId: TB, systemId: SB, actorUserId: uOwner }, "car", "vehicle", "CONTACT");
  if (!objCar.ok) console.log(`  [setup] objects.create car: ${objCar.err}`);
  if (!objContract.ok) console.log(`  [setup] objects.create contract: ${objContract.err}`);
  // make every field of `contract` portal-visible (portal records need one visible field)
  await P.memberField.updateMany({ where: { tenantId: T, systemId: S, objectKey: "contract" }, data: { portalVisible: true } }).catch(() => undefined);

  // keys
  const bundles = (SC.API_SCOPE_BUNDLES ?? []) as Any[];
  const bundle = (id: string) => [...(((bundles.find((b) => b.id === id)?.scopes) ?? []) as string[])];
  const roScopes = bundle("crm.readonly");
  const opScopes = bundle("crm.operate");
  const adScopes = bundle("crm.admin");
  const KEY_ERR: Record<string, string> = {};
  type Key = { raw: string; id: string; scopes: string[] };
  const mkKey = async (tid: string, label: string, scopes: string[], systemId: string | null): Promise<Key> => {
    try { const k = await AK.createApiKey({ tenantId: tid }, `${TAG} ${label}`, { scopes, systemId, createdById: uOwner }); KEY_IDS.push(k.id); return { raw: String(k.rawKey), id: String(k.id), scopes }; }
    catch (e) { KEY_ERR[label] = e instanceof Error ? e.message : String(e); return { raw: "", id: "", scopes }; }
  };
  const kRO = await mkKey(T, "readonly", roScopes, S);
  const kOP = await mkKey(T, "operate", opScopes, S);
  const kAD = await mkKey(T, "admin", adScopes, S);
  const kTeam = await mkKey(T, "team-filter", [...opScopes, `crm.filter.team:${teamP}`], S);
  const kNone = await mkKey(T, "no-scope", [], S);
  const kOther = await mkKey(T, "other-module", ["member.customer.read"], S);
  const kFlood = await mkKey(T, "flood", adScopes, S);
  const kV1 = await mkKey(T, "admin-v1", adScopes, SV);

  type Resp = { status: number; body: Any; text: string; headers: Headers | null };
  let reqSeq = 0;
  const api = async (method: string, path: string, key: string | null, body?: unknown, opt: { idem?: string | null; auth?: string } = {}): Promise<Resp> => {
    const fn = (ROUTE as Any)?.[method];
    if (typeof fn !== "function") return { status: 0, body: { error: { code: "MISSING_ROUTE" } }, text: "MISSING_ROUTE", headers: null };
    const headers: Record<string, string> = { "user-agent": TAG, "x-forwarded-for": "203.0.113.38" };
    if (opt.auth) headers.authorization = opt.auth; else if (key) headers.authorization = `Bearer ${key}`;
    if (method !== "GET") {
      const idem = opt.idem === undefined ? `${TAG}-${(reqSeq += 1)}-${randomBytes(3).toString("hex")}` : opt.idem;
      if (idem) headers["idempotency-key"] = idem;
    }
    let b: string | undefined;
    if (body !== undefined && method !== "GET") { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const pathOnly = path.split("?")[0] ?? "";
    try {
      const res: Response = await fn(new Request(`http://qc.invalid/api/v1/crm${path}`, { method, headers, body: b }), { params: Promise.resolve({ path: pathOnly.split("/").filter(Boolean) }) });
      const text = await res.text();
      let parsed: Any = null;
      try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
      return { status: res.status, body: parsed, text, headers: res.headers };
    } catch (e) { return { status: -1, body: { error: { code: "THROWN", message: e instanceof Error ? e.message : String(e) } }, text: String(e), headers: null }; }
  };
  const ecode = (r: Resp) => String(r.body?.error?.code ?? "").toLowerCase();
  const dat = (r: Resp) => r.body?.data;
  const sr = (r: Resp) => `${r.status}${ecode(r) ? `/${ecode(r)}` : ""}`;
  const REASON = `เหตุผลทดสอบ ${TAG}`;

  // runtime fixtures through the API (admin key): record · sequence · enrollment · link · template · report export job
  const firstId = (r: Resp): string => {
    const d = dat(r);
    const items = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
    return String(d?.id ?? d?.jobId ?? d?.recordId ?? d?.enrollmentId ?? d?.accessId ?? items?.[0]?.id ?? "");
  };
  const fieldRows = async (sid: string, objectKey: string) => (await P.memberField.findMany({ where: { systemId: sid, objectKey, archivedAt: null } })) as Any[];
  const valueFor = (f: Any): unknown => {
    const t = String(f.type);
    const choices = (f.options?.choices ?? f.options?.options ?? []) as Any[];
    if (t === "NUMBER" || t === "MONEY") return Math.max(1, Math.ceil(Number(f.options?.min ?? 1)));
    if (t === "DATE") return "2026-09-26";
    if (t === "DATETIME") return new Date().toISOString();
    if (t === "BOOLEAN") return true;
    if (t === "SELECT") return String(choices[0]?.value ?? choices[0] ?? "");
    if (t === "MULTI_SELECT") return choices[0] ? [String(choices[0]?.value ?? choices[0])] : [];
    if (t === "FILE" || t === "LOOKUP") return undefined;
    return `ค่า ${TAG}`;
  };
  const valuesOf = async (sid: string, objectKey: string, all = false) => {
    const out: Record<string, unknown> = {};
    for (const f of await fieldRows(sid, objectKey)) { if (!all && !f.required && f.key !== firstField(objectKey === "car" ? "vehicle" : objectKey)) continue; const v = valueFor(f); if (v !== undefined && v !== "") out[String(f.key)] = v; }
    return out;
  };
  const recA = firstId(await api("POST", "/objects/car/records", kAD.raw, { parentId: kA.id, values: await valuesOf(S, "car", true) }));
  const recX = firstId(await api("POST", "/objects/car/records", kAD.raw, { parentId: kX.id, values: await valuesOf(S, "car", true) }));
  const recContractA = firstId(await api("POST", "/objects/contract/records", kAD.raw, { parentId: coA, values: await valuesOf(S, "contract", true) }));
  const recContractB = firstId(await api("POST", "/objects/contract/records", kAD.raw, { parentId: coB, values: await valuesOf(S, "contract", true) }));
  const recS2 = firstId(await api("POST", "/objects/car/records", (await mkKey(T, "admin-s2", adScopes, S2)).raw, { parentId: kS2.id, values: await valuesOf(S2, "car", true) }));
  const kADB = await mkKey(TB, "admin-b", adScopes, SB);
  const recBB = firstId(await api("POST", "/objects/car/records", kADB.raw, { parentId: kBB.id, values: await valuesOf(SB, "car", true) }));
  const seqR = await api("POST", "/sequences", kAD.raw, { name: `ลำดับ ${TAG}`, steps: [{ kind: "TASK", taskTitle: `โทร ${TAG}` }] });
  const seqId = firstId(seqR);
  const enrId = seqId ? firstId(await api("POST", `/sequences/${seqId}/enroll`, kAD.raw, { contactId: kX2.id })) : "";
  const linkId = firstId(await api("POST", "/tracking/links", kAD.raw, { url: "https://example.invalid/promo", name: `ลิงก์ ${TAG}` }));
  const tplR = await api("PUT", "/emails/templates", kAD.raw, { name: `แม่แบบ ${TAG}`, subject: "สวัสดี", bodyHtml: "<p>สวัสดี</p>" });
  const tplId = firstId(tplR) || String(((await P.crmEmailTemplate.findFirst({ where: { systemId: S } }).catch(() => null)) as Any)?.id ?? "");
  const jobId = firstId(await api("POST", "/reports/overview/export", kAD.raw, { confirm: true, reason: REASON }));
  // portal: accepted accesses + sessions (mint through the C3.5 helper; raw fallback = same hashing)
  const mkAccess = async (companyId: string, contactId: string, role = "VIEW") => (await P.crmPortalAccess.create({ data: { tenantId: T, systemId: S, companyId, contactId, role, acceptedAt: new Date(), loginMethods: ["EMAIL_OTP"] } })).id as string;
  const accA = await mkAccess(coA, kA.id, "APPROVE");
  const accC = await mkAccess(coA, kC.id);
  const accB = await mkAccess(coB, kB.id);
  const accX = await mkAccess(coX, kX.id);
  const mint = async (accessId: string, contactId: string): Promise<string> => {
    const m = await call(SF.mintPortalSession, accessId, { userAgent: TAG });
    if (m.ok && typeof m.v?.token === "string") return m.v.token as string;
    const tok = `${String(SF.PORTAL_TOKEN_PREFIX ?? "cp_")}${randomBytes(24).toString("base64url")}`;
    await P.portalSession.create({ data: { tenantId: T, portalAccessId: accessId, crmContactId: contactId, crmSystemId: S, tokenHash: sha(tok), expiresAt: new Date(Date.now() + 86_400_000) } });
    return tok;
  };
  const cpA = await mint(accA, kA.id);
  const cpC = await mint(accC, kC.id);
  const reqB = (await P.crmPortalRequest.create({ data: { tenantId: T, systemId: S, companyId: coB, contactId: kB.id, kind: "ISSUE", payload: { title: `เรื่องบริษัทบี ${TAG}` } } }).catch(() => null)) as Any;
  console.log(`[setup] T=${T} S=${S} S2=${S2} SV=${SV} TB=${TB} · keys ${[kRO, kOP, kAD, kTeam, kNone, kOther, kFlood, kV1].filter((k) => k.raw).length}/8${Object.keys(KEY_ERR).length ? ` errors=${j(KEY_ERR)}` : ""} · objects car=${objCar.ok} contract=${objContract.ok} · rec=${!!recA} seq=${!!seqId} enr=${!!enrId} link=${!!linkId} tpl=${!!tplId} job=${!!jobId} cm=${!!cmA} · cp=${cpA.slice(0, 3)}\n`);

  // ─────────────────────── generic request builder (path ids + schema-synthesised input) ───────────────────────
  type Ids = { contact: string; contact2: string; company: string; company2: string; deal: string; activity: string; objKey: string; record: string; team: string; party: string;
    pipe: string; stages: string[]; user: string; thread: string; seq: string; enr: string; link: string; tpl: string; job: string; commission: string; access: string };
  const I: Ids = { contact: kA.id, contact2: kA2.id, company: coA, company2: coX2, deal: dA, activity: aA, objKey: "car", record: recA, team: teamP, party: kA.partyId, pipe: pipeA.id, stages: stagesOf(pipeA), user: uThana, thread: THREAD, seq: seqId, enr: enrId, link: linkId, tpl: tplId, job: jobId, commission: cmA, access: accA };
  const I_SAC: Ids = { ...I, contact: kX.id, contact2: kX2.id, company: coX, company2: coX2, deal: dX, activity: aX, record: recX, team: teamX, party: kX.partyId, commission: cmX, access: accX };
  const I_S2: Ids = { ...I, contact: kS2.id, contact2: kS2.id, company: coS2, company2: coS2, deal: dS2, activity: aS2, record: recS2 || "cnoneqc38s2", party: kS2.partyId, pipe: pipeS2.id, stages: stagesOf(pipeS2), thread: `${TAG}-none`, seq: "cnoneqc38s2", enr: "cnoneqc38s2", link: "cnoneqc38s2", tpl: "cnoneqc38s2", job: "cnoneqc38s2", commission: "cnoneqc38s2", access: "cnoneqc38s2" };
  const I_B: Ids = { ...I_S2, contact: kBB.id, contact2: kBB.id, company: coBB, company2: coBB, deal: dBB, activity: aBB, record: recBB || "cnoneqc38bb", team: teamBB, party: kBB.partyId, pipe: pipeB.id, stages: stagesOf(pipeB) };
  const listCache = new Map<string, string>();
  const idForSegment = async (segs: string[], at: number, I0: Ids): Promise<string> => {
    const prev = segs[at - 1] ?? "";
    const prev2 = segs[at - 2] ?? "";
    const tok = segs[at] ?? "";
    if (tok === "{key}") return I0.objKey;
    if (tok === "{threadKey}") return I0.thread;
    if (tok === "{tab}") return "overview";
    if (tok === "{jobId}") return I0.job;
    if (tok === "{partyId}") return I0.party;
    if (tok === "{contactId}") return I0.contact2;
    if (prev === "enrollments" && I0.enr) return I0.enr;
    if (prev === "records" && I0.record) return I0.record;
    if (prev === "links" && prev2 === "tracking" && I0.link) return I0.link;
    if (prev === "templates" && I0.tpl) return I0.tpl;
    const map0: Record<string, string> = { contacts: I0.contact, companies: I0.company, deals: I0.deal, activities: I0.activity, teams: I0.team, sequences: I0.seq, commissions: I0.commission, "portal-access": I0.access, pipelines: I0.pipe };
    if (map0[prev]) return map0[prev]; // an empty fixture id falls through to the list lookup below
    // unknown resource: first row of its own list (GET <prefix>) — a future op is smoked without editing this file
    const prefix = `/${segs.slice(0, at).join("/")}`;
    if (!listCache.has(prefix)) listCache.set(prefix, firstId(await api("GET", prefix, kAD.raw)));
    return listCache.get(prefix) || I0.contact;
  };
  const synth = (s: Any, name: string, I0: Ids, depth = 0): unknown => {
    if (!s || depth > 5) return undefined;
    if (Array.isArray(s.enum) && s.enum.length) return s.enum.find((x: unknown) => x !== null) ?? s.enum[0];
    if (s.const !== undefined) return s.const;
    const alt = (s.anyOf ?? s.oneOf) as Any[] | undefined;
    if (Array.isArray(alt) && alt.length) return synth(alt.find((a) => a?.type !== "null") ?? alt[0], name, I0, depth + 1);
    const type = Array.isArray(s.type) ? s.type.find((t: string) => t !== "null") : s.type;
    const n = name.toLowerCase();
    if (type === "string") {
      if (s.format === "date-time" || /(at|from|to|date)$/.test(n) && s.format !== "email") return s.format === "date" ? new Date().toISOString().slice(0, 10) : new Date(Date.now() + 3_600_000).toISOString();
      if (s.format === "email" || /email/.test(n)) return `qc.${rand}@qc.invalid`;
      if (s.format === "uri" || /url$/.test(n)) return "https://example.invalid/qc";
      const idMap: Record<string, string> = { contactid: I0.contact, dealid: I0.deal, companyid: I0.company, activityid: I0.activity, pipelineid: I0.pipe, stageid: I0.stages[1] ?? I0.stages[0] ?? "", userid: I0.user, owneruserid: I0.user, teamid: I0.team, sequenceid: I0.seq, enrollmentid: I0.enr, objectkey: I0.objKey, recordid: I0.record, linkid: I0.link, templateid: I0.tpl, mergeid: I0.contact2, parentid: I0.contact, ownerid: I0.user, partyid: I0.party, jobid: I0.job, accessid: I0.access };
      if (idMap[n] !== undefined) return idMap[n];
      if (n === "periodkey") return BE_MONTH;
      if (n === "ownertype") return "USER";
      if (n === "tab") return "overview";
      const base = `qc ${TAG}`;
      const min = Number(s.minLength ?? 0);
      const max = Number(s.maxLength ?? 200);
      return (base.length < min ? base.padEnd(min, "x") : base).slice(0, Math.max(min, Math.min(max, 60)));
    }
    if (type === "integer" || type === "number") { const min = Number(s.minimum ?? s.exclusiveMinimum ?? 0); return Math.max(1, Number.isFinite(min) ? Math.ceil(min) : 1); }
    if (type === "boolean") return true;
    if (type === "array") { const min = Number(s.minItems ?? 0); if (min === 0) return []; const it = synth(s.items, name.replace(/s$/, ""), I0, depth + 1); return Array.from({ length: min }, () => it); }
    if (type === "object" || s.properties) {
      const out: Record<string, unknown> = {};
      for (const k of (s.required ?? []) as string[]) { const v = synth(s.properties?.[k], k, I0, depth + 1); if (v !== undefined) out[k] = v; }
      return out;
    }
    return undefined;
  };
  const SAMPLE: Record<string, (I0: Ids) => { p?: string; b?: Any }> = {
    // hand-tuned inputs where synthesis cannot guess the business meaning (the op list itself always comes from the registry)
    "contacts.create": () => ({ b: { firstName: `ผู้ติดต่อ API ${rand}`, sourceKind: "API" } }),
    "contacts.merge": (I0) => ({ b: { mergeId: I0.contact2 } }),
    "contacts.import.start": () => ({ b: { rows: [{ ชื่อ: `นำเข้า ${rand}` }], mapping: { ชื่อ: "firstName" } } }),
    "contacts.setTags": () => ({ b: { add: ["qc"], remove: [] } }),
    "contacts.setOptOut": () => ({ b: { optOut: true } }),
    "contacts.convert": () => ({ b: { company: { new: { name: `บริษัทแปลง ${rand}` } } } }),
    "companies.contacts.add": (I0) => ({ b: { contactId: I0.contact2 } }),
    "companies.merge": (I0) => ({ b: { mergeId: I0.company2 } }),
    "deals.create": (I0) => ({ b: { pipelineId: I0.pipe, title: `ดีล API ${rand}`, contactId: I0.contact } }),
    "deals.update": () => ({ b: { title: `ดีลแก้ ${rand}` } }),
    "deals.move": (I0) => ({ b: { stageId: I0.stages[1] } }),
    "deals.reassign": (I0) => ({ b: { ownerUserId: I0.user } }),
    "deals.lines.set": () => ({ b: { lines: [{ name: "คอร์ส", qty: 1, unitPriceSatang: 100_000 }] } }),
    "deals.board": (I0) => ({ p: `/deals/board?pipelineId=${I0.pipe}` }),
    "calendar.list": () => ({ p: `/calendar?from=${new Date(Date.now() - 7 * 86_400_000).toISOString()}&to=${new Date(Date.now() + 14 * 86_400_000).toISOString()}` }),
    "activities.log": (I0) => ({ b: { type: "CALL", title: `โทร API ${rand}`, contactId: I0.contact } }),
    "automation.dryRun": () => ({ b: { name: `ร่าง ${TAG}`, trigger: { event: "crm.contact.created" }, actions: [{ type: "ADD_TAG", params: { tag: "qc" } }] } }),
    "records.create": (I0) => ({ b: { parentId: I0.contact, values: {} } }),
    "records.update": () => ({ b: { values: {} } }),
    "teams.create": () => ({ b: { name: `ทีม API ${rand}-${nx()}` } }),
    "teams.members.set": (I0) => ({ b: { members: [{ userId: I0.user, role: "MEMBER", acceptingLeads: true }] } }),
    "settings.set": () => ({ b: { chatToLead: true } }),
    "emails.send": (I0) => ({ b: { contactId: I0.contact, subject: `ทดสอบ ${TAG}`, body: "สวัสดี" } }),
    "emails.sendBulk": (I0) => ({ b: { contactIds: [I0.contact], subject: `ทดสอบ ${TAG}`, body: "สวัสดี" } }),
    "emails.schedule": (I0) => ({ b: { contactId: I0.contact, subject: `ตั้งเวลา ${TAG}`, body: "สวัสดี", scheduledAt: new Date(Date.now() + 3_600_000).toISOString() } }),
    "sequences.create": () => ({ b: { name: `ลำดับ ${TAG}-${nx()}`, steps: [{ kind: "TASK", taskTitle: `โทร ${TAG}` }] } }),
    "sequences.enroll": (I0) => ({ b: { contactId: I0.contact2 } }),
    "sequences.bulkEnroll": (I0) => ({ b: { contactIds: [I0.contact2] } }),
    "tracking.links.create": () => ({ b: { url: "https://example.invalid/promo", name: `ลิงก์ ${TAG}-${nx()}` } }),
    "quotas.set": (I0) => ({ b: { ownerType: "USER", ownerId: I0.user, periodKey: BE_MONTH, targetSatang: 1_000_000 } }),
    "quotas.progress": (I0) => ({ p: `/quotas/progress?ownerType=USER&ownerId=${I0.user}&periodKey=${BE_MONTH}` }),
    "portal.invite": (I0) => ({ b: { contactId: I0.contact } }),
    "integrations.targets.set": () => ({ b: { memberSystemId: null } }),
  };
  const reqFor = async (op: Any, I0: Ids, o: { confirm?: boolean; empty?: boolean } = {}): Promise<{ m: string; p: string; b?: Any }> => {
    const segs = String(op.path).split("/").filter(Boolean);
    const out: string[] = [];
    for (let i = 0; i < segs.length; i += 1) out.push(/^\{.+\}$/.test(segs[i]) ? encodeURIComponent(await idForSegment(segs, i, I0)) : segs[i]);
    let p = `/${out.join("/")}`;
    const s = SAMPLE[String(op.id)]?.(I0);
    const schema = jsonSchema(op);
    let b: Any = undefined;
    if (op.method === "GET") {
      if (s?.p) p = s.p;
      else {
        const q = synth(schema, "query", I0) as Record<string, unknown> | undefined;
        const qs = q && typeof q === "object" ? Object.entries(q).filter(([, v]) => v !== undefined && typeof v !== "object").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&") : "";
        if (qs) p = `${p}?${qs}`;
      }
    } else {
      b = o.empty ? {} : (s?.b ?? synth(schema, "body", I0) ?? {});
      if (op.kind === "danger" && o.confirm !== false) b = { ...(b ?? {}), confirm: true, reason: REASON };
    }
    return { m: String(op.method), p, b };
  };
  const callOp = async (op: Any, key: string, I0: Ids, o: { confirm?: boolean; empty?: boolean; auth?: string } = {}) => {
    const r = await reqFor(op, I0, o);
    return api(r.m, r.p, key, r.b, o.auth ? { auth: o.auth } : {});
  };
  const denied = (r: Resp) => r.status === 401 || r.status === 403;
  const refusedBiz = (r: Resp) => [400, 404, 409, 422].includes(r.status) && thai(r.body?.error?.message_th);

  // ═════════════════════════════════ S8 — smoke EVERY op (live registry) ═════════════════════════════════
  console.log("\n── S8 · smoke every op ──");
  const reads = OPS.filter((o) => o.kind === "read");
  const writesSafe = OPS.filter((o) => o.kind !== "read");
  {
    const badR: string[] = [];
    for (const o of reads) { const r = await callOp(o, kAD.raw, I); if (r.status !== 200) badR.push(`${o.id}:${sr(r)}`); }
    const badW: string[] = [];
    let ok2xx = 0;
    // destructive ops run last so they cannot pull rows from under the others
    const order = [...writesSafe].sort((a, b) => Number(/archive|delete|merge|revoke|reject/.test(String(a.id))) - Number(/archive|delete|merge|revoke|reject/.test(String(b.id))));
    for (const o of order) {
      const r = await callOp(o, kAD.raw, I_SAC);
      if (r.status >= 200 && r.status < 300) ok2xx += 1;
      else if (!refusedBiz(r)) badW.push(`${o.id}:${sr(r)}`);
    }
    chk("C3.8-S8.1", `smoke (valid call): every op of the LIVE registry (${OPS.length}) called once with an admin key and a request built from its own path + input schema — every READ op answers 200 (${reads.length}) and every write/danger op answers 2xx or a documented business refusal (400/404/409/422 with a Thai message) — never 401/403/429/5xx/unreachable`,
      OPS.length >= OPS_MIN && badR.length === 0 && badW.length === 0, "reads 200 · writes 2xx|refusal", `ops=${OPS.length} readsBad=${cut(badR.join(" "), 300) || "-"} writesBad=${cut(badW.join(" "), 200) || "-"} writes2xx=${ok2xx}/${writesSafe.length}${ABSENT}`);
  }
  {
    const bad: string[] = [];
    for (const o of OPS) { const r = await callOp(o, "", I); if (r.status !== 401) bad.push(`${o.id}:${sr(r)}`); }
    const badBogus: string[] = [];
    for (const o of OPS.slice(0, 200)) { const r = await callOp(o, `shark_${randomBytes(16).toString("hex")}`, I); if (r.status !== 401) badBogus.push(`${o.id}:${sr(r)}`); }
    chk("C3.8-S8.2", "smoke (no key / unknown key): every op answers 401 with no Authorization header and 401 for a well-formed but unknown key — nothing is read or written for an anonymous caller",
      OPS.length > 0 && bad.length === 0 && badBogus.length === 0, "all 401", `noKey=${cut(bad.join(" "), 200) || "-"} unknownKey=${cut(badBogus.join(" "), 200) || "-"}`);
  }
  {
    const bad: string[] = [];
    for (const o of OPS) {
      for (const k of [kNone, kOther]) { const r = await callOp(o, k.raw, I_SAC); if (!(r.status === 403)) bad.push(`${o.id}@${k === kNone ? "none" : "member"}:${sr(r)}`); }
    }
    chk("C3.8-S8.3", "smoke (key scope): a key with NO scope and a key of another module (member.customer.read) are refused with 403 on EVERY op — valid bodies included, so the refusal is the scope gate and not validation",
      OPS.length > 0 && !!kNone.raw && !!kOther.raw && bad.length === 0, "all 403", `bad=${cut(bad.join(" "), 300) || "-"} keys=${!!kNone.raw}/${!!kOther.raw}`);
  }
  {
    const bad: string[] = [];
    let n = 0;
    for (const o of OPS.filter((x) => /\{(?!key\})[^}]+\}/.test(String(x.path)))) {
      n += 1;
      const r = await callOp(o, kAD.raw, I_B);
      const leak = SECRET_FOREIGN.some((s) => r.text.includes(s));
      if (!(r.status === 404 || [400, 422].includes(r.status) || emptyByParty(o, r)) || leak) bad.push(`${o.id}:${sr(r)}${leak ? ":LEAK" : ""}`);
    }
    chk("C3.8-S8.4", "smoke (cross-tenant): every op with a path id, called by an admin key of tenant A with the ids of tenant B, answers 404 (or a validation refusal before the handler) — never 200/403 — and no foreign title appears in any body",
      n > 0 && bad.length === 0, "404 · no leak", `ops=${n} bad=${cut(bad.join(" "), 300) || "-"}`);
  }
  {
    const roSet = new Set(roScopes);
    const bad: string[] = [];
    for (const o of OPS) {
      const r = await callOp(o, kRO.raw, o.kind === "read" ? I : I_SAC);
      const inBundle = typeof ACT.crmScopesCan === "function" ? ACT.crmScopesCan(roScopes, o.action) : roSet.has(String(o.action));
      if (o.kind !== "read") { if (r.status !== 403) bad.push(`${o.id}:${sr(r)}`); }
      else if (inBundle ? r.status !== 200 : r.status !== 403) bad.push(`${o.id}:${sr(r)}(bundle=${inBundle})`);
    }
    const c = await api("GET", `/contacts/${kA.id}`, kRO.raw);
    const raw = (await P.crmContact.findUnique({ where: { id: kA.id }, select: { phone: true, email: true } })) as Any;
    const masked = c.status === 200 && !c.text.includes(String(raw?.phone)) && !c.text.includes(String(raw?.email));
    chk("C3.8-S8.5", "smoke (READONLY bundle): every non-read op answers 403 even with a valid body · every read op answers 200 when its scope is in crm.readonly and 403 when it is not · a contact read through the readonly key has phone and e-mail MASKED",
      OPS.length > 0 && !!kRO.raw && bad.length === 0 && masked, "403 writes · reads per bundle · masked", `bad=${cut(bad.join(" "), 300) || "-"} contact=${sr(c)} masked=${masked}`);
  }
  {
    const limits = (RATE.CRM_RATE_LIMITS ?? { read: { limit: 600 }, write: { limit: 300 }, report: { limit: 60 } }) as Any;
    const fill = async (key: string, limit: number) => P.$executeRawUnsafe(
      `INSERT INTO "ChatRateBucket" ("id","key","count","windowStart","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,NOW(),NOW(),NOW())
       ON CONFLICT ("key") DO UPDATE SET "count" = $2, "windowStart" = NOW(), "updatedAt" = NOW()`, key, limit);
    for (const kind of ["read", "write", "report"]) await fill(`crm:api:${kind}:${kFlood.id}`, Number(limits[kind]?.limit ?? 600));
    const bad: string[] = [];
    for (const o of OPS) {
      const r = await callOp(o, kFlood.raw, I_SAC, { empty: true });
      if (!(r.status === 429 && thai(r.body?.error?.message_th) && !!r.headers?.get("retry-after"))) bad.push(`${o.id}:${sr(r)}`);
    }
    const PR = { read: 240, write: 30, report: 30 };
    for (const kind of ["read", "write", "report"] as const) await fill(`crm:portal:api:${T}:${kind}:${accC}`, PR[kind]);
    const badP: string[] = [];
    for (const o of PORTAL_OPS) {
      const p = `/${String(o.path).split("/").filter(Boolean).map((s2) => (/^\{.+\}$/.test(s2) ? `${TAG}none` : s2)).join("/")}`;
      const r = await api(String(o.method), p, cpC, o.method === "GET" ? undefined : {});
      if (!(r.status === 429 && thai(r.body?.error?.message_th))) badP.push(`${o.id}:${sr(r)}`);
    }
    chk("C3.8-S8.6", "smoke (limit): with the key's read/write/report buckets at their limit (DB limiter `crm:api:<kind>:<keyId>`), EVERY op answers 429 with Retry-After and a Thai message · the portal lane likewise per access (`crm:portal:api:<tenant>:<kind>:<accessId>`) for every PORTAL_OPS op",
      OPS.length > 0 && PORTAL_OPS.length > 0 && bad.length === 0 && badP.length === 0, "all 429", `staff=${cut(bad.join(" "), 240) || "-"} portal=${cut(badP.join(" "), 160) || "-"}`);
  }

  // ═════════════════════════════════ S2 — portal lane (cp_ session only) ═════════════════════════════════
  console.log("\n── S2 · portal lane ──");
  const portalReq = async (op: Any, token: string | null, own: { record: string; request: string }, o: { auth?: string } = {}) => {
    const segs = String(op.path).split("/").filter(Boolean);
    const p = `/${segs.map((s, i) => (/^\{.+\}$/.test(s) ? (segs[i - 1] === "records" ? own.record : segs[i - 1] === "requests" ? own.request : `${TAG}none`) : s)).join("/")}`;
    const s = String(op.id);
    const body = op.method === "GET" ? undefined
      : s.endsWith("requests.create") ? { kind: "ISSUE", title: `แจ้ง ${TAG}`, body: "ทดสอบ" }
      : s.endsWith("changeRequest") ? { fieldKey: firstField("contract"), value: "แก้" }
      : s.endsWith("respond") ? { accept: true, signerName: "ผู้ลงนาม" } : {};
    return api(String(op.method), p, token, body, o.auth ? { auth: o.auth } : {});
  };
  const ownReq = firstId(await api("POST", "/portal/requests", cpA, { kind: "ISSUE", title: `แจ้งเรื่อง ${TAG}` }));
  {
    const bad: string[] = [];
    for (const o of PORTAL_OPS) {
      const r = await portalReq(o, cpA, { record: recContractA, request: ownReq });
      const idOp = /\{/.test(String(o.path));
      const needs200 = !idOp || /records|requests/.test(String(o.path));
      if (needs200 ? !(r.status === 200 || (o.method !== "GET" && refusedBiz(r))) : !(r.status === 200 || r.status === 404)) bad.push(`${o.id}:${sr(r)}`);
    }
    chk("C3.8-S2.1", `portal ops under a live cp_ session: every PORTAL_OPS op (${PORTAL_OPS.length}) answers 200 for the session's own company (list ops · the shared record · the request it created) — account documents that do not exist in this fixture may answer 404 — never 401/403/5xx`,
      PORTAL_OPS.length >= 16 && !!ownReq && bad.length === 0, "200 own data", `ops=${PORTAL_OPS.length} ownRequest=${!!ownReq} bad=${cut(bad.join(" "), 260) || "-"}`);
  }
  {
    const bad: string[] = [];
    for (const o of PORTAL_OPS) {
      for (const [label, auth] of [["staffKey", `Bearer ${kAD.raw}`], ["none", ""], ["memberToken", `Bearer cs_${randomBytes(20).toString("hex")}`], ["forged cp_", `Bearer cp_${randomBytes(24).toString("hex")}`]] as const) {
        const r = auth ? await portalReq(o, null, { record: recContractA, request: ownReq }, { auth }) : await portalReq(o, null, { record: recContractA, request: ownReq });
        if (r.status !== 401) bad.push(`${o.id}@${label}:${sr(r)}`);
      }
    }
    chk("C3.8-S2.2", "the portal lane refuses everything that is not a live portal session: the shop's ADMIN key, no token, a member-customer token and a forged cp_ token all answer 401 on every PORTAL_OPS op",
      PORTAL_OPS.length > 0 && bad.length === 0, "all 401", `bad=${cut(bad.join(" "), 300) || "-"}`);
  }
  {
    const bad: string[] = [];
    for (const o of OPS) { const r = await callOp(o, "", I_SAC, { auth: `Bearer ${cpA}` }); if (r.status !== 403) bad.push(`${o.id}:${sr(r)}`); }
    chk("C3.8-S2.3", "a portal session is refused on EVERY shop op (CRM_OPS, incl. the C3.8 staff-side portal ops) with 403 — the customer lane never reaches the shop registry",
      OPS.length > 0 && bad.length === 0, "all 403", `bad=${cut(bad.join(" "), 300) || "-"}`);
  }
  {
    const bad: string[] = [];
    let n = 0;
    for (const o of PORTAL_OPS.filter((x) => /\{/.test(String(x.path)))) {
      n += 1;
      const r = await portalReq(o, cpA, { record: recContractB, request: String(reqB?.id ?? `${TAG}none`) });
      if (!(r.status === 404 || (o.method !== "GET" && [400, 422].includes(r.status))) || r.text.includes(`เรื่องบริษัทบี ${TAG}`) || r.text.includes(`บริษัทบี ${TAG}`)) bad.push(`${o.id}:${sr(r)}`);
    }
    const revoke = byId.get("portal.revoke") ? await api("POST", `/portal-access/${accC}/revoke`, kAD.raw, { confirm: true, reason: REASON }) : await call(CRM?.portal?.revoke, cS, owner, { accessId: accC, reason: REASON }).then((x) => ({ status: x.ok ? 200 : 500 } as Resp));
    const after = await api("GET", "/portal/me", cpC);
    chk("C3.8-S2.4", "portal across companies: the session of company A asking with company B's record / request ids gets 404 on every id-bearing PORTAL_OPS op with no B data in the body · revoking an access (portal.revoke — REST when present) ends its session at the very next request (401)",
      n > 0 && bad.length === 0 && [200, 201].includes(revoke.status) && after.status === 401, "404 · revoke ⇒ 401", `idOps=${n} bad=${cut(bad.join(" "), 200) || "-"} revoke=${revoke.status} next=${sr(after)}${ABSENT}`);
  }

  // ═════════════════════════════════ S3 — dynamic records for every custom object ═════════════════════════════════
  console.log("\n── S3 · dynamic records ──");
  {
    const bad: string[] = [];
    const seedOwner = seedOwnerU ? { userId: String(seedOwnerU.id), role: "OWNER", unitAccess: ["*"], permissions: {} } : null;
    const seedCtx = { tenantId: seedT, systemId: seedS, actorUserId: seedOwner?.userId ?? null };
    const doc = seedS ? await call(RD.crmObjectsOpenApi, { tenantId: seedT, systemId: seedS }) : MISSING;
    for (const o of seedObjects) {
      const fields = ((await P.memberField.findMany({ where: { systemId: seedS, objectKey: o.key, archivedAt: null }, select: { key: true } })) as Any[]).map((f) => String(f.key));
      const sch = seedOwner ? await call(RD.objectValueSchema, seedCtx, seedOwner, o.key) : MISSING;
      const props = Object.keys((sch.v?.properties ?? sch.v?.schema?.properties ?? {}) as Record<string, unknown>);
      const miss = fields.filter((f) => !props.includes(f));
      const inDoc = !!doc.v?.paths?.[`/objects/${o.key}/records`];
      if (!sch.ok || miss.length > 0 || !inDoc) bad.push(`${o.key}:${sch.ok ? `miss=${miss.join("/")}` : sch.code}${inDoc ? "" : ":notInDoc"}`);
    }
    chk("C3.8-S3.1", `records dynamic on the SEED (read-only): for EVERY live custom object of the seeded CRM system (${seedObjects.length}) objectValueSchema() lists every live field and crmObjectsOpenApi() carries its concrete /objects/<key>/records path`,
      seedObjects.length > 0 && bad.length === 0, "every object described", `objects=${seedObjects.map((o) => o.key).join(",")} bad=${cut(bad.join(" | "), 240) || "-"}${ABSENT}`);
  }
  let freshKey = "";
  {
    freshKey = `asset${rand}`;
    const fresh = await mkObject(cS, freshKey, "asset", "CONTACT");
    const keys = ((await P.customObject.findMany({ where: { systemId: S, archivedAt: null }, select: { key: true } })) as Any[]).map((o) => String(o.key));
    const bad: string[] = [];
    for (const key of keys) {
      const sch = await api("GET", `/objects/${key}/schema`, kAD.raw);
      const fields = (await fieldRows(S, key)).map((f) => String(f.key));
      const props = Object.keys((dat(sch)?.properties ?? dat(sch)?.schema?.properties ?? {}) as Record<string, unknown>);
      const parent = key === "contract" ? coA : kA.id;
      const cr = await api("POST", `/objects/${key}/records`, kAD.raw, { parentId: parent, values: await valuesOf(S, key, true) });
      const rid = firstId(cr);
      const ls = await api("GET", `/objects/${key}/records?take=5`, kAD.raw);
      const gt = rid ? await api("GET", `/objects/${key}/records/${rid}`, kAD.raw) : ({ status: 0 } as Resp);
      const up = rid ? await api("PATCH", `/objects/${key}/records/${rid}`, kAD.raw, { values: await valuesOf(S, key) }) : ({ status: 0 } as Resp);
      const ar = rid ? await api("POST", `/objects/${key}/records/${rid}/archive`, kAD.raw, {}) : ({ status: 0 } as Resp);
      const listed = j(dat(ls)).includes(rid);
      if (sch.status !== 200 || fields.some((f) => !props.includes(f)) || cr.status !== 200 || !rid || !listed || gt.status !== 200 || up.status !== 200 || ar.status !== 200)
        bad.push(`${key}:schema=${sr(sch)} create=${sr(cr)} listed=${listed} get=${gt.status} update=${up.status} archive=${ar.status}`);
    }
    chk("C3.8-S3.2", "records dynamic in a live system: for EVERY custom object of the CRM system — incl. one created DURING this run (no restart, no registry edit) — GET /objects/{key}/schema lists its fields and records create → list → get → update → archive all answer 200 through the same REST registry",
      fresh.ok && keys.includes(freshKey) && keys.length >= 3 && bad.length === 0, "all 200", `objects=${keys.join(",")} fresh=${fresh.ok ? freshKey : fresh.err} bad=${cut(bad.join(" | "), 280) || "-"}${ABSENT}`);
  }
  {
    const oaFn = (OA_ROUTE as Any)?.GET;
    const hitOa = async (auth: string | null) => {
      if (typeof oaFn !== "function") return { status: 0, text: "" };
      const res: Response = await oaFn(new Request("http://qc.invalid/api/v1/crm/openapi.json", { headers: auth ? { authorization: auth } : {} }));
      return { status: res.status, text: await res.text() };
    };
    const anon = await hitOa(null);
    const keyed = await hitOa(`Bearer ${kAD.raw}`);
    const numField = (await fieldRows(S, "car")).find((f) => ["NUMBER", "MONEY"].includes(String(f.type)));
    const badType = numField ? await api("POST", "/objects/car/records", kAD.raw, { parentId: kA.id, values: { ...(await valuesOf(S, "car")), [String(numField.key)]: "ไม่ใช่ตัวเลข" } }) : ({ status: 0, body: {} } as Resp);
    chk("C3.8-S3.3", "dynamic docs: /api/v1/crm/openapi.json WITHOUT a key is the static contract (no tenant object key in it) · WITH a CRM key it adds the concrete /objects/car/records, /objects/contract/records and the fresh object's paths · a record value of the wrong type (text into a NUMBER field) answers 422 with a Thai message",
      anon.status === 200 && !anon.text.includes(`/objects/${freshKey}/`) && !anon.text.includes("/objects/car/records") && keyed.status === 200 && keyed.text.includes("/objects/car/records") && keyed.text.includes(`/objects/${freshKey}/records`) && keyed.text.includes("/objects/contract/records") && (!numField || (badType.status === 422 && thai(badType.body?.error?.message_th))),
      "static · tenant paths · 422", `anon=${anon.status}/${anon.text.includes("/objects/car/records")} keyed=${keyed.status}/${keyed.text.includes(`/objects/${freshKey}/records`)} wrongType=${sr(badType)} numField=${numField?.key ?? "-"}${ABSENT}`);
  }

  // ═════════════════════════════════ S4 — manifest (32 tools) ═════════════════════════════════
  console.log("\n── S4 · manifest ──");
  {
    const m = await call(MAN.crmManifest);
    const mv = m.v ?? {};
    const eqSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    const opsOk = Array.isArray(mv.ops) && eqSet(mv.ops.map((o: Any) => String(o.id)), OPS.map((o) => String(o.id)));
    const portalOk = Array.isArray(mv.portalOps) && eqSet(mv.portalOps.map((o: Any) => String(o.id)), PORTAL_OPS.map((o) => String(o.id)));
    const whOk = Array.isArray(mv.webhookEvents) && eqSet(mv.webhookEvents, webhookEvents());
    const routeFn = (MAN_ROUTE as Any)?.GET;
    let routeOk = false;
    if (typeof routeFn === "function") { try { const res: Response = await routeFn(new Request("http://qc.invalid/api/v1/crm/manifest.json")); routeOk = res.status === 200 && j(JSON.parse(await res.text())) === j(mv); } catch { routeOk = false; } }
    let oaOps = 0;
    let oaHooks: string[] = [];
    try { const d = OAM.buildOpenApi(); for (const p of Object.values(d.paths ?? {}) as Any[]) oaOps += Object.keys(p).filter((k) => ["get", "post", "put", "patch", "delete"].includes(k)).length; oaHooks = (d["x-shark-webhooks"] ?? []) as string[]; } catch { oaOps = -1; }
    chk("C3.8-S4.1", "manifest == registry: crmManifest() lists exactly the ids of CRM_OPS and PORTAL_OPS and exactly crmWebhookEvents() · GET /api/v1/crm/manifest.json returns the same document · the OpenAPI doc has one operation per CRM op and `x-shark-webhooks` = crmWebhookEvents()",
      m.ok && opsOk && portalOk && whOk && routeOk && oaOps === OPS.length && eqSet(oaHooks, webhookEvents()),
      "all equal", `manifest=${m.ok ? "ok" : m.err} ops=${opsOk} portal=${portalOk} hooks=${whOk} route=${routeOk} openapiOps=${oaOps}/${OPS.length} x-shark-webhooks=${oaHooks.length}/${webhookEvents().length}${ABSENT}`);
    const names = toolNames();
    const dup = names.length - new Set(names).size;
    const orphan = toolInfos().filter((t) => !byId.has(String(t.opId))).map((t) => t.name);
    const skills = read(SKILLS_FILE);
    const notInSkill = names.filter((n) => !skills.includes(`"${n}"`));
    const manTools = Array.isArray(mv.tools) ? mv.tools.map((t: Any) => String(t.name)) : [];
    chk("C3.8-S4.2", `AI tools listing: crmToolNames() holds exactly ${TOOLS_TOTAL} tools (today ${names.length}; C3.4 adds 9 of them), no duplicate, each backed by a registry op, each in the \`crm\` skill of skills.ts, and the manifest lists the same ${TOOLS_TOTAL}`,
      names.length === TOOLS_TOTAL && dup === 0 && orphan.length === 0 && notInSkill.length === 0 && eqSet(manTools, names),
      `${TOOLS_TOTAL} everywhere`, `tools=${names.length} dup=${dup} orphan=${orphan.join(",") || "-"} notInSkill=${notInSkill.join(",") || "-"} manifestTools=${manTools.length}${ABSENT}`);
  }

  // ═════════════════════════════════ S5 — docs == generator ═════════════════════════════════
  console.log("\n── S5 · docs ──");
  {
    const gen = (await import("./gen-crm-api-docs.mts" as string).catch(() => ({}))) as Any;
    const rendered = typeof gen.renderDocs === "function" ? String(gen.renderDocs()) : "";
    const onDisk = read(DOC_FILE);
    const tsx = join("node_modules", ".bin", "tsx");
    const ck = existsSync(tsx) ? spawnSync(tsx, ["scripts/gen-crm-api-docs.mts", "--check"], { encoding: "utf8", env: process.env, timeout: 180_000 }) : null;
    const missingPaths = [...OPS.map((o) => String(o.path)), ...PORTAL_OPS.map((o) => String(o.path))].filter((p) => !rendered.includes(p));
    const missingHooks = webhookEvents().filter((e) => !rendered.includes(e));
    chk("C3.8-S5.1", "docs are 100 % generated: renderDocs() equals docs/api/CRM-API.md byte for byte, `gen-crm-api-docs.mts --check` exits 0, and the rendered doc names every CRM op path, every portal-lane path and every webhook event",
      rendered.length > 0 && onDisk === rendered && ck?.status === 0 && missingPaths.length === 0 && missingHooks.length === 0,
      "identical · check 0 · complete", `equal=${onDisk === rendered} check=${ck?.status ?? "n/a"} missingPaths=${cut(missingPaths.join(","), 200) || "-"} missingHooks=${cut(missingHooks.join(","), 120) || "-"}${ABSENT}`);
  }

  // ═════════════════════════════════ S6 — webhooks complete ═════════════════════════════════
  console.log("\n── S6 · webhooks ──");
  {
    const prefixes = (WHE.CRM_EVENT_PREFIXES ?? ["crm.", "custom.record.", "team."]) as string[];
    const consumerKeys = Object.keys((OBX.consumers ?? {}) as Record<string, unknown>).filter((k) => prefixes.some((p) => k.startsWith(p)));
    const internal = (WHE.CRM_INTERNAL_EVENTS ?? null) as string[] | null;
    const hooks = webhookEvents();
    const notOffered = consumerKeys.filter((k) => !hooks.includes(k) && !(internal ?? []).includes(k));
    const noConsumer = hooks.filter((e) => !consumerKeys.includes(e));
    const vals = ((WHL.WEBHOOK_EVENTS ?? []) as Any[]).map((e) => String(e.value)).filter((v) => prefixes.some((p) => v.startsWith(p)));
    const dups = vals.filter((v, i) => vals.indexOf(v) !== i);
    const unlabelled = ((WHL.WEBHOOK_EVENTS ?? []) as Any[]).filter((e) => hooks.includes(String(e.value)) && !thai(e.label)).map((e) => e.value);
    chk("C3.8-S6.1", "webhooks complete: every CRM-prefixed outbox consumer is offered to webhooks unless it is declared in CRM_INTERNAL_EVENTS (consumer-only flags) · every offered event has a consumer · no event value declared twice · every offered event has a Thai label",
      Array.isArray(internal) && hooks.length > 0 && notOffered.length === 0 && noConsumer.length === 0 && dups.length === 0 && unlabelled.length === 0,
      "consumers ⊆ webhooks ∪ internal", `internal=${internal ? internal.length : "ABSENT"} hooks=${hooks.length} notOffered=${cut(notOffered.join(","), 200) || "-"} noConsumer=${cut(noConsumer.join(","), 120) || "-"} dups=${dups.join(",") || "-"} unlabelled=${unlabelled.join(",") || "-"}${ABSENT}`);
  }
  {
    const evts = ((await P.outboxEvent.findMany({ where: { tenantId: { in: [T, TB] } }, select: { type: true, payload: true } })) as Any[]);
    const leaks = evts.flatMap((e) => PII.filter((s) => j(e.payload).includes(s)).map(() => String(e.type)));
    const docs = read(DOC_FILE);
    const hooks = webhookEvents();
    const inDocs = hooks.filter((e) => !docs.includes(e));
    chk("C3.8-S6.2", "webhook payloads of every event this run produced (both tenants) carry ids only — no name/phone/e-mail of the fixture — and the docs list every offered event (the list a shop subscribes from)",
      hooks.length > 0 && leaks.length === 0 && inDocs.length === 0, "ids only · documented", `events=${evts.length} leaks=${cut([...new Set(leaks)].join(","), 160) || "-"} notInDocs=${cut(inDocs.join(","), 160) || "-"}`);
  }

  // ═════════════════════════════════ S7 — skill (F13.9 of the brief) ═════════════════════════════════
  {
    const gen = (await import("./gen-crm-api-docs.mts" as string).catch(() => ({}))) as Any;
    const refWant = typeof gen.renderEndpointsReference === "function" ? String(gen.renderEndpointsReference()) : "";
    const ref = read(SKILL_REF);
    const md = read(SKILL_MD);
    const pathsMissing = [...OPS.map((o) => String(o.path)), ...PORTAL_OPS.map((o) => String(o.path))].filter((p) => !ref.includes(p));
    const toolsMissing = toolNames().filter((n) => !md.includes(n));
    chk("C3.8-S7.1", `skill parity: ${SKILL_MD} exists (name: shark-crm-api) and names every CRM tool · references/endpoints.md == renderEndpointsReference() byte for byte and lists every CRM op AND every portal-lane path (.claude/ is gitignored — fitness cannot see it, this check does)`,
      /name:\s*shark-crm-api/.test(md) && ref.length > 0 && ref === refWant && pathsMissing.length === 0 && toolsMissing.length === 0,
      "skill == registry", `SKILL.md=${md.length > 0} refEqual=${ref === refWant} pathsMissing=${cut(pathsMissing.join(","), 160) || "-"} toolsMissing=${cut(toolsMissing.join(","), 160) || "-"}${ABSENT}`);
  }

  // ═════════════════════════════════ X — matrix · scope · idempotency · schemas · PDPA · danger · v1 ═════════════════════════════════
  console.log("\n── X ──");
  {
    const bad: string[] = [];
    let n = 0;
    for (const o of OPS.filter((x) => /\{(?!key\})[^}]+\}/.test(String(x.path)) && !String(x.path).startsWith("/teams"))) {
      n += 1;
      const r = await callOp(o, kAD.raw, I_S2);
      if (!(r.status === 404 || [400, 422].includes(r.status) || emptyByParty(o, r)) || SECRET_FOREIGN.some((s) => r.text.includes(s))) bad.push(`${o.id}:${sr(r)}`);
    }
    chk("C3.8-X1.1", "X1 (other CRM system, same shop): every id-bearing op (teams excepted — shop-wide) called by system S's admin key with system S2's ids answers 404 (or validation) — never 200/403, never S2's titles",
      n > 0 && bad.length === 0, "404", `ops=${n} bad=${cut(bad.join(" "), 300) || "-"}`);
  }
  {
    // expected outcome DERIVED from the bundles (no hand-written exceptions): allowed ⇔ scope covers the action ∧ ¬(readonly ∧ non-read) ∧ ¬(export danger ∧ ¬admin)
    const roleOf = (scopes: string[]) => { try { return (ACT.crmApiRoleForScopes ?? ((s: string[]) => s.some((x) => /settings|api\.manage|team\.manage/.test(x)) ? "ADMIN" : s.some((x) => /create|update|move|send|enroll|lines|quote|complete|delete|reassign/.test(x)) ? "OPERATE" : "READONLY"))(scopes); } catch { return "READONLY"; } };
    const can = (scopes: string[], action: string) => (typeof ACT.crmScopesCan === "function" ? !!ACT.crmScopesCan(scopes, action) : scopes.includes(action));
    const principals: [string, Key][] = [["no-scope", kNone], ["other-module", kOther], ["readonly", kRO], ["operate", kOP], ["admin", kAD], ["team-filtered", kTeam]];
    const bad: string[] = [];
    let cells = 0;
    for (const o of OPS) {
      for (const [label, k] of principals) {
        const role = roleOf(k.scopes);
        const expect = can(k.scopes, o.action) && !(role === "READONLY" && o.kind !== "read") && !(o.kind === "danger" && /export/i.test(String(o.id)) && role !== "ADMIN");
        const r = expect && o.kind !== "read" ? await callOp(o, k.raw, I_SAC, { empty: true }) : await callOp(o, k.raw, I_SAC);
        cells += 1;
        if (expect === denied(r)) bad.push(`${o.id}@${label}:exp=${expect ? "allow" : "deny"}:${sr(r)}`);
      }
      cells += 1;
      const rc = await callOp(o, "", I_SAC, { auth: `Bearer ${cpA}` });
      if (!denied(rc)) bad.push(`${o.id}@customer:${sr(rc)}`);
    }
    chk("C3.8-X2.1", `🔴 X2 FULL MATRIX generated from the registry: every op × {no-scope, other-module, readonly, operate, admin, team-filtered key, customer token} (${cells} cells) — denial (401/403) happens exactly where the bundle rule says (scope ∧ readonly-writes ∧ export-needs-admin), nowhere else`,
      OPS.length > 0 && bad.length === 0, "matrix holds", `cells=${cells} bad=${bad.length} ${cut(bad.slice(0, 12).join(" "), 360)}`);
  }
  {
    const src = read(TOOLS_FILE);
    const m = /ASSISTANT_READ_SCOPES\s*=\s*\[([^\]]*)\]/.exec(src);
    const aScopes = m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
    const DENY = "ผู้ช่วยไม่มีสิทธิ์";
    const ctxThana = { tenantId: T, systemId: S, userId: uThana, role: "STAFF", unitAccess: ["*"], permissions: STAFF_PERMS };
    const bad: string[] = [];
    const krabiTokens = [dK, kB.id, coB, `ดีลกระบี่ลับ ${TAG}`];
    let leaks = 0;
    for (const t of toolInfos()) {
      const op = byId.get(String(t.opId));
      const args = synth(t.parameters, "args", I) as Any ?? {};
      const r = await call(TOOLS.runCrmTool, ctxThana, t.name, args);
      const mode = String(r.v?.mode ?? (r.ok ? "?" : "threw"));
      const isDeny = mode === "error" && String(r.v?.error ?? "").includes(DENY);
      if (t.write) { if (!(mode === "propose" || (mode === "error" && !isDeny))) bad.push(`${t.name}:${mode}`); }
      else {
        const expect = aScopes.includes(String(op?.action)) && (typeof ACC.crmCan === "function" ? ACC.crmCan(thana, String(op?.action)) : true);
        if (expect ? isDeny || mode === "threw" : !isDeny) bad.push(`${t.name}:exp=${expect}:${mode}`);
      }
      const k = await call(TOOLS.runCrmTool, ctxThana, t.name, synth(t.parameters, "args", { ...I, deal: dK, contact: kB.id, company: coB }));
      if (krabiTokens.some((x) => j(k.v).includes(x) && !j(synth(t.parameters, "args", { ...I, deal: dK, contact: kB.id, company: coB })).includes(x))) leaks += 1;
    }
    chk("C3.8-X2.2", "X2 assistant-as-thana over EVERY tool: read tools answer exactly per (assistant read scopes parsed from tools.ts ∩ thana's rights) — deny text otherwise — write tools only PROPOSE, and no tool aimed at the krabi team's deal/contact/company returns a krabi id or title it was not given",
      aScopes.length > 0 && toolInfos().length > 0 && bad.length === 0 && leaks === 0, "matrix · no leak", `assistantScopes=${aScopes.length} tools=${toolInfos().length} bad=${cut(bad.join(" "), 260) || "-"} leaks=${leaks}`);
  }
  {
    const idem = `${TAG}-idem-quota`;
    const body = SAMPLE["quotas.set"](I).b;
    const r1 = await api("PUT", "/quotas", kAD.raw, body, { idem });
    const r2 = await api("PUT", "/quotas", kAD.raw, body, { idem });
    const rows = (await P.crmQuota.count({ where: { systemId: S, ownerId: uThana } }).catch(() => -1)) as number;
    const par = await Promise.all(Array.from({ length: 10 }, () => api("PUT", "/quotas", kAD.raw, body, { idem: `${TAG}-idem-par` })));
    const rows2 = (await P.crmQuota.count({ where: { systemId: S, ownerId: uThana } }).catch(() => -1)) as number;
    chk("C3.8-X3.1", "X3 idempotent writes of the new set: PUT /quotas twice with one Idempotency-Key replays (Idempotent-Replayed: true, same data) and 10 parallel calls with another key leave ONE quota row for (owner, period)",
      r1.status === 200 && r2.status === 200 && r2.headers?.get("idempotent-replayed") === "true" && rows === 1 && rows2 === 1 && par.every((r) => [200, 409].includes(r.status)),
      "1 row · replay", `first=${sr(r1)} second=${sr(r2)} replayed=${r2.headers?.get("idempotent-replayed")} rows=${rows}/${rows2} par=${[...new Set(par.map((r) => r.status))].join(",")}${ABSENT}`);
  }
  {
    const bad: string[] = [];
    for (const o of OPS) { const js = jsonSchema(o); if (o.input && js?.type === "object" && js.additionalProperties !== false) bad.push(`${o.id}:not-strict`); }
    const smug: string[] = [];
    for (const m of MUST.filter((x) => x.m !== "GET")) {
      const o = byId.get(m.id); if (!o) { smug.push(`${m.id}:MISSING`); continue; }
      const r = await reqFor(o, I_SAC);
      const x = await api(r.m, r.p, kAD.raw, { ...(r.b ?? {}), tenantId: TB, systemId: SB });
      if (![400, 422].includes(x.status)) smug.push(`${m.id}:${sr(x)}`);
    }
    chk("C3.8-X6.1", "X6 strict inputs: every op's object input schema has additionalProperties:false (walk over the registry) and every NEW write op refuses a body smuggling tenantId/systemId with 400/422",
      OPS.length > 0 && bad.length === 0 && smug.length === 0, "strict", `notStrict=${cut(bad.join(","), 200) || "-"} smuggle=${cut(smug.join(" "), 200) || "-"}${ABSENT}`);
  }
  {
    const hits: string[] = [];
    for (const o of OPS.filter((x) => x.kind === "read")) { const r = await callOp(o, kRO.raw, I); if (r.text.includes(SECRET_BODY)) hits.push(o.id); }
    for (const o of PORTAL_OPS.filter((x) => x.method === "GET")) { const r = await portalReq(o, cpA, { record: recContractA, request: ownReq }); if (r.text.includes(SECRET_BODY) || r.text.includes(String((await P.crmContact.findUnique({ where: { id: kB.id }, select: { phone: true } }))?.phone))) hits.push(`portal:${o.id}`); }
    chk("C3.8-X8.1", "X8 the readonly key never receives an e-mail BODY on any read op of the registry, and no portal GET ever returns another company's contact phone or any e-mail body",
      OPS.length > 0 && hits.length === 0, "0 hits", `hits=${hits.join(",") || "-"}`);
  }
  {
    const newRead = MUST.filter((m) => m.kind === "read").map((m) => byId.get(m.id)).filter(Boolean) as Any[];
    const hits: string[] = [];
    for (const o of newRead) { const r = await callOp(o, kAD.raw, I); for (const s of [SECRET_BODY]) if (r.text.includes(s)) hits.push(o.id); if (/"(bodyHtml|bodyText|transcript|recordingFileId|cdnUrl)"/.test(r.text)) hits.push(`${o.id}:field`); }
    chk("C3.8-X8.2", "X8 the new read ops (reports · quotas · commissions · portal access · schema · integrations) never carry an e-mail body, a transcript, a recording file id or a CDN url — even for an admin key",
      newRead.length === MUST.filter((m) => m.kind === "read").length && hits.length === 0, "clean", `checked=${newRead.length} hits=${hits.join(",") || "-"}${ABSENT}`);
  }
  {
    const bad: string[] = [];
    const danger = OPS.filter((o) => o.kind === "danger");
    for (const o of danger) {
      const r = await callOp(o, kAD.raw, I_SAC, { confirm: false });
      if (!(r.status === 409 && ecode(r) === "confirm_required") && ![400, 422].includes(r.status)) bad.push(`${o.id}:${sr(r)}`);
    }
    const newDanger = MUST.filter((m) => m.kind === "danger").map((m) => m.id);
    const audits = (await P.auditLog.count({ where: { tenantId: T, action: { in: newDanger.map((x) => `crm.api.${x}`) } } })) as number;
    chk("C3.8-X9.1", `X9 every danger op of the registry (${danger.length}) refuses a call without confirm+reason (409 confirm_required, nothing done) · the new danger ops (${newDanger.join(" · ")}) that ran in the smoke left an AuditLog row`,
      danger.length > 0 && bad.length === 0 && newDanger.every((x) => byId.has(x)) && audits >= 1, "confirm · audit", `bad=${cut(bad.join(" "), 200) || "-"} audits=${audits}${ABSENT}`);
  }
  {
    const bad: string[] = [];
    for (const o of OPS) { if (o.id === "ping") continue; const r = await callOp(o, kV1.raw, I, { empty: true }); if (!(r.status === 409 && ecode(r) === "crm_v2_disabled")) bad.push(`${o.id}:${sr(r)}`); }
    chk("C3.8-U.1", "R-E.14: a key of a uiVersion-1 CRM system gets 409 crm_v2_disabled from EVERY op but ping (incl. the C3.8 set) — before validation",
      OPS.length > 0 && bad.length === 0, "all 409", `bad=${cut(bad.join(" "), 240) || "-"}`);
  }
} catch (e) {
  chk("C3.8-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  if (docSnapshot !== null && read(DOC_FILE) !== docSnapshot) { try { writeFileSync(DOC_FILE, docSnapshot); } catch { /* ro */ } }
  if (skillRefSnapshot !== null && read(SKILL_REF) !== skillRefSnapshot) { try { writeFileSync(SKILL_REF, skillRefSnapshot); } catch { /* ro */ } }
  for (const id of KEY_IDS) await del(() => P.chatRateBucket.deleteMany({ where: { key: { contains: id } } }));
  for (const id of KEY_IDS) await del(() => P.apiKey.delete({ where: { id } }));
  await del(() => P.chatRateBucket.deleteMany({ where: { key: { contains: TAG } } }));
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  for (const id of ids) await del(() => P.chatRateBucket.deleteMany({ where: { key: { contains: id } } }));
  let tables: string[] = [];
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
  }
  for (const uid of USERS) await del(() => P.session.deleteMany({ where: { userId: uid } }));
  for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
  for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
  try {
    const left: string[] = [];
    if (ids.length > 0) {
      const inList = ids.map((x) => `'${x}'`).join(",");
      for (const t of tables) {
        const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`);
      }
    }
    const tenants = ids.length ? await P.tenant.count({ where: { id: { in: ids } } }) : 0;
    const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
    const keys = KEY_IDS.length ? await P.apiKey.count({ where: { id: { in: KEY_IDS } } }) : 0;
    const buckets = await P.chatRateBucket.count({ where: { OR: [{ key: { contains: TAG } }, ...KEY_IDS.map((k) => ({ key: { contains: k } })), ...ids.map((t) => ({ key: { contains: t } }))] } });
    const docOk = (docSnapshot === null || read(DOC_FILE) === docSnapshot) && (skillRefSnapshot === null || read(SKILL_REF) === skillRefSnapshot);
    chk("C3.8-CLEAN", "the oracle gives the QC database and the repo back exactly as found — throwaway tenants, users, sessions, API keys and their rate buckets gone · docs/api/CRM-API.md and the skill reference byte-identical · the seed untouched (read-only)",
      left.length === 0 && tenants === 0 && users === 0 && keys === 0 && buckets === 0 && docOk, "0 rows", `${left.join(" · ") || "-"} tenants=${tenants} users=${users} keys=${keys} buckets=${buckets} docs=${docOk}`, "MAJOR");
  } catch (e) {
    chk("C3.8-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C3.8: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);

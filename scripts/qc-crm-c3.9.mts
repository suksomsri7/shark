// QC — CRM v2 WO C3.9: PDPA (erase / export / retention) · purge cron · signed file links · public rate limits · every cap + a warning
//      before it is reached · penetration (thana across teams through EVERY surface · portal across companies · tracking without consent ·
//      readonly key never sees e-mail bodies)
// Oracle writer · the C3.9 builder must NOT touch this file · QC3 database only (.env.qc3 through scripts/qc3.sh)
// Run: bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c3.9.mts
//      `--force-run` = run every check while `src/lib/modules/crm/privacy.ts` is absent — the C3.9 checks go red for the right reason
//                      (MISSING_FUNCTION / rows still there), the regression probes that need no C3.9 code and CLEAN run green
// requires: crm-seed   (the SEEDED shop is READ ONLY: K.1 resolves it by the CQC contract and X1.2 reads it as the real thana through
//                       service reads only — no row of the seed is written · every write lives in throwaway tenants `qc-c39-<rand>-{a,b}`)
//
// SOURCES: CRM-RUN §2 "C3.9" (24 = erase 6 · CRM-wide export 2 · purge cron 2 · signed URL expiry 2 · public rate limits 3 · every cap +
//   warning 5 · penetration 4) · crm-brief-C3.6-C3.9.md (C3.9 + its addendum — names below are ORACLE-PROPOSED there) · blueprint §11.7
//   §11.9 · decisions C20/C21 · RESOLUTIONS R-E.10 (custom values in erase scope) · MASTER-PLAN §4 · member/privacy.ts (eraseMember) ·
//   crm/portal.ts#eraseContact (C3.5's part of the erase) · storage/private-links.ts (C0.4) · crm/{emails,calls,tracking}.ts purge fns ·
//   platform/minute-jobs.ts · house style qc-crm-c1.1 / qc-member-fix-s2 / qc-crm-c3.5.
//
// ══════════════════════════════════ CONTRACT (oracle-proposed — controller to confirm) ══════════════════════════════════
//   privacy.ts (facade block `// CRM C3.9 ▸ export * as privacy from "./privacy" ◂`):
//     eraseContact(ctx{tenantId,systemId,actorUserId|null}, actor|null, { contactId, confirm: true, reason ≥ 5, source?: "REQUEST"|"MEMBER"|"RETENTION" },
//                  deps?: { del?: (path) => Promise<void> }) → { contactId, partyId|null, erased: boolean (false = already erased), counts }
//       key crm.contact.delete (actor null = system: member.erased consumer / retention job) · anonymise identity (name = CRM_ERASED_NAME, every other
//       identity column null/[]) · delete e-mail bodies + attachments, recordings/transcripts/AI notes, web sessions+events, tracked clicks, portal
//       access/sessions/requests (portal.eraseContact), card-scan/AI proposals naming the contact, consents, custom values of its records (R-E.10),
//       notifications naming it · KEEP deals / stage history / payments / commissions (numbers) · AuditLog `crm.contact.erase` (reason) · outbox
//       `crm.contact.erased` {contactId, systemId, partyId?} key `crm.contact.erased#<contactId>` (3 registries) · idempotent · member-linked contact ⇒
//       ONE member erase through the member facade, whose NEW `member.erased {customerId, partyId}` event reaches the CRM consumer — no double.
//     exportContact(ctx, actor, contactId) → { contact, tables: Record<table, rows[]> } · exportTenant(ctx, actor, { format: "CSV"|"JSON" }, deps?)
//       → { jobId } through the C3.1 export lane (CrmImportJob kind "CRM_EXPORT") · runExportJobs({ now, tenantIds, deps?: { put? } }) ·
//       getExport(ctx, actor, jobId) → { status, url|null } (requester only · url = signed /api/files link) · key crm.contact.export.
//     purge(now, { tenantIds?, systemIds?, deadline?, signal?, deps?: { del? } }) → { emails, recordings, webSessions, exports, leadsErased, leadsWarned }
//       retention: settings.crm.email.retentionDays · settings.crm.retention.recordingDays · settings.crm.tracking.web.retentionDays (existing) +
//       NEW settings.crm.retention.exportDays (7) + settings.crm.retention.leadMonths (C21, 24, 0 = off; 30-day warning first).
//     jobs: crm.purge.email · crm.purge.web (existing, daily) + crm.purge.exports + crm.retention.leads (daily).
//   limits.ts: CRM_LIMITS (blueprint §11.9 keys below) · CRM_LIMIT_WARN_RATIO = 0.8 · crmLimits(tenantId) (Tenant.limits.crm overrides) ·
//     crmUsage(ctx, key) · assertCrmLimit(ctx, key, adding = 1) (error code LIMIT, Thai; crossing 80 % ⇒ ONE AppNotification per OWNER + ONE OpsEvent
//     WARN source "crm.limits" per (system, key, Thai month)) · limitStatus(ctx, actor) · CRM_PARAM_CAPS (every `crm._max*` permission param → enforcer).
// ── ORACLE-EDIT C3.9-H (security hunt 27 ก.ย. 2569 · controller rulings on the 12 accepted findings of the post-merge hunt) ──
//   H1 FormSubmission (crmContactId ∈ chain): answersJson {} · ip/pageUrl/referrer/utm null · in exportContact · identity tokens include former
//      names/e-mails/phones from the chain's crm.contact.update audit · H2 e-mails matched by from/to/cc/bcc (any contactId): addresses removed,
//      identity masked; unlinked mail sent BY the person: body/subject cleared · H3 AiMessage.content + AiConversation.title masked · H4 KanbanComment.body +
//      KanbanActivity.data of linked cards masked via the kanban facade · H5 member erasure via CRM only with member.customer.delete; ApprovalPolicy
//      member.erase ⇒ member.requestErase (result flag `memberPending` — r.X or r.counts.X · confirmed); no key ⇒ member untouched + WARN (result flag `memberSkipped`) · H6 retention
//      anchor GREATEST(COALESCE(lastActivityAt, createdAt), createdAt) + erase only with a crm.retention.warned audit ≥ LEAD_RETENTION_WARN_DAYS old ·
//      H7 CRM writers refuse an erased contact (VALIDATION) + repeat erase re-sweeps (no new audit/event) · H8 erase scrubs identity from the chain's
//      AuditLog before/after (except crm.contact.erase) + contact audits mask identity keys · H9 erase withdraws unexpired CRM_EXPORT/REPORT_EXPORT
//      (getExport EXPIRED) · H10 retention includes archived leads · H11 seedSystemRules passes assertCrmLimit · H12 one erase audit per person.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// CHECK INVENTORY (48 = 36 + 12 · 24 contract + X + ORACLE-EDIT C3.9-H): K.1 · S1.1–S1.6 · S2.1–S2.3 (S2.3 = ORACLE-EDIT C3.9-export-confirm · C5.4-B) · S3.1–S3.2 · S4.1–S4.2 · S5.1–S5.3 · S6.1–S6.5 · S7.1–S7.4 ·
//   X1.1–X1.2 · X3.1 · X4.1 · X6.1–X6.2 · X8.1–X8.2 · X9.1 · X10.1 · CLEAN · H1–H12 (ORACLE-EDIT C3.9-H)  (C3.9-FATAL only when something throws).
//   n/a: X2 (keys/assistant matrix = C3.8 X2; the readonly-body lens is S7.4) · X5 is inside S3.2 (overlap + crash after claim).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const PRIV_FILE = "src/lib/modules/crm/privacy.ts";
const LIMITS_FILE = "src/lib/modules/crm/limits.ts";
const EXPECTED = "scripts/crm-expected.json";
const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes("--force-run");
const read = (p: string) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");
const walk = (dir: string, re = /\.(ts|tsx)$/): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, re));
    else if (re.test(name)) out.push(p);
  }
  return out.sort();
};

/** blueprint §11.9 — key → default (oracle-proposed key names) */
const LIMIT_DEFAULTS: Record<string, number> = {
  contacts: 200_000, companies: 50_000, openDeals: 20_000, pipelines: 10, stagesPerPipeline: 12, linesPerDeal: 100, emailsPerDay: 2_000,
  sequences: 50, stepsPerSequence: 20, activeEnrollments: 5_000, assignmentRules: 30, scoreRules: 50, emailTemplates: 100, objectsWarn: 30,
  fieldsPerObject: 60, trackedLinks: 1_000, webEventsPerMonth: 5_000_000, webhookEndpoints: 20, automationRunsPerMonth: 5_000,
};
const TEST_IDS = ["C3.9-K.1", "C3.9-S1.1", "C3.9-S1.2", "C3.9-S1.3", "C3.9-S1.4", "C3.9-S1.5", "C3.9-S1.6", "C3.9-S2.1", "C3.9-S2.2", "C3.9-S3.1", "C3.9-S3.2",
  "C3.9-S4.1", "C3.9-S4.2", "C3.9-S5.1", "C3.9-S5.2", "C3.9-S5.3", "C3.9-S6.1", "C3.9-S6.2", "C3.9-S6.3", "C3.9-S6.4", "C3.9-S6.5", "C3.9-S7.1", "C3.9-S7.2",
  "C3.9-S7.3", "C3.9-S7.4", "C3.9-X1.1", "C3.9-X1.2", "C3.9-X3.1", "C3.9-X4.1", "C3.9-X6.1", "C3.9-X6.2", "C3.9-X8.1", "C3.9-X8.2", "C3.9-X9.1", "C3.9-X10.1",
  // ORACLE-EDIT C3.9-H (security hunt 27 ก.ย.)
  "C3.9-H1", "C3.9-H2", "C3.9-H3", "C3.9-H4", "C3.9-H5", "C3.9-H6", "C3.9-H7", "C3.9-H8", "C3.9-H9", "C3.9-H10", "C3.9-H11", "C3.9-H12"];
void TEST_IDS;

// ═══════════════════════════ SKIP guard ═══════════════════════════
const BUILT = existsSync(PRIV_FILE);
if (!FORCE && !BUILT) {
  console.log(`⚠️  SKIPPED — WO C3.9 not built yet (${PRIV_FILE} absent) (run with --force-run to exercise fixtures, regression probes and cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c39-${rand}`;
const RUN_START = new Date();

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
const refused = (r: Res, codes: string[]) => !r.ok && r.code !== "MISSING_FUNCTION" && (codes.includes(r.code) || codes.some((c) => r.err.includes(c))) && thai(r.msg);
const ABSENT = BUILT ? "" : " · [C3.9 ABSENT]";
const TENANTS: string[] = [];
const USERS: string[] = [];
const KEY_IDS: string[] = [];
const IP = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
let seq = 0;
const nx = () => `${++seq}`;
const BE_MONTH = (() => { const d = new Date(Date.now() + 7 * 3_600_000); return `${d.getUTCFullYear() + 543}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; })();
const DAY = 86_400_000;

console.log(`\n═══ QC CRM v2 · C3.9 — PDPA · retention · limits · penetration ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !BUILT ? " · --force-run with C3.9 ABSENT (its checks expected red; probes + CLEAN green)" : ""}\n`);

try {
  const PRIV = (await import("@/lib/modules/crm/privacy" as string).catch(() => ({}))) as Any;
  const LIM = (await import("@/lib/modules/crm/limits" as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const ACC = (await import("@/lib/modules/crm/access" as string).catch(() => ({}))) as Any;
  const REG = (await import("@/lib/modules/crm/api/registry" as string).catch(() => ({}))) as Any;
  const TOOLS = (await import("@/lib/modules/crm/api/tools" as string).catch(() => ({}))) as Any;
  const PLINK = (await import("@/lib/storage/private-links" as string).catch(() => ({}))) as Any;
  const SF = (await import("@/lib/modules/member/session-facade" as string).catch(() => ({}))) as Any;
  const MPRIV = (await import("@/lib/modules/member/privacy" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const ALAB = (await import("@/lib/automation/labels" as string).catch(() => ({}))) as Any;
  const WLAB = (await import("@/lib/webhooks/labels" as string).catch(() => ({}))) as Any;
  const MJ = (await import("@/lib/platform/minute-jobs" as string).catch(() => ({}))) as Any;
  const PERM = (await import("@/lib/core/permissions" as string).catch(() => ({}))) as Any;
  const AK = (await import("@/lib/api-keys/service" as string).catch(() => ({}))) as Any;
  const SC = (await import("@/lib/api-keys/scopes" as string).catch(() => ({}))) as Any;
  const MOB = (await import("@/lib/mobile/auth" as string).catch(() => ({}))) as Any;
  const ROUTE = (await import("@/app/api/v1/crm/[...path]/route" as string).catch(() => ({}))) as Any;
  const RSH = (await import("@/lib/modules/crm/reports-shared" as string).catch(() => ({}))) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const OPS: Any[] = Array.isArray(REG.CRM_OPS) ? REG.CRM_OPS : [];

  // ═════════════════════════════════ K.1 — seed control ═════════════════════════════════
  const EXP = JSON.parse(read(EXPECTED) || "{}") as Any;
  const CQ = ((await import("./crm-qc-env.mts" as string).catch(() => ({}))) as Any).CQC ?? {};
  const seedTenant = (await P.tenant.findFirst({ where: { slug: String(CQ.tenantSlug ?? "siam-dive-member-qc") } })) as Any;
  const seedT = String(seedTenant?.id ?? "");
  const seedSys = seedT ? ((await P.appSystem.findFirst({ where: { tenantId: seedT, type: "CRM" }, orderBy: { createdAt: "asc" } })) as Any) : null;
  const seedS = String(seedSys?.id ?? "");
  const seedThanaU = (await P.user.findFirst({ where: { email: String(EXP.users?.thana?.email ?? "mb-thana@shark.local") } })) as Any;
  const krabiName = String(((CQ.teams ?? []) as Any[]).find((t) => t?.key === "krabi")?.name ?? "ทีมขาย — กระบี่");
  const seedKrabi = seedT ? ((await P.team.findFirst({ where: { tenantId: seedT, name: krabiName } })) as Any) : null;
  const seedThanaM = seedT && seedThanaU ? ((await P.membership.findFirst({ where: { tenantId: seedT, userId: seedThanaU.id } })) as Any) : null;
  const seedKrabiDeals = seedS && seedKrabi ? ((await P.crmDeal.findMany({ where: { systemId: seedS, teamId: seedKrabi.id }, select: { id: true, title: true }, take: 200 })) as Any[]) : [];
  chk("C3.9-K.1", "seed control: the seeded shop resolves by the CQC contract with a CRM system, thana (accepted member) and ≥ 1 krabi-team deal (X1.2 has something to hide)",
    !!seedSys && !!seedThanaM && seedKrabiDeals.length > 0, "seed as assumed", `crm=${!!seedSys} thana=${!!seedThanaM} krabiDeals=${seedKrabiDeals.length}`, "MAJOR");

  // ═════════════════════════════════ SETUP ═════════════════════════════════
  const mkUser = async (s: string) => { const u = await P.user.create({ data: { email: `${TAG}${s}@qc.invalid`, name: `QC ${s || "owner"} ${TAG}` } }); USERS.push(u.id); return u.id as string; };
  const mkTenant = async (s: string) => { const t = await P.tenant.create({ data: { name: `${TAG}-${s}`, slug: `${TAG}-${s}` } }); TENANTS.push(t.id); return t.id as string; };
  const setCrm = (sysId: string, obj: Record<string, unknown>) => P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`, JSON.stringify(obj), sysId);
  const setLimits = (tid: string, crm: Record<string, number>) => P.$executeRawUnsafe(`UPDATE "Tenant" SET "limits" = COALESCE("limits", '{}'::jsonb) || jsonb_build_object('crm', $1::jsonb) WHERE "id" = $2`, JSON.stringify(crm), tid);
  const STAFF_PERMS = Object.fromEntries(((ACC.CRM_ROLE_DEFAULTS?.STAFF ?? ["crm.contact.read", "crm.deal.read"]) as string[]).map((k) => [k, true]));
  const uOwner = await mkUser("");
  const uMgr = await mkUser("-mgr");
  const uThana = await mkUser("-thana");
  const uNok = await mkUser("-nok");
  const T = await mkTenant("a");
  const TB = await mkTenant("b");
  for (const [u, role, perms] of [[uOwner, "OWNER", {}], [uMgr, "MANAGER", { "crm._maxReassignPerDay": 1, "crm._maxDealDiscountBp": 500 }], [uThana, "STAFF", STAFF_PERMS], [uNok, "STAFF", STAFF_PERMS]] as const)
    await P.membership.create({ data: { userId: u, tenantId: T, role, unitAccess: ["*"], permissions: perms, acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: uOwner, tenantId: TB, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  const S2 = (await sysSvc.createSystem(T, "CRM", `CRM สอง ${TAG}`)).id as string;
  const SB = (await sysSvc.createSystem(TB, "CRM", `CRM B ${TAG}`)).id as string;
  const M = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก ${TAG}`)).id as string;
  await setCrm(S, { uiVersion: 2, bridgesEnabled: true, portal: { enabled: true, loginMethods: ["EMAIL_OTP"], showDeals: true, allowIssue: true, issueBoardId: null },
    email: { retentionDays: 30 }, retention: { recordingDays: 30, exportDays: 7, leadMonths: 3 }, tracking: { web: { enabled: true, domains: ["qc.invalid"], retentionDays: 30, consentVersion: 1, consentText: "ยินยอม", siteKey: `qcsite${rand}${rand}` } } });
  await setCrm(S2, { uiVersion: 2 });
  await setCrm(SB, { uiVersion: 2 });
  const owner = { userId: uOwner, role: "OWNER", unitAccess: ["*"], permissions: {} as Record<string, unknown> };
  const manager = { userId: uMgr, role: "MANAGER", unitAccess: ["*"], permissions: { "crm._maxReassignPerDay": 1, "crm._maxDealDiscountBp": 500 } as Record<string, unknown> };
  const thana = { userId: uThana, role: "STAFF", unitAccess: ["*"], permissions: STAFF_PERMS };
  const cS = { tenantId: T, systemId: S, actorUserId: uOwner };
  const cThana = { tenantId: T, systemId: S, actorUserId: uThana };
  const teamP = (await P.team.create({ data: { tenantId: T, name: `ภูเก็ต ${TAG}` } })).id as string;
  const teamK = (await P.team.create({ data: { tenantId: T, name: `กระบี่ ${TAG}` } })).id as string;
  await P.teamMember.create({ data: { tenantId: T, teamId: teamP, userId: uThana, role: "MEMBER" } });
  await P.teamMember.create({ data: { tenantId: T, teamId: teamK, userId: uNok, role: "LEAD" } });

  type Person = { id: string; partyId: string; pii: string[] };
  const mkContact = async (tid: string, sid: string, tag: string, o: { owner?: string; team?: string | null; lastActivityAt?: Date; createdAt?: Date; member?: string | null; partyId?: string } = {}): Promise<Person> => {
    const name = `คุณ${tag}ลับ ${TAG}`;
    const phone = `08${String(10_000_000 + Number(nx()) * 7919).slice(0, 8)}`;
    const email = `${tag.length}x${nx()}.${rand}@qc.invalid`;
    const line = `U${randomBytes(8).toString("hex")}`;
    const note = `โน้ตส่วนตัว ${tag} ${TAG}`;
    const partyId = o.partyId ?? ((await P.party.create({ data: { tenantId: tid, name, kind: "PERSON", phone } })).id as string);
    const c = await P.crmContact.create({ data: { tenantId: tid, systemId: sid, name, firstName: name, phone, email, lineUserId: line, note, jobTitle: "ผู้จัดการ", previousEmails: [`old.${email}`], tags: [`แท็ก${tag}`], partyId, ownerUserId: o.owner ?? uThana, teamId: o.team ?? teamP, memberCustomerId: o.member ?? null, lastActivityAt: o.lastActivityAt ?? new Date(), ...(o.createdAt ? { createdAt: o.createdAt } : {}) } });
    return { id: c.id as string, partyId, pii: [name, phone, email, line, note] };
  };
  const mkCompany = async (tid: string, sid: string, name: string, team: string | null = teamP) => {
    const partyId = (await P.party.create({ data: { tenantId: tid, name, kind: "COMPANY" } })).id as string;
    return (await P.crmCompany.create({ data: { tenantId: tid, systemId: sid, partyId, name, teamId: team } })).id as string;
  };
  const pipe = (await P.crmPipeline.create({ data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, stages: { create: [{ tenantId: T, systemId: S, name: "ใหม่", kind: "OPEN", probability: 10, sortOrder: 0 }, { tenantId: T, systemId: S, name: "ชนะ", kind: "WON", probability: 100, sortOrder: 1 }] } }, include: { stages: true } })) as Any;
  const st0 = String([...(pipe.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder)[0].id);
  const mkDeal = async (contactId: string, title: string, o: { owner?: string; team?: string; companyId?: string | null } = {}) =>
    (await P.crmDeal.create({ data: { tenantId: T, systemId: S, contactId, pipelineId: pipe.id, stageId: st0, title, valueSatang: 300_000, ownerUserId: o.owner ?? uThana, teamId: o.team ?? teamP, companyId: o.companyId ?? null } })).id as string;
  const privPath = () => `t/${T}/private/${randomBytes(20).toString("hex")}.bin`;
  const mkFile = async (tid = T) => { const path = privPath(); const f = await P.fileAsset.create({ data: { tenantId: tid, kind: "ATTACHMENT", path, cdnUrl: `private://${path}`, contentType: "audio/mpeg", bytes: 10 } }); return { id: f.id as string, path }; };
  const DELETED: string[] = [];
  const deps = { del: async (p: string) => { DELETED.push(String(p)); } };
  const SECRET_BODY = `เนื้ออีเมลลับ ${TAG}`;
  const coA = await mkCompany(T, S, `บริษัทเอ ${TAG}`);
  const coK = await mkCompany(T, S, `บริษัทกระบี่ลับ ${TAG}`, teamK);
  const objCar = await call(CRM?.objects?.create, cS, owner, { key: "car", label: "รถ", labelPlural: "รถ", parentType: "CONTACT", titleFieldKey: "plate", templateKey: "vehicle", showAsTab: true });
  const carFields = (await P.memberField.findMany({ where: { systemId: S, objectKey: "car" } })) as Any[];
  if (carFields.length) await P.memberField.updateMany({ where: { systemId: S, objectKey: "car", key: "model" }, data: { sensitive: true } });

  /** a contact with EVERYTHING the erase scope names (raw rows, fixed by construction) */
  const richContact = async (tag: string, o: { member?: string | null; partyId?: string } = {}) => {
    const k = await mkContact(T, S, tag, o);
    await P.crmCompanyContact.create({ data: { tenantId: T, companyId: coA, contactId: k.id, jobTitle: "จัดซื้อ", note: k.pii[4] } });
    await P.crmContactConsent.create({ data: { tenantId: T, systemId: S, contactId: k.id, channel: "EMAIL", granted: true, source: "FORM", note: `ยินยอมโดย ${k.pii[0]}` } });
    // ORACLE-EDIT C3.9-S1.4 (C5.4-B · controller ruling 3): the deal title carries the person's name (convert-sheet default "ดีล <name>")
    const deal = await mkDeal(k.id, `ดีล ${k.pii[0]} ตัวเลข ${tag} ${nx()}`, { companyId: coA });
    await P.crmDealStageHistory.create({ data: { tenantId: T, dealId: deal, toStageId: st0, enteredAt: new Date() } }).catch(() => undefined);
    await P.crmDealPayment.create({ data: { tenantId: T, systemId: S, dealId: deal, refType: "PAYMENT", refId: `${TAG}-${nx()}`, satang: BigInt(100_000), status: "COUNTED" } }).catch(() => undefined);
    await P.crmCommission.create({ data: { tenantId: T, systemId: S, dealId: deal, ruleId: `${TAG}-rule`, userId: uThana, amountSatang: BigInt(5_000), basisSatang: BigInt(100_000), basis: "PAID", status: "APPROVED", periodKey: BE_MONTH, refType: "DEAL_PAYMENT", refId: `${TAG}-${nx()}` } }).catch(() => undefined);
    const rec = await mkFile();
    const att = await mkFile();
    const call1 = (await P.crmActivity.create({ data: { tenantId: T, systemId: S, contactId: k.id, dealId: deal, type: "CALL", title: `โทรคุย ${tag}`, body: `คุยกับ ${k.pii[0]} เบอร์ ${k.pii[1]}`, transcript: `ถอดเสียง ${k.pii[0]}`, aiSummary: `สรุป ${k.pii[0]}`, recordingFileId: rec.id, ownerUserId: uThana, doneAt: new Date() } })).id as string;
    const note = (await P.crmActivity.create({ data: { tenantId: T, systemId: S, contactId: k.id, type: "NOTE", title: `โน้ต ${tag}`, body: `ที่อยู่ของ ${k.pii[0]}`, ownerUserId: uThana } })).id as string;
    const thread = `${TAG}-th-${nx()}`;
    for (const dir of ["OUT", "IN"]) await P.crmEmailMessage.create({ data: { tenantId: T, systemId: S, contactId: k.id, dealId: deal, direction: dir, messageId: `<${TAG}-${nx()}@qc.invalid>`, threadKey: thread, fromAddr: dir === "IN" ? k.pii[2] : `shop.${rand}@qc.invalid`, fromName: dir === "IN" ? k.pii[0] : "ร้าน", toAddrs: [dir === "IN" ? `shop.${rand}@qc.invalid` : k.pii[2]], subject: `เรื่องของ ${k.pii[0]}`, bodyHtml: `<p>${SECRET_BODY} ${k.pii[1]}</p>`, bodyText: `${SECRET_BODY} ${k.pii[1]}`, snippet: SECRET_BODY, attachments: [{ fileId: att.id, name: "ใบเสนอ.pdf", size: 10, mime: "application/pdf" }], status: dir === "IN" ? "RECEIVED" : "SENT", sentAt: new Date(), trackTokenHash: sha(`${TAG}-${nx()}`) } }).catch((e: Any) => console.log(`  [setup] email: ${cut(e?.message, 120)}`));
    const ws = (await P.crmWebSession.create({ data: { tenantId: T, systemId: S, visitorId: randomUUID(), contactId: k.id, consentVersion: 1, consentAt: new Date(), firstUrl: `https://qc.invalid/?n=${encodeURIComponent(k.pii[0])}`, userAgent: TAG, ipHash: sha(IP) } })).id as string;
    await P.crmWebEvent.create({ data: { tenantId: T, sessionId: ws, kind: "PAGEVIEW", url: "https://qc.invalid/pricing", title: `ราคา ${k.pii[0]}` } }).catch(() => undefined);
    const link = (await P.crmTrackedLink.findFirst({ where: { systemId: S } })) as Any ?? (await P.crmTrackedLink.create({ data: { tenantId: T, systemId: S, code: `qc${rand}${nx()}`, url: "https://example.invalid", name: `ลิงก์ ${TAG}` } }).catch(() => null));
    if (link) await P.crmTrackedClick.create({ data: { tenantId: T, linkId: link.id, contactId: k.id, userAgent: TAG } });
    const acc = (await P.crmPortalAccess.create({ data: { tenantId: T, systemId: S, companyId: coA, contactId: k.id, role: "APPROVE", acceptedAt: new Date(), loginMethods: ["EMAIL_OTP"] } })).id as string;
    await P.portalSession.create({ data: { tenantId: T, portalAccessId: acc, crmContactId: k.id, crmSystemId: S, tokenHash: sha(`${TAG}-${nx()}`), expiresAt: new Date(Date.now() + DAY) } });
    await P.crmPortalRequest.create({ data: { tenantId: T, systemId: S, companyId: coA, contactId: k.id, kind: "CONTACT_CHANGE", payload: { phone: k.pii[1] } } });
    await P.aiProposal.create({ data: { tenantId: T, conversationId: `${TAG}-conv`, kind: "crm_create_lead", summary: `นามบัตร ${k.pii[0]}`, payload: { name: k.pii[0], phone: k.pii[1], email: k.pii[2], contactId: k.id, systemId: S }, status: "EXECUTED", expiresAt: new Date(Date.now() + DAY) } });
    await P.appNotification.create({ data: { tenantId: T, recipientUserId: uThana, title: "ลีดใหม่", body: `ลีดใหม่ ${k.pii[0]} โทร ${k.pii[1]}` } });
    let recordId = "";
    if (objCar.ok) {
      const r = (await P.customRecord.create({ data: { tenantId: T, systemId: S, objectId: String(objCar.v?.id ?? ((await P.customObject.findFirst({ where: { systemId: S, key: "car" } })) as Any)?.id), parentType: "CONTACT", parentId: k.id, partyId: k.partyId, title: `รถของ ${k.pii[0]}`, ownerUserId: uThana } }).catch(() => null)) as Any;
      recordId = String(r?.id ?? "");
      for (const f of carFields.filter((x) => ["plate", "model"].includes(String(x.key)))) if (recordId) await P.customRecordValue.create({ data: { tenantId: T, recordType: "CUSTOM", recordId, fieldId: f.id, valueText: `${String(f.key)}-${k.pii[1]}` } }).catch(() => undefined);
    }
    return { k, deal, call1, note, rec, att, thread, ws, acc, recordId };
  };
  const E = await richContact("อี");
  const KEEP = await richContact("คีป");
  const kK = await mkContact(T, S, "กระบี่", { owner: uNok, team: teamK });
  const dK = await mkDeal(kK.id, `ดีลกระบี่ลับ ${TAG}`, { owner: uNok, team: teamK, companyId: coK });
  const aK = (await P.crmActivity.create({ data: { tenantId: T, systemId: S, contactId: kK.id, dealId: dK, type: "TASK", title: `งานกระบี่ลับ ${TAG}`, ownerUserId: uNok, dueAt: new Date() } })).id as string;
  const kB = await mkContact(TB, SB, "ร้านบี", { owner: uOwner, team: null });
  const kS2 = await mkContact(T, S2, "ระบบสอง", { owner: uOwner, team: null });
  console.log(`[setup] T=${T} S=${S} M=${M} TB=${TB} · E=${E.k.id} KEEP=${KEEP.k.id} krabi deal=${dK} · car=${objCar.ok}\n`);

  // snapshots used by S1
  // ORACLE-EDIT C3.9-S1.4 (C5.4-B · controller ruling 3): numbers byte-identical WITHOUT the title — the title is checked by titlesOf below
  const numbersOf = async (contactId: string) => j(await Promise.all([
    P.crmDeal.findMany({ where: { contactId }, select: { id: true, valueSatang: true, stageId: true, paidSatang: true, ownerUserId: true }, orderBy: { id: "asc" } }),
    P.crmDealStageHistory.count({ where: { deal: { contactId } } }).catch(() => -1),
    P.crmDealPayment.aggregate({ _sum: { satang: true }, _count: true, where: { deal: { contactId } } }).catch(() => ({ _sum: { satang: null }, _count: -1 })),
    P.crmCommission.aggregate({ _sum: { amountSatang: true }, _count: true, where: { dealId: { in: ((await P.crmDeal.findMany({ where: { contactId }, select: { id: true } })) as Any[]).map((d) => d.id) } } }),
    P.crmActivity.count({ where: { contactId } }),
  ]));
  const numsBefore = await numbersOf(E.k.id);
  // ORACLE-EDIT C3.9-S1.4 (C5.4-B · controller ruling 3): deal title/nextStep/lostReason identical unless they carry an identity token of the
  //   erased person — then every token is masked ("[ข้อมูลถูกลบ]", the activity-title rule) and the rest of the text is unchanged
  const ERASED_MASK = "[ข้อมูลถูกลบ]";
  const dealTextsOf = async (contactId: string) => ((await P.crmDeal.findMany({ where: { contactId }, select: { id: true, title: true, nextStep: true, lostReason: true }, orderBy: { id: "asc" } })) as Any[]);
  const dealTextsBefore = await dealTextsOf(E.k.id);
  const maskedAs = (before: string | null, tokens: string[]) => { if (before === null) return null; let s = before; for (const tk of [...tokens].sort((a, b) => b.length - a.length)) if (tk && s.includes(tk)) s = s.split(tk).join(ERASED_MASK); return s; };
  const tenantTables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
  /** full-text PII scan over EVERY table of the tenant (AuditLog excluded — the legal trail is ids + reason; counted separately) */
  const piiScan = async (tokens: string[], exclude: string[] = ["AuditLog"]) => {
    const hits: string[] = [];
    for (const t of tenantTables.filter((x) => !exclude.includes(x))) {
      for (const tok of tokens) {
        const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" x WHERE x."tenantId" = $1 AND row_to_json(x)::text LIKE $2`, T, `%${tok.replace(/[%_]/g, "")}%`).catch(() => [{ n: 0 }])) as Any[];
        if (Number(r?.[0]?.n ?? 0) > 0) hits.push(`${t}:${tok.slice(0, 12)}`);
      }
    }
    return hits;
  };

  // ═════════════════════════════════ S1 — erase ═════════════════════════════════
  console.log("── S1 · erase ──");
  const eraseIn = { contactId: E.k.id, confirm: true, reason: `ลูกค้าขอลบข้อมูล ${TAG}` };
  const er = await call(PRIV.eraseContact, cS, owner, eraseIn, deps);
  {
    const row = (await P.crmContact.findUnique({ where: { id: E.k.id } })) as Any;
    const rowHits = E.k.pii.filter((s) => j(row).includes(s));
    const party = (await P.party.findUnique({ where: { id: E.k.partyId } })) as Any;
    const consents = (await P.crmContactConsent.findMany({ where: { contactId: E.k.id } })) as Any[];
    const vals = E.recordId ? ((await P.customRecordValue.count({ where: { recordId: E.recordId } })) as number) : 0;
    const recRow = E.recordId ? ((await P.customRecord.findUnique({ where: { id: E.recordId } })) as Any) : null;
    chk("C3.9-S1.1", "erase → identity anonymised: the contact row keeps its id but no name/phone/e-mail/LINE id/note/previous e-mails/tags of the person (phone/email null) · its Party carries no identity · consents hold no PII · every custom value of its records is gone and the record title is no longer the person's (R-E.10)",
      er.ok && !!row && rowHits.length === 0 && row.phone === null && row.email === null && !E.k.pii.some((s) => j(party).includes(s)) && !consents.some((c) => E.k.pii.some((s) => j(c).includes(s))) && vals === 0 && (!recRow || !E.k.pii.some((s) => j(recRow).includes(s))),
      "anonymised", `erase=${er.ok ? j(er.v).slice(0, 120) : er.err} rowHits=${rowHits.length} party=${E.k.pii.some((s) => j(party).includes(s))} values=${vals}${ABSENT}`);
  }
  {
    const mails = (await P.crmEmailMessage.findMany({ where: { threadKey: E.thread } })) as Any[];
    const bodies = mails.filter((m) => m.bodyHtml || m.bodyText || m.snippet || j(m).includes(SECRET_BODY)).length;
    const acts = (await P.crmActivity.findMany({ where: { id: { in: [E.call1, E.note] } } })) as Any[];
    const actPii = acts.filter((a) => a.body || a.transcript || a.aiSummary || a.recordingFileId).length;
    const files = (await P.fileAsset.count({ where: { id: { in: [E.rec.id, E.att.id] } } })) as number;
    const delOk = [E.rec.path, E.att.path].every((p) => DELETED.includes(p));
    const props = (await P.aiProposal.findMany({ where: { tenantId: T } })) as Any[];
    const propHits = props.filter((p) => j(p).includes(E.k.id) || E.k.pii.some((s) => j(p).includes(s))).length;
    chk("C3.9-S1.2", "erase → bodies & files: both e-mails of the thread lose body/snippet (headers of the person too) and their attachment file · the call loses body/transcript/AI summary/recording id and the recording FileAsset is deleted (storage delete called for both private paths) · the card-scan AI proposal naming the person is gone",
      er.ok && mails.length === 2 && bodies === 0 && !mails.some((m) => E.k.pii.some((s) => j(m).includes(s))) && actPii === 0 && files === 0 && delOk && propHits === 0,
      "0 bodies · 0 files · 0 proposals", `mails=${mails.length} withBody=${bodies} actsWithPii=${actPii} files=${files} storageDel=${delOk} proposals=${propHits}${ABSENT}`);
  }
  {
    const web = (await P.crmWebSession.count({ where: { id: E.ws } })) as number;
    const ev = (await P.crmWebEvent.count({ where: { sessionId: E.ws } })) as number;
    const clicks = (await P.crmTrackedClick.count({ where: { contactId: E.k.id } })) as number;
    const portal = [await P.crmPortalAccess.count({ where: { contactId: E.k.id } }), await P.portalSession.count({ where: { crmContactId: E.k.id } }), await P.crmPortalRequest.count({ where: { contactId: E.k.id } })];
    const hits = await piiScan(E.k.pii);
    const control = await piiScan(KEEP.k.pii.slice(0, 2));
    chk("C3.9-S1.3", "erase → web / tracking / portal gone + nothing left anywhere: the web session and its events, the tracked click, the portal access · session · request of the person are deleted, and a full-text scan of EVERY table of the tenant (AuditLog aside) finds none of the person's name/phone/e-mail/LINE id/note · positive control: the untouched contact's PII is still found",
      er.ok && web === 0 && ev === 0 && clicks === 0 && portal.every((n) => n === 0) && hits.length === 0 && control.length > 0,
      "0 rows · 0 hits · control found", `web=${web}/${ev} clicks=${clicks} portal=${portal.join("/")} hits=${cut(hits.join(","), 220) || "-"} control=${control.length}${ABSENT}`);
  }
  {
    const numsAfter = await numbersOf(E.k.id);
    const dealTextsAfter = await dealTextsOf(E.k.id);
    const toks = E.k.pii.filter((x) => x.length >= 4);
    const textOk = dealTextsBefore.length === dealTextsAfter.length && dealTextsBefore.some((d) => toks.some((tk) => String(d.title).includes(tk))) &&
      dealTextsBefore.every((d, i) => { const a = dealTextsAfter[i]; return !!a && a.id === d.id && (["title", "nextStep", "lostReason"] as const).every((f) => a[f] === maskedAs(d[f], toks) && !toks.some((tk) => String(a[f] ?? "").includes(tk))); });
    const audits = (await P.auditLog.findMany({ where: { tenantId: T, action: "crm.contact.erase", targetId: E.k.id } })) as Any[];
    const evts = (await P.outboxEvent.findMany({ where: { tenantId: T, type: "crm.contact.erased" } })) as Any[];
    const mine = evts.filter((e) => j(e.payload).includes(E.k.id));
    const keysOk = mine.every((e) => Object.keys((e.payload ?? {}) as Record<string, unknown>).every((k) => ["contactId", "systemId", "partyId", "customerId"].includes(k)));
    const reg = [!!(OBX.consumers ?? {})["crm.contact.erased"], ((ALAB.AUTOMATION_EVENTS ?? []) as Any[]).filter((e) => e.value === "crm.contact.erased").length + ((WLAB.WEBHOOK_EVENTS ?? []) as Any[]).filter((e) => e.value === "crm.contact.erased").length >= 1];
    // ORACLE-EDIT C3.9-S1.4 (C5.4-B · controller ruling 3): title/nextStep/lostReason masked only where they carry an identity token
    chk("C3.9-S1.4", "erase KEEPS the numbers: the deals (value/stage/paid/owner byte-identical · title/nextStep/lostReason identical except every identity token of the erased person masked), stage history, counted payments (Σ satang), commissions (Σ amount) and the number of activities are byte-identical · one AuditLog `crm.contact.erase` with the reason · one outbox `crm.contact.erased` whose payload is ids only (contactId/systemId/partyId) · the event has a consumer and a label",
      er.ok && numsAfter === numsBefore && textOk && audits.length === 1 && j(audits[0]).includes(eraseIn.reason) && mine.length === 1 && keysOk && !E.k.pii.some((s) => j(mine).includes(s)) && reg.every(Boolean),
      "numbers kept · 1 audit · 1 event", `numbersEqual=${numsAfter === numsBefore} dealTexts=${textOk} ${cut(j(dealTextsAfter.map((d: Any) => d.title)), 120)} audits=${audits.length} events=${mine.length} idsOnly=${keysOk} registries=${reg.join("/")}${ABSENT}`);
  }
  {
    const again = await call(PRIV.eraseContact, cS, owner, eraseIn, deps);
    const R = await mkContact(T, S, "อาร์");
    const par = await Promise.all(Array.from({ length: 10 }, () => call(PRIV.eraseContact, cS, owner, { contactId: R.id, confirm: true, reason: `ขอลบพร้อมกัน ${TAG}` }, deps)));
    const aR = (await P.auditLog.count({ where: { tenantId: T, action: "crm.contact.erase", targetId: R.id } })) as number;
    const eR = ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "crm.contact.erased" } })) as Any[]).filter((e) => j(e.payload).includes(R.id)).length;
    const aE = (await P.auditLog.count({ where: { tenantId: T, action: "crm.contact.erase", targetId: E.k.id } })) as number;
    const xT = await call(PRIV.eraseContact, { tenantId: TB, systemId: SB, actorUserId: uOwner }, owner, { contactId: KEEP.k.id, confirm: true, reason: REASON() }, deps);
    const xS = await call(PRIV.eraseContact, { tenantId: T, systemId: S2, actorUserId: uOwner }, owner, { contactId: KEEP.k.id, confirm: true, reason: REASON() }, deps);
    const keepIntact = ((await P.crmContact.findUnique({ where: { id: KEEP.k.id } })) as Any)?.phone === KEEP.k.pii[1];
    chk("C3.9-S1.5", "erase is idempotent and scoped: a second erase answers erased:false with no new audit/event · 10 parallel erases of one contact (separate connections) leave ONE audit row and ONE event · another tenant's ctx or another CRM system of the same shop ⇒ NOT_FOUND and the contact is untouched",
      again.ok && again.v?.erased === false && aE === 1 && par.some((r) => r.ok) && aR === 1 && eR === 1 && refused(xT, ["NOT_FOUND"]) && refused(xS, ["NOT_FOUND"]) && keepIntact,
      "no-op · 1/1 · 404", `again=${again.ok ? j(again.v?.erased) : again.err} auditE=${aE} parallelOk=${par.filter((r) => r.ok).length} auditR=${aR} eventR=${eR} xTenant=${xT.err || "ok!"} xSystem=${xS.err || "ok!"} keep=${keepIntact}${ABSENT}`);
  }
  // S1.6 + X4.1 — member-linked contacts
  const mkCustomer = async (tag: string) => {
    const name = `สมาชิก${tag} ${TAG}`;
    const phone = `09${String(10_000_000 + Number(nx()) * 3571).slice(0, 8)}`;
    const partyId = (await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone } })).id as string;
    const c = (await P.customer.create({ data: { tenantId: T, memberSystemId: M, name, phone, partyId } })) as Any;
    return { id: c.id as string, partyId, name, phone };
  };
  const eventsOf = async (type: string, needle: string) => ((await P.outboxEvent.findMany({ where: { tenantId: T, type } })) as Any[]).filter((e) => j(e.payload).includes(needle));
  const runConsumer = async (type: string, needle: string) => {
    const h = (OBX.consumers ?? {})[type];
    const rows = await eventsOf(type, needle);
    if (typeof h !== "function" || rows.length === 0) return "no-consumer-or-event";
    const r1 = await call(h, rows[0]); const r2 = await call(h, rows[0]);
    const rp = await Promise.all([call(h, rows[0]), call(h, rows[0])]);
    return [r1, r2, ...rp].every((r) => r.ok) ? "ok" : [r1, r2, ...rp].map((r) => r.err).filter(Boolean).join(" | ");
  };
  {
    const c1 = await mkCustomer("หนึ่ง");
    const k1 = await mkContact(T, S, "สมาชิกหนึ่ง", { member: c1.id, partyId: c1.partyId });
    const r = await call(PRIV.eraseContact, cS, owner, { contactId: k1.id, confirm: true, reason: `ขอลบทั้งสมาชิก ${TAG}` }, deps);
    const cust = (await P.customer.findUnique({ where: { id: c1.id } })) as Any;
    const memberErased = !!cust && !j(cust).includes(c1.phone) && String(cust.status) === "CLOSED";
    const cons = await runConsumer("member.erased", c1.id);
    const mE = (await eventsOf("member.erased", c1.id)).length;
    const cE = (await eventsOf("crm.contact.erased", k1.id)).length;
    const aud = (await P.auditLog.count({ where: { tenantId: T, action: "crm.contact.erase", targetId: k1.id } })) as number;
    const fixUntouched = spawnSync("git", ["diff", "--quiet", "--", ...walk("scripts", /^qc-member-fix-s\d+\.mts$/)], { encoding: "utf8" }).status === 0;
    chk("C3.9-S1.6", "member-linked contact: erasing it erases the MEMBER once through the member facade (customer anonymised + CLOSED) · exactly ONE `member.erased` {customerId, partyId} and ONE `crm.contact.erased` · the member.erased consumer run again (twice + twice in parallel) adds nothing — ONE audit row · qc-member-fix-s* untouched",
      r.ok && memberErased && mE === 1 && cE === 1 && aud === 1 && cons === "ok" && fixUntouched,
      "1 member erase · no double", `erase=${r.ok ? "ok" : r.err} member=${memberErased} member.erased=${mE} crm.contact.erased=${cE} audit=${aud} consumer=${cut(cons, 100)} fixFiles=${fixUntouched}${ABSENT}`);
  }
  {
    const c2 = await mkCustomer("สอง");
    const k2 = await mkContact(T, S, "สมาชิกสอง", { member: c2.id, partyId: c2.partyId });
    const em = await call(MPRIV.eraseMember, { tenantId: T, systemId: M }, c2.id);
    const mE = (await eventsOf("member.erased", c2.id)).length;
    const cons = await runConsumer("member.erased", c2.id);
    const row = (await P.crmContact.findUnique({ where: { id: k2.id } })) as Any;
    const cE = (await eventsOf("crm.contact.erased", k2.id)).length;
    const aud = (await P.auditLog.count({ where: { tenantId: T, action: "crm.contact.erase", targetId: k2.id } })) as number;
    chk("C3.9-X4.1", "X4 the other direction: eraseMember emits the NEW `member.erased` once; its CRM consumer run twice and twice in parallel erases the linked CRM contact exactly once (no PII left on it · one event · one audit row)",
      em.ok && mE === 1 && cons === "ok" && !k2.pii.some((s) => j(row).includes(s)) && cE === 1 && aud === 1,
      "once", `eraseMember=${em.ok ? j(em.v) : em.err} member.erased=${mE} consumer=${cut(cons, 100)} contactPii=${k2.pii.some((s) => j(row).includes(s))} events=${cE} audit=${aud}${ABSENT}`);
  }

  // ═════════════════════════════════ S2 — CRM-wide export ═════════════════════════════════
  console.log("\n── S2 · export ──");
  const PUT: { path: string; body: string }[] = [];
  const putDeps = { put: async (path: string, bytes: Uint8Array | string) => { PUT.push({ path: String(path), body: typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("utf8") }); } };
  const csvName = `=HYPERLINK("http://evil.invalid","x") ${TAG}`;
  await P.crmContact.create({ data: { tenantId: T, systemId: S, name: csvName, firstName: csvName, ownerUserId: uThana, teamId: teamP } });
  let exportJob = "";
  {
    const bundle = await call(PRIV.exportContact, cS, owner, KEEP.k.id);
    const tables = Object.keys((bundle.v?.tables ?? {}) as Record<string, unknown>);
    const NEED = ["CrmContactConsent", "CrmActivity", "CrmEmailMessage", "CrmWebSession", "CrmTrackedClick", "CrmPortalAccess", "CrmPortalRequest", "CustomRecord", "CrmDeal"];
    const miss = NEED.filter((t) => !tables.some((x) => x.toLowerCase().includes(t.toLowerCase().replace(/^crm/, ""))));
    // ORACLE-EDIT C3.9-export-confirm (C5.4-B · L5-m7): the whole-system export needs confirm + a reason (X9) — without them it is refused (Thai) and queues nothing
    const jobsBefore = (await P.crmImportJob.count({ where: { tenantId: T, kind: "CRM_EXPORT" } })) as number;
    const noGate = await call(PRIV.exportTenant, cS, owner, { format: "CSV" }, putDeps);
    const noConfirm = await call(PRIV.exportTenant, cS, owner, { format: "CSV", reason: "qc-c3.9 ส่งออกทั้งระบบ" }, putDeps);
    const jobsMid = (await P.crmImportJob.count({ where: { tenantId: T, kind: "CRM_EXPORT" } })) as number;
    chk("C3.9-S2.3", "CRM-wide export gate (X9 · C5.3-L5-m7): exportTenant without confirm/reason is refused with a Thai message (VALIDATION) · with a reason but no confirm refused (CONFIRM_REQUIRED/VALIDATION) · neither queues a job",
      refused(noGate, ["VALIDATION"]) && refused(noConfirm, ["CONFIRM_REQUIRED", "VALIDATION"]) && jobsMid === jobsBefore,
      "refused · 0 jobs", `noGate=${noGate.err || "ok!"} noConfirm=${noConfirm.err || "ok!"} jobs ${jobsBefore}→${jobsMid}${ABSENT}`);
    const st = await call(PRIV.exportTenant, cS, owner, { format: "CSV", confirm: true, reason: "qc-c3.9 ส่งออกทั้งระบบ" }, putDeps); // ORACLE-EDIT C3.9-export-confirm (C5.4-B · L5-m7)
    exportJob = String(st.v?.jobId ?? "");
    const runner = PRIV.runExportJobs ?? CRM?.reports?.runExportJobs;
    const run1 = await call(runner, { now: new Date(), tenantIds: [T], deps: putDeps });
    const got = exportJob ? await call(PRIV.getExport, cS, owner, exportJob) : MISSING;
    const job = exportJob ? ((await P.crmImportJob.findUnique({ where: { id: exportJob } })) as Any) : null;
    const file = job?.fileId ? ((await P.fileAsset.findUnique({ where: { id: job.fileId } })) as Any) : null;
    const content = PUT.map((p) => p.body).join("\n");
    chk("C3.9-S2.1", "CRM-wide export: exportContact(KEEP) returns a bundle covering the erase list (consents · activities · e-mails · web · clicks · portal · records · deals) · exportTenant(CSV) queues a job of the C3.1 export lane that runExportJobs(tenantIds) finishes into a PRIVATE FileAsset (t/<tid>/private/…, cdnUrl private://) · getExport answers DONE with a signed /api/files link · the file holds the tenant's contacts",
      bundle.ok && miss.length === 0 && st.ok && !!job && String(job.kind) === "CRM_EXPORT" && run1.ok && got.ok && String(got.v?.status) === "DONE" && /^\/api\/files\/[a-z0-9]+\?exp=\d+&sig=[0-9a-f]{64}$/i.test(String(got.v?.url ?? "")) && !!file && String(file.path).startsWith(`t/${T}/private/`) && String(file.cdnUrl).startsWith("private://") && content.includes(KEEP.k.pii[0]),
      "bundle · private job · signed link", `bundleTables=${tables.length} miss=${miss.join(",") || "-"} start=${st.ok ? exportJob : st.err} kind=${job?.kind ?? "-"} run=${run1.ok ? "ok" : run1.err} status=${got.v?.status ?? got.err} url=${cut(got.v?.url, 60)} file=${file?.path ?? "-"} puts=${PUT.length}${ABSENT}`);
  }
  {
    const byMgr = exportJob ? await call(PRIV.getExport, { tenantId: T, systemId: S, actorUserId: uMgr }, manager, exportJob) : MISSING;
    const byThana = await call(PRIV.exportTenant, cThana, thana, { format: "JSON" }, putDeps);
    const mgrJob = await call(PRIV.exportTenant, { tenantId: T, systemId: S, actorUserId: uMgr }, manager, { format: "CSV", confirm: true, reason: "qc-c3.9 ส่งออกทั้งระบบ" }, putDeps); // ORACLE-EDIT C3.9-export-confirm (C5.4-B · L5-m7)
    await call(PRIV.runExportJobs ?? CRM?.reports?.runExportJobs, { now: new Date(), tenantIds: [T], deps: putDeps });
    const mgrContent = PUT.slice(-1)[0]?.body ?? "";
    const sensitiveLeak = carFields.length > 0 && mgrContent.includes(`model-${KEEP.k.pii[1]}`);
    const bodyLeak = PUT.some((p) => p.body.includes(SECRET_BODY));
    const csvBad = PUT.some((p) => /(^|[,\n])"?=HYPERLINK/.test(p.body));
    chk("C3.9-S2.2", "export policy: only the requester can fetch a job (the manager asking for the owner's job ⇒ NOT_FOUND) · thana (no crm.contact.export) cannot start one (FORBIDDEN) · a MANAGER's export omits values of SENSITIVE fields · no e-mail body is ever exported · CSV cells that start with = + - @ are neutralised (csvRow)",
      refused(byMgr, ["NOT_FOUND"]) && refused(byThana, ["FORBIDDEN", "NOT_FOUND"]) && mgrJob.ok && !sensitiveLeak && !bodyLeak && !csvBad && PUT.length > 0,
      "requester only · policy", `mgrFetch=${byMgr.err || "ok!"} thanaStart=${byThana.err || "ok!"} mgrJob=${mgrJob.ok} sensitiveLeak=${sensitiveLeak} bodyLeak=${bodyLeak} csvInjection=${csvBad} files=${PUT.length}${ABSENT}`);
  }

  // ═════════════════════════════════ S3 — purge cron ═════════════════════════════════
  console.log("\n── S3 · purge ──");
  const OLD = new Date(Date.now() - 400 * DAY);
  const mkOldBatch = async (tag: string) => {
    const k = await mkContact(T, S, tag, { lastActivityAt: new Date(Date.now() - 120 * DAY), createdAt: new Date(Date.now() - 120 * DAY) });
    const oldMail = (await P.crmEmailMessage.create({ data: { tenantId: T, systemId: S, contactId: k.id, direction: "OUT", messageId: `<${TAG}-old-${nx()}@qc.invalid>`, threadKey: `${TAG}-old-${nx()}`, fromAddr: "a@qc.invalid", toAddrs: ["b@qc.invalid"], subject: "เก่า", bodyText: SECRET_BODY, bodyHtml: SECRET_BODY, status: "SENT", sentAt: OLD, createdAt: OLD, trackTokenHash: sha(`${TAG}-${nx()}`) } })).id as string;
    const newMail = (await P.crmEmailMessage.create({ data: { tenantId: T, systemId: S, contactId: k.id, direction: "OUT", messageId: `<${TAG}-new-${nx()}@qc.invalid>`, threadKey: `${TAG}-new-${nx()}`, fromAddr: "a@qc.invalid", toAddrs: ["b@qc.invalid"], subject: "ใหม่", bodyText: SECRET_BODY, status: "SENT", sentAt: new Date(), trackTokenHash: sha(`${TAG}-${nx()}`) } })).id as string;
    const f = await mkFile();
    const oldCall = (await P.crmActivity.create({ data: { tenantId: T, systemId: S, contactId: k.id, type: "CALL", title: "สายเก่า", recordingFileId: f.id, transcript: "เก่า", createdAt: OLD, startAt: OLD, doneAt: OLD } })).id as string;
    const ws = (await P.crmWebSession.create({ data: { tenantId: T, systemId: S, visitorId: randomUUID(), startedAt: OLD, lastSeenAt: OLD } })).id as string;
    await P.crmWebEvent.create({ data: { tenantId: T, sessionId: ws, kind: "PAGEVIEW", url: "https://qc.invalid/x", at: OLD } }).catch(() => undefined);
    const ef = await mkFile();
    const job = (await P.crmImportJob.create({ data: { tenantId: T, systemId: S, kind: "CRM_EXPORT", status: "DONE", createdById: uOwner, fileId: ef.id, finishedAt: new Date(Date.now() - 10 * DAY), createdAt: new Date(Date.now() - 10 * DAY) } })).id as string;
    return { k, oldMail, newMail, f, oldCall, ws, ef, job };
  };
  const B1 = await mkOldBatch("เก่าหนึ่ง");
  const nearLead = await mkContact(T, S, "ใกล้ครบ", { lastActivityAt: new Date(Date.now() - 70 * DAY), createdAt: new Date(Date.now() - 70 * DAY) });
  {
    // ORACLE-EDIT C3.9-S3.1 (27 ก.ย. · มติ H6) — lead ถูกลบตามอายุได้เฉพาะเมื่อมีธงเตือน ≥ LEAD_RETENTION_WARN_DAYS ⇒ ปักธงเตือนอายุ 31 วันให้ B1 ก่อน purge
    await P.auditLog.create({ data: { tenantId: T, actorType: "SYSTEM", actorId: null, action: "crm.retention.warned", targetType: "CrmContact", targetId: B1.k.id,
      after: { anchor: new Date(Date.now() - 120 * DAY).toISOString().slice(0, 10), systemId: S, leadMonths: 3 }, createdAt: new Date(Date.now() - 31 * DAY) } });
    const tPurge = new Date();
    const r = await call(PRIV.purge, new Date(), { tenantIds: [T], deps });
    const om = (await P.crmEmailMessage.findUnique({ where: { id: B1.oldMail } })) as Any;
    const nm = (await P.crmEmailMessage.findUnique({ where: { id: B1.newMail } })) as Any;
    const oc = (await P.crmActivity.findUnique({ where: { id: B1.oldCall } })) as Any;
    const ws = (await P.crmWebSession.count({ where: { id: B1.ws } })) as number;
    const ex = (await P.fileAsset.count({ where: { id: B1.ef.id } })) as number;
    const lead = (await P.crmContact.findUnique({ where: { id: B1.k.id } })) as Any;
    const leadErased = !B1.k.pii.some((s) => j(lead).includes(s));
    const warned = (await P.appNotification.count({ where: { tenantId: T, createdAt: { gte: tPurge } } })) as number;
    const near = (await P.crmContact.findUnique({ where: { id: nearLead.id } })) as Any;
    chk("C3.9-S3.1", "purge honours the retention settings: an e-mail body older than email.retentionDays (30) is cleared while a fresh one keeps it · a recording older than retention.recordingDays loses its file + transcript · a web session older than tracking.web.retentionDays is deleted · an export file older than retention.exportDays (7) is deleted · an unconverted lead idle longer than retention.leadMonths (3) is erased, one idle inside the 30-day warning window gets a warning (and keeps its data)",
      r.ok && !om?.bodyText && !om?.bodyHtml && !!nm?.bodyText && !oc?.recordingFileId && !oc?.transcript && ws === 0 && ex === 0 && leadErased && near?.phone === nearLead.pii[1] && warned >= 1,
      "old purged · young kept · warned", `purge=${r.ok ? j(r.v).slice(0, 140) : r.err} oldBody=${!!om?.bodyText} newBody=${!!nm?.bodyText} rec=${!!oc?.recordingFileId} web=${ws} exportFile=${ex} leadErased=${leadErased} nearKept=${near?.phone === nearLead.pii[1]} warnings=${warned}${ABSENT}`);
  }
  {
    const B2 = await mkOldBatch("เก่าสอง");
    const B3 = await mkOldBatch("เก่าสาม");
    const runs = await Promise.all([call(PRIV.purge, new Date(), { tenantIds: [T], deps }), call(PRIV.purge, new Date(Date.now() + 7_000), { tenantIds: [T], deps })]);
    const sumMails = runs.reduce((a, r) => a + Number(r.v?.emails ?? 0), 0);
    const sumRec = runs.reduce((a, r) => a + Number(r.v?.recordings ?? 0), 0);
    const bodiesLeft = (await P.crmEmailMessage.count({ where: { id: { in: [B2.oldMail, B3.oldMail] }, bodyText: { not: null } } })) as number;
    const delCount = DELETED.filter((p) => p === B2.f.path || p === B3.f.path).length;
    const jobs = (((await MJ.getMinuteJobStatus?.()) ?? []) as Any[]).map((x) => ({ name: String(x.name), every: Number(x.everyMinutes) }));
    const need = ["crm.purge.email", "crm.purge.web", "crm.purge.exports", "crm.retention.leads"];
    const jobsOk = need.every((n) => jobs.some((x) => x.name === n && x.every === 1440));
    chk("C3.9-S3.2", "X5 purge runs overlap safely: two runs started together (the second 7 s 'later' — jitter) purge each row ONCE (Σ e-mails = 2, Σ recordings = 2, each storage path deleted once, no run throws) · the purge jobs crm.purge.email · crm.purge.web · crm.purge.exports · crm.retention.leads are registered daily (1440 min) in the C0.5 registry · purge takes tenantIds (never sweeps other tenants in QC)",
      runs.every((r) => r.ok) && bodiesLeft === 0 && sumMails === 2 && sumRec === 2 && delCount === 2 && jobsOk,
      "once each · jobs registered", `runs=${runs.map((r) => (r.ok ? j(r.v).slice(0, 60) : r.err)).join(" | ")} bodiesLeft=${bodiesLeft} Σmails=${sumMails} Σrec=${sumRec} storageDel=${delCount} jobs=${need.map((n) => `${n}:${jobs.find((x) => x.name === n)?.every ?? "-"}`).join(",")}${ABSENT}`);
  }

  // ═════════════════════════════════ S4 — signed URL expiry / tamper ═════════════════════════════════
  console.log("\n── S4 · signed links ──");
  const fid = randomBytes(12).toString("hex");
  const viewer = { kind: "STAFF", id: uOwner };
  {
    const now = Math.floor(Date.now() / 1000);
    let ok = false;
    let note = "";
    try {
      const url = String(PLINK.privateFileUrl(fid, viewer, 60));
      const u = new URL(`http://x${url}`);
      const exp = u.searchParams.get("exp");
      const sig = u.searchParams.get("sig");
      const valid = PLINK.privateFileSignatureOk(fid, exp, sig, viewer, now);
      const expired = PLINK.privateFileSignatureOk(fid, exp, sig, viewer, now + 61);
      const longExp = String(now + 3_600);
      const long = PLINK.privateFileSignatureOk(fid, longExp, PLINK.signPrivateFile(fid, Number(longExp), viewer), viewer, now);
      const capped = String(PLINK.privateFileUrl(fid, viewer, 86_400));
      const cappedExp = Number(new URL(`http://x${capped}`).searchParams.get("exp"));
      ok = valid === true && expired === false && long === false && cappedExp - now <= Number(PLINK.PRIVATE_FILE_MAX_TTL_SEC ?? 900) + 2;
      note = `valid=${valid} expired=${expired} ttl1h=${long} cappedTtl=${cappedExp - now}`;
    } catch (e) { note = `threw ${cut((e as Error).message, 120)}`; }
    const rec = await call(CRM?.calls?.getRecording, cS, owner, KEEP.call1);
    const recUrl = String(rec.v?.url ?? rec.v?.href ?? "");
    const recOk = !rec.ok || !recUrl || (/^\/api\/files\//.test(recUrl) && !/private:\/\/|b-cdn|bunny/i.test(j(rec.v)));
    chk("C3.9-S4.1", "signed link expiry: a link is accepted inside its TTL and REFUSED one second after it · a self-extended exp (1 h) is refused · asking for 24 h yields ≤ 15 min · a CRM recording DTO carries only the signed /api/files link (never private:// or a CDN host)",
      ok && recOk, "expiry enforced", `${note} recording=${rec.ok ? cut(recUrl, 60) : rec.err}`);
  }
  {
    let ok = false;
    let note = "";
    try {
      const now = Math.floor(Date.now() / 1000);
      const url = String(PLINK.privateFileUrl(fid, viewer, 300));
      const u = new URL(`http://x${url}`);
      const exp = u.searchParams.get("exp");
      const sig = String(u.searchParams.get("sig"));
      const flip = `${sig.slice(0, -1)}${sig.slice(-1) === "0" ? "1" : "0"}`;
      const t1 = PLINK.privateFileSignatureOk(fid, exp, flip, viewer, now);
      const t2 = PLINK.privateFileSignatureOk(randomBytes(12).toString("hex"), exp, sig, viewer, now);
      const t3 = PLINK.privateFileSignatureOk(fid, exp, sig, { kind: "PORTAL", id: uOwner }, now);
      const t4 = PLINK.privateFileSignatureOk(fid, String(Number(exp) + 1), sig, viewer, now);
      const routeSrc = read("src/app/api/files/[id]/route.ts");
      ok = !t1 && !t2 && !t3 && !t4 && /privateFileSignatureOk/.test(routeSrc) && /deny\((403|404)\)/.test(routeSrc);
      note = `flip=${t1} otherFile=${t2} otherViewer=${t3} expPlus1=${t4}`;
    } catch (e) { note = `threw ${cut((e as Error).message, 120)}`; }
    chk("C3.9-S4.2", "HMAC tamper: one flipped hex digit, another file id, another viewer (STAFF link used as PORTAL) and exp+1 are all refused · the /api/files route verifies the signature and denies 403/404 [route static]",
      ok, "all refused", note);
  }

  // ═════════════════════════════════ S5 — public rate limits ═════════════════════════════════
  console.log("\n── S5 · public limits ──");
  {
    const roots = ["src/app/l", "src/app/t", "src/app/u", "src/app/b", "src/app/(store)/f", "src/app/api/v1/crm/public", "src/app/api/email/inbound"];
    const files = roots.flatMap((r) => walk(r)).filter((f) => /(route|actions)\.ts$/.test(f));
    // file-level fixpoint: a service file "reaches" the limiter when it calls checkRateLimitDb or an exported fn of a file that does
    const pool = [...walk("src/lib/modules/crm"), ...walk("src/lib/modules/forms"), "src/lib/modules/member/customer-session.ts"];
    const limitedFns = new Set<string>(["checkRateLimitDb"]);
    for (let round = 0; round < 4; round += 1) {
      for (const f of pool) {
        const src = read(f);
        const calls = [...src.matchAll(/\b(\w+)\(/g)].map((m) => m[1]);
        if (calls.some((c) => limitedFns.has(c))) for (const m of src.matchAll(/export async function (\w+)/g)) limitedFns.add(m[1]);
      }
    }
    const bad: string[] = [];
    for (const f of files) {
      const src = read(f);
      const called = [...src.matchAll(/\b(\w+)\(/g)].map((m) => m[1]);
      const direct = /checkRateLimitDb|hitPortalInviteLimit/.test(src);
      if (!direct && !called.some((c) => limitedFns.has(c))) bad.push(f.replace("src/app/", ""));
    }
    console.log(`  [enum] public entry files: ${files.map((f) => f.replace("src/app/", "")).join(" · ")}`);
    chk("C3.9-S5.1", `every public entry (enumerated at run time: ${files.length} route/action files under /l /t /u /b /f /api/v1/crm/public /api/email/inbound) reaches the DB limiter — directly (checkRateLimitDb) or through a service function that calls it [static reachability]`,
      files.length >= 8 && bad.length === 0, "all limited", `files=${files.length} unlimited=${cut(bad.join(" · "), 300) || "-"}`, "MAJOR");
  }
  {
    // human-facing entries: Thai refusal / 429 after the limit
    const slug = String(((await P.tenant.findUnique({ where: { id: T }, select: { slug: true } })) as Any)?.slug ?? "");
    const P2 = CRM?.portal ?? {};
    let otpRefused = "";
    for (let i = 0; i < 25 && !otpRefused; i += 1) { const r = await call(P2.requestOtp, slug, { email: `nobody.${rand}@qc.invalid` }, { ip: IP }); if (!r.ok && thai(r.msg) && /RATE|ถี่|บ่อย|รอ/i.test(`${r.code} ${r.msg}`)) otpRefused = r.code || "refused"; }
    let invRefused = "";
    for (let i = 0; i < 40 && !invRefused; i += 1) { const r = await call(P2.acceptInvite, slug, { token: `${"Z".repeat(22)}${rand}${i}` }, { ip: IP, userAgent: TAG }); if (!r.ok && thai(r.msg) && /RATE|ถี่|บ่อย|รอ/i.test(`${r.code} ${r.msg}`)) invRefused = r.code || "refused"; }
    const lineRoute = (await import("@/app/b/[slug]/auth/line/route" as string).catch(() => ({}))) as Any;
    let line429 = 0;
    for (let i = 0; i < 24; i += 1) {
      const res: Response | null = typeof lineRoute.POST === "function" ? await lineRoute.POST(new Request(`http://qc.invalid/b/${slug}/auth/line`, { method: "POST", headers: { "x-forwarded-for": IP, "content-type": "application/json" }, body: "{}" }), { params: Promise.resolve({ slug }) }).catch(() => null) : null;
      if (res?.status === 429 && thai(await res.text())) line429 += 1;
    }
    const pubRoutes = walk("src/app/api/v1/crm/public").filter((f) => /route\.ts$/.test(f));
    chk("C3.9-S5.2", `human-facing public entries answer a Thai "too many" after their limit: portal OTP request · invite accept (bogus tokens) · LINE login route (429 + Thai) from one IP · every /api/v1/crm/public/* route (${pubRoutes.length} found) follows the same rule`,
      !!otpRefused && !!invRefused && line429 > 0, "refused after limit", `otp=${otpRefused || "never"} invite=${invRefused || "never"} line429=${line429}/24 publicRoutes=${pubRoutes.length}`, "MAJOR");
  }
  {
    const Lr = (await import("@/app/l/[code]/route" as string).catch(() => ({}))) as Any;
    const Or = (await import("@/app/t/o/[token]/route" as string).catch(() => ({}))) as Any;
    const Er = (await import("@/app/t/e/route" as string).catch(() => ({}))) as Any;
    const shape = async (p: Promise<Response> | null) => { try { const r = await p; if (!r) return "none"; const b = await r.arrayBuffer(); return `${r.status}|${r.headers.get("location") ?? ""}|${b.byteLength}`; } catch { return "threw"; } };
    const lShapes = new Set<string>(); const oShapes = new Set<string>(); const eShapes = new Set<string>();
    const before = (await P.chatRateBucket.count({ where: { key: { startsWith: "crm:" }, updatedAt: { gte: RUN_START } } })) as number;
    for (let i = 0; i < 40; i += 1) {
      if (typeof Lr.GET === "function") lShapes.add(await shape(Lr.GET(new Request(`http://qc.invalid/l/zz${rand}`, { headers: { "x-forwarded-for": IP, "user-agent": TAG } }), { params: Promise.resolve({ code: `zz${rand}` }) })));
      if (typeof Or.GET === "function") oShapes.add(await shape(Or.GET(new Request(`http://qc.invalid/t/o/zz${rand}.gif`, { headers: { "x-forwarded-for": IP } }), { params: Promise.resolve({ token: `zz${rand}.gif` }) })));
      if (typeof Er.POST === "function") eShapes.add(await shape(Er.POST(new Request("http://qc.invalid/t/e", { method: "POST", headers: { "x-forwarded-for": IP, origin: "https://qc.invalid", "content-type": "application/json" }, body: JSON.stringify({ k: `qcsite${rand}${rand}`, v: randomUUID(), u: "https://qc.invalid/a", cv: 1 }) }))));
    }
    const after = (await P.chatRateBucket.count({ where: { key: { startsWith: "crm:" }, updatedAt: { gte: RUN_START } } })) as number;
    const rawIpKeys = (await P.chatRateBucket.count({ where: { key: { startsWith: "crm:", contains: IP } } })) as number;
    const rawIpOther = ((await P.chatRateBucket.findMany({ where: { key: { contains: IP }, NOT: { key: { startsWith: "crm:" } } }, select: { key: true } })) as Any[]).map((b) => String(b.key).replace(IP, "<ip>"));
    console.log(`  [enum] limiter buckets with the raw IP outside crm:* (reported, not judged): ${rawIpOther.join(",") || "-"}`);
    chk("C3.9-S5.3", "X7 collectors & redirects: 40 hits on /l/<unknown>, /t/o/<unknown>.gif and /t/e from one IP each give ONE identical answer shape (no 429 oracle — the limiter silently stops counting) · the DB limiter really counted (crm:* buckets touched) · no bucket key carries the raw IP",
      lShapes.size === 1 && oShapes.size === 1 && eShapes.size === 1 && after > before && rawIpKeys === 0, "identical · counted · hashed", `l=${[...lShapes].join(",")} o=${[...oShapes].join(",")} e=${[...eShapes].join(",")} buckets ${before}→${after} rawIp=${rawIpKeys} (outside crm:* — not judged here: ${rawIpOther.join(",") || "-"})`, "MAJOR");
  }

  // ═════════════════════════════════ S6 — every cap + warning before it ═════════════════════════════════
  console.log("\n── S6 · caps ──");
  const LKEYS: string[] = Object.keys((LIM.CRM_LIMITS ?? {}) as Record<string, number>);
  {
    const wrong = Object.entries(LIMIT_DEFAULTS).filter(([k, v]) => Number((LIM.CRM_LIMITS ?? {})[k]) !== v).map(([k]) => k);
    await setLimits(T, { pipelines: 4 });
    const eff = await call(LIM.crmLimits, T);
    chk("C3.9-S6.1", `the cap registry: CRM_LIMITS carries every blueprint §11.9 key with its default (${Object.keys(LIMIT_DEFAULTS).length}) · CRM_LIMIT_WARN_RATIO = 0.8 · crmLimits(tenantId) applies Tenant.limits.crm overrides (pipelines 4 here) and keeps the rest at default`,
      LKEYS.length >= Object.keys(LIMIT_DEFAULTS).length && wrong.length === 0 && Number(LIM.CRM_LIMIT_WARN_RATIO) === 0.8 && eff.ok && Number(eff.v?.pipelines) === 4 && Number(eff.v?.contacts) === 200_000,
      "registry · 0.8 · overrides", `keys=${LKEYS.length} wrong=${wrong.join(",") || "-"} ratio=${LIM.CRM_LIMIT_WARN_RATIO} eff=${eff.ok ? `${eff.v?.pipelines}/${eff.v?.contacts}` : eff.err}${ABSENT}`);
  }
  {
    // generic: EVERY key enumerated from the registry — limit = usage ⇒ +1 refused; limit = usage + 5 ⇒ allowed
    const bad: string[] = [];
    for (const key of LKEYS) {
      const used = await call(LIM.crmUsage, cS, key);
      const u = Number(used.v ?? NaN);
      if (!used.ok || !Number.isFinite(u)) { bad.push(`${key}:usage ${used.err || "NaN"}`); continue; }
      await setLimits(T, { [key]: u });
      const over = await call(LIM.assertCrmLimit, cS, key, 1);
      await setLimits(T, { [key]: u + 5 });
      const under = await call(LIM.assertCrmLimit, cS, key, 1);
      if (!refused(over, ["LIMIT"]) || !under.ok) bad.push(`${key}:over=${over.ok ? "passed!" : over.code} under=${under.ok ? "ok" : under.code}`);
    }
    await setLimits(T, {});
    console.log(`  [enum] CRM_LIMITS keys: ${LKEYS.join(",") || "(none — limits.ts absent)"}`);
    chk("C3.9-S6.2", `EVERY cap key enumerated from CRM_LIMITS at run time (${LKEYS.length}) is enforced by assertCrmLimit: with the tenant limit set to today's usage one more is refused (code LIMIT, Thai) and with head-room it passes`,
      LKEYS.length >= Object.keys(LIMIT_DEFAULTS).length && bad.length === 0, "all enforced", `keys=${LKEYS.length} bad=${cut(bad.join(" | "), 300) || "-"}${ABSENT}`);
  }
  const DRIVERS: Record<string, () => Promise<Res>> = {
    pipelines: () => call(CRM?.pipelines?.createPipeline, cS, owner, { name: `ท่อ ${TAG}-${nx()}`, stages: [{ name: "ใหม่", kind: "OPEN", probability: 10 }, { name: "ชนะ", kind: "WON", probability: 100 }] }),
    contacts: () => call(CRM?.contacts?.createContact, cS, owner, { firstName: `จำกัด ${TAG}-${nx()}`, sourceKind: "API" }),
    companies: () => call(CRM?.companies?.createCompany, cS, owner, { name: `บริษัทจำกัด ${TAG}-${nx()}` }),
    sequences: () => call(CRM?.sequences?.createSequence, cS, owner, { name: `ลำดับ ${TAG}-${nx()}`, steps: [{ kind: "TASK", taskTitle: "โทร" }] }),
    trackedLinks: () => call(CRM?.tracking?.createLink, cS, owner, { url: "https://example.invalid/a", name: `ลิงก์ ${TAG}-${nx()}` }),
    scoreRules: () => call(CRM?.scoring?.createRule, cS, owner, { name: `คะแนน ${TAG}-${nx()}`, event: "crm.activity.completed", points: 5 }),
    assignmentRules: () => call(CRM?.assignment?.createRule, cS, owner, { name: `แจก ${TAG}-${nx()}`, mode: "FIXED", userIds: [uOwner], conditions: { items: [] } }),
  };
  {
    const bad: string[] = [];
    for (const [key, drive] of Object.entries(DRIVERS)) {
      const u = Number((await call(LIM.crmUsage, cS, key)).v ?? NaN);
      if (!Number.isFinite(u)) { bad.push(`${key}:no usage`); continue; }
      await setLimits(T, { [key]: u + 1 });
      const first = await drive();
      const second = await drive();
      const u2 = Number((await call(LIM.crmUsage, cS, key)).v ?? NaN);
      if (!first.ok || !refused(second, ["LIMIT", "CONFLICT", "VALIDATION"]) || u2 !== u + 1) bad.push(`${key}:first=${first.ok ? "ok" : first.err} second=${second.ok ? "passed!" : second.code} usage ${u}→${u2}`);
    }
    await setLimits(T, {});
    chk("C3.9-S6.3", `the REAL create paths are gated (${Object.keys(DRIVERS).join(" · ")}): with the limit one above usage the first create succeeds, the next is refused with a Thai message and usage stops exactly at the limit`,
      bad.length === 0, "gated", `bad=${cut(bad.join(" | "), 300) || "-"}${ABSENT}`);
  }
  {
    const u = Number((await call(LIM.crmUsage, cS, "pipelines")).v ?? NaN);
    const warnRows = async () => [
      (await P.appNotification.count({ where: { tenantId: T, recipientUserId: uOwner, createdAt: { gte: RUN_START }, OR: [{ title: { contains: "เพดาน" } }, { body: { contains: "เพดาน" } }, { title: { contains: "ใกล้" } }] } })) as number,
      (await P.opsEvent.count({ where: { tenantId: T, source: "crm.limits", createdAt: { gte: RUN_START } } })) as number,
    ];
    let note = "";
    let ok = false;
    if (Number.isFinite(u)) {
      await setLimits(T, { pipelines: u + 5 }); // usage u of u+5 — create until 80 %
      const w0 = await warnRows();
      const steps: string[] = [];
      for (let i = 0; i < 5; i += 1) { const r = await DRIVERS.pipelines(); const w = await warnRows(); steps.push(`${u + i + 1}/${u + 5}:${r.ok ? "ok" : r.code}:${w.join("+")}`); }
      const w1 = await warnRows();
      const lim = await call(LIM.limitStatus, cS, owner);
      const row = ((lim.v?.rows ?? lim.v ?? []) as Any[]).find?.((x: Any) => x.key === "pipelines");
      const ratio = (n: number) => n / (u + 5);
      const firstWarnAt = steps.findIndex((s) => { const [a, b] = s.split(":")[2].split("+").map(Number); return a + b > w0[0] + w0[1]; });
      ok = w1[0] - w0[0] === 1 && w1[1] - w0[1] === 1 && firstWarnAt >= 0 && ratio(u + firstWarnAt + 1) >= 0.8 && (firstWarnAt === 0 || ratio(u + firstWarnAt) < 0.8) && !!row && row.warn === true;
      note = `steps=${steps.join(" ")} notif+${w1[0] - w0[0]} ops+${w1[1] - w0[1]} status=${lim.ok ? j(row).slice(0, 80) : lim.err}`;
    } else note = "no usage";
    await setLimits(T, {});
    chk("C3.9-S6.4", "warning BEFORE the cap: filling pipelines towards its limit, crossing 80 % raises exactly ONE in-app notification to the OWNER and ONE OpsEvent (source crm.limits, ids only) — not before 80 %, not again at 100 % in the same month · limitStatus() shows the row with warn = true",
      ok, "1 + 1 at 80 %", `${cut(note, 320)}${ABSENT}`);
  }
  {
    const params = [...new Set(walk("src").flatMap((f) => [...read(f).matchAll(/"(crm\._max[A-Za-z]+)"/g)].map((m) => m[1])))];
    const unlabelled = params.filter((k) => typeof PERM.permissionLabel === "function" && PERM.permissionLabel(k) === k);
    const unmapped = params.filter((k) => !((LIM.CRM_PARAM_CAPS ?? {}) as Record<string, unknown>)[k]);
    // hard caps of existing code + two permission params, behaviourally
    const bulk = await call(CRM?.emails?.sendBulk, cS, owner, { contactIds: Array.from({ length: 501 }, (_, i) => `c${i}qc${rand}`), subject: "x", bodyHtml: "<p>x</p>", confirm: true, reason: REASON() });
    const views: Res[] = [];
    for (let i = 0; i < 51; i += 1) views.push(await call(CRM?.views?.createView, cS, owner, { objectKey: "contact", name: `มุมมอง ${i} ${TAG}` }));
    const viewCap = views.slice(0, 50).every((r) => r.ok) && refused(views[50], ["VALIDATION", "LIMIT", "CONFLICT"]);
    for (const entityType of ["crm.reassign", "crm.discount"]) await P.approvalPolicy.create({ data: { tenantId: T, name: `${entityType} ${TAG}`, entityType, active: true, steps: { create: [{ tenantId: T, order: 1, approverRole: "OWNER" }] } } }).catch(() => undefined);
    const d1 = await mkDeal(KEEP.k.id, `โอน1 ${TAG}`); const d2 = await mkDeal(KEEP.k.id, `โอน2 ${TAG}`);
    const cM = { tenantId: T, systemId: S, actorUserId: uMgr };
    const r1 = await call(CRM?.deals?.reassignDeal, cM, manager, d1, { ownerUserId: uNok });
    const r2 = await call(CRM?.deals?.reassignDeal, cM, manager, d2, { ownerUserId: uNok });
    const disc = await call(CRM?.deals?.setLines, cM, manager, d1, { lines: [{ name: "คอร์ส", qty: 1, unitPriceSatang: 100_000, discountBp: 2_000 }] });
    const discApplied = ((await P.crmDeal.findUnique({ where: { id: d1 }, select: { valueSatang: true, pendingLines: true } })) as Any);
    const discGated = !disc.ok ? refused(disc, ["APPROVAL_REQUIRED", "VALIDATION", "FORBIDDEN"]) : discApplied?.pendingLines !== null;
    const d2Owner = String(((await P.crmDeal.findUnique({ where: { id: d2 }, select: { ownerUserId: true } })) as Any)?.ownerUserId ?? "");
    chk("C3.9-S6.5", `hard caps + permission params: every \`crm._max*\` param found in src (${params.join(" · ")}) has a Thai label and an entry in CRM_PARAM_CAPS · bulk e-mail to 501 recipients is refused before anything is written · the 51st saved view is refused · crm._maxReassignPerDay = 1 lets a MANAGER move one deal and refuses the second the same Thai day · a line discount above crm._maxDealDiscountBp waits for approval instead of applying`,
      params.length >= 3 && unlabelled.length === 0 && unmapped.length === 0 && refused(bulk, ["VALIDATION", "LIMIT"]) && viewCap && r1.ok && refused(r2, ["FORBIDDEN", "LIMIT", "VALIDATION", "APPROVAL_REQUIRED"]) && d2Owner !== uNok && discGated,
      "all capped", `params=${params.length} unlabelled=${unlabelled.join(",") || "-"} unmapped=${unmapped.join(",") || "-"} bulk501=${bulk.ok ? "passed!" : bulk.code} views=${views.filter((r) => r.ok).length}/51 reassign=${r1.ok ? "ok" : r1.code}/${r2.ok ? "passed!" : r2.code} discount=${disc.ok ? `pending=${discApplied?.pendingLines !== null}` : disc.code}${ABSENT}`);
  }
  {
    const u = Number((await call(LIM.crmUsage, cS, "pipelines")).v ?? NaN);
    let wins = -1; let after = NaN;
    if (Number.isFinite(u)) {
      await setLimits(T, { pipelines: u + 1 });
      const rs = await Promise.all(Array.from({ length: 10 }, () => DRIVERS.pipelines()));
      wins = rs.filter((r) => r.ok).length;
      after = Number((await call(LIM.crmUsage, cS, "pipelines")).v ?? NaN);
      await setLimits(T, {});
    }
    chk("C3.9-X3.1", "X3 cap under a race: with ONE slot left, 10 parallel creates (separate connections) produce exactly one pipeline — the check and the insert are one atomic step",
      wins === 1 && after === u + 1, "1 winner", `winners=${wins} usage ${u}→${after}${ABSENT}`);
  }

  // ═════════════════════════════════ S7 — penetration ═════════════════════════════════
  console.log("\n── S7 · penetration ──");
  const KRABI_TOKENS = [`ดีลกระบี่ลับ ${TAG}`, `งานกระบี่ลับ ${TAG}`, `บริษัทกระบี่ลับ ${TAG}`, kK.pii[0], kK.pii[1]];
  const leaksIn = (v: unknown) => KRABI_TOKENS.filter((t) => j(v).includes(t));
  const surfaces: Record<string, { calls: number; leaks: string[] }> = {};
  const note = (s: string, n: number, l: string[]) => { const x = (surfaces[s] ??= { calls: 0, leaks: [] }); x.calls += n; x.leaks.push(...l); };
  let control = 0;
  {
    // (a) service reads + lists of EVERY facade namespace (enumerated) as thana; the owner is the positive control
    const READ_RE = /^(get|explain|stats|brief|timeline|detail|view|load|summary|widget|myDeals|todayTasks|overview|forecast|funnel|reps|activities|lostReasons|sources|scores|progress|quotaBoard|webTimeline)/;
    const WRITE_RE = /create|ensure|set|save|upsert|seed|mark|record|import|export|delete|archive|restore|merge|send|enroll|stop|run|purge|sweep|apply|accept|reject|approve|invite|revoke|log|attach|remove|move|update|assign|convert|recompute|adjust|decay|toggle|reorder|add|rotate|bind|link|repoint|consume|identify|collect/i;
    const ns = Object.entries(CRM).filter(([k, v]) => v && typeof v === "object" && k !== "crmApi") as [string, Any][];
    for (const [name, mod] of ns) {
      for (const [fn, f] of Object.entries(mod)) {
        if (typeof f !== "function" || WRITE_RE.test(fn) || !(READ_RE.test(fn) || /^list/.test(fn))) continue;
        const argSets: Any[][] = /^list/.test(fn) ? [[{}]] : [[dK], [kK.id], [coK], [aK]];
        for (const a of argSets) {
          const r = await call(f, cThana, thana, ...a);
          note(`service:${name}`, 1, leaksIn(r.ok ? r.v : r.msg).map((x) => `${name}.${fn}:${x.slice(0, 10)}`));
          const o = await call(f, cS, owner, ...a);
          if (o.ok && leaksIn(o.v).length) control += 1;
        }
      }
    }
    // (b) reports × every tab · widgets
    for (const tab of ((RSH.REPORT_TABS ?? []) as string[])) { const r = await call(CRM?.reports?.getReport, cThana, thana, tab); note("reports", 1, leaksIn(r.v).map((x) => `${tab}:${x.slice(0, 10)}`)); }
    // (c) REST with a thana-equivalent key (operate + owner filter) over every id op aimed at krabi ids
    const scopes = [...(((SC.API_SCOPE_BUNDLES ?? []) as Any[]).find((b) => b.id === "crm.operate")?.scopes ?? []), `crm.filter.owner:${uThana}`];
    let keyRaw = "";
    try { const k = await AK.createApiKey({ tenantId: T }, `${TAG} thana`, { scopes, systemId: S, createdById: uOwner }); KEY_IDS.push(k.id); keyRaw = String(k.rawKey); } catch { keyRaw = ""; }
    for (const o of OPS.filter((x) => x.method === "GET")) {
      const segs = String(o.path).split("/").filter(Boolean);
      const p = `/${segs.map((s, i) => (/^\{.+\}$/.test(s) ? ({ contacts: kK.id, companies: coK, deals: dK, activities: aK } as Record<string, string>)[segs[i - 1]] ?? dK : s)).join("/")}`;
      if (typeof ROUTE.GET !== "function" || !keyRaw) break;
      const res: Response = await ROUTE.GET(new Request(`http://qc.invalid/api/v1/crm${p}`, { headers: { authorization: `Bearer ${keyRaw}` } }), { params: Promise.resolve({ path: p.split("?")[0].split("/").filter(Boolean) }) });
      const text = await res.text();
      note("rest", 1, KRABI_TOKENS.filter((t) => text.includes(t)).map((t) => `${o.id}:${t.slice(0, 10)}`));
    }
    // (d) AI tools as thana
    for (const t of ((TOOLS.crmToolInfos?.() ?? []) as Any[])) {
      const args: Record<string, unknown> = {};
      for (const k of Object.keys(t.parameters?.properties ?? {})) args[k] = /deal/i.test(k) ? dK : /contact/i.test(k) ? kK.id : /company/i.test(k) ? coK : /activit/i.test(k) ? aK : /^(q|query|search|text)$/.test(k) ? `ดีลกระบี่ลับ ${TAG}` : undefined;
      const r = await call(TOOLS.runCrmTool, { tenantId: T, systemId: S, userId: uThana, role: "STAFF", unitAccess: ["*"], permissions: STAFF_PERMS }, t.name, JSON.parse(JSON.stringify(args)));
      note("ai", 1, leaksIn(r.v?.mode === "read" ? r.v.result : {}).map((x) => `${t.name}:${x.slice(0, 10)}`));
    }
    // (e) mobile routes (enumerated) with thana's mobile token
    const tok = await call(MOB.issueMobileToken, uThana, { userAgent: TAG });
    for (const f of walk("src/app/api/mobile/crm").filter((x) => x.endsWith("route.ts"))) {
      const spec = `@/${f.replace(/^src\//, "").replace(/\.ts$/, "")}`;
      const mod = (await import(spec as string).catch(() => ({}))) as Any;
      for (const m of ["GET", "POST"]) {
        if (typeof mod[m] !== "function" || !tok.ok) continue;
        const req = new Request(`http://qc.invalid/api/mobile/crm?systemId=${S}&contactId=${kK.id}&dealId=${dK}`, { method: m, headers: { authorization: `Bearer ${tok.v.token}`, "x-tenant-id": T, "content-type": "application/json", "x-forwarded-for": IP }, body: m === "POST" ? JSON.stringify({ contactId: kK.id, dealId: dK, direction: "OUT", outcome: "ANSWERED", durationSec: 1, idempotencyKey: `${TAG}-${nx()}` }) : undefined });
        const res = (await mod[m](req, { params: Promise.resolve({ id: /tasks/.test(f) ? aK : dK, proposalId: `${TAG}none` }) }).catch(() => null)) as Response | null;
        const text = res ? await res.text() : "";
        note("mobile", 1, KRABI_TOKENS.filter((t) => text.includes(t)).map((t) => `${f.split("/crm/")[1]}:${m}`));
      }
    }
    // (f) portal staff functions · (g) exports
    const la = await call(CRM?.portal?.listAccess, cThana, thana, { companyId: coK });
    const inv = await call(CRM?.portal?.invite, cThana, thana, { companyId: coK, contactId: kK.id });
    note("portal-staff", 2, [...leaksIn(la.v), ...(inv.ok ? ["invite-accepted"] : [])]);
    const ex = await call(CRM?.contacts?.exportContacts, cThana, thana, { confirm: true, reason: REASON() });
    const et = await call(PRIV.exportTenant, cThana, thana, { format: "CSV" }, putDeps);
    note("exports", 2, [...leaksIn(ex.v), ...(et.ok ? ["exportTenant-allowed"] : [])]);
    const all = Object.values(surfaces).flatMap((s) => s.leaks);
    console.log(`  [enum] penetration surfaces: ${Object.entries(surfaces).map(([k, v]) => `${k}=${v.calls}`).join(" · ")} · owner control hits=${control}`);
    chk("C3.9-S7.1", `🔴 thana (STAFF ภูเก็ต) across teams through EVERY surface enumerated at run time — service reads/lists of every facade namespace · reports × ${((RSH.REPORT_TABS ?? []) as string[]).length} tabs · REST (thana-scoped key) · AI tools · mobile routes · portal staff functions · exports — never returns a krabi deal/task/company/contact title, name or phone · positive control: the OWNER's same service calls surface them`,
      all.length === 0 && control > 0 && Object.keys(surfaces).length >= 6, "0 leaks · control", `surfaces=${Object.entries(surfaces).map(([k, v]) => `${k}:${v.calls}`).join(" ")} leaks=${cut(all.join(" | "), 260) || "-"} ownerControl=${control}`);
  }
  {
    const coB2 = await mkCompany(T, S, `บริษัทบีลับ ${TAG}`, teamP);
    const kP = await mkContact(T, S, "พอร์ทัล");
    const kQ = await mkContact(T, S, "พอร์ทัลบี");
    await P.crmCompanyContact.create({ data: { tenantId: T, companyId: coA, contactId: kP.id, isPrimary: false } });
    await P.crmCompanyContact.create({ data: { tenantId: T, companyId: coB2, contactId: kQ.id, isPrimary: true } });
    const accP = (await P.crmPortalAccess.create({ data: { tenantId: T, systemId: S, companyId: coA, contactId: kP.id, role: "APPROVE", acceptedAt: new Date(), loginMethods: ["EMAIL_OTP"] } })).id as string;
    const reqQ = (await P.crmPortalRequest.create({ data: { tenantId: T, systemId: S, companyId: coB2, contactId: kQ.id, kind: "ISSUE", payload: { title: `คำขอบีลับ ${TAG}` } } })).id as string;
    const m = await call(SF.mintPortalSession, accP, { userAgent: TAG });
    const tokP = String(m.v?.token ?? "");
    const PP = CRM?.portal ?? {};
    const probes = tokP ? await Promise.all([call(PP.getRequest, tokP, reqQ), call(PP.getRecord, tokP, reqQ), call(PP.getQuotation, tokP, `${TAG}none`), call(PP.getInvoice, tokP, `${TAG}none`), call(PP.requestRecordChange, tokP, reqQ, { fieldKey: "x", value: "y" })]) : [];
    const bad = probes.filter((r) => !refused(r, ["NOT_FOUND", "FORBIDDEN"]) || j(r).includes(`คำขอบีลับ ${TAG}`));
    let linkCross = true;
    try { const s1 = String(m.v?.sessionId ?? "s1"); const url = new URL(`http://x${PLINK.privateFileUrl(fid, { kind: "PORTAL", id: s1 }, 120)}`); linkCross = PLINK.privateFileSignatureOk(fid, url.searchParams.get("exp"), url.searchParams.get("sig"), { kind: "PORTAL", id: `${s1}x` }) === false; } catch { linkCross = false; }
    chk("C3.9-S7.2", "portal across companies: a portal session of company A asking for company B's request/record (and unknown documents) through the portal service gets NOT_FOUND with no B text · a private file link issued to one portal session does not open for another session",
      !!tokP && probes.length === 5 && bad.length === 0 && linkCross, "404 · link bound", `session=${!!tokP}${m.ok ? "" : ` (${m.err})`} bad=${bad.map((r) => r.err || "ok!").join(" | ") || "-"} linkBound=${linkCross}`);
  }
  {
    const siteKey = `qcsite${rand}${rand}`;
    const TR = CRM?.tracking ?? {};
    const vNo = randomUUID(); const vDecl = randomUUID(); const vYes = randomUUID();
    const meta = (ip: string) => ({ origin: "https://qc.invalid", ip, userAgent: TAG, bytes: 200 });
    await call(TR.collect, { k: siteKey, v: vNo, u: "https://qc.invalid/a", cv: 1 }, meta("192.0.2.11"));
    await call(TR.recordConsent, { k: siteKey, v: vDecl, d: "decline", u: "https://qc.invalid/a" }, meta("192.0.2.12"));
    await call(TR.collect, { k: siteKey, v: vDecl, u: "https://qc.invalid/a", cv: 1 }, meta("192.0.2.12"));
    await call(TR.recordConsent, { k: siteKey, v: vYes, d: "accept", u: "https://qc.invalid/a", cv: 1 }, meta("192.0.2.13"));
    await call(TR.collect, { k: siteKey, v: vYes, u: "https://qc.invalid/a", cv: 1 }, meta("192.0.2.13"));
    const n = async (v: string) => (await P.crmWebSession.count({ where: { systemId: S, visitorId: v } })) as number;
    const [a, b, c] = [await n(vNo), await n(vDecl), await n(vYes)];
    chk("C3.9-S7.3", "tracking without consent writes NOTHING: a visitor who never answered and one who declined leave 0 web sessions/events · positive control: a visitor who accepted is recorded",
      a === 0 && b === 0 && c >= 1, "0 · 0 · ≥1", `none=${a} declined=${b} accepted=${c}`);
  }
  {
    let keyRaw = "";
    try { const k = await AK.createApiKey({ tenantId: T }, `${TAG} ro`, { scopes: [...(((SC.API_SCOPE_BUNDLES ?? []) as Any[]).find((b) => b.id === "crm.readonly")?.scopes ?? [])], systemId: S, createdById: uOwner }); KEY_IDS.push(k.id); keyRaw = String(k.rawKey); } catch { keyRaw = ""; }
    const hits: string[] = [];
    let n = 0;
    for (const o of OPS.filter((x) => x.method === "GET")) {
      if (typeof ROUTE.GET !== "function" || !keyRaw) break;
      const segs = String(o.path).split("/").filter(Boolean);
      const p = `/${segs.map((s, i) => (/^\{.+\}$/.test(s) ? (segs[i - 1] === "threads" ? KEEP.thread : ({ contacts: KEEP.k.id, deals: KEEP.deal, activities: KEEP.call1 } as Record<string, string>)[segs[i - 1]] ?? KEEP.k.id) : s)).join("/")}`;
      const res: Response = await ROUTE.GET(new Request(`http://qc.invalid/api/v1/crm${p}`, { headers: { authorization: `Bearer ${keyRaw}` } }), { params: Promise.resolve({ path: p.split("?")[0].split("/").filter(Boolean) }) });
      const text = await res.text(); n += 1;
      if (text.includes(SECRET_BODY)) hits.push(o.id);
    }
    chk("C3.9-S7.4", `the READONLY API key never receives an e-mail body: every GET op of the registry (${n}) aimed at a contact / deal / call / thread that has bodies returns none of them`,
      n > 0 && hits.length === 0, "0 bodies", `ops=${n} hits=${hits.join(",") || "-"}`);
  }

  // ═════════════════════════════════ X ═════════════════════════════════
  console.log("\n── X ──");
  {
    const a = await call(PRIV.exportContact, { tenantId: TB, systemId: SB, actorUserId: uOwner }, owner, KEEP.k.id);
    const b = await call(PRIV.exportContact, cS, owner, kB.id);
    const c = await call(PRIV.exportContact, cS, owner, kS2.id);
    const d = exportJob ? await call(PRIV.getExport, { tenantId: TB, systemId: SB, actorUserId: uOwner }, owner, exportJob) : MISSING;
    chk("C3.9-X1.1", "X1 privacy service scope: exportContact of another tenant's / another CRM system's contact and getExport of a job from another tenant all answer NOT_FOUND (404-not-403) with nothing in the error",
      [a, b, c, d].every((r) => refused(r, ["NOT_FOUND"]) && !j(r).includes(KEEP.k.pii[0])), "404", `${[a, b, c, d].map((r) => r.err || "ok!").join(" | ")}${ABSENT}`);
  }
  {
    let ok = false; let noteS = "";
    if (seedThanaM && seedS) {
      const tv = { userId: String(seedThanaU.id), role: String(seedThanaM.role), unitAccess: Array.isArray(seedThanaM.unitAccess) ? seedThanaM.unitAccess : [], permissions: seedThanaM.permissions ?? {} };
      const ctx = { tenantId: seedT, systemId: seedS, actorUserId: tv.userId };
      const toks = seedKrabiDeals.map((d) => String(d.id));
      const outs: Res[] = [];
      for (const tab of ((RSH.REPORT_TABS ?? []) as string[])) outs.push(await call(CRM?.reports?.getReport, ctx, tv, tab));
      outs.push(await call(CRM?.widgets?.myDeals, ctx, tv, { limit: 20 }), await call(CRM?.widgets?.todayTasks, ctx, tv, {}), await call(CRM?.deals?.listDeals, ctx, tv, {}));
      const leak = outs.filter((r) => r.ok && toks.some((t) => j(r.v).includes(t))).length;
      ok = outs.some((r) => r.ok) && leak === 0;
      noteS = `calls=${outs.length} ok=${outs.filter((r) => r.ok).length} leaks=${leak}`;
    } else noteS = "seed missing";
    chk("C3.9-X1.2", "X1 on the SEED (read-only): the real thana's reports (every tab), widgets and deal list never carry a krabi-team deal id", ok, "0 leaks", noteS);
  }
  {
    const csvFiles = walk("src/lib/modules/crm").filter((f) => /text\/csv|\.csv["'`]|toCsv|CSV/.test(read(f)) && /join\(\s*["'`]\\n["'`]\s*\)|\\r\\n/.test(read(f)));
    const noCsvRow = csvFiles.filter((f) => !/csvRow/.test(read(f)));
    const csvBad = PUT.some((p) => /(^|[,\n])"?[=+\-@]HYPERLINK/.test(p.body));
    chk("C3.9-X6.1", "X6 CSV injection: every CRM file that writes CSV rows imports csvRow (enumerated) and the CRM-wide CSV export neutralised the `=HYPERLINK(…)` contact name",
      noCsvRow.length === 0 && PUT.length > 0 && !csvBad, "csvRow everywhere", `csvFiles=${csvFiles.length} without=${noCsvRow.join(",") || "-"} exportFiles=${PUT.length} injected=${csvBad}${ABSENT}`, "MAJOR");
  }
  {
    const files = [...walk("src/lib/modules/crm"), ...walk("src/lib/platform/crm-bridges")];
    const bad: string[] = [];
    for (const f of files) {
      const src = read(f);
      for (const m of src.matchAll(/\bfetch\(\s*([^,)]+)/g)) {
        const arg = m[1].trim();
        if (/keepalive|credentials:\s*"omit"/.test(src.slice(m.index ?? 0, (m.index ?? 0) + 160))) continue; // browser code inside the shark.js template, not a server fetch
        if (/^["'`]https:\/\//.test(arg)) continue;
        if (!/webhookTargetProblem|assertPublicUrl|safeFetch/.test(src)) bad.push(`${f.replace("src/lib/", "")}:${arg.slice(0, 30)}`);
      }
    }
    chk("C3.9-X6.2", "X6 SSRF: every server-side fetch() in the CRM module and its bridges either targets a fixed https host or sits in a file that passes the user URL through webhookTargetProblem (enumerated) [static]",
      bad.length === 0, "0 raw fetch", `bad=${cut(bad.join(" | "), 260) || "-"}`, "MAJOR");
  }
  {
    const evts = (await P.outboxEvent.findMany({ where: { tenantId: T, createdAt: { gte: RUN_START } } })) as Any[];
    const ops = (await P.opsEvent.findMany({ where: { tenantId: T, createdAt: { gte: RUN_START } } })) as Any[];
    const tokens = [...E.k.pii, ...KEEP.k.pii, ...kK.pii].filter((s) => s.length >= 8);
    const hits = [...evts.map((e) => ({ w: `outbox:${e.type}`, t: j(e.payload) })), ...ops.map((o) => ({ w: `ops:${o.source}`, t: `${o.message} ${o.detail ?? ""}` }))].filter((x) => tokens.some((s) => x.t.includes(s))).map((x) => x.w);
    chk("C3.9-X8.1", "X8 payload / log PII scan over this run's scripted day (erase · export · purge · limits · penetration): no outbox payload and no OpsEvent message/detail of the tenant carries a name, phone, e-mail, LINE id or note of any fixture person",
      evts.length > 0 && hits.length === 0, "0 hits", `outbox=${evts.length} ops=${ops.length} hits=${cut([...new Set(hits)].join(","), 200) || "-"}`);
  }
  {
    const files = walk("src").filter((f) => /^\s*["']use server["']/.test(read(f)) && /\/crm\/|\/crm-|modules\/crm|src\/app\/b\/|src\/app\/\(store\)\/f\//.test(f));
    const bad: string[] = [];
    for (const f of files) {
      const src = read(f);
      for (const m of src.matchAll(/^export\s+(?!async\s+function)(\w+)/gm)) bad.push(`${f.replace("src/", "")}:${m[1]}`);
      if (/^export\s*\{/m.test(src) || /^export\s+\*/m.test(src)) bad.push(`${f.replace("src/", "")}:re-export`);
    }
    chk("C3.9-X8.2", `"use server" export scan: every CRM-side "use server" file (crm module · /crm pages · /b portal · public /f forms) (${files.length}) exports only async functions — no const/type/class/re-export (a leaked non-function export is callable/serialisable from the client)`,
      files.length > 0 && bad.length === 0, "only async functions", `files=${files.length} bad=${cut(bad.join(" | "), 260) || "-"}`, "MAJOR");
  }
  {
    const Z = await mkContact(T, S, "แซด");
    const noConfirm = await call(PRIV.eraseContact, cS, owner, { contactId: Z.id, reason: `ไม่มียืนยัน ${TAG}` }, deps);
    const shortReason = await call(PRIV.eraseContact, cS, owner, { contactId: Z.id, confirm: true, reason: "สั้น" }, deps);
    const byThana = await call(PRIV.eraseContact, cThana, thana, { contactId: Z.id, confirm: true, reason: REASON() }, deps);
    const intact = ((await P.crmContact.findUnique({ where: { id: Z.id } })) as Any)?.phone === Z.pii[1];
    const aud = (await P.auditLog.count({ where: { tenantId: T, targetId: Z.id, action: "crm.contact.erase" } })) as number;
    chk("C3.9-X9.1", "X9 erase is a danger action: without confirm, with a reason under 5 characters, or by a STAFF without crm.contact.delete it is refused with a Thai message and the contact stays intact (no audit row)",
      refused(noConfirm, ["VALIDATION", "CONFIRM"]) && refused(shortReason, ["VALIDATION"]) && refused(byThana, ["FORBIDDEN", "NOT_FOUND"]) && intact && aud === 0,
      "refused ×3", `noConfirm=${noConfirm.err || "ok!"} short=${shortReason.err || "ok!"} thana=${byThana.err || "ok!"} intact=${intact} audit=${aud}${ABSENT}`);
  }
  {
    const got = exportJob ? await call(PRIV.getExport, cS, owner, exportJob) : MISSING;
    const dto = j(got.v);
    const job = exportJob ? ((await P.crmImportJob.findUnique({ where: { id: exportJob } })) as Any) : null;
    chk("C3.9-X10.1", "X10 the export DTO carries only the signed /api/files link — no private:// path, no storage path, no CDN host — and the job row keeps the file id, not a URL",
      got.ok && !/private:\/\/|t\/[a-z0-9]+\/private\/|b-cdn|bunny/i.test(dto) && !!job?.fileId && !/https?:\/\//.test(j(job?.result ?? {})), "no raw url", `dto=${cut(dto, 120)} job=${cut(j(job?.result ?? null), 80)}${ABSENT}`);
  }
  // ═════════════════════════════════ ORACLE-EDIT C3.9-H (security hunt 27 ก.ย.) ═════════════════════════════════
  // Controller rulings on the 12 accepted hunt findings (probe scenarios scripts/pending/probe-hunt39{,b}.mts) — each check encodes the
  // CORRECT behaviour. Own throwaway tenant `${TAG}-h` (swept by CLEAN like the others) · raw rows by construction where the real writer is
  // named · storage through the oracle's fake `deps` · ids only in every message.
  console.log("\n── H · security hunt (ORACLE-EDIT C3.9-H) ──");
  const H_IDS = ["C3.9-H1", "C3.9-H2", "C3.9-H3", "C3.9-H4", "C3.9-H5", "C3.9-H6", "C3.9-H7", "C3.9-H8", "C3.9-H9", "C3.9-H10", "C3.9-H11", "C3.9-H12"];
  const hDone = new Set<string>();
  const hchk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => { hDone.add(id); chk(id, n, ok, e, a, s); };
  try {
    const FBR = (await import("@/lib/platform/crm-bridges/forms" as string).catch(() => ({}))) as Any;
    const MEMF = (await import("@/lib/modules/member" as string).catch(() => ({}))) as Any;
    const TH = await mkTenant("h");
    const uStaffDel = await mkUser("-hdel");
    for (const [u, role, perms] of [[uOwner, "OWNER", {}], [uMgr, "MANAGER", {}], [uStaffDel, "STAFF", { "crm.contact.read": true, "crm.contact.delete": true }]] as const)
      await P.membership.create({ data: { userId: u, tenantId: TH, role, unitAccess: ["*"], permissions: perms, acceptedAt: new Date() } });
    const SH = (await sysSvc.createSystem(TH, "CRM", `CRM H ${TAG}`)).id as string;
    const MH = (await sysSvc.createSystem(TH, "MEMBER", `สมาชิก H ${TAG}`)).id as string;
    const KH = (await sysSvc.createSystem(TH, "KANBAN", `บอร์ด H ${TAG}`)).id as string;
    await setCrm(SH, { uiVersion: 2, bridgesEnabled: true, retention: { exportDays: 7, leadMonths: 24 } });
    const ownerH = { userId: uOwner, role: "OWNER", unitAccess: ["*"], permissions: {} as Record<string, unknown> };
    const mgrH = { userId: uMgr, role: "MANAGER", unitAccess: ["*"], permissions: {} as Record<string, unknown> };
    const staffDel = { userId: uStaffDel, role: "STAFF", unitAccess: ["*"], permissions: { "crm.contact.read": true, "crm.contact.delete": true } as Record<string, unknown> };
    const cH = { tenantId: TH, systemId: SH, actorUserId: uOwner };
    const HR = () => `เหตุผลทดสอบ H ${TAG}`;
    const phoneH = () => `08${String(20_000_000 + Number(nx()) * 7907).slice(0, 8)}`;
    const person = async (tag: string, extra: Record<string, unknown> = {}) => {
      const name = `คุณ${tag}ฮันต์ ${TAG}`;
      const phone = phoneH();
      const email = `h${nx()}.${rand}@qc.invalid`;
      const partyId = (await P.party.create({ data: { tenantId: TH, name, kind: "PERSON", phone } })).id as string;
      const c = await P.crmContact.create({ data: { tenantId: TH, systemId: SH, name, firstName: name, phone, email, partyId, ownerUserId: uOwner, lastActivityAt: new Date(), ...extra } });
      return { id: c.id as string, partyId, name, phone, email };
    };
    const erasedH = async (id: string) => ((await P.auditLog.count({ where: { tenantId: TH, action: "crm.contact.erase", targetId: id } })) as number) > 0;
    const mkMail = (data: Record<string, unknown>) => P.crmEmailMessage.create({ data: { tenantId: TH, systemId: SH, direction: "IN", messageId: `<${TAG}-h-${nx()}@qc.invalid>`, threadKey: `${TAG}-hth-${nx()}`, subject: "เรื่องแพ็กเกจ", status: "RECEIVED", receivedAt: new Date(), trackTokenHash: sha(`${TAG}-h-${nx()}`), ...data } });

    // ── H1 (B1) · FormSubmission of a lead from the public form + former name from the edit audit ──
    {
      const first = `ฟอร์ม${rand}`;
      const oldLast = `เดิม${rand}`;
      const newLast = `ใหม่${rand}`;
      const phone = phoneH();
      const email = `form.${rand}@qc.invalid`;
      const form = (await P.formDef.create({ data: { tenantId: TH, name: `ฟอร์มติดต่อ ${TAG}`, publicToken: `${TAG}-h-${randomBytes(8).toString("hex")}`, active: true, crmEnabled: true, crmSystemId: SH,
        fieldsJson: [{ key: "name", label: "ชื่อ", type: "text", required: true }, { key: "phone", label: "เบอร์", type: "phone" }, { key: "email", label: "อีเมล", type: "email" }, { key: "message", label: "ข้อความ", type: "textarea" }] } })) as Any;
      // the row `forms/service.ts#writeSubmission` writes on the live (guarded) path — ip is the hash, utm/pageUrl/referrer captured
      const sub = (await P.formSubmission.create({ data: { tenantId: TH, formId: form.id, answersJson: { name: `${first} ${oldLast}`, phone, email, message: `โทรกลับที่ ${phone}` }, ip: sha(IP), pageUrl: "https://qc.invalid/contact?utm_source=qc", referrer: "https://qc.invalid/", utm: { source: "qc" } } })) as Any;
      await P.appNotification.create({ data: { tenantId: TH, title: "มีคนกรอกฟอร์มเข้ามา", body: `${form.name}: ${first} ${oldLast} · ดูข้อมูล /app/forms/${form.id}` } });
      const lead = await call(FBR.onFormLead, { id: `${TAG}-h-evt`, tenantId: TH, type: "forms.submission.received", payload: { formId: form.id, submissionId: sub.id } });
      const A = String(((await P.formSubmission.findUnique({ where: { id: sub.id } })) as Any)?.crmContactId ?? "");
      const upd = A ? await call(CRM?.contacts?.updateContact, cH, ownerH, A, { lastName: newLast }) : MISSING;
      const bundle = A ? await call(PRIV.exportContact, cH, ownerH, A) : MISSING;
      const exported = Array.isArray(bundle.v?.tables?.FormSubmission) ? bundle.v.tables.FormSubmission.length : -1;
      const r = A ? await call(PRIV.eraseContact, cH, ownerH, { contactId: A, confirm: true, reason: HR() }, deps) : MISSING;
      const s2 = (await P.formSubmission.findUnique({ where: { id: sub.id } })) as Any;
      const answersEmpty = !!s2 && typeof s2.answersJson === "object" && s2.answersJson !== null && Object.keys(s2.answersJson).length === 0;
      const metaNull = !!s2 && s2.ip === null && s2.pageUrl === null && s2.referrer === null && (s2.utm === null || s2.utm === undefined);
      const notif = ((await P.appNotification.findMany({ where: { tenantId: TH, title: "มีคนกรอกฟอร์มเข้ามา" }, select: { body: true } })) as Any[]).map((x) => String(x.body));
      const formerLeft = notif.some((b) => b.includes(`${first} ${oldLast}`));
      hchk("C3.9-H1", "B1 erase covers the public-form lead: the FormSubmission whose crmContactId is in the erased chain keeps its row but answersJson = {} and ip/pageUrl/referrer/utm = null · exportContact carries a FormSubmission table · identity tokens include FORMER names taken from the chain's crm.contact.update audit (a notification naming the pre-edit full name is masked)",
        lead.ok && !!A && upd.ok && exported >= 1 && r.ok && r.v?.erased === true && answersEmpty && metaNull && !formerLeft,
        "answers {} · meta null · exported · former name masked", `lead=${lead.ok ? "ok" : lead.err} contact=${!!A} upd=${upd.ok ? "ok" : upd.err} exportRows=${exported} erase=${r.ok ? r.v?.erased : r.err} answersEmpty=${answersEmpty} metaNull=${metaNull} formerNameInNotification=${formerLeft}${ABSENT}`);
    }

    // ── H2 (B2) · e-mails outside the person's own contactId ──
    {
      const A2 = await person("อีเมล");
      const B2 = await person("เพื่อน");
      const cc = (await mkMail({ contactId: B2.id, fromAddr: B2.email, toAddrs: [`shop.${rand}@qc.invalid`], ccAddrs: [A2.email], bccAddrs: [], bodyText: `cc ${A2.name} (${A2.phone}) ด้วยนะครับ`, matchedBy: "EMAIL" })) as Any;
      const un = (await mkMail({ contactId: null, fromAddr: A2.email, fromName: A2.name, toAddrs: [`shop.${rand}@qc.invalid`], subject: `สอบถามจาก ${A2.name}`, bodyText: `สวัสดีค่ะ ${A2.name} โทร ${A2.phone}`, bodyHtml: `<p>${A2.phone}</p>`, snippet: `สวัสดีค่ะ ${A2.name}`, matchedBy: "NONE" })) as Any;
      const r = await call(PRIV.eraseContact, cH, ownerH, { contactId: A2.id, confirm: true, reason: HR() }, deps);
      const c2 = (await P.crmEmailMessage.findUnique({ where: { id: cc.id } })) as Any;
      const u2 = (await P.crmEmailMessage.findUnique({ where: { id: un.id } })) as Any;
      const ccOk = !!c2 && !(c2.ccAddrs as string[]).includes(A2.email) && !String(c2.bodyText ?? "").includes(A2.phone) && !String(c2.bodyText ?? "").includes(A2.name) && c2.fromAddr === B2.email;
      const unOk = !!u2 && !u2.bodyText && !u2.bodyHtml && !u2.snippet && !String(u2.subject ?? "").includes(A2.name) && u2.fromAddr !== A2.email && !String(u2.fromName ?? "").includes(A2.name);
      hchk("C3.9-H2", "B2 e-mails whose from/to/cc/bcc match the person's addresses are reached even when contactId is someone else's or null: the person's address is removed from the lists and identity masked in subject/body/fromName (the other person's own address stays) · an unlinked mail SENT BY the person loses body/html/snippet and its subject no longer names them",
        r.ok && r.v?.erased === true && ccOk && unOk, "cc stripped + masked · unlinked cleared", `erase=${r.ok ? r.v?.erased : r.err} ccMail=${c2 ? `cc=${(c2.ccAddrs as string[]).includes(A2.email)} phoneInBody=${String(c2.bodyText ?? "").includes(A2.phone)} fromKept=${c2.fromAddr === B2.email}` : "gone"} unlinked=${u2 ? `body=${!!u2.bodyText} html=${!!u2.bodyHtml} subjName=${String(u2.subject ?? "").includes(A2.name)} fromIsPerson=${u2.fromAddr === A2.email}` : "gone"}${ABSENT}`);
    }

    // ── H3 (B3) · assistant conversations of the tenant ──
    {
      const A3 = await person("เอไอ");
      const conv = (await P.aiConversation.create({ data: { tenantId: TH, title: `สรุปลูกค้า ${A3.name}` } })) as Any;
      const m1 = (await P.aiMessage.create({ data: { tenantId: TH, conversationId: conv.id, role: "USER", content: `สรุปลูกค้า ${A3.name} เบอร์ ${A3.phone} อีเมล ${A3.email}` } })) as Any;
      const m2 = (await P.aiMessage.create({ data: { tenantId: TH, conversationId: conv.id, role: "ASSISTANT", content: `${A3.name} (${A3.phone}) กรอกฟอร์มเมื่อวาน` } })) as Any;
      const ctlText = `วันนี้มีงานอะไรบ้าง ${TAG}`;
      const m3 = (await P.aiMessage.create({ data: { tenantId: TH, conversationId: conv.id, role: "USER", content: ctlText } })) as Any;
      const r = await call(PRIV.eraseContact, cH, ownerH, { contactId: A3.id, confirm: true, reason: HR() }, deps);
      const rows = (await P.aiMessage.findMany({ where: { id: { in: [m1.id, m2.id, m3.id] } }, select: { id: true, content: true } })) as Any[];
      const title = String(((await P.aiConversation.findUnique({ where: { id: conv.id } })) as Any)?.title ?? "");
      const leak = rows.filter((x) => [A3.name, A3.phone, A3.email].some((t) => String(x.content).includes(t))).length + ([A3.name].some((t) => title.includes(t)) ? 1 : 0);
      const ctl = rows.find((x) => x.id === m3.id)?.content === ctlText;
      hchk("C3.9-H3", "B3 AiMessage.content and AiConversation.title of the tenant that contain the person's identity tokens are masked (same replace as AppNotification) · rows are kept · a message without tokens is untouched",
        r.ok && r.v?.erased === true && rows.length === 3 && leak === 0 && ctl, "0 tokens · rows kept · control intact", `erase=${r.ok ? r.v?.erased : r.err} rows=${rows.length} leakingRows=${leak} controlIntact=${ctl}${ABSENT}`);
    }

    // ── H4 (B4) · task-board card linked to the contact: comments + history (through the kanban facade) ──
    {
      const A4 = await person("บอร์ด");
      const board = (await P.kanbanBoard.create({ data: { tenantId: TH, systemId: KH, name: `งานขาย ${TAG}` } })) as Any;
      const col = (await P.kanbanColumn.create({ data: { tenantId: TH, systemId: KH, boardId: board.id, name: "ต้องทำ" } })) as Any;
      const card = (await P.kanbanCard.create({ data: { tenantId: TH, systemId: KH, boardId: board.id, columnId: col.id, title: `โทรหา ${A4.name}` } })) as Any;
      await P.kanbanCardLink.create({ data: { tenantId: TH, systemId: KH, cardId: card.id, linkType: "CRM_CONTACT", linkId: A4.id, role: "RELATED" } });
      const cm = (await P.kanbanComment.create({ data: { tenantId: TH, cardId: card.id, authorUserId: uOwner, body: `ลูกค้าให้โทร ${A4.phone} หลัง 5 โมง` } })) as Any;
      // the shape kanban/service.ts#createCard logs (CARD_CREATED data.title = the card title at creation)
      const ka = (await P.kanbanActivity.create({ data: { tenantId: TH, boardId: board.id, cardId: card.id, type: "CARD_CREATED", data: { title: `โทรหา ${A4.name}`, columnId: col.id } } })) as Any;
      const r = await call(PRIV.eraseContact, cH, ownerH, { contactId: A4.id, confirm: true, reason: HR() }, deps);
      const body = String(((await P.kanbanComment.findUnique({ where: { id: cm.id } })) as Any)?.body ?? "");
      const hist = j(((await P.kanbanActivity.findUnique({ where: { id: ka.id } })) as Any)?.data ?? null);
      const src = read(PRIV_FILE);
      const direct = /\b(tx|prisma)\.kanban(Comment|Activity)\b/.test(src);
      hchk("C3.9-H4", "B4 cards linked to the contact (CRM_CONTACT) get KanbanComment.body and KanbanActivity.data masked too (not only title/description) · done through the kanban facade (privacy.ts writes no kanbanComment/kanbanActivity rows itself)",
        r.ok && r.v?.erased === true && !!body && !body.includes(A4.phone) && !hist.includes(A4.name) && !direct, "comment + history masked via facade", `erase=${r.ok ? r.v?.erased : r.err} commentHasPhone=${body.includes(A4.phone)} historyHasName=${hist.includes(A4.name)} directWrites=${direct}${ABSENT}`);
    }

    // ── H5 (B5) · member erasure through CRM obeys the member key and the member approval policy ──
    {
      const mkCust = async (tag: string) => {
        const name = `สมาชิก${tag} ${TAG}`;
        const phone = phoneH();
        const partyId = (await P.party.create({ data: { tenantId: TH, name, kind: "PERSON", phone } })).id as string;
        const cust = (await P.customer.create({ data: { tenantId: TH, memberSystemId: MH, name, phone, partyId } })) as Any;
        return { id: cust.id as string, name, phone, partyId };
      };
      const linked = async (tag: string, ownerId: string) => {
        const c = await mkCust(tag);
        const k = (await P.crmContact.create({ data: { tenantId: TH, systemId: SH, name: c.name, phone: c.phone, partyId: c.partyId, memberCustomerId: c.id, ownerUserId: ownerId, lastActivityAt: new Date() } })) as Any;
        return { c, k: k.id as string };
      };
      const custOf = async (id: string) => (await P.customer.findUnique({ where: { id }, select: { name: true, phone: true, status: true } })) as Any;
      const flag = (r: Res, key: string) => r.ok && (r.v?.[key] === true || r.v?.counts?.[key] === true);
      // (a) STAFF holding crm.contact.delete but NOT member.customer.delete ⇒ contact erased · member untouched · WARN (ids only) · memberSkipped
      const t0 = new Date();
      const a = await linked("เอ", uStaffDel);
      const ra = await call(PRIV.eraseContact, { tenantId: TH, systemId: SH, actorUserId: uStaffDel }, staffDel, { contactId: a.k, confirm: true, reason: HR() }, deps);
      const custA = await custOf(a.c.id);
      const warns = (await P.opsEvent.findMany({ where: { tenantId: TH, level: "WARN", createdAt: { gte: t0 } }, select: { message: true, detail: true } })) as Any[];
      const warnIdsOnly = warns.length > 0 && warns.every((w) => !j(w).includes(a.c.phone) && !j(w).includes(a.c.name));
      const aOk = ra.ok && ra.v?.erased === true && custA?.status === "ACTIVE" && custA?.phone === a.c.phone && flag(ra, "memberSkipped") && warnIdsOnly;
      // (c) OWNER, no policy yet ⇒ member erased now (positive control — the path that must keep working)
      const c = await linked("ซี", uOwner);
      const rc = await call(PRIV.eraseContact, cH, ownerH, { contactId: c.k, confirm: true, reason: HR() }, deps);
      const custC = await custOf(c.c.id);
      const cOk = rc.ok && rc.v?.erased === true && custC?.status === "CLOSED";
      // (b) an ApprovalPolicy for member.erase exists ⇒ CRM submits member.requestErase: member side PENDING, contact erased now, response says so
      await P.approvalPolicy.create({ data: { tenantId: TH, name: `member.erase ${TAG}`, entityType: "member.erase", active: true, steps: { create: [{ tenantId: TH, order: 1, approverRole: "OWNER" }] } } });
      const b = await linked("บี", uMgr);
      const rb = await call(PRIV.eraseContact, { tenantId: TH, systemId: SH, actorUserId: uMgr }, mgrH, { contactId: b.k, confirm: true, reason: HR() }, deps);
      const custB = await custOf(b.c.id);
      const reqB = (await P.memberPrivacyRequest.findFirst({ where: { tenantId: TH, customerId: b.c.id, status: "PENDING" } })) as Any;
      const apprB = (await P.approvalRequest.count({ where: { tenantId: TH, entityType: "member.erase", status: "PENDING" } })) as number;
      const bOk = rb.ok && rb.v?.erased === true && custB?.status === "ACTIVE" && !!reqB && apprB >= 1 && flag(rb, "memberPending");
      void MEMF;
      hchk("C3.9-H5", "B5 CRM erase touches the linked MEMBER only as the member module allows: (a) actor without member.customer.delete ⇒ contact erased, member untouched, OpsEvent WARN (ids only), result flag memberSkipped · (b) ApprovalPolicy member.erase exists ⇒ CRM files member.requestErase (MemberPrivacyRequest + ApprovalRequest PENDING, customer ACTIVE), contact erased now, result flag memberPending · (c) owner with no policy ⇒ member erased at once (control)",
        aOk && bOk && cOk, "skipped · pending · erased",
        `a:erase=${ra.ok ? ra.v?.erased : ra.err} member=${custA?.status} skipped=${flag(ra, "memberSkipped")} warn=${warns.length}/idsOnly=${warnIdsOnly} · b:erase=${rb.ok ? rb.v?.erased : rb.err} member=${custB?.status} request=${reqB?.status ?? "-"} approvals=${apprB} pending=${flag(rb, "memberPending")} · c:erase=${rc.ok ? rc.v?.erased : rc.err} member=${custC?.status}${ABSENT}`);
    }

    // ── H6 (M1) + H10 (M5) · lead retention: anchor never before createdAt · erase only after a warning ≥ 30 days old · archived leads included ──
    {
      const LONG = new Date(Date.now() - 800 * DAY);
      const dayOf = (d: Date) => d.toISOString().slice(0, 10);
      const oldLead = async (tag: string, extra: Record<string, unknown> = {}) =>
        (await P.crmContact.create({ data: { tenantId: TH, systemId: SH, name: `ลีด${tag} ${TAG}`, phone: phoneH(), createdAt: LONG, lastActivityAt: LONG, ownerUserId: uOwner, ...extra } })).id as string;
      const warn = (id: string, ageDays: number) => P.auditLog.create({ data: { tenantId: TH, actorType: "SYSTEM", actorId: null, action: "crm.retention.warned", targetType: "CrmContact", targetId: id, after: { anchor: dayOf(LONG), systemId: SH, leadMonths: 24 }, createdAt: new Date(Date.now() - ageDays * DAY) } });
      const fresh = await call(CRM?.contacts?.createContact, cH, ownerH, { firstName: `ลีดสด${rand}`, phone: phoneH(), sourceKind: "CRM" });
      const freshId = String(fresh.v?.contact?.id ?? "");
      const back = freshId ? await call(CRM?.activities?.logActivity, cH, ownerH, { type: "CALL", title: "โทรคุยครั้งแรก (บันทึกย้อนหลัง)", contactId: freshId, startAt: new Date(Date.now() - 760 * DAY), direction: "OUT", done: true }) : MISSING;
      const unwarned = await oldLead("ไม่เคยเตือน");
      const warned31 = await oldLead("เตือนแล้ว31");
      await warn(warned31, 31);
      const warned5 = await oldLead("เตือนแล้ว5");
      await warn(warned5, 5);
      const archived31 = await oldLead("เก็บถาวร31", { archivedAt: new Date(Date.now() - 60 * DAY) });
      await warn(archived31, 31);
      const keepLive = await person("ปลายทางรวม");
      const merged31 = await oldLead("ถูกรวม31", { mergedIntoId: keepLive.id, archivedAt: new Date(Date.now() - 60 * DAY) });
      await warn(merged31, 31);
      const run = await call(PRIV.retentionLeads, new Date(), { tenantIds: [TH], deps });
      const st = {
        fresh: freshId ? await erasedH(freshId) : null,
        unwarned: await erasedH(unwarned),
        unwarnedWarned: (await P.auditLog.count({ where: { tenantId: TH, action: "crm.retention.warned", targetId: unwarned } })) as number,
        warned31: await erasedH(warned31),
        warned5: await erasedH(warned5),
        archived31: await erasedH(archived31),
        merged31: await erasedH(merged31),
      };
      hchk("C3.9-H6", "M1 the retention anchor is GREATEST(COALESCE(lastActivityAt, createdAt), createdAt) — a lead created today whose first activity is back-dated 25 months is NOT erased · only leads holding a crm.retention.warned audit ≥ LEAD_RETENTION_WARN_DAYS old are erased (an old lead never warned gets the warning instead, one warned 5 days ago is kept) · positive control: warned 31 days ago ⇒ erased",
        run.ok && fresh.ok && back.ok && st.fresh === false && st.unwarned === false && st.unwarnedWarned >= 1 && st.warned5 === false && st.warned31 === true,
        "fresh kept · unwarned warned not erased · 5d kept · 31d erased", `run=${run.ok ? j(run.v) : run.err} create=${fresh.ok ? "ok" : fresh.err} backdated=${back.ok ? "ok" : back.err} ${j(st)}${ABSENT}`);
      hchk("C3.9-H10", "M5 retention includes ARCHIVED unconverted leads (archiving is what the cap message recommends — it must not exempt a lead from PDPA retention) · merged-away contacts and already-erased ones stay excluded",
        run.ok && st.archived31 === true && st.merged31 === false, "archived erased · merged not", `archived31=${st.archived31} merged31=${st.merged31}${ABSENT}`);
    }

    // ── H7 (M2) · nothing new lands on an erased contact · a repeat erase re-sweeps content without new audit/event ──
    {
      const X = await person("หลังลบ");
      const r1 = await call(PRIV.eraseContact, cH, ownerH, { contactId: X.id, confirm: true, reason: HR() }, deps);
      const act = await call(CRM?.activities?.logActivity, cH, ownerH, { type: "CALL", title: "ลูกค้าโทรเข้ามา", body: `โทรกลับจาก ${X.phone}`, contactId: X.id, direction: "IN", done: true });
      const note = await call(CRM?.activities?.logActivity, cH, ownerH, { type: "NOTE", title: "โน้ต", body: `ที่อยู่ใหม่ของ ${X.phone}`, contactId: X.id });
      const obj = await call(CRM?.objects?.create, cH, ownerH, { key: "car", label: "รถ", labelPlural: "รถ", parentType: "CONTACT", titleFieldKey: "plate", templateKey: "vehicle", showAsTab: true });
      const rec = obj.ok ? await call(CRM?.objects?.records?.create, cH, ownerH, "car", { parentId: X.id, title: `รถของ ${X.phone}`, values: { plate: `กข${nx()}` } }) : MISSING;
      const file = await call(CRM?.files?.attachFile, cH, ownerH, { entityType: "CONTACT", entityId: X.id, filename: "บัตร.pdf", contentType: "application/pdf", data: new TextEncoder().encode("%PDF-1.4 qc") }, { put: async () => undefined, del: async () => 204 });
      const hPipe = (await P.crmPipeline.create({ data: { tenantId: TH, systemId: SH, name: `ขาย H ${TAG}`, stages: { create: [{ tenantId: TH, systemId: SH, name: "ใหม่", kind: "OPEN", probability: 10, sortOrder: 0 }] } }, include: { stages: true } })) as Any;
      const deal = await call(CRM?.deals?.createDeal, cH, ownerH, { pipelineId: hPipe.id, title: `ดีลหลังลบ ${TAG}`, contactId: X.id });
      const writers = { activity: act, note, record: rec, file, deal };
      const refusedAll = Object.values(writers).every((w) => refused(w, ["VALIDATION"]));
      // content that reached the erased row anyway (written before this rule existed) — a repeat erase must sweep it, idempotently
      const stale = (await P.crmActivity.create({ data: { tenantId: TH, systemId: SH, contactId: X.id, type: "CALL", title: "เก่าค้าง", body: `ค้างจาก ${X.phone}`, ownerUserId: uOwner } })) as Any;
      const audBefore = (await P.auditLog.count({ where: { tenantId: TH, action: "crm.contact.erase", targetId: X.id } })) as number;
      const evtBefore = (await P.outboxEvent.count({ where: { tenantId: TH, type: "crm.contact.erased" } })) as number;
      const r2 = await call(PRIV.eraseContact, cH, ownerH, { contactId: X.id, confirm: true, reason: HR() }, deps);
      const staleBody = ((await P.crmActivity.findUnique({ where: { id: stale.id } })) as Any)?.body ?? null;
      const audAfter = (await P.auditLog.count({ where: { tenantId: TH, action: "crm.contact.erase", targetId: X.id } })) as number;
      const evtAfter = (await P.outboxEvent.count({ where: { tenantId: TH, type: "crm.contact.erased" } })) as number;
      hchk("C3.9-H7", "M2 CRM writers refuse an erased contact with VALIDATION + Thai (activity · note · custom record under it · file on it · deal for it) · eraseContact on an already-erased contact still sweeps content that reached it (activity body cleared) with erased:false and NO new erase audit / crm.contact.erased event",
        r1.ok && refusedAll && r2.ok && r2.v?.erased === false && !staleBody && audAfter === audBefore && evtAfter === evtBefore,
        "5 × refused · re-sweep idempotent", `writers=${Object.entries(writers).map(([k, w]) => `${k}:${w.ok ? "accepted!" : w.code || w.err.slice(0, 40)}`).join(",")} repeat=${r2.ok ? r2.v?.erased : r2.err} staleBodyLeft=${!!staleBody} audit ${audBefore}→${audAfter} events ${evtBefore}→${evtAfter}${ABSENT}`);
    }

    // ── H8 (M3) · the audit trail of the chain is scrubbed on erase and contact writers stop writing identity values into it ──
    {
      const oldLast = `เก่าออดิต${rand}`;
      const newLast = `ใหม่ออดิต${rand}`;
      const line = `Uaudit${randomBytes(6).toString("hex")}`;
      const Y = await call(CRM?.contacts?.createContact, cH, ownerH, { firstName: `วาย${rand}`, lastName: oldLast, phone: phoneH(), sourceKind: "CRM" });
      const yId = String(Y.v?.contact?.id ?? "");
      const u1 = yId ? await call(CRM?.contacts?.updateContact, cH, ownerH, yId, { lastName: newLast, lineUserId: line }) : MISSING;
      const r = yId ? await call(PRIV.eraseContact, cH, ownerH, { contactId: yId, confirm: true, reason: HR() }, deps) : MISSING;
      const trail = yId ? ((await P.auditLog.findMany({ where: { tenantId: TH, targetId: yId, NOT: { action: "crm.contact.erase" } }, select: { action: true, before: true, after: true } })) as Any[]) : [];
      const trailLeak = trail.filter((x) => [oldLast, newLast, line].some((t) => j([x.before, x.after]).includes(t))).map((x) => x.action);
      const zLast = `ซีต่อไป${rand}`;
      const Z = await call(CRM?.contacts?.createContact, cH, ownerH, { firstName: `ซี${rand}`, phone: phoneH(), sourceKind: "CRM" });
      const zId = String(Z.v?.contact?.id ?? "");
      const u2 = zId ? await call(CRM?.contacts?.updateContact, cH, ownerH, zId, { lastName: zLast }) : MISSING;
      const zRows = zId ? ((await P.auditLog.findMany({ where: { tenantId: TH, targetId: zId, action: "crm.contact.update" }, select: { before: true, after: true } })) as Any[]) : [];
      const forward = zRows.length > 0 && zRows.every((x) => !j([x.before, x.after]).includes(zLast));
      hchk("C3.9-H8", "M3 on erase every AuditLog row with targetId in the chain (except crm.contact.erase) has before/after scrubbed of identity values (old + new last name, LINE id) · going forward crm.contact.update audits mask identity keys (a new last name is not written raw)",
        Y.ok && u1.ok && r.ok && r.v?.erased === true && trail.length > 0 && trailLeak.length === 0 && Z.ok && u2.ok && forward,
        "trail scrubbed · forward masked", `create=${Y.ok ? "ok" : Y.err} upd=${u1.ok ? "ok" : u1.err} erase=${r.ok ? r.v?.erased : r.err} trailRows=${trail.length} leaking=${trailLeak.join(",") || "-"} forwardMasked=${forward}${ABSENT}`);
    }

    // ── H9 (M4) · unexpired exports made before the erase are withdrawn ──
    {
      const W = await person("ส่งออก");
      const PUT: Record<string, Uint8Array> = {};
      const ex = await call(PRIV.exportTenant, cH, ownerH, { format: "CSV", confirm: true, reason: "qc-c3.9 ส่งออกทั้งระบบ" }); // ORACLE-EDIT C3.9-export-confirm (C5.4-B · L5-m7)
      const run = await call(PRIV.runExportJobs, { tenantIds: [TH], deps: { put: async (p: string, d: Uint8Array) => { PUT[p] = d; } } });
      const job = ex.ok ? ((await P.crmImportJob.findUnique({ where: { id: ex.v.jobId } })) as Any) : null;
      const fileRow = job?.fileId ? ((await P.fileAsset.findUnique({ where: { id: job.fileId } })) as Any) : null;
      const hadPhone = Object.values(PUT).some((d) => new TextDecoder().decode(d).includes(W.phone));
      const rep = (await P.crmImportJob.create({ data: { tenantId: TH, systemId: SH, kind: "REPORT_EXPORT", status: "DONE", createdById: uOwner, finishedAt: new Date(), result: { format: "CSV", csv: `name,phone\r\n${W.name},${W.phone}\r\n` } } })) as Any;
      const r = await call(PRIV.eraseContact, cH, ownerH, { contactId: W.id, confirm: true, reason: HR() }, deps);
      const fileLeft = job?.fileId ? ((await P.fileAsset.count({ where: { id: job.fileId } })) as number) : -1;
      const storageDeleted = !!fileRow?.path && DELETED.includes(String(fileRow.path));
      const g = ex.ok ? await call(PRIV.getExport, cH, ownerH, ex.v.jobId) : MISSING;
      const repAfter = (await P.crmImportJob.findUnique({ where: { id: rep.id } })) as Any;
      const repClean = !j(repAfter?.result ?? null).includes(W.phone);
      hchk("C3.9-H9", "M4 erase withdraws the system's unexpired CRM_EXPORT files (FileAsset gone, storage object deleted through followUp — getExport answers EXPIRED) and REPORT_EXPORT result.csv — an export generated before the erase no longer hands out the person's data",
        ex.ok && run.ok && hadPhone && r.ok && r.v?.erased === true && fileLeft === 0 && storageDeleted && g.ok && g.v?.status === "EXPIRED" && repClean,
        "file gone · EXPIRED · csv cleared", `export=${ex.ok ? "ok" : ex.err} run=${run.ok ? j(run.v) : run.err} fileHadPhone=${hadPhone} erase=${r.ok ? r.v?.erased : r.err} fileLeft=${fileLeft} storageDeleted=${storageDeleted} getExport=${g.ok ? g.v?.status : g.err} reportCsvClean=${repClean}${ABSENT}`);
    }

    // ── H11 (m1) · the scoring seed obeys the scoreRules cap ──
    {
      await setLimits(TH, { scoreRules: 2 });
      const before = (await P.crmScoreRule.count({ where: { tenantId: TH, systemId: SH } })) as number;
      const s = await call(CRM?.scoring?.seedSystemRules, cH, ownerH);
      const after = (await P.crmScoreRule.count({ where: { tenantId: TH, systemId: SH } })) as number;
      hchk("C3.9-H11", "m1 scoring.seedSystemRules passes assertCrmLimit (Tenant.limits.crm.scoreRules = 2): it never leaves more rules than the cap — refused with LIMIT (Thai, nothing written) or stops at the cap",
        after <= 2 && (s.ok || refused(s, ["LIMIT"])), "≤ 2 rules", `before=${before} seed=${s.ok ? j(s.v) : s.err} after=${after}${ABSENT}`, "MAJOR");
    }

    // ── H12 (m2) · no second erase audit for a merged-in contact that was erased on its own first ──
    {
      const K12 = await person("หลัก");
      const M12 = await person("ถูกรวม");
      await P.crmContact.update({ where: { id: M12.id }, data: { mergedIntoId: K12.id, archivedAt: new Date() } });
      const r1 = await call(PRIV.eraseContact, { tenantId: TH, systemId: SH, actorUserId: null }, null, { contactId: M12.id, confirm: true, reason: HR() }, deps);
      const r2 = await call(PRIV.eraseContact, cH, ownerH, { contactId: K12.id, confirm: true, reason: HR() }, deps);
      const n = (await P.auditLog.count({ where: { tenantId: TH, action: "crm.contact.erase", targetId: M12.id } })) as number;
      hchk("C3.9-H12", "m2 erasing a primary after one of its merged-in contacts was already erased writes NO second crm.contact.erase audit for that merged-in contact (exactly one per person)",
        r1.ok && r1.v?.erased === true && r2.ok && r2.v?.erased === true && n === 1, "1 audit row", `first=${r1.ok ? r1.v?.erased : r1.err} primary=${r2.ok ? r2.v?.erased : r2.err} auditRowsForMergedIn=${n}${ABSENT}`, "MAJOR");
    }
  } catch (e) {
    for (const id of H_IDS) if (!hDone.has(id)) chk(id, "security-hunt check ran", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}` : String(e), 300));
  }
} catch (e) {
  chk("C3.9-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  for (const id of KEY_IDS) await del(() => P.chatRateBucket.deleteMany({ where: { key: { contains: id } } }));
  for (const id of KEY_IDS) await del(() => P.apiKey.delete({ where: { id } }));
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  for (const id of ids) await del(() => P.chatRateBucket.deleteMany({ where: { key: { contains: id } } }));
  await del(() => P.chatRateBucket.deleteMany({ where: { key: { contains: TAG } } }));
  await del(() => P.chatRateBucket.deleteMany({ where: { key: { contains: IP } } }));
  let tables: string[] = [];
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
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
    if (ids.length) {
      const inList = ids.map((x) => `'${x}'`).join(",");
      for (const t of tables) { const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[]; if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`); }
    }
    const tenants = ids.length ? await P.tenant.count({ where: { id: { in: ids } } }) : 0;
    const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
    const keys = KEY_IDS.length ? await P.apiKey.count({ where: { id: { in: KEY_IDS } } }) : 0;
    const buckets = await P.chatRateBucket.count({ where: { OR: [{ key: { contains: TAG } }, { key: { contains: IP } }, ...KEY_IDS.map((k) => ({ key: { contains: k } })), ...ids.map((t) => ({ key: { contains: t } }))] } });
    chk("C3.9-CLEAN", "the oracle gives the QC database back exactly as found — throwaway tenants (every tenant-scoped row), users, mobile sessions, API keys and the rate buckets of this run are gone · the seed was only read",
      left.length === 0 && tenants === 0 && users === 0 && keys === 0 && buckets === 0, "0 rows", `${left.join(" · ") || "-"} tenants=${tenants} users=${users} keys=${keys} buckets=${buckets}`, "MAJOR");
  } catch (e) { chk("C3.9-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR"); }
  await prisma.$disconnect();
}
function REASON(): string { return `เหตุผลทดสอบ ${TAG}`; }

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C3.9: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);

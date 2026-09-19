// QC — CRM v2 WO C2.3: assignment rules — `src/lib/modules/crm/assignment.ts` (replaces the C1.4 stub) + `assignment-shared.ts` ·
//      the call site in `contacts.ts` (insertContactInTx) · UI `src/app/app/sys/[id]/crm/settings/assignment/**` + `src/components/crm/assignment/**`
// Oracle writer · the C2.3 builder must NOT touch this file · QC database only (.env.qc — loaded by scripts/acc-v2-env.mts)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.3.mts
//      `--force-run` = run every check while the C2.3 engine / the C2.0 table are absent — functional checks red, fixtures + positive
//                      controls that do not need C2.3 + CLEAN green: proves the fixtures, the worker processes and the cleanup
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c23-<rand>-*`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-crm-c1.4 (creator stays owner when no owner is chosen) ·
//   qc-crm-c1.7 (visibility) · qc-crm-c1.8 (form/chat bridges — v1 lead path) · qc-crm-c1.11 · qc-crm-v1 · qc-hr-leave-booking (isOnLeave) ·
//   qc-form · qc-forms-notify · every earlier qc-crm-c1.* / qc-crm-c2.* · qc-member-m1.9 (30/15/10/5).
//
// SOURCES: crm-brief-C2.3.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-B: no hr.leave.* consumer — C2.3 POLLS hr.isOnLeave ·
//   R-D default ownership · R-E.14 uiVersion 1 ⇒ rules skip, rows kept, resume at 2) · CRM-RUN §2 "C2.3" (S1 6 · S2 3 · S3 2 · S4 4 · S5 2 ·
//   S6 5 = 22) · CRM-RUN §4 (PERMANENT RULE C1.7: every oracle carries uiVersion-1 cases · note C0.3: isOnLeave only reads the FIRST HR
//   system — "C2.3 considers it" → see the PROPOSED ruling in the brief addendum) · MASTER-PLAN §2 §4 (X1 X3 X4 X8 X9) §6 row C2.3 (X3: 20-way
//   round-robin spreads exactly · LEAST_OPEN never over-assigns under concurrency) · blueprint §5.7 (pick / rules.* / simulate) §11.5
//   (RR atomic `UPDATE … SET rrCursor = (rrCursor+1) % n RETURNING` · leave / acceptingLeads skip · maxOpenPerUser full → next → fallback →
//   nobody = unassigned + notify MANAGER) §11.6 (removed users skipped automatically) §4.3 CrmAssignmentRule · §15 TeamMember.acceptingLeads ·
//   mockup 07 (right: "มอบหมายอัตโนมัติ — Round-robin … นับตามคนที่ว่างสุด · ใช้ทุกทางเข้า lead ใหม่" + per-user queue + next marker) ·
//   C2.0 oracle NEW_TABLES (CrmAssignmentRule: tenantId systemId name conditions Json mode CrmAssignMode userIds text[] teamId? rrCursor int
//   default 0 · maxOpenPerUser int? · sortOrder int · active bool default true · stats Json?) · src/lib/modules/crm/assignment.ts (C1.4 stub —
//   signature pick(ctx, {fixedOwnerUserId, creatorUserId, via}) → {ownerUserId, assignedBy}) · contacts.ts insertContactInTx / leadFromBridge ·
//   src/lib/modules/hr/service.ts isOnLeave(tenantId, userId, at) (Thai-day compare, APPROVED only) · src/lib/core/teams.ts ·
//   lesson [[reference_atomic_counter_single_statement]] (an in-process test cannot tell a JS mutex from a DB-atomic counter ⇒ PROCESSES).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   A. `src/lib/modules/crm/assignment.ts` — the SAME file as the C1.4 stub, stub removed; ctx = { tenantId, systemId, actorUserId? } ·
//      actor = MemberActor · system re-resolved in the tenant (type CRM) else NOT_FOUND · Thai errors that never blame the user.
//      types  AssignmentDraft = { sourceKind?: MemberSource | null; sourceChannel?: string | null; locale?: string | null; partyId?: string |
//               null; companyId?: string | null; fields?: Record<string, unknown> }
//             AssignmentPickInput = { fixedOwnerUserId?; creatorUserId?; via?: "USER" | "IMPORT" | "API"   (C1.4, unchanged)
//               + auto?: boolean; ruleId?: string | null; draft?: AssignmentDraft; now?: Date }
//             AssignmentPick = { ownerUserId: string | null; assignedBy: string | null; teamId: string | null; ruleId: string | null;
//               reason: "FIXED" | "CREATOR" | "RULE" | "FALLBACK" | "NOBODY" | "DISABLED" }
//      pick(ctx, input, db?: Prisma.TransactionClient) → Promise<AssignmentPick>   (now ASYNC — contacts.ts awaits it inside its tx)
//        1 fixedOwnerUserId ⇒ FIXED (assignedBy as C1.4) · 2 creatorUserId and !auto ⇒ CREATOR (C1.4 behaviour unchanged) ·
//        3 system uiVersion ≠ 2 ⇒ { ownerUserId: null, reason: "DISABLED" } — nothing read or written (R-E.14) ·
//        4 input.ruleId ⇒ that rule only (same tenant + system + active, else ignored) · otherwise the ACTIVE rules of ctx.systemId ordered
//          by (sortOrder asc, id asc); the FIRST rule whose conditions match decides (no fall-through to a later rule) ·
//        5 the deciding rule has no eligible candidate, or no rule matched ⇒ settings.crm.assignment.fallbackUserId when eligible-as-member
//          (accepted Membership of the tenant + crm.contact.read) ⇒ reason FALLBACK, assignedBy "RULE:fallback" ·
//        6 otherwise ⇒ reason NOBODY (ownerUserId null).
//        RULE result: assignedBy = `RULE:<ruleId>` · teamId = rule.teamId (null when the rule has none) · ruleId = rule id.
//        conditions Json = { mode?: "AND" | "OR" (default AND); items: { field; op: "eq" | "neq" | "in" | "contains"; value: string |
//          string[] }[] } · empty/absent items = always matches · field ∈ sourceKind (draft) · sourceChannel (draft) · province (Party.address
//          of draft.partyId, else of the draft company's Party, CONTAINS the value — address is free text) · companySize (CrmCompany.size of
//          draft.companyId) · language (draft.locale, default "th") · `f.<fieldKey>` (draft.fields[fieldKey] — "interested product" is a
//          contact custom field) — six kinds (CRM-RUN S1).
//        candidates: userIds (listed order) when non-empty, else the TeamMember rows of rule.teamId (joinedAt asc, userId asc).
//        ELIGIBLE = accepted Membership (acceptedAt not null) in ctx.tenantId · crmCan(membership actor, "crm.contact.read") (X1: the
//          assignee can see the record) · not acceptingLeads=false (on the rule's team row; rule without team ⇒ any TeamMember row of the
//          tenant) · not hr.isOnLeave(tenantId, userId, now) (through the hr facade — edge crm→hr exists) · open load < maxOpenPerUser
//          when set. OPEN LOAD of a user in ctx.systemId = contacts owned (lifecycleStage LEAD, leadStatus ≠ UNQUALIFIED, archivedAt null,
//          mergedIntoId null) + deals owned (kind OPEN, archivedAt null) — per system.
//        modes: FIXED = first eligible candidate · ROUND_ROBIN = eligible list (n = its length) + ONE statement
//          `UPDATE "CrmAssignmentRule" SET "rrCursor" = ("rrCursor" + 1) % n WHERE … RETURNING` (AUDIT-CLASS X3 — no read-modify-write,
//          no JS mutex) · TEAM_LEAD = the team's lead (Team.leadUserId / TeamMember role LEAD) when eligible · LEAST_OPEN = smallest open
//          load, tie ⇒ candidate order. Any rule with maxOpenPerUser or LEAST_OPEN serialises per rule inside the CALLER's transaction
//          (e.g. pg_advisory_xact_lock on the rule) so N parallel creations never exceed the cap (X3).
//      simulate(ctx, actor, rows: AssignmentDraft[]) → { results: { index; ownerUserId; teamId; ruleId; reason; reasonText (Thai) }[] }
//        crm.assignment.manage · ≤ 200 rows (else VALIDATION) · predicts successive picks in row order exactly as pick would (RR from the
//        current cursor, LEAST_OPEN counting the predicted assignments) · writes NOTHING (rrCursor, contacts, audit, notification, outbox)
//      listRules(ctx, actor) → AssignmentRuleDto[] (sortOrder asc) · createRule(ctx, actor, RuleInput) → dto · updateRule(ctx, actor, id,
//        Partial<RuleInput>) → dto · toggleRule(ctx, actor, id, active: boolean) → dto · deleteRule(ctx, actor, id, { confirm: true,
//        reason ≥ 5 chars } — missing confirm / shorter reason ⇒ VALIDATION, nothing deleted) (X9) · reorderRules(ctx, actor, ids: string[]) → dto[] (sortOrder = position)
//        RuleInput = { name (1..120); mode: CrmAssignMode; userIds?: string[]; teamId?: string | null; maxOpenPerUser?: number | null
//          (1..10000); conditions?: as above; active?: boolean }
//        AssignmentRuleDto = { id; name; mode; userIds; teamId; maxOpenPerUser; conditions; sortOrder; active }
//        every call: crm.assignment.manage (STAFF without ⇒ FORBIDDEN 403 Thai) · rule id of another tenant/system ⇒ NOT_FOUND (404, same
//        message as a missing id) · uiVersion 1 ⇒ refused (assertCrmV2 → CrmV2DisabledError or code CRM_V2_DISABLED), nothing written ·
//        VALIDATION (Thai, nothing written): unknown mode · userIds containing a user without Membership in ctx.tenantId · teamId not a
//        Team of ctx.tenantId · ROUND_ROBIN / LEAST_OPEN / FIXED with no candidate (no userIds and no teamId) · TEAM_LEAD without teamId ·
//        unknown condition field/op · maxOpenPerUser out of range · empty name
//        audit on EVERY mutation: action starts with `crm.assignment.` (rule.create / rule.update / rule.toggle / rule.delete / rule.reorder
//        / settings) · targetId = rule id (settings: the system id) · no contact PII in before/after
//      getAssignmentSettings(ctx, actor) → { fallbackUserId: string | null } · setFallbackUser(ctx, actor, userId | null) — member of the
//        tenant else VALIDATION · stored at AppSystem.settings.crm.assignment.fallbackUserId with ONE jsonb_set statement (other crm keys
//        survive) · audited
//      openLoadOf(ctx, userIds: string[]) → Record<userId, number> (the OPEN LOAD above — the UI "คิว" column reads it)
//      error class AssignmentError (code VALIDATION | NOT_FOUND | FORBIDDEN | CRM_V2_DISABLED) — CrmForbiddenError / CrmV2DisabledError accepted
//   B. `src/lib/modules/crm/assignment-shared.ts` — pure (no prisma / next / server-only / ./db): ASSIGN_MODES (4) ·
//      ASSIGN_CONDITION_FIELDS ⊇ sourceKind sourceChannel province companySize language (+ the "f." prefix) · ASSIGN_OPS eq neq in contains ·
//      ASSIGN_MODE_LABELS (Thai)
//   C. `contacts.ts` (call site only — block `// CRM C2.3 ▸ … ◂`): insertContactInTx awaits `assignment.pick(ctx, {…, draft}, tx)` inside
//      its transaction and writes ownerUserId / assignedAt / assignedBy / teamId from it · createContact accepts `ownerUserId: "auto"` ⇒
//      pick with auto:true (explicit owner and "no owner = creator" unchanged) · bridges (form/chat — no creator) ⇒ rules automatically ·
//      reason NOBODY on the automatic path ⇒ ONE AppNotification per accepted OWNER/MANAGER membership of the tenant (recipientUserId set,
//      Thai title, body = a link with the contact id — no name/phone/e-mail), at most once per contact (X4) · crm.contact.assigned stays
//      the only event (payload ids only; may add ruleId/teamId) — NO new outbox event type in C2.3.
//   D. facade `src/lib/modules/crm/index.ts`: `export * as assignment from "./assignment"` inside `// CRM C2.3 ▸ … ◂`
//   E. UI `/app/sys/[id]/crm/settings/assignment` (page.tsx: CRM guard type "CRM" → requireCrmV2Page → crmCan(… "crm.assignment.manage")
//      else notFound()) · nav entry path "/crm/settings/assignment" status "ready" wo "C2.3" · testids (rows in scripts/crm-ui-inventory.json,
//      page "/settings/assignment", wo "C2.3", ≥ 6): crm-assign-rule-list · crm-assign-rule-new · crm-assign-rule-row-* · crm-assign-rule-
//      toggle-* · crm-assign-rule-delete-* · crm-assign-rule-move-* · crm-assign-fallback · crm-assign-simulate-run · crm-assign-simulate-
//      result · crm-assign-next-* (mockup "คิวถัดไป") · "use server" actions: async exports only + assertCrmV2 · client files never reach prisma.
//
// WHAT THIS FILE PROVES: S0 structure · S1–S6 (22, CRM-RUN) · S7 brief extras · U uiVersion-1 PERMANENT RULE · X1 X3 (in-process AND worker
//   PROCESSES) X4 X8 X9 · CLEAN.  n/a: X2 (no REST op / AI tool — C2.11) · X5 (no cron pick-up) · X6 (no free-text input reaches a sink:
//   conditions are enum/keys, values compared only) · X7 (no public endpoint) · X10 (no file / secret).
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants swept in `finally` (every table with tenantId, 4 passes) + users ·
//   no drainOutbox · worker processes re-invoke THIS file with `--x3-worker` (own PrismaClient = own pool) · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const A_FILE = "src/lib/modules/crm/assignment.ts";
const A_SHARED = "src/lib/modules/crm/assignment-shared.ts";
const A_SPEC = "@/lib/modules/crm/assignment";
const CONTACTS_FILE = "src/lib/modules/crm/contacts.ts";
const INDEX_FILE = "src/lib/modules/crm/index.ts";
const PAGE_DIR = "src/app/app/sys/[id]/crm/settings/assignment";
const PAGE = `${PAGE_DIR}/page.tsx`;
const COMP_DIR = "src/components/crm/assignment";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const INVENTORY = "scripts/crm-ui-inventory.json";
const SCHEMA_DIR = "prisma/schema";
const THIS_FILE = "scripts/qc-crm-c2.3.mts";

const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
const FORCE = ARGV.includes("--force-run");
const read = (p: string) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");
const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out.sort();
};

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — the C2.3 engine (the stub has no `simulate`) or its prerequisite C2.0 table absent ⇒ SKIPPED, no DB connection.
// ═══════════════════════════════════════════════════════════════════════════════════
const aSrc0 = read(A_FILE);
const BUILT = /export\s+(async\s+)?function\s+simulate\b/.test(aSrc0) || /export\s+(async\s+)?function\s+createRule\b/.test(aSrc0);
const schemaAll = existsSync(SCHEMA_DIR) ? readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".prisma")).map((f) => read(join(SCHEMA_DIR, f))).join("\n") : "";
const C20 = /model\s+CrmAssignmentRule\s*\{/.test(schemaAll) && (existsSync("prisma/migrations") ? readdirSync("prisma/migrations").some((d) => /_crm_v2_b$/.test(d)) : false);
if (WORKER_AT < 0 && !FORCE && (!BUILT || !C20)) {
  const why = !BUILT
    ? `WO C2.3 not built yet (${A_FILE} is still the C1.4 stub — no simulate/createRule)${C20 ? "" : " — and its prerequisite C2.0 (CrmAssignmentRule · *_crm_v2_b) is absent too"}`
    : "prerequisite C2.0 absent: model CrmAssignmentRule / prisma/migrations/*_crm_v2_b not in the tree";
  console.log(`⚠️  SKIPPED — ${why} (run with --force-run to exercise the fixtures, the workers and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

const ownerActor = (userId: string) => ({ userId, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> });
const managerActor = (userId: string) => ({ userId, role: "MANAGER", unitAccess: ["*"] as string[], permissions: {} as Record<string, unknown> });
const staffActor = (userId: string, perms: Record<string, unknown>) => ({ userId, role: "STAFF", unitAccess: ["*"] as string[], permissions: perms });
const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const n of names) {
    let v: Any = mod;
    for (const p of n.split(".")) v = v?.[p];
    if (typeof v === "function") return v;
  }
  return undefined;
};
const codeOf = (e: Any) => String(e?.code ?? "-");

// ═══════════════════════════════════════════════════════════════════════════════════
// X3 WORKER MODE — this file re-invoked as a child process (own PrismaClient = own pool, synchronised start).
//   argv: --x3-worker <mode> <tenantId> <crmSystemId> <userId> <startAtMs> <base64url(JSON arg)>
//     pick   : { n, draft }        → n parallel assignment.pick(ctx, { auto: true, draft }) → ownerUserId | "NULL" | "ERR:…"
//     create : { phones[], tag }   → parallel contacts.createContact(ctx, OWNER, { firstName, phone, ownerUserId: "auto" }) → owner of the row
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const [mode, wT, wS, wU, wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const AW = (await import(A_SPEC as string).catch(() => ({}))) as Any;
  const CW = (await import("@/lib/modules/crm/contacts" as string).catch(() => ({}))) as Any;
  const PW = ((await import("@/lib/core/db")) as Any).prisma as Any;
  const ctx = { tenantId: wT, systemId: wS, actorUserId: wU };
  const arg = JSON.parse(Buffer.from(String(wArg), "base64url").toString("utf8"));
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  const err = (e: unknown) => `ERR:${codeOf(e)}:${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`;
  const out: string[] = [];
  if (mode === "pick") {
    const pk = fnOf(AW, "pick");
    out.push(...(await Promise.all(Array.from({ length: Number(arg.n ?? 5) }, async () => {
      try {
        if (!pk) throw Object.assign(new Error("pick missing"), { code: "MISSING_FUNCTION" });
        const r = await pk({ tenantId: wT, systemId: wS }, { auto: true, draft: arg.draft });
        return (r?.ownerUserId as string | null) ?? "NULL";
      } catch (e) { return err(e); }
    }))));
  } else if (mode === "create") {
    const cc = fnOf(CW, "createContact");
    out.push(...(await Promise.all((arg.phones as string[]).map(async (phone, i) => {
      try {
        if (!cc) throw Object.assign(new Error("createContact missing"), { code: "MISSING_FUNCTION" });
        const r = await cc(ctx, ownerActor(wU), { firstName: `${arg.tag}-w${i}`, phone, ownerUserId: "auto" });
        const id = r?.contact?.id ?? r?.id;
        const row = id ? await PW.crmContact.findFirst({ where: { id, tenantId: wT } }) : null;
        return (row?.ownerUserId as string | null) ?? "NULL";
      } catch (e) { return err(e); }
    }))));
  }
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  await PW.$disconnect();
  process.exit(0);
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c23-${rand}`;

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const cut = (v: unknown, n = 240) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const thai = (s: unknown) => /[ก-๙]/.test(String(s ?? ""));
const BLAME = /คุณ(ทำ|กรอก|ใส่|เลือก)?ผิด|ผู้ใช้ผิด|ความผิดของคุณ|โง่|ผิดพลาดของคุณ/;
type Res = { ok: boolean; v: Any; err: string; code: string; msg: string };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", msg: "" };
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", msg: "" };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), msg };
  }
};
const refusedThai = (r: Res) => !r.ok && r.code !== "MISSING_FUNCTION" && thai(r.msg) && !BLAME.test(r.msg);
const refusedAs = (r: Res, codes: string[]) => refusedThai(r) && codes.includes(r.code);
const DAY = 86_400_000;
const thaiYmd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const dbDate = (offsetDays: number) => new Date(`${thaiYmd(new Date(Date.now() + offsetDays * DAY))}T00:00:00.000Z`);
const countBy = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});

console.log(`\n═══ QC CRM v2 · C2.3 — assignment rules ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && (!BUILT || !C20) ? ` · --force-run with ${!BUILT ? "C2.3 ABSENT" : "C2.0 table ABSENT"} (C2.3 checks expected red; controls + CLEAN green)` : ""}\n`);

const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <T extends string>(s: T): T => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
let phoneSeq = 0;
const phoneOf = (): string => pii(`08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`);
const NONE = `${TAG}-none`;

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure (static)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  const AS = (await import(A_SPEC as string).catch(() => ({}))) as Any;
  const ASH = (await import("@/lib/modules/crm/assignment-shared" as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const CT = (await import("@/lib/modules/crm/contacts" as string).catch(() => ({}))) as Any;
  const VIS = (await import("@/lib/modules/crm/visibility" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const CONS: Any = OBX.consumers ?? {};
  const aSrc = read(A_FILE);
  const shSrc = read(A_SHARED);
  const ctSrc = read(CONTACTS_FILE);
  const pickF = fnOf(AS, "pick");
  const simulateF = fnOf(AS, "simulate");
  const listRulesF = fnOf(AS, "listRules", "rules.list");
  const createRuleF = fnOf(AS, "createRule", "rules.create");
  const updateRuleF = fnOf(AS, "updateRule", "rules.update");
  const toggleRuleF = fnOf(AS, "toggleRule", "rules.toggle");
  const deleteRuleF = fnOf(AS, "deleteRule", "rules.remove", "rules.delete");
  const reorderRulesF = fnOf(AS, "reorderRules", "rules.reorder");
  const getSettingsF = fnOf(AS, "getAssignmentSettings");
  const setFallbackF = fnOf(AS, "setFallbackUser");
  const openLoadF = fnOf(AS, "openLoadOf");
  {
    const need: [string, Any][] = [["pick", pickF], ["simulate", simulateF], ["listRules", listRulesF], ["createRule", createRuleF], ["updateRule", updateRuleF], ["toggleRule", toggleRuleF],
      ["deleteRule", deleteRuleF], ["reorderRules", reorderRulesF], ["getAssignmentSettings", getSettingsF], ["setFallbackUser", setFallbackF], ["openLoadOf", openLoadF]];
    const missing = need.filter(([, f]) => typeof f !== "function").map(([n]) => n);
    const shImpure = /from\s+["'](@prisma\/client|@\/lib\/core\/db|next\/[^"']+|server-only|\.\/db|\.\/assignment)["']/.test(shSrc);
    const modes = Array.isArray(ASH.ASSIGN_MODES) ? [...ASH.ASSIGN_MODES].map(String).sort().join(",") : "";
    const fields = Array.isArray(ASH.ASSIGN_CONDITION_FIELDS) ? (ASH.ASSIGN_CONDITION_FIELDS as Any[]).map((x) => String(x?.value ?? x?.key ?? x)) : [];
    chk("C2.3-S0.1", "assignment.ts exports the 11 contract functions (pick · simulate · listRules/createRule/updateRule/toggleRule/deleteRule/reorderRules · getAssignmentSettings/setFallbackUser · openLoadOf) · assignment-shared.ts is pure and exports ASSIGN_MODES (the 4 modes) + ASSIGN_CONDITION_FIELDS (⊇ the 5 fixed fields) + ASSIGN_OPS",
      missing.length === 0 && shSrc.length > 0 && !shImpure && modes === "FIXED,LEAST_OPEN,ROUND_ROBIN,TEAM_LEAD" && ["sourceKind", "sourceChannel", "province", "companySize", "language"].every((f) => fields.includes(f)) && Array.isArray(ASH.ASSIGN_OPS),
      "11 fns · pure shared", `missing=${missing.join(",") || "-"} shared=${shSrc.length > 0} impure=${shImpure} modes=${modes || "-"} fields=${fields.join(",") || "-"}`);
  }
  chk("C2.3-S0.2", "the C1.4 stub is gone: pick is async (returns a Promise) and contacts.ts awaits assignment.pick(…) passing its transaction client, inside a `// CRM C2.3 ▸` block [static]",
    /export\s+async\s+function\s+pick\s*\(/.test(aSrc) && !/stub บริสุทธิ์|stub FIXED/.test(aSrc) && /await\s+assignment\.pick\([^;]*\btx\b/.test(ctSrc) && /CRM C2\.3 ▸/.test(ctSrc),
    "async pick awaited in tx", `async=${/export\s+async\s+function\s+pick\s*\(/.test(aSrc)} awaitTx=${/await\s+assignment\.pick\([^;]*\btx\b/.test(ctSrc)} block=${/CRM C2\.3 ▸/.test(ctSrc)}`);
  chk("C2.3-S0.3", "leave is read through the hr FACADE (import from \"@/lib/modules/hr\" — isOnLeave), never from hr/service or the HrLeave table directly [static]",
    /from\s+["']@\/lib\/modules\/hr["']/.test(aSrc) && /isOnLeave/.test(aSrc) && !/modules\/hr\/(service|rules)/.test(aSrc) && !/hrLeave\./.test(aSrc),
    "facade", `facade=${/from\s+["']@\/lib\/modules\/hr["']/.test(aSrc)} direct=${/modules\/hr\/(service|rules)/.test(aSrc) || /hrLeave\./.test(aSrc)}`, "MAJOR");
  chk("C2.3-S0.4", "facade: crm/index.ts exports `assignment` inside a `// CRM C2.3 ▸ … ◂` block (C0.2-S1.6 keeps passing) [static]",
    /CRM C2\.3 ▸[\s\S]*export\s+\*\s+as\s+assignment\s+from\s+["']\.\/assignment["'][\s\S]*◂/.test(read(INDEX_FILE)) && typeof CRM?.assignment?.pick === "function",
    "export * as assignment", `block=${/CRM C2\.3 ▸/.test(read(INDEX_FILE))} runtime=${typeof CRM?.assignment?.pick}`, "MAJOR");
  {
    const miss = ["X1", "X3", "X9"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(aSrc));
    chk("C2.3-S0.5", "implementation sites marked `// AUDIT-CLASS X1 X3 X9` in assignment.ts [static]", miss.length === 0, "3 markers", miss.join(",") || "-", "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — throwaway tenants: A (7 CRM + HR) · B (foreign) · V (uiVersion 1)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const teamsSvc = (await import("@/lib/core/teams" as string)) as Any;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const SALES_PERMS = { "crm.contact.read": true, "crm.contact.create": true, "crm.deal.read": true };
  const userA = await mkUser("");
  const userM = await mkUser("-mgr");
  const userS = await mkUser("-staff"); // STAFF with crm read, no assignment key
  const userK = await mkUser("-keyed"); // STAFF holding crm.assignment.manage
  const U = await Promise.all(["-s1", "-s2", "-s3", "-s4"].map(mkUser)); // the 4 round-robin reps
  const uLead = await mkUser("-lead");
  const uNoKey = await mkUser("-nokey"); // STAFF without any crm key ⇒ cannot see ⇒ never eligible (X1)
  const uOff = await mkUser("-off"); // acceptingLeads = false
  const uLeave = await mkUser("-leave"); // APPROVED leave covering today (Thai)
  const uPendLeave = await mkUser("-pendleave"); // PENDING leave covering today ⇒ still eligible
  const uPastLeave = await mkUser("-pastleave"); // APPROVED leave that ended 3 days ago ⇒ eligible
  const uPend = await mkUser("-pending"); // membership whose acceptedAt is cleared after the rule exists
  const uGone = await mkUser("-gone"); // membership deleted after the rule exists
  const uFull = await mkUser("-full"); // maxOpenPerUser reached
  const uFb = await mkUser("-fallback");
  const uB = await mkUser("-foreign"); // member of tenant B only
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    return t.id as string;
  };
  const member = (tid: string, userId: string, role: string, permissions: Record<string, unknown> = {}) =>
    P.membership.create({ data: { userId, tenantId: tid, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  const owner = ownerActor(userA);
  const manager = managerActor(userM);
  const staff = staffActor(userS, { "crm.contact.read": true, "crm.deal.read": true });
  const staffKeyed = staffActor(userK, { "crm.contact.read": true, "crm.assignment.manage": true });

  const tidA = await mkTenant("a");
  await member(tidA, userA, "OWNER");
  await member(tidA, userM, "MANAGER");
  await member(tidA, userS, "STAFF", { "crm.contact.read": true, "crm.deal.read": true });
  await member(tidA, userK, "STAFF", { "crm.contact.read": true, "crm.assignment.manage": true });
  for (const u of [...U, uLead, uOff, uLeave, uPendLeave, uPastLeave, uPend, uGone, uFull, uFb]) await member(tidA, u, "STAFF", SALES_PERMS);
  await member(tidA, uNoKey, "STAFF", {});
  const crmA = await mk(tidA, "CRM", "CRM"); // functional (first CRM of the tenant)
  const crmA2 = await mk(tidA, "CRM", "CRM สอง"); // same tenant, other system (X1)
  const crmR = await mk(tidA, "CRM", "CRM round-robin"); // RR races
  const crmL = await mk(tidA, "CRM", "CRM least-open"); // LEAST_OPEN race, in-process
  const crmL2 = await mk(tidA, "CRM", "CRM least-open 2"); // LEAST_OPEN race, processes
  const crmF = await mk(tidA, "CRM", "CRM ฟอร์ม"); // form bridge (X4)
  const crmN = await mk(tidA, "CRM", "CRM ไม่มีใคร"); // nobody / notification
  const hrA = await mk(tidA, "HR", "HR");
  const tidB = await mkTenant("b");
  await member(tidB, userA, "OWNER");
  await member(tidB, uB, "STAFF", SALES_PERMS);
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const tidV = await mkTenant("v1");
  await member(tidV, userA, "OWNER");
  await member(tidV, userM, "MANAGER");
  await member(tidV, U[0], "STAFF", SALES_PERMS);
  const crmV = await mk(tidV, "CRM", "CRM-V1");
  for (const s of [crmA, crmA2, crmR, crmL, crmL2, crmF, crmN, crmB]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(crmV, { uiVersion: 2, bridgesEnabled: true }); // flipped to 1 in section U after its rule exists
  const ctxOf = (tid: string, sys: string, uid = userA) => ({ tenantId: tid, systemId: sys, actorUserId: uid });
  const cA = ctxOf(tidA, crmA);
  const cA2 = ctxOf(tidA, crmA2);
  const cR = ctxOf(tidA, crmR);
  const cL = ctxOf(tidA, crmL);
  const cL2 = ctxOf(tidA, crmL2);
  const cF = ctxOf(tidA, crmF);
  const cN = ctxOf(tidA, crmN);
  const cB = ctxOf(tidB, crmB);
  const cV = ctxOf(tidV, crmV);

  // teams: T (lead uLead · U0 U1 · uOff not accepting) · B's team
  const mkTeam = async (tid: string, name: string, lead: string | null, members: string[]) => {
    const t = await call(teamsSvc.createTeam, { tenantId: tid, actorUserId: userA }, { name: `${name} ${TAG}`, leadUserId: lead });
    const id = (t.v?.id as string) ?? (await P.team.create({ data: { tenantId: tid, name: `${name} ${TAG}-raw`, leadUserId: lead } })).id;
    if (!t.ok && lead) await P.teamMember.create({ data: { tenantId: tid, teamId: id, userId: lead, role: "LEAD" } });
    for (const u of members) await P.teamMember.create({ data: { tenantId: tid, teamId: id, userId: u, role: "MEMBER" } });
    return id as string;
  };
  const teamT = await mkTeam(tidA, "ทีมภูเก็ต", uLead, [U[0], U[1], uOff]);
  await P.teamMember.updateMany({ where: { teamId: teamT, userId: uOff }, data: { acceptingLeads: false } });
  const teamB = await mkTeam(tidB, "ทีม-B", null, [uB]);

  // HR: leave fixtures (Thai calendar days · @db.Date = UTC midnight of the Thai day)
  const mkEmp = async (u: string, label: string) => (await P.hrEmployee.create({ data: { tenantId: tidA, systemId: hrA, name: `${label} ${TAG}`, linkedUserId: u } })).id as string;
  await P.hrLeave.create({ data: { tenantId: tidA, systemId: hrA, employeeId: await mkEmp(uLeave, "ลา"), fromDate: dbDate(-1), toDate: dbDate(1), status: "APPROVED" } });
  await P.hrLeave.create({ data: { tenantId: tidA, systemId: hrA, employeeId: await mkEmp(uPendLeave, "รออนุมัติ"), fromDate: dbDate(-1), toDate: dbDate(1), status: "PENDING" } });
  await P.hrLeave.create({ data: { tenantId: tidA, systemId: hrA, employeeId: await mkEmp(uPastLeave, "ลาเสร็จแล้ว"), fromDate: dbDate(-6), toDate: dbDate(-3), status: "APPROVED" } });

  // pipelines (for OPEN / WON deals of the load fixtures)
  const STD = [{ name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10 }, { name: "เสนอราคา", kind: "OPEN", probability: 60 }, { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 }];
  const mkPipe = async (tid: string, sys: string) => {
    const p = (await P.crmPipeline.create({
      data: { tenantId: tid, systemId: sys, name: `ขาย ${TAG}-${nx()}`, stages: { create: STD.map((s, i) => ({ tenantId: tid, systemId: sys, sortOrder: i, ...s })) } },
      include: { stages: true },
    })) as Any;
    return { id: p.id as string, st: [...(p.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string) };
  };
  const pA = await mkPipe(tidA, crmA);
  const mkParty = async (tid: string, name: string, extra: Record<string, Any> = {}) => (await P.party.create({ data: { tenantId: tid, name, kind: "PERSON", ...extra } })).id as string;
  const rawContact = async (tid: string, sys: string, ownerUserId: string | null, extra: Record<string, Any> = {}) => {
    const name = pii(`ลูกค้า ${TAG}-${nx()}`);
    const partyId = await mkParty(tid, name);
    return (await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, phone: phoneOf(), partyId, ownerUserId, ...extra } })).id as string;
  };
  const rawDeal = async (tid: string, sys: string, pipe: { id: string; st: string[] }, contactId: string, ownerUserId: string, stageIdx: number, kind: string) =>
    (await P.crmDeal.create({ data: { tenantId: tid, systemId: sys, contactId, pipelineId: pipe.id, stageId: pipe.st[stageIdx], title: `ดีล ${TAG}-${nx()}`, valueSatang: 100_000, ownerUserId, kind } })).id as string;

  // rules: service first (the contract), raw insert when the service is absent/refuses — so pick is exercised independently
  const RAW_RULES: string[] = [];
  const mkRule = async (c: Any, input: Record<string, Any>): Promise<string> => {
    const r = await call(createRuleF, c, owner, input);
    const id = r.v?.id ?? r.v?.rule?.id;
    if (typeof id === "string" && id) return id;
    const n = (await P.crmAssignmentRule.count({ where: { systemId: c.systemId } })) as number;
    const row = await P.crmAssignmentRule.create({
      data: { tenantId: c.tenantId, systemId: c.systemId, name: String(input.name ?? `กฎ ${TAG}`), conditions: input.conditions ?? { items: [] }, mode: input.mode, userIds: input.userIds ?? [], teamId: input.teamId ?? null, maxOpenPerUser: input.maxOpenPerUser ?? null, sortOrder: n, active: input.active ?? true },
    });
    RAW_RULES.push(row.id);
    return row.id as string;
  };
  const resetRules = (sys: string) => P.crmAssignmentRule.deleteMany({ where: { systemId: sys } });
  const cursorOf = async (id: string) => Number((await P.crmAssignmentRule.findFirst({ where: { id } }))?.rrCursor ?? -1);
  const pick = async (c: Any, draft: Record<string, Any> = {}, extra: Record<string, Any> = {}): Promise<Res> => call(pickF, { tenantId: c.tenantId, systemId: c.systemId }, { auto: true, draft, ...extra });
  const ownerOf = (r: Res): string => (r.ok ? ((r.v?.ownerUserId as string | null) ?? "NULL") : `ERR ${r.err}`);
  const createAuto = async (c: Any, extra: Record<string, Any> = {}) => {
    const r = await call(CT.createContact, c, owner, { firstName: pii(`ลีด ${TAG}-${nx()}`), phone: phoneOf(), ownerUserId: "auto", ...extra });
    const id = r.v?.contact?.id ?? r.v?.id;
    const row = typeof id === "string" ? await P.crmContact.findFirst({ where: { id, tenantId: c.tenantId } }) : null;
    return { r, row: row as Any, id: (typeof id === "string" ? id : NONE) as string };
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — rule order + the six condition kinds (direct pick on crmA)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · order + conditions ──");
  {
    await resetRules(crmA);
    const r1 = await mkRule(cA, { name: `ฟอร์มเว็บ ${TAG}`, mode: "FIXED", userIds: [U[0]], conditions: { items: [{ field: "sourceKind", op: "eq", value: "WEB_FORM" }] } });
    const r2 = await mkRule(cA, { name: `ทุกช่องทาง ${TAG}`, mode: "FIXED", userIds: [U[1]], conditions: { items: [] } });
    const web = await pick(cA, { sourceKind: "WEB_FORM" });
    const chat = await pick(cA, { sourceKind: "CHAT" });
    const ro = await call(reorderRulesF, cA, owner, [r2, r1]);
    const webAfter = await pick(cA, { sourceKind: "WEB_FORM" });
    chk("C2.3-S1.1", "sourceKind + ORDER: WEB_FORM ⇒ rule 1 (U0, assignedBy RULE:<r1>, reason RULE) · CHAT does not match rule 1 ⇒ rule 2 (U1) · after reorderRules([r2, r1]) the catch-all is first ⇒ WEB_FORM ⇒ U1",
      ownerOf(web) === U[0] && web.v?.assignedBy === `RULE:${r1}` && web.v?.reason === "RULE" && web.v?.ruleId === r1 && ownerOf(chat) === U[1] && ro.ok && ownerOf(webAfter) === U[1],
      "U0 · U1 · U1", `web=${ownerOf(web)}/${web.v?.assignedBy} chat=${ownerOf(chat)} reorder=${ro.ok ? "ok" : ro.err} after=${ownerOf(webAfter)}`);
  }
  const condCase = async (id: string, title: string, cond: Record<string, Any>, yes: Record<string, Any>, no: Record<string, Any>) => {
    await resetRules(crmA);
    const rc = await mkRule(cA, { name: `เงื่อนไข ${id} ${TAG}`, mode: "FIXED", userIds: [U[2]], conditions: { items: [cond] } });
    await mkRule(cA, { name: `ที่เหลือ ${id} ${TAG}`, mode: "FIXED", userIds: [U[3]], conditions: { items: [] } });
    const y = await pick(cA, yes);
    const n = await pick(cA, no);
    chk(id, `${title}: matching draft ⇒ the condition rule (U2 · ruleId) · non-matching draft ⇒ falls to the next rule (U3) — positive + negative`,
      ownerOf(y) === U[2] && y.v?.ruleId === rc && ownerOf(n) === U[3], "U2 / U3", `yes=${ownerOf(y)} no=${ownerOf(n)}`);
  };
  await condCase("C2.3-S1.2", "sourceChannel eq \"facebook\"", { field: "sourceChannel", op: "eq", value: "facebook" }, { sourceChannel: "facebook" }, { sourceChannel: "line" });
  {
    const pPhuket = await mkParty(tidA, pii(`ที่อยู่ภูเก็ต ${TAG}`), { address: "99/1 ถ.ราษฎร์อุทิศ ต.ป่าตอง อ.กะทู้ จ.ภูเก็ต 83150" });
    const pKrabi = await mkParty(tidA, pii(`ที่อยู่กระบี่ ${TAG}`), { address: "12 ถ.อุตรกิจ อ.เมือง จ.กระบี่ 81000" });
    await condCase("C2.3-S1.3", "province in [\"ภูเก็ต\"] read from the Party address of draft.partyId (free-text CONTAINS)", { field: "province", op: "in", value: ["ภูเก็ต"] }, { partyId: pPhuket }, { partyId: pKrabi });
  }
  await condCase("C2.3-S1.4", "custom field f.product (interested product) eq \"ดำน้ำลึก\" read from draft.fields", { field: "f.product", op: "eq", value: "ดำน้ำลึก" }, { fields: { product: "ดำน้ำลึก" } }, { fields: { product: "ดำน้ำตื้น" } });
  {
    const mkCo = async (size: string) => {
      const pid = (await P.party.create({ data: { tenantId: tidA, name: `บริษัท ${size} ${TAG}`, kind: "COMPANY" } })).id as string;
      return (await P.crmCompany.create({ data: { tenantId: tidA, systemId: crmA, name: `บริษัท ${size} ${TAG}`, partyId: pid, size } })).id as string;
    };
    const big = await mkCo("LARGE");
    const small = await mkCo("MICRO");
    await condCase("C2.3-S1.5", "companySize in [LARGE, ENTERPRISE] read from CrmCompany.size of draft.companyId", { field: "companySize", op: "in", value: ["LARGE", "ENTERPRISE"] }, { companyId: big }, { companyId: small });
  }
  await condCase("C2.3-S1.6", "language eq \"en\" (draft.locale · absent = \"th\")", { field: "language", op: "eq", value: "en" }, { locale: "en" }, {});

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — ROUND_ROBIN (crmR: rule over U0..U3, no conditions)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · round-robin ──");
  await resetRules(crmR);
  const rrRule = await mkRule(cR, { name: `RR ${TAG}`, mode: "ROUND_ROBIN", userIds: [...U], conditions: { items: [] } });
  {
    const seqOwners: string[] = [];
    for (let i = 0; i < 8; i += 1) seqOwners.push(ownerOf(await pick(cR, { sourceKind: "WEB_FORM" })));
    const windows = [0, 1, 2, 3, 4].map((s) => new Set(seqOwners.slice(s, s + 4)));
    chk("C2.3-S2.1", "sequential: 8 picks cycle through the 4 reps — every window of 4 consecutive picks holds all 4 distinct reps (U0..U3) and nobody else",
      windows.every((w) => w.size === 4 && [...w].every((x) => U.includes(x))), "4 distinct per window", seqOwners.map((x) => U.indexOf(x)).join(","));
  }
  {
    const c0 = await cursorOf(rrRule);
    const par = (await Promise.all(Array.from({ length: 20 }, () => pick(cR, { sourceKind: "WEB_FORM" })))).map(ownerOf);
    const by = countBy(par);
    const c1 = await cursorOf(rrRule);
    chk("C2.3-S2.2", "20 parallel picks (separate pool connections) over 4 reps ⇒ exactly 5 each · rrCursor back where it started ((c0 + 20) % 4 = c0) and within [0, 4)",
      U.every((u) => by[u] === 5) && par.length === 20 && c1 === c0 && c1 >= 0 && c1 < 4, "5/5/5/5", `${U.map((u) => by[u] ?? 0).join("/")} other=${cut(j(Object.keys(by).filter((k) => !U.includes(k))), 120)} cursor ${c0}→${c1}`);
  }
  chk("C2.3-S2.3", "the cursor moves with ONE statement: `\"rrCursor\" = (\"rrCursor\" + 1) % …` + RETURNING in assignment.ts, and no Prisma update writes rrCursor from a JS value (no read-modify-write) [static]",
    /"rrCursor"\s*=\s*\(\s*"rrCursor"\s*\+\s*1\s*\)\s*%/.test(aSrc) && /RETURNING/i.test(aSrc) && !/data:\s*\{[^}]*\brrCursor\s*:/.test(aSrc),
    "single statement", `stmt=${/"rrCursor"\s*=\s*\(\s*"rrCursor"\s*\+\s*1\s*\)\s*%/.test(aSrc)} returning=${/RETURNING/i.test(aSrc)} rmw=${/data:\s*\{[^}]*\brrCursor\s*:/.test(aSrc)}`);

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — LEAST_OPEN (open load definition) · TEAM_LEAD
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · LEAST_OPEN · TEAM_LEAD ──");
  {
    await resetRules(crmA);
    // U0: 2 open leads + 1 OPEN deal (on a contact owned by the owner) = 3 · U1: 1 open lead = 1 ·
    // U2: 1 open lead + NOT counted: 1 WON deal · 1 archived lead · 1 UNQUALIFIED lead · 1 CUSTOMER contact · a lead in crmA2 = 1
    await rawContact(tidA, crmA, U[0], { lifecycleStage: "LEAD", leadStatus: "NEW" });
    await rawContact(tidA, crmA, U[0], { lifecycleStage: "LEAD", leadStatus: "CONTACTED" });
    const host0 = await rawContact(tidA, crmA, userA, { lifecycleStage: "PROSPECT" });
    await rawDeal(tidA, crmA, pA, host0, U[0], 0, "OPEN");
    await rawContact(tidA, crmA, U[1], { lifecycleStage: "LEAD", leadStatus: "NEW" });
    await rawContact(tidA, crmA, U[2], { lifecycleStage: "LEAD", leadStatus: "QUALIFIED" });
    await rawDeal(tidA, crmA, pA, host0, U[2], 2, "WON");
    await rawContact(tidA, crmA, U[2], { lifecycleStage: "LEAD", leadStatus: "NEW", archivedAt: new Date() });
    await rawContact(tidA, crmA, U[2], { lifecycleStage: "LEAD", leadStatus: "UNQUALIFIED" });
    await rawContact(tidA, crmA, U[2], { lifecycleStage: "CUSTOMER" });
    await rawContact(tidA, crmA2, U[2], { lifecycleStage: "LEAD", leadStatus: "NEW" });
    const lo = await mkRule(cA, { name: `ว่างสุด ${TAG}`, mode: "LEAST_OPEN", userIds: [U[0], U[1], U[2]], conditions: { items: [] } });
    const load = await call(openLoadF, { tenantId: tidA, systemId: crmA }, [U[0], U[1], U[2]]);
    const first = await pick(cA, {});
    await rawContact(tidA, crmA, U[1], { lifecycleStage: "LEAD", leadStatus: "NURTURE" });
    const second = await pick(cA, {});
    chk("C2.3-S3.1", "LEAST_OPEN: openLoadOf = {U0: 3, U1: 1, U2: 1} (open leads + OPEN deals of THIS system; WON deal · archived · UNQUALIFIED · CUSTOMER · other system not counted) ⇒ pick = U1 (tie U1/U2 ⇒ candidate order) · U1 gets one more open lead ⇒ U2",
      Number(load.v?.[U[0]]) === 3 && Number(load.v?.[U[1]]) === 1 && Number(load.v?.[U[2]]) === 1 && ownerOf(first) === U[1] && first.v?.ruleId === lo && ownerOf(second) === U[2],
      "3/1/1 · U1 · U2", `load=${load.ok ? `${load.v?.[U[0]]}/${load.v?.[U[1]]}/${load.v?.[U[2]]}` : load.err} first=${U.indexOf(ownerOf(first))} second=${U.indexOf(ownerOf(second))}`);
  }
  {
    await resetRules(crmA);
    const tl = await mkRule(cA, { name: `หัวหน้าทีม ${TAG}`, mode: "TEAM_LEAD", teamId: teamT, conditions: { items: [] } });
    const r = await pick(cA, {});
    chk("C2.3-S3.2", "TEAM_LEAD: rule on team T ⇒ the team's lead (uLead) · teamId = T · ruleId = the rule",
      ownerOf(r) === uLead && r.v?.teamId === teamT && r.v?.ruleId === tl, "uLead · T", `owner=${ownerOf(r) === uLead ? "uLead" : ownerOf(r)} team=${r.v?.teamId === teamT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — maxOpenPerUser · acceptingLeads · HR leave · membership/visibility eligibility
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · eligibility ──");
  {
    await resetRules(crmA);
    const fullLeads = [await rawContact(tidA, crmA, uFull, { lifecycleStage: "LEAD", leadStatus: "NEW" }), await rawContact(tidA, crmA, uFull, { lifecycleStage: "LEAD", leadStatus: "NEW" })];
    await mkRule(cA, { name: `เพดาน ${TAG}`, mode: "FIXED", userIds: [uFull, U[1]], maxOpenPerUser: 2, conditions: { items: [] } });
    const atCap = await pick(cA, {});
    await P.crmContact.update({ where: { id: fullLeads[0] }, data: { archivedAt: new Date() } });
    const below = await pick(cA, {});
    chk("C2.3-S4.1", "maxOpenPerUser 2: uFull holds 2 open leads ⇒ skipped ⇒ next candidate U1 · [positive control] one of them archived (load 1) ⇒ uFull again",
      ownerOf(atCap) === U[1] && ownerOf(below) === uFull, "U1 then uFull", `atCap=${ownerOf(atCap) === uFull ? "uFull" : U.indexOf(ownerOf(atCap))} below=${ownerOf(below) === uFull ? "uFull" : ownerOf(below)}`);
  }
  {
    await resetRules(crmA);
    await mkRule(cA, { name: `ปิดรับ ${TAG}`, mode: "FIXED", teamId: teamT, userIds: [uOff, U[0]], conditions: { items: [] } });
    const off = await pick(cA, {});
    await P.teamMember.updateMany({ where: { teamId: teamT, userId: uOff }, data: { acceptingLeads: true } });
    const on = await pick(cA, {});
    await P.teamMember.updateMany({ where: { teamId: teamT, userId: uOff }, data: { acceptingLeads: false } });
    chk("C2.3-S4.2", "acceptingLeads=false on the rule's team row ⇒ uOff skipped (⇒ U0) · [positive control] flipped to true ⇒ uOff",
      ownerOf(off) === U[0] && ownerOf(on) === uOff, "U0 then uOff", `off=${ownerOf(off) === uOff ? "uOff" : U.indexOf(ownerOf(off))} on=${ownerOf(on) === uOff ? "uOff" : ownerOf(on)}`);
  }
  {
    await resetRules(crmA);
    await mkRule(cA, { name: `ลา ${TAG}`, mode: "FIXED", userIds: [uLeave, U[0]], conditions: { items: [] } });
    const leave = await pick(cA, {});
    await resetRules(crmA);
    await mkRule(cA, { name: `รออนุมัติลา ${TAG}`, mode: "FIXED", userIds: [uPendLeave, U[0]], conditions: { items: [] } });
    const pend = await pick(cA, {});
    await resetRules(crmA);
    await mkRule(cA, { name: `ลาจบแล้ว ${TAG}`, mode: "FIXED", userIds: [uPastLeave, U[0]], conditions: { items: [] } });
    const past = await pick(cA, {});
    chk("C2.3-S4.3", "HR leave (hr.isOnLeave, Thai day): APPROVED leave covering today ⇒ skipped (⇒ U0) · [positive controls] PENDING leave ⇒ still picked · APPROVED leave that ended 3 days ago ⇒ picked",
      ownerOf(leave) === U[0] && ownerOf(pend) === uPendLeave && ownerOf(past) === uPastLeave, "U0 · uPendLeave · uPastLeave",
      `leave=${ownerOf(leave) === uLeave ? "uLeave(!)" : U.indexOf(ownerOf(leave))} pend=${ownerOf(pend) === uPendLeave} past=${ownerOf(past) === uPastLeave}`);
  }
  {
    await resetRules(crmA);
    await mkRule(cA, { name: `สมาชิกภาพ ${TAG}`, mode: "FIXED", userIds: [uGone, uPend, uNoKey, U[3]], conditions: { items: [] } });
    const before = await pick(cA, {});
    await P.membership.deleteMany({ where: { tenantId: tidA, userId: uGone } });
    await P.membership.updateMany({ where: { tenantId: tidA, userId: uPend }, data: { acceptedAt: null } });
    const after = await pick(cA, {});
    chk("C2.3-S4.4", "membership at PICK time: [positive control] uGone first while still a member ⇒ uGone · then uGone removed from the tenant · uPend's acceptedAt cleared · uNoKey holds no crm key (cannot see a contact — X1) ⇒ all three skipped ⇒ U3",
      ownerOf(before) === uGone && ownerOf(after) === U[3], "uGone then U3", `before=${ownerOf(before) === uGone} after=${[uGone, uPend, uNoKey].includes(ownerOf(after)) ? "an ineligible user" : U.indexOf(ownerOf(after))}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — fallback · nobody ⇒ unassigned + notify OWNER/MANAGER
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · fallback / nobody ──");
  {
    await resetRules(crmA);
    await mkRule(cA, { name: `เฉพาะ POS ${TAG}`, mode: "FIXED", userIds: [U[0]], conditions: { items: [{ field: "sourceKind", op: "eq", value: "POS" }] } });
    await mkRule(cA, { name: `คนลาทั้งหมด ${TAG}`, mode: "FIXED", userIds: [uLeave], conditions: { items: [{ field: "sourceKind", op: "eq", value: "CHAT" }] } });
    const setFb = await call(setFallbackF, cA, owner, uFb);
    const noMatch = await pick(cA, { sourceKind: "WEB_FORM" });
    const exhausted = await pick(cA, { sourceKind: "CHAT" });
    const clr = await call(setFallbackF, cA, owner, null);
    const none = await pick(cA, { sourceKind: "WEB_FORM" });
    chk("C2.3-S5.1", "fallback (settings.crm.assignment.fallbackUserId = uFb): no rule matched ⇒ uFb (reason FALLBACK, assignedBy RULE:fallback) · matching rule whose only candidate is on leave ⇒ uFb · [control] fallback cleared ⇒ NOBODY (owner null)",
      setFb.ok && ownerOf(noMatch) === uFb && noMatch.v?.reason === "FALLBACK" && noMatch.v?.assignedBy === "RULE:fallback" && ownerOf(exhausted) === uFb && clr.ok && none.ok && none.v?.ownerUserId === null && none.v?.reason === "NOBODY",
      "uFb · uFb · null", `set=${setFb.ok ? "ok" : setFb.err} noMatch=${ownerOf(noMatch) === uFb}/${noMatch.v?.reason}/${noMatch.v?.assignedBy} exhausted=${ownerOf(exhausted) === uFb} none=${ownerOf(none)}/${none.v?.reason}`);
  }
  let nobodyContact = NONE;
  {
    await resetRules(crmN);
    await mkRule(cN, { name: `ไม่มีใครว่าง ${TAG}`, mode: "ROUND_ROBIN", userIds: [uLeave, uNoKey], conditions: { items: [] } });
    const t0 = new Date(Date.now() - 1000);
    const made = await createAuto(cN);
    nobodyContact = made.id;
    const notes = (await P.appNotification.findMany({ where: { tenantId: tidA, createdAt: { gte: t0 }, body: { contains: made.id } } })) as Any[];
    const recips = notes.map((n) => n.recipientUserId as string | null).sort();
    const text = notes.map((n) => `${n.title} ${n.body}`).join(" ");
    chk("C2.3-S5.2", "nobody eligible and no fallback: createContact(ownerUserId \"auto\") succeeds with ownerUserId null (assignedBy null) + ONE AppNotification per OWNER/MANAGER member (userA, userM — none to STAFF) · Thai title · body carries the contact id · no name/phone of the lead",
      made.r.ok && made.row && made.row.ownerUserId === null && made.row.assignedBy === null && notes.length === 2 && j(recips) === j([userA, userM].sort()) && notes.every((n) => thai(n.title)) && !PII.some((p) => text.includes(p)),
      "owner null · 2 notifications", `create=${made.r.ok ? "ok" : made.r.err} owner=${made.row?.ownerUserId} notes=${notes.length} recips=${recips.map((r) => (r === userA ? "owner" : r === userM ? "mgr" : r ?? "ALL")).join(",")}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — simulate + UI
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6 · simulate + UI ──");
  {
    await resetRules(crmA);
    const rw = await mkRule(cA, { name: `เว็บ RR ${TAG}`, mode: "ROUND_ROBIN", userIds: [U[0], U[1], U[2]], conditions: { items: [{ field: "sourceKind", op: "eq", value: "WEB_FORM" }] } });
    const rc = await mkRule(cA, { name: `แชท ${TAG}`, mode: "FIXED", userIds: [U[3]], conditions: { items: [{ field: "sourceKind", op: "eq", value: "CHAT" }] } });
    const rows = [{ sourceKind: "WEB_FORM" }, { sourceKind: "WEB_FORM" }, { sourceKind: "CHAT" }, { sourceKind: "WEB_FORM" }, { sourceKind: "LINE_OA" }, { sourceKind: "WEB_FORM" }];
    const cur0 = await cursorOf(rw);
    const t0 = new Date(Date.now() - 1000);
    const [au0, ob0, nt0, ct0] = await Promise.all([
      P.auditLog.count({ where: { tenantId: tidA, createdAt: { gte: t0 } } }), P.outboxEvent.count({ where: { tenantId: tidA, createdAt: { gte: t0 } } }),
      P.appNotification.count({ where: { tenantId: tidA, createdAt: { gte: t0 } } }), P.crmContact.count({ where: { systemId: crmA } }),
    ]);
    const sim = await call(simulateF, cA, owner, rows);
    const res = (sim.v?.results ?? []) as Any[];
    const cur1 = await cursorOf(rw);
    const [au1, ob1, nt1, ct1] = await Promise.all([
      P.auditLog.count({ where: { tenantId: tidA, createdAt: { gte: t0 } } }), P.outboxEvent.count({ where: { tenantId: tidA, createdAt: { gte: t0 } } }),
      P.appNotification.count({ where: { tenantId: tidA, createdAt: { gte: t0 } } }), P.crmContact.count({ where: { systemId: crmA } }),
    ]);
    const real: Res[] = [];
    for (const d of rows) real.push(await pick(cA, d));
    const simOwners = res.map((x) => (x?.ownerUserId as string | null) ?? "NULL");
    const realOwners = real.map(ownerOf);
    chk("C2.3-S6.1", "simulate(6 rows) predicts exactly what 6 real picks then do, in order (RR from the current cursor · CHAT ⇒ rule 2 · LINE_OA ⇒ nobody) · each result carries ruleId and a Thai reasonText",
      sim.ok && res.length === 6 && j(simOwners) === j(realOwners) && res[2]?.ruleId === rc && res[0]?.ruleId === rw && res[4]?.ownerUserId === null && res.every((x) => thai(x?.reasonText)),
      "identical", `sim=${sim.ok ? simOwners.map((o) => (U.includes(o) ? `U${U.indexOf(o)}` : o)).join(",") : sim.err} real=${realOwners.map((o) => (U.includes(o) ? `U${U.indexOf(o)}` : o)).join(",")}`);
    chk("C2.3-S6.2", "simulate writes NOTHING: rrCursor unchanged · no audit row · no outbox event · no notification · no contact",
      sim.ok && cur1 === cur0 && au1 === au0 && ob1 === ob0 && nt1 === nt0 && ct1 === ct0, "no writes", `cursor ${cur0}→${cur1} audit ${au0}→${au1} outbox ${ob0}→${ob1} notif ${nt0}→${nt1} contacts ${ct0}→${ct1}`);
  }
  {
    const page = read(PAGE);
    chk("C2.3-S6.3", `page ${PAGE}: CRM system guard (type "CRM") → requireCrmV2Page → crmCan(… "crm.assignment.manage") else notFound() [static]`,
      page.length > 0 && /type:\s*"CRM"/.test(page) && /requireCrmV2Page/.test(page) && /crm\.assignment\.manage/.test(page) && /notFound\(/.test(page), "guarded",
      `exists=${page.length > 0} v2=${/requireCrmV2Page/.test(page)} perm=${/crm\.assignment\.manage/.test(page)}`);
    const nav = read(NAV_FILE);
    let inv: Any[] = [];
    try { inv = (JSON.parse(read(INVENTORY)).rows ?? []) as Any[]; } catch { inv = []; }
    const rows = inv.filter((r) => r?.wo === "C2.3" && /\/settings\/assignment/.test(String(r?.page ?? "")));
    const uiSrc = [page, ...walk(PAGE_DIR).map(read), ...walk(COMP_DIR).map(read)].join("\n");
    const orphan = rows.filter((r) => !uiSrc.includes(String(r.testid ?? "").replace(/\*$/, "")));
    const needIds = ["crm-assign-rule-list", "crm-assign-rule-new", "crm-assign-fallback", "crm-assign-simulate-run", "crm-assign-simulate-result"];
    const missIds = needIds.filter((t) => !uiSrc.includes(t));
    chk("C2.3-S6.4", "nav: CRM_DEEP_NAV has path /crm/settings/assignment (status ready, wo C2.3) · inventory ≥ 6 rows (page /settings/assignment, wo C2.3) all present in the page/components · the 5 core testids (rule list · new · fallback · simulate run · simulate result) exist [static]",
      /path:\s*"\/crm\/settings\/assignment"[^}]*status:\s*"ready"[^}]*wo:\s*"C2\.3"/.test(nav) && rows.length >= 6 && orphan.length === 0 && missIds.length === 0, "nav + rows",
      `nav=${/\/crm\/settings\/assignment/.test(nav)} rows=${rows.length} orphan=${orphan.map((r) => r.testid).join(",") || "-"} missing=${missIds.join(",") || "-"}`, "MAJOR");
    const files = [...walk(PAGE_DIR), ...walk(COMP_DIR), ...walk("src/lib/modules/crm").filter((f) => /assignment/.test(f))];
    const clientBad = files.filter((f) => /^\s*["']use client["']/.test(read(f)) && /from\s+["'](@\/lib\/core\/db|@prisma\/client|@\/lib\/modules\/crm(\/(?!.*-shared)[^"']*)?)["']/.test(read(f)));
    const serverFiles = files.filter((f) => /^\s*["']use server["']/.test(read(f)));
    const serverBad = serverFiles.filter((f) => /export\s+(type|interface|const|let|function\s)/.test(read(f)) || !/assertCrmV2|crmUiVersion/.test(read(f)));
    chk("C2.3-S6.5", "client files never import prisma-reaching modules (only *-shared) · \"use server\" files export async functions only and call assertCrmV2 [static]",
      files.length > 0 && clientBad.length === 0 && serverFiles.length >= 1 && serverBad.length === 0, "safe",
      `files=${files.length} clientBad=${clientBad.join(",") || "-"} server=${serverFiles.length} serverBad=${serverBad.join(",") || "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — brief extras: contact paths · CRUD · validation · settings · first-match-final · AND/OR
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S7 · contact paths · CRUD · validation ──");
  {
    await resetRules(crmA);
    const rt = await mkRule(cA, { name: `ทีม RR ${TAG}`, mode: "ROUND_ROBIN", teamId: teamT, userIds: [U[0], U[1]], conditions: { items: [] } });
    const auto = await createAuto(cA);
    const fixed = await call(CT.createContact, cA, owner, { firstName: pii(`เลือกเอง ${TAG}`), phone: phoneOf(), ownerUserId: U[3] });
    const fixedRow = await P.crmContact.findFirst({ where: { id: fixed.v?.contact?.id ?? NONE } });
    const mine = await call(CT.createContact, cA, owner, { firstName: pii(`ไม่เลือก ${TAG}`), phone: phoneOf() });
    const mineRow = await P.crmContact.findFirst({ where: { id: mine.v?.contact?.id ?? NONE } });
    chk("C2.3-S7.1", "createContact paths on v2: ownerUserId \"auto\" ⇒ the rule (owner ∈ {U0,U1}, assignedBy RULE:<id>, assignedAt set, teamId = T) · explicit owner ⇒ that owner (unchanged) · no owner ⇒ the creator (C1.4 unchanged)",
      auto.r.ok && [U[0], U[1]].includes(auto.row?.ownerUserId) && auto.row?.assignedBy === `RULE:${rt}` && !!auto.row?.assignedAt && auto.row?.teamId === teamT && fixedRow?.ownerUserId === U[3] && mineRow?.ownerUserId === userA,
      "rule · U3 · creator", `auto=${auto.r.ok ? `${U.indexOf(auto.row?.ownerUserId)}/${auto.row?.assignedBy === `RULE:${rt}`}/team=${auto.row?.teamId === teamT}` : auto.r.err} fixed=${fixedRow?.ownerUserId === U[3]} mine=${mineRow?.ownerUserId === userA}`);
    const canSee = fnOf(VIS, "canSee");
    const seer = staffActor(auto.row?.ownerUserId ?? NONE, SALES_PERMS);
    const sees = auto.row ? await call(canSee, cA, seer, "CONTACT", auto.id) : ({ ok: false, err: "no row" } as Res);
    const outsider = await call(canSee, cA, staffActor(U[3], SALES_PERMS), "CONTACT", auto.id);
    chk("C2.3-X1.5", "the assignee can SEE the record afterwards (visibility.canSee as the assignee STAFF = true) · [control] another STAFF outside the team and not the owner does not (false)",
      sees.ok && sees.v === true && outsider.ok && outsider.v === false, "true / false", `assignee=${sees.ok ? sees.v : sees.err} outsider=${outsider.ok ? outsider.v : outsider.err}`);
  }
  {
    await resetRules(crmA);
    const a = await call(createRuleF, cA, owner, { name: `ก ${TAG}`, mode: "FIXED", userIds: [U[0]], conditions: { items: [] } });
    const b = await call(createRuleF, cA, owner, { name: `ข ${TAG}`, mode: "FIXED", userIds: [U[1]], conditions: { items: [] } });
    const idA = a.v?.id ?? NONE;
    const idB = b.v?.id ?? NONE;
    const up = await call(updateRuleF, cA, owner, idA, { name: `ก แก้ ${TAG}`, userIds: [U[2]] });
    const off = await call(toggleRuleF, cA, owner, idA, false);
    const whenOff = await pick(cA, {});
    const onAgain = await call(toggleRuleF, cA, owner, idA, true);
    const whenOn = await pick(cA, {});
    const list = await call(listRulesF, cA, owner);
    const names = ((list.v ?? []) as Any[]).map((r) => r?.id);
    chk("C2.3-S7.2", "CRUD: createRule ×2 · updateRule (userIds → U2) · toggleRule(false) ⇒ the inactive rule is skipped (⇒ U1 of rule 2) · toggleRule(true) ⇒ U2 again · listRules ordered by sortOrder [ruleA, ruleB]",
      a.ok && b.ok && up.ok && off.ok && ownerOf(whenOff) === U[1] && onAgain.ok && ownerOf(whenOn) === U[2] && j(names) === j([idA, idB]),
      "U1 then U2", `create=${a.ok && b.ok} update=${up.ok ? "ok" : up.err} off=${U.indexOf(ownerOf(whenOff))} on=${U.indexOf(ownerOf(whenOn))} list=${names.length}`);
  }
  {
    await resetRules(crmA);
    const before = (await P.crmAssignmentRule.count({ where: { tenantId: tidA } })) as number;
    const bad: [string, Record<string, Any>][] = [
      ["mode", { name: `x ${TAG}`, mode: "RANDOM", userIds: [U[0]] }],
      ["no candidate", { name: `x ${TAG}`, mode: "ROUND_ROBIN", userIds: [] }],
      ["TEAM_LEAD no team", { name: `x ${TAG}`, mode: "TEAM_LEAD" }],
      ["field", { name: `x ${TAG}`, mode: "FIXED", userIds: [U[0]], conditions: { items: [{ field: "salary", op: "eq", value: "1" }] } }],
      ["op", { name: `x ${TAG}`, mode: "FIXED", userIds: [U[0]], conditions: { items: [{ field: "sourceKind", op: "regex", value: ".*" }] } }],
      ["max", { name: `x ${TAG}`, mode: "LEAST_OPEN", userIds: [U[0]], maxOpenPerUser: 0 }],
      ["name", { name: "   ", mode: "FIXED", userIds: [U[0]] }],
    ];
    const outs: string[] = [];
    for (const [k, input] of bad) {
      const r = await call(createRuleF, cA, owner, input);
      if (!refusedAs(r, ["VALIDATION"])) outs.push(`${k}:${r.ok ? "ACCEPTED" : r.err}`);
    }
    const after = (await P.crmAssignmentRule.count({ where: { tenantId: tidA } })) as number;
    chk("C2.3-S7.3", "validation: unknown mode · RR without candidates · TEAM_LEAD without team · unknown condition field · unknown op · maxOpenPerUser 0 · blank name ⇒ each VALIDATION with a Thai message that does not blame the user · nothing written",
      outs.length === 0 && after === before, "7 × VALIDATION", `${outs.join(" | ") || "-"} rows ${before}→${after}`, "MAJOR");
  }
  {
    const s0 = await call(setFallbackF, cA, owner, uFb);
    const got = await call(getSettingsF, cA, owner);
    const raw = (await P.appSystem.findFirst({ where: { id: crmA } }))?.settings as Any;
    const foreign = await call(setFallbackF, cA, owner, uB);
    const raw2 = (await P.appSystem.findFirst({ where: { id: crmA } }))?.settings as Any;
    await call(setFallbackF, cA, owner, null);
    chk("C2.3-S7.4", "fallback settings: setFallbackUser(uFb) ⇒ settings.crm.assignment.fallbackUserId = uFb with uiVersion/bridgesEnabled untouched (single jsonb_set) · getAssignmentSettings reads it · a user of another tenant ⇒ VALIDATION Thai, value unchanged",
      s0.ok && got.v?.fallbackUserId === uFb && raw?.crm?.assignment?.fallbackUserId === uFb && raw?.crm?.uiVersion === 2 && raw?.crm?.bridgesEnabled === true && refusedAs(foreign, ["VALIDATION", "NOT_FOUND"]) && raw2?.crm?.assignment?.fallbackUserId === uFb,
      "stored · kept", `set=${s0.ok ? "ok" : s0.err} get=${got.v?.fallbackUserId === uFb} raw=${cut(j(raw?.crm), 160)} foreign=${foreign.ok ? "ACCEPTED" : foreign.err}`, "MAJOR");
  }
  {
    await resetRules(crmA);
    await mkRule(cA, { name: `ตรงแต่ไม่มีคน ${TAG}`, mode: "FIXED", userIds: [uLeave], conditions: { items: [{ field: "sourceKind", op: "eq", value: "WEB_FORM" }] } });
    await mkRule(cA, { name: `ตรงเหมือนกัน ${TAG}`, mode: "FIXED", userIds: [U[1]], conditions: { items: [{ field: "sourceKind", op: "eq", value: "WEB_FORM" }] } });
    await call(setFallbackF, cA, owner, uFb);
    const r = await pick(cA, { sourceKind: "WEB_FORM" });
    await call(setFallbackF, cA, owner, null);
    chk("C2.3-S7.5", "first MATCHING rule decides (blueprint §11.5 — PROPOSED ruling R3): its only candidate is on leave ⇒ settings fallback uFb, NOT the later matching rule (U1)",
      ownerOf(r) === uFb && r.v?.reason === "FALLBACK", "uFb", `owner=${ownerOf(r) === U[1] ? "U1 (fell through)" : ownerOf(r) === uFb ? "uFb" : ownerOf(r)} reason=${r.v?.reason}`, "MAJOR");
  }
  {
    await resetRules(crmA);
    await mkRule(cA, { name: `หรือ ${TAG}`, mode: "FIXED", userIds: [U[2]], conditions: { mode: "OR", items: [{ field: "sourceKind", op: "eq", value: "CHAT" }, { field: "language", op: "eq", value: "en" }] } });
    await mkRule(cA, { name: `และ ${TAG}`, mode: "FIXED", userIds: [U[3]], conditions: { mode: "AND", items: [{ field: "sourceKind", op: "in", value: ["WEB_FORM", "LINE_OA"] }, { field: "sourceChannel", op: "neq", value: "spam" }] } });
    const orHit = await pick(cA, { sourceKind: "WEB_FORM", locale: "en" });
    const andHit = await pick(cA, { sourceKind: "LINE_OA", sourceChannel: "line" });
    const andMiss = await pick(cA, { sourceKind: "LINE_OA", sourceChannel: "spam" });
    chk("C2.3-S7.6", "condition modes: OR (one of CHAT / en suffices ⇒ U2) · AND with in + neq (LINE_OA + line ⇒ U3) · AND failing on neq (channel spam) ⇒ no rule ⇒ NOBODY",
      ownerOf(orHit) === U[2] && ownerOf(andHit) === U[3] && andMiss.ok && andMiss.v?.ownerUserId === null, "U2 · U3 · null", `or=${U.indexOf(ownerOf(orHit))} and=${U.indexOf(ownerOf(andHit))} miss=${ownerOf(andMiss)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — tenant / system isolation · permission keys (404 invisible · 403 no key)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · isolation + keys ──");
  {
    const n0 = (await P.crmAssignmentRule.count({ where: { tenantId: tidA } })) as number;
    const fu = await call(createRuleF, cA, owner, { name: `คนร้านอื่น ${TAG}`, mode: "FIXED", userIds: [uB], conditions: { items: [] } });
    const ft = await call(createRuleF, cA, owner, { name: `ทีมร้านอื่น ${TAG}`, mode: "ROUND_ROBIN", teamId: teamB, conditions: { items: [] } });
    const ok = await call(createRuleF, cA, owner, { name: `ควบคุม ${TAG}`, mode: "ROUND_ROBIN", teamId: teamT, conditions: { items: [] } });
    const n1 = (await P.crmAssignmentRule.count({ where: { tenantId: tidA } })) as number;
    chk("C2.3-X1.1", "a rule cannot reference a user of another tenant (uB) nor a team of another tenant (team-B) ⇒ refused Thai (VALIDATION/NOT_FOUND), nothing written · [positive control] the same shape with this tenant's team T is accepted (exactly 1 row more)",
      refusedAs(fu, ["VALIDATION", "NOT_FOUND"]) && refusedAs(ft, ["VALIDATION", "NOT_FOUND"]) && ok.ok && n1 === n0 + 1, "refused · refused · ok", `user=${fu.ok ? "ACCEPTED" : fu.err} team=${ft.ok ? "ACCEPTED" : ft.err} control=${ok.ok ? "ok" : ok.err} rows ${n0}→${n1}`);
    const upd = await call(updateRuleF, cA, owner, ok.v?.id ?? NONE, { userIds: [uB] });
    const row = await P.crmAssignmentRule.findFirst({ where: { id: ok.v?.id ?? NONE } });
    chk("C2.3-X1.2", "updateRule cannot smuggle a foreign-tenant user in either ⇒ refused Thai · stored userIds unchanged",
      refusedAs(upd, ["VALIDATION", "NOT_FOUND"]) && !(row?.userIds ?? []).includes(uB), "refused", `${upd.ok ? "ACCEPTED" : upd.err} stored=${cut(j(row?.userIds), 80)}`);
  }
  {
    await resetRules(crmA);
    const ruleB = await mkRule(cB, { name: `ของร้าน B ${TAG}`, mode: "FIXED", userIds: [uB], conditions: { items: [] } });
    const ruleA2 = await mkRule(cA2, { name: `ระบบสอง ${TAG}`, mode: "FIXED", userIds: [U[0]], conditions: { items: [] } });
    const missing = await call(updateRuleF, cA, owner, `${TAG}-nope`, { name: "x" });
    const outs: string[] = [];
    for (const [label, id] of [["tenant B", ruleB], ["system A2", ruleA2]] as const) {
      const u = await call(updateRuleF, cA, owner, id, { name: `ยึด ${TAG}` });
      const t = await call(toggleRuleF, cA, owner, id, false);
      const d = await call(deleteRuleF, cA, owner, id, { confirm: true, reason: "ลบกฎระหว่างทดสอบ" });
      for (const [op, r] of [["update", u], ["toggle", t], ["delete", d]] as const)
        if (!(refusedAs(r, ["NOT_FOUND"]) && r.msg === missing.msg)) outs.push(`${label}.${op}:${r.ok ? "ACCEPTED" : r.err}`);
    }
    const bRow = await P.crmAssignmentRule.findFirst({ where: { id: ruleB } });
    const a2Row = await P.crmAssignmentRule.findFirst({ where: { id: ruleA2 } });
    const listA = await call(listRulesF, cA, owner);
    const leak = ((listA.v ?? []) as Any[]).filter((r) => [ruleB, ruleA2].includes(r?.id));
    chk("C2.3-X1.3", "a rule of another TENANT or of another CRM SYSTEM of the same tenant: update/toggle/delete through crmA ⇒ NOT_FOUND with the same message as a missing id (404, no existence leak) · rows untouched · listRules(crmA) never lists them",
      refusedAs(missing, ["NOT_FOUND"]) && outs.length === 0 && bRow?.active === true && !String(bRow?.name).includes("ยึด") && a2Row?.active === true && listA.ok && leak.length === 0,
      "404 ×6 · intact", `${outs.join(" | ") || "-"} missing=${missing.err} bIntact=${bRow?.active === true} a2Intact=${a2Row?.active === true} leak=${leak.length}`);
    await call(setFallbackF, cA, owner, null);
    const viaA = await pick(cA, { sourceKind: "WEB_FORM" });
    const forcedB = await pick(cA, { sourceKind: "WEB_FORM" }, { ruleId: ruleB });
    const forcedA2 = await pick(cA, { sourceKind: "WEB_FORM" }, { ruleId: ruleA2 });
    const own = await pick(cA2, { sourceKind: "WEB_FORM" });
    chk("C2.3-X1.4", "pick in crmA (no rule of its own, no fallback) never uses crmA2's or tenant B's rule — neither implicitly nor via an explicit foreign ruleId ⇒ NOBODY · [positive control] pick in crmA2 uses its own rule (U0)",
      viaA.ok && viaA.v?.ownerUserId === null && forcedB.ok && forcedB.v?.ownerUserId === null && forcedA2.ok && forcedA2.v?.ownerUserId === null && ownerOf(own) === U[0],
      "null ×3 · U0", `viaA=${ownerOf(viaA)} forcedB=${ownerOf(forcedB) === uB ? "uB(!)" : ownerOf(forcedB)} forcedA2=${ownerOf(forcedA2)} own=${U.indexOf(ownerOf(own))}`);
  }
  {
    await resetRules(crmA);
    const n0 = (await P.crmAssignmentRule.count({ where: { systemId: crmA } })) as number;
    const noKey = await call(createRuleF, cA, staff, { name: `STAFF ${TAG}`, mode: "FIXED", userIds: [U[0]], conditions: { items: [] } });
    const noKeySim = await call(simulateF, cA, staff, [{ sourceKind: "WEB_FORM" }]);
    const noKeyFb = await call(setFallbackF, cA, staff, U[0]);
    const n1 = (await P.crmAssignmentRule.count({ where: { systemId: crmA } })) as number;
    const keyed = await call(createRuleF, { ...cA, actorUserId: userK }, staffKeyed, { name: `STAFF มีคีย์ ${TAG}`, mode: "FIXED", userIds: [U[0]], conditions: { items: [] } });
    const mgr = await call(listRulesF, { ...cA, actorUserId: userM }, manager);
    const foreignSys = await call(listRulesF, { tenantId: tidA, systemId: crmB, actorUserId: userA }, owner);
    chk("C2.3-X1.6", "keys: STAFF without crm.assignment.manage ⇒ createRule / simulate / setFallbackUser FORBIDDEN (403, Thai, no blame), nothing written · [positive controls] STAFF holding the key may create · MANAGER (default keys) may list · a system id of another tenant ⇒ NOT_FOUND (404), never FORBIDDEN",
      refusedAs(noKey, ["FORBIDDEN"]) && refusedAs(noKeySim, ["FORBIDDEN"]) && refusedAs(noKeyFb, ["FORBIDDEN"]) && n1 === n0 && keyed.ok && mgr.ok && refusedAs(foreignSys, ["NOT_FOUND"]),
      "403 ×3 · ok · ok · 404", `staff=${noKey.err || "ACCEPTED"} sim=${noKeySim.err || "ACCEPTED"} fb=${noKeyFb.err || "ACCEPTED"} rows ${n0}→${n1} keyed=${keyed.ok ? "ok" : keyed.err} mgr=${mgr.ok ? "ok" : mgr.err} foreign=${foreignSys.ok ? "ACCEPTED" : foreignSys.err}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — dangerous delete · audit on every mutation
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X9 · delete + audit ──");
  {
    await resetRules(crmA);
    const t0 = new Date(Date.now() - 1000);
    const c = await call(createRuleF, cA, owner, { name: `ตรวจ audit ${TAG}`, mode: "FIXED", userIds: [U[0]], conditions: { items: [] } });
    const id = c.v?.id ?? NONE;
    const c2 = await call(createRuleF, cA, owner, { name: `ตรวจ audit 2 ${TAG}`, mode: "FIXED", userIds: [U[1]], conditions: { items: [] } });
    await call(updateRuleF, cA, owner, id, { name: `ตรวจ audit แก้ ${TAG}` });
    await call(toggleRuleF, cA, owner, id, false);
    await call(reorderRulesF, cA, owner, [c2.v?.id ?? NONE, id]);
    await call(setFallbackF, cA, owner, uFb);
    const noConfirm = await call(deleteRuleF, cA, owner, id, { reason: "ลบกฎที่ไม่ใช้แล้ว" });
    const shortReason = await call(deleteRuleF, cA, owner, id, { confirm: true, reason: "ลบ" });
    const still = await P.crmAssignmentRule.findFirst({ where: { id } });
    const del = await call(deleteRuleF, cA, owner, id, { confirm: true, reason: "ลบกฎที่ไม่ใช้แล้ว" });
    const gone = await P.crmAssignmentRule.findFirst({ where: { id } });
    await call(setFallbackF, cA, owner, null);
    chk("C2.3-X9.1", "deleteRule is a danger op: without confirm ⇒ refused · reason shorter than 5 characters ⇒ refused (Thai) · the rule is still there · confirm + reason ⇒ deleted",
      refusedAs(noConfirm, ["VALIDATION"]) && refusedAs(shortReason, ["VALIDATION"]) && !!still && del.ok && !gone, "refused ×2 · deleted",
      `noConfirm=${noConfirm.ok ? "ACCEPTED" : noConfirm.err} short=${shortReason.ok ? "ACCEPTED" : shortReason.err} still=${!!still} del=${del.ok ? "ok" : del.err} gone=${!gone}`);
    const audits = (await P.auditLog.findMany({ where: { tenantId: tidA, createdAt: { gte: t0 }, action: { startsWith: "crm.assignment." } } })) as Any[];
    const onRule = audits.filter((a) => a.targetId === id).map((a) => String(a.action));
    const kinds = ["create", "update", "toggle", "delete"].filter((k) => !onRule.some((a) => a.includes(k)));
    const hasReorder = audits.some((a) => /reorder/.test(String(a.action)));
    const hasSettings = audits.some((a) => /settings|fallback/.test(String(a.action)) && a.targetId === crmA);
    chk("C2.3-X9.2", "audit on EVERY mutation: rows with action crm.assignment.* for create · update · toggle · delete (targetId = the rule) + reorder + the fallback setting (targetId = the system)",
      kinds.length === 0 && hasReorder && hasSettings, "6 kinds", `missing=${kinds.join(",") || "-"} reorder=${hasReorder} settings=${hasSettings} actions=${cut([...new Set(audits.map((a) => a.action))].join(","), 200)}`, "MAJOR");
    const auditText = j(audits.map((a) => [a.before, a.after]));
    chk("C2.3-X9.3", "no contact PII (names/phones of this run) in the crm.assignment.* audit rows", !PII.some((p) => auditText.includes(p)), "clean", PII.filter((p) => auditText.includes(p)).slice(0, 3).join(",") || "-", "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — real concurrency: RR (in-process ×2 rounds + 4 worker PROCESSES) · LEAST_OPEN cap (in-process + 2 PROCESSES)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · concurrency ──");
  const runWorkers = async (tid: string, sys: string, jobs: [string, Any][]): Promise<{ outs: string[][]; spawned: boolean }> => {
    const startAt = Date.now() + 45_000;
    const outs = await Promise.all(jobs.map(([mode, arg]) => new Promise<string>((resolve) => {
      const enc = Buffer.from(JSON.stringify(arg), "utf8").toString("base64url");
      const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", mode, tid, sys, userA, String(startAt), enc], { env: process.env });
      let out = "";
      const to = setTimeout(() => { try { ch.kill("SIGKILL"); } catch { /* already gone */ } }, 300_000);
      ch.stdout.on("data", (d: Any) => { out += String(d); });
      ch.stderr.on("data", (d: Any) => { out += String(d); });
      ch.on("error", (e: Any) => { clearTimeout(to); resolve(`SPAWN-ERROR ${String(e)}`); });
      ch.on("close", () => { clearTimeout(to); resolve(out); });
    })));
    const parsed = outs.map((o) => { const m = /X3WORKER (\[.*\])/.exec(o); return m ? (JSON.parse(m[1]) as string[]) : ["NO-OUTPUT"]; });
    return { outs: parsed, spawned: parsed.every((p) => !p.includes("NO-OUTPUT")) };
  };
  {
    const rounds: string[] = [];
    let ok = true;
    for (let r = 0; r < 2; r += 1) {
      const c0 = await cursorOf(rrRule);
      const owners = (await Promise.all(Array.from({ length: 20 }, () => pick(cR, { sourceKind: "WEB_FORM" })))).map(ownerOf);
      const by = countBy(owners);
      const c1 = await cursorOf(rrRule);
      rounds.push(`${U.map((u) => by[u] ?? 0).join("/")}·c${c0}→${c1}`);
      ok = ok && U.every((u) => by[u] === 5) && c1 === c0;
    }
    chk("C2.3-X3.1", "RR, 2 more rounds of 20 parallel picks on separate connections ⇒ 5/5/5/5 every round and the cursor returns to its start", ok, "5/5/5/5 ×2", rounds.join(" | "));
  }
  {
    const c0 = await cursorOf(rrRule);
    const w = await runWorkers(tidA, crmR, [0, 1, 2, 3].map(() => ["pick", { n: 5, draft: { sourceKind: "WEB_FORM" } }] as [string, Any]));
    const flat = w.outs.flat();
    const by = countBy(flat);
    const c1 = await cursorOf(rrRule);
    chk("C2.3-X3.2a", "[positive control] 4 worker PROCESSES started together and returned 20 pick results — if red, X3.2 proves nothing", w.spawned && flat.length === 20, "20", `${flat.length} ${cut(flat.filter((o) => !U.includes(o)).slice(0, 2).join(" | "), 200)}`, "MAJOR");
    chk("C2.3-X3.2", "RR across 4 SEPARATE PROCESSES × 5 parallel picks ⇒ exactly 5 per rep and the cursor back at its start (an in-process JS mutex passes X3.1 and fails here)",
      w.spawned && U.every((u) => by[u] === 5) && c1 === c0 && c1 >= 0 && c1 < 4, "5/5/5/5", `${U.map((u) => by[u] ?? 0).join("/")} cursor ${c0}→${c1}`);
  }
  {
    await resetRules(crmL);
    await mkRule(cL, { name: `ว่างสุด เพดาน 2 ${TAG}`, mode: "LEAST_OPEN", userIds: [...U], maxOpenPerUser: 2, conditions: { items: [] } });
    const made = await Promise.all(Array.from({ length: 10 }, () => createAuto(cL)));
    const owners = made.map((m) => (m.row?.ownerUserId as string | null) ?? "NULL");
    const by = countBy(owners);
    const load = await call(openLoadF, { tenantId: tidA, systemId: crmL }, [...U]);
    chk("C2.3-X3.3", "LEAST_OPEN maxOpenPerUser 2 over 4 reps, 10 PARALLEL createContact(auto) ⇒ all 10 created · exactly 2 per rep (8 assigned) · 2 left unassigned · nobody above the cap · openLoadOf agrees",
      made.every((m) => m.r.ok) && U.every((u) => by[u] === 2) && (by.NULL ?? 0) === 2 && U.every((u) => Number(load.v?.[u]) === 2),
      "2/2/2/2 + 2 null", `${U.map((u) => by[u] ?? 0).join("/")} null=${by.NULL ?? 0} errs=${made.filter((m) => !m.r.ok).map((m) => m.r.err).slice(0, 2).join(" | ") || "-"}`);
  }
  {
    await resetRules(crmL2);
    await mkRule(cL2, { name: `ว่างสุด เพดาน 2 (โปรเซส) ${TAG}`, mode: "LEAST_OPEN", userIds: [...U], maxOpenPerUser: 2, conditions: { items: [] } });
    const phones = Array.from({ length: 10 }, () => phoneOf());
    const w = await runWorkers(tidA, crmL2, [["create", { phones: phones.slice(0, 5), tag: `${TAG}-p1` }], ["create", { phones: phones.slice(5), tag: `${TAG}-p2` }]]);
    const rows = (await P.crmContact.findMany({ where: { systemId: crmL2 } })) as Any[];
    const by = countBy(rows.map((r) => (r.ownerUserId as string | null) ?? "NULL"));
    chk("C2.3-X3.4a", "[positive control] 2 worker PROCESSES created 10 contacts in crmL2 — if red, X3.4 proves nothing", w.spawned && rows.length === 10, "10", `${rows.length} ${cut(w.outs.flat().filter((o) => o.startsWith("ERR")).slice(0, 2).join(" | "), 200)}`, "MAJOR");
    chk("C2.3-X3.4", "LEAST_OPEN cap across 2 SEPARATE PROCESSES (5 parallel creations each) ⇒ exactly 2 per rep, 2 unassigned, nobody above 2",
      rows.length === 10 && U.every((u) => by[u] === 2) && (by.NULL ?? 0) === 2, "2/2/2/2 + 2", `${U.map((u) => by[u] ?? 0).join("/")} null=${by.NULL ?? 0}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 + X8 — the form bridge on v2 (consumer redelivery) · payload / notification PII
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X4 · form lead redelivery ──");
  const FORM_FIELDS = [{ key: "name", label: "ชื่อ", type: "text", required: true }, { key: "phone", label: "เบอร์", type: "phone", required: false }];
  const mkForm = async (tid: string, crmSystemId: string) =>
    (await P.formDef.create({ data: { tenantId: tid, name: `ฟอร์ม ${TAG}-${nx()}`, publicToken: `${TAG}-tok-${nx()}-${Math.random().toString(36).slice(2, 12)}`, crmEnabled: true, fieldsJson: FORM_FIELDS, crmSystemId } })) as Any;
  const mkSub = async (tid: string, formId: string) =>
    (await P.formSubmission.create({ data: { tenantId: tid, formId, answersJson: { name: pii(`ผู้กรอก ${TAG}-${nx()}`), phone: phoneOf() } } })).id as string;
  const formEvt = (tid: string, formId: string, submissionId: string) => ({ id: `${TAG}-ev-${nx()}`, tenantId: tid, type: "forms.submission.received", payload: { formId, submissionId }, systemId: null, unitId: null });
  const consume = async (evt: Any) => call(CONS?.[evt?.type], evt);
  const assignedEvents = async (tid: string, contactId: string) =>
    ((await P.outboxEvent.findMany({ where: { tenantId: tid, type: "crm.contact.assigned" } })) as Any[]).filter((e) => e.payload?.contactId === contactId);
  await resetRules(crmF);
  const ruleF = await mkRule(cF, { name: `ฟอร์ม RR ${TAG}`, mode: "ROUND_ROBIN", userIds: [U[0], U[1]], conditions: { items: [{ field: "sourceKind", op: "eq", value: "WEB_FORM" }] } });
  const formF = await mkForm(tidA, crmF);
  {
    const sub = await mkSub(tidA, formF.id);
    const c0 = await cursorOf(ruleF);
    const e = formEvt(tidA, formF.id, sub);
    const r1 = await consume(e);
    const r2 = await consume(e);
    const link = (await P.formSubmission.findFirst({ where: { id: sub } }))?.crmContactId as string | null;
    const rows = (await P.crmContact.findMany({ where: { systemId: crmF } })) as Any[];
    const row = rows.find((r) => r.id === link);
    const evs = link ? await assignedEvents(tidA, link) : [];
    const c1 = await cursorOf(ruleF);
    chk("C2.3-S7.7", "v2 form lead (forms.submission.received consumer, no creator) ⇒ assigned by the RR rule: owner ∈ {U0, U1}, assignedBy RULE:<rule>, sourceKind WEB_FORM", r1.ok && !!row && [U[0], U[1]].includes(row.ownerUserId) && row.assignedBy === `RULE:${ruleF}`,
      "rule owner", `consume=${r1.ok ? "ok" : r1.err} owner=${row ? U.indexOf(row.ownerUserId) : "-"} by=${row?.assignedBy}`);
    chk("C2.3-X4.1", "the same event delivered TWICE in sequence ⇒ one contact · one crm.contact.assigned · rrCursor advanced exactly once",
      r1.ok && r2.ok && rows.length === 1 && evs.length === 1 && c1 === (c0 + 1) % 2, "1 · 1 · +1", `contacts=${rows.length} assignedEvents=${evs.length} cursor ${c0}→${c1}`);
    const payloadText = j(evs.map((x) => x.payload));
    chk("C2.3-X8.1", "crm.contact.assigned payload carries ids only (contactId, owner/rule/team ids) — no name / phone / e-mail of the lead", evs.length === 1 && !PII.some((p) => payloadText.includes(p)) && typeof evs[0]?.payload?.contactId === "string",
      "ids only", cut(payloadText, 200), "MAJOR");
  }
  {
    const sub = await mkSub(tidA, formF.id);
    const c0 = await cursorOf(ruleF);
    const e = formEvt(tidA, formF.id, sub);
    const res = await Promise.all([0, 1, 2, 3].map(() => consume(e)));
    const link = (await P.formSubmission.findFirst({ where: { id: sub } }))?.crmContactId as string | null;
    const linked = (await P.crmContact.findMany({ where: { systemId: crmF } })) as Any[];
    const evs = link ? await assignedEvents(tidA, link) : [];
    const c1 = await cursorOf(ruleF);
    chk("C2.3-X4.2", "the same event delivered 4× IN PARALLEL ⇒ still exactly one new contact (2 in total), one crm.contact.assigned for it, cursor +1",
      res.every((r) => r.ok) && !!link && linked.length === 2 && evs.length === 1 && c1 === (c0 + 1) % 2, "1 · 1 · +1", `ok=${res.filter((r) => r.ok).length}/4 contacts=${linked.length} events=${evs.length} cursor ${c0}→${c1}`);
  }
  {
    await resetRules(crmN);
    await mkRule(cN, { name: `ไม่มีใครว่าง ฟอร์ม ${TAG}`, mode: "FIXED", userIds: [uLeave], conditions: { items: [] } });
    const formN = await mkForm(tidA, crmN);
    const sub = await mkSub(tidA, formN.id);
    const e = formEvt(tidA, formN.id, sub);
    await consume(e);
    await Promise.all([0, 1, 2].map(() => consume(e)));
    const link = (await P.formSubmission.findFirst({ where: { id: sub } }))?.crmContactId as string | null;
    const notes = link ? ((await P.appNotification.findMany({ where: { tenantId: tidA, body: { contains: link }, recipientUserId: { not: null } } })) as Any[]) : [];
    chk("C2.3-X4.3", "NOBODY on the bridge: the lead is created unassigned and the OWNER/MANAGER notification exists ONCE per recipient even after 1 + 3 parallel redeliveries",
      !!link && notes.length === 2 && new Set(notes.map((n) => n.recipientUserId)).size === 2, "2 rows", `link=${!!link} notes=${notes.length}`);
    const text = notes.map((n) => `${n.title} ${n.body}`).join(" ");
    chk("C2.3-X8.2", "the NOBODY notifications (S5.2 + X4.3) carry no name/phone of the lead — ids and a link only", notes.length > 0 && !PII.some((p) => text.includes(p)) && nobodyContact !== NONE, "clean", cut(text, 160), "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // U — uiVersion 1 (PERMANENT RULE C1.7): no behaviour change for a v1 CRM; rules kept; resume at 2
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── U · uiVersion 1 ──");
  {
    await resetRules(crmV);
    const ruleV = await mkRule(cV, { name: `กฎร้าน v1 ${TAG}`, mode: "ROUND_ROBIN", userIds: [U[0]], conditions: { items: [] } });
    await setCrm(crmV, { uiVersion: 1 });
    const cur0 = await cursorOf(ruleV);
    const formV = await mkForm(tidV, crmV);
    const sub = await mkSub(tidV, formV.id);
    const n0 = (await P.appNotification.count({ where: { tenantId: tidV, recipientUserId: { not: null } } })) as number;
    const r = await consume(formEvt(tidV, formV.id, sub));
    const link = (await P.formSubmission.findFirst({ where: { id: sub } }))?.crmContactId as string | null;
    const row = link ? await P.crmContact.findFirst({ where: { id: link } }) : null;
    const n1 = (await P.appNotification.count({ where: { tenantId: tidV, recipientUserId: { not: null } } })) as number;
    chk("C2.3-U.1", "v1 form→lead exactly as before: the lead is created (source FORM) with ownerUserId null and assignedBy null although an active rule exists · rrCursor untouched · no per-user NOBODY notification",
      r.ok && !!row && row.ownerUserId === null && row.assignedBy === null && row.source === "FORM" && (await cursorOf(ruleV)) === cur0 && n1 === n0,
      "unassigned like v1", `consume=${r.ok ? "ok" : r.err} owner=${row?.ownerUserId} by=${row?.assignedBy} source=${row?.source} cursor=${cur0}→${await cursorOf(ruleV)} notes ${n0}→${n1}`);
    const legacyOwned = await call(CT.createContactFromLegacy, { tenantId: tidV, systemId: crmV, actorUserId: null }, { name: pii(`เอไอ ${TAG}`), phone: phoneOf(), source: "AI", ownerUserId: U[0] });
    const legacyNone = await call(CT.createContactFromLegacy, { tenantId: tidV, systemId: crmV, actorUserId: null }, { name: pii(`เอไอ สอง ${TAG}`), phone: phoneOf(), source: "AI" });
    const lo = legacyOwned.ok ? await P.crmContact.findFirst({ where: { id: legacyOwned.v?.id } }) : null;
    const ln = legacyNone.ok ? await P.crmContact.findFirst({ where: { id: legacyNone.v?.id } }) : null;
    chk("C2.3-U.2", "v1 legacy lead (crm_create_lead path — createContactFromLegacy): explicit owner kept · no owner ⇒ null (never a rule) · cursor still untouched",
      !!lo && lo.ownerUserId === U[0] && !!ln && ln.ownerUserId === null && (await cursorOf(ruleV)) === cur0, "U0 · null", `owned=${lo?.ownerUserId === U[0]} none=${ln ? ln.ownerUserId : legacyNone.err}`);
    const direct = await pick(cV, { sourceKind: "WEB_FORM" });
    chk("C2.3-U.3", "pick(auto) on a uiVersion-1 system ⇒ ownerUserId null (reason DISABLED) and the rule's cursor does not move",
      direct.ok && direct.v?.ownerUserId === null && (await cursorOf(ruleV)) === cur0, "null", `${direct.ok ? `${direct.v?.ownerUserId}/${direct.v?.reason}` : direct.err}`);
    const nR0 = (await P.crmAssignmentRule.count({ where: { systemId: crmV } })) as number;
    const refused: string[] = [];
    for (const [k, r2] of [
      ["create", await call(createRuleF, cV, owner, { name: `v1 ${TAG}`, mode: "FIXED", userIds: [U[0]], conditions: { items: [] } })],
      ["list", await call(listRulesF, cV, owner)],
      ["simulate", await call(simulateF, cV, owner, [{ sourceKind: "WEB_FORM" }])],
      ["toggle", await call(toggleRuleF, cV, owner, ruleV, false)],
      ["fallback", await call(setFallbackF, cV, owner, U[0])],
    ] as const) if (!refusedAs(r2 as Res, ["CRM_V2_DISABLED", "FORBIDDEN"])) refused.push(`${k}:${(r2 as Res).ok ? "ACCEPTED" : (r2 as Res).err}`);
    const nR1 = (await P.crmAssignmentRule.count({ where: { systemId: crmV } })) as number;
    const keptRow = await P.crmAssignmentRule.findFirst({ where: { id: ruleV } });
    chk("C2.3-U.4", "management at uiVersion 1 refused (create · list · simulate · toggle · setFallbackUser ⇒ CRM_V2_DISABLED/FORBIDDEN, Thai) · nothing written · the existing rule row is KEPT (still active)",
      refused.length === 0 && nR1 === nR0 && keptRow?.active === true, "refused ×5 · kept", `${refused.join(" | ") || "-"} rows ${nR0}→${nR1} active=${keptRow?.active}`);
    await setCrm(crmV, { uiVersion: 2 });
    const sub2 = await mkSub(tidV, formV.id);
    const r2 = await consume(formEvt(tidV, formV.id, sub2));
    const link2 = (await P.formSubmission.findFirst({ where: { id: sub2 } }))?.crmContactId as string | null;
    const row2 = link2 ? await P.crmContact.findFirst({ where: { id: link2 } }) : null;
    chk("C2.3-U.5", "flip back to uiVersion 2 ⇒ the kept rule resumes: the next form lead is assigned to U0 (assignedBy RULE:<rule>)",
      r2.ok && row2?.ownerUserId === U[0] && row2?.assignedBy === `RULE:${ruleV}`, "U0", `consume=${r2.ok ? "ok" : r2.err} owner=${row2?.ownerUserId === U[0]} by=${row2?.assignedBy}`);
  }
  if (RAW_RULES.length > 0) console.log(`  ℹ️  ${RAW_RULES.length} rule(s) had to be inserted raw (createRule absent/refused) — pick checks still meaningful`);
} catch (e) {
  chk("C2.3-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — every row of the throwaway tenants (4 passes over every table with tenantId), systems/tenants, users.
  // No drainOutbox (not tenant-scoped) — our PENDING events go with the tenant sweep.
  // ═════════════════════════════════════════════════════════════════════════════
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1)
      for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
    try {
      const left: string[] = [];
      for (const t of tables) {
        const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const n = Number(r?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      chk("C2.3-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant, every row it owned and the throwaway users are gone",
        left.length === 0 && tenants === 0 && users === 0, "0 rows · 0 tenants · 0 users", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users}`, "MAJOR");
    } catch (e) {
      chk("C2.3-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C2.3: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);

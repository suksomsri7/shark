// QC — HR V2 · H4.8 REST /api/v1/hr (first cut, PDPA-first: 13 reads + POST /leaves) + key issuer + OpenAPI/docs + skill shark-hr-api
//      brief ledger/hr-briefs/hr-brief-H4.8.md (+ CONTROLLER RULINGS 14 Nov) · notes ledger/wo-notes/hr-H4.8-oracle.md (pinned names/shapes §2)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Calls the route handlers in-process with real keys (house pattern qc-pos-p2.13 / qc-kanban-k1.15) — no server, no network.
// Tenants qc-hr-h48-<stamp> (+ -b) · data dated 2026-06 (past) / 2031 (future leaves) · SKIP while hr/api/registry.ts is absent (QC_FORCE=1 runs) · --list
// Base for statics = baseRef("QC_H48_BASE") + local merge-base + pathInBase guard (as qc-hr-h3.8)
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-h4.8.mts
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  type Any, type Base, type Sev, ROOT, rd, short, errText, srt, failedKeys, stripComments, canon, sha, baseRef, pathInBase, changedVsBase, makeRegistry, qc4Env,
  makeFixtures, cleanupFx, residueOf, commitInBase, vOf, authOf, importsOf, tagOf, HR_FORBIDDEN_DTO_KEYS, loadOpt, holdAdvisory, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, spawnTsx, isThai, srcFiles, addDay, jsonOf,
} from "./qc-hr-lib.mjs";
import {
  OPS, HR_READ, HR_LEAVE, HR_PAY, READ3, QUERY_OK, POST_FIELDS, LEFT_OUT, REPORT_SCOPE, REPORTS8, periodOf, EMP, UNIT, SHIFT, ROSTER, DAY, MONTH, POLICY, LEAVE, BAL, SLIP, HIST, POSTED,
  reportShape, dataBad, BAD_KEY, type Sh, substitute, parseCurl, recipesOf, zodKeys, seedH48, markedProblems, orTermProblems, skillProblems, serializerProblems,
  runFixRound, // ORACLE-EDIT (H4.8 fix round · controller ruling 1–6) ◂
} from "./qc-hr-h4.8-lib.mjs";

const SUITE = "qc-hr-h4.8";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h48-";
const H = "src/lib/modules/hr/";
const A = `${H}api/`;
const F = {
  route: "src/app/api/v1/hr/[...path]/route.ts", oaRoute: "src/app/api/v1/hr/openapi.json/route.ts", mdRoute: "src/app/developers/hr.md/route.ts", devPage: "src/app/developers/page.tsx",
  registry: `${A}registry.ts`, config: `${A}config.ts`, dispatch: `${A}dispatch.ts`, actor: `${A}actor.ts`, serialize: `${A}serialize.ts`, keys: `${A}keys.ts`, acts: `${H}api-key-actions.ts`,
  card: "src/app/app/sys/[id]/hr/settings/ApiKeysCard.tsx", settings: "src/app/app/sys/[id]/hr/settings/page.tsx", perms: "src/lib/core/permissions.ts", scopes: "src/lib/api-keys/scopes.ts",
  roster: `${H}roster.ts`, board: `${H}roster-board.ts`, priv: `${H}privacy.ts`, visual: "scripts/visual-hr.mts", inv: "scripts/hr-ui-inventory.json",
  th: "src/messages/th/common.json", en: "src/messages/en/common.json", gen: "scripts/gen-hr-api-docs.mts", doc: "docs/api/HR-API.md",
  skill: "skills/shark-hr-api/SKILL.md", recipes: "skills/shark-hr-api/references/recipes.md", endpoints: "skills/shark-hr-api/references/endpoints.md",
};
const HR_FILES = srcFiles("src/lib/modules/hr").filter((f) => !f.startsWith(A));
const FROZEN = [
  "src/lib/api", "prisma", "package.json", "scripts/sync-skills.sh", "src/lib/api-keys/service.ts", "src/lib/api-keys/route-auth.ts", "src/lib/ai", "scripts/qc-hr-lib.mts", "scripts/qc-hr-h3.8-lib.mts",
  ...["pos", "crm", "member", "kanban", "account"].map((m) => `src/lib/modules/${m}/api`), `${H}filings`, `${H}bank-files`,
  ...HR_FILES.filter((f) => /\/(payroll[^/]*|payslip[^/]*|reports[^/]*|service|leave|judge|settings|scope)\.tsx?$/.test(f)),
];
const MARKED = [F.perms, F.scopes, F.roster, F.board, F.priv, F.settings, F.devPage, F.visual];
const FORBID_TH = "คีย์นี้ออกโดยผู้ที่ไม่ได้เป็นเจ้าของร้านแล้ว — ออกคีย์ใหม่";
const O1_LABEL = "ข้อมูลเงินเดือนจะออกจากระบบ";
/** golden of base 38e3be6fa (filled from the RED run on the base — see notes §4) */
const GOLD_BUNDLES = "2a9ab59cf12535230c18f65f7bcb712f5dee4c60762a1d4a7bc596468da39b78";
const GOLD_Q1 = "owner:11111 mgrAll:11011 mgrU1:11011 staff:00000 employee.create:11001 leave.read:01010 leave.decide:00000 leave.request:00000 payroll.read:01100 attendance.clock:00000 payadjust.request:00000"; // canReadRoster·openProfile·seeSensitive·readLeave·listRoster

const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1|A1|C|R|[static] route [...path] = 5 thin exports → hr/api/dispatch (no prisma/if) · openapi.json route · developers/hr.md route exist
S2|A1 §4|C|R|[static] HR_OPS = the 14 pinned ops (id·method·path·action·rate·kind) · module hr · auditAction hr.api.<id> · no tool · (method,path) unique · employees.list paged · GET query keys ⊆ ids/filters (R7) · POST fields = brief, strict
S3|§4|C|R|[static] nothing left out is exposed (decide/approve/clock/swap/correction/payroll action/bank/filing/cert/PDF/CSV/register/labour/YTD) · exactly one write op
S4|R1|C|R|[static] scopes.ts HR_SCOPE_KEYS ∋ every op.action · bundles hr-read (no pay) / hr-leave / hr-payroll-read exact
S5|R1|C|G|[static] [control] every non-HR bundle byte-identical to base (golden digest)
S6|R1 Q1|C|R|[static] permissions.ts: hr.employee.read / hr.roster.read, module hr, the brief's Thai labels
S7|D2|M|R|[static] HR_API_CONFIG {module hr · systemType HR · scopePrefix hr. · rateNs hr} + Thai messages
S8|A1 R2 Q2|C|R|[static] hr/api/**: no prisma. / $transaction · ops import only §4 readers from hr/ · hrIssuerViewer only in ops/reports+ops/payslips · serialize.ts never spreads an object
S9|§5|C|G|[static] [control] frozen files unchanged vs base (core api, api-keys service/route-auth, ai, other modules' api, payroll*/payslip*/reports*/filings/bank-files/service/leave/judge/settings/scope, prisma, package.json, sync-skills) · payroll-rules sha
S10|§5|M|R|[static] marked hunks "HR H4.8 ▸ … ◂" in the 8 code files · messages th/en change only hr.apiKeys.* (th = en) · inventory adds only rows wo H4.8
S11|Q1 R1|C|R|[static] gate hunks = one OR-term each: roster.ts canRead + roster-board.ts canReadRoster add hr.roster.read · privacy.ts openProfile adds hr.employee.read · nothing else in the 3 files
S12|R3 O1|C|R|[static] ApiKeysCard.tsx + settings page slot + O1 label "${O1_LABEL}" · api-key-actions.ts "use server" → requireTenant + issueHrApiKey/revokeHrApiKey of hr/api/keys.ts
S13|D4|M|R|[static] developers page links /developers/hr.md
P1|Q2|C|R|[pure] serializer probe: serializeEmployee / serializeSlip / serializeReport keep exactly the allow-list of poisoned rows (unknown + sensitive keys dropped)
P2|A15|C|R|[route] GET /api/v1/hr/openapi.json (no key) = the 14 (method, path) of the registry
P3|A15|C|R|[run] gen-hr-api-docs --check exit 0 · HR-API.md + endpoints.md name exactly the 14 ops
P4|A16 §7|C|R|[static] SKILL.md ≤ 14 KB · name shark-hr-api · ASCII description · §7 sections + privacy rules · recipes ≥ 6 (6 tasks) · every curl = registered op with documented fields · valid Error branch
P5|D4|M|R|[route] GET /developers/hr.md = text naming every op path
D0|seed|C|G|[db] [control] seed carries every PII (OWNER profile: national id/phone/address/bank · SICK reason · GPS+photo punch) so A3/A4 are not vacuous
Q1|ruling Q1|C|G|[db] [control] human roles × 3 reader gates (canReadRoster · hrAccessOf · listRoster) = golden of the base
A14|R1|C|R|[db] holder of hr.roster.read + hr.employee.read: reads roster + profile · publish refused · no seeSensitive · no slip
A2|A2|C|R|[db] scope matrix 7 keys × 22 requests ⇒ exact status:code (401 / 403 scope_missing / 404 register / 200)
A2b|A2|C|R|[db] POS-bound key ⇒ 403 system_mismatch on every op · general key ⇒ 400 system_required / 403 scope_missing
A2c|ruling 14 Nov (4)|C|R|[db] only keys bound to THIS HR system: unbound key with hr scopes + X-Shark-System ⇒ every op refused with the bytes of a bound key without hr scopes · POS-bound key with hr scopes ⇒ 403 · no 2xx, nothing written/audited
A3|Q2 A3|C|R|[db] allow-list: every 2xx data has EXACTLY the pinned keys per op (reports: P, + $ only with hr.payroll.read, never I)
A4|A4|C|R|[db] no forbidden key and no seeded secret value in any 2xx body (≥ 25 bodies)
A5|A5|C|R|[db] other tenant/system: header ⇒ 403 system_mismatch · foreign ids (path + body) ⇒ 404 bytes = unknown id · lists filtered
A6|A6 R5|C|R|[db] roster = published entries only · DRAFT slip ⇒ 409 state_conflict · other-system employee ≡ random id
A7|A7|C|R|[db] revoked ⇒ 401 unauthorized · expired ⇒ 401 key_expired
A7b|Q2 R2|C|R|[db] issuer demoted / not accepted ⇒ all 14 ops 403 forbidden (fixed text, nothing written) · restored ⇒ 200
A8|A8|C|R|[db] POST /leaves: data exactly {id, status PENDING} · approval request row · filedBy = issuer · audit hr.api.leaves.create API_KEY + keyName, no name/reason
A8b|A8|C|R|[db] idempotency: no header 400 · replay byte-equal + Idempotent-Replayed · other body 409 · one row
A8c|A8|C|R|[db] two identical requests while the employee lock is held: one 200 + one 409 idempotency_in_progress · one row
A8d|A8 Q5|C|R|[db] OWNER-linked 403 forbidden · no hr.leave.decide 403 · overlap 409 duplicate · reason ⇒ 422 · service refusal ⇒ 422 unprocessable with the UI's Thai text · 0 rows each
A9|A9 R6|M|R|[db] 57 × pageSize 20 ⇒ 3 pages, union exact, (name,id) order, stable across an insert · pageSize 25 ⇒ 422 · leaves cap ⇒ truncated:true (absent/false below cap)
A10|A10|M|R|[db] every refusal = {error:{code,message_th,message_en[,hint,details]},requestId} (code ∈ API_ERROR_CODES, th Thai, en ASCII) · 405 + Allow · unknown path 404
A11|A11 Q7|C|R|[db] pay reads count in hr:api:report:<keyId> (reads in hr:api:read:<keyId>) · 31st report read ⇒ 429 + Retry-After
A12|A12 R3 Q3 O1|C|R|[db] issuer core: non-OWNER / non-hr bundle / hr.payroll.create / non-HR system / pay without consent / pay never ⇒ refused, nothing written · default hr-read · audit keys exact
A13|R8|C|R|[db] pay audit: one row per read · after keys exactly R8 · API_KEY · no names
A16|A16|C|R|[db] recipes replay 2xx with $SHARK_API_KEY $SHARK_SYSTEM_ID $UNIT_ID $EMPLOYEE_ID $RUN_ID $FROM $TO $(uuidgen)
F1|fix 1|C|R|[db] ORACLE-EDIT (H4.8 fix round · controller ruling 1): OT report with a pay key ⇒ money columns + exactly 1 hr.api.report.read row · hr-read key ⇒ no money column, no row
F2|fix 2|C|R|[db] ORACLE-EDIT (H4.8 fix round · controller ruling 2): hr.employee.read / hr.roster.read are API-key only — not in the staff editor · refused by validatePermissionInput · a human member holding them gains nothing on the 3 reader gates
F3|fix 3|M|R|[db] ORACLE-EDIT (H4.8 fix round · controller ruling 3): impossible dates/periods (2026-02-31 · 2026-06-31 · 0000-00-00 · 2026-13) ⇒ 422 validation on every date parameter (no fallback to today)
F4|fix 4|M|R|[db] ORACLE-EDIT (H4.8 fix round · controller ruling 4): key names with control / bidi / line-separator / NUL / zero-width (fix round 2) characters ⇒ refused VALIDATION (Thai), nothing written
F5|fix 5|C|R|[db] ORACLE-EDIT (H4.8 fix round · controller ruling 5): ended employee ≡ unknown id — GET /employees/{id} · attendance month · payslip history · POST /leaves ⇒ same 404 bytes · absent from the leaves list · fix round 2 ruling 1: present in a past roster row + a report row with only the documented fields
F6|fix 6|M|R|[db] ORACLE-EDIT (H4.8 fix round · controller ruling 6): POST /leaves non-JSON Content-Type ⇒ 415 invalid_json · __proto__ / constructor key ⇒ 422 validation · nothing written · answer status = stored status
F7|fix2 3|M|R|[db] ORACLE-EDIT (H4.8 fix round 2 · controller ruling 3): write guard order — POS-bound key / key without hr.leave.request / unbound key + header with a non-JSON or __proto__ body ⇒ the same 403 as on reads (never 415/422)
Z1|X12|C|G|no residue (tenants · keys · idempotency rows · rate buckets)
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H4.8-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H4.8-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.registry))) skipReasons.push(`${F.registry} absent (H4.8 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
const LOCAL_MB = (() => {
  try {
    return execFileSync("git", ["merge-base", "HEAD", "session/hr"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
})();
const MB0 = baseRef("QC_H48_BASE");
const BASE = !process.env.QC_H48_BASE && MB0 && LOCAL_MB && LOCAL_MB !== MB0 && commitInBase(MB0, LOCAL_MB) ? LOCAL_MB : MB0;
const IN_BASE = !!BASE && pathInBase(F.registry, BASE);
const exists = (p: string) => existsSync(join(ROOT, p));
const ok = (m: Any) => m !== null && !m?.__err;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ═════════════════════════ modules (optional = may be absent on the base) ═════════════════════════
const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const RT = await loadOpt(F.route, "@/app/api/v1/hr/[...path]/route");
const OA = await loadOpt(F.oaRoute, "@/app/api/v1/hr/openapi.json/route");
const MD = await loadOpt(F.mdRoute, "@/app/developers/hr.md/route");
const REG = await loadOpt(F.registry, "@/lib/modules/hr/api/registry");
const CFG = await loadOpt(F.config, "@/lib/modules/hr/api/config");
const SER = await loadOpt(F.serialize, "@/lib/modules/hr/api/serialize");
const KEYS = await loadOpt(F.keys, "@/lib/modules/hr/api/keys");
const SC = (await import("@/lib/api-keys/scopes")) as Any;
const PERM = (await import("@/lib/core/permissions")) as Any;
const AK = (await import("@/lib/api-keys/service")) as Any;
const RESP = (await import("@/lib/api/respond")) as Any;
const PRIV = (await import("@/lib/modules/hr/privacy")) as Any;
const ROS = (await import("@/lib/modules/hr/roster")) as Any;
const BRD = (await import("@/lib/modules/hr/roster-board")) as Any;
const JDG = (await import("@/lib/modules/hr/judge")) as Any;
const SVC = (await import("@/lib/modules/hr/service")) as Any;
const RR = (await import("@/lib/modules/hr/reports-rules")) as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const CAT: Record<string, Any> = RR.REPORT_CATALOG;
const HR_OPS: Any[] = ok(REG) ? ((REG.HR_OPS ?? []) as Any[]) : [];
const opById = (id: string) => HR_OPS.find((x) => x.id === id);
const actionOf = (id: string) => opById(id)?.action ?? (OPS.find((x) => x[0] === id)?.[3] === "*read" ? "hr.roster.read" : OPS.find((x) => x[0] === id)?.[3]);

// ═════════════════════════ statics ═════════════════════════
function runStatic(): void {
  {
    const s = stripComments(rd(F.route));
    const fns = [...s.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => m[1]);
    ck("S1", {
      route: !!s, five: srt(fns) === "DELETE,GET,PATCH,POST,PUT", dispatch: /from\s+["']@\/lib\/modules\/hr\/api\/dispatch["']/.test(s), thin: !/prisma|tenantDb|\bif\s*\(/.test(s) && importsOf(s).length === 1,
      openapi: exists(F.oaRoute), md: exists(F.mdRoute),
    }, "thin route + 2 doc routes");
  }
  {
    const p: string[] = [];
    if (!ok(REG)) p.push(`registry ${REG?.__err ?? "absent"}`);
    if (HR_OPS.length !== OPS.length) p.push(`${HR_OPS.length} ops`);
    for (const [id, m, path, act, rate] of OPS) {
      const op = opById(id);
      if (!op) {
        p.push(`${id}:missing`);
        continue;
      }
      const kind = m === "GET" ? "read" : "write";
      if (op.method !== m || op.path !== path) p.push(`${id}:${op.method} ${op.path}`);
      if (act === "*read" ? !READ3.includes(op.action) : op.action !== act) p.push(`${id}:action ${op.action}`);
      if (op.kind !== kind || (op.rate ?? (kind === "read" ? "read" : "write")) !== rate) p.push(`${id}:kind/rate ${op.kind}/${op.rate}`);
      if (op.module !== "hr" || op.auditAction !== `hr.api.${id}` || op.tool) p.push(`${id}:module/audit/tool`);
      const keys = zodKeys(op.input);
      if (m === "GET" && keys.some((k) => !QUERY_OK.includes(k))) p.push(`${id}:query ${keys.filter((k) => !QUERY_OK.includes(k))}`);
      if (m === "POST") {
        if (srt(keys) !== srt(POST_FIELDS)) p.push(`${id}:fields ${srt(keys)}`);
        const sp = op.input?.safeParse?.({ employeeId: "x", policyId: "y", fromDate: "2031-01-01", toDate: "2031-01-01", reason: "x" });
        if (sp?.success !== false) p.push(`${id}:not strict (reason accepted)`);
      }
    }
    if (opById("employees.list") && opById("employees.list").paged !== true) p.push("employees.list not paged");
    if (new Set(HR_OPS.map((x) => `${x.method} ${x.path}`)).size !== HR_OPS.length) p.push("dup method+path");
    chk("S2", p.length === 0 && HR_OPS.length > 0, "14 pinned ops", p.slice(0, 6).join(" ") || "ok");
  }
  {
    const bad = HR_OPS.filter((x) => LEFT_OUT.test(`${x.id} ${x.path}`)).map((x) => `${x.method} ${x.path}`);
    const writes = HR_OPS.filter((x) => x.method !== "GET").map((x) => `${x.method} ${x.path}`);
    ck("S3", { reg: HR_OPS.length > 0, none: bad.length === 0, oneWrite: srt(writes) === "POST /leaves" }, "no left-out op · one write", `${bad.join(",")} writes=${writes}`);
  }
  {
    const keys: string[] = SC.HR_SCOPE_KEYS ?? [];
    const b = (id: string) => srt(((SC.API_SCOPE_BUNDLES as Any[]).find((x) => x.id === id)?.scopes ?? []) as string[]);
    const want = PERM.PERMISSIONS.filter((x: Any) => x.module === "hr" && SC.isApiScope(x.key)).map((x: Any) => x.key);
    ck("S4", {
      keys: keys.length > 0 && srt(keys) === srt(want), actions: HR_OPS.length > 0 && HR_OPS.every((x) => keys.includes(x.action)),
      read: b("hr-read") === srt(HR_READ), leave: b("hr-leave") === srt(HR_LEAVE), pay: b("hr-payroll-read") === srt(HR_PAY), noPay: !b("hr-read").includes("payroll"),
    }, "HR_SCOPE_KEYS + 3 bundles", `hr-read=${b("hr-read")}`);
    const dig = sha(canon((SC.API_SCOPE_BUNDLES as Any[]).filter((x) => !String(x.id).startsWith("hr-")).map((x) => [x.id, x.label, x.summary, [...x.scopes]])));
    chk("S5", dig === GOLD_BUNDLES, GOLD_BUNDLES, dig);
  }
  {
    const all = PERM.PERMISSIONS as Any[];
    const p = (k: string) => all.find((x) => x.key === k);
    const lab = (k: string) => String(p(k)?.label ?? "");
    ck("S6", { emp: p("hr.employee.read")?.module === "hr", ros: p("hr.roster.read")?.module === "hr", labE: lab("hr.employee.read").startsWith("คีย์ API:") /* ORACLE-EDIT (H4.8 fix round · controller ruling 2): API-key-only label (was the brief text) ◂ */, labR: lab("hr.roster.read").startsWith("คีย์ API:") }, "2 RBAC keys", `${lab("hr.employee.read")} | ${lab("hr.roster.read")}`);
  }
  {
    const c = ok(CFG) ? CFG.HR_API_CONFIG : null;
    const msgs = Object.entries(c?.messages ?? {});
    ck("S7", { cfg: !!c, f: c?.module === "hr" && c?.systemType === "HR" && c?.scopePrefix === "hr." && c?.rateNs === "hr", th: msgs.length >= 10 && msgs.filter(([k]) => /Th$/.test(k)).every(([, v]) => isThai(String(v))) }, "config");
  }
  {
    const files = exists(A) ? srcFiles(A.slice(0, -1)) : [];
    const READERS = ["scope", "service", "privacy", "settings", "roster", "judge", "leave", "reports", "reports-rules", "payslip", "payslip-rules", "privacy-shared"];
    const p: string[] = [];
    for (const f of files) {
      const s = stripComments(rd(f));
      if (/\bprisma\./.test(s) || /\$transaction/.test(s)) p.push(`${f.slice(A.length)}:db`);
      for (const i of importsOf(s)) {
        const m = /^(?:@\/lib\/modules\/hr\/|\.\.\/\.\.\/|\.\.\/)([\w-]+)$/.exec(i.spec);
        if (m && !i.type && f.includes("/ops/") && !READERS.includes(m[1]!) && !["op", "actor", "serialize", "http-errors", "config"].includes(m[1]!)) p.push(`${f.slice(A.length)}→${m[1]}`);
        if (!i.type && /hr\/(payroll|bank-files|filings|clock|approval|ot|swap|correction|pin)\b/.test(i.spec)) p.push(`${f.slice(A.length)}→${i.spec}`);
      }
      if (f.includes("/ops/") && /hrIssuerViewer/.test(s) && !/ops\/(reports|payslips)\.ts$/.test(f)) p.push(`${f.slice(A.length)}:issuer`);
    }
    const ser = stripComments(rd(F.serialize));
    if (!ser) p.push("serialize.ts absent");
    else if (/(^|[^[\s])\s*\.\.\.(?!\s*\])/m.test(ser.replace(/\[\s*\.\.\./g, "["))) p.push("serialize spreads");
    chk("S8", files.length > 0 && p.length === 0, "readers only · no raw db · allow-list serializer", p.slice(0, 6).join(" ") || `${files.length} files ok`);
  }
  {
    const diff = IN_BASE ? "unchanged" : BASE ? changedVsBase(BASE, FROZEN) : "no base";
    ck("S9", { rules: sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA, frozen: diff === "unchanged" }, "frozen", IN_BASE ? "n/a · in base" : diff.slice(0, 160));
  }
  chk("S10", IN_BASE || markedProblems(BASE, MARKED, F).length === 0, "marked hunks", IN_BASE ? "n/a · in base" : markedProblems(BASE, MARKED, F).join(" ") || "ok");
  {
    const bad = IN_BASE ? [] : orTermProblems(BASE, [[F.roster, "hr.roster.read", "canRead"], [F.board, "hr.roster.read", "canReadRoster"], [F.priv, "hr.employee.read", "openProfile"]]);
    chk("S11", bad.length === 0, "3 one-term hunks", IN_BASE ? "n/a · in base" : bad.join(" ") || "ok");
  }
  {
    const card = rd(F.card);
    const page = stripComments(rd(F.settings));
    const acts = stripComments(rd(F.acts));
    const fns = [...acts.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]!);
    const msg = JSON.stringify(jsonOf(F.th) ?? {});
    ck("S12", {
      card: !!card, slot: /ApiKeysCard/.test(page), o1: card.includes(O1_LABEL) || msg.includes(O1_LABEL),
      useServer: /^\s*["']use server["']/.test(acts.trimStart()), fns: fns.some((n) => /create|issue/i.test(n)) && fns.some((n) => /revoke/i.test(n)) && fns.some((n) => /list/i.test(n)),
      core: /requireTenant\s*\(/.test(acts) && /issueHrApiKey/.test(acts) && /revokeHrApiKey/.test(acts), keys: exists(F.keys),
    }, "card + actions → keys core");
  }
  chk("S13", /\/developers\/hr\.md/.test(rd(F.devPage)), "link", exists(F.devPage) ? "no link" : "page absent");
}

// ═════════════════════════ pure / no-key routes ═════════════════════════
async function runPure(): Promise<void> {
  {
    const p = serializerProblems(SER, CAT);
    chk("P1", p.length === 0, "allow-list survives poisoned rows", p.join(" ") || "ok");
  }
  {
    let got: string[] = [];
    let st = 0;
    if (typeof OA?.GET === "function") {
      try {
        const r: Response = await OA.GET(new Request("http://x/api/v1/hr/openapi.json"));
        st = r.status;
        const j = await r.json();
        got = Object.entries(j?.paths ?? {}).flatMap(([p, v]) => Object.keys(v as Any).filter((m) => /^(get|post|put|patch|delete)$/.test(m)).map((m) => `${m.toUpperCase()} ${p.replace(/^\/api\/v1\/hr/, "")}`));
      } catch (e) {
        got = [`throw ${errText(e)}`];
      }
    }
    const want = OPS.map(([, m, p]) => `${m} ${p}`);
    ck("P2", { route: st === 200, same: srt(got) === srt(want) }, "14 operations", `${st} ${got.length} ops ${srt(got.filter((g) => !want.includes(g))).slice(0, 80)}`);
  }
  {
    const r = exists(F.gen) ? await spawnTsx([F.gen, "--check"], process.env as Record<string, string>, 240_000) : { code: -9, out: "absent" };
    const lists = (t: string) => OPS.filter(([, m, p]) => new RegExp(`${m}\\s+(/api/v1/hr)?${esc(p)}(?![\\w/{-])`).test(t)).length;
    const extra = (t: string) => [...t.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(?:\/api\/v1\/hr)?(\/[a-z][\w/{}-]*)/g)].map((m) => `${m[1]} ${m[2]}`).filter((x) => !OPS.some(([, m, p]) => `${m} ${p}` === x));
    const doc = rd(F.doc);
    const ep = rd(F.endpoints);
    ck("P3", { gen: r.code === 0, doc: lists(doc) === 14, ep: lists(ep) === 14, noExtra: extra(doc).length + extra(ep).length === 0 }, "--check 0 · 14 = 14 = 14", `exit=${r.code} ${short(r.out.trim().split("\n").slice(-1)[0], 60)} doc=${lists(doc)} ep=${lists(ep)} extra=${[...new Set([...extra(doc), ...extra(ep)])].slice(0, 3)}`);
  }
  {
    const { p, n, size } = skillProblems(rd(F.skill), rd(F.recipes), opById);
    chk("P4", p.length === 0 && size > 0, "skill contract", p.slice(0, 5).join(" · ") || `${n} recipes ok`);
  }
  {
    let t = "";
    if (typeof MD?.GET === "function")
      try {
        t = await (await MD.GET(new Request("http://x/developers/hr.md"))).text();
      } catch (e) {
        t = `throw ${errText(e)}`;
      }
    const miss = OPS.filter(([, , p]) => !t.includes(p)).map(([id]) => id);
    chk("P5", !!t && miss.length === 0, "all 14 paths", t ? miss.join(",") || "ok" : "route absent");
  }
}

// ═════════════════════════ db ═════════════════════════
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
type Res = { status: number; body: Any; text: string; headers: Headers };
type Key = { id: string; raw: string; name: string; scopes: string[] } | null;
const OK2: { label: string; text: string; body: Any }[] = [];
const REFUSED: { label: string; r: Res }[] = [];
let idemN = 0;
const fresh = () => `h48-${tag}-${++idemN}`;
async function api(method: string, path: string, key: Key | string | null, o: { body?: unknown; idem?: string | false; headers?: Record<string, string>; label?: string } = {}): Promise<Res> {
  const fn = RT?.[method];
  if (typeof fn !== "function") return { status: 0, body: { error: { code: "ROUTE_MISSING" } }, text: "", headers: new Headers() };
  const raw = typeof key === "string" ? key : key?.raw;
  const headers: Record<string, string> = { ...(raw ? { authorization: `Bearer ${raw}` } : {}), ...(o.headers ?? {}) };
  if (method !== "GET" && o.idem !== false) headers["idempotency-key"] = o.idem ?? fresh();
  const b = o.body === undefined ? undefined : JSON.stringify(o.body);
  if (b) headers["content-type"] = "application/json";
  try {
    const res: Response = await fn(new Request(`http://x/api/v1/hr${path}`, { method, headers, body: b }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
    const text = await res.text();
    let body: Any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text };
    }
    const r = { status: res.status, body, text, headers: res.headers };
    if (r.status >= 200 && r.status < 300) OK2.push({ label: o.label ?? path, text, body });
    else REFUSED.push({ label: o.label ?? `${method} ${path}`, r });
    return r;
  } catch (e) {
    return { status: -1, body: { error: { code: "THROW", message: errText(e) } }, text: "", headers: new Headers() };
  }
}
const sc = (r: Res) => `${r.status}${r.body?.error?.code ? `:${r.body.error.code}` : ""}`;
const strip = (r: Res) => canon({ ...(r.body ?? {}), requestId: undefined });
const raw = async (sql: string, ...p: unknown[]) => ((await fx.rawRows(sql, ...p)) ?? []) as Any[];
const nOf = async (sql: string, ...p: unknown[]) => Number((await raw(sql, ...p))[0]?.n ?? -1);
const notes: string[] = [];

async function runDb(): Promise<void> {
  const { TA, TB, u1, sA, sA2, sPg, sPos, sB, cA, U, SEC, E, R, polP, polPg, lX, runA, runD, runB, RAND } = await seedH48(P, fx, sysSvc, tag);

  // ── D0 seed control ──
  {
    const prof = await PRIV.loadEmployeeProfileForViewer(cA, vOf(U.owner), E.e1).catch((e: unknown) => ({ err: errText(e) }));
    const lv0 = await PRIV.leaveItemsForViewer(cA, vOf(U.owner)).catch(() => null);
    const bd = await JDG.loadAttendanceBoard(cA, vOf(U.owner), { day: "2026-06-10" }).catch(() => null);
    const pf = prof?.profile ?? {};
    ck("D0", { profile: pf.nationalId === SEC.nid && pf.phone === SEC.phone && pf.addressLine === SEC.addr && pf.bankAccountNo === SEC.bank && pf.hasPin === true, reason: JSON.stringify(lv0 ?? {}).includes(SEC.reason), punch: (bd?.rows ?? []).some((r: Any) => r.employeeId === E.e1 && r.slots?.some((s: Any) => s.inAt)) }, "PII present for the issuer");
  }
  // ── Q1 human gates (golden) + A14 new-key holder ──
  {
    const HV: [string, Any][] = [
      ["owner", { role: "OWNER", unitAccess: [], permissions: {} }], ["mgrAll", { role: "MANAGER", unitAccess: ["*"], permissions: {} }], ["mgrU1", { role: "MANAGER", unitAccess: [u1], permissions: {} }],
      ["staff", { role: "STAFF", unitAccess: [], permissions: {} }], ...["hr.employee.create", "hr.leave.read", "hr.leave.decide", "hr.leave.request", "hr.payroll.read", "hr.attendance.clock", "hr.payadjust.request"].map((k) => [k.slice(3), { role: "STAFF", unitAccess: [], permissions: { [k]: true } }] as [string, Any]),
    ];
    const cells: string[] = [];
    for (const [n, v] of HV) {
      const w = { ...v, userId: `qc-hv-${n}` };
      const a = PRIV.hrAccessOf(w);
      const lr = await ROS.listRoster(cA, w, { from: "2026-06-10", to: "2026-06-10" }).catch(() => ({ ok: "x" }));
      cells.push(`${n}:${+!!BRD.canReadRoster(w)}${+!!a.openProfile}${+!!a.seeSensitive}${+!!a.readLeave}${lr.ok === true ? 1 : lr.ok === "x" ? "x" : 0}`);
    }
    chk("Q1", cells.join(" ") === GOLD_Q1, GOLD_Q1, cells.join(" "));
    const w = { role: "STAFF", unitAccess: ["*"], permissions: { "hr.roster.read": true, "hr.employee.read": true }, userId: "apikey:qc-newkey" }; // ORACLE-EDIT (H4.8 fix round · controller ruling 2): the holder is the API-key synthetic viewer ◂
    const a = PRIV.hrAccessOf(w);
    const lr = await ROS.listRoster(cA, w, { from: "2026-06-10", to: "2026-06-10" }).catch(() => null);
    const pub = await ROS.publishRoster(cA, w, { from: "2031-01-05", to: "2031-01-11" }).catch(() => null);
    const pr = await PRIV.loadEmployeeProfileForViewer(cA, w, E.e1).catch(() => null);
    const slip = await PRIV.loadPayslipForViewer(cA, w, runA, E.e1).catch(() => "x");
    ck("A14", { board: BRD.canReadRoster(w) === true, roster: lr?.ok === true, open: a.openProfile === true && pr?.profile?.id === E.e1, noSens: a.seeSensitive === false && pr?.canSeeSensitive === false && pr?.profile?.nationalId === undefined, noLeave: a.readLeave === false, noWrite: pub?.ok === false, noPay: slip === null }, "read only", `pub=${short(pub, 40)}`);
  }

  // ── keys ──
  const mkKey = async (label: string, scopes: string[], o: { sys?: string | null; tid?: string; by?: string } = {}): Promise<Key> => {
    const name = `QC48 ${label} ${tag}`;
    try {
      const k = await AK.createApiKey({ tenantId: o.tid ?? TA }, name, { scopes, systemId: o.sys === undefined ? sA : (o.sys ?? undefined), createdById: o.by ?? U.owner.id });
      return { id: k.id, raw: k.rawKey, name, scopes };
    } catch (e) {
      notes.push(`key ${label}: ${errText(e).slice(0, 70)}`);
      return null;
    }
  };
  const minus = (s: string) => HR_READ.filter((x) => x !== s);
  const K = {
    read: await mkKey("read", HR_READ), noEmp: await mkKey("noemp", minus("hr.employee.read")), noRoster: await mkKey("noroster", minus("hr.roster.read")), noLeave: await mkKey("noleave", minus("hr.leave.read")),
    pay: await mkKey("pay", HR_PAY), leave: await mkKey("leave", HR_LEAVE), reqOnly: await mkKey("reqonly", [...HR_READ, "hr.leave.request"]), all: await mkKey("all", [...HR_LEAVE, "hr.payroll.read"]),
    pos: await mkKey("pos", ["pos.sale.read"], { sys: sPos }), gen: await mkKey("gen", ["account.doc.view"], { sys: null }), pg: await mkKey("pg", HR_READ, { sys: sPg }), rate: await mkKey("rate", HR_PAY),
    aud: await mkKey("aud", HR_PAY), rev: await mkKey("rev", HR_READ), exp: await mkKey("exp", HR_READ), B: await mkKey("b", HR_LEAVE, { tid: TB, sys: sB, by: U.ownerB.id }), all2: await mkKey("all2", [...HR_LEAVE, "hr.payroll.read"]),
  };
  if (notes.length) console.log(`  ℹ ${notes.join(" · ")}`);

  // ── requests of the matrix ──
  let dN = 0;
  const postBody = () => ({ employeeId: E.eS, policyId: polP, fromDate: addDay("2031-04-01", dN), toDate: addDay("2031-04-01", dN++) });
  type Rq = { l: string; op: string; m: string; p: string; rep?: string; sh?: Sh; list?: boolean };
  const REQS: Rq[] = [
    { l: "units", op: "units.list", m: "GET", p: "/units", sh: UNIT, list: true },
    { l: "employees", op: "employees.list", m: "GET", p: "/employees?pageSize=50", sh: EMP, list: true },
    { l: "employee", op: "employees.get", m: "GET", p: `/employees/${E.e1}`, sh: EMP },
    { l: "shifts", op: "shifts.list", m: "GET", p: "/shifts", sh: SHIFT, list: true },
    { l: "roster", op: "roster.list", m: "GET", p: "/roster?from=2026-06-08&to=2026-06-14", sh: ROSTER, list: true },
    { l: "day", op: "attendance.day", m: "GET", p: "/attendance/day?day=2026-06-10", sh: DAY },
    { l: "month", op: "attendance.month", m: "GET", p: `/attendance/month?employeeId=${E.e1}&month=2026-06`, sh: MONTH },
    { l: "policies", op: "leavePolicies.list", m: "GET", p: "/leave-policies", sh: POLICY, list: true },
    { l: "leaves", op: "leaves.list", m: "GET", p: "/leaves?status=HISTORY", sh: LEAVE, list: true },
    { l: "balances", op: "leaveBalances.list", m: "GET", p: "/leave-balances?year=2031", sh: BAL },
    { l: "post", op: "leaves.create", m: "POST", p: "/leaves", sh: POSTED },
    ...[...REPORTS8, "register"].map((r) => ({ l: `rep:${r}`, op: "reports.get", m: "GET", p: `/reports/${r}?period=${periodOf(CAT[r]?.period ?? "month")}`, rep: r })),
    { l: "history", op: "payslips.history", m: "GET", p: `/employees/${E.e1}/payslips?taxYear=2026`, sh: HIST },
    { l: "slip", op: "payslips.get", m: "GET", p: `/payslips/${runA}/${E.e1}`, sh: SLIP },
  ];
  const send = (q: Rq, k: Key | null, extra: { headers?: Record<string, string> } = {}) => api(q.m, q.p, k, { label: `${q.l}`, ...(q.m === "POST" ? { body: postBody() } : {}), ...extra });
  const expect = (q: Rq, k: Key | null, keyGiven: boolean) => {
    if (!keyGiven) return "401:unauthorized";
    const has = (s: string) => !!k?.scopes.includes(s);
    const need = q.op === "reports.get" ? [actionOf(q.op), ...(q.rep === "register" ? [] : [REPORT_SCOPE(q.rep!)])] : q.op === "leaves.create" ? ["hr.leave.request", "hr.leave.decide"] : [actionOf(q.op)];
    if (!need.every(has)) return "403:scope_missing";
    return q.rep === "register" ? "404:not_found" : "200";
  };
  // A2 + A3 (shapes come from the matrix answers)
  {
    const bad: string[] = [];
    const shapes: string[] = [];
    let n200 = 0;
    for (const [kn, k] of [["none", null], ["read", K.read], ["noEmp", K.noEmp], ["noRoster", K.noRoster], ["noLeave", K.noLeave], ["pay", K.pay], ["leave", K.leave]] as [string, Key][]) {
      if (kn !== "none" && !k) {
        bad.push(`${kn}:key-missing`);
        continue;
      }
      for (const q of REQS) {
        const r = await send(q, k);
        const want = expect(q, k, kn !== "none");
        if (sc(r) !== want) bad.push(`${kn}/${q.l}=${sc(r)}≠${want}`);
        if (r.status !== 200) continue;
        n200++;
        const pay = !!k?.scopes.includes("hr.payroll.read");
        const s = q.rep ? reportShape(CAT[q.rep].columns, pay, r.body?.data?.totals != null) : q.sh!;
        const e = dataBad(r.body, s, !!q.list);
        const top = Object.keys(r.body ?? {}).filter((x) => !["data", "requestId", "page", "truncated"].includes(x));
        if (e.length || top.length || (q.op === "employees.list" && !r.body?.page)) shapes.push(`${kn}/${q.l}:${[...top, ...e].slice(0, 2).join(",") || "no page"}`);
      }
    }
    chk("A2", bad.length === 0, "7 × 22 exact", bad.length ? `${bad.length} off: ${bad.slice(0, 5).join(" ")}` : "ok");
    chk("A3", n200 >= 60 && shapes.length === 0, "exact keys on every 2xx", `${n200} × 200 · ${shapes.slice(0, 4).join(" ") || "ok"}`);
  }
  // A2b system binding
  {
    const bad: string[] = [];
    for (const q of REQS.filter((x) => x.rep !== "register" && (x.op !== "reports.get" || x.rep === "time"))) {
      const r = await send(q, K.pos);
      if (sc(r) !== "403:system_mismatch") bad.push(`pos/${q.l}=${sc(r)}`);
    }
    const g1 = await api("GET", "/units", K.gen);
    const g2 = await api("GET", "/units", K.gen, { headers: { "x-shark-system": sA } });
    if (sc(g1) !== "400:system_required" || sc(g2) !== "403:scope_missing") bad.push(`gen=${sc(g1)}/${sc(g2)}`);
    chk("A2b", !!K.pos && !!K.gen && bad.length === 0, "system binding", bad.slice(0, 5).join(" ") || "ok");
  }
  // A2c (ruling 14 Nov, 4): HR ops accept only keys bound to this HR system — an unbound key with hr scopes must not bypass the issuer rules
  {
    const genHr = await mkKey("genhr", [...HR_LEAVE, "hr.payroll.read"], { sys: null });
    const posHr = await mkKey("poshr", [...HR_LEAVE, "hr.payroll.read"], { sys: sPos });
    const bare = await mkKey("bare", ["account.doc.view"]);
    const hdr = { headers: { "x-shark-system": sA } };
    const lv0 = await nOf(`SELECT count(*)::int AS n FROM "HrLeave" WHERE "tenantId" = $1`, TA);
    const n2xx = OK2.length;
    const bad: string[] = [];
    for (const q of REQS.filter((x) => !x.rep || x.rep === "time")) {
      const rg = await send(q, genHr, hdr);
      const rb = await send(q, bare);
      const rp = await send(q, posHr, hdr);
      if (sc(rg) !== "403:scope_missing" || strip(rg) !== strip(rb)) bad.push(`gen/${q.l}=${sc(rg)}${strip(rg) === strip(rb) ? "" : "≠bare"}`);
      if (rp.status !== 403) bad.push(`pos/${q.l}=${sc(rp)}`);
    }
    const aud = await P.auditLog.count({ where: { tenantId: TA, actorId: { in: [genHr?.id ?? "∅", posHr?.id ?? "∅"] } } });
    const lv1 = await nOf(`SELECT count(*)::int AS n FROM "HrLeave" WHERE "tenantId" = $1`, TA);
    ck("A2c", { keys: !!genHr && !!posHr && !!bare, refused: bad.length === 0, no2xx: OK2.length === n2xx, nothing: lv0 === lv1 && aud === 0 }, "bound keys only", bad.slice(0, 4).join(" "));
  }
  // A5 + A6
  {
    const h = async (s: string) => sc(await api("GET", "/units", K.read, { headers: { "x-shark-system": s } }));
    const pair = async (a: string, b: string, k: Key, body?: (id: string) => unknown) => {
      const ra = await api(body ? "POST" : "GET", body ? "/leaves" : a, k, body ? { body: body(a) } : {});
      const rb = await api(body ? "POST" : "GET", body ? "/leaves" : b, k, body ? { body: body(b) } : {});
      return ra.status === 404 && sc(ra) === "404:not_found" && strip(ra) === strip(rb) ? "" : `${sc(ra)}|${sc(rb)}`;
    };
    const before = await nOf(`SELECT count(*)::int AS n FROM "HrLeave" WHERE "tenantId" = ANY($1::text[])`, [TA, TB]);
    const leaveBody = (id: string) => ({ employeeId: id, policyId: polP, fromDate: "2031-06-01", toDate: "2031-06-01" });
    const p = {
      hdrB: (await h(sB)) === "403:system_mismatch", hdrA2: (await h(sA2)) === "403:system_mismatch",
      empB: await pair(`/employees/${E.eB}`, `/employees/${RAND}`, K.read), empX: await pair(`/employees/${E.eX}`, `/employees/${RAND}`, K.read),
      monthB: await pair(`/attendance/month?employeeId=${E.eB}&month=2026-06`, `/attendance/month?employeeId=${RAND}&month=2026-06`, K.read),
      slipB: await pair(`/payslips/${runB}/${E.eB}`, `/payslips/${RAND}/${RAND}`, K.pay), histB: await pair(`/employees/${E.eB}/payslips?taxYear=2026`, `/employees/${RAND}/payslips?taxYear=2026`, K.pay),
      postB: await pair(E.eB, RAND, K.leave, leaveBody), postX: await pair(E.eX, RAND, K.leave, leaveBody),
    };
    const after = await nOf(`SELECT count(*)::int AS n FROM "HrLeave" WHERE "tenantId" = ANY($1::text[])`, [TA, TB]);
    const emps = await api("GET", "/employees?pageSize=50", K.read);
    const ids = new Set(((emps.body?.data ?? []) as Any[]).map((x) => x.id));
    const lvs = await api("GET", "/leaves?status=PENDING", K.read);
    const lids = new Set(((lvs.body?.data ?? []) as Any[]).map((x) => x.id));
    const okP = Object.entries(p).filter(([, v]) => v !== true && v !== "");
    ck("A5", { pairs: okP.length === 0, nothing: before === after, listE: emps.status === 200 && [E.e1, E.e2, E.eS, E.eOwn].every((x) => ids.has(x)) && !ids.has(E.eB) && !ids.has(E.eX) && !ids.has(E.eEnd), listL: lvs.status === 200 && !lids.has(lX) && lids.size >= 1 }, "foreign ≡ unknown", okP.map(([k, v]) => `${k}=${v}`).slice(0, 4).join(" "));
    const ros = await api("GET", "/roster?from=2026-06-08&to=2026-06-14", K.read);
    const rids = srt(((ros.body?.data ?? []) as Any[]).map((x) => x.id));
    const draft = await api("GET", `/payslips/${runD}/${E.e1}`, K.pay);
    ck("A6", { published: ros.status === 200 && rids === srt([R.p1, R.p2]), draft: sc(draft) === "409:state_conflict" && isThai(String(draft.body?.error?.message_th ?? "")) }, "published only · draft 409", `roster=${ros.status} ${rids.length ? rids.split(",").length : 0} draft=${sc(draft)}`);
  }
  // A8 / A8b / A8c / A8d
  {
    const leaves = (e: string, from: string) => nOf(`SELECT count(*)::int AS n FROM "HrLeave" WHERE "employeeId" = $1 AND "fromDate" = $2::date`, e, from);
    const body = { employeeId: E.eS, policyId: polP, fromDate: "2031-03-10", toDate: "2031-03-10" };
    const k1 = fresh();
    const audN = async () => P.auditLog.count({ where: { tenantId: TA, action: "hr.api.leaves.create", actorId: K.leave?.id ?? "∅" } });
    const n0 = await audN();
    const r1 = await api("POST", "/leaves", K.leave, { body, idem: k1 });
    const n1 = await audN();
    const id = r1.body?.data?.id;
    const row = id ? await P.hrLeave.findFirst({ where: { id } }) : null;
    const apr = id ? await P.approvalRequest.count({ where: { tenantId: TA, entityType: "HrLeave", entityId: id } }) : 0;
    const aud = (await P.auditLog.findMany({ where: { tenantId: TA, action: "hr.api.leaves.create" }, orderBy: { createdAt: "desc" }, take: 1 })) as Any[];
    const a0 = aud[0];
    const audTxt = JSON.stringify(a0 ?? {});
    ck("A8", {
      st: r1.status === 200, data: canon(r1.body?.data) === canon({ id, status: "PENDING" }), row: row?.status === "PENDING" && row?.reason === null && row?.filedById === U.owner.id && row?.systemId === sA,
      chain: apr === 1, audit: n1 - n0 === 1 && a0?.actorType === "API_KEY" && a0?.actorId === K.leave?.id && a0?.after?.keyName === K.leave?.name && !audTxt.includes(`สมชาย ${tag}`) && !/"reason"/.test(audTxt),
    }, "PENDING + chain + audit", `${sc(r1)} ${short(r1.body?.data, 60)} audits+${n1 - n0}`);
    const rNo = await api("POST", "/leaves", K.leave, { body: { ...body, fromDate: "2031-03-12", toDate: "2031-03-12" }, idem: false });
    const r2 = await api("POST", "/leaves", K.leave, { body, idem: k1 });
    const r3 = await api("POST", "/leaves", K.leave, { body: { ...body, toDate: "2031-03-11" }, idem: k1 });
    ck("A8b", { noHdr: sc(rNo) === "400:idempotency_required", replay: r2.status === 200 && r2.headers.get("idempotent-replayed") === "true" && strip(r2) === strip(r1), conflict: sc(r3) === "409:idempotency_conflict", one: (await leaves(E.eS, "2031-03-10")) === 1 && (await leaves(E.eS, "2031-03-12")) === 0 }, "replay safe", `${sc(rNo)} ${sc(r2)} ${sc(r3)}`);
    const b2 = { ...body, fromDate: "2031-03-20", toDate: "2031-03-20" };
    const k2 = fresh();
    let rB: Res | null = null;
    const hold = await holdAdvisory(P, `hr-leave-emp:${sA}:${E.eS}`, async () => {
      rB = await api("POST", "/leaves", K.leave, { body: b2, idem: k2 });
    }, () => api("POST", "/leaves", K.leave, { body: b2, idem: k2 })).catch((e: unknown) => ({ res: { status: -1 } as Res, waited: false, holderErr: errText(e) }));
    const rA = hold.res;
    const rC = await api("POST", "/leaves", K.leave, { body: b2, idem: k2 });
    ck("A8c", { waited: hold.waited, a: rA.status === 200, b: rB !== null && sc(rB) === "409:idempotency_in_progress", replay: rC.status === 200 && rC.body?.data?.id === rA.body?.data?.id, one: (await leaves(E.eS, "2031-03-20")) === 1 }, "deterministic race", `waited=${hold.waited} A=${sc(rA)} B=${rB ? sc(rB) : "-"} C=${sc(rC)} ${hold.holderErr}`);
    const d = "2031-03-24";
    const ro = await api("POST", "/leaves", K.leave, { body: { ...body, employeeId: E.eOwn, fromDate: d, toDate: d } });
    const rq = await api("POST", "/leaves", K.reqOnly, { body: { ...body, fromDate: d, toDate: d } });
    const rv = await api("POST", "/leaves", K.leave, { body });
    const rr = await api("POST", "/leaves", K.leave, { body: { ...body, fromDate: d, toDate: d, reason: "ไข้" } });
    let uiText = "";
    try {
      await SVC.requestLeave(cA, { employeeId: E.eS, type: "PERSONAL", policyId: polP, fromDate: d, toDate: d, hours: 2, actorUserId: U.owner.id });
      uiText = "∅ accepted";
    } catch (e) {
      uiText = e instanceof Error ? e.message : String(e);
    }
    const rh = await api("POST", "/leaves", K.leave, { body: { ...body, fromDate: d, toDate: d, hours: 2 } });
    const n24 = (await leaves(E.eS, d)) + (await leaves(E.eOwn, d));
    ck("A8d", {
      owner: sc(ro) === "403:forbidden", noDecide: sc(rq) === "403:scope_missing", overlap: sc(rv) === "409:duplicate", reason: sc(rr) === "422:validation",
      ui: isThai(uiText) && sc(rh) === "422:unprocessable" && rh.body?.error?.message_th === uiText, zero: n24 === 0,
    }, "refusals write nothing", `${sc(ro)} ${sc(rq)} ${sc(rv)} ${sc(rr)} ${sc(rh)} ui="${short(uiText, 40)}" rows=${n24}`);
  }
  // A9 paging + cap
  {
    await P.hrEmployee.createMany({ data: Array.from({ length: 57 }, (_, i) => ({ tenantId: TA, systemId: sPg, name: `QC Pg ${String(i + 1).padStart(3, "0")} ${tag}`, unitId: u1 })) });
    const base = ((await P.hrEmployee.findMany({ where: { systemId: sPg }, select: { id: true } })) as Any[]).map((x) => x.id as string);
    const pg = (n: number) => api("GET", `/employees?page=${n}&pageSize=20`, K.pg);
    const p1 = await pg(1);
    await fx.mkEmp(TA, sPg, `QC Pg 999 ${tag}`, { unitId: u1 });
    const p2 = await pg(2);
    const p3 = await pg(3);
    const rows = [p1, p2, p3].flatMap((r) => (r.body?.data ?? []) as Any[]);
    const ids = rows.map((x) => x.id as string);
    const key = (x: Any) => `${x.name}\u0000${x.id}`;
    const sorted = rows.every((x, i) => i === 0 || key(rows[i - 1]) <= key(x));
    const bad = await api("GET", "/employees?page=1&pageSize=25", K.pg);
    const e = await P.hrEmployee.findFirst({ where: { systemId: sPg }, select: { id: true } });
    await P.hrLeave.createMany({ data: Array.from({ length: 101 }, (_, i) => ({ tenantId: TA, systemId: sPg, employeeId: e.id, policyId: polPg, type: "PERSONAL", status: "APPROVED", fromDate: new Date(Date.UTC(2025, 0, 1 + i)), toDate: new Date(Date.UTC(2025, 0, 1 + i)), days: 1 })) });
    const cap = await api("GET", "/leaves?status=HISTORY", K.pg);
    const small = await api("GET", "/leaves?status=PENDING", K.read);
    ck("A9", {
      pages: p1.body?.data?.length === 20 && p2.body?.data?.length === 20 && p1.body?.page?.pageSize === 20, union: base.every((x) => ids.includes(x)) && new Set(ids).size === ids.length && ids.length === 58, sorted,
      size: sc(bad) === "422:validation", cap: cap.body?.truncated === true && cap.body?.data?.length === 100, under: small.status === 200 && (small.body?.truncated === undefined || small.body?.truncated === false),
    }, "3 pages · stable · cap", `p=${p1.body?.data?.length}/${p2.body?.data?.length}/${p3.body?.data?.length} ids=${ids.length} ${sc(bad)} cap=${cap.body?.truncated}/${cap.body?.data?.length}`);
  }
  // A11 rate buckets
  {
    const kid = K.rate?.id ?? "∅";
    const r1 = await api("GET", `/payslips/${runA}/${E.e1}`, K.rate);
    const b1 = await raw(`SELECT "key", "count" FROM "ChatRateBucket" WHERE "key" LIKE $1 ORDER BY "key"`, `%:${kid}`);
    await api("GET", "/units", K.rate);
    const b2 = await raw(`SELECT "key" FROM "ChatRateBucket" WHERE "key" LIKE $1 ORDER BY "key"`, `%:${kid}`);
    await P.$executeRawUnsafe(`UPDATE "ChatRateBucket" SET "count" = 30, "windowStart" = now() WHERE "key" = $1`, `hr:api:report:${kid}`).catch(() => 0);
    const r31 = await api("GET", `/payslips/${runA}/${E.e1}`, K.rate);
    const rh = await api("GET", `/employees/${E.e1}/payslips?taxYear=2026`, K.rate);
    const rt = await api("GET", "/reports/time?period=2026-06", K.rate);
    const ru = await api("GET", "/units", K.rate);
    ck("A11", {
      first: r1.status === 200, bucket: b1.length === 1 && b1[0]?.key === `hr:api:report:${kid}` && Number(b1[0]?.count) === 1, read: srt(b2.map((x) => x.key)) === srt([`hr:api:read:${kid}`, `hr:api:report:${kid}`]),
      limited: sc(r31) === "429:rate_limited" && Number(r31.headers.get("retry-after")) > 0 && sc(rh) === "429:rate_limited" && sc(rt) === "429:rate_limited", readFree: ru.status === 200,
    }, "report bucket", `${b1.map((x) => `${x.key.replace(kid, "K")}=${x.count}`)} ${sc(r31)} ra=${r31.headers.get("retry-after")} ${sc(rh)} ${sc(rt)} ${sc(ru)}`);
  }
  // A12 issuer core
  {
    const keysBefore = await P.apiKey.count({ where: { tenantId: TA } });
    const iss = async (w: Any, input: Any) => {
      if (!ok(KEYS) || typeof KEYS.issueHrApiKey !== "function") return { ok: false, code: "MISSING" };
      try {
        return await KEYS.issueHrApiKey(authOf(w), { systemId: sA, name: `QC48 iss ${tag} ${++idemN}`, ...input });
      } catch (e) {
        return { ok: false, code: "THROW", message: errText(e) };
      }
    };
    const refused = [
      await iss(U.mgr, { bundle: "hr-read", ttlDays: 30 }), await iss(U.keyStaff, { bundle: "hr-read", ttlDays: 30 }), await iss(U.owner, { bundle: "pos-read", ttlDays: 30 }),
      await iss(U.owner, { scopes: ["hr.employee.read", "hr.payroll.create"], ttlDays: 30 }), await iss(U.owner, { bundle: "hr-payroll-read", ttlDays: 90 }),
      await iss(U.owner, { bundle: "hr-payroll-read", ttlDays: 0, payConsent: true }), await iss(U.owner, { bundle: "hr-read", ttlDays: 30, systemId: sPos }),
    ];
    const midCount = await P.apiKey.count({ where: { tenantId: TA } });
    const midAud = await P.auditLog.count({ where: { tenantId: TA, action: { startsWith: "hr.apikey." } } });
    const good = [await iss(U.owner, { bundle: "hr-payroll-read", ttlDays: 90, payConsent: true }), await iss(U.owner, { ttlDays: 30 }), await iss(U.owner, { bundle: "hr-leave", ttlDays: 365 })];
    const gid = good.map((g: Any) => g?.keyId ?? g?.id);
    const rows = (await P.apiKey.findMany({ where: { id: { in: gid.filter(Boolean) } } })) as Any[];
    const rowOf = (i: number) => rows.find((r) => r.id === gid[i]);
    const days = (r: Any) => (r?.expiresAt ? Math.round((r.expiresAt.getTime() - Date.now()) / 86_400_000) : -1);
    let rev: Any = { ok: false };
    try {
      rev = ok(KEYS) && typeof KEYS.revokeHrApiKey === "function" ? await KEYS.revokeHrApiKey(authOf(U.owner), { systemId: sA, keyId: gid[0] }) : { ok: false };
    } catch (e) {
      rev = { ok: false, m: errText(e) };
    }
    const iAud = (await P.auditLog.findMany({ where: { tenantId: TA, action: "hr.apikey.issue" } })) as Any[];
    const rAud = (await P.auditLog.findMany({ where: { tenantId: TA, action: "hr.apikey.revoke" } })) as Any[];
    ck("A12", {
      refused: refused.every((r: Any) => r?.ok === false && r?.code !== "MISSING" && r?.code !== "THROW"), nothing: midCount === keysBefore && midAud === 0,
      issued: good.every((g: Any) => g?.ok === true && /^shark_/.test(String(g?.rawKey ?? ""))) && rows.length === 3,
      scopes: srt(rowOf(0)?.scopesJson ?? []) === srt(HR_PAY) && srt(rowOf(1)?.scopesJson ?? []) === srt(HR_READ) && srt(rowOf(2)?.scopesJson ?? []) === srt(HR_LEAVE),
      bound: rows.every((r) => r.systemId === sA && r.createdById === U.owner.id) && days(rowOf(0)) === 90 && days(rowOf(1)) === 30,
      audit: iAud.length === 3 && iAud.every((a) => srt(Object.keys(a.after ?? {})) === "keyId,scopes" && gid.includes(a.after.keyId)) && rAud.length === 1 && srt(Object.keys(rAud[0]?.after ?? {})) === "keyId" && rAud[0]?.after?.keyId === gid[0],
      revoked: rev?.ok === true && !!(await P.apiKey.findFirst({ where: { id: gid[0] ?? "∅" } }))?.revokedAt,
    }, "OWNER + hr bundles + consent", `refused=${refused.map((r: Any) => r?.ok === false ? r?.code ?? "no" : "OK!").join(",")} issued=${good.map((g: Any) => g?.ok)} aud=${iAud.length}/${rAud.length}`);
  }
  // A13 pay audit
  {
    const kid = K.aud?.id ?? "∅";
    const rows = async () => (await P.auditLog.findMany({ where: { tenantId: TA, actorId: kid, action: { startsWith: "hr.api." } }, orderBy: { createdAt: "asc" } })) as Any[];
    const s1 = await api("GET", `/payslips/${runA}/${E.e1}`, K.aud);
    const a1 = await rows();
    const s2 = await api("GET", `/employees/${E.e1}/payslips?taxYear=2026`, K.aud);
    const s3 = await api("GET", "/reports/payroll-month?period=2026-06", K.aud);
    const a3 = await rows();
    const by = (act: string) => a3.filter((a) => a.action === act);
    const txt = JSON.stringify(a3.map((a) => a.after));
    ck("A13", {
      st: [s1, s2, s3].every((r) => r.status === 200), one: a1.length === 1 && a3.length === 3,
      slip: by("hr.api.payslip.read").length === 1 && canon(by("hr.api.payslip.read")[0]?.after) === canon({ runId: runA, employeeId: E.e1 }),
      hist: by("hr.api.payslip.history").length === 1 && srt(Object.keys(by("hr.api.payslip.history")[0]?.after ?? {})) === "employeeId,taxYear",
      rep: by("hr.api.report.read").length === 1 && srt(Object.keys(by("hr.api.report.read")[0]?.after ?? {})) === "period,report,unitId",
      who: a3.every((a) => a.actorType === "API_KEY"), noPii: !txt.includes(tag) && !/Satang/i.test(txt),
    }, "one row per pay read", `${a1.length}/${a3.length} ${a3.map((a) => a.action).join(",")}`);
  }
  // A16 recipes replay
  {
    const recs = recipesOf(rd(F.recipes));
    const vals = { SHARK_API_KEY: K.all?.raw ?? "none", SHARK_SYSTEM_ID: sA, UNIT_ID: u1, EMPLOYEE_ID: E.e1, RUN_ID: runA, FROM: "2031-05-04", TO: "2031-05-04" };
    const bad: string[] = [];
    for (const r of recs) {
      const c = parseCurl(substitute(r.raw, vals, fresh).out);
      const { authorization, "idempotency-key": idem, ...hdrs } = c.headers;
      const res = await api(c.method, `${c.path}${c.query ? `?${c.query}` : ""}`, String(authorization ?? "").replace(/^Bearer\s+/i, "") || null, { body: (() => { try { return c.body ? JSON.parse(c.body) : undefined; } catch { return c.body; } })(), idem: idem ?? false, headers: hdrs, label: `recipe ${r.title}` });
      if (res.status < 200 || res.status > 299) bad.push(`${r.title.slice(0, 20)}=${sc(res)}`);
    }
    chk("A16", recs.length >= 6 && bad.length === 0, "≥ 6 recipes 2xx", `${recs.length} recipes ${bad.slice(0, 4).join(" ")}`);
  }
  // A10 envelope (+ 405 / 404)
  {
    const m405 = await api("PUT", "/units", K.read, { body: {} });
    const m404 = await api("GET", "/nope", K.read);
    const codes: string[] = RESP.API_ERROR_CODES ?? [];
    const bad = REFUSED.filter(({ r }) => {
      const e = r.body?.error ?? {};
      return !(srt(Object.keys(r.body ?? {})) === "error,requestId" && Object.keys(e).every((k) => ["code", "message_th", "message_en", "hint", "details"].includes(k)) && codes.includes(e.code) && isThai(String(e.message_th ?? "")) && /^[\x20-\x7e]+$/.test(String(e.message_en ?? "")));
    }).map(({ label, r }) => `${label}=${sc(r)}`);
    ck("A10", { some: REFUSED.length >= 40, env: bad.length === 0, m405: sc(m405) === "405:method_not_allowed" && /GET/.test(m405.headers.get("allow") ?? ""), m404: sc(m404) === "404:not_found" }, "house envelope", `${REFUSED.length} refusals · ${bad.slice(0, 3).join(" ")} ${sc(m405)} ${sc(m404)}`);
  }
  // ORACLE-EDIT (H4.8 fix round · controller ruling 1–6) ▸ checks F1–F6 live in qc-hr-h4.8-lib.mts runFixRound (size limit G) ◂
  await runFixRound({ P, TA, sA, cA, polP, E, U, K, RAND, runA, R, tag, HR_PAY, CAT, PERM, ROS, BRD, PRIV, KEYS, RT, REFUSED, mkKey, api, sc, strip, nOf, fresh, ck, chk, authOf, isThai, errText, ok });
  // A7 / A7b (last: they change keys and the issuer)
  {
    if (K.rev) await AK.revokeApiKey({ tenantId: TA }, K.rev.id).catch(() => false);
    if (K.exp) await P.$executeRawUnsafe(`UPDATE "ApiKey" SET "expiresAt" = now() - interval '1 day' WHERE "id" = $1`, K.exp.id);
    const r1 = await api("GET", "/units", K.rev);
    const r2 = await api("GET", "/units", K.exp);
    ck("A7", { keys: !!K.rev && !!K.exp, rev: sc(r1) === "401:unauthorized", exp: sc(r2) === "401:key_expired" }, "401", `${sc(r1)} ${sc(r2)}`);
    const q14 = REQS.filter((q) => !q.rep || q.rep === "time");
    const allForbidden = async (k: Key) => {
      const out: string[] = [];
      for (const q of q14) {
        const r = await send(q, k);
        if (sc(r) !== "403:forbidden" || r.body?.error?.message_th !== FORBID_TH) out.push(`${q.l}=${sc(r)}`);
      }
      return out;
    };
    const lvBefore = await nOf(`SELECT count(*)::int AS n FROM "HrLeave" WHERE "tenantId" = $1`, TA);
    await P.membership.updateMany({ where: { tenantId: TA, userId: U.owner.id }, data: { role: "MANAGER" } });
    const dem = await allForbidden(K.all);
    await P.membership.updateMany({ where: { tenantId: TA, userId: U.owner.id }, data: { role: "OWNER", acceptedAt: null } });
    const una = await allForbidden(K.all2);
    await P.membership.updateMany({ where: { tenantId: TA, userId: U.owner.id }, data: { acceptedAt: new Date() } });
    const back = await api("GET", "/units", K.all);
    const back2 = await api("GET", `/payslips/${runA}/${E.e1}`, K.all);
    const lvAfter = await nOf(`SELECT count(*)::int AS n FROM "HrLeave" WHERE "tenantId" = $1`, TA);
    ck("A7b", { n: q14.length === 14, demoted: dem.length === 0, unaccepted: una.length === 0, nothing: lvBefore === lvAfter, restored: back.status === 200 && back2.status === 200 }, "issuer must stay OWNER", `${dem.slice(0, 3).join(" ")} | ${una.slice(0, 2).join(" ")} back=${sc(back)}/${sc(back2)}`);
  }
  // A4 forbidden keys + secrets in every 2xx
  {
    const extra = [...HR_FORBIDDEN_DTO_KEYS, "addressLine", "birthDate", "hasPin", "citizenId", "bankMasked", "href", "filedBy", "filedById", "canReadReason", "canSeeSensitive", "docs"];
    const hits: string[] = [];
    for (const b of OK2) {
      const walk = (v: Any, p: string) => {
        if (Array.isArray(v)) v.forEach((x) => walk(x, p));
        else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (BAD_KEY(k, extra) && hits.push(`${b.label}.${k}`), k !== "values" && walk(x, `${p}.${k}`));
      };
      walk(b.body?.data, "");
      for (const [n, s] of Object.entries(SEC)) if (b.text.includes(s)) hits.push(`${b.label}~${n}`);
    }
    chk("A4", OK2.length >= 25 && hits.length === 0, "no PII key/value in 2xx", `${OK2.length} bodies · ${[...new Set(hits)].slice(0, 5).join(" ") || "clean"}`);
  }
}

// ═════════════════════════ main ═════════════════════════
let crashed = "";
const keyIdsOf = async () => ((await fx.rawRows(`SELECT "id" FROM "ApiKey" WHERE "tenantId" = ANY($1::text[])`, fx.tenants)) ?? []).map((r: Any) => String(r.id));
async function cleanMine(): Promise<void> {
  const ids = await keyIdsOf();
  for (const id of ids) await fx.rawRows(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%:${id}`);
  for (const t of ["ApiIdempotency", "ApiKey"]) await fx.rawRows(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, fx.tenants);
}
let keyIds: string[] = [];
try {
  runStatic();
  await runPure();
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
}
keyIds = await keyIdsOf();
await cleanMine();
await cleanupFx(P, fx, SLUG);
{
  const res = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  const mine: string[] = [];
  for (const t of ["ApiIdempotency", "ApiKey"]) {
    const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, fx.tenants);
    if (Number(r?.[0]?.n ?? 0) !== 0) mine.push(`${t}=${r?.[0]?.n}`);
  }
  for (const id of keyIds) {
    const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%:${id}`);
    if (Number(r?.[0]?.n ?? 0) !== 0) mine.push(`bucket:${id.slice(0, 6)}`);
  }
  chk("Z1", res.length === 0 && mine.length === 0, "none", [...res, ...mine].join(",") || `none (${keyIds.length} keys swept)`);
}
const missing = Object.values(F).filter((f) => !exists(f));
process.exitCode = finish({ forced: FORCE, crashed, missing });
await P.$disconnect?.();

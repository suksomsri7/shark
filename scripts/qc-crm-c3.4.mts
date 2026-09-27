// QC — CRM v2 WO C3.4: MEETING/KB bridges + in-page AI + the remaining AI tools (→ 32)
//      team-room notifications (deal won · hot lead · stale digest) into the MEETING channel mapped per Team · deal-link unfurl ·
//      AI buttons on deal / contact / company / home (fake provider) · KB grounding (`{{kb:<id>}}` + retrieval in prompts) ·
//      business card → lead proposal (company match) · the proposal permission matrix · the 9 tools that bring the registry to 32
// Oracle writer · the C3.4 builder must NOT touch this file · QC database only (.env.qc — loaded by scripts/acc-v2-env.mts)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c3.4.mts
//      `--force-run` = run every check while `src/lib/modules/crm/ai-bridges.ts` is absent — the C3.4 checks red for the right reason
//                      (MISSING_FUNCTION · 23 tools instead of 32 · no team-room message), the fixtures + the leak scans of the tools that
//                      already exist + CLEAN green
// requires: crm-seed   (X2.2 READS the seeded shop — thana (team ภูเก็ต) vs the krabi team rows of crm-expected.json — and writes nothing
//                       there; every other check lives in throwaway tenants `qc-c34-<rand>-a|b` swept in `finally`)
//
// SOURCES: crm-brief-C3.4.md (+ the "Addendum (oracle author)" this file comes with) · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md
//   (R-E.4 the tool split · R-E.14 uiVersion 1 · R-C.8 ids-only payloads) · crm-brief-C1.10.md + scripts/qc-crm-c1.10.mts (tool protocol:
//   `runCrmTool` → {mode read|propose|error} · `dispatchCrmKind` · viewer = the asking human) · crm-brief-C2.11.md + qc-crm-c2.11.mts
//   (23 tools today) · crm-brief-C2.4.md (card scan → `crm_create_lead` proposal · CRM_ASSIST charged once · claim WORKING) ·
//   CRM-RUN §2 "C3.4" (team room 3 · unfurl 1 · at-risk tool + proposal 4 · summary/draft 4 · card → lead 3 · KB in prompt 2 ·
//   visibility in AI 2 · visual 3 = 22) · MASTER-PLAN §4 (X1 X2 X3 X4 X5 X8 X9 X10) · blueprint §8 · §9 rows 11 MEETING / 16 KB ·
//   mockups 14 (left: "ดีลไหนเสี่ยงเดือนนี้" → table + proposal "สร้างงานติดตาม · มอบผู้ดูแลดีลเดิม · กำหนดพรุ่งนี้") and 13 (c: card scan).
//
// ══════════════════════════════════ CONTRACT (oracle-proposed — the controller confirms it in the brief addendum) ══════════════════════════════════
//   A. ONE module `src/lib/modules/crm/ai-bridges.ts` (re-exported as `aiBridges` from crm/index.ts). MemberActor = {userId, role, unitAccess, permissions}.
//      ctx = { tenantId, systemId, actorUserId }. Refusals throw an Error with `.code` ∈ NOT_FOUND | FORBIDDEN | CONFLICT | EXPIRED | NO_CREDIT |
//      NOT_CONFIGURED (or CrmV2DisabledError on uiVersion 1) — or answer `{ ok: false }`; the oracle accepts either as "refused".
//        runAssist(ctx, actor, { kind, id?, now? }, deps?: { ai?: AiProvider }) → { kind, text, subject?, items?, proposalId|null, reused?, kbArticleIds? }
//          kind ∈ deal.summary · deal.risk · deal.nextStep · deal.draftEmail · contact.whyHot · contact.closingMessage · company.summary ·
//                 company.upsell · home.atRisk          (id = dealId / contactId / companyId; none for home.atRisk)
//          order: v2 gate → visibility of the target (NOT_FOUND, nothing called, nothing charged) → provider (NOT_CONFIGURED) → canSpend (NO_CREDIT)
//          → ONE provider call with a prompt that carries NO phone / e-mail / tax id / sensitive field value → CRM_ASSIST charged once (note = ids
//          only) → provider failure = refused, nothing charged, no proposal left behind.
//          The model is asked for JSON: summary|text · nextStep · subject + body (a plain-text answer is accepted as `text`).
//          deal.nextStep → proposal kind `crm.deals.nextStep.set` (payload in the `runCrmTool` shape: dealId · nextStep · opId · input · params · systemId
//                          + requestedByUserId) · deal.draftEmail → draft only (subject + body, never a send, never a CrmEmailMessage row)
//          home.atRisk   → { items = atRiskDeals(...).items, text } + ONE proposal kind `crm.assist.tasks` per (system · requester · Thai month) while
//                          PENDING (10 parallel clicks ⇒ 1 proposal · 1 provider call · 1 charge) · payload ids only:
//                          { systemId, month, requestedByUserId, items: [{ dealId, ownerUserId, dueAt }] } · dueAt = NEXT Thai day 09:00 +07:00
//          draftEmail / summary prompts carry KB grounding: `kb` facade search on the deal words · ACTIVE articles of THIS tenant only · ≤ 3 articles
//        atRiskDeals(ctx, actor, { now? }) → { month: "YYYY-MM" (Thai), items: [{ dealId, title, companyName, valueSatang, ownerUserId, teamId, reasons[] }] }
//          set = OPEN · not archived · visible to the actor · expectedCloseAt < first instant of the NEXT Thai month (overdue ones included) ·
//          ≥ 1 reason; reasons ∈ STALE (stalledAt set) · CLOSE_OVERDUE (expectedCloseAt < now) · NO_NEXT_ACTIVITY (nextActivityAt null or past) ·
//          PIPELINE_LATE_MONTH (forecastCategory PIPELINE and close ≤ 7 days away)
//        confirmProposal(ctx, actor, proposalId, opts?) / cancelProposal(ctx, actor, proposalId) — the ONE door for CRM proposals
//          (`crm.*` kinds + `crm_create_lead` carrying systemId). "could confirm" = same tenant · payload.systemId = ctx.systemId · the kind's
//          permission key (crmKindAccess / crm.activity.create for crm.assist.tasks / crm.contact.create for crm_create_lead) · EVERY
//          deal/contact/company id named in the payload visible to the actor. Cancel is allowed only to someone who could confirm.
//          Expired (24 h TTL) ⇒ confirm refused + row EXPIRED. Confirm = atomic PENDING→EXECUTED claim (10 parallel ⇒ one execution).
//          crm.assist.tasks confirm ⇒ ONE TASK activity per item: dealId · ownerUserId = the deal owner · dueAt = payload dueAt.
//          crm_create_lead confirm ⇒ ONE contact (sourceDetail.via "card-scan") linked to payload.companyId when set.
//          🔴 the generic door `ai/proposals.rejectProposal(ctx, id)` (AI chat · mobile) must no longer close a CRM proposal on its own.
//        onDealWonTeamRoom(evt) · onHotLeadTeamRoom(evt)  (evt = OutboxHandler event; wired as CRM extras under `compose` for
//          `crm.deal.won` and `crm.score.threshold` band HOT) · postStaleDigest(now, { tenantIds?, systemIds? }) (daily minute-job
//          `crm.teamroom.stale`, everyMinutes 1440) — MUST honour tenantIds (the QC DB is shared)
//          channel = settings.crm.teamRooms[<teamId of the deal/contact>] = { meetingSystemId, channelId } · posted as system
//          (authorUserId starts with "system" — proposed constant "system:crm") through the MEETING facade `postSystemMessage` ·
//          body links `/crm/deals/<dealId>` or `/crm/contacts/<contactId>` · NO phone / e-mail / tax id · one message per event
//          (replay/parallel ⇒ one) · digest = one message per team channel per THAI date (not UTC) listing the team's stale OPEN deals ·
//          no mapping / mapping to a foreign or archived channel ⇒ nothing posted, WARN OpsEvent, never a throw · uiVersion 1 ⇒ nothing
//        unfurlDealLink({ tenantId }, viewer, url) → { dealId, title, stageName, valueSatang, href, … } | null  (null for another tenant,
//          another viewer's invisible deal, a non-deal URL; the card has no phone / e-mail / tax id)
//        renderKbTokens({ tenantId }, text) → text with `{{kb:<articleId>}}` replaced by the ACTIVE article body of THIS tenant, HTML-escaped;
//          unknown / inactive / foreign ⇒ "" (the CRM e-mail template renderer and `crm_draft_email` use it)
//        setTeamRoom(ctx, actor, { teamId, meetingSystemId, channelId }) — optional helper (the oracle falls back to a raw settings write)
//   B. TOOLS — 32 in `crmToolNames()`: today's 23 + crm_deals_at_risk (read) · crm_issue_quotation · crm_reports · crm_quota_progress ·
//      crm_commissions_mine · crm_stop_sequence · crm_create_record · crm_update_record · crm_create_task_card — each in the `crm` skill.
//   C. UI testids (rows in scripts/crm-ui-inventory.json): crm-ai-deal-summary · crm-ai-deal-risk · crm-ai-deal-next-step ·
//      crm-ai-deal-draft-email · crm-ai-contact-why-hot · crm-ai-contact-closing · crm-ai-company-summary · crm-ai-company-upsell ·
//      crm-ai-home-at-risk · crm-ai-at-risk-table · crm-ai-proposal-confirm · crm-ai-proposal-edit · crm-ai-proposal-cancel ·
//      crm-settings-team-room · crm-deal-unfurl-card
//
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants `qc-c34-<rand>-a|b` swept in `finally` · no drainOutbox (our
//   outbox rows are born DONE and handed to the consumers directly) · no runMinuteJobs (lease rows are global) · no real provider,
//   transport or network · the seeded shop is read, never written · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { needsRegistryRow } from "./lib/crm-testid-scan.mjs"; // ORACLE-EDIT (sweep 27 Sep, C4.1 registry policy)

const MOD_FILE = "src/lib/modules/crm/ai-bridges.ts";
const SKILLS_FILE = "src/lib/ai/skills.ts";
const INVENTORY = "scripts/crm-ui-inventory.json";
const EXPECTED = "scripts/crm-expected.json";
const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes("--force-run");
const BUILT = existsSync(MOD_FILE);
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

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — the C3.4 module is absent ⇒ SKIPPED (no DB connection)
// ═══════════════════════════════════════════════════════════════════════════════════
if (!FORCE && !BUILT) {
  console.log(`⚠️  SKIPPED — WO C3.4 not built yet (${MOD_FILE} is absent) (run with --force-run to exercise the fixtures, the leak scans of today's tools and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c34-${rand}`;
const RUN_START = new Date();

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const cut = (v: unknown, n = 220) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const thai = (s: unknown) => /[ก-๙]/.test(String(s ?? ""));
type Res = { ok: boolean; v: Any; err: string; code: string; msg: string };
const MISSING: Res = { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", msg: "" };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return MISSING;
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", msg: "" };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 140)}`, code: String(x?.code ?? x?.name ?? ""), msg };
  }
};
const refused = (r: Res) => r !== MISSING && (!r.ok || r.v?.ok === false);
const allowed = (r: Res) => r.ok && r.v?.ok !== false;
const sr = (r: Res) => (r.ok ? (r.v?.ok === false ? `no:${cut(r.v?.note ?? r.v?.code, 50)}` : "ok") : r.err === "MISSING_FUNCTION" ? "MISSING" : `threw:${r.code}`);
const ABSENT = BUILT ? "" : " · [ai-bridges ABSENT]";

// ─────────────────────────── Thai clock ───────────────────────────
const H = 3_600_000;
const DAY = 24 * H;
const BKK = 7 * H;
const NOW = new Date();
const thaiParts = (d: Date) => { const s = new Date(d.getTime() + BKK); return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate() }; };
const thaiAt = (y: number, m: number, d: number, hh = 0, mm = 0, ss = 0) => new Date(Date.UTC(y, m, d, hh, mm, ss) - BKK);
const TP = thaiParts(NOW);
const MONTH_END = thaiAt(TP.y, TP.m + 1, 1); // first instant of the next Thai month (exclusive)
const MONTH_KEY = `${TP.y}-${String(TP.m + 1).padStart(2, "0")}`;
const nextThai0900 = (d: Date) => { const p = thaiParts(d); return thaiAt(p.y, p.m, p.d + 1, 9, 0, 0); };

// ─────────────────────────── state (cleanup needs it even after a crash) ───────────────────────────
const TENANTS: string[] = [];
const USERS: string[] = [];
const NONE = `${TAG}-none`;
function validTaxId(d12: string): string { const d = d12.slice(0, 12).padEnd(12, "0"); let sum = 0; for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i); return d + String((11 - (sum % 11)) % 10); }
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
// PII of the fixture — every one must stay out of prompts, messages, cards, payloads and notes
const PHONE_X = `08${digits(8)}`;
const PHONE_FMT = `${PHONE_X.slice(0, 3)}-${PHONE_X.slice(3, 6)}-${PHONE_X.slice(6)}`;
const EMAIL_X = `pii.${rand}@mail.invalid`;
const CO_PHONE = `02${digits(7)}`;
const CO_EMAIL = `acct.${rand}@corp.invalid`;
const TAX_X = validTaxId(`0105${digits(8)}`);
const SECRET_S = `ข้อมูลอ่อนไหว${rand}`; // value of a SENSITIVE custom field of the contact
const CARD_PHONE = `09${digits(8)}`;
const CARD_EMAIL = `card.${rand}@mail.invalid`;
const PHONES = [PHONE_X, CO_PHONE];
const EMAILS = [EMAIL_X, CO_EMAIL];
/** PII detector — separators stripped so 081-234-5678 / (081) 234 5678 / +66 81 234 5678 are all caught */
const piiHits = (raw: string, opts: { card?: boolean } = {}): string[] => {
  const t = String(raw ?? "");
  const norm = t.replace(/[\s\-().]/g, "");
  const hits: string[] = [];
  for (const p of [...PHONES, ...(opts.card ? [CARD_PHONE] : [])]) if (norm.includes(p) || norm.includes(`66${p.slice(1)}`)) hits.push(`phone:${p}`);
  for (const e of [...EMAILS, ...(opts.card ? [CARD_EMAIL] : [])]) if (t.toLowerCase().includes(e.toLowerCase())) hits.push(`email:${e}`);
  if (norm.includes(TAX_X)) hits.push("taxId");
  if (t.includes(SECRET_S)) hits.push("sensitiveField");
  return hits;
};
// krabi leak tokens (never passed as an argument, so any appearance is a leak)
const SECRET_K = `กระบี่ลับ${rand}`;
const KT_DEAL = `KTDEAL${rand}`;
const KT_CONTACT = `KTPERSON${rand}`;
const KT_COMPANY = `KTFIRM${rand}`;
const KT_ACT = `KTCALL${rand}`;
// markers of the fake provider
const MK = `MK${rand}`;
const MKN = `MKNEXT${rand}`;
const MKS = `MKSUBJ${rand}`;
const KBW = `วาฬ${rand}`; // a word only the fixture deal and the fixture KB articles share
const KBM = (n: number) => `KBM${n}x${rand}`;
const KB_OFF = `KBOFF${rand}`;
const KB_FOREIGN = `KBFOREIGN${rand}`;
const UPSELL = `สินค้าอัปเซล${rand}`;

type Cap = { tag: string; text: string };
const CAPS: Cap[] = [];
const REPLY = JSON.stringify({ text: `สรุปให้แล้ว ${MK}`, summary: `สรุปให้แล้ว ${MK}`, nextStep: `โทรนัดเดโม ${MKN}`, subject: `ติดตามข้อเสนอ ${MKS}`, body: `เรียนลูกค้า ${MK}`, message: `ข้อความปิดการขาย ${MK}` });
const fakeAi = (tag: string, reply: string = REPLY) => ({
  chat: async (messages: Any[]) => {
    CAPS.push({ tag, text: j(messages) });
    if (tag.startsWith("throw")) throw new Error("provider unavailable (qc fake)");
    return { text: reply, tokensIn: 1200, tokensOut: 300, model: "anthropic/claude-haiku-4.5" };
  },
});

console.log(`\n═══ QC CRM v2 · C3.4 — MEETING/KB bridges · in-page AI · tools → 32 ═══`);
console.log(`[env] DB ${host} · tag ${TAG} · Thai month ${MONTH_KEY}${FORCE && !BUILT ? " · --force-run with ai-bridges ABSENT (C3.4 checks expected red; fixtures + today's tool scans + CLEAN green)" : ""}\n`);

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // modules (dynamic — the builder's files may not exist yet)
  // ═════════════════════════════════════════════════════════════════════════════
  let aiErr = "";
  const AI = (await import("@/lib/modules/crm/ai-bridges" as string).catch((e: Any) => { aiErr = e instanceof Error ? e.message : String(e); return {}; })) as Any;
  if (aiErr && BUILT) console.log(`[warn] ai-bridges failed to import: ${cut(aiErr, 200)}`);
  const TL = (await import("@/lib/modules/crm/api/tools" as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const CL = (await import("@/lib/modules/crm/calls" as string).catch(() => ({}))) as Any;
  const PROP = (await import("@/lib/ai/proposals" as string).catch(() => ({}))) as Any;
  const OBC = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const MJ = (await import("@/lib/platform/minute-jobs" as string).catch(() => ({}))) as Any;
  const MEM = (await import("@/lib/modules/member" as string).catch(() => null)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — tenant T: units P/K · teams ภูเก็ต / กระบี่ / สาม (no room) / สี่ (room of ANOTHER tenant) · CRM S (v2) + SV (v1) · MEETING M ·
  //         tenant TB: CRM SB + MEETING MB (foreign rows) — rows written RAW (the fixture must not depend on the code under test)
  // ═════════════════════════════════════════════════════════════════════════════
  const T = (await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } })).id as string;
  TENANTS.push(T);
  const TB = (await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } })).id as string;
  TENANTS.push(TB);
  const unitP = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `สาขาภูเก็ต ${rand}`, slug: `${TAG}-up` } })).id as string;
  const unitK = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `สาขากระบี่ ${rand}`, slug: `${TAG}-uk` } })).id as string;
  type Who = { userId: string; role: string; unitAccess: string[]; permissions: Record<string, unknown> };
  const perms = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, true]));
  const STAFF_DEFAULT = [
    "crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.company.read", "crm.company.create", "crm.company.update",
    "crm.deal.read", "crm.deal.create", "crm.deal.update", "crm.deal.move", "crm.deal.lines", "crm.deal.quote",
    "crm.activity.read", "crm.activity.create", "crm.activity.complete", "crm.activity.delete",
    "crm.email.send", "crm.email.read", "crm.sequence.enroll", "crm.record.read", "crm.record.create", "crm.record.update", "crm.report.view",
  ];
  const READ_ONLY = ["crm.contact.read", "crm.company.read", "crm.deal.read", "crm.activity.read"];
  const mkMember = async (tid: string, suffix: string, role: string, unitAccess: string[], p: Record<string, unknown>): Promise<Who> => {
    const u = await P.user.create({ data: { email: `${TAG}-${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
    USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess, permissions: p, acceptedAt: new Date() } });
    return { userId: u.id as string, role, unitAccess, permissions: p };
  };
  const owner = await mkMember(T, "owner", "OWNER", [], {});
  const manager = await mkMember(T, "manager", "MANAGER", ["*"], {});
  const thana = await mkMember(T, "thana", "STAFF", ["*"], perms(STAFF_DEFAULT));
  const nok = await mkMember(T, "nok", "STAFF", ["*"], perms(STAFF_DEFAULT));
  const reader = await mkMember(T, "reader", "STAFF", ["*"], perms(READ_ONLY));
  const ownerB = await mkMember(TB, "ownerb", "OWNER", [], {});
  const mkSys = async (tid: string, type: string, label: string) => {
    try { return (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string; } catch { return (await P.appSystem.create({ data: { tenantId: tid, type, name: `${label} ${TAG}` } })).id as string; }
  };
  const S = await mkSys(T, "CRM", "CRM");
  const SV = await mkSys(T, "CRM", "CRM รุ่นเดิม");
  const M = await mkSys(T, "MEETING", "แชททีม");
  const SB = await mkSys(TB, "CRM", "CRM ร้านบี");
  const MB = await mkSys(TB, "MEETING", "แชทร้านบี");
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  await setCrm(S, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(SV, { uiVersion: 1, bridgesEnabled: true });
  await setCrm(SB, { uiVersion: 2, bridgesEnabled: true });
  const teamP = (await P.team.create({ data: { tenantId: T, name: `ภูเก็ต ${rand}`, unitIds: [unitP] } })).id as string;
  const teamK = (await P.team.create({ data: { tenantId: T, name: `กระบี่ ${rand}`, unitIds: [unitK], leadUserId: nok.userId } })).id as string;
  const team3 = (await P.team.create({ data: { tenantId: T, name: `ทีมสาม ${rand}` } })).id as string;
  const team4 = (await P.team.create({ data: { tenantId: T, name: `ทีมสี่ ${rand}` } })).id as string;
  const teamB = (await P.team.create({ data: { tenantId: TB, name: `ทีมบี ${rand}` } })).id as string;
  for (const w of [thana, reader]) await P.teamMember.create({ data: { tenantId: T, teamId: teamP, userId: w.userId, role: "MEMBER" } });
  await P.teamMember.create({ data: { tenantId: T, teamId: teamK, userId: nok.userId, role: "LEAD" } });
  const mkChannel = async (tid: string, sys: string, name: string, by: string) =>
    (await P.meetingChannel.create({ data: { tenantId: tid, systemId: sys, name: `${name}-${rand}`, kind: "PUBLIC", createdByUserId: by } })).id as string;
  const chP = await mkChannel(T, M, "ทีมภูเก็ต", owner.userId);
  const chK = await mkChannel(T, M, "ทีมกระบี่", owner.userId);
  const chOther = await mkChannel(T, M, "ห้องอื่น", owner.userId);
  const chB = await mkChannel(TB, MB, "ร้านบี", ownerB.userId);
  // team → room mapping: the builder's helper when present, else the settings shape of the contract (settings.crm.teamRooms)
  const ownerActor = { userId: owner.userId, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const cS = { tenantId: T, systemId: S, actorUserId: owner.userId };
  const cSV = { tenantId: T, systemId: SV, actorUserId: owner.userId };
  const ROOMS: Record<string, { meetingSystemId: string; channelId: string }> = {
    [teamP]: { meetingSystemId: M, channelId: chP },
    [teamK]: { meetingSystemId: M, channelId: chK },
    [team4]: { meetingSystemId: MB, channelId: chB }, // tampered: a room of ANOTHER tenant (X1.3)
  };
  const roomSetErr: string[] = [];
  for (const [teamId, room] of Object.entries(ROOMS)) {
    const r = await call(AI.setTeamRoom, cS, ownerActor, { teamId, ...room });
    if (!r.ok && r.err !== "MISSING_FUNCTION" && teamId !== team4) roomSetErr.push(`${teamId}:${r.err}`);
  }
  await setCrm(S, { teamRooms: ROOMS }); // idempotent with the helper — guarantees the tampered team4 row too
  await setCrm(SV, { teamRooms: { [teamP]: ROOMS[teamP], [teamK]: ROOMS[teamK] } }); // v1 system has rooms too ⇒ a skip is for the v1 reason
  await setCrm(SB, { teamRooms: { [teamB]: { meetingSystemId: MB, channelId: chB } } });

  const STD = [
    { name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10 }, { name: "เจรจา", kind: "OPEN", probability: 50 },
    { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 },
  ];
  const mkPipe = async (tid: string, sys: string, name: string) => {
    const p = (await P.crmPipeline.create({
      data: { tenantId: tid, systemId: sys, name: `${name} ${TAG}`, isDefault: true, stages: { create: STD.map((s, i) => ({ tenantId: tid, systemId: sys, sortOrder: i, ...s })) } },
      include: { stages: true },
    })) as Any;
    const st = [...(p.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder);
    return { id: p.id as string, open: st[0].id as string, nego: st[1].id as string, won: st[2].id as string, names: st.map((s) => s.name as string) };
  };
  const pS = await mkPipe(T, S, "ขาย");
  const pV = await mkPipe(T, SV, "ขายรุ่นเดิม");
  const pB = await mkPipe(TB, SB, "ขายร้านบี");
  const mkParty = async (tid: string, name: string, kind: string, extra: Record<string, Any> = {}) => (await P.party.create({ data: { tenantId: tid, name, kind, ...extra } })).id as string;
  const mkCompany = async (name: string, ownerUserId: string | null, teamId: string | null, o: { sys?: string; tid?: string; taxId?: string | null; phone?: string | null; email?: string | null } = {}) =>
    (await P.crmCompany.create({ data: { tenantId: o.tid ?? T, systemId: o.sys ?? S, name, partyId: await mkParty(o.tid ?? T, name, "COMPANY"), ownerUserId, teamId, taxId: o.taxId ?? null, phone: o.phone ?? null, email: o.email ?? null } })).id as string;
  const mkContact = async (name: string, ownerUserId: string | null, teamId: string | null, o: { companyId?: string | null; sys?: string; tid?: string; phone?: string | null; email?: string | null; score?: number; band?: string | null } = {}) => {
    const tid = o.tid ?? T;
    const partyId = await mkParty(tid, name, "PERSON", o.phone ? { phone: o.phone } : {});
    const id = (await P.crmContact.create({ data: {
      tenantId: tid, systemId: o.sys ?? S, name, firstName: name, phone: o.phone ?? null, email: o.email ?? null, partyId, ownerUserId, teamId, companyId: o.companyId ?? null,
      score: o.score ?? 0, scoreBand: o.band ?? null,
    } })).id as string;
    if (o.companyId) await P.crmCompanyContact.create({ data: { tenantId: tid, companyId: o.companyId, contactId: id, role: "OTHER", isPrimary: true } });
    return id;
  };
  type DealIn = {
    title: string; contactId: string; ownerUserId: string | null; teamId: string | null; companyId?: string | null; sys?: string; tid?: string;
    pipe?: typeof pS; stage?: "open" | "nego" | "won"; valueSatang?: number; expectedCloseAt?: Date | null; stalledAt?: Date | null; lastActivityAt?: Date | null;
    nextActivityAt?: Date | null; forecast?: string; archivedAt?: Date | null; stageEnteredAt?: Date;
  };
  const DEAL_TITLES: Record<string, string> = {};
  const mkDeal = async (d: DealIn) => {
    const pipe = d.pipe ?? pS;
    const tid = d.tid ?? T;
    const stageKey = d.stage ?? "open";
    const kind = stageKey === "won" ? "WON" : "OPEN";
    const row = await P.crmDeal.create({ data: {
      tenantId: tid, systemId: d.sys ?? S, pipelineId: pipe.id, stageId: pipe[stageKey], contactId: d.contactId, companyId: d.companyId ?? null, title: d.title,
      valueSatang: d.valueSatang ?? 100_000, kind, ownerUserId: d.ownerUserId, teamId: d.teamId, collaboratorUserIds: [],
      expectedCloseAt: d.expectedCloseAt ?? null, stalledAt: d.stalledAt ?? null, lastActivityAt: d.lastActivityAt ?? null, nextActivityAt: d.nextActivityAt ?? null,
      forecastCategory: d.forecast ?? "COMMIT", archivedAt: d.archivedAt ?? null, stageEnteredAt: d.stageEnteredAt ?? new Date(NOW.getTime() - 2 * DAY),
      closedAt: kind === "WON" ? new Date(NOW.getTime() - H) : null,
    } });
    await P.crmDealStageHistory.create({ data: { tenantId: tid, dealId: row.id, toStageId: pipe[stageKey] } });
    DEAL_TITLES[row.id] = d.title;
    return row.id as string;
  };
  const rawAct = async (data: Record<string, Any>, tid = T, sys = S) =>
    (await P.crmActivity.create({ data: { tenantId: tid, systemId: sys, type: "CALL", startAt: new Date(NOW.getTime() - DAY), ...data } })).id as string;

  // companies + contacts
  const coP = await mkCompany(`บริษัทภูเก็ตทัวร์ ${rand}`, thana.userId, teamP, { taxId: TAX_X, phone: CO_PHONE, email: CO_EMAIL });
  const coUp = await mkCompany(`บริษัทลูกค้าประจำ ${rand}`, owner.userId, teamP);
  const coK = await mkCompany(`บริษัท${SECRET_K} ${KT_COMPANY}`, nok.userId, teamK);
  const coV = await mkCompany(`บริษัทรุ่นเดิม ${rand}`, owner.userId, teamP, { sys: SV });
  const coB = await mkCompany(`บริษัทร้านบี ${rand}`, ownerB.userId, teamB, { sys: SB, tid: TB });
  const kP = await mkContact(`คุณวรรณา ${rand}`, thana.userId, teamP, { companyId: coP, phone: PHONE_X, email: EMAIL_X, score: 85, band: "HOT" });
  const kUp = await mkContact(`คุณประจำ ${rand}`, owner.userId, teamP, { companyId: coUp });
  const kHot = await mkContact(`คุณร้อนแรง ${rand}`, thana.userId, teamP, { score: 90, band: "HOT" });
  const kK = await mkContact(`คุณ${SECRET_K} ${KT_CONTACT}`, nok.userId, teamK, { companyId: coK });
  const k3 = await mkContact(`คุณทีมสาม ${rand}`, owner.userId, team3);
  const kV = await mkContact(`คุณรุ่นเดิม ${rand}`, owner.userId, teamP, { sys: SV, companyId: coV });
  const kB = await mkContact(`คุณร้านบี ${rand}`, ownerB.userId, teamB, { sys: SB, tid: TB });
  // deals — the at-risk set of this Thai month is fixed by construction (expected values computed here, not by the code under test)
  const inMonth = new Date(MONTH_END.getTime() - 60_000);
  const fresh = { lastActivityAt: new Date(NOW.getTime() - H), nextActivityAt: new Date(NOW.getTime() + DAY), stalledAt: null, forecast: "COMMIT" };
  const staleF = { lastActivityAt: new Date(NOW.getTime() - 21 * DAY), nextActivityAt: new Date(NOW.getTime() + DAY), stalledAt: new Date(NOW.getTime() - 2 * DAY), forecast: "COMMIT", stageEnteredAt: new Date(NOW.getTime() - 30 * DAY) };
  const dMain = await mkDeal({ title: `แพ็กเกจดำน้ำ ${KBW} ทริปบริษัท`, contactId: kP, companyId: coP, ownerUserId: thana.userId, teamId: teamP, stage: "nego", valueSatang: 22_800_000, expectedCloseAt: inMonth, ...fresh });
  const D1 = await mkDeal({ title: `คอร์สกู้ภัย ${rand} นิ่งนาน`, contactId: kP, companyId: coP, ownerUserId: thana.userId, teamId: teamP, valueSatang: 15_200_000, expectedCloseAt: inMonth, ...staleF });
  const D2 = await mkDeal({ title: `ทริปทีมบิลดิ้ง ${rand} เลยกำหนด`, contactId: kP, companyId: coP, ownerUserId: thana.userId, teamId: teamP, valueSatang: 8_500_000, expectedCloseAt: new Date(NOW.getTime() - 3 * DAY), ...fresh });
  const D4 = await mkDeal({ title: `ดีลเดือนหน้า ${rand} นิ่ง`, contactId: kP, ownerUserId: thana.userId, teamId: teamP, expectedCloseAt: new Date(MONTH_END.getTime() + 10 * DAY), ...staleF });
  const D5 = await mkDeal({ title: `ดีล${SECRET_K} ${KT_DEAL}`, contactId: kK, companyId: coK, ownerUserId: nok.userId, teamId: teamK, valueSatang: 7_000_000, expectedCloseAt: inMonth, ...staleF });
  const D6 = await mkDeal({ title: `ดีลชนะแต่นิ่ง ${rand}`, contactId: kP, ownerUserId: thana.userId, teamId: teamP, stage: "won", expectedCloseAt: inMonth, ...staleF });
  const D7 = await mkDeal({ title: `ดีลเก็บแล้ว ${rand}`, contactId: kP, ownerUserId: thana.userId, teamId: teamP, expectedCloseAt: inMonth, ...staleF, archivedAt: new Date(NOW.getTime() - DAY) });
  const dUp = await mkDeal({ title: `ดีลซื้อซ้ำ ${rand}`, contactId: kUp, companyId: coUp, ownerUserId: owner.userId, teamId: teamP, stage: "won", valueSatang: 5_000_000 });
  await P.crmDealLine.create({ data: { tenantId: T, dealId: dUp, name: UPSELL, qty: 2, unitPriceSatang: 2_500_000 } });
  await P.crmDealLine.create({ data: { tenantId: T, dealId: dMain, name: `คอร์สดำน้ำ ${KBW}`, qty: 15, unitPriceSatang: 1_520_000 } });
  const dWonP = await mkDeal({ title: `ปิดได้ภูเก็ต ${rand}`, contactId: kP, companyId: coP, ownerUserId: thana.userId, teamId: teamP, stage: "won", valueSatang: 12_300_000 });
  const dWonK = await mkDeal({ title: `ปิดได้${SECRET_K} ${KT_DEAL}`, contactId: kK, companyId: coK, ownerUserId: nok.userId, teamId: teamK, stage: "won" });
  const dWon3 = await mkDeal({ title: `ปิดได้ทีมสาม ${rand}`, contactId: k3, ownerUserId: owner.userId, teamId: team3, stage: "won" });
  const dWon4 = await mkDeal({ title: `ปิดได้ทีมสี่ ${rand}`, contactId: k3, ownerUserId: owner.userId, teamId: team4, stage: "won" });
  const dWonNT = await mkDeal({ title: `ปิดได้ไม่มีทีม ${rand}`, contactId: k3, ownerUserId: owner.userId, teamId: null, stage: "won" });
  const dV1 = await mkDeal({ title: `ดีลรุ่นเดิม ${rand}`, contactId: kV, companyId: coV, ownerUserId: owner.userId, teamId: teamP, sys: SV, pipe: pV, expectedCloseAt: inMonth, ...staleF });
  const dWonV1 = await mkDeal({ title: `ปิดได้รุ่นเดิม ${rand}`, contactId: kV, ownerUserId: owner.userId, teamId: teamP, sys: SV, pipe: pV, stage: "won" });
  const dB = await mkDeal({ title: `ดีลร้านบี ${rand}`, contactId: kB, companyId: coB, ownerUserId: ownerB.userId, teamId: teamB, sys: SB, tid: TB, pipe: pB });
  const aMain = await rawAct({ title: `โทรคุยแพ็กเกจ ${rand}`, ownerUserId: thana.userId, dealId: dMain, contactId: kP, body: `ลูกค้าขอให้โทรกลับ ${PHONE_FMT} หรืออีเมล ${EMAIL_X} เรื่องเลขภาษี ${TAX_X}` });
  const aK = await rawAct({ title: `โทร${SECRET_K} ${KT_ACT}`, ownerUserId: nok.userId, dealId: D5, contactId: kK });
  // sensitive custom field on the contact (through the accepted C1.2a/C1.4 services)
  const setupErr: string[] = [...roomSetErr];
  {
    const F = (MEM?.fields ?? null) as Any;
    const fctx = { ...cS, objectKey: "contact", actor: { ...ownerActor, unitAccess: ["*"] } };
    const sec = await call(F?.createSection, fctx, { key: "qcSecret", label: "ข้อมูลลับ", sensitive: true });
    const fld = sec.ok ? await call(F?.createField, fctx, { sectionId: sec.v?.id, key: "qcSecretNote", label: "บันทึกลับ", type: "TEXT", sensitive: true }) : sec;
    const upd = fld.ok ? await call(CRM?.contacts?.updateContact, cS, { ...ownerActor, unitAccess: ["*"] }, kP, { fields: { qcSecretNote: SECRET_S } }) : fld;
    if (!upd.ok) setupErr.push(`sensitive field: ${upd.err}`);
  }
  // KB (tenant T: 5 active articles sharing the deal word + 1 inactive · tenant TB: 1 foreign) + an e-mail template using {{kb:…}}
  const kbIds: string[] = [];
  for (let n = 1; n <= 5; n++) kbIds.push((await P.kbArticle.create({ data: { tenantId: T, title: `เงื่อนไข ${KBW} ข้อ ${n}`, body: `${KBM(n)} ราคารวมอุปกรณ์ · มัดจำ 30%${n === 1 ? " <img src=x onerror=alert(1)>" : ""}`, active: true } })).id as string);
  const kbOff = (await P.kbArticle.create({ data: { tenantId: T, title: `เงื่อนไข ${KBW} เก่า`, body: `${KB_OFF} เลิกใช้แล้ว`, active: false } })).id as string;
  const kbForeign = (await P.kbArticle.create({ data: { tenantId: TB, title: `เงื่อนไข ${KBW} ร้านบี`, body: `${KB_FOREIGN} ของร้านอื่น`, active: true } })).id as string;
  const tpl = (await P.crmEmailTemplate.create({ data: { tenantId: T, systemId: S, name: `แม่แบบ ${TAG}`, subject: "ข้อมูลแพ็กเกจ", bodyHtml: `<p>เรียนลูกค้า</p>{{kb:${kbIds[0]}}}|{{kb:${kbForeign}}}|{{kb:${kbOff}}}|{{kb:${NONE}}}` } })).id as string;
  // AI credit — a funded wallet (CRM_ASSIST charges are counted on it)
  const fund = (micro: number) => P.aiCreditWallet.upsert({ where: { tenantId: T }, create: { tenantId: T, balanceMicro: micro, grantedAt: new Date() }, update: { balanceMicro: micro, grantedAt: new Date() } });
  await fund(50_000_000);
  const charges = async () => (await P.aiCreditTxn.count({ where: { tenantId: T, kind: "USAGE", source: "CRM_ASSIST" } })) as number;
  const proposalsIn = async (since: Date) => (await P.aiProposal.findMany({ where: { tenantId: T, createdAt: { gte: since } }, orderBy: { createdAt: "asc" } })) as Any[];
  const msgs = async (ch: string) => (await P.meetingMessage.findMany({ where: { channelId: ch }, orderBy: { createdAt: "asc" } })) as Any[];
  const mkEvt = async (tid: string, sys: string, type: string, key: string, payload: Record<string, unknown>) => {
    // born DONE: no drainer of another session ever picks it up · handed to the consumers directly
    const row = await P.outboxEvent.create({ data: { tenantId: tid, systemId: sys, type, idempotencyKey: key, payload, status: "DONE", processedAt: new Date() } });
    return { id: row.id as string, tenantId: tid, type, payload, systemId: sys, unitId: null };
  };
  let logSeq = 0;
  const wonEvt = async (dealId: string, sys = S, tid = T) => {
    const d = (await P.crmDeal.findUnique({ where: { id: dealId } })) as Any;
    const hist = (await P.crmDealStageHistory.findFirst({ where: { dealId }, orderBy: { enteredAt: "desc" } }).catch(() => null)) as Any;
    return mkEvt(tid, sys, "crm.deal.won", `crm.deal.won#${dealId}#${hist?.id ?? rand}-${++logSeq}`, { dealId, contactId: d.contactId, companyId: d.companyId, partyId: null, valueSatang: d.valueSatang, ownerUserId: d.ownerUserId });
  };
  const hotEvt = async (contactId: string, band = "HOT", sys = S) => mkEvt(T, sys, "crm.score.threshold", `crm.score.threshold#${contactId}#${band}#${TAG}-${++logSeq}`, { contactId, band });
  const ctxOf = (w: Who, sys = S) => ({ tenantId: T, systemId: sys, actorUserId: w.userId });
  const viewer = (w: Who, sys = S, tid = T) => ({ tenantId: tid, systemId: sys, userId: w.userId, role: w.role, unitAccess: w.unitAccess, permissions: w.permissions });
  const assist = (w: Who, kind: string, id: string | null, tag = kind, sys = S) => call(AI.runAssist, ctxOf(w, sys), w, { kind, ...(id ? { id } : {}), now: NOW }, { ai: fakeAi(tag) });
  const pid = (r: Res) => String(r.v?.proposalId ?? "");
  const idsOf = (v: Any): string[] => {
    const arr = Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : [];
    return arr.map((x: Any) => String(x?.dealId ?? x?.id ?? "")).filter(Boolean).sort();
  };
  const itemsOf = (v: Any): Any[] => (Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : []);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
  const setupOk = setupErr.length === 0;
  chk("C3.4-SETUP.1", "[prerequisite] fixtures: two tenants · CRM v2 + v1 · MEETING workspace with the ภูเก็ต/กระบี่ rooms · four teams (one without a room, one mapped to ANOTHER tenant's room) · 16 deals whose at-risk / stale sets are fixed by construction · KB articles + a {{kb:}} template · a funded AI wallet · a SENSITIVE contact field written through the accepted services",
    setupOk, "no setup error", setupErr.join(" | ") || "-", "MINOR");
  console.log(`[setup] tenant ${T} · CRM ${S} (v2) · ${SV} (v1) · MEETING ${M} · rooms P=${chP} K=${chK} · foreign ${TB}\n`);

  // expected (independent of the code under test)
  const EXP_RISK_ALL = [D1, D2, D5].sort();
  const EXP_RISK_THANA = [D1, D2].sort();
  const EXP_RISK_NOK = [D5].sort();
  const EXP_STALE_P = [D1, D4];
  const EXP_STALE_K = [D5];

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 · X4 · X1 · X5 · U.3 — team-room notifications (MEETING bridge)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S1 · team rooms (deal won · hot lead · stale digest) ──");
  const isSystemAuthor = (m: Any) => /^system/i.test(String(m?.authorUserId ?? ""));
  const bodyOf = (arr: Any[]) => arr.map((m) => String(m.body ?? "")).join("\n");
  const cons = (OBC.consumers ?? {}) as Record<string, Any>;
  {
    const before = (await msgs(chP)).length;
    const evt = await wonEvt(dWonP);
    const e2e = await call(cons["crm.deal.won"], evt);
    const after = await msgs(chP);
    const mine = after.slice(before);
    const body = bodyOf(mine);
    chk("C3.4-S1.1", "deal won → the registered `crm.deal.won` consumer (the CRM extra under compose) posts ONE message into the room mapped to the deal's team (ภูเก็ต), authored by the system (not by a human), linking `/crm/deals/<dealId>` and naming the deal — with no phone / e-mail / tax id of the customer",
      mine.length === 1 && mine.every(isSystemAuthor) && body.includes(dWonP) && body.includes(DEAL_TITLES[dWonP]) && piiHits(body).length === 0,
      "1 system message · link + title · no PII", `consumer=${sr(e2e)} new=${mine.length} authors=${mine.map((m) => cut(m.authorUserId, 20)).join(",") || "-"} link=${body.includes(dWonP)} title=${body.includes(DEAL_TITLES[dWonP])} pii=${piiHits(body).join(",") || "-"}${ABSENT}`);
  }
  {
    const before = (await msgs(chP)).length;
    const warm = await call(cons["crm.score.threshold"], await hotEvt(kHot, "WARM"));
    const mid = (await msgs(chP)).length;
    const hot = await call(cons["crm.score.threshold"], await hotEvt(kHot, "HOT"));
    const after = await msgs(chP);
    const mine = after.slice(mid);
    const body = bodyOf(mine);
    chk("C3.4-S1.2", "hot lead → a `crm.score.threshold` event with band HOT posts ONE system message into the contact's team room linking `/crm/contacts/<contactId>` · band WARM posts nothing",
      mid === before && mine.length === 1 && mine.every(isSystemAuthor) && body.includes(kHot) && piiHits(body).length === 0,
      "WARM 0 · HOT 1", `warm=${sr(warm)}/+${mid - before} hot=${sr(hot)}/+${mine.length} link=${body.includes(kHot)}${ABSENT}`);
  }
  let digestBaseP = 0;
  let digestBaseK = 0;
  {
    digestBaseP = (await msgs(chP)).length;
    digestBaseK = (await msgs(chK)).length;
    const r = await call(AI.postStaleDigest, NOW, { tenantIds: [T] });
    const newP = (await msgs(chP)).slice(digestBaseP);
    const newK = (await msgs(chK)).slice(digestBaseK);
    const bP = bodyOf(newP);
    const bK = bodyOf(newK);
    const pOk = newP.length === 1 && EXP_STALE_P.every((d) => bP.includes(DEAL_TITLES[d])) && bP.includes(String(EXP_STALE_P.length)) && ![D5, D6, D7, dMain].some((d) => bP.includes(DEAL_TITLES[d]));
    const kOk = newK.length === 1 && EXP_STALE_K.every((d) => bK.includes(DEAL_TITLES[d])) && !EXP_STALE_P.some((d) => bK.includes(DEAL_TITLES[d]));
    chk("C3.4-S1.3", `stale digest → ONE system message per mapped team room for today's Thai date listing exactly that team's stale OPEN deals (ภูเก็ต: ${EXP_STALE_P.length} — not the WON-but-stalled, not the archived, not the fresh one · กระบี่: ${EXP_STALE_K.length}) with the count`,
      r.ok && pOk && kOk && [...newP, ...newK].every(isSystemAuthor) && piiHits(bP + bK).length === 0,
      "P 1 msg (2 deals) · K 1 msg (1 deal)", `run=${sr(r)} P=+${newP.length}:${cut(bP, 120)} K=+${newK.length}:${cut(bK, 80)}${ABSENT}`);
  }
  // X4 — replay / parallel ⇒ one message
  {
    const evt = await wonEvt(dWonK);
    const before = (await msgs(chK)).length;
    const beforeP = (await msgs(chP)).length;
    const r1 = await call(AI.onDealWonTeamRoom, evt);
    const r2 = await call(AI.onDealWonTeamRoom, evt);
    const par = await Promise.all([call(AI.onDealWonTeamRoom, evt), call(AI.onDealWonTeamRoom, evt), call(cons["crm.deal.won"], evt)]);
    const n = (await msgs(chK)).length - before;
    chk("C3.4-X4.1", "X4: the same `crm.deal.won` event handled twice in a row and three more times in parallel (direct + through the registered consumer) posts exactly ONE message (flag first, then post — H5)",
      r1.ok && r2.ok && par.every((x) => x.ok || x.err !== "MISSING_FUNCTION") && n === 1, "1 message", `first=${sr(r1)} second=${sr(r2)} parallel=${par.map(sr).join(",")} messages=+${n}${ABSENT}`);
    const nP = (await msgs(chP)).length - beforeP;
    chk("C3.4-X1.1", "X1: the krabi deal's win went ONLY to the krabi room — the ภูเก็ต room and the unrelated room got nothing",
      n === 1 && nP === 0 && (await msgs(chOther)).length === 0, "krabi only", `krabi=+${n} phuket=+${nP} other=${(await msgs(chOther)).length}${ABSENT}`);
  }
  {
    const evt = await hotEvt(kHot, "HOT");
    const before = (await msgs(chP)).length;
    const rs = await Promise.all([call(AI.onHotLeadTeamRoom, evt), call(AI.onHotLeadTeamRoom, evt)]);
    const r3 = await call(AI.onHotLeadTeamRoom, evt);
    const n = (await msgs(chP)).length - before;
    chk("C3.4-X4.2", "X4: the same hot-lead event handled twice in parallel and once more afterwards posts exactly ONE message",
      rs.every((x) => x.ok) && r3.ok && n === 1, "1 message", `parallel=${rs.map(sr).join(",")} again=${sr(r3)} messages=+${n}${ABSENT}`);
  }
  {
    const bP = (await msgs(chP)).length;
    const bK = (await msgs(chK)).length;
    const rs = await Promise.all([call(AI.postStaleDigest, NOW, { tenantIds: [T] }), call(AI.postStaleDigest, new Date(NOW.getTime() + 1500), { tenantIds: [T] })]);
    const nP = (await msgs(chP)).length - bP;
    const nK = (await msgs(chK)).length - bK;
    chk("C3.4-X4.3", "X4: two overlapping digest runs on the same Thai day (after S1.3 already posted) add NOTHING — one digest per team room per day",
      rs.every((x) => x.ok) && nP === 0 && nK === 0 && digestBaseP >= 0, "+0 · +0", `runs=${rs.map(sr).join(",")} P=+${nP} K=+${nK}${ABSENT}`);
  }
  {
    const warn0 = (await P.opsEvent.count({ where: { tenantId: T, level: "WARN" } })) as number;
    const all0 = (await Promise.all([chP, chK, chOther].map(msgs))).reduce((s, a) => s + a.length, 0);
    const r3 = await call(AI.onDealWonTeamRoom, await wonEvt(dWon3));
    const rNT = await call(AI.onDealWonTeamRoom, await wonEvt(dWonNT));
    const e2e = await call(cons["crm.deal.won"], await wonEvt(dWon3));
    const all1 = (await Promise.all([chP, chK, chOther].map(msgs))).reduce((s, a) => s + a.length, 0);
    const warns = (await P.opsEvent.findMany({ where: { tenantId: T, level: "WARN" } })) as Any[];
    chk("C3.4-X1.2", "X1: a team with NO room (and a deal with no team) → nothing posted anywhere, a WARN OpsEvent for the shop (ids only), and the consumer returns normally — a missing room never becomes an error that starves the main `crm.deal.won` consumer",
      r3.ok && rNT.ok && e2e.ok && all1 === all0 && warns.length > warn0 && warns.every((w) => piiHits(`${w.message} ${w.detail ?? ""}`).length === 0) && BUILT,
      "0 posts · WARN · no throw", `team3=${sr(r3)} noTeam=${sr(rNT)} consumer=${sr(e2e)} posts=+${all1 - all0} warns=+${warns.length - warn0}${ABSENT}`);
  }
  {
    const bB = (await msgs(chB)).length;
    const r4 = await call(AI.onDealWonTeamRoom, await wonEvt(dWon4));
    const nB = (await msgs(chB)).length - bB;
    chk("C3.4-X1.3", "X1: a room mapping that points at ANOTHER tenant's MEETING channel (tampered settings) is refused — nothing lands in the foreign channel and the consumer does not throw",
      r4.ok && nB === 0 && BUILT, "0 in foreign room", `consumer=${sr(r4)} foreign=+${nB}${ABSENT}`);
  }
  // X5 — daily job, Thai clock slot, jittered start, failed post
  {
    const st = await call(MJ.getMinuteJobStatus, ["crm.teamroom.stale"]);
    const row = Array.isArray(st.v) ? (st.v as Any[]).find((x) => x?.name === "crm.teamroom.stale") : null;
    const src = read("src/lib/platform/minute-jobs.ts");
    const at = src.indexOf("crm.teamroom.stale");
    const daily = at >= 0 && /cadence:\s*"daily"/.test(src.slice(at, at + 400));
    chk("C3.4-X5.1", "X5: the stale digest is a registered DAILY minute-job `crm.teamroom.stale` (everyMinutes 1440 · cadence daily) — no route, no vercel.json entry (R-C.6)",
      Number(row?.everyMinutes) === 1440 && daily, "1440 · daily", `status=${cut(j(row), 120)} daily=${daily}`);
  }
  {
    const bP = (await msgs(chP)).length;
    // 06:30 +07 of today = 23:30Z of yesterday · 07:30 +07 = 00:30Z today — a UTC-keyed flag posts twice here
    const a = await call(AI.postStaleDigest, thaiAt(TP.y, TP.m, TP.d, 6, 30), { tenantIds: [T] });
    const b = await call(AI.postStaleDigest, thaiAt(TP.y, TP.m, TP.d, 7, 30), { tenantIds: [T] });
    const sameDay = (await msgs(chP)).length - bP;
    const c = await call(AI.postStaleDigest, thaiAt(TP.y, TP.m, TP.d + 1, 6, 30), { tenantIds: [T] });
    const nextDay = (await msgs(chP)).length - bP - sameDay;
    chk("C3.4-X5.2", "X5: the digest slot is the THAI calendar day — 06:30 and 07:30 +07:00 of today (two different UTC dates) add nothing after today's digest, and 06:30 +07:00 tomorrow adds exactly one",
      a.ok && b.ok && c.ok && sameDay === 0 && nextDay === 1, "today +0 · tomorrow +1", `runs=${[a, b, c].map(sr).join(",")} today=+${sameDay} tomorrow=+${nextDay}${ABSENT}`);
  }
  {
    const bP = (await msgs(chP)).length;
    const bK = (await msgs(chK)).length;
    // jittered start: a runner that fires a few seconds / minutes after Thai midnight, twice at once, plus a late run of the previous day
    const rs = await Promise.all([
      call(AI.postStaleDigest, thaiAt(TP.y, TP.m, TP.d + 2, 0, 0, 5), { tenantIds: [T] }),
      call(AI.postStaleDigest, thaiAt(TP.y, TP.m, TP.d + 2, 0, 7, 40), { tenantIds: [T] }),
    ]);
    const late = await call(AI.postStaleDigest, thaiAt(TP.y, TP.m, TP.d + 1, 23, 59, 50), { tenantIds: [T] });
    const nP = (await msgs(chP)).length - bP;
    const nK = (await msgs(chK)).length - bK;
    chk("C3.4-X5.3", "X5: jittered start — two overlapping runs just after Thai midnight (00:00:05 and 00:07:40) post ONE digest per room for that day, and a late run at 23:59:50 of the previous day posts nothing new",
      rs.every((x) => x.ok) && late.ok && nP === 1 && nK === 1, "P +1 · K +1", `runs=${rs.map(sr).join(",")} late=${sr(late)} P=+${nP} K=+${nK}${ABSENT}`);
  }
  {
    await P.meetingChannel.update({ where: { id: chK }, data: { archivedAt: new Date() } });
    const bP = (await msgs(chP)).length;
    const bK = (await msgs(chK)).length;
    const r1 = await call(AI.postStaleDigest, thaiAt(TP.y, TP.m, TP.d + 3, 8, 0), { tenantIds: [T] });
    const k1 = (await msgs(chK)).length - bK;
    await P.meetingChannel.update({ where: { id: chK }, data: { archivedAt: null } });
    const r2 = await call(AI.postStaleDigest, thaiAt(TP.y, TP.m, TP.d + 3, 9, 0), { tenantIds: [T] });
    const nP = (await msgs(chP)).length - bP;
    const nK = (await msgs(chK)).length - bK;
    chk("C3.4-X5.4", "X5 (crash after claim): a post that FAILS (the krabi room is archived) leaves no flag — the run does not throw, and a later run on the same Thai day posts the krabi digest exactly once while ภูเก็ต still has one",
      r1.ok && r2.ok && k1 === 0 && nK === 1 && nP === 1, "K 0 then 1 · P 1", `runs=${sr(r1)},${sr(r2)} kWhileArchived=+${k1} K=+${nK} P=+${nP}${ABSENT}`);
  }
  {
    const bP = (await msgs(chP)).length;
    const w = await call(AI.onDealWonTeamRoom, await wonEvt(dWonV1, SV));
    const h = await call(AI.onHotLeadTeamRoom, await hotEvt(kV, "HOT", SV));
    const n = (await msgs(chP)).length - bP;
    const digestBody = bodyOf((await msgs(chP)).filter((m) => isSystemAuthor(m)));
    chk("C3.4-U.3", "uiVersion 1 (R-E.14): a won deal and a hot lead of the v1 system post nothing (its teams HAVE rooms), and no digest ever listed the v1 system's stale deal",
      w.ok && h.ok && n === 0 && !digestBody.includes(DEAL_TITLES[dV1]) && BUILT, "0 posts", `won=${sr(w)} hot=${sr(h)} posts=+${n} v1InDigest=${digestBody.includes(DEAL_TITLES[dV1])}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 · X10 — unfurl
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · unfurl ──");
  const urlOf = (sys: string, id: string, abs = true) => `${abs ? "https://shark.in.th" : ""}/app/sys/${sys}/crm/deals/${id}`;
  {
    const a = await call(AI.unfurlDealLink, { tenantId: T }, ownerActor, urlOf(S, dMain));
    const b = await call(AI.unfurlDealLink, { tenantId: T }, ownerActor, urlOf(S, dMain, false));
    const card = a.v ?? {};
    const deal = (await P.crmDeal.findUnique({ where: { id: dMain } })) as Any;
    chk("C3.4-S2.1", "unfurl: a deal link (absolute or relative) pasted in a room becomes a card { title, stageName, valueSatang, href → the deal } equal to the database row — and the card carries no phone / e-mail / tax id",
      a.ok && b.ok && card.title === deal.title && String(card.stageName ?? "") === pS.names[1] && Number(card.valueSatang) === Number(deal.valueSatang) && String(card.href ?? "").includes(dMain) && b.v?.title === deal.title && piiHits(j(card)).length === 0,
      "card = row · no PII", `abs=${sr(a)} rel=${sr(b)} card=${cut(j(card), 160)}${ABSENT}`);
  }
  {
    const thanaActor = thana;
    const foreign = await call(AI.unfurlDealLink, { tenantId: T }, ownerActor, urlOf(SB, dB));
    const mixed = await call(AI.unfurlDealLink, { tenantId: T }, ownerActor, urlOf(S, dB));
    const krabi = await call(AI.unfurlDealLink, { tenantId: T }, thanaActor, urlOf(S, D5));
    const junk = await call(AI.unfurlDealLink, { tenantId: T }, ownerActor, "https://evil.invalid/app/sys/x/crm/deals/y");
    const ctl = await call(AI.unfurlDealLink, { tenantId: T }, thanaActor, urlOf(S, D1));
    const nul = (r: Res) => r.ok && (r.v === null || r.v === undefined);
    chk("C3.4-X10.1", "X10/X1: unfurl refuses — another tenant's deal link → null · our system id with a foreign deal id → null · a krabi deal for thana → null · a non-deal URL → null — while thana's own ภูเก็ต deal still unfurls (positive control) and no refusal leaks a title",
      nul(foreign) && nul(mixed) && nul(krabi) && nul(junk) && ctl.ok && ctl.v?.title === DEAL_TITLES[D1] && !j([foreign, mixed, krabi]).includes(KT_DEAL),
      "4 × null · control card", `foreign=${sr(foreign)}:${cut(j(foreign.v), 40)} mixed=${cut(j(mixed.v), 40)} krabi=${cut(j(krabi.v), 40)} junk=${cut(j(junk.v), 30)} control=${cut(ctl.v?.title, 40)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 · S7 · X3 · X9 — at-risk tool + home proposal · visibility · permission matrix
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · at-risk deals (tool + proposal) · S7 visibility · X3 · X9 ──");
  const names: string[] = (() => { try { return typeof TL.crmToolNames === "function" ? (TL.crmToolNames() as string[]) : []; } catch { return []; } })();
  const NEW_TOOLS = ["crm_deals_at_risk", "crm_issue_quotation", "crm_reports", "crm_quota_progress", "crm_commissions_mine", "crm_stop_sequence", "crm_create_record", "crm_update_record", "crm_create_task_card"];
  {
    const skills = read(SKILLS_FILE);
    const missing = NEW_TOOLS.filter((t) => !names.includes(t));
    const notInSkill = names.filter((t) => !skills.includes(`"${t}"`));
    const dup = names.filter((t, i) => names.indexOf(t) !== i);
    const info = (() => { try { return (TL.crmToolInfos?.() as Any[]).find((x) => x.name === "crm_deals_at_risk"); } catch { return null; } })();
    chk("C3.4-S3.1", `the registry reaches 32 tools: today's ${names.length} + the C3.4 set (${NEW_TOOLS.join(" · ")}) — no duplicate, every one has a home in the \`crm\` skill, and crm_deals_at_risk is a READ tool`,
      names.length === 32 && missing.length === 0 && notInSkill.length === 0 && dup.length === 0 && info?.write === false,
      "32 · in skill · at-risk read", `count=${names.length} missing=${missing.join(",") || "-"} notInSkill=${notInSkill.join(",") || "-"} dup=${dup.join(",") || "-"} atRiskWrite=${info?.write}`);
  }
  const run = TL.runCrmTool as Any;
  {
    const r = await call(run, viewer(owner), "crm_deals_at_risk", {});
    const items = itemsOf(r.v?.result);
    const got = idsOf(r.v?.result);
    const reasonsOf = (id: string) => (items.find((x) => String(x?.dealId ?? x?.id) === id)?.reasons ?? []).map(String);
    chk("C3.4-S3.2", `crm_deals_at_risk (owner, Thai month ${MONTH_KEY}) answers EXACTLY the fixture's at-risk set — the stale deal (reason STALE), the overdue-close deal (CLOSE_OVERDUE) and the krabi stale deal — and not the fresh deal, next month's stale deal, the WON-but-stalled deal or the archived one`,
      r.ok && r.v?.mode === "read" && sameSet(got, EXP_RISK_ALL) && reasonsOf(D1).includes("STALE") && reasonsOf(D2).includes("CLOSE_OVERDUE"),
      "{D1 STALE · D2 CLOSE_OVERDUE · D5}", `mode=${r.v?.mode}:${cut(r.v?.error, 60)} got=${got.map((x) => DEAL_TITLES[x] ?? x).join(" | ") || "-"} D1=${reasonsOf(D1).join("/")} D2=${reasonsOf(D2).join("/")}`);
  }
  {
    const tT = await call(run, viewer(thana), "crm_deals_at_risk", {});
    const hN = await assist(nok, "home.atRisk", null, "home.atRisk:nok");
    const svc = await call(AI.atRiskDeals, ctxOf(thana), thana, { now: NOW });
    chk("C3.4-S7.1", "visibility in AI: the SAME question asked by thana (STAFF ภูเก็ต) answers only the ภูเก็ต at-risk deals — through the tool and through the service — and asked by nok (lead กระบี่) on the home page only the krabi one; no krabi title reaches thana",
      sameSet(idsOf(tT.v?.result), EXP_RISK_THANA) && sameSet(idsOf(svc.v), EXP_RISK_THANA) && sameSet(idsOf(hN.v?.items ?? hN.v), EXP_RISK_NOK) && !j(tT.v).includes(KT_DEAL) && !j(svc.v).includes(KT_DEAL),
      "thana {D1,D2} · nok {D5}", `thanaTool=${idsOf(tT.v?.result).map((x) => DEAL_TITLES[x] ?? x).join("|") || cut(tT.v?.error ?? tT.err, 60)} thanaSvc=${idsOf(svc.v).length} nokHome=${idsOf(hN.v?.items ?? hN.v).map((x) => DEAL_TITLES[x] ?? x).join("|") || hN.err}${ABSENT}`);
  }
  {
    const caps0 = CAPS.length;
    const ch0 = await charges();
    const t0 = new Date();
    const rs = await Promise.all(Array.from({ length: 10 }, () => call(AI.runAssist, ctxOf(thana), thana, { kind: "home.atRisk", now: NOW }, { ai: fakeAi("home.atRisk:thana") })));
    const ids = new Set(rs.filter((x) => x.ok).map(pid).filter(Boolean));
    const props = (await proposalsIn(t0)).filter((p) => p.status === "PENDING" || p.status === "EXECUTED");
    const aiCalls = CAPS.length - caps0;
    const ch = (await charges()) - ch0;
    chk("C3.4-X3.1", "X3: thana presses 'ดีลไหนเสี่ยงเดือนนี้' 10 times at once (separate calls) → every call answers the same ONE proposal, exactly one proposal row, ONE provider call and ONE CRM_ASSIST charge (flag first — the C2.4 claim pattern)",
      rs.every((x) => x.ok) && ids.size === 1 && props.length === 1 && aiCalls === 1 && ch === 1 && rs.every((x) => sameSet(idsOf(x.v?.items), EXP_RISK_THANA)),
      "1 proposal · 1 call · 1 charge", `ok=${rs.filter((x) => x.ok).length}/10 ids=${ids.size} rows=${props.length} aiCalls=${aiCalls} charges=+${ch} first=${sr(rs[0])}${ABSENT}`);
  }
  let ownerRiskPid = "";
  {
    const t0 = new Date();
    const r = await assist(owner, "home.atRisk", null, "home.atRisk:owner");
    ownerRiskPid = pid(r);
    const row = ownerRiskPid ? ((await P.aiProposal.findUnique({ where: { id: ownerRiskPid } })) as Any) : ((await proposalsIn(t0))[0] ?? null);
    const pl = row?.payload ?? {};
    const plItems = itemsOf(pl.items ?? []);
    const due = nextThai0900(row?.createdAt ? new Date(row.createdAt) : NOW).getTime();
    chk("C3.4-S3.3", "home 'ดีลไหนเสี่ยงเดือนนี้' (owner) → the table items equal the tool's answer AND one PENDING proposal `crm.assist.tasks` whose payload lists one task per at-risk deal: the deal owner as assignee and dueAt = TOMORROW 09:00 Thai time — ids only (no titles, no names, no PII)",
      r.ok && sameSet(idsOf(r.v?.items), EXP_RISK_ALL) && j(r.v).includes(MK) && row?.status === "PENDING" && String(row?.kind) === "crm.assist.tasks"
        && sameSet(plItems.map((x: Any) => String(x.dealId)), EXP_RISK_ALL) && plItems.every((x: Any) => x.ownerUserId === (x.dealId === D5 ? nok.userId : thana.userId) && new Date(x.dueAt).getTime() === due)
        && piiHits(j(pl)).length === 0 && !j(pl).includes(KT_DEAL),
      "items = tool · crm.assist.tasks · owner/tomorrow 09:00", `run=${sr(r)} items=${idsOf(r.v?.items).length} kind=${row?.kind ?? "-"} status=${row?.status ?? "-"} payload=${cut(j(pl), 180)}${ABSENT}`);
  }
  // X9 — the permission matrix
  {
    const r = await assist(manager, "home.atRisk", null, "home.atRisk:manager");
    const mp = pid(r);
    const hasK = sameSet(idsOf(r.v?.items), EXP_RISK_ALL);
    const tCancel = mp ? await call(AI.cancelProposal, ctxOf(thana), thana, mp) : MISSING;
    const tConfirm = mp ? await call(AI.confirmProposal, ctxOf(thana), thana, mp) : MISSING;
    const nCancel = mp ? await call(AI.cancelProposal, ctxOf(nok), nok, mp) : MISSING;
    const mid = mp ? ((await P.aiProposal.findUnique({ where: { id: mp } })) as Any) : null;
    const tasks = (await P.crmActivity.count({ where: { tenantId: T, type: "TASK", dealId: { in: EXP_RISK_ALL } } })) as number;
    const mCancel = mp ? await call(AI.cancelProposal, ctxOf(manager), manager, mp) : MISSING;
    const end = mp ? ((await P.aiProposal.findUnique({ where: { id: mp } })) as Any) : null;
    chk("C3.4-X9.1", "X9: the MANAGER's at-risk proposal (it names a krabi deal) — thana can neither cancel nor confirm it, nok (who cannot see the ภูเก็ต deals) cannot cancel it, it stays PENDING with no task written · the manager, who could confirm it, cancels it (REJECTED)",
      hasK && refused(tCancel) && refused(tConfirm) && refused(nCancel) && mid?.status === "PENDING" && tasks === 0 && allowed(mCancel) && end?.status === "REJECTED",
      "3 refusals · PENDING · then REJECTED", `items=${idsOf(r.v?.items).length} thanaCancel=${sr(tCancel)} thanaConfirm=${sr(tConfirm)} nokCancel=${sr(nCancel)} mid=${mid?.status ?? "-"} tasks=${tasks} managerCancel=${sr(mCancel)} end=${end?.status ?? "-"}${ABSENT}`);
  }
  {
    const r = await assist(thana, "deal.nextStep", D1, "deal.nextStep:thana");
    const bp = pid(r);
    const row0 = bp ? ((await P.aiProposal.findUnique({ where: { id: bp } })) as Any) : null;
    const ttl = row0 ? new Date(row0.expiresAt).getTime() - new Date(row0.createdAt).getTime() : -1;
    const rConfirm = bp ? await call(AI.confirmProposal, ctxOf(reader), reader, bp) : MISSING;
    const rCancel = bp ? await call(AI.cancelProposal, ctxOf(reader), reader, bp) : MISSING;
    const nCancel = bp ? await call(AI.cancelProposal, ctxOf(nok), nok, bp) : MISSING;
    const generic = bp ? await call(PROP.rejectProposal, { tenantId: T }, bp) : MISSING;
    const mid = bp ? ((await P.aiProposal.findUnique({ where: { id: bp } })) as Any) : null;
    const d1 = (await P.crmDeal.findUnique({ where: { id: D1 } })) as Any;
    const tCancel = bp ? await call(AI.cancelProposal, ctxOf(thana), thana, bp) : MISSING;
    const end = bp ? ((await P.aiProposal.findUnique({ where: { id: bp } })) as Any) : null;
    chk("C3.4-X9.2", "X9: thana's next-step proposal (`crm.deals.nextStep.set`, TTL 24 h) — a STAFF without crm.deal.update can neither confirm nor cancel it, nok (cannot see the deal) cannot cancel it, and the generic door `rejectProposal(ctx, id)` (no person) no longer closes a CRM proposal · the deal is untouched · thana, who could confirm, cancels it (REJECTED)",
      String(row0?.kind) === "crm.deals.nextStep.set" && Math.abs(ttl - DAY) <= 60_000 && refused(rConfirm) && refused(rCancel) && refused(nCancel) && ((generic.ok && generic.v === false) || (!generic.ok && generic !== MISSING)) && mid?.status === "PENDING" && !String(d1?.nextStep ?? "").includes(MKN) && allowed(tCancel) && end?.status === "REJECTED",
      "kind · 24h · 4 refusals · REJECTED", `kind=${row0?.kind ?? "-"} ttlH=${(ttl / H).toFixed(2)} readerConfirm=${sr(rConfirm)} readerCancel=${sr(rCancel)} nokCancel=${sr(nCancel)} genericReject=${generic.ok ? j(generic.v) : generic.err} mid=${mid?.status ?? "-"} thanaCancel=${sr(tCancel)} end=${end?.status ?? "-"}${ABSENT}`);
  }
  {
    const r = await assist(thana, "deal.nextStep", D2, "deal.nextStep:thana");
    const cp = pid(r);
    if (cp) await P.aiProposal.update({ where: { id: cp }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const conf = cp ? await call(AI.confirmProposal, ctxOf(thana), thana, cp) : MISSING;
    const row = cp ? ((await P.aiProposal.findUnique({ where: { id: cp } })) as Any) : null;
    const canc = cp ? await call(AI.cancelProposal, ctxOf(thana), thana, cp) : MISSING;
    const row2 = cp ? ((await P.aiProposal.findUnique({ where: { id: cp } })) as Any) : null;
    const d2 = (await P.crmDeal.findUnique({ where: { id: D2 } })) as Any;
    chk("C3.4-X9.3", "X9: a proposal older than 24 h — confirming it is refused and the row becomes EXPIRED, the deal is not written, and a later cancel does not resurrect or re-close it (stays EXPIRED)",
      !!cp && refused(conf) && row?.status === "EXPIRED" && row2?.status === "EXPIRED" && !String(d2?.nextStep ?? "").includes(MKN),
      "refused · EXPIRED · untouched", `proposal=${cp || "-"} confirm=${sr(conf)} status=${row?.status ?? "-"} cancel=${sr(canc)} after=${row2?.status ?? "-"}${ABSENT}`);
  }
  {
    const c0 = CAPS.length;
    const ch0 = await charges();
    const d = await assist(thana, "deal.summary", D5, "deal.summary:thana-krabi");
    const c = await assist(thana, "contact.whyHot", kK, "contact.whyHot:thana-krabi");
    const co = await assist(thana, "company.summary", coK, "company.summary:thana-krabi");
    const nf = (r: Res) => r !== MISSING && !r.ok && /NOT_FOUND/i.test(`${r.code} ${r.err}`);
    chk("C3.4-S7.2", "visibility in AI: thana pressing the AI buttons on a krabi deal / contact / company gets NOT_FOUND (404-not-403) — the provider is never called and nothing is charged",
      nf(d) && nf(c) && nf(co) && CAPS.length === c0 && (await charges()) === ch0 && !j([d, c, co]).includes(KT_DEAL),
      "3 × NOT_FOUND · 0 calls · 0 charges", `deal=${d.err || "ok"} contact=${c.err || "ok"} company=${co.err || "ok"} calls=+${CAPS.length - c0}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 · S6 · CR — summary / risk / next step / draft (fake provider) · KB · credit
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · in-page AI (fake provider) · S6 KB · CR credit ──");
  const capOf = (tag: string) => CAPS.filter((c) => c.tag === tag).map((c) => c.text).join("\n");
  const s4c0 = CAPS.length;
  const s4ch0 = await charges();
  {
    const r = await assist(owner, "deal.summary", dMain);
    const p = capOf("deal.summary");
    chk("C3.4-S4.1", "deal 360 'สรุปดีล' (owner) → the provider's answer comes back as text and the prompt was about THIS deal (its title and its stage are in it) — no proposal for a read-only summary",
      r.ok && j(r.v).includes(MK) && p.includes(DEAL_TITLES[dMain]) && p.includes(pS.names[1]) && !pid(r),
      "text · prompt has deal", `run=${sr(r)} text=${cut(r.v?.text, 60)} promptHasTitle=${p.includes(DEAL_TITLES[dMain])} promptHasStage=${p.includes(pS.names[1])} proposal=${pid(r) || "-"}${ABSENT}`);
  }
  {
    const risk = await assist(owner, "deal.risk", D1);
    const t0 = new Date();
    const ns = await assist(owner, "deal.nextStep", dMain);
    const np = pid(ns);
    const row = np ? ((await P.aiProposal.findUnique({ where: { id: np } })) as Any) : ((await proposalsIn(t0))[0] ?? null);
    const conf = np ? await call(AI.confirmProposal, ctxOf(owner), ownerActor, np) : MISSING;
    const deal = (await P.crmDeal.findUnique({ where: { id: dMain } })) as Any;
    chk("C3.4-S4.2", "'ทำไมเสี่ยง' answers text about the stale deal · 'เสนอ next step' never writes by itself: it creates ONE proposal `crm.deals.nextStep.set` carrying the AI's next step, and only after the owner confirms it through the CRM door does the deal's nextStep change",
      risk.ok && j(risk.v).includes(MK) && capOf("deal.risk").includes(DEAL_TITLES[D1]) && String(row?.kind) === "crm.deals.nextStep.set" && j(row?.payload).includes(MKN) && j(row?.payload).includes(dMain) && allowed(conf) && String(deal?.nextStep ?? "").includes(MKN),
      "risk text · proposal → confirmed → nextStep", `risk=${sr(risk)} kind=${row?.kind ?? "-"} payload=${cut(j(row?.payload), 100)} confirm=${sr(conf)} nextStep=${cut(deal?.nextStep, 60)}${ABSENT}`);
  }
  {
    const e0 = (await P.crmEmailMessage.count({ where: { tenantId: T } }).catch(() => 0)) as number;
    const t0 = new Date();
    const r = await assist(owner, "deal.draftEmail", dMain);
    const e1 = (await P.crmEmailMessage.count({ where: { tenantId: T } }).catch(() => 0)) as number;
    const sendProps = (await proposalsIn(t0)).filter((p) => /email|send/i.test(String(p.kind)));
    chk("C3.4-S4.3", "'ร่างอีเมลติดตาม' returns a DRAFT (subject + body from the provider) — no e-mail row, no send proposal, nothing leaves the shop",
      r.ok && (j(r.v).includes(MKS) || j(r.v).includes(MK)) && e1 === e0 && sendProps.length === 0 && !pid(r),
      "draft only", `run=${sr(r)} subject=${cut(r.v?.subject, 50)} emails=${e0}→${e1} sendProposals=${sendProps.length}${ABSENT}`);
  }
  {
    const rs: Record<string, Res> = {};
    rs.whyHot = await assist(owner, "contact.whyHot", kP);
    rs.closing = await assist(owner, "contact.closingMessage", kP);
    rs.coSummary = await assist(owner, "company.summary", coP);
    rs.upsell = await assist(owner, "company.upsell", coUp);
    const bad = Object.entries(rs).filter(([, r]) => !r.ok || !j(r.v).includes(MK)).map(([k, r]) => `${k}:${sr(r)}`);
    const up = capOf("company.upsell");
    chk("C3.4-S4.4", "contact 'ทำไมคะแนนร้อน' · 'ร่างข้อความปิดการขาย' and company 'สรุปบริษัท' · 'โอกาสต่อยอด' all answer through the provider, and the upsell prompt is grounded in the company's purchase history (the WON deal's line item is in it)",
      bad.length === 0 && up.includes(UPSELL), "4 answers · history in prompt", `bad=${bad.join(" | ") || "-"} upsellHasHistory=${up.includes(UPSELL)}${ABSENT}`);
  }
  {
    const s4calls = CAPS.length - s4c0;
    const s4ch = (await charges()) - s4ch0;
    const notes = ((await P.aiCreditTxn.findMany({ where: { tenantId: T, kind: "USAGE", source: "CRM_ASSIST" } })) as Any[]).map((t) => String(t.note ?? ""));
    chk("C3.4-CR.1", "credit: every successful AI action is charged ONCE under CRM_ASSIST — as many CRM_ASSIST USAGE rows as provider calls during S4 (8 buttons) — and every charge note is ids only (no PII)",
      s4calls >= 8 && s4ch === s4calls && notes.every((n) => piiHits(n, { card: true }).length === 0 && !/[ก-๙]{6,}/.test(n)), "charges = calls ≥ 8", `calls=${s4calls} charges=+${s4ch} notes=${cut(notes.slice(-3).join(" | "), 120)}${ABSENT}`);
  }
  {
    const c0 = CAPS.length;
    const ch0 = await charges();
    const t0 = new Date();
    const a = await call(AI.runAssist, ctxOf(owner), ownerActor, { kind: "deal.summary", id: dMain, now: NOW }, { ai: fakeAi("throw:summary") });
    const b = await call(AI.runAssist, ctxOf(owner), ownerActor, { kind: "deal.nextStep", id: dMain, now: NOW }, { ai: fakeAi("throw:nextStep") });
    const left = (await proposalsIn(t0)).filter((p) => p.status === "PENDING");
    chk("C3.4-CR.2", "credit: when the provider FAILS the action is refused with a Thai message, nothing is charged and no proposal is left behind (the next-step claim is released)",
      refused(a) && refused(b) && CAPS.length - c0 === 2 && (await charges()) === ch0 && left.length === 0 && thai(a.msg),
      "refused · 0 charge · 0 proposal", `summary=${a.err || "ok"} nextStep=${b.err || "ok"} calls=+${CAPS.length - c0} charges=+${(await charges()) - ch0} pending=${left.length}${ABSENT}`);
  }
  {
    await fund(0);
    const c0 = CAPS.length;
    const ch0 = await charges();
    const r = await assist(owner, "deal.summary", dMain, "nocredit");
    await fund(50_000_000);
    chk("C3.4-CR.3", "credit: an empty wallet → NO_CREDIT refusal before the provider is called (canSpend first) — nothing charged",
      r !== MISSING && !r.ok && /NO_CREDIT/i.test(`${r.code} ${r.err}`) && CAPS.length === c0 && (await charges()) === ch0, "NO_CREDIT · 0 calls", `run=${r.err || "ok"} calls=+${CAPS.length - c0}${ABSENT}`);
  }
  {
    const p = capOf("deal.draftEmail");
    const found = kbIds.map((_, i) => KBM(i + 1)).filter((m) => p.includes(m));
    chk("C3.4-S6.1", "KB grounding: the draft-email prompt carries 1–3 ACTIVE KB articles of this shop that match the deal's words (retrieval limit 3 of the 5 matching) — never the inactive article and never another tenant's article with the same words",
      found.length >= 1 && found.length <= 3 && !p.includes(KB_OFF) && !p.includes(KB_FOREIGN), "1..3 · no inactive · no foreign", `found=${found.length} inactive=${p.includes(KB_OFF)} foreign=${p.includes(KB_FOREIGN)}${ABSENT}`);
  }
  {
    const txt = `ก่อน {{kb:${kbIds[0]}}} | {{kb:${kbForeign}}} | {{kb:${kbOff}}} | {{kb:${NONE}}} หลัง`;
    const r = await call(AI.renderKbTokens, { tenantId: T }, txt);
    const out = String(r.v ?? "");
    const d = await call(run, viewer(owner), "crm_draft_email", { contactId: kP, templateId: tpl });
    const body = j(d.v?.result ?? d.v);
    chk("C3.4-S6.2", "`{{kb:<articleId>}}` in templates: renderKbTokens puts in the ACTIVE article of THIS shop (HTML-escaped: the `<img onerror>` in its body is inert) and renders a foreign / inactive / unknown id as empty — and `crm_draft_email` with a template using the token returns the rendered article, no raw `{{kb:` left",
      r.ok && out.includes(KBM(1)) && !out.includes(KB_FOREIGN) && !out.includes(KB_OFF) && !out.includes("{{kb:") && !/<img src=x onerror/i.test(out) && out.startsWith("ก่อน") && d.ok && body.includes(KBM(1)) && !body.includes("{{kb:") && !body.includes(KB_FOREIGN),
      "active only · escaped · tool renders", `render=${sr(r)}:${cut(out, 120)} tool=${d.v?.mode ?? d.err}:${cut(body, 120)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — prompts · messages · cards · payloads carry no PII
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · PDPA ──");
  {
    const KINDS = ["deal.summary", "deal.risk", "deal.nextStep", "deal.draftEmail", "contact.whyHot", "contact.closingMessage", "company.summary", "company.upsell", "home.atRisk"];
    const covered = KINDS.filter((k) => CAPS.some((c) => c.tag === k || c.tag.startsWith(`${k}:`)));
    const leaks = CAPS.filter((c) => !c.tag.startsWith("card")).map((c) => ({ tag: c.tag, hits: piiHits(c.text) })).filter((x) => x.hits.length > 0);
    chk("C3.4-X8.1", "X8: every captured prompt of every in-page AI action (deal summary · why at risk · next step · draft e-mail · contact why hot · closing message · company summary · upsell · home at-risk table) contains NO phone (any format) · e-mail · tax id · sensitive-field value — although the deal's contact, company and call note are full of them",
      covered.length === KINDS.length && leaks.length === 0, "9/9 covered · 0 leaks", `covered=${covered.length}/9 missing=${KINDS.filter((k) => !covered.includes(k)).join(",") || "-"} leaks=${cut(leaks.map((l) => `${l.tag}:${l.hits.join("/")}`).join(" | "), 200) || "-"}${ABSENT}`);
  }
  {
    const all = [...(await msgs(chP)), ...(await msgs(chK))];
    const card = await call(AI.unfurlDealLink, { tenantId: T }, ownerActor, urlOf(S, dMain));
    const hits = piiHits(bodyOf(all) + j(card.v));
    chk("C3.4-X8.2", "X8: every team-room message and the unfurl card of a deal whose contact has a phone / e-mail and whose company has a tax id contain none of them",
      all.length > 0 && card.ok && hits.length === 0, "0 hits", `messages=${all.length} hits=${hits.join(",") || "-"}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — business card → lead proposal (company match · one door · credit once)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · business card → lead proposal ──");
  const img = () => ({ filename: "card.jpg", contentType: "image/jpeg", data: new Uint8Array(2048).fill(7) });
  const coPName = ((await P.crmCompany.findUnique({ where: { id: coP } })) as Any).name as string;
  const coKName = ((await P.crmCompany.findUnique({ where: { id: coK } })) as Any).name as string;
  const cardJson = (company: string, who: string) => JSON.stringify({ name: `คุณนามบัตร${who} ${rand}`, phone: CARD_PHONE, email: CARD_EMAIL, company, jobTitle: "ผจก.ฝ่ายจัดซื้อ" });
  const ch5 = await charges();
  const sOwner = await call(CL.scanBusinessCard, ctxOf(owner), ownerActor, img(), { ai: fakeAi("card:owner", cardJson(coPName, "หนึ่ง")) });
  const sThana = await call(CL.scanBusinessCard, ctxOf(thana), thana, img(), { ai: fakeAi("card:thana", cardJson(coKName, "สอง")) });
  {
    const po = sOwner.ok ? ((await P.aiProposal.findUnique({ where: { id: sOwner.v?.proposalId } })) as Any) : null;
    const pt = sThana.ok ? ((await P.aiProposal.findUnique({ where: { id: sThana.v?.proposalId } })) as Any) : null;
    chk("C3.4-S5.1", "card scan → proposal `crm_create_lead` of THIS system whose payload names the matching company the scanner can see (owner's card names the ภูเก็ต company ⇒ companyId = it) · thana's card naming the krabi company matches nothing (no companyId, no krabi id in the payload)",
      po?.kind === "crm_create_lead" && po?.payload?.systemId === S && po?.payload?.companyId === coP && pt?.kind === "crm_create_lead" && !pt?.payload?.companyId && !j(pt?.payload).includes(coK),
      "owner → coP · thana → none", `owner=${sr(sOwner)} company=${po?.payload?.companyId ?? "-"} thana=${sr(sThana)} company=${pt?.payload?.companyId ?? "-"}${ABSENT}`);
  }
  {
    const t0 = new Date();
    const id = String(sOwner.v?.proposalId ?? "");
    const rs = id ? await Promise.all([call(AI.confirmProposal, ctxOf(owner), ownerActor, id), call(AI.confirmProposal, ctxOf(owner), ownerActor, id)]) : [MISSING, MISSING];
    const made = ((await P.crmContact.findMany({ where: { tenantId: T, systemId: S, createdAt: { gte: t0 } } })) as Any[]).filter((c) => String(c.firstName ?? c.name).includes("นามบัตรหนึ่ง"));
    const link = made[0] ? ((await P.crmCompanyContact.count({ where: { contactId: made[0].id, companyId: coP } })) as number) : 0;
    chk("C3.4-S5.2", "confirming the card proposal through the CRM door (twice at once) creates exactly ONE contact in this system, marked sourceDetail.via = card-scan, linked to the matched company",
      rs.filter(allowed).length === 1 && made.length === 1 && String(made[0]?.sourceDetail?.via ?? "") === "card-scan" && (made[0]?.companyId === coP || link === 1),
      "1 contact · card-scan · coP", `confirms=${rs.map(sr).join(",")} contacts=${made.length} via=${made[0]?.sourceDetail?.via ?? "-"} company=${made[0]?.companyId ?? "-"}/link=${link}${ABSENT}`);
  }
  {
    const scans = (await charges()) - ch5;
    const c0 = CAPS.length;
    const t0 = new Date();
    const f = await call(CL.scanBusinessCard, ctxOf(owner), ownerActor, img(), { ai: fakeAi("throw:card") });
    const left = (await proposalsIn(t0)).length;
    chk("C3.4-S5.3", "card scan credit: two scans = two CRM_ASSIST charges · a provider failure = refused, no proposal, no charge",
      sOwner.ok && sThana.ok && scans === 2 && refused(f) && CAPS.length - c0 === 1 && left === 0 && (await charges()) - ch5 === 2,
      "2 charges · failure free", `charges=+${scans} failure=${f.err || "ok"} proposals=${left}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3.4 · X3.2 — confirm the owner's at-risk proposal (10 at once)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3.4 · confirm the at-risk proposal ──");
  {
    const t0 = new Date();
    const rs = ownerRiskPid ? await Promise.all(Array.from({ length: 10 }, () => call(AI.confirmProposal, ctxOf(owner), ownerActor, ownerRiskPid))) : [MISSING];
    const row = ownerRiskPid ? ((await P.aiProposal.findUnique({ where: { id: ownerRiskPid } })) as Any) : null;
    const tasks = (await P.crmActivity.findMany({ where: { tenantId: T, type: "TASK", dealId: { in: EXP_RISK_ALL }, createdAt: { gte: t0 } } })) as Any[];
    const due = row?.createdAt ? nextThai0900(new Date(row.createdAt)).getTime() : -1;
    const per = EXP_RISK_ALL.map((d) => tasks.filter((t) => t.dealId === d));
    const ownerOk = per.every((ts, i) => ts.length === 1 && ts[0].ownerUserId === (EXP_RISK_ALL[i] === D5 ? nok.userId : thana.userId) && new Date(ts[0].dueAt ?? ts[0].startAt ?? 0).getTime() === due);
    chk("C3.4-S3.4", "confirming the home proposal creates ONE follow-up TASK per at-risk deal, assigned to that deal's owner (thana ×2, nok ×1), due tomorrow 09:00 Thai time — the proposal ends EXECUTED",
      tasks.length === EXP_RISK_ALL.length && ownerOk && row?.status === "EXECUTED", "3 tasks · owners · 09:00", `tasks=${tasks.length} perDeal=${per.map((x) => x.length).join("/")} owners=${ownerOk} status=${row?.status ?? "-"}${ABSENT}`);
    chk("C3.4-X3.2", "X3: ten parallel confirms of the same proposal (separate calls) — exactly ONE executes (atomic PENDING→EXECUTED claim), nine are refused, no duplicate task",
      rs.length === 10 && rs.filter(allowed).length === 1 && tasks.length === EXP_RISK_ALL.length, "1 of 10", `allowed=${rs.filter(allowed).length}/${rs.length} tasks=${tasks.length}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // U.1 — uiVersion 1: no AI page action operates
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── U · uiVersion 1 ──");
  {
    const c0 = CAPS.length;
    const ch0 = await charges();
    const t0 = new Date();
    const rs = [
      await assist(owner, "deal.summary", dV1, "v1", SV), await assist(owner, "deal.nextStep", dV1, "v1", SV), await assist(owner, "deal.draftEmail", dV1, "v1", SV),
      await assist(owner, "contact.whyHot", kV, "v1", SV), await assist(owner, "company.summary", coV, "v1", SV), await assist(owner, "home.atRisk", null, "v1", SV),
    ];
    const risk = await call(AI.atRiskDeals, ctxOf(owner, SV), ownerActor, { now: NOW });
    chk("C3.4-U.1", "uiVersion 1 (R-E.14): every AI page action on the v1 system is refused (CRM_V2_DISABLED) — the provider is never called, nothing is charged, no proposal is created, and the at-risk service refuses too",
      rs.every((r) => r !== MISSING && !r.ok) && refused(risk) && CAPS.length === c0 && (await charges()) === ch0 && (await proposalsIn(t0)).length === 0,
      "6 refused · 0 calls", `results=${rs.map((r) => (r.ok ? "OK" : r.code || "err")).join(",")} risk=${sr(risk)} calls=+${CAPS.length - c0}${ABSENT}`);
  }
  {
    const onV1 = names.filter((n) => n !== "crm_create_lead");
    const bad: string[] = [];
    for (const n of onV1) {
      const r = await call(run, viewer(owner, SV), n, {});
      if (!r.ok || r.v?.mode !== "error") bad.push(`${n}:${r.ok ? r.v?.mode : r.err}`);
    }
    chk("C3.4-U.2", `uiVersion 1: every tool except the legacy crm_create_lead (${onV1.length} of the registry — the C3.4 ones included) answers mode "error" on the v1 system`,
      names.length > 0 && bad.length === 0 && NEW_TOOLS.every((t) => names.includes(t)), "all error", `checked=${onV1.length} bad=${cut(bad.join(" | "), 160) || "-"} newPresent=${NEW_TOOLS.filter((t) => names.includes(t)).length}/9`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X2 — the assistant acting as thana cannot surface krabi rows through ANY tool
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X2 · every tool as thana ──");
  const infos = (): Any[] => { try { return typeof TL.crmToolInfos === "function" ? (TL.crmToolInfos() as Any[]) : []; } catch { return []; } };
  const valFor = (name: string, schema: Any, map: Record<string, unknown>): unknown => {
    if (Object.prototype.hasOwnProperty.call(map, name)) return map[name];
    const s = schema ?? {};
    const alt = Array.isArray(s.anyOf) ? s.anyOf.find((x: Any) => x?.type && x.type !== "null") ?? s.anyOf[0] : null;
    const sc = alt ?? s;
    if (Array.isArray(sc.enum) && sc.enum.length) return sc.enum[0];
    if (sc.const !== undefined) return sc.const;
    const ty = Array.isArray(sc.type) ? sc.type.find((x: string) => x !== "null") : sc.type;
    if (/Id$/.test(name)) return NONE;
    if (ty === "string") return sc.format === "date-time" || /At$|Date$|^from$|^to$/.test(name) ? new Date(NOW.getTime() + DAY).toISOString() : name === "reason" ? `เหตุผลทดสอบ ${TAG}` : "qc";
    if (ty === "integer" || ty === "number") return Math.max(1, Number(sc.minimum ?? sc.exclusiveMinimum ?? 1));
    if (ty === "boolean") return false;
    if (ty === "array") return [];
    if (ty === "object") return {};
    return "qc";
  };
  const buildArgs = (info: Any, map: Record<string, unknown>) => {
    const props = (info?.parameters?.properties ?? {}) as Record<string, Any>;
    const req = new Set<string>(Array.isArray(info?.parameters?.required) ? info.parameters.required : []);
    const out: Record<string, unknown> = {};
    for (const [k, sc] of Object.entries(props)) if (req.has(k) || Object.prototype.hasOwnProperty.call(map, k)) out[k] = valFor(k, sc, map);
    return out;
  };
  const leakOf = (outcome: unknown, args: unknown, tokens: string[]) => { const o = j(outcome); const a = j(args); return tokens.filter((t) => t && o.includes(t) && !a.includes(t)); };
  const KMAP: Record<string, unknown> = {
    dealId: D5, contactId: kK, companyId: coK, activityId: aK, parentId: kK, teamId: teamK, team: teamK, owner: nok.userId, ownerUserId: nok.userId, userId: nok.userId,
    q: SECRET_K, query: SECRET_K, search: SECRET_K, text: SECRET_K, objectKey: "qcnone", stageId: pS.open, pipelineId: pS.id, month: MONTH_KEY, period: MONTH_KEY, tab: "funnel",
  };
  // write probes aim only at krabi TARGET rows (never assign owner/team — handing a new row to another team can be legitimate)
  const KMAP_TARGET: Record<string, unknown> = { dealId: D5, contactId: kK, companyId: coK, activityId: aK, parentId: kK, stageId: pS.open, pipelineId: pS.id, objectKey: "qcnone" };
  const KTOK = [KT_DEAL, KT_CONTACT, KT_COMPANY, KT_ACT, D5, dWonK, kK, coK, aK];
  {
    const all = infos();
    const leaks: string[] = [];
    const threw: string[] = [];
    for (const info of all) {
      for (const args of [buildArgs(info, KMAP), {}]) {
        const r = await call(run, viewer(thana), info.name, args);
        if (!r.ok) { threw.push(`${info.name}:${r.err}`); continue; }
        const l = leakOf(r.v, args, KTOK);
        if (l.length) leaks.push(`${info.name}(${Object.keys(args).join(",") || "∅"}):${l.map((x) => (x === KT_DEAL ? "KT_DEAL" : x === KT_CONTACT ? "KT_CONTACT" : x === KT_COMPANY ? "KT_COMPANY" : x === KT_ACT ? "KT_ACT" : `id:${x.slice(-6)}`)).join("/")}`);
      }
    }
    const ctl = await call(run, viewer(owner), "crm_search", { q: SECRET_K });
    const ctlHit = j(ctl.v).includes(KT_DEAL) || j(ctl.v).includes(KT_CONTACT) || j(ctl.v).includes(KT_COMPANY);
    chk("C3.4-X2.1", `🔴 X2 (CRITICAL): the assistant acting as thana calls EVERY tool the registry exposes at run time (${all.length} — a tool added later without a scope check is caught automatically) twice — with every id / team / owner / search argument aimed at the krabi rows, and with no argument — and no krabi deal, contact, company or activity (title, name or id it was not given) ever comes back · positive control: the owner's crm_search finds them`,
      all.length >= 23 && leaks.length === 0 && threw.length === 0 && ctlHit, "0 leaks · control finds krabi", `tools=${all.length} leaks=${cut(leaks.join(" | "), 260) || "-"} threw=${cut(threw.join(" | "), 120) || "-"} control=${ctlHit}`);
  }
  {
    const all = infos().filter((i) => i.write);
    const before = j(await P.crmDeal.findMany({ where: { id: { in: [D5, dWonK] } }, orderBy: { id: "asc" } })) + j(await P.crmContact.findUnique({ where: { id: kK } })) + j(await P.crmCompany.findUnique({ where: { id: coK } }));
    const acts0 = (await P.crmActivity.count({ where: { OR: [{ dealId: D5 }, { contactId: kK }] } })) as number;
    const skipped: string[] = [];
    const executed: string[] = [];
    const leaks: string[] = [];
    for (const info of all) {
      if (/email|send|sequence/i.test(info.name)) { skipped.push(info.name); continue; } // never risk a real send — the propose-only half of X2.1 covers them
      const args = buildArgs(info, KMAP_TARGET);
      if (!Object.keys(args).some((k) => [D5, kK, coK, aK].includes(String(args[k])))) { skipped.push(info.name); continue; } // creation tools name no krabi row
      const prop = await call(run, viewer(thana), info.name, args);
      if (!prop.ok || prop.v?.mode !== "propose") continue;
      const d = await call(TL.dispatchCrmKind, viewer(thana), prop.v.kind, prop.v.payload);
      if (d.ok) executed.push(info.name);
      const l = leakOf(d.ok ? d.v : d.msg, args, KTOK);
      if (l.length) leaks.push(`${info.name}:${l.length}`);
    }
    const after = j(await P.crmDeal.findMany({ where: { id: { in: [D5, dWonK] } }, orderBy: { id: "asc" } })) + j(await P.crmContact.findUnique({ where: { id: kK } })) + j(await P.crmCompany.findUnique({ where: { id: coK } }));
    const acts1 = (await P.crmActivity.count({ where: { OR: [{ dealId: D5 }, { contactId: kK }] } })) as number;
    chk("C3.4-X2.3", "X2: every WRITE tool thana points at a krabi row, once its proposal is 'approved' by thana, is refused by `dispatchCrmKind` (the op's own visibility — 404) — the krabi deal / contact / company rows are byte-identical and no activity was added to them; the refusal text leaks nothing",
      all.length > 0 && executed.length === 0 && leaks.length === 0 && before === after && acts0 === acts1, "0 executed · rows identical", `write=${all.length} executed=${executed.join(",") || "-"} skipped=${skipped.join(",") || "-"} changed=${before !== after} acts=${acts0}→${acts1}`);
  }
  {
    let note = "";
    let ok = false;
    try {
      // resolved by the seed CONTRACT (crm-qc-env.mts CQC: slug · e-mails · team names), not by the ids of crm-expected.json —
      //   that file is rewritten per database (QC1/QC2/QC3 hold different ids)
      const exp = JSON.parse(read(EXPECTED) || "{}") as Any;
      const CQ = ((await import("./crm-qc-env.mts" as string).catch(() => ({}))) as Any).CQC ?? {};
      const tenant = (await P.tenant.findFirst({ where: { slug: String(CQ.tenantSlug ?? "siam-dive-member-qc") } })) as Any;
      const seedT = String(tenant?.id ?? "");
      const sys = seedT ? ((await P.appSystem.findFirst({ where: { tenantId: seedT, type: "CRM" }, orderBy: { createdAt: "asc" } })) as Any) : null;
      const seedS = String(sys?.id ?? "");
      const userBy = async (email: string) => (email ? ((await P.user.findFirst({ where: { email } })) as Any) : null);
      const thanaU = await userBy(String(exp.users?.thana?.email ?? "mb-thana@shark.local"));
      const ownerU = await userBy(String(exp.users?.owner?.email ?? "mb-owner@shark.local"));
      const nokU = await userBy(String(CQ.users?.nok?.email ?? "mb-nok@shark.local"));
      const thanaId = String(thanaU?.id ?? "");
      const ownerId = String(ownerU?.id ?? "");
      const teamName = (key: string) => String(((CQ.teams ?? []) as Any[]).find((t) => t?.key === key)?.name ?? (key === "krabi" ? "ทีมขาย — กระบี่" : "ทีมขาย — ภูเก็ต"));
      const krabi = seedT ? String(((await P.team.findFirst({ where: { tenantId: seedT, name: teamName("krabi") } })) as Any)?.id ?? "") : "";
      const mem = sys && thanaId ? ((await P.membership.findFirst({ where: { userId: thanaId, tenantId: seedT } })) as Any) : null;
      if (exp.users?.nok) exp.users.nok.userId = nokU?.id ?? exp.users.nok.userId;
      else exp.users = { ...(exp.users ?? {}), nok: { userId: nokU?.id ?? NONE } };
      if (!sys || !mem || !krabi || !ownerId) {
        note = `seed missing (tenant=${!!tenant} crm=${!!sys} thana=${!!mem} owner=${!!ownerId} krabiTeam=${!!krabi}) — run seed-member-qc + seed-crm-qc`;
      } else {
        const kDeals = (await P.crmDeal.findMany({ where: { systemId: seedS, teamId: krabi }, select: { id: true, title: true, contactId: true, companyId: true }, take: 200 })) as Any[];
        const oDeals = (await P.crmDeal.findMany({ where: { systemId: seedS, NOT: { teamId: krabi } }, select: { id: true, title: true, contactId: true, companyId: true }, take: 500 })) as Any[];
        const kContacts = (await P.crmContact.findMany({ where: { systemId: seedS, teamId: krabi }, select: { id: true }, take: 200 })) as Any[];
        const kCos = (await P.crmCompany.findMany({ where: { systemId: seedS, teamId: krabi }, select: { id: true }, take: 200 })) as Any[];
        const otherText = oDeals.map((d) => d.title).join("\n");
        const usedElsewhere = new Set(oDeals.flatMap((d) => [d.contactId, d.companyId]).filter(Boolean));
        const tokens = [
          ...kDeals.map((d) => d.id),
          ...kDeals.map((d) => String(d.title ?? "")).filter((t) => t.length >= 6 && !otherText.includes(t)),
          ...kContacts.map((c) => c.id).filter((id) => !usedElsewhere.has(id)),
          ...kCos.map((c) => c.id).filter((id) => !usedElsewhere.has(id)),
        ];
        const target = kDeals.find((d) => !otherText.includes(d.title)) ?? kDeals[0];
        const seedMap: Record<string, unknown> = {
          ...KMAP, dealId: target?.id ?? NONE, contactId: kContacts.find((c) => !usedElsewhere.has(c.id))?.id ?? NONE, companyId: kCos.find((c) => !usedElsewhere.has(c.id))?.id ?? NONE,
          activityId: NONE, parentId: NONE, teamId: krabi, team: krabi, owner: exp.users?.nok?.userId ?? NONE, ownerUserId: exp.users?.nok?.userId ?? NONE, userId: exp.users?.nok?.userId ?? NONE,
          q: String(target?.title ?? "qc").slice(0, 60), query: String(target?.title ?? "qc").slice(0, 60), search: String(target?.title ?? "qc").slice(0, 60), text: String(target?.title ?? "qc").slice(0, 60),
          stageId: NONE, pipelineId: NONE,
        };
        const tv = { tenantId: seedT, systemId: seedS, userId: thanaId, role: mem.role, unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess : [], permissions: mem.permissions ?? {} };
        const leaks: string[] = [];
        let calls = 0;
        for (const info of infos()) {
          for (const args of [buildArgs(info, seedMap), {}]) {
            const r = await call(run, tv, info.name, args); // runCrmTool: reads answer, writes only PROPOSE (nothing stored) ⇒ the seed stays untouched
            calls += 1;
            const l = r.ok ? leakOf(r.v, args, tokens) : [];
            if (l.length) leaks.push(`${info.name}:${l.length}`);
          }
        }
        const ov = { tenantId: seedT, systemId: seedS, userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
        const ctl = await call(run, ov, "crm_search", { q: String(target?.title ?? "qc").slice(0, 60) });
        const ctlHit = !!target && j(ctl.v).includes(target.id);
        ok = kDeals.length > 0 && tokens.length > 0 && leaks.length === 0 && ctlHit;
        note = `krabiDeals=${kDeals.length} tokens=${tokens.length} calls=${calls} leaks=${leaks.join(",") || "-"} ownerControl=${ctlHit}`;
      }
    } catch (e) { note = `threw: ${cut(e instanceof Error ? e.message : String(e), 160)}`; }
    chk("C3.4-X2.2", "🔴 X2 on the SEEDED shop (read-only): the assistant acting as the real thana (STAFF ภูเก็ต of crm-expected.json) calls every tool aimed at the seeded krabi-team deals / contacts / companies — no krabi id or krabi-only title comes back · positive control: the seeded owner finds the target deal",
      ok, "0 leaks · control", note);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8.3 — payloads / notes / outbox rows of the run
  // ═════════════════════════════════════════════════════════════════════════════
  {
    const props = ((await P.aiProposal.findMany({ where: { tenantId: T } })) as Any[]).filter((p) => String(p.kind) !== "crm_create_lead");
    const pHits = props.flatMap((p) => piiHits(j(p.payload)).map((h) => `${p.kind}:${h}`));
    const evts = ((await P.outboxEvent.findMany({ where: { tenantId: T } })) as Any[]).filter((e) => String(e.type).startsWith("crm."));
    const eHits = evts.flatMap((e) => piiHits(j(e.payload), { card: true }).map((h) => `${e.type}:${h}`));
    const cardRejected = sThana.ok ? await call(CL.rejectLeadProposal, ctxOf(thana), thana, sThana.v?.proposalId) : MISSING;
    chk("C3.4-X8.3", "X8: the payloads of every CRM assist proposal and of every `crm.*` outbox row the run produced are ids only (no phone / e-mail / tax id / sensitive value — the team-room flags included)",
      props.length > 0 && pHits.length === 0 && eHits.length === 0, "0 hits", `proposals=${props.length} hits=${cut(pHits.join(","), 120) || "-"} events=${evts.length} hits=${cut(eHits.join(","), 120) || "-"} cardReject=${sr(cardRejected)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — visual contract (static; the PARITY verdict against mockups 14/13 stays the controller's D7)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · UI contract (static) ──");
  const uiFiles = [...walk("src/app/app/sys/[id]/crm"), ...walk("src/components/crm"), "src/lib/modules/crm/home.tsx"].filter((f) => existsSync(f));
  const uiSrc = new Map(uiFiles.map((f) => [f, read(f)]));
  const inv = (() => { try { return (JSON.parse(read(INVENTORY) || "{}").rows ?? []) as Any[]; } catch { return [] as Any[]; } })();
  const hasTid = (t: string) => [...uiSrc.values()].some((s) => s.includes(`"${t}"`) || s.includes(`'${t}'`) || s.includes(`\`${t}`));
  // ORACLE-EDIT C3.4-S8.1/S8.2/S8.3 (sweep 27 Sep, C4.1 registry policy): the registry holds interactive controls only ⇒ "has a row" is
  //   demanded for a testid on an interactive element per the F14.1 scanner (absent ⇒ strict); a non-interactive one (the at-risk <table>,
  //   row removed by C4.1) passes here only because each caller ALSO demands hasTid(t) — it must still exist in the UI source
  const allUi = [...uiSrc.values()].join("\n");
  const inInv = (t: string) => !needsRegistryRow(t, allUi) || inv.some((r) => r?.testid === t);
  {
    const BTN = ["crm-ai-deal-summary", "crm-ai-deal-risk", "crm-ai-deal-next-step", "crm-ai-deal-draft-email", "crm-ai-contact-why-hot", "crm-ai-contact-closing", "crm-ai-company-summary", "crm-ai-company-upsell", "crm-ai-home-at-risk"];
    const miss = BTN.filter((t) => !hasTid(t));
    const noInv = BTN.filter((t) => !inInv(t));
    chk("C3.4-S8.1", "the nine AI buttons exist with their testids on deal 360 (4) · contact 360 (2) · company 360 (2) · home (1) and each has a row in scripts/crm-ui-inventory.json (gate D8)",
      miss.length === 0 && noInv.length === 0, "9 · 9", `missingInSource=${miss.join(",") || "-"} missingInInventory=${noInv.join(",") || "-"}`, "MAJOR");
  }
  {
    const CARD = ["crm-ai-at-risk-table", "crm-ai-proposal-confirm", "crm-ai-proposal-edit", "crm-ai-proposal-cancel"];
    const miss = CARD.filter((t) => !hasTid(t) || !inInv(t));
    const tableFile = [...uiSrc.entries()].find(([, s]) => s.includes("crm-ai-at-risk-table"));
    const heads = ["ดีล", "บริษัท", "มูลค่า", "เหตุผล"].filter((h) => !(tableFile?.[1] ?? "").includes(h));
    const scroll = /overflow-x-auto|overflow-x-scroll/.test(tableFile?.[1] ?? "");
    chk("C3.4-S8.2", "mockup 14 (left): the at-risk table (headers ดีล · บริษัท · มูลค่า · เหตุผล…, wrapped for horizontal scroll at 390 px) and the proposal card with อนุมัติ / แก้ไข / ยกเลิก — testids in source and inventory",
      miss.length === 0 && heads.length === 0 && scroll, "4 testids · Thai headers · scroll", `missing=${miss.join(",") || "-"} headersMissing=${heads.join(",") || "-"} scroll=${scroll}`, "MAJOR");
  }
  {
    const aiUi = [...uiSrc.entries()].filter(([, s]) => /crm-ai-/.test(s));
    const clientImportsServer = aiUi.filter(([, s]) => /^\s*["']use client["']/m.test(s) && /from\s+["']@\/lib\/modules\/crm(\/ai-bridges|\/index)?["']/.test(s)).map(([f]) => f);
    const alerts = aiUi.filter(([, s]) => /\balert\(/.test(s)).map(([f]) => f);
    const action = walk("src/app/app/sys/[id]/crm/_actions").map(read).some((s) => /^\s*["']use server["']/m.test(s) && /runAssist|confirmProposal|cancelProposal/.test(s));
    const teamRoom = hasTid("crm-settings-team-room") && inInv("crm-settings-team-room");
    const unfurl = walk("src/lib/modules/meeting", /\.(ts|tsx)$/).concat(walk("src/components")).some((f) => read(f).includes("crm-deal-unfurl-card"));
    chk("C3.4-S8.3", "wiring: the AI buttons reach the server through a `\"use server\"` action file under crm/_actions (no 'use client' file imports the CRM module), no alert() in any AI surface, the team-room picker `crm-settings-team-room` is on the CRM settings page (inventory row) and the meeting room renders `crm-deal-unfurl-card`",
      aiUi.length > 0 && clientImportsServer.length === 0 && alerts.length === 0 && action && teamRoom && unfurl, "action · no alert · picker · unfurl card",
      `aiFiles=${aiUi.length} clientImports=${clientImportsServer.join(",") || "-"} alerts=${alerts.join(",") || "-"} action=${action} picker=${teamRoom} unfurlCard=${unfurl}`, "MAJOR");
  }

  // X1.4 — the digest honoured tenantIds (nothing posted by the system anywhere else during the run)
  {
    const foreign = (await P.meetingMessage.count({ where: { createdAt: { gte: RUN_START }, tenantId: { notIn: TENANTS }, authorUserId: { startsWith: "system" } } })) as number;
    chk("C3.4-X1.4", "X1: every digest run of this oracle was scoped with tenantIds — no system-authored MEETING message appeared in any OTHER tenant of the shared QC database during the run",
      foreign === 0, "0", `foreignSystemMessages=${foreign}`);
  }
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — throwaway tenants + users gone (the seeded shop was only read)
  // ═════════════════════════════════════════════════════════════════════════════
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
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
      chk("C3.4-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant (with its rooms, messages, proposals, credit rows, KB articles, outbox rows, OpsEvents) and every throwaway user is gone; the seeded shop was only read",
        left.length === 0 && tenants === 0 && users === 0, "0 rows", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users}`, "MAJOR");
    } catch (e) {
      chk("C3.4-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C3.4: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);

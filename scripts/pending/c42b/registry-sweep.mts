// C4.2 it4 (c42b) — REGISTRY SWEEP: derive every row's roles/hiddenFor for the STAFF/MANAGER personas from the REAL
// permission model (controller ruling §15: "registry hiddenFor must come from REAL permissions"), diff it against
// scripts/crm-ui-inventory.json and (with --apply) rewrite the registry.
//
//   pnpm exec tsx scripts/pending/c42b/registry-sweep.mts            # report only (READ-ONLY on QC1: Membership rows)
//   pnpm exec tsx scripts/pending/c42b/registry-sweep.mts --apply    # + write the registry (roundtrip-exact format)
//
// Truth used (never hand-typed per persona):
//   • persona keys   = QC1 Membership(role, permissions) of manager/nok/thana → the product's toMemberActor → crmCan()
//                      (src/lib/modules/crm/access.ts:72 — explicit keys · MANAGER all but CRM_OWNER_ONLY_KEYS · STAFF
//                      implicit contact/deal/activity read when holding any crm.* key)
//   • PAGE_GATES     = the page's own `crmCan(...) → notFound()` (cited file:line) or, for record pages, the visibility
//                      READ_KEY (visibility.ts:65-72 · :407 a missing read key ⇒ NOTHING ⇒ notFound())
//   • CONTROL_GATES  = the crmCan / prop gate that renders the control (cited file:line, audited 1 Oct 2026)
// Verdict per (row, persona): page gate false ⇒ HIDDEN (the page 404s) · else control gate false ⇒ HIDDEN · control gate
// true ⇒ VISIBLE · no control gate known ⇒ no claim from this script (registry kept). A persona the registry lists in
// `roles` but whose verdict is HIDDEN is moved to `hiddenFor`; an unclaimed persona on a page it cannot open gets
// `hiddenFor`; a persona in `hiddenFor` with an explicit VISIBLE verdict is moved to `roles` (reported).
// Out of scope (kept as-is): portal pages /b/* (customer realm) and rows of other modules' pages (system ≠ CRM pages
// under /app/… that are not CRM-gated).
import { readFileSync, writeFileSync } from "node:fs";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const { crmCan } = (await import("@/lib/modules/crm/access" as string)) as { crmCan: (a: unknown, k: string) => boolean };
const { toMemberActor } = (await import("@/lib/modules/member/access" as string)) as { toMemberActor: (u: string, m: unknown) => any };
const APPLY = process.argv.includes("--apply");
const REG = "scripts/crm-ui-inventory.json";
const E = JSON.parse(readFileSync(process.env.CRM_EXPECTED_PATH ?? "scripts/crm-expected.json", "utf8"));
const PERSONAS = ["manager", "nok", "thana"] as const;
type Can = (k: string) => boolean;
type Gate = { test: (can: Can, role: string) => boolean; why: string };
const key = (k: string, cite: string): Gate => ({ test: (c) => c(k), why: `${k} · ${cite}` });
const any = (ks: string[], cite: string): Gate => ({ test: (c) => ks.some((k) => c(k)), why: `${ks.join("|")} · ${cite}` });
const OK: Gate = { test: () => true, why: "no key gate" };
const A = "src/app/app/sys/[id]/crm";

// ── page gates (null = page outside the CRM key model — not swept) ──
const PAGE_GATES: Record<string, Gate | null> = {
  "/app/sys/[id]": OK, "/activities": OK, "/calendar": OK, "/commissions": OK, "/pipelines": OK, "/contacts": OK, "/deals": OK,
  // the list page itself is not gated (companies/page.tsx:48-50) but crm.company.read is the read key of every company
  // (visibility.ts:65-72,407 ⇒ companyWhere = NOTHING): a STAFF without it sees an empty company list + filters + a nav
  // tab (nav.ts:30 has no perm, unlike emails/reports :36/:39) — PRODUCT FINDING; the registry follows the key
  "/companies": key("crm.company.read", `${A}/companies/page.tsx:48 (ungated — finding) · visibility.ts:407`),
  "/companies/[companyId]": key("crm.company.read", "companies.ts:227 companyWhere · visibility.ts:407 ⇒ notFound() [companyId]/page.tsx:70"),
  "/companies/new": key("crm.company.create", `${A}/companies/new/page.tsx:26`),
  "/companies/duplicates": key("crm.company.merge", `${A}/companies/duplicates/page.tsx:28`),
  "/contacts/[contactId]": key("crm.contact.read", "contactWhere · visibility.ts:407 ⇒ notFound() [contactId]/page.tsx:80"),
  "/contacts/new": key("crm.contact.create", `${A}/contacts/new/page.tsx:26`),
  "/contacts/import": key("crm.contact.import", `${A}/contacts/import/page.tsx:26`),
  "/contacts/duplicates": key("crm.contact.merge", `${A}/contacts/duplicates/page.tsx:30`),
  "/deals/[dealId]": key("crm.deal.read", "dealWhere · visibility.ts:407 ⇒ notFound() [dealId]/page.tsx:74"),
  "/deals/new": key("crm.deal.create", `${A}/deals/new/page.tsx:39`),
  "/emails": key("crm.email.read", `${A}/emails/page.tsx:42`),
  "/emails/[threadKey]": key("crm.email.read", `${A}/emails/[threadKey]/page.tsx:36`),
  "/objects": key("crm.record.read", `${A}/objects/page.tsx:28`),
  "/objects/[key]": key("crm.record.read", `${A}/objects/[key]/page.tsx:52`),
  "/objects/[key]/[recordId]": key("crm.record.read", `${A}/objects/[key]/[recordId]/page.tsx:36`),
  "/reports": key("crm.report.view", `${A}/reports/page.tsx:20 · [tab]/page.tsx:81`),
  "/settings": key("crm.settings.manage", `${A}/settings/page.tsx:69`),
  "/settings/api": key("crm.api.manage", `${A}/settings/api/page.tsx:40`),
  "/settings/assignment": key("crm.assignment.manage", `${A}/settings/assignment/page.tsx:48`),
  "/settings/automation": key("crm.automation.manage", `${A}/settings/automation/page.tsx:45`),
  "/settings/commissions": any(["crm.settings.manage", "crm.commission.approve"], `${A}/settings/commissions/page.tsx:39-41`),
  "/settings/email": key("crm.email.settings", `${A}/settings/email/page.tsx:49`),
  "/settings/forms": key("crm.tracking.manage", `${A}/settings/forms/page.tsx:31`),
  "/settings/holidays": key("crm.sequence.manage", `${A}/settings/holidays/page.tsx:28`),
  "/settings/integrations": key("crm.settings.manage", `${A}/settings/integrations/page.tsx:41`),
  "/settings/lost-reasons": key("crm.settings.manage", `${A}/settings/lost-reasons/page.tsx:27`),
  "/settings/notifications": any(["crm.settings.manage", "crm.deal.read", "crm.contact.read", "crm.activity.read"], `${A}/settings/notifications/page.tsx:37`),
  "/settings/objects": key("crm.object.manage", `${A}/settings/objects/page.tsx:55`),
  "/settings/pipelines": key("crm.settings.manage", `${A}/settings/pipelines/page.tsx:27`),
  "/settings/portal": key("crm.portal.manage", `${A}/settings/portal/page.tsx:28`),
  "/settings/quotas": key("crm.quota.manage", `${A}/settings/quotas/page.tsx:31`),
  "/settings/scoring": key("crm.score.manage", `${A}/settings/scoring/page.tsx:41`),
  "/settings/sequences": any(["crm.sequence.manage", "crm.sequence.enroll"], `${A}/settings/sequences/page.tsx:28-29`),
  "/settings/sequences/[sequenceId]": any(["crm.sequence.manage", "crm.sequence.enroll"], `${A}/settings/sequences/[sequenceId]/page.tsx:38-39`),
  "/settings/stages": key("crm.settings.manage", `${A}/settings/stages/page.tsx:29`),
  "/settings/tracking": key("crm.tracking.manage", `${A}/settings/tracking/page.tsx:32`),
  "/settings/visibility": key("crm.visibility.manage", `${A}/settings/visibility/page.tsx:41`),
};

// ── control gates on pages the persona CAN open (exact testid or glob; optional page) — audited 1 Oct 2026 ──
const CO_READ = "company refs resolve only through companyWhere (crm.company.read)";
const CONTROL_GATES: { m: string; page?: string; gate: Gate }[] = [
  { m: "deals-empty-create-pipeline", page: "/deals", gate: key("crm.settings.manage", `${A}/deals/page.tsx:127`) },
  { m: "deal-new-create-pipeline", page: "/deals/new", gate: key("crm.settings.manage", `${A}/deals/new/page.tsx:64`) },
  { m: "deal-company-link", page: "/deals/[dealId]", gate: key("crm.company.read", `${A}/deals/[dealId]/page.tsx:208 · deals.ts:2021 ${CO_READ}`) },
  { m: "contact-conn-company-link", page: "/contacts/[contactId]", gate: key("crm.company.read", `${A}/contacts/[contactId]/page.tsx:407 · contacts.ts:1443 ${CO_READ}`) },
  { m: "activity-row-company-link", gate: key("crm.company.read", `${A}/activities/_components/ActivityItems.tsx:104 · activities.ts:859 ${CO_READ}`) },
  { m: "crm-seq-bulk*", page: "/contacts", gate: key("crm.sequence.enroll", "sequences.ts:589 sequenceOptions() = [] ⇒ SequenceBulkEnroll renders nothing · contacts/page.tsx:104,165") },
  { m: "crm-object-tab-*", gate: key("crm.record.read", "src/components/crm/objects/ObjectTabs.tsx:98 (no record.read ⇒ no object tabs)") },
  { m: "contact-edit-move-deals", page: "/contacts/[contactId]", gate: key("crm.company.read", `${A}/contacts/_components/Contact360Actions.tsx:510 (needs a picked company) · companies.ts:1959 ${CO_READ}`) },
  { m: "crm-ai-proposal-*", page: "/app/sys/[id]", gate: key("crm.report.view", "src/lib/modules/crm/home.tsx:214-216 (home aside / at-risk proposals only with crm.report.view) · CrmAiProposalCard.tsx:100") },
  { m: "crm-seq-enroll*", page: "/contacts/[contactId]", gate: key("crm.sequence.enroll", "sequences.ts:589 sequenceOptions() = [] ⇒ SequenceEnrollButton renders nothing · [contactId]/page.tsx:88,461") },
];
// rows the audit found VISIBLE for a STAFF with the seeded keys (no key gate) — explicit, so a stale hiddenFor is surfaced
const VISIBLE_FOR_STAFF: { m: string; page?: string; why: string }[] = [];
const extra = process.env.SWEEP_EXTRA ? JSON.parse(readFileSync(process.env.SWEEP_EXTRA, "utf8")) : null;
if (extra?.controlGates) for (const g of extra.controlGates) CONTROL_GATES.push({ m: g.m, page: g.page, gate: g.anyOf ? any(g.anyOf, g.cite) : key(g.key, g.cite) });
if (extra?.visible) for (const v of extra.visible) VISIBLE_FOR_STAFF.push(v);

const glob = (p: string) => new RegExp(`^${p.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
const hit = (m: string, t: string) => m === t || (m.includes("*") && glob(m).test(t)) || (t.includes("*") && m.includes("*") && glob(m).test(t.replace(/\*/g, "x")));

// ── persona keys from QC1 ──
const cans: Record<string, { can: Can; role: string; keys: string[] }> = {};
for (const u of PERSONAS) {
  const uid = E.users?.[u]?.userId;
  const m = uid ? await P.membership.findFirst({ where: { userId: uid, tenantId: E.tenantId }, select: { role: true, unitAccess: true, permissions: true } }) : null;
  if (!m) { console.error(`❌ ไม่พบ membership ของ ${u}`); process.exit(2); }
  const actor = toMemberActor(uid, m);
  cans[u] = { can: (k) => crmCan(actor, k), role: m.role, keys: Object.entries(m.permissions ?? {}).filter(([k, v]) => k.startsWith("crm.") && v === true).map(([k]) => k) };
  console.log(`persona ${u}: ${m.role} · explicit crm keys ${cans[u].keys.length ? cans[u].keys.join(",") : "(none — role defaults)"}`);
}
await prisma.$disconnect();

const raw = readFileSync(REG, "utf8");
const reg = JSON.parse(raw);
const changes: string[] = []; const surfaced: string[] = []; const gateUse = new Map<string, number>();
let moved = 0, added = 0, toRoles = 0;
for (const r of reg.rows as any[]) {
  if (r.page.startsWith("/b/")) continue;
  if (!(r.page in PAGE_GATES)) continue; // other modules' pages (teams · member · pos · account · meeting · party · /p · /u)
  const pg = PAGE_GATES[r.page];
  if (!pg) continue;
  const cg = CONTROL_GATES.find((g) => (!g.page || g.page === r.page) && hit(g.m, r.testid));
  const vis = VISIBLE_FOR_STAFF.find((v) => (!v.page || v.page === r.page) && hit(v.m, r.testid));
  for (const u of PERSONAS) {
    const { can, role } = cans[u]!;
    let verdict: boolean | null = null; let why = "";
    if (!pg.test(can, role)) { verdict = false; why = `page 404s without ${pg.why}`; }
    else if (cg) { verdict = cg.gate.test(can, role); why = cg.gate.why; gateUse.set(cg.m, (gateUse.get(cg.m) ?? 0) + 1); }
    else if (vis && role === "STAFF") { verdict = true; why = vis.why; }
    if (verdict === null) continue;
    const inR = r.roles.includes(u), inH = r.hiddenFor.includes(u);
    if (verdict === false && inR) { r.roles = r.roles.filter((x: string) => x !== u); if (!inH) r.hiddenFor.push(u); moved++; changes.push(`${r.page}#${r.testid} ${u}: roles → hiddenFor (${why})`); }
    else if (verdict === false && !inH) { r.hiddenFor.push(u); added++; changes.push(`${r.page}#${r.testid} ${u}: (unclaimed) → hiddenFor (${why})`); }
    else if (verdict === true && inH) { r.hiddenFor = r.hiddenFor.filter((x: string) => x !== u); if (!inR) r.roles.push(u); toRoles++; surfaced.push(`${r.page}#${r.testid} ${u}: hiddenFor → roles (${why})`); }
  }
  const order = ["owner", "manager", "nok", "thana", "customer"];
  r.roles.sort((a: string, b: string) => order.indexOf(a) - order.indexOf(b));
  r.hiddenFor.sort((a: string, b: string) => order.indexOf(a) - order.indexOf(b));
}
for (const c of changes) console.log("  ~ " + c);
for (const c of surfaced) console.log("  ↑ " + c);
const unusedGates = CONTROL_GATES.filter((g) => !gateUse.has(g.m)).map((g) => g.m);
console.log(`\nSWEEP: roles→hiddenFor ${moved} · unclaimed→hiddenFor ${added} · hiddenFor→roles ${toRoles} · control gates unused ${unusedGates.length ? unusedGates.join(",") : 0}`);
writeFileSync("scripts/pending/c42b/registry-sweep.last.txt", [...changes, ...surfaced.map((s) => "↑ " + s)].join("\n") + "\n");
if (APPLY) { writeFileSync(REG, JSON.stringify(reg, null, 2).replace(/\n/g, "\n") + "\n"); console.log(`✍️  เขียน ${REG} แล้ว`); }
console.log(`JSON_SUMMARY ${JSON.stringify({ moved, added, toRoles, applied: APPLY })}`);

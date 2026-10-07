// probe — CRM C5.5-fix8 item 5: account `contains` searches must treat `%` `_` `\` in the search term literally
//   C0  premise + helper on THIS database: raw Prisma `contains` (ILIKE / LIKE) is a pattern; `likeEscape`d `contains` is literal,
//       case-insensitive where it was, Thai and a stored literal `50%_off\x` still match
//   C1  end to end through the real list/picker functions: contacts list + picker · documents list · expense list · products list + picker ·
//       attachments list — `%` / `_` / `\` find only rows that really contain them; normal terms return the same rows as before
//   C2  static: every account search site named in the fix4 note goes through the shared helper (no raw `contains:` left in account/**
//       except the two server-built marker lookups)
// QC3 ONLY · own tenant + raw ACCOUNT system (no seed) · CLEAN at the end
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf11/probe-cf11-contains.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { readFileSync } from "node:fs";
const { ctx } = (await import("./_ctx.mts" as string)) as { ctx: (l: string) => Promise<Any> };
const X = await ctx("c");
const { P, TAG, chk, j, mkTenant, sub, done } = X;

const T = await mkTenant("a");
const S = (await P.appSystem.create({ data: { tenantId: T, type: "ACCOUNT", name: `${TAG} acc` }, select: { id: true } })).id as string;
const rand = TAG.slice(-8);
const C = async (name: string, extra: Record<string, unknown> = {}) =>
  (await P.accountContact.create({ data: { tenantId: T, systemId: S, name, ...extra }, select: { id: true, name: true } })) as { id: string; name: string };
// contact fixtures — the TAG keeps everything in this tenant; `rand` makes the literal terms unique
const cDot = await C(`gamma.x ${rand}`, { email: `gamma.x-${rand}@qc.invalid`, taxId: "0105561000111", phone: "081-111-2222", phoneNorm: "0811112222" });
const cUs = await C(`gamma_x ${rand}`, { email: `gamma_x-${rand}@qc.invalid` });
const cLit = await C(`50%_off\\x ${rand}`);
const cThai = await C(`บริษัท ทดสอบ ${rand}`);
const cAcme = await C(`ACME Trading ${rand}`);
for (let i = 0; i < 4; i += 1) await C(`filler ${i} ${rand}`);
const D = async (docType: string, docNo: string, contactId: string | null) =>
  (await P.accountDocument.create({ data: { tenantId: T, systemId: S, docType, docNo, contactId, issueDate: new Date() }, select: { id: true, docNo: true } })) as { id: string; docNo: string };
const dDot = await D("INVOICE", `IV.${rand}-1`, cAcme.id);
const dUs = await D("INVOICE", `IV_${rand}-2`, cThai.id);
const dLit = await D("INVOICE", `IV%${rand}-3`, cLit.id);
const eDot = await D("EXPENSE", `EX.${rand}-1`, cAcme.id);
const eUs = await D("EXPENSE", `EX_${rand}-2`, cThai.id);
const Pr = async (name: string, sku: string | null) =>
  (await P.accountProduct.create({ data: { tenantId: T, systemId: S, name, sku }, select: { id: true, name: true } })) as { id: string; name: string };
const pDot = await Pr(`ชุด.ดำน้ำ ${rand}`, `SKU.A-${rand}`);
const pUs = await Pr(`ชุด_ดำน้ำ ${rand}`, `SKU_A-${rand}`);
const pLit = await Pr(`100%_cotton\\y ${rand}`, null);
for (let i = 0; i < 3; i += 1) await Pr(`pfill ${i} ${rand}`, `PF${i}-${rand}`);
const At = async (fileName: string) =>
  (await P.accountAttachment.create({ data: { tenantId: T, systemId: S, fileName, fileUrl: `https://qc.invalid/${encodeURIComponent(fileName)}`, mimeType: "application/pdf", sizeBytes: 1 }, select: { id: true } })) as { id: string };
const aDot = await At(`bill.${rand}.pdf`);
const aUs = await At(`bill_${rand}.pdf`);
const aLit = await At(`bill%${rand}.pdf`);
const ids = (rows: Any[]) => new Set(rows.map((r: Any) => r.id as string));
const same = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));
const names = (rows: Any[], f = "name") => j(rows.map((r: Any) => r[f] ?? r.docNo ?? r.fileName ?? r.id));

await sub("C0 premise + helper semantics on this DB", async () => {
  const where = (name: Any) => ({ tenantId: T, systemId: S, name });
  const rawPct = await P.accountContact.count({ where: where({ contains: "%", mode: "insensitive" }) });
  const rawUs = await P.accountContact.findMany({ where: where({ contains: `gamma_x ${rand}`, mode: "insensitive" }), select: { id: true } });
  const rawCs = await P.accountContact.count({ where: where({ contains: "_" }) });
  chk("C0.1", rawPct >= 9 && rawUs.length === 2 && rawCs >= 9, `premise: raw contains "%" (ILIKE) → ${rawPct} rows · "gamma_x …" → ${rawUs.length} (gamma.x too) · case-sensitive contains "_" (LIKE) → ${rawCs} (want ≥9 · 2 · ≥9 = wildcards)`);
  const H = (await import("@/lib/core/ci-equals" as string)) as Any;
  if (typeof H.ciContains !== "function" || typeof H.likeContains !== "function") {
    chk("C0.2", false, `helpers ciContains/likeContains not exported by core/ci-equals.ts (exports: ${Object.keys(H).join(",")})`);
    return;
  }
  const n = async (f: Any) => (await P.accountContact.findMany({ where: where(f), select: { id: true } })).map((r: Any) => r.id as string);
  const pct = await n(H.ciContains("%"));
  const us = await n(H.ciContains(`gamma_x ${rand}`));
  const bs = await n(H.ciContains("\\"));
  const litUp = await n(H.ciContains(`50%_OFF\\X`));
  const csUs = await n(H.likeContains("_"));
  const csBs = await n(H.likeContains("\\x"));
  const thai = await n(H.ciContains("ทดสอบ"));
  const caseIns = await n(H.ciContains("acme trading"));
  const caseSens = await n(H.likeContains("acme trading"));
  chk("C0.2", same(new Set(pct), [cLit.id]) && same(new Set(us), [cUs.id]) && same(new Set(bs), [cLit.id]) && same(new Set(litUp), [cLit.id]) && same(new Set(csUs), [cUs.id, cLit.id]) && same(new Set(csBs), [cLit.id]) && same(new Set(thai), [cThai.id]) && same(new Set(caseIns), [cAcme.id]) && caseSens.length === 0,
    `helper: ciContains "%"→${pct.length} "gamma_x"→${us.length} "\\"→${bs.length} "50%_OFF\\X"→${litUp.length} · likeContains "_"→${csUs.length} "\\x"→${csBs.length} · Thai→${thai.length} · case-insensitive "acme trading"→${caseIns.length} · likeContains keeps case-sensitivity→${caseSens.length} (want 1·1·1·1 · 2·1 · 1 · 1 · 0)`);
});

await sub("C1 real list / picker functions", async () => {
  const svc = (await import("@/lib/modules/account/service" as string)) as Any;
  const product = (await import("@/lib/modules/account/product" as string)) as Any;
  const expense = (await import("@/lib/modules/account/expense" as string)) as Any;
  const attach = (await import("@/lib/modules/account/attachment" as string)) as Any;
  const clist = (await import("@/lib/modules/account/contacts-list" as string)) as Any;
  const sidebar = { counts: { custom: [] }, regularIds: new Set(), regularRuleLabel: "", codeOf: new Map(), sourceSets: { member: new Set(), crm: new Set() } };
  const ctxA = { tenantId: T, systemId: S };
  const cases: { id: string; run: (q: string) => Promise<Any[]>; probes: [string, string[]][] }[] = [
    { id: "contacts.list", run: async (q) => (await clist.listContactsPage(ctxA, { q, group: "all", pageSize: 50 }, sidebar)).rows, probes: [["%", [cLit.id]], [`gamma_x ${rand}`, [cUs.id]], ["\\", [cLit.id]], [`gamma.x ${rand}`, [cDot.id]], ["ACME", [cAcme.id]], ["0105561000111", [cDot.id]], ["0811112222", [cDot.id]]] },
    { id: "contacts.picker", run: (q) => svc.searchContactPickerRows(T, S, q, 50), probes: [["%", [cLit.id]], ["_x", [cUs.id]], [`gamma.x-${rand}@`, [cDot.id]], ["081-111", [cDot.id]], ["ทดสอบ", [cThai.id]]] },
    { id: "documents.list", run: async (q) => (await svc.listDocumentsPaged(T, S, { docType: "INVOICE", q, pageSize: 50 })).rows, probes: [["%", [dLit.id]], [`IV_${rand}`, [dUs.id]], [`iv.${rand}`, [dDot.id]], ["acme", [dDot.id]], [`50%_off`, [dLit.id]]] },
    { id: "expense.list", run: async (q) => (await expense.listExpenseDocsPaged(T, S, { docType: "EXPENSE", q, pageSize: 50 })).rows, probes: [["_", [eUs.id]], [`EX.${rand}`, [eDot.id]], ["ทดสอบ", [eUs.id]]] },
    { id: "products.list", run: async (q) => (await product.listProductsPaged(T, S, { q, pageSize: 50 })).rows, probes: [["%", [pLit.id]], [`ชุด_ดำน้ำ`, [pUs.id]], [`sku.a-${rand}`, [pDot.id]], ["ดำน้ำ", [pDot.id, pUs.id]]] },
    { id: "products.picker", run: (q) => product.searchProductPickerRows(T, S, q, 50), probes: [["%", [pLit.id]], [`SKU_A`, [pUs.id]], ["cotton\\", [pLit.id]], ["ดำน้ำ", [pDot.id, pUs.id]]] },
    { id: "attachments.list", run: (q) => attach.listAttachments(T, S, { q }), probes: [["%", [aLit.id]], [`bill_${rand}`, [aUs.id]], [`BILL.${rand}`, [aDot.id]], [`${rand}.pdf`, [aDot.id, aUs.id, aLit.id]]] },
  ];
  for (const c of cases) {
    const bad: string[] = [];
    for (const [q, want] of c.probes) {
      let rows: Any[] = [];
      try {
        rows = await c.run(q);
      } catch (e) {
        bad.push(`${j(q)}: threw ${String((e as Error)?.message).slice(0, 90)}`);
        continue;
      }
      if (!same(ids(rows), want)) bad.push(`${j(q)} → ${rows.length} ${names(rows)} (want ${want.length})`);
    }
    chk(`C1.${c.id}`, bad.length === 0, bad.length ? bad.join(" · ") : `${c.probes.length} terms: wildcard characters literal · normal terms find the same rows`);
  }
});

await sub("C2 static — every listed account search site uses the helper", async () => {
  const files = ["expense.ts", "contacts-list.ts", "attachment.ts", "service.ts", "product.ts", "journal-v2.ts"];
  const raw: string[] = [];
  for (const f of files) {
    const src = readFileSync(`src/lib/modules/account/${f}`, "utf8").split("\n");
    src.forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      if (/\bcontains\s*:/.test(line) && !/REPORT_MARKER_TITLE|periodKey|price already contains/.test(line)) raw.push(`${f}:${i + 1}`);
    });
  }
  chk("C2.1", raw.length === 0, raw.length ? `raw contains/startsWith/endsWith left: ${raw.join(" · ")}` : "no raw search key left in the six files (server-built markers excepted)");
});

await done("probe-cf11-contains");

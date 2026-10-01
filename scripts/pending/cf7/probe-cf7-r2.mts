// C5.5-fix6 ROUND 2 probe — independent review findings (ledger/wo-notes/crm-C5.5-fix6-review.md):
//   F61   createContact WITH a company by a user who can read but not update companies: refused before any write (was: contact created,
//         link failed, warning) · import: the company step never double-counts a row and never creates a company for a user who cannot link
//   F62   clear (companyId:null) of a company the editor cannot SEE: refused before any write (was: half-write, then NOT_FOUND)
//   F63   move + moveOpenDeals off a company the editor cannot see: refused, nothing moved (was: contact + the owner's deal moved)
//   F64   edit sheet read-only line: "บริษัทหลัก" only when the shown company IS the primary one, else neutral "บริษัท"
//   F67   the AI system prompt explains "(sender not verified)"
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-cf7-*` (swept in done()) · network blocked.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf7/probe-cf7-r2.mts [--only=F61,F62,F63,F64,F67]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean).map((s) => s.toUpperCase());
const want = (s: string) => ONLY.length === 0 || ONLY.includes(s);
const fx = await fixture("r");
const { P, chk, call, mkShop, mkUser, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const cut = (v: unknown, n = 140) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const sub = async (id: string, fn: () => Promise<void>) => {
  if (!want(id)) return;
  console.log(`\n── ${id} ──`);
  try {
    await fn();
  } catch (e) {
    chk(`${id}-ERR`, false, String((e as Error)?.stack ?? e).slice(0, 900));
  }
};
const rand = TAG.slice(-8);
const codeOf = (r: Any) => (r.ok ? "OK" : String(r.err?.code ?? r.err?.name ?? "ERR"));

const { toMemberActor } = (await import("@/lib/modules/member" as string)) as Any;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;

async function staff(shop: Any, suffix: string, keys: string[]) {
  const uid = await mkUser(`-${suffix}`);
  const permissions = Object.fromEntries(keys.map((k) => [k, true]));
  const m = await P.membership.create({ data: { userId: uid, tenantId: shop.tid, role: "STAFF", unitAccess: ["*"], permissions, acceptedAt: new Date() } });
  return { uid, actor: toMemberActor(uid, m), ctx: { tenantId: shop.tid, systemId: shop.S, actorUserId: uid } };
}
async function mkCompany(shop: Any, name: string, ownerUserId: string) {
  const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "COMPANY" } });
  return P.crmCompany.create({ data: { tenantId: shop.tid, systemId: shop.S, partyId: party.id, name, ownerUserId } });
}
async function mkContact(shop: Any, first: string, ownerUserId: string, opts: { companyId?: string | null; extra?: { companyId: string; primary: boolean }[] } = {}) {
  const name = `${first} ${TAG}`;
  const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "PERSON" } });
  const k = await P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name, firstName: first, partyId: party.id, ownerUserId, companyId: opts.companyId ?? null } });
  if (opts.companyId) await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: opts.companyId, contactId: k.id, isPrimary: true } });
  for (const x of opts.extra ?? []) await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: x.companyId, contactId: k.id, isPrimary: x.primary } });
  return k;
}
/** tenant-wide write footprint (rows that a "refused before any write" call must not add) */
const footprint = async (tid: string) => ({
  contacts: await P.crmContact.count({ where: { tenantId: tid } }),
  parties: await P.party.count({ where: { tenantId: tid } }),
  audits: await P.auditLog.count({ where: { tenantId: tid } }),
  outbox: await P.outboxEvent.count({ where: { tenantId: tid } }),
  links: await P.crmCompanyContact.count({ where: { tenantId: tid } }),
  companies: await P.crmCompany.count({ where: { tenantId: tid } }),
  deals: await P.crmDeal.count({ where: { tenantId: tid } }),
});
const diff = (a: Any, b: Any) => Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => `${k}${b[k] - a[k] >= 0 ? "+" : ""}${b[k] - a[k]}`).join(" ") || "none";

const BASE = ["crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.deal.read", "crm.deal.create", "crm.activity.read"];

try {
  const shop = await mkShop("a");
  const roCo = await staff(shop, "roco", [...BASE, "crm.company.read", "crm.contact.import"]); // sees own companies, cannot link
  const linker = await staff(shop, "link", [...BASE, "crm.company.read", "crm.company.update", "crm.contact.import"]); // can link, cannot create companies
  const owner = { actor: shop.owner, ctx: shop.ctx, uid: shop.uid };
  const coR = await mkCompany(shop, `บริษัทอาร์ ${rand}`, roCo.uid); // visible to roCo
  const coL = await mkCompany(shop, `บริษัทแอล ${rand}`, linker.uid); // visible to linker
  const coX = await mkCompany(shop, `บริษัทเอ็กซ์ ${rand}`, shop.uid); // owner's: invisible to both STAFF (OWN scope)
  const vis = async (who: Any, id: string) => (await CON.companyOptions(who.ctx, who.actor, "")).some((c: Any) => c.id === id);
  chk("P-premise", (await vis(roCo, coR.id)) && !(await vis(roCo, coX.id)) && (await vis(linker, coL.id)) && !(await vis(linker, coX.id)),
    `visibility: roCo sees R=${await vis(roCo, coR.id)} X=${await vis(roCo, coX.id)} · linker sees L=${await vis(linker, coL.id)} X=${await vis(linker, coX.id)} (want true/false · true/false)`);

  // ═══════════════════════ F61 · create with a company by read-without-update · import accounting ═══════════════════════
  await sub("F61", async () => {
    const f0 = await footprint(shop.tid);
    const r = await call(() => CON.createContact(roCo.ctx, roCo.actor, { firstName: `สร้างอาร์ ${rand}`, companyId: coR.id }));
    const f1 = await footprint(shop.tid);
    chk("F61-create-refused", codeOf(r) === "FORBIDDEN" && diff(f0, f1) === "none",
      `createContact({companyId: visible R}) by read-without-update → ${codeOf(r)} "${cut(r.err?.message ?? j(r.v?.warnings), 80)}" · tenant writes: ${diff(f0, f1)} (want FORBIDDEN · none)`);
    const r2 = await call(() => CON.createContact(linker.ctx, linker.actor, { firstName: `สร้างแอล ${rand}`, companyId: coL.id }));
    const k2 = r2.ok ? await P.crmContact.findUnique({ where: { id: r2.v.contact.id }, select: { companyId: true } }) : null;
    chk("F61-create-control", r2.ok && r2.v.created && k2?.companyId === coL.id && (r2.v.warnings ?? []).length === 0,
      `createContact({companyId: L}) by read+update → ${codeOf(r2)} · linked=${k2?.companyId === coL.id} · warnings=${j(r2.v?.warnings)} (positive control)`);

    // import, 2 rows: one names an existing company the importer sees, one names a company that does not exist
    const rows = (who: string) => [
      { ชื่อ: `นำเข้า1 ${who} ${rand}`, บริษัท: who === "r" ? coR.name : coL.name },
      { ชื่อ: `นำเข้า2 ${who} ${rand}`, บริษัท: `บริษัทใหม่ ${who} ${rand}` },
    ];
    const mapping = { ชื่อ: "firstName", บริษัท: "company" };
    const g0 = await footprint(shop.tid);
    const ir = await call(() => CON.importContacts(roCo.ctx, roCo.actor, { rows: rows("r"), mapping, options: { onDuplicate: "skip", source: "IMPORT" } }));
    const g1 = await footprint(shop.tid);
    const res = ir.v?.result ?? {};
    chk("F61-import-readonly", ir.ok && res.created === 2 && res.failed === 0 && g1.companies === g0.companies && g1.links === g0.links && (res.errors ?? []).length >= 1,
      `import by read-without-update (2 rows with a company) → ${codeOf(ir)} created=${res.created} failed=${res.failed} · companies +${g1.companies - g0.companies} links +${g1.links - g0.links} · notes ${cut(j(res.errors), 160)} (want 2 · 0 · +0 · +0 · a note)`);
    const h0 = await footprint(shop.tid);
    const il = await call(() => CON.importContacts(linker.ctx, linker.actor, { rows: rows("l"), mapping, options: { onDuplicate: "skip", source: "IMPORT" } }));
    const h1 = await footprint(shop.tid);
    const rl = il.v?.result ?? {};
    const linked = await P.crmContact.count({ where: { tenantId: shop.tid, firstName: { startsWith: "นำเข้า1 l" }, companyId: coL.id } });
    chk("F61-import-linker", il.ok && rl.created === 2 && rl.failed === 0 && h1.companies === h0.companies && h1.links - h0.links === 1 && (rl.errors ?? []).some((e: Any) => e.row === 2),
      `import by read+update without company.create → ${codeOf(il)} created=${rl.created} failed=${rl.failed} · companies +${h1.companies - h0.companies} links +${h1.links - h0.links} (existing linked=${linked}) · notes ${cut(j(rl.errors), 160)} (want 2 · 0 · +0 · +1 · note on row 2)`);
  });

  // ═══════════════════════ F62 · clear a company the editor cannot see ═══════════════════════
  await sub("F62", async () => {
    const k = await mkContact(shop, "ล้างมองไม่เห็น", linker.uid, { companyId: coX.id });
    const f0 = await footprint(shop.tid);
    const r = await call(() => CON.updateContact(linker.ctx, linker.actor, k.id, { firstName: `ชื่อใหม่ ${rand}`, companyId: null }));
    const f1 = await footprint(shop.tid);
    const row = await P.crmContact.findUnique({ where: { id: k.id }, select: { firstName: true, companyId: true } });
    chk("F62-clear-invisible", codeOf(r) === "NOT_FOUND" && row.firstName === "ล้างมองไม่เห็น" && row.companyId === coX.id && diff(f0, f1) === "none" && !String(r.err?.message ?? "").includes(coX.name),
      `updateContact({firstName, companyId:null}) by read+update, current company invisible → ${codeOf(r)} "${cut(r.err?.message, 70)}" · firstName "${row.firstName}" · company kept=${row.companyId === coX.id} · writes: ${diff(f0, f1)} (want NOT_FOUND · unchanged · none)`);
    const kv = await mkContact(shop, "ล้างมองเห็น", linker.uid, { companyId: coL.id });
    const rv = await call(() => CON.updateContact(linker.ctx, linker.actor, kv.id, { companyId: null }));
    const rowv = await P.crmContact.findUnique({ where: { id: kv.id }, select: { companyId: true } });
    chk("F62-clear-control", rv.ok && rowv.companyId === null, `clear of a VISIBLE company by the same user → ${codeOf(rv)} "${cut(rv.err?.message, 60)}" · companyId=${rowv.companyId} (positive control: OK · null)`);
  });

  // ═══════════════════════ F63 · move + moveOpenDeals off a company the editor cannot see ═══════════════════════
  await sub("F63", async () => {
    const DEALS = (await import("@/lib/modules/crm/deals" as string)) as Any;
    const k = await mkContact(shop, "ย้ายมองไม่เห็น", linker.uid, { companyId: coX.id });
    const deal = await DEALS.createDeal(owner.ctx, owner.actor, { pipelineId: shop.pipe.id, title: `ดีลเจ้าของ ${rand}`, contactId: k.id, companyId: coX.id, valueSatang: 100_00, ownerUserId: shop.uid });
    const f0 = await footprint(shop.tid);
    const r = await call(() => CON.updateContact(linker.ctx, linker.actor, k.id, { companyId: coL.id, moveOpenDeals: true }));
    const f1 = await footprint(shop.tid);
    const row = await P.crmContact.findUnique({ where: { id: k.id }, select: { companyId: true } });
    const d = await P.crmDeal.findUnique({ where: { id: deal.id }, select: { companyId: true } });
    const links = ((await P.crmCompanyContact.findMany({ where: { contactId: k.id, endedAt: null }, select: { companyId: true } })) as Any[]).map((l) => (l.companyId === coX.id ? "X" : l.companyId === coL.id ? "L" : "?")).sort().join(",");
    chk("F63-move-invisible", codeOf(r) === "NOT_FOUND" && row.companyId === coX.id && d.companyId === coX.id && links === "X" && diff(f0, f1) === "none",
      `updateContact({companyId: L, moveOpenDeals}) by read+update, current company invisible → ${codeOf(r)} · contact at X=${row.companyId === coX.id} · owner's deal at X=${d.companyId === coX.id} · links ${links} · writes: ${diff(f0, f1)} (want NOT_FOUND · X · X · "X" · none)`);
    // control: the owner (sees both) moves the contact and its open deal
    const r2 = await call(() => CON.updateContact(owner.ctx, owner.actor, k.id, { companyId: coL.id, moveOpenDeals: true }));
    const d2 = await P.crmDeal.findUnique({ where: { id: deal.id }, select: { companyId: true } });
    chk("F63-move-control", r2.ok && d2.companyId === coL.id, `owner move + moveOpenDeals → ${codeOf(r2)} "${cut(r2.err?.message, 60)}" · deal now at L=${d2.companyId === coL.id} (positive control)`);
  });

  // ═══════════════════════ F64 · read-only line label ═══════════════════════
  await sub("F64", async () => {
    const React = (await import("react" as string)) as Any;
    const R = (React.default ?? React) as Any;
    const RDS = (await import("react-dom/server" as string)) as Any;
    const ctxMod = (await import("next/dist/shared/lib/app-router-context.shared-runtime.js" as string)) as Any;
    const C3 = (await import("@/app/app/sys/[id]/crm/contacts/_components/Contact360Actions" as string)) as Any;
    const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
    const orig = R.useState;
    let calls = 0;
    R.useState = (init: unknown) => {
      calls += 1;
      const pair = orig(init);
      return calls === 2 ? ["edit", pair[1]] : pair; // ContactMenu: #1 menu · #2 sheet
    };
    // what contacts/[contactId]/page.tsx passes (getContact360 + the primary test the page now does)
    const sheet = async (k: Any) => {
      const d = (await CON.getContact360(roCo.ctx, roCo.actor, k.id)) as Any;
      calls = 0;
      try {
        return String(
          RDS.renderToStaticMarkup(
            R.createElement(ctxMod.AppRouterContext.Provider, { value: router },
              R.createElement(C3.ContactMenu, {
                systemId: shop.S,
                owners: [],
                can: { update: true, assign: true, merge: false, archive: false, company: false },
                contact: { id: k.id, firstName: k.firstName, lastName: "", phone: "", email: "", jobTitle: "", ownerUserId: roCo.uid, lifecycleStage: "LEAD", leadStatus: "NEW", tags: [], archived: false, companyId: null, companyName: d.company?.name ?? null, companyIsPrimary: !!d.company && d.company.id === k.companyId },
              })),
          ),
        );
      } finally {
        calls = 0;
      }
    };
    try {
      // primary company X invisible to roCo + a non-primary visible link R
      const kh = await mkContact(shop, "หลักซ่อน", roCo.uid, { companyId: coX.id, extra: [{ companyId: coR.id, primary: false }] });
      const hh = await sheet(kh);
      chk("F64-nonprimary-neutral", hh.includes("contact-edit-company-readonly") && hh.includes(`บริษัท: ${coR.name}`) && !hh.includes("บริษัทหลัก") && !hh.includes(coX.name),
        `primary hidden, other link visible: line=${hh.includes("contact-edit-company-readonly")} · text "${cut((/data-testid="contact-edit-company-readonly">([^<]*)/.exec(hh) ?? [])[1], 80)}" (want "บริษัท: <R>", no "บริษัทหลัก", no X name)`);
      const kp = await mkContact(shop, "หลักเห็น", roCo.uid, { companyId: coR.id });
      const hp = await sheet(kp);
      chk("F64-primary-control", hp.includes(`บริษัทหลัก: ${coR.name}`), `primary visible: text "${cut((/data-testid="contact-edit-company-readonly">([^<]*)/.exec(hp) ?? [])[1], 80)}" (positive control: "บริษัทหลัก: <R>")`);
    } finally {
      R.useState = orig;
    }
    const p360 = readFileSync("src/app/app/sys/[id]/crm/contacts/[contactId]/page.tsx", "utf8").replace(/\s+/g, " ");
    chk("F64-wiring", /companyIsPrimary: !!data\.company && data\.company\.id === c\.companyId/.test(p360), "contacts/[contactId]/page.tsx passes companyIsPrimary = (shown company id === contact.companyId)");
  });

  // ═══════════════════════ F67 · the system prompt explains the marker ═══════════════════════
  await sub("F67", async () => {
    await P.aiCreditWallet.upsert({ where: { tenantId: shop.tid }, create: { tenantId: shop.tid, balanceMicro: 50_000_000, grantedAt: new Date() }, update: { balanceMicro: 50_000_000, grantedAt: new Date() } });
    const AI = (await import("@/lib/modules/crm/ai-bridges" as string)) as Any;
    const k = await mkContact(shop, "สรุป", shop.uid);
    let sys = "";
    const ai = { chat: async (messages: Any[]) => { sys = String(messages.find((m: Any) => m.role === "system")?.content ?? ""); return { text: JSON.stringify({ text: "ok" }), tokensIn: 1, tokensOut: 1, model: "qc-fake" }; } };
    const r = await call(() => AI.runAssist(shop.ctx, shop.owner, { kind: "contact.whyHot", id: k.id }, { ai }));
    chk("F67-system-prompt", r.ok && /\(sender not verified\)/.test(sys) && /not be authenticated/.test(sys), `system prompt mentions the marker: ${/\(sender not verified\)/.test(sys)} · ok=${r.ok}${r.ok ? "" : ` ${cut(r.err?.message, 80)}`}`);
  });
} catch (e) {
  chk("FATAL", false, String((e as Error)?.stack ?? e).slice(0, 900));
}
await done("probe-cf7-r2");

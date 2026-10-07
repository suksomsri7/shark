// C5.5-fix6 probe — RED/GREEN for two leftovers:
//   F3    (C4.2 run3 triage) the company picker is a dead control for users WITHOUT crm.company.read (every search "ไม่พบรายการ…")
//         · UI: hidden on /contacts/new, on the Contact 360 edit sheet (edit-company), in the convert modal ("pick existing") and on /deals/new
//           (deal-new-company) — rendered with the REAL client components (react-dom/server) using the props the pages compute
//         · server: create/update/convert refuse a posted company change from such a user BEFORE anything is written (FORBIDDEN) ·
//           an echo of the current value and a patch without companyId keep the existing company · the read-only name on the edit
//           sheet comes from getContact360 (visibility) only
//   R2-2  (fix3b review r2) AI assist briefs (contact · company · deal) mark activity lines of unverified inbound mail "(sender not verified)"
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-cf7-*` (swept in done()) · network blocked (fetch) · own env tweaks restored.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf7/probe-cf7.mts [--only=UI,SRV,AI,W]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean).map((s) => s.toUpperCase());
const want = (s: string) => ONLY.length === 0 || ONLY.includes(s);
const fx = await fixture("p");
const { P, chk, call, mkShop, mkUser, setCrm, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const cut = (v: unknown, n = 160) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
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
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;
const codeOf = (r: Any) => (r.ok ? "OK" : String(r.err?.code ?? r.err?.name ?? "ERR"));

const { crmCan } = (await import("@/lib/modules/crm/access" as string)) as Any;
const { toMemberActor } = (await import("@/lib/modules/member" as string)) as Any;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;

/** a STAFF member of the shop with exactly these crm keys (no implicit company access) */
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
async function mkContact(shop: Any, first: string, ownerUserId: string, opts: { companyId?: string | null; email?: string | null } = {}) {
  const name = `${first} ${TAG}`;
  const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "PERSON" } });
  const k = await P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name, firstName: first, partyId: party.id, ownerUserId, email: opts.email ?? null, companyId: opts.companyId ?? null } });
  if (opts.companyId) await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: opts.companyId, contactId: k.id, isPrimary: true } });
  return k;
}

// ── server-side render of the real client components (stub app router) ──
const React = (await import("react" as string)) as Any;
const R = (React.default ?? React) as Any;
const RDS = (await import("react-dom/server" as string)) as Any;
const ctxMod = (await import("next/dist/shared/lib/app-router-context.shared-runtime.js" as string)) as Any;
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
// open a sheet without a DOM: the n-th useState call of the rendered parent returns `value` (hook still called ⇒ order intact)
const origUseState = R.useState;
let forced: { n: number; value: unknown } | null = null;
let calls = 0;
R.useState = (init: unknown) => {
  calls += 1;
  const pair = origUseState(init);
  return forced && calls === forced.n ? [forced.value, pair[1]] : pair;
};
const render = (el: Any, force: { n: number; value: unknown } | null = null) => {
  forced = force;
  calls = 0;
  try {
    return String(RDS.renderToStaticMarkup(R.createElement(ctxMod.AppRouterContext.Provider, { value: router }, el)));
  } finally {
    forced = null;
  }
};
const has = (html: string, testid: string) => html.includes(`data-testid="${testid}"`);

try {
  const shop = await mkShop("a");
  const BASE = ["crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.contact.convert", "crm.deal.read", "crm.deal.create", "crm.activity.read"];
  const noCo = await staff(shop, "noco", BASE); // like QC personas nok/thana: no crm.company.*
  const roCo = await staff(shop, "roco", [...BASE, "crm.company.read"]); // sees companies, cannot link
  const fullCo = await staff(shop, "fullco", [...BASE, "crm.company.read", "crm.company.update"]); // STAFF default for companies
  const owner = { actor: shop.owner, ctx: shop.ctx, uid: shop.uid };
  // the values the pages compute (contacts/new · contacts/[contactId] · deals/new) — same keys as the product gate
  const linkOk = (a: Any) => crmCan(a, "crm.company.read") && crmCan(a, "crm.company.update");
  const readOk = (a: Any) => crmCan(a, "crm.company.read");
  chk("P-premise", !readOk(noCo.actor) && readOk(roCo.actor) && !linkOk(roCo.actor) && linkOk(fullCo.actor) && linkOk(owner.actor),
    `keys: noCo read=${readOk(noCo.actor)} · roCo read=${readOk(roCo.actor)} link=${linkOk(roCo.actor)} · fullCo link=${linkOk(fullCo.actor)} · owner link=${linkOk(owner.actor)} (want false · true/false · true · true)`);

  // fixtures: companies owned by each staff (so roCo/fullCo can see theirs), contacts owned by the acting staff
  const coA = await mkCompany(shop, `บริษัท A ${TAG}`, roCo.uid);
  const coB = await mkCompany(shop, `บริษัท B ${TAG}`, roCo.uid);

  // ═══════════════════════ UI · the picker is hidden for users who cannot use it (real components, SSR) ═══════════════════════
  await sub("UI", async () => {
    const NCF = (await import("@/app/app/sys/[id]/crm/contacts/_components/NewContactForm" as string)) as Any;
    const C3 = (await import("@/app/app/sys/[id]/crm/contacts/_components/Contact360Actions" as string)) as Any;
    const NDF = (await import("@/app/app/sys/[id]/crm/deals/_components/NewDealForm" as string)) as Any;
    const newContact = (a: Any) => render(R.createElement(NCF.NewContactForm, { systemId: shop.S, owners: [], defaultOwner: "", customFields: [], canPickCompany: linkOk(a) }));
    const hn = newContact(noCo.actor);
    const ho = newContact(owner.actor);
    chk("UI-new-control", has(ho, "contact-new-form") && has(ho, "contact-pick-company-q") && has(ho, "contact-pick-company-select"),
      `owner /contacts/new: form=${has(ho, "contact-new-form")} picker q/select=${has(ho, "contact-pick-company-q")}/${has(ho, "contact-pick-company-select")} (positive control — want true)`);
    chk("UI-new-hidden", has(hn, "contact-new-form") && !has(hn, "contact-pick-company-q") && !has(hn, "contact-pick-company-select") && !hn.includes("พิมพ์ชื่อบริษัท"),
      `no crm.company.read /contacts/new: picker q=${has(hn, "contact-pick-company-q")} select=${has(hn, "contact-pick-company-select")} (want false/false · form still there ${has(hn, "contact-new-form")})`);

    // Contact 360 edit sheet — contact WITH a company; the name the page passes = getContact360().company (visibility) only
    const kNo = await mkContact(shop, "แก้ไขไม่มีสิทธิ์", noCo.uid, { companyId: coA.id });
    const kRo = await mkContact(shop, "แก้ไขอ่านได้", roCo.uid, { companyId: coA.id });
    const v360 = async (who: Any, k: Any) => (await CON.getContact360(who.ctx, who.actor, k.id)) as Any;
    const dNo = await v360(noCo, kNo);
    const dRo = await v360(roCo, kRo);
    chk("UI-360-visibility", dNo.company === null && dRo.company?.name === coA.name,
      `getContact360().company: no-read user → ${j(dNo.company)} (want null — the name must not reach that page) · read-only user → ${cut(dRo.company?.name, 60)} (want the company)`);
    const menu = (who: Any, k: Any, d: Any) =>
      render(
        R.createElement(C3.ContactMenu, {
          systemId: shop.S,
          owners: [],
          can: { update: true, assign: true, merge: false, archive: false, company: linkOk(who.actor) },
          contact: { id: k.id, firstName: k.firstName, lastName: "", phone: "", email: "", jobTitle: "", ownerUserId: who.uid, lifecycleStage: "LEAD", leadStatus: "NEW", tags: [], archived: false, companyId: k.companyId, companyName: d.company?.name ?? null },
        }),
        { n: 2, value: "edit" }, // ContactMenu: useState #1 = menu · #2 = sheet
      );
    const eNo = menu(noCo, kNo, dNo);
    const eRo = menu(roCo, kRo, dRo);
    const kOw = await mkContact(shop, "แก้ไขเจ้าของ", shop.uid, { companyId: coA.id });
    const eOw = menu(owner, kOw, await v360(owner, kOw));
    chk("UI-edit-control", has(eOw, "contact-edit-modal") && has(eOw, "contact-pick-edit-company-q") && has(eOw, "contact-pick-edit-company-select"),
      `owner edit sheet: modal=${has(eOw, "contact-edit-modal")} edit-company picker=${has(eOw, "contact-pick-edit-company-q")} (positive control — want true/true)`);
    chk("UI-edit-hidden-noread", has(eNo, "contact-edit-modal") && !has(eNo, "contact-pick-edit-company-q") && !has(eNo, "contact-pick-edit-company-select") && !eNo.includes(coA.name),
      `no crm.company.read edit sheet: modal=${has(eNo, "contact-edit-modal")} picker=${has(eNo, "contact-pick-edit-company-q")} company name shown=${eNo.includes(coA.name)} (want true · false · false)`);
    chk("UI-edit-hidden-readonly", has(eRo, "contact-edit-modal") && !has(eRo, "contact-pick-edit-company-q") && has(eRo, "contact-edit-company-readonly") && eRo.includes(coA.name),
      `read-but-no-update edit sheet: picker=${has(eRo, "contact-pick-edit-company-q")} read-only line=${has(eRo, "contact-edit-company-readonly")} name shown=${eRo.includes(coA.name)} (want false · true · true)`);

    // convert modal — "pick an existing company" needs crm.company.read (the convert service reads it through companyWhere)
    const conv = (who: Any, k: Any) =>
      render(
        R.createElement(C3.ConvertButton, { systemId: shop.S, contactId: k.id, contactName: k.name, options: { memberSystems: [], pipelines: [] }, member: null, companyName: null, jobTitle: null, converted: false, canPickCompany: readOk(who.actor) }),
        { n: 1, value: true }, // ConvertButton: useState #1 = open
      );
    const cNo = conv(noCo, kNo);
    const cOw = conv(owner, kOw);
    chk("UI-convert-control", has(cOw, "contact-convert-modal") && has(cOw, "contact-convert-company-mode-pick") && has(cOw, "contact-convert-company-mode-new"),
      `owner convert modal: modal=${has(cOw, "contact-convert-modal")} pick=${has(cOw, "contact-convert-company-mode-pick")} new=${has(cOw, "contact-convert-company-mode-new")} (positive control)`);
    chk("UI-convert-hidden", has(cNo, "contact-convert-modal") && !has(cNo, "contact-convert-company-mode-pick") && has(cNo, "contact-convert-company-name"),
      `no crm.company.read convert modal: pick-existing=${has(cNo, "contact-convert-company-mode-pick")} (want false) · new-company name field=${has(cNo, "contact-convert-company-name")} (want true)`);

    // /deals/new — the company select only ever lists companies the user can read
    const deal = (who: Any) =>
      render(R.createElement(NDF.NewDealForm, { systemId: shop.S, pipelines: [{ id: shop.pipe.id, name: shop.pipe.name, isDefault: true, stages: shop.stages.map((s: Any) => ({ id: s.id, name: s.name, kind: s.kind, probability: s.probability, sortOrder: s.sortOrder })) }], owners: [], defaultOwner: "", defaultPipelineId: shop.pipe.id, defaultStageId: "", company: null, companyContacts: [], canPickCompany: readOk(who.actor) }));
    const dn = deal(noCo);
    const dow = deal(owner);
    chk("UI-deal-control", has(dow, "deal-new-form") && has(dow, "deal-new-company"), `owner /deals/new: company select=${has(dow, "deal-new-company")} (positive control)`);
    chk("UI-deal-hidden", has(dn, "deal-new-form") && !has(dn, "deal-new-company"), `no crm.company.read /deals/new: company select=${has(dn, "deal-new-company")} (want false · form ${has(dn, "deal-new-form")})`);
  });

  // ═══════════════════════ SRV · a posted company change from a user who cannot link is refused before anything is written ═══════════════════════
  await sub("SRV", async () => {
    const audits = async (id: string) => (await P.auditLog.count({ where: { tenantId: shop.tid, targetId: id, action: "crm.contact.update" } })) as number;
    const row = async (id: string) => (await P.crmContact.findUnique({ where: { id }, select: { firstName: true, jobTitle: true, companyId: true } })) as Any;
    const links = async (id: string) => ((await P.crmCompanyContact.findMany({ where: { contactId: id, endedAt: null }, select: { companyId: true } })) as Any[]).map((l) => l.companyId).sort().join(",");

    // S1 create with a company
    const before = await P.crmContact.count({ where: { tenantId: shop.tid } });
    const c1 = await call(() => CON.createContact(noCo.ctx, noCo.actor, { firstName: `สร้าง ${rand}`, companyId: coA.id }));
    const after = await P.crmContact.count({ where: { tenantId: shop.tid } });
    chk("SRV-create-refused", codeOf(c1) === "FORBIDDEN" && after === before,
      `createContact({companyId}) by a no-read user → ${codeOf(c1)} "${cut(c1.err?.message, 90)}" · contacts +${after - before} (want FORBIDDEN · +0)`);
    const c1b = await call(() => CON.createContact(noCo.ctx, noCo.actor, { firstName: `สร้างไม่มีบริษัท ${rand}` }));
    chk("SRV-create-plain", c1b.ok && c1b.v?.created === true, `createContact without companyId by the same user → ${codeOf(c1b)} (want OK — only the company part is gated)`);

    // S2 clear (companyId:null) together with another field
    const k = await mkContact(shop, "ล้าง", noCo.uid, { companyId: coA.id });
    const a0 = await audits(k.id);
    const r2 = await call(() => CON.updateContact(noCo.ctx, noCo.actor, k.id, { firstName: `ชื่อใหม่ ${rand}`, companyId: null }));
    const k2 = await row(k.id);
    chk("SRV-clear-refused", codeOf(r2) === "FORBIDDEN" && k2.firstName === "ล้าง" && k2.companyId === coA.id && (await links(k.id)) === coA.id && (await audits(k.id)) === a0,
      `updateContact({firstName, companyId:null}) by a no-read user → ${codeOf(r2)} · firstName "${k2.firstName}" companyId kept=${k2.companyId === coA.id} links=${(await links(k.id)) === coA.id ? "A" : await links(k.id)} new audits=${(await audits(k.id)) - a0} (want FORBIDDEN · unchanged · nothing half-written)`);

    // S3 change to another company
    const r3 = await call(() => CON.updateContact(noCo.ctx, noCo.actor, k.id, { companyId: coB.id }));
    const k3 = await row(k.id);
    chk("SRV-change-refused", codeOf(r3) === "FORBIDDEN" && k3.companyId === coA.id, `updateContact({companyId: other}) by a no-read user → ${codeOf(r3)} "${cut(r3.err?.message, 80)}" · kept=${k3.companyId === coA.id} (want FORBIDDEN · kept)`);

    // S4 echo of the current value (a client that sends back the DTO it read) — not a change ⇒ accepted, company kept
    const r4 = await call(() => CON.updateContact(noCo.ctx, noCo.actor, k.id, { jobTitle: `ตำแหน่ง ${rand}`, companyId: coA.id }));
    const k4 = await row(k.id);
    chk("SRV-echo-kept", r4.ok && k4.jobTitle === `ตำแหน่ง ${rand}` && k4.companyId === coA.id && (await links(k.id)) === coA.id,
      `updateContact({jobTitle, companyId: <current>}) by a no-read user → ${codeOf(r4)} "${cut(r4.err?.message, 80)}" · jobTitle saved=${k4.jobTitle === `ตำแหน่ง ${rand}`} · company kept=${k4.companyId === coA.id} (want OK · true · true)`);

    // S5 the edit sheet's own call (no companyId key) keeps the company
    const r5 = await call(() => CON.updateContact(noCo.ctx, noCo.actor, k.id, { firstName: `แก้ชื่อ ${rand}`, lastName: null, phone: null, email: null, jobTitle: null }));
    const k5 = await row(k.id);
    chk("SRV-edit-keeps", r5.ok && k5.firstName === `แก้ชื่อ ${rand}` && k5.companyId === coA.id && (await links(k.id)) === coA.id,
      `edit sheet save (no companyId) by a no-read user → ${codeOf(r5)} · firstName saved=${k5.firstName === `แก้ชื่อ ${rand}`} · company kept=${k5.companyId === coA.id} (want OK · kept)`);

    // S6 read-but-no-update: a change is refused before the contact row is written (it used to commit the other fields, then fail)
    const kr = await mkContact(shop, "อ่านได้", roCo.uid, { companyId: coA.id });
    const ar = await audits(kr.id);
    const r6 = await call(() => CON.updateContact(roCo.ctx, roCo.actor, kr.id, { firstName: `ชื่ออ่านได้ ${rand}`, companyId: coB.id }));
    const kr6 = await row(kr.id);
    chk("SRV-noupdate-atomic", codeOf(r6) === "FORBIDDEN" && kr6.firstName === "อ่านได้" && kr6.companyId === coA.id && (await audits(kr.id)) === ar,
      `updateContact({firstName, companyId: other}) by read-without-update → ${codeOf(r6)} · firstName "${kr6.firstName}" · company kept=${kr6.companyId === coA.id} · new audits=${(await audits(kr.id)) - ar} (want FORBIDDEN · unchanged · 0)`);

    // S7 positive control: a user who can link moves the company
    const kf = await mkContact(shop, "ย้ายได้", fullCo.uid, { companyId: coA.id });
    await P.crmCompany.updateMany({ where: { id: { in: [coA.id, coB.id] } }, data: { ownerUserId: fullCo.uid } });
    const r7 = await call(() => CON.updateContact(fullCo.ctx, fullCo.actor, kf.id, { companyId: coB.id }));
    const kf7 = await row(kf.id);
    await P.crmCompany.updateMany({ where: { id: { in: [coA.id, coB.id] } }, data: { ownerUserId: roCo.uid } });
    chk("SRV-control-move", r7.ok && kf7.companyId === coB.id, `updateContact({companyId: B}) by a user with company read+update → ${codeOf(r7)} "${cut(r7.err?.message, 80)}" · now B=${kf7.companyId === coB.id} (positive control)`);

    // S8 convert "pick existing" by a no-read user
    const kc = await mkContact(shop, "แปลง", noCo.uid);
    const r8 = await call(() => CON.convertContact(noCo.ctx, noCo.actor, kc.id, { idempotencyKey: `k-${rand}`, member: null, company: { id: coA.id, role: null }, deal: null }));
    const kc8 = await row(kc.id);
    chk("SRV-convert-pick-refused", codeOf(r8) === "FORBIDDEN" && kc8.companyId === null,
      `convertContact({company:{id}}) by a no-read user → ${codeOf(r8)} "${cut(r8.err?.message, 80)}" · companyId=${kc8.companyId} (want FORBIDDEN · null)`);
  });

  // ═══════════════════════ AI · assist briefs flag lines of unverified inbound mail ═══════════════════════
  await sub("AI", async () => {
    const s = await mkShop("ai");
    const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
    await setCrm(s.S, { email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });
    await P.aiCreditWallet.upsert({ where: { tenantId: s.tid }, create: { tenantId: s.tid, balanceMicro: 50_000_000, grantedAt: new Date() }, update: { balanceMicro: 50_000_000, grantedAt: new Date() } });
    const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
    const AI = (await import("@/lib/modules/crm/ai-bridges" as string)) as Any;
    const DEALS = (await import("@/lib/modules/crm/deals" as string)) as Any;
    const dom = `cust-${rand}.test`;
    const co = await mkCompany(s, `Co ${TAG}`, s.uid);
    const K = await mkContact(s, "ลูกค้าอีเมล", s.uid, { companyId: co.id, email: `buyer@${dom}` });
    const INBOX = `crm+${KEY}@shark.in.th`;
    let n = 0;
    const mail = (o: Record<string, unknown>) => ({ messageId: `<${TAG}-${++n}@probe.test>`, from: K.email, to: [INBOX], cc: [], subject: `เรื่อง ${n}`, text: "สวัสดี", html: "<p>สวัสดี</p>", headers: {}, attachments: [], ...o });
    const deps = { transport: async () => ({ ok: true, id: "copy" }) };
    const forged = await EM.ingestInbound(mail({ subject: `ปลอม ${rand}`, text: "โอนเข้าบัญชีใหม่" }), deps);
    const AUTHSERV = "mx.qc-cf7.test";
    process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
    let real: Any;
    try {
      real = await EM.ingestInbound(mail({ subject: `จริง ${rand}`, headers: { "authentication-results": `${AUTHSERV}; spf=pass smtp.mailfrom=${dom}; dkim=pass header.d=${dom}; dmarc=pass header.from=${dom}` } }), deps);
    } finally {
      if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID; else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
    }
    const deal = await DEALS.createDeal(s.ctx, s.owner, { pipelineId: s.pipe.id, title: `ดีล ${rand}`, contactId: K.id, companyId: co.id, valueSatang: 100_00 });
    // the inbound EMAIL rows also belong to the deal (the deal brief reads activities by dealId) + a NOTE sharing the forged sourceRef (must stay unflagged)
    await P.crmActivity.updateMany({ where: { tenantId: s.tid, contactId: K.id, source: "EMAIL" }, data: { dealId: deal.id } });
    await P.crmActivity.create({ data: { tenantId: s.tid, systemId: s.S, contactId: K.id, companyId: co.id, dealId: deal.id, type: "NOTE", title: `โน้ต ${rand}`, source: "MANUAL", sourceRef: forged.emailId, doneAt: new Date() } });
    const fRow = forged.emailId ? await P.crmEmailMessage.findUnique({ where: { id: forged.emailId }, select: { routing: true } }) : null;
    const rRow = real?.emailId ? await P.crmEmailMessage.findUnique({ where: { id: real.emailId }, select: { routing: true } }) : null;
    const acts = (await P.crmActivity.findMany({ where: { tenantId: s.tid, contactId: K.id }, select: { source: true, companyId: true, dealId: true } })) as Any[];
    chk("AI-premise", (fRow?.routing as Any)?.unverifiedFrom === true && !(rRow?.routing as Any)?.unverifiedFrom && acts.filter((a) => a.source === "EMAIL").length === 2 && acts.every((a) => a.companyId === co.id && a.dealId === deal.id),
      `forged flag=${(fRow?.routing as Any)?.unverifiedFrom} · authenticated flag=${(rRow?.routing as Any)?.unverifiedFrom} · activities ${acts.length} on company+deal=${acts.every((a) => a.companyId === co.id && a.dealId === deal.id)}`);
    const REPLY = JSON.stringify({ text: "ok", summary: "ok", nextStep: "ok", subject: "ok", body: "ok", message: "ok" });
    const brief = async (kind: string, id: string) => {
      const caps: string[] = [];
      const ai = { chat: async (messages: Any[]) => { caps.push(j(messages)); return { text: REPLY, tokensIn: 10, tokensOut: 10, model: "qc-fake" }; } };
      const r = await call(() => AI.runAssist(s.ctx, s.owner, { kind, id }, { ai }));
      const text = caps.join("\n").replace(/\\n/g, "\n");
      const line = (needle: string) => text.split("\n").find((l) => l.includes(needle)) ?? "";
      return { ok: r.ok, err: r.ok ? "" : cut(r.err?.message, 120), f: line(`ปลอม ${rand}`), t: line(`จริง ${rand}`), note: line(`โน้ต ${rand}`) };
    };
    for (const [kind, id] of [["contact.whyHot", K.id], ["company.summary", co.id], ["deal.summary", deal.id]] as const) {
      const b = await brief(kind, id);
      const FLAG = "(sender not verified)";
      chk(`AI-${kind}`, b.ok && b.f.includes(FLAG) && !!b.t && !b.t.includes(FLAG) && (!b.note || !b.note.includes(FLAG)),
        `${kind}: ok=${b.ok}${b.err ? ` "${b.err}"` : ""} · forged line "${cut(b.f, 90)}" · authenticated line "${cut(b.t, 70)}" · NOTE line "${cut(b.note, 50)}" (want forged flagged · authenticated + NOTE not)`);
    }
  });

  // ═══════════════════════ W · the pages pass the gate the components rely on ═══════════════════════
  await sub("W", async () => {
    const src = (p: string) => readFileSync(p, "utf8").replace(/\s+/g, " ");
    const pNew = src("src/app/app/sys/[id]/crm/contacts/new/page.tsx");
    const p360 = src("src/app/app/sys/[id]/crm/contacts/[contactId]/page.tsx");
    const pDeal = src("src/app/app/sys/[id]/crm/deals/new/page.tsx");
    chk("W-new", /<NewContactForm [^>]*canPickCompany=\{crmCanLinkCompany\(actor\)\}/.test(pNew), "contacts/new/page.tsx passes canPickCompany={crmCanLinkCompany(actor)}");
    chk("W-360-menu", /company: crmCanLinkCompany\(actor\)/.test(p360) && /companyName: data\.company\?\.name \?\? null/.test(p360),
      "contacts/[contactId]/page.tsx: ContactMenu can.company = crmCanLinkCompany(actor) · contact.companyName = data.company?.name ?? null (visibility-filtered)");
    chk("W-360-convert", /<ConvertButton [^>]*canPickCompany=\{crmCan\(actor, "crm\.company\.read"\)\}/.test(p360), "ConvertButton canPickCompany={crmCan(actor, \"crm.company.read\")}");
    chk("W-deal-new", /<NewDealForm [^>]*canPickCompany=\{crmCan\(actor, "crm\.company\.read"\)\}/.test(pDeal), "deals/new/page.tsx NewDealForm canPickCompany={crmCan(actor, \"crm.company.read\")}");
  });
} catch (e) {
  chk("FATAL", false, String((e as Error)?.stack ?? e).slice(0, 900));
} finally {
  R.useState = origUseState;
}
await done("probe-cf7");

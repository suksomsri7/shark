// C5.5-fix12 probe (builder) — RV10-1 (+ sweep) · RV10-2 · RV10-3 · RV10-4
//   DU   create / update / REST create / company create / import "update" with the phone, e-mail or tax id of a record the caller CANNOT see:
//        refused with ONE neutral text (no name · id · phone · e-mail · company), force does not bypass, nothing written · per persona
//        (owner · unit-limited manager · own-records staff · TEAM-level staff · API key filtered to one owner without company read)
//        positive controls: duplicates the caller CAN see behave as before (owner byte-identical to the RED run when CF16_BASELINE is set)
//   RT   people (not API keys) are rate-limited on phone/e-mail entry (bucket pre-filled to the limit)
//   WE   writer echoes (updateContact · setTags · setLeadStatus · …) return the masked DTO (same rule as 360)
//   KB   kanban CRM_CONTACT link subtitle follows the viewer's company visibility
//   EX   exportDeals computes the viewer's visibility once
//   SW   other doors of the class (probe-cf16-sweep.mts)
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-cf16-*` (swept in done()) · network blocked.
// Run: bash scripts/pending/cf16/run-probe.sh <logname> [baseline-dump.json]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const fx = await fixture("p");
const { P, chk, call, mkShop, mkUser, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const codeOf = (r: Any) => (r.ok ? "OK" : String(r.err?.code ?? r.err?.status ?? r.err?.name ?? "ERR"));
const rand = TAG.slice(-8);
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);
const errBlob = (r: Any) => (r.ok ? j(r.v) : `${String(r.err?.message ?? "")} ${j(r.err ?? null)} ${j({ ...(r.err ?? {}) })}`);

const MEM = (await import("@/lib/modules/member" as string)) as Any;
const { toMemberActor } = MEM;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
const CO = (await import("@/lib/modules/crm/companies" as string)) as Any;
const DEALS = (await import("@/lib/modules/crm/deals" as string)) as Any;
const WHERE = (await import("@/lib/modules/crm/where" as string)) as Any;
const SHARED = (await import("@/lib/modules/crm/contacts-shared" as string)) as Any;
const COS = (await import("@/lib/modules/crm/companies-shared" as string)) as Any;
const APIA = (await import("@/lib/modules/crm/api/actor" as string)) as Any;
const OPS = (await import("@/lib/modules/crm/api/ops/contacts" as string)) as Any;
const KL = (await import("@/lib/modules/kanban/links" as string)) as Any;
const KR = (await import("@/lib/modules/kanban/link-resolvers" as string)) as Any;
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const extra = (await import("./probe-cf16-sweep.mts" as string)) as Any;
const HIDDEN_MSG: string | undefined = SHARED.CONTACT_DUPLICATE_HIDDEN_MSG;
const CO_HIDDEN_MSG: string | undefined = COS.COMPANY_DUPLICATE_HIDDEN_MSG;

async function member(shop: Any, suffix: string, role: "STAFF" | "MANAGER", unitAccess: string[], keys: string[]) {
  const uid = await mkUser(`-${suffix}`);
  const permissions = Object.fromEntries(keys.map((k) => [k, true]));
  const m = await P.membership.create({ data: { userId: uid, tenantId: shop.tid, role, unitAccess, permissions, acceptedAt: new Date() } });
  return { uid, actor: toMemberActor(uid, m), ctx: { tenantId: shop.tid, systemId: shop.S, actorUserId: uid } };
}
async function mkCompany(shop: Any, name: string, ownerUserId: string, teamId: string | null = null, taxId: string | null = null) {
  const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "COMPANY", ...(taxId ? { taxId } : {}) } });
  return P.crmCompany.create({ data: { tenantId: shop.tid, systemId: shop.S, partyId: party.id, name, ownerUserId, teamId, ...(taxId ? { taxId, branchCode: "00000" } : {}) } });
}
async function mkContact(shop: Any, first: string, ownerUserId: string, opts: { companyId?: string | null; text?: string | null; teamId?: string | null; phone?: string | null; email?: string | null } = {}) {
  const name = `${first} ${TAG}`;
  const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "PERSON" } });
  const k = await P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name, firstName: first, partyId: party.id, ownerUserId, teamId: opts.teamId ?? null, companyId: opts.companyId ?? null, company: opts.text ?? null, phone: opts.phone ?? null, email: opts.email ?? null } });
  if (opts.companyId) await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: opts.companyId, contactId: k.id, isPrimary: true } });
  return k;
}
let phoneSeq = Math.floor(Math.random() * 1e6);
const newPhone = () => `08${String(10_000_000 + (phoneSeq++ % 89_999_999)).slice(0, 8)}`;
const BUCKETS: string[] = [];
const PREFIXES: string[] = []; // rate buckets of this probe's throwaway tenant only

try {
  const shop = await mkShop("a");
  PREFIXES.push(`crm:contact:ident:${shop.tid}:`);
  const owner = { label: "owner", actor: shop.owner, ctx: shop.ctx, uid: shop.uid };
  const TA = await P.team.create({ data: { tenantId: shop.tid, name: `TA ${TAG}`, unitIds: ["u-a"] } });
  const TB = await P.team.create({ data: { tenantId: shop.tid, name: `TB ${TAG}`, unitIds: ["u-b"] } });
  const KEYS = ["crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.contact.import", "crm.deal.read", "crm.deal.export", "crm.activity.read", "kanban.*"];
  const mgr = { label: "mgr", ...(await member(shop, "mgr", "MANAGER", ["u-a"], [])) };
  const staff = { label: "staff", ...(await member(shop, "own", "STAFF", ["*"], [...KEYS, "crm.company.read", "crm.company.create"])) }; // no team ⇒ own records
  const teamer = { label: "teamer", ...(await member(shop, "team", "STAFF", ["*"], [...KEYS, "crm.company.read", "crm.company.create"])) };
  const mate = { label: "mate", ...(await member(shop, "mate", "STAFF", ["*"], [...KEYS, "crm.company.read"])) };
  await P.teamMember.createMany({ data: [{ tenantId: shop.tid, teamId: TA.id, userId: teamer.uid }, { tenantId: shop.tid, teamId: TA.id, userId: mate.uid }] });
  // API key: contacts read/create/update, NO company read, filtered to staff's records (crm.filter.owner) ⇒ it can miss contacts
  const keyScopes = ["crm.contact.read", "crm.contact.create", "crm.contact.update", `crm.filter.owner:${staff.uid}`];
  const key = { label: "apikey", actor: APIA.crmActorForKey({ keyId: `k-${rand}`, scopes: keyScopes, createdById: staff.uid }), ctx: { tenantId: shop.tid, systemId: shop.S, actorUserId: staff.uid }, uid: staff.uid };
  const apiActor = APIA.crmApiKeyActor({ tenantId: shop.tid, systemId: shop.S, keyId: `k-${rand}`, keyName: "probe", scopes: keyScopes, createdById: staff.uid });
  const personas = [owner, mgr, staff, teamer, key] as Any[];
  const seesK = async (who: Any, id: string) => !!(await P.crmContact.findFirst({ where: { AND: [await WHERE.contactWhere(who.ctx, who.actor), { id }] } }));
  const seesCo = async (who: Any, id: string) => !!(await P.crmCompany.findFirst({ where: { AND: [await WHERE.companyWhere(who.ctx, who.actor), { id }] } }));

  // hidden record: owner's TB contact with phone + e-mail + company text = the hidden company's name
  const coH = await mkCompany(shop, `บริษัทลับ ${rand}`, shop.uid, TB.id);
  const pH = newPhone();
  const eH = `hid-${rand}@qc.invalid`;
  const kH = await mkContact(shop, "เจ้าของลับ", shop.uid, { companyId: coH.id, text: coH.name, teamId: TB.id, phone: pH, email: eH });
  const secrets = [kH.id, kH.name, "เจ้าของลับ", pH, eH, coH.name, coH.id];
  const leaks = (blob: string) => secrets.filter((x) => blob.includes(x));
  chk("P-premise", !(await seesK(mgr, kH.id)) && !(await seesK(staff, kH.id)) && !(await seesK(teamer, kH.id)) && !(await seesK(key, kH.id)) && (await seesK(owner, kH.id)),
    "the owner sees the hidden contact; manager (unit u-a), own-records staff, TEAM staff and the filtered API key do not");
  const countPhone = async (p: string) => P.crmContact.count({ where: { tenantId: shop.tid, phone: p } });
  const countEmail = async (e: string) => P.crmContact.count({ where: { tenantId: shop.tid, email: e } });
  const dump: Record<string, Any> = {};

  console.log("\n── DU · duplicates of a contact the caller cannot see ──");
  for (const who of personas.filter((x) => x.label !== "owner")) {
    const bad: string[] = [];
    const n0 = [await countPhone(pH), await countEmail(eH)];
    const tries: [string, Any][] = [
      ["phone", { firstName: `ลองเบอร์ ${who.label}`, phone: pH }],
      ["phone+force", { firstName: `ลองเบอร์บังคับ ${who.label}`, phone: pH, force: true }],
      ["email", { firstName: `ลองอีเมล ${who.label}`, email: eH.toUpperCase() }],
      ["email+force", { firstName: `ลองอีเมลบังคับ ${who.label}`, email: eH, force: true }],
    ];
    for (const [lbl, input] of tries) {
      const r = await call(() => CON.createContact(who.ctx, who.actor, input));
      const blob = errBlob(r);
      if (r.ok) bad.push(`${lbl}: OK created=${r.v?.created} contact=${r.v?.contact?.id === kH.id ? "THE HIDDEN ONE" : r.v?.contact?.id}`);
      else if (codeOf(r) !== "DUPLICATE" || r.err?.message !== HIDDEN_MSG) bad.push(`${lbl}: ${codeOf(r)} "${String(r.err?.message).slice(0, 80)}"`);
      const l = leaks(blob);
      if (l.length) bad.push(`${lbl}: leaks ${j(l)}`);
      if (r.err?.duplicates?.length) bad.push(`${lbl}: duplicates[] not empty`);
    }
    // update own contact to the hidden phone / e-mail
    const mine = await mkContact(shop, `ของฉัน ${who.label}`, who.uid);
    for (const [lbl, patch] of [["upd-phone", { phone: pH }], ["upd-email", { email: eH }]] as [string, Any][]) {
      const r = await call(() => CON.updateContact(who.ctx, who.actor, mine.id, patch));
      if (r.ok || codeOf(r) !== "DUPLICATE" || r.err?.message !== HIDDEN_MSG) bad.push(`${lbl}: ${codeOf(r)} "${String(r.err?.message ?? "").slice(0, 80)}"`);
      const l = leaks(errBlob(r));
      if (l.length) bad.push(`${lbl}: leaks ${j(l)}`);
    }
    const n1 = [await countPhone(pH), await countEmail(eH)];
    const mineAfter = await P.crmContact.findUnique({ where: { id: mine.id } });
    if (j(n0) !== j(n1) || mineAfter.phone || mineAfter.email) bad.push(`writes: phone rows ${n0[0]}→${n1[0]} email rows ${n0[1]}→${n1[1]} mine.phone=${mineAfter.phone}`);
    chk(`DU-hidden-${who.label}`, bad.length === 0, bad.join(" · ") || `create (phone · e-mail, with and without force) and update → DUPLICATE with the neutral text only, nothing written`);
  }
  // REST contacts.create (the AI tool crm_create_lead is this op) through the API key
  {
    const op = (OPS.CONTACTS_OPS as Any[]).find((o) => o.id === "contacts.create");
    const r = await call(() => op.handler({ actor: apiActor, params: {}, input: { firstName: `ลองผ่านคีย์ ${rand}`, phone: pH }, requestId: `r-${rand}`, idempotencyKey: null }));
    const l = leaks(errBlob(r));
    chk("DU-rest-create", !r.ok && (r.err?.message === HIDDEN_MSG || errBlob(r).includes(String(HIDDEN_MSG))) && /duplicate|409|DUPLICATE/.test(errBlob(r)) && l.length === 0, `REST contacts.create (key filtered to staff) with the hidden phone → ${codeOf(r)} ${r.ok ? j(r.v).slice(0, 120) : errBlob(r).slice(0, 260)} · leaks ${j(l)}`);
  }

  // mixed: one visible + one hidden duplicate (staff)
  {
    const pM = newPhone();
    const kV = await mkContact(shop, "เห็นร่วม", staff.uid, { phone: pM });
    const kH2 = await mkContact(shop, "ลับร่วม", shop.uid, { phone: pM, teamId: TB.id });
    const r = await call(() => CON.createContact(staff.ctx, staff.actor, { firstName: `ผสม ${rand}`, phone: pM }));
    const rf = await call(() => CON.createContact(staff.ctx, staff.actor, { firstName: `ผสมบังคับ ${rand}`, phone: pM, force: true }));
    const ok = r.ok && r.v.created === false && r.v.contact.id === kV.id && r.v.duplicates.length === 1 && r.v.duplicates[0].contactId === kV.id && r.v.duplicates[0].reason === "PHONE" && !errBlob(r).includes(kH2.id) && !errBlob(r).includes("ลับร่วม")
      && !rf.ok && rf.err?.message === HIDDEN_MSG && (await countPhone(pM)) === 2;
    chk("DU-mixed", ok, `visible + hidden duplicate · no force → ${codeOf(r)} returns the visible one only (duplicates=${j(r.v?.duplicates?.map((d: Any) => d.name))}) · force → ${codeOf(rf)} neutral (cannot verify the hidden one) · rows with that phone ${await countPhone(pM)}`);
  }

  // positive controls: duplicates the caller CAN see (each persona its own contact) — the normal shape, recorded for the RED/GREEN byte compare
  {
    const out: string[] = [];
    let ok = true;
    for (const who of personas) {
      const pV = newPhone();
      const eV = `vis-${who.label}-${rand}@qc.invalid`;
      const kV = await mkContact(shop, `เห็นเอง ${who.label}`, who.uid, { phone: pV, email: eV });
      const r = await call(() => CON.createContact(who.ctx, who.actor, { firstName: `ซ้ำที่เห็น ${who.label}`, phone: pV }));
      const rf = await call(() => CON.createContact(who.ctx, who.actor, { firstName: `ซ้ำที่เห็นบังคับ ${who.label}`, phone: pV, force: true }));
      const mine = await mkContact(shop, `แก้ชนที่เห็น ${who.label}`, who.uid);
      const ru = await call(() => CON.updateContact(who.ctx, who.actor, mine.id, { email: eV }));
      const good = r.ok && r.v.created === false && r.v.contact.id === kV.id && r.v.duplicates.length === 1 && r.v.duplicates[0].contactId === kV.id && String(r.v.duplicates[0].name ?? "").startsWith("เห็นเอง")
        && rf.ok && rf.v.created === true && rf.v.duplicates.length === 1 && rf.v.duplicates[0].contactId === kV.id
        && !ru.ok && codeOf(ru) === "DUPLICATE" && ru.err?.message !== HIDDEN_MSG && (ru.err?.duplicates ?? []).some((d: Any) => d.contactId === kV.id);
      ok = ok && good;
      out.push(`${who.label} ${good ? "same" : `DIFF ${codeOf(r)} created=${r.v?.created} same=${r.v?.contact?.id === kV.id} dups=${j(r.v?.duplicates)} / ${codeOf(rf)} created=${rf.v?.created} dups=${rf.v?.duplicates?.length} / ${codeOf(ru)} dups=${j(ru.err?.duplicates)}`}`);
      const strip = (v: Any) => JSON.parse(j(v ?? null).split(kV.id).join("<kV>").split(rf.v?.contact?.id ?? "§").join("<new>").split(who.uid).join("<me>").split(shop.tid).join("<t>").split(shop.S).join("<s>").split(rand).join("<r>").split(TAG).join("<TAG>").split(pV).join("<p>").split(eV).join("<e>").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<ts>").replace(/"partyId":"[^"]+"/g, '"partyId":"<p>"'));
      dump[who.label] = { dup: strip(r.v), forced: { created: rf.v?.created, duplicates: strip(rf.v?.duplicates) }, upd: { code: codeOf(ru), msg: ru.err?.message ?? null, dups: strip(ru.err?.duplicates) } };
    }
    chk("DU-visible-unchanged", ok, `duplicates the caller can see: create → created:false + that contact + duplicates[name] · force → created · update → old DUPLICATE text + duplicates · ${out.join(" · ")}`);
    // owner on the HIDDEN-for-others contact: unchanged (owner sees it)
    const ro = await call(() => CON.createContact(owner.ctx, owner.actor, { firstName: `เจ้าของซ้ำ ${rand}`, phone: pH }));
    chk("DU-owner-sees", ro.ok && ro.v.created === false && ro.v.contact.id === kH.id && ro.v.contact.companyText === coH.name, `owner duplicate of kH → ${codeOf(ro)} created=${ro.v?.created} contact=kH ${ro.v?.contact?.id === kH.id} companyText kept=${ro.v?.contact?.companyText === coH.name}`);
  }

  // company create with the tax id of a company the caller cannot see (and a visible one as control)
  {
    const { validTaxId } = (await import("./_fx.mts" as string)) as Any;
    const tH = validTaxId(`01055${String(Date.now()).slice(-7)}`);
    const tV = validTaxId(`01056${String(Date.now()).slice(-7)}`);
    await P.crmCompany.update({ where: { id: coH.id }, data: { taxId: tH, branchCode: "00000" } });
    const coV = await mkCompany(shop, `บริษัทเห็นภาษี ${rand}`, staff.uid, null, tV);
    const r = await call(() => CO.createCompany(staff.ctx, staff.actor, { name: `ลองภาษี ${rand}`, taxId: tH }));
    const rv = await call(() => CO.createCompany(staff.ctx, staff.actor, { name: `ลองภาษีเห็น ${rand}`, taxId: tV }));
    const ro = await call(() => CO.createCompany(owner.ctx, owner.actor, { name: `เจ้าของภาษี ${rand}`, taxId: tH }));
    const l = [coH.name, coH.id].filter((x) => errBlob(r).includes(x));
    const n = await P.crmCompany.count({ where: { tenantId: shop.tid, taxId: tH } });
    chk("DU-company-tax", !r.ok && codeOf(r) === "DUPLICATE" && r.err?.message === CO_HIDDEN_MSG && l.length === 0 && n === 1 && rv.ok && rv.v.created === false && rv.v.duplicateOf === coV.id && ro.ok && ro.v.duplicateOf === coH.id,
      `staff + hidden tax id → ${codeOf(r)} "${String(r.err?.message ?? "").slice(0, 60)}" leaks ${j(l)} rows ${n} · staff + visible tax id → ${codeOf(rv)} duplicateOf=visible ${rv.v?.duplicateOf === coV.id} · owner + hidden → duplicateOf ${ro.v?.duplicateOf === coH.id}`);
  }

  // import "update existing" with the hidden phone
  {
    const r = await call(() => CON.importContacts(staff.ctx, staff.actor, { rows: [{ ชื่อ: `นำเข้าลับ ${rand}`, เบอร์: pH }], mapping: { ชื่อ: "firstName", เบอร์: "phone" }, options: { onDuplicate: "update", source: "IMPORT" } }));
    const e = r.v?.result?.errors ?? [];
    const l = leaks(j(r.v ?? r.err));
    chk("DU-import-update", r.ok && r.v.result.updated === 0 && e.length === 1 && e[0].message === HIDDEN_MSG && l.length === 0 && (await countPhone(pH)) === 1,
      `import onDuplicate=update with the hidden phone → updated ${r.v?.result?.updated} · row message ${j(e[0]?.message)} · leaks ${j(l)}`);
  }

  // ═══════════ RT · rate limit of phone/e-mail entry for people ═══════════
  console.log("\n── RT ──");
  {
    const bucket = `crm:contact:ident:${shop.tid}:${teamer.uid}`;
    BUCKETS.push(bucket);
    const lim = SHARED.CONTACT_IDENT_RATE?.limit ?? 120;
    await P.chatRateBucket.upsert({ where: { key: bucket }, create: { key: bucket, count: lim, windowStart: new Date() }, update: { count: lim, windowStart: new Date() } });
    const r = await call(() => CON.createContact(teamer.ctx, teamer.actor, { firstName: `เกินเพดาน ${rand}`, phone: newPhone() }));
    const rn = await call(() => CON.createContact(teamer.ctx, teamer.actor, { firstName: `ไม่มีเบอร์ ${rand}` }));
    const rk = await call(() => CON.createContact(key.ctx, key.actor, { firstName: `คีย์ไม่นับ ${rand}`, phone: newPhone() }));
    // round 2 (RV12-1): the refusal has its own code RATE_LIMITED (429 · nothing written), not the plan-cap LIMIT — see probe-cf16-r2.mts
    chk("RT-person-limited", !r.ok && codeOf(r) === "RATE_LIMITED" && rn.ok && rn.v.created === true && rk.ok && rk.v.created === true,
      `bucket at ${lim}: person create with a phone → ${codeOf(r)} "${String(r.err?.message ?? "").slice(0, 70)}" · without phone/e-mail → ${codeOf(rn)} · API key (REST bucket) → ${codeOf(rk)}`);
  }

  // ═══════════ WE · writer echoes ═══════════
  console.log("\n── WE ──");
  {
    const out: string[] = [];
    let ok = true;
    for (const who of [owner, mgr, staff, teamer]) {
      const k = await mkContact(shop, `เขียนคืน ${who.label}`, who.uid, { companyId: coH.id, text: coH.name });
      const sees = await seesCo(who, coH.id);
      const want = sees ? coH.name : null;
      const rs = [
        ["update", await call(() => CON.updateContact(who.ctx, who.actor, k.id, { jobTitle: `j ${rand}` }))],
        ["tags", await call(() => CON.setTags(who.ctx, who.actor, k.id, ["x"]))],
        ["lead", await call(() => CON.setLeadStatus(who.ctx, who.actor, k.id, "CONTACTED"))],
        ["lifecycle", await call(() => CON.setLifecycle(who.ctx, who.actor, k.id, "LEAD"))],
      ] as [string, Any][];
      const d360 = await call(() => CON.getContact360(who.ctx, who.actor, k.id));
      for (const [lbl, r] of rs) {
        if (!r.ok) { out.push(`${who.label}/${lbl} ${codeOf(r)} ${String(r.err?.message).slice(0, 60)}`); continue; }
        if (r.v.companyText !== want || r.v.companyText !== d360.v?.contact?.companyText) { ok = false; out.push(`${who.label}/${lbl} companyText=${j(r.v.companyText)} want ${j(want)}`); }
      }
      out.push(`${who.label} sees company=${sees}`);
    }
    chk("WE-masked", ok, out.join(" · "));
  }

  // ═══════════ KB · kanban CRM_CONTACT subtitle ═══════════
  console.log("\n── KB ──");
  {
    const KAN = (await sysSvc.createSystem(shop.tid, "KANBAN", `บอร์ด ${TAG}`)).id as string;
    const board = await P.kanbanBoard.create({ data: { tenantId: shop.tid, systemId: KAN, name: `บอร์ด ${TAG}`, createdById: shop.uid } });
    for (const [i, n] of ["รอทำ", "เสร็จ"].entries()) await P.kanbanColumn.create({ data: { tenantId: shop.tid, systemId: KAN, boardId: board.id, name: n, sortOrder: i, position: `a${i}` } });
    for (const who of [teamer, mgr]) await P.kanbanBoardMember.create({ data: { tenantId: shop.tid, boardId: board.id, userId: who.uid, role: "EDITOR" } });
    const kTxt = await mkContact(shop, "การ์ดลับ", teamer.uid, { companyId: coH.id, text: coH.name }); // teamer sees the contact, not its company
    const kOwnTxt = await mkContact(shop, "การ์ดพิมพ์เอง", teamer.uid, { text: `พิมพ์เอง ${rand}` }); // no company link → own text stays
    const card = await call(() => KL.createCardFromExternal({ tenantId: shop.tid, systemId: KAN, actorUserId: shop.uid }, { boardId: board.id, title: `การ์ด ${rand}`, sourceType: "MANUAL", sourceKey: `${TAG}:kb`, links: [{ linkType: "CRM_CONTACT", linkId: kTxt.id, role: "RELATED" }, { linkType: "CRM_CONTACT", linkId: kOwnTxt.id, role: "RELATED" }] }));
    const cardId = String(card.v?.cardId ?? card.v?.id ?? "");
    const out: string[] = [];
    let ok = card.ok;
    for (const who of [owner, teamer]) {
      const kActor = { userId: who.uid, role: who.actor.role, unitAccess: who.actor.unitAccess, permissions: who.actor.permissions };
      const links = await call(() => KR.listCardLinks({ tenantId: shop.tid, systemId: KAN, actorUserId: who.uid }, kActor, cardId));
      const a = (links.v ?? []).find((x: Any) => x.linkId === kTxt.id);
      const b = (links.v ?? []).find((x: Any) => x.linkId === kOwnTxt.id);
      const sees = await seesCo(who, coH.id);
      const good = links.ok && a?.canView === true && (a?.subtitle ?? null) === (sees ? coH.name : null) && b?.subtitle === `พิมพ์เอง ${rand}` && (sees || !j(links.v).includes(coH.name));
      ok = ok && good;
      out.push(`${who.label}: ${codeOf(links)} hidden-link subtitle=${j(a?.subtitle ?? null)} own-text subtitle=${j(b?.subtitle ?? null)} (sees company ${sees})`);
    }
    chk("KB-subtitle", ok, `${codeOf(card)} · ${out.join(" · ")}`);
  }

  // ═══════════ EX · exportDeals visibility computed once ═══════════
  console.log("\n── EX ──");
  {
    // the viewer's access snapshot is ONE raw query reading "CrmVisibilityPolicy" (visibility.ts accessOf) — count those per export
    let n = 0;
    const orig = P.$queryRaw;
    let patched = false;
    try {
      P.$queryRaw = (...a: Any[]) => { const sql = Array.isArray(a[0]) ? (a[0] as string[]).join("?") : String(a[0]?.strings?.join?.("?") ?? a[0]?.sql ?? ""); if (sql.includes("CrmVisibilityPolicy")) n += 1; return orig.apply(P, a); };
      patched = P.$queryRaw !== orig;
    } catch { patched = false; }
    const r = await call(() => DEALS.exportDeals(teamer.ctx, teamer.actor, {}));
    if (patched) P.$queryRaw = orig;
    if (patched && n > 0) chk("EX-visibility-once", r.ok && n === 1, `exportDeals as TEAM staff → ${codeOf(r)} · access-snapshot queries ${n} (want 1 per export)`);
    else info("EX-visibility-once", `could not observe the access snapshot (patched=${patched}, n=${n}) — ${codeOf(r)}`);
  }

  // ═══════════ SW ═══════════
  if (extra?.run) await extra.run({ fx, shop, owner, mgr, staff, teamer, key, apiActor, personas, coH, kH, pH, eH, secrets, leaks, errBlob, info, j, codeOf, member, mkCompany, mkContact, newPhone, seesK, seesCo, HIDDEN_MSG, CO_HIDDEN_MSG, BUCKETS });

  // positive control vs the RED run
  {
    const out = process.env.CF16_DUMP;
    const base = process.env.CF16_BASELINE;
    if (out) { mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true }); writeFileSync(out, j(dump)); }
    if (base && existsSync(base)) {
      const old = JSON.parse(readFileSync(base, "utf8"));
      const diffs = Object.keys(dump).filter((l) => j(old[l]) !== j(dump[l]));
      chk("DU-control-vs-red", diffs.length === 0, `visible-duplicate responses (create · force · update) per persona byte-identical to the RED run (ids/timestamps normalised; companyText of these contacts is null so RV10-2 masking cannot differ) · differing: ${j(diffs)}`);
    } else info("DU-control", `no baseline (${base ?? "unset"})`);
  }
} catch (e) {
  chk("CRASH", false, String((e as Error)?.stack ?? e).slice(0, 600));
}
await done("probe-cf16", async () => {
  for (const b of BUCKETS) await P.chatRateBucket.deleteMany({ where: { key: b } }).catch(() => undefined);
  // buckets the probe's own people filled (one per person who typed a phone/e-mail)
  for (const pre of PREFIXES) await P.chatRateBucket.deleteMany({ where: { key: { startsWith: pre } } }).catch(() => undefined);
});

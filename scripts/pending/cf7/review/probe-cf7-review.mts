// C5.5-fix6 REVIEW probe (independent reviewer) — attacks on F3 (company link gate) and a regression sweep.
//   ATOM  every refusal writes NOTHING: per-table row counts of the whole throwaway tenant + the contact row + its company links are
//         identical before/after (audit, outbox, party, field seeds included)
//   ECHO  abuse of the "echo of the current companyId is accepted" path (padding · null/"" · number · moveOpenDeals · fields bag · API key)
//   REG   legitimate users keep what they could do before (read-only-company role: convert-link · deal with company; owner move+deals)
//   KNOWN the two pre-existing half-commit cases the builder left (measured, not asserted green/red — reported as INFO rows)
//   LEAK  the read-only line on the edit sheet: label/visibility for a read-only role whose primary company is not visible
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-cf7-rv-*` (swept in done()) · network blocked.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf7/review/probe-cf7-review.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
const { fixture } = (await import("../_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const fx = await fixture("rv");
const { P, chk, call, mkShop, mkUser, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const cut = (v: unknown, n = 140) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const codeOf = (r: Any) => (r.ok ? "OK" : String(r.err?.code ?? r.err?.name ?? "ERR"));
const rand = TAG.slice(-8);
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);

const { toMemberActor } = (await import("@/lib/modules/member" as string)) as Any;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
const DEALS = (await import("@/lib/modules/crm/deals" as string)) as Any;
const { crmActorForKey } = (await import("@/lib/modules/crm/api/actor" as string)) as Any;

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
async function mkContact(shop: Any, first: string, ownerUserId: string, opts: { companyId?: string | null; extra?: string[] } = {}) {
  const name = `${first} ${TAG}`;
  const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "PERSON" } });
  const k = await P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name, firstName: first, partyId: party.id, ownerUserId, companyId: opts.companyId ?? null } });
  if (opts.companyId) await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: opts.companyId, contactId: k.id, isPrimary: true } });
  for (const c of opts.extra ?? []) await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: c, contactId: k.id, isPrimary: false } });
  return k;
}

// ── whole-tenant snapshot: row count of every tenant-scoped table + the contact row + its links ──
const TABLES = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
  .map((r) => String(r.table_name))
  .filter((x) => /^[A-Za-z_]+$/.test(x))
  .sort();
async function snap(tid: string, contactId: string | null) {
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid)) as Any[])[0]?.n ?? 0);
    if (n) counts[t] = n;
  }
  const row = contactId ? await P.crmContact.findUnique({ where: { id: contactId } }) : null;
  const links = contactId ? await P.crmCompanyContact.findMany({ where: { contactId }, orderBy: { companyId: "asc" } }) : [];
  return { counts, row: j(row), links: j(links) };
}
function diff(a: Any, b: Any): string {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(a.counts), ...Object.keys(b.counts)])) if ((a.counts[k] ?? 0) !== (b.counts[k] ?? 0)) out.push(`${k} ${a.counts[k] ?? 0}→${b.counts[k] ?? 0}`);
  if (a.row !== b.row) out.push("contact row changed");
  if (a.links !== b.links) out.push("company links changed");
  return out.join(" · ") || "none";
}
/** run f and require: refusal with `code` and NOTHING written in the tenant */
async function refusedClean(id: string, tid: string, contactId: string | null, code: string, f: () => Promise<Any>, what: string) {
  const s0 = await snap(tid, contactId);
  const r = await call(f);
  const s1 = await snap(tid, contactId);
  const d = diff(s0, s1);
  chk(id, codeOf(r) === code && d === "none", `${what} → ${codeOf(r)} "${cut(r.err?.message, 70)}" · writes: ${d} (want ${code} · none)`);
  return r;
}

try {
  const shop = await mkShop("a");
  const BASE = ["crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.contact.convert", "crm.deal.read", "crm.deal.create", "crm.activity.read"];
  const noCo = await staff(shop, "noco", BASE);
  const roCo = await staff(shop, "roco", [...BASE, "crm.company.read"]);
  const upOnly = await staff(shop, "uponly", [...BASE, "crm.company.update"]);
  const fullCo = await staff(shop, "fullco", [...BASE, "crm.company.read", "crm.company.update"]);
  const owner = { actor: shop.owner, ctx: shop.ctx, uid: shop.uid };
  // companies: A/B visible to roCo + fullCo? — visibility for STAFF here is OWN ⇒ owned by the user who must see them
  const coA = await mkCompany(shop, `บริษัท A ${TAG}`, roCo.uid);
  const coB = await mkCompany(shop, `บริษัท B ${TAG}`, roCo.uid);
  const coF = await mkCompany(shop, `บริษัท F ${TAG}`, fullCo.uid);
  const coF2 = await mkCompany(shop, `บริษัท F2 ${TAG}`, fullCo.uid);
  const coX = await mkCompany(shop, `บริษัท X ลับ ${TAG}`, shop.uid); // owner's — invisible to every STAFF here
  const vis = async (who: Any, id: string) => !!(await P.crmCompany.findFirst({ where: { AND: [await (await import("@/lib/modules/crm/where" as string)).companyWhere(who.ctx, who.actor), { id }] } }));
  chk("P-premise", (await vis(roCo, coA.id)) && !(await vis(roCo, coX.id)) && (await vis(fullCo, coF.id)) && !(await vis(fullCo, coX.id)) && !(await vis(noCo, coA.id)) && !(await vis(upOnly, coA.id)),
    "visibility: roCo sees A not X · fullCo sees F not X · noCo/upOnly see nothing");

  // ═══════════ ATOM · refusal = nothing written anywhere in the tenant ═══════════
  console.log("\n── ATOM ──");
  await refusedClean("ATOM-create-noread", shop.tid, null, "FORBIDDEN", () => CON.createContact(noCo.ctx, noCo.actor, { firstName: `สร้าง ${rand}`, companyId: coA.id }), "createContact({companyId}) no-read");
  await refusedClean("ATOM-create-uponly", shop.tid, null, "FORBIDDEN", () => CON.createContact(upOnly.ctx, upOnly.actor, { firstName: `สร้าง2 ${rand}`, companyId: coA.id }), "createContact({companyId}) update-without-read");
  const kN = await mkContact(shop, "ไม่มีสิทธิ์", noCo.uid, { companyId: coA.id });
  await refusedClean("ATOM-clear-noread", shop.tid, kN.id, "FORBIDDEN", () => CON.updateContact(noCo.ctx, noCo.actor, kN.id, { firstName: `x ${rand}`, jobTitle: "j", fields: {}, companyId: null }), "update {firstName, jobTitle, companyId:null} no-read");
  await refusedClean("ATOM-change-noread", shop.tid, kN.id, "FORBIDDEN", () => CON.updateContact(noCo.ctx, noCo.actor, kN.id, { firstName: `x ${rand}`, companyId: coB.id, moveOpenDeals: true }), "update {firstName, companyId:B, moveOpenDeals} no-read");
  await refusedClean("ATOM-empty-noread", shop.tid, kN.id, "FORBIDDEN", () => CON.updateContact(noCo.ctx, noCo.actor, kN.id, { firstName: `x ${rand}`, companyId: "" }), "update {firstName, companyId:\"\"} no-read (= clear)");
  await refusedClean("ATOM-number-noread", shop.tid, kN.id, "FORBIDDEN", () => CON.updateContact(noCo.ctx, noCo.actor, kN.id, { firstName: `x ${rand}`, companyId: 12345 }), "update {companyId: 12345} no-read");
  await refusedClean("ATOM-case-noread", shop.tid, kN.id, "FORBIDDEN", () => CON.updateContact(noCo.ctx, noCo.actor, kN.id, { firstName: `x ${rand}`, companyId: coA.id.toUpperCase() }), "update {companyId: UPPER(current)} no-read (not an echo)");
  await refusedClean("ATOM-fieldsbag", shop.tid, kN.id, "VALIDATION", () => CON.updateContact(noCo.ctx, noCo.actor, kN.id, { firstName: `x ${rand}`, fields: { companyId: coB.id } }), "update {fields:{companyId:B}} no-read (governed key)");
  const kU = await mkContact(shop, "แก้ได้แต่ไม่เห็น", upOnly.uid, { companyId: coA.id });
  await refusedClean("ATOM-change-uponly", shop.tid, kU.id, "FORBIDDEN", () => CON.updateContact(upOnly.ctx, upOnly.actor, kU.id, { firstName: `x ${rand}`, companyId: coB.id }), "update {firstName, companyId:B} update-without-read");
  const kR = await mkContact(shop, "อ่านได้", roCo.uid, { companyId: coA.id });
  await refusedClean("ATOM-change-ro", shop.tid, kR.id, "FORBIDDEN", () => CON.updateContact(roCo.ctx, roCo.actor, kR.id, { firstName: `x ${rand}`, companyId: coB.id }), "update {firstName, companyId:B} read-without-update");
  await refusedClean("ATOM-clear-ro", shop.tid, kR.id, "FORBIDDEN", () => CON.updateContact(roCo.ctx, roCo.actor, kR.id, { firstName: `x ${rand}`, companyId: null }), "update {firstName, companyId:null} read-without-update");
  const kNone = await mkContact(shop, "ไม่มีบริษัท", noCo.uid);
  await refusedClean("ATOM-set-noread", shop.tid, kNone.id, "FORBIDDEN", () => CON.updateContact(noCo.ctx, noCo.actor, kNone.id, { firstName: `x ${rand}`, companyId: coA.id }), "update {companyId:A} on a contact without company, no-read");
  const kC = await mkContact(shop, "แปลง", noCo.uid);
  await refusedClean("ATOM-convert-noread", shop.tid, kC.id, "FORBIDDEN", () => CON.convertContact(noCo.ctx, noCo.actor, kC.id, { idempotencyKey: `k1-${rand}`, member: null, company: { id: coA.id }, deal: { pipelineId: shop.pipe.id, title: `d ${rand}` } }), "convert {company:{id}, deal} no-read");
  // API key: contact keys only
  const key = crmActorForKey({ keyId: `k-${rand}`, scopes: ["crm.contact.read", "crm.contact.update"], createdById: shop.uid });
  const keyCtx = { tenantId: shop.tid, systemId: shop.S, actorUserId: null };
  const kK = await mkContact(shop, "คีย์", shop.uid, { companyId: coA.id });
  await refusedClean("ATOM-api-change", shop.tid, kK.id, "FORBIDDEN", () => CON.updateContact(keyCtx, key, kK.id, { jobTitle: `j ${rand}`, companyId: coB.id }), "API key (contact.update only) update {jobTitle, companyId:B}");

  // ═══════════ ECHO · the accepted path cannot smuggle a change ═══════════
  console.log("\n── ECHO ──");
  const dealA = await DEALS.createDeal(owner.ctx, owner.actor, { pipelineId: shop.pipe.id, title: `ดีล echo ${rand}`, contactId: kN.id, companyId: coA.id, valueSatang: 100 });
  const linksOf = async (id: string) => ((await P.crmCompanyContact.findMany({ where: { contactId: id, endedAt: null }, select: { companyId: true, isPrimary: true } })) as Any[]).map((l) => `${l.companyId === coA.id ? "A" : l.companyId === coB.id ? "B" : l.companyId}${l.isPrimary ? "*" : ""}`).sort().join(",");
  {
    const r = await call(() => CON.updateContact(noCo.ctx, noCo.actor, kN.id, { jobTitle: `pad ${rand}`, companyId: `  ${coA.id}  `, moveOpenDeals: true }));
    const row = await P.crmContact.findUnique({ where: { id: kN.id } });
    const d = await P.crmDeal.findUnique({ where: { id: dealA.id }, select: { companyId: true } });
    const au = (await P.auditLog.findMany({ where: { tenantId: shop.tid, targetId: kN.id, action: "crm.contact.update" }, orderBy: { createdAt: "desc" }, take: 1 })) as Any[];
    const ev = (await P.outboxEvent.findMany({ where: { tenantId: shop.tid, type: { startsWith: "crm.contact." }, idempotencyKey: { contains: kN.id } }, orderBy: { createdAt: "desc" }, take: 1 }).catch(() => [])) as Any[];
    const keys = (au[0]?.after as Any)?.changedKeys ?? [];
    chk("ECHO-pad-move", r.ok && row.jobTitle === `pad ${rand}` && row.companyId === coA.id && (await linksOf(kN.id)) === "A*" && d.companyId === coA.id && !keys.includes("companyId"),
      `no-read echo "  <A>  " + moveOpenDeals:true + jobTitle → ${codeOf(r)} · jobTitle saved=${row.jobTitle === `pad ${rand}`} · company=${row.companyId === coA.id ? "A" : row.companyId} links=${await linksOf(kN.id)} · deal still A=${d.companyId === coA.id} · audit changedKeys=${j(keys)} · last event=${cut(j(ev[0]?.payload ?? null), 80)} (want OK · A · A* · deal A · no companyId key)`);
  }
  {
    const r = await call(() => CON.updateContact(noCo.ctx, noCo.actor, kNone.id, { jobTitle: `n ${rand}`, companyId: null }));
    const r2 = await call(() => CON.updateContact(noCo.ctx, noCo.actor, kNone.id, { jobTitle: `e ${rand}`, companyId: "" }));
    const row = await P.crmContact.findUnique({ where: { id: kNone.id } });
    chk("ECHO-null-none", r.ok && r2.ok && row.companyId === null && row.jobTitle === `e ${rand}`, `no-read companyId:null / "" on a contact WITHOUT company → ${codeOf(r)} / ${codeOf(r2)} · companyId=${row.companyId} (want OK/OK · null — echo of "no company")`);
  }
  {
    const r = await call(() => CON.updateContact(keyCtx, key, kK.id, { jobTitle: `api ${rand}`, companyId: coA.id }));
    const row = await P.crmContact.findUnique({ where: { id: kK.id } });
    chk("ECHO-api", r.ok && row.jobTitle === `api ${rand}` && row.companyId === coA.id, `API key (contact keys only) sends back the DTO (companyId = current) + jobTitle → ${codeOf(r)} "${cut(r.err?.message, 60)}" · company kept=${row.companyId === coA.id}`);
  }
  {
    // read-without-update user echoing the current id: no change, no FORBIDDEN, no companyId audit key
    const r = await call(() => CON.updateContact(roCo.ctx, roCo.actor, kR.id, { jobTitle: `ro ${rand}`, companyId: coA.id, moveOpenDeals: true }));
    const row = await P.crmContact.findUnique({ where: { id: kR.id } });
    chk("ECHO-ro", r.ok && row.companyId === coA.id && row.jobTitle === `ro ${rand}`, `read-without-update echo + jobTitle → ${codeOf(r)} "${cut(r.err?.message, 60)}" · company kept=${row.companyId === coA.id}`);
  }

  // ═══════════ REG · legitimate users ═══════════
  console.log("\n── REG ──");
  {
    const kc = await mkContact(shop, "แปลงอ่านได้", roCo.uid);
    const r = await call(() => CON.convertContact(roCo.ctx, roCo.actor, kc.id, { idempotencyKey: `k2-${rand}`, member: null, company: { id: coA.id }, deal: null }));
    const row = await P.crmContact.findUnique({ where: { id: kc.id } });
    chk("REG-ro-convert-pick", r.ok && row.companyId === coA.id, `read-only-company role converts with "pick existing" A → ${codeOf(r)} "${cut(r.err?.message, 70)}" · companyId=A ${row.companyId === coA.id} (want OK — modal still offers it for read)`);
  }
  {
    const r = await call(() => DEALS.createDeal(roCo.ctx, roCo.actor, { pipelineId: shop.pipe.id, title: `ro deal ${rand}`, contactId: kR.id, companyId: coA.id }));
    chk("REG-ro-deal-company", r.ok && r.v?.companyId === coA.id, `read-only-company role createDeal(companyId A) for its contact at A → ${codeOf(r)} "${cut(r.err?.message, 70)}" · deal company A=${r.v?.companyId === coA.id}`);
  }
  {
    const r = await call(() => CON.createContact(fullCo.ctx, fullCo.actor, { firstName: `ผูกได้ ${rand}`, companyId: coF.id }));
    const row = r.ok ? await P.crmContact.findUnique({ where: { id: r.v.contact.id } }) : null;
    chk("REG-full-create-link", r.ok && row?.companyId === coF.id && (r.v.warnings ?? []).length === 0, `STAFF with company read+update createContact({companyId F}) → ${codeOf(r)} · companyId F=${row?.companyId === coF.id} · warnings ${j(r.v?.warnings ?? null)}`);
  }
  {
    const kO = await mkContact(shop, "เจ้าของย้าย", shop.uid, { companyId: coA.id });
    const dO = await DEALS.createDeal(owner.ctx, owner.actor, { pipelineId: shop.pipe.id, title: `ดีลเจ้าของ ${rand}`, contactId: kO.id, companyId: coA.id });
    const r = await call(() => CON.updateContact(owner.ctx, owner.actor, kO.id, { firstName: `ย้ายแล้ว ${rand}`, companyId: coB.id, moveOpenDeals: true }));
    const row = await P.crmContact.findUnique({ where: { id: kO.id } });
    const d = await P.crmDeal.findUnique({ where: { id: dO.id }, select: { companyId: true } });
    chk("REG-owner-move-deals", r.ok && row.companyId === coB.id && d.companyId === coB.id, `owner update {firstName, companyId B, moveOpenDeals} → ${codeOf(r)} · contact B=${row.companyId === coB.id} · deal B=${d.companyId === coB.id}`);
  }
  {
    const r = await call(() => CON.createContact(noCo.ctx, noCo.actor, { firstName: `แบบฟอร์ม ${rand}`, companyId: null }));
    chk("REG-noread-create-null", r.ok && r.v.created === true, `no-read createContact({companyId:null}) (what the hidden form now posts) → ${codeOf(r)}`);
  }

  // ═══════════ KNOWN · pre-existing half-commit cases (measured) ═══════════
  console.log("\n── KNOWN ──");
  {
    // read-without-update create with a visible company: contact created, link fails → warning (API only now; form hides the picker)
    const s0 = await snap(shop.tid, null);
    const r = await call(() => CON.createContact(roCo.ctx, roCo.actor, { firstName: `ro create ${rand}`, companyId: coA.id }));
    const s1 = await snap(shop.tid, null);
    const row = r.ok ? await P.crmContact.findUnique({ where: { id: r.v.contact.id } }) : null;
    info("KNOWN-ro-create", `read-without-update createContact({companyId A}) → ${codeOf(r)} created=${r.v?.created} companyId=${row?.companyId} warnings=${cut(j(r.v?.warnings ?? null), 120)} · writes: ${diff(s0, s1)}`);
  }
  {
    // read+update user, current company NOT visible (owner's X): clear
    const kI = await mkContact(shop, "บริษัทลับ", fullCo.uid, { companyId: coX.id });
    const s0 = await snap(shop.tid, kI.id);
    const r = await call(() => CON.updateContact(fullCo.ctx, fullCo.actor, kI.id, { firstName: `ล้างลับ ${rand}`, companyId: null }));
    const s1 = await snap(shop.tid, kI.id);
    const row = await P.crmContact.findUnique({ where: { id: kI.id } });
    info("KNOWN-invisible-clear", `read+update, current company invisible, update {firstName, companyId:null} → ${codeOf(r)} "${cut(r.err?.message, 60)}" · firstName now "${cut(row.firstName, 30)}" company kept=${row.companyId === coX.id} · writes: ${diff(s0, s1)}`);
    // same user moves it to a visible company with moveOpenDeals — deals at the invisible company
    const dX = await DEALS.createDeal(owner.ctx, owner.actor, { pipelineId: shop.pipe.id, title: `ดีลลับ ${rand}`, contactId: kI.id, companyId: coX.id, ownerUserId: shop.uid });
    const r2 = await call(() => CON.updateContact(fullCo.ctx, fullCo.actor, kI.id, { companyId: coF.id, moveOpenDeals: true }));
    const row2 = await P.crmContact.findUnique({ where: { id: kI.id } });
    const d2 = await P.crmDeal.findUnique({ where: { id: dX.id }, select: { companyId: true } });
    const links2 = ((await P.crmCompanyContact.findMany({ where: { contactId: kI.id, endedAt: null }, select: { companyId: true, isPrimary: true } })) as Any[]).map((l) => `${l.companyId === coX.id ? "X" : l.companyId === coF.id ? "F" : "?"}${l.isPrimary ? "*" : ""}`).sort().join(",");
    info("KNOWN-invisible-move", `read+update moves contact from invisible X to visible F with moveOpenDeals → ${codeOf(r2)} · contact company=${row2.companyId === coF.id ? "F" : row2.companyId === coX.id ? "X" : row2.companyId} links=${links2} · owner's deal at X now ${d2.companyId === coF.id ? "F (moved)" : d2.companyId === coX.id ? "X" : d2.companyId}`);
  }
  {
    // /deals/new with the picker hidden: server defaults the deal's company from the contact (no visibility check)
    const kD = await mkContact(shop, "ดีลไม่มีสิทธิ์", noCo.uid, { companyId: coA.id });
    const r = await call(() => DEALS.createDeal(noCo.ctx, noCo.actor, { pipelineId: shop.pipe.id, title: `deal noread ${rand}`, contactId: kD.id, companyId: null }));
    info("KNOWN-deal-default", `no-read createDeal(companyId:null) for contact at A → ${codeOf(r)} · deal.companyId = ${r.v?.companyId === coA.id ? "A (contact default, not visible to the user)" : r.v?.companyId} · dto company name=${cut(j(r.v?.company ?? r.v?.companyName ?? null), 60)}`);
    chk("E-deal-default-unchanged", r.ok, `no-read createDeal without company still works → ${codeOf(r)} "${cut(r.err?.message, 60)}"`);
  }

  {
    // echo of the DTO by a user WITH company read whose current company is NOT visible (team/OWN scope): the echo exception covers no-read only
    const kE = await mkContact(shop, "เอคโคลับ", roCo.uid, { companyId: coX.id });
    const s0 = await snap(shop.tid, kE.id);
    const r = await call(() => CON.updateContact(roCo.ctx, roCo.actor, kE.id, { jobTitle: `echo ${rand}`, companyId: coX.id }));
    const s1 = await snap(shop.tid, kE.id);
    info("KNOWN-echo-invisible", `read-only role echoes the current (invisible) company id + jobTitle → ${codeOf(r)} "${cut(r.err?.message, 70)}" · writes: ${diff(s0, s1)}`);
  }

  // ═══════════ LEAK · read-only line label/visibility ═══════════
  console.log("\n── LEAK ──");
  {
    const kM = await mkContact(shop, "หลักลับ", roCo.uid, { companyId: coX.id, extra: [coA.id] });
    const dM = (await CON.getContact360(roCo.ctx, roCo.actor, kM.id)) as Any;
    const dN = (await CON.getContact360(noCo.ctx, noCo.actor, (await mkContact(shop, "ไม่มีสิทธิ์2", noCo.uid, { companyId: coX.id, extra: [coA.id] })).id)) as Any;
    chk("LEAK-no-invisible-name", dM.company?.id !== coX.id && !j(dM).includes(coX.name) && dN.company === null && !j(dN).includes(coX.name) && !j(dN).includes(coA.name),
      `getContact360: read-only role → company ${dM.company?.id === coA.id ? "A" : j(dM.company)} (X name present=${j(dM).includes(coX.name)}) · no-read → ${j(dN.company)} (A/X names present=${j(dN).includes(coA.name)}/${j(dN).includes(coX.name)}) (want no X name anywhere · no-read null)`);
    info("LEAK-label", `primary company X is invisible, A is a non-primary current link ⇒ data.company = ${dM.company?.id === coA.id ? "A" : j(dM.company)} isPrimary=${dM.company?.isPrimary} ⇒ edit sheet read-only line would read "บริษัทหลัก: ${dM.company?.name ?? "-"}"`);
  }
} catch (e) {
  chk("FATAL", false, String((e as Error)?.stack ?? e).slice(0, 900));
}
await done("probe-cf7-review");

// C5.5-fix10 REVIEW probe (independent reviewer) — attacks on 018b68bb
//   LK   leaks that remain for a viewer who cannot see the company / contact: writer echoes (update returns raw companyText) ·
//        create-with-duplicate-phone returns the EXISTING (possibly invisible) contact · deal list filtered by a hidden companyId ·
//        deal title / q search · score on cards
//   RG   regression for legitimate viewers: legacy free text with NO company link stays visible on every contact surface · free text
//        that differs from the linked visible company · visible archived company falls back to the text · deal cards for viewers with
//        visibility equal the system-scope names (model of the old output) for owner · unit-scoped manager · TEAM-level staff
//   DT   DATETIME `.sss` export edges incl. negative epoch with ms, round-trip through import
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-cf13-rv-*` (swept in done()) · network blocked.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf13/review/probe-cf13-review.mts
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

const MEM = (await import("@/lib/modules/member" as string)) as Any;
const { toMemberActor } = MEM;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
const DEALS = (await import("@/lib/modules/crm/deals" as string)) as Any;
const SEQ = (await import("@/lib/modules/crm/sequences" as string)) as Any;
const { HIDDEN_CONTACT_NAME } = (await import("@/lib/modules/crm/deals-shared" as string)) as Any;

async function member(shop: Any, suffix: string, role: "STAFF" | "MANAGER", unitAccess: string[], keys: string[]) {
  const uid = await mkUser(`-${suffix}`);
  const permissions = Object.fromEntries(keys.map((k) => [k, true]));
  const m = await P.membership.create({ data: { userId: uid, tenantId: shop.tid, role, unitAccess, permissions, acceptedAt: new Date() } });
  return { uid, actor: toMemberActor(uid, m), ctx: { tenantId: shop.tid, systemId: shop.S, actorUserId: uid } };
}
async function mkCompany(shop: Any, name: string, ownerUserId: string, teamId: string | null = null) {
  const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "COMPANY" } });
  return P.crmCompany.create({ data: { tenantId: shop.tid, systemId: shop.S, partyId: party.id, name, ownerUserId, teamId } });
}
async function mkContact(shop: Any, first: string, ownerUserId: string, opts: { companyId?: string | null; text?: string | null; teamId?: string | null; phone?: string | null; score?: number } = {}) {
  const name = `${first} ${TAG}`;
  const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "PERSON" } });
  const k = await P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name, firstName: first, partyId: party.id, ownerUserId, teamId: opts.teamId ?? null, companyId: opts.companyId ?? null, company: opts.text ?? null, phone: opts.phone ?? null, score: opts.score ?? 0 } });
  if (opts.companyId) await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId: opts.companyId, contactId: k.id, isPrimary: true } });
  return k;
}

try {
  const shop = await mkShop("a");
  const owner = { actor: shop.owner, ctx: shop.ctx, uid: shop.uid };
  const TA = await P.team.create({ data: { tenantId: shop.tid, name: `TA ${TAG}`, unitIds: ["u-a"] } });
  const TB = await P.team.create({ data: { tenantId: shop.tid, name: `TB ${TAG}`, unitIds: ["u-b"] } });
  const KEYS = ["crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.deal.read", "crm.deal.create", "crm.activity.read", "crm.sequence.enroll"];
  const mgr = await member(shop, "mgr", "MANAGER", ["u-a"], []);
  const teamer = await member(shop, "teamer", "STAFF", ["*"], [...KEYS, "crm.company.read"]);
  const mate = await member(shop, "mate", "STAFF", ["*"], [...KEYS, "crm.company.read"]);
  const noCo = await member(shop, "noco", "STAFF", ["*"], KEYS);
  await P.teamMember.createMany({ data: [{ tenantId: shop.tid, teamId: TA.id, userId: teamer.uid }, { tenantId: shop.tid, teamId: TA.id, userId: mate.uid }] });
  // companies: V = mate's (TEAM-visible to teamer, TA for mgr) · H = owner's in TB (hidden to mgr/teamer/noCo)
  const coV = await mkCompany(shop, `บริษัทเห็น ${rand}`, mate.uid, TA.id);
  const coH = await mkCompany(shop, `บริษัทลับ ${rand}`, shop.uid, TB.id);
  const coVA = await mkCompany(shop, `บริษัทเห็นเก็บ ${rand}`, mate.uid, TA.id);
  await P.crmCompany.update({ where: { id: coVA.id }, data: { archivedAt: new Date() } });
  const vis = async (who: Any, id: string) => !!(await P.crmCompany.findFirst({ where: { AND: [await (await import("@/lib/modules/crm/where" as string)).companyWhere(who.ctx, who.actor), { id }] } }));
  chk("P-premise", (await vis(teamer, coV.id)) && !(await vis(teamer, coH.id)) && (await vis(mgr, coV.id)) && !(await vis(mgr, coH.id)) && !(await vis(noCo, coV.id)),
    "TEAM-level staff sees its teammate's company, not TB's · unit-scoped manager sees TA not TB · noCo sees no company");

  // ═══════════ LK · remaining leak paths ═══════════
  console.log("\n── LK ──");
  {
    // writer echo: noCo / teamer edit their own visible contact linked to a hidden company whose legacy text = its name
    for (const [label, who] of [["teamer", teamer], ["noco", noCo]] as const) {
      const k = await mkContact(shop, `เขียนคืน ${label}`, (who as Any).uid, { companyId: coH.id, text: coH.name });
      const d360 = (await CON.getContact360((who as Any).ctx, (who as Any).actor, k.id)) as Any;
      const r = await call(() => CON.updateContact((who as Any).ctx, (who as Any).actor, k.id, { jobTitle: `j ${rand}` }));
      const t = await call(() => CON.setTags((who as Any).ctx, (who as Any).actor, k.id, ["x"]));
      info(`LK-writer-echo-${label}`, `360 companyText=${j(d360.contact.companyText)} (masked) · updateContact response companyText=${j(r.v?.companyText ?? r.err?.message ?? null)} · setTags response companyText=${j(t.v?.companyText ?? (t.ok ? null : codeOf(t)))} — hidden name returned to the writer=${j(r.v ?? null).includes(coH.name) || j(t.v ?? null).includes(coH.name)}`);
    }
  }
  {
    // create with the phone of an existing contact the creator cannot see → the existing contact's DTO comes back
    const phone = `08${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const kO = await mkContact(shop, "เจ้าของเท่านั้น", shop.uid, { companyId: coH.id, text: coH.name, phone, teamId: TB.id });
    const seen = !!(await P.crmContact.findFirst({ where: { AND: [await (await import("@/lib/modules/crm/where" as string)).contactWhere(noCo.ctx, noCo.actor), { id: kO.id }] } }));
    const r = await call(() => CON.createContact(noCo.ctx, noCo.actor, { firstName: `ลองเบอร์ ${rand}`, phone }));
    info("LK-create-duplicate", `noCo cannot see the owner's contact (visible=${seen}) · createContact with its phone → ${codeOf(r)} created=${r.v?.created} · returned contact id=existing ${r.v?.contact?.id === kO.id} · name=${j(r.v?.contact?.name)} phone=${j(r.v?.contact?.phone)} companyText=${j(r.v?.contact?.companyText)} · duplicates=${j(r.v?.duplicates)} (REST contacts.create returns this \`contact\` as-is · UI action returns duplicates[].name)`);
    chk("LK-create-duplicate-masked", !(r.ok && r.v?.contact?.id === kO.id && String(r.v?.contact?.name ?? "").includes("เจ้าของเท่านั้น")),
      "creating with the phone of an invisible contact does not return that contact's name/details (PRE-EXISTING since C1.4 — reported, not in this card's sweep)");
  }
  {
    const kN = await mkContact(shop, "ดีลกรอง", noCo.uid, { companyId: coH.id });
    const d = await DEALS.createDeal(noCo.ctx, noCo.actor, { pipelineId: shop.pipe.id, title: `กรอง ${rand}`, contactId: kN.id });
    const byId = await call(() => DEALS.listDeals(noCo.ctx, noCo.actor, { companyId: coH.id }));
    const card = (byId.v?.items ?? []).find((x: Any) => x.id === d.id);
    const q = await call(() => DEALS.listDeals(noCo.ctx, noCo.actor, { q: "บริษัทลับ" }));
    chk("LK-filters", !!card && card.companyName === null && (q.v?.items ?? []).every((x: Any) => !String(x.title).includes(coH.name)) && !(q.v?.items ?? []).some((x: Any) => x.id === d.id),
      `listDeals({companyId: hidden}) → card present=${!!card} name=${j(card?.companyName)} (id-based filter, no name) · q="บริษัทลับ" hits this deal=${(q.v?.items ?? []).some((x: Any) => x.id === d.id)} (q searches titles only)`);
  }
  {
    // hidden contact on a visible deal: card name placeholder + score 0 (and the board is ordered by stageEnteredAt, not score)
    const kH = await mkContact(shop, "ผู้ติดต่อลับ", shop.uid, { teamId: TB.id, score: 77 });
    const d = await DEALS.createDeal(owner.ctx, owner.actor, { pipelineId: shop.pipe.id, title: `ดีลคนลับ ${rand}`, contactId: kH.id, ownerUserId: noCo.uid });
    const lst = await DEALS.listDeals(noCo.ctx, noCo.actor, {});
    const card = lst.items.find((x: Any) => x.id === d.id);
    const board = await DEALS.getBoard(noCo.ctx, noCo.actor, { pipelineId: shop.pipe.id });
    chk("LK-hidden-contact", card?.contactName === HIDDEN_CONTACT_NAME && card?.score === 0 && !j(board).includes("ผู้ติดต่อลับ") && !j(lst).includes("ผู้ติดต่อลับ"),
      `noCo sees the deal (owner assigned it to noCo) but not its contact → name ${j(card?.contactName)} score ${card?.score} · board/list contain the hidden name=${j(board).includes("ผู้ติดต่อลับ") || j(lst).includes("ผู้ติดต่อลับ")}`);
  }

  // ═══════════ RG · legitimate viewers ═══════════
  console.log("\n── RG ──");
  {
    // legacy text without any company link — must stay visible on every contact surface to every viewer who sees the contact
    const kT = await mkContact(shop, "ข้อความเอง", teamer.uid, { text: `ร้านป้าแดง ${rand}` });
    const kD = await mkContact(shop, "ข้อความต่าง", teamer.uid, { companyId: coV.id, text: `ชื่อเล่นบริษัท ${rand}` });
    const kA = await mkContact(shop, "บริษัทเก็บ", teamer.uid, { companyId: coVA.id, text: `ข้อความเก็บ ${rand}` });
    const lines: string[] = [];
    let ok = true;
    for (const [label, who] of [["owner", owner], ["mgr", mgr], ["teamer", teamer], ["mate", mate]] as const) {
      const w = who as Any;
      const lst = await CON.listContacts(w.ctx, w.actor, { pageSize: 200 });
      const it = (id: string) => lst.items.find((x: Any) => x.id === id);
      const t = it(kT.id);
      const dd = it(kD.id);
      const aa = it(kA.id);
      const d360 = (await CON.getContact360(w.ctx, w.actor, kT.id)) as Any;
      const brief = await CON.briefFor(w.ctx, w.actor, { contactId: kT.id }).catch(() => null);
      const texts = await CON.companyTextsForViewer(w.ctx, w.actor, [kT, kD]);
      const csv = await CON.exportContacts(w.ctx, w.actor, { confirm: true, reason: "รีวิวข้อความบริษัท" }).catch((e: Any) => `ERR ${e?.code}`);
      const good =
        t?.companyName === `ร้านป้าแดง ${rand}` && t?.companyText === `ร้านป้าแดง ${rand}` &&
        dd?.companyName === coV.name && dd?.companyText === `ชื่อเล่นบริษัท ${rand}` &&
        aa?.companyName === `ข้อความเก็บ ${rand}` &&
        d360.contact.companyText === `ร้านป้าแดง ${rand}` &&
        (brief === null || brief.companyName === `ร้านป้าแดง ${rand}`) &&
        texts.get(kT.id) === `ร้านป้าแดง ${rand}` && texts.get(kD.id) === `ชื่อเล่นบริษัท ${rand}` &&
        (String(csv).startsWith("ERR ") || String(csv).includes(`ร้านป้าแดง ${rand}`));
      ok = ok && good;
      lines.push(`${label}${String(csv).startsWith("ERR ") ? ` (export ${String(csv)} — no export key)` : ""}: ${good ? "ok" : `list=${j([t?.companyName, t?.companyText, dd?.companyName, dd?.companyText, aa?.companyName])} 360=${j(d360.contact.companyText)} brief=${j(brief?.companyName)} csv=${String(csv).startsWith("ERR ") ? String(csv) : String(csv).includes(`ร้านป้าแดง ${rand}`)}`}`);
    }
    chk("RG-legacy-text", ok, `free text with no company / text ≠ linked visible company / visible archived company → unchanged for owner·mgr·teamer·mate · ${lines.join(" · ")}`);
  }
  {
    // sequences enrollment list: free text with no link stays
    const seq = await call(() => SEQ.listEnrollments(owner.ctx, owner.actor, {}));
    info("RG-sequences", `listEnrollments (owner) → ${codeOf(seq)} (no enrollments in this fixture; builder SW-sequences covers the masking)`);
  }
  {
    // deal cards for viewers WITH visibility = the names the old system-scope code produced (model of the old output)
    const kV = await mkContact(shop, "ลูกค้าทีม", mate.uid, { companyId: coV.id, score: 33 });
    const deals: Any[] = [];
    for (let i = 0; i < 3; i += 1) deals.push(await DEALS.createDeal(owner.ctx, owner.actor, { pipelineId: shop.pipe.id, title: `ดีลทีม ${i} ${rand}`, contactId: kV.id, ownerUserId: mate.uid }));
    const lines: string[] = [];
    let ok = true;
    for (const [label, who] of [["owner", owner], ["mgr", mgr], ["teamer", teamer], ["mate", mate]] as const) {
      const w = who as Any;
      const lst = await DEALS.listDeals(w.ctx, w.actor, { pageSize: 200 });
      const board = await DEALS.getBoard(w.ctx, w.actor, { pipelineId: shop.pipe.id });
      const csv = await call(() => DEALS.exportDeals(w.ctx, w.actor, {}));
      const cards = lst.items.filter((x: Any) => deals.some((d) => d.id === x.id));
      const bcards = (board.columns ?? board.stages ?? []).flatMap((c: Any) => c.cards ?? c.deals ?? []).filter((x: Any) => deals.some((d) => d.id === x.id));
      const good = cards.length === 3 && cards.every((c: Any) => c.companyName === coV.name && c.contactName === kV.name && c.score === 33) &&
        bcards.every((c: Any) => c.companyName === coV.name && c.contactName === kV.name && c.score === 33) &&
        (!csv.ok || String(csv.v).split(coV.name).length - 1 >= 3);
      ok = ok && good;
      lines.push(`${label}: cards ${cards.length} board ${bcards.length} ${good ? "ok" : j(cards.map((c: Any) => [c.companyName, c.contactName, c.score]))}`);
    }
    chk("RG-cards-visible", ok, `viewers who can see company + contact get the same names/score the system-scope code produced · ${lines.join(" · ")}`);
  }

  // ═══════════ DT · .sss export edges ═══════════
  console.log("\n── DT ──");
  {
    const F = MEM.fields;
    const fctx = { ...owner.ctx, objectKey: "contact", actor: owner.actor };
    const sec = await F.createSection(fctx, { key: `qcS${rand.replace(/[^a-z]/g, "")}`.slice(0, 30), label: "มิลลิ" });
    await F.createField(fctx, { sectionId: sec.id, key: "msAt", label: "มิลลิเวลา", type: "DATETIME" });
    const vals = ["1969-12-31T23:59:59.999Z", "1960-01-01T00:00:00.000Z", "2026-10-08T17:30:00.000Z", "2026-10-08T17:30:00.010Z"];
    const ks: Any[] = [];
    for (const [i, v] of vals.entries()) {
      const k = await mkContact(shop, `มิลลิ${i}`, shop.uid);
      await CON.updateContact(owner.ctx, owner.actor, k.id, { fields: { msAt: v } });
      ks.push(k);
    }
    const csv = await CON.exportContacts(owner.ctx, owner.actor, { confirm: true, reason: "รีวิวมิลลิวินาที" });
    const rows = csv.replace(/^﻿/, "").split(/\r?\n/).map((l: string) => l.split(","));
    const iAt = rows[0].indexOf("มิลลิเวลา");
    const out: string[] = [];
    let ok = true;
    for (const [i, v] of vals.entries()) {
      const cell = (rows.find((r: string[]) => r[0] === `มิลลิ${i}`) ?? [])[iAt] ?? "";
      const nm = `กลับมิลลิ${i} ${rand}`;
      const imp = await call(() => CON.importContacts(owner.ctx, owner.actor, { rows: [{ ชื่อ: nm, เวลา: cell }], mapping: { ชื่อ: "firstName", เวลา: "f.msAt" }, options: { onDuplicate: "skip", source: "IMPORT" } }));
      const c = await P.crmContact.findFirst({ where: { tenantId: shop.tid, firstName: nm } });
      const sv = c ? await P.customRecordValue.findFirst({ where: { tenantId: shop.tid, recordId: c.id, field: { key: "msAt" } } }).catch(() => null) : null;
      const back = sv?.valueDate ? new Date(sv.valueDate).toISOString() : null;
      const whole = v.endsWith(".000Z");
      const good = imp.ok && back === v && (whole ? !/\.\d{3}\+/.test(cell) : /\.\d{3}\+07:00$/.test(cell));
      ok = ok && good;
      out.push(`${v} → "${cell}" → ${back}${good ? "" : " ✗"}`);
    }
    chk("DT-sss-edges", ok, out.join(" · "));
  }
} catch (e) {
  chk("FATAL", false, String((e as Error)?.stack ?? e).slice(0, 900));
}
await done("probe-cf13-review");

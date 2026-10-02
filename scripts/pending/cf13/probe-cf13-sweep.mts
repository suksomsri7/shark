// C5.5-fix10 probe — SW: the sweep sites of the same class fixed in this card (loaded by probe-cf13.mts)
//   SW-contacts-list / -export / -360 / -brief · SW-sequences · SW-company360-timeline · SW-email-text (companyTextsForViewer)
//   rule under test (ONE rule): a name / legacy company text is shown to a viewer only if the viewer can see that company / contact
//   (companyWhere / contactWhere) · a contact with no company link keeps its own text · a visible archived company keeps the old fallback
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export async function run(e: Any): Promise<void> {
  const { fx, shop, owner, staff, personas, coHid, coA, visCo, visK, info, j, codeOf, mkCompany, parseCsv } = e;
  const { P, chk, call, TAG } = fx;
  const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
  const CO = (await import("@/lib/modules/crm/companies" as string)) as Any;
  const SEQ = (await import("@/lib/modules/crm/sequences" as string)) as Any;
  const rand = TAG.slice(-8);
  console.log("\n── SW · sweep sites ──");

  // contacts owned by staff (visible to staff · teamless ⇒ mgr) whose LEGACY TEXT = the linked company's name (what import/backfill write)
  const coArch = await mkCompany(shop, `บริษัทเก็บ ${rand}`, staff.uid, null);
  await P.crmCompany.update({ where: { id: coArch.id }, data: { archivedAt: new Date() } });
  const mk = async (first: string, companyId: string | null, text: string | null) => {
    const name = `${first} ${TAG}`;
    const party = await P.party.create({ data: { tenantId: shop.tid, name, kind: "PERSON" } });
    const k = await P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name, firstName: first, partyId: party.id, ownerUserId: staff.uid, companyId, company: text } });
    if (companyId) await P.crmCompanyContact.create({ data: { tenantId: shop.tid, companyId, contactId: k.id, isPrimary: true } });
    return k;
  };
  const kH = await mk("ข้อความลับ", coHid.id, coHid.name); // linked to the hidden company, text = its name
  const kV = await mk("ข้อความเห็น", coA.id, "ข้อความเอเดิม"); // visible company (for staff/mgr/owner), text differs
  const kArch = await mk("ข้อความเก็บ", coArch.id, "ข้อความเก็บเดิม"); // visible but archived → old fallback to the text
  const kNo = await mk("ข้อความไม่ผูก", null, "พิมพ์เองไม่ผูก"); // no link → own text always
  const SW = [kH, kV, kArch, kNo];
  const allCos = new Map<string, Any>([[coHid.id, coHid], [coA.id, coA], [coArch.id, coArch]]);

  for (const [label, who] of personas) {
    const cos = await visCo(who);
    const ks = await visK(who);
    const want = (k: Any) => {
      // the rule (deal-360 style): hidden linked company ⇒ nothing; visible live ⇒ its name; visible archived / no link ⇒ the text
      if (k.companyId && !cos.has(k.companyId)) return { name: null, text: null };
      const co = k.companyId ? allCos.get(k.companyId) : null;
      return { name: co && co.id !== coArch.id ? co.name : k.company, text: k.company };
    };
    const bad: string[] = [];
    const lst = await call(() => CON.listContacts(who.ctx, who.actor, { pageSize: 200 }));
    const csv = await call(() => CON.exportContacts(who.ctx, who.actor, { confirm: true, reason: "ตรวจชื่อบริษัทตามการมองเห็น" }));
    const rows = parseCsv(String(csv.v ?? ""));
    const iCo = (rows[0] ?? []).indexOf("บริษัท");
    let n = 0;
    for (const k of SW) {
      if (!ks.has(k.id)) continue;
      n += 1;
      const w = want(k);
      const it = (lst.v?.items ?? []).find((x: Any) => x.id === k.id);
      if (!it) bad.push(`list misses ${k.firstName}`);
      else {
        if (it.companyName !== w.name) bad.push(`list ${k.firstName} companyName=${j(it.companyName)} want ${j(w.name)}`);
        if (it.companyText !== w.text) bad.push(`list ${k.firstName} companyText=${j(it.companyText)} want ${j(w.text)}`);
      }
      if (csv.ok) {
        const row = rows.find((r: string[]) => r[0] === k.firstName);
        if (!row) bad.push(`csv misses ${k.firstName}`);
        else if (row[iCo] !== (w.name ?? "")) bad.push(`csv ${k.firstName} company=${j(row[iCo])} want ${j(w.name ?? "")}`);
      }
      const c360 = await call(() => CON.getContact360(who.ctx, who.actor, k.id));
      if (!c360.ok) bad.push(`360 ${k.firstName} ${codeOf(c360)}`);
      else {
        if (c360.v.contact.companyText !== w.text) bad.push(`360 ${k.firstName} companyText=${j(c360.v.contact.companyText)} want ${j(w.text)}`);
        if (k.id === kH.id && !cos.has(coHid.id) && j(c360.v).includes(coHid.name)) bad.push("360 payload has the hidden name");
      }
      const br = await call(() => CON.briefFor(who.ctx, who.actor, { contactId: k.id }));
      if (br.ok && br.v && br.v.companyName !== w.text) bad.push(`brief ${k.firstName} companyName=${j(br.v.companyName)} want ${j(w.text)}`);
    }
    if (lst.ok && !cos.has(coHid.id) && j(lst.v).includes(coHid.name)) bad.push("contact list payload has the hidden name");
    if (csv.ok && !cos.has(coHid.id) && String(csv.v).includes(coHid.name)) bad.push("contact CSV has the hidden name");
    chk(`SW-contacts-${label}`, lst.ok && bad.length === 0, `list ${codeOf(lst)} · export ${codeOf(csv)} · ${n}/4 sweep contacts visible · ${bad.join(" · ") || "companyName / companyText / CSV cell / 360 companyText / brief = viewer rule"}`);
  }

  // companyTextsForViewer (email inbox + thread pages) — same rule
  {
    const rowsIn = [kH, kV, kArch, kNo].map((k: Any) => ({ id: k.id, companyId: k.companyId, company: k.company }));
    const out: string[] = [];
    let ok = true;
    for (const [label, who] of personas) {
      const cos = await visCo(who);
      const m = await call(() => CON.companyTextsForViewer(who.ctx, who.actor, rowsIn));
      for (const k of rowsIn) {
        const w = k.companyId && !cos.has(k.companyId) ? null : k.company;
        if (!m.ok || m.v.get(k.id) !== w) { ok = false; out.push(`${label} ${k.company}: ${m.ok ? j(m.v.get(k.id)) : codeOf(m)} want ${j(w)}`); }
      }
    }
    chk("SW-email-text", ok, `companyTextsForViewer per persona · ${out.join(" · ") || "hidden link ⇒ null, else the contact's text"}`);
  }

  // sequences enrollment list ("บริษัท" column)
  {
    const seq = await P.crmSequence.create({ data: { tenantId: shop.tid, systemId: shop.S, name: `ลำดับ ${rand}` } });
    for (const k of SW) await P.crmSequenceEnrollment.create({ data: { tenantId: shop.tid, sequenceId: seq.id, contactId: k.id, enrolledBy: "API", sequenceVersion: 1 } });
    const out: string[] = [];
    let ok = true;
    for (const [label, who] of personas) {
      const cos = await visCo(who);
      const r = await call(() => SEQ.listEnrollments(who.ctx, who.actor, { sequenceId: seq.id }));
      if (!r.ok) { out.push(`${label}: ${codeOf(r)}`); continue; }
      for (const it of r.v.items) {
        const k = SW.find((x: Any) => x.id === it.contactId);
        if (!k) continue;
        const w = k.companyId && !cos.has(k.companyId) ? null : k.companyId && k.companyId !== coArch.id ? allCos.get(k.companyId).name : k.company;
        if (it.companyName !== w) { ok = false; out.push(`${label} ${k.firstName}: ${j(it.companyName)} want ${j(w)}`); }
      }
      if (!cos.has(coHid.id) && j(r.v).includes(coHid.name)) { ok = false; out.push(`${label}: hidden name in payload`); }
      out.push(`${label} ${r.v.items.length} rows`);
    }
    chk("SW-sequences", ok, out.join(" · "));
  }

  // company 360 timeline: an activity the viewer sees, on a company the viewer sees, naming a contact the viewer cannot see
  {
    const kHidden = e.kOwner; // owned by the shop owner — hidden from staff
    await P.crmActivity.create({ data: { tenantId: shop.tid, systemId: shop.S, type: "TASK", title: `งานบนบริษัทเอ ${rand}`, ownerUserId: staff.uid, companyId: coA.id, contactId: kHidden.id } });
    await P.crmActivity.create({ data: { tenantId: shop.tid, systemId: shop.S, type: "TASK", title: `งานเห็นผู้ติดต่อ ${rand}`, ownerUserId: staff.uid, companyId: coA.id, contactId: e.kStaff.id } });
    const out: string[] = [];
    let ok = true;
    for (const [label, who] of personas) {
      const cos = await visCo(who);
      const ks = await visK(who);
      if (!cos.has(coA.id)) { out.push(`${label}: company not visible (skip)`); continue; }
      const r = await call(() => CO.getCompany360(who.ctx, who.actor, coA.id));
      if (!r.ok) { out.push(`${label}: ${codeOf(r)}`); ok = false; continue; }
      const tl = (r.v.timeline ?? []).filter((t: Any) => String(t.title).endsWith(rand));
      for (const t of tl) {
        const w = ks.has(t.contactId) ? (t.contactId === kHidden.id ? kHidden.name : e.kStaff.name) : null;
        if (t.contactName !== w) { ok = false; out.push(`${label} "${t.title}": ${j(t.contactName)} want ${j(w)}`); }
      }
      if (!ks.has(kHidden.id) && j(r.v).includes(kHidden.name)) { ok = false; out.push(`${label}: hidden contact name in payload`); }
      out.push(`${label} ${tl.length} rows`);
    }
    chk("SW-company360-timeline", ok, out.join(" · "));
  }
  info("SW-done", "sweep checks finished");
}

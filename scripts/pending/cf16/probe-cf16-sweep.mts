// C5.5-fix12 probe — SW: other doors of the RV10-1 class (loaded by probe-cf16.mts)
//   SW-company-update-tax · SW-company-restore · SW-company-merge (duplicateOf of a hidden company no longer returned) ·
//   SW-import-skip / -candidate (hidden duplicate = neutral row error, nothing created; visible = as before) ·
//   SW-card-scan (accepting a scanned card that matches a hidden contact: neutral refusal, proposal back to PENDING, no detail)
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export async function run(e: Any): Promise<void> {
  const { fx, shop, owner, mgr, staff, coH, kH, pH, leaks, errBlob, info, j, codeOf, mkCompany, mkContact, newPhone, CO_HIDDEN_MSG, HIDDEN_MSG } = e;
  const { P, chk, call, TAG } = fx;
  const CO = (await import("@/lib/modules/crm/companies" as string)) as Any;
  const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
  const CALLS = (await import("@/lib/modules/crm/calls" as string)) as Any;
  const { validTaxId } = (await import("./_fx.mts" as string)) as Any;
  const rand = TAG.slice(-8);
  console.log("\n── SW · other doors ──");
  const tH = (await P.crmCompany.findUnique({ where: { id: coH.id } })).taxId as string;
  const coLeak = (r: Any) => [coH.id, coH.name].filter((x) => errBlob(r).includes(x));

  // updateCompany: staff types the hidden company's tax id onto its own company
  {
    const mine = await mkCompany(shop, `บริษัทฉันแก้ภาษี ${rand}`, staff.uid, null);
    const staffUpd = { ...staff, actor: { ...staff.actor, permissions: { ...staff.actor.permissions, "crm.company.update": true } } };
    const r = await call(() => CO.updateCompany(staffUpd.ctx, staffUpd.actor, mine.id, { taxId: tH }));
    const ownCo = await mkCompany(shop, `เจ้าของแก้ภาษี ${rand}`, shop.uid);
    const ro = await call(() => CO.updateCompany(owner.ctx, owner.actor, ownCo.id, { taxId: tH }));
    chk("SW-company-update-tax", !r.ok && codeOf(r) === "DUPLICATE" && r.err?.message === CO_HIDDEN_MSG && !r.err?.duplicateOf && coLeak(r).length === 0 && !ro.ok && ro.err?.duplicateOf === coH.id,
      `staff → ${codeOf(r)} "${String(r.err?.message ?? "").slice(0, 50)}" duplicateOf=${j(r.err?.duplicateOf ?? null)} leaks ${j(coLeak(r))} · owner (sees it) → ${codeOf(ro)} duplicateOf = that company ${ro.err?.duplicateOf === coH.id}`);
  }
  // restoreCompany: manager (unit u-a, cannot see TB) restores an archived teamless company carrying the same tax id
  {
    const arch = await mkCompany(shop, `บริษัทเก็บภาษีซ้ำ ${rand}`, mgr.uid, null);
    await P.crmCompany.update({ where: { id: arch.id }, data: { taxId: tH, branchCode: "00000", archivedAt: new Date() } });
    const r = await call(() => CO.restoreCompany(mgr.ctx, mgr.actor, arch.id, { confirm: true, reason: "ทดสอบการกู้คืนชนเลขภาษี" }));
    const row = await P.crmCompany.findUnique({ where: { id: arch.id } });
    chk("SW-company-restore", !r.ok && codeOf(r) === "DUPLICATE" && r.err?.message === CO_HIDDEN_MSG && !r.err?.duplicateOf && coLeak(r).length === 0 && !!row.archivedAt,
      `manager restore → ${codeOf(r)} "${String(r.err?.message ?? "").slice(0, 50)}" duplicateOf=${j(r.err?.duplicateOf ?? null)} leaks ${j(coLeak(r))} · still archived ${!!row.archivedAt}`);
  }
  // mergeCompanies: the merged company's tax id belongs to a third (hidden) company
  {
    const keep = await mkCompany(shop, `บริษัทเก็บไว้ ${rand}`, mgr.uid, null);
    const drop = await mkCompany(shop, `บริษัทรวมทิ้ง ${rand}`, mgr.uid, null);
    await P.crmCompany.update({ where: { id: drop.id }, data: { taxId: tH, branchCode: "00000" } });
    const r = await call(() => CO.mergeCompanies(mgr.ctx, mgr.actor, { keepId: keep.id, mergeId: drop.id, confirm: true, reason: "ทดสอบการรวมชนเลขภาษี" }));
    if (codeOf(r) === "DUPLICATE") chk("SW-company-merge", r.err?.message === CO_HIDDEN_MSG && !r.err?.duplicateOf && coLeak(r).length === 0, `manager merge → ${codeOf(r)} "${String(r.err?.message ?? "").slice(0, 50)}" duplicateOf=${j(r.err?.duplicateOf ?? null)}`);
    else info("SW-company-merge", `merge did not reach the third-company tax check → ${codeOf(r)} "${String(r.err?.message ?? (r.ok ? "OK" : "")).slice(0, 90)}" (leaks ${j(coLeak(r))})`);
  }
  // import skip / candidate with the hidden phone (staff with the import key) + visible control
  {
    const out: string[] = [];
    let ok = true;
    for (const mode of ["skip", "candidate"]) {
      const pV = newPhone();
      const kV = await mkContact(shop, `นำเข้าเห็น ${mode}`, staff.uid, { phone: pV });
      const before = await P.crmContact.count({ where: { tenantId: shop.tid, phone: { in: [pH, pV] } } });
      const r = await call(() => CON.importContacts(staff.ctx, staff.actor, { rows: [{ ชื่อ: `ลับ ${mode} ${rand}`, เบอร์: pH }, { ชื่อ: `เห็น ${mode} ${rand}`, เบอร์: pV }], mapping: { ชื่อ: "firstName", เบอร์: "phone" }, options: { onDuplicate: mode, source: "IMPORT" } }));
      const after = await P.crmContact.count({ where: { tenantId: shop.tid, phone: { in: [pH, pV] } } });
      const res = r.v?.result ?? {};
      const errs = res.errors ?? [];
      const l = leaks(j(r.v ?? r.err));
      const wantCreated = mode === "candidate" ? 1 : 0;
      const good = r.ok && errs.length === 1 && errs[0].row === 1 && errs[0].message === HIDDEN_MSG && res.created === wantCreated && (mode === "skip" ? res.skipped === 1 : res.candidates === 1) && after - before === wantCreated && l.length === 0;
      ok = ok && good;
      out.push(`${mode}: created ${res.created} skipped ${res.skipped} candidates ${res.candidates} failed ${res.failed} · row1 ${j(errs[0]?.message?.slice?.(0, 40))} · rows +${after - before} · leaks ${j(l)}`);
      void kV;
    }
    chk("SW-import-modes", ok, out.join(" · "));
  }
  // card scan: a lead proposal whose phone matches the hidden contact, accepted by staff
  {
    const p = await P.aiProposal.create({ data: { tenantId: shop.tid, conversationId: `crm:card:${rand}`, kind: CALLS.LEAD_PROPOSAL_KIND ?? "crm_create_lead", summary: "นามบัตร", payload: { systemId: shop.S, name: `จากนามบัตร ${rand}`, phone: pH }, expiresAt: new Date(Date.now() + 3_600_000) } });
    const r = await call(() => CALLS.acceptLeadProposal(staff.ctx, staff.actor, p.id));
    const row = await P.aiProposal.findUnique({ where: { id: p.id } });
    const l = leaks(`${errBlob(r)} ${row?.resultNote ?? ""}`);
    chk("SW-card-scan", !r.ok && r.err?.message === HIDDEN_MSG && row?.status === "PENDING" && l.length === 0 && (await P.crmContact.count({ where: { tenantId: shop.tid, phone: pH } })) === 1,
      `accept scanned card with the hidden phone → ${codeOf(r)} "${String(r.err?.message ?? "").slice(0, 50)}" · proposal ${row?.status} note ${j(String(row?.resultNote ?? "").slice(0, 40))} · leaks ${j(l)} (was: a duplicate of the hidden contact was created)`);
  }
  void kH;
}

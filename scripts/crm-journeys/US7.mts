// US7 — docs/modules/20-crm-v2.md §1.4: a deal's invoice gets paid → a 5% commission lands in the approval queue →
// approved → an HrPayAdjustment for this pay period → the invoice is voided → the commission REVERSES.
//
// DECISION-US7-1: "the invoice gets paid" and "the invoice is voided" are ACCOUNT module actions
// (`recordPayment`/`voidPayment`/`voidDocument` in src/lib/modules/account/service.ts) — that module owns its own
// button coverage (a separate WO's C4.2), not this one's registry. This oracle calls those two facade functions
// directly (the same functions the account UI's buttons call) instead of driving the account app's UI, and treats
// everything CRM-side (commission rule setup, approve, send-to-payroll) through the real CRM UI.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lib = (await import("./lib.mts" as string)) as Any;
const { actorFor, drainQuiet, pollUntil, withStaffPermissions, ensureCrmAccountLink, snapshotSettingsPath } = lib;

export async function run(ctx: Any): Promise<void> {
  const { prisma, env } = ctx;
  const P = prisma as any;

  ctx.plan("resolve: owner (commission rule + payroll push) · manager (approver, phuket lead) · thana (deal owner, commission recipient)");
  const { ctx: octx, actor: ownerActor } = await actorFor(prisma, env, "owner");
  const firstOpen = env.pipelines.b2b.stages.find((s: Any) => s.kind === "OPEN")!;

  ctx.plan("SETUP (real facade — connections.connect(), see ensureCrmAccountLink() doc in lib.mts / US3's identical setup): link this CRM system to its shop's Account books (idempotent, persistent config)");
  if (!ctx.dry) await ensureCrmAccountLink(prisma, env, env.users.owner.userId);

  const companyName = `บริษัท US7 ${ctx.tag}`;
  const dealTitle = `ดีล US7 ${ctx.tag}`;
  let contactId: string | null = null;
  let dealId: string | null = null;
  const dealValueSatang = 200_000;

  ctx.plan("SETUP (facade): company/contact/deal (owned by thana, valueSatang 2,000฿)");
  if (!ctx.dry) {
    const crm = await import("@/lib/modules/crm");
    const co = await (crm as any).companies.createCompany(octx, ownerActor, { name: companyName });
    const companyId = co.id ?? co.company?.id ?? co.companyId;
    ctx.own("crmCompany", companyId);
    const contactRes = await (crm as any).contacts.createContact(octx, ownerActor, { firstName: `ผู้ติดต่อ US7 ${ctx.tag}`, phone: `05${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: env.users.thana.userId });
    contactId = contactRes.contact?.id ?? null;
    ctx.own("crmContact", contactId);
    // RUNNER FIX (see US3.mts for the full trace): createContact's `companyId` param only writes the CACHE column,
    // not the real CrmCompanyContact junction createDeal validates against — use companies.addContact for real.
    await (crm as any).companies.addContact(octx, ownerActor, companyId, { contactId, isPrimary: true });
    const deal = await (crm as any).deals.createDeal(octx, ownerActor, { pipelineId: env.pipelines.b2b.id, stageId: firstOpen.id, title: dealTitle, contactId, companyId, ownerUserId: env.users.thana.userId, valueSatang: dealValueSatang });
    dealId = deal.id;
    ctx.own("crmDeal", dealId);
  }

  ctx.plan("SCRIPTED ACTION (real UI, owner): /settings/commissions → add a rule: basis PAID, 5% of value, B2B pipeline, active");
  if (!ctx.dry) {
    const page = await ctx.loginStaff("owner");
    await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/settings/commissions`, { waitUntil: "networkidle2", timeout: 30_000 });
    await page.waitForSelector("[data-testid=crm-commission-rule-add]", { timeout: 15_000 });
    await page.click("[data-testid=crm-commission-rule-add]");
    await page.waitForSelector("[data-testid=crm-commission-rule-name]", { timeout: 10_000 });
    await page.click("[data-testid=crm-commission-rule-name]", { clickCount: 3 });
    await page.keyboard.type(`${ctx.tag}-5pct-paid`, { delay: 5 });
    await page.select("[data-testid=crm-commission-rule-basis]", "PAID").catch(() => {});
    await page.select("[data-testid=crm-commission-rule-kind]", "PCT").catch(() => {});
    const pctInput = await page.$("[data-testid=crm-commission-rule-pct]");
    if (pctInput) { await pctInput.click({ clickCount: 3 }); await page.keyboard.type("5", { delay: 5 }); }
    await page.select("[data-testid=crm-commission-rule-pipeline]", env.pipelines.b2b.id).catch(() => {});
    await ctx.shot(page, "01-commission-rule-filled");
    await page.click("[data-testid=crm-commission-rule-save]");
    await new Promise((r) => setTimeout(r, 1_200));
    await ctx.shot(page, "02-commission-rule-saved");
    await page.close();
    const rule = await P.crmCommissionRule.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, name: `${ctx.tag}-5pct-paid` }, select: { id: true, active: true } });
    ctx.own("crmCommissionRule", rule?.id);
    ctx.check("US7-1", "commission rule saved and active", true, rule?.active === true);
  }

  ctx.plan("SETUP (test-fixture permission elevation, not a product gap — see withStaffPermissions() doc in lib.mts): QC1's seeded thana lacks crm.deal.update/crm.deal.quote (seed-crm-qc.mts:132-137) — grant for this journey, restore after");
  ctx.plan("SCRIPTED ACTION (real UI, thana): open deal 360, issue the invoice");
  let invoiceDocId: string | null = null;
  if (!ctx.dry) {
    await withStaffPermissions(prisma, { tenantId: env.tenantId, userId: env.users.thana.userId, keys: ["crm.deal.update", "crm.deal.quote", "crm.company.read"] }, async () => {
      const page = await ctx.loginStaff("thana");
      await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/deals/${dealId}`, { waitUntil: "networkidle2", timeout: 30_000 });
      await page.waitForSelector("[data-testid=deal-invoice-btn]", { timeout: 15_000 });
      await page.click("[data-testid=deal-invoice-btn]");
      await new Promise((r) => setTimeout(r, 1_500));
      await ctx.shot(page, "03-invoice-issued");
      await page.close();
    });
    const deal = await P.crmDeal.findFirst({ where: { id: dealId }, select: { invoiceDocId: true } });
    invoiceDocId = deal?.invoiceDocId ?? null;
    ctx.check("US7-2", "deals.issueInvoice created an AccountDocument INVOICE", true, !!invoiceDocId);

    // RUNNER FIX (see US3.mts for the full trace): deals.issueInvoice creates the AccountDocument as DRAFT;
    // recordPayment explicitly excludes DRAFT (`status: {notIn:["DRAFT","VOIDED","CANCELLED"]}`, service.ts:2545) —
    // finalize it first via the ACCOUNT module's own issueDocument (its own out-of-registry action).
    if (invoiceDocId) {
      const acc = await import("@/lib/modules/account/service");
      const ir = await (acc as any).issueDocument(env.tenantId, env.accountSysId, invoiceDocId).catch((e: unknown) => ({ ok: false, reason: String(e) }));
      ctx.log(`   issueDocument(invoice) -> ${JSON.stringify(ir)}`);
      // ROUND 3 (controller): mark facade stand-ins gap:true — ACCOUNT's own DRAFT→AWAITING_PAYMENT transition is
      // not driven through any UI this journey clicks (that module owns its own button coverage, DECISION-US7-1).
      ctx.check("US7-2b", "GAP-MARKER (facade stand-in, not UI-driven): ACCOUNT's issueDocument() moved the invoice out of DRAFT", true, (ir as Any)?.ok === true, true);
    }
  }

  ctx.plan("SETUP (facade, account module — see DECISION-US7-1): recordPayment() the invoice in full");
  let paymentId: string | null = null;
  let payAmount = dealValueSatang;
  if (!ctx.dry && invoiceDocId) {
    const acc = await import("@/lib/modules/account/service");
    // RUNNER FIX: recordPayment(tenantId, systemId, docId, ...) needs the ACCOUNT system's id, not the CRM one —
    // the AccountDocument lives under env.accountSysId (same as the issueDocument() call two lines above this
    // block). Using env.SYS here made recordPayment look for the invoice under the CRM system and fail with
    // "ไม่พบเอกสาร" even though issueInvoice+issueDocument had both just succeeded.
    // RUNNER FIX (found running against QC1, 28 Sep): paying exactly `dealValueSatang` left the invoice PARTIAL,
    // not PAID — the invoice's `grandTotal` includes VAT (2,000฿ deal → ฿2,140 grand total, confirmed by screenshot
    // .qc-shots/crm/journeys/US7/06-03-invoice-issued.png) and `account.invoice.paid` (which triggers the
    // commission bridge) only fires once the doc is fully paid. Read the real grandTotal and pay that instead —
    // also means the commission (basis PAID) is 5% of `payAmount`, not of the deal's nominal `dealValueSatang`.
    const invDoc = await P.accountDocument.findFirst({ where: { id: invoiceDocId }, select: { grandTotal: true } });
    payAmount = invDoc?.grandTotal ?? dealValueSatang;
    // RUNNER FIX: a fixed per-story idempotencyKey (`${ctx.tag}-pay`) collides across repeated runs of this journey
    // — AccountDocumentPayment's idempotency guard is keyed globally, not scoped to a document that --clean may
    // have already removed, so a second run against a NEW invoice legitimately gets refused
    // ("คีย์กันซ้ำนี้ถูกใช้กับเอกสารอื่นแล้ว"). Randomize per invocation; the story's own idempotency behavior (same
    // key twice → same result, no duplicate) is exercised for real in US10's POST /activities check instead.
    const r = await (acc as any).recordPayment(env.tenantId, env.accountSysId, invoiceDocId, { amount: payAmount, channel: "TRANSFER", note: ctx.tag, idempotencyKey: `${ctx.tag}-pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` });
    if ((r as any).ok) paymentId = (r as any).paymentId ?? null;
    ctx.own("accountDocument", invoiceDocId);
    ctx.own("accountDocumentPayment", paymentId);
    ctx.check("US7-3", `GAP-MARKER (facade stand-in, not UI-driven): recordPayment succeeded and the invoice is fully paid (paid ${payAmount} satang, result: ${JSON.stringify(r)})`, true, (r as any).ok === true && (r as any).status === "PAID", true);
    await drainQuiet(); // account.invoice.paid → crmBridge(onInvoicePaid) → CrmCommission PENDING
  }

  ctx.plan("assert (facade read): a PENDING CrmCommission for thana, 5% of the deal's nominal value (basis=PAID, value-based freeze)");
  let commissionId: string | null = null;
  if (!ctx.dry) {
    // account.invoice.paid → crmBridge(onInvoicePaid) is an outbox consumer — see drainQuiet()'s doc comment
    const commission = await pollUntil(() => P.crmCommission.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, dealId }, orderBy: { createdAt: "desc" } }));
    commissionId = commission?.id ?? null;
    ctx.own("crmCommission", commissionId);
    // RUNNER FIX (found running against QC1, 28 Sep): commission basis is NOT the VAT-inclusive paid amount —
    // commissions.ts:302-317 `frozenTotal()` freezes `T` = the deal's own `valueSatang` (200,000) whenever
    // `live.valueSatang > 0` ("value-based"), regardless of the actual invoice/payment total (214,000 incl. VAT).
    // Confirmed live: product returned amountSatang=10000 (5% of 200,000), not 10700 (5% of 214,000) — the deal's
    // nominal value is the correct basis; `payAmount` above is only for actually settling the invoice to PAID.
    ctx.check("US7-4", `commission created PENDING, userId=thana, amountSatang = 5% of the deal's nominal value (${dealValueSatang} satang, not the ${payAmount}-satang VAT-inclusive payment)`, { status: "PENDING", userId: env.users.thana.userId, amountSatang: Math.round(dealValueSatang * 0.05) }, commission ? { status: commission.status, userId: commission.userId, amountSatang: commission.amountSatang } : null);
  }

  ctx.plan("SCRIPTED ACTION (real UI, manager): /settings/commissions → select the pending row → approve");
  if (!ctx.dry && commissionId) {
    const page = await ctx.loginStaff("manager");
    await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/settings/commissions`, { waitUntil: "networkidle2", timeout: 30_000 });
    await page.waitForSelector("[data-testid=crm-commission-pending]", { timeout: 15_000 });
    const rowToggle = await page.$(`[data-testid=crm-commission-select-${commissionId}]`);
    // SHOULD-FIX (controller review 28 Sep): NEVER fall back to "select all" — QC1 is shared with other lanes'
    // concurrent commission test data; select-all would approve rows this journey doesn't own. Fail loud instead.
    if (rowToggle) {
      await rowToggle.click();
    } else {
      ctx.log(`   🔴 row toggle [data-testid=crm-commission-select-${commissionId}] not found — refusing to fall back to select-all (would touch other lanes' shared QC1 data)`);
    }
    await ctx.shot(page, "04-commission-selected");
    if (rowToggle) {
      await page.click("[data-testid=crm-commission-approve-selected]");
      await new Promise((r) => setTimeout(r, 1_200));
      await ctx.shot(page, "05-commission-approved");
    }
    await page.close();
  }

  // TEST-FIXTURE GAP, refined (found running against QC1, 28 Sep — NOT a product bug, same class as thana's narrow
  // CRM permissions): commissions.ts:903-911 `handoff()` requires `hr.payrollEmployeeOfUser(tenantId, userId)` to
  // return non-null, which requires an `HrEmployee` row (`linkedUserId` = thana's userId, `active = true`) AND its
  // own `HrSalaryProfile` row (payroll.ts:596-611). Checked live on the current QC1 seed: thana's `HrEmployee` row
  // DOES exist and is active — only the `HrSalaryProfile` is missing. Filling in just that one real gap via the
  // real `setSalaryProfile()` facade (payroll.ts:36) is in-scope SETUP (same class as `withStaffPermissions`/
  // `validTaxId` — completing a test fixture, not standing in for the story's own action); a nominal baseSalary is
  // enough to satisfy `activeLinkedUserIds()`'s join, nothing about US7 exercises the salary figure itself. Must
  // run BEFORE the "send to payroll" click below — syncPayroll() only links commissions it finds eligible AT
  // CALL TIME, it doesn't retroactively pick up commissions on a later call once already skipped... actually it
  // does re-scan every call (hrPayAdjustmentId IS NULL), but doing this first avoids relying on that and matches
  // a real owner's actual order of operations (of course the employee's payroll profile exists before payday).
  if (!ctx.dry) {
    const P2 = prisma as any;
    const thanaUser = { tenantId: env.tenantId, userId: env.users.thana.userId };
    const hrSys = await P2.appSystem.findFirst({ where: { tenantId: thanaUser.tenantId, type: "HR" }, select: { id: true } });
    const emp = hrSys ? await P2.hrEmployee.findFirst({ where: { systemId: hrSys.id, linkedUserId: thanaUser.userId, active: true }, select: { id: true } }) : null;
    if (hrSys && emp) {
      const hasProfile = await P2.hrSalaryProfile.findFirst({ where: { systemId: hrSys.id, employeeId: emp.id }, select: { id: true } });
      if (!hasProfile) {
        ctx.plan("SETUP (real facade — payroll.ts#setSalaryProfile, see TEST-FIXTURE GAP comment): thana's HrEmployee exists but has no HrSalaryProfile — add a nominal one so syncPayroll()/reverse() can actually be exercised");
        const payroll = await import("@/lib/modules/hr/payroll");
        const created = await (payroll as any).setSalaryProfile({ tenantId: thanaUser.tenantId, systemId: hrSys.id }, { employeeId: emp.id, baseSalarySatang: 2_000_000 }).catch((e: unknown) => { ctx.log(`⚠️ setSalaryProfile: ${e instanceof Error ? e.message : e}`); return null; });
        ctx.own("hrSalaryProfile", created?.id); // SHOULD-FIX (28 Sep): fixture row this run created — restore by deleting, not a persistent shop config
      }
    } else {
      ctx.log(`   ⚠️ thana has no active HrEmployee link at all on this seed (hrSys=${!!hrSys} emp=${!!emp}) — US7-5/7-7 will stay red for the original, deeper reason`);
    }
  }

  ctx.plan("SCRIPTED ACTION (real UI, owner): turn on \"ส่งเข้าระบบเงินเดือนอัตโนมัติ\", then send approved commissions to payroll");
  let restorePayrollSetting: (() => Promise<void>) | null = null;
  if (!ctx.dry && commissionId) {
    const page = await ctx.loginStaff("owner");
    await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/settings/commissions`, { waitUntil: "networkidle2", timeout: 30_000 });
    const payrollToggle = await page.$("[data-testid=crm-commission-setting-payroll]");
    if (payrollToggle) {
      const checked = await page.$eval("[data-testid=crm-commission-setting-payroll]", (el: any) => el.checked ?? el.getAttribute("aria-checked") === "true").catch(() => false);
      if (!checked) {
        restorePayrollSetting = await snapshotSettingsPath(prisma, env.SYS, ["crm", "commission"]); // ROUND 3: path-scoped restore
        await payrollToggle.click();
        const saveBtn = await page.$("[data-testid=crm-commission-settings-save]");
        if (saveBtn) await saveBtn.click();
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    await page.waitForSelector("[data-testid=crm-commission-send-payroll]", { timeout: 15_000 });
    await page.click("[data-testid=crm-commission-send-payroll]");
    await new Promise((r) => setTimeout(r, 1_500));
    await ctx.shot(page, "06-sent-to-payroll");
    await page.close();
  }

  ctx.plan("assert: commission APPROVED with HrPayAdjustment(kind=COMMISSION, crmCommissionId) linked — see TEST-FIXTURE GAP comment above if red");
  if (!ctx.dry && commissionId) {
    const commission = await pollUntil(() => P.crmCommission.findFirst({ where: { id: commissionId, hrPayAdjustmentId: { not: null } }, select: { status: true, hrPayAdjustmentId: true } }));
    ctx.check("US7-5", `commission APPROVED and linked to an HrPayAdjustment (COMMISSION) — status=${commission?.status}`, true, commission?.status === "APPROVED" && !!commission?.hrPayAdjustmentId);
    if (commission?.hrPayAdjustmentId) {
      ctx.own("hrPayAdjustment", commission.hrPayAdjustmentId);
      // SHOULD-FIX (28 Sep, controller review): "US7-5 HrPayAdjustment kind+period" — don't stop at "linked",
      // verify the linked row is actually the right KIND and has a real payroll period, not some other adjustment.
      const adj = await P.hrPayAdjustment.findFirst({ where: { id: commission.hrPayAdjustmentId }, select: { kind: true, periodKey: true, crmCommissionId: true, amountSatang: true } });
      ctx.check("US7-5b", `HrPayAdjustment.kind = COMMISSION (not some other pay item)`, "COMMISSION", adj?.kind ?? null);
      ctx.check("US7-5c", `HrPayAdjustment has a real period key (format YYYY-MM) — got ${adj?.periodKey}`, true, !!adj?.periodKey && /^\d{4}-\d{2}$/.test(adj.periodKey));
      ctx.check("US7-5d", `HrPayAdjustment.crmCommissionId links back to this exact commission`, commissionId, adj?.crmCommissionId ?? null);
    }
  }

  ctx.plan("SETUP (facade, account module — see DECISION-US7-1): void the payment then void the invoice");
  if (!ctx.dry && invoiceDocId && paymentId) {
    const acc = await import("@/lib/modules/account/service");
    // RUNNER FIX: same accountSysId-vs-SYS bug as recordPayment above.
    await (acc as any).voidPayment(env.tenantId, env.accountSysId, invoiceDocId, paymentId, `${ctx.tag}-void`).catch((e: unknown) => ctx.log(`⚠️ voidPayment: ${e instanceof Error ? e.message : e}`));
    const vr = await (acc as any).voidDocument(env.tenantId, env.accountSysId, invoiceDocId, `${ctx.tag}-void invoice`).catch((e: unknown) => ({ ok: false, reason: String(e) }));
    ctx.check("US7-6", "GAP-MARKER (facade stand-in, not UI-driven): invoice voided", true, (vr as any).ok === true ? true : vr, true);
    await drainQuiet();
  }

  ctx.plan("assert: commission REVERSED after the invoice was voided");
  if (!ctx.dry && commissionId) {
    // RUNNER FIX (found on QC1, 28 Sep): reversal does NOT mutate the original commission row's status — it's
    // double-entry style (schema comment crm.prisma:1255 "แถวกลับรายการ = ติดลบ"): a NEW row is created with
    // status=REVERSED, negative amountSatang, and reversedOfId pointing back at the original, which keeps its
    // own status (APPROVED/PAID) unchanged forever (audit trail). Verified directly on QC1: after void, the
    // original commissionId was still APPROVED and a second row existed with reversedOfId=commissionId,
    // status=REVERSED. The original assertion queried `{id: commissionId, status: "REVERSED"}` — a combination
    // that can never match by design, not a product bug.
    const reversal = await pollUntil(() => P.crmCommission.findFirst({ where: { reversedOfId: commissionId, status: "REVERSED" }, select: { id: true, status: true, amountSatang: true } }));
    ctx.own("crmCommission", reversal?.id); // SHOULD-FIX (28 Sep): product side-effect row (a NEW row, not the original commissionId already owned) --clean must also remove
    ctx.check("US7-7", "a reversal commission row exists (reversedOfId=original, status=REVERSED, negative amount)", true, !!reversal && Number(reversal.amountSatang) < 0);
  }
  if (restorePayrollSetting) {
    ctx.plan("CLEANUP: restore settings.crm.commission.payrollLink to its original value (shared shop config, not this story's own row)");
    await restorePayrollSetting();
  }
  if (ctx.dry) ctx.check("US7-1..7", "dry mode — assertions require real payment/void + real approve/payroll clicks", "skipped in --dry", "skipped in --dry");
}

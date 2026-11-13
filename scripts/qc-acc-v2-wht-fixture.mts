// qc-acc-v2-wht-fixture.mts — ร้านทดสอบแยกของชุด T3.3 / T3.4 / T3.5 (เลน 2) · ไม่แตะยอดของสมุด QC หลัก (ร้านใหม่ ลบตอนจบ · KEEP=1 = เก็บไว้ดูหน้าจอ)
//   ร้านนิติบุคคล (บริษัทจำกัด) จด VAT · ผู้ติดต่อ: นิติไทย · บุคคลไทย · นิติต่างประเทศ (SG) · มูลนิธิ · ลูกค้านิติไทย
//   ใช้: const F = await import("./qc-acc-v2-wht-fixture.mts"); const shop = await F.setupWhtShop("QC T3.4 ภ.ง.ด.");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** เลขผู้เสียภาษี 13 หลักที่หลักตรวจถูก (12 หลักแรกให้มา) */
export function thaiTaxId(first12: string): string {
  const d = first12.split("").map(Number);
  const sum = d.reduce((s, x, i) => s + x * (13 - i), 0);
  return first12 + String((11 - (sum % 11)) % 10);
}

export async function purgeTenant(prisma: Any, tenantId: string) {
  const rows: { table_name: string }[] = await prisma.$queryRaw`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`;
  let pending = rows.map((r) => r.table_name);
  for (let pass = 0; pass < 12 && pending.length > 0; pass++) {
    const still: string[] = [];
    for (const t of pending) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tenantId);
      } catch {
        still.push(t);
      }
    }
    if (still.length === pending.length) break;
    pending = still;
  }
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

export async function setupWhtShop(tenantName: string, slug: string) {
  const { prisma } = (await import("@/lib/core/db" as string)) as Any;
  const acc: Any = await import("@/lib/modules/account/service" as string);
  const gl: Any = await import("@/lib/modules/account/gl" as string);
  const fin: Any = await import("@/lib/modules/account/finance" as string);
  const exp: Any = await import("@/lib/modules/account/expense" as string);
  const LV: Any = await import("@/lib/modules/account/legal-values" as string);
  const sysSvc: Any = await import("@/lib/modules/system/service" as string);
  for (const old of await prisma.tenant.findMany({ where: { name: tenantName }, select: { id: true } })) await purgeTenant(prisma, old.id);
  const tid = (await prisma.tenant.create({ data: { name: tenantName, slug: `${slug}-${Date.now().toString(36)}`, status: "ACTIVE", enabledModules: ["ACCOUNT"] } })).id as string;
  const owner = await prisma.user.create({ data: { email: `${slug}-${Date.now()}@qc.local`, name: `เจ้าของ ${tenantName}` } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const SYS = (await sysSvc.createSystem(tid, "ACCOUNT", `บัญชี ${tenantName}`)).id as string;
  const ctx = { tenantId: tid, systemId: SYS };
  await acc.saveSettings(tid, SYS, { orgPrefix: "บริษัท", orgName: "หักภาษี ทดสอบ จำกัด", vatRegistered: true, vatRateBp: 700, taxId: thaiTaxId("010556100003"), branchCode: "00000", branchName: "สำนักงานใหญ่", address: "9 ถ.ทดสอบ ต.ตลาดใหญ่ อ.เมือง จ.ภูเก็ต 83000" });
  const ownerActor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: owner.id };
  const ek = await LV.saveBookTax(ownerActor, ctx, { entityKind: "COMPANY" }, "QC T3b");
  if (!ek.ok) throw new Error(`entityKind: ${JSON.stringify(ek)}`);
  await gl.ensureAccounting(ctx);
  const bankRes = await fin.createFinanceAccount({ tenantId: tid, systemId: SYS, type: "BANK", name: "กระแสรายวัน", bankName: "กสิกรไทย" });
  const bank = await prisma.accountFinance.findFirstOrThrow({ where: { id: bankRes.id }, select: { id: true, ledgerAccountId: true } });
  const mkC = (x: Any) => acc.createContact({ tenantId: tid, systemId: SYS, ...x });
  const vJur = await mkC({ kind: "VENDOR", legalType: "COMPANY", name: "บริษัท รับเหมา จำกัด", taxId: thaiTaxId("010556199991"), branchCode: "00000", address: "1 ถ.หนึ่ง กรุงเทพฯ" });
  const vInd = await mkC({ kind: "VENDOR", legalType: "PERSON", name: "นายสมศักดิ์ รับจ้าง", taxId: thaiTaxId("310100012345"), address: "2 ถ.สอง ภูเก็ต" });
  const vForeign = await mkC({ kind: "VENDOR", legalType: "COMPANY", name: "Dive Agency Pte. Ltd.", taxId: "201912345K", taxIdCountry: "SG", country: "SG", address: "10 Marina Blvd, Singapore" });
  const vFdn = await mkC({ kind: "VENDOR", legalType: "COMPANY", name: "มูลนิธิรักษ์ทะเล", taxId: thaiTaxId("099300012345"), legalEntityType: "มูลนิธิ", address: "3 ถ.สาม ภูเก็ต" });
  const cust = await mkC({ kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ลูกค้าหักเรา จำกัด", taxId: thaiTaxId("010556188881"), branchCode: "00000", address: "4 ถ.สี่ กรุงเทพฯ" });
  const expAccts = await exp.listExpenseAccounts(SYS);
  const expLedger = expAccts.find((a: Any) => a.code === "6900") ?? expAccts[0];
  const day = (ym: string, d: number) => new Date(`${ym}-${String(d).padStart(2, "0")}T10:00:00+07:00`);

  /** ค่าใช้จ่ายไม่มี VAT ยอด base + จ่ายหัก ณ ที่จ่าย wht (whtIncomeType ส่ง = ออก 50 ทวิ อัตโนมัติ · ไม่ส่ง = หักแต่ยังไม่มีใบ) */
  async function payVendor(o: { vendorId: string; ym: string; d: number; base: number; wht: number; rateBp: number; incomeType?: string | null; lineIncomeType?: string | null; key: string }) {
    const e = await exp.createExpenseDoc({ tenantId: tid, systemId: SYS, docType: "EXPENSE", contactId: o.vendorId, issueDate: day(o.ym, o.d), vatMode: "NONE", lines: [{ description: `ค่าจ้าง ${o.key}`, qty: 1, unitPrice: o.base, vatRateBp: 0, accountId: expLedger.id }], createdById: owner.id });
    // ฟอร์ม V2 เก็บประเภทเงินได้ต่อบรรทัดผ่านตัวแก้ไข (createExpenseDoc ไม่รับ) — ตั้งตรงที่บรรทัด
    if (o.lineIncomeType) await prisma.accountDocumentLine.updateMany({ where: { documentId: e.id }, data: { whtIncomeType: o.lineIncomeType, whtRateBp: o.rateBp } });
    const ir = await exp.issueExpenseDoc(tid, SYS, e.id);
    if (!ir.ok) throw new Error(`issue ${o.key}: ${ir.reason}`);
    const pr = await exp.recordVendorPayment(tid, SYS, e.id, { paidAt: day(o.ym, o.d), channel: "TRANSFER", financeAccountId: bank.id, amount: o.base - o.wht, whtAmountSatang: o.wht, whtRateBp: o.rateBp, ...(o.incomeType ? { whtIncomeType: o.incomeType } : {}), createdById: owner.id, idempotencyKey: `${o.key}-${tid}` });
    if (!pr.ok) throw new Error(`pay ${o.key}: ${pr.reason}`);
    const pay = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: e.id }, orderBy: { createdAt: "desc" } });
    return { docId: e.id as string, paymentId: pay.id as string, certId: (pay.whtCertDocId as string | null) ?? null };
  }

  return { prisma, tid, SYS, ctx, owner, ownerActor, bank, vJur, vInd, vForeign, vFdn, cust, expLedger, day, payVendor };
}

export async function keepOrPurge(prisma: Any, tid: string, keep: boolean) {
  if (!tid) return;
  if (!keep) return purgeTenant(prisma, tid);
  const accEnv: Any = await import("./acc-v2-env.mts" as string);
  const qcOwner = await prisma.user.findFirst({ where: { email: accEnv.QC.ownerEmail }, select: { id: true } });
  if (qcOwner) await prisma.membership.upsert({ where: { userId_tenantId: { userId: qcOwner.id, tenantId: tid } }, create: { userId: qcOwner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() }, update: {} }).catch(() => undefined);
  const syss = await prisma.appSystem.findMany({ where: { tenantId: tid, type: "ACCOUNT" }, select: { id: true } });
  console.log(`KEEP=1 → ร้าน ${tid} · ${syss.map((x: Any) => `/app/sys/${x.id}/account/wht`).join(" · ")}`);
}

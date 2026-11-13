// QC ACC T2.11 — ใบกำกับภาษีเต็มรูปจาก POS / โรงแรม โดยผู้ซื้อไม่มีเลขผู้เสียภาษี 13 หลัก = คำเตือน BUYER_TAX_ID_MISSING (กดรับทราบ) ไม่ใช่บล็อก
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md T2.11 (เจ้าของสั่งแยกใบ 13 พ.ย.) · design note ledger/wo-notes/T2.11.md
// กฎ: skill shark-thai-law common-vat-invoice.md §14 (ประกาศ VAT ฉ.39 ข้อ 7, 9 [V] — เลขผู้ซื้อบังคับเฉพาะผู้ซื้อที่จด VAT) · test-rules T-ACC-04 [V]
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง "QC T2.11 BUYER TAXID" สร้างเอง ลบตอนจบ — KEEP=1 = เก็บไว้ดูหน้าจอ) · ไม่แตะ seed กลาง
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-buyer-taxid.mts
//
// เฉลยมือ (สตางค์ · สมุดจด VAT 7% · ราคา POS รวม VAT · ถอด VAT = g×700/10700 ปัดครึ่งขึ้น):
//   ทุกบิล = บรรทัดเดียว 10,700 → ฐาน 10,000 · VAT 700 · ยอด 10,700
//   S  บิลขอเต็มรูปตอนชำระ (createSale + ผู้ซื้อไม่มีเลข + รอยรับทราบ) → TAX_INVOICE 10,700/700 · ไม่มี ABB ที่ยังมีผล · ผู้ติดต่อใหม่ไม่มีเลข
//   L  บิล ABB → ออกทีหลังไม่มีเลข: ไม่ยืนยัน = LEGAL_ACK_REQUIRED (ไม่เขียนอะไร) · ยืนยัน = TAX_INVOICE 10,700/700 · ABB → CANCELLED
//   R1 คำขอจากใบเสร็จออนไลน์ไม่มีเลข → แถวคำขอ taxId null · ออกจากคำขอ: ไม่ยืนยัน = ปฏิเสธ · ยืนยัน = ISSUED
//   M1 คำขอไม่มีเลข "สมชาย  ใจดี" (ช่องว่างซ้ำ) + ออกทีหลัง "สมชาย ใจดี" ไม่มีเลข ⇒ คนเดียวกัน ⇒ คำขอ ISSUED
//   M2 คำขอไม่มีเลข "สมชาย ใจดี" + ออกทีหลัง "สมหญิง ใจงาม" ไม่มีเลข ⇒ คนละคน ⇒ คำขอ REJECTED (เหตุผลของระบบ)
//   M3 คำขอไม่มีเลข + ออกทีหลังมีเลข ⇒ คนละคน (มีเลขกับไม่มีเลข) ⇒ REJECTED
//   C  ผู้ติดต่อ: ไม่มีเลข ชื่อ+ที่อยู่+อีเมลตรง = ใช้แถวเดิม · ที่อยู่ต่าง = แถวใหม่ · ผู้ติดต่อเดิมที่มีเลข (ชื่อ+อีเมลตรง) = ไม่ใช้
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-buyer-taxid");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 900)}`}`);
};
const eq = (id: string, n: string, act: unknown, exp: unknown, sev: Sev = "CRITICAL") => chk(id, n, JSON.stringify(act) === JSON.stringify(exp), exp, act, sev);

const KEEP = process.env.KEEP === "1";
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const SH: Any = await import("@/lib/modules/pos/tax-invoice-shared" as string);
const TI: Any = await import("@/lib/modules/pos/tax-invoice" as string);
const RTR: Any = await import("@/lib/modules/pos/receipt-tax-request" as string);
const ETAX: Any = await import("@/lib/modules/pos/etax-link" as string);
const HE: Any = await import("@/lib/modules/pos/api/http-errors" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const AMB: Any = await import("@/lib/core/legal-ambient" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);
const posSvc: Any = await import("@/lib/modules/pos/service" as string);
const devMod: Any = await import("@/lib/modules/pos/device" as string);
const shiftMod: Any = await import("@/lib/modules/pos/shift" as string);
const ak: Any = await import("@/lib/api-keys/service" as string);
const scopes: Any = await import("@/lib/api-keys/scopes" as string);
const { drainAll } = (await import("@/lib/outbox-consumers" as string)) as Any;
const accEnv: Any = await import("./acc-v2-env.mts" as string);

async function drain() {
  for (let i = 0; i < 30; i++) {
    const r = await drainAll();
    if (!r.processed) return;
  }
}
async function purgeTenant(tenantId: string) {
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

const TENANT_NAME = "QC T2.11 BUYER TAXID";
const OWNER_EMAIL = "qc-t211-buyer@qc.local";
const VALID_JURISTIC = "0105555018001"; // หลักตรวจถูก (ใช้ใน posvat P4.7)
let tid = "";

// ═══ B0 ตัวอ่านร่วม (บริสุทธิ์) ═══
console.log("\n── B0 ตัวอ่านร่วม tax-invoice-shared (บริสุทธิ์) ──");
{
  const base = { kind: "PERSON", name: "สมชาย ใจดี", address: "1 ถ.สุขุมวิท กรุงเทพฯ" };
  const pNo = SH.parseTaxInvoiceBuyer(base);
  const pEmpty = SH.parseTaxInvoiceBuyer({ ...base, taxId: "" });
  const pDash = SH.parseTaxInvoiceBuyer({ ...base, taxId: " - " });
  const pNull = SH.parseTaxInvoiceBuyer({ ...base, taxId: null });
  eq("B0.1", "ไม่ส่ง / \"\" / \" - \" / null → ผ่าน · taxId null", [pNo.ok, pNo.buyer?.taxId, pEmpty.ok, pEmpty.buyer?.taxId, pDash.ok, pDash.buyer?.taxId, pNull.ok, pNull.buyer?.taxId], [true, null, true, null, true, null, true, null]);
  const bad12 = SH.parseTaxInvoiceBuyer({ ...base, taxId: "010555501800" });
  const badChk = SH.parseTaxInvoiceBuyer({ ...base, taxId: "0105555018002" });
  const badType = SH.parseTaxInvoiceBuyer({ ...base, taxId: 105555018001 });
  eq("B0.2", "มีค่าแต่ผิด (12 หลัก · หลักตรวจผิด · ชนิดตัวเลข) → TAX_ID_INVALID เหมือนเดิม [positive control ว่าตัวตรวจยังทำงาน]", [bad12.code, badChk.code, badType.code], ["TAX_ID_INVALID", "TAX_ID_INVALID", "TAX_ID_INVALID"]);
  const good = SH.parseTaxInvoiceBuyer({ ...base, kind: "JURISTIC", taxId: "0-1055-55018-00-1" });
  eq("B0.3", "เลขถูก (มีขีด) → ตัดขีด เก็บ 13 หลัก", [good.ok, good.buyer?.taxId], [true, VALID_JURISTIC]);
  const wr = SH.buyerTaxIdWarnings({ taxId: null }, "request");
  const wi = SH.buyerTaxIdWarnings({ taxId: null }, "issue");
  const reg = W.LEGAL_WARNINGS.BUYER_TAX_ID_MISSING;
  chk(
    "B0.4",
    "คำเตือนจากทะเบียนกลาง: รหัส BUYER_TAX_ID_MISSING · ป้าย [V] · อ้าง ฉ.39 ข้อ 7 · ขั้นขอ ack=false · ขั้นออก ack=true · ข้อความบอกว่าผู้ซื้อทั่วไปไม่ต้องมี/ผู้จด VAT ต้องมี",
    wr.length === 1 && wi.length === 1 && wr[0].code === "BUYER_TAX_ID_MISSING" && wr[0].tag === "V" && wr[0].ack === false && wi[0].ack === true && /ฉบับที่ 39 ข้อ 7/.test(wr[0].citation) && /ผู้ซื้อทั่วไปไม่ต้องมี/.test(wr[0].messageTh) && /จดทะเบียน VAT/.test(wr[0].messageTh) && wr[0].messageTh === reg.messageTh({}),
    "V/ack request false/issue true",
    [wr, wi],
  );
  chk("B0.5", "ข้อความไม่มีคำว่า \"ถูกกฎหมาย\"", !/ถูกกฎหมาย/.test(wi[0].messageTh), "ไม่มี", wi[0].messageTh, "MAJOR");
  eq("B0.6", "มีเลข → ไม่มีคำเตือน · ยืนยันแล้ว → ไม่ค้าง · ยังไม่ยืนยัน → ค้าง 1", [SH.buyerTaxIdWarnings({ taxId: VALID_JURISTIC }, "issue").length, SH.buyerTaxIdUnacked({ taxId: null }, ["BUYER_TAX_ID_MISSING"]).length, SH.buyerTaxIdUnacked({ taxId: null }, []).length], [0, 0, 1]);
  eq("B0.7", "buyerKindFromTaxId(null) = PERSON (ค่าเริ่มต้นของระบบ) · 0… = JURISTIC", [SH.buyerKindFromTaxId(null), SH.buyerKindFromTaxId(VALID_JURISTIC), SH.buyerKindFromTaxId("1234567890121")], ["PERSON", "JURISTIC", "PERSON"]);
  const sp = SH.sameBuyerParty;
  eq(
    "B0.8",
    "จับคู่คนเดียวกัน: ไม่มีเลขทั้งคู่ ชื่อตรง (ช่องว่าง/ตัวพิมพ์) = ใช่ · ชื่อต่าง = ไม่ · อีเมลขัด = ไม่ · มีเลขข้างเดียว = ไม่ · เลขตรง = ใช่",
    [
      sp({ taxId: null, name: "สมชาย  ใจดี" }, { taxId: null, name: " สมชาย ใจดี" }),
      sp({ taxId: null, name: "Somchai Jaidee" }, { taxId: null, name: "somchai jaidee" }),
      sp({ taxId: null, name: "สมชาย ใจดี" }, { taxId: null, name: "สมหญิง ใจงาม" }),
      sp({ taxId: null, name: "สมชาย ใจดี", email: "a@x.co" }, { taxId: null, name: "สมชาย ใจดี", email: "b@x.co" }),
      sp({ taxId: null, name: "สมชาย ใจดี", email: "a@x.co" }, { taxId: null, name: "สมชาย ใจดี", email: null }),
      sp({ taxId: null, name: "บริษัท ก" }, { taxId: VALID_JURISTIC, name: "บริษัท ก" }),
      sp({ taxId: VALID_JURISTIC, name: "บริษัท ก" }, { taxId: VALID_JURISTIC, name: "บจก. ก" }),
    ],
    [true, true, false, false, true, false, true],
  );
  eq("B0.9", "parseAckCodes: ไม่ส่ง = [] · อาร์เรย์สตริง = เดิม · ชนิดผิด = null", [SH.parseAckCodes(undefined), SH.parseAckCodes(["BUYER_TAX_ID_MISSING"]), SH.parseAckCodes("BUYER_TAX_ID_MISSING"), SH.parseAckCodes([1])], [[], ["BUYER_TAX_ID_MISSING"], null, null]);
  eq("B0.10", "sameTaxInvoiceBuyer เลข null เทียบตรงตัว (ยิงซ้ำผู้ซื้อเดิม = เอกสารเดิม)", [SH.sameTaxInvoiceBuyer({ ...pNo.buyer }, { ...pEmpty.buyer }), SH.sameTaxInvoiceBuyer({ ...pNo.buyer }, { ...pNo.buyer, taxId: VALID_JURISTIC })], [true, false]);
  eq("B0.11", "รหัสปฏิเสธใหม่ LEGAL_ACK_REQUIRED มีข้อความไทย + คีย์จอ", [SH.TAX_INVOICE_REFUSAL_CODES.includes("LEGAL_ACK_REQUIRED"), /รับทราบ/.test(SH.TAX_INVOICE_MESSAGES.LEGAL_ACK_REQUIRED), SH.taxInvoiceRefusalKey("LEGAL_ACK_REQUIRED")], [true, true, "taxInvoice.errors.legalAckRequired"]);
  // REST: คำปฏิเสธ → ซองกลาง 409 legal_ack_required + warnings
  const apiErr = HE.toPosApiError(SH.taxInvoiceAckRefusal(wi));
  eq("B0.12", "REST: LEGAL_ACK_REQUIRED → 409 legal_ack_required + error.warnings[BUYER_TAX_ID_MISSING]", [apiErr?.status, apiErr?.code, (apiErr?.warnings ?? []).map((w: Any) => w.code)], [409, "legal_ack_required", ["BUYER_TAX_ID_MISSING"]]);
}

try {
  console.log("\n── B1 ฟิกซ์เจอร์ร้าน T2.11 ──");
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } })) await purgeTenant(old.id);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t211-${Date.now().toString(36)}`, status: "ACTIVE", enabledModules: ["ACCOUNT", "POS"] } })).id;
  const owner = (await prisma.user.findFirst({ where: { email: OWNER_EMAIL } })) ?? (await prisma.user.create({ data: { email: OWNER_EMAIL, name: "เจ้าของ T2.11" } }));
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "สาขาท่าเรือ", slug: `t211-${Date.now().toString(36)}`, status: "ACTIVE" } });
  const accSys = await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T2.11");
  const posSys = await sysSvc.createSystem(tid, "POS", "ขายหน้าร้าน T2.11");
  await sysSvc.linkUnit(tid, accSys.id, unit.id);
  await sysSvc.linkUnit(tid, posSys.id, unit.id);
  const SYS = accSys.id;
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: SYS, linkedKind: "POS", linkedId: posSys.id } });
  await acc.saveSettings(tid, SYS, { orgPrefix: "บริษัท", orgName: "ทีสองสิบเอ็ด ดำน้ำ จำกัด", taxId: "0105566018881" /* หลักตรวจถูก (e-Tax ตรวจเลขผู้ขาย) */, branchCode: "00000", branchName: "สำนักงานใหญ่", address: "11 ถ.ทดสอบ", vatRegistered: true, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const ownerActor = { userId: owner.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const DEV = `t211dev${Date.now().toString(36)}`;
  const pctx = { tenantId: tid, systemId: posSys.id, unitId: unit.id };
  await devMod.registerDevice(pctx, ownerActor, { name: "เครื่องหน้าร้าน", deviceCode: DEV });
  await shiftMod.openShift({ ...pctx, deviceId: DEV }, ownerActor, { deviceId: DEV, deviceLabel: "เครื่องหน้าร้าน", floatSatang: 0 });
  const shiftId = (await prisma.posShift.findFirst({ where: { tenantId: tid, deviceId: DEV, status: "OPEN" } }))?.id;

  const sales: Record<string, { id: string; receiptNo: string; token?: string }> = {};
  const sell = async (key: string, extra: Any = {}) => {
    const r = await prisma.$transaction((tx: Any) =>
      posSvc.createSale({ tenantId: tid, unitId: unit.id, systemId: posSys.id, shiftId, idempotencyKey: `t211-${tid}-${key}`, lines: [{ name: "ทริปดำน้ำครึ่งวัน", qty: 1, unitPriceSatang: 10_700 }], payMethods: [{ type: "CASH", amountSatang: 10_700 }], ...extra }, tx),
    );
    const row = await prisma.posSale.findUnique({ where: { id: r.saleId }, select: { publicToken: true } });
    sales[key] = { id: r.saleId, receiptNo: r.receiptNo, token: row?.publicToken ?? undefined };
    return r;
  };
  const docOf = (saleId: string, docType: string) => prisma.accountDocument.findFirst({ where: { systemId: SYS, refType: "PosSale", refId: saleId, docType }, select: { id: true, docNo: true, status: true, grandTotal: true, vatAmount: true, contactId: true, contactSnapshot: true } });
  const acksOf = (saleId: string) => prisma.auditLog.findMany({ where: { tenantId: tid, action: "legal.warning.ack", targetType: "PosSale", targetId: saleId }, select: { actorType: true, actorId: true, after: true } });

  // ═══ S ตอนชำระ (createSale + สำเนาผู้ซื้อไม่มีเลข + รอยรับทราบใน tx ของบิล) ═══
  console.log("\n── B2 ขอเต็มรูปตอนชำระ — ผู้ซื้อไม่มีเลข ──");
  const sBuyer = SH.parseTaxInvoiceBuyer({ kind: "PERSON", name: "นายตอนชำระ ไม่มีเลข", address: "22 หมู่ 3 ภูเก็ต", email: "pay@buyer.test" }).buyer;
  await sell("S", { taxInvoice: { ...sBuyer, requestedAt: new Date().toISOString() }, taxInvoiceLegalAck: { codes: ["BUYER_TAX_ID_MISSING"], actorId: owner.id, actorType: "USER", via: "screen" } });
  await drain();
  const sRow = await prisma.posSale.findUnique({ where: { id: sales.S.id }, select: { taxInvoice: true, taxInvoiceDocId: true } });
  const sDoc = await docOf(sales.S.id, "TAX_INVOICE");
  eq("B2.1", "สำเนาบนบิล: taxId null · อ่านกลับผ่าน snapshotBuyer ได้ (เดิมได้ null = ใบเต็มรูปหาย)", [(sRow?.taxInvoice as Any)?.taxId, SH.snapshotBuyer(sRow?.taxInvoice)?.name], [null, "นายตอนชำระ ไม่มีเลข"]);
  eq("B2.2", "ตอนชำระได้ TAX_INVOICE 10,700 / VAT 700 · สำเนาผู้ติดต่อบนเอกสาร taxId \"\"", [sDoc?.grandTotal, sDoc?.vatAmount, (sDoc?.contactSnapshot as Any)?.taxId, (sDoc?.contactSnapshot as Any)?.name], [10_700, 700, "", "นายตอนชำระ ไม่มีเลข"]);
  const sContact = sDoc?.contactId ? await prisma.accountContact.findUnique({ where: { id: sDoc.contactId }, select: { taxId: true, name: true, address: true, legalType: true } }) : null;
  eq("B2.3", "ผู้ติดต่อใหม่ไม่มีเลข · บุคคล · ที่อยู่ตามที่กรอก", [sContact?.taxId ?? null, sContact?.legalType, sContact?.address], [null, "PERSON", "22 หมู่ 3 ภูเก็ต"]);
  const sAck = await acksOf(sales.S.id);
  eq("B2.4", "รอยรับทราบ 1 แถว (op pos.sale.taxInvoice · รหัส BUYER_TAX_ID_MISSING · ผู้ใช้)", sAck.map((a: Any) => [a.actorType, a.actorId === owner.id, a.after?.op, a.after?.codes]), [["USER", true, "pos.sale.taxInvoice", ["BUYER_TAX_ID_MISSING"]]]);

  // ═══ L ออกทีหลัง ═══
  console.log("\n── B3 ออกทีหลัง (ABB → เต็มรูป) — ไม่มีเลข ──");
  await sell("L");
  await drain();
  const lBuyer = { kind: "PERSON", name: "นางสาวออกทีหลัง", address: "33 ถ.ราไวย์ ภูเก็ต", email: "later@buyer.test" };
  const lNo = await TI.issueFullTaxInvoice(pctx, ownerActor, { saleId: sales.L.id, buyer: lBuyer });
  const lAfterNo = await prisma.posSale.findUnique({ where: { id: sales.L.id }, select: { taxInvoiceDocId: true } });
  const lDocNo = await docOf(sales.L.id, "TAX_INVOICE");
  eq("B3.1", "ไม่ยืนยัน → LEGAL_ACK_REQUIRED + legal.warnings[BUYER_TAX_ID_MISSING ack:true] · ไม่เขียนอะไร (บิลไม่มีเลขเอกสาร · ไม่มี TAX_INVOICE)", [lNo.ok, lNo.code, lNo.legal?.warnings?.map((w: Any) => [w.code, w.ack]), lAfterNo?.taxInvoiceDocId, lDocNo], [false, "LEGAL_ACK_REQUIRED", [["BUYER_TAX_ID_MISSING", true]], null, null]);
  const lOk = await TI.issueFullTaxInvoice(pctx, ownerActor, { saleId: sales.L.id, buyer: lBuyer, acknowledge: ["BUYER_TAX_ID_MISSING"] });
  const lDoc = await docOf(sales.L.id, "TAX_INVOICE");
  const lAbb = await docOf(sales.L.id, "TAX_INVOICE_ABB");
  eq("B3.2", "ยืนยันแล้ว → ออกได้ (ไม่บล็อก) · TAX_INVOICE 10,700 / 700 · ABB → CANCELLED", [lOk.ok, lOk.docId === lDoc?.id, lDoc?.grandTotal, lDoc?.vatAmount, lAbb?.status], [true, true, 10_700, 700, "CANCELLED"]);
  const lAck = await acksOf(sales.L.id);
  const lAudit = await prisma.auditLog.findFirst({ where: { tenantId: tid, action: "pos.taxinvoice.issued", targetId: sales.L.id }, select: { after: true } });
  eq("B3.3", "รอยรับทราบ 1 แถว (op pos.taxinvoice.issue) · audit ออกใบ taxId null (ไม่มีเลขปิดปลอม)", [lAck.map((a: Any) => [a.after?.op, a.after?.codes]), (lAudit?.after as Any)?.taxId], [[["pos.taxinvoice.issue", ["BUYER_TAX_ID_MISSING"]]], null]);
  const lAgain = await TI.issueFullTaxInvoice(pctx, ownerActor, { saleId: sales.L.id, buyer: lBuyer });
  eq("B3.4", "ยิงซ้ำผู้ซื้อเดิม (ไม่ต้องยืนยันซ้ำ) = เอกสารเดิม · ไม่มีรอยรับทราบเพิ่ม", [lAgain.ok, lAgain.docId === lOk.docId, (await acksOf(sales.L.id)).length], [true, true, 1]);
  const lOther = await TI.issueFullTaxInvoice(pctx, ownerActor, { saleId: sales.L.id, buyer: { ...lBuyer, name: "คนอื่น" }, acknowledge: ["BUYER_TAX_ID_MISSING"] });
  eq("B3.5", "ผู้ซื้อคนอื่นที่ไม่มีเลข = ALREADY_ISSUED (ไม่รวมเป็นคนเดียวกัน)", lOther.code, "ALREADY_ISSUED");

  // ═══ ทาง REST/เลขา (บริบทการยืนยัน) ═══
  console.log("\n── B4 บริบทการยืนยัน (REST runner / เลขา AI) ──");
  await sell("A");
  await drain();
  let thrown: Any = null;
  try {
    await AMB.withLegalAck({ codes: [], actorId: null, actorType: "API_KEY", via: "rest" }, () => TI.issueFullTaxInvoice(pctx, ownerActor, { saleId: sales.A.id, buyer: { kind: "PERSON", name: "ลูกค้า REST", address: "44 ถ.ทดสอบ" } }));
  } catch (e) {
    thrown = e;
  }
  eq("B4.1", "บริบทไม่มีรหัส → LegalAckRequiredError (runner → 409) · ไม่มีเอกสาร", [W.isLegalAckRequiredError(thrown), thrown?.warnings?.map((w: Any) => w.code), await docOf(sales.A.id, "TAX_INVOICE")], [true, ["BUYER_TAX_ID_MISSING"], null]);
  const viaCtx = await AMB.withLegalAck({ codes: ["BUYER_TAX_ID_MISSING"], actorId: null, actorType: "API_KEY", via: "rest" }, () => TI.issueFullTaxInvoice(pctx, ownerActor, { saleId: sales.A.id, buyer: { kind: "PERSON", name: "ลูกค้า REST", address: "44 ถ.ทดสอบ" } }));
  const aAck = await acksOf(sales.A.id);
  eq("B4.2", "บริบทมีรหัส → ออกได้ · รอยรับทราบเป็นของคีย์ API (via rest)", [viaCtx.ok, aAck.map((a: Any) => [a.actorType, a.after?.via])], [true, [["API_KEY", "rest"]]]);

  // ═══ REST จริงผ่าน route /api/v1/pos ═══
  console.log("\n── B5 REST POST /sales/{id}/tax-invoice ──");
  {
    await sell("H");
    await drain();
    let key: Any = null;
    try {
      key = await ak.createApiKey({ tenantId: tid }, "T2.11 pos", { scopes: scopes.expandBundles(["pos-admin"]), systemId: posSys.id });
    } catch (e) {
      console.log(`  (createApiKey: ${e instanceof Error ? e.message : String(e)})`);
    }
    const route = (await import("@/app/api/v1/pos/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;
    const call = async (path: string, body: unknown) => {
      const req = new Request(`http://x/api/v1/pos${path}`, { method: "POST", headers: { authorization: `Bearer ${key?.rawKey ?? ""}`, "content-type": "application/json", "idempotency-key": `t211-${Date.now()}-${Math.random().toString(16).slice(2)}` }, body: JSON.stringify(body) });
      const res = await route.POST!(req, { params: Promise.resolve({ path: path.split("/").filter(Boolean) }) });
      const text = await res.text();
      let j: Any = null;
      try {
        j = JSON.parse(text);
      } catch {
        j = { _raw: text.slice(0, 300) };
      }
      return { status: res.status, body: j };
    };
    const buyer = { kind: "PERSON", name: "ลูกค้า REST จริง", address: "55 ถ.ทดสอบ" };
    const r1 = await call(`/sales/${sales.H.id}/tax-invoice`, { buyer, unitId: unit.id });
    eq("B5.1", "ไม่มีเลข ไม่ส่ง acknowledge → 409 legal_ack_required + warnings[BUYER_TAX_ID_MISSING]", [r1.status, r1.body?.error?.code, (r1.body?.error?.warnings ?? []).map((w: Any) => w.code)], [409, "legal_ack_required", ["BUYER_TAX_ID_MISSING"]]);
    const r2 = await call(`/sales/${sales.H.id}/tax-invoice`, { buyer: { ...buyer, taxId: "" }, unitId: unit.id, acknowledge: ["BUYER_TAX_ID_MISSING"] });
    const hDoc = await docOf(sales.H.id, "TAX_INVOICE");
    eq("B5.2", "ส่ง acknowledge (taxId \"\") → 200 · docId = TAX_INVOICE ของบิล · 10,700/700", [r2.status, r2.body?.data?.docId === hDoc?.id, hDoc?.grandTotal, hDoc?.vatAmount], [200, true, 10_700, 700]);
    const r3 = await call(`/sales/${sales.H.id}/tax-invoice`, { buyer: { ...buyer, taxId: "12345" }, unitId: unit.id });
    eq("B5.3", "เลขไม่ครบ 13 หลัก → 422 validation (ว่าง ≠ ผิด)", [r3.status, r3.body?.error?.code], [422, "validation"]);
  }

  // ═══ R คำขอจากใบเสร็จออนไลน์ ═══
  console.log("\n── B6 คำขอจากใบเสร็จออนไลน์ (ลูกค้า) → พนักงานออก ──");
  await sell("R1");
  await drain();
  const pub = await RTR.requestFullTaxInvoice(sales.R1.token, { name: "คุณลูกค้าออนไลน์", address: "66 ถ.ทดสอบ ภูเก็ต", email: "online@buyer.test" });
  const req1 = await prisma.posTaxInvoiceRequest.findFirst({ where: { tenantId: tid, saleId: sales.R1.id }, select: { id: true, taxId: true, status: true } });
  eq("B6.1", "ลูกค้าไม่กรอกเลข → รับคำขอ (ไม่มีช่องติ๊ก) + คำเตือนแจ้งให้ทราบ (ack:false) · แถว taxId null", [pub.ok, pub.warnings?.map((w: Any) => [w.code, w.ack]), req1?.taxId, req1?.status], [true, [["BUYER_TAX_ID_MISSING", false]], null, "REQUESTED"]);
  const pubBad = await RTR.requestFullTaxInvoice(sales.R1.token, { name: "x", address: "y", taxId: "12345" });
  eq("B6.2", "เลขที่กรอกแต่ไม่ครบ 13 หลัก → VALIDATION (positive control)", pubBad.code, "VALIDATION");
  const fromNo = await TI.issueFromTaxInvoiceRequest(pctx, ownerActor, { requestId: req1.id });
  eq("B6.3", "พนักงานออกจากคำขอโดยไม่ยืนยัน → LEGAL_ACK_REQUIRED · คำขอยัง REQUESTED", [fromNo.code, (await prisma.posTaxInvoiceRequest.findUnique({ where: { id: req1.id } }))?.status], ["LEGAL_ACK_REQUIRED", "REQUESTED"]);
  const fromOk = await TI.issueFromTaxInvoiceRequest(pctx, ownerActor, { requestId: req1.id, acknowledge: ["BUYER_TAX_ID_MISSING"] });
  const r1Doc = await docOf(sales.R1.id, "TAX_INVOICE");
  const req1After = await prisma.posTaxInvoiceRequest.findUnique({ where: { id: req1.id } });
  eq("B6.4", "ยืนยันแล้ว → ISSUED · accountDocId = ใบเต็มรูป · ชนิดผู้ซื้อ = บุคคล (ค่าเริ่มต้นเมื่อไม่มีเลข)", [fromOk.ok, req1After?.status, req1After?.accountDocId === r1Doc?.id, (r1Doc?.contactSnapshot as Any)?.legalType], [true, "ISSUED", true, "PERSON"]);

  // ═══ M จับคู่คำขอที่ยังเปิดตอนออกทีหลัง ═══
  console.log("\n── B7 ปิดคำขอที่ยังเปิด เมื่อออกทีหลังโดยไม่อ้างคำขอ ──");
  for (const k of ["M1", "M2", "M3"]) await sell(k);
  await drain();
  await RTR.requestFullTaxInvoice(sales.M1.token, { name: "สมชาย  ใจดี", address: "77 ถ.ทดสอบ" });
  await RTR.requestFullTaxInvoice(sales.M2.token, { name: "สมชาย ใจดี", address: "77 ถ.ทดสอบ" });
  await RTR.requestFullTaxInvoice(sales.M3.token, { name: "บริษัท สามเอ็ม จำกัด", address: "88 ถ.ทดสอบ" });
  const ack = ["BUYER_TAX_ID_MISSING"];
  const m1 = await TI.issueFullTaxInvoice(pctx, ownerActor, { saleId: sales.M1.id, buyer: { kind: "PERSON", name: "สมชาย ใจดี", address: "77 ถ.ทดสอบ" }, acknowledge: ack });
  const m2 = await TI.issueFullTaxInvoice(pctx, ownerActor, { saleId: sales.M2.id, buyer: { kind: "PERSON", name: "สมหญิง ใจงาม", address: "77 ถ.ทดสอบ" }, acknowledge: ack });
  const m3 = await TI.issueFullTaxInvoice(pctx, ownerActor, { saleId: sales.M3.id, buyer: { kind: "JURISTIC", name: "บริษัท สามเอ็ม จำกัด", address: "88 ถ.ทดสอบ", taxId: VALID_JURISTIC } });
  const st = async (k: string) => (await prisma.posTaxInvoiceRequest.findFirst({ where: { tenantId: tid, saleId: sales[k].id } }))?.status;
  eq("B7.1", "M1 ชื่อเดียวกัน (ต่างแค่ช่องว่าง) ไม่มีเลขทั้งคู่ → คำขอ ISSUED", [m1.ok, await st("M1")], [true, "ISSUED"]);
  eq("B7.2", "M2 ชื่อต่าง ไม่มีเลขทั้งคู่ → คำขอ REJECTED (ไม่รวมคนละคน)", [m2.ok, await st("M2")], [true, "REJECTED"]);
  eq("B7.3", "M3 คำขอไม่มีเลข ออกจริงมีเลข → REJECTED", [m3.ok, await st("M3")], [true, "REJECTED"]);
  const rejAudit = await prisma.auditLog.findMany({ where: { tenantId: tid, action: "pos.taxinvoice.rejected" }, select: { after: true } });
  chk("B7.4", "audit ปฏิเสธอัตโนมัติ 2 แถว · taxId null (ไม่มีเลขปิดปลอม) · เหตุผลของระบบ", rejAudit.length === 2 && rejAudit.every((a: Any) => a.after?.system === true && a.after?.taxId === null), "2 แถว", rejAudit);

  // ═══ C ผู้ติดต่อ ═══
  console.log("\n── B8 ผู้ติดต่อของผู้ซื้อไม่มีเลข (ไม่รวมคนละคน) ──");
  {
    const accIdx: Any = await import("@/lib/modules/account" as string);
    const existing = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "PERSON", name: "นายชื่อซ้ำ", taxId: "1234567890121", email: "dup@buyer.test", address: "99 ถ.เดิม" });
    for (const k of ["C1", "C2", "C3", "C4"]) await sell(k);
    await drain();
    const mk = (address: string, email: string | null) => ({ kind: "PERSON", name: "นายชื่อซ้ำ", taxId: "", branchCode: "00000", address, email });
    const c1 = await accIdx.supersedeAbbWithTaxInvoice({ tenantId: tid, sourceSystemId: posSys.id, refId: sales.C1.id, buyer: mk("99 ถ.เดิม", "dup@buyer.test") });
    const c2 = await accIdx.supersedeAbbWithTaxInvoice({ tenantId: tid, sourceSystemId: posSys.id, refId: sales.C2.id, buyer: mk("99 ถ.เดิม", "dup@buyer.test") });
    const c3 = await accIdx.supersedeAbbWithTaxInvoice({ tenantId: tid, sourceSystemId: posSys.id, refId: sales.C3.id, buyer: mk("100 ถ.ใหม่", "dup@buyer.test") });
    const c4 = await accIdx.supersedeAbbWithTaxInvoice({ tenantId: tid, sourceSystemId: posSys.id, refId: sales.C4.id, buyer: mk("99 ถ.เดิม", null) });
    const cid = async (r: Any) => (r?.ok ? (await prisma.accountDocument.findUnique({ where: { id: r.docId }, select: { contactId: true } }))?.contactId : null);
    const [i1, i2, i3, i4] = [await cid(c1), await cid(c2), await cid(c3), await cid(c4)];
    eq(
      "B8.1",
      "ผู้ติดต่อเดิมที่มีเลข (ชื่อ+อีเมลตรง) ไม่ถูกใช้ · ไม่มีเลข ชื่อ+ที่อยู่+อีเมลตรง = แถวเดียวกัน · ที่อยู่ต่าง = แถวใหม่ · อีเมลว่างกับมีอีเมล = แถวใหม่",
      [i1 !== existing.id, i1 === i2, i3 !== i1, i4 !== i1 && i4 !== i3],
      [true, true, true, true],
    );
    const noTax = await prisma.accountContact.count({ where: { systemId: SYS, name: "นายชื่อซ้ำ", taxId: null } });
    eq("B8.2", "ผู้ติดต่อ \"นายชื่อซ้ำ\" ไม่มีเลข = 3 แถว (C1=C2 · C3 · C4) · แถวมีเลขคงเดิม 1", [noTax, await prisma.accountContact.count({ where: { systemId: SYS, name: "นายชื่อซ้ำ", taxId: "1234567890121" } })], [3, 1]);
  }

  // ═══ e-Tax ═══
  console.log("\n── B9 ลิงก์ e-Tax ──");
  {
    const pL = await ETAX.etaxPreview(pctx, ownerActor, { saleId: sales.L.id });
    eq("B9.1", "ใบที่ผู้ซื้อไม่มีเลข (มีอีเมล) → สถานะ NO_BUYER_TAX_ID \"ส่ง e-Tax ไม่ได้\" (ไม่ใช่ UNKNOWN/ล้ม)", [pL.ok, pL.code, /ส่ง e-Tax ไม่ได้/.test(pL.message ?? "")], [false, "NO_BUYER_TAX_ID", true]);
    await sell("E");
    await drain();
    const eIss = await TI.issueFullTaxInvoice(pctx, ownerActor, { saleId: sales.E.id, buyer: { kind: "JURISTIC", name: "บริษัท มีเลข จำกัด", address: "12 ถ.ทดสอบ", taxId: VALID_JURISTIC, email: "etax@buyer.test" } });
    const pE = await ETAX.etaxPreview(pctx, ownerActor, { saleId: sales.E.id });
    eq("B9.2", "positive control: ใบที่มีเลข + อีเมล → XML ตัวอย่างได้ (เลขผู้ซื้ออยู่ใน XML)", [pE.ok, typeof pE.xml === "string" && pE.xml.includes(`${VALID_JURISTIC}00000`)], [true, true]);
    if (!pE.ok) console.log("   (B9.2 debug)", JSON.stringify({ eIss, pE }).slice(0, 600));
  }

  // ═══ ภาษีขาย ═══
  console.log("\n── B10 รายงานภาษีขาย: แถวใบเต็มรูปไม่มีเลขผู้ซื้อ ──");
  {
    const STR: Any = await import("@/lib/modules/account/sales-tax-report" as string);
    const bkk = new Date(Date.now() + 7 * 3600_000);
    const M = bkk.toISOString().slice(0, 7);
    const r = await STR.salesTaxReport({ tenantId: tid, systemId: SYS }, M, { abbMode: "PER_BILL" });
    const lDocNo2 = (await docOf(sales.L.id, "TAX_INVOICE"))?.docNo;
    const row = r.rows.find((x: Any) => x.docNo === lDocNo2);
    eq("B10.1", "แถวใบ L: ชื่อผู้ซื้อ · เลขว่าง · สาขาว่าง (ไม่พิมพ์ 00000 ให้คนไม่มีเลข) · 10,000/700", [row?.buyerName, row?.buyerTaxId, row?.buyerBranchCode, row?.base ?? row?.parts?.[0]?.base, row?.vat ?? row?.parts?.[0]?.vat], ["นางสาวออกทีหลัง", "", "", 10_000, 700], "MAJOR");
  }
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 6).join("\n")}` : String(e));
} finally {
  if (tid && !KEEP) {
    try {
      await purgeTenant(tid);
    } catch (e) {
      console.log(`ลบร้านทดสอบไม่หมด: ${String(e)}`);
    }
  } else if (tid && KEEP) {
    const qcOwner = await prisma.user.findFirst({ where: { email: accEnv.QC.ownerEmail }, select: { id: true } });
    if (qcOwner) await prisma.membership.upsert({ where: { userId_tenantId: { userId: qcOwner.id, tenantId: tid } }, create: { userId: qcOwner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() }, update: {} }).catch((e: unknown) => console.log(`membership: ${String(e)}`));
    console.log(`KEEP=1 → ร้าน ${tid}`);
  }
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T2.11 buyer tax id optional =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.length > 0 ? 1 : 0);

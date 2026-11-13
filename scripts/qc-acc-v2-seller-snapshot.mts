// QC ACC T2.9 — ตรึงข้อมูลผู้ขาย + ข้อความท้ายใบตอนออกเอกสาร (K4)
//
// design note ledger/wo-notes/T2.9.md · ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-seller-snapshot.mts
//
// เฉลย:
//   E1 ออกใบกำกับ (ชื่อ "ร้านเดิม" ที่อยู่ "1 ถ.เดิม" เลข 0105561000290 สาขา 00000 · หมายเหตุท้ายใบ "ขอบคุณ (เดิม)") ⇒ snapshot via ISSUE ตรงค่าเดิม
//   E2 แก้ค่าตั้งกิจการเป็น "ร้านใหม่" / "2 ถ.ใหม่" / 0105561000291 / สาขา 00001 + หมายเหตุท้ายใบ "ขอบคุณ (ใหม่)"
//      ⇒ ใบพิมพ์เก่ายังเป็นค่าเดิมทุกช่อง · ใบที่ออกหลังแก้ = ค่าใหม่ · ร่าง = ค่าปัจจุบัน
//   E3 ใบอัตโนมัติ (ใบเสร็จของงวดรับเงิน — ไม่ผ่าน issueDocument) ยังไม่ตรึงตอนออก ⇒ แก้ค่าตั้งครั้งถัดไปตรึงด้วยค่าก่อนแก้ (via SETTINGS_CHANGE)
//   E4 หน้ารายละเอียด/REST อ่าน snapshot · ใบที่ยกเลิกยังคงค่าที่ตรึง
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-seller-snapshot");

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 700)}`}`);
};
const D = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d, 5));

let tid = "";
const users: string[] = [];
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const DS = (await import("@/lib/modules/account/doc-settings" as string)) as Any;
  const DD = (await import("@/lib/modules/account/doc-detail" as string)) as Any;
  const PV = (await import("@/lib/modules/account/print-view" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const SER = (await import("@/lib/modules/account/api/serialize" as string)) as Any;

  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC T2.9", slug: `qc-t29-${stamp}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-t29-${stamp}@qc.local`, name: "เจ้าของ T2.9" } });
  users.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const S = (await sys.createSystem(tid, "ACCOUNT", "บัญชี T2.9")).id;
  const ctx = { tenantId: tid, systemId: S };
  const OLD = { orgName: "ร้านเดิม", address: "1 ถ.เดิม", taxId: "0105561000290", branchCode: "00000", phone: "020000000", vatRegistered: true, vatRateBp: 700 };
  await acc.saveSettings(tid, S, OLD);
  await gl.ensureAccounting(ctx);
  const cur0 = await DS.getDocSettings(ctx);
  await DS.saveDocSettings(ctx, { notes: { TAX_INVOICE: { footer: "ขอบคุณ (เดิม)", terms: "" }, INVOICE: { footer: "ขอบคุณ (เดิม)", terms: "" } } });
  void cur0;
  const bank = await fin.createFinanceAccount({ tenantId: tid, systemId: S, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
  const cust = await acc.createContact({ tenantId: tid, systemId: S, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า T2.9", taxId: "0105561999290", branchCode: "00000", address: "9 ถ.ลูกค้า" });
  const L = { description: "ค่าบริการ", qty: 1, unitPrice: 100_000, vatRateBp: 700, lineKind: "SERVICE" };
  const mk = (docType: string) => acc.createDocument({ tenantId: tid, systemId: S, docType, contactId: cust.id, vatMode: "EXCLUDE", issueDate: D(9, 1), dueDate: D(9, 1), lines: [L], createdById: owner.id });

  console.log("\nE1 ออกเอกสาร → ตรึงผู้ขาย + ข้อความท้ายใบ:");
  const ti = await mk("TAX_INVOICE");
  await acc.issueDocument(tid, S, ti.id);
  const iv = await mk("INVOICE");
  await acc.issueDocument(tid, S, iv.id);
  const pay = await acc.recordPayment(tid, S, iv.id, { paidAt: D(9, 2), financeAccountId: bank.id, channel: "TRANSFER", amount: 107_000, createdById: owner.id, idempotencyKey: `e3-${stamp}` });
  const autoRc = await prisma.accountDocument.findFirst({ where: { systemId: S, docType: "RECEIPT", sourcePaymentId: pay.paymentId } });
  {
    const d = await prisma.accountDocument.findUnique({ where: { id: ti.id } });
    const sn = d?.sellerSnapshot as Any;
    chk("E1.1", "ใบกำกับ: snapshot v1 via ISSUE · ชื่อ/ที่อยู่/เลข/สาขา/โทร = ค่าเดิม · หมายเหตุท้ายใบ \"ขอบคุณ (เดิม)\"", sn?.v === 1 && sn.via === "ISSUE" && sn.seller.name === "ร้านเดิม" && sn.seller.address === "1 ถ.เดิม" && sn.seller.taxId === "0105561000290" && sn.seller.branch === "สำนักงานใหญ่" && sn.seller.phone === "020000000" && sn.text.footerNote === "ขอบคุณ (เดิม)", "ค่าเดิม", sn);
    chk("E1.2", "ใบเสร็จอัตโนมัติ (ไม่ผ่าน issueDocument) ยังไม่ตรึง — รอตรึงตอนแก้ค่าตั้ง", !!autoRc && autoRc.sellerSnapshot === null, "null", autoRc?.sellerSnapshot);
  }

  console.log("\nE2 แก้ค่าตั้งกิจการ → ใบเก่าไม่เปลี่ยน · ใบใหม่ใช้ค่าใหม่:");
  await DS.saveDocSettings(ctx, { notes: { TAX_INVOICE: { footer: "ขอบคุณ (ใหม่)", terms: "" } } });
  await acc.saveSettings(tid, S, { ...OLD, orgName: "ร้านใหม่", address: "2 ถ.ใหม่", taxId: "0105561000291", branchCode: "00001", phone: "029999999" });
  {
    const pOld = await PV.loadPrintView(tid, S, ti.id);
    chk("E2.1", "ใบพิมพ์ใบเก่า: ผู้ขาย = ค่าเดิมทุกช่อง · หมายเหตุท้ายใบเดิม · มีวันที่ตรึง", pOld?.view.seller.name === "ร้านเดิม" && pOld.view.seller.address === "1 ถ.เดิม" && pOld.view.seller.taxId === "0105561000290" && pOld.view.seller.branch === "สำนักงานใหญ่" && pOld.view.seller.phone === "020000000" && pOld.view.footerNote === "ขอบคุณ (เดิม)" && !!pOld.view.sellerFrozenAt, "ค่าเดิม", pOld && { s: pOld.view.seller, f: pOld.view.footerNote });
    const ti2 = await mk("TAX_INVOICE");
    await acc.issueDocument(tid, S, ti2.id);
    const pNew = await PV.loadPrintView(tid, S, ti2.id);
    chk("E2.2", "ใบที่ออกหลังแก้: ค่าใหม่ (ร้านใหม่ · 2 ถ.ใหม่ · 0105561000291 · สาขา 00001 · ขอบคุณ (ใหม่))", pNew?.view.seller.name === "ร้านใหม่" && pNew.view.seller.address === "2 ถ.ใหม่" && pNew.view.seller.taxId === "0105561000291" && pNew.view.seller.branch === "สาขา 00001" && pNew.view.footerNote === "ขอบคุณ (ใหม่)", "ค่าใหม่", pNew?.view.seller);
    const dr = await mk("TAX_INVOICE");
    const pDr = await PV.loadPrintView(tid, S, dr.id);
    chk("E2.3", "ร่าง: ค่าปัจจุบัน (ไม่มีวันที่ตรึง)", pDr?.view.seller.name === "ร้านใหม่" && pDr.view.sellerFrozenAt === null, "ร้านใหม่", pDr?.view.seller, "MAJOR");
  }

  console.log("\nE3 ใบอัตโนมัติที่ยังไม่ตรึง → ตรึงด้วยค่าก่อนแก้:");
  {
    const rc = autoRc ? await prisma.accountDocument.findUnique({ where: { id: autoRc.id } }) : null;
    const sn = rc?.sellerSnapshot as Any;
    chk("E3.1", "ใบเสร็จอัตโนมัติถูกตรึงตอนแก้ค่าตั้ง (via SETTINGS_CHANGE) ด้วยค่าเดิม \"ร้านเดิม\"", sn?.via === "SETTINGS_CHANGE" && sn.seller.name === "ร้านเดิม" && sn.seller.taxId === "0105561000290", "ร้านเดิม", sn);
    const p = autoRc ? await PV.loadPrintView(tid, S, autoRc.id) : null;
    chk("E3.2", "ใบพิมพ์ของใบเสร็จนั้น = ร้านเดิม", p?.view.seller.name === "ร้านเดิม", "ร้านเดิม", p?.view.seller);
  }

  console.log("\nE4 หน้ารายละเอียด/REST + ใบที่ยกเลิก:");
  {
    const dd = await DD.getDocDetailData(tid, S, ti.id);
    const rest = SER.docDetail(dd);
    chk("E4.1", "หน้ารายละเอียด: seller = ค่าที่ตรึง · REST documents.get มี seller.name/taxId/frozenAt", dd?.seller?.name === "ร้านเดิม" && rest.seller?.name === "ร้านเดิม" && rest.seller.taxId === "0105561000290" && !!rest.seller.frozenAt && rest.seller.frozenVia === "ISSUE", "ร้านเดิม", { dd: dd?.seller, rest: rest.seller });
    await acc.voidDocument(tid, S, ti.id, "ทดสอบยกเลิก");
    const pv = await PV.loadPrintView(tid, S, ti.id);
    chk("E4.2", "ใบที่ยกเลิกแล้วพิมพ์ยังเป็นค่าที่ตรึง", pv?.view.seller.name === "ร้านเดิม", "ร้านเดิม", pv?.view.seller, "MAJOR");
    const dDraft = await mk("INVOICE");
    const ddr = await DD.getDocDetailData(tid, S, dDraft.id);
    chk("E4.3", "ร่าง: seller = null (ยังไม่ตรึง)", ddr?.seller === null, null, ddr?.seller, "MINOR");
  }
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 6).join("\n")}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown>; updateMany: (a: unknown) => Promise<unknown> }>;
    await d(() => P.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountJournalEntry.updateMany({ where: { tenantId: tid }, data: { reversalOfId: null } }));
    await d(() => P.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocument.updateMany({ where: { tenantId: tid }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await d(() => P.accountDocumentPayment.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentRelation.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentPrint.deleteMany({ where: { tenantId: tid } }));
    for (const m of ["accountAttachment", "accountDocument", "accountDocSequence", "accountProduct", "accountMapping", "accountFinance", "accountContact", "accountPeriod", "accountSettings", "settingChange", "settingValue", "auditLog", "outboxEvent", "membership", "appSystemUnit"]) {
      await d(() => P[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => P.accountLedger.updateMany({ where: { tenantId: tid }, data: { parentId: null } }));
    await d(() => P.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.appSystem.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  for (const u of users) await d(() => prisma.user.delete({ where: { id: u } }));
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T2.9 ตรึงข้อมูลผู้ขาย =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => `${c.id} (${c.sev})`) })}`);
process.exit(f.length ? 1 : 0);

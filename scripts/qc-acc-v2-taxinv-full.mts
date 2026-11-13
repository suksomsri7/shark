// QC ACC T2.1 — ใบกำกับเต็มรูปครบรายการ (B1 B2 B12)
//
// design note ledger/wo-notes/T2.1.md · ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-taxinv-full.mts
//
// เฉลยคำนวณมือ:
//   B1 ผู้ซื้อไม่มีชื่อ/ที่อยู่ ⇒ TAX_INVOICE_BUYER_NAME_MISSING / _ADDRESS_MISSING (ป้าย V · ไม่ต้องยืนยัน · ไม่บล็อก) · ครบ = ไม่มีคำเตือน
//   B2 ผู้ซื้อบุคคลไม่มีเลข 13 หลัก ⇒ ออกใบเต็มรูปได้ ไม่มีคำเตือนเลข · ผู้ซื้อกิจการไม่มีเลข ⇒ BUYER_TAX_ID_MISSING (V · ไม่ยืนยัน)
//   B3 เทมเพลตปิด "ที่อยู่ลูกค้า"+"เลขผู้เสียภาษีลูกค้า" ⇒ ใบกำกับยังพิมพ์ทั้งสอง · ใบแจ้งหนี้ซ่อนตามค่าตั้ง
//   B4 ส่วนลดรายบรรทัด: 2 × 5,000 ส่วนลด 1,000 ⇒ ยอดบรรทัด 9,000 · VAT 630 (หลังส่วนลด) · คอลัมน์ส่วนลด "1,000.00" บนใบพิมพ์ · ไม่มีส่วนลด = ไม่มีคอลัมน์
import { readFileSync } from "node:fs";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-taxinv-full");

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
  const LG = (await import("@/lib/modules/account/legal-gate" as string)) as Any;

  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC T2.1", slug: `qc-t21-${stamp}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-t21-${stamp}@qc.local`, name: "เจ้าของ T2.1" } });
  users.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const S = (await sys.createSystem(tid, "ACCOUNT", "บัญชี T2.1")).id;
  const ctx = { tenantId: tid, systemId: S };
  await acc.saveSettings(tid, S, { orgName: "ร้าน T2.1", vatRegistered: true, vatRateBp: 700, taxId: "0105561000210", address: "21 ถ.ทดสอบ", branchCode: "00000" });
  await gl.ensureAccounting(ctx);
  const settings = await acc.getSettings(tid, S);
  const mkC = (o: Any) => acc.createContact({ tenantId: tid, systemId: S, kind: "CUSTOMER", ...o });
  const full = await mkC({ legalType: "COMPANY", name: "บริษัท ครบ จำกัด", taxId: "0105561999210", branchCode: "00000", address: "1 ถ.ครบ" });
  const noAddr = await mkC({ legalType: "COMPANY", name: "บริษัท ไม่มีที่อยู่ จำกัด", taxId: "0105561999211", branchCode: "00000" });
  const person = await mkC({ legalType: "PERSON", name: "นาย ผู้ซื้อ ทั่วไป", address: "3 ถ.บุคคล" });
  const bizNoTax = await mkC({ legalType: "COMPANY", name: "ห้าง ไม่มีเลข", address: "4 ถ.ห้าง" });
  const L = { description: "ค่าบริการ", qty: 1, unitPrice: 1_000_000, vatRateBp: 700, lineKind: "SERVICE" };
  const mk = (docType: string, contactId: string | null, lines: Any[] = [L]) =>
    acc.createDocument({ tenantId: tid, systemId: S, docType, contactId, vatMode: "EXCLUDE", issueDate: D(9, 1), dueDate: D(9, 1), lines, createdById: owner.id });
  const codesOf = async (id: string) => {
    const d = await DD.getDocDetailData(tid, S, id);
    return (LG.issueLegalWarnings({ docType: d.docType, vatAmount: d.vatAmount, buyer: d.docType === "TAX_INVOICE" ? d.taxBuyer : null }, settings) as Any[]).map((w) => w);
  };

  console.log("\nB1 ชื่อ/ที่อยู่ผู้ซื้อบนใบกำกับเต็มรูป:");
  const tFull = await mk("TAX_INVOICE", full.id);
  const tNoAddr = await mk("TAX_INVOICE", noAddr.id);
  const tNone = await mk("TAX_INVOICE", null);
  {
    const wFull = await codesOf(tFull.id);
    const wNoAddr = await codesOf(tNoAddr.id);
    const wNone = await codesOf(tNone.id);
    chk("B1.1", "ผู้ซื้อครบ ⇒ ไม่มีคำเตือนผู้ซื้อ", !wFull.some((w) => w.code.startsWith("TAX_INVOICE_BUYER") || w.code === "BUYER_TAX_ID_MISSING"), "ไม่มี", wFull.map((w) => w.code));
    const a = wNoAddr.find((w) => w.code === "TAX_INVOICE_BUYER_ADDRESS_MISSING");
    chk("B1.2", "ไม่มีที่อยู่ ⇒ TAX_INVOICE_BUYER_ADDRESS_MISSING · ป้าย V · ack=false · อ้าง ม.86/4(3) · ข้อความมีชื่อผู้ซื้อ", !!a && a.tag === "V" && a.ack === false && /86\/4\(3\)/.test(a.citation) && a.messageTh.includes("บริษัท ไม่มีที่อยู่ จำกัด"), "มี", a);
    chk("B1.3", "ไม่มีผู้ซื้อเลย ⇒ NAME_MISSING + ADDRESS_MISSING", wNone.some((w) => w.code === "TAX_INVOICE_BUYER_NAME_MISSING") && wNone.some((w) => w.code === "TAX_INVOICE_BUYER_ADDRESS_MISSING"), "2 รหัส", wNone.map((w) => w.code));
    const iss = await acc.issueDocument(tid, S, tNoAddr.id);
    chk("B1.4", "ออกใบที่ไม่มีที่อยู่ได้ (ไม่บล็อก · ไม่ต้องยืนยัน)", iss.ok, "ok", iss);
    const pv = await PV.loadPrintView(tid, S, tNoAddr.id);
    chk("B1.5", "ใบที่ขาดที่อยู่ ⇒ ไม่พิมพ์ \"ออกตามมาตรา 86/4\" (ค่าเริ่ม AUTO)", !!pv && pv.section864Missing.length > 0 && pv.view.sectionText === null, "ไม่พิมพ์", { m: pv?.section864Missing, s: pv?.view.sectionText });
    const inv = await mk("INVOICE", null);
    const wInv = await codesOf(inv.id);
    chk("B1.6", "ใบแจ้งหนี้ไม่ตรวจผู้ซื้อของใบกำกับ", !wInv.some((w) => w.code.startsWith("TAX_INVOICE_BUYER")), "ไม่มี", wInv.map((w) => w.code), "MAJOR");
  }

  console.log("\nB2 ผู้ซื้อทั่วไปไม่มีเลข 13 หลัก:");
  {
    const tp = await mk("TAX_INVOICE", person.id);
    const tb = await mk("TAX_INVOICE", bizNoTax.id);
    const wp = await codesOf(tp.id);
    const wb = await codesOf(tb.id);
    chk("B2.1", "ผู้ซื้อบุคคลไม่มีเลข ⇒ ไม่มี BUYER_TAX_ID_MISSING", !wp.some((w) => w.code === "BUYER_TAX_ID_MISSING"), "ไม่มี", wp.map((w) => w.code));
    const ip = await acc.issueDocument(tid, S, tp.id);
    const dp = await prisma.accountDocument.findUnique({ where: { id: tp.id } });
    chk("B2.2", "ออกใบเต็มรูปให้บุคคลได้ · มีเลขที่ · snapshot ไม่มีเลข/สาขา", ip.ok && dp?.status === "ISSUED" && !!dp.docNo && !(dp.contactSnapshot as Any)?.taxId, "ISSUED", { ip, s: dp?.status, sn: dp?.contactSnapshot });
    const m = wb.find((w) => w.code === "BUYER_TAX_ID_MISSING");
    chk("B2.3", "ผู้ซื้อกิจการไม่มีเลข ⇒ BUYER_TAX_ID_MISSING (V · ack=false · อ้าง ฉ.39 ข้อ 7)", !!m && m.tag === "V" && m.ack === false && /ฉบับที่ 39/.test(m.citation), "มี", wb);
    const ib = await acc.issueDocument(tid, S, tb.id);
    chk("B2.4", "ผู้ซื้อกิจการไม่มีเลข ออกได้ (ไม่บล็อก)", ib.ok, "ok", ib);
  }

  console.log("\nB3 ปิดที่อยู่/เลขลูกค้าในเทมเพลต ไม่มีผลกับใบกำกับ:");
  {
    await acc.issueDocument(tid, S, tFull.id);
    const iv = await mk("INVOICE", full.id);
    await acc.issueDocument(tid, S, iv.id);
    const cur = await DS.getDocSettings(ctx);
    await DS.saveDocSettings(ctx, { print: { ...cur.print, fields: { ...cur.print.fields, buyerAddress: false, buyerTaxId: false } } });
    const pt = await PV.loadPrintView(tid, S, tFull.id);
    const pi = await PV.loadPrintView(tid, S, iv.id);
    chk("B3.1", "ใบกำกับ: show.buyerAddress/buyerTaxId = true + ค่ามีจริง", pt?.view.po.show.buyerAddress === true && pt.view.po.show.buyerTaxId === true && pt.view.buyer.address === "1 ถ.ครบ" && pt.view.buyer.taxId === "0105561999210", "true", pt?.view.po.show);
    chk("B3.2", "ใบแจ้งหนี้: ซ่อนตามค่าตั้ง", pi?.view.po.show.buyerAddress === false && pi.view.po.show.buyerTaxId === false, "false", pi?.view.po.show, "MAJOR");
    await DS.saveDocSettings(ctx, { print: cur.print });
    const panel = readFileSync("src/components/account-v2/DocSettingsPanel.tsx", "utf8");
    chk("B3.3", "หน้าตั้งค่าบอกว่าใบกำกับพิมพ์ที่อยู่/เลขผู้ซื้อเสมอ", panel.includes('data-testid="print-taxinvoice-buyer-note"'), "มี", null, "MINOR");
  }

  console.log("\nB4 ส่วนลดรายบรรทัด:");
  {
    const t = await mk("TAX_INVOICE", full.id, [{ description: "อุปกรณ์", qty: 2, unitPrice: 500_000, discount: 100_000, vatRateBp: 700, lineKind: "GOODS" }, { description: "ค่าแรง", qty: 1, unitPrice: 200_000, vatRateBp: 700, lineKind: "SERVICE" }]);
    await acc.issueDocument(tid, S, t.id);
    const d = await prisma.accountDocument.findUnique({ where: { id: t.id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    chk("B4.1", "บรรทัด 1: 2 × 5,000 − 1,000 = 9,000 · ฐาน 11,000 · VAT 770 (คิดหลังส่วนลด)", d?.lines[0].amount === 900_000 && d.subTotal === 1_100_000 && d.vatAmount === 77_000, "900000/1100000/77000", d && { l: d.lines.map((l) => [l.amount, l.discount]), s: d.subTotal, v: d.vatAmount });
    const pv = await PV.loadPrintView(tid, S, t.id);
    chk("B4.2", "ใบพิมพ์: คอลัมน์ส่วนลด — บรรทัด 1 \"1,000.00\" · บรรทัด 2 ไม่มี (null)", pv?.view.lines[0].discount === "1,000.00" && pv.view.lines[1].discount === null, "1,000.00/null", pv?.view.lines.map((l: Any) => l.discount));
    const pf = await PV.loadPrintView(tid, S, tFull.id);
    chk("B4.3", "ใบที่ไม่มีส่วนลดรายบรรทัด ⇒ ไม่มีคอลัมน์ (ทุกบรรทัด null)", pf?.view.lines.every((l: Any) => !l.discount), "null", pf?.view.lines.map((l: Any) => l.discount), "MAJOR");
    const dd = await DD.getDocDetailData(tid, S, t.id);
    chk("B4.4", "หน้ารายละเอียด/REST: discount ของบรรทัด 100,000", dd?.lines[0].discount === 100_000, 100_000, dd?.lines.map((l: Any) => l.discount), "MAJOR");
    const comp = readFileSync("src/components/account-v2/PrintDocument.tsx", "utf8");
    chk("B4.5", "PrintDocument มีหัวคอลัมน์ส่วนลด (L.lineDiscount)", comp.includes('data-testid="print-col-discount"') && comp.includes("L.lineDiscount"), "มี", null, "MAJOR");
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
console.log(`\n===== QC ACC T2.1 ใบกำกับเต็มรูปครบรายการ =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => `${c.id} (${c.sev})`) })}`);
process.exit(f.length ? 1 : 0);

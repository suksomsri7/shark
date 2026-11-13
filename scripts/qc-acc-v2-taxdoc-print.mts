// QC ACC T2.7 — ต้นฉบับ / สำเนา / ใบแทน / ร่าง ของใบกำกับภาษี + ประวัติการพิมพ์ + ปัญหาพิมพ์ร่วม (จอนอกข้อ 3 4 7) + ข้อความ ม.86/4 (T2.10)
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md T2.7 (ปิด B5 B6) · design note ledger/wo-notes/T2.7.md · T2.10 §2
// กฎ: skill shark-thai-law common-vat-invoice.md §5 §14 · audit-checklist-accounting.md B5 B6
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง สร้าง/ลบเอง · KEEP=1 เก็บไว้ดูจอ) · ตรวจบน HTML ที่เรนเดอร์จริงของ PrintDocument (ตัวเดียวกับหน้า /account/print)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-taxdoc-print.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-taxdoc-print");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 500)}`}`);
};
const eq = (id: string, n: string, act: unknown, exp: unknown, sev: Sev = "CRITICAL") => chk(id, n, JSON.stringify(act) === JSON.stringify(exp), exp, act, sev);

const KEEP = process.env.KEEP === "1";
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const sys: Any = await import("@/lib/modules/system/service" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const PL: Any = await import("@/lib/modules/account/print-log" as string);
const PV: Any = await import("@/lib/modules/account/print-view" as string);
const PS: Any = await import("@/lib/modules/account/print-shared" as string);
const DS: Any = await import("@/lib/modules/account/doc-settings" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const React = (await import("react")).default;
const RDS: Any = await import("react-dom/server");
const { PrintDocument } = (await import("@/components/account-v2/PrintDocument" as string)) as Any;
const accEnv: Any = await import("./acc-v2-env.mts" as string);

const html = (view: Any, mark: Any) => RDS.renderToStaticMarkup(React.createElement(PrintDocument, { view, mark }));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
/** ทำแบบหน้าพิมพ์: แถวการพิมพ์ → mark */
const markOf = (e: Any, isTax: boolean) =>
  isTax ? { state: "PRINT", kind: e.kind, reprintNo: e.reprintNo, substitute: e.kind === "SUBSTITUTE" ? { seq: e.substituteSeq, date: "13 พฤศจิกายน 2569", reason: e.substituteReason } : null } : { state: "PLAIN" };

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

const TENANT_NAME = "QC T2.7 TAXDOC PRINT";
let tid = "";

// ═══ P0 ตัวตัดสินบริสุทธิ์ ═══
console.log("\n── P0 ตัวตัดสินชนิดการพิมพ์ + ถ้อยคำ ──");
eq("P0.1", "พิมพ์ครั้งแรก = ต้นฉบับ · ครั้งต่อไป = สำเนา · ชุดหลังต้นฉบับ = สำเนา · ต้นฉบับซ้ำก่อนมีต้นฉบับ = ต้นฉบับ", [PS.decidePrintKind("PRINT", false), PS.decidePrintKind("PRINT", true), PS.decidePrintKind("SET", false), PS.decidePrintKind("SET", true), PS.decidePrintKind("REPRINT_ORIGINAL", false), PS.decidePrintKind("REPRINT_ORIGINAL", true)], ["ORIGINAL", "COPY", "SET", "COPY", "ORIGINAL", "ORIGINAL_REPRINT"]);
eq("P0.2", "ถ้อยคำบนสำเนาตรง skill §14: \"สำเนาใบกำกับภาษี\" + \"เอกสารออกเป็นชุด\"", [PS.SET_WORDING.TH.copyTitle, PS.SET_WORDING.TH.issuedAsSet], ["สำเนาใบกำกับภาษี", "เอกสารออกเป็นชุด"]);
{
  const w = W.legalWarning("TAX_INVOICE_ORIGINAL_REPRINT", { docNo: "TX-1", n: 1 });
  chk("P0.3", "คำเตือน TAX_INVOICE_ORIGINAL_REPRINT: ป้าย V · ต้องยืนยัน · อ้าง ฉ.39 ข้อ 1 + ป.86/2542 ข้อ 4 + §14", w.tag === "V" && w.ack === true && /ฉบับที่ 39 ข้อ 1/.test(w.citation) && /ป\.86\/2542 ข้อ 4/.test(w.citation) && /§14/.test(w.citation), "V/ack", w);
}
eq("P0.4", "เงื่อนไขชำระเงินจริง: ร้านเขียน 30 วัน แต่ครบกำหนด 60 วัน → พิมพ์ 60 วัน · ตรงกัน/ไม่มีจำนวนวัน = ข้อความร้าน", [
  PS.realPaymentTerms("ชำระภายใน 30 วันนับจากวันที่ออกใบแจ้งหนี้", new Date("2026-09-18T05:00:00Z"), new Date("2026-11-16T17:00:00Z"), "17 พ.ย. 2569"),
  PS.realPaymentTerms("ชำระภายใน 30 วันนับจากวันที่ออกใบแจ้งหนี้", new Date("2026-09-18T05:00:00Z"), new Date("2026-10-17T17:00:00Z"), "18 ต.ค. 2569"),
  PS.realPaymentTerms("โอนเข้าบัญชีบริษัท", new Date("2026-09-18T05:00:00Z"), new Date("2026-11-16T17:00:00Z"), "x"),
], ["ชำระภายใน 60 วันนับจากวันที่ออกเอกสาร (ครบกำหนด 17 พ.ย. 2569)", "ชำระภายใน 30 วันนับจากวันที่ออกใบแจ้งหนี้", "โอนเข้าบัญชีบริษัท"]);
eq("P0.5", "หมายเหตุซ้ำกับข้อความท้ายเอกสาร = พิมพ์ครั้งเดียว", [PS.dedupeNotes("ขอบคุณ", " ขอบคุณ "), PS.dedupeNotes("ก", "ข")], [{ note: "ขอบคุณ", footer: null }, { note: "ก", footer: "ข" }]);

try {
  console.log("\n── P1 ฟิกซ์เจอร์ ──");
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } })) await purgeTenant(old.id);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t27-${Date.now().toString(36)}`, status: "ACTIVE", enabledModules: ["ACCOUNT"] } })).id;
  const owner = (await prisma.user.findFirst({ where: { email: "qc-t27@qc.local" } })) ?? (await prisma.user.create({ data: { email: "qc-t27@qc.local", name: "เจ้าของ T2.7" } }));
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const SYS = (await sys.createSystem(tid, "ACCOUNT", "บัญชี T2.7")).id;
  await acc.saveSettings(tid, SYS, { orgPrefix: "บริษัท", orgName: "ทีสองเจ็ด พิมพ์ จำกัด", taxId: "0105566027001", branchCode: "00000", branchName: "สำนักงานใหญ่", address: "27 ถ.ทดสอบ กรุงเทพฯ", vatRegistered: true, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const ctx = { tenantId: tid, systemId: SYS };
  const cust = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ผู้ซื้อ ทีสองเจ็ด จำกัด", taxId: "0105566027999", branchCode: "00000", address: "99 ถ.ผู้ซื้อ เชียงใหม่" });
  const line = { description: "บริการตรวจเรือ", qty: 1, unitPrice: 100_000, discount: 0, vatRateBp: 700 };
  const mk = async (docType: string, extra: Any = {}, issue = true) => {
    const d = await acc.createDocument({ tenantId: tid, systemId: SYS, docType, contactId: cust.id, vatMode: "EXCLUDE", lines: [line], createdById: owner.id, ...extra });
    if (issue) {
      const r = await acc.issueDocument(tid, SYS, d.id, { ack: { codes: W.LEGAL_WARNING_CODES, actorId: owner.id, via: "screen" } });
      if (!r.ok) throw new Error(`ออก ${docType} ไม่ได้: ${r.reason}`);
    }
    return d.id as string;
  };
  const tx = await mk("TAX_INVOICE");
  const draft = await mk("TAX_INVOICE", {}, false);
  chk("P1.1", "ใบกำกับภาษีออกแล้ว + ร่างอีกใบ", !!tx && !!draft, "ok", [tx, draft]);

  // ═══ P2 ต้นฉบับ → สำเนา ═══
  console.log("\n── P2 ต้นฉบับ / สำเนา / ชุด (บันทึก + HTML) ──");
  const p1 = await PL.recordDocPrint(ctx, tx, { request: "PRINT", channel: "SCREEN", actorId: owner.id });
  const p2 = await PL.recordDocPrint(ctx, tx, { request: "PRINT", channel: "PDF", actorId: owner.id });
  const p3 = await PL.recordDocPrint(ctx, tx, { request: "SET", channel: "SCREEN", actorId: owner.id });
  eq("P2.1", "พิมพ์ 3 ครั้ง (จอ · PDF · ชุด) = ต้นฉบับ · สำเนา · สำเนา (ไม่มีต้นฉบับใบที่สอง)", [p1.kind, p2.kind, p3.kind], ["ORIGINAL", "COPY", "COPY"]);
  const lv = await PV.loadPrintView(tid, SYS, tx);
  const e1 = await PL.printEntry(ctx, tx, p1.printId);
  const e2 = await PL.printEntry(ctx, tx, p2.printId);
  const h1 = text(html(lv.view, markOf(e1, true)));
  const h2 = text(html(lv.view, markOf(e2, true)));
  chk("P2.2", "HTML ต้นฉบับ: มี \"ต้นฉบับ\" · ไม่มี \"สำเนาใบกำกับภาษี\" / \"เอกสารออกเป็นชุด\"", h1.includes("ต้นฉบับ") && !h1.includes("สำเนาใบกำกับภาษี") && !h1.includes("เอกสารออกเป็นชุด"), "ต้นฉบับ", h1.slice(0, 300));
  chk("P2.3", "HTML สำเนา: มี \"สำเนาใบกำกับภาษี\" + \"เอกสารออกเป็นชุด\" · ไม่มีคำว่า \"ต้นฉบับ\"", h2.includes("สำเนาใบกำกับภาษี") && h2.includes("เอกสารออกเป็นชุด") && !h2.includes("ต้นฉบับ"), "สำเนา", h2.slice(0, 300));
  const audits = await prisma.auditLog.findMany({ where: { tenantId: tid, targetId: tx, action: { startsWith: "account.doc.print." } }, orderBy: { createdAt: "asc" }, select: { action: true, actorId: true, after: true } });
  eq("P2.4", "ประวัติเอกสาร (AuditLog) มีแถวพิมพ์ครบ 3 แถว: ชนิด + ช่องทาง + ผู้พิมพ์", audits.map((a: Any) => [a.action, a.after?.channel, a.actorId === owner.id]), [["account.doc.print.original", "SCREEN", true], ["account.doc.print.copy", "PDF", true], ["account.doc.print.copy", "SCREEN", true]]);
  // ชุด ครั้งแรก = สองหน้า
  const tx2 = await mk("TAX_INVOICE");
  const s1 = await PL.recordDocPrint(ctx, tx2, { request: "SET", channel: "SCREEN", actorId: owner.id });
  const lv2 = await PV.loadPrintView(tid, SYS, tx2);
  const hs = html(lv2.view, markOf(await PL.printEntry(ctx, tx2, s1.printId), true));
  chk("P2.5", "พิมพ์ชุดครั้งแรก = SET: 2 หน้าในงานเดียว (หน้า 1 ต้นฉบับ · หน้า 2 สำเนาใบกำกับภาษี + เอกสารออกเป็นชุด)", s1.kind === "SET" && (hs.match(/data-testid="print-page"/g) ?? []).length === 2 && /data-print-kind="ORIGINAL"[\s\S]*data-print-kind="COPY"/.test(hs) && text(hs).includes("เอกสารออกเป็นชุด"), "2 หน้า", { kind: s1.kind });
  // แข่งกันพิมพ์ต้นฉบับ
  const tx3 = await mk("TAX_INVOICE");
  const race = await Promise.all([1, 2, 3].map(() => PL.recordDocPrint(ctx, tx3, { request: "PRINT", channel: "SCREEN", actorId: owner.id })));
  eq("P2.6", "กดพิมพ์พร้อมกัน 3 ครั้ง: ต้นฉบับ 1 · สำเนา 2", race.map((r: Any) => r.kind).sort(), ["COPY", "COPY", "ORIGINAL"]);

  // ═══ P3 ต้นฉบับซ้ำ (คำเตือน [V]) ═══
  console.log("\n── P3 พิมพ์ต้นฉบับซ้ำ = คำเตือน + ยืนยัน ──");
  const r0 = await PL.recordDocPrint(ctx, tx, { request: "REPRINT_ORIGINAL", channel: "SCREEN", actorId: owner.id });
  chk("P3.1", "ไม่ยืนยัน → ok:false + legal TAX_INVOICE_ORIGINAL_REPRINT · ไม่บันทึกแถว", r0.ok === false && r0.legal?.warnings?.[0]?.code === "TAX_INVOICE_ORIGINAL_REPRINT" && (await prisma.accountDocumentPrint.count({ where: { documentId: tx, kind: "ORIGINAL_REPRINT" } })) === 0, "legal", r0);
  const r1 = await PL.recordDocPrint(ctx, tx, { request: "REPRINT_ORIGINAL", channel: "SCREEN", actorId: owner.id, ack: { codes: ["TAX_INVOICE_ORIGINAL_REPRINT"], actorId: owner.id, via: "screen" } });
  const ackRow = await prisma.auditLog.findFirst({ where: { tenantId: tid, targetId: tx, action: "legal.warning.ack" } });
  const hr = text(html(lv.view, markOf(await PL.printEntry(ctx, tx, r1.printId), true)));
  chk("P3.2", "ยืนยันแล้ว → ต้นฉบับ (พิมพ์ซ้ำครั้งที่ 1) + บันทึกผู้ยืนยัน (ไม่บล็อก)", r1.ok && r1.kind === "ORIGINAL_REPRINT" && !!ackRow && hr.includes("พิมพ์ต้นฉบับซ้ำครั้งที่ 1"), "ok", [r1, !!ackRow]);

  // ═══ P4 ใบแทน ═══
  console.log("\n── P4 ใบแทน (ม.86/12 · ฉ.36) ──");
  const noReason = await PL.recordDocPrint(ctx, tx, { request: "SUBSTITUTE", channel: "SCREEN", actorId: owner.id, substitute: { reason: "  " } });
  chk("P4.1", "ใบแทนไม่มีสาเหตุ = ปฏิเสธ (ข้อมูลที่ใบแทนต้องมี)", noReason.ok === false && noReason.code === "REASON_REQUIRED", "REASON_REQUIRED", noReason, "MAJOR");
  const sb1 = await PL.recordDocPrint(ctx, tx, { request: "SUBSTITUTE", channel: "SCREEN", actorId: owner.id, substitute: { reason: "ลูกค้าทำต้นฉบับหาย" } });
  const sb2 = await PL.recordDocPrint(ctx, tx, { request: "SUBSTITUTE", channel: "PDF", actorId: owner.id, substitute: { reason: "ต้นฉบับเปียกน้ำ" } });
  eq("P4.2", "ครั้งที่ใบแทนเรียง 1, 2", [sb1.substituteSeq, sb2.substituteSeq], [1, 2]);
  const docRow = await prisma.accountDocument.findUnique({ where: { id: tx }, select: { docNo: true } });
  const hsb = text(html(lv.view, markOf(await PL.printEntry(ctx, tx, sb2.printId), true)));
  chk("P4.3", "HTML ใบแทน: หัว \"ใบแทน\" · ใบแทนออกให้ครั้งที่ 2 · วันที่ออก · สาเหตุ · แทนใบกำกับภาษีเลขที่ <เลขเดิม> ลงวันที่ · ช่องลงชื่อผู้ออกใบแทน",
    hsb.includes("ใบแทน") && hsb.includes("ใบแทนออกให้ครั้งที่ 2") && hsb.includes("วันที่ออกใบแทน") && hsb.includes("ต้นเปียกน้ำ".replace("ต้น", "ต้นฉบับ")) && hsb.includes(`แทนใบกำกับภาษีเลขที่ ${docRow.docNo}`) && hsb.includes("ลงชื่อผู้ออกใบแทน"), "ครบ 4 ช่อง", hsb.slice(0, 600));

  // ═══ P5 ร่าง / ยกเลิก ═══
  console.log("\n── P5 ร่าง ──");
  const dv = await PV.loadPrintView(tid, SYS, draft);
  const hd = text(html(dv.view, { state: "DRAFT" }));
  const dRec = await PL.recordDocPrint(ctx, draft, { request: "PRINT", channel: "SCREEN", actorId: owner.id });
  chk("P5.1", "ร่าง: ลายน้ำ \"ร่าง\" + \"ร่าง — ยังไม่ใช่ใบกำกับภาษี\" · ไม่มี \"ต้นฉบับ\"/\"สำเนา\" · ไม่บันทึกการพิมพ์", hd.includes("ร่าง — ยังไม่ใช่ใบกำกับภาษี") && html(dv.view, { state: "DRAFT" }).includes('data-testid="print-draft-watermark"') && !hd.includes("ต้นฉบับ") && !hd.includes("สำเนา") && dRec.ok === false && dRec.code === "DRAFT", "ร่าง", hd.slice(0, 300));
  chk("P5.2", "ร่าง: ไม่พิมพ์ข้อความ \"ออกตามมาตรา 86/4\"", !hd.includes("86/4"), "ไม่มี", hd.slice(-300), "MAJOR");

  // ═══ P6 ปัญหาพิมพ์ร่วม (จอนอก 3 · 4 · 7) ═══
  console.log("\n── P6 เงื่อนไขชำระจริง · หมายเหตุไม่ซ้ำ · VAT 0 ไม่มี 7% ──");
  await DS.saveDocSettings(ctx, { notes: { INVOICE: { footer: "ขอบคุณที่ใช้บริการ T2.7", terms: "ชำระภายใน 30 วันนับจากวันที่ออกใบแจ้งหนี้" } } });
  const issueD = new Date("2026-09-18T05:00:00Z");
  const inv = await mk("INVOICE", { issueDate: issueD, dueDate: new Date("2026-11-16T17:00:00Z"), note: "ขอบคุณที่ใช้บริการ T2.7" });
  const iv = await PV.loadPrintView(tid, SYS, inv);
  const hi = text(html(iv.view, { state: "PLAIN" }));
  chk("P6.1", "ใบแจ้งหนี้ครบกำหนด 60 วัน: เงื่อนไขพิมพ์ \"ชำระภายใน 60 วัน\" ไม่ใช่ 30 วัน", hi.includes("ชำระภายใน 60 วันนับจากวันที่ออกเอกสาร") && !hi.includes("ชำระภายใน 30 วัน"), "60 วัน", iv.view.paymentTerms);
  eq("P6.2", "หมายเหตุ \"ขอบคุณที่ใช้บริการ T2.7\" พิมพ์ครั้งเดียว", (hi.match(/ขอบคุณที่ใช้บริการ T2\.7/g) ?? []).length, 1);
  const dep = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: cust.id, vatMode: "NONE", lines: [{ description: "รับเงินมัดจำ", qty: 1, unitPrice: 50_000, discount: 0, vatRateBp: 700 }], createdById: owner.id });
  const dv2 = await PV.loadPrintView(tid, SYS, dep.id);
  const hdep = text(html(dv2.view, { state: "PLAIN" }));
  chk("P6.3", "เอกสาร VAT 0 ที่บรรทัดอัตรา 7% (ใบรับเงิน/มัดจำ): ไม่มี \"7%\" และไม่มีแถว VAT ฿0.00", !hdep.includes("7%") && !/ภาษีมูลค่าเพิ่ม[^฿]*฿0\.00/.test(hdep), "ไม่มี 7%", hdep.slice(0, 600), "MAJOR");
  // T1.8b §4 บนกระดาษ: ใบผสม
  const mixId = await mk("TAX_INVOICE", { lines: [line, { description: "ข้าวสาร", qty: 1, unitPrice: 20_000, discount: 0, vatRateBp: -1 }] });
  const mv = await PV.loadPrintView(tid, SYS, mixId);
  eq("P6.4", "ใบกำกับผสม: แถวฐาน 7% 1,000.00 · ยกเว้น 200.00 · VAT 7% 70.00 (บนกระดาษ)", mv.view.totals.vatRows.map((r: Any) => [r.label, r.text]), [["มูลค่าที่เสียภาษี 7%", "1,000.00"], ["มูลค่าที่ได้รับยกเว้นภาษีมูลค่าเพิ่ม", "200.00"], ["ภาษีมูลค่าเพิ่ม 7%", "70.00"]]);

  // ═══ P7 ข้อความ ม.86/4 (T2.10) ═══
  console.log("\n── P7 \"ใบกำกับภาษีนี้ออกตามมาตรา 86/4\" เฉพาะใบที่ครบ ──");
  const full = text(html(lv.view, markOf(e1, true)));
  chk("P7.1", "ใบครบรายการ + ค่าเริ่มต้น AUTO → พิมพ์ข้อความ ม.86/4", full.includes("ใบกำกับภาษีนี้ออกตามมาตรา 86/4 แห่งประมวลรัษฎากร") && lv.section864Missing.length === 0, "มี", lv.section864Missing);
  const custNoAddr = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "PERSON", name: "ลูกค้าไม่มีที่อยู่" });
  const txNo = await mk("TAX_INVOICE", { contactId: custNoAddr.id });
  const nv = await PV.loadPrintView(tid, SYS, txNo);
  chk("P7.2", "ใบไม่มีที่อยู่ผู้ซื้อ + AUTO → ไม่พิมพ์ ม.86/4 (ขาด \"ที่อยู่ผู้ซื้อ\")", nv.view.sectionText === null && nv.section864Missing.includes("ที่อยู่ผู้ซื้อ"), "ไม่พิมพ์", nv.section864Missing);
  const fNo = await DS.saveDocSettings(ctx, { print: { template: "STANDARD", language: "TH", fields: (await DS.getDocSettings(ctx)).print.fields, section864: "ALWAYS" } });
  chk("P7.3", "ตั้ง ALWAYS ไม่ยืนยัน → คืนคำเตือน TAX_INVOICE_SECTION_TEXT_FORCED (ไม่บันทึก)", fNo.ok === false && fNo.legal?.warnings?.[0]?.code === "TAX_INVOICE_SECTION_TEXT_FORCED" && (await DS.getDocSettings(ctx)).print.section864 === "AUTO", "legal", fNo);
  const fOk = await DS.saveDocSettings(ctx, { print: { template: "STANDARD", language: "TH", fields: (await DS.getDocSettings(ctx)).print.fields, section864: "ALWAYS" } }, { ack: { codes: ["TAX_INVOICE_SECTION_TEXT_FORCED"], actorId: owner.id, via: "screen" } });
  const nv2 = await PV.loadPrintView(tid, SYS, txNo);
  chk("P7.4", "ยืนยันแล้ว ALWAYS → ใบไม่ครบก็พิมพ์ + มีแถวผู้ยืนยัน", fOk.ok === true && !!nv2.view.sectionText && !!(await prisma.auditLog.findFirst({ where: { tenantId: tid, action: "legal.warning.ack", targetType: "AccountSettings" } })), "พิมพ์", nv2.view.sectionText);
  await DS.saveDocSettings(ctx, { print: { template: "STANDARD", language: "TH", fields: (await DS.getDocSettings(ctx)).print.fields, section864: "NEVER" } });
  const nv3 = await PV.loadPrintView(tid, SYS, tx);
  chk("P7.5", "NEVER → ใบครบก็ไม่พิมพ์", nv3.view.sectionText === null, "ไม่พิมพ์", nv3.view.sectionText, "MAJOR");
  const stored = await DS.getDocSettings(ctx);
  chk("P7.6", "ค่าเริ่มต้นข้อความท้ายใบกำกับ = ว่าง (ไม่ยืนยัน ม.86/4 โดยปริยาย)", stored.autoTaxInvoice.legalText === "", "", stored.autoTaxInvoice.legalText, "MAJOR");
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
    console.log(`KEEP=1 → ร้าน ${tid} · ${JSON.stringify(await prisma.appSystem.findMany({ where: { tenantId: tid }, select: { id: true, type: true } }))}`);
  }
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T2.7 ต้นฉบับ/สำเนา/ใบแทน =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.length > 0 ? 1 : 0);

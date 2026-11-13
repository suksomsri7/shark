// QC ACC T2c Job A (+ T2.5) — งานค้างของ T2.2/T2.6/T2.7/T2.8 + จุดรวมเลน 2 + ขอใบกำกับเต็มรูปจากใบเสร็จผ่านลิงก์
//
// design note ledger/wo-notes/T2c-A.md · T2.5.md · ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง สร้างเอง ลบใน finally)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-t2c-leftovers.mts
//
// เฉลยคำนวณมือ (7% แยก VAT · สตางค์):
//   A1 ใบกำกับ 10,000 + 700 ลงวันที่ 5 ส.ค. 2026 · ใบแทนครั้งที่ 1 ลงวันที่ 3 ต.ค. ⇒ รายงาน ต.ค. มีแถวหมายเหตุ ฐาน 0 ภาษี 0 · ยอด ต.ค. = 0 · ส.ค. = 70,000 ไม่มีแถวใบแทน
//   A2 ใบลดหนี้อ้างใบกำกับ ⇒ ป้าย "ใบกำกับภาษี" (ไม่ใช่ "ใบกำกับภาษีขาย")
//   A3 ใบกำกับของงวดรับเงิน moneyReceived = true · ใบแจ้งหนี้ = false
//   A5 ใบแจ้งหนี้ 2 ใบ 10,700 + 5,350 วางบิลรวม 16,050 รับครั้งเดียว ⇒ ใบเสร็จอัตโนมัติ 1 ใบต่อใบลูก (ยอด 1,070,000 / 535,000) · ยกเลิกการรับ ⇒ ใบเสร็จ VOIDED
//   A6 ปิดใบเสร็จอัตโนมัติ: ไม่ยืนยัน = LEGAL_ACK_REQUIRED [RECEIPT_AUTO_OFF] (ร้านจด VAT: ฿100 + รายย่อย ฿1,000) · ยืนยัน = ปิดได้ · ร้านไม่จด VAT: ฿100 ไม่มีบรรทัดรายย่อย
//   A7 ใบเสร็จขายสด 5,000 + 350 (5 ส.ค.) → ใบกำกับจากใบเสร็จ → ยกเลิกและออกแทน ⇒ แถวใบเสร็จใน ส.ค. มีหมายเหตุทั้งสองใบ · ยอด ส.ค. ไม่เปลี่ยน
//       มัดจำ 2,000 + 140 รับ 6 ส.ค. → ใบกำกับมัดจำ → ออกแทน ⇒ แถวมัดจำแสดงเลขใบใหม่ + หมายเหตุออกแทน
//   M  หน้าพิมพ์หลังรวมเลน: หมายเหตุออกแทนพิมพ์ครั้งเดียว (ปิดช่องหมายเหตุก็ยังพิมพ์) · ร่างใบเสร็จมีป้ายเลน 1 · ร่างใบกำกับไม่มี (ใช้ป้ายเลน 2)
//       ใบกำกับงวดรับเงิน + ข้อความท้ายใบที่มี "86/4" + section864 NEVER ⇒ ไม่พิมพ์ 86/4
//   D  ใบเสร็จ 3,000 + 210 ลงวันที่ 10 ส.ค. → ขอใบเต็มรูปผ่านลิงก์ ⇒ ร่างลงวันที่ 2026-08-10 อ้างเลขใบเสร็จ · ออกแล้วเลขชุด ส.ค. · ไม่มี JV ของตัวเอง ·
//      ยอด ส.ค. ก่อน/หลัง = เท่ากัน · แถวใบเสร็จมีหมายเหตุเลขใบเต็มรูป
import { readFileSync } from "node:fs";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-t2c-leftovers");

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
const ymd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

const tids: string[] = [];
const users: string[] = [];
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const DS = (await import("@/lib/modules/account/doc-settings" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const DD = (await import("@/lib/modules/account/doc-detail" as string)) as Any;
  const SR = (await import("@/lib/modules/account/sales-tax-report" as string)) as Any;
  const PV = (await import("@/lib/modules/account/print-view" as string)) as Any;
  const PL = (await import("@/lib/modules/account/print-log" as string)) as Any;
  const GRP = (await import("@/lib/modules/account/group" as string)) as Any;
  const RD = (await import("@/lib/modules/account/receipt-duty" as string)) as Any;
  const LT = (await import("@/lib/core/settings/legal/th-tax-2569" as string)) as Any;

  const stamp = Date.now();
  const owner = await prisma.user.create({ data: { email: `qc-t2c-${stamp}@qc.local`, name: "เจ้าของ T2c" } });
  users.push(owner.id);
  const mkShop = async (label: string, vat: boolean) => {
    const t = await prisma.tenant.create({ data: { name: `QC T2c ${label}`, slug: `qc-t2c-${label}-${stamp}` } });
    tids.push(t.id);
    await prisma.membership.create({ data: { userId: owner.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
    const S = (await sys.createSystem(t.id, "ACCOUNT", `บัญชี T2c ${label}`)).id;
    await acc.saveSettings(t.id, S, { orgName: `ร้าน T2c ${label}`, vatRegistered: vat, vatRateBp: 700, taxId: "0105561000123", address: "9 ถ.ทดสอบ" });
    await gl.ensureAccounting({ tenantId: t.id, systemId: S });
    return { tid: t.id, S, ctx: { tenantId: t.id, systemId: S } };
  };
  const { tid, S, ctx } = await mkShop("vat", true);
  const bank = await fin.createFinanceAccount({ tenantId: tid, systemId: S, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
  await fin.createFinanceAccount({ tenantId: tid, systemId: S, type: "CASH", name: "เงินสด" });
  const cust = await acc.createContact({ tenantId: tid, systemId: S, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ลูกค้า ทีทูซี จำกัด", taxId: "0105561999123", branchCode: "00000", address: "1 ถ.ลูกค้า" });
  const L = (amt: number, kind = "SERVICE") => ({ description: "ค่าบริการ", qty: 1, unitPrice: amt, vatRateBp: 700, lineKind: kind });
  const mk = (docType: string, issueDate: Date, lines: Any[], extra: Any = {}) =>
    acc.createDocument({ tenantId: tid, systemId: S, docType, contactId: cust.id, vatMode: "EXCLUDE", issueDate, dueDate: issueDate, lines, createdById: owner.id, ...extra });
  const issue = async (id: string) => {
    const r = await acc.issueDocument(tid, S, id, { ack: { codes: ["SALE_WITHOUT_VAT_REGISTERED"], actorId: owner.id, via: "qc" } });
    if (!r.ok) throw new Error(`ออกเอกสารไม่ได้: ${JSON.stringify(r)}`);
    return r;
  };
  const doc = (id: string) => prisma.accountDocument.findUnique({ where: { id } });

  // ═══ A1 ใบแทนลงรายงานภาษีขายเดือนที่ออก ═══
  console.log("\nA1 ใบแทน → แถวหมายเหตุในรายงานภาษีขายของเดือนที่ออกใบแทน:");
  const a1 = await mk("TAX_INVOICE", D(8, 5), [L(1_000_000)]);
  await issue(a1.id);
  const a1p = await PL.recordDocPrint(ctx, a1.id, { request: "PRINT", channel: "SCREEN", actorId: owner.id });
  const a1s = await PL.recordDocPrint(ctx, a1.id, { request: "SUBSTITUTE", channel: "SCREEN", actorId: owner.id, substitute: { reason: "ลูกค้าทำต้นฉบับหาย", date: new Date("2026-10-03T12:00:00+07:00") } });
  {
    const oct = await SR.salesTaxReport(ctx, "2026-10");
    const aug = await SR.salesTaxReport(ctx, "2026-08");
    const a1doc = await doc(a1.id);
    const row = oct.rows.find((r: Any) => String(r.key).startsWith("SUBSTITUTE:"));
    chk("A1.1", "พิมพ์ต้นฉบับ + ออกใบแทนครั้งที่ 1 สำเร็จ", a1p.ok && a1s.ok && a1s.substituteSeq === 1, "ok/1", { a1p, a1s });
    chk("A1.2", "ต.ค.: แถวใบแทน ลงวันที่ 2026-10-03 · เลขใบกำกับเดิม · ฐาน 0 ภาษี 0 · noteOnly · หมายเหตุครั้งที่/วันที่ใบเดิม/สาเหตุ", !!row && row.date === "2026-10-03" && row.docNo === a1doc?.docNo && row.base === 0 && row.vat === 0 && row.noteOnly === true && row.notes[0].includes("ใบแทน ครั้งที่ 1") && row.notes[0].includes("ลูกค้าทำต้นฉบับหาย") && row.notes[0].includes("ม.86/12"), "แถวหมายเหตุ", row ?? oct.rows);
    chk("A1.3", "ต.ค. ยอดภาษี 0 · ข้อตรวจ GL ยังผ่าน (แถวหมายเหตุไม่เปลี่ยนยอด)", oct.total.vat === 0 && oct.total.base === 0 && oct.checks.every((c: Any) => c.ok), "0/ok", { t: oct.total, c: oct.checks.filter((c: Any) => !c.ok) });
    chk("A1.4", "ส.ค.: ยอด 70,000 · ไม่มีแถวใบแทน (เดือนของใบเดิม)", aug.total.vat === 70_000 && !aug.rows.some((r: Any) => String(r.key).startsWith("SUBSTITUTE:")), "70000", { t: aug.total, k: aug.rows.map((r: Any) => r.key) });
  }

  // ═══ A2 ป้ายใบลด/เพิ่มหนี้ ═══
  console.log("\nA2 ใบลดหนี้อ้างใบกำกับ → \"เลขที่ใบกำกับภาษีเดิม\":");
  {
    const cn = await mk("CREDIT_NOTE", D(8, 20), [{ description: "ลดราคา", qty: 1, unitPrice: 100_000, vatRateBp: 700 }], { sourceDocId: a1.id, adjustReasonCode: "OTHER", adjustReason: "ลดราคาตามตกลง" });
    await issue(cn.id);
    const v = await PV.loadPrintView(tid, S, cn.id);
    chk("A2.1", "origKindLabel = \"ใบกำกับภาษี\" (ป้าย \"เลขที่ใบกำกับภาษีเดิม\")", v?.view.adjust?.origKindLabel === "ใบกำกับภาษี", "ใบกำกับภาษี", v?.view.adjust);
    const iv = await mk("INVOICE", D(8, 20), [L(200_000)]);
    await issue(iv.id);
    const cn2 = await mk("CREDIT_NOTE", D(8, 21), [{ description: "ลดราคา", qty: 1, unitPrice: 10_000, vatRateBp: 700 }], { sourceDocId: iv.id, adjustReasonCode: "OTHER", adjustReason: "ส่วนลด" });
    await issue(cn2.id);
    const v2 = await PV.loadPrintView(tid, S, cn2.id);
    chk("A2.2", "อ้างใบแจ้งหนี้ ⇒ ป้ายชนิดจริง \"ใบแจ้งหนี้\"", v2?.view.adjust?.origKindLabel === "ใบแจ้งหนี้", "ใบแจ้งหนี้", v2?.view.adjust);
  }

  // ═══ A3 ป้ายยอดท้าย ═══
  console.log("\nA3 ใบกำกับของเงินที่รับแล้ว → moneyReceived:");
  {
    const iv = await mk("INVOICE", D(8, 22), [L(100_000)]);
    await issue(iv.id);
    const p = await acc.recordPayment(tid, S, iv.id, { paidAt: D(8, 23), financeAccountId: bank.id, channel: "TRANSFER", amount: 107_000, createdById: owner.id, idempotencyKey: `a3-${stamp}` });
    const ti = await prisma.accountDocument.findFirst({ where: { systemId: S, docType: "TAX_INVOICE", sourcePaymentId: p.paymentId } });
    const dti = ti ? await DD.getDocDetailData(tid, S, ti.id) : null;
    const div = await DD.getDocDetailData(tid, S, iv.id);
    chk("A3.1", "ใบกำกับงวดรับเงิน moneyReceived = true · ใบแจ้งหนี้ = false", p.ok && dti?.moneyReceived === true && div?.moneyReceived === false, "true/false", { t: dti?.moneyReceived, i: div?.moneyReceived });
    const src = readFileSync("src/components/account-v2/DocDetailPage.tsx", "utf8");
    chk("A3.2", "หน้ารายละเอียด: ชนิดใบกำกับ/ใบเสร็จ/ใบรับมัดจำ/ใบลด-เพิ่มหนี้ ใช้ \"จำนวนเงินรวมทั้งสิ้น\" (ไม่ใช่ \"ยอดที่ต้องชำระ\")", /GRAND_RECEIVED_TYPES = new Set<string>\(\["TAX_INVOICE", "RECEIPT", "DEPOSIT_RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE"\]\)/.test(src) && src.includes("จำนวนเงินรวมทั้งสิ้น${data.moneyReceived"), "มี", null, "MAJOR");
  }

  // ═══ A4 สวิตช์ใบเสร็จต่อใบ ═══
  console.log("\nA4 สวิตช์ใบเสร็จต่อใบไม่อยู่ใต้บล็อกใบกำกับ (ร้านไม่จด VAT เห็น):");
  {
    const src = readFileSync("src/components/account-v2/DocEditorV2.tsx", "utf8");
    const iRow = src.indexOf('data-testid="tg-auto-receipt-row"');
    const iTax = src.indexOf('{props.vatRegistered && (props.docType === "INVOICE" || props.docType === "RECEIPT") && (');
    const block = src.slice(Math.max(0, iRow - 600), iRow);
    chk("A4.1", "บล็อก \"ใบเสร็จรับเงิน\" เงื่อนไขแค่ INVOICE (ไม่มี vatRegistered) และอยู่ก่อนบล็อกใบกำกับ", iRow > 0 && iTax > iRow && /\{props\.docType === "INVOICE" && \(/.test(block) && !block.includes("props.vatRegistered"), "แยกบล็อก", { iRow, iTax }, "MAJOR");
  }

  // ═══ A5 ใบวางบิล → ใบเสร็จอัตโนมัติต่อใบลูก ═══
  console.log("\nA5 รับเงินผ่านใบวางบิล → ใบเสร็จอัตโนมัติของใบแจ้งหนี้ลูกทุกใบ:");
  {
    const i1 = await mk("INVOICE", D(9, 1), [L(1_000_000)]);
    const i2 = await mk("INVOICE", D(9, 2), [L(500_000)]);
    await issue(i1.id);
    await issue(i2.id);
    const bn = await GRP.createGroupDoc(tid, S, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: "2026-09-03", dueDate: "2026-09-30", note: "วางบิล", childIds: [i1.id, i2.id], createdById: owner.id });
    const gp = bn.ok ? await GRP.recordGroupPayment(tid, S, bn.id, { paidAt: "2026-09-10", financeAccountId: bank.id, tieOffSatang: 1_605_000, note: "โอน", feeSatang: 0, wht: [], cheque: null }, { userId: owner.id, clientKey: `a5-${stamp}` }) : null;
    const rc = async (ivId: string) => prisma.accountDocument.findMany({ where: { systemId: S, docType: "RECEIPT", sourceDocId: ivId }, orderBy: { createdAt: "asc" } });
    const r1 = await rc(i1.id);
    const r2 = await rc(i2.id);
    chk("A5.1", "วางบิล + รับครั้งเดียวสำเร็จ · กระจาย 2 ใบ", bn.ok && gp?.ok && gp.recorded === 2, "ok/2", { bn, gp });
    chk("A5.2", "ใบเสร็จอัตโนมัติ 1 ใบต่อใบลูก: 1,070,000 / 535,000 · PAID · มีเลข · ลงวันที่รับ 2026-09-10 · ผูกงวด", r1.length === 1 && r2.length === 1 && r1[0].grandTotal === 1_070_000 && r2[0].grandTotal === 535_000 && [r1[0], r2[0]].every((r) => r.status === "PAID" && !!r.docNo && ymd(r.issueDate) === "2026-09-10" && !!r.sourcePaymentId), "2 ใบ", { r1: r1.map((r) => [r.grandTotal, r.status, r.docNo, ymd(r.issueDate)]), r2: r2.map((r) => [r.grandTotal, r.status, r.docNo]) });
    const vg = gp?.ok ? await GRP.voidGroupPayment(tid, S, bn.id, gp.batchKey, "โอนผิดบัญชี") : null;
    const r1b = await rc(i1.id);
    const r2b = await rc(i2.id);
    chk("A5.3", "ยกเลิกการรับของใบวางบิล ⇒ ใบเสร็จอัตโนมัติทั้งสองใบ VOIDED (เก็บไว้ ไม่ลบ)", vg?.ok && r1b.length === 1 && r2b.length === 1 && r1b[0].status === "VOIDED" && r2b[0].status === "VOIDED", "VOIDED", { vg, s: [r1b.map((r) => r.status), r2b.map((r) => r.status)] });
  }

  // ═══ A6 ปิดใบเสร็จอัตโนมัติ = คำเตือนเกณฑ์ใบรับ ═══
  console.log("\nA6 ปิดใบเสร็จอัตโนมัติ → RECEIPT_AUTO_OFF (ตารางค่ากฎหมาย · ต้องยืนยัน):");
  {
    const rows = LT.SYSTEM_RECEIPT_DUTY_ROWS as Any[];
    const val = (w: string) => rows.find((r) => r.who === w)?.value;
    chk("A6.1", "ตารางค่ากฎหมาย: ผู้จด VAT 10,000 · รายย่อย ม.86/8 100,000 · ไม่จด VAT 10,000 สตางค์ · ป้าย V มีที่มา ฉ.34/ฉ.49", val("VAT_OTHER") === 10_000 && val("VAT_SMALL_86_8") === 100_000 && val("NON_VAT") === 10_000 && rows.every((r) => r.tag === "V" && /ฉ\.34/.test(r.source) && /ฉ\.49/.test(r.source)), "ครบ", rows);
    const s1 = await DS.saveDocSettings(ctx, { receipt: { autoOnPayment: false } });
    chk("A6.2", "ไม่ยืนยัน ⇒ ไม่บันทึก + LEGAL_ACK_REQUIRED [RECEIPT_AUTO_OFF] (ป้าย V · ack · ข้อความ ฿100 + รายย่อย ฿1,000 · อ้าง ม.105/127 ทวิ)", s1.ok === false && s1.legal?.warnings?.length === 1 && s1.legal.warnings[0].code === "RECEIPT_AUTO_OFF" && s1.legal.warnings[0].tag === "V" && s1.legal.warnings[0].ack === true && s1.legal.warnings[0].messageTh.includes("฿100") && s1.legal.warnings[0].messageTh.includes("฿1,000") && /ม\.105/.test(s1.legal.warnings[0].citation) && /127 ทวิ/.test(s1.legal.warnings[0].citation), "409", s1);
    chk("A6.3", "ค่ายังเปิดอยู่หลังถูกปฏิเสธ", (await DS.getDocSettings(ctx)).receipt.autoOnPayment === true, true, null);
    const s2 = await DS.saveDocSettings(ctx, { receipt: { autoOnPayment: false } }, { ack: { codes: ["RECEIPT_AUTO_OFF"], actorId: owner.id, actorType: "USER", via: "qc" } });
    const audit = await prisma.auditLog.findFirst({ where: { tenantId: tid, action: { contains: "legal" } }, orderBy: { createdAt: "desc" } });
    chk("A6.4", "ยืนยันแล้วปิดได้ · บันทึกผู้ยืนยันใน AuditLog", s2.ok === true && (await DS.getDocSettings(ctx)).receipt.autoOnPayment === false && !!audit, "ok", { s2, audit: audit?.action });
    const s3 = await DS.saveDocSettings(ctx, { receipt: { autoOnPayment: true } });
    chk("A6.5", "เปิดกลับไม่ต้องยืนยัน", s3.ok === true, "ok", s3);
    const nv = RD.receiptAutoOffWarning(false);
    chk("A6.6", "ร้านไม่จด VAT: เกณฑ์ ฿100 (ผู้ได้รับยกเว้น ม.81/81/1) ไม่มีบรรทัดรายย่อย ม.86/8", nv.messageTh.includes("฿100") && nv.messageTh.includes("ยกเว้น") && !nv.messageTh.includes("86/8"), "100", nv.messageTh);
    const panel = readFileSync("src/components/account-v2/DocSettingsPanel.tsx", "utf8");
    chk("A6.7", "จอตั้งค่า: สวิตช์ใบเสร็จอัตโนมัติ + คำเตือนเมื่อปิด (ackName=ack) + สวิตช์ใบกำกับมัดจำ + ริบมัดจำ", panel.includes('name="receiptAutoOnPayment"') && panel.includes('testId="receipt-auto-off-warning"') && panel.includes('name="depositOnReceipt"') && panel.includes('name="depositForfeit"'), "มี", null, "MAJOR");
  }

  // ═══ A7 + M หมายเหตุออกแทนของใบกำกับที่เกิดจากใบเสร็จ/มัดจำ ═══
  console.log("\nA7 ใบกำกับจากใบเสร็จ/มัดจำที่ถูกออกแทน → หมายเหตุขึ้นในแถวต้นทาง · M หน้าพิมพ์หลังรวมเลน:");
  {
    const rc = await mk("RECEIPT", D(8, 5), [L(500_000)]);
    await issue(rc.id);
    const augBefore = (await SR.salesTaxReport(ctx, "2026-08")).total.vat;
    const cv = await acc.convertDocument(tid, S, rc.id, "TAX_INVOICE", owner.id);
    if (cv.ok) await issue(cv.newId);
    const old = cv.ok ? await doc(cv.newId) : null;
    const rp = old ? await acc.replaceTaxInvoice(ctx, old.id, { reason: "ชื่อผู้ซื้อสะกดผิด", buyer: { name: "บริษัท ลูกค้า ทีทูซี (ถูก) จำกัด" }, ack: { codes: ["TAX_INVOICE_REPLACE"], actorId: owner.id, via: "qc" }, createdById: owner.id }) : null;
    const aug = await SR.salesTaxReport(ctx, "2026-08");
    const rcRow = aug.rows.find((r: Any) => r.docId === rc.id);
    chk("D5", "แปลงใบเสร็จขายสด (5 ส.ค.) เป็นใบกำกับเต็มรูป ⇒ ลงวันที่ใบเสร็จ 2026-08-05 (T2.5 · ไม่ใช่วันที่กด)", !!old && ymd(old.issueDate) === "2026-08-05", "2026-08-05", old && ymd(old.issueDate));
    chk("A7.1", "ใบกำกับจากใบเสร็จออกแล้ว + ออกแทนสำเร็จ (เลขใหม่)", !!old?.docNo && rp?.ok && rp.newDocNo && rp.newDocNo !== old.docNo, "ok", rp);
    chk("A7.2", "แถวใบเสร็จ: \"ใบกำกับภาษีเลขที่ <เดิม> ยกเลิก — ออกฉบับใหม่แทนแล้ว เลขที่ <ใหม่>\" + \"ออกแทนใบกำกับภาษีฉบับเดิมเลขที่ <เดิม>\"", !!rcRow && rcRow.notes.some((n: string) => n.includes(`ใบกำกับภาษีเลขที่ ${old?.docNo} ยกเลิก`) && n.includes(rp?.newDocNo ?? "§")) && rcRow.notes.some((n: string) => n.includes(`ออกแทนใบกำกับภาษีฉบับเดิมเลขที่ ${old?.docNo}`)), "2 หมายเหตุ", rcRow?.notes ?? aug.rows.map((r: Any) => [r.docNo, r.notes]));
    chk("A7.3", "ยอด ส.ค. ไม่เปลี่ยนจากการออกแทน (ใบกำกับไม่มี JV ของตัวเอง)", aug.total.vat === augBefore && aug.checks.every((c: Any) => c.ok), augBefore, aug.total.vat);

    const dep = await mk("DEPOSIT_RECEIPT", D(8, 6), [{ description: "มัดจำ", qty: 1, unitPrice: 200_000, vatRateBp: 700 }]);
    await issue(dep.id);
    await acc.recordPayment(tid, S, dep.id, { paidAt: D(8, 6), financeAccountId: bank.id, channel: "TRANSFER", amount: 214_000, createdById: owner.id, idempotencyKey: `a7d-${stamp}` });
    const dti = await prisma.accountDocument.findFirst({ where: { systemId: S, docType: "TAX_INVOICE", sourceDocId: dep.id } });
    const drp = dti ? await acc.replaceTaxInvoice(ctx, dti.id, { reason: "ที่อยู่ผิด", buyer: { address: "2 ถ.ใหม่" }, ack: { codes: ["TAX_INVOICE_REPLACE"], actorId: owner.id, via: "qc" }, createdById: owner.id }) : null;
    const aug2 = await SR.salesTaxReport(ctx, "2026-08");
    const dRow = aug2.rows.find((r: Any) => r.docId === dep.id);
    chk("A7.4", "แถวมัดจำ: เลขที่ = ใบกำกับฉบับใหม่ · หมายเหตุออกแทนอ้างเลขเดิม · VAT 14,000", drp?.ok && dRow?.docNo === drp.newDocNo && dRow.vat === 14_000 && dRow.notes.some((n: string) => n.includes(`ออกแทนใบกำกับภาษีฉบับเดิมเลขที่ ${dti?.docNo}`)), "เลขใหม่ + หมายเหตุ", { drp, row: dRow && [dRow.docNo, dRow.vat, dRow.notes] });

    // M — หน้าพิมพ์หลังรวมเลน
    const nv = rp?.ok ? await PV.loadPrintView(tid, S, rp.newId) : null;
    const repl = nv?.view.docNotes?.replacementNote ?? "";
    chk("M1", "ใบใหม่: บรรทัดออกแทนพิมพ์ 1 ครั้ง (docNotes) · หมายเหตุของใบไม่ซ้ำบรรทัดนี้", repl.startsWith(`ออกแทนใบกำกับภาษีฉบับเดิมเลขที่ ${old?.docNo}`) && !(nv?.view.note ?? "").includes("ออกแทนใบกำกับภาษีฉบับเดิมเลขที่"), "1 ครั้ง", { repl, note: nv?.view.note });
    const cur = await DS.getDocSettings(ctx);
    await DS.saveDocSettings(ctx, { print: { ...cur.print, fields: { ...cur.print.fields, note: false } } });
    const nv2 = rp?.ok ? await PV.loadPrintView(tid, S, rp.newId) : null;
    chk("M2", "ปิดช่อง \"หมายเหตุ\" ในเทมเพลต ⇒ บรรทัดออกแทนยังพิมพ์", (nv2?.view.docNotes?.replacementNote ?? "").startsWith("ออกแทนใบกำกับภาษีฉบับเดิมเลขที่") && nv2?.view.note === null, "ยังพิมพ์", nv2?.view.docNotes);
    await DS.saveDocSettings(ctx, { print: cur.print });
    const ov = old ? await PV.loadPrintView(tid, S, old.id) : null;
    chk("M3", "ใบเดิม: \"ยกเลิก — ออกใบกำกับภาษีฉบับใหม่แทนแล้ว เลขที่ <ใหม่>\"", (ov?.view.docNotes?.replacedBy ?? "").includes(rp?.newDocNo ?? "§"), "replacedBy", ov?.view.docNotes);
    const dr = await mk("RECEIPT", D(8, 7), [L(10_000)]);
    const dtx = await mk("TAX_INVOICE", D(8, 7), [L(10_000)]);
    const pr = await PV.loadPrintView(tid, S, dr.id);
    const pt = await PV.loadPrintView(tid, S, dtx.id);
    chk("M4", "ร่างใบเสร็จ: ป้ายเลน 1 \"ร่าง — ยังไม่ใช่เอกสารที่ออกแล้ว…\" · ร่างใบกำกับ: ไม่มีป้ายนี้ (ใช้ \"ร่าง — ยังไม่ใช่ใบกำกับภาษี\" ของเลน 2)", (pr?.view.docNotes?.draftBanner ?? "").startsWith("ร่าง — ยังไม่ใช่เอกสารที่ออกแล้ว") && pt?.view.docNotes?.draftBanner === null, "ป้ายตามชนิด", { r: pr?.view.docNotes, t: pt?.view.docNotes });
    const c2 = await DS.getDocSettings(ctx);
    await DS.saveDocSettings(ctx, { autoTaxInvoice: { ...c2.autoTaxInvoice, legalText: "เอกสารออกเป็นชุด · ใบกำกับภาษีนี้ออกตามมาตรา 86/4 แห่งประมวลรัษฎากร" }, print: { ...c2.print, section864: "NEVER" } });
    const piv = await mk("INVOICE", D(8, 25), [L(100_000)]);
    await issue(piv.id);
    const pp = await acc.recordPayment(tid, S, piv.id, { paidAt: D(8, 26), financeAccountId: bank.id, channel: "TRANSFER", amount: 107_000, createdById: owner.id, idempotencyKey: `m5-${stamp}` });
    const pti = await prisma.accountDocument.findFirst({ where: { systemId: S, docType: "TAX_INVOICE", sourcePaymentId: pp.paymentId } });
    const pv = pti ? await PV.loadPrintView(tid, S, pti.id) : null;
    chk("M5", "ใบกำกับงวดรับเงิน: ข้อความ 86/4 ในข้อความท้ายใบถูกตัด · section864 NEVER ⇒ ไม่มี \"86/4\" บนใบ", !!pv && !(pv.view.legalText ?? "").includes("86/4") && pv.view.sectionText === null, "ไม่มี 86/4", { l: pv?.view.legalText, s: pv?.view.sectionText });
    await DS.saveDocSettings(ctx, { autoTaxInvoice: c2.autoTaxInvoice, print: c2.print });
  }

  // ═══ D (T2.5) ขอใบกำกับเต็มรูปจากใบเสร็จผ่านลิงก์ ═══
  console.log("\nD ขอใบกำกับเต็มรูปจากใบเสร็จผ่านลิงก์ → วันที่บิลเดิม · อ้างเลข · ไม่ย้ายเดือน:");
  {
    const rc = await mk("RECEIPT", D(8, 10), [L(300_000)]);
    await issue(rc.id);
    const rcd = await doc(rc.id);
    const augBefore = await SR.salesTaxReport(ctx, "2026-08");
    const link = await acc.ensurePublicTaxInvoiceLink(tid, S, rc.id);
    const req = link.ok ? await acc.issuePublicTaxInvoice(link.token, { name: "นาย ผู้ขอ เต็มรูป", taxId: "", address: "5 ถ.ผู้ขอ" }) : null;
    const draft = await prisma.accountDocument.findFirst({ where: { systemId: S, docType: "TAX_INVOICE", sourceDocId: rc.id } });
    chk("D1", "คำขอสำเร็จ (ผู้ซื้อทั่วไปไม่มีเลข 13 หลัก — คำเตือน BUYER_TAX_ID_MISSING ไม่บล็อก) · ร่างลงวันที่ใบเสร็จ 2026-08-10", req?.ok && req.requested && draft?.status === "DRAFT" && ymd(draft.issueDate) === "2026-08-10" && req.warnings.some((w: Any) => w.code === "BUYER_TAX_ID_MISSING"), "2026-08-10", { req, d: draft && [draft.status, ymd(draft.issueDate)] });
    chk("D2", "ร่างอ้างเลขใบเสร็จ: หมายเหตุ + ช่องอ้างอิง", !!draft && (draft.note ?? "").includes(`ใบเสร็จรับเงินเลขที่ ${rcd?.docNo}`) && draft.reference === rcd?.docNo, "อ้างเลข", draft && [draft.note, draft.reference]);
    if (draft) await issue(draft.id);
    const ti = draft ? await doc(draft.id) : null;
    const tiJv = ti ? await prisma.accountJournalEntry.count({ where: { systemId: S, refType: "AccountDocument", refId: ti.id } }) : -1;
    chk("D3", "อนุมัติแล้ว: เลขชุดเดือน ส.ค. (วันที่ 2026-08-10) · ไม่มี JV ของตัวเอง", ti?.status === "ISSUED" && ymd(ti.issueDate) === "2026-08-10" && tiJv === 0 && !!ti.docNo, "ส.ค./0 JV", ti && { s: ti.status, d: ymd(ti.issueDate), no: ti.docNo, tiJv });
    const augAfter = await SR.salesTaxReport(ctx, "2026-08");
    const row = augAfter.rows.find((r: Any) => r.docId === rc.id);
    chk("D4", "รายงาน ส.ค.: ยอดเท่าเดิม (VAT ไม่ซ้ำ) · แถวใบเสร็จมีหมายเหตุเลขใบเต็มรูป \"ไม่นับซ้ำ\"", augAfter.total.vat === augBefore.total.vat && !!row && row.notes.some((n: string) => n.includes(`ออกใบกำกับภาษีเต็มรูปเลขที่ ${ti?.docNo}`) && n.includes("ไม่นับซ้ำ")), "เท่าเดิม", { b: augBefore.total.vat, a: augAfter.total.vat, notes: row?.notes });
  }
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 6).join("\n")}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const tid of tids) {
    const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown>; updateMany: (a: unknown) => Promise<unknown> }>;
    await d(() => P.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountJournalEntry.updateMany({ where: { tenantId: tid }, data: { reversalOfId: null } }));
    await d(() => P.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocument.updateMany({ where: { tenantId: tid }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null, supersededByDocId: null } }));
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
console.log(`\n===== QC ACC T2c Job A + T2.5 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => `${c.id} (${c.sev})`) })}`);
process.exit(f.length ? 1 : 0);

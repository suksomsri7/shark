// QC WO 8.1 — ตั้งค่าเอกสาร (§9.2) · เฟรม f10-settings.png
//
// requires: acc-v2-seed (ร้าน SIAM DIVE QC ถูก seed ให้มีตั้งค่า "ไม่ใช่ค่าเริ่มต้น" แล้ว — บล็อก 8.13)
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-doc-settings.mts
//
// 🔴 ร้าน QC จริง (SIAM DIVE QC) = **อ่านอย่างเดียว** — การเขียนทั้งหมด (ออกเลขจริง · เปลี่ยน pattern ·
//    ตั้งเลขถัดไป · ยิงพร้อมกัน · โพสต์ JV) เกิดใน "ร้านทิ้ง" ที่สคริปต์สร้างเองแล้วลบใน finally
//
// ครอบคลุม
//   T1  ไวยากรณ์รูปแบบเลขที่: ตัวแปรไทย/อังกฤษเทียบเท่ากัน · ความกว้าง {0000}/{00000} · {สาขา} · ตัวแปรมั่ว
//   T2  นโยบายรีเซ็ต (จำลองเวลา): รายเดือน 30 ก.ย. → 1 ต.ค. เริ่ม 0001 · รายปี 1 ม.ค. เริ่มใหม่ · ไม่รีเซ็ต เดินต่อ
//   T3  ยิงพร้อมกัน 10 ครั้ง → ได้ 10 เลขไม่ซ้ำและต่อเนื่อง (ตัวนับร่วมต้องจบใน SQL คำสั่งเดียว)
//   T4  ตั้งเลขถัดไปเอง: เดินหน้าได้ · ย้อนกลับไปทับเลขที่ออกแล้ว = ปฏิเสธพร้อมเหตุผลไทย · นอกช่วง = ปฏิเสธ
//   T5  เปลี่ยนรูปแบบ → ใบถัดไปที่ "ออกจริง" ได้เลขตามรูปแบบใหม่ (สร้าง IV จริง ไม่ใช่พรีวิว)
//   T6  ต่อเลขของเดิม: มีเอกสารเก่าอยู่แล้วแต่ไม่มีแถวตัวนับ → เลขถัดไป = max+1 (ไม่ทับของเก่า)
//   T7  วันครบกำหนด: นับจากวันที่ออก / นับจากสิ้นเดือน · ค่าเริ่มต้นต่อชนิด
//   T8  หมายเหตุ+เงื่อนไขต่อชนิด โผล่ใน "ข้อมูลสำหรับพิมพ์"
//   T9  ช่องทางรับชำระบนเอกสาร: เฉพาะที่ติ๊กแสดง + เรียงตามลำดับที่ตั้งไว้
//   T10 แท็ก: สร้าง/แก้/เปลี่ยนชื่อ (ตามไปแก้เอกสารที่ติดอยู่)/ชื่อซ้ำ/เก็บเข้ากรุ/กรองตามชนิด
//   T11 ลิงก์สาธารณะ: ปิด = เปิดลิงก์ไม่ได้ · หมดอายุ = เปิดไม่ได้ · ยอดค้าง/ปุ่มจ่าย/ฟอร์มขอใบกำกับตามสวิตช์
//   T12 ใบกำกับภาษีอัตโนมัติ: ON_PAYMENT ออกให้ · MANUAL ไม่ออก (รับชำระจริง 2 รอบ)
//   T13 เทมเพลตพิมพ์: กะทัดรัด/มีรูปสินค้า/ภาษาอังกฤษ มีผลกับข้อมูลที่ส่งเข้าหน้าพิมพ์จริง
//   T14 บัญชีรายวันต่อชนิด: ตั้ง override แล้ว JV ที่โพสต์เปลี่ยนบัญชีจริง (ไม่ใช่แค่ค่าใน DB)
//   T15 ด่านสิทธิ์ + ค่าที่กรอกผิด (validate)
//   T16 แยกร้าน: อ่าน/เขียนตั้งค่า+แท็กของอีกร้านไม่ได้
//   T17 ชุดข้อมูล QC: ตั้งค่าที่ seed ไว้ = เฉลย (อ่านผ่าน getSettings ที่ทุกหน้าจริงใช้)

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { readFileSync } = await import("node:fs");
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const glMod = await import("@/lib/modules/account/gl");
const finMod = await import("@/lib/modules/account/finance");
const svc = await import("@/lib/modules/account/service");
const coa = await import("@/lib/modules/account/coa");
const numbering = await import("@/lib/modules/account/doc-numbering");
const schema = await import("@/lib/modules/account/settings-schema");
const docSet = await import("@/lib/modules/account/doc-settings");
const printOpt = await import("@/lib/modules/account/print-options");
const { assertAccountCan } = await import("@/lib/modules/account/access");

let passed = 0;
const findings: string[] = [];
const ok = (name: string) => {
  passed++;
  console.log("  ✅ " + name);
};
const bad = (name: string, detail: string) => {
  findings.push(`${name} — ${detail}`);
  console.log("  ❌ " + name + " — " + detail);
};
const assert = (name: string, cond: boolean, detail = "") => (cond ? ok(name) : bad(name, detail));
const eq = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(name, a === b, `ได้ ${a} · ควรได้ ${b}`);
};
const rejected = async (name: string, fn: () => Promise<{ ok: boolean; reason?: string }>, contains?: string) => {
  try {
    const r = await fn();
    if (r.ok) return bad(name, "ผ่านทั้งที่ควรถูกปฏิเสธ");
    if (contains && !(r.reason ?? "").includes(contains))
      return bad(name, `เหตุผล "${r.reason}" ไม่มีคำว่า "${contains}"`);
    return ok(name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (contains && !msg.includes(contains)) return bad(name, `error "${msg}" ไม่มีคำว่า "${contains}"`);
    return ok(name);
  }
};

console.log(`\n===== QC WO 8.1 · ตั้งค่าเอกสาร (§9.2 · f10) =====`);
console.log(`🗄️  DB QC: ${host}\n`);

type DocSettingsOracle = {
  sequences: Record<string, { prefix: string; pattern: string; reset: string }>;
  notes: Record<string, { footer: string; terms: string }>;
  due: { quotationValidDays: number; invoiceCreditDays: number; purchaseOrderDueDays: number; basis: string };
  print: { template: string; language: string; productSku: boolean; productImage: boolean };
  publicView: { enabled: boolean; showOutstanding: boolean; promptPayButton: boolean; expiryDays: number };
  autoTaxInvoice: { mode: string; posAbbreviated: boolean };
  taxRequest: { enabled: boolean; conditionNote: string };
  rules: { lockNumberOnIssue: boolean; warnOnGap: boolean };
  channelOrder: string[];
  channelCodesInOrder: string[];
  tags: { name: string; color: string; docTypes: string[] }[];
  taggedInvoiceId: string;
  numberedDocTypes: number;
};
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as {
  tenantId: string;
  systemId: string;
  docSettings?: DocSettingsOracle;
};
if (!E.docSettings) {
  console.error("❌ เฉลยยังไม่มีคีย์ docSettings — รัน scripts/seed-acc-v2-qc.mts ใหม่ก่อน");
  process.exit(1);
}
const D = E.docSettings;
const QCTX = { tenantId: E.tenantId, systemId: E.systemId };

const d = (iso: string) => new Date(`${iso}T12:00:00+07:00`);

let sTenantId: string | null = null;

try {
  // ═════════════════ T1 — ไวยากรณ์รูปแบบเลขที่ (ตรรกะบริสุทธิ์) ═════════════════
  console.log("T1 ไวยากรณ์รูปแบบเลขที่:");
  const oct = d("2026-10-05");
  const vars = { prefix: "IV", date: oct, seq: 7, branchCode: "00012" };
  eq("T1.1 {ปี}{เดือน} + {0000}", numbering.formatDocNo("IV-{ปี}{เดือน}-{0000}", vars), "IV-202610-0007");
  eq("T1.2 ตัวแปรอังกฤษให้ผลเดียวกับไทย", numbering.formatDocNo("IV-{YYYY}{MM}-{0000}", vars), "IV-202610-0007");
  eq("T1.3 {ปีสั้น}/{YY}", [numbering.formatDocNo("{ปีสั้น}", vars), numbering.formatDocNo("{YY}", vars)], ["26", "26"]);
  eq("T1.4 ความกว้างของ {0} = จำนวนศูนย์ที่พิมพ์", [
    numbering.formatDocNo("{0}", vars),
    numbering.formatDocNo("{000}", vars),
    numbering.formatDocNo("{00000}", vars),
  ], ["7", "007", "00007"]);
  eq("T1.5 {สาขา}/{BR} = รหัสสาขา", numbering.formatDocNo("{สาขา}-{BR}", vars), "00012-00012");
  eq("T1.6 {คำนำหน้า}/{PREFIX}", numbering.formatDocNo("{คำนำหน้า}{PREFIX}", vars), "IVIV");
  eq("T1.7 {วัน}/{DD} = วันที่ตามเวลาไทย", numbering.formatDocNo("{วัน}{DD}", vars), "0505");
  eq("T1.8 {SEQ} เดิมยังใช้ได้ (เติมศูนย์ 4)", numbering.formatDocNo("{SEQ}", vars), "0007");
  eq("T1.9 ตัวแปรที่ไม่รู้จัก ปล่อยตามที่พิมพ์", numbering.formatDocNo("A-{มั่ว}-{0000}", vars), "A-{มั่ว}-0007");
  eq("T1.10 สาขาว่าง = 00000", numbering.formatDocNo("{สาขา}", { ...vars, branchCode: null }), "00000");
  // 🔴 กับดักเวลา: เที่ยงคืนวันที่ 1 ต.ค. เวลาไทย = 17:00 UTC ของวันที่ 30 ก.ย. — ต้องได้เดือน 10
  eq(
    "T1.11 ใช้เวลาไทยเสมอ (00:30 ของ 1 ต.ค. เวลาไทย → เดือน 10 ไม่ใช่ 09)",
    numbering.formatDocNo("{ปี}-{เดือน}", { ...vars, date: new Date("2026-10-01T00:30:00+07:00") }),
    "2026-10",
  );
  eq(
    "T1.12 รูปแบบเริ่มต้นตามนโยบาย (คงสูตรเดิมของระบบ)",
    ["MONTH", "YEAR", "NONE"].map((r) => numbering.defaultPattern("IV", r as never)),
    ["IV-{ปี}-{เดือน}-{0000}", "IV-{ปี}-{0000}", "IV-{0000}"],
  );
  eq(
    "T1.13 รับค่า reset ทั้ง MONTH/MONTHLY · YEAR/YEARLY",
    ["MONTH", "MONTHLY", "YEAR", "YEARLY", "NONE", "มั่ว"].map((x) => schema.toSeqReset(x)),
    ["MONTH", "MONTH", "YEAR", "YEAR", "NONE", "MONTH"],
  );
  eq("T1.14 คีย์งวด: ไม่รีเซ็ต=- · รายปี=YYYY · รายเดือน=YYYY-MM", [
    numbering.periodKeyOf("NONE", "2026", "10"),
    numbering.periodKeyOf("YEAR", "2026", "10"),
    numbering.periodKeyOf("MONTH", "2026", "10"),
  ], ["-", "2026", "2026-10"]);
  eq("T1.15 ตัวอย่างในหน้าตั้งค่าใช้สูตรเดียวกับตอนออกเลขจริง", numbering.previewExample({
    prefix: "QO", pattern: "QO-{ปี}-{00000}", reset: "YEAR", nextNo: 3, date: oct, branchCode: "00000",
  }), "QO-2026-00003");

  // ═════════════════ T7 — วันครบกำหนด (ตรรกะบริสุทธิ์) ═════════════════
  console.log("\nT7 วันครบกำหนด:");
  eq("T7.1 นับจากวันที่ออก + 30", schema.computeDueDate("2026-09-15", 30, "ISSUE"), "2026-10-15");
  eq("T7.2 นับจากสิ้นเดือน + 30 (ก.ย. 30 วัน)", schema.computeDueDate("2026-09-15", 30, "MONTH_END"), "2026-10-30");
  eq("T7.3 สิ้นเดือน ก.พ. ปีอธิกสุรทิน 2028", schema.computeDueDate("2028-02-03", 0, "MONTH_END"), "2028-02-29");
  eq("T7.4 ข้ามปี", schema.computeDueDate("2026-12-20", 30, "ISSUE"), "2027-01-19");
  const dsDefault = schema.defaultDocSettings();
  dsDefault.due = { quotationValidDays: 15, invoiceCreditDays: 30, purchaseOrderDueDays: 10, basis: "MONTH_END" };
  eq("T7.5 ค่าเริ่มต้นต่อชนิด (QT/IV/PO/RE)", [
    schema.defaultDaysFor(dsDefault, "QUOTATION"),
    schema.defaultDaysFor(dsDefault, "INVOICE"),
    schema.defaultDaysFor(dsDefault, "PURCHASE_ORDER"),
    schema.defaultDaysFor(dsDefault, "RECEIPT"),
  ], [15, 30, 10, null]);

  // ═════════════════ T13 — เทมเพลตพิมพ์ (ตรรกะบริสุทธิ์) ═════════════════
  console.log("\nT13 เทมเพลตพิมพ์:");
  const base = schema.defaultDocSettings();
  base.notes.INVOICE = { footer: "ขอบคุณครับ", terms: "ชำระใน 30 วัน" };
  const poStd = printOpt.buildPrintOptions(base, "INVOICE", "ท้ายกระดาษกลาง");
  eq("T13.1 มาตรฐาน: ป้ายไทย + ระยะปกติ", [poStd.labels.docNo, poStd.style.page.includes("p-8")], ["เลขที่", true]);
  eq("T13.2 หมายเหตุ/เงื่อนไขของชนิดนั้นถูกใช้ก่อนค่ากลาง", [poStd.footerNote, poStd.paymentTerms], ["ขอบคุณครับ", "ชำระใน 30 วัน"]);
  const noNote = printOpt.buildPrintOptions(base, "RECEIPT", "ท้ายกระดาษกลาง");
  eq("T13.3 ชนิดที่ไม่ได้ตั้งหมายเหตุ = ตกไปใช้ข้อความกลางของกิจการ", noNote.footerNote, "ท้ายกระดาษกลาง");
  const en = schema.defaultDocSettings();
  en.print.language = "EN";
  const poEn = printOpt.buildPrintOptions(en, "INVOICE");
  eq("T13.4 ภาษาอังกฤษเปลี่ยนป้ายทุกช่อง", [poEn.labels.docNo, poEn.labels.grandTotal], ["No.", "Grand total"]);
  const compact = schema.defaultDocSettings();
  compact.print.template = "COMPACT";
  compact.print.fields.productImage = true;
  const poCompact = printOpt.buildPrintOptions(compact, "INVOICE");
  assert("T13.5 กะทัดรัด: บีบระยะ + บังคับปิดรูปสินค้า", poCompact.style.page.includes("p-5") && !poCompact.show.productImage);
  const withImg = schema.defaultDocSettings();
  withImg.print.template = "WITH_IMAGES";
  withImg.print.fields.productImage = false;
  assert("T13.6 มีรูปสินค้า: บังคับเปิดคอลัมน์รูป", printOpt.buildPrintOptions(withImg, "INVOICE").show.productImage);
  const hidden = schema.defaultDocSettings();
  hidden.print.fields.buyerTaxId = false;
  hidden.print.fields.logo = false;
  const poHidden = printOpt.buildPrintOptions(hidden, "INVOICE");
  eq("T13.7 ฟิลด์ที่ปิดไว้ = ไม่ถูกส่งให้หน้าพิมพ์", [poHidden.show.buyerTaxId, poHidden.show.logo], [false, false]);
  // 🔴 กันบั๊กซ้ำ (เจอตอน WO 8.1 รอบตรวจ): เทมเพลตพิมพ์ของ §9.2 ต้องไม่ไปทับตารางของ "เอกสารกลุ่ม"
  //    (ใบวางบิลรวม/ใบรวมจ่าย · WO 1.7 §5.2 K) ซึ่ง 1 บรรทัด = 1 ใบลูก ไม่มีบรรทัดสินค้าเลย
  const groupTpl = schema.defaultDocSettings();
  groupTpl.print.template = "WITH_IMAGES";
  groupTpl.print.fields.productSku = true;
  for (const dt of ["BILLING_NOTE", "COMBINED_PAYMENT"] as const) {
    const g = printOpt.buildPrintOptions(groupTpl, dt);
    eq(`T13.9 ${dt}: ถูกจัดเป็นเอกสารกลุ่ม + ปิดคอลัมน์สินค้าแม้เลือกเทมเพลต "มีรูปสินค้า"`, [g.isGroup, g.show.productSku, g.show.productImage], [true, false, false]);
  }
  eq("T13.10 เอกสารปกติยังเป็นตารางสินค้าเหมือนเดิม (ไม่ใช่กลุ่ม)", printOpt.buildPrintOptions(groupTpl, "INVOICE").isGroup, false);
  eq("T13.11 ป้ายของเอกสารกลุ่มมีครบ 2 ภาษา (TH ตรงคำของ WO 1.7)", [
    printOpt.printLabels("TH").groupOutstanding,
    printOpt.printLabels("TH").groupGrandTotal,
    printOpt.printLabels("EN").groupGrandTotal,
  ], ["ยอดค้างชำระ", "รวมยอดที่ต้องชำระ", "Total due"]);

  const legal = schema.defaultDocSettings();
  legal.autoTaxInvoice.legalText = "ตาม ม.86/4";
  eq("T13.8 ข้อความตามกฎหมายพิมพ์เฉพาะใบกำกับภาษี", [
    printOpt.buildPrintOptions(legal, "TAX_INVOICE").legalText,
    printOpt.buildPrintOptions(legal, "INVOICE").legalText,
  ], ["ตาม ม.86/4", ""]);

  // ═════════════════ T17 — ชุดข้อมูล QC (อ่านผ่านทางเดียวกับหน้าจริง) ═════════════════
  console.log("\nT17 ตั้งค่าของร้าน QC = เฉลย:");
  const qcSettings = await svc.getSettings(QCTX.tenantId, QCTX.systemId);
  eq("T17.1 เลขที่เอกสาร 3 ชนิดที่ตั้งไว้", {
    INVOICE: qcSettings.doc.sequences.INVOICE,
    QUOTATION: qcSettings.doc.sequences.QUOTATION,
    EXPENSE: qcSettings.doc.sequences.EXPENSE,
  }, D.sequences);
  eq("T17.2 หมายเหตุ/เงื่อนไขต่อชนิด", {
    INVOICE: qcSettings.doc.notes.INVOICE,
    QUOTATION: qcSettings.doc.notes.QUOTATION,
  }, D.notes);
  eq("T17.3 วันครบกำหนด (รวมนับจากสิ้นเดือน)", qcSettings.doc.due, D.due);
  eq("T17.4 เทมเพลตพิมพ์/ภาษา/ฟิลด์", [
    qcSettings.doc.print.template,
    qcSettings.doc.print.language,
    qcSettings.doc.print.fields.productSku,
    qcSettings.doc.print.fields.productImage,
  ], [D.print.template, D.print.language, D.print.productSku, D.print.productImage]);
  eq("T17.5 ลิงก์สาธารณะ", qcSettings.doc.publicView, D.publicView);
  eq("T17.6 ใบกำกับอัตโนมัติ", [qcSettings.doc.autoTaxInvoice.mode, qcSettings.doc.autoTaxInvoice.posAbbreviated], [D.autoTaxInvoice.mode, D.autoTaxInvoice.posAbbreviated]);
  eq("T17.7 กฎอัตโนมัติ (ล็อกเลข/เตือนข้ามลำดับ)", qcSettings.doc.rules, D.rules);
  eq("T17.8 ลิงก์ขอใบกำกับ", [qcSettings.doc.taxRequest.enabled, qcSettings.doc.taxRequest.conditionNote], [D.taxRequest.enabled, D.taxRequest.conditionNote]);
  eq("T17.9 คอลัมน์เดิม defaultValidDays/defaultDueDays ตรงกับตั้งค่าใหม่ (แหล่งความจริงเดียว)", [
    qcSettings.defaultValidDays,
    qcSettings.defaultDueDays,
  ], [D.due.quotationValidDays, D.due.invoiceCreditDays]);
  const qcRows = await docSet.docNumberingRows(QCTX, (dt) => String(dt), d(QC.today));
  eq("T17.10 ตารางเลขที่เอกสารมีครบทุกชนิดที่ตั้งค่าได้", qcRows.length, D.numberedDocTypes);
  const ivRow = qcRows.find((r) => r.docType === "INVOICE")!;
  assert(
    `T17.11 ตัวอย่างเลขถัดไปของใบแจ้งหนี้ใช้รูปแบบที่ตั้งไว้ (ได้ ${ivRow.example})`,
    /^INV-2609-\d{4}$/.test(ivRow.example),
    ivRow.example,
  );

  // ═════════════════ T9 — ช่องทางรับชำระบนเอกสาร ═════════════════
  console.log("\nT9 ช่องทางรับชำระบนเอกสาร:");
  const chans = await docSet.documentPaymentChannels(QCTX);
  eq("T9.1 ลำดับตรงกับที่ตั้งไว้", chans.map((c) => c.id), D.channelOrder);
  const finAll = await finMod.listFinanceAccounts(QCTX.tenantId, QCTX.systemId);
  const codeById = new Map(finAll.map((f) => [f.id, f.code]));
  eq("T9.2 รหัสช่องทางเรียงตามลำดับที่ตั้งไว้", chans.map((c) => codeById.get(c.id)), D.channelCodesInOrder);
  assert(
    "T9.3 ช่องทางที่ไม่ได้ติ๊ก 'แสดงบนเอกสาร' ไม่ถูกพิมพ์ (เงินสดย่อย)",
    !chans.some((c) => codeById.get(c.id) === "PTY001"),
  );

  // ═════════════════ T10 — แท็ก (อ่านจากร้าน QC) ═════════════════
  console.log("\nT10 แท็กเอกสาร (ร้าน QC · อ่านอย่างเดียว):");
  const qcTags = await docSet.listDocTags(QCTX, { withUsage: true });
  eq("T10.1 แท็กที่ seed ไว้", qcTags.map((t) => ({ name: t.name, color: t.color, docTypes: t.docTypes })), D.tags);
  const tripTag = qcTags.find((t) => t.name === "ทริปสิมิลัน")!;
  eq("T10.2 นับจำนวนเอกสารที่ติดแท็กจริง (จาก tags[] ของเอกสาร)", tripTag.usageCount, 1);
  const forIv = await docSet.tagsForDocType(QCTX, "INVOICE");
  const forPo = await docSet.tagsForDocType(QCTX, "PURCHASE_ORDER");
  eq("T10.3 กรองตามชนิด: IV เห็น 2 · PO เห็นเฉพาะแท็กที่ใช้ได้ทุกชนิด", [
    forIv.map((t) => t.name).sort(),
    forPo.map((t) => t.name),
  ], [["ทริปสิมิลัน", "ลูกค้าองค์กร"], ["ลูกค้าองค์กร"]]);
  const taggedDoc = await prisma.accountDocument.findUniqueOrThrow({
    where: { id: D.taggedInvoiceId },
    select: { tags: true },
  });
  eq("T10.4 เอกสารที่ผูกแท็ก เก็บชื่อแท็กใน tags[] (ไม่มีตารางเชื่อมซ้อน)", taggedDoc.tags, ["ทริปสิมิลัน"]);

  // ═════════════════ ร้านทิ้ง — การเขียนทั้งหมด ═════════════════
  console.log("\n── สร้างร้านทดสอบ (ออกเลขจริง · เปลี่ยนรูปแบบ · โพสต์ JV) ──");
  const stamp = Date.now();
  const tag = `qc-docset-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag } });
  sTenantId = t.id;
  const tid = sTenantId;
  const owner = await prisma.user.create({ data: { email: `${tag}-owner@qc.local`, name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: `${tag}-staff@qc.local`, name: "QC พนักงาน" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } },
  });
  const unit = await prisma.businessUnit.create({
    data: { tenantId: tid, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${stamp}`, status: "ACTIVE" },
  });
  const accSys = await sysMod.createSystem(tid, "ACCOUNT", "บัญชี " + tag);
  await sysMod.linkUnit(tid, accSys.id, unit.id);
  const sid = accSys.id;
  const S = { tenantId: tid, systemId: sid };
  await glMod.ensureAccounting(S);
  await svc.saveSettings(tid, sid, {
    orgName: "ร้านทดสอบตั้งค่าเอกสาร",
    branchCode: "00007",
    vatRegistered: true,
    vatRateBp: 700,
    defaultDueDays: 30,
    defaultValidDays: 30,
  });
  const cust = await svc.createContact({
    tenantId: tid,
    systemId: sid,
    kind: "CUSTOMER",
    name: "ลูกค้าทดสอบ",
    taxId: "0105500000017",
  });
  const custId = (cust as { id: string }).id;

  // ── T2 นโยบายรีเซ็ต (จำลองเวลา) ──
  console.log("\nT2 นโยบายรีเซ็ตเลข (จำลองเวลา):");
  const issue = (docType: Parameters<typeof numbering.issueDocNo>[1]["docType"], when: Date) =>
    prisma.$transaction((tx) =>
      numbering.issueDocNo(tx, {
        tenantId: tid,
        systemId: sid,
        docType,
        fallbackPrefix: schema.fallbackPrefixOf(docType),
        date: when,
      }),
    );

  await docSet.saveDocSettings(S, {
    sequences: {
      INVOICE: { prefix: "IV", pattern: "IV-{ปีสั้น}{เดือน}-{0000}", reset: "MONTH" },
      QUOTATION: { prefix: "QT", pattern: "QT-{ปี}-{0000}", reset: "YEAR" },
      EXPENSE: { prefix: "EX", pattern: "EX-{0000}", reset: "NONE" },
    },
  });
  const sep30a = await issue("INVOICE", d("2026-09-30"));
  const sep30b = await issue("INVOICE", d("2026-09-30"));
  const oct1 = await issue("INVOICE", d("2026-10-01"));
  const oct2 = await issue("INVOICE", d("2026-10-02"));
  eq("T2.1 รายเดือน: 30 ก.ย. เดินต่อในงวดเดียวกัน", [sep30a, sep30b], ["IV-2609-0001", "IV-2609-0002"]);
  eq("T2.2 รายเดือน: ข้ามไป 1 ต.ค. เริ่มใหม่ที่ 0001", [oct1, oct2], ["IV-2610-0001", "IV-2610-0002"]);
  const y26a = await issue("QUOTATION", d("2026-03-01"));
  const y26b = await issue("QUOTATION", d("2026-12-31"));
  const y27 = await issue("QUOTATION", d("2027-01-01"));
  eq("T2.3 รายปี: ทั้งปีเดินต่อ แล้ว 1 ม.ค. ปีใหม่เริ่ม 0001", [y26a, y26b, y27], ["QT-2026-0001", "QT-2026-0002", "QT-2027-0001"]);
  const n1 = await issue("EXPENSE", d("2026-09-30"));
  const n2 = await issue("EXPENSE", d("2026-10-01"));
  const n3 = await issue("EXPENSE", d("2027-01-01"));
  eq("T2.4 ไม่รีเซ็ต: เดินต่อข้ามเดือนและข้ามปี", [n1, n2, n3], ["EX-0001", "EX-0002", "EX-0003"]);

  // ── T3 ยิงพร้อมกัน ──
  console.log("\nT3 ออกเลขพร้อมกัน 10 ครั้ง:");
  const many = await Promise.all(
    Array.from({ length: 10 }, () => issue("RECEIPT", d("2026-11-05"))),
  );
  const uniq = new Set(many);
  eq("T3.1 ได้ 10 เลข ไม่ซ้ำเลย", uniq.size, 10);
  const seqNums = many.map((x) => Number.parseInt(x.slice(-4), 10)).sort((a, b) => a - b);
  eq("T3.2 เลขต่อเนื่อง 1..10 ไม่มีช่องว่าง", seqNums, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  // ── T4 ตั้งเลขถัดไปเอง ──
  console.log("\nT4 ตั้งเลขถัดไปเอง:");
  const setUp = await docSet.setDocNextNo(S, "RECEIPT", 500, d("2026-11-05"));
  assert("T4.1 ตั้งเลขเดินหน้าได้", setUp.ok);
  const after = await issue("RECEIPT", d("2026-11-05"));
  eq("T4.2 ใบถัดไปได้เลขที่ตั้งไว้", after.slice(-4), "0500");
  await rejected(
    "T4.3 ย้อนกลับไปทับเลขที่ออกไปแล้ว = ปฏิเสธ พร้อมบอกเลขที่เริ่มได้",
    () => docSet.setDocNextNo(S, "RECEIPT", 3, d("2026-11-05")),
    "ตั้งเลขถัดไปได้ตั้งแต่ 501",
  );
  await rejected("T4.4 เลข 0 = ปฏิเสธ", () => docSet.setDocNextNo(S, "RECEIPT", 0, d("2026-11-05")), "จำนวนเต็ม");
  await rejected(
    "T4.5 เลขเกินช่วง = ปฏิเสธ",
    () => docSet.setDocNextNo(S, "RECEIPT", 1_000_000, d("2026-11-05")),
    "จำนวนเต็ม",
  );

  // ── T5 เปลี่ยนรูปแบบ → ใบถัดไปที่ออกจริงได้เลขใหม่ ──
  console.log("\nT5 เปลี่ยนรูปแบบแล้วออกใบจริง:");
  const mkInvoice = async (when: Date) => {
    const created = await svc.createDocument({
      tenantId: tid,
      systemId: sid,
      docType: "INVOICE",
      contactId: custId,
      issueDate: when,
      lines: [{ description: "ค่าบริการทดสอบ", qty: 1, unitPrice: 100_000 }],
    });
    const id = (created as { id: string }).id;
    const r = await svc.issueDocument(tid, sid, id);
    if (!r.ok) throw new Error(`ออกเอกสารไม่สำเร็จ: ${r.reason}`);
    return { id, docNo: r.docNo };
  };
  const before5 = await mkInvoice(d("2026-12-03"));
  assert(`T5.1 ใบแรกของ ธ.ค. ใช้รูปแบบเดิม (ได้ ${before5.docNo})`, before5.docNo === "IV-2612-0001", before5.docNo);
  await docSet.saveDocSettings(S, {
    sequences: { INVOICE: { prefix: "BILL", pattern: "BILL/{ปี}/{สาขา}/{00000}", reset: "MONTH" } },
  });
  const after5 = await mkInvoice(d("2026-12-04"));
  eq("T5.2 เปลี่ยนรูปแบบแล้ว ใบถัดไปได้เลขตามรูปแบบใหม่ (รวม {สาขา})", after5.docNo, "BILL/2026/00007/00002");
  const preview5 = await svc.previewNextDocNo(sid, "INVOICE", d("2026-12-05"));
  eq("T5.3 พรีวิวบนฟอร์มร่างตรงกับเลขที่จะออกจริงใบถัดไป", preview5, "BILL/2026/00007/00003");
  const seqRowsAfterPreview = await prisma.accountDocSequence.findFirst({
    where: { systemId: sid, docType: "INVOICE", periodKey: "2026-12" },
    select: { lastNo: true },
  });
  eq("T5.4 พรีวิวไม่กินเลข (ตัวนับยังเท่าเดิม)", seqRowsAfterPreview?.lastNo, 2);

  // ── T6 ต่อเลขของเดิม (ไม่มีแถวตัวนับ) ──
  console.log("\nT6 ต่อเลขจากเอกสารเดิมเมื่อไม่มีแถวตัวนับ:");
  await prisma.accountDocSequence.deleteMany({ where: { systemId: sid, docType: "INVOICE", periodKey: "2026-12" } });
  const cont = await svc.previewNextDocNo(sid, "INVOICE", d("2026-12-06"));
  eq("T6.1 ลบแถวตัวนับทิ้ง → เลขถัดไป = เลขสูงสุดของงวด + 1 (ไม่ทับใบเดิม)", cont, "BILL/2026/00007/00003");
  const cont2 = await mkInvoice(d("2026-12-06"));
  eq("T6.2 ออกใบจริงหลังตัวนับหาย = ได้เลขต่อจากของเดิม", cont2.docNo, "BILL/2026/00007/00003");
  const gaps = await docSet.docNoGapsFor(S, "INVOICE", d("2026-12-06"));
  eq("T6.3 ตรวจข้ามลำดับ: งวดนี้ 1,2,3 ครบ → ไม่มีช่องว่าง", gaps, []);
  await prisma.accountDocument.updateMany({
    where: { systemId: sid, docNo: "BILL/2026/00007/00002" },
    data: { docNo: "BILL/2026/00007/00009" },
  });
  const gaps2 = await docSet.docNoGapsFor(S, "INVOICE", d("2026-12-06"));
  eq("T6.4 มีเลขข้ามจริง → รายงานลำดับที่หายไป", gaps2, [2, 4, 5, 6, 7, 8]);
  await prisma.accountDocument.updateMany({
    where: { systemId: sid, docNo: "BILL/2026/00007/00009" },
    data: { docNo: "BILL/2026/00007/00002" },
  });

  // ── T12 ใบกำกับภาษีอัตโนมัติเมื่อรับชำระ ──
  console.log("\nT12 ใบกำกับภาษีอัตโนมัติเมื่อรับชำระ:");
  const cash = await finMod.createFinanceAccount({ tenantId: tid, systemId: sid, type: "CASH", name: "เงินสด" });
  const cashId = cash.ok ? cash.id : "";
  const mkServiceInvoice = async (when: Date) => {
    const created = await svc.createDocument({
      tenantId: tid,
      systemId: sid,
      docType: "INVOICE",
      contactId: custId,
      issueDate: when,
      vatTiming: "ON_PAYMENT",
      lines: [{ description: "ค่าบริการ (รับรู้ VAT ตอนรับเงิน)", qty: 1, unitPrice: 100_000, vatRateBp: 700 }],
    });
    const id = (created as { id: string }).id;
    const r = await svc.issueDocument(tid, sid, id);
    if (!r.ok) throw new Error(r.reason);
    return id;
  };
  const invAuto = await mkServiceInvoice(d("2026-12-10"));
  const payA = await svc.recordPayment(tid, sid, invAuto, {
    paidAt: d("2026-12-10"),
    channel: "CASH",
    financeAccountId: cashId,
    amount: 107_000,
  });
  assert("T12.1 รับชำระสำเร็จ", payA.ok, "ok" in payA && !payA.ok ? payA.reason : "");
  const taxA = await prisma.accountDocument.count({
    where: { systemId: sid, docType: "TAX_INVOICE", sourceDocId: invAuto },
  });
  eq("T12.2 นโยบาย 'เมื่อรับชำระ' → ออกใบกำกับให้อัตโนมัติ 1 ใบ", taxA, 1);

  await docSet.saveDocSettings(S, {
    autoTaxInvoice: { mode: "MANUAL", posAbbreviated: false, legalText: "ตาม ม.86/4" },
  });
  const invManual = await mkServiceInvoice(d("2026-12-11"));
  const payB = await svc.recordPayment(tid, sid, invManual, {
    paidAt: d("2026-12-11"),
    channel: "CASH",
    financeAccountId: cashId,
    amount: 107_000,
  });
  assert("T12.3 รับชำระสำเร็จ (โหมดเลือกเอง)", payB.ok, "ok" in payB && !payB.ok ? payB.reason : "");
  const taxB = await prisma.accountDocument.count({
    where: { systemId: sid, docType: "TAX_INVOICE", sourceDocId: invManual },
  });
  eq("T12.4 นโยบาย 'เลือกเอง' → ไม่ออกใบกำกับอัตโนมัติ", taxB, 0);
  const vatCfg = await svc.vatConfigOf(sid);
  eq("T12.5 สวิตช์ใบกำกับอย่างย่อจาก POS ส่งถึง facade ที่ POS เรียก", vatCfg.posAbbreviatedInvoice, false);
  await docSet.saveDocSettings(S, {
    autoTaxInvoice: { mode: "ON_PAYMENT", posAbbreviated: true, legalText: "ตาม ม.86/4" },
  });
  eq("T12.6 เปิดสวิตช์กลับ = facade เห็นค่าใหม่ทันที", (await svc.vatConfigOf(sid)).posAbbreviatedInvoice, true);

  // ── T14 บัญชีรายวันต่อชนิด (override) ──
  console.log("\nT14 บัญชีรายวันของเอกสารต่อชนิด:");
  const ledgers = await coa.listLedgers(S);
  // เลือกบัญชีที่ **ไม่ใช่** ค่าเริ่มต้นของ IV แน่ ๆ (4900 รายได้อื่น) — ถ้าใช้ 4000/4030 อาจบังเอิญ
  // ตรงกับบัญชีที่ระบบเลือกอยู่แล้ว แล้วข้อสอบจะผ่านโดยที่ override ไม่ได้ทำงานจริง
  const acctOther = ledgers.find((l) => l.code === "4900")!;
  const invBefore = await mkInvoice(d("2026-12-15"));
  const linesBefore = await prisma.accountJournalLine.findMany({
    where: { systemId: sid, entry: { refType: "AccountDocument", refId: invBefore.id } },
    select: { accountId: true, credit: true },
  });
  const beforeIncomeIds = linesBefore.filter((l) => l.credit > 0).map((l) => l.accountId);
  const defaultIncomeIds = ledgers.filter((l) => l.code === "4000" || l.code === "4030").map((l) => l.id);
  assert(
    "T14.1 ก่อนตั้ง override: ขา Cr = บัญชีรายได้ค่าเริ่มต้น (4000/4030) ไม่ใช่ 4900",
    beforeIncomeIds.some((x) => defaultIncomeIds.includes(x)) && !beforeIncomeIds.includes(acctOther.id),
    JSON.stringify(beforeIncomeIds),
  );
  const setAcct = await docSet.setDocTypeAccount(S, "INVOICE", acctOther.id);
  assert("T14.2 ตั้งบัญชีเฉพาะชนิดได้", setAcct.ok, "ok" in setAcct && !setAcct.ok ? setAcct.reason : "");
  const invAfter = await mkInvoice(d("2026-12-16"));
  const linesAfter = await prisma.accountJournalLine.findMany({
    where: { systemId: sid, entry: { refType: "AccountDocument", refId: invAfter.id } },
    select: { accountId: true, credit: true, debit: true },
  });
  assert(
    "T14.3 หลังตั้ง override: JV ที่โพสต์ใช้บัญชีใหม่จริง (4900)",
    linesAfter.some((l) => l.accountId === acctOther.id && l.credit > 0),
  );
  eq(
    "T14.4 JV ยังสมดุล (Σdebit = Σcredit)",
    linesAfter.reduce((n, l) => n + l.debit, 0),
    linesAfter.reduce((n, l) => n + l.credit, 0),
  );
  const listAcct = await docSet.listDocTypeAccounts(S);
  eq("T14.5 อ่าน override กลับมาได้ (โชว์รหัส/ชื่อบัญชี)", listAcct.find((r) => r.docType === "INVOICE")?.code, "4900");
  const clearAcct = await docSet.setDocTypeAccount(S, "INVOICE", null);
  assert("T14.6 ล้าง override กลับไปใช้บัญชีกลางได้", clearAcct.ok);
  eq(
    "T14.7 ล้างแล้วไม่มี override เหลือค้าง",
    (await docSet.listDocTypeAccounts(S)).find((r) => r.docType === "INVOICE")?.accountId,
    null,
  );
  await rejected(
    "T14.8 บัญชีของร้านอื่น = ปฏิเสธ",
    () => docSet.setDocTypeAccount(S, "INVOICE", "ledger-ไม่มีจริง"),
    "ไม่พบบัญชีปลายทาง",
  );

  // ── T10b แท็ก CRUD ในร้านทิ้ง ──
  console.log("\nT10b แท็ก: สร้าง/แก้/ชื่อซ้ำ/เก็บเข้ากรุ:");
  const tagA = await docSet.createDocTag(S, { name: "ด่วน", color: "red", docTypes: ["INVOICE"] });
  assert("T10b.1 สร้างแท็กได้", tagA.ok, "ok" in tagA && !tagA.ok ? tagA.reason : "");
  const tagAId = tagA.ok ? tagA.id : "";
  await rejected(
    "T10b.2 ชื่อซ้ำ = ปฏิเสธ พร้อมข้อความไทย",
    () => docSet.createDocTag(S, { name: "ด่วน", color: "blue", docTypes: [] }),
    'มีแท็กชื่อ "ด่วน" อยู่แล้ว',
  );
  await rejected("T10b.3 ชื่อว่าง = ปฏิเสธ", () => docSet.createDocTag(S, { name: "  ", color: "red", docTypes: [] }), "ตั้งชื่อแท็ก");
  await rejected(
    "T10b.4 สีนอกรายการ = ปฏิเสธ",
    () => docSet.createDocTag(S, { name: "สีมั่ว", color: "#ff0000", docTypes: [] }),
    "เลือกสี",
  );
  await rejected(
    "T10b.5 ชนิดเอกสารที่ไม่มีในระบบ = ปฏิเสธ",
    () => docSet.createDocTag(S, { name: "ชนิดมั่ว", color: "red", docTypes: ["NOT_A_TYPE"] }),
    "ไม่มีในระบบ",
  );
  // ผูกแท็กกับเอกสารจริงแล้วเปลี่ยนชื่อแท็ก — เอกสารต้องถูกตามไปแก้ ไม่ใช่กลายเป็นแท็กกำพร้า
  await prisma.accountDocument.update({ where: { id: invBefore.id }, data: { tags: ["ด่วน"] } });
  const upd = await docSet.updateDocTag(S, tagAId, { name: "ด่วนมาก", color: "amber", docTypes: ["INVOICE", "RECEIPT"] });
  assert("T10b.6 แก้ชื่อ/สี/ชนิดได้", upd.ok, "ok" in upd && !upd.ok ? upd.reason : "");
  const docAfterRename = await prisma.accountDocument.findUniqueOrThrow({ where: { id: invBefore.id }, select: { tags: true } });
  eq("T10b.7 เปลี่ยนชื่อแท็ก → เอกสารที่ติดอยู่ถูกตามไปแก้ด้วย", docAfterRename.tags, ["ด่วนมาก"]);
  const arch = await docSet.archiveDocTag(S, tagAId);
  assert("T10b.8 เก็บเข้ากรุได้", arch.ok);
  eq("T10b.9 แท็กที่เก็บแล้วหายจากรายการปกติ", (await docSet.listDocTags(S)).length, 0);
  eq("T10b.10 แต่ยังเรียกดูได้เมื่อขอรวมของที่เก็บไว้", (await docSet.listDocTags(S, { includeArchived: true })).length, 1);
  await docSet.archiveDocTag(S, tagAId, false);
  eq("T10b.11 กู้คืนกลับมาได้", (await docSet.listDocTags(S)).length, 1);

  // ── T11 ลิงก์สาธารณะ ──
  console.log("\nT11 ลิงก์สาธารณะ /r/<token>:");
  // 🔴 ใบสำหรับทดสอบ "อายุลิงก์" ต้องลงวันที่ **ก่อนวันนี้จริง** — ชุดข้อมูล QC ตรึงวันไว้ที่ ก.ย. 2026
  //    ถ้าใช้ใบลงวันที่ ธ.ค. 2026 (อนาคตเมื่อเทียบกับนาฬิกาเครื่อง) อายุลิงก์จะไม่มีวันหมด
  const invOld = await mkInvoice(new Date(Date.now() - 40 * 86_400_000));
  const linkRes = await svc.ensurePublicTaxInvoiceLink(tid, sid, invOld.id);
  assert("T11.1 สร้างลิงก์สาธารณะได้", linkRes.ok, "ok" in linkRes && !linkRes.ok ? linkRes.reason : "");
  const token = linkRes.ok ? linkRes.token : "";
  await docSet.saveDocSettings(S, {
    publicView: { enabled: true, showOutstanding: true, promptPayButton: true, expiryDays: 0 },
  });
  const pub1 = await svc.getPublicTaxContext(token);
  assert("T11.2 เปิดสวิตช์ = เปิดลิงก์ได้", !!pub1);
  eq("T11.3 แสดงยอดค้าง = ยอดที่ยังไม่ได้ชำระจริง", pub1?.outstandingSatang, 107_000); // 100,000 + VAT 7%
  eq("T11.4 เปิดให้ขอใบกำกับ", pub1?.taxRequestEnabled, true);
  await docSet.saveDocSettings(S, {
    publicView: { enabled: true, showOutstanding: false, promptPayButton: false, expiryDays: 0 },
    taxRequest: { enabled: false, receiptText: "", conditionNote: "", minAmountSatang: 0 },
  });
  const pub2 = await svc.getPublicTaxContext(token);
  eq("T11.5 ปิด 'แสดงยอดค้าง' = ไม่ส่งยอดออกไปเลย (null ไม่ใช่ 0)", pub2?.outstandingSatang, null);
  eq("T11.6 ปิดฟอร์มขอใบกำกับ = ธงปิด", pub2?.taxRequestEnabled, false);
  eq("T11.7 ปิดปุ่มจ่าย = ไม่มี token ให้กดจ่าย", pub2?.payToken, null);
  await docSet.saveDocSettings(S, {
    publicView: { enabled: false, showOutstanding: true, promptPayButton: true, expiryDays: 0 },
  });
  eq("T11.8 ปิดลิงก์สาธารณะทั้งระบบ = เปิดไม่ได้ (เหมือน token ผิด)", await svc.getPublicTaxContext(token), null);
  await docSet.saveDocSettings(S, {
    publicView: { enabled: true, showOutstanding: true, promptPayButton: true, expiryDays: 1 },
  });
  eq("T11.9 อายุลิงก์ 1 วัน + เอกสารออกไปแล้ว 40 วัน = หมดอายุ (เปิดไม่ได้)", await svc.getPublicTaxContext(token), null);
  await docSet.saveDocSettings(S, {
    publicView: { enabled: true, showOutstanding: true, promptPayButton: true, expiryDays: 0 },
  });
  assert("T11.10 ตั้งอายุกลับเป็น 0 (ไม่หมดอายุ) = เปิดได้อีก", !!(await svc.getPublicTaxContext(token)));

  // ── T8 หมายเหตุ/เงื่อนไข → ข้อมูลพิมพ์ (ผ่านตั้งค่าที่บันทึกจริง) ──
  console.log("\nT8 หมายเหตุ/เงื่อนไขไปถึงหน้าพิมพ์:");
  await docSet.saveDocSettings(S, {
    notes: { INVOICE: { footer: "ท้ายใบแจ้งหนี้ของร้านทดสอบ", terms: "โอนภายใน 7 วัน" } },
  });
  const sAfterNotes = await svc.getSettings(tid, sid);
  const poInv = printOpt.buildPrintOptions(sAfterNotes.doc, "INVOICE", sAfterNotes.footerNote);
  eq("T8.1 หมายเหตุ/เงื่อนไขของชนิดนั้นถูกส่งให้หน้าพิมพ์", [poInv.footerNote, poInv.paymentTerms], ["ท้ายใบแจ้งหนี้ของร้านทดสอบ", "โอนภายใน 7 วัน"]);

  // ── T15 ด่านสิทธิ์ + validate ──
  console.log("\nT15 ด่านสิทธิ์และการตรวจค่า:");
  const authStaff = { user: { id: staff.id }, active: { ...mStaff, tenant: t } } as never;
  await rejected("T15.1 staff ที่ไม่มี account.settings.manage ถูกปฏิเสธ", async () => {
    assertAccountCan(authStaff, "account.settings.manage");
    return { ok: true };
  });
  const authAdmin = {
    user: { id: staff.id },
    active: { ...mStaff, permissions: { "account.settings.manage": true }, tenant: t },
  } as never;
  let adminOk = true;
  try {
    assertAccountCan(authAdmin, "account.settings.manage");
  } catch {
    adminOk = false;
  }
  assert("T15.2 คนที่มีสิทธิ์ตั้งค่าผ่านด่าน", adminOk);
  await rejected(
    "T15.3 รูปแบบเลขที่ไม่มีช่องลำดับ = ปฏิเสธ (ไม่งั้นทุกใบได้เลขเดียวกัน)",
    () => docSet.saveDocSettings(S, { sequences: { INVOICE: { prefix: "IV", pattern: "IV-{ปี}", reset: "MONTH" } } }),
    "ต้องมีช่องลำดับ",
  );
  await rejected(
    "T15.4 คำนำหน้ามีอักขระต้องห้าม = ปฏิเสธ",
    () => docSet.saveDocSettings(S, { sequences: { INVOICE: { prefix: "IV/#", pattern: "", reset: "MONTH" } } }),
    "ใช้ได้เฉพาะ",
  );
  await rejected(
    "T15.5 จำนวนวันครบกำหนดติดลบ = ปฏิเสธ",
    () => docSet.saveDocSettings(S, { due: { quotationValidDays: -1, invoiceCreditDays: 30, purchaseOrderDueDays: 7, basis: "ISSUE" } }),
    "0–3650",
  );
  await rejected(
    "T15.6 อายุลิงก์เกินช่วง = ปฏิเสธ",
    () => docSet.saveDocSettings(S, { publicView: { enabled: true, showOutstanding: true, promptPayButton: true, expiryDays: 99999 } }),
    "0–3650",
  );
  const badPatternStill = await docSet.getDocSettings(S);
  eq("T15.7 ค่าที่ถูกปฏิเสธต้องไม่ถูกบันทึกลงไป", badPatternStill.sequences.INVOICE.prefix, "BILL");

  // ── T16 แยกร้าน ──
  console.log("\nT16 แยกร้าน (tenant isolation):");
  const crossSettings = await docSet.getDocSettings({ tenantId: tid, systemId: QCTX.systemId });
  eq(
    "T16.1 อ่านตั้งค่าของระบบร้านอื่นด้วย tenantId ตัวเอง = ไม่เห็นข้อมูล (ได้ค่าเริ่มต้น)",
    crossSettings.sequences.INVOICE,
    undefined,
  );
  const crossTags = await docSet.listDocTags({ tenantId: tid, systemId: QCTX.systemId });
  eq("T16.2 แท็กของร้านอื่นมองไม่เห็น", crossTags.length, 0);
  const qcTagId = (await prisma.accountDocTag.findFirstOrThrow({ where: { systemId: QCTX.systemId }, select: { id: true } })).id;
  const crossArchive = await docSet.archiveDocTag({ tenantId: tid, systemId: QCTX.systemId }, qcTagId);
  assert("T16.3 เก็บแท็กของร้านอื่นเข้ากรุไม่ได้", !crossArchive.ok);
  const qcTagStillActive = await prisma.accountDocTag.count({
    where: { systemId: QCTX.systemId, archivedAt: null },
  });
  eq("T16.4 แท็กของร้าน QC ยังครบ ไม่ถูกแตะ", qcTagStillActive, D.tags.length);
} finally {
  if (sTenantId) {
    console.log("\n[cleanup] ลบร้านทดสอบ");
    const del = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        console.log(`  ⚠ cleanup: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      }
    };
    const tid = sTenantId;
    await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocSequence.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocTag.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountContact.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountFinanceOpening.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountFinance.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountPeriod.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountSettings.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.auditLog.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.appSystemUnit.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.membership.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}

console.log(`\n${findings.length === 0 ? "✅" : "❌"} ผ่าน ${passed} ข้อ · พบปัญหา ${findings.length} ข้อ`);
if (findings.length) {
  for (const f of findings) console.log("   • " + f);
  process.exit(1);
}

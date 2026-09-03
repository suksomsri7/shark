// QC WO 1.7 — "ใบวางบิลรวม (BN) + ใบรวมจ่าย (CP)" · DESIGN-SPEC-V2 §5.2 K + §3
// รัน (บังคับ DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-groups.mts
//
// 🔴 ความปลอดภัยข้อมูล: สคริปต์นี้ **สร้าง tenant ทิ้ง** แล้วลบทิ้งเมื่อจบ (ทุก query ผูก tenantId ของตัวเอง)
//    แต่ยังต้องชี้ DB QC เสมอ: ตั้ง QC_ENV_FILE=.env.qc — สคริปต์พิมพ์ไฟล์ env + โฮสต์ DB ให้ตรวจก่อนเริ่ม
//
// ทำไมไม่เรียก server action ตรง ๆ: action เริ่มด้วย `requireTenant()` (อ่านคุกกี้ผ่าน next/headers)
// ซึ่งไม่มีนอก request context ⇒ ที่นี่ตรวจ **ชั้นที่ action เรียกจริง** (group.ts / service / expense / gl)
// + ตรวจ "สายไฟ" ของ action แบบ static (G0)
//
// ครอบคลุม (ดู ledger/wo-notes/1.7.md):
//   G0  สายไฟ+ทะเบียน: group-actions ผ่านด่านสิทธิ์ครบ · group.ts ไม่แตะ prisma/ไม่เขียน posting ·
//       BN/CP อยู่ใน NO_GL ของ gl.ts · ไม่อยู่ใน PAYABLE_DOC_TYPES · route/guard/nav/แท็บ ครบ
//   G1  allocateFifo (ฟังก์ชันบริสุทธิ์): จัดสรรตามลำดับจนเต็มยอดค้างของแต่ละใบ
//   G2  เกณฑ์ใบลูกที่หยิบได้: คนละผู้ติดต่อ/ชำระแล้ว/อยู่ในกลุ่มอื่นแล้ว = หยิบไม่ได้
//   G3  BN จาก IV 3 ใบ: ไม่มี JV · relation BILL ×3 · ยอดกลุ่ม = Σ ยอดค้าง · สถานะ "รอรับชำระ"
//   G4  รับชำระ BN ครั้งเดียวเต็มยอด → ใบลูก 3 ใบได้ payment/JV ของตัวเอง · IV ทุกใบ "ชำระแล้ว" ·
//       Dr เงิน Σ · Cr 1100 แยกตามใบ · BN = "ชำระเงินแล้ว"
//   G5  รับชำระบางส่วน → จัดสรร FIFO ตามวันครบกำหนด · BN = "ชำระบางส่วน"
//   G6  CP จากบิล 4 ใบ: relation PAY_GROUP ×4 · จ่ายครั้งเดียว + หัก ณ ที่จ่าย 3% เฉพาะบิลบริการ →
//       50 ทวิ 1 ใบ · Dr 2100 Σ · Cr เงิน · Cr 2130
//   G7  ยกเลิกการชำระของกลุ่ม = กลับรายการใบลูกทุกใบ (JV/สถานะ/50 ทวิ)
//   G8  idempotency: ยิงคีย์เดิมซ้ำ = ไม่เกิด payment/JV ใหม่
//   G9  สิทธิ์ · G10 ขอบเขตข้ามระบบ · G11 ใบลูกอยู่ 2 กลุ่มพร้อมกันไม่ได้ · G12 สมุดรายวันสมดุลทั้ง tenant

process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env");

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
const findings: string[] = [];
function ok(name: string) {
  passed++;
  console.log("  ✅ " + name);
}
function bad(name: string, detail: string) {
  findings.push(name + " — " + detail);
  console.log("  ❌ " + name + " — " + detail);
}
function assert(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else bad(name, detail);
}
function eq(name: string, actual: unknown, expected: unknown) {
  assert(name, actual === expected, `ได้ ${JSON.stringify(actual)} · ควรได้ ${JSON.stringify(expected)}`);
}
const bt = (satang: number) => "฿" + (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
function eqAmt(name: string, actual: number, expected: number) {
  assert(name, actual === expected, `ได้ ${bt(actual)} · ควรได้ ${bt(expected)}`);
}

const ROOT = process.cwd();
const envFile = process.env.QC_ENV_FILE ?? ".env";
const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "(ไม่พบ DATABASE_URL)";
console.log("\n===== QC WO 1.7 · ใบวางบิลรวม + ใบรวมจ่าย (§5.2 K) =====");
console.log(`[env] ไฟล์ ${envFile} · DB ${dbHost}\n`);

// ═══════════════════════════ G0 — สายไฟ + ทะเบียน (static) ═══════════════════════════
console.log("G0 สายไฟ/ทะเบียน (อ่านจากซอร์สจริง):");
{
  const src = readFileSync(join(ROOT, "src/lib/modules/account/group-actions.ts"), "utf8");
  assert("G0.1 group-actions.ts ไม่ import prisma ตรง ๆ (fitness F5)", !/from\s+["']@\/lib\/core\/db["']/.test(src));
  const bodies = src.split(/export async function /).slice(1);
  assert("G0.2 มี server action ครบ (list/create/panel/record/void/bulk)", bodies.length >= 6, String(bodies.length));
  for (const b of bodies) {
    const fn = b.slice(0, b.indexOf("("));
    assert(
      `G0.3 ${fn}: ผ่าน loadAccountSystem + assertAccountCan`,
      b.includes("loadAccountSystem(") && b.includes("assertAccountCan("),
    );
  }
  assert(
    "G0.4 recordGroupPaymentAction ใช้สิทธิ์ account.payment.record",
    /recordGroupPaymentAction[\s\S]{0,800}account\.payment\.record/.test(src),
  );
  assert(
    "G0.5 voidGroupPaymentAction ใช้สิทธิ์ account.payment.void",
    /voidGroupPaymentAction[\s\S]{0,800}account\.payment\.void/.test(src),
  );
  const grp = readFileSync(join(ROOT, "src/lib/modules/account/group.ts"), "utf8");
  assert("G0.6 group.ts ไม่ import prisma ตรง ๆ", !/from\s+["']@\/lib\/core\/db["']/.test(grp));
  assert("G0.7 group.ts ไม่เขียน posting เอง (ไม่เรียก commitEntry/Book/postDocument)", !/commitEntry|new Book\(|postDocument\(/.test(grp));
  const gl = readFileSync(join(ROOT, "src/lib/modules/account/gl.ts"), "utf8");
  const noGl = gl.slice(gl.indexOf("const NO_GL"), gl.indexOf("const NO_GL") + 700);
  assert("G0.8 gl.ts: BILLING_NOTE อยู่ใน NO_GL (ใบวางบิลไม่ลง JV)", noGl.includes('"BILLING_NOTE"'));
  assert("G0.9 gl.ts: COMBINED_PAYMENT อยู่ใน NO_GL (ใบรวมจ่ายไม่ลง JV ตอนออก)", noGl.includes('"COMBINED_PAYMENT"'));
  const payjs = readFileSync(join(ROOT, "src/lib/modules/account/payment.ts"), "utf8");
  const payable = payjs.slice(payjs.indexOf("PAYABLE_DOC_TYPES"), payjs.indexOf("GROUP_DOC_TYPES"));
  assert("G0.10 payment.ts: BILLING_NOTE ไม่อยู่ใน PAYABLE_DOC_TYPES (ห้ามรับชำระที่ตัวกลุ่ม)", !payable.includes('"BILLING_NOTE"'));
  assert("G0.11 payment.ts: COMBINED_PAYMENT ไม่อยู่ใน PAYABLE_DOC_TYPES", !payable.includes('"COMBINED_PAYMENT"'));
  const print = readFileSync(join(ROOT, "src/app/app/sys/[id]/account/print/[docId]/page.tsx"), "utf8");
  assert("G0.12a ใบพิมพ์รู้จักเอกสารกลุ่ม (isGroupDocType)", print.includes("isGroupDocType("));
  assert("G0.12b ใบพิมพ์ของกลุ่มใช้หัวตาราง 'เอกสาร'/'ยอดค้างชำระ' แทน 'สินค้า/บริการ'", print.includes("ยอดค้างชำระ") && print.includes("รวมยอดที่ต้องชำระ"));
  assert("G0.12c ใบรวมจ่ายพิมพ์เป็น 'ใบสำคัญจ่าย' ตาม §3", print.includes("ใบสำคัญจ่าย"));
  assert("G0.12d ใบพิมพ์ฝั่งรายจ่ายมีชื่อเอกสารจริง (ไม่ตกเป็นคำว่า 'เอกสาร')", print.includes("EXP_DOC_LABEL[doc.docType]"));
  for (const rel of [
    "combined-payment/page.tsx",
    "combined-payment/new/page.tsx",
    "combined-payment/[docId]/page.tsx",
  ]) {
    assert(`G0.12 มีไฟล์ route ${rel}`, existsSync(join(ROOT, "src/app/app/sys/[id]/account", rel)));
  }
}

const { ACCOUNT_PAGE_PERMISSIONS } = await import("@/lib/modules/account/guard");
const { LIST_TABS, NAV_FLYOUT_TABS } = await import("@/lib/modules/account/list-tabs");
const { ACCOUNT_NAV } = await import("@/lib/modules/account/nav");
const grp = await import("@/lib/modules/account/group");
{
  eq("G0.13 ทะเบียนสิทธิ์: หน้ารายการใบรวมจ่าย = account.doc.view", ACCOUNT_PAGE_PERMISSIONS["combined-payment/page.tsx"], "account.doc.view");
  eq("G0.14 ทะเบียนสิทธิ์: ฟอร์มใบรวมจ่าย = account.doc.create", ACCOUNT_PAGE_PERMISSIONS["combined-payment/new/page.tsx"], "account.doc.create");
  eq("G0.15 ทะเบียนสิทธิ์: หน้าเอกสารใบรวมจ่าย = account.doc.view", ACCOUNT_PAGE_PERMISSIONS["combined-payment/[docId]/page.tsx"], "account.doc.view");
  const cpTabs = (LIST_TABS.COMBINED_PAYMENT ?? []).map((t) => t.label);
  assert("G0.16 แท็บใบรวมจ่ายตาม §3 (ทั้งหมด/ร่าง/รออนุมัติ/รอชำระ/พ้นกำหนด/ชำระแล้ว/ยกเลิก)", cpTabs.join("·") === "ทั้งหมด·ร่าง·รออนุมัติ·รอชำระ·พ้นกำหนด·ชำระแล้ว·ยกเลิก", cpTabs.join("·"));
  const bnTabs = (LIST_TABS.BILLING_NOTE ?? []).map((t) => t.label);
  assert("G0.17 แท็บใบวางบิลมี 'รอรับชำระ' + 'รับชำระแล้ว' ตาม §3", bnTabs.includes("รอรับชำระ") && bnTabs.includes("รับชำระแล้ว"), bnTabs.join("·"));
  assert("G0.18 flyout เมนูมีตัวนับของ BN/CP", Object.keys(NAV_FLYOUT_TABS.BILLING_NOTE ?? {}).length > 0 && Object.keys(NAV_FLYOUT_TABS.COMBINED_PAYMENT ?? {}).length > 0);
  const nav = ACCOUNT_NAV("/app/sys/TEST/account", true);
  const cpItem = nav.flatMap((g) => g.items).find((i) => i.testId === "COMBINED_PAYMENT");
  eq("G0.19 เมนู 'ใบรวมจ่าย' เปลี่ยนจาก 'เร็ว ๆ นี้' เป็นใช้งานได้", cpItem?.status, "ready");
  eq("G0.20 เมนู 'ใบรวมจ่าย' ชี้ route จริง", cpItem?.href, "/app/sys/TEST/account/combined-payment");
  assert("G0.21 เมนู 'ใบรวมจ่าย' มี flyout '+ สร้างใบรวมจ่าย'", (cpItem?.flyout ?? []).some((f) => f.label.includes("สร้างใบรวมจ่าย")));
  eq("G0.22 ทะเบียนกลุ่มมี 2 ชนิด (BN/CP)", grp.GROUP_DOC_TYPES.length, 2);
  eq("G0.23 ใบวางบิลรับเฉพาะใบแจ้งหนี้เป็นใบลูก", grp.GROUP_DEFS.BILLING_NOTE.childTypes.join(","), "INVOICE");
  eq("G0.24 ใบรวมจ่ายรับ PUR/EXP/DNR/DP เป็นใบลูก", grp.GROUP_DEFS.COMBINED_PAYMENT.childTypes.join(","), "PURCHASE,EXPENSE,DEBIT_NOTE_RECEIVED,DEPOSIT_PAYMENT");
}

// ═══════════════════════════ G1 — allocateFifo (ฟังก์ชันบริสุทธิ์) ═══════════════════════════
console.log("\nG1 การจัดสรรแบบ FIFO (ฟังก์ชันบริสุทธิ์):");
{
  const kids = [
    { id: "a", docNo: "IV-1", outstanding: 100_00 },
    { id: "b", docNo: "IV-2", outstanding: 200_00 },
    { id: "c", docNo: "IV-3", outstanding: 300_00 },
  ];
  const full = grp.allocateFifo(kids, 600_00);
  eq("G1.1 จ่ายเต็ม → จัดสรรครบ 3 ใบ", full.length, 3);
  eqAmt("G1.2 ผลรวมที่จัดสรร = ยอดที่จ่าย", full.reduce((s, a) => s + a.tieOff, 0), 600_00);
  const part = grp.allocateFifo(kids, 250_00);
  eq("G1.3 จ่ายบางส่วน → แตะแค่ 2 ใบแรก", part.length, 2);
  eqAmt("G1.4 ใบแรกได้เต็มยอดค้างก่อน", part[0].tieOff, 100_00);
  eqAmt("G1.5 ส่วนที่เหลือไหลไปใบถัดไป", part[1].tieOff, 150_00);
  eq("G1.6 จ่าย 0 = ไม่จัดสรรอะไรเลย", grp.allocateFifo(kids, 0).length, 0);
  const over = grp.allocateFifo(kids, 900_00);
  eqAmt("G1.7 จ่ายเกิน → จัดสรรได้ไม่เกินยอดค้างรวม", over.reduce((s, a) => s + a.tieOff, 0), 600_00);
}

const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const gl = await import("@/lib/modules/account/gl");
const fin = await import("@/lib/modules/account/finance");
const { assertAccountCan } = await import("@/lib/modules/account/access");

const tag = "QCACC17-" + Date.now();
let tenantId = "";
const userIds: string[] = [];

type Entry = { id: string; lines: { debit: number; credit: number; accountId: string; account: { code: string } }[] };
const entriesOf = (systemId: string, refId: string, refType = "AccountDocument") =>
  prisma.accountJournalEntry.findMany({
    where: { systemId, refType, refId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  }) as Promise<Entry[]>;
const drOf = (es: Entry[], accountId: string) =>
  es.flatMap((e) => e.lines).filter((l) => l.accountId === accountId).reduce((s, l) => s + l.debit, 0);
const crOf = (es: Entry[], accountId: string) =>
  es.flatMap((e) => e.lines).filter((l) => l.accountId === accountId).reduce((s, l) => s + l.credit, 0);
const drCode = (es: Entry[], code: string) =>
  es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((s, l) => s + l.debit, 0);
const crCode = (es: Entry[], code: string) =>
  es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((s, l) => s + l.credit, 0);
const balanced = (es: Entry[]) =>
  es.every((e) => e.lines.reduce((s, l) => s + l.debit, 0) === e.lines.reduce((s, l) => s + l.credit, 0));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date());
const dayPlus = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

try {
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const owner = await prisma.user.create({ data: { email: tag.toLowerCase() + "-owner@qc.local", name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: tag.toLowerCase() + "-staff@qc.local", name: "QC พนักงาน" } });
  userIds.push(owner.id, staff.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } },
    include: { tenant: true },
  });

  const s1 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชี " + tag);
  const s2 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชีสาขา 2 " + tag);
  const systemId = s1.id;
  const otherSystemId = s2.id;
  console.log(`\n[seed] tenant ${tenantId} · system ${systemId}\n`);

  await acc.saveSettings(tenantId, systemId, {
    orgName: "ร้านดำน้ำ QC 1.7",
    taxId: "0105561000000",
    vatRegistered: true,
    vatRateBp: 700,
    taxPointBasis: "ON_ISSUE",
  });
  await acc.saveSettings(tenantId, otherSystemId, { orgName: "สาขา 2", vatRegistered: true, vatRateBp: 700 });
  await gl.ensureAccounting({ tenantId, systemId });
  await gl.ensureAccounting({ tenantId, systemId: otherSystemId });

  const bank = await fin.createFinanceAccount({ tenantId, systemId, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
  if (!bank.ok) throw new Error("สร้างช่องทางการเงินไม่สำเร็จ");
  const bankLedger = (await prisma.accountFinance.findFirstOrThrow({ where: { id: bank.id } })).ledgerAccountId!;

  const custA = await acc.createContact({ tenantId, systemId, kind: "CUSTOMER", legalType: "COMPANY", name: "บจก. อันดามัน ทราเวล", taxId: "0105561999999", branchCode: "00000" });
  const custB = await acc.createContact({ tenantId, systemId, kind: "CUSTOMER", legalType: "COMPANY", name: "โรงแรมสิมิลันวิว", taxId: "0105561777777", branchCode: "00000" });
  const vendor = await acc.createContact({ tenantId, systemId, kind: "VENDOR", legalType: "COMPANY", name: "บริษัท เรือทัวร์ จำกัด", taxId: "0105561888888", branchCode: "00000" });

  /** ใบแจ้งหนี้ (ออกแล้ว) — VAT 7% แยกนอก · dueOffset = จำนวนวันจากวันนี้ */
  const mkInvoice = async (contactId: string, priceSatang: number, dueOffset: number) => {
    const d = await acc.createDocument({
      tenantId, systemId, docType: "INVOICE", contactId,
      issueDate: new Date(`${TODAY}T00:00:00.000Z`),
      dueDate: dayPlus(dueOffset),
      vatMode: "EXCLUDE", vatTiming: "ON_ISSUE",
      lines: [{ description: "ทริปดำน้ำ", qty: 1, unitName: "งาน", unitPrice: priceSatang, discount: 0, vatRateBp: 700 }],
      createdById: owner.id,
    });
    const r = await acc.issueDocument(tenantId, systemId, d.id);
    if (!r.ok) throw new Error("ออกใบแจ้งหนี้ไม่สำเร็จ: " + r.reason);
    return d.id;
  };

  /** บิลฝั่งจ่าย (ออกแล้ว → ตั้งเจ้าหนี้) */
  const mkBill = async (docType: "PURCHASE" | "EXPENSE", priceSatang: number, dueOffset: number, accountId?: string) => {
    const d = await exp.createExpenseDoc({
      tenantId, systemId, docType, contactId: vendor.id,
      issueDate: new Date(`${TODAY}T00:00:00.000Z`),
      dueDate: dayPlus(dueOffset),
      vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM",
      lines: [{ description: docType === "EXPENSE" ? "ค่าบริการไกด์" : "อุปกรณ์ดำน้ำ", qty: 1, unitName: "งาน", unitPrice: priceSatang, discount: 0, vatRateBp: 700, accountId: accountId ?? null }],
      createdById: owner.id,
    });
    const r = await exp.issueExpenseDoc(tenantId, systemId, d.id);
    if (!r.ok) throw new Error("ออกบิลไม่สำเร็จ: " + r.reason);
    return d.id;
  };

  // ═════════ G2 — เกณฑ์ใบลูกที่หยิบเข้ากลุ่มได้ ═════════
  console.log("\nG2 เกณฑ์เอกสารที่หยิบเข้ากลุ่มได้:");
  const iv1 = await mkInvoice(custA.id, 100_000, 3);   // ครบกำหนดเร็วสุด
  const iv2 = await mkInvoice(custA.id, 200_000, 10);
  const iv3 = await mkInvoice(custA.id, 300_000, 20);
  const ivOther = await mkInvoice(custB.id, 500_000, 5); // คนละลูกค้า
  const ivPaid = await mkInvoice(custA.id, 400_000, 7);  // จ่ายปิดแล้ว
  const ivPaidDoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: ivPaid } });
  const closed = await acc.recordPayment(tenantId, systemId, ivPaid, {
    paidAt: new Date(), channel: "TRANSFER", financeAccountId: bank.id, amount: ivPaidDoc.grandTotal, createdById: owner.id,
  });
  assert("G2.1 เตรียมใบแจ้งหนี้ที่ชำระครบแล้ว 1 ใบ", closed.ok && closed.status === "PAID", closed.ok ? closed.status : closed.reason);

  const candA = await grp.listGroupCandidates(tenantId, systemId, "BILLING_NOTE", custA.id);
  const candIds = candA.map((c) => c.id);
  eq("G2.2 ลูกค้า A มีใบแจ้งหนี้ให้เลือก 3 ใบ", candA.length, 3);
  assert("G2.3 ใบที่ชำระครบแล้วไม่อยู่ในตัวเลือก", !candIds.includes(ivPaid));
  assert("G2.4 ใบของลูกค้าอื่นไม่อยู่ในตัวเลือก", !candIds.includes(ivOther));
  assert("G2.5 ทุกใบที่เลือกได้มียอดค้าง > 0", candA.every((c) => c.outstanding > 0));
  assert("G2.6 ทุกใบยังว่าง (ยังไม่อยู่ในใบวางบิลอื่น)", candA.every((c) => c.eligible && c.groupDocId === null));
  assert(
    "G2.7 เรียงตามวันครบกำหนดจากเร็วไปช้า (FIFO)",
    candA[0].id === iv1 && candA[1].id === iv2 && candA[2].id === iv3,
    candA.map((c) => c.docNo).join(","),
  );
  eq("G2.8 ไม่ระบุผู้ติดต่อ = ไม่คืนอะไรเลย (กันเผลอรวมข้ามลูกค้า)", (await grp.listGroupCandidates(tenantId, systemId, "BILLING_NOTE", "")).length, 0);
  const candVendorAsBn = await grp.listGroupCandidates(tenantId, systemId, "BILLING_NOTE", vendor.id);
  eq("G2.9 ผู้ขายไม่มีใบแจ้งหนี้ให้วางบิล", candVendorAsBn.length, 0);

  // ═════════ G3 — สร้างใบวางบิลรวมจากใบแจ้งหนี้ 3 ใบ ═════════
  console.log("\nG3 ออกใบวางบิลรวมจากใบแจ้งหนี้ 3 ใบ:");
  const sumA = candA.reduce((s, c) => s + c.outstanding, 0);
  const bnRes = await grp.createGroupDoc(tenantId, systemId, {
    docType: "BILLING_NOTE",
    contactId: custA.id,
    issueDate: TODAY,
    dueDate: iso(dayPlus(15)),
    note: "วางบิลประจำเดือน",
    childIds: [iv1, iv2, iv3],
    createdById: owner.id,
  });
  assert("G3.1 ออกใบวางบิลรวมสำเร็จ", bnRes.ok, bnRes.ok ? "" : bnRes.reason);
  if (!bnRes.ok) throw new Error("G3 ล้ม: " + bnRes.reason);
  const bnId = bnRes.id;
  assert("G3.2 เลขที่ขึ้นต้น BN-", bnRes.docNo.startsWith("BN-"), bnRes.docNo);
  const bnDoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: bnId } });
  eq("G3.3 สถานะ = รอชำระเงิน (รอรับชำระ)", bnDoc.status, "AWAITING_PAYMENT");
  eqAmt("G3.4 ยอดกลุ่ม = ผลรวมยอดค้างของใบลูก", bnDoc.grandTotal, sumA);
  eqAmt("G3.5 ยอดกลุ่ม = ฿6,420.00 (1,000+2,000+3,000 + VAT 7%)", bnDoc.grandTotal, 642_000);
  eqAmt("G3.6 ไม่คิด VAT ซ้ำที่ใบวางบิล", bnDoc.vatAmount, 0);
  eq("G3.7 ทิศทางเอกสาร = ขาย (OUT)", bnDoc.direction, "OUT");
  eq("G3.8 ใบวางบิลไม่ลงสมุดรายวันเลย (ลูกหนี้ตั้งที่ใบแจ้งหนี้แล้ว)", (await entriesOf(systemId, bnId)).length, 0);
  const bnRels = await prisma.accountDocumentRelation.findMany({ where: { systemId, fromId: bnId, type: "BILL" } });
  eq("G3.9 เกิด relation BILL 3 เส้น (ใบวางบิล → ใบแจ้งหนี้)", bnRels.length, 3);
  eqAmt("G3.10 ยอดบน relation รวม = ยอดกลุ่ม", bnRels.reduce((s, r) => s + (r.amount ?? 0), 0), sumA);
  const bnLines = await prisma.accountDocumentLine.findMany({ where: { documentId: bnId }, orderBy: { sortOrder: "asc" } });
  eq("G3.11 บรรทัดในใบวางบิล = 1 บรรทัดต่อใบลูก", bnLines.length, 3);
  assert("G3.12 บรรทัดอ้างเลขที่ใบแจ้งหนี้จริง", bnLines.every((l) => l.description.includes("IV-")), bnLines.map((l) => l.description).join(" | "));
  const ivAfterGroup = await prisma.accountDocument.findMany({ where: { id: { in: [iv1, iv2, iv3] } } });
  assert("G3.13 ใบแจ้งหนี้ลูกยังสถานะเดิม (ใบวางบิลไม่เปลี่ยนสถานะใบลูก)", ivAfterGroup.every((d) => d.status === "AWAITING_PAYMENT"));
  const chip = await grp.groupChipOfChild(tenantId, systemId, iv1);
  eq("G3.14 ใบแจ้งหนี้ลูกได้ชิป 'อยู่ในใบวางบิล'", chip?.label, "อยู่ในใบวางบิล");
  eq("G3.15 ชิปชี้กลับไปที่ใบวางบิลใบนี้", chip?.groupId, bnId);

  // ═════════ G11 (ทำที่นี่เพราะต่อเนื่อง) — ใบลูกอยู่ 2 กลุ่มพร้อมกันไม่ได้ ═════════
  console.log("\nG11 ใบลูกอยู่ในกลุ่มที่เปิดอยู่ได้ทีละกลุ่มเท่านั้น:");
  const candA2 = await grp.listGroupCandidates(tenantId, systemId, "BILLING_NOTE", custA.id);
  assert("G11.1 ใบที่เข้ากลุ่มแล้วยังโชว์แต่ติ๊กไม่ได้", candA2.length === 3 && candA2.every((c) => !c.eligible), candA2.map((c) => `${c.docNo}:${c.eligible}`).join(","));
  assert("G11.2 มีเหตุผลเป็นภาษาคนบอกว่าอยู่ใบไหน", (candA2[0].blockedReason ?? "").includes(bnRes.docNo), candA2[0].blockedReason ?? "");
  const dupBn = await grp.createGroupDoc(tenantId, systemId, {
    docType: "BILLING_NOTE", contactId: custA.id, issueDate: TODAY, dueDate: null, note: null,
    childIds: [iv1], createdById: owner.id,
  });
  assert("G11.3 สร้างใบวางบิลซ้ำด้วยใบเดิม = ถูกปฏิเสธ", !dupBn.ok, dupBn.ok ? "ผ่านไปได้" : dupBn.reason);
  const mixBn = await grp.createGroupDoc(tenantId, systemId, {
    docType: "BILLING_NOTE", contactId: custA.id, issueDate: TODAY, dueDate: null, note: null,
    childIds: [ivOther], createdById: owner.id,
  });
  assert("G11.4 ใส่ใบของลูกค้าคนอื่นเข้ากลุ่ม = ถูกปฏิเสธ", !mixBn.ok, mixBn.ok ? "ผ่านไปได้" : mixBn.reason);
  const emptyBn = await grp.createGroupDoc(tenantId, systemId, {
    docType: "BILLING_NOTE", contactId: custA.id, issueDate: TODAY, dueDate: null, note: null,
    childIds: [], createdById: owner.id,
  });
  assert("G11.5 ไม่เลือกเอกสารเลย = ถูกปฏิเสธ", !emptyBn.ok, emptyBn.ok ? "ผ่านไปได้" : emptyBn.reason);

  // ═════════ G4 — รับชำระใบวางบิลครั้งเดียวเต็มยอด ═════════
  console.log("\nG4 รับชำระใบวางบิล 1 ครั้ง → กระจายเข้าใบแจ้งหนี้ลูกครบ:");
  const panelBefore = await grp.groupPanelData(tenantId, systemId, bnId);
  eq("G4.1 แผงรับชำระเห็นใบลูก 3 ใบ", panelBefore?.children.length, 3);
  eqAmt("G4.2 ยอดคงค้างของกลุ่ม = ยอดเต็ม", panelBefore?.outstanding ?? -1, sumA);
  assert("G4.3 แผงเปิดให้รับชำระได้", panelBefore?.canRecord === true);
  eq("G4.4 ป้ายปุ่มฝั่งขาย = 'รับชำระ'", panelBefore?.texts.payAction, "รับชำระ");

  const payFull = await grp.recordGroupPayment(
    tenantId, systemId, bnId,
    { paidAt: TODAY, financeAccountId: bank.id, tieOffSatang: sumA, note: "โอนวางบิล", feeSatang: 0, wht: [], cheque: null },
    { userId: owner.id, clientKey: "qc-bn-full" },
  );
  assert("G4.5 รับชำระสำเร็จ", payFull.ok, payFull.ok ? "" : payFull.reason);
  if (!payFull.ok) throw new Error("G4 ล้ม: " + payFull.reason);
  eq("G4.6 กระจายลงใบลูก 3 ใบ", payFull.recorded, 3);
  eqAmt("G4.7 ผลรวมที่จัดสรร = ยอดที่รับ", payFull.allocations.reduce((s, a) => s + a.tieOff, 0), sumA);
  eqAmt("G4.8 ยอดคงค้างหลังรับชำระ = 0", payFull.outstanding, 0);

  const childPays = await prisma.accountDocumentPayment.findMany({ where: { systemId, documentId: { in: [iv1, iv2, iv3] } } });
  eq("G4.9 เกิดรายการรับชำระที่ใบลูก 3 รายการ (ไม่ใช่ที่ใบวางบิล)", childPays.length, 3);
  eq("G4.10 ไม่มีรายการชำระผูกกับตัวใบวางบิลเอง", await prisma.accountDocumentPayment.count({ where: { documentId: bnId } }), 0);
  const ivAfterPay = await prisma.accountDocument.findMany({ where: { id: { in: [iv1, iv2, iv3] } } });
  assert("G4.11 ใบแจ้งหนี้ลูกทุกใบ = ชำระแล้ว", ivAfterPay.every((d) => d.status === "PAID"), ivAfterPay.map((d) => `${d.docNo}:${d.status}`).join(","));
  const bnAfter = await prisma.accountDocument.findFirstOrThrow({ where: { id: bnId } });
  eq("G4.12 ใบวางบิล = รับชำระแล้ว", bnAfter.status, "PAID");
  eqAmt("G4.13 ความคืบหน้าของกลุ่ม = ยอดเต็ม", bnAfter.paidTotal, sumA);

  const childPayEntries = (await Promise.all(childPays.map((p) => entriesOf(systemId, p.id, "AccountDocumentPayment")))).flat();
  eq("G4.14 เกิดสมุดรายวันของการรับชำระ 3 ชุด (ชุดละใบลูก)", childPayEntries.length, 3);
  assert("G4.15 ทุกชุดสมดุล", balanced(childPayEntries));
  eqAmt("G4.16 Dr ธนาคารรวม = ยอดที่รับ", drOf(childPayEntries, bankLedger), sumA);
  eqAmt("G4.17 Cr 1100 ลูกหนี้รวม = ยอดที่รับ", crCode(childPayEntries, "1100"), sumA);
  eq("G4.18 ใบวางบิลยังไม่มี JV ของตัวเองหลังรับชำระ", (await entriesOf(systemId, bnId)).length, 0);
  const iv1Entries = await entriesOf(systemId, (await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: iv1 } })).id, "AccountDocumentPayment");
  eqAmt("G4.19 Cr 1100 ของใบแรก = ยอดของใบนั้นเอง (แยกเป็นใบ ๆ)", crCode(iv1Entries, "1100"), 107_000);

  // ═════════ G5 — รับชำระบางส่วน (FIFO ตามวันครบกำหนด) ═════════
  console.log("\nG5 รับชำระบางส่วน → จัดสรร FIFO ตามวันครบกำหนด:");
  const p1 = await mkInvoice(custB.id, 100_000, 2);  // ครบกำหนดเร็วสุด
  const p2 = await mkInvoice(custB.id, 200_000, 9);
  const p3 = await mkInvoice(custB.id, 300_000, 25);
  const bn2 = await grp.createGroupDoc(tenantId, systemId, {
    docType: "BILLING_NOTE", contactId: custB.id, issueDate: TODAY, dueDate: iso(dayPlus(20)), note: null,
    childIds: [p3, p1, p2], createdById: owner.id, // จงใจสลับลำดับที่ส่งเข้ามา
  });
  assert("G5.1 ออกใบวางบิลใบที่ 2 สำเร็จ", bn2.ok, bn2.ok ? "" : bn2.reason);
  if (!bn2.ok) throw new Error("G5 ล้ม");
  const bn2Panel = await grp.groupPanelData(tenantId, systemId, bn2.id);
  assert(
    "G5.2 ใบลูกในแผงเรียงตามวันครบกำหนด ไม่ใช่ลำดับที่ส่งมา",
    bn2Panel?.children[0].id === p1 && bn2Panel?.children[1].id === p2 && bn2Panel?.children[2].id === p3,
    (bn2Panel?.children ?? []).map((c) => c.docNo).join(","),
  );
  // จ่าย 150,000.00 = ปิดใบแรก (107,000) + บางส่วนของใบที่สอง (43,000)
  const partial = await grp.recordGroupPayment(
    tenantId, systemId, bn2.id,
    { paidAt: TODAY, financeAccountId: bank.id, tieOffSatang: 150_000, note: "จ่ายบางส่วน", feeSatang: 0, wht: [], cheque: null },
    { userId: owner.id, clientKey: "qc-bn-partial" },
  );
  assert("G5.3 รับชำระบางส่วนสำเร็จ", partial.ok, partial.ok ? "" : partial.reason);
  if (!partial.ok) throw new Error("G5 ล้ม: " + partial.reason);
  eq("G5.4 แตะเฉพาะ 2 ใบแรก (ใบที่ครบกำหนดก่อน)", partial.recorded, 2);
  eqAmt("G5.5 ใบครบกำหนดเร็วสุดได้เต็มยอด ฿1,070.00", partial.allocations[0].tieOff, 107_000);
  eqAmt("G5.6 ส่วนที่เหลือไหลไปใบที่สอง ฿430.00", partial.allocations[1].tieOff, 43_000);
  const p1Doc = await prisma.accountDocument.findFirstOrThrow({ where: { id: p1 } });
  const p2Doc = await prisma.accountDocument.findFirstOrThrow({ where: { id: p2 } });
  const p3Doc = await prisma.accountDocument.findFirstOrThrow({ where: { id: p3 } });
  eq("G5.7 ใบที่ 1 = ชำระแล้ว", p1Doc.status, "PAID");
  eq("G5.8 ใบที่ 2 = ชำระบางส่วน", p2Doc.status, "PARTIAL");
  eq("G5.9 ใบที่ 3 ยังไม่ถูกแตะ", p3Doc.status, "AWAITING_PAYMENT");
  eqAmt("G5.10 ใบที่ 3 ยังไม่มียอดชำระ", p3Doc.paidTotal, 0);
  const bn2Doc = await prisma.accountDocument.findFirstOrThrow({ where: { id: bn2.id } });
  eq("G5.11 ใบวางบิล = ชำระบางส่วน", bn2Doc.status, "PARTIAL");
  eqAmt("G5.12 ความคืบหน้าของกลุ่ม = ฿1,500.00", bn2Doc.paidTotal, 150_000);
  const overPay = await grp.recordGroupPayment(
    tenantId, systemId, bn2.id,
    { paidAt: TODAY, financeAccountId: bank.id, tieOffSatang: 99_999_999, note: "", feeSatang: 0, wht: [], cheque: null },
    { userId: owner.id, clientKey: "qc-bn-over" },
  );
  assert("G5.13 รับชำระเกินยอดคงค้าง = ถูกปฏิเสธ", !overPay.ok, overPay.ok ? "ผ่านไปได้" : overPay.reason);

  // ═════════ G6 — ใบรวมจ่าย 4 ใบ + หัก ณ ที่จ่าย 3% เฉพาะบิลบริการ ═════════
  console.log("\nG6 ใบรวมจ่ายจากบิล 4 ใบ + หัก ณ ที่จ่าย 3%:");
  const expenseAccounts = await exp.listExpenseAccounts(systemId);
  const svcAccount = expenseAccounts[0]?.id;
  const b1 = await mkBill("PURCHASE", 100_000, 4);
  const b2 = await mkBill("PURCHASE", 150_000, 8);
  const b3 = await mkBill("PURCHASE", 250_000, 12);
  const b4 = await mkBill("EXPENSE", 200_000, 16, svcAccount); // บิลบริการ → หัก ณ ที่จ่าย 3%
  const candVendor = await grp.listGroupCandidates(tenantId, systemId, "COMBINED_PAYMENT", vendor.id);
  eq("G6.1 ผู้ขายรายนี้มีบิลค้างจ่ายให้เลือก 4 ใบ", candVendor.length, 4);
  const cpSum = candVendor.reduce((s, c) => s + c.outstanding, 0);
  const cpRes = await grp.createGroupDoc(tenantId, systemId, {
    docType: "COMBINED_PAYMENT", contactId: vendor.id, issueDate: TODAY, dueDate: iso(dayPlus(18)), note: "รวมจ่ายรอบสิ้นเดือน",
    childIds: [b1, b2, b3, b4], createdById: owner.id,
  });
  assert("G6.2 ออกใบรวมจ่ายสำเร็จ", cpRes.ok, cpRes.ok ? "" : cpRes.reason);
  if (!cpRes.ok) throw new Error("G6 ล้ม: " + cpRes.reason);
  assert("G6.3 เลขที่ขึ้นต้น CP-", cpRes.docNo.startsWith("CP-"), cpRes.docNo);
  const cpDoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: cpRes.id } });
  eq("G6.4 ทิศทางเอกสาร = ซื้อ (IN)", cpDoc.direction, "IN");
  eq("G6.5 สถานะ = รอชำระเงิน", cpDoc.status, "AWAITING_PAYMENT");
  eqAmt("G6.6 ยอดกลุ่ม = ผลรวมยอดค้างของบิลลูก", cpDoc.grandTotal, cpSum);
  eqAmt("G6.7 ยอดกลุ่ม = ฿7,490.00 (1,070+1,605+2,675+2,140)", cpDoc.grandTotal, 749_000);
  eq("G6.8 ใบรวมจ่ายไม่ลง JV ตอนออกเอกสาร", (await entriesOf(systemId, cpRes.id)).length, 0);
  const cpRels = await prisma.accountDocumentRelation.findMany({ where: { systemId, fromId: cpRes.id, type: "PAY_GROUP" } });
  eq("G6.9 เกิด relation PAY_GROUP 4 เส้น", cpRels.length, 4);
  const cpPanel = await grp.groupPanelData(tenantId, systemId, cpRes.id);
  eq("G6.10 ป้ายปุ่มฝั่งจ่าย = 'บันทึกจ่าย'", cpPanel?.texts.payAction, "บันทึกจ่าย");
  eq("G6.11 แผงเห็นบิลลูก 4 ใบ", cpPanel?.children.length, 4);

  // หัก ณ ที่จ่าย 3% ของบิลบริการ 200,000 (ฐานก่อน VAT) = 6,000.00
  const wht40_8 = 6_000; // 3% ของฐาน ฿2,000.00
  const cpPay = await grp.recordGroupPayment(
    tenantId, systemId, cpRes.id,
    {
      paidAt: TODAY, financeAccountId: bank.id, tieOffSatang: cpSum, note: "จ่ายรวม", feeSatang: 0,
      wht: [{ childDocId: b4, incomeType: "M40_8", rateBp: 300, amountSatang: wht40_8 }],
      cheque: null,
    },
    { userId: owner.id, clientKey: "qc-cp-full" },
  );
  assert("G6.12 บันทึกจ่ายรวมสำเร็จ", cpPay.ok, cpPay.ok ? "" : cpPay.reason);
  if (!cpPay.ok) throw new Error("G6 ล้ม: " + cpPay.reason);
  eq("G6.13 กระจายลงบิลลูก 4 ใบ", cpPay.recorded, 4);
  eqAmt("G6.14 ยอดคงค้างหลังจ่าย = 0", cpPay.outstanding, 0);
  const billsAfter = await prisma.accountDocument.findMany({ where: { id: { in: [b1, b2, b3, b4] } } });
  assert("G6.15 บิลลูกทุกใบ = ชำระแล้ว", billsAfter.every((d) => d.status === "PAID"), billsAfter.map((d) => `${d.docNo}:${d.status}`).join(","));
  eq("G6.16 ใบรวมจ่าย = ชำระแล้ว", (await prisma.accountDocument.findFirstOrThrow({ where: { id: cpRes.id } })).status, "PAID");

  const billPays = await prisma.accountDocumentPayment.findMany({ where: { systemId, documentId: { in: [b1, b2, b3, b4] } } });
  eq("G6.17 เกิดรายการจ่ายที่บิลลูก 4 รายการ", billPays.length, 4);
  const billPayEntries = (await Promise.all(billPays.map((p) => entriesOf(systemId, p.id, "AccountDocumentPayment")))).flat();
  eq("G6.18 เกิดสมุดรายวันของการจ่าย 4 ชุด", billPayEntries.length, 4);
  assert("G6.19 ทุกชุดสมดุล", balanced(billPayEntries));
  eqAmt("G6.20 Dr 2100 เจ้าหนี้รวม = ยอดกลุ่ม", drCode(billPayEntries, "2100"), cpSum);
  eqAmt("G6.21 Cr 2130 ภาษีหัก ณ ที่จ่ายค้างนำส่ง = ฿60.00", crCode(billPayEntries, "2130"), wht40_8);
  eqAmt("G6.22 Cr ธนาคาร = ยอดกลุ่ม − ภาษีที่หักไว้", crOf(billPayEntries, bankLedger), cpSum - wht40_8);
  const wtoCerts = await prisma.accountDocument.findMany({ where: { systemId, docType: "WHT_CERT" } });
  eq("G6.23 ออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) 1 ใบ (เฉพาะบิลบริการ)", wtoCerts.length, 1);
  eq("G6.24 50 ทวิ ผูกกับบิลบริการใบที่ถูกหักจริง", wtoCerts[0]?.sourceDocId, b4);
  eqAmt("G6.25 ยอดภาษีบน 50 ทวิ = ฿60.00", wtoCerts[0]?.whtAmount ?? -1, wht40_8);
  const b4Pay = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: b4 } });
  eqAmt("G6.26 เงินจ่ายจริงของบิลบริการ = ยอดค้าง − ภาษี", b4Pay.amount, 214_000 - wht40_8);
  eqAmt("G6.27 บิลอื่นไม่ถูกหักภาษี", (await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: b1 } })).whtAmountSatang, 0);

  const cpBadWht = await grp.recordGroupPayment(
    tenantId, systemId, cpRes.id,
    { paidAt: TODAY, financeAccountId: bank.id, tieOffSatang: 1000, note: "", feeSatang: 0, wht: [], cheque: null },
    { userId: owner.id, clientKey: "qc-cp-closed" },
  );
  assert("G6.28 จ่ายซ้ำหลังปิดกลุ่มแล้ว = ถูกปฏิเสธ", !cpBadWht.ok, cpBadWht.ok ? "ผ่านไปได้" : cpBadWht.reason);

  // ═════════ G7 — ยกเลิกการชำระของกลุ่ม ═════════
  console.log("\nG7 ยกเลิกการชำระของกลุ่ม = กลับรายการใบลูกทุกใบ:");
  const cpPanelAfter = await grp.groupPanelData(tenantId, systemId, cpRes.id);
  eq("G7.1 ประวัติการชำระของกลุ่มรวมเป็น 1 ครั้ง", cpPanelAfter?.batches.length, 1);
  eq("G7.2 ครั้งนั้นกระจายไป 4 ใบ", cpPanelAfter?.batches[0].children.length, 4);
  const batchKey = cpPanelAfter!.batches[0].batchKey;
  const voidRes = await grp.voidGroupPayment(tenantId, systemId, cpRes.id, batchKey, "โอนผิดบัญชี");
  assert("G7.3 ยกเลิกการชำระของกลุ่มสำเร็จ", voidRes.ok, voidRes.ok ? "" : voidRes.reason);
  eq("G7.4 ยกเลิกรายการของใบลูกครบ 4 รายการ", voidRes.ok ? voidRes.voided : -1, 4);
  const billsVoided = await prisma.accountDocument.findMany({ where: { id: { in: [b1, b2, b3, b4] } } });
  assert("G7.5 บิลลูกถอยกลับเป็นรอชำระทุกใบ", billsVoided.every((d) => d.status === "AWAITING_PAYMENT"), billsVoided.map((d) => `${d.docNo}:${d.status}`).join(","));
  assert("G7.6 ยอดที่ชำระของบิลลูกกลับเป็น 0", billsVoided.every((d) => d.paidTotal === 0));
  const cpVoided = await prisma.accountDocument.findFirstOrThrow({ where: { id: cpRes.id } });
  eq("G7.7 ใบรวมจ่ายถอยกลับเป็น รอชำระ", cpVoided.status, "AWAITING_PAYMENT");
  eqAmt("G7.8 ความคืบหน้าของกลุ่มกลับเป็น 0", cpVoided.paidTotal, 0);
  const voidedEntries = (await Promise.all(billPays.map((p) => entriesOf(systemId, p.id, "AccountDocumentPayment")))).flat();
  eq("G7.9 มี JV 8 ชุด (ต้นฉบับ 4 + กลับรายการ 4)", voidedEntries.length, 8);
  eqAmt("G7.10 เจ้าหนี้ 2100 สุทธิกลับเป็น 0", drCode(voidedEntries, "2100") - crCode(voidedEntries, "2100"), 0);
  eqAmt("G7.11 เงินในธนาคารสุทธิกลับเป็น 0", crOf(voidedEntries, bankLedger) - drOf(voidedEntries, bankLedger), 0);
  eq("G7.12 หนังสือรับรองหัก ณ ที่จ่ายถูกยกเลิกตาม", (await prisma.accountDocument.findFirstOrThrow({ where: { id: wtoCerts[0].id } })).status, "VOIDED");
  const rePay = await grp.recordGroupPayment(
    tenantId, systemId, cpRes.id,
    { paidAt: TODAY, financeAccountId: bank.id, tieOffSatang: cpSum, note: "จ่ายใหม่", feeSatang: 0, wht: [], cheque: null },
    { userId: owner.id, clientKey: "qc-cp-again" },
  );
  assert("G7.13 จ่ายใหม่หลังยกเลิกได้ (ไม่ถูก idempotency กลืน)", rePay.ok, rePay.ok ? "" : rePay.reason);
  eq("G7.14 ใบรวมจ่ายกลับเป็นชำระแล้วอีกครั้ง", (await prisma.accountDocument.findFirstOrThrow({ where: { id: cpRes.id } })).status, "PAID");

  // ═════════ G8 — idempotency ═════════
  console.log("\nG8 กันบันทึกซ้ำ (idempotency):");
  const iIv1 = await mkInvoice(custA.id, 50_000, 5);
  const iIv2 = await mkInvoice(custA.id, 70_000, 6);
  const bnIdem = await grp.createGroupDoc(tenantId, systemId, {
    docType: "BILLING_NOTE", contactId: custA.id, issueDate: TODAY, dueDate: null, note: null,
    childIds: [iIv1, iIv2], createdById: owner.id,
  });
  assert("G8.1 เตรียมใบวางบิลสำหรับทดสอบสำเร็จ", bnIdem.ok, bnIdem.ok ? "" : bnIdem.reason);
  if (!bnIdem.ok) throw new Error("G8 ล้ม");
  const idemDraft = { paidAt: TODAY, financeAccountId: bank.id, tieOffSatang: bnIdem.total, note: "โอน", feeSatang: 0, wht: [], cheque: null };
  const k1 = await grp.recordGroupPayment(tenantId, systemId, bnIdem.id, idemDraft, { userId: owner.id, clientKey: "qc-idem" });
  const k2 = await grp.recordGroupPayment(tenantId, systemId, bnIdem.id, idemDraft, { userId: owner.id, clientKey: "qc-idem" });
  assert("G8.2 ยิงครั้งแรกสำเร็จ", k1.ok, k1.ok ? "" : k1.reason);
  assert("G8.3 ยิงซ้ำด้วยคีย์เดิมไม่ error (คืนผลเดิม)", k2.ok, k2.ok ? "" : k2.reason);
  eq("G8.4 รายการชำระของใบลูกยังมี 2 รายการเท่าเดิม", await prisma.accountDocumentPayment.count({ where: { systemId, documentId: { in: [iIv1, iIv2] } } }), 2);
  const idemPays = await prisma.accountDocumentPayment.findMany({ where: { systemId, documentId: { in: [iIv1, iIv2] } } });
  eq("G8.5 มี JV ชุดเดียวต่อใบลูก (ไม่โพสต์ซ้ำ)", (await Promise.all(idemPays.map((p) => entriesOf(systemId, p.id, "AccountDocumentPayment")))).flat().length, 2);
  eqAmt("G8.6 ยอดกลุ่มไม่ถูกนับซ้ำ", (await prisma.accountDocument.findFirstOrThrow({ where: { id: bnIdem.id } })).paidTotal, bnIdem.total);
  eq("G8.7 ประวัติของกลุ่มยังเป็น 1 ครั้ง", (await grp.groupPanelData(tenantId, systemId, bnIdem.id))?.batches.length, 1);

  // ═════════ G9 — สิทธิ์ ═════════
  console.log("\nG9 สิทธิ์:");
  const authStaff = { user: { id: staff.id }, active: mStaff } as never;
  const denied = (action: string) => {
    try {
      assertAccountCan(authStaff, action);
      return false;
    } catch {
      return true;
    }
  };
  assert("G9.1 พนักงานที่ไม่มีสิทธิ์ 'บันทึกรับ/จ่ายเงิน' ถูกปฏิเสธ", denied("account.payment.record"));
  assert("G9.2 พนักงานที่ไม่มีสิทธิ์ 'ยกเลิกการชำระ' ถูกปฏิเสธ", denied("account.payment.void"));
  assert("G9.3 พนักงานที่ไม่มีสิทธิ์ 'สร้างเอกสาร' ถูกปฏิเสธ (ฟอร์มกลุ่ม)", denied("account.doc.create"));
  assert("G9.4 positive control: สิทธิ์ที่มีจริงต้องผ่าน", !denied("account.doc.view"));

  // ═════════ G10 — ขอบเขตข้ามระบบ ═════════
  console.log("\nG10 ขอบเขตข้ามระบบ/ข้ามร้าน:");
  eq("G10.1 อ่านแผงกลุ่มของระบบอื่นไม่ได้", await grp.groupPanelData(tenantId, otherSystemId, bnId), null);
  eq("G10.2 หาใบลูกของระบบอื่นไม่เจอ", (await grp.listGroupCandidates(tenantId, otherSystemId, "BILLING_NOTE", custA.id)).length, 0);
  const crossCreate = await grp.createGroupDoc(tenantId, otherSystemId, {
    docType: "BILLING_NOTE", contactId: custA.id, issueDate: TODAY, dueDate: null, note: null,
    childIds: [p3], createdById: owner.id,
  });
  assert("G10.3 สร้างกลุ่มจากใบของอีกระบบถูกปฏิเสธ", !crossCreate.ok, crossCreate.ok ? "ผ่านไปได้" : crossCreate.reason);
  const crossPay = await grp.recordGroupPayment(
    tenantId, otherSystemId, bn2.id,
    { paidAt: TODAY, financeAccountId: bank.id, tieOffSatang: 100, note: "", feeSatang: 0, wht: [], cheque: null },
    { userId: owner.id, clientKey: "qc-cross" },
  );
  assert("G10.4 บันทึกชำระกลุ่มข้ามระบบถูกปฏิเสธ", !crossPay.ok && crossPay.reason === "ไม่พบเอกสาร", crossPay.ok ? "ผ่านไปได้" : crossPay.reason);
  const badChannel = await grp.recordGroupPayment(
    tenantId, systemId, bn2.id,
    { paidAt: TODAY, financeAccountId: "ไม่มีจริง", tieOffSatang: 100, note: "", feeSatang: 0, wht: [], cheque: null },
    { userId: owner.id, clientKey: "qc-badchannel" },
  );
  assert("G10.5 ช่องทางการเงินที่ไม่ใช่ของระบบนี้ถูกปฏิเสธ", !badChannel.ok && badChannel.reason.includes("ช่องทาง"), badChannel.ok ? "ผ่านไปได้" : badChannel.reason);
  const badWhtTarget = await grp.recordGroupPayment(
    tenantId, systemId, bn2.id,
    { paidAt: TODAY, financeAccountId: bank.id, tieOffSatang: 10_000, note: "", feeSatang: 0, wht: [{ childDocId: iv1, incomeType: "M40_8", rateBp: 300, amountSatang: 300 }], cheque: null },
    { userId: owner.id, clientKey: "qc-badwht" },
  );
  assert("G10.6 ผูกภาษีหัก ณ ที่จ่ายกับใบที่ไม่ได้รับจัดสรร = ถูกปฏิเสธ", !badWhtTarget.ok, badWhtTarget.ok ? "ผ่านไปได้" : badWhtTarget.reason);
  const viaOldPanel = await (await import("@/lib/modules/account/payment")).recordPayments(
    tenantId, systemId, bn2.id,
    [{ paidAt: TODAY, financeAccountId: bank.id, amountSatang: 1000, note: "", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }],
    { userId: owner.id, keyBase: "qc-wrongpanel" },
  );
  assert("G10.7 รับชำระใบวางบิลผ่านแผงเอกสารเดี่ยว = ถูกปฏิเสธพร้อมบอกทางที่ถูก", !viaOldPanel.ok && viaOldPanel.reason.includes("ใบวางบิล"), viaOldPanel.ok ? "ผ่านไปได้" : viaOldPanel.reason);

  // ═════════ G13 — ยกเลิกเอกสารกลุ่ม → ใบลูกกลับมาว่าง (วิธี "แก้กลุ่ม" ของรอบนี้) ═════════
  console.log("\nG13 ยกเลิกเอกสารกลุ่ม:");
  const c1 = await mkInvoice(custB.id, 60_000, 11);
  const c2 = await mkInvoice(custB.id, 90_000, 13);
  const bnCancel = await grp.createGroupDoc(tenantId, systemId, {
    docType: "BILLING_NOTE", contactId: custB.id, issueDate: TODAY, dueDate: null, note: null,
    childIds: [c1, c2], createdById: owner.id,
  });
  assert("G13.1 ออกใบวางบิลสำหรับทดสอบการยกเลิกสำเร็จ", bnCancel.ok, bnCancel.ok ? "" : bnCancel.reason);
  if (!bnCancel.ok) throw new Error("G13 ล้ม");
  const blockedWhileGrouped = await grp.listGroupCandidates(tenantId, systemId, "BILLING_NOTE", custB.id);
  assert("G13.2 ก่อนยกเลิก: ใบลูกทั้ง 2 ติ๊กไม่ได้", blockedWhileGrouped.filter((r) => [c1, c2].includes(r.id)).every((r) => !r.eligible));
  const cancelled = await acc.voidDocument(tenantId, systemId, bnCancel.id, "ออกผิดรอบ");
  assert("G13.3 ยกเลิกใบวางบิลสำเร็จ (ไม่มี JV ให้กลับ ก็ไม่ error)", cancelled.ok, cancelled.ok ? "" : cancelled.reason);
  eq("G13.4 ใบวางบิลเป็นสถานะยกเลิก", (await prisma.accountDocument.findFirstOrThrow({ where: { id: bnCancel.id } })).status, "VOIDED");
  eq("G13.5 ยังไม่มี JV เกิดจากการยกเลิกกลุ่ม", (await entriesOf(systemId, bnCancel.id)).length, 0);
  const freedAfterCancel = await grp.listGroupCandidates(tenantId, systemId, "BILLING_NOTE", custB.id);
  assert(
    "G13.6 ใบลูกกลับมาติ๊กได้อีกครั้ง (กลุ่มที่ยกเลิกแล้วไม่จองใบลูก)",
    freedAfterCancel.filter((r) => [c1, c2].includes(r.id)).every((r) => r.eligible),
    freedAfterCancel.filter((r) => [c1, c2].includes(r.id)).map((r) => `${r.docNo}:${r.eligible}`).join(","),
  );
  const bnRedo = await grp.createGroupDoc(tenantId, systemId, {
    docType: "BILLING_NOTE", contactId: custB.id, issueDate: TODAY, dueDate: null, note: null,
    childIds: [c1, c2], createdById: owner.id,
  });
  assert("G13.7 ออกใบวางบิลใหม่ด้วยใบลูกชุดเดิมได้", bnRedo.ok, bnRedo.ok ? "" : bnRedo.reason);
  assert("G13.8 ใบลูกไม่มีชิปชี้ไปกลุ่มที่ยกเลิกแล้ว", (await grp.groupChipOfChild(tenantId, systemId, c1))?.groupId === (bnRedo.ok ? bnRedo.id : ""));

  // ═════════ G12 — ตรวจรวมทั้ง tenant ═════════
  console.log("\nG12 ตรวจรวมทั้ง tenant:");
  const allEntries = (await prisma.accountJournalEntry.findMany({
    where: { tenantId },
    include: { lines: true },
  })) as { id: string; lines: { debit: number; credit: number }[] }[];
  const unbalanced = allEntries.filter(
    (e) => e.lines.reduce((s, l) => s + l.debit, 0) !== e.lines.reduce((s, l) => s + l.credit, 0),
  );
  eq("G12.1 ทุกชุดสมุดรายวันของ tenant นี้สมดุล", unbalanced.length, 0);
  const suspense = await prisma.accountJournalLine.findMany({ where: { tenantId, account: { code: "9999" } } });
  eq("G12.2 ไม่มีรายการตกบัญชีพัก 9999", suspense.length, 0);
  const groupJv = await prisma.accountJournalEntry.count({
    where: { tenantId, refType: "AccountDocument", refId: { in: [bnId, bn2.id, cpRes.id, bnIdem.id, bnCancel.id] } },
  });
  eq("G12.3 เอกสารกลุ่มทุกใบไม่มี JV ของตัวเองเลย", groupJv, 0);
} finally {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.log(`  ⚠ cleanup: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  };
  if (tenantId) {
    await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountJournalEntry.updateMany({ where: { tenantId }, data: { reversalOfId: null } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentPayment.updateMany({ where: { tenantId }, data: { chequeId: null, whtCertDocId: null } }));
    await del(() => prisma.accountCheque.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.updateMany({ where: { tenantId }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await del(() => prisma.accountAttachment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountFinance.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountLedger.updateMany({ where: { tenantId }, data: { parentId: null } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountPeriod.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountProduct.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountContact.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountSettings.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystemUnit.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId } }));
    await del(() => prisma.auditLog.deleteMany({ where: { tenantId } }));
    await del(() => prisma.membership.deleteMany({ where: { tenantId } }));
    await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
  }
  for (const uid of userIds) await del(() => prisma.user.delete({ where: { id: uid } }));
  console.log("\n[cleanup] ลบ test data เรียบร้อย");
}

console.log(`\n===== สรุป WO 1.7: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 1.7 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
process.exit(findings.length === 0 ? 0 : 1);

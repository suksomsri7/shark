// QC ACC T1.9 — ร้านจด VAT ขายแบบไม่มี VAT (คำเตือน+ยืนยัน · รายงานรายได้ไม่มี VAT) · รายงานภาษีอ่านตาม mapping · JV มือแตะบัญชีภาษี = รายการปรับปรุงมือ
// ใบงาน ledger/ACCOUNT-TAX-PLAN.md T1.9 (ปิด E13 · E7) · design note ledger/wo-notes/T1.9.md
// ร้านทดสอบ 2 ร้าน (สร้าง/ลบเอง): A = ผังปกติ · B = ย้าย mapping VAT_OUTPUT → 2291 · VAT_INPUT → 1191
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-novat-mapping.mts
//
// เฉลยมือ (สตางค์) — ทำชุดเดียวกันทั้งสองร้าน · M = 2026-04 · N = 2026-05:
//   M ใบเสร็จ (มี VAT): 7% 1,000,000 (VAT 70,000) · 0% 200,000 · ยกเว้น 300,000
//   M ใบแจ้งหนี้ไม่คิด VAT: บรรทัด 100,000 (ไม่ระบุเหตุผล) + 40,000 (ยกเว้น) → คำเตือน SALE_WITHOUT_VAT (1 บรรทัด · 1,000.00) ต้องยืนยันบนจอ/REST
//   M บิล POS (ใบกำกับอย่างย่อ ฟิกซ์เจอร์) บรรทัดไม่มี VAT 25,000 → ไม่คิด VAT (POS)
//   N ใบเสร็จไม่คิด VAT 60,000 ออกจากงานเบื้องหลัง (ไม่มีบริบทการยืนยัน) → ไม่บล็อก · ขึ้นรายงาน
//   M ค่าใช้จ่ายใช้สิทธิ์ภาษีซื้อ 400,000 (VAT 28,000)
//   M JV มือ: Dr ภาษีขาย 3,000 / Cr ธนาคาร · Dr ภาษีซื้อ 2,000 / Cr ธนาคาร
//   ⇒ ภาษีขาย M = 70,000 − 3,000 = 67,000 · ภาษีซื้อ = 28,000 + 2,000 = 30,000 · รายการปรับปรุงมือ: ขาย −3,000 (1) · ซื้อ +2,000 (1)
//   ⇒ รายได้ไม่มี VAT M..N: 0% 200,000 · ยกเว้น 340,000 · ไม่คิด VAT 185,000 (M 125,000 · N 60,000) · รวม 725,000 · 4 ใบ
//   ร้าน B ต้องได้ตัวเลขชุดเดียวกันทุกตัว (อ่านตาม mapping) · บัญชี 2200 ของ B เคลื่อนไหว 0
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-novat-mapping");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 700)}`}`);
};
const eq = (id: string, n: string, act: unknown, exp: unknown, sev: Sev = "CRITICAL") => chk(id, n, JSON.stringify(act) === JSON.stringify(exp), exp, act, sev);

const KEEP = process.env.KEEP === "1";
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const acc: Any = await import("@/lib/modules/account/service" as string);
const exp: Any = await import("@/lib/modules/account/expense" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const coa: Any = await import("@/lib/modules/account/coa" as string);
const fin: Any = await import("@/lib/modules/account/finance" as string);
const REP: Any = await import("@/lib/modules/account/reports" as string);
const JV: Any = await import("@/lib/modules/account/journal-v2" as string);
const LG: Any = await import("@/lib/modules/account/legal-gate" as string);
const NV: Any = await import("@/lib/modules/account/revenue-novat" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);
const ak: Any = await import("@/lib/api-keys/service" as string);
const scopes: Any = await import("@/lib/api-keys/scopes" as string);
const route: Any = await import("@/app/api/v1/account/[...path]/route" as string);

const M = "2026-04";
const N = "2026-05";
const day = (ym: string, d: number) => new Date(`${ym}-${String(d).padStart(2, "0")}T10:00:00+07:00`);
const TENANT = "QC T1.9 ไม่มี VAT";

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

// ═══ N0 pure ═══
console.log("\n── N0 ตัวตัดสินบริสุทธิ์ ──");
{
  const lines = [{ vatRateBp: 0, qty: 1, unitPrice: 100_000 }, { vatRateBp: -1, qty: 1, unitPrice: 40_000 }];
  const w = LG.saleWithoutVatWarnings({ docType: "INVOICE", vatMode: "NONE", lines }, { vatRegistered: true });
  chk("N0.1", "ใบไม่คิด VAT ในสมุดจด VAT → SALE_WITHOUT_VAT_REGISTERED (1 บรรทัดไม่ระบุเหตุผล · 1,000.00) · ต้องยืนยัน · [V] อ้าง ม.80/1 ม.81 + skill §1", w.length === 1 && w[0].code === "SALE_WITHOUT_VAT_REGISTERED" && w[0].ack === true && w[0].tag === "V" && /ม\.80\/1/.test(w[0].citation) && /§1/.test(w[0].citation) && w[0].messageTh.includes("1,000.00") && w[0].messageTh.includes("1 บรรทัด"), "1 คำเตือน", w);
  eq("N0.2", "ไม่เตือน: สมุดไม่จด VAT · ใบมี VAT ที่มีบรรทัด 0% · ใบยกเว้นทั้งใบ · ใบเสร็จที่ออกจากใบแจ้งหนี้ · ใบเสนอราคา", [
    LG.saleWithoutVatWarnings({ docType: "INVOICE", vatMode: "NONE", lines }, { vatRegistered: false }).length,
    LG.saleWithoutVatWarnings({ docType: "RECEIPT", vatMode: "EXCLUDE", lines: [{ vatRateBp: 0, qty: 1, unitPrice: 5 }] }, { vatRegistered: true }).length,
    LG.saleWithoutVatWarnings({ docType: "INVOICE", vatMode: "NONE", lines: [{ vatRateBp: -1, qty: 1, unitPrice: 5 }] }, { vatRegistered: true }).length,
    LG.saleWithoutVatWarnings({ docType: "RECEIPT", vatMode: "NONE", sourceDocId: "x", lines }, { vatRegistered: true }).length,
    LG.saleWithoutVatWarnings({ docType: "QUOTATION", vatMode: "NONE", lines }, { vatRegistered: true }).length,
  ], [0, 0, 0, 0, 0]);
  eq("N0.3", "หมวดของบรรทัด: ยกเว้น · 0% · ไม่คิด VAT (ใบ NONE / POS 0%) · มี VAT = ไม่เข้ารายงาน", [
    NV.novatCategoryOf("INVOICE", "EXCLUDE", -1), NV.novatCategoryOf("INVOICE", "EXCLUDE", 0), NV.novatCategoryOf("INVOICE", "NONE", 0), NV.novatCategoryOf("TAX_INVOICE_ABB", "INCLUDE", 0), NV.novatCategoryOf("INVOICE", "EXCLUDE", 700),
  ], ["EXEMPT", "ZERO_RATED", "UNTAXED", "UNTAXED", null]);
  const m = W.LEGAL_WARNINGS.MANUAL_JV_VAT_ACCOUNT;
  chk("N0.4", "MANUAL_JV_VAT_ACCOUNT: แจ้งให้ทราบ (ไม่ต้องยืนยัน · ไม่บล็อก) · อ้าง ม.87 + §18", m?.ack === false && /ม\.87/.test(m.citation) && /§18/.test(m.citation), "ack=false", m);
}

let tid = "";
type Shop = { key: "A" | "B"; SYS: string; ctx: Any; out: Any; inp: Any; bankLedger: string; owner: Any; key2: string };
const shops: Shop[] = [];
try {
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT }, select: { id: true } })) await purgeTenant(old.id);
  tid = (await prisma.tenant.create({ data: { name: TENANT, slug: `qc-t19-${Date.now().toString(36)}`, status: "ACTIVE", enabledModules: ["ACCOUNT"] } })).id;
  const owner = await prisma.user.create({ data: { email: `qc-t19-${Date.now()}@qc.local`, name: "เจ้าของ T1.9" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });

  for (const key of ["A", "B"] as const) {
    console.log(`\n── ร้าน ${key}${key === "B" ? " (ย้าย mapping ภาษี)" : ""} ──`);
    const SYS = (await sysSvc.createSystem(tid, "ACCOUNT", `บัญชี T1.9 ${key}`)).id;
    const ctx = { tenantId: tid, systemId: SYS };
    await acc.saveSettings(tid, SYS, { orgName: `ร้าน T1.9 ${key}`, vatRegistered: true, vatRateBp: 700, taxId: "0105561000019", branchCode: "00000" });
    await gl.ensureAccounting(ctx);
    if (key === "B") {
      const o = await coa.createLedger(ctx, { code: "2291", name: "ภาษีขาย (บัญชีที่ร้านตั้งเอง)", type: "LIABILITY" });
      const i = await coa.createLedger(ctx, { code: "1191", name: "ภาษีซื้อ (บัญชีที่ร้านตั้งเอง)", type: "ASSET" });
      await coa.setMapping(ctx, "VAT_OUTPUT", o.id);
      await coa.setMapping(ctx, "VAT_INPUT", i.id);
    }
    const bankRes = await fin.createFinanceAccount({ tenantId: tid, systemId: SYS, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
    const bank = await prisma.accountFinance.findFirstOrThrow({ where: { id: bankRes.id }, select: { ledgerAccountId: true } });
    const maps = await prisma.accountMapping.findMany({ where: { systemId: SYS, key: { in: ["VAT_OUTPUT", "VAT_INPUT"] } }, include: { account: { select: { id: true, code: true } } } });
    const out = maps.find((m: Any) => m.key === "VAT_OUTPUT")!.account;
    const inp = maps.find((m: Any) => m.key === "VAT_INPUT")!.account;
    chk(`N1.${key}`, `ร้าน ${key}: บัญชีภาษีตาม mapping`, key === "A" ? out.code === "2200" && inp.code === "1150" : out.code === "2291" && inp.code === "1191", key === "A" ? "2200/1150" : "2291/1191", [out.code, inp.code]);
    const cust = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า T1.9 ${key}`, taxId: "0105561999919", branchCode: "00000" });
    const vend = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "VENDOR", legalType: "COMPANY", name: `ผู้ขาย T1.9 ${key}`, taxId: "0105561999929", branchCode: "00000" });
    const expAccts = await exp.listExpenseAccounts(SYS);
    const expLedger = expAccts.find((a: Any) => a.code === "6900") ?? expAccts[0];
    const screen = (codes: string[], fn: () => Promise<Any>) => LG.withScreenLegal(LG.screenAck(codes, owner.id), fn);

    // M ใบเสร็จมี VAT + 0% + ยกเว้น
    const r1 = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: cust.id, issueDate: day(M, 5), vatMode: "EXCLUDE", lines: [
      { description: "สินค้า 7%", qty: 1, unitPrice: 1_000_000, vatRateBp: 700 },
      { description: "ส่งออก 0%", qty: 1, unitPrice: 200_000, vatRateBp: 0 },
      { description: "รายการยกเว้น", qty: 1, unitPrice: 300_000, vatRateBp: -1 },
    ], createdById: owner.id });
    const r1i = await screen([], () => acc.issueDocument(tid, SYS, r1.id, { ack: LG.screenAck([], owner.id) }));
    chk(`N2.${key}.1`, "ใบมี VAT ที่มีบรรทัด 0%/ยกเว้น ออกได้โดยไม่มีคำเตือนขายไม่มี VAT", r1i.ok, "ok", r1i);
    // M ใบแจ้งหนี้ไม่คิด VAT
    const iv = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "INVOICE", contactId: cust.id, issueDate: day(M, 10), vatMode: "NONE", lines: [
      { description: "ค่าบริการ (ไม่ได้คิด VAT)", qty: 1, unitPrice: 100_000, vatRateBp: 0 },
      { description: "ค่าเช่าห้อง (ยกเว้น)", qty: 1, unitPrice: 40_000, vatRateBp: -1 },
    ], createdById: owner.id });
    const iva = await screen([], () => acc.issueDocument(tid, SYS, iv.id, { ack: LG.screenAck([], owner.id) }));
    const ivDoc = await prisma.accountDocument.findUniqueOrThrow({ where: { id: iv.id }, select: { status: true } });
    chk(`N2.${key}.2`, "จอ: ไม่ติ๊ก → คำเตือน SALE_WITHOUT_VAT_REGISTERED (ไม่ใช่ error · ยังเป็นร่าง)", !iva.ok && iva.legal?.warnings?.some((w: Any) => w.code === "SALE_WITHOUT_VAT_REGISTERED") && ivDoc.status === "DRAFT", "legal/DRAFT", { iva, ivDoc });
    const ivb = await screen(["SALE_WITHOUT_VAT_REGISTERED"], () => acc.issueDocument(tid, SYS, iv.id, { ack: LG.screenAck(["SALE_WITHOUT_VAT_REGISTERED"], owner.id) }));
    const ackRow = await prisma.auditLog.findFirst({ where: { tenantId: tid, action: "legal.warning.ack", targetType: "AccountDocument", targetId: iv.id } });
    chk(`N2.${key}.3`, "ติ๊กแล้ว = ออกได้ + บันทึกผู้ยืนยัน (ใคร/ช่องทาง/รหัส)", ivb.ok && ackRow?.actorId === owner.id && ackRow?.after?.codes?.includes("SALE_WITHOUT_VAT_REGISTERED") && ackRow?.after?.via === "screen", "ok+ack", { ivb, a: ackRow?.after });
    // N ใบเสร็จไม่คิด VAT จากงานเบื้องหลัง
    const bg = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: cust.id, issueDate: day(N, 3), vatMode: "NONE", lines: [{ description: "ขายไม่คิด VAT (ระบบอื่น)", qty: 1, unitPrice: 60_000, vatRateBp: 0 }], createdById: owner.id });
    const bgi = await acc.issueDocument(tid, SYS, bg.id);
    chk(`N2.${key}.4`, "งานเบื้องหลัง (ไม่มีบริบทการยืนยัน) → ไม่บล็อก", bgi.ok, "ok", bgi);
    // M บิล POS (ฟิกซ์เจอร์ใบกำกับอย่างย่อ ที่บรรทัดไม่มี VAT)
    await prisma.accountDocument.create({ data: {
      tenantId: tid, systemId: SYS, docType: "TAX_INVOICE_ABB", direction: "OUT", status: "PAID", docNo: `POS-${key}-0001`, issueDate: day(M, 12), vatMode: "INCLUDE",
      refType: "PosSale", refId: `pos-${key}-1`, subTotal: 25_000, vatAmount: 0, grandTotal: 25_000, paidTotal: 25_000,
      lines: { create: [{ tenantId: tid, systemId: SYS, description: "น้ำดื่ม (POS)", qty: 1, unitPrice: 25_000, vatRateBp: 0, amount: 25_000 }] },
    } });
    // M ค่าใช้จ่ายใช้สิทธิ์ภาษีซื้อ
    const ex = await exp.createExpenseDoc({ tenantId: tid, systemId: SYS, docType: "EXPENSE", contactId: vend.id, issueDate: day(M, 15), vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: "ซื้อของ", qty: 1, unitPrice: 400_000, vatRateBp: 700, accountId: expLedger.id }], createdById: owner.id });
    const exi = await exp.issueExpenseDoc(tid, SYS, ex.id);
    if (!exi.ok) throw new Error("EX: " + exi.reason);
    // M JV มือ 2 ใบ
    const jv1 = await JV.createManualEntry(ctx, { dateKey: `${M}-20`, memo: "ปรับภาษีขาย", postedById: owner.id, lines: [{ accountId: out.id, debit: 3_000, credit: 0 }, { accountId: bank.ledgerAccountId, debit: 0, credit: 3_000 }] });
    const jv2 = await JV.createManualEntry(ctx, { dateKey: `${M}-21`, memo: "ปรับภาษีซื้อ", postedById: owner.id, lines: [{ accountId: inp.id, debit: 2_000, credit: 0 }, { accountId: bank.ledgerAccountId, debit: 0, credit: 2_000 }] });
    chk(`N3.${key}.1`, "JV มือแตะบัญชีภาษี → บันทึกได้ (ไม่บล็อก) + คำเตือน MANUAL_JV_VAT_ACCOUNT ระบุรหัสบัญชีตาม mapping", jv1.ok && jv2.ok && jv1.warnings?.[0]?.code === "MANUAL_JV_VAT_ACCOUNT" && jv1.warnings[0].messageTh.includes(out.code) && jv2.warnings?.[0]?.messageTh.includes(inp.code), "ok+warn", { jv1, jv2 });
    const jv3 = await JV.createManualEntry(ctx, { dateKey: `${M}-22`, memo: "โอนเงิน", postedById: owner.id, lines: [{ accountId: expLedger.id, debit: 1_000, credit: 0 }, { accountId: bank.ledgerAccountId, debit: 0, credit: 1_000 }] });
    chk(`N3.${key}.2`, "JV ที่ไม่แตะบัญชีภาษี → ไม่มีคำเตือน", jv3.ok && jv3.warnings.length === 0, "0", jv3);
    shops.push({ key, SYS, ctx, out, inp, bankLedger: bank.ledgerAccountId, owner, key2: "" });
  }

  // ═══ N4 รายงาน (เทียบเฉลยมือ + สองร้านต้องเท่ากัน) ═══
  console.log("\n── N4 รายงานภาษี / ภ.พ.30 / รายได้ไม่มี VAT ──");
  const facts: Any[] = [];
  for (const s of shops) {
    const pp = await REP.pp30(s.ctx, M);
    const st = pp.salesTax;
    const recOut = pp.ret.reconcile.find((c: Any) => c.key === "VAT_OUTPUT");
    const recIn = pp.ret.reconcile.find((c: Any) => c.key === "VAT_INPUT");
    const nv = await NV.revenueWithoutVat(s.ctx, { from: M, to: N });
    const f = {
      outputVat: pp.ret.lines.outputVat,
      inputVat: pp.ret.lines.inputVat,
      salesTaxVat: st.total.vat,
      glCheck: st.checks.find((c: Any) => c.key === "GL_2200")?.ok,
      manualSales: [st.manualAdjustments.count, st.manualAdjustments.vat, st.rows.filter((r: Any) => r.manual).map((r: Any) => r.vat)],
      manualInput: pp.input.rows.filter((r: Any) => r.manual).map((r: Any) => r.vat),
      recon: [recOut?.manual, recOut?.manualCount, recIn?.manual, recIn?.manualCount, recOut?.ok, recIn?.ok],
      warnManual: pp.ret.warnings.some((w: Any) => w.code === "MANUAL_JV_VAT_ACCOUNT"),
      novat: [nv.totals.ZERO_RATED, nv.totals.EXEMPT, nv.totals.UNTAXED, nv.totals.total, nv.totals.docCount, nv.byMonth.map((m: Any) => m.UNTAXED)],
      posRow: nv.rows.filter((r: Any) => r.source === "POS").map((r: Any) => [r.category, r.amount]),
    };
    facts.push(f);
    eq(`N4.${s.key}.1`, `ร้าน ${s.key}: ภาษีขาย 67,000 · ภาษีซื้อ 30,000 · รายงานภาษีขาย 67,000 · ข้อตรวจ GL ผ่าน`, [f.outputVat, f.inputVat, f.salesTaxVat, f.glCheck], [67_000, 30_000, 67_000, true]);
    eq(`N4.${s.key}.2`, `ร้าน ${s.key}: รายงานภาษีขายแยก "รายการปรับปรุงมือ" 1 แถว −3,000 · รายงานภาษีซื้อแถวปรับปรุงมือ +2,000`, [f.manualSales, f.manualInput], [[1, -3_000, [-3_000]], [2_000]]);
    eq(`N4.${s.key}.3`, `ร้าน ${s.key}: กระทบยอด ภ.พ.30 แสดงส่วนปรับปรุงมือ (ขาย −3,000 ×1 · ซื้อ +2,000 ×1) · ยอดยังตรง · คำเตือน MANUAL_JV`, [f.recon, f.warnManual], [[-3_000, 1, 2_000, 1, true, true], true]);
    eq(`N4.${s.key}.4`, `ร้าน ${s.key}: รายได้ไม่มี VAT: 0% 200,000 · ยกเว้น 340,000 · ไม่คิด VAT 185,000 · รวม 725,000 · 4 ใบ · ไม่คิด VAT รายเดือน [125,000, 60,000] · POS 25,000`, [f.novat, f.posRow], [[200_000, 340_000, 185_000, 725_000, 4, [125_000, 60_000]], [["UNTAXED", 25_000]]]);
    const ledgerShown = st.outputLedger?.code;
    chk(`N4.${s.key}.5`, `ร้าน ${s.key}: หัวรายงาน/ข้อตรวจแสดงบัญชีตาม mapping (${s.out.code})`, ledgerShown === s.out.code && st.checks.find((c: Any) => c.key === "GL_2200")?.label.includes(s.out.code), s.out.code, { ledgerShown, label: st.checks[0]?.label });
  }
  eq("N4.6", "ร้านที่ย้าย mapping ได้ตัวเลขชุดเดียวกับร้านปกติทุกตัว", facts[1], facts[0]);
  const b = shops.find((s) => s.key === "B")!;
  const b2200 = await prisma.accountLedger.findFirst({ where: { systemId: b.SYS, code: "2200" }, select: { id: true } });
  const mv = b2200 ? await prisma.accountJournalLine.count({ where: { systemId: b.SYS, accountId: b2200.id } }) : 0;
  eq("N4.7", "ร้าน B: บัญชี 2200 ไม่มีรายการเลย (ระบบลงและอ่านตาม mapping ทั้งสองทาง)", mv, 0);

  // ═══ N5 REST ═══
  console.log("\n── N5 REST / เครื่องมือเลขา ──");
  const a = shops.find((s) => s.key === "A")!;
  const kW = await ak.createApiKey({ tenantId: tid }, "T19 write", { scopes: scopes.expandBundles(["accountant"]), systemId: a.SYS });
  const call = async (method: string, path: string, key: string, body?: unknown) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : { "idempotency-key": `t19-${Date.now()}-${Math.random().toString(16).slice(2)}` }) };
    let bd: string | undefined;
    if (body !== undefined) { bd = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body: bd });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, body: parsed };
  };
  const cust = await prisma.accountContact.findFirstOrThrow({ where: { systemId: a.SYS, kind: "CUSTOMER" } });
  const d = await acc.createDocument({ tenantId: tid, systemId: a.SYS, docType: "INVOICE", contactId: cust.id, issueDate: day(N, 8), vatMode: "NONE", lines: [{ description: "REST ไม่คิด VAT", qty: 1, unitPrice: 10_000, vatRateBp: 0 }], createdById: a.owner.id });
  const r1 = await call("POST", `/documents/${d.id}/issue`, kW.rawKey, {});
  chk("N5.1", "REST ออกใบไม่คิด VAT ไม่ส่ง acknowledge → 409 legal_ack_required [SALE_WITHOUT_VAT_REGISTERED]", r1.status === 409 && r1.body?.error?.warnings?.some((w: Any) => w.code === "SALE_WITHOUT_VAT_REGISTERED"), "409", { s: r1.status, e: r1.body?.error });
  const r2 = await call("POST", `/documents/${d.id}/issue`, kW.rawKey, { acknowledge: ["SALE_WITHOUT_VAT_REGISTERED"] });
  chk("N5.2", "ส่ง acknowledge → ออกได้", r2.status === 200, "200", { s: r2.status, e: r2.body?.error });
  const rr = await call("GET", `/reports/revenue-without-vat?from=${M}&to=${N}`, kW.rawKey);
  chk("N5.4", "GET /reports/revenue-without-vat: totals (สตางค์) ไม่คิด VAT 195,000 (185,000 + 10,000 ใบ REST) · months 2 · rows มีหมวด", rr.status === 200 && rr.body?.data?.totals?.untaxedSatang === 195_000 && rr.body.data.months.length === 2 && rr.body.data.rows.every((x: Any) => ["EXEMPT", "ZERO_RATED", "UNTAXED"].includes(x.category)), "200/195000", { s: rr.status, d: JSON.stringify(rr.body?.data?.totals ?? rr.body) });
  const jr = await call("POST", "/journal", kW.rawKey, { date: `${N}-25`, memo: "REST ปรับภาษีขาย", lines: [{ accountId: a.out.id, debitSatang: 100, creditSatang: 0 }, { accountId: a.bankLedger, debitSatang: 0, creditSatang: 100 }] });
  chk("N5.3", "REST journal.create แตะบัญชีภาษี → 201 + warnings[MANUAL_JV_VAT_ACCOUNT] (แจ้งให้ทราบ ไม่บล็อก)", (jr.status === 201 || jr.status === 200) && jr.body?.data?.warnings?.[0]?.code === "MANUAL_JV_VAT_ACCOUNT", "201+warn", { s: jr.status, w: jr.body?.data?.warnings, e: jr.body?.error });
} catch (e) {
  chk("N-CRASH", "ชุดข้อสอบรันจบโดยไม่ล้ม", false, "no crash", e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  if (tid && !KEEP) await purgeTenant(tid);
  else if (tid && KEEP) {
    // KEEP=1: เก็บร้านไว้ + ให้เจ้าของ QC (ผู้ใช้ของภาพจอ) เข้าดูได้
    const accEnv: Any = await import("./acc-v2-env.mts" as string);
    const qcOwner = await prisma.user.findFirst({ where: { email: accEnv.QC.ownerEmail }, select: { id: true } });
    if (qcOwner) await prisma.membership.upsert({ where: { userId_tenantId: { userId: qcOwner.id, tenantId: tid } }, create: { userId: qcOwner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() }, update: {} }).catch((e: unknown) => console.log(`membership: ${String(e)}`));
    const syss = await prisma.appSystem.findMany({ where: { tenantId: tid, type: "ACCOUNT" }, select: { id: true, name: true } });
    console.log(`KEEP=1 → ร้าน ${tid} · ${syss.map((x: Any) => `${x.name}: /app/sys/${x.id}/account/reports/revenue-novat?from=2026-04&to=2026-05`).join(" · ")}`);
  }
}

const failed = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T1.9 ขายไม่มี VAT + mapping: ผ่าน ${cks.length - failed.length}/${cks.length} · ไม่ผ่าน ${failed.length} =====`);
if (failed.length) console.log("ไม่ผ่าน: " + failed.map((f) => `${f.id}(${f.sev})`).join(", "));
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);

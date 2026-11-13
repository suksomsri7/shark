// QC ACC T1.3 — ภ.พ.30 ครบช่อง: ยอดขาย 7% / 0% / ยกเว้น · ยอดซื้อ · เครดิตยกมาจำจากเดือนก่อน (ยื่นแล้ว / คิดต่อ / ร้านแก้เอง + ประวัติ) ·
//   ภาพตัวเลขที่ยื่น · แบบยื่นเพิ่มเติม = ผลต่างกับยอดที่ยื่นล่าสุด · กำหนดยื่นจากตารางค่ากฎหมาย · กระทบ GL ผ่าน mapping · REST op · CSV
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md T1.3 (ปิด E8) · design note ledger/wo-notes/T1.3.md
// กฎ: skill shark-thai-law common-vat-invoice.md §19 · test-rules.md T-ACC-03
// ฟิกซ์เจอร์ของตัวเอง (ร้าน "QC T1.3 ภพ30" สร้าง/ลบเอง · KEEP=1 = เก็บไว้ + ให้เจ้าของ QC เข้าดูจอได้)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-pp30.mts
//
// เดือนคงที่ในอดีต (ไม่ผูกนาฬิกา): A = 2026-04 · B = 2026-05 · C = 2026-06 (ใบทั้งหมด EXCLUDE · อัตรา 7%) — เฉลยมือ (สตางค์):
//   A: ขาย 7% ฐาน 1,000,000 VAT 70,000 · ซื้อ ฐาน 3,000,000 VAT 210,000
//      → ภาษีขาย − ภาษีซื้อ = −140,000 (ชำระเกิน 140,000) · เครดิตยกมา 0 · ชำระเกินสุทธิ 140,000 · ยกไป 140,000
//   B: ขาย 1 ใบ 3 บรรทัด: 7% 2,000,000 (VAT 140,000) · 0% 500,000 · ยกเว้น 300,000 → ยอดขายรวม 2,800,000
//      ซื้อ ฐาน 1,000,000 VAT 70,000 → ต้องชำระเดือนนี้ 70,000 · เครดิตยกมา 140,000 (คิดต่อจาก A) → ชำระเกินสุทธิ 70,000 · ยกไป 70,000
//   C: ขาย 7% ฐาน 3,000,000 VAT 210,000 · ซื้อ ฐาน 500,000 VAT 35,000 → ต้องชำระเดือนนี้ 175,000 · เครดิตยกมา 70,000 → สุทธิต้องชำระ 105,000
//   ยื่น A (ภาพ: ยกไป 140,000) → ใบขายย้อนเข้า A: 7% ฐาน 500,000 VAT 35,000 → สมุด A: ภาษีขาย 105,000 · ชำระเกินสุทธิ 105,000 · ยกไป 105,000
//      · ก่อนยื่นเพิ่มเติม: B ยังใช้เครดิตยกมาตามที่ยื่น 140,000 (FILED) · ผลต่าง A: ยอดขาย +500,000 · ภาษีขาย +35,000 · ชำระเกิน −35,000 · ยกไป −35,000
//      · ยื่นเพิ่มเติม A (ครั้งที่ 1) → B เครดิตยกมา 105,000 → B ชำระเกินสุทธิ 35,000 → C เครดิตยกมา 35,000 → C สุทธิต้องชำระ 140,000
//   ร้านแก้เครดิตยกมาของ B = 100,000 → B ชำระเกิน 30,000 → C เครดิต 30,000 → C ต้องชำระ 145,000 · กลับค่าระบบ → 105,000 · ประวัติ 2 แถว
//   ยื่น C (สุทธิ 140,000) → ใบขายย้อนเข้า C: 7% ฐาน 100,000 VAT 7,000 → แบบเพิ่มเติม C: ภาษีสุทธิต้องชำระ +7,000 + คำเตือนเงินเพิ่ม
//   ค่าตั้งขอคืน (REFUND) ของสมุด: เดือน B (ยังไม่ยื่น) ชำระเกินสุทธิ 35,000 ไม่ยกไป → C เครดิตยกมา 0 + คำเตือน PP30_EXCESS_REFUND
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-pp30");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)}`}`);
};
const eq = (id: string, n: string, act: unknown, exp: unknown, sev: Sev = "CRITICAL") => chk(id, n, JSON.stringify(act) === JSON.stringify(exp), exp, act, sev);

const KEEP = process.env.KEEP === "1";
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const PS: Any = await import("@/lib/modules/account/pp30-shared" as string);
const PR: Any = await import("@/lib/modules/account/pp30-return" as string);
const PF: Any = await import("@/lib/modules/account/pp30-filing" as string);
const PC: Any = await import("@/lib/modules/account/period-close" as string);
const REP: Any = await import("@/lib/modules/account/reports" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
const exp: Any = await import("@/lib/modules/account/expense" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);
const settingsCore: Any = await import("@/lib/core/settings" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const accEnv: Any = await import("./acc-v2-env.mts" as string);

const A = "2026-04";
const B = "2026-05";
const C = "2026-06";
const day = (ym: string, d: number) => new Date(`${ym}-${String(d).padStart(2, "0")}T10:00:00+07:00`);

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

const TENANT_NAME = "QC T1.3 ภพ30";
const OWNER_EMAIL = "qc-t13-pp30@qc.local";
let tid = "";
const L = (r: Any) => r.ret.lines;
const pick = (o: Any, ks: string[]) => ks.map((k) => o[k]);

// ═══ P0 ตัวคิดบริสุทธิ์ ═══
console.log("\n── P0 ตัวคิดช่อง ภ.พ.30 (pure) ──");
{
  const l = PS.computePp30Lines({ salesTaxable: 2_000_000, salesZero: 500_000, salesExempt: 300_000, outputVat: 140_000, purchases: 1_000_000, inputVat: 70_000, creditBroughtForward: 140_000, excessChoice: "CARRY_FORWARD" });
  eq("P0.1", "ยอดขายรวม = 7% + 0% + ยกเว้น · ต้องชำระเดือนนี้ 70,000 · หักเครดิต 140,000 → ชำระเกินสุทธิ 70,000 ยกไป", pick(l, ["salesTotal", "taxPayable", "taxExcess", "netPayable", "netExcess", "creditCarriedForward"]), [2_800_000, 70_000, 0, 0, 70_000, 70_000]);
  const r = PS.computePp30Lines({ salesTaxable: 0, salesZero: 0, salesExempt: 0, outputVat: 0, purchases: 100, inputVat: 7, creditBroughtForward: 0, excessChoice: "REFUND" });
  eq("P0.2", "ขอคืน: ชำระเกิน 7 ไม่ยกไป", pick(r, ["taxExcess", "netExcess", "creditCarriedForward"]), [7, 7, 0]);
  const z = PS.computePp30Lines({ salesTaxable: 0, salesZero: 0, salesExempt: 0, outputVat: 0, purchases: 0, inputVat: 0, creditBroughtForward: 5_000, excessChoice: "CARRY_FORWARD" });
  eq("P0.3", "เดือนไม่มีรายการ: ออกได้ · เครดิตยกมา 5,000 ส่งต่อทั้งหมด", pick(z, ["salesTotal", "netPayable", "netExcess", "creditCarriedForward"]), [0, 0, 5_000, 5_000]);
  const d = PS.diffPp30Lines(l, { ...l, outputVat: 130_000, salesTaxable: 1_900_000 });
  eq("P0.4", "ผลต่างต่อช่อง (ใหม่ − เดิม)", [d.outputVat, d.salesTaxable, d.netExcess, PS.pp30HasDiff(d), PS.pp30HasDiff(PS.diffPp30Lines(l, l))], [10_000, 100_000, 0, true, false]);
  const leg = PS.storedPp30Lines(null, { salesVatSatang: 700, inputVatSatang: 1_000, payableSatang: -300 });
  eq("P0.5", "แถวยื่นก่อน T1.3 (ไม่มีภาพ): อ่านจากคอลัมน์เดิม · ยกไป = ส่วนเกิน", [leg.legacy, leg.outputVat, leg.inputVat, leg.taxExcess, leg.creditCarriedForward, leg.salesTotal ?? null], [true, 700, 1_000, 300, 300, null], "MAJOR");
  eq("P0.6", "เดือนก่อน/ถัดไป ข้ามปี", [PS.prevPeriodKey("2026-01"), PS.nextPeriodKey("2026-12")], ["2025-12", "2027-01"], "MINOR");
  const codes = ["PP30_EXCESS_REFUND", "PP30_CREDIT_CARRY_OVERRIDDEN", "PP30_FILED_DIFFERS", "PP30_ADDITIONAL_SURCHARGE", "PP30_DECLARED_DIFFERS", "PP30_LEGACY_FILING", "TAX_REPORT_ORG_NAME_MISSING", "TAX_REPORT_TAX_ID_MISSING"];
  const defs = codes.map((c) => W.LEGAL_WARNINGS[c]);
  chk("P0.7", "คำเตือนใหม่อยู่ในทะเบียนกลาง: มีมาตรา/ที่มา · ป้าย · วันที่ตรวจ · ไม่บล็อก (ack=false)", defs.every((x: Any) => x && x.citation && x.tag && /^\d{4}-\d{2}-\d{2}$/.test(x.checkedAt) && x.ack === false), "ครบ", defs.map((x: Any, i: number) => (x ? `${codes[i]}:${x.tag}:${x.ack}` : `${codes[i]}:ไม่มี`)));
  const msgs = codes.map((c) => W.legalWarning(c, { amount: "1.00", shop: "1", system: "2", period: "2026-04", declaredOut: "1", declaredIn: "1", bookOut: "1", bookIn: "1" }).messageTh);
  chk("P0.8", "ข้อความไม่อ้างว่า \"ถูกกฎหมาย\" · ป้าย S/U ต่อท้ายให้ตรวจกับนักบัญชี", msgs.every((m: string) => !/ถูกกฎหมาย|ตามกฎหมายแล้ว/.test(m)) && codes.filter((c, i) => ["S", "U"].includes(W.LEGAL_WARNINGS[c].tag)).every((c) => msgs[codes.indexOf(c)].includes(W.CHECK_WITH_ACCOUNTANT_TH)), "ok", msgs, "MAJOR");
}

try {
  // ═══ P1 ฟิกซ์เจอร์ ═══
  console.log("\n── P1 ฟิกซ์เจอร์ร้าน T1.3 ──");
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } })) await purgeTenant(old.id);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t13-pp30-${Date.now().toString(36)}`, status: "ACTIVE", enabledModules: ["ACCOUNT"] } })).id;
  const owner = (await prisma.user.findFirst({ where: { email: OWNER_EMAIL } })) ?? (await prisma.user.create({ data: { email: OWNER_EMAIL, name: "เจ้าของ T1.3" } }));
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const accSys = await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T1.3");
  const SYS = accSys.id;
  await acc.saveSettings(tid, SYS, {
    orgPrefix: "บริษัท",
    orgName: "ทีวันสาม ภพสามสิบ จำกัด",
    taxId: "0105566012345",
    branchCode: "00000",
    branchName: "สำนักงานใหญ่",
    address: "1 ถ.ทดสอบ กรุงเทพฯ 10110",
    vatRegistered: true,
    taxPointBasis: "ON_ISSUE",
  });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const ctx = { tenantId: tid, systemId: SYS };
  const cust = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ลูกค้า ภพ30 จำกัด", taxId: "0105555000011", branchCode: "00000" });
  const vend = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "VENDOR", legalType: "COMPANY", name: "บริษัท ผู้ขาย ภพ30 จำกัด", taxId: "0105555000022", branchCode: "00000" });
  const expLedger = (await exp.listExpenseAccounts(SYS)).find((a: Any) => a.code === "6900") ?? (await exp.listExpenseAccounts(SYS))[0];

  const sell = async (label: string, date: Date, lines: { amt: number; bp: number }[]) => {
    const d = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: cust.id, issueDate: date, vatMode: "EXCLUDE", lines: lines.map((l, i) => ({ description: `${label} ${i + 1}`, qty: 1, unitPrice: l.amt, vatRateBp: l.bp })) });
    const r = await acc.issueDocument(tid, SYS, d.id);
    if (!r.ok) throw new Error(`ออก ${label} ไม่สำเร็จ: ${r.reason}`);
    return r.docNo as string;
  };
  const buy = async (label: string, date: Date, amt: number) => {
    const d = await exp.createExpenseDoc({ tenantId: tid, systemId: SYS, docType: "EXPENSE", contactId: vend.id, issueDate: date, vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: label, qty: 1, unitPrice: amt, vatRateBp: 700, accountId: expLedger.id }], createdById: owner.id });
    const r = await exp.issueExpenseDoc(tid, SYS, d.id);
    if (!r.ok) throw new Error(`ออก ${label} ไม่สำเร็จ: ${r.reason}`);
    return r.docNo as string;
  };
  await sell("ขาย A", day(A, 10), [{ amt: 1_000_000, bp: 700 }]);
  await buy("ซื้อ A", day(A, 12), 3_000_000);
  await sell("ขาย B", day(B, 10), [{ amt: 2_000_000, bp: 700 }, { amt: 500_000, bp: 0 }, { amt: 300_000, bp: -1 }]);
  await buy("ซื้อ B", day(B, 12), 1_000_000);
  await sell("ขาย C", day(C, 10), [{ amt: 3_000_000, bp: 700 }]);
  await buy("ซื้อ C", day(C, 12), 500_000);
  chk("P1.1", "ฟิกซ์เจอร์ 3 เดือน (ขาย 3 · ซื้อ 3)", true, "ok", "ok");

  // ═══ P2 สามเดือนก่อนยื่น ═══
  console.log("\n── P2 สามเดือนต่อเนื่อง (ยังไม่ยื่น) ──");
  const KS = ["salesTotal", "salesZero", "salesExempt", "salesTaxable", "outputVat", "purchases", "inputVat", "taxPayable", "taxExcess", "creditBroughtForward", "netPayable", "netExcess", "creditCarriedForward"];
  const ra = await REP.pp30(ctx, A);
  eq("P2.1", "A: ทุกช่อง (ภาษีซื้อเกิน → เครดิต 140,000)", pick(L(ra), KS), [1_000_000, 0, 0, 1_000_000, 70_000, 3_000_000, 210_000, 0, 140_000, 0, 0, 140_000, 140_000]);
  eq("P2.2", "A: เครดิตยกมา = ไม่มี (ก่อนรายการภาษีแรก)", [ra.ret.carry.source, ra.ret.carry.amount], ["NONE", 0], "MAJOR");
  const rb = await REP.pp30(ctx, B);
  eq("P2.3", "B: ยอดขาย 7%/0%/ยกเว้น แยกช่อง + เครดิตยกมา 140,000 ถูกใช้ เหลือยกไป 70,000", pick(L(rb), KS), [2_800_000, 500_000, 300_000, 2_000_000, 140_000, 1_000_000, 70_000, 70_000, 0, 140_000, 0, 70_000, 70_000]);
  eq("P2.4", "B: เครดิตยกมา = คิดต่อจาก A (ยังไม่ยื่น)", [rb.ret.carry.source, rb.ret.carry.fromPeriod], ["COMPUTED", A], "MAJOR");
  const rc = await REP.pp30(ctx, C);
  eq("P2.5", "C: ต้องชำระเดือนนี้ 175,000 − เครดิต 70,000 = สุทธิ 105,000", pick(L(rc), ["outputVat", "inputVat", "taxPayable", "creditBroughtForward", "netPayable", "netExcess", "creditCarriedForward"]), [210_000, 35_000, 175_000, 70_000, 105_000, 0, 0]);
  eq("P2.6", "T-ACC-03: ภาษีขายของแบบ = รายงานภาษีขาย = GL ภาษีขาย (mapping) · ภาษีซื้อ = GL ภาษีซื้อ", [L(rb).outputVat === rb.salesTax.total.vat, rb.ret.reconcile.find((x: Any) => x.key === "VAT_OUTPUT")?.ok, rb.ret.reconcile.find((x: Any) => x.key === "VAT_INPUT")?.ok, rb.ret.reconcile.find((x: Any) => x.key === "VAT_OUTPUT")?.ledger?.viaMapping], [true, true, true, true]);
  eq("P2.7", "ยอดขายในแบบ = ฐานในรายงานภาษีขาย (7% / 0% / ยกเว้น)", [L(rb).salesTaxable, L(rb).salesZero, L(rb).salesExempt], [rb.salesTax.groups.filter((g: Any) => g.rateBp > 0).reduce((n: number, g: Any) => n + g.base, 0), rb.salesTax.groups.find((g: Any) => g.rateBp === 0)?.base, rb.salesTax.groups.find((g: Any) => g.rateBp === -1)?.base]);
  eq("P2.8", "กำหนดยื่น B จากตารางค่ากฎหมาย: กระดาษ 15 มิ.ย. · อินเทอร์เน็ต 23 มิ.ย.", [rb.ret.deadline.paper?.date, rb.ret.deadline.online?.date], ["2026-06-15", "2026-06-23"], "MAJOR");
  const empty = await REP.pp30(ctx, "2026-07");
  eq("P2.9", "เดือนไม่มีรายการ (ก.ค.) ออกแบบได้ · ทุกช่อง 0 · สถานะยังไม่ยื่น", [L(empty).salesTotal, L(empty).netPayable, L(empty).netExcess, empty.ret.filed.filed], [0, 0, 0, false], "MAJOR");

  // ═══ P3 ยื่น A → เอกสารย้อน → แบบเพิ่มเติม ═══
  console.log("\n── P3 ยื่น A · ใบย้อนเข้าเดือนที่ยื่น · แบบยื่นเพิ่มเติม ──");
  const fa = await PC.markVatFiled(ctx, { periodKey: A, userId: owner.id, note: "ยื่นออนไลน์" });
  chk("P3.1", "ทำเครื่องหมายยื่น A (ไม่ส่งยอด = ใช้ยอดสมุด)", fa.ok === true, "ok", fa);
  const rowA = await prisma.accountVatFiling.findFirst({ where: { systemId: SYS, periodKey: A } });
  eq("P3.2", "ภาพที่ยื่น A เก็บทุกช่อง + คอลัมน์เดิม", [rowA?.lines?.creditCarriedForward, rowA?.lines?.salesTotal, rowA?.salesVatSatang, rowA?.inputVatSatang, rowA?.payableSatang, rowA?.netSatang, rowA?.excessChoice], [140_000, 1_000_000, 70_000, 210_000, -140_000, -140_000, "CARRY_FORWARD"]);
  const dup = await PC.markVatFiled(ctx, { periodKey: A, userId: owner.id });
  chk("P3.3", "ยื่นซ้ำเดือนเดิม = ปฏิเสธ (ชี้ให้ยื่นแบบเพิ่มเติม)", dup.ok === false && /เพิ่มเติม/.test(dup.reason), "ปฏิเสธ", dup, "MAJOR");
  const noDiff = await PF.fileVatAdditional(ctx, { periodKey: A, userId: owner.id });
  chk("P3.4", "แบบเพิ่มเติมเมื่อสมุดตรงกับที่ยื่น = ปฏิเสธ", noDiff.ok === false, "ปฏิเสธ", noDiff, "MAJOR");
  await sell("ขายย้อน A", day(A, 25), [{ amt: 500_000, bp: 700 }]);
  const ra2 = await REP.pp30(ctx, A);
  eq("P3.5", "สมุด A ตอนนี้: ภาษีขาย 105,000 · ชำระเกินสุทธิ 105,000 · ต่างจากที่ยื่น → amendmentNeeded + คำเตือน", [L(ra2).outputVat, L(ra2).netExcess, ra2.ret.amendmentNeeded, ra2.ret.warnings.some((w: Any) => w.code === "PP30_FILED_DIFFERS")], [105_000, 105_000, true, true]);
  eq("P3.6", "ผลต่าง A: ยอดขาย +500,000 · ภาษีขาย +35,000 · ชำระเกิน −35,000 · ยกไป −35,000", pick(ra2.ret.diffFromFiled, ["salesTotal", "salesTaxable", "outputVat", "taxExcess", "netExcess", "creditCarriedForward", "inputVat"]), [500_000, 500_000, 35_000, -35_000, -35_000, -35_000, 0]);
  const rb2 = await REP.pp30(ctx, B);
  eq("P3.7", "ก่อนยื่นเพิ่มเติม: B ใช้เครดิตยกมาตามที่ยื่น 140,000 (FILED)", [rb2.ret.carry.source, rb2.ret.carry.amount], ["FILED", 140_000]);
  const addA = await PF.fileVatAdditional(ctx, { periodKey: A, userId: owner.id, note: "ใบขายลงย้อน" });
  eq("P3.8", "แบบเพิ่มเติม A ครั้งที่ 1: ผลต่างตามมือ · ไม่มีภาษีต้องชำระเพิ่ม → ไม่มีคำเตือนเงินเพิ่ม", [addA.ok, addA.seq, addA.diff?.outputVat, addA.diff?.creditCarriedForward, addA.warnings?.some((w: Any) => w.code === "PP30_ADDITIONAL_SURCHARGE")], [true, 1, 35_000, -35_000, false]);
  const rb3 = await REP.pp30(ctx, B);
  eq("P3.9", "หลังยื่นเพิ่มเติม: B เครดิตยกมา 105,000 (FILED ล่าสุด) → ชำระเกินสุทธิ 35,000", [rb3.ret.carry.source, L(rb3).creditBroughtForward, L(rb3).netExcess, L(rb3).creditCarriedForward], ["FILED", 105_000, 35_000, 35_000]);
  const rc3 = await REP.pp30(ctx, C);
  eq("P3.10", "C: เครดิตยกมา 35,000 (คิดต่อจาก B) → สุทธิต้องชำระ 140,000", [rc3.ret.carry.source, L(rc3).creditBroughtForward, L(rc3).netPayable], ["COMPUTED", 35_000, 140_000]);
  const ra3 = await REP.pp30(ctx, A);
  eq("P3.11", "A หลังยื่นเพิ่มเติม: สมุดตรงกับที่ยื่นล่าสุด · บันทึกยื่น 2 ครั้ง (ต้นฉบับ + เพิ่มเติม)", [ra3.ret.amendmentNeeded, ra3.ret.filed.records.map((x: Any) => `${x.kind}:${x.seq}`)], [false, ["ORIGINAL:0", "ADDITIONAL:1"]]);
  const unA = await PC.unmarkVatFiled(ctx, A);
  chk("P3.12", "ยกเลิกเครื่องหมายยื่นเดือนที่มีแบบเพิ่มเติมแล้ว = ปฏิเสธ (ไม่ทิ้งแบบเพิ่มเติมลอย)", unA.ok === false, "ปฏิเสธ", unA, "MAJOR");

  // ═══ P4 ร้านแก้เครดิตยกมา (ประวัติ) ═══
  console.log("\n── P4 ร้านแก้เครดิตยกมา ──");
  const ov = await PF.setVatCreditCarry(ctx, { periodKey: B, amountSatang: 100_000, reason: "นักบัญชีปรับตามแบบที่ยื่นจริง", userId: owner.id });
  const rb4 = await REP.pp30(ctx, B);
  eq("P4.1", "ร้านแก้ B = 100,000 → ใช้ค่านั้น (OVERRIDE) · ค่าระบบยังเห็น 105,000 · คำเตือน S", [ov.ok, rb4.ret.carry.source, L(rb4).creditBroughtForward, rb4.ret.carry.systemAmount, L(rb4).netExcess, rb4.ret.warnings.find((w: Any) => w.code === "PP30_CREDIT_CARRY_OVERRIDDEN")?.tag], [true, "OVERRIDE", 100_000, 105_000, 30_000, "S"]);
  const rc4 = await REP.pp30(ctx, C);
  eq("P4.2", "C ตามไป: เครดิตยกมา 30,000 → ต้องชำระ 145,000", [L(rc4).creditBroughtForward, L(rc4).netPayable], [30_000, 145_000]);
  const bad = await PF.setVatCreditCarry(ctx, { periodKey: B, amountSatang: 100_000, reason: "", userId: owner.id });
  chk("P4.3", "แก้โดยไม่มีเหตุผล = ปฏิเสธ", bad.ok === false, "ปฏิเสธ", bad, "MAJOR");
  await PF.setVatCreditCarry(ctx, { periodKey: B, amountSatang: null, reason: "กลับไปใช้ค่าที่ระบบคิด", userId: owner.id });
  const rb5 = await REP.pp30(ctx, B);
  eq("P4.4", "กลับค่าระบบ → 105,000 (FILED) · ประวัติ 2 แถว ไม่ลบ", [rb5.ret.carry.source, L(rb5).creditBroughtForward, rb5.ret.carry.history.map((h: Any) => h.amountSatang)], ["FILED", 105_000, [100_000, null]]);
  const tmp = await REP.pp30(ctx, B, { carryForward: 1_000 });
  eq("P4.5", "ค่าดูชั่วคราว (?carry= / carryForwardSatang) ไม่บันทึก", [tmp.ret.carry.source, L(tmp).creditBroughtForward, (await REP.pp30(ctx, B)).ret.carry.amount], ["QUERY", 1_000, 105_000], "MAJOR");

  // ═══ P5 ยื่น C → ใบย้อน → แบบเพิ่มเติมที่มีภาษีต้องชำระเพิ่ม ═══
  console.log("\n── P5 แบบเพิ่มเติมที่มีภาษีต้องชำระเพิ่ม ──");
  const fc = await PC.markVatFiled(ctx, { periodKey: C, userId: owner.id, salesVat: 999, inputVat: 35_000 });
  eq("P5.1", "ยื่น C พร้อมยอดที่แจ้งไม่ตรงสมุด → บันทึกได้ + คำเตือน PP30_DECLARED_DIFFERS · ภาพ = ยอดสมุด", [fc.ok, fc.warnings?.some((w: Any) => w.code === "PP30_DECLARED_DIFFERS"), (await prisma.accountVatFiling.findFirst({ where: { systemId: SYS, periodKey: C } }))?.lines?.netPayable], [true, true, 140_000], "MAJOR");
  await sell("ขายย้อน C", day(C, 28), [{ amt: 100_000, bp: 700 }]);
  const addC = await PF.fileVatAdditional(ctx, { periodKey: C, userId: owner.id });
  eq("P5.2", "แบบเพิ่มเติม C: ภาษีสุทธิต้องชำระ +7,000 + คำเตือนเงินเพิ่ม/เบี้ยปรับ (ระบบไม่คำนวณ)", [addC.ok, addC.diff?.netPayable, addC.diff?.outputVat, addC.lines?.netPayable, addC.warnings?.some((w: Any) => w.code === "PP30_ADDITIONAL_SURCHARGE")], [true, 7_000, 7_000, 147_000, true]);
  const addRow = await prisma.accountVatAdditionalFiling.findFirst({ where: { systemId: SYS, periodKey: C } });
  eq("P5.3", "แถวแบบเพิ่มเติมของตัวเอง: seq 1 · ผลต่างสุทธิ 7,000 · ยอดใหม่สุทธิ 147,000", [addRow?.seq, addRow?.diffNetSatang, addRow?.netSatang], [1, 7_000, 147_000]);

  // ═══ P6 ค่าตั้งขอคืน (ร้านปรับ → ระบบยอมและเตือน) ═══
  console.log("\n── P6 ค่าตั้ง: ภาษีชำระเกิน → ขอคืน ──");
  const setR = await settingsCore.setSettings({ userId: owner.id, role: "OWNER", unitAccess: ["*"], permissions: {} }, { tenantId: tid }, [{ key: "account.report.pp30ExcessChoice", scope: "ACCOUNT_BOOK", scopeId: SYS, value: "REFUND" }]);
  chk("P6.1", "ตั้งค่า REFUND ได้", setR.ok === true, "ok", setR, "MAJOR");
  const rb6 = await REP.pp30(ctx, B);
  eq("P6.2", "B (ยังไม่ยื่น) ชำระเกินสุทธิ 35,000 ขอคืน → ยกไป 0 + คำเตือน PP30_EXCESS_REFUND", [L(rb6).netExcess, L(rb6).creditCarriedForward, L(rb6).excessChoice, rb6.ret.warnings.some((w: Any) => w.code === "PP30_EXCESS_REFUND")], [35_000, 0, "REFUND", true]);
  const raR = await REP.pp30(ctx, A);
  eq("P6.3", "A (ยื่นแล้ว เลือกยกไป) ยังคงทางที่ยื่นไว้", [L(raR).excessChoice, L(raR).creditCarriedForward], ["CARRY_FORWARD", 105_000], "MAJOR");
  await settingsCore.setSettings({ userId: owner.id, role: "OWNER", unitAccess: ["*"], permissions: {} }, { tenantId: tid }, [{ key: "account.report.pp30ExcessChoice", scope: "ACCOUNT_BOOK", scopeId: SYS, value: "CARRY_FORWARD" }]);

  // ═══ P7 CSV ═══
  console.log("\n── P7 CSV ──");
  const csv: string = await REP.pp30Csv(ctx, B);
  chk("P7.1", "CSV: หัวรายงาน (ชื่อ · เลข 13 หลัก · เดือนภาษี) + ทุกช่อง ภ.พ.30 + เครดิตยกมา + กำหนดยื่น", ["ทีวันสาม ภพสามสิบ", "0105566012345", "ยอดขายที่เสียภาษีอัตราร้อยละ 0", "ยอดขายที่ได้รับยกเว้น", "ยอดซื้อที่มีสิทธินำภาษีซื้อมาหัก", "เครดิตภาษียกมาจากเดือนก่อน", "กำหนดยื่น"].every((s) => csv.includes(s)), "ครบ", csv.slice(0, 600));
  chk("P7.2", "CSV: ยอดขาย 0% 5,000.00 · ยกเว้น 3,000.00 · เครดิตยกมา 1,050.00", csv.includes("5000.00") && csv.includes("3000.00") && csv.includes("1050.00"), "มี", csv.split("\n").filter((l) => /ยอดขาย|เครดิต/.test(l)).join(" | "), "MAJOR");

  const csvNull: string = await REP.pp30Csv(ctx, B, { carryForward: null });
  chk("P7.3", "CSV จากปุ่มดาวน์โหลด (ไม่ส่ง carry) = ใช้เครดิตยกมาที่จำไว้ ไม่ใช่ 0 ชั่วคราว", csvNull.includes("1050.00") && !csvNull.includes(PS.PP30_CARRY_SOURCE_LABEL_TH.QUERY), "จำไว้", csvNull.split("\n").filter((l) => /เครดิต/.test(l)).join(" | "), "MAJOR");

  // ═══ P8 REST ═══
  console.log("\n── P8 REST op (อ่าน · ยื่น · เพิ่มเติม · แก้เครดิต) ──");
  const ak: Any = await import("@/lib/api-keys/service" as string);
  const scopes: Any = await import("@/lib/api-keys/scopes" as string);
  const route: Any = await import("@/app/api/v1/account/[...path]/route" as string);
  const kA = await ak.createApiKey({ tenantId: tid }, "T1.3 accountant", { scopes: scopes.expandBundles(["accountant"]), systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "T1.3 read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });
  const call = async (method: string, path: string, key: string, body?: unknown) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : { "idempotency-key": `t13-${Date.now()}-${Math.random().toString(16).slice(2)}` }) };
    let b: string | undefined;
    if (body !== undefined) { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const res = await route[method](new Request(`http://x/api/v1/account${path}`, { method, headers, body: b }), { params: Promise.resolve({ path: path.split("?")[0].split("/").filter(Boolean) }) });
    const text = await res.text();
    let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, body: parsed };
  };
  const g = await call("GET", `/reports/vat-pp30?period=${B}`, kR.rawKey);
  const gd = g.body?.data;
  eq("P8.1", "GET /reports/vat-pp30 คืนช่องใหม่ (return · เครดิตยกมา + ที่มา · กำหนดยื่น · กระทบยอด · สถานะยื่น)", [g.status, gd?.return?.salesZero, gd?.return?.salesExempt, gd?.return?.purchases, gd?.creditBroughtForward?.amountSatang, gd?.creditBroughtForward?.source, gd?.deadline?.paper?.date, gd?.reconcile?.length >= 2, gd?.filing?.filed], [200, 500_000, 300_000, 1_000_000, 105_000, "FILED", "2026-06-15", true, false]);
  eq("P8.2", "คีย์เดิมยังอยู่ (ไม่ทำลายผู้เรียกเดิม)", [typeof gd?.netPayableSatang, typeof gd?.output?.totalSatang === "number" || typeof gd?.output?.total === "number" || gd?.output !== undefined], ["number", true], "MAJOR");
  const cr = await call("POST", `/periods/${B}/vat-credit-carry`, kA.rawKey, { amountSatang: 90_000, reason: "แก้ผ่าน API" });
  eq("P8.3", "POST /periods/{key}/vat-credit-carry → 200 · ค่าใหม่มีผล", [cr.status, cr.body?.data?.creditBroughtForwardSatang, cr.body?.data?.source], [200, 90_000, "OVERRIDE"]);
  const crR = await call("POST", `/periods/${B}/vat-credit-carry`, kR.rawKey, { amountSatang: 1, reason: "ไม่มีสิทธิ์" });
  chk("P8.4", "คีย์อ่านอย่างเดียว แก้เครดิตไม่ได้ → 403", crR.status === 403, 403, crR.status, "MAJOR");
  await call("POST", `/periods/${B}/vat-credit-carry`, kA.rawKey, { amountSatang: null, reason: "กลับค่าระบบผ่าน API" });
  const fb = await call("POST", `/periods/${B}/vat-filed`, kA.rawKey, { note: "ยื่นผ่าน API" });
  eq("P8.5", "POST /periods/{key}/vat-filed ไม่ส่งยอด → 200 + ภาพทุกช่อง", [fb.status, fb.body?.data?.vatFiled, fb.body?.data?.return?.netExcess], [200, true, 35_000]);
  await sell("ขายย้อน B", day(B, 20), [{ amt: 100_000, bp: 0 }]);
  const ab = await call("POST", `/periods/${B}/vat-additional`, kA.rawKey, { note: "ใบ 0% ลงย้อน" });
  eq("P8.6", "POST /periods/{key}/vat-additional → 200 · ผลต่างยอดขาย 0% +100,000 · ภาษีไม่เปลี่ยน · warnings เป็นอาร์เรย์", [ab.status, ab.body?.data?.seq, ab.body?.data?.diff?.salesZero, ab.body?.data?.diff?.outputVat, Array.isArray(ab.body?.data?.warnings)], [200, 1, 100_000, 0, true]);
  const ab2 = await call("POST", `/periods/${B}/vat-additional`, kA.rawKey, {});
  chk("P8.7", "ไม่มีผลต่าง → 4xx ข้อความไทย", ab2.status >= 400 && ab2.status < 500 && /[ก-๙]/.test(ab2.body?.error?.message_th ?? ""), "4xx", `${ab2.status} ${ab2.body?.error?.code}`, "MAJOR");
  const AO: Any = await import("@/lib/ai/account-ops" as string);
  const tools = (AO.accountTools?.() ?? AO.ACCOUNT_TOOL_DEFS ?? null) as Any;
  const reg: Any = await import("@/lib/modules/account/api/registry" as string);
  const ops = ["periods.vat-filed", "periods.vat-additional", "periods.vat-credit-carry"].map((id) => reg.ACCOUNT_OPS.find((o: Any) => o.id === id));
  chk("P8.8", "3 op เขียนเปิดเป็นเครื่องมือเลขา AI (ข้อเสนอให้เจ้าของกด)", ops.every((o: Any) => o?.tool?.name && o.kind !== "read"), "tool", ops.map((o: Any) => o?.tool?.name ?? null), "MAJOR");
  void tools;
} catch (e) {
  chk("PX", "ไม่มีข้อผิดพลาดระหว่างรัน", false, "ไม่มี", String((e as Error)?.stack ?? e).slice(0, 1500));
} finally {
  if (tid && !KEEP) {
    try {
      await purgeTenant(tid);
    } catch (e) {
      console.log(`ลบร้านทดสอบไม่หมด: ${String(e)}`);
    }
  } else if (tid && KEEP) {
    const sys = await prisma.appSystem.findFirst({ where: { tenantId: tid, type: "ACCOUNT" }, select: { id: true } });
    const qcOwner = await prisma.user.findFirst({ where: { email: accEnv.QC.ownerEmail }, select: { id: true } });
    if (qcOwner) await prisma.membership.upsert({ where: { userId_tenantId: { userId: qcOwner.id, tenantId: tid } }, create: { userId: qcOwner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() }, update: {} }).catch((e: unknown) => console.log(`membership: ${String(e)}`));
    console.log(`KEEP=1 → ร้าน ${tid} · /app/sys/${sys?.id}/account/reports/pp30?period=${B}`);
  }
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T1.3 PP30 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
await prisma.$disconnect();
process.exit(f.length ? 1 : 0);

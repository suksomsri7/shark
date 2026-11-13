// QC ACC T1.8 — POS ที่มีสินค้ายกเว้น / 0% / เก็บแทน: VAT ตามบรรทัด · ท้ายใบแยกฐานตามกลุ่มอัตรา · ธงเก็บแทน + คำเตือน · ลงบัญชี + รายงานภาษีขาย/ภ.พ.30
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md T1.8 (ปิด E11) · design note ledger/wo-notes/T1.8.md
// กฎ: skill shark-thai-law common-vat-invoice.md §2 §3 §9 §19 §20 §21 · audit-checklist-accounting.md E11
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง "QC T1.8 POS VAT" สร้างเอง ลบตอนจบ — KEEP=1 = เก็บไว้ดูหน้าจอ) · ไม่แตะ seed กลาง
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-posvat.mts
//
// เฉลยมือ (สตางค์ · สมุดจด VAT 7% · ราคา POS รวม VAT · ถอด VAT = ปัดครึ่งขึ้นของ g×10000/10700 ต่อกลุ่มมาตรฐาน):
//   B1 มาตรฐานล้วน (บิลแบบเดิม ไม่มีชนิด): 10,700 + 5,350 = 16,050 → ฐาน 15,000 VAT 1,050 (= สูตรเดิม splitIncludedVat ทั้งบิล)
//   B2 ยกเว้นล้วน: ข้าวสาร 10,000 (สินค้า POS vatRateBp −1 → ชนิดมาจากสินค้า) → VAT 0 · ยกเว้น 10,000 · ใบไม่มีแถว "VAT 7%"
//   B3 ผสม + ส่วนลดท้ายบิล 3,140: A มาตรฐาน 21,400 · B ยกเว้น 10,000 · C เก็บแทน 5,000 (ลดไม่ได้)
//        เกลี่ย 3,140 ตาม 21,400:10,000 → A 2,140 · B 1,000 · C 0 ⇒ net A 19,260 · B 9,000 · C 5,000 · ยอดบิล 33,260
//        VAT = 19,260 → ฐาน 18,000 VAT 1,260 · JV: Dr เงินสด 33,260 / Cr รายได้ 27,000 · Cr 2200 1,260 · Cr 2120 เก็บแทน 5,000
//        เอกสาร ABB = มูลค่าขาย 28,260 (ไม่มีบรรทัดเก็บแทน) · บรรทัด A อัตรา 7% · B ยกเว้น
//   B4 0%: มาตรฐาน 10,700 + 0% 20,000 → VAT 700 · 0% 20,000 → ภายหลังขอใบกำกับเต็มรูป (supersede) → TAX_INVOICE บรรทัด 7%/0% VAT 700
//   B5 เศษสตางค์: มาตรฐาน 3,330 + ยกเว้น 6,670 ส่วนลด 100 → เกลี่ย 33.3/66.7 → 33 / 67 ⇒ net 3,297 / 6,603 (Σ 9,900) · VAT(3,297) = 216
//   B6 = รูปเดียวกับ B3 → ยกเลิกบิล (void) ⇒ JV กลับทั้งก้อน (2120 สุทธิ 0)
//   R1 คืนบรรทัด A ของ B3 (19,260) → VAT ใบคืน 1,260 · ใบลดหนี้ ฐาน −18,000 VAT −1,260
//   R2 คืนบรรทัด C ของ B3 (เก็บแทน 5,000) → VAT 0 · JV Dr 2120 5,000 / Cr เงินสด · ไม่มีใบลดหนี้ (ไม่มีมูลค่าขาย)
//   เดือนนี้ (รายงานภาษีขาย T1.1 · ภ.พ.30 T1.3):
//     7%:   15,000 + 18,000 + 10,000 + 3,081 − 18,000 = 28,081 · VAT 1,050 + 1,260 + 700 + 216 − 1,260 = 1,966 (= GL 2200)
//     0%:   20,000 · ยกเว้น: 10,000 + 9,000 + 6,603 = 25,603 · เก็บแทน ไม่อยู่ในรายงานใด
//     บัญชี 2120 เดือนนี้: B3 +5,000 · B6 +5,000 −5,000 (void) · R2 −5,000 ⇒ เครดิตสุทธิ 0 · ยอดเคลื่อนไหว Cr 10,000 / Dr 10,000
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-posvat");

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
const VL: Any = await import("@/lib/money/vat-lines" as string);
const VAT: Any = await import("@/lib/money/vat" as string);
const STR: Any = await import("@/lib/modules/account/sales-tax-report" as string);
const REP: Any = await import("@/lib/modules/account/reports" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
const accIdx: Any = await import("@/lib/modules/account" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);
const posSvc: Any = await import("@/lib/modules/pos/service" as string);
const refundMod: Any = await import("@/lib/modules/pos/refund" as string);
const receiptMod: Any = await import("@/lib/modules/pos/receipt" as string);
const render: Any = await import("@/lib/modules/pos/receipt-render" as string);
const catalog: Any = await import("@/lib/modules/pos/catalog" as string);
const devMod: Any = await import("@/lib/modules/pos/device" as string);
const shiftMod: Any = await import("@/lib/modules/pos/shift" as string);
const commission: Any = await import("@/lib/modules/pos/staff-commission-shared" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const { drainAll } = (await import("@/lib/outbox-consumers" as string)) as Any;
const accEnv: Any = await import("./acc-v2-env.mts" as string);

const bkk = new Date(Date.now() + 7 * 3600_000);
const M = bkk.toISOString().slice(0, 7);

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

const TENANT_NAME = "QC T1.8 POS VAT";
const OWNER_EMAIL = "qc-t18-posvat@qc.local";
let tid = "";

// ═══ P0 ตัวคิดบริสุทธิ์ ═══
console.log("\n── P0 ตัวคิดบริสุทธิ์ (splitBillVat · ค่าคอมฯ · ทะเบียนคำเตือน) ──");
{
  const legacy = VL.splitBillVat({ lines: [{ lineTotalSatang: 10_700 }, { lineTotalSatang: 5_350 }], serviceChargeSatang: 0, grandTotalSatang: 16_050, rateBp: 700 });
  eq("P0.1", "มาตรฐานล้วน (ไม่มีชนิด) = splitIncludedVat ทั้งบิลเดิม", [legacy.vat, legacy.base, legacy.mixed], [VAT.splitIncludedVat(16_050, 700).vatSatang, 15_000, false]);
  const b3 = VL.splitBillVat({ lines: [{ lineTotalSatang: 21_400, treatment: "STANDARD" }, { lineTotalSatang: 10_000, treatment: "EXEMPT" }, { lineTotalSatang: 5_000, treatment: "ON_BEHALF" }], serviceChargeSatang: 0, grandTotalSatang: 33_260, rateBp: 700 });
  eq("P0.2", "B3: เกลี่ยส่วนลด 3,140 ไม่ลงบรรทัดเก็บแทน · net 19,260/9,000/5,000 · VAT 1,260 · ฐาน 18,000", [b3.nets, b3.vat, b3.base, b3.exempt, b3.onBehalf, b3.unallocatedDiscount], [[19_260, 9_000, 5_000], 1_260, 18_000, 9_000, 5_000, 0]);
  const b5 = VL.splitBillVat({ lines: [{ lineTotalSatang: 3_330, treatment: "STANDARD" }, { lineTotalSatang: 6_670, treatment: "EXEMPT" }], serviceChargeSatang: 0, grandTotalSatang: 9_900, rateBp: 700 });
  eq("P0.3", "B5: เกลี่ยเศษสตางค์ 33/67 (Σ = ส่วนลด) · VAT(3,297) = 216", [b5.nets, b5.nets[0] + b5.nets[1], b5.vat], [[3_297, 6_603], 9_900, 216]);
  const allEx = VL.splitBillVat({ lines: [{ lineTotalSatang: 10_000, treatment: "EXEMPT" }], serviceChargeSatang: 0, grandTotalSatang: 10_000, rateBp: 700 });
  eq("P0.4", "ยกเว้นล้วน: VAT 0 · ยอดมาตรฐาน 0", [allEx.vat, allEx.standardGross, allEx.exempt], [0, 0, 10_000]);
  const over = VL.splitBillVat({ lines: [{ lineTotalSatang: 1_000, treatment: "STANDARD" }, { lineTotalSatang: 5_000, treatment: "ON_BEHALF" }], serviceChargeSatang: 0, grandTotalSatang: 4_000, rateBp: 700 });
  eq("P0.5", "ส่วนลดเกินยอดที่ลดได้ (กินเก็บแทน) → unallocatedDiscount > 0 (ผู้เรียกปฏิเสธ)", over.unallocatedDiscount, 1_000);
  const sc = VL.splitBillVat({ lines: [{ lineTotalSatang: 10_000, treatment: "EXEMPT" }], serviceChargeSatang: 1_070, grandTotalSatang: 11_070, rateBp: 700 });
  eq("P0.6", "ค่าบริการ = กลุ่มมาตรฐาน (ค่าเริ่มต้นระบบ · skill ไม่ได้บอก) → VAT 70", [sc.standardGross, sc.vat], [1_070, 70]);
  eq("P0.7", "ชนิดจากสินค้า: vatRateBp 0/−1/null/700 + ธงเก็บแทนชนะ", [VL.productVatTreatment({ vatRateBp: 0 }), VL.productVatTreatment({ vatRateBp: -1 }), VL.productVatTreatment({ vatRateBp: null }), VL.productVatTreatment({ vatRateBp: 700 }), VL.productVatTreatment({ vatRateBp: -1, collectedOnBehalf: true })], ["ZERO_RATED", "EXEMPT", "STANDARD", "STANDARD", "ON_BEHALF"]);
  eq("P0.8", "ค่าคอมฯ พนักงาน: บรรทัดเก็บแทนฐาน 0 · บิลไม่มีเก็บแทน = lineNets เดิม", [commission.staffCommissionBases([21_400, 10_000, 5_000], 0, 33_260, ["STANDARD", "EXEMPT", "ON_BEHALF"]), commission.staffCommissionBases([21_400, 10_000], 0, 28_260)], [[19_260, 9_000, 0], [19_260, 9_000]]);
  const w = W.legalWarning("VAT_COLLECTED_ON_BEHALF", { name: "ค่าอุทยาน" });
  chk("P0.9", "ทะเบียนคำเตือน VAT_COLLECTED_ON_BEHALF: ป้าย V · ต้องกดยืนยัน · อ้าง กค 0706/พ./625 + §3 · ข้อความ 4 ข้อ", w.tag === "V" && w.ack === true && w.citation.includes("กค 0706/พ./625") && w.citation.includes("§3") && /\(1\)[\s\S]*\(2\)[\s\S]*\(3\)[\s\S]*\(4\)/.test(w.messageTh), "V/ack", w);
  eq("P0.10", "รหัสใหม่ต่อท้ายรายการเดิม", W.LEGAL_WARNING_CODES[W.LEGAL_WARNING_CODES.length - 1], "VAT_COLLECTED_ON_BEHALF", "MAJOR");
}

try {
  console.log("\n── P1 ฟิกซ์เจอร์ร้าน T1.8 ──");
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } })) await purgeTenant(old.id);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t18-posvat-${Date.now().toString(36)}`, status: "ACTIVE", enabledModules: ["ACCOUNT", "POS"] } })).id;
  const owner = (await prisma.user.findFirst({ where: { email: OWNER_EMAIL } })) ?? (await prisma.user.create({ data: { email: OWNER_EMAIL, name: "เจ้าของ T1.8" } }));
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "สาขาตลาดเก่า", slug: `t18-${Date.now().toString(36)}`, status: "ACTIVE" } });
  const accSys = await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T1.8");
  const posSys = await sysSvc.createSystem(tid, "POS", "ขายหน้าร้าน T1.8");
  await sysSvc.linkUnit(tid, accSys.id, unit.id);
  await sysSvc.linkUnit(tid, posSys.id, unit.id);
  const SYS = accSys.id;
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: SYS, linkedKind: "POS", linkedId: posSys.id } });
  await acc.saveSettings(tid, SYS, { orgPrefix: "บริษัท", orgName: "ทีหนึ่งแปด ขายปลีก จำกัด", taxId: "0105566018888", branchCode: "00000", branchName: "สำนักงานใหญ่", address: "8 ถ.ทดสอบ", vatRegistered: true, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const ctx = { tenantId: tid, systemId: SYS };
  const ownerActor = { userId: owner.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const DEV = `t18dev${Date.now().toString(36)}`;
  const pctx = { tenantId: tid, systemId: posSys.id, unitId: unit.id };
  await devMod.registerDevice(pctx, ownerActor, { name: "เครื่องหน้าร้าน", deviceCode: DEV });
  await shiftMod.openShift({ ...pctx, deviceId: DEV }, ownerActor, { deviceId: DEV, deviceLabel: "เครื่องหน้าร้าน", floatSatang: 0 });
  const shiftId = (await prisma.posShift.findFirst({ where: { tenantId: tid, deviceId: DEV, status: "OPEN" } }))?.id;
  const ledger2120 = await prisma.accountLedger.findFirst({ where: { systemId: SYS, code: "2120" }, select: { id: true, type: true, name: true } });
  const map2120 = await prisma.accountMapping.findFirst({ where: { systemId: SYS, key: "COLLECTED_ON_BEHALF" }, select: { accountId: true } });
  chk("P1.1", "ผังมีบัญชี 2120 เงินรับแทน (หนี้สิน) + mapping COLLECTED_ON_BEHALF ชี้บัญชีนั้น", ledger2120?.type === "LIABILITY" && map2120?.accountId === ledger2120?.id, "2120/LIABILITY", [ledger2120, map2120]);

  // สินค้า POS: ข้าวสาร (ยกเว้น ผ่านช่องเดิม vatRateBp −1) · ค่าเข้าอุทยาน (เก็บแทน — ต้องกดยืนยันคำเตือน)
  const cctx = { tenantId: tid, systemId: posSys.id, actorUserId: owner.id };
  const rice = await catalog.createProduct(cctx, { name: "ข้าวสาร 5 กก.", basePriceSatang: 10_000, vatRateBp: -1, unitId: null });
  const park = await catalog.createProduct(cctx, { name: "ค่าเข้าอุทยาน", basePriceSatang: 5_000, unitId: null });
  const noAck = await catalog.setProductVatTreatment(cctx, park.id, "ON_BEHALF", []);
  chk("P1.2", "ตั้งเป็นเก็บแทนโดยไม่กดยืนยัน → คืนคำเตือน VAT_COLLECTED_ON_BEHALF · ไม่เขียน", noAck.ok === false && noAck.legal?.[0]?.code === "VAT_COLLECTED_ON_BEHALF" && (await prisma.posProduct.findUnique({ where: { id: park.id } })).collectedOnBehalf === false, "legal", noAck);
  const withAck = await catalog.setProductVatTreatment(cctx, park.id, "ON_BEHALF", ["VAT_COLLECTED_ON_BEHALF"]);
  const auditRow = await prisma.auditLog.findFirst({ where: { tenantId: tid, action: "pos.product.vatTreatment", targetId: park.id }, select: { after: true } });
  chk("P1.3", "กดยืนยันแล้วบันทึกได้ (ไม่บล็อก) + audit เก็บรหัสที่ยืนยัน", withAck.ok === true && withAck.product.collectedOnBehalf === true && JSON.stringify(auditRow?.after ?? {}).includes("VAT_COLLECTED_ON_BEHALF"), "ok", [withAck.ok, auditRow]);
  const zeroP = await catalog.createProduct(cctx, { name: "บริการส่งออก", basePriceSatang: 20_000, unitId: null });
  const zr = await catalog.setProductVatTreatment(cctx, zeroP.id, "ZERO_RATED", []);
  chk("P1.4", "ตั้ง 0% ผ่านช่องเดิม vatRateBp = 0 (ไม่ต้องยืนยัน)", zr.ok === true && zr.product.vatRateBp === 0, 0, zr);

  const sales: Record<string, { id: string; receiptNo: string }> = {};
  const sell = async (key: string, lines: Any[], billDiscount = 0, extra: Any = {}) => {
    const gross = lines.reduce((n: number, l: Any) => n + l.qty * l.unitPriceSatang, 0) - billDiscount;
    const r = await prisma.$transaction((tx: Any) =>
      posSvc.createSale({ tenantId: tid, unitId: unit.id, systemId: posSys.id, shiftId, idempotencyKey: `t18-${tid}-${key}`, lines, billDiscountSatang: billDiscount, payMethods: [{ type: "CASH", amountSatang: gross }], ...extra }, tx),
    );
    sales[key] = { id: r.saleId, receiptNo: r.receiptNo };
    return r;
  };
  await sell("B1", [{ name: "กาแฟ", qty: 1, unitPriceSatang: 10_700 }, { name: "ขนม", qty: 1, unitPriceSatang: 5_350 }]);
  await sell("B2", [{ name: "ข้าวสาร 5 กก.", qty: 1, unitPriceSatang: 10_000, productId: rice.id }]);
  const b3Lines = [
    { name: "ชุดดำน้ำ", qty: 1, unitPriceSatang: 21_400 },
    { name: "ข้าวสาร 5 กก.", qty: 1, unitPriceSatang: 10_000, productId: rice.id },
    { name: "ค่าเข้าอุทยาน", qty: 1, unitPriceSatang: 5_000, productId: park.id },
  ];
  await sell("B3", b3Lines, 3_140);
  await sell("B4", [{ name: "ทัวร์ในประเทศ", qty: 1, unitPriceSatang: 10_700 }, { name: "บริการส่งออก", qty: 1, unitPriceSatang: 20_000, productId: zeroP.id }]);
  await sell("B5", [{ name: "น้ำดื่ม", qty: 1, unitPriceSatang: 3_330 }, { name: "ผักสด", qty: 1, unitPriceSatang: 6_670, vatTreatment: "EXEMPT" }], 100);
  await sell("B6", b3Lines, 3_140);
  let rejected: unknown = null;
  try {
    await sell("BX", [{ name: "น้ำ", qty: 1, unitPriceSatang: 1_000 }, { name: "ค่าเข้าอุทยาน", qty: 1, unitPriceSatang: 5_000, productId: park.id }], 2_000);
  } catch (e) {
    rejected = e instanceof Error ? e.message : String(e);
  }
  chk("P1.5", "ส่วนลดท้ายบิลเกินยอดที่ลดได้ (กินรายการเก็บแทน) → ปฏิเสธบิล", typeof rejected === "string" && (rejected as string).includes("เก็บแทน"), "ปฏิเสธ", rejected, "MAJOR");
  await drain();

  // ═══ P2 บิลบน POS ═══
  console.log("\n── P2 ยอดที่เก็บบนบิล POS ──");
  const row = async (k: string) => prisma.posSale.findUnique({ where: { id: sales[k].id }, include: { lines: { orderBy: { id: "asc" } } } });
  const B = Object.fromEntries(await Promise.all(["B1", "B2", "B3", "B4", "B5"].map(async (k) => [k, await row(k)])));
  eq("P2.1", "B1 บิลเดิม: VAT 1,050 · กลุ่ม 0/0/0 · บรรทัดไม่มีชนิด (null)", [B.B1.vatSatang, B.B1.zeroRatedSatang, B.B1.exemptSatang, B.B1.onBehalfSatang, B.B1.lines.map((l: Any) => l.vatTreatment)], [1_050, 0, 0, 0, [null, null]]);
  eq("P2.2", "B2 ยกเว้นล้วน (ชนิดจากสินค้า): VAT 0 · ยกเว้น 10,000", [B.B2.vatSatang, B.B2.exemptSatang, B.B2.lines[0].vatTreatment], [0, 10_000, "EXEMPT"]);
  eq("P2.3", "B3 ผสม: ยอด 33,260 · VAT 1,260 · ยกเว้น 9,000 · เก็บแทน 5,000 · ชนิดต่อบรรทัด (รายการไม่มีสินค้า = null = มาตรฐาน)", [B.B3.grandTotalSatang, B.B3.vatSatang, B.B3.exemptSatang, B.B3.onBehalfSatang, B.B3.lines.map((l: Any) => l.vatTreatment)], [33_260, 1_260, 9_000, 5_000, [null, "EXEMPT", "ON_BEHALF"]]);
  eq("P2.4", "B4: VAT 700 · 0% 20,000", [B.B4.vatSatang, B.B4.zeroRatedSatang], [700, 20_000]);
  eq("P2.5", "B5: VAT 216 · ยกเว้น 6,603 (เศษเกลี่ยตรงสตางค์)", [B.B5.vatSatang, B.B5.exemptSatang, B.B5.grandTotalSatang], [216, 6_603, 9_900]);
  const g3 = VL.storedVatGroups(B.B3);
  eq("P2.6", "ยอดตามกลุ่มกระทบกัน: มาตรฐาน + ยกเว้น + เก็บแทน = ยอดบิล · ฐาน = มาตรฐาน − VAT", [g3.standardGross + g3.exempt + g3.onBehalf + g3.zeroRated, g3.base], [33_260, 18_000]);

  // ═══ P3 ใบเสร็จ/ใบย่อ ═══
  console.log("\n── P3 ใบเสร็จ / ใบกำกับอย่างย่อ (payload + HTML 80 มม. + ESC/POS) ──");
  const rc = async (k: string) => (await receiptMod.receiptForSale(tid, posSys.id, sales[k].id))?.payload;
  const p1 = await rc("B1");
  const p2 = await rc("B2");
  const p3 = await rc("B3");
  const h1 = render.renderReceiptHtml(p1, { paper: "80", locale: "th" });
  const h2 = render.renderReceiptHtml(p2, { paper: "80", locale: "th" });
  const h3 = render.renderReceiptHtml(p3, { paper: "80", locale: "th" });
  chk("P3.1", "B1 บิลเดิม: ไม่มี vatGroups · แถวเดิม (มูลค่าก่อนภาษี 150.00 + VAT 7% 10.50)", !p1.totals.vatGroups && p1.kind === "TAX_INVOICE_ABB" && h1.includes("150.00") && h1.includes("10.50"), "เดิม", p1.totals);
  chk("P3.2", "B2 ยกเว้นล้วน: ไม่พิมพ์ 'VAT 7% ฿0.00' · มีแถวยอดขายยกเว้น 100.00 · บรรทัดติดป้าย (ยกเว้น VAT)", !/7%[^<]*<\/span> <span class="r">0\.00/.test(h2) && !h2.includes("0.00</span></div>".replace("0.00", "฿0.00")) && h2.includes("ยอดขายที่ได้รับยกเว้น VAT") && h2.includes("(ยกเว้น VAT)"), "ไม่มีแถว 0.00", h2.match(/data-section="totals"[\s\S]{0,900}/)?.[0]);
  chk("P3.3", "B3: ฐาน 180.00 · VAT 7% 12.60 · ยกเว้น 90.00 · เก็บแทน 50.00 (นอกมูลค่าขาย) · ป้ายต่อบรรทัด", h3.includes("180.00") && h3.includes("12.60") && h3.includes("90.00") && h3.includes("เก็บแทน (ไม่ใช่มูลค่าขาย)") && h3.includes("(เก็บแทน)") && h3.includes("(ยกเว้น VAT)"), "ครบ", p3.totals);
  const en = render.renderReceiptHtml(p3, { paper: "80", locale: "en" });
  chk("P3.4", "ฉบับภาษาอังกฤษไม่มีอักษรไทยในป้ายกลุ่ม/ป้ายบรรทัดใหม่", en.includes("VAT-exempt sales") && en.includes("(on behalf)") && !/ยกเว้น|เก็บแทน/.test(en), "EN", "?", "MAJOR");
  const esc = render.encodeEscPos(p3, { paper: "80", locale: "en", drawerKick: false, thaiText: "tis620" } as Any);
  const escText = Buffer.from(esc.bytes).toString("latin1");
  chk("P3.5", "ESC/POS (ภาษาอังกฤษ) มีแถวกลุ่มเดียวกับ HTML: VAT-exempt sales 90.00 · Collected on behalf 50.00", escText.includes("VAT-exempt sales") && escText.includes("90.00") && escText.includes("Collected on behalf") && escText.includes("50.00"), "ครบ", escText.slice(-600), "MAJOR");

  // ═══ P4 ลงบัญชี ═══
  console.log("\n── P4 สมุดบัญชี (JV + เอกสาร) ──");
  const jvOf = async (k: string, event = "PAID") => {
    const e = await prisma.accountJournalEntry.findFirst({ where: { systemId: SYS, idempotencyKey: `PosSale#${sales[k].id}#${event}` }, include: { lines: { include: { account: { select: { code: true } } } } } });
    const by: Record<string, number> = {};
    for (const l of e?.lines ?? []) by[l.account.code] = (by[l.account.code] ?? 0) + l.credit - l.debit;
    return by;
  };
  eq("P4.1", "B1 JV เดิม: Cr 4000 15,000 · 2200 1,050 · Dr 1000 16,050", await jvOf("B1"), { "1000": -16_050, "4000": 15_000, "2200": 1_050 });
  eq("P4.2", "B2 JV: ไม่มีบรรทัด 2200 · รายได้ 10,000", await jvOf("B2"), { "1000": -10_000, "4000": 10_000 });
  eq("P4.3", "B3 JV: Cr รายได้ 27,000 · 2200 1,260 · 2120 เก็บแทน 5,000 (ไม่ใช่รายได้)", await jvOf("B3"), { "1000": -33_260, "4000": 27_000, "2200": 1_260, "2120": 5_000 });
  const doc = async (k: string, docType = "TAX_INVOICE_ABB") => prisma.accountDocument.findFirst({ where: { systemId: SYS, refType: "PosSale", refId: sales[k].id, docType }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  const d3 = await doc("B3");
  eq("P4.4", "B3 เอกสารใบย่อ: มูลค่าขาย 28,260 (ไม่มีบรรทัดเก็บแทน) · VAT 1,260 · อัตราต่อบรรทัด 7% / ยกเว้น · หมายเหตุเก็บแทน", [d3?.grandTotal, d3?.vatAmount, d3?.lines.map((l: Any) => [l.description, l.vatRateBp]), d3?.note?.includes("เก็บแทน ฿50.00")], [28_260, 1_260, [["ชุดดำน้ำ", 700], ["ข้าวสาร 5 กก.", -1]], true]);
  const d2 = await doc("B2");
  eq("P4.5", "B2 เอกสาร: VAT 0 · บรรทัดยกเว้น", [d2?.vatAmount, d2?.lines.map((l: Any) => l.vatRateBp)], [0, [-1]]);
  const d1 = await doc("B1");
  eq("P4.6", "B1 เอกสารเดิม: VAT 1,050 · บรรทัดอัตราสมุด", [d1?.vatAmount, d1?.lines.map((l: Any) => l.vatRateBp)], [1_050, [700, 700]]);

  // ใบกำกับเต็มรูปจากบิลผสม (ขอทีหลัง)
  const sup = await accIdx.supersedeAbbWithTaxInvoice({ tenantId: tid, sourceSystemId: posSys.id, refId: sales.B4.id, buyer: { kind: "JURISTIC", name: "บริษัท ผู้ซื้อ T18 จำกัด", taxId: "0105555018001", branchCode: "00000", address: "9 ถ.ทดสอบ", email: null } });
  const tx4 = await doc("B4", "TAX_INVOICE");
  eq("P4.7", "ใบกำกับเต็มรูปจาก B4: บรรทัด 7% / 0% · VAT 700 · ยอด 30,700", [sup?.ok, tx4?.lines.map((l: Any) => l.vatRateBp), tx4?.vatAmount, tx4?.grandTotal], [true, [700, 0], 700, 30_700]);

  // ═══ P5 คืนเงิน / ยกเลิก ═══
  console.log("\n── P5 คืนเงิน / ยกเลิก บิลผสม ──");
  const rctx = { tenantId: tid, systemId: posSys.id, unitId: unit.id, deviceId: DEV };
  const lineA = B.B3.lines[0].id;
  const lineC = B.B3.lines[2].id;
  const r1 = await refundMod.refundSale(rctx, ownerActor, { saleId: sales.B3.id, lines: [{ lineId: lineA, qty: 1, restock: false }], payMethods: [{ type: "CASH", amountSatang: 19_260 }], reasonCode: "DAMAGED", reason: null, idempotencyKey: `t18-r1-${tid}` });
  const r2 = await refundMod.refundSale(rctx, ownerActor, { saleId: sales.B3.id, lines: [{ lineId: lineC, qty: 1, restock: false }], payMethods: [{ type: "CASH", amountSatang: 5_000 }], reasonCode: "OTHER", reason: "ยกเลิกเข้าอุทยาน", idempotencyKey: `t18-r2-${tid}` });
  chk("P5.1", "คืนบรรทัดมาตรฐาน + คืนบรรทัดเก็บแทน สำเร็จ", r1?.ok === true && r2?.ok === true, "ok", [r1, r2]);
  await drain();
  const R1 = r1?.ok ? await prisma.posSale.findUnique({ where: { id: r1.refund.id }, include: { lines: true } }) : null;
  const R2 = r2?.ok ? await prisma.posSale.findUnique({ where: { id: r2.refund.id }, include: { lines: true } }) : null;
  eq("P5.2", "ใบคืน R1: ยอด 19,260 · VAT 1,260 · บรรทัดคัดลอกชนิดเดิม (null = มาตรฐาน)", [R1?.grandTotalSatang, R1?.vatSatang, R1?.lines.map((l: Any) => l.vatTreatment)], [19_260, 1_260, [null]]);
  eq("P5.3", "ใบคืน R2 (เก็บแทน): VAT 0 · onBehalf 5,000", [R2?.grandTotalSatang, R2?.vatSatang, R2?.onBehalfSatang], [5_000, 0, 5_000]);
  if (R1) sales.R1 = { id: R1.id, receiptNo: R1.receiptNo };
  if (R2) sales.R2 = { id: R2.id, receiptNo: R2.receiptNo };
  eq("P5.4", "JV ใบคืน R1: Dr รายได้ 18,000 · Dr 2200 1,260 · Cr เงินสด 19,260", await jvOf("R1", "REFUNDED"), { "4000": -18_000, "2200": -1_260, "1000": 19_260 });
  eq("P5.5", "JV ใบคืน R2: Dr 2120 5,000 · Cr เงินสด 5,000 (ไม่แตะรายได้/VAT)", await jvOf("R2", "REFUNDED"), { "2120": -5_000, "1000": 5_000 });
  const cn1 = await doc("R1", "CREDIT_NOTE");
  const cn2 = await doc("R2", "CREDIT_NOTE");
  eq("P5.6", "ใบลดหนี้ R1: 19,260 · VAT 1,260 · บรรทัด 7% · R2 ไม่มีใบลดหนี้ (ไม่มีมูลค่าขาย)", [cn1?.grandTotal, cn1?.vatAmount, cn1?.lines.map((l: Any) => l.vatRateBp), cn2], [19_260, 1_260, [700], null]);
  await posSvc.voidSale(tid, unit.id, sales.B6.id, { actorUserId: owner.id, reason: "QC T1.8 ยกเลิกบิลผสม" });
  await drain();
  const paid6 = await prisma.accountJournalEntry.findFirst({ where: { systemId: SYS, idempotencyKey: `PosSale#${sales.B6.id}#PAID` }, select: { id: true } });
  const rev6 = await prisma.accountJournalEntry.findMany({ where: { systemId: SYS, OR: [{ id: paid6?.id ?? "-" }, { reversalOfId: paid6?.id ?? "-" }] }, include: { lines: { include: { account: { select: { code: true } } } } } });
  const net2120 = rev6.flatMap((e: Any) => e.lines).filter((l: Any) => l.account.code === "2120").reduce((n: number, l: Any) => n + l.credit - l.debit, 0);
  chk("P5.7", "ยกเลิกบิลผสม B6: JV กลับทั้งก้อน · 2120 สุทธิ 0 · 2200 สุทธิ 0", rev6.length >= 2 && net2120 === 0 && rev6.flatMap((e: Any) => e.lines).filter((l: Any) => l.account.code === "2200").reduce((n: number, l: Any) => n + l.credit - l.debit, 0) === 0, "0/0", rev6.map((e: Any) => e.memo));

  // ═══ P6 รายงานภาษีขาย + ภ.พ.30 + บัญชีเก็บแทน ═══
  console.log(`\n── P6 รายงานภาษีขาย ${M} · ภ.พ.30 · บัญชี 2120 ──`);
  const r = await STR.salesTaxReport(ctx, M, { abbMode: "PER_BILL" });
  eq("P6.1", "กลุ่มอัตรา: 7% 28,081/1,966 · 0% 20,000 · ยกเว้น 25,603 (เก็บแทนไม่อยู่ในรายงาน)", r.groups.map((g: Any) => [g.rateBp, g.base, g.vat]), [[700, 28_081, 1_966], [0, 20_000, 0], [-1, 25_603, 0]]);
  const ck = Object.fromEntries(r.checks.map((c: Any) => [c.key, c]));
  chk("P6.2", "ข้อตรวจรายงาน: = GL 2200 · ฐานสอดคล้องภาษีทุกแถว", ck.GL_2200?.ok && ck.BASE_VAT?.ok, "ok", r.checks.filter((c: Any) => !c.ok));
  const b3row = r.rows.find((x: Any) => x.docNo === sales.B3.receiptNo);
  eq("P6.3", "แถว B3: 7% 18,000/1,260 + ยกเว้น 9,000", b3row?.parts, [{ rateBp: 700, base: 18_000, vat: 1_260 }, { rateBp: -1, base: 9_000, vat: 0 }]);
  const pp = await REP.pp30(ctx, M);
  eq("P6.4", "ภ.พ.30: ภาษีขาย 1,966 · byRate 7%/0%/ยกเว้น", [pp.output.total, pp.output.byRate], [1_966, [{ rateBp: 700, base: 28_081, vat: 1_966 }, { rateBp: 0, base: 20_000, vat: 0 }, { rateBp: -1, base: 25_603, vat: 0 }]]);
  const tb = await REP.trialBalance(ctx, M, M);
  const t2120 = tb.rows?.find?.((x: Any) => x.code === "2120");
  eq("P6.5", "งบทดลองเดือนนี้ บัญชี 2120: เคลื่อนไหว Cr 10,000 / Dr 10,000 (B3 · B6 · void B6 · คืน R2)", [t2120?.movementCredit, t2120?.movementDebit], [10_000, 10_000], "MAJOR");

  // ═══ P7 บิลเก่า (ไม่มีชนิด) อ่านเหมือนเดิม ═══
  console.log("\n── P7 บิลเก่า ──");
  const old = VL.storedVatGroups({ grandTotalSatang: 16_050, vatSatang: 1_050 });
  eq("P7.1", "บิลเก่า (ไม่มีคอลัมน์กลุ่ม): ยอดมาตรฐาน = ยอดบิล · ฐาน 15,000 · ไม่ผสม", [old.standardGross, old.base, old.mixed], [16_050, 15_000, false]);
  const scope = await accEnv.resolveAccV2Scope(prisma);
  if (scope) {
    const seedPos = await prisma.posSale.findMany({ where: { tenantId: scope.tenantId }, select: { vatSatang: true, grandTotalSatang: true, zeroRatedSatang: true, exemptSatang: true, onBehalfSatang: true }, take: 50 });
    chk("P7.2", "บิล POS ของชุดข้อมูลกลาง: กลุ่ม 0/0/0 ทุกใบ (ค่าปริยายของคอลัมน์ใหม่) ⇒ อ่านเหมือนเดิม", seedPos.every((x: Any) => x.zeroRatedSatang === 0 && x.exemptSatang === 0 && x.onBehalfSatang === 0 && VAT.splitIncludedVat(x.grandTotalSatang, 700).vatSatang === x.vatSatang), "เดิม", seedPos.slice(0, 3), "MAJOR");
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
    const sys = await prisma.appSystem.findMany({ where: { tenantId: tid }, select: { id: true, type: true } });
    console.log(`KEEP=1 → ร้าน ${tid} · ${JSON.stringify(sys)}`);
  }
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T1.8 POS VAT per line =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.length > 0 ? 1 : 0);

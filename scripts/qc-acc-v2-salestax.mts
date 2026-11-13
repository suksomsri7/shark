// QC ACC T1.1 — รายงานภาษีขาย (ภาษีขายของ ภ.พ.30): ฐานภาษีจริงของบิล POS · ใบย่อรวมรายวัน/เครื่อง + ช่วงเลขที่ ·
//   หัวรายงานครบ · ใบหักมัดจำฐานตรง VAT · หมายเหตุใบยกเลิก · กระทบยอด ภ.พ.30 / GL 2200
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md T1.1 (ปิด E6 J3 A7) · design note ledger/wo-notes/T1.1.md
// กฎ: skill shark-thai-law common-vat-invoice.md §18 · domain-shark-accounting-cases.md §1.3 §1.5
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง "QC T1.1 ภาษีขาย" สร้างเอง ลบตอนจบ — KEEP=1 = เก็บไว้ดูหน้าจอ + ให้เจ้าของ QC เข้าได้)
//   ไม่เพิ่มข้อมูลใน seed กลาง (เฉลยของชุดอื่นผูกยอด POS/ผู้ติดต่อ/การเงินของ seed กลางหลายจุด)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-salestax.mts
//
// เดือนของฟิกซ์เจอร์ = เดือนปัจจุบันตามเวลาไทย (M) — การยกเลิกเอกสาร/บิลลงวันที่ "วันนี้" เสมอ (reverseFor) จึงผูกเดือนจริง
//   วันขาย d1 = วันที่ 1 · d2 = วันที่ 2 ของเดือน M · เดือนก่อน P = M−1 (ใบที่ยกเลิกข้ามเดือน)
//
// เฉลยมือ (สตางค์ · ราคา POS รวม VAT 7% เลือกให้หารลงตัว):
//   POS (สาขาเดียว · 2 เครื่อง):            d1 เครื่อง A: S1 107,000 · S2 53,500   d1 เครื่อง B: S3 214,000
//                                          d2 เครื่อง A: S4 32,100 · S5 10,700 (ยกเลิกวันเดียวกัน)   d2 เครื่อง B: S6 428,000 → ออกใบเต็มรูปแทน
//     ฐาน/VAT: S1 100,000/7,000 · S2 50,000/3,500 · S3 200,000/14,000 · S4 30,000/2,100 · S5 10,000/700 · S6 400,000/28,000
//     ต่อเครื่อง: d1A 150,000/10,500 (2 ใบ) · d1B 200,000/14,000 (1 ใบ) · d2A 30,000/2,100 (2 ใบ ยกเลิก 1) · S6 = แถวใบกำกับเต็มรูป 400,000/28,000
//     ต่อสาขา:   d1 350,000/24,500 (3 ใบ) · d2 30,000/2,100 (2 ใบ ยกเลิก 1)
//   เอกสารบัญชี:
//     RA ใบเสร็จขายสด d1 ผู้ซื้อ ก (0105555000011 สาขา 00001) แยก VAT: 7% 1,000,000 · 0% 200,000 · ยกเว้น 100,000 → VAT 70,000
//     DR ใบรับมัดจำ d1 ผู้ซื้อ ข (0105555000022 สนญ.) แยก VAT 300,000 → VAT 21,000
//     IV ใบแจ้งหนี้ d1 ผู้ซื้อ ข 1,000,000 + VAT หักมัดจำ DR 321,000 → แปลงเป็น TX (วันนี้): ฐาน 700,000 VAT 49,000 (ใบหักมัดจำ)
//     CN ใบลดหนี้ d2 อ้าง RA 100,000 + VAT → −100,000 / −7,000
//     RC ใบเสร็จขายสด d2 ผู้ซื้อ ก 214,000 รวม VAT → ยกเลิกเดือนเดียวกัน → 0 / 0 + หมายเหตุ "ยกเลิก"
//     RP ใบเสร็จขายสด เดือน P ผู้ซื้อ ก 53,500 รวม VAT → ยกเลิกวันนี้ → เดือน P: 50,000/3,500 · เดือน M: −50,000/−3,500 + หมายเหตุ
//   รวมเดือน M กลุ่ม 7%: ฐาน 1,000,000+300,000+150,000+200,000−100,000+0+30,000+400,000+700,000−50,000 = 2,630,000
//                         VAT 70,000+21,000+10,500+14,000−7,000+0+2,100+28,000+49,000−3,500 = 184,100
//   กลุ่ม 0% 200,000 · ยกเว้น 100,000 · ฐานรวม 2,930,000 · VAT รวม 184,100 = GL 2200 เดือน M
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-salestax");

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
const SH: Any = await import("@/lib/modules/account/sales-tax-shared" as string);
const STR: Any = await import("@/lib/modules/account/sales-tax-report" as string);
const REP: Any = await import("@/lib/modules/account/reports" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
const accIdx: Any = await import("@/lib/modules/account" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);
const posSvc: Any = await import("@/lib/modules/pos/service" as string);
const devMod: Any = await import("@/lib/modules/pos/device" as string);
const shiftMod: Any = await import("@/lib/modules/pos/shift" as string);
const settingsCore: Any = await import("@/lib/core/settings" as string);
const { drainAll } = (await import("@/lib/outbox-consumers" as string)) as Any;
const accEnv: Any = await import("./acc-v2-env.mts" as string);

// ── เดือน M / P ตามเวลาไทย ──
const bkk = new Date(Date.now() + 7 * 3600_000);
const M = bkk.toISOString().slice(0, 7);
const [my, mm] = M.split("-").map(Number);
const P = mm === 1 ? `${my - 1}-12` : `${my}-${String(mm - 1).padStart(2, "0")}`;
const day = (ym: string, d: number) => new Date(`${ym}-${String(d).padStart(2, "0")}T10:00:00+07:00`);
const d1 = day(M, 1);
const d2 = day(M, 2);
const TODAY_YMD = bkk.toISOString().slice(0, 10);
const ymd = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
console.log(`เดือนฟิกซ์เจอร์ M=${M} · P=${P} · วันนี้ ${TODAY_YMD}`);

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

const TENANT_NAME = "QC T1.1 ภาษีขาย";
const OWNER_EMAIL = "qc-t11-salestax@qc.local";
let tid = "";

// ═══ S0 ตัวคิดบริสุทธิ์ (ไม่แตะ DB) ═══
console.log("\n── S0 ตัวคิดฐานแยกกลุ่มอัตรา / รวมใบย่อ / หัวรายงาน (pure) ──");
{
  // ใบเสร็จแยก VAT สามอัตรา
  const g = SH.rateGroupsOf({ vatMode: "EXCLUDE", discountAmount: 0, grandTotal: 1_370_000, lines: [{ amount: 1_000_000, vatRateBp: 700 }, { amount: 200_000, vatRateBp: 0 }, { amount: 100_000, vatRateBp: -1 }] }, 70_000, 700);
  eq("S0.1", "แยกกลุ่ม 7% / 0% / ยกเว้น จากบรรทัด (ภาษีจาก GL)", g, [{ rateBp: 700, base: 1_000_000, vat: 70_000 }, { rateBp: 0, base: 200_000, vat: 0 }, { rateBp: -1, base: 100_000, vat: 0 }]);
  // บิล POS ที่หักมัดจำ: subTotal เต็ม แต่ grandTotal หลังหักมัดจำ 107,000 (รวม VAT) · VAT ใน GL = 7,000 − VAT มัดจำ 7,000 → บิล 214,000 หักมัดจำ 107,000 เหลือ 107,000 VAT 7,000
  const dep = SH.rateGroupsOf({ vatMode: "INCLUDE", discountAmount: 0, grandTotal: 107_000, lines: [{ amount: 214_000, vatRateBp: 700 }] }, 7_000, 700);
  eq("S0.2", "บิลหักมัดจำ: ฐาน = ยอดหลังหักมัดจำ − VAT (สอดคล้อง VAT · เดิมได้ฐานเต็ม 200,000)", dep, [{ rateBp: 700, base: 100_000, vat: 7_000 }]);
  const cn = SH.rateGroupsOf({ vatMode: "EXCLUDE", discountAmount: 0, grandTotal: 107_000, lines: [{ amount: 100_000, vatRateBp: 700 }] }, -7_000, 700);
  eq("S0.3", "ใบลดหนี้: ฐาน/ภาษีติดลบตามทิศ GL", cn, [{ rateBp: 700, base: -100_000, vat: -7_000 }]);
  const noDoc = SH.rateGroupsOf(null, 69_673, 700, { grossFallback: 1_065_000 });
  eq("S0.4", "บิล POS ไม่มีเอกสาร: ฐาน = ยอดบิล − VAT ของ GL", noDoc, [{ rateBp: 700, base: 995_327, vat: 69_673 }]);
  const disc = SH.rateGroupsOf({ vatMode: "EXCLUDE", discountAmount: 30_000, grandTotal: 282_600, lines: [{ amount: 200_000, vatRateBp: 700 }, { amount: 100_000, vatRateBp: 0 }] }, 12_600, 700);
  eq("S0.5", "ส่วนลดท้ายบิล 300 ข้ามอัตรา เกลี่ยตามสัดส่วนฐาน: 7% 1,800/126 · 0% 900", disc, [{ rateBp: 700, base: 180_000, vat: 12_600 }, { rateBp: 0, base: 90_000, vat: 0 }]);
  chk("S0.6", "ฐานสอดคล้อง VAT: 100,000 × 7% = 7,000 ✓ · 200,000 กับ 7,000 ✗", SH.partConsistent({ rateBp: 700, base: 100_000, vat: 7_000 }, 100) && !SH.partConsistent({ rateBp: 700, base: 200_000, vat: 7_000 }, 100), "true/false", "?");
  eq("S0.7", "เดือนภาษีภาษาไทย", [SH.taxMonthLabelTh("2026-09"), SH.taxMonthLabelTh("2027-01")], ["กันยายน 2569", "มกราคม 2570"], "MAJOR");
  eq("S0.8", "สาขาผู้ขาย/ผู้ซื้อ", [SH.sellerBranchLabelTh("00000", "สำนักงานใหญ่"), SH.sellerBranchLabelTh("00003", "ป่าตอง"), SH.buyerBranchLabelTh("00000"), SH.buyerBranchLabelTh("00001"), SH.buyerBranchLabelTh("")], ["สำนักงานใหญ่", "สาขาที่ 00003 (ป่าตอง)", "สำนักงานใหญ่", "สาขาที่ 00001", ""], "MAJOR");
  chk("S0.9", "หัวรายงานไม่มีเลข 13 หลัก/ชื่อ → คำเตือน (ไม่บล็อก)", SH.headerWarningsTh({ orgName: "", taxId: "123" }).length === 2 && SH.headerWarningsTh({ orgName: "ร้าน", taxId: "0105566012345" }).length === 0, 2, SH.headerWarningsTh({ orgName: "", taxId: "123" }));
  const bill = (no: string, date: string, dev: string, vat: number, cancelled = false) => ({ key: no, kind: "ABB", date, docNo: no, buyerName: "", buyerTaxId: "", buyerBranchCode: "", parts: [{ rateBp: 700, base: cancelled ? 0 : vat * 100 / 7, vat: cancelled ? 0 : vat }], base: 0, vat: 0, notes: [], cancelled, unitId: "u1", unitName: "สาขา 1", deviceCode: dev, deviceName: `เครื่อง ${dev}`, posRegNo: null });
  const bills = [bill("202611-0010", "2026-11-01", "A", 700), bill("202611-0002", "2026-11-01", "A", 1_400), bill("202611-0003", "2026-11-01", "B", 2_100), bill("202611-0011", "2026-11-02", "A", 700, true)];
  const byDev = SH.summarizeAbb(bills, "DAILY_DEVICE");
  const a1 = byDev.find((r: Any) => r.date === "2026-11-01" && r.deviceCode === "A");
  chk("S0.10", "รวมใบย่อต่อวัน/เครื่อง: ช่วงเลขเรียงแบบตัวเลข 202611-0002 ถึง 202611-0010 · 2 ใบ · VAT 2,100", byDev.length === 3 && a1?.docNo === "202611-0002" && a1?.docNoTo === "202611-0010" && a1?.count === 2 && a1?.vat === 2_100, "3 แถว", byDev.map((r: Any) => [r.date, r.deviceCode, r.docNo, r.docNoTo, r.count, r.vat]));
  const c2 = byDev.find((r: Any) => r.date === "2026-11-02");
  chk("S0.11", "ใบยกเลิกในช่วง: นับในจำนวนใบ + หมายเหตุ 'ยกเลิก 1 ใบ'", c2?.count === 1 && c2?.cancelledCount === 1 && c2?.notes.some((n: string) => n.startsWith("ยกเลิก 1 ใบ")), "ยกเลิก 1", c2);
  eq("S0.12", "รวมต่อสาขา → 2 แถว · ทุกใบ → 4 แถว", [SH.summarizeAbb(bills, "DAILY_BRANCH").length, SH.summarizeAbb(bills, "PER_BILL").length], [2, 4], "MAJOR");
  const rows = [
    { key: "x", kind: "DOC", date: "2026-11-02", docNo: "RE-2", parts: [{ rateBp: 700, base: 100, vat: 7 }, { rateBp: 0, base: 50, vat: 0 }], notes: [] },
    { key: "y", kind: "DOC", date: "2026-11-01", docNo: "RE-9", parts: [{ rateBp: 0, base: 20, vat: 0 }], notes: [] },
    { key: "z", kind: "DOC", date: "2026-11-01", docNo: "RE-10", parts: [{ rateBp: 700, base: 0, vat: 0 }], notes: [], cancelled: true },
  ];
  const { groups } = SH.groupByRate(rows, 700);
  eq("S0.13", "กลุ่มอัตรา: 7% ก่อน 0% · แถวในกลุ่มเรียงวันที่→เลขที่ · ลำดับที่นับทั้งรายงาน · แถวหลายอัตราขึ้นทุกกลุ่ม", groups.map((g: Any) => [g.rateBp, g.rows.map((r: Any) => `${r.seq}:${r.row.docNo}:${r.part.base}`), g.base]), [[700, ["2:RE-10:0", "3:RE-2:100"], 100], [0, ["1:RE-9:20", "3:RE-2:50"], 70]]);
}

try {
  // ═══ S1 ฟิกซ์เจอร์ ═══
  console.log("\n── S1 ฟิกซ์เจอร์ร้าน T1.1 ──");
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } })) await purgeTenant(old.id);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t11-salestax-${Date.now().toString(36)}`, status: "ACTIVE", enabledModules: ["ACCOUNT", "POS"] } })).id;
  const owner =
    (await prisma.user.findFirst({ where: { email: OWNER_EMAIL } })) ?? (await prisma.user.create({ data: { email: OWNER_EMAIL, name: "เจ้าของ T1.1" } }));
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "สาขาตลาดใหม่", slug: `t11-${Date.now().toString(36)}`, status: "ACTIVE" } });
  const accSys = await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T1.1");
  const posSys = await sysSvc.createSystem(tid, "POS", "ขายหน้าร้าน T1.1");
  await sysSvc.linkUnit(tid, accSys.id, unit.id);
  await sysSvc.linkUnit(tid, posSys.id, unit.id);
  const SYS = accSys.id;
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: SYS, linkedKind: "POS", linkedId: posSys.id } });
  await acc.saveSettings(tid, SYS, {
    orgPrefix: "บริษัท",
    orgName: "ทีวันวัน ภาษีขาย จำกัด",
    taxId: "0105566012345",
    branchCode: "00000",
    branchName: "สำนักงานใหญ่",
    address: "1 ถ.ทดสอบ กรุงเทพฯ 10110",
    vatRegistered: true,
    taxPointBasis: "ON_ISSUE",
  });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const ctx = { tenantId: tid, systemId: SYS };
  const ownerActor = { userId: owner.id, role: "OWNER", unitAccess: ["*"], permissions: {} };

  // เครื่องขาย 2 เครื่อง + กะ
  const DEV_A = `t11dev${Date.now().toString(36)}a`;
  const DEV_B = `t11dev${Date.now().toString(36)}b`;
  const pctx = { tenantId: tid, systemId: posSys.id, unitId: unit.id };
  const rgA = await devMod.registerDevice(pctx, ownerActor, { name: "เครื่องหน้าร้าน", deviceCode: DEV_A });
  const rgB = await devMod.registerDevice(pctx, ownerActor, { name: "เครื่องบาร์", deviceCode: DEV_B });
  await prisma.posDevice.updateMany({ where: { tenantId: tid, deviceCode: DEV_A }, data: { posRegNo: "E0123456789" } });
  const shA = await shiftMod.openShift({ ...pctx, deviceId: DEV_A }, ownerActor, { deviceId: DEV_A, deviceLabel: "เครื่องหน้าร้าน", floatSatang: 0 });
  const shB = await shiftMod.openShift({ ...pctx, deviceId: DEV_B }, ownerActor, { deviceId: DEV_B, deviceLabel: "เครื่องบาร์", floatSatang: 0 });
  chk("S1.1", "ลงทะเบียนเครื่อง 2 เครื่อง + เปิดกะ", rgA?.ok && rgB?.ok && shA?.ok && shB?.ok, "ok", [rgA?.ok, rgB?.ok, shA?.ok, shB?.ok]);
  const shiftA = (await prisma.posShift.findFirst({ where: { tenantId: tid, deviceId: DEV_A, status: "OPEN" } }))?.id;
  const shiftB = (await prisma.posShift.findFirst({ where: { tenantId: tid, deviceId: DEV_B, status: "OPEN" } }))?.id;

  const sales: Record<string, { id: string; receiptNo: string }> = {};
  const sell = async (key: string, shiftId: string, date: Date, gross: number) => {
    const r = await prisma.$transaction((tx: Any) =>
      posSvc.createSale(
        {
          tenantId: tid,
          unitId: unit.id,
          systemId: posSys.id,
          shiftId,
          idempotencyKey: `t11-${tid}-${key}`,
          lines: [{ name: `สินค้า ${key}`, qty: 1, unitPriceSatang: gross }],
          payMethods: [{ type: "CASH", amountSatang: gross }],
        },
        tx,
      ),
    );
    await prisma.posSale.update({ where: { id: r.saleId }, data: { paidAt: date, createdAt: date } });
    sales[key] = { id: r.saleId, receiptNo: r.receiptNo };
  };
  await sell("S1", shiftA, d1, 107_000);
  await sell("S2", shiftA, d1, 53_500);
  await sell("S3", shiftB, d1, 214_000);
  await sell("S4", shiftA, d2, 32_100);
  await sell("S5", shiftA, d2, 10_700);
  await sell("S6", shiftB, d2, 428_000);
  await drain();
  await posSvc.voidSale(tid, unit.id, sales.S5.id, { actorUserId: owner.id, reason: "ลูกค้าเปลี่ยนใจ (QC T1.1)" });
  await drain();
  const sup = await accIdx.supersedeAbbWithTaxInvoice({
    tenantId: tid,
    sourceSystemId: posSys.id,
    refId: sales.S6.id,
    buyer: { kind: "JURISTIC", name: "บริษัท ผู้ซื้อหน้าร้าน จำกัด", taxId: "0105555000033", branchCode: "00000", address: "2 ถ.ทดสอบ", email: null },
  });
  chk("S1.2", "บิล POS 6 ใบ ลงบัญชี + void S5 + ออกใบเต็มรูปแทนใบย่อของ S6", sup?.ok === true, "ok", sup);
  const abbDocs = await prisma.accountDocument.findMany({ where: { tenantId: tid, systemId: SYS, docType: "TAX_INVOICE_ABB" }, select: { docNo: true, status: true } });
  chk("S1.3", "เอกสารใบกำกับอย่างย่อ 6 ใบ (เลขที่ = เลขใบเสร็จ POS)", abbDocs.length === 6, 6, abbDocs);

  // ผู้ติดต่อ
  const ca = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ลูกค้าเอ จำกัด", taxId: "0105555000011", branchCode: "00001", branchName: "สาขาบางนา" });
  const cb = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ลูกค้าบี จำกัด", taxId: "0105555000022", branchCode: "00000" });
  const issue = async (label: string, id: string) => {
    const r = await acc.issueDocument(tid, SYS, id);
    if (!r.ok) throw new Error(`ออก ${label} ไม่สำเร็จ: ${r.reason}`);
    return r.docNo as string;
  };
  // RA ใบเสร็จขายสดสามอัตรา
  const ra = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: ca.id, issueDate: d1, vatMode: "EXCLUDE", lines: [
    { description: "สินค้า 7%", qty: 1, unitPrice: 1_000_000, vatRateBp: 700 },
    { description: "ส่งออก 0%", qty: 1, unitPrice: 200_000, vatRateBp: 0 },
    { description: "บริการยกเว้น", qty: 1, unitPrice: 100_000, vatRateBp: -1 },
  ] });
  const raNo = await issue("RA", ra.id);
  // DR ใบรับมัดจำ + IV หักมัดจำ → TX
  const dr = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "DEPOSIT_RECEIPT", contactId: cb.id, issueDate: d1, dueDate: d1, vatMode: "EXCLUDE", lines: [{ description: "มัดจำงาน", qty: 1, unitPrice: 300_000, vatRateBp: 700 }] });
  const drNo = await issue("DR", dr.id);
  const drPay = await acc.recordPayment(tid, SYS, dr.id, { paidAt: d1, channel: "CASH", amount: 321_000 });
  chk("S1.4", "รับเงินมัดจำ 3,210", drPay.ok, "ok", drPay);
  const iv = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "INVOICE", contactId: cb.id, issueDate: d1, dueDate: d2, vatMode: "EXCLUDE", depositReceiptId: dr.id, lines: [{ description: "งานเต็ม", qty: 1, unitPrice: 1_000_000, vatRateBp: 700 }] });
  await issue("IV", iv.id);
  const ivRow = await prisma.accountDocument.findUnique({ where: { id: iv.id }, select: { depositDeducted: true, grandTotal: true } });
  chk("S1.5", "ใบแจ้งหนี้หักมัดจำ 3,210 → ยอดสุทธิ 7,490", ivRow?.depositDeducted === 321_000 && ivRow?.grandTotal === 749_000, "321000/749000", ivRow);
  const conv = await acc.convertDocument(tid, SYS, iv.id, "TAX_INVOICE", owner.id);
  if (!conv.ok) throw new Error(`แปลง IV→TX ไม่สำเร็จ: ${conv.reason}`);
  const txNo = await issue("TX", conv.newId);
  // CN อ้าง RA
  const cn = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "CREDIT_NOTE", contactId: ca.id, sourceDocId: ra.id, issueDate: d2, vatMode: "EXCLUDE", adjustReason: "ลดราคาเพราะสินค้าชำรุด", lines: [{ description: "ลดราคา", qty: 1, unitPrice: 100_000, vatRateBp: 700 }] });
  const cnNo = await issue("CN", cn.id);
  // RC ยกเลิกเดือนเดียวกัน
  const rc = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: ca.id, issueDate: d2, vatMode: "INCLUDE", lines: [{ description: "ขายผิดใบ", qty: 1, unitPrice: 214_000, vatRateBp: 700 }] });
  const rcNo = await issue("RC", rc.id);
  const rcVoid = await acc.voidDocument(tid, SYS, rc.id, "ออกผิดราคา");
  // RP เดือนก่อน ยกเลิกวันนี้
  const rp = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: ca.id, issueDate: day(P, 15), vatMode: "INCLUDE", lines: [{ description: "ขายเดือนก่อน", qty: 1, unitPrice: 53_500, vatRateBp: 700 }] });
  const rpNo = await issue("RP", rp.id);
  const rpVoid = await acc.voidDocument(tid, SYS, rp.id, "ลูกค้าคืนทั้งใบ");
  chk("S1.6", "ยกเลิก RC (เดือนเดียวกัน) + RP (ข้ามเดือน) ได้", rcVoid.ok && rpVoid.ok, "ok", [rcVoid, rpVoid]);
  await drain();

  // ═══ S2 รายงานเดือน M (ค่าเริ่ม: รวมต่อวัน/เครื่อง) ═══
  console.log(`\n── S2 รายงานภาษีขาย ${M} (รวมใบย่อต่อวันต่อเครื่อง) ──`);
  const r = await STR.salesTaxReport(ctx, M);
  eq("S2.1", "ค่าตั้งเริ่มต้น = DAILY_DEVICE", [r.abbModeSetting, r.abbMode], ["DAILY_DEVICE", "DAILY_DEVICE"]);
  eq("S2.2", "หัวรายงาน: ชื่อ · เลข 13 หลัก · สำนักงานใหญ่ · เดือนภาษี · ไม่มีคำเตือน", [r.header.orgName, r.header.taxId, r.header.branchLabel, r.header.monthLabel, r.header.warnings.length], ["บริษัท ทีวันวัน ภาษีขาย จำกัด", "0105566012345", "สำนักงานใหญ่", SH.taxMonthLabelTh(M), 0]);
  const byNo = (no: string) => r.rows.find((x: Any) => x.docNo === no);
  const abbRows = r.rows.filter((x: Any) => x.kind === "ABB_SUMMARY");
  const sumRow = (date: Date, dev: string) => abbRows.find((x: Any) => x.date === ymd(date) && x.deviceCode === dev);
  const a1 = sumRow(d1, DEV_A);
  const b1 = sumRow(d1, DEV_B);
  const a2 = sumRow(d2, DEV_A);
  eq("S2.3", "ใบย่อรวม 3 แถว (d1 เครื่อง A/B · d2 เครื่อง A) — S6 ไม่อยู่ในใบย่อ (ออกใบเต็มรูปแทน)", abbRows.length, 3);
  eq("S2.4", "d1 เครื่อง A: เลขที่ S1 ถึง S2 · 2 ใบ · ฐาน 1,500 VAT 105 · เลขประจำเครื่องในหมายเหตุ", [a1?.docNo, a1?.docNoTo, a1?.count, a1?.base, a1?.vat, a1?.notes?.[0]?.includes("E0123456789")], [sales.S1.receiptNo, sales.S2.receiptNo, 2, 150_000, 10_500, true]);
  eq("S2.5", "d1 เครื่อง B: S3 · 1 ใบ · ฐาน 2,000 VAT 140", [b1?.docNo, b1?.docNoTo, b1?.count, b1?.base, b1?.vat], [sales.S3.receiptNo, sales.S3.receiptNo, 1, 200_000, 14_000]);
  eq("S2.6", "d2 เครื่อง A: S4 ถึง S5 · 2 ใบ (ยกเลิก 1) · ฐาน 300 VAT 21 · หมายเหตุอ้างเลข S5", [a2?.docNo, a2?.docNoTo, a2?.count, a2?.cancelledCount, a2?.base, a2?.vat, a2?.notes?.some((n: string) => n.includes(`ยกเลิก 1 ใบ: ${sales.S5.receiptNo}`))], [sales.S4.receiptNo, sales.S5.receiptNo, 2, 1, 30_000, 2_100, true]);
  eq("S2.7", "กดดูรายใบ: d1 เครื่อง A มี 2 ใบพร้อมฐานจริง", a1?.bills?.map((b: Any) => [b.docNo, b.base, b.vat]), [[sales.S1.receiptNo, 100_000, 7_000], [sales.S2.receiptNo, 50_000, 3_500]]);
  const s6 = r.rows.find((x: Any) => x.kind === "DOC" && x.docType === "TAX_INVOICE" && x.buyerTaxId === "0105555000033");
  eq("S2.8", "S6 = แถวใบกำกับเต็มรูป ฐาน 4,000 VAT 280 + หมายเหตุอ้างเลขใบย่อเดิม (ไม่นับซ้ำ)", [s6?.base, s6?.vat, s6?.date, s6?.notes?.some((n: string) => n.includes(sales.S6.receiptNo))], [400_000, 28_000, ymd(d2), true]);
  const raRow = byNo(raNo);
  eq("S2.9", "RA: ผู้ซื้อ ก + เลข 13 หลัก + สาขา 00001 · กลุ่ม 7%/0%/ยกเว้น", [raRow?.buyerName, raRow?.buyerTaxId, raRow?.buyerBranchCode, raRow?.parts], ["บริษัท ลูกค้าเอ จำกัด", "0105555000011", "00001", [{ rateBp: 700, base: 1_000_000, vat: 70_000 }, { rateBp: 0, base: 200_000, vat: 0 }, { rateBp: -1, base: 100_000, vat: 0 }]]);
  eq("S2.10", "DR ใบรับมัดจำ: ฐาน 3,000 VAT 210 + หมายเหตุมัดจำ", [byNo(drNo)?.base, byNo(drNo)?.vat, byNo(drNo)?.notes?.some((n: string) => n.includes("มัดจำ"))], [300_000, 21_000, true]);
  eq("S2.11", "TX หักมัดจำ: ฐาน 7,000 VAT 490 (ฐานตรง VAT) · ลงวันที่วันนี้", [byNo(txNo)?.base, byNo(txNo)?.vat, byNo(txNo)?.date, byNo(txNo)?.buyerBranchCode], [700_000, 49_000, TODAY_YMD, "00000"]);
  eq("S2.12", "CN: −1,000 / −70 + หมายเหตุอ้าง RA", [byNo(cnNo)?.base, byNo(cnNo)?.vat, byNo(cnNo)?.notes?.some((n: string) => n.includes(raNo))], [-100_000, -7_000, true]);
  eq("S2.13", "RC ยกเลิกเดือนเดียวกัน: แถวยังอยู่ 0/0 + ยกเลิก + เหตุผล", [byNo(rcNo)?.base, byNo(rcNo)?.vat, byNo(rcNo)?.cancelled, byNo(rcNo)?.notes?.some((n: string) => n.includes("ออกผิดราคา"))], [0, 0, true, true]);
  eq("S2.14", "RP ยกเลิกข้ามเดือน: −500/−35 ลงวันที่วันนี้ + หมายเหตุอ้างเลข/วันที่เดิม", [byNo(rpNo)?.base, byNo(rpNo)?.vat, byNo(rpNo)?.date, byNo(rpNo)?.cancelled, byNo(rpNo)?.notes?.some((n: string) => n.includes(`เลขที่ ${rpNo}`) && n.includes("ลูกค้าคืนทั้งใบ"))], [-50_000, -3_500, TODAY_YMD, true, true]);
  eq("S2.15", "กลุ่มอัตรา: 7% → 0% → ยกเว้น · ยอดกลุ่ม", r.groups.map((g: Any) => [g.rateBp, g.base, g.vat]), [[700, 2_630_000, 184_100], [0, 200_000, 0], [-1, 100_000, 0]]);
  eq("S2.16", "รวมทั้งสิ้น ฐาน 29,300 VAT 1,841", r.total, { base: 2_930_000, vat: 184_100 });
  const seq7 = r.groups[0].rows.map((x: Any) => `${x.row.date}|${x.row.docNo}`);
  const sorted7 = [...seq7].sort((a: string, b: string) => a.split("|")[0].localeCompare(b.split("|")[0]) || a.split("|")[1].localeCompare(b.split("|")[1], "en", { numeric: true }));
  eq("S2.17", "แถวในกลุ่ม 7% เรียงวันที่ → เลขที่", seq7, sorted7, "MAJOR");
  chk("S2.18", "ทุกแถวมีวันที่ + เลขที่", r.rows.every((x: Any) => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.docNo), "ครบ", r.rows.filter((x: Any) => !x.docNo));
  const ck = Object.fromEntries(r.checks.map((c: Any) => [c.key, c]));
  chk("S2.19", "ข้อตรวจ: รายงาน = GL 2200 (184,100)", ck.GL_2200?.ok && ck.GL_2200.expected === 184_100, 184_100, ck.GL_2200);
  chk("S2.20", "ข้อตรวจ: ฐานสอดคล้องภาษีทุกแถว", ck.BASE_VAT?.ok, "ok", ck.BASE_VAT);
  chk("S2.21", "ข้อตรวจ: ภาษีบิล POS = ภาษีบนบิลต้นทาง", ck.POS_BILLS?.ok, "ok", ck.POS_BILLS);

  // ═══ S3 ภ.พ.30 + GL ═══
  console.log("\n── S3 ภ.พ.30 / GL 2200 / CSV ──");
  const pp = await REP.pp30(ctx, M);
  const tb = await REP.trialBalance(ctx, M, M);
  const r2200 = tb.rows?.find?.((x: Any) => x.code === "2200");
  const gl2200 = r2200 ? r2200.movementCredit - r2200.movementDebit : null;
  eq("S3.1", "ภ.พ.30 ภาษีขาย = 1,841 = รายงาน", [pp.output.total, pp.salesTax.total.vat], [184_100, 184_100]);
  chk("S3.2", "ภ.พ.30 ข้อตรวจ PP30 + GL_2200 ผ่าน", pp.salesTax.checks.every((c: Any) => c.ok), "ทุกข้อผ่าน", pp.salesTax.checks.filter((c: Any) => !c.ok));
  if (gl2200 !== null) eq("S3.3", "งบทดลองเดือน M: เครดิตสุทธิ 2200 = 1,841 (คิวรีคนละทาง)", gl2200, 184_100, "MAJOR");
  eq("S3.4", "ภ.พ.30 ฐานภาษีขาย = ฐานรวมรายงาน 29,300", pp.output.base, 2_930_000, "MAJOR");
  eq("S3.5", "ภ.พ.30 byRate = กลุ่มรายงาน", pp.output.byRate, [{ rateBp: 700, base: 2_630_000, vat: 184_100 }, { rateBp: 0, base: 200_000, vat: 0 }, { rateBp: -1, base: 100_000, vat: 0 }], "MAJOR");
  const prev = await STR.salesTaxReport(ctx, P);
  eq("S3.6", `เดือน P (${P}): RP 500/35 ปกติ · = GL`, [prev.rows.map((x: Any) => [x.docNo, x.base, x.vat, !!x.cancelled]), prev.checks.find((c: Any) => c.key === "GL_2200")?.ok], [[[rpNo, 50_000, 3_500, false]], true]);
  const csv: string = await REP.pp30Csv(ctx, M);
  chk("S3.7", "CSV: BOM + หัวรายงาน (ชื่อ · เลข 13 หลัก · สถานประกอบการ · เดือนภาษี)", csv.charCodeAt(0) === 0xfeff && csv.includes("บริษัท ทีวันวัน ภาษีขาย จำกัด") && csv.includes("0105566012345") && csv.includes("สำนักงานใหญ่") && csv.includes(SH.taxMonthLabelTh(M)), "ครบ", csv.slice(0, 300));
  chk("S3.8", "CSV: แถวใบย่อมีช่วงเลขที่ + จำนวนใบ · แถวยกเลิกมีหมายเหตุ · ยอดรวม 1,841.00", csv.includes(`${sales.S1.receiptNo}","${sales.S2.receiptNo}`) || (csv.includes(sales.S1.receiptNo) && csv.includes(sales.S2.receiptNo)), "มี", "?");
  chk("S3.9", "CSV: รวมภาษีขายทั้งสิ้น 29300.00 / 1841.00 + ข้อตรวจกระทบยอด", /รวมภาษีขายทั้งสิ้น[^\n]*29300\.00[^\n]*1841\.00/.test(csv) && csv.includes("ข้อตรวจกระทบยอด") && csv.includes("ยกเลิก"), "มี", csv.split("\n").filter((l) => l.includes("รวมภาษีขาย")));
  chk("S3.10", "CSV: หัวกลุ่มอัตราอยู่เหนือแถวของกลุ่ม (อัตรา 7 → แถว → รวมอัตรา 7 → อัตรา 0)", (() => {
    const L = csv.split("\n");
    const h7 = L.findIndex((l) => l.startsWith("อัตราร้อยละ 7") || l.startsWith('"อัตราร้อยละ 7'));
    const t7 = L.findIndex((l) => l.includes("รวมอัตราร้อยละ 7"));
    const h0 = L.findIndex((l) => l.startsWith("อัตราร้อยละ 0") || l.startsWith('"อัตราร้อยละ 0'));
    return h7 >= 0 && t7 > h7 + 1 && h0 > t7;
  })(), "เรียงถูก", "?", "MAJOR");

  // ═══ S4 ค่าตั้ง + ดูชั่วคราว ═══
  console.log("\n── S4 ค่าตั้งรูปแบบใบย่อ ──");
  const byBranch = await STR.salesTaxReport(ctx, M, { abbMode: "DAILY_BRANCH" });
  const br = byBranch.rows.filter((x: Any) => x.kind === "ABB_SUMMARY").map((x: Any) => [x.date, x.docNo, x.docNoTo, x.count, x.base, x.vat]);
  eq("S4.1", "ดูชั่วคราวรวมต่อสาขา: d1 S1–S3 3 ใบ 3,500/245 · d2 S4–S5 2 ใบ 300/21 · ยอดรวมไม่เปลี่ยน", [br, byBranch.total], [[[ymd(d1), sales.S1.receiptNo, sales.S3.receiptNo, 3, 350_000, 24_500], [ymd(d2), sales.S4.receiptNo, sales.S5.receiptNo, 2, 30_000, 2_100]], r.total]);
  const perBill = await STR.salesTaxReport(ctx, M, { abbMode: "PER_BILL" });
  eq("S4.2", "แสดงทุกใบ: ใบย่อ 5 แถว (รวม S5 ที่ยกเลิก 0/0) · ยอดรวมไม่เปลี่ยน", [perBill.rows.filter((x: Any) => x.kind === "ABB").length, perBill.total], [5, r.total]);
  const save = await settingsCore.setSettings({ ...ownerActor }, { tenantId: tid }, [{ key: "account.report.salesTaxAbbMode", scope: "ACCOUNT_BOOK", scopeId: SYS, value: "PER_BILL" }]);
  const afterSave = await STR.salesTaxReport(ctx, M);
  chk("S4.3", "บันทึกค่าตั้ง PER_BILL ผ่านเครื่องยนต์ค่าตั้ง → รายงานใช้ค่านั้น", save.ok === true && afterSave.abbModeSetting === "PER_BILL" && afterSave.abbMode === "PER_BILL", "PER_BILL", [save, afterSave.abbMode]);
  const badSave = await settingsCore.setSettings({ ...ownerActor }, { tenantId: tid }, [{ key: "account.report.salesTaxAbbMode", scope: "ACCOUNT_BOOK", scopeId: SYS, value: "WEEKLY" }]);
  chk("S4.4", "ค่าที่ไม่รู้จักถูกปฏิเสธ (รูปแบบข้อมูล)", badSave.ok === false, "ปฏิเสธ", badSave, "MAJOR");
  const staff = await settingsCore.setSettings({ userId: owner.id, role: "STAFF", unitAccess: ["*"], permissions: {} }, { tenantId: tid }, [{ key: "account.report.salesTaxAbbMode", scope: "ACCOUNT_BOOK", scopeId: SYS, value: "DAILY_BRANCH" }]);
  chk("S4.5", "พนักงานที่ไม่มีสิทธิ์ตั้งค่าบัญชีบันทึกไม่ได้", staff.ok === false, "ปฏิเสธ", staff, "MAJOR");
  await settingsCore.setSettings({ ...ownerActor }, { tenantId: tid }, [{ key: "account.report.salesTaxAbbMode", scope: "ACCOUNT_BOOK", scopeId: SYS, value: "DAILY_DEVICE" }]);

  // ═══ S5 หัวรายงานไม่ครบ → เตือน ไม่บล็อก ═══
  await prisma.accountSettings.updateMany({ where: { tenantId: tid, systemId: SYS }, data: { taxId: "" } });
  const noTax = await STR.salesTaxReport(ctx, M);
  chk("S5.1", "ร้านยังไม่กรอกเลขผู้เสียภาษี → คำเตือนบนหัวรายงาน แต่รายงานยังออกครบ", noTax.header.warnings.length === 1 && noTax.total.vat === 184_100, "1 คำเตือน", noTax.header.warnings);
  await prisma.accountSettings.updateMany({ where: { tenantId: tid, systemId: SYS }, data: { taxId: "0105566012345" } });

  // ═══ S6 ชุดข้อมูลกลาง (seed) ก.ย.: บิล POS 2 ใบไม่ใช่ ฐาน 0 / "อัตรา 0%" อีกต่อไป ═══
  console.log("\n── S6 seed กลาง ก.ย. 2569 (E6/J3 baseline) ──");
  const scope = await accEnv.resolveAccV2Scope(prisma);
  if (!scope) chk("S6.0", "มีชุดข้อมูลกลาง", false, "มี", "ไม่มี — รัน seed ก่อน", "MAJOR");
  else {
    const sep = await STR.salesTaxReport(scope, "2026-09", { abbMode: "PER_BILL" });
    const posRows = sep.rows.filter((x: Any) => x.kind === "ABB");
    eq("S6.1", "บิล POS ก.ย. 2 ใบ: เลขใบย่อ (ไม่ใช่เลข SV) · ฐาน 9,953.27/2,663.55 · VAT 696.73/186.45 · กลุ่ม 7%", posRows.map((x: Any) => [/^SV-/.test(x.docNo), x.base, x.vat, x.parts.map((p: Any) => p.rateBp)]), [[false, 995_327, 69_673, [700]], [false, 266_355, 18_645, [700]]]);
    chk("S6.2", "ไม่มีกลุ่ม 'อัตรา 0%' ปลอมจากบิล POS · ข้อตรวจผ่านทุกข้อ", !sep.groups.some((g: Any) => g.rateBp === 0 && g.rows.some((x: Any) => x.row.kind === "ABB")) && sep.checks.every((c: Any) => c.ok), "ผ่าน", sep.checks.filter((c: Any) => !c.ok));
    eq("S6.3", "หัวรายงาน seed: ชื่อ/เลข/สนญ.", [sep.header.orgName, sep.header.taxId, sep.header.branchLabel], ["บริษัท สยามไดฟ์ คิวซี จำกัด", "0835565001234", "สำนักงานใหญ่"], "MAJOR");
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
    // เก็บไว้ดูหน้าจอ: ให้เจ้าของ QC (qc-owner) เข้าร้านนี้ได้
    const qcOwner = await prisma.user.findFirst({ where: { email: accEnv.QC.ownerEmail }, select: { id: true } });
    if (qcOwner) await prisma.membership.upsert({ where: { userId_tenantId: { userId: qcOwner.id, tenantId: tid } }, create: { userId: qcOwner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() }, update: {} }).catch((e: unknown) => console.log(`membership: ${String(e)}`));
    const sys = await prisma.appSystem.findFirst({ where: { tenantId: tid, type: "ACCOUNT" }, select: { id: true } });
    console.log(`KEEP=1 → ร้าน ${tid} · /app/sys/${sys?.id}/account/reports/pp30?period=${M}`);
  }
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T1.1 sales tax report =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.length > 0 ? 1 : 0);

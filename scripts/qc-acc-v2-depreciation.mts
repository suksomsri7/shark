// QC ACC T4.3 — ค่าเสื่อม: เดือนแรกตามส่วนของวัน · ที่ดินไม่คิด · คำเตือนเพดานอัตรา/รถยนต์นั่ง 1 ล้าน (ปิด D11 D12) · design note ledger/wo-notes/T4.3.md
// กฎ: skill domain-business-income-tax §ก5 [V] (พ.ร.ฎ.145 ม.4 ม.4 จัตวา ม.5) · domain-accounting-books §ข [V] (NPAEs 10.25 10.30) · test-rules T-ACC-23
// ร้านทดสอบแยก "QC T4.3 ค่าเสื่อม" (ลบตอนจบ · KEEP=1 เก็บ) · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-depreciation.mts
//
// เฉลยมือ (สตางค์):
//   A ทุน 3,600,100 ซาก 100 อายุ 36 เริ่ม 16 มี.ค. 2026 (31 วัน ใช้ 16 วัน) · ฐาน 3,600,000
//     งวด 1 = round(3,600,000 × 16 ÷ (36 × 31)) = round(51,612.90) = 51,613 · งวด 2–36 = 100,000 · งวด 37 = 3,600,000 − 51,613 − 35×100,000 = 48,387
//   B เหมือน A แต่เริ่ม 1 มี.ค. → 36 งวด × 100,000 (ไม่เฉลี่ย)
//   C ทุน 12,000,000 ซาก 100 อายุ 60 เริ่ม 10 ก.พ. 2026 (28 วัน ใช้ 19) · ฐาน 11,999,900 · งวด 1 = round(11,999,900×19÷1680) = round(135,713.15) = 135,713
//     ปกติ round(11,999,900÷60) = 199,998 · งวด 61 = 11,999,900 − 135,713 − 59×199,998 = 64,305
//   D เริ่ม 31 ม.ค. (ใช้ 1 วัน ใน 31) ฐาน 3,600,000 อายุ 36 → round(3,600,000 ÷ 1116) = round(3,225.81) = 3,226
//   ที่ดิน = 0 ทุกงวด
//   คำเตือน: อาคาร 120 ด. = 10%/ปี > 5% · อาคาร 240 ด. = 5% ไม่เตือน · คอมพิวเตอร์ 24 ด. < 3 รอบ เตือน · 36 ด. ไม่เตือน
//            อื่น 36 ด. = 33.33% > 20% เตือน · 60 ด. = 20% ไม่เตือน · รถยนต์นั่ง 150,000,000 > 100,000,000 → ส่วนเกิน 500,000.00 บาท
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-depreciation");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 900)}`}`);
};
const eq = (id: string, n: string, act: unknown, exp: unknown, sev: Sev = "CRITICAL") => chk(id, n, JSON.stringify(act) === JSON.stringify(exp), exp, act, sev);

const KEEP = process.env.KEEP === "1";
const AT: Any = await import("@/lib/modules/account/asset-tax" as string);
const T: Any = await import("@/lib/core/settings/legal/th-tax-2569" as string);

/** ตารางค่าเสื่อมทั้งอายุด้วยสูตรของระบบ */
function schedule(a: { cost: number; salvageValue: number; usefulLifeMonths: number; startDepDate: string; taxClass?: string | null }): number[] {
  const out: number[] = [];
  let accum = 0;
  for (let i = 0; i < a.usefulLifeMonths + 5; i++) {
    const amt = AT.depreciationAmountFor({ ...a, monthsDepreciated: i, accumDepreciation: accum });
    if (amt <= 0) break;
    out.push(amt);
    accum += amt;
  }
  return out;
}

console.log("\n── P1 เดือนแรกตามส่วนของวัน (pure) ──");
{
  const A = schedule({ cost: 3_600_100, salvageValue: 100, usefulLifeMonths: 36, startDepDate: "2026-03-16" });
  eq("P1.1", "A: 37 งวด · งวดแรก 51,613 · งวด 2 = 100,000 · งวดสุดท้าย 48,387 · รวม 3,600,000", [A.length, A[0], A[1], A[35], A[36], A.reduce((s, x) => s + x, 0)], [37, 51_613, 100_000, 100_000, 48_387, 3_600_000]);
  const B = schedule({ cost: 3_600_100, salvageValue: 100, usefulLifeMonths: 36, startDepDate: "2026-03-01" });
  eq("P1.2", "B เริ่มวันที่ 1: 36 งวด × 100,000 (ไม่เฉลี่ย)", [B.length, new Set(B).size, B[0], B.reduce((s, x) => s + x, 0)], [36, 1, 100_000, 3_600_000]);
  const C = schedule({ cost: 12_000_000, salvageValue: 100, usefulLifeMonths: 60, startDepDate: "2026-02-10" });
  eq("P1.3", "C (ก.พ. 28 วัน ใช้ 19): 61 งวด · 135,713 · 199,998 · สุดท้าย 64,305 · รวม 11,999,900", [C.length, C[0], C[1], C[60], C.reduce((s, x) => s + x, 0)], [61, 135_713, 199_998, 64_305, 11_999_900]);
  const D = schedule({ cost: 3_600_100, salvageValue: 100, usefulLifeMonths: 36, startDepDate: "2026-01-31" });
  eq("P1.4", "D เริ่มวันสุดท้ายของเดือน: งวดแรก 3,226 · รวมยังเท่าฐาน", [D[0], D.length, D.reduce((s, x) => s + x, 0)], [3_226, 37, 3_600_000]);
  eq("P1.5", "firstMonthProration: 16 มี.ค. = ใช้ 16/31 · 1 มี.ค. = ไม่เฉลี่ย · Date เวลาไทย 10 ก.พ. 07:00 ไทย", [AT.firstMonthProration("2026-03-16"), AT.firstMonthProration("2026-03-01").prorated, AT.firstMonthProration(new Date("2026-02-10T07:00:00+07:00")).daysUsed], [{ prorated: true, daysUsed: 16, daysInMonth: 31 }, false, 19]);
  // สูตรเดิมของ asset.nextDepreciationAmount (ไม่ส่งวันเริ่ม) = เต็มเดือน — ผู้เรียกเดิมที่ยังไม่ส่งวันเริ่มได้ผลเดิม
  eq("P1.6", "ไม่ส่ง startDepDate = เต็มเดือน 100,000 (พฤติกรรมเดิม)", AT.depreciationAmountFor({ cost: 3_600_100, salvageValue: 100, usefulLifeMonths: 36, monthsDepreciated: 0, accumDepreciation: 0 }), 100_000);
  eq("P1.7", "isFullyDepreciated หลังงวด 36 ของ A = ยังไม่ครบ (เหลือ 48,387) · หลังงวด 37 = ครบ", [AT.isFullyDepreciated({ cost: 3_600_100, salvageValue: 100, accumDepreciation: 3_551_613 }), AT.isFullyDepreciated({ cost: 3_600_100, salvageValue: 100, accumDepreciation: 3_600_000 })], [false, true]);
}

console.log("\n── P2 ที่ดิน + คำเตือนทางภาษี (pure) ──");
const rulesFrom = (shop: Any[] = []) => {
  const legal = { entityKind: "COMPANY", shop: { vat: [], wht: [], deadline: [], book: shop } };
  return import("@/lib/modules/account/legal-values" as string).then((LV: Any) => {
    const r = (k: string) => LV.bookRuleFrom(legal, k, new Date("2026-03-16T12:00:00+07:00"));
    return {
      buildingBp: r("DEP_MAX_RATE_BUILDING").value,
      tempBuildingBp: r("DEP_MAX_RATE_TEMP_BUILDING").value,
      intangibleBp: r("DEP_MAX_RATE_INTANGIBLE").value,
      otherBp: r("DEP_MAX_RATE_OTHER").value,
      computerPeriods: r("DEP_COMPUTER_MIN_PERIODS").value,
      carCapSatang: r("DEP_PASSENGER_CAR_COST_CAP").value,
      sources: { other: r("DEP_MAX_RATE_OTHER").row?.source, carCap: r("DEP_PASSENGER_CAR_COST_CAP").row?.source },
    };
  });
};
{
  const R = await rulesFrom();
  eq("P2.0", "ค่าจากตาราง: 500 · 10000 · 1000 · 2000 bp · 3 รอบ · 100,000,000 สตางค์ (แถวระบบ [V])", [R.buildingBp, R.tempBuildingBp, R.intangibleBp, R.otherBp, R.computerPeriods, R.carCapSatang], [500, 10000, 1000, 2000, 3, 100_000_000]);
  const rows = T.SYSTEM_BOOK_ROWS.filter((r: Any) => r.rule.startsWith("DEP_"));
  chk("P2.0b", "แถวค่าเสื่อมทุกแถวป้าย [V] มีที่มา domain-business-income-tax §ก5 + วันที่ตรวจ", rows.length === 6 && rows.every((r: Any) => r.tag === "V" && r.source.includes("domain-business-income-tax.md §ก5") && r.checkedAt === "2026-11-13"), 6, rows.map((r: Any) => [r.id, r.tag]));
  eq("P2.1", "ที่ดิน: ค่าเสื่อม 0 ทุกงวด", schedule({ cost: 500_000_000, salvageValue: 100, usefulLifeMonths: 60, startDepDate: "2026-03-16", taxClass: "LAND" }).length, 0);
  const codes = (a: Any, r = R) => AT.assetTaxWarnings(a, r).map((w: Any) => w.code);
  eq("P2.2", "ที่ดิน → ASSET_LAND_NOT_DEPRECIATED (ไม่มีคำเตือนอื่น)", codes({ name: "ที่ดิน", taxClass: "LAND", cost: 500_000_000, usefulLifeMonths: 12 }), ["ASSET_LAND_NOT_DEPRECIATED"]);
  eq("P2.3", "อาคาร 120 ด. (10%) เตือน · 240 ด. (5%) ไม่เตือน", [codes({ taxClass: "BUILDING", cost: 1e8, usefulLifeMonths: 120 }), codes({ taxClass: "BUILDING", cost: 1e8, usefulLifeMonths: 240 })], [["ASSET_TAX_RATE_ABOVE_CEILING"], []]);
  eq("P2.4", "คอมพิวเตอร์ 24 ด. เตือน (หักได้ภายใน 3 รอบ) · 36 ด. ไม่เตือน", [codes({ taxClass: "COMPUTER", cost: 5e6, usefulLifeMonths: 24 }), codes({ taxClass: "COMPUTER", cost: 5e6, usefulLifeMonths: 36 })], [["ASSET_TAX_RATE_ABOVE_CEILING"], []]);
  eq("P2.5", "ทรัพย์สินอื่น 36 ด. (33.33%) เตือน · 60 ด. (20%) ไม่เตือน · null = อื่น", [codes({ taxClass: null, cost: 5e6, usefulLifeMonths: 36 }), codes({ taxClass: "OTHER", cost: 5e6, usefulLifeMonths: 60 })], [["ASSET_TAX_RATE_ABOVE_CEILING"], []]);
  const car = AT.assetTaxWarnings({ taxClass: "PASSENGER_CAR", cost: 150_000_000, usefulLifeMonths: 60 }, R);
  eq("P2.6", "รถยนต์นั่ง 1.5 ล้าน → ฐานสูงสุด 1,000,000.00 · ส่วนเกิน 500,000.00 · ไม่บล็อก (ack=false) · อ้างที่มาจากแถวตาราง", [car.map((w: Any) => w.code), car[0]?.ack, /1,000,000\.00/.test(car[0]?.messageTh), /500,000\.00/.test(car[0]?.messageTh), String(car[0]?.citation).includes("ม.5")], [["ASSET_PASSENGER_CAR_COST_CAP"], false, true, true, true]);
  eq("P2.7", "รถยนต์นั่ง 1,000,000.00 พอดี = ไม่เตือน (ไม่เกิน)", codes({ taxClass: "PASSENGER_CAR", cost: 100_000_000, usefulLifeMonths: 60 }), []);
  const w = AT.assetTaxWarnings({ taxClass: "OTHER", cost: 5e6, usefulLifeMonths: 36 }, R)[0];
  chk("P2.8", "ข้อความเพดาน: อายุ 36 เดือน · 33.33% · 20% ต่อปี · ผลต่างทางภาษีกับทางบัญชี · ไม่มีคำว่า \"ถูกกฎหมาย\"", /36 เดือน/.test(w.messageTh) && /33\.33%/.test(w.messageTh) && /20% ต่อปี/.test(w.messageTh) && /ผลต่างทางภาษีกับทางบัญชี/.test(w.messageTh) && !/ถูกกฎหมาย/.test(w.messageTh), "text", w.messageTh);
  // ร้านทับเพดานทรัพย์สินอื่นเป็น 35% → 33.33% ไม่เตือน (ร้านปรับแล้วระบบยอม — test-rules ข้อ 5)
  const R2 = await rulesFrom([{ id: "shop-dep-other", rule: "DEP_MAX_RATE_OTHER", value: 3500, from: null, to: null, source: "นักบัญชีของร้าน", tag: "SHOP", checkedAt: null }]);
  eq("P2.9", "แถวร้าน DEP_MAX_RATE_OTHER 3500 → 36 ด. ไม่เตือน", [R2.otherBp, codes({ taxClass: "OTHER", cost: 5e6, usefulLifeMonths: 36 }, R2)], [3500, []]);
  const LV: Any = await import("@/lib/modules/account/legal-values" as string);
  const sw = LV.bookRuleFrom({ entityKind: "COMPANY", shop: { vat: [], wht: [], deadline: [], book: [{ id: "x", rule: "DEP_MAX_RATE_OTHER", value: 3500, from: null, to: null, source: "ร้าน", tag: "SHOP", checkedAt: null }] } }, "DEP_MAX_RATE_OTHER", new Date()).warnings.map((x: Any) => x.code);
  eq("P2.10", "ค่าของร้านต่างจากแถวระบบ [V] → SHOP_DIFFERS_FROM_DEFAULT (เตือน ไม่ปฏิเสธ)", sw, ["SHOP_DIFFERS_FROM_DEFAULT"]);
}

console.log("\n── D1 ฐานข้อมูล: ขึ้นทะเบียน → รันค่าเสื่อม → ที่ดิน → เปลี่ยนประเภท ──");
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
const AS: Any = await import("@/lib/modules/account/asset" as string);
const AV2: Any = await import("@/lib/modules/account/asset-v2" as string);
let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T4.3 ค่าเสื่อม", "qc-t43-dep");
  tid = S.tid;
  prisma = S.prisma;
  const ctx = S.ctx;
  const assetAcc = (await AS.listAssetAccounts(ctx))[0];
  const accumAcc = (await AS.listAccumAccounts(ctx))[0];
  const expAcc = (await AS.listExpenseAccounts(ctx)).find((l: Any) => l.code === "6800") ?? (await AS.listExpenseAccounts(ctx))[0];
  chk("D1.0", "ผังบัญชีมีบัญชีสินทรัพย์ 16xx · ค่าเสื่อมสะสม 16x9 · ค่าใช้จ่าย", !!assetAcc && !!accumAcc && !!expAcc, "3 บัญชี", [assetAcc?.code, accumAcc?.code, expAcc?.code]);
  const day = (s: string) => new Date(`${s}T12:00:00+07:00`);
  const reg = (o: Any) => AS.registerAsset(ctx, { category: null, acquiredDate: day(o.start), startDepDate: day(o.start), salvageValue: 100, assetAccountId: assetAcc.id, accumAccountId: accumAcc.id, expenseAccountId: expAcc.id, ...o });
  const a = await reg({ name: "เครื่องอัดอากาศ", start: "2026-03-16", cost: 3_600_100, usefulLifeMonths: 36 });
  eq("D1.1", "ขึ้นทะเบียน A (ทรัพย์สินอื่น 36 ด.) → ok + คำเตือนเพดาน 20%", [a.ok, a.warnings?.map((w: Any) => w.code)], [true, ["ASSET_TAX_RATE_ABOVE_CEILING"]]);
  const land = await reg({ name: "ที่ดินท่าเรือ", start: "2026-03-05", cost: 500_000_000, usefulLifeMonths: 600, taxClass: "LAND" });
  const car = await reg({ name: "รถตู้รับส่งลูกค้า", start: "2026-03-01", cost: 150_000_000, usefulLifeMonths: 60, taxClass: "PASSENGER_CAR" });
  eq("D1.2", "ที่ดิน → ASSET_LAND_NOT_DEPRECIATED · รถยนต์นั่ง 1.5 ล้าน → ASSET_PASSENGER_CAR_COST_CAP", [land.warnings?.map((w: Any) => w.code), car.warnings?.map((w: Any) => w.code)], [["ASSET_LAND_NOT_DEPRECIATED"], ["ASSET_PASSENGER_CAR_COST_CAP"]]);
  const dbLand = await prisma.accountFixedAsset.findUniqueOrThrow({ where: { id: land.id }, select: { taxClass: true } });
  const dbA = await prisma.accountFixedAsset.findUniqueOrThrow({ where: { id: a.id }, select: { taxClass: true } });
  eq("D1.3", "คอลัมน์ taxClass: ที่ดิน = LAND · ทรัพย์สินอื่น = null", [dbLand.taxClass, dbA.taxClass], ["LAND", null]);

  const pv = await AV2.previewDepreciation(ctx, "2026-03");
  const pr = (id: string) => pv.rows.find((r: Any) => r.assetId === id);
  eq("D1.4", "พรีวิว มี.ค.: A 51,613 · รถ (เริ่มวันที่ 1) 2,499,998 · ที่ดิน 0 'ที่ดินไม่คิดค่าเสื่อม'", [pr(a.id)?.amount, pr(car.id)?.amount, pr(land.id)?.amount, pr(land.id)?.skipReason], [51_613, Math.round((150_000_000 - 100) / 60), 0, "ที่ดินไม่คิดค่าเสื่อม"]);
  const r3 = await AS.runDepreciation(ctx, "2026-03");
  const posted = (r: Any, id: string) => r.posted.find((p: Any) => p.assetId === id)?.amount ?? null;
  eq("D1.5", "รัน มี.ค.: A 51,613 · รถ 2,499,998 · ที่ดินข้าม", [posted(r3, a.id), posted(r3, car.id), r3.skipped.find((s: Any) => s.assetId === land.id)?.reason], [51_613, 2_499_998, "ที่ดินไม่คิดค่าเสื่อม"]);
  const je = await prisma.accountJournalEntry.findFirst({ where: { id: r3.posted.find((p: Any) => p.assetId === a.id)?.entryId }, select: { lines: { select: { debit: true, credit: true, accountId: true } } } });
  eq("D1.6", "ใบสำคัญค่าเสื่อม A: Dr ค่าใช้จ่าย 51,613 / Cr ค่าเสื่อมสะสม 51,613", [je?.lines.find((l: Any) => l.accountId === expAcc.id)?.debit, je?.lines.find((l: Any) => l.accountId === accumAcc.id)?.credit], [51_613, 51_613]);
  const r4 = await AS.runDepreciation(ctx, "2026-04");
  eq("D1.7", "รัน เม.ย.: A 100,000 (งวดเต็ม)", posted(r4, a.id), 100_000);
  const det = await AV2.assetDetail(ctx, a.id);
  eq("D1.8", "รายละเอียด A: สะสม 151,613 · งวดถัดไป 100,000 · taxClass OTHER · เดือนแรก 16/31", [det.accumDepreciation, det.nextAmount, det.taxClass, det.firstMonth], [151_613, 100_000, "OTHER", { prorated: true, daysUsed: 16, daysInMonth: 31 }]);

  // เปลี่ยน A เป็นที่ดิน → งวดถัดไปไม่คิด · ค่าเสื่อมเดิมไม่แก้
  const sc = await AS.setAssetTaxClass(ctx, a.id, "LAND");
  eq("D1.9", "setAssetTaxClass LAND → ok · คำเตือนที่ดิน · ค่าเสื่อมที่ลงแล้ว 151,613", [sc.ok, sc.warnings?.map((w: Any) => w.code), sc.depreciatedBefore], [true, ["ASSET_LAND_NOT_DEPRECIATED"], 151_613]);
  const r5 = await AS.runDepreciation(ctx, "2026-05");
  eq("D1.10", "รัน พ.ค. หลังเปลี่ยนเป็นที่ดิน: A ข้าม", [posted(r5, a.id), r5.skipped.find((s: Any) => s.assetId === a.id)?.reason], [null, "ที่ดินไม่คิดค่าเสื่อม"]);
  const bad = await AS.setAssetTaxClass(ctx, a.id, "BOAT");
  eq("D1.11", "ประเภทที่ไม่รู้จัก → ปฏิเสธ (ข้อความไทย)", [bad.ok, bad.reason], [false, "ประเภททางภาษีไม่ถูกต้อง"]);
  await AS.setAssetTaxClass(ctx, a.id, "OTHER");
  const r6 = await AS.runDepreciation(ctx, "2026-06");
  eq("D1.12", "กลับเป็นทรัพย์สินอื่น → รัน มิ.ย. คิดต่อ 100,000 (งวดที่ 3 ของตาราง)", posted(r6, a.id), 100_000);

  // ครบอายุ: สินทรัพย์อายุ 1 เดือน เริ่ม 16 มี.ค. → 2 งวด (เฉลี่ย + ส่วนที่เหลือ) แล้ว FULLY_DEPRECIATED
  const s1 = await reg({ name: "สว่านไร้สาย", start: "2026-03-16", cost: 310_100, usefulLifeMonths: 1 });
  const m3 = await AS.runDepreciation(ctx, "2026-07");
  const m4 = await AS.runDepreciation(ctx, "2026-08");
  const st = await prisma.accountFixedAsset.findUniqueOrThrow({ where: { id: s1.id }, select: { status: true } });
  // ฐาน 310,000 · งวดแรก round(310,000×16÷31) = 160,000 · งวดสอง 150,000
  eq("D1.13", "อายุ 1 เดือนเริ่มกลางเดือน: 160,000 + 150,000 = 310,000 แล้วครบ (FULLY_DEPRECIATED)", [posted(m3, s1.id), posted(m4, s1.id), st.status], [160_000, 150_000, "FULLY_DEPRECIATED"]);
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T4.3 ค่าเสื่อม =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length > 0 ? 1 : 0);

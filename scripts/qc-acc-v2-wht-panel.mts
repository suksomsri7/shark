// QC ACC T3.1 — แผงรับ/จ่ายใช้อัตราจากตาราง T0.2 ตาม ประเภทเงินได้ × สถานะผู้จ่าย × ประเภทผู้รับ × ช่องทาง ·
//   ประเภทเงินได้ที่เพิ่ม (โฆษณา ขนส่ง รางวัล ประกันวินาศภัย ส่งเสริมการขาย นักแสดง ปันผล) · อัตราเป็นค่าเริ่มที่เปลี่ยนได้ (ต่างจากตาราง = เตือน ไม่บล็อก) ·
//   ผู้รับต่างประเทศ = ไม่หัก + ยืนยันข้อเท็จจริง + เตือน
// design note ledger/wo-notes/T3.1.md · ฟิกซ์เจอร์ของตัวเอง · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-wht-panel.mts
//
// เฉลย (skill common-withholding-tax.md §2 §3 §5 §10 §16 — basis point):
//   ร้าน บจ. → บริษัทไทย: ค่าบริการ 300 · โฆษณา 200 · ขนส่ง 100 · ค่าเช่า 500 · รางวัลชิงโชค 500 · ประกันวินาศภัย 100 · นายหน้า 300 · ปันผล 1000
//   ร้าน บจ. → บุคคลไทย: ค่าบริการ 300 · นายหน้า ม.50(1) อัตราก้าวหน้า (null) · ดอกเบี้ย 1500 · ค่าแสดงนักแสดง 500
//   ร้าน บจ. → ต่างประเทศ: นายหน้า ไม่หัก · จ้างทำของ 500 (ข้อ 12)
//   ร้าน บุคคลธรรมดา → บริษัทไทย: ค่าบริการ/ค่าเช่า/โฆษณา/ขนส่ง ไม่หัก (§16) · รางวัลชิงโชค 500 (ข้อ 9 ผู้จ่ายทุกคน)
//   จ่ายค่าบริการ 10,000 (ไม่มี VAT) ให้บริษัทด้วยอัตรา 5% (ตาราง 3%) ⇒ บันทึกได้ + WHT_RATE_DIFFERS_FROM_TABLE · ภาษี 500.00 · ฐาน 50 ทวิ 10,000.00
//   จ่ายผู้รับต่างประเทศ 2,000 ไม่หัก ⇒ ไม่ยืนยัน = LEGAL_ACK_REQUIRED (WHT_FOREIGN_NO_WITHHOLD) · ยืนยัน = บันทึกได้
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-wht-panel");
const F = await import("./acc-v2-wht-fixture.mts" as string);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const { chk, finish } = F.makeChecker();
const shops: Any[] = [];
try {
  const WC = (await import("@/lib/modules/account/wht-calc" as string)) as Any;
  const WX = (await import("@/lib/modules/account/wht-context" as string)) as Any;
  const LV = (await import("@/lib/modules/account/legal-values" as string)) as Any;
  const PM = (await import("@/lib/modules/account/payment" as string)) as Any;
  const LG = (await import("@/lib/modules/account/legal-gate" as string)) as Any;
  const acc = (await import("@/lib/modules/account/service" as string)) as Any;

  const co = await F.makeShop("co", { entityKind: "COMPANY", vat: false });
  shops.push(co);
  const ind = await F.makeShop("ind", { entityKind: "INDIVIDUAL", vat: false });
  shops.push(ind);
  const vCo = await co.vendor("บจก. ผู้ให้บริการ");
  const vPerson = await co.vendor("นาย ฟรีแลนซ์", { legalType: "PERSON" });
  const vForeign = await co.vendor("Foreign Agency Ltd", { country: "SG", taxIdCountry: "SG" });
  const vIndCo = await ind.vendor("บจก. ให้เช่า");

  console.log("\nT3.1-A อัตราตามตาราง × ผู้จ่าย × ผู้รับ (ก้อนของแผงจ่าย):");
  const ctxOf = async (shop: Any, contactId: string) => {
    const id = await F.makeExpense(shop, contactId, [{ description: "งาน", amount: 1_000_000 }], { vatMode: "NONE" });
    const d = await acc.whtDocContext(shop.tid, shop.S, id);
    return { id, c: WX.whtPanelContextFrom(await LV.loadBookLegal(shop.ctx), d, F.D(9, 15), "SHOP_PAYS") };
  };
  const r = (c: Any, code: string) => (c.rates[code].normal.method === "RATE" ? c.rates[code].normal.value : c.rates[code].normal.method);
  const A = await ctxOf(co, vCo.id);
  chk("T31.A1", "บจ. → บริษัทไทย: บริการ 300 · โฆษณา 200 · ขนส่ง 100 · ค่าเช่า 500 · รางวัล 500 · ประกันวินาศภัย 100 · นายหน้า 300 · ปันผล 1000", A.c.payer === "JURISTIC" && A.c.recipient === "JURISTIC_TH" && r(A.c, "M40_8") === 300 && r(A.c, "ADVERTISING") === 200 && r(A.c, "TRANSPORT") === 100 && r(A.c, "M40_5") === 500 && r(A.c, "PRIZE") === 500 && r(A.c, "NONLIFE_INSURANCE") === 100 && r(A.c, "M40_2") === 300 && r(A.c, "DIVIDEND") === 1000, "ตามตาราง", Object.fromEntries(A.c.codes.map((k: Any) => [k.code, r(A.c, k.code)])));
  chk("T31.A2", "แหล่งของแถวมาจาก skill (§10 ท.ป.4/2528) · ป้าย V", /§10/.test(A.c.rates.ADVERTISING.normal.source) && A.c.rates.ADVERTISING.normal.tag === "V", "§10/V", A.c.rates.ADVERTISING.normal, "MAJOR");
  const P = await ctxOf(co, vPerson.id);
  chk("T31.A3", "บจ. → บุคคลไทย: บริการ 300 · นายหน้า อัตราก้าวหน้า · ดอกเบี้ย 1500 · ค่าแสดง 500", P.c.recipient === "INDIVIDUAL_TH" && r(P.c, "M40_8") === 300 && r(P.c, "M40_2") === "PROGRESSIVE" && r(P.c, "M40_4") === 1500 && r(P.c, "PERFORMER") === 500, "ตามตาราง", { rec: P.c.recipient, s: r(P.c, "M40_8"), c: r(P.c, "M40_2"), i: r(P.c, "M40_4"), p: r(P.c, "PERFORMER") });
  const X = await ctxOf(co, vForeign.id);
  chk("T31.A4", "บจ. → ต่างประเทศ: นายหน้า ไม่หัก · จ้างทำของ 500 (ข้อ 12)", X.c.recipient === "FOREIGN" && r(X.c, "M40_2") === "NONE" && r(X.c, "M40_7") === 500, "NONE/500", { rec: X.c.recipient, c: r(X.c, "M40_2"), w: r(X.c, "M40_7") });
  const I = await ctxOf(ind, vIndCo.id);
  chk("T31.A5", "ร้านบุคคลธรรมดา → บริษัท: บริการ/ค่าเช่า/โฆษณา/ขนส่ง ไม่หัก (§16) · รางวัลชิงโชค 500 (ข้อ 9)", I.c.payer === "NON_JURISTIC" && ["M40_8", "M40_5", "ADVERTISING", "TRANSPORT"].every((k) => r(I.c, k) === "NONE") && r(I.c, "PRIZE") === 500, "NONE…/500", { p: I.c.payer, s: r(I.c, "M40_8"), rent: r(I.c, "M40_5"), adv: r(I.c, "ADVERTISING"), tr: r(I.c, "TRANSPORT"), prize: r(I.c, "PRIZE") });
  chk("T31.A6", "รหัสขยาย → ม.40 (โฆษณา/ขนส่ง/รางวัล → 40(8) · ปันผล → 40(4)) · ป้ายมีข้อของคำสั่ง", WC.whtParentOf("ADVERTISING") === "M40_8" && WC.whtParentOf("TRANSPORT") === "M40_8" && WC.whtParentOf("DIVIDEND") === "M40_4" && WC.whtCodeLabel("ADVERTISING").includes("ข้อ 10"), "ตามนั้น", null, "MAJOR");
  const recOf = WC.whtRecipientOf;
  chk("T31.A7", "ผู้รับ: ค่าที่ร้านตั้งชนะ · ประเทศไม่ใช่ไทย = ต่างประเทศ · บุคคล · มูลนิธิ (จากประเภทนิติบุคคล) · ไม่รู้ = บริษัท (assumed)", recOf({ whtRecipient: "FOREIGN_PE", legalType: "COMPANY" }).recipient === "FOREIGN_PE" && recOf({ legalType: "COMPANY", country: "JP" }).recipient === "FOREIGN" && recOf({ legalType: "PERSON" }).recipient === "INDIVIDUAL_TH" && recOf({ legalType: "COMPANY", legalEntityType: "มูลนิธิ" }).recipient === "FOUNDATION" && recOf(null).assumed === true, "ตามนั้น", null, "MAJOR");

  console.log("\nT3.1-B อัตราเป็นค่าเริ่ม — ผู้ใช้เปลี่ยนได้ (เตือน ไม่บล็อก):");
  {
    const panel = await PM.paymentPanelData(co.tid, co.S, A.id);
    chk("T31.B0", "แผงจ่าย: มีก้อน wht · ฐานทั้งใบ 1,000,000 (ไม่มี VAT)", panel?.wht?.base?.full === 1_000_000 && panel.whtBaseSatang === 1_000_000, "1,000,000", { w: panel?.wht?.base, b: panel?.whtBaseSatang });
    const res = await LG.withScreenLegal({ codes: [], actorId: co.owner.id, via: "qc" }, () =>
      PM.recordPayments(co.tid, co.S, A.id, [{ paidAt: "2026-09-15", financeAccountId: co.bank.id, amountSatang: 950_000, note: "", whtIncomeType: "M40_8", whtIncomeCode: "M40_8", whtRateBp: 500, whtAmountSatang: 50_000, feeSatang: 0, cheque: null }], { userId: co.owner.id, keyBase: `t31b-${Date.now()}` }),
    );
    const cert = await co.prisma.accountDocument.findFirst({ where: { systemId: co.S, docType: "WHT_CERT", sourceDocId: A.id } });
    const pay = await co.prisma.accountDocumentPayment.findFirst({ where: { documentId: A.id } });
    chk("T31.B1", "อัตรา 5% (ตาราง 3%) บันทึกได้ · คำเตือน WHT_RATE_DIFFERS_FROM_TABLE (V · ไม่ต้องยืนยัน) อ้าง §10", res.ok && res.warnings?.some((w: Any) => w.code === "WHT_RATE_DIFFERS_FROM_TABLE" && w.ack === false && /12\/1|§10/.test(w.citation ?? "")), "ok+warn", res);
    chk("T31.B2", "50 ทวิ: ภาษี 50,000 · อัตรา 500 · ฐาน 1,000,000 · ประเภท M40_8 · การจ่ายเก็บรหัส/ฐาน/ช่องทาง NORMAL", cert?.whtAmount === 50_000 && cert.whtRateBp === 500 && cert.subTotal === 1_000_000 && cert.whtIncomeType === "M40_8" && pay?.whtIncomeCode === "M40_8" && pay.whtBaseSatang === 1_000_000 && pay.whtChannel === "NORMAL" && pay.whtIncomeType === "M40_8", "ตามนั้น", { cert: cert && [cert.whtAmount, cert.whtRateBp, cert.subTotal, cert.whtIncomeType], pay: pay && [pay.whtIncomeCode, pay.whtBaseSatang, pay.whtChannel] });
  }
  {
    const adv = await F.makeExpense(co, vCo.id, [{ description: "ค่าโฆษณาป้าย", amount: 2_000_000 }], { vatMode: "NONE" });
    const res = await LG.withScreenLegal({ codes: [], actorId: co.owner.id, via: "qc" }, () =>
      PM.recordPayments(co.tid, co.S, adv, [{ paidAt: "2026-09-16", financeAccountId: co.bank.id, amountSatang: 1_960_000, note: "", whtIncomeType: null, whtIncomeCode: "ADVERTISING", whtRateBp: 200, whtAmountSatang: 40_000, feeSatang: 0, cheque: null }], { userId: co.owner.id, keyBase: `t31c-${Date.now()}` }),
    );
    const cert = await co.prisma.accountDocument.findFirst({ where: { systemId: co.S, docType: "WHT_CERT", sourceDocId: adv } });
    chk("T31.B3", "ค่าโฆษณา 20,000 @2% (ตามตาราง): ไม่มีคำเตือนอัตรา · 50 ทวิ ภาษี 40,000 ฐาน 2,000,000 · ม.40(8) + รหัสขยาย ADVERTISING", res.ok && !res.warnings?.some((w: Any) => w.code === "WHT_RATE_DIFFERS_FROM_TABLE") && cert?.whtAmount === 40_000 && cert.subTotal === 2_000_000 && cert.whtIncomeType === "M40_8" && cert.whtIncomeCode === "ADVERTISING", "ตามนั้น", { res, cert: cert && [cert.whtAmount, cert.subTotal, cert.whtIncomeType, cert.whtIncomeCode] });
  }

  console.log("\nT3.1-C ผู้รับต่างประเทศ: ไม่หัก + ยืนยันข้อเท็จจริง:");
  {
    const no = await LG.withScreenLegal({ codes: [], actorId: co.owner.id, via: "qc" }, () =>
      PM.recordPayments(co.tid, co.S, X.id, [{ paidAt: "2026-09-17", financeAccountId: co.bank.id, amountSatang: 1_000_000, note: "", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }], { userId: co.owner.id, keyBase: `t31x-${Date.now()}` }),
    );
    chk("T31.C1", "ไม่ยืนยัน ⇒ LEGAL_ACK_REQUIRED มี WHT_FOREIGN_NO_WITHHOLD (ต้องยืนยัน) · ไม่มีการจ่ายเกิดขึ้น", !no.ok && no.legal?.warnings?.some((w: Any) => w.code === "WHT_FOREIGN_NO_WITHHOLD" && w.ack) && (await co.prisma.accountDocumentPayment.count({ where: { documentId: X.id } })) === 0, "409", no);
    const yes = await LG.withScreenLegal({ codes: ["WHT_FOREIGN_NO_WITHHOLD"], actorId: co.owner.id, via: "qc" }, () =>
      PM.recordPayments(co.tid, co.S, X.id, [{ paidAt: "2026-09-17", financeAccountId: co.bank.id, amountSatang: 1_000_000, note: "", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }], { userId: co.owner.id, keyBase: `t31y-${Date.now()}` }),
    );
    const ackLog = await co.prisma.auditLog.count({ where: { tenantId: co.tid, action: "legal.warning.ack" } }).catch(() => -1);
    chk("T31.C2", "ยืนยันแล้ว ⇒ บันทึกได้ (PAID) ไม่ออก 50 ทวิ", yes.ok && yes.status === "PAID" && (await co.prisma.accountDocument.count({ where: { systemId: co.S, docType: "WHT_CERT", sourceDocId: X.id } })) === 0, "PAID", { yes, ackLog });
    const bg = await PM.recordPayments(co.tid, co.S, (await ctxOf(co, vForeign.id)).id, [{ paidAt: "2026-09-18", financeAccountId: co.bank.id, amountSatang: 1_000_000, note: "", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }], { userId: null, keyBase: `t31z-${Date.now()}` });
    chk("T31.C3", "งานเบื้องหลัง (ไม่มีบริบทคำขอ) ไม่บล็อก", bg.ok, "ok", bg, "MAJOR");
  }
} catch (e) {
  console.error(e);
  chk("CRASH", "ไม่ crash", false, "-", String(e));
} finally {
  for (const s of shops) await s.cleanup();
}
const ok = finish();
const { prisma } = await import("@/lib/core/db");
await prisma.$disconnect();
process.exit(ok ? 0 : 1);

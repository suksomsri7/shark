// QC ACC T3.4 — ภ.ง.ด. แยกแบบถูก 1 / 1ก / 2 / 3 / 53 / 54 (ปิด F9) · design note ledger/wo-notes/T3.4.md
// กฎ: skill shark-thai-law common-withholding-tax.md §1 §3 §5 §10 §15 (ตาราง SYSTEM_WHT_FORM_ROWS ใน th-tax-2569.ts)
// ร้านทดสอบแยก "QC T3.4 ภ.ง.ด." (ไม่แตะสมุด QC หลัก) · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-wht-pnd.mts
//
// เฉลยมือ (สตางค์) · เดือนจ่าย P = 2026-04 · ร้านเป็นบริษัทจำกัด
//   a วันที่ 2  นิติไทย     40(8)  ฐาน 1,000,000 ภาษี 30,000 (3%)   → ภ.ง.ด.53 · มีใบ
//   b วันที่ 3  บุคคลไทย    40(8)  ฐาน   500,000 ภาษี 15,000 (3%)   → ภ.ง.ด.3  · มีใบ
//   c วันที่ 4  บุคคลไทย    40(2)  ฐาน   200,000 ภาษี 10,000 (5%)   → ภ.ง.ด.1  · มีใบ (ช่อง 1ก)
//   d วันที่ 5  บุคคลไทย    40(4)  ฐาน   100,000 ภาษี 15,000 (15%)  → ภ.ง.ด.2  · มีใบ
//   e วันที่ 6  นิติ SG     40(2)  ฐาน   300,000 ภาษี 45,000 (15%)  → ภ.ง.ด.54 · มีใบ (ไม่มีช่องบน 50 ทวิ)
//   f วันที่ 7  นิติ SG     40(7)  ฐาน   400,000 ภาษี 20,000 (5%)   → ภ.ง.ด.53 [U]
//   g วันที่ 8  นิติไทย     ไม่ส่งประเภทตอนจ่าย (บรรทัด 40(5)) ฐาน 600,000 ภาษี 30,000 (5%) → ภ.ง.ด.53 · ยังไม่มีใบ
//   h วันที่ 9  มูลนิธิ      40(8)  ฐาน   100,000 ภาษี 10,000 (10%)  → ภ.ง.ด.53 [U]
//   ภ.ง.ด.53 P: a f g h = 4 รายการ · ฐาน 2,100,000 · ภาษี 90,000 · ยังไม่มีใบ 1
//   ภ.ง.ด.3 = b (15,000) · ภ.ง.ด.1 = c (10,000) · ภ.ง.ด.2 = d (15,000) · ภ.ง.ด.54 = e (45,000)
//   c2 2026-05-04 บุคคลไทย 40(1) ฐาน 300,000 ภาษี 6,000 → ภ.ง.ด.1 · 1ก ปี 2026: นายสมศักดิ์ 2 ครั้ง ฐาน 500,000 ภาษี 16,000
//   ยื่น 53 P (90,000) → ยกเลิกการจ่าย a (ยืนยัน) → รายการปรับ −30,000 → แบบเพิ่มเติมครั้งที่ 1 ภาษี 60,000 ส่วนต่าง −30,000
//   ออกใบให้ g หลังยื่น (ยืนยัน) → รายการปรับ +1 แถว ส่วนต่าง 0 (ยอดเดิมนับไว้แล้ว) → แบบเพิ่มเติมครั้งที่ 2 ส่วนต่าง 0
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-wht-pnd");

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
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
const WHT: Any = await import("@/lib/modules/account/wht" as string);
const WF: Any = await import("@/lib/modules/account/wht-forms" as string);
const WFL: Any = await import("@/lib/modules/account/wht-filing" as string);
const TH: Any = await import("@/lib/core/settings/legal/th-tax-2569" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const LG: Any = await import("@/lib/modules/account/legal-gate" as string);
const exp: Any = await import("@/lib/modules/account/expense" as string);
const P = "2026-04";

// ═══ P0 ตารางแบบ (pure) ═══
console.log("\n── P0 ตารางแบบ ภ.ง.ด. (ตารางค่ากฎหมาย) ──");
{
  const f = (it: string | null, facts: Any) => WF.whtFormOf(it, facts).form;
  eq("P0.1", "ตัวจับแบบ: 40(1)/40(2) บุคคล→1 · 40(3)/40(4) บุคคล→2 · 40(8) บุคคล→3 · นิติ→53 · ต่างประเทศ 40(2)→54 · ต่างประเทศ 40(7)→53 · มูลนิธิ→53",
    [f("M40_1", { legalType: "PERSON" }), f("M40_2", { legalType: "PERSON" }), f("M40_3", { legalType: "PERSON" }), f("M40_4", { legalType: "PERSON" }), f("M40_8", { legalType: "PERSON" }), f("M40_8", { legalType: "COMPANY" }), f("M40_2", { legalType: "COMPANY", taxIdCountry: "SG" }), f("M40_7", { legalType: "COMPANY", country: "SG" }), f("M40_8", { legalType: "COMPANY", legalEntityType: "มูลนิธิ" })],
    [1, 1, 2, 2, 3, 53, 54, 53, 53]);
  const rows: Any[] = TH.SYSTEM_WHT_FORM_ROWS;
  chk("P0.2", "ทุกแถวมีที่มา (references) · ป้าย · วันที่ตรวจ · ทุกชนิดผู้รับมีแถว ANY", rows.every((r) => /references\//.test(r.source) && ["V", "V2", "S", "U"].includes(r.tag) && /^\d{4}-\d{2}-\d{2}$/.test(r.checkedAt)) && TH.WHT_FORM_RECIPIENTS.every((rc: string) => rows.some((r) => r.recipient === rc && r.incomeTypes === "ANY")), "ครบ", rows.map((r) => [r.id, r.tag]));
  const u = WF.whtFormOf("M40_7", { legalType: "COMPANY", country: "SG" });
  chk("P0.3", "แถวป้าย U → คำเตือน WHT_FORM_UNVERIFIED (ไม่ต้องยืนยัน · ต่อท้าย 'โปรดตรวจกับนักบัญชีของร้าน')", u.warnings.length === 1 && u.warnings[0].code === "WHT_FORM_UNVERIFIED" && u.warnings[0].ack === false && u.warnings[0].messageTh.includes(W.CHECK_WITH_ACCOUNTANT_TH), "U warn", u.warnings);
  eq("P0.4", "แบบ ภ.ง.ด.54 ไม่มีช่องบน 50 ทวิ · ภ.ง.ด.1 ติ๊กช่อง (1) ภ.ง.ด.1ก · 53 ช่อง (7)", [WF.whtFormOf("M40_2", { legalType: "COMPANY", taxIdCountry: "SG" }).row.certBox, WF.whtFormOf("M40_2", { legalType: "PERSON" }).row.certBox, WF.whtFormOf("M40_8", { legalType: "COMPANY" }).row.certBox], [null, 1, 7]);
  chk("P0.5", "ข้อความคำเตือนใหม่ไม่มีคำว่า \"ถูกกฎหมาย\"", ["WHT_FORM_UNVERIFIED", "WHT_PAID_WITHOUT_CERT", "WHT_CERT_REPLACE", "WHT_ADDITIONAL_FILING", "WHT_CREDIT_CERT_OWED"].every((c) => W.isLegalWarningCode(c) && !/ถูกกฎหมาย/.test(W.legalWarning(c, {}).messageTh)), "ไม่มี", "?", "MAJOR");
}

let tid = "";
let prisma: Any = null;
try {
  console.log("\n── P1 ฟิกซ์เจอร์ + การจ่าย ──");
  const S = await F.setupWhtShop("QC T3.4 ภ.ง.ด.", "qc-t34");
  tid = S.tid;
  prisma = S.prisma;
  const { SYS, ctx, owner } = S;
  const pay = (k: string, vendorId: string, d: number, base: number, wht: number, rateBp: number, incomeType: string | null, lineIncomeType: string | null = null, ym = P) =>
    S.payVendor({ vendorId, ym, d, base, wht, rateBp, incomeType, lineIncomeType, key: `t34-${k}` });
  const a = await pay("a", S.vJur.id, 2, 1_000_000, 30_000, 300, "M40_8");
  const b = await pay("b", S.vInd.id, 3, 500_000, 15_000, 300, "M40_8");
  const c = await pay("c", S.vInd.id, 4, 200_000, 10_000, 500, "M40_2");
  const d = await pay("d", S.vInd.id, 5, 100_000, 15_000, 1500, "M40_4");
  const e = await pay("e", S.vForeign.id, 6, 300_000, 45_000, 1500, "M40_2");
  const f = await pay("f", S.vForeign.id, 7, 400_000, 20_000, 500, "M40_7");
  const g = await pay("g", S.vJur.id, 8, 600_000, 30_000, 500, null, "M40_5");
  const h = await pay("h", S.vFdn.id, 9, 100_000, 10_000, 1000, "M40_8");
  await pay("c2", S.vInd.id, 4, 300_000, 6_000, 200, "M40_1", null, "2026-05");
  chk("P1.1", "ทุกการจ่ายที่ส่งประเภทเงินได้ได้ 50 ทวิ · g ไม่มีใบ", [a, b, c, d, e, f, h].every((x) => !!x.certId) && g.certId === null, "7 ใบ + 1 ไม่มี", { g });

  console.log("\n── P2 แยกแบบ ──");
  const r53 = await WHT.pnd(S.tid, SYS, { type: 53, period: P });
  eq("P2.1", "ภ.ง.ด.53: a f g h ตามวันที่จ่าย · ลำดับ 1–4 · ภาษี 30,000+20,000+30,000+10,000", r53.rows.map((r: Any) => [r.seq, r.whtAmount, r.hasCert]), [[1, 30_000, true], [2, 20_000, true], [3, 30_000, false], [4, 10_000, true]]);
  eq("P2.2", "ภ.ง.ด.53 รวม ฐาน 2,100,000 · ภาษี 90,000 · ยังไม่มีใบ 1", [r53.grandBase, r53.grandWht, r53.uncertifiedCount], [2_100_000, 90_000, 1]);
  eq("P2.3", "แถวยังไม่มีใบ: ประเภทเงินได้จากบรรทัด (40(5)) · ฐานย้อนจากอัตรา 600,000 · ชี้การจ่าย", [r53.rows[2].incomeType, r53.rows[2].base, r53.rows[2].paymentId === g.paymentId, r53.rows[2].certId], ["M40_5", 600_000, true, null]);
  eq("P2.4", "คำเตือนรายงาน 53: WHT_PAID_WITHOUT_CERT [V] + WHT_FORM_UNVERIFIED [U]", r53.warnings.map((w: Any) => [w.code, w.tag]).sort(), [["WHT_FORM_UNVERIFIED", "U"], ["WHT_PAID_WITHOUT_CERT", "V"]]);
  const forms: Record<string, Any> = {};
  for (const t of [1, 2, 3, 54]) forms[t] = await WHT.pnd(S.tid, SYS, { type: t, period: P });
  eq("P2.5", "ภ.ง.ด.3 = b · 1 = c (ไม่ไหลเข้า 3) · 2 = d (ดอกเบี้ยบุคคลไม่ไหลเข้า 3) · 54 = e", [1, 2, 3, 54].map((t) => [t, forms[t].rows.length, forms[t].grandWht]), [[1, 1, 10_000], [2, 1, 15_000], [3, 1, 15_000], [54, 1, 45_000]]);
  eq("P2.6", "นับต่อแบบ (ตัวเลือกบนจอ)", await WHT.pndFormCounts(S.tid, SYS, P), { 1: 1, 2: 1, 3: 1, 53: 4, 54: 1 });
  const k1 = await WHT.pnd1kAnnual(S.tid, SYS, { year: 2026 });
  eq("P2.7", "ภ.ง.ด.1ก ปี 2026: นายสมศักดิ์ 2 ครั้ง · ฐาน 500,000 · ภาษี 16,000", k1.rows.map((r: Any) => [r.seq, r.recipientName, r.count, r.base, r.whtAmount]), [[1, "นายสมศักดิ์ รับจ้าง", 2, 500_000, 16_000]]);
  const csv: string = await WHT.pndCsv(S.tid, SYS, { type: 53, period: P });
  const lines = csv.replace(/^﻿/, "").split("\n");
  chk("P2.8", "CSV ช่วยกรอกแบบ: หัว + 4 แถว + รวม · คอลัมน์ \"สถานะ 50 ทวิ\" · แถว g = \"ยังไม่ออก 50 ทวิ\" · วันที่ไทย", lines.length === 6 && lines[0].includes("สถานะ 50 ทวิ") && lines[3].includes("ยังไม่ออก 50 ทวิ") && lines[1].includes("2026-04-02") && lines[5].includes("900.00"), "6 บรรทัด", lines);
  const csv1k: string = await WHT.pnd1kCsv(S.tid, SYS, { year: 2026 });
  chk("P2.9", "CSV ภ.ง.ด.1ก: 1 แถว ภาษีทั้งปี 160.00", csv1k.includes("160.00") && csv1k.split("\n").length === 3, "1 แถว", csv1k);
  const wt = await WHT.listWhtCertsV2(S.tid, SYS, { direction: "IN", status: "ALL", pageSize: 50 });
  eq("P2.10", "หน้า WHT: คอลัมน์แบบของแต่ละใบ (เรียงใหม่→เก่า)", wt.rows.filter((r: Any) => r.paidAt.toISOString() < "2026-05").map((r: Any) => r.form), [53, 53, 54, 2, 1, 3, 53]);
  const sel = await WHT.validateMarkFiledSelection(S.tid, SYS, [a.certId, c.certId]);
  chk("P2.11", "เลือกหลายใบต่างแบบ (53 + 1) → ปฏิเสธ (คนละแบบ)", !sel.ok && /แบบ ภ.ง.ด. เดียวกัน/.test(sel.reason), "ปฏิเสธ", sel);

  console.log("\n── P3 ยื่น · ยกเลิกหลังยื่น · แบบเพิ่มเติม ──");
  const mf = await WHT.markFiled(S.tid, SYS, { form: 53, periodKey: P, filedById: owner.id });
  eq("P3.1", "ทำเครื่องหมายนำส่ง 53: 4 รายการ (รวมรายการยังไม่มีใบ) · ภาษี 90,000 · ประทับ 3 ใบ", [mf.ok, mf.certCount, mf.totalTaxSatang, await prisma.accountDocument.count({ where: { systemId: SYS, whtFiledPeriodKey: `53:${P}` } })], [true, 4, 90_000, 3]);
  const mf54 = await WHT.markFiled(S.tid, SYS, { form: 54, periodKey: P, filedById: owner.id });
  eq("P3.2", "ภ.ง.ด.54 ทำเครื่องหมายได้ (แบบที่ 5) · 45,000", [mf54.ok, mf54.totalTaxSatang], [true, 45_000]);
  await new Promise((r) => setTimeout(r, 30));
  const screen = (codes: string[], fn: () => Promise<Any>) => LG.withScreenLegal(LG.screenAck(codes, owner.id), fn);
  const v0 = await screen([], () => exp.voidVendorPayment(S.tid, SYS, a.docId, a.paymentId, "จ่ายผิดราย"));
  chk("P3.3", "ยกเลิกการจ่ายหลังนำส่ง: ไม่ยืนยัน = คำเตือน FILED_PERIOD_PND_CHANGE (ไม่บล็อกถาวร)", !v0.ok && v0.legal?.warnings?.some((w: Any) => w.code === "FILED_PERIOD_PND_CHANGE"), "legal", v0);
  const v1 = await screen(["FILED_PERIOD_PND_CHANGE"], () => exp.voidVendorPayment(S.tid, SYS, a.docId, a.paymentId, "จ่ายผิดราย"));
  const st1 = await WFL.whtFilingState(ctx, 53, P);
  eq("P3.4", "ยืนยันแล้วยกเลิกได้ · รายการปรับ 1 แถว (ยกเลิกหลังยื่น −30,000) · ยื่นล่าสุด 90,000 · รายงานตอนนี้ 60,000 · ส่วนต่าง −30,000", [v1.ok, st1.changes.map((r: Any) => [r.change, r.whtDelta]), st1.latestTaxSatang, st1.currentTaxSatang, st1.deltaTaxSatang], [true, [["VOIDED_AFTER", -30_000]], 90_000, 60_000, -30_000]);
  const ad0 = await WFL.recordWhtAdditionalFiling(ctx, { form: 53, periodKey: P, actorId: owner.id, ack: LG.screenAck([], owner.id) });
  chk("P3.5", "แบบเพิ่มเติมไม่ยืนยัน = LEGAL_ACK_REQUIRED (WHT_ADDITIONAL_FILING [S]) · ไม่มีแถว", !ad0.ok && ad0.legal?.warnings?.[0]?.code === "WHT_ADDITIONAL_FILING" && ad0.legal.warnings[0].tag === "S" && (await prisma.accountWhtAdditionalFiling.count({ where: { systemId: SYS } })) === 0, "legal", ad0);
  const ad1 = await WFL.recordWhtAdditionalFiling(ctx, { form: 53, periodKey: P, actorId: owner.id, note: "ยื่นเพิ่มเติมทางเน็ต", ack: LG.screenAck(["WHT_ADDITIONAL_FILING"], owner.id) });
  eq("P3.6", "แบบเพิ่มเติมครั้งที่ 1: ภาษีรวม 60,000 · ส่วนต่าง −30,000", [ad1.ok, ad1.seq, ad1.totalTaxSatang, ad1.deltaTaxSatang], [true, 1, 60_000, -30_000]);
  const ad1b = await WFL.recordWhtAdditionalFiling(ctx, { form: 53, periodKey: P, actorId: owner.id, ack: LG.screenAck(["WHT_ADDITIONAL_FILING"], owner.id) });
  eq("P3.7", "ไม่มีอะไรเปลี่ยนหลังยื่นเพิ่มเติม → NO_CHANGE", [ad1b.ok, ad1b.code], [false, "NO_CHANGE"]);
  await new Promise((r) => setTimeout(r, 30));
  const ig = await screen(["FILED_PERIOD_PND_CHANGE"], () => WHT.issueWhtCert(S.tid, SYS, { paymentId: g.paymentId, whtIncomeType: "M40_5", createdById: owner.id }));
  const st2 = await WFL.whtFilingState(ctx, 53, P);
  eq("P3.8", "ออกใบให้ g หลังยื่น: รายการปรับใหม่ 1 แถว (ออกหลังยื่น) · ส่วนต่างภาษี 0 (นับไว้ตอนยื่นแล้ว) · รายงานยังมี 3 รายการ ไม่มีรายการยังไม่มีใบ", [ig.ok, st2.pending.map((r: Any) => r.change), st2.deltaTaxSatang, (await WHT.pnd(S.tid, SYS, { type: 53, period: P })).uncertifiedCount, (await WHT.pnd(S.tid, SYS, { type: 53, period: P })).rows.length], [true, ["ISSUED_AFTER"], 0, 0, 3]);
  const ad2 = await WFL.recordWhtAdditionalFiling(ctx, { form: 53, periodKey: P, actorId: owner.id, ack: LG.screenAck(["WHT_ADDITIONAL_FILING"], owner.id) });
  const ack2 = await prisma.auditLog.count({ where: { tenantId: S.tid, action: "legal.warning.ack", targetType: "AccountWhtAdditionalFiling" } });
  eq("P3.9", "แบบเพิ่มเติมครั้งที่ 2 (ส่วนต่าง 0) · บันทึกผู้ยืนยัน 2 แถว · ประวัติ AuditLog", [ad2.ok, ad2.seq, ad2.deltaTaxSatang, ack2, await prisma.auditLog.count({ where: { tenantId: S.tid, action: "account.wht-filing.additional" } })], [true, 2, 0, 2, 2]);
  const uw = await WHT.unmarkFiled(S.tid, SYS, { form: 54, periodKey: P, userId: owner.id, reason: "ทดสอบยกเลิก" });
  chk("P3.10", "ยกเลิกเครื่องหมาย ภ.ง.ด.54 ได้ (ตามกติกา T1.7 — แถวเก็บไว้)", uw.ok && (await prisma.accountWhtFiling.count({ where: { systemId: SYS, form: 54 } })) === 1, "ok", uw);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 8).join("\n")}` : String(e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T3.4 ภ.ง.ด. แยกแบบ =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length > 0 ? 1 : 0);

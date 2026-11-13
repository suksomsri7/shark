// QC ACC T3.3 — 50 ทวิ ตามแบบทางการ (ปิด F7 F8) · design note ledger/wo-notes/T3.3.md
// กฎ: skill shark-thai-law common-withholding-tax.md §7 [V] (รายการบนแบบ · 2 ฉบับ + สำเนาคู่ฉบับ) · domain-accounting-books.md §ง2 [U] (ยกเลิก/ออกแทน)
// ร้านทดสอบแยก "QC T3.3 50 ทวิ" · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-wht-cert.mts
//
// เฉลยมือ (สตางค์):
//   X1 2026-04-02 จ่ายบริษัท รับเหมา 40(8) ฐาน 1,000,000 หัก 3% = 30,000 → 50 ทวิ ภ.ง.ด.53 ลำดับที่ 1 · ตัวอักษร "สามร้อยบาทถ้วน"
//   X2 2026-04-03 จ่ายนายสมศักดิ์ 40(8) ฐาน 123,456 หัก 3% = 3,704 → ภ.ง.ด.3 ช่อง (4) · ตัวอักษร "สามสิบเจ็ดบาทสี่สตางค์"
//   X3 2026-04-04 จ่าย SG 40(2) ฐาน 300,000 หัก 15% = 45,000 → ภ.ง.ด.54 ไม่มีช่องบนแบบ (หมายเหตุ) + คำเตือน [U]? (แบบ V · ช่อง U ในหมายเหตุ)
//   ใบแทนของ X1 (ประเภทเงินได้แก้เป็น 40(7) · เงื่อนไข 2): ใบเดิม VOIDED + replacedById · ใบใหม่เลขใหม่ วันที่ 2 เม.ย. ยอด 1,000,000/30,000 · การจ่ายชี้ใบใหม่
//   WTI (ลูกค้าหักเรา) 2026-04-10 ฐาน 500,000 หัก 15,000 → หน้าบันทึกเดียว ผู้หัก = ลูกค้า ผู้ถูกหัก = ร้าน
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-wht-cert");

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
const WC: Any = await import("@/lib/modules/account/wht-cert" as string);
const WF: Any = await import("@/lib/modules/account/wht-forms" as string);
const LG: Any = await import("@/lib/modules/account/legal-gate" as string);
const PL: Any = await import("@/lib/modules/account/print-log" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
const T: Any = await import("@/lib/modules/account/totals" as string);
const React = (await import("react")).default;
const RDS: Any = await import("react-dom/server");
const { WhtCertForm } = (await import("@/components/account-v2/WhtCertForm" as string)) as Any;
const fmt = (d: Date) => new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric" }).format(d);
const money = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
const html = (m: Any, parts: string[]) => RDS.renderToStaticMarkup(React.createElement(WhtCertForm, { m, parts, money, fmtDate: fmt }));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const P = "2026-04";

// ═══ C0 ตัวคิดล้วน ═══
console.log("\n── C0 ตัวคิดล้วน ──");
eq("C0.1", "ยอดตัวอักษร: 30,000 → สามร้อยบาทถ้วน · 3,704 → สามสิบเจ็ดบาทสี่สตางค์ · 123,456 → หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบหกสตางค์", [T.bahtText(30_000), T.bahtText(3_704), T.bahtText(123_456)], ["สามร้อยบาทถ้วน", "สามสิบเจ็ดบาทสี่สตางค์", "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบหกสตางค์"]);
eq("C0.2", "แถวของแบบ: 40(1)→1 · 40(2)→2 · 40(3)→3 · 40(4)→4 · 40(5)–40(8)→5 (ตามคำสั่ง ม.3 เตรส) · ไม่ระบุ→6", ["M40_1", "M40_2", "M40_3", "M40_4", "M40_5", "M40_6", "M40_7", "M40_8", null].map((x) => WF.certIncomeRow(x)), [1, 2, 3, 4, 5, 5, 5, 5, 6]);
eq("C0.3", "ฉบับ: ค่าเริ่มต้น = ชุด 3 ฉบับ · ป้ายตามหัวแบบทางการ", [WF.certPartsOf(null), WF.CERT_PART_LABEL_TH["1"], WF.CERT_PART_LABEL_TH["2"]], [["1", "2", "file"], "ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)", "ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)"]);
eq("C0.4", "เล่มที่ = ปี พ.ศ. ของวันที่ออก (ค่าเริ่มต้นของระบบ) · เงื่อนไขไม่ระบุ = (1)", [WF.certBookNo(new Date("2026-04-02T03:00:00Z")), WF.whtConditionOf(null), WF.whtConditionOf(3)], ["2569", 1, 3]);

let tid = "";
let prisma: Any = null;
try {
  console.log("\n── C1 ฟิกซ์เจอร์ ──");
  const S = await F.setupWhtShop("QC T3.3 50 ทวิ", "qc-t33");
  tid = S.tid;
  prisma = S.prisma;
  const { SYS, ctx, owner } = S;
  const x1 = await S.payVendor({ vendorId: S.vJur.id, ym: P, d: 2, base: 1_000_000, wht: 30_000, rateBp: 300, incomeType: "M40_8", key: "t33-x1" });
  const x2 = await S.payVendor({ vendorId: S.vInd.id, ym: P, d: 3, base: 123_456, wht: 3_704, rateBp: 300, incomeType: "M40_8", key: "t33-x2" });
  const x3 = await S.payVendor({ vendorId: S.vForeign.id, ym: P, d: 4, base: 300_000, wht: 45_000, rateBp: 1500, incomeType: "M40_2", key: "t33-x3" });

  console.log("\n── C2 หน้าพิมพ์ตามแบบ ──");
  const l1 = await WC.loadCertPrint(ctx, x1.certId, { fmtDate: fmt });
  const m1 = l1.model;
  eq("C2.1", "ฝ่าย (ทิศ IN): ผู้หัก = ร้าน (ชื่อ เลข 13 หลัก นิติบุคคล) · ผู้ถูกหัก = ผู้ขาย", [m1.payer.name, m1.payer.taxId, m1.payer.kindTh, m1.payee.name, m1.payee.taxId, m1.payee.kindTh], ["บริษัท หักภาษี ทดสอบ จำกัด", F.thaiTaxId("010556100003"), "นิติบุคคล", "บริษัท รับเหมา จำกัด", F.thaiTaxId("010556199991"), "นิติบุคคล"]);
  eq("C2.2", "ช่องแบบ (7) ภ.ง.ด.53 · ลำดับที่ 1 · แถว 5 · ยอด 1,000,000/30,000 · ตัวอักษร · เงื่อนไข (1) · เล่มที่ 2569", [m1.formBox, m1.seq, m1.incomeRow, m1.amount, m1.tax, m1.taxWords, m1.condition, m1.bookNo], [7, 1, 5, 1_000_000, 30_000, "สามร้อยบาทถ้วน", 1, "2569"]);
  const h1 = html(m1, ["1", "2", "file"]);
  const t1 = text(h1);
  chk("C2.3", "ชุด 3 หน้า: ฉบับที่ 1 · ฉบับที่ 2 · สำเนาคู่ฉบับ (ข้อความครบ)", (h1.match(/data-testid="wht-cert-page"/g) ?? []).length === 3 && t1.includes("ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)") && t1.includes("ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)") && t1.includes("สำเนาคู่ฉบับ"), "3 หน้า", t1.slice(0, 400));
  const must = ["หนังสือรับรองการหักภาษี ณ ที่จ่าย", "ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร", "เล่มที่", "เลขที่", "ผู้มีหน้าที่หักภาษี ณ ที่จ่าย", "ผู้ถูกหักภาษี ณ ที่จ่าย", "เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)", "ลำดับที่", "ภ.ง.ด.1ก พิเศษ", "ภ.ง.ด.2ก", "ภ.ง.ด.3ก", "ภ.ง.ด.53", "ตามมาตรา 40 (1)", "ตามมาตรา 3 เตรส", "รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)", "สามร้อยบาทถ้วน", "กองทุนประกันสังคม", "ออกให้ตลอดไป", "ออกให้ครั้งเดียว", "คำเตือน", "มาตรา 35", "ประทับตรา"];
  const missing = must.filter((x) => !t1.includes(x));
  eq("C2.4", "รายการบังคับของแบบครบทุกข้อ (§7)", missing, []);
  chk("C2.5", "ติ๊กช่อง (7) เท่านั้น · ติ๊กเงื่อนไข (1) · แถว 5 กรอก · แถวอื่นว่าง", /data-testid="wht-cert-form-7" data-on="1"/.test(h1) && !/data-testid="wht-cert-form-4" data-on="1"/.test(h1) && /data-testid="wht-cert-cond-1" data-on="1"/.test(h1) && /data-testid="wht-cert-row-5" data-on="1"/.test(h1) && /data-testid="wht-cert-row-2" data-on="0"/.test(h1), "ช่อง 7/เงื่อนไข 1", "?");
  chk("C2.6", "ไม่มีลายน้ำยกเลิก · ไม่มีคำว่า \"ถูกกฎหมาย\"", !h1.includes("wht-cert-void-watermark") && !t1.includes("ถูกกฎหมาย"), "ไม่มี", "?", "MAJOR");
  const m2 = (await WC.loadCertPrint(ctx, x2.certId, { fmtDate: fmt })).model;
  eq("C2.7", "บุคคลไทย 40(8): ช่อง (4) ภ.ง.ด.3 · ผู้ถูกหัก \"บุคคล\" · ตัวอักษรมีสตางค์", [m2.formBox, m2.payee.kindTh, m2.taxWords, m2.seq], [4, "บุคคล", "สามสิบเจ็ดบาทสี่สตางค์", 1]);
  const m3 = (await WC.loadCertPrint(ctx, x3.certId, { fmtDate: fmt })).model;
  chk("C2.8", "ต่างประเทศ 40(2): แบบ 54 · ไม่ติ๊กช่องใด + หมายเหตุ \"ไม่มีช่อง ภ.ง.ด.54\"", m3.form === 54 && m3.formBox === null && /ไม่มีช่อง ภ.ง.ด.54/.test(m3.noBoxNote ?? ""), "54/null", m3);
  const one = html(m1, ["2"]);
  chk("C2.9", "?part=2 = หน้าเดียว ฉบับที่ 2", (one.match(/data-testid="wht-cert-page"/g) ?? []).length === 1 && text(one).includes("ฉบับที่ 2"), "1 หน้า", "?");

  console.log("\n── C3 บันทึกการพิมพ์ (กลไก T2.7) ──");
  const p1 = await PL.recordDocPrint(ctx, x1.certId, { request: "SET", channel: "SCREEN", actorId: owner.id });
  const p2 = await PL.recordDocPrint(ctx, x1.certId, { request: "SET", channel: "SCREEN", actorId: owner.id });
  eq("C3.1", "พิมพ์ครั้งแรก = SET · ครั้งต่อไป = COPY (หน้าพิมพ์ขึ้น \"พิมพ์ซ้ำครั้งที่ n\")", [p1.kind, p2.kind], ["SET", "COPY"]);
  const mRe = (await WC.loadCertPrint(ctx, x1.certId, { fmtDate: fmt, reprintNo: 1 })).model;
  chk("C3.2", "พิมพ์ซ้ำ: มุมบน \"พิมพ์ซ้ำครั้งที่ 1\" ทุกหน้า", (html(mRe, ["1", "2", "file"]).match(/พิมพ์ซ้ำครั้งที่ 1/g) ?? []).length === 3, "3", "?");

  console.log("\n── C4 ยกเลิกแล้วออกใบแทน (F8) ──");
  const old = await prisma.accountDocument.findUniqueOrThrow({ where: { id: x1.certId } });
  const r0 = await WC.replaceWhtCert(ctx, x1.certId, { reason: "ประเภทเงินได้ผิด", whtIncomeType: "M40_7", whtCondition: 2, actorId: owner.id, ack: LG.screenAck([], owner.id) });
  chk("C4.1", "ไม่ยืนยัน → LEGAL_ACK_REQUIRED (WHT_CERT_REPLACE [U] · ต่อท้ายให้ตรวจกับนักบัญชี) · ไม่เขียนอะไร", !r0.ok && r0.legal?.warnings?.[0]?.code === "WHT_CERT_REPLACE" && r0.legal.warnings[0].tag === "U" && /โปรดตรวจกับนักบัญชีของร้าน/.test(r0.legal.warnings[0].messageTh) && (await prisma.accountDocument.count({ where: { systemId: SYS, docType: "WHT_CERT" } })) === 3, "legal", r0);
  const rBad = await WC.replaceWhtCert(ctx, x1.certId, { reason: "x", ack: LG.screenAck(["WHT_CERT_REPLACE"], owner.id) });
  eq("C4.2", "เหตุสั้นเกิน = REASON_REQUIRED (ความถูกต้องของเอกสาร)", rBad.code, "REASON_REQUIRED");
  const r1 = await WC.replaceWhtCert(ctx, x1.certId, { reason: "ประเภทเงินได้ผิด", whtIncomeType: "M40_7", whtCondition: 2, actorId: owner.id, ack: LG.screenAck(["WHT_CERT_REPLACE"], owner.id) });
  const oldA = await prisma.accountDocument.findUniqueOrThrow({ where: { id: x1.certId } });
  const neu = r1.ok ? await prisma.accountDocument.findUniqueOrThrow({ where: { id: r1.certId } }) : null;
  const payA = await prisma.accountDocumentPayment.findUniqueOrThrow({ where: { id: x1.paymentId } });
  eq("C4.3", "ใบเดิม VOIDED + replacedById = ใบใหม่ + เหตุผล · ไม่ลบ", [r1.ok, oldA.status, oldA.replacedById === r1.certId, /ประเภทเงินได้ผิด/.test(oldA.voidReason ?? "")], [true, "VOIDED", true, true]);
  eq("C4.4", "ใบใหม่: เลขใหม่ · วันที่จ่ายเดิม · ยอด/อัตราเดิม · ประเภท 40(7) · เงื่อนไข 2 · หมายเหตุอ้างเลขเดิม", [neu?.docNo !== old.docNo && !!neu?.docNo, neu?.issueDate.toISOString() === old.issueDate.toISOString(), neu?.subTotal, neu?.whtAmount, neu?.whtRateBp, neu?.whtIncomeType, neu?.whtCondition, neu?.note?.includes(`ออกแทนฉบับเลขที่ ${old.docNo}`)], [true, true, 1_000_000, 30_000, 300, "M40_7", 2, true]);
  eq("C4.5", "การจ่ายชี้ใบใหม่ · relation REPLACE · รอยรับทราบ + AuditLog account.wht.cert.replace", [payA.whtCertDocId === r1.certId, await prisma.accountDocumentRelation.count({ where: { systemId: SYS, fromId: x1.certId, toId: r1.certId, type: "REPLACE" } }), await prisma.auditLog.count({ where: { tenantId: S.tid, action: "legal.warning.ack", targetId: x1.certId } }), await prisma.auditLog.count({ where: { tenantId: S.tid, action: "account.wht.cert.replace" } })], [true, 1, 1, 1]);
  const mOld = (await WC.loadCertPrint(ctx, x1.certId, { fmtDate: fmt })).model;
  const hOld = html(mOld, ["1"]);
  chk("C4.6", "พิมพ์ใบเดิม: ลายน้ำ \"ยกเลิก\" + บรรทัด \"ออกใบแทนแล้ว เลขที่ …\"", hOld.includes("wht-cert-void-watermark") && text(hOld).includes(`ออกใบแทนแล้ว เลขที่ ${neu?.docNo}`), "ยกเลิก", text(hOld).slice(0, 300));
  const mNew = (await WC.loadCertPrint(ctx, r1.certId, { fmtDate: fmt })).model;
  chk("C4.7", "พิมพ์ใบใหม่: \"ออกแทนฉบับเลขที่ <เดิม> ลงวันที่ 2 เมษายน 2569\" · ติ๊กเงื่อนไข (2) · แถว 5 (40(7))", (mNew.replacesLine ?? "").includes(`ออกแทนฉบับเลขที่ ${old.docNo} ลงวันที่ 2 เมษายน 2569`) && mNew.condition === 2 && mNew.incomeRow === 5 && !mNew.cancelled, "ใบแทน", mNew);
  const again = await WC.replaceWhtCert(ctx, x1.certId, { reason: "ซ้ำอีกรอบ", ack: LG.screenAck(["WHT_CERT_REPLACE"], owner.id) });
  eq("C4.8", "ออกแทนใบที่ถูกยกเลิกแล้วซ้ำไม่ได้ (NOT_LIVE)", again.code, "NOT_LIVE");

  console.log("\n── C5 ฝั่งถูกหัก (WTI) — ฝ่ายสลับ ──");
  const iv = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType: "INVOICE", contactId: S.cust.id, issueDate: S.day(P, 10), vatMode: "NONE", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 500_000, vatRateBp: 0 }], createdById: owner.id });
  const ivr = await acc.issueDocument(S.tid, SYS, iv.id);
  if (!ivr.ok) throw new Error("IV " + ivr.reason);
  const rp = await acc.recordPayment(S.tid, SYS, iv.id, { paidAt: S.day(P, 10), channel: "TRANSFER", financeAccountId: S.bank.id, amount: 485_000, whtAmountSatang: 15_000, whtRateBp: 300, whtIncomeType: "M40_8", createdById: owner.id, idempotencyKey: `t33-wti-${S.tid}` });
  if (!rp.ok) throw new Error("RP " + rp.reason);
  const wti = await prisma.accountDocument.findFirstOrThrow({ where: { systemId: SYS, docType: "WHT_CERT", direction: "OUT" } });
  const mW = (await WC.loadCertPrint(ctx, wti.id, { fmtDate: fmt })).model;
  const hW = html(mW, ["1", "2", "file"]);
  chk("C5.1", "WTI: ผู้หัก = ลูกค้า · ผู้ถูกหัก = ร้าน · หน้าเดียว ไม่มีป้ายฉบับ · แถบ \"บันทึกของผู้ถูกหัก\" + ยังไม่ได้รับ", mW.payer.name === "บริษัท ลูกค้าหักเรา จำกัด" && mW.payee.name === "บริษัท หักภาษี ทดสอบ จำกัด" && (hW.match(/data-testid="wht-cert-page"/g) ?? []).length === 1 && !text(hW).includes("ฉบับที่ 1") && /บันทึกของผู้ถูกหัก/.test(mW.recordBanner ?? "") && /ยังไม่ได้รับ/.test(mW.recordBanner ?? ""), "สลับ", mW);
  const rW = await WC.replaceWhtCert(ctx, wti.id, { reason: "ลองออกแทนฝั่งถูกหัก", ack: LG.screenAck(["WHT_CERT_REPLACE"], owner.id) });
  eq("C5.2", "ฝั่งถูกหักออกใบแทนไม่ได้ (WRONG_SIDE) — ใบนี้ไม่ใช่หนังสือรับรองที่ร้านออก", rW.code, "WRONG_SIDE");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 8).join("\n")}` : String(e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T3.3 50 ทวิ ตามแบบ =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length > 0 ? 1 : 0);

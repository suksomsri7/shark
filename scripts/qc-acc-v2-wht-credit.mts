// QC ACC T3.5 — ฝั่งถูกหัก: รายงานค้างรับ 50 ทวิ จากลูกค้า (ปิด F13) · design note ledger/wo-notes/T3.5.md
// กฎ: skill shark-thai-law common-withholding-tax.md §15 [V] (ทะเบียน 50 ทวิ ที่ได้รับ + รายงานค้างรับ) · test-rules T-WHT-10
// ร้านทดสอบแยก "QC T3.5 ค้างรับ" · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-wht-credit.mts
//
// เฉลยมือ (สตางค์): ใบแจ้งหนี้ 3 ใบ (ไม่มี VAT) ลูกค้านิติบุคคลหัก 3%
//   K1 2026-04-05 ฐาน 1,000,000 รับ 970,000 + ถูกหัก 30,000 · K2 2026-04-06 ฐาน 200,000 รับ 194,000 + 6,000 · K3 2026-04-07 ฐาน 100,000 รับ 97,000 + 3,000
//   ค้างรับเริ่มต้น 3 ใบ ภาษี 39,000 · แนบไฟล์ที่ K1 = ยังค้าง (ไม่เดาจากไฟล์แนบ) · ทำเครื่องหมาย K1 → ค้าง 2 ใบ 9,000
//   ยกเลิกรับชำระ K3 → WTI ยกเลิก → ค้าง 1 ใบ 6,000 · ยกเลิกเครื่องหมาย K1 → ค้าง 2 ใบ 36,000
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-wht-credit");

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
const WHT: Any = await import("@/lib/modules/account/wht" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
const P = "2026-04";

let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T3.5 ค้างรับ", "qc-t35");
  tid = S.tid;
  prisma = S.prisma;
  const { SYS, ctx, owner } = S;
  const sell = async (k: string, d: number, base: number, wht: number) => {
    const iv = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType: "INVOICE", contactId: S.cust.id, issueDate: S.day(P, d), vatMode: "NONE", lines: [{ description: `บริการ ${k}`, qty: 1, unitPrice: base, vatRateBp: 0 }], createdById: owner.id });
    const r = await acc.issueDocument(S.tid, SYS, iv.id);
    if (!r.ok) throw new Error(`${k}: ${r.reason}`);
    const p = await acc.recordPayment(S.tid, SYS, iv.id, { paidAt: S.day(P, d), channel: "TRANSFER", financeAccountId: S.bank.id, amount: base - wht, whtAmountSatang: wht, whtRateBp: 300, whtIncomeType: "M40_8", createdById: owner.id, idempotencyKey: `t35-${k}-${S.tid}` });
    if (!p.ok) throw new Error(`${k} pay: ${p.reason}`);
    const pay = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: iv.id } });
    return { docId: iv.id, paymentId: pay.id, certId: pay.whtCertDocId as string };
  };
  const k1 = await sell("K1", 5, 1_000_000, 30_000);
  const k2 = await sell("K2", 6, 200_000, 6_000);
  const k3 = await sell("K3", 7, 100_000, 3_000);

  console.log("\n── R1 ค้างรับเริ่มต้น ──");
  const o0 = await WC.whtCreditsOwed(ctx, { asOf: new Date("2026-04-15T12:00:00+07:00") });
  eq("R1.1", "ค้างรับ 3 ใบ · ภาษี 39,000 · ฐาน 1,300,000 · เรียงตามวันที่รับเงิน · ค้าง 10/9/8 วัน", [o0.rows.length, o0.totalWht, o0.totalBase, o0.rows.map((r: Any) => r.daysOwed)], [3, 39_000, 1_300_000, [10, 9, 8]]);
  eq("R1.2", "รวมต่อลูกค้า 1 ราย 3 ใบ · คำเตือน WHT_CREDIT_CERT_OWED [V] ไม่ต้องยืนยัน", [o0.byContact.map((b: Any) => [b.contactName, b.count, b.whtAmount]), o0.warnings.map((w: Any) => [w.code, w.tag, w.ack])], [[["บริษัท ลูกค้าหักเรา จำกัด", 3, 39_000]], [["WHT_CREDIT_CERT_OWED", "V", false]]]);
  await prisma.accountAttachment.create({ data: { tenantId: S.tid, systemId: SYS, documentId: k1.docId, fileName: "50tawi-k1.pdf", fileUrl: "https://example.invalid/50tawi-k1.pdf", mimeType: "application/pdf", sizeBytes: 1234, uploadedById: owner.id } });
  const o1 = await WC.whtCreditsOwed(ctx);
  eq("R1.3", "แนบไฟล์ที่เอกสารต้นทาง K1 = ยังค้าง (ไม่เดาจากไฟล์แนบ) · แสดงว่ามีไฟล์แนบเป็นข้อมูลประกอบ", [o1.rows.length, o1.rows.find((r: Any) => r.certId === k1.certId)?.hasAttachment], [3, true]);

  console.log("\n── R2 ทำเครื่องหมายรับแล้ว ──");
  const m1 = await WC.markWhtCreditReceived(ctx, k1.certId, { received: true, note: "เล่ม 12 เลขที่ 345", at: new Date("2026-04-20T12:00:00+07:00"), actorId: owner.id });
  const o2 = await WC.whtCreditsOwed(ctx);
  eq("R2.1", "รับ K1 → ค้าง 2 ใบ 9,000 · วันที่รับ 20 เม.ย. · หมายเหตุเก็บ", [m1.ok, m1.changed, o2.rows.length, o2.totalWht, (await prisma.accountDocument.findUniqueOrThrow({ where: { id: k1.certId } })).whtCertReceivedNote], [true, true, 2, 9_000, "เล่ม 12 เลขที่ 345"]);
  const m1b = await WC.markWhtCreditReceived(ctx, k1.certId, { received: true, actorId: owner.id });
  eq("R2.2", "ทำซ้ำ = ไม่เปลี่ยน (idempotent) · ไม่มี audit เพิ่ม", [m1b.ok, m1b.changed, await prisma.auditLog.count({ where: { tenantId: S.tid, action: "account.wht.credit.received" } })], [true, false, 1]);
  const cr = await WHT.listWhtCredits(S.tid, SYS, { period: P });
  eq("R2.3", "ทะเบียนเครดิตภาษี: K1 ได้รับแล้ว · K2/K3 ยังไม่ได้รับ", cr.rows.map((r: Any) => !!r.certReceivedAt), [true, false, false]);
  const csv: string = await WHT.whtCreditsCsv(S.tid, SYS, { period: P });
  chk("R2.4", "CSV เครดิตภาษี: คอลัมน์ \"ได้รับ 50 ทวิ แล้ว\" + วันที่ได้รับ (ธงจริง)", csv.includes("ได้รับ 50 ทวิ แล้ว") && csv.includes("ได้รับแล้ว,2026-04-20") && (csv.match(/ยังไม่ได้รับ/g) ?? []).length === 2, "ธง", csv);
  const lst = await WHT.listWhtCertsV2(S.tid, SYS, { direction: "OUT", owedOnly: true });
  eq("R2.5", "หน้า WHT ฝั่งถูกหัก ตัวกรองค้างรับ = 2 แถว", [lst.total, lst.rows.every((r: Any) => r.certReceivedAt === null)], [2, true]);

  console.log("\n── R3 ยกเลิก · ยกเลิกเครื่องหมาย · ฝั่งผิด ──");
  const vp = await acc.voidPayment(S.tid, SYS, k3.docId, k3.paymentId, "รับผิดใบ");
  const o3 = await WC.whtCreditsOwed(ctx);
  eq("R3.1", "ยกเลิกรับชำระ K3 → WTI ยกเลิก → ไม่อยู่ในค้างรับ (1 ใบ 6,000)", [vp.ok, o3.rows.length, o3.totalWht], [true, 1, 6_000]);
  const mVoid = await WC.markWhtCreditReceived(ctx, k3.certId, { received: true, actorId: owner.id });
  eq("R3.2", "ทำเครื่องหมายใบที่ยกเลิกแล้ว = NOT_LIVE", mVoid.code, "NOT_LIVE");
  const u1 = await WC.markWhtCreditReceived(ctx, k1.certId, { received: false, note: "ติ๊กผิดแถว", actorId: owner.id });
  const o4 = await WC.whtCreditsOwed(ctx);
  const ua = await prisma.auditLog.findFirst({ where: { tenantId: S.tid, action: "account.wht.credit.unreceived" }, select: { after: true } });
  eq("R3.3", "ยกเลิกเครื่องหมาย K1 → กลับมาค้าง (2 ใบ 36,000) · audit เก็บเหตุผล", [u1.ok, o4.rows.length, o4.totalWht, (ua?.after as Any)?.reason], [true, 2, 36_000, "ติ๊กผิดแถว"]);
  const x = await S.payVendor({ vendorId: S.vJur.id, ym: P, d: 8, base: 100_000, wht: 3_000, rateBp: 300, incomeType: "M40_8", key: "t35-in" });
  const wrong = await WC.markWhtCreditReceived(ctx, x.certId, { received: true, actorId: owner.id });
  eq("R3.4", "50 ทวิ ที่ร้านหักผู้ขาย (IN) ทำเครื่องหมายรับไม่ได้ (WRONG_SIDE)", wrong.code, "WRONG_SIDE");
  const nf = await WC.markWhtCreditReceived(ctx, "nope", { received: true });
  eq("R3.5", "ไม่พบ = NOT_FOUND", nf.code, "NOT_FOUND");
  void k2;
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 8).join("\n")}` : String(e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T3.5 ค้างรับ 50 ทวิ =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length > 0 ? 1 : 0);

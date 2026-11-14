// QC ACC T5.7 หนี้สูญ/ค่าเผื่อ (เลน 2) — ตัดหนี้สูญไม่ลดรายได้ · ใช้ค่าเผื่อก่อน · VAT บริการที่พักกลับ · เงื่อนไขภาษีต้องกดยืนยัน · ยกเลิกได้
//   ร้านทดสอบแยก (ลบตอนจบ · KEEP=1 = เก็บไว้ดูหน้าจอ) · ค่าคาดหวังคำนวณมือ — ดู ledger/wo-notes/
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-bad-debt.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-bad-debt");

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
const acc: Any = await import("@/lib/modules/account/service" as string);
const GL: Any = await import("@/lib/modules/account/gl" as string);
const LV: Any = await import("@/lib/modules/account/legal-values" as string);
const fin: Any = await import("@/lib/modules/account/finance" as string);
const exp: Any = await import("@/lib/modules/account/expense" as string);
const BD: Any = await import("@/lib/modules/account/bad-debt" as string);
const BR: Any = await import("@/lib/modules/account/books-report" as string);
const clock: Any = await import("@/lib/modules/account/clock" as string);
/** ใบแจ้งหนี้ไม่มี VAT ยอด baht ออกแล้ว (+ รับเงินได้) */
async function invoice(S: Any, contactId: string, ymd: string, satang: number, lines?: Any[]) {
  const iv = await acc.createDocument({ tenantId: S.tid, systemId: S.SYS, docType: "INVOICE", contactId, issueDate: new Date(`${ymd}T10:00:00+07:00`), dueDate: new Date(`${ymd}T10:00:00+07:00`), vatMode: lines ? "EXCLUDE" : "NONE", lines: lines ?? [{ description: "ค่าบริการ", qty: 1, unitPrice: satang, vatRateBp: 0 }], createdById: S.owner.id });
  const r = await acc.issueDocument(S.tid, S.SYS, iv.id, { ack: { codes: ["SALE_WITHOUT_VAT_REGISTERED", "TAX_INVOICE_NOT_VAT_REGISTERED", "BUYER_TAX_ID_MISSING"], actorId: S.owner.id } });
  if (r && r.ok === false) throw new Error(`issue ${ymd}: ${r.reason}`);
  return iv.id as string;
}
async function receive(S: Any, docId: string, ymd: string, satang: number, key: string) {
  return acc.recordPayment(S.tid, S.SYS, docId, { paidAt: new Date(`${ymd}T11:00:00+07:00`), channel: "TRANSFER", financeAccountId: S.bank.id, amount: satang, createdById: S.owner.id, idempotencyKey: `${key}-${S.tid}` });
}

eq("B0.1", "ระดับเงื่อนไขตามยอดต่อราย (200,000 / 2,000,000 จากตาราง)", [BD.badDebtTierTh(20_000_000, 20_000_000, 200_000_000).includes("ทวงถาม"), BD.badDebtTierTh(20_000_001, 20_000_000, 200_000_000).includes("ศาลมีคำสั่งรับคำฟ้อง"), BD.badDebtTierTh(200_000_001, 20_000_000, 200_000_000).includes("หมายบังคับคดี")], [true, true, true]);
let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T5.7 หนี้สูญ", "qc-t57-bd");
  tid = S.tid;
  prisma = S.prisma;
  const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(clock.accountNow()).slice(0, 7);
  const d = (n: number) => `${ym}-${String(n).padStart(2, "0")}`;
  const map = async (key: string) => (await prisma.accountMapping.findFirstOrThrow({ where: { systemId: S.SYS, key }, select: { accountId: true } })).accountId as string;
  const [ar, undue, allow, bdx, dbx] = [await map("AR"), await map("VAT_OUTPUT_UNDUE"), await map("DOUBTFUL_ALLOWANCE"), await map("BAD_DEBT_EXPENSE"), await map("DOUBTFUL_EXPENSE")];
  const codes = await prisma.accountLedger.findMany({ where: { id: { in: [allow, bdx, dbx] } }, select: { id: true, code: true, type: true } });
  eq("B1.0", "ผังบัญชีใหม่ของสมุด: 1109 ค่าเผื่อ (สินทรัพย์) · 6720 หนี้สูญ · 6710 หนี้สงสัยจะสูญ", [allow, bdx, dbx].map((id) => codes.find((c: Any) => c.id === id)?.code), ["1109", "6720", "6710"]);
  const bal = async (accountId: string) => {
    const a = await prisma.accountJournalLine.aggregate({ where: { systemId: S.SYS, accountId }, _sum: { debit: true, credit: true } });
    return (a._sum.debit ?? 0) - (a._sum.credit ?? 0);
  };
  const revBefore = await prisma.accountJournalLine.aggregate({ where: { systemId: S.SYS, account: { type: "INCOME" } }, _sum: { debit: true, credit: true } });
  // ใบบริการ 10,000 + VAT 700 (พักจนรับเงิน) · รับครึ่ง 5,350 → ปล่อย VAT 350 · ค้าง 5,350 (VAT พัก 350)
  const iv = await invoice(S, S.cust.id, d(1), 0, [{ description: "ค่าบริการดำน้ำ", qty: 1, unitPrice: 1_000_000, vatRateBp: 700, lineKind: "SERVICE" }]);
  await receive(S, iv, d(2), 535_000, "t57-half");
  eq("B1.1", "ก่อนตัด: VAT พักของใบ 350 · ลูกหนี้ 5,350", [-(await bal(undue)), await bal(ar)], [35_000, 535_000]);
  const al = await BD.setDoubtfulAllowance(S.ctx, { target: 200_000, date: new Date(`${d(3)}T12:00:00+07:00`), note: "รายตัว" });
  eq("B2.1", "ตั้งค่าเผื่อ 2,000: Dr 6710 / Cr 1109 · คำเตือน BAD_DEBT_ALLOWANCE_ADD_BACK [V]", [al.ok, al.before, al.after, al.delta, -(await bal(allow)), await bal(dbx), al.warnings.map((w: Any) => [w.code, w.tag])], [true, 0, 200_000, 200_000, 200_000, 200_000, [["BAD_DEBT_ALLOWANCE_ADD_BACK", "V"]]]);
  const no = await BD.writeOffBadDebt(S.ctx, { documentId: iv, date: new Date(`${d(4)}T12:00:00+07:00`) });
  eq("B3.1", "ไม่กดยืนยัน → ยังไม่บันทึก + BAD_DEBT_TAX_CONDITIONS ต้องยืนยัน (ระดับไม่เกิน 200,000)", [no.ok, no.legal?.warnings.map((w: Any) => [w.code, w.ack]), no.legal?.warnings[0].messageTh.includes("ทวงถาม"), await prisma.accountDocumentPayment.count({ where: { documentId: iv, channel: "BAD_DEBT" } })], [false, [["BAD_DEBT_TAX_CONDITIONS", true]], true, 0]);
  const ok = await BD.writeOffBadDebt(S.ctx, { documentId: iv, date: new Date(`${d(4)}T12:00:00+07:00`), note: "ทวงถาม 3 ครั้ง", createdById: S.owner.id, ack: { codes: ["BAD_DEBT_TAX_CONDITIONS"], actorId: S.owner.id, via: "test" } });
  eq("B3.2", "กดยืนยัน → ตัด 5,350 · ใบปิด (PAID)", [ok.ok, ok.amount, ok.status, (await prisma.accountDocument.findFirst({ where: { id: iv }, select: { paidTotal: true } })).paidTotal], [true, 535_000, "PAID", 1_070_000]);
  eq("B3.3", "GL: VAT พักกลับ 350 (เหลือ 0) · ใช้ค่าเผื่อ 2,000 (เหลือ 0) · หนี้สูญ 3,000 · ลูกหนี้ 0", [await bal(undue), await bal(allow), await bal(bdx), await bal(ar)], [0, 0, 300_000, 0]);
  const revAfter = await prisma.accountJournalLine.aggregate({ where: { systemId: S.SYS, account: { type: "INCOME" } }, _sum: { debit: true, credit: true } });
  eq("B3.4", "รายได้ไม่ถูกลด (NPAEs 18.10): เดบิตบัญชีรายได้ไม่เพิ่ม", (revAfter._sum.debit ?? 0) - (revBefore._sum.debit ?? 0), 0);
  const sub = await BR.subsidiaryLedger(S.ctx, { side: "AR", from: new Date(`${d(1)}T00:00:00+07:00`), to: new Date(`${d(28)}T23:59:59+07:00`) });
  eq("B3.5", "บัญชีย่อยลูกหนี้: ลูกค้ารายนี้ยกไป 0 (ทุกบรรทัดตัดหนี้มีผู้ติดต่อ)", sub.rows.find((r: Any) => r.contactId === S.cust.id)?.closing ?? 0, 0);
  const acks = await prisma.auditLog.count({ where: { tenantId: S.tid, action: "legal.warning.ack", targetId: iv } });
  eq("B3.6", "รอยรับทราบลง AuditLog", acks, 1);
  const pay = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: iv, channel: "BAD_DEBT" }, select: { id: true, financeAccountId: true, entryId: true } });
  eq("B3.7", "รายการชำระช่องทาง BAD_DEBT ไม่มีบัญชีเงิน · ผูก JV", [pay.financeAccountId, !!pay.entryId], [null, true]);
  const dup = await BD.writeOffBadDebt(S.ctx, { documentId: iv, ack: { codes: ["BAD_DEBT_TAX_CONDITIONS"] } });
  chk("B3.8", "ใบปิดแล้ว ตัดซ้ำไม่ได้ (ไม่มียอดค้าง)", dup.ok === false && /ไม่มียอดค้าง/.test(dup.reason), "ปฏิเสธ", dup);
  const sm = await BD.badDebtSummary(S.ctx);
  eq("B4.1", "สรุป: ค่าเผื่อ 0 · ประวัติ 1 รายการ 5,350", [sm.allowance, sm.writeOffs.map((w: Any) => [w.amount, w.voided])], [0, [[535_000, false]]]);
  const v = await acc.voidPayment(S.tid, S.SYS, iv, pay.id, "ลูกค้ากลับมาชำระ");
  eq("B5.1", "ยกเลิกการตัดหนี้สูญ → กลับรายการทั้งสองใบ: VAT พัก 350 · ค่าเผื่อ 2,000 · หนี้สูญ 0 · ลูกหนี้ 5,350 · ใบกลับเป็นชำระบางส่วน", [v.ok, -(await bal(undue)), -(await bal(allow)), await bal(bdx), await bal(ar), (await prisma.accountDocument.findFirst({ where: { id: iv }, select: { status: true } })).status], [true, 35_000, 200_000, 0, 535_000, "PARTIAL"]);
  // วันที่ตัด = วันนี้ (หลังรายการกลับของการยกเลิกที่ลงวันนี้ — ค่าเผื่อคงเหลือนับถึงวันที่ตัด)
  const part = await BD.writeOffBadDebt(S.ctx, { documentId: iv, amount: 107_000, ack: { codes: ["BAD_DEBT_TAX_CONDITIONS"] } });
  eq("B6.1", "ตัดบางส่วน 1,070 → VAT ตามสัดส่วน 70 (700 × 1,070 / 10,700) · ค่าเผื่อ 1,000 → เหลือ 1,000 · ใบยังค้าง", [part.ok, part.status, -(await bal(undue)), -(await bal(allow))], [true, "PARTIAL", 28_000, 100_000]);
  const over = await BD.writeOffBadDebt(S.ctx, { documentId: iv, amount: 999_999_99, ack: { codes: ["BAD_DEBT_TAX_CONDITIONS"] } });
  const wrongSide = await BD.writeOffBadDebt(S.ctx, { documentId: (await S.payVendor({ vendorId: S.vJur.id, ym, d: 1, base: 100_000, wht: 0, rateBp: 0, key: "t57-exp" })).docId });
  eq("B6.2", "ยอดเกินยอดค้าง / เอกสารรายจ่าย = ปฏิเสธพร้อมเหตุผล", [over.ok, /ไม่เกินยอดค้าง/.test(over.reason ?? ""), wrongSide.ok, /เฉพาะ/.test(wrongSide.reason ?? "")], [false, true, false, true]);
  const dn = await BD.setDoubtfulAllowance(S.ctx, { target: 50_000 });
  eq("B7.1", "ลดค่าเผื่อจาก 1,000 เหลือ 500 → Dr 1109 / Cr 6710 500 · ไม่มีคำเตือนบวกกลับ (ไม่ได้ตั้งเพิ่ม)", [dn.ok, dn.delta, -(await bal(allow)), await bal(dbx), dn.warnings.length], [true, -50_000, 50_000, 150_000, 0]);
  const neg = await BD.setDoubtfulAllowance(S.ctx, { target: -1 });
  eq("B7.2", "ยอดติดลบ = ปฏิเสธ (รูปแบบข้อมูล)", neg.ok, false);
  const big = await BD.writeOffWarnings(S.ctx, iv, null, new Date());
  chk("B8.1", "ร้านทับเกณฑ์ (ไม่บล็อก) → ข้อความใช้ค่าของร้าน", "warnings" in big, true, big);
  const sv = await LV.saveBookTax(S.ownerActor, S.ctx, { bookRows: [{ id: "shop-bd1", rule: "BAD_DEBT_TIER1_MAX", value: 100_000, from: null, to: null, source: "ร้านทดสอบ", checkedAt: null }] }, "QC T5.7");
  const big2 = await BD.writeOffWarnings(S.ctx, iv, null, new Date());
  eq("B8.2", "เกณฑ์ขั้นแรกของร้าน 1,000 → ยอด 4,280 ขึ้นระดับฟ้องศาล + SHOP_DIFFERS_FROM_DEFAULT", [sv.ok, big2.warnings.map((w: Any) => w.code), big2.warnings[0].messageTh.includes("ศาลมีคำสั่งรับคำฟ้อง")], [true, ["BAD_DEBT_TAX_CONDITIONS", "SHOP_DIFFERS_FROM_DEFAULT"], true]);
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T5.7 หนี้สูญ/ค่าเผื่อ =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length ? 1 : 0);

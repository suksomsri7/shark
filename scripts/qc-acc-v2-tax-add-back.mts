// QC ACC T5.5 บวกกลับทางภาษี (เลน 2) — ธงอนุมาตรา ม.65 ตรี ต่อบัญชี · รายงานรวม · ตัวช่วยเพดานค่ารับรอง (0.3% · 2,000 ต่อคน)
//   ร้านทดสอบแยก (ลบตอนจบ · KEEP=1 = เก็บไว้ดูหน้าจอ) · ค่าคาดหวังคำนวณมือ — ดู ledger/wo-notes/
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-tax-add-back.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-tax-add-back");

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
const AB: Any = await import("@/lib/modules/account/tax-add-back" as string);
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

console.log("\n── A0 pure ──");
eq("A0.1", "เพดาน = max(0.3% รายได้, 0.3% ทุน) ไม่เกิน 10 ล้าน", [AB.entertainmentCapOf({ revenue: 200_000_000, capital: 100_000_000, rateBp: 30, maxCap: 1_000_000_000 }), AB.entertainmentCapOf({ revenue: 200_000_000, capital: 500_000_000, rateBp: 30, maxCap: 1_000_000_000 }), AB.entertainmentCapOf({ revenue: 1_000_000_000_000, capital: null, rateBp: 30, maxCap: 1_000_000_000 }).cap], [{ cap: 600_000, baseLabel: "รายได้" }, { cap: 1_500_000, baseLabel: "ทุนชำระแล้ว" }, 1_000_000_000]);
let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T5.5 บวกกลับ", "qc-t55-ab");
  tid = S.tid;
  prisma = S.prisma;
  await acc.saveSettings(S.tid, S.SYS, { vatRegistered: false });
  const L = async (code: string) => (await prisma.accountLedger.findFirstOrThrow({ where: { systemId: S.SYS, code }, select: { id: true } })).id as string;
  const [ent, fine, capL, other] = [await L("6930"), await L("6985"), await L("3000"), await L("6900")];
  await GL.postManualJV(S.ctx, { date: new Date("2026-01-05T10:00:00+07:00"), memo: "ทุนจดทะเบียนชำระแล้ว", book: "GENERAL", postedById: S.owner.id, lines: [{ accountId: S.bank.ledgerAccountId, debit: 100_000_000, credit: 0 }, { accountId: capL, debit: 0, credit: 100_000_000 }] });
  await invoice(S, S.cust.id, "2026-03-02", 200_000_000);
  const spend = async (accountId: string, amounts: number[], ymd: string, key: string) => {
    const e = await exp.createExpenseDoc({ tenantId: S.tid, systemId: S.SYS, docType: "EXPENSE", contactId: S.vJur.id, issueDate: new Date(`${ymd}T10:00:00+07:00`), vatMode: "NONE", lines: amounts.map((a, i) => ({ description: `${key} ${i + 1}`, qty: 1, unitPrice: a, vatRateBp: 0, accountId })), createdById: S.owner.id });
    const r = await exp.issueExpenseDoc(S.tid, S.SYS, e.id);
    if (!r.ok) throw new Error(`${key}: ${r.reason}`);
    return e.id as string;
  };
  await spend(ent, [150_000, 150_000, 150_000, 150_000], "2026-04-10", "เลี้ยงรับรองลูกค้า");
  const giftDoc = await spend(ent, [300_000], "2026-05-10", "ของขวัญปีใหม่");
  await spend(fine, [120_000], "2026-06-10", "เงินเพิ่มภาษี");
  const r = await AB.taxAddBackReport(S.ctx, { asOf: "2026-12-31" });
  const row = (code: string) => r.rows.find((x: Any) => x.code === code);
  eq("A1.1", "รอบ ม.ค.–ธ.ค. 2569 · ค่ารับรอง 9,000 (ค่าเริ่ม (4) เฉพาะส่วนเกิน) · ค่าปรับ 1,200 (ค่าเริ่ม (6) ทั้งจำนวน)", [r.from, r.to, [row("6930")?.section, row("6930")?.amount, row("6930")?.origin], [row("6985")?.section, row("6985")?.amount, row("6985")?.addBack]], ["2026-01-01", "2026-12-31", ["S65TRI_4", 900_000, "DEFAULT"], ["S65TRI_6", 120_000, 120_000]]);
  const e = r.entertainment;
  eq("A1.2", "เพดาน: รายได้ 2,000,000 × 0.3% = 6,000 > ทุน 1,000,000 × 0.3% = 3,000 → เพดาน 6,000 · ส่วนเกิน 3,000 = บวกกลับ", [e.revenue, e.capital, e.capitalSource, e.cap, e.baseLabel, e.excess, row("6930")?.addBack], [200_000_000, 100_000_000, "LEDGER_3000", 600_000, "รายได้", 300_000, 300_000]);
  eq("A1.3", "ใบค่ารับรองยอดเกิน 2,000 ต่อบรรทัด = 1 ใบ (ของขวัญ 3,000) → ENTERTAINMENT_GIFT_CHECK", [e.giftLimit, e.giftDocs.map((g: Any) => [g.documentId === giftDoc, g.amount])], [200_000, [[true, 300_000]]]);
  eq("A1.4", "รวมบวกกลับ 4,200 · คำเตือน: FLAGGED (2 บัญชี 10,200) · CAP_EXCEEDED · GIFT_CHECK [V]", [r.totals.addBack, r.warnings.map((w: Any) => [w.code, w.tag]), r.warnings[0].messageTh.includes("10,200.00")], [420_000, [["TAX_ADD_BACK_FLAGGED", "V"], ["ENTERTAINMENT_CAP_EXCEEDED", "V"], ["ENTERTAINMENT_GIFT_CHECK", "V"]], true]);
  chk("A1.5", "ไม่ใช้คำ \"ภาษีที่ต้องชำระ\"/\"กำไรสุทธิเพื่อเสียภาษี\" เป็นผลลัพธ์ · ไม่มีชื่อไฟล์ในข้อความ", r.warnings.every((w: Any) => !/ภาษีที่ต้องชำระ\b(?!หรือ)|กำไรสุทธิเพื่อเสียภาษี|references|\.md/.test(`${w.citation}`)) && r.warnings[0].messageTh.includes("ไม่ได้คำนวณกำไรสุทธิทางภาษีหรือภาษีที่ต้องชำระ"), true, r.warnings[0]);
  const r2 = await AB.taxAddBackReport(S.ctx, { asOf: "2026-12-31", paidUpCapital: 500_000_000 });
  eq("A2.1", "ทุนชำระแล้ว 5,000,000 (กรอกเอง) → เพดาน 15,000 จากทุน · ไม่เกิน · ไม่มี CAP_EXCEEDED", [r2.entertainment.cap, r2.entertainment.baseLabel, r2.entertainment.excess, r2.entertainment.capitalSource, r2.warnings.some((w: Any) => w.code === "ENTERTAINMENT_CAP_EXCEEDED")], [1_500_000, "ทุนชำระแล้ว", 0, "INPUT", false]);
  const s1 = await AB.setTaxAddBack(S.ctx, fine, "NONE");
  const s2 = await AB.setTaxAddBack(S.ctx, other, "S65TRI_13");
  const r3 = await AB.taxAddBackReport(S.ctx, { asOf: "2026-12-31" });
  eq("A3.1", "ร้านปลดธงค่าปรับ (NONE) → หายจากรายงาน อยู่ใน 'ยังไม่ติดธง' · ร้านติด (13) ที่ค่าใช้จ่ายอื่น → origin SHOP", [s1.ok, s1.effective, s2.ok, r3.rows.some((x: Any) => x.code === "6985"), r3.unflagged.some((x: Any) => x.code === "6985"), r3.rows.find((x: Any) => x.code === "6900")?.origin], [true, null, true, false, true, "SHOP"]);
  const s3 = await AB.setTaxAddBack(S.ctx, fine, null);
  const s4 = await AB.setTaxAddBack(S.ctx, fine, "S65TRI_99");
  eq("A3.2", "คืนค่าเริ่มต้น (null) → (6) อีกครั้ง · รหัสที่ไม่รู้จัก = ปฏิเสธ (ข้อมูลผิดรูป ไม่ใช่ด่านกฎหมาย)", [s3.ok, s3.effective, s4.ok], [true, "S65TRI_6", false]);
  await LV.saveBookTax(S.ownerActor, S.ctx, { entityKind: "INDIVIDUAL" }, "QC T5.5");
  const r4 = await AB.taxAddBackReport(S.ctx, { asOf: "2026-12-31" });
  chk("A4.1", "ร้านบุคคลธรรมดา: ข้อความบอกว่าใช้โดยอนุโลมเมื่อหักค่าใช้จ่ายตามจริง", r4.warnings[0].messageTh.includes("โดยอนุโลม"), true, r4.warnings[0]);
  const sv = await LV.saveBookTax(S.ownerActor, S.ctx, { bookRows: [{ id: "shop-ent", rule: "ENTERTAINMENT_CAP_RATE", value: 50, from: null, to: null, source: "ร้านทดสอบ", checkedAt: null }] }, "QC T5.5");
  const r5 = await AB.taxAddBackReport(S.ctx, { asOf: "2026-12-31" });
  eq("A4.2", "ร้านทับอัตราเพดาน 0.5% → เพดาน 10,000 ไม่เกิน (ระบบยอม + บันทึกได้ · คำเตือน SHOP_DIFFERS ตอนบันทึก)", [sv.ok, sv.warnings.map((w: Any) => w.code), r5.entertainment.cap, r5.entertainment.excess], [true, ["SHOP_DIFFERS_FROM_DEFAULT"], 1_000_000, 0]);
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T5.5 บวกกลับทางภาษี =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length ? 1 : 0);

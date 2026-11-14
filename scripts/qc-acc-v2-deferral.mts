// QC ACC T5.10 (I12 I5 J11) — รายได้รับล่วงหน้าทยอยรับรู้ · ชนิดเงินประกันต่อรายการ · ผู้ออกส่วนลดของแพลตฟอร์ม
// design note ledger/wo-notes/T5.10.md · ฟิกซ์เจอร์ของตัวเอง (ร้าน "QC T5.10 รับล่วงหน้า" สร้าง/ลบเอง · KEEP=1 = เก็บไว้)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-deferral.mts
//
// เฉลยมือ (สตางค์):
//   D1 ค่าสมาชิกรายปี 10,000.00 บาท (1,000,000) เริ่ม 2026-01 · 3 เดือน · รายได้ 4030 → รายได้รับล่วงหน้า 2110
//      ตาราง 333,333 · 333,333 · 333,334 · ตั้ง: Dr 4030 1,000,000 / Cr 2110 1,000,000 (ลง 2026-01)
//      รับรู้ถึง 2026-02 → 2 ใบ (333,333 ×2) · ซ้ำ = 0 ใบ · 2110 คงเหลือ 333,334 · 4030 สุทธิ เดบิต 333,334
//      รับรู้ถึง 2026-03 → 1 ใบ (333,334) · สถานะ DONE · 2110 = 0 · 4030 สุทธิ 0
//   D2 คอร์ส 1,200 บาท (120,000) เริ่ม 2026-01 · 12 เดือน · รับรู้ถึง 2026-01 (10,000) → ยกเลิก "คืนเงิน" ในโหมดเข้มของฐาน
//      → กลับรายการ 2 ใบ (ตั้ง + เดือน 1) · ไม่มีการแก้/ลบ JV เดิม · 2110/4030 ของ D2 สุทธิ 0 · สถานะ CANCELLED
//   ชนิดเงินประกัน: SERVICE_VAT + VAT 0 → DEPOSIT_SERVICE_VAT_EXPECTED · REAL_ESTATE + VAT 7% → DEPOSIT_REAL_ESTATE_EXEMPT · HOTEL_DAMAGE → [U] · NONE → ล้าง
//   ผู้ออกส่วนลด: เอกสารส่วนลด 100 บาท · PLATFORM → PLATFORM_DISCOUNT_FUNDER [U] · SHOP → ไม่มีคำเตือน · ไม่เปลี่ยนยอด/ฐานภาษี
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-deferral");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown) => {
  cks.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 600)}`}`);
};
const KEEP = process.env.KEEP === "1";
const FORBID = /references\/|\.md\b|\[(?:V2|V|S|U)\]|ถูกกฎหมาย/;
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const acc: Any = await import("@/lib/modules/account/service" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const DF: Any = await import("@/lib/modules/account/deferral" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);
const TENANT_NAME = "QC T5.10 รับล่วงหน้า";

async function purgeTenant(tenantId: string) {
  const rows: { table_name: string }[] = await prisma.$queryRaw`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`;
  let pending = rows.map((r) => r.table_name).filter((t) => t !== "TenantDeletionLog");
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
const modeNow = async () => (await prisma.$queryRawUnsafe(`SELECT public.account_ledger_guard_mode() AS m`))[0]?.m as string;
const setMode = (m: string) => prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION public.account_ledger_guard_mode() RETURNS text LANGUAGE sql STABLE AS $$ SELECT '${m}'::text $$`);

let tid = "";
try {
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } })) await purgeTenant(old.id);
  const stamp = Date.now().toString(36);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t510-${stamp}`, status: "ACTIVE", enabledModules: ["ACCOUNT"] } })).id;
  const SYS = (await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T5.10")).id;
  const ctx = { tenantId: tid, systemId: SYS };
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน T5.10", vatRegistered: true, vatRateBp: 700, taxId: "0105561000510", branchCode: "00000" });
  await gl.ensureAccounting(ctx);
  const net = async (code: string, refId?: string) => {
    const a = await prisma.accountJournalLine.aggregate({ where: { systemId: SYS, account: { code }, ...(refId ? { entry: { refId } } : {}) }, _sum: { debit: true, credit: true } });
    return (a._sum.credit ?? 0) - (a._sum.debit ?? 0);
  };

  // ═══ D0 ตารางรับรู้ (pure) ═══
  chk("D0.1", "ตาราง 1,000,000 / 3 = 333,333 · 333,333 · 333,334", JSON.stringify(DF.deferralSchedule(1_000_000, "2026-01", 3)) === JSON.stringify([{ month: "2026-01", amountSatang: 333_333 }, { month: "2026-02", amountSatang: 333_333 }, { month: "2026-03", amountSatang: 333_334 }]), "ตามนั้น", DF.deferralSchedule(1_000_000, "2026-01", 3));
  chk("D0.2", "ข้ามปี: เริ่ม 2026-11 · 3 เดือน → 2026-11 · 2026-12 · 2027-01", DF.deferralSchedule(300, "2026-11", 3).map((s: Any) => s.month).join() === "2026-11,2026-12,2027-01", "ข้ามปี", DF.deferralSchedule(300, "2026-11", 3));

  // ═══ D1 ตั้ง + รับรู้ ═══
  const bad1 = await DF.createDeferral(ctx, { description: "x", totalSatang: 100, startMonth: "2026-01", months: 0, incomeAccountCode: "4030" });
  const bad2 = await DF.createDeferral(ctx, { description: "x", totalSatang: 100, startMonth: "2026-01", months: 3, incomeAccountCode: "2110" });
  chk("D1.0", "จำนวนเดือน 0 / บัญชีรายได้ไม่ใช่รายได้ = ไม่ทำ (ข้อความไทย)", !bad1.ok && !bad2.ok && /เดือน/.test(bad1.reason) && /บัญชีรายได้/.test(bad2.reason), "fail", [bad1, bad2]);
  const d1 = await DF.createDeferral(ctx, { description: "ค่าสมาชิกรายปี ลูกค้า ก", totalSatang: 1_000_000, startMonth: "2026-01", months: 3, incomeAccountCode: "4030" });
  chk("D1.1", "ตั้งได้ + คำเตือนจุดรับผิดภาษีไม่เปลี่ยน [V]", d1.ok && d1.warnings.some((w: Any) => w.code === "DEFERRED_REVENUE_TAX_POINT" && w.tag === "V"), "ok", d1);
  const setup = await prisma.accountJournalEntry.findFirst({ where: { systemId: SYS, idempotencyKey: `AccountDeferral#${d1.id}#SETUP` }, include: { lines: { include: { account: { select: { code: true } } } } } });
  chk("D1.2", "JV ตั้ง: ลง 2026-01 · Dr 4030 1,000,000 / Cr 2110 1,000,000", setup?.periodKey === "2026-01" && setup.lines.some((l: Any) => l.account.code === "4030" && l.debit === 1_000_000) && setup.lines.some((l: Any) => l.account.code === "2110" && l.credit === 1_000_000), "ตามนั้น", setup?.lines.map((l: Any) => [l.account.code, l.debit, l.credit]));
  const r1 = await DF.recognizeDeferrals(ctx, "2026-02");
  const r1b = await DF.recognizeDeferrals(ctx, "2026-02");
  chk("D1.3", "รับรู้ถึง 2026-02 = 2 ใบ (333,333 ×2) · รันซ้ำ = 0 ใบ", r1.posted.length === 2 && r1.posted.every((p: Any) => p.amountSatang === 333_333) && r1b.posted.length === 0, "2/0", [r1.posted, r1b.posted]);
  chk("D1.4", "2110 คงเหลือ 333,334 · 4030 สุทธิ −333,334", (await net("2110", d1.id)) === 333_334 && (await net("4030", d1.id)) === -333_334, "333334", [await net("2110", d1.id), await net("4030", d1.id)]);
  let list = await DF.listDeferrals(ctx);
  let v1 = list.find((x: Any) => x.id === d1.id);
  chk("D1.5", "รายการ: รับรู้แล้ว 666,666 · คงเหลือ 333,334 · ลงแล้ว 2/3 เดือน · ACTIVE", v1?.recognizedSatang === 666_666 && v1?.remainingSatang === 333_334 && v1?.schedule.filter((s: Any) => s.posted).length === 2 && v1?.status === "ACTIVE", "666666/333334", v1);
  await DF.recognizeDeferrals(ctx, "2026-06");
  list = await DF.listDeferrals(ctx);
  v1 = list.find((x: Any) => x.id === d1.id);
  chk("D1.6", "รับรู้ครบ → DONE · 2110 = 0 · 4030 สุทธิ 0", v1?.status === "DONE" && v1?.remainingSatang === 0 && (await net("2110", d1.id)) === 0 && (await net("4030", d1.id)) === 0, "DONE/0", { st: v1?.status, r: v1?.remainingSatang });
  const mJv = await prisma.accountJournalEntry.findFirst({ where: { systemId: SYS, idempotencyKey: `AccountDeferral#${d1.id}#M:2026-03` }, select: { periodKey: true } });
  chk("D1.7", "JV เดือน 2026-03 ลงงวด 2026-03 (คีย์ AccountDeferral#<id>#M:2026-03)", mJv?.periodKey === "2026-03", "2026-03", mJv);

  // ═══ D2 ยกเลิก = กลับรายการ (โหมดเข้มของฐานชั่วคราว) ═══
  const d2 = await DF.createDeferral(ctx, { description: "คอร์สเรียน 12 เดือน", totalSatang: 120_000, startMonth: "2026-01", months: 12, incomeAccountCode: "4030" });
  await DF.recognizeDeferrals(ctx, "2026-01", { deferralId: d2.id });
  const noReason = await DF.cancelDeferral(ctx, d2.id, " ");
  chk("D2.0", "ยกเลิกไม่มีเหตุผล = ไม่ทำ", !noReason.ok && /เหตุผล/.test(noReason.reason), "fail", noReason);
  const before = await prisma.accountJournalEntry.findMany({ where: { systemId: SYS, refId: d2.id }, select: { id: true, memo: true, date: true }, orderBy: { id: "asc" } });
  const m0 = await modeNow();
  let c2: Any = null;
  try {
    await setMode("strict");
    c2 = await DF.cancelDeferral(ctx, d2.id, "ลูกค้าขอคืนเงิน");
  } finally {
    await setMode(m0);
  }
  chk("D2.1", "ยกเลิกในโหมดเข้ม: กลับรายการ 2 ใบ (ตั้ง + เดือน 1)", c2?.ok === true && c2.reversed === 2, 2, c2);
  const after = await prisma.accountJournalEntry.findMany({ where: { systemId: SYS, refId: d2.id, reversalOfId: null }, select: { id: true, memo: true, date: true, status: true }, orderBy: { id: "asc" } });
  chk("D2.2", "JV เดิมไม่ถูกแก้/ลบ (memo/วันที่เดิม · สถานะ REVERSED)", after.length === before.length && after.every((e: Any, i: number) => e.id === before[i].id && e.memo === before[i].memo && +e.date === +before[i].date && e.status === "REVERSED"), "เดิม", after);
  chk("D2.3", "2110/4030 ของ D2 สุทธิ 0 · สถานะ CANCELLED + เหตุผล", (await net("2110", d2.id)) === 0 && (await net("4030", d2.id)) === 0 && (await DF.listDeferrals(ctx)).find((x: Any) => x.id === d2.id)?.cancelReason === "ลูกค้าขอคืนเงิน", "0/CANCELLED", [await net("2110", d2.id), await net("4030", d2.id)]);
  const again = await DF.recognizeDeferrals(ctx, "2026-12", { deferralId: d2.id });
  chk("D2.4", "ตารางที่ยกเลิกแล้วไม่รับรู้ต่อ · ยกเลิกซ้ำ = ไม่ทำ", again.posted.length === 0 && !(await DF.cancelDeferral(ctx, d2.id, "ซ้ำ")).ok, 0, again);
  chk("D2.5", "โหมดฐานกลับเป็นค่าเดิม", (await modeNow()) === m0, m0, await modeNow());

  // ═══ D3 ชนิดเงินประกันต่อรายการ (I5) ═══
  const p0 = await prisma.accountProduct.create({ data: { tenantId: tid, systemId: SYS, name: "คีย์การ์ด", type: "SERVICE", vatRateBp: 0 } });
  const p7 = await prisma.accountProduct.create({ data: { tenantId: tid, systemId: SYS, name: "เงินประกันห้อง", type: "SERVICE", vatRateBp: 700 } });
  const k1 = await DF.setProductDepositKind(ctx, p0.id, "SERVICE_VAT");
  const k2 = await DF.setProductDepositKind(ctx, p7.id, "REAL_ESTATE");
  const k3 = await DF.setProductDepositKind(ctx, p7.id, "HOTEL_DAMAGE");
  const k4 = await DF.setProductDepositKind(ctx, p7.id, "NONE");
  chk("D3.1", "SERVICE_VAT + VAT 0 → DEPOSIT_SERVICE_VAT_EXPECTED [V]", k1.ok && k1.warnings.map((w: Any) => w.code).join() === "DEPOSIT_SERVICE_VAT_EXPECTED" && k1.warnings[0].tag === "V", "1", k1);
  chk("D3.2", "REAL_ESTATE + VAT 7% → DEPOSIT_REAL_ESTATE_EXEMPT [V]", k2.ok && k2.warnings.map((w: Any) => w.code).join() === "DEPOSIT_REAL_ESTATE_EXEMPT", "1", k2);
  chk("D3.3", "HOTEL_DAMAGE → [U] พร้อม 'โปรดตรวจกับนักบัญชีของร้าน'", k3.ok && k3.warnings[0]?.code === "DEPOSIT_HOTEL_DAMAGE_REVIEW" && k3.warnings[0].tag === "U" && /โปรดตรวจกับนักบัญชีของร้าน/.test(k3.warnings[0].messageTh), "U", k3);
  chk("D3.4", "NONE → ล้างค่า (null) · ค่าที่บันทึก SERVICE_VAT ของคีย์การ์ด", k4.ok && (await prisma.accountProduct.findUnique({ where: { id: p7.id } })).depositKind === null && (await prisma.accountProduct.findUnique({ where: { id: p0.id } })).depositKind === "SERVICE_VAT", "null", "อื่น");
  chk("D3.5", "ชนิดไม่รู้จัก / สินค้าไม่มี = ไม่ทำ", !(await DF.setProductDepositKind(ctx, p0.id, "WHAT")).ok && !(await DF.setProductDepositKind(ctx, "nope", "NONE")).ok, "fail", "ok");

  // ═══ D4 ผู้ออกส่วนลด (J11) ═══
  const cust = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "PERSON", name: "ลูกค้าแพลตฟอร์ม" });
  const doc = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "INVOICE", contactId: cust.id, issueDate: new Date(), vatMode: "EXCLUDE", discountAmount: 10_000, lines: [{ description: "อาหาร", qty: 1, unitPrice: 100_000, vatRateBp: 700 }] });
  const before4 = await prisma.accountDocument.findUnique({ where: { id: doc.id }, select: { grandTotal: true, vatAmount: true } });
  const f1 = await DF.setDiscountFunder(ctx, doc.id, "PLATFORM");
  const after4 = await prisma.accountDocument.findUnique({ where: { id: doc.id }, select: { grandTotal: true, vatAmount: true, discountFundedBy: true } });
  chk("D4.1", "PLATFORM → PLATFORM_DISCOUNT_FUNDER [U] · บันทึกช่อง · ยอด/ภาษีไม่เปลี่ยน", f1.ok && f1.warnings[0]?.code === "PLATFORM_DISCOUNT_FUNDER" && f1.warnings[0].tag === "U" && after4.discountFundedBy === "PLATFORM" && after4.grandTotal === before4.grandTotal && after4.vatAmount === before4.vatAmount, "U", { f1, before4, after4 });
  const f2 = await DF.setDiscountFunder(ctx, doc.id, "SHOP");
  chk("D4.2", "SHOP → ไม่มีคำเตือน · null ล้างได้", f2.ok && f2.warnings.length === 0 && (await DF.setDiscountFunder(ctx, doc.id, null)).ok, 0, f2);

  const codes = ["DEFERRED_REVENUE_TAX_POINT", "DEPOSIT_SERVICE_VAT_EXPECTED", "DEPOSIT_REAL_ESTATE_EXEMPT", "DEPOSIT_HOTEL_DAMAGE_REVIEW", "PLATFORM_DISCOUNT_FUNDER"];
  const ws = codes.map((c) => W.legalWarning(c, { funder: "แพลตฟอร์มออก" }));
  chk("D5.1", "5 รหัสใหม่: lawTh ไม่ว่าง · ไม่มี path/ป้าย/คำว่าถูกกฎหมาย", ws.every((w: Any) => w.lawTh && !FORBID.test(`${w.messageTh} ${w.lawTh}`)), "ครบ", ws.map((w: Any) => [w.code, w.lawTh]));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
} finally {
  if (tid && !KEEP) await purgeTenant(tid).catch(() => undefined);
  await prisma.$disconnect();
}
const failed = cks.filter((c) => !c.ok);
console.log(`\nJSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - failed.length, findings: failed.map((f) => f.id) })}`);
process.exit(failed.length ? 1 : 0);

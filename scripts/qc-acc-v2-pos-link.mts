// QC ACC T4.7 — POS ↔ บัญชี: บิลที่ยังไม่ลง + กระทบยอดรายวัน · เงินขาด/เกินปิดกะลง GL · ทิป 3 ทาง · คำเตือนเครื่องบันทึกการเก็บเงิน
// ใบงาน ledger/ACCOUNT-TAX-PLAN.md T4.7 (ปิด J8 J7 J6 J2) · design note ledger/wo-notes/T4.7.md
// ฟิกซ์เจอร์ของตัวเอง (ร้าน "QC T4.7 POS" · จุดขาย + สมุด + บิล/กะสร้างตรง · JV ขายผ่าน applyExternalSale ของจริง) · KEEP=1 = เก็บไว้
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-pos-link.mts
//
// เฉลยมือ (สตางค์ · วันเดียวกัน · VAT 7% รวมในราคา):
//   B1 ยอด 10,700 เงินสด · ทิป 0 (ทิปค่าเริ่ม LIABILITY)          → JV Dr เงินสด 10,700
//   B2 ยอด 21,400 + ทิป 1,070 เงินสด 22,470 (LIABILITY)          → Dr เงินสด 22,470 · Cr บัญชีพักทิป 1,070
//   B3 ยอด 10,700 + ทิป 1,070 โอน 11,770 (REVENUE_VAT)            → Cr รายได้ทิป 1,000 + ภาษีขายของทิป 70 · Dr ธนาคาร 11,770
//   B4 ยอด 10,700 + ทิป 500 เงินสด 11,200 (STAFF_DIRECT)           → Dr เงินสด 10,700 (ทิปเงินสดไม่ผ่านบัญชีร้าน) · ไม่มีขาทิป
//   B5 ยอด 5,350 — ไม่ลงบัญชี
//   กระทบยอด: POS = 10,700 + 22,470 + 11,770 + 11,200 + 5,350 = 61,490 · บัญชี = 10,700 + 22,470 + 11,770 + 10,700 = 55,640
//             บิลยังไม่ลง 1 (5,350) · ผลต่าง 5,850 (= บิลค้าง 5,350 + ทิปพนักงานรับตรง 500)
//   กะ: S1 ขาด −2,000 · S2 เกิน +500 · R3 (นับย้อนหลังของกะบังคับปิด) ขาด −300
//     → JV S1: Dr 6920 2,000 / Cr เงินสด · S2: Dr เงินสด 500 / Cr 4920 · R3: Dr 6920 300 / Cr เงินสด · กดซ้ำ = 0 ใบใหม่
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-pos-link");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 600)}`}`);
};
const KEEP = process.env.KEEP === "1";
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const acc: Any = await import("@/lib/modules/account/service" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const IDX: Any = await import("@/lib/modules/account/index" as string);
const PL: Any = await import("@/lib/modules/account/pos-link" as string);
const LV: Any = await import("@/lib/modules/account/legal-values" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);

const TENANT_NAME = "QC T4.7 POS";

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

// ═══ P0 ทะเบียน ═══
console.log("\n── P0 คำเตือน + ค่าตั้ง ──");
{
  const codes = ["POS_TIP_REVENUE_VAT", "POS_TIP_LIABILITY_REVIEW", "POS_TIP_STAFF_DIRECT", "POS_SHIFT_CASH_VARIANCE", "POS_CASH_REGISTER_APPROVAL", "POS_BILLS_NOT_POSTED"];
  const ws = codes.map((c) => W.legalWarning(c, { count: 1, amount: "1.00" }));
  chk("P0.1", "6 รหัสในทะเบียน · ไม่ต้องยืนยัน (แจ้งให้ทราบ)", ws.every((w: Any) => w.code && w.ack === false), "ครบ", ws.map((w: Any) => [w.code, w.ack]));
  chk("P0.2", "ป้าย: ทิปรายได้ [V] (ข้อความบอกว่าข้อหารือไม่ชี้ตรง) · ทิปหนี้สิน/ตรง · เงินขาดเกิน · เครื่องบันทึก = [U] · บิลค้าง [V]", ws[0].tag === "V" && /ไม่ได้ชี้ตรง/.test(ws[0].messageTh) && ws.slice(1, 5).every((w: Any) => w.tag === "U") && ws[5].tag === "V", "ตามนั้น", ws.map((w: Any) => w.tag));
  chk("P0.3", "ทุกข้อ [U] บอก 'โปรดตรวจกับนักบัญชีของร้าน' · ไม่มี 'ถูกกฎหมาย'", ws.every((w: Any) => (w.tag !== "U" || w.messageTh.includes(W.CHECK_WITH_ACCOUNTANT_TH)) && !/ถูกกฎหมาย/.test(w.messageTh)), "ครบ", "ขาด");
  chk("P0.4", "เครื่องบันทึกการเก็บเงิน อ้าง ม.86/6 + ภ.พ.06", /ม\.86\/6/.test(ws[4].lawTh ?? "") && /ภ\.พ\.06/.test(ws[4].messageTh), "มี", ws[4]);
}

let tid = "";
try {
  console.log("\n── P1 ฟิกซ์เจอร์ ──");
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } })) await purgeTenant(old.id);
  const stamp = Date.now().toString(36);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t47-${stamp}`, status: "ACTIVE", enabledModules: ["ACCOUNT", "POS"] } })).id;
  const owner = await prisma.user.create({ data: { email: `qc-t47-${stamp}@qc.local`, name: "แคชเชียร์ T4.7" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, name: "สาขา T4.7", type: "SHOP", slug: `qc-t47-shop-${stamp}` } });
  const SYS = (await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T4.7")).id;
  const POS = (await sysSvc.createSystem(tid, "POS", "จุดขาย T4.7")).id;
  const ctx = { tenantId: tid, systemId: SYS };
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน T4.7", vatRegistered: true, vatRateBp: 700, taxId: "0105561000017", branchCode: "00000" });
  await gl.ensureAccounting(ctx);
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: SYS, linkedKind: "POS", linkedId: POS } });
  const led = async (code: string) => (await prisma.accountLedger.findFirst({ where: { systemId: SYS, code }, select: { id: true } }))!.id;
  const tipLedger = await led("2120");
  await prisma.posDevice.create({ data: { tenantId: tid, unitId: unit.id, systemId: POS, name: "แท็บเล็ตหน้าร้าน", deviceCode: `qcdev${stamp}`, registeredByUserId: owner.id } });
  const now = new Date();
  const mkSale = (key: string, gross: number, tip: number) =>
    prisma.posSale.create({ data: { tenantId: tid, unitId: unit.id, systemId: POS, idempotencyKey: `qc-t47-${stamp}-${key}`, receiptNo: `QC47-${key}`, subtotalSatang: gross, grandTotalSatang: gross, vatSatang: Math.round((gross * 7) / 107), tipSatang: tip, paidAt: now } });
  const post = (sale: Any, gross: number, tip: number, ch: string) =>
    IDX.applyExternalSale({ tenantId: tid, sourceSystemId: POS, refId: sale.id, occurredAt: now, grossSatang: gross, payMethods: [{ channel: ch, amountSatang: gross + tip }], ...(tip ? { tip: { satang: tip, ledgerId: tipLedger } } : {}) });
  const actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: owner.id };
  const jvOf = (sale: Any) => prisma.accountJournalEntry.findFirst({ where: { systemId: SYS, idempotencyKey: `PosSale#${sale.id}#PAID` }, include: { lines: { include: { account: { select: { code: true } } } } } });
  const sumBy = (jv: Any, code: string, side: "debit" | "credit") => (jv?.lines ?? []).filter((l: Any) => l.account.code === code).reduce((n: number, l: Any) => n + l[side], 0);

  // ═══ P2 ทิป 3 ทาง ═══
  console.log("\n── P2 ทิป 3 ทาง ──");
  const legal0 = await LV.loadBookLegal(ctx);
  chk("P2.0", "ค่าเริ่ม = LIABILITY (ทางเดิม)", legal0.tipTreatment === "LIABILITY", "LIABILITY", legal0.tipTreatment);
  const b1 = await mkSale("B1", 10_700, 0);
  const b2 = await mkSale("B2", 21_400, 1_070);
  await post(b1, 10_700, 0, "CASH");
  await post(b2, 21_400, 1_070, "CASH");
  const j2 = await jvOf(b2);
  chk("P2.1", "B2 (LIABILITY): Dr เงินสด 22,470 · Cr บัญชีพักทิป 1,070 · VAT 1,400", sumBy(j2, "1000", "debit") === 22_470 && sumBy(j2, "2120", "credit") === 1_070 && sumBy(j2, "2200", "credit") === 1_400, "22470/1070/1400", j2?.lines.map((l: Any) => [l.account.code, l.debit, l.credit]));
  const s3 = await LV.saveBookTax(actor, ctx, { tipTreatment: "REVENUE_VAT" });
  chk("P2.2", "เปลี่ยนเป็น REVENUE_VAT: บันทึกได้ + คำเตือน POS_TIP_REVENUE_VAT", s3.ok && s3.warnings.some((w: Any) => w.code === "POS_TIP_REVENUE_VAT"), "ok + เตือน", s3);
  const b3 = await mkSale("B3", 10_700, 1_070);
  await post(b3, 10_700, 1_070, "TRANSFER");
  const j3 = await jvOf(b3);
  chk("P2.3", "B3 (REVENUE_VAT): Dr ธนาคาร 11,770 · Cr 4040 1,000 · ภาษีขาย 700 + 70 = 770 · ไม่มีบัญชีพักทิป", sumBy(j3, "1010", "debit") === 11_770 && sumBy(j3, "4040", "credit") === 1_000 && sumBy(j3, "2200", "credit") === 770 && sumBy(j3, "2120", "credit") === 0, "11770/1000/770/0", j3?.lines.map((l: Any) => [l.account.code, l.debit, l.credit]));
  const s4 = await LV.saveBookTax(actor, ctx, { tipTreatment: "STAFF_DIRECT" });
  chk("P2.4", "เปลี่ยนเป็น STAFF_DIRECT: คำเตือน POS_TIP_STAFF_DIRECT [U]", s4.ok && s4.warnings.some((w: Any) => w.code === "POS_TIP_STAFF_DIRECT"), "เตือน", s4.warnings);
  const b4 = await mkSale("B4", 10_700, 500);
  await post(b4, 10_700, 500, "CASH");
  const j4 = await jvOf(b4);
  chk("P2.5", "B4 (STAFF_DIRECT): Dr เงินสด 10,700 · ไม่มีขาทิป · VAT 700", sumBy(j4, "1000", "debit") === 10_700 && sumBy(j4, "2120", "credit") === 0 && sumBy(j4, "4040", "credit") === 0 && sumBy(j4, "2200", "credit") === 700, "10700/0/0/700", j4?.lines.map((l: Any) => [l.account.code, l.debit, l.credit]));
  const bal = (jv: Any) => (jv?.lines ?? []).reduce((n: number, l: Any) => n + l.debit - l.credit, 0);
  chk("P2.6", "ทุก JV สมดุล", [j2, j3, j4].every((j) => j && bal(j) === 0), 0, [j2, j3, j4].map(bal));
  await LV.saveBookTax(actor, ctx, { tipTreatment: "LIABILITY" });
  const b5 = await mkSale("B5", 5_350, 0);

  // ═══ P3 บิลที่ยังไม่ลง + กระทบยอดรายวัน ═══
  console.log("\n── P3 บิลค้าง + กระทบยอด ──");
  const range = { from: new Date(now.getTime() - 86_400_000), to: new Date(now.getTime() + 86_400_000) };
  const un = await PL.posUnpostedBills(ctx, range, now);
  chk("P3.1", "บิลยังไม่ลง 1 บิล = B5 5,350", un.count === 1 && un.bills[0]?.saleId === b5.id && un.totalSatang === 5_350 && un.bills[0]?.ageDays === 0, "B5", un.bills.map((b: Any) => [b.receiptNo, b.grossSatang]));
  const rec = await PL.posDailyRecon(ctx, range);
  chk("P3.2", "กระทบยอด: POS 61,490 · บัญชี 55,640 · ค้าง 1 (5,350) · ผลต่าง 5,850", rec.totals.posReceivedSatang === 61_490 && rec.totals.glDebitSatang === 55_640 && rec.totals.unpostedBills === 1 && rec.totals.unpostedSatang === 5_350 && rec.totals.differenceSatang === 5_850 && rec.totals.bills === 5 && rec.totals.postedBills === 4, { pos: 61_490, gl: 55_640, diff: 5_850 }, rec.totals);
  const ws = await PL.posLinkWarnings(ctx, { unposted: un, variances: 3 });
  const wc = ws.map((w: Any) => w.code);
  chk("P3.3", "คำเตือน: เครื่องบันทึก (ระบุชื่อเครื่องที่ไม่มีเลขรหัส) · ทิปหนี้สิน · บิลค้าง · เงินขาดเกิน", wc.includes("POS_CASH_REGISTER_APPROVAL") && ws.find((w: Any) => w.code === "POS_CASH_REGISTER_APPROVAL")?.messageTh.includes("แท็บเล็ตหน้าร้าน") && wc.includes("POS_TIP_LIABILITY_REVIEW") && wc.includes("POS_BILLS_NOT_POSTED") && wc.includes("POS_SHIFT_CASH_VARIANCE"), "4 รหัส", wc);
  await prisma.posDevice.updateMany({ where: { tenantId: tid }, data: { posRegNo: "E061234567890" } });
  const ws2 = await PL.posLinkWarnings(ctx, {});
  chk("P3.4", "ทุกเครื่องมีเลขรหัสแล้ว: ยังเตือนเรื่องขออนุมัติ (ไม่ระบุชื่อเครื่อง)", ws2.some((w: Any) => w.code === "POS_CASH_REGISTER_APPROVAL" && !w.messageTh.includes("แท็บเล็ตหน้าร้าน")), "เตือน", ws2.map((w: Any) => w.messageTh));
  await prisma.accountSystemLink.updateMany({ where: { tenantId: tid, systemId: SYS }, data: { enabled: false } });
  const off = await PL.posUnpostedBills(ctx, range, now);
  chk("P3.5", "ตัดการเชื่อม = ไม่นับจุดขายนั้น", off.count === 0 && off.posSystems.length === 0, 0, off.count);
  await prisma.accountSystemLink.updateMany({ where: { tenantId: tid, systemId: SYS }, data: { enabled: true } });

  // ═══ P4 เงินขาด/เกินปิดกะ ═══
  console.log("\n── P4 เงินขาด/เกิน ──");
  const shift = (no: number, status: string, exp_: number, cnt: number | null) =>
    prisma.posShift.create({ data: { tenantId: tid, unitId: unit.id, systemId: POS, deviceId: `qcdev${stamp}`, shiftNo: no, openedByUserId: owner.id, floatSatang: 0, status, closedByUserId: owner.id, closedAt: now, expectedCashSatang: exp_, countedCashSatang: cnt, overShortSatang: cnt === null ? null : cnt - exp_, zNumber: no, closeNote: `กะ ${no}` } });
  const s1 = await shift(1, "CLOSED", 100_000, 98_000);
  const s2 = await shift(2, "CLOSED", 50_000, 50_500);
  const s3x = await shift(3, "FORCE_CLOSED", 30_000, null);
  await prisma.posShiftRecount.create({ data: { tenantId: tid, unitId: unit.id, systemId: POS, shiftId: s3x.id, zNumber: 3, expectedCashSatang: 30_000, countedCashSatang: 29_700, varianceSatang: -300, note: "นับย้อนหลัง", recountedByUserId: owner.id, idempotencyKey: `qc-t47-${stamp}-rc` } });
  await shift(4, "CLOSED", 10_000, 10_000); // ไม่มีผลต่าง — ไม่ขึ้นรายการ
  const vs = await PL.posShiftVariances(ctx, range);
  chk("P4.1", "รายการผลต่าง 3 (S1 −2,000 · S2 +500 · R3 −300) ยังไม่ลง · ผู้นับ", vs.length === 3 && vs.map((v: Any) => v.varianceSatang).sort((a: number, b: number) => a - b).join() === "-2000,-300,500" && vs.every((v: Any) => !v.posted && v.countedByName === "แคชเชียร์ T4.7"), "-2000,-300,500", vs.map((v: Any) => [v.refType, v.varianceSatang, v.posted]));
  const p1 = await PL.postPosShiftVariances(ctx, range, { userId: owner.id });
  chk("P4.2", "ลงบัญชี 3 ใบ ไม่ล้ม", p1.posted.length === 3 && p1.failed.length === 0, 3, p1);
  const vj = await prisma.accountJournalEntry.findMany({ where: { systemId: SYS, refType: { in: ["PosShift", "PosShiftRecount"] } }, include: { lines: { include: { account: { select: { code: true } } } } } });
  const sum = (code: string, side: "debit" | "credit") => vj.flatMap((j: Any) => j.lines).filter((l: Any) => l.account.code === code).reduce((n: number, l: Any) => n + l[side], 0);
  chk("P4.3", "เงินขาด 6920 Dr 2,300 · เงินเกิน 4920 Cr 500 · เงินสด Dr 500 / Cr 2,300 · 1 กะ = 1 ใบ", vj.length === 3 && sum("6920", "debit") === 2_300 && sum("4920", "credit") === 500 && sum("1000", "debit") === 500 && sum("1000", "credit") === 2_300, "2300/500", vj.map((j: Any) => j.lines.map((l: Any) => [l.account.code, l.debit, l.credit])));
  chk("P4.4", "คำอธิบายใบสำคัญ: จุดขาย · Z · ผู้นับ · หมายเหตุ", vj.some((j: Any) => /เงินขาดปิดกะ จุดขาย T4\.7 Z1 .*แคชเชียร์ T4\.7 · กะ 1/.test(j.memo ?? "")), "มี", vj.map((j: Any) => j.memo));
  const p2 = await PL.postPosShiftVariances(ctx, range, { userId: owner.id });
  chk("P4.5", "กดซ้ำ = 0 ใบใหม่ (idempotent)", p2.posted.length === 0 && (await prisma.accountJournalEntry.count({ where: { systemId: SYS, refType: { in: ["PosShift", "PosShiftRecount"] } } })) === 3, 0, p2);
  const vs2 = await PL.posShiftVariances(ctx, range);
  chk("P4.6", "รายการผลต่างแสดงเลขใบสำคัญที่ลงแล้ว", vs2.every((v: Any) => v.posted && v.entryNo), "ลงแล้วทุกกะ", vs2.map((v: Any) => [v.posted, v.entryNo]));
  void s1;
  void s2;
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
} finally {
  if (tid && !KEEP) await purgeTenant(tid).catch(() => undefined);
  await prisma.user.deleteMany({ where: { email: { startsWith: "qc-t47-" } } }).catch(() => undefined);
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T4.7 POS ↔ บัญชี =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);

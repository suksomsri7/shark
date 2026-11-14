// QC ACC T5.1 (เลน 2) — ปฏิทินภาษีของร้าน: แบบรายเดือน (T3.7 เดิม) + รายปี (ภ.ง.ด.50/51 · 90/94 · ยื่นงบ) ตามประเภทผู้ประกอบการ/สถานะ VAT
//   ค่าคาดหวังคำนวณมือจาก skill (domain-business-income-tax §ก2 §ข · domain-accounting-books §ก5) — ดู ledger/wo-notes/T5.1.md
//   ส่วน P = pure (taxCalendarFrom บน BookLegal ที่สร้างเอง) · ส่วน D = ร้านแยก "QC T5.1 ปฏิทิน" (ตัวเตือนรายวัน) ลบตอนจบ
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-tax-calendar.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-tax-calendar");

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
const TC: Any = await import("@/lib/modules/account/tax-calendar" as string);
const LV: Any = await import("@/lib/modules/account/legal-values" as string);
const TT: Any = await import("@/lib/core/settings/legal/th-tax-2569" as string);
const legal = (entityKind: string, deadline: Any[] = [], book: Any[] = []) => ({ ...LV.EMPTY_BOOK_LEGAL, entityKind, shop: { vat: [], wht: [], deadline, book } });
const at = (ymd: string) => new Date(`${ymd}T03:00:00Z`);
const view = (c: Any) => c.items.map((i: Any) => [i.form, i.periodKey, i.paper?.date ?? null, i.online?.date ?? null]);

console.log("\n── P1 ตัวช่วยวันที่ ──");
eq("P1.1", "30 มิ.ย. + 3 เดือน (สิ้นเดือน) = 30 ก.ย. · 31 ธ.ค. + 2 = 28 ก.พ. · 15 ม.ค. + 1 = 15 ก.พ.", [TC.ymdAddMonthsEom("2026-06-30", 3), TC.ymdAddMonthsEom("2026-12-31", 2), TC.ymdAddMonthsEom("2026-01-15", 1)], ["2026-09-30", "2027-02-28", "2026-02-15"]);
eq("P1.2", "31 ธ.ค. 2025 + 150 วัน = 30 พ.ค. 2026 · 30 มิ.ย. 2026 + 150 วัน = 27 พ.ย. 2026", [TC.ymdAddDays("2025-12-31", 150), TC.ymdAddDays("2026-06-30", 150)], ["2026-05-30", "2026-11-27"]);
eq("P1.3", "ช่วงค่าตามแบบ: ภ.ง.ด.50 กระดาษ 150 ✓ · ภ.ง.ด.94 กระดาษ 13 เดือน ✗ · ภ.พ.30 วันที่ 32 ✗ · ออนไลน์รายปี 8 ✓", [TT.deadlineValueInRange("PND50", "PAPER", 150), TT.deadlineValueInRange("PND94", "PAPER", 13), TT.deadlineValueInRange("PP30", "PAPER", 32), TT.deadlineValueInRange("PND51", "ONLINE", 8)], [true, false, false, true]);

console.log("\n── P2 บริษัท จด VAT · รอบ ม.ค.–ธ.ค. · วันนี้ 14 พ.ย. 2569 ──");
{
  const c = TC.taxCalendarFrom(legal("COMPANY"), { today: at("2026-11-14"), vatRegistered: true, fiscalStartMonth: 1 });
  eq("P2.1", "รายเดือน: ภ.ง.ด.1/2/3/53/54 เดือน ต.ค. (กระดาษ 7 พ.ย. ผ่านแล้ว · ออนไลน์ 15 พ.ย.) · ภ.พ.30 ต.ค. (15 / 23 พ.ย.)",
    view(c).filter((r: Any) => !r[1].includes(":")),
    [["PND1", "2026-10", "2026-11-07", "2026-11-15"], ["PND2", "2026-10", "2026-11-07", "2026-11-15"], ["PND3", "2026-10", "2026-11-07", "2026-11-15"], ["PND53", "2026-10", "2026-11-07", "2026-11-15"], ["PND54", "2026-10", "2026-11-07", "2026-11-15"], ["PP30", "2026-10", "2026-11-15", "2026-11-23"]]);
  eq("P2.2", "ภ.ง.ด.50 รอบ 2568 (30 พ.ค./7 มิ.ย. 2569) ผ่านแล้ว → รอบ 2569: 31 ธ.ค. 2569 + 150 วัน = 30 พ.ค. 2570 · ออนไลน์ไม่มี (นอกช่วงประกาศถึง 31 ม.ค. 2570)", view(c).find((r: Any) => r[0] === "PND50"), ["PND50", "FY:2026-12-31", "2027-05-30", null]);
  eq("P2.3", "ภ.ง.ด.51 ครึ่งรอบ 2569 (31 ส.ค./8 ก.ย.) ผ่านแล้ว → ครึ่งรอบ 2570: 30 มิ.ย. 2570 + 2 เดือน = 31 ส.ค. 2570", view(c).find((r: Any) => r[0] === "PND51"), ["PND51", "HFY:2027-06-30", "2027-08-31", null]);
  const fs = c.items.find((i: Any) => i.form === "FS_COMPANY");
  eq("P2.4", "บริษัทยื่นงบ: ไม่มีวันที่ (นับจากวันประชุมใหญ่) · ข้อความจากตาราง · รอบที่สิ้นสุดล่าสุด 31 ธ.ค. 2568", [fs?.paper, fs?.whenTh, fs?.periodKey], [null, "ภายใน 1 เดือนนับแต่วันที่ประชุมใหญ่อนุมัติงบ", "FY:2025-12-31"]);
  eq("P2.5", "ไม่มี ภ.ง.ด.90/94 สำหรับนิติบุคคล · เรียงตามวันกระดาษ (ไม่มีวัน = ท้าย)", [c.items.some((i: Any) => i.form === "PND90" || i.form === "PND94"), c.items.map((i: Any) => i.form).slice(-3)], [false, ["PND50", "PND51", "FS_COMPANY"]]);
  eq("P2.6", "วันที่เหลือ ภ.พ.30 = 1 วัน · ภ.ง.ด.3 กระดาษเลย 7 วัน · เตือนรายปีล่วงหน้า 14 วัน (ค่าเริ่มต้นระบบ)", [c.items.find((i: Any) => i.form === "PP30").paper.daysLeft, c.items.find((i: Any) => i.form === "PND3").paper.daysLeft, c.remindDays], [1, -7, 14]);
}

console.log("\n── P3 บุคคลธรรมดา ไม่จด VAT ──");
{
  const c = TC.taxCalendarFrom(legal("INDIVIDUAL"), { today: at("2026-11-14"), vatRegistered: false, fiscalStartMonth: 1 });
  eq("P3.1", "ไม่มี ภ.พ.30 (ไม่จด VAT) · ไม่มี ภ.ง.ด.50/51/ยื่นงบ (T-ACC-26)", [c.items.some((i: Any) => i.form === "PP30"), c.items.some((i: Any) => ["PND50", "PND51", "FS_COMPANY", "FS_PARTNERSHIP"].includes(i.form))], [false, false]);
  eq("P3.2", "ภ.ง.ด.94 ปี 2569 (30 ก.ย./8 ต.ค.) ผ่านแล้ว → ปี 2570: 30 ก.ย. 2570 ไม่มีออนไลน์", view(c).find((r: Any) => r[0] === "PND94"), ["PND94", "H:2027", "2027-09-30", null]);
  eq("P3.3", "ภ.ง.ด.90 ปีภาษี 2569: 31 มี.ค. 2570 · ไม่มีวันออนไลน์ (skill: ปีภาษี 2569 อยู่นอกช่วงประกาศ — ไม่เดา)", view(c).find((r: Any) => r[0] === "PND90"), ["PND90", "Y:2026", "2027-03-31", null]);
  const c2 = TC.taxCalendarFrom(legal("INDIVIDUAL"), { today: at("2026-08-01"), vatRegistered: false, fiscalStartMonth: 1 });
  eq("P3.4", "1 ส.ค. 2569: ภ.ง.ด.94 ปี 2569 = 30 ก.ย. 2569 · ออนไลน์ 8 ต.ค. 2569 (ในช่วงประกาศ)", view(c2).find((r: Any) => r[0] === "PND94"), ["PND94", "H:2026", "2026-09-30", "2026-10-08"]);
  const c3 = TC.taxCalendarFrom(legal("ORDINARY_PARTNERSHIP"), { today: at("2026-11-14"), vatRegistered: false, fiscalStartMonth: 1 });
  eq("P3.5", "ห้างสามัญ/คณะบุคคล = แบบบุคคลธรรมดา (90/94)", c3.items.filter((i: Any) => i.cadence === "ANNUAL").map((i: Any) => i.form).sort(), ["PND90", "PND94"]);
}

console.log("\n── P4 ห้างหุ้นส่วนนิติบุคคล รอบ ก.ค.–มิ.ย. ──");
{
  const c = TC.taxCalendarFrom(legal("JURISTIC_PARTNERSHIP"), { today: at("2026-11-14"), vatRegistered: true, fiscalStartMonth: 7 });
  eq("P4.1", "ภ.ง.ด.50 รอบสิ้น 30 มิ.ย. 2569: + 150 วัน = 27 พ.ย. 2569 · ออนไลน์ 5 ธ.ค. 2569", view(c).find((r: Any) => r[0] === "PND50"), ["PND50", "FY:2026-06-30", "2026-11-27", "2026-12-05"]);
  eq("P4.2", "ยื่นงบห้าง: 30 มิ.ย. 2569 + 5 เดือน = 30 พ.ย. 2569 (ไม่มีแถวออนไลน์)", view(c).find((r: Any) => r[0] === "FS_PARTNERSHIP"), ["FS_PARTNERSHIP", "FY:2026-06-30", "2026-11-30", null]);
  eq("P4.3", "ภ.ง.ด.51 ครึ่งรอบ ก.ค.–ธ.ค. 2569: 31 ธ.ค. 2569 + 2 เดือน = 28 ก.พ. 2570 · ออนไลน์ไม่มี (กำหนด 28 ก.พ. 2570 เลย 31 ม.ค. 2570)", view(c).find((r: Any) => r[0] === "PND51"), ["PND51", "HFY:2026-12-31", "2027-02-28", null]);
  eq("P4.4", "ห้างไม่มีแถวยื่นงบของบริษัท", c.items.some((i: Any) => i.form === "FS_COMPANY"), false);
}

console.log("\n── P5 ยังไม่ระบุประเภท · ร้านทับแถว ──");
{
  const c = TC.taxCalendarFrom(legal("UNSET"), { today: at("2026-11-14"), vatRegistered: true, fiscalStartMonth: 1 });
  eq("P5.1", "ยังไม่ระบุ: ไม่มีแบบรายปี + ENTITY_KIND_UNSET (ไม่เดา)", [c.items.some((i: Any) => i.cadence === "ANNUAL"), c.warnings.map((w: Any) => w.code)], [false, ["ENTITY_KIND_UNSET"]]);
  const shop = [{ id: "shop-pnd50", form: "PND50", channel: "PAPER", value: 160, from: null, to: null, source: "ร้านทดสอบ", tag: "SHOP", checkedAt: null }];
  const c2 = TC.taxCalendarFrom(legal("JURISTIC_PARTNERSHIP", shop), { today: at("2026-11-14"), vatRegistered: true, fiscalStartMonth: 7 });
  const i = c2.items.find((x: Any) => x.form === "PND50");
  eq("P5.2", "ร้านทับ ภ.ง.ด.50 = 160 วัน → 30 มิ.ย. 2569 + 160 = 7 ธ.ค. 2569 · ออนไลน์ +8 = 15 ธ.ค. · คำเตือน SHOP_DIFFERS_FROM_DEFAULT (ไม่บล็อก)", [i.paper.date, i.online.date, i.warnings.map((w: Any) => w.code)], ["2026-12-07", "2026-12-15", ["SHOP_DIFFERS_FROM_DEFAULT"]]);
  const w = TC.calendarDueWarning(c2.items.find((x: Any) => x.form === "FS_PARTNERSHIP"));
  eq("P5.3", "ข้อความเตือนรายปีจากทะเบียน TAX_CALENDAR_DUE [V] · อ้างอิงเป็นข้อความกฎหมายล้วน (ไม่มีชื่อไฟล์)", [w.code, w.tag, w.messageTh.includes("30 พ.ย. 2026"), /references|\.md|\[V\]/.test(`${w.messageTh} ${w.citation}`)], ["TAX_CALENDAR_DUE", "V", true, false]);
}

console.log("\n── D1 ตัวเตือนรายวัน (ร้านแยก) ──");
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T5.1 ปฏิทิน", "qc-t51-cal");
  tid = S.tid;
  prisma = S.prisma;
  const acc: Any = await import("@/lib/modules/account/service" as string);
  await prisma.accountSettings.updateMany({ where: { systemId: S.SYS }, data: { fiscalYearStartMonth: 7 } });
  const ek = await LV.saveBookTax(S.ownerActor, S.ctx, { entityKind: "JURISTIC_PARTNERSHIP" }, "QC T5.1");
  chk("D1.0", "ตั้งห้างหุ้นส่วนนิติบุคคล รอบ ก.ค.", ek.ok, true, ek);
  const cal = await TC.taxCalendar(S.ctx, at("2026-11-13"));
  eq("D1.1", "ตัวอ่านจากฐาน = ตัว pure: ภ.ง.ด.50 เหลือ 14 วัน (27 พ.ย.) · ยื่นงบห้างเหลือ 17 วัน", [cal.items.find((i: Any) => i.form === "PND50")?.paper?.daysLeft, cal.items.find((i: Any) => i.form === "FS_PARTNERSHIP")?.paper?.daysLeft], [14, 17]);
  const r1 = await acc.runAccountReminders(new Date("2026-11-13T03:00:00Z"), { tenantId: S.tid, systemId: S.SYS });
  eq("D1.2", "13 พ.ย.: TAX_CALENDAR_DUE = 1 (ภ.ง.ด.50 ถึงวันเตือนล่วงหน้า 14 วัน · งบห้างยังไม่ถึง)", r1.TAX_CALENDAR_DUE, 1);
  const n = await prisma.appNotification.findFirst({ where: { tenantId: S.tid, title: acc.REMINDER_TITLE.TAX_CALENDAR_DUE }, orderBy: { createdAt: "desc" }, select: { body: true } }).catch(() => null);
  chk("D1.3", "ข้อความแจ้งเตือนมีชื่อแบบ + วันที่จากตาราง", !!n && n.body.includes("ภ.ง.ด.50") && n.body.includes("27 พ.ย. 2026"), "ภ.ง.ด.50 … 27 พ.ย. 2026", n?.body);
  const r2 = await acc.runAccountReminders(new Date("2026-11-13T05:00:00Z"), { tenantId: S.tid, systemId: S.SYS });
  eq("D1.4", "รันซ้ำวันเดียวกัน = ไม่แจ้งซ้ำ", r2.TAX_CALENDAR_DUE, 0);
  const r3 = await acc.runAccountReminders(new Date("2026-11-10T03:00:00Z"), { tenantId: S.tid, systemId: S.SYS });
  eq("D1.5", "10 พ.ย. (5 วันก่อน ภ.พ.30 วันที่ 15) สมุดจด VAT: PP30_DUE = 1 (positive control)", r3.PP30_DUE, 1);
  await acc.saveSettings(S.tid, S.SYS, { vatRegistered: false });
  const r4 = await acc.runAccountReminders(new Date("2026-11-10T09:00:00Z"), { tenantId: S.tid, systemId: S.SYS });
  eq("D1.6", "สมุดไม่จด VAT: ไม่เตือน ภ.พ.30 (เดิมเตือนทุกสมุด)", r4.PP30_DUE, 0);
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T5.1 ปฏิทินภาษี =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length ? 1 : 0);

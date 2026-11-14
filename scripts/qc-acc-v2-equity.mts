// QC ACC T5.8 (D9) — งบแสดงการเปลี่ยนแปลงส่วนของเจ้าของ + ตัวเลขเปรียบเทียบงวดก่อนเป็นค่าเริ่ม
// design note ledger/wo-notes/T5.8.md · ฟิกซ์เจอร์ของตัวเอง (ร้าน "QC T5.8 ส่วนของเจ้าของ" สร้าง/ลบเอง · KEEP=1 = เก็บไว้)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-equity.mts
//
// เฉลยมือ (บาท · ปีบัญชี ม.ค.–ธ.ค.):
//   2025: 15 ม.ค. ทุน Dr ธนาคาร / Cr 3000 100,000 · 15 มิ.ย. รายได้ Dr ธนาคาร / Cr 4030 50,000 · 15 ก.ค. ค่าใช้จ่าย Dr 6900 / Cr ธนาคาร 20,000
//   2026: 15 ก.พ. เพิ่มทุน 30,000 · 15 มี.ค. ถอนใช้ Dr 3100 / Cr ธนาคาร 5,000 · 15 เม.ย. ปันผล Dr 3800 / Cr ธนาคาร 10,000 ·
//         15 พ.ค. รายได้ 40,000 · 15 มิ.ย. ค่าใช้จ่าย 15,000
//   งวดก่อน (2025-01..2025-12): ยกมา 0 · เพิ่มทุน 3000 100,000 · กำไร 30,000 · ปลายงวด 3000 100,000 + กำไรสะสม 30,000 = 130,000
//   งวดนี้ (2026-01..2026-12): ยกมา 3000 100,000 · กำไรสะสม 30,000 (=130,000) · เพิ่มทุน 30,000 · ถอนใช้ −5,000 · ปันผล −10,000 · กำไร 25,000
//                               ปลายงวด 3000 130,000 · 3100 −5,000 · กำไรสะสม 45,000 = 170,000 = ธนาคาร 170,000 = ส่วนของเจ้าของในงบฐานะ
//   ถึงเดือน 2026-04 (เทียบ 2025-01..2025-04): งวดนี้ กำไร 0 · ปันผล −10,000 · ปลายงวด 100,000+30,000−5,000+30,000−10,000 = 145,000 ·
//                                               งวดก่อน เพิ่มทุน 100,000 · กำไร 0 · ปลายงวด 100,000
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-equity");
import { readFileSync } from "node:fs";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown) => {
  cks.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 600)}`}`);
};
const KEEP = process.env.KEEP === "1";
const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const acc: Any = await import("@/lib/modules/account/service" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const EQ: Any = await import("@/lib/modules/account/equity-statement" as string);
const R: Any = await import("@/lib/modules/account/reports" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);
const TENANT_NAME = "QC T5.8 ส่วนของเจ้าของ";
const B = 100; // สตางค์ต่อบาท

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

let tid = "";
try {
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } })) await purgeTenant(old.id);
  const stamp = Date.now().toString(36);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t58-${stamp}`, status: "ACTIVE", enabledModules: ["ACCOUNT"] } })).id;
  const SYS = (await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T5.8")).id;
  const ctx = { tenantId: tid, systemId: SYS };
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน T5.8", vatRegistered: false, taxId: "0105561000058", branchCode: "00000" });
  await gl.ensureAccounting(ctx);
  const led = async (code: string) => (await prisma.accountLedger.findFirst({ where: { systemId: SYS, code }, select: { id: true } }))?.id as string;
  const [bank, cap, draw, ret, inc, exp] = await Promise.all(["1010", "3000", "3100", "3800", "4030", "6900"].map(led));
  chk("E0.1", "ผังมีบัญชี 1010 3000 3100 3800 4030 6900", [bank, cap, draw, ret, inc, exp].every(Boolean), "ครบ", [bank, cap, draw, ret, inc, exp]);
  const jv = (date: string, dr: string, cr: string, baht: number, memo: string) =>
    gl.postManualJV(ctx, { date: new Date(`${date}T12:00:00+07:00`), memo, lines: [{ accountId: dr, debit: baht * B, credit: 0 }, { accountId: cr, debit: 0, credit: baht * B }] });
  await jv("2025-01-15", bank, cap, 100_000, "ทุน");
  await jv("2025-06-15", bank, inc, 50_000, "รายได้ 2025");
  await jv("2025-07-15", exp, bank, 20_000, "ค่าใช้จ่าย 2025");
  await jv("2026-02-15", bank, cap, 30_000, "เพิ่มทุน");
  await jv("2026-03-15", draw, bank, 5_000, "ถอนใช้");
  await jv("2026-04-15", ret, bank, 10_000, "ปันผล");
  await jv("2026-05-15", bank, inc, 40_000, "รายได้ 2026");
  await jv("2026-06-15", exp, bank, 15_000, "ค่าใช้จ่าย 2026");

  const s = await EQ.equityStatement(ctx, "2026-12", { fiscalYearStartMonth: 1 });
  const col = (b: Any, kind: string, key: string) => b.rows.find((r: Any) => r.kind === kind)?.amounts[key] ?? 0;
  const tot = (b: Any, kind: string) => b.rows.find((r: Any) => r.kind === kind)?.total ?? NaN;
  chk("E1.1", "คอลัมน์ = 3000 · 3100 · กำไรสะสม (3800 ไม่เป็นคอลัมน์แยก)", s.columns.map((c: Any) => c.code ?? "RET").join() === "3000,3100,RET", "3000,3100,RET", s.columns.map((c: Any) => c.code ?? "RET"));
  chk("E1.2", "ป้ายร่างสำหรับผู้ทำบัญชี/ผู้สอบบัญชี", s.draftLabel === "ร่างสำหรับผู้ทำบัญชี/ผู้สอบบัญชี", "ร่าง…", s.draftLabel);
  const c = s.current;
  const p = s.prior;
  chk("E2.1", "งวดนี้ 2026-01..2026-12", c.from === "2026-01" && c.to === "2026-12", "2026-01..12", [c.from, c.to]);
  chk("E2.2", "ยกมา: 3000 100,000 · กำไรสะสม 30,000 · รวม 130,000", col(c, "OPENING", cap) === 100_000 * B && col(c, "OPENING", "__retained") === 30_000 * B && tot(c, "OPENING") === 130_000 * B, 130_000 * B, c.rows[0]);
  chk("E2.3", "เพิ่มทุน 3000 30,000", col(c, "CONTRIBUTION", cap) === 30_000 * B && tot(c, "CONTRIBUTION") === 30_000 * B, 30_000 * B, c.rows[1]);
  chk("E2.4", "ถอนใช้ 3100 −5,000", col(c, "WITHDRAWAL", draw) === -5_000 * B && tot(c, "WITHDRAWAL") === -5_000 * B, -5_000 * B, c.rows[2]);
  chk("E2.5", "ปันผล (3800) −10,000 ในคอลัมน์กำไรสะสม", col(c, "RETAINED_ADJ", "__retained") === -10_000 * B, -10_000 * B, c.rows[3]);
  chk("E2.6", "กำไรสุทธิ 25,000", col(c, "PROFIT", "__retained") === 25_000 * B, 25_000 * B, c.rows[4]);
  chk("E2.7", "ปลายงวด 3000 130,000 · 3100 −5,000 · กำไรสะสม 45,000 · รวม 170,000", col(c, "CLOSING", cap) === 130_000 * B && col(c, "CLOSING", draw) === -5_000 * B && col(c, "CLOSING", "__retained") === 45_000 * B && c.closingTotal === 170_000 * B, 170_000 * B, c.rows[5]);
  const bs = await R.balanceSheet(ctx, "2026-12", { fiscalYearEndMonth: 12 });
  chk("E2.8", "ปลายงวด = รวมส่วนของเจ้าของในงบฐานะ (170,000) · reconciled", c.reconciled && bs.totalEquity === 170_000 * B && c.bsTotalEquity === bs.totalEquity, true, { reconciled: c.reconciled, bs: bs.totalEquity });
  chk("E3.1", "งวดก่อน (ค่าเริ่มแสดง) 2025-01..2025-12", !!p && p.from === "2025-01" && p.to === "2025-12", "2025", p && [p.from, p.to]);
  chk("E3.2", "งวดก่อน: ยกมา 0 · เพิ่มทุน 100,000 · กำไร 30,000 · ปลายงวด 130,000", tot(p, "OPENING") === 0 && tot(p, "CONTRIBUTION") === 100_000 * B && tot(p, "PROFIT") === 30_000 * B && p.closingTotal === 130_000 * B && p.reconciled, 130_000 * B, p.rows);
  chk("E3.3", "ปลายงวดก่อน = ยกมางวดนี้", p.closingTotal === tot(c, "OPENING"), tot(c, "OPENING"), p.closingTotal);
  const s4 = await EQ.equityStatement(ctx, "2026-04", { fiscalYearStartMonth: 1 });
  chk("E4.1", "ถึง 2026-04: กำไร 0 · ปันผล −10,000 · ปลายงวด 145,000 · ตรงงบฐานะ", tot(s4.current, "PROFIT") === 0 && tot(s4.current, "RETAINED_ADJ") === -10_000 * B && s4.current.closingTotal === 145_000 * B && s4.current.reconciled, 145_000 * B, s4.current.rows);
  chk("E4.2", "ถึง 2026-04 เทียบ 2025-01..2025-04: เพิ่มทุน 100,000 · กำไร 0 · ปลายงวด 100,000", s4.prior.from === "2025-01" && s4.prior.to === "2025-04" && tot(s4.prior, "PROFIT") === 0 && s4.prior.closingTotal === 100_000 * B && s4.prior.reconciled, 100_000 * B, s4.prior.rows);
  const sOff = await EQ.equityStatement(ctx, "2026-12", { fiscalYearStartMonth: 1, compare: false });
  chk("E4.3", "compare=false → ไม่มีงวดก่อน", sOff.prior === null, null, sOff.prior);
  // ปีบัญชี เม.ย.–มี.ค.: to 2026-06 → งวด 2026-04..2026-06 · ยกมา = ทุกอย่างก่อน 2026-04 (ทุน 130,000 − ถอนใช้ 5,000 + กำไรสะสม 30,000 = 155,000)
  const sFy = await EQ.equityStatement(ctx, "2026-06", { fiscalYearStartMonth: 4 });
  chk("E5.1", "ปีบัญชี เม.ย.–มี.ค. ถึง 2026-06: งวด 2026-04..2026-06 · ยกมา 155,000 · ปันผล −10,000 · กำไร 25,000 · ปลายงวด 170,000", sFy.current.from === "2026-04" && tot(sFy.current, "OPENING") === 155_000 * B && tot(sFy.current, "RETAINED_ADJ") === -10_000 * B && tot(sFy.current, "PROFIT") === 25_000 * B && sFy.current.closingTotal === 170_000 * B && sFy.current.reconciled, 170_000 * B, sFy.current.rows.map((r: Any) => [r.kind, r.total]));
  const csv = EQ.equityStatementCsv(s);
  chk("E6.1", "CSV: หัว = งวด · รายการ · 3 คอลัมน์ · รวม · 12 แถว (2 งวด × 6)", csv.headers.length === 6 && csv.rows.length === 12 && csv.rows[11][5] === 170_000, 12, { h: csv.headers, n: csv.rows.length, last: csv.rows[11] });
  // ตัวเลขเปรียบเทียบเป็นค่าเริ่มของงบอื่น (แก้แบบเพิ่มเข้า)
  chk("E7.1", "งบกำไรขาดทุน: เทียบงวดก่อนเป็นค่าเริ่ม (cmp=0 ปิด)", /const compare = sp\.cmp !== "0"/.test(src("src/app/app/sys/[id]/account/reports/profit-loss/page.tsx")), "cmp !== 0", "อื่น");
  chk("E7.2", "งบฐานะ: เทียบเป็นค่าเริ่ม · งวดก่อน = สิ้นเดือนเดียวกันปีก่อน", /const compare = sp\.cmp !== "0"/.test(src("src/app/app/sys/[id]/account/reports/balance-sheet/page.tsx")) && /shiftPeriod\(asOf, sp\.cmp === "m" \? -1 : -12\)/.test(src("src/app/app/sys/[id]/account/reports/balance-sheet/page.tsx")), "ค่าเริ่ม", "อื่น");
  chk("E7.3", "แถบเครื่องมือ: ติ๊กออก = cmp=0", /cmp: e\.target\.checked \? "1" : "0"/.test(src("src/app/app/sys/[id]/account/reports/ReportToolbar.tsx")), "cmp=0", "อื่น");
  chk("E7.4", "จอ: ดัชนีรายงานมีงบเปลี่ยนแปลงส่วนของเจ้าของ · route อยู่ในทะเบียนสิทธิ์", /slug: "equity"/.test(src("src/app/app/sys/[id]/account/reports/page.tsx")) && /"reports\/equity\/page\.tsx": "account\.report\.view"/.test(src("src/lib/modules/account/guard.ts")), "มี", "ไม่มี");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
} finally {
  if (tid && !KEEP) await purgeTenant(tid).catch(() => undefined);
  await prisma.$disconnect();
}
const failed = cks.filter((c) => !c.ok);
console.log(`\nJSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - failed.length, findings: failed.map((f) => f.id) })}`);
process.exit(failed.length ? 1 : 0);

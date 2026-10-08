// seed-hr-qc.mts — seed ชุดข้อมูล QC ของ RUN "HR V2" (ใบ H0.4) — ลบร้าน `qc-hr-v2` ทิ้งแล้วสร้างใหม่ทั้งก้อน (idempotent)
//
// รัน (QC4 เท่านั้น):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/seed-hr-qc.mts
//
// 🔴 สัญญาชุดข้อมูลอยู่ที่ `scripts/hr-qc-env.mts` (HQC) ที่เดียว — ไฟล์นี้สร้างตาม HQC เท่านั้น ไม่มีตัวเลข/ชื่อ/วันที่ของตัวเอง
// 🔴 ลบเฉพาะร้าน slug `qc-hr-v2` ที่ชื่อตรง HQC.tenantName (ชื่อไม่ตรง = หยุด exit 4) · ไม่แตะร้าน QC ของสมาชิก/CRM/POS
//    ลำดับลบ = HR_DELETE_ORDER (ลูกก่อนแม่) → กวาดตารางอื่นที่มี tenantId (information_schema) → ถังจำกัดอัตราที่ key มี id ร้าน
//    → ผู้ใช้ QC ตามอีเมล (cascade session) → ร้าน · แล้วตรวจว่าเหลือ 0 แถวทุกตาราง
// 🔴 ข้อมูลเดินผ่าน service จริง (createEmployee · saveEmployeeProfile · setPin · setSchedule · grantStaffAccess · setSalaryProfile ·
//    requestAdjustment/decideAdjustment · createPayrollRun/approveRun(expect)/markPaid · requestLeave/decideLeave)
//    เขียนตรงแค่ 2 ที่: (ก) ผู้ใช้/สมาชิกภาพ (passwordless — แบบ seed-crm-qc/seed-member-qc) + ร้าน/สาขา
//                     (ข) `insertHistoricalClock` — ลงเวลาย้อนหลัง (clock() ใช้ now() ย้อนวันไม่ได้) · คำตัดสินคิดด้วย clockInDetail ตัวจริง
// 🔴 ไม่เรียก drainAll (คิว outbox ของ QC4 เป็นของทุกเลน) · ไม่พิมพ์ PIN/ช่องอ่อนไหว
// ผลลัพธ์: `scripts/hr-expected.json` (ห้าม commit) + `JSON_SUMMARY {"total","passed","findings","counts"}` · รัน ×2 ต้องได้ counts เท่ากัน

import { writeFileSync } from "node:fs";
import {
  HQC,
  HR_TABLES,
  HR_DELETE_ORDER,
  HQC_EMAILS,
  hqcDates,
  hqcEmployee,
  atBkk,
  addDays,
  thaiShort,
  loadHrQcEnv,
  makeChecker,
  bahtText,
  type HqcEmployee,
  type HqcUserKey,
} from "./hr-qc-env.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const SUITE = "seed-hr-qc";
await loadHrQcEnv(SUITE);
const ownerGuard = (await import("./qc-owner-guard.mjs")) as { assertMayReseed: (s: string) => void };
ownerGuard.assertMayReseed("seed-hr-qc.mts");

const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const sys = (await import("@/lib/modules/system/service" as string)) as Any;
const hr = (await import("@/lib/modules/hr/service" as string)) as Any;
const pay = (await import("@/lib/modules/hr/payroll" as string)) as Any;
const digest = (await import("@/lib/modules/hr/payroll-digest" as string)) as Any;
const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
const staff = (await import("@/lib/staff/service" as string)) as Any;

const q = makeChecker(SUITE);
const t0 = Date.now();
const D = hqcDates();
console.log(`📅 วันนี้ (เวลาไทย) ${D.today} · รอบที่จ่ายแล้ว ${D.paidRunPeriod} · เดือนนี้ ${D.thisMonth}`);

/** ตารางทั้งหมดที่มีคอลัมน์ tenantId (ของจริงในฐาน) */
async function tenantTables(): Promise<string[]> {
  const rows = (await P.$queryRaw`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name`) as { table_name: string }[];
  return rows.map((r) => r.table_name);
}
/** จำนวนแถวต่อตารางของร้านนี้ (เฉพาะตารางที่ > 0) — เรียงชื่อ */
async function countsOf(tenantId: string, tables: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) {
    const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tenantId)) as { n: number }[];
    if ((r[0]?.n ?? 0) > 0) out[t] = r[0]!.n;
  }
  return out;
}
/** ตัวนับของร้านอื่น (ต้องไม่เปลี่ยนจากการ seed) */
async function otherCounts(excludeTenantId: string | null) {
  const not = excludeTenantId ? { tenantId: { not: excludeTenantId } } : {};
  return {
    tenant: await P.tenant.count({ where: excludeTenantId ? { id: { not: excludeTenantId } } : {} }),
    hrEmployee: await P.hrEmployee.count({ where: not }),
    hrPayrollRun: await P.hrPayrollRun.count({ where: not }),
    customer: await P.customer.count({ where: not }),
    posSale: await P.posSale.count({ where: not }),
  };
}

/** หยุดกลางทาง (ไม่ใช่ข้อผิดพลาดของ seed) — โยนออกจาก try ให้ finally ปิดการเชื่อมต่อก่อน แล้วค่อยตั้ง exit code (FIX K) */
class SeedAbort extends Error {
  constructor(message: string, readonly code: number) {
    super(message);
  }
}

let exitCode = 1;
try {
  // ═══════════════════ 0. ตารางใน HR_TABLES มีจริง ═══════════════════
  const missing = Object.keys(HR_TABLES).filter((k) => typeof P[k]?.count !== "function");
  q.chk("T0", "HR_TABLES ทุกตัวเป็น delegate จริงของ Prisma", missing.length === 0, "0 ตัวที่ไม่มี", missing.join(", ") || "0", "CRITICAL");
  const tables = await tenantTables();

  // ═══════════════════ 1. ลบร้านเดิม ═══════════════════
  const old = (await P.tenant.findFirst({ where: { slug: HQC.tenantSlug }, select: { id: true, name: true } })) as { id: string; name: string } | null;
  if (old && old.name !== HQC.tenantName) {
    throw new SeedAbort(`🔴 ร้าน slug ${HQC.tenantSlug} มีชื่อ "${old.name}" ≠ "${HQC.tenantName}" — ไม่ใช่ร้าน QC ของ HR · ไม่ลบอะไร`, 4);
  }
  const before = await otherCounts(old?.id ?? null);
  if (old) {
    let n = 0;
    const errs: string[] = [];
    for (const m of HR_DELETE_ORDER) {
      if (typeof P[m]?.deleteMany !== "function") {
        errs.push(`${m}: ไม่มี delegate`);
        continue;
      }
      try {
        n += (await P[m].deleteMany({ where: { tenantId: old.id } })).count as number;
      } catch (e) {
        errs.push(`${m}: ${String((e as Error)?.message ?? e).split("\n")[0]!.slice(0, 80)}`);
      }
    }
    // กวาดตารางที่เหลือที่มี tenantId (ของที่ service สร้างตามมา เช่น ผังบัญชี) — วนจนไม่คืบหน้า (FK)
    let pending = tables;
    for (let pass = 0; pass < 12 && pending.length; pass++) {
      const still: string[] = [];
      for (const t of pending) {
        try {
          n += (await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, old.id)) as number;
        } catch {
          still.push(t);
        }
      }
      if (still.length === pending.length) break;
      pending = still;
    }
    n += (await P.chatRateBucket.deleteMany({ where: { key: { contains: old.id } } })).count as number;
    await P.user.deleteMany({ where: { email: { in: HQC_EMAILS } } }); // cascade → session · สมาชิกภาพของร้านนี้ถูกลบไปแล้ว
    await P.tenant.delete({ where: { id: old.id } });
    const left = await countsOf(old.id, tables);
    q.chk("D1", `ลบร้านเดิม ${old.id} (${n} แถว) — ไม่เหลือแถวที่มี tenantId นี้`, Object.keys(left).length === 0 && pending.length === 0, "0 ตาราง", `${JSON.stringify(left)} ค้าง FK ${pending.join(",") || "-"} · ${errs.join(" · ") || "ไม่มี error"}`, "CRITICAL");
  } else {
    await P.user.deleteMany({ where: { email: { in: HQC_EMAILS } } });
    q.chk("D1", "ยังไม่มีร้าน QC ของ HR — ข้ามการลบ", true, "-", "-");
  }
  q.chk("D2", "ไม่มีผู้ใช้ QC ค้าง (อีเมล HQC)", (await P.user.count({ where: { email: { in: HQC_EMAILS } } })) === 0, 0, await P.user.count({ where: { email: { in: HQC_EMAILS } } }));

  // ═══════════════════ 2. ร้าน + สาขา + ระบบ (HR + ACCOUNT · ไม่มี POS/BOOKING/CRM — X8) ═══════════════════
  const tenant = await P.tenant.create({ data: { name: HQC.tenantName, slug: HQC.tenantSlug, enabledModules: ["HR", "ACCOUNT"] } });
  const tenantId = tenant.id as string;
  const units: Record<string, string> = {};
  for (const [key, u] of Object.entries(HQC.units)) {
    units[key] = (await P.businessUnit.create({ data: { tenantId, type: u.type, name: u.name, slug: u.slug } })).id;
  }
  const hrSys = await sys.createSystem(tenantId, "HR", HQC.systems.HR.name);
  const accSys = await sys.createSystem(tenantId, "ACCOUNT", HQC.systems.ACCOUNT.name);
  for (const s of [hrSys, accSys]) for (const uid of Object.values(units)) await sys.linkUnit(tenantId, s.id, uid);
  await gl.ensureAccounting({ tenantId, systemId: accSys.id });
  const ctx = { tenantId, systemId: hrSys.id as string };
  console.log(`🏢 ร้าน "${HQC.tenantName}" ${tenantId} · HR ${hrSys.id} · บัญชี ${accSys.id}`);

  // ═══════════════════ 3. ผู้ใช้ 7 คน (6 บทบาทของ brief + payrollSelf) ═══════════════════
  const users: Record<string, { userId: string; membershipId: string }> = {};
  for (const [key, u] of Object.entries(HQC.users)) {
    const row = await P.user.create({ data: { email: u.email, name: u.name } });
    const m = await P.membership.create({ data: { userId: row.id, tenantId, role: u.role, unitAccess: ["*"], permissions: u.keys, acceptedAt: new Date() } });
    users[key] = { userId: row.id, membershipId: m.id };
  }
  const uid = (k: HqcUserKey) => users[k]!.userId;
  const ownerActor = { userId: uid("owner"), isOwner: true };

  // ═══════════════════ 4. พนักงาน 14 คน ═══════════════════
  const emp: Record<string, string> = {};
  /** ช่องอ่อนไหวของ HQC → ช่องของ saveEmployeeProfile (วันเกิดคิดจากวันนี้ — FIX G) */
  const sensitiveOf = ({ birthYearsAgo, ...rest }: NonNullable<HqcEmployee["sensitive"]>) => ({ ...rest, birthDate: D.yearsAgo(birthYearsAgo) });
  const noteText = (e: HqcEmployee): string | null =>
    e.note === "probationEnds+14" ? `ทดลองงานครบ ${thaiShort(addDays(D.today, 14))}` : e.note === "contractEndsEndOfThisMonth" ? `สัญญาพาร์ทไทม์ถึง ${thaiShort(D.endOfThisMonth)}` : null;
  for (const e of HQC.employees) {
    const { id } = await hr.createEmployee(ctx, { name: e.name, position: e.position });
    emp[e.key] = id;
    const r = await hr.saveEmployeeProfile(ctx, id, {
      code: e.code,
      nickname: e.name,
      department: e.department,
      employmentType: e.employmentType,
      startDate: D.startOf(e),
      ...(e.end === "lastDayOfMonthBeforePaidRun" ? { endDate: D.leaverEnd } : {}),
      ...(noteText(e) ? { note: noteText(e) } : {}),
      ...(e.sensitive ? sensitiveOf(e.sensitive) : {}),
    });
    if (!r?.ok) throw new Error(`saveEmployeeProfile ${e.key}: ${r?.reason}`);
    if (e.shift) {
      const s = HQC.shifts[e.shift];
      const sr = await hr.setSchedule(ctx, id, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, dayOff: false, ...s })));
      if (!sr?.ok) throw new Error(`setSchedule ${e.key}: ${sr?.reason}`);
    }
    if (e.pin) {
      const pr = await hr.setPin(ctx, id, e.pin);
      if (!pr?.ok) throw new Error(`setPin ${e.key}: ${pr?.reason}`);
    }
    if (!e.active) await hr.setEmployeeActive(ctx, id, false);
  }
  // ผูกบัญชีผู้ใช้ (ทางจริง grantStaffAccess · ผู้ทำ = เจ้าของ)
  for (const e of HQC.employees.filter((x) => x.linkedUser)) {
    const g = await staff.grantStaffAccess({ tenantId, actorUserId: uid("owner"), employeeId: emp[e.key], email: HQC.users[e.linkedUser!].email });
    if (!g?.ok) throw new Error(`grantStaffAccess ${e.key}: ${g?.reason}`);
  }
  const rows = await P.hrEmployee.findMany({ where: { tenantId }, select: { id: true, active: true, linkedUserId: true, startDate: true, endDate: true } });
  q.chk("E1", `พนักงาน ${HQC.employees.length} คน (9 จากภาพ + 5 กรณีขอบ)`, rows.length === HQC.employees.length, HQC.employees.length, rows.length, "CRITICAL");
  const byId = new Map(rows.map((r: Any) => [r.id, r]));
  const linkOk = HQC.employees.every((e) => (byId.get(emp[e.key]) as Any)?.linkedUserId === (e.linkedUser ? uid(e.linkedUser) : null));
  q.chk("E2", "ผูกบัญชีตรง HQC (น้ำฝน ↔ staff · ก้อย ↔ payrollSelf · ที่เหลือไม่ผูก)", linkOk, "ตรง", linkOk ? "ตรง" : "ไม่ตรง");
  const userKeyOf = (userId: string | null) => (userId ? (Object.keys(users).find((k) => users[k]!.userId === userId) ?? `?${userId}`) : null);
  const links = Object.fromEntries(
    HQC.employees.map((e) => [e.key, userKeyOf((byId.get(emp[e.key]) as Any)?.linkedUserId ?? null)] as const).filter(([, u]) => u !== null),
  ) as Record<string, string>;
  const linkedTo = (u: HqcUserKey) => Object.entries(links).filter(([, v]) => v === u).map(([k]) => k).join(",") || "-";
  q.chk(
    "E2b",
    "ผู้ดู 6 บทบาทของ brief ไม่ผูกพนักงาน (ยกเว้น staff ↔ น้ำฝน) · payrollSelf ↔ ก้อยคนเดียว",
    (["owner", "manager", "payroll", "kiosk", "member"] as HqcUserKey[]).every((u) => linkedTo(u) === "-") && linkedTo("staff") === "namfon" && linkedTo("payrollSelf") === "koy",
    "owner/manager/payroll/kiosk/member: - · staff: namfon · payrollSelf: koy",
    (Object.keys(HQC.users) as HqcUserKey[]).map((u) => `${u}: ${linkedTo(u)}`).join(" · "),
    "CRITICAL",
  );
  const fai = byId.get(emp.fai) as Any;
  q.chk("E3", "ผู้ลาออก: active=false · endDate = วันสุดท้ายของเดือนก่อนงวดที่จ่าย", fai?.active === false && fai?.endDate?.toISOString().slice(0, 10) === D.leaverEnd, `false · ${D.leaverEnd}`, `${fai?.active} · ${fai?.endDate?.toISOString().slice(0, 10)}`);
  const om = byId.get(emp.om) as Any;
  q.chk("E4", "ผู้เริ่มงานอนาคต: startDate = วันที่ 1 ของเดือนหน้า", om?.startDate?.toISOString().slice(0, 10) === D.futureStart, D.futureStart, om?.startDate?.toISOString().slice(0, 10));
  const kong = byId.get(emp.kong) as Any;
  q.chk("E5", "ทดลองงาน: startDate = วันที่ 1 ของเดือนนี้ (หลังงวดที่จ่ายเสมอ)", kong?.startDate?.toISOString().slice(0, 10) === D.probationStart, D.probationStart, kong?.startDate?.toISOString().slice(0, 10));
  // PIN อ่านผ่าน kioskRoster (hasPin) — สคริปต์นี้ไม่แตะคอลัมน์ PIN เอง (F16.5 หลัง H0.5)
  const roster = (await hr.kioskRoster(ctx)) as { id: string; hasPin: boolean }[];
  const hasPin = (k: string) => roster.find((x) => x.id === emp[k])?.hasPin ?? null;
  const pinWant = HQC.employees.filter((e) => e.active).map((e) => `${e.key}:${!!e.pin}`).join(",");
  const pinGot = HQC.employees.filter((e) => e.active).map((e) => `${e.key}:${hasPin(e.key)}`).join(",");
  q.chk("E6", "มี PIN ตรง HQC (ปุ้ยไม่มี · ที่เหลือที่ยังทำงานมี) — อ่าน hasPin ไม่พิมพ์ค่า", pinWant === pinGot && hasPin("pui") === false, pinWant, pinGot);

  // ═══════════════════ 5. โปรไฟล์เงินเดือน (รายเดือนทุกคน — payType/rate เป็นของ H1.1) ═══════════════════
  for (const e of HQC.employees) await pay.setSalaryProfile(ctx, { employeeId: emp[e.key], baseSalarySatang: e.baseSalarySatang, ssoEligible: true });
  q.chk("S1", "โปรไฟล์เงินเดือน 14 คน", (await P.hrSalaryProfile.count({ where: { tenantId } })) === HQC.employees.length, HQC.employees.length, await P.hrSalaryProfile.count({ where: { tenantId } }));

  // ═══════════════════ 6. รอบจ่ายเดือนที่แล้ว: 3 รายการอนุมัติแล้ว → สร้างรอบ → อนุมัติ (expect) → จ่าย ═══════════════════
  const adjIds: Record<string, string> = {};
  for (const a of HQC.payroll.approved as readonly Any[]) {
    const r = await pay.requestAdjustment(ctx, { employeeId: emp[a.employee], periodKey: D.paidRunPeriod, kind: a.kind, amountSatang: a.amountSatang, hours: a.hours, note: a.note, requestedById: uid("payroll") });
    if (!r?.ok) throw new Error(`requestAdjustment ${a.employee}: ${r?.reason}`);
    const d = await pay.decideAdjustment(ctx, r.id, "APPROVED", ownerActor);
    if (!d?.ok) throw new Error(`decideAdjustment ${a.employee}: ${d?.reason}`);
    adjIds[`${a.employee}:${a.kind}`] = r.id;
  }
  const excl = (await pay.runExclusions(ctx, D.paidRunPeriod)) as { employeeId: string; reason: string }[];
  const wantExcl = HQC.payroll.excluded.map((x) => `${emp[x.employee]}:${x.reason}`).sort();
  const gotExcl = excl.map((x) => `${x.employeeId}:${x.reason}`).sort();
  q.chk("P1", "H0.2 ตัดผู้ลาออก (ENDED_BEFORE) + ผู้เริ่มงานอนาคต/ผู้ทดลองงานเดือนนี้ (STARTS_AFTER) ออกจากรอบที่จ่าย — ครบและไม่เกิน", JSON.stringify(wantExcl) === JSON.stringify(gotExcl), HQC.payroll.excluded.map((x) => `${x.employee}:${x.reason}`).join(" · "), excl.map((x) => `${Object.keys(emp).find((k) => emp[k] === x.employeeId)}:${x.reason}`).join(" · "), "CRITICAL");
  const created = await pay.createPayrollRun(ctx, { periodKey: D.paidRunPeriod, payDate: atBkk(D.paidRunPayDate, 12 * 60) });
  const items = (await P.hrPayrollItem.findMany({ where: { tenantId, runId: created.id }, select: digest.PAYROLL_DIGEST_SELECT })) as Any[];
  const draft = await P.hrPayrollRun.findFirst({ where: { tenantId, id: created.id } });
  const expect = { totalNetSatang: draft.totalNetSatang, itemCount: items.length, totalGrossSatang: draft.totalGrossSatang, itemsDigest: digest.payrollItemsDigest(items) };
  const ap = await pay.approveRun(ctx, created.id, expect, ownerActor);
  q.chk("P2", "approveRun(expect = ยอด + itemsDigest) สำเร็จ", ap?.ok === true, "ok", `${ap?.ok} ${ap?.code ?? ""} ${ap?.note ?? ""}`, "CRITICAL");
  const mp = await pay.markPaid(ctx, created.id);
  q.chk("P3", "markPaid สำเร็จ", mp?.ok === true, "ok", `${mp?.ok} ${mp?.note ?? ""}`, "CRITICAL");
  const run = await P.hrPayrollRun.findFirst({ where: { tenantId, id: created.id } });
  q.chk("P4", `รอบ ${D.paidRunPeriod} = PAID · มี journalEntryId`, run?.status === "PAID" && !!run?.journalEntryId, "PAID · JV", `${run?.status} · ${run?.journalEntryId ? "JV" : "ไม่มี JV"}`, "CRITICAL");
  const jl = run?.journalEntryId ? ((await P.accountJournalLine.findMany({ where: { entryId: run.journalEntryId }, select: { debit: true, credit: true } })) as Any[]) : [];
  const dr = jl.reduce((s, l) => s + Number(l.debit), 0);
  const cr = jl.reduce((s, l) => s + Number(l.credit), 0);
  q.chk("P5", "JV Dr = Cr (> 0)", dr === cr && dr > 0, "Dr = Cr", `${dr}/${cr}`, "CRITICAL");
  const sum = (f: string) => items.reduce((s, i) => s + Number(i[f]), 0);
  const identityBad = items.filter((i) => i.netSatang !== i.grossSatang - i.ssoEmployeeSatang - i.whtSatang);
  q.chk(
    "P6",
    `Σ แถว = ยอดรอบ (${items.length} คน) · ทุกแถว net = gross − ปสส. − ภาษี (gross รวมเพิ่ม/หักแล้ว — payableGrossSatang) · ไม่มี net < 0`,
    items.length === HQC.employees.length - HQC.payroll.excluded.length &&
      sum("netSatang") === run.totalNetSatang && sum("grossSatang") === run.totalGrossSatang && sum("ssoEmployeeSatang") === run.totalSsoEmployeeSatang &&
      sum("whtSatang") === run.totalWhtSatang && identityBad.length === 0 && items.every((i) => i.netSatang >= 0),
    `${HQC.employees.length - HQC.payroll.excluded.length} คน · ตรง`,
    `${items.length} คน · net ${sum("netSatang")}/${run.totalNetSatang} · identity เพี้ยน ${identityBad.length}`,
    "CRITICAL",
  );
  const bound = await P.hrPayAdjustment.count({ where: { tenantId, runId: created.id, status: "APPROVED" } });
  q.chk("P7", "3 รายการอนุมัติแล้วผูกเข้ารอบที่จ่าย", bound === HQC.payroll.approved.length, HQC.payroll.approved.length, bound);

  // ═══════════════════ 7. รายการรออนุมัติของเดือนนี้ (ไม่ผูกรอบ) ═══════════════════
  for (const a of HQC.payroll.pending as readonly Any[]) {
    const r = await pay.requestAdjustment(ctx, { employeeId: emp[a.employee], periodKey: D.thisMonth, kind: a.kind, amountSatang: a.amountSatang, hours: a.hours, note: a.note, requestedById: uid("payroll") });
    if (!r?.ok) throw new Error(`requestAdjustment(pending) ${a.employee}: ${r?.reason}`);
    adjIds[`${a.employee}:${a.kind}:pending`] = r.id;
  }
  const pend = await P.hrPayAdjustment.count({ where: { tenantId, periodKey: D.thisMonth, status: "PENDING", runId: null } });
  q.chk("P8", `รายการรออนุมัติเดือนนี้ ${HQC.payroll.pending.length} รายการ · ไม่ผูกรอบ · ไม่มีรอบเดือนนี้ (Q2)`, pend === HQC.payroll.pending.length && (await P.hrPayrollRun.count({ where: { tenantId, periodKey: D.thisMonth } })) === 0, HQC.payroll.pending.length, pend);

  // ═══════════════════ 8. ลงเวลาย้อนหลัง 7 วัน (เขียนตรงที่เดียวของ seed) ═══════════════════
  /** 🔴 จุดเขียนตรงของ HR ที่เดียวใน seed — clock() ใช้ now() จึงย้อนวันไม่ได้ · คำตัดสินคิดด้วย clockInDetail ตัวเดียวกับ clock() */
  async function insertHistoricalClock(e: HqcEmployee, dayKey: string, kind: "IN" | "OUT", minOfDay: number): Promise<void> {
    const at = atBkk(dayKey, minOfDay);
    const s = HQC.shifts[e.shift!];
    const detail = kind === "IN" ? hr.clockInDetail(at, { weekday: new Date(`${dayKey}T00:00:00Z`).getUTCDay(), dayOff: false, ...s }) : null;
    await P.hrAttendance.create({
      data: { tenantId, systemId: ctx.systemId, employeeId: emp[e.key], kind, at, note: null, judgement: detail?.judgement ?? null, dueMin: detail?.dueMin ?? null, lateMin: detail?.lateMin ?? null },
    });
  }
  const A = HQC.attendance;
  const L = HQC.leave;
  const onLeave = new Set<string>();
  for (let o = L.approved.fromOffset; o <= L.approved.toOffset; o++) onLeave.add(`${L.approved.employee}:${addDays(D.today, o)}`);
  let clockRows = 0;
  const shiftPeople = HQC.employees.filter((e) => e.shift);
  for (let off = -A.days; off <= -1; off++) {
    const day = addDays(D.today, off);
    for (const [i, e] of shiftPeople.entries()) {
      if (e.key === A.absent.employee && off === A.absent.dayOffset) continue;
      if (onLeave.has(`${e.key}:${day}`)) continue;
      const s = HQC.shifts[e.shift!];
      const inMin = e.key === A.late.employee && off === A.late.dayOffset ? s.startMin + A.late.lateMin : s.startMin - ((i % 4) + 1) * 2;
      const outMin = e.key === A.earlyOut.employee && off === A.earlyOut.dayOffset ? s.endMin - A.earlyOut.earlyMin : s.endMin + (i % 3) * 3;
      await insertHistoricalClock(e, day, "IN", inMin);
      await insertHistoricalClock(e, day, "OUT", outMin);
      clockRows += 2;
    }
  }
  const lateRow = await P.hrAttendance.findFirst({ where: { tenantId, employeeId: emp[A.late.employee], kind: "IN", judgement: "LATE" }, select: { lateMin: true } });
  q.chk("A1", `ลงเวลา ${clockRows} แถว (9 คน × 7 วัน × 2 − ขาด 1 วัน − ลา 2 วัน) · น้ำฝนสาย ${A.late.lateMin} นาที (LATE)`, (await P.hrAttendance.count({ where: { tenantId } })) === clockRows && lateRow?.lateMin === A.late.lateMin && clockRows === (9 * 7 - 1 - 2) * 2, `${(9 * 7 - 3) * 2} · ${A.late.lateMin}`, `${clockRows} · ${lateRow?.lateMin}`);
  const lateCount = await P.hrAttendance.count({ where: { tenantId, judgement: "LATE" } });
  q.chk("A2", "มีสายครั้งเดียวในชุด (น้ำฝน)", lateCount === 1, 1, lateCount);

  // ═══════════════════ 9. ลา: 1 อนุมัติแล้ว (ผู้ตัดสิน = ผู้จัดการ) + 1 รออนุมัติ ═══════════════════
  const lvA = await hr.requestLeave(ctx, { employeeId: emp[L.approved.employee], type: L.approved.type, fromDate: addDays(D.today, L.approved.fromOffset), toDate: addDays(D.today, L.approved.toOffset), reason: L.approved.reason });
  await hr.decideLeave(ctx, lvA.id, "APPROVED", uid(L.decider));
  const lvP = await hr.requestLeave(ctx, { employeeId: emp[L.pending.employee], type: L.pending.type, fromDate: addDays(D.today, L.pending.fromOffset), toDate: addDays(D.today, L.pending.toOffset), reason: L.pending.reason });
  const leaves = await P.hrLeave.findMany({ where: { tenantId }, select: { id: true, status: true, decidedById: true } });
  const la = leaves.find((x: Any) => x.id === lvA.id);
  const lp = leaves.find((x: Any) => x.id === lvP.id);
  q.chk("L1", "ใบลา 2 ใบ: แพร APPROVED (ผู้จัดการตัดสิน) · มิ้นท์ PENDING", leaves.length === 2 && la?.status === "APPROVED" && la?.decidedById === uid(L.decider) && lp?.status === "PENDING", "APPROVED/manager · PENDING", `${la?.status}/${la?.decidedById === uid(L.decider) ? "manager" : la?.decidedById} · ${lp?.status}`);

  // ═══════════════════ 10. ผลรวม + ร้านอื่นไม่เปลี่ยน + ไฟล์เฉลย ═══════════════════
  const counts = await countsOf(tenantId, tables);
  counts["User(qc emails)"] = await P.user.count({ where: { email: { in: HQC_EMAILS } } });
  const after = await otherCounts(tenantId);
  console.log(`🔎 ร้านอื่น ก่อน ${JSON.stringify(before)} · หลัง ${JSON.stringify(after)}`);
  q.chk("O1", "ร้านอื่นไม่เปลี่ยน (tenant · hrEmployee · hrPayrollRun · customer · posSale)", JSON.stringify(before) === JSON.stringify(after), JSON.stringify(before), JSON.stringify(after), "CRITICAL");

  const expected = {
    $note: "seed-hr-qc.mts output — never commit (COMMON rule). ids change every run; everything else must be identical between runs of the same day.",
    tenant: { id: tenantId, slug: HQC.tenantSlug, name: HQC.tenantName },
    systems: { HR: hrSys.id, ACCOUNT: accSys.id },
    units,
    users: Object.fromEntries(Object.entries(users).map(([k, v]) => [k, { ...v, email: HQC.users[k as HqcUserKey].email }])),
    employees: emp,
    links,
    dates: { today: D.today, thisMonth: D.thisMonth, paidRunPeriod: D.paidRunPeriod, paidRunPayDate: D.paidRunPayDate, leaverEnd: D.leaverEnd, futureStart: D.futureStart, probationStart: D.probationStart },
    paidRun: {
      id: run.id,
      periodKey: run.periodKey,
      status: run.status,
      journalEntryId: run.journalEntryId,
      itemCount: items.length,
      totals: { gross: run.totalGrossSatang, ssoEmployee: run.totalSsoEmployeeSatang, ssoEmployer: run.totalSsoEmployerSatang, wht: run.totalWhtSatang, net: run.totalNetSatang },
      jv: { debit: dr, credit: cr },
      excluded: HQC.payroll.excluded.map((x) => ({ employee: x.employee, reason: x.reason })),
    },
    adjustments: adjIds,
    leaves: { approved: lvA.id, pending: lvP.id },
    attendanceRows: clockRows,
    counts,
  };
  writeFileSync(HQC.expectedPath, JSON.stringify(expected, null, 2) + "\n");
  console.log(`💾 ${HQC.expectedPath} · รอบ ${run.periodKey} สุทธิ ฿${bahtText(run.totalNetSatang)} · ${items.length} คน · ${((Date.now() - t0) / 1000).toFixed(1)} วิ`);
  exitCode = q.summary({ counts });
} catch (e) {
  if (e instanceof SeedAbort) {
    console.error(e.message);
    exitCode = e.code;
  } else {
    q.chk("X0", "seed ทำงานจนจบ", false, "จบ", (e instanceof Error ? e.stack ?? e.message : String(e)).split("\n").slice(0, 3).join(" | ").slice(0, 400), "CRITICAL");
    exitCode = q.summary({});
  }
} finally {
  await P.$disconnect?.();
}
process.exit(exitCode);

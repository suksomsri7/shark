// QC — HF-HR-0 · ข้อมูลส่วนบุคคล/สลิปเงินเดือนของพนักงาน + ความถูกต้องของการตัดสินใบลา (security hotfix 1 ต.ค. 2026)
// ⚠️ Oracle ภายใต้ change control — ผู้คุมงานเป็นเจ้าของ
//
// สัญญาที่ต้องจริงเสมอ:
// [P]  D3 สลิปเงินเดือน: เปิดได้เฉพาะผู้ดูเงินเดือน (OWNER / hr.payroll.read) หรือ "ตัวพนักงานเอง" (HrEmployee.linkedUserId)
//      — ตัวเองเห็นเฉพาะรอบที่อนุมัติ/จ่ายแล้ว · คนอื่นทั้งหมด + ร้านอื่น = ไม่พบ (404)
// [Pr] D4 โปรไฟล์พนักงาน: ด่านหน้า = ผู้แก้ทะเบียน (hr.employee.create) · ผู้อ่าน HR (hr.leave.read) · ผู้ดูเงินเดือน
//      ข้อมูลที่ส่งให้ client = DTO รายช่องที่อนุญาต (whitelist) · ช่องอ่อนไหว + เอกสาร เฉพาะผู้ดูเงินเดือน · PIN ไม่ออกจาก server เลย
// [L]  D9 เหตุผลการลา (ข้อมูลสุขภาพ) เห็นเฉพาะผู้มี hr.leave.read · AI pending_leaves ไม่คืนเหตุผลเลย (ToolCtx ไม่รู้ว่าใครถาม)
// [N]  D8 ตั้ง PIN ซ้ำ → ข้อความกลาง ไม่บอกชื่อเจ้าของ PIN
// [D]  D10 ตัดสินใบลา: PENDING → APPROVED/REJECTED + ถอนอนุมัติ APPROVED → REJECTED (มติผู้คุมงาน C1) เท่านั้น (updateMany มีเงื่อนไข · แข่งกันกดได้ผลเดียว) ·
//      ผู้ตัดสินต้องไม่ใช่เจ้าของใบลา · ใบลาที่อยู่ในสายอนุมัติ (ApprovalRequest PENDING) ห้ามตัดสินทางตรง
// [S]  static: หน้าเพจ/ส่วนจอใช้ตัวโหลดด้านบนจริง และไม่มี client component ได้แถวดิบ · การเขียนใบลาเป็น updateMany ตามสถานะที่คาด
// [C]  ใบลาที่อนุมัติผ่านสายอนุมัติ ถอนทางตรงไม่ได้ · [R] ถอนอนุมัติ + ประวัติ (audit) · [W] แข่งกดข้าม process
// [G]  grantStaffAccess: ห้ามผูกเข้าบัญชีตัวเอง · 1 บัญชี ↔ 1 พนักงาน · พนักงานที่มีเงินเดือนต้องผูกโดยผู้ดูเงินเดือน · [B] backfill กติกาเดียวกัน
// [Q]  ยื่น OT โดยคนที่ไม่ใช่ผู้ดูเงินเดือน: ไม่เห็นยอด · ไม่รู้ว่ามีโปรไฟล์ไหม · [V] hr.* / MANAGER จำกัดสาขา · [F] บันทึกโปรไฟล์ไม่แตะช่องอ่อนไหว
//
// รัน (POS lane): bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hf-hr-privacy.mts
import { existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-hf-hr-privacy"); // 🔴 กัน prod

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const hr = await import("@/lib/modules/hr/service");
const pay = await import("@/lib/modules/hr/payroll");
const ap = await import("@/lib/modules/approval/service");
const tools = await import("@/lib/ai/tools");
const proposals = await import("@/lib/ai/proposals");
const staffSvc = await import("@/lib/staff/service");
// ตัวโหลดใหม่ของใบนี้ — โค้ดก่อนแก้ยังไม่มี ⇒ null (ทุกข้อที่พึ่งมันแดง ไม่ใช่ CRASH)
type PrivacyMod = {
  loadPayslipForViewer: (ctx: Ctx, v: Viewer, runId: string, employeeId: string) => Promise<unknown | null>;
  loadEmployeeProfileForViewer: (
    ctx: Ctx,
    v: Viewer,
    employeeId: string,
  ) => Promise<{ profile: Record<string, unknown>; docs: unknown[]; canSeeSensitive: boolean } | null>;
  leaveItemsForViewer: (
    ctx: Ctx,
    v: Viewer,
  ) => Promise<{ pending: Record<string, unknown>[]; history: Record<string, unknown>[]; canReadReason: boolean }>;
  employeeProfileInputFromForm?: (form: FormData, v: Viewer) => Record<string, unknown>;
  adjustmentReplyForViewer?: (payrollViewer: boolean, res: { ok: boolean; reason?: string; amountSatang?: number }) => { status: string; message: string };
};
const privacyPath = "@/lib/modules/hr/privacy";
const priv = (await import(privacyPath as string).catch(() => null)) as PrivacyMod | null;
const shared = (await import("@/lib/modules/hr/privacy-shared" as string).catch(() => null)) as {
  EMPLOYEE_PROFILE_FIELDS?: readonly string[];
  EMPLOYEE_SENSITIVE_FIELDS?: readonly string[];
} | null;

type Ctx = { tenantId: string; systemId: string };
// ── โหมดผู้แข่ง (worker): เรียกจาก process แม่ เพื่อให้การตัดสินสองทางมาจากคนละ process/connection จริง ──
if (process.argv[2] === "--race-worker") {
  const [, , , wTenant, wSystem, wStatus, wDecider, wGoAt, wIds] = process.argv as string[];
  await prisma.$queryRaw`SELECT 1`; // อุ่น connection ก่อนถึงเวลานัด
  const out: string[] = [];
  const ids = String(wIds).split(",");
  const late = Date.now() > Number(wGoAt);
  for (let i = 0; i < ids.length; i++) {
    const at = Number(wGoAt) + i * 800;
    while (Date.now() < at) await new Promise((r) => setTimeout(r, 2));
    try {
      await hr.decideLeave({ tenantId: String(wTenant), systemId: String(wSystem) }, ids[i]!, wStatus as "APPROVED" | "REJECTED", wDecider, { from: "PENDING" });
      out.push("ok");
    } catch {
      out.push("no");
    }
  }
  console.log("RACE_RESULT " + JSON.stringify({ out, late }));
  await prisma.$disconnect();
  process.exit(0);
}
type Viewer = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
const errMsg = async (f: () => Promise<unknown>): Promise<string | null> => {
  try {
    await f();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const THAI = /[฀-๿]/;

const ts = Date.now();
let tid = "";
let otherTid = "";
try {
  // ── setup: ร้าน A (HR) + ร้าน B (HR) ──
  const t = await prisma.tenant.create({ data: { name: "QC HF-HR-0", slug: `qc-hfhr-${ts}` } });
  tid = t.id;
  const hrSys = await sys.createSystem(tid, "HR", "ทีมงาน");
  const ctx: Ctx = { tenantId: tid, systemId: hrSys.id };
  const t2 = await prisma.tenant.create({ data: { name: "QC HF-HR-0 อีกร้าน", slug: `qc-hfhr2-${ts}` } });
  otherTid = t2.id;
  const hrSys2 = await sys.createSystem(otherTid, "HR", "ทีมงานร้านอื่น");

  const U = {
    owner: `u-owner-${ts}`,
    hrMgr: `u-hrmgr-${ts}`,
    hrStaff: `u-hrstaff-${ts}`,
    manager: `u-mgr-${ts}`,
    member: `u-member-${ts}`,
    self: `u-self-${ts}`,
    other: `u-other-${ts}`,
  };
  const V: Record<string, Viewer> = {
    owner: { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: U.owner },
    // ผู้จัดการ HR ที่ได้สิทธิ์ดูเงินเดือน
    hrMgr: {
      role: "STAFF",
      unitAccess: [],
      permissions: { "hr.employee.create": true, "hr.leave.read": true, "hr.leave.decide": true, "hr.payroll.read": true },
      userId: U.hrMgr,
    },
    // เจ้าหน้าที่ HR ที่ไม่มีสิทธิ์ดูเงินเดือน
    hrStaff: {
      role: "STAFF",
      unitAccess: [],
      permissions: { "hr.employee.create": true, "hr.leave.read": true, "hr.leave.decide": true },
      userId: U.hrStaff,
    },
    // MANAGER = ผ่าน evaluate ทุกโมดูล แต่ไม่ใช่ผู้ดูเงินเดือน (PDPA)
    manager: { role: "MANAGER", unitAccess: ["*"], permissions: {}, userId: U.manager },
    // พนักงานทั่วไปของร้าน ไม่มีคีย์ HR เลย
    member: { role: "STAFF", unitAccess: [], permissions: {}, userId: U.member },
    // ตัวพนักงานเอง (ผูกบัญชีกับ E1) ไม่มีคีย์ HR
    self: { role: "STAFF", unitAccess: [], permissions: {}, userId: U.self },
    // เจ้าของร้านอื่น
    other: { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: U.other },
  };
  const ctxOther: Ctx = { tenantId: otherTid, systemId: hrSys.id }; // ร้าน B ถือ systemId ของร้าน A มาลอง

  const e1 = await hr.createEmployee(ctx, { name: `ตัวเองทดสอบ ${ts}`, position: "ช่าง", pinCode: "1234" });
  const e2 = await hr.createEmployee(ctx, { name: `เพื่อนร่วมงาน ${ts}`, position: "แคชเชียร์", pinCode: "5678" });
  await prisma.hrEmployee.update({ where: { id: e1.id }, data: { linkedUserId: U.self } });
  for (const [id, nid, acct] of [
    [e1.id, "1101700000011", "1112223334"],
    [e2.id, "1101700000022", "5556667778"],
  ] as const) {
    await hr.saveEmployeeProfile(ctx, id, {
      nationalId: nid,
      ssoNumber: `SSO-${nid.slice(-4)}`,
      houseRegAddress: "99 หมู่ 1 ต.ทดสอบ",
      bankName: "กสิกรไทย",
      bankAccountNo: acct,
      bankAccountName: "ชื่อบัญชีทดสอบ",
      addressLine: "1 ถนนทดสอบ",
      emergencyName: "ญาติทดสอบ",
    });
    await hr.addEmployeeDoc(ctx, id, { kind: "ID_CARD", title: "สำเนาบัตร", url: `https://cdn.example.com/secret-${id}.jpg` });
  }
  const eOther = await hr.createEmployee({ tenantId: otherTid, systemId: hrSys2.id }, { name: "พนักงานร้านอื่น" });

  // ═══ [P] D3 สลิปเงินเดือน ═══
  console.log("── [P] สลิปเงินเดือน (D3) ──");
  await pay.setSalaryProfile(ctx, { employeeId: e1.id, baseSalarySatang: 2_000_000, ssoEligible: true });
  await pay.setSalaryProfile(ctx, { employeeId: e2.id, baseSalarySatang: 2_500_000, ssoEligible: true });
  const run = await pay.createPayrollRun(ctx, { periodKey: "2026-08", payDate: new Date("2026-08-31") });
  const slip = async (who: string, empId: string, c: Ctx = ctx) =>
    priv ? await priv.loadPayslipForViewer(c, V[who]!, run.id, empId).catch(() => "THROW") : "NO-MODULE";
  const opened = (r: unknown) => r !== null && r !== "NO-MODULE" && r !== "THROW";
  const denied = (r: unknown) => r === null;
  chk("P-0", "มีตัวโหลดสลิปที่ตรวจสิทธิ์ (privacy.loadPayslipForViewer)", !!priv?.loadPayslipForViewer, "มี", priv ? "มี" : "ไม่มี");
  chk("P-1", "เจ้าของร้าน เปิดสลิปของเพื่อนร่วมงานได้", opened(await slip("owner", e2.id)), "เปิดได้", String(await slip("owner", e2.id) === null ? "null" : "?"));
  chk("P-2", "ผู้มีสิทธิ์ดูเงินเดือน (hr.payroll.read) เปิดได้", opened(await slip("hrMgr", e2.id)), "เปิดได้", "ไม่ได้");
  chk("P-3", "🔴 เจ้าหน้าที่ HR ที่ไม่มี hr.payroll.read → ไม่พบ", denied(await slip("hrStaff", e2.id)), "null", String(await slip("hrStaff", e2.id) === null ? "null" : "เปิดได้"));
  chk("P-4", "🔴 MANAGER (ไม่มี hr.payroll.read) → ไม่พบ", denied(await slip("manager", e2.id)), "null", "เปิดได้/?");
  chk("P-5", "🔴 พนักงานทั่วไปที่มี runId+employeeId → ไม่พบ", denied(await slip("member", e2.id)), "null", "เปิดได้/?");
  chk("P-6", "🔴 ตัวเองเปิดสลิปของเพื่อนร่วมงาน → ไม่พบ", denied(await slip("self", e2.id)), "null", "เปิดได้/?");
  chk("P-7", "ตัวเอง + รอบยังเป็นร่าง → ยังไม่เห็น (ตัวเลขร่างยังเปลี่ยนได้)", denied(await slip("self", e1.id)), "null", "เปิดได้/?", "MAJOR");
  await prisma.hrPayrollRun.update({ where: { id: run.id }, data: { status: "APPROVED" } }); // fixture: จำลองรอบที่อนุมัติแล้ว
  chk("P-8", "ตัวเอง + รอบอนุมัติแล้ว → เปิดสลิปของตัวเองได้", opened(await slip("self", e1.id)), "เปิดได้", String(await slip("self", e1.id)));
  await prisma.hrPayrollRun.update({ where: { id: run.id }, data: { status: "PAID" } });
  chk("P-9", "ตัวเอง + รอบจ่ายแล้ว → เปิดได้", opened(await slip("self", e1.id)), "เปิดได้", "ไม่ได้");
  chk("P-10", "🔴 เจ้าของร้านอื่น (ถือ id ของร้านนี้) → ไม่พบ", denied(await slip("other", e2.id, ctxOther)), "null", "เปิดได้/?");
  chk("P-11", "id พนักงานที่ไม่มีในรอบ → ไม่พบ", denied(await slip("owner", eOther.id)), "null", "เปิดได้/?");

  // ═══ [Pr] D4 โปรไฟล์พนักงาน ═══
  console.log("── [Pr] โปรไฟล์พนักงาน (D4) ──");
  const prof = async (who: string, empId: string, c: Ctx = ctx) =>
    priv ? await priv.loadEmployeeProfileForViewer(c, V[who]!, empId).catch(() => null) : null;
  const FORBIDDEN_KEYS = ["pinCode", "linkedUserId", "partyId", "tenantId", "systemId", "docs", "createdAt", "updatedAt"];
  const SENS = ["nationalId", "ssoNumber", "houseRegAddress", "bankName", "bankAccountNo", "bankAccountName"];
  chk("Pr-0", "มีตัวโหลดโปรไฟล์ที่ตรวจสิทธิ์ + whitelist ช่อง", !!priv?.loadEmployeeProfileForViewer && !!shared?.EMPLOYEE_PROFILE_FIELDS, "มี", "ไม่มี");
  const pOwner = await prof("owner", e2.id);
  chk("Pr-1", "เจ้าของร้าน: เห็นช่องอ่อนไหว + เอกสาร", !!pOwner && pOwner.profile.nationalId === "1101700000022" && pOwner.profile.bankAccountNo === "5556667778" && pOwner.docs.length === 1 && pOwner.canSeeSensitive === true, "nid+bank+1 doc", JSON.stringify(pOwner && { nid: pOwner.profile.nationalId, docs: pOwner.docs.length }));
  const pMgr = await prof("hrMgr", e2.id);
  chk("Pr-2", "ผู้มี hr.payroll.read: เห็นช่องอ่อนไหว + เอกสาร", !!pMgr && pMgr.profile.nationalId === "1101700000022" && pMgr.docs.length === 1, "nid+1 doc", JSON.stringify(pMgr && { nid: pMgr.profile.nationalId, docs: pMgr.docs.length }));
  const pStaff = await prof("hrStaff", e2.id);
  chk("Pr-3", "🔴 เจ้าหน้าที่ HR ไม่มีสิทธิ์เงินเดือน: เปิดได้ แต่ไม่มีช่องอ่อนไหวสักช่อง + ไม่มีเอกสาร",
    !!pStaff && SENS.every((k) => !(k in pStaff.profile)) && pStaff.docs.length === 0 && pStaff.canSeeSensitive === false && pStaff.profile.addressLine === "1 ถนนทดสอบ",
    "ไม่มี 6 ช่อง · docs 0", JSON.stringify(pStaff && { keys: SENS.filter((k) => k in pStaff.profile), docs: pStaff.docs.length }));
  const pManager = await prof("manager", e2.id);
  chk("Pr-4", "🔴 MANAGER: เปิดได้ แต่ไม่มีช่องอ่อนไหว/เอกสาร", !!pManager && SENS.every((k) => !(k in pManager.profile)) && pManager.docs.length === 0, "ไม่มี", JSON.stringify(pManager && SENS.filter((k) => k in pManager.profile)));
  chk("Pr-5", "🔴 พนักงานทั่วไป (ไม่มีคีย์ HR) → ไม่พบ", (await prof("member", e2.id)) === null, "null", "เปิดได้");
  chk("Pr-6", "ตัวพนักงานเอง (ไม่มีคีย์ HR) → ไม่พบ (ยังไม่มีหน้าโปรไฟล์ของตัวเอง)", (await prof("self", e1.id)) === null, "null", "เปิดได้", "MAJOR");
  chk("Pr-7", "🔴 เจ้าของร้านอื่น → ไม่พบ", (await prof("other", e2.id, ctxOther)) === null, "null", "เปิดได้");
  const allDtos = [pOwner, pMgr, pStaff, pManager].filter((x): x is NonNullable<typeof x> => !!x);
  chk("Pr-8", "🔴 PIN / linkedUserId / partyId / tenantId / docs ไม่อยู่ใน DTO ใดเลย",
    allDtos.length === 4 && allDtos.every((d) => FORBIDDEN_KEYS.every((k) => !(k in d.profile))),
    "ไม่มี", JSON.stringify(allDtos.map((d) => FORBIDDEN_KEYS.filter((k) => k in d.profile))));
  chk("Pr-9", "PIN แสดงเป็น 'ตั้งแล้ว/ยังไม่ตั้ง' (hasPin) เท่านั้น", allDtos.length === 4 && allDtos.every((d) => d.profile.hasPin === true), "hasPin true", JSON.stringify(allDtos.map((d) => d.profile.hasPin)));
  const wl = new Set([...(shared?.EMPLOYEE_PROFILE_FIELDS ?? []), ...(shared?.EMPLOYEE_SENSITIVE_FIELDS ?? [])]);
  chk("Pr-10", "ทุกช่องใน DTO อยู่ใน whitelist", allDtos.length === 4 && wl.size > 0 && allDtos.every((d) => Object.keys(d.profile).every((k) => wl.has(k))), "ครบ", JSON.stringify(allDtos.map((d) => Object.keys(d.profile).filter((k) => !wl.has(k)))));
  chk("Pr-11", "🔴 ข้อมูลดิบของ DTO (JSON) ของผู้ไม่มีสิทธิ์ ไม่มีเลขบัตร/บัญชี/PIN/URL เอกสาร",
    !!pStaff && !/1101700000022|5556667778|5678|secret-/.test(JSON.stringify(pStaff)), "ไม่มี", pStaff ? JSON.stringify(pStaff).slice(0, 120) : "null");

  // ═══ [L] D9 เหตุผลการลา ═══
  console.log("── [L] เหตุผลการลา (D9) ──");
  const REASON = `ไปหาหมอโรคหัวใจ-${ts}`;
  const lvR = await hr.requestLeave(ctx, { employeeId: e2.id, type: "SICK", fromDate: "2026-09-10", toDate: "2026-09-10", reason: REASON });
  const items = async (who: string) => (priv ? await priv.leaveItemsForViewer(ctx, V[who]!).catch(() => null) : null);
  const hasReason = (x: Awaited<ReturnType<typeof items>>) => !!x && JSON.stringify(x).includes(REASON);
  const iStaff = await items("hrStaff");
  chk("L-1", "ผู้มี hr.leave.read เห็นเหตุผลการลา", hasReason(iStaff) && !!iStaff?.pending.some((p) => p.id === lvR.id), "เห็น", JSON.stringify(iStaff?.pending?.[0] ?? null).slice(0, 120));
  const iMember = await items("member");
  chk("L-2", "🔴 พนักงานทั่วไป: รายการใบลาไม่มีเหตุผล", !!iMember && !hasReason(iMember) && iMember.canReadReason === false, "ไม่มีเหตุผล", iMember ? JSON.stringify(iMember).slice(0, 160) : "NO-MODULE");
  const iMgr = await items("manager");
  chk("L-3", "MANAGER (ผ่าน evaluate) เห็นเหตุผล", hasReason(iMgr), "เห็น", "ไม่เห็น", "MAJOR");
  const ai = await tools.runTool({ tenantId: tid }, "pending_leaves", {});
  chk("L-4", "🔴 AI pending_leaves ไม่คืนเหตุผลการลา (ไม่รู้ว่าใครถาม ⇒ ปิดไว้)", !ai.includes(REASON) && !ai.includes("เหตุผล"), "ไม่มี", ai.slice(0, 200));
  chk("L-5", "AI pending_leaves ยังบอกชื่อ/ประเภท/วันได้ตามเดิม", ai.includes(`เพื่อนร่วมงาน ${ts}`) && ai.includes("SICK"), "มีชื่อ+ประเภท", ai.slice(0, 160), "MAJOR");

  // ═══ [N] D8 PIN ซ้ำ ═══
  console.log("── [N] ตั้ง PIN ซ้ำ (D8) ──");
  const dupPin = await hr.setPin(ctx, e2.id, "1234"); // 1234 = PIN ของ e1
  chk("N-1", "PIN ซ้ำ → ไม่บันทึก", dupPin.ok === false, "ok:false", JSON.stringify(dupPin));
  chk("N-2", "🔴 ข้อความไม่บอกชื่อคนที่ใช้ PIN นั้นอยู่", !String(dupPin.reason ?? "").includes(`ตัวเองทดสอบ ${ts}`) && !String(dupPin.reason ?? "").includes("ตัวเองทดสอบ"), "ไม่มีชื่อ", String(dupPin.reason));
  chk("N-3", "ข้อความกลางภาษาไทย 'PIN นี้ใช้ไม่ได้ กรุณาเลือก PIN อื่น'", String(dupPin.reason ?? "").includes("PIN นี้ใช้ไม่ได้ กรุณาเลือก PIN อื่น"), "ข้อความกลาง", String(dupPin.reason), "MAJOR");
  chk("N-4", "PIN ของ e2 ไม่เปลี่ยน", (await prisma.hrEmployee.findUnique({ where: { id: e2.id } }))?.pinCode === "5678", "5678", "เปลี่ยน");
  const okPin = await hr.setPin(ctx, e2.id, "9012");
  chk("N-5", "PIN ไม่ซ้ำ → บันทึกได้ตามเดิม", okPin.ok === true, "ok", JSON.stringify(okPin), "MAJOR");

  // ═══ [D] D10 ตัดสินใบลา ═══
  console.log("── [D] ตัดสินใบลา (D10) ──");
  const statusOf = async (id: string) => (await prisma.hrLeave.findUnique({ where: { id } }))?.status;
  const mkLeave = async (emp: string, day: string) =>
    (await hr.requestLeave(ctx, { employeeId: emp, type: "PERSONAL", fromDate: day, toDate: day })).id;

  const l1 = await mkLeave(e2.id, "2026-09-11");
  const e01 = await errMsg(() => hr.decideLeave(ctx, l1, "APPROVED", U.hrStaff));
  chk("D-1", "PENDING → APPROVED ตามปกติ (ผู้ตัดสินไม่ใช่เจ้าของใบลา)", e01 === null && (await statusOf(l1)) === "APPROVED", "APPROVED", `${await statusOf(l1)} ${e01 ?? ""}`);
  chk("D-1b", "decidedById ถูกบันทึก", (await prisma.hrLeave.findUnique({ where: { id: l1 } }))?.decidedById === U.hrStaff, U.hrStaff, String((await prisma.hrLeave.findUnique({ where: { id: l1 } }))?.decidedById), "MAJOR");
  // ผู้คุมงาน C1 (รอบ 2): ทางที่อนุญาต = PENDING→APPROVED · PENDING→REJECTED · APPROVED→REJECTED (ถอนอนุมัติ) — นอกนั้นปฏิเสธ
  const e02 = await errMsg(() => hr.decideLeave(ctx, l1, "APPROVED", U.owner));
  chk("D-2", "🔴 ใบลาที่อนุมัติแล้ว อนุมัติซ้ำไม่ได้ (APPROVED→APPROVED ปฏิเสธ · decidedById เดิม)", (await statusOf(l1)) === "APPROVED" && e02 !== null && (await prisma.hrLeave.findUnique({ where: { id: l1 } }))?.decidedById === U.hrStaff, "ปฏิเสธ + คงเดิม", `${await statusOf(l1)} err=${e02}`);
  chk("D-2b", "ข้อความปฏิเสธเป็นภาษาไทย", !!e02 && THAI.test(e02), "ไทย", String(e02), "MAJOR");
  const l2 = await mkLeave(e2.id, "2026-09-12");
  await prisma.hrLeave.update({ where: { id: l2 }, data: { status: "CANCELLED" } }); // fixture: ใบลาที่ยกเลิกแล้ว
  const e03 = await errMsg(() => hr.decideLeave(ctx, l2, "APPROVED", U.owner));
  chk("D-3", "🔴 ใบลาที่ยกเลิกแล้ว ห้ามอนุมัติ", (await statusOf(l2)) === "CANCELLED" && e03 !== null, "คง CANCELLED", `${await statusOf(l2)} err=${e03}`);
  const l3 = await mkLeave(e1.id, "2026-09-13");
  const e04 = await errMsg(() => hr.decideLeave(ctx, l3, "APPROVED", U.self));
  chk("D-4", "🔴 อนุมัติใบลาของตัวเองไม่ได้", (await statusOf(l3)) === "PENDING" && e04 !== null, "คง PENDING", `${await statusOf(l3)} err=${e04}`);
  const e04b = await errMsg(() => hr.decideLeave(ctx, l3, "APPROVED", U.owner));
  chk("D-4b", "คนอื่นอนุมัติใบเดียวกันได้ตามปกติ", e04b === null && (await statusOf(l3)) === "APPROVED", "APPROVED", `${await statusOf(l3)} ${e04b ?? ""}`, "MAJOR");
  // ทาง AI จริง: proposals.runKind → dispatch → decideLeave (เส้นเดียวกับการกดยืนยันข้อเสนอ)
  const OWNER_M = { role: "OWNER" as const, unitAccess: ["*"], permissions: {} };
  const l4 = await mkLeave(e2.id, "2026-09-14");
  const e04c = await errMsg(() => proposals.runKind(OWNER_M, tid, "hr_decide_leave", { leaveId: l4, decision: "REJECTED" }, `qc-hfhr-${ts}-a1`, U.owner));
  chk("D-4c", "🔴 ทาง AI: บันทึกผู้กดยืนยันเป็นผู้ตัดสิน (ไม่ใช่ null)", e04c === null && (await statusOf(l4)) === "REJECTED" && (await prisma.hrLeave.findUnique({ where: { id: l4 } }))?.decidedById === U.owner, `REJECTED · ${U.owner}`, `${await statusOf(l4)} ${String((await prisma.hrLeave.findUnique({ where: { id: l4 } }))?.decidedById)} ${e04c ?? ""}`);
  const l4b = await mkLeave(e1.id, "2026-09-24");
  const e04d = await errMsg(() => proposals.runKind(OWNER_M, tid, "hr_decide_leave", { leaveId: l4b, decision: "APPROVED" }, `qc-hfhr-${ts}-a2`, U.self));
  chk("D-4d", "🔴 ทาง AI: อนุมัติใบลาของตัวเองไม่ได้", e04d !== null && (await statusOf(l4b)) === "PENDING", "ปฏิเสธ + คง PENDING", `${await statusOf(l4b)} err=${e04d}`);
  const l4c = await mkLeave(e2.id, "2026-09-25");
  await hr.decideLeave(ctx, l4c, "APPROVED", U.hrStaff, { from: "PENDING" }); // ข้อเสนอ "ไม่อนุมัติ" ถูกสร้างตอนยัง PENDING แล้วมีคนอนุมัติไปก่อน
  const e04e = await errMsg(() => proposals.runKind(OWNER_M, tid, "hr_decide_leave", { leaveId: l4c, decision: "REJECTED" }, `qc-hfhr-${ts}-a3`, U.owner));
  chk("D-4e", "🔴 ทาง AI: ข้อเสนอ 'ไม่อนุมัติ' ที่ค้างจากตอน PENDING ไม่ถอนการอนุมัติที่เกิดทีหลังแบบเงียบ ๆ",
    e04e !== null && /สถานะใบลาเปลี่ยนไปแล้ว กรุณาเปิดดูใหม่/.test(e04e) && (await statusOf(l4c)) === "APPROVED", "ปฏิเสธ + คง APPROVED", `${await statusOf(l4c)} err=${e04e}`);

  // แข่งกันกด 2 ทางพร้อมกัน (คนละ connection ของ pool) — ต้องมีผลเดียว ×3 รอบ
  let raceOk = 0;
  const raceLog: string[] = [];
  for (let i = 0; i < 3; i++) {
    const lr = await mkLeave(e2.id, `2026-09-${15 + i}`);
    const [a, b] = await Promise.allSettled([
      // ทั้งสองกดจากรายการ "รออนุมัติ" ⇒ คาดสถานะต้นทาง PENDING (ไม่ให้ทางที่ช้ากว่ากลายเป็นการถอนอนุมัติเงียบ ๆ)
      hr.decideLeave(ctx, lr, "APPROVED", U.owner, { from: "PENDING" }),
      hr.decideLeave(ctx, lr, "REJECTED", U.hrStaff, { from: "PENDING" }),
    ]);
    const wins = [a, b].filter((x) => x.status === "fulfilled").length;
    const st = await statusOf(lr);
    const expect = a.status === "fulfilled" ? "APPROVED" : "REJECTED";
    raceLog.push(`${wins}:${st}`);
    if (wins === 1 && st === expect) raceOk++;
  }
  chk("D-5", "🔴 ตัดสินพร้อมกัน 2 ทาง → สำเร็จทางเดียว และสถานะตรงกับผู้ชนะ (3/3 รอบ)", raceOk === 3, "3/3", raceLog.join(" "));

  // ═══ [R] ถอนอนุมัติ (APPROVED → REJECTED) — ฟีเจอร์ "เปลี่ยนใจ" เดิมของร้าน (qc-hr-leave-booking LV-9) ═══
  const r1 = await mkLeave(e2.id, "2026-10-01");
  await hr.decideLeave(ctx, r1, "APPROVED", U.hrStaff);
  chk("R-0", "fixture: วันลาอนุมัติแล้ว → วันนั้นไม่ว่าง", (await hr.isAvailable(ctx, e2.id, new Date("2026-10-01"))) === false, "false", "true", "MAJOR");
  const er1 = await errMsg(() => hr.decideLeave(ctx, r1, "REJECTED", U.owner, { from: "APPROVED" }));
  chk("R-1", "ถอนอนุมัติโดยคนที่ไม่ใช่เจ้าของใบลา → REJECTED + decidedById ใหม่", er1 === null && (await statusOf(r1)) === "REJECTED" && (await prisma.hrLeave.findUnique({ where: { id: r1 } }))?.decidedById === U.owner, "REJECTED", `${await statusOf(r1)} ${er1 ?? ""}`);
  const audR1 = await prisma.auditLog.findMany({ where: { tenantId: tid, targetType: "HrLeave", targetId: r1 }, orderBy: { createdAt: "asc" } });
  const lastAud = audR1[audR1.length - 1] as { before?: { status?: string; decidedById?: string | null }; after?: { status?: string; decidedById?: string | null } } | undefined;
  chk("R-1c", "🔴 ประวัติไม่หาย: audit 2 แถว (อนุมัติ + ถอน) · แถวถอนเก็บผู้อนุมัติเดิมใน before",
    audR1.length === 2 && lastAud?.before?.status === "APPROVED" && lastAud.before.decidedById === U.hrStaff && lastAud.after?.status === "REJECTED" && lastAud.after.decidedById === U.owner,
    "2 แถว · before hrStaff/APPROVED → after owner/REJECTED", JSON.stringify(audR1.map((a) => [a.action, a.before, a.after])).slice(0, 220));
  const r1d = await mkLeave(e2.id, "2026-10-03");
  await hr.decideLeave(ctx, r1d, "APPROVED", U.hrStaff);
  const er1d = await errMsg(() => hr.decideLeave(ctx, r1d, "REJECTED", U.owner));
  chk("R-1d", "🔴 ผู้ตัดสินที่ไม่บอกสถานะที่เห็น (ไม่มี from) ถอนใบที่อนุมัติแล้วไม่ได้ — 'สถานะใบลาเปลี่ยนไปแล้ว'",
    er1d !== null && /สถานะใบลาเปลี่ยนไปแล้ว กรุณาเปิดดูใหม่/.test(er1d) && (await statusOf(r1d)) === "APPROVED", "ปฏิเสธ + คง APPROVED", `${await statusOf(r1d)} err=${er1d}`);
  chk("R-1b", "ผลข้างเคียงเหมือนเดิม: ถอนแล้ววันนั้นกลับมาว่าง", (await hr.isAvailable(ctx, e2.id, new Date("2026-10-01"))) === true, "true", "false");
  const er2 = await errMsg(() => hr.decideLeave(ctx, r1, "REJECTED", U.hrStaff, { from: "APPROVED" }));
  chk("R-2", "🔴 ถอนซ้ำครั้งที่สอง → ปฏิเสธ (REJECTED→REJECTED) · decidedById ไม่เปลี่ยน", er2 !== null && (await prisma.hrLeave.findUnique({ where: { id: r1 } }))?.decidedById === U.owner, "ปฏิเสธ", `err=${er2}`);
  const er3 = await errMsg(() => hr.decideLeave(ctx, r1, "APPROVED", U.hrStaff));
  chk("R-3", "🔴 ใบลาที่ไม่อนุมัติแล้ว กลับไปอนุมัติไม่ได้ (REJECTED→APPROVED)", er3 !== null && (await statusOf(r1)) === "REJECTED", "ปฏิเสธ", `${await statusOf(r1)} err=${er3}`);
  const r2 = await mkLeave(e1.id, "2026-10-02");
  await hr.decideLeave(ctx, r2, "APPROVED", U.owner);
  const er4 = await errMsg(() => hr.decideLeave(ctx, r2, "REJECTED", U.self, { from: "APPROVED" }));
  chk("R-4", "🔴 ถอนอนุมัติใบลาของตัวเองไม่ได้", er4 !== null && (await statusOf(r2)) === "APPROVED", "คง APPROVED", `${await statusOf(r2)} err=${er4}`);
  // ถอนพร้อมกัน 2 ทาง (และ ถอน vs อนุมัติซ้ำ) บนใบที่อนุมัติแล้ว — ต้องสำเร็จทางเดียว ×3 รอบ
  let revOk = 0;
  const revLog: string[] = [];
  for (let i = 0; i < 3; i++) {
    const lr = await mkLeave(e2.id, `2026-10-${10 + i}`);
    await hr.decideLeave(ctx, lr, "APPROVED", U.hrMgr);
    const [a, b] = await Promise.allSettled([
      hr.decideLeave(ctx, lr, "REJECTED", U.owner, { from: "APPROVED" }),
      hr.decideLeave(ctx, lr, i === 2 ? "APPROVED" : "REJECTED", U.hrStaff, { from: "APPROVED" }),
    ]);
    const wins = [a, b].filter((x) => x.status === "fulfilled").length;
    const row = await prisma.hrLeave.findUnique({ where: { id: lr } });
    const winner = a.status === "fulfilled" ? U.owner : U.hrStaff;
    revLog.push(`${wins}:${row?.status}:${row?.decidedById === winner}`);
    if (wins === 1 && row?.status === "REJECTED" && row.decidedById === winner) revOk++;
  }
  chk("R-5", "🔴 ถอนอนุมัติพร้อมกัน → สำเร็จทางเดียว (3/3 รอบ · รอบที่ 3 = ถอน vs อนุมัติซ้ำ)", revOk === 3, "3/3", revLog.join(" "));

  const r3 = await mkLeave(e2.id, "2026-10-20");
  await hr.decideLeave(ctx, r3, "APPROVED", U.hrMgr);
  const bRev = await hr.bulkDecideLeave(ctx, [r3], "REJECTED", U.owner, { from: "PENDING" });
  chk("R-6", "🔴 ปุ่มจากรายการ 'รออนุมัติ' (from PENDING) ไม่ถอนใบที่เพิ่งถูกอนุมัติไปก่อน", bRev.done === 0 && bRev.failed.length === 1 && (await statusOf(r3)) === "APPROVED", "failed 1 · คง APPROVED", `${JSON.stringify(bRev)} ${await statusOf(r3)}`);
  const actSrc = readFileSync("src/lib/modules/hr/actions.ts", "utf8");
  chk("R-7", "bulkDecideLeaveAction (หน้ารายการรออนุมัติ) ส่ง from PENDING", /bulkDecideLeave\(ctx, leaveIds, rawStatus, auth\.active\.userId, \{ from: "PENDING" \}\)/.test(actSrc), "ใช่", "ไม่ใช่");

  // bulk: ใบที่อนุมัติแล้วอนุมัติซ้ำ = failed พร้อมเหตุผลไทย · ใบที่รอ = done
  const l5 = await mkLeave(e2.id, "2026-09-20");
  const bulk = await hr.bulkDecideLeave(ctx, [l1, l5], "APPROVED", U.owner);
  chk("D-6", "bulk: ใบที่อนุมัติแล้วไม่ถูกอนุมัติซ้ำ (done 1 · failed 1) + เหตุผลไทย", bulk.done === 1 && bulk.failed.length === 1 && bulk.failed[0]?.id === l1 && THAI.test(bulk.failed[0]?.reason ?? "") && (await statusOf(l1)) === "APPROVED" && (await statusOf(l5)) === "APPROVED", "done1/failed1", JSON.stringify(bulk));
  const e07 = await errMsg(() => hr.decideLeave({ tenantId: otherTid, systemId: hrSys.id }, l5, "REJECTED", U.other));
  chk("D-7", "ร้านอื่นตัดสินใบลาของร้านนี้ไม่ได้", e07 !== null && (await statusOf(l5)) === "APPROVED", "ปฏิเสธ", `${await statusOf(l5)} err=${e07}`);

  // ใบลาที่อยู่ในสายอนุมัติ — ทางตรงต้องส่งไปที่สายอนุมัติ (ทำท้ายสุด: นโยบายมีผลกับใบลาใหม่ทุกใบของร้าน)
  const pol = await ap.createPolicy({ tenantId: tid }, { name: "ใบลาทุกใบ", entityType: "HrLeave", steps: [{ order: 1, approverRole: "OWNER" }] });
  const l6 = await mkLeave(e2.id, "2026-09-21");
  const req = await prisma.approvalRequest.findFirst({ where: { tenantId: tid, entityType: "HrLeave", entityId: l6 } });
  chk("D-8.0", "fixture: ใบลาเข้าสายอนุมัติ (ApprovalRequest PENDING)", req?.status === "PENDING", "PENDING", String(req?.status), "MAJOR");
  const e08 = await errMsg(() => hr.decideLeave(ctx, l6, "APPROVED", U.owner));
  chk("D-8", "🔴 ใบลาที่รอสายอนุมัติ ห้ามตัดสินทางตรง (ใบลาคง PENDING · คำขอคง PENDING)",
    e08 !== null && (await statusOf(l6)) === "PENDING" && (await prisma.approvalRequest.findUnique({ where: { id: req?.id ?? "-" } }))?.status === "PENDING",
    "ปฏิเสธ", `${await statusOf(l6)} err=${e08}`);
  chk("D-8b", "ข้อความชี้ไปที่สายอนุมัติ (ภาษาไทย)", !!e08 && THAI.test(e08) && /อนุมัติ/.test(e08), "ชี้ไปสายอนุมัติ", String(e08), "MAJOR");
  // ทางที่ถูก: ตัดสินผ่านสายอนุมัติ → effect เขียนใบลา (เส้นเดิมไม่เสีย — ตรวจผ่าน approval.decide + effect ใน qc-approval-wiring)
  // ใบลาที่อนุมัติผ่านสายอนุมัติ — ห้ามถอนทางตรง (approval core ไม่มีทางถอนผล ⇒ ปฏิเสธ + ชี้ทาง)
  const lc = await mkLeave(e2.id, "2026-09-22");
  const reqC = await prisma.approvalRequest.findFirst({ where: { tenantId: tid, entityType: "HrLeave", entityId: lc } });
  // fixture: สายตัดสินแล้ว + effect เขียนใบลา (รูปเดียวกับ approval-effects.ts)
  await prisma.approvalRequest.update({ where: { id: reqC?.id ?? "-" }, data: { status: "APPROVED", decidedAt: new Date() } });
  await prisma.hrLeave.update({ where: { id: lc }, data: { status: "APPROVED", decidedById: "approval-engine" } });
  const eC1 = await errMsg(() => hr.decideLeave(ctx, lc, "REJECTED", U.owner, { from: "APPROVED" }));
  chk("C-1", "🔴 ใบลาที่อนุมัติผ่านสายอนุมัติ ถอนทางตรงไม่ได้ (แม้เจ้าของร้าน) + ข้อความไทยชี้ทาง", eC1 !== null && THAI.test(eC1) && /สายอนุมัติ/.test(eC1) && (await statusOf(lc)) === "APPROVED", "ปฏิเสธ + คง APPROVED", `${await statusOf(lc)} err=${eC1}`);
  const eC2 = await errMsg(() => hr.decideLeave(ctx, lc, "REJECTED"));
  chk("C-2", "🔴 ทางภายในที่ไม่มีผู้ตัดสินก็ถอนใบที่อนุมัติผ่านสายไม่ได้", eC2 !== null && (await statusOf(lc)) === "APPROVED", "ปฏิเสธ", `${await statusOf(lc)} err=${eC2}`);
  await ap.setPolicyActive({ tenantId: tid }, pol.id, false);

  // ═══ [G] ผูกบัญชีผู้ใช้กับพนักงาน (grantStaffAccess จริง) — ห้ามใช้เป็นทางลัดเปิดสลิปคนอื่น ═══
  console.log("── [G] ผูกบัญชีผู้ใช้ (staff) ──");
  const mkUser = async (tag: string, role: "OWNER" | "MANAGER" | "STAFF" | null) => {
    const u = await prisma.user.create({ data: { email: `hfhr-${ts}-${tag}@example.com`, name: `QC ${tag}` } });
    if (role) await prisma.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    return u;
  };
  const uMgr = await mkUser("mgr", "MANAGER");
  const uOwn = await mkUser("own", "OWNER");
  const uL = await mkUser("l", null);
  const uP = await mkUser("p", "STAFF");
  const gX = await hr.createEmployee(ctx, { name: `มีเงินเดือน ${ts}` });
  await pay.setSalaryProfile(ctx, { employeeId: gX.id, baseSalarySatang: 4_000_000, ssoEligible: true });
  const gW = await hr.createEmployee(ctx, { name: `ไม่มีเงินเดือน ${ts}` });
  const gY = await hr.createEmployee(ctx, { name: `ผูกแล้ว ${ts}` });
  const linkOf = async (id: string) => (await prisma.hrEmployee.findUnique({ where: { id } }))?.linkedUserId ?? null;
  const grant = (actor: string, employeeId: string, email: string) => staffSvc.grantStaffAccess({ tenantId: tid, actorUserId: actor, employeeId, email });
  const g1 = await grant(uMgr.id, gW.id, uMgr.email);
  chk("G-1", "🔴 ผูกพนักงานเข้าบัญชีของผู้สั่งเอง → ปฏิเสธ (ข้อความไทย)", g1.ok === false && THAI.test((g1 as { reason?: string }).reason ?? "") && (await linkOf(gW.id)) === null, "ปฏิเสธ · ไม่ผูก", `${JSON.stringify(g1)} link=${await linkOf(gW.id)}`);
  const g2 = await grant(uOwn.id, gY.id, uL.email);
  chk("G-2", "เจ้าของร้านผูกพนักงาน (ไม่มีเงินเดือน) เข้าบัญชีใหม่ได้ตามปกติ", g2.ok === true && (await linkOf(gY.id)) === uL.id, "ok", JSON.stringify(g2), "MAJOR");
  const g2b = await grant(uOwn.id, gY.id, uL.email);
  chk("G-2b", "ให้สิทธิ์ซ้ำคนเดิม-บัญชีเดิม ยังผ่าน (idempotent)", g2b.ok === true, "ok", JSON.stringify(g2b), "MAJOR");
  const g3 = await grant(uOwn.id, gW.id, uL.email);
  chk("G-3", "🔴 บัญชีที่ผูกกับพนักงานคนอื่นในร้านแล้ว → ปฏิเสธ (1 บัญชี ↔ 1 พนักงาน)", g3.ok === false && (await linkOf(gW.id)) === null, "ปฏิเสธ", `${JSON.stringify(g3)} link=${await linkOf(gW.id)}`);
  const g4 = await grant(uMgr.id, gX.id, `hfhr-${ts}-n@example.com`);
  chk("G-4", "🔴 ผู้จัดการที่ไม่มีสิทธิ์ดูเงินเดือน ผูกพนักงานที่มีโปรไฟล์เงินเดือน → ปฏิเสธ", g4.ok === false && (await linkOf(gX.id)) === null, "ปฏิเสธ", `${JSON.stringify(g4)} link=${await linkOf(gX.id)}`);
  const g5 = await grant(uMgr.id, gW.id, `hfhr-${ts}-m@example.com`);
  chk("G-5", "ผู้จัดการผูกพนักงานที่ไม่มีเงินเดือนเข้าบัญชีใหม่ได้ตามปกติ", g5.ok === true && !!(await linkOf(gW.id)), "ok", JSON.stringify(g5), "MAJOR");
  const g6 = await grant(uOwn.id, gX.id, `hfhr-${ts}-o@example.com`);
  chk("G-6", "เจ้าของร้าน (ผู้ดูเงินเดือน) ผูกพนักงานที่มีเงินเดือนได้", g6.ok === true && !!(await linkOf(gX.id)), "ok", JSON.stringify(g6), "MAJOR");

  // ═══ [B] สคริปต์ backfill ผูกบัญชีจากอีเมล (เขียน linkedUserId ที่สอง) — กติกาเดียวกัน ═══
  console.log("── [B] backfill ผูกบัญชี ──");
  const b1 = await hr.createEmployee(ctx, { name: `bf มีเงินเดือน ${ts}` });
  await hr.saveEmployeeProfile(ctx, b1.id, { email: uMgr.email }); // ผู้จัดการแก้อีเมลพนักงานเป็นของตัวเอง
  await pay.setSalaryProfile(ctx, { employeeId: b1.id, baseSalarySatang: 5_000_000, ssoEligible: true });
  const b2 = await hr.createEmployee(ctx, { name: `bf ปกติ ${ts}` });
  await hr.saveEmployeeProfile(ctx, b2.id, { email: uP.email });
  const b3 = await hr.createEmployee(ctx, { name: `bf ซ้ำบัญชี ${ts}` });
  await hr.saveEmployeeProfile(ctx, b3.id, { email: uP.email });
  const bf = spawnSync("pnpm", ["exec", "tsx", "scripts/member-backfill-hr-users.mts", "--tenant", `qc-hfhr-${ts}`], { env: process.env, encoding: "utf8", timeout: 240_000 });
  const bfSum = /BACKFILL_SUMMARY (.*)/.exec(String(bf.stdout ?? ""))?.[1] ?? `exit=${bf.status} ${String(bf.stderr ?? "").slice(0, 160)}`;
  chk("B-0", "backfill รันจบ", bf.status === 0, "exit 0", bfSum, "MAJOR");
  chk("B-1", "🔴 backfill ไม่ผูกพนักงานที่มีเงินเดือน (ไม่มีผู้สั่งที่มีสิทธิ์ดูเงินเดือน)", (await linkOf(b1.id)) === null, "null", String(await linkOf(b1.id)));
  chk("B-2", "backfill ผูกพนักงานปกติจากอีเมลได้ตามเดิม", (await linkOf(b2.id)) === uP.id, uP.id, String(await linkOf(b2.id)), "MAJOR");
  chk("B-3", "🔴 backfill ไม่ผูกบัญชีเดียวกับพนักงานคนที่สอง", (await linkOf(b3.id)) === null, "null", String(await linkOf(b3.id)));

  // ═══ [Q] ยื่น OT โดยคนที่ไม่ใช่ผู้ดูเงินเดือน — ห้ามรู้ยอด/ห้ามรู้ว่ามีโปรไฟล์เงินเดือนไหม ═══
  console.log("── [Q] คำตอบการยื่นรายการเงิน ──");
  const reply = priv?.adjustmentReplyForViewer;
  const resNo = await pay.requestAdjustment(ctx, { employeeId: gW.id, periodKey: "2026-09", kind: "OT", hours: 2, requestedById: U.member });
  const resYes = await pay.requestAdjustment(ctx, { employeeId: e2.id, periodKey: "2026-09", kind: "OT", hours: 2, requestedById: U.member });
  chk("Q-0", "มีตัวสร้างคำตอบตามสิทธิ์ (privacy.adjustmentReplyForViewer)", !!reply, "มี", "ไม่มี");
  const qNo = reply?.(false, resNo);
  chk("Q-1", "🔴 ไม่ใช่ผู้ดูเงินเดือน + ไม่มีโปรไฟล์ → ข้อความกลาง (ไม่บอกให้ตั้งเงินเดือน)", !!qNo && qNo.status === "error" && !/เงินเดือน/.test(qNo.message) && THAI.test(qNo.message), "ข้อความกลาง", JSON.stringify(qNo ?? resNo));
  const qYes = reply?.(false, resYes);
  chk("Q-2", "🔴 ไม่ใช่ผู้ดูเงินเดือน + ยื่นสำเร็จ → ไม่บอกยอดเงิน", !!qYes && qYes.status === "ok" && !/[0-9๐-๙]/.test(qYes.message), "ไม่มีตัวเลข", JSON.stringify(qYes ?? null));
  const qV = reply?.(true, resYes);
  chk("Q-3", "ผู้ดูเงินเดือน: คำตอบเดิม (มียอด)", !!qV && qV.status === "ok" && qV.message.includes(((resYes.amountSatang ?? 0) / 100).toLocaleString("th-TH")), "มียอด", JSON.stringify(qV ?? null), "MAJOR");
  const qVn = reply?.(true, resNo);
  chk("Q-4", "ผู้ดูเงินเดือน: ไม่มีโปรไฟล์ → บอกให้ตั้งเงินเดือนตามเดิม", !!qVn && /ตั้งเงินเดือน/.test(qVn.message), "ข้อความเดิม", JSON.stringify(qVn ?? null), "MAJOR");

  // ═══ [V] ผู้ดูชนิดอื่น: wildcard hr.* · MANAGER ที่จำกัดสาขา ═══
  console.log("── [V] wildcard / MANAGER จำกัดสาขา ──");
  V.wild = { role: "STAFF", unitAccess: [], permissions: { "hr.*": true }, userId: `u-wild-${ts}` };
  V.mgrUnit = { role: "MANAGER", unitAccess: [`unit-elsewhere-${ts}`], permissions: {}, userId: `u-mgru-${ts}` };
  chk("V-1", "🔴 hr.* (wildcard) ไม่ได้สิทธิ์ดูเงินเดือน: สลิป → ไม่พบ", (await slip("wild", e2.id)) === null, "null", "เปิดได้");
  const pW = await prof("wild", e2.id);
  chk("V-2", "🔴 hr.* เปิดโปรไฟล์ได้ แต่ไม่มีช่องอ่อนไหว/เอกสาร", !!pW && SENS.every((k) => !(k in pW.profile)) && pW.docs.length === 0, "ไม่มี", JSON.stringify(pW && SENS.filter((k) => k in pW.profile)));
  chk("V-3", "🔴 MANAGER จำกัดสาขา: สลิป → ไม่พบ", (await slip("mgrUnit", e2.id)) === null, "null", "เปิดได้");
  const pMu = await prof("mgrUnit", e2.id);
  chk("V-4", "MANAGER จำกัดสาขา: ไม่มีช่องอ่อนไหว (HR ไม่มีแกนสาขา — เปิดโปรไฟล์ได้ · บันทึกเป็นข้อค้นพบ)", !!pMu && SENS.every((k) => !(k in pMu.profile)), "ไม่มีช่องอ่อนไหว", JSON.stringify(pMu && SENS.filter((k) => k in pMu.profile)), "MAJOR");

  // ═══ [F] บันทึกโปรไฟล์โดยผู้จัดการที่ไม่ใช่ผู้ดูเงินเดือน — 6 ช่องอ่อนไหวต้องไม่ถูกแตะ ═══
  console.log("── [F] บันทึกโปรไฟล์ ──");
  const fd = new FormData();
  fd.set("addressLine", "2 ถนนใหม่");
  for (const k of SENS) fd.set(k, k === "nationalId" ? "9999999999999" : `แก้โดยผู้จัดการ-${k}`);
  const inMgr = priv?.employeeProfileInputFromForm?.(fd, V.manager!);
  if (inMgr) await hr.saveEmployeeProfile(ctx, e2.id, inMgr);
  const rowF = await prisma.hrEmployee.findUnique({ where: { id: e2.id } });
  chk("F-1", "🔴 ผู้จัดการ (ไม่มี hr.payroll.read) ส่งช่องอ่อนไหวมา → 6 คอลัมน์คงเดิม · ช่องทั่วไปบันทึกได้",
    !!inMgr && rowF?.nationalId === "1101700000022" && rowF.bankAccountNo === "5556667778" && rowF.ssoNumber === "SSO-0022" && rowF.houseRegAddress === "99 หมู่ 1 ต.ทดสอบ" && rowF.bankName === "กสิกรไทย" && rowF.bankAccountName === "ชื่อบัญชีทดสอบ" && rowF.addressLine === "2 ถนนใหม่",
    "คงเดิม", JSON.stringify(rowF && SENS.map((k) => (rowF as unknown as Record<string, unknown>)[k])));
  const inPay = priv?.employeeProfileInputFromForm?.(fd, V.hrMgr!);
  chk("F-2", "ผู้ดูเงินเดือน: ช่องอ่อนไหวผ่านเข้า service ได้ตามเดิม", !!inPay && inPay.nationalId === "9999999999999", "มี", JSON.stringify(inPay ?? null).slice(0, 120), "MAJOR");

  // ═══ [W] แข่งกดจากคนละ process (คนละ connection) 5 รอบ ═══
  console.log("── [W] แข่งกดข้าม process ──");
  const raceIds: string[] = [];
  for (let i = 0; i < 5; i++) raceIds.push(await mkLeave(e2.id, `2026-11-${String(i + 1).padStart(2, "0")}`));
  const goAt = Date.now() + 35_000;
  const worker = (status: string, decider: string) =>
    new Promise<{ out: string[]; late: boolean } | null>((res) => {
      const c = spawn("pnpm", ["exec", "tsx", "scripts/qc-hf-hr-privacy.mts", "--race-worker", tid, hrSys.id, status, decider, String(goAt), raceIds.join(",")], { env: process.env });
      let o = "";
      c.stdout.on("data", (d) => (o += String(d)));
      c.on("close", () => {
        const m = /RACE_RESULT (.*)/.exec(o);
        res(m ? (JSON.parse(m[1]!) as { out: string[]; late: boolean }) : null);
      });
    });
  const [wa, wb] = await Promise.all([worker("APPROVED", U.owner), worker("REJECTED", U.hrStaff)]);
  let wOk = 0;
  const wLog: string[] = [];
  for (let i = 0; i < raceIds.length; i++) {
    const st = await statusOf(raceIds[i]!);
    const a = wa?.out[i];
    const b = wb?.out[i];
    const wins = [a, b].filter((x) => x === "ok").length;
    wLog.push(`${a}/${b}:${st}`);
    if (wins === 1 && st === (a === "ok" ? "APPROVED" : "REJECTED")) wOk++;
  }
  chk("W-1", "🔴 แข่งกดจากคนละ process 5 รอบ → สำเร็จทางเดียวทุกรอบ", wOk === 5 && !!wa && !!wb, "5/5", `${wLog.join(" ")} late=${wa?.late}/${wb?.late}`);
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e));
} finally {
  for (const id of [tid, otherTid].filter(Boolean)) {
    const del = async (n: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        console.log(`  ⚠ cleanup ${n}: ${err instanceof Error ? err.message.slice(0, 60) : err}`);
      }
    };
    const M = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>;
    for (const m of [
      "approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy",
      "hrPayrollItem", "hrPayrollRun", "hrPayAdjustment", "hrSalaryProfile",
      "hrEmployeeDoc", "hrAttendance", "hrLeave", "hrWorkSchedule", "hrEmployee",
      "outboxEvent", "appNotification", "webhookDelivery", "auditLog", "aiProposal", "membership", "appSystemUnit", "appSystem",
    ]) await del(m, () => M[m]!.deleteMany({ where: { tenantId: id } }));
    await del("party", () => M["party"]!.deleteMany({ where: { tenantId: id } }));
    await del("tenant", () => prisma.tenant.delete({ where: { id } }));
  }
  try {
    await prisma.user.deleteMany({ where: { email: { startsWith: `hfhr-${ts}-` } } });
  } catch (err) {
    console.log(`  ⚠ cleanup users: ${err instanceof Error ? err.message.slice(0, 60) : err}`);
  }
  console.log("\n[cleanup] ลบร้านทดสอบเรียบร้อย");
}

// ═══ [S] static — หน้า/ส่วนจอใช้ตัวโหลดจริง และไม่มี client component ได้แถวดิบ ═══
console.log("── [S] static ──");
const rd = (p: string) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};
// client component ที่หน้าใช้ (ไฟล์ขึ้นต้นด้วย "use client") — ต้องไม่ได้แถวดิบผ่าน prop ใดเลย
const clientImports = (src: string): string[] =>
  [...src.matchAll(/from "(@\/[^"]+)"/g)]
    .map((m) => m[1]!)
    .filter((spec) => {
      const base = "src/" + spec.slice(2);
      const f = [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`].find((x) => existsSync(x));
      return !!f && /^\s*["']use client["']/.test(rd(f));
    });
const RAW_ROW = /getEmployee\(|payslipData\(|hrEmployee|hrPayrollItem|tenantDb|from "@\/lib\/modules\/hr\/(service|payroll)"/;
const slipPage = rd("src/app/app/sys/[id]/payroll/[runId]/slip/[employeeId]/page.tsx");
chk("S-1", "หน้าสลิป: ข้อมูลมาจาก loadPayslipForViewer ทางเดียว · ไม่มีทางอ่านแถว HR ดิบ · ไม่มี client component",
  /loadPayslipForViewer\(/.test(slipPage) && !RAW_ROW.test(slipPage) && clientImports(slipPage).length === 0, "ใช่", JSON.stringify(clientImports(slipPage)));
const profPage = rd("src/app/app/sys/[id]/hr/employees/[employeeId]/page.tsx");
const profClients = clientImports(profPage);
const viewRefs = [...new Set([...profPage.matchAll(/\bview\.(\w+)/g)].map((m) => m[1]))].sort();
chk("S-2", "หน้าโปรไฟล์: ข้อมูลพนักงานมาจาก DTO ทางเดียว (ไม่มี getEmployee/hrEmployee/tenantDb/service) · client component เดียวที่รับข้อมูล = EmployeeProfileForm ด้วย emp={view.profile}",
  /loadEmployeeProfileForViewer\(/.test(profPage) && !RAW_ROW.test(profPage) &&
    profClients.every((c) => c === "@/lib/modules/hr/EmployeeProfileForm" || c.startsWith("@/components/")) &&
    (profPage.match(/<EmployeeProfileForm\b[^>]*>/g) ?? []).join("") === "<EmployeeProfileForm systemId={id} emp={view.profile} canSeeSensitive={sensitive} />" &&
    JSON.stringify(viewRefs) === JSON.stringify(["canSeeSensitive", "docs", "profile"]),
  "ใช่", JSON.stringify({ profClients, viewRefs }));
const form = rd("src/lib/modules/hr/EmployeeProfileForm.tsx");
chk("S-3", "ฟอร์มโปรไฟล์ (client) ใช้ type จาก privacy-shared และไม่รู้จัก pinCode", /from "\.\/privacy-shared"/.test(form) && !/pinCode/.test(form), "ใช่", "ไม่ใช่");
const sharedSrc = rd("src/lib/modules/hr/privacy-shared.ts");
chk("S-4", "privacy-shared.ts ไม่ import โมดูลที่ถึง prisma (client import ได้)", sharedSrc.length > 0 && !/from "@\/lib\/core\/db"|from "\.\/service"|from "\.\/payroll"|@prisma\/client"/.test(sharedSrc.replace(/import type[^;]+;/g, "")), "สะอาด", sharedSrc ? "มี import ต้องห้าม" : "ไม่มีไฟล์");
const uiSrc = rd("src/lib/modules/hr/ui.tsx");
const leaveSection = uiSrc.slice(uiSrc.indexOf("export async function HrLeaveSection"), uiSrc.indexOf("// ───────────── พนักงาน (employees)"));
chk("S-5", "ส่วนจอใบลาใช้ leaveItemsForViewer และไม่อ่าน .reason ตรง", /leaveItemsForViewer\(/.test(leaveSection) && !/\.reason\b/.test(leaveSection.replace(/it\.reason/g, "")) , "ใช่", "ไม่ใช่");
const toolsSrc = rd("src/lib/ai/tools.ts");
const plBlock = toolsSrc.slice(toolsSrc.indexOf("const pendingLeaves: AiTool"), toolsSrc.indexOf("// ── 5) member_count"));
chk("S-6", "AI pending_leaves ไม่อ่าน l.reason", plBlock.length > 0 && !/l\.reason/.test(plBlock), "ใช่", "ไม่ใช่");
const svcSrc = rd("src/lib/modules/hr/service.ts");
const decideBody = svcSrc.slice(svcSrc.indexOf("export async function decideLeave"), svcSrc.indexOf("export type BulkLeaveResult"));
chk("S-8", "decideLeave เขียนครั้งสุดท้ายด้วย updateMany ที่มีเงื่อนไขสถานะที่คาดไว้ (ไม่มี hrLeave.update ธรรมดา)",
  /hrLeave\.updateMany\(\{\s*where: \{ id: leaveId, status: from \}/.test(decideBody) && !/hrLeave\.update\(/.test(decideBody), "ใช่", "ไม่ใช่");
const actSrc2 = rd("src/lib/modules/hr/actions.ts");
const decideActBody = actSrc2.slice(actSrc2.indexOf("export async function decideLeaveAction"), actSrc2.indexOf("export type BulkLeaveState"));
chk("S-9", "decideLeaveAction ส่ง from (สถานะที่ผู้ใช้เห็น) ให้ decideLeave", /formData\.get\("from"\)/.test(decideActBody) && /decideLeave\(ctx, leaveId, rawStatus, auth\.active\.userId, \{ from/.test(decideActBody), "ใช่", "ไม่ใช่");
const propSrc = rd("src/lib/ai/proposals.ts");
chk("S-10", "proposals: hr_decide_leave ส่งผู้กดยืนยันเป็นผู้ตัดสิน (userId ?? null)", /hrSvc\.decideLeave\(\{ tenantId, systemId: system\.id \}, String\(p\.leaveId \?\? ""\), decision, userId \?\? null\)/.test(propSrc), "ใช่", "ไม่ใช่");
chk("S-11", "saveEmployeeProfileAction กรองช่องอ่อนไหวผ่าน employeeProfileInputFromForm", /employeeProfileInputFromForm\(formData, hrViewerOf\(auth\)\)/.test(actSrc2), "ใช่", "ไม่ใช่");
const payActSrc = rd("src/lib/modules/hr/payroll-actions.ts");
chk("S-12", "requestAdjustmentAction ตอบผ่าน adjustmentReplyForViewer", /adjustmentReplyForViewer\(/.test(payActSrc), "ใช่", "ไม่ใช่");
chk("S-7", "รายการช่องอ่อนไหวของ DTO ตรงกับ SENSITIVE_EMPLOYEE_FIELDS ของ service",
  JSON.stringify([...(shared?.EMPLOYEE_SENSITIVE_FIELDS ?? [])]) === JSON.stringify([...hr.SENSITIVE_EMPLOYEE_FIELDS]), "ตรง",
  JSON.stringify(shared?.EMPLOYEE_SENSITIVE_FIELDS ?? null), "MAJOR");

await prisma.$disconnect();
const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: HF-HR-0 ข้อมูลพนักงาน/สลิป/ใบลา =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);

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
// [A]  รอบ 4: ไม่มีผู้ตัดสินจริง (แผนงาน AI / null / สตริงว่าง) = ห้ามตัดสินใบลา · [GR] ให้สิทธิ์พนักงานคนเดียวพร้อมกัน → ผูกได้ทางเดียว ·
//      G-7 เจ้าของ (ผู้ดูเงินเดือน) ผูกตัวเองได้ · Q-6 คำปฏิเสธ OT ตามชั่วโมงของผู้ไม่ดูเงินเดือนเหมือนกันทุกไบต์
// [SC] รอบ 5 (R5.1): ห้ามตัดสินคำขอ HR ของแถวพนักงานที่ผูกกับบัญชีตัวเองผ่านสายอนุมัติ (ทุกขั้น · รายใบ/หลายใบ · AI approval_decide) ·
//      [AD] (R5.5) AI approval_decide ไม่รู้ตัวผู้กดยืนยัน = ปฏิเสธไทยก่อนเขียน · [OT] (R5.2) ชั่วโมง OT ของผู้ไม่ดูเงินเดือน = ทีละ 0.25 ·
//      [GA] (R5.3) บัญชีเดียว → พนักงาน 2 คนพร้อมกัน = ผูกได้คนเดียว · [PL5] (R5.4) แผนที่มีขั้นที่ไม่มีวันทำได้ = ปฏิเสธตอนสร้าง + ไม่ทำสักขั้น
// [PA] รอบ 5b (H1): รายการเพิ่ม/หักเงินของแถวพนักงานที่ผูกกับบัญชีผู้อนุมัติเอง = อนุมัติไม่ได้ (ยกเว้นเจ้าของร้าน) · ปฏิเสธได้ ·
//      [CH] (H2) ใบลาที่มีคำขอในสายอนุมัติ (รอ/อนุมัติ/ปฏิเสธ) ทางตรงตัดสินไม่ได้ · [UI] (H3) ปุ่มตัดสินคืนเหตุผลเป็นข้อมูล + แสดงที่แถว ·
//      OT-7 (H4) ฟอร์มไม่บล็อกค่าที่ server รับ · OT-8…OT-11 (H5) ชั่วโมง OT สูงสุด 744 สำหรับทุกคน
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
// ── โหมดผู้แข่งผูกบัญชี (R4.3): ให้สิทธิ์พนักงานคนเดียวกันกับคนละอีเมล จากคนละ process/connection ──
if (process.argv[2] === "--grant-worker") {
  const [, , , gTenant, gActor, gGoAt, gIds, gEmails] = process.argv as string[];
  await prisma.$queryRaw`SELECT 1`;
  const out: string[] = [];
  const ids = String(gIds).split(",");
  const emails = String(gEmails).split(",");
  const late = Date.now() > Number(gGoAt);
  for (let i = 0; i < ids.length; i++) {
    const at = Number(gGoAt) + i * 1500;
    while (Date.now() < at) await new Promise((r) => setTimeout(r, 2));
    const r = await staffSvc.grantStaffAccess({ tenantId: String(gTenant), actorUserId: String(gActor), employeeId: ids[i]!, email: emails[i]! }).catch(() => ({ ok: false }));
    out.push(r.ok ? "ok" : "no");
  }
  console.log("GRANT_RESULT " + JSON.stringify({ out, late }));
  await prisma.$disconnect();
  process.exit(0);
}
// ── โหมดผู้แข่งผูกบัญชี (R5.3): บัญชี (อีเมล) เดียวกัน → พนักงานคนละคน จากคนละ process — คืนเหตุผลของฝั่งที่แพ้ด้วย ──
if (process.argv[2] === "--grant2-worker") {
  const [, , , gTenant, gActor, gGoAt, gIds, gEmails] = process.argv as string[];
  await prisma.$queryRaw`SELECT 1`;
  const out: { ok: boolean; reason?: string }[] = [];
  const ids = String(gIds).split(",");
  const emails = String(gEmails).split(",");
  const late = Date.now() > Number(gGoAt);
  for (let i = 0; i < ids.length; i++) {
    const at = Number(gGoAt) + i * 1500;
    while (Date.now() < at) await new Promise((r) => setTimeout(r, 2));
    const r = (await staffSvc.grantStaffAccess({ tenantId: String(gTenant), actorUserId: String(gActor), employeeId: ids[i]!, email: emails[i]! }).catch((e: unknown) => ({ ok: false, reason: `THROW ${e instanceof Error ? e.message.slice(0, 80) : ""}` }))) as { ok: boolean; reason?: string };
    out.push(r.ok ? { ok: true } : { ok: false, reason: r.reason });
  }
  console.log("GRANT2_RESULT " + JSON.stringify({ out, late }));
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

  // ═══ [A] รอบ 4 (R4.1/R4.2): ไม่มีผู้ตัดสินจริง = ห้ามอนุมัติ/ถอน — ทางแผนงาน AI + ตัว service ═══
  console.log("── [A] ไม่มีผู้ตัดสินจริง (แผน AI / service) ──");
  const plans = await import("@/lib/ai/plans");
  const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "hfhr plan" } });
  const runPlan = async (leaveId: string, decision: "APPROVED" | "REJECTED") => {
    // รอบ 5 (R5.4): createPlan ปฏิเสธแผนที่มีขั้นตัดสินใบลาแล้ว (PL5-1) ⇒ A-1/A-2 ใช้แถวแผนที่เขียนตรงลง DB (รูปเดียวกับที่ createPlan เคยเขียน)
    const p = await prisma.aiPlan.create({ data: { tenantId: tid, conversationId: conv.id, title: "ตัดสินใบลา", hasDestructive: false, stepsJson: [{ kind: "hr_decide_leave", summary: "ตัดสินใบลา", payload: { leaveId, decision }, status: "PENDING" }], expiresAt: new Date(Date.now() + 3_600_000) } });
    return plans.executePlan(OWNER_M, { tenantId: tid }, p.id);
  };
  const a1 = await mkLeave(e2.id, "2026-12-01");
  const exA1 = await runPlan(a1, "APPROVED");
  const noteA1 = exA1.results[0]?.note ?? "";
  chk("A-1", "🔴 แผนงาน AI (ไม่รู้ตัวผู้กดยืนยัน) อนุมัติใบลาไม่ได้ — ใบลาคง PENDING", exA1.ok === false && (await statusOf(a1)) === "PENDING", "ok:false · PENDING", `${exA1.ok} ${await statusOf(a1)} ${noteA1}`);
  chk("A-1b", "ข้อความไทยชี้ไปหน้าระบบพนักงาน (ไม่โทษผู้ใช้)", /แผนงานอัตโนมัติ/.test(noteA1) && /หน้าระบบพนักงาน/.test(noteA1), "ชี้ทาง", noteA1, "MAJOR");
  const a2 = await mkLeave(e2.id, "2026-12-02");
  await hr.decideLeave(ctx, a2, "APPROVED", U.hrStaff);
  const exA2 = await runPlan(a2, "REJECTED");
  chk("A-2", "🔴 แผนงาน AI ถอนใบลาที่อนุมัติแล้วไม่ได้ — คง APPROVED · ผู้อนุมัติเดิม", exA2.ok === false && (await statusOf(a2)) === "APPROVED" && (await prisma.hrLeave.findUnique({ where: { id: a2 } }))?.decidedById === U.hrStaff, "คง APPROVED", `${exA2.ok} ${await statusOf(a2)} ${exA2.results[0]?.note ?? ""}`);
  const a3 = await mkLeave(e2.id, "2026-12-03");
  const eA3 = await errMsg(() => proposals.runKind(OWNER_M, tid, "hr_decide_leave", { leaveId: a3, decision: "REJECTED" }, `qc-hfhr-${ts}-a4`));
  chk("A-3", "🔴 runKind ไม่มี userId → ปฏิเสธ (ไม่ตัดสินแม้แต่ไม่อนุมัติ) · ใบลาคง PENDING", eA3 !== null && (await statusOf(a3)) === "PENDING", "ปฏิเสธ", `${await statusOf(a3)} err=${eA3}`);
  const a4 = await mkLeave(e2.id, "2026-12-05");
  const eA4 = await errMsg(() => hr.decideLeave(ctx, a4, "APPROVED", null));
  chk("A-4", "🔴 service: ผู้ตัดสิน null → ไม่อนุมัติ", eA4 !== null && (await statusOf(a4)) === "PENDING", "ปฏิเสธ · PENDING", `${await statusOf(a4)} err=${eA4}`);
  chk("A-4b", "ข้อความปฏิเสธเป็นภาษาไทย", !!eA4 && THAI.test(eA4), "ไทย", String(eA4), "MAJOR");
  const a5 = await mkLeave(e2.id, "2026-12-06");
  const eA5 = await errMsg(() => hr.decideLeave(ctx, a5, "APPROVED", ""));
  chk("A-5", "🔴 service: ผู้ตัดสินเป็นสตริงว่าง → ไม่อนุมัติ", eA5 !== null && (await statusOf(a5)) === "PENDING", "ปฏิเสธ · PENDING", `${await statusOf(a5)} err=${eA5}`);
  const eA6 = await errMsg(() => hr.decideLeave(ctx, a2, "REJECTED", null, { from: "APPROVED" }));
  chk("A-6", "🔴 service: ผู้ตัดสิน null ถอนอนุมัติไม่ได้ (แม้บอก from APPROVED)", eA6 !== null && (await statusOf(a2)) === "APPROVED", "ปฏิเสธ · APPROVED", `${await statusOf(a2)} err=${eA6}`);
  const a7 = await mkLeave(e2.id, "2026-12-07");
  const bA7 = await hr.bulkDecideLeave(ctx, [a7], "APPROVED");
  chk("A-7", "🔴 bulk ไม่มีผู้ตัดสิน → ไม่อนุมัติสักใบ (failed + เหตุผลไทย)", bA7.done === 0 && bA7.failed.length === 1 && THAI.test(bA7.failed[0]?.reason ?? "") && (await statusOf(a7)) === "PENDING", "done 0", `${JSON.stringify(bA7)} ${await statusOf(a7)}`);
  const a8 = await mkLeave(e2.id, "2026-12-04");
  const eA8 = await errMsg(() => hr.decideLeave(ctx, a8, "APPROVED"));
  chk("A-8", "ผู้เรียกภายในรุ่นเก่าที่ไม่ส่งช่องผู้ตัดสินเลย (ข้อสอบเดิม qc-hr / LV-9) ยังทำงานเดิม — ไม่มีโค้ดใน src เรียกแบบนี้ (S-14)", eA8 === null && (await statusOf(a8)) === "APPROVED", "APPROVED", `${await statusOf(a8)} err=${eA8}`, "MAJOR");

  // ═══ [SC] รอบ 5 (R5.1): ห้ามตัดสินคำขอ HR ของแถวพนักงานที่ผูกกับบัญชีตัวเอง ผ่านสายอนุมัติ ═══
  console.log("── [SC] สายอนุมัติ: ห้ามตัดสินคำขอของตัวเอง (R5.1) ──");
  const SELF_TH = "อนุมัติคำขอของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน";
  const effects = await import("@/lib/approval-effects");
  const apCtx = { tenantId: tid };
  const reqOf = async (leaveId: string) => (await prisma.approvalRequest.findFirst({ where: { tenantId: tid, entityType: "HrLeave", entityId: leaveId } }))?.id ?? "-";
  const reqRow = async (rid: string) => prisma.approvalRequest.findUnique({ where: { id: rid } });
  const reqSt = async (rid: string) => (await reqRow(rid))?.status;
  const decN = async (rid: string) => prisma.approvalDecision.count({ where: { tenantId: tid, requestId: rid } });
  type DecRes = { ok: boolean; status: string; reason?: string };
  const apDecide = async (v: Viewer, rid: string, decision: "APPROVED" | "REJECTED"): Promise<DecRes> =>
    (await ap.decide(v, apCtx, rid, { decision }).catch((e: unknown) => ({ ok: false, status: "THROW", reason: e instanceof Error ? e.message.slice(0, 160) : String(e) }))) as DecRes;
  const eMg = await hr.createEmployee(ctx, { name: `ผู้จัดการลาเอง ${ts}` });
  await prisma.hrEmployee.update({ where: { id: eMg.id }, data: { linkedUserId: U.manager } });
  const eOw = await hr.createEmployee(ctx, { name: `เจ้าของลาเอง ${ts}` });
  await prisma.hrEmployee.update({ where: { id: eOw.id }, data: { linkedUserId: U.owner } });
  V.mgr2 = { role: "MANAGER", unitAccess: ["*"], permissions: {}, userId: `u-mgr2-${ts}` };
  const polM = await ap.createPolicy(apCtx, { name: "ใบลา ขั้นผู้จัดการ", entityType: "HrLeave", steps: [{ order: 1, approverRole: "MANAGER" }] });
  const sc1 = await mkLeave(eMg.id, "2027-01-04");
  const rid1 = await reqOf(sc1);
  chk("SC-0", "fixture: ใบลาของผู้จัดการ (ผูกบัญชี) เข้าสายอนุมัติขั้น MANAGER", (await reqSt(rid1)) === "PENDING", "PENDING", String(await reqSt(rid1)), "MAJOR");
  const dSelfA = await apDecide(V.manager!, rid1, "APPROVED");
  const evAp = await prisma.outboxEvent.count({ where: { tenantId: tid, idempotencyKey: `approval.request.approved#${rid1}` } });
  chk("SC-1", "🔴 ผู้จัดการอนุมัติใบลาของตัวเองผ่าน approval.decide ไม่ได้ — คำขอคง PENDING · ไม่มีแถวการตัดสิน · ไม่มี event อนุมัติ · ใบลาคง PENDING",
    dSelfA.ok === false && (await reqSt(rid1)) === "PENDING" && (await decN(rid1)) === 0 && evAp === 0 && (await statusOf(sc1)) === "PENDING",
    "ปฏิเสธ · PENDING · 0 แถว", `${JSON.stringify(dSelfA)} req=${await reqSt(rid1)} dec=${await decN(rid1)} ev=${evAp} leave=${await statusOf(sc1)}`);
  chk("SC-1b", "เหตุผล = 'อนุมัติคำขอของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน'", dSelfA.reason === SELF_TH, SELF_TH, String(dSelfA.reason), "MAJOR");
  const dSelfR = await apDecide(V.manager!, rid1, "REJECTED");
  chk("SC-2", "🔴 ปฏิเสธ (REJECTED) คำขอของตัวเองผ่านสายก็ไม่ได้ — คง PENDING · 0 แถว", dSelfR.ok === false && dSelfR.reason === SELF_TH && (await reqSt(rid1)) === "PENDING" && (await decN(rid1)) === 0, "ปฏิเสธ", `${JSON.stringify(dSelfR)} req=${await reqSt(rid1)} dec=${await decN(rid1)}`);
  const dOther = await apDecide(V.mgr2!, rid1, "APPROVED");
  // effect ของสาย (รูปเดียวกับ outbox consumer · updateMany ตามสถานะ ⇒ เรียกซ้ำได้)
  await effects.applyApprovalEffect({ tenantId: tid, type: "approval.request.approved", payload: { requestId: rid1, entityType: "HrLeave", entityId: sc1 } });
  const dec1 = await prisma.approvalDecision.findFirst({ where: { tenantId: tid, requestId: rid1 } });
  chk("SC-3", "ผู้อนุมัติคนอื่น (ผู้จัดการอีกคน) อนุมัติได้ตามปกติ → คำขอ APPROVED · ผู้ตัดสินถูกบันทึก · ใบลา APPROVED ผ่าน effect",
    dOther.ok === true && (await reqSt(rid1)) === "APPROVED" && dec1?.decidedById === V.mgr2!.userId && (await statusOf(sc1)) === "APPROVED",
    "APPROVED", `${JSON.stringify(dOther)} req=${await reqSt(rid1)} by=${dec1?.decidedById} leave=${await statusOf(sc1)}`, "MAJOR");
  const scA = await mkLeave(eMg.id, "2027-01-05");
  const scB = await mkLeave(e2.id, "2027-01-06");
  const rA = await reqOf(scA);
  const rB = await reqOf(scB);
  const bk = await ap.bulkDecide(V.manager!, apCtx, [rA, rB], "APPROVED", null);
  chk("SC-4", "🔴 bulk: ของตัวเอง + ของคนอื่น → ของตัวเองถูกปฏิเสธ (เหตุผลไทย · คง PENDING · 0 แถว) · ของคนอื่นตัดสินได้",
    bk.done === 1 && bk.failed.length === 1 && bk.failed[0]?.id === rA && bk.failed[0]?.reason === SELF_TH && (await reqSt(rA)) === "PENDING" && (await decN(rA)) === 0 && (await reqSt(rB)) === "APPROVED",
    "done 1 · failed 1 (ของตัวเอง)", `${JSON.stringify(bk)} own=${await reqSt(rA)} other=${await reqSt(rB)}`);
  // ทุกขั้น: สาย 2 ขั้น (MANAGER → OWNER) · ใบลาของเจ้าของร้านที่ผูกบัญชี
  await ap.setPolicyActive(apCtx, polM.id, false);
  const pol2 = await ap.createPolicy(apCtx, { name: "ใบลา 2 ขั้น", entityType: "HrLeave", steps: [{ order: 1, approverRole: "MANAGER" }, { order: 2, approverRole: "OWNER" }] });
  const scO = await mkLeave(eOw.id, "2027-01-07");
  const rO = await reqOf(scO);
  const dO1 = await apDecide(V.owner!, rO, "APPROVED");
  chk("SC-5", "🔴 เจ้าของร้าน (ผูกกับแถวพนักงานของตัวเอง) ตัดสินใบลาของตัวเองที่ขั้น 1 ไม่ได้", dO1.ok === false && dO1.reason === SELF_TH && (await reqSt(rO)) === "PENDING" && (await decN(rO)) === 0, "ปฏิเสธ", `${JSON.stringify(dO1)} dec=${await decN(rO)}`);
  const dO1m = await apDecide(V.mgr2!, rO, "APPROVED");
  const dO2 = await apDecide(V.owner!, rO, "APPROVED");
  chk("SC-6", "🔴 ขั้นที่ 2: เจ้าของ (ผู้ยื่น) ตัดสินคำขอของตัวเองไม่ได้ — คงที่ขั้น 2 · มีแถวการตัดสินแค่ขั้น 1",
    dO1m.ok === true && dO2.ok === false && dO2.reason === SELF_TH && (await reqRow(rO))?.currentStepOrder === 2 && (await reqSt(rO)) === "PENDING" && (await decN(rO)) === 1,
    "ขั้น 2 · PENDING · 1 แถว", `${JSON.stringify([dO1m, dO2])} step=${(await reqRow(rO))?.currentStepOrder} dec=${await decN(rO)}`);
  // ทาง AI approval_decide (runKind → dispatch → approval.decide · ผู้กดยืนยัน = ผู้ยื่น)
  const MGR_M = { role: "MANAGER" as const, unitAccess: ["*"], permissions: {} };
  const scM = await mkLeave(eMg.id, "2027-01-08");
  const rM = await reqOf(scM);
  const eAd0 = await errMsg(() => proposals.runKind(MGR_M, tid, "approval_decide", { requestId: rM, decision: "APPROVED" }, `qc-hfhr-${ts}-ad0`, U.manager));
  chk("SC-7", "🔴 ทาง AI approval_decide: ผู้กดยืนยันเป็นเจ้าของใบลา → ปฏิเสธด้วยข้อความเดียวกัน · คำขอคง PENDING · 0 แถว",
    !!eAd0 && eAd0.includes(SELF_TH) && (await reqSt(rM)) === "PENDING" && (await decN(rM)) === 0, SELF_TH, `${await reqSt(rM)} err=${String(eAd0).slice(0, 160)}`);

  // ═══ [AD] รอบ 5 (R5.5): AI approval_decide ไม่รู้ตัวผู้กดยืนยัน → ปฏิเสธไทยก่อนเขียน · รู้ตัว → ส่งต่อให้ตัดสินได้ ═══
  console.log("── [AD] AI approval_decide ต้องรู้ตัวผู้กดยืนยัน (R5.5) ──");
  const scN = await mkLeave(e2.id, "2027-01-09");
  const rN = await reqOf(scN);
  const eAd1 = await errMsg(() => proposals.runKind(OWNER_M, tid, "approval_decide", { requestId: rN, decision: "APPROVED" }, `qc-hfhr-${ts}-ad1`));
  chk("AD-1", "🔴 ไม่รู้ตัวผู้กดยืนยัน → ข้อความไทย (ไม่มี '/' · ไม่มี prisma · ไม่มีรหัสร้าน/รหัสคำขอ) · คำขอคง PENDING · 0 แถว",
    !!eAd1 && THAI.test(eAd1) && !eAd1.includes("/") && !/prisma/i.test(eAd1) && !eAd1.includes(tid) && !eAd1.includes(rN) && (await reqSt(rN)) === "PENDING" && (await decN(rN)) === 0,
    "ข้อความไทยสะอาด", `${await reqSt(rN)} err=${String(eAd1).slice(0, 200)}`);
  const eAd2 = await errMsg(() => proposals.runKind(OWNER_M, tid, "approval_decide", { requestId: rN, decision: "APPROVED" }, `qc-hfhr-${ts}-ad2`, U.owner));
  const decN1 = await prisma.approvalDecision.findFirst({ where: { tenantId: tid, requestId: rN } });
  chk("AD-2", "🔴 รู้ตัวผู้กดยืนยัน (ส่งมาจากทางยืนยัน) → ตัดสินได้ · ผู้ตัดสิน = ผู้กดยืนยัน (ขั้น 1 → ขั้น 2)",
    eAd2 === null && decN1?.decidedById === U.owner && (await reqRow(rN))?.currentStepOrder === 2, `decidedBy ${U.owner}`, `err=${String(eAd2).slice(0, 160)} by=${decN1?.decidedById}`);
  const eAd3 = await errMsg(() => proposals.runKind(OWNER_M, tid, "approval_decide", { requestId: rO, decision: "APPROVED" }, `qc-hfhr-${ts}-ad3`, U.owner));
  chk("AD-3", "🔴 ผู้กดยืนยันคือเจ้าของคำขอ (เจ้าของร้าน · ขั้น 2) → ปฏิเสธโดย R5.1 · คงที่ขั้น 2",
    !!eAd3 && eAd3.includes(SELF_TH) && (await reqSt(rO)) === "PENDING" && (await decN(rO)) === 1, SELF_TH, `err=${String(eAd3).slice(0, 160)} dec=${await decN(rO)}`);
  await ap.setPolicyActive(apCtx, pol2.id, false);

  // ═══ [PL5] รอบ 5 (R5.4): แผนที่มีขั้นที่ไม่มีวันทำได้ (ต้องมีผู้ตัดสินเป็นคน) ═══
  console.log("── [PL5] แผนงานที่มีขั้นที่ทำผ่านแผนไม่ได้ (R5.4) ──");
  const plLeave = await mkLeave(e2.id, "2027-01-11");
  const plEmpName = `พนักงานจากแผน ${ts}`;
  const plSteps = [
    { kind: "hr_create_employee", summary: "เพิ่มพนักงาน", payload: { name: plEmpName } },
    { kind: "hr_decide_leave", summary: "อนุมัติใบลา", payload: { leaveId: plLeave, decision: "APPROVED" } },
  ];
  const plBefore = await prisma.aiPlan.count({ where: { tenantId: tid } });
  const ePl1 = await errMsg(() => plans.createPlan({ tenantId: tid }, { conversationId: conv.id, title: "แผนมีตัดสินใบลา", steps: plSteps }));
  chk("PL5-1", "🔴 สร้างแผนที่มีขั้น 'ตัดสินใบลา' → ปฏิเสธตอนสร้าง (ข้อความไทย) · ไม่มีแถวแผนใหม่",
    !!ePl1 && THAI.test(ePl1) && (await prisma.aiPlan.count({ where: { tenantId: tid } })) === plBefore, "ปฏิเสธ", `err=${ePl1} plans=${await prisma.aiPlan.count({ where: { tenantId: tid } })}/${plBefore}`);
  const ePl2 = await errMsg(() => plans.createPlan({ tenantId: tid }, { conversationId: conv.id, title: "แผนมีอนุมัติคำขอ", steps: [{ kind: "approval_decide", summary: "อนุมัติคำขอ", payload: { requestId: rN, decision: "APPROVED" } }] }));
  chk("PL5-2", "🔴 แผนที่มีขั้น 'ตัดสินคำขอในสายอนุมัติ' (ต้องมีผู้กดยืนยันเป็นคน) → ปฏิเสธตอนสร้าง", !!ePl2 && THAI.test(ePl2), "ปฏิเสธ", String(ePl2), "MAJOR");
  const forged = await prisma.aiPlan.create({ data: { tenantId: tid, conversationId: conv.id, title: "แผนปลอม", hasDestructive: false, stepsJson: plSteps.map((x) => ({ ...x, status: "PENDING" })), expiresAt: new Date(Date.now() + 3_600_000) } });
  const exF = await plans.executePlan(OWNER_M, { tenantId: tid }, forged.id);
  const fRow = await prisma.aiPlan.findUnique({ where: { id: forged.id } });
  const fJson = fRow?.stepsJson;
  const fSteps = (Array.isArray(fJson) ? fJson : []) as unknown as { status?: string }[];
  const plEmp = await prisma.hrEmployee.count({ where: { tenantId: tid, name: plEmpName } });
  chk("PL5-3", "🔴 แผนปลอมใน DB ที่มีขั้นตัดสินใบลา → execute ไม่ทำสักขั้น (ไม่มีพนักงานใหม่ · ใบลาคง PENDING · ทุกขั้นคง PENDING)",
    exF.ok === false && exF.doneCount === 0 && plEmp === 0 && (await statusOf(plLeave)) === "PENDING" && fSteps.length === 2 && fSteps.every((x) => x.status === "PENDING"),
    "0 ขั้น", `${JSON.stringify({ ok: exF.ok, done: exF.doneCount })} emp=${plEmp} leave=${await statusOf(plLeave)} steps=${JSON.stringify(fSteps.map((x) => x.status))}`);
  chk("PL5-4", "แผนปลอมถูกปิด (ไม่ค้าง PENDING ให้กดซ้ำ) + ข้อความไทยบอกเหตุ", fRow?.status === "FAILED" && THAI.test(exF.results.map((r) => r.note).join(" ")), "FAILED + ไทย", `${fRow?.status} ${JSON.stringify(exF.results).slice(0, 160)}`, "MAJOR");

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
  // รอบ 4 (R4.4): กติกา "ห้ามผูกเข้าบัญชีตัวเอง" ใช้กับผู้ที่ไม่ใช่ผู้ดูเงินเดือนเท่านั้น — ร้านที่มีเจ้าของคนเดียวต้องผูกแถวพนักงานของเจ้าของเองได้
  const gO = await hr.createEmployee(ctx, { name: `เจ้าของเอง ${ts}` });
  await pay.setSalaryProfile(ctx, { employeeId: gO.id, baseSalarySatang: 6_000_000, ssoEligible: true });
  const g7 = await grant(uOwn.id, gO.id, uOwn.email);
  chk("G-7", "🔴 เจ้าของร้าน (ผู้ดูเงินเดือน) ผูกแถวพนักงานของตัวเอง (มีเงินเดือน) เข้าบัญชีตัวเองได้", g7.ok === true && (await linkOf(gO.id)) === uOwn.id, "ok · ผูก", `${JSON.stringify(g7)} link=${await linkOf(gO.id)}`);
  const gM = await hr.createEmployee(ctx, { name: `ผู้จัดการเอง ${ts}` });
  const g7b = await grant(uMgr.id, gM.id, uMgr.email);
  chk("G-7b", "🔴 ผู้จัดการ (ไม่ใช่ผู้ดูเงินเดือน) ผูกตัวเองยังไม่ได้ (พนักงานไม่มีเงินเดือนก็ตาม)", g7b.ok === false && (await linkOf(gM.id)) === null, "ปฏิเสธ", `${JSON.stringify(g7b)} link=${await linkOf(gM.id)}`);

  // รอบ 4 (R4.3): ให้สิทธิ์พนักงานคนเดียวกันพร้อมกัน 2 อีเมล จากคนละ process (คนละ connection) — ต้องผูกได้ทางเดียว ×4 รอบ
  const grIds: string[] = [];
  for (let i = 0; i < 4; i++) grIds.push((await hr.createEmployee(ctx, { name: `แข่งผูก ${i} ${ts}` })).id);
  const grEmails = (side: string) => grIds.map((_, i) => `hfhr-${ts}-r${side}${i}@example.com`);
  const grGoAt = Date.now() + 35_000;
  const grantWorker = (side: string) =>
    new Promise<{ out: string[]; late: boolean } | null>((res) => {
      const c = spawn("pnpm", ["exec", "tsx", "scripts/qc-hf-hr-privacy.mts", "--grant-worker", tid, uOwn.id, String(grGoAt), grIds.join(","), grEmails(side).join(",")], { env: process.env });
      let o = "";
      c.stdout.on("data", (d) => (o += String(d)));
      c.on("close", () => {
        const m = /GRANT_RESULT (.*)/.exec(o);
        res(m ? (JSON.parse(m[1]!) as { out: string[]; late: boolean }) : null);
      });
    });
  const [ga, gb] = await Promise.all([grantWorker("a"), grantWorker("b")]);
  let grOk = 0;
  let grClean = 0;
  const grLog: string[] = [];
  for (let i = 0; i < grIds.length; i++) {
    const a = ga?.out[i];
    const b = gb?.out[i];
    const wins = [a, b].filter((x) => x === "ok").length;
    const winEmail = a === "ok" ? grEmails("a")[i]! : grEmails("b")[i]!;
    const loseEmail = a === "ok" ? grEmails("b")[i]! : grEmails("a")[i]!;
    const winUser = await prisma.user.findUnique({ where: { email: winEmail } });
    const loseUser = await prisma.user.findUnique({ where: { email: loseEmail } });
    const link = await linkOf(grIds[i]!);
    grLog.push(`${a}/${b}:${link === winUser?.id}`);
    if (wins === 1 && !!winUser && link === winUser.id) grOk++;
    // ผู้แพ้: ธุรกรรมถูกย้อนทั้งก้อน ⇒ ไม่มีสมาชิกภาพในร้านค้างอยู่
    if (!loseUser || !(await prisma.membership.findFirst({ where: { tenantId: tid, userId: loseUser.id } }))) grClean++;
  }
  chk("GR-1", "🔴 ให้สิทธิ์พนักงานคนเดียวพร้อมกัน 2 บัญชี (คนละ process) → ผูกได้ทางเดียว และผูกกับบัญชีของผู้ชนะ (4/4 รอบ)", grOk === 4 && !!ga && !!gb, "4/4", `${grLog.join(" ")} late=${ga?.late}/${gb?.late}`);
  chk("GR-2", "ผู้แพ้ไม่มีสมาชิกภาพค้างในร้าน (ย้อนทั้งธุรกรรม)", grClean === 4, "4/4", String(grClean), "MAJOR");

  // รอบ 5 (R5.3): บัญชี (อีเมล) เดียวกัน → พนักงาน 2 คนพร้อมกัน จากคนละ process — ต้องผูกได้คนเดียว ×4 รอบ
  //   รอบ 0–1 = บัญชีมีสมาชิกภาพในร้านแล้ว · รอบ 2 = มีบัญชีแต่ยังไม่มีสมาชิกภาพ · รอบ 3 = อีเมลใหม่ (ยังไม่มีบัญชี)
  const gaA: string[] = [];
  const gaB: string[] = [];
  const gaEmails: string[] = [];
  for (let i = 0; i < 4; i++) {
    gaA.push((await hr.createEmployee(ctx, { name: `บัญชีเดียว A${i} ${ts}` })).id);
    gaB.push((await hr.createEmployee(ctx, { name: `บัญชีเดียว B${i} ${ts}` })).id);
    const em = `hfhr-${ts}-ga${i}@example.com`;
    gaEmails.push(em);
    if (i < 3) {
      const u = await prisma.user.create({ data: { email: em, name: `QC ga${i}` } });
      if (i < 2) await prisma.membership.create({ data: { userId: u.id, tenantId: tid, role: "STAFF", unitAccess: [], permissions: {}, acceptedAt: new Date() } });
    }
  }
  const gaGoAt = Date.now() + 35_000;
  type GaOut = { out: { ok: boolean; reason?: string }[]; late: boolean };
  const grant2Worker = (ids: string[]) =>
    new Promise<GaOut | null>((res) => {
      const c = spawn("pnpm", ["exec", "tsx", "scripts/qc-hf-hr-privacy.mts", "--grant2-worker", tid, uOwn.id, String(gaGoAt), ids.join(","), gaEmails.join(",")], { env: process.env });
      let o = "";
      c.stdout.on("data", (d) => (o += String(d)));
      c.on("close", () => {
        const m = /GRANT2_RESULT (.*)/.exec(o);
        res(m ? (JSON.parse(m[1]!) as GaOut) : null);
      });
    });
  const [xa, xb] = await Promise.all([grant2Worker(gaA), grant2Worker(gaB)]);
  let gaOne = 0;
  let gaWhy = 0;
  let gaClean = 0;
  const gaLog: string[] = [];
  for (let i = 0; i < 4; i++) {
    const a = xa?.out[i];
    const b = xb?.out[i];
    const u = await prisma.user.findUnique({ where: { email: gaEmails[i]! } });
    const linked = u ? await prisma.hrEmployee.findMany({ where: { tenantId: tid, linkedUserId: u.id }, select: { id: true } }) : [];
    const wins = [a, b].filter((x) => x?.ok === true).length;
    const winEmp = a?.ok ? gaA[i]! : gaB[i]!;
    const loseEmp = a?.ok ? gaB[i]! : gaA[i]!;
    const loser = a?.ok ? b : a;
    gaLog.push(`${a?.ok ? "ok" : "no"}/${b?.ok ? "ok" : "no"}:${linked.length}`);
    if (wins === 1 && linked.length === 1 && linked[0]!.id === winEmp) gaOne++;
    if (wins === 1 && /1 บัญชีผูกได้กับพนักงาน 1 คน/.test(loser?.reason ?? "") && !/ขัดข้อง/.test(loser?.reason ?? "")) gaWhy++;
    if ((await linkOf(loseEmp)) === null && !!u && (await prisma.membership.count({ where: { tenantId: tid, userId: u.id } })) === 1) gaClean++;
  }
  chk("GA-1", "🔴 บัญชีเดียวกัน → พนักงาน 2 คนพร้อมกัน (คนละ process) → ผูกได้คนเดียว (4/4 รอบ · มีสมาชิกภาพ/ไม่มี/บัญชีใหม่)", gaOne === 4 && !!xa && !!xb, "4/4", `${gaLog.join(" ")} late=${xa?.late}/${xb?.late}`);
  chk("GA-2", "ผู้แพ้ได้เหตุผลไทยที่ชัด (1 บัญชีผูกได้กับพนักงาน 1 คน) ไม่ใช่ 'ระบบขัดข้อง'", gaWhy === 4, "4/4", JSON.stringify([xa?.out, xb?.out]).slice(0, 400), "MAJOR");
  chk("GA-3", "ผู้แพ้ไม่ทิ้งอะไรไว้: แถวพนักงานของผู้แพ้ไม่ผูก · สมาชิกภาพของบัญชีในร้าน = 1 แถว", gaClean === 4, "4/4", String(gaClean), "MAJOR");

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
  // รอบ 4 (R4.6): OT ตามชั่วโมง โดยคนที่ไม่ใช่ผู้ดูเงินเดือน — ทุกคำปฏิเสธต้องเหมือนกันทุกไบต์ (ไม่ขึ้นกับยอด/ชั่วโมง/การมีเงินเดือน)
  const resTiny = await pay.requestAdjustment(ctx, { employeeId: e2.id, periodKey: "2026-09", kind: "OT", hours: 0.00001, requestedById: U.member }); // มีเงินเดือน แต่ยอดปัดเป็น 0
  const resNo3 = await pay.requestAdjustment(ctx, { employeeId: gW.id, periodKey: "2026-09", kind: "OT", hours: 3, requestedById: U.member }); // ไม่มีเงินเดือน
  const replyH = reply as ((v: boolean, r: typeof resNo, q?: { byHours?: boolean }) => { status: string; message: string }) | undefined;
  const qh = [resTiny, resNo, resNo3].map((r) => replyH?.(false, r, { byHours: true }));
  chk("Q-5", "fixture: ทั้งสามคำขอถูกปฏิเสธ (ยอดปัดเป็น 0 · ไม่มีเงินเดือน 2 ชม. · 3 ชม.)", !resTiny.ok && !resNo.ok && !resNo3.ok, "3 ปฏิเสธ", JSON.stringify([resTiny.ok, resNo.ok, resNo3.ok]), "MAJOR");
  chk("Q-6", "🔴 ไม่ใช่ผู้ดูเงินเดือน: คำปฏิเสธ OT ตามชั่วโมงเหมือนกันทุกไบต์ (ชั่วโมงต่างกัน/มีเงินเดือนหรือไม่)",
    qh.every((x) => !!x && x.status === "error") && new Set(qh.map((x) => x?.message)).size === 1 && !/[0-9๐-๙]|เงินเดือน/.test(qh[0]?.message ?? "0") && THAI.test(qh[0]?.message ?? ""),
    "1 ข้อความ", JSON.stringify(qh.map((x) => x?.message)));
  const qhV = replyH?.(true, resTiny, { byHours: true });
  chk("Q-7", "ผู้ดูเงินเดือน: คำปฏิเสธเดิมทุกตัวอักษร", !!qhV && qhV.message === resTiny.reason, String(resTiny.reason), JSON.stringify(qhV ?? null), "MAJOR");

  // ═══ [OT] รอบ 5 (R5.2): ชั่วโมง OT ของผู้ไม่ดูเงินเดือน = ทีละ 0.25 ชม. (0.25–744) · นอกนั้นคำปฏิเสธกลาง ก่อนอ่านอะไรที่ขึ้นกับเงินเดือน ═══
  console.log("── [OT] ชั่วโมง OT ทีละ 0.25 (R5.2) ──");
  type Screen = (payrollViewer: boolean, req: { kind: string; hours?: number }) => { status: string; message: string } | null;
  const screen = (priv as unknown as { screenOtHoursForViewer?: Screen } | null)?.screenOtHoursForViewer;
  const GENERIC = replyH?.(false, resNo, { byHours: true })?.message ?? "";
  chk("OT-0", "มีด่านชั่วโมง OT (privacy.screenOtHoursForViewer)", typeof screen === "function", "มี", "ไม่มี");
  const OFF = [0, -1, 0.1, 0.2, 0.24, 0.26, 0.3, 1.1, 2.6, 0.00001, 744.25, 745, 1e9, Number.NaN, Number.POSITIVE_INFINITY];
  const offR = OFF.map((h) => screen?.(false, { kind: "OT", hours: h }) ?? null);
  chk("OT-1", "🔴 ไม่ใช่ผู้ดูเงินเดือน: ชั่วโมงนอกตาราง 0.25 / <0.25 / >744 / ไม่ใช่ตัวเลข → คำปฏิเสธกลางเดียวกับ R4.6 ทุกไบต์",
    GENERIC.length > 0 && offR.every((r) => !!r && r.status === "error" && r.message === GENERIC), GENERIC, JSON.stringify(offR.map((r) => r?.message ?? null)).slice(0, 200));
  const ON = [0.25, 0.5, 0.75, 1, 2, 7.5, 744];
  chk("OT-2", "ไม่ใช่ผู้ดูเงินเดือน: ชั่วโมงบนตาราง 0.25 ผ่านด่าน (ไปคิดยอดตามปกติ)", !!screen && ON.every((h) => screen(false, { kind: "OT", hours: h }) === null), "null ทุกค่า", JSON.stringify(ON.map((h) => screen?.(false, { kind: "OT", hours: h }) ?? "NO")), "MAJOR");
  chk("OT-3", "ผู้ดูเงินเดือน: ด่านไม่ทำอะไร (พฤติกรรมเดิม)", !!screen && [...OFF, ...ON].every((h) => screen(true, { kind: "OT", hours: h }) === null), "null", "มีค่า", "MAJOR");
  chk("OT-3b", "รายการที่ไม่ใช่ OT / OT ที่ไม่กรอกชั่วโมง: ด่านไม่ทำอะไร", !!screen && screen(false, { kind: "BONUS", hours: 0.1 }) === null && screen(false, { kind: "OT" }) === null, "null", "มีค่า", "MAJOR");
  // probe แบบผู้โจมตี (probe C): ไล่ชั่วโมงลดลง/แปลก ๆ กับพนักงานหลายอัตรา — สิ่งที่ผู้ยื่นเห็นต้องเหมือนกันทุกอัตรา (ค้นหาอัตราไม่ได้)
  const probeEmps: string[] = [];
  for (const sal of [900_000, 1_500_000, 2_000_000, 5_000_000, 20_000_000]) {
    const e = await hr.createEmployee(ctx, { name: `probe ${sal} ${ts}` });
    await pay.setSalaryProfile(ctx, { employeeId: e.id, baseSalarySatang: sal, ssoEligible: false });
    probeEmps.push(e.id);
  }
  const mkRate = async (rate: number) => {
    const e = await hr.createEmployee(ctx, { name: `probe rate${rate} ${ts}` });
    await pay.setSalaryProfile(ctx, { employeeId: e.id, baseSalarySatang: 900_000, ssoEligible: false });
    await prisma.hrSalaryProfile.updateMany({ where: { tenantId: tid, employeeId: e.id }, data: { otHourlyRateSatang: rate } }); // fixture: อัตราตั้งเอง
    return e.id;
  };
  probeEmps.push(await mkRate(2));
  const seen = async (empId: string, h: number): Promise<string> => {
    const sc = screen?.(false, { kind: "OT", hours: h });
    if (sc) return sc.message;
    try {
      const r = await pay.requestAdjustment(ctx, { employeeId: empId, periodKey: "2026-10", kind: "OT", hours: h, requestedById: U.member });
      return replyH?.(false, r, { byHours: true }).message ?? (r.ok ? "ok" : "no");
    } catch {
      return "THROW";
    }
  };
  const PROBE_H = [2, 1, 0.5, 0.25, 0.1, 0.01, 0.001, 0.0001, 0.3, 1.3, 744, 745, 1e6];
  const vectors: string[] = [];
  for (const id of probeEmps) {
    const v: string[] = [];
    for (const h of PROBE_H) v.push(await seen(id, h));
    vectors.push(JSON.stringify(v));
  }
  chk("OT-4", "🔴 probe: ไล่ชั่วโมง 13 ค่า × 6 อัตรา (เงินเดือน 9k–200k บาท + อัตราตั้งเอง 2 สตางค์/ชม.) → สิ่งที่ผู้ยื่นเห็นเหมือนกันทุกอัตรา",
    new Set(vectors).size === 1, "1 แบบ", `${new Set(vectors).size} แบบ · ${vectors.map((v) => v.slice(0, 70)).join(" | ")}`.slice(0, 400));
  const r1s = await seen(await mkRate(1), 0.25);
  const rNoSal = await seen(gW.id, 0.25);
  chk("OT-5", "อัตรา 1 สตางค์/ชม. (อัตราเดียวที่ 0.25 ชม. ปัดเป็น 0): คำปฏิเสธเหมือน 'ไม่มีเงินเดือน' ทุกไบต์ (ข้อจำกัดที่ยอมรับ — บอกได้แค่ว่าไม่มีอัตราที่ใช้ได้)",
    r1s === rNoSal && r1s === GENERIC, GENERIC, `${r1s} | ${rNoSal}`, "MINOR");
  // รอบ 5b (H5): ชั่วโมง OT สูงสุด 744 (31 วัน × 24 ชม.) สำหรับทุกคน — ผู้ดูเงินเดือนได้ข้อความเฉพาะ · ผู้ไม่ดูได้คำปฏิเสธกลางเดิม
  type ReqRes = { ok: boolean; reason?: string; amountSatang?: number };
  const otBig = async (h: number): Promise<ReqRes> =>
    pay.requestAdjustment(ctx, { employeeId: e2.id, periodKey: "2026-11", kind: "OT", hours: h, requestedById: U.hrMgr }).catch((e: unknown) => ({ ok: false, reason: `THROW ${e instanceof Error ? e.message.slice(0, 120) : String(e)}` }));
  const adjBefore = await prisma.hrPayAdjustment.count({ where: { tenantId: tid, employeeId: e2.id, periodKey: "2026-11" } });
  const o1e6 = await otBig(1e6);
  const o745 = await otBig(745);
  const adjAfter = await prisma.hrPayAdjustment.count({ where: { tenantId: tid, employeeId: e2.id, periodKey: "2026-11" } });
  chk("OT-8", "🔴 ผู้ดูเงินเดือนยื่น OT 1,000,000 ชม. / 745 ชม. → ปฏิเสธด้วยข้อความไทยที่บอกเพดาน 744 ชม. (ไม่ใช่ error ดิบของฐานข้อมูล) · ไม่มีแถวใหม่",
    [o1e6, o745].every((r) => r.ok === false && THAI.test(r.reason ?? "") && (r.reason ?? "").includes("744") && !/THROW|prisma|invocation/i.test(r.reason ?? "")) && adjAfter === adjBefore,
    "ปฏิเสธ · 744", `${JSON.stringify([o1e6, o745]).slice(0, 240)} rows ${adjBefore}→${adjAfter}`, "MAJOR");
  const vMsg = replyH?.(true, o1e6, { byHours: true });
  chk("OT-9", "ผู้ดูเงินเดือน: คำตอบบนจอ = ข้อความเฉพาะของเพดาน (ไม่ถูกแทนด้วยคำปฏิเสธกลาง)", !!vMsg && vMsg.status === "error" && vMsg.message === o1e6.reason, String(o1e6.reason), JSON.stringify(vMsg ?? null), "MAJOR");
  const nvMsg = replyH?.(false, o1e6, { byHours: true });
  chk("OT-10", "ไม่ใช่ผู้ดูเงินเดือน: เกิน 744 ชม. ที่ถึง service → คำปฏิเสธกลางเดิมทุกไบต์", !!nvMsg && nvMsg.message === GENERIC, GENERIC, JSON.stringify(nvMsg ?? null), "MAJOR");
  const o744 = await otBig(744);
  chk("OT-11", "ขอบ: 744 ชม. พอดี → ยื่นได้ (ผู้ดูเงินเดือน)", o744.ok === true, "ok", JSON.stringify(o744).slice(0, 160), "MAJOR");

  // ═══ [PA] รอบ 5b (H1): รายการเงินของ "แถวพนักงานที่ผูกกับบัญชีผู้อนุมัติเอง" — อนุมัติไม่ได้ (ยกเว้นเจ้าของร้าน) · ปฏิเสธได้ ═══
  console.log("── [PA] อนุมัติรายการเงินของตัวเอง (H1) ──");
  const SELF_ADJ_TH = "อนุมัติรายการของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นหรือเจ้าของร้านตัดสิน";
  const PA_P = "2027-03";
  const ePA = await hr.createEmployee(ctx, { name: `ผู้อนุมัติเงินเดือน ${ts}` });
  await prisma.hrEmployee.update({ where: { id: ePA.id }, data: { linkedUserId: U.hrMgr } }); // V.hrMgr = STAFF + hr.payroll.read
  await pay.setSalaryProfile(ctx, { employeeId: ePA.id, baseSalarySatang: 3_000_000, ssoEligible: false });
  const fileAdj = async (employeeId: string, amountSatang: number) =>
    (await pay.requestAdjustment(ctx, { employeeId, periodKey: PA_P, kind: "BONUS", amountSatang, requestedById: U.manager })).id ?? "-";
  const adjRow = (id: string) => prisma.hrPayAdjustment.findUnique({ where: { id } });
  const payApprover = { userId: U.hrMgr, isOwner: false };
  const decAdj = async (id: string, st: "APPROVED" | "REJECTED", d: { userId?: string | null; isOwner: boolean }): Promise<ReqRes> =>
    pay.decideAdjustment(ctx, id, st, d).catch((e: unknown) => ({ ok: false, reason: `THROW ${e instanceof Error ? e.message.slice(0, 120) : String(e)}` }));
  const aOwn = await fileAdj(ePA.id, 5_000_000);
  const dOwn = await decAdj(aOwn, "APPROVED", payApprover);
  const rOwn = await adjRow(aOwn);
  chk("PA-1", "🔴 ผู้อนุมัติเงินเดือน (STAFF + hr.payroll.read · ผูกกับแถวพนักงานของตัวเอง) อนุมัติโบนัส 50,000 บาทที่ผู้จัดการยื่นให้แถวของตัวเองไม่ได้ — คง PENDING · ไม่มีผู้ตัดสิน",
    dOwn.ok === false && rOwn?.status === "PENDING" && rOwn.decidedById === null, "ปฏิเสธ · PENDING", `${JSON.stringify(dOwn)} row=${rOwn?.status}/${rOwn?.decidedById}`);
  chk("PA-1b", `เหตุผล = '${SELF_ADJ_TH}'`, dOwn.reason === SELF_ADJ_TH, SELF_ADJ_TH, String(dOwn.reason), "MAJOR");
  const aCol = await fileAdj(e2.id, 100_000);
  const dCol = await decAdj(aCol, "APPROVED", payApprover);
  chk("PA-2", "ผู้อนุมัติคนเดิม × รายการของเพื่อนร่วมงาน → อนุมัติได้ตามปกติ", dCol.ok === true && (await adjRow(aCol))?.status === "APPROVED", "APPROVED", `${JSON.stringify(dCol)} ${(await adjRow(aCol))?.status}`, "MAJOR");
  const aOw = await fileAdj(eOw.id, 200_000);
  const dOw = await decAdj(aOw, "APPROVED", { userId: U.owner, isOwner: true });
  chk("PA-3", "เจ้าของร้าน × แถวพนักงานของตัวเอง (ผู้จัดการยื่น) → อนุมัติได้ (ข้อยกเว้นเจ้าของร้าน)", dOw.ok === true && (await adjRow(aOw))?.status === "APPROVED", "APPROVED", `${JSON.stringify(dOw)} ${(await adjRow(aOw))?.status}`, "MAJOR");
  // หลายรายการในครั้งเดียว: src ยังไม่มีปุ่มหลายรายการของรายการเงิน ⇒ วนผ่าน service แบบเดียวกับที่ทางหลายรายการจะทำ
  const aB1 = await fileAdj(ePA.id, 300_000);
  const aB2 = await fileAdj(e2.id, 400_000);
  const bRes: ReqRes[] = [];
  for (const id of [aB1, aB2]) bRes.push(await decAdj(id, "APPROVED", payApprover));
  chk("PA-4", "🔴 หลายรายการ (ของตัวเอง + ของคนอื่น) → ของตัวเองถูกปฏิเสธ (เหตุผลเดียวกัน · คง PENDING) · ของคนอื่นอนุมัติได้",
    bRes[0]?.ok === false && bRes[0]?.reason === SELF_ADJ_TH && (await adjRow(aB1))?.status === "PENDING" && bRes[1]?.ok === true && (await adjRow(aB2))?.status === "APPROVED",
    "ของตัวเองปฏิเสธ · ของคนอื่น APPROVED", `${JSON.stringify(bRes)} own=${(await adjRow(aB1))?.status} other=${(await adjRow(aB2))?.status}`);
  const dRej = await decAdj(aB1, "REJECTED", payApprover);
  chk("PA-5", "ปฏิเสธรายการของตัวเองได้ (ไม่มีใครเสียประโยชน์) → REJECTED · ผู้ตัดสินถูกบันทึก",
    dRej.ok === true && (await adjRow(aB1))?.status === "REJECTED" && (await adjRow(aB1))?.decidedById === U.hrMgr, "REJECTED", `${JSON.stringify(dRej)} ${(await adjRow(aB1))?.status}`, "MAJOR");
  const aNo = await fileAdj(e2.id, 500_000);
  const dNo = await decAdj(aNo, "APPROVED", { userId: null, isOwner: false });
  chk("PA-6", "🔴 ไม่รู้ตัวผู้อนุมัติ (userId ว่าง) และไม่ใช่เจ้าของร้าน → อนุมัติไม่ได้ (ตรวจ 'ของตัวเอง' ไม่ได้ = ปิดไว้ก่อน) · คง PENDING",
    dNo.ok === false && THAI.test(dNo.reason ?? "") && (await adjRow(aNo))?.status === "PENDING", "ปฏิเสธ", `${JSON.stringify(dNo)} ${(await adjRow(aNo))?.status}`, "MAJOR");
  const runPA = await pay.createPayrollRun(ctx, { periodKey: PA_P, payDate: new Date("2027-03-31") }).catch(() => null);
  const itPA = runPA ? await prisma.hrPayrollItem.findFirst({ where: { runId: runPA.id, employeeId: ePA.id } }) : null;
  const itCol = runPA ? await prisma.hrPayrollItem.findFirst({ where: { runId: runPA.id, employeeId: e2.id } }) : null;
  chk("PA-7", "🔴 รอบจ่ายของงวด: แถวเงินเดือนของผู้อนุมัติไม่มีโบนัสที่ตัวเองอนุมัติ (add 0 · โบนัส 50,000 บาทไม่ไหลเข้า) · ของเพื่อนร่วมงานไหลเข้าตามที่อนุมัติ",
    !!itPA && itPA.addSatang === 0 && (await adjRow(aOwn))?.runId === null && !!itCol && itCol.addSatang >= 500_000,
    "ผู้อนุมัติ add 0 · เพื่อน add ≥ 5,000 บาท", `run=${!!runPA} own.add=${itPA?.addSatang} col.add=${itCol?.addSatang} ownRun=${(await adjRow(aOwn))?.runId}`);

  // ═══ [CH] รอบ 5b (H2): ใบลาที่มีคำขอในสายอนุมัติ (รอ/อนุมัติ/ปฏิเสธ) — สายเป็นเจ้าของการตัดสิน ทางตรงตัดสินไม่ได้ ═══
  console.log("── [CH] ทางตรง vs สายอนุมัติ (H2) ──");
  const polCH = await ap.createPolicy(apCtx, { name: "ใบลา 5b", entityType: "HrLeave", steps: [{ order: 1, approverRole: "OWNER" }] });
  const ch1 = await mkLeave(e2.id, "2027-02-01");
  const rCh1 = await reqOf(ch1);
  // fixture: ช่องเวลาระหว่าง "สายตัดสินแล้ว" กับ "effect เขียนใบลา" — คำขอ REJECTED · ใบลายัง PENDING
  await prisma.approvalRequest.update({ where: { id: rCh1 }, data: { status: "REJECTED", decidedAt: new Date() } });
  const eCh1 = await errMsg(() => hr.decideLeave(ctx, ch1, "APPROVED", U.owner, { from: "PENDING" }));
  chk("CH-1", "🔴 สายปฏิเสธแล้ว (effect ยังไม่เขียน) + ทางตรงอนุมัติ → ปฏิเสธ · ใบลาคง PENDING", eCh1 !== null && (await statusOf(ch1)) === "PENDING", "ปฏิเสธ · PENDING", `${await statusOf(ch1)} err=${eCh1}`);
  chk("CH-1b", "ข้อความไทยชี้ไปหน้า “อนุมัติ”", !!eCh1 && THAI.test(eCh1) && eCh1.includes("“อนุมัติ”"), "ชี้หน้าอนุมัติ", String(eCh1), "MAJOR");
  await effects.applyApprovalEffect({ tenantId: tid, type: "approval.request.rejected", payload: { requestId: rCh1, entityType: "HrLeave", entityId: ch1 } });
  chk("CH-1c", "effect ของสายมาทีหลัง → ใบลา = ผลของสาย (REJECTED) ไม่ขัดกัน", (await statusOf(ch1)) === "REJECTED", "REJECTED", String(await statusOf(ch1)), "MAJOR");
  const ch2 = await mkLeave(e2.id, "2027-02-02");
  const rCh2 = await reqOf(ch2);
  await prisma.approvalRequest.update({ where: { id: rCh2 }, data: { status: "APPROVED", decidedAt: new Date() } });
  const eCh2 = await errMsg(() => hr.decideLeave(ctx, ch2, "REJECTED", U.owner, { from: "PENDING" }));
  chk("CH-2", "🔴 สายอนุมัติแล้ว (effect ยังไม่เขียน) + ทางตรงปฏิเสธ → ปฏิเสธ · ใบลาคง PENDING", eCh2 !== null && THAI.test(eCh2) && (await statusOf(ch2)) === "PENDING", "ปฏิเสธ · PENDING", `${await statusOf(ch2)} err=${eCh2}`);
  const ch3 = await mkLeave(e2.id, "2027-02-03");
  await prisma.approvalRequest.update({ where: { id: await reqOf(ch3) }, data: { status: "REJECTED", decidedAt: new Date() } });
  const bCh = await hr.bulkDecideLeave(ctx, [ch3], "APPROVED", U.owner, { from: "PENDING" });
  chk("CH-3", "🔴 ทางหลายใบ (bulk) ก็ตัดสินใบที่สายตัดสินแล้วไม่ได้ (failed + เหตุผลไทย · คง PENDING)",
    bCh.done === 0 && bCh.failed.length === 1 && THAI.test(bCh.failed[0]?.reason ?? "") && (await statusOf(ch3)) === "PENDING", "done 0", `${JSON.stringify(bCh)} ${await statusOf(ch3)}`);
  const ch4 = await mkLeave(e2.id, "2027-02-04");
  const cancelled = await ap.cancelRequest(apCtx, await reqOf(ch4));
  const eCh4 = await errMsg(() => hr.decideLeave(ctx, ch4, "APPROVED", U.owner, { from: "PENDING" }));
  chk("CH-4", "คำขอที่ถูกยกเลิก (CANCELLED — สายจะไม่ตัดสิน/ไม่เขียนใบลาอีก) → ปล่อยให้ทางตรงตัดสินได้ (ไม่ค้างถาวร)",
    cancelled === true && eCh4 === null && (await statusOf(ch4)) === "APPROVED", "APPROVED", `cancel=${cancelled} ${await statusOf(ch4)} err=${eCh4}`, "MAJOR");
  await ap.setPolicyActive(apCtx, polCH.id, false);
  const ch5 = await mkLeave(e2.id, "2027-02-05");
  const eCh5 = await errMsg(() => hr.decideLeave(ctx, ch5, "APPROVED", U.owner, { from: "PENDING" }));
  chk("CH-5", "ใบลาที่ไม่มีคำขอในสายอนุมัติ → ทางตรงทำงานเหมือนเดิม", eCh5 === null && (await statusOf(ch5)) === "APPROVED" && (await reqOf(ch5)) === "-", "APPROVED", `${await statusOf(ch5)} req=${await reqOf(ch5)} err=${eCh5}`, "MAJOR");

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
      "outboxEvent", "appNotification", "webhookDelivery", "auditLog", "aiProposal", "aiPlan", "aiConversation", "membership", "appSystemUnit", "appSystem",
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
// ── รอบ 4 ──
const hrDecideBlock = propSrc.slice(propSrc.indexOf('if (kind === "hr_decide_leave")'), propSrc.indexOf('if (kind === "marketing_create_campaign")'));
const guardAt = hrDecideBlock.search(/if \(!userId\)\s*throw new Error\(/);
chk("S-13", "proposals: hr_decide_leave ไม่มี userId → throw ก่อนเรียก decideLeave (R4.1a)", guardAt >= 0 && guardAt < hrDecideBlock.indexOf("hrSvc.decideLeave("), "ใช่", "ไม่ใช่");
// ทุกจุดใน src ที่เรียก decideLeave/bulkDecideLeave ต้องส่งช่องผู้ตัดสิน (อาร์กิวเมนต์ที่ 4) และไม่ใช่ null/undefined ตรง ๆ
const srcFiles = spawnSync("git", ["ls-files", "src"], { encoding: "utf8" }).stdout.split("\n").filter((f) => /\.(ts|tsx)$/.test(f));
const badCalls: string[] = [];
let callCount = 0;
for (const f of srcFiles) {
  const txt = rd(f);
  for (const m of txt.matchAll(/(?<!function )\b(?:hrSvc\.|hr\.)?(bulkDecideLeave|decideLeave)\(([^;]*?)\);/g)) {
    callCount++;
    const args = m[2]!.split(/,(?![^{]*\})/).map((a) => a.trim());
    if (args.length < 4 || /^(null|undefined)$/.test(args[3]!)) badCalls.push(`${f}: ${m[0].slice(0, 90)}`);
  }
}
chk("S-14", "ทุกจุดใน src ที่ตัดสินใบลาส่งผู้ตัดสินจริง (ไม่มีจุดที่ละไว้/ส่ง null ตรง ๆ)", callCount >= 3 && badCalls.length === 0, "0 จุด", `${callCount} calls · ${JSON.stringify(badCalls)}`);
chk("S-15", "requestAdjustmentAction บอกว่าเป็น OT ตามชั่วโมง (byHours) ให้ตัวสร้างคำตอบ", /adjustmentReplyForViewer\(.*\{ byHours: kind === "OT" && hours !== undefined \}\)/.test(payActSrc), "ใช่", "ไม่ใช่");
const staffSrc = rd("src/lib/staff/service.ts");
const grantBody = staffSrc.slice(staffSrc.indexOf("export async function grantStaffAccess"), staffSrc.indexOf("export type UpdateStaffAccessInput"));
chk("S-16", "grantStaffAccess ผูกด้วย updateMany ที่มีเงื่อนไข linkedUserId (null หรือบัญชีเดิม) + ตรวจ count === 1",
  /hrEmployee\.updateMany\(\{\s*where: \{[^}]*linkedUserId/.test(grantBody) && /\.count !== 1/.test(grantBody), "ใช่", "ไม่ใช่");
// ── รอบ 5 ──
const reqActBody = payActSrc.slice(payActSrc.indexOf("export async function requestAdjustmentAction"), payActSrc.indexOf("export async function decideAdjustmentAction"));
const scrAt = reqActBody.indexOf("screenOtHoursForViewer(");
chk("OT-6", "requestAdjustmentAction เรียกด่านชั่วโมง OT ก่อนตรวจรูปแบบชั่วโมงและก่อน requestAdjustment (ก่อนอ่านอะไรที่ขึ้นกับเงินเดือน)",
  scrAt >= 0 && scrAt < reqActBody.indexOf("!Number.isFinite(hours)") && scrAt < reqActBody.indexOf("await requestAdjustment("), "ใช่", "ไม่ใช่");
const payForm = rd("src/lib/modules/hr/PayAdjustForm.tsx");
const hoursInput = /<input name="hours"[^>]*>/.exec(payForm)?.[0] ?? "";
// รอบ 5b (H4) — ORACLE-EDIT (แจ้งผู้คุมงาน): ข้อเดิม "step 0.25 · min 0.25" บล็อกค่าที่ server รับจากผู้ดูเงินเดือน (0.1 / 1.3 ชม.) ⇒ เปลี่ยนเป็นข้อนี้
chk("OT-7", "ฟอร์ม OT: ช่องชั่วโมง step any · min 0 · max 744 (ไม่บล็อกค่าที่ server รับจากผู้ดูเงินเดือน — กติกาจริงอยู่ฝั่ง server) + คำแนะนำ 'กรอกทีละ 0.25 ชม.'",
  /type="number"/.test(hoursInput) && /step="any"/.test(hoursInput) && /min="0"/.test(hoursInput) && /max="744"/.test(hoursInput) && payForm.includes("กรอกทีละ 0.25 ชม."), "มี", hoursInput, "MINOR");
const apSrc = rd("src/lib/modules/approval/service.ts");
const apDecideBody = apSrc.slice(apSrc.indexOf("export async function decide("), apSrc.indexOf("// ── ตัดสินหลายใบพร้อมกัน"));
const ownAt = apDecideBody.indexOf("isOwnHrSubject(");
chk("S-17", "approval.decide ตรวจ 'คำขอของตัวเอง' ก่อนเปิดธุรกรรมเขียนการตัดสิน (ไม่ใช่ใน effect)", ownAt >= 0 && ownAt < apDecideBody.indexOf("prisma.$transaction("), "ใช่", "ไม่ใช่");
const adBlock = propSrc.slice(propSrc.indexOf('if (kind === "approval_decide")'), propSrc.indexOf('if (kind === "inventory_consume")'));
const adGuard = adBlock.search(/if \(!uid\)\s*throw new Error\(/);
chk("S-18", "proposals approval_decide: ไม่รู้ตัวผู้กดยืนยัน → throw ไทยก่อนค้น/เขียน · ส่ง userId ของผู้กดยืนยันให้ decide (ไม่ cast แบบเดาเอา)",
  adGuard >= 0 && adGuard < adBlock.indexOf("approvalRequest.findMany") && adGuard < adBlock.indexOf("approvalSvc.decide(") && !/m as MembershipCtx & \{ userId: string \}/.test(adBlock), "ใช่", "ไม่ใช่");
const lockAt = grantBody.search(/pg_advisory_xact_lock\(hashtextextended\(\$\{`staff-link:\$\{input\.tenantId\}:\$\{user\.id\}`\}, 0\)\)/);
chk("S-19", "grantStaffAccess: ล็อก advisory ต่อ (ร้าน, บัญชี) ก่อนตรวจ 'บัญชีนี้ผูกกับพนักงานอื่นแล้ว' · ยังมีด่านแถว R4.3",
  lockAt >= 0 && lockAt < grantBody.indexOf("const otherLink") && /\.count !== 1/.test(grantBody), "ใช่", "ไม่ใช่", "MAJOR");
// ── รอบ 5b ──
// H1: ทุกทางที่อนุมัติรายการเงินผ่าน decideAdjustment (จุดเรียกเดียวใน src = decideAdjustmentAction ส่งผู้ใช้จริง + isOwner จากบทบาท) ·
//     ไม่มีไฟล์อื่นนอก payroll.ts เขียนแถว HrPayAdjustment ตรง (จะข้ามด่านได้)
const decAdjCalls: string[] = [];
const adjWriters: string[] = [];
for (const f of srcFiles) {
  const txt = rd(f);
  for (const m of txt.matchAll(/(?<!function )\bdecideAdjustment\(([^;]*?)\);/g)) decAdjCalls.push(`${f}: ${m[0].replace(/\s+/g, " ").slice(0, 160)}`);
  if (f !== "src/lib/modules/hr/payroll.ts" && /hrPayAdjustment\.(update|updateMany|upsert|create|createMany|createManyAndReturn)\(/.test(txt)) adjWriters.push(f);
}
chk("S-20", "อนุมัติรายการเงินมีทางเดียว: decideAdjustment ถูกเรียกใน src จุดเดียว (decideAdjustmentAction · userId = ผู้ใช้ใน session · isOwner = บทบาท OWNER) · ไม่มีไฟล์อื่นเขียนแถวรายการเงินตรง",
  decAdjCalls.length === 1 && decAdjCalls[0]!.startsWith("src/lib/modules/hr/payroll-actions.ts") && /userId: auth\.active\.userId/.test(decAdjCalls[0]!) && /isOwner: auth\.active\.role === "OWNER"/.test(decAdjCalls[0]!) && adjWriters.length === 0,
  "1 จุด · 0 ไฟล์", JSON.stringify({ decAdjCalls, adjWriters }), "MAJOR");
// H3: ปุ่มตัดสินรายใบคืนเหตุผลเป็นข้อมูล · หน้า “อนุมัติ” แสดงเหตุผลที่แถวของคำขอนั้น · ไฟล์ "use server" export แค่ async function (+ type เดิม)
const apActSrc = rd("src/lib/modules/approval/actions.ts");
const decActBody2 = apActSrc.slice(apActSrc.indexOf("export async function decideAction("), apActSrc.indexOf("export type BulkDecideState"));
chk("UI-1", "decideAction (ตัดสินรายใบ) คืนผลเป็นข้อมูล { ok, reason } — ไม่ใช่ void · ไม่ throw เหตุผลที่ปฏิเสธ",
  decActBody2.length > 0 && !/Promise<void>/.test(decActBody2) && /Promise<\{ ok: boolean; reason\?: string \}>/.test(decActBody2) && /reason/.test(decActBody2.slice(decActBody2.indexOf("{"))) && !/\bthrow\b/.test(decActBody2),
  "คืนข้อมูล", decActBody2.slice(0, 160), "MAJOR");
const bulkUi = rd("src/app/app/approvals/BulkApprovals.tsx");
const rowAt = bulkUi.indexOf("{items.map((i) =>");
const rowBlock = rowAt >= 0 ? bulkUi.slice(rowAt, bulkUi.indexOf("</label>", rowAt)) : "";
chk("UI-2", "หน้า “อนุมัติ”: เหตุผลที่ถูกปฏิเสธแสดงในแถวของคำขอนั้น (อ่าน reason จากผลตามรหัสแถว) — รายใบ (เลือก 1) และหลายใบ",
  /const refusedOf = \(id: string\) =>[^\n]*state\.failed[^\n]*\.reason/.test(bulkUi) && /refusedOf\(i\.id\)/.test(rowBlock),
  "มี", rowBlock.slice(0, 120), "MAJOR");
const useServerExports = (src: string) => [...src.matchAll(/^export\s+(?!async function\b|type\b)(\S+\s+\S+)/gm)].map((m) => m[1]);
const bulkImports = [...bulkUi.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
chk("UI-3", "approval/actions.ts + hr/payroll-actions.ts (\"use server\") export แค่ async function/type · BulkApprovals (\"use client\") import แค่ react + server actions",
  /^"use server";/.test(apActSrc) && useServerExports(apActSrc).length === 0 && useServerExports(payActSrc).length === 0 && /^"use client";/.test(bulkUi) && JSON.stringify(bulkImports) === JSON.stringify(["@/lib/modules/approval/actions", "react"]),
  "สะอาด", JSON.stringify({ ap: useServerExports(apActSrc), pay: useServerExports(payActSrc), bulkImports }), "MAJOR");
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

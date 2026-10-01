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
// [D]  D10 ตัดสินใบลา: PENDING → APPROVED/REJECTED เท่านั้น (updateMany มีเงื่อนไข · แข่งกันกดได้ผลเดียว) ·
//      ผู้ตัดสินต้องไม่ใช่เจ้าของใบลา · ใบลาที่อยู่ในสายอนุมัติ (ApprovalRequest PENDING) ห้ามตัดสินทางตรง
// [S]  static: หน้าเพจ/ส่วนจอใช้ตัวโหลดด้านบนจริง และไม่มี client component ได้แถวดิบ
//
// รัน (POS lane): bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hf-hr-privacy.mts
import { readFileSync } from "node:fs";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-hf-hr-privacy"); // 🔴 กัน prod

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const hr = await import("@/lib/modules/hr/service");
const pay = await import("@/lib/modules/hr/payroll");
const ap = await import("@/lib/modules/approval/service");
const tools = await import("@/lib/ai/tools");
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
};
const privacyPath = "@/lib/modules/hr/privacy";
const priv = (await import(privacyPath as string).catch(() => null)) as PrivacyMod | null;
const shared = (await import("@/lib/modules/hr/privacy-shared" as string).catch(() => null)) as {
  EMPLOYEE_PROFILE_FIELDS?: readonly string[];
  EMPLOYEE_SENSITIVE_FIELDS?: readonly string[];
} | null;

type Ctx = { tenantId: string; systemId: string };
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
  const e02 = await errMsg(() => hr.decideLeave(ctx, l1, "REJECTED", U.owner));
  chk("D-2", "🔴 ใบลาที่อนุมัติแล้ว ห้ามพลิกเป็นไม่อนุมัติ (สถานะคงเดิม)", (await statusOf(l1)) === "APPROVED" && e02 !== null, "ปฏิเสธ + คง APPROVED", `${await statusOf(l1)} err=${e02}`);
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
  const l4 = await mkLeave(e2.id, "2026-09-14");
  const e04c = await errMsg(() => hr.decideLeave(ctx, l4, "REJECTED", null));
  chk("D-4c", "ทางที่ไม่มีผู้ตัดสิน (ข้อเสนอ AI · decidedById null) ยังตัดสิน PENDING ได้", e04c === null && (await statusOf(l4)) === "REJECTED", "REJECTED", `${await statusOf(l4)} ${e04c ?? ""}`, "MAJOR");

  // แข่งกันกด 2 ทางพร้อมกัน (คนละ connection ของ pool) — ต้องมีผลเดียว ×3 รอบ
  let raceOk = 0;
  const raceLog: string[] = [];
  for (let i = 0; i < 3; i++) {
    const lr = await mkLeave(e2.id, `2026-09-${15 + i}`);
    const [a, b] = await Promise.allSettled([
      hr.decideLeave(ctx, lr, "APPROVED", U.owner),
      hr.decideLeave(ctx, lr, "REJECTED", U.hrStaff),
    ]);
    const wins = [a, b].filter((x) => x.status === "fulfilled").length;
    const st = await statusOf(lr);
    const expect = a.status === "fulfilled" ? "APPROVED" : "REJECTED";
    raceLog.push(`${wins}:${st}`);
    if (wins === 1 && st === expect) raceOk++;
  }
  chk("D-5", "🔴 ตัดสินพร้อมกัน 2 ทาง → สำเร็จทางเดียว และสถานะตรงกับผู้ชนะ (3/3 รอบ)", raceOk === 3, "3/3", raceLog.join(" "));

  // bulk: ใบที่ตัดสินแล้ว = failed พร้อมเหตุผลไทย · ใบที่รอ = done
  const l5 = await mkLeave(e2.id, "2026-09-20");
  const bulk = await hr.bulkDecideLeave(ctx, [l1, l5], "REJECTED", U.owner);
  chk("D-6", "bulk: ใบที่ตัดสินไปแล้วไม่ถูกพลิก (done 1 · failed 1) + เหตุผลไทย", bulk.done === 1 && bulk.failed.length === 1 && bulk.failed[0]?.id === l1 && THAI.test(bulk.failed[0]?.reason ?? "") && (await statusOf(l1)) === "APPROVED" && (await statusOf(l5)) === "REJECTED", "done1/failed1", JSON.stringify(bulk));
  const e07 = await errMsg(() => hr.decideLeave({ tenantId: otherTid, systemId: hrSys.id }, l5, "APPROVED", U.other));
  chk("D-7", "ร้านอื่นตัดสินใบลาของร้านนี้ไม่ได้", e07 !== null && (await statusOf(l5)) === "REJECTED", "ปฏิเสธ", `${await statusOf(l5)} err=${e07}`);

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
  await ap.setPolicyActive({ tenantId: tid }, pol.id, false);
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
      "outboxEvent", "appNotification", "webhookDelivery", "auditLog", "appSystemUnit", "appSystem",
    ]) await del(m, () => M[m]!.deleteMany({ where: { tenantId: id } }));
    await del("party", () => M["party"]!.deleteMany({ where: { tenantId: id } }));
    await del("tenant", () => prisma.tenant.delete({ where: { id } }));
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
const slipPage = rd("src/app/app/sys/[id]/payroll/[runId]/slip/[employeeId]/page.tsx");
chk("S-1", "หน้าสลิปเรียก loadPayslipForViewer และไม่เรียก payslipData ตรง", /loadPayslipForViewer\(/.test(slipPage) && !/payslipData\(/.test(slipPage), "ใช่", "ไม่ใช่");
const profPage = rd("src/app/app/sys/[id]/hr/employees/[employeeId]/page.tsx");
chk("S-2", "หน้าโปรไฟล์เรียก loadEmployeeProfileForViewer · ไม่เรียก getEmployee ตรง · ไม่ส่ง emp={emp} (แถวดิบ) ให้ฟอร์ม",
  /loadEmployeeProfileForViewer\(/.test(profPage) && !/getEmployee\(/.test(profPage) && !/emp=\{emp\}/.test(profPage), "ใช่", "ไม่ใช่");
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

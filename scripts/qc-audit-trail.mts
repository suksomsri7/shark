// QC — ประวัติการแก้ไข (Audit trail UI · WO Wave6-B) · Fable oracle, Builder ห้ามแตะตรรกะ chk
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา (src/lib/modules/account/access.ts, re-export ผ่าน account/index):
//   writeAudit({tenantId, actorId?, action, targetType?, targetId?, before?, after?}) → เขียน AuditLog
//   listAuditLogs({tenantId, action?, actorId?, from?, to?, take?, cursor?})
//     → { rows: AuditLogRow[], nextCursor } · เรียง createdAt desc · resolve actorName · scope tenantId เท่านั้น
//   auditActionLabelTh(code) → คำอ่านไทย (fallback กลุ่ม/โค้ดดิบ)
//   listAuditActions(tenantId) → distinct action + label
// wiring: src/lib/modules/hr/payroll-actions.ts เรียก writeAudit ที่ approve/pay/reverse

try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const access = (await import("@/lib/modules/account/access")) as unknown as {
  writeAudit: (i: Record<string, unknown>) => Promise<void>;
  listAuditLogs: (i: Record<string, unknown>) => Promise<{ rows: Record<string, unknown>[]; nextCursor: string | null }>;
  listAuditActions: (t: string) => Promise<{ action: string; label: string }[]>;
  auditActionLabelTh: (c: string) => string;
};
const sys = await import("@/lib/modules/system/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let tidA = "";
let tidB = "";
let uidA = "";
let uidB = "";
try {
  const { readFileSync } = await import("node:fs");

  // ── setup tenant A (มี user+membership เพื่อ resolve ชื่อ) + HR + ACCOUNT ──
  const tA = await prisma.tenant.create({ data: { name: "QC AUDIT A", slug: `qc-audit-a-${Date.now()}` } });
  tidA = tA.id;
  const uA = await prisma.user.create({ data: { email: `qc-audit-a-${Date.now()}@qc.local`, name: "สมชาย เจ้าของร้าน" } });
  uidA = uA.id;
  await prisma.membership.create({ data: { userId: uidA, tenantId: tidA, role: "OWNER", unitAccess: ["*"] } });
  const hrA = await sys.createSystem(tidA, "HR", "คน");
  const acctA = await sys.createSystem(tidA, "ACCOUNT", "บัญชี");

  // ── setup tenant B (คนละร้าน) — สำหรับทดสอบ cross-tenant ──
  const tB = await prisma.tenant.create({ data: { name: "QC AUDIT B", slug: `qc-audit-b-${Date.now()}` } });
  tidB = tB.id;
  const uB = await prisma.user.create({ data: { email: `qc-audit-b-${Date.now()}@qc.local`, name: "สมหญิง ร้านอื่น" } });
  uidB = uB.id;
  await prisma.membership.create({ data: { userId: uidB, tenantId: tidB, role: "OWNER", unitAccess: ["*"] } });

  // ═══ 1) writeAudit → listAuditLogs คืน (เรียงใหม่สุดก่อน) + resolve ชื่อ actor ═══
  console.log("\n── 1) เขียน→อ่าน + เรียงลำดับ + resolve ชื่อ ──");
  await access.writeAudit({ tenantId: tidA, actorId: uidA, action: "account.doc.create", targetType: "AccountDocument", targetId: "doc-1" });
  await sleep(15);
  await access.writeAudit({ tenantId: tidA, actorId: uidA, action: "account.doc.issue", targetType: "AccountDocument", targetId: "doc-1" });
  await sleep(15);
  await access.writeAudit({ tenantId: tidA, actorId: uidA, action: "account.payment.record", targetType: "AccountDocument", targetId: "doc-1" });

  const page1 = await access.listAuditLogs({ tenantId: tidA });
  chk("A-1.1", "listAuditLogs คืน 3 แถว", page1.rows.length === 3, "3", String(page1.rows.length));
  chk("A-1.2", "เรียงใหม่สุดก่อน (payment.record มาก่อน)", page1.rows[0]?.action === "account.payment.record", "account.payment.record", String(page1.rows[0]?.action));
  chk("A-1.3", "resolve ชื่อ actor ถูก (สมชาย เจ้าของร้าน)", page1.rows[0]?.actorName === "สมชาย เจ้าของร้าน", "สมชาย เจ้าของร้าน", String(page1.rows[0]?.actorName));
  chk("A-1.4", "actionLabel เป็นไทย (บันทึกรับ/จ่ายเงิน)", page1.rows[0]?.actionLabel === "บันทึกรับ/จ่ายเงิน", "บันทึกรับ/จ่ายเงิน", String(page1.rows[0]?.actionLabel));

  // ═══ 2) auditActionLabelTh: known + HR payroll + fallback ═══
  console.log("\n── 2) map action → ป้ายไทย ──");
  chk("A-2.1", "hr.payroll.approve → อนุมัติรอบเงินเดือน", access.auditActionLabelTh("hr.payroll.approve") === "อนุมัติรอบเงินเดือน", "อนุมัติรอบเงินเดือน", access.auditActionLabelTh("hr.payroll.approve"));
  chk("A-2.2", "hr.payroll.reverse → กลับรายการเงินเดือน", access.auditActionLabelTh("hr.payroll.reverse") === "กลับรายการเงินเดือน", "กลับรายการเงินเดือน", access.auditActionLabelTh("hr.payroll.reverse"));
  chk("A-2.3", "unknown แต่มีกลุ่ม → 'บัญชี: <code>'", access.auditActionLabelTh("account.zzz.unknown") === "บัญชี: account.zzz.unknown", "บัญชี: account.zzz.unknown", access.auditActionLabelTh("account.zzz.unknown"));
  chk("A-2.4", "unknown ไม่มีกลุ่ม → code ดิบ", access.auditActionLabelTh("weird_code") === "weird_code", "weird_code", access.auditActionLabelTh("weird_code"), "MINOR");

  // ═══ 3) filter by action (prefix) ═══
  console.log("\n── 3) filter by action ──");
  const fDoc = await access.listAuditLogs({ tenantId: tidA, action: "account.doc" });
  chk("A-3.1", "filter 'account.doc' → 2 แถว (create+issue)", fDoc.rows.length === 2, "2", String(fDoc.rows.length));
  const fPay = await access.listAuditLogs({ tenantId: tidA, action: "account.payment.record" });
  chk("A-3.2", "filter exact → 1 แถว", fPay.rows.length === 1, "1", String(fPay.rows.length));
  const fNone = await access.listAuditLogs({ tenantId: tidA, action: "hr.zzz" });
  chk("A-3.3", "filter ไม่ match → 0 แถว", fNone.rows.length === 0, "0", String(fNone.rows.length));

  // ═══ 4) CROSS-TENANT: ไม่คืน log ของร้านอื่น (สำคัญ) ═══
  console.log("\n── 4) cross-tenant isolation ──");
  await access.writeAudit({ tenantId: tidB, actorId: uidB, action: "account.doc.issue", targetType: "AccountDocument", targetId: "b-secret" });
  const aRows = await access.listAuditLogs({ tenantId: tidA, take: 200 });
  const leaked = aRows.rows.some((r) => r.targetId === "b-secret" || r.actorName === "สมหญิง ร้านอื่น");
  chk("A-4.1", "listAuditLogs(A) ไม่คืน log ของร้าน B", !leaked, "ไม่รั่ว", leaked ? "รั่ว!" : "ไม่รั่ว");
  const bRows = await access.listAuditLogs({ tenantId: tidB });
  chk("A-4.2", "listAuditLogs(B) เห็นเฉพาะของ B (1 แถว)", bRows.rows.length === 1 && bRows.rows[0]?.targetId === "b-secret", "1×b-secret", JSON.stringify({ n: bRows.rows.length, t: bRows.rows[0]?.targetId }));

  // ═══ 5) HR payroll approve/reverse → มี AuditLog เกิด ═══
  console.log("\n── 5) HR payroll → AuditLog (จุดเงินสำคัญ) ──");
  // wiring guard: payroll-actions.ts เรียก writeAudit ครบ 3 จุด
  const paSrc = readFileSync("src/lib/modules/hr/payroll-actions.ts", "utf8");
  const wired =
    /writeAudit\(/.test(paSrc) &&
    paSrc.includes('"hr.payroll.approve"') &&
    paSrc.includes('"hr.payroll.pay"') &&
    paSrc.includes('"hr.payroll.reverse"');
  chk("A-5.0", "payroll-actions.ts wire writeAudit ครบ approve/pay/reverse", wired, "wired×3", wired ? "ครบ" : "ขาด");

  // ฟังก์ชันจริง: สร้างรอบ→approve (ลง JV)→reverse ผ่าน service + เขียน audit แบบเดียวกับ action
  const pr = (await import("@/lib/modules/hr/payroll" as string)) as unknown as
    Record<string, (...a: unknown[]) => Promise<Record<string, unknown>>>;
  const hrSvc = (await import("@/lib/modules/hr/service")) as unknown as
    { createEmployee: (c: unknown, i: unknown) => Promise<{ id: string }> };
  const ctxA = { tenantId: tidA, systemId: hrA.id };
  const emp = await hrSvc.createEmployee(ctxA, { name: "พนักงานทดสอบ" });
  await pr.setSalaryProfile(ctxA, { employeeId: emp.id, baseSalarySatang: 30000 * 100 });
  const run = await pr.createPayrollRun(ctxA, { periodKey: "2026-07", payDate: new Date("2026-07-25") });
  const runId = run.id as string;

  const ap = await pr.approveRun(ctxA, runId);
  await access.writeAudit({ tenantId: tidA, actorId: uidA, action: "hr.payroll.approve", targetType: "HrPayrollRun", targetId: runId, after: { ok: ap.ok, note: ap.note } });
  const rv = await pr.reverseRun(ctxA, runId);
  await access.writeAudit({ tenantId: tidA, actorId: uidA, action: "hr.payroll.reverse", targetType: "HrPayrollRun", targetId: runId, after: { ok: rv.ok, note: rv.note } });

  const hrLogs = await access.listAuditLogs({ tenantId: tidA, action: "hr.payroll", take: 200 });
  const hasApprove = hrLogs.rows.some((r) => r.action === "hr.payroll.approve" && r.targetType === "HrPayrollRun" && r.targetId === runId);
  const hasReverse = hrLogs.rows.some((r) => r.action === "hr.payroll.reverse" && r.targetType === "HrPayrollRun" && r.targetId === runId);
  chk("A-5.1", "มี AuditLog hr.payroll.approve (targetType HrPayrollRun)", hasApprove, "มี", hasApprove ? "มี" : "ไม่มี");
  chk("A-5.2", "มี AuditLog hr.payroll.reverse", hasReverse, "มี", hasReverse ? "มี" : "ไม่มี");
  chk("A-5.3", "approve/reverse service สำเร็จจริง (ok:true) — audit มีเนื้อจริง", ap.ok === true && rv.ok === true, "true/true", JSON.stringify({ ap: ap.ok, rv: rv.ok }));

  // ═══ 6) pagination take จำกัดจำนวน ═══
  console.log("\n── 6) pagination ──");
  const lim2 = await access.listAuditLogs({ tenantId: tidA, take: 2 });
  chk("A-6.1", "take:2 → คืน 2 แถว", lim2.rows.length === 2, "2", String(lim2.rows.length));
  chk("A-6.2", "มี nextCursor เมื่อยังมีต่อ", typeof lim2.nextCursor === "string" && lim2.nextCursor.length > 0, "cursor", String(lim2.nextCursor));
  const pageNext = await access.listAuditLogs({ tenantId: tidA, take: 2, cursor: lim2.nextCursor as string });
  const overlap = pageNext.rows.some((r) => lim2.rows.some((p) => p.id === r.id));
  chk("A-6.3", "หน้าถัดไป (cursor) ไม่ซ้ำกับหน้าแรก", !overlap && pageNext.rows.length > 0, "ไม่ซ้ำ", overlap ? "ซ้ำ!" : "ไม่ซ้ำ");

  // ═══ 7) listAuditActions: distinct + label ═══
  console.log("\n── 7) distinct actions สำหรับ dropdown ──");
  const acts = await access.listAuditActions(tidA);
  const distinctOk = acts.length === new Set(acts.map((a) => a.action)).size && acts.length >= 4;
  chk("A-7.1", "listAuditActions distinct + มี label", distinctOk && acts.every((a) => !!a.label), "distinct+label", JSON.stringify(acts.map((a) => a.action)));

} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message}\n${e.stack?.slice(0, 400)}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  const tables = ["auditLog", "hrPayrollItem", "hrPayrollRun", "hrSalaryProfile", "accountJournalLine", "accountJournalEntry", "accountLedger", "accountMapping", "accountSettings", "accountDocSequence", "accountPeriod", "hrLeave", "hrAttendance", "hrEmployee", "membership", "appSystemUnit", "appSystem"];
  for (const id of [tidA, tidB]) {
    if (!id) continue;
    for (const m of tables) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  for (const uid of [uidA, uidB]) if (uid) await d(() => prisma.user.delete({ where: { id: uid } }));
  await prisma.$disconnect();

  const fail = cks.filter((c) => !c.ok);
  console.log(`\n${fail.length === 0 ? "✅ PASS" : "❌ FAIL"} — ${cks.length - fail.length}/${cks.length}`);
  if (fail.length) { console.log("ตก:", fail.map((c) => c.id).join(", ")); process.exit(1); }
}

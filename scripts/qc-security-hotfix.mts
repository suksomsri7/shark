// QC — Security Hotfix (PDPA) · Fable oracle · Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/core/rbac.ts (pure — ไม่มี I/O):
//   canViewPayroll(m) → เห็นเงินเดือน/เลขผู้เสียภาษี เฉพาะ OWNER | permission "hr.payroll.read"
//     · MANAGER ที่เต็มสิทธิ์ทั่วไป → ไม่เห็น (fail-closed) · null → false
//   filterAccessibleUnitIds(m, ids) → กรอง unit ตาม unitAccess (ปฏิทินข้ามสาขา)
//     · OWNER | ["*"] → ครบ · ["u1"] → เฉพาะ u1 · null → []
//   evaluate(m, {module:"hr", action:"hr.leave.read"}) → ด่านโชว์วันลาในปฏิทิน (ลาป่วย=ข้อมูลสุขภาพ)
//     · OWNER/MANAGER → true · STAFF ต้องมี "hr.leave.read" หรือ "hr.*" · STAFF เปล่า → false
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

const rbac = (await import("@/lib/core/rbac" as string).catch(() => null)) as {
  canViewPayroll: (m: any) => boolean;
  filterAccessibleUnitIds: (m: any, ids: string[]) => string[];
  evaluate: (m: any, q: any) => boolean;
} | null;

if (!rbac) {
  chk("SEC-0", "มี rbac helpers ใหม่", false, "มี canViewPayroll/filterAccessibleUnitIds", "ยังไม่ export");
} else {
  const { canViewPayroll, filterAccessibleUnitIds, evaluate } = rbac;
  const owner = { role: "OWNER", unitAccess: ["*"], permissions: {} };
  const mgr = { role: "MANAGER", unitAccess: ["u1"], permissions: {} };
  const staff = { role: "STAFF", unitAccess: ["u1"], permissions: {} };
  const staffPayroll = { role: "STAFF", unitAccess: ["u1"], permissions: { "hr.payroll.read": true } };
  const staffLeave = { role: "STAFF", unitAccess: ["u1"], permissions: { "hr.leave.read": true } };
  const staffHrWild = { role: "STAFF", unitAccess: ["u1"], permissions: { "hr.*": true } };

  // ── canViewPayroll (เงินเดือน/เลขบัตร) ──
  chk("SEC-1", "OWNER เห็นเงินเดือน", canViewPayroll(owner) === true, "true", String(canViewPayroll(owner)));
  chk("SEC-2", "MANAGER ทั่วไป → ไม่เห็นเงินเดือน (fail-closed)", canViewPayroll(mgr) === false, "false", String(canViewPayroll(mgr)));
  chk("SEC-3", "STAFF ทั่วไป → ไม่เห็นเงินเดือน", canViewPayroll(staff) === false, "false", String(canViewPayroll(staff)));
  chk("SEC-4", "STAFF + hr.payroll.read → เห็นเงินเดือน", canViewPayroll(staffPayroll) === true, "true", String(canViewPayroll(staffPayroll)));
  chk("SEC-5", "null → ไม่เห็น", canViewPayroll(null) === false, "false", String(canViewPayroll(null)));

  // ── filterAccessibleUnitIds (ปฏิทินข้ามสาขา) ──
  const ids = ["u1", "u2", "u3"];
  chk("SEC-6", "OWNER เห็นทุกสาขา", JSON.stringify(filterAccessibleUnitIds(owner, ids)) === JSON.stringify(ids), "[u1,u2,u3]", JSON.stringify(filterAccessibleUnitIds(owner, ids)));
  chk("SEC-7", "STAFF สาขา u1 → เห็นเฉพาะ u1 (ปิด leak ข้ามสาขา)", JSON.stringify(filterAccessibleUnitIds(staff, ids)) === JSON.stringify(["u1"]), "[u1]", JSON.stringify(filterAccessibleUnitIds(staff, ids)));
  chk("SEC-8", "unitAccess ['*'] → เห็นทุกสาขา", JSON.stringify(filterAccessibleUnitIds({ role: "STAFF", unitAccess: ["*"], permissions: {} }, ids)) === JSON.stringify(ids), "[u1,u2,u3]", JSON.stringify(filterAccessibleUnitIds({ role: "STAFF", unitAccess: ["*"], permissions: {} }, ids)));
  chk("SEC-9", "null → []", JSON.stringify(filterAccessibleUnitIds(null, ids)) === "[]", "[]", JSON.stringify(filterAccessibleUnitIds(null, ids)));

  // ── evaluate hr.leave.read (โชว์วันลาในปฏิทิน) ──
  const q = { module: "hr", action: "hr.leave.read" };
  chk("SEC-10", "OWNER เห็นวันลาในปฏิทิน", evaluate(owner, q) === true, "true", String(evaluate(owner, q)));
  chk("SEC-11", "MANAGER เห็นวันลาในปฏิทิน", evaluate(mgr, q) === true, "true", String(evaluate(mgr, q)));
  chk("SEC-12", "STAFF เปล่า → ไม่เห็นวันลาเพื่อน (ปิด leak ลาป่วย)", evaluate(staff, q) === false, "false", String(evaluate(staff, q)));
  chk("SEC-13", "STAFF + hr.leave.read → เห็น", evaluate(staffLeave, q) === true, "true", String(evaluate(staffLeave, q)));
  chk("SEC-14", "STAFF + hr.* → เห็น", evaluate(staffHrWild, q) === true, "true", String(evaluate(staffHrWild, q)));
}

const fail = cks.filter((c) => !c.ok);
console.log(`\nQC Security Hotfix: ${cks.length - fail.length}/${cks.length} ผ่าน`);
if (fail.length) { console.error(`❌ ตก ${fail.length} ข้อ`); process.exit(1); }
console.log("✅ เขียวหมด");

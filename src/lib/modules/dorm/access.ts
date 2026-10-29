// SVC D.6 ▸ สิทธิ์เข้าหน้าหอ — "คนจดมิเตอร์เห็นแค่หน้าจด" (สัญญา ledger/svc-briefs/svc-brief-d.6.md §5)
//   pure · import ได้แค่ @/lib/core/rbac · board = ดูผังห้องและข้อมูลหอ (dorm.view) · meter = จดเลขมิเตอร์ (dorm.meter.read)
//   OWNER / MANAGER ที่คุมหน่วยได้ทั้งคู่ (evaluate) · STAFF ต้องมีคีย์ตรง หรือ dorm.* · ไม่คุมหน่วย/ไม่มีสมาชิก ⇒ false ทั้งคู่
// SVC D.13 ▸ เพิ่ม money (ใครเห็นเงิน) · lease · settings + ตารางสิทธิ์ตามบทบาทของหน้า 17 (ledger/svc-briefs/svc-brief-d.13.md §5.2)
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";

/** D.13 ▸ เห็นเงิน = ถือคีย์เงินของหอตัวใดก็ได้ ◂ */
const DORM_MONEY_KEYS = ["dorm.bill.run", "dorm.bill.send", "dorm.slip.review", "dorm.payment.manual"] as const;

export function dormAccess(
  m: MembershipCtx | null,
  unitId: string,
): { board: boolean; meter: boolean; money: boolean; lease: boolean; settings: boolean } {
  return {
    board: evaluate(m, { module: "dorm", action: "dorm.view", unitId }),
    meter: evaluate(m, { module: "dorm", action: "dorm.meter.read", unitId }),
    money: DORM_MONEY_KEYS.some((action) => evaluate(m, { module: "dorm", action, unitId })),
    lease: evaluate(m, { module: "dorm", action: "dorm.lease.manage", unitId }),
    settings: evaluate(m, { module: "dorm", action: "dorm.settings.edit", unitId }),
  };
}

// ───────────────────────── D.13 ▸ ชุดสิทธิ์ตามบทบาท (หน้า 17 การ์ด "สิทธิ์ผู้ใช้") ─────────────────────────
//   ระบบมีบทบาทจริง OWNER / MANAGER / STAFF — ชุดนี้คือ "ชุดติ๊ก" ของ STAFF (MANAGER = ทุกข้อในหน่วยที่คุม)
//   REQUEST = ไม่ถือคีย์อนุมัติ (ยื่นขอผ่านงานอนุมัติ D.11/D.12)
export type DormPresetRole = "CARETAKER" | "TECH" | "ACCOUNTANT";
export type DormRoleColumn = "OWNER" | DormPresetRole;
export type DormRoleCell = "YES" | "NO" | "REQUEST";
export type DormRoleRow = { id: string; labelTh: string; keys: string[]; cells: Record<DormRoleColumn, DormRoleCell> };

export const DORM_ROLE_COLUMNS: { role: DormRoleColumn; labelTh: string }[] = [
  { role: "OWNER", labelTh: "เจ้าของ" },
  { role: "CARETAKER", labelTh: "ผู้ดูแล" },
  { role: "TECH", labelTh: "ช่าง" },
  { role: "ACCOUNTANT", labelTh: "บัญชี" },
];

const row = (id: string, labelTh: string, keys: string[], o: DormRoleCell, c: DormRoleCell, t: DormRoleCell, a: DormRoleCell): DormRoleRow => ({
  id,
  labelTh,
  keys,
  cells: { OWNER: o, CARETAKER: c, TECH: t, ACCOUNTANT: a },
});

export const DORM_ROLE_ROWS: DormRoleRow[] = [
  row("bill", "ออก/ส่งบิล", ["dorm.bill.run", "dorm.bill.send"], "YES", "YES", "NO", "YES"),
  row("slip", "ยืนยันสลิป", ["dorm.slip.review", "dorm.payment.manual"], "YES", "YES", "NO", "YES"),
  row("meter", "จดมิเตอร์", ["dorm.meter.read"], "YES", "YES", "YES", "NO"),
  row("deposit", "หักประกัน", ["dorm.deposit.deduct.approve"], "YES", "REQUEST", "NO", "NO"),
  row("latefee", "ยกเว้นค่าปรับ", ["dorm.latefee.waive"], "YES", "REQUEST", "NO", "NO"),
  row("legal", "เปลี่ยนโหมดกฎหมาย", ["dorm.settings.legal"], "YES", "NO", "NO", "NO"),
  row("view", "ดูผังห้อง", ["dorm.view"], "YES", "YES", "NO", "YES"),
  row("lease", "สัญญา · ย้ายออก", ["dorm.lease.manage", "dorm.moveout.manage"], "YES", "YES", "NO", "NO"),
  row("repair", "แจ้งซ่อม", ["dorm.repair.manage"], "YES", "YES", "YES", "NO"),
  row("notice", "ประกาศ · พัสดุ", ["dorm.announce", "dorm.parcel.manage"], "YES", "YES", "NO", "NO"),
  row("settings", "ตั้งค่าหอ · นำเข้าข้อมูล", ["dorm.settings.edit", "dorm.import"], "YES", "NO", "NO", "NO"),
];

/** ชุดสิทธิ์ของบทบาท: ทุกคีย์ของทุกแถว · YES = true · NO/REQUEST = false */
export function dormPresetPermissions(role: DormPresetRole): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const r of DORM_ROLE_ROWS) for (const k of r.keys) out[k] = out[k] === true || r.cells[role] === "YES";
  return out;
}

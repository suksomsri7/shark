// permissions-matrix.ts — ตาราง "หมวดงาน × สิ่งที่ทำได้" ของหน้า ตั้งค่า › สิทธิ์ผู้ใช้งาน (WO 8.3 · SPEC §9.4 · เฟรม g13)
//
// 🔴 หลักการสำคัญที่สุดของไฟล์นี้: **ที่นี่ไม่ใช่ที่ตัดสินสิทธิ์**
//    สิทธิ์ที่บังคับใช้จริงอยู่ที่ `Membership.permissions` → `evaluate()` → `assertAccountCan()` เท่านั้น
//    ไฟล์นี้เป็นแค่ "แผนที่" ที่แปลง 36 คีย์ของ `core/permissions.ts §account` ให้เป็นตาราง 8 แถว × 7 คอลัมน์
//    ที่คนอ่านรู้เรื่อง ⇒ ติ๊กช่องหนึ่ง = เขียนคีย์ชุดหนึ่งลง Membership.permissions จริง ๆ
//    (ถ้าปล่อยให้หน้าจอมีช่องที่ไม่ผูกคีย์ = "สิทธิ์ผี" ที่ติ๊กแล้วไม่มีผล — บทเรียนหัวไฟล์ core/permissions.ts)
//
// กติกา 3 ข้อ
//   1. **ครบถ้วน**: ทุกคีย์ใน `PERMISSION_MODULES` โมดูล account ต้องปรากฏใน "เซลล์เจ้าของ" (owns) **เซลล์เดียว**
//      (ข้อสอบ qc-acc-v2-permissions M1 ตรวจข้อนี้ — เพิ่มคีย์ใหม่แล้วลืมใส่ตาราง = แดงทันที)
//   2. **เซลล์ยืม (shares)**: ระบบบัญชีของ SHARK ใช้คีย์เอกสารชุดเดียวกันทั้งฝั่งรับและฝั่งจ่าย
//      (ไม่มี `account.doc.view` แยกขาย/ซื้อ) แต่เฟรม g13 มีทั้งแถว "รายรับ" และ "รายจ่าย"
//      ⇒ แถวรายจ่ายจึง **ยืม** คีย์ชุดเดียวกับรายรับ (ติ๊กช่องไหนก็มีผลทั้งคู่ · หน้าจอบอกไว้ตรง ๆ)
//      เซลล์ยืมไม่นับเป็นเจ้าของคีย์ ⇒ กติกาข้อ 1 ยังเป็นจริง
//   3. **ต้องมี "ดู" ก่อน**: ทุกคอลัมน์ที่ไม่ใช่ "ดู" จะติ๊กไม่ได้ถ้าแถวนั้นยังไม่มีสิทธิ์ "ดู"
//      (เฟรม g13 โชว์ tooltip ดำ `ต้องมีสิทธิ์ "ดู" ก่อน`) — บังคับทั้งฝั่ง UI และฝั่ง server (`resolveCells`)

import { PERMISSION_MODULES } from "@/lib/core/permissions";

// ─────────────────────────────────────────────────────────────
// โครง: หมวด (แถว) × สิ่งที่ทำได้ (คอลัมน์)
// ─────────────────────────────────────────────────────────────

export type MatrixGroupKey =
  | "revenue"
  | "expense"
  | "contact"
  | "product"
  | "finance"
  | "accounting"
  | "document"
  | "settings";

export type MatrixColKey = "view" | "create" | "approve" | "pay" | "cancel" | "close" | "config";

/** คอลัมน์ตามเฟรม g13 (ลำดับห้ามสลับ — ด่านภาพอ่านหัวตารางตรงนี้) */
export const MATRIX_COLUMNS: readonly { key: MatrixColKey; label: string }[] = [
  { key: "view", label: "ดู" },
  { key: "create", label: "สร้าง/แก้ไข" },
  { key: "approve", label: "อนุมัติ" },
  { key: "pay", label: "รับ/จ่ายเงิน" },
  { key: "cancel", label: "ยกเลิก/กลับรายการ" },
  { key: "close", label: "ปิดงวด" },
  { key: "config", label: "ตั้งค่า" },
];

/** หมวดตามเฟรม g13 (ลำดับห้ามสลับ) */
export const MATRIX_GROUPS: readonly { key: MatrixGroupKey; label: string }[] = [
  { key: "revenue", label: "รายรับ" },
  { key: "expense", label: "รายจ่าย" },
  { key: "contact", label: "ผู้ติดต่อ" },
  { key: "product", label: "สินค้า" },
  { key: "finance", label: "การเงิน" },
  { key: "accounting", label: "บัญชี" },
  { key: "document", label: "คลังเอกสาร" },
  { key: "settings", label: "ตั้งค่า" },
];

type CellDef = {
  /** คีย์ที่เซลล์นี้ "เป็นเจ้าของ" — ต้องไม่ซ้ำกับเซลล์อื่นทั้งตาราง */
  owns?: readonly string[];
  /** คีย์ที่เซลล์นี้ "ยืม" มาจากเซลล์อื่น (ติ๊กแล้วมีผลร่วมกัน) */
  shares?: readonly string[];
  /** ข้อความอธิบายใต้ tooltip ของเซลล์ยืม */
  sharedWith?: string;
};

/**
 * ตารางจริง — เซลล์ที่ไม่มีในนี้ = "—" (หมวดนั้นไม่มีสิ่งนี้ให้ทำ)
 *
 * แผนที่คีย์ (36 คีย์ · เจ้าของเซลล์ละครั้งเดียว):
 *   รายรับ    ดู=doc.view · สร้าง=doc.create+doc.public_link · อนุมัติ=doc.issue+doc.approve
 *              รับเงิน=payment.record · ยกเลิก=doc.void+payment.void
 *   รายจ่าย   ยืมทั้งแถวจากรายรับ + เป็นเจ้าของ approve.limit (ช่องอนุมัติ)
 *   ผู้ติดต่อ  ดู=contact.manage · สร้าง=contact.merge (+ยืม contact.manage)
 *   สินค้า     ดู=product.manage
 *   การเงิน    ดู=finance.manage · สร้าง=cheque.manage
 *              รับ/จ่ายเงิน=reconcile+cheque.deposit+cheque.clear+cheque.bounce+cheque.void
 *   บัญชี      ดู=journal.view+report.view+tax.view
 *              สร้าง=journal.adjust+chart.manage+mapping.manage+asset.manage+asset.register+wht.manage
 *              อนุมัติ=asset.dispose+asset.writeoff · ยกเลิก=wht.unmark · ปิดงวด=period.close+period.reopen
 *   คลังเอกสาร ดู=document.manage · สร้าง=import
 *   ตั้งค่า     ดู=settings.manage
 */
export const MATRIX: Readonly<Record<MatrixGroupKey, Partial<Record<MatrixColKey, CellDef>>>> = {
  revenue: {
    view: { owns: ["account.doc.view"] },
    create: { owns: ["account.doc.create", "account.doc.public_link"] },
    approve: { owns: ["account.doc.issue", "account.doc.approve"] },
    pay: { owns: ["account.payment.record"] },
    cancel: { owns: ["account.doc.void", "account.payment.void"] },
  },
  expense: {
    view: { shares: ["account.doc.view"], sharedWith: "รายรับ · ดู" },
    create: { shares: ["account.doc.create"], sharedWith: "รายรับ · สร้าง/แก้ไข" },
    approve: {
      owns: ["account.approve.limit"],
      shares: ["account.doc.issue", "account.doc.approve"],
      sharedWith: "รายรับ · อนุมัติ",
    },
    pay: { shares: ["account.payment.record"], sharedWith: "รายรับ · รับ/จ่ายเงิน" },
    cancel: { shares: ["account.doc.void", "account.payment.void"], sharedWith: "รายรับ · ยกเลิก/กลับรายการ" },
  },
  contact: {
    view: { owns: ["account.contact.manage"] },
    create: { owns: ["account.contact.merge"], shares: ["account.contact.manage"], sharedWith: "ผู้ติดต่อ · ดู" },
  },
  product: {
    view: { owns: ["account.product.manage"] },
  },
  finance: {
    view: { owns: ["account.finance.manage"] },
    create: { owns: ["account.cheque.manage"] },
    pay: {
      owns: [
        "account.reconcile",
        "account.cheque.deposit",
        "account.cheque.clear",
        "account.cheque.bounce",
        "account.cheque.void",
      ],
    },
  },
  accounting: {
    view: { owns: ["account.journal.view", "account.report.view", "account.tax.view"] },
    create: {
      owns: [
        "account.journal.adjust",
        "account.chart.manage",
        "account.mapping.manage",
        "account.asset.manage",
        "account.asset.register",
        "account.wht.manage",
      ],
    },
    approve: { owns: ["account.asset.dispose", "account.asset.writeoff"] },
    cancel: { owns: ["account.wht.unmark"] },
    close: { owns: ["account.period.close", "account.period.reopen"] },
  },
  document: {
    view: { owns: ["account.document.manage"] },
    create: { owns: ["account.import"] },
  },
  settings: {
    view: { owns: ["account.settings.manage"] },
  },
};

/** คีย์ account.* ทั้งหมดที่ทะเบียนกลางรู้จัก (แหล่งเดียว — ห้ามพิมพ์ลิสต์ซ้ำ) */
export const ACCOUNT_PERMISSION_KEYS: readonly string[] =
  PERMISSION_MODULES.find((m) => m.module === "account")?.actions.map((a) => a.key) ?? [];

/** คีย์พารามิเตอร์ตัวเลข "เพดานอนุมัติ" (สตางค์) — ของเดิมของแพลตฟอร์ม ไม่ได้สร้างใหม่ */
export const APPROVE_CAP_KEY = "_maxApproveSatang";

/** เซลล์นี้มีอยู่จริงไหม (ไม่มี = "—" ในเฟรม g13) */
export function cellOf(group: MatrixGroupKey, col: MatrixColKey): CellDef | null {
  return MATRIX[group][col] ?? null;
}

/** คีย์ทั้งหมดที่เซลล์นี้ควบคุม (เจ้าของ + ที่ยืม) */
export function keysOfCell(group: MatrixGroupKey, col: MatrixColKey): readonly string[] {
  const c = cellOf(group, col);
  if (!c) return [];
  return [...(c.owns ?? []), ...(c.shares ?? [])];
}

/** แผนที่ "คีย์ → เซลล์เจ้าของ" (ใช้ตอนอ่านสิทธิ์ปัจจุบันกลับมาเป็นตาราง) */
export const OWNER_OF_KEY: Readonly<Record<string, { group: MatrixGroupKey; col: MatrixColKey }>> = (() => {
  const out: Record<string, { group: MatrixGroupKey; col: MatrixColKey }> = {};
  for (const g of MATRIX_GROUPS) {
    for (const c of MATRIX_COLUMNS) {
      for (const k of cellOf(g.key, c.key)?.owns ?? []) out[k] = { group: g.key, col: c.key };
    }
  }
  return out;
})();

// ─────────────────────────────────────────────────────────────
// ตาราง ↔ ชุดสิทธิ์
// ─────────────────────────────────────────────────────────────

export type MatrixCells = Partial<Record<MatrixGroupKey, Partial<Record<MatrixColKey, boolean>>>>;

/** ตารางว่าง (ทุกช่องปิด) */
export function emptyCells(): MatrixCells {
  return {};
}

/** ตารางเต็ม (ทุกช่องที่มีอยู่จริงเปิด) — ใช้โชว์บทบาทระบบ เจ้าของ/ผู้จัดการ แบบอ่านอย่างเดียว */
export function fullCells(): MatrixCells {
  const out: MatrixCells = {};
  for (const g of MATRIX_GROUPS) {
    const row: Partial<Record<MatrixColKey, boolean>> = {};
    for (const c of MATRIX_COLUMNS) if (cellOf(g.key, c.key)) row[c.key] = true;
    out[g.key] = row;
  }
  return out;
}

/**
 * บังคับกติกา "ต้องมีสิทธิ์ ดู ก่อน" — แถวไหนไม่ติ๊ก "ดู" ให้ล้างทั้งแถว
 * ทำทั้งฝั่ง server ก่อนเขียน DB (ไม่เชื่อฟอร์ม) และฝั่ง UI (ปุ่มจาง)
 * · แถว "รายจ่าย" ยืม "ดู" ของรายรับ ⇒ ถือว่ามี "ดู" เมื่อรายรับติ๊ก "ดู" หรือแถวตัวเองติ๊ก
 */
export function resolveCells(input: MatrixCells): MatrixCells {
  const out: MatrixCells = {};
  const revenueView = input.revenue?.view === true || input.expense?.view === true;
  for (const g of MATRIX_GROUPS) {
    const src = input[g.key] ?? {};
    const viewOn = g.key === "revenue" || g.key === "expense" ? revenueView : src.view === true;
    if (!viewOn) continue; // ไม่มี "ดู" = ไม่มีอะไรเลยในหมวดนี้
    const row: Partial<Record<MatrixColKey, boolean>> = {};
    for (const c of MATRIX_COLUMNS) {
      if (!cellOf(g.key, c.key)) continue;
      if (c.key === "view") {
        row.view = true;
        continue;
      }
      if (src[c.key] === true) row[c.key] = true;
    }
    out[g.key] = row;
  }
  return out;
}

/** ตาราง → ชุดคีย์สิทธิ์ (เฉพาะคีย์ account.*) ที่จะเขียนลง Membership.permissions */
export function cellsToPermissionKeys(cells: MatrixCells): string[] {
  const resolved = resolveCells(cells);
  const keys = new Set<string>();
  for (const g of MATRIX_GROUPS) {
    const row = resolved[g.key];
    if (!row) continue;
    for (const c of MATRIX_COLUMNS) {
      if (row[c.key] !== true) continue;
      for (const k of keysOfCell(g.key, c.key)) keys.add(k);
    }
  }
  return [...keys].sort();
}

/** ชุดคีย์สิทธิ์ปัจจุบัน → ตาราง (เซลล์ติ๊กเมื่อ **ทุกคีย์** ที่เซลล์นั้นควบคุมมีครบ) */
export function permissionKeysToCells(permissions: Record<string, unknown>): MatrixCells {
  const has = (k: string) => permissions[k] === true || permissions["account.*"] === true;
  const out: MatrixCells = {};
  for (const g of MATRIX_GROUPS) {
    const row: Partial<Record<MatrixColKey, boolean>> = {};
    for (const c of MATRIX_COLUMNS) {
      const keys = keysOfCell(g.key, c.key);
      if (keys.length === 0) continue;
      if (keys.every(has)) row[c.key] = true;
    }
    if (Object.keys(row).length > 0) out[g.key] = row;
  }
  return out;
}

/** สรุปสิทธิ์บัญชีของคนหนึ่งเป็นข้อความไทยสั้น ๆ (คอลัมน์ "สิทธิ์บัญชี (สรุป)" ของตารางผู้ใช้งาน) */
export function summarizeCells(cells: MatrixCells): string {
  const resolved = resolveCells(cells);
  const parts: string[] = [];
  for (const g of MATRIX_GROUPS) {
    const row = resolved[g.key];
    if (!row) continue;
    const cols = MATRIX_COLUMNS.filter((c) => row[c.key] === true);
    if (cols.length === 0) continue;
    const all = MATRIX_COLUMNS.filter((c) => cellOf(g.key, c.key)).length;
    parts.push(cols.length === all && all > 1 ? `${g.label}(ทั้งหมด)` : `${g.label} ${cols.map((c) => c.label).join("/")}`);
  }
  return parts.length === 0 ? "ไม่มีสิทธิ์บัญชี" : parts.join(" · ");
}

/** มีสิทธิ์บัญชีอย่างน้อย 1 ข้อไหม (ใช้กรองตารางผู้ใช้งานตาม §9.4) */
export function hasAnyAccountPermission(permissions: Record<string, unknown>): boolean {
  if (permissions["account.*"] === true) return true;
  return ACCOUNT_PERMISSION_KEYS.some((k) => permissions[k] === true);
}

// ─────────────────────────────────────────────────────────────
// แม่แบบบทบาท (preset) — ปุ่ม "ผู้ดูแลบัญชี / พนักงานขาย / ผู้อนุมัติ / ดูอย่างเดียว" ในเฟรม g13
// ─────────────────────────────────────────────────────────────

export type RolePreset = { key: string; name: string; capSatang: number | null; cells: MatrixCells };

export const ROLE_PRESETS: readonly RolePreset[] = [
  {
    key: "accountant",
    name: "ผู้ดูแลบัญชี",
    capSatang: null,
    cells: {
      revenue: { view: true, create: true, approve: true, pay: true, cancel: true },
      expense: { view: true, create: true, approve: true, pay: true, cancel: true },
      contact: { view: true, create: true },
      product: { view: true },
      finance: { view: true, create: true, pay: true },
      accounting: { view: true, create: true, approve: true, cancel: true, close: true },
      document: { view: true, create: true },
      settings: { view: true },
    },
  },
  {
    key: "sales",
    name: "พนักงานขาย",
    capSatang: null,
    cells: {
      revenue: { view: true, create: true },
      contact: { view: true, create: true },
      product: { view: true },
    },
  },
  {
    key: "approver",
    name: "ผู้อนุมัติ",
    capSatang: 5_000_000, // ฿50,000.00 (ตัวอย่างในเฟรม g13)
    cells: {
      revenue: { view: true, approve: true },
      expense: { view: true, approve: true },
      accounting: { view: true },
      document: { view: true },
    },
  },
  {
    key: "readonly",
    name: "ดูอย่างเดียว",
    capSatang: null,
    cells: {
      revenue: { view: true },
      expense: { view: true },
      contact: { view: true },
      product: { view: true },
      finance: { view: true },
      accounting: { view: true },
      document: { view: true },
    },
  },
];

// ─────────────────────────────────────────────────────────────
// บทบาทบัญชีของร้าน (เก็บใน AccountSettings.accountRoles)
// ─────────────────────────────────────────────────────────────

export type AccountRole = {
  key: string;
  name: string;
  /** เพดานอนุมัติเป็นสตางค์ · null = ไม่จำกัด */
  capSatang: number | null;
  cells: MatrixCells;
  /** บทบาทของระบบ (เจ้าของ/ผู้จัดการ) — แสดงเป็นเปิดทุกช่องและแก้ไม่ได้ */
  system?: boolean;
};

/** บทบาทระบบ 2 ตัวที่มาก่อนเสมอ (ตรงกับ Role ของแพลตฟอร์ม — แก้ไม่ได้) */
export const SYSTEM_ROLES: readonly AccountRole[] = [
  { key: "OWNER", name: "เจ้าของ", capSatang: null, cells: fullCells(), system: true },
  { key: "MANAGER", name: "ผู้จัดการ", capSatang: null, cells: fullCells(), system: true },
];

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** อ่านค่า cells จาก Json ที่ไม่น่าเชื่อถือ (DB/ฟอร์ม) ให้เหลือเฉพาะช่องที่มีจริง */
export function parseCells(raw: unknown): MatrixCells {
  if (!isRecord(raw)) return {};
  const out: MatrixCells = {};
  for (const g of MATRIX_GROUPS) {
    const row = raw[g.key];
    if (!isRecord(row)) continue;
    const clean: Partial<Record<MatrixColKey, boolean>> = {};
    for (const c of MATRIX_COLUMNS) {
      if (!cellOf(g.key, c.key)) continue;
      if (row[c.key] === true) clean[c.key] = true;
    }
    if (Object.keys(clean).length > 0) out[g.key] = clean;
  }
  return out;
}

/** อ่านทะเบียนบทบาทจากคอลัมน์ Json (ทนของเสีย — ค่าพัง = ข้ามแถวนั้น) */
export function parseRoles(raw: unknown): AccountRole[] {
  if (!Array.isArray(raw)) return [];
  const out: AccountRole[] = [];
  for (const r of raw) {
    if (!isRecord(r)) continue;
    const key = typeof r.key === "string" ? r.key.trim() : "";
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!key || !name || key === "OWNER" || key === "MANAGER") continue;
    const cap = typeof r.capSatang === "number" && Number.isFinite(r.capSatang) && r.capSatang >= 0
      ? Math.trunc(r.capSatang)
      : null;
    out.push({ key, name, capSatang: cap, cells: parseCells(r.cells) });
  }
  return out;
}

/** อ่านตาราง "ใครอยู่บทบาทไหน" */
export function parseRoleMembers(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && v.trim()) out[k] = v.trim();
  return out;
}

/** บทบาทระบบ + บทบาทของร้าน (ลำดับตามเฟรม g13: เจ้าของ · ผู้จัดการ · แล้วค่อยบทบาทที่ร้านสร้าง) */
export function allRoles(rolesJson: unknown): AccountRole[] {
  return [...SYSTEM_ROLES, ...parseRoles(rolesJson)];
}

/** "50,000.00" / "฿50000" (บาทบนหน้าจอ) → สตางค์ · "" = ไม่จำกัด (null) · ค่าผิด = "invalid" */
export function bahtFieldToSatang(raw: string): number | null | "invalid" {
  const clean = raw.replace(/[฿,\s]/g, "");
  if (!clean) return null;
  const v = Number.parseFloat(clean);
  if (!Number.isFinite(v) || v < 0) return "invalid";
  return Math.round(v * 100);
}

/** สร้าง key ของบทบาทใหม่จากชื่อไทย (ไม่ชนของเดิม · ใช้ตัวอักษรอังกฤษ/ตัวเลขล้วน) */
export function nextRoleKey(existing: readonly AccountRole[]): string {
  let i = existing.filter((r) => !r.system).length + 1;
  const used = new Set(existing.map((r) => r.key));
  while (used.has(`role${i}`)) i++;
  return `role${i}`;
}

// HR VIS-5c ▸ กติกาของทะเบียนพนักงาน + โปรไฟล์ (ภาพ 02) — ฟังก์ชันล้วน ไม่มี IO ไม่อ่านนาฬิกา (วันนี้ส่งเข้ามาเป็น YYYY-MM-DD) ·
//   แท็บสถานะ (ประจำ · พาร์ทไทม์/รายวัน · ทดลองงาน · สิ้นสุด = คนที่ลบ/สิ้นสุดแล้วเท่านั้น) · ค้นชื่อ/รหัส/เบอร์ · กรองแผนก · แบ่งหน้า 20 คน ·
//   ปิดเลขอ่อนไหว (บัตร ปชช. · ประกันสังคม · บัญชีธนาคาร) — เลขเต็มไม่ออกจากฟังก์ชันเหล่านี้ · ไม่มีตัวเลขเงินในไฟล์นี้ ◂

/** แถวที่ทะเบียนใช้ (ช่องทั่วไปของ HrEmployee — ไม่มีช่องอ่อนไหว) */
export type PersonRow = {
  id: string;
  name: string;
  code?: string | null;
  phone?: string | null;
  position?: string | null;
  department?: string | null;
  unitId?: string | null;
  employmentType?: string | null;
  employmentStatus?: string | null;
};

export type PeopleTab = "all" | "full" | "part" | "prob" | "ended";
export const PEOPLE_TABS: readonly PeopleTab[] = ["all", "full", "part", "prob", "ended"];
export const PAGE_SIZE = 20;
const PART = new Set(["PART_TIME", "DAILY"]);

/** แท็บของคนที่ยังอยู่ในทะเบียน: ทดลองงาน (สถานะหรือประเภท) → พาร์ทไทม์/รายวัน → ประจำ (เต็มเวลา · สัญญาจ้าง · ไม่ระบุ) */
export function classOf(p: Pick<PersonRow, "employmentType" | "employmentStatus">): "full" | "part" | "prob" {
  if (p.employmentStatus === "PROBATION" || p.employmentType === "PROBATION") return "prob";
  if (p.employmentType && PART.has(p.employmentType)) return "part";
  return "full";
}

/** ค่าแท็บจาก ?tab= (ค่าอื่น = ทั้งหมด) */
export const tabOf = (v: unknown): PeopleTab => (PEOPLE_TABS.includes(v as PeopleTab) ? (v as PeopleTab) : "all");

const digitsOf = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v).replace(/\D/g, "") : "");

/** ค้นแบบไม่สนตัวพิมพ์: ส่วนหนึ่งของชื่อ · รหัส · เบอร์ (คำค้นที่เป็นตัวเลขล้วน เทียบเฉพาะตัวเลขของเบอร์/รหัส) */
export function matchesQuery(p: PersonRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  if ([p.name, p.code ?? "", p.phone ?? ""].some((x) => x.toLowerCase().includes(s))) return true;
  if (/^[\d\s+()-]+$/.test(s)) {
    const d = digitsOf(s);
    return d.length >= 3 && [p.phone, p.code].some((x) => digitsOf(x).includes(d));
  }
  return false;
}

/** แผนกที่มีในรายชื่อ (เรียงตามตัวอักษร · ไม่ซ้ำ · ไม่ว่าง) */
export const departmentsOf = (rows: readonly PersonRow[]): string[] => [...new Set(rows.map((r) => (r.department ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));

/** กรองด้วยคำค้น + แผนก (ใช้กับทั้งคนที่อยู่และคนที่สิ้นสุด) */
export function filterPeople<T extends PersonRow>(rows: readonly T[], q: string, dept: string): T[] {
  return rows.filter((r) => matchesQuery(r, q) && (!dept || (r.department ?? "").trim() === dept));
}

/** จำนวนต่อแท็บ — ทั้งหมด = คนที่ยังอยู่ (+ คนที่สิ้นสุด เมื่อเปิด "แสดงที่สิ้นสุด") · ประจำ + พาร์ทไทม์ + ทดลองงาน = คนที่ยังอยู่ */
export function tabCounts(active: readonly PersonRow[], ended: readonly PersonRow[], showEnded = false): Record<PeopleTab, number> {
  const c = { all: active.length + (showEnded ? ended.length : 0), full: 0, part: 0, prob: 0, ended: ended.length };
  for (const r of active) c[classOf(r)] += 1;
  return c;
}

/** แถวของแท็บ (คนที่สิ้นสุดอยู่ท้าย "ทั้งหมด" เมื่อเปิดสวิตช์ · แท็บ "สิ้นสุด" = คนที่สิ้นสุดเท่านั้น) */
export function rowsOfTab<T extends PersonRow>(tab: PeopleTab, active: readonly T[], ended: readonly T[], showEnded = false): { row: T; ended: boolean }[] {
  if (tab === "ended") return ended.map((row) => ({ row, ended: true }));
  if (tab === "all") return [...active.map((row) => ({ row, ended: false })), ...(showEnded ? ended.map((row) => ({ row, ended: true })) : [])];
  return active.filter((r) => classOf(r) === tab).map((row) => ({ row, ended: false }));
}

/** หน้าที่ขอ (เริ่ม 1 · เกินช่วง = หน้าใกล้สุด) */
export function pageOf<T>(rows: readonly T[], page: unknown, size = PAGE_SIZE): { rows: T[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const n = Math.min(pages, Math.max(1, Math.floor(Number(page) || 1)));
  const start = (n - 1) * size;
  const out = rows.slice(start, start + size);
  return { rows: out, page: n, pages, from: out.length ? start + 1 : 0, to: start + out.length };
}

/** YYYY-MM-DD ของคอลัมน์ @db.Date (เก็บเป็นเที่ยงคืน UTC) */
export const ymdOf = (d: Date | string | null | undefined): string => {
  if (!d) return "";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? "" : t.toISOString().slice(0, 10);
};

/** จำนวนวันจาก a ถึง b (YYYY-MM-DD ทั้งคู่) */
export function daysBetween(a: string, b: string): number {
  const x = Date.parse(`${a}T00:00:00Z`);
  const y = Date.parse(`${b}T00:00:00Z`);
  return Number.isNaN(x) || Number.isNaN(y) ? 0 : Math.round((y - x) / 86_400_000);
}

/** อายุเต็มปี ณ วันนี้ (null = วันเกิดอ่านไม่ได้) */
export function ageOn(birth: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
  return age >= 0 && age < 150 ? age : null;
}

/** ตัวอักษรแรกของชื่อ (รูปประจำตัว) */
export const initialOf = (name: string): string => Array.from(name.trim())[0] ?? "·";

// ═════════════ ปิดเลขอ่อนไหว (ภาพ 02: x-xxxx-xxxxx-62-1 · xxx-xxx-xx21 · KBank xxx-x-x4321) ═════════════
const NONE = "—";

/** บัตรประชาชน 13 หลัก → x-xxxx-xxxxx-NN-N (3 หลักท้าย) · เลขยาวอื่น ≥ 4 หลัก → x… + 3 หลักท้าย · สั้นกว่า/อ่านไม่ได้ → — */
export function maskNationalId(v: unknown): string {
  const d = digitsOf(v);
  if (d.length === 13) return `x-xxxx-xxxxx-${d.slice(10, 12)}-${d[12]}`;
  if (d.length >= 4) return `${"x".repeat(d.length - 3)}${d.slice(-3)}`;
  return NONE;
}

/** เลขประกันสังคม → xxx-xxx-xxNN (2 หลักท้าย) · < 4 หลัก → — */
export function maskSso(v: unknown): string {
  const d = digitsOf(v);
  return d.length >= 4 ? `xxx-xxx-xx${d.slice(-2)}` : NONE;
}

/** บัญชีธนาคาร → "<ธนาคาร> xxx-x-xNNNN" (4 หลักท้าย) · เลข < 4 หลัก → "<ธนาคาร> —" · รับ (ธนาคาร, เลข) หรือ { bankName, bankAccountNo } */
export function maskBankAccount(bank: unknown, account?: unknown): string {
  const o = bank && typeof bank === "object" ? (bank as { bankName?: unknown; bankAccountNo?: unknown }) : null;
  const name = String((o ? o.bankName : bank) ?? "").trim();
  const d = digitsOf(o ? o.bankAccountNo : account);
  const num = d.length >= 4 ? `xxx-x-x${d.slice(-4)}` : NONE;
  return name ? `${name} ${num}` : num;
}

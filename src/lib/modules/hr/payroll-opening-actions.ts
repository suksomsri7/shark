"use server";
// HR H3.4-YTD ▸ server actions ของการ์ด "ยอดยกมาต้นปี (ก่อนใช้ระบบ)" บนหน้าเงินเดือน — บันทึกทีละคน · "ไม่มีรายได้ก่อนใช้ระบบ" (ศูนย์) · บันทึกทั้งหมด (ตารางเดียว)
//   ผู้ดู = hrViewerOf(auth) · ด่านจริง (สมาชิกภาพในฐาน · OWNER หรือ hr.payroll.read + hr.payroll.pay ทุกสาขา) อยู่ใน service · บาท → สตางค์ที่นี่ (จำนวนเต็ม ไม่ผ่านทศนิยมลอยตัว)
//   redirect กลับพร้อมรหัสผลสั้น (allowlist ใน ui) · ไม่มีข้อความอิสระ/ยอดเงิน/ชื่อบน URL · ไม่ส่งเวลาเข้า service · ไฟล์ "use server" export ฟังก์ชันอย่างเดียว ◂
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { assertCan } from "@/lib/core/rbac";
import { hrViewerOf } from "./privacy";
import { OPENING_BULK_MAX, saveOpeningYtd, saveOpeningYtdBulk } from "./payroll-opening";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
type Auth = Awaited<ReturnType<typeof requireTenant>>;
/** ด่านคีย์ระดับร้าน (หยาบ — แบบเดียวกับ filings/actions) · all-branch: ด่านจริงของ service ต้องการทุกสาขาอยู่แล้ว จึงไม่ส่ง unitId · ทุกสาขา */
function keyGate(auth: Auth): boolean {
  try {
    // all-branch (ทุกสาขา) — ยอดยกมาเป็นของทั้งร้าน ไม่มีสาขาให้ส่ง
    assertCan(
      { role: auth.active.role, unitAccess: (Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess : []) as string[], permissions: (auth.active.permissions ?? {}) as Record<string, unknown> },
      { module: "hr", action: "hr.payroll.pay" },
    );
    return true;
  } catch {
    return false;
  }
}
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** "12,345.67" → 1234567 สตางค์ (จำนวนเต็มจากข้อความ ไม่คูณทศนิยม) · ว่าง → 0 · รูปแบบผิด → null (service ตอบ FIELDS) */
function satangOf(raw: string): number | null {
  const t = raw.replace(/[,\s฿]/g, "");
  if (t === "") return 0;
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}
const intOf = (raw: string): number | null => (/^\d{1,2}$/.test(raw) ? Number(raw) : raw === "" ? 0 : null);
const revOf = (raw: string): number | null => (/^\d{1,6}$/.test(raw) && Number(raw) >= 1 ? Number(raw) : null);
async function systemOf(tenantId: string, fd: FormData): Promise<string | null> {
  const systemId = s(fd, "systemId");
  if (!ID_RE.test(systemId)) return null;
  const sys = await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { id: true } });
  return sys?.id ?? null;
}
const yearOf = (fd: FormData) => (/^\d{4}$/.test(s(fd, "taxYear")) ? Number(s(fd, "taxYear")) : 0);
/** ค่าที่กรอกของแถว (ข้อความ) — ใช้เทียบกับค่าตั้งต้นที่หน้าใส่ไว้ใน orig_<id> (fix round F3: ส่งเฉพาะแถวที่เปลี่ยน) */
const fieldsOf = (fd: FormData, id: string) => [s(fd, `asof_${id}`), s(fd, `months_${id}`), s(fd, `inc_${id}`), s(fd, `wht_${id}`), s(fd, `sso_${id}`)];
const changedRow = (fd: FormData, id: string) => fieldsOf(fd, id).join("|") !== s(fd, `orig_${id}`);
/** แถวของพนักงาน 1 คนจากฟอร์มตาราง (ชื่อช่อง <ช่อง>_<employeeId>) — null = ช่องว่างทั้งแถว */
function rowOf(fd: FormData, id: string, zero: boolean) {
  const asOfDay = s(fd, `asof_${id}`);
  const fields = fieldsOf(fd, id);
  const expectRev = revOf(s(fd, `rev_${id}`));
  // ยอดศูนย์: วันที่ยอดถึง = 1 ม.ค. หรือวันเริ่มงานถ้าเริ่มในปีนั้น (fix round MINOR-4: asOf ต้องไม่ก่อนวันเริ่มงาน)
  const jan1 = `${yearOf(fd)}-01-01`;
  const start = s(fd, `start_${id}`);
  if (zero) return { employeeId: id, asOfDay: /^\d{4}-\d{2}-\d{2}$/.test(start) && start > jan1 ? start : jan1, months: 0, incomeSatang: 0, whtSatang: 0, ssoSatang: 0, expectRev };
  if (fields.every((f) => f === "")) return null;
  return { employeeId: id, asOfDay, months: intOf(s(fd, `months_${id}`)), incomeSatang: satangOf(s(fd, `inc_${id}`)), whtSatang: satangOf(s(fd, `wht_${id}`)), ssoSatang: satangOf(s(fd, `sso_${id}`)), expectRev };
}
const back = (systemId: string, year: number, q: string) => `/app/sys/${systemId}/hr/payroll?${year ? `yty=${year}&` : ""}${q}#hr-ytd-card`;

async function one(fd: FormData, zero: boolean): Promise<void> {
  const auth = await requireTenant();
  const systemId = await systemOf(auth.active.tenantId, fd);
  if (!systemId) redirect("/app");
  const year = yearOf(fd);
  if (!keyGate(auth)) redirect(back(systemId, year, "ymsg=NO"));
  const id = s(fd, zero ? "zero" : "one");
  if (!ID_RE.test(id)) redirect(back(systemId, year, "ymsg=NO"));
  const row = rowOf(fd, id, zero) ?? { employeeId: id, asOfDay: "", months: null, incomeSatang: null, whtSatang: null, ssoSatang: null, expectRev: revOf(s(fd, `rev_${id}`)) };
  const r = await saveOpeningYtd({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { ...row, taxYear: year });
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  redirect(back(systemId, year, r.ok ? `ymsg=${r.warnings.includes("SSO_HIGH") ? "savedWarn" : "saved"}` : `ymsg=${encodeURIComponent(r.code)}`));
}
/** บันทึกแถวเดียว (ปุ่ม name="one" value=<employeeId>) */
export async function saveOpeningYtdAction(fd: FormData): Promise<void> {
  await one(fd, false);
}
/** "ไม่มีรายได้ก่อนใช้ระบบ" — บันทึกยอดศูนย์ (ปุ่ม name="zero" value=<employeeId>) · การกระทำที่ลงประวัติของผู้ผ่านด่าน (Q3) */
export async function zeroOpeningYtdAction(fd: FormData): Promise<void> {
  await one(fd, true);
}
/** บันทึกทั้งหมด — แถวที่กรอก (ไม่ว่างทั้งแถว · ไม่ล็อก) ทั้งตาราง ทั้งหมดหรือไม่มีเลย */
export async function saveOpeningYtdBulkAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const systemId = await systemOf(auth.active.tenantId, fd);
  if (!systemId) redirect("/app");
  const year = yearOf(fd);
  if (!keyGate(auth)) redirect(back(systemId, year, "ymsg=NO"));
  // fix round F3/MINOR-2: ส่งเฉพาะแถวที่ค่าเปลี่ยนจากที่หน้าแสดง (แถวที่ไม่เปลี่ยนไม่สร้าง rev ใหม่ · ไม่ถูกตรวจ OWN) · เกิน 300 แถว = ข้อความคงที่
  const ids = fd.getAll("emp").map(String).filter((x) => ID_RE.test(x) && changedRow(fd, x));
  const rows = ids.map((id) => rowOf(fd, id, false)).filter((x): x is NonNullable<typeof x> => !!x);
  if (!rows.length) redirect(back(systemId, year, "ymsg=empty"));
  if (rows.length > OPENING_BULK_MAX) redirect(back(systemId, year, "ymsg=TOO_MANY"));
  const r = await saveOpeningYtdBulk({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { taxYear: year, rows });
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  redirect(back(systemId, year, r.ok ? `ymsg=${r.warnings.length ? "bulkWarn" : "bulk"}&yn=${r.saved.length}` : `ymsg=${encodeURIComponent(r.code)}`));
}

"use server";
// HR H3.6 ▸ server actions ของแบบยื่นภาษี/ประกันสังคม (brief R15) — ข้อมูลผู้จ่ายเงิน (เจ้าของร้าน) · ข้อมูลยื่นของพนักงาน · สร้างไฟล์ ·
//   ออก/ออกทั้งปี/ยกเลิกหนังสือรับรอง — ทุกตัว redirect กลับหน้าเดิมพร้อมรหัสผลสั้น (allowlist ใน ui) · ไม่มีข้อความอิสระ/เลขประจำตัว/ชื่อบน URL
//   ระบบ HR อ่านจากฟอร์มแล้วตรวจว่าเป็นของร้านนี้ · ผู้ดู = hrViewerOf(auth) · ด่านจริง (OWNER หรือ hr.payroll.read + hr.payroll.pay ทุกสาขา) อยู่ใน service ·
//   ไม่ส่งเวลาเข้า service · ไฟล์ "use server" export ฟังก์ชันอย่างเดียว ◂
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { assertCan } from "@/lib/core/rbac";
import { hrViewerOf } from "../privacy";
import { FIELD_LABEL } from "./texts";
import { generateFiling, issueTaxCertificate, issueTaxCertificatesBulk, saveFilingPerson, saveFilingProfile, voidTaxCertificate, type FilingFail } from "./service";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
type Auth = Awaited<ReturnType<typeof requireTenant>>;
/** ด่านคีย์ระดับร้าน (หยาบ) — all-branch: ด่านจริงของ service ต้องการทุกสาขาอยู่แล้ว จึงไม่ส่ง unitId · ทุกสาขา */
function keyGate(auth: Auth): boolean {
  try {
    // all-branch (ทุกสาขา) — แบบยื่นเป็นของทั้งร้าน ไม่มีสาขาให้ส่ง
    assertCan(
      { role: auth.active.role, unitAccess: (Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess : []) as string[], permissions: (auth.active.permissions ?? {}) as Record<string, unknown> },
      { module: "hr", action: "hr.payroll.pay" },
    );
    return true;
  } catch {
    return false;
  }
}
async function systemOf(tenantId: string, fd: FormData): Promise<string | null> {
  const systemId = s(fd, "systemId");
  if (!ID_RE.test(systemId)) return null;
  const sys = await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { id: true } });
  return sys?.id ?? null;
}
/** คำปฏิเสธ → พารามิเตอร์ผลบน URL (รหัส + ชื่อช่องที่อยู่ในรายการป้าย + เลขที่หนังสือรับรอง) */
function failQuery(f: FilingFail): string {
  const known = new Set(Object.keys(FIELD_LABEL.th));
  const fields = (f.fields ?? []).filter((x) => known.has(x.replace(/:(char|long)$/, "")));
  const doc = /เลขที่ ([A-Z0-9]{1,8}-\d{4}-\d{4,})/.exec(f.reason)?.[1] ?? "";
  return `fmsg=${encodeURIComponent(f.code)}${fields.length ? `&fflds=${encodeURIComponent(fields.join(","))}` : ""}${doc ? `&fdoc=${encodeURIComponent(doc)}` : ""}`;
}
const keep = (fd: FormData) => {
  const q: string[] = [];
  for (const k of ["fk", "fp", "frun", "ty", "fperson"]) {
    const v = s(fd, k);
    if (v && /^[A-Za-z0-9_-]{1,64}$/.test(v)) q.push(`${k}=${encodeURIComponent(v)}`);
  }
  return q.join("&");
};
const payroll = (systemId: string, fd: FormData, extra: string) => `/app/sys/${systemId}/hr/payroll?${[keep(fd), extra].filter(Boolean).join("&")}#hr-filing`;

/** ข้อมูลผู้จ่ายเงิน (เจ้าของร้าน — service ตรวจซ้ำ) */
export async function saveFilingProfileAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const systemId = await systemOf(auth.active.tenantId, fd);
  if (!systemId) redirect("/app");
  const back = (q: string) => `/app/sys/${systemId}/hr/settings?${q}#hr-filing-profile`;
  if (!keyGate(auth)) redirect(back("fmsg=NO"));
  const r = await saveFilingProfile({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), {
    taxId: s(fd, "taxId"), branchNo: s(fd, "branchNo"), employerName: s(fd, "employerName"), employerAddress: s(fd, "employerAddress"), deptName: s(fd, "deptName"),
    lto: fd.get("lto") === "on", branchType: s(fd, "branchType"), rdUserId: s(fd, "rdUserId"), rdFormFlag: s(fd, "rdFormFlag"), ssoAccountNo: s(fd, "ssoAccountNo"), ssoBranchNo: s(fd, "ssoBranchNo"),
    ssoEncoding: s(fd, "ssoEncoding"), ssoWageMode: s(fd, "ssoWageMode"), rdSlashMode: s(fd, "rdSlashMode"), signerName: s(fd, "signerName"), certPrefix: s(fd, "certPrefix"),
  });
  revalidatePath(`/app/sys/${systemId}/hr/settings`);
  redirect(back(r.ok ? "fmsg=saved" : failQuery(r)));
}

/** ข้อมูลยื่นของพนักงาน (ชื่อ/คำนำหน้า/ที่อยู่แยกช่อง) */
export async function saveFilingPersonAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const systemId = await systemOf(auth.active.tenantId, fd);
  if (!systemId) redirect("/app");
  if (!keyGate(auth)) redirect(payroll(systemId, fd, "fmsg=NO"));
  const input: Record<string, unknown> = { employeeId: s(fd, "employeeId") };
  for (const k of ["title", "firstName", "lastName", "ssoPrefix", "building", "room", "floor", "village", "houseNo", "moo", "soi", "street"]) input[k] = s(fd, k);
  const r = await saveFilingPerson({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), input);
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  redirect(payroll(systemId, fd, r.ok ? "fmsg=saved" : failQuery(r)));
}

/** สร้างไฟล์ (ใบกำกับ + ประวัติ) แล้วกลับหน้าเงินเดือนพร้อมลิงก์ดาวน์โหลดของไฟล์นี้ (ไม่ redirect ไป route — กติกา H3.5) */
export async function generateFilingAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const systemId = await systemOf(auth.active.tenantId, fd);
  if (!systemId) redirect("/app");
  if (!keyGate(auth)) redirect(payroll(systemId, fd, "fmsg=NO"));
  const kind = s(fd, "fk");
  const options: Record<string, unknown> = {};
  for (const k of ["formType", "slashMode", "encoding", "wageMode", "paidDate", "lineEnd"]) if (s(fd, k)) options[k] = s(fd, k);
  for (const k of ["seqNo", "formFlag", "rateBp"]) if (/^\d{1,5}$/.test(s(fd, k))) options[k] = Number(s(fd, k));
  const r = await generateFiling({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { kind, period: s(fd, "fp") || undefined, runId: s(fd, "frun") || undefined, options });
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  redirect(payroll(systemId, fd, r.ok ? `fmsg=made&ffile=${encodeURIComponent(r.fileId)}` : failQuery(r)));
}

/** ออกหนังสือรับรอง 1 ใบ (ANNUAL / LEAVER) */
export async function issueTaxCertAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const systemId = await systemOf(auth.active.tenantId, fd);
  if (!systemId) redirect("/app");
  if (!keyGate(auth)) redirect(payroll(systemId, fd, "fmsg=NO"));
  const r = await issueTaxCertificate({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { employeeId: s(fd, "employeeId"), taxYear: s(fd, "ty"), kind: s(fd, "kind") });
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  redirect(payroll(systemId, fd, r.ok ? "fmsg=issued" : failQuery(r)));
}

/** ออกหนังสือรับรองสิ้นปีให้ทุกคนที่มีเงินได้ในปี (ทีละคน · ข้ามคนที่มีใบแล้ว/ข้อมูลไม่ครบ/ไม่มีเงินได้) */
export async function issueTaxCertsBulkAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const systemId = await systemOf(auth.active.tenantId, fd);
  if (!systemId) redirect("/app");
  if (!keyGate(auth)) redirect(payroll(systemId, fd, "fmsg=NO"));
  const r = await issueTaxCertificatesBulk({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { taxYear: s(fd, "ty") });
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  redirect(payroll(systemId, fd, r.ok ? `fmsg=bulk&fbi=${r.issued.length}&fbs=${r.skipped.length}${r.stopped ? `&fstop=${encodeURIComponent(r.stopped.code)}` : ""}` : failQuery(r)));
}

/** ยกเลิกหนังสือรับรอง (เจ้าของร้าน · เหตุผล 1–200 ตัวอักษร — ไม่ลงประวัติ) */
export async function voidTaxCertAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const systemId = await systemOf(auth.active.tenantId, fd);
  if (!systemId) redirect("/app");
  if (!keyGate(auth)) redirect(payroll(systemId, fd, "fmsg=NO"));
  const r = await voidTaxCertificate({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { certId: s(fd, "certId"), reason: String(fd.get("reason") ?? "") });
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  redirect(payroll(systemId, fd, r.ok ? "fmsg=voided" : failQuery(r)));
}

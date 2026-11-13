"use server";
// HR H3.5 ▸ server actions ของไฟล์โอนเงินเดือน (brief R14) — บันทึกบัญชีต้นทาง (เจ้าของร้าน) · บันทึก/ลบชุดคอลัมน์ · สร้างไฟล์แล้วพาไปหน้าดาวน์โหลด
//   ระบบ HR อ่านจากฟอร์มแล้วตรวจว่าเป็นของร้านนี้ · ผู้ดู = hrViewerOf(auth) · สิทธิ์/สาขา/ร้าน ตัดสินใน service (bank-files/service.ts) ·
//   ไม่ส่งเวลาเข้า service · ไม่ส่งเลขบัญชีกลับทาง URL · ไฟล์ "use server" export ฟังก์ชันอย่างเดียว ◂
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { assertCan } from "@/lib/core/rbac";
import { hrViewerOf } from "../privacy";
import { BANK_TEXT } from "./codes";
import { deleteBankPreset, generateBankFile, saveBankPreset, saveBankProfile } from "./service";

const MAX_PRESET_ROWS = 30;
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

type Auth = Awaited<ReturnType<typeof requireTenant>>;
/** ด่านคีย์ระดับร้าน (หยาบ — MANAGER ผ่าน evaluate ได้) · ด่านจริงอยู่ใน service: OWNER หรือ hr.payroll.read + hr.payroll.pay ทุกสาขา */
function keyGate(auth: Auth): boolean {
  try {
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
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(systemId)) return null;
  const sys = await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { id: true } });
  return sys?.id ?? null;
}

/** บัญชีต้นทาง + รูปแบบธนาคารที่เปิด (เจ้าของร้าน — service ตรวจซ้ำ) */
export async function saveBankProfileAction(fd: FormData): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  if (!keyGate(auth)) return { ok: false, reason: BANK_TEXT.no };
  const systemId = await systemOf(auth.active.tenantId, fd);
  if (!systemId) return { ok: false, reason: BANK_TEXT.no };
  const r = await saveBankProfile({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), {
    debitBankCode: s(fd, "debitBankCode"),
    debitAccountNo: s(fd, "debitAccountNo"),
    debitBranchCode: s(fd, "debitBranchCode"),
    companyNameEn: s(fd, "companyNameEn"),
    ktbCompanyId: s(fd, "ktbCompanyId"),
    formatsEnabled: fd.getAll("formats").map(String),
    acknowledgeUntested: fd.get("ackUntested") === "on",
  });
  revalidatePath(`/app/sys/${systemId}/hr/settings`);
  return r.ok ? { ok: true, id: systemId } : { ok: false, reason: r.reason };
}

/** ชุดคอลัมน์ของร้าน: แถว f<i>/h<i>/c<i> (field · หัวคอลัมน์ · ค่าคงที่เมื่อ field = const) — แถวที่ไม่เลือก field ถูกข้าม */
export async function saveBankPresetAction(fd: FormData): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  if (!keyGate(auth)) return { ok: false, reason: BANK_TEXT.no };
  const systemId = await systemOf(auth.active.tenantId, fd);
  if (!systemId) return { ok: false, reason: BANK_TEXT.no };
  const columns: [string, string][] = [];
  for (let i = 0; i < MAX_PRESET_ROWS; i++) {
    const f = s(fd, `f${i}`);
    if (!f) continue;
    columns.push([f === "const" ? `const:${s(fd, `c${i}`)}` : f, String(fd.get(`h${i}`) ?? "")]);
  }
  const r = await saveBankPreset({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), {
    name: s(fd, "name"),
    kind: s(fd, "kind"),
    columns,
    includeHeader: fd.get("includeHeader") === "on",
    includeSummary: fd.get("includeSummary") === "on",
    amountStyle: s(fd, "amountStyle"),
    dateStyle: s(fd, "dateStyle"),
    encoding: s(fd, "encoding"),
  });
  revalidatePath(`/app/sys/${systemId}/hr/settings`);
  return r;
}

export async function deleteBankPresetAction(fd: FormData): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  if (!keyGate(auth)) return { ok: false, reason: BANK_TEXT.no };
  const systemId = await systemOf(auth.active.tenantId, fd);
  if (!systemId) return { ok: false, reason: BANK_TEXT.no };
  const r = await deleteBankPreset({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { id: s(fd, "id") });
  revalidatePath(`/app/sys/${systemId}/hr/settings`);
  return r.ok ? { ok: true, id: systemId } : { ok: false, reason: r.reason };
}

/**
 * สร้างไฟล์ (ลงใบกำกับ + ประวัติ) แล้วกลับหน้าเงินเดือนที่มีลิงก์ดาวน์โหลด (route สร้างไบต์ใหม่และเทียบ sha) ·
 * รูปแบบธนาคารต้องติ๊กรับทราบ "ยังไม่ทดสอบกับธนาคารจริง" ก่อน · ไม่สำเร็จ = กลับหน้าเงินเดือนพร้อมรหัสสั้น (?bmsg=)
 * 🔴 การดาวน์โหลดไม่เปลี่ยนรอบเป็น "จ่ายแล้ว" (Q12) — ปุ่มจ่ายแล้วยังเป็นขั้นแยกของคน
 */
export async function generateBankFileAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const systemId = await systemOf(auth.active.tenantId, fd);
  if (!systemId) redirect("/app");
  if (!keyGate(auth)) redirect(`/app/sys/${systemId}/hr/payroll?bmsg=NO#hr-bank`);
  const runId = s(fd, "runId");
  const format = s(fd, "format");
  const pick = s(fd, "pick");
  const back = (code: string) => `/app/sys/${systemId}/hr/payroll?bank=${encodeURIComponent(runId)}&bfmt=${encodeURIComponent(pick)}&bmsg=${encodeURIComponent(code)}#hr-bank`;
  const fixed = format === "KBANK_PCT" || format === "KTB_IPAY";
  if (fixed && fd.get("ack") !== "on") redirect(back("ack"));
  const options: Record<string, string> = {};
  for (const k of ["effectiveDate", "encoding", "ktbMode", "ktbDateEra", "ktbReceivingBranch"]) {
    const v = s(fd, k);
    if (v) options[k] = v;
  }
  const r = await generateBankFile({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { runId, format, presetId: s(fd, "presetId") || undefined, options });
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  if (!r.ok) redirect(back(r.code));
  // HR H3.5 fix r1 ▸ F5: กลับหน้าเงินเดือนพร้อมลิงก์ดาวน์โหลดของไฟล์นี้ (ไม่ redirect ไป route — action redirect ของ Next ดึงปลายทางฝั่ง server
  //   ด้วยหัว rsc แล้วเบราว์เซอร์เปิดซ้ำอีกครั้ง = ดาวน์โหลด/ประวัติ 2 ครั้งต่อการกดครั้งเดียว) ◂
  redirect(`/app/sys/${systemId}/hr/payroll?bank=${encodeURIComponent(runId)}&bfmt=${encodeURIComponent(pick)}&bfile=${encodeURIComponent(r.fileId)}#hr-bank`);
}

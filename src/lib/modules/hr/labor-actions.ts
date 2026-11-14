"use server";
// HR H4.2 ▸ server action ของค่าตั้งค่าแรงต่อยอดขาย (หน้าตั้งค่า) — แปลงฟอร์ม (% · บาท) เป็นค่าที่เก็บ (‰ · สตางค์) แล้วส่ง setLaborSettings ·
//   สิทธิ์/สาขา/ขอบเขตค่า ตัดสินใน service (สมาชิกภาพจากฐาน) · ผลกลับเป็น reason ข้อความคงที่ — หน้าแปลงเป็นรหัส ?msg= จาก allowlist ·
//   ไฟล์ "use server" export ฟังก์ชันอย่างเดียว ◂
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { hrViewerOf } from "./privacy";
import { setLaborSettings } from "./labor";
import { LABOR_TEXT } from "./labor-rules";

/** ฟอร์ม → ค่าที่เก็บ: เป้า % (ทศนิยม 1 ตำแหน่ง) → ‰ · บาท/ชม. (ว่าง = ไม่ตั้ง) → สตางค์ · คน = จำนวนเต็ม · รูปเสีย = NaN (service ปฏิเสธ) */
function inputOf(fd: FormData): { targetTenths: number; splhSatang: number | null; minStaff: number } {
  const num = (k: string) => {
    const s = String(fd.get(k) ?? "").trim();
    return /^\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
  };
  const pct = num("targetPct");
  const splhRaw = String(fd.get("splhBaht") ?? "").trim();
  const splh = splhRaw === "" ? null : num("splhBaht");
  return {
    targetTenths: Number.isFinite(pct) && Math.abs(pct * 10 - Math.round(pct * 10)) < 1e-9 ? Math.round(pct * 10) : Number.NaN,
    splhSatang: splh === null ? null : Number.isFinite(splh) && Number.isInteger(splh) ? splh * 100 : Number.NaN,
    minStaff: num("minStaff"),
  };
}

/** บันทึกค่าตั้ง hrLabor (ด่านคีย์ระดับร้าน = hr.employee.create · service ตรวจซ้ำจากฐาน) */
export async function saveLaborSettingsAction(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  const viewer = hrViewerOf(auth);
  try {
    assertCan({ role: viewer.role, unitAccess: viewer.unitAccess as string[], permissions: viewer.permissions as Record<string, unknown> }, { module: "hr", action: "hr.employee.create" });
  } catch {
    return { ok: false, reason: LABOR_TEXT.settingsNo };
  }
  const systemId = String(formData.get("systemId") ?? "").trim();
  const r = await setLaborSettings({ tenantId: auth.active.tenantId, systemId }, viewer, inputOf(formData)); // ข้อความไทยคงที่ ⇒ หน้าแปลงเป็นรหัส ?msg= ได้
  if (!r.ok) return { ok: false, reason: r.code === "NO" ? LABOR_TEXT.settingsNo : r.reason };
  revalidatePath(`/app/sys/${systemId}/hr/settings`);
  revalidatePath(`/app/sys/${systemId}`);
  return { ok: true, id: systemId };
}
// ◂ HR H4.2

"use server";

// compliance-actions.ts — server actions ของ T4.5 · T4.7 · T4.8 (เลน 1): ค่ากฎหมายอื่น · วิธีลงทิป · ลงบัญชีเงินขาด/เกินปิดกะ
//   ทุกตัวตรวจสิทธิ์ก่อนแตะข้อมูล (fitness F6) · ค่าที่ต่างจากค่าเริ่มต้น = คำเตือน ไม่บล็อก (หน้าจออ่านคำเตือนจากค่าที่มีผล)
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, mc, writeAudit } from "./access";
import { loadBookLegal, saveBookTax } from "./legal-values";
import { postPosShiftVariances } from "./pos-link";
import { isComplianceKey, type ComplianceRow } from "@/lib/core/settings/legal/th-tax-2569";
import { TIP_TREATMENTS, type TipTreatment } from "@/lib/core/settings/defs/account";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** ตั้ง/ล้างค่าของร้านสำหรับคีย์หนึ่ง (แถวเดียวต่อคีย์ · ไม่มีวันสิ้นสุด) — ว่าง = กลับไปใช้ค่าเริ่มต้นของระบบ */
export async function saveComplianceValueAction(formData: FormData): Promise<void> {
  const systemId = str(formData, "systemId").slice(0, 40);
  const back = `/app/sys/${systemId}/account/settings/tax#compliance`;
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.settings.manage");
  const key = str(formData, "key");
  if (!isComplianceKey(key)) redirect(`${back.split("#")[0]}?err=${encodeURIComponent("ไม่รู้จักค่านี้")}#compliance`);
  const raw = str(formData, "value");
  const from = str(formData, "from");
  const legal = await loadBookLegal({ tenantId, systemId });
  const others = (legal.compliance ?? []).filter((r) => r.key !== key);
  let rows: Omit<ComplianceRow, "tag">[] = others;
  if (raw !== "") {
    const v = Number(raw);
    if (!Number.isInteger(v) || v < 1 || v > 100) redirect(`${back.split("#")[0]}?err=${encodeURIComponent("ตัวเลขต้องเป็นจำนวนเต็ม 1–100")}#compliance`);
    rows = [...others, { id: "", key, value: v, from: YMD.test(from) ? from : null, to: null, source: str(formData, "source").slice(0, 500), checkedAt: null }];
  }
  const res = await saveBookTax({ ...mc(auth), userId }, { tenantId, systemId }, { complianceRows: rows }, str(formData, "reason").slice(0, 500) || undefined);
  revalidatePath(`/app/sys/${systemId}/account/settings/tax`);
  if (!res.ok) redirect(`${back.split("#")[0]}?err=${encodeURIComponent(res.issues.map((i) => i.messageTh).join(" · ") || "บันทึกไม่สำเร็จ")}#compliance`);
  redirect(`${back.split("#")[0]}?msg=${encodeURIComponent(raw === "" ? "กลับไปใช้ค่าเริ่มต้นของระบบแล้ว" : "บันทึกค่าของร้านแล้ว")}#compliance`);
}

/** ACC T4.7 ▸ วิธีลงทิปที่รับผ่านจุดขาย (3 ทาง) */
export async function saveTipTreatmentAction(formData: FormData): Promise<void> {
  const systemId = str(formData, "systemId").slice(0, 40);
  const back = str(formData, "back").startsWith(`/app/sys/${systemId}/account/`) ? str(formData, "back") : `/app/sys/${systemId}/account/reports/pos-link`;
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.settings.manage");
  const t = str(formData, "tipTreatment");
  if (!(TIP_TREATMENTS as readonly string[]).includes(t)) redirect(`${back}?err=${encodeURIComponent("ไม่รู้จักวิธีลงทิปนี้")}`);
  const res = await saveBookTax({ ...mc(auth), userId }, { tenantId, systemId }, { tipTreatment: t as TipTreatment });
  revalidatePath(back);
  redirect(`${back}?${res.ok ? `msg=${encodeURIComponent("บันทึกวิธีลงทิปแล้ว — มีผลกับบิลที่ลงบัญชีจากนี้ไป")}` : `err=${encodeURIComponent(res.issues.map((i) => i.messageTh).join(" · ") || "บันทึกไม่สำเร็จ")}`}`);
}

/** ACC T4.7 (J7) ▸ ลงบัญชีเงินขาด/เกินของกะที่ยังไม่ลง ในช่วงวันที่ดูอยู่ */
export async function postShiftVariancesAction(formData: FormData): Promise<void> {
  const systemId = str(formData, "systemId").slice(0, 40);
  const from = str(formData, "from");
  const to = str(formData, "to");
  const back = `/app/sys/${systemId}/account/reports/pos-link?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.journal.adjust");
  if (!YMD.test(from) || !YMD.test(to)) redirect(`${back}&err=${encodeURIComponent("ช่วงวันที่ไม่ถูกต้อง")}`);
  const refIds = formData.getAll("refId").map(String).filter(Boolean);
  const res = await postPosShiftVariances({ tenantId, systemId }, { from: new Date(`${from}T00:00:00.000+07:00`), to: new Date(`${to}T23:59:59.999+07:00`) }, { userId }, refIds.length ? refIds : undefined);
  await writeAudit({ tenantId, actorId: userId, action: "account.pos.variance.post", targetType: "AppSystem", targetId: systemId, after: { systemId, posted: res.posted.length, failed: res.failed, from, to } });
  revalidatePath(`/app/sys/${systemId}/account/reports/pos-link`);
  const msg = `ลงบัญชีเงินขาด/เกิน ${res.posted.length} กะ${res.failed.length ? ` · ไม่สำเร็จ ${res.failed.length} กะ: ${res.failed.map((f) => f.reason).join(" · ").slice(0, 300)}` : ""}`;
  redirect(`${back}&${res.failed.length && !res.posted.length ? "err" : "msg"}=${encodeURIComponent(msg)}`);
}

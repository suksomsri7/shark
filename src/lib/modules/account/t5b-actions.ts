"use server";

// t5b-actions.ts — server actions ของ T5.9 · T5.10 · T5.11 (เลน 1): พยานของใบเบิก · ค่าตั้งถือเป็นขาย · รายได้รับล่วงหน้า · สาขา
//   ทุกตัวตรวจสิทธิ์ก่อนแตะข้อมูล (fitness F6) · คำเตือนกฎหมายไม่บล็อก (ยกเว้นยื่นรวมหลายสาขา = ติ๊กยืนยัน)
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, mc, writeAudit } from "./access";
import { saveStockEvidence } from "./goods-report";
import { cancelDeferral, createDeferral, recognizeDeferrals } from "./deferral";
import { saveBranches } from "./branches";
import { setSettings } from "@/lib/core/settings";
import { ACCOUNT_SETTING_KEYS, DEEMED_SALE_MODES, VAT_FILING_MODES, type VatFilingMode } from "@/lib/core/settings/defs/account";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const go = (back: string, ok: boolean, text: string): never => redirect(`${back}${back.includes("?") ? "&" : "?"}${ok ? "msg" : "err"}=${encodeURIComponent(text)}`);

/** T5.9 ▸ พยาน/การตรวจสภาพของใบเบิก (waste log) */
export async function saveWasteEvidenceAction(formData: FormData): Promise<void> {
  const systemId = str(formData, "systemId").slice(0, 40);
  const back = `/app/sys/${systemId}/account/reports/goods?tab=waste&from=${encodeURIComponent(str(formData, "from"))}&to=${encodeURIComponent(str(formData, "to"))}`;
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  const documentId = str(formData, "documentId").slice(0, 60);
  const r = await saveStockEvidence({ tenantId, systemId }, documentId, { witnessName: str(formData, "witnessName"), witnessRole: str(formData, "witnessRole"), inspectedAt: str(formData, "inspectedAt"), method: str(formData, "method"), note: str(formData, "note") });
  if (r.ok) await writeAudit({ tenantId, actorId: userId, action: "account.stock.evidence", targetType: "AccountDocument", targetId: documentId, after: { witnessName: str(formData, "witnessName") } });
  revalidatePath(`/app/sys/${systemId}/account/reports/goods`);
  go(back, r.ok, r.ok ? "บันทึกพยานแล้ว" : r.reason);
}

/** T5.9 ▸ ค่าตั้ง "ใช้ส่วนตัว/ขาด ถือเป็นการขาย" */
export async function saveDeemedSaleAction(formData: FormData): Promise<void> {
  const systemId = str(formData, "systemId").slice(0, 40);
  const back = `/app/sys/${systemId}/account/reports/goods?tab=deemed`;
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.settings.manage");
  const v = str(formData, "deemedSale");
  if (!(DEEMED_SALE_MODES as readonly string[]).includes(v)) go(back, false, "ค่าไม่ถูกต้อง");
  const res = await setSettings({ ...mc(auth), userId }, { tenantId }, [{ key: ACCOUNT_SETTING_KEYS.deemedSale, scope: "ACCOUNT_BOOK", scopeId: systemId, value: v }]);
  revalidatePath(`/app/sys/${systemId}/account/reports/goods`);
  go(back, res.ok, res.ok ? "บันทึกค่าตั้งแล้ว" : "บันทึกไม่สำเร็จ");
}

/** T5.10 ▸ ตั้งรายได้รับล่วงหน้า */
export async function createDeferralAction(formData: FormData): Promise<void> {
  const systemId = str(formData, "systemId").slice(0, 40);
  const back = `/app/sys/${systemId}/account/reports/deferrals`;
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.journal.adjust");
  const baht = Number(str(formData, "amount").replace(/,/g, ""));
  const months = Number(str(formData, "months"));
  const startMonth = str(formData, "startMonth");
  if (!Number.isFinite(baht) || baht <= 0) go(back, false, "ยอดต้องมากกว่า 0");
  if (!KEY.test(startMonth)) go(back, false, "เดือนเริ่มต้องเป็น ปี-เดือน");
  const r = await createDeferral({ tenantId, systemId }, { description: str(formData, "description").slice(0, 200), totalSatang: Math.round(baht * 100), startMonth, months, incomeAccountCode: str(formData, "incomeAccountCode").slice(0, 20), deferredAccountCode: str(formData, "deferredAccountCode").slice(0, 20) || null, createdById: userId });
  if (r.ok) await writeAudit({ tenantId, actorId: userId, action: "account.deferral.create", targetType: "AccountDeferral", targetId: r.id, after: { amount: Math.round(baht * 100), months, startMonth } });
  revalidatePath(back);
  go(back, r.ok, r.ok ? "ตั้งรายได้รับล่วงหน้าแล้ว" : r.reason);
}

/** T5.10 ▸ รับรู้ถึงเดือน */
export async function recognizeDeferralsAction(formData: FormData): Promise<void> {
  const systemId = str(formData, "systemId").slice(0, 40);
  const back = `/app/sys/${systemId}/account/reports/deferrals`;
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.journal.adjust");
  const upTo = str(formData, "upTo");
  if (!KEY.test(upTo)) go(back, false, "เดือนไม่ถูกต้อง");
  let n = 0;
  let err = "";
  try {
    n = (await recognizeDeferrals({ tenantId, systemId }, upTo, { postedById: userId })).posted.length;
  } catch (e) {
    err = e instanceof Error ? e.message : "ลงบัญชีไม่สำเร็จ";
  }
  revalidatePath(back);
  go(back, !err, err || (n ? `ลงรายการรับรู้รายได้ ${n} รายการ` : "ไม่มีเดือนที่ต้องลงเพิ่ม"));
}

/** T5.10 ▸ ยกเลิก (กลับรายการ) */
export async function cancelDeferralAction(formData: FormData): Promise<void> {
  const systemId = str(formData, "systemId").slice(0, 40);
  const back = `/app/sys/${systemId}/account/reports/deferrals`;
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.journal.adjust");
  const id = str(formData, "deferralId").slice(0, 60);
  const reason = str(formData, "reason").slice(0, 500);
  const r = await cancelDeferral({ tenantId, systemId }, id, reason);
  if (r.ok) await writeAudit({ tenantId, actorId: userId, action: "account.deferral.cancel", targetType: "AccountDeferral", targetId: id, after: { reason, reversed: r.reversed } });
  revalidatePath(back);
  go(back, r.ok, r.ok ? `ยกเลิกแล้ว (กลับรายการ ${r.reversed} ใบ)` : r.reason);
}

/** T5.11 ▸ บันทึกสาขา (แถวว่าง = ตัดทิ้ง) + วิธียื่น */
export async function saveBranchesAction(formData: FormData): Promise<void> {
  const systemId = str(formData, "systemId").slice(0, 40);
  const back = `/app/sys/${systemId}/account/reports/branch-tax`;
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.settings.manage");
  const codes = formData.getAll("code").map((x) => String(x).trim());
  const names = formData.getAll("name").map((x) => String(x).trim());
  const addrs = formData.getAll("address").map((x) => String(x).trim());
  const branches = codes.map((code, i) => ({ code, name: names[i] ?? "", address: addrs[i] || null })).filter((b) => b.code || b.name);
  const mode = str(formData, "vatFilingMode");
  const r = await saveBranches({ ...mc(auth), userId }, { tenantId, systemId }, { branches, ...((VAT_FILING_MODES as readonly string[]).includes(mode) ? { vatFilingMode: mode as VatFilingMode } : {}) }, { ack: formData.getAll("ack").map(String) });
  revalidatePath(back);
  go(back, r.ok, r.ok ? "บันทึกสาขาแล้ว" : r.reason === "LEGAL_ACK_REQUIRED" ? "ยื่นรวมต้องติ๊กยืนยันว่าได้รับอนุมัติจากอธิบดีแล้ว" : r.reason);
}

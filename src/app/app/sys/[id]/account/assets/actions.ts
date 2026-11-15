"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import { registerAsset, runDepreciation, disposeAsset, setAssetTaxClass } from "@/lib/modules/account/asset";
import { isAssetTaxClass } from "@/lib/modules/account/asset-tax";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? NaN : Number(v);
};
// บาท (จากฟอร์ม) → สตางค์
const satang = (fd: FormData, k: string) => Math.round(num(fd, k) * 100);
const dt = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v ? new Date(v) : new Date(NaN);
};

function base(systemId: string) {
  return `/app/sys/${systemId}/account/assets`;
}

export async function registerAssetAction(fd: FormData): Promise<void> {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.asset.manage");
  const ctx = { tenantId, systemId };

  const res = await registerAsset(ctx, {
    name: str(fd, "name"),
    category: str(fd, "category") || null,
    acquiredDate: dt(fd, "acquiredDate"),
    startDepDate: dt(fd, "startDepDate"),
    cost: satang(fd, "cost"),
    salvageValue: satang(fd, "salvageValue"),
    usefulLifeMonths: num(fd, "usefulLifeMonths"),
    assetAccountId: str(fd, "assetAccountId"),
    accumAccountId: str(fd, "accumAccountId"),
    expenseAccountId: str(fd, "expenseAccountId"),
    sourceDocumentId: str(fd, "sourceDocumentId") || null,
    note: str(fd, "note") || null,
    taxClass: isAssetTaxClass(str(fd, "taxClass")) ? (str(fd, "taxClass") as never) : null,
  });

  if (!res.ok) redirect(`${base(systemId)}?err=${encodeURIComponent(res.reason)}`);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.asset.register",
    targetType: "AccountFixedAsset",
    targetId: res.id,
    after: { code: res.code },
  });
  revalidatePath(base(systemId));
  // ACC T4.3 ▸ ไปหน้าสินทรัพย์ที่เพิ่งขึ้นทะเบียน — คำเตือนทางภาษี (เพดานอัตรา · รถยนต์นั่ง · ที่ดิน) แสดงที่นั่น ◂
  redirect(`${base(systemId)}/${res.id}?ok=${encodeURIComponent(`ขึ้นทะเบียน ${res.code} สำเร็จ${res.warnings.length ? ` · มีคำเตือน ${res.warnings.length} ข้อ` : ""}`)}`);
}

/** ACC T4.3 ▸ เปลี่ยนประเภททางภาษีของสินทรัพย์ (ที่ดิน = หยุดคิดค่าเสื่อมตั้งแต่รอบถัดไป) ◂ */
export async function setAssetTaxClassAction(fd: FormData): Promise<void> {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.asset.manage");
  const assetId = str(fd, "assetId");
  const res = await setAssetTaxClass({ tenantId, systemId }, assetId, str(fd, "taxClass"));
  const assetPath = `${base(systemId)}/${assetId}`;
  if (!res.ok) redirect(`${assetPath}?err=${encodeURIComponent(res.reason)}`);
  await writeAudit({ tenantId, actorId: userId, action: "account.asset.tax-class", targetType: "AccountFixedAsset", targetId: assetId, after: { taxClass: res.taxClass } });
  revalidatePath(assetPath);
  redirect(`${assetPath}?ok=${encodeURIComponent("บันทึกประเภททางภาษีแล้ว")}`);
}

export async function runDepreciationAction(fd: FormData): Promise<void> {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.asset.manage");
  const ctx = { tenantId, systemId };
  const periodKey = str(fd, "periodKey") || undefined;

  const res = await runDepreciation(ctx, periodKey);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.asset.depreciation.run",
    targetType: "AccountFixedAsset",
    after: { periodKey: res.periodKey, posted: res.posted.length, skipped: res.skipped.length },
  });
  revalidatePath(base(systemId));
  const totalAmt = res.posted.reduce((s, p) => s + p.amount, 0);
  const msg = `งวด ${res.periodKey}: คิดค่าเสื่อม ${res.posted.length} รายการ (${(totalAmt / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท)${res.fullyDepreciated.length ? ` · ครบอายุ ${res.fullyDepreciated.length}` : ""}`;
  redirect(`${base(systemId)}?dep=1&period=${res.periodKey}&ok=${encodeURIComponent(msg)}`);
}

export async function disposeAssetAction(fd: FormData): Promise<void> {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.asset.manage");
  const ctx = { tenantId, systemId };
  const mode = str(fd, "mode") === "WRITE_OFF" ? "WRITE_OFF" : "SELL";

  const res = await disposeAsset(ctx, {
    assetId: str(fd, "assetId"),
    mode,
    date: dt(fd, "date"),
    proceeds: mode === "SELL" ? satang(fd, "proceeds") : 0,
    financeAccountId: str(fd, "financeAccountId") || null,
    note: str(fd, "note") || null,
  });

  const assetPath = `${base(systemId)}/${str(fd, "assetId")}`;
  if (!res.ok) redirect(`${assetPath}?dispose=1&err=${encodeURIComponent(res.reason)}`);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: mode === "SELL" ? "account.asset.dispose" : "account.asset.writeoff",
    targetType: "AccountFixedAsset",
    targetId: str(fd, "assetId"),
    after: { entryId: res.entryId, gainLoss: res.gainLoss },
  });
  revalidatePath(base(systemId));
  const gl = res.gainLoss;
  const glMsg = gl > 0 ? `กำไร ${(gl / 100).toLocaleString("th-TH")} บาท` : gl < 0 ? `ขาดทุน ${(-gl / 100).toLocaleString("th-TH")} บาท` : "ไม่มีกำไร/ขาดทุน";
  revalidatePath(assetPath);
  redirect(`${assetPath}?ok=${encodeURIComponent(`${mode === "SELL" ? "ขาย" : "ตัดจำหน่าย"}สินทรัพย์สำเร็จ (${glMsg})`)}`);
}

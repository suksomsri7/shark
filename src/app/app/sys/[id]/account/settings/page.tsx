import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  getSettings,
  ORG_PREFIXES,
  orgDisplayName,
} from "@/lib/modules/account/service";
import { saveSettingsAction } from "@/lib/modules/account/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ImageAssetField } from "@/components/image-asset-field";
import { SettingsNav } from "@/components/account-v2/SettingsNav";
import { storageEnabled } from "@/lib/storage/service";

const inputCls = "rounded-lg border px-2 py-1.5 text-sm";
const labelCls = "flex flex-col gap-1 text-xs text-[color:var(--color-muted)]";

export default async function AccountSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; s?: string }>;
}) {
  const { id } = await params;
  const { saved, s: subRaw } = await searchParams;
  // หัวข้อย่อยของ "ข้อมูลกิจการ" (f10): ข้อมูลทั่วไป · ที่อยู่และสาขา · โลโก้ ตราประทับ ลายเซ็น
  const sub = ["general", "address", "brand"].includes(subRaw ?? "") ? subRaw! : "general";
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.settings.manage" });
  const s = await getSettings(tenantId, systemId);
  const base = `/app/sys/${id}/account`;

  return (
    // จำกัดความกว้างให้เท่ากับ เมนู 280 + ฟอร์ม max-w-2xl ⇒ ปุ่มบันทึกด้านบนอยู่ตรงขอบขวาของฟอร์ม (ตาม f10)
    <div className="flex max-w-[1000px] flex-col gap-4">
      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between gap-3 bg-[color:var(--color-surface)] px-1 py-2">
        <h1 className="text-2xl font-semibold">ตั้งค่า</h1>
        <SubmitButton form="org-settings-form">บันทึก</SubmitButton>
      </div>

      {saved === "1" && <p className="text-sm text-[color:var(--color-ink)]">บันทึกแล้ว ✓</p>}

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <SettingsNav base={base} activeGroup="org" activeSub={sub} />
        <form
          id="org-settings-form"
          action={saveSettingsAction}
          className="card grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 md:max-w-2xl"
        >
        <input type="hidden" name="systemId" value={systemId} />
        <h2 className="text-sm font-medium sm:col-span-2">ข้อมูลกิจการ</h2>
        <label className={labelCls}>
          คำนำหน้า
          <select name="orgPrefix" defaultValue={s.orgPrefix ?? ""} className={inputCls}>
            {ORG_PREFIXES.map((p) => (
              <option key={p || "none"} value={p}>
                {p || "— ไม่มี —"}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          ชื่อกิจการ
          <input name="orgName" defaultValue={s.orgName} required className={inputCls} />
          <span className="text-[11px]">
            พิมพ์เฉพาะชื่อ + คำต่อท้าย เช่น <b>ฉลามน้อย จำกัด</b> แล้วเลือกคำนำหน้าเป็น
            &nbsp;<b>บริษัท</b> · บนเอกสารจะพิมพ์ว่า{" "}
            <b>{orgDisplayName(s) || "บริษัท ฉลามน้อย จำกัด"}</b>
          </span>
        </label>
        <label className={labelCls}>
          ชื่อ (อังกฤษ)
          <input name="orgNameEn" defaultValue={s.orgNameEn ?? ""} className={inputCls} />
        </label>
        <label className={labelCls}>
          เลขผู้เสียภาษี
          <input name="taxId" defaultValue={s.taxId ?? ""} className={inputCls} />
        </label>
        <label className={labelCls}>
          รหัสสาขา
          <input name="branchCode" defaultValue={s.branchCode ?? "00000"} className={inputCls} />
        </label>
        <label className={labelCls}>
          ชื่อสาขา
          <input name="branchName" defaultValue={s.branchName ?? ""} className={inputCls} />
        </label>
        <label className={`${labelCls} sm:col-span-2`}>
          ที่อยู่
          <textarea name="address" defaultValue={s.address ?? ""} rows={2} className={inputCls} />
        </label>
        <label className={labelCls}>
          เบอร์โทร
          <input name="phone" defaultValue={s.phone ?? ""} className={inputCls} />
        </label>
        <label className={labelCls}>
          อีเมล
          <input name="email" type="email" defaultValue={s.email ?? ""} className={inputCls} />
        </label>
        <label className={labelCls}>
          เว็บไซต์
          <input
            name="website"
            type="url"
            inputMode="url"
            defaultValue={s.website ?? ""}
            placeholder="https://shark.in.th"
            className={inputCls}
          />
          <span className="text-[11px]">
            ใส่ที่อยู่เว็บแบบเต็ม ขึ้นต้นด้วย <b>https://</b> เช่น <b>https://shark.in.th</b>
            &nbsp;· ถ้าพิมพ์แค่ชื่อโดเมน ระบบจะเติม https:// ให้ตอนบันทึก
          </span>
        </label>

        <h2 className="mt-2 text-sm font-medium sm:col-span-2">ภาษีและเอกสาร</h2>
        <label className={labelCls}>
          จดทะเบียน VAT
          <select name="vatRegistered" defaultValue={s.vatRegistered ? "1" : "0"} className={inputCls}>
            <option value="1">จดทะเบียน VAT</option>
            <option value="0">ไม่จด VAT</option>
          </select>
        </label>
        <label className={labelCls}>
          อัตรา VAT (basis point, 700 = 7%)
          <input name="vatRateBp" type="number" defaultValue={s.vatRateBp} className={inputCls} />
        </label>
        <label className={`${labelCls} sm:col-span-2`}>
          จุดรับรู้ภาษีเริ่มต้น (ประเภทกิจการ)
          <select name="taxPointBasis" defaultValue={s.taxPointBasis} className={inputCls}>
            <option value="ON_ISSUE">ขายสินค้า — ออกใบกำกับตอนแจ้งหนี้/ส่งมอบ</option>
            <option value="ON_PAYMENT">บริการ — ออกใบกำกับตอนรับเงิน</option>
          </select>
        </label>
        <label className={labelCls}>
          ครบกำหนดชำระ default (วัน)
          <input name="defaultDueDays" type="number" defaultValue={s.defaultDueDays} className={inputCls} />
        </label>
        <label className={labelCls}>
          ยืนราคา default (วัน)
          <input name="defaultValidDays" type="number" defaultValue={s.defaultValidDays} className={inputCls} />
        </label>
        <label className={`${labelCls} sm:col-span-2`}>
          หมายเหตุท้ายเอกสาร
          <textarea name="footerNote" defaultValue={s.footerNote ?? ""} rows={2} className={inputCls} />
        </label>

        <h2 className="mt-2 text-sm font-medium sm:col-span-2">โลโก้ / ตราประทับ / ลายเซ็น</h2>
        <p className="text-[11px] text-[color:var(--color-muted)] sm:col-span-2">
          {storageEnabled()
            ? "อัปโหลดรูปได้ทั้ง 3 ช่อง (หรือวาง URL เองก็ได้) · รูปจะแสดงบนใบกำกับภาษี/เอกสารพิมพ์"
            : "ยังไม่ได้เปิดระบบอัปโหลดไฟล์ — วาง URL รูป (โฮสต์ไว้ที่อื่น) รูปจะแสดงบนใบกำกับภาษี/เอกสารพิมพ์"}
          {" "}ตราประทับ/ลายเซ็นที่ถ่ายหรือสแกนจากกระดาษ กด <b>ลบพื้นหลัง</b> เพื่อให้พื้นขาวโปร่งใส
          ไม่ไปทับเนื้อเอกสาร
        </p>
        <ImageAssetField
          name="logoUrl"
          label="โลโก้"
          defaultUrl={s.logoUrl ?? ""}
          enabled={storageEnabled()}
          previewClass="h-12 w-12 object-contain"
        />
        <ImageAssetField
          name="stampUrl"
          label="ตราประทับบริษัท"
          hint="ประทับมุมล่างซ้ายของเอกสาร"
          defaultUrl={s.stampUrl ?? ""}
          enabled={storageEnabled()}
          previewClass="h-16 w-16 object-contain"
        />
        <ImageAssetField
          name="signatureUrl"
          label="ลายเซ็นผู้มีอำนาจ"
          hint="แสดงเหนือชื่อผู้มีอำนาจลงนาม"
          defaultUrl={s.signatureUrl ?? ""}
          enabled={storageEnabled()}
        />

        {/* WO 8.1: ตั้งค่าเลขที่/หมายเหตุ/ลิงก์สาธารณะ ย้ายไปหน้า "เอกสารและเลขที่" (§9.2) แล้ว
            — เดิมตารางนี้เก็บ prefix/ลิงก์ซ้ำกับที่นั่น ซึ่งเป็นค่าเดียวกัน 2 ที่ (ต้นเหตุคลาสสิกของค่าไม่ตรงกัน) */}
        <p className="mt-2 text-xs text-[color:var(--color-muted)] sm:col-span-2">
          ตั้งค่าเลขที่เอกสาร · ข้อความท้ายเอกสาร · ลิงก์สาธารณะ · เทมเพลตพิมพ์ ย้ายไปที่{" "}
          <Link href={`${base}/settings/documents`} className="underline">
            เอกสารและเลขที่
          </Link>
        </p>

          <SubmitButton className="sm:col-span-2 sm:justify-self-start">บันทึกการตั้งค่า</SubmitButton>
        </form>
      </div>
    </div>
  );
}

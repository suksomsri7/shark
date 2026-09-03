// หน่วยนับ (WO 4.3 · DESIGN-SPEC-V2 §8.3)
// ตาราง: รหัส (PU/SU) · ชื่อไทย · ชื่ออังกฤษ · ชนิด · ใช้กับสินค้า n · modal เพิ่ม (รหัส auto)
// การ์ดที่ 2 = "กลุ่มจัดประเภทเอกสาร" (AccountCategory) ที่ย้ายมาจากแท็บเดิมของหน้าสินค้า — ไม่ให้ฟีเจอร์หาย
import Link from "next/link";
import type { AccountDocType } from "@prisma/client";
import { requireAccountPage } from "@/lib/modules/account/guard";
import {
  listUnits,
  unitUsageCount,
  listCategories,
  categoryAppliesTo,
  UNIT_KIND_LABEL,
  UNIT_SEED,
  type UnitKind,
} from "@/lib/modules/account/product";
import {
  createUnitAction,
  renameUnitAction,
  archiveUnitAction,
  seedUnitsAction,
  createCategoryAction,
  updateCategoryAction,
  archiveCategoryAction,
} from "@/lib/modules/account/product-actions";
import PageHeader from "@/components/ui/PageHeader";
import FormField from "@/components/ui/FormField";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";

const CAT_DOC_OPTIONS: { code: AccountDocType; label: string }[] = [
  { code: "QUOTATION", label: "ใบเสนอราคา" },
  { code: "INVOICE", label: "ใบแจ้งหนี้" },
  { code: "RECEIPT", label: "ใบเสร็จรับเงิน" },
  { code: "TAX_INVOICE", label: "ใบกำกับภาษีขาย" },
  { code: "PURCHASE", label: "บันทึกซื้อ" },
  { code: "EXPENSE", label: "บันทึกค่าใช้จ่าย" },
  { code: "GOODS_ISSUE", label: "ใบเบิกสินค้า" },
];

export default async function UnitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; new?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await requireAccountPage(id, "account.product.manage");
  const base = `/app/sys/${id}/account`;

  const [units, usage, categories] = await Promise.all([
    listUnits(tenantId, systemId),
    unitUsageCount(systemId),
    listCategories(tenantId, systemId),
  ]);
  const seededMissing = UNIT_SEED.filter((s) => !units.some((u) => u.name === s.name)).length;

  return (
    <div className="flex max-w-4xl flex-col gap-6 pb-24">
      <PageHeader
        title="หน่วยนับ"
        back={{ href: `${base}/products`, label: "สินค้า/บริการ" }}
        actions={
          seededMissing > 0 ? (
            <form action={seedUnitsAction}>
              <input type="hidden" name="systemId" value={systemId} />
              <SubmitButton variant="ghost">+ เติมหน่วยมาตรฐาน {seededMissing} หน่วย</SubmitButton>
            </form>
          ) : null
        }
      />

      {sp.err && (
        <p className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }} data-testid="units-error">
          {sp.err}
        </p>
      )}

      {units.length === 0 ? (
        <EmptyState text="ยังไม่มีหน่วยนับ — กด “เติมหน่วยมาตรฐาน” เพื่อสร้างชุดเริ่มต้น 12 หน่วย" />
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-line)" }}>
          <table className="w-full min-w-[720px] border-collapse" data-testid="units-table">
            <thead>
              <tr>
                {["รหัส", "ชื่อไทย", "ชื่ออังกฤษ", "ชนิด", "ใช้กับสินค้า", ""].map((h, i) => (
                  <th
                    key={h || i}
                    className={`border-b px-3 py-3 text-xs font-medium text-[color:var(--color-muted)] ${i === 4 ? "text-right" : "text-left"}`}
                    style={{ borderColor: "var(--color-line)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                // 🔴 <form> วางใน <tr>/<td> ไม่ได้ (HTML ไม่ยอม) — ฟอร์มจริงอยู่ใต้ตาราง
                //    แล้วผูกช่องเข้ากับมันด้วย attribute `form=` ⇒ ทุกคอลัมน์ตรงหัวตารางจริง ๆ
                <tr key={u.id} data-testid={`unit-row-${u.code ?? u.name}`}>
                  <td className="border-b px-3 py-2 text-sm font-medium" style={{ borderColor: "var(--color-line)" }}>
                    {u.code ?? "—"}
                  </td>
                  <td className="border-b px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
                    <input form={`unit-${u.id}`} name="name" defaultValue={u.name} className="input w-full" aria-label="ชื่อไทย" />
                  </td>
                  <td className="border-b px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
                    <input form={`unit-${u.id}`} name="nameEn" defaultValue={u.nameEn ?? ""} placeholder="ชื่ออังกฤษ" className="input w-full" aria-label="ชื่ออังกฤษ" />
                  </td>
                  <td className="border-b px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
                    <div className="flex items-center gap-2">
                      <select form={`unit-${u.id}`} name="kind" defaultValue={(u.kind as UnitKind) ?? "PRODUCT"} className="input w-full" aria-label="ชนิด">
                        {(["PRODUCT", "SERVICE"] as UnitKind[]).map((k) => (
                          <option key={k} value={k}>
                            {UNIT_KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      <SubmitButton form={`unit-${u.id}`} variant="ghost">บันทึก</SubmitButton>
                    </div>
                  </td>
                  <td className="border-b px-3 py-2 text-right text-sm tabular-nums" style={{ borderColor: "var(--color-line)" }} data-testid={`unit-usage-${u.code ?? u.name}`}>
                    {usage.get(u.id) ?? 0}
                  </td>
                  <td className="border-b px-3 py-2 text-right" style={{ borderColor: "var(--color-line)" }}>
                    <ConfirmDialog
                      action={archiveUnitAction}
                      fields={{ systemId, id: u.id }}
                      triggerLabel="ลบ"
                      triggerClassName="text-xs text-[color:var(--color-danger)] underline"
                      title="ลบหน่วยนี้?"
                      detail="สินค้าที่ใช้หน่วยนี้อยู่จะแสดงเป็น “ไม่ระบุหน่วย”"
                      confirmLabel="ยืนยันลบ"
                      danger
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* ฟอร์มแก้ไขต่อแถว (ผูกกับช่องในตารางผ่าน attribute `form=`) */}
      {units.map((u) => (
        <form key={`f-${u.id}`} id={`unit-${u.id}`} action={renameUnitAction} className="hidden">
          <input type="hidden" name="systemId" value={systemId} />
          <input type="hidden" name="id" value={u.id} />
          <input type="hidden" name="code" value={u.code ?? ""} />
        </form>
      ))}

      <section className="card" data-testid="unit-add">
        <h2 className="mb-2 text-sm font-semibold">เพิ่มหน่วย</h2>
        <form action={createUnitAction} className="grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="systemId" value={systemId} />
          <FormField label="ชื่อไทย (≤20)" required>
            <input name="name" required maxLength={20} className="input" data-testid="unit-name" />
          </FormField>
          <FormField label="ชื่ออังกฤษ (≤20)">
            <input name="nameEn" maxLength={20} className="input" data-testid="unit-name-en" />
          </FormField>
          <FormField label="ชนิด" hint="รหัสออกให้อัตโนมัติ (PU/SU)">
            <select name="kind" defaultValue="PRODUCT" className="input" data-testid="unit-kind">
              {(["PRODUCT", "SERVICE"] as UnitKind[]).map((k) => (
                <option key={k} value={k}>
                  {UNIT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </FormField>
          <div className="flex items-end">
            <SubmitButton className="w-full">+ เพิ่มหน่วย</SubmitButton>
          </div>
        </form>
      </section>

      {/* กลุ่มจัดประเภทเอกสาร (ย้ายมาจากแท็บเดิมของหน้าสินค้า — ไม่ใช่ของ §8.3 แต่ห้ามให้ฟีเจอร์หาย) */}
      <section className="card" data-testid="doc-categories">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold">กลุ่มจัดประเภทเอกสาร</h2>
          <span className="text-xs text-[color:var(--color-muted)]">ใช้จัดหมวดเอกสาร ไม่ใช่หมวดสินค้า</span>
          <span className="flex-1" />
          <Link href={`${base}/products`} className="text-xs font-semibold" style={{ color: "var(--color-accent)" }}>
            ไปที่สินค้า/บริการ →
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          {categories.map((c) => {
            const applies = categoryAppliesTo(c.appliesTo);
            return (
              <details key={c.id} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
                <summary className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-[color:var(--color-muted)]">
                    {applies.length === 0 ? "ทุกชนิดเอกสาร" : `${applies.length} ชนิดเอกสาร`}
                  </span>
                </summary>
                <form action={updateCategoryAction} className="mt-2 flex flex-col gap-2">
                  <input type="hidden" name="systemId" value={systemId} />
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" defaultValue={c.name} className="input" />
                  <AppliesToPicker selected={applies} />
                  <SubmitButton variant="ghost" className="self-start">
                    บันทึก
                  </SubmitButton>
                </form>
                <div className="mt-1">
                  <ConfirmDialog
                    action={archiveCategoryAction}
                    fields={{ systemId, id: c.id }}
                    triggerLabel="ลบ"
                    triggerClassName="text-xs text-[color:var(--color-danger)] underline"
                    title="ลบกลุ่มนี้?"
                    detail="กลุ่มจัดประเภทจะถูกลบ (เอกสารเดิมไม่กระทบ)"
                    confirmLabel="ยืนยันลบ"
                    danger
                  />
                </div>
              </details>
            );
          })}
          <details className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
            <summary className="cursor-pointer font-medium">+ เพิ่มกลุ่มจัดประเภท</summary>
            <form action={createCategoryAction} className="mt-2 flex flex-col gap-2">
              <input type="hidden" name="systemId" value={systemId} />
              <FormField label="ชื่อกลุ่ม" hint="เช่น โครงการ A">
                <input name="name" required className="input" />
              </FormField>
              <p className="text-xs text-[color:var(--color-muted)]">ใช้กับเอกสารชนิด (ไม่เลือก = ทุกชนิด):</p>
              <AppliesToPicker selected={[]} />
              <SubmitButton className="self-start">เพิ่มกลุ่ม</SubmitButton>
            </form>
          </details>
        </div>
      </section>
    </div>
  );
}

function AppliesToPicker({ selected }: { selected: AccountDocType[] }) {
  const set = new Set(selected);
  return (
    <div className="flex flex-wrap gap-2">
      {CAT_DOC_OPTIONS.map((o) => (
        <label key={o.code} className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="appliesTo" value={o.code} defaultChecked={set.has(o.code)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

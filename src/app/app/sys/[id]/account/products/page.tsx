import Link from "next/link";
import type { AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  listProducts,
  listUnits,
  listCategories,
  listIncomeAccounts,
  listExpenseAccounts,
  categoryAppliesTo,
  qtyText,
  PRODUCT_TYPE_LABEL,
} from "@/lib/modules/account/product";
import {
  createProductAction,
  updateProductAction,
  archiveProductAction,
  createUnitAction,
  renameUnitAction,
  archiveUnitAction,
  createCategoryAction,
  updateCategoryAction,
  archiveCategoryAction,
} from "@/lib/modules/account/product-actions";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import TabPills from "@/components/ui/TabPills";
import FormField from "@/components/ui/FormField";
import EmptyState from "@/components/ui/EmptyState";
import MoneyText from "@/components/ui/MoneyText";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";

// docType ที่ให้เลือกในกลุ่มจัดประเภท (appliesTo)
const CAT_DOC_OPTIONS: { code: AccountDocType; label: string }[] = [
  { code: "QUOTATION", label: "ใบเสนอราคา" },
  { code: "INVOICE", label: "ใบแจ้งหนี้" },
  { code: "RECEIPT", label: "ใบเสร็จรับเงิน" },
  { code: "TAX_INVOICE", label: "ใบกำกับภาษีขาย" },
  { code: "PURCHASE", label: "บันทึกซื้อ" },
  { code: "EXPENSE", label: "บันทึกค่าใช้จ่าย" },
  { code: "GOODS_ISSUE", label: "ใบเบิกสินค้า" },
];

type Tab = "catalog" | "units" | "categories";

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; err?: string }>;
}) {
  const { id } = await params;
  const { tab: tabRaw, err } = await searchParams;
  const tab: Tab = tabRaw === "units" ? "units" : tabRaw === "categories" ? "categories" : "catalog";
  const { tenantId, systemId } = await loadAccountSystem(id);
  const base = `/app/sys/${id}/account`;

  const [products, units, categories, incomeAccts, expenseAccts] = await Promise.all([
    listProducts(tenantId, systemId, { includeArchived: true }),
    listUnits(tenantId, systemId),
    listCategories(tenantId, systemId),
    listIncomeAccounts(tenantId, systemId),
    listExpenseAccounts(tenantId, systemId),
  ]);
  const unitName = new Map(units.map((u) => [u.id, u.name]));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="สินค้า/บริการ" back={{ href: base, label: "ระบบบัญชี" }} />

      <div className="flex flex-wrap items-center gap-2">
        <TabPills
          active={tab}
          tabs={[
            { key: "catalog", label: "รายการสินค้า", href: "?tab=catalog" },
            { key: "units", label: "หน่วย", href: "?tab=units" },
            { key: "categories", label: "กลุ่มจัดประเภท", href: "?tab=categories" },
          ]}
        />
        <Link href={`${base}/goods-issue`} className="ml-auto text-xs text-[color:var(--color-muted)] underline">
          เบิก/คืนสินค้า →
        </Link>
      </div>

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}

      {tab === "catalog" && (
        <>
          {products.length === 0 ? (
            <EmptyState text="ยังไม่มีสินค้า/บริการ — เพิ่มรายการแรกด้านล่างเพื่อเริ่ม" />
          ) : (
            <div className="flex flex-col gap-2">
              {products.map((p) => (
                <details key={p.id} className="rounded-lg border px-3 py-2 text-sm">
                  <summary className="flex cursor-pointer items-center justify-between gap-2">
                    <span className="flex flex-col">
                      <span className={`font-medium ${p.archivedAt ? "line-through opacity-50" : ""}`}>
                        {p.name}
                        {p.sku && <span className="ml-1 text-xs text-[color:var(--color-muted)]">({p.sku})</span>}
                      </span>
                      <span className="text-xs text-[color:var(--color-muted)]">
                        {PRODUCT_TYPE_LABEL[p.type]}
                        {p.unitId && unitName.get(p.unitId) ? ` · ${unitName.get(p.unitId)}` : ""}
                        {p.type === "GOODS" && ` · คงเหลือ ${qtyText(p.qtyOnHand)}`}
                        {p.salePrice != null && (
                          <>
                            {" · ขาย "}
                            <MoneyText satang={p.salePrice} />
                          </>
                        )}
                      </span>
                    </span>
                  </summary>
                  <ProductForm
                    action={updateProductAction}
                    systemId={systemId}
                    units={units}
                    incomeAccts={incomeAccts}
                    expenseAccts={expenseAccts}
                    product={p}
                  />
                  <div className="mt-2">
                    <ConfirmDialog
                      action={archiveProductAction}
                      fields={{ systemId, id: p.id, archived: p.archivedAt ? "0" : "1" }}
                      triggerLabel={p.archivedAt ? "กู้คืน" : "เก็บเข้าคลัง"}
                      triggerClassName="text-xs text-[color:var(--color-danger)] underline"
                      title={p.archivedAt ? "กู้คืนสินค้านี้?" : "เก็บสินค้านี้เข้าคลัง?"}
                      detail={p.archivedAt ? "สินค้าจะกลับมาใช้งานได้อีกครั้ง" : "สินค้าจะถูกซ่อนจากรายการที่ใช้งาน (ข้อมูลเดิมยังอยู่)"}
                      confirmLabel={p.archivedAt ? "ยืนยันกู้คืน" : "ยืนยันเก็บเข้าคลัง"}
                      danger={!p.archivedAt}
                    />
                  </div>
                </details>
              ))}
            </div>
          )}

          <details className="card" open={products.length === 0}>
            <summary className="cursor-pointer text-sm font-medium">+ เพิ่มสินค้า/บริการ</summary>
            <ProductForm
              action={createProductAction}
              systemId={systemId}
              units={units}
              incomeAccts={incomeAccts}
              expenseAccts={expenseAccts}
            />
          </details>
        </>
      )}

      {tab === "units" && (
        <>
          {units.length === 0 ? (
            <EmptyState text="ยังไม่มีหน่วย (เช่น ชิ้น/กล่อง/ชั่วโมง) — เพิ่มหน่วยแรกด้านล่าง" />
          ) : (
            <div className="flex flex-col gap-2">
              {units.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <form action={renameUnitAction} className="flex flex-1 items-center gap-2">
                    <input type="hidden" name="systemId" value={systemId} />
                    <input type="hidden" name="id" value={u.id} />
                    <input name="name" defaultValue={u.name} className="input flex-1" />
                    <SubmitButton variant="ghost">บันทึก</SubmitButton>
                  </form>
                  <ConfirmDialog
                    action={archiveUnitAction}
                    fields={{ systemId, id: u.id }}
                    triggerLabel="ลบ"
                    triggerClassName="text-xs text-[color:var(--color-danger)] underline"
                    title="ลบหน่วยนี้?"
                    detail="หน่วยจะถูกลบออกจากรายการ"
                    confirmLabel="ยืนยันลบ"
                    danger
                  />
                </div>
              ))}
            </div>
          )}
          <Section title="เพิ่มหน่วย" card>
            <form action={createUnitAction} className="flex items-center gap-2">
              <input type="hidden" name="systemId" value={systemId} />
              <input name="name" required placeholder="ชื่อหน่วย เช่น ชิ้น" className="input flex-1" />
              <SubmitButton>+ เพิ่มหน่วย</SubmitButton>
            </form>
          </Section>
        </>
      )}

      {tab === "categories" && (
        <>
          {categories.length === 0 ? (
            <EmptyState text="ยังไม่มีกลุ่มจัดประเภท — เพิ่มกลุ่มแรกด้านล่างเพื่อจัดหมวดเอกสาร" />
          ) : (
            <div className="flex flex-col gap-2">
              {categories.map((c) => {
                const applies = categoryAppliesTo(c.appliesTo);
                return (
                  <details key={c.id} className="rounded-lg border px-3 py-2 text-sm">
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
            </div>
          )}
          <Section title="เพิ่มกลุ่มจัดประเภท" card>
            <form action={createCategoryAction} className="flex flex-col gap-2">
              <input type="hidden" name="systemId" value={systemId} />
              <FormField label="ชื่อกลุ่ม" hint="เช่น โครงการ A">
                <input name="name" required className="input" />
              </FormField>
              <p className="text-xs text-[color:var(--color-muted)]">ใช้กับเอกสารชนิด (ไม่เลือก = ทุกชนิด):</p>
              <AppliesToPicker selected={[]} />
              <SubmitButton className="self-start">เพิ่มกลุ่ม</SubmitButton>
            </form>
          </Section>
        </>
      )}
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

function ProductForm({
  action,
  systemId,
  units,
  incomeAccts,
  expenseAccts,
  product,
}: {
  action: (formData: FormData) => void | Promise<void>;
  systemId: string;
  units: { id: string; name: string }[];
  incomeAccts: { id: string; code: string; name: string }[];
  expenseAccts: { id: string; code: string; name: string }[];
  product?: {
    id: string;
    sku: string | null;
    name: string;
    nameEn: string | null;
    type: string;
    unitId: string | null;
    salePrice: number | null;
    buyPrice: number | null;
    vatRateBp: number;
    incomeAccountId: string | null;
    expenseAccountId: string | null;
    imageUrl: string | null;
  };
}) {
  const bahtVal = (s: number | null) => (s == null ? "" : String(s / 100));
  return (
    <form action={action} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <input type="hidden" name="systemId" value={systemId} />
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="sm:col-span-2">
        <FormField label="ชื่อสินค้า/บริการ" required>
          <input name="name" required defaultValue={product?.name} className="input" />
        </FormField>
      </div>
      <FormField label="ชื่อภาษาอังกฤษ (ถ้ามี)">
        <input name="nameEn" defaultValue={product?.nameEn ?? ""} className="input" />
      </FormField>
      <FormField label="รหัสสินค้า (SKU)">
        <input name="sku" defaultValue={product?.sku ?? ""} className="input" />
      </FormField>
      <FormField label="ชนิด">
        <select name="type" defaultValue={product?.type ?? "GOODS"} className="input">
          <option value="GOODS">สินค้า (ตัดสต็อกได้)</option>
          <option value="SERVICE">บริการ</option>
        </select>
      </FormField>
      <FormField label="หน่วย">
        <select name="unitId" defaultValue={product?.unitId ?? ""} className="input">
          <option value="">ไม่ระบุ</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </FormField>
      <FormField label="ราคาขาย (บาท)">
        <input name="salePrice" type="number" step="0.01" min="0" defaultValue={bahtVal(product?.salePrice ?? null)} className="input" />
      </FormField>
      <FormField label="ราคาซื้อ (บาท)">
        <input name="buyPrice" type="number" step="0.01" min="0" defaultValue={bahtVal(product?.buyPrice ?? null)} className="input" />
      </FormField>
      <FormField label="ภาษีมูลค่าเพิ่ม (VAT)">
        <select name="vatRateBp" defaultValue={String(product?.vatRateBp ?? 700)} className="input">
          <option value="700">VAT 7%</option>
          <option value="0">VAT 0%</option>
          <option value="-1">ยกเว้น VAT</option>
        </select>
      </FormField>
      <div className="sm:col-span-2">
        <FormField label="ลิงก์รูปภาพ (ถ้ามี)">
          <input name="imageUrl" defaultValue={product?.imageUrl ?? ""} className="input" />
        </FormField>
      </div>
      {incomeAccts.length > 0 && (
        <FormField label="บัญชีรายได้">
          <select name="incomeAccountId" defaultValue={product?.incomeAccountId ?? ""} className="input">
            <option value="">ค่าเริ่มต้น</option>
            {incomeAccts.map((a) => (
              <option key={a.id} value={a.id}>{a.code} {a.name}</option>
            ))}
          </select>
        </FormField>
      )}
      {expenseAccts.length > 0 && (
        <FormField label="บัญชีค่าใช้จ่าย">
          <select name="expenseAccountId" defaultValue={product?.expenseAccountId ?? ""} className="input">
            <option value="">ค่าเริ่มต้น</option>
            {expenseAccts.map((a) => (
              <option key={a.id} value={a.id}>{a.code} {a.name}</option>
            ))}
          </select>
        </FormField>
      )}
      <div className="sm:col-span-2">
        <SubmitButton className="self-start">{product ? "บันทึกการแก้ไข" : "+ เพิ่มสินค้า"}</SubmitButton>
      </div>
    </form>
  );
}

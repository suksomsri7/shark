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
  baht,
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
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";

const inputCls = "rounded-lg border px-2 py-1.5 text-sm";

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

  const tabCls = (t: Tab) =>
    `rounded-full border px-3 py-1 text-xs ${t === tab ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface-2)]" : "hover:bg-[color:var(--color-surface-2)]"}`;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={base} className="text-sm text-[color:var(--color-muted)]">← ระบบบัญชี</Link>
        <h1 className="mt-1 text-2xl font-semibold">สินค้า/บริการ</h1>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={`?tab=catalog`} className={tabCls("catalog")}>รายการสินค้า</Link>
        <Link href={`?tab=units`} className={tabCls("units")}>หน่วย</Link>
        <Link href={`?tab=categories`} className={tabCls("categories")}>กลุ่มจัดประเภท</Link>
        <Link href={`${base}/goods-issue`} className="ml-auto text-xs text-[color:var(--color-muted)] underline">เบิก/คืนสินค้า →</Link>
      </div>

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}

      {tab === "catalog" && (
        <>
          <div className="flex flex-col gap-2">
            {products.length === 0 ? (
              <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีสินค้า/บริการ</p>
            ) : (
              products.map((p) => (
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
                        {p.salePrice != null && ` · ขาย ฿${baht(p.salePrice)}`}
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
              ))
            )}
          </div>

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
          <div className="flex flex-col gap-2">
            {units.length === 0 ? (
              <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีหน่วย (เช่น ชิ้น/กล่อง/ชั่วโมง)</p>
            ) : (
              units.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <form action={renameUnitAction} className="flex flex-1 items-center gap-2">
                    <input type="hidden" name="systemId" value={systemId} />
                    <input type="hidden" name="id" value={u.id} />
                    <input name="name" defaultValue={u.name} className={`${inputCls} flex-1`} />
                    <button className="text-xs text-[color:var(--color-muted)] underline">บันทึก</button>
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
              ))
            )}
          </div>
          <form action={createUnitAction} className="card flex items-center gap-2">
            <input type="hidden" name="systemId" value={systemId} />
            <input name="name" required placeholder="ชื่อหน่วย เช่น ชิ้น" className={`${inputCls} flex-1`} />
            <SubmitButton>+ เพิ่มหน่วย</SubmitButton>
          </form>
        </>
      )}

      {tab === "categories" && (
        <>
          <div className="flex flex-col gap-2">
            {categories.length === 0 ? (
              <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีกลุ่มจัดประเภท</p>
            ) : (
              categories.map((c) => {
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
                      <input name="name" defaultValue={c.name} className={inputCls} />
                      <AppliesToPicker selected={applies} />
                      <button className="btn btn-ghost self-start text-sm">บันทึก</button>
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
              })
            )}
          </div>
          <form action={createCategoryAction} className="card flex flex-col gap-2">
            <input type="hidden" name="systemId" value={systemId} />
            <h2 className="text-sm font-medium">+ เพิ่มกลุ่มจัดประเภท</h2>
            <input name="name" required placeholder="ชื่อกลุ่ม เช่น โครงการ A" className={inputCls} />
            <p className="text-xs text-[color:var(--color-muted)]">ใช้กับเอกสารชนิด (ไม่เลือก = ทุกชนิด):</p>
            <AppliesToPicker selected={[]} />
            <SubmitButton className="self-start">เพิ่มกลุ่ม</SubmitButton>
          </form>
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
      <input name="name" required defaultValue={product?.name} placeholder="ชื่อสินค้า/บริการ" className={`${inputCls} sm:col-span-2`} />
      <input name="nameEn" defaultValue={product?.nameEn ?? ""} placeholder="ชื่อภาษาอังกฤษ (ถ้ามี)" className={inputCls} />
      <input name="sku" defaultValue={product?.sku ?? ""} placeholder="รหัสสินค้า (SKU)" className={inputCls} />
      <select name="type" defaultValue={product?.type ?? "GOODS"} className={inputCls}>
        <option value="GOODS">สินค้า (ตัดสต็อกได้)</option>
        <option value="SERVICE">บริการ</option>
      </select>
      <select name="unitId" defaultValue={product?.unitId ?? ""} className={inputCls}>
        <option value="">หน่วย (ไม่ระบุ)</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <input name="salePrice" type="number" step="0.01" min="0" defaultValue={bahtVal(product?.salePrice ?? null)} placeholder="ราคาขาย (บาท)" className={inputCls} />
      <input name="buyPrice" type="number" step="0.01" min="0" defaultValue={bahtVal(product?.buyPrice ?? null)} placeholder="ราคาซื้อ (บาท)" className={inputCls} />
      <select name="vatRateBp" defaultValue={String(product?.vatRateBp ?? 700)} className={inputCls}>
        <option value="700">VAT 7%</option>
        <option value="0">VAT 0%</option>
        <option value="-1">ยกเว้น VAT</option>
      </select>
      <input name="imageUrl" defaultValue={product?.imageUrl ?? ""} placeholder="URL รูปภาพ (ถ้ามี)" className={`${inputCls} sm:col-span-2`} />
      {incomeAccts.length > 0 && (
        <select name="incomeAccountId" defaultValue={product?.incomeAccountId ?? ""} className={inputCls}>
          <option value="">บัญชีรายได้ (ค่าเริ่มต้น)</option>
          {incomeAccts.map((a) => (
            <option key={a.id} value={a.id}>{a.code} {a.name}</option>
          ))}
        </select>
      )}
      {expenseAccts.length > 0 && (
        <select name="expenseAccountId" defaultValue={product?.expenseAccountId ?? ""} className={inputCls}>
          <option value="">บัญชีค่าใช้จ่าย (ค่าเริ่มต้น)</option>
          {expenseAccts.map((a) => (
            <option key={a.id} value={a.id}>{a.code} {a.name}</option>
          ))}
        </select>
      )}
      <SubmitButton className="self-start sm:col-span-2">{product ? "บันทึกการแก้ไข" : "+ เพิ่มสินค้า"}</SubmitButton>
    </form>
  );
}

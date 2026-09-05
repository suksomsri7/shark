// หน้าสินค้า/บริการ V2 (WO 4.3 · DESIGN-SPEC-V2 §8.1–8.2)
// เฟรม: f6-products.png (รายการ) · f6-products-menu.png (เมนูทำรายการ) · g8-product-modal.png (modal)
// modal เปิดด้วย query: ?new=1 (เพิ่ม) · ?edit=<id> (แก้ไข) · &mtab=basic|advanced · &atab=info|price|accounting|opening|links
import Link from "next/link";
import { requireAccountPage } from "@/lib/modules/account/guard";
import {
  listProductsPaged,
  trackedProductCards,
  listUnits,
  listIncomeAccounts,
  listExpenseAccounts,
  listWarehouses,
  productModalData,
  nextProductCode,
  qtyText,
  baht,
  PRODUCT_TYPE_LABEL,
} from "@/lib/modules/account/product";
// WO 9.4 §0.3 ข้อ 8 — เก็บถาวรสินค้าไม่กินเลขที่/ไม่ลงเงิน ⇒ เลิกทำได้ภายใน 5 นาที (redirect+`?undo=` — server component)
import { archiveProductFormAction } from "@/lib/modules/account/undo-stack";
import { inventorySystemId } from "@/lib/modules/account/inventory-link";
import { getAccMode } from "@/components/account-v2/mode";
import { ProductsPanel, type ProductRow, type ProductTypeTab } from "@/components/account-v2/ProductsPanel";
import { ProductModal } from "@/components/account-v2/ProductModal";
import type { RowActionItem } from "@/components/account-v2/RowActions";
import type { AccountProductType } from "@prisma/client";
import { buildHref } from "@/components/account-v2/url";

const TYPE_KEYS: Record<string, AccountProductType> = { goods: "GOODS", service: "SERVICE", bundle: "BUNDLE" };
const KEY_OF: Record<AccountProductType, string> = { GOODS: "goods", SERVICE: "service", BUNDLE: "bundle" };

const vatLabel = (bp: number) => (bp < 0 ? "ยกเว้น" : `${bp / 100}%`);

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await requireAccountPage(id, "account.product.manage");
  const base = `/app/sys/${id}/account`;
  const pathname = `${base}/products`;

  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined));
  const type = TYPE_KEYS[one("type") ?? "goods"] ?? "GOODS";
  const sub = one("sub") === "archived" ? "archived" : "active";
  const q = (one("q") ?? "").trim();
  const category = (one("category") ?? "").trim();
  const page = Math.max(Number.parseInt(one("page") ?? "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(one("pageSize") ?? "8", 10) || 8, 1), 100);

  const [result, cards, invSystemId, mode] = await Promise.all([
    listProductsPaged(tenantId, systemId, { type, sub, q: q || undefined, category: category || undefined, page, pageSize }),
    trackedProductCards(tenantId, systemId, 6),
    inventorySystemId(tenantId),
    getAccMode(),
  ]);

  // ── modal (§8.2 · g8) ──
  const editId = one("edit") ?? "";
  const wantModal = one("new") === "1" || !!editId;
  const modalData = editId ? await productModalData(tenantId, systemId, editId) : null;
  const [units, incomeAccounts, expenseAccounts, warehouses, nextCode, pickPage] = wantModal
    ? await Promise.all([
        listUnits(tenantId, systemId),
        listIncomeAccounts(tenantId, systemId),
        listExpenseAccounts(tenantId, systemId),
        listWarehouses(tenantId),
        modalData ? Promise.resolve(modalData.product.code ?? "") : nextProductCode(systemId, "GOODS"),
        listProductsPaged(tenantId, systemId, { type: "GOODS", pageSize: 100 }),
      ])
    : [[], [], [], [], "", null];

  const typeTabs: ProductTypeTab[] = (["GOODS", "SERVICE", "BUNDLE"] as AccountProductType[]).map((t) => ({
    key: KEY_OF[t],
    label: PRODUCT_TYPE_LABEL[t],
    count: result.counts[t],
    href: buildHref(pathname, sp, { type: KEY_OF[t], page: undefined, sub: undefined }),
    active: t === type,
  }));
  const subTabs: ProductTypeTab[] = [
    { key: "all", label: "ทั้งหมด", count: result.counts.active, href: buildHref(pathname, sp, { sub: undefined, page: undefined }), active: sub === "active" },
    { key: "archived", label: "ปิดใช้งาน", count: result.counts.archived, href: buildHref(pathname, sp, { sub: "archived", page: undefined }), active: sub === "archived" },
  ];

  const rows: ProductRow[] = result.rows.map((p) => {
    const code = p.code ?? p.sku ?? p.id.slice(-6);
    const editHref = buildHref(pathname, sp, { edit: p.id, new: undefined, mtab: "basic" });
    const tracked = !!p.invItemId;
    const stockCell =
      p.type === "GOODS" ? (
        <span style={p.stock < 0 ? { color: "var(--color-danger)", fontWeight: 700 } : undefined} data-testid={`product-stock-${code}`}>
          {qtyText(p.stock)}
        </span>
      ) : (
        <span className="rounded-full border px-2 py-0.5 text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
          ไม่ติดตามสต็อก
        </span>
      );
    const nameCell = (
      <span className="flex min-w-0 items-center gap-2">
        {/* §8.1 "รูป (thumb 32)" — เฟรม f6 ไม่มีคอลัมน์รูปแยก จึงวางไว้หน้าชื่อ (จดใน wo-notes) */}
        {p.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" loading="lazy" decoding="async" />
        )}
        <span className={`truncate font-semibold ${p.archivedAt ? "line-through opacity-50" : ""}`}>{p.name}</span>
        {p.posEnabled && (
          <span className="shrink-0 text-xs text-[color:var(--color-muted)]" title="ขายผ่าน POS" data-testid={`product-pos-${code}`}>
            ✓ POS
          </span>
        )}
      </span>
    );
    const rowActions: RowActionItem[] = [
      { label: "แก้ไขสินค้า", href: editHref, icon: "edit" },
      ...(p.type === "GOODS"
        ? [
            { label: "เบิกสินค้า", href: `${base}/goods-issue/new?product=${p.id}`, icon: "truck" },
            { label: "รับเข้าคลัง", href: invSystemId ? `/app/sys/${invSystemId}/inventory` : `${base}/products`, icon: "in" },
            { label: "ปรับต้นทุน", href: `${base}/cost-adjustment/new?product=${p.id}`, icon: "pct" },
            { label: "ดูความเคลื่อนไหว", href: `${base}/goods-issue?q=${encodeURIComponent(p.name)}`, icon: "clock" },
          ]
        : []),
      {
        label: p.archivedAt ? "เปิดใช้งาน" : "ปิดใช้งาน",
        icon: "x",
        danger: !p.archivedAt,
        sepBefore: true,
        submit: {
          action: archiveProductFormAction,
          fields: { systemId, id: p.id, archived: p.archivedAt ? "0" : "1" },
        },
      },
    ];
    return {
      id: p.id,
      code,
      cells: [
        <Link key="code" href={editHref} className="font-medium" style={{ color: "var(--color-accent)" }}>
          {code}
        </Link>,
        nameCell,
        p.category ?? "—",
        p.unitName ?? "—",
        stockCell,
        p.buyPrice == null ? "—" : `฿${baht(p.buyPrice)}`,
        p.salePrice == null ? "—" : `฿${baht(p.salePrice)}`,
        vatLabel(p.vatRateBp),
      ],
      rowActions,
      mobile: {
        title: (
          <Link href={editHref} style={{ color: "var(--color-accent)" }}>
            {code} · {p.name}
          </Link>
        ),
        subtitle: `${p.category ?? "ไม่ระบุหมวด"} · ${p.unitName ?? "ไม่ระบุหน่วย"}${tracked ? " · ติดตามสต็อก" : ""}`,
        trailing: p.salePrice == null ? "—" : `฿${baht(p.salePrice)}`,
        foot: p.type === "GOODS" ? `คงเหลือ ${qtyText(p.stock)}` : "ไม่ติดตามสต็อก",
      },
    };
  });

  return (
    <>
      <ProductsPanel
        pathname={pathname}
        searchParams={sp}
        typeTabs={typeTabs}
        subTabs={subTabs}
        trackedCards={cards.map((c) => ({
          id: c.id,
          name: c.name,
          stockText: qtyText(c.stock),
          reorderText: `ขั้นต่ำ ${qtyText(c.reorderPoint)}`,
          ratio: c.ratio,
          negative: c.negative,
          low: c.low,
        }))}
        trackedHref={`${base}/products?type=goods`}
        inventoryHref={invSystemId ? `/app/sys/${invSystemId}/inventory` : null}
        importHref={`${base}/import/products`}
        createHref={buildHref(pathname, sp, { new: "1", edit: undefined, mtab: "basic" })}
        categories={result.categories}
        activeCategory={category || undefined}
        searchQ={q || undefined}
        rows={rows}
        page={result.page}
        pageSize={result.pageSize}
        pageCount={result.pageCount}
        total={result.total}
        stockValueText={type === "GOODS" ? `฿${baht(result.stockValue)}` : null}
        emptyText={
          q
            ? `ไม่พบสินค้าที่ตรงกับ “${q}” — ลองคำอื่น หรือเพิ่มสินค้าใหม่`
            : "ยังไม่มีรายการในหมวดนี้ — กด “+ เพิ่มสินค้า” เพื่อเริ่ม"
        }
        errorText={one("err")}
      />
      {wantModal && (
        <ProductModal
          systemId={systemId}
          productsPath={buildHref(pathname, sp, { new: undefined, edit: undefined, mtab: undefined, atab: undefined })}
          nextCode={String(nextCode)}
          product={
            modalData
              ? {
                  id: modalData.product.id,
                  code: modalData.product.code,
                  type: modalData.product.type,
                  name: modalData.product.name,
                  nameEn: modalData.product.nameEn,
                  sku: modalData.product.sku,
                  barcode: modalData.product.barcode,
                  category: modalData.product.category,
                  description: modalData.product.description,
                  unitId: modalData.product.unitId,
                  salePrice: modalData.product.salePrice,
                  buyPrice: modalData.product.buyPrice,
                  vatRateBp: modalData.product.vatRateBp,
                  purchaseVatRateBp: modalData.product.purchaseVatRateBp,
                  incomeAccountId: modalData.product.incomeAccountId,
                  expenseAccountId: modalData.product.expenseAccountId,
                  cogsAccountCode: modalData.product.cogsAccountCode,
                  inventoryAccountCode: modalData.product.inventoryAccountCode,
                  costMethod: modalData.product.costMethod,
                  defaultWhtType: modalData.product.defaultWhtType,
                  defaultWhtRateBp: modalData.product.defaultWhtRateBp,
                  posEnabled: modalData.product.posEnabled,
                  posCategory: modalData.product.posCategory,
                  posPrice: modalData.product.posPrice,
                  bookingEnabled: modalData.product.bookingEnabled,
                  bookingDurationMin: modalData.product.bookingDurationMin,
                  bookingDepositSatang: modalData.product.bookingDepositSatang,
                  imageUrls: Array.isArray(modalData.product.imageUrls) ? (modalData.product.imageUrls as string[]) : [],
                  invItemId: modalData.product.invItemId,
                  warehouseId: modalData.product.warehouseId,
                  item: modalData.item,
                  bundleItems: modalData.bundleItems.map((b) => ({
                    componentProductId: b.componentProductId,
                    qty: b.qty,
                    name: b.name,
                    code: b.code,
                  })),
                  openingLots: modalData.openingLots.map((l) => ({
                    id: l.id,
                    seq: l.seq,
                    lotDate: l.lotDate.toISOString(),
                    qty: qtyText(l.qty as unknown as number),
                    unitCost: l.unitCost,
                    warehouseName: warehouses.find((w) => w.id === l.warehouseId)?.name ?? null,
                  })),
                }
              : null
          }
          units={units.map((u) => ({ id: u.id, name: u.name, kind: u.kind }))}
          incomeAccounts={incomeAccounts}
          expenseAccounts={expenseAccounts}
          warehouses={warehouses}
          pickable={(pickPage?.rows ?? [])
            .filter((r) => r.id !== editId)
            .map((r) => ({ id: r.id, code: r.code, name: r.name, type: r.type, salePrice: r.salePrice }))}
          categories={result.categories}
          defaultTab={one("mtab") === "advanced" ? "advanced" : "basic"}
          defaultAdvTab={
            (["info", "price", "accounting", "opening", "links"].includes(one("atab") ?? "")
              ? (one("atab") as "info" | "price" | "accounting" | "opening" | "links")
              : "links")
          }
          ssrMode={mode}
          hasInventorySystem={!!invSystemId}
        />
      )}
    </>
  );
}

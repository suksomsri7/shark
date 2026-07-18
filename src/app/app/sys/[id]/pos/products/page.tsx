import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { assertCan } from "@/lib/core/rbac";
import { systemDef } from "@/lib/systems";
import { listPosProducts } from "@/lib/modules/pos/register";
import { setItemSalePriceAction } from "@/lib/actions/pos";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { MoneyText } from "@/components/ui/MoneyText";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ModuleTabs } from "@/components/module-tabs";

// หน้า "สินค้า/ราคา" ของ POS — ตั้งราคาขายต่อสินค้าในคลังที่ผูกระบบขาย
// ราคาขายเก็บที่ AccountProduct.salePrice (master data) → register อ่านผ่าน posCatalog
export default async function PosProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { err, ok } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "pos", action: "pos.product.setPrice" },
  );
  const def = systemDef(sys.type);

  const tabs = [
    { href: `/app/sys/${id}`, label: "ภาพรวม" },
    { href: `/app/sys/${id}/pos/register`, label: "ขาย" },
    { href: `/app/sys/${id}/pos/products`, label: "สินค้า/ราคา" },
    { href: `/app/sys/${id}/pos/sales`, label: "ประวัติบิล" },
    { href: `/app/sys/${id}/pos/close`, label: "ปิดวัน" },
  ];

  const { inventorySystemId, accountSystemId, items } = await listPosProducts(tenantId, id);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="สินค้า/ราคา — ตั้งราคาขายหน้าร้าน" />
      <ModuleTabs items={tabs} />

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
      {ok && <p className="text-sm text-[color:var(--color-success)]">บันทึกราคาขายแล้ว</p>}

      {!inventorySystemId ? (
        <EmptyState
          text="ยังตั้งราคาไม่ได้ — เชื่อมระบบคลังสินค้ากับระบบขายนี้ก่อนที่หน้าภาพรวม"
          action={{ href: `/app/sys/${id}`, label: "ไปเชื่อมคลัง" }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          text="ยังไม่มีสินค้าในคลัง — เพิ่มสินค้าในระบบคลังก่อน แล้วกลับมาตั้งราคาขาย"
          action={{ href: `/app/sys/${inventorySystemId}`, label: "ไปเพิ่มสินค้าในคลัง" }}
        />
      ) : (
        <>
          {!accountSystemId && (
            <p className="rounded-xl border border-dashed p-2.5 text-xs text-[color:var(--color-muted)]">
              ตั้งราคาสินค้าที่ยังไม่มีราคาต้องเชื่อมระบบบัญชีก่อน —{" "}
              <Link href="/app/settings/systems" className="text-[color:var(--color-accent)] underline">
                เปิด/เชื่อมระบบบัญชี
              </Link>
            </p>
          )}
          <Section>
            <p className="mb-2 text-xs text-[color:var(--color-muted)]">
              ราคาที่ตั้งไว้จะขึ้นให้อัตโนมัติในหน้าขาย · สินค้าที่ยังไม่ตั้งราคา หน้าขายจะใช้ต้นทุนเป็นราคาเริ่มต้น
            </p>
            <div className="flex flex-col gap-2">
              {items.map((it) => (
                <form
                  key={it.id}
                  action={setItemSalePriceAction}
                  className="flex flex-wrap items-end gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <input type="hidden" name="systemId" value={id} />
                  <input type="hidden" name="itemId" value={it.id} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{it.name}</span>
                    <span className="text-xs text-[color:var(--color-muted)]">
                      {it.sku} · ต่อ {it.unitLabel} · ต้นทุน <MoneyText satang={it.costSatang} />
                      {it.salePriceSatang == null && " · ยังไม่ตั้งราคาขาย"}
                    </span>
                  </div>
                  <label className="flex flex-col text-xs text-[color:var(--color-muted)]">
                    ราคาขาย (บาท)
                    <input
                      name="salePrice"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      defaultValue={it.salePriceSatang != null ? String(it.salePriceSatang / 100) : ""}
                      placeholder="0.00"
                      className="input w-28"
                    />
                  </label>
                  <SubmitButton variant="ghost">บันทึก</SubmitButton>
                </form>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { assertCan } from "@/lib/core/rbac";
import { systemDef } from "@/lib/systems";
import { listPosProducts, posUnits, posServices } from "@/lib/modules/pos/register";
import { setItemSalePriceAction } from "@/lib/actions/pos";
import { posTabs } from "@/lib/modules/pos/tabs";
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

  const tabs = posTabs(id);

  const { inventorySystemId, accountSystemId, items } = await listPosProducts(tenantId, id);
  // บริการมาจากแคตตาล็อกกลาง (ต้นฉบับเดียวกับหน้าจอง) — หน้านี้อ่านอย่างเดียว
  const services = await posServices(tenantId, inventorySystemId);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="บริการ/สินค้า — ตั้งรายการที่ขายหน้าร้าน" />
      <ModuleTabs items={tabs} />

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
      {ok && <p className="text-sm text-[color:var(--color-success)]">{ok}</p>}

      {/* ── บริการ ── อ่านอย่างเดียว: ต้นฉบับอยู่ระบบสินค้า/บริการ (เจ้าของสั่งข้อ 14-15) */}
      <Section title="บริการ">
        <p className="mb-2 text-xs text-[color:var(--color-muted)]">
          บริการที่ขายหน้าร้านได้ — <b>เพิ่ม/แก้ราคา/ลบ ทำที่ระบบสินค้า/บริการที่เดียว</b> แล้วทั้งหน้าขายและหน้าจองเห็นตรงกัน
          {" · "}บริการไม่ตัดสต็อก
        </p>
        {!inventorySystemId ? (
          <EmptyState
            text="ยังไม่ได้เชื่อมระบบสินค้า/บริการ — เชื่อมที่หน้าภาพรวมก่อน แล้วบริการจะมาโผล่ที่นี่"
            action={{ href: `/app/sys/${id}`, label: "ไปเชื่อมระบบ" }}
          />
        ) : services.length === 0 ? (
          <EmptyState
            text="ยังไม่มีบริการในแคตตาล็อก — เพิ่มที่ระบบสินค้า/บริการ แท็บ “บริการ”"
            action={{ href: `/app/sys/${inventorySystemId}/inventory/services`, label: "ไปเพิ่มบริการ" }}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {services.map((sv) => (
              <div key={sv.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{sv.name}</span>
                  <span className="block truncate text-xs text-[color:var(--color-muted)]">
                    {sv.bookable ? `จองล่วงหน้าได้${sv.durationMin ? ` · ใช้เวลา ${sv.durationMin} นาที` : ""}` : "ขายหน้าร้านอย่างเดียว"}
                  </span>
                </span>
                <MoneyText satang={sv.priceSatang} />
              </div>
            ))}
            <Link href={`/app/sys/${inventorySystemId}/inventory/services`} className="text-xs underline">
              แก้ราคา/เพิ่มบริการที่ระบบสินค้า/บริการ →
            </Link>
          </div>
        )}
      </Section>

      {!inventorySystemId ? (
        <EmptyState
          text="ยังไม่ได้เชื่อมระบบสินค้า/บริการ — ร้านที่ขายสินค้าด้วยให้เชื่อมก่อนที่หน้าภาพรวม (ร้านที่ขายเฉพาะบริการไม่ต้องเชื่อมก็ได้)"
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

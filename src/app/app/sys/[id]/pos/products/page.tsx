import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { assertCan } from "@/lib/core/rbac";
import { systemDef } from "@/lib/systems";
import { listPosProducts, posUnits, posServices } from "@/lib/modules/pos/register";
import {
  setItemSalePriceAction,
  addPosServiceAction,
  setPosServicePriceAction,
  removePosServiceAction,
} from "@/lib/actions/pos";
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
    { href: `/app/sys/${id}/pos/products`, label: "บริการ/สินค้า" },
    { href: `/app/sys/${id}/pos/sales`, label: "ประวัติบิล" },
    { href: `/app/sys/${id}/pos/close`, label: "ปิดวัน" },
  ];

  const { inventorySystemId, accountSystemId, items } = await listPosProducts(tenantId, id);
  // บริการของหน้างานที่ผูก POS — ร้านบริการ (ตัดผม/นวด/คลินิก) ขายบริการเป็นหลัก ไม่ใช่สินค้า
  // ใช้ BookingService ตัวเดียวกับระบบจอง → ตั้งราคาที่นี่ก็เห็นที่หน้าจอง ไม่มีข้อมูลซ้ำสองที่
  const units = await posUnits(tenantId, id);
  const serviceUnit = units[0] ?? null;
  const services = serviceUnit ? await posServices(tenantId, serviceUnit.id) : [];

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="บริการ/สินค้า — ตั้งรายการที่ขายหน้าร้าน" />
      <ModuleTabs items={tabs} />

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
      {ok && <p className="text-sm text-[color:var(--color-success)]">{ok}</p>}

      {/* ── บริการ ── ต้องมาก่อนสินค้า: ร้านบริการเปิดหน้านี้มาเพื่อตั้งราคาบริการ */}
      {serviceUnit && (
        <Section title="บริการ">
          <p className="mb-2 text-xs text-[color:var(--color-muted)]">
            รายการที่ไม่ใช่ของในคลัง — ทั้งงานบริการ (ตัดผม นวด ซ่อม) และค่าบริการอื่น (ค่าจัดส่ง ห่อของขวัญ ค่าติดตั้ง)
            {" · "}ขึ้นให้กดในหน้าขายทันที ไม่ตัดสต็อก
            {" · "}ติ๊ก “ให้จองล่วงหน้าได้” เฉพาะรายการที่ต้องจองคิว — รายการนั้นจะไปโผล่ในระบบจองด้วย
          </p>

          <div className="flex flex-col gap-2">
            {services.map((sv) => (
              <div key={sv.id} className="flex flex-wrap items-end gap-2 rounded-lg border px-3 py-2 text-sm">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{sv.name}</span>
                  <span className="text-xs text-[color:var(--color-muted)]">
                    {sv.bookable ? `จองล่วงหน้าได้ · ใช้เวลา ${sv.durationMin} นาที` : "ขายหน้าร้านอย่างเดียว"}
                  </span>
                </div>
                <form action={setPosServicePriceAction} className="flex items-end gap-2">
                  <input type="hidden" name="systemId" value={id} />
                  <input type="hidden" name="unitId" value={serviceUnit.id} />
                  <input type="hidden" name="serviceId" value={sv.id} />
                  <label className="flex flex-col text-xs text-[color:var(--color-muted)]">
                    ราคา (บาท)
                    <input
                      name="priceBaht"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      defaultValue={String(sv.priceSatang / 100)}
                      className="input w-28"
                    />
                  </label>
                  <SubmitButton variant="ghost">บันทึก</SubmitButton>
                </form>
                <form action={removePosServiceAction}>
                  <input type="hidden" name="systemId" value={id} />
                  <input type="hidden" name="unitId" value={serviceUnit.id} />
                  <input type="hidden" name="serviceId" value={sv.id} />
                  <SubmitButton variant="ghost">เอาออก</SubmitButton>
                </form>
              </div>
            ))}

            {/* เพิ่มบริการใหม่ — ฟอร์มเดียวจบ ไม่ต้องเด้งไปหน้าอื่น */}
            <form action={addPosServiceAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
              <input type="hidden" name="systemId" value={id} />
              <input type="hidden" name="unitId" value={serviceUnit.id} />
              <label className="flex min-w-0 flex-1 flex-col text-xs text-[color:var(--color-muted)]">
                ชื่อบริการ
                <input name="name" placeholder="เช่น ตัดผมชาย" className="input" maxLength={80} />
              </label>
              <label className="flex flex-col text-xs text-[color:var(--color-muted)]">
                ราคา (บาท)
                <input name="priceBaht" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" className="input w-24" />
              </label>
              <label className="flex flex-col text-xs text-[color:var(--color-muted)]">
                ใช้เวลา (นาที)
                <input name="durationMin" type="number" min="5" max="600" inputMode="numeric" defaultValue={30} className="input w-24" />
              </label>
              <label className="flex items-center gap-1.5 self-end pb-2 text-xs">
                {/* ค่าเริ่มต้นตามชนิดหน้างาน: หน้างานจองคิว = ติ๊กไว้ · หน้างานอื่น (ร้านค้า/ร้านอาหาร) = ไม่ติ๊ก */}
                <input type="checkbox" name="bookable" defaultChecked={serviceUnit.type === "BOOKING"} />
                ให้จองล่วงหน้าได้
              </label>
              <SubmitButton>+ เพิ่มบริการ</SubmitButton>
            </form>
          </div>
        </Section>
      )}

      {!inventorySystemId ? (
        <EmptyState
          text="ยังไม่ได้เชื่อมคลังสินค้า — ร้านที่ขายสินค้าด้วยให้เชื่อมคลังก่อนที่หน้าภาพรวม (ร้านที่ขายเฉพาะบริการไม่ต้องเชื่อมก็ได้)"
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { getPaymentProfile } from "@/lib/payment/service";
import { posUnits, resolvePosLinks, posCatalog, posMembers } from "@/lib/modules/pos/register";
import { PosRegister } from "@/lib/modules/pos/register-ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าขาย POS (cashier) — เปิดบิลเก็บเงิน walk-in เงินสด/พร้อมเพย์
export default async function PosRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const { id } = await params;
  const { unit: unitParam } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  const tabs = [
    { href: `/app/sys/${id}`, label: "ภาพรวม" },
    { href: `/app/sys/${id}/pos/register`, label: "ขาย" },
    { href: `/app/sys/${id}/pos/products`, label: "สินค้า/ราคา" },
    { href: `/app/sys/${id}/pos/sales`, label: "ประวัติบิล" },
    { href: `/app/sys/${id}/pos/close`, label: "ปิดวัน" },
  ];

  const units = await posUnits(tenantId, id);

  // ยังไม่ผูก POS กับกิจการใด → ขายไม่ได้ (createSale ต้องมี unit) → ชี้ไปเชื่อม
  if (units.length === 0) {
    return (
      <div className="flex max-w-2xl flex-col gap-5">
        <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="หน้าขาย" />
        <ModuleTabs items={tabs} />
        <EmptyState
          text="ยังเปิดขายไม่ได้ — เชื่อมระบบขายนี้กับกิจการ (สาขา/หน้าร้าน) ก่อนที่หน้าภาพรวม"
          action={{ href: `/app/sys/${id}`, label: "ไปเชื่อมกิจการ" }}
        />
      </div>
    );
  }

  // เลือก unit ที่จะขาย: จาก ?unit= ถ้าถูกต้อง ไม่งั้นตัวแรก
  const active = units.find((u) => u.id === unitParam) ?? units[0];

  const [links, profile] = await Promise.all([resolvePosLinks(tenantId, active.id), getPaymentProfile({ tenantId })]);
  const [catalog, members] = await Promise.all([
    links.inventorySystemId ? posCatalog(tenantId, links.inventorySystemId) : Promise.resolve([]),
    links.memberSystemId ? posMembers(tenantId, links.memberSystemId) : Promise.resolve([]),
  ]);
  const hasPromptPay = !!profile?.promptpayId;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="หน้าขาย — เปิดบิลเก็บเงิน" />
      <ModuleTabs items={tabs} />

      {/* เลือกจุดขาย (เมื่อมีหลายสาขาผูก POS นี้) */}
      {units.length > 1 && (
        <div className="-mb-1 flex flex-wrap gap-2">
          {units.map((u) => (
            <Link
              key={u.id}
              href={`/app/sys/${id}/pos/register?unit=${u.id}`}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                u.id === active.id ? "border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)] font-medium" : "hover:bg-[color:var(--color-surface-2)]"
              }`}
            >
              {u.name}
            </Link>
          ))}
        </div>
      )}

      {!hasPromptPay && (
        <p className="rounded-xl border border-dashed p-2.5 text-xs text-[color:var(--color-muted)]">
          รับพร้อมเพย์ได้ด้วย —{" "}
          <Link href="/app/settings/payment" className="text-[color:var(--color-accent)] underline">
            ตั้ง PromptPay ID ของร้าน
          </Link>
        </p>
      )}

      <Section>
        <PosRegister
          systemId={id}
          unitId={active.id}
          catalog={catalog}
          members={members}
          couponEnabled={!!links.couponSystemId}
          hasPromptPay={hasPromptPay}
        />
      </Section>
    </div>
  );
}

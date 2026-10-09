import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { systemDef } from "@/lib/systems";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership } from "@/lib/modules/pos/access";
import { posUnits } from "@/lib/modules/pos/register";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { SettingsShell } from "@/components/pos/settings/SettingsShell";
import { posSettingsTabOf } from "@/components/pos/settings/settings-tabs";
import { ReceiptSettings } from "./ReceiptSettings";
import { DeviceSettings } from "./DeviceSettings";
// POS P1.7U ▸ แท็บ "วิธีรับเงิน" (มติ 6): ค่าตั้ง settings.pos.payment · คีย์ Beam ของแพลตฟอร์มเป็น boolean เท่านั้น · PromptPay ID จาก PaymentProfile ◂
import { PaymentSettings } from "./PaymentSettings";
import { beamEnabled } from "@/lib/payment/beam";
import { getPaymentProfile, maskPromptPayId } from "@/lib/payment/service";
import { parsePosIntentSettings } from "@/lib/modules/pos/payment-intent-shared";
import { SettingsRefusal } from "./settings-ui";

// POS P1.10 U — หน้าตั้งค่าหน้าขาย /pos/settings (ภาพ 17A ใบเสร็จและภาษี · 17B เครื่องและเครื่องพิมพ์) · โครง = SettingsShell + ทะเบียนแท็บ (มติ CD1)
//   ข้อมูลของแต่ละแท็บโหลดฝั่ง client ผ่าน action (รหัสเครื่องของเบราว์เซอร์อยู่ใน localStorage) · คำปฏิเสธเป็นข้อมูล
// 🔴 สิทธิ์จริงตัดสินใน action/บริการ — หน้านี้แค่: เลือกสาขาที่เข้าได้ · บอกจอว่าแก้ได้ไหม
//    อ่านหน้า = pos.sale.create หรือ pos.device.manage ที่สาขา · แก้ใบเสร็จ = pos.device.manage (บริการตรวจครบทุกสาขาที่ผูก · F9) ·
//    แท็บเครื่อง = pos.device.manage ที่สาขา (ไม่มี = การ์ดปฏิเสธ หน้า 200)
export default async function PosSettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ unit?: string; tab?: string }> }) {
  const { id } = await params;
  const { unit, tab: rawTab } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  const m = posMembership(auth.active);
  const units = (await posUnits(tenantId, id)).filter((u) => canAccessUnit(m, u.id)).map((u) => ({ id: u.id, name: u.name }));
  if (units.length === 0) notFound();
  const unitId = units.some((u) => u.id === unit) ? unit! : units[0]!.id;
  const tab = posSettingsTabOf(rawTab);
  const canManageDevices = evaluate(m, { module: "pos", action: "pos.device.manage", unitId });
  const canRead = canManageDevices || evaluate(m, { module: "pos", action: "pos.sale.create", unitId });
  const canEditReceipt = evaluate(m, { module: "pos", action: "pos.device.manage" });
  const def = systemDef(sys.type);
  const t = await getTranslations("pos.settings");
  const payProfile = tab === "payments" && canRead ? await getPaymentProfile({ tenantId }) : null;
  const ppId = payProfile?.promptpayId?.trim() || null;
  return (
    <div className="flex w-full min-w-0 max-w-7xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      <ModuleTabs items={posTabs(id)} data-testid="pos-settings-module-tabs" />
      <SettingsShell systemId={id} active={tab} units={units} unitId={unitId}>
        {!canRead ? (
          <SettingsRefusal message={t("refusal")} />
        ) : tab === "payments" ? (
          <PaymentSettings
            systemId={id}
            canEdit={canEditReceipt}
            initial={parsePosIntentSettings(sys.settings)}
            beamConfigured={beamEnabled()}
            promptpayId={canEditReceipt ? ppId : maskPromptPayId(ppId)}
            promptpayLink="/app/settings/payment"
          />
        ) : tab === "receipt" ? (
          <ReceiptSettings systemId={id} unitId={unitId} branchName={units.find((u) => u.id === unitId)?.name ?? ""} canEdit={canEditReceipt} canManageDevices={canManageDevices} />
        ) : canManageDevices ? (
          <DeviceSettings systemId={id} unitId={unitId} shopName={sys.name} />
        ) : (
          <SettingsRefusal message={t("devicesRefusal")} />
        )}
      </SettingsShell>
    </div>
  );
}

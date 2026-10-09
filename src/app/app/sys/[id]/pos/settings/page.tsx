import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { systemDef } from "@/lib/systems";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership } from "@/lib/modules/pos/access";
import { canManageAllLinkedUnits } from "@/lib/modules/pos/receipt-settings"; // POS P1.18 ▸ FU-c ◂
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
// POS P1.18U ▸ แท็บที่เหลือ 5 แท็บ (มติ 1–7) — ข้อมูลโหลดฝั่ง client ผ่าน action · หน้านี้ส่งเฉพาะค่าที่อ่านจากค่าตั้งได้ทันที ◂
import { promptpayIdForUnit } from "@/lib/modules/pos/payment-intent-shared";
import { maskPromptpayId } from "@/lib/modules/pos/payment-settings";
import { GeneralSettings } from "./GeneralSettings";
import { StaffSettings } from "./StaffSettings";
import { SharkSettings } from "./SharkSettings";
import { ChannelsPane, OfflinePane } from "./shark-ui";

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
  // POS P1.18 ▸ FU-c (P1.10U): แก้ใบเสร็จ = กติกาเดียวกับ updatePosReceiptSettings / posSettingsOverview.canEdit.receipt —
  //   pos.device.manage ระดับร้าน (evaluate ก่อน) + ครบทุกสาขาที่ผูก POS นี้ · F1: unitAccess ["*"] อย่างเดียวไม่พอ (PromptPay ID ไม่ปิดบัง) ◂
  const deviceManageAtShop = evaluate(m, { module: "pos", action: "pos.device.manage" });
  const canEditReceipt = deviceManageAtShop && (await canManageAllLinkedUnits(prisma, { tenantId, systemId: id }, m));
  const def = systemDef(sys.type);
  const t = await getTranslations("pos.settings");
  const tPos = await getTranslations("pos");
  // POS P1.18U ▸ ประวัติการเปลี่ยน = pos.settings.manage (ตัวอ่านตรวจซ้ำต่อสาขา) · แท็บพนักงาน = pos.settings.manage ที่สาขานี้ (มติ 3) ◂
  const canManageSettings = evaluate(m, { module: "pos", action: "pos.settings.manage" });
  const canManageStaff = evaluate(m, { module: "pos", action: "pos.settings.manage", unitId });
  const needProfile = canRead && (tab === "payments" || tab === "general" || tab === "shark");
  const payProfile = needProfile ? await getPaymentProfile({ tenantId }) : null;
  const ppId = payProfile?.promptpayId?.trim() || null;
  // POS P1.18U ▸ พร้อมเพย์: เลขของสาขาก่อน เลขของร้านทีหลัง (ลำดับเดียวกับใบขอรับเงิน) — แสดงแบบปิดบังเสมอ ◂
  const unitPp = promptpayIdForUnit(sys.settings, unitId);
  const intent = parsePosIntentSettings(sys.settings);
  // POS P1.18U ▸ R11 แถวเว็บร้าน: สาขาประเภท SHOP ที่เปิดอยู่และมีสินค้าเปิดขาย (อ่านอย่างเดียว) ◂
  // POS P1.18U ▸ แก้รอบ 1 F6: คิวรีเดียว (EXISTS ใช้ดัชนี ShopProduct(tenantId, unitId, active)) — ไม่ดึงสินค้าทั้งร้านมาตัดซ้ำในหน่วยความจำ ·
  //   ไม่มี relation BusinessUnit↔ShopProduct ใน schema ⇒ ใช้ SQL ผูก tenantId · ผลเท่าเดิม (สาขาแรกตาม sortOrder, createdAt) ◂
  const shop =
    canRead && (tab === "shark" || tab === "channels")
      ? ((
          await prisma.$queryRaw<{ name: string; slug: string }[]>`
            SELECT bu."name", bu."slug" FROM "BusinessUnit" bu
            WHERE bu."tenantId" = ${tenantId} AND bu."type" = 'SHOP' AND bu."status" = 'ACTIVE'
              AND EXISTS (SELECT 1 FROM "ShopProduct" sp WHERE sp."tenantId" = bu."tenantId" AND sp."unitId" = bu."id" AND sp."active")
            ORDER BY bu."sortOrder" ASC, bu."createdAt" ASC
            LIMIT 1`
        )[0] ?? null)
      : null;
  const storefront = shop ? { name: shop.name, path: `/s/${auth.active.tenant.slug}/${shop.slug}/shop` } : null;
  return (
    <div className="flex w-full min-w-0 max-w-7xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      <ModuleTabs items={posTabs(id, tPos)} data-testid="pos-settings-module-tabs" />
      <SettingsShell systemId={id} active={tab} units={units} unitId={unitId} canHistory={canRead && canManageSettings}>
        {!canRead ? (
          <SettingsRefusal message={t("refusal")} />
        ) : tab === "general" ? (
          <GeneralSettings
            key={unitId}
            systemId={id}
            unitId={unitId}
            unitName={units.find((u) => u.id === unitId)?.name ?? ""}
            multiUnit={units.length > 1}
            unitPromptpayMasked={maskPromptpayId(unitPp)}
            shopPromptpayMasked={maskPromptpayId(ppId)}
          />
        ) : tab === "staff" ? (
          canManageStaff ? (
            <StaffSettings key={unitId} systemId={id} unitId={unitId} isOwner={m.role === "OWNER"} />
          ) : (
            <SettingsRefusal message={t("staff.refusal")} />
          )
        ) : tab === "shark" ? (
          <SharkSettings key={unitId} systemId={id} unitId={unitId} storefront={storefront} pay={{ promptpayMasked: maskPromptpayId(unitPp ?? ppId), beamOn: intent.beam.enabled && beamEnabled() }} />
        ) : tab === "channels" ? (
          <ChannelsPane storefront={storefront} />
        ) : tab === "offline" ? (
          <OfflinePane />
        ) : tab === "payments" ? (
          <PaymentSettings
            systemId={id}
            canEdit={canEditReceipt}
            initial={intent}
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

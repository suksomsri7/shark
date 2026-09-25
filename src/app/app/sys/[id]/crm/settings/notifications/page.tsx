import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { getMyPrefs, getNotificationSettings } from "@/lib/modules/crm/notifications";
import { CRM_NOTIF_CHANNELS, CRM_NOTIF_CHANNEL_LABEL } from "@/lib/modules/crm/notifications-shared";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { CrmNotificationsManager } from "@/components/crm/notifications/CrmNotificationsManager";
import type { CrmNotifyChannelKey, CrmNotifyPageData } from "@/components/crm/notifications/types";
import {
  setCrmNotifyChannelAction,
  setCrmNotifyMyChannelAction,
  setCrmNotifyMyQuietAction,
  setCrmNotifyShopAction,
} from "./actions";

// ตั้งค่าการแจ้งเตือนพนักงาน (ใบ C2.10 · พิมพ์เขียว §7.4 · มติ C22) — `/app/sys/{id}/crm/settings/notifications`
// 🔴 404-not-403 (COMMON page guard): ระบบไม่ใช่ CRM ของร้านนี้ · ระบบยังไม่เปิด CRM v2 · ไม่มีคีย์ `crm.settings.manage`
//    **และไม่มีสิทธิ์อะไรใน CRM เลย** = notFound() — พนักงานที่อ่าน CRM ได้ยังเปิดหน้านี้ได้เพื่อตั้งค่า "ของฉัน" (มติ C22)
// 🔴 หน้า GET ไม่เขียนอะไร · ด่าน F2.3: `src/components/**` ล้วงโมดูล CRM ไม่ได้ ⇒ ทะเบียนช่องทาง/ป้ายไทยถูกแปลงเป็น props ที่นี่
export default async function CrmNotificationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  const canManageShop = crmCan(actor, "crm.settings.manage");
  // แท็บ "ของฉัน" ต้องอ่าน CRM ได้อย่างน้อยหนึ่งชนิด (ไม่มีเลย = ไม่มีเรื่องอะไรให้แจ้ง ⇒ 404 ไม่บอกว่ามีหน้านี้)
  if (!canManageShop && !crmCan(actor, "crm.deal.read") && !crmCan(actor, "crm.contact.read") && !crmCan(actor, "crm.activity.read")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const mine = await getMyPrefs(ctx, actor);
  const shop = canManageShop ? await getNotificationSettings(ctx, actor) : mine.shop;
  const data: CrmNotifyPageData = {
    systemId: id,
    canManageShop,
    channels: CRM_NOTIF_CHANNELS.map((c) => ({ key: c as CrmNotifyChannelKey, label: CRM_NOTIF_CHANNEL_LABEL[c] })),
    templates: Object.values(shop.templates).map((t) => ({
      key: t.key,
      label: t.label,
      title: t.title,
      body: t.body,
      digest: t.digest,
      recipients: t.recipients,
      channels: { IN_APP: t.channels.IN_APP, PUSH: t.channels.PUSH, EMAIL: t.channels.EMAIL },
      mine: mine.prefs.notifications[t.key] ?? {},
    })),
    shopQuiet: shop.quietHours,
    digestHour: shop.digestHour,
    myQuiet: mine.prefs.quietHours,
  };
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-4">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/settings`, label: "ตั้งค่า CRM" }}
        desc="การแจ้งเตือน — เลือกว่าเรื่องไหนต้องบอกใคร ทางไหน และช่วงเวลาไหนที่ไม่ควรรบกวน (ของที่ค้างในช่วงห้ามรบกวนจะถูกส่งให้หลังพ้นช่วง ไม่มีอะไรหาย)"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <CrmNotificationsManager
        data={data}
        actions={{
          setChannel: setCrmNotifyChannelAction,
          setShop: setCrmNotifyShopAction,
          setMyChannel: setCrmNotifyMyChannelAction,
          setMyQuiet: setCrmNotifyMyQuietAction,
        }}
      />
    </div>
  );
}

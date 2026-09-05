import { requireAccountPage } from "@/lib/modules/account/guard";
import {
  CONNECTION_SETTINGS_SUBS,
  DEFAULT_CONNECTION_SUB,
  connectionSubLabel,
} from "@/lib/modules/account/settings-nav";
import { CONNECTION_SOON, buildConnectionCards } from "@/lib/modules/account/connections";
import {
  connectAction,
  createApiKeyAction,
  createWebhookAction,
  disconnectAction,
  revokeApiKeyAction,
  rotateApiKeyAction,
  setLinkOptionAction,
  testWebhookAction,
  updateWebhookAction,
} from "@/lib/modules/account/connections-actions";
import { listApiKeys } from "@/lib/api-keys/service";
import { listDeliveries, listEndpoints } from "@/lib/webhooks/service";
import { WEBHOOK_EVENTS, webhookEventLabel } from "@/lib/webhooks/labels";
import { SettingsNav } from "@/components/account-v2/SettingsNav";
import { ConnectionsPanel } from "@/components/account-v2/ConnectionsPanel";
import { formatDateTh } from "@/lib/ui/date";
import { prisma } from "@/lib/core/db";

// หน้า "ตั้งค่า › การเชื่อมต่อ" (SPEC §9.5 · WO 8.3 · เฟรม g14)
// หัวข้อย่อย `?s=` : shark (ระบบใน SHARK) · etax (🕓) · api (แอปภายนอก/API)
export const dynamic = "force-dynamic";

/** เหตุการณ์บัญชีที่ให้เลือกสมัคร (กรองจากทะเบียนกลางของแพลตฟอร์ม — ไม่พิมพ์ลิสต์ซ้ำ) */
const ACCOUNT_EVENTS = WEBHOOK_EVENTS.filter((e) => e.value.startsWith("account."));

/** "ดูรายการที่ลง" — พาไปหน้าที่เห็นรายการที่ระบบนั้นลงบัญชีให้จริง */
function recentHrefFor(base: string, kind: string): string {
  switch (kind) {
    case "POS":
      return `${base}/docs/TAX_INVOICE_ABB`;
    case "CRM":
      return `${base}/docs/QUOTATION`;
    case "CHAT":
      return `${base}/documents/inbox`;
    case "INVENTORY":
      return `${base}/journal?q=สินค้าคงเหลือ`;
    default:
      return `${base}/journal`;
  }
}

export default async function AccountConnectionsSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { id } = await params;
  const { s: subRaw } = await searchParams;
  const { tenantId, systemId, sys } = await requireAccountPage(id, "account.settings.manage");
  const base = `/app/sys/${id}/account`;
  const ctx = { tenantId, systemId };

  const hasSub = !!subRaw && CONNECTION_SETTINGS_SUBS.some((x) => x.key === subRaw);
  const sub = hasSub ? subRaw! : DEFAULT_CONNECTION_SUB;

  // อ่านเฉพาะที่หัวข้อนั้นใช้จริง (คีย์/ฮุคเป็น query ของแพลตฟอร์ม — ไม่ควรจ่ายทุกครั้งที่เปิดหน้าการ์ด)
  const cards = sub === "shark" ? await buildConnectionCards(ctx, new Date()) : [];
  const [keys, endpoints, deliveries] =
    sub === "api"
      ? await Promise.all([listApiKeys({ tenantId }), listEndpoints({ tenantId }), listDeliveries({ tenantId }, 10)])
      : [[], [], []];

  // ป้ายชื่อสมุดบัญชีต่อคีย์ (WO A2) — คีย์ของทั้ง tenant อาจผูกสมุดอื่นนอกจากเล่มนี้ด้วย
  const otherSystemIds = Array.from(
    new Set(keys.map((k) => k.systemId).filter((x): x is string => !!x && x !== systemId)),
  );
  const otherSystems =
    otherSystemIds.length > 0
      ? await prisma.appSystem.findMany({ where: { id: { in: otherSystemIds } }, select: { id: true, name: true } })
      : [];
  const systemNameById = new Map<string, string>([[systemId, sys.name], ...otherSystems.map((x) => [x.id, x.name] as const)]);

  return (
    <ConnectionsPanel
      systemId={systemId}
      base={base}
      sub={sub}
      subLabel={connectionSubLabel(sub)}
      cards={cards}
      soonCards={CONNECTION_SOON}
      mappingHref={`${base}/accounts/mapping`}
      recentHrefs={Object.fromEntries(cards.map((c) => [c.kind, recentHrefFor(base, c.kind)]))}
      apiKeys={keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        createdAt: formatDateTh(k.createdAt),
        revoked: !!k.revokedAt,
        scopes: k.scopes,
        systemLabel: k.systemId ? (systemNameById.get(k.systemId) ?? "สมุดอื่น") : "ทั้งร้าน",
        expiresLabel: k.expiresAt ? formatDateTh(k.expiresAt) : "ไม่หมดอายุ",
        lastUsedLabel: k.lastUsedAt ? formatDateTh(k.lastUsedAt) : "ยังไม่เคยใช้",
      }))}
      webhooks={endpoints.map((e) => ({
        id: e.id,
        url: e.url,
        active: e.active,
        events: (Array.isArray(e.eventsJson) ? (e.eventsJson as unknown[]) : [])
          .filter((x): x is string => typeof x === "string")
          .map((x) => webhookEventLabel(x)),
        secret: e.secret,
      }))}
      deliveries={deliveries.map((d) => ({
        id: d.id,
        url: d.endpoint?.url ?? "",
        event: webhookEventLabel(d.eventType),
        status: d.status,
        at: formatDateTh(d.createdAt),
      }))}
      accountEvents={ACCOUNT_EVENTS}
      connect={connectAction}
      disconnect={disconnectAction}
      setOption={setLinkOptionAction}
      createKey={createApiKeyAction}
      revokeKey={revokeApiKeyAction}
      rotateKey={rotateApiKeyAction}
      createHook={createWebhookAction}
      updateHook={updateWebhookAction}
      testHook={testWebhookAction}
      nav={<SettingsNav base={base} activeGroup="connections" activeSub={sub} />}
      mobileNav={<SettingsNav base={base} activeGroup="connections" activeSub={hasSub ? sub : ""} />}
      showMobileNavOnly={!hasSub}
    />
  );
}

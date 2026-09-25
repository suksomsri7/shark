import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { listTeams } from "@/lib/core/teams";
import { API_SCOPE_BUNDLES, bundleLabelForScopes, crmFilterTargetsOf } from "@/lib/api-keys/scopes";
import { listDeliveries, listEndpoints } from "@/lib/webhooks/service";
import { webhookEventLabel } from "@/lib/webhooks/labels";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { CRM_OPS } from "@/lib/modules/crm/api/registry";
import { crmToolInfos } from "@/lib/modules/crm/api/tools";
import { crmWebhookEvents, isCrmWebhookEndpoint } from "@/lib/modules/crm/api/webhook-events";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { createCrmApiKeyAction, createCrmWebhookAction, deleteCrmWebhookAction, revokeCrmApiKeyAction, toggleCrmWebhookAction } from "./actions";
import { CrmApiSettings } from "./_components/CrmApiSettings";
import type { CrmApiKeyRow, CrmApiToolRow, CrmBundleScopeRow, CrmWebhookDeliveryRow, CrmWebhookRow } from "./_components/shared";

// หน้า "CRM › ตั้งค่า › API" (ใบ C1.10 · ภาพ 14 ขวา) — `/app/sys/{id}/crm/settings/api`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด CRM ใหม่ · ไม่มีคีย์ `crm.api.manage` (OWNER หรือได้รับชัดเจน) = notFound()
// 🔴 รายการเครื่องมือ/จำนวน op มาจากทะเบียน `CRM_OPS` ตัวเดียวกับ REST (crmToolInfos) — ห้ามพิมพ์มือ · หน้า GET ไม่เขียนอะไร

const dayFmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
const timeFmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

const scopesOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);

export default async function CrmApiSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" }, select: { id: true, name: true } });
  if (!sys) notFound();
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.api.manage")) notFound();

  const [rows, teams, endpointsAll] = await Promise.all([
    prisma.apiKey.findMany({
      where: { tenantId, systemId: id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, prefix: true, scopesJson: true, expiresAt: true, lastUsedAt: true },
    }),
    listTeams({ tenantId }),
    listEndpoints({ tenantId }),
  ]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const keys: CrmApiKeyRow[] = rows.map((k) => {
    const scopes = scopesOf(k.scopesJson);
    const f = crmFilterTargetsOf(scopes);
    const real = scopes.filter((s) => !s.startsWith("crm.filter."));
    const filterLabel = f.teamIds.length > 0 ? `เฉพาะทีม ${f.teamIds.map((t) => teamName.get(t) ?? "ที่ถูกเก็บถาวร").join(", ")}` : f.ownerIds.length > 0 ? "เฉพาะของผู้ดูแลที่กำหนด" : null;
    return {
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      bundleLabel: bundleLabelForScopes(real),
      filterLabel,
      expiresLabel: k.expiresAt ? dayFmt.format(k.expiresAt) : "ไม่หมดอายุ",
      lastUsedLabel: k.lastUsedAt ? dayFmt.format(k.lastUsedAt) : "ยังไม่เคยใช้",
    };
  });

  const opById = new Map(CRM_OPS.map((o) => [o.id, o]));
  const tools: CrmApiToolRow[] = crmToolInfos().map((t) => ({
    name: t.name,
    kind: t.danger ? "danger" : t.write ? "write" : "read",
    scope: opById.get(t.opId)?.action ?? "",
    label: opById.get(t.opId)?.label ?? "",
  }));

  // CRM C2.11 ▸ ชุดสิทธิ์ 3 ชุด (`crm.readonly` ⊂ `crm.operate` ⊂ `crm.admin`) พร้อม "ของที่เพิ่มมาในเฟส C2"
  //   (อีเมล · ลำดับการติดตาม · แจกลีด · คะแนน · ลิงก์ติดตาม · กฎอัตโนมัติ) — อ่านจากทะเบียนจริง ไม่พิมพ์มือ ◂
  const C2_SCOPE_RE = /^crm\.(email|sequence|assignment|score|tracking|automation)\./;
  const bundleScopes: CrmBundleScopeRow[] = API_SCOPE_BUNDLES.filter((b) => b.id.startsWith("crm.")).map((b) => ({
    id: b.id,
    count: b.scopes.length,
    newInC2: b.scopes.filter((sc) => C2_SCOPE_RE.test(sc)),
  }));

  const allowed = new Set(crmWebhookEvents());
  const events = [...allowed].map((value) => ({ value, label: webhookEventLabel(value) }));
  const endpointRows = endpointsAll.filter((e) => isCrmWebhookEndpoint(e.eventsJson, allowed));
  const endpointIds = new Set(endpointRows.map((e) => e.id));
  const deliveryRows = endpointRows.length > 0 ? (await listDeliveries({ tenantId }, 100)).filter((d) => endpointIds.has(d.endpointId)) : [];
  const webhooks: CrmWebhookRow[] = endpointRows.map((e) => {
    const last = deliveryRows.find((d) => d.endpointId === e.id);
    return {
      id: e.id,
      url: e.url,
      events: Array.isArray(e.eventsJson) ? e.eventsJson.filter((x): x is string => typeof x === "string") : [],
      active: e.active,
      lastLabel: last ? timeFmt.format(last.createdAt) : null,
      lastStatus: last ? (last.status === "FAILED" ? "FAILED" : "OK") : null,
    };
  });
  const deliveries: CrmWebhookDeliveryRow[] = deliveryRows.slice(0, 30).map((d) => ({
    id: d.id,
    endpointId: d.endpointId,
    eventType: d.eventType,
    status: d.status === "FAILED" ? "FAILED" : "OK",
    attempts: d.attempts,
    lastError: d.lastError,
    atLabel: timeFmt.format(d.createdAt),
  }));

  return (
    <div className="flex w-full max-w-3xl min-w-0 flex-col gap-5">
      <PageHeader title="API และ webhook" back={{ href: `/app/sys/${id}/crm/settings`, label: "ตั้งค่า CRM" }} desc={`${sys.name} — คีย์สำหรับระบบภายนอกและผู้ช่วย AI · ปลายทาง webhook`} />
      <ModuleTabs items={crmNavItems(id)} />
      <CrmApiSettings
        systemId={id}
        keys={keys}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        tools={tools}
        opCount={CRM_OPS.length}
        bundleScopes={bundleScopes}
        events={events}
        webhooks={webhooks}
        deliveries={deliveries}
        createKey={createCrmApiKeyAction}
        revokeKey={revokeCrmApiKeyAction}
        createWebhook={createCrmWebhookAction}
        toggleWebhook={toggleCrmWebhookAction}
        deleteWebhook={deleteCrmWebhookAction}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { bundleLabelForScopes, bundlesCovering } from "@/lib/api-keys/scopes";
import { hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import {
  createMemberApiKeyAction,
  createMemberWebhookAction,
  deleteMemberWebhookAction,
  revokeMemberApiKeyAction,
  testMemberWebhookAction,
  toggleMemberWebhookAction,
} from "@/lib/modules/member/api-actions";
import { memberWebhookEvents } from "@/lib/modules/member/api/openapi";
import { isMemberWebhookEndpoint } from "@/lib/modules/member/api/webhook-events";
import type { MemberWebhookDeliveryRow, MemberWebhookRow } from "@/lib/modules/member/api-shared";
import { listDeliveries, listEndpoints } from "@/lib/webhooks/service";
import { MEMBER_OPS } from "@/lib/modules/member/api/registry";
import { webhookEventLabel } from "@/lib/webhooks/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { MemberSettingsTabs } from "@/components/member/MemberSettingsTabs";
import { MemberApiSettings, type MemberApiKeyRow, type MemberApiToolRow } from "@/components/member/MemberApiSettings";

// หน้า "ระบบสมาชิก › ตั้งค่า › API" (M1.11 · ภาพ ledger/design-member/27-ai-panel-api.png ครึ่งขวา)
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง → ไม่เจอ = notFound()
// 🔴 กติกา 404-not-403 (§6.4): ไม่มี `member.api.manage` → notFound() เหมือนกัน ไม่ใช่หน้า 403
//    (คีย์นี้ MANAGER ไม่ได้โดยปริยาย — §6.1 · ดูหมายเหตุที่หัวไฟล์ access.ts)
// 🔴 ตาราง tool/จำนวน op มาจากทะเบียน `MEMBER_OPS` ตัวเดียวกับที่ REST ใช้จริง — ห้ามพิมพ์มือ

const dayFmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
const timeFmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

function parseScopes(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

/** จำนวน tool ที่โชว์บนหน้าจอ — ตารางในภาพ 27 เป็น "ตัวอย่าง" ไม่ใช่รายชื่อครบ (ครบอยู่ในคู่มือ) */
const TOOL_PREVIEW = 8;

export default async function MemberApiSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!hasMemberPerm(actor, "member.api.manage")) notFound();

  const rows = await prisma.apiKey.findMany({
    where: { tenantId, systemId: id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, scopesJson: true, expiresAt: true, lastUsedAt: true },
  });
  const keys: MemberApiKeyRow[] = rows.map((k) => {
    const scopes = parseScopes(k.scopesJson);
    return {
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      bundleId: bundlesCovering(scopes).find((b) => b.startsWith("member-")) ?? null,
      bundleLabel: bundleLabelForScopes(scopes),
      expiresLabel: k.expiresAt ? dayFmt.format(k.expiresAt) : "ไม่หมดอายุ",
      lastUsedLabel: k.lastUsedAt ? dayFmt.format(k.lastUsedAt) : "ยังไม่เคยใช้",
    };
  });

  const withTool = MEMBER_OPS.filter((o) => o.tool);
  // ตัวอย่างในตาราง = ครบทุกชนิดแบบภาพ 27 (อ่าน 4 · เขียน 2 · อันตราย 2) — รายชื่อครบอยู่ในคู่มือ
  const preview = [
    ...withTool.filter((o) => o.kind === "read").slice(0, 4),
    ...withTool.filter((o) => o.kind === "write").slice(0, 2),
    ...withTool.filter((o) => o.kind === "danger").slice(0, 2),
  ].slice(0, TOOL_PREVIEW);
  const tools: MemberApiToolRow[] = preview.map((o) => ({
    name: o.tool!.name,
    method: o.method,
    kind: o.kind,
    scope: o.action,
    label: o.label,
  }));
  const events = memberWebhookEvents().map((value) => ({ value, label: webhookEventLabel(value) }));

  // M3.10 — ปลายทางของระบบสมาชิก (สมัครเฉพาะเหตุการณ์ของระบบสมาชิก) + การส่งล่าสุดของปลายทางเหล่านั้น
  const allowed = new Set(memberWebhookEvents());
  const endpointRows = (await listEndpoints({ tenantId })).filter((e) => isMemberWebhookEndpoint(e.eventsJson, allowed));
  const endpointIds = new Set(endpointRows.map((e) => e.id));
  const deliveryRows = endpointRows.length > 0 ? (await listDeliveries({ tenantId }, 100)).filter((d) => endpointIds.has(d.endpointId)) : [];
  const webhooks: MemberWebhookRow[] = endpointRows.map((e) => {
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
  const deliveries: MemberWebhookDeliveryRow[] = deliveryRows.slice(0, 30).map((d) => ({
    id: d.id,
    endpointId: d.endpointId,
    eventType: d.eventType,
    status: d.status === "FAILED" ? "FAILED" : "OK",
    attempts: d.attempts,
    lastError: d.lastError,
    atLabel: timeFmt.format(d.createdAt),
  }));

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        title={sys.name}
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        desc="ตั้งค่า — คีย์ API สำหรับให้ระบบภายนอกและผู้ช่วย AI ทำงานกับข้อมูลสมาชิกของคุณ"
      />
      <MemberTabs systemId={id} actor={actor} />
      <MemberSettingsTabs systemId={id} actor={actor} />
      <MemberApiSettings
        systemId={id}
        keys={keys}
        tools={tools}
        toolCount={withTool.length}
        opCount={MEMBER_OPS.length}
        events={events}
        createKey={createMemberApiKeyAction}
        revokeKey={revokeMemberApiKeyAction}
        webhooks={webhooks}
        deliveries={deliveries}
        createWebhook={createMemberWebhookAction}
        toggleWebhook={toggleMemberWebhookAction}
        deleteWebhook={deleteMemberWebhookAction}
        testWebhook={testMemberWebhookAction}
      />
    </div>
  );
}

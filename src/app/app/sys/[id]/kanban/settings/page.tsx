import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { bundleLabelForScopes } from "@/lib/api-keys/scopes";
import { canReadKanban, toActor } from "@/lib/modules/kanban/access";
import { createKanbanApiKeyAction, revokeKanbanApiKeyAction } from "@/lib/modules/kanban/settings-actions";
import { ApiKeysPanel, type KanbanApiKeyRow } from "@/components/kanban/ApiKeysPanel";
import { KanbanTabs } from "@/components/kanban/KanbanTabs";
import { PageHeader } from "@/components/ui/PageHeader";

// หน้า "ตั้งค่า" ของระบบบอร์ดงาน (K1.15 — เปิดหมวดนี้ด้วยส่วน API ก่อน)
//
// 🔴 หมวดนี้เคยเป็น "เร็ว ๆ นี้ (K2.5)" ในทะเบียนเมนู · K1.15 ต้องมีที่ให้เจ้าของร้านออกคีย์ API
//    ⇒ เปิดหน้าจริงพร้อมส่วน "API" ส่วนเดียวก่อน แล้ว K2.5 มาเติมส่วนที่เหลือ (ค่าเริ่มต้นบอร์ด/แจ้งเตือน)
//    (กติกาของ `nav.ts`: ย้าย soon → ready ต้องมี page.tsx จริงใน commit เดียวกัน — ทำแล้วที่นี่)

const dayFmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });

function parseScopes(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

export default async function KanbanSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "KANBAN" } });
  if (!sys) notFound();
  const actor = toActor(auth.user.id, auth.active);
  // ชั้นที่ 1 ของโมดูล — คนที่ไม่มีสิทธิ์บอร์ดงานเลยไม่ควรเห็นแม้แต่หน้าตั้งค่า
  if (!canReadKanban(actor)) notFound();

  const rows = await prisma.apiKey.findMany({
    where: { tenantId, systemId: id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, scopesJson: true, expiresAt: true, lastUsedAt: true },
  });
  const keys: KanbanApiKeyRow[] = rows.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    bundleLabel: bundleLabelForScopes(parseScopes(k.scopesJson)),
    expiresLabel: k.expiresAt ? dayFmt.format(k.expiresAt) : "ไม่หมดอายุ",
    lastUsedLabel: k.lastUsedAt ? dayFmt.format(k.lastUsedAt) : "ยังไม่เคยใช้",
  }));

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        title={sys.name}
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        desc="ตั้งค่า — คีย์ API สำหรับให้ระบบภายนอกและผู้ช่วย AI ทำงานกับบอร์ดของคุณ"
      />
      <KanbanTabs systemId={id} actor={actor} />
      <ApiKeysPanel
        systemId={id}
        keys={keys}
        createKey={createKanbanApiKeyAction}
        revokeKey={revokeKanbanApiKeyAction}
      />
    </div>
  );
}

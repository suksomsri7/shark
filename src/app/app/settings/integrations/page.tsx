// /app/settings/integrations — ศูนย์เชื่อมต่อ (SVC R0.5 · ภาพ ledger/design-booking/10-integrations.png = ledger/design-dorm/11-integrations.png)
// ระดับร้าน (ทุกสาขา) · ใช้ร่วมทุกระบบ · ร้านไปสมัครกับผู้ให้บริการเอง แล้วนำคีย์มาใส่ · คีย์เก็บแบบเข้ารหัส ไม่มีใครเห็นเต็ม
// RSC เรียก listIntegrations ผ่าน session — client ได้แต่ DTO ที่ปิดบังแล้ว (ไม่มีกล่องความลับ/ค่าเต็ม)
// ต่างจาก /app/settings/connections (เชื่อมระบบภายในกับสาขา) — คงหน้านั้นไว้ · ตัวเชื่อมของ POS ตั้งที่หน้าตั้งค่า POS (การ์ดลิงก์ ไม่อ่านค่า POS)
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { listIntegrationHealth, listIntegrations } from "@/lib/core/integrations";
import { loadSettingsForm } from "@/lib/core/settings"; // SVC C.3 (#83)
import { resetSettingAction, saveSettingsAction } from "@/lib/core/settings/actions";
import SettingsForm from "@/components/settings/SettingsForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { IntegrationsHub } from "./IntegrationsHub";

const TIME_FMT = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function IntegrationsSettingsPage() {
  const auth = await requireTenant();
  const m = auth.active;
  const tenantId = m.tenantId;
  const unitAccess = Array.isArray(m.unitAccess) ? (m.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [];
  const actor = {
    userId: auth.user.id,
    role: m.role,
    unitAccess,
    permissions: m.permissions && typeof m.permissions === "object" && !Array.isArray(m.permissions) ? (m.permissions as Record<string, unknown>) : {},
  };
  const res = await listIntegrations({ tenantId }, actor);

  const header = <PageHeader title="ศูนย์เชื่อมต่อ" desc="ระดับร้าน (ทุกสาขา) · ตั้งค่า › เชื่อมต่อ · ใช้ร่วมกับทุกระบบของร้าน" />;
  if (!res.ok) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {header}
        <EmptyState text={res.message} action={{ href: "/app", label: "กลับหน้าหลัก" }} />
      </div>
    );
  }

  const [allUnits, posSystems, accountSystems] = await Promise.all([
    prisma.businessUnit.findMany({ where: { tenantId, status: { not: "ARCHIVED" } }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    prisma.appSystem.findMany({ where: { tenantId, type: "POS" }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    prisma.appSystem.findMany({ where: { tenantId, type: "ACCOUNT" }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);
  // ผู้จำกัดสาขา: เห็น/ติ๊กได้เฉพาะสาขาที่เข้าถึง · ค่าเริ่มของการเชื่อมใหม่ = สาขาของตน (แถว "ทุกหน่วย" แก้ไม่ได้อยู่แล้ว)
  const limited = m.role !== "OWNER" && !unitAccess.includes("*");
  const units = limited ? allUnits.filter((u) => unitAccess.includes(u.id)) : allUnits;
  const defaultUnitIds = limited ? units.map((u) => u.id) : [];
  const testTimes: Record<string, string> = {};
  for (const it of res.items) if (!it.virtual && it.lastTestAt) testTimes[it.id] = TIME_FMT.format(new Date(it.lastTestAt));
  // การ์ด POS แบบลิงก์ — ตัวเชื่อมของ POS (แพลตฟอร์มเดลิเวอรี · ตรวจสลิป · e-Tax) ตั้งที่หน้าตั้งค่า POS ของแต่ละระบบ
  const posLinks = posSystems.map((s) => ({ id: s.id, name: s.name, href: `/app/sys/${s.id}/pos/settings` }));
  // รายการเดินบัญชีธนาคาร — มีแล้วในบัญชี V2 (นำเข้าไฟล์ · จับคู่อัตโนมัติ) ⇒ การ์ดลิงก์ไปหน้ากระทบยอด ไม่เก็บซ้ำ
  const bankLinks = accountSystems.map((s) => ({ id: s.id, name: s.name, href: `/app/sys/${s.id}/account/finance/reconcile` }));
  // SVC C.3 ▸ สุขภาพตัวต่อ (DTO ไม่มีค่าลับ) + ค่าตั้ง #83 ชั้นร้าน ผ่านเครื่องยนต์ค่าตั้ง (กติกาเหล็กข้อ 16 · ผู้ไม่ใช่เจ้าของเห็นอ่านอย่างเดียว) ◂
  const firstUnitId = units[0]?.id ?? null;
  const [healthRes, alertForm] = await Promise.all([
    listIntegrationHealth({ tenantId }, actor),
    firstUnitId ? loadSettingsForm(actor, { tenantId }, { domains: ["integrations"], scope: "TENANT", scopeId: tenantId, unitId: firstUnitId }) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {header}
      <IntegrationsHub
        items={res.items}
        catalog={res.catalog}
        keyConfigured={res.keyConfigured}
        canManage={res.canManage}
        units={units}
        defaultUnitIds={defaultUnitIds}
        posLinks={posLinks}
        bankLinks={bankLinks}
        testTimes={testTimes}
        health={healthRes.ok ? healthRes.items : []}
        thresholdPercent={healthRes.ok ? healthRes.thresholdPercent : 10}
      />
      {alertForm && (
        <section className="flex flex-col gap-3" data-testid="integrations-alert-settings">
          <h2 className="text-base font-semibold">แจ้งเตือนตัวเชื่อม</h2>
          <SettingsForm model={alertForm} actions={{ save: saveSettingsAction, reset: resetSettingAction }} />
        </section>
      )}
    </div>
  );
}

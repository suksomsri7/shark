import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { getPaymentProfile } from "@/lib/payment/service";
import { isValidPromptPayId } from "@/lib/payment/promptpay";
import { beamEnabled } from "@/lib/payment/beam";
import { posUnits, registerDiscountCaps, registerSellerLimits } from "@/lib/modules/pos/register";
import { posRegisterV2On } from "@/lib/modules/pos/register-shared";
import { parsePosPaymentSettings } from "@/lib/modules/pos/payment-settings";
import { parsePosIntentSettings, promptpayIdForUnit } from "@/lib/modules/pos/payment-intent-shared";
import { posMembership, posRegisterView } from "@/lib/modules/pos/access";
import { registerTableMode, registerTables } from "@/lib/modules/pos/table";
import { TablesScreen } from "@/components/pos/tables/TablesScreen";

// POS P2.4U — หน้า "โต๊ะ" ของหน้าขาย (ภาพ 03 · มติผู้คุม 1–11): ผังโต๊ะ + แผงโต๊ะ + แจ้งเตือนจากโต๊ะ + เช็คบิลด้วยจอชำระเดิม
// 🔴 ประตู (มติ 1 · O13): POS ของร้านนี้ + หน้าขายใหม่ (registerV2) · ไม่มีสาขาที่เข้าได้ = notFound ·
//    ขายไม่ได้ที่สาขานี้ (posRegisterView ไม่ผ่าน · ไม่มี pos.sale.create) = การ์ดปฏิเสธ HTTP 200 ก่อนอ่านข้อมูลโต๊ะใด ๆ
// 🔴 ข้อมูลโต๊ะทั้งหมดมาจาก pos/table.ts (ผ่าน facade ร้านอาหาร) — หน้านี้ไม่อ่านตาราง Restaurant* เอง (ยกเว้น slug ของสาขาสำหรับลิงก์ตั้งค่าโต๊ะเดิม)
// โหมดรางไอคอน = NavRail.isRailPath (เส้นทาง /pos/tables ของระบบที่ธงเปิด — เหมือนหน้าขาย)

const RAIL_PAD = "px-4 pb-10 pt-4 sm:px-6";
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function PosTablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ unit?: string | string[]; open?: string | string[]; sent?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const unitParam = one(sp.unit);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  if (!(sys.active && posRegisterV2On(sys.settings))) notFound();
  const m = posMembership(auth.active);
  const linked = await posUnits(tenantId, id);
  if (!linked.some((u) => canAccessUnit(m, u.id))) notFound();
  const t = await getTranslations("pos.tables");

  // มติ 1: ขายไม่ได้ที่สาขานี้ ⇒ การ์ดปฏิเสธก่อนอ่านข้อมูลโต๊ะ (ไม่ใช่ 404 · ไม่ throw)
  const view = posRegisterView(m, linked, unitParam);
  if (!view.ok || !view.active) {
    return (
      <div className={RAIL_PAD}>
        <div role="alert" className="card flex max-w-2xl flex-col gap-1 text-sm" data-testid="pos-tables-refusal">
          <b className="text-[15px]">{t("title")}</b>
          <span className="text-[color:var(--color-muted)]">{t("page.refusal")}</span>
        </div>
      </div>
    );
  }
  const active = view.active;
  const actor = { userId: auth.user.id, ...m };
  const ctx = { tenantId, systemId: id, unitId: active.id };
  const [mode, floor, unitRow, profile, caps] = await Promise.all([
    registerTableMode(ctx, actor),
    registerTables(ctx, actor),
    prisma.businessUnit.findFirst({ where: { id: active.id, tenantId }, select: { slug: true } }),
    getPaymentProfile({ tenantId }),
    registerDiscountCaps(ctx),
  ]);
  const limits = registerSellerLimits(actor, active.id, caps);
  const unitPp = promptpayIdForUnit(sys.settings, active.id);
  const ppId = unitPp && isValidPromptPayId(unitPp) ? unitPp : profile?.promptpayId && isValidPromptPayId(profile.promptpayId) ? profile.promptpayId : null;
  const intentSet = parsePosIntentSettings(sys.settings);
  const canCreateTables = mode.ok ? mode.canCreateTables : false;
  const sent = Number(one(sp.sent));

  return (
    <TablesScreen
      key={active.id}
      systemId={id}
      unitId={active.id}
      userId={auth.user.id}
      tenantName={auth.active.tenant.name}
      units={view.units.map((u) => ({ id: u.id, name: u.name }))}
      mode={mode.ok ? { visible: mode.visible, tableCount: mode.tableCount, canCreateTables } : null}
      initialFloor={floor.ok ? floor : null}
      // มติ 1: ไม่มีโต๊ะ + เพิ่มโต๊ะได้ ⇒ ปุ่มไปหน้าตั้งค่าโต๊ะเดิม /app/u/<สาขา>/restaurant/setup (โซน · โต๊ะ · QR)
      setupHref={canCreateTables && unitRow ? `/app/u/${unitRow.slug}/restaurant/setup` : null}
      initialOpen={one(sp.open) ?? null}
      sentNo={Number.isInteger(sent) && sent > 0 ? sent : null}
      limits={limits}
      discountCaps={caps}
      promptpayId={ppId}
      tipEnabled={parsePosPaymentSettings(sys.settings).tip.enabled}
      payIntent={{
        beamCard: intentSet.beam.enabled && beamEnabled(),
        manualRequiresManager: intentSet.manualConfirmRequiresManager,
        canManageShift: evaluate(m, { module: "pos", action: "pos.shift.manage", unitId: active.id }),
        promptpayLink: "/app/settings/payment",
      }}
    />
  );
}

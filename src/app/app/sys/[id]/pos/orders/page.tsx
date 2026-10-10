import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { getPaymentProfile } from "@/lib/payment/service";
import { isValidPromptPayId } from "@/lib/payment/promptpay";
import { posUnits } from "@/lib/modules/pos/register";
import { posRegisterV2On } from "@/lib/modules/pos/register-shared";
import { parsePosIntentSettings, promptpayIdForUnit } from "@/lib/modules/pos/payment-intent-shared";
import { posMembership, posOrdersView } from "@/lib/modules/pos/access";
import { registerTableMode } from "@/lib/modules/pos/table";
import { OrdersScreen } from "@/components/pos/orders/OrdersScreen";

// POS P2.8U — หน้า "ออเดอร์ทุกช่องทาง" ของหน้าขาย (ภาพ 09 · มติผู้คุม 1–9): รางช่องทาง + 4 คอลัมน์ + แผงรายละเอียด + แผ่นคีย์ออเดอร์
// 🔴 ประตู (มติ 1 · O13): POS ของร้านนี้ + หน้าขายใหม่ (registerV2) · ไม่มีสาขาที่เข้าได้ = notFound ·
//    อ่านออเดอร์ไม่ได้ที่สาขานี้ (posOrdersView ไม่ผ่าน · ไม่มี pos.sale.read / pos.sale.create) = การ์ดปฏิเสธ HTTP 200 ก่อนอ่านข้อมูลออเดอร์ใด ๆ
// 🔴 ข้อมูลออเดอร์ทั้งหมดมาจาก order-actions (listOrdersAction ทุก 10 วิ · getOrderAction) ฝั่ง client — หน้านี้ไม่อ่านตาราง PosOrder*
//    สิทธิ์ปุ่ม (รับ/ปฏิเสธ/คีย์/รับเงิน/ยกเลิกบิล) คำนวณที่นี่เพื่อปิดปุ่ม + tooltip เท่านั้น — เซิร์ฟเวอร์ตรวจซ้ำทุกคำขอ
// โหมดรางไอคอน = NavRail.isRailPath (เส้นทาง /pos/orders ของระบบที่ธงเปิด — เหมือนหน้าขาย/โต๊ะ)

const RAIL_PAD = "px-4 pb-10 pt-4 sm:px-6";
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function PosOrdersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ unit?: string | string[] }> }) {
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
  const t = await getTranslations("pos.orders");

  // มติ 1: อ่านออเดอร์ไม่ได้ที่สาขานี้ ⇒ การ์ดปฏิเสธก่อนอ่านข้อมูลออเดอร์ (ไม่ใช่ 404 · ไม่ throw)
  const view = posOrdersView(m, linked, unitParam);
  if (!view.ok || !view.active) {
    return (
      <div className={RAIL_PAD}>
        <div role="alert" className="card flex max-w-2xl flex-col gap-1 text-sm" data-testid="pos-orders-refusal">
          <b className="text-[15px]">{t("title")}</b>
          <span className="text-[color:var(--color-muted)]">{t("page.refusal")}</span>
        </div>
      </div>
    );
  }
  const active = view.active;
  const actor = { userId: auth.user.id, ...m };
  const ctx = { tenantId, systemId: id, unitId: active.id };
  const can = (action: string) => evaluate(m, { module: "pos", action, unitId: active.id });
  const [mode, profile] = await Promise.all([registerTableMode(ctx, actor), getPaymentProfile({ tenantId })]);
  const unitPp = promptpayIdForUnit(sys.settings, active.id);
  // fix 1 F1: ด่านผู้จัดการของการยืนยันเงินเข้าเอง — อ่านแบบเดียวกับหน้าขาย (manualConfirmRequiresManager + pos.shift.manage ที่สาขา)
  const payManagerOnly = parsePosIntentSettings(sys.settings).manualConfirmRequiresManager && !can("pos.shift.manage");
  const ppId = unitPp && isValidPromptPayId(unitPp) ? unitPp : profile?.promptpayId && isValidPromptPayId(profile.promptpayId) ? profile.promptpayId : null;

  return (
    <OrdersScreen
      key={active.id}
      systemId={id}
      unitId={active.id}
      tenantName={auth.active.tenant.name}
      units={view.units.map((u) => ({ id: u.id, name: u.name }))}
      tablesHref={mode.ok && mode.visible ? `/app/sys/${id}/pos/tables?unit=${encodeURIComponent(active.id)}` : null}
      perms={{
        accept: can("pos.order.accept"),
        reject: can("pos.order.reject"),
        create: can("pos.sale.create"),
        priceOverride: can("pos.sale.priceOverride"),
        voidSale: can("pos.sale.void"),
      }}
      promptpayId={ppId}
      payManagerOnly={payManagerOnly}
    />
  );
}

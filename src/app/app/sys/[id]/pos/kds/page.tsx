import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { posUnits } from "@/lib/modules/pos/register";
import { posRegisterV2On } from "@/lib/modules/pos/register-shared";
import { posKdsView, posMembership } from "@/lib/modules/pos/access";
import { KdsScreen } from "@/components/pos/kds/KdsScreen";

// POS P2.6U — จอครัว (KDS · ภาพ 04 · มติผู้คุม 1–14) · เต็มจอ: ไม่มีแท็บโมดูล POS / ไม่อยู่ใน POS_NAV_KEYS (มติ 1 · Q12) · ปุ่ม ‹ กลับภาพรวม POS
// 🔴 ประตู (มติ 1 · O13): POS ของร้านนี้ + หน้าขายใหม่ (registerV2) · ไม่มีสาขาที่เข้าได้ = notFound ·
//    อ่านบอร์ดไม่ได้ที่สาขานี้ (posKdsView ไม่ผ่าน · ไม่มี restaurant.kds.advance / pos.sale.read / pos.sale.create — ตาราง NEED ของ kds.ts) =
//    การ์ดปฏิเสธ HTTP 200 ก่อนอ่านข้อมูลครัวใด ๆ
// 🔴 ข้อมูลครัวทั้งหมดมาจาก kds-actions ฝั่ง client (kdsBoardAction ทุก 6 วิ) — หน้านี้ไม่อ่านตาราง Restaurant*/KdsStation
//    สิทธิ์ปุ่ม (เดิน/ดึงกลับ/เร่ง/พักครัว/แจ้งของหมด) คำนวณที่นี่เพื่อปิดปุ่ม + tooltip เท่านั้น — เซิร์ฟเวอร์ตรวจซ้ำทุกคำขอ
// โหมดรางไอคอน = NavRail.isRailPath (เส้นทาง /pos/kds ของระบบที่ธงเปิด — เหมือนหน้าขาย/โต๊ะ/ออเดอร์)

const RAIL_PAD = "px-4 pb-10 pt-4 sm:px-6";
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function PosKdsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ unit?: string | string[]; station?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const unitParam = one(sp.unit);
  const stationParam = one(sp.station);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  if (!(sys.active && posRegisterV2On(sys.settings))) notFound();
  const m = posMembership(auth.active);
  const linked = await posUnits(tenantId, id);
  if (!linked.some((u) => canAccessUnit(m, u.id))) notFound();
  const t = await getTranslations("pos.kds");

  // มติ 1: อ่านบอร์ดไม่ได้ที่สาขานี้ ⇒ การ์ดปฏิเสธก่อนอ่านข้อมูลครัว (ไม่ใช่ 404 · ไม่ throw)
  const view = posKdsView(m, linked, unitParam);
  if (!view.ok || !view.active) {
    return (
      <div className={RAIL_PAD}>
        <div role="alert" className="card flex max-w-2xl flex-col gap-1 text-sm" data-testid="pos-kds-refusal">
          <b className="text-[15px]">{t("title")}</b>
          <span className="text-[color:var(--color-muted)]">{t("page.refusal")}</span>
        </div>
      </div>
    );
  }
  const active = view.active;
  const can = (module: string, action: string) => evaluate(m, { module, action, unitId: active.id });
  // ลิงก์ตั้งสถานีครัว (หน้าร้านอาหารเดิม · restaurant.station.create) — ต้องใช้ slug ของสาขา
  const unitRow = await prisma.businessUnit.findFirst({ where: { id: active.id, tenantId }, select: { slug: true } });

  return (
    <KdsScreen
      key={active.id}
      systemId={id}
      unitId={active.id}
      unitSlug={unitRow?.slug ?? null}
      tenantName={auth.active.tenant.name}
      units={view.units.map((u) => ({ id: u.id, name: u.name }))}
      userName={auth.user.name ?? ""}
      initialStationId={stationParam ?? null}
      perms={{
        advance: can("restaurant", "restaurant.kds.advance"),
        recall: can("restaurant", "restaurant.kds.recall"),
        rush: can("restaurant", "restaurant.order.rush"),
        pause: can("restaurant", "restaurant.kitchen.pause"),
        setupStations: can("restaurant", "restaurant.station.create"),
        availability: can("pos", "pos.sale.create") || can("restaurant", "restaurant.kds.advance") || can("pos", "pos.product.manage"),
      }}
    />
  );
}

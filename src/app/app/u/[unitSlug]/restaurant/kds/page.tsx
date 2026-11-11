import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { listStations, ensureDefaultStations } from "@/lib/modules/restaurant/menu";
import { PageHeader } from "@/components/ui/PageHeader";
import { KdsLegacyBanner } from "@/components/pos/kds/KdsLegacyBanner"; // POS P2.6U ▸ มติ 1: แถบ "เปิดจอครัวใหม่" (ลิงก์อย่างเดียว) ◂
import { redirect } from "next/navigation"; // POS P2.14 ▸ LEG-2/4 ◂
import { posLinkedLegacyPage } from "@/lib/modules/pos/legacy-door"; // POS P2.14 ▸ LEG-2/4 มติ 1: สาขาที่ผูก POS = หน้าเดิมปิด → หน้า POS ◂

export default async function KdsIndexPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  // POS P2.14 ▸ LEG-2/4 มติ 1: สาขาที่ผูก POS ⇒ หน้าเดิมปิด — ไปหน้าจอครัวของ POS (from=legacy = แถบแจ้งที่หน้า POS) ·
  //   หน้าขายแบบเดิม (ไม่เปิด registerV2) ยังไม่มีหน้าโต๊ะ/ครัว ⇒ ไปหน้าขาย · ไม่ผูก POS = หน้าเดิมตามเดิม
  const posDoor = await posLinkedLegacyPage(auth.active.tenantId, unit.id);
  if (posDoor) redirect(`/app/sys/${posDoor.systemId}/pos/${posDoor.v2 ? "kds" : "register"}?unit=${encodeURIComponent(unit.id)}&from=legacy`);
  // ◂
  await ensureDefaultStations(auth.active.tenantId, unit.id);
  const stations = await listStations(auth.active.tenantId, unit.id);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <KdsLegacyBanner tenantId={auth.active.tenantId} unitId={unit.id} /> {/* POS P2.6U ▸ มติ 1 ◂ */}
      <PageHeader title="จอครัว (KDS)" back={{ href: `/app/u/${unitSlug}/restaurant`, label: "ร้านอาหาร · หน้างาน" }} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stations.map((s) => (
          <Link key={s.id} href={`/app/u/${unitSlug}/restaurant/kds/${s.id}`} className="card text-center hover:bg-[color:var(--color-surface-2)]">
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-[color:var(--color-muted)]">เปิดจอสถานี</div>
          </Link>
        ))}
        <Link href={`/app/u/${unitSlug}/restaurant/kds/expo`} className="card text-center hover:bg-[color:var(--color-surface-2)]">
          <div className="font-medium">Expo</div>
          <div className="text-xs text-[color:var(--color-muted)]">รายการเสร็จ รอเสิร์ฟ</div>
        </Link>
      </div>
    </div>
  );
}

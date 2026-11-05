import { notFound } from "next/navigation";
import { requireBackoffice } from "@/lib/platform/actions";
import { roomForSupport } from "@/lib/platform/secretary-ops";
import { PageHeader } from "@/components/ui/PageHeader";
import { RoomReadOnlyView } from "../../RoomReadOnlyView";

// ห้องงานเลขา 1 ห้อง แบบอ่านอย่างเดียว (S2.23 G5 "เปิดห้อง" · S2.16 H4 "เปิดห้องเต็ม") — SUPER_ADMIN/SUPPORT
export default async function SecretaryRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireBackoffice(["SUPER_ADMIN", "SUPPORT"]);
  const { id } = await params;
  const data = await roomForSupport(me, id);
  if (!data) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data.room.title}
        back={{ href: "/backoffice/secretary", label: "คิวเลขา" }}
        desc={`${data.room.tenantName} · ห้องงานเลขา (อ่านอย่างเดียว)`}
      />
      <RoomReadOnlyView data={data} />
    </div>
  );
}

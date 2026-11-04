// ห้องงาน (กำลังทำ/รออนุมัติ/เสร็จ) (แบบ A3–A5) — โครงของใบ S2.1 · ใบ S2.4 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretaryRoomScreen() {
  return <SecSkeleton testID="sec-secretary-room" zone="secretary" title="sec.title.room" wo="S2.4" page="A3–A5" />;
}

// สร้างกิจการใหม่ (แบบ G1) — โครงของใบ S2.1 · ใบ S2.21 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function BusinessNewScreen() {
  return <SecSkeleton testID="sec-business-new" zone="secretary" title="sec.title.businessNew" wo="S2.21" page="G1" />;
}

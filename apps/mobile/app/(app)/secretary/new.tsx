// เริ่มงานใหม่ (แบบ A2) — โครงของใบ S2.1 · ใบ S2.3 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretaryNewScreen() {
  return <SecSkeleton testID="sec-secretary-new" zone="secretary" title="sec.title.new" wo="S2.3" page="A2" />;
}

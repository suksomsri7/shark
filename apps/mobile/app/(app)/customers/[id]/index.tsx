// ห้องแชทลูกค้า (แบบ K2) — โครงของใบ S2.1 · ใบ S2.18 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function CustomersDetailScreen() {
  return <SecSkeleton testID="sec-customers-detail" zone="customers" title="sec.title.customer" wo="S2.18" page="K2" />;
}

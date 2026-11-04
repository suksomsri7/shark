// รายการลูกค้า (แบบ K1) — โครงของใบ S2.1 · ใบ S2.17 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function CustomersScreen() {
  return <SecSkeleton testID="sec-customers" zone="customers" title="sec.title.customers" wo="S2.17" page="K1" />;
}

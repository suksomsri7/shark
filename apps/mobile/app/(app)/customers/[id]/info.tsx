// ข้อมูลลูกค้า (แบบ K3) — โครงของใบ S2.1 · ใบ S2.19 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function CustomersInfoScreen() {
  return <SecSkeleton testID="sec-customers-info" zone="customers" title="sec.title.customerInfo" wo="S2.19" page="K3" />;
}

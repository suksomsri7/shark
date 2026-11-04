// คุยกับลูกค้าแทนร้าน + PDPA (แบบ B7) — โครงของใบ S2.1 · ใบ S2.9 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretarySettingsCustomersScreen() {
  return <SecSkeleton testID="sec-secretary-settings-customers" zone="secretary" title="sec.title.settingsCustomers" wo="S2.9" page="B7" />;
}

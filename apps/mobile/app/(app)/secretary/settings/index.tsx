// ตั้งค่า (แบบ B1) — โครงของใบ S2.1 · ใบ S2.7 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretarySettingsScreen() {
  return <SecSkeleton testID="sec-secretary-settings" zone="secretary" title="sec.title.settings" wo="S2.7" page="B1" />;
}

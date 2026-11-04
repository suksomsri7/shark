// สิทธิ์ต่อระบบ (แบบ B3) — โครงของใบ S2.1 · ใบ S2.8 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretarySettingsAccessScreen() {
  return <SecSkeleton testID="sec-secretary-settings-access" zone="secretary" title="sec.title.settingsAccess" wo="S2.8" page="B3" />;
}

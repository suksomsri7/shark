// บันทึกการกระทำ (แบบ B5) — โครงของใบ S2.1 · ใบ S2.8 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretarySettingsLogScreen() {
  return <SecSkeleton testID="sec-secretary-settings-log" zone="secretary" title="sec.title.settingsLog" wo="S2.8" page="B5" />;
}

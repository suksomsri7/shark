// ต้องอนุมัติเสมอ (แบบ B4) — โครงของใบ S2.1 · ใบ S2.8 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretarySettingsRulesScreen() {
  return <SecSkeleton testID="sec-secretary-settings-rules" zone="secretary" title="sec.title.settingsRules" wo="S2.8" page="B4" />;
}

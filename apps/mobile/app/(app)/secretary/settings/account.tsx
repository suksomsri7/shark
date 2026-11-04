// บัญชีของฉัน (แบบ G4) — โครงของใบ S2.1 · ใบ S2.22 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretarySettingsAccountScreen() {
  return <SecSkeleton testID="sec-secretary-settings-account" zone="secretary" title="sec.title.settingsAccount" wo="S2.22" page="G4" />;
}

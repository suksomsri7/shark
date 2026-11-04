// เลขาของฉัน (แบบ B2) — โครงของใบ S2.1 · ใบ S2.7 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretarySettingsSecretaryScreen() {
  return <SecSkeleton testID="sec-secretary-settings-secretary" zone="secretary" title="sec.title.settingsSecretary" wo="S2.7" page="B2" />;
}

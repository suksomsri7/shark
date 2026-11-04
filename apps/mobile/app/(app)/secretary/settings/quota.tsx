// โควตางาน (แบบ B8) — โครงของใบ S2.1 · ใบ S2.7 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretarySettingsQuotaScreen() {
  return <SecSkeleton testID="sec-secretary-settings-quota" zone="secretary" title="sec.title.settingsQuota" wo="S2.7" page="B8" />;
}

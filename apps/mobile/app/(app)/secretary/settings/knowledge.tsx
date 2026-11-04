// ความรู้ของกิจการ (แบบ B6) — โครงของใบ S2.1 · ใบ S2.9 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretarySettingsKnowledgeScreen() {
  return <SecSkeleton testID="sec-secretary-settings-knowledge" zone="secretary" title="sec.title.settingsKnowledge" wo="S2.9" page="B6" />;
}

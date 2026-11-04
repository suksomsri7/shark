// ช่วยเหลือ (แบบ H1) — โครงของใบ S2.1 · ใบ S2.15 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretaryHelpScreen() {
  return <SecSkeleton testID="sec-secretary-help" zone="secretary" title="sec.title.help" wo="S2.15" page="H1" />;
}

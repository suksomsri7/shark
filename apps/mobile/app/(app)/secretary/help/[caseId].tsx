// ห้องแจ้งปัญหา (แบบ H2) — โครงของใบ S2.1 · ใบ S2.15 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretaryHelpCaseScreen() {
  return <SecSkeleton testID="sec-secretary-help-case" zone="secretary" title="sec.title.helpCase" wo="S2.15" page="H2" />;
}
